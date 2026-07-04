import os
import time
import queue
import shutil
import platform
import logging
import subprocess
import threading
import requests
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from PyQt6.QtCore import QThread

IS_WINDOWS = platform.system() == "Windows"
STREAM_DIR = Path("D:/tmp/smartbin-stream") if IS_WINDOWS else Path("/dev/shm/smartbin-stream")

# Các file mà FFmpeg thực sự sinh ra để phát HLS. FFmpeg ghi playlist qua file
# tạm "*.m3u8.tmp" (đang mở độc quyền) rồi mới rename thành "output.m3u8", nên
# phải loại các file tạm này ra, không thì sẽ dính PermissionError khi cố mở
# file đang bị FFmpeg khoá để ghi (đặc biệt trên Windows).
_VALID_SEGMENT_SUFFIXES = ('.ts', '.m3u8')


class HlsUploaderWorker(QThread, FileSystemEventHandler):
    def __init__(self, mac_address: str, upload_url: str, token: str):
        super().__init__()
        self.logger = logging.getLogger("smart_bin.hls_uploader")
        self.mac_address = mac_address
        self.upload_url = f"{upload_url}/public/{mac_address}/upload"
        self.token = token
        self.observer = Observer()
        self._is_running = True
        
    def run(self):
        STREAM_DIR.mkdir(parents=True, exist_ok=True)
        self.observer.schedule(self, str(STREAM_DIR), recursive=False)
        self.observer.start()
        self.logger.info("HLS Uploader started watching: %s", STREAM_DIR)
        
        while self._is_running:
            time.sleep(1)
            
        self.observer.stop()
        self.observer.join()
        
    def stop(self):
        self._is_running = False
        self.quit()
        self.wait() 
        
    def on_created(self, event):
        if not event.is_directory and self._is_valid_segment(event.src_path):
            self._trigger_upload(event.src_path)

    def on_modified(self, event):
        if not event.is_directory and event.src_path.endswith('.m3u8') and self._is_valid_segment(event.src_path):
            self._trigger_upload(event.src_path)
            
    def on_moved(self, event):
        if not event.is_directory and self._is_valid_segment(event.dest_path):
            self._trigger_upload(event.dest_path)

    @staticmethod
    def _is_valid_segment(filepath: str) -> bool:
        """Chỉ nhận .ts và .m3u8 thật sự; bỏ qua file tạm .m3u8.tmp mà FFmpeg
        đang giữ khoá để ghi (nguồn gây PermissionError khi upload)."""
        return filepath.endswith(_VALID_SEGMENT_SUFFIXES)
            
    def _trigger_upload(self, filepath: str):
        # Đẩy việc upload ra Thread riêng để không block Watchdog loop
        threading.Thread(target=self._upload_file_task, args=(filepath,), daemon=True).start()

    def _upload_file_task(self, filepath: str):
        filename = os.path.basename(filepath)
        if filename.endswith('.ts'):
            time.sleep(0.1) # Chờ 1 chút để FFmpeg chốt block data cuối vào file

        # Phòng hờ file bị FFmpeg xoá trong lúc chờ
        if not os.path.exists(filepath):
            return

        try:
            with open(filepath, 'rb') as f:
                files = {'file': (filename, f)}
                data = {'fileName': filename}
                headers = {}
                
                resp = requests.post(self.upload_url, files=files, data=data, headers=headers, timeout=5)
                if resp.status_code != 200:
                    self.logger.warning("HLS Upload failed %s: HTTP %d", filename, resp.status_code)
        except Exception as e:
            self.logger.error("HLS Upload network error for %s: %s", filename, e)


class HlsEncoder:
    """Quản lý FFmpeg, nhận Frame từ OpenCV và pipe thẳng vào tiến trình nén"""
    
    def __init__(self, width: int, height: int, fps: int = 15):
        self.logger = logging.getLogger("smart_bin.hls_encoder")
        self.width = width
        self.height = height
        self.fps = fps
        self.frame_queue = queue.Queue(maxsize=30)
        self.process = None
        self._is_running = False
        
    def start(self):
        self._is_running = True
        
        # Dọn dẹp rác từ phiên stream trước
        shutil.rmtree(STREAM_DIR, ignore_errors=True)
        STREAM_DIR.mkdir(parents=True, exist_ok=True)
        
        # Lệnh FFmpeg nhận đầu vào từ Pipe (stdin)
        ffmpeg_cmd = [
            'D:/ffmpeg-8.1.2-essentials_build/ffmpeg-8.1.2-essentials_build/bin/ffmpeg.exe',
            '-y',
            '-f', 'rawvideo',
            '-vcodec', 'rawvideo',
            '-pixel_format', 'bgr24', # Định dạng mảng chuẩn của OpenCV
            '-video_size', f'{self.width}x{self.height}',
            '-framerate', str(self.fps),
            '-i', '-', 
            
            # Cấu hình H264 & HLS đầu ra
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            # Ép keyframe cách nhau đúng segment_seconds * fps, đồng thời tắt
            # scene-cut detection để x264 không tự chèn keyframe phụ làm lệch
            # mốc cắt segment. Không set 2 dòng này thì HLS muxer sẽ cắt theo
            # keyint mặc định của x264 (~250 frame ~ 16s @15fps), bỏ qua hoàn
            # toàn giá trị -hls_time bên dưới.
            '-g', str(self.fps * self.segment_seconds),
            '-keyint_min', str(self.fps * self.segment_seconds),
            '-sc_threshold', '0',
            '-f', 'hls',
            '-hls_time', str(self.segment_seconds),
            '-hls_list_size', '5',
            '-hls_flags', 'delete_segments',
            f'{STREAM_DIR}/output.m3u8'
        ]
        
        self.process = subprocess.Popen(
            ffmpeg_cmd, 
            stdin=subprocess.PIPE, 
            stdout=subprocess.DEVNULL, 
            stderr=subprocess.DEVNULL
        )
        
        # Khởi chạy luồng bơm dữ liệu vào FFmpeg
        threading.Thread(target=self._push_to_ffmpeg_loop, daemon=True).start()
        self.logger.info("HLS FFmpeg Encoder started via Pipe.")
        
    def _push_to_ffmpeg_loop(self):
        while self._is_running and self.process and self.process.poll() is None:
            try:
                frame = self.frame_queue.get(timeout=1.0)
                if frame is not None:
                    # Chuyển numpy array thành mảng Byte thuần ném thẳng vào Pipe
                    self.process.stdin.write(frame.tobytes())
            except queue.Empty:
                continue
            except Exception as e:
                self.logger.warning("Error writing to FFmpeg pipe: %s", e)
                break

    def push_frame(self, frame):
        """Hàm công khai để OpenCV ném ảnh mới nhất vào"""
        if self._is_running and not self.frame_queue.full():
            self.frame_queue.put(frame)
            
    def stop(self):
        self._is_running = False
        if self.process:
            try:
                self.process.stdin.close()
                self.process.terminate()
                self.process.wait(timeout=2)
            except:
                self.process.kill()
        self.logger.info("HLS FFmpeg Encoder stopped.")
        
        # Dọn RAM disk sau khi dừng tránh rò rỉ bộ nhớ
        shutil.rmtree(STREAM_DIR, ignore_errors=True)