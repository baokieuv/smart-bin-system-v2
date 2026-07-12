import serial
import time
import os
import struct
import logging

# ================= CẤU HÌNH LOGGING =================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

# ================= CẤU HÌNH HỆ THỐNG =================
COM_PORT = 'COM10'      # Đổi thành cổng COM thực tế
BAUD_RATE = 115200
FIRMWARE_FILE = r'D:\HUST\soict\final-project\smart-bin-v2\smart-bin-system-v2\device\esp32\actutor_esp32.bin'
CHUNK_SIZE = 512       

# Lưu ý: Bỏ SECRET_KEY vì hệ thống đã chuyển sang dùng CRC-8

# ================= LỆNH (COMMAND) =================
CMD_CTRL_SERVO   = 0x10
CMD_CTRL_STEPPER = 0x11
CMD_OTA_START    = 0x20
CMD_OTA_DATA     = 0x21
CMD_OTA_END      = 0x22
CMD_ACK          = 0x30
CMD_NACK         = 0x31
CMD_REPORT_FILL_LEVEL = 0x40 
CMD_SET_CONFIG   = 0x50      
CMD_GET_VERSION  = 0x60
CMD_GET_SYSTEM_INFO = 0x70

# Các lệnh nắp thùng rác bổ sung từ file C
CMD_LID_OPEN     = 0x80
CMD_LID_CLOSE    = 0x81
CMD_LID_BLOCK    = 0x82
CMD_LID_UNBLOCK  = 0x83

HEADER_1 = 0xAA
HEADER_2 = 0x55
TAIL     = 0xEF

# ================= HÀM TIỆN ÍCH & BẢO MẬT (CRC-8) =================

def calculate_crc8(cmd: int, length: int, payload: bytes) -> int:
    """
    Tính toán mã CRC-8 (Polynomial: 0x07, Init: 0x00) cho frame dữ liệu.
    Cấu trúc tính: [CMD] [LEN_H] [LEN_L] [PAYLOAD...]
    Khớp chính xác với hàm calculate_crc8 trong C.
    """
    crc = 0x00
    len_h, len_l = (length >> 8) & 0xFF, length & 0xFF
    
    # Đưa CMD và LEN vào mảng
    data_to_crc = bytearray([cmd, len_h, len_l])
    if payload:
        data_to_crc.extend(payload)
        
    for b in data_to_crc:
        crc ^= b
        for _ in range(8):
            if crc & 0x80:
                crc = ((crc << 1) ^ 0x07) & 0xFF # Giữ ở 8-bit
            else:
                crc = (crc << 1) & 0xFF
                
    return crc

def create_frame(cmd: int, payload: bytes = b'') -> bytearray:
    """
    Đóng gói dữ liệu thành frame hoàn chỉnh.
    Frame: [H1][H2][CMD][LEN_H][LEN_L][PAYLOAD][CRC8][TAIL]
    """
    length = len(payload)
    len_h, len_l = (length >> 8) & 0xFF, length & 0xFF
    crc8_val = calculate_crc8(cmd, length, payload)
    
    frame = bytearray([HEADER_1, HEADER_2, cmd, len_h, len_l])
    frame.extend(payload)
    frame.append(crc8_val) # CRC là 1 byte
    frame.append(TAIL)
    return frame

def extract_valid_frame(buffer: bytearray):
    """
    Quét buffer để tìm và xác thực một frame hợp lệ.
    Trả về: (cmd, payload, số_byte_đã_xử_lý) hoặc (None, None, 0) nếu chưa đủ data/lỗi.
    """
    while len(buffer) >= 7: # Khung nhỏ nhất là 7 bytes: H1, H2, CMD, LH, LL, CRC, TAIL
        if buffer[0] == HEADER_1 and buffer[1] == HEADER_2:
            cmd = buffer[2]
            length = (buffer[3] << 8) | buffer[4]
            total_len = 5 + length + 1 + 1 # 5 byte đầu + payload + 1 byte CRC + 1 byte Tail
            
            if len(buffer) >= total_len:
                payload = buffer[5:5+length]
                received_crc = buffer[5+length]
                tail = buffer[5+length+1]
                
                # Xác thực đuôi và CRC-8
                if tail == TAIL and calculate_crc8(cmd, length, payload) == received_crc:
                    return cmd, payload, total_len
                else:
                    buffer.pop(0) # Lỗi CRC hoặc đuôi, trượt 1 byte
            else:
                break # Chưa nhận đủ nguyên frame, chờ thêm
        else:
            buffer.pop(0) # Không phải Header, trượt 1 byte
            
    return None, None, 0

