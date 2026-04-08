from PyQt6.QtCore import QObject, pyqtSignal, QTimer
from src.models.trash_model import TrashData
import requests, uuid, base64
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_private_key

class MainViewModel(QObject):
    # Các tín hiệu (StateFlow) để View lắng nghe
    state_welcome = pyqtSignal()
    state_feedback = pyqtSignal(TrashData)
    state_thanks = pyqtSignal()

    def __init__(self, worker):
        super().__init__()
        self.worker = worker
        self.base_url = "https://api.kvbhust.id.vn/api/v1"
        self.timeout = 5
        
        # Kết nối Worker với ViewModel
        self.worker.trash_detected.connect(self._on_trash_detected)

        # Quản lý thời gian ở ViewModel
        self.feedback_timer = QTimer()
        self.feedback_timer.setSingleShot(True)
        self.feedback_timer.timeout.connect(self.reset_to_welcome)

        self.thanks_timer = QTimer()
        self.thanks_timer.setSingleShot(True)
        self.thanks_timer.timeout.connect(self.reset_to_welcome)

    def start_system(self):
        """Khởi động toàn bộ hệ thống"""
        self.worker.start() # Bật luồng Camera + AI chạy ngầm
        self.reset_to_welcome()

    def _on_trash_detected(self, trash_data: TrashData):
        """Khi AI nhận diện có rác"""
        self.worker.pause_detection() # Tạm dừng AI trong lúc hỏi người dùng
        self.state_feedback.emit(trash_data) # Báo cho View hiện màn Feedback
        self.feedback_timer.start(10000) # Đợi 10s

    def handle_feedback(self, is_correct: bool):
        """Khi người dùng bấm nút Đúng/Sai từ View"""
        self.feedback_timer.stop()
        
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
        url = f"{self.base_url}/device"
        
        payload = {}
        
        try:
            response = requests.post(url, data=payload, timeout=self.timeout)
            
            response.raise_for_status()
            
            return True, response.json()
        except requests.exceptions.RequestException as e:
            return False, str(e)
    
    def activate_device(self):
        url = f"{self.base_url}/devices/activate"
        
        mac_num = hex(uuid.getnode()).replace('0x', '').zfill(12).upper()
        mac = ':'.join(mac_num[i: i + 2] for i in range(0, 11, 2))
        payload = mac
        
        try:
            with open("/smart_bin_desktop/key/private_key.pem", "rb") as key_file:
                private_key = load_pem_private_key(
                    key_file.read(),
                    password=None, 
                )

            signature = private_key.sign(
                payload.encode('utf-8'),
                padding.PKCS1v15(), 
                hashes.SHA256()
            )
            signature_b64 = base64.b64encode(signature).decode('utf-8')
            headers = {
                "X-Signature": signature_b64,
                "Content-Type": "text/plain"
            }
            
            response = requests.post(url, data=payload, headers=headers, timeout=self.timeout)
            
            response.raise_for_status() 
            
            return True, response.text
            
        except FileNotFoundError:
            return False, "Lỗi: Không tìm thấy file private_key.pem"
        except ValueError as e:
            return False, f"Lỗi đọc Key/Tạo chữ ký: {str(e)}"
        except requests.exceptions.RequestException as e:
            return False, f"Lỗi kết nối API: {str(e)}"
        except Exception as e:
            return False, f"Lỗi không xác định: {str(e)}"
    
    def send_telemetry(self):
        pass