#ifndef NETWORK_MANAGER_H
#define NETWORK_MANAGER_H

#include "config.h"
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>

// Handle Mutex dùng chung giữa các Task (được định nghĩa trong main.cpp)
extern SemaphoreHandle_t g_dataMutex;

// Khởi tạo WiFi, WebSocketsClient và ArduinoOTA
void initNetworkManager(ControlCommand &cmdState);

// Xử lý các sự kiện mạng (Gọi định kỳ trong Task Network)
void handleNetworkLoop();

// Gửi Telemetry JSON lên Server (Zero-Heap Allocation)
void sendTelemetry(const TelemetryData &data);

// Kiểm tra trạng thái Wi-Fi
bool isWifiConnected();

#endif // NETWORK_MANAGER_H
