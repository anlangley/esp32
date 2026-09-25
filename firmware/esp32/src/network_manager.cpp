#include "network_manager.h"
#include "motor_driver.h"
#include <WiFiUdp.h>

static WebSocketsClient webSocket;
static ControlCommand* pCmdState = nullptr;

static void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Mất kết nối tới server!");
      break;
    case WStype_CONNECTED:
      Serial.println("[WS] Đã mở cổng WebSocket, đang chờ Handshake...");
      break;
    case WStype_TEXT:
      {
        if (length == 0 || payload == nullptr) return;

        // Heartbeat Ping từ Socket.IO / Engine.IO (Không tạo String)
        if (payload[0] == '2') {
          webSocket.sendTXT("3"); // Pong
          return;
        }

        // Handshake kết nối thành công từ Server
        if (payload[0] == '0') {
          webSocket.sendTXT("40");
          Serial.println("[WS] Đã gửi gói Handshake (40) - Kết nối chính thức thành công!");
          return;
        }

        // Trích xuất gói tin JSON điều khiển: 42["drive_command", {...}]
        const char* pStart = strchr((const char*)payload, '{');
        const char* pEnd   = strrchr((const char*)payload, '}');

        if (pStart != nullptr && pEnd != nullptr && pEnd > pStart && pCmdState != nullptr) {
          StaticJsonDocument<256> doc;
          DeserializationError error = deserializeJson(doc, pStart, (size_t)(pEnd - pStart + 1));
          if (!error && doc.containsKey("x") && doc.containsKey("y")) {
            // FIX LỖI RACE CONDITION: Khóa Mutex khi cập nhật dữ liệu đa lõi (Core 0 -> Core 1)
            if (g_dataMutex != NULL && xSemaphoreTake(g_dataMutex, pdMS_TO_TICKS(5)) == pdTRUE) {
              pCmdState->x = doc["x"];
              pCmdState->y = doc["y"];
              pCmdState->speedLimit = doc["speedLimit"];
              pCmdState->lastCmdTime = millis();
              xSemaphoreGive(g_dataMutex);
            }
          }
          // Xử lý event Follow Mode: 42["follow_mode", {"enabled": true/false}]
          if (!error && doc.containsKey("enabled")) {
            bool followEnabled = doc["enabled"];
            setFollowMode(followEnabled);
            Serial.printf("[FOLLOW] Chế độ bám theo vật thể: %s\n", followEnabled ? "BẬT" : "TẮT");
          }
        }
      }
      break;
    default:
      break;
  }
}

