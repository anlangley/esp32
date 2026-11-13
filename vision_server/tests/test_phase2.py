import time
import cv2
import numpy as np
import sys
from pathlib import Path
from typing import Tuple, List, Dict, Any, Optional

# Thêm thư mục vision_server vào sys.path để import chuẩn xác
VISION_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(VISION_DIR))

from config import VisionConfig
from modules.freespace import FreespaceSegmenter
from modules.flow import OpticalFlowDetector
from modules.fusion import SensorFusion, calculate_iou


def create_floor_frame(
    width: int = 640,
    height: int = 480,
    floor_color: Tuple[int, int, int] = (180, 175, 170), # Màu gạch sàn xám sáng
    with_obstacle: bool = False,
    obstacle_box: Tuple[int, int, int, int] = (260, 260, 100, 80),
    obstacle_color: Tuple[int, int, int] = (20, 30, 190) # Hộp màu đỏ đậm nổi bật
) -> np.ndarray:
    """Tạo frame giả lập có sàn nhà và vật cản ngẫu nhiên để kiểm thử."""
    frame = np.full((height, width, 3), floor_color, dtype=np.uint8)

    # Thêm vân sàn gạch nhẹ
    noise = np.random.normal(0, 3, (height, width, 3)).astype(np.int16)
    frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    if with_obstacle:
        ox, oy, ow, oh = obstacle_box
        cv2.rectangle(frame, (ox, oy), (ox + ow, oy + oh), obstacle_color, -1)
        # Thêm viền tối
        cv2.rectangle(frame, (ox, oy), (ox + ow, oy + oh), (10, 15, 80), 2)

    return frame


def test_freespace_segmentation():
    print("🧪 [Test 1] Testing FreespaceSegmenter...")
    cfg = VisionConfig()
    cfg.ENABLE_FREESPACE = True
    segmenter = FreespaceSegmenter(cfg)

    # 1. Sàn trống không vật cản
    clear_frame = create_floor_frame(with_obstacle=False)
    obs_clear, metrics_clear = segmenter.process(clear_frame)
    assert len(obs_clear) == 0, "Clear floor must have 0 obstacles"
    assert metrics_clear["blocked_ratio"] < 0.05, f"Blocked ratio must be near 0, got {metrics_clear['blocked_ratio']}"
    print(f"   ✅ Clear floor: obstacles={len(obs_clear)}, blocked_ratio={metrics_clear['blocked_ratio']*100:.1f}%")

    # 2. Sàn có vật cản lạ trong hành lang (Corridor)
    obs_frame = create_floor_frame(with_obstacle=True)
    obs_list, metrics_obs = segmenter.process(obs_frame)
    assert len(obs_list) > 0, "Must detect obstacle on floor"
    assert metrics_obs["blocked_ratio"] > 0.05, "Blocked ratio must increase with obstacle"
    
    first_obs = obs_list[0]
    assert first_obs["source"] == "freespace"
    assert first_obs["class_name"] == "obstacle"
    print(f"   ✅ Obstacle detected: bbox={first_obs['bbox']}, confidence={first_obs['confidence']}, blocked={metrics_obs['blocked_ratio']*100:.1f}%")


def test_optical_flow():
    print("\n🧪 [Test 2] Testing OpticalFlowDetector (Farneback Dense Flow)...")
    cfg = VisionConfig()
    cfg.ENABLE_FLOW = True
    cfg.FLOW_CONSECUTIVE_FRAMES = 2
    detector = OpticalFlowDetector(cfg)

    f1 = create_floor_frame(with_obstacle=True, obstacle_box=(280, 220, 60, 50))
    obs1, m1 = detector.process(f1)
    assert len(obs1) == 0, "First frame baseline cannot report motion"

    # Frame 2: Vật cản tiếp cận (phình to và dịch xuống dưới về phía đầu xe)
    f2 = create_floor_frame(with_obstacle=True, obstacle_box=(260, 250, 90, 75))
    obs2, m2 = detector.process(f2)

    # Frame 3: Tiếp tục tiến gần để thỏa mãn bộ lọc liên tiếp (consecutive filter)
    f3 = create_floor_frame(with_obstacle=True, obstacle_box=(240, 280, 120, 100))
    obs3, m3 = detector.process(f3)

    assert m3["mean_magnitude"] > 0, "Motion magnitude must be positive"
    print(f"   ✅ Optical Flow: mean_mag={m3['mean_magnitude']}, approaching={m3['is_approaching']}, obstacles_detected={len(obs3)}")


def test_iou_and_deduplication():
    print("\n🧪 [Test 3] Testing IoU calculation & Non-Maximum Suppression...")
    boxA = [100, 100, 50, 50]
    boxB = [110, 110, 50, 50] # Trùng lặp cao
    boxC = [300, 300, 50, 50] # Tách biệt hoàn toàn

    iou_AB = calculate_iou(boxA, boxB)
    iou_AC = calculate_iou(boxA, boxC)

    assert iou_AB > 0.40, f"Expected high IoU between overlapping boxes, got {iou_AB}"
    assert iou_AC == 0.0, f"Expected 0 IoU between distant boxes, got {iou_AC}"
    print(f"   ✅ IoU calculation: Overlap IoU={iou_AB:.2f}, Disjoint IoU={iou_AC:.2f}")


