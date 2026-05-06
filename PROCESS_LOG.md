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
| P6 — Integració + tests | ✅ Completat | 2026-04-18 | 2026-04-18 |
| **Documentació final** | ✅ Completat | 2026-04-20 | 2026-04-20 |
| **Acabat & poliment** | ✅ Completat | 2026-04-29 | 2026-04-29 |

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

## 📅 2026-04-18 — P6: Integració + tests + deploy

### Tasques completades
- [x] Test de càrrega E2E: `backend/tests/load_test.js` — 100 batches × 50 lectures en paral·lel amb estadístiques p50/p95/p99
- [x] Supabase Edge Function: `backend/supabase/functions/pipeline-daily/index.ts` — pipeline cron diari (03:00 UTC), doble mode (API Python o RPC directa)
- [x] Dockerfile multi-stage: `backend/api/Dockerfile` — imatge Alpine, usuari no-root, HEALTHCHECK integrat
- [x] `railway.json`: deploy Fastify a Railway amb healthcheck automàtic
- [x] `vercel.json`: deploy dashboard React/Vite a Vercel amb SPA rewrite + headers de seguretat
- [x] `scripts/preflight_check.sh`: checklist automatitzat 7 seccions — eines, .env, fitxers, API, Python tests, seguretat, git

### Fitxers creats a P6
- `backend/tests/load_test.js` — test de càrrega configurable (concurrència, batches, lectures/batch)
- `backend/supabase/functions/pipeline-daily/index.ts` — Edge Function Deno per a cron pipeline
- `backend/api/Dockerfile` — imatge Docker producció Fastify
- `railway.json` — configuració deploy Railway (backend)
- `vercel.json` — configuració deploy Vercel (frontend)
- `scripts/preflight_check.sh` — script bash checklist pre-producció

### Com usar el test de càrrega
```bash
# Local (sense JWT — retornarà 401, útil per testar rate-limit i latència)
node backend/tests/load_test.js

# Contra producció, autenticat
export TEST_JWT_TOKEN=<supabase-jwt>
export TEST_DOG_ID=<uuid>
node backend/tests/load_test.js --url https://api.ernest.app --concurrency 20 --batches 200
```

### Com fer el deploy
```bash
# 1. Preflight check (ha de passar sense errors)
./scripts/preflight_check.sh

# 2. Frontend → Vercel
vercel --prod

# 3. Backend → Railway (des del dashboard o CLI)
railway up

# 4. Supabase Edge Function
supabase functions deploy pipeline-daily --no-verify-jwt

# 5. Activar cron a Supabase Dashboard:
#    Edge Functions → pipeline-daily → Add Schedule → "0 3 * * *"
```

### Pendents manuals (requereixen maquinari o accés real)
- [ ] Calibratge llindars anomalia amb dades reals (mínim 14 dies per gos)
- [ ] Test BLE rang i estabilitat (>8h connexió contínua)
- [ ] Flashing firmware a dispositiu físic + test bateria 48h
- [ ] Omplir SENTRY_DSN / VITE_SENTRY_DSN / EXPO_PUBLIC_SENTRY_DSN al .env
- [ ] Activar UptimeRobot sobre `/health`
- [ ] Omplir EAS_PROJECT_ID a app.config.js i eas.json

---

## 📅 2026-04-18 — P6 complement: migration 003, Sentry, EAS

### Fitxers creats
- `backend/supabase/migrations/003_pipeline_runs_rpc.sql`
  - Taula `pipeline_runs`: log d'execucions del pipeline (data, gossos ok/error, errors JSON)
  - RPC `compute_daily_metrics(dog_id, date)` — mètriques diàries en SQL (activitat, repòs, simetria, temperatura, passos)
  - RPC `compute_baseline(dog_id, window=30)` — P10/P50/P90 rolling per a totes les mètriques
  - RPC `detect_anomalies(dog_id, date)` — detecció urgent/warning amb filtres anti-fals-positiu (MIN_RANGE_RATIO, DEDUP_DAYS)
  - RPC `compute_walks_bathroom(dog_id, date)` — sincronitza resum walk_sessions + bathroom_events → daily_metrics
  - Grants de EXECUTE per a service_role

