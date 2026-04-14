#pragma once
#include <Arduino.h>

class BatteryMonitor {
public:
    bool  begin();
    float readVoltage();
    int   readPercent();   // 0-100
};
