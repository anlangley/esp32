import { useState, useEffect, useRef, useCallback } from 'react';

export interface BoundingBoxDetection {
  bbox: [number, number, number, number]; // [x, y, width, height]
  class_id: number;
  class_name: string;
  label: string;
  confidence: number;
  source?: string; // 'yolo' | 'freespace' | 'flow' | 'fused (...)'
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
  ultrasonic_distance_cm?: number | null;
  ultrasonic_emergency?: boolean;
  fusion_mode?: string;
  counts?: {
    total: number;
    yolo: number;
    freespace: number;
    flow: number;
  };
}

export interface FrameQualityData {
  brightness: number;
  contrast: number;
  sharpness: number;
  is_dark: boolean;
  is_bright: boolean;
  is_low_contrast: boolean;
  is_blurry: boolean;
  enhance_steps?: string[];
  dropped_blurry_count?: number;
  is_dropped_blur?: boolean;
}

export interface StabilizerData {
  dx: number;
  dy: number;
  dtheta: number;
  jitter: number;
  is_stabilized: boolean;
}

export interface FreespaceData {
  blocked_ratio: number;
  is_blocked: boolean;
  sample_box?: [number, number, number, number];
}

export interface FlowData {
  mean_magnitude: number;
  is_approaching: boolean;
}

export interface TimingsData {
  assess_ms?: number;
  enhance_ms?: number;
  stabilizer_ms?: number;
  yolo_ms?: number;
  lane_ms?: number;
  collision_ms?: number;
  freespace_ms?: number;
  flow_ms?: number;
  fusion_ms?: number;
  total_ms?: number;
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
  timings_ms?: TimingsData;
  quality?: FrameQualityData;
  stabilizer?: StabilizerData;
  freespace?: FreespaceData;
  flow?: FlowData;
  fusion_mode?: string;
  config_hash?: string;
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
          let raw = event.data;
          // Phòng ngừa NaN / Infinity trong chuỗi JSON nếu có
          if (typeof raw === 'string' && (raw.includes(': NaN') || raw.includes(': -NaN') || raw.includes(': Infinity'))) {
            raw = raw.replace(/:\s*-?NaN/g, ': 0.0').replace(/:\s*Infinity/g, ': 999999').replace(/:\s*-Infinity/g, ': -999999');
          }
          const data: VisionPayload = JSON.parse(raw);
          setVisionData(data);
        } catch (err) {
          console.error('[useVisionWebSocket] JSON parse error:', err);
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
    timings: visionData?.timings_ms,
    quality: visionData?.quality,
    stabilizer: visionData?.stabilizer,
    freespace: visionData?.freespace,
    flow: visionData?.flow,
    fusionMode: visionData?.fusion_mode,
  };
}
