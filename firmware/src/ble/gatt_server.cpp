// ============================================================
// gatt_server.cpp — BLE GATT Server Ernest
// Massiu Soft SL
// ============================================================
#include "gatt_server.h"
#include "../../include/config.h"

// ── Callbacks de connexió ────────────────────────────────────
class ServerCallbacks : public BLEServerCallbacks {
public:
    GattServer* srv;
    void onConnect(BLEServer* s) override {
        srv->setConnected(true);
        Serial.println("[BLE] Client connectat");
    }
    void onDisconnect(BLEServer* s) override {
        srv->setConnected(false);
        Serial.println("[BLE] Client desconnectat — reiniciant advertising");
        BLEDevice::startAdvertising();
    }
};

// ── Callbacks de la característica CONFIG ────────────────────
class ConfigCallbacks : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* c) override {
        std::string val = c->getValue();
        if (!val.empty()) {
            Serial.printf("[BLE] Config rebuda: %s\n", val.c_str());
            // TODO Fase 2: parsejar config (interval de mostreig, mode sleep, etc.)
        }
    }
};

void GattServer::begin() {
    BLEDevice::init(BLE_DEVICE_NAME);
    _server = BLEDevice::createServer();

    auto* cb = new ServerCallbacks();
    cb->srv  = this;
    _server->setCallbacks(cb);

    // Crear servei
    BLEService* svc = _server->createService(BLE_SERVICE_UUID);

    // Característica SENSOR_DATA (NOTIFY)
    _charSensor = svc->createCharacteristic(
        BLE_CHAR_SENSOR_UUID,
        BLECharacteristic::PROPERTY_NOTIFY
    );
    _charSensor->addDescriptor(new BLE2902());

    // Característica CONFIG (READ + WRITE)
    _charConfig = svc->createCharacteristic(
        BLE_CHAR_CONFIG_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
    );
    _charConfig->setCallbacks(new ConfigCallbacks());
    _charConfig->setValue("{\"rate\":10}"); // valor per defecte

    // Característica STATUS (READ + NOTIFY)
    _charStatus = svc->createCharacteristic(
        BLE_CHAR_STATUS_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
    );
    _charStatus->addDescriptor(new BLE2902());

    svc->start();

    // Advertising
    BLEAdvertising* adv = BLEDevice::getAdvertising();
    adv->addServiceUUID(BLE_SERVICE_UUID);
    adv->setScanResponse(true);
    adv->setMinPreferred(0x06);
    BLEDevice::startAdvertising();

    Serial.println("[BLE] GATT Server iniciat. Advertising...");
}

void GattServer::sendSensorPacket(const SensorPacket& pkt) {
    if (!_connected || !_charSensor) return;
    _charSensor->setValue((uint8_t*)&pkt, sizeof(SensorPacket));
    _charSensor->notify();
}

void GattServer::sendStatus(uint8_t battPct, bool hasError) {
    if (!_charStatus) return;
    char buf[32];
    snprintf(buf, sizeof(buf), "{\"bat\":%d,\"err\":%d}", battPct, hasError ? 1 : 0);
    _charStatus->setValue(buf);
    if (_connected) _charStatus->notify();
}
