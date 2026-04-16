from PyQt6.QtCore import Qt, pyqtSignal, QPropertyAnimation, QEasingCurve, QTimer, QPoint, QSequentialAnimationGroup, QParallelAnimationGroup
from PyQt6.QtGui import QAction, QFont, QColor, QPainter, QPainterPath, QLinearGradient, QBrush, QPen, QRadialGradient
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel,
                              QToolButton, QMenu, QPushButton, QGraphicsDropShadowEffect, QGraphicsOpacityEffect)


class AnimatedDot(QWidget):
    """Floating decorative dot with pulse animation"""
    def __init__(self, color, size, parent=None):
        super().__init__(parent)
        self.color = QColor(color)
        self.dot_size = size
        self.setFixedSize(size, size)
        self._setup_pulse()

    def _setup_pulse(self):
        self._alpha = 0.4
        self._alpha_step = 0.015
        self._pulse_timer = QTimer(self)
        self._pulse_timer.timeout.connect(self._tick_pulse)
        self._pulse_timer.start(33)

    def _tick_pulse(self):
        # Simple ping-pong alpha animation without graphics effects.
        self._alpha += self._alpha_step
        if self._alpha >= 0.72:
            self._alpha = 0.72
            self._alpha_step *= -1
        elif self._alpha <= 0.2:
            self._alpha = 0.2
            self._alpha_step *= -1
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        color = QColor(self.color)
        color.setAlphaF(self._alpha)
        painter.setBrush(QBrush(color))
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawEllipse(0, 0, self.dot_size, self.dot_size)


class GlowButton(QToolButton):
    """Small utility button with glow shadow for top-right menu trigger."""

    def __init__(self, parent=None):
        super().__init__(parent)
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(16)
        shadow.setColor(QColor(41, 98, 255, 80))
        shadow.setOffset(0, 4)
        self.setGraphicsEffect(shadow)


