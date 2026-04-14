// ============================================================
// temperature.cpp — Sensor temperatura NTC via ADC
// Massiu Soft SL
// ============================================================
#include "temperature.h"
#include "../../include/config.h"
#include <math.h>

bool TemperatureSensor::begin() {
    pinMode(PIN_NTC_ADC, INPUT);
    analogReadResolution(12);   // 12 bits → 0-4095
    analogSetAttenuation(ADC_11db);  // 0-3.3V range
    Serial.println("[TEMP] Sensor NTC configurat");
    return true;
}

float TemperatureSensor::readCelsius() {
    // Promig de 10 lectures per reduir soroll ADC
    long sum = 0;
    for (int i = 0; i < 10; i++) {
        sum += analogRead(PIN_NTC_ADC);
        delayMicroseconds(100);
    }
    int adcVal = sum / 10;
    return adcToTemp(adcVal);
}

// Equació Steinhart-Hart simplificada (Beta)
float TemperatureSensor::adcToTemp(int adcVal) {
    if (adcVal <= 0 || adcVal >= 4095) return -99.0f; // lectura invàlida

    // Calcular resistència NTC
    float voltage  = (adcVal / BAT_ADC_RESOLUTION) * BAT_VREF;
    float rNtc     = NTC_SERIES_R * voltage / (BAT_VREF - voltage);

    // Equació Beta: 1/T = 1/T0 + (1/B) * ln(R/R0)
    float tempK = 1.0f / (
        (1.0f / (NTC_NOMINAL_TEMP + 273.15f)) +
        (1.0f / NTC_BETA) * logf(rNtc / NTC_NOMINAL_R)
    );
    return tempK - 273.15f; // Kelvin → Celsius
}
