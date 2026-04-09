import cv2
import time
import uuid
from pathlib import Path
from PyQt6.QtCore import QThread, pyqtSignal

from ultralytics import YOLO
from src.models.trash_model import TrashData

class DetectionWorker(QThread):
    # Tín hiệu phát ra khi nhận diện xong, mang theo object TrashData
    trash_detected = pyqtSignal(TrashData)

    def __init__(self):
        super().__init__()
        self._is_running = True
        self._is_paused = False
        
        # Khởi tạo model và camera
        model_dir = Path(__file__).resolve().parent.parent.parent.parent / 'models'
        hand_model_path = model_dir / 'hand_detection.tflite'
        trash_model_path = model_dir / 'trash_classification.tflite'

        self.model_hand_detection = YOLO(str(hand_model_path), task='detect')
        self.model_trash_classification = YOLO(str(trash_model_path), task='classify')

        self.detections_dir = Path(__file__).resolve().parent.parent.parent / 'assets' / 'detections'
        self.images_dir = self.detections_dir / 'images'
        self.images_dir.mkdir(parents=True, exist_ok=True)
        
        self.cap = cv2.VideoCapture(0)
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=50, varThreshold=100, detectShadows=False)

        self.time_idle = time.time()
        self.trash_falling = False
        self.idle_threshold = 3.0
        self.last_result_at = 0.0

    def run(self):
        """Hàm này chạy liên tục ở luồng ngầm, không làm đơ giao diện"""
        while self._is_running:
            if self._is_paused:
                time.sleep(0.1) # Ngủ đông nếu đang ở màn hình Feedback/Thanks
                continue

            ret, frame = self.cap.read()
            if not ret:
                continue

            results = self.model_hand_detection(frame, imgsz=320, conf=0.5, verbose=False)
            hand = any(len(r.boxes) > 0 for r in results)

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            fg_mask = self.bg_subtractor.apply(gray)
            _, thresh = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)
            
            difference_pixel = cv2.countNonZero(thresh)
            have_moving = difference_pixel > 1000
            now = time.time()

            if hand or have_moving:
                self.time_idle = now
                self.trash_falling = True
                continue

            if self.trash_falling and (now - self.time_idle > 1.0):
                if now - self.last_result_at < 1.0:
                    continue

                cls_results = self.model_trash_classification(frame, verbose=False)
                top_class_id = cls_results[0].probs.top1
                top_class_name = cls_results[0].names[top_class_id]
                top_confidence = float(cls_results[0].probs.top1conf)
                detection_id = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
                image_path = self._save_detection_image(frame, detection_id)

                # Ánh xạ và tạo Data Object
                material, item_type, bg_color = self._map_class_to_ui(top_class_name)
                trash_data = TrashData(
                    material=material,
                    item_type=item_type,
                    bg_color=bg_color,
                    category=material,
                    confidence=top_confidence,
                    label=top_class_name,
                    image_path=image_path,
                    detection_id=detection_id,
                )
                
                # Bắn tín hiệu ra ngoài
                self.trash_detected.emit(trash_data)

                self.trash_falling = False
                self.time_idle = now
                self.last_result_at = now
                continue

    def pause_detection(self):
        self._is_paused = True

    def resume_detection(self):
        self._is_paused = False

    def stop(self):
        self._is_running = False
        self.wait()
        if hasattr(self, 'cap') and self.cap is not None:
            self.cap.release()

    def _map_class_to_ui(self, class_name):
        label = class_name.upper()
        if 'PLASTIC' in label: return 'PLASTIC', f'{label}\nRecyclable', '#eab308'
        if 'PAPER' in label or 'CARDBOARD' in label: return 'PAPER', f'{label}\nRecyclable', '#38bdf8'
        if 'GLASS' in label: return 'GLASS', f'{label}\nRecyclable', '#4ade80'
        return 'OTHER', f'{label}\nNon-recyclable', '#64748b'

    def _save_detection_image(self, frame, detection_id: str) -> str | None:
        image_file = self.images_dir / f"{detection_id}.jpg"
        saved = cv2.imwrite(str(image_file), frame)
        if not saved:
            return None
        return str(image_file)