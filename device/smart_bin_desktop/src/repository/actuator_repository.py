"""Giao tiếp Serial với ESP32: điều khiển servo, stepper, đọc cảm biến, OTA.
 
Giao thức sử dụng khung truyền tuỳ chỉnh: [Header(2)] [Cmd(1)] [Len(2)] [Payload] [CRC8(1)] [Tail(1)]
Mọi lệnh được xử lý tuần tự qua một hàng đợi + worker thread ngầm để tránh race condition.
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
from src.utils.config import APP_CONFIG, Esp32OtaConfig

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
 
# Chiều dài tối thiểu của một frame hợp lệ:
# Header(2) + Cmd(1) + Len(2) + CRC(1) + Tail(1) = 7 bytes
_MIN_FRAME_LEN: int = 7
 
# Thời gian ngủ ngắn giữa các lần kiểm tra ACK, tránh busy-loop tốn CPU
_ACK_POLL_INTERVAL_S: float = 0.01
 
# Thời gian chờ worker thread dừng gracefully khi close_serial() được gọi
_WORKER_JOIN_TIMEOUT_S: float = 5.0


@dataclass
class CommandTask:
    """Một đơn vị công việc được đưa vào hàng đợi để gửi qua Serial.
 
    ``action`` là một callable trả về (ok, data); ``done_event`` được set
    khi action hoàn thành để unblock thread đang đợi kết quả.
    """
 
    cmd_name: str = ""
    # Hàm thực thi lệnh, trả về tuple (thành_công_hay_không, dữ_liệu_trả_về)
    action: Callable[[], tuple[bool, Any]] | None = None
    # Sự kiện dùng để báo hiệu cho thread gọi lệnh biết rằng task đã xong
    done_event: Event = field(default_factory=Event, repr=False)
    # Kết quả trả về sau khi task thực thi xong
    result: tuple[bool, Any] | None = field(default=None, repr=False)

class _SerialConnectionManager:
    """Quản lý vòng đời kết nối Serial: mở, đóng, dò tìm cổng, context manager.
    """
 
    def __init__(self, com_port: str, baud_rate: int, config: Esp32OtaConfig, logger: logging.Logger) -> None:
        self._com_port = com_port
        self._baud_rate = baud_rate
        self._config = config
        self._logger = logger
 
        self._serial_conn: serial.Serial | None = None
        self._lock = Lock()
        self._discovered_port: str | None = None  # Cache cổng sau khi handshake thành công

    @contextmanager
    def session(self) -> Generator[serial.Serial, None, None]:
        """Trả về kết nối Serial an toàn (thread-safe) trong một context block.
 
        Nếu chưa có kết nối, tự động mở mới. Khi xảy ra lỗi Serial,
        kết nối bị huỷ để lần sau sẽ kết nối lại từ đầu.
        """
        with self._lock:
            try:
                if self._serial_conn is None or not self._serial_conn.is_open:
                    self._serial_conn = self._open()
                yield self._serial_conn
            except serial.SerialException as exc:
                self._logger.error("Serial error during session: %s", exc)
                self._serial_conn = None
                raise
            
    def close(self) -> None:
        """Đóng kết nối Serial an toàn."""
        with self._lock:
            if self._serial_conn is not None and self._serial_conn.is_open:
                try:
                    self._serial_conn.close()
                except Exception as exc:
                    self._logger.warning("Error closing serial port: %s", exc)
            self._serial_conn = None
            
    def _open(self) -> serial.Serial:
        """Mở kết nối Serial đến cổng đã xác định (hoặc vừa dò ra)."""
        port = self._get_active_port()
        ser = serial.Serial(port, self._baud_rate, timeout=1.0, write_timeout=2.0)
        self._logger.info("Serial opened: port=%s baud=%s", port, self._baud_rate)
 
        # Tắt DTR/RTS để tránh ESP32 tự reset khi mở cổng
        ser.setDTR(False)
        ser.setRTS(False)
        time.sleep(1.5)  # Chờ ESP32 khởi động ổn định
        ser.reset_input_buffer()
        return ser
    
    def _get_active_port(self) -> str:
        """Trả về cổng đã cache, hoặc thực hiện dò tìm nếu chưa có."""
        if self._discovered_port:
            return self._discovered_port
        port = self._handshake_scan()
        if not port:
            raise RuntimeError("Không tìm thấy thiết bị ESP32 nào trên cổng COM!")
        return port
    
    def _handshake_scan(self) -> str | None:
        """Quét tất cả cổng COM, gửi lệnh ping, trả về cổng đầu tiên phản hồi ACK."""
        import serial.tools.list_ports  # import muộn để không phụ thuộc nặng khi test
 
        cfg = self._config
        for port_info in serial.tools.list_ports.comports():
            self._logger.info("Scanning port: %s", port_info.device)
            try:
                with serial.Serial(port_info.device, self._baud_rate, timeout=3.0, write_timeout=3.0) as ser:
                    ser.setDTR(False)
                    ser.setRTS(False)
                    time.sleep(1.5)
                    ser.reset_input_buffer()
                    
                    ping_frame = FrameCodec.create_frame(cfg, cfg.cmd_unblock_lid)
                    ser.write(ping_frame)
                    time.sleep(1.0)
 
                    if ser.in_waiting > 0:
                        raw = bytearray(ser.read(ser.in_waiting))
                        cmd, _, _ = FrameCodec.extract_valid_frame(cfg, raw)
                        if cmd == cfg.cmd_ack:
                            self._logger.info("ESP32 found at: %s", port_info.device)
                            self._discovered_port = port_info.device
                            return port_info.device
            except Exception as exc:
                self._logger.debug("Port %s did not respond: %s", port_info.device, exc)
        return None
   
   
class FrameCodec:
    """Đóng gói và giải mã khung truyền UART với bảo vệ CRC-8.
 
    Tất cả phương thức là ``staticmethod`` vì logic không phụ thuộc bất kỳ
    trạng thái nào — dễ kiểm thử độc lập và tái sử dụng không cần instance.
    """
    
    @staticmethod
    def calculate_crc8(cmd: int, length: int, payload: bytes) -> int:
        """Tính CRC-8 (polynomial 0x07) tương thích với firmware C trên ESP32.
 
        Tính CRC trên [cmd, len_hi, len_lo, ...payload] theo thứ tự đó.
        """
        crc = 0x00
        # Header: [cmd(1B), len_high(1B), len_low(1B)]
        for byte in (cmd, (length >> 8) & 0xFF, length & 0xFF):
            crc ^= byte
            for _ in range(8):
                crc = ((crc << 1) ^ 0x07) & 0xFF if (crc & 0x80) else (crc << 1) & 0xFF
        # Payload
        for byte in payload:
            crc ^= byte
            for _ in range(8):
                crc = ((crc << 1) ^ 0x07) & 0xFF if (crc & 0x80) else (crc << 1) & 0xFF
        return crc
    
    @staticmethod
    def create_frame(cfg: Esp32OtaConfig, cmd: int, payload: bytes = b"") -> bytearray:
        """Đóng gói dữ liệu thành khung: [H1][H2][Cmd][LenH][LenL][Payload][CRC][Tail]."""
        length = len(payload)
        frame = bytearray([
            cfg.header_1,
            cfg.header_2,
            cmd,
            (length >> 8) & 0xFF,
            length & 0xFF,
        ])
        frame.extend(payload)
        frame.append(FrameCodec.calculate_crc8(cmd, length, payload))
        frame.append(cfg.tail)
        return frame
    
    @staticmethod
    def extract_valid_frame(
        cfg: Esp32OtaConfig, buffer: bytearray
    ) -> tuple[int | None, bytes | None, int]:
        """Quét buffer, trả về (cmd, payload, bytes_consumed) của frame hợp lệ đầu tiên.
 
        Trả về (None, None, 0) nếu không tìm thấy frame hợp lệ.
        Tự động trượt qua byte không khớp Header để phục hồi sau lỗi truyền.
        """
        while len(buffer) >= _MIN_FRAME_LEN:
            # Kiểm tra 2 byte Header
            if buffer[0] != cfg.header_1 or buffer[1] != cfg.header_2:
                buffer.pop(0)
                continue
            
            cmd = buffer[2]
            length = (buffer[3] << 8) | buffer[4]
            total_len = 5 + length + 2  # header(5) + payload + crc(1) + tail(1)
 
            if len(buffer) < total_len:
                break  # Chưa nhận đủ bytes, đợi thêm
 
            payload = bytes(buffer[5: 5 + length])
            received_crc = buffer[5 + length]
            tail = buffer[5 + length + 1]
 
            expected_crc = FrameCodec.calculate_crc8(cmd, length, payload)
            if tail == cfg.tail and expected_crc == received_crc:
                return cmd, payload, total_len
 
            # Frame lỗi: bỏ byte đầu, tiếp tục quét
            buffer.pop(0)
 
        return None, None, 0
     
class _AckReader:
    """Đọc và phân tích phản hồi ACK/NACK từ ESP32 trong một thời gian giới hạn."""
 
    def __init__(self, cfg: Esp32OtaConfig, logger: logging.Logger) -> None:
        self._cfg = cfg
        self._logger = logger
        
    def wait_for_ack(self, ser: serial.Serial, timeout: float = 3.0) -> bool:
        """Block cho đến khi nhận ACK (True) hoặc NACK/timeout (False)."""
        deadline = time.time() + timeout
        buffer = bytearray()
 
        while time.time() < deadline:
            try:
                if ser.in_waiting:
                    buffer.extend(ser.read(ser.in_waiting))
                    cmd, _payload, consumed = FrameCodec.extract_valid_frame(self._cfg, buffer)
                    if consumed:
                        if cmd == self._cfg.cmd_ack:
                            return True
                        if cmd == self._cfg.cmd_nack:
                            self._logger.warning("Received NACK from ESP32")
                            return False
                        del buffer[:consumed]  # Tiêu thụ bytes đã phân tích
            except serial.SerialException as exc:
                self._logger.error("Serial read error while waiting for ACK: %s", exc)
                return False
            time.sleep(_ACK_POLL_INTERVAL_S)
 
        self._logger.warning("ACK timeout after %.1fs. buffer=%s", timeout, buffer.hex(" "))
        return False

    def read_response(
        self, ser: serial.Serial, expected_cmd: int, timeout: float = 3.0
    ) -> tuple[bool, bytes | None]:
        """Đọc và trả về payload của frame có ``expected_cmd`` khớp.
 
        Dùng cho các lệnh query (fill levels, version, system info) cần payload.
        """
        deadline = time.time() + timeout
        buffer = bytearray()
        
        while time.time() < deadline:
            try:
                if ser.in_waiting:
                    buffer.extend(ser.read(ser.in_waiting))
                    cmd, payload, consumed = FrameCodec.extract_valid_frame(self._cfg, buffer)
                    if consumed:
                        if cmd == expected_cmd:
                            return True, payload
                        del buffer[:consumed]
            except serial.SerialException as exc:
                self._logger.error("Serial read error while waiting for response: %s", exc)
                return False, None
            time.sleep(_ACK_POLL_INTERVAL_S)
 
        self._logger.warning("Response timeout (cmd=0x%02X) after %.1fs", expected_cmd, timeout)
        return False, None
    
    
class _CommandQueueWorker:
    """Worker thread xử lý tuần tự các CommandTask từ hàng đợi nội bộ.
 
    Đảm bảo chỉ một lệnh Serial được thực thi tại một thời điểm,
    loại bỏ hoàn toàn khả năng race condition trên cổng Serial.
    """
 
    def __init__(self, logger: logging.Logger) -> None:
        self._logger = logger
        self._queue: Queue[CommandTask] = Queue()
        self._stop_event = Event()
        self._thread: Thread | None = None
        
    def start(self) -> None:
        """Khởi động (hoặc khởi động lại) worker thread nếu chưa chạy."""
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = Thread(target=self._run, daemon=True, name="smart-bin-serial-queue")
        self._thread.start()
        self._logger.info("Serial queue worker started")
 
    def stop(self) -> None:
        """Yêu cầu worker dừng và đợi tối đa _WORKER_JOIN_TIMEOUT_S giây."""
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=_WORKER_JOIN_TIMEOUT_S)
            
    def enqueue(self, action: Callable[[], tuple[bool, Any]], cmd_name: str) -> CommandTask:
        """Thêm lệnh vào hàng đợi; đảm bảo worker đang chạy trước khi enqueue."""
        self.start()
        task = CommandTask(cmd_name=cmd_name, action=action)
        self._queue.put(task)
        self._logger.info(
            "Enqueued: %s (queue_size=%d, worker_alive=%s)",
            cmd_name, self._queue.qsize(), self._thread.is_alive() if self._thread else False,
        )
        return task
 
    @staticmethod
    def wait_for_task(task: CommandTask, timeout: float | None = None) -> tuple[bool, Any]:
        """Block cho đến khi task hoàn thành, trả về kết quả."""
        if not task.done_event.wait(timeout):
            return False, f"Timed out waiting for: {task.cmd_name}"
        return task.result or (False, f"Command produced no result: {task.cmd_name}")
    
    def _run(self) -> None:
        """Vòng lặp chính của worker: lấy task từ queue và thực thi."""
        current_task: CommandTask | None = None
        try:
            while not self._stop_event.is_set():
                try:
                    current_task = self._queue.get(timeout=0.2)
                except Empty:
                    continue
 
                self._execute(current_task)
                current_task = None
 
        except Exception:
            self._logger.exception("Serial queue worker crashed")
        finally:
            # Đảm bảo task đang dang dở không bị treo vô hạn
            if current_task is not None and not current_task.done_event.is_set():
                current_task.result = (False, "Worker crashed unexpectedly")
                current_task.done_event.set()
                self._queue.task_done()
            self._logger.info("Serial queue worker exited")
            
    def _execute(self, task: CommandTask) -> None:
        """Thực thi một task và set done_event sau khi hoàn thành."""
        self._logger.info("Executing serial task: %s", task.cmd_name)
        try:
            task.result = task.action() if task.action else (False, "Missing command action")
            self._logger.info("Completed: %s ok=%s", task.cmd_name, task.result[0])
        except Exception as exc:
            self._logger.exception("Error executing task: %s", task.cmd_name)
            task.result = (False, str(exc))
        finally:
            task.done_event.set()
            self._queue.task_done()
            
class ActuatorRepository:
    """Giao diện công khai để điều khiển ESP32 qua Serial.
 
    Phân quyền rõ ràng:
    - ``_conn_manager``  : quản lý kết nối phần cứng
    - ``_frame_codec``   : encode/decode khung truyền (stateless)
    - ``_ack_reader``    : đọc phản hồi từ thiết bị
    - ``_queue_worker``  : serialise các lệnh qua hàng đợi
 
    Các lệnh điều khiển nắp / stepper là fire-and-forget (không block caller).
    Các lệnh query (version, fill levels, system info) block để trả về dữ liệu.
    """

    def __init__(
        self,
        com_port: str | None = None,
        baud_rate: int | None = None,
        firmware_file: str | Path | None = None,
    ) -> None:
        self.logger = logging.getLogger("smart_bin.actuator_repository")
        self.config: Esp32OtaConfig = APP_CONFIG.esp32_ota
 
        self.com_port = com_port or self.config.com_port
        self.baud_rate = baud_rate or self.config.baud_rate
        self.firmware_file = Path(firmware_file) if firmware_file else Path(self.config.firmware_file)
 
        # Khởi tạo các thành phần phụ trách
        self._conn_manager = _SerialConnectionManager(
            self.com_port, self.baud_rate, self.config, self.logger
        )
        self._ack_reader = _AckReader(self.config, self.logger)
        self._queue_worker = _CommandQueueWorker(self.logger)
        self._queue_worker.start()


    def open_lid(self) -> tuple[bool, str]:
        """Mở nắp thùng rác (không chờ kết quả)."""
        return self._enqueue_ack_command(self.config.cmd_open_lid, "open_lid")
 
    def close_lid(self) -> tuple[bool, str]:
        """Đóng nắp thùng rác (không chờ kết quả)."""
        return self._enqueue_ack_command(self.config.cmd_close_lid, "close_lid")
 
    def block_lid(self) -> tuple[bool, str]:
        """Khoá nắp, vô hiệu hoá thao tác thủ công (không chờ kết quả)."""
        return self._enqueue_ack_command(self.config.cmd_block_lid, "block_lid")
 
    def unblock_lid(self) -> tuple[bool, str]:
        """Mở khoá, cho phép thao tác nắp bình thường (không chờ kết quả)."""
        return self._enqueue_ack_command(self.config.cmd_unblock_lid, "unblock_lid")

    # ------------------------------------------------------------------
    # Public API — Motor / config (fire-and-forget)
    # ------------------------------------------------------------------

    def control_step_motor(self, degree: int) -> tuple[bool, str]:
        """Xoay stepper motor theo góc chỉ định (không chờ kết quả).
 
        Payload: 2 bytes big-endian signed short (>h).
        """
        frame = FrameCodec.create_frame(
            self.config, self.config.cmd_ctrl_stepper, struct.pack(">h", int(degree))
        )
        return self._enqueue_fire_and_forget(frame, f"stepper({degree}°)")

    def update_device_config(self, full_threshold: float, device_height: float) -> tuple[bool, str]:
        """Gửi ngưỡng đầy và chiều cao thùng xuống ESP32 (không chờ kết quả).
 
        Payload: float little-endian (height) + unsigned byte (threshold as int).
        """
        frame = FrameCodec.create_frame(
            self.config,
            self.config.cmd_ctrl_device_config,
            struct.pack("<fB", float(device_height), int(full_threshold)),
        )
        return self._enqueue_fire_and_forget(
            frame, f"device_config(height={device_height}, threshold={int(full_threshold)})"
        )
        
        
    # ------------------------------------------------------------------
    # Public API — Query (blocking)
    # ------------------------------------------------------------------
    
    def get_bin_version(self, timeout: float = 3.0) -> tuple[bool, str | None]:
        """Truy vấn chuỗi version firmware của ESP32 (block, đợi phản hồi)."""
        task = self._queue_worker.enqueue(
            lambda: self._query_task(self.config.cmd_get_version, timeout, self._parse_version),
            "get_bin_version",
        )
        return _CommandQueueWorker.wait_for_task(task, timeout=timeout + 1.0)
    
    def request_fill_levels(self, timeout: float = 3.0) -> tuple[bool, list[int] | None]:
        """Đọc độ đầy của 4 thùng rác từ cảm biến siêu âm (block, đợi phản hồi)."""
        task = self._queue_worker.enqueue(
            lambda: self._query_task(self.config.cmd_report_fill_level, timeout, self._parse_fill_levels),
            "request_fill_levels",
        )
        return _CommandQueueWorker.wait_for_task(task, timeout=timeout + 1.0)
    
    def get_system_info(self, timeout: float = 3.0) -> tuple[bool, SystemInfoDto | None]:
        """Lấy thông tin chip, flash, RAM từ ESP32 (block, đợi phản hồi)."""
        task = self._queue_worker.enqueue(
            lambda: self._query_task(self.config.cmd_get_system_info, timeout, self._parse_system_info),
            "get_system_info",
        )
        return _CommandQueueWorker.wait_for_task(task, timeout=timeout + 1.0)
    
    def upload_ota(self, firmware_file: str | Path | None = None) -> tuple[bool, str]:
        """Flash firmware mới lên ESP32 (block, có thể mất vài phút).
 
        Timeout được cấu hình qua ``upload_task_timeout_seconds`` trong config.
        """
        firmware_path = Path(firmware_file) if firmware_file else self.firmware_file
        task = self._queue_worker.enqueue(
            lambda: self._upload_ota_task(firmware_path),
            f"upload_ota({firmware_path.name})",
        )
        return _CommandQueueWorker.wait_for_task(
            task, timeout=float(self.config.upload_task_timeout_seconds)
        )
        
    def close_serial(self) -> None:
        """Dừng worker thread và đóng kết nối Serial an toàn."""
        try:
            self._queue_worker.stop()
        except Exception as exc:
            self.logger.warning("Error stopping queue worker: %s", exc)
        finally:
            self._conn_manager.close()
    
    
    # ------------------------------------------------------------------
    # Lệnh chung — gửi frame và chờ ACK (dùng bởi fire-and-forget)
    # ------------------------------------------------------------------
 
    def _send_frame_and_wait_ack(self, frame: bytearray, timeout: float = 3.0) -> tuple[bool, str]:
        """Gửi một frame và block cho đến khi nhận ACK hoặc timeout."""
        try:
            with self._conn_manager.session() as ser:
                ser.write(frame)
                if not self._ack_reader.wait_for_ack(ser, timeout=timeout):
                    return False, "ESP32 did not ACK command"
            return True, "OK"
        except serial.SerialException as exc:
            self.logger.error("Serial I/O error: %s", exc)
            return False, f"Serial error: {exc}"
        except Exception as exc:
            self.logger.exception("Unexpected error sending frame")
            return False, str(exc)
        
    # ------------------------------------------------------------------
    # Task implementations — chạy trong worker thread
    # ------------------------------------------------------------------
    
    def _query_task(
        self,
        cmd: int,
        timeout: float,
        parser: Callable[[bytes | None], Any],
    ) -> tuple[bool, Any]:
        """Template method: gửi lệnh query, đợi response, parse payload.
 
        Dùng chung cho get_bin_version / request_fill_levels / get_system_info
        để loại bỏ code trùng lặp (DRY).
        """
        try:
            with self._conn_manager.session() as ser:
                ser.write(FrameCodec.create_frame(self.config, cmd))
                ok, payload = self._ack_reader.read_response(ser, expected_cmd=cmd, timeout=timeout)
                if not ok:
                    return False, None
                result = parser(payload)
                return (True, result) if result is not None else (False, None)
        except serial.SerialException as exc:
            self.logger.error("Serial error in query (cmd=0x%02X): %s", cmd, exc)
            return False, None
        except Exception:
            self.logger.exception("Unexpected error in query (cmd=0x%02X)", cmd)
            return False, None
            
    def _upload_ota_task(self, firmware_path: Path) -> tuple[bool, str]:
        """Flash toàn bộ firmware lên ESP32 theo 3 bước: Start → Data chunks → End.
 
        Ghi log tiến độ mỗi 10% để dễ theo dõi từ UI hoặc log file.
        """
        if not firmware_path.exists():
            return False, f"Firmware file not found: {firmware_path}"
        
        try:
            file_size = firmware_path.stat().st_size
            self.logger.info("Starting OTA: file=%s size=%d bytes", firmware_path.name, file_size)
 
            with self._conn_manager.session() as ser:
                # Bước 1: Gửi kích thước file để ESP32 chuẩn bị bộ nhớ
                ser.write(FrameCodec.create_frame(
                    self.config, self.config.cmd_ota_start, struct.pack(">I", file_size)
                ))
                if not self._ack_reader.wait_for_ack(ser, timeout=10):
                    return False, "ESP32 did not ACK OTA start"
 
                # Bước 2: Gửi từng chunk, chờ ACK mỗi chunk
                bytes_sent = self._send_ota_chunks(ser, firmware_path, file_size)
 
                # Bước 3: Báo kết thúc — ESP32 sẽ tự reboot
                ser.write(FrameCodec.create_frame(self.config, self.config.cmd_ota_end))
                if not self._ack_reader.wait_for_ack(ser, timeout=3):
                    return False, "ESP32 did not ACK OTA end"
 
            self.logger.info("OTA completed: %d bytes sent", bytes_sent)
            return True, "OTA upload completed successfully"
        
        except serial.SerialException as exc:
            self.logger.error("Serial error during OTA: %s", exc)
            return False, f"Serial error: {exc}"
        except Exception as exc:
            self.logger.exception("OTA upload failed")
            return False, str(exc)
        
    def _send_ota_chunks(self, ser: serial.Serial, firmware_path: Path, file_size: int) -> int:
        """Đọc firmware theo từng chunk và gửi tuần tự, trả về tổng bytes đã gửi.
 
        Tách riêng ra để _upload_ota_task không bị dài quá mức (SRP).
        """
        bytes_sent = 0
        last_logged_pct = 0
 
        with open(firmware_path, "rb") as fh:
            while chunk := fh.read(self.config.chunk_size):
                ser.write(FrameCodec.create_frame(self.config, self.config.cmd_ota_data, chunk))
                if not self._ack_reader.wait_for_ack(ser, timeout=2):
                    raise RuntimeError(f"ESP32 did not ACK OTA data at byte {bytes_sent}")
 
                bytes_sent += len(chunk)
                last_logged_pct = self._log_ota_progress(bytes_sent, file_size, last_logged_pct)
 
        return bytes_sent
    
    def _log_ota_progress(self, bytes_sent: int, file_size: int, last_logged_pct: int) -> int:
        """Ghi log tiến độ OTA mỗi 10%, trả về mốc % đã log gần nhất."""
        pct = int(bytes_sent / file_size * 100)
        if pct >= last_logged_pct + 10 or pct == 100:
            bar = "█" * (pct // 10) + "░" * (10 - pct // 10)
            self.logger.info("OTA [%s] %3d%% (%d/%d bytes)", bar, pct, bytes_sent, file_size)
            return (pct // 10) * 10
        return last_logged_pct
    
    # ------------------------------------------------------------------
    # Parser helpers — chuyển đổi payload bytes → kiểu dữ liệu cụ thể
    # ------------------------------------------------------------------
 
    @staticmethod
    def _parse_version(payload: bytes | None) -> str | None:
        """Decode payload thành chuỗi version, bỏ null bytes cuối."""
        if not payload:
            return None
        return payload.decode("utf-8", errors="ignore").rstrip("\x00") or None
 
    @staticmethod
    def _parse_fill_levels(payload: bytes | None) -> list[int] | None:
        """Chuyển payload bytes thành danh sách % mức đầy của từng thùng."""
        return list(payload) if payload else None
 
    def _parse_system_info(self, payload: bytes | None) -> SystemInfoDto | None:
        """Deserialize payload thành SystemInfoDto, bắt lỗi format."""
        if not payload:
            return None
        try:
            return SystemInfoDto.from_payload(payload)
        except Exception:
            self.logger.exception("Invalid system info payload")
            return None
        
    # ------------------------------------------------------------------
    # Enqueue helpers — giảm boilerplate cho Public API
    # ------------------------------------------------------------------
 
    def _enqueue_ack_command(self, cmd: int, name: str, timeout: float = 2.0) -> tuple[bool, str]:
        """Enqueue một lệnh không có payload, chờ ACK, không block caller.
 
        Dùng chung cho open_lid / close_lid / block_lid / unblock_lid (DRY).
        """
        try:
            frame = FrameCodec.create_frame(self.config, cmd)
            self._queue_worker.enqueue(
                lambda: self._send_frame_and_wait_ack(frame, timeout=timeout),
                name,
            )
            return True, f"{name} command queued"
        except Exception as exc:
            self.logger.exception("Failed to queue command: %s", name)
            return False, str(exc)
        
    def _enqueue_fire_and_forget(self, frame: bytearray, name: str, timeout: float = 2.0) -> tuple[bool, str]:
        """Enqueue một frame đã tạo sẵn, không block caller."""
        try:
            self._queue_worker.enqueue(
                lambda: self._send_frame_and_wait_ack(frame, timeout=timeout),
                name,
            )
            return True, f"{name} command queued"
        except Exception as exc:
            self.logger.exception("Failed to queue fire-and-forget command: %s", name)
            return False, str(exc)

ActuatorClient = ActuatorRepository