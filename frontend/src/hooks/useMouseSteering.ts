import { useState, useEffect } from 'react';
import type { ControlCommand } from '../types/control';

/**
 * Hook xử lý chế độ lái bằng chuột (Mouse Steering).
 * Bao gồm phím tắt '1' để bật/tắt và global mousemove listener.
 * Tách từ App.tsx dòng 79, 82-94, 167-196.
 */
export function useMouseSteering(
  handleCommandChange: (cmd: ControlCommand) => void,
  speedLimit: number
) {
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
    // handleCommandChange is stable (useCallback with []) so safe pattern
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMouseSteerActive, speedLimit]);

  return { isMouseSteerActive, setIsMouseSteerActive };
}