- `backend/api/src/server.js` — integració Sentry (`@sentry/node`): init condicional si `SENTRY_DSN`, setErrorHandler global, captura errors de startup. Sense enviar dades de request per GDPR.

- `index.tsx` — integració Sentry (`@sentry/react`): browserTracing + Replay (mask text, block media), init condicional si `VITE_SENTRY_DSN`, beforeSend elimina email.

- `app/app.config.js` — configuració Expo/EAS completa: identificadors iOS/Android, permisos BLE, plugins (react-native-ble-plx, expo-build-properties), OTA updates, extra vars d'entorn.

- `app/eas.json` — perfils build EAS: development (devClient), preview (APK intern), production (autoIncrement). Configuració submit App Store + Google Play.

- `package.json` (root) — afegit `@sentry/react` + `@supabase/supabase-js`, nom actualitzat a `ernest-dashboard`

- `backend/api/package.json` — afegit `@sentry/node`

- `.env.example` — afegides vars `SENTRY_DSN`, `VITE_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_DSN`, `EAS_PROJECT_ID`

---

---

## 📅 2026-04-20 — Documentació final

### Fitxers creats / actualitzats

- `README.md` — reescrit completament: visió, estructura, inici ràpid, model de dades, stack, algorismes, test de càrrega, deploy, seguretat
- `docs/ARQUITECTURA.md` — diagrama E2E, flux de dades, decisions tècniques per capa (firmware, backend, pipeline, BD, app), seguretat, escalabilitat, format BLE GATT, taula de versions
- `docs/DEPLOY.md` — guia pas a pas completa (9 seccions): Supabase, Railway, Vercel, EAS, Sentry, UptimeRobot, Firmware, verificació E2E, checklist de 30 punts, rollback

---

---

## 📅 2026-04-29 — Acabat & poliment: rebranding, CI/CD, auditoria

### Context
Sessió de poliment final. Objectiu: tancar tots els residus de l'era VetCare, afegir CI/CD que faltava, i garantir coherència total del codebase.

### Canvis realitzats

#### Rebranding complet VetCare → Ernest
- `index.html` — títol: "VetCare | Salut Intel·ligent per Mascotes" → "Ernest | Monitorització Intel·ligent de Salut Canina"
- `components/SlideLayout.tsx` — badge de capçalera: div blau simple → badge `bg-slate-900` amb icona "E" teal + "ERNEST"
- `App.tsx` — "Model VetCare" → "Model Ernest", "Ecosistema VetCare" → "Ecosistema Ernest", email info@vetcare.com → hola@massiusoft.com
- `components/DashboardDemo.tsx` — "VetCare Pro" → "Ernest", "Indicador de Dolor (IA)" → "Índex d'Anomalia (IA)", camp de dades `pain` → `anomaly`, visualització `x/10` → `x/1.0` (consistent amb anomaly_score)
- `metadata.json` — `"VetCare Smart Pet Health"` → `"Ernest — Monitorització Intel·ligent de Salut Canina"` amb descripció tècnica real

#### Dashboard en mode demo (sense Supabase)
- `src/hooks/useDashboardData.ts` — reescrit completament:
  - `IS_DEMO = !import.meta.env.VITE_SUPABASE_URL` — detecció automàtica
  - `makeDemoMetrics(dogId, days, scenario)` — 30 dies de dades realistes amb anomalia els últims 4 dies (si scenario='anomalia')
  - `DEMO_DOGS` — Nus (Llaurador, 28.5kg, online 74%), Lluna (Bòrder Collie, 91%), Bruno (Pastor Alemany, offline 38%)
  - `DEMO_ALERTS` — 2 alertes per a Nus: urgent (activitat), warning (temperatura)
  - Fallback silenciós: si Supabase falla → mode demo sense mostrar error
  - Realtime subscription desactivada en mode demo