def wait_for_ack(ser: serial.Serial, timeout: int = 3) -> bool:
    """Chờ phản hồi ACK hoặc NACK từ ESP32 một cách an toàn."""
    start_time = time.time()
    buffer = bytearray()

    while time.time() - start_time < timeout:
        if ser.in_waiting > 0:
            buffer.extend(ser.read(ser.in_waiting))
            
            # Quét tìm frame hợp lệ
            cmd, payload, consumed = extract_valid_frame(buffer)
            
            if consumed > 0:
                if cmd == CMD_ACK:
                    return True
                elif cmd == CMD_NACK:
                    logger.error("Nhận NACK từ ESP32 (Lỗi CRC hoặc thiết bị từ chối)!")
                    return False
                
                # Nếu nhận được frame khác (VD: Report rác), cắt đi và chờ tiếp
                buffer = buffer[consumed:]
                
        time.sleep(0.01)
        
    logger.error("Timeout! Không nhận được phản hồi ACK/NACK.")
    return False

def get_version_from_bin(file_path: str) -> str:
    """Đọc trực tiếp cấu trúc esp_app_desc_t từ file .bin để trích xuất version."""
    try:
        with open(file_path, 'rb') as f:
            f.seek(0x20)
            if f.read(4) != b'\x32\x54\xcd\xab': # Magic Word
                logger.error("File .bin không đúng định dạng chuẩn của ESP-IDF!")
                return None
            
            f.seek(0x30)
            return f.read(32).decode('utf-8', errors='ignore').rstrip('\x00')
    except FileNotFoundError:
        logger.error(f"Không tìm thấy file firmware tại: {file_path}")
    except Exception as e:
        logger.error(f"Lỗi khi đọc file .bin: {e}")
    return None

def get_esp32_version(ser: serial.Serial) -> str:
    """Gửi lệnh và chờ nhận phiên bản Firmware đang chạy trên ESP32."""
    logger.info("Đang truy vấn Firmware Version trên mạch...")
    ser.write(create_frame(CMD_GET_VERSION))
    
    start_time = time.time()
    buffer = bytearray()
    
    while time.time() - start_time < 3:
        if ser.in_waiting > 0:
            buffer.extend(ser.read(ser.in_waiting))
            cmd, payload, consumed = extract_valid_frame(buffer)
            if consumed > 0:
                if cmd == CMD_GET_VERSION:
                    return payload.decode('utf-8')
                buffer = buffer[consumed:]
        time.sleep(0.01)
    return None

# ================= CÁC CHỨC NĂNG CHÍNH =================

def send_servo_cmd(ser: serial.Serial, angle: int):
    if not (0 <= angle <= 180):
        logger.warning("Góc quay Servo phải nằm trong khoảng từ 0 đến 180 độ!")
        return
    logger.info(f"[SERVO] Gửi lệnh xoay Servo sang góc {angle} độ...")
    payload = struct.pack('B', angle) 
    ser.write(create_frame(CMD_CTRL_SERVO, payload))
    if wait_for_ack(ser, timeout=2): logger.info("[SERVO] ESP32 thực hiện xoay Servo thành công.")
    else: logger.error("[SERVO] Lệnh Servo thất bại.")

def send_stepper_cmd(ser: serial.Serial, degree: int):
    logger.info(f"[STEPPER] Gửi lệnh xoay {degree} độ...")
    payload = struct.pack('>h', degree)
    ser.write(create_frame(CMD_CTRL_STEPPER, payload))
    if wait_for_ack(ser, timeout=2): logger.info(f"[STEPPER] ESP32 đã nhận lệnh xoay {degree} độ thành công.")
    else: logger.error("[STEPPER] Lệnh thất bại.")

