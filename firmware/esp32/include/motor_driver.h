#ifndef MOTOR_DRIVER_H
#define MOTOR_DRIVER_H

#include "config.h"

// Khởi tạo các chân điều khiển động cơ và kênh PWM
void initMotorDriver();

// Điều khiển động cơ trực tiếp với PWM (-255 đến 255)
void driveMotorsDirect(int leftPwm, int rightPwm);

// Cập nhật gia tốc mượt (Linear Acceleration Ramping) chống sụt áp
void updateMotorRamp(int targetLeftPwm, int targetRightPwm, float currentDistance, float yInput);

// Tính toán lái vi sai từ X, Y và giới hạn tốc độ %
void processDrive(float x, float y, int speedLimit, float currentDistance);

// Phanh dừng khẩn cấp lập tức
void emergencyStop();

// Lấy PWM hiện tại (ước lượng tốc độ)
int getCurrentLeftPwm();
int getCurrentRightPwm();

// Kiểm tra xe có đang trong chế độ tự động lùi tránh vật cản hay không
bool isAutoReversing();

// Chế độ bám theo vật thể (Follow Mode)
void setFollowMode(bool enabled);
bool isFollowMode();

#endif // MOTOR_DRIVER_H


