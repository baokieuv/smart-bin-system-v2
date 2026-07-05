"""Backend gateway: kích hoạt thiết bị, lấy config, upload ảnh, kiểm tra OTA.
 
Mọi request outbound đều được ký HMAC. Helper ``_post_signed_request`` xử lý
việc ký, gọi HTTP, và tự refresh key khi nhận lỗi SMB0012.
"""

from __future__ import annotations
 
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


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
 
# Mã lỗi backend biểu thị key đã hết hạn → cần refresh
_ERR_CODE_STALE_KEY = "SMB0012"
 
# Mã lỗi backend biểu thị thiết bị đã được kích hoạt trước đó → không cần xử lý lỗi
_ERR_CODE_ALREADY_ACTIVATED = "SMB3009"
 
# Kích thước chunk khi stream download firmware
_DOWNLOAD_CHUNK_SIZE = 8192
 
 
# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------
 
class _ResponseParser:
    """Các phương thức parse HTTP response thành kiểu dữ liệu cụ thể.
 
    Tách ra khỏi DeviceClient để tuân thủ SRP và tăng khả năng kiểm thử.
    """
 
    @staticmethod
    def is_stale_key_error(response: HttpResponse) -> bool:
        """Trả về True nếu backend báo lỗi key hết hạn (SMB0012)."""
        if response.status_code != 400:
            return False
        try:
            return str(response.json().get("code") or "").upper() == _ERR_CODE_STALE_KEY
        except ValueError:
            return False
        
    @staticmethod
    def parse_api_response(
        response_json: dict[str, Any],
        details_class: Type[Any],
    ) -> tuple[bool, ApiResponseFormat[Any] | str]:
        """Parse JSON thành ApiResponseFormat[details_class] đã typed."""
        api_response = ApiResponseFormat.from_dict(response_json, details_class=details_class)
        return (True, api_response) if api_response.success else (False, api_response.message)
    
    @staticmethod
    def parse_error_response(response: HttpResponse) -> dict:
        """Trích xuất code / message / traceId từ response lỗi."""
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
        
    @staticmethod
    def handle_typed_response(
        path: str,
        response: HttpResponse,
        details_class: Type[Any],
        logger: logging.Logger,
    ) -> tuple[bool, Any]:
        """Parse response thành ApiResponseFormat có kiểu; log và trả lỗi nếu cần."""
        try:
            if not response.ok:
                return False, _ResponseParser.parse_error_response(response)
            return _ResponseParser.parse_api_response(response.json(), details_class)
        except ValueError:
            logger.warning("%s: failed to parse response", path)
            return False, "Failed to parse server response"

