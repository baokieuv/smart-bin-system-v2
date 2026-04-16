import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from PyQt6.QtCore import QObject, pyqtSignal, QTimer
from src.models.trash_model import TrashData
from src.repository.device_repository import DeviceClient
from src.repository.thingsboard_repository import ThingsboardClient
from src.utils.config import APP_CONFIG

class MainViewModel(QObject):
    # State signals consumed by MainWindow for screen transitions.
    state_loading = pyqtSignal(str)
    state_welcome = pyqtSignal()
    state_feedback = pyqtSignal(TrashData)
    state_thanks = pyqtSignal()
    state_activation_required = pyqtSignal(bool, str)
    state_toast = pyqtSignal(str, bool)

    def __init__(self, worker):
        super().__init__()
        self.logger = logging.getLogger("smart_bin.main_viewmodel")
        self.worker = worker
        self.device_client = DeviceClient()
        self.thingsboard_client = ThingsboardClient()
        self.access_token = None
        self.telemetry_interval_ms = APP_CONFIG.viewmodel.telemetry_interval_ms
        self.upload_interval_ms = APP_CONFIG.viewmodel.upload_interval_ms
        self.upload_batch_size = APP_CONFIG.viewmodel.upload_batch_size
        self.current_detection_metadata_path = None
        self.metadata_dir = APP_CONFIG.paths.detection_metadata_dir
        self.metadata_dir.mkdir(parents=True, exist_ok=True)
        self._upload_in_progress = False
        
        # Kết nối Worker với ViewModel
        self.worker.trash_detected.connect(self._on_trash_detected)
        self.worker.worker_ready.connect(self._on_worker_ready)

        # Quản lý thời gian ở ViewModel
        self.feedback_timer = QTimer()
        self.feedback_timer.setSingleShot(True)
        self.feedback_timer.timeout.connect(self.reset_to_welcome)

        self.thanks_timer = QTimer()
        self.thanks_timer.setSingleShot(True)
        self.thanks_timer.timeout.connect(self.reset_to_welcome)

        self.telemetry_timer = QTimer()
        self.telemetry_timer.setSingleShot(False)
        self.telemetry_timer.setInterval(self.telemetry_interval_ms)
        self.telemetry_timer.timeout.connect(self._send_periodic_telemetry)

        self.access_token_retry_timer = QTimer()
        self.access_token_retry_timer.setSingleShot(False)
        self.access_token_retry_timer.setInterval(self.telemetry_interval_ms)
        self.access_token_retry_timer.timeout.connect(self._retry_get_access_token)

        self.upload_timer = QTimer()
        self.upload_timer.setSingleShot(False)
        self.upload_timer.setInterval(self.upload_interval_ms)
        self.upload_timer.timeout.connect(self._upload_detection_results_batch)
        self.logger.info("MainViewModel khoi tao xong")

    def start_system(self):
        """Khởi động toàn bộ hệ thống"""
        self.state_loading.emit("Dang khoi tao model AI va camera...")
        self.worker.start() # Bật luồng Camera + AI chạy ngầm
        self.logger.info("start_system da duoc goi")

    def _on_worker_ready(self, ready: bool, message: str):
        if not ready:
            self.state_loading.emit(f"Khoi tao that bai: {message}")
            self.state_toast.emit("Khoi tao AI that bai", False)
            return

        self.state_loading.emit("Khoi tao xong. Dang ket noi he thong...")
        self.reset_to_welcome()
        self._refresh_access_token(reason="startup")

        if not self.upload_timer.isActive():
            self.upload_timer.start()
            self.logger.info(
                "Bat dau upload detection theo batch moi %sms, toi da %s anh/lan",
                self.upload_interval_ms,
                self.upload_batch_size,
            )

    def _on_trash_detected(self, trash_data: TrashData):
        """Khi AI nhận diện có rác"""
        self.logger.info(
            "Nhan ket qua detect: category=%s label=%s conf=%.3f id=%s",
            trash_data.category,
            trash_data.label,
            trash_data.confidence,
            trash_data.detection_id,
        )
        # Persist raw result first so feedback can patch the same metadata file later.
        self.current_detection_metadata_path = self._save_detection_metadata(trash_data, "khong_danh_gia")
        self.worker.pause_detection() # Tạm dừng AI trong lúc hỏi người dùng
        self.state_feedback.emit(trash_data) # Báo cho View hiện màn Feedback
        self.feedback_timer.start(APP_CONFIG.viewmodel.feedback_timeout_ms)
        self.logger.info(
            "Chuyen sang man feedback, timeout=%sms",
            APP_CONFIG.viewmodel.feedback_timeout_ms,
        )

    def handle_feedback(self, is_correct: bool):
        """Khi người dùng bấm nút Đúng/Sai từ View"""
        self.feedback_timer.stop()
        # Update feedback on the current detection metadata.
        self._update_current_feedback("dung" if is_correct else "sai")
        self.logger.info("Nguoi dung feedback: %s", "dung" if is_correct else "sai")
        
        self.state_thanks.emit() # Báo cho View hiện màn Thanks
        self.thanks_timer.start(APP_CONFIG.viewmodel.thanks_timeout_ms)
        self.logger.info(
            "Chuyen sang man thanks, timeout=%sms",
            APP_CONFIG.viewmodel.thanks_timeout_ms,
        )

    def reset_to_welcome(self):
        """Đưa hệ thống về trạng thái sẵn sàng"""
        # Any timeout or manual action routes back to welcome + resumes detector.
        self.feedback_timer.stop()
        self.thanks_timer.stop()
        self.worker.resume_detection() # Bật lại AI
        self.state_welcome.emit() # Báo View về màn Welcome
        self.logger.info("Reset ve man welcome")


    def get_access_token(self):
        return self.device_client.get_access_token()
    
    def activate_device(self):
        return self.device_client.activate_device()
    
    def send_telemetry(self):
        if not self.access_token:
            return False, "Không có access token"

        return self.thingsboard_client.send_telemetry(self.access_token)

    def get_device_mac_address(self) -> str:
        return self.device_client.get_mac_address()

    def _initialize_telemetry_loop(self):
        # Backward-compatible wrapper; real flow is handled by _refresh_access_token.
        self._refresh_access_token(reason="initialize_telemetry")

    def _refresh_access_token(self, reason: str):
        self.logger.info("Thu get-access-token, reason=%s", reason)
        success, result = self.get_access_token()
        if not success:
            self.logger.warning("Khong lay duoc access token, bo qua telemetry: %s", result)
            self.telemetry_timer.stop()
            self.access_token = None

            error_code = self._extract_error_code(result)
            if error_code == "AVT3010":
                self.state_activation_required.emit(True, "Thiết bị chưa kích hoạt. Nhấn nút Kích hoạt để tiếp tục.")
            else:
                self.state_activation_required.emit(False, "")

            if not self.access_token_retry_timer.isActive():
                self.access_token_retry_timer.start()
                self.logger.info("Bat retry get-access-token moi %sms", self.telemetry_interval_ms)
            return

        token = result.data.access_token if result and result.data else None
        if not token:
            self.logger.warning("Khong co access token trong response, bo qua telemetry")
            self.telemetry_timer.stop()
            self.access_token = None
            if not self.access_token_retry_timer.isActive():
                self.access_token_retry_timer.start()
            return

        self.access_token_retry_timer.stop()
        self.access_token = token
        self.state_activation_required.emit(False, "")
        self.telemetry_timer.start()
        self.logger.info("Da lay access token, bat dau gui telemetry moi 5 phut")

    def _retry_get_access_token(self):
        self._refresh_access_token(reason="retry_timer")

    def _send_periodic_telemetry(self):
        success, message = self.send_telemetry()
        if not success:
            self.logger.warning("Gui telemetry that bai, dung vong lap telemetry: %s", message)
            self.telemetry_timer.stop()
            return

        self.logger.info("Gui telemetry thanh cong")

    def shutdown(self):
        self.telemetry_timer.stop()
        self.access_token_retry_timer.stop()
        self.upload_timer.stop()
        self.worker.stop()
        self.logger.info("MainViewModel shutdown hoan tat")

    def on_back_from_device_link(self):
        self._refresh_access_token(reason="back_from_device_link")

    def activate_device_manually(self):
        self.logger.info("Nguoi dung bam kich hoat thiet bi")
        success, result = self.activate_device()
        if success:
            self.state_toast.emit("Kích hoạt thiết bị thành công", True)
            self._refresh_access_token(reason="activate_success")
            return

        message = self._extract_error_message(result)
        self.state_toast.emit(f"Kích hoạt thất bại: {message}", False)

    def _extract_error_code(self, result) -> str | None:
        if isinstance(result, dict):
            code = result.get("code")
            return str(code).upper() if code else None
        if isinstance(result, str) and "AVT3010" in result.upper():
            return "AVT3010"
        return None

    def _extract_error_message(self, result) -> str:
        if isinstance(result, dict):
            return str(result.get("message") or result.get("code") or "Loi khong xac dinh")
        return str(result)

    def _save_detection_metadata(self, trash_data: TrashData, feedback: str) -> Path:
        # Mỗi kết quả detect được lưu metadata riêng để trace và upload sau này.
        detected_at = datetime.now(timezone.utc).isoformat()
        filename = Path(trash_data.image_path).name if trash_data.image_path else None
        metadata = {
            "detectionId": trash_data.detection_id,
            "detectedAt": detected_at,
            "image": trash_data.image_path,
            "filename": filename,
            "category": trash_data.category,
            "confidence": round(float(trash_data.confidence), 6),
            "label": trash_data.label,
            "userFeedback": feedback,
        }

        metadata_name = trash_data.detection_id or f"detection_{int(datetime.now().timestamp() * 1000)}"
        metadata_path = self.metadata_dir / f"{metadata_name}.json"

        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=True, indent=2)

        self.logger.info("Da luu metadata: %s", metadata_path.name)

        return metadata_path

    def _update_current_feedback(self, feedback: str):
        if not self.current_detection_metadata_path:
            return

        metadata_path = Path(self.current_detection_metadata_path)
        if not metadata_path.exists():
            return

        try:
            with open(metadata_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)

            metadata["userFeedback"] = feedback
            metadata["feedbackAt"] = datetime.now(timezone.utc).isoformat()

            with open(metadata_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=True, indent=2)
            self.logger.info("Da cap nhat feedback=%s cho %s", feedback, metadata_path.name)
        except (OSError, json.JSONDecodeError) as e:
            self.logger.exception("Khong cap nhat duoc feedback metadata: %s", e)

    def _upload_detection_results_batch(self):
        if self._upload_in_progress:
            self.logger.info("Bo qua tick upload vi batch truoc chua xong")
            return

        items = self._collect_pending_upload_items()
        if not items:
            self.logger.info("Khong co detection pending de upload")
            return

        self._upload_in_progress = True
        try:
            success_count = 0
            for item in items:
                ok, response = self.device_client.send_report_classification(
                    image_path=item["image_path"],
                    metadata=item["metadata"],
                )
                if not ok:
                    self.logger.warning(
                        "Upload detection qua presigned URL that bai file=%s: %s",
                        item["filename"],
                        response,
                    )
                    continue

                self._safe_delete_file(item["image_path"])
                self._safe_delete_file(item["metadata_path"])
                success_count += 1

            self.logger.info(
                "Upload detection qua presigned URL xong: success=%s/%s",
                success_count,
                len(items),
            )
        finally:
            self._upload_in_progress = False

    def _collect_pending_upload_items(self) -> list[dict]:
        candidates: list[dict] = []
        metadata_files = sorted(self.metadata_dir.glob("*.json"), key=lambda p: p.stat().st_mtime)

        for metadata_path in metadata_files:
            if len(candidates) >= self.upload_batch_size:
                break

            try:
                with open(metadata_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
            except (OSError, json.JSONDecodeError) as e:
                self.logger.warning("Bo qua metadata loi %s: %s", metadata_path.name, e)
                continue

            image_path = metadata.get("image")
            if not image_path:
                self.logger.warning("Bo qua metadata khong co image: %s", metadata_path.name)
                continue

            image_file = Path(image_path)
            if not image_file.exists():
                self.logger.warning("Anh khong ton tai, bo qua: %s", image_path)
                continue

            filename = metadata.get("filename") or image_file.name
            candidates.append(
                {
                    "filename": filename,
                    "image_path": str(image_file),
                    "metadata_path": str(metadata_path),
                    "metadata": metadata,
                }
            )

        return candidates

    def _safe_delete_file(self, file_path: str):
        try:
            Path(file_path).unlink(missing_ok=True)
        except OSError as e:
            self.logger.warning("Khong xoa duoc file %s: %s", file_path, e)