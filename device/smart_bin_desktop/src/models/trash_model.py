from dataclasses import dataclass
from typing import Optional
from enum import Enum


class WasteGroup(Enum):
    """Classification of waste into 4 categories for actuator routing."""
    RECYCLABLE = ("recyclable", 45, "🟢", "Có thể tái chế")
    COMPOSTABLE = ("compostable", -45, "🟡", "Phân hủy sinh học")
    NON_RECYCLABLE = ("non_recyclable", 135, "🔴", "Không tái chế được")
    UNKNOWN = ("unknown", -135, "⚪", "Không xác định")

    @property
    def angle(self) -> int:
        """Return the stepper motor angle for this waste group."""
        return self.value[1]

    @property
    def badge_color(self) -> str:
        """Return the badge color emoji."""
        return self.value[2]

    @property
    def description(self) -> str:
        """Return the Vietnamese description."""
        return self.value[3]


# Mapping from trash category to waste group.
CATEGORY_TO_GROUP = {
    "cardboard": WasteGroup.RECYCLABLE,
    "paper": WasteGroup.RECYCLABLE,
    "plastic": WasteGroup.RECYCLABLE,
    "metal": WasteGroup.RECYCLABLE,
    "glass": WasteGroup.RECYCLABLE,
    "biological": WasteGroup.COMPOSTABLE,
    "clothes": WasteGroup.COMPOSTABLE,
    "shoes": WasteGroup.COMPOSTABLE,
    "battery": WasteGroup.NON_RECYCLABLE,
    "trash": WasteGroup.NON_RECYCLABLE,
}


def get_waste_group(category: str, confidence: float = 1.0, confidence_threshold: float = 0.5) -> WasteGroup:
    """
    Determine waste group from category and confidence.
    
    Args:
        category: The detected trash category.
        confidence: Detection confidence (0.0 to 1.0).
        confidence_threshold: Minimum confidence to trust the category.
    
    Returns:
        The appropriate WasteGroup with angle for stepper motor control.
    """
    if confidence < confidence_threshold:
        return WasteGroup.UNKNOWN
    return CATEGORY_TO_GROUP.get(category.lower(), WasteGroup.UNKNOWN)


@dataclass
class TrashData:
    # Unified payload passed from detector -> ViewModel -> UI.
    material: str
    item_type: str
    bg_color: str
    category: str
    confidence: float
    label: str
    image_path: Optional[str] = None
    detection_id: Optional[str] = None

    @property
    def waste_group(self) -> WasteGroup:
        """Get the waste group for this trash data."""
        return get_waste_group(self.category, self.confidence)

    @property
    def stepper_angle(self) -> int:
        """Get the stepper motor angle for this detection."""
        return self.waste_group.angle