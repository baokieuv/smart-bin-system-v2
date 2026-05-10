from __future__ import annotations

import logging
import re
from collections.abc import Callable
from pathlib import Path

from src.utils.config import APP_CONFIG


class RuntimeVersionState:
    """Caches runtime version metadata for outbound API headers."""

    def __init__(self, cache_path: Path | None = None):
        self.logger = logging.getLogger("smart_bin.runtime_versions")
        self.cache_path = cache_path or APP_CONFIG.paths.bin_version_cache_path
        self._bin_version: str | None = None

    def set_bin_version(self, version: str | None) -> None:
        normalized = str(version).strip() if version else ""
        self._bin_version = normalized or None
        if self._bin_version:
            self._save_to_cache(self._bin_version)

    def get_bin_version(self) -> str | None:
        if self._bin_version:
            return self._bin_version

        cached = self._load_from_cache()
        if cached:
            self._bin_version = cached
            return cached

        return None

    def resolve_bin_version(
        self,
        device_version_fetcher: Callable[[], tuple[bool, str | None]] | None = None,
        firmware_file: Path | None = None,
    ) -> str | None:
        """Resolve bin version using cache, ESP32, then the local firmware binary."""
        cached = self.get_bin_version()
        if cached:
            return cached

        if device_version_fetcher:
            try:
                ok, device_version = device_version_fetcher()
                if ok and device_version:
                    self.set_bin_version(device_version)
                    return self._bin_version
            except Exception as exc:
                self.logger.warning("Failed to resolve bin version from ESP32: %s", exc)

        binary_version = self._read_version_from_bin_file(firmware_file or APP_CONFIG.esp32_ota.firmware_file)
        if binary_version:
            self.set_bin_version(binary_version)
            return self._bin_version

        return None

    def _save_to_cache(self, version: str) -> None:
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(version, encoding="utf-8")
        except OSError as exc:
            self.logger.warning("Failed to save bin version cache: %s", exc)

    def _load_from_cache(self) -> str | None:
        try:
            if not self.cache_path.exists():
                return None

            value = self.cache_path.read_text(encoding="utf-8").strip()
            return value or None
        except OSError as exc:
            self.logger.warning("Failed to load bin version cache: %s", exc)
            return None

    def _read_version_from_bin_file(self, firmware_file: Path) -> str | None:
        try:
            if not firmware_file.exists():
                return None

            binary_data = firmware_file.read_bytes()
        except OSError as exc:
            self.logger.warning("Failed to read bin version from %s: %s", firmware_file, exc)
            return None

        ascii_text = binary_data.decode("latin-1", errors="ignore")
        printable_chunks = re.findall(r"[ -~]{4,}", ascii_text)

        for chunk in printable_chunks:
            if "version" not in chunk.lower():
                continue

            version = self._extract_version_token(chunk)
            if version:
                return version

        for chunk in printable_chunks:
            version = self._extract_version_token(chunk)
            if version:
                return version

        return None

    def _extract_version_token(self, text: str) -> str | None:
        patterns = (
            r"version\s*[:=]\s*(v?[0-9A-Za-z]+(?:[._-][0-9A-Za-z]+)*)",
            r"\b(v?\d+(?:\.\d+){1,6}(?:[-+][0-9A-Za-z._-]+)?)\b",
        )

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                version = match.group(1).strip().rstrip(".,;:")
                if version:
                    return version

        return None


RUNTIME_VERSIONS = RuntimeVersionState()