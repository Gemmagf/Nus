#pragma once
// ============================================================
// imu.h — Driver IMU MPU-6050 (acceleròmetre + giroscopi)
// Massiu Soft SL
// ============================================================
#include <Arduino.h>

struct ImuReading {
    float acc_x, acc_y, acc_z;    // g (m/s²/9.81)
    float gyro_x, gyro_y, gyro_z; // °/s
    bool  valid;
};

class ImuSensor {
public:
    bool begin();
    ImuReading read();
    float activityMagnitude(const ImuReading& r);
private:
    bool _initialized = false;
};
