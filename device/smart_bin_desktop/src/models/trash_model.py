from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from src.utils.config import APP_CONFIG


class WasteGroup(Enum):
    """Waste classification that drives actuator routing."""

    RECYCLABLE = "recyclable"
    COMPOSTABLE = "compostable"
    NON_RECYCLABLE = "non_recyclable"
    UNKNOWN = "unknown"

    @property
    def angle(self) -> int:
        """Stepper motor angle for this waste group."""
        return APP_CONFIG.waste_group.angle_by_group.get(
            self.value, APP_CONFIG.waste_group.angle_by_group["unknown"]
        )

    @property
    def badge_color(self) -> str:
        return APP_CONFIG.waste_group.badge_by_group.get(
            self.value, APP_CONFIG.waste_group.badge_by_group["unknown"]
        )

    @property
    def description(self) -> str:
        return APP_CONFIG.waste_group.description_by_group.get(
            self.value, APP_CONFIG.waste_group.description_by_group["unknown"]
        )


# Pre-built lookup so str → enum never hits Enum iteration at runtime.
_GROUP_BY_VALUE: dict[str, WasteGroup] = {g.value: g for g in WasteGroup}


def _build_category_mapping() -> dict[str, WasteGroup]:
    return {
        str(cat).lower(): _GROUP_BY_VALUE.get(str(group).lower(), WasteGroup.UNKNOWN)
        for cat, group in APP_CONFIG.waste_group.category_to_group.items()
    }


CATEGORY_TO_GROUP: dict[str, WasteGroup] = _build_category_mapping()


def get_waste_group(
    category: str,
    confidence: float = 1.0,
    confidence_threshold: float | None = None,
) -> WasteGroup:
    """Map a detection category and confidence score to a WasteGroup.

    Returns ``WasteGroup.UNKNOWN`` when confidence falls below the threshold.
    """
    threshold = (
        APP_CONFIG.detection.waste_group_confidence_threshold
        if confidence_threshold is None
        else confidence_threshold
    )
    if confidence < threshold:
        return WasteGroup.UNKNOWN
    return CATEGORY_TO_GROUP.get(category.lower(), WasteGroup.UNKNOWN)


@dataclass
class TrashData:
    """Unified detection payload passed from worker → ViewModel → UI."""

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
        return get_waste_group(self.category, self.confidence)

    @property
    def stepper_angle(self) -> int:
        return self.waste_group.angle