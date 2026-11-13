import asyncio
import time
import sys
import math
import cv2
import requests
from typing import Dict, Any, List, Optional

# Bắt buộc UTF-8 cho stdout trên Windows để tránh lỗi UnicodeEncodeError với emoji
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from starlette.websockets import WebSocketState
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from config import cfg
from services.camera_stream import camera_manager
from services.yolo_detector import yolo_detector
from services.cv_algorithms import cv_algo

from modules.preprocess import assess_frame, adaptive_enhance, BlurTracker, FrameQuality
from modules.stabilizer import VideoStabilizer
from modules.freespace import FreespaceSegmenter
from modules.flow import OpticalFlowDetector
from modules.fusion import SensorFusion

# Khởi tạo các singleton module xử lý ảnh
stabilizer = VideoStabilizer(cfg)
blur_tracker = BlurTracker()
freespace_segmenter = FreespaceSegmenter(cfg)
flow_detector = OpticalFlowDetector(cfg)
sensor_fusion = SensorFusion(cfg)


def sanitize_for_json(obj: Any) -> Any:
    """Thay thế triệt để các giá trị NaN/Inf thành 0.0 để tránh làm lỗi JSON.parse ở Frontend."""
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return 0.0
        return obj
    elif isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    return obj


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi động camera và nạp model AI khi server bật
    print("🚀 [VisionServer] Starting services...")
    camera_manager.start()
    yolo_detector.load_model()
    stabilizer.reset()
    freespace_segmenter.reset()
    flow_detector.reset()
    sensor_fusion.reset()
    yield
    # Dọn dẹp tài nguyên khi tắt server
    print("🛑 [VisionServer] Shutting down services...")
    camera_manager.stop()


app = FastAPI(
    title="IoT Car Python Vision Service",
    description="Microservice xử lý ảnh nâng cao, nhận diện vật thể YOLOv8 và dò line OpenCV",
    version="2.0.0",
    lifespan=lifespan
)

# Cho phép CORS toàn diện từ Frontend và Backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CameraUpdateRequest(BaseModel):
    camera_url: str


class ConfigUpdateRequest(BaseModel):
    config: Dict[str, Any]


@app.get("/")
@app.get("/health")
def health_check():
    """Kiểm tra tình trạng sức khỏe của Vision Server, GPU và cấu hình hiện hành"""
    return {
        "status": "online",
        "service": "IoT Car Python Vision Microservice v2.0",
        "config_hash": cfg.get_hash(),
        "camera": {
            "url": camera_manager.stream_url,
            "connected": camera_manager.is_connected,
            "fps": camera_manager.fps,
        },
        "ai": {
            "model": cfg.MODEL_NAME,
            "loaded": yolo_detector.is_loaded,
            "device": yolo_detector.device,
            "last_inference_ms": yolo_detector.last_inference_time_ms,
        },
        "flags": {
            "enable_preprocess": cfg.ENABLE_PREPROCESS,
            "enable_blur_filter": cfg.ENABLE_BLUR_FILTER,
            "enable_stabilizer": cfg.ENABLE_STABILIZER,
            "lane_threshold_mode": cfg.LANE_THRESHOLD_MODE,
        }
    }


@app.get("/api/config")
def get_config():
    """Lấy toàn bộ cấu hình hiện tại dưới dạng JSON"""
    return {
        "config": cfg.to_dict(),
        "config_hash": cfg.get_hash()
    }


@app.post("/api/config")
def update_config(req: ConfigUpdateRequest):
    """Cập nhật linh hoạt cấu hình từ Frontend / Test Scripts mà không cần restart"""
    cfg.update_from_dict(req.config)
    return {
        "status": "ok",
        "message": "Config updated successfully",
        "config_hash": cfg.get_hash(),
        "active_flags": {
            "ENABLE_PREPROCESS": cfg.ENABLE_PREPROCESS,
            "ENABLE_BLUR_FILTER": cfg.ENABLE_BLUR_FILTER,
            "ENABLE_STABILIZER": cfg.ENABLE_STABILIZER,
            "LANE_THRESHOLD_MODE": cfg.LANE_THRESHOLD_MODE,
            "ENABLE_FREESPACE": cfg.ENABLE_FREESPACE,
            "ENABLE_FLOW": cfg.ENABLE_FLOW,
            "FUSION_MODE": cfg.FUSION_MODE,
        }
    }


