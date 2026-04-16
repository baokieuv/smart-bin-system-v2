"""
dialog_wifi_config.py
---------------------
Wi-Fi configuration dialog for Smart Bin.

The connection flow always verifies actual connectivity:
    1. Call connect (saved profile or with password).
    2. After connect returns, do NOT trust ok/msg immediately.
    3. Rescan networks and call get_connected_ssid() to verify
         whether the device is truly connected to the target SSID.
    4. Update UI based on verified network state.

UI direction focuses on native/clean behavior:
    - Avoid complex emoji icons in controls.
    - Keep consistent colors and icon style.
    - Make loading/connection status explicit to avoid confusion.
"""

from PyQt6.QtCore import Qt, pyqtSignal, QTimer, QPoint, QPropertyAnimation, QEasingCurve
from PyQt6.QtGui import QColor, QPainter, QLinearGradient, QBrush
from PyQt6.QtWidgets import (
    QApplication,
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QWidget,
    QScrollArea,
    QPushButton,
    QLineEdit,
    QFrame,
)

from src.services.wifi_service import WifiService


# ---------------------------------------------------------------------------
# Helpers / base widgets
# ---------------------------------------------------------------------------

class _BaseButton(QPushButton):
    """
    QPushButton with subtle press animation (moves 1px vertically).
    Used as a base class to avoid animation code duplication.
    """
    def __init__(self, text: str, parent=None):
        super().__init__(text, parent)
        self._anim: QPropertyAnimation | None = None

    def mousePressEvent(self, event):
        self._play_press_anim()
        return super().mousePressEvent(event)

    def _play_press_anim(self):
        """Play subtle press animation: move down 1px then back."""
        origin = self.pos()
        pressed = QPoint(origin.x(), origin.y() + 1)
        anim = QPropertyAnimation(self, b"pos", self)
        anim.setDuration(100)
        anim.setStartValue(origin)
        anim.setKeyValueAt(0.5, pressed)
        anim.setEndValue(origin)
        anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        anim.start()
        self._anim = anim  # Keep reference to prevent garbage collection.


def _make_divider() -> QFrame:
    """Create a subtle horizontal divider between cards."""
    line = QFrame()
    line.setFrameShape(QFrame.Shape.HLine)
    line.setStyleSheet("color: #e2e8f0; background: #e2e8f0; max-height: 1px;")
    return line


# ---------------------------------------------------------------------------
# Password dialog
# ---------------------------------------------------------------------------

