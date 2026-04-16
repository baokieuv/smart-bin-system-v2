"""
dialog_wifi_config.py
---------------------
Dialog cấu hình Wi-Fi cho Smart Bin.

Luồng kết nối được thiết kế để luôn xác minh thực sự:
  1. Gọi connect (saved profile hoặc with password).
  2. Sau khi hàm connect trả về, KHÔNG tin ngay vào ok/msg.
  3. Quét lại danh sách wifi và gọi get_connected_ssid() để kiểm tra
     thiết bị có thực sự đang kết nối đúng SSID hay không.
  4. Cập nhật UI theo kết quả xác minh thực tế.

UI được thiết kế theo hướng native/clean:
  - Không dùng emoji AI (thay bằng ký hiệu Unicode đơn giản hoặc text).
  - Màu sắc nhất quán, dùng icon SVG-style thay vì emoji phức tạp.
  - Trạng thái loading, kết nối rõ ràng, tránh nhầm lẫn.
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
    QPushButton với hiệu ứng nhấn nhẹ (dịch chuyển 1px theo chiều dọc).
    Dùng làm base class để tránh lặp code animation.
    """
    def __init__(self, text: str, parent=None):
        super().__init__(text, parent)
        self._anim: QPropertyAnimation | None = None

    def mousePressEvent(self, event):
        self._play_press_anim()
        return super().mousePressEvent(event)

    def _play_press_anim(self):
        """Tạo animation nhấn nhẹ: dịch chuyển xuống 1px rồi trở lại."""
        origin = self.pos()
        pressed = QPoint(origin.x(), origin.y() + 1)
        anim = QPropertyAnimation(self, b"pos", self)
        anim.setDuration(100)
        anim.setStartValue(origin)
        anim.setKeyValueAt(0.5, pressed)
        anim.setEndValue(origin)
        anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        anim.start()
        self._anim = anim  # Giữ tham chiếu để tránh bị GC thu hồi


def _make_divider() -> QFrame:
    """Tạo đường kẻ ngang nhẹ nhàng dùng làm divider giữa các card."""
    line = QFrame()
    line.setFrameShape(QFrame.Shape.HLine)
    line.setStyleSheet("color: #e2e8f0; background: #e2e8f0; max-height: 1px;")
    return line


# ---------------------------------------------------------------------------
# Password dialog
# ---------------------------------------------------------------------------

