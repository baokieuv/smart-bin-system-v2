"""Serial actuator transport for ESP32 step motor control and OTA upload.
Module này chịu trách nhiệm giao tiếp nối tiếp (Serial) với thiết bị ESP32 để điều khiển 
động cơ bước, đọc cảm biến và cập nhật firmware OTA. Mọi giao tiếp được bảo vệ bởi mã lỗi CRC-8.
"""

from __future__ import annotations

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
    """Một đơn vị công việc (task) được đưa vào hàng đợi để gửi qua Serial."""

    cmd_name: str = ""
    # Hàm thực thi lệnh, trả về tuple (thành_công_hay_không, dữ_liệu_trả_về)
    action: Callable[[], tuple[bool, Any]] | None = None
    # Sự kiện dùng để báo hiệu cho thread gọi lệnh biết rằng task đã xong
    done_event: Event = field(default_factory=Event, repr=False)
    # Kết quả trả về sau khi task thực thi xong
    result: tuple[bool, Any] | None = field(default=None, repr=False)


class ActuatorRepository:
    """Gửi các lệnh được đóng gói (Frame) kèm CRC-8 tới ESP32 qua cổng Serial.

    Tất cả lệnh I/O Serial được đồng bộ hoá thông qua một luồng chạy ngầm (worker thread) 
    chứa hàng đợi (queue), giúp các lệnh không bị đụng độ (race condition) lẫn nhau.
    API cung cấp chế độ gửi không chờ (fire-and-forget) hoặc chờ phản hồi (blocking).
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
        self._serial_lock = Lock() # Đảm bảo an toàn luồng khi truy cập Serial

        self._discovered_port: str | None = None  # Cache lại cổng COM sau khi handshake thành công
        self._command_queue: Queue[CommandTask] = Queue()
        self._queue_stop = Event()
        self._queue_worker: Thread | None = None
        self._start_queue_worker()

    def _start_queue_worker(self) -> None:
        """Khởi động luồng (thread) chạy ngầm để xử lý hàng đợi lệnh."""
        if self._queue_worker is not None and self._queue_worker.is_alive():
            return

        self._queue_stop.clear()
        self._queue_worker = Thread(target=self._run_queue, daemon=True, name="smart-bin-serial-queue")
        self._queue_worker.start()
        self.logger.info("Serial queue worker started alive=%s", self._queue_worker.is_alive())

    # ------------------------------------------------------------------
    # Serial connection helpers (Quản lý kết nối Serial)
    # ------------------------------------------------------------------

    def _open_serial(self) -> serial.Serial:
        """Mở kết nối Serial tới ESP32."""
        try:
            target_port = self._get_active_port() 
            
            ser = serial.Serial(
                target_port, 
                self.baud_rate, 
                timeout=1.0,
                write_timeout=2.0,
            )
            
            self.logger.info("Serial opened successfully: port=%s baud=%s", target_port, self.baud_rate)
            # Tắt DTR và RTS để tránh làm ESP32 tự động reset khi mở cổng
            ser.setDTR(False)
            ser.setRTS(False)
            time.sleep(1.5) # Đợi ESP32 khởi động ổn định
            ser.reset_input_buffer()
            return ser
        except serial.SerialException as exc:
            self.logger.error("Failed to open serial port %s: %s", target_port, exc)
            raise

    @contextmanager
    def _serial_session(self) -> Generator[serial.Serial, None, None]:
        """Tạo context manager để lấy Lock và cấp quyền truy cập cổng Serial an toàn."""
        with self._serial_lock:
            try:
                # Mở kết nối nếu chưa mở hoặc đã bị đóng
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
        """Đóng cổng kết nối Serial an toàn."""
        with self._serial_lock:
            if self._serial_conn is not None and self._serial_conn.is_open:
                try:
                    self._serial_conn.close()
                except Exception as exc:
                    self.logger.warning("Error closing serial port: %s", exc)
            self._serial_conn = None
            
    def _find_and_handshake_port(self) -> str | None:
        """Dò tìm cổng COM bằng cách gửi lệnh kiểm tra và chờ phản hồi (ACK)."""
        import serial.tools.list_ports
        
        # 1. Lấy danh sách tất cả cổng COM đang cắm vào máy tính
        ports = serial.tools.list_ports.comports()
        
        for port in ports:
            self.logger.info("Đang kiểm tra cổng: %s", port.device)
            try:
                with serial.Serial(port.device, self.baud_rate, timeout=3.0, write_timeout=3.0) as ser:
                    ser.setDTR(False)
                    ser.setRTS(False)
                    time.sleep(1.5)
                    ser.reset_input_buffer()

                    # Gửi lệnh test (dùng lệnh unblock_lid) để ping thiết bị
                    ser.write(self._create_frame(self.config.cmd_unblock_lid))
                    
                    # Chờ phản hồi
                    time.sleep(1)
                    if ser.in_waiting > 0:
                        buffer = ser.read(ser.in_waiting)
                        cmd, payload, _ = self._extract_valid_frame(bytearray(buffer))
                        
                        # Nếu nhận được ACK đúng chuẩn, chứng tỏ đây là ESP32 của chúng ta
                        if cmd == self.config.cmd_ack:
                            self.logger.info("Tìm thấy thiết bị tại: %s", port.device)
                            self._discovered_port = port.device # Cache lại để dùng sau
                            return port.device
            except Exception as e:
                self.logger.debug("Cổng %s không phản hồi: %s", port.device, e)
        return None
    
    def _get_active_port(self) -> str:
        """Lấy cổng đã cache hoặc thực hiện quá trình dò tìm."""
        if self._discovered_port:
            return self._discovered_port
        
        port = self._find_and_handshake_port()
        if not port:
            raise RuntimeError("Không tìm thấy thiết bị ESP32 nào trên cổng COM!")
        return port

    # ------------------------------------------------------------------
    # Frame encoding / decoding (Mã hoá / Giải mã khung truyền)
    # ------------------------------------------------------------------

    def _calculate_crc8(self, cmd: int, length: int, payload: bytes) -> int:
        """Tính mã kiểm tra CRC-8 tiêu chuẩn (Polynomial 0x07) đồng bộ với Firmware C ESP32."""
        crc = 0x00
        
        # 1. Đưa Cmd (1 byte) và Len (2 bytes) vào mảng chung để tính trước
        header_data = [cmd, (length >> 8) & 0xFF, length & 0xFF]
        
        # Phép tính đa thức CRC (XOR và Dịch bit) cho phần Header
        for b in header_data:
            crc ^= b
            for _ in range(8):
                if crc & 0x80:
                    crc = ((crc << 1) ^ 0x07) & 0xFF
                else:
                    crc = (crc << 1) & 0xFF
                    
        # 3. Tính tiếp CRC cho phần Payload (nếu có dữ liệu)
        for b in payload:
            crc ^= b
            for _ in range(8):
                if crc & 0x80:
                    crc = ((crc << 1) ^ 0x07) & 0xFF
                else:
                    crc = (crc << 1) & 0xFF
                    
        return crc

    def _create_frame(self, cmd: int, payload: bytes = b"") -> bytearray:
        """Đóng gói dữ liệu thành khung truyền chuẩn: Header + Cmd + Len + Payload + CRC + Tail."""
        length = len(payload)
        frame = bytearray([
            self.config.header_1,
            self.config.header_2,
            cmd,
            (length >> 8) & 0xFF,  # Độ dài byte cao
            length & 0xFF,         # Độ dài byte thấp
        ])
        frame.extend(payload)      # Dữ liệu thực (Payload)
        
        # Tính toán và chèn 1 byte CRC vào trước byte Tail
        frame.append(self._calculate_crc8(cmd, length, payload))
        frame.append(self.config.tail)
        return frame

    def _extract_valid_frame(
        self, buffer: bytearray
    ) -> tuple[int | None, bytes | None, int]:
        """Quét bộ đệm để trích xuất 1 khung truyền đúng chuẩn bảo mật bằng CRC8."""
        min_frame = 5 + 1 + 1  # Chiều dài tối thiểu: header(5) + crc(1) + tail(1) = 7 bytes
        
        while len(buffer) >= min_frame:
            # 1. Tìm Header (2 bytes đầu tiên)
            if buffer[0] != self.config.header_1 or buffer[1] != self.config.header_2:
                buffer.pop(0) # Trượt 1 byte nếu không khớp Header
                continue

            # 2. Lấy Lệnh và Chiều dài payload
            cmd = buffer[2]
            length = (buffer[3] << 8) | buffer[4]
            total_len = 5 + length + 1 + 1 # Tổng chiều dài Frame dự kiến

            if len(buffer) < total_len:
                break  # Khung truyền chưa tải về đủ bytes, thoát để chờ nhận thêm

            # 3. Tách dữ liệu
            payload = bytes(buffer[5 : 5 + length])
            received_crc = buffer[5 + length]  # Lấy 1 byte CRC
            tail = buffer[5 + length + 1]

            # 4. Kiểm tra tính toàn vẹn bằng CRC và byte Tail
            if tail == self.config.tail and self._calculate_crc8(cmd, length, payload) == received_crc:
                return cmd, payload, total_len # Khung hợp lệ

            # Nếu khung lỗi (sai Tail hoặc sai CRC), xoá byte đầu đi và thử quét tiếp
            buffer.pop(0)

        return None, None, 0

    def _wait_for_ack(self, ser: serial.Serial, timeout: float = 3.0) -> bool:
        """Chặn (Block) luồng để chờ phản hồi ACK/NACK từ ESP32."""
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
                        
                        # Cắt bỏ phần buffer đã được phân tích
                        buffer = buffer[consumed:]
            except serial.SerialException as exc:
                self.logger.error("Serial read error waiting for ACK: %s", exc)
                return False
                
            time.sleep(0.01) # Ngủ ngắn để tránh tốn CPU

        self.logger.warning("ACK timeout. buffer=%s", buffer.hex(" "))
        return False

    # ------------------------------------------------------------------
    # Command queue (Quản lý hàng đợi lệnh)
    # ------------------------------------------------------------------

    def _run_queue(self) -> None:
        """Hàm chạy ngầm liên tục để xử lý tuần tự từng lệnh trong hàng đợi."""
        current_task: CommandTask | None = None
        try:
            while not self._queue_stop.is_set():
                try:
                    # Lấy task từ queue, đợi tối đa 0.2s
                    current_task = self._command_queue.get(timeout=0.2)
                except Empty:
                    current_task = None
                    continue

                try:
                    self.logger.info("Dequeued serial task: %s", current_task.cmd_name)
                    # Thực thi lệnh (Action) được gán trong Task
                    current_task.result = current_task.action() if current_task.action else (False, "Missing command action")
                    self.logger.info("Completed serial task: %s result=%s", current_task.cmd_name, current_task.result[0])
                except Exception as exc:
                    self.logger.exception("Error executing queued command %s", current_task.cmd_name)
                    current_task.result = (False, str(exc))
                finally:
                    # Đánh dấu task đã xong, giải phóng cho thread đang đợi (nếu có)
                    current_task.done_event.set()
                    self._command_queue.task_done()
                    current_task = None

        except Exception:
            self.logger.exception("Serial queue worker crashed — worker will stop")
        finally:
            # Xử lý dọn dẹp nếu luồng bị crash
            if current_task is not None and not current_task.done_event.is_set():
                current_task.result = (False, "Worker crashed unexpectedly")
                current_task.done_event.set()
                self._command_queue.task_done()
            self.logger.info("Serial queue worker exited")

    def _enqueue(self, action: Callable[[], tuple[bool, Any]], cmd_name: str) -> CommandTask:
        """Đẩy một lệnh mới vào hàng đợi (Queue) để luồng ngầm xử lý."""
        self._start_queue_worker() # Đảm bảo worker vẫn đang sống
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
        """Chờ (Block) một task thực thi xong và trả về kết quả."""
        if not task.done_event.wait(timeout):
            return False, f"Timed out waiting for: {task.cmd_name}"
        return task.result or (False, f"Command produced no result: {task.cmd_name}")

    # ------------------------------------------------------------------
    # Task implementations (Các tác vụ được chạy bởi Queue Worker)
    # ------------------------------------------------------------------

    def _send_frame_and_wait_ack(self, frame: bytearray, timeout: float = 3.0) -> tuple[bool, str]:
        """Tác vụ chung: Gửi 1 Frame dữ liệu và chờ xác nhận ACK."""
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
        """Tác vụ: Yêu cầu ESP32 đọc và trả về độ đầy của cảm biến siêu âm."""
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
                                # Nếu lệnh trả về đúng, decode byte sang số nguyên (mức rác %)
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
        """Tác vụ: Lấy chuỗi Version phần mềm của ESP32."""
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
                                    # Ép kiểu dữ liệu payload sang chuỗi UTF-8 và bỏ null bytes
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
        """Tác vụ: Lấy cấu hình hệ thống (Chip, Flash, RAM) từ ESP32."""
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
        """Tác vụ: Cập nhật Firmware OTA cho ESP32.
        
        Quy trình: 
        1. Gửi lệnh bắt đầu + Kích thước file.
        2. Gửi tuần tự các khối dữ liệu (chunks) và chờ ACK.
        3. Gửi lệnh kết thúc và ESP tự khởi động lại.
        """
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
                    # Đọc file ra thành từng chunk nhỏ theo kích thước cấu hình
                    while chunk := fh.read(self.config.chunk_size):
                        ser.write(self._create_frame(self.config.cmd_ota_data, chunk))
                        if not self._wait_for_ack(ser, timeout=2):
                            return False, f"ESP32 did not ACK OTA data at byte {bytes_sent}"
                        
                        bytes_sent += len(chunk)
                        
                        # Vẽ thanh tiến trình ra Log (tiến độ mỗi 10%)
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
    # Public API (Các hàm được dùng từ bên ngoài Class)
    # ------------------------------------------------------------------

    def control_step_motor(self, degree: int) -> tuple[bool, str]:
        """Xoay động cơ bước theo một góc xác định (Không chặn luồng - Fire-and-forget)."""
        try:
            # Gửi 2 bytes số nguyên kiểu short (>h)
            frame = self._create_frame(self.config.cmd_ctrl_stepper, struct.pack(">h", int(degree)))
            self._enqueue(lambda: self._send_frame_and_wait_ack(frame, timeout=2.0), f"stepper({degree}°)")
            return True, f"Step motor command queued: {degree}°"
        except Exception as exc:
            self.logger.exception("Failed to queue step motor command")
            return False, str(exc)

    def update_device_config(self, full_threshold: float, device_height: float) -> tuple[bool, str]:
        """Gửi cấu hình về ngưỡng đầy (threshold) và độ sâu thùng (height) tới ESP32."""
        try:
            # Đóng gói 1 float (4 bytes) và 1 unsigned byte (1 byte) -> "<fB"
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
        """Lấy phiên bản phần mềm (Block và đợi phản hồi)."""
        task = self._enqueue(lambda: self._get_bin_version_task(timeout), "get_bin_version")
        return self._wait_for_task(task, timeout=timeout + 1.0)

    def request_fill_levels(self, timeout: float = 3.0) -> tuple[bool, list[int] | None]:
        """Kiểm tra độ đầy của 4 thùng rác (Block và đợi list dữ liệu)."""
        task = self._enqueue(lambda: self._request_fill_levels_task(timeout), "request_fill_levels")
        return self._wait_for_task(task, timeout=timeout + 1.0)

    def upload_ota(self, firmware_file: str | Path | None = None) -> tuple[bool, str]:
        """Tải file *.bin (Firmware mới) lên ESP32."""
        firmware_path = Path(firmware_file) if firmware_file else self.firmware_file
        task = self._enqueue(lambda: self._upload_ota_task(firmware_path), f"upload_ota({firmware_path.name})")
        # Phải cấu hình timeout lớn (ví dụ 60-120s) vì quá trình flash firmware chạy rất lâu
        return self._wait_for_task(task, timeout=float(self.config.upload_task_timeout_seconds))

    def get_system_info(self, timeout: float = 3.0) -> tuple[bool, SystemInfoDto | None]:
        """Lấy phần cứng và RAM của hệ thống (Block)."""
        task = self._enqueue(lambda: self._get_system_info_task(timeout), "get_system_info")
        return self._wait_for_task(task, timeout=timeout + 1.0)

    def close_serial(self) -> None:
        """Kéo cờ dừng Queue Worker và ngắt kết nối Serial."""
        try:
            self._queue_stop.set()
            if self._queue_worker is not None:
                self._queue_worker.join(timeout=5.0)  # Đợi tối đa 5s cho worker đóng sạch sẽ
        except Exception as exc:
            self.logger.warning("Error stopping queue worker: %s", exc)
        finally:
            self._close_serial()
            
    def open_lid(self) -> tuple[bool, str]:
        """Gửi lệnh mở nắp thùng rác."""
        try:
            frame = self._create_frame(self.config.cmd_open_lid)
            self._enqueue(lambda: self._send_frame_and_wait_ack(frame, timeout=2.0), "open_lid")
            return True, "Open lid command queued"
        except Exception as exc:
            self.logger.exception("Failed to queue open lid command")
            return False, str(exc)
        
    def close_lid(self) -> tuple[bool, str]:
        """Gửi lệnh đóng nắp thùng rác."""
        try:
            frame = self._create_frame(self.config.cmd_close_lid)
            self._enqueue(lambda: self._send_frame_and_wait_ack(frame, timeout=2.0), "close_lid")
            return True, "Close lid command queued"
        except Exception as exc:
            self.logger.exception("Failed to queue close lid command")
            return False, str(exc)
        
    def block_lid(self) -> tuple[bool, str]:
        """Gửi lệnh vô hiệu hoá (khóa) thao tác đóng/mở thủ công."""
        try:
            frame = self._create_frame(self.config.cmd_block_lid)
            self._enqueue(lambda: self._send_frame_and_wait_ack(frame, timeout=2.0), "block_lid")
            return True, "Block lid command queued"
        except Exception as exc:
            self.logger.exception("Failed to queue block lid command")
            return False, str(exc)
        
    def unblock_lid(self) -> tuple[bool, str]:
        """Gửi lệnh mở khoá hệ thống, cho phép đóng/mở nắp bình thường."""
        try:
            frame = self._create_frame(self.config.cmd_unblock_lid)
            self._enqueue(lambda: self._send_frame_and_wait_ack(frame, timeout=2.0), "unblock_lid")
            return True, "Unblock lid command queued"
        except Exception as exc:
            self.logger.exception("Failed to queue unblock lid command")
            return False, str(exc)


# Bí danh tương thích ngược cho các file code cũ nếu đang import tên này
ActuatorClient = ActuatorRepository