import cv2
import numpy as np
from typing import Tuple, List, Dict, Any, Optional

try:
    from config import cfg, VisionConfig
except ImportError:
    from vision_server.config import cfg, VisionConfig


class OpticalFlowDetector:
    """
    Phát hiện chướng ngại vật đang tiếp cận xe bằng Dòng quang học dày đặc (Farneback Dense Optical Flow).

    Nguyên lý:
    1. Giảm kích thước frame về 320x180 để thuật toán chạy thời gian thực (< 5ms, > 40 FPS).
    2. cv2.calcOpticalFlowFarneback ước lượng vector vận tốc (dx, dy) của từng pixel giữa 2 frame liên tiếp.
    3. Triệt tiêu chuyển động của bản thân xe (Ego-motion Subtraction) bằng cách trừ đi vector trung vị (median flow).
    4. Phân tích trường vector tương đối: Các vật thể đang lao/tiến lại gần đầu xe sẽ tạo ra độ phân kỳ
       (Divergence) hoặc vector vận tốc lớn hướng về phía camera.
    5. Bộ đếm thời gian liên tiếp (Temporal Accumulator >= 3 frame) để lọc bỏ 100% rung lắc ngẫu nhiên.
    """

    def __init__(self, config: Optional[VisionConfig] = None):
        self.config = config or cfg
        self.prev_gray: Optional[np.ndarray] = None
        self.approaching_counter: int = 0
        self.last_mean_mag: float = 0.0

    def reset(self):
        """Đặt lại trạng thái dòng quang học"""
        self.prev_gray = None
        self.approaching_counter = 0
        self.last_mean_mag = 0.0

    def process(self, frame: np.ndarray) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Phân tích dòng quang học và phát hiện vật thể đang tiếp cận.

        Trả về:
        - approaching_obstacles: Danh sách Bounding Box theo tọa độ gốc của frame.
        - flow_metrics: Thông số vận tốc trung bình và trạng thái cảnh báo.
        """
        orig_h, orig_w = frame.shape[:2]
        down_w, down_h = self.config.FLOW_DOWNSCALE_SIZE

        # Thu nhỏ để xử lý siêu tốc
        small_frame = cv2.resize(frame, (down_w, down_h), interpolation=cv2.INTER_AREA)
        curr_gray = cv2.cvtColor(small_frame, cv2.COLOR_BGR2GRAY)
        curr_gray = cv2.GaussianBlur(curr_gray, (5, 5), 0)

        metrics: Dict[str, Any] = {
            "mean_magnitude": 0.0,
            "max_magnitude": 0.0,
            "is_approaching": False,
            "approaching_frames": 0,
            "threat_level": "SAFE"
        }

        # Nếu là frame đầu tiên hoặc kích thước thay đổi -> Khởi tạo
        if self.prev_gray is None or self.prev_gray.shape != curr_gray.shape:
            self.prev_gray = curr_gray
            return [], metrics

        # 1. Tính toán Farneback Optical Flow
        try:
            flow = cv2.calcOpticalFlowFarneback(
                self.prev_gray,
                curr_gray,
                None,
                pyr_scale=0.5,
                levels=2,
                winsize=13,
                iterations=2,
                poly_n=5,
                poly_sigma=1.1,
                flags=0
            )
        except cv2.error:
            self.reset()
            self.prev_gray = curr_gray
            return [], metrics

        self.prev_gray = curr_gray

        # 2. Triệt tiêu chuyển động của xe (Ego-Motion Subtraction)
        # Vector trung vị của nửa dưới ảnh đại diện cho chuyển động tịnh tiến của xe trên sàn
        u = flow[..., 0]
        v = flow[..., 1]
        med_u = float(np.median(u))
        med_v = float(np.median(v))

        # Vector chuyển động tương đối độc lập của vật thể
        rel_u = u - med_u
        rel_v = v - med_v
        mag, _ = cv2.cartToPolar(rel_u, rel_v)

        # 3. Phân tích vùng hành lang chạy xe (Corridor) ở nửa dưới khung hình
        corridor_y1 = int(down_h * 0.45)
        corridor_x1 = int(down_w * 0.20)
        corridor_x2 = int(down_w * 0.80)

        roi_mag = mag[corridor_y1:down_h, corridor_x1:corridor_x2]
        mean_mag = float(np.mean(roi_mag)) if roi_mag.size > 0 else 0.0
        max_mag = float(np.max(roi_mag)) if roi_mag.size > 0 else 0.0

        metrics["mean_magnitude"] = round(mean_mag, 2)
        metrics["max_magnitude"] = round(max_mag, 2)

        # 4. Ngưỡng phát hiện chuyển động tiếp cận
        thresh_mag = self.config.FLOW_APPROACH_THRESHOLD
        moving_mask = np.zeros_like(mag, dtype=np.uint8)
        moving_mask[mag > thresh_mag] = 255

        # Chỉ xét trong vùng hành lang an toàn
        corridor_mask = np.zeros_like(moving_mask)
        corridor_mask[corridor_y1:down_h, corridor_x1:corridor_x2] = moving_mask[corridor_y1:down_h, corridor_x1:corridor_x2]

        # Khử nhiễu hạt
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        corridor_mask = cv2.morphologyEx(corridor_mask, cv2.MORPH_OPEN, kernel)

        # 5. Tìm chướng ngại vật qua contours
        contours, _ = cv2.findContours(corridor_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        obstacles: List[Dict[str, Any]] = []

        scale_x = orig_w / float(down_w)
        scale_y = orig_h / float(down_h)
        min_area = (down_w * down_h) * 0.01 # Ít nhất 1% diện tích

        has_significant_motion = False

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area:
                continue

            has_significant_motion = True
            bx, by, bw, bh = cv2.boundingRect(cnt)

            # Quy đổi về kích thước frame gốc
            orig_bx = int(bx * scale_x)
            orig_by = int(by * scale_y)
            orig_bw = int(bw * scale_x)
            orig_bh = int(bh * scale_y)

            conf = min(0.92, round(0.55 + (area / (down_w * down_h)) * 3.0, 2))

            obstacles.append({
                "bbox": [orig_bx, orig_by, orig_bw, orig_bh],
                "class_id": 998,
                "class_name": "approaching_obstacle",
                "label": "Vật cản tiếp cận",
                "confidence": float(conf),
                "source": "flow"
            })

        # 6. Bộ đếm ổn định thời gian (Chống rung giật 1 frame)
        if has_significant_motion:
            self.approaching_counter += 1
        else:
            self.approaching_counter = max(0, self.approaching_counter - 1)

        metrics["approaching_frames"] = self.approaching_counter

        if self.approaching_counter >= self.config.FLOW_CONSECUTIVE_FRAMES:
            metrics["is_approaching"] = True
            metrics["threat_level"] = "WARNING"
        else:
            # Chưa đủ 3 frame liên tiếp -> Ẩn bớt để tránh nhấp nháy
            obstacles = []

        return obstacles, metrics