class DeviceClient:
    """Backend gateway: kích hoạt thiết bị, lấy config, upload ảnh, kiểm tra OTA.
 
    Responsibilities:
    - Ký mọi outbound request bằng HMAC (qua DeviceKeyManager).
    - Dispatch HTTP và xử lý các pattern lặp lại (key refresh, error parse).
    - Cung cấp API rõ ràng, không để caller biết về giao thức ký.
    """

    def __init__(
        self,
        http_client: HttpClient | None = None,
        actuator_client: ActuatorRepository | None = None,
    ) -> None:
        self.logger = logging.getLogger("smart_bin.device_repository")
        self._base_url = f"{APP_CONFIG.api.api_base_url}/devices/public"
        self._config_base_url = f"{APP_CONFIG.api.api_base_url}/configs"
        self._timeout = APP_CONFIG.api.request_timeout_seconds
 
        self._key_manager = DeviceKeyManager(APP_CONFIG.paths.devices_key_dir, self.logger)
        self._actuator_client = actuator_client
        self._http = http_client or RequestsHttpClient()

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    @staticmethod
    def get_mac_address() -> str:
        """Trả về địa chỉ MAC của thiết bị (dạng chuỗi AA:BB:CC:DD:EE:FF)."""
        
        # uuid.getnode() returns host MAC as integer; normalize to AA:BB:CC:DD:EE:FF.
        # mac_num = hex(uuid.getnode()).replace('0x', '').zfill(12).upper()
        # return ':'.join(mac_num[i: i + 2] for i in range(0, 11, 2))
       
        return "6C:BE:C6:D7:2B:7A"

    def get_claim_code(self) -> str:
        """Trả về mã claim ngắn (6 ký tự) hiển thị trên màn hình device-link."""
        return self._key_manager.ensure_claim_code(self.get_mac_address())

    # ------------------------------------------------------------------
    # Request signing helpers
    # ------------------------------------------------------------------

    def _build_signed_headers(
        self,
        extra_fields: dict[str, Any] | None = None,
        signature_header: str = "X-Signature",
        metadata_header: str | None = None,
    ) -> tuple[bool, str, str, dict[str, str]]:
        """Tạo payload JSON có chữ ký và headers tương ứng.
 
        Returns:
            (ok, payload_str, sig_or_err, headers_dict)
        """
        mac = self.get_mac_address()
        payload_dict: dict[str, Any] = {"mac": mac, "timestamp": int(time.time() * 1000)}
        if extra_fields:
            payload_dict.update(extra_fields)
            
        # JSON compact để đảm bảo chữ ký byte-for-byte nhất quán
        payload_str = json.dumps(payload_dict, separators=(",", ":"))
 
        try:
            signature = self._key_manager.sign(payload_str, mac)
        except FileNotFoundError as exc:
            return False, payload_str, f"Key file not found: {exc}", {}
        except Exception as exc:
            self.logger.exception("Signing failed")
            return False, payload_str, f"Signing error: {exc}", {}
 
        headers: dict[str, str] = {
            signature_header: signature,
            "Content-Type": "application/json",
        }
        if metadata_header is not None:
            headers["metadata"] = metadata_header
            
        from src.services.runtime_versions import RUNTIME_VERSIONS
        if ai_ver := RUNTIME_VERSIONS.get_ai_version():
            headers["X-AI-Version"] = ai_ver
        if bin_ver := RUNTIME_VERSIONS.get_bin_version():
            headers["X-Bin-Version"] = bin_ver
 
        return True, payload_str, signature, headers
    
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
        """Ký và POST đến ``path``; tự động refresh key nếu nhận SMB0012.
 
        ``allow_key_refresh=False`` khi gọi đệ quy để tránh vòng lặp vô tận.
        """
        ok, payload_str, sig_or_err, headers = self._build_signed_headers(
            extra_fields, signature_header, metadata_header
        )
        
        if not ok:
            return False, sig_or_err
 
        url = f"{base_url or self._base_url}/{path}"
        try:
            response = self._http.post(
                url, params=params, data=payload_str, headers=headers, timeout=self._timeout
            )
            self.logger.info("POST %s → %d", path, response.status_code)
        except Exception as exc:
            self.logger.warning("Network error [%s]: %s", path, exc)
            return False, f"Network error: {exc}"
        
        # Transparent key refresh khi key hết hạn
        if allow_key_refresh and _ResponseParser.is_stale_key_error(response):
            self.logger.info("Stale key detected (%s), refreshing via activate", path)
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
    # Public API — Device lifecycle
    # ------------------------------------------------------------------
 
    def activate_device(self) -> tuple[bool, ApiResponseFormat[DeviceDto] | str]:
        """Kích hoạt thiết bị: gửi MAC + metadata phần cứng + tenant identifiers."""
        self.logger.info("activate_device called")
 
        hw_ok, hw_meta_or_err = self._get_hardware_metadata(timeout=5.0)
        if not hw_ok:
            return False, hw_meta_or_err
 
        ok, response_or_err = self._post_signed_request(
            "activate",
            extra_fields={
                "mac": self.get_mac_address(),
                "tenantSecret": APP_CONFIG.backend.tenant_secret,
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
                error = _ResponseParser.parse_error_response(response)
                # SMB3009 = đã kích hoạt rồi → coi như thành công
                if isinstance(error, dict) and str(error.get("code") or "").upper() == _ERR_CODE_ALREADY_ACTIVATED:
                    return True, "Device already activated"
                return False, error
            return _ResponseParser.parse_api_response(response.json(), DeviceDto)
        except ValueError:
            self.logger.warning("activate_device: failed to parse response")
            return False, "Failed to parse server response"
        
    def get_device_config(self) -> tuple[bool, ApiResponseFormat[DeviceConfigDto] | str]:
        """Lấy config runtime: access token, polling interval, ngưỡng đầy."""
        self.logger.info("get_device_config called")
        ok, response_or_err = self._post_signed_request(
            "public/devices/config", base_url=self._config_base_url
        )
        if not ok:
            return False, response_or_err
        return _ResponseParser.handle_typed_response(
            "get_device_config", response_or_err, DeviceConfigDto, self.logger
        )
        
    # ------------------------------------------------------------------
    # Public API — Detection upload (presigned-URL workflow)
    # ------------------------------------------------------------------
 
    def send_report_classification(
        self, image_path: str, metadata: dict
    ) -> tuple[bool, Any]:
        """Upload một ảnh detection qua workflow 3 bước: presigned URL → upload → confirm."""
        image_file = Path(image_path)
        if not image_file.exists():
            return False, f"Image file not found: {image_path}"
 
        content_type = mimetypes.guess_type(str(image_file))[0] or "image/jpeg"
        # Không mutate dict của caller
        enriched_metadata = {**metadata, "contentType": content_type}
 
        ok, presigned = self._request_presigned_url(enriched_metadata)
        if not ok:
            return False, presigned
    
        ok, upload_info = self._upload_via_presigned_url(str(image_file), presigned, content_type)
        if not ok:
            return False, upload_info
 
        return self._confirm_upload(enriched_metadata)
    
    def _request_presigned_url(self, metadata: dict) -> tuple[bool, dict | str]:
        """Bước 1: Yêu cầu backend cấp presigned URL để upload ảnh."""
        metadata_json = json.dumps(metadata, separators=(",", ":"))
        ok, response_or_err = self._post_signed_request("presigned-url", metadata_header=metadata_json)
        if not ok:
            return False, response_or_err
 
        response = response_or_err
        try:
            if not response.ok:
                return False, _ResponseParser.parse_error_response(response)
            data = response.json().get("data")
            if isinstance(data, str):
                return True, {"presignedUrl": data, "method": "PUT"}
            return False, "Invalid presigned URL response format"
        except ValueError:
            return False, "Failed to parse presigned URL response"
        
    def _upload_via_presigned_url(
        self, image_path: str, presigned_data: dict, content_type: str
    ) -> tuple[bool, dict | str]:
        """Bước 2: Upload file ảnh trực tiếp lên storage qua presigned URL (PUT hoặc POST)."""
        presigned_url = presigned_data.get("presignedUrl") or presigned_data.get("url")
        if not presigned_url:
            return False, "Backend did not return presignedUrl"
 
        method = str(presigned_data.get("method") or "PUT").upper()
        headers = {str(k): str(v) for k, v in (presigned_data.get("headers") or {}).items()}
        headers.setdefault("Content-Type", content_type)
 
        try:
            with open(image_path, "rb") as fh:
                response = self._dispatch_file_upload(
                    method, presigned_url, fh, image_path, content_type, presigned_data, headers
                )
        except OSError as exc:
            self.logger.warning("Failed to read image file: %s", exc)
            return False, f"Failed to read image file: {exc}"
        except Exception as exc:
            self.logger.warning("Upload network error: %s", exc)
            return False, f"Failed to upload image: {exc}"
        
        self.logger.info("Upload status=%d file=%s", response.status_code, image_path)
        response.raise_for_status()
        return True, {
            "statusCode": response.status_code,
            "etag": response.headers.get("ETag") or response.headers.get("etag"),
            "requestId": response.headers.get("x-amz-request-id"),
        }
        
    def _dispatch_file_upload(
        self,
        method: str,
        url: str,
        file_handle: Any,
        image_path: str,
        content_type: str,
        presigned_data: dict,
        headers: dict,
    ) -> HttpResponse:
        """Chọn POST (multipart) hoặc PUT (binary stream) dựa trên method của presigned URL."""
        if method == "POST":
            fields = presigned_data.get("fields") or {}
            return self._http.post(
                url,
                data=fields,
                files={"file": (Path(image_path).name, file_handle, content_type)},
                headers=headers,
                timeout=self._timeout,
            )
        return self._http.put(url, data=file_handle, headers=headers, timeout=self._timeout)
    
    def _confirm_upload(self, metadata: dict) -> tuple[bool, dict | str]:
        """Bước 3: Thông báo backend rằng upload đã hoàn tất."""
        metadata_json = json.dumps(metadata, separators=(",", ":"))
        ok, response_or_err = self._post_signed_request("confirm-upload", metadata_header=metadata_json)
        if not ok:
            return False, response_or_err
 
        response = response_or_err
        try:
            if not response.ok:
                return False, _ResponseParser.parse_error_response(response)
            return True, response.json()
        except ValueError:
            return False, "Failed to parse upload confirmation response"
        
        
    # ------------------------------------------------------------------
    # Public API — OTA
    # ------------------------------------------------------------------
 
    def check_ota(self) -> tuple[bool, ApiResponseFormat[OtaCheckResponseDto] | str]:
        """Kiểm tra xem có bản firmware mới cho ESP32 / Raspberry Pi không."""
        self.logger.info("check_ota called")
        ok, response_or_err = self._post_signed_request(
            "public/ota/check", base_url=self._config_base_url
        )
        if not ok:
            return False, response_or_err
        return _ResponseParser.handle_typed_response(
            "check_ota", response_or_err, OtaCheckResponseDto, self.logger
        )
        
    def download_and_verify_esp32_firmware(self, update_info, destination: Path | None = None) -> tuple[bool, str]:
        dest = Path(destination) if destination else APP_CONFIG.esp32_ota.firmware_file
        return self._download_and_verify_firmware_generic(update_info, dest, "ESP32")
    
    def download_and_verify_ai_model(self, update_info, destination: Path | None = None) -> tuple[bool, str]:
        dest = Path(destination) if destination else APP_CONFIG.paths.trash_model_path
        return self._download_and_verify_firmware_generic(update_info, dest, "AI_MODEL")
        
    # def download_and_verify_esp32_firmware(
    #     self, update_info, destination: Path | None = None
    # ) -> tuple[bool, str]:
    #     """Download firmware từ URL và xác minh chữ ký RSA trước khi lưu.
 
    #     File tạm được dùng trong quá trình download, chỉ replace file đích
    #     khi xác minh chữ ký thành công (atomic-ish swap).
    #     """
    #     destination_path = Path(destination) if destination else APP_CONFIG.esp32_ota.firmware_file
    #     if not update_info or not update_info.download_url:
    #         return False, "Missing ESP32 firmware download URL"
    #     if not update_info.signature:
    #         return False, "Missing ESP32 firmware signature"
 
    #     temp_path = destination_path.with_suffix(destination_path.suffix + ".download")
    #     ok, msg = self._download_binary_file(update_info.download_url, temp_path)
    #     if not ok:
    #         return False, msg
        
    #     ok, msg = self._verify_firmware_signature(temp_path, update_info.signature)
    #     if not ok:
    #         temp_path.unlink(missing_ok=True)
    #         return False, msg
 
    #     destination_path.parent.mkdir(parents=True, exist_ok=True)
    #     shutil.move(str(temp_path), str(destination_path))
    #     return True, str(destination_path)    
    
    def report_ota_status(self, status: str, message: str, fw_type: str | None = None) -> tuple[bool, str]:
        self.logger.info("report_ota_status: status=%s fwType=%s", status, fw_type)
        
        extra_fields = {"status": status, "message": message}
        if fw_type:
            extra_fields["fwType"] = fw_type

        ok, response_or_err = self._post_signed_request(
            "public/ota/status",
            base_url=self._config_base_url,
            extra_fields=extra_fields,
        )
        if not ok:
            return False, response_or_err
        response = response_or_err
        try:
            return (True, "OTA status reported") if response.ok else (False, _ResponseParser.parse_error_response(response))
        except ValueError:
            return False, "Failed to parse OTA status response"

    # ------------------------------------------------------------------
    # File helpers
    # ------------------------------------------------------------------
    def _download_and_verify_firmware_generic(
        self, update_info, destination: Path, fw_name: str
    ) -> tuple[bool, str]:
        if not update_info or not update_info.download_url:
            return False, f"Missing {fw_name} download URL"
        if not update_info.signature:
            return False, f"Missing {fw_name} signature"
 
        temp_path = destination.with_suffix(destination.suffix + ".download")
        ok, msg = self._download_binary_file(update_info.download_url, temp_path)
        if not ok:
            return False, msg
        
        ok, msg = self._verify_firmware_signature(temp_path, update_info.signature)
        if not ok:
            temp_path.unlink(missing_ok=True)
            return False, msg
 
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(temp_path), str(destination))
        return True, str(destination)

    def _download_binary_file(self, url: str, destination: Path) -> tuple[bool, str]:
        """Stream download URL vào file đích theo từng chunk."""
        try:
            destination.parent.mkdir(parents=True, exist_ok=True)
            response = self._http.get(url, timeout=self._timeout, stream=True)
            self.logger.info("download_binary status=%d url=%s", response.status_code, url)
            response.raise_for_status()
            with open(destination, "wb") as fh:
                for chunk in response.iter_content(chunk_size=_DOWNLOAD_CHUNK_SIZE):
                    if chunk:
                        fh.write(chunk)
            return True, str(destination)
        except Exception as exc:
            self.logger.warning("Download failed: %s", exc)
            return False, f"Failed to download: {exc}"

    def _calculate_file_sha256(self, file_path: Path) -> str:
        """Tính SHA-256 của file bằng cách đọc từng chunk (tiết kiệm RAM)."""
        digest = hashlib.sha256()
        with open(file_path, "rb") as fh:
            for chunk in iter(lambda: fh.read(_DOWNLOAD_CHUNK_SIZE), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _verify_firmware_signature(self, file_path: Path, expected_signature: str) -> tuple[bool, str]:
        """Xác minh chữ ký RSA của firmware bằng public key server."""
        try:
            file_hash = self._calculate_file_sha256(file_path)
            ok, message = self._key_manager.verify_server(file_hash, expected_signature)
            return (True, "Firmware signature verified") if ok else (False, message)
        except Exception as exc:
            self.logger.warning("Firmware verification failed: %s", exc)
            return False, f"Verification failed: {exc}"

    # ------------------------------------------------------------------
    # Hardware metadata
    # ------------------------------------------------------------------

    def _get_hardware_metadata(self, timeout: float | None = None) -> tuple[bool, dict[str, Any] | str]:
        """Đọc thông tin phần cứng từ ESP32 qua actuator client.
 
        Trả về dict placeholder khi chưa có actuator client thực (dev mode).
        """
        if self._actuator_client is None:
            return False, "Actuator client is not configured"
        
        # TODO: bỏ comment dưới khi phần cứng thực sẵn sàng
        # ok, info = self._actuator_client.get_system_info(timeout=timeout)
        # if not ok or info is None:
        #     return False, "Failed to read hardware metadata from ESP32"
        # return True, {
        #     "chipModel": info.chip_model, "chipName": info.chip_name,
        #     "cores": info.cores, "flashSizeBytes": info.flash_size_bytes,
        #     "totalRamBytes": info.total_ram_bytes,
        # }
        return True, {
            "chipModel": "6",
            "chipName": "esp32s3",
            "cores": "2",
            "flashSizeBytes": "20000",
            "totalRamBytes": "20000",
        }