@app.post("/api/set_camera_url")
def set_camera_url(req: CameraUpdateRequest):
    """Cập nhật địa chỉ IP Camera từ frontend hoặc backend mà không cần khởi động lại server"""
    if not req.camera_url:
        raise HTTPException(status_code=400, detail="camera_url is required")
    camera_manager.set_stream_url(req.camera_url)
    stabilizer.reset()
    freespace_segmenter.reset()
    flow_detector.reset()
    sensor_fusion.reset()
    return {"status": "ok", "new_camera_url": req.camera_url}


@app.get("/api/snapshot")
def get_snapshot():
    """Chụp nhanh một frame ảnh JPEG phục vụ phân tích hoặc lưu trữ"""
    _, frame = camera_manager.get_latest_frame()
    jpeg_bytes = camera_manager.encode_jpeg(frame, quality=85)
    if not jpeg_bytes:
        raise HTTPException(status_code=500, detail="Cannot encode frame to JPEG")
    return Response(content=jpeg_bytes, media_type="image/jpeg")


def generate_annotated_mjpeg():
    """Generator stream MJPEG đã vẽ sẵn Bounding Box neon (xem trực tiếp trên trình duyệt)"""
    while True:
        _, frame = camera_manager.get_latest_frame()
        if cfg.ROTATION == 90:
            frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
        elif cfg.ROTATION == 180:
            frame = cv2.rotate(frame, cv2.ROTATE_180)
        elif cfg.ROTATION == 270:
            frame = cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
        detections = yolo_detector.detect(frame)
        annotated = yolo_detector.draw_debug_overlay(frame, detections)
        jpeg_bytes = camera_manager.encode_jpeg(annotated, quality=75)
        if jpeg_bytes:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg_bytes + b'\r\n')
        time.sleep(0.033)  # ~30 FPS


