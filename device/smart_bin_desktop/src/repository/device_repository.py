import hashlib
import json
import logging
import shutil
import time
import uuid
import mimetypes
from pathlib import Path
from typing import Any
import re

from src.models.api_response import ApiResponseFormat
from src.models.device_dto import DeviceDto
from src.models.device_config_dto import DeviceConfigDto
from src.models.ota_check_response_dto import OtaCheckResponseDto
from src.repository.http_client import HttpClient, HttpResponse, RequestsHttpClient
from src.services.device_key_manager import DeviceKeyManager
from src.utils.config import APP_CONFIG


class DeviceClient:
    """Backend gateway for device activation/auth and detection result upload.

    Public methods intentionally stay stable for ViewModel usage.
    Internal helpers centralize signature and HTTP flow to reduce duplication.
    """

    def __init__(self, http_client: HttpClient | None = None):
        self.logger = logging.getLogger("smart_bin.device_repository")
        self.base_url = APP_CONFIG.api.device_base_url
        self.config_base_url = APP_CONFIG.api.config_base_url
        self.timeout = APP_CONFIG.api.request_timeout_seconds
        self.key_manager = DeviceKeyManager(APP_CONFIG.paths.devices_key_dir, self.logger)
        self._device_key_pair = self.key_manager.ensure_key_pair()
        self._public_key_uploaded = False
        self.http_client = http_client or RequestsHttpClient()

    @staticmethod
    def get_mac_address() -> str:
        # uuid.getnode() returns host MAC as integer; normalize to AA:BB:CC:DD:EE:FF.
        # mac_num = hex(uuid.getnode()).replace('0x', '').zfill(12).upper()
        # return ':'.join(mac_num[i: i + 2] for i in range(0, 11, 2))
        
        return "F0:E7:63:51:1C:8D"
        
    def _generate_payload_and_signature(self, extra_fields: dict[str, Any] | None = None) -> tuple[bool, str, str]:
        """Create compact JSON payload and corresponding RSA signature."""
        mac = self.get_mac_address()
        timestamp = int(time.time() * 1000)
        
        payload_dict = {
            "mac": mac,
            "timestamp": timestamp
        }
        if extra_fields:
            payload_dict.update(extra_fields)
        
        # Compact JSON string ensures signature consistency with server-side verification.
        payload_str = json.dumps(payload_dict, separators=(',', ':'))
        
        ok, signature_or_error = self._encrypt_data(payload_str, True)
        
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
        base_url: str | None = None,
        extra_fields: dict[str, Any] | None = None,
        allow_key_refresh: bool = True,
    ) -> tuple[bool, HttpResponse | str]:
        """Send signed POST request where body must match signed payload exactly."""
        ok, payload_str, signature_or_error = self._generate_payload_and_signature(extra_fields)
        if not ok:
            return False, signature_or_error

        headers = self._signed_json_headers(
            signature_or_error,
            signature_header=signature_header,
            metadata_header=metadata_header,
        )
        url = f"{base_url or self.base_url}/{path}"

        try:
            response = self.http_client.post(
                url,
                params=params,
                data=payload_str,
                headers=headers,
                timeout=self.timeout,
            )
            self.logger.info("%s status_code=%s", path, response.status_code)

            if allow_key_refresh and self._is_avt0012_response(response):
                upload_ok, upload_result = self.upload_public_key(force=True)
                if not upload_ok:
                    return False, upload_result

                return self._post_signed_request(
                    path,
                    params=params,
                    signature_header=signature_header,
                    metadata_header=metadata_header,
                    base_url=base_url,
                    extra_fields=extra_fields,
                    allow_key_refresh=False,
                )

            return True, response
        except Exception as e:
            self.logger.warning("%s network error: %s", path, e)
            return False, f"Network error: {str(e)}"

    def _is_avt0012_response(self, response: HttpResponse) -> bool:
        if response.status_code != 400:
            return False

        try:
            parsed = response.json()
        except ValueError:
            return False

        return str(parsed.get("code") or "").upper() == "AVT0012"

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
    def _parse_device_config_api_response(
        response_json: dict[str, Any],
    ) -> tuple[bool, ApiResponseFormat[DeviceConfigDto] | str]:
        """Parse backend wrapper JSON into typed ApiResponseFormat[DeviceConfigDto]."""
        api_response = ApiResponseFormat.from_dict(response_json, details_class=DeviceConfigDto)
        if api_response.success:
            return True, api_response
        return False, api_response.message
    
    @staticmethod
    def _parse_ota_check_api_response(
        response_json: dict[str, Any],
    ) -> tuple[bool, ApiResponseFormat[OtaCheckResponseDto] | str]:
        """Parse OTA check response wrapper JSON."""
        api_response = ApiResponseFormat.from_dict(response_json, details_class=OtaCheckResponseDto)
        if api_response.success:
            return True, api_response
        return False, api_response.message

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

    def _calculate_file_sha256(self, file_path: Path) -> str:
        digest = hashlib.sha256()
        with open(file_path, "rb") as file_handle:
            while True:
                chunk = file_handle.read(8192)
                if not chunk:
                    break
                digest.update(chunk)
        return digest.hexdigest()

    def _verify_downloaded_firmware(self, file_path: Path, expected_signature: str) -> tuple[bool, str]:
        try:
            file_hash = self._calculate_file_sha256(file_path)
            
            ok, message = self.key_manager.verify_server(file_hash, expected_signature)
            
            if not ok:
                return False, message
            
            return True, "Firmware signature verified"
        except Exception as exc:
            self.logger.warning("Failed to verify downloaded firmware: %s", exc)
            return False, f"Failed to verify firmware: {str(exc)}"

    def download_and_verify_esp32_firmware(
        self,
        update_info,
        destination: Path | None = None,
    ) -> tuple[bool, str]:
        destination_path = Path(destination) if destination else APP_CONFIG.esp32_ota.firmware_file
        if not update_info or not update_info.download_url:
            return False, "Missing ESP32 firmware download URL"
        if not update_info.signature:
            return False, "Missing ESP32 firmware signature"

        temp_path = destination_path.with_suffix(destination_path.suffix + ".download")
        download_ok, download_message = self._download_binary_file(update_info.download_url, temp_path)
        if not download_ok:
            return False, download_message

        verify_ok, verify_message = self._verify_downloaded_firmware(temp_path, update_info.signature)
        if not verify_ok:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                pass
            return False, verify_message

        destination_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(temp_path), str(destination_path))
        return True, str(destination_path)

    def _device_public_key(self) -> str:
        return self.key_manager.ensure_key_pair().public_key_pem

    def ensure_device_key_uploaded_on_boot(self) -> tuple[bool, str]:
        key_pair = self.key_manager.ensure_key_pair()
        if self._public_key_uploaded or not key_pair.created_new:
            return True, "Device keypair already exists"

        upload_ok, upload_result = self.upload_public_key(force=True)
        if upload_ok:
            self._public_key_uploaded = True
        return upload_ok, upload_result

    def upload_public_key(self, force: bool = False) -> tuple[bool, str]:
        key_pair = self.key_manager.ensure_key_pair()
        if not force and self._public_key_uploaded and not key_pair.created_new:
            return True, "Device public key already uploaded"

        ok, response_or_error = self._post_signed_request(
            "upload-key",
            base_url=self.base_url,
            extra_fields={"publicKey": key_pair.public_key_pem},
            allow_key_refresh=False,
        )
        if not ok:
            return False, response_or_error

        response = response_or_error
        try:
            if not response.ok:
                return False, self._parse_error_response(response)

            self._public_key_uploaded = True
            return True, "Device public key uploaded"
        except ValueError:
            return False, "Failed to parse upload-key response"
    
    
    def activate_device(self) -> tuple[bool, ApiResponseFormat[DeviceDto] | str]:
        """Activate current device by signed MAC/timestamp payload."""
        self.logger.info("Call activate_device")

        ok, response_or_error = self._post_signed_request(
            "activate",
            extra_fields={"publicKey": self._device_public_key()},
        )
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
        
    def get_device_config(self) -> tuple[bool, ApiResponseFormat[DeviceConfigDto] | str]:
        """Fetch device config, including access token and runtime parameters."""
        self.logger.info("Call get_device_config")

        ok, response_or_error = self._post_signed_request(
            "public/devices/config",
            base_url=self.config_base_url,
        )
        if not ok:
            return False, response_or_error

        response = response_or_error
        try:
            if not response.ok:
                return False, self._parse_error_response(response)

            return self._parse_device_config_api_response(response.json())
        except ValueError:
            self.logger.warning("get_device_config parse response error")
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

        content_type, _ = mimetypes.guess_type(str(image_file))
        if not content_type:
            content_type = "image/jpeg"
            
        metadata["contentType"] = content_type
        
        ok, presigned_data = self._request_detection_presigned_url(
            metadata=metadata,
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
            metadata=metadata,
        )
        if not ok:
            return False, confirm_result

        return True, confirm_result

    def _request_detection_presigned_url(
        self,
        metadata: dict,
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
        metadata: dict,
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
        
        
    def check_ota(self) -> tuple[bool, ApiResponseFormat[OtaCheckResponseDto] | str]:
        """Fetch OTA status for ESP32 and Raspberry Pi.

        Returns:
            (True, payload) when the check runs successfully.
            payload contains the parsed OTA check response.
        """
        self.logger.info("Call check_ota")

        ok, response_or_error = self._post_signed_request("public/ota/check", base_url=self.config_base_url)
        if not ok:
            return False, response_or_error

        response = response_or_error
        try:
            if not response.ok:
                return False, self._parse_error_response(response)

            ok, parsed_or_error = self._parse_ota_check_api_response(response.json())
            if not ok:
                return False, parsed_or_error

            return True, parsed_or_error
        except ValueError:
            self.logger.warning("check_ota parse response error")
            return False, "Failed to parse server response"

    def get_app_version(self) -> tuple[bool, ApiResponseFormat[OtaCheckResponseDto] | str]:
        """Backward-compatible alias for check_ota()."""
        return self.check_ota()

    def report_ota_status(self, status: str, message: str) -> tuple[bool, str]:
        """Report OTA result back to backend."""
        self.logger.info("Call report_ota_status status=%s", status)

        ok, response_or_error = self._post_signed_request(
            "public/ota/status",
            base_url=self.config_base_url,
            extra_fields={"status": status, "message": message},
        )
        if not ok:
            return False, response_or_error

        response = response_or_error
        try:
            if not response.ok:
                return False, self._parse_error_response(response)

            return True, "OTA status reported"
        except ValueError:
            return False, "Failed to parse OTA status response"
    
    def _encrypt_data(self, payload: str, is_private: bool) -> tuple[bool, str]:
        """Sign payload using RSA key and return base64 signature."""
        try:
            signature_b64 = self.key_manager.sign(payload)
            return True, signature_b64
        except FileNotFoundError as exc:
            self.logger.warning("Key file not found: %s", exc)
            return False, f"Key file not found: {str(exc)}"
        except ValueError as exc:
            self.logger.warning("Failed to read key or generate signature: %s", exc)
            return False, f"Failed to read key or generate signature: {str(exc)}"
        except Exception as exc:
            self.logger.exception("Unexpected error while signing payload: %s", exc)
            return False, f"Unexpected signing error: {str(exc)}"