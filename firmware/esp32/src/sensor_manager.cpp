#include "sensor_manager.h"

#if ENABLE_ULTRASONIC
static volatile uint32_t s_echoStartTime = 0;
static volatile uint32_t s_echoDuration = 0;
static volatile bool     s_newDistanceAvailable = false;
static float            s_cachedDistance = 999.0f;

// ISR xử lý ngắt bắt cạnh xung ECHO (100% Non-blocking, loại bỏ pulseIn)
static void IRAM_ATTR echoIsrHandler() {
  uint32_t now = micros();
  if (digitalRead(PIN_ECHO) == HIGH) {
    s_echoStartTime = now;
  } else {
    if (s_echoStartTime > 0) {
      s_echoDuration = now - s_echoStartTime;
      s_newDistanceAvailable = true;
      s_echoStartTime = 0;
    }
  }
}
#endif

void initSensorManager() {
#if ENABLE_ULTRASONIC
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  digitalWrite(PIN_TRIG, LOW);

  // Đăng ký ngắt CHANGE cho chân ECHO để đo độ rộng xung hoàn toàn không block CPU
  attachInterrupt(digitalPinToInterrupt(PIN_ECHO), echoIsrHandler, CHANGE);
#endif

#if ENABLE_BATTERY_MONITOR
  pinMode(PIN_BATTERY_ADC, INPUT);
#endif
}

void triggerUltrasonicMeasure() {
#if ENABLE_ULTRASONIC
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
#endif
}

float readDistanceNonBlocking() {
#if ENABLE_ULTRASONIC
  if (s_newDistanceAvailable) {
    s_newDistanceAvailable = false;
    uint32_t duration = s_echoDuration;

    if (duration == 0 || duration > 35000) {
      s_cachedDistance = 999.0f;
    } else {
      s_cachedDistance = (float)duration * 0.0343f / 2.0f;
    }
  }
  return s_cachedDistance;
#else
  return 999.0f;
#endif
}

float readBatteryVoltage() {
#if ENABLE_BATTERY_MONITOR
  int sumAdc = 0;
  for (int i = 0; i < 10; i++) {
    sumAdc += analogRead(PIN_BATTERY_ADC);
  }
  float rawAdc = sumAdc / 10.0f;
  float pinVoltage = (rawAdc / 4095.0f) * 3.3f;
  return pinVoltage * 11.0f; 
#else
  return 12.6f;
#endif
}
