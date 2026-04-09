import base64
import uuid
from pathlib import Path

import requests
from src.models.api_response import ApiResponseFormat
from src.models.device_dto import DeviceDto
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_private_key


class DeviceClient:
    def __init__(self):
        self.base_url = "https://api.kvbhust.id.vn/api/v1/devices"
        self.timeout = 10
        self.private_key_path = Path(__file__).resolve().parent.parent.parent / "key" / "private_key.pem"
        
    def activate_device(self) -> tuple[bool, ApiResponseFormat[DeviceDto] | str]:
        url = f"{self.base_url}/activate"
        
        mac_num = hex(uuid.getnode()).replace('0x', '').zfill(12).upper()
        mac = ':'.join(mac_num[i: i + 2] for i in range(0, 11, 2))
        ok, signature_or_error = self._encrypt_data(mac)
        if not ok:
            return False, signature_or_error
        
        headers = {"X-Signature": signature_or_error, "Content-Type": "text/plain"}
        
        try:
            response = requests.post(url, data=mac, headers=headers, timeout=self.timeout)
            response.raise_for_status()
            
            json_data = response.json()
            
            api_response = ApiResponseFormat.from_dict(json_data, details_class=DeviceDto)
            
            if api_response.success:
                return True, api_response
            else:
                return False, api_response.message
        except requests.exceptions.RequestException as e:
            return False, f"Lỗi Network: {str(e)}"
        except ValueError:
            return False, "Lỗi parse response từ server"
        
    def get_access_token(self) -> tuple[bool, ApiResponseFormat[DeviceDto] | str]:
        url = f"{self.base_url}/get-access-token"
        
        mac_num = hex(uuid.getnode()).replace('0x', '').zfill(12).upper()
        mac = ':'.join(mac_num[i: i + 2] for i in range(0, 11, 2))
        ok, signature_or_error = self._encrypt_data(mac)
        if not ok:
            return False, signature_or_error
        
        headers = {"X-Signature": signature_or_error, "Content-Type": "text/plain"}
        
        try:
            response = requests.post(url, data=mac, headers=headers, timeout=self.timeout)
            response.raise_for_status()
            
            json_data = response.json()
            
            api_response = ApiResponseFormat.from_dict(json_data, details_class=DeviceDto)
            
            if api_response.success:
                return True, api_response
            else:
                return False, api_response.message
        except requests.exceptions.RequestException as e:
            return False, f"Lỗi Network: {str(e)}"
        except ValueError:
            return False, "Lỗi parse response từ server"
             
             
    def send_report_classification(self):
        pass       
        
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
            return False, f"Lỗi: Không tìm thấy file private_key.pem tại {self.private_key_path}"
        except ValueError as e:
            return False, f"Lỗi đọc Key/Tạo chữ ký: {str(e)}"
        except Exception as e:
            return False, f"Lỗi không xác định: {str(e)}"