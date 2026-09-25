import { io } from 'socket.io-client';
import mqtt from 'mqtt';
import coap from 'coap';
import readline from 'readline';

// Lấy giao thức từ tham số dòng lệnh (mặc định là ws)
// Ví dụ: node mock_device.js --protocol=mqtt
const args = process.argv.slice(2);
let protocol = 'ws';
args.forEach(arg => {
  if (arg.startsWith('--protocol=')) {
    protocol = arg.split('=')[1].toLowerCase();
  }
});

const SERVER_HOST = '127.0.0.1'; // Bắt buộc dùng 127.0.0.1 thay vì localhost để tránh lỗi IPv6 của Node fetch()
const WS_URL = `http://${SERVER_HOST}:3000`;
const HTTP_URL = `http://${SERVER_HOST}:3000/api`;
const MQTT_URL = `mqtt://${SERVER_HOST}:1883`;
const COAP_URL = `coap://${SERVER_HOST}:5683`;

// Cấu hình mô phỏng độ trễ vật lý thực tế của từng giao thức (tính bằng ms)
// Môi trường Localhost vốn có trễ 0ms, ta cần thêm delay nhân tạo để thấy rõ sự khác biệt.
const PROTOCOL_LATENCY_SIMULATION = {
  ws: { base: 10, jitter: 5 },       // Giữ kết nối TCP liên tục, trễ cực thấp
  mqtt: { base: 25, jitter: 15 },    // Nhẹ, nhưng đi qua Broker nên trễ cao hơn WS chút
  coap: { base: 60, jitter: 30 },    // UDP không giữ kết nối nhưng gói tin nhẹ
  http: { base: 350, jitter: 100 }   // Request-Response, TCP Handshake lại từ đầu mỗi lần gọi => RẤT CHẬM
};

console.log(`\n==================================================`);
console.log(`[START] Bộ mô phỏng xe ảo IoT - Giao thức: ${protocol.toUpperCase()}`);
console.log(`==================================================\n`);

// Mock telemetry initial state
let batteryPercentage = 95.0;
let distance = 140.0; // cm
let temperature = 31.0; // Celsius
let rssi = -55; // dBm

// Track current motor states
let currentX = 0;
let currentY = 0;
let currentSpeedLimit = 80;

// Variables for connection instances
let wsClient = null;
let mqttClient = null;

function setupWebSocket() {
  console.log(`[WS] Đang kết nối tới WebSocket Server: ${WS_URL}...`);
  wsClient = io(WS_URL, {
    query: {
      role: 'device',
      vehicle_code: process.env.REAL_CAR_CODE || 'ESP32_MOCK',
      hardware_id: 'MOCK-ESP32-E0:E2:E6',
    },
  });

  wsClient.on('connect', () => {
    console.log(`[WS] Kết nối thành công! Đang chờ lệnh điều hướng...`);
  });

  wsClient.on('disconnect', () => {
    console.log(`[WS] Mất kết nối với Server!`);
  });

  wsClient.on('drive_command', (cmd) => {
    handleCommand(cmd);
  });
}

function setupMQTT() {
  console.log(`[MQTT] Đang kết nối tới MQTT Broker: ${MQTT_URL}...`);
  mqttClient = mqtt.connect(MQTT_URL);

  mqttClient.on('connect', () => {
    console.log(`[MQTT] Kết nối thành công! Đăng ký topic iotcar/command...`);
    mqttClient.subscribe('iotcar/command', (err) => {
      if (err) console.error('[MQTT] Subscribe lỗi:', err);
    });
  });

  mqttClient.on('message', (topic, message) => {
    if (topic === 'iotcar/command') {
      try {
        const cmd = JSON.parse(message.toString());
        handleCommand(cmd);
      } catch (e) {
        console.error('[MQTT] Lỗi parse lệnh:', e);
      }
    }
  });
}

