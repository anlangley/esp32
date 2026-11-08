import cv2
import time
import threading
import urllib.request
import numpy as np
from typing import Optional, Tuple
from config import cfg

class CameraStreamManager:
    """
    Quản lý luồng video từ IP Webcam (Galaxy S10 5G).
    Sử dụng pure Python HTTP stream reader + cv2.imdecode.
    HOÀN TOÀN KHÔNG DÙNG FFmpeg C demuxer -> Triệt tiêu 100% lỗi crash:
    'Assertion pkt->stream_index < (unsigned)s->nb_streams ... failed at libavformat/demux.c'
    """

    def __init__(self, stream_url: Optional[str] = None):
        self.stream_url = stream_url or cfg.CAMERA_URL
        self.latest_frame: Optional[np.ndarray] = None
        self.last_frame_time: float = 0.0
        self.fps: float = 0.0
        self.is_connected: bool = False
        self.is_running: bool = False
        
        self._lock = threading.Lock()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        """Khởi động luồng đọc camera chạy nền"""
        if self.is_running:
            return
        self.is_running = True
        self._thread = threading.Thread(target=self._capture_worker, daemon=True)
        self._thread.start()
        print(f"📡 [CameraStream] Background worker started. Target: {self.stream_url}")

    def stop(self):
        """Dừng luồng đọc camera"""
        self.is_running = False
        print("🛑 [CameraStream] Stopped.")

    def set_stream_url(self, new_url: str):
        """Cập nhật URL camera linh hoạt không cần restart server"""
        with self._lock:
            self.stream_url = new_url
        print(f"🔄 [CameraStream] Camera URL changed to: {new_url}")

    def _capture_worker(self):
        """
        Worker thread đọc luồng MJPEG bằng Python bytes parsing.
        Hoạt động siêu bền bỉ, tự động phục hồi kết nối và không bao giờ crash tiến trình.
        """
        frame_counter = 0
        fps_start_time = time.time()

        while self.is_running:
            current_url = self.stream_url
            stream = None
            try:
                # Kết nối HTTP stream với timeout an toàn
                req = urllib.request.Request(
                    current_url,
                    headers={'User-Agent': 'IoT-Car-Vision/1.0'}
                )
                stream = urllib.request.urlopen(req, timeout=4.0)
                self.is_connected = True
                print(f"✅ [CameraStream] Connected successfully to {current_url}")

                raw_buffer = b''
                while self.is_running:
                    # Nếu URL bị thay đổi từ bên ngoài -> ngắt để kết nối URL mới
                    if self.stream_url != current_url:
                        break

                    chunk = stream.read(8192)
                    if not chunk:
                        break
                    raw_buffer += chunk

                    # Quét tìm điểm bắt đầu (\xff\xd8) và kết thúc (\xff\xd9) của frame JPEG
                    a = raw_buffer.find(b'\xff\xd8')
                    b = raw_buffer.find(b'\xff\xd9')

                    if a != -1 and b != -1:
                        if b > a:
                            jpg_bytes = raw_buffer[a:b+2]
                            raw_buffer = raw_buffer[b+2:]

                            # Giải mã ảnh JPEG bằng OpenCV imdecode
                            frame = cv2.imdecode(np.frombuffer(jpg_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
                            if frame is not None:
                                now = time.time()
                                frame_counter += 1

                                if now - fps_start_time >= 1.0:
                                    self.fps = round(frame_counter / (now - fps_start_time), 1)
                                    frame_counter = 0
                                    fps_start_time = now

                                with self._lock:
                                    self.latest_frame = frame
                                    self.last_frame_time = now
                        else:
                            # Khung hình bị lỗi, bỏ đoạn rác phía trước
                            raw_buffer = raw_buffer[a:]

                    # Chống phình bộ nhớ nếu rớt mạng giữa chừng
                    if len(raw_buffer) > 2_000_000:
                        raw_buffer = b''

            except Exception as e:
                self.is_connected = False
                
                # Thử fallback kéo snapshot /shot.jpg nếu luồng stream /video chập chờn
                try:
                    snapshot_url = current_url.replace('/video', '/shot.jpg')
                    req_snap = urllib.request.Request(snapshot_url, headers={'User-Agent': 'IoT-Car-Vision/1.0'})
                    with urllib.request.urlopen(req_snap, timeout=1.5) as snap_resp:
                        snap_data = snap_resp.read()
                        frame = cv2.imdecode(np.frombuffer(snap_data, dtype=np.uint8), cv2.IMREAD_COLOR)
                        if frame is not None:
                            self.is_connected = True
                            now = time.time()
                            with self._lock:
                                self.latest_frame = frame
                                self.last_frame_time = now
                except Exception:
                    pass

                time.sleep(1.0)
            finally:
                if stream:
                    try:
                        stream.close()
                    except Exception:
                        pass

    def get_latest_frame(self) -> Tuple[bool, np.ndarray]:
        """
        Lấy frame mới nhất.
        Nếu camera mất tín hiệu > 3 giây, trả về frame mô phỏng (Test pattern)
        """
        now = time.time()
        with self._lock:
            if (
                self.latest_frame is not None 
                and self.is_connected 
                and (now - self.last_frame_time < 3.0)
            ):
                return True, self.latest_frame.copy()

        # Tạo fallback frame khi camera offline
        return False, self._generate_fallback_frame()

    def _generate_fallback_frame(self) -> np.ndarray:
        """Tạo khung hình giả lập khi camera điện thoại chưa bật"""
        h, w = 480, 640
        canvas = np.zeros((h, w, 3), dtype=np.uint8)
        canvas[:] = (25, 27, 34)

        for x in range(0, w, 40):
            cv2.line(canvas, (x, 0), (x, h), (38, 42, 53), 1)
        for y in range(0, h, 40):
            cv2.line(canvas, (0, y), (w, y), (38, 42, 53), 1)

        cv2.putText(canvas, "CAMERA OFFLINE / STANDBY", (130, 210), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 180, 255), 2)
        cv2.putText(canvas, f"Target: {self.stream_url}", (110, 250), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (160, 160, 160), 1)
        cv2.putText(canvas, time.strftime("%H:%M:%S"), (280, 290), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (57, 255, 20), 2)

        return canvas

    def encode_jpeg(self, frame: np.ndarray, quality: int = 80) -> Optional[bytes]:
        """Mã hóa frame sang JPEG bytes để gửi qua HTTP hoặc stream"""
        ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        if ret:
            return buffer.tobytes()
        return None

# Singleton instance
camera_manager = CameraStreamManager()
