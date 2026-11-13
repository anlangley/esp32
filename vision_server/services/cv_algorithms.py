import cv2
import numpy as np
from typing import Dict, Any, Tuple, List, Optional
from config import cfg

try:
    from modules.preprocess import adaptive_lane_binarize
except ImportError:
    from vision_server.modules.preprocess import adaptive_lane_binarize

class CVAlgorithms:
    """
    Tập hợp các thuật toán thị giác máy tính OpenCV truyền thống:
    1. Dò vạch kẻ đường / dò line (Line Tracking)
    2. Phân tích vùng nguy hiểm va chạm (Collision Danger Zone)
    3. Ước tính khoảng cách tương đối
    """

    @staticmethod
    def process_lane_tracking(frame: np.ndarray) -> Dict[str, Any]:
        """
        Dò vạch kẻ đường / vạch line phía trước xe:
        - Cắt Region of Interest (ROI) ở 35% phần đáy ảnh.
        - Tìm đường tâm của line và tính toán độ lệch (steering_offset) [-1.0, 1.0].
        """
        h, w = frame.shape[:2]
        
        # Chỉ quét 35% vùng đáy trước đầu xe
        roi_top = int(h * 0.65)
        roi = frame[roi_top:h, 0:w]
        
        # Chuyển ảnh xám & làm mờ khử nhiễu
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        # Nhị phân hóa (Otsu baseline hoặc Adaptive thích nghi theo cấu hình)
        threshold_mode = getattr(cfg, 'LANE_THRESHOLD_MODE', 'otsu')
        thresh, method_used = adaptive_lane_binarize(blurred, mode=threshold_mode, config=cfg)

        # Tìm các đường bao (Contours)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        if not contours:
            return {
                "detected": False,
                "steering_offset": 0.0,
                "suggested_turn": "STRAIGHT",
                "center_x": w // 2,
                "confidence": 0.0,
                "method_used": method_used
            }

        # Lấy contour có diện tích lớn nhất (vạch line chính)
        largest_contour = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(largest_contour)

        # Nếu diện tích quá nhỏ -> nhiễu
        if area < 500:
            return {
                "detected": False,
                "steering_offset": 0.0,
                "suggested_turn": "STRAIGHT",
                "center_x": w // 2,
                "confidence": 0.0,
                "method_used": method_used
            }

        # Tính tâm đường (Centroid / Moments)
        M = cv2.moments(largest_contour)
        if M["m00"] != 0:
            cx = int(M["m10"] / M["m00"])
            cy = int(M["m01"] / M["m00"]) + roi_top
        else:
            cx = w // 2
            cy = h - 20

        # Độ lệch chuẩn hóa từ -1.0 (Lệch cực trái) đến +1.0 (Lệch cực phải)
        frame_center = w / 2.0
        steering_offset = round((cx - frame_center) / frame_center, 3)

        # Đề xuất hướng lái
        if steering_offset < -0.2:
            suggested_turn = "LEFT"
        elif steering_offset > 0.2:
            suggested_turn = "RIGHT"
        else:
            suggested_turn = "STRAIGHT"

        return {
            "detected": True,
            "steering_offset": steering_offset,
            "suggested_turn": suggested_turn,
            "center_x": cx,
            "center_y": cy,
            "confidence": min(round(area / 15000.0, 2), 1.0),
            "method_used": method_used
        }

    @staticmethod
    def analyze_collision_risk(
        frame_shape: Tuple[int, int], 
        detections: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Phân tích rủi ro va chạm dựa trên vị trí và kích thước bounding box của YOLO.
        - Vật cản ở 50% đáy ảnh (mũi xe)
        - Chiều cao bbox > 35% frame -> Warning (Chạy chậm / né)
        - Chiều cao bbox > 50% frame -> Emergency Stop (Phanh gấp)
        """
        h, w = frame_shape[:2]
        is_collision_warning = False
        is_emergency_stop = False
        threat_level = "SAFE"
        threat_object = None
        max_threat_ratio = 0.0

        danger_zone_left = int(w * 0.2)
        danger_zone_right = int(w * 0.8)
        danger_zone_top = int(h * 0.45)

        for det in detections:
            bbox = det.get("bbox", [0, 0, 0, 0])  # [x, y, width, height]
            x, y, bw, bh = bbox
            
            # Tọa độ đáy của vật thể
            bottom_y = y + bh
            center_x = x + (bw / 2)

            # Kiểm tra xem vật cản có nằm trong hành lang di chuyển phía trước không
            in_horizontal_path = (danger_zone_left <= center_x <= danger_zone_right)
            in_vertical_zone = (bottom_y >= danger_zone_top)

            if in_horizontal_path and in_vertical_zone:
                height_ratio = bh / h
                if height_ratio > max_threat_ratio:
                    max_threat_ratio = height_ratio
                    threat_object = det.get("label", "vật cản")

                if height_ratio >= cfg.EMERGENCY_HEIGHT_RATIO:
                    is_emergency_stop = True
                    threat_level = "CRITICAL"
                elif height_ratio >= cfg.WARNING_HEIGHT_RATIO:
                    is_collision_warning = True
                    if threat_level != "CRITICAL":
                        threat_level = "WARNING"

        return {
            "threat_level": threat_level,
            "is_collision_warning": is_collision_warning,
            "is_emergency_stop": is_emergency_stop,
            "threat_object": threat_object,
            "threat_ratio": round(max_threat_ratio, 2)
        }

cv_algo = CVAlgorithms()