// Xử lý logic tính toán motor từ lệnh nhận được
function handleCommand(cmd) {
  currentX = cmd.x;
  currentY = cmd.y;
  currentSpeedLimit = cmd.speedLimit;

  const maxPwm = (currentSpeedLimit / 100) * 255;
  const forwardPwm = currentY * maxPwm;
  const steeringPwm = currentX * maxPwm;

  let leftPwm = forwardPwm + steeringPwm;
  let rightPwm = forwardPwm - steeringPwm;

  leftPwm = Math.max(-255, Math.min(255, leftPwm));
  rightPwm = Math.max(-255, Math.min(255, rightPwm));

  const leftDir = leftPwm >= 0 ? 'TIẾN (1)' : 'LÙI (0)';
  const rightDir = rightPwm >= 0 ? 'TIẾN (1)' : 'LÙI (0)';
  const absLeftSpeed = Math.round(Math.abs(leftPwm));
  const absRightSpeed = Math.round(Math.abs(rightPwm));

  // Failsafe
  let effectiveY = currentY;
  if (distance <= 15 && currentY > 0) {
    console.log(`[FAILSAPE] PHANH KHẨN CẤP! Khoảng cách ${distance.toFixed(1)}cm.`);
    leftPwm = 0;
    rightPwm = 0;
    effectiveY = 0;
  }

  drawMotorHUD(absLeftSpeed, leftDir, absRightSpeed, rightDir);
}

let lastPrintedHUD = "";

// Print visual bars in terminal
function drawMotorHUD(leftSpeed, leftDir, rightSpeed, rightDir) {
  const getBar = (speed) => {
    const barsCount = Math.round((speed / 255) * 15);
    return '█'.repeat(barsCount) + '░'.repeat(15 - barsCount);
  };

  const newHUD = `
======================= [${protocol.toUpperCase()}] ĐỘNG CƠ XE IOT =======================
 Lệnh Joystick: X = ${currentX.toFixed(2)} | Y = ${currentY.toFixed(2)} | Speed Limit = ${currentSpeedLimit}%
--------------------------------------------------------------------------
 Động cơ TRÁI (L): [${getBar(leftSpeed)}] ${Math.round((leftSpeed / 255) * 100)}% | Chiều: ${leftDir} | PWM: ${leftSpeed}
 Động cơ PHẢI (R): [${getBar(rightSpeed)}] ${Math.round((rightSpeed / 255) * 100)}% | Chiều: ${rightDir} | PWM: ${rightSpeed}
--------------------------------------------------------------------------
 CẢM BIẾN CẬN CẢNH: ${distance.toFixed(1)} cm ${distance <= 20 ? '[CẢNH BÁO VA CHẠM!]' : '[AN TOÀN]'}
 Pin còn lại: ${batteryPercentage.toFixed(1)}% | Nhiệt độ: ${temperature.toFixed(1)}°C
==========================================================================`;

  readline.cursorTo(process.stdout, 0, 0);
  readline.clearScreenDown(process.stdout);
  console.log(newHUD.trim());
}

// Hàm gửi HTTP
async function pollHttp() {
  try {
    // 1. Get command
    const res = await fetch(`${HTTP_URL}/command`);
    if (res.ok) {
      const cmd = await res.json();
      if (cmd.x !== currentX || cmd.y !== currentY || cmd.speedLimit !== currentSpeedLimit) {
        handleCommand(cmd);
      }
    }
  } catch (e) {
    // ignore fetch errors on polling
  }
}

