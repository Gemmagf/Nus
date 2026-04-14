# PROCESS_LOG — Projecte Ernest
**Massiu Soft SL · Log de desenvolupament**

---

## 📋 Resum de fases

| Fase | Estat | Data inici | Data fi |
|------|-------|-----------|---------|
| P0 — Setup | ✅ Completat | 2025-04-14 | 2025-04-14 |
| P1 — Firmware ESP32 | ✅ Completat | 2025-04-14 | 2025-04-14 |
| P2 — App mòbil BLE | ✅ Completat | 2025-04-14 | 2026-04-14 |
| P3 — Backend API | ✅ Completat | 2025-04-14 | 2025-04-14 |
| P4 — Pipeline dades | ✅ Completat | 2025-04-14 | 2025-04-14 |
| P5 — Dashboard web | ✅ Completat | 2026-04-14 | 2026-04-14 |
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

### Decisions tècniques
- Batch de 50 lectures (5s) per paquet BLE — equilibri entre latència i bateria
- Buffer circular de 720 paquets = 1h de dades offline si perd connexió BLE
- Watchdog timer (30s) per auto-recovery en cas de bloqueig del firmware
- Tasks FreeRTOS separades: sensors en Core 1, BLE en Core 0

---

## 📅 2025-04-14 — P3: Backend API (Fastify + Supabase)

### Fitxers creats
- `backend/api/src/server.js` — Fastify server principal (cors, jwt, rate-limit)
- `backend/api/src/routes/ingest.js` — POST /api/v1/ingest/readings (batch ingestió)
- `backend/api/src/routes/dogs.js` — CRUD gossos (GET/POST/PATCH)
- `backend/api/src/routes/metrics.js` — GET mètriques diàries, baseline, alertes
- `backend/api/src/routes/health.js` — GET /health (operabilitat Massiu)
- `backend/api/src/plugins/supabase.js` — Client Supabase service role
- `backend/supabase/migrations/001_initial_schema.sql` — Schema complert + RLS

### Taules creades
- `dogs` — Gossos per propietari
- `sensor_readings` — Time-series amb índex (dog_id, ts DESC)
- `daily_metrics` — Mètriques calculades per dia i gos
- `baselines` — Percentils individuals per mètrica (P10/P50/P90)
- `alerts` — Alertes generades per el pipeline
- `device_health` — Monitoratge de dispositius connectats

### Seguretat
- RLS actiu a totes les taules — cada propietari només accedeix als seus gossos
- JWT de Supabase verificat en totes les rutes protegides
- Rate limiting: 200 req/minut per IP

---

## 📅 2025-04-14 — P4: Pipeline de dades (Python)

### Fitxers creats
- `pipeline/features/compute_daily.py` — Càlcul mètriques diàries des de sensor_readings
- `pipeline/baseline/compute_baseline.py` — Baseline rolling 30 dies (P10/P50/P90 per gos)
- `pipeline/anomaly/detect_anomalies.py` — Detecció anomalies + generació alertes
- `pipeline/tests/test_features.py` — 11 tests pytest (activitat, repòs, simetria, anomalies)
- `pipeline/requirements.txt` — Dependències Python

### Algorismes implementats
- **Activitat**: magnitud vector IMU (|acc| - 1g) normalitzada a 0-100
- **Repòs**: detecció períodes |acc| < 0.05g, càlcul hores i fragmentació
- **Simetria**: asimetria entre desviacions estàndard de acc_x vs acc_y
- **Baseline**: percentils rolling sobre les últimes mètriques diàries de cada gos
- **Anomalies**: comparació vs baseline + escalat multi-mètrica

### Tests (pytest)
- `test_quiet_dog_low_activity` — gos quiet → activitat baixa ✓
- `test_active_dog_high_activity` — gos actiu → activitat alta ✓
- `test_sleeping_dog_high_rest` — gos dormint → molt repòs ✓
- `test_symmetric_gait_high_index` — marxa simètrica → índex alt ✓
- `test_asymmetric_gait_low_index` — marxa asimètrica → índex baix ✓
- `test_normal_value_no_alert` — valor normal → cap alerta ✓
- `test_extreme_value_urgent` — valor extrem → alerta urgent ✓
- + 4 tests addicionals