class WifiPasswordDialog(QDialog):
    """
    Dialog nhập mật khẩu Wi-Fi.
    Hiển thị SSID đang kết nối và cho phép toggle hiện/ẩn mật khẩu.
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

        # --- Tiêu đề ---
        header = QHBoxLayout()
        header.setSpacing(10)

        # Icon mạng (dùng text ký tự thay vì emoji phức tạp)
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

        # --- Input mật khẩu ---
        pw_row = QHBoxLayout()
        pw_row.setSpacing(8)

        self.password_input = QLineEdit()
        self.password_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_input.setPlaceholderText("Mật khẩu Wi-Fi")
        self.password_input.returnPressed.connect(self._accept)
        pw_row.addWidget(self.password_input, 1)

        # Nút toggle: dùng text "Hiện" / "Ẩn" thay vì emoji mắt
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

        # --- Nút hành động ---
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
        """Toggle hiện/ẩn mật khẩu."""
        self._pw_visible = not self._pw_visible
        mode = QLineEdit.EchoMode.Normal if self._pw_visible else QLineEdit.EchoMode.Password
        self.password_input.setEchoMode(mode)
        self.eye_btn.setText("Ẩn" if self._pw_visible else "Hiện")

    def _accept(self):
        """Xác nhận kết nối — đánh dấu đỏ ô nếu mật khẩu trống."""
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
# WifiCard  — một hàng mạng trong danh sách
# ---------------------------------------------------------------------------

class WifiCard(QWidget):
    """
    Widget hiển thị một mạng Wi-Fi trong danh sách.

    Cấu trúc layout:
      WifiCard (outer — chỉ chứa border + background, KHÔNG có padding/content)
        └── _inner (QWidget — chứa toàn bộ nội dung, background transparent)
              └── QHBoxLayout: [icon | info_col | badge | btn_connect | btn_forget]

    Tách outer/inner như vậy để border chỉ áp dụng lên card ngoài,
    không cascade xuống các child widget bên trong.

    Hiệu ứng click: QPropertyAnimation trên maximumHeight (co lại nhẹ rồi bung ra)
    kết hợp QGraphicsOpacityEffect flash nhẹ.

    Signals:
        selected(ssid): Người dùng click vào card này.
        connect_requested(ssid): Người dùng bấm nút Kết nối.
        forget_requested(ssid): Người dùng bấm nút Quên.
    """
    selected = pyqtSignal(str)
    connect_requested = pyqtSignal(str)
    forget_requested = pyqtSignal(str)

    # Chiều cao bình thường của card
    _CARD_H = 60

    def __init__(self, network: dict, parent=None):
        super().__init__(parent)
        self.network = network
        self._is_selected = False
        self._click_anim: QPropertyAnimation | None = None
        self._build_ui()

    def _build_ui(self):
        # ── Outer wrapper: chỉ chịu trách nhiệm vẽ border + background ────────
        # KHÔNG set padding ở đây — padding nằm trong _inner để border không bị
        # che khuất bởi content và không ảnh hưởng tới child stylesheet.
        self.setObjectName("wifiCardOuter")
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFixedHeight(self._CARD_H)

        outer_layout = QVBoxLayout(self)
        outer_layout.setContentsMargins(0, 0, 0, 0)
        outer_layout.setSpacing(0)

        # ── Inner container: chứa toàn bộ nội dung, background transparent ────
        # Dùng objectName riêng để style không bị nhầm với outer.
        self._inner = QWidget()
        self._inner.setObjectName("wifiCardInner")
        self._inner.setStyleSheet("QWidget#wifiCardInner { background: transparent; }")
        outer_layout.addWidget(self._inner)

        row = QHBoxLayout(self._inner)
        row.setContentsMargins(12, 10, 12, 10)
        row.setSpacing(12)

        # ── Icon: chữ "W" + badge bảo mật ở góc dưới phải ───────────────────
        icon_wrap = QWidget()
        icon_wrap.setFixedSize(40, 40)
        # Background transparent — để outer card quyết định màu nền
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

        # ── Thông tin mạng: SSID + trạng thái bảo mật ───────────────────────
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

        # ── Badge "Đang kết nối" ─────────────────────────────────────────────
        self.connected_badge = QLabel("Đang kết nối")
        self.connected_badge.setStyleSheet(
            "font-size: 11px; font-weight: 600; color: #065f46; "
            "background: #d1fae5; border-radius: 8px; padding: 3px 9px; border: none;"
        )
        self.connected_badge.setVisible(bool(self.network.get("connected")))
        row.addWidget(self.connected_badge)

        # ── Nút Kết nối ──────────────────────────────────────────────────────
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

        # ── Nút Quên ─────────────────────────────────────────────────────────
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

        # Áp dụng style ban đầu (unselected)
        self._apply_style()

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    def set_selected(self, selected: bool):
        """Cập nhật trạng thái visual khi card được chọn / bỏ chọn."""
        self._is_selected = selected
        self._apply_style()

    # -------------------------------------------------------------------------
    # Style — chỉ áp dụng lên outer widget, KHÔNG dùng wildcard selector
    # -------------------------------------------------------------------------

    def _apply_style(self):
        """
        Áp dụng border + background LÊN ĐÚNG outer card.

        Dùng selector 'QWidget#wifiCardOuter' thay vì 'QWidget' (wildcard)
        để tránh cascade border xuống các child widget bên trong như
        icon_wrap, ssid_lbl, meta_lbl, v.v.
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
        Hiệu ứng khi click: card co nhẹ rồi bung trở lại (squeeze effect).
        Dùng animation trên maximumHeight + minimumHeight đồng thời.
        """
        normal_h = self._CARD_H
        pressed_h = int(normal_h * 0.88)  # Co lại ~12%

        # Animate maximumHeight: normal → pressed → normal
        anim = QPropertyAnimation(self, b"maximumHeight", self)
        anim.setDuration(160)
        anim.setStartValue(normal_h)
        anim.setKeyValueAt(0.45, pressed_h)
        anim.setEndValue(normal_h)
        anim.setEasingCurve(QEasingCurve.Type.OutCubic)

        # Animate minimumHeight song song để card không bị "vỡ" layout
        anim2 = QPropertyAnimation(self, b"minimumHeight", self)
        anim2.setDuration(160)
        anim2.setStartValue(normal_h)
        anim2.setKeyValueAt(0.45, pressed_h)
        anim2.setEndValue(normal_h)
        anim2.setEasingCurve(QEasingCurve.Type.OutCubic)

        anim.start()
        anim2.start()
        # Giữ tham chiếu để tránh bị GC thu hồi giữa chừng
        self._click_anim = anim
        self._click_anim2 = anim2

    # -------------------------------------------------------------------------
    # Events
    # -------------------------------------------------------------------------

    def mousePressEvent(self, event):
        """Phát signal selected và kích hoạt hiệu ứng click."""
        self._play_click_animation()
        self.selected.emit(self.network["ssid"])
        return super().mousePressEvent(event)


# ---------------------------------------------------------------------------
# Status bar  —  thanh trạng thái bên dưới danh sách
# ---------------------------------------------------------------------------

class _StatusBar(QWidget):
    """
    Widget hiển thị trạng thái: idle / loading / success / error.
    Dùng indicator màu + text thay vì emoji.
    """

    # Màu cho từng trạng thái
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

        # Indicator chấm tròn màu
        self._dot = QLabel("●")
        self._dot.setStyleSheet("font-size: 8px; background: transparent;")
        root.addWidget(self._dot)

        self._text = QLabel("")
        self._text.setStyleSheet("font-size: 12px; background: transparent;")
        root.addWidget(self._text, 1)

        self._set_state("idle", "")

    def _set_state(self, state: str, message: str):
        """Áp dụng trạng thái (idle/loading/success/error) với message tương ứng."""
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
    Dialog quản lý Wi-Fi toàn diện.

    Quy trình kết nối (tránh hiển thị thành công sai):
      1. Gọi wifi_service.connect_*() — hàm này có thể trả về ok=True sai
         nếu OS/driver không báo lỗi ngay lập tức.
      2. Sau khi hàm trả về, gọi _verify_connection_and_update() với delay
         ngắn để OS kịp cập nhật trạng thái mạng.
      3. Trong hàm verify: quét lại danh sách + gọi get_connected_ssid(),
         chỉ hiển thị "kết nối thành công" khi kết quả verify khớp SSID.

    Điều này đảm bảo: dù mật khẩu sai, hệ thống fallback, hay OS delay —
    UI luôn phản ánh trạng thái thực tế.
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.wifi_service = WifiService()
        self.selected_ssid: str | None = None
        self.networks: list[dict] = []
        self.cards: list[WifiCard] = []

        # SSID đang chờ xác minh sau khi gọi connect
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

        # Icon tiêu đề (dùng chữ thay emoji)
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

        # Badge nền tảng hệ điều hành
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

        # ── Scroll area chứa danh sách card mạng ─────────────────────────────
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
        Quét lại danh sách mạng Wi-Fi khả dụng và làm mới toàn bộ danh sách card.
        Cập nhật trạng thái kết nối dựa trên get_connected_ssid() thực tế.
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

        # Lấy danh sách mạng
        self.networks = self.wifi_service.scan_network_details()

        # Lấy SSID đang kết nối thực tế từ hệ thống
        current_connected = self.wifi_service.get_connected_ssid()

        for n in self.networks:
            # Kiểm tra có profile lưu sẵn không
            n["saved"] = self.wifi_service.has_saved_profile(n["ssid"])
            # Cập nhật trạng thái kết nối theo thực tế hệ thống
            n["connected"] = (n["ssid"] == current_connected)

        if not self.networks:
            self._stop_loading()
            detail = self.wifi_service.last_error or "Không tìm thấy mạng nào"
            self._status.set_error(f"{detail} — Vui lòng thử lại sau.")
            self._status.setVisible(True)
            return

        # Render các card mạng
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
        """Xử lý khi người dùng click vào một card mạng."""
        self.selected_ssid = ssid
        for card in self.cards:
            card.set_selected(card.network["ssid"] == ssid)

        # Cập nhật hint theo trạng thái profile
        has_profile = self.wifi_service.has_saved_profile(ssid)
        if has_profile:
            self._status.set_idle(f"'{ssid}' đã có profile lưu — bấm Kết nối để kết nối lại")
        else:
            self._status.set_idle(f"'{ssid}' chưa từng kết nối — sẽ cần nhập mật khẩu")
        self._status.setVisible(True)

    def _on_connect_requested(self, ssid: str):
        """
        Xử lý yêu cầu kết nối đến một SSID cụ thể.

        Quy trình:
          - Nếu có profile lưu sẵn: kết nối trực tiếp.
          - Nếu là mạng bảo mật mới: mở dialog nhập mật khẩu, sau đó kết nối.
          - Nếu là mạng mở: kết nối không cần mật khẩu.
          - Sau mọi trường hợp: gọi _schedule_verify() để xác minh thực tế.
        """
        network = next((n for n in self.networks if n["ssid"] == ssid), None)
        is_secure = True if not network else bool(network.get("secure", True))

        self._start_loading(f"Đang kết nối đến '{ssid}'...")
        self._status.set_loading(f"Đang kết nối đến '{ssid}'...")
        self._status.setVisible(True)
        QApplication.processEvents()

        if self.wifi_service.has_saved_profile(ssid):
            # Có profile lưu sẵn: thử kết nối trực tiếp
            ok, msg = self.wifi_service.connect_saved_profile(ssid)
            self._stop_loading()
            self._schedule_verify(ssid, msg)
        elif is_secure:
            # Mạng mới có bảo mật: cần nhập mật khẩu
            self._stop_loading()
            pwd_dlg = WifiPasswordDialog(ssid, self)
            if pwd_dlg.exec() != QDialog.DialogCode.Accepted:
                # Người dùng hủy — khôi phục trạng thái
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
            # Mạng mở: kết nối không mật khẩu
            ok, msg = self.wifi_service.connect_with_password(ssid, "", secure=False)
            self._stop_loading()
            self._schedule_verify(ssid, msg)

    def _on_forget_requested(self, ssid: str):
        """Xóa profile Wi-Fi đã lưu và làm mới danh sách."""
        ok, msg = self.wifi_service.forget_saved_profile(ssid)
        if ok:
            self._status.set_success(f"Đã xóa profile '{ssid}'")
        else:
            self._status.set_error(f"Không xóa được: {msg}")
        self._status.setVisible(True)
        self.refresh_networks()

    # -------------------------------------------------------------------------
    # Connection verification  — logic trung tâm để tránh báo sai thành công
    # -------------------------------------------------------------------------

    def _schedule_verify(self, ssid: str, connect_msg: str, delay_ms: int = 1800):
        """
        Lên lịch xác minh kết nối sau một khoảng delay.

        Không tin ngay vào giá trị ok/msg từ wifi_service.connect_*(),
        vì một số hệ điều hành/driver báo thành công trước khi thực sự kết nối
        (hoặc thậm chí khi mật khẩu sai).

        delay_ms: thời gian chờ để OS cập nhật trạng thái network interface.
        """
        self._pending_verify_ssid = ssid
        self._start_loading(f"Đang xác minh kết nối đến '{ssid}'...")
        self._status.set_loading(f"Đang xác minh kết nối đến '{ssid}'...")
        self._status.setVisible(True)

        QTimer.singleShot(delay_ms, lambda: self._verify_connection(ssid))

    def _verify_connection(self, ssid: str):
        """
        Xác minh thực tế xem thiết bị có đang kết nối đúng SSID không.

        Quét lại wifi và so sánh kết quả get_connected_ssid() với ssid mong đợi.
        Chỉ hiển thị thành công nếu khớp, ngược lại hiển thị lỗi.
        """
        if self._pending_verify_ssid != ssid:
            # Đã có yêu cầu kết nối mới khi đang chờ verify — bỏ qua lần này
            return

        # Lấy SSID đang kết nối thực tế từ hệ thống
        actual_connected = self.wifi_service.get_connected_ssid()
        is_connected = (actual_connected == ssid)

        # Làm mới danh sách card để cập nhật badge "Đang kết nối"
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
        Làm mới toàn bộ danh sách card mà không hiển thị trạng thái loading.
        Dùng sau khi verify để cập nhật badge kết nối mà không gây confuse cho user.
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
        """Bắt đầu hiển thị spinner và text loading, vô hiệu hóa nút Quét lại."""
        self._loading_msg.setText(text)
        self._spinner_lbl.setVisible(True)
        self._loading_msg.setVisible(True)
        self.btn_refresh.setEnabled(False)
        self._spinner_timer.start(100)

    def _stop_loading(self):
        """Dừng spinner, ẩn indicator loading, kích hoạt lại nút Quét lại."""
        self._spinner_timer.stop()
        self._spinner_lbl.setVisible(False)
        self._loading_msg.setVisible(False)
        self.btn_refresh.setEnabled(True)

    def _tick_spinner(self):
        """Cập nhật frame spinner animation."""
        self._spinner_lbl.setText(self._spinner_frames[self._spinner_idx])
        self._spinner_idx = (self._spinner_idx + 1) % len(self._spinner_frames)

    # -------------------------------------------------------------------------
    # Utilities
    # -------------------------------------------------------------------------

    def _clear_cards(self):
        """Xóa toàn bộ card trong danh sách và reset danh sách nội bộ."""
        self.cards.clear()
        while self._card_layout.count():
            item = self._card_layout.takeAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()