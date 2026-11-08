import cv2
import time
import numpy as np
from typing import List, Dict, Any, Optional
from config import cfg

# Từ điển Việt hóa nhãn COCO phổ biến cho IoT Car
COCO_VIETNAMESE = {
    "person": "Người",
    "bicycle": "Xe đạp",
    "car": "Ô tô",
    "motorcycle": "Xe máy",
    "airplane": "Máy bay",
    "bus": "Xe buýt",
    "train": "Tàu hỏa",
    "truck": "Xe tải",
    "boat": "Thuyền",
    "traffic light": "Đèn giao thông",
    "fire hydrant": "Trụ cứu hỏa",
    "stop sign": "Biển STOP",
    "parking meter": "Đồng hồ đỗ xe",
    "bench": "Ghế dài",
    "bird": "Chim",
    "cat": "Mèo",
    "dog": "Chó",
    "backpack": "Balo",
    "umbrella": "Ô/Dù",
    "handbag": "Túi xách",
    "bottle": "Chai lọ",
    "cup": "Cốc/Ly",
    "chair": "Ghế",
    "couch": "Sofa",
    "potted plant": "Chậu cây",
    "bed": "Giường",
    "dining table": "Bàn",
    "tv": "Tivi",
    "laptop": "Laptop",
    "mouse": "Chuột",
    "keyboard": "Bàn phím",
    "cell phone": "Điện thoại",
    "book": "Sách",
    "clock": "Đồng hồ",
    "vase": "Bình hoa",
    "scissors": "Kéo",
}

class YOLODetector:
    """
    Bộ nhận diện vật thể YOLOv8 chạy trên GPU RTX 3050 (CUDA)
    """

    def __init__(self, model_name: Optional[str] = None):
        self.model_name = model_name or cfg.MODEL_NAME
        self.model = None
        self.device = cfg.get_device()
        self.is_loaded = False
        self.last_inference_time_ms = 0.0

    def load_model(self):
        """Khởi tạo và nạp model vào GPU"""
        if self.is_loaded:
            return

        try:
            from ultralytics import YOLO
            import torch
            
            print(f"🚀 [YOLO] Loading {self.model_name} on device: {self.device}...")
            # Tự động tải yolov8n.pt nếu chưa có
            self.model = YOLO(self.model_name)
            
            # Khởi động trước 1 frame dummy (Warmup GPU)
            dummy_img = np.zeros((320, 320, 3), dtype=np.uint8)
            self.model.predict(dummy_img, device=self.device, verbose=False)
            
            self.is_loaded = True
            cuda_status = f"CUDA (GPU: {torch.cuda.get_device_name(0)})" if self.device != "cpu" and torch.cuda.is_available() else "CPU"
            print(f"✅ [YOLO] Model loaded successfully! Running on: {cuda_status}")
        except Exception as e:
            print(f"❌ [YOLO] Error loading model: {e}")
            self.is_loaded = False

    def detect(self, frame: np.ndarray) -> List[Dict[str, Any]]:
        """
        Nhận diện vật thể trên frame ảnh.
        Trả về danh sách các bounding boxes đã chuẩn hóa.
        """
        if not self.is_loaded or self.model is None:
            return []

        start_time = time.perf_counter()
        detections: List[Dict[str, Any]] = []

        try:
            # Chạy inference YOLOv8
            results = self.model.predict(
                frame,
                conf=cfg.CONFIDENCE_THRESHOLD,
                iou=cfg.IOU_THRESHOLD,
                device=self.device,
                verbose=False,
                imgsz=480  # Tối ưu kích thước 480p cho tốc độ siêu nhanh (>60 FPS)
            )

            for result in results:
                boxes = result.boxes
                for box in boxes:
                    # Tọa độ xyxy: [x1, y1, x2, y2]
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    conf = float(box.conf[0])
                    cls_id = int(box.cls[0])
                    class_name = self.model.names[cls_id]
                    label_vi = COCO_VIETNAMESE.get(class_name, class_name)

                    # Chuyển đổi sang format: [x, y, width, height]
                    w = x2 - x1
                    h = y2 - y1

                    detections.append({
                        "bbox": [round(x1, 1), round(y1, 1), round(w, 1), round(h, 1)],
                        "class_id": cls_id,
                        "class_name": class_name,
                        "label": label_vi,
                        "confidence": round(conf, 2),
                    })

            self.last_inference_time_ms = round((time.perf_counter() - start_time) * 1000, 1)

        except Exception as e:
            print(f"⚠️ [YOLO] Inference error: {e}")

        return detections

    def draw_debug_overlay(self, frame: np.ndarray, detections: List[Dict[str, Any]]) -> np.ndarray:
        """Vẽ bounding box và nhãn neon trực tiếp lên frame (để debug hoặc xem MJPEG)"""
        output = frame.copy()
        for det in detections:
            x, y, w, h = [int(v) for v in det["bbox"]]
            label = f"{det['label']} {int(det['confidence'] * 100)}%"

            # Vẽ hộp chữ nhật xanh neon
            cv2.rectangle(output, (x, y), (x + w, y + h), (57, 255, 20), 2)
            
            # Nền chữ
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(output, (x, max(0, y - 20)), (x + tw + 6, max(20, y)), (0, 0, 0), -1)
            cv2.putText(output, label, (x + 3, max(15, y - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (57, 255, 20), 1)

        return output

# Singleton instance
yolo_detector = YOLODetector()
