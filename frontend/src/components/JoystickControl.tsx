import { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Radio, Keyboard, Gamepad2, Lock } from 'lucide-react';
import type { ControlCommand, KeyControls } from '../types/control';

interface JoystickControlProps {
  onCommandChange: (cmd: ControlCommand) => void;
  speedLimit: number;
  setSpeedLimit: (limit: number) => void;
  activeCommand?: { x: number; y: number };
  isRcMode?: boolean;
  rcThrottle?: number;
  rcSteer?: number;
}

export const JoystickControl = ({
  onCommandChange,
  speedLimit,
  setSpeedLimit,
  activeCommand,
  isRcMode = false,
  rcThrottle = 1500,
  rcSteer = 1500,
}: JoystickControlProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  
  // Chế độ điều khiển active: 'joystick' (Cần gạt ảo), 'keyboard' (Bàn phím WASD), 'sbus' (Tay cầm MC6C)
  const [controlMode, setControlMode] = useState<'joystick' | 'keyboard' | 'sbus'>('joystick');

  // Tự động chuyển giao diện sang Chế độ Tay Cầm S.BUS khi xe nhận tín hiệu từ phần cứng
  useEffect(() => {
    if (isRcMode) {
      setControlMode('sbus');
    } else {
      setControlMode(prev => (prev === 'sbus' ? 'joystick' : prev));
    }
  }, [isRcMode]);
  
  const [isDragging, setIsDragging] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 }); // Local joystick visual offset (-60 to 60)
  const [activeKeys, setActiveKeys] = useState<KeyControls>({ w: false, a: false, s: false, d: false });
  const [gamepadName, setGamepadName] = useState<string | null>(null);

  // Keep track of the current values to avoid excessive re-emission
  const currentCommand = useRef<ControlCommand>({ x: 0, y: 0, speedLimit });

  const updateCommand = useCallback((x: number, y: number) => {
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));

    const roundedX = Math.round(clampedX * 100) / 100;
    const roundedY = Math.round(clampedY * 100) / 100;

    // Cập nhật vị trí hiển thị của Cần Joystick theo giá trị x, y thực tế
    setCoords({ x: roundedX * 50, y: -roundedY * 50 });

    // Cập nhật trạng thái hiển thị phím W-A-S-D sáng đèn theo hướng di chuyển
    setActiveKeys({
      w: roundedY > 0.2,
      s: roundedY < -0.2,
      a: roundedX < -0.2,
      d: roundedX > 0.2,
    });

    if (
      currentCommand.current.x !== roundedX ||
      currentCommand.current.y !== roundedY ||
      currentCommand.current.speedLimit !== speedLimit
    ) {
      currentCommand.current = { x: roundedX, y: roundedY, speedLimit };
      onCommandChange(currentCommand.current);
    }
  }, [speedLimit, onCommandChange]);

  // Cập nhật giao diện Cần Joystick khi có lệnh từ bên ngoài truyền vào
  useEffect(() => {
    if (activeCommand && !isDragging) {
      setCoords({ x: activeCommand.x * 50, y: -activeCommand.y * 50 });
      setActiveKeys({
        w: activeCommand.y > 0.2,
        s: activeCommand.y < -0.2,
        a: activeCommand.x < -0.2,
        d: activeCommand.x > 0.2,
      });
    }
  }, [activeCommand, isDragging]);

  // Keyboard control handlers
  useEffect(() => {
    const matchKey = (e: KeyboardEvent, target: 'w' | 'a' | 's' | 'd') => {
      const k = e.key ? e.key.toLowerCase() : '';
      const c = e.code || '';

      if (target === 'w') return c === 'KeyW' || c === 'ArrowUp' || k === 'w' || k === 'ư' || k === 'arrowup';
      if (target === 'a') return c === 'KeyA' || c === 'ArrowLeft' || k === 'a' || k === 'arrowleft';
      if (target === 's') return c === 'KeyS' || c === 'ArrowDown' || k === 's' || k === 'arrowdown';
      if (target === 'd') return c === 'KeyD' || c === 'ArrowRight' || k === 'd' || k === 'arrowright';
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (matchKey(e, 'w') || matchKey(e, 'a') || matchKey(e, 's') || matchKey(e, 'd')) {
        e.preventDefault(); // Chặn trình duyệt tự cuộn trang khi nhấn phím W-A-S-D hoặc Mũi tên
      }

      setActiveKeys(prev => {
        let updated = { ...prev };
        let changed = false;

        if (matchKey(e, 'w') && !updated.w) { updated.w = true; changed = true; }
        if (matchKey(e, 'a') && !updated.a) { updated.a = true; changed = true; }
        if (matchKey(e, 's') && !updated.s) { updated.s = true; changed = true; }
        if (matchKey(e, 'd') && !updated.d) { updated.d = true; changed = true; }

        if (changed) {
          let x = (updated.d ? 1 : 0) - (updated.a ? 1 : 0);
          let y = (updated.w ? 1 : 0) - (updated.s ? 1 : 0);
          updateCommand(x, y);
        }
        return changed ? updated : prev;
      });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (matchKey(e, 'w') || matchKey(e, 'a') || matchKey(e, 's') || matchKey(e, 'd')) {
        e.preventDefault(); // Chặn trình duyệt tự cuộn trang khi nhả phím
      }

      setActiveKeys(prev => {
        let updated = { ...prev };
        let changed = false;

        if (matchKey(e, 'w') && updated.w) { updated.w = false; changed = true; }
        if (matchKey(e, 'a') && updated.a) { updated.a = false; changed = true; }
        if (matchKey(e, 's') && updated.s) { updated.s = false; changed = true; }
        if (matchKey(e, 'd') && updated.d) { updated.d = false; changed = true; }

        if (changed) {
          let x = (updated.d ? 1 : 0) - (updated.a ? 1 : 0);
          let y = (updated.w ? 1 : 0) - (updated.s ? 1 : 0);
          updateCommand(x, y);
        }
        return changed ? updated : prev;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [updateCommand]);

  // Touch and Mouse dragging logic for visual joystick
  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
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

    const normX = deltaX / maxRadius;
    const normY = -deltaY / maxRadius;

    updateCommand(normX, normY);
  }, [updateCommand]);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault(); // Chặn cuộn trang khi chạm kéo cần Joystick
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    handleMove(clientX, clientY);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      if (e.cancelable) e.preventDefault(); // Chặn cuộn trang khi di chuyển cần Joystick
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      handleMove(clientX, clientY);
    };

    const onEnd = () => {
      if (isDragging) {
        setIsDragging(false);
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
  }, [isDragging, handleMove, updateCommand]);

  // HTML5 Gamepad API loop
  useEffect(() => {
    let animationFrameId: number;

    const pollGamepad = () => {
      const gamepads = navigator.getGamepads();
      const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];

      if (gp) {
        setGamepadName(gp.id);
        const deadzone = 0.08;
        let gpX = gp.axes[0];
        let gpY = -gp.axes[1];

        if (Math.abs(gpX) < deadzone && Math.abs(gpY) < deadzone && gp.axes[2] !== undefined) {
          gpX = gp.axes[2];
          gpY = -gp.axes[3];
        }

        const xVal = Math.abs(gpX) > deadzone ? gpX : 0;
        const yVal = Math.abs(gpY) > deadzone ? gpY : 0;

        updateCommand(xVal, yVal);
      } else {
        if (gamepadName) setGamepadName(null);
      }
      animationFrameId = requestAnimationFrame(pollGamepad);
    };

    pollGamepad();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [gamepadName, updateCommand]);

  // Tính toán độ lệch và phần trăm hiển thị cho các kênh S.BUS
  // Kênh 3 (Throttle): Đẩy lên (ch3 < 1500) là Tiến (dương, translate Y lên trên)
  const throttleNormalized = -Math.max(-1, Math.min(1, ((rcThrottle || 1500) - 1500) / 400));
  const throttlePct = Math.round(throttleNormalized * 100);
  const throttleOffsetY = -throttleNormalized * 38;

  // Kênh 1 (Steering): Đảo chiều theo phản hồi người dùng để khớp đúng tay gạt vật lý
  const steerNormalized = -Math.max(-1, Math.min(1, ((rcSteer || 1500) - 1500) / 400));
  const steerPct = Math.round(steerNormalized * 100);
  const steerOffsetX = steerNormalized * 38;

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col space-y-4 border border-white/5 shadow-md">
      {/* Selector Tab: Chọn phương thức điều khiển */}
      <div className="flex items-center justify-between bg-black/40 p-1.5 rounded-xl border border-white/10">
        <span className="text-xs uppercase font-bold text-cyber-neonBlue tracking-wider flex items-center px-2">
          <Radio className="w-4 h-4 mr-1.5 animate-pulse text-cyber-neonGreen" /> Bộ điều khiển Xe
        </span>

        <div className="flex space-x-1">
          <button
            onClick={() => { setControlMode('joystick'); updateCommand(0, 0); }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              controlMode === 'joystick'
                ? 'bg-cyber-neonBlue text-black font-black shadow-[0_0_10px_#00f0ff]'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Gamepad2 className="w-3.5 h-3.5" />
            <span>Virtual Joystick</span>
          </button>

          <button
            onClick={() => { setControlMode('keyboard'); updateCommand(0, 0); }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              controlMode === 'keyboard'
                ? 'bg-cyber-neonBlue text-black font-black shadow-[0_0_10px_#00f0ff]'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Bàn phím WASD</span>
          </button>

          {/* Tab 3: Tay Cầm S.BUS (MC6C) */}
          <button
            onClick={() => { setControlMode('sbus'); updateCommand(0, 0); }}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              controlMode === 'sbus'
                ? isRcMode
                  ? 'bg-emerald-400 text-black font-black shadow-[0_0_12px_rgba(52,211,153,0.8)]'
                  : 'bg-amber-400 text-black font-black shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                : isRcMode
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 animate-pulse'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Tay Cầm S.BUS</span>
            {isRcMode && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {controlMode === 'sbus' ? (
        /* GIAO DIỆN TAY ĐIỀU KHIỂN S.BUS (MC6C DUAL-GIMBAL HUD) */
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6 py-2">
          {/* Cụm 2 Cần Gạt Gimbal Phản Hồi Thời Gian Thực */}
          <div className="flex items-center justify-center space-x-8 sm:space-x-12 shrink-0">
            {/* Gimbal Trái: Throttle / Ga Kênh 3 */}
            <div className="flex flex-col items-center space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                Kênh 3 (Ga / Tiến Lùi)
              </span>
              <div className="relative w-32 h-32 rounded-full border-2 border-emerald-500/30 bg-black/70 flex items-center justify-center shadow-[inset_0_0_20px_rgba(16,185,129,0.15)]">
                <div className="absolute inset-x-0 h-[1px] bg-emerald-500/20"></div>
                <div className="absolute inset-y-0 w-[1px] bg-emerald-500/20"></div>

                {/* Animated Gimbal Stick */}
                <div
                  style={{
                    transform: `translate3d(0, ${throttleOffsetY}px, 0)`,
                  }}
                  className="w-12 h-12 rounded-full bg-gradient-to-tr from-emerald-600 to-emerald-400 border border-emerald-300 shadow-[0_0_15px_rgba(52,211,153,0.5)] flex items-center justify-center transition-transform duration-75"
                >
                  <div className="w-3.5 h-3.5 rounded-full bg-white/40"></div>
                </div>
              </div>
              <div className="text-xs font-mono font-bold text-emerald-400">
                {rcThrottle || 1500} µs ({throttlePct > 0 ? `+${throttlePct}% Tiến` : throttlePct < 0 ? `${throttlePct}% Lùi` : '0%'})
              </div>
            </div>

            {/* Gimbal Phải: Steering / Hướng Lái Kênh 1 */}
            <div className="flex flex-col items-center space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1">
                Kênh 1 (Hướng Lái)
              </span>
              <div className="relative w-32 h-32 rounded-full border-2 border-cyan-500/30 bg-black/70 flex items-center justify-center shadow-[inset_0_0_20px_rgba(0,240,255,0.15)]">
                <div className="absolute inset-x-0 h-[1px] bg-cyan-500/20"></div>
                <div className="absolute inset-y-0 w-[1px] bg-cyan-500/20"></div>

                {/* Animated Gimbal Stick */}
                <div
                  style={{
                    transform: `translate3d(${steerOffsetX}px, 0, 0)`,
                  }}
                  className="w-12 h-12 rounded-full bg-gradient-to-tr from-cyan-600 to-cyan-400 border border-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.5)] flex items-center justify-center transition-transform duration-75"
                >
                  <div className="w-3.5 h-3.5 rounded-full bg-white/40"></div>
                </div>
              </div>
              <div className="text-xs font-mono font-bold text-cyan-400">
                {rcSteer || 1500} µs ({steerPct > 0 ? `+${steerPct}% Phải` : steerPct < 0 ? `${steerPct}% Trái` : '0%'})
              </div>
            </div>
          </div>

          {/* Cụm Thông Tin Trạng Thái & Khóa An Toàn Web */}
          <div className="flex-1 w-full space-y-3 bg-black/30 p-4 rounded-xl border border-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className={`w-3 h-3 rounded-full ${isRcMode ? 'bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse' : 'bg-gray-500'}`}></span>
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-white">
                  {isRcMode ? 'Tay Cầm MC6C Đang Nắm Quyền' : 'Chờ Gạt Công Tắc S.BUS (CH6)'}
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                100kbps S.BUS
              </span>
            </div>

            {/* Thông báo khóa an toàn */}
            <div className={`p-3 rounded-xl border text-xs font-mono leading-relaxed ${
              isRcMode
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-white/5 border-white/10 text-gray-400'
            }`}>
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <Lock className="w-3.5 h-3.5" />
                <span>{isRcMode ? 'Khóa an toàn Web: ĐANG BẬT' : 'Sẵn sàng chuyển đổi'}</span>
              </div>
              <p className="text-[11px] opacity-90">
                {isRcMode
                  ? 'Xe đang nhận lệnh trực tiếp từ tay điều khiển MC6C. Toàn bộ thao tác chuột/phím trên web tạm thời ngắt để nhường quyền ưu tiên tuyệt đối cho phần cứng.'
                  : 'Gạt công tắc kênh 6 (CH6 > 1600µs) trên tay điều khiển MC6C để kích hoạt chế độ lái tay cầm phần cứng.'}
              </p>
            </div>

            {/* Matrix thông số các kênh */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
              <div className="bg-black/40 p-2 rounded-lg border border-white/5">
                <span className="text-gray-500 block text-[9px]">KÊNH 1 (LÁI)</span>
                <span className="text-cyan-300 font-bold">{rcSteer || 1500} µs</span>
              </div>
              <div className="bg-black/40 p-2 rounded-lg border border-white/5">
                <span className="text-gray-500 block text-[9px]">KÊNH 3 (TIẾN / LÙI)</span>
                <span className="text-emerald-300 font-bold">{rcThrottle || 1500} µs</span>
              </div>
              <div className="bg-black/40 p-2 rounded-lg border border-white/5">
                <span className="text-gray-500 block text-[9px]">CÔNG TẮC CH6</span>
                <span className={isRcMode ? 'text-emerald-400 font-bold' : 'text-gray-400'}>
                  {isRcMode ? 'BẬT (>1600)' : 'TẮT (<1500)'}
                </span>
              </div>
              <div className="bg-black/40 p-2 rounded-lg border border-white/5">
                <span className="text-gray-500 block text-[9px]">FAILSAFE</span>
                <span className="text-emerald-400 font-bold">AN TOÀN</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* GIAO DIỆN JOYSTICK ẢO & BÀN PHÍM WASD */
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Virtual Joystick Component */}
          <div className="flex flex-col items-center space-y-2">
            <div 
              ref={containerRef}
              onMouseDown={handleStart}
              onTouchStart={handleStart}
              className="relative w-40 h-40 rounded-full border border-cyber-neonBlue/20 bg-black/60 flex items-center justify-center cursor-grab active:cursor-grabbing shadow-[inset_0_0_20px_rgba(0,240,255,0.05)]"
            >
              <div className="absolute inset-x-0 h-[1px] bg-cyber-neonBlue/10 pointer-events-none"></div>
              <div className="absolute inset-y-0 w-[1px] bg-cyber-neonBlue/10 pointer-events-none"></div>
              
              <div 
                ref={handleRef}
                style={{
                  transform: `translate3d(${coords.x}px, ${coords.y}px, 0)`
                }}
                className="w-14 h-14 rounded-full bg-gradient-to-tr from-cyber-neonBlue/80 to-blue-500 border border-cyber-neonBlue shadow-[0_0_15px_rgba(0,240,255,0.4)] flex items-center justify-center pointer-events-none transition-all ease-out duration-75"
              >
                <div className="w-4 h-4 rounded-full bg-white/30"></div>
              </div>
            </div>

            <div className="text-[10px] font-mono text-gray-400 mt-1">
              X: {(currentCommand.current.x).toFixed(2)} | Y: {(currentCommand.current.y).toFixed(2)}
            </div>
          </div>

          {/* Keyboard WASD & Controls Section */}
          <div className="flex-1 w-full space-y-4">
            {/* Speed Limit Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">Giới hạn tốc độ</span>
                <span className="text-xs font-bold text-cyber-neonBlue font-mono">{speedLimit}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={speedLimit}
                onChange={(e) => setSpeedLimit(Number(e.target.value))}
                className="w-full h-1.5 bg-black/50 rounded-lg appearance-none cursor-pointer accent-cyber-neonBlue border border-white/5"
              />
            </div>

            {/* Keyboard Helper Matrix & Clickable Buttons */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block text-center">
                Nút bấm điều khiển (Nhấp chuột hoặc phím W-A-S-D)
              </span>
              <div className="grid grid-cols-3 gap-2 w-48 mx-auto font-mono text-xs select-none">
                <div></div>
                <button
                  tabIndex={-1}
                  onMouseDown={(e) => { e.preventDefault(); updateCommand(0, 1); }}
                  onMouseUp={(e) => { e.preventDefault(); updateCommand(0, 0); }}
                  onMouseLeave={(e) => { e.preventDefault(); updateCommand(0, 0); }}
                  onTouchStart={(e) => { e.preventDefault(); updateCommand(0, 1); }}
                  onTouchEnd={(e) => { e.preventDefault(); updateCommand(0, 0); }}
                  className={`p-2.5 border rounded-xl flex items-center justify-center space-x-1 cursor-pointer transition-all active:scale-95 ${
                    activeKeys.w ? 'bg-cyber-neonGreen border-white text-black font-bold shadow-[0_0_15px_#39ff14]' : 'border-white/15 bg-white/5 text-gray-300 hover:border-cyber-neonBlue/50'
                  }`}
                  title="Tiến lên (Phím W / Mũi tên lên)"
                >
                  <span className="font-bold">W</span>
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <div></div>
                <button
                  tabIndex={-1}
                  onMouseDown={(e) => { e.preventDefault(); updateCommand(-1, 0); }}
                  onMouseUp={(e) => { e.preventDefault(); updateCommand(0, 0); }}
                  onMouseLeave={(e) => { e.preventDefault(); updateCommand(0, 0); }}
                  onTouchStart={(e) => { e.preventDefault(); updateCommand(-1, 0); }}
                  onTouchEnd={(e) => { e.preventDefault(); updateCommand(0, 0); }}
                  className={`p-2.5 border rounded-xl flex items-center justify-center space-x-1 cursor-pointer transition-all active:scale-95 ${
                    activeKeys.a ? 'bg-cyber-neonGreen border-white text-black font-bold shadow-[0_0_15px_#39ff14]' : 'border-white/15 bg-white/5 text-gray-300 hover:border-cyber-neonBlue/50'
                  }`}
                  title="Xoay Trái (Phím A / Mũi tên trái)"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="font-bold">A</span>
                </button>
                <button
                  tabIndex={-1}
                  onMouseDown={(e) => { e.preventDefault(); updateCommand(0, -1); }}
                  onMouseUp={(e) => { e.preventDefault(); updateCommand(0, 0); }}
                  onMouseLeave={(e) => { e.preventDefault(); updateCommand(0, 0); }}
                  onTouchStart={(e) => { e.preventDefault(); updateCommand(0, -1); }}
                  onTouchEnd={(e) => { e.preventDefault(); updateCommand(0, 0); }}
                  className={`p-2.5 border rounded-xl flex items-center justify-center space-x-1 cursor-pointer transition-all active:scale-95 ${
                    activeKeys.s ? 'bg-cyber-neonGreen border-white text-black font-bold shadow-[0_0_15px_#39ff14]' : 'border-white/15 bg-white/5 text-gray-300 hover:border-cyber-neonBlue/50'
                  }`}
                  title="Lùi (Phím S / Mũi tên xuống)"
                >
                  <span className="font-bold">S</span>
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  tabIndex={-1}
                  onMouseDown={(e) => { e.preventDefault(); updateCommand(1, 0); }}
                  onMouseUp={(e) => { e.preventDefault(); updateCommand(0, 0); }}
                  onMouseLeave={(e) => { e.preventDefault(); updateCommand(0, 0); }}
                  onTouchStart={(e) => { e.preventDefault(); updateCommand(1, 0); }}
                  onTouchEnd={(e) => { e.preventDefault(); updateCommand(0, 0); }}
                  className={`p-2.5 border rounded-xl flex items-center justify-center space-x-1 cursor-pointer transition-all active:scale-95 ${
                    activeKeys.d ? 'bg-cyber-neonGreen border-white text-black font-bold shadow-[0_0_15px_#39ff14]' : 'border-white/15 bg-white/5 text-gray-300 hover:border-cyber-neonBlue/50'
                  }`}
                  title="Xoay Phải (Phím D / Mũi tên phải)"
                >
                  <span className="font-bold">D</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Gamepad connection status */}
            {gamepadName && (
              <div className="flex items-center space-x-2 bg-cyber-neonGreen/10 border border-cyber-neonGreen/20 px-3 py-1.5 rounded-lg text-cyber-neonGreen text-[10px] font-mono leading-tight">
                <Shield className="w-3.5 h-3.5 flex-shrink-0" />
                <div>
                  <span className="font-bold">Đã nhận tay điều khiển:</span>
                  <div className="text-gray-300 truncate max-w-[200px]" title={gamepadName}>
                    {gamepadName}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
