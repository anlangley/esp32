import { CameraStream } from '../components/CameraStream';
import { JoystickControl } from '../components/JoystickControl';
import { TelemetryPanel } from '../components/TelemetryPanel';
import { VoiceControl } from '../components/VoiceControl';
import { QRCodeModal } from '../components/QRCodeModal';
import { useVoiceAgent } from '../hooks/useVoiceAgent';
import type { CameraConfig, TelemetryData, ControlCommand, LogMessage } from '../types/control';
import type { Socket } from 'socket.io-client';
import {
  Terminal, Zap, Power, HelpCircle, HardDrive, QrCode,
  Smartphone, Target
} from 'lucide-react';

interface DesktopDashboardViewProps {
  // Data
  isOnline: boolean;
  telemetry: TelemetryData;
  currentDriveCmd: ControlCommand;
  cameraConfig: CameraConfig;

  // Logs
  logs: LogMessage[];
  clearLogs: () => void;
  terminalEndRef: React.RefObject<HTMLDivElement | null>;
  addLog: (message: string, type?: LogMessage['type']) => void;

  // Control
  handleCommandChange: (cmd: ControlCommand) => void;
  handleMouseDrive: (cmd: { x: number; y: number }) => void;
  handleCameraConfigChange: (config: CameraConfig) => void;
  handleCameraStatsChange: (stats: { fps: number; rssi: number; isOnline: boolean }) => void;
  handleDemoTelemetryUpdate: (partial: Partial<TelemetryData>) => void;
  toggleConnection: () => void;

  // Follow Mode
  isFollowMode?: boolean;
  toggleFollowMode?: (enabled?: boolean) => void;

  // Speed
  speedLimit: number;
  setSpeedLimit: (limit: number) => void;

  // Demo
  isDemoMode: boolean;
  setIsDemoMode: (mode: boolean) => void;

  // Navigation
  setIsFpvMode: (mode: boolean) => void;

  // QR
  isQrModalOpen: boolean;
  setIsQrModalOpen: (open: boolean) => void;

  // AI Agent Socket reference
  socketRef: React.RefObject<Socket | null>;
}

/**
 * VIEW 2: DESKTOP WEB VIEW (FULL DESKTOP COCKPIT DASHBOARD WITH ALL PANELS)
 * Tách từ App.tsx dòng 800-953 (153 dòng giao diện Desktop).
 */
