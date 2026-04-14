#pragma once
// ============================================================
// temperature.h — Driver temperatura NTC
// Massiu Soft SL
// ============================================================
#include <Arduino.h>

class TemperatureSensor {
public:
    bool  begin();
    float readCelsius();
private:
    float adcToTemp(int adcVal);
};
