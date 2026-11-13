import cv2
import numpy as np
from typing import Tuple, List, Dict, Any, Optional

try:
    from config import cfg, VisionConfig
except ImportError:
    from vision_server.config import cfg, VisionConfig


class FreespaceSegmenter:
    """
    Phân đoạn mặt sàn an toàn & Phát hiện vật cản bằng mô hình màu thích nghi (Freespace Segmentation).
    
    Nguyên lý:
    1. Vùng an toàn ngay trước đầu xe (12% đáy ảnh, 35%-65% chiều rộng) luôn là mặt sàn.
    2. Trích xuất màu sàn trong không gian màu HSV và lập biểu đồ 2D Hue - Saturation (30x32 bins).
    3. Cập nhật mô hình màu sàn liên tục qua Exponential Moving Average (EMA, alpha=0.05) để thích nghi
       khi xe di chuyển qua các chất liệu sàn khác nhau (gạch men bóng, thảm, sàn gỗ, nền bê tông).
    4. Áp dụng cv2.calcBackProject để tính xác suất thuộc về mặt sàn của mọi pixel trên ảnh.
    5. Các pixel có xác suất thấp trong hành lang chạy xe (Corridor) được phân loại là chướng ngại vật
       (chiếc dép, hộp carton, cục gạch, chân bàn ghế) mà YOLO có thể bỏ sót.
    """

    def __init__(self, config: Optional[VisionConfig] = None):
        self.config = config or cfg
        self.floor_hist: Optional[np.ndarray] = None
        self.last_blocked_ratio: float = 0.0

    def reset(self):
        """Đặt lại mô hình màu sàn (khi đổi phòng hoặc camera reset)"""
        self.floor_hist = None
        self.last_blocked_ratio = 0.0

    def sample_floor(self, frame: np.ndarray) -> Tuple[np.ndarray, Tuple[int, int, int, int]]:
        """
        Trích xuất vùng sàn mẫu phía trước xe (khoảng 72% - 86% chiều cao, tránh bóng cản trước).
        Trả về: (vùng ảnh mẫu BGR, tọa độ bounding box [x1, y1, x2, y2])
        """
        h, w = frame.shape[:2]
        y_start_ratio = getattr(self.config, 'FREESPACE_SAMPLE_Y_START', 0.72)
        y_end_ratio = getattr(self.config, 'FREESPACE_SAMPLE_Y_END', 0.86)

        y1 = int(h * y_start_ratio)
        y2 = int(h * y_end_ratio)
        x1 = int(w * self.config.FREESPACE_SAMPLE_W_MIN)
        x2 = int(w * self.config.FREESPACE_SAMPLE_W_MAX)

        sample = frame[y1:y2, x1:x2]
        return sample, (x1, y1, x2, y2)

    def compute_histogram(self, hsv_sample: np.ndarray) -> np.ndarray:
        """
        Tính toán biểu đồ màu 2D Hue - Saturation trên vùng mẫu mặt sàn.
        Làm mượt bằng Gaussian Blur để tăng tính bền vững với vân gỗ và bóng râm nhẹ.
        """
        hist_bins = self.config.FREESPACE_HIST_BINS
        hist = cv2.calcHist(
            [hsv_sample],
            [0, 1],
            None,
            [hist_bins[0], hist_bins[1]],
            [0, 180, 0, 256]
        )
        # Làm mượt biểu đồ tần suất để các biến thể màu sàn lân cận không bị coi là 0
        hist = cv2.GaussianBlur(hist, (3, 3), 0)
        cv2.normalize(hist, hist, 0, 255, cv2.NORM_MINMAX)
        return hist

    def update_floor_model(self, current_hist: np.ndarray):
        """
        Cập nhật mô hình màu mặt sàn theo thời gian sử dụng Exponential Moving Average (EMA).
        Giúp xe thích nghi mượt mà khi ánh sáng phòng đổi hoặc chuyển loại sàn gạch.
        """
        if self.floor_hist is None:
            self.floor_hist = current_hist.copy()
        else:
            alpha = self.config.FREESPACE_EMA_ALPHA
            self.floor_hist = (1.0 - alpha) * self.floor_hist + alpha * current_hist
            cv2.normalize(self.floor_hist, self.floor_hist, 0, 255, cv2.NORM_MINMAX)

    def process(self, frame: np.ndarray) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Phân đoạn mặt sàn và tìm kiếm chướng ngại vật trong hành lang xe chạy.

        Trả về:
        - obstacles: Danh sách Bounding Box vật cản theo chuẩn YOLO [x, y, w, h] kèm nhãn và độ tin cậy.
        - metrics: Dictionary chứa tỷ lệ sàn bị chắn (blocked_ratio), trạng thái an toàn và tọa độ mẫu.
        """
        h, w = frame.shape[:2]
        metrics: Dict[str, Any] = {
            "blocked_ratio": 0.0,
            "is_blocked": False,
            "corridor_area": 0,
            "obstacle_area": 0,
            "sample_box": [0, 0, 0, 0]
        }

        # 1. Lấy mẫu màu sàn hiện tại
        sample_bgr, (sx1, sy1, sx2, sy2) = self.sample_floor(frame)
        metrics["sample_box"] = [sx1, sy1, sx2 - sx1, sy2 - sy1]

        if sample_bgr.size == 0:
            return [], metrics

        # 2. Chuyển đổi HSV và cập nhật biểu đồ 2D màu sàn
        hsv_sample = cv2.cvtColor(sample_bgr, cv2.COLOR_BGR2HSV)
        current_hist = self.compute_histogram(hsv_sample)
        self.update_floor_model(current_hist)

        # 3. Phép chiếu ngược (BackProjection) trên toàn bộ khung hình
        hsv_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        prob_map = cv2.calcBackProject(
            [hsv_frame],
            [0, 1],
            self.floor_hist,
            [0, 180, 0, 256],
            1.0
        )

        # Làm mờ để giảm nhiễu hạt trước khi nhị phân hóa
        prob_blurred = cv2.GaussianBlur(prob_map, (7, 7), 0)

        # 4. Xác định mặt sàn vs vật cản:
        # Pixel có xác suất >= threshold: Mặt sàn trống (Freespace)
        # Pixel có xác suất < threshold: Vật cản / Không phải sàn
        thresh_val = self.config.FREESPACE_THRESHOLD
        _, floor_mask = cv2.threshold(prob_blurred, thresh_val, 255, cv2.THRESH_BINARY)
        obstacle_mask = cv2.bitwise_not(floor_mask)

        # 4b. Triệt tiêu bóng phản chiếu ánh sáng và chói lóa (Specular Reflection Suppression)
        # Vệt phản chiếu ánh đèn / cửa sổ / ánh nắng trên gạch bóng có độ sáng cao (V > 180) và độ bão hòa thấp (S < 70)
        is_specular = (hsv_frame[..., 2] > 180) & (hsv_frame[..., 1] < 70)
        obstacle_mask[is_specular] = 0

        # 5. Phép toán hình thái học (Morphology) lọc sạch nhiễu:
        # Opening 7x7: Lọc các đường vân gỗ, hạt bụi đơn lẻ trên sàn
        # Closing 11x11: Hàn gắn các lỗ thủng bên trong thân vật cản
        kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
        obstacle_cleaned = cv2.morphologyEx(obstacle_mask, cv2.MORPH_OPEN, kernel_open)
        obstacle_cleaned = cv2.morphologyEx(obstacle_cleaned, cv2.MORPH_CLOSE, kernel_close)

        # 6. Giới hạn phân tích trong Hành lang an toàn phía trước (Corridor ROI)
        corridor_half_w = int(w * (self.config.FREESPACE_CORRIDOR_W_RATIO / 2.0))
        cx1 = max(0, w // 2 - corridor_half_w)
        cx2 = min(w, w // 2 + corridor_half_w)
        cy1_ratio = getattr(self.config, 'FREESPACE_CORRIDOR_Y_START', 0.52)
        cy1 = int(h * cy1_ratio) # Bắt đầu từ 52% chiều cao để loại trừ tường và chân tường
        cy2 = sy1                # Đến sát vùng lấy mẫu sàn

        corridor_w = cx2 - cx1
        corridor_h = cy2 - cy1
        corridor_area = corridor_w * corridor_h
        metrics["corridor_area"] = corridor_area

        if corridor_area <= 0:
            return [], metrics

        # Cắt mask vật cản trong hành lang
        corridor_obstacle_mask = np.zeros_like(obstacle_cleaned)
        corridor_obstacle_mask[cy1:cy2, cx1:cx2] = obstacle_cleaned[cy1:cy2, cx1:cx2]

        # 7. Tính tỷ lệ hành lang bị chiếm dụng (blocked_ratio)
        obstacle_pixels = int(cv2.countNonZero(corridor_obstacle_mask[cy1:cy2, cx1:cx2]))
        blocked_ratio = float(obstacle_pixels) / float(corridor_area)
        blocked_ratio = float(np.clip(blocked_ratio, 0.0, 1.0))

        metrics["blocked_ratio"] = round(blocked_ratio, 3)
        metrics["obstacle_area"] = obstacle_pixels
        metrics["is_blocked"] = blocked_ratio >= 0.20 # Nếu chiếm trên 20% hành lang coi là có nguy cơ
        self.last_blocked_ratio = blocked_ratio

        # 8. Tìm Contours và tạo Bounding Boxes cho từng vật cản
        contours, _ = cv2.findContours(
            corridor_obstacle_mask,
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )

        min_area = corridor_area * self.config.FREESPACE_MIN_CONTOUR_AREA_RATIO
        obstacles: List[Dict[str, Any]] = []

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area:
                continue

            bx, by, bw, bh = cv2.boundingRect(cnt)

            # Lọc bỏ nếu chiếm gần như toàn bộ cả chiều ngang lẫn chiều dọc hành lang (chấn song / tường chắn)
            if bw > corridor_w * 0.95 and bh > corridor_h * 0.95:
                continue

            # Lọc bỏ các vật cản mỏng dài (aspect ratio > 3:1) vì đó chính là vạch kẻ đường / băng keo dán sàn
            # Vạch kẻ đường thường rất dài và rất hẹp, trong khi vật cản thật (dép, hộp) có tỷ lệ gần vuông hơn
            aspect_ratio = max(bw, bh) / max(min(bw, bh), 1)
            if aspect_ratio > 3.0:
                continue

            # Lọc bỏ contour quá mỏng: chiều hẹp nhất < 5% chiều rộng hành lang
            # Vạch kẻ băng keo rộng ~2-3cm, trên ảnh thường chỉ chiếm 2-4% chiều rộng
            min_dim = min(bw, bh)
            if min_dim < corridor_w * 0.05:
                continue

            # Tính độ tin cậy dựa trên tỷ lệ diện tích và độ lệch khỏi màu sàn
            conf = min(0.95, round(0.55 + (area / corridor_area) * 1.5, 2))

            obstacles.append({
                "bbox": [int(bx), int(by), int(bw), int(bh)],
                "class_id": 999,
                "class_name": "obstacle",
                "label": "Vật cản sàn",
                "confidence": float(conf),
                "source": "freespace"
            })

        return obstacles, metrics

