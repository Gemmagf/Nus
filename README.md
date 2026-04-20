# Ernest — Sistema Intel·ligent de Monitorització de Salut Canina

**Massiu Soft SL · v1.1 · 2025–2026**

Ernest és un arnès intel·ligent per a gossos que monitoritza contínuament el seu estat físic i comportamental. A diferència de solucions genèriques, compara cada gos **amb ell mateix** (baseline individual), detectant canvis precoços respecte al seu patró habitual.

---

## Característiques principals

- **Firmware ESP32-S3** — lectura IMU + temperatura cada 5 s, buffer offline 1 h, BLE 5.0
- **App mòbil** — React Native + Expo, connexió BLE, sync automàtic, alertes en temps real
- **Backend API** — Fastify d'alta freqüència, ingestió batch, JWT + RLS
- **Pipeline Python** — detecció passejades, pipi/caca, baseline rolling 30 dies, anomalies
- **Dashboard web** — React 19 + Recharts, dades live via Supabase Realtime
- **Demo visual** — HTML pur, dues vistes (propietari / veterinari), sense dependències

---

## Estructura del repositori

```
nus_can/
├── firmware/                   # ESP32-S3 (PlatformIO / FreeRTOS)
│   ├── src/
│   │   ├── main.cpp            # Entry point + FreeRTOS tasks
│   │   ├── sensors/            # IMU MPU-6050 + NTC temperatura
│   │   ├── ble/                # GATT server (UUIDs custom)
│   │   └── power/              # Gestió bateria LiPo
│   ├── include/config.h        # Pins, constants
│   └── platformio.ini
│
├── backend/
│   ├── api/                    # Fastify (ingestió dades)
│   │   ├── src/
│   │   │   ├── server.js       # Fastify + CORS + JWT + Sentry
│   │   │   ├── routes/         # ingest, dogs, metrics, health
│   │   │   └── plugins/        # supabase client
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── supabase/
│   │   ├── migrations/
│   │   │   ├── 001_initial_schema.sql    # Schema base + RLS
│   │   │   ├── 002_walks_bathroom.sql    # Passejades + pipi/caca
│   │   │   └── 003_pipeline_runs_rpc.sql # pipeline_runs + 4 RPCs SQL
│   │   └── functions/
│   │       └── pipeline-daily/           # Edge Function cron (Deno)
│   └── tests/
│       └── load_test.js        # Test de càrrega E2E configurable
│
├── pipeline/                   # Python 3.11+ (processament de dades)
│   ├── features/
│   │   ├── compute_daily.py    # Mètriques diàries des de sensor_readings
│   │   ├── compute_walks.py    # Detecció sessions de passeig
│   │   └── compute_bathroom.py # Detecció pipi / caca
│   ├── baseline/
│   │   └── compute_baseline.py # Percentils P10/P50/P90 rolling 30 dies
│   ├── anomaly/
│   │   └── detect_anomalies.py # Alertes amb filtres anti-fals-positiu (v1.1)
│   ├── validation/             # Dades sintètiques + gràfics de validació
│   ├── tests/
│   │   └── test_features.py    # 11 tests pytest
│   └── requirements.txt
│
├── app/                        # React Native + Expo
│   ├── src/
│   │   ├── screens/            # Home, Metrics, Alerts, Device
│   │   ├── services/           # ble.ts, api.ts (Supabase)
│   │   ├── store/              # Zustand (estat global)
│   │   ├── hooks/              # useBleSync (buffer + flush)
│   │   └── navigation/         # Bottom tabs (React Navigation v6)
│   ├── App.tsx
│   ├── app.config.js           # Configuració Expo + EAS
│   └── eas.json                # Perfils build (dev / preview / prod)
│
├── src/                        # Dashboard web (React 19 + Vite)
│   ├── components/
│   │   ├── DashboardReal.tsx   # Dashboard live Supabase + Realtime
│   │   ├── DashboardDemo.tsx   # Demo amb dades simulades
│   │   ├── HarnessIllustration.tsx
│   │   └── SlideLayout.tsx
│   ├── hooks/
│   │   └── useDashboardData.ts # Carrega dades + subscripció Realtime
│   └── lib/
│       └── supabase.ts         # Client Supabase web
│
├── scripts/
│   └── preflight_check.sh      # Checklist pre-producció automatitzat
│
├── docs/
│   ├── ARQUITECTURA.md         # Decisions tècniques i diagrama
│   └── DEPLOY.md               # Guia de deploy pas a pas
│
├── ernest_demo.html            # Demo visual standalone (vanilla JS)
├── railway.json                # Deploy backend → Railway
├── vercel.json                 # Deploy frontend → Vercel
├── .env.example                # Plantilla variables d'entorn
├── CLAUDE.md                   # Context del projecte per a Claude Code
├── PROCESS_LOG.md              # Log de desenvolupament
└── README.md                   # Aquest fitxer
```

---

## Inici ràpid

### Prerequisits

| Eina | Versió mínima |
|------|---------------|
| Node.js | 20 |
| Python | 3.11 |
| PlatformIO | 6.x |
| Expo CLI | 10.x |

