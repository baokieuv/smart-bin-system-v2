from PyQt6.QtWidgets import QMainWindow, QStackedWidget
import logging
from src.views.screen_welcome import ScreenWelcome
from src.views.screen_feedback import ScreenFeedback
from src.views.screen_thanks import ScreenThanks
from src.views.screen_device_link import ScreenDeviceLink
from src.views.screen_loading import ScreenLoading
from src.views.dialog_wifi_config import WifiConfigDialog
from src.models.trash_model import TrashData
from src.utils.config import APP_CONFIG


class MainWindow(QMainWindow):
    """Root window that wires ViewModel state signals to concrete screens."""

    def __init__(self, viewmodel):
        super().__init__()
        self.logger = logging.getLogger("smart_bin.main_window")
        self.viewmodel = viewmodel

        self.setWindowTitle(APP_CONFIG.window.title)
        self.resize(APP_CONFIG.window.width, APP_CONFIG.window.height)
        self.setStyleSheet(f"QMainWindow {{ background: {APP_CONFIG.window.background_color}; }}")

        self.stacked_widget = QStackedWidget()
        self.setCentralWidget(self.stacked_widget)

        # Screens are hosted in a single stack; app starts at loading screen.
        self.screen_loading = ScreenLoading()
        self.screen_welcome = ScreenWelcome()
        self.screen_feedback = ScreenFeedback()
        self.screen_thanks = ScreenThanks()
        self.screen_device_link = ScreenDeviceLink()

        self.stacked_widget.addWidget(self.screen_loading)
        self.stacked_widget.addWidget(self.screen_welcome)
        self.stacked_widget.addWidget(self.screen_feedback)
        self.stacked_widget.addWidget(self.screen_thanks)
        self.stacked_widget.addWidget(self.screen_device_link)
        self.stacked_widget.setCurrentIndex(0)

        # Connect events
        self.screen_feedback.btn_correct.clicked.connect(lambda: self.viewmodel.handle_feedback(True))
        self.screen_feedback.btn_wrong.clicked.connect(lambda: self.viewmodel.handle_feedback(False))
        self.screen_welcome.open_device_link_requested.connect(self.show_device_link)
        self.screen_welcome.open_wifi_config_requested.connect(self.show_wifi_config)
        self.screen_welcome.activate_requested.connect(self.viewmodel.activate_device_manually)
        self.screen_thanks.close_requested.connect(self.show_welcome)
        self.screen_device_link.back_requested.connect(self.close_device_link)

        # ViewModel state signals
        self.viewmodel.state_loading.connect(self.show_loading)
        self.viewmodel.state_welcome.connect(self.show_welcome)
        self.viewmodel.state_feedback.connect(self.show_feedback)
        self.viewmodel.state_thanks.connect(self.show_thanks)
        self.viewmodel.state_activation_required.connect(self._set_activation_prompt)
        self.viewmodel.state_toast.connect(self._show_toast)

    def _set_activation_prompt(self, visible: bool, tooltip: str):
        """Show or hide activation call-to-action on welcome screen."""
        self.screen_welcome.set_activation_prompt_visible(visible, tooltip)

    def _show_toast(self, message: str, is_success: bool):
        """Display temporary toast on welcome screen."""
        self.screen_welcome.show_toast(message, is_success)

    def show_loading(self, message: str):
        """Route UI to loading screen and update progress text."""
        self.screen_loading.set_message(message)
        self._fade_to(0)

    def _fade_to(self, index, setup_fn=None):
        """Switch screen without opacity effects to keep painting stable."""
        if setup_fn:
            # setup_fn lets caller inject per-screen data before display.
            setup_fn()
        self.stacked_widget.setCurrentIndex(index)
        self.logger.info("Switch screen to index=%s", index)

    def show_welcome(self):
        """Route UI to idle welcome screen."""
        self.logger.info("Show welcome")
        self._fade_to(1)

    def show_feedback(self, data: TrashData):
        """Show feedback screen populated by latest detection payload."""
        def setup():
            self.screen_feedback.update_ui(data)
        self.logger.info("Show feedback for %s (conf=%.3f)", data.category, data.confidence)
        self._fade_to(2, setup)

    def show_thanks(self):
        """Show appreciation screen after user feedback submission."""
        self.logger.info("Show thanks")
        self._fade_to(3)

    def show_device_link(self):
        """Pause detection and display QR/MAC pairing screen."""
        self.viewmodel.worker.pause_detection()
        mac = self.viewmodel.get_device_mac_address()
        claim_code = self.viewmodel.get_device_claim_code()

        def setup():
            self.screen_device_link.update_mac_and_qr(mac, claim_code)
        self.logger.info("Show device link, mac=%s, claim_code=%s", mac, claim_code)

        self._fade_to(4, setup)

    def close_device_link(self):
        """Close pairing screen and resume normal detection flow."""
        self.viewmodel.worker.resume_detection()
        self.viewmodel.on_back_from_device_link()
        self.logger.info("Close device link")
        self._fade_to(1)

    def show_wifi_config(self):
        """Open modal dialog for Wi-Fi setup."""
        self.logger.info("Open wifi config dialog")
        self.viewmodel.worker.pause_detection()
        dialog = WifiConfigDialog(self)
        try:
            dialog.exec()
        finally:
            self.viewmodel.worker.resume_detection()

    def closeEvent(self, event):
        """Ensure background services are stopped before app exits."""
        self.logger.info("Main window closing")
        self.viewmodel.shutdown()
        event.accept()