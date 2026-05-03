from PyQt6.QtWidgets import QWidget, QVBoxLayout, QLabel, QGraphicsDropShadowEffect, QGraphicsOpacityEffect, QHBoxLayout, QPushButton
from PyQt6.QtCore import Qt, QPropertyAnimation, QEasingCurve, QTimer, QPoint, QRect, pyqtSignal
from PyQt6.QtGui import QPainter, QLinearGradient, QColor, QBrush, QPen
import random
import math


class ConfettiParticle:
    """Small particle model used by confetti overlay animation."""

    def __init__(self, x, y):
        colors = ["#60a5fa", "#34d399", "#fbbf24", "#f472b6", "#a78bfa", "#fb7185"]
        self.x = float(x)
        self.y = float(y)
        self.color = QColor(random.choice(colors))
        self.vx = random.uniform(-3, 3)
        self.vy = random.uniform(-8, -2)
        self.gravity = 0.25
        self.size = random.randint(6, 12)
        self.rotation = random.uniform(0, 360)
        self.rot_speed = random.uniform(-5, 5)
        self.alpha = 1.0
        self.shape = random.choice(["rect", "circle"])

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.vy += self.gravity
        self.rotation += self.rot_speed
        if self.y > 500:
            self.alpha -= 0.05
        return self.alpha > 0


