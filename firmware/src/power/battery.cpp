// ============================================================
// battery.cpp — Monitor bateria LiPo via ADC
// Massiu Soft SL
// ============================================================
#include "battery.h"
#include "../../include/config.h"

bool BatteryMonitor::begin() {
    pinMode(PIN_BAT_ADC, INPUT);
    Serial.println("[BAT] Monitor bateria configurat");
    return true;
}

float BatteryMonitor::readVoltage() {
    long sum = 0;
    for (int i = 0; i < 20; i++) {
        sum += analogRead(PIN_BAT_ADC);
        delayMicroseconds(50);
    }
    float adcAvg = sum / 20.0f;
    float vPin   = (adcAvg / BAT_ADC_RESOLUTION) * BAT_VREF;
    return vPin * BAT_DIVIDER_RATIO;  // Compensar divisor tensió
}

int BatteryMonitor::readPercent() {
    float v = readVoltage();
    // Clamp
    if (v >= BAT_FULL_V)  return 100;
    if (v <= BAT_EMPTY_V) return 0;
    // Interpolació lineal (simplificada — corba LiPo no és lineal)
    return (int)(((v - BAT_EMPTY_V) / (BAT_FULL_V - BAT_EMPTY_V)) * 100.0f);
}
