from __future__ import annotations

import logging
import re
from collections.abc import Callable
from pathlib import Path

from src.utils.config import APP_CONFIG

# Minimum string length for a printable ASCII chunk to be considered meaningful.
_MIN_CHUNK_LEN = 4

# Version extraction patterns, tried in priority order.
_VERSION_PATTERNS = (
    r"version\s*[:=]\s*(v?[0-9A-Za-z]+(?:[._-][0-9A-Za-z]+)*)",
    r"\b(v?\d+(?:\.\d+){1,6}(?:[-+][0-9A-Za-z._-]+)?)\b",
)


class RuntimeVersionState:
    """Caches runtime version metadata for outbound API version headers.

    Resolution order when the in-memory cache is empty:
    1. Disk cache file.
    2. Live query to ESP32 via *device_version_fetcher*.
    3. Scan of the local firmware binary for an embedded version string.
    """

    def __init__(self, bin_cache_path: Path | None = None, ai_cache_path: Path | None = None) -> None:
        self.logger = logging.getLogger("smart_bin.runtime_versions")
        self.bin_cache_path = bin_cache_path or APP_CONFIG.paths.bin_version_cache_path
        self.ai_cache_path = ai_cache_path or APP_CONFIG.paths.ai_model_version_cache_path

        self._bin_version: str | None = None
        self._ai_version: str | None = None

    # ------------------------------------------------------------------
    # Public APIs
    # ------------------------------------------------------------------

    def set_bin_version(self, version: str | None) -> None:
        normalized = str(version).strip() if version else ""
        self._bin_version = normalized or None
        if self._bin_version:
            self._save_cache(self.bin_cache_path, self._bin_version)

    def get_bin_version(self) -> str | None:
        if self._bin_version:
            return self._bin_version
        cached = self._load_cache(self.bin_cache_path)
        if cached:
            self._bin_version = cached
        return self._bin_version
    
    def set_ai_version(self, version: str | None) -> None:
        normalized = str(version).strip() if version else ""
        self._ai_version = normalized or None
        if self._ai_version:
            self._save_cache(self.ai_cache_path, self._ai_version)

    def get_ai_version(self) -> str | None:
        if self._ai_version:
            return self._ai_version
        cached = self._load_cache(self.ai_cache_path)
        if cached:
            self._ai_version = cached
        return self._ai_version

    def resolve_bin_version(
        self,
        device_version_fetcher: Callable[[], tuple[bool, str | None]] | None = None,
        firmware_file: Path | None = None,
    ) -> str | None:
        """Resolve the bin version, populating the cache on first discovery."""
        if version := self.get_bin_version():
            return version

        if device_version_fetcher:
            version = self._fetch_from_device(device_version_fetcher)
            if version:
                self.set_bin_version(version)
                return self._bin_version

        fw_file = firmware_file or APP_CONFIG.esp32_ota.firmware_file
        version = self._extract_from_binary(fw_file)
        if version:
            self.set_bin_version(version)

        return self._bin_version

    # ------------------------------------------------------------------
    # Cache I/O
    # ------------------------------------------------------------------

    def _save_cache(self, path: Path, version: str) -> None:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(version, encoding="utf-8")
        except OSError as exc:
            self.logger.warning("Failed to save version cache to %s: %s", path, exc)

    def _load_cache(self, path: Path) -> str | None:
        try:
            if not path.exists():
                return None
            return path.read_text(encoding="utf-8").strip() or None
        except OSError as exc:
            self.logger.warning("Failed to load version cache from %s: %s", path, exc)
            return None

    # ------------------------------------------------------------------
    # Source: ESP32
    # ------------------------------------------------------------------

    def _fetch_from_device(
        self, fetcher: Callable[[], tuple[bool, str | None]]
    ) -> str | None:
        try:
            ok, version = fetcher()
            return version if ok and version else None
        except Exception as exc:
            self.logger.warning("Failed to fetch bin version from ESP32: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Source: firmware binary
    # ------------------------------------------------------------------

    def _extract_from_binary(self, firmware_file: Path) -> str | None:
        try:
            if not firmware_file.exists():
                return None
            data = firmware_file.read_bytes()
        except OSError as exc:
            self.logger.warning("Cannot read firmware binary %s: %s", firmware_file, exc)
            return None

        chunks = self._read_ascii_chunks(data)

        # Prefer chunks that mention "version" explicitly.
        for chunk in chunks:
            if "version" in chunk.lower():
                if v := self._extract_version_token(chunk):
                    return v

        # Fallback: any chunk containing a version-like token.
        for chunk in chunks:
            if v := self._extract_version_token(chunk):
                return v

        return None

    @staticmethod
    def _read_ascii_chunks(data: bytes) -> list[str]:
        """Decode binary as latin-1 and split into runs of printable ASCII."""
        text = data.decode("latin-1", errors="ignore")
        return re.findall(rf"[ -~]{{{_MIN_CHUNK_LEN},}}", text)

    @staticmethod
    def _extract_version_token(text: str) -> str | None:
        for pattern in _VERSION_PATTERNS:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                token = m.group(1).strip().rstrip(".,;:")
                if token:
                    return token
        return None


# Module-level singleton — imported by all modules that need the bin version.
RUNTIME_VERSIONS = RuntimeVersionState()