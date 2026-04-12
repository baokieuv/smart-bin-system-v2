import cv2
import time
import uuid
import logging
from PyQt6.QtCore import QThread, pyqtSignal

from ultralytics import YOLO
from src.models.trash_model import TrashData
from src.utils.config import APP_CONFIG

class DetectionWorker(QThread):
    # Emit khi có kết quả classify hợp lệ để ViewModel chuyển qua màn feedback.
    trash_detected = pyqtSignal(TrashData)
    worker_ready = pyqtSignal(bool, str)

    def __init__(self):
        super().__init__()
        self.logger = logging.getLogger("smart_bin.detection_worker")
        self._is_running = True
        self._is_paused = False
        self.model_hand_detection = None
        self.model_trash_classification = None
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
        """Hàm này chạy liên tục ở luồng ngầm, không làm đơ giao diện."""
        self.logger.info("DetectionWorker thread da bat dau")
        ok, message = self._initialize_runtime()
        self.worker_ready.emit(ok, message)
        if not ok:
            self.logger.error("Khoi tao worker that bai: %s", message)
            return

        while self._is_running:
            if self._is_paused:
                time.sleep(APP_CONFIG.detection.pause_sleep_seconds)
                continue

            ret, frame = self.cap.read()
            if not ret:
                self.logger.warning("Camera doc frame that bai")
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
                self.logger.exception("Loi hand detection: %s", e)
                time.sleep(APP_CONFIG.detection.exception_sleep_seconds)
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            fg_mask = self.bg_subtractor.apply(gray)
            _, thresh = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)
            
            difference_pixel = cv2.countNonZero(thresh)
            have_moving = difference_pixel > APP_CONFIG.detection.motion_threshold
            now = time.time()

            # Log state theo nhịp để bạn dễ xem hệ thống đang nhận tay/chuyển động ra sao.
            if now - self._last_state_log_at >= 2.0:
                self.logger.info(
                    "state hand=%s moving=%s diff=%s falling=%s paused=%s",
                    hand,
                    have_moving,
                    difference_pixel,
                    self.trash_falling,
                    self._is_paused,
                )
                self._last_state_log_at = now

            if hand or have_moving:
                # Khi còn chuyển động/tay trong khung, chưa classify ngay.
                self.time_idle = now
                self.trash_falling = True
                self.stable_since = None
                continue

            if self.trash_falling:
                if self.stable_since is None:
                    self.stable_since = now

            if self.trash_falling and self.stable_since and (now - self.stable_since > APP_CONFIG.detection.stable_seconds):
                if now - self.last_result_at < APP_CONFIG.detection.min_result_interval_seconds:
                    continue

                try:
                    cls_results = self.model_trash_classification(frame, verbose=False)
                    top_class_id = cls_results[0].probs.top1
                    top_class_name = cls_results[0].names[top_class_id]
                    top_confidence = float(cls_results[0].probs.top1conf)
                except Exception as e:
                    self.logger.exception("Loi trash classification: %s", e)
                    self.trash_falling = False
                    self.stable_since = None
                    self.last_result_at = now
                    continue

                if top_confidence < APP_CONFIG.detection.min_classification_confidence:
                    # Ignore low-confidence results to reduce false positives.
                    self.logger.info(
                        "Bo qua ket qua confidence thap: label=%s conf=%.3f",
                        top_class_name,
                        top_confidence,
                    )
                    self.trash_falling = False
                    self.stable_since = None
                    self.time_idle = now
                    self.last_result_at = now
                    continue

                detection_id = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
                image_path = self._save_detection_image(frame, detection_id)

                # Ánh xạ và tạo Data Object
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
                
                # Bắn tín hiệu ra ngoài
                self.trash_detected.emit(trash_data)

                self.trash_falling = False
                self.stable_since = None
                self.time_idle = now
                self.last_result_at = now
                continue

    def pause_detection(self):
        self._is_paused = True
        self.logger.info("Tam dung detection")

    def resume_detection(self):
        self._is_paused = False
        self.logger.info("Tiep tuc detection")

    def stop(self):
        self._is_running = False
        self.wait()
        if hasattr(self, 'cap') and self.cap is not None:
            self.cap.release()
        self.logger.info("DetectionWorker da dung va da release camera")

    def _initialize_runtime(self) -> tuple[bool, str]:
        try:
            hand_model_path = APP_CONFIG.paths.hand_model_path
            trash_model_path = APP_CONFIG.paths.trash_model_path

            self.model_hand_detection = YOLO(str(hand_model_path), task='detect')
            self.model_trash_classification = YOLO(str(trash_model_path), task='classify')
            self.logger.info("Da tai model hand=%s | trash=%s", hand_model_path.name, trash_model_path.name)

            self.cap = cv2.VideoCapture(APP_CONFIG.camera.index)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, APP_CONFIG.camera.width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, APP_CONFIG.camera.height)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, APP_CONFIG.camera.buffer_size)
            self.logger.info(
                "Da mo camera index=%s, resolution=%sx%s",
                APP_CONFIG.camera.index,
                APP_CONFIG.camera.width,
                APP_CONFIG.camera.height,
            )
            return True, ""
        except Exception as e:
            self.logger.exception("Loi khoi tao runtime detection: %s", e)
            return False, str(e)

    def _map_class_to_ui(self, class_name):
        # Normalize model output to app category key and UI properties.
        normalized = class_name.strip().lower().split()[-1]

        class_meta = {
            'battery': ('BATTERY', 'Pin da qua su dung', '#ef4444'),
            'biological': ('BIOLOGICAL', 'Rac huu co', '#22c55e'),
            'cardboard': ('CARDBOARD', 'Bia carton', '#a16207'),
            'clothes': ('CLOTHES', 'Quan ao cu', '#0ea5e9'),
            'glass': ('GLASS', 'Thuy tinh', '#14b8a6'),
            'metal': ('METAL', 'Kim loai', '#64748b'),
            'paper': ('PAPER', 'Giay', '#38bdf8'),
            'plastic': ('PLASTIC', 'Nhua', '#eab308'),
            'shoes': ('SHOES', 'Giay dep', '#f97316'),
            'trash': ('TRASH', 'Rac tong hop', '#6b7280'),
        }

        material, item_type, bg_color = class_meta.get(
            normalized,
            (normalized.upper(), normalized.capitalize(), '#64748b')
        )

        return normalized, material, item_type, bg_color

    def _save_detection_image(self, frame, detection_id: str) -> str | None:
        image_file = self.images_dir / f"{detection_id}.jpg"
        saved = cv2.imwrite(str(image_file), frame)
        if not saved:
            self.logger.warning("Khong luu duoc anh detection_id=%s", detection_id)
            return None
        self.logger.info("Da luu anh detection: %s", image_file.name)
        return str(image_file)