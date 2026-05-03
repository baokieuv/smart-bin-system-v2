"""
dialog_wifi_config.py
---------------------
Simple Wi-Fi configuration dialog for Smart Bin.

Used in MainWindow.show_wifi_config() as a modal popup.
Integrates with app's design system and color scheme.
"""

from PyQt6.QtCore import Qt, pyqtSignal, QTimer
from PyQt6.QtGui import QColor
from PyQt6.QtWidgets import (
    QApplication,
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QGraphicsDropShadowEffect,
)

from src.services.wifi_service import WifiService


# ---------------------------------------------------------------------------
# Password dialog
# ---------------------------------------------------------------------------

class WifiPasswordDialog(QDialog):
    """Simple Wi-Fi password input dialog."""
    
    def __init__(self, ssid: str, parent=None):
        super().__init__(parent)
        self._password = ""
        self._pw_visible = False
        self._build_ui(ssid)

    def _build_ui(self, ssid: str):
        self.setWindowTitle("Nhập mật khẩu Wi-Fi")
        self.setModal(True)
        self.setFixedWidth(380)
        self.setStyleSheet("""
            QDialog {
                background: #ffffff;
            }
            QLineEdit {
                background: #f8fafc;
                color: #1e3a6e;
                border: 1.5px solid #dbeafe;
                border-radius: 12px;
                padding: 10px 14px;
                font-size: 13px;
                font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
            }
            QLineEdit:focus {
                border: 1.5px solid #2563eb;
                background: #ffffff;
            }
        """)

        root = QVBoxLayout(self)
        root.setSpacing(14)
        root.setContentsMargins(20, 18, 20, 18)

        # Title
        title = QLabel(f"Nhập mật khẩu cho: {ssid}")
        title.setStyleSheet("""
            font-size: 14px;
            font-weight: 700;
            color: #1e3a6e;
            background: transparent;
        """)
        root.addWidget(title)

        # Password input
        self.password_input = QLineEdit()
        self.password_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_input.setPlaceholderText("Mật khẩu Wi-Fi")
        self.password_input.returnPressed.connect(self._accept)
        root.addWidget(self.password_input)

        # Show/Hide button
        show_btn = QPushButton("Hiện")
        show_btn.setFixedHeight(36)
        show_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        show_btn.setStyleSheet("""
            QPushButton {
                background: #f1f5f9;
                color: #426699;
                border: 1px solid #cbd5e1;
                border-radius: 12px;
                font-size: 13px;
                font-weight: 600;
                font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
            }
            QPushButton:hover { background: #dbeafe; color: #1d4ed8; }
            QPushButton:pressed { background: #bfdbfe; }
        """)
        show_btn.clicked.connect(self._toggle_pw_visibility)
        root.addWidget(show_btn)

        # Buttons
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(10)

        btn_cancel = QPushButton("Hủy")
        btn_cancel.setFixedHeight(36)
        btn_cancel.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_cancel.setStyleSheet("""
            QPushButton {
                background: #f1f5f9;
                color: #426699;
                border: none;
                border-radius: 12px;
                font-weight: 600;
                font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
            }
            QPushButton:hover { background: #dbeafe; color: #1d4ed8; }
            QPushButton:pressed { background: #bfdbfe; }
        """)
        btn_cancel.clicked.connect(self.reject)
        btn_layout.addWidget(btn_cancel)

        btn_ok = QPushButton("Kết nối")
        btn_ok.setFixedHeight(36)
        btn_ok.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_ok.setStyleSheet("""
            QPushButton {
                background: #2563eb;
                color: white;
                border: none;
                border-radius: 12px;
                font-weight: 700;
                font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
            }
            QPushButton:hover { background: #1d4ed8; }
            QPushButton:pressed { background: #1e40af; }
        """)
        btn_ok.clicked.connect(self._accept)
        btn_layout.addWidget(btn_ok)

        root.addLayout(btn_layout)

    def _toggle_pw_visibility(self):
        """Toggle password visibility."""
        self._pw_visible = not self._pw_visible
        mode = QLineEdit.EchoMode.Normal if self._pw_visible else QLineEdit.EchoMode.Password
        self.password_input.setEchoMode(mode)

    def _accept(self):
        """Confirm connection; show error when password is empty."""
        pw = self.password_input.text().strip()
        if not pw:
            QMessageBox.warning(self, "Lỗi", "Vui lòng nhập mật khẩu")
            return
        self._password = pw
        self.accept()

    def password(self) -> str:
        return self._password



