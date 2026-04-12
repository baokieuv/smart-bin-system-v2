import os
from dataclasses import dataclass
from pathlib import Path


# Helper parse env vars safely; fallback to default on missing/invalid values.
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


@dataclass(frozen=True)
class RuntimeNoiseConfig:
	# Runtime noise controls for TensorFlow/absl logs.
	tf_cpp_min_log_level: str = _env_str("TF_CPP_MIN_LOG_LEVEL", "3")
	tf_enable_onednn_opts: str = _env_str("TF_ENABLE_ONEDNN_OPTS", "0")
	absl_min_log_level: str = _env_str("ABSL_MIN_LOG_LEVEL", "3")


@dataclass(frozen=True)
class LoggingConfig:
	# Global logging defaults used by all modules.
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
	# Detection pipeline thresholds/timing parameters.
	hand_img_size: int = _env_int("SMART_BIN_HAND_IMG_SIZE", 320)
	hand_confidence: float = _env_float("SMART_BIN_HAND_CONF", 0.5)
	motion_threshold: int = _env_int("SMART_BIN_MOTION_THRESHOLD", 1600)
	stable_seconds: float = _env_float("SMART_BIN_STABLE_SECONDS", 0.8)
	min_result_interval_seconds: float = _env_float("SMART_BIN_MIN_RESULT_INTERVAL", 1.0)
	min_classification_confidence: float = _env_float("SMART_BIN_MIN_CLASS_CONF", 0.35)
	pause_sleep_seconds: float = _env_float("SMART_BIN_PAUSE_SLEEP", 0.1)
	exception_sleep_seconds: float = _env_float("SMART_BIN_EXCEPTION_SLEEP", 0.05)


@dataclass(frozen=True)
class ViewModelConfig:
	telemetry_interval_ms: int = _env_int("SMART_BIN_TELEMETRY_INTERVAL_MS", 5 * 60 * 1000)
	feedback_timeout_ms: int = _env_int("SMART_BIN_FEEDBACK_TIMEOUT_MS", 10000)
	thanks_timeout_ms: int = _env_int("SMART_BIN_THANKS_TIMEOUT_MS", 5000)


@dataclass(frozen=True)
class ApiConfig:
	device_base_url: str = _env_str("SMART_BIN_DEVICE_API_BASE", "https://api.kvbhust.id.vn/api/v1/devices")
	thingsboard_base_url: str = _env_str("SMART_BIN_THINGSBOARD_API_BASE", "https://thingsboard.kvbhust.id.vn/api/v1")
	request_timeout_seconds: int = _env_int("SMART_BIN_API_TIMEOUT", 10)


@dataclass(frozen=True)
class PathConfig:
	# Root folder for deriving models/assets/key paths.
	base_dir: Path = Path(__file__).resolve().parent.parent.parent

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
	def private_key_path(self) -> Path:
		return self.base_dir / "key" / "private_key.pem"


@dataclass(frozen=True)
class AppConfig:
	# Single app-level config object for dependency modules.
	runtime_noise: RuntimeNoiseConfig = RuntimeNoiseConfig()
	logging: LoggingConfig = LoggingConfig()
	window: WindowConfig = WindowConfig()
	camera: CameraConfig = CameraConfig()
	detection: DetectionConfig = DetectionConfig()
	viewmodel: ViewModelConfig = ViewModelConfig()
	api: ApiConfig = ApiConfig()
	paths: PathConfig = PathConfig()


APP_CONFIG = AppConfig()