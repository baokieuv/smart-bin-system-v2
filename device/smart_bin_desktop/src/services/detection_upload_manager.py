import logging

from src.repository.device_repository import DeviceClient
from src.services.detection_metadata_store import DetectionMetadataStore


class DetectionUploadManager:
    """Coordinates upload batch execution; keeps upload state out of ViewModel."""

    def __init__(
        self,
        metadata_store: DetectionMetadataStore,
        device_client: DeviceClient,
        logger: logging.Logger,
    ) -> None:
        self.metadata_store = metadata_store
        self.device_client = device_client
        self.logger = logger
        self._batch_running = False

    def run_batch(self, batch_size: int) -> None:
        """Upload pending detections and clean up local files on success.

        Skips execution if a previous batch is still in flight (re-entrant guard).
        """
        if self._batch_running:
            self.logger.debug("Skipping upload tick — previous batch still running")
            return

        items = self.metadata_store.collect_pending_items(batch_size)
        if not items:
            self.logger.debug("No pending detections to upload")
            return

        self._batch_running = True
        try:
            success_count = 0
            for item in items:
                ok, response = self.device_client.send_report_classification(
                    image_path=item.image_path,
                    metadata=item.metadata,
                )
                if not ok:
                    self.logger.warning(
                        "Upload failed file=%s: %s", item.filename, response
                    )
                    continue

                self.metadata_store.safe_delete(item.image_path)
                self.metadata_store.safe_delete(item.metadata_path)
                success_count += 1

            self.logger.info(
                "Upload batch done: %d/%d succeeded", success_count, len(items)
            )
        finally:
            self._batch_running = False