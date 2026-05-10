import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from PyQt6.QtCore import QObject, pyqtSignal, QTimer
from src.models.trash_model import TrashData
from src.repository.device_repository import DeviceClient
from src.repository.actuator_repository import ActuatorRepository
from src.repository.thingsboard_repository import ThingsboardClient
from src.services.device_config_store import DeviceConfigStore
from src.services.detection_metadata_store import DetectionMetadataStore
from src.services.detection_upload_manager import DetectionUploadManager
from src.services.main_viewmodel_runtime import MainViewModelRuntime
from src.utils.config import APP_CONFIG


class MainViewModel(QObject):
    """Application coordinator between worker, repositories and UI states.

    This class remains as orchestration layer only; metadata persistence and
    upload batch logic are delegated to dedicated helper services.
    """

    # State signals consumed by MainWindow for screen transitions.
        # State signals consumed by MainWindow for screen transitions.
    state_loading = pyqtSignal(str)
    state_welcome = pyqtSignal()
    state_feedback = pyqtSignal(TrashData)
    state_thanks = pyqtSignal()
    state_activation_required = pyqtSignal(bool, str)
    state_toast = pyqtSignal(str, bool)
    
    # state_thanks = pyqtSignal()
    # state_activation_required = pyqtSignal(bool, str)
    # state_toast = pyqtSignal(str, bool)

    def __init__(self, worker):
        super().__init__()
        self.logger = logging.getLogger("smart_bin.main_viewmodel")
        self.worker = worker
        self.device_client = DeviceClient()
        self.thingsboard_client = ThingsboardClient()
        self.actuator_client = ActuatorRepository()
        self.device_config_store = DeviceConfigStore(APP_CONFIG.paths.device_config_cache_path, self.logger)
        self.runtime = MainViewModelRuntime(self)
        # Disposal counters used for telemetry payloads
        self._disposal_count_total = 0
        self._disposal_count_since_last_heartbeat = 0
        self._firmware_update_state = None
        self.metadata_store = DetectionMetadataStore(APP_CONFIG.paths.detection_metadata_dir, self.logger)
        self.upload_manager = DetectionUploadManager(self.metadata_store, self.device_client, self.logger)
        self.device_config = None
        self.access_token = None
        self.telemetry_interval_ms = APP_CONFIG.viewmodel.telemetry_interval_ms
        self.app_version_check_interval_ms = APP_CONFIG.viewmodel.app_version_check_interval_ms
        self.upload_interval_ms = APP_CONFIG.viewmodel.upload_interval_ms
        self.upload_batch_size = APP_CONFIG.viewmodel.upload_batch_size
        self.current_detection_metadata_path = None
        self.fill_levels_poll_interval_seconds = APP_CONFIG.esp32_ota.fill_levels_poll_interval_seconds
        self.latest_fill_levels = None  # Store latest fill levels from polling
        self.device_config_polling_seconds = 5 * 60
        self.full_threshold = 90.0
        self.device_height = 100.0
        self.target_bin_firmware_version = None
        self.target_desktop_version = None
        self.latest_bin_version = None
        self.latest_app_version_result = None
        self.latest_ota_result = None
        self._app_version_refresh_running = False
        self._fill_levels_refresh_running = False
        self._ota_upload_running = False
        
        # Connect worker events to ViewModel handlers.
        self.worker.trash_detected.connect(self._on_trash_detected)
        self.worker.worker_ready.connect(self._on_worker_ready)

        # Initialize ViewModel timers.
        self.feedback_timer = QTimer()
        self.feedback_timer.setSingleShot(True)
        self.feedback_timer.timeout.connect(self.reset_to_welcome)

        self.thanks_timer = QTimer()
        self.thanks_timer.setSingleShot(True)
        self.thanks_timer.timeout.connect(self.reset_to_welcome)

        self.telemetry_timer = QTimer()
        self.telemetry_timer.setSingleShot(False)
        self.telemetry_timer.setInterval(self.telemetry_interval_ms)
        self.telemetry_timer.timeout.connect(self._send_periodic_telemetry)

        self.config_refresh_timer = QTimer()
        self.config_refresh_timer.setSingleShot(False)
        self.config_refresh_timer.setInterval(self.device_config_polling_seconds * 1000)
        self.config_refresh_timer.timeout.connect(self._retry_refresh_device_config)

        self.app_version_timer = QTimer()
        self.app_version_timer.setSingleShot(False)
        self.app_version_timer.setInterval(self.app_version_check_interval_ms)
        self.app_version_timer.timeout.connect(self._check_app_version)

        self.upload_timer = QTimer()
        self.upload_timer.setSingleShot(False)
        self.upload_timer.setInterval(self.upload_interval_ms)
        self.upload_timer.timeout.connect(self._upload_detection_results_batch)

        self.fill_levels_poll_timer = QTimer()
        self.fill_levels_poll_timer.setSingleShot(False)
        self.fill_levels_poll_timer.setInterval(self.fill_levels_poll_interval_seconds * 1000)  # Convert seconds to ms
        self.fill_levels_poll_timer.timeout.connect(self._poll_fill_levels)
        self.logger.info("MainViewModel initialized")

    def start_system(self):
        """Start camera/AI worker and wait for ready callback to continue flow."""
        self.state_loading.emit("Initializing AI model and camera...")
        self.worker.start()  # Run camera + AI pipeline in background thread.
        self.logger.info("start_system invoked")

    def _on_worker_ready(self, ready: bool, message: str):
        """Handle worker init result and bootstrap telemetry/upload timers."""
        if not ready:
            self.state_loading.emit(f"Initialization failed: {message}")
            self.state_toast.emit("AI initialization failed", False)
            return

        self.state_loading.emit("Initialization complete. Connecting services...")
        self.runtime.refresh_device_config(reason="startup")
        self.reset_to_welcome()
        self.runtime.check_app_version()

        if not self.app_version_timer.isActive():
            self.app_version_timer.start()
            self.logger.info("Started app version check every %sms", self.app_version_check_interval_ms)

        if not self.upload_timer.isActive():
            self.upload_timer.start()
            self.logger.info(
                "Started batch upload every %sms, max %s images per batch",
                self.upload_interval_ms,
                self.upload_batch_size,
            )

        if not self.fill_levels_poll_timer.isActive():
            self.fill_levels_poll_timer.start()
            self.logger.info(
                "Started fill levels polling every %s seconds",
                self.fill_levels_poll_interval_seconds,
            )

    def _on_trash_detected(self, trash_data: TrashData):
        """Persist fresh detection, pause worker and route UI to feedback screen."""
        self.logger.info(
            "Detection received: category=%s label=%s conf=%.3f id=%s",
            trash_data.category,
            trash_data.label,
            trash_data.confidence,
            trash_data.detection_id,
        )
        # Persist raw result first so feedback can patch the same metadata file later.
        self.current_detection_metadata_path = self.metadata_store.save_detection(trash_data, "not_rated")
        self.worker.pause_detection()  # Pause AI while collecting user feedback.
        
        # Trigger stepper motor control based on waste category.
        waste_group = trash_data.waste_group
        angle = trash_data.stepper_angle
        self.logger.info(
            "Activating stepper motor: category=%s group=%s angle=%d°",
            trash_data.category,
            waste_group.name,
            angle,
        )
        ok, message = self.actuator_client.control_step_motor(angle)
        if ok:
            self.logger.info("Stepper motor command succeeded: %s", message)
        else:
            self.logger.warning("Stepper motor command failed: %s", message)
        # Increment disposal counters for telemetry
        try:
            self._disposal_count_total += 1
            self._disposal_count_since_last_heartbeat += 1
        except Exception:
            self.logger.exception("Failed to increment disposal counters")
        
        self.state_feedback.emit(trash_data)  # Notify view to show Feedback screen.
        self.feedback_timer.start(APP_CONFIG.viewmodel.feedback_timeout_ms)
        self.logger.info(
            "Switched to feedback screen, timeout=%sms",
            APP_CONFIG.viewmodel.feedback_timeout_ms,
        )

    def handle_feedback(self, is_correct: bool):
        """Apply user feedback to metadata, then move to thanks state."""
        self.feedback_timer.stop()
        # Update feedback on the current detection metadata.
        self._update_current_feedback("correct" if is_correct else "wrong")
        self.logger.info("User feedback: %s", "correct" if is_correct else "wrong")
        
        self.state_thanks.emit()  # Notify view to show Thanks screen.
        self.thanks_timer.start(APP_CONFIG.viewmodel.thanks_timeout_ms)
        self.logger.info(
            "Switched to thanks screen, timeout=%sms",
            APP_CONFIG.viewmodel.thanks_timeout_ms,
        )

    def reset_to_welcome(self):
        """Return to welcome screen and resume real-time detection."""
        # Any timeout or manual action routes back to welcome + resumes detector.
        self.feedback_timer.stop()
        self.thanks_timer.stop()
        self.worker.resume_detection()  # Resume AI detection.
        self.state_welcome.emit()  # Notify view to return to Welcome screen.
        self.logger.info("Reset to welcome screen")


    def activate_device(self):
        """Proxy DeviceClient activation API for manual user action."""
        return self.device_client.activate_device()
    
    def send_telemetry(self):
        """Send heartbeat telemetry if current access token exists."""
        if not self.access_token:
            return False, "Access token is missing"
        # Build payload with timestamp, disposal counts and latest fill-levels
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

        payload = {
            "timestamp": now_ms,
            "disposal_count_total": int(self._disposal_count_total),
            "disposal_count_interval": int(self._disposal_count_since_last_heartbeat),
        }

        if self.latest_fill_levels and isinstance(self.latest_fill_levels, list):
            # latest_fill_levels is [bin1, bin2, bin3, bin4]
            for i, v in enumerate(self.latest_fill_levels):
                try:
                    payload[f"bin{i+1}"] = int(v)
                except Exception:
                    payload[f"bin{i+1}"] = None

        ok, msg = self.thingsboard_client.send_telemetry(self.access_token, payload)
        if ok:
            # Reset interval counter only when telemetry successfully sent
            self._disposal_count_since_last_heartbeat = 0
        return ok, msg

    def get_device_mac_address(self) -> str:
        """Expose MAC for device-link QR screen."""
        return self.device_client.get_mac_address()

    def _initialize_telemetry_loop(self):
        self.runtime.refresh_device_config(reason="initialize_telemetry")

    def _refresh_device_config(self, reason: str):
        self.runtime.refresh_device_config(reason)

    def _retry_refresh_device_config(self):
        self.runtime.retry_refresh_device_config()

    def _send_periodic_telemetry(self):
        self.runtime.send_periodic_telemetry()

    def _check_app_version(self):
        self.runtime.check_app_version()

    def _poll_fill_levels(self):
        self.runtime.poll_fill_levels()

    def shutdown(self):
        """Stop timers and worker when app closes."""
        self.telemetry_timer.stop()
        self.config_refresh_timer.stop()
        self.app_version_timer.stop()
        self.upload_timer.stop()
        self.fill_levels_poll_timer.stop()
        self.actuator_client.close_serial()
        self.worker.stop()
        self.logger.info("MainViewModel shutdown completed")

    def on_back_from_device_link(self):
        """Refresh config after returning from device-link flow."""
        self.runtime.refresh_device_config(reason="back_from_device_link")

    def activate_device_manually(self):
        """Handle user-triggered activation and display toast feedback."""
        self.logger.info("User requested device activation")
        success, result = self.activate_device()
        if success:
            self.state_toast.emit("Device activation successful", True)
            self.runtime.refresh_device_config(reason="activate_success")
            return

        self.logger.warning("Device activation failed: %s", result)
        message = self._extract_user_friendly_error_message(result)
        self.state_toast.emit(f"Kích hoạt thiết bị thất bại: {message}", False)

    def _extract_error_code(self, result) -> str | None:
        """Extract backend error code from either dict payload or plain text."""
        if isinstance(result, dict):
            code = result.get("code")
            return str(code).upper() if code else None
        if isinstance(result, str):
            normalized = result.upper()
            if "AVT3010" in normalized:
                return "AVT3010"
            if "DEVICE NOT FOUND" in normalized or "DEVICE_NOT_FOUND" in normalized:
                return "DEVICE_NOT_FOUND"
        return None

    def _extract_error_message(self, result) -> str:
        """Build user-facing error message from structured/unstructured results."""
        if isinstance(result, dict):
            raw_message = str(result.get("message") or result.get("code") or "Unknown error")
            return self._sanitize_backend_message(raw_message)
        return self._sanitize_backend_message(str(result))

    def _sanitize_backend_message(self, message: str) -> str:
        """Compress backend responses into short, readable UI text."""
        cleaned = re.sub(r"<[^>]*>", " ", message)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()

        if not cleaned:
            return "Unknown error"

        suspicious_markers = (
            "document.",
            "window.",
            "XMLHttpRequest",
            "addEventListener",
            "JSON.stringify",
            "error-feedback-survey",
            "function(){",
            "function ()",
            "<html",
            "<!doctype",
        )
        if len(cleaned) > 180 or any(marker.lower() in cleaned.lower() for marker in suspicious_markers):
            return "Backend returned an invalid response"

        return cleaned

    def _extract_user_friendly_error_message(self, result) -> str:
        """Return a concise error message suitable for toast UI."""
        if isinstance(result, dict):
            code = str(result.get("code") or "").strip()
            message = self._extract_error_message(result)
            if code and message and code.lower() not in message.lower():
                return f"{code}: {message}"
            return message

        message = self._extract_error_message(result)
        if len(message) > 120:
            return message[:117].rstrip() + "..."
        return message

    def _is_device_not_active_error(self, result) -> bool:
        """Identify backend response indicating this device exists but is not active."""
        if self._extract_error_code(result) == "AVT3010":
            return True

        message = self._extract_error_message(result).lower()
        return "not active" in message or "not activated" in message

    def _is_device_not_found_error(self, result) -> bool:
        """Identify backend response indicating this device MAC is unknown."""
        code = self._extract_error_code(result)
        if code in {"DEVICE_NOT_FOUND", "AVT3004"}:
            return True

        message = self._extract_error_message(result).lower()
        return "device not found" in message

    def _build_activation_hint_message(self, result) -> str:
        """Create activation hint text for any no-token state."""
        if self._is_device_not_active_error(result):
            return "Device is not activated. Press Activate Device to continue."

        if self._is_device_not_found_error(result):
            return "Device is not registered. Press Activate Device to register and activate."

        return "Device config is unavailable. Press Activate Device and app will retry every 5 minutes."

    def _save_detection_metadata(self, trash_data: TrashData, feedback: str) -> Path:
        """Backward-compatible wrapper; delegated to DetectionMetadataStore."""
        return self.metadata_store.save_detection(trash_data, feedback)

    def _update_current_feedback(self, feedback: str):
        """Patch feedback for current detection metadata, if available."""
        if not self.current_detection_metadata_path:
            return
        self.metadata_store.update_feedback(Path(self.current_detection_metadata_path), feedback)

    def _upload_detection_results_batch(self):
        """Timer callback for batched detection upload via helper manager."""
        self.upload_manager.run_batch(self.upload_batch_size)

    def _collect_pending_upload_items(self) -> list[dict]:
        """Backward-compatible wrapper returning dict shape used by legacy callers."""
        items = self.metadata_store.collect_pending_items(self.upload_batch_size)
        return [
            {
                "filename": item.filename,
                "image_path": item.image_path,
                "metadata_path": item.metadata_path,
                "metadata": item.metadata,
            }
            for item in items
        ]

    def _safe_delete_file(self, file_path: str):
        """Backward-compatible delete helper; delegated to metadata store."""
        self.metadata_store.safe_delete(file_path)