@app.get("/video_feed")
def video_feed():
    """Endpoint stream MJPEG kèm AI Overlay trực tiếp"""
    return StreamingResponse(
        generate_annotated_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.websocket("/ws/detections")
async def websocket_detections(websocket: WebSocket):
    """
    WebSocket thời gian thực bắn dữ liệu Bounding Box, Làn đường và Cảnh báo va chạm
    Kèm theo các chỉ số chất lượng ảnh, độ rung lắc và timings_ms chi tiết từng module.
    """
    await websocket.accept()
    print("🔌 [WebSocket] Client connected to /ws/detections")

    last_emergency_sent = 0.0

    try:
        while True:
            t_frame_start = time.perf_counter()

            try:
                # 1. Lấy frame mới nhất từ camera và xoay đúng chiều không gian thực
                is_real, raw_frame = camera_manager.get_latest_frame()
                if cfg.ROTATION == 90:
                    raw_frame = cv2.rotate(raw_frame, cv2.ROTATE_90_CLOCKWISE)
                elif cfg.ROTATION == 180:
                    raw_frame = cv2.rotate(raw_frame, cv2.ROTATE_180)
                elif cfg.ROTATION == 270:
                    raw_frame = cv2.rotate(raw_frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
                h, w = raw_frame.shape[:2]
                processed_frame = raw_frame

                # 2. Phase 1.1: Đánh giá chất lượng ảnh
                t_assess_start = time.perf_counter()
                try:
                    quality = assess_frame(raw_frame, config=cfg)
                except Exception as e:
                    quality = FrameQuality(128.0, 50.0, 100.0, False, False, False, False)
                t_assess_ms = (time.perf_counter() - t_assess_start) * 1000

                # 3. Phase 1.2: Tiền xử lý tăng cường thích nghi
                t_enhance_start = time.perf_counter()
                enhance_steps = ["baseline_raw"]
                if cfg.ENABLE_PREPROCESS:
                    try:
                        processed_frame, enhance_steps = adaptive_enhance(raw_frame, quality, config=cfg)
                    except Exception as e:
                        print(f"⚠️ [Preprocess] Enhance error: {e}")
                        processed_frame = raw_frame
                        enhance_steps = ["error_fallback"]
                t_enhance_ms = (time.perf_counter() - t_enhance_start) * 1000

                # 4. Phase 1.5: Ổn định hình ảnh (Video Stabilizer)
                t_stab_start = time.perf_counter()
                stab_info = {
                    "dx": 0.0, "dy": 0.0, "dtheta": 0.0,
                    "jitter": 0.0, "n_features": 0, "is_stabilized": False
                }
                if cfg.ENABLE_STABILIZER:
                    try:
                        processed_frame, stab_info = stabilizer.process(processed_frame)
                    except Exception as e:
                        print(f"⚠️ [Stabilizer] Error: {e}")
                t_stabilizer_ms = (time.perf_counter() - t_stab_start) * 1000

                # 5. Nhận diện vật thể YOLOv8
                t_yolo_start = time.perf_counter()
                try:
                    raw_yolo_detections = yolo_detector.detect(processed_frame)
                except Exception as e:
                    print(f"⚠️ [YOLO] Detect error: {e}")
                    raw_yolo_detections = []
                t_yolo_ms = (time.perf_counter() - t_yolo_start) * 1000

                # 6. Dò vạch kẻ đường OpenCV
                t_lane_start = time.perf_counter()
                try:
                    lane_data = cv_algo.process_lane_tracking(processed_frame)
                except Exception as e:
                    print(f"⚠️ [Lane] Process error: {e}")
                    lane_data = {
                        "detected": False,
                        "steering_offset": 0.0,
                        "suggested_turn": "STRAIGHT",
                        "center_x": w // 2,
                        "confidence": 0.0,
                        "method_used": "error"
                    }
                t_lane_ms = (time.perf_counter() - t_lane_start) * 1000

                # 7. Phase 2.1: Phân đoạn mặt sàn an toàn (Freespace Segmentation)
                t_fs_start = time.perf_counter()
                freespace_obs: List[Dict[str, Any]] = []
                freespace_metrics = {"blocked_ratio": 0.0, "is_blocked": False, "sample_box": [0, 0, 0, 0]}
                if cfg.ENABLE_FREESPACE:
                    try:
                        freespace_obs, freespace_metrics = freespace_segmenter.process(processed_frame)
                    except Exception as e:
                        print(f"⚠️ [Freespace] Error: {e}")
                t_freespace_ms = (time.perf_counter() - t_fs_start) * 1000

                # 8. Phase 2.2: Dòng quang học Farneback (Optical Flow)
                t_flow_start = time.perf_counter()
                flow_obs: List[Dict[str, Any]] = []
                flow_metrics = {"mean_magnitude": 0.0, "is_approaching": False, "threat_level": "SAFE"}
                if cfg.ENABLE_FLOW:
                    try:
                        flow_obs, flow_metrics = flow_detector.process(processed_frame)
                    except Exception as e:
                        print(f"⚠️ [Flow] Error: {e}")
                t_flow_ms = (time.perf_counter() - t_flow_start) * 1000

                # 9. Phase 2.3: Hợp nhất cảm biến & thị giác máy tính (Sensor & Vision Fusion)
                t_fusion_start = time.perf_counter()
                try:
                    fused_detections, collision = sensor_fusion.fuse(
                        frame_shape=processed_frame.shape,
                        yolo_dets=raw_yolo_detections,
                        freespace_obs=freespace_obs,
                        flow_obs=flow_obs,
                        ultrasonic_dist_cm=None,
                        fusion_mode=cfg.FUSION_MODE
                    )
                except Exception as e:
                    print(f"⚠️ [Fusion] Error: {e}")
                    fused_detections = raw_yolo_detections
                    collision = cv_algo.analyze_collision_risk(processed_frame.shape, fused_detections)
                t_fusion_ms = (time.perf_counter() - t_fusion_start) * 1000

                # 10. Phase 1.3: Lọc frame mờ và chốt an toàn phanh khẩn cấp
                lane_data, collision, is_dropped_blur = blur_tracker.process_blur_state(
                    is_blurry=quality.is_blurry,
                    current_lane=lane_data,
                    current_collision=collision,
                    enable_filter=cfg.ENABLE_BLUR_FILTER
                )

                # 11. Tín hiệu phanh khẩn cấp: Tạm thời vô hiệu hóa việc tự động gửi webhook phanh khẩn cấp
                #     xuống ESP32 để tránh khóa cứng xe khi xe ở trong phòng có bàn ghế / đồ đạc lân cận.
                #     Cảnh báo va chạm vẫn hiển thị đầy đủ trên HUD của Web Dashboard để người lái nhận biết.
                # (ESP32 đã có lá chắn cảm biến siêu âm phần cứng tự phanh khi vật cản < 25cm)
                now = time.time()

                # 12. Tổng hợp thời gian xử lý các module (timings_ms)
                t_total_ms = (time.perf_counter() - t_frame_start) * 1000
                timings_ms = {
                    "assess_ms": round(t_assess_ms, 2),
                    "enhance_ms": round(t_enhance_ms, 2),
                    "stabilizer_ms": round(t_stabilizer_ms, 2),
                    "yolo_ms": round(t_yolo_ms, 2),
                    "lane_ms": round(t_lane_ms, 2),
                    "freespace_ms": round(t_freespace_ms, 2),
                    "flow_ms": round(t_flow_ms, 2),
                    "fusion_ms": round(t_fusion_ms, 2),
                    "total_ms": round(t_total_ms, 2),
                }

                # 13. Đóng gói payload gửi về Frontend
                payload = {
                    "timestamp": int(now * 1000),
                    "frame_size": {"width": w, "height": h},
                    "camera_connected": is_real,
                    "camera_fps": camera_manager.fps,
                    "inference_ms": yolo_detector.last_inference_time_ms,
                    "detections": fused_detections,
                    "lane": lane_data,
                    "collision": collision,

                    # Đo lường định lượng Phase 1 & 2
                    "timings_ms": timings_ms,
                    "quality": {
                        **quality.to_dict(),
                        "enhance_steps": enhance_steps,
                        "dropped_blurry_count": blur_tracker.dropped_blurry_count,
                        "is_dropped_blur": is_dropped_blur
                    },
                    "stabilizer": stab_info,
                    "freespace": {
                        "blocked_ratio": freespace_metrics.get("blocked_ratio", 0.0),
                        "is_blocked": freespace_metrics.get("is_blocked", False),
                        "sample_box": freespace_metrics.get("sample_box", [0, 0, 0, 0]),
                    },
                    "flow": {
                        "mean_magnitude": flow_metrics.get("mean_magnitude", 0.0),
                        "is_approaching": flow_metrics.get("is_approaching", False),
                    },
                    "fusion_mode": cfg.FUSION_MODE,
                    "config_hash": cfg.get_hash()
                }

                # Kiểm tra WebSocket còn sống trước khi gửi dữ liệu
                if websocket.client_state != WebSocketState.CONNECTED:
                    print("🔌 [WebSocket] Client no longer connected, stopping frame loop.")
                    break

                # Làm sạch dữ liệu, triệt tiêu NaN/Inf trước khi gửi JSON
                clean_payload = sanitize_for_json(payload)
                await websocket.send_json(clean_payload)

            except (WebSocketDisconnect, RuntimeError) as ws_err:
                # WebSocket đã đóng → thoát vòng lặp ngay lập tức
                print(f"🔌 [WebSocket] Connection closed during send: {ws_err}")
                break
            except Exception as frame_err:
                print(f"⚠️ [WebSocket Frame Loop] Error: {frame_err}")

            # Điều tiết nhịp gửi ~30 FPS (hoặc tối thiểu 33ms)
            elapsed = time.perf_counter() - t_frame_start
            sleep_time = max(0.001, (1.0 / cfg.TARGET_FPS) - elapsed)
            await asyncio.sleep(sleep_time)

    except WebSocketDisconnect:
        print("🔌 [WebSocket] Client disconnected from /ws/detections")
    except Exception as e:
        print(f"⚠️ [WebSocket] Fatal Connection Error: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=cfg.HOST, port=cfg.PORT, reload=False)
