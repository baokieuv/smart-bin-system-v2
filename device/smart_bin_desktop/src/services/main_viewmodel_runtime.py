"""Background jobs và device-config refresh logic phục vụ MainViewModel.
 
Tách ra khỏi MainViewModel để giữ cho ViewModel tập trung vào orchestration.
Class này truy cập ViewModel thông qua ``self.vm`` để tránh circular import.
 
QUAN TRỌNG: ``refresh_device_config()`` phải được gọi từ background thread vì
``_activate_device_with_retry()`` có thể block lâu. Không gọi trực tiếp từ
Qt main thread / Qt slot.
"""

from __future__ import annotations
 
import logging
import time
from pathlib import Path
from threading import Thread
from typing import TYPE_CHECKING, Any, Callable
 
from src.models.device_config_dto import DeviceConfigDto
from src.services.runtime_versions import RUNTIME_VERSIONS
from src.utils.config import APP_CONFIG
 
if TYPE_CHECKING:
    from src.viewmodels.main_viewmodel import MainViewModel

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
 
_DEFAULT_POLLING_S: int = APP_CONFIG.default_polling_interval_s
_DEFAULT_THRESHOLD: float = APP_CONFIG.default_full_threshold
_DEFAULT_HEIGHT: float = APP_CONFIG.default_device_height

class _DeviceConfigNormalizer:
    """Các phương thức thuần (pure) để chuẩn hoá và merge DeviceConfigDto.
 
    Tất cả là ``staticmethod`` vì không có state — dễ unit-test độc lập.
    """
 
    @staticmethod
    def default() -> DeviceConfigDto:
        """Tạo config mặc định dùng khi không có dữ liệu nào từ backend / cache."""
        return DeviceConfigDto(
            access_token=None,
            polling_interval=_DEFAULT_POLLING_S,
            full_threshold=_DEFAULT_THRESHOLD,
            target_bin_firmware_version=None,
            target_desktop_version=None,
        )
        
    @staticmethod
    def clamp_polling_interval(value: Any) -> int:
        """Ép kiểu polling interval thành int dương; fallback về mặc định nếu không hợp lệ."""
        try:
            interval = int(value)
            return interval if interval > 0 else _DEFAULT_POLLING_S
        except (TypeError, ValueError):
            return _DEFAULT_POLLING_S
        
    @staticmethod
    def normalize(config: DeviceConfigDto | None) -> DeviceConfigDto:
        """Điền giá trị mặc định vào các field None trong config."""
        defaults = _DeviceConfigNormalizer.default()
        if not config:
            return defaults
        return DeviceConfigDto(
            access_token=config.access_token or defaults.access_token,
            polling_interval=_DeviceConfigNormalizer.clamp_polling_interval(config.polling_interval),
            full_threshold=float(config.full_threshold) if config.full_threshold is not None else defaults.full_threshold,
            target_bin_firmware_version=config.target_bin_firmware_version or defaults.target_bin_firmware_version,
            target_desktop_version=config.target_desktop_version or defaults.target_desktop_version,
        )
        
    @staticmethod
    def merge(fallback: DeviceConfigDto, override: DeviceConfigDto) -> DeviceConfigDto:
        """Merge hai config: ưu tiên ``override``, giữ ``fallback`` khi override là None."""
        return DeviceConfigDto(
            access_token=override.access_token or fallback.access_token,
            polling_interval=override.polling_interval if override.polling_interval is not None else fallback.polling_interval,
            full_threshold=override.full_threshold if override.full_threshold is not None else fallback.full_threshold,
            target_bin_firmware_version=override.target_bin_firmware_version or fallback.target_bin_firmware_version,
            target_desktop_version=override.target_desktop_version or fallback.target_desktop_version,
        )


class _BackgroundTaskRunner:
    """Tiện ích chạy callable trong daemon thread, có guard flag chống chạy trùng.
 
    Flag được lưu dưới dạng attribute trên đối tượng ``host`` (thường là vm)
    để ViewModel vẫn có thể kiểm tra trạng thái từ bên ngoài.
    """
 
    def __init__(self, host: Any, logger: logging.Logger) -> None:
        self._host = host
        self._logger = logger
        
    def start(self, flag_name: str, thread_name: str, target: Callable) -> bool:
        """Chạy ``target`` trong daemon thread, được bảo vệ bởi ``flag_name`` trên host.
 
        Trả về False (không chạy) nếu lần chạy trước vẫn đang active.
        """
        if getattr(self._host, flag_name, False):
            self._logger.debug("Skipping %s — previous run still active", thread_name)
            return False
 
        setattr(self._host, flag_name, True)
 
        def _runner() -> None:
            try:
                target()
            except Exception:
                self._logger.exception("Background task failed: %s", thread_name)
            finally:
                setattr(self._host, flag_name, False)
 
        Thread(target=_runner, name=thread_name, daemon=True).start()
        return True
    
