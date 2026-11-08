import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import os from 'os';
import { processVoiceCommand, getAgentStatus } from './ai/agent_router.js';
import { handleTtsRequest } from './controllers/ttsController.js';
import { startUdpDiscoveryServer } from './services/udpDiscovery.js';
import { getPool, sql } from './database/db.js';
import authRoutes from './routes/authRoutes.js';
import vehicleRoutes from './routes/vehicleRoutes.js';
import { createSocketAuthMiddleware } from './middleware/socketAuth.js';

import { Aedes } from 'aedes';
import net from 'net';
import coap from 'coap';

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
app.use(express.json()); // Allow JSON body parsing for HTTP endpoints

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

// ==========================================
// AUTH & VEHICLE ROUTES
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);

// ==========================================
// MULTI-PROTOCOL: HTTP (REST API)
// ==========================================
app.post('/api/telemetry', (req, res) => {
  const telemetry = req.body;
  if (telemetry) {
    latestTelemetry = telemetry;
    io.emit('telemetry_data', telemetry); // Broadcast to frontend
    res.status(200).json({ status: 'success' });
  } else {
    res.status(400).json({ error: 'No data' });
  }
});

app.get('/api/command', (req, res) => {
  res.status(200).json(latestCommand);
});

// REST API: Python Vision Server kích hoạt phanh khẩn cấp tự động khi có vật cản
app.post('/api/control/emergency-brake', (req, res) => {
  const { reason } = req.body || {};
  console.warn(`🚨 [EMERGENCY BRAKE] Phanh khẩn cấp từ Python Vision: ${reason || 'Vật cản sát mũi xe'}`);

  const stopCommand = { x: 0, y: 0, speedLimit: 0, emergency: true };
  latestCommand = stopCommand;

  // Gửi lệnh phanh qua MQTT & WebSocket tới ESP32
  try {
    aedes.publish({ topic: 'iotcar/command', payload: JSON.stringify(stopCommand) });
  } catch {}

  if (activeDeviceSocket) {
    activeDeviceSocket.emit('drive_command', stopCommand);
  }

  // Báo động trên giao diện buồng lái Frontend
  io.emit('system_warning', `🚨 Phanh khẩn cấp tự động: ${reason || 'Phát hiện vật cản phía trước!'}`);

  res.json({ status: 'emergency_stop_triggered', reason });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*', // Allow all client connections
    methods: ['GET', 'POST'],
  }
});

// ==========================================
// SOCKET.IO AUTH MIDDLEWARE (GĐ 2)
// ==========================================
createSocketAuthMiddleware(io);

// Track active connections
let activeDeviceSocket = null;
let frontendClients = new Set();

// AI Agent: Lưu trữ dữ liệu telemetry mới nhất từ xe để inject vào LLM context
let latestTelemetry = {};
let latestCommand = { x: 0, y: 0, speedLimit: 80 }; // Shared state for HTTP/CoAP polling

// ==========================================
// MULTI-PROTOCOL: MQTT Broker (Aedes)
// ==========================================
const aedes = await Aedes.createBroker();
const mqttServer = net.createServer(aedes.handle);
const MQTT_PORT = 1883;

mqttServer.listen(MQTT_PORT, function () {
  console.log(`[MQTT] Aedes Broker đang chạy cổng: ${MQTT_PORT}`);
});

aedes.on('publish', function (packet, client) {
  if (client) {
    if (packet.topic === 'iotcar/telemetry') {
      try {
        const telemetry = JSON.parse(packet.payload.toString());
        latestTelemetry = telemetry;
        io.emit('telemetry_data', telemetry);
      } catch (err) {
        console.error('[MQTT] Lỗi parse JSON telemetry:', err.message);
      }
    }
  }
});

// ==========================================
// MULTI-PROTOCOL: CoAP Server
// ==========================================
const coapServer = coap.createServer();
const COAP_PORT = 5683;

coapServer.on('request', function(req, res) {
  if (req.url === '/telemetry' && req.method === 'POST') {
    try {
      const telemetry = JSON.parse(req.payload.toString());
      latestTelemetry = telemetry;
      io.emit('telemetry_data', telemetry);
      res.end('OK');
    } catch (e) {
      res.code = '4.00';
      res.end('Bad Request');
    }
  } else if (req.url === '/command' && req.method === 'GET') {
    res.end(JSON.stringify(latestCommand));
  } else {
    res.code = '4.04';
    res.end('Not Found');
  }
});

