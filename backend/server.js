import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import os from 'os';
import { processVoiceCommand, getAgentStatus } from './ai/agent_router.js';
import { handleTtsRequest } from './controllers/ttsController.js';
import { startUdpDiscoveryServer } from './services/udpDiscovery.js';

const PORT = process.env.PORT || 3000;
const UDP_PORT = 41234;

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (127.0.0.1) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const app = express();
app.use(cors());

// Basic health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Endpoint returning PC's real LAN Wi-Fi IP address for QR code mobile scanning
app.get('/api/network-ip', (req, res) => {
  const localIp = getLocalIpAddress();
  res.json({
    ip: localIp,
    frontendPort: 5173,
    url: `http://${localIp}:5173`
  });
});

// REST API: Kiểm tra trạng thái hệ thống AI Agent (Tầng 1, Tầng 2)
app.get('/api/agent-status', async (req, res) => {
  try {
    const status = await getAgentStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// REST API: Text-To-Speech Giọng đọc Google Tiếng Việt (Controllers/ttsController.js)
app.get('/api/tts', handleTtsRequest);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Allow all client connections
    methods: ['GET', 'POST'],
  }
});

// Track active connections
let activeDeviceSocket = null;
let frontendClients = new Set();

// AI Agent: Lưu trữ dữ liệu telemetry mới nhất từ xe để inject vào LLM context
let latestTelemetry = {};