class WifiPasswordDialog(QDialog):
    """
    Wi-Fi password input dialog.
    Displays selected SSID and allows toggling password visibility.
    """
    def __init__(self, ssid: str, parent=None):
        super().__init__(parent)
        self._password = ""
        self._pw_visible = False
        self._build_ui(ssid)

    def _build_ui(self, ssid: str):
        self.setWindowTitle("Nhập mật khẩu Wi-Fi")
        self.setModal(True)
        self.setFixedSize(380, 190)
        self.setStyleSheet("""
            QDialog {
                background: #ffffff;
                border-radius: 16px;
            }
            QLabel {
                color: #1e293b;
                background: transparent;
            }
            QLineEdit {
                background: #f8fafc;
                color: #0f172a;
                border: 1.5px solid #e2e8f0;
                border-radius: 10px;
                padding: 9px 12px;
                font-size: 13px;
                font-family: 'Segoe UI', sans-serif;
            }
            QLineEdit:focus {
                border: 1.5px solid #3b82f6;
                background: #ffffff;
            }
        """)

        root = QVBoxLayout(self)
        root.setContentsMargins(20, 18, 20, 18)
        root.setSpacing(14)

        # --- Header ---
        header = QHBoxLayout()
        header.setSpacing(10)

        # Network icon (text symbol instead of complex emoji).
        icon_box = QLabel("W")
        icon_box.setFixedSize(36, 36)
        icon_box.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_box.setStyleSheet("""
            background: #dbeafe;
            border-radius: 10px;
            color: #1d4ed8;
            font-size: 14px;
            font-weight: 800;
        """)
        header.addWidget(icon_box)

        title_col = QVBoxLayout()
        title_col.setSpacing(1)
        title_lbl = QLabel("Kết nối Wi-Fi")
        title_lbl.setStyleSheet("font-size: 14px; font-weight: 700; color: #0f172a;")
        ssid_lbl = QLabel(ssid)
        ssid_lbl.setStyleSheet("font-size: 12px; color: #64748b;")
        title_col.addWidget(title_lbl)
        title_col.addWidget(ssid_lbl)
        header.addLayout(title_col)
        header.addStretch()
        root.addLayout(header)

        root.addWidget(_make_divider())

        # --- Password input ---
        pw_row = QHBoxLayout()
        pw_row.setSpacing(8)

        self.password_input = QLineEdit()
        self.password_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_input.setPlaceholderText("Mật khẩu Wi-Fi")
        self.password_input.returnPressed.connect(self._accept)
        pw_row.addWidget(self.password_input, 1)

        # Toggle uses text labels instead of an eye emoji.
        self.eye_btn = _BaseButton("Hiện")
        self.eye_btn.setFixedWidth(54)
        self.eye_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.eye_btn.setStyleSheet("""
            QPushButton {
                background: #f1f5f9;
                color: #475569;
                border: 1.5px solid #e2e8f0;
                border-radius: 10px;
                font-size: 12px;
                font-weight: 600;
            }
            QPushButton:hover { background: #e2e8f0; }
        """)
        self.eye_btn.clicked.connect(self._toggle_pw_visibility)
        pw_row.addWidget(self.eye_btn)
        root.addLayout(pw_row)

        # --- Action buttons ---
        btn_row = QHBoxLayout()
        btn_row.setSpacing(10)

        btn_cancel = _BaseButton("Hủy")
        btn_cancel.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_cancel.setStyleSheet("""
            QPushButton {
                background: #f1f5f9;
                color: #475569;
                border: none;
                border-radius: 10px;
                padding: 9px 14px;
                font-weight: 600;
                font-size: 13px;
            }
            QPushButton:hover { background: #e2e8f0; }
        """)
        btn_cancel.clicked.connect(self.reject)

        btn_ok = _BaseButton("Kết nối")
        btn_ok.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_ok.setStyleSheet("""
            QPushButton {
                background: #2563eb;
                color: white;
                border: none;
                border-radius: 10px;
                padding: 9px 14px;
                font-weight: 700;
                font-size: 13px;
            }
            QPushButton:hover { background: #1d4ed8; }
            QPushButton:pressed { background: #1e40af; }
        """)
        btn_ok.clicked.connect(self._accept)

        btn_row.addWidget(btn_cancel)
        btn_row.addWidget(btn_ok, 1)
        root.addLayout(btn_row)

    def _toggle_pw_visibility(self):
        """Toggle password visibility."""
        self._pw_visible = not self._pw_visible
        mode = QLineEdit.EchoMode.Normal if self._pw_visible else QLineEdit.EchoMode.Password
        self.password_input.setEchoMode(mode)
        self.eye_btn.setText("Ẩn" if self._pw_visible else "Hiện")

    def _accept(self):
        """Confirm connection; highlight input red when password is empty."""
        pw = self.password_input.text().strip()
        if not pw:
            self.password_input.setStyleSheet("""
                background: #fff5f5;
                color: #0f172a;
                border: 1.5px solid #ef4444;
                border-radius: 10px;
                padding: 9px 12px;
                font-size: 13px;
            """)
            return
        self._password = pw
        self.accept()

    def password(self) -> str:
        return self._password


# ---------------------------------------------------------------------------
# WifiCard - one network row in the list
# ---------------------------------------------------------------------------

