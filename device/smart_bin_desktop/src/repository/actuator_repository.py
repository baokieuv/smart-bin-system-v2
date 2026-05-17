"""Serial actuator transport for ESP32 step motor control and OTA upload."""

from __future__ import annotations

import hashlib
import hmac
import logging
import struct
import time
from pathlib import Path
from dataclasses import dataclass, field
from queue import Empty, Queue
import serial
from threading import Event, Lock, Thread
from typing import Callable, Any

from src.models.system_info_dto import SystemInfoDto
from src.utils.config import APP_CONFIG


@dataclass
class CommandTask:
    """Represents a command to be sent to ESP32."""
    cmd_name: str = ""  # For logging
    action: Callable[[], tuple[bool, Any]] | None = None
    done_event: Event = field(default_factory=Event, repr=False)
    result: tuple[bool, Any] | None = field(default=None, repr=False)


class ActuatorRepository:
    """Send framed commands to the ESP32 actuator firmware over serial.

    Public API:
    - control_step_motor(degree)
    - request_fill_levels()
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
        # Shared serial connection
        self._serial_conn: serial.Serial | None = None
        self._serial_lock = Lock()
        # Command queue for sequential execution
        self._command_queue: Queue = Queue()
        self._queue_stop = Event()
        self._queue_worker = Thread(target=self._command_queue_worker, daemon=True)
        self._queue_worker.start()

    def _open_serial(self) -> serial.Serial:
        """Open a serial connection with the configured defaults."""
        ser = serial.Serial(self.com_port, self.baud_rate, timeout=1)
        ser.setDTR(False)
        ser.setRTS(False)
        time.sleep(1.5)
        ser.reset_input_buffer()
        return ser

    def _get_or_open_serial(self) -> serial.Serial:
        """Get existing serial connection or open a new one if not already open."""
        with self._serial_lock:
            if self._serial_conn is not None and self._serial_conn.is_open:
                return self._serial_conn
            # Open new connection and store it
            self._serial_conn = self._open_serial()
            return self._serial_conn

    def _close_serial(self) -> None:
        """Close the shared serial connection."""
        with self._serial_lock:
            if self._serial_conn is not None and self._serial_conn.is_open:
                try:
                    self._serial_conn.close()
                except Exception:
                    pass
            self._serial_conn = None

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

    # Frame parsing helpers (used by telemetry and version read)
    def _extract_valid_frame(self, buffer: bytearray):
        """Scan buffer for a valid framed message. Returns (cmd, payload, consumed).

        Frame format: [H1][H2][CMD][LEN_H][LEN_L][PAYLOAD...][HMAC(32)][TAIL]
        """
        min_frame = 5 + 0 + 32 + 1
        while len(buffer) >= min_frame:
            if buffer[0] == self.config.header_1 and buffer[1] == self.config.header_2:
                cmd = buffer[2]
                length = (buffer[3] << 8) | buffer[4]
                total_len = 5 + length + 32 + 1
                if len(buffer) >= total_len:
                    payload = bytes(buffer[5:5+length])
                    received_mac = bytes(buffer[5+length:5+length+32])
                    tail = buffer[5+length+32]
                    if tail == self.config.tail and self._calculate_hmac(cmd, length, payload) == received_mac:
                        return cmd, payload, total_len
                    else:
                        buffer.pop(0)
                else:
                    break
            else:
                buffer.pop(0)
        return None, None, 0

    def _wait_for_ack(self, ser: serial.Serial, timeout: float = 3.0) -> bool:
        """Wait for ACK/NACK response from ESP32."""
        start_time = time.time()
        buffer = bytearray()

        while time.time() - start_time < timeout:
            if ser.in_waiting > 0:
                buffer.extend(ser.read(ser.in_waiting))
                
                # Sử dụng _extract_valid_frame để quét HMAC packet chuẩn xác
                cmd, payload, consumed = self._extract_valid_frame(buffer)
                
                if consumed > 0:
                    if cmd == self.config.cmd_ack:
                        return True
                    elif cmd == self.config.cmd_nack:
                        self.logger.warning("Received NACK from ESP32")
                        return False
                    
                    # Nếu là frame rác hoặc lệnh khác, cắt đi để quét tiếp
                    buffer = buffer[consumed:]
                    
            time.sleep(0.01)

        self.logger.warning("ACK timeout. Buffer=%s", buffer.hex(" "))
        return False

    def _command_queue_worker(self) -> None:
        """Continuously process queued commands in FIFO order."""
        while not self._queue_stop.is_set():
            try:
                task: CommandTask = self._command_queue.get(timeout=0.2)
            except Empty:
                continue

            try:
                if task.action is None:
                    task.result = (False, "Missing command action")
                else:
                    task.result = task.action()
            except Exception as exc:
                self.logger.exception("Error executing queued command %s", task.cmd_name)
                task.result = (False, str(exc))
            finally:
                task.done_event.set()
                self._command_queue.task_done()

    def _queue_command(self, action: Callable[[], tuple[bool, Any]], cmd_name: str) -> CommandTask:
        """Queue a command action for serial delivery."""
        task = CommandTask(cmd_name=cmd_name, action=action)
        self._command_queue.put(task)
        return task

    def _wait_for_task(self, task: CommandTask, timeout: float | None = None) -> tuple[bool, Any]:
        if not task.done_event.wait(timeout):
            return False, f"Timed out waiting for queued command: {task.cmd_name}"
        return task.result if task.result is not None else (False, f"Queued command failed: {task.cmd_name}")

    def _send_frame_and_wait_ack(self, frame: bytearray, timeout: float = 3.0) -> tuple[bool, str]:
        ser = self._get_or_open_serial()
        with self._serial_lock:
            ser.write(frame)
            if not self._wait_for_ack(ser, timeout=timeout):
                return False, "ESP32 did not ACK command"
        return True, "OK"

    def _request_fill_levels_task(self, timeout: float = 3.0) -> tuple[bool, list[int] | None]:
        try:
            ser = self._get_or_open_serial()
            with self._serial_lock:
                ser.write(self._create_frame(self.config.cmd_report_fill_level))

                if timeout is None:
                    timeout = 3.0

                start = time.time()
                buffer = bytearray()
                while time.time() - start < timeout:
                    if ser.in_waiting > 0:
                        buffer.extend(ser.read(ser.in_waiting))
                        cmd, payload, consumed = self._extract_valid_frame(buffer)
                        if consumed > 0:
                            if cmd == self.config.cmd_report_fill_level and payload and len(payload) >= 1:
                                fill_levels = list(payload)
                                self.logger.info("Received fill levels: %s", fill_levels)
                                return True, fill_levels
                            buffer = buffer[consumed:]
                    time.sleep(0.01)

            self.logger.warning("Timeout waiting for fill levels response")
            return False, None
        except Exception as exc:
            self.logger.exception("Failed to request fill levels")
            return False, None

    def _get_bin_version_task(self, timeout: float = 3.0) -> tuple[bool, str | None]:
        """Send bin version request and wait for ESP32 response frame."""
        try:
            ser = self._get_or_open_serial()
            with self._serial_lock:
                ser.write(self._create_frame(self.config.cmd_get_version))
                start = time.time()
                buffer = bytearray()
                while time.time() - start < timeout:
                    if ser.in_waiting > 0:
                        buffer.extend(ser.read(ser.in_waiting))
                        cmd, payload, consumed = self._extract_valid_frame(buffer)
                        if consumed > 0:
                            if cmd == self.config.cmd_get_version:
                                try:
                                    return True, payload.decode('utf-8', errors='ignore').rstrip('\x00')
                                except Exception:
                                    return True, None
                            buffer = buffer[consumed:]
                    time.sleep(0.01)
            return False, None
        except Exception as exc:
            self.logger.exception("Failed to query bin version")
            return False, str(exc)

    def _get_system_info_task(self, timeout: float = 3.0) -> tuple[bool, SystemInfoDto | None]:
        """Send system-info request and wait for ESP32 response frame."""
        try:
            ser = self._get_or_open_serial()
            with self._serial_lock:
                ser.write(self._create_frame(self.config.cmd_get_system_info))
                start = time.time()
                buffer = bytearray()
                while time.time() - start < timeout:
                    if ser.in_waiting > 0:
                        buffer.extend(ser.read(ser.in_waiting))
                        cmd, payload, consumed = self._extract_valid_frame(buffer)
                        if consumed > 0:
                            if cmd == self.config.cmd_get_system_info:
                                try:
                                    return True, SystemInfoDto.from_payload(payload)
                                except Exception:
                                    self.logger.exception("Invalid system info payload received")
                                    return False, None
                            buffer = buffer[consumed:]
                    time.sleep(0.01)
            return False, None
        except Exception:
            self.logger.exception("Failed to query system info")
            return False, None

    def _upload_ota_task(self, firmware_path: Path) -> tuple[bool, str]:
        if not firmware_path.exists():
            return False, f"Firmware file not found: {firmware_path}"

        try:
            file_size = firmware_path.stat().st_size
            self.logger.info("Starting OTA upload file=%s size=%s", firmware_path.name, file_size)

            ser = self._get_or_open_serial()
            with self._serial_lock:
                payload_start = struct.pack(">I", file_size)
                ser.write(self._create_frame(self.config.cmd_ota_start, payload_start))
                if not self._wait_for_ack(ser, timeout=10):
                    return False, "ESP32 did not ACK OTA start"

                bytes_sent = 0
                last_logged_percent = 0
                with open(firmware_path, "rb") as f:
                    while True:
                        chunk = f.read(self.config.chunk_size)
                        if not chunk:
                            break
                        ser.write(self._create_frame(self.config.cmd_ota_data, chunk))
                        if not self._wait_for_ack(ser, timeout=2):
                            return False, f"ESP32 did not ACK OTA data at byte {bytes_sent}"
                        bytes_sent += len(chunk)

                        progress_percent = int((bytes_sent / file_size) * 100)
                        if progress_percent >= last_logged_percent + 10 or progress_percent == 100:
                            progress_bar = "█" * (progress_percent // 10) + "░" * (10 - progress_percent // 10)
                            self.logger.info(
                                "OTA progress: [%s] %3d%% (%s / %s bytes)",
                                progress_bar,
                                progress_percent,
                                bytes_sent,
                                file_size,
                            )
                            last_logged_percent = (progress_percent // 10) * 10

                ser.write(self._create_frame(self.config.cmd_ota_end))
                if not self._wait_for_ack(ser, timeout=3):
                    return False, "ESP32 did not ACK OTA end"

            self.logger.info("OTA firmware upload completed successfully. Bytes sent: %s", bytes_sent)
            return True, "OTA upload completed successfully"
        except Exception as exc:
            self.logger.exception("OTA upload failed")
            return False, str(exc)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def control_step_motor(self, degree: int) -> tuple[bool, str]:
        """Rotate the step motor by the requested angle in degrees.
        
        Command is queued and sent when ESP32 is ready (no pending ACK).
        """
        try:
            self.logger.info("Queueing step motor command degree=%s", degree)
            payload = struct.pack(">h", int(degree))
            frame = self._create_frame(self.config.cmd_ctrl_stepper, payload)
            self._queue_command(lambda: self._send_frame_and_wait_ack(frame, timeout=2.0), f"control_stepper({degree}°)")
            return True, f"Step motor command queued: {degree}°"
        except Exception as exc:
            self.logger.exception("Failed to queue step motor command")
            return False, str(exc)

    def update_device_config(self, full_threshold: float, device_height: float) -> tuple[bool, str]:
        """Send threshold and height config to ESP32."""
        try:
            payload = struct.pack(">Bf", int(full_threshold), float(device_height))
            frame = self._create_frame(self.config.cmd_ctrl_device_config, payload)
            self._queue_command(
                lambda: self._send_frame_and_wait_ack(frame, timeout=2.0),
                f"device_config(threshold={full_threshold}, height={device_height})",
            )
            return True, "Device config command queued"
        except Exception as exc:
            self.logger.exception("Failed to queue device config command")
            return False, str(exc)

    def get_bin_version(self, timeout: float | None = None) -> tuple[bool, str | None]:
        """Request bin version from ESP32; returns (ok, version_str|None)."""
        task = self._queue_command(lambda: self._get_bin_version_task(timeout), "get_bin_version")
        wait_timeout = None if timeout is None else timeout + 1.0
        return self._wait_for_task(task, timeout=wait_timeout)

    def request_fill_levels(self, timeout: float | None = None) -> tuple[bool, list[int] | None]:
        """Send request command to get fill levels from ESP32.
        
        This method should be called periodically (default interval from config.esp32_ota.fill_levels_poll_interval_seconds).
        Returns (success, fill_levels_list) where fill_levels_list is [bin1, bin2, bin3, bin4] or None if failed.
        """
        task = self._queue_command(lambda: self._request_fill_levels_task(timeout), "request_fill_levels")
        wait_timeout = None if timeout is None else timeout + 1.0
        return self._wait_for_task(task, timeout=wait_timeout)

    def upload_ota(self, firmware_file: str | Path | None = None) -> tuple[bool, str]:
        """Upload firmware to the ESP32 using the framed OTA protocol."""
        firmware_path = Path(firmware_file) if firmware_file else self.firmware_file
        task = self._queue_command(lambda: self._upload_ota_task(firmware_path), f"upload_ota({firmware_path.name})")
        return self._wait_for_task(task, timeout=None)

    def get_system_info(self, timeout: float | None = None) -> tuple[bool, SystemInfoDto | None]:
        """Request chip, flash, and RAM information from the ESP32."""
        task = self._queue_command(lambda: self._get_system_info_task(timeout or 3.0), "get_system_info")
        wait_timeout = None if timeout is None else timeout + 1.0
        return self._wait_for_task(task, timeout=wait_timeout)

    def close_serial(self) -> None:
        """Close the serial connection."""
        self._queue_stop.set()
        self._close_serial()

    def process_command_queue_if_ready(self) -> bool:
        """Process command queue if ESP32 is ready (not waiting for ACK).
        
        Should be called regularly (e.g., from app timer).
        Returns True if a command was processed from queue.
        """
        return not self._command_queue.empty()


# Backward-compatible alias for older imports.
ActuatorClient = ActuatorRepository
