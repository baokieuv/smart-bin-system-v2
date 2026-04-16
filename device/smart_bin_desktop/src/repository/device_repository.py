import base64
import uuid
import json
import time
import logging
from pathlib import Path

import requests
from src.models.api_response import ApiResponseFormat
from src.models.device_dto import DeviceDto
from src.utils.config import APP_CONFIG
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_private_key


class DeviceClient:
    def __init__(self):
        self.logger = logging.getLogger("smart_bin.device_repository")
        self.base_url = APP_CONFIG.api.device_base_url
        self.timeout = APP_CONFIG.api.request_timeout_seconds
        self.private_key_path = APP_CONFIG.paths.private_key_path

    @staticmethod
    def get_mac_address() -> str:
        # uuid.getnode() returns host MAC as integer; normalize to AA:BB:CC:DD:EE:FF.
        mac_num = hex(uuid.getnode()).replace('0x', '').zfill(12).upper()
        return ':'.join(mac_num[i: i + 2] for i in range(0, 11, 2))
        
    def _generate_payload_and_signature(self) -> tuple[bool, str, str]:
        """
        Tạo payload JSON (chứa mac và timestamp) và ký payload đó.
        Trả về: (success, payload_string, signature_string)
        """
        mac = self.get_mac_address()
        timestamp = int(time.time() * 1000)  # Lấy timestamp hiện tại (milliseconds)
        
        # Tạo dict payload
        payload_dict = {
            "mac": mac,
            "timestamp": timestamp
        }
        
        # Compact JSON string ensures signature consistency with server-side verification.
        payload_str = json.dumps(payload_dict, separators=(',', ':'))
        
        # Ký chuỗi payload JSON này
        ok, signature_or_error = self._encrypt_data(payload_str)
        
        return ok, payload_str, signature_or_error

    def activate_device(self) -> tuple[bool, ApiResponseFormat[DeviceDto] | str]:
        url = f"{self.base_url}/activate"
        self.logger.info("Call activate_device")
        
        ok, payload_str, signature_or_error = self._generate_payload_and_signature()
        if not ok:
            return False, signature_or_error
        
        # Gửi header X-Signature và Content-Type là application/json vì body bây giờ là JSON
        # TODO check lại xem là text hay json
        headers = {"X-Signature": signature_or_error, "Content-Type": "application/json"}
        
        try:
            response = requests.post(url, data=payload_str, headers=headers, timeout=self.timeout)
            self.logger.info("activate_device status_code=%s", response.status_code)
            if not response.ok:
                return False, self._parse_error_response(response)
            
            json_data = response.json()
            api_response = ApiResponseFormat.from_dict(json_data, details_class=DeviceDto)
            
            if api_response.success:
                return True, api_response
            else:
                return False, api_response.message
        except requests.exceptions.RequestException as e:
            self.logger.warning("activate_device network error: %s", e)
            return False, f"Lỗi Network: {str(e)}"
        except ValueError:
            self.logger.warning("activate_device parse response error")
            return False, "Lỗi parse response từ server"
        
    def get_access_token(self) -> tuple[bool, ApiResponseFormat[DeviceDto] | str]:
        url = f"{self.base_url}/get-access-token"
        self.logger.info("Call get_access_token")
        
        ok, payload_str, signature_or_error = self._generate_payload_and_signature()
        if not ok:
            return False, signature_or_error
        
        headers = {"X-Signature": signature_or_error, "Content-Type": "application/json"}
        
        try:
            response = requests.post(url, data=payload_str, headers=headers, timeout=self.timeout)
            self.logger.info("get_access_token status_code=%s", response.status_code)
            if not response.ok:
                return False, self._parse_error_response(response)
            
            json_data = response.json()
            api_response = ApiResponseFormat.from_dict(json_data, details_class=DeviceDto)
            
            if api_response.success:
                return True, api_response
            else:
                return False, api_response.message
        except requests.exceptions.RequestException as e:
            self.logger.warning("get_access_token network error: %s", e)
            return False, f"Lỗi Network: {str(e)}"
        except ValueError:
            self.logger.warning("get_access_token parse response error")
            return False, "Lỗi parse response từ server"

    def _parse_error_response(self, response: requests.Response) -> dict:
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
             
    def send_report_classification(self, image_path: str, metadata: dict) -> tuple[bool, any]:
        """
        Luồng gửi 1 ảnh detection:
        1) Gọi backend lấy presigned URL (kèm metadata)
        2) Upload ảnh lên MinIO bằng presigned URL
        3) Gọi backend xác nhận upload thành công
        """
        image_file = Path(image_path)
        if not image_file.exists():
            return False, f"Không tìm thấy file ảnh: {image_path}"

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
        url = f"{self.base_url}/get-presigned-url"
        ok, payload_str, signature_or_error = self._generate_payload_and_signature()
        if not ok:
            return False, signature_or_error

        # Truyền metadata qua URL Params 
        params = {"metadata": json.dumps(metadata)}
        
        headers = {
            "X-Signature": signature_or_error,
            "Content-Type": "application/json",
        }

        try:
            # Dùng data=payload_str để giữ nguyên vẹn chuỗi JSON đã ký
            response = requests.post(url, params=params, data=payload_str, headers=headers, timeout=self.timeout)
            self.logger.info("request_presigned_url status_code=%s file=%s", response.status_code, filename)
            
            if not response.ok:
                return False, self._parse_error_response(response)

            json_data = response.json()
            data = json_data.get("data")
            
            if isinstance(data, str):
                # Bọc lại thành dict để hàm _upload_file_via_presigned_url dùng được
                return True, {"presignedUrl": data, "method": "PUT"}
                
            return False, "Response presigned URL khong hop le (khong phai string)"
            
        except requests.exceptions.RequestException as e:
            return False, f"Lỗi Network khi lấy presigned URL: {str(e)}"
        except ValueError:
            return False, "Lỗi parse response khi lấy presigned URL"

    def _upload_file_via_presigned_url(
        self,
        image_path: str,
        presigned_data: dict,
        content_type: str,
    ) -> tuple[bool, dict | str]:
        presigned_url = presigned_data.get("presignedUrl") or presigned_data.get("url")
        if not presigned_url:
            return False, "Backend khong tra ve presignedUrl"

        method = str(presigned_data.get("method") or "PUT").upper()
        upload_headers = presigned_data.get("headers") if isinstance(presigned_data.get("headers"), dict) else {}
        upload_headers = {str(k): str(v) for k, v in upload_headers.items()}
        upload_headers.setdefault("Content-Type", content_type)

        try:
            with open(image_path, "rb") as f:
                if method == "POST":
                    fields = presigned_data.get("fields") if isinstance(presigned_data.get("fields"), dict) else {}
                    files = {"file": (Path(image_path).name, f, content_type)}
                    response = requests.post(
                        presigned_url,
                        data=fields,
                        files=files,
                        headers=upload_headers,
                        timeout=self.timeout,
                    )
                else:
                    response = requests.put(
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
        except requests.exceptions.RequestException as e:
            self.logger.warning("upload_presigned_url network error: %s", e)
            return False, f"Lỗi upload ảnh qua presigned URL: {str(e)}"
        except OSError as e:
            self.logger.warning("upload_presigned_url read file error: %s", e)
            return False, f"Lỗi đọc file ảnh: {str(e)}"

    def _confirm_detection_upload(
        self,
        filename: str,
        metadata: dict,
        presigned_data: dict,
        upload_info: dict,
    ) -> tuple[bool, dict | str]:
        url = f"{self.base_url}/confirm-upload"
        ok, payload_str, signature_or_error = self._generate_payload_and_signature()
        if not ok:
            return False, signature_or_error

        params = {"metadata": json.dumps(metadata)}
        
        headers = {
            "X-Signature": signature_or_error,
            "Content-Type": "application/json",
        }

        try:
            # Vẫn dùng data=payload_str để backend verify chữ ký thành công
            response = requests.post(url, params=params, data=payload_str, headers=headers, timeout=self.timeout)
            self.logger.info("confirm_upload status_code=%s file=%s", response.status_code, filename)
            
            if not response.ok:
                return False, self._parse_error_response(response)

            return True, response.json()
            
        except requests.exceptions.RequestException as e:
            return False, f"Lỗi Network khi xác nhận upload: {str(e)}"
        except ValueError:
            return False, "Lỗi parse response khi xác nhận upload"
        
    def _encrypt_data(self, payload: str) -> tuple[bool, str]:
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
            self.logger.warning("Khong tim thay private key: %s", self.private_key_path)
            return False, f"Lỗi: Không tìm thấy file private_key.pem tại {self.private_key_path}"
        except ValueError as e:
            self.logger.warning("Loi doc key/tao chu ky: %s", e)
            return False, f"Lỗi đọc Key/Tạo chữ ký: {str(e)}"
        except Exception as e:
            self.logger.exception("Loi khong xac dinh khi ky payload: %s", e)
            return False, f"Lỗi không xác định: {str(e)}"