class WifiCard(QWidget):
    """
    Widget representing one Wi-Fi network in the list.

        Layout structure:
            WifiCard (outer - border + background only, no padding/content)
                └── _inner (QWidget - all content, transparent background)
              └── QHBoxLayout: [icon | info_col | badge | btn_connect | btn_forget]

    Outer/inner split ensures border styles apply only to the outer card,
    without cascading into inner child widgets.

    Click effect: QPropertyAnimation on maximumHeight (squeeze then release)
    with a light flash effect.

    Signals:
        selected(ssid): user clicked this card.
        connect_requested(ssid): user clicked Connect.
        forget_requested(ssid): user clicked Forget.
    """
    selected = pyqtSignal(str)
    connect_requested = pyqtSignal(str)
    forget_requested = pyqtSignal(str)

    # Default card height
    _CARD_H = 60

    def __init__(self, network: dict, parent=None):
        super().__init__(parent)
        self.network = network
        self._is_selected = False
        self._click_anim: QPropertyAnimation | None = None
        self._build_ui()

    def _build_ui(self):
        # ── Outer wrapper: only draws border + background ─────────────────────
        # Do not set padding here; keep padding in _inner so border remains clean.
        self.setObjectName("wifiCardOuter")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFixedHeight(self._CARD_H)

        outer_layout = QVBoxLayout(self)
        outer_layout.setContentsMargins(0, 0, 0, 0)
        outer_layout.setSpacing(0)

        # ── Inner container: holds all content, transparent background ─────────
        # Use a dedicated objectName so styles do not collide with outer.
        self._inner = QWidget()
        self._inner.setObjectName("wifiCardInner")
        self._inner.setStyleSheet("QWidget#wifiCardInner { background: transparent; }")
        outer_layout.addWidget(self._inner)

        row = QHBoxLayout(self._inner)
        row.setContentsMargins(12, 10, 12, 10)
        row.setSpacing(12)

        # ── Icon: "W" + security badge at bottom-right ───────────────────────
        icon_wrap = QWidget()
        icon_wrap.setFixedSize(40, 40)
        # Keep transparent so outer card controls background color.
        icon_wrap.setStyleSheet("background: transparent;")

        icon_lbl = QLabel("W", icon_wrap)
        icon_lbl.setFixedSize(40, 40)
        icon_lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon_lbl.setStyleSheet(
            "background: #dbeafe; border-radius: 10px; "
            "color: #1d4ed8; font-size: 14px; font-weight: 800; "
            "font-family: 'Segoe UI', sans-serif; border: none;"
        )

        is_secure = self.network.get("secure", True)
        badge_text   = "S" if is_secure else "O"
        badge_color  = "#1d4ed8" if is_secure else "#dc2626"
        badge_bg     = "#eff6ff" if is_secure else "#fff5f5"

        sec_badge = QLabel(badge_text, icon_wrap)
        sec_badge.setFixedSize(14, 14)
        sec_badge.setAlignment(Qt.AlignmentFlag.AlignCenter)
        sec_badge.setStyleSheet(
            f"font-size: 8px; font-weight: 800; color: {badge_color}; "
            f"background: {badge_bg}; border: 1px solid {badge_color}; "
            "border-radius: 7px;"
        )
        sec_badge.move(27, 27)

        row.addWidget(icon_wrap)

        # ── Network info: SSID + security status ─────────────────────────────
        info_col = QVBoxLayout()
        info_col.setSpacing(2)

        self.ssid_lbl = QLabel(self.network["ssid"])
        self.ssid_lbl.setStyleSheet(
            "font-size: 13px; font-weight: 700; color: #0f172a; "
            "background: transparent; border: none;"
        )

        sec_text = "Bảo mật" if is_secure else "Mạng mở (không mật khẩu)"
        self.meta_lbl = QLabel(sec_text)
        self.meta_lbl.setStyleSheet(
            "font-size: 11px; color: #64748b; background: transparent; border: none;"
        )

        info_col.addWidget(self.ssid_lbl)
        info_col.addWidget(self.meta_lbl)
        row.addLayout(info_col, 1)

        # ── "Connected" badge ────────────────────────────────────────────────
        self.connected_badge = QLabel("Đang kết nối")
        self.connected_badge.setStyleSheet(
            "font-size: 11px; font-weight: 600; color: #065f46; "
            "background: #d1fae5; border-radius: 8px; padding: 3px 9px; border: none;"
        )
        self.connected_badge.setVisible(bool(self.network.get("connected")))
        row.addWidget(self.connected_badge)

        # ── Connect button ────────────────────────────────────────────────────
        self.btn_connect = _BaseButton("Kết nối")
        self.btn_connect.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_connect.setFixedHeight(32)
        self.btn_connect.setStyleSheet("""
            QPushButton {
                background: #2563eb;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 0 14px;
                font-size: 12px;
                font-weight: 600;
                min-width: 72px;
            }
            QPushButton:hover  { background: #1d4ed8; }
            QPushButton:pressed { background: #1e40af; }
        """)
        self.btn_connect.clicked.connect(
            lambda: self.connect_requested.emit(self.network["ssid"])
        )
        self.btn_connect.setVisible(not bool(self.network.get("connected")))
        row.addWidget(self.btn_connect)

        # ── Forget button ─────────────────────────────────────────────────────
        self.btn_forget = _BaseButton("Quên")
        self.btn_forget.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_forget.setFixedHeight(32)
        self.btn_forget.setStyleSheet("""
            QPushButton {
                background: #fff5f5;
                color: #dc2626;
                border: 1px solid #fca5a5;
                border-radius: 8px;
                padding: 0 12px;
                font-size: 12px;
                font-weight: 600;
                min-width: 52px;
            }
            QPushButton:hover  { background: #fee2e2; }
            QPushButton:pressed { background: #fecaca; }
        """)
        self.btn_forget.clicked.connect(
            lambda: self.forget_requested.emit(self.network["ssid"])
        )
        self.btn_forget.setVisible(bool(self.network.get("saved", False)))
        row.addWidget(self.btn_forget)

        # Apply initial style (unselected).
        self._apply_style()

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    def set_selected(self, selected: bool):
        """Update visual state when card is selected/unselected."""
        self._is_selected = selected
        self._apply_style()

    # -------------------------------------------------------------------------
    # Style: apply only to outer widget, DO NOT use wildcard selector
    # -------------------------------------------------------------------------

    def _apply_style(self):
        """
        Apply border + background strictly to outer card.

        Use selector 'QWidget#wifiCardOuter' instead of wildcard 'QWidget'
        to avoid style cascading into inner child widgets.
        """
        if self._is_selected:
            self.setStyleSheet("""
                QWidget#wifiCardOuter {
                    background: #eff6ff;
                    border: 1.5px solid #3b82f6;
                    border-radius: 12px;
                }
            """)
        else:
            self.setStyleSheet("""
                QWidget#wifiCardOuter {
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                }
                QWidget#wifiCardOuter:hover {
                    background: #f8fafc;
                    border-color: #cbd5e1;
                }
            """)

    # -------------------------------------------------------------------------
    # Click animation
    # -------------------------------------------------------------------------

    def _play_click_animation(self):
        """
        Click effect: card squeezes then expands back.
        Animate maximumHeight + minimumHeight together.
        """
        normal_h = self._CARD_H
        pressed_h = int(normal_h * 0.88)  # Shrink ~12%

        # Animate maximumHeight: normal → pressed → normal
        anim = QPropertyAnimation(self, b"maximumHeight", self)
        anim.setDuration(160)
        anim.setStartValue(normal_h)
        anim.setKeyValueAt(0.45, pressed_h)
        anim.setEndValue(normal_h)
        anim.setEasingCurve(QEasingCurve.Type.OutCubic)

        # Animate minimumHeight in parallel to keep layout stable.
        anim2 = QPropertyAnimation(self, b"minimumHeight", self)
        anim2.setDuration(160)
        anim2.setStartValue(normal_h)
        anim2.setKeyValueAt(0.45, pressed_h)
        anim2.setEndValue(normal_h)
        anim2.setEasingCurve(QEasingCurve.Type.OutCubic)

        anim.start()
        anim2.start()
        # Keep references to avoid garbage collection mid-animation.
        self._click_anim = anim
        self._click_anim2 = anim2

    # -------------------------------------------------------------------------
    # Events
    # -------------------------------------------------------------------------

    def mousePressEvent(self, event):
        """Emit selected signal and trigger click animation."""
        self._play_click_animation()
        self.selected.emit(self.network["ssid"])
        return super().mousePressEvent(event)


