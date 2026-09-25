/*
 * main.cpp - ESP32 IoT Car Controller (FreeRTOS Dual-Core & Modular Version)
 * Hỗ trợ: 4 Động cơ giảm tốc vàng + Mạch cầu H L298N/BTS7960
 * Bộ thu MC6C chế độ S.BUS (Hardware Serial2 - GPIO 16)
 * Cảm biến siêu âm HC-SR04 + Truyền WebSocket thời gian thực (Socket.IO protocol)
 */

#include <Arduino.h>
#include <esp_task_wdt.h>

#include "config.h"
#include "motor_driver.h"
#include "sbus_parser.h"
#include "sensor_manager.h"
#include "network_manager.h"

// Biến trạng thái toàn cục
static ControlCommand g_cmdState = {0.0f, 0.0f, 80, 0};
static RCState        g_rcState  = {1500, 1500, 1500, 1500, 1000, 1000, false, false, false, 0};
static float          g_currentDistance = 999.0f;

// Mutex đảm bảo an toàn truy cập dữ liệu giữa 2 Core
SemaphoreHandle_t g_dataMutex = NULL;

// ================= KHỞI TẠO WATCHDOG TIMER =================
static void initWatchdog() {
#if defined(ESP_IDF_VERSION_MAJOR) && (ESP_IDF_VERSION_MAJOR >= 5)
  esp_task_wdt_config_t twdt_config = {
    .timeout_ms = WDT_TIMEOUT_SEC * 1000,
    .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
    .trigger_panic = true
  };
  esp_task_wdt_init(&twdt_config);
#else
  esp_task_wdt_init(WDT_TIMEOUT_SEC, true);
#endif
  Serial.println("[WDT] Khởi tạo Task Watchdog Timer thành công (Timeout: 5s).");
}

// ================= TASK 1 (CORE 1): LÁI VI SAI, S.BUS & CẢM BIẾN (100Hz) =================
static void taskControlAndSensors(void *pvParameters) {
  // FIX LỖI WDT: Đăng ký Task Core 1 với Watchdog Timer
  esp_task_wdt_add(NULL);

  TickType_t xLastWakeTime = xTaskGetTickCount();
  const TickType_t xFrequency = pdMS_TO_TICKS(10); // Chu kỳ 10ms (100Hz)

  unsigned long lastTrigTime = 0;

  for (;;) {
    // Reset Watchdog cho Core 1
    esp_task_wdt_reset();

    // 1. Giải mã dữ liệu S.BUS từ UART Serial2 liên tục
    parseSbusStream(g_rcState);

    // 2. Kích hoạt trigger cảm biến siêu âm định kỳ mỗi 60ms (Đo ngắt Non-blocking)
    if (millis() - lastTrigTime > 60) {
      lastTrigTime = millis();
      triggerUltrasonicMeasure();
    }
    // FIX LỖI BLOCK CPU: Đọc khoảng cách từ ngắt GPIO (0% blocking CPU)
    g_currentDistance = readDistanceNonBlocking();

    // 3. Kiểm tra chuyển đổi chế độ Lái (Công tắc CH6 > 1600us và nhận S.BUS hợp lệ trong 1s qua)
    bool sbusValid = (millis() - g_rcState.lastValidTime <= 1000);
    if (sbusValid && g_rcState.ch6 > 1600) {
      if (!g_rcState.isRcMode) {
        g_rcState.isRcMode = true;
        Serial.println("[MODE] Nhận tín hiệu S.BUS -> Chuyển sang lái bằng TAY MC6C.");
      }
    } else {
      if (g_rcState.isRcMode) {
        g_rcState.isRcMode = false;
        Serial.println("[MODE] Mất/Tắt tín hiệu S.BUS -> Chuyển sang lái bằng WEB COCKPIT.");
        emergencyStop();
      }
    }

    // FIX LỖI RACE CONDITION: Bọc Mutex khi đọc dữ liệu g_cmdState từ Core 0 truyền sang
    ControlCommand localCmd;
    if (g_dataMutex != NULL && xSemaphoreTake(g_dataMutex, pdMS_TO_TICKS(2)) == pdTRUE) {
      localCmd = g_cmdState;
      xSemaphoreGive(g_dataMutex);
    } else {
      localCmd = g_cmdState; // Fallback an toàn nếu Mutex đang bị giữ
    }

    // 4. Xử lý lái theo từng Chế độ (RC Mode vs Web Mode)

    // Ưu tiên cao nhất: Follow Mode (bám theo vật thể bằng cảm biến siêu âm)
    #if ENABLE_ULTRASONIC && ENABLE_FOLLOW_MODE
    if (isFollowMode()) {
      // Follow Mode hoạt động độc lập, gửi y=0 để updateMotorRamp tự tính PWM theo khoảng cách
      processDrive(0.0f, 0.0f, 100, g_currentDistance);
    } else
    #endif
    if (g_rcState.isRcMode) {
      // Kiểm tra cờ Failsafe S.BUS hoặc timeout 500ms
      if (g_rcState.isFailsafe || (millis() - g_rcState.lastValidTime > SBUS_FAILSAFE_TIMEOUT_MS)) {
        // Failsafe S.BUS: Vẫn cho phép lùi tự động nếu có vật cản trong vùng báo động
        #if ENABLE_ULTRASONIC && ENABLE_ULTRASONIC_AUTO_REVERSE
        if (g_currentDistance >= 2.0f && g_currentDistance <= ULTRASONIC_ALARM_DIST_CM) {
          processDrive(0.0f, 0.0f, 80, g_currentDistance);
        } else {
          emergencyStop();
        }
        #else
        emergencyStop();
        #endif
      } else {
        float x = 0.0f;
        float y = 0.0f;
        
        // Deadzone 40us chống trôi cần gạt
        // Kênh 1 (CH1): Quay trái / phải (x) - Đảo dấu riêng cho tay phát MC6C + Steering Gain 1.4x
        if (abs(g_rcState.ch1 - 1500) > 40) {
          x = -((g_rcState.ch1 - 1500) / 400.0f) * 1.4f;
          x = constrain(x, -1.0f, 1.0f);
        }
        // Kênh 3 (CH3): Tiến / lùi (y) - Đẩy lên = Tiến (y > 0), Kéo xuống = Lùi (y < 0)
        if (abs(g_rcState.ch3 - 1500) > 40) {
          y = -((g_rcState.ch3 - 1500) / 400.0f);
          y = constrain(y, -1.0f, 1.0f);
        }

        // Tốc độ max 100% cố định khi ở chế độ S.BUS
        int rcSpeedLimit = 100;

        processDrive(x, y, rcSpeedLimit, g_currentDistance);
      }
    } else {
      // Chế độ Web Mode: Kiểm tra Failsafe mất tín hiệu WebSocket quá 1.5s
      if (millis() - localCmd.lastCmdTime > WEB_FAILSAFE_TIMEOUT_MS) {
        // Failsafe Web: Vẫn cho phép lùi tự động nếu có vật cản trong vùng báo động
        #if ENABLE_ULTRASONIC && ENABLE_ULTRASONIC_AUTO_REVERSE
        if (g_currentDistance >= 2.0f && g_currentDistance <= ULTRASONIC_ALARM_DIST_CM) {
          processDrive(0.0f, 0.0f, 80, g_currentDistance);
        } else {
          emergencyStop();
        }
        #else
        emergencyStop();
        #endif
      } else {
        processDrive(localCmd.x, localCmd.y, localCmd.speedLimit, g_currentDistance);
      }
    }

    vTaskDelayUntil(&xLastWakeTime, xFrequency);
  }
}

