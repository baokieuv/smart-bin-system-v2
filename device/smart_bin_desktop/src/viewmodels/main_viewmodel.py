import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from PyQt6.QtCore import QObject, QTimer, pyqtSignal

from src.models.device_config_dto import DeviceConfigDto
from src.models.trash_model import TrashData
from src.repository.actuator_repository import ActuatorRepository
from src.repository.device_repository import DeviceClient
from src.repository.thingsboard_repository import ThingsboardClient
from src.services.detection_metadata_store import DetectionMetadataStore
from src.services.detection_upload_manager import DetectionUploadManager
from src.services.device_config_store import DeviceConfigStore
from src.services.main_viewmodel_runtime import MainViewModelRuntime
from src.utils.config import APP_CONFIG

# Error codes that have dedicated hint messages.
_ERR_NOT_ACTIVE = "SMB3010"
_ERR_NOT_FOUND = {"DEVICE_NOT_FOUND", "SMB3004"}

# Markers used to detect garbage HTML/JS in backend error bodies.
_SUSPICIOUS_RESPONSE_MARKERS = (
    "document.", "window.", "XMLHttpRequest", "addEventListener",
    "JSON.stringify", "error-feedback-survey", "function(){",
    "function ()", "<html", "<!doctype",
)


class MainViewModel(QObject):
    """Application coordinator between detection worker, repositories, and UI.

    Responsibilities
    ----------------
    - Owns all QTimers and connects them to runtime helpers.
    - Receives ``trash_detected`` from ``DetectionWorker`` and drives the
      feedback flow (persist → stepper → feedback screen → thanks → welcome).
    - Exposes telemetry, activation, and shutdown hooks for the view layer.

    Heavy background logic (config refresh, OTA, fill-level polling) lives in
    ``MainViewModelRuntime`` to keep this class focused on orchestration.
    """

    # Signals consumed by MainWindow for screen transitions.
    state_loading = pyqtSignal(str)
    state_welcome = pyqtSignal()
    state_feedback = pyqtSignal(TrashData)
    state_thanks = pyqtSignal()
    state_activation_required = pyqtSignal(bool, str)
    state_toast = pyqtSignal(str, bool)

    def __init__(self, worker) -> None:
        super().__init__()
        self.logger = logging.getLogger("smart_bin.main_viewmodel")
        self.worker = worker

        # --- Repositories / services ---
        self.actuator_client = ActuatorRepository()
        self.device_client = DeviceClient(actuator_client=self.actuator_client)
        self.thingsboard_client = ThingsboardClient()
        self.device_config_store = DeviceConfigStore(APP_CONFIG.paths.device_config_cache_path, self.logger)
        self.metadata_store = DetectionMetadataStore(APP_CONFIG.paths.detection_metadata_dir, self.logger)
        self.upload_manager = DetectionUploadManager(self.metadata_store, self.device_client, self.logger)
        self.runtime = MainViewModelRuntime(self)

        # --- Runtime state ---
        self.device_config: DeviceConfigDto | None = None
        self.access_token: str | None = None
        self.current_detection_metadata_path: Path | None = None
        self.latest_fill_levels: list[int] | None = None
        self.latest_bin_version: str | None = None
        self.latest_app_version_result = None
        self.latest_ota_result: dict | None = None

        # Config-derived values (updated by runtime on each refresh).
        self.device_config_polling_seconds: int = APP_CONFIG.default_polling_interval_s
        self.full_threshold: float = APP_CONFIG.default_full_threshold
        self.device_height: float = APP_CONFIG.default_device_height
        self.target_bin_firmware_version: str | None = None
        self.target_desktop_version: str | None = None

        # Telemetry counters.
        self._disposal_count_total = 0
        self._disposal_count_since_last_heartbeat = 0

        # Background task guard flags (read/written by MainViewModelRuntime).
        self._app_version_refresh_running = False
        self._fill_levels_refresh_running = False
        self._ota_upload_running = False
        self._telemetry_reauth_running = False
        self._ota_update_active = False

        # --- Wire signals ---
        self.worker.trash_detected.connect(self._on_trash_detected)
        self.worker.worker_ready.connect(self._on_worker_ready)

        # --- Build timers ---
        self._build_timers()
        self.logger.info("MainViewModel initialized")

    # ------------------------------------------------------------------
    # Timer setup
    # ------------------------------------------------------------------

    def _make_timer(self, interval_ms: int, slot, *, single_shot: bool = False) -> QTimer:
        t = QTimer(self)
        t.setSingleShot(single_shot)
        t.setInterval(interval_ms)
        t.timeout.connect(slot)
        return t

    def _build_timers(self) -> None:
        cfg = APP_CONFIG.viewmodel
        esp_cfg = APP_CONFIG.esp32_ota

        self.feedback_timer = self._make_timer(cfg.feedback_timeout_ms, self.reset_to_welcome, single_shot=True)
        self.thanks_timer = self._make_timer(cfg.thanks_timeout_ms, self.reset_to_welcome, single_shot=True)
        self.telemetry_timer = self._make_timer(cfg.telemetry_interval_ms, self.runtime.send_periodic_telemetry)
        self.upload_timer = self._make_timer(cfg.upload_interval_ms, self._upload_detection_results_batch)
        self.app_version_timer = self._make_timer(cfg.app_version_check_interval_ms, self.runtime.check_app_version)
        self.fill_levels_poll_timer = self._make_timer(
            esp_cfg.fill_levels_poll_interval_seconds * 1000, self.runtime.poll_fill_levels
        )
        # config_refresh_timer interval is dynamic; set initial value here.
        self.config_refresh_timer = self._make_timer(
            self.device_config_polling_seconds * 1000, self.runtime.retry_refresh_device_config
        )

    # ------------------------------------------------------------------
    # System lifecycle
    # ------------------------------------------------------------------

    def start_system(self) -> None:
        """Start camera/AI worker; the ``worker_ready`` signal drives the rest."""
        self.state_loading.emit("Initializing AI model and camera...")
        self.worker.start()
        self.logger.info("start_system invoked")

    def shutdown(self) -> None:
        """Stop all timers, close serial, and join the worker thread."""
        for timer in (
            self.feedback_timer, self.thanks_timer, self.telemetry_timer,
            self.config_refresh_timer, self.app_version_timer,
            self.upload_timer, self.fill_levels_poll_timer,
        ):
            timer.stop()
        self.actuator_client.close_serial()
        self.worker.stop()
        self.logger.info("MainViewModel shutdown completed")

    def enter_ota_update_mode(self, message: str = "Hệ thống đang cập nhật...") -> None:
        """Freeze normal activity and show the loading screen while OTA runs."""
        self._ota_update_active = True
        for timer in (
            self.feedback_timer,
            self.thanks_timer,
            self.telemetry_timer,
            self.config_refresh_timer,
            self.app_version_timer,
            self.upload_timer,
            self.fill_levels_poll_timer,
        ):
            timer.stop()
        self.worker.pause_detection()
        self.state_loading.emit(message)
        self.logger.info("Entered OTA update mode")

    def exit_ota_update_mode(self) -> None:
        """Return from OTA mode and resume normal runtime activity."""
        if not self._ota_update_active:
            return

        self._ota_update_active = False
        self.worker.resume_detection()

        if self.access_token and not self.telemetry_timer.isActive():
            self.telemetry_timer.start()
        if not self.config_refresh_timer.isActive():
            self.config_refresh_timer.start()
        if not self.app_version_timer.isActive():
            self.app_version_timer.start()
        if not self.upload_timer.isActive():
            self.upload_timer.start()
        if not self.fill_levels_poll_timer.isActive():
            self.fill_levels_poll_timer.start()

        self.reset_to_welcome()
        self.logger.info("Exited OTA update mode")

    # ------------------------------------------------------------------
    # Worker callbacks
    # ------------------------------------------------------------------

    def _on_worker_ready(self, ready: bool, message: str) -> None:
        if not ready:
            self.state_loading.emit(f"Initialization failed: {message}")
            self.state_toast.emit("AI initialization failed", False)
            return

        self.state_loading.emit("Initialization complete. Connecting services...")
        self.runtime.refresh_device_config(reason="startup")
        self.reset_to_welcome()
        self.runtime.check_app_version()

        for timer, label in (
            (self.app_version_timer, "app version check"),
            (self.upload_timer, "batch upload"),
            (self.fill_levels_poll_timer, "fill levels polling"),
        ):
            if not timer.isActive():
                timer.start()
                self.logger.info("Started %s (interval=%dms)", label, timer.interval())

    def _on_trash_detected(self, trash_data: TrashData) -> None:
        """Persist detection, actuate stepper, and transition to feedback screen."""
        if self._ota_update_active:
            self.logger.info("Ignoring detection while OTA update is active")
            return

        self.logger.info(
            "Detection received: category=%s label=%s conf=%.3f id=%s",
            trash_data.category, trash_data.label, trash_data.confidence, trash_data.detection_id,
        )

        self.current_detection_metadata_path = self.metadata_store.save_detection(trash_data, "not_rated")
        self.worker.pause_detection()

        angle = trash_data.stepper_angle
        ok, msg = self.actuator_client.control_step_motor(angle)
        if ok:
            self.logger.info(
                "Stepper queued: category=%s group=%s angle=%d°",
                trash_data.category, trash_data.waste_group.name, angle,
            )
        else:
            self.logger.warning("Stepper command failed: %s", msg)

        self._disposal_count_total += 1
        self._disposal_count_since_last_heartbeat += 1

        self.state_feedback.emit(trash_data)
        self.feedback_timer.start(APP_CONFIG.viewmodel.feedback_timeout_ms)
        self.logger.info("Feedback screen opened (timeout=%dms)", APP_CONFIG.viewmodel.feedback_timeout_ms)

    # ------------------------------------------------------------------
    # Feedback / screen flow
    # ------------------------------------------------------------------

    def handle_feedback(self, is_correct: bool) -> None:
        """Record user feedback and transition to the thanks screen."""
        if self._ota_update_active:
            self.logger.info("Ignoring feedback while OTA update is active")
            return

        self.feedback_timer.stop()
        self._update_current_feedback("correct" if is_correct else "wrong")
        self.logger.info("User feedback: %s", "correct" if is_correct else "wrong")
        self.state_thanks.emit()
        self.thanks_timer.start(APP_CONFIG.viewmodel.thanks_timeout_ms)

    def reset_to_welcome(self) -> None:
        """Return to welcome screen and resume real-time detection."""
        if self._ota_update_active:
            self.logger.info("Skipping reset_to_welcome while OTA update is active")
            return

        self.feedback_timer.stop()
        self.thanks_timer.stop()
        self.worker.resume_detection()
        self.state_welcome.emit()
        self.logger.info("Reset to welcome screen")

    # ------------------------------------------------------------------
    # Device activation
    # ------------------------------------------------------------------

    def activate_device(self):
        """Activate this device and persist the returned access token."""
        success, result = self.device_client.activate_device()
        if success:
            token = getattr(getattr(result, "data", None), "access_token", None)
            if token:
                self._persist_access_token(token)
        return success, result

    def activate_device_manually(self) -> None:
        """Handle user-triggered activation and display a toast."""
        self.logger.info("User requested device activation")
        success, result = self.activate_device()
        if success:
            self.state_toast.emit("Device activation successful", True)
            self.runtime.refresh_device_config(reason="activate_success")
            return
        self.logger.warning("Device activation failed: %s", result)
        self.state_toast.emit(
            f"Kích hoạt thiết bị thất bại: {self._extract_user_friendly_error_message(result)}",
            False,
        )

    def on_back_from_device_link(self) -> None:
        """Refresh config after returning from the device-link screen."""
        self.runtime.refresh_device_config(reason="back_from_device_link")

    # ------------------------------------------------------------------
    # Telemetry
    # ------------------------------------------------------------------

    def send_telemetry(self) -> tuple[bool, str, int | None]:
        if not self.access_token:
            return False, "Access token is missing", None

        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        payload: dict = {"timestamp": now_ms, "total_waste_count": self._disposal_count_total}

        if isinstance(self.latest_fill_levels, list):
            for i, v in enumerate(self.latest_fill_levels):
                try:
                    payload[f"bin{i + 1}"] = int(v)
                except (TypeError, ValueError):
                    payload[f"bin{i + 1}"] = None

        ok, msg, status_code = self.thingsboard_client.send_telemetry(self.access_token, payload)
        if ok:
            self._disposal_count_since_last_heartbeat = 0
        return ok, msg, status_code

    # ------------------------------------------------------------------
    # Misc public helpers
    # ------------------------------------------------------------------

    def get_device_mac_address(self) -> str:
        return self.device_client.get_mac_address()

    def get_device_claim_code(self) -> str:
        return self.device_client.get_claim_code()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _persist_access_token(self, access_token: str) -> None:
        self.access_token = access_token
        cached = self.device_config_store.load() or DeviceConfigDto()
        cached.access_token = access_token
        self.device_config_store.save(cached)

    def _update_current_feedback(self, feedback: str) -> None:
        if self.current_detection_metadata_path:
            self.metadata_store.update_feedback(Path(self.current_detection_metadata_path), feedback)

    def _upload_detection_results_batch(self) -> None:
        self.upload_manager.run_batch(APP_CONFIG.viewmodel.upload_batch_size)

    # ------------------------------------------------------------------
    # Error message helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _sanitize_backend_message(message: str) -> str:
        """Strip HTML tags, collapse whitespace, reject garbage responses."""
        cleaned = re.sub(r"<[^>]*>", " ", message)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if not cleaned:
            return "Unknown error"
        if len(cleaned) > 180 or any(m.lower() in cleaned.lower() for m in _SUSPICIOUS_RESPONSE_MARKERS):
            return "Backend returned an invalid response"
        return cleaned

    def _extract_error_code(self, result) -> str | None:
        if isinstance(result, dict):
            code = result.get("code")
            return str(code).upper() if code else None
        if isinstance(result, str):
            upper = result.upper()
            if _ERR_NOT_ACTIVE in upper:
                return _ERR_NOT_ACTIVE
            if "DEVICE NOT FOUND" in upper or "DEVICE_NOT_FOUND" in upper:
                return "DEVICE_NOT_FOUND"
        return None

    def _extract_error_message(self, result) -> str:
        if isinstance(result, dict):
            raw = str(result.get("message") or result.get("code") or "Unknown error")
        else:
            raw = str(result)
        return self._sanitize_backend_message(raw)

    def _extract_user_friendly_error_message(self, result) -> str:
        if isinstance(result, dict):
            code = str(result.get("code") or "").strip()
            msg = self._extract_error_message(result)
            return f"{code}: {msg}" if code and code.lower() not in msg.lower() else msg
        msg = self._extract_error_message(result)
        return msg[:117].rstrip() + "..." if len(msg) > 120 else msg

    def _is_device_not_active_error(self, result) -> bool:
        if self._extract_error_code(result) == _ERR_NOT_ACTIVE:
            return True
        return "not active" in self._extract_error_message(result).lower()

    def _is_device_not_found_error(self, result) -> bool:
        if self._extract_error_code(result) in _ERR_NOT_FOUND:
            return True
        return "device not found" in self._extract_error_message(result).lower()

    def _build_activation_hint_message(self, result) -> str:
        if self._is_device_not_active_error(result):
            return "Device is not activated. Press Activate Device to continue."
        if self._is_device_not_found_error(result):
            return "Device is not registered. Press Activate Device to register and activate."
        return "Device config is unavailable. Press Activate Device and app will retry every 5 minutes."