import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from src.models.trash_model import TrashData


@dataclass(frozen=True)
class PendingUploadItem:
    """One detection record ready to be uploaded to backend."""

    filename: str
    image_path: str
    metadata_path: str
    metadata: dict


class DetectionMetadataStore:
    """Encapsulates metadata JSON read/write concerns for detection events."""

    def __init__(self, metadata_dir: Path, logger: logging.Logger):
        self.metadata_dir = metadata_dir
        self.logger = logger
        self.metadata_dir.mkdir(parents=True, exist_ok=True)

    def save_detection(self, trash_data: TrashData, feedback: str) -> Path:
        """Persist initial detection metadata so upload can happen asynchronously."""
        detected_at = datetime.now(timezone.utc).isoformat()
        filename = Path(trash_data.image_path).name if trash_data.image_path else None
        metadata = {
            "detectionId": trash_data.detection_id,
            "detectedAt": detected_at,
            "image": trash_data.image_path,
            "filename": filename,
            "category": trash_data.category,
            "confidence": round(float(trash_data.confidence), 6),
            "label": trash_data.label,
            "userFeedback": feedback,
            "actualType": None
        }

        metadata_name = trash_data.detection_id or f"detection_{int(datetime.now().timestamp() * 1000)}"
        metadata_path = self.metadata_dir / f"{metadata_name}.json"
        with open(metadata_path, "w", encoding="utf-8") as file_handle:
            json.dump(metadata, file_handle, ensure_ascii=True, indent=2)

        self.logger.info("Metadata saved: %s", metadata_path.name)
        return metadata_path

    def update_feedback(self, metadata_path: Path, feedback: str) -> None:
        """Patch user feedback into previously stored metadata file."""
        if not metadata_path.exists():
            return

        try:
            with open(metadata_path, "r", encoding="utf-8") as file_handle:
                metadata = json.load(file_handle)

            metadata["userFeedback"] = feedback
            metadata["feedbackAt"] = datetime.now(timezone.utc).isoformat()

            with open(metadata_path, "w", encoding="utf-8") as file_handle:
                json.dump(metadata, file_handle, ensure_ascii=True, indent=2)
            self.logger.info("Feedback updated=%s for %s", feedback, metadata_path.name)
        except (OSError, json.JSONDecodeError) as exc:
            self.logger.exception("Failed to update feedback metadata: %s", exc)

    def collect_pending_items(self, upload_batch_size: int) -> list[PendingUploadItem]:
        """Read metadata files and build a validated upload batch."""
        candidates: list[PendingUploadItem] = []
        metadata_files = sorted(self.metadata_dir.glob("*.json"), key=lambda p: p.stat().st_mtime)

        for metadata_path in metadata_files:
            if len(candidates) >= upload_batch_size:
                break

            try:
                with open(metadata_path, "r", encoding="utf-8") as file_handle:
                    metadata = json.load(file_handle)
            except (OSError, json.JSONDecodeError) as exc:
                self.logger.warning("Skipping invalid metadata %s: %s", metadata_path.name, exc)
                continue

            image_path = metadata.get("image")
            if not image_path:
                self.logger.warning("Skipping metadata without image path: %s", metadata_path.name)
                continue

            image_file = Path(image_path)
            if not image_file.exists():
                self.logger.warning("Image does not exist, skipping: %s", image_path)
                continue

            filename = metadata.get("filename") or image_file.name
            candidates.append(
                PendingUploadItem(
                    filename=filename,
                    image_path=str(image_file),
                    metadata_path=str(metadata_path),
                    metadata=metadata,
                )
            )

        return candidates

    def safe_delete(self, file_path: str) -> None:
        """Best-effort delete used after successful upload confirmation."""
        try:
            Path(file_path).unlink(missing_ok=True)
        except OSError as exc:
            self.logger.warning("Failed to delete file %s: %s", file_path, exc)