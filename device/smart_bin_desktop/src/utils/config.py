import os
from dataclasses import dataclass, field
from pathlib import Path

# ---------------------------------------------------------------------------
# Helpers — parse env vars safely, fall back to defaults on missing/invalid.
# ---------------------------------------------------------------------------

def _env_str(name: str, default: str) -> str:
    return os.getenv(name, default)


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


# ---------------------------------------------------------------------------
# Default values — single source of truth for magic numbers.
# ---------------------------------------------------------------------------

_DEFAULT_POLLING_INTERVAL_S = 5 * 60
_DEFAULT_FULL_THRESHOLD = 90.0
_DEFAULT_DEVICE_HEIGHT = 100.0


# ---------------------------------------------------------------------------
# Config sections
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RuntimeNoiseConfig:
    """Controls noisy log output from TensorFlow/absl before models load."""
    tf_cpp_min_log_level: str = _env_str("TF_CPP_MIN_LOG_LEVEL", "3")
    tf_enable_onednn_opts: str = _env_str("TF_ENABLE_ONEDNN_OPTS", "0")
    absl_min_log_level: str = _env_str("ABSL_MIN_LOG_LEVEL", "3")


@dataclass(frozen=True)
class LoggingConfig:
    level_name: str = _env_str("SMART_BIN_LOG_LEVEL", "INFO")
    format: str = _env_str(
        "SMART_BIN_LOG_FORMAT",
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )


@dataclass(frozen=True)
class WindowConfig:
    title: str = _env_str("SMART_BIN_WINDOW_TITLE", "Smart Bin")
    width: int = _env_int("SMART_BIN_WINDOW_WIDTH", 800)
    height: int = _env_int("SMART_BIN_WINDOW_HEIGHT", 480)
    background_color: str = _env_str("SMART_BIN_WINDOW_BG", "#e8f2ff")


@dataclass(frozen=True)
class CameraConfig:
    index: int = _env_int("SMART_BIN_CAMERA_INDEX", 0)
    width: int = _env_int("SMART_BIN_CAMERA_WIDTH", 640)
    height: int = _env_int("SMART_BIN_CAMERA_HEIGHT", 480)
    buffer_size: int = _env_int("SMART_BIN_CAMERA_BUFFER", 1)


@dataclass(frozen=True)
class DetectionConfig:
    hand_img_size: int = _env_int("SMART_BIN_HAND_IMG_SIZE", 320)
    hand_confidence: float = _env_float("SMART_BIN_HAND_CONF", 0.5)
    waste_group_confidence_threshold: float = _env_float("SMART_BIN_WASTE_GROUP_CONFIDENCE_THRESHOLD", 0.5)
    motion_threshold: int = _env_int("SMART_BIN_MOTION_THRESHOLD", 1600)
    stable_seconds: float = _env_float("SMART_BIN_STABLE_SECONDS", 0.8)
    min_result_interval_seconds: float = _env_float("SMART_BIN_MIN_RESULT_INTERVAL", 1.0)
    min_classification_confidence: float = _env_float("SMART_BIN_MIN_CLASS_CONF", 0.35)
    pause_sleep_seconds: float = _env_float("SMART_BIN_PAUSE_SLEEP", 0.1)
    exception_sleep_seconds: float = _env_float("SMART_BIN_EXCEPTION_SLEEP", 0.05)


