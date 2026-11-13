import cv2
import numpy as np
from dataclasses import dataclass, asdict
from typing import Tuple, List, Dict, Any, Optional

try:
    from config import cfg, VisionConfig
except ImportError:
    # Dự phòng khi import độc lập trong unit test
    from vision_server.config import cfg, VisionConfig


@dataclass
class FrameQuality:
    """
    Chứa các chỉ số chất lượng định lượng của frame ảnh:
    - brightness: Độ sáng trung bình (0 - 255)
    - contrast: Độ tương phản (độ lệch chuẩn của ảnh xám)
    - sharpness: Độ sắc nét (phương sai toán tử Laplacian)
    - is_dark: Ảnh bị tối (cần bù sáng qua Gamma < 1)
    - is_bright: Ảnh bị chói/quá sáng (cần giảm sáng qua Gamma > 1)
    - is_low_contrast: Ảnh bị nhờ nhạt (cần cân bằng CLAHE)
    - is_blurry: Ảnh bị mờ do rung lắc / chuyển động nhanh
    """
    brightness: float
    contrast: float
    sharpness: float
    is_dark: bool
    is_bright: bool
    is_low_contrast: bool
    is_blurry: bool

    def to_dict(self) -> Dict[str, Any]:
        """Chuyển thành dict có làm tròn để gửi qua WebSocket JSON."""
        return {
            "brightness": round(self.brightness, 1),
            "contrast": round(self.contrast, 1),
            "sharpness": round(self.sharpness, 1),
            "is_dark": self.is_dark,
            "is_bright": self.is_bright,
            "is_low_contrast": self.is_low_contrast,
            "is_blurry": self.is_blurry,
        }


def assess_frame(frame: np.ndarray, config: Optional[VisionConfig] = None) -> FrameQuality:
    """
    Đánh giá định lượng chất lượng của một frame ảnh đầu vào (BGR).

    Thuật toán:
    1. Độ sáng: Trung bình cường độ xám của toàn bộ frame.
    2. Độ tương phản: Độ lệch chuẩn (std) của các pixel xám.
    3. Độ sắc nét: Phương sai của ma trận đạo hàm bậc hai Laplacian (Variance of Laplacian).
       Ảnh càng nét thì các cạnh biên biến thiên càng mạnh -> phương sai càng lớn.
       Ảnh bị mờ nhòe do rung lắc -> phương sai Laplacian tụt xuống rất thấp.
    """
    if config is None:
        config = cfg

    # Chuyển ảnh xám để tính toán
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    is_dark = brightness < config.BRIGHTNESS_LOW
    is_bright = brightness > config.BRIGHTNESS_HIGH
    is_low_contrast = contrast < config.CONTRAST_LOW
    is_blurry = sharpness < config.SHARPNESS_LOW

    return FrameQuality(
        brightness=brightness,
        contrast=contrast,
        sharpness=sharpness,
        is_dark=is_dark,
        is_bright=is_bright,
        is_low_contrast=is_low_contrast,
        is_blurry=is_blurry,
    )


def adaptive_enhance(
    frame: np.ndarray,
    quality: FrameQuality,
    config: Optional[VisionConfig] = None
) -> Tuple[np.ndarray, List[str]]:
    """
    Tự động tăng cường chất lượng ảnh thích nghi theo điều kiện môi trường.

    Thuật toán:
    1. Thiếu sáng (is_dark):
       Tính hệ số Gamma tự động theo công thức:
           gamma = ln(0.5) / ln(mean / 255.0)
       (Ví dụ: mean=50 -> gamma≈0.42. Ánh xạ độ sáng trung bình lên ~128).
       Sử dụng bảng tra cứu (Look-Up Table - LUT) 256 giá trị để chuyển đổi siêu tốc < 0.5ms.
    2. Quá sáng (is_bright):
       Tính hệ số Gamma > 1.0 qua LUT để giảm chói, tránh mất chi tiết vạch kẻ đường.
    3. Tương phản thấp (is_low_contrast):
       Chuyển đổi sang không gian màu CIELAB, áp dụng thuật toán cân bằng biểu đồ tần suất
       thích nghi giới hạn độ tương phản (CLAHE) trên riêng kênh L (Luminance) với clipLimit=2.0.
       Giữ nguyên kênh A và B để không làm biến dạng màu sắc tự nhiên.
    4. Bình thường: Bỏ qua xử lý để tiết kiệm tối đa tài nguyên CPU/GPU (zero-cost).
    """
    if config is None:
        config = cfg

    steps_applied: List[str] = []
    enhanced = frame.copy()

    # Bước 1: Hiệu chỉnh Gamma thích nghi
    if quality.is_dark:
        mean_val = max(quality.brightness, 1.0)
        gamma = np.log(0.5) / np.log(mean_val / 255.0)
        gamma = float(np.clip(gamma, config.GAMMA_MIN, config.GAMMA_MAX))

        # Xây dựng bảng Look-Up Table (LUT)
        inv_gamma = gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype("uint8")
        enhanced = cv2.LUT(enhanced, table)
        steps_applied.append(f"gamma={gamma:.2f}")

    elif quality.is_bright:
        mean_val = min(quality.brightness, 254.0)
        gamma = np.log(0.5) / np.log(mean_val / 255.0)
        gamma = float(np.clip(gamma, 1.1, config.GAMMA_MAX))

        inv_gamma = gamma
        table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype("uint8")
        enhanced = cv2.LUT(enhanced, table)
        steps_applied.append(f"gamma={gamma:.2f}")

    # Bước 2: Tăng độ tương phản CLAHE trên kênh L (LAB)
    if quality.is_low_contrast:
        lab = cv2.cvtColor(enhanced, cv2.COLOR_BGR2LAB)
        l_channel, a_channel, b_channel = cv2.split(lab)

        clahe = cv2.createCLAHE(
            clipLimit=config.CLAHE_CLIP_LIMIT,
            tileGridSize=config.CLAHE_TILE_GRID_SIZE
        )
        l_enhanced = clahe.apply(l_channel)
        lab_enhanced = cv2.merge((l_enhanced, a_channel, b_channel))
        enhanced = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)
        steps_applied.append("clahe_lab")

    if not steps_applied:
        steps_applied.append("none")

    return enhanced, steps_applied


