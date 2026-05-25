import logging
import os
import sys
import warnings

from PyQt6.QtWidgets import QApplication

from src.utils.config import APP_CONFIG


def _configure_runtime_noise() -> None:
    """Suppress TensorFlow / absl log noise before the AI stack is imported."""
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", APP_CONFIG.runtime_noise.tf_cpp_min_log_level)
    os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", APP_CONFIG.runtime_noise.tf_enable_onednn_opts)
    os.environ.setdefault("ABSL_MIN_LOG_LEVEL", APP_CONFIG.runtime_noise.absl_min_log_level)
    warnings.filterwarnings(
        "ignore",
        message=r".*tf\.lite\.Interpreter is deprecated.*",
        category=UserWarning,
    )


def _configure_logging() -> None:
    log_level = getattr(logging, APP_CONFIG.logging.level_name.upper(), logging.INFO)
    logging.basicConfig(level=log_level, format=APP_CONFIG.logging.format)


def _build_app() -> tuple:
    """Construct and wire the three top-level objects: worker, viewmodel, window.

    Imports are deferred so that env-based TF/absl flags are already in place
    before Ultralytics / TensorFlow load any native extensions.
    """
    from src.services.detection_worker import DetectionWorker      # noqa: PLC0415
    from src.viewmodels.main_viewmodel import MainViewModel         # noqa: PLC0415
    from src.views.main_window import MainWindow                    # noqa: PLC0415

    worker = DetectionWorker()
    viewmodel = MainViewModel(worker)
    window = MainWindow(viewmodel)
    return worker, viewmodel, window


def main() -> None:
    _configure_runtime_noise()
    _configure_logging()
    logger = logging.getLogger("smart_bin.main")
    logger.info("Starting Smart Bin Desktop v%s", APP_CONFIG.desktop_version)

    app = QApplication(sys.argv)

    _worker, viewmodel, window = _build_app()
    window.show()
    viewmodel.start_system()
    logger.info("System started")

    sys.exit(app.exec())


if __name__ == "__main__":
    main()