@dataclass(frozen=True)
class WasteGroupConfig:
    category_to_group: dict[str, str] = field(
        default_factory=lambda: {
            "cardboard": "recyclable",
            "paper": "recyclable",
            "plastic": "recyclable",
            "metal": "recyclable",
            "glass": "recyclable",
            "biological": "compostable",
            "clothes": "compostable",
            "shoes": "compostable",
            "battery": "non_recyclable",
            "trash": "non_recyclable",
        }
    )
    angle_by_group: dict[str, int] = field(
        default_factory=lambda: {
            "recyclable": 45,
            "compostable": -45,
            "non_recyclable": 135,
            "unknown": -135,
        }
    )
    badge_by_group: dict[str, str] = field(
        default_factory=lambda: {
            "recyclable": "🟢",
            "compostable": "🟡",
            "non_recyclable": "🔴",
            "unknown": "⚪",
        }
    )
    description_by_group: dict[str, str] = field(
        default_factory=lambda: {
            "recyclable": "Có thể tái chế",
            "compostable": "Phân hủy sinh học",
            "non_recyclable": "Không tái chế được",
            "unknown": "Không xác định",
        }
    )
    
@dataclass(frozen=True)
class RpcMethod:
    open_lid = "openLid"
    close_lid = "closeLid"
    block_lid = "lockLid"
    unblock_lid = "unlockLid"
    force_sync = "forceSync"

@dataclass(frozen=True)
class ViewModelConfig:
    telemetry_interval_ms: int = _env_int("SMART_BIN_TELEMETRY_INTERVAL_MS", 1 * 60 * 1000)
    app_version_check_interval_ms: int = _env_int("SMART_BIN_APP_VERSION_CHECK_INTERVAL_MS", 1 * 60 * 1000)
    feedback_timeout_ms: int = _env_int("SMART_BIN_FEEDBACK_TIMEOUT_MS", 10_000)
    thanks_timeout_ms: int = _env_int("SMART_BIN_THANKS_TIMEOUT_MS", 5_000)
    upload_interval_ms: int = _env_int("SMART_BIN_UPLOAD_INTERVAL_MS", 1 * 60 * 1000)
    upload_batch_size: int = _env_int("SMART_BIN_UPLOAD_BATCH_SIZE", 10)


@dataclass(frozen=True)
class ApiConfig:
    device_base_url: str = _env_str("SMART_BIN_DEVICE_API_BASE", "http://localhost:80/api/v1/devices/public")
    config_base_url: str = _env_str("SMART_BIN_CONFIG_API_BASE", "http://localhost:80/api/v1/configs")
    thingsboard_base_url: str = _env_str("SMART_BIN_THINGSBOARD_API_BASE", "http://localhost:8082/api/v1")
    request_timeout_seconds: int = _env_int("SMART_BIN_API_TIMEOUT", 10)


@dataclass(frozen=True)
class Esp32OtaConfig:
    """Serial + OTA settings shared by ESP32 transport and test scripts."""

    com_port: str = _env_str("SMART_BIN_COM_PORT", "COM4")
    baud_rate: int = _env_int("SMART_BIN_BAUD_RATE", 115200)
    firmware_file: Path = field(
        default_factory=lambda: Path(
            _env_str(
                "SMART_BIN_FIRMWARE_FILE",
                str(Path(__file__).resolve().parent.parent.parent.parent / "esp32" / "actutor_esp32.bin"),
            )
        )
    )
    chunk_size: int = _env_int("SMART_BIN_CHUNK_SIZE", 512)
    upload_task_timeout_seconds: int = _env_int("SMART_BIN_OTA_TASK_TIMEOUT", 15 * 60)
    secret_key: bytes = field(
        default_factory=lambda: _env_str("SMART_BIN_SECRET_KEY", "HUST_SMART_BIN_KEY_2026").encode("utf-8")
    )
    fill_levels_poll_interval_seconds: int = _env_int("SMART_BIN_FILL_LEVELS_POLL_INTERVAL", 60)

    # Command bytes — must stay in sync with ESP32 config.h / uart_handler.c.
    cmd_ctrl_servo: int = 0x10
    cmd_ctrl_stepper: int = 0x11
    cmd_ctrl_device_config: int = 0x50
    cmd_report_fill_level: int = 0x40
    cmd_get_system_info: int = 0x70
    cmd_get_version: int = 0x60
    cmd_ota_start: int = 0x20
    cmd_ota_data: int = 0x21
    cmd_ota_end: int = 0x22
    
    cmd_open_lid: int = 0x80
    cmd_close_lid: int = 0x81
    cmd_block_lid: int = 0x82
    cmd_unblock_lid: int = 0x83

    cmd_ack: int = 0x30
    cmd_nack: int = 0x31

    # Frame markers — must stay in sync with ESP32 config.h / uart_handler.c.
    header_1: int = 0xAA
    header_2: int = 0x55
    tail: int = 0xEF


