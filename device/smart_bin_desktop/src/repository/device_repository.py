import hashlib
import json
import logging
import mimetypes
import shutil
import time
from pathlib import Path
from typing import Any, Type

from src.models.api_response import ApiResponseFormat
from src.models.device_config_dto import DeviceConfigDto
from src.models.device_dto import DeviceDto
from src.models.ota_check_response_dto import OtaCheckResponseDto
from src.repository.actuator_repository import ActuatorRepository
from src.repository.http_client import HttpClient, HttpResponse, RequestsHttpClient
from src.services.device_key_manager import DeviceKeyManager
from src.utils.config import APP_CONFIG


class DeviceClient:
    """Backend gateway for device activation, config fetch, and detection upload.

    All outbound requests are signed with a per-device HMAC key derived from
    the device's MAC address.  The ``_post_signed_request`` helper handles
    signing, HTTP dispatch, and transparent key-refresh on SMB0012 errors.
    """

    def __init__(
        self,
        http_client: HttpClient | None = None,
        actuator_client: ActuatorRepository | None = None,
    ) -> None:
        self.logger = logging.getLogger("smart_bin.device_repository")
        self.base_url = APP_CONFIG.api.device_base_url
        self.config_base_url = APP_CONFIG.api.config_base_url
        self.timeout = APP_CONFIG.api.request_timeout_seconds
        self.key_manager = DeviceKeyManager(APP_CONFIG.paths.devices_key_dir, self.logger)
        self.actuator_client = actuator_client
        self.http_client = http_client or RequestsHttpClient()

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    @staticmethod
    def get_mac_address() -> str:
        # uuid.getnode() returns host MAC as integer; normalize to AA:BB:CC:DD:EE:FF.
        # mac_num = hex(uuid.getnode()).replace('0x', '').zfill(12).upper()
        # return ':'.join(mac_num[i: i + 2] for i in range(0, 11, 2))
       
        return "D3:AD:C7:15:55:42"

    def get_claim_code(self) -> str:
        """Return the short claim code used by the device-link screen."""
        return self.key_manager.ensure_claim_code(self.get_mac_address())

    # ------------------------------------------------------------------
    # Request signing helpers
    # ------------------------------------------------------------------

    def _sign_payload(self, payload: str) -> tuple[bool, str]:
        """Return (ok, base64_signature_or_error)."""
        try:
            signature = self.key_manager.sign(payload, self.get_mac_address())
            return True, signature
        except FileNotFoundError as exc:
            self.logger.warning("Key file not found: %s", exc)
            return False, f"Key file not found: {exc}"
        except Exception as exc:
            self.logger.exception("Unexpected error while signing payload")
            return False, f"Signing error: {exc}"

    def _build_signed_payload(
        self, extra_fields: dict[str, Any] | None = None
    ) -> tuple[bool, str, str]:
        """Return (ok, payload_json, signature_or_error)."""
        mac = self.get_mac_address()
        payload_dict: dict[str, Any] = {"mac": mac, "timestamp": int(time.time() * 1000)}
        if extra_fields:
            payload_dict.update(extra_fields)

        # Compact JSON guarantees consistent byte-for-byte signature matching.
        payload_str = json.dumps(payload_dict, separators=(",", ":"))
        ok, sig_or_err = self._sign_payload(payload_str)
        return ok, payload_str, sig_or_err

    def _post_signed_request(
        self,
        path: str,
        *,
        base_url: str | None = None,
        extra_fields: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        signature_header: str = "X-Signature",
        metadata_header: str | None = None,
        allow_key_refresh: bool = True,
    ) -> tuple[bool, HttpResponse | str]:
        """Sign and POST to *path*; transparently refresh key on SMB0012."""
        ok, payload_str, sig_or_err = self._build_signed_payload(extra_fields)
        if not ok:
            return False, sig_or_err

        headers: dict[str, str] = {signature_header: sig_or_err, "Content-Type": "application/json"}
        if metadata_header is not None:
            headers["metadata"] = metadata_header

        url = f"{base_url or self.base_url}/{path}"
        try:
            response = self.http_client.post(
                url, params=params, data=payload_str, headers=headers, timeout=self.timeout
            )
            self.logger.info("%s status_code=%s", path, response.status_code)
        except Exception as exc:
            self.logger.warning("%s network error: %s", path, exc)
            return False, f"Network error: {exc}"

        # Transparent key refresh on SMB0012 (stale signature).
        if allow_key_refresh and self._is_SMB0012_response(response):
            activation_ok, activation_result = self.activate_device()
            if not activation_ok:
                return False, activation_result
            return self._post_signed_request(
                path,
                base_url=base_url,
                extra_fields=extra_fields,
                params=params,
                signature_header=signature_header,
                metadata_header=metadata_header,
                allow_key_refresh=False,
            )

        return True, response

    # ------------------------------------------------------------------
    # Response parsing helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _is_SMB0012_response(response: HttpResponse) -> bool:
        if response.status_code != 400:
            return False
        try:
            return str(response.json().get("code") or "").upper() == "SMB0012"
        except ValueError:
            return False

    @staticmethod
    def _parse_api_response(
        response_json: dict[str, Any],
        details_class: Type[Any],
    ) -> tuple[bool, ApiResponseFormat[Any] | str]:
        api_response = ApiResponseFormat.from_dict(response_json, details_class=details_class)
        return (True, api_response) if api_response.success else (False, api_response.message)

    def _parse_error_response(self, response: HttpResponse) -> dict:
        try:
            data = response.json()
            code = data.get("code")
            message = data.get("message") or response.text
            trace_id = data.get("traceId")
        except ValueError:
            code, message, trace_id = None, response.text, None

        return {
            "http_status": response.status_code,
            "code": str(code).upper() if code else None,
            "message": message,
            "trace_id": trace_id,
        }

    def _handle_response(
        self, path: str, response: HttpResponse, details_class: Type[Any]
    ) -> tuple[bool, Any]:
        """Parse a successful HTTP response into a typed ApiResponseFormat."""
        try:
            if not response.ok:
                return False, self._parse_error_response(response)
            return self._parse_api_response(response.json(), details_class)
        except ValueError:
            self.logger.warning("%s: failed to parse response", path)
            return False, "Failed to parse server response"

    # ------------------------------------------------------------------
    # File helpers
    # ------------------------------------------------------------------

    def _download_binary_file(self, url: str, destination: Path) -> tuple[bool, str]:
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            response = self.http_client.get(url, timeout=self.timeout, stream=True)
            self.logger.info("download_binary status_code=%s url=%s", response.status_code, url)
            response.raise_for_status()
            with open(destination, "wb") as fh:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        fh.write(chunk)
            return True, f"Saved to {destination}"
        except Exception as exc:
            self.logger.warning("Failed to download binary: %s", exc)
            return False, f"Failed to download: {exc}"

    def _calculate_file_sha256(self, file_path: Path) -> str:
        digest = hashlib.sha256()
        with open(file_path, "rb") as fh:
            for chunk in iter(lambda: fh.read(8192), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _verify_downloaded_firmware(self, file_path: Path, expected_signature: str) -> tuple[bool, str]:
        try:
            file_hash = self._calculate_file_sha256(file_path)
            ok, message = self.key_manager.verify_server(file_hash, expected_signature)
            return (True, "Firmware signature verified") if ok else (False, message)
        except Exception as exc:
            self.logger.warning("Failed to verify firmware: %s", exc)
            return False, f"Verification failed: {exc}"

    # ------------------------------------------------------------------
    # Hardware metadata
    # ------------------------------------------------------------------

    def _get_hardware_metadata(self, timeout: float | None = None) -> tuple[bool, dict[str, Any] | str]:
        if self.actuator_client is None:
            return False, "Actuator client is not configured"
        ok, info = self.actuator_client.get_system_info(timeout=timeout)
        # if not ok or info is None:
        #     return False, "Failed to read hardware metadata from ESP32"
        # return True, {
        #     "chipModel": info.chip_model,
        #     "chipName": info.chip_name,
        #     "cores": info.cores,
        #     "flashSizeBytes": info.flash_size_bytes,
        #     "totalRamBytes": info.total_ram_bytes,
        # }
        return True, {
            "chipModel": "6",
            "chipName": "esp32s3",
            "cores": "2",
            "flashSizeBytes": "20000",
            "totalRamBytes": "20000",
        }

    # ------------------------------------------------------------------
    # Public API — device lifecycle
    # ------------------------------------------------------------------

    def activate_device(self) -> tuple[bool, ApiResponseFormat[DeviceDto] | str]:
        """Activate this device using MAC, tenant identifiers, and ESP32 hardware metadata."""
        self.logger.info("Call activate_device")
        hw_ok, hw_meta_or_err = self._get_hardware_metadata(timeout=5.0)
        if not hw_ok:
            return False, hw_meta_or_err

        ok, response_or_err = self._post_signed_request(
            "activate",
            extra_fields={
                "mac": self.get_mac_address(),
                "profileCode": APP_CONFIG.backend.profile_code,
                "hwMetadata": hw_meta_or_err,
            },
            allow_key_refresh=False,
        )
        if not ok:
            return False, response_or_err

        response = response_or_err
        try:
            if not response.ok:
                error = self._parse_error_response(response)
                if isinstance(error, dict) and str(error.get("code") or "").upper() == "SMB3009":
                    return True, "Device already activated"
                return False, error
            return self._parse_api_response(response.json(), DeviceDto)
        except ValueError:
            self.logger.warning("activate_device: failed to parse response")
            return False, "Failed to parse server response"

    def get_device_config(self) -> tuple[bool, ApiResponseFormat[DeviceConfigDto] | str]:
        """Fetch runtime configuration (access token, polling interval, thresholds)."""
        self.logger.info("Call get_device_config")
        ok, response_or_err = self._post_signed_request(
            "public/devices/config", base_url=self.config_base_url
        )
        if not ok:
            return False, response_or_err
        return self._handle_response("get_device_config", response_or_err, DeviceConfigDto)

    # ------------------------------------------------------------------
    # Public API — detection upload (presigned-URL workflow)
    # ------------------------------------------------------------------

    def send_report_classification(
        self, image_path: str, metadata: dict
    ) -> tuple[bool, Any]:
        """Upload one detection image via a 3-step presigned-URL workflow.

        Steps: request presigned URL → upload image → confirm upload.
        """
        image_file = Path(image_path)
        if not image_file.exists():
            return False, f"Image file not found: {image_path}"

        content_type = mimetypes.guess_type(str(image_file))[0] or "image/jpeg"
        metadata = {**metadata, "contentType": content_type}  # don't mutate caller's dict

        ok, presigned = self._request_presigned_url(metadata)
        if not ok:
            return False, presigned

        ok, upload_info = self._upload_via_presigned_url(str(image_file), presigned, content_type)
        if not ok:
            return False, upload_info

        return self._confirm_upload(metadata)

    def _request_presigned_url(self, metadata: dict) -> tuple[bool, dict | str]:
        metadata_json = json.dumps(metadata, separators=(",", ":"))
        ok, response_or_err = self._post_signed_request(
            "presigned-url", metadata_header=metadata_json
        )
        if not ok:
            return False, response_or_err

        response = response_or_err
        try:
            if not response.ok:
                return False, self._parse_error_response(response)
            data = response.json().get("data")
            if isinstance(data, str):
                return True, {"presignedUrl": data, "method": "PUT"}
            return False, "Invalid presigned URL response format"
        except ValueError:
            return False, "Failed to parse presigned URL response"

    def _upload_via_presigned_url(
        self, image_path: str, presigned_data: dict, content_type: str
    ) -> tuple[bool, dict | str]:
        presigned_url = presigned_data.get("presignedUrl") or presigned_data.get("url")
        if not presigned_url:
            return False, "Backend did not return presignedUrl"

        method = str(presigned_data.get("method") or "PUT").upper()
        headers = {str(k): str(v) for k, v in (presigned_data.get("headers") or {}).items()}
        headers.setdefault("Content-Type", content_type)

        try:
            with open(image_path, "rb") as fh:
                if method == "POST":
                    fields = presigned_data.get("fields") or {}
                    response = self.http_client.post(
                        presigned_url,
                        data=fields,
                        files={"file": (Path(image_path).name, fh, content_type)},
                        headers=headers,
                        timeout=self.timeout,
                    )
                else:
                    response = self.http_client.put(
                        presigned_url, data=fh, headers=headers, timeout=self.timeout
                    )
        except OSError as exc:
            self.logger.warning("upload_presigned_url read error: %s", exc)
            return False, f"Failed to read image file: {exc}"
        except Exception as exc:
            self.logger.warning("upload_presigned_url network error: %s", exc)
            return False, f"Failed to upload image: {exc}"

        self.logger.info("upload_presigned_url status_code=%s file=%s", response.status_code, image_path)
        response.raise_for_status()
        return True, {
            "statusCode": response.status_code,
            "etag": response.headers.get("ETag") or response.headers.get("etag"),
            "requestId": response.headers.get("x-amz-request-id"),
        }

    def _confirm_upload(self, metadata: dict) -> tuple[bool, dict | str]:
        metadata_json = json.dumps(metadata, separators=(",", ":"))
        ok, response_or_err = self._post_signed_request(
            "confirm-upload", metadata_header=metadata_json
        )
        if not ok:
            return False, response_or_err
        response = response_or_err
        try:
            if not response.ok:
                return False, self._parse_error_response(response)
            return True, response.json()
        except ValueError:
            return False, "Failed to parse upload confirmation response"

    # ------------------------------------------------------------------
    # Public API — OTA
    # ------------------------------------------------------------------

    def download_and_verify_esp32_firmware(
        self, update_info, destination: Path | None = None
    ) -> tuple[bool, str]:
        destination_path = Path(destination) if destination else APP_CONFIG.esp32_ota.firmware_file
        if not update_info or not update_info.download_url:
            return False, "Missing ESP32 firmware download URL"
        if not update_info.signature:
            return False, "Missing ESP32 firmware signature"

        temp_path = destination_path.with_suffix(destination_path.suffix + ".download")
        ok, msg = self._download_binary_file(update_info.download_url, temp_path)
        if not ok:
            return False, msg

        ok, msg = self._verify_downloaded_firmware(temp_path, update_info.signature)
        if not ok:
            temp_path.unlink(missing_ok=True)
            return False, msg

        destination_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(temp_path), str(destination_path))
        return True, str(destination_path)

    def check_ota(self) -> tuple[bool, ApiResponseFormat[OtaCheckResponseDto] | str]:
        """Fetch OTA status for ESP32 and Raspberry Pi."""
        self.logger.info("Call check_ota")
        ok, response_or_err = self._post_signed_request(
            "public/ota/check", base_url=self.config_base_url
        )
        if not ok:
            return False, response_or_err
        return self._handle_response("check_ota", response_or_err, OtaCheckResponseDto)

    def report_ota_status(self, status: str, message: str) -> tuple[bool, str]:
        self.logger.info("Call report_ota_status status=%s", status)
        ok, response_or_err = self._post_signed_request(
            "public/ota/status",
            base_url=self.config_base_url,
            extra_fields={"status": status, "message": message},
        )
        if not ok:
            return False, response_or_err
        response = response_or_err
        try:
            return (True, "OTA status reported") if response.ok else (False, self._parse_error_response(response))
        except ValueError:
            return False, "Failed to parse OTA status response"