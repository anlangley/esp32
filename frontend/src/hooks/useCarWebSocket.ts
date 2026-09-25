import { useState, useRef, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { TelemetryData, ControlCommand, LogMessage } from '../types/control';
import { getToken, type Vehicle } from '../services/authService';

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
 * Tách biệt điều khiển xe thật phần cứng và xe demo buồng lái ảo (CAR-A1B2C3).
 */
export function useCarWebSocket(
  addLog: (message: string, type?: LogMessage['type']) => void,
  activeVehicle?: Vehicle | null
) {
  const [realCarOnline, setRealCarOnline] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryData>(INITIAL_TELEMETRY);
  const [currentDriveCmd, setCurrentDriveCmd] = useState<ControlCommand>({ x: 0, y: 0, speedLimit: 80 });
  const socketRef = useRef<Socket | null>(null);
  const activeVehicleRef = useRef<Vehicle | null | undefined>(activeVehicle);

  useEffect(() => {
    activeVehicleRef.current = activeVehicle;
  }, [activeVehicle]);

  // Nếu đang ở xe Demo CAR-A1B2C3: Trạng thái buồng lái ảo luôn sẵn sàng
  // Nếu đang ở xe thật: Phản ánh trạng thái thực của phần cứng ESP32
  const isOnline = activeVehicle?.vehicleCode === 'CAR-A1B2C3' ? true : realCarOnline;

  // Throttling mechanism refs
  const lastUpdateRef = useRef<number>(0);
  const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestTelemetryRef = useRef<TelemetryData | null>(null);

  // Initial WebSocket Connection
  useEffect(() => {
    addLog('Khởi tạo giao diện điều khiển...', 'info');
    const backendHost = window.location.hostname || 'localhost';
    addLog(`Đang kết nối đến máy chủ Node.js (${backendHost}:3000)...`, 'info');

    const token = getToken();
    const socket = io(`http://${backendHost}:3000`, {
      query: { role: 'frontend' },
      auth: { token: token || '' },
    });
    socketRef.current = socket;

    socket.on('connect_error', (err) => {
      if (err.message === 'AUTH_REQUIRED' || err.message === 'INVALID_TOKEN') {
        addLog(`[LỖI AUTH] Từ chối kết nối Socket: ${err.message}. Hãy đăng nhập lại.`, 'error');
      } else {
        addLog(`[LỖI KẾT NỐI] ${err.message}`, 'error');
      }
    });

    socket.on('connect', () => {
      addLog('Đã kết nối với máy chủ WebSocket (Port 3000) thành công.', 'success');
    });

    socket.on('disconnect', () => {
      addLog('Mất kết nối với máy chủ WebSocket!', 'error');
      setRealCarOnline(false);
    });

    socket.on('device_status', (status: { online: boolean; vehicleCode?: string }) => {
      setRealCarOnline(status.online);
      const code = status.vehicleCode || activeVehicleRef.current?.vehicleCode || 'Xe IoT';
      if (status.online) {
        addLog(`Xe ô tô IoT [${code}] đã Trực Tuyến (Online) và sẵn sàng nhận lệnh.`, 'success');
      } else {
        addLog(`Xe ô tô IoT [${code}] đang Ngoại Tuyến (Offline). Đang chờ kết nối từ xe...`, 'warning');
      }
    });

    // Throttled Telemetry Update (Anti-Stutter) - Giới hạn Render 5Hz (200ms)
    socket.on('telemetry_data', (data: TelemetryData) => {
      latestTelemetryRef.current = data;
      
      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateRef.current;
      const throttleLimit = 200; // Cập nhật tối đa 5 lần / giây

      if (timeSinceLastUpdate >= throttleLimit) {
        // Nếu đã qua khoảng thời gian chờ, cập nhật ngay lập tức
        setTelemetry(data);
        lastUpdateRef.current = now;
        if (throttleTimeoutRef.current) {
          clearTimeout(throttleTimeoutRef.current);
          throttleTimeoutRef.current = null;
        }
      } else if (!throttleTimeoutRef.current) {
        // Nếu chưa tới thời gian, hẹn giờ cho lần tới
        throttleTimeoutRef.current = setTimeout(() => {
          if (latestTelemetryRef.current) {
            setTelemetry(latestTelemetryRef.current);
            lastUpdateRef.current = Date.now();
          }
          throttleTimeoutRef.current = null;
        }, throttleLimit - timeSinceLastUpdate);
      }
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
      if (throttleTimeoutRef.current) clearTimeout(throttleTimeoutRef.current);
      socket.disconnect();
    };
    // addLog is stable (useCallback with []) so safe to include
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog]);

  // Handle Command Driving updates
  const handleCommandChange = useCallback((cmd: ControlCommand) => {
    setCurrentDriveCmd(cmd);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('drive_command', {
        ...cmd,
        vehicleCode: activeVehicleRef.current?.vehicleCode || 'CAR-A1B2C3',
      });
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
        socketRef.current.emit('follow_mode', {
          enabled: nextState,
          vehicleCode: activeVehicleRef.current?.vehicleCode || '',
        });
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

