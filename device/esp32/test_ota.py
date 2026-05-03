import serial
import time
import os
import struct
import hmac
import hashlib

# ================= CẤU HÌNH =================
COM_PORT = 'COM4'      # Đổi thành cổng COM thực tế
BAUD_RATE = 115200
FIRMWARE_FILE = r'D:\HUST\soict\final-project\smart-bin-v2\smart-bin-system-v2\device\esp32\actutor_esp32.bin'
CHUNK_SIZE = 512       

SECRET_KEY = b"HUST_SMART_BIN_KEY_2026" # Khớp với config.h trên ESP32

# ================= LỆNH (COMMAND) =================
CMD_CTRL_SERVO   = 0x10
CMD_CTRL_STEPPER = 0x11
CMD_OTA_START    = 0x20
CMD_OTA_DATA     = 0x21
CMD_OTA_END      = 0x22
CMD_ACK          = 0x30
CMD_NACK         = 0x31
CMD_REPORT_FILL_LEVEL = 0x40 # Lệnh báo cáo cảm biến siêu âm
CMD_SET_CONFIG   = 0x50      # Lệnh cấu hình hệ thống (Mới)

HEADER_1 = 0xAA
HEADER_2 = 0x55
TAIL     = 0xEF

# ================= HÀM TIỆN ÍCH =================

# Tính HMAC-SHA256 y hệt như hàm verify_hmac trong ESP32
def calculate_hmac(cmd, length, payload):
    len_h = (length >> 8) & 0xFF
    len_l = length & 0xFF
    
    # Payload để hash gồm: [CMD] [LEN_H] [LEN_L] [PAYLOAD...]
    msg = bytearray([cmd, len_h, len_l])
    if payload:
        msg.extend(payload)
        
    # Tạo HMAC-SHA256 với Secret Key
    h = hmac.new(SECRET_KEY, msg, hashlib.sha256)
    return h.digest() # Trả về 32 bytes

def create_frame(cmd, payload=b''):
    length = len(payload)
    len_h = (length >> 8) & 0xFF
    len_l = length & 0xFF
    
    mac_32bytes = calculate_hmac(cmd, length, payload)
    
    frame = bytearray([HEADER_1, HEADER_2, cmd, len_h, len_l])
    frame.extend(payload)
    frame.extend(mac_32bytes) # Nối 32 byte chữ ký vào
    frame.append(TAIL)
    return frame

def wait_for_ack(ser, timeout=3):
    start_time = time.time()
    buffer = bytearray()
    
    # Tự động sinh frame ACK/NACK chuẩn bảo mật HMAC để tìm kiếm
    ack_frame = create_frame(CMD_ACK, b'')
    nack_frame = create_frame(CMD_NACK, b'')

    while time.time() - start_time < timeout:
        if ser.in_waiting > 0:
            buffer.extend(ser.read(ser.in_waiting))
            
            if ack_frame in buffer:
                return True
            if nack_frame in buffer:
                print("\n[LỖI] Nhận NACK từ ESP32 (Có thể sai HMAC hoặc Data)!")
                return False
                
        time.sleep(0.01)
        
    print(f"\n[LỖI] Timeout! Không nhận được phản hồi.")
    return False

# ================= CÁC CHỨC NĂNG DEMO =================

def send_stepper_cmd(ser, degree):
    print(f"\n[STEPPER] Đang gửi lệnh xoay {degree} độ...")
    payload = struct.pack('>h', degree)
    frame = create_frame(CMD_CTRL_STEPPER, payload)
    
    ser.write(frame)
    if wait_for_ack(ser, timeout=2):
        print(f"[THÀNH CÔNG] ESP32 đã nhận lệnh xoay {degree} độ.")
    else:
        print("[LỖI] Gửi lệnh Step Motor thất bại.")

def run_ota(ser):
    if not os.path.exists(FIRMWARE_FILE):
        print(f"\n[LỖI] Không tìm thấy file {FIRMWARE_FILE}")
        return

    file_size = os.path.getsize(FIRMWARE_FILE)
    print(f"\n[OTA] Bắt đầu OTA. File size: {file_size} bytes")

    print("1. Gửi lệnh Bắt đầu OTA (CMD_OTA_START)... (Chờ ESP32 xóa Flash)")
    payload_start = struct.pack('>I', file_size) 
    ser.write(create_frame(CMD_OTA_START, payload_start))
    
    if not wait_for_ack(ser, timeout=10):
        print("[LỖI] Khởi tạo OTA thất bại. Dừng!")
        return
    print("[THÀNH CÔNG] ESP32 đã xóa Flash và sẵn sàng.")

    print("2. Đang truyền dữ liệu...")
    bytes_sent = 0
    with open(FIRMWARE_FILE, 'rb') as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            
            ser.write(create_frame(CMD_OTA_DATA, chunk))
            if not wait_for_ack(ser, timeout=2):
                print(f"\n[LỖI] Truyền dữ liệu thất bại tại byte {bytes_sent}. Dừng!")
                return
            
            bytes_sent += len(chunk)
            progress = (bytes_sent / file_size) * 100
            print(f"\rTiến độ: [{int(progress):3d}%] {bytes_sent}/{file_size} bytes", end="")
            
    print("\n[THÀNH CÔNG] Truyền dữ liệu hoàn tất.")

    print("3. Gửi lệnh Kết thúc OTA và khởi động lại...")
    ser.write(create_frame(CMD_OTA_END))
    if wait_for_ack(ser, timeout=3):
         print("[THÀNH CÔNG] OTA HOÀN TẤT! ESP32 đang khởi động lại với code mới.")
    else:
         print("[LỖI] Kết thúc OTA thất bại.")

