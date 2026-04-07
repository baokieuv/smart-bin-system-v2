from PyQt6.QtWidgets import QWidget, QHBoxLayout, QVBoxLayout, QLabel, QPushButton
from PyQt6.QtCore import Qt

class ScreenFeedback(QWidget):
    def __init__(self):
        super().__init__()
        
        self.setStyleSheet("font-family: 'Segoe UI', Arial, sans-serif;")
        layout = QHBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        
        self.left_panel = QWidget()
        self.left_layout = QVBoxLayout(self.left_panel)
        self.left_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.left_layout.setSpacing(20)
        
        self.lbl_material = QLabel("PLASTIC")
        self.lbl_material.setStyleSheet("font-size: 48px; font-weight: 900; color: white;")
        self.lbl_material.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.lbl_item_image = QLabel("🥤")
        self.lbl_item_image.setStyleSheet("font-size: 100px; padding: 20px;")
        self.lbl_item_image.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.lbl_type = QLabel("BOTTLE\nRecyclable")
        self.lbl_type.setStyleSheet("font-size: 26px; font-weight: 600; color: rgba(255, 255, 255, 0.9);")
        self.lbl_type.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.left_layout.addWidget(self.lbl_material)
        self.left_layout.addWidget(self.lbl_item_image)
        self.left_layout.addWidget(self.lbl_type)
        
        self.right_panel = QWidget()
        self.right_panel.setStyleSheet("background-color: #f8fafc;") 
        self.right_layout = QVBoxLayout(self.right_panel)
        self.right_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.right_layout.setSpacing(40)
        
        self.lbl_question = QLabel("Nhận diện có\nchính xác không?")
        self.lbl_question.setStyleSheet("font-size: 36px; font-weight: 800; color: #334155;")
        self.lbl_question.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.btn_layout = QHBoxLayout()
        self.btn_layout.setSpacing(40)
        self.btn_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.btn_wrong = QPushButton("✖")
        self.btn_wrong.setFixedSize(130, 130)
        self.btn_wrong.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_wrong.setStyleSheet("""
            QPushButton { 
                background-color: #f43f5e; 
                color: white; 
                font-size: 60px; 
                font-weight: bold;
                border-radius: 65px; 
            }
            QPushButton:hover { background-color: #e11d48; }
            QPushButton:pressed { background-color: #be123c; margin-top: 5px; }
        """)
        
        self.btn_correct = QPushButton("✔")
        self.btn_correct.setFixedSize(130, 130)
        self.btn_correct.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_correct.setStyleSheet("""
            QPushButton { 
                background-color: #10b981; 
                color: white; 
                font-size: 60px; 
                font-weight: bold;
                border-radius: 65px; 
            }
            QPushButton:hover { background-color: #059669; }
            QPushButton:pressed { background-color: #047857; margin-top: 5px; }
        """)
        
        self.btn_layout.addWidget(self.btn_wrong)
        self.btn_layout.addWidget(self.btn_correct)

        self.right_layout.addWidget(self.lbl_question)
        self.right_layout.addLayout(self.btn_layout)
        
        layout.addWidget(self.left_panel, stretch=1)
        layout.addWidget(self.right_panel, stretch=1)
        self.setLayout(layout)
        
    def update_ui(self, material, item_type, bg_color):
        self.lbl_material.setText(material.upper())
        self.lbl_type.setText(item_type)
        self.left_panel.setStyleSheet(f"background-color: {bg_color};")
        
        if "PLASTIC" in material.upper():
            self.lbl_item_image.setText("🥤")
        elif "PAPER" in material.upper():
            self.lbl_item_image.setText("📄")
        elif "GLASS" in material.upper():
            self.lbl_item_image.setText("🍾")
        else:
            self.lbl_item_image.setText("🗑️")