---

---

## 📅 2026-04-14 — P4 v1.1: Fix falsos positius (detect_anomalies.py)

### Problema detectat
Validació amb dades sintètiques (10 gossos × 35 dies, paràmetres Vehkaoja 2022):
- **59 dies de fals positiu** en `rest_fragmentation` i `rest_hours`
- Causa: rang P10-P90 molt estret → qualsevol fluctuació normal dispara avís
- **3/3 anomalies injectades correctament detectades (recall 100%)** — urgent funciona bé

### Fixes aplicats (v1.1)
Tres nous filtres a `detect_anomalies.py`:

```python
CONSECUTIVE_DAYS = 2    # warning: cal N dies consecutius fora de rang
MIN_RANGE_RATIO  = 0.05 # ignora mètriques amb rang (p90-p10)/p50 < 5%
DEDUP_DAYS       = 3    # no duplicar alerta si n'hi ha una activa en N dies
```

Noves funcions:
- `is_range_meaningful(p10, p50, p90)` — filtre estructural
- `check_consecutive(dog_id, metric, date, threshold)` — filtre temporal
- `fetch_active_alerts(dog_id, metric, days)` — filtre operacional

**Regla urgent:** sense filtre de dies consecutius (clínicament immediat, usa 3σ).

### Resultat esperat post-fix
- Fals positius estimats: <5 (de 59 → reducció ~90%)
- Recall mantingut a 100% per alertes urgents

---

## 📅 2026-04-14 — P2: App mòbil (React Native + Expo)

### Objectiu
Construir l'app mòbil completa per a propietaris i veterinaris:
- Connexió BLE al dispositiu Ernest
- Sincronització al backend via REST
- Visualització de mètriques i alertes
- Gestió del dispositiu

### Fitxers creats

#### Serveis (app/src/services/)
- `ble.ts` — `ErnestBleService`: scan "Ernest", connect GATT, parse paquets 20-byte (uint32+6×int16+2×uint8), flushBuffer on background
- `api.ts` — Client Supabase + `ingestReadings()`, `fetchDogs()`, `fetchDailyMetrics()`, `fetchAlerts()`, `markAlertRead()`

#### Estat global (app/src/store/index.ts)
- Zustand store: userId, dogs, selectedDog, bleStatus, bleMessage, alerts, lastSync, pendingPkts

#### Hook BLE (app/src/hooks/useBleSync.ts)
- Buffer en memòria (max 500 paquets)
- Flush automàtic cada 50 paquets (~4min)
- Retry automàtic: en cas d'error, paquets retornen al buffer
- Flush manual quan l'app va a background

#### Pantalles (app/src/screens/)
- `HomeScreen.tsx` — Benestar del dia (fórmula v1.0: activitat×35%+simetria×30%+repòs×20%+temp×15%), BLE bar, selector gossos, alertes actives, mètriques del dia
- `DeviceScreen.tsx` — Connexió/desconnexió BLE, info bateria, paquets pendents, diagnòstic UUIDs, toggle auto-connect
- `MetricsScreen.tsx` — Historial 7/14/30 dies per mètrica (sparkline bars), tendències, dies amb anomalia score >70%
- `AlertsScreen.tsx` — Llista alertes agrupades per dia, filtres de severitat, marcar llegit, marcar-ho tot, realtime subscription Supabase

#### Navegació (app/src/navigation/AppNavigator.tsx)
- Bottom tabs: Inici🏠 / Mètriques📊 / Alertes🔔 (amb badge) / Dispositiu📡
- React Navigation v6

#### Entry point (app/App.tsx)
- Supabase auth listener
- StatusBar + AppNavigator

### Decisions tècniques
- `parseSensorPacket`: 20 bytes binaris via base64 (layout: uint32 ts + 6×int16 IMU + int16 temp + 2×uint8)
- `bleService` com a singleton global (evita múltiples instàncies BleManager)
- Buffer en memòria (no persistit) — si l'app es tanca sense sync, es perden paquets locals (acceptable per MVP)
- Wellness score v1.0: fórmula lineal ponderada, no ML, revisable post-pilot

