import { useState, useEffect } from 'react';
import type { CameraConfig, TelemetryData } from '../types/control';

/**
 * Hook đo ping camera để ước tính FPS và RSSI.
 * Tách từ App.tsx dòng 74-75, 257-293.
 */
export function useCameraPing(
  cameraConfig: CameraConfig,
  isDemoMode: boolean,
  setTelemetry: React.Dispatch<React.SetStateAction<TelemetryData>>
) {
  const [realFps, setRealFps] = useState(0);
  const [realCameraRssi, setRealCameraRssi] = useState(-100);

  // Measure Real Camera Ping & FPS
  useEffect(() => {
    if (!cameraConfig.ip || !cameraConfig.port || isDemoMode) return;

    let isMounted = true;
    const measurePing = () => {
      const img = new Image();
      const startTime = Date.now();

      const handleRes = () => {
        if (!isMounted) return;
        const latency = Date.now() - startTime;
        let calculatedRssi = -60;
        let estimatedFps = 30;

        if (latency > 400) { calculatedRssi = -88; estimatedFps = 12; }
        else if (latency > 150) { calculatedRssi = -72; estimatedFps = 20; }
        else if (latency > 80) { calculatedRssi = -62; estimatedFps = 24; }
        else { calculatedRssi = -48; estimatedFps = 30; }

        setRealCameraRssi(calculatedRssi);
        setRealFps(estimatedFps);
        setTelemetry(prev => ({ ...prev, cameraRssi: calculatedRssi, cameraFps: estimatedFps }));
      };

      img.onload = handleRes;
      img.onerror = handleRes;
      img.src = `http://${cameraConfig.ip}:${cameraConfig.port}/shot.jpg?t=${Date.now()}`;
    };

    measurePing();
    const interval = setInterval(measurePing, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cameraConfig, isDemoMode, setTelemetry]);

  return { realFps, realCameraRssi };
}
