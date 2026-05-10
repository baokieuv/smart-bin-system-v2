import json
import logging
from pathlib import Path

from src.models.device_config_dto import DeviceConfigDto


class DeviceConfigStore:
    """Persist and restore the latest device config snapshot."""

    def __init__(self, cache_path: Path, logger: logging.Logger):
        self.cache_path = cache_path
        self.logger = logger
        self.cache_path.parent.mkdir(parents=True, exist_ok=True)

    def load(self) -> DeviceConfigDto | None:
        if not self.cache_path.exists():
            return None

        try:
            with open(self.cache_path, "r", encoding="utf-8") as file_handle:
                payload = json.load(file_handle)
            return DeviceConfigDto.from_dict(payload)
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            self.logger.warning("Failed to load cached device config: %s", exc)
            return None

    def save(self, config: DeviceConfigDto) -> None:
        payload = {
            "accessToken": config.access_token,
            "pollingInterval": config.polling_interval,
            "fullThreshold": config.full_threshold,
            "targetBinFirmwareVersion": config.target_bin_firmware_version,
            "targetDesktopVersion": config.target_desktop_version,
            "deviceHeight": config.device_height,
        }

        try:
            with open(self.cache_path, "w", encoding="utf-8") as file_handle:
                json.dump(payload, file_handle, ensure_ascii=True, indent=2)
        except OSError as exc:
            self.logger.warning("Failed to save device config cache: %s", exc)