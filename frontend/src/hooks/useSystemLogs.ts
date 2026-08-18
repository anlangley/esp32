import { useState, useRef, useCallback } from 'react';
import type { LogMessage } from '../types/control';

/**
 * Hook quản lý nhật ký hệ thống (System Logs).
 * Tách từ App.tsx dòng 39, 66, 199-212.
 */
export function useSystemLogs() {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Đã loại bỏ scrollIntoView() để ngăn trang web tự động cuộn xuống dưới khi có log mới


  // Helper to add system logs
  const addLog = useCallback((message: string, type: LogMessage['type'] = 'info') => {
    const newLog: LogMessage = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    setLogs(prev => [newLog, ...prev].slice(0, 30));
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, addLog, clearLogs, terminalEndRef };
}
