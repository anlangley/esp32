import time
import cv2
import numpy as np
import sys
from pathlib import Path

# Thêm thư mục vision_server vào sys.path để import chuẩn xác
VISION_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(VISION_DIR))

from config import VisionConfig
from modules.preprocess import assess_frame, adaptive_enhance, adaptive_lane_binarize, BlurTracker, FrameQuality
from modules.stabilizer import VideoStabilizer
from services.cv_algorithms import cv_algo


def create_synthetic_frame(
    width: int = 640,
    height: int = 480,
    brightness: int = 128,
    with_lane: bool = True,
    blurry: bool = False
) -> np.ndarray:
    """Tạo frame ảnh giả lập có vạch kẻ đường để kiểm thử tự động."""
    frame = np.full((height, width, 3), brightness, dtype=np.uint8)

    # Thêm nhiễu nhẹ
    noise = np.random.normal(0, 5, (height, width, 3)).astype(np.int16)
    frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    if with_lane:
        # Vẽ một vạch kẻ sẫm màu ở giữa phía đáy
        lane_color = (max(0, brightness - 90), max(0, brightness - 90), max(0, brightness - 90))
        pt1 = (width // 2 - 15, int(height * 0.65))
        pt2 = (width // 2 + 15, height)
        cv2.rectangle(frame, pt1, pt2, lane_color, -1)

    if blurry:
        # Làm mờ mạnh bằng Gaussian Blur kernel lớn
        frame = cv2.GaussianBlur(frame, (35, 35), 15.0)

    return frame


def test_assess_frame():
    print("🧪 [Test 1] Testing assess_frame()...")
    cfg = VisionConfig()

    # 1. Ảnh bình thường
    normal_frame = create_synthetic_frame(brightness=130)
    q_norm = assess_frame(normal_frame, cfg)
    assert not q_norm.is_dark, "Normal frame shouldn't be dark"
    assert not q_norm.is_bright, "Normal frame shouldn't be bright"
    assert not q_norm.is_blurry, "Normal frame with lane shouldn't be blurry"
    print(f"   ✅ Normal: brightness={q_norm.brightness:.1f}, contrast={q_norm.contrast:.1f}, sharpness={q_norm.sharpness:.1f}")

    # 2. Ảnh tối
    dark_frame = create_synthetic_frame(brightness=45)
    q_dark = assess_frame(dark_frame, cfg)
    assert q_dark.is_dark, "Dark frame must be detected as is_dark=True"
    print(f"   ✅ Dark frame detected: brightness={q_dark.brightness:.1f} < {cfg.BRIGHTNESS_LOW}")

    # 3. Ảnh chói sáng
    bright_frame = create_synthetic_frame(brightness=220)
    q_bright = assess_frame(bright_frame, cfg)
    assert q_bright.is_bright, "Bright frame must be detected as is_bright=True"
    print(f"   ✅ Bright frame detected: brightness={q_bright.brightness:.1f} > {cfg.BRIGHTNESS_HIGH}")

    # 4. Ảnh mờ rung lắc
    blurry_frame = create_synthetic_frame(brightness=130, blurry=True)
    q_blurry = assess_frame(blurry_frame, cfg)
    assert q_blurry.is_blurry, "Blurry frame must be detected as is_blurry=True"
    print(f"   ✅ Blurry frame detected: sharpness={q_blurry.sharpness:.1f} < {cfg.SHARPNESS_LOW}")


def test_adaptive_enhance():
    print("\n🧪 [Test 2] Testing adaptive_enhance()...")
    cfg = VisionConfig()

    # Test tăng sáng ảnh tối qua Gamma LUT
    dark_frame = create_synthetic_frame(brightness=40)
    q_dark = assess_frame(dark_frame, cfg)
    t0 = time.perf_counter()
    enhanced_dark, steps = adaptive_enhance(dark_frame, q_dark, cfg)
    t_ms = (time.perf_counter() - t0) * 1000

    new_mean = np.mean(enhanced_dark)
    assert new_mean > q_dark.brightness, "Enhanced dark frame must have higher mean brightness"
    assert any("gamma=" in s for s in steps), "Gamma correction step must be applied"
    print(f"   ✅ Dark enhance: original={q_dark.brightness:.1f} -> enhanced={new_mean:.1f} ({steps}) in {t_ms:.2f}ms")

    # Test giảm chói ảnh quá sáng
    bright_frame = create_synthetic_frame(brightness=225)
    q_bright = assess_frame(bright_frame, cfg)
    enhanced_bright, steps_b = adaptive_enhance(bright_frame, q_bright, cfg)
    new_bright_mean = np.mean(enhanced_bright)
    assert new_bright_mean < q_bright.brightness, "Enhanced bright frame must have lower mean brightness"
    print(f"   ✅ Bright enhance: original={q_bright.brightness:.1f} -> enhanced={new_bright_mean:.1f} ({steps_b})")

    # Test ảnh tương phản thấp -> CLAHE
    flat_frame = np.full((480, 640, 3), 120, dtype=np.uint8)
    q_flat = assess_frame(flat_frame, cfg)
    enhanced_flat, steps_f = adaptive_enhance(flat_frame, q_flat, cfg)
    assert any("clahe" in s for s in steps_f), "CLAHE must be applied for low-contrast images"
    print(f"   ✅ Low contrast enhance: steps={steps_f}")


def test_adaptive_lane_binarize():
    print("\n🧪 [Test 3] Testing adaptive_lane_binarize()...")
    cfg = VisionConfig()

    # 1. Đều sáng -> Auto chọn Otsu
    frame_uniform = create_synthetic_frame(brightness=140, with_lane=True)
    roi_uniform = cv2.cvtColor(frame_uniform[int(480 * 0.65):, :], cv2.COLOR_BGR2GRAY)
    mask_otsu, method_o = adaptive_lane_binarize(roi_uniform, mode="auto", config=cfg)
    assert "otsu" in method_o, f"Uniform lighting should pick otsu, got: {method_o}"
    print(f"   ✅ Uniform lighting: selected method = {method_o}")

    # 2. Không đều sáng (tạo vệt bóng tối bên trái) -> Auto chọn Adaptive Gaussian
    frame_shadow = frame_uniform.copy()
    frame_shadow[:, :320] = (frame_shadow[:, :320] * 0.3).astype(np.uint8)
    roi_shadow = cv2.cvtColor(frame_shadow[int(480 * 0.65):, :], cv2.COLOR_BGR2GRAY)
    mask_adapt, method_a = adaptive_lane_binarize(roi_shadow, mode="auto", config=cfg)
    assert "adaptive" in method_a, f"Shadow lighting should pick adaptive, got: {method_a}"
    print(f"   ✅ Shadow/non-uniform lighting: selected method = {method_a}")


def test_blur_tracker():
    print("\n🧪 [Test 4] Testing BlurTracker & Safety Gate...")
    tracker = BlurTracker()

    fake_lane = {"detected": True, "steering_offset": 0.25, "suggested_turn": "RIGHT"}
    fake_collision_critical = {
        "threat_level": "CRITICAL",
        "is_emergency_stop": True,
        "threat_object": "người"
    }

    # Frame 1: Rõ -> cập nhật hợp lệ
    l1, c1, dropped1 = tracker.process_blur_state(
        is_blurry=False,
        current_lane=fake_lane,
        current_collision=fake_collision_critical,
        enable_filter=True
    )
    assert not dropped1, "Sharp frame should not be dropped"
    assert c1["is_emergency_stop"] is True, "Emergency stop preserved on sharp frame"

    # Frame 2: Mờ -> phải bị drop, phanh bị khóa, lane giữ frame 1
    new_fake_lane = {"detected": False, "steering_offset": -0.8}
    l2, c2, dropped2 = tracker.process_blur_state(
        is_blurry=True,
        current_lane=new_fake_lane,
        current_collision=fake_collision_critical,
        enable_filter=True
    )
    assert dropped2, "Blurry frame must be dropped"
    assert tracker.dropped_blurry_count == 1, "Dropped counter must increment"
    assert c2["is_emergency_stop"] is False, "CRITICAL brake must be locked on blurry frame"
    assert l2["steering_offset"] == 0.25, "Lane steering must be preserved from last valid frame"
    print(f"   ✅ BlurTracker: dropped={dropped2}, emergency_stop_locked={not c2['is_emergency_stop']}, preserved_offset={l2['steering_offset']}")


def test_video_stabilizer():
    print("\n🧪 [Test 5] Testing VideoStabilizer (Affine LK + RANSAC)...")
    cfg = VisionConfig()
    cfg.ENABLE_STABILIZER = True
    stabilizer = VideoStabilizer(cfg)

    # Frame 1: Khởi tạo
    f1 = create_synthetic_frame(brightness=120)
    # Thêm các chấm đặc trưng ngẫu nhiên để LK dễ bắt điểm
    np.random.seed(42)
    for _ in range(80):
        rx, ry = np.random.randint(20, 620), np.random.randint(20, 460)
        cv2.circle(f1, (rx, ry), 3, (0, 0, 0), -1)

    s1, info1 = stabilizer.process(f1)
    assert not info1["is_stabilized"], "First frame cannot be stabilized (no baseline)"

    # Frame 2: Giả lập rung lắc (dịch chuyển tịnh tiến dx=8px, dy=-4px)
    M_jitter = np.float32([[1, 0, 8], [0, 1, -4]])
    f2 = cv2.warpAffine(f1, M_jitter, (640, 480))

    t0 = time.perf_counter()
    s2, info2 = stabilizer.process(f2)
    t_stab_ms = (time.perf_counter() - t0) * 1000

    print(f"   ✅ Stabilizer: n_features={info2['n_features']}, detected dx={info2['dx']}, dy={info2['dy']}, jitter={info2['jitter']}px, time={t_stab_ms:.2f}ms")
    assert info2["is_stabilized"], "Frame 2 should be stabilized"
    assert info2["n_features"] >= 10, "Should detect sufficient Shi-Tomasi corners"

    # Frame 3: Đổi đột ngột kích thước (ví dụ camera kết nối thật từ 480x640 sang 720x1280)
    f3 = create_synthetic_frame(width=1280, height=720, brightness=120)
    s3, info3 = stabilizer.process(f3)
    assert not info3["is_stabilized"], "Frame 3 with new resolution must reset gracefully without crash"
    print("   ✅ Stabilizer resolution change handled gracefully without crash!")


def test_fps_performance_benchmark():
    print("\n🧪 [Test 6] Benchmarking Phase 1 throughput (>= 20 FPS)...")
    cfg = VisionConfig()
    cfg.ENABLE_PREPROCESS = True
    cfg.ENABLE_STABILIZER = True
    cfg.LANE_THRESHOLD_MODE = "auto"

    stabilizer = VideoStabilizer(cfg)
    test_frame = create_synthetic_frame(brightness=60, with_lane=True)
    # Thêm texture
    for _ in range(50):
        cv2.circle(test_frame, (np.random.randint(20, 620), np.random.randint(20, 460)), 3, (20, 20, 20), -1)

    times = []
    for _ in range(30):
        t0 = time.perf_counter()

        # 1. Assess
        q = assess_frame(test_frame, cfg)
        # 2. Enhance
        enhanced, _ = adaptive_enhance(test_frame, q, cfg)
        # 3. Stabilize
        stab, _ = stabilizer.process(enhanced)
        # 4. Lane tracking
        lane = cv_algo.process_lane_tracking(stab)

        t_elapsed = (time.perf_counter() - t0) * 1000
        times.append(t_elapsed)

    avg_time = np.mean(times)
    fps_est = 1000.0 / avg_time
    print(f"   ⏱️ Phase 1 Full Pipeline: Mean latency = {avg_time:.2f}ms / frame &rarr; Est. {fps_est:.1f} FPS (Target >= 20 FPS)")
    assert fps_est >= 20.0, f"Performance must be >= 20 FPS, got {fps_est:.1f}"
    print("   ✅ Benchmark PASSED: Tốc độ xử lý hoàn toàn vượt chuẩn 20 FPS!")


if __name__ == "__main__":
    print("=" * 70)
    print("   KIỂM THỬ ĐƠN VỊ PHASE 1: TIỀN XỬ LÝ THÍCH NGHI & ỔN ĐỊNH ẢNH")
    print("=" * 70)
    test_assess_frame()
    test_adaptive_enhance()
    test_adaptive_lane_binarize()
    test_blur_tracker()
    test_video_stabilizer()
    test_fps_performance_benchmark()
    print("\n🎉 TOÀN BỘ 6 BÀI KIỂM THỬ PHASE 1 ĐÃ VƯỢT QUA 100%!")

