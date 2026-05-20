from __future__ import annotations

import logging
import time
from pathlib import Path
from threading import Thread

from src.models.device_config_dto import DeviceConfigDto
from src.services.runtime_versions import RUNTIME_VERSIONS
from src.utils.config import APP_CONFIG


class MainViewModelRuntime:
    """Owns background jobs and device config refresh logic for MainViewModel."""

    def __init__(self, vm):
        self.vm = vm

    def _normalize_polling_interval_seconds(self, value) -> int:
        try:
            polling_interval = int(value)
        except (TypeError, ValueError):
            return 5 * 60

        return polling_interval if polling_interval > 0 else 5 * 60

    def _default_device_config(self) -> DeviceConfigDto:
        return DeviceConfigDto(
            access_token=None,
            polling_interval=5 * 60,
            full_threshold=90.0,
            target_bin_firmware_version=None,
            target_desktop_version=None,
            device_height=100.0,
        )

    def _normalize_device_config(self, config: DeviceConfigDto | None) -> DeviceConfigDto:
        default_config = self._default_device_config()
        if not config:
            return default_config

        return DeviceConfigDto(
            access_token=config.access_token or default_config.access_token,
            polling_interval=self._normalize_polling_interval_seconds(config.polling_interval),
            full_threshold=float(config.full_threshold) if config.full_threshold is not None else default_config.full_threshold,
            target_bin_firmware_version=config.target_bin_firmware_version or default_config.target_bin_firmware_version,
            target_desktop_version=config.target_desktop_version or default_config.target_desktop_version,
            device_height=float(config.device_height) if config.device_height is not None else default_config.device_height,
        )

    def _merge_device_configs(self, fallback: DeviceConfigDto, override: DeviceConfigDto) -> DeviceConfigDto:
        return DeviceConfigDto(
            access_token=override.access_token or fallback.access_token,
            polling_interval=override.polling_interval if override.polling_interval is not None else fallback.polling_interval,
            full_threshold=override.full_threshold if override.full_threshold is not None else fallback.full_threshold,
            target_bin_firmware_version=override.target_bin_firmware_version or fallback.target_bin_firmware_version,
            target_desktop_version=override.target_desktop_version or fallback.target_desktop_version,
            device_height=override.device_height if override.device_height is not None else fallback.device_height,
        )

    def _load_cached_access_token(self) -> tuple[DeviceConfigDto | None, str | None]:
        cached_config = self.vm.device_config_store.load()
        if not cached_config or not cached_config.access_token:
            return cached_config, None

        return cached_config, cached_config.access_token

    def _activate_device_with_retry(self) -> tuple[bool, str]:
        vm = self.vm
        delay_seconds = 1.0
        max_delay_seconds = float(APP_CONFIG.backend.activate_retry_max_delay_seconds)

        while True:
            success, result = vm.device_client.activate_device()
            if success:
                device_data = getattr(result, "data", None)
                access_token = getattr(device_data, "access_token", None) if device_data else None
                if access_token:
                    vm._persist_access_token(access_token)
                return True, "Device activated"

            message = result.get("message") if isinstance(result, dict) else str(result)
            vm.logger.warning("/activate failed: %s. Retrying in %.0fs", message, delay_seconds)
            time.sleep(delay_seconds)
            delay_seconds = min(delay_seconds * 2, max_delay_seconds)

    def _reactivate_after_telemetry_unauthorized(self) -> tuple[bool, str]:
        vm = self.vm
        vm.logger.warning("Telemetry returned 401; re-activating device")
        vm.access_token = None
        vm.telemetry_timer.stop()
        vm.state_activation_required.emit(True, "Session expired. Re-activating device...")
        return self.refresh_device_config(reason="telemetry_401", force_activation=True)

    def _apply_device_config(self, config: DeviceConfigDto, reason: str, source: str):
        vm = self.vm
        vm.device_config = config
        vm.access_token = config.access_token
        vm.device_config_polling_seconds = self._normalize_polling_interval_seconds(config.polling_interval)
        vm.full_threshold = float(config.full_threshold if config.full_threshold is not None else 90.0)
        vm.device_height = float(config.device_height if config.device_height is not None else 100.0)
        vm.target_bin_firmware_version = config.target_bin_firmware_version
        vm.target_desktop_version = config.target_desktop_version

        vm.config_refresh_timer.setInterval(vm.device_config_polling_seconds * 1000)
        if not vm.config_refresh_timer.isActive():
            vm.config_refresh_timer.start()

        ok, message = vm.actuator_client.update_device_config(vm.full_threshold, vm.device_height)
        if ok:
            vm.logger.info(
                "Applied device config source=%s reason=%s polling=%ss threshold=%.2f height=%.2f",
                source,
                reason,
                vm.device_config_polling_seconds,
                vm.full_threshold,
                vm.device_height,
            )
        else:
            vm.logger.warning("Failed to push device config to ESP32: %s", message)

        if vm.access_token:
            vm.telemetry_timer.start()
            vm.state_activation_required.emit(False, "")
            vm.logger.info("Access token available from %s, telemetry loop started", source)
        else:
            vm.telemetry_timer.stop()
            activation_message = vm._build_activation_hint_message(source)
            vm.state_activation_required.emit(True, activation_message)
            vm.logger.warning("Access token missing after resolving device config from %s", source)

    def resolve_bin_version(self):
        vm = self.vm
        resolved = RUNTIME_VERSIONS.resolve_bin_version(
            device_version_fetcher=vm.actuator_client.get_bin_version,
            firmware_file=vm.actuator_client.firmware_file,
        )
        if resolved:
            vm.latest_bin_version = resolved
            vm.logger.info("Resolved bin version: %s", resolved)
        else:
            vm.logger.warning("Unable to resolve bin version from cache, ESP32, or firmware binary")
        return resolved

    def refresh_device_config(self, reason: str, force_activation: bool = False):
        """Refresh device config and synchronize cache, telemetry, and ESP32 params."""
        vm = self.vm
        vm.logger.info("Attempting device config refresh, reason=%s", reason)
        cached_config, cached_access_token = self._load_cached_access_token()

        if cached_access_token and not force_activation:
            vm.access_token = cached_access_token
            vm.logger.info("Cached access key found; skipping /activate")
        else:
            activation_ok, activation_message = self._activate_device_with_retry()
            if not activation_ok:
                vm.logger.warning("Device activation failed during startup: %s", activation_message)

        self.resolve_bin_version()

        ok, ota_result = vm.device_client.check_ota()
        if not ok:
            vm.logger.warning("Unable to check OTA status: %s", ota_result)

        success, result = vm.device_client.get_device_config()
        if success and result and result.data:
            backend_config = self._normalize_device_config(result.data)
            if cached_config:
                backend_config = self._merge_device_configs(self._normalize_device_config(cached_config), backend_config)
            vm.device_config_store.save(backend_config)
            self._apply_device_config(backend_config, reason=reason, source="backend")
            return

        if not success:
            vm.logger.warning("Unable to get device config, falling back to cache/defaults: %s", result)

        if cached_config:
            self._apply_device_config(self._normalize_device_config(cached_config), reason=reason, source="cache")
            return

        self._apply_device_config(self._default_device_config(), reason=reason, source="defaults")

    def retry_refresh_device_config(self):
        self.refresh_device_config(reason="retry_timer")

    def _start_background_task(self, flag_name: str, thread_name: str, target):
        vm = self.vm
        if getattr(vm, flag_name, False):
            vm.logger.debug("Skipping %s because previous task is still running", thread_name)
            return False

        setattr(vm, flag_name, True)

        def runner():
            try:
                target()
            except Exception:
                vm.logger.exception("Background task failed: %s", thread_name)
            finally:
                setattr(vm, flag_name, False)

        Thread(target=runner, name=thread_name, daemon=True).start()
        return True

    def send_periodic_telemetry(self):
        vm = self.vm
        success, message, status_code = vm.send_telemetry()
        if not success:
            if status_code == 401:
                self._start_background_task(
                    "_telemetry_reauth_running",
                    "smart-bin-telemetry-reauth",
                    self._reactivate_after_telemetry_unauthorized,
                )
                return

            vm.logger.warning("Telemetry failed, stopping telemetry loop: %s", message)
            vm.telemetry_timer.stop()
            vm.access_token = None
            vm.state_activation_required.emit(
                True,
                "Device config is unavailable. Press Activate Device, app will retry every 5 minutes.",
            )
            if not vm.config_refresh_timer.isActive():
                vm.config_refresh_timer.start()
            return

        vm.logger.info("Telemetry sent successfully")

    def check_app_version(self):
        self._start_background_task("_app_version_refresh_running", "smart-bin-app-version", self.check_app_version_async)

    def check_app_version_async(self):
        vm = self.vm
        vm.logger.info("Running OTA check")

        try:
            success, result = vm.device_client.check_ota()
            if not success:
                vm.logger.warning("OTA check failed: %s", result)
                return

            vm.latest_app_version_result = result
            ota_data = result.data if hasattr(result, "data") else None
            if not ota_data:
                vm.logger.warning("OTA check returned empty payload")
                return

            esp32_update = ota_data.esp32
            raspberry_pi_update = ota_data.raspberry_pi

            if raspberry_pi_update and raspberry_pi_update.has_update:
                # TODO: implement desktop OTA flow later.
                vm.logger.info(
                    "TODO desktop OTA not handled yet: version=%s url=%s",
                    raspberry_pi_update.version,
                    raspberry_pi_update.download_url,
                )

            if esp32_update and esp32_update.has_update:
                vm.logger.info(
                    "ESP32 OTA available: version=%s url=%s",
                    esp32_update.version,
                    esp32_update.download_url,
                )
                download_ok, download_result = vm.device_client.download_and_verify_esp32_firmware(esp32_update)
                if not download_ok:
                    vm.logger.warning("ESP32 firmware download/verification failed: %s", download_result)
                    report_ok, report_msg = vm.device_client.report_ota_status("FAILED", str(download_result))
                    if not report_ok:
                        vm.logger.warning("Failed to report OTA failure: %s", report_msg)
                    return

                firmware_file = download_result
                self._start_background_task(
                    "_ota_upload_running",
                    "smart-bin-ota-upload",
                    lambda: self.upload_ota_async(firmware_file, esp32_update.version),
                )
            else:
                vm.logger.info("ESP32 firmware already up to date")
        except Exception:
            vm.logger.exception("OTA check failed")

    def upload_ota_async(self, firmware_file: str | Path, backend_version: str | None):
        vm = self.vm
        ota_ok, ota_msg = vm.actuator_client.upload_ota(firmware_file)
        vm.latest_ota_result = {"ok": ota_ok, "message": ota_msg, "backend_version": backend_version}
        report_status = "SUCCESS" if ota_ok else "FAILED"
        report_ok, report_msg = vm.device_client.report_ota_status(report_status, ota_msg)
        if not report_ok:
            vm.logger.warning("Failed to report OTA status: %s", report_msg)

        if ota_ok:
            if backend_version:
                RUNTIME_VERSIONS.set_bin_version(backend_version)
                vm.latest_bin_version = backend_version
            vm.state_toast.emit(
                f"OTA upload completed successfully. Bin updated to {backend_version}",
                True,
            )
            vm.logger.info(
                "OTA upload successful: %s. Bin now running version %s",
                ota_msg,
                backend_version,
            )
        else:
            vm.state_toast.emit(
                f"OTA upload failed: {ota_msg}",
                False,
            )
            vm.logger.warning("OTA upload failed: %s", ota_msg)

    def poll_fill_levels(self):
        self._start_background_task("_fill_levels_refresh_running", "smart-bin-fill-levels", self.poll_fill_levels_async)

    def poll_fill_levels_async(self):
        vm = self.vm
        try:
            success, fill_levels = vm.actuator_client.request_fill_levels()
            if success and fill_levels:
                vm.latest_fill_levels = fill_levels
                vm.logger.debug("Fill levels updated: %s", fill_levels)
            elif not success:
                vm.logger.warning("Failed to request fill levels from ESP32")
        except Exception:
            vm.logger.exception("Error polling fill levels")