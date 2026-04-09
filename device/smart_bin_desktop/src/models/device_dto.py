from dataclasses import dataclass
from typing import Optional

@dataclass
class DeviceDto:
    id: str
    mac: str
    name: Optional[str] = None
    access_token: Optional[str] = None 
    longitude: Optional[float] = None
    latitude: Optional[float] = None
    state: Optional[str] = None
    status: Optional[str] = None
    created_date: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict):
        if not data:
            return None
        return cls(
            id=data.get("id", ""),
            mac=data.get("mac", ""),
            name=data.get("name"),
            # Lưu ý key trong dict phải khớp với JSON của Java (camelCase)
            access_token=data.get("accessToken"), 
            longitude=data.get("longitude"),
            latitude=data.get("latitude"),
            state=data.get("state"),
            status=data.get("status"),
            created_date=data.get("createdDate")
        )