def test_sensor_fusion():
    print("\n🧪 [Test 4] Testing SensorFusion (YOLO + Freespace + Flow)...")
    cfg = VisionConfig()
    fusion = SensorFusion(cfg)
    frame_shape = (480, 640)

    # Giả lập phát hiện từ 3 nguồn:
    # - YOLO phát hiện 1 chiếc ghế ở vị trí A
    yolo_dets = [{
        "bbox": [200, 200, 80, 120],
        "class_id": 56,
        "class_name": "chair",
        "label": "Ghế",
        "confidence": 0.85,
        "source": "yolo"
    }]

    # - Freespace phát hiện dị vật ở gần đúng vị trí của chiếc ghế (trùng lặp IoU > 0.3)
    #   VÀ 1 chiếc dép lạ ở vị trí khác mà YOLO bỏ sót
    freespace_obs = [
        {
            "bbox": [205, 210, 75, 110],
            "class_id": 999,
            "class_name": "obstacle",
            "label": "Vật cản sàn",
            "confidence": 0.70,
            "source": "freespace"
        },
        {
            "bbox": [320, 300, 60, 40], # Chiếc dép lạ
            "class_id": 999,
            "class_name": "obstacle",
            "label": "Vật cản sàn (dép)",
            "confidence": 0.75,
            "source": "freespace"
        }
    ]

    # - Flow không thấy gì
    flow_obs = []

    # 1. Test chế độ YOLO_ONLY (Baseline cũ)
    fused_yolo, col_yolo = fusion.fuse(
        frame_shape, yolo_dets, freespace_obs, flow_obs, fusion_mode="yolo_only"
    )
    assert len(fused_yolo) == 1, "yolo_only mode should only retain YOLO detections"
    assert fused_yolo[0]["class_name"] == "chair"
    print(f"   ✅ Mode 'yolo_only': {len(fused_yolo)} detection (only YOLO)")

    # 2. Test chế độ OR (Hợp nhất thông minh)
    # Kỳ vọng: Hộp chiếc ghế được khử trùng lặp (1 hộp duy nhất), và hộp chiếc dép lạ được giữ lại!
    fused_or, col_or = fusion.fuse(
        frame_shape, yolo_dets, freespace_obs, flow_obs, fusion_mode="or"
    )
    assert len(fused_or) == 2, f"Expected 2 fused detections (1 merged chair + 1 freespace obstacle), got {len(fused_or)}"
    
    # Kiểm tra nguồn gốc của hộp trùng
    chair_det = next(d for d in fused_or if d["class_name"] == "chair")
    assert "fused" in chair_det["source"], f"Chair box should be marked as fused, got {chair_det['source']}"
    print(f"   ✅ Mode 'or': {len(fused_or)} detections. Merged source: '{chair_det['source']}', Unseen obstacle retained: '{fused_or[1]['label']}'")

    # 3. Test hợp nhất cảm biến siêu âm ESP32 cự ly gần (< 25cm)
    _, col_ultrasonic = fusion.fuse(
        frame_shape, yolo_dets, freespace_obs, flow_obs, ultrasonic_dist_cm=18.0, fusion_mode="or"
    )
    assert col_ultrasonic["is_emergency_stop"] is True, "Ultrasonic < 25cm must trigger emergency stop"
    assert col_ultrasonic["threat_level"] == "CRITICAL", "Threat level must be CRITICAL on ultrasonic emergency"
    print(f"   ✅ Sensor Fusion with ESP32 Ultrasonic: dist=18cm -> is_emergency_stop={col_ultrasonic['is_emergency_stop']}, threat_level={col_ultrasonic['threat_level']}")


def test_full_pipeline_benchmark():
    print("\n🧪 [Test 5] Benchmarking Phase 1 + Phase 2 Full Pipeline...")
    cfg = VisionConfig()
    cfg.ENABLE_PREPROCESS = True
    cfg.ENABLE_STABILIZER = True
    cfg.ENABLE_FREESPACE = True
    cfg.ENABLE_FLOW = True
    cfg.FUSION_MODE = "or"

    segmenter = FreespaceSegmenter(cfg)
    detector = OpticalFlowDetector(cfg)
    fusion = SensorFusion(cfg)

    test_frame = create_floor_frame(with_obstacle=True)
    times = []

    for _ in range(25):
        t0 = time.perf_counter()

        # Phase 2 pipeline
        fs_obs, fs_metrics = segmenter.process(test_frame)
        fl_obs, fl_metrics = detector.process(test_frame)
        fused, col = fusion.fuse(test_frame.shape, [], fs_obs, fl_obs, fusion_mode="or")

        t_elapsed = (time.perf_counter() - t0) * 1000
        times.append(t_elapsed)

    mean_ms = float(np.mean(times[5:]))
    est_fps = 1000.0 / max(mean_ms, 0.001)

    print(f"   ⏱️ Phase 2 Classical Pipeline: Mean latency = {mean_ms:.2f}ms / frame -> Est. {est_fps:.1f} FPS")
    assert est_fps >= 20.0, f"Throughput must be >= 20 FPS, got {est_fps:.1f}"
    print("   ✅ Benchmark PASSED: Tốc độ xử lý Phase 2 đạt chuẩn thời gian thực!")


if __name__ == "__main__":
    print("======================================================================")
    print("   KIỂM THỬ ĐƠN VỊ PHASE 2: PHÁT HIỆN VẬT CẢN CỔ ĐIỂN & HỢP NHẤT")
    print("======================================================================")
    test_freespace_segmentation()
    test_optical_flow()
    test_iou_and_deduplication()
    test_sensor_fusion()
    test_full_pipeline_benchmark()
    print("\n🎉 TOÀN BỘ 5 BÀI KIỂM THỬ PHASE 2 ĐÃ VƯỢT QUA 100%!")
