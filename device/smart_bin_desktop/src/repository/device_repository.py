import base64
import uuid
import json
import time
import logging
from pathlib import Path
from typing import Any
import re

from src.models.api_response import ApiResponseFormat
from src.models.device_dto import DeviceDto
from src.models.app_version_dto import AppVersionDto
from src.repository.http_client import HttpClient, HttpResponse, RequestsHttpClient
from src.utils.config import APP_CONFIG
from src.repository.actuator_repository import ActuatorRepository
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_private_key


class DeviceClient:
    """Backend gateway for device activation/auth and detection result upload.

    Public methods intentionally stay stable for ViewModel usage.
    Internal helpers centralize signature and HTTP flow to reduce duplication.
    """

    def __init__(self, http_client: HttpClient | None = None):
        self.logger = logging.getLogger("smart_bin.device_repository")
        self.base_url = APP_CONFIG.api.device_base_url
        self.timeout = APP_CONFIG.api.request_timeout_seconds
        self.private_key_path = APP_CONFIG.paths.private_key_path
        self.http_client = http_client or RequestsHttpClient()

    @staticmethod
    def get_mac_address() -> str:
        # uuid.getnode() returns host MAC as integer; normalize to AA:BB:CC:DD:EE:FF.
        mac_num = hex(uuid.getnode()).replace('0x', '').zfill(12).upper()
        return ':'.join(mac_num[i: i + 2] for i in range(0, 11, 2))
        
    def _generate_payload_and_signature(self) -> tuple[bool, str, str]:
        """Create compact JSON payload and corresponding RSA signature."""
        mac = self.get_mac_address()
        timestamp = int(time.time() * 1000)
        
        payload_dict = {
            "mac": mac,
            "timestamp": timestamp
        }
        
        # Compact JSON string ensures signature consistency with server-side verification.
        payload_str = json.dumps(payload_dict, separators=(',', ':'))
        
        ok, signature_or_error = self._encrypt_data(payload_str)
        
        return ok, payload_str, signature_or_error

    def _signed_json_headers(
        self,
        signature: str,
        signature_header: str = "X-Signature",
        metadata_header: str | None = None,
    ) -> dict[str, str]:
        """Build standard headers for signed backend requests."""
        headers = {
            signature_header: signature,
            "Content-Type": "application/json",
        }
        if metadata_header is not None:
            headers["metadata"] = metadata_header
        return headers

    def _post_signed_request(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        signature_header: str = "X-Signature",
        metadata_header: str | None = None,
    ) -> tuple[bool, HttpResponse | str]:
        """Send signed POST request where body must match signed payload exactly."""
        ok, payload_str, signature_or_error = self._generate_payload_and_signature()
        if not ok:
            return False, signature_or_error

        headers = self._signed_json_headers(
            signature_or_error,
            signature_header=signature_header,
            metadata_header=metadata_header,
        )
        url = f"{self.base_url}/{path}"

        try:
            response = self.http_client.post(
                url,
                params=params,
                data=payload_str,
                headers=headers,
                timeout=self.timeout,
            )
            self.logger.info("%s status_code=%s", path, response.status_code)
            return True, response
        except Exception as e:
            self.logger.warning("%s network error: %s", path, e)
            return False, f"Network error: {str(e)}"

    @staticmethod
    def _parse_device_api_response(
        response_json: dict[str, Any],
    ) -> tuple[bool, ApiResponseFormat[DeviceDto] | str]:
        """Parse backend wrapper JSON into typed ApiResponseFormat[DeviceDto]."""
        api_response = ApiResponseFormat.from_dict(response_json, details_class=DeviceDto)
        if api_response.success:
            return True, api_response
        return False, api_response.message
    
    @staticmethod
    def _parse_app_version_api_response(
        response_json: dict[str, Any],
    ) -> tuple[bool, ApiResponseFormat[AppVersionDto] | str]:
        """Parse backend wrapper JSON into typed ApiResponseFormat[AppVersionDto]."""
        api_response = ApiResponseFormat.from_dict(response_json, details_class=AppVersionDto)
        if api_response.success:
            return True, api_response
        return False, api_response.message

    @staticmethod
    def _normalize_version(version: str | None) -> tuple[int, ...]:
        """Convert version strings like 1.2.3 into a comparable integer tuple."""
        if not version:
            return (0,)

        parts = re.findall(r"\d+", str(version))
        if not parts:
            return (0,)
        return tuple(int(part) for part in parts)

    def _is_version_older(self, current_version: str | None, target_version: str | None) -> bool:
        """Return True when current_version is older than target_version."""
        current = self._normalize_version(current_version)
        target = self._normalize_version(target_version)
        max_len = max(len(current), len(target))
        current = current + (0,) * (max_len - len(current))
        target = target + (0,) * (max_len - len(target))
        return current < target

    def _download_binary_file(self, url: str, destination: Path) -> tuple[bool, str]:
        """Download a binary resource and save it to destination."""
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            response = self.http_client.get(url, timeout=self.timeout, stream=True)
            self.logger.info("download_binary status_code=%s url=%s", response.status_code, url)
            response.raise_for_status()

            with open(destination, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)

            return True, f"Saved firmware to {destination}"
        except Exception as exc:
            self.logger.warning("Failed to download binary file: %s", exc)
            return False, f"Failed to download firmware: {str(exc)}"
    
    
    def activate_device(self) -> tuple[bool, ApiResponseFormat[DeviceDto] | str]:
        """Activate current device by signed MAC/timestamp payload."""
        self.logger.info("Call activate_device")

        ok, response_or_error = self._post_signed_request("activate")
        if not ok:
            return False, response_or_error

        response = response_or_error
        try:
            if not response.ok:
                return False, self._parse_error_response(response)

            return self._parse_device_api_response(response.json())
        except ValueError:
            self.logger.warning("activate_device parse response error")
            return False, "Failed to parse server response"
        
    def get_access_token(self) -> tuple[bool, ApiResponseFormat[DeviceDto] | str]:
        """Get access token for telemetry and secure backend operations."""
        self.logger.info("Call get_access_token")

        ok, response_or_error = self._post_signed_request("get-access-token")
        if not ok:
            return False, response_or_error

        response = response_or_error
        try:
            if not response.ok:
                return False, self._parse_error_response(response)

            return self._parse_device_api_response(response.json())
        except ValueError:
            self.logger.warning("get_access_token parse response error")
            return False, "Failed to parse server response"

    def _parse_error_response(self, response: HttpResponse) -> dict:
        """Normalize backend error payload into one predictable dict schema."""
        try:
            data = response.json()
            code = data.get("code")
            message = data.get("message") or response.text
            trace_id = data.get("traceId")
        except ValueError:
            code = None
            message = response.text
            trace_id = None

        return {
            "http_status": response.status_code,
            "code": str(code).upper() if code else None,
            "message": message,
            "trace_id": trace_id,
        }
             
    def send_report_classification(self, image_path: str, metadata: dict) -> tuple[bool, Any]:
        """
        Upload one detection image using a presigned-url workflow:
        1) Request presigned URL from backend.
        2) Upload image to object storage via the presigned URL.
        3) Confirm upload completion to backend.
        """
        image_file = Path(image_path)
        if not image_file.exists():
            return False, f"Image file not found: {image_path}"

        filename = str(metadata.get("filename") or image_file.name)
        content_type = "image/jpeg"

        ok, presigned_data = self._request_detection_presigned_url(
            filename=filename,
            metadata=metadata,
            file_size=image_file.stat().st_size,
            content_type=content_type,
        )
        if not ok:
            return False, presigned_data

        ok, upload_info = self._upload_file_via_presigned_url(
            image_path=str(image_file),
            presigned_data=presigned_data,
            content_type=content_type,
        )
        if not ok:
            return False, upload_info

        ok, confirm_result = self._confirm_detection_upload(
            filename=filename,
            metadata=metadata,
            presigned_data=presigned_data,
            upload_info=upload_info,
        )
        if not ok:
            return False, confirm_result

        return True, confirm_result

    def _request_detection_presigned_url(
        self,
        filename: str,
        metadata: dict,
        file_size: int,
        content_type: str,
    ) -> tuple[bool, dict | str]:
        """Request a presigned URL from backend to upload one detection image."""
        metadata_header = json.dumps(metadata, separators=(',', ':'))
        ok, response_or_error = self._post_signed_request(
            "presigned-url",
            signature_header="X-Signature",
            metadata_header=metadata_header,
        )
        if not ok:
            return False, response_or_error

        response = response_or_error

        try:
            if not response.ok:
                return False, self._parse_error_response(response)

            json_data = response.json()
            data = json_data.get("data")
            
            if isinstance(data, str):
                # Normalize string response to dict format expected by upload helper.
                return True, {"presignedUrl": data, "method": "PUT"}
                
            return False, "Invalid presigned URL response format"
            
        except ValueError:
            return False, "Failed to parse presigned URL response"

    def _upload_file_via_presigned_url(
        self,
        image_path: str,
        presigned_data: dict,
        content_type: str,
    ) -> tuple[bool, dict | str]:
        presigned_url = presigned_data.get("presignedUrl") or presigned_data.get("url")
        if not presigned_url:
            return False, "Backend did not return presignedUrl"

        method = str(presigned_data.get("method") or "PUT").upper()
        upload_headers = presigned_data.get("headers") if isinstance(presigned_data.get("headers"), dict) else {}
        upload_headers = {str(k): str(v) for k, v in upload_headers.items()}
        upload_headers.setdefault("Content-Type", content_type)

        try:
            with open(image_path, "rb") as f:
                if method == "POST":
                    fields = presigned_data.get("fields") if isinstance(presigned_data.get("fields"), dict) else {}
                    files = {"file": (Path(image_path).name, f, content_type)}
                    response = self.http_client.post(
                        presigned_url,
                        data=fields,
                        files=files,
                        headers=upload_headers,
                        timeout=self.timeout,
                    )
                else:
                    response = self.http_client.put(
                        presigned_url,
                        data=f,
                        headers=upload_headers,
                        timeout=self.timeout,
                    )

            self.logger.info("upload_presigned_url status_code=%s file=%s", response.status_code, image_path)
            response.raise_for_status()

            return True, {
                "statusCode": response.status_code,
                "etag": response.headers.get("ETag") or response.headers.get("etag"),
                "requestId": response.headers.get("x-amz-request-id"),
            }
        except Exception as e:
            self.logger.warning("upload_presigned_url network error: %s", e)
            return False, f"Failed to upload image via presigned URL: {str(e)}"
        except OSError as e:
            self.logger.warning("upload_presigned_url read file error: %s", e)
            return False, f"Failed to read image file: {str(e)}"

    def _confirm_detection_upload(
        self,
        filename: str,
        metadata: dict,
        presigned_data: dict,
        upload_info: dict,
    ) -> tuple[bool, dict | str]:
        """Confirm to backend that file upload via presigned URL completed."""
        metadata_query = json.dumps(metadata, separators=(',', ':'))
        ok, response_or_error = self._post_signed_request(
            "confirm-upload",
            metadata_header=metadata_query
        )
        if not ok:
            return False, response_or_error

        response = response_or_error

        try:
            if not response.ok:
                return False, self._parse_error_response(response)

            return True, response.json()
            
        except ValueError:
            return False, "Failed to parse upload confirmation response"
        
        
    def get_app_version(self) -> tuple[bool, str | AppVersionDto | dict[str, Any]]:
        """Fetch backend app version, compare ESP32 firmware, and download newer BIN if needed.

        Returns:
            (True, payload) when the check runs successfully.
            payload contains the parsed app version data plus update status.
        """
        self.logger.info("Call get_app_version")

        ok, response_or_error = self._post_signed_request("get-app-version")
        if not ok:
            return False, response_or_error

        response = response_or_error
        try:
            if not response.ok:
                return False, self._parse_error_response(response)

            ok, parsed_or_error = self._parse_app_version_api_response(response.json())
            if not ok:
                return False, parsed_or_error

            api_response = parsed_or_error
            app_version = api_response.data
            if not app_version:
                return False, "Backend returned empty app version data"

            actuator_client = ActuatorRepository()
            ok, esp_version_or_error = actuator_client.get_firmware_version()
            if not ok:
                return False, f"Failed to read ESP32 version: {esp_version_or_error}"

            esp_version = esp_version_or_error or ""
            desktop_version = APP_CONFIG.desktop_version
            result: dict[str, Any] = {
                "backend": {
                    "bin_version": app_version.bin_version,
                    "desktop_version": app_version.desktop_version,
                    "bin_url": app_version.bin_url,
                    "desktop_url": app_version.desktop_url,
                },
                "local": {
                    "desktop_version": desktop_version,
                    "esp32_version": esp_version,
                },
                "downloaded": False,
                "firmware_file": str(APP_CONFIG.esp32_ota.firmware_file),
            }

            if self._is_version_older(esp_version, app_version.bin_version):
                if not app_version.bin_url:
                    return False, "Backend returned empty binUrl"

                download_ok, download_message = self._download_binary_file(
                    app_version.bin_url,
                    APP_CONFIG.esp32_ota.firmware_file,
                )
                if not download_ok:
                    return False, download_message

                result["downloaded"] = True
                result["download_message"] = download_message

            return True, result
        except ValueError:
            self.logger.warning("get_app_version parse response error")
            return False, "Failed to parse server response"
    
    def _encrypt_data(self, payload: str) -> tuple[bool, str]:
        """Sign payload using local RSA private key and return base64 signature."""
        try:
            with open(self.private_key_path, "rb") as key_file:
                private_key = load_pem_private_key(key_file.read(), password=None)

                signature = private_key.sign(
                    payload.encode('utf-8'),
                    padding.PKCS1v15(),
                    hashes.SHA256()
                )
            signature_b64 = base64.b64encode(signature).decode('utf-8')

            return True, signature_b64
        except FileNotFoundError:
            self.logger.warning("Private key file not found: %s", self.private_key_path)
            return False, f"Private key file not found at {self.private_key_path}"
        except ValueError as e:
            self.logger.warning("Failed to read key or generate signature: %s", e)
            return False, f"Failed to read key or generate signature: {str(e)}"
        except Exception as e:
            self.logger.exception("Unexpected error while signing payload: %s", e)
            return False, f"Unexpected signing error: {str(e)}"