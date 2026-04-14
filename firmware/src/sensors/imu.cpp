// ============================================================
// imu.cpp — Driver IMU MPU-6050
// Massiu Soft SL
// ============================================================
#include "imu.h"
#include "../../include/config.h"
#include <MPU6050.h>
#include <Wire.h>
#include <math.h>

static MPU6050 mpu;

bool ImuSensor::begin() {
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    mpu.initialize();
    if (!mpu.testConnection()) {
        Serial.println("[IMU] ERROR: MPU-6050 no trobat al bus I2C");
        return false;
    }
    // Configuració: ±2g acceleròmetre, ±250°/s giroscopi
    mpu.setFullScaleAccelRange(MPU6050_ACCEL_FS_2);
    mpu.setFullScaleGyroRange(MPU6050_GYRO_FS_250);
    // DLPF: 21Hz per filtrar soroll de vibració
    mpu.setDLPFMode(MPU6050_DLPF_BW_21);
    _initialized = true;
    Serial.println("[IMU] MPU-6050 inicialitzat correctament");
    return true;
}

ImuReading ImuSensor::read() {
    ImuReading r = {};
    if (!_initialized) { r.valid = false; return r; }

    int16_t ax, ay, az, gx, gy, gz;
    mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);

    // Conversió: LSB/g = 16384 per ±2g
    r.acc_x  = ax / 16384.0f;
    r.acc_y  = ay / 16384.0f;
    r.acc_z  = az / 16384.0f;
    // LSB/(°/s) = 131 per ±250°/s
    r.gyro_x = gx / 131.0f;
    r.gyro_y = gy / 131.0f;
    r.gyro_z = gz / 131.0f;
    r.valid  = true;
    return r;
}

// Magnitud del vector acceleració sense component gravetat
// Indicador simple d'activitat
float ImuSensor::activityMagnitude(const ImuReading& r) {
    if (!r.valid) return 0.0f;
    float mag = sqrtf(r.acc_x*r.acc_x + r.acc_y*r.acc_y + r.acc_z*r.acc_z);
    // Restant 1g (gravetat en repòs) → 0 = sense moviment
    return fabsf(mag - 1.0f);
}
