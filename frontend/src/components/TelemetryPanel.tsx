import { Battery, Wifi, Flame, ShieldAlert, Cpu } from 'lucide-react';
import type { TelemetryData } from '../types/control';

interface TelemetryPanelProps {
  data: TelemetryData;
  isOnline: boolean;
}

export const TelemetryPanel = ({ data, isOnline }: TelemetryPanelProps) => {
  // Helpers to get RSSI status
  const getWifiStatus = (rssi: number) => {
    if (rssi >= -50) return { label: 'Tuyệt vời', color: 'text-cyber-neonGreen', bars: 4 };
    if (rssi >= -70) return { label: 'Tốt', color: 'text-cyber-neonGreen/80', bars: 3 };
    if (rssi >= -85) return { label: 'Trung bình', color: 'text-cyber-neonYellow', bars: 2 };
    return { label: 'Yếu', color: 'text-cyber-neonRed animate-pulse', bars: 1 };
  };

  // Helpers to get Battery status
  const getBatteryColor = (pct: number) => {
    if (pct >= 50) return 'bg-cyber-neonGreen';
    if (pct >= 20) return 'bg-cyber-neonYellow';
    return 'bg-cyber-neonRed animate-pulse-fast';
  };

  const wifiInfo = getWifiStatus(data.rssi);
  const isCriticalDistance = data.distance <= 20;
  const isWarningDistance = data.distance > 20 && data.distance <= 40;

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Battery Status Panel */}
      <div className="glass-panel rounded-xl p-4 flex flex-col justify-between border border-white/5 shadow-md">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Nguồn điện Pin</span>
          <Battery className={`w-4 h-4 ${data.batteryPercentage < 20 ? 'text-cyber-neonRed animate-pulse' : 'text-cyber-neonGreen'}`} />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline space-x-1.5">
            <span className="text-2xl font-bold font-mono tracking-tight text-white tabular-nums w-14 inline-block">
              {isOnline ? data.batteryPercentage.toFixed(0) : 0}%
            </span>
            <span className="text-xs text-gray-400 font-mono tabular-nums">
              ({isOnline ? data.batteryVoltage.toFixed(1) : '0.0'}V)
            </span>
          </div>
          <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden border border-white/5">
            <div
              style={{ width: `${isOnline ? data.batteryPercentage : 0}%` }}
              className={`h-full rounded-full transition-all duration-200 ease-linear ${getBatteryColor(isOnline ? data.batteryPercentage : 0)}`}
            ></div>
          </div>
        </div>
      </div>

      {/* WiFi RSSI Panel */}
      <div className="glass-panel rounded-xl p-4 flex flex-col justify-between border border-white/5 shadow-md">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Sóng WiFi Xe & Camera</span>
          <Wifi className={`w-4 h-4 ${wifiInfo.color}`} />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline space-x-1">
              <span className="text-xl font-bold font-mono tracking-tight text-white tabular-nums w-10 inline-block text-right">
                {isOnline ? data.rssi : -100}
              </span>
              <span className="text-[9px] uppercase text-gray-400 font-mono">dBm (Xe)</span>
            </div>
            <div className="flex items-baseline space-x-1">
              <span className="text-sm font-bold font-mono tracking-tight text-cyber-neonBlue tabular-nums w-8 inline-block text-right">
                {data.cameraRssi !== undefined && data.cameraRssi > -100 ? `${data.cameraRssi}` : '---'}
              </span>
              <span className="text-[9px] uppercase text-gray-400 font-mono">dBm (Cam)</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-semibold ${wifiInfo.color}`}>{isOnline ? wifiInfo.label : 'Ngoại tuyến'}</span>
            <div className="flex items-center space-x-2">
              {data.cameraFps !== undefined && (
                <span className="text-[10px] font-mono text-cyber-neonGreen font-semibold tabular-nums">
                  ⚡ {data.cameraFps} FPS
                </span>
              )}
              <div className="flex space-x-0.5 items-end h-3">
                {[1, 2, 3, 4].map((bar) => (
                  <div
                    key={bar}
                    style={{ height: `${bar * 25}%` }}
                    className={`w-1 rounded-sm ${isOnline && bar <= wifiInfo.bars
                        ? data.rssi < -85 ? 'bg-cyber-neonRed' : 'bg-cyber-neonGreen'
                        : 'bg-white/10'
                      }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Distance Sensor Panel */}
      <div className={`col-span-2 rounded-xl p-4 flex flex-col justify-between border shadow-md transition-all duration-300 ${isOnline && isCriticalDistance
          ? 'glass-panel-danger border-cyber-neonRed/40 animate-pulse-fast'
          : isOnline && isWarningDistance
            ? 'glass-panel border-cyber-neonYellow/40'
            : 'glass-panel border-white/5'
        }`}>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Cảm biến khoảng cách siêu âm</span>
          <ShieldAlert className={`w-4 h-4 ${isOnline && isCriticalDistance ? 'text-cyber-neonRed animate-bounce' : isOnline && isWarningDistance ? 'text-cyber-neonYellow' : 'text-cyber-neonBlue'
            }`} />
        </div>
        <div className="grid grid-cols-3 items-center gap-4">
          <div className="col-span-1 flex items-baseline">
            <span className="text-3xl font-bold font-mono tracking-tight text-white tabular-nums w-20 inline-block text-right">
              {isOnline ? data.distance.toFixed(1) : '---'}
            </span>
            <span className="text-xs text-gray-400 font-mono ml-1">cm</span>
          </div>
          <div className="col-span-2 space-y-1">
            <div className="w-full h-2.5 bg-black/50 rounded-full overflow-hidden border border-white/5 relative">
              <div
                style={{ width: `${isOnline ? Math.min(100, (data.distance / 150) * 100) : 0}%` }}
                className={`h-full rounded-full transition-all duration-200 ease-linear ${isCriticalDistance ? 'bg-cyber-neonRed' : isWarningDistance ? 'bg-cyber-neonYellow' : 'bg-cyber-neonBlue'
                  }`}
              ></div>
            </div>
            <div className="flex justify-between text-[8px] font-mono text-gray-500">
              <span>0cm</span>
              <span>Cảnh báo (40cm)</span>
              <span>150cm+</span>
            </div>
          </div>
        </div>
      </div>

      {/* Latency & Temperature Panel */}
      <div className="col-span-2 glass-panel rounded-xl p-3 flex justify-between items-center border border-white/5 text-xs text-gray-400 font-mono">
        <div className="flex items-center space-x-1.5">
          <Cpu className="w-3.5 h-3.5 text-cyber-neonBlue" />
          <span>Độ trễ RTT:</span>
          <span className={`font-bold tabular-nums w-12 inline-block ${isOnline && data.latency < 50 ? 'text-cyber-neonGreen' : isOnline && data.latency < 150 ? 'text-cyber-neonYellow' : 'text-cyber-neonRed'
            }`}>
            {isOnline ? `${data.latency}ms` : '---'}
          </span>
        </div>
        <div className="flex items-center space-x-1.5">
          <Flame className="w-3.5 h-3.5 text-cyber-neonYellow" />
          <span>Nhiệt độ xe:</span>
          <span className="font-bold text-white tabular-nums w-12 inline-block">
            {isOnline ? `${data.temperature.toFixed(1)}°C` : '---'}
          </span>
        </div>
      </div>
    </div>
  );
};