def send_set_config_cmd(ser: serial.Serial, depth: float, threshold: int):
    logger.info(f"[CONFIG] Đang cấu hình: Sâu {depth}cm, Ngưỡng đầy {threshold}%...")
    payload = struct.pack('<fB', depth, threshold)
    ser.write(create_frame(CMD_SET_CONFIG, payload))
    if wait_for_ack(ser, timeout=2): logger.info("[CONFIG] Thành công! ESP32 đã lưu cấu hình mới xuống Flash NVS.")
    else: logger.error("[CONFIG] Cập nhật cấu hình thất bại.")

def get_system_info(ser: serial.Serial):
    logger.info("[SYS_INFO] Đang gửi yêu cầu kiểm tra cấu hình phần cứng hệ thống...")
    ser.write(create_frame(CMD_GET_SYSTEM_INFO))
    start_time = time.time()
    buffer = bytearray()
    while time.time() - start_time < 3:
        if ser.in_waiting > 0:
            buffer.extend(ser.read(ser.in_waiting))
            cmd, payload, consumed = extract_valid_frame(buffer)
            if consumed > 0:
                if cmd == CMD_GET_SYSTEM_INFO:
                    if len(payload) == 10:
                        model, cores, flash_size, total_ram = struct.unpack('>BBII', payload)
                        print("\n" + "="*20 + " THÔNG TIN PHẦN CỨNG ESP32 " + "="*20)
                        print(f" - Chip Model ID  : {model}")
                        print(f" - CPU Cores      : {cores} Core(s)")
                        print(f" - Kích thước Flash: {flash_size / (1024 * 1024):.1f} MB ({flash_size} Bytes)")
                        print(f" - Dung lượng RAM : {total_ram / 1024:.2f} KB ({total_ram} Bytes)")
                        print("="*67)
                    else:
                        logger.error(f"[SYS_INFO] Sai độ dài payload hệ thống nhận được: {len(payload)} bytes")
                    return
                buffer = buffer[consumed:]
        time.sleep(0.01)
    logger.error("[SYS_INFO] Không nhận được phản hồi System Info từ mạch.")

def request_fill_level(ser: serial.Serial):
    logger.info("[SENSOR] Đang gửi lệnh yêu cầu đọc cảm biến siêu âm...")
    ser.write(create_frame(CMD_REPORT_FILL_LEVEL))
    start_time = time.time()
    buffer = bytearray()
    while time.time() - start_time < 3:
        if ser.in_waiting > 0:
            buffer.extend(ser.read(ser.in_waiting))
        cmd, payload, consumed = extract_valid_frame(buffer)
        if consumed > 0:
            if cmd == CMD_REPORT_FILL_LEVEL and len(payload) == 4:
                print("\n" + "="*35)
                print("    BÁO CÁO MỨC RÁC HIỆN TẠI")
                print("="*35)
                for i in range(4): print(f" Ngăn {i+1} : {payload[i]:3d} %")
                print("="*35 + "\n")
                return
            buffer = buffer[consumed:]
        else:
            time.sleep(0.01)
    logger.error("[SENSOR] Timeout! Không nhận được dữ liệu phản hồi từ ESP32.")

def run_ota(ser: serial.Serial):
    if not os.path.exists(FIRMWARE_FILE):
        logger.error(f"Không tìm thấy file firmware: {FIRMWARE_FILE}")
        return
    file_size = os.path.getsize(FIRMWARE_FILE)
    target_version = get_version_from_bin(FIRMWARE_FILE)
    if not target_version: return

    logger.info(f"[OTA] Khởi chạy OTA. Kích thước file: {file_size} bytes")
    current_version = get_esp32_version(ser)
    
    if current_version is None:
        logger.error("[OTA] Không lấy được Version từ ESP32. Hủy OTA.")
        return
    logger.info(f"[OTA] Firmware hiện tại: {current_version} | Firmware chuẩn bị nạp: {target_version}")
    if current_version == target_version:
        logger.info("[OTA] Firmware giống nhau. Bỏ qua OTA để bảo vệ tuổi thọ Flash.")
        return

    logger.info("[OTA] Phát hiện version khác biệt. Bắt đầu quá trình nạp...")
    logger.info("[OTA] Bước 1: Yêu cầu xóa Flash (Có thể mất vài giây)...")
    ser.write(create_frame(CMD_OTA_START, struct.pack('>I', file_size)))
    if not wait_for_ack(ser, timeout=10):
        logger.error("[OTA] Xóa Flash thất bại. Dừng!")
        return
        
    logger.info("[OTA] ESP32 đã sẵn sàng. Bước 2: Đang truyền dữ liệu...")
    bytes_sent = 0
    with open(FIRMWARE_FILE, 'rb') as f:
        while chunk := f.read(CHUNK_SIZE):
            ser.write(create_frame(CMD_OTA_DATA, chunk))
            if not wait_for_ack(ser, timeout=2):
                logger.error(f"\n[OTA] Truyền dữ liệu lỗi tại byte {bytes_sent}. Dừng!")
                return
            bytes_sent += len(chunk)
            progress = (bytes_sent / file_size) * 100
            print(f"\rTiến độ: [{int(progress):3d}%] {bytes_sent}/{file_size} bytes", end="")
            
    print() 
    logger.info("[OTA] Truyền dữ liệu hoàn tất. Bước 3: Đóng OTA và Reset mạch...")
    ser.write(create_frame(CMD_OTA_END))
    if wait_for_ack(ser, timeout=3): logger.info("[OTA] THÀNH CÔNG! ESP32 đang khởi động lại.")
    else: logger.error("[OTA] Lệnh kết thúc OTA thất bại.")

