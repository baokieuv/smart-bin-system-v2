import time
import cv2
import numpy as np

# Nếu chạy trên Raspberry Pi, thường dùng: import tflite_runtime.interpreter as tflite
import tensorflow as tf 

model_path = "/home/lib/smart-bin-system-v2/device/smart_bin_desktop/best.tflite"
image_path = "/home/lib/smart-bin-system-v2/device/smart_bin_desktop/rotten-moldy-chicken-meat-bad-conditions-preservation-close-up-spoiled-food-fungus-illness-266104286-2838275071.jpg"

# 1. Khởi tạo TFLite Interpreter
interpreter = tf.lite.Interpreter(model_path=model_path)
interpreter.allocate_tensors()

input_details = interpreter.get_input_details()
output_details = interpreter.get_output_details()

# Lấy kích thước đầu vào (Giả sử export format là NHWC: [1, 640, 640, 3])
input_shape = input_details[0]['shape']
input_height, input_width = input_shape[1], input_shape[2]

img = cv2.imread(image_path)
if img is None:
    raise ValueError("Không tìm thấy ảnh test.")

# Hàm tiền xử lý cơ bản cho YOLOv8 (Resize -> RGB -> Chuẩn hóa 0-1)
def preprocess(image):
    img_resized = cv2.resize(image, (input_width, input_height))
    img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)
    input_data = np.expand_dims(img_rgb, axis=0).astype(np.float32) / 255.0
    return input_data

# ==========================================
# 2. WARM-UP MÔ HÌNH
# ==========================================
print("Đang warm-up mô hình...")
test_input = preprocess(img)
interpreter.set_tensor(input_details[0]['index'], test_input)
for _ in range(5):
    interpreter.invoke()

# ==========================================
# 3. ĐO LƯỜNG TỐC ĐỘ CHÍNH THỨC
# ==========================================
num_tests = 5000
total_inference_time = 0.0
total_e2e_time = 0.0

print(f"Bắt đầu đo lường tốc độ với {num_tests} vòng lặp...")

for _ in range(num_tests):
    # Thời điểm bắt đầu toàn bộ quy trình (Đọc, preprocess, suy luận, postprocess...)
    t0_e2e = time.perf_counter()
    
    # Tiền xử lý
    input_data = preprocess(img)
    interpreter.set_tensor(input_details[0]['index'], input_data)
    
    # Thời điểm bắt đầu riêng cho mạng nơ-ron
    t1_inf = time.perf_counter()
    interpreter.invoke() # Thực hiện suy luận
    t2_inf = time.perf_counter()
    
    # Lấy kết quả đầu ra (để mô phỏng toàn bộ luồng dữ liệu)
    output_data = interpreter.get_tensor(output_details[0]['index'])
    
    # (Tại đây thông thường sẽ có hàm hậu xử lý Non-Max Suppression - NMS)
    
    t3_e2e = time.perf_counter()
    
    # Cộng dồn thời gian (ms)
    total_inference_time += (t2_inf - t1_inf) * 1000
    total_e2e_time += (t3_e2e - t0_e2e) * 1000

# ==========================================
# 4. TÍNH TOÁN & XUẤT KẾT QUẢ
# ==========================================
avg_inference = total_inference_time / num_tests
avg_e2e = total_e2e_time / num_tests
real_fps = 1000.0 / avg_e2e

print("\n" + "="*40)
print("📊 BÁO CÁO TỐC ĐỘ XỬ LÝ TFLITE PURE")
print("="*40)
print(f"- Số mẫu thử nghiệm   : {num_tests}")
print(f"- Pure Inference Time : {avg_inference:.2f} ms")
print(f"- Tổng thời gian (E2E): {avg_e2e:.2f} ms (Bao gồm Preprocess)")
print("-" * 40)
print(f"⚡ Tốc độ khung hình   : {real_fps:.2f} FPS")
print("="*40)