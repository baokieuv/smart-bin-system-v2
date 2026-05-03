import serial
import time
import os
import struct
import hmac
import hashlib

# ================= CẤU HÌNH =================
COM_PORT = 'COM4'      # Đổi thành '/dev/serial0' nếu chạy trên Raspberry Pi
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
    
    ack_pattern = bytearray([HEADER_1, HEADER_2, CMD_ACK, 0x00, 0x00, CMD_ACK, TAIL])
    nack_pattern = bytearray([HEADER_1, HEADER_2, CMD_NACK, 0x00, 0x00, CMD_NACK, TAIL])

    while time.time() - start_time < timeout:
        if ser.in_waiting > 0:
            buffer.extend(ser.read(ser.in_waiting))
            
            if ack_pattern in buffer:
                return True
            if nack_pattern in buffer:
                print("\n❌ Nhận NACK từ ESP32 (Có thể sai HMAC hoặc Data)!")
                return False
                
        time.sleep(0.01)
        
    print(f"\n⏳ Timeout! Không nhận được phản hồi. Buffer nhận: {buffer.hex(' ')}")
    return False

# ================= CÁC CHỨC NĂNG DEMO =================

def send_stepper_cmd(ser, degree):
    print(f"\n[STEPPER] Đang gửi lệnh xoay {degree} độ...")
    # Đóng gói số nguyên có dấu 2 byte (short), Big-Endian ('>h') 
    # khớp với (payload_buf[0] << 8) | payload_buf[1] của ESP32
    payload = struct.pack('>h', degree)
    frame = create_frame(CMD_CTRL_STEPPER, payload)
    
    ser.write(frame)
    if wait_for_ack(ser, timeout=2):
        print(f"✅ ESP32 đã nhận lệnh xoay {degree} độ thành công.")
    else:
        print("❌ Gửi lệnh Step Motor thất bại.")

def run_ota(ser):
    if not os.path.exists(FIRMWARE_FILE):
        print(f"\n❌ Lỗi: Không tìm thấy file {FIRMWARE_FILE}")
        return

    file_size = os.path.getsize(FIRMWARE_FILE)
    print(f"\n[OTA] Bắt đầu OTA. File size: {file_size} bytes")

    # BƯỚC 1: START
    print("1. Gửi lệnh Bắt đầu OTA (CMD_OTA_START)... (Chờ ESP32 xóa Flash)")
    # Gửi kích thước file dưới dạng Big-Endian unsigned int (4 bytes)
    payload_start = struct.pack('>I', file_size) 
    ser.write(create_frame(CMD_OTA_START, payload_start))
    
    # Timeout cao vì esp_ota_begin cần thời gian xóa phân vùng flash
    if not wait_for_ack(ser, timeout=10):
        print("❌ Lỗi khi khởi tạo OTA. Dừng!")
        return
    print("✅ ESP32 đã xóa Flash và sẵn sàng.")

    # BƯỚC 2: DATA
    print("2. Đang truyền dữ liệu...")
    bytes_sent = 0
    with open(FIRMWARE_FILE, 'rb') as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            
            ser.write(create_frame(CMD_OTA_DATA, chunk))
            if not wait_for_ack(ser, timeout=2):
                print(f"\n❌ Lỗi truyền dữ liệu tại byte {bytes_sent}. Dừng!")
                return
            
            bytes_sent += len(chunk)
            progress = (bytes_sent / file_size) * 100
            print(f"\rTiến độ: [{int(progress):3d}%] {bytes_sent}/{file_size} bytes", end="")
            
    print("\n✅ Truyền dữ liệu hoàn tất.")

    # BƯỚC 3: END
    print("3. Gửi lệnh Kết thúc OTA và khởi động lại...")
    ser.write(create_frame(CMD_OTA_END))
    if wait_for_ack(ser, timeout=3):
         print("🎉 OTA THÀNH CÔNG! ESP32 đang khởi động lại với code mới.")
    else:
         print("❌ Lỗi khi kết thúc OTA.")

# ================= MENU CHÍNH =================
def main():
    try:
        print(f"Đang mở cổng {COM_PORT}...")
        ser = serial.Serial(COM_PORT, BAUD_RATE, timeout=1)
        # Tắt tín hiệu DTR/RTS để tránh ESP32 bị reset liên tục khi mở Serial
        ser.setDTR(False)
        ser.setRTS(False)
        time.sleep(1.5) # Chờ kết nối ổn định
        ser.reset_input_buffer()
        print("✅ Kết nối Serial thành công!\n")
        
        while True:
            print("\n" + "="*30)
            print("  MENU TEST SMART BIN V2")
            print("="*30)
            print("1. Xoay Stepper +45 độ")
            print("2. Xoay Stepper -45 độ")
            print("3. Xoay Stepper +135 độ")
            print("4. Xoay Stepper -135 độ")
            print("5. Thực hiện Upload OTA")
            print("0. Thoát")
            print("="*30)
            
            choice = input("Nhập lựa chọn của bạn: ")
            
            if choice == '1':
                send_stepper_cmd(ser, 45)
            elif choice == '2':
                send_stepper_cmd(ser, -45)
            elif choice == '3':
                send_stepper_cmd(ser, 135)
            elif choice == '4':
                send_stepper_cmd(ser, -135)
            elif choice == '5':
                run_ota(ser)
            elif choice == '0':
                print("Đang đóng cổng Serial và thoát...")
                break
            else:
                print("Lựa chọn không hợp lệ!")
                
    except serial.SerialException as e:
        print(f"❌ Lỗi cổng Serial: {e}. Vui lòng kiểm tra cáp và cổng COM.")
    except Exception as e:
        print(f"❌ Lỗi hệ thống: {e}")
    finally:
        if 'ser' in locals() and ser.is_open:
            ser.close()

if __name__ == '__main__':
    main()