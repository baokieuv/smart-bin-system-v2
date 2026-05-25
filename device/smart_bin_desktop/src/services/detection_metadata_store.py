import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from src.models.trash_model import TrashData


@dataclass(frozen=True)
class PendingUploadItem:
    """One detection record ready to be uploaded to the backend."""
    filename: str
    image_path: str
    metadata_path: str
    metadata: dict


class DetectionMetadataStore:
    """Encapsulates metadata JSON read/write concerns for detection events."""

    def __init__(self, metadata_dir: Path, logger: logging.Logger) -> None:
        self.metadata_dir = metadata_dir
        self.logger = logger
        self.metadata_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    def save_detection(self, trash_data: TrashData, feedback: str) -> Path:
        """Persist initial detection metadata for async upload."""
        filename = Path(trash_data.image_path).name if trash_data.image_path else None
        metadata = {
            "detectionId": trash_data.detection_id,
            "detectedAt": datetime.now(timezone.utc).isoformat(),
            "image": trash_data.image_path,
            "filename": filename,
            "category": trash_data.category,
            "confidence": round(float(trash_data.confidence), 6),
            "label": trash_data.label,
            "userFeedback": feedback,
            "actualType": None,
        }
        name = trash_data.detection_id or f"detection_{int(datetime.now().timestamp() * 1000)}"
        path = self.metadata_dir / f"{name}.json"
        self._write_json(path, metadata)
        self.logger.info("Metadata saved: %s", path.name)
        return path

    def update_feedback(self, metadata_path: Path, feedback: str) -> None:
        """Patch user feedback into an existing metadata file."""
        if not metadata_path.exists():
            return
        metadata = self._read_json(metadata_path)
        if metadata is None:
            return
        metadata["userFeedback"] = feedback
        metadata["feedbackAt"] = datetime.now(timezone.utc).isoformat()
        self._write_json(metadata_path, metadata)
        self.logger.info("Feedback updated=%s for %s", feedback, metadata_path.name)

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    def collect_pending_items(self, batch_size: int) -> list[PendingUploadItem]:
        """Read metadata files and return up to *batch_size* validated upload items."""
        items: list[PendingUploadItem] = []
        # Process oldest-first so uploads happen in creation order.
        for path in sorted(self.metadata_dir.glob("*.json"), key=lambda p: p.stat().st_mtime):
            if len(items) >= batch_size:
                break
            item = self._load_pending_item(path)
            if item:
                items.append(item)
        return items

    def _load_pending_item(self, metadata_path: Path) -> PendingUploadItem | None:
        metadata = self._read_json(metadata_path)
        if metadata is None:
            return None

        image_path_str = metadata.get("image")
        if not image_path_str:
            self.logger.warning("Skipping metadata without image path: %s", metadata_path.name)
            return None

        image_file = Path(image_path_str)
        if not image_file.exists():
            self.logger.warning("Image missing, skipping: %s", image_path_str)
            return None

        return PendingUploadItem(
            filename=metadata.get("filename") or image_file.name,
            image_path=str(image_file),
            metadata_path=str(metadata_path),
            metadata=metadata,
        )

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    def safe_delete(self, file_path: str) -> None:
        """Best-effort delete used after a successful upload."""
        try:
            Path(file_path).unlink(missing_ok=True)
        except OSError as exc:
            self.logger.warning("Failed to delete %s: %s", file_path, exc)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _read_json(self, path: Path) -> dict | None:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, json.JSONDecodeError) as exc:
            self.logger.warning("Skipping unreadable metadata %s: %s", path.name, exc)
            return None

    def _write_json(self, path: Path, data: dict) -> None:
        try:
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=True, indent=2)
        except OSError as exc:
            self.logger.warning("Failed to write metadata %s: %s", path.name, exc)