def send_set_config_cmd(ser, depth, threshold):
    print(f"\n[CONFIG] Đang gửi cấu hình mới: Sâu {depth}cm, Ngưỡng đầy {threshold}%...")
    # Đóng gói dữ liệu: '<' = Little Endian, 'f' = Float (4 bytes), 'B' = Unsigned Char (1 byte)
    payload = struct.pack('<fB', depth, threshold)
    frame = create_frame(CMD_SET_CONFIG, payload)
    
    ser.write(frame)
    if wait_for_ack(ser, timeout=2):
        print("[THÀNH CÔNG] ESP32 đã lưu cấu hình mới xuống Flash NVS.")
    else:
        print("[LỖI] Cập nhật cấu hình thất bại.")

# Lắng nghe báo cáo từ cảm biến siêu âm
def listen_telemetry(ser):
    print("\n[MONITOR] Đang trực báo cáo từ 4 cảm biến siêu âm... (Nhấn Ctrl+C để thoát)")
    buffer = bytearray()
    try:
        while True:
            if ser.in_waiting > 0:
                buffer.extend(ser.read(ser.in_waiting))
                
            # Quét tìm Frame trong buffer
            while len(buffer) >= 38: # Khung nhỏ nhất là 38 bytes (Payload rỗng)
                if buffer[0] == HEADER_1 and buffer[1] == HEADER_2:
                    cmd = buffer[2]
                    length = (buffer[3] << 8) | buffer[4]
                    total_len = 5 + length + 32 + 1 # Header(5) + Payload + HMAC(32) + Tail(1)
                    
                    if len(buffer) >= total_len:
                        payload = buffer[5:5+length]
                        received_mac = buffer[5+length:5+length+32]
                        tail = buffer[5+length+32]
                        
                        if tail == TAIL:
                            # Xác thực HMAC của gói tin nhận được
                            calc_mac = calculate_hmac(cmd, length, payload)
                            if calc_mac == received_mac:
                                if cmd == CMD_REPORT_FILL_LEVEL and length == 4:
                                    print(f"[LIVE] Mức rác: Ngăn 1: {payload[0]:3d}% | Ngăn 2: {payload[1]:3d}% | Ngăn 3: {payload[2]:3d}% | Ngăn 4: {payload[3]:3d}%")
                            buffer = buffer[total_len:] # Cắt bỏ khung đã xử lý
                        else:
                            buffer.pop(0) # Đuôi không hợp lệ, trượt 1 byte
                    else:
                        break # Chờ nhận thêm data
                else:
                    buffer.pop(0) # Không phải Header, trượt 1 byte
            time.sleep(0.01)
    except KeyboardInterrupt:
        print("\n[MONITOR] Đã thoát chế độ lắng nghe.")

# ================= MENU CHÍNH =================
def main():
    try:
        print(f"Đang mở cổng {COM_PORT}...")
        ser = serial.Serial(COM_PORT, BAUD_RATE, timeout=1)
        ser.setDTR(False)
        ser.setRTS(False)
        time.sleep(1.5) 
        ser.reset_input_buffer()
        print("[THÀNH CÔNG] Kết nối Serial thành công!\n")
        
        while True:
            print("\n" + "="*45)
            print("  MENU TEST SMART BIN V2 (HMAC & NVS)")
            print("="*45)
            print("1. Xoay Stepper +45 độ")
            print("2. Xoay Stepper -45 độ")
            print("3. Thực hiện Upload OTA (Firmware)")
            print("4. Mở Monitor xem mức rác (Siêu âm)")
            print("5. Thiết lập Cấu hình (Độ sâu & Ngưỡng báo đầy)")
            print("0. Thoát")
            print("="*45)
            
            choice = input("Nhập lựa chọn của bạn: ")
            
            if choice == '1':
                send_stepper_cmd(ser, 45)
            elif choice == '2':
                send_stepper_cmd(ser, -45)
            elif choice == '3':
                run_ota(ser)
            elif choice == '4':
                listen_telemetry(ser)
            elif choice == '5':
                try:
                    depth = float(input("Nhập độ sâu thùng rác (cm) [VD: 60.5]: "))
                    threshold = int(input("Nhập ngưỡng báo rác đầy (%) [VD: 90]: "))
                    if 0 <= threshold <= 100:
                        send_set_config_cmd(ser, depth, threshold)
                    else:
                        print("[LỖI] Ngưỡng phần trăm phải nằm trong khoảng 0 - 100!")
                except ValueError:
                    print("[LỖI] Dữ liệu nhập vào không hợp lệ! Vui lòng nhập số.")
            elif choice == '0':
                print("Đang đóng cổng Serial và thoát...")
                break
            else:
                print("[LỖI] Lựa chọn không hợp lệ!")
                
    except serial.SerialException as e:
        print(f"[LỖI] Lỗi cổng Serial: {e}. Vui lòng kiểm tra cáp và cổng COM.")
    except Exception as e:
        print(f"[LỖI] Lỗi hệ thống: {e}")
    finally:
        if 'ser' in locals() and ser.is_open:
            ser.close()

if __name__ == '__main__':
    main()