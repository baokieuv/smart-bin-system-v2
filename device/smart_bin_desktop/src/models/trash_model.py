from dataclasses import dataclass
from typing import Optional
from enum import Enum

from src.utils.config import APP_CONFIG


class WasteGroup(Enum):
    """Classification of waste into 4 categories for actuator routing."""
    RECYCLABLE = "recyclable"
    COMPOSTABLE = "compostable"
    NON_RECYCLABLE = "non_recyclable"
    UNKNOWN = "unknown"

    @property
    def angle(self) -> int:
        """Return the stepper motor angle for this waste group."""
        return APP_CONFIG.waste_group.angle_by_group.get(self.value, APP_CONFIG.waste_group.angle_by_group["unknown"])

    @property
    def badge_color(self) -> str:
        """Return the badge color emoji."""
        return APP_CONFIG.waste_group.badge_by_group.get(self.value, APP_CONFIG.waste_group.badge_by_group["unknown"])

    @property
    def description(self) -> str:
        """Return the Vietnamese description."""
        return APP_CONFIG.waste_group.description_by_group.get(
            self.value,
            APP_CONFIG.waste_group.description_by_group["unknown"],
        )


_GROUP_NAME_TO_ENUM = {
    WasteGroup.RECYCLABLE.value: WasteGroup.RECYCLABLE,
    WasteGroup.COMPOSTABLE.value: WasteGroup.COMPOSTABLE,
    WasteGroup.NON_RECYCLABLE.value: WasteGroup.NON_RECYCLABLE,
    WasteGroup.UNKNOWN.value: WasteGroup.UNKNOWN,
}


def _build_category_mapping() -> dict[str, WasteGroup]:
    mapping: dict[str, WasteGroup] = {}
    for category, group_name in APP_CONFIG.waste_group.category_to_group.items():
        mapping[str(category).lower()] = _GROUP_NAME_TO_ENUM.get(str(group_name).lower(), WasteGroup.UNKNOWN)
    return mapping


# Mapping from trash category to waste group.
CATEGORY_TO_GROUP = _build_category_mapping()


def get_waste_group(category: str, confidence: float = 1.0, confidence_threshold: float | None = None) -> WasteGroup:
    """
    Determine waste group from category and confidence.
    
    Args:
        category: The detected trash category.
        confidence: Detection confidence (0.0 to 1.0).
        confidence_threshold: Minimum confidence to trust the category.
    
    Returns:
        The appropriate WasteGroup with angle for stepper motor control.
    """
    threshold = APP_CONFIG.detection.waste_group_confidence_threshold if confidence_threshold is None else confidence_threshold
    if confidence < threshold:
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