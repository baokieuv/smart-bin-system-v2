from PyQt6.QtWidgets import QWidget, QVBoxLayout, QLabel
from PyQt6.QtCore import Qt

class ScreenWelcome(QWidget):
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
        layout.setSpacing(15)
        
        self.title = QLabel("SMART BIN")
        self.title.setStyleSheet("""
            font-size: 64px; 
            font-weight: 900; 
            color: #10b981; 
            letter-spacing: 2px;
        """)
        self.title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.title)
        
        self.subtitle = QLabel("Where AI Meets Sustainability")
        self.subtitle.setStyleSheet("""
            font-size: 22px; 
            font-weight: 500; 
            color: #9ca3af; 
            margin-bottom: 40px;
        """)
        self.subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.addWidget(self.subtitle)
        
        self.instruction = QLabel("♻️\nHãy đặt rác vào khay để hệ thống\ntự động nhận diện")
        self.instruction.setStyleSheet("""
            QLabel {
                font-size: 24px; 
                color: #ffffff; 
                background-color: #1e293b;
                border: 2px dashed #475569; 
                border-radius: 20px;
                padding: 40px;
                line-height: 1.5;
            }
        """)
        self.instruction.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        layout.setContentsMargins(60, 60, 60, 60)
        layout.addWidget(self.instruction)

        self.setLayout(layout)