"""Serial actuator transport for ESP32 step motor control and OTA upload."""

from __future__ import annotations

import hashlib
import hmac
import logging
import struct
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from queue import Empty, Queue
from threading import Event, Lock, Thread
from typing import Any, Callable, Generator

import serial

from src.models.system_info_dto import SystemInfoDto
from src.utils.config import APP_CONFIG


@dataclass
class CommandTask:
    """One unit of work dispatched to the serial queue worker."""

    cmd_name: str = ""
    action: Callable[[], tuple[bool, Any]] | None = None
    done_event: Event = field(default_factory=Event, repr=False)
    result: tuple[bool, Any] | None = field(default=None, repr=False)


class ActuatorRepository:
    """Send HMAC-framed commands to the ESP32 actuator over serial.

    All serial I/O is serialised through a single background queue worker so
    commands never race each other.  The public API returns immediately after
    enqueuing (fire-and-forget) *or* blocks until the queued task completes,
    depending on the caller's needs.

    Public API
    ----------
    control_step_motor(degree)
    update_device_config(full_threshold, device_height)
    request_fill_levels(timeout) -> (ok, [int] | None)
    get_bin_version(timeout)    -> (ok, str | None)
    get_system_info(timeout)    -> (ok, SystemInfoDto | None)
    upload_ota(firmware_file)   -> (ok, str)
    close_serial()
    """

    def __init__(
        self,
        com_port: str | None = None,
        baud_rate: int | None = None,
        firmware_file: str | Path | None = None,
    ) -> None:
        self.logger = logging.getLogger("smart_bin.actuator_repository")
        self.config = APP_CONFIG.esp32_ota
        self.com_port = com_port or self.config.com_port
        self.baud_rate = baud_rate or self.config.baud_rate
        self.firmware_file = Path(firmware_file) if firmware_file else Path(self.config.firmware_file)

        self._serial_conn: serial.Serial | None = None
        self._serial_lock = Lock()

        self._discovered_port: str | None = None  # Cache the COM port after successful handshake
        self._command_queue: Queue[CommandTask] = Queue()
        self._queue_stop = Event()
        self._queue_worker: Thread | None = None
        self._start_queue_worker()

    def _start_queue_worker(self) -> None:
        if self._queue_worker is not None and self._queue_worker.is_alive():
            return

        self._queue_stop.clear()
        self._queue_worker = Thread(target=self._run_queue, daemon=True, name="smart-bin-serial-queue")
        self._queue_worker.start()
        self.logger.info("Serial queue worker started alive=%s", self._queue_worker.is_alive())

    # ------------------------------------------------------------------
    # Serial connection helpers
    # ------------------------------------------------------------------

    def _open_serial(self) -> serial.Serial:
        try:
            target_port = self._get_active_port() 
            
            ser = serial.Serial(
                target_port, 
                self.baud_rate, 
                timeout=1.0,
                write_timeout=2.0,
            )
            
            self.logger.info("Serial opened successfully: port=%s baud=%s", target_port, self.baud_rate)
            ser.setDTR(False)
            ser.setRTS(False)
            time.sleep(1.5)
            ser.reset_input_buffer()
            return ser
        except serial.SerialException as exc:
            self.logger.error("Failed to open serial port %s: %s", target_port, exc)
            raise

    @contextmanager
    def _serial_session(self) -> Generator[serial.Serial, None, None]:
        """Acquire the serial lock, (re-)open the port if needed, yield the connection."""
        with self._serial_lock:
            try:
                if self._serial_conn is None or not self._serial_conn.is_open:
                    self.logger.info("Opening serial connection: port=%s baud=%s", self.com_port, self.baud_rate)
                    self._serial_conn = self._open_serial()
                else:
                    self.logger.debug("Reusing open serial connection: port=%s baud=%s", self.com_port, self.baud_rate)
                yield self._serial_conn
            except serial.SerialException as exc:
                self.logger.error("Serial connection error during session: %s", exc)
                self._serial_conn = None
                raise

    def _close_serial(self) -> None:
        with self._serial_lock:
            if self._serial_conn is not None and self._serial_conn.is_open:
                try:
                    self._serial_conn.close()
                except Exception as exc:
                    self.logger.warning("Error closing serial port: %s", exc)
            self._serial_conn = None
            
    def _find_and_handshake_port(self) -> str | None:
        """Dò tìm cổng COM bằng cách gửi lệnh kiểm tra và chờ ACK."""
        import serial.tools.list_ports
        
        # 1. Lấy tất cả cổng đang có
        ports = serial.tools.list_ports.comports()
        
        for port in ports:
            self.logger.info("Đang kiểm tra cổng: %s", port.device)
            try:
                with serial.Serial(port.device, self.baud_rate, timeout=3.0, write_timeout=3.0) as ser:
                    ser.setDTR(False)
                    ser.setRTS(False)
                    time.sleep(1.5)
                    ser.reset_input_buffer()

                    # Gửi lệnh test (ở đây dùng lệnh unblock_lid theo logic cũ của bạn)
                    ser.write(self._create_frame(self.config.cmd_unblock_lid))
                    
                    # Chờ phản hồi
                    time.sleep(1)
                    if ser.in_waiting > 0:
                        buffer = ser.read(ser.in_waiting)
                        cmd, payload, _ = self._extract_valid_frame(bytearray(buffer))
                        
                        if cmd == self.config.cmd_ack:
                            self.logger.info("Tìm thấy thiết bị tại: %s", port.device)
                            self._discovered_port = port.device # Lưu lại để dùng sau
                            return port.device
            except Exception as e:
                self.logger.debug("Cổng %s không phản hồi: %s", port.device, e)
        return None
    
    def _get_active_port(self) -> str:
        """Lấy cổng đã lưu hoặc thực hiện dò tìm nếu chưa có."""
        if self._discovered_port:
            return self._discovered_port
        
        port = self._find_and_handshake_port()
        if not port:
            raise RuntimeError("Không tìm thấy thiết bị ESP32 nào trên cổng COM!")
        return port

    # ------------------------------------------------------------------
    # Frame encoding / decoding
    # ------------------------------------------------------------------

    def _calculate_hmac(self, cmd: int, length: int, payload: bytes) -> bytes:
        msg = bytearray([cmd, (length >> 8) & 0xFF, length & 0xFF])
        if payload:
            msg.extend(payload)
        return hmac.new(self.config.secret_key, msg, hashlib.sha256).digest()

    def _create_frame(self, cmd: int, payload: bytes = b"") -> bytearray:
        length = len(payload)
        frame = bytearray([
            self.config.header_1,
            self.config.header_2,
            cmd,
            (length >> 8) & 0xFF,
            length & 0xFF,
        ])
        frame.extend(payload)
        frame.extend(self._calculate_hmac(cmd, length, payload))
        frame.append(self.config.tail)
        return frame

    def _extract_valid_frame(
        self, buffer: bytearray
    ) -> tuple[int | None, bytes | None, int]:
        """Scan buffer for the next valid HMAC-authenticated frame."""
        min_frame = 5 + 32 + 1  # header(5) + hmac(32) + tail(1)
        while len(buffer) >= min_frame:
            if buffer[0] != self.config.header_1 or buffer[1] != self.config.header_2:
                buffer.pop(0)
                continue

            cmd = buffer[2]
            length = (buffer[3] << 8) | buffer[4]
            total_len = 5 + length + 32 + 1

            if len(buffer) < total_len:
                break  # wait for more bytes

            payload = bytes(buffer[5 : 5 + length])
            received_mac = bytes(buffer[5 + length : 5 + length + 32])
            tail = buffer[5 + length + 32]

            if tail == self.config.tail and self._calculate_hmac(cmd, length, payload) == received_mac:
                return cmd, payload, total_len

            buffer.pop(0)  # bad frame — advance and retry

        return None, None, 0

    def _wait_for_ack(self, ser: serial.Serial, timeout: float = 3.0) -> bool:
        """Block until ACK/NACK arrives or timeout expires."""
        deadline = time.time() + timeout
        buffer = bytearray()

        while time.time() < deadline:
            try:
                if ser.in_waiting:
                    buffer.extend(ser.read(ser.in_waiting))
                    cmd, _payload, consumed = self._extract_valid_frame(buffer)
                    if consumed:
                        if cmd == self.config.cmd_ack:
                            return True
                        if cmd == self.config.cmd_nack:
                            self.logger.warning("Received NACK from ESP32")
                            return False
                        buffer = buffer[consumed:]
            except serial.SerialException as exc:
                self.logger.error("Serial read error waiting for ACK: %s", exc)
                return False
                
            time.sleep(0.01)

        self.logger.warning("ACK timeout. buffer=%s", buffer.hex(" "))
        return False

    # ------------------------------------------------------------------
    # Command queue
    # ------------------------------------------------------------------

    def _run_queue(self) -> None:
        current_task: CommandTask | None = None
        try:
            while not self._queue_stop.is_set():
                try:
                    current_task = self._command_queue.get(timeout=0.2)
                except Empty:
                    current_task = None
                    continue

                try:
                    self.logger.info("Dequeued serial task: %s", current_task.cmd_name)
                    current_task.result = current_task.action() if current_task.action else (False, "Missing command action")
                    self.logger.info("Completed serial task: %s result=%s", current_task.cmd_name, current_task.result[0])
                except Exception as exc:
                    self.logger.exception("Error executing queued command %s", current_task.cmd_name)
                    current_task.result = (False, str(exc))
                finally:
                    current_task.done_event.set()
                    self._command_queue.task_done()
                    current_task = None

        except Exception:
            self.logger.exception("Serial queue worker crashed — worker will stop")
        finally:
            if current_task is not None and not current_task.done_event.is_set():
                current_task.result = (False, "Worker crashed unexpectedly")
                current_task.done_event.set()
                self._command_queue.task_done()
            self.logger.info("Serial queue worker exited")

    def _enqueue(self, action: Callable[[], tuple[bool, Any]], cmd_name: str) -> CommandTask:
        self._start_queue_worker()
        task = CommandTask(cmd_name=cmd_name, action=action)
        self._command_queue.put(task)
        worker_alive = self._queue_worker.is_alive() if self._queue_worker is not None else False
        self.logger.info(
            "Enqueued serial task: %s queue_size=%d worker_alive=%s",
            cmd_name,
            self._command_queue.qsize(),
            worker_alive,
        )
        return task

    def _wait_for_task(self, task: CommandTask, timeout: float | None = None) -> tuple[bool, Any]:
        if not task.done_event.wait(timeout):
            return False, f"Timed out waiting for: {task.cmd_name}"
        return task.result or (False, f"Command produced no result: {task.cmd_name}")

    # ------------------------------------------------------------------
    # Task implementations (run inside queue worker)
    # ------------------------------------------------------------------

    def _send_frame_and_wait_ack(self, frame: bytearray, timeout: float = 3.0) -> tuple[bool, str]:
        try:
            with self._serial_session() as ser:
                ser.write(frame)
                if not self._wait_for_ack(ser, timeout=timeout):
                    return False, "ESP32 did not ACK command"
            return True, "OK"
        except serial.SerialException as exc:
            self.logger.error("Serial I/O error in _send_frame_and_wait_ack: %s", exc)
            return False, f"Serial error: {exc}"
        except Exception as exc:
            self.logger.exception("Unexpected error in _send_frame_and_wait_ack")
            return False, str(exc)

    def _request_fill_levels_task(self, timeout: float = 3.0) -> tuple[bool, list[int] | None]:
        try:
            with self._serial_session() as ser:
                ser.write(self._create_frame(self.config.cmd_report_fill_level))
                deadline = time.time() + timeout
                buffer = bytearray()
                while time.time() < deadline:
                    try:
                        if ser.in_waiting:
                            buffer.extend(ser.read(ser.in_waiting))
                            cmd, payload, consumed = self._extract_valid_frame(buffer)
                            if consumed:
                                if cmd == self.config.cmd_report_fill_level and payload:
                                    self.logger.info("Fill levels: %s", list(payload))
                                    return True, list(payload)
                                buffer = buffer[consumed:]
                    except serial.SerialException as exc:
                        self.logger.error("Serial read error during fill levels request: %s", exc)
                        return False, None
                    time.sleep(0.01)

            self.logger.warning("Timeout waiting for fill levels response")
            return False, None
        except serial.SerialException as exc:
            self.logger.error("Serial error in _request_fill_levels_task: %s", exc)
            return False, None
        except Exception:
            self.logger.exception("Failed to request fill levels")
            return False, None

    def _get_bin_version_task(self, timeout: float = 3.0) -> tuple[bool, str | None]:
        try:
            with self._serial_session() as ser:
                ser.write(self._create_frame(self.config.cmd_get_version))
                deadline = time.time() + timeout
                buffer = bytearray()
                while time.time() < deadline:
                    try:
                        if ser.in_waiting:
                            buffer.extend(ser.read(ser.in_waiting))
                            cmd, payload, consumed = self._extract_valid_frame(buffer)
                            if consumed:
                                if cmd == self.config.cmd_get_version:
                                    version = payload.decode("utf-8", errors="ignore").rstrip("\x00") if payload else None
                                    return True, version or None
                                buffer = buffer[consumed:]
                    except serial.SerialException as exc:
                        self.logger.error("Serial read error during version request: %s", exc)
                        return False, None
                    time.sleep(0.01)
            return False, None
        except serial.SerialException as exc:
            self.logger.error("Serial error in _get_bin_version_task: %s", exc)
            return False, None
        except Exception:
            self.logger.exception("Failed to query bin version")
            return False, None

    def _get_system_info_task(self, timeout: float = 3.0) -> tuple[bool, SystemInfoDto | None]:
        try:
            with self._serial_session() as ser:
                ser.write(self._create_frame(self.config.cmd_get_system_info))
                deadline = time.time() + timeout
                buffer = bytearray()
                while time.time() < deadline:
                    try:
                        if ser.in_waiting:
                            buffer.extend(ser.read(ser.in_waiting))
                            cmd, payload, consumed = self._extract_valid_frame(buffer)
                            if consumed:
                                if cmd == self.config.cmd_get_system_info:
                                    try:
                                        return True, SystemInfoDto.from_payload(payload)
                                    except Exception:
                                        self.logger.exception("Invalid system info payload")
                                        return False, None
                                buffer = buffer[consumed:]
                    except serial.SerialException as exc:
                        self.logger.error("Serial read error during system info request: %s", exc)
                        return False, None
                    time.sleep(0.01)
            return False, None
        except serial.SerialException as exc:
            self.logger.error("Serial error in _get_system_info_task: %s", exc)
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

            with self._serial_session() as ser:
                # --- OTA start ---
                ser.write(self._create_frame(self.config.cmd_ota_start, struct.pack(">I", file_size)))
                if not self._wait_for_ack(ser, timeout=10):
                    return False, "ESP32 did not ACK OTA start"

                # --- OTA data chunks ---
                bytes_sent = 0
                last_logged_pct = 0
                with open(firmware_path, "rb") as fh:
                    while chunk := fh.read(self.config.chunk_size):
                        ser.write(self._create_frame(self.config.cmd_ota_data, chunk))
                        if not self._wait_for_ack(ser, timeout=2):
                            return False, f"ESP32 did not ACK OTA data at byte {bytes_sent}"
                        bytes_sent += len(chunk)
                        pct = int(bytes_sent / file_size * 100)
                        if pct >= last_logged_pct + 10 or pct == 100:
                            bar = "█" * (pct // 10) + "░" * (10 - pct // 10)
                            self.logger.info("OTA [%s] %3d%% (%d/%d bytes)", bar, pct, bytes_sent, file_size)
                            last_logged_pct = (pct // 10) * 10

                # --- OTA end ---
                ser.write(self._create_frame(self.config.cmd_ota_end))
                if not self._wait_for_ack(ser, timeout=3):
                    return False, "ESP32 did not ACK OTA end"

            self.logger.info("OTA upload completed. bytes_sent=%d", bytes_sent)
            return True, "OTA upload completed successfully"
        except serial.SerialException as exc:
            self.logger.error("Serial error during OTA upload: %s", exc)
            return False, f"Serial error: {exc}"
        except Exception as exc:
            self.logger.exception("OTA upload failed")
            return False, str(exc)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def control_step_motor(self, degree: int) -> tuple[bool, str]:
        """Rotate the stepper motor by *degree* degrees (fire-and-forget)."""
        try:
            frame = self._create_frame(self.config.cmd_ctrl_stepper, struct.pack(">h", int(degree)))
            self._enqueue(lambda: self._send_frame_and_wait_ack(frame, timeout=2.0), f"stepper({degree}°)")
            return True, f"Step motor command queued: {degree}°"
        except Exception as exc:
            self.logger.exception("Failed to queue step motor command")
            return False, str(exc)

    def update_device_config(self, full_threshold: float, device_height: float) -> tuple[bool, str]:
        """Push threshold and height config to ESP32 (fire-and-forget)."""
        try:
            frame = self._create_frame(
                self.config.cmd_ctrl_device_config,
                struct.pack("<fB", float(device_height), int(full_threshold)),
            )
            self._enqueue(
                lambda: self._send_frame_and_wait_ack(frame, timeout=2.0),
                f"device_config(height={device_height}, threshold={int(full_threshold)})",
            )
            return True, "Device config command queued"
        except Exception as exc:
            self.logger.exception("Failed to queue device config command")
            return False, str(exc)

    def get_bin_version(self, timeout: float = 3.0) -> tuple[bool, str | None]:
        task = self._enqueue(lambda: self._get_bin_version_task(timeout), "get_bin_version")
        return self._wait_for_task(task, timeout=timeout + 1.0)

    def request_fill_levels(self, timeout: float = 3.0) -> tuple[bool, list[int] | None]:
        task = self._enqueue(lambda: self._request_fill_levels_task(timeout), "request_fill_levels")
        return self._wait_for_task(task, timeout=timeout + 1.0)

    def upload_ota(self, firmware_file: str | Path | None = None) -> tuple[bool, str]:
        firmware_path = Path(firmware_file) if firmware_file else self.firmware_file
        task = self._enqueue(lambda: self._upload_ota_task(firmware_path), f"upload_ota({firmware_path.name})")
        return self._wait_for_task(task, timeout=float(self.config.upload_task_timeout_seconds))

    def get_system_info(self, timeout: float = 3.0) -> tuple[bool, SystemInfoDto | None]:
        task = self._enqueue(lambda: self._get_system_info_task(timeout), "get_system_info")
        return self._wait_for_task(task, timeout=timeout + 1.0)

    def close_serial(self) -> None:
        try:
            self._queue_stop.set()
            if self._queue_worker is not None:
                self._queue_worker.join(timeout=5.0)  # Chờ worker thoát sạch
        except Exception as exc:
            self.logger.warning("Error stopping queue worker: %s", exc)
        finally:
            self._close_serial()
            
    def open_lid(self) -> tuple[bool, str]:
        try:
            frame = self._create_frame(self.config.cmd_open_lid)
            self._enqueue(lambda: self._send_frame_and_wait_ack(frame, timeout=2.0), "open_lid")
            return True, "Open lid command queued"
        except Exception as exc:
            self.logger.exception("Failed to queue open lid command")
            return False, str(exc)
        
    def close_lid(self) -> tuple[bool, str]:
        try:
            frame = self._create_frame(self.config.cmd_close_lid)
            self._enqueue(lambda: self._send_frame_and_wait_ack(frame, timeout=2.0), "close_lid")
            return True, "Close lid command queued"
        except Exception as exc:
            self.logger.exception("Failed to queue close lid command")
            return False, str(exc)
        
    def block_lid(self) -> tuple[bool, str]:
        try:
            frame = self._create_frame(self.config.cmd_block_lid)
            self._enqueue(lambda: self._send_frame_and_wait_ack(frame, timeout=2.0), "block_lid")
            return True, "Block lid command queued"
        except Exception as exc:
            self.logger.exception("Failed to queue block lid command")
            return False, str(exc)
        
    def unblock_lid(self) -> tuple[bool, str]:
        try:
            frame = self._create_frame(self.config.cmd_unblock_lid)
            self._enqueue(lambda: self._send_frame_and_wait_ack(frame, timeout=2.0), "unblock_lid")
            return True, "Unblock lid command queued"
        except Exception as exc:
            self.logger.exception("Failed to queue unblock lid command")
            return False, str(exc)


# Backward-compatible alias for older imports.
ActuatorClient = ActuatorRepository