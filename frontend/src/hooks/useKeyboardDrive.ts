import { useEffect, useRef } from 'react';
import type { ControlCommand } from '../types/control';

/**
 * Hook xử lý điều khiển xe bằng bàn phím (WASD + Arrow + Unikey).
 * Bao gồm 50ms continuous drive ticker khi giữ phím.
 * Tách từ App.tsx dòng 96-165.
 */
export function useKeyboardDrive(
  handleCommandChange: (cmd: ControlCommand) => void,
  speedLimit: number
) {
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

    const isNavigationKey = (e: KeyboardEvent) => {
      const k = e.key ? e.key.toLowerCase() : '';
      const c = e.code || '';
      return (
        ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'space', 'pageup', 'pagedown'].includes(k) ||
        ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c) ||
        ['w', 'a', 's', 'd', 'ư'].includes(k)
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (isNavigationKey(e)) {
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }

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

      if (isNavigationKey(e)) {
        e.preventDefault();
      }

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
    // handleCommandChange is stable (useCallback with []) so not needed in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speedLimit]);
}
