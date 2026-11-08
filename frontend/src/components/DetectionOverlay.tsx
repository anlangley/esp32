import React from 'react';
import type { BoundingBoxDetection, LaneTrackingData, CollisionRiskData } from '../hooks/useVisionWebSocket';
import { AlertTriangle, ShieldAlert, Navigation } from 'lucide-react';

interface DetectionOverlayProps {
  detections: BoundingBoxDetection[];
  lane?: LaneTrackingData;
  collision?: CollisionRiskData;
  frameWidth?: number;
  frameHeight?: number;
  containerWidth: number;
  containerHeight: number;
  rotation?: number;
}

export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({
  detections,
  lane,
  collision,
  frameWidth = 1920,
  frameHeight = 1080,
}) => {
  // Tránh chia cho 0
  const fWidth = frameWidth > 0 ? frameWidth : 1920;
  const fHeight = frameHeight > 0 ? frameHeight : 1080;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
      {/* 1. Vẽ các Bounding Box từ YOLOv8 */}
      {detections.map((det, idx) => {
        const [x, y, w, h] = det.bbox;
        // Tọa độ phần trăm (%) chuẩn xác 100% theo khung hình camera
        const leftPct = (x / fWidth) * 100;
        const topPct = (y / fHeight) * 100;
        const widthPct = (w / fWidth) * 100;
        const heightPct = (h / fHeight) * 100;

        // Phân loại màu sắc theo mức độ nguy hiểm
        const isDangerous = collision?.is_emergency_stop && det.label === collision.threat_object;
        const isWarning = collision?.is_collision_warning && det.label === collision.threat_object;

        const borderColor = isDangerous
          ? 'border-cyber-neonRed shadow-[0_0_15px_rgba(255,0,60,0.8)]'
          : isWarning
          ? 'border-cyber-neonYellow shadow-[0_0_15px_rgba(255,230,0,0.7)]'
          : 'border-cyber-neonGreen shadow-[0_0_10px_rgba(57,255,20,0.5)]';

        const badgeBg = isDangerous
          ? 'bg-cyber-neonRed/90 text-white'
          : isWarning
          ? 'bg-cyber-neonYellow/90 text-black'
          : 'bg-black/80 border border-cyber-neonGreen text-cyber-neonGreen';

        return (
          <div
            key={idx}
            className={`absolute border-2 rounded transition-all duration-75 ${borderColor}`}
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${widthPct}%`,
              height: `${heightPct}%`,
            }}
          >
            {/* Nhãn vật thể & % tin cậy */}
            <div
              className={`absolute -top-6 left-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider flex items-center space-x-1 whitespace-nowrap backdrop-blur-sm ${badgeBg}`}
            >
              <span>{det.label}</span>
              <span className="opacity-80">{(det.confidence * 100).toFixed(0)}%</span>
            </div>

            {/* Các góc ngắm Cyberpunk */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-white/80" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-white/80" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-white/80" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white/80" />
          </div>
        );
      })}

      {/* 2. HUD Dò vạch kẻ đường (Lane Follower) */}
      {lane?.detected && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-black/80 border border-cyber-neonBlue/60 backdrop-blur-md flex items-center space-x-2 text-xs font-mono font-semibold shadow-[0_0_15px_rgba(0,243,255,0.3)]">
          <Navigation
            className={`w-4 h-4 text-cyber-neonBlue transition-transform ${
              lane.suggested_turn === 'LEFT'
                ? '-rotate-45'
                : lane.suggested_turn === 'RIGHT'
                ? 'rotate-45'
                : 'rotate-0'
            }`}
          />
          <span className="text-gray-300">LÀN ĐƯỜNG:</span>
          <span
            className={
              lane.suggested_turn === 'STRAIGHT'
                ? 'text-cyber-neonGreen'
                : 'text-cyber-neonYellow'
            }
          >
            {lane.suggested_turn === 'LEFT'
              ? '← RẼ TRÁI'
              : lane.suggested_turn === 'RIGHT'
              ? 'RẼ PHẢI →'
              : 'ĐI THẲNG'}
          </span>
          <span className="text-[10px] text-gray-500">
            ({(lane.steering_offset * 100).toFixed(0)}%)
          </span>
        </div>
      )}

      {/* 3. Cảnh báo va chạm khẩn cấp (Emergency Collision Alert Banner) */}
      {collision?.is_emergency_stop && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-red-600/90 border-2 border-white text-white font-mono font-bold text-sm flex items-center space-x-2 shadow-[0_0_30px_rgba(255,0,0,0.8)] animate-bounce">
          <ShieldAlert className="w-5 h-5 text-white animate-spin" />
          <span>PHANH KHẨN CẤP: PHÁT HIỆN {collision.threat_object?.toUpperCase() || 'VẬT CẢN'} TRƯỚC MẶT!</span>
        </div>
      )}

      {collision?.is_collision_warning && !collision?.is_emergency_stop && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg bg-yellow-500/90 border border-black text-black font-mono font-bold text-xs flex items-center space-x-1.5 shadow-[0_0_20px_rgba(255,230,0,0.6)]">
          <AlertTriangle className="w-4 h-4 text-black animate-pulse" />
          <span>CẢNH BÁO: CÓ {collision.threat_object?.toUpperCase() || 'VẬT THỂ'} Ở GẦN</span>
        </div>
      )}
    </div>
  );
};
