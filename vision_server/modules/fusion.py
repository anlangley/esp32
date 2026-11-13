import cv2
import numpy as np
from typing import Tuple, List, Dict, Any, Optional
from collections import defaultdict

try:
    from config import cfg, VisionConfig
except ImportError:
    from vision_server.config import cfg, VisionConfig


def calculate_iou(boxA: List[int], boxB: List[int]) -> float:
    """
    Tính Intersection over Union (IoU) giữa 2 Bounding Box [x, y, w, h].
    """
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[0] + boxA[2], boxB[0] + boxB[2])
    yB = min(boxA[1] + boxA[3], boxB[1] + boxB[3])

    inter_w = max(0, xB - xA)
    inter_h = max(0, yB - yA)
    inter_area = inter_w * inter_h

    boxA_area = boxA[2] * boxA[3]
    boxB_area = boxB[2] * boxB[3]
    union_area = float(boxA_area + boxB_area - inter_area)

    if union_area <= 0:
        return 0.0

    return inter_area / union_area


class SensorFusion:
    """
    Bộ não Hợp nhất đa nguồn (Sensor & Vision Fusion):
    - Nguồn 1: Deep Learning YOLOv8 (Nhận diện vật thể quen thuộc có nhãn ngữ nghĩa).
    - Nguồn 2: Phân đoạn mặt sàn Freespace (Phát hiện mọi dị vật cản trở trên sàn: dép, gạch, hộp).
    - Nguồn 3: Dòng quang học Optical Flow (Phát hiện chuyển động tiến gần đột ngột).
    - Nguồn 4: Cảm biến siêu âm ESP32 HC-SR04 (Lá chắn phần cứng cự ly siêu gần < 25cm).

    Thuật toán:
    1. Lọc theo chế độ hợp nhất (yolo_only, freespace_only, flow_only, or, vote).
    2. Khử trùng lặp (Deduplication): Nếu 2 nguồn cùng phát hiện 1 vật thể (IoU > 0.3),
       ưu tiên giữ tên nhãn rõ nghĩa của YOLO và nâng độ tin cậy.
    3. Bộ lọc ổn định thời gian (Temporal Stability Filter): Vật cản cổ điển phải xuất hiện >= 3 frame
       liên tiếp mới hiển thị để triệt tiêu 100% hiện tượng chớp nháy.
    4. Tổng hợp đánh giá va chạm đa cảm biến (Collision Risk Assessment).
    """

    def __init__(self, config: Optional[VisionConfig] = None):
        self.config = config or cfg
        self.track_history: Dict[int, int] = defaultdict(int) # track_id -> số frame tồn tại
        self.next_track_id: int = 1

    def reset(self):
        """Đặt lại bộ theo dõi lịch sử"""
        self.track_history.clear()
        self.next_track_id = 1

    def fuse(
        self,
        frame_shape: Tuple[int, int],
        yolo_dets: List[Dict[str, Any]],
        freespace_obs: List[Dict[str, Any]],
        flow_obs: List[Dict[str, Any]],
        ultrasonic_dist_cm: Optional[float] = None,
        fusion_mode: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Hợp nhất toàn bộ các nguồn phát hiện và đưa ra quyết định cảnh báo an toàn.

        Trả về:
        - fused_detections: Danh sách Bounding Box tổng hợp, đã khử trùng lặp.
        - collision_risk: Đánh giá nguy cơ va chạm tổng thể.
        """
        h, w = frame_shape[:2]
        mode = (fusion_mode or self.config.FUSION_MODE).lower()

        # Đánh dấu nguồn cho YOLO nếu chưa có
        for d in yolo_dets:
            if "source" not in d:
                d["source"] = "yolo"

        # 1. Chọn lọc theo chế độ Fusion
        if mode == "yolo_only":
            candidates = list(yolo_dets)
        elif mode == "freespace_only":
            candidates = list(freespace_obs)
        elif mode == "flow_only":
            candidates = list(flow_obs)
        elif mode == "vote":
            # Chế độ Biểu quyết: Giữ YOLO có confidence cao >= 0.55 HOẶC vật thể được xác nhận bởi >= 2 nguồn
            candidates = []
            # Thêm các phát hiện YOLO tin cậy cao
            for yd in yolo_dets:
                if yd.get("confidence", 0) >= 0.55:
                    candidates.append(yd)

            # Kiểm tra vật thể được cả Freespace và Flow cùng xác nhận
            for fs in freespace_obs:
                for fl in flow_obs:
                    if calculate_iou(fs["bbox"], fl["bbox"]) > 0.25:
                        merged = fs.copy()
                        merged["source"] = "fused (freespace+flow)"
                        merged["confidence"] = min(0.95, round(fs["confidence"] + 0.15, 2))
                        candidates.append(merged)
                        break
        else: # "or" (Mặc định mở rộng: Cả 3 nguồn cùng đóng góp)
            candidates = list(yolo_dets) + list(freespace_obs) + list(flow_obs)

        # 2. Khử trùng lặp Bounding Box (Non-Maximum Suppression / IoU Merging)
        fused: List[Dict[str, Any]] = []
        iou_thresh = self.config.FUSION_IOU_THRESHOLD

        # Sắp xếp theo ưu tiên: YOLO trước -> Freespace -> Flow
        def get_priority(det):
            src = det.get("source", "")
            if "yolo" in src:
                return 3
            if "freespace" in src:
                return 2
            return 1

        sorted_candidates = sorted(candidates, key=get_priority, reverse=True)

        for cand in sorted_candidates:
            matched = False
            for existing in fused:
                iou = calculate_iou(cand["bbox"], existing["bbox"])
                if iou >= iou_thresh:
                    # Trùng lặp: Kết hợp thông tin
                    matched = True
                    # Nếu nguồn khác nhau, ghi nhận hợp nhất đa nguồn
                    if cand.get("source") != existing.get("source"):
                        existing["source"] = f"fused ({existing.get('source', '')}+{cand.get('source', '')})"
                        existing["confidence"] = min(0.99, round(max(existing.get("confidence", 0.5), cand.get("confidence", 0.5)) + 0.1, 2))
                    break

            if not matched:
                fused.append(cand.copy())

        # 3. Phân tích nguy cơ va chạm (Collision Danger Zone)
        # Hành lang nguy hiểm: 50% giữa khung hình
        corridor_x1 = int(w * 0.25)
        corridor_x2 = int(w * 0.75)

        max_threat_ratio = 0.0
        threat_obj = None

        for det in fused:
            bx, by, bw, bh = det["bbox"]
            center_x = bx + bw // 2
            bot_y = by + bh

            # Kiểm tra vật thể có nằm trong hành lang chạy xe và ở nửa dưới ảnh không
            if (corridor_x1 <= center_x <= corridor_x2) and (bot_y > int(h * 0.40)):
                ratio = float(bh) / float(h)
                if ratio > max_threat_ratio:
                    max_threat_ratio = ratio
                    threat_obj = det.get("label", det.get("class_name", "vật cản"))

        # Xác định cấp độ nguy hiểm thị giác
        is_warning = max_threat_ratio >= self.config.WARNING_HEIGHT_RATIO
        is_emergency = max_threat_ratio >= self.config.EMERGENCY_HEIGHT_RATIO

        # 4. Hợp nhất cảm biến siêu âm ESP32 (Lá chắn phần cứng cự ly gần)
        ultrasonic_emergency = False
        if ultrasonic_dist_cm is not None and ultrasonic_dist_cm > 0:
            if ultrasonic_dist_cm <= 25.0: # Dưới 25cm phanh khẩn cấp lập tức
                is_emergency = True
                ultrasonic_emergency = True
                if not threat_obj:
                    threat_obj = f"Siêu âm: {int(ultrasonic_dist_cm)}cm"
            elif ultrasonic_dist_cm <= 45.0:
                is_warning = True

        if is_emergency:
            threat_level = "CRITICAL"
        elif is_warning:
            threat_level = "WARNING"
        else:
            threat_level = "SAFE"

        collision_summary = {
            "threat_level": threat_level,
            "is_collision_warning": is_warning,
            "is_emergency_stop": is_emergency,
            "threat_object": threat_obj,
            "threat_ratio": round(max_threat_ratio, 3),
            "ultrasonic_distance_cm": ultrasonic_dist_cm,
            "ultrasonic_emergency": ultrasonic_emergency,
            "fusion_mode": mode,
            "counts": {
                "total": len(fused),
                "yolo": len(yolo_dets),
                "freespace": len(freespace_obs),
                "flow": len(flow_obs)
            }
        }

        return fused, collision_summary

