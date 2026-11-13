import { useState, useEffect, useRef } from 'react';
import { Camera, Settings, RefreshCw, AlertTriangle, RotateCw, Volume2, VolumeX, Volume1, Loader2, Zap, Gamepad2, Bot, Activity, Sliders, ChevronDown } from 'lucide-react';
import type { CameraConfig, TelemetryData } from '../types/control';
import { CarSimulatorGame } from './CarSimulatorGame';
import { useVisionWebSocket } from '../hooks/useVisionWebSocket';
import { DetectionOverlay } from './DetectionOverlay';

interface CameraStreamProps {
  config: CameraConfig;
  onChangeConfig: (newConfig: CameraConfig) => void;
  isCollisionWarning: boolean;
  onCameraStatsChange?: (stats: { fps: number; rssi: number; isOnline: boolean }) => void;
  driveCommand?: { x: number; y: number; speedLimit: number };
  onTelemetryUpdate?: (telemetryPartial: Partial<TelemetryData>) => void;
  onLog?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  isDemoMode?: boolean;
  setIsDemoMode?: (mode: boolean) => void;
  externalFps?: number;
  externalRssi?: number;
}

export const CameraStream = ({
  config,
  onChangeConfig,
  isCollisionWarning,
  onCameraStatsChange,
  driveCommand,
  onTelemetryUpdate,
  onLog,
  isDemoMode: propIsDemoMode,
  setIsDemoMode: propSetIsDemoMode,
  externalFps,
  externalRssi,
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

  // Python AI Vision State (YOLOv8 + OpenCV qua WebSocket port 8000)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const {
    isEnabled: isVisionEnabled,
    setIsEnabled: setIsVisionEnabled,
    isConnected: isVisionConnected,
    frameSize,
    detections,
    lane,
    collision,
    inferenceMs,
    timings,
    quality,
    stabilizer,
    freespace,
    flow,
    fusionMode,
  } = useVisionWebSocket();

  // Phase 1 & 2: CV Telemetry & Config Control
  const [showCvTelemetry, setShowCvTelemetry] = useState(true);
  const [showCvControls, setShowCvControls] = useState(false);
  const [cvFlags, setCvFlags] = useState({
    ENABLE_PREPROCESS: false,
    ENABLE_BLUR_FILTER: true,
    ENABLE_STABILIZER: false,
    LANE_THRESHOLD_MODE: 'auto',
    ENABLE_FREESPACE: false,
    ENABLE_FLOW: false,
    FUSION_MODE: 'yolo_only',
  });

  const handleToggleCvFlag = async (key: string, value: any) => {
    const updated = { ...cvFlags, [key]: value };
    setCvFlags(updated);
    try {
      const visionHost = typeof window !== 'undefined' ? `${window.location.hostname}:8000` : 'localhost:8000';
      await fetch(`http://${visionHost}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { [key]: value } }),
      });
      if (onLog) {
        onLog(`[CV Phase 1] Đã đổi ${key} = ${value}`, 'info');
      }
    } catch (err) {
      console.error('Lỗi cập nhật CV config:', err);
    }
  };

  // ResizeObserver cập nhật kích thước container để scale bounding box
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

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
    setRotation(prev => {
      const next = ((prev + 90) % 360) as 0 | 90 | 180 | 270;
      // Đồng bộ góc xoay camera sang Python Vision Server để YOLO & Lane & Freespace nhìn đúng chiều
      const visionHost = typeof window !== 'undefined' ? `${window.location.hostname}:8000` : 'localhost:8000';
      fetch(`http://${visionHost}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { ROTATION: next } }),
      }).catch(() => {});
      return next;
    });
  };

  // Đo đạc tín hiệu IP Camera thực tế (Ping RSSI & FPS)
  const [internalFps, setInternalFps] = useState(0);
  const [internalCameraRssi, setInternalCameraRssi] = useState(-100);

  const realFps = externalFps !== undefined ? externalFps : internalFps;
  const realCameraRssi = externalRssi !== undefined ? externalRssi : internalCameraRssi;

  useEffect(() => {
    // Nếu đã có FPS & RSSI đo từ hook useCameraPing ở cấp App, không chạy trùng lặp interval để giảm tải mạng
    if (externalFps !== undefined && externalRssi !== undefined) return;
    if (!ip || !port) return;

    let isMounted = true;

    const measureRealCameraPing = () => {
      const startTime = Date.now();
      const testImg = new Image();

      const timeoutId = setTimeout(() => {
        if (!isMounted) return;
        testImg.src = '';
        setInternalCameraRssi(-100);
        setInternalFps(0);
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

        setInternalCameraRssi(calculatedRssi);
        setInternalFps(estimatedFps);

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
  }, [ip, port, path, errorCount, onCameraStatsChange, externalFps, externalRssi]);



  useEffect(() => {
    setStreamUrl(`http://${ip}:${port}${path}`);
  }, [ip, port, path]);

  // Đồng bộ camera URL sang Python khi khởi động (nếu IP hợp lệ)
  useEffect(() => {
    if (!ip || ip.split('.').length < 4) return;
    const fullCameraUrl = `http://${ip}:${port}${path}`;
    const visionHost = typeof window !== 'undefined' ? `${window.location.hostname}:8000` : 'localhost:8000';
    fetch(`http://${visionHost}/api/set_camera_url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ camera_url: fullCameraUrl }),
    }).catch(() => {});
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onChangeConfig({ ip, port, path, type: config.type || 'mjpeg', audioPath });
    setShowSettings(false);
    setErrorCount(0);

    // Đồng bộ camera URL sang Python Vision Server chỉ khi người dùng bấm LƯU
    const fullCameraUrl = `http://${ip}:${port}${path}`;
    const visionHost = typeof window !== 'undefined' ? `${window.location.hostname}:8000` : 'localhost:8000';
    fetch(`http://${visionHost}/api/set_camera_url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ camera_url: fullCameraUrl }),
    }).catch(() => {});
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
      audioRef.current.play().catch(() => { });
    }
  };

  return (
    <div className={`relative w-full aspect-video lg:aspect-none min-h-[380px] lg:min-h-[495px] xl:min-h-[535px] rounded-xl overflow-hidden glass-panel-neon transition-all duration-300 ${isCollisionWarning ? 'border-cyber-neonRed shadow-[0_0_30px_rgba(255,0,60,0.3)] animate-pulse-fast' : ''
      }`}>
      {/* Header Bar - Khóa cứng 1 dòng duy nhất, không cuộn, menu thả xuống tự nhiên */}
      <div className="absolute top-0 left-0 right-0 z-20 h-10 flex items-center justify-between px-3 bg-gradient-to-b from-black/95 via-black/80 to-transparent gap-2 select-none whitespace-nowrap overflow-visible">
        {/* Left: Camera Name & Ping Stats */}
        <div className="flex items-center space-x-1.5 shrink-0">
          <Camera className={`w-4 h-4 shrink-0 ${isDemoMode ? 'text-purple-400 animate-pulse' : errorCount === 0 ? 'text-cyber-neonGreen animate-pulse' : 'text-gray-400'}`} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-200 shrink-0 hidden md:inline">
            {isDemoMode ? 'DEMO 2D' : 'IP CAM'}
          </span>

          {/* Camera Stats Badges (FPS & RSSI - Khóa cứng độ rộng) */}
          {!isDemoMode && (
            <div className="flex items-center space-x-1 shrink-0">
              <span className={`text-[9px] font-mono w-[54px] text-center py-0.5 rounded border font-bold shrink-0 ${
                realFps >= 15
                  ? 'bg-cyber-neonGreen/10 border-cyber-neonGreen/40 text-cyber-neonGreen'
                  : realFps > 0
                    ? 'bg-cyber-neonYellow/10 border-cyber-neonYellow/40 text-cyber-neonYellow'
                    : 'bg-cyber-neonRed/10 border-cyber-neonRed/40 text-cyber-neonRed'
              }`}>
                ⚡ {realFps} FPS
              </span>
              <span className={`text-[9px] font-mono w-[76px] text-center py-0.5 rounded border font-bold shrink-0 ${
                realCameraRssi > -70
                  ? 'bg-cyber-neonBlue/10 border-cyber-neonBlue/40 text-cyber-neonBlue'
                  : realCameraRssi > -100
                    ? 'bg-cyber-neonYellow/10 border-cyber-neonYellow/40 text-cyber-neonYellow'
                    : 'bg-cyber-neonRed/10 border-cyber-neonRed/40 text-cyber-neonRed'
              }`}>
                {realCameraRssi > -100 ? `📡 ${realCameraRssi}dBm` : 'OFFLINE'}
              </span>
            </div>
          )}
        </div>

        {/* Right: Camera Tools & AI Controls - Khóa cứng trên 1 hàng */}
        <div className="flex items-center space-x-1 shrink-0">
          {/* Audio Stream Button */}
          <div className="relative flex items-center space-x-0.5 shrink-0">
            <button
              onClick={toggleAudio}
              className={`px-1.5 py-0.5 rounded transition-all flex items-center space-x-1 border font-mono text-[9px] font-bold shrink-0 w-[56px] justify-center ${
                audioState === 'playing'
                  ? 'bg-cyber-neonGreen/15 border-cyber-neonGreen/60 text-cyber-neonGreen shadow-[0_0_12px_rgba(57,255,20,0.25)]'
                  : audioState === 'connecting'
                    ? 'bg-cyber-neonBlue/15 border-cyber-neonBlue/60 text-cyber-neonBlue animate-pulse'
                    : audioState === 'error'
                      ? 'bg-cyber-neonRed/15 border-cyber-neonRed/60 text-cyber-neonRed'
                      : 'bg-black/40 border-white/10 hover:bg-white/10 text-gray-400'
              }`}
              title={audioState === 'playing' ? 'Đang bật âm thanh (Bấm để tắt)' : 'Bấm để bật âm thanh từ camera'}
            >
              {audioState === 'connecting' && <Loader2 className="w-3 h-3 animate-spin text-cyber-neonBlue shrink-0" />}
              {audioState === 'playing' && <Volume2 className="w-3 h-3 text-cyber-neonGreen shrink-0" />}
              {audioState === 'off' && <VolumeX className="w-3 h-3 shrink-0" />}
              {audioState === 'error' && <AlertTriangle className="w-3 h-3 text-cyber-neonRed shrink-0" />}
              <span>{audioState === 'playing' ? 'LOA' : audioState === 'connecting' ? '...' : 'LOA'}</span>
            </button>

            {/* SYNC Button (Khi bật âm thanh) */}
            {audioState === 'playing' && (
              <button
                onClick={handleSyncAudio}
                className={`px-1 py-0.5 rounded border transition-all flex items-center space-x-0.5 shrink-0 ${
                  isSyncing
                    ? 'bg-cyber-neonYellow/30 border-cyber-neonYellow text-cyber-neonYellow animate-pulse'
                    : 'bg-black/60 border-cyber-neonGreen/40 text-cyber-neonGreen hover:bg-cyber-neonGreen/20 shadow-[0_0_8px_rgba(57,255,20,0.15)]'
                }`}
                title="Đồng bộ âm thanh chống trễ"
              >
                <Zap className={`w-2.5 h-2.5 ${isSyncing ? 'animate-bounce text-cyber-neonYellow' : 'text-cyber-neonGreen'}`} />
                <span className="text-[8px] font-mono font-bold uppercase">SYNC</span>
              </button>
            )}

            {/* Volume Toggle Icon */}
            <button
              onClick={() => setShowVolumeSlider(!showVolumeSlider)}
              className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors shrink-0"
              title="Chỉnh âm lượng"
            >
              <Volume1 className="w-3.5 h-3.5" />
            </button>

            {/* Floating Volume Slider */}
            {showVolumeSlider && (
              <div className="absolute right-0 top-8 bg-black/95 backdrop-blur-md p-2 rounded-xl border border-cyber-neonGreen/30 shadow-[0_0_20px_rgba(0,0,0,0.8)] z-40 flex items-center space-x-2 animate-fadeIn">
                <Volume2 className="w-3.5 h-3.5 text-cyber-neonGreen shrink-0" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={audioVolume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="w-16 accent-cyber-neonGreen h-1 bg-gray-700 rounded-lg cursor-pointer"
                />
                <span className="text-[9px] font-mono font-bold text-cyber-neonGreen w-6 text-right">{audioVolume}%</span>
              </div>
            )}
          </div>

          {/* Xoay Camera */}
          <button
            onClick={handleRotate}
            className={`px-1.5 py-0.5 rounded transition-all flex items-center space-x-0.5 border shrink-0 w-[42px] justify-center ${
              rotation > 0
                ? 'bg-cyber-neonGreen/10 border-cyber-neonGreen/40 text-cyber-neonGreen shadow-[0_0_10px_rgba(57,255,20,0.15)]'
                : 'bg-black/40 border-white/10 hover:bg-white/10 text-gray-300'
            }`}
            title={`Xoay camera (Hiện tại: ${rotation}°)`}
          >
            <RotateCw className="w-3 h-3 shrink-0" />
            <span className="text-[9px] font-mono font-bold">{rotation}°</span>
          </button>

          {/* Refresh Camera */}
          <button
            onClick={handleRefresh}
            className="p-1 rounded hover:bg-white/10 text-gray-300 transition-colors shrink-0"
            title="Tải lại luồng camera"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Cài đặt IP */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1 rounded hover:bg-white/10 text-gray-300 transition-colors shrink-0"
            title="Cài đặt địa chỉ IP Camera"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* Đường phân cách */}
          <div className="w-[1px] h-3.5 bg-white/20 mx-0.5 shrink-0" />

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
            className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-all flex items-center space-x-1 font-bold shrink-0 w-[62px] justify-center ${
              isDemoMode
                ? 'bg-purple-600/30 border-purple-400 text-purple-200 shadow-[0_0_15px_rgba(168,85,247,0.5)] animate-pulse'
                : 'bg-purple-950/40 border-purple-500/40 text-purple-300 hover:bg-purple-900/40'
            }`}
            title="Bấm để bật/tắt Game mô phỏng điều khiển xe 2D Canvas"
          >
            <Gamepad2 className={`w-3 h-3 shrink-0 ${isDemoMode ? 'text-purple-200 animate-bounce' : 'text-purple-400'}`} />
            <span>DEMO</span>
          </button>

          {/* Nút Bật/Tắt AI Vision (Khóa cứng w-[86px] chống giật khung) */}
          <button
            onClick={() => setIsVisionEnabled(!isVisionEnabled)}
            className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-all flex items-center space-x-1 font-bold shrink-0 w-[86px] justify-center ${
              isVisionEnabled && isVisionConnected
                ? 'bg-cyber-neonGreen/15 border-cyber-neonGreen/60 text-cyber-neonGreen shadow-[0_0_12px_rgba(57,255,20,0.3)]'
                : isVisionEnabled
                ? 'bg-cyber-neonYellow/20 border-cyber-neonYellow/60 text-cyber-neonYellow animate-pulse'
                : 'bg-black/40 border-white/10 text-gray-500 hover:text-gray-300'
            }`}
            title="Bật/Tắt nhận diện vật thể AI YOLOv8 từ Python Vision Server"
          >
            <Bot className={`w-3 h-3 shrink-0 ${isVisionConnected ? 'text-cyber-neonGreen' : 'text-gray-400'}`} />
            <span className="truncate">
              {isVisionEnabled ? (isVisionConnected ? `YOLO ${Math.round(inferenceMs)}ms` : 'YOLO...') : 'YOLO OFF'}
            </span>
          </button>

          {/* Nút Bật/Tắt CV Telemetry HUD (Khóa cứng w-[68px] chống giật khung) */}
          <button
            onClick={() => setShowCvTelemetry(!showCvTelemetry)}
            className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-all flex items-center space-x-1 font-bold shrink-0 w-[68px] justify-center ${
              showCvTelemetry
                ? 'bg-cyber-neonBlue/20 border-cyber-neonBlue/60 text-cyber-neonBlue shadow-[0_0_10px_rgba(0,243,255,0.3)]'
                : 'bg-black/40 border-white/10 text-gray-500 hover:text-gray-300'
            }`}
            title="Bật/Tắt bảng thông số chất lượng ảnh & đo lường CV (Phase 1)"
          >
            <Activity className="w-3 h-3 text-cyber-neonBlue shrink-0" />
            <span>{showCvTelemetry ? 'HUD ON' : 'HUD OFF'}</span>
          </button>

          {/* Nút Mở bảng điều khiển thuật toán CV DEMO (Dropdown Menu) */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowCvControls(!showCvControls)}
              className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-all flex items-center space-x-1 font-bold shrink-0 ${
                showCvControls
                  ? 'bg-purple-600/40 border-purple-400 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                  : 'bg-black/40 border-white/10 text-gray-400 hover:text-white'
              }`}
              title="Mở menu cài đặt thuật toán CV Phase 1 phục vụ Demo Báo cáo"
            >
              <Sliders className="w-3 h-3 text-purple-400 shrink-0" />
              <span>CV DEMO</span>
              <ChevronDown className={`w-2.5 h-2.5 transition-transform duration-200 ${showCvControls ? 'rotate-180 text-purple-300' : 'text-gray-400'}`} />
            </button>

            {/* Click-outside backdrop để đóng menu khi bấm ra ngoài */}
            {showCvControls && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowCvControls(false)}
              />
            )}

            {/* Dropdown Menu Thuật toán CV (Thả xuống mượt mà ngay dưới button) */}
            {showCvControls && (
              <div className="absolute right-0 top-full mt-1.5 w-72 bg-black/95 backdrop-blur-md p-3.5 rounded-xl border border-purple-500/60 shadow-[0_10px_35px_rgba(0,0,0,0.95)] z-50 flex flex-col space-y-3 font-mono text-[11px] animate-fadeIn">
                <div className="flex items-center justify-between border-b border-purple-500/30 pb-1.5 font-bold text-purple-300">
                  <span className="tracking-wide">THUẬT TOÁN CV (PHASE 1)</span>
                  <button
                    onClick={() => setShowCvControls(false)}
                    className="text-gray-400 hover:text-white text-xs px-1 hover:bg-white/10 rounded"
                  >
                    ✕
                  </button>
                </div>

                {/* Toggle Tiền xử lý thích nghi */}
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-gray-300">Tiền xử lý (Gamma/CLAHE):</span>
                  <div
                    onClick={() => handleToggleCvFlag('ENABLE_PREPROCESS', !cvFlags.ENABLE_PREPROCESS)}
                    className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors flex items-center ${
                      cvFlags.ENABLE_PREPROCESS ? 'bg-cyber-neonGreen' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full bg-black transition-transform ${
                        cvFlags.ENABLE_PREPROCESS ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>

                {/* Toggle Khử rung ảnh */}
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-gray-300">Ổn định ảnh (Stabilizer):</span>
                  <div
                    onClick={() => handleToggleCvFlag('ENABLE_STABILIZER', !cvFlags.ENABLE_STABILIZER)}
                    className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors flex items-center ${
                      cvFlags.ENABLE_STABILIZER ? 'bg-cyber-neonBlue' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full bg-black transition-transform ${
                        cvFlags.ENABLE_STABILIZER ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>

                {/* Toggle Khóa phanh khi mờ */}
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-gray-300">Lọc mờ (Khóa phanh an toàn):</span>
                  <div
                    onClick={() => handleToggleCvFlag('ENABLE_BLUR_FILTER', !cvFlags.ENABLE_BLUR_FILTER)}
                    className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors flex items-center ${
                      cvFlags.ENABLE_BLUR_FILTER ? 'bg-cyber-neonYellow' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full bg-black transition-transform ${
                        cvFlags.ENABLE_BLUR_FILTER ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>

                {/* Chế độ nhị phân hóa vạch đường */}
                <div className="flex flex-col space-y-1 pt-1 border-t border-white/10">
                  <span className="text-gray-400 text-[10px]">Chế độ Nhị phân hóa Lane:</span>
                  <div className="grid grid-cols-3 gap-1">
                    {(['otsu', 'adaptive', 'auto'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => handleToggleCvFlag('LANE_THRESHOLD_MODE', m)}
                        className={`py-0.5 rounded text-[9px] uppercase font-bold border transition-all text-center ${
                          cvFlags.LANE_THRESHOLD_MODE === m
                            ? 'bg-cyber-neonBlue/30 border-cyber-neonBlue text-cyber-neonBlue shadow-[0_0_8px_rgba(0,243,255,0.4)]'
                            : 'bg-black/60 border-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* PHASE 2: PHÁT HIỆN VẬT CẢN & HỢP NHẤT */}
                <div className="pt-1.5 border-t border-purple-500/30 flex items-center justify-between font-bold text-purple-300">
                  <span className="text-[10px] tracking-wide">PHASE 2: HỢP NHẤT CẢM BIẾN</span>
                </div>

                {/* Toggle Phân đoạn mặt sàn Freespace */}
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-gray-300">Sàn trống (Freespace):</span>
                  <div
                    onClick={() => handleToggleCvFlag('ENABLE_FREESPACE', !cvFlags.ENABLE_FREESPACE)}
                    className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors flex items-center ${
                      cvFlags.ENABLE_FREESPACE ? 'bg-fuchsia-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full bg-black transition-transform ${
                        cvFlags.ENABLE_FREESPACE ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>

                {/* Toggle Dòng quang học Farneback */}
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-gray-300">Dòng quang học (Flow):</span>
                  <div
                    onClick={() => handleToggleCvFlag('ENABLE_FLOW', !cvFlags.ENABLE_FLOW)}
                    className={`w-8 h-4 rounded-full p-0.5 cursor-pointer transition-colors flex items-center ${
                      cvFlags.ENABLE_FLOW ? 'bg-amber-400' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full bg-black transition-transform ${
                        cvFlags.ENABLE_FLOW ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>

                {/* Chế độ Hợp nhất đa nguồn */}
                <div className="flex flex-col space-y-1 pt-1 border-t border-white/10">
                  <span className="text-gray-400 text-[10px]">Chế độ Hợp nhất (Fusion):</span>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { key: 'yolo_only', label: 'YOLO' },
                      { key: 'or', label: 'OR (ĐA NGUỒN)' },
                      { key: 'vote', label: 'VOTE' },
                    ].map((item) => (
                      <button
                        key={item.key}
                        onClick={() => handleToggleCvFlag('FUSION_MODE', item.key)}
                        className={`py-0.5 rounded text-[9px] font-bold border transition-all text-center ${
                          cvFlags.FUSION_MODE === item.key
                            ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.5)]'
                            : 'bg-black/60 border-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Stream Area */}
      {isDemoMode ? (
        <CarSimulatorGame
          driveCommand={driveCommand || { x: 0, y: 0, speedLimit: 80 }}
          onTelemetryUpdate={onTelemetryUpdate}
          isCollisionWarning={isCollisionWarning}
        />
      ) : (
        <div
          ref={containerRef}
          className="w-full h-full bg-black/90 flex items-center justify-center scanlines relative group overflow-hidden"
        >
          {/* Detection Overlay từ Python YOLOv8 & OpenCV Phase 1 */}
          {isVisionEnabled && isVisionConnected && (
            <DetectionOverlay
              detections={detections}
              lane={lane}
              collision={collision}
              quality={quality}
              stabilizer={stabilizer}
              timings={timings}
              freespace={freespace}
              flow={flow}
              fusionMode={fusionMode}
              showTelemetry={showCvTelemetry}
              frameWidth={frameSize?.width || 640}
              frameHeight={frameSize?.height || 480}
              containerWidth={containerSize.width}
              containerHeight={containerSize.height}
              rotation={rotation}
            />
          )}

          {/* Overlay HUD - Target Crosshair */}
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 border border-cyber-neonBlue/30 rounded-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-cyber-neonBlue/80 rounded-full"></div>
            </div>
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
