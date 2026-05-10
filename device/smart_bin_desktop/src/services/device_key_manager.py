from __future__ import annotations

import base64
import logging
from dataclasses import dataclass
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.serialization import load_pem_private_key, load_pem_public_key
from src.utils.config import APP_CONFIG


@dataclass(frozen=True)
class DeviceKeyPair:
    private_key_pem: str
    public_key_pem: str
    created_new: bool


class DeviceKeyManager:
    """Create and manage the per-device RSA keypair used by signed desktop requests."""

    def __init__(self, key_dir: Path, logger: logging.Logger):
        self.key_dir = key_dir
        self.private_key_path = self.key_dir / "private_key.pem"
        self.public_key_path = self.key_dir / "public_key.pem"
        self.public_server_key_path = APP_CONFIG.paths.public_server_key_path
        self.logger = logger
        self.key_dir.mkdir(parents=True, exist_ok=True)
        self._key_pair: DeviceKeyPair | None = None

    def ensure_key_pair(self) -> DeviceKeyPair:
        if self._key_pair is not None:
            return self._key_pair

        private_key_pem, public_key_pem, created_new = self._load_or_generate_key_pair()
        self._key_pair = DeviceKeyPair(
            private_key_pem=private_key_pem,
            public_key_pem=public_key_pem,
            created_new=created_new,
        )
        return self._key_pair

    def sign(self, payload: str) -> str:
        key_pair = self.ensure_key_pair()
        private_key = load_pem_private_key(key_pair.private_key_pem.encode("utf-8"), password=None)
        signature = private_key.sign(
            payload.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
        return base64.b64encode(signature).decode("utf-8")

    def verify_server(self, payload: str, signature_b64: str) -> str:
        try:
            with open(self.public_server_key_path, "rb") as key_file:
                key_data = load_pem_public_key(
                    key_file.read()
                )
                
            signature = base64.b64decode(signature_b64)

            key_data.verify(
                signature,
                payload.encode("utf-8"),
                padding.PKCS1v15(),
                hashes.SHA256()
            )

            return True, "Signature is valid"   
        except FileNotFoundError as e:
            self.logger.warning("Key file not found: %s", e)
            return False, str(e)

        except Exception as e:
            self.logger.exception("Crypto operation failed: %s", e)
            return False, str(e)
            
        
    def _load_or_generate_key_pair(self) -> tuple[str, str, bool]:
        if self.private_key_path.exists() and self.public_key_path.exists():
            try:
                private_key_pem = self.private_key_path.read_text(encoding="utf-8")
                public_key_pem = self.public_key_path.read_text(encoding="utf-8")
                load_pem_private_key(private_key_pem.encode("utf-8"), password=None)
                return private_key_pem, public_key_pem, False
            except Exception as exc:
                self.logger.warning("Invalid device keypair found in %s: %s", self.key_dir, exc)

        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private_key_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        ).decode("utf-8")
        public_key_pem = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode("utf-8")

        self.private_key_path.write_text(private_key_pem, encoding="utf-8")
        self.public_key_path.write_text(public_key_pem, encoding="utf-8")
        self.logger.info("Generated new device keypair in %s", self.key_dir)
        return private_key_pem, public_key_pem, True