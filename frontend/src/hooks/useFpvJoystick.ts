import { useState, useRef, useEffect, useCallback } from 'react';
import type { ControlCommand } from '../types/control';

/**
 * Hook xử lý FPV Touch Joystick trên mobile.
 * Bao gồm drag handling, coordinate normalization, và clamping.
 * Tách từ App.tsx dòng 68-70, 338-407.
 */
export function useFpvJoystick(
  handleCommandChange: (cmd: ControlCommand) => void,
  speedLimit: number
) {
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [joystickCoords, setJoystickCoords] = useState({ x: 0, y: 0 });

  // Floating Touch Joystick handler for Mobile View
  const updateMobileCommand = useCallback((x: number, y: number) => {
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));
    const roundedX = Math.round(clampedX * 100) / 100;
    const roundedY = Math.round(clampedY * 100) / 100;

    handleCommandChange({ x: roundedX, y: roundedY, speedLimit });
    // handleCommandChange is stable (useCallback with [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleJoystickStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    handleJoystickMove(clientX, clientY);
  }, [handleJoystickMove]);

  // Global drag event listeners (mousemove, touchmove, mouseup, touchend)
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

  return { isDragging, joystickCoords, joystickRef, handleJoystickStart };
}
