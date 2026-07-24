/*
 * firmware.ino - ESP32 IoT Car Controller (S.BUS Version)
 * Hỗ trợ: 4 Động cơ giảm tốc vàng (ghép song song Trái/Phải) + Mạch cầu H L298N/BTS7960
 * Bộ thu MC6C chế độ S.BUS (Đọc bằng Hardware Serial2 - GPIO 16, 1 dây tín hiệu duy nhất)
 * Cảm biến siêu âm HC-SR04 + Truyền WebSocket thời gian thực
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

// ================= CẤU HÌNH THÔNG SỐ (BẠN THAY ĐỔI Ở ĐÂY) =================
const char* ssid = "FPT Bao An 2.4";          // Tên WiFi nhà bạn
const char* password = "anhquynh1";  // Mật khẩu WiFi
const char* ws_host = "LAPTOP-8EPKMA78.local";        // Tên máy tính chạy server Node.js (cổng 3000)
const int ws_port = 3000;

// Các công tắc bật tắt tính năng cảm biến (Đổi thành true nếu đã lắp phần cứng)
#define ENABLE_ULTRASONIC      false  // Cảm biến siêu âm HC-SR04
#define ENABLE_BATTERY_MONITOR  false  // Cầu phân áp đo điện áp Pin

// ================= CẤU HÌNH PINOUT ESP32 =================
// 1. Điều khiển Động cơ (Motor Driver Pins)
#define PIN_MOTOR_L_PWM  25  // Chân điều khiển tốc độ bên Trái (ENA)
#define PIN_MOTOR_L_IN1  26  // Chân chiều quay Trái 1
#define PIN_MOTOR_L_IN2  27  // Chân chiều quay Trái 2

#define PIN_MOTOR_R_PWM  14  // Chân điều khiển tốc độ bên Phải (ENB)
#define PIN_MOTOR_R_IN3  12  // Chân chiều quay Phải 1
#define PIN_MOTOR_R_IN4  13  // Chân chiều quay Phải 2

// Cài đặt kênh PWM cho ESP32 (Sử dụng ledc)
const int pwmFreq = 5000;
const int pwmResolution = 8; // 8-bit (0-255)
const int pwmChannelL = 0;
const int pwmChannelR = 1;

// 2. Cảm biến khoảng cách (Ultrasonic HC-SR04)
#define PIN_TRIG  32
#define PIN_ECHO  33

// 3. Đọc điện áp Pin (ADC Voltage Divider)
#define PIN_BATTERY_ADC 34

// 4. Nhận tín hiệu S.BUS từ bộ thu MC6C
// Cắm dây S.BUS từ bộ thu vào chân RX2 của ESP32
#define PIN_RC_SBUS_RX 16 

// 5. Điều khiển Servo Camera
#define PIN_CAM_SERVO 18

// ================= KHAI BÁO CÁC BIẾN TOÀN CỤC =================
WebSocketsClient webSocket;
unsigned long lastTelemetryTime = 0;
unsigned long lastCommandTime = 0;
const unsigned long failsafeTimeout = 1500; // 1.5 giây mất kết nối sẽ phanh

// Biến lưu trữ giá trị lái từ bộ thu (us)
int rc_ch1_val = 1500; // CH1: Lái cua (Steering) - Mặc định ở giữa
int rc_ch2_val = 1500; // CH2: Ga tiến lùi (Throttle) - Mặc định ở giữa
int rc_ch3_val = 1500; // CH3: Tốc độ xe phần trăm (Speed limit 20-100%)
int rc_ch4_val = 1500; // CH4: Quay Servo Camera (Góc 0-180 độ)
int rc_ch5_val = 1000; // CH5: Công tắc chế độ - Mặc định Web Mode

// Khai báo Servo Camera
Servo camServo;
int currentCamAngle = 90; // Góc mặc định 90 độ (chính giữa)

// Bộ đệm giải mã gói tin S.BUS (25 bytes)
uint8_t sbus_packet[25];
int sbus_index = 0;
unsigned long lastSbusByteTime = 0;

// Trạng thái lái
float currentX = 0; // -1.0 đến 1.0
float currentY = 0; // -1.0 đến 1.0
int currentSpeedLimit = 80; // %
bool isRcMode = false;      // true nếu đang gạt công tắc lái bằng tay MC6C

// Bộ nhớ đệm cảm biến để tối ưu hóa phi chặn (Non-blocking cache)
float currentDistance = 999.0;
unsigned long lastDistanceReadTime = 0;

// ================= HÀM GIẢI MÃ S.BUS TỰ DỰNG (SELF-CONTAINED PARSER) =================
void parseSbus() {
  while (Serial2.available() > 0) {
    uint8_t c = Serial2.read();
    
    // Nếu quá 4ms không nhận được byte nào, coi như bắt đầu gói tin mới (Sync)
    if (millis() - lastSbusByteTime > 4) {
      sbus_index = 0;
    }
    lastSbusByteTime = millis();

    // Byte đầu tiên của khung S.BUS luôn luôn là 0x0F
    if (sbus_index == 0 && c != 0x0F) {
      continue; 
    }

    sbus_packet[sbus_index++] = c;

    // Đã nhận đủ khung 25 bytes
    if (sbus_index == 25) {
      sbus_index = 0;
      
      // Đọc 11-bit cho mỗi kênh từ các byte trong gói tin S.BUS
      int ch1 = ((sbus_packet[1] | sbus_packet[2] << 8) & 0x07FF);
      int ch2 = ((sbus_packet[2] >> 3 | sbus_packet[3] << 5) & 0x07FF);
      int ch3 = ((sbus_packet[3] >> 6 | sbus_packet[4] << 2 | sbus_packet[5] << 10) & 0x07FF);
      int ch4 = ((sbus_packet[5] >> 1 | sbus_packet[6] << 7) & 0x07FF);
      int ch5 = ((sbus_packet[6] >> 4 | sbus_packet[7] << 4) & 0x07FF);

      // Quy đổi giá trị S.BUS tiêu chuẩn (khoảng 172 đến 1811, điểm giữa là 992)
      // sang độ rộng xung servo tiêu chuẩn (1000us đến 2000us, điểm giữa là 1500us)
      rc_ch1_val = (ch1 - 992) * 500 / 820 + 1500;
      rc_ch2_val = (ch2 - 992) * 500 / 820 + 1500;
      rc_ch3_val = (ch3 - 992) * 500 / 820 + 1500;
      rc_ch4_val = (ch4 - 992) * 500 / 820 + 1500;
      rc_ch5_val = (ch5 - 992) * 500 / 820 + 1500;

      // Giới hạn giá trị
      rc_ch1_val = constrain(rc_ch1_val, 1000, 2000);
      rc_ch2_val = constrain(rc_ch2_val, 1000, 2000);
      rc_ch3_val = constrain(rc_ch3_val, 1000, 2000);
      rc_ch4_val = constrain(rc_ch4_val, 1000, 2000);
      rc_ch5_val = constrain(rc_ch5_val, 1000, 2000);
    }
  }
}

// ================= HÀM ĐIỀU KHIỂN ĐỘNG CƠ (MOTOR CONTROL) =================
void driveMotors(int leftPwm, int rightPwm) {
  // Cài đặt chiều quay và xuất lực cho động cơ Trái
  if (leftPwm >= 0) {
    digitalWrite(PIN_MOTOR_L_IN1, HIGH);
    digitalWrite(PIN_MOTOR_L_IN2, LOW);
    ledcWrite(pwmChannelL, leftPwm);
  } else {
    digitalWrite(PIN_MOTOR_L_IN1, LOW);
    digitalWrite(PIN_MOTOR_L_IN2, HIGH);
    ledcWrite(pwmChannelL, abs(leftPwm));
  }

  // Cài đặt chiều quay và xuất lực cho động cơ Phải
  if (rightPwm >= 0) {
    digitalWrite(PIN_MOTOR_R_IN3, HIGH);
    digitalWrite(PIN_MOTOR_R_IN4, LOW);
    ledcWrite(pwmChannelR, rightPwm);
  } else {
    digitalWrite(PIN_MOTOR_R_IN3, LOW);
    digitalWrite(PIN_MOTOR_R_IN4, HIGH);
    ledcWrite(pwmChannelR, abs(rightPwm));
  }
}

// Hàm tính toán lái vi sai từ X, Y
void processDrive(float x, float y, int speedLimit) {
  float maxPwm = (speedLimit / 100.0) * 255.0;
  
  float forward = y * maxPwm;
  float steering = x * maxPwm;

  int leftPwm = (int)(forward + steering);
  int rightPwm = (int)(forward - steering);

  // Giới hạn trong khoảng -255 đến 255
  leftPwm = constrain(leftPwm, -255, 255);
  rightPwm = constrain(rightPwm, -255, 255);

  // Kiểm tra an toàn khoảng cách va chạm (Auto-brake)
#if ENABLE_ULTRASONIC
  // Sử dụng giá trị khoảng cách đã cache trong bộ nhớ để phản hồi tức thời (<1ms)
  if (currentDistance > 0 && currentDistance <= 15.0 && y > 0) {
    // Phanh khẩn cấp nếu đi tiến mà có vật cản gần
    leftPwm = 0;
    rightPwm = 0;
  }
#endif

  driveMotors(leftPwm, rightPwm);
}

// ================= CÁC HÀM CẢM BIẾN (SENSORS) =================
float readDistance() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  
  // Tối ưu hóa: Giảm timeout xuống 8000us (~1.3m) để tránh treo CPU khi cảm biến lỗi
  long duration = pulseIn(PIN_ECHO, HIGH, 8000); 
  if (duration == 0) return -1.0;
  return duration * 0.034 / 2.0; // Quy đổi ra cm
}

float readBatteryVoltage() {
  int rawAdc = analogRead(PIN_BATTERY_ADC);
  // Giả sử dùng cầu phân áp điện trở 10k và 100k để đo pin 3S (12.6V max)
  // ADC ESP32 tối đa 3.3V tương ứng với độ phân giải 12-bit (0-4095)
  float pinVoltage = (rawAdc / 4095.0) * 3.3;
  float batteryVoltage = pinVoltage * 11.0; // Hệ số nhân phân áp (100k+10k)/10k
  return batteryVoltage;
}

// ================= SỰ KIỆN WEBSOCKET (WEBSOCKET EVENTS) =================
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Mất kết nối tới server!");
      break;
    case WStype_CONNECTED:
      Serial.println("[WS] Kết nối WebSocket thành công!");
      // Gửi gói handshake Socket.IO Connect
      webSocket.sendTXT("40");
      break;
    case WStype_TEXT:
      {
        String strPayload = String((char*)payload);

        // 1. Trả lời Ping từ Socket.IO / Engine.IO Server để giữ kết nối (Heartbeat)
        if (strPayload == "2") {
          webSocket.sendTXT("3"); // Pong
          return;
        }

        // 2. Xử lý gói Handshake mở kết nối từ Server
        if (strPayload.startsWith("0")) {
          webSocket.sendTXT("40"); // Socket.IO Connect
          return;
        }

        // 3. Trích xuất và giải mã gói tin JSON từ tin nhắn Socket.IO 42["drive_command", {...}]
        int jsonStart = strPayload.indexOf('{');
        int jsonEnd = strPayload.lastIndexOf('}');

        if (jsonStart != -1 && jsonEnd != -1 && jsonEnd > jsonStart) {
          String jsonSub = strPayload.substring(jsonStart, jsonEnd + 1);
          StaticJsonDocument<256> doc;
          DeserializationError error = deserializeJson(doc, jsonSub);
          if (error) {
            Serial.print("[WS] Giải mã JSON thất bại: ");
            Serial.println(error.c_str());
            return;
          }

          // Đọc dữ liệu từ gói tin điều khiển
          if (doc.containsKey("x") && doc.containsKey("y")) {
            lastCommandTime = millis(); // Reset thời gian Failsafe
            
            // Chỉ lấy lệnh từ WebSocket nếu đang ở chế độ điều khiển qua Web
            if (!isRcMode) {
              currentX = doc["x"];
              currentY = doc["y"];
              currentSpeedLimit = doc["speedLimit"];
              processDrive(currentX, currentY, currentSpeedLimit);
            }
          }

          // Cập nhật góc quay Servo Camera từ Web qua WebSocket (nếu có)
          if (doc.containsKey("camAngle")) {
            int targetAngle = doc["camAngle"];
            targetAngle = constrain(targetAngle, 0, 180);
            if (!isRcMode && abs(targetAngle - currentCamAngle) >= 2) {
              currentCamAngle = targetAngle;
              camServo.write(currentCamAngle);
            }
          }
        }
      }
      break;
    default:
      break;
  }
}

// ================= THIẾT LẬP BAN ĐẦU (SETUP) =================
void setup() {
  Serial.begin(115200);

  // 1. Khởi tạo cổng đọc S.BUS (Serial2)
  // Baudrate 100000, cấu hình SERIAL_8E2 (8 data bits, Even parity, 2 stop bits)
  // Chân RX là GPIO 16, chân TX đặt là -1 (không dùng), tham số cuối true để đảo ngược tín hiệu ở mức phần cứng
  Serial2.begin(100000, SERIAL_8E2, PIN_RC_SBUS_RX, -1, true);
  Serial.println("[S.BUS] Khởi tạo Serial2 đọc bộ thu MC6C thành công.");

  // 2. Cấu hình chân Động cơ
  pinMode(PIN_MOTOR_L_IN1, OUTPUT);
  pinMode(PIN_MOTOR_L_IN2, OUTPUT);
  pinMode(PIN_MOTOR_R_IN3, OUTPUT);
  pinMode(PIN_MOTOR_R_IN4, OUTPUT);

  // Cấu hình LEDC PWM điều tốc trên ESP32
  ledcSetup(pwmChannelL, pwmFreq, pwmResolution);
  ledcAttachPin(PIN_MOTOR_L_PWM, pwmChannelL);

  ledcSetup(pwmChannelR, pwmFreq, pwmResolution);
  ledcAttachPin(PIN_MOTOR_R_PWM, pwmChannelR);
  
  driveMotors(0, 0); // Dừng xe lúc đầu

  // 3. Cấu hình chân cảm biến
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_BATTERY_ADC, INPUT);

  // 4. Kết nối WiFi
  WiFi.begin(ssid, password);
  Serial.print("[WiFi] Đang kết nối ");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WiFi] Đã kết nối thành công!");
  Serial.print("[WiFi] Địa chỉ IP ESP32: ");
  Serial.println(WiFi.localIP());

  // 5. Khởi tạo WebSocket Client kết nối đến Server
  webSocket.begin(ws_host, ws_port, "/socket.io/?EIO=4&transport=websocket&role=device");
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000); // Thử lại sau 5s nếu đứt kết nối

  // 6. Cấu hình Servo Camera (Đã tắt do chuyển sang chế độ di chuột quay toàn bộ xe)
  /* 
  ESP32PWM::allocateTimer(2);
  camServo.setPeriodHertz(50);
  camServo.attach(PIN_CAM_SERVO, 500, 2400);
  camServo.write(currentCamAngle);
  */
  Serial.println("[SYSTEM] Hệ thống sẵn sàng ở chế độ di chuột quay tại chỗ.");
}

