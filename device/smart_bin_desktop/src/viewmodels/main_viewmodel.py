"""Application coordinator giữa detection worker, repositories, và UI.
 
Responsibilities:
- Sở hữu tất cả QTimer và kết nối chúng với runtime helpers.
- Nhận ``trash_detected`` từ DetectionWorker và điều phối feedback flow.
- Cung cấp telemetry, activation, shutdown hooks cho view layer.
 
Logic nặng (config refresh, OTA, fill-level polling) nằm trong MainViewModelRuntime
để class này chỉ tập trung vào orchestration (SRP).
"""

import logging
import re
from datetime import datetime, timezone
from pathlib import Path
import threading
from typing import Any
from urllib.parse import urlparse

from PyQt6.QtCore import QObject, QTimer, pyqtSignal, pyqtSlot
import requests
 
from src.services.hls_manager import HlsUploaderWorker
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

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
 
# Error codes được xác định rõ để tránh magic string rải rác trong code
_ERR_NOT_ACTIVE = "SMB3010"
_ERR_NOT_FOUND = frozenset({"DEVICE_NOT_FOUND", "SMB3004"})
 
# Dấu hiệu nhận biết response HTML / JS garbage từ backend
_SUSPICIOUS_RESPONSE_MARKERS = (
    "document.", "window.", "XMLHttpRequest", "addEventListener",
    "JSON.stringify", "error-feedback-survey", "function(){",
    "function ()", "<html", "<!doctype",
)
 
# Độ dài tối đa của error message hiển thị cho người dùng
_MAX_USER_ERROR_LEN = 120


# ---------------------------------------------------------------------------
# MainViewModel
# ---------------------------------------------------------------------------
 
