from __future__ import annotations

from dataclasses import dataclass


_CHIP_MODEL_NAMES: dict[int, str] = {
    1: "ESP32",
    2: "ESP32-S2",
    5: "ESP32-C3",
    9: "ESP32-S3",
    12: "ESP32-C2",
    13: "ESP32-C6",
    16: "ESP32-H2",
    17: "ESP32-C5",
    18: "ESP32-P4",
    20: "ESP32-C61",
    23: "ESP32-C5",
    999: "POSIX/Linux",
}


@dataclass(frozen=True)
class SystemInfoDto:
    chip_model: int
    chip_name: str
    cores: int
    flash_size_bytes: int
    total_ram_bytes: int

    @classmethod
    def from_payload(cls, payload: bytes) -> "SystemInfoDto":
        if len(payload) < 10:
            raise ValueError(f"System info payload too short: {len(payload)} bytes")

        chip_model = payload[0]
        chip_name = _CHIP_MODEL_NAMES.get(chip_model, f"Unknown({chip_model})")
        cores = payload[1]
        flash_size_bytes = int.from_bytes(payload[2:6], byteorder="big", signed=False)
        total_ram_bytes = int.from_bytes(payload[6:10], byteorder="big", signed=False)

        return cls(
            chip_model=chip_model,
            chip_name=chip_name,
            cores=cores,
            flash_size_bytes=flash_size_bytes,
            total_ram_bytes=total_ram_bytes,
        )