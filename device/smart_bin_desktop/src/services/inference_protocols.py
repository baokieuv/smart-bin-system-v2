from pathlib import Path
from typing import Any, Protocol

from ultralytics import YOLO


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


class YoloModelFactory:
    """Default model factory backed by Ultralytics YOLO."""

    def create_hand_detector(self, model_path: Path) -> InferenceModel:
        return YOLO(str(model_path), task="detect")

    def create_trash_classifier(self, model_path: Path) -> InferenceModel:
        return YOLO(str(model_path), task="classify")
