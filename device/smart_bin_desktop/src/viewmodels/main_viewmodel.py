import json
from datetime import datetime, timezone
from pathlib import Path

from PyQt6.QtCore import QObject, pyqtSignal, QTimer
from src.models.trash_model import TrashData
from src.repository.device_repository import DeviceClient
from src.repository.thingsboard_repository import ThingsboardClient

class MainViewModel(QObject):
    # Các tín hiệu (StateFlow) để View lắng nghe
    state_welcome = pyqtSignal()
    state_feedback = pyqtSignal(TrashData)
    state_thanks = pyqtSignal()

    def __init__(self, worker):
        super().__init__()
        self.worker = worker
        self.device_client = DeviceClient()
        self.thingsboard_client = ThingsboardClient()
        self.access_token = None
        self.telemetry_interval_ms = 5 * 60 * 1000
        self.current_detection_metadata_path = None
        self.metadata_dir = Path(__file__).resolve().parent.parent.parent / "assets" / "detections" / "metadata"
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        
        # Kết nối Worker với ViewModel
        self.worker.trash_detected.connect(self._on_trash_detected)

        # Quản lý thời gian ở ViewModel
        self.feedback_timer = QTimer()
        self.feedback_timer.setSingleShot(True)
        self.feedback_timer.timeout.connect(self.reset_to_welcome)

        self.thanks_timer = QTimer()
        self.thanks_timer.setSingleShot(True)
        self.thanks_timer.timeout.connect(self.reset_to_welcome)

        self.telemetry_timer = QTimer()
        self.telemetry_timer.setSingleShot(False)
        self.telemetry_timer.setInterval(self.telemetry_interval_ms)
        self.telemetry_timer.timeout.connect(self._send_periodic_telemetry)

    def start_system(self):
        """Khởi động toàn bộ hệ thống"""
        self.worker.start() # Bật luồng Camera + AI chạy ngầm
        self.reset_to_welcome()
        self._initialize_telemetry_loop()

    def _on_trash_detected(self, trash_data: TrashData):
        """Khi AI nhận diện có rác"""
        self.current_detection_metadata_path = self._save_detection_metadata(trash_data, "khong_danh_gia")
        self.worker.pause_detection() # Tạm dừng AI trong lúc hỏi người dùng
        self.state_feedback.emit(trash_data) # Báo cho View hiện màn Feedback
        self.feedback_timer.start(10000) # Đợi 10s

    def handle_feedback(self, is_correct: bool):
        """Khi người dùng bấm nút Đúng/Sai từ View"""
        self.feedback_timer.stop()
        self._update_current_feedback("dung" if is_correct else "sai")
        
        # TODO: Sau này gọi API lưu database ở đây
        print(f"Ghi nhận phản hồi: {'Đúng' if is_correct else 'Sai'}")
        
        self.state_thanks.emit() # Báo cho View hiện màn Thanks
        self.thanks_timer.start(5000) # Đợi 5s

    def reset_to_welcome(self):
        """Đưa hệ thống về trạng thái sẵn sàng"""
        self.feedback_timer.stop()
        self.thanks_timer.stop()
        self.worker.resume_detection() # Bật lại AI
        self.state_welcome.emit() # Báo View về màn Welcome


    def get_access_token(self):
        return self.device_client.get_access_token()
    
    def activate_device(self):
        return self.device_client.activate_device()
    
    def send_telemetry(self):
        if not self.access_token:
            return False, "Không có access token"

        return self.thingsboard_client.send_telemetry(self.access_token)

    def _initialize_telemetry_loop(self):
        success, result = self.get_access_token()
        if not success:
            print(f"Khong lay duoc access token, bo qua telemetry: {result}")
            self.telemetry_timer.stop()
            self.access_token = None
            return

        token = result.data.access_token if result and result.data else None
        if not token:
            print("Khong co access token trong response, bo qua telemetry")
            self.telemetry_timer.stop()
            self.access_token = None
            return

        self.access_token = token
        self.telemetry_timer.start()
        print("Da lay access token. Bat dau gui telemetry moi 5 phut")

    def _send_periodic_telemetry(self):
        success, message = self.send_telemetry()
        if not success:
            print(f"Gui telemetry that bai, dung vong lap telemetry: {message}")
            self.telemetry_timer.stop()
            return

        print("Gui telemetry thanh cong")

    def shutdown(self):
        self.telemetry_timer.stop()
        self.worker.stop()

    def _save_detection_metadata(self, trash_data: TrashData, feedback: str) -> Path:
        detected_at = datetime.now(timezone.utc).isoformat()
        metadata = {
            "detectionId": trash_data.detection_id,
            "detectedAt": detected_at,
            "image": trash_data.image_path,
            "category": trash_data.category,
            "confidence": round(float(trash_data.confidence), 6),
            "label": trash_data.label,
            "userFeedback": feedback,
        }

        metadata_name = trash_data.detection_id or f"detection_{int(datetime.now().timestamp() * 1000)}"
        metadata_path = self.metadata_dir / f"{metadata_name}.json"

        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=True, indent=2)

        return metadata_path

    def _update_current_feedback(self, feedback: str):
        if not self.current_detection_metadata_path:
            return

        metadata_path = Path(self.current_detection_metadata_path)
        if not metadata_path.exists():
            return

        try:
            with open(metadata_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)

            metadata["userFeedback"] = feedback
            metadata["feedbackAt"] = datetime.now(timezone.utc).isoformat()

            with open(metadata_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=True, indent=2)
        except (OSError, json.JSONDecodeError) as e:
            print(f"Khong cap nhat duoc feedback metadata: {e}")