async function sendHttpTelemetry(telemetry) {
  try {
    await fetch(`${HTTP_URL}/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telemetry)
    });
  } catch (e) { }
}

// Hàm gửi CoAP
function pollCoap() {
  const req = coap.request(`${COAP_URL}/command`);
  req.on('response', (res) => {
    try {
      const cmd = JSON.parse(res.payload.toString());
      if (cmd.x !== currentX || cmd.y !== currentY || cmd.speedLimit !== currentSpeedLimit) {
        handleCommand(cmd);
      }
    } catch (e) { }
  });
  req.end();
}

function sendCoapTelemetry(telemetry) {
  const req = coap.request({
    host: SERVER_HOST,
    port: 5683,
    pathname: '/telemetry',
    method: 'POST'
  });
  req.write(JSON.stringify(telemetry));
  req.end();
}

// Khởi tạo connection ban đầu
if (protocol === 'ws') setupWebSocket();
else if (protocol === 'mqtt') setupMQTT();
else if (protocol === 'http') console.log(`[HTTP] Đang polling lệnh từ ${HTTP_URL}...`);
else if (protocol === 'coap') console.log(`[CoAP] Đang polling lệnh từ ${COAP_URL}...`);
else {
  console.error(`Giao thức không hợp lệ. Vui lòng dùng: ws, http, mqtt, coap`);
  process.exit(1);
}

// Cấu hình mô phỏng vật lý và mạng
const PHYSICS_TICK_MS = 100;
let isNetworkBusy = false;

// Physics Loop (Telemetry update) - 100ms
setInterval(() => {
  // Simulate Physics
  if (currentY > 0) distance = Math.max(8, distance - (currentY * 4.5));
  else if (currentY < 0) distance = Math.min(180, distance - (currentY * 3.0));
  else distance = Math.max(8, Math.min(180, distance + (Math.random() - 0.5) * 0.3));

  if (distance <= 10 && currentY <= 0) distance = 15; // reset

  const activeSpeed = Math.sqrt(currentX * currentX + currentY * currentY);
  batteryPercentage = Math.max(5, batteryPercentage - (0.005 + activeSpeed * 0.04));
  temperature = temperature + ((30.0 + (activeSpeed * currentSpeedLimit * 0.12)) - temperature) * 0.05;
  rssi = Math.min(-45, Math.max(-95, rssi + Math.round((Math.random() - 0.5) * 4)));

  const maxPwm = (currentSpeedLimit / 100) * 255;
  const forwardPwm = currentY * maxPwm;
  const steeringPwm = currentX * maxPwm;

  let leftPwm = forwardPwm + steeringPwm;
  let rightPwm = forwardPwm - steeringPwm;

  leftPwm = Math.max(-255, Math.min(255, leftPwm));
  rightPwm = Math.max(-255, Math.min(255, rightPwm));

  const leftDir = leftPwm >= 0 ? 'TIẾN (1)' : 'LÙI (0)';
  const rightDir = rightPwm >= 0 ? 'TIẾN (1)' : 'LÙI (0)';

  // Terminal log phải cập nhật liên tục dựa trên vận tốc đã tính (kể cả bị chặn mạng)
  drawMotorHUD(Math.round(Math.abs(leftPwm)), leftDir, Math.round(Math.abs(rightPwm)), rightDir);

  // NẾU MẠNG ĐANG BẬN (Mô phỏng Blocking của HTTP trên ESP32 lõi đơn)
  // Các giao thức Request-Response (như HTTP) sẽ chặn luồng, khiến dữ liệu không gửi được liên tục.
  if (isNetworkBusy && protocol === 'http') {
    return; // Bỏ qua nhịp gửi này -> Gây ra hiện tượng Giật cục (Stutter) trên giao diện Web!
  }

  const telemetry = {
    protocol: protocol, // Báo cho Web biết thiết bị đang chạy giao thức nào
    batteryPercentage: Math.round(batteryPercentage * 10) / 10,
    batteryVoltage: Math.round((batteryPercentage / 100) * 11.1 * 100) / 100,
    distance: Math.round(distance * 10) / 10,
    temperature: Math.round(temperature * 10) / 10,
    rssi: rssi,
    speed: Math.round(activeSpeed * currentSpeedLimit),
    latency: Math.round(10 + Math.random() * 8)
  };

  // 2. Add realistic latency simulation for the selected protocol
  const sim = PROTOCOL_LATENCY_SIMULATION[protocol];
  const artificialDelay = Math.round(sim.base + (Math.random() - 0.5) * sim.jitter);
  telemetry.latency = artificialDelay;

  isNetworkBusy = true; // Đánh dấu mạng đang bận xử lý gửi dữ liệu

  // Delay the actual transmission to simulate network lag
  setTimeout(() => {
    // Phát tín hiệu theo giao thức được chọn
    if (protocol === 'ws') {
      if (wsClient?.connected) wsClient.emit('telemetry_data', telemetry);
    } else if (protocol === 'mqtt') {
      if (mqttClient?.connected) mqttClient.publish('iotcar/telemetry', JSON.stringify(telemetry));
    } else if (protocol === 'http') {
      pollHttp(); // Fetch command continuously
      sendHttpTelemetry(telemetry); // Push telemetry
    } else if (protocol === 'coap') {
      pollCoap();
      sendCoapTelemetry(telemetry);
    }

    isNetworkBusy = false; // Giải phóng mạng sau khi hoàn tất (Round-trip)
  }, artificialDelay);
}, PHYSICS_TICK_MS);