# ---------------------------------------------------------------------------
# Main dialog
# ---------------------------------------------------------------------------

class WifiConfigDialog(QDialog):
    """
    Simple Wi-Fi configuration dialog popup.
    
    Integrated with app's design system (style, colors, shadows).
    
    Features:
    - List available Wi-Fi networks
    - Connect to a network (with password prompt if needed)
    - Forget saved networks
    - Check connection status
    - Callbacks for connection events
    
    Usage:
        dialog = WifiConfigDialog(parent_window)
        dialog.connected.connect(lambda ssid: print(f"Connected to {ssid}"))
        dialog.connection_failed.connect(lambda ssid, reason: print(f"Failed: {reason}"))
        dialog.exec()
    
    Signals:
    - connected(ssid): emitted when successfully connected
    - connection_failed(ssid, reason): emitted when connection fails
    """
    
    connected = pyqtSignal(str)  # SSID when successfully connected
    connection_failed = pyqtSignal(str, str)  # SSID, reason
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.wifi_service = WifiService()
        self.networks = []
        self._is_connecting = False
        self._build_ui()
        self.refresh_networks()

    def _build_ui(self):
        self.setWindowTitle("Cấu hình Wi-Fi")
        self.setModal(True)
        self.setFixedSize(500, 460)
        self.setStyleSheet("""
            QDialog {
                background: #ffffff;
                font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
            }
            QLabel { background: transparent; }
            QListWidget {
                background: #f8fafc;
                border: 1.5px solid #dbeafe;
                border-radius: 14px;
                font-size: 13px;
            }
            QListWidget::item {
                color: #1e3a6e;
                padding: 8px;
                background: transparent;
            }
            QListWidget::item:selected {
                background: #dbeafe;
                color: #0f172a;
            }
        """)

        root = QVBoxLayout(self)
        root.setSpacing(14)
        root.setContentsMargins(20, 18, 20, 18)

        # --- Header ---
        header = QLabel("Chọn mạng Wi-Fi")
        header.setStyleSheet("""
            font-size: 18px;
            font-weight: 800;
            color: #1e3a6e;
        """)
        root.addWidget(header)

        # --- Network list ---
        self.network_list = QListWidget()
        self.network_list.setMaximumHeight(280)
        self.network_list.itemClicked.connect(self._on_network_selected)
        root.addWidget(self.network_list)

        # --- Status label ---
        self.status_label = QLabel("Sẵn sàng")
        self.status_label.setStyleSheet("""
            font-size: 12px;
            color: #7a9cc5;
            background: transparent;
        """)
        root.addWidget(self.status_label)

        # --- Action buttons ---
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(10)

        btn_scan = QPushButton("Quét lại")
        btn_scan.setFixedHeight(40)
        btn_scan.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_scan.setStyleSheet(self._get_button_style("#f1f5f9", "#426699"))
        btn_scan.clicked.connect(self.refresh_networks)
        self._add_button_shadow(btn_scan, 8)
        btn_layout.addWidget(btn_scan)

        self.btn_forget = QPushButton("Quên mạng")
        self.btn_forget.setFixedHeight(40)
        self.btn_forget.setCursor(Qt.CursorShape.PointingHandCursor)
        self.btn_forget.setStyleSheet(self._get_button_style("#fff5f5", "#dc2626"))
        self.btn_forget.clicked.connect(self._on_forget)
        self.btn_forget.setEnabled(False)
        self._add_button_shadow(self.btn_forget, 8)
        btn_layout.addWidget(self.btn_forget)

        btn_connect = QPushButton("Kết nối")
        btn_connect.setFixedHeight(40)
        btn_connect.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_connect.setStyleSheet("""
            QPushButton {
                background: #2563eb;
                color: white;
                border: none;
                border-radius: 12px;
                font-weight: 700;
                font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
            }
            QPushButton:hover { background: #1d4ed8; }
            QPushButton:pressed { background: #1e40af; }
        """)
        btn_connect.clicked.connect(self._on_connect)
        self._add_button_shadow(btn_connect, 12)
        btn_layout.addWidget(btn_connect)

        root.addLayout(btn_layout)

        # --- Close button ---
        btn_close = QPushButton("Đóng")
        btn_close.setFixedHeight(40)
        btn_close.setCursor(Qt.CursorShape.PointingHandCursor)
        btn_close.setStyleSheet("""
            QPushButton {
                background: #f1f5f9;
                color: #426699;
                border: none;
                border-radius: 12px;
                font-weight: 600;
                font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
            }
            QPushButton:hover { background: #dbeafe; color: #1d4ed8; }
            QPushButton:pressed { background: #bfdbfe; }
        """)
        btn_close.clicked.connect(self.reject)
        root.addWidget(btn_close)

    @staticmethod
    def _get_button_style(bg: str, text_color: str) -> str:
        """Generate button stylesheet."""
        return f"""
            QPushButton {{
                background: {bg};
                color: {text_color};
                border: 1px solid #dbeafe;
                border-radius: 12px;
                font-weight: 600;
                font-family: 'Segoe UI', 'Helvetica Neue', sans-serif;
            }}
            QPushButton:hover {{ background: #dbeafe; color: #1d4ed8; }}
            QPushButton:pressed {{ background: #bfdbfe; }}
        """

    @staticmethod
    def _add_button_shadow(button: QPushButton, blur: int = 8):
        """Add drop shadow to button."""
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(blur)
        shadow.setColor(QColor(37, 99, 235, 50))
        shadow.setOffset(0, 4)
        button.setGraphicsEffect(shadow)

    def refresh_networks(self):
        """Scan available Wi-Fi networks and update list."""
        self._update_status("Đang quét Wi-Fi...")
        QApplication.processEvents()

        self.network_list.clear()
        self.btn_forget.setEnabled(False)

        if not self.wifi_service.is_supported():
            self._update_status("❌ Wi-Fi không được hỗ trợ", "error")
            return

        self.networks = self.wifi_service.scan_network_details()
        current_connected = self.wifi_service.get_connected_ssid()

        if not self.networks:
            self._update_status("❌ Không tìm thấy mạng nào", "error")
            return

        # Update network info (saved, connected status)
        for n in self.networks:
            n["saved"] = self.wifi_service.has_saved_profile(n["ssid"])
            n["connected"] = (n["ssid"] == current_connected)

        # Populate list
        for network in self.networks:
            ssid = network["ssid"]
            is_secure = network.get("secure", True)
            is_saved = network.get("saved", False)
            is_connected = network.get("connected", False)
            
            # Format display text
            badges = []
            if is_connected:
                badges.append("[✓ Kết nối]")
            if is_saved:
                badges.append("[Đã lưu]")
            if not is_secure:
                badges.append("[Mở]")
            
            display = f"{ssid}  {' '.join(badges)}"
            item = QListWidgetItem(display)
            item.setData(Qt.ItemDataRole.UserRole, ssid)  # Store SSID
            self.network_list.addItem(item)

        self._update_status(f"Tìm thấy {len(self.networks)} mạng")

    def _on_network_selected(self, item: QListWidgetItem):
        """Handle network selection."""
        ssid = item.data(Qt.ItemDataRole.UserRole)
        network = next((n for n in self.networks if n["ssid"] == ssid), None)
        if network:
            self.btn_forget.setEnabled(bool(network.get("saved")))
            status_msg = f"Đã chọn: {ssid}"
            if network.get("connected"):
                status_msg += " (đang kết nối)"
            elif network.get("saved"):
                status_msg += " (đã lưu)"
            self._update_status(status_msg)

    def _on_connect(self):
        """Handle connect button click."""
        selected = self.network_list.selectedItems()
        if not selected:
            self._update_status("❌ Vui lòng chọn một mạng", "error")
            self.btn_forget.setEnabled(False)
            return

        ssid = selected[0].data(Qt.ItemDataRole.UserRole)
        network = next((n for n in self.networks if n["ssid"] == ssid), None)
        if not network:
            self.btn_forget.setEnabled(False)
            return

        self._is_connecting = True
        self._update_status(f"Đang kết nối đến '{ssid}'...")
        QApplication.processEvents()

        try:
            # Check if saved profile exists
            if self.wifi_service.has_saved_profile(ssid):
                ok, msg = self.wifi_service.connect_saved_profile(ssid)
            # If secure, prompt for password
            elif network.get("secure", True):
                pwd_dlg = WifiPasswordDialog(ssid, self)
                if pwd_dlg.exec() != QDialog.DialogCode.Accepted:
                    self._update_status("Đã hủy kết nối", "neutral")
                    self._is_connecting = False
                    return
                password = pwd_dlg.password()
                ok, msg = self.wifi_service.connect_with_password(ssid, password, secure=True)
            # Open network
            else:
                ok, msg = self.wifi_service.connect_with_password(ssid, "", secure=False)

            # Verify connection
            QTimer.singleShot(1500, lambda: self._verify_connection(ssid, ok, msg))
        except Exception as e:
            self._update_status(f"❌ Lỗi: {str(e)}", "error")
            self._is_connecting = False
            self.connection_failed.emit(ssid, str(e))

    def _verify_connection(self, ssid: str, initial_ok: bool, initial_msg: str):
        """Verify if actually connected after connection attempt."""
        actual_connected = self.wifi_service.get_connected_ssid()
        is_connected = (actual_connected == ssid)

        self._is_connecting = False

        if is_connected:
            self._update_status(f"✓ Đã kết nối thành công đến '{ssid}'", "success")
            self.refresh_networks()  # Update list to show connected status
            self.connected.emit(ssid)
        else:
            if actual_connected:
                msg = f"❌ Kết nối thất bại - đang ở mạng '{actual_connected}'"
            else:
                msg = f"❌ Kết nối thất bại - kiểm tra mật khẩu"
            self._update_status(msg, "error")
            self.connection_failed.emit(ssid, msg)

    def _on_forget(self):
        """Handle forget button click."""
        selected = self.network_list.selectedItems()
        if not selected:
            self._update_status("❌ Vui lòng chọn một mạng", "error")
            self.btn_forget.setEnabled(False)
            return

        ssid = selected[0].data(Qt.ItemDataRole.UserRole)
        network = next((n for n in self.networks if n["ssid"] == ssid), None)

        if not network or not network.get("saved"):
            self._update_status("❌ Mạng này không có profile lưu", "error")
            self.btn_forget.setEnabled(False)
            return

        # Confirm deletion
        reply = QMessageBox.question(
            self,
            "Xác nhận",
            f"Xóa profile Wi-Fi '{ssid}'?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )

        if reply == QMessageBox.StandardButton.Yes:
            ok, msg = self.wifi_service.forget_saved_profile(ssid)
            if ok:
                self._update_status(f"✓ Đã xóa profile '{ssid}'", "success")
                self.refresh_networks()
            else:
                self._update_status(f"❌ Không thể xóa: {msg}", "error")

    def _update_status(self, message: str, status_type: str = "neutral"):
        """Update status label with color coding."""
        colors = {
            "neutral": "#7a9cc5",
            "error": "#dc2626",
            "success": "#15803d",
        }
        color = colors.get(status_type, colors["neutral"])
        self.status_label.setStyleSheet(f"""
            font-size: 12px;
            color: {color};
            background: transparent;
        """)
        self.status_label.setText(message)

    def get_connected_ssid(self) -> str | None:
        """Get currently connected Wi-Fi SSID."""
        return self.wifi_service.get_connected_ssid()

    def is_connected(self) -> bool:
        """Check if connected to any Wi-Fi network."""
        return self.get_connected_ssid() is not None