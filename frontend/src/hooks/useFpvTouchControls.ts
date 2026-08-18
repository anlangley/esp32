import { useState, useRef, useCallback } from 'react';
import type { ControlCommand } from '../types/control';

interface UseFpvTouchControlsOptions {
  speedLimit: number;
  handleCommandChange: (cmd: ControlCommand) => void;
}

export function useFpvTouchControls({ speedLimit, handleCommandChange }: UseFpvTouchControlsOptions) {
  const [touchActive, setTouchActive] = useState({ up: false, down: false, left: false, right: false });
  const activeYRef = useRef(0);
  const activeXRef = useRef(0);

  const handleSplitTouch = useCallback((direction: 'up' | 'down' | 'left' | 'right', isPressed: boolean) => {
    setTouchActive(prev => {
      if (prev[direction] === isPressed) return prev;
      const next = { ...prev, [direction]: isPressed };
      const y = (next.up ? 1 : 0) - (next.down ? 1 : 0);
      const x = (next.right ? 1 : 0) - (next.left ? 1 : 0);

      if (activeYRef.current !== y || activeXRef.current !== x) {
        activeYRef.current = y;
        activeXRef.current = x;
        handleCommandChange({ x, y, speedLimit });
        if (isPressed && typeof window !== 'undefined' && window.navigator?.vibrate) {
          window.navigator.vibrate(8);
        }
      }
      return next;
    });
  }, [handleCommandChange, speedLimit]);

  const bindTouchEvents = useCallback((dir: 'up' | 'down' | 'left' | 'right') => ({
    onMouseDown: (e: React.MouseEvent) => { e.preventDefault(); handleSplitTouch(dir, true); },
    onMouseUp: (e: React.MouseEvent) => { e.preventDefault(); handleSplitTouch(dir, false); },
    onMouseLeave: (e: React.MouseEvent) => { e.preventDefault(); handleSplitTouch(dir, false); },
    onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); handleSplitTouch(dir, true); },
    onTouchEnd: (e: React.TouchEvent) => { e.preventDefault(); handleSplitTouch(dir, false); },
    onTouchCancel: (e: React.TouchEvent) => { e.preventDefault(); handleSplitTouch(dir, false); },
  }), [handleSplitTouch]);

  return {
    touchActive,
    bindTouchEvents,
  };
}
