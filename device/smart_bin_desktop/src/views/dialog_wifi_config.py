from PyQt6.QtCore import Qt, pyqtSignal, QTimer, QPoint, QPropertyAnimation, QEasingCurve
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
)

from src.services.wifi_service import WifiService


class AnimatedButton(QPushButton):
    def __init__(self, text: str, parent=None):
        super().__init__(text, parent)
        self._anim: QPropertyAnimation | None = None

    def mousePressEvent(self, event):
        self._run_press_animation()
        return super().mousePressEvent(event)

    def _run_press_animation(self):
        start_pos = self.pos()
        down_pos = QPoint(start_pos.x(), start_pos.y() + 1)
        anim = QPropertyAnimation(self, b"pos", self)
        anim.setDuration(110)
        anim.setStartValue(start_pos)
        anim.setKeyValueAt(0.45, down_pos)
        anim.setEndValue(start_pos)
        anim.setEasingCurve(QEasingCurve.Type.OutCubic)
        anim.start()
        self._anim = anim


class WifiPasswordDialog(QDialog):
    def __init__(self, ssid: str, parent=None):
        super().__init__(parent)
        self._password = ""
        self._visible = False
        self._build_ui(ssid)

    def _build_ui(self, ssid: str):
        self.setWindowTitle("Nhap mat khau Wi-Fi")
        self.setModal(True)
        self.resize(360, 170)
        self.setStyleSheet(
            """
            QDialog { background: #f8fbff; }
            QLabel { color: #1f3b70; }
            QLineEdit {
                background: #ffffff;
                color: #0f172a;
                border: 1px solid #cbd5e1;
                border-radius: 10px;
                padding: 8px;
                font-size: 13px;
            }
            QPushButton {
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 10px;
                padding: 7px 12px;
                font-weight: 700;
            }
            QPushButton:hover { background: #2563eb; }
            """
        )

        root = QVBoxLayout(self)
        root.setContentsMargins(16, 14, 16, 14)
        root.setSpacing(10)

        title = QLabel(f"Nhap mat khau cho mang {ssid}")
        title.setStyleSheet("font-size: 13px; font-weight: 700;")
        root.addWidget(title)

        row = QHBoxLayout()
        row.setSpacing(8)

        self.password_input = QLineEdit()
        self.password_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_input.setPlaceholderText("Mat khau Wi-Fi")
        row.addWidget(self.password_input, 1)

        self.eye_button = AnimatedButton("👁")
        self.eye_button.setFixedWidth(44)
        self.eye_button.clicked.connect(self._toggle_visibility)
        row.addWidget(self.eye_button)
        root.addLayout(row)

        actions = QHBoxLayout()
        actions.setSpacing(8)

        btn_cancel = AnimatedButton("Huy")
        btn_cancel.setStyleSheet(
            """
            QPushButton {
                background: #64748b;
                color: white;
                border: none;
                border-radius: 10px;
                padding: 7px 12px;
                font-weight: 700;
            }
            QPushButton:hover { background: #475569; }
            """
        )
        btn_cancel.clicked.connect(self.reject)

        btn_ok = AnimatedButton("Xac nhan")
        btn_ok.clicked.connect(self._accept)

        actions.addWidget(btn_cancel)
        actions.addWidget(btn_ok)
        root.addLayout(actions)

    def _toggle_visibility(self):
        self._visible = not self._visible
        self.password_input.setEchoMode(QLineEdit.EchoMode.Normal if self._visible else QLineEdit.EchoMode.Password)
        self.eye_button.setText("🙈" if self._visible else "👁")

    def _accept(self):
        self._password = self.password_input.text().strip()
        if not self._password:
            self.password_input.setStyleSheet(
                "background: #ffffff; color: #0f172a; border: 1px solid #ef4444; border-radius: 10px; padding: 8px;"
            )
            return
        self.accept()

    def password(self) -> str:
        return self._password