export const DesktopDashboardView = ({
  isOnline, telemetry, currentDriveCmd, cameraConfig,
  logs, clearLogs, terminalEndRef, addLog,
  handleCommandChange, handleMouseDrive, handleCameraConfigChange,
  handleCameraStatsChange, handleDemoTelemetryUpdate, toggleConnection,
  isFollowMode = false, toggleFollowMode,
  speedLimit, setSpeedLimit,
  isDemoMode, setIsDemoMode,
  setIsFpvMode,
  isQrModalOpen, setIsQrModalOpen,
  socketRef,
}: DesktopDashboardViewProps) => {
  // AI Agent Voice Control hook
  const voiceAgent = useVoiceAgent(socketRef, addLog);
  // Computed values
  const isCollisionWarning = isOnline && telemetry.distance <= 30;

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Desktop Header bar */}
      <header className="flex justify-between items-center glass-panel-neon px-4 py-3 rounded-2xl border-cyber-neonBlue/10 shadow-[0_0_15px_rgba(0,240,255,0.02)]">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className={`w-3.5 h-3.5 rounded-full ${isOnline ? 'bg-cyber-neonGreen shadow-[0_0_8px_#39ff14]' : 'bg-cyber-neonRed'} transition-all duration-300`}></div>
            {isOnline && <div className="absolute inset-0 rounded-full bg-cyber-neonGreen animate-ping opacity-60"></div>}
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest text-white uppercase flex items-center">
              IoT Car Cockpit <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-cyber-neonBlue/10 border border-cyber-neonBlue/20 text-cyber-neonBlue font-mono">v1.0.0</span>
            </h1>
            <p className="text-[9px] text-gray-400 font-mono">Device: ESP32 DevKit V1 + Android Camera</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Follow Mode Toggle Button */}
          <button
            onClick={() => toggleFollowMode?.()}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all duration-200 ${
              isFollowMode
                ? 'bg-amber-500/20 border border-amber-400 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.4)] animate-pulse'
                : 'bg-cyber-neonYellow/10 border border-cyber-neonYellow/30 text-cyber-neonYellow hover:bg-cyber-neonYellow/20'
            }`}
            title="Bật/Tắt chế độ tự động bám theo vật thể phía trước bằng cảm biến siêu âm (60Hz)"
          >
            <Target className="w-3.5 h-3.5" />
            <span>{isFollowMode ? 'Bám theo: BẬT 🚶' : 'Follow Mode'}</span>
          </button>

          <div className="hidden sm:flex items-center space-x-1.5 text-xs font-mono text-gray-400">
            <Zap className={`w-3.5 h-3.5 ${isOnline ? 'text-cyber-neonYellow animate-pulse' : 'text-gray-600'}`} />
            <span>Chế độ: <span className="text-white font-bold">{isOnline ? 'Bình thường' : 'Ngoại tuyến'}</span></span>
          </div>

          {/* Switch to Mobile FPV Mode button */}
          <button
            onClick={() => {
              setIsFpvMode(true);
              if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
              }
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all duration-200 bg-cyber-neonGreen/10 border border-cyber-neonGreen/30 text-cyber-neonGreen hover:bg-cyber-neonGreen/20 shadow-[0_0_10px_rgba(57,255,20,0.15)] animate-pulse"
            title="Xem giao diện App Lái Ngang FPV Mobile (Toàn màn hình ngay lập tức)"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Giao diện Mobile FPV</span>
          </button>

          <button
            onClick={() => setIsQrModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all duration-200 bg-cyber-neonBlue/10 border border-cyber-neonBlue/30 text-cyber-neonBlue hover:bg-cyber-neonBlue/20"
            title="Quét mã QR để mở giao diện điều khiển trên điện thoại"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Quét QR</span>
          </button>

          <button
            onClick={toggleConnection}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all duration-200 ${isOnline
              ? 'bg-cyber-neonRed/10 border border-cyber-neonRed/30 text-cyber-neonRed hover:bg-cyber-neonRed/20'
              : 'bg-cyber-neonGreen/10 border border-cyber-neonGreen/30 text-cyber-neonGreen hover:bg-cyber-neonGreen/20'
              }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{isOnline ? 'Ngắt kết nối' : 'Kết nối xe'}</span>
          </button>
        </div>
      </header>

      {/* Main Layout Grid for Desktop */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left Column: Camera and Control Panel */}
        <section className="lg:col-span-8 flex flex-col gap-4 h-full justify-between">
          {/* Camera Player Component */}
          <CameraStream
            config={cameraConfig}
            onChangeConfig={handleCameraConfigChange}
            isCollisionWarning={isCollisionWarning}
            onDriveCommand={handleMouseDrive}
            onCameraStatsChange={handleCameraStatsChange}
            driveCommand={currentDriveCmd}
            onTelemetryUpdate={handleDemoTelemetryUpdate}
            onLog={addLog}
            isDemoMode={isDemoMode}
            setIsDemoMode={setIsDemoMode}
          />

          {/* Unified Controls HUD Component (Joystick, WASD) */}
          <JoystickControl
            onCommandChange={handleCommandChange}
            speedLimit={speedLimit}
            setSpeedLimit={setSpeedLimit}
            activeCommand={currentDriveCmd}
          />
        </section>

        {/* Right Column: Telemetry Gauges & System Terminal Logs */}
        <section className="lg:col-span-4 flex flex-col gap-4 min-h-0 overflow-hidden">
          {/* Telemetry data readings panel */}
          <div className="shrink-0">
            <TelemetryPanel data={telemetry} isOnline={isOnline} />
          </div>

          {/* AI Agent Voice Control Panel */}
          <div className="shrink-0">
            <VoiceControl
              isListening={voiceAgent.isListening}
              isProcessing={voiceAgent.isProcessing}
              transcript={voiceAgent.transcript}
              messages={voiceAgent.messages}
              isTtsEnabled={voiceAgent.isTtsEnabled}
              setIsTtsEnabled={voiceAgent.setIsTtsEnabled}
              toggleListening={voiceAgent.toggleListening}
              sendCommand={voiceAgent.sendCommand}
              clearMessages={voiceAgent.clearMessages}
              currentEmotion={voiceAgent.currentEmotion}
            />
          </div>

          {/* Full System Terminal Logs Panel for PC */}
          <div className="flex-1 min-h-0 glass-panel rounded-xl p-4 flex flex-col border border-white/5 shadow-md">
            <div className="flex justify-between items-center mb-2 shrink-0">
              <span className="text-xs uppercase font-bold text-cyber-neonBlue tracking-wider flex items-center">
                <Terminal className="w-4 h-4 mr-1.5 text-cyber-neonBlue" /> Nhật ký hệ thống
              </span>
              <button
                onClick={clearLogs}
                className="text-[9px] uppercase tracking-wider text-gray-500 hover:text-white transition-colors"
              >
                Xóa nhật ký
              </button>
            </div>

            {/* Logs display container - fixed max height, scrolls internally */}
            <div className="bg-black/60 rounded-lg p-2.5 font-mono text-[10px] overflow-y-auto max-h-[200px] flex flex-col-reverse gap-1 border border-white/5">
              <div ref={terminalEndRef}></div>
              {logs.length > 0 ? (
                logs.map((log) => (
                  <div key={log.id} className="leading-relaxed border-b border-white/[0.02] pb-0.5">
                    <span className="text-gray-500 mr-1.5">[{log.timestamp}]</span>
                    <span className={
                      log.type === 'error' ? 'text-cyber-neonRed font-bold' :
                        log.type === 'success' ? 'text-cyber-neonGreen' :
                          log.type === 'warning' ? 'text-cyber-neonYellow' :
                            'text-gray-300'
                    }>
                      {log.message}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-gray-600 text-center py-4 italic">Không có sự kiện nào.</div>
              )}
            </div>

            <div className="flex items-center space-x-1.5 text-[9px] text-gray-500 font-mono mt-2 pt-1 border-t border-white/[0.04] shrink-0">
              <HardDrive className="w-3.5 h-3.5 text-gray-600" />
              <span>Giao thức: WebSocket (WSS) + Camera HTTP MJPEG</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Info / Shortcuts */}
      <footer className="glass-panel rounded-xl px-4 py-3 flex flex-col sm:flex-row justify-between items-center gap-2 text-[10px] text-gray-500 font-mono border border-white/5">
        <div className="flex items-center space-x-1">
          <HelpCircle className="w-3.5 h-3.5 text-gray-600" />
          <span>Bấm <kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded text-gray-300">W-A-S-D</kbd> hoặc phím mũi tên để lái xe trực tiếp bằng bàn phím.</span>
        </div>
        <div>
          <span>Thiết kế bởi Senior Software Architect © 2026</span>
        </div>
      </footer>

      {/* QR Code Sharing Modal */}
      <QRCodeModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
      />
    </div>
  );
};
