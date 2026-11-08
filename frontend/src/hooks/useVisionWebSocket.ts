import { useState, useEffect, useRef, useCallback } from 'react';

export interface BoundingBoxDetection {
  bbox: [number, number, number, number]; // [x, y, width, height]
  class_id: number;
  class_name: string;
  label: string;
  confidence: number;
}

export interface LaneTrackingData {
  detected: boolean;
  steering_offset: number; // -1.0 (left) to +1.0 (right)
  suggested_turn: 'LEFT' | 'RIGHT' | 'STRAIGHT';
  center_x: number;
  center_y?: number;
  confidence: number;
}

export interface CollisionRiskData {
  threat_level: 'SAFE' | 'WARNING' | 'CRITICAL';
  is_collision_warning: boolean;
  is_emergency_stop: boolean;
  threat_object: string | null;
  threat_ratio: number;
}

export interface VisionPayload {
  timestamp: number;
  frame_size: { width: number; height: number };
  camera_connected: boolean;
  camera_fps: number;
  inference_ms: number;
  detections: BoundingBoxDetection[];
  lane: LaneTrackingData;
  collision: CollisionRiskData;
}

export function useVisionWebSocket(visionHost = 'localhost:8000') {
  const [isEnabled, setIsEnabled] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [visionData, setVisionData] = useState<VisionPayload | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!isEnabled) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    try {
      const host = typeof window !== 'undefined' 
        ? `${window.location.hostname}:8000` 
        : visionHost;

      const wsUrl = `ws://${host}/ws/detections`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data: VisionPayload = JSON.parse(event.data);
          setVisionData(data);
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        if (isEnabled) {
          // Thử kết nối lại sau 2.5s nếu bị rớt
          reconnectTimeoutRef.current = setTimeout(connect, 2500);
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
      };
    } catch {
      setIsConnected(false);
    }
  }, [isEnabled, visionHost]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    isEnabled,
    setIsEnabled,
    isConnected,
    visionData,
    frameSize: visionData?.frame_size,
    detections: visionData?.detections || [],
    lane: visionData?.lane,
    collision: visionData?.collision,
    inferenceMs: visionData?.inference_ms || 0,
    cameraFps: visionData?.camera_fps || 0,
  };
}
