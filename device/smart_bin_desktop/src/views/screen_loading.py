from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QColor, QPainter, QLinearGradient
from PyQt6.QtWidgets import QWidget, QVBoxLayout, QLabel


class ScreenLoading(QWidget):
    """Loading screen shown during runtime and backend initialization."""

    def __init__(self):
        super().__init__()
        self._spinner_frames = ["|", "/", "-", "\\"]
        self._spinner_index = 0
        self._build_ui()

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick_spinner)
        self._timer.start(120)

    def _build_ui(self):
        """Create spinner + title + message layout."""
        self.setStyleSheet("font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;")

        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        layout.setSpacing(10)

        self.spinner = QLabel("|")
        self.spinner.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.spinner.setStyleSheet("font-size: 44px; font-weight: 900; color: #2563eb; background: transparent;")

        self.title = QLabel("SMART BIN")
        self.title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.title.setStyleSheet("font-size: 42px; font-weight: 900; color: #0d3580; letter-spacing: 2px; background: transparent;")

        self.message = QLabel("Dang khoi tao he thong AI...")
        self.message.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.message.setStyleSheet("font-size: 14px; color: #426699; background: transparent;")

        layout.addWidget(self.spinner)
        layout.addWidget(self.title)
        layout.addWidget(self.message)

    def set_message(self, text: str):
        """Update loading text from ViewModel progress messages."""
        self.message.setText(text or "Dang khoi tao he thong AI...")

    def _tick_spinner(self):
        """Rotate text-based spinner frame."""
        self.spinner.setText(self._spinner_frames[self._spinner_index])
        self._spinner_index = (self._spinner_index + 1) % len(self._spinner_frames)

    def paintEvent(self, event):
        """Paint subtle loading background gradient."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        gradient = QLinearGradient(0, 0, self.width(), self.height())
        gradient.setColorAt(0.0, QColor("#edf4ff"))
        gradient.setColorAt(1.0, QColor("#f5f9ff"))
        painter.fillRect(self.rect(), gradient)
