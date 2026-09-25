import {
  Gamepad2, Settings, RotateCw, Volume2, VolumeX, Loader2,
  Battery, Wifi, Maximize2, Minimize2, Radio, Monitor, SlidersHorizontal,
  ShieldAlert, Target
} from 'lucide-react';
import type { TelemetryData } from '../../types/control';
import { useAuth } from '../../contexts/AuthContext';

interface FpvHeaderBarProps {
  isOnline: boolean;
  isDemoMode: boolean;
  setIsDemoMode: (mode: boolean) => void;
  telemetry: TelemetryData;
  realFps: number;
  realCameraRssi: number;
  controlStyle: 'split' | 'joystick';
  audioState: 'off' | 'connecting' | 'playing' | 'error';
  isFullscreen: boolean;
  setIsFpvMode: (mode: boolean) => void;
  toggleRotation: () => void;
  toggleControlStyle: () => void;
  toggleAudio: () => void;
  toggleFullscreen: () => void;
  setShowSettingsModal: (open: boolean) => void;
  setIsQrModalOpen: (open: boolean) => void;
  isFollowMode?: boolean;
  toggleFollowMode?: (enabled?: boolean) => void;
}

export function FpvHeaderBar({
  isOnline,
  isDemoMode,
  setIsDemoMode,
  telemetry,
  realFps,
  realCameraRssi,
  controlStyle,
  audioState,
  isFullscreen,
  setIsFpvMode,
  toggleRotation,
  toggleControlStyle,
  toggleAudio,
  toggleFullscreen,
  setShowSettingsModal,
  setIsQrModalOpen,
  isFollowMode = false,
  toggleFollowMode,
}: FpvHeaderBarProps) {
  const { activeVehicle } = useAuth();
  const isRealCar = !!activeVehicle && activeVehicle.vehicleCode.toUpperCase() !== 'CAR-A1B2C3';

  return (
    <div className="relative z-10 p-3 sm:p-4 flex items-center justify-between pointer-events-auto bg-gradient-to-b from-black/80 via-black/40 to-transparent">
      {/* LEFT: Exit FPV & Connection Status */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        <button
          onClick={() => setIsFpvMode(false)}
          className="bg-black/50 border border-white/20 text-white hover:border-cyber-neonBlue px-3 py-1.5 rounded-xl text-xs font-bold font-mono flex items-center space-x-1.5 shadow-lg backdrop-blur-md transition-all active:scale-95"
        >
          <Monitor className="w-4 h-4 text-cyber-neonBlue" />
          <span className="hidden sm:inline">THOÁT FPV</span>
        </button>

        <button
          onClick={() => setIsDemoMode(!isDemoMode)}
          className={`flex items-center space-x-2 border px-3 py-1.5 rounded-xl backdrop-blur-md transition-all active:scale-95 cursor-pointer ${
            isRealCar
              ? isOnline
                ? 'bg-cyan-500/20 border-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                : 'bg-black/50 border-red-500/50'
              : 'bg-amber-500/20 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
          }`}
          title={isDemoMode ? 'Đang bật mô phỏng 2D (Nhấn để tắt demo)' : 'Nhấn để bật mô phỏng 2D'}
        >
          <div className={`w-2.5 h-2.5 rounded-full ${isRealCar ? (isOnline ? 'bg-cyber-neonGreen animate-pulse shadow-[0_0_10px_#39ff14]' : 'bg-red-500') : 'bg-amber-400 animate-pulse'}`} />
          <span className="text-xs font-bold font-mono text-white">
            {isRealCar ? (isOnline ? 'XE THẬT ONLINE' : 'XE THẬT OFFLINE') : 'DEMO (CAR-A1B2C3)'}
          </span>
        </button>
      </div>

      {/* CENTER: TELEMETRY BADGES (COMPACT ON MOBILE, FULL ON PC/TABLET) */}
      {(() => {
        const isOnlineOrDemo = isOnline || isDemoMode;
        const dist = telemetry.distance ?? 999;
        const isCriticalDistance = isOnlineOrDemo && dist <= 20;
        const isWarningDistance = isOnlineOrDemo && dist > 20 && dist <= 40;

        return (
          <div className="flex items-center space-x-2 sm:space-x-3 bg-black/60 border border-white/15 px-2.5 sm:px-4 py-1.5 rounded-xl backdrop-blur-md font-mono text-[11px] sm:text-xs text-white shadow-lg">
            {/* Cảm biến khoảng cách vật cản - Hiển thị ưu tiên trên mọi thiết bị */}
            <div
              className={`flex items-center space-x-1 px-1.5 py-0.5 rounded transition-all ${
                isCriticalDistance
                  ? 'bg-red-500/30 text-cyber-neonRed font-black animate-pulse border border-red-500/50 shadow-[0_0_10px_rgba(255,0,60,0.5)]'
                  : isWarningDistance
                  ? 'bg-amber-500/20 text-amber-400 font-bold border border-amber-500/40'
                  : 'text-cyber-neonBlue'
              }`}
              title="Khoảng cách tới vật cản từ Cảm biến Siêu âm"
            >
              <ShieldAlert className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isCriticalDistance ? 'animate-bounce text-red-500' : isWarningDistance ? 'text-amber-400' : 'text-cyber-neonBlue'}`} />
              <span>{isOnlineOrDemo ? `${dist.toFixed(1)}cm` : '---'}</span>
            </div>

            <div className="w-[1px] h-3 bg-white/20" />

            {/* Phần trăm Pin */}
            <div className="flex items-center space-x-1">
              <Battery className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${telemetry.batteryPercentage < 20 ? 'text-cyber-neonRed animate-pulse' : 'text-cyber-neonGreen'}`} />
              <span>{isOnlineOrDemo ? `${telemetry.batteryPercentage}%` : '--'}</span>
            </div>

            {/* Sóng WiFi - Ẩn bớt trên màn hình cực nhỏ để không vỡ giao diện */}
            <div className="hidden sm:block w-[1px] h-3 bg-white/20" />
            <div className="hidden sm:flex items-center space-x-1">
              <Wifi className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyber-neonBlue" />
              <span>{realCameraRssi} dBm</span>
            </div>

            {/* Frame rate FPS - Ẩn bớt trên màn hình cực nhỏ */}
            <div className="hidden sm:block w-[1px] h-3 bg-white/20" />
            <div className="hidden sm:flex items-center space-x-1">
              <Radio className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyber-neonPink" />
              <span>{realFps} FPS</span>
            </div>
          </div>
        );
      })()}

      {/* RIGHT: CONTROL BUTTONS */}
      <div className="flex items-center space-x-1.5 sm:space-x-2">
        {/* Follow Mode Toggle Button */}
        <button
          onClick={() => toggleFollowMode?.()}
          className={`p-2 rounded-xl border font-mono text-xs flex items-center space-x-1.5 transition-all backdrop-blur-md active:scale-95 ${
            isFollowMode
              ? 'bg-amber-500/30 border-amber-400 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.5)] animate-pulse'
              : 'bg-black/50 border-white/20 text-gray-300 hover:border-amber-400/60'
          }`}
          title={isFollowMode ? 'Tắt chế độ Tự động Bám theo (Follow Mode)' : 'Bật chế độ Tự động Bám theo (Follow Mode)'}
        >
          <Target className={`w-4 h-4 ${isFollowMode ? 'text-amber-400 animate-spin-slow' : 'text-cyber-neonYellow'}`} />
          <span className="hidden md:inline text-[10px] font-extrabold uppercase font-mono">
            {isFollowMode ? 'BÁM THEO: BẬT' : 'FOLLOW'}
          </span>
        </button>

        <button
          onClick={toggleControlStyle}
          className={`p-2 rounded-xl border font-mono text-xs flex items-center space-x-1 transition-all backdrop-blur-md ${
            controlStyle === 'joystick'
              ? 'bg-cyber-neonGreen/20 border-cyber-neonGreen text-cyber-neonGreen shadow-[0_0_15px_rgba(57,255,20,0.4)]'
              : 'bg-black/50 border-white/20 text-gray-300 hover:border-white/40'
          }`}
          title="Đổi kiểu điều khiển (Split / Joystick 360°)"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden lg:inline text-[10px] font-extrabold uppercase">
            {controlStyle === 'split' ? 'D-PAD 4 HƯỚNG' : 'JOYSTICK 360°'}
          </span>
        </button>

        <button
          onClick={toggleRotation}
          className="p-2 rounded-xl bg-black/50 border border-white/20 text-white hover:border-cyber-neonBlue transition-all backdrop-blur-md active:scale-95"
          title="Xoay góc camera (0° - 90° - 180° - 270°)"
        >
          <RotateCw className="w-4 h-4" />
        </button>

        <button
          onClick={toggleAudio}
          className={`p-2 rounded-xl border transition-all backdrop-blur-md active:scale-95 ${
            audioState === 'playing'
              ? 'bg-cyber-neonGreen/20 border-cyber-neonGreen text-cyber-neonGreen shadow-[0_0_15px_rgba(57,255,20,0.4)]'
              : audioState === 'connecting'
              ? 'bg-amber-500/20 border-amber-500 text-amber-400 animate-pulse'
              : audioState === 'error'
              ? 'bg-red-500/20 border-red-500 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
              : 'bg-black/50 border-white/20 text-gray-400'
          }`}
          title={
            audioState === 'playing'
              ? 'Đang phát âm thanh từ IP Camera'
              : audioState === 'connecting'
              ? 'Đang kết nối âm thanh IP Camera...'
              : audioState === 'error'
              ? 'Lỗi kết nối âm thanh IP Camera! Bấm để thử lại'
              : 'Bật / Tắt Mic truyền thanh từ Xe'
          }
        >
          {audioState === 'playing' ? (
            <Volume2 className="w-4 h-4 text-cyber-neonGreen" />
          ) : audioState === 'connecting' ? (
            <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
          ) : (
            <VolumeX className={`w-4 h-4 ${audioState === 'error' ? 'text-red-500 animate-pulse' : ''}`} />
          )}
        </button>

        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-xl bg-black/50 border border-white/20 text-white hover:border-cyber-neonBlue transition-all backdrop-blur-md active:scale-95"
          title="Toàn màn hình FPV Cockpit"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        <button
          onClick={() => setShowSettingsModal(true)}
          className="p-2 rounded-xl bg-black/50 border border-white/20 text-white hover:border-cyber-neonBlue transition-all backdrop-blur-md active:scale-95"
          title="Cài đặt Camera IP"
        >
          <Settings className="w-4 h-4" />
        </button>

        <button
          onClick={() => setIsQrModalOpen(true)}
          className="p-2 rounded-xl bg-black/50 border border-white/20 text-white hover:border-cyber-neonBlue transition-all backdrop-blur-md active:scale-95"
          title="Quét mã QR kết nối điện thoại"
        >
          <Gamepad2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
