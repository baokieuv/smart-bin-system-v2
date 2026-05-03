"""Serial actuator transport for ESP32 step motor control and OTA upload."""

from __future__ import annotations

import hashlib
import hmac
import logging
import struct
import time
from pathlib import Path
import serial

from src.utils.config import APP_CONFIG


class ActuatorRepository:
    """Send framed commands to the ESP32 actuator firmware over serial.

    Public API:
    - control_step_motor(degree)
    - upload_ota(firmware_file=None)
    """

    def __init__(
        self,
        com_port: str | None = None,
        baud_rate: int | None = None,
        firmware_file: str | Path | None = None,
    ):
        self.logger = logging.getLogger("smart_bin.actuator_repository")
        self.config = APP_CONFIG.esp32_ota
        self.com_port = com_port or self.config.com_port
        self.baud_rate = baud_rate or self.config.baud_rate
        self.firmware_file = Path(firmware_file) if firmware_file else Path(self.config.firmware_file)

    def _open_serial(self) -> serial.Serial:
        """Open a serial connection with the configured defaults."""
        ser = serial.Serial(self.com_port, self.baud_rate, timeout=1)
        ser.setDTR(False)
        ser.setRTS(False)
        time.sleep(1.5)
        ser.reset_input_buffer()
        return ser

    def _calculate_hmac(self, cmd: int, length: int, payload: bytes) -> bytes:
        len_h = (length >> 8) & 0xFF
        len_l = length & 0xFF
        msg = bytearray([cmd, len_h, len_l])
        if payload:
            msg.extend(payload)
        return hmac.new(self.config.secret_key, msg, hashlib.sha256).digest()

    def _create_frame(self, cmd: int, payload: bytes = b"") -> bytearray:
        length = len(payload)
        len_h = (length >> 8) & 0xFF
        len_l = length & 0xFF
        frame = bytearray([self.config.header_1, self.config.header_2, cmd, len_h, len_l])
        frame.extend(payload)
        frame.extend(self._calculate_hmac(cmd, length, payload))
        frame.append(self.config.tail)
        return frame

    def _wait_for_ack(self, ser: serial.Serial, timeout: float = 3.0) -> bool:
        """Wait for ACK/NACK response from ESP32."""
        start_time = time.time()
        buffer = bytearray()

        ack_pattern = bytearray([self.config.header_1, self.config.header_2, self.config.cmd_ack, 0x00, 0x00, self.config.cmd_ack, self.config.tail])
        nack_pattern = bytearray([self.config.header_1, self.config.header_2, self.config.cmd_nack, 0x00, 0x00, self.config.cmd_nack, self.config.tail])

        while time.time() - start_time < timeout:
            if ser.in_waiting > 0:
                buffer.extend(ser.read(ser.in_waiting))
                if ack_pattern in buffer:
                    return True
                if nack_pattern in buffer:
                    self.logger.warning("Received NACK from ESP32")
                    return False
            time.sleep(0.01)

        self.logger.warning("ACK timeout. Buffer=%s", buffer.hex(" "))
        return False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def control_step_motor(self, degree: int) -> tuple[bool, str]:
        """Rotate the step motor by the requested angle in degrees."""
        try:
            self.logger.info("Sending step motor command degree=%s", degree)
            payload = struct.pack(">h", int(degree))
            frame = self._create_frame(self.config.cmd_ctrl_stepper, payload)

            with self._open_serial() as ser:
                ser.write(frame)
                if not self._wait_for_ack(ser, timeout=2):
                    return False, "ESP32 did not ACK step motor command"

            return True, f"Step motor command sent successfully: {degree}"
        except Exception as exc:
            self.logger.exception("Failed to control step motor")
            return False, str(exc)

    def upload_ota(self, firmware_file: str | Path | None = None) -> tuple[bool, str]:
        """Upload firmware to the ESP32 using the framed OTA protocol."""
        firmware_path = Path(firmware_file) if firmware_file else self.firmware_file
        if not firmware_path.exists():
            return False, f"Firmware file not found: {firmware_path}"

        try:
            file_size = firmware_path.stat().st_size
            self.logger.info("Starting OTA upload file=%s size=%s", firmware_path.name, file_size)

            with self._open_serial() as ser:
                # OTA START
                payload_start = struct.pack(">I", file_size)
                ser.write(self._create_frame(self.config.cmd_ota_start, payload_start))
                if not self._wait_for_ack(ser, timeout=10):
                    return False, "ESP32 did not ACK OTA start"

                # OTA DATA
                bytes_sent = 0
                with open(firmware_path, "rb") as f:
                    while True:
                        chunk = f.read(self.config.chunk_size)
                        if not chunk:
                            break
                        ser.write(self._create_frame(self.config.cmd_ota_data, chunk))
                        if not self._wait_for_ack(ser, timeout=2):
                            return False, f"ESP32 did not ACK OTA data at byte {bytes_sent}"
                        bytes_sent += len(chunk)

                # OTA END
                ser.write(self._create_frame(self.config.cmd_ota_end))
                if not self._wait_for_ack(ser, timeout=3):
                    return False, "ESP32 did not ACK OTA end"

            return True, "OTA upload completed successfully"
        except Exception as exc:
            self.logger.exception("OTA upload failed")
            return False, str(exc)


# Backward-compatible alias for older imports.
ActuatorClient = ActuatorRepository
