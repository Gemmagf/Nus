#pragma once
// ============================================================
// gatt_server.h — BLE GATT Server Ernest
// Massiu Soft SL
// ============================================================
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

struct SensorPacket {
    uint32_t timestamp;       // Unix timestamp (s)
    int16_t  acc_x_100;       // acc_x * 100 (2 decimals)
    int16_t  acc_y_100;
    int16_t  acc_z_100;
    int16_t  gyro_x_10;       // gyro * 10 (1 decimal)
    int16_t  gyro_y_10;
    int16_t  gyro_z_10;
    int16_t  temp_100;        // temp_C * 100
    uint8_t  battery_pct;     // 0-100
    uint8_t  seq;             // número de seqüència (0-255, circular)
} __attribute__((packed));

class GattServer {
public:
    void begin();
    void sendSensorPacket(const SensorPacket& pkt);
    void sendStatus(uint8_t battPct, bool hasError);
    bool isConnected() const { return _connected; }
    void setConnected(bool v) { _connected = v; }

private:
    BLEServer*          _server       = nullptr;
    BLECharacteristic*  _charSensor   = nullptr;
    BLECharacteristic*  _charConfig   = nullptr;
    BLECharacteristic*  _charStatus   = nullptr;
    bool                _connected    = false;
};
