import { useState, useEffect, useRef, useCallback } from 'react';
import { CameraStream } from './components/CameraStream';
import { JoystickControl } from './components/JoystickControl';
import { TelemetryPanel } from './components/TelemetryPanel';
import { QRCodeModal } from './components/QRCodeModal';
import { CarSimulatorGame } from './components/CarSimulatorGame';
import type { CameraConfig, TelemetryData, ControlCommand, LogMessage } from './types/control';
import { 
  Terminal, Zap, Power, HelpCircle, HardDrive, QrCode, Gamepad2, 
  Settings, AlertTriangle, RotateCw, Volume2, VolumeX, Loader2, 
  Battery, Wifi, Maximize2, Minimize2, X, Radio, Smartphone, Monitor
} from 'lucide-react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

const DEFAULT_CAMERA_CONFIG: CameraConfig = {
  ip: '192.168.1.12',
  port: '8080',
  path: '/video',
  type: 'mjpeg',
  audioPath: '/audio.wav',
};

const INITIAL_TELEMETRY: TelemetryData = {
  batteryPercentage: 85,
  batteryVoltage: 11.8,
  distance: 120.0,
  temperature: 32.5,
  rssi: -62,
  speed: 0,
  latency: 15,
};

export default function App() {
  const [cameraConfig, setCameraConfig] = useState<CameraConfig>(DEFAULT_CAMERA_CONFIG);
  const [telemetry, setTelemetry] = useState<TelemetryData>(INITIAL_TELEMETRY);
  const [isOnline, setIsOnline] = useState(false);
  const [speedLimit, setSpeedLimit] = useState(80);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  
  // UI View States
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  
  // FPV Fullscreen Cockpit Mode state (Auto-active on mobile or when user clicks button on PC)
  const [isFpvMode, setIsFpvMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1024;
    }
    return false;
  });

  // Settings Temp Form State
  const [tempIp, setTempIp] = useState(cameraConfig.ip);
  const [tempPort, setTempPort] = useState(cameraConfig.port);
  const [tempPath, setTempPath] = useState(cameraConfig.path);

  // Audio Stream State
  const [audioState, setAudioState] = useState<'off' | 'connecting' | 'playing' | 'error'>('off');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Driving & WebSocket Refs
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [joystickCoords, setJoystickCoords] = useState({ x: 0, y: 0 });
  const [currentDriveCmd, setCurrentDriveCmd] = useState<ControlCommand>({ x: 0, y: 0, speedLimit: 80 });

  // Camera Real Stats State
  const [realFps, setRealFps] = useState(0);
  const [realCameraRssi, setRealCameraRssi] = useState(-100);
  const [camError, setCamError] = useState(false);

  // Mouse Steering state for FPV view on PC
  const [isMouseSteerActive, setIsMouseSteerActive] = useState(false);

  // Key '1' shortcut listener to toggle Mouse Steering ON/OFF
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === '1' || e.code === 'Digit1' || e.code === 'Numpad1') {
        e.preventDefault();
        setIsMouseSteerActive(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Global Keyboard Driving Controller (WASD & Arrow Keys with Unikey support & Continuous Hold Ticker)
  const pressedKeysRef = useRef({ w: false, a: false, s: false, d: false });

  useEffect(() => {
    let driveIntervalId: any = null;

    const getDirectionFromEvent = (e: KeyboardEvent): 'w' | 'a' | 's' | 'd' | null => {
      const k = e.key ? e.key.toLowerCase() : '';
      const c = e.code || '';

      if (c === 'KeyW' || c === 'ArrowUp' || k === 'w' || k === 'ư' || k === 'arrowup') return 'w';
      if (c === 'KeyA' || c === 'ArrowLeft' || k === 'a' || k === 'arrowleft') return 'a';
      if (c === 'KeyS' || c === 'ArrowDown' || k === 's' || k === 'arrowdown') return 's';
      if (c === 'KeyD' || c === 'ArrowRight' || k === 'd' || k === 'arrowright') return 'd';
      return null;
    };

    const sendCurrentDriveCommand = () => {
      const keys = pressedKeysRef.current;
      const x = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      const y = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
      handleCommandChange({ x, y, speedLimit });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const dir = getDirectionFromEvent(e);
      if (dir) {
        if (!pressedKeysRef.current[dir]) {
          pressedKeysRef.current[dir] = true;
          sendCurrentDriveCommand();
        }

        // Start 50ms continuous drive ticker loop while holding down keys
        if (!driveIntervalId) {
          driveIntervalId = setInterval(sendCurrentDriveCommand, 50);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const dir = getDirectionFromEvent(e);
      if (dir) {
        pressedKeysRef.current[dir] = false;
        const keys = pressedKeysRef.current;

        if (!keys.w && !keys.a && !keys.s && !keys.d) {
          if (driveIntervalId) {
            clearInterval(driveIntervalId);
            driveIntervalId = null;
          }
          handleCommandChange({ x: 0, y: 0, speedLimit });
        } else {
          sendCurrentDriveCommand();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      if (driveIntervalId) clearInterval(driveIntervalId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [speedLimit]);

  // Global Window MouseMove listener active ONLY when isMouseSteerActive === true
  useEffect(() => {
    if (!isMouseSteerActive) return;

    let lastTime = 0;
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastTime < 35) return; // Throttle ~30fps
      lastTime = now;

      const width = window.innerWidth;
      if (width <= 0) return;

      const centerX = width / 2;
      let relX = (e.clientX - centerX) / (width / 2);
      relX = Math.max(-1, Math.min(1, relX));
      if (Math.abs(relX) < 0.05) relX = 0;
      relX = Math.round(relX * 100) / 100;

      handleCommandChange({ x: relX, y: 0, speedLimit });
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      // Immediately stop vehicle steering when turning off or unmounting
      handleCommandChange({ x: 0, y: 0, speedLimit });
    };
  }, [isMouseSteerActive, speedLimit]);

  // Helper to add system logs for desktop
  const addLog = (message: string, type: LogMessage['type'] = 'info') => {
    const newLog: LogMessage = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    setLogs(prev => [newLog, ...prev].slice(0, 30));
  };

  // Scroll terminal to bottom
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Initial WebSocket Connection
  useEffect(() => {
    addLog('Khởi tạo giao diện điều khiển...', 'info');
    const backendHost = window.location.hostname || 'localhost';
    addLog(`Đang kết nối đến máy chủ Node.js (${backendHost}:3000)...`, 'info');

    const socket = io(`http://${backendHost}:3000`, {
      query: { role: 'frontend' }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      addLog('Đã kết nối với máy chủ WebSocket (Port 3000) thành công.', 'success');
    });

    socket.on('disconnect', () => {
      addLog('Mất kết nối với máy chủ WebSocket!', 'error');
      setIsOnline(false);
    });

    socket.on('device_status', (status: { online: boolean }) => {
      setIsOnline(status.online);
      if (status.online) {
        addLog('Xe ô tô IoT đã Trực Tuyến (Online) và sẵn sàng nhận lệnh.', 'success');
      } else {
        addLog('Xe ô tô IoT đang Ngoại Tuyến (Offline). Đang chờ kết nối từ xe...', 'warning');
      }
    });

    socket.on('telemetry_data', (data: TelemetryData) => {
      setTelemetry(data);
    });

    socket.on('system_warning', (warningMsg: string) => {
      addLog(`[CẢNH BÁO] ${warningMsg}`, 'warning');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Measure Real Camera Ping & FPS
  useEffect(() => {
    if (!cameraConfig.ip || !cameraConfig.port || isDemoMode) return;

    let isMounted = true;
    const measurePing = () => {
      const img = new Image();
      const startTime = Date.now();

      const handleRes = () => {
        if (!isMounted) return;
        const latency = Date.now() - startTime;
        let calculatedRssi = -60;
        let estimatedFps = 30;

        if (latency > 400) { calculatedRssi = -88; estimatedFps = 12; }
        else if (latency > 150) { calculatedRssi = -72; estimatedFps = 20; }
        else if (latency > 80) { calculatedRssi = -62; estimatedFps = 24; }
        else { calculatedRssi = -48; estimatedFps = 30; }

        setRealCameraRssi(calculatedRssi);
        setRealFps(estimatedFps);
        setTelemetry(prev => ({ ...prev, cameraRssi: calculatedRssi, cameraFps: estimatedFps }));
      };

      img.onload = handleRes;
      img.onerror = handleRes;
      img.src = `http://${cameraConfig.ip}:${cameraConfig.port}/shot.jpg?t=${Date.now()}`;
    };

    measurePing();
    const interval = setInterval(measurePing, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cameraConfig, isDemoMode]);

  // Handle Command Driving updates
  const handleCommandChange = useCallback((cmd: ControlCommand) => {
    setCurrentDriveCmd(cmd);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('drive_command', cmd);
    }
  }, []);

  const handleMouseDrive = useCallback((cmd: { x: number; y: number }) => {
    const payload = { x: cmd.x, y: cmd.y, speedLimit };
    handleCommandChange(payload);
  }, [handleCommandChange, speedLimit]);

  const toggleConnection = () => {
    if (socketRef.current) {
      if (socketRef.current.connected) {
        socketRef.current.disconnect();
        addLog('Đã chủ động ngắt kết nối với máy chủ.', 'warning');
      } else {
        socketRef.current.connect();
        addLog('Đang kết nối lại với máy chủ...', 'info');
      }
    }
  };

  const handleCameraConfigChange = (newConfig: CameraConfig) => {
    setCameraConfig(newConfig);
    addLog(`Cập nhật cấu hình camera: http://${newConfig.ip}:${newConfig.port}${newConfig.path}`, 'success');
  };

  const handleCameraStatsChange = useCallback((stats: { fps: number; rssi: number; isOnline: boolean }) => {
    setTelemetry(prev => ({
      ...prev,
      cameraRssi: stats.rssi,
      cameraFps: stats.fps,
    }));
  }, []);

  const handleDemoTelemetryUpdate = useCallback((partial: Partial<TelemetryData>) => {
    setTelemetry(prev => ({ ...prev, ...partial }));
  }, []);

  // Floating Touch Joystick handler for Mobile View
  const updateMobileCommand = useCallback((x: number, y: number) => {
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));
    const roundedX = Math.round(clampedX * 100) / 100;
    const roundedY = Math.round(clampedY * 100) / 100;

    handleCommandChange({ x: roundedX, y: roundedY, speedLimit });
  }, [speedLimit]);

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
    const normY = -deltaY / maxRadius; // Invert Y
    updateMobileCommand(normX, normY);
  }, [updateMobileCommand]);

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
        updateMobileCommand(0, 0);
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
  }, [isDragging, handleJoystickMove, updateMobileCommand]);

  // Audio Stream Toggle
  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (audioState === 'playing' || audioState === 'connecting') {
      audioRef.current.pause();
      audioRef.current.src = '';
      setAudioState('off');
    } else {
      setAudioState('connecting');
      const liveAudioUrl = `http://${cameraConfig.ip}:${cameraConfig.port}${cameraConfig.audioPath}?live=${Date.now()}`;
      audioRef.current.src = liveAudioUrl;
      audioRef.current.play().then(() => {
        setAudioState('playing');
      }).catch(() => {
        setAudioState('error');
      });
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const isCollisionWarning = isOnline && telemetry.distance <= 30;
  const streamUrl = `http://${cameraConfig.ip}:${cameraConfig.port}${cameraConfig.path}`;
  const batteryPct = isOnline ? telemetry.batteryPercentage : 0;
  const batteryVolts = isOnline ? telemetry.batteryVoltage.toFixed(1) : '0.0';
  const getBatteryColor = (pct: number) => {
    if (pct >= 50) return 'bg-cyber-neonGreen text-cyber-neonGreen';
    if (pct >= 20) return 'bg-cyber-neonYellow text-cyber-neonYellow';
    return 'bg-cyber-neonRed text-cyber-neonRed animate-pulse';
  };
  const currentSpeedPct = Math.round(Math.sqrt(currentDriveCmd.x * currentDriveCmd.x + currentDriveCmd.y * currentDriveCmd.y) * speedLimit);

  // Auto request Fullscreen & Landscape lock when in FPV Mode
  useEffect(() => {
    if (isFpvMode) {
      try {
        if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
        if (window.screen?.orientation && 'lock' in window.screen.orientation) {
          // @ts-ignore
          window.screen.orientation.lock('landscape').catch(() => {});
        }
      } catch (err) {}
    }
  }, [isFpvMode]);

  // =========================================================================
  // VIEW 1: FULLSCREEN LANDSCAPE FPV COCKPIT VIEW (IMAGE 2)
  // =========================================================================
  if (isFpvMode) {
    return (
      <div className="fixed inset-0 z-50 bg-black select-none overflow-hidden flex flex-col justify-between h-[100dvh] w-[100dvw] touch-none overscroll-none">
        <audio ref={audioRef} className="hidden" />

        {/* 1. BACKGROUND SCREEN: LIVE CAMERA STREAM OR 2D DEMO GAME */}
        <div className="absolute inset-0 z-0 bg-gray-950 flex items-center justify-center cursor-crosshair">
          {isDemoMode ? (
            <CarSimulatorGame
              driveCommand={currentDriveCmd}
              onTelemetryUpdate={handleDemoTelemetryUpdate}
              isCollisionWarning={isCollisionWarning}
              isMouseSteerActive={isMouseSteerActive}
            />
          ) : !camError ? (
            <img
              src={streamUrl}
              alt="FPV Camera Feed"
              onError={() => setCamError(true)}
              style={{ transform: `rotate(${rotation}deg)` }}
              className="w-full h-full object-cover sm:object-contain transition-transform duration-300 pointer-events-none"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
              <AlertTriangle className="w-12 h-12 text-cyber-neonRed animate-bounce" />
              <h3 className="text-white font-bold text-base uppercase font-mono">Đang chờ luồng Camera FPV...</h3>
              <p className="text-xs text-gray-400 font-mono">http://{cameraConfig.ip}:{cameraConfig.port}{cameraConfig.path}</p>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCamError(false)}
                  className="px-4 py-1.5 bg-cyber-neonBlue/20 border border-cyber-neonBlue text-cyber-neonBlue rounded-xl text-xs font-mono font-bold"
                >
                  Thử lại
                </button>
                <button
                  onClick={() => setIsDemoMode(true)}
                  className="px-4 py-1.5 bg-purple-600/30 border border-purple-400 text-purple-200 rounded-xl text-xs font-mono font-bold"
                >
                  Bật Demo Mô Phỏng
                </button>
              </div>
            </div>
          )}

          {/* Reticle / Crosshair Overlay */}
          {!isDemoMode && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
              <div className="w-24 h-24 border border-cyber-neonBlue/40 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-cyber-neonBlue rounded-full"></div>
              </div>
              <div className="absolute w-40 h-[1px] bg-cyber-neonBlue/30"></div>
              <div className="absolute h-40 w-[1px] bg-cyber-neonBlue/30"></div>
            </div>
          )}

          {/* Collision Warning Overlay */}
          {isCollisionWarning && (
            <div className="absolute inset-0 bg-cyber-neonRed/20 animate-pulse pointer-events-none border-4 border-cyber-neonRed z-10 flex items-center justify-center">
              <div className="bg-black/80 px-6 py-2 rounded-2xl border border-cyber-neonRed text-cyber-neonRed font-mono font-bold text-sm uppercase tracking-widest animate-bounce">
                ⚠️ CẢNH BÁO VẬT CẢN: {telemetry.distance.toFixed(0)} CM!
              </div>
            </div>
          )}
        </div>

        {/* 2. TOP MOBILE FPV HUD BAR */}
        <div className="relative z-20 flex justify-between items-start p-2.5 sm:p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-auto">
          {/* Left Telemetry: Pin & Sóng */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Battery Status */}
            <div className="glass-panel-neon px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-white/10 flex items-center space-x-2 shadow-lg backdrop-blur-md">
              <Battery className={`w-4 h-4 ${getBatteryColor(batteryPct).split(' ')[1]}`} />
              <div>
                <div className="text-xs font-bold font-mono text-white leading-tight">
                  {batteryPct}% <span className="text-[10px] text-gray-400">({batteryVolts}V)</span>
                </div>
                <div className="w-12 sm:w-14 h-1 bg-black/60 rounded-full overflow-hidden mt-0.5 border border-white/10">
                  <div
                    style={{ width: `${batteryPct}%` }}
                    className={`h-full rounded-full ${getBatteryColor(batteryPct).split(' ')[0]}`}
                  ></div>
                </div>
              </div>
            </div>

            {/* RSSI Signal Status */}
            <div className="glass-panel-neon px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-white/10 flex items-center space-x-2 shadow-lg backdrop-blur-md">
              <Wifi className={`w-4 h-4 ${isOnline ? 'text-cyber-neonGreen' : 'text-cyber-neonRed'}`} />
              <div className="font-mono">
                <div className="text-xs font-bold text-white leading-tight">
                  {isOnline ? `${telemetry.rssi} dBm` : 'OFFLINE'}
                </div>
                <div className="text-[9px] text-cyber-neonBlue leading-none">
                  {isDemoMode ? '🎮 DEMO GAME' : `CAM: ${realCameraRssi > -100 ? `${realCameraRssi} dBm (${realFps} FPS)` : 'OFF'}`}
                </div>
              </div>
            </div>
          </div>

          {/* Right Top Controls */}
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            {/* Switch to Desktop PC Dashboard View button */}
            <button
              onClick={() => setIsFpvMode(false)}
              className="px-2 py-1 rounded-xl text-[10px] font-mono font-bold bg-white/10 border border-white/20 text-gray-300 hover:text-white flex items-center space-x-1 backdrop-blur-md"
              title="Quay lại Giao diện Web PC Đầy Đủ"
            >
              <Monitor className="w-3.5 h-3.5 text-cyber-neonBlue" />
              <span className="hidden sm:inline">Giao diện PC</span>
            </button>
            {/* Mouse Steering Status Badge (Key 1) */}
            <button
              onClick={() => {
                setIsMouseSteerActive(prev => {
                  const nextState = !prev;
                  if (!nextState) handleCommandChange({ x: 0, y: 0, speedLimit });
                  return nextState;
                });
              }}
              className={`px-2 py-1 rounded-xl text-[10px] font-mono font-bold border transition-all flex items-center space-x-1 backdrop-blur-md ${
                isMouseSteerActive
                  ? 'bg-cyber-neonGreen/20 border-cyber-neonGreen text-cyber-neonGreen shadow-[0_0_10px_rgba(57,255,20,0.3)]'
                  : 'bg-black/60 border-white/10 text-gray-400'
              }`}
              title="Bấm hoặc nhấn Phím 1 để Bật/Tắt chế độ lái hướng bằng di chuyển chuột"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isMouseSteerActive ? 'bg-cyber-neonGreen animate-ping' : 'bg-gray-500'}`}></span>
              <span>LÁI CHUỘT [PHÍM 1]: {isMouseSteerActive ? 'BẬT' : 'TẮT'}</span>
            </button>

            {/* DEMO Game Switcher Button */}
            <button
              onClick={() => setIsDemoMode(!isDemoMode)}
              className={`px-2.5 py-1 rounded-xl text-[10px] sm:text-xs font-mono font-bold border transition-all flex items-center space-x-1 backdrop-blur-md ${
                isDemoMode
                  ? 'bg-purple-600/40 border-purple-400 text-purple-200 shadow-[0_0_15px_rgba(168,85,247,0.5)] animate-pulse'
                  : 'bg-black/60 border-purple-500/40 text-purple-300 hover:bg-purple-900/40'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5 text-purple-300" />
              <span>{isDemoMode ? 'THÁO DEMO' : '🎮 DEMO'}</span>
            </button>

            {/* Camera Settings Button */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-1.5 sm:p-2 rounded-xl bg-black/60 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white backdrop-blur-md transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Camera Audio Stream Toggle */}
            {!isDemoMode && (
              <button
                onClick={toggleAudio}
                className={`p-1.5 sm:p-2 rounded-xl border backdrop-blur-md transition-all ${
                  audioState === 'playing'
                    ? 'bg-cyber-neonGreen/20 border-cyber-neonGreen text-cyber-neonGreen'
                    : 'bg-black/60 border-white/10 text-gray-400 hover:text-white'
                }`}
                title="Nghe âm thanh microphone từ IP Camera"
              >
                {audioState === 'connecting' ? <Loader2 className="w-4 h-4 animate-spin text-cyber-neonBlue" /> : audioState === 'playing' ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            )}

            {/* Rotate Camera Stream Button */}
            {!isDemoMode && (
              <button
                onClick={() => setRotation(prev => ((prev + 90) % 360) as 0 | 90 | 180 | 270)}
                className="p-1.5 sm:p-2 rounded-xl bg-black/60 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white backdrop-blur-md transition-colors"
                title="Xoay hình camera 90°"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            )}

            {/* Fullscreen Button */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 sm:p-2 rounded-xl bg-black/60 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white backdrop-blur-md transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* 3. CENTER HUD SPEEDOMETER & DIRECTION BADGE */}
        <div className="relative z-20 flex justify-between items-center px-4 sm:px-6 pointer-events-none">
          <div className="glass-panel px-3 py-1.5 rounded-2xl border border-white/10 backdrop-blur-md font-mono text-[10px] text-gray-300 space-y-0.5">
            <div>K.CÁCH: <span className="text-white font-bold">{telemetry.distance.toFixed(0)} CM</span></div>
            <div>NHIỆT ĐỘ: <span className="text-cyber-neonYellow font-bold">{telemetry.temperature.toFixed(1)}°C</span></div>
          </div>

          <div className="text-center font-mono">
            <div className="text-xs font-bold tracking-widest text-cyber-neonBlue drop-shadow-[0_0_8px_rgba(0,240,255,0.8)] uppercase">
              {currentDriveCmd.y > 0.1 ? '▲ TIẾN' : currentDriveCmd.y < -0.1 ? '▼ LÙI' : currentDriveCmd.x !== 0 ? '◄► QUAY' : '● DỪNG'}
            </div>
            <div className="text-[10px] font-mono text-gray-400">{currentSpeedPct}% SPEED</div>
          </div>

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

        {/* 4. BOTTOM FLOATING TOUCH JOYSTICK OVERLAY (LEFT SIDE) */}
        <div className="relative z-30 p-3 sm:p-6 flex justify-between items-end bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none">
          {/* Left Side: Floating Touch Joystick embedded directly inside Camera/Game Screen */}
          <div className="pointer-events-auto relative mr-auto">
            <div
              ref={joystickRef}
              onMouseDown={handleJoystickStart}
              onTouchStart={handleJoystickStart}
              className={`w-36 h-36 sm:w-44 sm:h-44 rounded-full border-2 transition-all duration-300 flex items-center justify-center relative touch-none pointer-events-auto ${
                isDragging
                  ? 'border-cyber-neonGreen bg-cyber-neonGreen/20 shadow-[0_0_35px_rgba(57,255,20,0.6)] scale-105 opacity-100 backdrop-blur-md'
                  : 'border-white/10 bg-transparent shadow-none scale-95 opacity-0 hover:opacity-40'
              }`}
            >
              <div className="absolute inset-4 rounded-full border border-white/10 pointer-events-none"></div>
              <div className="absolute w-full h-[1px] bg-white/10 pointer-events-none"></div>
              <div className="absolute h-full w-[1px] bg-white/10 pointer-events-none"></div>

              <div
                style={{ transform: `translate(${joystickCoords.x}px, ${joystickCoords.y}px)` }}
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 transition-transform duration-75 flex items-center justify-center shadow-xl ${
                  isDragging
                    ? 'bg-cyber-neonGreen border-white text-black shadow-[0_0_25px_#39ff14] scale-110 opacity-100'
                    : 'bg-white/10 border-white/20 text-transparent opacity-0 shadow-none'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white/80"></div>
              </div>
            </div>
          </div>

          {/* Right Status */}
          <div className="pointer-events-auto font-mono text-[10px] text-gray-400 space-y-1 bg-black/50 p-2.5 rounded-2xl border border-white/10 backdrop-blur-md max-w-[200px] hidden sm:block">
            <div className="flex items-center space-x-1">
              <Radio className="w-3 h-3 text-cyber-neonGreen animate-pulse" />
              <span className="text-white font-bold">FPV JOYSTICK 360°</span>
            </div>
            <div>Chạm gạt trực tiếp trên hình để lái.</div>
          </div>
        </div>

        {/* Camera Settings Popup Modal */}
        {showSettingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn pointer-events-auto">
            <div className="w-full max-w-sm glass-panel p-5 rounded-2xl border border-white/10 flex flex-col space-y-3">
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <h3 className="text-white font-mono font-bold text-sm uppercase flex items-center">
                  <Settings className="w-4 h-4 mr-1.5 text-cyber-neonBlue" /> Cấu hình IP Camera
                </h3>
                <button onClick={() => setShowSettingsModal(false)} className="text-gray-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                setCameraConfig(prev => ({ ...prev, ip: tempIp, port: tempPort, path: tempPath }));
                setShowSettingsModal(false);
                setCamError(false);
              }} className="space-y-2 font-mono text-xs">
                <div>
                  <label className="text-gray-400 block mb-1">Địa chỉ IP Điện thoại:</label>
                  <input
                    type="text"
                    value={tempIp}
                    onChange={e => setTempIp(e.target.value)}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-cyber-neonBlue"
                  />
                </div>

                <div>
                  <label className="text-gray-400 block mb-1">Cổng Port:</label>
                  <input
                    type="text"
                    value={tempPort}
                    onChange={e => setTempPort(e.target.value)}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-cyber-neonBlue"
                  />
                </div>

                <div>
                  <label className="text-gray-400 block mb-1">Đường dẫn Path:</label>
                  <input
                    type="text"
                    value={tempPath}
                    onChange={e => setTempPath(e.target.value)}
                    className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-cyber-neonBlue"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    className="px-3 py-1.5 bg-white/5 text-gray-300 rounded-xl font-bold"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-cyber-neonBlue text-black rounded-xl font-bold"
                  >
                    Lưu cấu hình
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <QRCodeModal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} />
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: DESKTOP WEB VIEW (FULL DESKTOP COCKPIT DASHBOARD WITH ALL PANELS)
  // =========================================================================
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
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Camera and Control Panel */}
        <section className="lg:col-span-8 space-y-4">
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
          />

          {/* Controls HUD Component */}
          <JoystickControl
            onCommandChange={handleCommandChange}
            speedLimit={speedLimit}
            setSpeedLimit={setSpeedLimit}
          />
        </section>

        {/* Right Column: Telemetry Gauges & System Terminal Logs */}
        <section className="lg:col-span-4 flex flex-col gap-4 h-full">
          {/* Telemetry data readings panel */}
          <TelemetryPanel data={telemetry} isOnline={isOnline} />

          {/* Full System Terminal Logs Panel for PC */}
          <div className="flex-1 glass-panel rounded-xl p-4 flex flex-col justify-between border border-white/5 shadow-md min-h-[220px] lg:min-h-0">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs uppercase font-bold text-cyber-neonBlue tracking-wider flex items-center">
                <Terminal className="w-4 h-4 mr-1.5 text-cyber-neonBlue" /> Nhật ký hệ thống
              </span>
              <button
                onClick={() => setLogs([])}
                className="text-[9px] uppercase tracking-wider text-gray-500 hover:text-white transition-colors"
              >
                Xóa nhật ký
              </button>
            </div>

            {/* Logs display container */}
            <div className="flex-1 bg-black/60 rounded-lg p-2.5 font-mono text-[10px] overflow-y-auto max-h-[260px] flex flex-col-reverse gap-1 border border-white/5 no-scrollbar">
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

            <div className="flex items-center space-x-1.5 text-[9px] text-gray-500 font-mono mt-2 pt-1 border-t border-white/[0.04]">
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
}