class WifiCard(QWidget):
    selected = pyqtSignal(str)
    connect_requested = pyqtSignal(str)
    forget_requested = pyqtSignal(str)

    def __init__(self, network: dict, parent=None):
        super().__init__(parent)
        self.network = network
        self._selected = False
        self._build_ui()

    def _build_ui(self):
        self.setObjectName("wifiCard")
        root = QHBoxLayout(self)
        root.setContentsMargins(10, 10, 10, 10)
        root.setSpacing(10)

        icon_wrap = QWidget()
        icon_wrap.setFixedSize(44, 44)
        icon_wrap.setStyleSheet("background: #dbeafe; border-radius: 12px;")

        wifi_icon = QLabel("▂▄▆█", icon_wrap)
        wifi_icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        wifi_icon.setStyleSheet("font-size: 13px; font-weight: 800; color: #2563eb; background: transparent;")
        wifi_icon.setGeometry(6, 8, 32, 20)

        lock_icon = "S" if self.network.get("secure", True) else "O"
        self.lock_label = QLabel(lock_icon, icon_wrap)
        self.lock_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lock_label.setStyleSheet(
            "font-size: 9px; font-weight: 800; color: #1d4ed8; background: #eff6ff; border: 1px solid #93c5fd; border-radius: 8px;"
        )
        self.lock_label.setGeometry(27, 27, 14, 14)

        root.addWidget(icon_wrap)

        text_col = QVBoxLayout()
        text_col.setSpacing(2)

        self.ssid_label = QLabel(self.network["ssid"])
        self.ssid_label.setStyleSheet("font-size: 14px; font-weight: 800; color: #0f172a;")

        secure_text = "Bao mat" if self.network.get("secure", True) else "Khong bao mat"
        self.meta_label = QLabel(secure_text)
        self.meta_label.setStyleSheet("font-size: 12px; color: #475569;")

        text_col.addWidget(self.ssid_label)
        text_col.addWidget(self.meta_label)
        root.addLayout(text_col, 1)

        self.connected_badge = QLabel("Connected")
        self.connected_badge.setStyleSheet(
            "font-size: 11px; color: #065f46; background: #d1fae5; border-radius: 9px; padding: 3px 8px;"
        )
        self.connected_badge.setVisible(bool(self.network.get("connected")))
        root.addWidget(self.connected_badge)

        self.btn_connect = AnimatedButton("Connect")
        self.btn_connect.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_connect.setStyleSheet(
            """
            QPushButton {
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 10px;
                padding: 6px 12px;
                font-size: 12px;
                font-weight: 700;
            }
            QPushButton:hover { background: #2563eb; }
            QPushButton:pressed { background: #1d4ed8; padding-top: 7px; }
            """
        )
        self.btn_connect.clicked.connect(lambda: self.connect_requested.emit(self.network["ssid"]))
        self.btn_connect.setVisible(not bool(self.network.get("connected")))
        root.addWidget(self.btn_connect)

        self.btn_forget = AnimatedButton("Forget")
        self.btn_forget.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_forget.setStyleSheet(
            """
            QPushButton {
                background: #ef4444;
                color: white;
                border: none;
                border-radius: 10px;
                padding: 6px 10px;
                font-size: 12px;
                font-weight: 700;
            }
            QPushButton:hover { background: #dc2626; }
            QPushButton:pressed { background: #b91c1c; padding-top: 7px; }
            """
        )
        self.btn_forget.clicked.connect(lambda: self.forget_requested.emit(self.network["ssid"]))
        self.btn_forget.setVisible(bool(self.network.get("saved", False)))
        root.addWidget(self.btn_forget)

        self._apply_style()

    def set_selected(self, selected: bool):
        self._selected = selected
        self._apply_style()

    def _apply_style(self):
        if self._selected:
            self.setStyleSheet(
                "QWidget#wifiCard { background: #dbeafe; border: 1px solid #60a5fa; border-radius: 12px; }"
            )
        else:
            self.setStyleSheet(
                "QWidget#wifiCard { background: #ffffff; border: 1px solid #dbeafe; border-radius: 12px; }"
            )

    def mousePressEvent(self, event):
        self.selected.emit(self.network["ssid"])
        return super().mousePressEvent(event)


class WifiConfigDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.wifi_service = WifiService()
        self.selected_ssid: str | None = None
        self.networks: list[dict] = []
        self.cards: list[WifiCard] = []
        self._pending_connected_ssid: str | None = None
        self._loading_frames = ["|", "/", "-", "\\"]
        self._loading_index = 0
        self._build_ui()
        self.refresh_networks()

    def _build_ui(self):
        self.setWindowTitle("Cau hinh Wi-Fi")
        self.setModal(True)
        self.resize(480, 420)
        self.setStyleSheet(
            """
            QDialog { background: #f8fbff; }
            QLabel { color: #1f3b70; }
            QPushButton {
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 10px;
                padding: 8px 12px;
                font-weight: 700;
            }
            QPushButton:hover { background: #2563eb; }
            QPushButton:disabled { background: #94a3b8; }
            """
        )

        root = QVBoxLayout(self)
        root.setContentsMargins(18, 16, 18, 16)
        root.setSpacing(10)

        title = QLabel("Chon mang Wi-Fi de ket noi")
        title.setStyleSheet("font-size: 16px; font-weight: 800;")
        root.addWidget(title)

        self.hint = QLabel("Chon mang trong danh sach, sau do bam Ket noi de thuc hien.")
        self.hint.setStyleSheet("font-size: 12px; color: #4b6b99;")
        root.addWidget(self.hint)

        self.platform_hint = QLabel("")
        self.platform_hint.setStyleSheet("font-size: 11px; color: #64748b;")
        root.addWidget(self.platform_hint)

        loading_row = QHBoxLayout()
        loading_row.setSpacing(6)
        loading_row.setAlignment(Qt.AlignmentFlag.AlignLeft)

        self.loading_icon = QLabel("")
        self.loading_icon.setStyleSheet("font-size: 13px; color: #2563eb; font-weight: 800;")
        self.loading_icon.setVisible(False)
        loading_row.addWidget(self.loading_icon)

        self.loading_text = QLabel("")
        self.loading_text.setStyleSheet("font-size: 12px; color: #2563eb;")
        self.loading_text.setVisible(False)
        loading_row.addWidget(self.loading_text)

        self.loading_timer = QTimer(self)
        self.loading_timer.timeout.connect(self._tick_loading)
        root.addLayout(loading_row)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setStyleSheet(
            """
            QScrollArea {
                background: #f8fbff;
                border: 1px solid #dbeafe;
                border-radius: 12px;
            }
            QScrollArea QWidget#qt_scrollarea_viewport {
                background: #f8fbff;
                border-radius: 12px;
            }
            """
        )
        self.scroll_widget = QWidget()
        self.scroll_widget.setStyleSheet("background: transparent;")
        self.card_layout = QVBoxLayout(self.scroll_widget)
        self.card_layout.setContentsMargins(0, 0, 0, 0)
        self.card_layout.setSpacing(8)
        self.card_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.scroll.setWidget(self.scroll_widget)
        root.addWidget(self.scroll, 1)

        self.status_label = QLabel("")
        self.status_label.setStyleSheet("font-size: 12px; color: #b45309;")
        root.addWidget(self.status_label)

        action_row = QHBoxLayout()
        action_row.setSpacing(10)

        self.btn_refresh = AnimatedButton("Quet lai")
        self.btn_refresh.clicked.connect(self.refresh_networks)

        self.btn_close = AnimatedButton("Dong")
        self.btn_close.setStyleSheet(
            """
            QPushButton {
                background: #64748b;
                color: white;
                border: none;
                border-radius: 10px;
                padding: 8px 12px;
                font-weight: 700;
            }
            QPushButton:hover { background: #475569; }
            """
        )
        self.btn_close.clicked.connect(self.reject)

        action_row.addWidget(self.btn_refresh)
        action_row.addWidget(self.btn_close)
        root.addLayout(action_row)

    def refresh_networks(self):
        self._start_loading("Dang quet Wi-Fi...")
        QApplication.processEvents()

        self._clear_cards()
        self.selected_ssid = None

        if not self.wifi_service.is_supported():
            self.status_label.setText("Tinh nang nay chi ho tro tren Windows hoac Linux")
            self._stop_loading()
            return

        self.platform_hint.setText(f"Nen tang: {self.wifi_service.current_platform()}")

        self.networks = self.wifi_service.scan_network_details()

        connected_ssid = self.wifi_service.get_connected_ssid()
        for n in self.networks:
            n["saved"] = self.wifi_service.has_saved_profile(n["ssid"])
            n["connected"] = n["ssid"] == connected_ssid

        if self._pending_connected_ssid:
            for n in self.networks:
                n["connected"] = n["ssid"] == self._pending_connected_ssid

        if not self.networks:
            detail = self.wifi_service.last_error or "Khong tim thay mang nao"
            self.status_label.setText(f"{detail} Vui long thu lai sau.")
            self._stop_loading()
            return

        for network in self.networks:
            card = WifiCard(network)
            card.selected.connect(self._on_network_selected)
            card.connect_requested.connect(self.connect_selected_network)
            card.forget_requested.connect(self.forget_network)
            self.cards.append(card)
            self.card_layout.addWidget(card)

        self.status_label.setStyleSheet("font-size: 12px; color: #b45309;")
        self.status_label.setText(f"Da tim thay {len(self.networks)} mang Wi-Fi")
        self._stop_loading()

    def _on_network_selected(self, ssid: str):
        self.selected_ssid = ssid
        for card in self.cards:
            card.set_selected(card.network["ssid"] == ssid)

        if self.wifi_service.has_saved_profile(ssid):
            self.status_label.setStyleSheet("font-size: 12px; color: #475569;")
            self.status_label.setText("Mang nay da tung ket noi. Bam Connect de noi lai.")
        else:
            self.status_label.setStyleSheet("font-size: 12px; color: #475569;")
            self.status_label.setText("Mang chua tung ket noi. Bam Connect va nhap mat khau neu duoc yeu cau.")

    def connect_selected_network(self, ssid: str | None = None):
        target_ssid = ssid or self.selected_ssid
        if not target_ssid:
            self.status_label.setText("Vui long chon mot mang Wi-Fi")
            return

        network = next((n for n in self.networks if n["ssid"] == target_ssid), None)
        secure = True if not network else bool(network.get("secure", True))

        if self.wifi_service.has_saved_profile(target_ssid):
            ok, msg = self.wifi_service.connect_saved_profile(target_ssid)
        else:
            if secure:
                pwd_dialog = WifiPasswordDialog(target_ssid, self)
                if pwd_dialog.exec() != QDialog.DialogCode.Accepted:
                    return
                password = pwd_dialog.password()
                if not password:
                    self.status_label.setText("Vui long nhap mat khau")
                    return
                ok, msg = self.wifi_service.connect_with_password(target_ssid, password, secure=True)
            else:
                ok, msg = self.wifi_service.connect_with_password(target_ssid, "", secure=False)

        if ok:
            self._pending_connected_ssid = target_ssid
            self.status_label.setStyleSheet("font-size: 12px; color: #059669;")
            self.status_label.setText(f"Thanh cong: {msg}")
            self.refresh_networks()
            self._on_network_selected(target_ssid)
            QTimer.singleShot(1500, self._refresh_after_connect)
        else:
            self._pending_connected_ssid = None
            self.status_label.setStyleSheet("font-size: 12px; color: #dc2626;")
            self.status_label.setText(f"That bai: {msg}")

    def forget_network(self, ssid: str):
        ok, msg = self.wifi_service.forget_saved_profile(ssid)
        if ok:
            self.status_label.setStyleSheet("font-size: 12px; color: #059669;")
            self.status_label.setText(f"Thanh cong: {msg}")
            self.refresh_networks()
            return

        self.status_label.setStyleSheet("font-size: 12px; color: #dc2626;")
        self.status_label.setText(f"That bai: {msg}")

    def _clear_cards(self):
        self.cards.clear()
        while self.card_layout.count():
            item = self.card_layout.takeAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()

    def _start_loading(self, text: str):
        self.loading_text.setText(text)
        self.loading_icon.setVisible(True)
        self.loading_text.setVisible(True)
        self.btn_refresh.setEnabled(False)
        self.loading_timer.start(120)

    def _stop_loading(self):
        self.loading_timer.stop()
        self.loading_icon.setVisible(False)
        self.loading_text.setVisible(False)
        self.btn_refresh.setEnabled(True)

    def _tick_loading(self):
        self.loading_icon.setText(self._loading_frames[self._loading_index])
        self._loading_index = (self._loading_index + 1) % len(self._loading_frames)

    def _refresh_after_connect(self):
        if not self._pending_connected_ssid:
            return
        selected = self._pending_connected_ssid
        self.refresh_networks()
        self._on_network_selected(selected)
        current = self.wifi_service.get_connected_ssid()
        if current == selected:
            self.status_label.setStyleSheet("font-size: 12px; color: #059669;")
            self.status_label.setText(f"Da ket noi voi {selected}")
        else:
            self.status_label.setStyleSheet("font-size: 12px; color: #dc2626;")
            self.status_label.setText("Ket noi that bai hoac he thong fallback sang mang khac")
            self._pending_connected_ssid = None
