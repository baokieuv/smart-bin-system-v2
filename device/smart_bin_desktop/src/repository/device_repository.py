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
             
    def send_report_classification(self, file_paths: list[str], metadata_list: list[dict]) -> tuple[bool, any]:
        """
        Gửi kết quả nhận diện (ảnh + thông tin) lên server bằng multipart/form-data
        """
        url = f"{self.base_url}/upload-detection-result"
        self.logger.info("Call send_report_classification with files=%s", len(file_paths))
        
        ok, payload_str, signature_or_error = self._generate_payload_and_signature()
        if not ok:
            return False, signature_or_error

        headers = {"X-Signature": signature_or_error}
        
        # Keep track of opened files so they are always closed in finally.
        files_to_send = []
        opened_files = []
        
        try:
            for file_path in file_paths:
                path_obj = Path(file_path)
                f = open(path_obj, 'rb')
                opened_files.append(f)
                # Tuple format của requests: (field_name, (filename, file_object, content_type))
                files_to_send.append(('files', (path_obj.name, f, 'image/jpeg'))) 
            
            # Gửi metadata và payload dưới dạng Text fields trong form-data
            data_to_send = {
                'metadata': json.dumps(metadata_list),
                'payload': payload_str
            }
            
            response = requests.post(url, files=files_to_send, data=data_to_send, headers=headers, timeout=self.timeout)
            self.logger.info("send_report_classification status_code=%s", response.status_code)
            response.raise_for_status()
            
            json_data = response.json()
            return True, json_data
            
        except FileNotFoundError as e:
            self.logger.warning("send_report_classification file not found: %s", e)
            return False, f"Không tìm thấy file ảnh: {str(e)}"
        except requests.exceptions.RequestException as e:
            self.logger.warning("send_report_classification network error: %s", e)
            return False, f"Lỗi Network: {str(e)}"
        finally:
            # Luôn đảm bảo đóng file sau khi request chạy xong
            for f in opened_files:
                f.close()
        
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