# ---------------------------------------------------------------------------
# Status bar - strip shown beneath the network list
# ---------------------------------------------------------------------------

class _StatusBar(QWidget):
    """
    Widget displaying idle/loading/success/error state.
    Uses colored indicator + text (no emoji).
    """

    # Colors per state
    _STYLES = {
        "idle":    ("#64748b", "#f8fafc", "#e2e8f0"),   # text, bg, border
        "loading": ("#2563eb", "#eff6ff", "#bfdbfe"),
        "success": ("#065f46", "#d1fae5", "#6ee7b7"),
        "error":   ("#dc2626", "#fff5f5", "#fca5a5"),
    }

    def __init__(self, parent=None):
        super().__init__(parent)
        self._build_ui()

    def _build_ui(self):
        root = QHBoxLayout(self)
        root.setContentsMargins(12, 7, 12, 7)
        root.setSpacing(8)

        # Colored dot indicator
        self._dot = QLabel("●")
        self._dot.setStyleSheet("font-size: 8px; background: transparent;")
        root.addWidget(self._dot)

        self._text = QLabel("")
        self._text.setStyleSheet("font-size: 12px; background: transparent;")
        root.addWidget(self._text, 1)

        self._set_state("idle", "")

    def _set_state(self, state: str, message: str):
        """Apply state (idle/loading/success/error) with matching message."""
        text_c, bg_c, border_c = self._STYLES.get(state, self._STYLES["idle"])
        self.setStyleSheet(f"""
            QWidget {{
                background: {bg_c};
                border: 1px solid {border_c};
                border-radius: 8px;
            }}
        """)
        self._dot.setStyleSheet(f"font-size: 8px; color: {text_c}; background: transparent;")
        self._text.setStyleSheet(f"font-size: 12px; color: {text_c}; background: transparent;")
        self._text.setText(message)

    def set_idle(self, msg: str = ""):
        self._set_state("idle", msg)

    def set_loading(self, msg: str):
        self._set_state("loading", msg)

    def set_success(self, msg: str):
        self._set_state("success", msg)

    def set_error(self, msg: str):
        self._set_state("error", msg)