// ================= VÒNG LẶP CHÍNH (LOOP) =================
void loop() {
  webSocket.loop();

  // Đọc và giải mã liên tục dữ liệu từ S.BUS
  parseSbus();

  // 1. Kiểm tra vị trí công tắc CH5 để chuyển đổi chế độ Lái
  // CH5 gạt lên là RC Mode (~2000us), gạt xuống là Web Mode (~1000us)
  if (rc_ch5_val > 1600) {
    if (!isRcMode) {
      isRcMode = true;
      Serial.println("[MODE] Nhận tín hiệu S.BUS: Đã chuyển sang lái bằng TAY MC6C.");
    }
  } else {
    if (isRcMode) {
      isRcMode = false;
      Serial.println("[MODE] Nhận tín hiệu S.BUS: Đã chuyển sang lái bằng WEB COCKPIT.");
      driveMotors(0, 0); // Dừng động cơ khi chuyển giao chế độ
    }
  }

  // 2. Chế độ RC Mode: Đọc cần gạt để tính toán tốc độ lái vi sai & Servo camera
  if (isRcMode) {
    // Chuyển đổi độ rộng xung (1000us-2000us) sang khoảng -1.0 đến 1.0
    // Lọc vùng chết ở giữa (Deadzone = 40us) để chống rung trôi cần gạt
    float x = 0;
    float y = 0;
    
    if (abs(rc_ch1_val - 1500) > 40) {
      x = (rc_ch1_val - 1500) / 500.0;
    }
    if (abs(rc_ch2_val - 1500) > 40) {
      y = (rc_ch2_val - 1500) / 500.0;
    }

    // CH3: Điều chỉnh tốc độ phần trăm giới hạn (20% đến 100%)
    int rcSpeedLimit = map(rc_ch3_val, 1000, 2000, 20, 100);
    rcSpeedLimit = constrain(rcSpeedLimit, 20, 100);

    processDrive(x, y, rcSpeedLimit);

    // CH4: Điều khiển góc quay Servo Camera (0 đến 180 độ)
    int rcCamAngle = map(rc_ch4_val, 1000, 2000, 0, 180);
    rcCamAngle = constrain(rcCamAngle, 0, 180);
    if (abs(rcCamAngle - currentCamAngle) >= 2) {
      currentCamAngle = rcCamAngle;
      camServo.write(currentCamAngle);
    }
  } else {
    // Chế độ Web Mode: Kích hoạt phanh an toàn (Failsafe) khi mất sóng WebSocket quá lâu
    if (millis() - lastCommandTime > failsafeTimeout) {
      driveMotors(0, 0);
    }
  }
  
  // 3. Đọc cảm biến siêu âm định kỳ mỗi 60ms để không chặn luồng WebSocket
#if ENABLE_ULTRASONIC
  if (millis() - lastDistanceReadTime > 60) {
    lastDistanceReadTime = millis();
    currentDistance = readDistance();
  }
#else
  currentDistance = 999.0;
#endif

  // 4. Phát Telemetry lên Web định kỳ mỗi 200ms
  if (millis() - lastTelemetryTime > 200) {
    lastTelemetryTime = millis();
    
    float batVolt = 12.0; // Mặc định báo đầy pin khi không có cảm biến đo
#if ENABLE_BATTERY_MONITOR
    batVolt = readBatteryVoltage();
#endif

    // Tính phần trăm pin (Đối với pin Lipo 3S: 10.5V cạn - 12.6V đầy)
    float batPct = ((batVolt - 10.5) / 2.1) * 100.0;
    batPct = constrain(batPct, 0.0, 100.0);

    // Tính tốc độ động cơ tương đối để gửi lên giao diện
    int speedVal = 0;
    if (isRcMode) {
      speedVal = (int)(sqrt(pow(rc_ch1_val-1500,2) + pow(rc_ch2_val-1500,2)) / 5.0);
    } else {
      // Ở chế độ Web, lấy tốc độ ước lượng từ biến điều khiển
      speedVal = (int)(sqrt(currentX*currentX + currentY*currentY) * currentSpeedLimit);
    }

    float temp = 33.0 + (speedVal * 0.05); // Mô phỏng nhiệt độ sinh ra theo tải động cơ

    // Đóng gói JSON gửi lên Web qua Socket
    StaticJsonDocument<256> telemetryDoc;
    telemetryDoc["batteryPercentage"] = (int)batPct;
    telemetryDoc["batteryVoltage"] = batVolt;
    telemetryDoc["distance"] = currentDistance;
    telemetryDoc["temperature"] = temp;
    int wifiRssi = WiFi.RSSI();
    telemetryDoc["rssi"] = wifiRssi;
    telemetryDoc["speed"] = speedVal;
    telemetryDoc["latency"] = 12; // Ping ước lượng

    String output;
    serializeJson(telemetryDoc, output);
    
    // Gửi gói tin qua Socket.io định dạng: 42["telemetry_data", data]
    String socketIoPacket = "42[\"telemetry_data\"," + output + "]";
    webSocket.sendTXT(socketIoPacket);
  }
}
