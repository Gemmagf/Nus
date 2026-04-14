# PROCESS_LOG — Projecte Ernest
**Massiu Soft SL · Log de desenvolupament**

---

## 📋 Resum de fases

| Fase | Estat | Data inici | Data fi |
|------|-------|-----------|---------|
| P0 — Setup | ✅ Completat | 2025-04-14 | 2025-04-14 |
| P1 — Firmware ESP32 | 🔄 En curs | 2025-04-14 | — |
| P2 — App mòbil BLE | ⏳ Pendent | — | — |
| P3 — Backend API | ⏳ Pendent | — | — |
| P4 — Pipeline dades | ⏳ Pendent | — | — |
| P5 — Dashboard web | ⏳ Pendent | — | — |
| P6 — Integració + tests | ⏳ Pendent | — | — |

---

## 📅 2025-04-14 — P0: Setup del repositori

### Accions realitzades
- Git inicialitzat (`main` branch)
- `.gitignore` creat (Node, Python, PlatformIO, Supabase, secrets)
- `CLAUDE.md` creat — context complet del projecte per a Claude Code
- `PROCESS_LOG.md` creat (aquest fitxer)
- Estructura de carpetes creada: `firmware/`, `backend/`, `pipeline/`, `docs/`
- Context existent: demo web React/Vite amb dashboard funcional (`src/`)

### Context previ trobat
El repositori ja conté una aplicació demo (VetCare Smart Pet Health) construïda amb React 19 + Vite + TypeScript que inclou:
- `App.tsx` — Presentació de diapositives interactiva (416 línies)
- `components/DashboardDemo.tsx` — Dashboard simulat amb dades d'activitat, simetria i dolor
- `components/HarnessIllustration.tsx` — Il·lustració de l'arnès
- `components/SlideLayout.tsx` — Layout de diapositives
- Stack: React 19, Vite 6, TypeScript, Recharts, Lucide React, Tailwind CSS

**Decisió:** Mantenir l'app demo existent com a `src/`. Construir el sistema real sobre aquesta base, aprofitant components de UI ja existents.

### Estructura final del repositori
```
nus_can/
├── .git/
├── .gitignore
├── CLAUDE.md              ← Context Claude Code
├── PROCESS_LOG.md         ← Aquest fitxer
├── README.md              ← (a actualitzar)
├── package.json           ← App web demo
├── src/                   ← Dashboard demo (React/Vite)
├── firmware/              ← ESP32-S3 (PlatformIO) [P1]
├── backend/               ← Fastify + Next.js [P3]
├── pipeline/              ← Python dades [P4]
└── docs/                  ← Documentació tècnica
```

### Decisions tècniques
- Git flow: `main` (estable) + branques per fase (`feat/firmware-p1`, etc.)
- Commits: format `feat|fix|docs|test|chore: descripció`
- CLAUDE.md: document viu, s'actualitza en cada decisió important

---

## 📅 2025-04-14 — P1: Firmware ESP32-S3

### Objectiu
Crear l'estructura del firmware per a l'ESP32-S3 amb PlatformIO.
Implementar:
1. Lectura IMU (MPU-6050) via I2C
2. Lectura temperatura superficial (NTC via ADC)
3. Server BLE GATT amb característiques per a dades i configuració
4. Gestió de bateria (lectura ADC + estimació %)
5. Buffer circular per dades offline (quan no hi ha BLE connectat)

### Fitxers creats
- `firmware/platformio.ini` — Configuració PlatformIO
- `firmware/src/main.cpp` — Entry point + FreeRTOS tasks
- `firmware/src/sensors/imu.h/.cpp` — Driver MPU-6050
- `firmware/src/sensors/temperature.h/.cpp` — Driver NTC
- `firmware/src/ble/gatt_server.h/.cpp` — BLE GATT server
- `firmware/src/power/battery.h/.cpp` — Gestió bateria
- `firmware/include/config.h` — Pins, constants, configuració

### UUIDs BLE (GATT Custom Profile)
- Service UUID: `4fafc201-1fb5-459e-8fcc-c5c9c3319100`
- Char SENSOR_DATA: `beb5483e-36e1-4688-b7f5-ea07361b26a8` (NOTIFY)
- Char CONFIG:      `beb5483e-36e1-4688-b7f5-ea07361b26a9` (READ+WRITE)
- Char STATUS:      `beb5483e-36e1-4688-b7f5-ea07361b26aa` (READ+NOTIFY)

---