void initNetworkManager(ControlCommand &cmdState) {
  pCmdState = &cmdState;

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);

  if (!WiFi.config(LOCAL_IP, GATEWAY, SUBNET, PRIMARY_DNS, SECONDARY_DNS)) {
    Serial.println("[WiFi] Cấu hình Static IP thất bại!");
  } else {
    Serial.println("[WiFi] Đã áp dụng IP Tĩnh: 192.168.1.200");
  }

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[WiFi] Đang kết nối ");
  unsigned long startConnect = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startConnect < 3000) {
    delay(100);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("\n[WiFi] Kết nối Wi-Fi thành công! IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WiFi] Chưa tìm thấy Wi-Fi -> Chuyển sang chế độ OFFLINE (Lái bằng MC6C).");
  }

  // Tự động dò tìm Server IP qua UDP Broadcast bằng Buffer cố định (Không dùng String)
  char targetServerIp[32];
  snprintf(targetServerIp, sizeof(targetServerIp), "%s", WS_HOST);

  if (WiFi.status() == WL_CONNECTED) {
    WiFiUDP udp;
    udp.begin(UDP_DISCOVERY_PORT);
    Serial.println("[UDP DISCOVERY] Đang phát gói tin tìm kiếm Server Node.js...");
    udp.beginPacket(IPAddress(255, 255, 255, 255), UDP_DISCOVERY_PORT);
    udp.print("DISCOVER_CAR_SERVER");
    udp.endPacket();

    unsigned long startWait = millis();
    char buffer[256];
    while (millis() - startWait < 1500) {
      int packetSize = udp.parsePacket();
      if (packetSize > 0) {
        int len = udp.read(buffer, sizeof(buffer) - 1);
        if (len > 0) {
          buffer[len] = 0;
          const char* jStart = strchr(buffer, '{');
          const char* jEnd   = strrchr(buffer, '}');
          if (jStart && jEnd && jEnd > jStart) {
            StaticJsonDocument<256> doc;
            if (!deserializeJson(doc, jStart, (size_t)(jEnd - jStart + 1))) {
              if (doc.containsKey("ip")) {
                snprintf(targetServerIp, sizeof(targetServerIp), "%s", doc["ip"].as<const char*>());
                Serial.printf("[UDP DISCOVERY] Tự động phát hiện Server IP: %s\n", targetServerIp);
                break;
              }
            }
          }
        }
      }
      delay(50);
    }
    udp.stop();
  }

  // Khởi tạo ArduinoOTA (Nạp code không dây - Không yêu cầu mật khẩu)
  ArduinoOTA.setHostname("esp32-car");
  ArduinoOTA.setPassword(NULL); // Bỏ xác thực mật khẩu khi nạp code không dây
  ArduinoOTA.onStart([]() {
    emergencyStop();
    Serial.println("\n[OTA] Bắt đầu nạp code không dây...");
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("\n[OTA] Nạp code không dây thành công! Đang khởi động lại...");
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("[OTA] Tiến trình: %u%%\r", (progress / (total / 100)));
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("[OTA] Lỗi nạp code: %u\n", error);
  });
  ArduinoOTA.begin();

  // Khởi tạo WebSocket Client kết nối đến Server IP kèm thông tin mã xe và MAC Address (GĐ 4)
  static char finalIpBuf[32];
  snprintf(finalIpBuf, sizeof(finalIpBuf), "%s", targetServerIp);

  String mac = WiFi.macAddress();
  static char wsPathBuf[160];
  snprintf(wsPathBuf, sizeof(wsPathBuf), "/socket.io/?EIO=4&transport=websocket&role=device&vehicle_code=%s&hardware_id=%s", VEHICLE_CODE, mac.c_str());
  Serial.printf("[WS] Đăng ký xe: Mã [%s] | MAC [%s]\n", VEHICLE_CODE, mac.c_str());

  webSocket.begin(finalIpBuf, WS_PORT, wsPathBuf);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void handleNetworkLoop() {
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWifiRetry = 0;
    if (millis() - lastWifiRetry > 4000) {
      lastWifiRetry = millis();
      WiFi.reconnect();
    }
  }

  ArduinoOTA.handle();
  webSocket.loop();
}

// FIX LỖI PHÂN MẢNH HEAP: Dùng snprintf thay cho String trong sendTelemetry (100% Zero-Heap-Allocation)
void sendTelemetry(const TelemetryData &data) {
  if (WiFi.status() != WL_CONNECTED) return;

  char packetBuf[320];
  int len = snprintf(packetBuf, sizeof(packetBuf),
    "42[\"telemetry_data\",{\"batteryPercentage\":%d,\"batteryVoltage\":%.2f,\"distance\":%.1f,\"temperature\":%.1f,\"rssi\":%d,\"speed\":%d,\"latency\":%d,\"isRcMode\":%s,\"rcThrottle\":%d,\"rcSteer\":%d}]",
    (int)data.batteryPercentage,
    data.batteryVoltage,
    data.distance,
    data.temperature,
    data.rssi,
    data.speed,
    data.latency,
    data.isRcMode ? "true" : "false",
    data.rcThrottle,
    data.rcSteer
  );

  if (len > 0 && len < (int)sizeof(packetBuf)) {
    webSocket.sendTXT(packetBuf, (size_t)len);
  }
}

bool isWifiConnected() {
  return WiFi.status() == WL_CONNECTED;
}
