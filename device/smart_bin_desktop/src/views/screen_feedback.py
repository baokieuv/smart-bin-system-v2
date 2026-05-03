from PyQt6.QtWidgets import (QWidget, QHBoxLayout, QVBoxLayout, QLabel,
                             QPushButton, QGraphicsDropShadowEffect, QGraphicsOpacityEffect)
from PyQt6.QtCore import Qt, QPropertyAnimation, QEasingCurve, QTimer, QSequentialAnimationGroup
from PyQt6.QtGui import QPainter, QLinearGradient, QColor, QBrush, QFont, QRadialGradient
from src.models.trash_model import TrashData, WasteGroup


class PulseButton(QPushButton):
    """Rounded button with simple hover scale effect."""

    def __init__(self, text, base_color, hover_color, press_color, parent=None):
        super().__init__(text, parent)
        self.base_color = base_color
        self.hover_color = hover_color
        self.press_color = press_color
        self._apply_style(base_color)
        self._setup_shadow()

    def _apply_style(self, bg):
        self.setStyleSheet(f"""
            QPushButton {{
                background-color: {bg};
                color: white;
                font-size: 48px;
                font-weight: 800;
                border-radius: 60px;
                border: none;
            }}
            QPushButton:hover {{ background-color: {self.hover_color}; }}
            QPushButton:pressed {{ background-color: {self.press_color}; }}
        """)

    def _setup_shadow(self):
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(24)
        shadow.setColor(QColor(0, 0, 0, 60))
        shadow.setOffset(0, 8)
        self.setGraphicsEffect(shadow)

    def enterEvent(self, event):
        self._animate_scale(1.05)
        super().enterEvent(event)

    def leaveEvent(self, event):
        self._animate_scale(1.0)
        super().leaveEvent(event)

    def _animate_scale(self, scale):
        base = 120
        new_size = int(base * scale)
        self.setFixedSize(new_size, new_size)
        self.setStyleSheet(f"""
            QPushButton {{
                background-color: {self.hover_color if scale > 1 else self.base_color};
                color: white;
                font-size: {int(44 * scale)}px;
                font-weight: 800;
                border-radius: {new_size // 2}px;
                border: none;
            }}
        """)


