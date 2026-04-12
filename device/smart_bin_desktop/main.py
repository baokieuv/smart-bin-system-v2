import sys
import logging
import os
import warnings
from PyQt6.QtWidgets import QApplication
from src.utils.config import APP_CONFIG


def _configure_runtime_noise():
    # These flags must be set before TensorFlow/Ultralytics imports.
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", APP_CONFIG.runtime_noise.tf_cpp_min_log_level)
    os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", APP_CONFIG.runtime_noise.tf_enable_onednn_opts)
    os.environ.setdefault("ABSL_MIN_LOG_LEVEL", APP_CONFIG.runtime_noise.absl_min_log_level)

    # Hide deprecation warning from tf.lite.Interpreter coming from dependency stack.
    warnings.filterwarnings(
        "ignore",
        message=r".*tf\.lite\.Interpreter is deprecated.*",
        category=UserWarning,
    )


def _configure_logging():
    # Centralized logging format so all modules share the same readable runtime trace.
    log_level = getattr(logging, APP_CONFIG.logging.level_name.upper(), logging.INFO)
    logging.basicConfig(
        level=log_level,
        format=APP_CONFIG.logging.format,
    )

def main():
    # Runtime/logging must be configured before importing AI stack.
    _configure_runtime_noise()
    _configure_logging()
    logger = logging.getLogger("smart_bin.main")
    logger.info("Khoi dong Smart Bin Desktop")

    # Delayed import keeps env-based runtime flags effective for TensorFlow/Ultralytics.
    from src.services.detection_worker import DetectionWorker
    from src.viewmodels.main_viewmodel import MainViewModel
    from src.views.main_window import MainWindow

    app = QApplication(sys.argv)
    
    # 1) Worker chạy camera + AI trên luồng riêng.
    worker = DetectionWorker()
    logger.info("DetectionWorker da khoi tao")
    
    # 2) ViewModel điều phối state giữa worker và UI.
    viewmodel = MainViewModel(worker)
    logger.info("MainViewModel da khoi tao")
    
    # 3) MainWindow subscribe state từ ViewModel.
    window = MainWindow(viewmodel)
    window.show()
    logger.info("MainWindow da hien thi")
    
    # 4) Bắt đầu pipeline detect + telemetry.
    viewmodel.start_system()
    logger.info("He thong da start")
    
    sys.exit(app.exec())
    
if __name__ == '__main__':
    main()