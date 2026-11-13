import React, { useState } from 'react';
import type {
  BoundingBoxDetection,
  LaneTrackingData,
  CollisionRiskData,
  FrameQualityData,
  StabilizerData,
  TimingsData,
  FreespaceData,
  FlowData
} from '../hooks/useVisionWebSocket';
import {
  AlertTriangle,
  ShieldAlert,
  Navigation,
  Sun,
  Sparkles,
  Activity,
  Camera,
  Lock,
  Layers,
  ChevronDown,
  ChevronUp,
  Loader2,
  Compass
} from 'lucide-react';

interface DetectionOverlayProps {
  detections: BoundingBoxDetection[];
  lane?: LaneTrackingData;
  collision?: CollisionRiskData;
  quality?: FrameQualityData;
  stabilizer?: StabilizerData;
  timings?: TimingsData;
  freespace?: FreespaceData;
  flow?: FlowData;
  fusionMode?: string;
  showTelemetry?: boolean;
  frameWidth?: number;
  frameHeight?: number;
  containerWidth: number;
  containerHeight: number;
  rotation?: number;
}

const DetectionOverlayComponent: React.FC<DetectionOverlayProps> = ({
  detections,
  lane,
  collision,
  quality,
  stabilizer,
  timings,
  freespace,
  flow,
  fusionMode,
  showTelemetry = true,
  frameWidth = 1920,
  frameHeight = 1080,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Tránh chia cho 0
  const fWidth = frameWidth > 0 ? frameWidth : 1920;
  const fHeight = frameHeight > 0 ? frameHeight : 1080;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
      {/* 1. Bảng chỉ số Xử lý ảnh định lượng (CV Telemetry HUD - Phase 1) */}
      {showTelemetry && (
        <div className="absolute top-20 left-3 p-2.5 rounded-xl bg-black/85 border border-cyber-neonBlue/60 backdrop-blur-md font-mono text-[11px] text-gray-300 shadow-[0_0_25px_rgba(0,243,255,0.3)] flex flex-col space-y-1.5 pointer-events-auto select-none w-64 transition-all">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-cyber-neonBlue/30 pb-1">
            <div className="flex items-center space-x-1.5 text-cyber-neonBlue font-bold">
              <Activity className="w-3.5 h-3.5 text-cyber-neonBlue animate-pulse" />
              <span className="text-[10px] tracking-wider uppercase">CV TELEMETRY</span>
            </div>

            <div className="flex items-center space-x-1.5">
              {timings?.total_ms ? (
                <span className="text-[10px] text-cyber-neonGreen font-semibold">
                  {timings.total_ms.toFixed(0)}ms ({(1000 / Math.max(timings.total_ms, 1)).toFixed(0)} FPS)
                </span>
              ) : (
                <span className="text-[9px] text-gray-400">Phase 1</span>
              )}
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="text-gray-400 hover:text-white p-0.5"
                title={isCollapsed ? 'Mở rộng' : 'Thu nhỏ'}
              >
                {isCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {!isCollapsed && (
            <>
              {quality ? (
                <>
                  {/* Độ sáng & Bù Gamma */}
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-400 flex items-center space-x-1">
                      <Sun className="w-3 h-3 text-cyber-neonYellow" />
                      <span>Độ sáng (V):</span>
                    </span>
                    <div className="flex items-center space-x-1">
                      <span className="font-bold text-white">{quality.brightness.toFixed(0)}</span>
                      <span
                        className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                          quality.is_dark
                            ? 'bg-cyber-neonBlue/20 text-cyber-neonBlue border border-cyber-neonBlue/40'
                            : quality.is_bright
                            ? 'bg-cyber-neonYellow/20 text-cyber-neonYellow border border-cyber-neonYellow/40'
                            : 'bg-green-950/40 text-green-400'
                        }`}
                      >
                        {quality.is_dark ? 'TỐI (BÙ GAMMA)' : quality.is_bright ? 'CHÓI LÓA' : 'CHUẨN'}
                      </span>
                    </div>
                  </div>

                  {/* Độ tương phản & Sắc nét */}
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-400 flex items-center space-x-1">
                      <Sparkles className="w-3 h-3 text-purple-400" />
                      <span>T.Phản / Nét:</span>
                    </span>
                    <div className="flex items-center space-x-1">
                      <span className="text-gray-300 font-bold">{quality.contrast.toFixed(0)}</span>
                      <span className="text-gray-500">/</span>
                      <span
                        className={`font-bold ${
                          quality.is_blurry ? 'text-cyber-neonRed animate-pulse' : 'text-cyber-neonGreen'
                        }`}
                      >
                        {quality.sharpness.toFixed(0)}
                      </span>
                      <span
                        className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                          quality.is_blurry
                            ? 'bg-cyber-neonRed/30 text-cyber-neonRed border border-cyber-neonRed/60'
                            : 'bg-green-950/40 text-green-400'
                        }`}
                      >
                        {quality.is_blurry ? 'MỜ RUNG' : 'NÉT'}
                      </span>
                    </div>
                  </div>

                  {/* Thuật toán Dò Lane */}
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-400 flex items-center space-x-1">
                      <Layers className="w-3 h-3 text-cyan-400" />
                      <span>Thuật toán Lane:</span>
                    </span>
                    <span className="text-[9px] font-semibold text-cyan-300 bg-cyan-950/40 px-1 py-0.5 rounded border border-cyan-800/40 truncate max-w-[120px]">
                      {(lane as any)?.method_used || 'Otsu toàn cục'}
                    </span>
                  </div>

                  {/* Ổn định hình ảnh (Stabilizer) */}
                  {stabilizer?.is_stabilized && (
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-gray-400 flex items-center space-x-1">
                        <Camera className="w-3 h-3 text-indigo-400" />
                        <span>Khử rung:</span>
                      </span>
                      <span className="text-[10px] text-indigo-300 font-semibold">
                        {stabilizer.jitter.toFixed(1)}px (dx:{stabilizer.dx > 0 ? `+${stabilizer.dx}` : stabilizer.dx})
                      </span>
                    </div>
                  )}

                  {/* Phân đoạn sàn (Freespace - Phase 2) */}
                  {freespace && (
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-gray-400 flex items-center space-x-1">
                        <Compass className="w-3 h-3 text-purple-400" />
                        <span>Sàn bị chắn:</span>
                      </span>
                      <div className="flex items-center space-x-1">
                        <span
                          className={`font-bold ${
                            freespace.is_blocked ? 'text-cyber-neonRed animate-pulse' : 'text-purple-300'
                          }`}
                        >
                          {(freespace.blocked_ratio * 100).toFixed(0)}%
                        </span>
                        <span
                          className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                            freespace.is_blocked
                              ? 'bg-cyber-neonRed/30 text-cyber-neonRed border border-cyber-neonRed/60'
                              : 'bg-purple-950/40 text-purple-300 border border-purple-800/40'
                          }`}
                        >
                          {freespace.is_blocked ? 'CẢN ĐƯỜNG' : 'THÔNG THOÁNG'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Dòng quang học (Optical Flow - Phase 2) */}
                  {flow && flow.is_approaching && (
                    <div className="flex items-center justify-between text-[10px] bg-amber-950/30 px-1 py-0.5 rounded border border-amber-500/40 animate-pulse">
                      <span className="text-amber-400 font-semibold flex items-center space-x-1">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span>Vật cản tiếp cận!</span>
                      </span>
                      <span className="text-[9px] text-amber-300 font-mono">
                        v:{flow.mean_magnitude.toFixed(1)}
                      </span>
                    </div>
                  )}

                  {/* Chế độ Hợp nhất (Fusion Mode) */}
                  {fusionMode && (
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-gray-400">Hợp nhất CV:</span>
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-cyan-950/50 text-cyan-300 border border-cyan-500/50">
                        {fusionMode === 'or' ? 'OR (ĐA NGUỒN)' : fusionMode === 'vote' ? 'VOTE (BIỂU QUYẾT)' : 'YOLO ONLY'}
                      </span>
                    </div>
                  )}

                  {/* Enhance Steps */}
                  {quality.enhance_steps &&
                    quality.enhance_steps.length > 0 &&
                    quality.enhance_steps[0] !== 'baseline_raw' &&
                    quality.enhance_steps[0] !== 'none' && (
                      <div className="text-[9px] text-cyber-neonYellow/90 bg-cyber-neonYellow/10 px-1.5 py-0.5 rounded border border-cyber-neonYellow/30 truncate">
                        ⚡ {quality.enhance_steps.join(' + ')}
                      </div>
                    )}
                </>
              ) : (
                <div className="py-1 text-[10px] text-cyber-neonYellow/90 flex items-center space-x-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-cyber-neonYellow" />
                  <span>Chờ Vision Server v2.0...</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 2. Cảnh báo Frame mờ - Đã khóa phanh an toàn */}
      {quality?.is_blurry && (
        <div className="absolute top-20 right-3 px-3 py-1.5 rounded-lg bg-orange-600/95 border border-yellow-300 text-white font-mono font-bold text-xs flex items-center space-x-2 shadow-[0_0_20px_rgba(255,165,0,0.8)] animate-pulse">
          <Lock className="w-4 h-4 text-yellow-200" />
          <span>ẢNH MỜ ({quality.sharpness.toFixed(0)} &lt; 60) — KHÓA PHANH ({quality.dropped_blurry_count || 1})</span>
        </div>
      )}

      {/* 3. Vẽ các Bounding Box từ YOLOv8 & Phân đoạn sàn Freespace */}
      {detections.map((det, idx) => {
        const [x, y, w, h] = det.bbox;
        const leftPct = (x / fWidth) * 100;
        const topPct = (y / fHeight) * 100;
        const widthPct = (w / fWidth) * 100;
        const heightPct = (h / fHeight) * 100;

        const isDangerous = collision?.is_emergency_stop && det.label === collision.threat_object;
        const isWarning = collision?.is_collision_warning && det.label === collision.threat_object;

        const isFreespace = det.source === 'freespace';
        const isFlow = det.source === 'flow';
        const isFused = det.source && det.source.startsWith('fused');

        const borderColor = isDangerous
          ? 'border-cyber-neonRed shadow-[0_0_15px_rgba(255,0,60,0.8)]'
          : isWarning
          ? 'border-cyber-neonYellow shadow-[0_0_15px_rgba(255,230,0,0.7)]'
          : isFused
          ? 'border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.8)]'
          : isFreespace
          ? 'border-fuchsia-400 shadow-[0_0_12px_rgba(217,70,239,0.7)]'
          : isFlow
          ? 'border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.7)]'
          : 'border-cyber-neonGreen shadow-[0_0_10px_rgba(57,255,20,0.5)]';

        const badgeBg = isDangerous
          ? 'bg-cyber-neonRed/90 text-white'
          : isWarning
          ? 'bg-cyber-neonYellow/90 text-black'
          : isFused
          ? 'bg-cyan-950/90 border border-cyan-400 text-cyan-300'
          : isFreespace
          ? 'bg-fuchsia-950/90 border border-fuchsia-400 text-fuchsia-200'
          : isFlow
          ? 'bg-amber-950/90 border border-amber-400 text-amber-200'
          : 'bg-black/80 border border-cyber-neonGreen text-cyber-neonGreen';

        // Tránh nhãn bị cắt khi hộp nằm sát mép trên màn hình
        const isNearTop = topPct < 6;
        const badgePosition = isNearTop ? 'top-1 left-1' : '-top-6 left-0';

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
            {/* Nhãn vật thể & % tin cậy & Nguồn phát hiện */}
            <div
              className={`absolute ${badgePosition} px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider flex items-center space-x-1 whitespace-nowrap backdrop-blur-sm z-10 ${badgeBg}`}
            >
              <span>{det.label}</span>
              <span className="opacity-80">{(det.confidence * 100).toFixed(0)}%</span>
              {det.source && det.source !== 'yolo' && (
                <span className="text-[8px] opacity-75 font-normal lowercase bg-black/40 px-1 rounded">
                  {det.source}
                </span>
              )}
            </div>

            {/* Các góc ngắm Cyberpunk */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-white/80" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-white/80" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-white/80" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white/80" />
          </div>
        );
      })}

      {/* 4. HUD Dò vạch kẻ đường (Lane Follower) */}
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

      {/* 5. Cảnh báo va chạm khẩn cấp (Emergency Collision Alert Banner) */}
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

export const DetectionOverlay = React.memo(DetectionOverlayComponent);
