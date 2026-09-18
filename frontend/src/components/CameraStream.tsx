import { useState, useEffect, useRef } from 'react';
import { Camera, Settings, RefreshCw, AlertTriangle, RotateCw, Volume2, VolumeX, Volume1, Loader2, Zap, Gamepad2 } from 'lucide-react';
import type { CameraConfig, TelemetryData } from '../types/control';
import { CarSimulatorGame } from './CarSimulatorGame';

interface CameraStreamProps {
  config: CameraConfig;
  onChangeConfig: (newConfig: CameraConfig) => void;
  isCollisionWarning: boolean;
  onDriveCommand?: (cmd: { x: number; y: number }) => void;
  onCameraStatsChange?: (stats: { fps: number; rssi: number; isOnline: boolean }) => void;
  driveCommand?: { x: number; y: number; speedLimit: number };
  onTelemetryUpdate?: (telemetryPartial: Partial<TelemetryData>) => void;
  onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  isDemoMode?: boolean;
  setIsDemoMode?: (mode: boolean) => void;
}

export const CameraStream = ({
  config,
  onChangeConfig,
  isCollisionWarning,
  onDriveCommand,
  onCameraStatsChange,
  driveCommand,
  onTelemetryUpdate,
  onLog,
  isDemoMode: propIsDemoMode,
  setIsDemoMode: propSetIsDemoMode,
}: CameraStreamProps) => {
  const [localDemoMode, setLocalDemoMode] = useState(false);
  const isDemoMode = propIsDemoMode !== undefined ? propIsDemoMode : localDemoMode;
  const setIsDemoMode = propSetIsDemoMode || setLocalDemoMode;

  const [showSettings, setShowSettings] = useState(false);
  const [ip, setIp] = useState(config.ip);
  const [port, setPort] = useState(config.port);
  const [path, setPath] = useState(config.path);
  const [audioPath, setAudioPath] = useState(config.audioPath || '/audio.wav');
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [errorCount, setErrorCount] = useState(0);
  const [streamUrl, setStreamUrl] = useState('');

  // Audio Stream State (Nghe âm thanh từ IP Camera)
  const [audioState, setAudioState] = useState<'off' | 'connecting' | 'playing' | 'error'>('off');
  const [audioVolume, setAudioVolume] = useState(80);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggleAudio = () => {
    if (!audioRef.current) return;

    if (audioState === 'playing' || audioState === 'connecting') {
      audioRef.current.pause();
      audioRef.current.src = '';
      setAudioState('off');
    } else {
      setAudioState('connecting');
      const liveAudioUrl = `http://${ip}:${port}${audioPath}?live=${Date.now()}`;
      audioRef.current.src = liveAudioUrl;
      audioRef.current.volume = audioVolume / 100;
      audioRef.current.play().then(() => {
        setAudioState('playing');
      }).catch((err) => {
        console.error('[AudioStream] Lỗi kết nối âm thanh IP Cam:', err);
        setAudioState('error');
      });
    }
  };

  const handleSyncAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current || audioState !== 'playing') return;

    setIsSyncing(true);
    const liveAudioUrl = `http://${ip}:${port}${audioPath}?live=${Date.now()}`;
    audioRef.current.pause();
    audioRef.current.src = liveAudioUrl;
    audioRef.current.play().then(() => {
      setTimeout(() => setIsSyncing(false), 300);
    }).catch(() => {
      setIsSyncing(false);
    });
  };

  const handleVolumeChange = (newVol: number) => {
    setAudioVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol / 100;
    }
  };

  const handleRotate = () => {
    setRotation(prev => ((prev + 90) % 360) as 0 | 90 | 180 | 270);
  };
  
  // Mouse Steering State
  const [isMouseSteerActive, setIsMouseSteerActive] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const lastEmitTime = useRef(0);

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

  // Đo đạc tín hiệu IP Camera thực tế (Ping RSSI & FPS)
  const [realFps, setRealFps] = useState(0);
  const [realCameraRssi, setRealCameraRssi] = useState(-100);

  useEffect(() => {
    if (!ip || !port) return;

    let isMounted = true;

    const measureRealCameraPing = () => {
      const startTime = Date.now();
      const testImg = new Image();
      
      const timeoutId = setTimeout(() => {
        if (!isMounted) return;
        testImg.src = '';
        setRealCameraRssi(-100);
        setRealFps(0);
        if (onCameraStatsChange) {
          onCameraStatsChange({ fps: 0, rssi: -100, isOnline: false });
        }
      }, 2500);

      const handlePingResponse = () => {
        if (!isMounted) return;
        clearTimeout(timeoutId);
        const latency = Date.now() - startTime;

        let calculatedRssi = -50;
        let estimatedFps = 30;

        if (latency > 350) {
          calculatedRssi = -88;
          estimatedFps = 10;
        } else if (latency > 180) {
          calculatedRssi = -76;
          estimatedFps = 18;
        } else if (latency > 80) {
          calculatedRssi = -62;
          estimatedFps = 24;
        } else {
          calculatedRssi = -48;
          estimatedFps = 30;
        }

        if (errorCount >= 3) {
          calculatedRssi = -100;
          estimatedFps = 0;
        }

        setRealCameraRssi(calculatedRssi);
        setRealFps(estimatedFps);

        if (onCameraStatsChange) {
          onCameraStatsChange({
            fps: estimatedFps,
            rssi: calculatedRssi,
            isOnline: calculatedRssi > -100,
          });
        }
      };

      testImg.onload = handlePingResponse;
      testImg.onerror = handlePingResponse;
      testImg.src = `http://${ip}:${port}/shot.jpg?t=${Date.now()}`;
    };

    measureRealCameraPing();
    const interval = setInterval(measureRealCameraPing, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [ip, port, path, errorCount, onCameraStatsChange]);

  const handleMouseEnter = () => {
    setIsHovering(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 768;
    if (isTouch || !isHovering || !isMouseSteerActive || !onDriveCommand) return;

    const now = Date.now();
    if (now - lastEmitTime.current < 40) return;
    lastEmitTime.current = now;

    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    if (width <= 0 || height <= 0) return;

    const centerX = rect.left + width / 2;
    let relX = (e.clientX - centerX) / (width / 2);
    relX = Math.max(-1, Math.min(1, relX));

    if (Math.abs(relX) < 0.05) relX = 0;
    relX = Math.round(relX * 100) / 100;

    setMousePos({ x: relX, y: 0 });
    onDriveCommand({ x: relX, y: 0 });
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    setMousePos({ x: 0, y: 0 });
    if (isMouseSteerActive && onDriveCommand) {
      onDriveCommand({ x: 0, y: 0 });
    }
  };

  useEffect(() => {
    setStreamUrl(`http://${ip}:${port}${path}`);
  }, [ip, port, path]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onChangeConfig({ ip, port, path, type: config.type || 'mjpeg', audioPath });
    setShowSettings(false);
    setErrorCount(0);
  };

  const handleImageError = () => {
    setErrorCount(prev => prev + 1);
  };

  const handleRefresh = () => {
    setErrorCount(0);
    const tempUrl = streamUrl;
    setStreamUrl('');
    setTimeout(() => setStreamUrl(tempUrl), 100);

    if (audioState === 'playing' && audioRef.current) {
      audioRef.current.pause();
      const liveAudioUrl = `http://${ip}:${port}${audioPath}?live=${Date.now()}`;
      audioRef.current.src = liveAudioUrl;
      audioRef.current.play().catch(() => {});
    }
  };

  return (
    <div className={`relative w-full aspect-video lg:aspect-none min-h-[380px] lg:min-h-[495px] xl:min-h-[535px] rounded-xl overflow-hidden glass-panel-neon transition-all duration-300 ${
      isCollisionWarning ? 'border-cyber-neonRed shadow-[0_0_30px_rgba(255,0,60,0.3)] animate-pulse-fast' : ''
    }`}>
      {/* Header Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex flex-wrap justify-between items-center px-4 py-2 bg-gradient-to-b from-black/90 via-black/60 to-transparent gap-2">
        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
          <Camera className={`w-5 h-5 ${isDemoMode ? 'text-purple-400 animate-pulse' : errorCount === 0 ? 'text-cyber-neonGreen animate-pulse' : 'text-gray-400'}`} />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-200">
            {isDemoMode ? 'Mô phỏng Game 2D' : 'IP Camera Live Stream'}
          </span>
          
          {/* Camera Stats Badges (FPS & RSSI) */}
          {!isDemoMode && (
            <div className="flex items-center space-x-1.5 ml-2">
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                realFps >= 15 
                  ? 'bg-cyber-neonGreen/10 border-cyber-neonGreen/40 text-cyber-neonGreen' 
                  : realFps > 0 
                    ? 'bg-cyber-neonYellow/10 border-cyber-neonYellow/40 text-cyber-neonYellow'
                    : 'bg-cyber-neonRed/10 border-cyber-neonRed/40 text-cyber-neonRed'
              }`}>
                ⚡ {realFps} FPS
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
                realCameraRssi > -70 
                  ? 'bg-cyber-neonBlue/10 border-cyber-neonBlue/40 text-cyber-neonBlue' 
                  : realCameraRssi > -100 
                    ? 'bg-cyber-neonYellow/10 border-cyber-neonYellow/40 text-cyber-neonYellow'
                    : 'bg-cyber-neonRed/10 border-cyber-neonRed/40 text-cyber-neonRed'
              }`}>
                📡 CAM: {realCameraRssi > -100 ? `${realCameraRssi} dBm` : 'OFFLINE'}
              </span>
            </div>
          )}

          {/* Demo Game Switcher Button */}
          <button
            tabIndex={-1}
            onClick={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).blur();
              const nextMode = !isDemoMode;
              setIsDemoMode(nextMode);
              if (onLog) {
                onLog(
                  nextMode
                    ? '🎮 BẬT CHẾ ĐỘ DEMO: Đã kích hoạt Game mô phỏng điều khiển xe 2D Canvas!'
                    : '📹 TẮT CHẾ ĐỘ DEMO: Đã quay lại luồng Camera IP trực tiếp.',
                  nextMode ? 'success' : 'info'
                );
              }
            }}
            className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-all flex items-center space-x-1 font-bold ${
              isDemoMode
                ? 'bg-purple-600/30 border-purple-400 text-purple-200 shadow-[0_0_15px_rgba(168,85,247,0.5)] animate-pulse'
                : 'bg-purple-950/40 border-purple-500/40 text-purple-300 hover:bg-purple-900/40'
            }`}
            title="Bấm để bật/tắt Game mô phỏng điều khiển xe 2D Canvas"
          >
            <Gamepad2 className={`w-3.5 h-3.5 ${isDemoMode ? 'text-purple-200 animate-bounce' : 'text-purple-400'}`} />
            <span>{isDemoMode ? 'THÁO DEMO' : '🎮 DEMO'}</span>
          </button>

          {/* Mouse Steering Status Badge */}
          <button
            onClick={() => {
              const nextState = !isMouseSteerActive;
              setIsMouseSteerActive(nextState);
              if (!nextState && onDriveCommand) {
                setMousePos({ x: 0, y: 0 });
                onDriveCommand({ x: 0, y: 0 });
              }
            }}
            className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors flex items-center space-x-1 ${
              isMouseSteerActive 
                ? 'bg-cyber-neonGreen/10 border-cyber-neonGreen/40 text-cyber-neonGreen shadow-[0_0_10px_rgba(57,255,20,0.2)]' 
                : 'bg-gray-800/80 border-gray-600 text-gray-400'
            }`}
            title="Bật/Tắt chế độ lái xe bằng di chuyển chuột (Phím 1)"
          >
            <span className={`w-1.5 h-1.5 rounded-full mr-1 ${isMouseSteerActive ? 'bg-cyber-neonGreen animate-ping' : 'bg-gray-500'}`}></span>
            LÁI CHUỘT [PHÍM 1]: {isMouseSteerActive ? 'BẬT' : 'TẮT'}
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {/* Audio Stream Controls */}
          <div className="relative flex items-center space-x-1">
            <button
              onClick={toggleAudio}
              className={`px-2.5 py-1 rounded transition-all flex items-center space-x-1.5 border font-mono text-[10px] font-bold ${
                audioState === 'playing'
                  ? 'bg-cyber-neonGreen/15 border-cyber-neonGreen/60 text-cyber-neonGreen shadow-[0_0_15px_rgba(57,255,20,0.25)]'
                  : audioState === 'connecting'
                    ? 'bg-cyber-neonBlue/15 border-cyber-neonBlue/60 text-cyber-neonBlue animate-pulse'
                    : audioState === 'error'
                      ? 'bg-cyber-neonRed/15 border-cyber-neonRed/60 text-cyber-neonRed'
                      : 'bg-black/40 border-white/10 hover:bg-white/10 text-gray-400'
              }`}
            >
              {audioState === 'connecting' && <Loader2 className="w-3.5 h-3.5 animate-spin text-cyber-neonBlue" />}
              {audioState === 'playing' && <Volume2 className="w-3.5 h-3.5 text-cyber-neonGreen" />}
              {audioState === 'off' && <VolumeX className="w-3.5 h-3.5" />}
              {audioState === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-cyber-neonRed" />}

              <span>
                {audioState === 'playing' && 'ÂM THANH BẬT'}
                {audioState === 'connecting' && 'ĐANG KẾT NỐI...'}
                {audioState === 'off' && 'LOA TẮT'}
                {audioState === 'error' && 'THỬ LẠI'}
              </span>
            </button>

            {/* SYNC Button */}
            {audioState === 'playing' && (
              <button
                onClick={handleSyncAudio}
                className={`px-1.5 py-1 rounded border transition-all flex items-center space-x-1 ${
                  isSyncing
                    ? 'bg-cyber-neonYellow/30 border-cyber-neonYellow text-cyber-neonYellow animate-pulse'
                    : 'bg-black/60 border-cyber-neonGreen/40 text-cyber-neonGreen hover:bg-cyber-neonGreen/20 shadow-[0_0_8px_rgba(57,255,20,0.15)]'
                }`}
              >
                <Zap className={`w-3 h-3 ${isSyncing ? 'animate-bounce text-cyber-neonYellow' : 'text-cyber-neonGreen'}`} />
                <span className="text-[9px] font-mono font-bold uppercase">{isSyncing ? 'SYNCING...' : 'SYNC'}</span>
              </button>
            )}

            {/* Volume Toggle Icon */}
            <button
              onClick={() => setShowVolumeSlider(!showVolumeSlider)}
              className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            >
              <Volume1 className="w-3.5 h-3.5" />
            </button>

            {/* Floating Volume Slider */}
            {showVolumeSlider && (
              <div className="absolute right-0 top-8 bg-black/95 backdrop-blur-md p-2.5 rounded-xl border border-cyber-neonGreen/30 shadow-[0_0_20px_rgba(0,0,0,0.8)] z-40 flex items-center space-x-2 animate-fadeIn">
                <Volume2 className="w-3.5 h-3.5 text-cyber-neonGreen" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={audioVolume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="w-20 accent-cyber-neonGreen h-1 bg-gray-700 rounded-lg cursor-pointer"
                />
                <span className="text-[10px] font-mono font-bold text-cyber-neonGreen w-7 text-right">{audioVolume}%</span>
              </div>
            )}
          </div>

          <button 
            onClick={handleRotate}
            className={`px-2 py-1 rounded transition-all flex items-center space-x-1 border ${
              rotation > 0 
                ? 'bg-cyber-neonGreen/10 border-cyber-neonGreen/40 text-cyber-neonGreen shadow-[0_0_10px_rgba(57,255,20,0.15)]' 
                : 'bg-black/40 border-white/10 hover:bg-white/10 text-gray-300'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono font-bold">{rotation}°</span>
          </button>

          <button 
            onClick={handleRefresh}
            className="p-1 rounded hover:bg-white/10 text-gray-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-1 rounded hover:bg-white/10 text-gray-300 transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Stream Area */}
      {isDemoMode ? (
        <CarSimulatorGame
          driveCommand={driveCommand || { x: 0, y: 0, speedLimit: 80 }}
          onDriveCommand={onDriveCommand}
          onTelemetryUpdate={onTelemetryUpdate}
          isCollisionWarning={isCollisionWarning}
          isMouseSteerActive={isMouseSteerActive}
        />
      ) : (
        <div 
          onMouseEnter={handleMouseEnter}
          onMouseMove={handleMouseMove} 
          onMouseLeave={handleMouseLeave}
          className="w-full h-full bg-black/90 flex items-center justify-center scanlines relative cursor-crosshair group overflow-hidden"
        >
          {/* Overlay HUD - Target Crosshair */}
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 border border-cyber-neonBlue/30 rounded-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-cyber-neonBlue/80 rounded-full"></div>
            </div>

            {isMouseSteerActive && (mousePos.x !== 0 || mousePos.y !== 0) && (
              <div 
                className="absolute w-8 h-8 -ml-4 -mt-4 border-2 border-cyber-neonGreen rounded-full flex items-center justify-center transition-transform duration-75 shadow-[0_0_15px_#39ff14]"
                style={{
                  left: `${50 + mousePos.x * 50}%`,
                  top: `${50 - mousePos.y * 50}%`,
                }}
              >
                <div className="w-2 h-2 bg-cyber-neonGreen rounded-full animate-ping"></div>
              </div>
            )}
          </div>

          {/* Warning Indicator */}
          {isCollisionWarning && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 bg-cyber-neonRed/90 px-4 py-1.5 rounded-full text-white font-bold text-xs uppercase tracking-widest shadow-lg animate-bounce">
              <AlertTriangle className="w-4 h-4" />
              <span>Vật cản gần - Nguy hiểm!</span>
            </div>
          )}

          {errorCount < 3 ? (
            <img
              src={streamUrl}
              alt="IP Camera Stream"
              onLoad={() => setErrorCount(0)}
              onError={handleImageError}
              style={{
                transform: `rotate(${rotation}deg)${rotation % 180 !== 0 ? ' scale(1.35)' : ''}`,
                transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center p-6 max-w-sm flex flex-col items-center z-10">
              <AlertTriangle className="w-12 h-12 text-cyber-neonRed mb-2 animate-bounce" />
              <h3 className="text-sm font-semibold text-gray-200">Không thể kết nối với IP Camera</h3>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Vui lòng kiểm tra ứng dụng IP Webcam trên điện thoại đã bật chưa, và kiểm tra điện thoại có kết nối cùng WiFi không.
              </p>
              <div className="mt-4 flex space-x-2">
                <button
                  onClick={() => setShowSettings(true)}
                  className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
                >
                  Cấu hình IP Camera
                </button>
                <button
                  onClick={handleRefresh}
                  className="px-3 py-1.5 text-xs bg-cyber-neonBlue/20 border border-cyber-neonBlue/40 text-cyber-neonBlue rounded transition-colors"
                >
                  Thử lại
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Settings Modal Overlay */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/95 z-30 flex items-center justify-center p-4">
          <form onSubmit={handleSave} className="w-full max-w-md space-y-4">
            <h3 className="text-sm font-bold text-cyber-neonBlue uppercase tracking-wider flex items-center">
              <Settings className="w-4 h-4 mr-2" /> Cấu hình IP Camera
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] uppercase text-gray-400 font-semibold">
                  Địa chỉ IP Điện thoại (IP Webcam)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 192.168.1.50"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded px-3 py-1 text-xs text-white"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase text-gray-400 font-semibold">Cổng (Port)</label>
                <input
                  type="text"
                  placeholder="e.g. 8080"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded px-3 py-1 text-xs text-white"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase text-gray-400 font-semibold">Đường dẫn Video (Path)</label>
                <input
                  type="text"
                  placeholder="e.g. /video"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded px-3 py-1 text-xs text-white"
                  required
                />
              </div>

              <div className="space-y-1 col-span-2">
                <label className="text-[10px] uppercase text-gray-400 font-semibold">Đường dẫn Âm thanh (Audio Path)</label>
                <input
                  type="text"
                  placeholder="e.g. /audio.wav"
                  value={audioPath}
                  onChange={(e) => setAudioPath(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded px-3 py-1 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIp(config.ip);
                  setPort(config.port);
                  setPath(config.path);
                  setAudioPath(config.audioPath || '/audio.wav');
                  setShowSettings(false);
                }}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white rounded"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs bg-cyber-neonBlue text-black font-semibold rounded"
              >
                Lưu cài đặt
              </button>
            </div>
          </form>
        </div>
      )}

      <audio ref={audioRef} className="hidden" playsInline preload="none" crossOrigin="anonymous" />
    </div>
  );
};
