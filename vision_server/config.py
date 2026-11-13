import os
import json
import hashlib
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import Tuple, Dict, Any
from dotenv import load_dotenv

# Tìm và đọc .env từ backend hoặc cùng thư mục
BASE_DIR = Path(__file__).resolve().parent
BACKEND_ENV = BASE_DIR.parent / "backend" / ".env"
if BACKEND_ENV.exists():
    load_dotenv(BACKEND_ENV)
load_dotenv(BASE_DIR / ".env")


@dataclass
class VisionConfig:
    """
    Cấu hình trung tâm cho toàn bộ Vision Server (FastAPI + YOLOv8 + OpenCV).
    Hỗ trợ bật/tắt từng Phase và lưu snapshot cấu hình cho việc chạy thực nghiệm.
    Mặc định: Tất cả cờ mới đều để False / baseline để không làm thay đổi hành vi cũ.
    """

    # ==================== CAMERA & MẠNG ====================
    DEFAULT_CAMERA_IP: str = os.getenv("CAMERA_IP", "192.168.1.12")
    DEFAULT_CAMERA_PORT: str = os.getenv("CAMERA_PORT", "8080")
    CAMERA_URL: str = os.getenv(
        "CAMERA_URL",
        f"http://{DEFAULT_CAMERA_IP}:{DEFAULT_CAMERA_PORT}/video"
    )
    CAMERA_SNAPSHOT_URL: str = os.getenv(
        "CAMERA_SNAPSHOT_URL",
        f"http://{DEFAULT_CAMERA_IP}:{DEFAULT_CAMERA_PORT}/shot.jpg"
    )

    HOST: str = "0.0.0.0"
    PORT: int = int(os.getenv("VISION_PORT", "8000"))
    NODE_BACKEND_URL: str = os.getenv("NODE_BACKEND_URL", "http://localhost:3000")
    ROTATION: int = int(os.getenv("CAMERA_ROTATION", "0"))  # 0, 90, 180, 270 độ

    # ==================== YOLO DETECTION ====================
    MODEL_NAME: str = os.getenv("YOLO_MODEL", "yolov8n.pt")
    CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.35"))
    IOU_THRESHOLD: float = float(os.getenv("IOU_THRESHOLD", "0.45"))
    TARGET_FPS: int = int(os.getenv("TARGET_FPS", "30"))

    # ==================== CẢNH BÁO VA CHẠM BASELINE ====================
    WARNING_HEIGHT_RATIO: float = 0.35
    EMERGENCY_HEIGHT_RATIO: float = 0.50

    # ==================== PHASE 1: TIỀN XỬ LÝ & ỔN ĐỊNH ẢNH ====================
    # Cờ bật/tắt tính năng (mặc định False giữ nguyên baseline cũ)
    ENABLE_PREPROCESS: bool = False       # Bật tiền xử lý thích nghi (Gamma / CLAHE)
    ENABLE_BLUR_FILTER: bool = False      # Bật lọc bỏ frame mờ (không phanh trên frame mờ)
    ENABLE_STABILIZER: bool = False       # Bật ổn định ảnh VideoStabilizer
    LANE_THRESHOLD_MODE: str = "otsu"     # "otsu" (baseline) | "adaptive" | "auto"

    # Ngưỡng đánh giá chất lượng ảnh
    BRIGHTNESS_LOW: float = 70.0          # Dưới ngưỡng này coi là tối -> Gamma correction < 1
    BRIGHTNESS_HIGH: float = 190.0        # Trên ngưỡng này coi là chói -> Gamma correction > 1
    CONTRAST_LOW: float = 35.0            # Dưới ngưỡng này coi là tương phản thấp -> CLAHE
    SHARPNESS_LOW: float = 60.0           # Dưới ngưỡng này coi là frame mờ (Laplacian variance)

    # Tham số tăng cường ảnh thích nghi
    GAMMA_MIN: float = 0.4
    GAMMA_MAX: float = 2.5
    CLAHE_CLIP_LIMIT: float = 2.0
    CLAHE_TILE_GRID_SIZE: Tuple[int, int] = (8, 8)

    # Tham số nhị phân hóa vạch kẻ đường (Lane Binarization)
    LANE_BLOCK_SIZE: int = 31             # Block size cho adaptiveThreshold (phải là số lẻ)
    LANE_C_VALUE: int = 10                # Hằng số trừ C trong adaptiveThreshold
    LANE_VARIANCE_THRESHOLD: float = 12.0 # Độ lệch chuẩn ánh sáng 4x4 để phân biệt đều sáng vs bóng đổ

    # Tham số ổn định hình ảnh (Stabilizer)
    STABILIZER_MAX_CORNERS: int = 200     # Số điểm đặc trưng tối đa cho GoodFeaturesToTrack
    STABILIZER_QUALITY_LEVEL: float = 0.01
    STABILIZER_MIN_DISTANCE: float = 20.0
    STABILIZER_SMOOTH_WINDOW: int = 15    # Cửa sổ Moving Average làm mượt quỹ đạo
    STABILIZER_CROP_RATIO: float = 0.04   # Cắt 4% viền để triệt tiêu vệt đen biến đổi

    # ==================== PHASE 2: PHÁT HIỆN VẬT CẢN CỔ ĐIỂN & HỢP NHẤT ====================
    ENABLE_FREESPACE: bool = False        # Bật phân đoạn mặt sàn an toàn (HSV BackProjection)
    ENABLE_FLOW: bool = False             # Bật phát hiện vật cản tiến gần (Dense Optical Flow)
    FUSION_MODE: str = "yolo_only"        # "yolo_only" (baseline) | "freespace_only" | "flow_only" | "or" | "vote"

    # Tham số Phân đoạn sàn (Freespace)
    FREESPACE_SAMPLE_Y_START: float = 0.72      # Bắt đầu vùng lấy mẫu: 72% chiều cao (tránh bóng gầm cản trước)
    FREESPACE_SAMPLE_Y_END: float = 0.86        # Kết thúc vùng lấy mẫu: 86% chiều cao
    FREESPACE_SAMPLE_W_MIN: float = 0.30        # Chiều rộng bắt đầu lấy mẫu (30%)
    FREESPACE_SAMPLE_W_MAX: float = 0.70        # Chiều rộng kết thúc lấy mẫu (70%)
    FREESPACE_HIST_BINS: Tuple[int, int] = (18, 16) # Bins màu (H: 18, S: 16) làm mượt vân gỗ và bóng râm
    FREESPACE_EMA_ALPHA: float = 0.05           # Tốc độ học thích nghi màu sàn mới (EMA)
    FREESPACE_CORRIDOR_Y_START: float = 0.52    # Bắt đầu hành lang (52% chiều cao, tránh tường và chân len tường)
    FREESPACE_CORRIDOR_W_RATIO: float = 0.55    # Chiều rộng hành lang chạy xe (55% giữa ảnh)
    FREESPACE_MIN_CONTOUR_AREA_RATIO: float = 0.035 # Diện tích tối thiểu để coi là vật cản (3.5% diện tích hành lang)
    FREESPACE_THRESHOLD: int = 20               # Ngưỡng nhị phân hóa BackProjection thích nghi vân gạch/vân gỗ

    # Tham số Dòng quang học (Optical Flow Farneback)
    FLOW_DOWNSCALE_SIZE: Tuple[int, int] = (320, 180) # Giảm độ phân giải để đảm bảo tốc độ >= 30 FPS
    FLOW_APPROACH_THRESHOLD: float = 1.8        # Ngưỡng vector tiếp cận hướng vào đầu xe
    FLOW_CONSECUTIVE_FRAMES: int = 3            # Số frame liên tiếp để xác nhận vật cản tiếp cận

    # Tham số Hợp nhất (Fusion)
    FUSION_IOU_THRESHOLD: float = 0.30          # Ngưỡng IoU để gộp Bounding Box trùng lặp giữa YOLO và Freespace
    FUSION_STABILITY_FRAMES: int = 3            # Số frame liên tiếp để hiển thị vật cản cổ điển (lọc nhiễu hạt)

    # ==================== CÁC PHASE TIẾP THEO (MẶC ĐỊNH BASELINE) ====================
    CORRIDOR_MODE: str = "static"         # "static" | "dynamic" | "lane_mask"
    WARNING_MODE: str = "height"          # "height" | "ttc"
    DEBUG_VIEW: bool = False              # Bật luồng ảnh debug nhiều bước

    @staticmethod
    def get_device() -> str:
        """Kiểm tra và trả về thiết bị tính toán: GPU index '0' nếu có CUDA, ngược lại 'cpu'."""
        try:
            import torch
            if torch.cuda.is_available():
                return "0"
        except ImportError:
            pass
        return "cpu"

    def to_dict(self) -> Dict[str, Any]:
        """Xuất toàn bộ cấu hình thành dictionary JSON-serializable."""
        d = asdict(self)
        d["CLAHE_TILE_GRID_SIZE"] = list(self.CLAHE_TILE_GRID_SIZE)
        d["FREESPACE_HIST_BINS"] = list(self.FREESPACE_HIST_BINS)
        d["FLOW_DOWNSCALE_SIZE"] = list(self.FLOW_DOWNSCALE_SIZE)
        return d

    def update_from_dict(self, updates: Dict[str, Any]) -> None:
        """Cập nhật linh hoạt cấu hình từ dictionary (dùng cho API hoặc Replay batch)."""
        for k, v in updates.items():
            if hasattr(self, k):
                if k in ("CLAHE_TILE_GRID_SIZE", "FREESPACE_HIST_BINS", "FLOW_DOWNSCALE_SIZE") and isinstance(v, (list, tuple)):
                    v = (int(v[0]), int(v[1]))
                expected_type = type(getattr(self, k))
                try:
                    if expected_type is bool and isinstance(v, str):
                        setattr(self, k, v.lower() in ("true", "1", "yes"))
                    else:
                        setattr(self, k, expected_type(v))
                except Exception:
                    setattr(self, k, v)

    def get_hash(self) -> str:
        """Tạo mã băm MD5 duy nhất từ cấu hình hiện tại để lưu kèm log thực nghiệm."""
        payload = json.dumps(self.to_dict(), sort_keys=True)
        return hashlib.md5(payload.encode("utf-8")).hexdigest()[:8]


# Singleton instance toàn cục
cfg = VisionConfig()