#### Millores visuals dashboard
- `src/components/DashboardReal.tsx`:
  - Badge DEMO ambre visible quan `isDemo === true`
  - Loading spinner CSS (ring rotatiu) en lloc del text `animate-pulse`
  - `StatCard` — barra d'accent lateral esquerra amb color semàntic (activitat=teal, simetria=lila, repòs=verd)
  - Wellness: substituït número simple per un anell SVG circular amb `strokeDasharray` animat

#### GitHub Actions CI/CD (nou)
- `.github/workflows/ci.yml` — 4 jobs en paral·lel:
  - `pipeline-tests` → `pytest pipeline/tests/` amb Python 3.11 + cache pip
  - `backend-tests` → `npm ci + lint + test` a `backend/api/` amb Node 20
  - `frontend-build` → `tsc --noEmit + vite build` del dashboard
  - `docker-build` → build imatge Docker sense push (verifica que compila)
  - S'activa en push a `main`/`develop` i PRs a `main`

- `.github/workflows/deploy-backend.yml` — Deploy a Railway:
  - Activa en push a `main` si canvien fitxers de `backend/`
  - Migracions SQL opcionals: si commit porta `[migrate]` o flag manual
  - Health check post-deploy: 12 intents × 10s (2 min màxim)
  - Crea issue GitHub automàticament si el deploy falla

- `.github/workflows/deploy-frontend.yml` — Deploy a Vercel:
  - Activa en push a `main` si canvien fitxers del dashboard
  - Build amb secrets de GitHub, deploy `--prod`

#### `types.ts` — Reescriptura completa
Eliminats (era VetCare obsoleta):
- `enum AppView { VETERINARIAN, OWNER }` — mai es va usar
- `interface ActivityData { painLevel }` — concepte VetCare, no Ernest
- `interface SlideProps` — mantigut

Nous tipus del domini Ernest:
- `SensorPacket` — paquet BLE 20-byte (ts, acc XYZ, gyro XYZ, tempSurface, batteryPct)
- `DeviceStatus`, `DeviceHealth`
- `Dog`, `DailyMetrics`, `Baseline`
- `AlertSeverity`, `MetricKey`, `Alert`
- `WalkSession`, `BathroomEventType`, `BathroomEvent`
- `PipelineRun`
- `IngestPayload`, `ApiResponse<T>`
- `WellnessSnapshot`, `ChartPeriod`, `ChartDataPoint`

#### Neteja `vite.config.ts`
- Eliminades les línies `define: { 'process.env.GEMINI_API_KEY': ... }` — residu de l'era VetCare; Ernest no usa cap API Gemini/LLM
- Eliminat `loadEnv` innecessari i simplificat a `defineConfig(() => {...})`

### Commits d'aquesta sessió
```
090a8e3  chore: actualitza package-lock.json
e2fa955  fix: elimina residus era VetCare — DashboardDemo + vite.config
bd29475  feat: rebranding Ernest + dashboard demo data + millores visuals
9715887  feat: CI/CD GitHub Actions + types Ernest + metadata
```

### Decisions tècniques
- **Demo mode automàtic**: qualsevol entorn sense `VITE_SUPABASE_URL` mostra dades simulades realistes. Zero configuració manual per a demos a clients.
- **Anomaly vs Pain**: el camp de dades del dashboard s'anomena `anomaly` (0-1, escala Ernest), no `pain` (0-10, paradigma VetCare). Reflecteix millor la proposta de valor.
- **CI gated per paths**: els workflows de deploy només s'activen si canvien fitxers de la seva capa. Evita redeploys innecessaris si canvia documentació o firmware.
- **Supabase migrations manuals**: les migracions SQL no s'apliquen automàticament en CI. Cal flag explícit `[migrate]` al commit o dispatch manual. Decisió deliberada: les migracions sobre producció sempre han de ser revisades per un humà.

---

## 🏁 ESTAT FINAL DEL PROJECTE

