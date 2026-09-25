import { useState } from 'react';
import { CameraStream } from '../components/CameraStream';
import { JoystickControl } from '../components/JoystickControl';
import { TelemetryPanel } from '../components/TelemetryPanel';
import { VoiceControl } from '../components/VoiceControl';
import { QRCodeModal } from '../components/QRCodeModal';
import { VehicleModal } from '../components/VehicleModal';
import { useAuth } from '../contexts/AuthContext';
import { useVoiceAgent } from '../hooks/useVoiceAgent';
import type { CameraConfig, TelemetryData, ControlCommand, LogMessage } from '../types/control';
import type { Socket } from 'socket.io-client';
import {
  Terminal, ChevronDown, Power, HelpCircle, HardDrive, QrCode,
  Smartphone, Target, LogOut, Car, User, Gamepad2
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
  handleCommandChange, handleCameraConfigChange,
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
  const { user, activeVehicle, logout } = useAuth();
  
  // Computed values: Bất kỳ xe nào không phải Demo CAR-A1B2C3 đều là xe phần cứng thật
  const isRealCar = !!activeVehicle && activeVehicle.vehicleCode.toUpperCase() !== 'CAR-A1B2C3';
  const isCollisionWarning = isOnline && telemetry.distance <= 30;
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Desktop Header bar — Phương án A: Tinh giản 3 Cụm Chuẩn Cockpit */}
      <header className="flex justify-between items-center glass-panel-neon px-4 py-2.5 rounded-2xl border-cyber-neonBlue/10 shadow-[0_0_15px_rgba(0,240,255,0.02)]">
        {/* CỤM 1: THƯƠNG HIỆU & TRẠNG THÁI HỆ THỐNG */}
        <div className="flex items-center space-x-3 shrink-0">
          <div className="relative">
            <div className={`w-3.5 h-3.5 rounded-full ${isOnline ? 'bg-cyber-neonGreen shadow-[0_0_8px_#39ff14]' : 'bg-cyber-neonRed'} transition-all duration-300`}></div>
            {isOnline && <div className="absolute inset-0 rounded-full bg-cyber-neonGreen animate-ping opacity-60"></div>}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-widest text-white uppercase">
                IoT Car Cockpit
              </h1>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyber-neonBlue/10 border border-cyber-neonBlue/20 text-cyber-neonBlue font-mono">
                v1.0.0
              </span>
            </div>
            <p className="text-[10px] font-mono flex items-center gap-1.5">
              {isRealCar ? (
                isOnline ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Xe Thật ESP32 • Trực tuyến
                  </span>
                ) : (
                  <span className="text-gray-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                    Xe Thật ESP32 • Chờ kết nối
                  </span>
                )
              ) : (
                <span className="text-amber-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  Xe Demo Ảo • Buồng Lái 2D
                </span>
              )}
            </p>
          </div>
        </div>

        {/* CỤM 2 + CỤM 3: CÔNG CỤ ĐIỀU HƯỚNG & HỒ SƠ */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* CỤM 2: CÁC NÚT CÔNG CỤ NHANH (TINH GỌN DẠNG ICON BUTTON) */}
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            {/* Nút Bám theo vật thể (Follow Mode) */}
            <button
              onClick={() => toggleFollowMode?.()}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all duration-200 border ${
                isFollowMode
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.35)] animate-pulse'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:border-white/25 hover:bg-white/10'
              }`}
              title="Bật/Tắt chế độ xe tự động bám theo vật thể phía trước bằng cảm biến siêu âm (60Hz)"
            >
              <Target className={`w-3.5 h-3.5 ${isFollowMode ? 'text-amber-400' : 'text-gray-400'}`} />
              <span className="hidden md:inline">{isFollowMode ? 'Bám theo: BẬT' : 'Bám theo'}</span>
            </button>

            {/* Nút Chuyển sang giao diện Mobile FPV (Toàn màn hình) */}
            <button
              onClick={() => {
                setIsFpvMode(true);
                if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
                  document.documentElement.requestFullscreen().catch(() => {});
                }
              }}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono font-medium text-gray-300 hover:text-emerald-300 bg-white/5 border border-white/10 hover:border-emerald-500/30 hover:bg-emerald-500/10 transition-all"
              title="Mở giao diện buồng lái toàn màn hình phong cách Mobile FPV"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden xl:inline">Mobile FPV</span>
            </button>

            {/* Nút Quét mã QR */}
            <button
              onClick={() => setIsQrModalOpen(true)}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono font-medium text-gray-300 hover:text-cyan-300 bg-white/5 border border-white/10 hover:border-cyan-500/30 hover:bg-cyan-500/10 transition-all"
              title="Quét mã QR để mở buồng lái trên điện thoại"
            >
              <QrCode className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden xl:inline">Quét QR</span>
            </button>

            {/* Nút Kết nối / Ngắt kết nối xe */}
            <button
              onClick={toggleConnection}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all duration-200 border ${
                isOnline
                  ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.15)]'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.15)]'
              }`}
              title={isOnline ? 'Nhấn để ngắt kết nối WebSocket' : 'Nhấn để kết nối với xe'}
            >
              <Power className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isOnline ? 'Ngắt kết nối' : 'Kết nối'}</span>
            </button>
          </div>

          {/* CỤM 3: QUẢN LÝ XE & HỒ SƠ NGƯỜI DÙNG */}
          {user && (
            <div className="flex items-center space-x-2 pl-2 sm:pl-3 border-l border-white/10">
              {/* Thẻ xe: Click để mở modal danh sách & đổi xe / xóa xe */}
              <button
                onClick={() => setIsVehicleModalOpen(true)}
                className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-xl border text-xs font-mono transition-all ${
                  isRealCar
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400/50 shadow-[0_0_10px_rgba(0,240,255,0.1)]'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 hover:border-amber-400/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]'
                }`}
                title="Nhấn để đổi xe hoặc quản lý/xóa xe đã lưu"
              >
                {isRealCar ? <Car className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> : <Gamepad2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                <span className="font-bold tracking-wide">{isRealCar ? (user?.role === 'admin' ? activeVehicle?.vehicleCode : 'Xe Thật ESP32') : (activeVehicle?.vehicleCode || 'CAR-A1B2C3')}</span>
                <span className="text-[10px] px-1 py-0.5 rounded bg-white/10 opacity-80">
                  {isRealCar ? 'Thật' : 'Demo'}
                </span>
                <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
              </button>

              {/* Thông tin tài khoản */}
              <div className="hidden lg:flex flex-col text-right pl-1">
                <span className="text-xs font-semibold text-white leading-tight flex items-center gap-1 justify-end">
                  <User className="w-3 h-3 text-cyan-400" />
                  {user.displayName || user.username}
                </span>
                <span className="text-[9px] text-gray-400 uppercase font-mono tracking-wider">
                  {user.role === 'admin' ? '🛡️ Admin' : 'Lái xe'}
                </span>
              </div>

              {/* Nút Đăng xuất */}
              <button
                onClick={logout}
                className="p-1.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-all"
                title="Đăng xuất"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
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
            onCameraStatsChange={handleCameraStatsChange}
            driveCommand={currentDriveCmd}
            onTelemetryUpdate={handleDemoTelemetryUpdate}
            onLog={addLog}
            isDemoMode={isDemoMode}
            setIsDemoMode={setIsDemoMode}
          />

          {/* Unified Controls HUD Component (Joystick, WASD, S.BUS RC) */}
          <JoystickControl
            onCommandChange={handleCommandChange}
            speedLimit={speedLimit}
            setSpeedLimit={setSpeedLimit}
            activeCommand={currentDriveCmd}
            isRcMode={telemetry.isRcMode}
            rcThrottle={telemetry.rcThrottle}
            rcSteer={telemetry.rcSteer}
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


      {/* Vehicle Management Modal */}
      <VehicleModal
        isOpen={isVehicleModalOpen}
        onClose={() => setIsVehicleModalOpen(false)}
      />
    </div>
  );
};