def adaptive_lane_binarize(
    gray_roi: np.ndarray,
    mode: str = "auto",
    config: Optional[VisionConfig] = None
) -> Tuple[np.ndarray, str]:
    """
    Nhị phân hóa vùng vạch kẻ đường (ROI) thích nghi theo độ phân bổ ánh sáng.

    Thuật toán:
    - "otsu": Baseline toàn cục Otsu (dùng tốt khi nền đường đồng nhất).
    - "adaptive": Ngưỡng thích nghi Gaussian cục bộ (cv2.adaptiveThreshold)
      kết hợp phép toán hình thái học (Morphology Opening lọc nhiễu hạt 5x5,
      sau đó Closing nối liền đoạn đứt gãy 5x5).
    - "auto":
      Chia ROI thành lưới 4x4 khối và tính độ lệch chuẩn (std) giữa các khối.
      + Nếu std < ngưỡng: Ánh sáng đồng đều -> Dùng Otsu (nhanh và sắc nét).
      + Nếu std >= ngưỡng: Xuất hiện vệt bóng đổ hoặc loang sáng -> Tự động chuyển sang Adaptive Gaussian + Morphology.
    """
    if config is None:
        config = cfg

    selected_mode = mode.lower()

    if selected_mode == "otsu":
        _, thresh = cv2.threshold(gray_roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        return thresh, "otsu"

    elif selected_mode == "adaptive":
        thresh = cv2.adaptiveThreshold(
            gray_roi,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,
            config.LANE_BLOCK_SIZE,
            config.LANE_C_VALUE
        )
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
        return thresh, "adaptive_gaussian"

    else:  # "auto"
        h, w = gray_roi.shape[:2]
        block_h = max(h // 4, 1)
        block_w = max(w // 4, 1)
        block_means = []

        for r in range(4):
            for c in range(4):
                sub = gray_roi[r * block_h:(r + 1) * block_h, c * block_w:(c + 1) * block_w]
                if sub.size > 0:
                    block_means.append(np.mean(sub))

        lighting_std = float(np.std(block_means)) if block_means else 0.0

        if lighting_std < config.LANE_VARIANCE_THRESHOLD:
            _, thresh = cv2.threshold(gray_roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            return thresh, f"auto_otsu (std={lighting_std:.1f})"
        else:
            thresh = cv2.adaptiveThreshold(
                gray_roi,
                255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY_INV,
                config.LANE_BLOCK_SIZE,
                config.LANE_C_VALUE
            )
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
            thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
            return thresh, f"auto_adaptive (std={lighting_std:.1f})"


class BlurTracker:
    """
    Bộ theo dõi và xử lý trạng thái frame mờ:
    - Đếm số lượng frame mờ bị loại bỏ.
    - Lưu giữ kết quả hợp lệ gần nhất (lane, steering_offset).
    - Ngăn chặn triệt để việc kích hoạt phanh khẩn cấp trên các frame bị mờ/nhòe.
    """

    def __init__(self):
        self.dropped_blurry_count: int = 0
        self.last_valid_lane: Optional[Dict[str, Any]] = None
        self.last_valid_collision: Optional[Dict[str, Any]] = None

    def process_blur_state(
        self,
        is_blurry: bool,
        current_lane: Dict[str, Any],
        current_collision: Dict[str, Any],
        enable_filter: bool = True
    ) -> Tuple[Dict[str, Any], Dict[str, Any], bool]:
        """
        Xử lý trạng thái frame:
        Nếu frame mờ và bộ lọc được bật:
        - Tăng số đếm dropped_blurry_count.
        - Tái sử dụng current_lane từ frame trước.
        - Khóa phanh khẩn cấp (is_emergency_stop = False).
        Trả về: (lane_sử_dụng, collision_sử_dụng, is_dropped).
        """
        if not enable_filter:
            # Baseline cũ: Không can thiệp
            return current_lane, current_collision, False

        if is_blurry:
            self.dropped_blurry_count += 1

            # Tái sử dụng kết quả lane trước nếu có
            lane_to_use = self.last_valid_lane.copy() if self.last_valid_lane else current_lane

            # Vô hiệu hóa phanh khẩn cấp trên frame mờ để tránh giật xe ngoài ý muốn
            safe_collision = current_collision.copy()
            safe_collision["is_emergency_stop"] = False
            safe_collision["threat_level"] = "SAFE" if safe_collision.get("threat_level") == "CRITICAL" else safe_collision.get("threat_level", "SAFE")

            return lane_to_use, safe_collision, True
        else:
            # Frame rõ: Cập nhật cache hợp lệ
            self.last_valid_lane = current_lane.copy()
            self.last_valid_collision = current_collision.copy()
            return current_lane, current_collision, False

