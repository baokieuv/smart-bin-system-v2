import logging

from src.repository.device_repository import DeviceClient
from src.services.detection_metadata_store import DetectionMetadataStore


class DetectionUploadManager:
    """Coordinates upload batch execution; keeps upload state out of ViewModel."""

    def __init__(self, metadata_store: DetectionMetadataStore, device_client: DeviceClient, logger: logging.Logger):
        self.metadata_store = metadata_store
        self.device_client = device_client
        self.logger = logger
        self._upload_in_progress = False

    def run_batch(self, upload_batch_size: int) -> None:
        """Upload pending detections and cleanup local files when confirmed."""
        if self._upload_in_progress:
            self.logger.info("Skipping upload tick because previous batch is still running")
            return

        items = self.metadata_store.collect_pending_items(upload_batch_size)
        if not items:
            self.logger.info("No pending detections to upload")
            return

        self._upload_in_progress = True
        try:
            success_count = 0
            for item in items:
                ok, response = self.device_client.send_report_classification(
                    image_path=item.image_path,
                    metadata=item.metadata,
                )
                if not ok:
                    self.logger.warning(
                        "Detection upload via presigned URL failed file=%s: %s",
                        item.filename,
                        response,
                    )
                    continue

                self.metadata_store.safe_delete(item.image_path)
                self.metadata_store.safe_delete(item.metadata_path)
                success_count += 1

            self.logger.info(
                "Detection upload batch completed: success=%s/%s",
                success_count,
                len(items),
            )
        finally:
            self._upload_in_progress = False