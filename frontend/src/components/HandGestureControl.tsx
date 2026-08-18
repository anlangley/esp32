import { useEffect, useRef, useState, useCallback } from 'react';
import { Hand, Activity, X, Gauge } from 'lucide-react';

interface HandGestureControlProps {
  onDriveCommand: (cmd: { x: number; y: number }) => void;
  onClose?: () => void;
  isActive: boolean;
}

export type GearMode = 'P' | 'R' | 'D1' | 'D2' | 'D3';

// ─── Hằng số tinh chỉnh (Tuning Constants) ────────────────────────────────
const SMOOTHING_FACTOR = 0.35;        // EMA alpha: nhỏ = mượt hơn, lớn = nhạy hơn (0.2–0.5)
const STEER_SENSITIVITY = 12.0;       // Hệ số nhạy vô-lăng (cao hơn = rẽ nhanh hơn)
const STEER_EXPO = 0.6;               // Expo curve: < 1 = nhạy vùng nhỏ, > 1 = nhạy vùng lớn
const DEAD_ZONE = 0.08;               // Dead zone nhỏ: loại bỏ nhiễu micro (8%)
const EMIT_INTERVAL_MS = 16;          // Gửi lệnh ~60FPS (16ms)
const FINGER_HYSTERESIS = 1.08;       // Hysteresis ngưỡng duỗi ngón tay (tránh nhấp nháy)
const ONE_HAND_STEER_SCALE = 3.0;     // Hệ số nhạy lái 1 tay (analog)
const ONE_HAND_POINT_THRESHOLD = 0.04; // Ngưỡng chỉ trái/phải 1 tay (giảm từ 0.08)

// ─── Helper: Phân tích Hand Pose từ 21 landmark (có Hysteresis) ────────────
const analyzeHandPose = (landmarks: any[], prevState?: any) => {
  if (!landmarks || landmarks.length < 21) {
    return {
      indexExt: false, middleExt: false, ringExt: false, pinkyExt: false,
      extendedCount: 0, isFist: false, isIndexOnly: false, isVSign: false,
      isOpenHand: false, isPinkyOnly: false, isPointingLeft: false, isPointingRight: false,
    };
  }

  const dist = (p1: any, p2: any) =>
    Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

  const wrist = landmarks[0];

  // Hysteresis: nếu ngón trước đó đã duỗi, dùng ngưỡng thấp hơn để tránh nhấp nháy
  const checkExt = (tipIdx: number, pipIdx: number, wasExtended?: boolean) => {
    const tipDist = dist(landmarks[tipIdx], wrist);
    const pipDist = dist(landmarks[pipIdx], wrist);
    if (wasExtended) {
      return tipDist > pipDist / FINGER_HYSTERESIS; // Ngưỡng thấp hơn để giữ trạng thái
    }
    return tipDist > pipDist; // Ngưỡng bình thường
  };

  const indexExt = checkExt(8, 6, prevState?.indexExt);
  const middleExt = checkExt(12, 10, prevState?.middleExt);
  const ringExt = checkExt(16, 14, prevState?.ringExt);
  const pinkyExt = checkExt(20, 18, prevState?.pinkyExt);

  const extendedCount = (indexExt ? 1 : 0) + (middleExt ? 1 : 0) + (ringExt ? 1 : 0) + (pinkyExt ? 1 : 0);

  const isFist = extendedCount === 0;
  const isIndexOnly = indexExt && !middleExt && !ringExt && !pinkyExt;
  const isVSign = indexExt && middleExt && !ringExt && !pinkyExt;
  const isOpenHand = extendedCount >= 3;
  const isPinkyOnly = pinkyExt && !indexExt && !middleExt && !ringExt;

  const isPointingLeft = indexExt && landmarks[8].x < landmarks[5].x - ONE_HAND_POINT_THRESHOLD;
  const isPointingRight = indexExt && landmarks[8].x > landmarks[5].x + ONE_HAND_POINT_THRESHOLD;

  return {
    indexExt, middleExt, ringExt, pinkyExt, extendedCount,
    isFist, isIndexOnly, isVSign, isOpenHand, isPinkyOnly,
    isPointingLeft, isPointingRight,
  };
};

// ─── Helper: EMA Smoothing Filter ──────────────────────────────────────────
const emaSmooth = (current: number, previous: number, alpha: number) =>
  alpha * current + (1 - alpha) * previous;

// ─── Helper: Apply dead zone + expo curve ──────────────────────────────────
const applyDeadZoneExpo = (value: number, deadZone: number, expo: number) => {
  const absVal = Math.abs(value);
  if (absVal < deadZone) return 0;
  const normalized = (absVal - deadZone) / (1 - deadZone);
  const curved = Math.pow(normalized, expo);
  return Math.sign(value) * Math.min(1, curved);
};

