import time
import logging
from pathlib import Path
from typing import Any, Protocol

import numpy as np
import cv2
import ai_edge_litert.interpreter as tflite


class InferenceModel(Protocol):
    """Callable model abstraction used by detection worker."""
    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        ...


class InferenceModelFactory(Protocol):
    """Factory contract for creating inference models from file paths."""
    def create_hand_detector(self, model_path: Path) -> InferenceModel:
        ...

    def create_trash_classifier(self, model_path: Path) -> InferenceModel:
        ...


# --- TFLITE IMPLEMENTATION ---

class TFLiteHandDetector:
    def __init__(self, model_path: Path):
        self.logger = logging.getLogger("smart_bin.inference.hand")
        self.logger.info("Đang tải model Hand Detection từ: %s", model_path)
        
        self.interpreter = tflite.Interpreter(model_path=str(model_path))
        self.interpreter.allocate_tensors()
        self.input_details = self.interpreter.get_input_details()[0]
        self.output_details = self.interpreter.get_output_details()[0]
        
        self.logger.info("Khởi tạo model Hand Detection thành công.")

    def __call__(self, frame, imgsz=640, conf=0.5, **kwargs):
        start_time = time.time()
        
        # 1. Pre-processing
        input_shape = self.input_details['shape'] 
        h, w = input_shape[1], input_shape[2]
        
        img = cv2.resize(frame, (w, h))
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img = img.astype(np.float32) / 255.0
        img = np.expand_dims(img, axis=0)

        # 2. Inference
        self.interpreter.set_tensor(self.input_details['index'], img)
        self.interpreter.invoke()
        output = self.interpreter.get_tensor(self.output_details['index'])

        # 3. Post-processing
        has_hand = False
        best_score = 0.0
        
        if len(output.shape) == 3:
            predictions = output[0]
            scores = np.max(predictions[4:, :], axis=0)
            best_score = float(np.max(scores))
            has_hand = best_score >= conf

        elapsed_ms = (time.time() - start_time) * 1000
        
        # In log quá trình nhận diện tay
        if has_hand:
            self.logger.debug(
                "Phát hiện tay | Độ tin cậy: %.3f (>= %.2f) | Thời gian xử lý: %.1f ms", 
                best_score, conf, elapsed_ms
            )
        else:
            self.logger.debug(
                "Không có tay | Độ tin cậy cao nhất: %.3f | Thời gian xử lý: %.1f ms", 
                best_score, elapsed_ms
            )

        # Mock Ultralytics Object
        class MockBox:
            def __init__(self, detected):
                self.boxes = [1] if detected else []
                
        return [MockBox(has_hand)]


class TFLiteTrashClassifier:
    def __init__(self, model_path: Path):
        self.logger = logging.getLogger("smart_bin.inference.trash")
        self.logger.info("Đang tải model Trash Classifier từ: %s", model_path)
        
        self.interpreter = tflite.Interpreter(model_path=str(model_path))
        self.interpreter.allocate_tensors()
        self.input_details = self.interpreter.get_input_details()[0]
        self.output_details = self.interpreter.get_output_details()[0]
        
        self.names = {
            0: "battery", 1: "biological", 2: "cardboard", 3: "clothes",
            4: "glass", 5: "metal", 6: "paper", 7: "plastic", 8: "shoes", 9: "trash"
        }
        
        self.logger.info("Khởi tạo model Trash Classifier thành công.")

    def __call__(self, frame, **kwargs):
        start_time = time.time()
        
        # 1. Pre-processing
        input_shape = self.input_details['shape'] 
        h, w = input_shape[1], input_shape[2]
        
        img = cv2.resize(frame, (w, h))
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        img = img.astype(np.float32) / 255.0
        img = np.expand_dims(img, axis=0)

        # 2. Inference
        self.interpreter.set_tensor(self.input_details['index'], img)
        self.interpreter.invoke()
        output = self.interpreter.get_tensor(self.output_details['index'])

        # 3. Post-processing 
        probs = output[0]
        top1_id = int(np.argmax(probs))
        top1_conf = float(probs[top1_id])
        top1_name = self.names.get(top1_id, "unknown")

        elapsed_ms = (time.time() - start_time) * 1000
        
        # In log kết quả phân loại rác (Dùng info để dễ nhìn trên console hơn debug)
        self.logger.info(
            "Phân loại rác: %s | Độ tin cậy: %.3f | Thời gian xử lý: %.1f ms", 
            top1_name.upper(), top1_conf, elapsed_ms
        )

        # Mock Ultralytics Object
        class MockProbs:
            def __init__(self, top1, top1conf):
                self.top1 = top1
                self.top1conf = top1conf

        class MockResult:
            def __init__(self, top1, top1conf, names):
                self.probs = MockProbs(top1, top1conf)
                self.names = names

        return [MockResult(top1_id, top1_conf, self.names)]


class TFLiteModelFactory:
    """Factory backed by Google ai-edge-litert for Edge Devices."""
    def create_hand_detector(self, model_path: Path) -> InferenceModel:
        return TFLiteHandDetector(model_path)

    def create_trash_classifier(self, model_path: Path) -> InferenceModel:
        return TFLiteTrashClassifier(model_path)