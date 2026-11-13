import cv2
import numpy as np
from collections import deque
from typing import Tuple, Dict, Any, Optional

try:
    from config import cfg, VisionConfig
except ImportError:
    from vision_server.config import cfg, VisionConfig


class VideoStabilizer:
    """
    Module ổn định hình ảnh kỹ thuật số (Digital Video Stabilization):
    - Mục tiêu: Giảm thiểu độ rung lắc do chuyển động gập ghềnh của xe IoT khi chạy trên sàn,
      giúp thuật toán dò vạch kẻ đường (Lane Following) và phân đoạn sàn (Free-space) không bị nhảy giật.
    - Nguyên lý:
      1. Khai thác các điểm đặc trưng Shi-Tomasi (cv2.goodFeaturesToTrack).
      2. Theo dõi dòng quang học kim tự tháp Lucas-Kanade (cv2.calcOpticalFlowPyrLK).
      3. Ước tính biến đổi Affine cục bộ (translation + rotation) bằng RANSAC.
      4. Tích lũy quỹ đạo và làm mượt bằng bộ lọc cửa sổ trượt (Moving Average).
      5. Bù chuyển động bằng cv2.warpAffine và crop nhẹ viền biên (4%) để khử vệt đen.
    """

    def __init__(self, config: Optional[VisionConfig] = None):
        self.config = config or cfg

        self.prev_gray: Optional[np.ndarray] = None
        self.prev_pts: Optional[np.ndarray] = None

        # Tích lũy quỹ đạo thực (x, y, a)
        self.accumulated_x: float = 0.0
        self.accumulated_y: float = 0.0
        self.accumulated_a: float = 0.0

        # Hàng đợi lưu vết quỹ đạo phục vụ tính Moving Average
        self.window_size: int = self.config.STABILIZER_SMOOTH_WINDOW
        self.trajectory_history = deque(maxlen=self.window_size)

        # Trạng thái thống kê
        self.last_dx: float = 0.0
        self.last_dy: float = 0.0
        self.last_da: float = 0.0
        self.last_jitter: float = 0.0

    def reset(self):
        """Đặt lại trạng thái bộ ổn định (khi đổi video hoặc camera reset)"""
        self.prev_gray = None
        self.prev_pts = None
        self.accumulated_x = 0.0
        self.accumulated_y = 0.0
        self.accumulated_a = 0.0
        self.trajectory_history.clear()
        self.last_dx = 0.0
        self.last_dy = 0.0
        self.last_da = 0.0
        self.last_jitter = 0.0

    def process(self, frame: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Nhận frame BGR hiện tại, ước tính chuyển động và trả về frame đã ổn định kèm thông số rung.
        """
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        info = {
            "dx": 0.0,
            "dy": 0.0,
            "dtheta": 0.0,
            "jitter": 0.0,
            "n_features": 0,
            "is_stabilized": False,
        }

        # Nếu là frame đầu tiên hoặc kích thước khung hình thay đổi (ví dụ: camera kết nối từ offline, đổi độ phân giải, xoay dọc/ngang)
        if self.prev_gray is None or self.prev_gray.shape != gray.shape:
            self.reset()
            self.prev_gray = gray
            self.prev_pts = cv2.goodFeaturesToTrack(
                gray,
                maxCorners=self.config.STABILIZER_MAX_CORNERS,
                qualityLevel=self.config.STABILIZER_QUALITY_LEVEL,
                minDistance=self.config.STABILIZER_MIN_DISTANCE
            )
            self.trajectory_history.append((self.accumulated_x, self.accumulated_y, self.accumulated_a))
            return frame, info

        # Đảm bảo có điểm đặc trưng từ frame trước
        if self.prev_pts is None or len(self.prev_pts) < 10:
            self.prev_pts = cv2.goodFeaturesToTrack(
                self.prev_gray,
                maxCorners=self.config.STABILIZER_MAX_CORNERS,
                qualityLevel=self.config.STABILIZER_QUALITY_LEVEL,
                minDistance=self.config.STABILIZER_MIN_DISTANCE
            )

        if self.prev_pts is None or len(self.prev_pts) < 10:
            # Không đủ điểm đặc trưng (ví dụ ảnh quá tối/trống trơn)
            self.prev_gray = gray
            return frame, info

        # 1. Tính toán dòng quang học Lucas-Kanade (bọc try-except chống lỗi kích thước/OpenCV)
        try:
            curr_pts, status, err = cv2.calcOpticalFlowPyrLK(
                self.prev_gray,
                gray,
                self.prev_pts,
                None
            )
        except cv2.error:
            self.reset()
            self.prev_gray = gray
            return frame, info

        if curr_pts is None or status is None:
            self.prev_gray = gray
            return frame, info

        # Lọc các điểm theo dõi thành công
        idx = np.where(status == 1)[0]
        good_prev = self.prev_pts[idx]
        good_curr = curr_pts[idx]
        n_features = len(good_prev)
        info["n_features"] = n_features

        if n_features < 10:
            self.prev_gray = gray
            self.prev_pts = cv2.goodFeaturesToTrack(
                gray,
                maxCorners=self.config.STABILIZER_MAX_CORNERS,
                qualityLevel=self.config.STABILIZER_QUALITY_LEVEL,
                minDistance=self.config.STABILIZER_MIN_DISTANCE
            )
            return frame, info

        # 2. Ước lượng biến đổi Affine từng phần (Tịnh tiến + Xoay + Tỷ lệ) bằng RANSAC
        try:
            transform, inliers = cv2.estimateAffinePartial2D(good_prev, good_curr, method=cv2.RANSAC)
        except cv2.error:
            transform = None

        if transform is None:
            self.prev_gray = gray
            self.prev_pts = cv2.goodFeaturesToTrack(
                gray,
                maxCorners=self.config.STABILIZER_MAX_CORNERS,
                qualityLevel=self.config.STABILIZER_QUALITY_LEVEL,
                minDistance=self.config.STABILIZER_MIN_DISTANCE
            )
            return frame, info

        dx = float(transform[0, 2])
        dy = float(transform[1, 2])
        da = float(np.arctan2(transform[1, 0], transform[0, 0]))
        jitter = float(np.sqrt(dx ** 2 + dy ** 2))

        # Kiểm tra tính hợp lệ của số liệu (chống NaN / Inf làm vỡ JSON serialization)
        if (
            np.isnan(dx) or np.isinf(dx) or
            np.isnan(dy) or np.isinf(dy) or
            np.isnan(da) or np.isinf(da) or
            np.isnan(jitter) or np.isinf(jitter)
        ):
            self.reset()
            self.prev_gray = gray
            return frame, info

        self.last_dx = dx
        self.last_dy = dy
        self.last_da = da
        self.last_jitter = jitter

        # 3. Tích lũy quỹ đạo chuyển động thực
        self.accumulated_x += dx
        self.accumulated_y += dy
        self.accumulated_a += da

        # Tự phục hồi nếu giá trị tích lũy bị lệch quá xa hoặc NaN
        if (
            np.isnan(self.accumulated_x) or np.isinf(self.accumulated_x) or
            np.isnan(self.accumulated_y) or np.isinf(self.accumulated_y) or
            abs(self.accumulated_x) > 1000 or abs(self.accumulated_y) > 1000
        ):
            self.reset()
            self.prev_gray = gray
            return frame, info

        self.trajectory_history.append((self.accumulated_x, self.accumulated_y, self.accumulated_a))

        # 4. Tính toán quỹ đạo mượt bằng Moving Average
        hist_x = [p[0] for p in self.trajectory_history]
        hist_y = [p[1] for p in self.trajectory_history]
        hist_a = [p[2] for p in self.trajectory_history]

        smooth_x = float(np.mean(hist_x))
        smooth_y = float(np.mean(hist_y))
        smooth_a = float(np.mean(hist_a))

        # Sai lệch cần bù = Quỹ đạo mượt - Quỹ đạo thực
        diff_x = smooth_x - self.accumulated_x
        diff_y = smooth_y - self.accumulated_y
        diff_a = smooth_a - self.accumulated_a

        if np.isnan(diff_x) or np.isinf(diff_x) or np.isnan(diff_y) or np.isinf(diff_y) or np.isnan(diff_a) or np.isinf(diff_a):
            self.reset()
            self.prev_gray = gray
            return frame, info

        # 5. Xây dựng ma trận hiệu chỉnh Affine
        cos_a = np.cos(diff_a)
        sin_a = np.sin(diff_a)
        correction_matrix = np.array([
            [cos_a, -sin_a, diff_x],
            [sin_a,  cos_a, diff_y]
        ], dtype=np.float32)

        # Biến đổi ảnh để triệt tiêu rung lắc
        try:
            stabilized = cv2.warpAffine(
                frame,
                correction_matrix,
                (w, h),
                borderMode=cv2.BORDER_REFLECT
            )
        except cv2.error:
            self.reset()
            return frame, info

        # 6. Cắt viền biên 4% để tránh viền đen di chuyển
        crop_ratio = self.config.STABILIZER_CROP_RATIO
        crop_x = int(w * crop_ratio)
        crop_y = int(h * crop_ratio)
        if crop_x > 0 and crop_y > 0 and (w - 2 * crop_x > 10) and (h - 2 * crop_y > 10):
            cropped = stabilized[crop_y:h - crop_y, crop_x:w - crop_x]
            stabilized = cv2.resize(cropped, (w, h))

        # Chuẩn bị cho frame tiếp theo
        self.prev_gray = gray
        self.prev_pts = cv2.goodFeaturesToTrack(
            gray,
            maxCorners=self.config.STABILIZER_MAX_CORNERS,
            qualityLevel=self.config.STABILIZER_QUALITY_LEVEL,
            minDistance=self.config.STABILIZER_MIN_DISTANCE
        )

        info.update({
            "dx": round(dx, 2),
            "dy": round(dy, 2),
            "dtheta": round(da, 4),
            "jitter": round(jitter, 2),
            "is_stabilized": True,
        })

        return stabilized, info

