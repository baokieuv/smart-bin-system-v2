import time
import uuid
import logging
from dataclasses import dataclass, field
from typing import Final

import cv2
from PyQt6.QtCore import QThread, pyqtSignal

from src.models.trash_model import TrashData
from src.services.inference_protocols import InferenceModel, InferenceModelFactory, YoloModelFactory
from src.utils.config import APP_CONFIG


# Mapping model class → (material_code, display_name, bg_color).
# This table is intentionally kept here (not in config) because it mirrors the
# model's class vocabulary and changes only when the model is retrained.
CLASS_META: Final[dict[str, tuple[str, str, str]]] = {
    "battery":   ("BATTERY",    "Used battery",  "#ef4444"),
    "biological":("BIOLOGICAL", "Organic waste",  "#22c55e"),
    "cardboard": ("CARDBOARD",  "Cardboard",      "#a16207"),
    "clothes":   ("CLOTHES",    "Used clothes",   "#0ea5e9"),
    "glass":     ("GLASS",      "Glass",          "#14b8a6"),
    "metal":     ("METAL",      "Metal",          "#64748b"),
    "paper":     ("PAPER",      "Paper",          "#38bdf8"),
    "plastic":   ("PLASTIC",    "Plastic",        "#eab308"),
    "shoes":     ("SHOES",      "Shoes",          "#f97316"),
    "trash":     ("TRASH",      "Mixed trash",    "#6b7280"),
}


@dataclass
class _DetectionState:
    """Encapsulates the mutable state machine for the detection pipeline.

    Separating state into a plain dataclass makes it easy to reset atomically
    and reason about without hunting through the thread class.
    """
    trash_falling: bool = False
    stable_since: float | None = None
    last_result_at: float = 0.0
    time_idle: float = field(default_factory=time.time)

    def reset(self, now: float | None = None) -> None:
        ts = now if now is not None else time.time()
        self.trash_falling = False
        self.stable_since = None
        self.last_result_at = ts
        self.time_idle = ts

    def mark_motion(self, now: float) -> None:
        self.time_idle = now
        self.trash_falling = True
        self.stable_since = None

    def start_stability_window(self, now: float) -> None:
        if self.stable_since is None:
            self.stable_since = now

    def should_classify(self, now: float) -> bool:
        return (
            self.trash_falling
            and self.stable_since is not None
            and (now - self.stable_since) > APP_CONFIG.detection.stable_seconds
        )

    def in_cooldown(self, now: float) -> bool:
        return (now - self.last_result_at) < APP_CONFIG.detection.min_result_interval_seconds


