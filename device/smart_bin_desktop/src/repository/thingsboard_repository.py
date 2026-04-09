import time

import requests


class ThingsboardClient:
    def __init__(self):
        self.base_url = "https://thingsboard.kvbhust.id.vn/api/v1"
        self.timeout = 10

    def send_telemetry(self, access_token: str, payload: dict | None = None) -> tuple[bool, str]:
        if not access_token:
            return False, "Thiếu access token để gửi telemetry"

        url = f"{self.base_url}/{access_token}/telemetry"
        telemetry_payload = payload or {"heartbeat": int(time.time() * 1000)}

        try:
            response = requests.post(url, json=telemetry_payload, timeout=self.timeout)

            if response.status_code in (401, 403, 404):
                return False, f"Telemetry bị từ chối ({response.status_code}): {response.text}"

            response.raise_for_status()
            return True, "OK"
        except requests.exceptions.RequestException as e:
            return False, f"Lỗi gửi telemetry: {str(e)}"