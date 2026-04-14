#pragma once
// ============================================================
// config.h — Configuració global del firmware Ernest
// Massiu Soft SL
// ============================================================

// ── Pins hardware ────────────────────────────────────────────
#define PIN_I2C_SDA       8    // IMU MPU-6050 SDA
#define PIN_I2C_SCL       9    // IMU MPU-6050 SCL
#define PIN_NTC_ADC       4    // Sensor temperatura NTC (ADC1_CH3)
#define PIN_BAT_ADC       5    // Divisor tensió bateria (ADC1_CH4)
#define PIN_LED_STATUS    48   // LED status integrat ESP32-S3-DevKitC

// ── Freqüències de lectura ───────────────────────────────────
#define SAMPLE_RATE_HZ    10   // 10 lectures/segon IMU + temp
#define BLE_SEND_INTERVAL_MS  5000   // Envia paquet BLE cada 5s (50 lectures)
#define STATUS_INTERVAL_MS    60000  // Status (bateria) cada 60s

// ── BLE ──────────────────────────────────────────────────────
#define BLE_DEVICE_NAME   "Ernest"
// UUIDs del servei GATT custom
#define BLE_SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c3319100"
#define BLE_CHAR_SENSOR_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26a8"  // NOTIFY
#define BLE_CHAR_CONFIG_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26a9"  // RW
#define BLE_CHAR_STATUS_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26aa"  // R+NOTIFY

// ── Buffer offline ───────────────────────────────────────────
#define BUFFER_MAX_PACKETS  720  // 1h de dades (720 paquets x 5s)

// ── Bateria ──────────────────────────────────────────────────
#define BAT_ADC_RESOLUTION  4095.0f
#define BAT_VREF            3.3f
#define BAT_DIVIDER_RATIO   2.0f   // Divisor 1:2 a PIN_BAT_ADC
#define BAT_FULL_V          4.2f
#define BAT_EMPTY_V         3.3f

// ── Temperatura NTC ──────────────────────────────────────────
#define NTC_NOMINAL_R       10000  // 10kΩ a 25°C
#define NTC_SERIES_R        10000  // Resistència en sèrie 10kΩ
#define NTC_BETA            3950   // Coeficient Beta NTC
#define NTC_NOMINAL_TEMP    25.0f  // °C temperatura nominal

// ── FreeRTOS task priorities ─────────────────────────────────
#define TASK_PRIORITY_SENSOR   3
#define TASK_PRIORITY_BLE      2
#define TASK_PRIORITY_STORAGE  1

// ── Watchdog ─────────────────────────────────────────────────
#define WDT_TIMEOUT_S   30   // Reset si no fa kick en 30s
