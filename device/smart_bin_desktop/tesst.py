import time
import cv2
from ultralytics import YOLO

# 1. Khoi tao mo hinh 
# Su dung lai file .pt
model_path = "/home/lib/smart-bin-system-v2/device/smart_bin_desktop/best.pt" 
model = YOLO(model_path)

# Doc mot buc anh mau de test
image_path = "/home/lib/smart-bin-system-v2/device/smart_bin_desktop/rotten-moldy-chicken-meat-bad-conditions-preservation-close-up-spoiled-food-fungus-illness-266104286-2838275071.jpg"
img = cv2.imread(image_path)

if img is None:
    raise ValueError("Khong tim thay anh test. Vui long kiem tra lai duong dan!")

# ==========================================
# 2. WARM-UP MO HINH (RAT QUAN TRONG)
# ==========================================
print("Dang warm-up mo hinh (5 vong lap)...")
for _ in range(5):
    _ = model(img, verbose=False)

# ==========================================
# 3. DO LUONG TOC DO CHINH THUC
# ==========================================
num_tests = 5000  # So luong vong lap de lay trung binh
total_inference_time = 0.0
total_e2e_time = 0.0

print(f"Bat dau do luong toc do voi {num_tests} vong lap...")

for i in range(num_tests):
    # Danh dau thoi gian bat dau toan bo pipeline (End-to-End)
    start_time = time.perf_counter()
    
    # Thuc hien suy luan
    results = model(img, verbose=False)
    
    # Danh dau thoi gian ket thuc toan bo pipeline
    end_time = time.perf_counter()
    
    # Toc do End-to-End thuc te (bao gom goi ham, luan chuyen du lieu) tinh bang ms
    e2e_time_ms = (end_time - start_time) * 1000
    
    # Lay thoi gian suy luan thuan tuy (Pure Inference) tu YOLO
    speed_metrics = results[0].speed
    inference_time_ms = speed_metrics['inference'] 
    
    total_inference_time += inference_time_ms
    total_e2e_time += e2e_time_ms

# ==========================================
# 4. TINH TOAN & XUAT KET QUA
# ==========================================
avg_inference = total_inference_time / num_tests
avg_e2e = total_e2e_time / num_tests
real_fps = 1000.0 / avg_e2e

print("\n" + "="*40)
print(" BAO CAO TOC DO XU LY TREN THIET BI (.PT)")
print("="*40)
print(f"- So mau thu nghiem   : {num_tests}")
print(f"- Thoi gian tien xu ly: {speed_metrics['preprocess']:.2f} ms")
print(f"- Pure Inference Time : {avg_inference:.2f} ms")
print(f"- Hau xu ly (NMS)     : {speed_metrics['postprocess']:.2f} ms")
print("-" * 40)
print(f" Tong thoi gian (E2E): {avg_e2e:.2f} ms / khung hinh")
print(f" Toc do khung hinh   : {real_fps:.2f} FPS")
print("="*40)