export const HandGestureControl = ({ onDriveCommand, onClose, isActive }: HandGestureControlProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [status, setStatus] = useState<string>('Khởi động Vô-lăng Ảo Cài Số...');
  const [currentGear, setCurrentGear] = useState<GearMode>('P');
  const [_, setGestureState] = useState<
    'stop' | 'forward' | 'backward' | 'left' | 'right' | 'speed_up' | 'speed_down' | 'uturn' | 'none'
  >('none');
  const [commandValues, setCommandValues] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Gear Latch Ref: Giữ nguyên nấc số cho đến khi nhận được ký hiệu cài số mới!
  const latchedGearRef = useRef<GearMode>('P');

  const cameraRef = useRef<any>(null);
  const handsRef = useRef<any>(null);
  const baselineDistRef = useRef<number | null>(null);
  const lastEmitRef = useRef<number>(0);

  // ─── Smoothing state refs (không gây re-render) ──────────────────────────
  const smoothXRef = useRef<number>(0);       // Giá trị X đã smooth
  const prevPose1Ref = useRef<any>(null);     // Pose trước đó (cho hysteresis)
  const prevPose2Ref = useRef<any>(null);

  // State & Ref cho Phím SPACE (Dấu cách)
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const isSpacePressedRef = useRef<boolean>(false);

  // Lắng nghe phím SPACE (Dấu cách)
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        if (!isSpacePressedRef.current) {
          isSpacePressedRef.current = true;
          setIsSpacePressed(true);
        }
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        isSpacePressedRef.current = false;
        setIsSpacePressed(false);
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isActive]);

  const resetBaseline = () => {
    baselineDistRef.current = null;
    latchedGearRef.current = 'P';
    smoothXRef.current = 0;
    setCurrentGear('P');
    setStatus('🎯 Đã trả về Số P (Dừng)!');
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE LOGIC: Xử lý AI nhận diện tay, smooth & phát lệnh lái
  // ═══════════════════════════════════════════════════════════════════════════
  const processLandmarks = useCallback((results: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      // Không có tay: smooth về 0 thay vì nhảy đột ngột
      smoothXRef.current = emaSmooth(0, smoothXRef.current, SMOOTHING_FACTOR);
      const fadeX = Math.abs(smoothXRef.current) < 0.01 ? 0 : smoothXRef.current;
      smoothXRef.current = fadeX;

      setStatus('🤲 Hãy đưa bàn tay lên tư thế Lái & Cài số');
      setGestureState('none');
      setCommandValues({ x: 0, y: 0 });
      onDriveCommand({ x: 0, y: 0 });
      ctx.restore();
      return;
    }

    const HAND_CONNECTIONS = (window as any).HAND_CONNECTIONS || [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]
    ];

    const dist = (p1: any, p2: any) =>
      Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

    // 1. Vẽ khung xương bàn tay
    results.multiHandLandmarks.forEach((landmarks: any[]) => {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#00a8ff';
      ctx.fillStyle = '#00ffff';

      HAND_CONNECTIONS.forEach(([start, end]: [number, number]) => {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        if (p1 && p2) {
          ctx.beginPath();
          ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
          ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
          ctx.stroke();
        }
      });

      landmarks.forEach((lm: any) => {
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, 2 * Math.PI);
        ctx.fill();
      });
    });

    const isTwoHands = results.multiHandLandmarks.length >= 2;
    const hand1 = results.multiHandLandmarks[0];
    const hand2 = isTwoHands ? results.multiHandLandmarks[1] : null;

    // Phân tích pose CÓ hysteresis (dùng state trước đó để giảm nhấp nháy)
    const pose1 = analyzeHandPose(hand1, prevPose1Ref.current);
    const pose2 = hand2 ? analyzeHandPose(hand2, prevPose2Ref.current) : null;
    prevPose1Ref.current = pose1;
    prevPose2Ref.current = pose2;

    // ─── GEAR LATCHING: Chỉ đổi số khi giữ SPACE ──────────────────────────
    let detectedGear: GearMode | null = null;

    if ((isTwoHands && pose1.isFist && pose2?.isFist) || (!isTwoHands && pose1.isFist)) {
      detectedGear = 'P';
    } else if (pose1.isPinkyOnly || pose2?.isPinkyOnly) {
      detectedGear = 'R';
    } else if (pose1.isIndexOnly || pose2?.isIndexOnly) {
      detectedGear = 'D1';
    } else if (pose1.isVSign || pose2?.isVSign) {
      detectedGear = 'D2';
    } else if (pose1.isOpenHand || pose2?.isOpenHand) {
      detectedGear = 'D3';
    }

    if (detectedGear && isSpacePressedRef.current) {
      latchedGearRef.current = detectedGear;
    }

    const activeGear = latchedGearRef.current;
    setCurrentGear(activeGear);

    let rawX = 0;
    let driveY = 0;
    let currentGesture: 'forward' | 'backward' | 'left' | 'right' | 'stop' | 'speed_up' | 'speed_down' | 'uturn' | 'none' = 'none';
    let statusMsg = '';

    // ─── TÍNH GÓC LÁI (DRIVE X) ────────────────────────────────────────────
    if (isTwoHands && hand1 && hand2) {
      const h1CenterX = (hand1[0].x + hand1[9].x) / 2;
      const h2CenterX = (hand2[0].x + hand2[9].x) / 2;

      const leftHand = h1CenterX > h2CenterX ? hand1 : hand2;
      const rightHand = h1CenterX > h2CenterX ? hand2 : hand1;

      const pL = { x: (leftHand[0].x + leftHand[9].x) / 2, y: (leftHand[0].y + leftHand[9].y) / 2 };
      const pR = { x: (rightHand[0].x + rightHand[9].x) / 2, y: (rightHand[0].y + rightHand[9].y) / 2 };

      // Vẽ vô-lăng 3D nối 2 tay
      const midX = ((pL.x + pR.x) / 2) * canvas.width;
      const midY = ((pL.y + pR.y) / 2) * canvas.height;
      const wheelRadius = (dist(pL, pR) * canvas.width) / 2;

      ctx.strokeStyle = activeGear === 'P' ? '#ff2a2a' : activeGear === 'R' ? '#d946ef' : '#00f0ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(midX, midY, wheelRadius, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.strokeStyle = '#39ff14';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(pL.x * canvas.width, pL.y * canvas.height);
      ctx.lineTo(pR.x * canvas.width, pR.y * canvas.height);
      ctx.stroke();

      // Nghiêng vô-lăng ➔ Rẽ trái / Rẽ phải (Tuned sensitivity + expo)
      const deltaY = pR.y - pL.y;
      rawX = deltaY * STEER_SENSITIVITY;
    } else {
      // ─── Lái 1 tay: ANALOG proportional (không binary on/off) ─────────
      if (pose1.isPointingLeft || pose1.isPointingRight) {
        const tipX = hand1[8].x;
        const baseX = hand1[5].x;
        const offset = tipX - baseX;
        rawX = offset * ONE_HAND_STEER_SCALE;
      }
    }

    // ─── Apply Dead Zone + Expo Curve + EMA Smoothing ───────────────────────
    const shapedX = applyDeadZoneExpo(rawX, DEAD_ZONE, STEER_EXPO);
    smoothXRef.current = emaSmooth(shapedX, smoothXRef.current, SMOOTHING_FACTOR);
    const driveX = Math.max(-1, Math.min(1, smoothXRef.current));

    // ─── Gán ga theo nấc số đã chốt ────────────────────────────────────────
    switch (activeGear) {
      case 'P':
        driveY = 0;
        smoothXRef.current = 0; // Reset smooth khi dừng
        currentGesture = 'stop';
        statusMsg = '✊ SỐ P: XE ĐÃ DỪNG (KHÓA GA 0%)';
        break;
      case 'D1':
        driveY = 0.35;
        currentGesture = 'forward';
        statusMsg = '☝️ SỐ D1: TIẾN CHẬM (35% GA)';
        break;
      case 'D2':
        driveY = 0.65;
        currentGesture = 'forward';
        statusMsg = '✌️ SỐ D2: TIẾN VỪA (65% GA)';
        break;
      case 'D3':
        driveY = 1.0;
        currentGesture = 'forward';
        statusMsg = '🖐️ SỐ D3: TIẾN TỐI ĐA (100% GA)';
        break;
      case 'R':
        driveY = -0.6;
        currentGesture = 'backward';
        statusMsg = '🤙 SỐ R: XE LÙI (-60% GA)';
        break;
    }

    if (activeGear !== 'P') {
      if (driveX < -0.15) currentGesture = 'left';
      else if (driveX > 0.15) currentGesture = 'right';
    }

    const finalX = parseFloat((activeGear === 'P' ? 0 : driveX).toFixed(2));
    const finalY = parseFloat(driveY.toFixed(2));

    setCommandValues({ x: finalX, y: finalY });
    setGestureState(currentGesture as any);
    setStatus(statusMsg);

    // ─── Gửi lệnh liên tục ~60FPS ──────────────────────────────────────────
    const now = Date.now();
    if (now - lastEmitRef.current > EMIT_INTERVAL_MS) {
      onDriveCommand({ x: finalX, y: finalY });
      lastEmitRef.current = now;
    }

    ctx.restore();
  }, [onDriveCommand]);

  // Nạp MediaPipe AI từ CDN
  useEffect(() => {
    if (!isActive) return;

    let isSubscribed = true;

    const loadMediaPipeScript = (src: string) => {
      return new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
    };

    const initAI = async () => {
      try {
        setStatus('⏳ Đang nạp AI Vô-lăng & Cài Số (Lite 60 FPS)...');
        await loadMediaPipeScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
        await loadMediaPipeScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');

        if (!isSubscribed) return;

        const HandsClass = (window as any).Hands;
        const CameraClass = (window as any).Camera;

        if (!HandsClass || !CameraClass) {
          throw new Error('MediaPipe script missing in window scope');
        }

        const hands = new HandsClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 0,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        hands.onResults((results: any) => {
          if (isSubscribed) processLandmarks(results);
        });

        handsRef.current = hands;

        if (videoRef.current) {
          const camera = new CameraClass(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && handsRef.current) {
                await handsRef.current.send({ image: videoRef.current });
              }
            },
            width: 640,
            height: 480,
          });

          await camera.start();
          if (isSubscribed) setStatus('🏎️ Vô-lăng Ảo Cài Số đã sẵn sàng!');
          cameraRef.current = camera;
        }
      } catch (err: any) {
        console.error('AI Init error:', err);
        if (isSubscribed) setStatus(`❌ Lỗi nạp AI: ${err.message}`);
      }
    };

    initAI();

    return () => {
      isSubscribed = false;
      if (cameraRef.current) {
        try { cameraRef.current.stop(); } catch (e) {}
      }
      if (handsRef.current) {
        try { handsRef.current.close(); } catch (e) {}
      }
      onDriveCommand({ x: 0, y: 0 });
    };
  }, [isActive, processLandmarks, onDriveCommand]);

  if (!isActive) return null;

  return (
    <div className="relative w-full h-full bg-slate-950 rounded-xl overflow-hidden border border-cyber-neonBlue/30 shadow-2xl flex flex-col min-h-[320px]">
      {/* Sleek Top Header Controls */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/95 border-b border-slate-800/80 z-20 gap-2 flex-wrap sm:flex-nowrap">
        <div className="flex items-center space-x-1.5 shrink-0">
          <Hand className="w-3.5 h-3.5 text-cyber-neonBlue animate-pulse" />
          <span className="text-xs font-bold text-white tracking-wide">Vô-lăng Ảo AI</span>
        </div>

        <div className="flex items-center space-x-1.5 overflow-hidden shrink-0">
          {/* Spacebar Hold Button & Indicator */}
          <button
            onMouseDown={() => { isSpacePressedRef.current = true; setIsSpacePressed(true); }}
            onMouseUp={() => { isSpacePressedRef.current = false; setIsSpacePressed(false); }}
            onTouchStart={() => { isSpacePressedRef.current = true; setIsSpacePressed(true); }}
            onTouchEnd={() => { isSpacePressedRef.current = false; setIsSpacePressed(false); }}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all border shrink-0 ${
              isSpacePressed
                ? 'bg-amber-500 text-black border-amber-300 scale-105 shadow-[0_0_10px_rgba(245,158,11,0.6)] animate-pulse'
                : 'bg-slate-800 text-gray-300 border-slate-700 hover:text-white'
            }`}
            title="Nhấn phím SPACE (Dấu cách) trên bàn phím hoặc giữ nút này để thay đổi nấc số bằng cử chỉ"
          >
            {isSpacePressed ? '⚡ SPACE: ĐANG GIỮ (MỞ ĐỔI)' : '🔒 SPACE: NHẢ (KHÓA SỐ)'}
          </button>

          <button
            onClick={resetBaseline}
            className="px-2 py-0.5 bg-red-500/20 hover:bg-red-500/40 border border-red-500/50 text-red-400 rounded text-[10px] font-bold shrink-0"
            title="Trả về số P (Dừng xe ngay lập tức)"
          >
            🛑 Reset P
          </button>

          <div className="hidden md:flex items-center space-x-1 px-2 py-0.5 rounded-full bg-black/60 border border-cyber-neonBlue/30 text-[10px] font-mono shrink">
            <Activity className="w-2.5 h-2.5 text-cyber-neonGreen animate-spin shrink-0" />
            <span className="text-cyber-neonGreen font-semibold truncate max-w-[140px]">{status}</span>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Camera Preview Container */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {/* Hidden HTML5 Video for MediaPipe Processing */}
        <video
          ref={videoRef}
          className="hidden"
          playsInline
          muted
        />

        {/* Canvas HUD Overlay */}
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="w-full h-full object-cover transform -scale-x-100"
        />

        {/* Compact Gear Box HUD (Top Right Corner) */}
        <div className="absolute top-2 right-2 bg-slate-950/80 border border-cyber-neonBlue/40 px-2 py-1 rounded-lg backdrop-blur-md shadow-md pointer-events-none z-10 flex items-center space-x-2">
          <div className="flex items-center space-x-1 text-[10px] font-mono text-gray-400">
            <Gauge className="w-3 h-3 text-cyber-neonGreen" />
            <span className="font-bold text-gray-300">SỐ:</span>
          </div>

          <div className="flex items-center space-x-1 font-mono font-bold text-[10px]">
            {(['P', 'R', 'D1', 'D2', 'D3'] as GearMode[]).map((g) => (
              <span
                key={g}
                className={`px-1.5 py-0.5 rounded transition-all ${
                  currentGear === g
                    ? g === 'P'
                      ? 'bg-red-600 text-white font-black scale-105 shadow-md shadow-red-500/50 animate-pulse'
                      : g === 'R'
                      ? 'bg-fuchsia-600 text-white font-black scale-105'
                      : g === 'D1'
                      ? 'bg-cyan-500 text-black font-black scale-105'
                      : g === 'D2'
                      ? 'bg-emerald-500 text-black font-black scale-105'
                      : 'bg-amber-400 text-black font-black scale-105'
                    : 'bg-slate-900/80 text-gray-500 border border-white/5'
                }`}
              >
                {g}
              </span>
            ))}
          </div>

          <div
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${
              isSpacePressed
                ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50 animate-pulse'
                : 'bg-slate-900/90 text-gray-400 border border-slate-800'
            }`}
          >
            {isSpacePressed ? '⚡ ĐỔI SỐ' : '🔒 KHÓA SỐ'}
          </div>
        </div>

        {/* Subtle Center Target Circle */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-40">
          <div className="w-20 h-20 border border-dashed border-cyber-neonBlue/40 rounded-full flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-cyber-neonBlue rounded-full animate-ping" />
          </div>
        </div>

        {/* Bottom Streamlined HUD Strip (Non-intrusive single row) */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10 gap-1 flex-wrap sm:flex-nowrap">
          {/* Quick Gesture Legend Badges */}
          <div className="flex items-center space-x-1 text-[9px] font-mono font-bold flex-wrap gap-0.5">
            <span className={`px-1.5 py-0.5 rounded backdrop-blur-md ${currentGear === 'P' ? 'bg-red-600 text-white' : 'bg-black/60 text-gray-300 border border-white/10'}`}>
              ✊P
            </span>
            <span className={`px-1.5 py-0.5 rounded backdrop-blur-md ${currentGear === 'D1' ? 'bg-cyan-500 text-black' : 'bg-black/60 text-gray-300 border border-white/10'}`}>
              ☝️D1
            </span>
            <span className={`px-1.5 py-0.5 rounded backdrop-blur-md ${currentGear === 'D2' ? 'bg-emerald-500 text-black' : 'bg-black/60 text-gray-300 border border-white/10'}`}>
              ✌️D2
            </span>
            <span className={`px-1.5 py-0.5 rounded backdrop-blur-md ${currentGear === 'D3' ? 'bg-amber-400 text-black' : 'bg-black/60 text-gray-300 border border-white/10'}`}>
              🖐️D3
            </span>
            <span className={`px-1.5 py-0.5 rounded backdrop-blur-md ${currentGear === 'R' ? 'bg-fuchsia-600 text-white' : 'bg-black/60 text-gray-300 border border-white/10'}`}>
              🤙R
            </span>
          </div>

          {/* Center Spacebar Tip */}
          <div className="hidden sm:block bg-black/70 border border-white/10 px-2 py-0.5 rounded text-[9px] font-mono text-amber-300 backdrop-blur-md truncate">
            💡 Giữ phím <b>SPACE</b> + Đổi cử chỉ để sang số mới
          </div>

          {/* Telemetry Output */}
          <div className="bg-black/80 border border-cyber-neonBlue/40 px-2 py-0.5 rounded text-[9px] font-mono text-cyber-neonBlue backdrop-blur-md shrink-0">
            X:{commandValues.x} | Y:{commandValues.y}
          </div>
        </div>
      </div>
    </div>
  );
};
