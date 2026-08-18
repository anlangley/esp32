#ifndef SENSOR_MANAGER_H
#define SENSOR_MANAGER_H

#include "config.h"

// Khởi tạo các chân cảm biến
void initSensorManager();

// Kích hoạt phát xung siêu âm HC-SR04
void triggerUltrasonicMeasure();

// Lấy khoảng cách đo được bằng Ngắt GPIO (Không block CPU)
float readDistanceNonBlocking();

// Đọc điện áp Pin qua cầu phân áp ADC
float readBatteryVoltage();

#endif // SENSOR_MANAGER_H
