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

_DEVICE_SUFFIX = "SMART_BIN_DEVICE"
_CLAIM_CODE_SUFFIX = "SMART_BIN_USER"


class DeviceKeyManager:
    """Create and manage the per-device HMAC secret used in signed requests.

    The master secret is persisted in a local file.  A runtime secret is
    derived from it combined with the device MAC address so different devices
    never share the same signing key, even if the master file is copied.
    """

    def __init__(self, key_dir: Path, logger: logging.Logger) -> None:
        self.key_dir = key_dir
        self.logger = logger
        self.master_secret_path = self.key_dir / "device_master_secret.txt"
        self.public_server_key_path = APP_CONFIG.paths.public_server_key_path
        self.key_dir.mkdir(parents=True, exist_ok=True)

        # Cache derived secret to avoid re-computing on every request.
        self._cached_mac: str | None = None
        self._cached_secret: str | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def ensure_runtime_secret(self, mac_address: str) -> str:
        """Return the derived HMAC secret for *mac_address*, using cache when possible."""
        if self._cached_secret and self._cached_mac == mac_address:
            return self._cached_secret

        derived = self._derive_secret(mac_address, _DEVICE_SUFFIX)
        self._cached_mac = mac_address
        self._cached_secret = derived
        return derived

    def ensure_claim_code(self, mac_address: str) -> str:
        """Return the 6-character claim code derived from *mac_address*."""
        derived = self._derive_secret(mac_address, _CLAIM_CODE_SUFFIX)
        return derived[:6]

    def sign(self, payload: str, mac_address: str) -> str:
        """Return a base64-encoded HMAC-SHA256 signature over *payload*."""
        secret = self.ensure_runtime_secret(mac_address)
        raw = self._hmac_bytes(secret.encode(), payload.encode())
        return base64.b64encode(raw).decode()

    def verify_server(self, payload: str, signature_b64: str) -> tuple[bool, str]:
        """Verify an RSA-PKCS1v15-SHA256 server signature over *payload*."""
        try:
            with open(self.public_server_key_path, "rb") as fh:
                public_key = load_pem_public_key(fh.read())
            public_key.verify(
                base64.b64decode(signature_b64),
                payload.encode(),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )
            return True, "Signature is valid"
        except FileNotFoundError as exc:
            self.logger.warning("Public key file not found: %s", exc)
            return False, str(exc)
        except Exception as exc:
            self.logger.exception("Server signature verification failed")
            return False, str(exc)

    # ------------------------------------------------------------------
    # HMAC helpers
    # ------------------------------------------------------------------

    def _derive_secret(self, mac_address: str, suffix: str) -> str:
        master = self._load_or_create_master_secret()
        return self._hmac_base64(master.encode(), f"{mac_address}{suffix}".encode())

    @staticmethod
    def _hmac_bytes(key: bytes, msg: bytes) -> bytes:
        return hmac.new(key, msg, hashlib.sha256).digest()

    @staticmethod
    def _hmac_hex(key: bytes, msg: bytes) -> str:
        return hmac.new(key, msg, hashlib.sha256).hexdigest()
    
    @staticmethod
    def _hmac_base64(key: bytes, msg: bytes) -> str:
        raw_hmac = hmac.new(key, msg, hashlib.sha256).digest()
        return base64.b64encode(raw_hmac).decode('utf-8')

    # ------------------------------------------------------------------
    # Master secret management
    # ------------------------------------------------------------------

    def _load_or_create_master_secret(self) -> str:
        if self.master_secret_path.exists():
            try:
                secret = self.master_secret_path.read_text(encoding="utf-8").strip()
                if secret:
                    return secret
                self.logger.warning("Empty master secret in %s; regenerating", self.master_secret_path)
            except OSError as exc:
                self.logger.warning("Cannot read master secret from %s: %s", self.master_secret_path, exc)

        new_secret = secrets.token_hex(32)
        try:
            self.master_secret_path.write_text(new_secret, encoding="utf-8")
            self.logger.info("Generated new master secret: %s", self.master_secret_path)
        except OSError as exc:
            self.logger.warning("Failed to persist master secret: %s", exc)
        return new_secret