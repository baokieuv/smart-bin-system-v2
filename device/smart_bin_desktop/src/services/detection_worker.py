import cv2
import time
import uuid
import logging
from typing import Final
from PyQt6.QtCore import QThread, pyqtSignal

from src.models.trash_model import TrashData
from src.services.inference_protocols import InferenceModel, InferenceModelFactory, YoloModelFactory
from src.utils.config import APP_CONFIG


# Mapping model class -> (material code, display name, background color).
CLASS_META: Final[dict[str, tuple[str, str, str]]] = {
    "battery": ("BATTERY", "Used battery", "#ef4444"),
    "biological": ("BIOLOGICAL", "Organic waste", "#22c55e"),
    "cardboard": ("CARDBOARD", "Cardboard", "#a16207"),
    "clothes": ("CLOTHES", "Used clothes", "#0ea5e9"),
    "glass": ("GLASS", "Glass", "#14b8a6"),
    "metal": ("METAL", "Metal", "#64748b"),
    "paper": ("PAPER", "Paper", "#38bdf8"),
    "plastic": ("PLASTIC", "Plastic", "#eab308"),
    "shoes": ("SHOES", "Shoes", "#f97316"),
    "trash": ("TRASH", "Mixed trash", "#6b7280"),
}

class DetectionWorker(QThread):
    """Background detection pipeline running on a dedicated QThread.

    Responsibilities of this class are intentionally limited to:
    1) Pull frame from camera.
    2) Run hand + motion gates.
    3) Trigger trash classification when frame is stable.
    4) Emit final `TrashData` for ViewModel/UI flow.
    """

    # Emit when a valid classification is ready so ViewModel can open feedback screen.
    trash_detected = pyqtSignal(TrashData)
    worker_ready = pyqtSignal(bool, str)

    def __init__(
        self,
        hand_model: InferenceModel | None = None,
        trash_model: InferenceModel | None = None,
        model_factory: InferenceModelFactory | None = None,
    ):
        super().__init__()
        self.logger = logging.getLogger("smart_bin.detection_worker")
        self._is_running = True
        self._is_paused = False
        self.model_hand_detection = hand_model
        self.model_trash_classification = trash_model
        self.model_factory = model_factory or YoloModelFactory()
        self.detections_dir = APP_CONFIG.paths.detections_dir
        self.images_dir = APP_CONFIG.paths.detection_images_dir
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self.cap = None
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=50, varThreshold=100, detectShadows=False)

        self.time_idle = time.time()
        # State machine flags for motion -> stable -> classify pipeline.
        self.trash_falling = False
        self.stable_since = None
        self.idle_threshold = APP_CONFIG.detection.stable_seconds
        self.last_result_at = 0.0
        self._last_state_log_at = 0.0

    def run(self):
        """Main loop of detector thread.

        Rule of thumb:
        - If hand/motion exists: keep waiting.
        - If object is stable long enough: classify once.
        """
        self.logger.info("Detection worker thread started")
        ok, message = self._initialize_runtime()
        self.worker_ready.emit(ok, message)
        if not ok:
            self.logger.error("Worker initialization failed: %s", message)
            return

        while self._is_running:
            if self._is_paused:
                time.sleep(APP_CONFIG.detection.pause_sleep_seconds)
                continue

            ret, frame = self.cap.read()
            if not ret:
                self.logger.warning("Failed to read frame from camera")
                continue

            try:
                results = self.model_hand_detection(
                    frame,
                    imgsz=APP_CONFIG.detection.hand_img_size,
                    conf=APP_CONFIG.detection.hand_confidence,
                    verbose=False,
                )
                hand = any(len(r.boxes) > 0 for r in results)
            except Exception as e:
                self.logger.exception("Hand detection failed: %s", e)
                time.sleep(APP_CONFIG.detection.exception_sleep_seconds)
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            fg_mask = self.bg_subtractor.apply(gray)
            _, thresh = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)
            
            difference_pixel = cv2.countNonZero(thresh)
            have_moving = difference_pixel > APP_CONFIG.detection.motion_threshold
            now = time.time()

            self._log_pipeline_state(
                now=now,
                hand=hand,
                have_moving=have_moving,
                difference_pixel=difference_pixel,
            )

            if hand or have_moving:
                # Keep waiting while hand/motion is still present.
                self.time_idle = now
                self.trash_falling = True
                self.stable_since = None
                continue

            if self.trash_falling:
                if self.stable_since is None:
                    self.stable_since = now

            if self._should_classify(now):
                if now - self.last_result_at < APP_CONFIG.detection.min_result_interval_seconds:
                    continue

                try:
                    cls_results = self.model_trash_classification(frame, verbose=False)
                    top_class_id = cls_results[0].probs.top1
                    top_class_name = cls_results[0].names[top_class_id]
                    top_confidence = float(cls_results[0].probs.top1conf)
                except Exception as e:
                    self.logger.exception("Trash classification failed: %s", e)
                    self._reset_falling_state(now=now)
                    continue

                if top_confidence < APP_CONFIG.detection.min_classification_confidence:
                    # Ignore low-confidence results to reduce false positives.
                    self.logger.info(
                        "Ignored low-confidence result: label=%s conf=%.3f",
                        top_class_name,
                        top_confidence,
                    )
                    self._reset_falling_state(now=now)
                    continue

                detection_id = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
                image_path = self._save_detection_image(frame, detection_id)

                # Convert model class name into UI/domain metadata.
                category, material, item_type, bg_color = self._map_class_to_ui(top_class_name)
                trash_data = TrashData(
                    material=material,
                    item_type=item_type,
                    bg_color=bg_color,
                    category=category,
                    confidence=top_confidence,
                    label=top_class_name,
                    image_path=image_path,
                    detection_id=detection_id,
                )

                self.logger.info(
                    "Detected category=%s label=%s conf=%.3f detection_id=%s",
                    category,
                    top_class_name,
                    top_confidence,
                    detection_id,
                )
                
                # Emit result to ViewModel/UI layer.
                self.trash_detected.emit(trash_data)

                self._reset_falling_state(now=now)
                continue

    def pause_detection(self):
        """Pause detection loop while UI is collecting user feedback."""
        self._is_paused = True
        self.logger.info("Detection paused")

    def resume_detection(self):
        """Resume detection loop after feedback/device-link screens close."""
        self._is_paused = False
        self.logger.info("Detection resumed")

    def stop(self):
        """Gracefully stop thread and release camera resource."""
        self._is_running = False
        self.wait()
        if hasattr(self, 'cap') and self.cap is not None:
            self.cap.release()
        self.logger.info("Detection worker stopped and camera released")

    def _initialize_runtime(self) -> tuple[bool, str]:
        """Load models and initialize camera before entering the loop."""
        try:
            hand_model_path = APP_CONFIG.paths.hand_model_path
            trash_model_path = APP_CONFIG.paths.trash_model_path

            if self.model_hand_detection is None:
                self.model_hand_detection = self.model_factory.create_hand_detector(hand_model_path)
            if self.model_trash_classification is None:
                self.model_trash_classification = self.model_factory.create_trash_classifier(trash_model_path)
            self.logger.info("Models loaded hand=%s | trash=%s", hand_model_path.name, trash_model_path.name)

            self.cap = cv2.VideoCapture(APP_CONFIG.camera.index)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, APP_CONFIG.camera.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, APP_CONFIG.camera.height)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, APP_CONFIG.camera.buffer_size)
            self.logger.info(
                "Camera opened index=%s, resolution=%sx%s",
                APP_CONFIG.camera.index,
                APP_CONFIG.camera.width,
                APP_CONFIG.camera.height,
            )
            return True, ""
        except Exception as e:
            self.logger.exception("Failed to initialize detection runtime: %s", e)
            return False, str(e)

    def _log_pipeline_state(self, now: float, hand: bool, have_moving: bool, difference_pixel: int) -> None:
        """Periodic diagnostic log so operators can inspect detection gate states."""
        if now - self._last_state_log_at < 2.0:
            return

        self.logger.debug(
            "state hand=%s moving=%s diff=%s falling=%s paused=%s",
            hand,
            have_moving,
            difference_pixel,
            self.trash_falling,
            self._is_paused,
        )
        self._last_state_log_at = now

    def _should_classify(self, now: float) -> bool:
        """Return True when item has stopped moving long enough for stable inference."""
        return (
            self.trash_falling
            and self.stable_since is not None
            and (now - self.stable_since > APP_CONFIG.detection.stable_seconds)
        )

    def _reset_falling_state(self, now: float | None = None) -> None:
        """Reset state-machine flags after one inference decision is completed."""
        ts = now if now is not None else time.time()
        self.trash_falling = False
        self.stable_since = None
        self.time_idle = ts
        self.last_result_at = ts

    def _map_class_to_ui(self, class_name: str) -> tuple[str, str, str, str]:
        """Normalize model output into UI-friendly metadata tuple.

        Returns:
            (category_key, material_code, item_type_display, bg_color)
        """
        # Normalize model output to app category key and UI properties.
        normalized = class_name.strip().lower().split()[-1]

        material, item_type, bg_color = CLASS_META.get(
            normalized,
            (normalized.upper(), normalized.capitalize(), '#64748b')
        )

        return normalized, material, item_type, bg_color

    def _save_detection_image(self, frame, detection_id: str) -> str | None:
        """Persist captured frame for later upload; return path when successful."""
        image_file = self.images_dir / f"{detection_id}.jpg"
        saved = cv2.imwrite(str(image_file), frame)
        if not saved:
            self.logger.warning("Failed to save detection image detection_id=%s", detection_id)
            return None
        self.logger.info("Detection image saved: %s", image_file.name)
        return str(image_file)