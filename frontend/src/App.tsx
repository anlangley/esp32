import { useState, useCallback, useEffect } from 'react';
import { FPVCockpitView } from './views/FPVCockpitView';
import { DesktopDashboardView } from './views/DesktopDashboardView';
import { useSystemLogs } from './hooks/useSystemLogs';
import { useCarWebSocket } from './hooks/useCarWebSocket';
import { useKeyboardDrive } from './hooks/useKeyboardDrive';
import { useFpvJoystick } from './hooks/useFpvJoystick';
import { useCameraPing } from './hooks/useCameraPing';
import { useAudioStream } from './hooks/useAudioStream';
import { useFullscreen } from './hooks/useFullscreen';
import { useVoiceAgent } from './hooks/useVoiceAgent';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import type { CameraConfig, TelemetryData } from './types/control';

const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  ip: typeof window !== 'undefined' ? window.location.hostname : '192.168.1.15',
  port: '8080',
  path: '/video',
  type: 'mjpeg',
  audioPath: '/audio.aac',
};

function CarDashboard() {
  const { activeVehicle } = useAuth();

  // ==================== APP-LEVEL STATE ====================
  const [cameraConfig, setCameraConfig] = useState<CameraConfig>(DEFAULT_CAMERA_CONFIG);
  const [speedLimit, setSpeedLimit] = useState(80);
  const [isDemoMode, setIsDemoMode] = useState(() => activeVehicle?.vehicleCode === 'CAR-A1B2C3');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  // Tự động đồng bộ isDemoMode khi activeVehicle thay đổi
  useEffect(() => {
    if (activeVehicle) {
      setIsDemoMode(activeVehicle.vehicleCode.toUpperCase() === 'CAR-A1B2C3');
    }
  }, [activeVehicle]);

  // FPV Fullscreen Cockpit Mode state (Auto-active on mobile or when user clicks button on PC)
  const [isFpvMode, setIsFpvMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1024;
    }
    return false;
  });

  // ==================== CUSTOM HOOKS ====================
  const { logs, addLog, clearLogs, terminalEndRef } = useSystemLogs();
  const { isOnline, telemetry, setTelemetry, currentDriveCmd, handleCommandChange, toggleConnection, isFollowMode, toggleFollowMode, socketRef } = useCarWebSocket(addLog, activeVehicle);
  useKeyboardDrive(handleCommandChange, speedLimit);
  const { isDragging, joystickCoords, joystickRef, handleJoystickStart } = useFpvJoystick(handleCommandChange, speedLimit);
  const { realFps, realCameraRssi } = useCameraPing(cameraConfig, isDemoMode, setTelemetry);
  const { audioState, audioRef, toggleAudio } = useAudioStream(cameraConfig);
  const { isFullscreen, toggleFullscreen } = useFullscreen();
  const voiceAgent = useVoiceAgent(socketRef, addLog);

  // Global capture listener: Chặn tuyệt đối cuộn trang bằng phím (Arrow keys, Space, PageUp/Down)
  // Đảm bảo trang web CHỈ cuộn khi người dùng kéo thanh scrollbar bằng chuột
  useEffect(() => {
    const blockKeyboardScroll = (e: KeyboardEvent) => {
      const target = e.target;
      const isInput = target instanceof HTMLInputElement ||
                      target instanceof HTMLTextAreaElement ||
                      (target as HTMLElement)?.isContentEditable;

      if (!isInput) {
        const scrollKeys = [
          'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
          'Space', ' ', 'PageUp', 'PageDown', 'Home', 'End'
        ];
        const scrollCodes = [
          'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'
        ];

        if (scrollKeys.includes(e.key) || scrollCodes.includes(e.code)) {
          e.preventDefault();
        }

        // Tự động gỡ focus khỏi nút bấm nếu có phím được nhấn
        if (document.activeElement instanceof HTMLButtonElement) {
          document.activeElement.blur();
        }
      }
    };

    window.addEventListener('keydown', blockKeyboardScroll, { capture: true });
    return () => window.removeEventListener('keydown', blockKeyboardScroll, { capture: true });
  }, []);



  const handleCameraConfigChange = useCallback((newConfig: CameraConfig) => {
    setCameraConfig(newConfig);
    addLog(`Cập nhật cấu hình camera: http://${newConfig.ip}:${newConfig.port}${newConfig.path}`, 'success');
  }, [addLog]);

  const handleCameraStatsChange = useCallback((stats: { fps: number; rssi: number; isOnline: boolean }) => {
    setTelemetry(prev => ({
      ...prev,
      cameraRssi: stats.rssi,
      cameraFps: stats.fps,
    }));
  }, [setTelemetry]);

  const handleDemoTelemetryUpdate = useCallback((partial: Partial<TelemetryData>) => {
    if (!isDemoMode || isOnline) return; // Never overwrite real ESP32 telemetry with demo data
    setTelemetry(prev => ({ ...prev, ...partial }));
  }, [isDemoMode, isOnline, setTelemetry]);

  // ==================== RENDER ====================

  // VIEW 1: FULLSCREEN LANDSCAPE FPV COCKPIT VIEW
  if (isFpvMode) {
    return (
      <FPVCockpitView
        cameraConfig={cameraConfig}
        telemetry={telemetry}
        isOnline={isOnline}
        currentDriveCmd={currentDriveCmd}
        handleCommandChange={handleCommandChange}
        handleDemoTelemetryUpdate={handleDemoTelemetryUpdate}
        onCameraConfigSave={setCameraConfig}
        speedLimit={speedLimit}
        setSpeedLimit={setSpeedLimit}
        realCameraRssi={realCameraRssi}
        realFps={realFps}
        isDemoMode={isDemoMode}
        setIsDemoMode={setIsDemoMode}
        audioState={audioState}
        audioRef={audioRef}
        toggleAudio={toggleAudio}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        isDragging={isDragging}
        joystickCoords={joystickCoords}
        joystickRef={joystickRef}
        handleJoystickStart={handleJoystickStart}
        setIsFpvMode={setIsFpvMode}
        isQrModalOpen={isQrModalOpen}
        setIsQrModalOpen={setIsQrModalOpen}
        isFollowMode={isFollowMode}
        toggleFollowMode={toggleFollowMode}
        voiceAgent={voiceAgent}
      />
    );
  }

  // VIEW 2: DESKTOP WEB VIEW (FULL DESKTOP COCKPIT DASHBOARD WITH ALL PANELS)
  return (
    <DesktopDashboardView
      isOnline={isOnline}
      telemetry={telemetry}
      currentDriveCmd={currentDriveCmd}
      cameraConfig={cameraConfig}
      logs={logs}
      clearLogs={clearLogs}
      terminalEndRef={terminalEndRef}
      addLog={addLog}
      handleCommandChange={handleCommandChange}
      handleCameraConfigChange={handleCameraConfigChange}
      handleCameraStatsChange={handleCameraStatsChange}
      handleDemoTelemetryUpdate={handleDemoTelemetryUpdate}
      toggleConnection={toggleConnection}
      speedLimit={speedLimit}
      setSpeedLimit={setSpeedLimit}
      isDemoMode={isDemoMode}
      setIsDemoMode={setIsDemoMode}
      setIsFpvMode={setIsFpvMode}
      isQrModalOpen={isQrModalOpen}
      setIsQrModalOpen={setIsQrModalOpen}
      isFollowMode={isFollowMode}
      toggleFollowMode={toggleFollowMode}
      socketRef={socketRef}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <CarDashboard />
      </ProtectedRoute>
    </AuthProvider>
  );
}
