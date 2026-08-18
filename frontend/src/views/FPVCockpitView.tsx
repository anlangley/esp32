import { useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';
import { CarSimulatorGame } from '../components/CarSimulatorGame';
import { QRCodeModal } from '../components/QRCodeModal';
import { CameraSettingsModal } from '../components/CameraSettingsModal';
import { useFpvTouchControls } from '../hooks/useFpvTouchControls';
import { useFpvViewState } from '../hooks/useFpvViewState';
import { FpvHeaderBar } from '../components/fpv/FpvHeaderBar';
import { FpvDriveControls } from '../components/fpv/FpvDriveControls';
import { AiFloatingMic } from '../components/fpv/AiFloatingMic';
import type { CameraConfig, TelemetryData, ControlCommand } from '../types/control';

interface FPVCockpitViewProps {
  voiceAgent: {
    isListening: boolean;
    isProcessing: boolean;
    transcript: string;
    messages: any[];
    toggleListening: () => void;
    sendCommand: (text: string) => void;
  };
  cameraConfig: CameraConfig;
  telemetry: TelemetryData;
  isOnline: boolean;
  currentDriveCmd: ControlCommand;
  handleCommandChange: (cmd: ControlCommand) => void;
  handleDemoTelemetryUpdate: (partial: Partial<TelemetryData>) => void;
  onCameraConfigSave: (config: CameraConfig) => void;
  speedLimit: number;
  setSpeedLimit: (limit: number) => void;
  realCameraRssi: number;
  realFps: number;
  isDemoMode: boolean;
  setIsDemoMode: (mode: boolean) => void;
  isMouseSteerActive: boolean;
  setIsMouseSteerActive: React.Dispatch<React.SetStateAction<boolean>>;
  audioState: 'off' | 'connecting' | 'playing' | 'error';
  audioRef: React.RefObject<HTMLAudioElement | null>;
  toggleAudio: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  isDragging: boolean;
  joystickCoords: { x: number; y: number };
  joystickRef: React.RefObject<HTMLDivElement | null>;
  handleJoystickStart: (e: React.MouseEvent | React.TouchEvent) => void;
  setIsFpvMode: (mode: boolean) => void;
  isQrModalOpen: boolean;
  setIsQrModalOpen: (open: boolean) => void;
  isFollowMode?: boolean;
  toggleFollowMode?: (enabled?: boolean) => void;
}

/**
 * VIEW 1: FULLSCREEN LANDSCAPE FPV COCKPIT VIEW
 * Tái cấu trúc mô hình Component-Driven nhỏ gọn, sạch sẽ, dễ bảo trì.
 */
export const FPVCockpitView = ({
  voiceAgent,
  cameraConfig, telemetry, isOnline, currentDriveCmd,
  handleCommandChange, handleDemoTelemetryUpdate, onCameraConfigSave,
  speedLimit,
  realCameraRssi, realFps,
  isDemoMode, setIsDemoMode,
  audioState, audioRef, toggleAudio,
  isFullscreen, toggleFullscreen,
  isDragging, joystickCoords, joystickRef, handleJoystickStart,
  setIsFpvMode,
  isQrModalOpen, setIsQrModalOpen,
  isFollowMode, toggleFollowMode,
}: FPVCockpitViewProps) => {
  // Custom hooks tách rời logic
  const {
    camError, setCamError,
    rotation, toggleRotation,
    showSettingsModal, setShowSettingsModal,
    controlStyle, toggleControlStyle,
    handleSettingsSave,
  } = useFpvViewState({ onCameraConfigSave });

  const { touchActive, bindTouchEvents } = useFpvTouchControls({ speedLimit, handleCommandChange });

  const streamUrl = `http://${cameraConfig.ip}:${cameraConfig.port}${cameraConfig.path}`;

  // Tính toán khoảng cách vật cản
  const isOnlineOrDemo = isOnline || isDemoMode;
  const dist = telemetry.distance ?? 999;
  const isCriticalDistance = isOnlineOrDemo && dist <= 20;
  const isWarningDistance = isOnlineOrDemo && dist > 20 && dist <= 40;

  // Sound alert Effect cho Mobile khi vật cản < 20cm
  useEffect(() => {
    if (!isCriticalDistance) return;

    const playBeep = () => {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } catch (e) {
        // Suppress audio policy issues
      }
    };

    playBeep();
    const interval = setInterval(playBeep, 350);
    return () => clearInterval(interval);
  }, [isCriticalDistance]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden flex flex-col justify-between select-none z-50 font-sans">
      {/* 1. LAYER 0: CAMERA STREAM OR SIMULATOR GAME */}
      <div className="absolute inset-0 z-0 bg-black flex items-center justify-center overflow-hidden">
        {!isOnline && isDemoMode ? (
          <CarSimulatorGame
            driveCommand={currentDriveCmd}
            onTelemetryUpdate={handleDemoTelemetryUpdate}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center transition-transform duration-300"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            {!camError ? (
              <img
                src={streamUrl}
                alt="ESP32-CAM Live Stream"
                className="w-full h-full object-cover"
                onError={() => setCamError(true)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-gray-500 space-y-2 p-6 text-center">
                <div className="w-12 h-12 rounded-full border border-gray-700 flex items-center justify-center bg-gray-900/50">
                  📷
                </div>
                <span className="text-sm font-mono text-gray-400">KHÔNG THỂ KẾT NỐI CAMERA</span>
                <span className="text-xs text-gray-600 font-mono">http://{cameraConfig.ip}:{cameraConfig.port}{cameraConfig.path}</span>
                <button
                  onClick={() => setCamError(false)}
                  className="mt-2 px-3 py-1 bg-cyber-neonBlue/20 border border-cyber-neonBlue/50 text-cyber-neonBlue text-xs rounded-lg hover:bg-cyber-neonBlue/30 transition-all font-mono"
                >
                  Thử lại
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 1.5. LAYER 0.5: OBSTACLE HAZARD BORDER FLASH OVERLAY */}
      {isCriticalDistance && (
        <div className="absolute inset-0 pointer-events-none z-10 border-4 border-red-600/90 bg-red-950/20 shadow-[inset_0_0_60px_rgba(255,0,60,0.7)] animate-pulse" />
      )}
      {isWarningDistance && (
        <div className="absolute inset-0 pointer-events-none z-10 border-2 border-amber-500/70 bg-amber-950/10 shadow-[inset_0_0_35px_rgba(245,158,11,0.4)]" />
      )}

      {/* FLOATING HUD OBSTACLE WARNING BANNER FOR MOBILE */}
      {(isCriticalDistance || isWarningDistance) && (
        <div className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-bounce">
          <div className={`px-4 py-1.5 sm:px-6 sm:py-2 rounded-full border flex items-center space-x-2 font-mono text-xs sm:text-sm font-bold shadow-2xl backdrop-blur-md uppercase tracking-wider ${
            isCriticalDistance
              ? 'bg-red-600/90 border-red-400 text-white shadow-[0_0_30px_rgba(255,0,60,0.9)] animate-pulse'
              : 'bg-amber-500/90 border-amber-300 text-black shadow-[0_0_20px_rgba(245,158,11,0.8)]'
          }`}>
            <ShieldAlert className={`w-4 h-4 sm:w-5 sm:h-5 ${isCriticalDistance ? 'text-white animate-spin-slow' : 'text-black'}`} />
            <span>
              {isCriticalDistance
                ? `🚨 CẢNH BÁO: VẬT CẢN NGUY HIỂM (${dist.toFixed(1)} cm)!`
                : `⚠️ CHÚ Ý: CHƯỚNG NGẠI VẬT (${dist.toFixed(1)} cm)`}
            </span>
          </div>
        </div>
      )}

      {/* 2. LAYER 1: HEADER STATUS BAR */}
      <FpvHeaderBar
        isOnline={isOnline}
        isDemoMode={isDemoMode}
        setIsDemoMode={setIsDemoMode}
        telemetry={telemetry}
        realFps={realFps}
        realCameraRssi={realCameraRssi}
        controlStyle={controlStyle}
        audioState={audioState}
        isFullscreen={isFullscreen}
        setIsFpvMode={setIsFpvMode}
        toggleRotation={toggleRotation}
        toggleControlStyle={toggleControlStyle}
        toggleAudio={toggleAudio}
        toggleFullscreen={toggleFullscreen}
        setShowSettingsModal={setShowSettingsModal}
        setIsQrModalOpen={setIsQrModalOpen}
        isFollowMode={isFollowMode}
        toggleFollowMode={toggleFollowMode}
      />

      {/* 3. LAYER 2: TOUCH DRIVE CONTROLS (SPLIT / JOYSTICK) */}
      <FpvDriveControls
        controlStyle={controlStyle}
        touchActive={touchActive}
        bindTouchEvents={bindTouchEvents}
        isDragging={isDragging}
        joystickCoords={joystickCoords}
        joystickRef={joystickRef}
        handleJoystickStart={handleJoystickStart}
      />

      {/* 4. LAYER 3: FLOATING AI MICROPHONE & RESPONSE TOAST */}
      <AiFloatingMic voiceAgent={voiceAgent} />

      {/* 5. AUDIO ELEMENT FOR IP CAMERA LIVE AUDIO */}
      <audio ref={audioRef} className="hidden" playsInline preload="none" crossOrigin="anonymous" />

      {/* 6. MODALS */}
      <CameraSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        cameraConfig={cameraConfig}
        onSave={handleSettingsSave}
      />

      <QRCodeModal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} />
    </div>
  );
};

