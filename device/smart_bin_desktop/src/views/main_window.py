from PyQt6.QtWidgets import QMainWindow, QStackedWidget
from src.views.screen_welcome import ScreenWelcome
from src.views.screen_feedback import ScreenFeedback
from src.views.screen_thanks import ScreenThanks
from src.models.trash_model import TrashData

class MainWindow(QMainWindow):
    def __init__(self, viewmodel):
        super().__init__()
        self.viewmodel = viewmodel

        self.setWindowTitle("Smart Bin GUI")
        self.resize(800, 480)
        
        self.stacked_widget = QStackedWidget()
        self.setCentralWidget(self.stacked_widget)
        
        self.screen_welcome = ScreenWelcome()
        self.screen_feedback = ScreenFeedback()
        self.screen_thanks = ScreenThanks()
        
        self.stacked_widget.addWidget(self.screen_welcome)
        self.stacked_widget.addWidget(self.screen_feedback)
        self.stacked_widget.addWidget(self.screen_thanks)
        
        # 1. View bắt sự kiện click và gọi ViewModel
        self.screen_feedback.btn_correct.clicked.connect(lambda: self.viewmodel.handle_feedback(True))
        self.screen_feedback.btn_wrong.clicked.connect(lambda: self.viewmodel.handle_feedback(False))
        
        # 2. View lắng nghe State từ ViewModel để chuyển màn
        self.viewmodel.state_welcome.connect(self.show_welcome)
        self.viewmodel.state_feedback.connect(self.show_feedback)
        self.viewmodel.state_thanks.connect(self.show_thanks)
        
    # --- CÁC HÀM CẬP NHẬT UI ---
    def show_welcome(self):
        self.stacked_widget.setCurrentIndex(0)
        
    def show_feedback(self, data: TrashData):
        self.screen_feedback.update_ui(data.material, data.item_type, data.bg_color)
        self.stacked_widget.setCurrentIndex(1)
        
    def show_thanks(self):
        self.stacked_widget.setCurrentIndex(2)

    def closeEvent(self, event):
        """Đảm bảo tắt luồng ngầm khi người dùng ấn X tắt app"""
        self.viewmodel.worker.stop()
        event.accept()