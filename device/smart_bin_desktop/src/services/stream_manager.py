import queue
import logging
import subprocess
import threading

class RtspEncoder:
    """Quản lý FFmpeg, nhận Frame từ OpenCV và pipe thẳng lên Media Server qua RTSP"""
    
    def __init__(self, width: int, height: int, rtsp_url: str, fps: int = 15):
        self.logger = logging.getLogger("smart_bin.rtsp_encoder")
        self.width = width
        self.height = height
        self.fps = fps
        self.rtsp_url = rtsp_url
        self.frame_queue = queue.Queue(maxsize=30)
        self.process = None
        self._is_running = False
        
    def start(self):
        self._is_running = True
        
        # Lệnh FFmpeg nhận đầu vào từ Pipe (stdin) và đẩy trực tiếp ra RTSP
        ffmpeg_cmd = [
            'ffmpeg', # Sửa lại đường dẫn nếu cần
            '-y',
            '-f', 'rawvideo',
            '-vcodec', 'rawvideo',
            '-pixel_format', 'bgr24',
            '-video_size', f'{self.width}x{self.height}',
            '-framerate', str(self.fps),
            '-i', '-', 
            
            # Cấu hình H264 tối ưu cho độ trễ thấp
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-rtsp_transport', 'tcp',
            '-f', 'rtsp',
            self.rtsp_url
        ]
        
        self.process = subprocess.Popen(
            ffmpeg_cmd, 
            stdin=subprocess.PIPE, 
            stdout=subprocess.DEVNULL, 
            # stderr=subprocess.DEVNULL
        )
        
        threading.Thread(target=self._push_to_ffmpeg_loop, daemon=True).start()
        self.logger.info("RTSP FFmpeg Encoder started. Pushing to: %s", self.rtsp_url)
        
    def _push_to_ffmpeg_loop(self):
        while self._is_running and self.process and self.process.poll() is None:
            try:
                frame = self.frame_queue.get(timeout=1.0)
                if frame is not None:
                    # Chuyển frame thành mảng byte và ném thẳng vào Pipe cho FFmpeg
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
        self.logger.info("RTSP FFmpeg Encoder stopped.")