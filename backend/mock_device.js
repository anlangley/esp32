import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3000';
console.log(`[START] Bộ mô phỏng xe ảo đang kết nối tới Server: ${SERVER_URL}...`);

const socket = io(SERVER_URL, {
  query: { role: 'device' }
});

// Mock telemetry initial state
let batteryPercentage = 95.0;
let distance = 140.0; // cm
let temperature = 31.0; // Celsius
let rssi = -55; // dBm

// Track current motor states
let currentX = 0;
let currentY = 0;
let currentSpeedLimit = 80;

socket.on('connect', () => {
  console.log(`\n==================================================`);
  console.log(`  [XE ẢO ONLINE] Kết nối WebSocket Server thành công!`);
  console.log(`  Đang chờ nhận lệnh điều hướng từ Web Cockpit...`);
  console.log(`==================================================\n`);
});

socket.on('disconnect', () => {
  console.log(`\n[XE ẢO OFFLINE] Mất kết nối với Server!`);
});

// Handle drive commands from server
socket.on('drive_command', (cmd) => {
  currentX = cmd.x;
  currentY = cmd.y;
  currentSpeedLimit = cmd.speedLimit;

  // 1. Differential steering math (Tính toán lái vi sai hai bánh)
  // Quy đổi trục X, Y từ -1..1 thành giá trị PWM từ -255..255 cho động cơ
  const maxPwm = (currentSpeedLimit / 100) * 255;

  // Forward speed (Tốc độ tiến lùi cơ bản)
  const forwardPwm = currentY * maxPwm;
  // Steering offset (Độ lệch góc để cua)
  const steeringPwm = currentX * maxPwm;

  // Left & Right motor power calculation
  let leftPwm = forwardPwm + steeringPwm;
  let rightPwm = forwardPwm - steeringPwm;

  // Clamp PWM outputs to bounds [-255, 255]
  leftPwm = Math.max(-255, Math.min(255, leftPwm));
  rightPwm = Math.max(-255, Math.min(255, rightPwm));

  // Determine direction & absolute speed (Cơ chế phân tách chiều và độ mạnh động cơ)
  const leftDir = leftPwm >= 0 ? 'TIẾN (1)' : 'LÙI (0)';
  const rightDir = rightPwm >= 0 ? 'TIẾN (1)' : 'LÙI (0)';

  const absLeftSpeed = Math.round(Math.abs(leftPwm));
  const absRightSpeed = Math.round(Math.abs(rightPwm));

  // 2. Failsafe: Emergency Auto-brake simulation
  if (distance <= 15 && currentY > 0) {
    console.log(`[FAILSAPE] PHANH KHẨN CẤP! Khoảng cách quá gần (${distance}cm). Ngắt nguồn động cơ.`);
    leftPwm = 0;
    rightPwm = 0;
  }

  // 3. Render ASCII speed bars to visual terminal
  drawMotorHUD(absLeftSpeed, leftDir, absRightSpeed, rightDir);
});

// Print beautiful visual bars in the terminal
function drawMotorHUD(leftSpeed, leftDir, rightSpeed, rightDir) {
  const getBar = (speed) => {
    const barsCount = Math.round((speed / 255) * 15);
    return '█'.repeat(barsCount) + '░'.repeat(15 - barsCount);
  };

  // ANSI escape sequence to clear lines and keep console tidy
  process.stdout.write('\r\x1b[K'); // clear current line
  console.log('\x1b[H\x1b[2J'); // Clear terminal screen
  console.log(`======================= ĐỘNG CƠ XE IOT (PWM OUTPUT) =======================`);
  console.log(` Lệnh Joystick: X = ${currentX.toFixed(2)} | Y = ${currentY.toFixed(2)} | Speed Limit = ${currentSpeedLimit}%`);
  console.log(`--------------------------------------------------------------------------`);
  console.log(` Động cơ TRÁI (L): [${getBar(leftSpeed)}] ${Math.round((leftSpeed / 255) * 100)}% | Chiều: ${leftDir} | PWM: ${leftSpeed}`);
  console.log(` Động cơ PHẢI (R): [${getBar(rightSpeed)}] ${Math.round((rightSpeed / 255) * 100)}% | Chiều: ${rightDir} | PWM: ${rightSpeed}`);
  console.log(`--------------------------------------------------------------------------`);
  console.log(` CẢM BIẾN CẬN CẢNH: ${distance.toFixed(1)} cm ${distance <= 20 ? '[CẢNH BÁO VA CHẠM!]' : '[AN TOÀN]'}`);
  console.log(` Pin còn lại: ${batteryPercentage.toFixed(1)}% | Nhiệt độ ESP32: ${temperature.toFixed(1)}°C`);
  console.log(`==========================================================================`);
}

// Simulated physics loop - runs every 200ms
setInterval(() => {
  if (!socket.connected) return;

  // 1. Simulate distance depletion when moving forward
  if (currentY > 0) {
    distance = Math.max(8, distance - (currentY * 4.5));
  } else if (currentY < 0) {
    distance = Math.min(180, distance - (currentY * 3.0));
  } else {
    // Drifts slightly
    distance = Math.max(8, Math.min(180, distance + (Math.random() - 0.5) * 0.3));
  }

  // Auto recovery distance simulator (to let user test driving again without get stuck)
  if (distance <= 10 && currentY <= 0) {
    distance = 15; // backup safety reset
  }

  // 2. Simulate battery drain based on motor power
  const activeSpeed = Math.sqrt(currentX * currentX + currentY * currentY);
  const drain = 0.005 + (activeSpeed * 0.04);
  batteryPercentage = Math.max(5, batteryPercentage - drain);

  // 3. Simulate temperature increase based on motor work
  const targetTemp = 30.0 + (activeSpeed * currentSpeedLimit * 0.12);
  temperature = temperature + (targetTemp - temperature) * 0.05;

  // 4. Simulate WiFi signal fluctuations
  rssi = Math.min(-45, Math.max(-95, rssi + Math.round((Math.random() - 0.5) * 4)));

  // Send packet to WebSocket server
  socket.emit('telemetry_data', {
    batteryPercentage: Math.round(batteryPercentage * 10) / 10,
    batteryVoltage: Math.round((batteryPercentage / 100) * 11.1 * 100) / 100, // 3S battery
    distance: Math.round(distance * 10) / 10,
    temperature: Math.round(temperature * 10) / 10,
    rssi: rssi,
    speed: Math.round(activeSpeed * currentSpeedLimit),
    latency: Math.round(10 + Math.random() * 8) // mock network latency
  });
}, 200);
