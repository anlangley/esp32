import { useState, useEffect, useRef, useCallback } from 'react';
import { Maximize2, Minimize2, X, Battery, Wifi, Zap, Radio, AlertTriangle } from 'lucide-react';
import type { CameraConfig, TelemetryData, ControlCommand } from '../types/control';

interface FPVCockpitModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CameraConfig;
  telemetry: TelemetryData;
  isOnline: boolean;
  onCommandChange: (cmd: ControlCommand) => void;
  speedLimit: number;
  setSpeedLimit: (limit: number) => void;
}

export const FPVCockpitModal = ({
  isOpen,
  onClose,
  config,
  telemetry,
  isOnline,
  onCommandChange,
  speedLimit,
  setSpeedLimit,
}: FPVCockpitModalProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const joystickRef = useRef<HTMLDivElement>(null);
  
  // Joystick Touch State
  const [isDragging, setIsDragging] = useState(false);
  const [joystickCoords, setJoystickCoords] = useState({ x: 0, y: 0 });
  const currentCmd = useRef<ControlCommand>({ x: 0, y: 0, speedLimit });

  // Stream URL
  const streamUrl = `http://${config.ip}:${config.port}${config.path}`;
  const [camError, setCamError] = useState(false);

  // Auto request Fullscreen & Orientation Lock on open
  useEffect(() => {
    if (isOpen) {
      setCamError(false);
      try {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
        if (window.screen?.orientation && 'lock' in window.screen.orientation) {
          // @ts-ignore
          window.screen.orientation.lock('landscape').catch(() => {});
        }
      } catch (err) {
        console.log('[FPV] Orientation lock notice:', err);
      }
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }, [isOpen]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Joystick Command Emitter
  const updateCommand = useCallback((x: number, y: number) => {
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));
    const roundedX = Math.round(clampedX * 100) / 100;
    const roundedY = Math.round(clampedY * 100) / 100;

    if (
      currentCmd.current.x !== roundedX ||
      currentCmd.current.y !== roundedY ||
      currentCmd.current.speedLimit !== speedLimit
    ) {
      currentCmd.current = { x: roundedX, y: roundedY, speedLimit };
      onCommandChange(currentCmd.current);
    }
  }, [speedLimit, onCommandChange]);

  // Touch Move Handler for Joystick inside Camera Frame
  const handleJoystickMove = useCallback((clientX: number, clientY: number) => {
    if (!joystickRef.current) return;
    const rect = joystickRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let deltaX = clientX - centerX;
    let deltaY = clientY - centerY;

    const maxRadius = rect.width / 2 - 15;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > maxRadius) {
      deltaX = (deltaX / distance) * maxRadius;
      deltaY = (deltaY / distance) * maxRadius;
    }

    setJoystickCoords({ x: deltaX, y: deltaY });

    const normX = deltaX / maxRadius;
    const normY = -deltaY / maxRadius; // Invert Y (up is forward)
    updateCommand(normX, normY);
  }, [updateCommand]);

  const handleJoystickStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    handleJoystickMove(clientX, clientY);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      handleJoystickMove(clientX, clientY);
    };

    const onEnd = () => {
      if (isDragging) {
        setIsDragging(false);
        setJoystickCoords({ x: 0, y: 0 });
        updateCommand(0, 0);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
    }

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isDragging, handleJoystickMove, updateCommand]);

  if (!isOpen) return null;

  // Signal & Battery Helpers
  const batteryPct = isOnline ? telemetry.batteryPercentage : 0;
  const batteryVolts = isOnline ? telemetry.batteryVoltage.toFixed(1) : '0.0';
  const getBatteryColor = (pct: number) => {
    if (pct >= 50) return 'bg-cyber-neonGreen text-cyber-neonGreen';
    if (pct >= 20) return 'bg-cyber-neonYellow text-cyber-neonYellow';
    return 'bg-cyber-neonRed text-cyber-neonRed animate-pulse';
  };

  const isCollisionWarning = isOnline && telemetry.distance <= 30;
  const currentSpeedPct = Math.round(Math.sqrt(currentCmd.current.x * currentCmd.current.x + currentCmd.current.y * currentCmd.current.y) * speedLimit);

  return (
    <div 
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black select-none overflow-hidden flex flex-col justify-between"
    >
      {/* 1. CAMERA BACKGROUND FEED (FULLSCREEN FPV) */}
      <div className="absolute inset-0 z-0 bg-gray-950 flex items-center justify-center">
        {!camError ? (
          <img
            src={streamUrl}
            alt="FPV Stream"
            onError={() => setCamError(true)}
            className="w-full h-full object-cover sm:object-contain"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
            <AlertTriangle className="w-12 h-12 text-cyber-neonRed animate-bounce" />
            <h3 className="text-white font-bold text-base uppercase font-mono">Đang chờ luồng Camera FPV...</h3>
            <p className="text-xs text-gray-400 font-mono">Đảm bảo IP Camera điện thoại: http://{config.ip}:{config.port}{config.path}</p>
            <button
              onClick={() => setCamError(false)}
              className="px-4 py-1.5 bg-cyber-neonBlue/20 border border-cyber-neonBlue text-cyber-neonBlue rounded-xl text-xs font-mono font-bold"
            >
              Thử kết nối lại
            </button>
          </div>
        )}

        {/* FPV Crosshair Reticle Overlay */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
          <div className="w-24 h-24 border border-cyber-neonBlue/40 rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-cyber-neonBlue rounded-full"></div>
          </div>
          <div className="absolute w-40 h-[1px] bg-cyber-neonBlue/30"></div>
          <div className="absolute h-40 w-[1px] bg-cyber-neonBlue/30"></div>
        </div>

        {/* Collision Warning Flash Screen Overlay */}
        {isCollisionWarning && (
          <div className="absolute inset-0 bg-cyber-neonRed/20 animate-pulse pointer-events-none border-4 border-cyber-neonRed z-10 flex items-center justify-center">
            <div className="bg-black/80 px-6 py-2 rounded-2xl border border-cyber-neonRed text-cyber-neonRed font-mono font-bold text-sm uppercase tracking-widest animate-bounce">
              ⚠️ CẢNH BÁO VẬT CẢN: {telemetry.distance.toFixed(0)} CM!
            </div>
          </div>
        )}
      </div>

      {/* 2. TOP FPV HUD BAR (Báo Pin & Báo Sóng chèn góc trên Camera) */}
      <div className="relative z-20 flex justify-between items-start p-3 sm:p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-auto">
        {/* Left Telemetry HUD: Pin & Sóng */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Battery HUD */}
          <div className="glass-panel-neon px-3 py-1.5 rounded-xl border border-white/10 flex items-center space-x-2 shadow-lg backdrop-blur-md">
            <Battery className={`w-4 h-4 ${getBatteryColor(batteryPct).split(' ')[1]}`} />
            <div>
              <div className="text-xs font-bold font-mono text-white leading-tight">
                {batteryPct}% <span className="text-[10px] text-gray-400">({batteryVolts}V)</span>
              </div>
              <div className="w-14 h-1 bg-black/60 rounded-full overflow-hidden mt-0.5 border border-white/10">
                <div
                  style={{ width: `${batteryPct}%` }}
                  className={`h-full rounded-full ${getBatteryColor(batteryPct).split(' ')[0]}`}
                ></div>
              </div>
            </div>
          </div>

          {/* RSSI Signal HUD */}
          <div className="glass-panel-neon px-3 py-1.5 rounded-xl border border-white/10 flex items-center space-x-2 shadow-lg backdrop-blur-md">
            <Wifi className={`w-4 h-4 ${isOnline ? 'text-cyber-neonGreen' : 'text-cyber-neonRed'}`} />
            <div className="font-mono">
              <div className="text-xs font-bold text-white leading-tight">
                {isOnline ? `${telemetry.rssi} dBm` : 'OFFLINE'}
              </div>
              <div className="text-[9px] text-cyber-neonBlue leading-none">
                CAM: {telemetry.cameraRssi !== undefined ? `${telemetry.cameraRssi} dBm` : '---'}
                {telemetry.cameraFps !== undefined && ` (${telemetry.cameraFps} FPS)`}
              </div>
            </div>
          </div>

          {/* Speed Indicator */}
          <div className="hidden sm:flex glass-panel px-3 py-1.5 rounded-xl border border-white/10 items-center space-x-1.5 font-mono text-xs font-bold">
            <Zap className="w-3.5 h-3.5 text-cyber-neonYellow animate-pulse" />
            <span className="text-gray-300">Tốc độ:</span>
            <span className="text-cyber-neonYellow">{currentSpeedPct}%</span>
          </div>
        </div>

        {/* Right HUD Controls: Online Status & Exit */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-black/60 border border-white/10 font-mono text-[10px] text-gray-300 backdrop-blur-md">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-cyber-neonGreen shadow-[0_0_8px_#39ff14] animate-pulse' : 'bg-cyber-neonRed'}`}></div>
            <span className="font-bold uppercase">{isOnline ? 'LIVE' : 'OFF'}</span>
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-black/60 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white backdrop-blur-md transition-colors"
            title="Bật/Tắt Toàn màn hình"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-cyber-neonRed/20 border border-cyber-neonRed/50 hover:bg-cyber-neonRed/40 text-cyber-neonRed font-bold font-mono text-xs backdrop-blur-md transition-colors flex items-center space-x-1"
          >
            <X className="w-4 h-4" />
            <span>Thoát FPV</span>
          </button>
        </div>
      </div>

      {/* 3. CENTER HUD SPEEDOMETER & COLLISION DISTANCE */}
      <div className="relative z-20 flex justify-between items-center px-6 pointer-events-none">
        {/* Pitch/Roll Indicator / Left telemetry */}
        <div className="hidden sm:block glass-panel px-3 py-2 rounded-2xl border border-white/10 backdrop-blur-md font-mono text-[10px] text-gray-300 space-y-1">
          <div>CHẾ ĐỘ LÁI: <span className="text-cyber-neonGreen font-bold">FPV APP NGANG</span></div>
          <div>CẢM BIẾN: <span className="text-white font-bold">{telemetry.distance.toFixed(0)} CM</span></div>
        </div>

        {/* Center Target Marker */}
        <div className="text-center font-mono">
          <div className="text-xs font-bold tracking-widest text-cyber-neonBlue drop-shadow-[0_0_8px_rgba(0,240,255,0.8)] uppercase">
            {currentCmd.current.y > 0.1 ? '▲ TIẾN' : currentCmd.current.y < -0.1 ? '▼ LÙI' : currentCmd.current.x !== 0 ? '◄► QUAY' : '● DỪNG'}
          </div>
        </div>

        {/* Speed Limit Presets HUD */}
        <div className="pointer-events-auto glass-panel p-1.5 rounded-2xl border border-white/10 backdrop-blur-md flex flex-col space-y-1">
          <span className="text-[9px] font-mono text-gray-400 text-center font-bold">GIỚI HẠN</span>
          {[50, 80, 100].map((limit) => (
            <button
              key={limit}
              onClick={() => setSpeedLimit(limit)}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold transition-all ${
                speedLimit === limit
                  ? 'bg-cyber-neonBlue text-black font-extrabold shadow-[0_0_10px_#00f0ff]'
                  : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              {limit}%
            </button>
          ))}
        </div>
      </div>

      {/* 4. BOTTOM FLOATING JOYSTICK OVERLAY (JOYSTICK NẰM TRONG KHUNG CAMERA) */}
      <div className="relative z-30 p-4 sm:p-6 flex justify-between items-end bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none">
        {/* Left Side Status info */}
        <div className="pointer-events-auto font-mono text-[10px] text-gray-400 space-y-1 bg-black/50 p-2.5 rounded-2xl border border-white/10 backdrop-blur-md">
          <div className="flex items-center space-x-1">
            <Radio className="w-3 h-3 text-cyber-neonGreen animate-pulse" />
            <span className="text-white font-bold">JOYSTICK CẢM ỨNG 360°</span>
          </div>
          <div>Kéo núm gạt trực tiếp trên hình để điều khiển xe.</div>
        </div>

        {/* Right Floating Transparent Touch Joystick inside Camera Feed */}
        <div className="pointer-events-auto relative">
          <div
            ref={joystickRef}
            onMouseDown={handleJoystickStart}
            onTouchStart={handleJoystickStart}
            className={`w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 transition-all flex items-center justify-center relative touch-none shadow-[0_0_25px_rgba(0,240,255,0.2)] backdrop-blur-md ${
              isDragging
                ? 'border-cyber-neonGreen bg-cyber-neonGreen/10 shadow-[0_0_35px_rgba(57,255,20,0.4)] scale-105'
                : 'border-cyber-neonBlue/40 bg-black/40 hover:border-cyber-neonBlue'
            }`}
          >
            {/* Inner Ring grid lines */}
            <div className="absolute inset-4 rounded-full border border-white/10 pointer-events-none"></div>
            <div className="absolute w-full h-[1px] bg-white/10 pointer-events-none"></div>
            <div className="absolute h-full w-[1px] bg-white/10 pointer-events-none"></div>

            {/* Draggable Knob */}
            <div
              style={{
                transform: `translate(${joystickCoords.x}px, ${joystickCoords.y}px)`,
              }}
              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 transition-transform duration-75 flex items-center justify-center shadow-xl ${
                isDragging
                  ? 'bg-cyber-neonGreen border-white text-black shadow-[0_0_20px_#39ff14] scale-110'
                  : 'bg-cyber-neonBlue/80 border-white text-black shadow-[0_0_15px_#00f0ff]'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white/80"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