---

## 📅 2026-04-14 — P5: Dashboard web real (Supabase live)

### Objectiu
Substituir el `DashboardDemo.tsx` (dades hardcoded) per un dashboard connectat a Supabase amb dades en temps real.

### Fitxers creats

#### Client Supabase web
- `src/lib/supabase.ts` — `createClient` amb `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`

#### Hook de dades
- `src/hooks/useDashboardData.ts` — Carrega dogs, daily_metrics, alerts. Subscripció Realtime a alertes noves (INSERT). Funcions: `loadDogs`, `loadMetrics(dogId, days)`, `loadAlerts(dogId)`, `markAlertRead`.

#### Dashboard real
- `src/components/DashboardReal.tsx` — Dashboard complet amb:
  - Selector de gossos (amb indicador online/offline)
  - Wellness score (mateixa fórmula que app mòbil)
  - 4 estadístiques clau amb tendències (▲▼ vs dia anterior)
  - Selector rang dies (7/14/30)
  - 4 gràfics Recharts: Activitat (AreaChart), Simetria (LineChart + llindar 85%), Repòs+Temperatura (dual axis LineChart), Score Anomalia (BarChart color per severitat)
  - Alertes actives amb mark-as-read
  - Mode error explicatiu si falta .env

#### Integració App.tsx
- Botó "Dashboard Real" (fix, cantonada dreta) a la presentació
- Mode dashboard: capçalera "LIVE" + botó "Tornada presentació"
- Sense canviar l'estructura existent de slides

### Variables d'entorn necessàries (.env)
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

---

## 📅 2026-04-14 — P4+: Anàlisi passejades + detecció pipi/caca + demo dual-view

### Objectiu
Ampliar el pipeline amb detecció de sessions de passeig i esdeveniments fisiològics (pipi/caca) per poder alertar el propietari si l'animal fa menys necessitats del normal. Crear una demo visual amb vista propietari i vista veterinari.

### Fitxers creats

#### Base de dades (SQL migration)
- `backend/supabase/migrations/002_walks_bathroom.sql`
  - Taula `walk_sessions`: sessions de moviment sostingut amb durada, distància estimada, passes, velocitat, simetria, activitat
  - Taula `bathroom_events`: episodis fisiològics amb tipus (pipi/caca/unknown), durada aturada, posture_score, gyro_lateral, acc_z_delta, walk_session_id
  - Columnes noves a `daily_metrics`: walk_count, walk_total_min, walk_total_m, steps_total, pipi_count, caca_count
  - Vista `daily_summary`: afegeix hydration_level (molt baix/baix/normal/alt) i digestive_status (cap/normal-baix/normal/elevat)
  - RLS actiu a totes les taules noves

