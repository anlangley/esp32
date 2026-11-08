import os
from pathlib import Path
from dotenv import load_dotenv

# Tìm và đọc .env từ backend hoặc cùng thư mục
BASE_DIR = Path(__file__).resolve().parent
BACKEND_ENV = BASE_DIR.parent / "backend" / ".env"
if BACKEND_ENV.exists():
    load_dotenv(BACKEND_ENV)
load_dotenv(BASE_DIR / ".env")

class Config:
    # Camera Configuration
    # IP Webcam stream mặc định từ Galaxy S10 5G
    DEFAULT_CAMERA_IP = os.getenv("CAMERA_IP", "192.168.1.12")
    DEFAULT_CAMERA_PORT = os.getenv("CAMERA_PORT", "8080")
    CAMERA_URL = os.getenv(
        "CAMERA_URL", 
        f"http://{DEFAULT_CAMERA_IP}:{DEFAULT_CAMERA_PORT}/video"
    )
    CAMERA_SNAPSHOT_URL = os.getenv(
        "CAMERA_SNAPSHOT_URL", 
        f"http://{DEFAULT_CAMERA_IP}:{DEFAULT_CAMERA_PORT}/shot.jpg"
    )

    # Server settings
    HOST = "0.0.0.0"
    PORT = int(os.getenv("VISION_PORT", "8000"))
    
    # Node.js Backend URL (để gửi cảnh báo va chạm khẩn cấp)
    NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://localhost:3000")

    # YOLO AI Detection Settings
    MODEL_NAME = os.getenv("YOLO_MODEL", "yolov8n.pt")  # Nano: ~3MB, siêu nhanh
    CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.35"))
    IOU_THRESHOLD = float(os.getenv("IOU_THRESHOLD", "0.45"))
    TARGET_FPS = int(os.getenv("TARGET_FPS", "30"))

    # Collision Warning Thresholds (dựa trên diện tích & vị trí vật cản)
    # Nếu vật cản ở nửa dưới khung hình và chiều cao > 35% frame -> CẢNH BÁO
    WARNING_HEIGHT_RATIO = 0.35
    # Nếu vật cản chiếm > 50% chiều cao -> DỪNG KHẨN CẤP (EMERGENCY STOP)
    EMERGENCY_HEIGHT_RATIO = 0.50

    # Device: Tự động dùng GPU CUDA nếu có
    @staticmethod
    def get_device():
        try:
            import torch
            if torch.cuda.is_available():
                return "0"  # GPU index 0 (RTX 3050)
        except ImportError:
            pass
        return "cpu"

cfg = Config()
