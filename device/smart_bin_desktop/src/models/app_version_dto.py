from dataclasses import dataclass

@dataclass
class AppVersionDto:
    # Mirrors device payload returned by backend APIs.
    bin_version: str
    bin_url: str

    @classmethod
    def from_dict(cls, data: dict):
        if not data:
            return None
        return cls(
            bin_version=data.get("binVer", ""),
            bin_url=data.get("binUrl"),
        )