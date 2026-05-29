from PyQt6.QtCore import Qt, pyqtSignal, QPropertyAnimation, QEasingCurve, QTimer
from PyQt6.QtGui import QColor, QImage, QPixmap, QPainter, QLinearGradient, QBrush, QPen, QPainterPath
from PyQt6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel,
                             QPushButton, QGraphicsDropShadowEffect, QGraphicsOpacityEffect)
import qrcode


class ScreenDeviceLink(QWidget):
    """Device pairing screen that displays MAC address, claim code, and QR payload."""

    back_requested = pyqtSignal()

    def __init__(self):
        super().__init__()
        self._build_ui()

    def _build_ui(self):
        """Build dual-card UI: QR on left and MAC/instructions on right."""
        self.setStyleSheet("font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;")

        root = QVBoxLayout(self)
        root.setContentsMargins(24, 20, 24, 24)
        root.setSpacing(14)

        # ── Header ───────────────────────────────────────────────
        header = QHBoxLayout()
        header.setSpacing(12)

        back_btn = QPushButton("← Quay lại")
        back_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        back_btn.setFixedHeight(40)
        back_btn.setStyleSheet("""
            QPushButton {
                background: rgba(255,255,255,0.9);
                border: none;
                border-radius: 12px;
                color: #1e4fa0;
                font-size: 14px;
                font-weight: 600;
                padding: 0 16px;
            }
            QPushButton:hover { background: #eef5ff; }
            QPushButton:pressed { background: #dbeafe; }
        """)
        back_btn.clicked.connect(self.back_requested.emit)
        back_shadow = QGraphicsDropShadowEffect()
        back_shadow.setBlurRadius(12)
        back_shadow.setColor(QColor(59, 130, 246, 50))
        back_shadow.setOffset(0, 3)
        back_btn.setGraphicsEffect(back_shadow)

        title = QLabel("Liên kết thiết bị")
        title.setStyleSheet("""
            font-size: 26px;
            font-weight: 800;
            color: #0c2a5e;
            background: transparent;
        """)

        # Status indicator
        status_w = QWidget()
        status_w.setStyleSheet("""
            QWidget {
                background: #dcfce7;
                border-radius: 10px;
                border: none;
            }
        """)
        s_lay = QHBoxLayout(status_w)
        s_lay.setContentsMargins(10, 5, 10, 5)
        s_lay.setSpacing(5)
        dot = QLabel("▪")
        dot.setStyleSheet("color: #16a34a; font-size: 10px; background: transparent;")
        s_lbl = QLabel("Sẵn sàng")
        s_lbl.setStyleSheet("font-size: 12px; font-weight: 600; color: #15803d; background: transparent;")
        s_lay.addWidget(dot)
        s_lay.addWidget(s_lbl)

        header.addWidget(back_btn, 0)
        header.addSpacing(4)
        header.addWidget(title, 1)
        header.addWidget(status_w, 0)
        root.addLayout(header)

        # ── Main content: 2 columns ───────────────────────────────
        content = QHBoxLayout()
        content.setSpacing(16)

        # LEFT: QR code card
        qr_card = QWidget()
        qr_card.setStyleSheet("""
            QWidget {
                background: #ffffff;
                border-radius: 24px;
                border: none;
            }
        """)
        qr_shadow = QGraphicsDropShadowEffect()
        qr_shadow.setBlurRadius(28)
        qr_shadow.setColor(QColor(59, 130, 246, 50))
        qr_shadow.setOffset(0, 8)
        qr_card.setGraphicsEffect(qr_shadow)

        qr_layout = QVBoxLayout(qr_card)
        qr_layout.setContentsMargins(24, 22, 24, 22)
        qr_layout.setSpacing(12)
        qr_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        qr_title_row = QHBoxLayout()
        qr_icon = QLabel("QR")
        qr_icon.setStyleSheet("""
            font-size: 10px; font-weight: 800; background: #dbeafe;
            color: #1d4ed8; border-radius: 6px; padding: 2px 5px;
        """)
        qr_title_lbl = QLabel("Quét mã QR")
        qr_title_lbl.setStyleSheet("font-size: 16px; font-weight: 700; color: #1e3a6e; background: transparent;")
        qr_title_row.addStretch()
        qr_title_row.addWidget(qr_icon)
        qr_title_row.addSpacing(6)
        qr_title_row.addWidget(qr_title_lbl)
        qr_title_row.addStretch()

        # QR frame
        qr_frame = QWidget()
        qr_frame.setFixedSize(210, 210)
        qr_frame.setStyleSheet("""
            QWidget {
                background: #f8faff;
                border: none;
                border-radius: 16px;
            }
        """)
        qr_frame_layout = QVBoxLayout(qr_frame)
        qr_frame_layout.setContentsMargins(8, 8, 8, 8)
        qr_frame_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.qr_label = QLabel()
        self.qr_label.setFixedSize(190, 190)
        self.qr_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.qr_label.setStyleSheet("background: transparent; border: none;")
        qr_frame_layout.addWidget(self.qr_label)

        qr_frame_wrap = QHBoxLayout()
        qr_frame_wrap.setAlignment(Qt.AlignmentFlag.AlignCenter)
        qr_frame_wrap.addWidget(qr_frame)

        qr_hint = QLabel("Dùng app Smart Bin để quét")
        qr_hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        qr_hint.setStyleSheet("font-size: 12px; color: #7a9cc5; background: transparent;")

        qr_layout.addLayout(qr_title_row)
        qr_layout.addLayout(qr_frame_wrap)
        qr_layout.addWidget(qr_hint)

        # RIGHT: MAC info card
        info_card = QWidget()
        info_card.setStyleSheet("""
            QWidget {
                background: #ffffff;
                border-radius: 24px;
                border: none;
            }
        """)
        info_shadow = QGraphicsDropShadowEffect()
        info_shadow.setBlurRadius(28)
        info_shadow.setColor(QColor(59, 130, 246, 50))
        info_shadow.setOffset(0, 8)
        info_card.setGraphicsEffect(info_shadow)

        info_layout = QVBoxLayout(info_card)
        info_layout.setContentsMargins(24, 22, 24, 22)
        info_layout.setSpacing(14)
        info_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        mac_title_row = QHBoxLayout()
        mac_icon = QLabel("MAC")
        mac_icon.setStyleSheet("""
            font-size: 10px; font-weight: 800; background: #dbeafe;
            color: #1d4ed8; border-radius: 6px; padding: 2px 5px;
        """)
        mac_title_lbl = QLabel("Địa chỉ MAC")
        mac_title_lbl.setStyleSheet("font-size: 16px; font-weight: 700; color: #1e3a6e; background: transparent;")
        mac_title_row.addStretch()
        mac_title_row.addWidget(mac_icon)
        mac_title_row.addSpacing(6)
        mac_title_row.addWidget(mac_title_lbl)
        mac_title_row.addStretch()

        # MAC display box
        mac_box = QWidget()
        mac_box.setStyleSheet("""
            QWidget {
                background: #f4f9ff;
                border-radius: 14px;
                border: none;
            }
        """)
        mac_box_layout = QVBoxLayout(mac_box)
        mac_box_layout.setContentsMargins(16, 12, 16, 12)
        mac_box_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.mac_label = QLabel("--:--:--:--:--:--")
        self.mac_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.mac_label.setStyleSheet("""
            font-size: 22px;
            font-weight: 800;
            color: #0e2b5e;
            background: transparent;
            letter-spacing: 2px;
            font-family: 'Courier New', monospace;
        """)
        mac_box_layout.addWidget(self.mac_label)

        # Claim code display box
        claim_box = QWidget()
        claim_box.setStyleSheet("""
            QWidget {
                background: #eff6ff;
                border-radius: 14px;
                border: 1px solid #dbeafe;
            }
        """)
        claim_box_layout = QVBoxLayout(claim_box)
        claim_box_layout.setContentsMargins(16, 12, 16, 12)
        claim_box_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        claim_caption = QLabel("Claim code")
        claim_caption.setAlignment(Qt.AlignmentFlag.AlignCenter)
        claim_caption.setStyleSheet("""
            font-size: 12px;
            font-weight: 700;
            color: #4a6590;
            background: transparent;
            letter-spacing: 0.3px;
        """)
        self.claim_label = QLabel("------")
        self.claim_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.claim_label.setStyleSheet("""
            font-size: 26px;
            font-weight: 800;
            color: #1d4ed8;
            background: transparent;
            letter-spacing: 3px;
            font-family: 'Courier New', monospace;
        """)
        claim_box_layout.addWidget(claim_caption)
        claim_box_layout.addWidget(self.claim_label)

        # Info items: short letter icons in small pill badges for a native look.
        def info_row(icon, label, value_style=""):
            row = QWidget()
            row.setStyleSheet("""
                QWidget {
                    background: #f8faff;
                    border-radius: 10px;
                    border: none;
                }
            """)
            rl = QHBoxLayout(row)
            rl.setContentsMargins(12, 8, 12, 8)
            rl.setSpacing(8)
            # Badge icon: fixed-size pill with soft color for visual consistency.
            ico = QLabel(icon)
            ico.setFixedSize(20, 20)
            ico.setAlignment(Qt.AlignmentFlag.AlignCenter)
            ico.setStyleSheet(
                "font-size: 11px; font-weight: 700; color: #1d4ed8; "
                "background: #dbeafe; border-radius: 5px; border: none;"
            )
            lbl = QLabel(label)
            lbl.setStyleSheet(f"font-size: 13px; color: #4a6590; background: transparent; border: none; {value_style}")
            rl.addWidget(ico)
            rl.addWidget(lbl, 1)
            return row

        info_layout.addLayout(mac_title_row)
        info_layout.addWidget(mac_box)
        info_layout.addWidget(claim_box)
        info_layout.addWidget(info_row("~", "Kết nối qua Bluetooth / Wi-Fi"))
        info_layout.addWidget(info_row("#", "Mã hóa TLS bảo mật"))
        info_layout.addWidget(info_row("i", "Nội dung QR = địa chỉ MAC"))
        info_layout.addStretch()

        content.addWidget(qr_card, 1)
        content.addWidget(info_card, 1)
        root.addLayout(content, 1)

    def paintEvent(self, event):
        """Draw gradient background for visual depth."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        gradient = QLinearGradient(0, 0, self.width(), self.height())
        gradient.setColorAt(0.0, QColor("#eaf2ff"))
        gradient.setColorAt(1.0, QColor("#f5f0ff"))
        painter.fillRect(self.rect(), gradient)

    def update_mac_and_qr(self, mac_address: str, claim_code: str):
        """Refresh MAC label, claim code, and regenerate QR image from provided address."""
        # QR content is exactly MAC so mobile app can bind this desktop device.
        self.mac_label.setText(mac_address)
        self.claim_label.setText(claim_code)
        pixmap = self._build_qr_pixmap(mac_address)
        self.qr_label.setPixmap(pixmap)

    def _build_qr_pixmap(self, content: str) -> QPixmap:
        # Build QR manually then scale to fit label while keeping sharp edges.
        qr = qrcode.QRCode(version=1, box_size=10, border=2)
        qr.add_data(content)
        qr.make(fit=True)
        matrix = qr.get_matrix()

        size = len(matrix)
        image = QImage(size, size, QImage.Format.Format_RGB32)
        white = QColor("#ffffff").rgb()
        dark = QColor("#0f2b5b").rgb()

        for y in range(size):
            for x in range(size):
                image.setPixel(x, y, dark if matrix[y][x] else white)

        return QPixmap.fromImage(image).scaled(
            self.qr_label.width(),
            self.qr_label.height(),
            Qt.AspectRatioMode.KeepAspectRatio,
            Qt.TransformationMode.SmoothTransformation,
        )