class ScreenFeedback(QWidget):
    """Feedback screen showing AI classification and user confirmation actions."""

    def __init__(self):
        super().__init__()
        self._build_ui()

    def _build_ui(self):
        """Build two-panel layout: result summary (left) and feedback actions (right)."""
        self.setStyleSheet("font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;")

        layout = QHBoxLayout(self)
        layout.setContentsMargins(20, 20, 20, 20)
        layout.setSpacing(16)

        # ── LEFT PANEL ───────────────────────────────────────────
        self.left_panel = QWidget()
        self.left_panel.setStyleSheet("""
            QWidget {
                background-color: #5b9cf6;
                border-radius: 26px;
            }
        """)
        left_shadow = QGraphicsDropShadowEffect()
        left_shadow.setBlurRadius(30)
        left_shadow.setColor(QColor(91, 156, 246, 90))
        left_shadow.setOffset(0, 8)
        self.left_panel.setGraphicsEffect(left_shadow)

        self.left_layout = QVBoxLayout(self.left_panel)
        self.left_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.left_layout.setSpacing(8)
        self.left_layout.setContentsMargins(20, 24, 20, 24)

        # Category chip
        self.chip = QWidget()
        self.chip.setStyleSheet("""
            QWidget {
                background: rgba(255,255,255,0.22);
                border-radius: 12px;
                border: none;
            }
        """)
        chip_layout = QHBoxLayout(self.chip)
        chip_layout.setContentsMargins(14, 6, 14, 6)
        chip_layout.setSpacing(6)

        self.chip_icon = QLabel("RC")
        self.chip_icon.setStyleSheet(
            "font-size: 10px; font-weight: 800; color: white; background: transparent; "
            "border: 1px solid rgba(255,255,255,0.5); border-radius: 5px; padding: 1px 4px;"
        )
        self.chip_text = QLabel("RECYCLABLE")
        self.chip_text.setStyleSheet("font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.95); background: transparent; letter-spacing: 1px;")
        chip_layout.addWidget(self.chip_icon)
        chip_layout.addWidget(self.chip_text)

        chip_wrap = QHBoxLayout()
        chip_wrap.setAlignment(Qt.AlignmentFlag.AlignCenter)
        chip_wrap.addWidget(self.chip)

        # Item label shows a short material code and is updated via update_ui().
        self.lbl_item_image = QLabel("RC")
        self.lbl_item_image.setStyleSheet("""
            font-size: 40px;
            font-weight: 900;
            font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
            color: rgba(255,255,255,0.95);
            background: rgba(255,255,255,0.15);
            border-radius: 28px;
            padding: 12px;
            min-width: 130px; max-width: 130px;
            min-height: 130px; max-height: 130px;
            letter-spacing: 2px;
        """)
        self.lbl_item_image.setAlignment(Qt.AlignmentFlag.AlignCenter)

        icon_shadow = QGraphicsDropShadowEffect()
        icon_shadow.setBlurRadius(20)
        icon_shadow.setColor(QColor(0, 0, 0, 50))
        icon_shadow.setOffset(0, 6)
        self.lbl_item_image.setGraphicsEffect(icon_shadow)

        icon_wrap = QHBoxLayout()
        icon_wrap.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_wrap.addWidget(self.lbl_item_image)

        # Material name
        self.lbl_material = QLabel("PLASTIC")
        self.lbl_material.setStyleSheet("""
            font-size: 36px;
            font-weight: 900;
            color: #ffffff;
            background: transparent;
            letter-spacing: 2px;
        """)
        self.lbl_material.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Divider line
        divider = QWidget()
        divider.setFixedHeight(1)
        divider.setStyleSheet("background: rgba(255,255,255,0.3); border-radius: 1px;")

        # Item type
        self.lbl_type = QLabel("CHAI NHỰA")
        self.lbl_type.setStyleSheet("""
            font-size: 18px;
            font-weight: 600;
            color: rgba(255,255,255,0.9);
            background: transparent;
        """)
        self.lbl_type.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Confidence bar
        conf_label = QLabel("Độ chính xác AI")
        conf_label.setStyleSheet("font-size: 12px; color: rgba(255,255,255,0.75); background: transparent;")
        conf_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        conf_bar_bg = QWidget()
        conf_bar_bg.setFixedHeight(8)
        conf_bar_bg.setStyleSheet("background: rgba(255,255,255,0.2); border-radius: 4px;")

        self.conf_bar = QWidget(conf_bar_bg)
        self.conf_bar.setFixedHeight(8)
        self.conf_bar.setStyleSheet("background: rgba(255,255,255,0.85); border-radius: 4px;")
        self.conf_bar.setFixedWidth(140)

        conf_pct = QLabel("92%")
        conf_pct.setStyleSheet("font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.9); background: transparent;")
        conf_pct.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.left_layout.addLayout(chip_wrap)
        self.left_layout.addSpacing(4)
        self.left_layout.addLayout(icon_wrap)
        self.left_layout.addWidget(self.lbl_material)
        self.left_layout.addWidget(divider)
        self.left_layout.addWidget(self.lbl_type)
        self.left_layout.addSpacing(6)
        self.left_layout.addWidget(conf_label)
        self.left_layout.addWidget(conf_bar_bg)
        self.left_layout.addWidget(conf_pct)
        self.left_layout.addSpacing(12)

        # Waste group badge (displays category, emoji, angle, Vietnamese description)
        self.waste_group_container = QWidget()
        self.waste_group_container.setStyleSheet("""
            QWidget {
                background: rgba(255,255,255,0.15);
                border-radius: 12px;
                border: none;
            }
        """)
        waste_group_layout = QVBoxLayout(self.waste_group_container)
        waste_group_layout.setContentsMargins(12, 8, 12, 8)
        waste_group_layout.setSpacing(4)

        self.lbl_waste_group_badge = QLabel("🟢 Recyclable")
        self.lbl_waste_group_badge.setStyleSheet("""
            font-size: 13px;
            font-weight: 700;
            color: rgba(255,255,255,0.95);
            background: transparent;
        """)
        self.lbl_waste_group_badge.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.lbl_waste_group_desc = QLabel("Có thể tái chế")
        self.lbl_waste_group_desc.setStyleSheet("""
            font-size: 11px;
            font-weight: 500;
            color: rgba(255,255,255,0.8);
            background: transparent;
        """)
        self.lbl_waste_group_desc.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.lbl_stepper_angle = QLabel("Angle: 45°")
        self.lbl_stepper_angle.setStyleSheet("""
            font-size: 10px;
            font-weight: 600;
            color: rgba(255,255,255,0.7);
            background: transparent;
        """)
        self.lbl_stepper_angle.setAlignment(Qt.AlignmentFlag.AlignCenter)

        waste_group_layout.addWidget(self.lbl_waste_group_badge)
        waste_group_layout.addWidget(self.lbl_waste_group_desc)
        waste_group_layout.addWidget(self.lbl_stepper_angle)

        self.left_layout.addWidget(self.waste_group_container)

        # ── RIGHT PANEL ──────────────────────────────────────────
        self.right_panel = QWidget()
        self.right_panel.setStyleSheet("""
            QWidget {
                background-color: #ffffff;
                border-radius: 26px;
                border: none;
            }
        """)
        right_shadow = QGraphicsDropShadowEffect()
        right_shadow.setBlurRadius(24)
        right_shadow.setColor(QColor(59, 130, 246, 40))
        right_shadow.setOffset(0, 6)
        self.right_panel.setGraphicsEffect(right_shadow)

        self.right_layout = QVBoxLayout(self.right_panel)
        self.right_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.right_layout.setSpacing(24)
        self.right_layout.setContentsMargins(28, 28, 28, 28)

        # AI icon + question
        ai_badge = QLabel("AI  Nhận diện")
        ai_badge.setStyleSheet("""
            font-size: 12px;
            font-weight: 700;
            color: #3b82f6;
            background: #eff6ff;
            border-radius: 10px;
            padding: 5px 14px;
            border: none;
            letter-spacing: 0.5px;
        """)
        ai_badge.setAlignment(Qt.AlignmentFlag.AlignCenter)

        ai_wrap = QHBoxLayout()
        ai_wrap.setAlignment(Qt.AlignmentFlag.AlignCenter)
        ai_wrap.addWidget(ai_badge)

        self.lbl_question = QLabel("Kết quả\nchính xác không?")
        self.lbl_question.setStyleSheet("""
            font-size: 32px;
            font-weight: 800;
            color: #0f2d5e;
            background: transparent;
        """)
        self.lbl_question.setAlignment(Qt.AlignmentFlag.AlignCenter)

        hint = QLabel("Phản hồi giúp AI học tốt hơn mỗi ngày")
        hint.setStyleSheet("""
            font-size: 13px;
            color: #7fa2cc;
            background: transparent;
        """)
        hint.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Buttons
        self.btn_layout = QHBoxLayout()
        self.btn_layout.setSpacing(28)
        self.btn_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.btn_wrong = QPushButton("✕")
        self.btn_wrong.setFixedSize(120, 120)
        self.btn_wrong.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_wrong.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0,y1:0,x2:0,y2:1,
                    stop:0 #ff6b81, stop:1 #f43f5e);
                color: white;
                font-size: 44px;
                font-weight: 800;
                border-radius: 60px;
                border: none;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0,y1:0,x2:0,y2:1,
                    stop:0 #ff8c9a, stop:1 #fb7185);
            }
            QPushButton:pressed {
                background: #e11d48;
                margin-top: 3px;
            }
        """)
        wrong_shadow = QGraphicsDropShadowEffect()
        wrong_shadow.setBlurRadius(20)
        wrong_shadow.setColor(QColor(244, 63, 94, 100))
        wrong_shadow.setOffset(0, 6)
        self.btn_wrong.setGraphicsEffect(wrong_shadow)

        self.btn_correct = QPushButton("✓")
        self.btn_correct.setFixedSize(120, 120)
        self.btn_correct.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_correct.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0,y1:0,x2:0,y2:1,
                    stop:0 #34d399, stop:1 #10b981);
                color: white;
                font-size: 44px;
                font-weight: 800;
                border-radius: 60px;
                border: none;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0,y1:0,x2:0,y2:1,
                    stop:0 #4ade80, stop:1 #22c55e);
            }
            QPushButton:pressed {
                background: #059669;
                margin-top: 3px;
            }
        """)
        correct_shadow = QGraphicsDropShadowEffect()
        correct_shadow.setBlurRadius(20)
        correct_shadow.setColor(QColor(16, 185, 129, 100))
        correct_shadow.setOffset(0, 6)
        self.btn_correct.setGraphicsEffect(correct_shadow)

        # Labels under buttons
        wrong_lbl = QLabel("Sai")
        wrong_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        wrong_lbl.setStyleSheet("font-size: 13px; font-weight: 600; color: #f43f5e; background: transparent;")

        correct_lbl = QLabel("Đúng")
        correct_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        correct_lbl.setStyleSheet("font-size: 13px; font-weight: 600; color: #10b981; background: transparent;")

        wrong_col = QVBoxLayout()
        wrong_col.setSpacing(8)
        wrong_col.setAlignment(Qt.AlignmentFlag.AlignCenter)
        wrong_col.addWidget(self.btn_wrong)
        wrong_col.addWidget(wrong_lbl)

        correct_col = QVBoxLayout()
        correct_col.setSpacing(8)
        correct_col.setAlignment(Qt.AlignmentFlag.AlignCenter)
        correct_col.addWidget(self.btn_correct)
        correct_col.addWidget(correct_lbl)

        self.btn_layout.addLayout(wrong_col)
        self.btn_layout.addLayout(correct_col)

        self.right_layout.addLayout(ai_wrap)
        self.right_layout.addWidget(self.lbl_question)
        self.right_layout.addWidget(hint)
        self.right_layout.addLayout(self.btn_layout)

        layout.addWidget(self.left_panel, stretch=1)
        layout.addWidget(self.right_panel, stretch=1)

    def paintEvent(self, event):
        """Paint a soft blue gradient background under the cards."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        gradient = QLinearGradient(0, 0, self.width(), self.height())
        gradient.setColorAt(0.0, QColor("#e8f2ff"))
        gradient.setColorAt(1.0, QColor("#f0f4ff"))
        painter.fillRect(self.rect(), gradient)

    def update_ui(self, trash_data: TrashData):
        """Update visual content based on trash detection result.
        
        Args:
            trash_data: TrashData object containing classification result, category, and confidence.
        """
        # Called whenever detector emits a new material result; refresh left panel.
        self.lbl_material.setText(trash_data.material.upper())
        self.lbl_type.setText(trash_data.item_type)
        self.left_panel.setStyleSheet(
            f"QWidget {{ background-color: {trash_data.bg_color}; border-radius: 26px; }}"
        )

        # Update waste group badge with emoji, description, and angle.
        waste_group: WasteGroup = trash_data.waste_group
        self.lbl_waste_group_badge.setText(f"{waste_group.badge_color} {waste_group.name.replace('_', ' ').title()}")
        self.lbl_waste_group_desc.setText(waste_group.description)
        self.lbl_stepper_angle.setText(f"Angle: {trash_data.stepper_angle}°")

        # Map material -> short code + category chip label.
        # Text labels are used instead of emoji for cross-platform consistency.
        mat_upper = trash_data.material.upper()
        if "BATTERY" in mat_upper:
            self.lbl_item_image.setText("PIN")
            self.chip_text.setText("RÁC NGUY HẠI")
            self._set_chip_icon("!", danger=True)
        elif "BIOLOGICAL" in mat_upper:
            self.lbl_item_image.setText("HC")
            self.chip_text.setText("HỮU CƠ")
            self._set_chip_icon("BIO")
        elif "CARDBOARD" in mat_upper:
            self.lbl_item_image.setText("BÌA")
            self.chip_text.setText("TÁI CHẾ ĐƯỢC")
            self._set_chip_icon("RC")
        elif "CLOTHES" in mat_upper:
            self.lbl_item_image.setText("VẢI")
            self.chip_text.setText("TÁI SỬ DỤNG")
            self._set_chip_icon("RE")
        elif "GLASS" in mat_upper:
            self.lbl_item_image.setText("TT")
            self.chip_text.setText("TÁI CHẾ ĐƯỢC")
            self._set_chip_icon("RC")
        elif "METAL" in mat_upper:
            self.lbl_item_image.setText("KL")
            self.chip_text.setText("TÁI CHẾ ĐƯỢC")
            self._set_chip_icon("RC")
        elif "PAPER" in mat_upper:
            self.lbl_item_image.setText("GY")
            self.chip_text.setText("TÁI CHẾ ĐƯỢC")
            self._set_chip_icon("RC")
        elif "PLASTIC" in mat_upper:
            self.lbl_item_image.setText("NHỰ")
            self.chip_text.setText("TÁI CHẾ ĐƯỢC")
            self._set_chip_icon("RC")
        elif "SHOES" in mat_upper:
            self.lbl_item_image.setText("GDÉ")
            self.chip_text.setText("TÁI SỬ DỤNG")
            self._set_chip_icon("RE")
        else:
            self.lbl_item_image.setText("RÁC")
            self.chip_text.setText("KHÔNG TÁI CHẾ")
            self._set_chip_icon("X", danger=True)

    def _set_chip_icon(self, text: str, danger: bool = False):
        """
        Cập nhật badge icon trong chip phân loại.
        danger=True dùng viền đỏ để nhấn mạnh rác nguy hại.
        """
        border_color = "rgba(255,100,100,0.7)" if danger else "rgba(255,255,255,0.5)"
        self.chip_icon.setText(text)
        self.chip_icon.setStyleSheet(
            f"font-size: 10px; font-weight: 800; color: white; background: transparent; "
            f"border: 1px solid {border_color}; border-radius: 5px; padding: 1px 4px;"
        )