import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, X, Copy, Check, Smartphone, Wifi } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QRCodeModal = ({ isOpen, onClose }: QRCodeModalProps) => {
  const [copied, setCopied] = useState(false);
  const [customIp, setCustomIp] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [detectedIp, setDetectedIp] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      const hostname = window.location.hostname;
      const port = window.location.port ? `:${window.location.port}` : ':5173';
      const protocol = window.location.protocol;

      let defaultUrl = `${protocol}//${hostname}${port}`;
      setCurrentUrl(defaultUrl);

      // Auto-fetch real LAN Wi-Fi IP from Backend Node.js server!
      const backendHost = hostname || 'localhost';
      fetch(`http://${backendHost}:3000/api/network-ip`)
        .then(res => res.json())
        .then(data => {
          if (data && data.url) {
            setCurrentUrl(data.url);
            setDetectedIp(data.ip);
          }
        })
        .catch(err => {
          console.log('[QR] Backend IP fetch notice:', err);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const targetUrl = customIp
    ? `http://${customIp.replace(/^https?:\/\//, '')}:${window.location.port || '5173'}`
    : currentUrl;

  const handleCopy = () => {
    navigator.clipboard.writeText(targetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md max-h-[95vh] overflow-y-auto glass-panel-neon p-6 rounded-2xl border border-cyber-neonBlue/30 shadow-[0_0_30px_rgba(0,240,255,0.15)] flex flex-col space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center pb-3 border-b border-white/10">
          <div className="flex items-center space-x-2 text-cyber-neonBlue font-bold text-base uppercase tracking-wider">
            <QrCode className="w-5 h-5 text-cyber-neonBlue" />
            <span>Mở Cockpit trên Điện thoại</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info notice */}
        <div className="flex items-start space-x-2 text-xs text-cyber-neonGreen bg-cyber-neonGreen/10 border border-cyber-neonGreen/20 p-2.5 rounded-xl font-mono">
          <Wifi className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Đảm bảo điện thoại & máy tính kết nối <strong>cùng mạng Wi-Fi</strong>.</span>
        </div>

        {/* QR Code Canvas */}
        <div className="flex flex-col items-center justify-center p-5 bg-white rounded-2xl shadow-inner border border-white/20">
          <QRCodeSVG
            value={targetUrl}
            size={200}
            level="H"
            includeMargin={true}
          />
          <div className="mt-3 flex items-center space-x-1 text-[11px] text-gray-600 font-mono">
            <Smartphone className="w-3.5 h-3.5" />
            <span>Quét bằng ứng dụng Camera hoặc Zalo</span>
          </div>
        </div>

        {/* URL Display & Input */}
        <div className="space-y-2">
          <label className="text-[11px] text-gray-400 font-mono flex justify-between items-center">
            <span>Đường dẫn truy cập mạng Wi-Fi:</span>
            {detectedIp ? (
              <span className="text-cyber-neonGreen font-bold">📡 IP: {detectedIp}</span>
            ) : (
              <span className="text-cyber-neonYellow">Tự động nhận diện Network IP</span>
            )}
          </label>

          <div className="flex items-center space-x-2">
            <div className="flex-1 bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-cyber-neonBlue font-mono truncate">
              {targetUrl}
            </div>
            <button
              onClick={handleCopy}
              className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white transition-colors flex items-center justify-center min-w-[38px]"
              title="Sao chép đường dẫn"
            >
              {copied ? <Check className="w-4 h-4 text-cyber-neonGreen" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          {/* Quick IP Override helper */}
          <div className="pt-1">
            <input
              type="text"
              placeholder="Tùy chỉnh IP khác (Ví dụ: 192.168.1.15)"
              value={customIp}
              onChange={(e) => setCustomIp(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-gray-500 font-mono focus:outline-none focus:border-cyber-neonBlue"
            />
          </div>
        </div>

        {/* Instructions */}
        <div className="text-[11px] text-gray-400 space-y-1 bg-white/[0.02] p-3 rounded-xl border border-white/5">
          <p className="font-bold text-gray-300">Hướng dẫn kết nối nhanh:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Mở ứng dụng Camera trên iPhone/Android.</li>
            <li>Quét mã QR ở trên để mở ngay giao diện điều khiển.</li>
            <li>Nhấn nút <strong>"Thêm vào Màn hình chính"</strong> để dùng như App!</li>
          </ol>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-cyber-neonBlue/10 hover:bg-cyber-neonBlue/20 border border-cyber-neonBlue/40 rounded-xl text-cyber-neonBlue font-bold text-xs transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