io.on('connection', (socket) => {
  const role = socket.handshake.query.role;
  const ip = socket.handshake.address;

  console.log(`[CONNECT] Kết nối mới từ IP: ${ip} | Role: ${role || 'Không xác định'} | ID: ${socket.id}`);

  // Handle Frontend Client Registration
  if (role === 'frontend') {
    frontendClients.add(socket.id);
    
    // Immediately inform the new frontend of the current device status
    socket.emit('device_status', { online: activeDeviceSocket !== null });

    let lastWarningTime = 0;
    // Relay drive commands from Web Frontend to the ESP32 Device
    socket.on('drive_command', (command) => {
      if (activeDeviceSocket) {
        // Forward command to the connected car
        activeDeviceSocket.emit('drive_command', command);
      } else {
        const now = Date.now();
        // Throttle warning log to once per 10s maximum to prevent terminal log spam
        if (now - lastWarningTime > 10000) {
          lastWarningTime = now;
          socket.emit('system_warning', 'Không tìm thấy xe điều khiển kết nối!');
        }
      }
    });

    // Relay Follow Mode toggle from Frontend to ESP32 Device
    socket.on('follow_mode', (data) => {
      if (activeDeviceSocket) {
        activeDeviceSocket.emit('follow_mode', data);
        console.log(`[FOLLOW] Chế độ bám theo vật thể: ${data?.enabled ? 'BẬT' : 'TẮT'}`);
      }
    });

    // === AI AGENT: Nhận lệnh giọng nói / text từ Frontend ===
    socket.on('voice_command', async (data) => {
      const userText = typeof data === 'string' ? data : data?.text;
      const base64Image = typeof data === 'object' ? (data.image || data.base64Image || null) : null;

      if (!userText || userText.trim().length === 0) {
        socket.emit('agent_response', { reply: '❌ Không nhận được câu lệnh.', tool_calls: [], executions: [], tier: 0 });
        return;
      }

      console.log(`[AI AGENT] 🎤 Nhận lệnh giọng nói từ Frontend (${socket.id}): "${userText}"${base64Image ? ' (kèm ảnh FPV)' : ''}`);

      try {
        const result = await processVoiceCommand(userText, {
          deviceSocket: activeDeviceSocket,
          ioSocket: io,
          latestTelemetry,
          base64Image,
        });
        socket.emit('agent_response', result);

        // Broadcast tới tất cả frontend để đồng bộ trạng thái
        io.emit('agent_activity', {
          text: userText,
          reply: result.reply,
          tier: result.tier,
          latency_ms: result.latency_ms,
        });
      } catch (err) {
        console.error(`[AI AGENT] ❌ Lỗi xử lý:`, err);
        socket.emit('agent_response', {
          reply: `❌ Lỗi AI Agent: ${err.message}`,
          tool_calls: [],
          executions: [],
          tier: 0,
          error: err.message,
        });
      }
    });

    socket.on('disconnect', () => {
      frontendClients.delete(socket.id);
      console.log(`[DISCONNECT] Giao diện điều khiển ngắt kết nối: ${socket.id}`);
    });
  }

  // Handle ESP32 / Mock Device Registration
  else if (role === 'device') {
    if (activeDeviceSocket && activeDeviceSocket.id !== socket.id) {
      console.log(`[WARNING] Đã có xe kết nối trước đó (${activeDeviceSocket.id}). Thay thế bằng kết nối mới.`);
      const oldSocket = activeDeviceSocket;
      activeDeviceSocket = socket;
      oldSocket.disconnect(true);
    } else {
      activeDeviceSocket = socket;
    }

    console.log(`[DEVICE] XE Ô TÔ IOT ĐÃ ONLINE | ID: ${socket.id}`);
    
    // Broadcast device status to all web clients
    io.emit('device_status', { online: true });

    // Relay sensor telemetry from ESP32 Device back to all Web Frontends
    socket.on('telemetry_data', (telemetry) => {
      latestTelemetry = telemetry; // Cập nhật bản sao mới nhất cho AI Agent
      io.emit('telemetry_data', telemetry);
    });

    socket.on('disconnect', (reason) => {
      if (activeDeviceSocket === socket) {
        activeDeviceSocket = null;
        console.log(`[DEVICE] XE Ô TÔ IOT ĐÃ NGOẠI TUYẾN (OFFLINE) | Lý do: ${reason}`);
        // Broadcast device offline status to all web clients
        io.emit('device_status', { online: false });
      } else {
        console.log(`[DEVICE] Kết nối cũ ${socket.id} đã đóng (được thay thế bởi xe mới).`);
      }
    });
  }

  // Handle generic connections without roles
  else {
    socket.on('disconnect', () => {
      console.log(`[DISCONNECT] Kết nối vô danh ngắt: ${socket.id}`);
    });
  }
  // Handle WebRTC Signaling for IP Camera App
  socket.on('register-camera', () => {
    console.log(`[CAMERA] Điện thoại IP Camera đã kết nối: ${socket.id}`);
    socket.join('camera-room');
  });

  socket.on('viewer-join-camera', () => {
    console.log(`[VIEWER] Người xem kết nối tới Camera: ${socket.id}`);
    io.to('camera-room').emit('viewer-joined', socket.id);
  });

  socket.on('offer', (offer, targetId) => {
    if (targetId) io.to(targetId).emit('offer', offer, socket.id);
    else socket.broadcast.emit('offer', offer, socket.id);
  });

  socket.on('answer', (answer, targetId) => {
    if (targetId) io.to(targetId).emit('answer', answer, socket.id);
    else socket.broadcast.emit('answer', answer, socket.id);
  });

  socket.on('ice-candidate', (candidate, targetId) => {
    if (targetId) io.to(targetId).emit('ice-candidate', candidate, socket.id);
    else socket.broadcast.emit('ice-candidate', candidate, socket.id);
  });
});

httpServer.listen(PORT, '0.0.0.0', async () => {
  const localIp = getLocalIpAddress();
  const status = await getAgentStatus();
  console.log(`==================================================`);
  console.log(`  IoT CAR BACKEND SERVER ĐANG CHẠY CỔNG : ${PORT}`);
  console.log(`  IP Mạng LAN PC: http://${localIp}:${PORT}`);
  console.log(`  Đường dẫn WebSocket: ws://${localIp}:${PORT}`);
  console.log(`  Tầng 1 (Fast-Path): Sẵn sàng (Offline)`);
  console.log(`  Tầng 2 (Gemini API): ${status.tier2_gemini.available ? '✅ ĐÃ KÍCH HOẠT' : '❌ CHƯA CẤU HÌNH (Thiếu GEMINI_API_KEY trong .env)'}`);
  console.log(`==================================================`);
});

// UDP Auto-Discovery Server cho ESP32 tự tìm IP máy tính (services/udpDiscovery.js)
startUdpDiscoveryServer(PORT, getLocalIpAddress);