# ================= VÒNG LẶP ĐIỀU KHIỂN CHÍNH =================

def main():
    try:
        logger.info(f"Đang mở cổng {COM_PORT} với Baudrate {BAUD_RATE}...")
        ser = serial.Serial(COM_PORT, BAUD_RATE, timeout=1)
        ser.setDTR(False)
        ser.setRTS(False)
        time.sleep(1.5) 
        ser.reset_input_buffer()
        logger.info("Kết nối Serial thành công!")
        
        while True:
            print("\n" + "="*45)
            print("   MENU TEST SMART BIN V2 (CRC-8 & NVS)")
            print("="*45)
            print("1. Xoay Stepper +45 độ")
            print("2. Xoay Stepper -45 độ")
            print("3. Xoay Stepper 135 độ")
            print("4. Xoay Stepper -135 độ")
            print("5. Điều khiển động cơ Servo (Nhập góc)")
            print("6. Thực hiện Upload OTA (Firmware)")
            print("7. Yêu cầu đọc dữ liệu mức rác (1 lần)")
            print("8. Thiết lập Cấu hình (Độ sâu & Ngưỡng báo đầy)")
            print("9. Xem thông tin phần cứng hệ thống (System Info)")
            print("0. Thoát")
            print("="*45)
            
            choice = input("Nhập lựa chọn của bạn: ").strip()
            
            if choice == '1': send_stepper_cmd(ser, 45)
            elif choice == '2': send_stepper_cmd(ser, -45)
            elif choice == '3': send_stepper_cmd(ser, 135)
            elif choice == '4': send_stepper_cmd(ser, -135)
            elif choice == '5':
                try: send_servo_cmd(ser, int(input("Nhập góc muốn quay Servo (0 - 180): ")))
                except ValueError: logger.warning("Vui lòng nhập một số nguyên hợp lệ!")
            elif choice == '6': run_ota(ser)
            elif choice == '7': request_fill_level(ser)
            elif choice == '8':
                try:
                    depth = float(input("Nhập độ sâu thùng rác (cm) [VD: 60.5]: "))
                    threshold = int(input("Nhập ngưỡng báo rác đầy (%) [VD: 90]: "))
                    if 0 <= threshold <= 100: send_set_config_cmd(ser, depth, threshold)
                    else: logger.warning("Ngưỡng phần trăm phải nằm trong khoảng 0 - 100!")
                except ValueError: logger.warning("Dữ liệu nhập vào không hợp lệ! Vui lòng nhập số.")
            elif choice == '9': get_system_info(ser)
            elif choice == '0':
                logger.info("Đang đóng cổng Serial và thoát...")
                break
            else: logger.warning("Lựa chọn không hợp lệ!")
                
    except serial.SerialException as e: logger.error(f"Lỗi cổng Serial: {e}. Vui lòng kiểm tra cáp UART và cấu hình COM.")
    except Exception as e: logger.error(f"Lỗi hệ thống không xác định: {e}")
    finally:
        if 'ser' in locals() and ser.is_open: ser.close()

if __name__ == '__main__':
    main()