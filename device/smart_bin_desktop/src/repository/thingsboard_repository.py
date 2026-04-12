import time
import logging

import requests
from src.utils.config import APP_CONFIG


class ThingsboardClient:
    def __init__(self):
        self.logger = logging.getLogger("smart_bin.thingsboard_repository")
        self.base_url = APP_CONFIG.api.thingsboard_base_url
        self.timeout = APP_CONFIG.api.request_timeout_seconds

    def send_telemetry(self, access_token: str, payload: dict | None = None) -> tuple[bool, str]:
        if not access_token:
            return False, "Thiếu access token để gửi telemetry"

        # Device telemetry endpoint format: /api/v1/{access_token}/telemetry
        url = f"{self.base_url}/{access_token}/telemetry"
        telemetry_payload = payload or {"heartbeat": int(time.time() * 1000)}
        self.logger.info("Gui telemetry heartbeat=%s", telemetry_payload.get("heartbeat"))

        try:
            response = requests.post(url, json=telemetry_payload, timeout=self.timeout)
            self.logger.info("telemetry status_code=%s", response.status_code)

            if response.status_code in (401, 403, 404):
                return False, f"Telemetry bị từ chối ({response.status_code}): {response.text}"

            response.raise_for_status()
            return True, "OK"
        except requests.exceptions.RequestException as e:
            self.logger.warning("Loi gui telemetry: %s", e)
            return False, f"Lỗi gửi telemetry: {str(e)}"