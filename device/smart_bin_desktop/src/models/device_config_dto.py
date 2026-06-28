from dataclasses import dataclass
import re
from typing import Optional


@dataclass
class DeviceConfigDto:
    access_token: Optional[str] = None
    polling_interval: Optional[int] = None
    full_threshold: Optional[float] = None
    target_bin_firmware_version: Optional[str] = None
    target_desktop_version: Optional[str] = None
    target_ai_model_version: Optional[str] = None

    @staticmethod
    def _as_int(value) -> Optional[int]:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _as_float(value) -> Optional[float]:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)

        if isinstance(value, str):
            match = re.search(r"-?\d+(?:\.\d+)?", value)
            if match:
                try:
                    return float(match.group(0))
                except ValueError:
                    return None
        return None

    @classmethod
    def from_dict(cls, data: dict):
        if not data:
            return None

        user_configs = data.get("configs") if isinstance(data.get("configs"), dict) else {}

        return cls(
            access_token=data.get("accessToken"),
            polling_interval=cls._as_int(
                user_configs.get("polling_interval")
            ),
            full_threshold=cls._as_float(
                user_configs.get("full_threshold")
            ),
            target_bin_firmware_version=data.get("targetBinFirmwareVersion"),
            target_desktop_version=data.get("targetDesktopVersion"),
            target_ai_model_version=data.get("targetAiModelVersion"),
        )