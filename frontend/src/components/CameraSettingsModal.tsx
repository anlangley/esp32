import { useState } from 'react';
import { Settings, X } from 'lucide-react';
import type { CameraConfig } from '../types/control';

interface CameraSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameraConfig: CameraConfig;
  onSave: (config: CameraConfig) => void;
}

/**
 * Modal cài đặt IP Camera (tách từ FPV view trong App.tsx dòng 57-59, 726-792).
 * State tempIp/tempPort/tempPath giờ là local state thay vì ở App level.
 */
export const CameraSettingsModal = ({ isOpen, onClose, cameraConfig, onSave }: CameraSettingsModalProps) => {
  const [tempIp, setTempIp] = useState(cameraConfig.ip);
  const [tempPort, setTempPort] = useState(cameraConfig.port);
  const [tempPath, setTempPath] = useState(cameraConfig.path);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn pointer-events-auto">
      <div className="w-full max-w-sm glass-panel p-5 rounded-2xl border border-white/10 flex flex-col space-y-3">
        <div className="flex justify-between items-center border-b border-white/10 pb-2">
          <h3 className="text-white font-mono font-bold text-sm uppercase flex items-center">
            <Settings className="w-4 h-4 mr-1.5 text-cyber-neonBlue" /> Cấu hình IP Camera
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...cameraConfig, ip: tempIp, port: tempPort, path: tempPath });
          onClose();
        }} className="space-y-2 font-mono text-xs">
          <div>
            <label className="text-gray-400 block mb-1">Địa chỉ IP Điện thoại:</label>
            <input
              type="text"
              value={tempIp}
              onChange={e => setTempIp(e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-cyber-neonBlue"
            />
          </div>

          <div>
            <label className="text-gray-400 block mb-1">Cổng Port:</label>
            <input
              type="text"
              value={tempPort}
              onChange={e => setTempPort(e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-cyber-neonBlue"
            />
          </div>

          <div>
            <label className="text-gray-400 block mb-1">Đường dẫn Path:</label>
            <input
              type="text"
              value={tempPath}
              onChange={e => setTempPath(e.target.value)}
              className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-cyber-neonBlue"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-white/5 text-gray-300 rounded-xl font-bold"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-cyber-neonBlue text-black rounded-xl font-bold"
            >
              Lưu cấu hình
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
