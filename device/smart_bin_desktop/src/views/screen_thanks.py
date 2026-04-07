from PyQt6.QtWidgets import QWidget, QVBoxLayout, QLabel
from PyQt6.QtCore import Qt

class ScreenThanks(QWidget):
    def __init__(self):
        super().__init__()
        
        self.setStyleSheet("""
            QWidget {
                background-color: #121212;
                font-family: 'Segoe UI', Arial, sans-serif;
            }
        """)
        layout = QVBoxLayout()
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.card = QWidget()
        self.card.setStyleSheet("""
            QWidget {
                background-color: #1e293b;
                border-radius: 30px;
            }
        """)
        card_layout = QVBoxLayout(self.card)
        card_layout.setContentsMargins(60, 60, 60, 60)
        card_layout.setSpacing(20)
        
        icon = QLabel("💖")
        icon.setStyleSheet("font-size: 80px; background: transparent;")
        icon.setAlignment(Qt.AlignmentFlag.AlignCenter)

        msg_title = QLabel("CẢM ƠN BẠN!")
        msg_title.setStyleSheet("font-size: 40px; font-weight: 900; color: #38bdf8; background: transparent;")
        msg_title.setAlignment(Qt.AlignmentFlag.AlignCenter)

        msg_sub = QLabel("Phản hồi của bạn giúp AI\nhọc hỏi và thông minh hơn từng ngày.")
        msg_sub.setStyleSheet("font-size: 20px; color: #cbd5e1; background: transparent;")
        msg_sub.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        card_layout.addWidget(icon)
        card_layout.addWidget(msg_title)
        card_layout.addWidget(msg_sub)

        layout.addWidget(self.card)
        self.setLayout(layout)