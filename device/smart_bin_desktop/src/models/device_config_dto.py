from dataclasses import dataclass
from typing import Optional


@dataclass
class DeviceConfigDto:
    access_token: Optional[str] = None
    polling_interval: Optional[int] = None
    full_threshold: Optional[float] = None
    target_bin_firmware_version: Optional[str] = None
    target_desktop_version: Optional[str] = None
    device_height: Optional[float] = None

    @classmethod
    def from_dict(cls, data: dict):
        if not data:
            return None

        return cls(
            access_token=data.get("accessToken"),
            polling_interval=data.get("pollingInterval"),
            full_threshold=data.get("fullThreshold"),
            target_bin_firmware_version=data.get("targetBinFirmwareVersion"),
            target_desktop_version=data.get("targetDesktopVersion"),
            device_height=data.get("deviceHeight"),
        )