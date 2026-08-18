import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Radio } from 'lucide-react';

interface FpvDriveControlsProps {
  controlStyle: 'split' | 'joystick';
  touchActive: { up: boolean; down: boolean; left: boolean; right: boolean };
  bindTouchEvents: (dir: 'up' | 'down' | 'left' | 'right') => any;
  isDragging: boolean;
  joystickCoords: { x: number; y: number };
  joystickRef: React.RefObject<HTMLDivElement | null>;
  handleJoystickStart: (e: React.MouseEvent | React.TouchEvent) => void;
}

export function FpvDriveControls({
  controlStyle,
  touchActive,
  bindTouchEvents,
  isDragging,
  joystickCoords,
  joystickRef,
  handleJoystickStart,
}: FpvDriveControlsProps) {
  return (
    <div className="relative z-10 p-4 sm:p-6 flex items-end justify-between pointer-events-none">
      {controlStyle === 'split' ? (
        <>
          {/* TRAI: D-PAD TIEN / LUI */}
          <div className="pointer-events-auto flex flex-col space-y-3">
            <button
              {...bindTouchEvents('up')}
              className={`w-16 h-16 sm:w-18 sm:h-18 rounded-2xl border flex flex-col items-center justify-center transition-all duration-75 select-none touch-none active:scale-95 shadow-lg backdrop-blur-md ${
                touchActive.up
                  ? 'bg-cyber-neonGreen/90 border-white text-black font-black shadow-[0_0_20px_#39ff14] scale-105'
                  : 'bg-black/35 border-white/25 text-white hover:bg-black/50 hover:border-cyber-neonGreen/60'
              }`}
            >
              <ArrowUp className="w-6 h-6 sm:w-7 sm:h-7 pointer-events-none" />
              <span className="text-[10px] font-extrabold uppercase font-mono leading-none mt-0.5 pointer-events-none">TIẾN</span>
            </button>

            <button
              {...bindTouchEvents('down')}
              className={`w-16 h-16 sm:w-18 sm:h-18 rounded-2xl border flex flex-col items-center justify-center transition-all duration-75 select-none touch-none active:scale-95 shadow-lg backdrop-blur-md ${
                touchActive.down
                  ? 'bg-cyber-neonPink/90 border-white text-white font-black shadow-[0_0_20px_#ff007f] scale-105'
                  : 'bg-black/35 border-white/25 text-white hover:bg-black/50 hover:border-cyber-neonPink/60'
              }`}
            >
              <ArrowDown className="w-6 h-6 sm:w-7 sm:h-7 pointer-events-none" />
              <span className="text-[10px] font-extrabold uppercase font-mono leading-none mt-0.5 pointer-events-none">LÙI</span>
            </button>
          </div>

          {/* PHAI: D-PAD TRAI / PHAI */}
          <div className="pointer-events-auto flex flex-col space-y-3 items-end">
            <div className="flex space-x-3">
              <button
                {...bindTouchEvents('left')}
                className={`w-16 h-16 sm:w-18 sm:h-18 rounded-2xl border flex flex-col items-center justify-center transition-all duration-75 select-none touch-none active:scale-95 shadow-lg backdrop-blur-md ${
                  touchActive.left
                    ? 'bg-cyber-neonBlue/90 border-white text-black font-black shadow-[0_0_20px_#00f0ff] scale-105'
                    : 'bg-black/35 border-white/25 text-white hover:bg-black/50 hover:border-cyber-neonBlue/60'
                }`}
              >
                <ArrowLeft className="w-6 h-6 sm:w-7 sm:h-7 pointer-events-none" />
                <span className="text-[10px] font-extrabold uppercase font-mono leading-none mt-0.5 pointer-events-none">TRÁI</span>
              </button>

              <button
                {...bindTouchEvents('right')}
                className={`w-16 h-16 sm:w-18 sm:h-18 rounded-2xl border flex flex-col items-center justify-center transition-all duration-75 select-none touch-none active:scale-95 shadow-lg backdrop-blur-md ${
                  touchActive.right
                    ? 'bg-cyber-neonBlue/90 border-white text-black font-black shadow-[0_0_20px_#00f0ff] scale-105'
                    : 'bg-black/35 border-white/25 text-white hover:bg-black/50 hover:border-cyber-neonBlue/60'
                }`}
              >
                <ArrowRight className="w-6 h-6 sm:w-7 sm:h-7 pointer-events-none" />
                <span className="text-[10px] font-extrabold uppercase font-mono leading-none mt-0.5 pointer-events-none">PHẢI</span>
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* JOYSTICK 360° MODE */}
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
              <div className="absolute inset-4 rounded-full border border-white/10 pointer-events-none" />
              <div className="absolute w-full h-[1px] bg-white/10 pointer-events-none" />
              <div className="absolute h-full w-[1px] bg-white/10 pointer-events-none" />

              <div
                style={{ transform: `translate(${joystickCoords.x}px, ${joystickCoords.y}px)` }}
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 transition-transform duration-75 flex items-center justify-center shadow-xl ${
                  isDragging
                    ? 'bg-cyber-neonGreen border-white text-black shadow-[0_0_25px_#39ff14] scale-110 opacity-100'
                    : 'bg-white/10 border-white/20 text-transparent opacity-0 shadow-none'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white/80" />
              </div>
            </div>
          </div>

          <div className="pointer-events-auto font-mono text-[10px] text-gray-400 space-y-1 bg-black/50 p-2.5 rounded-2xl border border-white/10 backdrop-blur-md max-w-[200px] hidden sm:block">
            <div className="flex items-center space-x-1">
              <Radio className="w-3 h-3 text-cyber-neonGreen animate-pulse" />
              <span className="text-white font-bold">FPV JOYSTICK 360°</span>
            </div>
            <div>Chạm gạt trực tiếp trên hình để lái.</div>
          </div>
        </>
      )}
    </div>
  );
}
