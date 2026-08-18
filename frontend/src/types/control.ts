export interface TelemetryData {
  batteryPercentage: number;
  batteryVoltage: number;
  distance: number; // Ultrasonic sensor value in cm
  temperature: number; // Internal vehicle temp in C
  rssi: number; // WiFi signal strength in dBm
  speed: number; // Current calculated motor speed percentage
  latency: number; // Network round-trip latency in ms
  cameraFps?: number;
  cameraRssi?: number;
}

export interface ControlCommand {
  x: number; // X-axis value from -1.0 (left) to 1.0 (right)
  y: number; // Y-axis value from -1.0 (reverse) to 1.0 (forward)
  speedLimit: number; // Speed limit percentage (0 - 100)
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

export interface CameraConfig {
  ip: string;
  port: string;
  path: string; // e.g. '/video' or '/stream'
  type?: 'mjpeg' | 'webrtc';
  audioPath?: string; // e.g. '/audio.wav' or '/audio.opus'
}
export interface KeyControls {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
}
export interface LogMessage {
  id: string;
  timestamp: string;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
}
