import cv2
import time
from ultralytics import YOLO

# 1. Create Model YOLOv8
print("Creating YOLO model")
model = YOLO('../device/hand_detection/best_saved_model_archive/best_int8.tflite', task='detect')

# 2. Create Camera
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

# 3. Create tool for moving detection (OpenCV)
bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=50, varThreshold=50, detectShadows=False)

time_idle = 0    # Time when the system is idle
trash_falling = False   # Trash status

print("The system is now already to detect")

# 4. Start detection

while True:
    ret, frame = cap.read()
    if not ret:
        break
    
    # 4.1 Hand detection
    results = model(frame, imgsz=320, conf=0.5, verbose=False)
    
    hand = False
    for r in results:
        if len(r.boxes) > 0:    # Have hand
            hand = True
            frame = r.plot()
            break
        
    # 4.2 Moving detection (OpenCV)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    fg_mark = bg_subtractor.apply(gray)
    
    _, thresh = cv2.threshold(fg_mark, 200, 255, cv2.THRESH_BINARY)
    difference_pixel = cv2.countNonZero(thresh)
    
    have_moving = difference_pixel > 500
    
    if hand or have_moving:
        time_idle = time.time()
        trash_falling = True
        cv2.putText(frame, "Having motion...", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
    
    elif trash_falling:
        time_over = time.time() - time_idle
        cv2.putText(frame, f"Having trash: {time_over:.1f}s", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        
        if time_over > 1.0:
            print("Trash idle -> start capture")
            cv2.imwrite("trash_in_processing.jpg", frame)
            
            trash_falling = False
            time.sleep(1)
    
    cv2.imshow('Smart Bin Camera', frame)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
        