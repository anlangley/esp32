import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import os from 'os';

const PORT = process.env.PORT || 3000;

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
app.get('/', (req, res) => {
  res.json({ status: 'running', service: 'IoT Car Backend Broker' });
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

    socket.on('disconnect', () => {
      frontendClients.delete(socket.id);
      console.log(`[DISCONNECT] Giao diện điều khiển ngắt kết nối: ${socket.id}`);
    });
  }

  // Handle ESP32 / Mock Device Registration
  else if (role === 'device') {
    if (activeDeviceSocket) {
      console.log(`[WARNING] Đã có xe kết nối trước đó (${activeDeviceSocket.id}). Thay thế bằng kết nối mới.`);
      activeDeviceSocket.disconnect(true);
    }

    activeDeviceSocket = socket;
    console.log(`[DEVICE] XE Ô TÔ IOT ĐÃ ONLINE | ID: ${socket.id}`);
    
    // Broadcast device status to all web clients
    io.emit('device_status', { online: true });

    // Relay sensor telemetry from ESP32 Device back to all Web Frontends
    socket.on('telemetry_data', (telemetry) => {
      io.emit('telemetry_data', telemetry);
    });

    socket.on('disconnect', () => {
      activeDeviceSocket = null;
      console.log(`[DEVICE] XE Ô TÔ IOT ĐÃ NGOẠI TUYẾN (OFFLINE)`);
      // Broadcast device offline status to all web clients
      io.emit('device_status', { online: false });
    });
  }

  // Handle generic connections without roles
  else {
    socket.on('disconnect', () => {
      console.log(`[DISCONNECT] Kết nối vô danh ngắt: ${socket.id}`);
    });
  }
});

httpServer.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  IoT CAR BACKEND SERVER ĐANG CHẠY CỔNG : ${PORT}`);
  console.log(`  Đường dẫn WebSocket: ws://localhost:${PORT}`);
  console.log(`==================================================`);
});
