import time
import logging

from src.repository.http_client import HttpClient, RequestsHttpClient
from src.utils.config import APP_CONFIG


class ThingsboardClient:
    """Thin client for sending heartbeat telemetry to ThingsBoard."""

    def __init__(self, http_client: HttpClient | None = None):
        self.logger = logging.getLogger("smart_bin.thingsboard_repository")
        self.base_url = APP_CONFIG.api.thingsboard_base_url
        self.timeout = APP_CONFIG.api.request_timeout_seconds
        self.http_client = http_client or RequestsHttpClient()

    def send_telemetry(self, access_token: str, payload: dict | None = None) -> tuple[bool, str, int | None]:
        """Send telemetry payload for one device token; default payload is heartbeat."""
        if not access_token:
            return False, "Missing access token for telemetry", None

        # Device telemetry endpoint format: /api/v1/{access_token}/telemetry
        url = f"{self.base_url}/{access_token}/telemetry"
        telemetry_payload = payload or {"heartbeat": int(time.time() * 1000)}
        self.logger.info("Sending telemetry heartbeat=%s", telemetry_payload.get("heartbeat"))

        try:
            response = self.http_client.post(url, json=telemetry_payload, timeout=self.timeout)
            self.logger.info("telemetry status_code=%s", response.status_code)

            if response.status_code in (401, 403, 404):
                return False, f"Telemetry rejected ({response.status_code}): {response.text}", response.status_code

            response.raise_for_status()
            return True, "OK", response.status_code
        except Exception as e:
            self.logger.warning("Telemetry request failed: %s", e)
            return False, f"Failed to send telemetry: {str(e)}", None