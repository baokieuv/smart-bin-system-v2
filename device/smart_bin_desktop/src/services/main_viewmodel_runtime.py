"""Background jobs and device-config refresh logic owned by MainViewModel."""

from __future__ import annotations

import logging
import time
from pathlib import Path
from threading import Thread
from typing import TYPE_CHECKING, Callable

from src.models.device_config_dto import DeviceConfigDto
from src.services.runtime_versions import RUNTIME_VERSIONS
from src.utils.config import APP_CONFIG

if TYPE_CHECKING:
    from src.viewmodels.main_viewmodel import MainViewModel

_DEFAULT_POLLING_S = APP_CONFIG.default_polling_interval_s
_DEFAULT_THRESHOLD = APP_CONFIG.default_full_threshold
_DEFAULT_HEIGHT = APP_CONFIG.default_device_height


class MainViewModelRuntime:
    """Owns background jobs and device config refresh logic for MainViewModel.

    This class accesses the ViewModel through ``self.vm`` to avoid circular
    imports and keep MainViewModel focused on orchestration only.
    """

    def __init__(self, vm: MainViewModel) -> None:
        self.vm = vm

    # ------------------------------------------------------------------
    # Device config helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _clamp_polling_interval(value) -> int:
        """Coerce polling interval to a positive integer, defaulting to 5 min."""
        try:
            interval = int(value)
            return interval if interval > 0 else _DEFAULT_POLLING_S
        except (TypeError, ValueError):
            return _DEFAULT_POLLING_S

    @staticmethod
    def _default_config() -> DeviceConfigDto:
        return DeviceConfigDto(
            access_token=None,
            polling_interval=_DEFAULT_POLLING_S,
            full_threshold=_DEFAULT_THRESHOLD,
            target_bin_firmware_version=None,
            target_desktop_version=None,
            device_height=_DEFAULT_HEIGHT,
        )

    @staticmethod
    def _normalize_config(config: DeviceConfigDto | None) -> DeviceConfigDto:
        """Fill None fields in *config* with safe defaults."""
        defaults = MainViewModelRuntime._default_config()
        if not config:
            return defaults
        return DeviceConfigDto(
            access_token=config.access_token or defaults.access_token,
            polling_interval=MainViewModelRuntime._clamp_polling_interval(config.polling_interval),
            full_threshold=float(config.full_threshold) if config.full_threshold is not None else defaults.full_threshold,
            target_bin_firmware_version=config.target_bin_firmware_version or defaults.target_bin_firmware_version,
            target_desktop_version=config.target_desktop_version or defaults.target_desktop_version,
            device_height=float(config.device_height) if config.device_height is not None else defaults.device_height,
        )

    @staticmethod
    def _merge_configs(fallback: DeviceConfigDto, override: DeviceConfigDto) -> DeviceConfigDto:
        """Prefer *override* field values over *fallback*, keeping fallback where override is None."""
        return DeviceConfigDto(
            access_token=override.access_token or fallback.access_token,
            polling_interval=override.polling_interval if override.polling_interval is not None else fallback.polling_interval,
            full_threshold=override.full_threshold if override.full_threshold is not None else fallback.full_threshold,
            target_bin_firmware_version=override.target_bin_firmware_version or fallback.target_bin_firmware_version,
            target_desktop_version=override.target_desktop_version or fallback.target_desktop_version,
            device_height=override.device_height if override.device_height is not None else fallback.device_height,
        )

    # ------------------------------------------------------------------
    # Device activation
    # ------------------------------------------------------------------

    def _load_cached_token(self) -> tuple[DeviceConfigDto | None, str | None]:
        cached = self.vm.device_config_store.load()
        return cached, (cached.access_token if cached else None)

    def _activate_device_with_retry(self) -> tuple[bool, str]:
        """Retry /activate with exponential backoff until success."""
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
        vm = self.vm
        vm.logger.warning("Telemetry 401 — re-activating device")
        vm.access_token = None
        vm.telemetry_timer.stop()
        vm.state_activation_required.emit(True, "Session expired. Re-activating device...")
        return self.refresh_device_config(reason="telemetry_401", force_activation=True)

    # ------------------------------------------------------------------
    # Config apply
    # ------------------------------------------------------------------

    def _apply_config(self, config: DeviceConfigDto, *, reason: str, source: str) -> None:
        """Push a resolved DeviceConfigDto into the ViewModel and ESP32."""
        vm = self.vm
        vm.device_config = config
        vm.access_token = config.access_token
        vm.device_config_polling_seconds = self._clamp_polling_interval(config.polling_interval)
        vm.full_threshold = float(config.full_threshold if config.full_threshold is not None else _DEFAULT_THRESHOLD)
        vm.device_height = float(config.device_height if config.device_height is not None else _DEFAULT_HEIGHT)
        vm.target_bin_firmware_version = config.target_bin_firmware_version
        vm.target_desktop_version = config.target_desktop_version

        vm.config_refresh_timer.setInterval(vm.device_config_polling_seconds * 1000)
        self._start_timer_if_inactive(vm.config_refresh_timer, "config_refresh_timer")

        ok, message = vm.actuator_client.update_device_config(vm.full_threshold, vm.device_height)
        if ok:
            vm.logger.info(
                "Config applied source=%s reason=%s polling=%ds threshold=%.2f height=%.2f",
                source, reason, vm.device_config_polling_seconds, vm.full_threshold, vm.device_height,
            )
        else:
            vm.logger.warning("Failed to push config to ESP32: %s", message)

        if vm.access_token:
            vm.telemetry_timer.start()
            vm.state_activation_required.emit(False, "")
            vm.logger.info("Telemetry loop started (source=%s)", source)
        else:
            vm.telemetry_timer.stop()
            vm.state_activation_required.emit(True, vm._build_activation_hint_message(source))
            vm.logger.warning("No access token after config apply (source=%s)", source)

    @staticmethod
    def _start_timer_if_inactive(timer, name: str) -> None:
        if not timer.isActive():
            timer.start()

    # ------------------------------------------------------------------
    # Public: config refresh entry point
    # ------------------------------------------------------------------

    def refresh_device_config(self, reason: str, force_activation: bool = False) -> None:
        """Refresh device config and synchronise cache, telemetry, and ESP32 params.

        Resolution order:
        1. Use cached access token (skip /activate) unless *force_activation* is set.
        2. Query backend for latest config; merge with cache if both exist.
        3. Fall back to cached config, then to built-in defaults.
        """
        vm = self.vm
        vm.logger.info("Config refresh requested reason=%s force=%s", reason, force_activation)

        cached_config, cached_token = self._load_cached_token()

        if cached_token and not force_activation:
            vm.access_token = cached_token
            vm.logger.info("Cached token found; skipping /activate")
        else:
            self._activate_device_with_retry()

        self.resolve_bin_version()

        ok, ota_result = vm.device_client.check_ota()
        if not ok:
            vm.logger.warning("OTA check failed: %s", ota_result)

        success, result = vm.device_client.get_device_config()
        if success and result and result.data:
            backend = self._normalize_config(result.data)
            if cached_config:
                backend = self._merge_configs(self._normalize_config(cached_config), backend)
            vm.device_config_store.save(backend)
            self._apply_config(backend, reason=reason, source="backend")
            return

        if not success:
            vm.logger.warning("get_device_config failed, falling back: %s", result)

        if cached_config:
            self._apply_config(self._normalize_config(cached_config), reason=reason, source="cache")
            return

        self._apply_config(self._default_config(), reason=reason, source="defaults")

    def retry_refresh_device_config(self) -> None:
        self.refresh_device_config(reason="retry_timer")

    # ------------------------------------------------------------------
    # Bin version
    # ------------------------------------------------------------------

    def resolve_bin_version(self) -> str | None:
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
    # Background task runner
    # ------------------------------------------------------------------

    def _start_background_task(self, flag_name: str, thread_name: str, target: Callable) -> bool:
        """Launch *target* in a daemon thread, guarded by a boolean flag on vm.

        Returns False (and skips launch) if a previous run is still in progress.
        """
        vm = self.vm
        if getattr(vm, flag_name, False):
            vm.logger.debug("Skipping %s — previous run still active", thread_name)
            return False

        setattr(vm, flag_name, True)

        def _runner():
            try:
                target()
            except Exception:
                vm.logger.exception("Background task failed: %s", thread_name)
            finally:
                setattr(vm, flag_name, False)

        Thread(target=_runner, name=thread_name, daemon=True).start()
        return True

    # ------------------------------------------------------------------
    # Periodic jobs
    # ------------------------------------------------------------------

    def send_periodic_telemetry(self) -> None:
        vm = self.vm
        success, message, status_code = vm.send_telemetry()
        if success:
            vm.logger.info("Telemetry sent successfully")
            return

        if status_code == 401:
            self._start_background_task(
                "_telemetry_reauth_running",
                "smart-bin-telemetry-reauth",
                self._reactivate_after_telemetry_unauthorized,
            )
            return

        vm.logger.warning("Telemetry failed, stopping loop: %s", message)
        vm.telemetry_timer.stop()
        vm.access_token = None
        vm.state_activation_required.emit(
            True,
            "Device config is unavailable. Press Activate Device, app will retry every 5 minutes.",
        )
        self._start_timer_if_inactive(vm.config_refresh_timer, "config_refresh_timer")

    def check_app_version(self) -> None:
        self._start_background_task(
            "_app_version_refresh_running", "smart-bin-app-version", self._check_app_version_async
        )

    def _check_app_version_async(self) -> None:
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

            if ota_data.raspberry_pi and ota_data.raspberry_pi.has_update:
                vm.logger.info(
                    "Desktop OTA available (not yet handled): version=%s url=%s",
                    ota_data.raspberry_pi.version,
                    ota_data.raspberry_pi.download_url,
                )

            if not (ota_data.esp32 and ota_data.esp32.has_update):
                vm.logger.info("ESP32 firmware is up to date")
                return

            esp32 = ota_data.esp32
            vm.logger.info("ESP32 OTA available: version=%s url=%s", esp32.version, esp32.download_url)

            ok, download_result = vm.device_client.download_and_verify_esp32_firmware(esp32)
            if not ok:
                vm.logger.warning("ESP32 firmware download/verification failed: %s", download_result)
                report_ok, report_msg = vm.device_client.report_ota_status("FAILED", str(download_result))
                if not report_ok:
                    vm.logger.warning("Failed to report OTA failure: %s", report_msg)
                return

            self._start_background_task(
                "_ota_upload_running",
                "smart-bin-ota-upload",
                lambda: self._upload_ota_async(download_result, esp32.version),
            )
        except Exception:
            vm.logger.exception("OTA check failed unexpectedly")

    def _upload_ota_async(self, firmware_file: str | Path, backend_version: str | None) -> None:
        vm = self.vm
        vm.enter_ota_update_mode()
        try:
            ok, msg = vm.actuator_client.upload_ota(firmware_file)
            vm.latest_ota_result = {"ok": ok, "message": msg, "backend_version": backend_version}

            report_ok, report_msg = vm.device_client.report_ota_status("SUCCESS" if ok else "FAILED", msg)
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

    def poll_fill_levels(self) -> None:
        self._start_background_task(
            "_fill_levels_refresh_running", "smart-bin-fill-levels", self._poll_fill_levels_async
        )

    def _poll_fill_levels_async(self) -> None:
        vm = self.vm
        try:
            success, fill_levels = vm.actuator_client.request_fill_levels()
            success = True
            fill_levels = {
                "bin1": 90,
                "bin2": 100,
                "bin3": 90,
                "bin4": 100
            }
            if success and fill_levels:
                vm.latest_fill_levels = fill_levels
                vm.logger.debug("Fill levels updated: %s", fill_levels)
            elif not success:
                vm.logger.warning("Failed to read fill levels from ESP32")
        except Exception:
            vm.logger.exception("Error polling fill levels")