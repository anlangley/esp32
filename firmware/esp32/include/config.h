#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>
#include <WiFi.h>

// ================= CẤU HÌNH MẠNG & SERVER =================
const char* const WIFI_SSID = "FPT Bao An 2.4";
const char* const WIFI_PASS = "anhquynh1";
const char* const WS_HOST   = "192.168.1.23"; // IP mặc định dự phòng nếu không tìm thấy UDP
const int         WS_PORT   = 3000;
const int         UDP_DISCOVERY_PORT = 41234;

// Cấu hình IP Tĩnh (Static IP) cố định cho ESP32
const IPAddress LOCAL_IP(192, 168, 1, 200);
const IPAddress GATEWAY(192, 168, 1, 1);
const IPAddress SUBNET(255, 255, 255, 0);
const IPAddress PRIMARY_DNS(8, 8, 8, 8);
const IPAddress SECONDARY_DNS(8, 8, 4, 4);

// Cấu hình Watchdog Timer (Timeout tính bằng giây)
#define WDT_TIMEOUT_SEC 5

// Công tắc tính năng cảm biến
#define ENABLE_ULTRASONIC              true
#define ENABLE_ULTRASONIC_AUTO_REVERSE true
#define ENABLE_BATTERY_MONITOR         false

// Cấu hình tự động lùi tránh vật cản (Ultrasonic Auto-Reverse Avoidance)
const float ULTRASONIC_ALARM_DIST_CM      = 7.0f;    // Ngưỡng báo động lùi khẩn cấp (7cm)
const float ULTRASONIC_SAFE_DIST_CM       = 20.0f;   // Ngưỡng an toàn ngắt lùi (20cm)
const int   AUTO_REVERSE_PWM              = -204;    // Xung PWM lùi (80% của 255 = 204)
const unsigned long AUTO_REVERSE_MAX_TIME_MS = 3000; // Thời gian lùi tối đa (3000ms)

// Cấu hình chế độ Bám theo vật thể (Follow Mode)
#define ENABLE_FOLLOW_MODE true
const float FOLLOW_IDEAL_MIN_CM = 20.0f;  // Khoảng cách lý tưởng tối thiểu (20cm)
const float FOLLOW_IDEAL_MAX_CM = 30.0f;  // Khoảng cách lý tưởng tối đa (30cm)
const float FOLLOW_FAR_CM       = 40.0f;  // Xa hơn → tiến nhanh
const float FOLLOW_LOST_CM      = 100.0f; // Mất mục tiêu → dừng (>1m)
const int   FOLLOW_MAX_PWM      = 178;    // Tốc độ tiến tối đa khi bám theo (70% của 255)


// ================= CẤU HÌNH PINOUT ESP32 =================
// 1. Động cơ (Motor Driver Pins)
#define PIN_MOTOR_L_PWM  25
#define PIN_MOTOR_L_IN1  26
#define PIN_MOTOR_L_IN2  27

#define PIN_MOTOR_R_PWM  14
#define PIN_MOTOR_R_IN3  12
#define PIN_MOTOR_R_IN4  13

// LEDC PWM Settings (20kHz siêu âm - triệt tiêu tiếng e e kêu rít động cơ)
const int PWM_FREQ       = 20000;
const int PWM_RESOLUTION = 8; // 8-bit (0-255)

// 2. Cảm biến khoảng cách (HC-SR04)
#define PIN_TRIG  18
#define PIN_ECHO  19

// 3. Đo điện áp Pin (ADC)
#define PIN_BATTERY_ADC 34

// 4. Nhận tín hiệu S.BUS
#define PIN_RC_SBUS_RX 16

// ================= THỜI GIAN TIMEOUT (MS) =================
const unsigned long WEB_FAILSAFE_TIMEOUT_MS  = 1500;
const unsigned long SBUS_FAILSAFE_TIMEOUT_MS = 500;

// ================= CẤU TRÚC DỮ LIỆU CHUNG =================
struct ControlCommand {
  float x;          // -1.0 đến 1.0
  float y;          // -1.0 đến 1.0
  int speedLimit;   // % (20-100)
  unsigned long lastCmdTime;
};

struct RCState {
  int ch1;          // Steering (Quay trái/phải, 1000-2000)
  int ch2;          // Extra / Auxiliary
  int ch3;          // Throttle (Tiến/lùi, 1000-2000)
  int ch4;          // Extra / Servo
  int ch5;          // Auxiliary switch
  int ch6;          // Mode switch (Bật/Tắt S.BUS, 1000-2000)
  bool isRcMode;
  bool isFailsafe;
  bool isFrameLost;
  unsigned long lastValidTime;
};

struct TelemetryData {
  float batteryPercentage;
  float batteryVoltage;
  float distance;
  float temperature;
  int rssi;
  int speed;
  int latency;
};

#endif // CONFIG_H