coapServer.listen(COAP_PORT, () => {
  console.log(`[CoAP] CoAP Server đang chạy UDP cổng: ${COAP_PORT}`);
});

io.on('connection', (socket) => {
  const role = socket.handshake.query.role;
  const ip = socket.handshake.address;

  console.log(`[CONNECT] Kết nối mới từ IP: ${ip} | Role: ${role || 'Không xác định'} | ID: ${socket.id}`);

  // Handle Frontend Client Registration
  if (role === 'frontend') {
    frontendClients.add(socket.id);
    
    // Immediately inform the new frontend of the current device status
    socket.emit('device_status', {
      online: activeDeviceSocket !== null,
      vehicleCode: activeDeviceSocket?.vehicleCode || null
    });

    let lastWarningTime = 0;
    // Relay drive commands from Web Frontend to the ESP32 Device
    socket.on('drive_command', (command) => {
      // 1. Kiểm tra đăng nhập và liên kết xe (GĐ 2.2)
      if (socket.userRole !== 'admin' && (!socket.linkedVehicleIds || socket.linkedVehicleIds.size === 0)) {
        socket.emit('system_warning', 'Bạn chưa liên kết xe nào! Vui lòng liên kết mã xe trước khi điều khiển.');
        return;
      }

      // 2. Phân loại xe: CAR-A1B2C3 (Demo ảo) vs Xe thật ESP32
      const targetVehicle = (command?.vehicleCode || '').toUpperCase().trim();

      // Nếu đang ở xe Demo (CAR-A1B2C3):
      // Đây chỉ là mô phỏng buồng lái ảo 2D, TUYỆT ĐỐI KHÔNG gửi xuống xe thật ESP32!
      if (targetVehicle === 'CAR-A1B2C3') {
        latestCommand = command; // Lưu trạng thái nội bộ cho simulation
        return;
      }

      // Nếu đang điều khiển xe thật:
      // Kiểm tra tài khoản có được liên kết mã xe này không (hoặc là admin)
      if (socket.userRole !== 'admin' && (!socket.linkedVehicleCodes || !socket.linkedVehicleCodes.has(targetVehicle))) {
        const now = Date.now();
        if (now - lastWarningTime > 5000) {
          lastWarningTime = now;
          socket.emit('system_warning', 'Tài khoản chưa được liên kết với xe này! Vui lòng nhập mã xe và mã PIN bảo mật.');
        }
        return;
      }

      latestCommand = command; // Save for HTTP/CoAP polling
      
      // Send to MQTT Broker
      aedes.publish({ topic: 'iotcar/command', payload: JSON.stringify(command) });

      if (activeDeviceSocket) {
        // Forward command to the real connected car
        activeDeviceSocket.emit('drive_command', command);
      } else {
        const now = Date.now();
        // Throttle warning log to once per 10s maximum to prevent terminal log spam
        if (now - lastWarningTime > 10000) {
          lastWarningTime = now;
          socket.emit('system_warning', 'Xe thật đang ngoại tuyến! Đang chờ ESP32 kết nối...');
        }
      }
    });

    // Relay Follow Mode toggle from Frontend to ESP32 Device
    socket.on('follow_mode', (data) => {
      const targetVehicle = (data?.vehicleCode || '').toUpperCase().trim();
      if (targetVehicle === 'CAR-A1B2C3') {
        return; // Xe demo không kích hoạt phần cứng
      }
      if (socket.userRole !== 'admin' && (!socket.linkedVehicleCodes || !socket.linkedVehicleCodes.has(targetVehicle))) {
        socket.emit('system_warning', 'Chỉ có xe thật đã liên kết mới hỗ trợ tính năng bám theo vật thể.');
        return;
      }
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

  // Handle ESP32 / Mock Device Registration (GĐ 4)
  else if (role === 'device') {
    const vehicleCode = (socket.handshake.query.vehicle_code || process.env.REAL_CAR_CODE || 'ESP32_DEVICE').toUpperCase().trim();
    const hardwareId = socket.handshake.query.hardware_id || null;
    socket.vehicleCode = vehicleCode;
    socket.hardwareId = hardwareId;

    if (activeDeviceSocket && activeDeviceSocket.id !== socket.id) {
      console.log(`[WARNING] Đã có xe kết nối trước đó (${activeDeviceSocket.id}). Thay thế bằng kết nối mới.`);
      const oldSocket = activeDeviceSocket;
      activeDeviceSocket = socket;
      oldSocket.disconnect(true);
    } else {
      activeDeviceSocket = socket;
    }

    console.log(`[DEVICE] XE [${vehicleCode}] ĐÃ ONLINE | ID: ${socket.id} | MAC/HW: ${hardwareId || 'N/A'}`);
    
    // Broadcast device status to all web clients
    io.emit('device_status', { online: true, vehicleCode, hardwareId });

    // GĐ 4: Cập nhật trạng thái xe trong database SQL Server
    (async () => {
      try {
        const pool = await getPool();
        await pool.request()
          .input('vehicle_code', sql.NVarChar, vehicleCode)
          .input('hardware_id', sql.NVarChar, hardwareId)
          .query(`
            IF EXISTS (SELECT 1 FROM vehicles WHERE vehicle_code = @vehicle_code)
            BEGIN
              UPDATE vehicles 
              SET status = 'online', 
                  hardware_id = COALESCE(@hardware_id, hardware_id)
              WHERE vehicle_code = @vehicle_code;
            END
            ELSE IF @hardware_id IS NOT NULL AND EXISTS (SELECT 1 FROM vehicles WHERE hardware_id = @hardware_id)
            BEGIN
              UPDATE vehicles 
              SET status = 'online', 
                  vehicle_code = @vehicle_code
              WHERE hardware_id = @hardware_id;
            END
            ELSE
            BEGIN
              INSERT INTO vehicles (vehicle_code, name, hardware_id, status)
              VALUES (@vehicle_code, N'Xe Ô tô IoT ' + @vehicle_code, @hardware_id, 'online');
            END
          `);
        console.log(`[DB] ✅ Cập nhật SQL Server: Xe [${vehicleCode}] -> status: ONLINE`);
      } catch (err) {
        console.error(`[DB] ⚠️ Lỗi cập nhật status online cho xe [${vehicleCode}]:`, err.message);
      }
    })();

    // Relay sensor telemetry from ESP32 Device back to all Web Frontends
    socket.on('telemetry_data', (telemetry) => {
      latestTelemetry = telemetry; // Cập nhật bản sao mới nhất cho AI Agent
      io.emit('telemetry_data', telemetry);
    });

    socket.on('disconnect', async (reason) => {
      if (activeDeviceSocket === socket) {
        activeDeviceSocket = null;
        console.log(`[DEVICE] XE [${vehicleCode}] ĐÃ NGOẠI TUYẾN (OFFLINE) | Lý do: ${reason}`);
        // Broadcast device offline status to all web clients
        io.emit('device_status', { online: false, vehicleCode });

        // GĐ 4: Cập nhật trạng thái offline trong database SQL Server
        try {
          const pool = await getPool();
          await pool.request()
            .input('vehicle_code', sql.NVarChar, vehicleCode)
            .query("UPDATE vehicles SET status = 'offline' WHERE vehicle_code = @vehicle_code");
          console.log(`[DB] ✅ Cập nhật SQL Server: Xe [${vehicleCode}] -> status: OFFLINE`);
        } catch (err) {
          console.error(`[DB] ⚠️ Lỗi cập nhật status offline cho xe [${vehicleCode}]:`, err.message);
        }
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

  // Kết nối SQL Server Database
  try {
    await getPool();
  } catch (err) {
    console.error(`[DB] ⚠️  Không thể kết nối SQL Server: ${err.message}`);
    console.error(`[DB] ⚠️  Server vẫn chạy nhưng AUTH sẽ không hoạt động.`);
  }

  console.log(`==================================================`);
  console.log(`  IoT CAR BACKEND SERVER ĐANG CHẠY CỔNG : ${PORT}`);
  console.log(`  IP Mạng LAN PC: http://${localIp}:${PORT}`);
  console.log(`  Đường dẫn WebSocket: ws://${localIp}:${PORT}`);
  console.log(`  Tầng 1 (Fast-Path): Sẵn sàng (Offline)`);
  console.log(`  Tầng 2 (Gemini API): ${status.tier2_gemini.available ? '✅ ĐÃ KÍCH HOẠT' : '❌ CHƯA CẤU HÌNH (Thiếu GEMINI_API_KEY trong .env)'}`);
  console.log(`  Auth System: ✅ SQL Server + JWT`);
  console.log(`==================================================`);
});

// UDP Auto-Discovery Server cho ESP32 tự tìm IP máy tính (services/udpDiscovery.js)
startUdpDiscoveryServer(PORT, getLocalIpAddress);