class ScreenWelcome(QWidget):
    """Landing screen showing system status and entry points for setup flows."""

    open_device_link_requested = pyqtSignal()
    open_wifi_config_requested = pyqtSignal()
    activate_requested = pyqtSignal()

    def __init__(self):
        super().__init__()
        self._build_ui()
        self._start_entrance_animation()

    def _build_ui(self):
        """Create welcome layout, menu actions, activation CTA and toast area."""
        self.setStyleSheet("""
            QWidget {
                font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
            }
        """)

        # Decorative background dots
        dots_data = [
            ("#6ea8fe", 18, 60, 40),
            ("#a5c8ff", 12, 720, 60),
            ("#4285f4", 22, 40, 400),
            ("#93c5fd", 14, 760, 420),
            ("#bfdbfe", 10, 400, 20),
            ("#60a5fa", 16, 680, 200),
        ]
        for color, size, x, y in dots_data:
            dot = AnimatedDot(color, size, self)
            dot.move(x, y)

        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(28, 22, 28, 28)
        main_layout.setSpacing(0)

        # ── Top bar ──────────────────────────────────────────────
        top_bar = QHBoxLayout()
        top_bar.addStretch()

        self.btn_settings = GlowButton()
        self.btn_settings.setText("≡")
        self.btn_settings.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_settings.setFixedSize(46, 46)
        self.btn_settings.setPopupMode(QToolButton.ToolButtonPopupMode.InstantPopup)
        self.btn_settings.setStyleSheet("""
            QToolButton {
                background: rgba(255,255,255,0.92);
                border: none;
                border-radius: 13px;
                color: #1a4ab5;
                font-size: 20px;
            }
            QToolButton:hover { background: #eef5ff; }
            QToolButton:pressed { background: #dbeafe; }
            QToolButton::menu-indicator { image: none; }
        """)

        menu = QMenu(self)
        menu.setStyleSheet("""
            QMenu {
                background: #ffffff;
                border: none;
                border-radius: 14px;
                padding: 6px;
            }
            QMenu::item {
                font-size: 15px;
                color: #1e3e75;
                padding: 10px 20px;
                border-radius: 9px;
            }
            QMenu::item:selected { background: #eff6ff; color: #1d4ed8; }
        """)
        link_action = QAction("  Liên kết thiết bị", self)
        link_action.triggered.connect(self.open_device_link_requested.emit)
        wifi_action = QAction("  Cấu hình Wi-Fi", self)
        wifi_action.triggered.connect(self.open_wifi_config_requested.emit)
        menu.addAction(link_action)
        menu.addAction(wifi_action)
        self.btn_settings.setMenu(menu)
        top_bar.addWidget(self.btn_settings)
        main_layout.addLayout(top_bar)

        # ── Centre content ────────────────────────────────────────
        content = QVBoxLayout()
        content.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content.setSpacing(14)
        main_layout.addLayout(content, 1)

        # Logo / icon area
        self.icon_label = QLabel("SB")
        self.icon_label.setStyleSheet("""
            font-size: 26px;
            font-weight: 900;
            font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
            background: qlineargradient(x1:0,y1:0,x2:1,y2:1,
                stop:0 #dbeafe, stop:1 #ede9fe);
            border-radius: 36px;
            min-width: 92px; max-width: 92px;
            min-height: 92px; max-height: 92px;
            border: none;
            color: #1d4ed8;
            letter-spacing: 3px;
        """)
        self.icon_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_shadow = QGraphicsDropShadowEffect()
        icon_shadow.setBlurRadius(28)
        icon_shadow.setColor(QColor(96, 165, 250, 100))
        icon_shadow.setOffset(0, 6)
        self.icon_label.setGraphicsEffect(icon_shadow)

        icon_wrap = QHBoxLayout()
        icon_wrap.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_wrap.addWidget(self.icon_label)
        content.addLayout(icon_wrap)
        content.addSpacing(4)

        self.title = QLabel("SMART BIN")
        self.title.setStyleSheet("""
            font-size: 58px;
            font-weight: 900;
            color: #0d3580;
            letter-spacing: 4px;
            background: transparent;
        """)
        self.title.setAlignment(Qt.AlignmentFlag.AlignCenter)

        title_shadow = QGraphicsDropShadowEffect()
        title_shadow.setBlurRadius(0)
        title_shadow.setColor(QColor(29, 78, 216, 30))
        title_shadow.setOffset(2, 3)
        self.title.setGraphicsEffect(title_shadow)
        content.addWidget(self.title)

        self.subtitle = QLabel("Where AI Meets Sustainability")
        self.subtitle.setStyleSheet("""
            font-size: 18px;
            font-weight: 600;
            color: #4a72b0;
            letter-spacing: 1px;
            background: transparent;
        """)
        self.subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)
        content.addWidget(self.subtitle)
        content.addSpacing(10)

        # Instruction card
        self.instr_card = QWidget()
        self.instr_card.setStyleSheet("""
            QWidget {
                background: rgba(255,255,255,0.88);
                border: none;
                border-radius: 22px;
            }
        """)
        card_shadow = QGraphicsDropShadowEffect()
        card_shadow.setBlurRadius(24)
        card_shadow.setColor(QColor(59, 130, 246, 50))
        card_shadow.setOffset(0, 8)
        self.instr_card.setGraphicsEffect(card_shadow)

        card_inner = QVBoxLayout(self.instr_card)
        card_inner.setContentsMargins(40, 28, 40, 28)
        card_inner.setSpacing(10)
        card_inner.setAlignment(Qt.AlignmentFlag.AlignCenter)

        arrow_label = QLabel("⬇")
        arrow_label.setStyleSheet("font-size: 28px; background: transparent;")
        arrow_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        instr_text = QLabel("Đặt rác vào khay")
        instr_text.setStyleSheet("""
            font-size: 26px;
            font-weight: 800;
            color: #0f2f6d;
            background: transparent;
        """)
        instr_text.setAlignment(Qt.AlignmentFlag.AlignCenter)

        instr_sub = QLabel("Hệ thống AI sẽ tự động phân loại và nhận diện")
        instr_sub.setStyleSheet("""
            font-size: 15px;
            color: #5478a8;
            background: transparent;
        """)
        instr_sub.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Status badge
        status_badge = QWidget()
        status_badge.setStyleSheet("""
            QWidget {
                background: #dcfce7;
                border-radius: 14px;
                border: none;
            }
        """)
        badge_layout = QHBoxLayout(status_badge)
        badge_layout.setContentsMargins(14, 6, 14, 6)
        badge_layout.setSpacing(7)

        dot = QLabel("▪")
        dot.setStyleSheet("font-size: 12px; color: #16a34a; background: transparent;")
        status_lbl = QLabel("Hệ thống đang hoạt động")
        status_lbl.setStyleSheet("font-size: 13px; font-weight: 600; color: #15803d; background: transparent;")

        badge_layout.addWidget(dot)
        badge_layout.addWidget(status_lbl)

        badge_wrap = QHBoxLayout()
        badge_wrap.setAlignment(Qt.AlignmentFlag.AlignCenter)
        badge_wrap.addWidget(status_badge)

        card_inner.addWidget(arrow_label)
        card_inner.addWidget(instr_text)
        card_inner.addWidget(instr_sub)
        card_inner.addSpacing(4)
        card_inner.addLayout(badge_wrap)

        content.addWidget(self.instr_card)

        # Activation prompt appears only when backend reports device not active yet (AVT3010).
        self.activation_hint = QLabel("Thiết bị chưa kích hoạt. Nhấn nút bên dưới để kích hoạt.")
        self.activation_hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.activation_hint.setStyleSheet("""
            font-size: 13px;
            font-weight: 600;
            color: #854d0e;
            background: #fef9c3;
            border-radius: 12px;
            padding: 6px 14px;
        """)
        self.activation_hint.setVisible(False)

        hint_wrap = QHBoxLayout()
        hint_wrap.setAlignment(Qt.AlignmentFlag.AlignCenter)
        hint_wrap.addWidget(self.activation_hint)
        content.addLayout(hint_wrap)

        self.btn_activate = QPushButton("Kích hoạt thiết bị")
        self.btn_activate.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_activate.setFixedSize(230, 52)
        self.btn_activate.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0,y1:0,x2:1,y2:1,
                    stop:0 #f59e0b, stop:1 #f97316);
                color: white;
                font-size: 17px;
                font-weight: 800;
                border-radius: 14px;
                border: none;
                padding: 0 16px;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0,y1:0,x2:1,y2:1,
                    stop:0 #fbbf24, stop:1 #fb923c);
            }
            QPushButton:pressed {
                background: #ea580c;
                margin-top: 2px;
            }
        """)
        self.btn_activate.clicked.connect(self.activate_requested.emit)
        self.btn_activate.setVisible(False)

        btn_shadow = QGraphicsDropShadowEffect()
        btn_shadow.setBlurRadius(18)
        btn_shadow.setColor(QColor(249, 115, 22, 120))
        btn_shadow.setOffset(0, 6)
        self.btn_activate.setGraphicsEffect(btn_shadow)

        activate_wrap = QHBoxLayout()
        activate_wrap.setAlignment(Qt.AlignmentFlag.AlignCenter)
        activate_wrap.addWidget(self.btn_activate)
        content.addLayout(activate_wrap)

        self._activate_pulse_on = False
        self._activate_timer = QTimer(self)
        self._activate_timer.timeout.connect(self._tick_activate_pulse)

        self.toast_label = QLabel(self)
        self.toast_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.toast_label.setVisible(False)
        self.toast_label.setStyleSheet("""
            QLabel {
                color: white;
                font-size: 14px;
                font-weight: 700;
                border-radius: 12px;
                padding: 10px 18px;
            }
        """)
        self._toast_hide_timer = QTimer(self)
        self._toast_hide_timer.setSingleShot(True)
        self._toast_hide_timer.timeout.connect(lambda: self.toast_label.setVisible(False))

        # Animate the arrow
        self._setup_arrow_bounce(arrow_label)

    def _setup_arrow_bounce(self, label):
        """Register periodic arrow motion to keep the idle screen lively."""
        # Keep welcome screen lively with subtle periodic arrow movement.
        self._arrow_label = label
        self._arrow_pos = 0
        self._arrow_dir = 1
        self._arrow_timer = QTimer(self)
        self._arrow_timer.timeout.connect(self._tick_arrow)
        self._arrow_timer.start(50)

    def _tick_arrow(self):
        self._arrow_pos += self._arrow_dir * 0.4
        if abs(self._arrow_pos) >= 5:
            self._arrow_dir *= -1
        margin = int(self._arrow_pos)
        self._arrow_label.setStyleSheet(
            f"font-size: 28px; background: transparent; margin-top: {margin}px;"
        )

    def _start_entrance_animation(self):
        """Prepare minimal entrance animation while avoiding heavy opacity effects."""
        # Keep entrance animation light to avoid stacking opacity effects on page root.
        self._enter_anim = QPropertyAnimation(self, b"windowOpacity")
        self._enter_anim.setDuration(1)
        self._enter_anim.setStartValue(1.0)
        self._enter_anim.setEndValue(1.0)
        self._enter_anim.start()

    def set_activation_prompt_visible(self, visible: bool, tooltip_text: str = ""):
        """Toggle activation hint/button and pulse effect from backend state."""
        self.activation_hint.setText(tooltip_text or "Thiết bị chưa kích hoạt. Nhấn nút bên dưới để kích hoạt.")
        self.activation_hint.setVisible(visible)
        self.btn_activate.setVisible(visible)

        if visible:
            self._activate_timer.start(520)
        else:
            self._activate_timer.stop()
            self._activate_pulse_on = False

    def _tick_activate_pulse(self):
        """Pulse activation button size so CTA remains noticeable."""
        self._activate_pulse_on = not self._activate_pulse_on
        if self._activate_pulse_on:
            self.btn_activate.setFixedSize(236, 56)
        else:
            self.btn_activate.setFixedSize(230, 52)

    def show_toast(self, message: str, is_success: bool):
        """Show transient bottom toast for success/error user feedback."""
        bg = "rgba(16,185,129,0.95)" if is_success else "rgba(239,68,68,0.95)"
        self.toast_label.setStyleSheet(
            "QLabel {"
            f"background: {bg};"
            "color: white;"
            "font-size: 14px;"
            "font-weight: 700;"
            "border-radius: 12px;"
            "padding: 10px 18px;"
            "}"
        )
        self.toast_label.setText(message)
        self.toast_label.adjustSize()
        x = (self.width() - self.toast_label.width()) // 2
        y = self.height() - self.toast_label.height() - 22
        self.toast_label.move(max(12, x), max(12, y))
        self.toast_label.setVisible(True)
        self._toast_hide_timer.start(2800)

    def resizeEvent(self, event):
        """Keep toast pinned near bottom-center after resize."""
        super().resizeEvent(event)
        if self.toast_label.isVisible():
            x = (self.width() - self.toast_label.width()) // 2
            y = self.height() - self.toast_label.height() - 22
            self.toast_label.move(max(12, x), max(12, y))

    def paintEvent(self, event):
        """Paint screen background gradient."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        gradient = QLinearGradient(0, 0, self.width(), self.height())
        gradient.setColorAt(0.0, QColor("#e8f2ff"))
        gradient.setColorAt(0.5, QColor("#f0f6ff"))
        gradient.setColorAt(1.0, QColor("#e2eeff"))
        painter.fillRect(self.rect(), gradient)