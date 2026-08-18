#include "motor_driver.h"

// Compatibility macros for ESP32 Arduino Core v2.x vs v3.x LEDC PWM
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  #define PWM_WRITE_LEFT(val)   ledcWrite(PIN_MOTOR_L_PWM, (val))
  #define PWM_WRITE_RIGHT(val)  ledcWrite(PIN_MOTOR_R_PWM, (val))
  #define PWM_ATTACH_LEFT()     ledcAttach(PIN_MOTOR_L_PWM, PWM_FREQ, PWM_RESOLUTION)
  #define PWM_ATTACH_RIGHT()    ledcAttach(PIN_MOTOR_R_PWM, PWM_FREQ, PWM_RESOLUTION)
#else
  #define PWM_WRITE_LEFT(val)   ledcWrite(0, (val))
  #define PWM_WRITE_RIGHT(val)  ledcWrite(1, (val))
  #define PWM_ATTACH_LEFT()     do { ledcSetup(0, PWM_FREQ, PWM_RESOLUTION); ledcAttachPin(PIN_MOTOR_L_PWM, 0); } while(0)
  #define PWM_ATTACH_RIGHT()    do { ledcSetup(1, PWM_FREQ, PWM_RESOLUTION); ledcAttachPin(PIN_MOTOR_R_PWM, 1); } while(0)
#endif

// Trạng thái PWM thực tế hiện tại (sau khi nắn dốc ramping)
static int actualLeftPwm = 0;
static int actualRightPwm = 0;

// Trạng thái tự động lùi né vật cản
static bool s_isAutoReversing = false;
static unsigned long s_autoReverseStartTime = 0;

// Trạng thái chế độ bám theo vật thể (Follow Mode)
static bool s_followModeEnabled = false;

// Bước tăng/giảm PWM mỗi lần Ramp update (10ms task cycle)
// Ví dụ: RAMP_STEP = 20 -> Chạy từ 0 lên 255 hết ~125ms, rất mượt và triệt tiêu Inrush Current
const int RAMP_STEP = 25;

void initMotorDriver() {
  pinMode(PIN_MOTOR_L_IN1, OUTPUT);
  pinMode(PIN_MOTOR_L_IN2, OUTPUT);
  pinMode(PIN_MOTOR_R_IN3, OUTPUT);
  pinMode(PIN_MOTOR_R_IN4, OUTPUT);

  PWM_ATTACH_LEFT();
  PWM_ATTACH_RIGHT();

  driveMotorsDirect(0, 0);
}

void driveMotorsDirect(int leftPwm, int rightPwm) {
  actualLeftPwm = leftPwm;
  actualRightPwm = rightPwm;

  // Động cơ Trái
  if (leftPwm >= 0) {
    digitalWrite(PIN_MOTOR_L_IN1, HIGH);
    digitalWrite(PIN_MOTOR_L_IN2, LOW);
    PWM_WRITE_LEFT(leftPwm);
  } else {
    digitalWrite(PIN_MOTOR_L_IN1, LOW);
    digitalWrite(PIN_MOTOR_L_IN2, HIGH);
    PWM_WRITE_LEFT(abs(leftPwm));
  }

  // Động cơ Phải
  if (rightPwm >= 0) {
    digitalWrite(PIN_MOTOR_R_IN3, HIGH);
    digitalWrite(PIN_MOTOR_R_IN4, LOW);
    PWM_WRITE_RIGHT(rightPwm);
  } else {
    digitalWrite(PIN_MOTOR_R_IN3, LOW);
    digitalWrite(PIN_MOTOR_R_IN4, HIGH);
    PWM_WRITE_RIGHT(abs(rightPwm));
  }
}

