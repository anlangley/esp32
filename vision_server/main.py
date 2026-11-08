import asyncio
import time
import sys
import cv2
import requests

# Bắt buộc UTF-8 cho stdout trên Windows để tránh lỗi UnicodeEncodeError với emoji
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from config import cfg
from services.camera_stream import camera_manager
from services.yolo_detector import yolo_detector
from services.cv_algorithms import cv_algo

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi động camera và nạp model AI khi server bật
    print("🚀 [VisionServer] Starting services...")
    camera_manager.start()
    yolo_detector.load_model()
    yield
    # Dọn dẹp tài nguyên khi tắt server
    print("🛑 [VisionServer] Shutting down services...")
    camera_manager.stop()

app = FastAPI(
    title="IoT Car Python Vision Service",
    description="Microservice xử lý ảnh, nhận diện vật thể YOLOv8 và dò line OpenCV",
    version="1.0.0",
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

@app.get("/")
@app.get("/health")
def health_check():
    """Kiểm tra tình trạng sức khỏe của Vision Server & GPU"""
    return {
        "status": "online",
        "service": "IoT Car Python Vision Microservice",
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
        }
    }

@app.post("/api/set_camera_url")
def set_camera_url(req: CameraUpdateRequest):
    """Cập nhật địa chỉ IP Camera từ frontend hoặc backend mà không cần khởi động lại server"""
    if not req.camera_url:
        raise HTTPException(status_code=400, detail="camera_url is required")
    camera_manager.set_stream_url(req.camera_url)
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
    Độ trễ siêu thấp (5-10ms) trực tiếp về React Frontend HUD
    """
    await websocket.accept()
    print("🔌 [WebSocket] Client connected to /ws/detections")
    
    last_emergency_sent = 0.0

    try:
        while True:
            # 1. Lấy frame mới nhất từ camera
            is_real, frame = camera_manager.get_latest_frame()
            h, w = frame.shape[:2]

            # 2. Chạy YOLOv8 nhận diện vật thể
            detections = yolo_detector.detect(frame)

            # 3. Chạy OpenCV phân tích làn đường & vạch kẻ
            lane_data = cv_algo.process_lane_tracking(frame)

            # 4. Phân tích vùng nguy hiểm va chạm
            collision = cv_algo.analyze_collision_risk(frame.shape, detections)

            # 5. Nếu có cảnh báo dừng khẩn cấp -> Gửi tín hiệu sang Node.js Backend phanh xe
            now = time.time()
            if collision["is_emergency_stop"] and (now - last_emergency_sent > 1.0):
                last_emergency_sent = now
                try:
                    # Gửi POST async ngầm sang Node.js
                    requests.post(
                        f"{cfg.NODE_BACKEND_URL}/api/control/emergency-brake",
                        json={"reason": f"Vật cản nguy hiểm: {collision['threat_object']}"},
                        timeout=0.1
                    )
                except Exception:
                    pass

            # 6. Đóng gói payload gửi về Frontend
            payload = {
                "timestamp": int(now * 1000),
                "frame_size": {"width": w, "height": h},
                "camera_connected": is_real,
                "camera_fps": camera_manager.fps,
                "inference_ms": yolo_detector.last_inference_time_ms,
                "detections": detections,
                "lane": lane_data,
                "collision": collision
            }

            await websocket.send_json(payload)
            
            # Điều tiết nhịp gửi ~30 FPS
            await asyncio.sleep(0.033)

    except WebSocketDisconnect:
        print("🔌 [WebSocket] Client disconnected from /ws/detections")
    except Exception as e:
        print(f"⚠️ [WebSocket] Error: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=cfg.HOST, port=cfg.PORT, reload=False)
