import json
import logging
import re
from datetime import datetime, timezone
from dataclasses import dataclass
from pathlib import Path

from PyQt6.QtCore import QObject, pyqtSignal, QTimer
from src.models.trash_model import TrashData
from src.repository.device_repository import DeviceClient
from src.repository.thingsboard_repository import ThingsboardClient
from src.repository.actuator_repository import ActuatorRepository
from src.utils.config import APP_CONFIG


@dataclass(frozen=True)
class PendingUploadItem:
    """One detection record ready to be uploaded to backend."""

    filename: str
    image_path: str
    metadata_path: str
    metadata: dict


class DetectionMetadataStore:
    """Encapsulates metadata JSON read/write concerns for detection events."""

    def __init__(self, metadata_dir: Path, logger: logging.Logger):
        self.metadata_dir = metadata_dir
        self.logger = logger
        self.metadata_dir.mkdir(parents=True, exist_ok=True)

    def save_detection(self, trash_data: TrashData, feedback: str) -> Path:
        """Persist initial detection metadata so upload can happen asynchronously."""
        detected_at = datetime.now(timezone.utc).isoformat()
        filename = Path(trash_data.image_path).name if trash_data.image_path else None
        metadata = {
            "detectionId": trash_data.detection_id,
            "detectedAt": detected_at,
            "image": trash_data.image_path,
            "filename": filename,
            "category": trash_data.category,
            "confidence": round(float(trash_data.confidence), 6),
            "label": trash_data.label,
            "userFeedback": feedback,
        }

        metadata_name = trash_data.detection_id or f"detection_{int(datetime.now().timestamp() * 1000)}"
        metadata_path = self.metadata_dir / f"{metadata_name}.json"
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=True, indent=2)

        self.logger.info("Metadata saved: %s", metadata_path.name)
        return metadata_path

    def update_feedback(self, metadata_path: Path, feedback: str) -> None:
        """Patch user feedback into previously stored metadata file."""
        if not metadata_path.exists():
            return

        try:
            with open(metadata_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)

            metadata["userFeedback"] = feedback
            metadata["feedbackAt"] = datetime.now(timezone.utc).isoformat()

            with open(metadata_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=True, indent=2)
            self.logger.info("Feedback updated=%s for %s", feedback, metadata_path.name)
        except (OSError, json.JSONDecodeError) as e:
            self.logger.exception("Failed to update feedback metadata: %s", e)

    def collect_pending_items(self, upload_batch_size: int) -> list[PendingUploadItem]:
        """Read metadata files and build a validated upload batch."""
        candidates: list[PendingUploadItem] = []
        metadata_files = sorted(self.metadata_dir.glob("*.json"), key=lambda p: p.stat().st_mtime)

        for metadata_path in metadata_files:
            if len(candidates) >= upload_batch_size:
                break

            try:
                with open(metadata_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
            except (OSError, json.JSONDecodeError) as e:
                self.logger.warning("Skipping invalid metadata %s: %s", metadata_path.name, e)
                continue

            image_path = metadata.get("image")
            if not image_path:
                self.logger.warning("Skipping metadata without image path: %s", metadata_path.name)
                continue

            image_file = Path(image_path)
            if not image_file.exists():
                self.logger.warning("Image does not exist, skipping: %s", image_path)
                continue

            filename = metadata.get("filename") or image_file.name
            candidates.append(
                PendingUploadItem(
                    filename=filename,
                    image_path=str(image_file),
                    metadata_path=str(metadata_path),
                    metadata=metadata,
                )
            )

        return candidates

    def safe_delete(self, file_path: str) -> None:
        """Best-effort delete used after successful upload confirmation."""
        try:
            Path(file_path).unlink(missing_ok=True)
        except OSError as e:
            self.logger.warning("Failed to delete file %s: %s", file_path, e)


class DetectionUploadManager:
    """Coordinates upload batch execution; keeps upload state out of ViewModel."""

    def __init__(self, metadata_store: DetectionMetadataStore, device_client: DeviceClient, logger: logging.Logger):
        self.metadata_store = metadata_store
        self.device_client = device_client
        self.logger = logger
        self._upload_in_progress = False

    def run_batch(self, upload_batch_size: int) -> None:
        """Upload pending detections and cleanup local files when confirmed."""
        if self._upload_in_progress:
            self.logger.info("Skipping upload tick because previous batch is still running")
            return

        items = self.metadata_store.collect_pending_items(upload_batch_size)
        if not items:
            self.logger.info("No pending detections to upload")
            return

        self._upload_in_progress = True
        try:
            success_count = 0
            for item in items:
                ok, response = self.device_client.send_report_classification(
                    image_path=item.image_path,
                    metadata=item.metadata,
                )
                if not ok:
                    self.logger.warning(
                        "Detection upload via presigned URL failed file=%s: %s",
                        item.filename,
                        response,
                    )
                    continue

                self.metadata_store.safe_delete(item.image_path)
                self.metadata_store.safe_delete(item.metadata_path)
                success_count += 1

            self.logger.info(
                "Detection upload batch completed: success=%s/%s",
                success_count,
                len(items),
            )
        finally:
            self._upload_in_progress = False

class MainViewModel(QObject):
    """Application coordinator between worker, repositories and UI states.

    This class remains as orchestration layer only; metadata persistence and
    upload batch logic are delegated to dedicated helper services.
    """

    # State signals consumed by MainWindow for screen transitions.
    state_loading = pyqtSignal(str)
    state_welcome = pyqtSignal()
    state_feedback = pyqtSignal(TrashData)
    state_thanks = pyqtSignal()
    state_activation_required = pyqtSignal(bool, str)
    state_toast = pyqtSignal(str, bool)

    def __init__(self, worker):
        super().__init__()
        self.logger = logging.getLogger("smart_bin.main_viewmodel")
        self.worker = worker
        self.device_client = DeviceClient()
        self.thingsboard_client = ThingsboardClient()
        self.actuator_client = ActuatorRepository()
        # Disposal counters used for telemetry payloads
        self._disposal_count_total = 0
        self._disposal_count_since_last_heartbeat = 0
        self._firmware_update_state = None
        self.metadata_store = DetectionMetadataStore(APP_CONFIG.paths.detection_metadata_dir, self.logger)
        self.upload_manager = DetectionUploadManager(self.metadata_store, self.device_client, self.logger)
        self.access_token = None
        self.telemetry_interval_ms = APP_CONFIG.viewmodel.telemetry_interval_ms
        self.app_version_check_interval_ms = APP_CONFIG.viewmodel.app_version_check_interval_ms
        self.upload_interval_ms = APP_CONFIG.viewmodel.upload_interval_ms
        self.upload_batch_size = APP_CONFIG.viewmodel.upload_batch_size
        self.current_detection_metadata_path = None
        self.fill_levels_poll_interval_seconds = APP_CONFIG.esp32_ota.fill_levels_poll_interval_seconds
        self.latest_fill_levels = None  # Store latest fill levels from polling
        
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

        self.access_token_retry_timer = QTimer()
        self.access_token_retry_timer.setSingleShot(False)
        self.access_token_retry_timer.setInterval(self.telemetry_interval_ms)
        self.access_token_retry_timer.timeout.connect(self._retry_get_access_token)

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
        self.reset_to_welcome()
        self._check_app_version()
        self._refresh_access_token(reason="startup")

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


    def get_access_token(self):
        """Proxy DeviceClient token API for UI/orchestration flow."""
        return self.device_client.get_access_token()
    
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
        # Backward-compatible wrapper; real flow is handled by _refresh_access_token.
        self._refresh_access_token(reason="initialize_telemetry")

    def _refresh_access_token(self, reason: str):
        """Refresh token and synchronize activation prompt + telemetry timers."""
        self.logger.info("Attempting get-access-token, reason=%s", reason)
        success, result = self.get_access_token()
        if not success:
            self.logger.warning("Unable to get access token, telemetry disabled: %s", result)
            self.telemetry_timer.stop()
            self.access_token = None

            activation_message = self._build_activation_hint_message(result)
            self.state_activation_required.emit(True, activation_message)

            if not self.access_token_retry_timer.isActive():
                self.access_token_retry_timer.start()
                self.logger.info("Started get-access-token retry every %sms", self.telemetry_interval_ms)
            return

        token = result.data.access_token if result and result.data else None
        if not token:
            self.logger.warning("No access token in response, telemetry disabled")
            self.telemetry_timer.stop()
            self.access_token = None
            self.state_activation_required.emit(
                True,
                "No access token available. Press Activate Device, then the app will retry automatically every 5 minutes.",
            )
            if not self.access_token_retry_timer.isActive():
                self.access_token_retry_timer.start()
            return

        self.access_token_retry_timer.stop()
        self.access_token = token
        self.state_activation_required.emit(False, "")
        self.telemetry_timer.start()
        self.logger.info("Access token acquired, telemetry loop started")

    def _retry_get_access_token(self):
        """Timer callback for periodic token retry when backend is unavailable."""
        self._refresh_access_token(reason="retry_timer")

    def _send_periodic_telemetry(self):
        """Timer callback to send telemetry heartbeat."""
        success, message = self.send_telemetry()
        if not success:
            self.logger.warning("Telemetry failed, stopping telemetry loop: %s", message)
            self.telemetry_timer.stop()
            self.access_token = None
            self.state_activation_required.emit(
                True,
                "Access token is not available. Press Activate Device, app will retry get-access-token every 5 minutes.",
            )
            if not self.access_token_retry_timer.isActive():
                self.access_token_retry_timer.start()
            return

        self.logger.info("Telemetry sent successfully")

    def _check_app_version(self):
        """Check backend version and refresh ESP32 firmware binary if needed."""
        self.logger.info("Running app version check")

        try:
            success, result = self.device_client.get_app_version()
            if not success:
                self.logger.warning("App version check failed: %s", result)
                return

            if isinstance(result, dict):
                local_version = result.get("local", {}).get("esp32_version")
                backend_version = result.get("backend", {}).get("bin_version")
                downloaded = bool(result.get("downloaded"))
                firmware_file = result.get("firmware_file")

                if downloaded:
                    self.state_toast.emit(
                        f"ESP32 firmware downloaded {backend_version}. Starting OTA upload...",
                        True,
                    )
                    self.logger.info(
                        "ESP32 firmware downloaded: local=%s backend=%s file=%s. Starting OTA upload...",
                        local_version,
                        backend_version,
                        firmware_file,
                    )
                    
                    # Upload firmware to ESP32
                    ota_ok, ota_msg = self.actuator_client.upload_ota(firmware_file)
                    if ota_ok:
                        self.state_toast.emit(
                            f"OTA upload completed successfully. ESP32 updated to {backend_version}",
                            True,
                        )
                        self.logger.info(
                            "OTA upload successful: %s. ESP32 now running version %s",
                            ota_msg,
                            backend_version,
                        )
                    else:
                        self.state_toast.emit(
                            f"OTA upload failed: {ota_msg}",
                            False,
                        )
                        self.logger.warning(
                            "OTA upload failed: %s",
                            ota_msg,
                        )
                else:
                    self.logger.info(
                        "ESP32 firmware already up to date: local=%s backend=%s",
                        local_version,
                        backend_version,
                    )
            else:
                self.logger.info("App version check completed: %s", result)
        except Exception:
            self.logger.exception("App version check failed")

    def _poll_fill_levels(self):
        """Timer callback to periodically request fill levels from ESP32."""
        try:
            success, fill_levels = self.actuator_client.request_fill_levels()
            if success and fill_levels:
                self.latest_fill_levels = fill_levels
                self.logger.debug("Fill levels updated: %s", fill_levels)
            elif not success:
                self.logger.warning("Failed to request fill levels from ESP32")
        except Exception:
            self.logger.exception("Error polling fill levels")

    def shutdown(self):
        """Stop timers and worker when app closes."""
        self.telemetry_timer.stop()
        self.access_token_retry_timer.stop()
        self.app_version_timer.stop()
        self.upload_timer.stop()
        self.fill_levels_poll_timer.stop()
        self.actuator_client.close_serial()
        self.worker.stop()
        self.logger.info("MainViewModel shutdown completed")

    def on_back_from_device_link(self):
        """Refresh token after returning from device-link flow."""
        self._refresh_access_token(reason="back_from_device_link")

    def activate_device_manually(self):
        """Handle user-triggered activation and display toast feedback."""
        self.logger.info("User requested device activation")
        success, result = self.activate_device()
        if success:
            self.state_toast.emit("Device activation successful", True)
            self._refresh_access_token(reason="activate_success")
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

        return "Access token is unavailable. Press Activate Device and app will retry get-access-token every 5 minutes."

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