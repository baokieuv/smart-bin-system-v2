from dataclasses import dataclass


@dataclass
class FirmwareUpdateInfoDto:
    has_update: bool
    version: str | None
    download_url: str | None
    signature: str | None

    @classmethod
    def from_dict(cls, data: dict):
        if not data:
            return None
        return cls(
            has_update=bool(data.get("hasUpdate", False)),
            version=data.get("version"),
            download_url=data.get("downloadUrl"),
            signature=data.get("signature"),
        )


@dataclass
class OtaCheckResponseDto:
    esp32: FirmwareUpdateInfoDto | None = None
    raspberry_pi: FirmwareUpdateInfoDto | None = None

    @classmethod
    def from_dict(cls, data: dict):
        if not data:
            return None
        return cls(
            esp32=FirmwareUpdateInfoDto.from_dict(data.get("esp32")),
            raspberry_pi=FirmwareUpdateInfoDto.from_dict(data.get("raspberryPi")),
        )