class MainViewModelRuntime:
    """Chứa background jobs và device config refresh cho MainViewModel.
 
    Phân chia trách nhiệm:
    - ``_normalizer`` : chuẩn hoá / merge DeviceConfigDto (pure, stateless)
    - ``_task_runner`` : quản lý daemon thread với guard flag
    - Các method public : điều phối các job định kỳ và OTA
    """
 
    def __init__(self, vm: MainViewModel) -> None:
        self.vm = vm
        self._normalizer = _DeviceConfigNormalizer()
        self._task_runner = _BackgroundTaskRunner(vm, vm.logger)

    # ------------------------------------------------------------------
    # Public — Periodic jobs (gọi bởi QTimer trong MainViewModel)
    # ------------------------------------------------------------------
 
    def send_periodic_telemetry(self) -> None:
        """Gửi telemetry định kỳ; xử lý lỗi 401 bằng cách re-activate."""
        vm = self.vm
        success, message, status_code = vm.send_telemetry()
 
        if success:
            vm.logger.info("Telemetry sent successfully")
            return
 
        if status_code == 401:
            # Re-activate không đồng bộ để không block Qt timer callback
            self._task_runner.start(
                "_telemetry_reauth_running",
                "smart-bin-telemetry-reauth",
                self._reactivate_after_telemetry_unauthorized,
            )
            return
        
        # Lỗi khác → dừng telemetry loop, yêu cầu người dùng kích hoạt lại
        vm.logger.warning("Telemetry failed, stopping loop: %s", message)
        vm.telemetry_timer.stop()
        vm.access_token = None
        vm.state_activation_required.emit(
            True,
            "Device config is unavailable. Press Activate Device, app will retry every 5 minutes.",
        )
        _start_timer_if_inactive(vm.config_refresh_timer, "config_refresh_timer")
    
    def check_app_version(self) -> None:
        """Kiểm tra OTA bất đồng bộ; tự động kích hoạt upload nếu có bản mới."""
        self._task_runner.start(
            "_app_version_refresh_running",
            "smart-bin-app-version",
            self._check_app_version_async,
        )
 
    def poll_fill_levels(self) -> None:
        """Đọc mức đầy của 4 thùng từ ESP32, cập nhật vm.latest_fill_levels."""
        self._task_runner.start(
            "_fill_levels_refresh_running",
            "smart-bin-fill-levels",
            self._poll_fill_levels_async,
        )
        
    def retry_refresh_device_config(self) -> None:
        """Entry point cho config_refresh_timer; gọi refresh_device_config với reason=retry."""
        self.refresh_device_config(reason="retry_timer")
 
    def resolve_bin_version(self) -> str | None:
        """Xác định version firmware hiện tại (cache → ESP32 → file .bin).
 
        Cập nhật vm.latest_bin_version và RUNTIME_VERSIONS nếu tìm thấy.
        """
        vm = self.vm
        resolved = RUNTIME_VERSIONS.resolve_bin_version(
            device_version_fetcher=vm.actuator_client.get_bin_version,
            firmware_file=vm.actuator_client.firmware_file,
        )
        if resolved:
            vm.latest_bin_version = resolved
            vm.logger.info("Resolved bin version: %s", resolved)
        else:
            vm.logger.warning("Could not resolve bin version from cache, ESP32, or firmware file")
        return resolved
    
    # ------------------------------------------------------------------
    # Public — Config refresh (phải gọi từ background thread)
    # ------------------------------------------------------------------
 
    def refresh_device_config(self, reason: str, force_activation: bool = False) -> None:
        """Refresh device config và đồng bộ cache, telemetry, tham số ESP32.
 
        Resolution order:
        1. Dùng cached access token (bỏ qua /activate) trừ khi force_activation=True.
        2. Query backend lấy config mới nhất; merge với cache nếu cả hai tồn tại.
        3. Fallback về cached config, rồi đến built-in defaults.
        """
        vm = self.vm
        vm.logger.info("Config refresh: reason=%s force=%s", reason, force_activation)
 
        cached_config, cached_token = self._load_cached_token()
 
        # Bước 1: đảm bảo có access token hợp lệ
        if cached_token and not force_activation:
            vm.access_token = cached_token
            vm.logger.info("Using cached token (skipping /activate)")
        else:
            self._activate_device_with_retry()
 
        # Bước 2: lấy thông tin version và kiểm tra OTA
        self.resolve_bin_version()
        ok, ota_result = vm.device_client.check_ota()
        if not ok:
            vm.logger.warning("OTA check failed: %s", ota_result)
 
        # Bước 3: lấy config từ backend và apply
        success, result = vm.device_client.get_device_config()
        if success and result and result.data:
            backend = _DeviceConfigNormalizer.normalize(result.data)
            if cached_config:
                backend = _DeviceConfigNormalizer.merge(
                    _DeviceConfigNormalizer.normalize(cached_config), backend
                )
            vm.device_config_store.save(backend)
            self._apply_config(backend, reason=reason, source="backend")
            return
 
        if not success:
            vm.logger.warning("get_device_config failed, falling back: %s", result)
 
        # Fallback về cache hoặc defaults
        if cached_config:
            self._apply_config(
                _DeviceConfigNormalizer.normalize(cached_config), reason=reason, source="cache"
            )
        else:
            self._apply_config(_DeviceConfigNormalizer.default(), reason=reason, source="defaults")
            
    # ------------------------------------------------------------------
    # Private — Config apply
    # ------------------------------------------------------------------
 
    def _apply_config(self, config: DeviceConfigDto, *, reason: str, source: str) -> None:
        """Đẩy DeviceConfigDto vào ViewModel và ESP32.
 
        Có thể được gọi từ background thread — các Qt operation được marshal
        về main thread qua QMetaObject.invokeMethod để tránh crash.
        """
        from PyQt6.QtCore import QCoreApplication, QMetaObject, Qt, QThread  # noqa: PLC0415
 
        vm = self.vm
        
        # --- Cập nhật Python state (thread-safe, không cần main thread) ---
        vm.device_config = config
        vm.access_token = config.access_token
        vm.device_config_polling_seconds = _DeviceConfigNormalizer.clamp_polling_interval(config.polling_interval)
        vm.full_threshold = float(config.full_threshold if config.full_threshold is not None else _DEFAULT_THRESHOLD)
        vm.target_bin_firmware_version = config.target_bin_firmware_version
        vm.target_desktop_version = config.target_desktop_version
        
        # --- Đẩy config xuống ESP32 qua serial worker thread ---
        ok, message = vm.actuator_client.update_device_config(vm.full_threshold, 100.0)
        if ok:
            vm.logger.info(
                "Config applied: source=%s reason=%s polling=%ds threshold=%.2f",
                source, reason, vm.device_config_polling_seconds, vm.full_threshold,
            )
        else:
            vm.logger.warning("Failed to push config to ESP32: %s", message)
            
        # --- Qt timer / signal: phải chạy trên main thread ---
        def _apply_qt_state() -> None:
            vm.config_refresh_timer.setInterval(vm.device_config_polling_seconds * 1000)
            _start_timer_if_inactive(vm.config_refresh_timer, "config_refresh_timer")
 
            if vm.access_token:
                vm.telemetry_timer.start()
                vm.state_activation_required.emit(False, "")
                vm.logger.info("Telemetry loop started (source=%s)", source)
            else:
                vm.telemetry_timer.stop()
                vm.state_activation_required.emit(True, vm._build_activation_hint_message(None))
                vm.logger.warning("No access token after config apply (source=%s)", source)
 
        is_main_thread = QThread.currentThread() is QCoreApplication.instance().thread()
        if is_main_thread:
            _apply_qt_state()
        else:
            # Marshal về main thread — lưu closure vào vm để slot _apply_config_qt_state gọi
            vm._pending_qt_state_fn = _apply_qt_state
            QMetaObject.invokeMethod(
                vm, "_apply_config_qt_state", Qt.ConnectionType.QueuedConnection
            )
    
    # ------------------------------------------------------------------
    # Device activation
    # ------------------------------------------------------------------

    def _load_cached_token(self) -> tuple[DeviceConfigDto | None, str | None]:
        """Đọc config từ cache store, trả về (config, access_token)."""
        cached = self.vm.device_config_store.load()
        return cached, (cached.access_token if cached else None)

    def _activate_device_with_retry(self) -> tuple[bool, str]:
        """Gọi /activate với exponential backoff cho đến khi thành công.
 
        Block indefinitely cho đến khi kích hoạt được. Dùng trong background thread.
        """
        vm = self.vm
        delay = 1.0
        max_delay = float(APP_CONFIG.backend.activate_retry_max_delay_seconds)
 
        while True:
            success, result = vm.device_client.activate_device()
            if success:
                token = getattr(getattr(result, "data", None), "access_token", None)
                if token:
                    vm._persist_access_token(token)
                return True, "Device activated"
 
            msg = result.get("message") if isinstance(result, dict) else str(result)
            vm.logger.warning("/activate failed: %s. Retrying in %.0fs", msg, delay)
            time.sleep(delay)
            delay = min(delay * 2, max_delay)

    def _reactivate_after_telemetry_unauthorized(self) -> tuple[bool, str]:
        """Re-activate sau khi telemetry nhận 401.
 
        Chạy trong background thread (smart-bin-telemetry-reauth). Các Qt timer / signal
        được marshal về main thread qua QMetaObject để đảm bảo thread safety.
        """
        from PyQt6.QtCore import QMetaObject, Qt  # noqa: PLC0415
 
        vm = self.vm
        vm.logger.warning("Telemetry 401 — re-activating device")
        vm.access_token = None
 
        # Timer stop và signal emit → phải chạy trên main thread
        QMetaObject.invokeMethod(vm.telemetry_timer, "stop", Qt.ConnectionType.QueuedConnection)
        QMetaObject.invokeMethod(vm, "_emit_activation_required", Qt.ConnectionType.QueuedConnection)
 
        return self.refresh_device_config(reason="telemetry_401", force_activation=True)
    
    # ------------------------------------------------------------------
    # Private — OTA jobs
    # ------------------------------------------------------------------
    
    def _check_app_version_async(self) -> None:
        """Kiểm tra OTA, download và xác minh firmware nếu có bản mới."""
        vm = self.vm
        vm.logger.info("Running OTA check")
        try:
            success, result = vm.device_client.check_ota()
            if not success:
                vm.logger.warning("OTA check failed: %s", result)
                return
 
            vm.latest_app_version_result = result
            ota_data = getattr(result, "data", None)
            if not ota_data:
                vm.logger.warning("OTA check returned empty payload")
                return
 
            self._handle_desktop_ota(ota_data)
            self._handle_esp32_ota(ota_data)
            self._handle_ai_model_ota(ota_data)
 
        except Exception:
            vm.logger.exception("OTA check failed unexpectedly")
            
    def _handle_desktop_ota(self, ota_data: Any) -> None:
        """Log khi có bản cập nhật desktop (chưa xử lý tự động)."""
        vm = self.vm
        if ota_data.raspberry_pi and ota_data.raspberry_pi.has_update:
            vm.logger.info(
                "Desktop OTA available (not yet handled): version=%s url=%s",
                ota_data.raspberry_pi.version,
                ota_data.raspberry_pi.download_url,
            )
            
    def _handle_esp32_ota(self, ota_data: Any) -> None:
        """Download, xác minh và enqueue upload ESP32 firmware nếu có bản mới."""
        vm = self.vm
        if not (ota_data.esp32 and ota_data.esp32.has_update):
            vm.logger.info("ESP32 firmware is up to date")
            return
 
        esp32 = ota_data.esp32
        vm.logger.info("ESP32 OTA available: version=%s url=%s", esp32.version, esp32.download_url)
 
        ok, download_result = vm.device_client.download_and_verify_esp32_firmware(esp32)
        if not ok:
            vm.logger.warning("ESP32 firmware download/verification failed: %s", download_result)
            self._report_ota_failure(str(download_result), fw_type="ESP32")
            return
 
        self._task_runner.start(
            "_ota_upload_running",
            "smart-bin-ota-upload",
            lambda: self._upload_ota_async(download_result, esp32.version),
        )
        
    def _handle_ai_model_ota(self, ota_data: Any) -> None:
        """Download AI Model, xác minh chữ ký, hot-reload worker, cập nhật version cache."""
        vm = self.vm
        if not (ota_data.ai_model and ota_data.ai_model.has_update):
            vm.logger.info("AI Model is up to date")
            return

        ai_model = ota_data.ai_model
        vm.logger.info("AI Model OTA available: version=%s", ai_model.version)

        ok, download_result = vm.device_client.download_and_verify_ai_model(ai_model)
        if not ok:
            vm.logger.warning("AI Model download/verification failed: %s", download_result)
            self._report_ota_failure(str(download_result), fw_type="AI_MODEL")
            return

        # Chạy hot-reload trong background thread riêng với guard flag,
        # tránh chạy đồng thời với ESP32 OTA (_ota_upload_running).
        self._task_runner.start(
            "_ai_model_ota_running",
            "smart-bin-ai-model-ota",
            lambda: self._reload_ai_model_async(download_result, ai_model.version),
        )
        
    def _reload_ai_model_async(self, model_path: str, backend_version: str | None) -> None:
        """Hot-reload AI model trong background thread, có OTA mode để đảm bảo an toàn.

        Flow:
        1. enter_ota_update_mode() → dừng detection, hiển thị loading screen.
        2. vm.reload_ai_model() → pause worker, swap model reference, resume worker.
        3. Cập nhật RUNTIME_VERSIONS và báo cáo backend.
        4. exit_ota_update_mode() trong finally → luôn restore UI.
        """
        vm = self.vm
        vm.enter_ota_update_mode("Đang cập nhật AI Model...")
        try:
            success = vm.reload_ai_model(model_path)

            if success:
                if backend_version:
                    RUNTIME_VERSIONS.set_ai_version(backend_version)
                    vm.latest_ai_model_version = backend_version

                report_ok, report_msg = vm.device_client.report_ota_status(
                    "SUCCESS", "AI Model updated", fw_type="AI_MODEL"
                )
                if not report_ok:
                    vm.logger.warning("Failed to report AI Model OTA status: %s", report_msg)

                vm.state_toast.emit(f"Cập nhật Model AI thành công ({backend_version})", True)
                vm.logger.info("AI Model OTA completed — now at version %s", backend_version)
            else:
                error_msg = f"Hot-reload failed for model: {model_path}"
                vm.logger.error(error_msg)
                self._report_ota_failure(error_msg, fw_type="AI_MODEL")
                vm.state_toast.emit("Cập nhật Model AI thất bại", False)
        finally:
            vm.exit_ota_update_mode()

    def _upload_ota_async(self, firmware_file: str | Path, backend_version: str | None) -> None:
        """Flash firmware lên ESP32 và báo cáo kết quả về backend.
 
        Gọi enter_ota_update_mode trước và exit_ota_update_mode trong finally
        để đảm bảo UI luôn được restore dù flash thành công hay thất bại.
        """
        vm = self.vm
        vm.enter_ota_update_mode()
        try:
            ok, msg = vm.actuator_client.upload_ota(firmware_file)
            vm.latest_ota_result = {"ok": ok, "message": msg, "backend_version": backend_version}
 
            report_ok, report_msg = vm.device_client.report_ota_status("SUCCESS" if ok else "FAILED", msg, "ESP32")
            if not report_ok:
                vm.logger.warning("Failed to report OTA status: %s", report_msg)

            if ok:
                if backend_version:
                    RUNTIME_VERSIONS.set_bin_version(backend_version)
                    vm.latest_bin_version = backend_version
                vm.state_toast.emit(f"OTA upload completed. Bin updated to {backend_version}", True)
                vm.logger.info("OTA successful — bin now at version %s", backend_version)
            else:
                vm.state_toast.emit(f"OTA upload failed: {msg}", False)
                vm.logger.warning("OTA upload failed: %s", msg)
        finally:
            vm.exit_ota_update_mode()
            
    def _report_ota_failure(self, error_message: str, fw_type: str | None = None) -> None:
        vm = self.vm
        report_ok, report_msg = vm.device_client.report_ota_status("FAILED", error_message, fw_type=fw_type)
        if not report_ok:
            vm.logger.warning("Failed to report OTA failure: %s", report_msg)
            
    # ------------------------------------------------------------------
    # Private — Fill levels
    # ------------------------------------------------------------------
 
    def _poll_fill_levels_async(self) -> None:
        """Đọc mức đầy từ ESP32, cập nhật vm.latest_fill_levels."""
        vm = self.vm
        try:
            success, fill_levels = vm.actuator_client.request_fill_levels()
            if success and fill_levels:
                vm.latest_fill_levels = fill_levels
                vm.logger.debug("Fill levels updated: %s", fill_levels)
            elif not success:
                vm.logger.warning("Failed to read fill levels from ESP32")
        except Exception:
            vm.logger.exception("Error polling fill levels")
            
# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------
 
def _start_timer_if_inactive(timer: Any, name: str) -> None:
    """Khởi động QTimer nếu chưa active — tránh reset interval đang chạy."""
    if not timer.isActive():
        timer.start()