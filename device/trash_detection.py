import cv2
import time
from ultralytics import YOLO

# 1. Create Model YOLOv8
print("Creating YOLO model")
model = YOLO('../device/hand_detection/best_saved_model_archive/best_int8.tflite', task='detect')
model_trash_cls = YOLO('./trash_classification/best_model/best_int8.tflite', task='classify')

# 2. Create Camera
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

# 3. Create tool for moving detection (OpenCV)
# - history=50: number of pictures for model learn about background
# - varThreshold=50: Threshold for number of different pixel
bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=50, varThreshold=100, detectShadows=False)

time_idle = time.time()     # Time when the system is idle
trash_falling = False       # Trash status
IDLE_THRESHOLD = 3.0

print("The system is now already to detect")

# 4. Start detection
while True:
    ret, frame = cap.read()     # Read one frame
    if not ret:
        break
    
    # 4.1 Hand detection
    # - verbose: disable log
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
    
    have_moving = difference_pixel > 1000
    
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
            
            cls_results = model_trash_cls(frame, verbose=False)
            
            top_class_id = cls_results[0].probs.top1
            top_class_name = cls_results[0].names[top_class_id]
            confidence = cls_results[0].probs.top1conf.item()
            
            print(f"Classified as: {top_class_name} (Conf: {confidence:.2f})")
            
            cv2.putText(frame, f"Trash: {top_class_name} ({confidence:.2f})", (10, 60), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            cv2.imshow('Smart Bin Camera', frame)
            cv2.waitKey(1)
            
            trash_falling = False
            
            time_idle = time.time()
            time.sleep(1)
    
    if not trash_falling and (time.time() - time_idle > IDLE_THRESHOLD):
        delay_time = 500
        cv2.putText(frame, "Power Saving Mode (~2 FPS)", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 100, 100), 2)
    else:
        delay_time = 1
    
    cv2.imshow('Smart Bin Camera', frame)
    
    if cv2.waitKey(delay_time) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
        