class MainViewModel(QObject):
    """Application coordinator giữa detection worker, repositories, và UI.
 
    Signals
    -------
    state_loading       : hiển thị màn hình loading với message
    state_welcome       : chuyển về màn hình chờ
    state_feedback      : mở màn hình feedback kèm dữ liệu detection
    state_thanks        : mở màn hình cảm ơn
    state_activation_required : yêu cầu kích hoạt (True=bắt buộc, message=hint)
    state_toast         : hiển thị toast notification (message, is_success)
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
 
        # --- Repositories & services ---
        self.actuator_client = ActuatorRepository()
        self.device_client = DeviceClient(actuator_client=self.actuator_client)
        self.thingsboard_client = ThingsboardClient(
            port=80, 
            tls_enabled=False, 
            connect_timeout=15,
            handler=self._rpc_handler, 
            logger=self.logger
        )
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
        self.latest_ai_model_version: str | None = None
        self.latest_app_version_result = None
        self.latest_ota_result: dict | None = None

        # Config-derived: được runtime cập nhật mỗi lần refresh
        self.device_config_polling_seconds: int = APP_CONFIG.default_polling_interval_s
        self.full_threshold: float = APP_CONFIG.default_full_threshold
        self.target_bin_firmware_version: str | None = None
        self.target_desktop_version: str | None = None
 
        # Telemetry counters
        self._disposal_count_total: int = 0
        self._disposal_count_since_last_heartbeat: int = 0

        # Guard flags cho background tasks (đọc/ghi bởi MainViewModelRuntime)
        self._app_version_refresh_running: bool = False
        self._fill_levels_refresh_running: bool = False
        self._ota_upload_running: bool = False
        self._ai_model_ota_running: bool = False  # Guard riêng cho AI model OTA
        self._telemetry_reauth_running: bool = False
        self._ota_update_active: bool = False
 
        # Pending Qt state closure từ background thread (xem _apply_config_qt_state)
        self._pending_qt_state_fn = None
 
        # --- Wire signals & build timers ---
        self.worker.trash_detected.connect(self._on_trash_detected)
        self.worker.worker_ready.connect(self._on_worker_ready)
        self._build_timers()
 
        self.logger.info("MainViewModel initialized")

    # ------------------------------------------------------------------
    # Timer setup
    # ------------------------------------------------------------------
 
    def _make_timer(self, interval_ms: int, slot, *, single_shot: bool = False) -> QTimer:
        """Factory method tạo QTimer với cấu hình chuẩn (DRY)."""
        timer = QTimer(self)
        timer.setSingleShot(single_shot)
        timer.setInterval(interval_ms)
        timer.timeout.connect(slot)
        return timer

    def _build_timers(self) -> None:
        """Khởi tạo tất cả QTimer của ViewModel."""
        cfg = APP_CONFIG.viewmodel
        esp_cfg = APP_CONFIG.esp32_ota
 
        # Single-shot: tự động reset sau khi người dùng không phản hồi
        self.feedback_timer = self._make_timer(cfg.feedback_timeout_ms, self.reset_to_welcome, single_shot=True)
        self.thanks_timer = self._make_timer(cfg.thanks_timeout_ms, self.reset_to_welcome, single_shot=True)
 
        # Repeating: các job định kỳ
        self.telemetry_timer = self._make_timer(cfg.telemetry_interval_ms, self.runtime.send_periodic_telemetry)
        self.upload_timer = self._make_timer(cfg.upload_interval_ms, self._upload_detection_results_batch)
        self.app_version_timer = self._make_timer(cfg.app_version_check_interval_ms, self.runtime.check_app_version)
        self.fill_levels_poll_timer = self._make_timer(
            esp_cfg.fill_levels_poll_interval_seconds * 1000, self.runtime.poll_fill_levels
        )
        # config_refresh_timer: interval thay đổi động theo config từ backend
        self.config_refresh_timer = self._make_timer(
            self.device_config_polling_seconds * 1000, self.runtime.retry_refresh_device_config
        )
        
    def _all_timers(self) -> list[QTimer]:
        """Trả về danh sách tất cả timer để stop/start nhóm (DRY)."""
        return [
            self.feedback_timer, self.thanks_timer, self.telemetry_timer,
            self.config_refresh_timer, self.app_version_timer,
            self.upload_timer, self.fill_levels_poll_timer,
        ]

    # ------------------------------------------------------------------
    # System lifecycle
    # ------------------------------------------------------------------

    def start_system(self) -> None:
        """Khởi động camera/AI worker; ``worker_ready`` signal điều phối phần còn lại."""
        self.state_loading.emit("Initializing AI model and camera...")
        self.worker.start()
        self.logger.info("start_system invoked")

    def shutdown(self) -> None:
        """Dừng tất cả timer, đóng serial, join worker thread."""
        self.stop_video_stream()
        self.worker.pause_detection()
        for timer in self._all_timers():
            timer.stop()
        self.actuator_client.close_serial()
        self.worker.stop()
        self.logger.info("MainViewModel shutdown completed")

    def enter_ota_update_mode(self, message: str = "Hệ thống đang cập nhật...") -> None:
        """Đóng băng mọi hoạt động thông thường và hiển thị màn hình loading khi OTA chạy."""
        self._ota_update_active = True
        for timer in self._all_timers():
            timer.stop()
        self.worker.pause_detection()
        self.state_loading.emit(message)
        self.logger.info("Entered OTA update mode")

    def exit_ota_update_mode(self) -> None:
        """Khôi phục hoạt động bình thường sau khi OTA hoàn tất."""
        if not self._ota_update_active:
            return
 
        self._ota_update_active = False
        self.worker.resume_detection()
 
        # Chỉ start timer khi có access token (telemetry) hoặc chưa active
        if self.access_token and not self.telemetry_timer.isActive():
            self.telemetry_timer.start()
 
        for timer in (
            self.config_refresh_timer, self.app_version_timer,
            self.upload_timer, self.fill_levels_poll_timer,
        ):
            if not timer.isActive():
                timer.start()
 
        self.reset_to_welcome()
        self.logger.info("Exited OTA update mode")
        
    def reload_ai_model(self, new_model_path: str) -> bool:
        """Hot-reload AI Model mà không cần khởi động lại ứng dụng.
        
        Pause detection trước khi swap để tránh race condition giữa
        worker thread đang inference và main thread đang xoá model cũ.

        Returns:
            True nếu reload thành công, False nếu có lỗi.
        """
        self.logger.info("Initiating hot-reload for AI model: %s", new_model_path)
        self.worker.pause_detection()
        try:
            success = self.worker.reload_model(new_model_path)
            if success:
                self.logger.info("AI model reloaded successfully in memory.")
            else:
                self.logger.error("worker.reload_model returned False for path: %s", new_model_path)
            return success
        except Exception as exc:
            self.logger.exception("Unexpected error during AI model hot-reload: %s", exc)
            return False
        finally:
            # Luôn resume, kể cả khi reload thất bại — tránh freeze toàn bộ detection
            self.worker.resume_detection()

    # ------------------------------------------------------------------
    # Worker callbacks
    # ------------------------------------------------------------------

    def _on_worker_ready(self, ready: bool, message: str) -> None:
        """Xử lý sự kiện worker_ready: khởi động services nếu AI init thành công."""
        if not ready:
            self.state_loading.emit(f"Initialization failed: {message}")
            self.state_toast.emit("AI initialization failed", False)
            return
 
        self.state_loading.emit("Initialization complete. Connecting services...")
 
        # refresh_device_config có thể block → chạy trong background thread
        self.runtime._task_runner.start(
            "_app_version_refresh_running",
            "smart-bin-startup-config",
            lambda: self.runtime.refresh_device_config(reason="startup"),
        )
        self.reset_to_welcome()
        self.runtime.check_app_version()

        # Start các timer không phụ thuộc vào access token
        for timer, label in (
            (self.app_version_timer, "app version check"),
            (self.upload_timer, "batch upload"),
            (self.fill_levels_poll_timer, "fill levels polling"),
        ):
            if not timer.isActive():
                timer.start()
                self.logger.info("Started %s (interval=%dms)", label, timer.interval())

    def _on_trash_detected(self, trash_data: TrashData) -> None:
        """Khi phát hiện rác: lưu metadata, điều khiển stepper, mở feedback screen."""
        if self._ota_update_active:
            self.logger.info("Ignoring detection while OTA update is active")
            return
 
        self.logger.info(
            "Detection received: category=%s label=%s conf=%.3f id=%s",
            trash_data.category, trash_data.label,
            trash_data.confidence, trash_data.detection_id,
        )
 
        # Lưu metadata để upload về sau (offline-first)
        self.current_detection_metadata_path = self.metadata_store.save_detection(trash_data, "not_rated")
        self.worker.pause_detection()

        # Điều khiển stepper motor theo góc tương ứng với nhóm rác
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
        """Ghi nhận phản hồi người dùng và chuyển sang màn hình cảm ơn."""
        if self._ota_update_active:
            self.logger.info("Ignoring feedback while OTA update is active")
            return
 
        self.feedback_timer.stop()
        feedback_value = "correct" if is_correct else "wrong"
        self._update_current_feedback(feedback_value)
        self.logger.info("User feedback: %s", feedback_value)
        self.state_thanks.emit()
        self.thanks_timer.start(APP_CONFIG.viewmodel.thanks_timeout_ms)

    def reset_to_welcome(self) -> None:
        """Trở về màn hình chào và tiếp tục phát hiện real-time."""
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

    def activate_device(self) -> tuple[bool, Any]:
        """Kích hoạt thiết bị và lưu access token trả về."""
        success, result = self.device_client.activate_device()
        if success:
            token = getattr(getattr(result, "data", None), "access_token", None)
            if token:
                self._persist_access_token(token)
        return success, result

    def activate_device_manually(self) -> None:
        """Xử lý activation do người dùng kích hoạt thủ công, hiển thị toast."""
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
        """Refresh config sau khi người dùng quay lại từ màn hình device-link."""
        self.runtime.refresh_device_config(reason="back_from_device_link")

    # ------------------------------------------------------------------
    # Telemetry
    # ------------------------------------------------------------------

    def send_telemetry(self) -> tuple[bool, str, int | None]:
        """Gửi heartbeat telemetry kèm disposal count và mức đầy của thùng."""
        if not self.access_token:
            return False, "Access token is missing", None
 
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        payload: dict = {
            "timestamp": now_ms,
            "total_waste_count": self._disposal_count_total,
            "weight": 100,
            "pin": 50
        }
 
        # Thêm mức đầy từng thùng nếu có dữ liệu
        if isinstance(self.latest_fill_levels, list):
            for i, level in enumerate(self.latest_fill_levels):
                try:
                    payload[f"bin{i + 1}"] = int(level)
                except (TypeError, ValueError):
                    payload[f"bin{i + 1}"] = None
 
        ok, msg, status_code = self.thingsboard_client.send_telemetry(self.access_token, payload)
        if ok:
            self._disposal_count_since_last_heartbeat = 0
        return ok, msg, status_code

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------
 
    def get_device_mac_address(self) -> str:
        return self.device_client.get_mac_address()
 
    def get_device_claim_code(self) -> str:
        return self.device_client.get_claim_code()

    # ------------------------------------------------------------------
    # Qt slots — marshal từ background thread về main thread
    # ------------------------------------------------------------------
 
    @pyqtSlot()
    def _apply_config_qt_state(self) -> None:
        """Qt slot: thực thi Qt timer/signal operations được marshal từ background thread.
 
        Được gọi qua QMetaObject.invokeMethod(QueuedConnection) khi runtime._apply_config()
        phát hiện đang chạy ngoài main thread.
        """
        fn = self._pending_qt_state_fn
        if fn is not None:
            self._pending_qt_state_fn = None
            fn()

    def _emit_activation_required(self) -> None:
        """Qt slot: emit signal session-expired từ background thread một cách an toàn."""
        self.state_activation_required.emit(True, "Session expired. Re-activating device...")

    # ------------------------------------------------------------------
    # RPC handler (ThingsBoard → actuator commands)
    # ------------------------------------------------------------------
 
    def _rpc_handler(self, method: str | None, params: dict | str | None, request_id: str) -> dict | None:
        """Xử lý RPC request từ ThingsBoard và trả về dict response.
 
        Mỗi method được dispatch đến actuator command tương ứng.
        Lỗi được log và trả về dict {"status": "error", "message": ...}.
        """
        self.logger.info("RPC received: method=%s request_id=%s", method, request_id)
 
        # Map method name → callable actuator command
        rpc_dispatch = {
            APP_CONFIG.rpc_method.open_lid: self.actuator_client.open_lid,
            APP_CONFIG.rpc_method.close_lid: self.actuator_client.close_lid,
            APP_CONFIG.rpc_method.block_lid: self.actuator_client.block_lid,
            APP_CONFIG.rpc_method.unblock_lid: self.actuator_client.unblock_lid,
            APP_CONFIG.rpc_method.start_stream: self.start_video_stream,
            APP_CONFIG.rpc_method.stop_stream: self.stop_video_stream,
        }
 
        if method in rpc_dispatch:
            ok, msg = rpc_dispatch[method]()
            if ok:
                self.logger.info("RPC %s successful", method)
                return {"status": "success"}
            self.logger.warning("RPC %s failed: %s", method, msg)
            return {"status": "error", "message": f"Failed to execute {method}: {msg}"}
 
        if method == APP_CONFIG.rpc_method.force_sync:
            self.runtime.refresh_device_config(reason="force_sync_rpc")
            self.logger.info("RPC forceSync triggered device config refresh")
            return {"status": "success"}
 
        self.logger.warning("Unknown RPC method: %s", method)
        return {"status": "error", "message": f"Unknown method: {method}"}
    
    # ------------------------------------------------------------------
    # Stream RPC Handlers
    # ------------------------------------------------------------------

    def start_video_stream(self) -> tuple[bool, str]:
        self.logger.info("Starting video stream from RPC...")
        try:
            # 1. Khởi tạo RTSP URL dựa vào IP của Backend Server
            base_url = APP_CONFIG.api.api_base_url
            parsed_url = urlparse(base_url)
            server_host = parsed_url.hostname
            
            mac_addr = self.get_device_mac_address()
            stream_name = mac_addr.replace(":", "-") # Định dạng map với MediaMTX và Backend
            
            rtsp_url = f"rtsp://localhost:8554/{stream_name}"

            # 2. Bật FFmpeg đẩy luồng
            ok = self.worker.start_stream(rtsp_url)
            if not ok:
                return False, "Failed to start FFmpeg encoder"

            # 3. Thông báo cho Spring Boot biết luồng đã sẵn sàng (Async để không block RPC)
            def notify_ready():
                api_ready_url = f"{base_url}/stream/ready"
                headers = {
                    "X-Device-Mac": mac_addr
                }
             
                try:
                    requests.post(api_ready_url, headers=headers, timeout=5)
                    self.logger.info("Notified Spring Boot that RTSP stream is ready.")
                except Exception as e:
                    self.logger.warning("Failed to notify server stream status: %s", e)
            
            threading.Thread(target=notify_ready, daemon=True).start()

            return True, ""
        except Exception as e:
            self.logger.error("Error starting video stream: %s", e)
            return False, str(e)
        
    def stop_video_stream(self) -> tuple[bool, str]:
        self.logger.info("Stopping video stream from RPC...")
        try:
            self.worker.stop_stream()
            return True, ""
        except Exception as e:
            self.logger.error("Error stopping video stream: %s", e)
            return False, str(e)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
 
    def _persist_access_token(self, access_token: str) -> None:
        """Lưu access token vào memory và cache disk."""
        self.access_token = access_token
        cached = self.device_config_store.load() or DeviceConfigDto()
        cached.access_token = access_token
        self.device_config_store.save(cached)
 
    def _update_current_feedback(self, feedback: str) -> None:
        """Cập nhật feedback vào metadata file của detection hiện tại."""
        if self.current_detection_metadata_path:
            self.metadata_store.update_feedback(Path(self.current_detection_metadata_path), feedback)
 
    def _upload_detection_results_batch(self) -> None:
        """Chạy batch upload detection results (gọi bởi upload_timer)."""
        self.upload_manager.run_batch(APP_CONFIG.viewmodel.upload_batch_size)
        
    # ------------------------------------------------------------------
    # Error message helpers (tách ra để dễ test)
    # ------------------------------------------------------------------
 
    @staticmethod
    def _sanitize_backend_message(message: str) -> str:
        """Xoá HTML tags, chuẩn hoá whitespace, từ chối response garbage."""
        cleaned = re.sub(r"<[^>]*>", " ", message)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if not cleaned:
            return "Unknown error"
        too_long = len(cleaned) > 180
        has_garbage = any(m.lower() in cleaned.lower() for m in _SUSPICIOUS_RESPONSE_MARKERS)
        if too_long or has_garbage:
            return "Backend returned an invalid response"
        return cleaned
    
    def _extract_error_code(self, result) -> str | None:
        """Trích xuất error code từ dict hoặc string."""
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
        """Trích xuất và làm sạch error message từ dict hoặc string."""
        if isinstance(result, dict):
            raw = str(result.get("message") or result.get("code") or "Unknown error")
        else:
            raw = str(result)
        return self._sanitize_backend_message(raw)
 
    def _extract_user_friendly_error_message(self, result) -> str:
        """Format error message cho người dùng: kèm code nếu có, cắt ngắn nếu quá dài."""
        if isinstance(result, dict):
            code = str(result.get("code") or "").strip()
            msg = self._extract_error_message(result)
            return f"{code}: {msg}" if code and code.lower() not in msg.lower() else msg
        msg = self._extract_error_message(result)
        if len(msg) > _MAX_USER_ERROR_LEN:
            return msg[:_MAX_USER_ERROR_LEN - 3].rstrip() + "..."
        return msg
    
    def _is_device_not_active_error(self, result) -> bool:
        if self._extract_error_code(result) == _ERR_NOT_ACTIVE:
            return True
        return "not active" in self._extract_error_message(result).lower()
 
    def _is_device_not_found_error(self, result) -> bool:
        if self._extract_error_code(result) in _ERR_NOT_FOUND:
            return True
        return "device not found" in self._extract_error_message(result).lower()
 
    def _build_activation_hint_message(self, result) -> str:
        """Xây dựng message gợi ý hành động cho người dùng dựa trên loại lỗi."""
        if result is None:
            return "Device config is unavailable. Press Activate Device and app will retry every 5 minutes."
        if self._is_device_not_active_error(result):
            return "Device is not activated. Press Activate Device to continue."
        if self._is_device_not_found_error(result):
            return "Device is not registered. Press Activate Device to register and activate."
        return "Device config is unavailable. Press Activate Device and app will retry every 5 minutes."