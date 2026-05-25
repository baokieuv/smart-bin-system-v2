"""Cross-platform Wi-Fi operations abstraction (Windows / Linux)."""

import logging
import platform
import re
import subprocess
import tempfile
import time
from pathlib import Path
from xml.sax.saxutils import escape

# Error messages — kept as constants so they're easy to translate or mock.
_ERR_UNSUPPORTED = "Hệ điều hành hiện tại không hỗ trợ cấu hình Wi-Fi"
_ERR_SECURE_NO_PASSWORD = "Mật khẩu không được để trống"
_ERR_NO_NETWORKS = "Không tìm thấy mạng Wi-Fi"
_ERR_CONNECT_FALLBACK = "Hệ thống không kết nối vào đúng SSID (có thể đã fallback sang mạng khác)"
_ERR_CONNECT_GENERIC = "Không thể kết nối"
_ERR_DELETE_GENERIC = "Không xóa được profile"
_ERR_ADD_PROFILE = "Không add được Wi-Fi profile"

_PLATFORM = platform.system()
_IS_WINDOWS = _PLATFORM == "Windows"
_IS_LINUX = _PLATFORM == "Linux"
_IS_SUPPORTED = _IS_WINDOWS or _IS_LINUX


class WifiService:
    """Cross-platform Wi-Fi management using netsh (Windows) and nmcli (Linux)."""

    def __init__(self) -> None:
        self.logger = logging.getLogger("smart_bin.wifi_service")
        self.last_error: str = ""

    # ------------------------------------------------------------------
    # Platform guards
    # ------------------------------------------------------------------

    @staticmethod
    def is_supported() -> bool:
        return _IS_SUPPORTED

    @staticmethod
    def current_platform() -> str:
        return _PLATFORM

    def _require_supported(self) -> bool:
        """Set last_error and return False if platform is unsupported."""
        if not _IS_SUPPORTED:
            self.last_error = _ERR_UNSUPPORTED
            return False
        return True

    # ------------------------------------------------------------------
    # Public scan API
    # ------------------------------------------------------------------

    def scan_networks(self) -> list[str]:
        """Return SSID names only."""
        return [n["ssid"] for n in self.scan_network_details()]

    def scan_network_details(self) -> list[dict]:
        """Return list of dicts with keys: ssid, secure, connected."""
        self.last_error = ""
        if not self._require_supported():
            return []

        networks = self._scan_networks_windows() if _IS_WINDOWS else self._scan_networks_linux()
        self.logger.info("Wi-Fi scan done (%s): found %d networks", _PLATFORM, len(networks))
        if not networks and not self.last_error:
            self.last_error = _ERR_NO_NETWORKS
        return networks

    # ------------------------------------------------------------------
    # Public connect API
    # ------------------------------------------------------------------

    def has_saved_profile(self, ssid: str) -> bool:
        if not self._require_supported():
            return False
        if _IS_WINDOWS:
            return self._run(["netsh", "wlan", "show", "profile", f"name={ssid}"]).returncode == 0

        result = self._run(["nmcli", "-t", "-f", "NAME", "connection", "show"])
        if result.returncode != 0:
            return False
        return ssid in {line.strip() for line in result.stdout.splitlines() if line.strip()}

    def connect_saved_profile(self, ssid: str) -> tuple[bool, str]:
        if not self._require_supported():
            return False, _ERR_UNSUPPORTED
        return self._connect_windows_saved(ssid) if _IS_WINDOWS else self._connect_linux_saved(ssid)

    def connect_with_password(self, ssid: str, password: str, secure: bool = True) -> tuple[bool, str]:
        if not self._require_supported():
            return False, _ERR_UNSUPPORTED
        if secure and not password:
            return False, _ERR_SECURE_NO_PASSWORD
        return self._connect_linux_password(ssid, password, secure) if _IS_LINUX else self._connect_windows_password(ssid, password, secure)

    def forget_saved_profile(self, ssid: str) -> tuple[bool, str]:
        if not self._require_supported():
            return False, _ERR_UNSUPPORTED
        if _IS_WINDOWS:
            result = self._run(["netsh", "wlan", "delete", "profile", f"name={ssid}"])
            if result.returncode == 0:
                return True, "Đã xóa profile Wi-Fi"
            return self._fail(_cmd_output(result) or _ERR_DELETE_GENERIC)

        result = self._run(["nmcli", "connection", "delete", "id", ssid])
        if result.returncode == 0:
            return True, "Đã xóa profile Wi-Fi"
        return self._fail(_cmd_output(result) or _ERR_DELETE_GENERIC)

    def get_connected_ssid(self) -> str | None:
        if not _IS_SUPPORTED:
            return None
        return self._get_connected_ssid_windows() if _IS_WINDOWS else self._get_connected_ssid_linux()

    # ------------------------------------------------------------------
    # Windows-specific connect helpers
    # ------------------------------------------------------------------

    def _connect_windows_saved(self, ssid: str) -> tuple[bool, str]:
        result = self._run(["netsh", "wlan", "connect", f"name={ssid}", f"ssid={ssid}"])
        if result.returncode == 0 and self._wait_until_connected(ssid):
            return True, "Đã kết nối Wi-Fi"
        if result.returncode == 0:
            return self._fail(_ERR_CONNECT_FALLBACK)
        return self._fail(_cmd_output(result) or _ERR_CONNECT_GENERIC)

    def _connect_windows_password(self, ssid: str, password: str, secure: bool) -> tuple[bool, str]:
        xml = self._build_windows_profile_xml(ssid, password, secure)
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile("w", suffix=".xml", delete=False, encoding="utf-8") as fh:
                fh.write(xml)
                temp_path = fh.name

            add = self._run(["netsh", "wlan", "add", "profile", f"filename={temp_path}", "user=current"])
            if add.returncode != 0:
                return self._fail(_cmd_output(add) or _ERR_ADD_PROFILE)
            return self.connect_saved_profile(ssid)
        finally:
            if temp_path:
                Path(temp_path).unlink(missing_ok=True)

    # ------------------------------------------------------------------
    # Linux-specific connect helpers
    # ------------------------------------------------------------------

    def _connect_linux_saved(self, ssid: str) -> tuple[bool, str]:
        # Try by profile name first, then fall back to bare SSID connect.
        for cmd in (
            ["nmcli", "connection", "up", "id", ssid],
            ["nmcli", "device", "wifi", "connect", ssid],
        ):
            result = self._run(cmd)
            if result.returncode == 0 and self._wait_until_connected(ssid):
                return True, "Đã kết nối Wi-Fi"

        return self._fail(_ERR_CONNECT_GENERIC)

    def _connect_linux_password(self, ssid: str, password: str, secure: bool) -> tuple[bool, str]:
        cmd = ["nmcli", "device", "wifi", "connect", ssid]
        if secure:
            cmd += ["password", password]
        result = self._run(cmd)
        if result.returncode == 0 and self._wait_until_connected(ssid):
            return True, "Đã kết nối Wi-Fi"
        if result.returncode == 0:
            return self._fail(_ERR_CONNECT_FALLBACK)
        return self._fail(_cmd_output(result) or _ERR_CONNECT_GENERIC)

    # ------------------------------------------------------------------
    # Scan implementations
    # ------------------------------------------------------------------

    def _scan_networks_windows(self) -> list[dict]:
        seen: dict[str, dict] = {}
        networks: list[dict] = []
        connected = self._get_connected_ssid_windows()

        result = self._run(["netsh", "wlan", "show", "networks", "mode=bssid"])
        if result.returncode != 0:
            self.last_error = self._normalize_windows_wlan_error(result.stdout, result.stderr)

        ssid_re = re.compile(r"^\s*SSID\s+\d+\s*:\s*(.*)$", re.IGNORECASE)
        auth_re = re.compile(r"^\s*Authentication\s*:\s*(.*)$", re.IGNORECASE)
        current: dict | None = None

        for line in result.stdout.splitlines():
            m = ssid_re.match(line)
            if m:
                ssid = m.group(1).strip()
                if ssid and ssid not in seen:
                    current = {"ssid": ssid, "secure": True, "connected": ssid == connected}
                    seen[ssid] = current
                    networks.append(current)
                else:
                    current = seen.get(ssid)
                continue
            if current and (am := auth_re.match(line)):
                current["secure"] = "open" not in am.group(1).strip().lower()

        # Ensure the currently connected network is always listed.
        if connected and connected not in seen:
            networks.append({"ssid": connected, "secure": True, "connected": True})

        return networks

    def _scan_networks_linux(self) -> list[dict]:
        seen: dict[str, dict] = {}
        networks: list[dict] = []

        result = self._run([
            "nmcli", "-t", "--escape", "no",
            "-f", "ACTIVE,SECURITY,SSID",
            "device", "wifi", "list", "--rescan", "yes",
        ])
        if result.returncode != 0:
            self.last_error = _cmd_output(result) or "Không scan được Wi-Fi bằng nmcli"
            return networks

        for line in result.stdout.splitlines():
            parts = line.split(":", 2)
            if len(parts) != 3:
                continue
            active, security, ssid = (p.strip() for p in parts)
            if not ssid:
                continue
            if ssid not in seen:
                net = {"ssid": ssid, "secure": bool(security), "connected": active.lower() == "yes"}
                seen[ssid] = net
                networks.append(net)
            elif active.lower() == "yes":
                seen[ssid]["connected"] = True

        return networks

    # ------------------------------------------------------------------
    # Connected SSID helpers
    # ------------------------------------------------------------------

    def _get_connected_ssid_linux(self) -> str | None:
        result = self._run(["nmcli", "-t", "-f", "ACTIVE,SSID", "device", "wifi", "list"])
        if result.returncode != 0:
            return None
        for line in result.stdout.splitlines():
            if line.startswith("yes:"):
                ssid = line.split(":", 1)[1].strip()
                if ssid:
                    return ssid
        return None

    def _get_connected_ssid_windows(self) -> str | None:
        result = self._run(["netsh", "wlan", "show", "interfaces"])
        if result.returncode != 0 and not self.last_error:
            self.last_error = self._normalize_windows_wlan_error(result.stdout, result.stderr)
        for line in result.stdout.splitlines():
            text = line.strip()
            lower = text.lower()
            if lower.startswith("ssid") and "bssid" not in lower and ":" in text:
                ssid = text.split(":", 1)[1].strip()
                if ssid:
                    return ssid
        return None

    # ------------------------------------------------------------------
    # Windows profile XML builder
    # ------------------------------------------------------------------

    @staticmethod
    def _build_windows_profile_xml(ssid: str, password: str, secure: bool) -> str:
        ssid_xml = escape(ssid)
        password_xml = escape(password)
        security_block = ""
        if secure:
            security_block = f"""
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>{password_xml}</keyMaterial>
            </sharedKey>"""
        else:
            security_block = """
            <authEncryption>
                <authentication>open</authentication>
                <encryption>none</encryption>
                <useOneX>false</useOneX>
            </authEncryption>"""

        return f"""<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>{ssid_xml}</name>
    <SSIDConfig>
        <SSID><name>{ssid_xml}</name></SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>auto</connectionMode>
    <MSM>
        <security>{security_block}
        </security>
    </MSM>
</WLANProfile>
"""

    # ------------------------------------------------------------------
    # Windows error normalizer
    # ------------------------------------------------------------------

    @staticmethod
    def _normalize_windows_wlan_error(stdout: str, stderr: str) -> str:
        combined = f"{stdout}\n{stderr}".strip().lower()
        if "location permission" in combined:
            return "Windows đang chặn quyền Location cho WLAN. Hãy bật Location Services."
        if "requires elevation" in combined or "error 5" in combined:
            return "Cần chạy app với quyền Administrator để truy cập WLAN."
        if "autoconfig service" in combined:
            return "WLAN AutoConfig service chưa bật."
        return (stderr or stdout).strip() or "Không scan được Wi-Fi trên Windows"

    # ------------------------------------------------------------------
    # Subprocess wrapper
    # ------------------------------------------------------------------

    def _run(self, cmd: list[str]) -> subprocess.CompletedProcess:
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            check=False, encoding="utf-8", errors="ignore",
        )
        self.logger.debug(
            "CMD rc=%d cmd=%s stdout=%s stderr=%s",
            result.returncode, " ".join(cmd),
            (result.stdout or "")[:200], (result.stderr or "")[:200],
        )
        return result

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _fail(self, message: str) -> tuple[bool, str]:
        self.last_error = message
        return False, message

    def _wait_until_connected(self, target_ssid: str, timeout: float = 8.0) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.get_connected_ssid() == target_ssid:
                return True
            time.sleep(0.5)
        return False


# ---------------------------------------------------------------------------
# Module-level helper (not a method — no `self` needed)
# ---------------------------------------------------------------------------

def _cmd_output(result: subprocess.CompletedProcess) -> str:
    """Return the first non-empty output stream from a subprocess result."""
    return (result.stderr or result.stdout or "").strip()