// ================= TASK 2 (CORE 0): NETWORK, WEBSOCKET & TELEMETRY =================
static void taskNetworkAndTelemetry(void *pvParameters) {
  // FIX LỖI WDT: Đăng ký Task Core 0 với Watchdog Timer
  esp_task_wdt_add(NULL);

  unsigned long lastTelemetryTime = 0;

  for (;;) {
    // Reset Watchdog cho Core 0
    esp_task_wdt_reset();

    // Xử lý các sự kiện Wi-Fi, WebSockets & ArduinoOTA
    handleNetworkLoop();

    // Gửi Telemetry dữ liệu lên Web định kỳ mỗi 200ms
    if (millis() - lastTelemetryTime > 200) {
      lastTelemetryTime = millis();

      float batVolt = readBatteryVoltage();
      float batPct = constrain(((batVolt - 10.5f) / 2.1f) * 100.0f, 0.0f, 100.0f);

      // Tốc độ ước lượng từ PWM thực tế
      int leftPwm = abs(getCurrentLeftPwm());
      int rightPwm = abs(getCurrentRightPwm());
      int speedVal = (leftPwm + rightPwm) / 2;

      float temp = 33.0f + (speedVal * 0.05f); // Nhiệt độ ước tính theo tải

      TelemetryData telemetry;
      telemetry.batteryPercentage = batPct;
      telemetry.batteryVoltage    = batVolt;
      telemetry.distance          = g_currentDistance;
      telemetry.temperature       = temp;
      telemetry.rssi             = WiFi.RSSI();
      telemetry.speed            = speedVal;
      telemetry.latency          = 12;
      telemetry.isRcMode         = g_rcState.isRcMode;
      telemetry.rcThrottle       = g_rcState.ch3;
      telemetry.rcSteer          = g_rcState.ch1;

      sendTelemetry(telemetry);
    }

    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// ================= SETUP (KHỞI TẠO HỆ THỐNG) =================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n==============================================");
  Serial.println("   ESP32 IoT Car Firmware (FreeRTOS v2.0)     ");
  Serial.println("==============================================");

  // 1. Tạo Mutex khóa dữ liệu
  g_dataMutex = xSemaphoreCreateMutex();

  // 2. Khởi tạo các Module Phần cứng
  initMotorDriver();
  initSbusParser();
  initSensorManager();
  initNetworkManager(g_cmdState);

  // 3. Khởi tạo Watchdog Timer
  initWatchdog();

  // 4. Khởi tạo và gán các Task vào 2 Core của ESP32
  // Task Control & Sensors: Core 1 (Ưu tiên cao nhất - Priority 5)
  xTaskCreatePinnedToCore(
    taskControlAndSensors,
    "TaskControl",
    4096,
    NULL,
    5,
    NULL,
    1 // Core 1
  );

  // Task Network & Telemetry: Core 0 (Priority 1)
  xTaskCreatePinnedToCore(
    taskNetworkAndTelemetry,
    "TaskNetwork",
    4096,
    NULL,
    1,
    NULL,
    0 // Core 0
  );

  Serial.println("[SYSTEM] Tất cả Task FreeRTOS đã được khởi chạy thành công!");
}

// ================= LOOP (KHÔNG DÙNG NỮA VÌ DÙNG FREERTOS TASKS) =================
void loop() {
  // Tự hủy luồng loop mặc định để giải phóng tài nguyên cho FreeRTOS
  vTaskDelete(NULL);
}
