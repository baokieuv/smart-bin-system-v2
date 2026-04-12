from dataclasses import dataclass
from typing import Optional

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