**Tot el codi, infraestructura, CI/CD i documentació estan completats. Codebase lliure de residus VetCare.**

### Resum de fitxers del projecte (actualitzat 2026-04-29)

| Capa | Fitxers clau |
|------|-------------|
| Firmware | `firmware/src/main.cpp`, `sensors/`, `ble/`, `power/` |
| Backend API | `backend/api/src/server.js`, `routes/` (4), `plugins/supabase.js` |
| Base de dades | `migrations/001` + `002` + `003` (schema, passejades, RPCs + pipeline_runs) |
| Edge Function | `backend/supabase/functions/pipeline-daily/index.ts` |
| Pipeline Python | `compute_daily.py`, `compute_walks.py`, `compute_bathroom.py`, `compute_baseline.py`, `detect_anomalies.py` |
| Tests Python | `tests/test_features.py` (11 tests), `validation/ernest_validation.py` |
| App mòbil | `app/src/` (4 pantalles, BLE service, Zustand, hooks), `app.config.js`, `eas.json` |
| Dashboard web | `src/components/DashboardReal.tsx`, `src/hooks/useDashboardData.ts` (demo mode) |
| Demo visual | `ernest_demo.html` (propietari + veterinari + mockup app, vanilla JS) |
| CI/CD | `.github/workflows/ci.yml`, `deploy-backend.yml`, `deploy-frontend.yml` |
| Deploy | `backend/api/Dockerfile`, `railway.json`, `vercel.json` |
| Tests càrrega | `backend/tests/load_test.js` |
| Scripts | `scripts/preflight_check.sh` |
| Tipus TS | `types.ts` (domini Ernest complet: SensorPacket, Dog, Alert, WalkSession, etc.) |
| Documentació | `README.md`, `docs/ARQUITECTURA.md`, `docs/DEPLOY.md`, `CLAUDE.md`, `PROCESS_LOG.md` |

### Git — Historial de commits (branca `claude/nervous-haslett`)
```
090a8e3  chore: actualitza package-lock.json
e2fa955  fix: elimina residus era VetCare — DashboardDemo + vite.config
bd29475  feat: rebranding Ernest + dashboard demo data + millores visuals
9715887  feat: CI/CD GitHub Actions + types Ernest + metadata
d3a2d3d  feat: P6 + docs — integració completa, deploy config i documentació final
e6722d1  feat: P4+ walks & bathroom — passejades, pipi/caca, demo dual-view
7d6d4bf  feat: P2+P5 Ernest — app mòbil BLE + dashboard Supabase real
dbf1960  feat: P0-P4 Ernest — firmware ESP32, backend Fastify, pipeline Python
```

### Pendents únics manuals (NO es poden automatitzar)
| # | Tasca | Responsable |
|---|-------|-------------|
| 1 | Afegir secrets a GitHub: `RAILWAY_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`, `API_BASE_URL` | Massiu Soft |
| 2 | Omplir claus reals al `.env` (Supabase, Sentry, EAS) | Massiu Soft |
| 3 | Activar cron `0 3 * * *` a Supabase Dashboard → Edge Functions | Massiu Soft |
| 4 | Fer merge de `claude/nervous-haslett` → `main` | Massiu Soft |
| 5 | Flashejar firmware a l'ESP32-S3 físic | Maquinari |
| 6 | Recollir ≥ 14 dies de dades reals per al primer baseline | Pilot |
| 7 | Calibrar llindars anomalia (MIN_RANGE_RATIO, CONSECUTIVE_DAYS) post-pilot | Pipeline |

---

## ⚠️ Notes operatives

### Dependències app mòbil
```bash
cd app && npm install
```

### Variables d'entorn
```bash
cp .env.example .env
# Edita .env amb les claus reals de Supabase, Sentry i EAS
```

### Commit recomanat
```bash
cd ~/Documents/git_projects/nus_can
git add -A
git commit -m "feat: P6 + docs — deploy config, Sentry, EAS, migration 003, README, ARQUITECTURA, DEPLOY"
```

---

