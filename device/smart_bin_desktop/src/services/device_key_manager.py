from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import secrets
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from src.utils.config import APP_CONFIG


class DeviceKeyManager:
    """Create and manage the per-device derived HMAC secret used by signed desktop requests."""

    def __init__(self, key_dir: Path, logger: logging.Logger):
        self.key_dir = key_dir
        self.master_secret_path = self.key_dir / "device_master_secret.txt"
        self.public_server_key_path = APP_CONFIG.paths.public_server_key_path
        self.logger = logger
        self.key_dir.mkdir(parents=True, exist_ok=True)
        self._runtime_secret_mac: str | None = None
        self._runtime_secret: str | None = None

    def ensure_runtime_secret(self, mac_address: str) -> str:
        if self._runtime_secret is not None and self._runtime_secret_mac == mac_address:
            return self._runtime_secret

        master_secret = self._load_or_create_master_secret()
        derived_secret = hmac.new(
            master_secret.encode("utf-8"),
            f"{mac_address}SMART_BIN_DEVICE".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        self._runtime_secret_mac = mac_address
        self._runtime_secret = derived_secret
        return derived_secret

    def sign(self, payload: str, mac_address: str) -> str:
        runtime_secret = self.ensure_runtime_secret(mac_address)
        signature = hmac.new(
            runtime_secret.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        return base64.b64encode(signature).decode("utf-8")

    def verify_server(self, payload: str, signature_b64: str) -> tuple[bool, str]:
        try:
            with open(self.public_server_key_path, "rb") as key_file:
                key_data = load_pem_public_key(key_file.read())

            signature = base64.b64decode(signature_b64)

            key_data.verify(
                signature,
                payload.encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )

            return True, "Signature is valid"
        except FileNotFoundError as exc:
            self.logger.warning("Key file not found: %s", exc)
            return False, str(exc)
        except Exception as exc:
            self.logger.exception("Crypto operation failed: %s", exc)
            return False, str(exc)

    def _load_or_create_master_secret(self) -> str:
        if self.master_secret_path.exists():
            try:
                secret = self.master_secret_path.read_text(encoding="utf-8").strip()
                if secret:
                    return secret
                self.logger.warning("Empty master secret found in %s", self.master_secret_path)
            except Exception as exc:
                self.logger.warning("Unable to read master secret from %s: %s", self.master_secret_path, exc)

        secret = secrets.token_hex(32)
        self.master_secret_path.write_text(secret, encoding="utf-8")
        self.logger.info("Generated new device master secret in %s", self.master_secret_path)
        return secret