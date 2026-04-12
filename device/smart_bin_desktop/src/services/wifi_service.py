import logging
import os
import platform
import re
import subprocess
import tempfile
import time
from pathlib import Path
from typing import List
from xml.sax.saxutils import escape


class WifiService:
    def __init__(self):
        self.logger = logging.getLogger("smart_bin.wifi_service")
        self.last_error: str = ""

    @staticmethod
    def is_supported() -> bool:
        return platform.system() in ("Windows", "Linux")

    @staticmethod
    def current_platform() -> str:
        return platform.system()

    def scan_networks(self) -> List[str]:
        return [n["ssid"] for n in self.scan_network_details()]

    def scan_network_details(self) -> List[dict]:
        self.last_error = ""
        if not self.is_supported():
            self.last_error = "He dieu hanh hien tai khong ho tro cau hinh Wi-Fi"
            return []

        if self.current_platform() == "Windows":
            networks = self._scan_networks_windows()
        else:
            networks = self._scan_networks_linux()

        self.logger.info("Scan wifi xong (%s), tim thay %s mang", self.current_platform(), len(networks))
        if not networks and not self.last_error:
            self.last_error = "Khong tim thay mang Wi-Fi"
        return networks

    def has_saved_profile(self, ssid: str) -> bool:
        if not self.is_supported():
            return False

        if self.current_platform() == "Windows":
            result = self._run_cmd(["netsh", "wlan", "show", "profile", f"name={ssid}"])
            return result.returncode == 0

        result = self._run_cmd(["nmcli", "-t", "-f", "NAME", "connection", "show"])
        if result.returncode != 0:
            return False
        profiles = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        return ssid in profiles

    def connect_saved_profile(self, ssid: str) -> tuple[bool, str]:
        if not self.is_supported():
            return False, "He dieu hanh hien tai khong ho tro cau hinh Wi-Fi"

        if self.current_platform() == "Windows":
            result = self._run_cmd(["netsh", "wlan", "connect", f"name={ssid}", f"ssid={ssid}"])
            if result.returncode == 0:
                if self._wait_until_connected(ssid):
                    return True, "Da ket noi Wi-Fi"
                self.last_error = "He thong khong ket noi vao dung SSID (co the da fallback sang mang khac)"
                return False, self.last_error
            msg = (result.stderr or result.stdout).strip() or "Khong the ket noi"
            self.last_error = msg
            return False, msg

        # Linux: try known connection profile first.
        up_result = self._run_cmd(["nmcli", "connection", "up", "id", ssid])
        if up_result.returncode == 0:
            if self._wait_until_connected(ssid):
                return True, "Da ket noi Wi-Fi"

        # Fallback: if profile name is not equal to SSID, let nmcli attempt by SSID.
        wifi_result = self._run_cmd(["nmcli", "device", "wifi", "connect", ssid])
        if wifi_result.returncode == 0:
            if self._wait_until_connected(ssid):
                return True, "Da ket noi Wi-Fi"

        msg = (wifi_result.stderr or wifi_result.stdout or up_result.stderr or up_result.stdout).strip() or "Khong the ket noi"
        self.last_error = msg
        return False, msg

    def connect_with_password(self, ssid: str, password: str, secure: bool = True) -> tuple[bool, str]:
        if not self.is_supported():
            return False, "He dieu hanh hien tai khong ho tro cau hinh Wi-Fi"

        if secure and not password:
            return False, "Mat khau khong duoc de trong"

        if self.current_platform() == "Linux":
            if secure:
                cmd = ["nmcli", "device", "wifi", "connect", ssid, "password", password]
            else:
                cmd = ["nmcli", "device", "wifi", "connect", ssid]
            result = self._run_cmd(cmd)
            if result.returncode == 0:
                if self._wait_until_connected(ssid):
                    return True, "Da ket noi Wi-Fi"
                self.last_error = "He thong khong ket noi vao dung SSID (co the da fallback sang mang khac)"
                return False, self.last_error
            msg = (result.stderr or result.stdout).strip() or "Khong the ket noi"
            self.last_error = msg
            return False, msg

        profile_xml = self._build_windows_profile_xml(ssid, password, secure)
        temp_path = None
        try:
            with tempfile.NamedTemporaryFile("w", suffix=".xml", delete=False, encoding="utf-8") as f:
                f.write(profile_xml)
                temp_path = f.name

            add_result = self._run_cmd(["netsh", "wlan", "add", "profile", f"filename={temp_path}", "user=current"])
            if add_result.returncode != 0:
                msg = (add_result.stderr or add_result.stdout).strip() or "Khong add duoc wifi profile"
                self.last_error = msg
                return False, msg

            return self.connect_saved_profile(ssid)
        finally:
            if temp_path:
                try:
                    Path(temp_path).unlink(missing_ok=True)
                except OSError:
                    pass

    def _build_windows_profile_xml(self, ssid: str, password: str, secure: bool) -> str:
        ssid_xml = escape(ssid)
        password_xml = escape(password)
        if not secure:
            return f"""<?xml version=\"1.0\"?>
<WLANProfile xmlns=\"http://www.microsoft.com/networking/WLAN/profile/v1\">
    <name>{ssid_xml}</name>
    <SSIDConfig>
        <SSID>
            <name>{ssid_xml}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>auto</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>open</authentication>
                <encryption>none</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
        </security>
    </MSM>
</WLANProfile>
"""

        return f"""<?xml version=\"1.0\"?>
<WLANProfile xmlns=\"http://www.microsoft.com/networking/WLAN/profile/v1\">
    <name>{ssid_xml}</name>
    <SSIDConfig>
        <SSID>
            <name>{ssid_xml}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>auto</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>{password_xml}</keyMaterial>
            </sharedKey>
        </security>
    </MSM>
</WLANProfile>
"""

    def _run_cmd(self, cmd: list[str]) -> subprocess.CompletedProcess:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False,
            encoding="utf-8",
            errors="ignore",
        )
        self.logger.debug(
            "CMD rc=%s cmd=%s stdout=%s stderr=%s",
            result.returncode,
            " ".join(cmd),
            (result.stdout or "")[:200],
            (result.stderr or "")[:200],
        )
        return result

    def forget_saved_profile(self, ssid: str) -> tuple[bool, str]:
        if not self.is_supported():
            return False, "He dieu hanh hien tai khong ho tro cau hinh Wi-Fi"

        if self.current_platform() == "Windows":
            result = self._run_cmd(["netsh", "wlan", "delete", "profile", f"name={ssid}"])
            if result.returncode == 0:
                return True, "Da xoa profile Wi-Fi"
            msg = (result.stderr or result.stdout).strip() or "Khong xoa duoc profile"
            self.last_error = msg
            return False, msg

        # Linux / NetworkManager
        result = self._run_cmd(["nmcli", "connection", "delete", "id", ssid])
        if result.returncode == 0:
            return True, "Da xoa profile Wi-Fi"

        msg = (result.stderr or result.stdout).strip() or "Khong xoa duoc profile"
        self.last_error = msg
        return False, msg

    def get_connected_ssid(self) -> str | None:
        if not self.is_supported():
            return None
        if self.current_platform() == "Windows":
            return self._get_connected_ssid_windows()
        return self._get_connected_ssid_linux()

    def _wait_until_connected(self, target_ssid: str, timeout_seconds: float = 8.0) -> bool:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            current = self.get_connected_ssid()
            if current == target_ssid:
                return True
            time.sleep(0.5)
        return False

    def _scan_networks_windows(self) -> List[dict]:
        networks: list[dict] = []
        seen: dict[str, dict] = {}
        connected_ssid = self._get_connected_ssid_windows()

        # Primary scan from visible WLAN list.
        result = self._run_cmd(["netsh", "wlan", "show", "networks", "mode=bssid"])
        if result.returncode != 0:
            self.last_error = self._normalize_windows_wlan_error(result.stdout, result.stderr)
        pattern = re.compile(r"^\s*SSID\s+\d+\s*:\s*(.*)$", re.IGNORECASE)
        auth_pattern = re.compile(r"^\s*Authentication\s*:\s*(.*)$", re.IGNORECASE)
        current = None
        for line in result.stdout.splitlines():
            m = pattern.match(line)
            if m:
                ssid = m.group(1).strip()
                current = {"ssid": ssid, "secure": True, "connected": ssid == connected_ssid}
                if ssid and ssid not in seen:
                    seen[ssid] = current
                    networks.append(current)
                else:
                    current = seen.get(ssid)
                continue

            if not current:
                continue

            am = auth_pattern.match(line)
            if am:
                auth_value = am.group(1).strip().lower()
                current["secure"] = "open" not in auth_value

        # Fallback: ensure currently connected SSID is visible in list.
        if connected_ssid and connected_ssid not in seen:
            networks.append({"ssid": connected_ssid, "secure": True, "connected": True})

        return networks

    def _scan_networks_linux(self) -> List[dict]:
        networks: list[dict] = []
        seen: dict[str, dict] = {}
        result = self._run_cmd(["nmcli", "-t", "--escape", "no", "-f", "ACTIVE,SECURITY,SSID", "device", "wifi", "list", "--rescan", "yes"])
        if result.returncode != 0:
            self.last_error = (result.stderr or result.stdout).strip() or "Khong scan duoc Wi-Fi bang nmcli"
            return networks

        for line in result.stdout.splitlines():
            parts = line.split(":", 2)
            if len(parts) != 3:
                continue
            active, security, ssid = parts[0].strip(), parts[1].strip(), parts[2].strip()
            if not ssid:
                continue

            net = {
                "ssid": ssid,
                "secure": bool(security),
                "connected": active.lower() == "yes",
            }

            if ssid not in seen:
                seen[ssid] = net
                networks.append(net)
            elif net["connected"]:
                seen[ssid]["connected"] = True

        return networks

    def _get_connected_ssid_linux(self) -> str | None:
        result = self._run_cmd(["nmcli", "-t", "-f", "ACTIVE,SSID", "device", "wifi", "list"])
        if result.returncode != 0:
            return None
        for line in result.stdout.splitlines():
            if not line.startswith("yes:"):
                continue
            ssid = line.split(":", 1)[1].strip()
            if ssid:
                return ssid
        return None

    def _get_connected_ssid_windows(self) -> str | None:
        iface = self._run_cmd(["netsh", "wlan", "show", "interfaces"])
        if iface.returncode != 0 and not self.last_error:
            self.last_error = self._normalize_windows_wlan_error(iface.stdout, iface.stderr)
        for line in iface.stdout.splitlines():
            text = line.strip()
            lower = text.lower()
            if lower.startswith("ssid") and "bssid" not in lower and ":" in text:
                ssid = text.split(":", 1)[1].strip()
                if ssid:
                    return ssid
        return None

    def _normalize_windows_wlan_error(self, stdout: str, stderr: str) -> str:
        text = f"{stdout}\n{stderr}".strip().lower()
        if "location permission" in text:
            return "Windows dang chan quyen Location cho WLAN. Hay bat Location Services."
        if "requires elevation" in text or "error 5" in text:
            return "Can chay app voi quyen Administrator de truy cap WLAN."
        if "autoconfig service" in text:
            return "WLAN AutoConfig service chua bat."
        raw = (stderr or stdout).strip()
        return raw or "Khong scan duoc Wi-Fi tren Windows"