void updateMotorRamp(int targetLeftPwm, int targetRightPwm, float currentDistance, float yInput) {
#if ENABLE_ULTRASONIC
  #if ENABLE_ULTRASONIC_AUTO_REVERSE
  // 1. Kiểm tra điều kiện kích hoạt Tự động lùi tránh (Auto-Reverse Avoidance)
  // Ngưỡng báo động 7cm, khi người dùng không chủ động gạt cần lùi (yInput >= 0)
  if (currentDistance >= 2.0f && currentDistance <= ULTRASONIC_ALARM_DIST_CM && yInput >= -0.1f) {
    if (!s_isAutoReversing) {
      s_isAutoReversing = true;
      s_autoReverseStartTime = millis();
    }
  }

  // 2. Xử lý trạng thái đang lùi né vật cản
  if (s_isAutoReversing) {
    bool timeExpired = (millis() - s_autoReverseStartTime > AUTO_REVERSE_MAX_TIME_MS);
    bool distanceSafe = (currentDistance >= ULTRASONIC_SAFE_DIST_CM);
    bool userManualReverse = (yInput < -0.1f); // Người dùng chủ động gạt cần lùi

    if (timeExpired || distanceSafe || userManualReverse) {
      s_isAutoReversing = false; // Thoát chế độ lùi tự động
    } else {
      // Ép target PWM lùi với công suất 80% (AUTO_REVERSE_PWM = -204)
      targetLeftPwm = AUTO_REVERSE_PWM;
      targetRightPwm = AUTO_REVERSE_PWM;
    }
  }
  #else
  // Failsafe phanh dừng khẩn cấp mặc định (chỉ ngắt tiến)
  if (currentDistance >= 2.0f && currentDistance <= ULTRASONIC_ALARM_DIST_CM && yInput > 0.0f) {
    targetLeftPwm = 0;
    targetRightPwm = 0;
  }
  #endif
#endif

  // 3. Follow Mode: Bám theo vật thể phía trước bằng cảm biến siêu âm
#if ENABLE_ULTRASONIC && ENABLE_FOLLOW_MODE
  if (s_followModeEnabled && !s_isAutoReversing) {
    if (currentDistance >= 2.0f && currentDistance < FOLLOW_LOST_CM) {
      // Tính toán PWM tỷ lệ theo khoảng cách
      if (currentDistance > FOLLOW_FAR_CM) {
        // Xa hơn 40cm → tiến nhanh (70% PWM)
        targetLeftPwm = FOLLOW_MAX_PWM;
        targetRightPwm = FOLLOW_MAX_PWM;
      } else if (currentDistance > FOLLOW_IDEAL_MAX_CM) {
        // 30-40cm → tiến chậm dần (tỷ lệ tuyến tính)
        float ratio = (currentDistance - FOLLOW_IDEAL_MAX_CM) / (FOLLOW_FAR_CM - FOLLOW_IDEAL_MAX_CM);
        int followPwm = (int)(ratio * FOLLOW_MAX_PWM);
        followPwm = constrain(followPwm, 40, FOLLOW_MAX_PWM); // PWM tối thiểu 40 để xe còn chạy được
        targetLeftPwm = followPwm;
        targetRightPwm = followPwm;
      } else if (currentDistance >= FOLLOW_IDEAL_MIN_CM) {
        // 20-30cm → Khoảng cách lý tưởng, dừng lại
        targetLeftPwm = 0;
        targetRightPwm = 0;
      }
      // < 20cm → để auto-reverse xử lý (nếu < 7cm) hoặc dừng
    } else {
      // Mất mục tiêu (>100cm hoặc <2cm) → dừng
      targetLeftPwm = 0;
      targetRightPwm = 0;
    }
  }
#endif

  // Nội suy mượt cho Động cơ Trái
  if (actualLeftPwm < targetLeftPwm) {
    actualLeftPwm += RAMP_STEP;
    if (actualLeftPwm > targetLeftPwm) actualLeftPwm = targetLeftPwm;
  } else if (actualLeftPwm > targetLeftPwm) {
    actualLeftPwm -= RAMP_STEP;
    if (actualLeftPwm < targetLeftPwm) actualLeftPwm = targetLeftPwm;
  }

  // Nội suy mượt cho Động cơ Phải
  if (actualRightPwm < targetRightPwm) {
    actualRightPwm += RAMP_STEP;
    if (actualRightPwm > targetRightPwm) actualRightPwm = targetRightPwm;
  } else if (actualRightPwm > targetRightPwm) {
    actualRightPwm -= RAMP_STEP;
    if (actualRightPwm < targetRightPwm) actualRightPwm = targetRightPwm;
  }

  driveMotorsDirect(actualLeftPwm, actualRightPwm);
}

void processDrive(float x, float y, int speedLimit, float currentDistance) {
  float maxPwm = (speedLimit / 100.0f) * 255.0f;
  
  float forward = y * maxPwm;
  // Trục steering (-x): Khôi phục chuẩn chiều rẽ cho Web Cockpit
  float steering = -x * maxPwm;

  int targetLeftPwm = (int)(forward + steering);
  int targetRightPwm = (int)(forward - steering);

  targetLeftPwm = constrain(targetLeftPwm, -255, 255);
  targetRightPwm = constrain(targetRightPwm, -255, 255);

  updateMotorRamp(targetLeftPwm, targetRightPwm, currentDistance, y);
}

void emergencyStop() {
  s_isAutoReversing = false;
  driveMotorsDirect(0, 0);
}

int getCurrentLeftPwm() {
  return actualLeftPwm;
}

int getCurrentRightPwm() {
  return actualRightPwm;
}

bool isAutoReversing() {
  return s_isAutoReversing;
}

void setFollowMode(bool enabled) {
  s_followModeEnabled = enabled;
  if (!enabled) {
    // Tắt Follow Mode → dừng xe ngay
    driveMotorsDirect(0, 0);
  }
}

bool isFollowMode() {
  return s_followModeEnabled;
}

