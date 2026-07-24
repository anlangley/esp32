import { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Radio } from 'lucide-react';
import type { ControlCommand, KeyControls } from '../types/control';

interface JoystickControlProps {
  onCommandChange: (cmd: ControlCommand) => void;
  speedLimit: number;
  setSpeedLimit: (limit: number) => void;
}

export const JoystickControl = ({
  onCommandChange,
  speedLimit,
  setSpeedLimit,
}: JoystickControlProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 }); // Local joystick visual offset (-100 to 100)
  const [activeKeys, setActiveKeys] = useState<KeyControls>({ w: false, a: false, s: false, d: false });
  const [gamepadName, setGamepadName] = useState<string | null>(null);

  // Keep track of the current values to avoid excessive re-emission
  const currentCommand = useRef<ControlCommand>({ x: 0, y: 0, speedLimit });

  const updateCommand = useCallback((x: number, y: number) => {
    // Clamp to range -1.0 to 1.0
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));

    // Round to 2 decimal places to prevent micro-fluctuations
    const roundedX = Math.round(clampedX * 100) / 100;
    const roundedY = Math.round(clampedY * 100) / 100;

    if (
      currentCommand.current.x !== roundedX ||
      currentCommand.current.y !== roundedY ||
      currentCommand.current.speedLimit !== speedLimit
    ) {
      currentCommand.current = { x: roundedX, y: roundedY, speedLimit };
      onCommandChange(currentCommand.current);
    }
  }, [speedLimit, onCommandChange]);

  // Keyboard control handlers
  useEffect(() => {
    const matchKey = (e: KeyboardEvent, target: 'w' | 'a' | 's' | 'd') => {
      const k = e.key ? e.key.toLowerCase() : '';
      const c = e.code || '';

      if (target === 'w') {
        return c === 'KeyW' || c === 'ArrowUp' || k === 'w' || k === 'ư' || k === 'arrowup';
      }
      if (target === 'a') {
        return c === 'KeyA' || c === 'ArrowLeft' || k === 'a' || k === 'arrowleft';
      }
      if (target === 's') {
        return c === 'KeyS' || c === 'ArrowDown' || k === 's' || k === 'arrowdown';
      }
      if (target === 'd') {
        return c === 'KeyD' || c === 'ArrowRight' || k === 'd' || k === 'arrowright';
      }
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

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
          setCoords({ x: x * 60, y: -y * 60 });
        }
        return changed ? updated : prev;
      });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

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
          setCoords({ x: x * 60, y: -y * 60 });
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
  }, []);

  // Touch and Mouse dragging logic for visual joystick
  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let deltaX = clientX - centerX;
    let deltaY = clientY - centerY;

    const maxRadius = rect.width / 2 - 20; // Bound of the joystick movement
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > maxRadius) {
      deltaX = (deltaX / distance) * maxRadius;
      deltaY = (deltaY / distance) * maxRadius;
    }

    setCoords({ x: deltaX, y: deltaY });

    // Normalize coordinates: X is normal (-1 to 1), Y is inverted (up is positive for car movement)
    const normX = deltaX / maxRadius;
    const normY = -deltaY / maxRadius;

    updateCommand(normX, normY);
  }, [updateCommand]);

  const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    handleMove(clientX, clientY);
  };

  // Global mousemove/touchmove listener when dragging
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      handleMove(clientX, clientY);
    };

    const onEnd = () => {
      if (isDragging) {
        setIsDragging(false);
        setCoords({ x: 0, y: 0 });
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

  // HTML5 Gamepad API loop (To support physical RC transmitters like FlySky FS-i6 connected via USB simulator adapter)
  useEffect(() => {
    let animationFrameId: number;

    const pollGamepad = () => {
      const gamepads = navigator.getGamepads();
      // Find the first connected gamepad
      const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];

      if (gp) {
        setGamepadName(gp.id);
        // Standard gamepads usually map Left stick axes to axis 0 (X) and axis 1 (Y)
        // Or Right stick to axis 2 (X) and axis 3 (Y).
        // For FS-i6 USB simulator, channels map directly to axes. Let's read axes 0 and 1, or axes 2 and 3 if available.
        // We apply a small deadzone to prevent drift
        const deadzone = 0.08;
        let gpX = gp.axes[0];
        let gpY = -gp.axes[1]; // Invert Y as standard gamepad down is positive

        // Fallback to right stick if left stick is idle
        if (Math.abs(gpX) < deadzone && Math.abs(gpY) < deadzone && gp.axes[2] !== undefined) {
          gpX = gp.axes[2];
          gpY = -gp.axes[3];
        }

        const xVal = Math.abs(gpX) > deadzone ? gpX : 0;
        const yVal = Math.abs(gpY) > deadzone ? gpY : 0;

        // Visual feedback
        setCoords({ x: xVal * 60, y: -yVal * 60 });
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

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-6 border border-white/5 shadow-md">
      {/* Joystick Element */}
      <div className="flex flex-col items-center space-y-2">
        <span className="text-xs uppercase font-bold text-cyber-neonBlue tracking-wider flex items-center">
          <Radio className="w-4 h-4 mr-1.5 animate-pulse" /> Virtual Joystick & Gamepad
        </span>
        <div 
          ref={containerRef}
          onMouseDown={handleStart}
          onTouchStart={handleStart}
          className="relative w-40 h-40 rounded-full border border-cyber-neonBlue/20 bg-black/60 flex items-center justify-center cursor-grab active:cursor-grabbing shadow-[inset_0_0_20px_rgba(0,240,255,0.05)]"
        >
          {/* Axis Markings */}
          <div className="absolute inset-x-0 h-[1px] bg-cyber-neonBlue/10 pointer-events-none"></div>
          <div className="absolute inset-y-0 w-[1px] bg-cyber-neonBlue/10 pointer-events-none"></div>
          
          {/* Draggable Handle */}
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

      {/* Keyboard W-A-S-D Matrix & Speed Limit */}
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
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block text-center">Nút bấm điều khiển (Nhấp chuột hoặc phím W-A-S-D)</span>
          <div className="grid grid-cols-3 gap-2 w-48 mx-auto font-mono text-xs select-none">
            <div></div>
            <button
              onMouseDown={() => { setActiveKeys(prev => ({ ...prev, w: true })); updateCommand(0, 1); setCoords({ x: 0, y: -60 }); }}
              onMouseUp={() => { setActiveKeys(prev => ({ ...prev, w: false })); updateCommand(0, 0); setCoords({ x: 0, y: 0 }); }}
              onMouseLeave={() => { setActiveKeys(prev => ({ ...prev, w: false })); updateCommand(0, 0); setCoords({ x: 0, y: 0 }); }}
              onTouchStart={() => { setActiveKeys(prev => ({ ...prev, w: true })); updateCommand(0, 1); setCoords({ x: 0, y: -60 }); }}
              onTouchEnd={() => { setActiveKeys(prev => ({ ...prev, w: false })); updateCommand(0, 0); setCoords({ x: 0, y: 0 }); }}
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
              onMouseDown={() => { setActiveKeys(prev => ({ ...prev, a: true })); updateCommand(-1, 0); setCoords({ x: -60, y: 0 }); }}
              onMouseUp={() => { setActiveKeys(prev => ({ ...prev, a: false })); updateCommand(0, 0); setCoords({ x: 0, y: 0 }); }}
              onMouseLeave={() => { setActiveKeys(prev => ({ ...prev, a: false })); updateCommand(0, 0); setCoords({ x: 0, y: 0 }); }}
              onTouchStart={() => { setActiveKeys(prev => ({ ...prev, a: true })); updateCommand(-1, 0); setCoords({ x: -60, y: 0 }); }}
              onTouchEnd={() => { setActiveKeys(prev => ({ ...prev, a: false })); updateCommand(0, 0); setCoords({ x: 0, y: 0 }); }}
              className={`p-2.5 border rounded-xl flex items-center justify-center space-x-1 cursor-pointer transition-all active:scale-95 ${
                activeKeys.a ? 'bg-cyber-neonGreen border-white text-black font-bold shadow-[0_0_15px_#39ff14]' : 'border-white/15 bg-white/5 text-gray-300 hover:border-cyber-neonBlue/50'
              }`}
              title="Xoay Trái (Phím A / Mũi tên trái)"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="font-bold">A</span>
            </button>
            <button
              onMouseDown={() => { setActiveKeys(prev => ({ ...prev, s: true })); updateCommand(0, -1); setCoords({ x: 0, y: 60 }); }}
              onMouseUp={() => { setActiveKeys(prev => ({ ...prev, s: false })); updateCommand(0, 0); setCoords({ x: 0, y: 0 }); }}
              onMouseLeave={() => { setActiveKeys(prev => ({ ...prev, s: false })); updateCommand(0, 0); setCoords({ x: 0, y: 0 }); }}
              onTouchStart={() => { setActiveKeys(prev => ({ ...prev, s: true })); updateCommand(0, -1); setCoords({ x: 0, y: 60 }); }}
              onTouchEnd={() => { setActiveKeys(prev => ({ ...prev, s: false })); updateCommand(0, 0); setCoords({ x: 0, y: 0 }); }}
              className={`p-2.5 border rounded-xl flex items-center justify-center space-x-1 cursor-pointer transition-all active:scale-95 ${
                activeKeys.s ? 'bg-cyber-neonGreen border-white text-black font-bold shadow-[0_0_15px_#39ff14]' : 'border-white/15 bg-white/5 text-gray-300 hover:border-cyber-neonBlue/50'
              }`}
              title="Lùi (Phím S / Mũi tên xuống)"
            >
              <span className="font-bold">S</span>
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={() => { setActiveKeys(prev => ({ ...prev, d: true })); updateCommand(1, 0); setCoords({ x: 60, y: 0 }); }}
              onMouseUp={() => { setActiveKeys(prev => ({ ...prev, d: false })); updateCommand(0, 0); setCoords({ x: 0, y: 0 }); }}
              onMouseLeave={() => { setActiveKeys(prev => ({ ...prev, d: false })); updateCommand(0, 0); setCoords({ x: 0, y: 0 }); }}
              onTouchStart={() => { setActiveKeys(prev => ({ ...prev, d: true })); updateCommand(1, 0); setCoords({ x: 60, y: 0 }); }}
              onTouchEnd={() => { setActiveKeys(prev => ({ ...prev, d: false })); updateCommand(0, 0); setCoords({ x: 0, y: 0 }); }}
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
  );
};