class ConfettiWidget(QWidget):
    """Transparent overlay widget that renders celebration particles."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.particles = []
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)

    def burst(self, cx, cy):
        # Create a short burst, then timer drives particle simulation frames.
        for _ in range(60):
            self.particles.append(ConfettiParticle(cx, cy))
        self._timer.start(16)

    def _tick(self):
        self.particles = [p for p in self.particles if p.update()]
        self.update()
        if not self.particles:
            self._timer.stop()

    def paintEvent(self, event):
        if not self.particles:
            return
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        for p in self.particles:
            color = QColor(p.color)
            color.setAlphaF(p.alpha)
            painter.setBrush(QBrush(color))
            painter.setPen(Qt.PenStyle.NoPen)
            painter.save()
            painter.translate(p.x, p.y)
            painter.rotate(p.rotation)
            if p.shape == "rect":
                painter.drawRect(-p.size // 2, -p.size // 4, p.size, p.size // 2)
            else:
                painter.drawEllipse(-p.size // 2, -p.size // 2, p.size, p.size)
            painter.restore()


class ScreenThanks(QWidget):
    """Thank-you screen shown after user sends correctness feedback."""

    close_requested = pyqtSignal()

    def __init__(self):
        super().__init__()
        self._build_ui()

    def _build_ui(self):
        """Build centered card UI and initialize confetti overlay."""
        self.setStyleSheet("font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 28, 28, 28)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Main card
        self.card = QWidget()
        self.card.setStyleSheet("""
            QWidget {
                background: rgba(255,255,255,0.96);
                border-radius: 32px;
                border: none;
            }
        """)
        card_shadow = QGraphicsDropShadowEffect()
        card_shadow.setBlurRadius(40)
        card_shadow.setColor(QColor(59, 130, 246, 60))
        card_shadow.setOffset(0, 12)
        self.card.setGraphicsEffect(card_shadow)

        card_layout = QVBoxLayout(self.card)
        card_layout.setContentsMargins(28, 18, 28, 24)
        card_layout.setSpacing(16)
        card_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        top_row = QHBoxLayout()
        top_row.addStretch()
        close_btn = QPushButton("×")
        close_btn.setFixedSize(34, 34)
        close_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        close_btn.setStyleSheet("""
            QPushButton {
                background: #f1f5f9;
                color: #426699;
                border: none;
                border-radius: 17px;
                font-size: 20px;
                font-weight: 700;
            }
            QPushButton:hover { background: #dbeafe; color: #1d4ed8; }
            QPushButton:pressed { background: #bfdbfe; }
        """)
        close_btn.clicked.connect(self.close_requested.emit)
        top_row.addWidget(close_btn)
        card_layout.addLayout(top_row)

        # Checkmark icon with gradient bg
        self.icon_widget = QWidget()
        self.icon_widget.setFixedSize(100, 100)
        self.icon_widget.setStyleSheet("""
            QWidget {
                background: qlineargradient(x1:0,y1:0,x2:1,y2:1,
                    stop:0 #a7f3d0, stop:1 #6ee7b7);
                border-radius: 50px;
                border: none;
            }
        """)
        icon_shadow = QGraphicsDropShadowEffect()
        icon_shadow.setBlurRadius(24)
        icon_shadow.setColor(QColor(52, 211, 153, 120))
        icon_shadow.setOffset(0, 8)
        self.icon_widget.setGraphicsEffect(icon_shadow)

        icon_inner = QVBoxLayout(self.icon_widget)
        icon_inner.setAlignment(Qt.AlignmentFlag.AlignCenter)
        check = QLabel("OK")
        check.setStyleSheet("font-size: 28px; font-weight: 900; color: #065f46; background: transparent; font-family: 'Segoe UI', sans-serif; letter-spacing: 1px;")
        check.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_inner.addWidget(check)

        icon_wrap = QHBoxLayout()
        icon_wrap.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_wrap.addWidget(self.icon_widget)

        # Title
        self.title = QLabel("Cảm ơn bạn!")
        self.title.setStyleSheet("""
            font-size: 40px;
            font-weight: 900;
            color: #0d3580;
            background: transparent;
            letter-spacing: 1px;
        """)
        self.title.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Subtitle
        subtitle = QLabel("Phản hồi của bạn giúp AI thông minh hơn mỗi ngày")
        subtitle.setStyleSheet("""
            font-size: 18px;
            color: #4a72b0;
            background: transparent;
            font-weight: 500;
        """)
        subtitle.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Stats row
        stats_row = QWidget()
        stats_row.setStyleSheet("""
            QWidget {
                background: #f0f7ff;
                border-radius: 16px;
                border: none;
            }
        """)
        stats_layout = QHBoxLayout(stats_row)
        stats_layout.setContentsMargins(20, 14, 20, 14)
        stats_layout.setSpacing(0)

        def make_stat(badge_text, value, label):
            """Stat block: top pill badge, large value in middle, small label below."""
            w = QWidget()
            w.setStyleSheet("background: transparent;")
            vl = QVBoxLayout(w)
            vl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            vl.setSpacing(4)
            # Pill badge with short text on a soft blue background.
            badge = QLabel(badge_text)
            badge.setFixedHeight(22)
            badge.setAlignment(Qt.AlignmentFlag.AlignCenter)
            badge.setStyleSheet(
                "font-size: 11px; font-weight: 800; color: #1d4ed8; "
                "background: #dbeafe; border-radius: 6px; padding: 0 8px; border: none;"
            )
            badge_wrap = QHBoxLayout()
            badge_wrap.setAlignment(Qt.AlignmentFlag.AlignCenter)
            badge_wrap.addWidget(badge)
            # Large numeric/text value.
            val = QLabel(value)
            val.setStyleSheet("font-size: 18px; font-weight: 800; color: #1e40af; background: transparent;")
            val.setAlignment(Qt.AlignmentFlag.AlignCenter)
            # Descriptive caption label.
            lbl = QLabel(label)
            lbl.setStyleSheet("font-size: 11px; color: #64748b; background: transparent;")
            lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            vl.addLayout(badge_wrap)
            vl.addWidget(val)
            vl.addWidget(lbl)
            return w

        sep = QWidget()
        sep.setFixedWidth(1)
        sep.setStyleSheet("background: #cbd5e1;")

        stats_layout.addWidget(make_stat("MẪU", "+1", "Huấn luyện"), 1)
        stats_layout.addWidget(sep)
        stats_layout.addWidget(make_stat("AI", "HỌC", "Đang cải thiện"), 1)

        card_layout.addLayout(icon_wrap)
        card_layout.addWidget(self.title)
        card_layout.addWidget(subtitle)
        card_layout.addSpacing(8)
        card_layout.addWidget(stats_row)

        layout.addWidget(self.card)

        # Confetti overlay (covers whole widget)
        self._confetti = ConfettiWidget(self)
        self._confetti.resize(800, 480)

    def showEvent(self, event):
        """Start confetti sequence whenever this screen becomes visible."""
        super().showEvent(event)
        # Trigger confetti after a brief delay
        QTimer.singleShot(200, self._fire_confetti)

        card_shadow = QGraphicsDropShadowEffect()
        card_shadow.setBlurRadius(40)
        card_shadow.setColor(QColor(59, 130, 246, 60))
        card_shadow.setOffset(0, 12)
        self.card.setGraphicsEffect(card_shadow)

    def _fire_confetti(self):
        # Overlay is raised so particles render above the thank-you card.
        cx = self.width() // 2
        cy = self.height() // 2
        self._confetti.resize(self.width(), self.height())
        self._confetti.burst(cx, cy)
        self._confetti.raise_()

    def paintEvent(self, event):
        """Paint soft celebratory background gradient."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        gradient = QLinearGradient(0, 0, self.width(), self.height())
        gradient.setColorAt(0.0, QColor("#eafff7"))
        gradient.setColorAt(0.5, QColor("#f0faff"))
        gradient.setColorAt(1.0, QColor("#f0f7ff"))
        painter.fillRect(self.rect(), gradient)