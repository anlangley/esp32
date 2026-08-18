import { useState, useRef, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { TelemetryData, ControlCommand, LogMessage } from '../types/control';

const INITIAL_TELEMETRY: TelemetryData = {
  batteryPercentage: 85,
  batteryVoltage: 11.8,
  distance: 120.0,
  temperature: 32.5,
  rssi: -62,
  speed: 0,
  latency: 15,
};

/**
 * Hook quản lý kết nối WebSocket và lệnh điều khiển xe.
 * Tách từ App.tsx dòng 36-37, 67, 71, 215-254, 296-301, 308-318.
 */
export function useCarWebSocket(addLog: (message: string, type?: LogMessage['type']) => void) {
  const [isOnline, setIsOnline] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryData>(INITIAL_TELEMETRY);
  const [currentDriveCmd, setCurrentDriveCmd] = useState<ControlCommand>({ x: 0, y: 0, speedLimit: 80 });
  const socketRef = useRef<Socket | null>(null);

  // Initial WebSocket Connection
  useEffect(() => {
    addLog('Khởi tạo giao diện điều khiển...', 'info');
    const backendHost = window.location.hostname || 'localhost';
    addLog(`Đang kết nối đến máy chủ Node.js (${backendHost}:3000)...`, 'info');

    const socket = io(`http://${backendHost}:3000`, {
      query: { role: 'frontend' }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      addLog('Đã kết nối với máy chủ WebSocket (Port 3000) thành công.', 'success');
    });

    socket.on('disconnect', () => {
      addLog('Mất kết nối với máy chủ WebSocket!', 'error');
      setIsOnline(false);
    });

    socket.on('device_status', (status: { online: boolean }) => {
      setIsOnline(status.online);
      if (status.online) {
        addLog('Xe ô tô IoT đã Trực Tuyến (Online) và sẵn sàng nhận lệnh.', 'success');
      } else {
        addLog('Xe ô tô IoT đang Ngoại Tuyến (Offline). Đang chờ kết nối từ xe...', 'warning');
      }
    });

    socket.on('telemetry_data', (data: TelemetryData) => {
      setTelemetry(data);
    });

    socket.on('system_warning', (warningMsg: string) => {
      addLog(`[CẢNH BÁO] ${warningMsg}`, 'warning');
    });

    // Đồng bộ lệnh lái từ AI Agent tới Web Frontend (xe ảo 2D DEMO & Joystick Visual)
    socket.on('drive_command', (cmd: ControlCommand) => {
      if (cmd.y !== 0 || cmd.x !== 0) {
        addLog(`🚗 AI Agent đang lái xe: Tiến/Lùi y=${cmd.y}, Xoay x=${cmd.x} (${cmd.speedLimit}%)`, 'info');
      }
      setCurrentDriveCmd(cmd);
    });

    return () => {
      socket.disconnect();
    };
    // addLog is stable (useCallback with []) so safe to include
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog]);

  // Handle Command Driving updates
  const handleCommandChange = useCallback((cmd: ControlCommand) => {
    setCurrentDriveCmd(cmd);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('drive_command', cmd);
    }
  }, []);

  // Toggle WebSocket connection on/off
  const toggleConnection = useCallback(() => {
    if (socketRef.current) {
      if (socketRef.current.connected) {
        socketRef.current.disconnect();
        addLog('Đã chủ động ngắt kết nối với máy chủ.', 'warning');
      } else {
        socketRef.current.connect();
        addLog('Đang kết nối lại với máy chủ...', 'info');
      }
    }
  }, [addLog]);

  const [isFollowMode, setIsFollowMode] = useState(false);

  // Toggle Follow Mode
  const toggleFollowMode = useCallback((enabled?: boolean) => {
    setIsFollowMode(prev => {
      const nextState = enabled !== undefined ? enabled : !prev;
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('follow_mode', { enabled: nextState });
        addLog(`Chế độ bám theo vật thể (Follow Mode): ${nextState ? 'BẬT (60Hz Ultrasonic)' : 'TẮT'}`, nextState ? 'success' : 'warning');
      }
      return nextState;
    });
  }, [addLog]);

  return {
    isOnline,
    telemetry,
    setTelemetry,
    currentDriveCmd,
    handleCommandChange,
    toggleConnection,
    isFollowMode,
    toggleFollowMode,
    socketRef,
  };
}