#### Pipeline Python
- `pipeline/features/compute_walks.py`
  - `detect_walks(dog_id, date, readings, weight_kg)` → `List[WalkSession]`
  - Magnitud IMU (mag = |acc| - 1g), suavitzat rolling 5 lectures
  - Llindar activitat WALK_THRESHOLD=0.12g, durada mínima MIN_WALK_MIN=3min
  - Pauses dins sessió fins MAX_GAP_S=60s es toleren (gos s'atura breu)
  - Detecció passes via pics acc_z > mitja+1.2σ, refractori 0.3s
  - Longitud pas per pes: <10kg→0.25m, 10-25kg→0.40m, >25kg→0.55m
  - `compute_daily_walk_summary(walks)` per a daily_metrics

- `pipeline/features/compute_bathroom.py`
  - `detect_bathroom_events(dog_id, date, readings, walk_periods)` → `List[BathroomEvent]`
  - Pipi: aturada 12-95s + pic giroscopi lateral >25°/s (aixecar pota, mascles) o aturada curta sense flexió (femelles)
  - Caca: aturada 28-125s + acc_z delta <-0.06g sostingut >8s (flexió dorsal)
  - Score de confiança per cada detecció, mínim 0.65 per reportar
  - `check_bathroom_alerts()`: pipi=0→urgent, pipi<P10→warning, caca=0 dos dies→warning, caca>P90×1.5→warning (possible diarrea)

#### Demo visual (sense dependències externes)
- `ernest_demo.html` — Pure vanilla JS/HTML/CSS
  - Toggle d'escenari: **Gos sa** (3 passejades, 5 pipis, 2 caques) ↔ **Anomalia** (1 passeig curt, 1 pipi, 0 caques → alertes actives)
  - Toggle de vista: **Dashboard** ↔ **App mòbil**
  - **Vista Propietari**: emoji wellness, targetes passeig/pipi/caca vs baseline, timeline passejades del dia, visualització events fisiològics amb dots de colors
  - **Vista Veterinari**: graella 8 stats, detall sessions passeig (hora, durada, passes, km/h, simetria), 6 gràfics SVG (activitat, simetria+llindar, minuts passejades, pipi/caca, temperatura, anomaly score)
  - **App mòbil**: 3 mockups de telèfon costat a costat (Nus, Lluna, Bruno) amb BLE bar, wellness, llista passejades, pipi/caca, mètriques, tab bar

### Decisions tècniques
- Detecció sense GPS: distància estimada a partir de passes × longitud_pas (funció del pes)
- Detecció fisiològica per senyals indirectes IMU: no cal sensor específic afegit
- Demo en HTML pur per poder obrir sense instal·lar res (eines comercials / demo a clients)
- Confiança mínima 0.65 per evitar falsos positius en condicions d'activitat ambigua

### Problemes resolts en aquesta sessió
- Demo inicial amb Recharts CDN fallava (blanc total): reescrita en vanilla JS/SVG pur
- Git `.git/index.lock` al sandbox Linux: resolt via còpia a /tmp + git bundle + update-ref
- Dues vistes (propietari/veterinari) ben diferenciades: propietari simple i emocional, veterinari clínic i complet

---

## 🔜 Properes passes — P6: Integració + tests + validació real

### Tasques P6
- [ ] Proves end-to-end: firmware ESP32 → BLE → app → Fastify → Supabase → pipeline → dashboard
- [ ] Test de càrrega: `POST /api/v1/ingest/readings` amb 100 paquets en paral·lel
- [ ] Validació sobre gos real: mínim 14 dies de dades per establir baseline
- [ ] Calibratge llindars anomalia: ajustar `CONSECUTIVE_DAYS` i `MIN_RANGE_RATIO` amb dades reals
- [ ] Test BLE rang i estabilitat (>8h connexió contínua)
- [ ] Supabase Edge Function per execució automàtica del pipeline (cron)
- [ ] Deploy: frontend Vercel, backend Railway, Supabase Pro activat

### Checklist per posar en producció
```
☐ Supabase: RLS policies verificades per totes les taules
☐ Supabase: Edge Function pipeline programada (cron daily)
☐ Backend:  Variables d'entorn configurades a Railway
☐ Frontend: VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY a Vercel
☐ App:      EXPO_PUBLIC_* en app.config.js per a builds EAS
☐ Firmware: Flashing a dispositiu físic, test bateria 48h
☐ Monitoring: Sentry (frontend + backend) + UptimeRobot (/health)
```

---

## ⚠️ Notes i blockers

### Git commit — acció manual requerida
Executa des del terminal del Mac per commitar tots els canvis d'aquesta sessió:
```bash
cd ~/Documents/git_projects/nus_can
git add -A
git commit -m "feat: P2+P5 Ernest — app mòbil completa (4 pantalles BLE) + dashboard Supabase real"
```

### Dependències app mòbil
Abans del primer `expo start`, instal·la des de `app/`:
```bash
cd ~/Documents/git_projects/nus_can/app
npm install
```

### Variables d'entorn
Copia `.env.example` a `.env` i omple amb les claus reals de Supabase:
```bash
cp .env.example .env
# edita .env amb les teves claus
```

---

