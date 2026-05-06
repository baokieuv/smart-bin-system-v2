from dataclasses import dataclass
from typing import Optional

@dataclass
class AppVersionDto:
    # Mirrors device payload returned by backend APIs.
    bin_version: str
    desktop_version: str
    bin_url: str
    desktop_url: str

    @classmethod
    def from_dict(cls, data: dict):
        if not data:
            return None
        return cls(
            bin_version=data.get("binVer", ""),
            desktop_version=data.get("desktopVer", ""),
            bin_url=data.get("binUrl"),
            desktop_url=data.get("desktopUrl"), 
        )