# ---------------------------------------------------------------------------
# Main dialog
# ---------------------------------------------------------------------------

class WifiConfigDialog(QDialog):
    """
     End-to-end Wi-Fi management dialog.

     Connection flow (prevents false success UI states):
        1. Call wifi_service.connect_*() - some OS/drivers may report success early.
        2. After connect returns, wait briefly before verification.
        3. Verify by rescanning + checking get_connected_ssid().
        4. Show success only when verified SSID matches expected SSID.

     This guarantees UI reflects actual connectivity even with wrong passwords,
     fallback behavior, or delayed OS state updates.
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.wifi_service = WifiService()
        self.selected_ssid: str | None = None
        self.networks: list[dict] = []
        self.cards: list[WifiCard] = []

        # SSID pending post-connect verification.
        self._pending_verify_ssid: str | None = None

        # Spinner animation frames
        self._spinner_frames = ["|", "/", "-", "\\"]
        self._spinner_idx = 0
        self._spinner_timer = QTimer(self)
        self._spinner_timer.timeout.connect(self._tick_spinner)

        self._build_ui()
        self.refresh_networks()

    def _build_ui(self):
        self.setWindowTitle("Cấu hình Wi-Fi")
        self.setModal(True)
        self.resize(480, 440)
        self.setStyleSheet("""
            QDialog {
                background: #f8fafc;
                font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
            }
            QLabel { background: transparent; }
            QPushButton {
                font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
            }
        """)

        root = QVBoxLayout(self)
        root.setContentsMargins(20, 18, 20, 18)
        root.setSpacing(12)

        # ── Header ───────────────────────────────────────────────────────────
        header = QHBoxLayout()
        header.setSpacing(12)

        # Header icon (text glyph instead of emoji)
        title_icon = QLabel("Wi-Fi")
        title_icon.setFixedHeight(32)
        title_icon.setStyleSheet("""
            background: #dbeafe;
            border-radius: 8px;
            color: #1d4ed8;
            font-size: 11px;
            font-weight: 800;
            padding: 0 10px;
        """)
        title_icon.setAlignment(Qt.AlignmentFlag.AlignCenter)

        title_lbl = QLabel("Chọn mạng Wi-Fi")
        title_lbl.setStyleSheet("font-size: 16px; font-weight: 800; color: #0f172a;")

        header.addWidget(title_icon)
        header.addWidget(title_lbl)
        header.addStretch()

        # Platform badge
        self.platform_badge = QLabel("")
        self.platform_badge.setStyleSheet("""
            font-size: 11px;
            color: #475569;
            background: #e2e8f0;
            border-radius: 6px;
            padding: 2px 8px;
        """)
        header.addWidget(self.platform_badge)

        root.addLayout(header)
        root.addWidget(_make_divider())

        # ── Loading indicator ─────────────────────────────────────────────────
        self._loading_row = QHBoxLayout()
        self._loading_row.setSpacing(8)
        self._loading_row.setAlignment(Qt.AlignmentFlag.AlignLeft)

        self._spinner_lbl = QLabel("")
        self._spinner_lbl.setStyleSheet("font-size: 13px; font-weight: 800; color: #2563eb; min-width: 16px;")
        self._spinner_lbl.setVisible(False)

        self._loading_msg = QLabel("")
        self._loading_msg.setStyleSheet("font-size: 12px; color: #2563eb;")
        self._loading_msg.setVisible(False)

        self._loading_row.addWidget(self._spinner_lbl)
        self._loading_row.addWidget(self._loading_msg)
        root.addLayout(self._loading_row)

        # ── Scroll area containing network cards ─────────────────────────────
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QFrame.Shape.NoFrame)
        self.scroll.setStyleSheet("""
            QScrollArea {
                background: transparent;
                border: none;
            }
            QScrollBar:vertical {
                background: #f1f5f9;
                width: 6px;
                border-radius: 3px;
            }
            QScrollBar::handle:vertical {
                background: #cbd5e1;
                border-radius: 3px;
                min-height: 20px;
            }
            QScrollBar::handle:vertical:hover { background: #94a3b8; }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
                height: 0px;
            }
        """)

        self._scroll_content = QWidget()
        self._scroll_content.setStyleSheet("background: transparent;")
        self._card_layout = QVBoxLayout(self._scroll_content)
        self._card_layout.setContentsMargins(0, 0, 0, 0)
        self._card_layout.setSpacing(6)
        self._card_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.scroll.setWidget(self._scroll_content)
        root.addWidget(self.scroll, 1)

        # ── Status bar ────────────────────────────────────────────────────────
        self._status = _StatusBar()
        self._status.setVisible(False)
        root.addWidget(self._status)

        root.addWidget(_make_divider())

        # ── Action buttons ────────────────────────────────────────────────────
        btn_row = QHBoxLayout()
        btn_row.setSpacing(10)

        self.btn_refresh = _BaseButton("Quét lại")
        self.btn_refresh.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_refresh.setFixedHeight(38)
        self.btn_refresh.setStyleSheet("""
            QPushButton {
                background: #f1f5f9;
                color: #334155;
                border: 1px solid #cbd5e1;
                border-radius: 10px;
                padding: 0 18px;
                font-size: 13px;
                font-weight: 600;
            }
            QPushButton:hover { background: #e2e8f0; }
            QPushButton:disabled {
                background: #f8fafc;
                color: #94a3b8;
                border-color: #e2e8f0;
            }
        """)
        self.btn_refresh.clicked.connect(self.refresh_networks)

        self.btn_close = _BaseButton("Đóng")
        self.btn_close.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_close.setFixedHeight(38)
        self.btn_close.setStyleSheet("""
            QPushButton {
                background: #2563eb;
                color: white;
                border: none;
                border-radius: 10px;
                padding: 0 22px;
                font-size: 13px;
                font-weight: 700;
            }
            QPushButton:hover { background: #1d4ed8; }
        """)
        self.btn_close.clicked.connect(self.reject)

        btn_row.addWidget(self.btn_refresh)
        btn_row.addStretch()
        btn_row.addWidget(self.btn_close)
        root.addLayout(btn_row)

    # -------------------------------------------------------------------------
    # Network scanning
    # -------------------------------------------------------------------------

    def refresh_networks(self):
        """
        Rescan available Wi-Fi networks and rebuild the card list.
        Update connected states based on actual get_connected_ssid() value.
        """
        self._start_loading("Đang quét Wi-Fi...")
        QApplication.processEvents()

        self._clear_cards()
        self.selected_ssid = None
        self._status.setVisible(False)

        if not self.wifi_service.is_supported():
            self._stop_loading()
            self._status.set_error("Tính năng này chỉ hỗ trợ trên Windows hoặc Linux")
            self._status.setVisible(True)
            return

        platform_name = self.wifi_service.current_platform()
        self.platform_badge.setText(platform_name)

        # Read network list.
        self.networks = self.wifi_service.scan_network_details()

        # Read actual connected SSID from system.
        current_connected = self.wifi_service.get_connected_ssid()

        for n in self.networks:
            # Check whether a saved profile exists.
            n["saved"] = self.wifi_service.has_saved_profile(n["ssid"])
            # Sync connected state from real system status.
            n["connected"] = (n["ssid"] == current_connected)

        if not self.networks:
            self._stop_loading()
            detail = self.wifi_service.last_error or "Không tìm thấy mạng nào"
            self._status.set_error(f"{detail} — Vui lòng thử lại sau.")
            self._status.setVisible(True)
            return

        # Render network cards.
        for network in self.networks:
            card = WifiCard(network)
            card.selected.connect(self._on_card_selected)
            card.connect_requested.connect(self._on_connect_requested)
            card.forget_requested.connect(self._on_forget_requested)
            self.cards.append(card)
            self._card_layout.addWidget(card)

        self._stop_loading()
        connected_count = sum(1 for n in self.networks if n.get("connected"))
        if connected_count:
            self._status.set_success(f"Đã kết nối · Tìm thấy {len(self.networks)} mạng")
        else:
            self._status.set_idle(f"Tìm thấy {len(self.networks)} mạng · Chưa kết nối")
        self._status.setVisible(True)

    # -------------------------------------------------------------------------
    # Event handlers
    # -------------------------------------------------------------------------

    def _on_card_selected(self, ssid: str):
        """Handle user click on a network card."""
        self.selected_ssid = ssid
        for card in self.cards:
            card.set_selected(card.network["ssid"] == ssid)

        # Update hint based on saved-profile state.
        has_profile = self.wifi_service.has_saved_profile(ssid)
        if has_profile:
            self._status.set_idle(f"'{ssid}' đã có profile lưu — bấm Kết nối để kết nối lại")
        else:
            self._status.set_idle(f"'{ssid}' chưa từng kết nối — sẽ cần nhập mật khẩu")
        self._status.setVisible(True)

    def _on_connect_requested(self, ssid: str):
        """
                Handle connection request for a specific SSID.

                Flow:
                    - If a saved profile exists: reconnect directly.
                    - If this is a new secure network: ask for password then connect.
                    - If this is an open network: connect without password.
                    - In all cases: run _schedule_verify() for actual-state verification.
        """
        network = next((n for n in self.networks if n["ssid"] == ssid), None)
        is_secure = True if not network else bool(network.get("secure", True))

        self._start_loading(f"Đang kết nối đến '{ssid}'...")
        self._status.set_loading(f"Đang kết nối đến '{ssid}'...")
        self._status.setVisible(True)
        QApplication.processEvents()

        if self.wifi_service.has_saved_profile(ssid):
            # Saved profile exists: attempt direct reconnect.
            ok, msg = self.wifi_service.connect_saved_profile(ssid)
            self._stop_loading()
            self._schedule_verify(ssid, msg)
        elif is_secure:
            # New secure network: prompt for password.
            self._stop_loading()
            pwd_dlg = WifiPasswordDialog(ssid, self)
            if pwd_dlg.exec() != QDialog.DialogCode.Accepted:
                # User cancelled; restore idle state.
                self._status.set_idle("Đã hủy kết nối")
                self._status.setVisible(True)
                return
            password = pwd_dlg.password()

            self._start_loading(f"Đang kết nối đến '{ssid}'...")
            self._status.set_loading(f"Đang kết nối đến '{ssid}'...")
            QApplication.processEvents()

            ok, msg = self.wifi_service.connect_with_password(ssid, password, secure=True)
            self._stop_loading()
            self._schedule_verify(ssid, msg)
        else:
            # Open network: connect without password.
            ok, msg = self.wifi_service.connect_with_password(ssid, "", secure=False)
            self._stop_loading()
            self._schedule_verify(ssid, msg)

    def _on_forget_requested(self, ssid: str):
        """Delete saved Wi-Fi profile and refresh network list."""
        ok, msg = self.wifi_service.forget_saved_profile(ssid)
        if ok:
            self._status.set_success(f"Đã xóa profile '{ssid}'")
        else:
            self._status.set_error(f"Không xóa được: {msg}")
        self._status.setVisible(True)
        self.refresh_networks()

    # -------------------------------------------------------------------------
    # Connection verification - core logic to prevent false-success status
    # -------------------------------------------------------------------------

    def _schedule_verify(self, ssid: str, connect_msg: str, delay_ms: int = 1800):
        """
        Schedule connection verification after a short delay.

        Do not trust wifi_service.connect_*() result immediately because some
        OS/driver stacks report success before real connectivity is established.

        delay_ms: wait time for OS network interface state to settle.
        """
        self._pending_verify_ssid = ssid
        self._start_loading(f"Đang xác minh kết nối đến '{ssid}'...")
        self._status.set_loading(f"Đang xác minh kết nối đến '{ssid}'...")
        self._status.setVisible(True)

        QTimer.singleShot(delay_ms, lambda: self._verify_connection(ssid))

    def _verify_connection(self, ssid: str):
        """
        Verify whether device is truly connected to the expected SSID.

        Rescan and compare get_connected_ssid() against target SSID.
        Show success only on exact match; otherwise show error.
        """
        if self._pending_verify_ssid != ssid:
            # A newer request is pending while waiting for verify; ignore this run.
            return

        # Read actual connected SSID from system.
        actual_connected = self.wifi_service.get_connected_ssid()
        is_connected = (actual_connected == ssid)

        # Refresh cards to update "Connected" badge state.
        self._refresh_cards_silent()

        self._stop_loading()
        self._pending_verify_ssid = None

        if is_connected:
            self._status.set_success(f"Đã kết nối thành công đến '{ssid}'")
        else:
            if actual_connected:
                self._status.set_error(
                    f"Kết nối thất bại — thiết bị đang ở mạng '{actual_connected}', không phải '{ssid}'"
                )
            else:
                self._status.set_error(
                    f"Kết nối thất bại đến '{ssid}' — kiểm tra lại mật khẩu hoặc kết nối mạng"
                )
        self._status.setVisible(True)

    def _refresh_cards_silent(self):
        """
        Refresh all cards without showing loading state.
        Used after verification to update connection badge without UI flicker.
        """
        self._clear_cards()
        self.networks = self.wifi_service.scan_network_details()
        current_connected = self.wifi_service.get_connected_ssid()

        for n in self.networks:
            n["saved"] = self.wifi_service.has_saved_profile(n["ssid"])
            n["connected"] = (n["ssid"] == current_connected)

        for network in self.networks:
            card = WifiCard(network)
            card.selected.connect(self._on_card_selected)
            card.connect_requested.connect(self._on_connect_requested)
            card.forget_requested.connect(self._on_forget_requested)
            self.cards.append(card)
            self._card_layout.addWidget(card)

    # -------------------------------------------------------------------------
    # Loading helpers
    # -------------------------------------------------------------------------

    def _start_loading(self, text: str):
        """Show spinner/loading text and disable Refresh button."""
        self._loading_msg.setText(text)
        self._spinner_lbl.setVisible(True)
        self._loading_msg.setVisible(True)
        self.btn_refresh.setEnabled(False)
        self._spinner_timer.start(100)

    def _stop_loading(self):
        """Stop spinner, hide loading indicator, and enable Refresh button."""
        self._spinner_timer.stop()
        self._spinner_lbl.setVisible(False)
        self._loading_msg.setVisible(False)
        self.btn_refresh.setEnabled(True)

    def _tick_spinner(self):
        """Update spinner animation frame."""
        self._spinner_lbl.setText(self._spinner_frames[self._spinner_idx])
        self._spinner_idx = (self._spinner_idx + 1) % len(self._spinner_frames)

    # -------------------------------------------------------------------------
    # Utilities
    # -------------------------------------------------------------------------

    def _clear_cards(self):
        """Remove all cards from list and reset internal card collection."""
        self.cards.clear()
        while self._card_layout.count():
            item = self._card_layout.takeAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()