class DetectionWorker(QThread):
    """Background detection pipeline running on a dedicated QThread.

    Responsibilities
    ----------------
    1. Pull frames from the camera.
    2. Gate on hand presence (YOLO detect) and motion (MOG2).
    3. Classify trash when the scene is stable.
    4. Emit ``trash_detected`` with the result for the ViewModel/UI.
    """

    trash_detected = pyqtSignal(TrashData)
    worker_ready = pyqtSignal(bool, str)

    def __init__(
        self,
        hand_model: InferenceModel | None = None,
        trash_model: InferenceModel | None = None,
        model_factory: InferenceModelFactory | None = None,
    ) -> None:
        super().__init__()
        self.logger = logging.getLogger("smart_bin.detection_worker")
        self._is_running = True
        self._is_paused = False

        self.model_hand_detection = hand_model
        self.model_trash_classification = trash_model
        self.model_factory = model_factory or YoloModelFactory()

        self.images_dir = APP_CONFIG.paths.detection_images_dir
        self.images_dir.mkdir(parents=True, exist_ok=True)

        self.cap: cv2.VideoCapture | None = None
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=50, varThreshold=100, detectShadows=False
        )

        self._state = _DetectionState()
        self._last_state_log_at = 0.0

    # ------------------------------------------------------------------
    # QThread entry point
    # ------------------------------------------------------------------

    def run(self) -> None:
        self.logger.info("Detection worker thread started")
        ok, message = self._initialize_runtime()
        self.worker_ready.emit(ok, message)
        if not ok:
            self.logger.error("Worker initialization failed: %s", message)
            return

        self._run_loop()

    def _run_loop(self) -> None:
        cfg = APP_CONFIG.detection
        while self._is_running:
            if self._is_paused:
                time.sleep(cfg.pause_sleep_seconds)
                continue

            ret, frame = self.cap.read()
            if not ret:
                self.logger.warning("Failed to read frame from camera")
                continue

            # --- Gate 1: hand detection ---
            try:
                results = self.model_hand_detection(
                    frame, imgsz=cfg.hand_img_size, conf=cfg.hand_confidence, verbose=False
                )
                hand_detected = any(len(r.boxes) > 0 for r in results)
            except Exception:
                self.logger.exception("Hand detection failed")
                time.sleep(cfg.exception_sleep_seconds)
                continue

            # --- Gate 2: motion detection ---
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            fg_mask = self.bg_subtractor.apply(gray)
            _, thresh = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)
            motion_pixels = cv2.countNonZero(thresh)
            have_motion = motion_pixels > cfg.motion_threshold

            now = time.time()
            self._log_pipeline_state(now, hand_detected, have_motion, motion_pixels)

            if hand_detected or have_motion:
                self._state.mark_motion(now)
                continue

            if self._state.trash_falling:
                self._state.start_stability_window(now)

            if not self._state.should_classify(now):
                continue

            # --- Gate 3: cooldown ---
            if self._state.in_cooldown(now):
                time.sleep(cfg.pause_sleep_seconds)
                continue

            # --- Classify ---
            self._run_classification(frame, now)

    # ------------------------------------------------------------------
    # Classification
    # ------------------------------------------------------------------

    def _run_classification(self, frame, now: float) -> None:
        cfg = APP_CONFIG.detection
        try:
            cls_results = self.model_trash_classification(frame, verbose=False)
            top_id = cls_results[0].probs.top1
            top_name = cls_results[0].names[top_id]
            top_conf = float(cls_results[0].probs.top1conf)
        except Exception:
            self.logger.exception("Trash classification failed")
            self._state.reset(now)
            return

        if top_conf < cfg.min_classification_confidence:
            self.logger.info("Low-confidence result ignored: label=%s conf=%.3f", top_name, top_conf)
            self._state.reset(now)
            return

        detection_id = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
        image_path = self._save_detection_image(frame, detection_id)

        category, material, item_type, bg_color = self._map_class_to_ui(top_name)
        trash_data = TrashData(
            material=material,
            item_type=item_type,
            bg_color=bg_color,
            category=category,
            confidence=top_conf,
            label=top_name,
            image_path=image_path,
            detection_id=detection_id,
        )

        self.logger.info(
            "Detected category=%s label=%s conf=%.3f detection_id=%s",
            category, top_name, top_conf, detection_id,
        )

        self.trash_detected.emit(trash_data)
        self._state.reset(now)

    # ------------------------------------------------------------------
    # Public control API
    # ------------------------------------------------------------------

    def pause_detection(self) -> None:
        """Pause the pipeline while the UI collects user feedback."""
        self._is_paused = True
        self.logger.info("Detection paused")

    def resume_detection(self) -> None:
        """Resume the pipeline after feedback or device-link screens close."""
        self._is_paused = False
        self.logger.info("Detection resumed")

    def stop(self) -> None:
        """Gracefully stop the thread and release the camera."""
        self._is_running = False
        self.wait()
        if self.cap is not None:
            self.cap.release()
        self.logger.info("Detection worker stopped and camera released")

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------

    def _initialize_runtime(self) -> tuple[bool, str]:
        try:
            hand_path = APP_CONFIG.paths.hand_model_path
            trash_path = APP_CONFIG.paths.trash_model_path

            if self.model_hand_detection is None:
                self.model_hand_detection = self.model_factory.create_hand_detector(hand_path)
            if self.model_trash_classification is None:
                self.model_trash_classification = self.model_factory.create_trash_classifier(trash_path)

            self.logger.info("Models loaded hand=%s trash=%s", hand_path.name, trash_path.name)

            cam_cfg = APP_CONFIG.camera
            self.cap = cv2.VideoCapture(cam_cfg.index)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, cam_cfg.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, cam_cfg.height)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, cam_cfg.buffer_size)
            self.logger.info(
                "Camera opened index=%s resolution=%sx%s",
                cam_cfg.index, cam_cfg.width, cam_cfg.height,
            )
            return True, ""
        except Exception as exc:
            self.logger.exception("Failed to initialize detection runtime")
            return False, str(exc)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _log_pipeline_state(self, now: float, hand: bool, motion: bool, pixels: int) -> None:
        if now - self._last_state_log_at < 2.0:
            return
        self.logger.debug(
            "state hand=%s motion=%s pixels=%d falling=%s paused=%s",
            hand, motion, pixels, self._state.trash_falling, self._is_paused,
        )
        self._last_state_log_at = now

    @staticmethod
    def _map_class_to_ui(class_name: str) -> tuple[str, str, str, str]:
        """Return (category_key, material_code, item_type_display, bg_color)."""
        normalized = class_name.strip().lower().split()[-1]
        material, item_type, bg_color = CLASS_META.get(
            normalized,
            (normalized.upper(), normalized.capitalize(), "#64748b"),
        )
        return normalized, material, item_type, bg_color

    def _save_detection_image(self, frame, detection_id: str) -> str | None:
        image_file = self.images_dir / f"{detection_id}.jpg"
        if not cv2.imwrite(str(image_file), frame):
            self.logger.warning("Failed to save detection image id=%s", detection_id)
            return None
        self.logger.info("Detection image saved: %s", image_file.name)
        return str(image_file)