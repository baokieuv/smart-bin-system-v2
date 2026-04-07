import random
from PyQt6.QtWidgets import QMainWindow, QStackedWidget
from PyQt6.QtCore import QTimer

from src.views.screen_welcome import ScreenWelcome
from src.views.screen_feedback import ScreenFeedback
from src.views.screen_thanks import ScreenThanks


class MainWindow(QMainWindow):
    def __init__(self, controller):
        super().__init__()
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
        
        self.screen_feedback.btn_correct.clicked.connect(self.on_feedback_given)
        self.screen_feedback.btn_wrong.clicked.connect(self.on_feedback_given)
        
        self.mock_sensor_timer = QTimer(self)
        self.mock_sensor_timer.timeout.connect(self.on_trash_detected)
        
        self.feedback_timeout_timer = QTimer(self)
        self.feedback_timeout_timer.setSingleShot(True) # Chỉ chạy 1 lần rồi dừng
        self.feedback_timeout_timer.timeout.connect(self.show_welcome)
        
        self.thanks_timer = QTimer(self)
        self.thanks_timer.setSingleShot(True)
        self.thanks_timer.timeout.connect(self.show_welcome)
        
        self.show_welcome()
        
    def show_welcome(self):
        self.stacked_widget.setCurrentIndex(0)
        
        self.feedback_timeout_timer.stop()
        self.thanks_timer.stop()
        
        self.mock_sensor_timer.start(5000)
        
    def on_trash_detected(self):
        if self.stacked_widget.currentIndex() == 2:
            return
        
        self.mock_sensor_timer.stop()
        
        mock_data_list = [
            ("PLASTIC", "BOTTLE\nRecyclable", "#eab308"), # Vàng
            ("GLASS", "BOTTLE\nRecyclable", "#4ade80"),   # Xanh lá
            ("PAPER", "WRAPPER\nRecyclable", "#38bdf8")   # Xanh dương
        ]
        data = random.choice(mock_data_list)
        
        self.screen_feedback.update_ui(data[0], data[1], data[2])
        
        self.stacked_widget.setCurrentIndex(1)
        
        self.feedback_timeout_timer.start(10000)
        
        self.mock_sensor_timer.start(6000)
        
    def on_feedback_given(self):
        self.feedback_timeout_timer.stop()
        self.mock_sensor_timer.stop()
        
        self.stacked_widget.setCurrentIndex(2)
        
        self.thanks_timer.start(5000)
        
    