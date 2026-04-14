// ============================================================
// main.cpp — Entry point firmware Ernest
// ESP32-S3 + FreeRTOS + BLE + IMU + Temperatura
// Massiu Soft SL
// ============================================================
#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include <esp_task_wdt.h>
#include <time.h>

#include "../include/config.h"
#include "sensors/imu.h"
#include "sensors/temperature.h"
#include "ble/gatt_server.h"
#include "power/battery.h"

// ── Objectes globals ─────────────────────────────────────────
static ImuSensor        imu;
static TemperatureSensor tempSensor;
static GattServer       ble;
static BatteryMonitor   bat;

// ── Cua de paquets (buffer offline) ─────────────────────────
static QueueHandle_t    sensorQueue;

// ── Número de seqüència ──────────────────────────────────────
static uint8_t          seqNum = 0;

// ── Acumulador per batch (50 lectures → 1 paquet cada 5s) ───
static float  accXSum = 0, accYSum = 0, accZSum = 0;
static float  gyroXSum= 0, gyroYSum= 0, gyroZSum= 0;
static float  tempSum = 0;
static int    sampleCount = 0;
static const int BATCH_SIZE = SAMPLE_RATE_HZ * (BLE_SEND_INTERVAL_MS / 1000);

// ════════════════════════════════════════════════════════════
//  TASK: Lectura de sensors (10 Hz)
// ════════════════════════════════════════════════════════════
void taskSensors(void* arg) {
    TickType_t lastWake = xTaskGetTickCount();
    const TickType_t period = pdMS_TO_TICKS(1000 / SAMPLE_RATE_HZ);

    while (true) {
        esp_task_wdt_reset();

        ImuReading  imuR = imu.read();
        float       temp = tempSensor.readCelsius();

        if (imuR.valid && temp > -50.0f) {
            accXSum  += imuR.acc_x;  accYSum  += imuR.acc_y;  accZSum  += imuR.acc_z;
            gyroXSum += imuR.gyro_x; gyroYSum += imuR.gyro_y; gyroZSum += imuR.gyro_z;
            tempSum  += temp;
            sampleCount++;
        }

        // Quan tenim BATCH_SIZE lectures, generar paquet i encuar-lo
        if (sampleCount >= BATCH_SIZE) {
            SensorPacket pkt;
            pkt.timestamp   = (uint32_t)time(nullptr);
            pkt.acc_x_100   = (int16_t)((accXSum  / sampleCount) * 100);
            pkt.acc_y_100   = (int16_t)((accYSum  / sampleCount) * 100);
            pkt.acc_z_100   = (int16_t)((accZSum  / sampleCount) * 100);
            pkt.gyro_x_10   = (int16_t)((gyroXSum / sampleCount) * 10);
            pkt.gyro_y_10   = (int16_t)((gyroYSum / sampleCount) * 10);
            pkt.gyro_z_10   = (int16_t)((gyroZSum / sampleCount) * 10);
            pkt.temp_100    = (int16_t)((tempSum  / sampleCount) * 100);
            pkt.battery_pct = (uint8_t)bat.readPercent();
            pkt.seq         = seqNum++;

            // Encua (si la cua és plena, descarta el paquet més antic)
            if (xQueueSend(sensorQueue, &pkt, 0) != pdTRUE) {
                SensorPacket discard;
                xQueueReceive(sensorQueue, &discard, 0);
                xQueueSend(sensorQueue, &pkt, 0);
                Serial.println("[SENSOR] Buffer ple — paquet antic descartat");
            }

            // Reset acumuladors
            accXSum = accYSum = accZSum = 0;
            gyroXSum = gyroYSum = gyroZSum = 0;
            tempSum = 0; sampleCount = 0;
        }

        vTaskDelayUntil(&lastWake, period);
    }
}

// ════════════════════════════════════════════════════════════
//  TASK: Enviament BLE
// ════════════════════════════════════════════════════════════
void taskBle(void* arg) {
    SensorPacket pkt;
    uint32_t lastStatusMs = 0;

    while (true) {
        // Consumir tots els paquets de la cua i enviar-los per BLE
        while (xQueueReceive(sensorQueue, &pkt, pdMS_TO_TICKS(100)) == pdTRUE) {
            if (ble.isConnected()) {
                ble.sendSensorPacket(pkt);
                Serial.printf("[BLE] Paquet enviat: seq=%d bat=%d%%\n", pkt.seq, pkt.battery_pct);
            }
            // Si no hi ha connexió BLE, el paquet es perd aquí
            // TODO Fase 2: guardar a SPIFFS per enviament posterior
        }

        // Enviar status periòdic
        uint32_t now = millis();
        if (now - lastStatusMs > STATUS_INTERVAL_MS) {
            ble.sendStatus(bat.readPercent(), false);
            lastStatusMs = now;
        }

        vTaskDelay(pdMS_TO_TICKS(50));
    }
}

// ════════════════════════════════════════════════════════════
//  SETUP
// ════════════════════════════════════════════════════════════
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n==== Ernest Firmware v1.0 ====");
    Serial.println("Massiu Soft SL");
    Serial.println("==============================\n");

    // Watchdog: reset si el sistema es bloqueja >30s
    esp_task_wdt_init(WDT_TIMEOUT_S, true);
    esp_task_wdt_add(nullptr);

    // LED status
    pinMode(PIN_LED_STATUS, OUTPUT);
    digitalWrite(PIN_LED_STATUS, HIGH);

    // Inicialitzar sensors
    if (!imu.begin()) {
        Serial.println("[MAIN] ERROR inicialitzant IMU");
    }
    tempSensor.begin();
    bat.begin();

    // Inicialitzar BLE
    ble.begin();

    // Crear cua de paquets
    sensorQueue = xQueueCreate(BUFFER_MAX_PACKETS, sizeof(SensorPacket));
    if (!sensorQueue) {
        Serial.println("[MAIN] ERROR creant cua de sensors");
        while(true) delay(1000);
    }

    // Crear tasks FreeRTOS
    xTaskCreatePinnedToCore(taskSensors, "sensors", 4096, nullptr,
                             TASK_PRIORITY_SENSOR, nullptr, 1);  // Core 1
    xTaskCreatePinnedToCore(taskBle,     "ble",     8192, nullptr,
                             TASK_PRIORITY_BLE,    nullptr, 0);  // Core 0

    digitalWrite(PIN_LED_STATUS, LOW);
    Serial.println("[MAIN] Sistema Ernest iniciat. En espera de connexió BLE...");
}

// ════════════════════════════════════════════════════════════
//  LOOP — buit (FreeRTOS gestiona tot)
// ════════════════════════════════════════════════════════════
void loop() {
    esp_task_wdt_reset();
    vTaskDelay(pdMS_TO_TICKS(1000));
}