### 1. Clonar i configurar variables d'entorn

```bash
git clone https://github.com/massiusoft/ernest.git
cd ernest
cp .env.example .env
# Edita .env amb les teves claus de Supabase
```

### 2. Dashboard web (demo local)

```bash
npm install
npm run dev
# Obre http://localhost:5173
```

### 3. Backend API

```bash
cd backend/api
npm install
node src/server.js
# API disponible a http://localhost:3001
# Health check: GET http://localhost:3001/health
```

### 4. Pipeline Python

```bash
cd pipeline
pip install -r requirements.txt

# Calcular mètriques d'un gos per a una data
python -m features.compute_daily --dog_id <uuid> --date 2026-04-18

# Executar tests
pytest tests/ -v
```

### 5. App mòbil

```bash
cd app
npm install
npx expo start
# Escaneja el QR amb Expo Go (iOS/Android)
```

### 6. Demo visual (sense instal·lació)

Obre directament al navegador:
```bash
open ernest_demo.html
```

---

## Model de dades

```
sensor_readings ──────────────────────────────────────────┐
  dog_id · ts · acc_xyz · gyro_xyz · temp · battery       │
                                                           ▼
                                                    pipeline Python
                                                           │
                         ┌─────────────────────────────────┤
                         ▼                                 ▼
               daily_metrics                        walk_sessions
                 activity_index                      duration_min
                 rest_hours                          distance_m
                 symmetry_index                      steps
                 avg_temp                            avg_symmetry
                 walk_count   ◄──────────────────────────────┤
                 pipi_count                        bathroom_events
                 caca_count ◄───────────────────────pipi / caca
                         │
                         ▼
                      baselines
                    P10 / P50 / P90
                    (rolling 30 dies)
                         │
                         ▼
                       alerts
                  info / warning / urgent
```

---

## Stack tecnològic

| Capa | Tecnologia |
|------|------------|
| Firmware | ESP32-S3 · FreeRTOS · PlatformIO · BLE 5.0 |
| App mòbil | React Native 0.74 · Expo 51 · react-native-ble-plx · Zustand |
| Backend API | Node.js 20 · Fastify 4 · Supabase · JWT · Zod |
| Pipeline | Python 3.11 · pandas · numpy · scipy · scikit-learn |
| Dashboard web | React 19 · Vite 6 · TypeScript · Recharts · Tailwind CSS |
| Base de dades | Supabase Pro (PostgreSQL) · RLS · Realtime |
| Deploy | Railway (API) · Vercel (web) · Supabase Edge Functions |
| Monitoring | Sentry · UptimeRobot |

---

## Algorismes de detecció (pipeline v1.1)

### Passejades
- Magnitud IMU: `mag = √(acc_x² + acc_y² + acc_z²) − 1g`
- Llindar activitat: **0.12 g**, durada mínima **3 min**, pausa màxima dins sessió **60 s**
- Passos: pics `acc_z > μ + 1.2σ`, refractori 0.3 s
- Distància: `passes × longitud_pas(pes_kg)`

### Detecció fisiològica
- **Pipi**: aturada 12–95 s + pic giroscopi lateral > 25 °/s
- **Caca**: aturada 28–125 s + `acc_z delta < −0.06 g` sostingut > 8 s
- Confiança mínima per reportar: **0.65**

### Anomalies (filtres anti-fals-positiu)
- `MIN_RANGE_RATIO = 0.05` — ignora mètriques amb rang < 5% de la mediana
- `CONSECUTIVE_DAYS = 2` — warning requereix N dies consecutius fora de rang
- `DEDUP_DAYS = 3` — no duplica alertes actives recents
- Urgent (3σ): sense filtre de dies consecutius

---

## Test de càrrega

```bash
# Local (sense autenticació — útil per testar rate-limit)
node backend/tests/load_test.js

# Contra producció, autenticat
export TEST_JWT_TOKEN=<supabase-jwt>
export TEST_DOG_ID=<uuid>
node backend/tests/load_test.js \
  --url https://api.ernest.app \
  --concurrency 20 \
  --batches 200 \
  --readings 50
```

---

## Deploy

Consulta **[docs/DEPLOY.md](docs/DEPLOY.md)** per a la guia completa.

```bash
# Verificació pre-deploy
./scripts/preflight_check.sh

# Frontend → Vercel
vercel --prod

# Backend → Railway
railway up

# Edge Function cron
supabase functions deploy pipeline-daily --no-verify-jwt
```

---

## Seguretat

- **RLS** actiu a totes les taules — cada propietari accedeix únicament als seus gossos
- **JWT** de Supabase verificat en totes les rutes protegides
- **Rate limiting**: 200 req/min per IP
- **HTTPS** a tots els extrems en producció
- Les dades del gos no surten sense consentiment explícit del propietari
- Sentry configurat per eliminar dades personals (`beforeSend`)

---

## Llicència

Propietat de **Massiu Soft SL**. Tots els drets reservats.
