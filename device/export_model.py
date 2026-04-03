from ultralytics import YOLO

model = YOLO("./trash_classification/best.pt")

exported_model_path = model.export(
    format='tfline',
    int8=True,
    imgsz=224,
    half=False,
    optimize=True
)