@dataclass(frozen=True)
class BackendConfig:
    tenant_secret: str = _env_str("SMART_BIN_TENANT_SECRET", "08290f771ce747c487dff9f1707212037cfcc90721f84a29")
    profile_code: str = _env_str("SMART_BIN_PROFILE_CODE", "SMART_BIN_60L")
    activate_retry_max_delay_seconds: int = _env_int("SMART_BIN_ACTIVATE_RETRY_MAX_DELAY_SECONDS", 60)


@dataclass(frozen=True)
class PathConfig:
    base_dir: Path = field(default_factory=lambda: Path(__file__).resolve().parent.parent.parent)

    @property
    def data_dir(self) -> Path:
        return self.base_dir / "data"

    @property
    def models_dir(self) -> Path:
        return self.base_dir / "models"

    @property
    def assets_dir(self) -> Path:
        return self.base_dir / "assets"

    @property
    def detections_dir(self) -> Path:
        return self.assets_dir / "detections"

    @property
    def detection_images_dir(self) -> Path:
        return self.detections_dir / "images"

    @property
    def detection_metadata_dir(self) -> Path:
        return self.detections_dir / "metadata"

    @property
    def hand_model_path(self) -> Path:
        return self.models_dir / "hand_detection.tflite"

    @property
    def trash_model_path(self) -> Path:
        return self.models_dir / "trash_classification.tflite"

    @property
    def devices_key_dir(self) -> Path:
        return self.base_dir / "key" / "devices"

    @property
    def server_key_dir(self) -> Path:
        return self.base_dir / "key" / "server"

    @property
    def public_server_key_path(self) -> Path:
        return self.server_key_dir / "public_key.pem"

    @property
    def device_config_cache_path(self) -> Path:
        return self.data_dir / "device_config_cache.json"

    @property
    def bin_version_cache_path(self) -> Path:
        return self.data_dir / "bin_version_cache.txt"
    
    @property
    def ai_model_version_cache_path(self) -> Path:
        return self.data_dir / "ai_model_version_cache.txt"


# ---------------------------------------------------------------------------
# Root config — single object imported by all modules.
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class AppConfig:
    runtime_noise: RuntimeNoiseConfig = field(default_factory=RuntimeNoiseConfig)
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    window: WindowConfig = field(default_factory=WindowConfig)
    camera: CameraConfig = field(default_factory=CameraConfig)
    detection: DetectionConfig = field(default_factory=DetectionConfig)
    waste_group: WasteGroupConfig = field(default_factory=WasteGroupConfig)
    viewmodel: ViewModelConfig = field(default_factory=ViewModelConfig)
    api: ApiConfig = field(default_factory=ApiConfig)
    esp32_ota: Esp32OtaConfig = field(default_factory=Esp32OtaConfig)
    desktop_version: str = _env_str("SMART_BIN_DESKTOP_VERSION", "1.0.0")
    backend: BackendConfig = field(default_factory=BackendConfig)
    paths: PathConfig = field(default_factory=PathConfig)
    rpc_method: RpcMethod = field(default_factory=RpcMethod)

    # Expose shared defaults so other modules don't re-define them.
    default_polling_interval_s: int = _DEFAULT_POLLING_INTERVAL_S
    default_full_threshold: float = _DEFAULT_FULL_THRESHOLD
    default_device_height: float = _DEFAULT_DEVICE_HEIGHT


APP_CONFIG = AppConfig()