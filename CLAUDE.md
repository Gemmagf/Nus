# CLAUDE.md — Projecte Ernest
**Sistema Intel·ligent de Monitorització de Salut Canina**
Massiu Soft SL · Versió 1.0 · 2025

---

## Visió del producte
Ernest és un arnès intel·ligent per gossos que monitoritza contínuament el seu estat físic i comportamental. El sistema compara cada gos amb ell mateix (baseline individual), no amb una base de dades genèrica. Detecta canvis precoços respecte al patró habitual de l'animal.

## Stack tecnològic

### Firmware (firmware/)
- MCU: ESP32-S3
- Sensors: IMU MPU-6050 (acceleròmetre + giroscopi) + NTC temperatura
- Runtime: FreeRTOS + Arduino framework via PlatformIO
- Comunicació: BLE 5.0 (GATT custom profile)
- Bateria: LiPo 1000mAh + gestió baix consum

### App mòbil (app/)
- React Native + Expo + TypeScript
- BLE: react-native-ble-plx
- Backend: REST API + Supabase Realtime
- Suport iOS + Android

### Backend API (backend/)
- Runtime: Node.js 20
- Framework: Fastify (ingestió alta freqüència)
- Frontend/API routes: Next.js 15
- Auth: Supabase Auth + JWT
- Base de dades: Supabase Pro (PostgreSQL)

### Pipeline de dades (pipeline/)
- Llenguatge: Python 3.11+
- Llibreries: pandas, scipy, numpy, scikit-learn
- Execució: scripts cron + Supabase Edge Functions
- Tasques: neteja, extracció features, càlcul baseline rolling, detecció anomalies

### Dashboard web (src/ — app actual)
- Framework: React 19 + Vite + TypeScript
- UI: Tailwind CSS + Recharts
- Estat actual: Demo/presentació funcional

### Infraestructura
- Deploy frontend: Vercel
- Deploy backend: Railway
- BD + Auth: Supabase Pro
- Monitoratge: Sentry + UptimeRobot
- CI/CD: GitHub Actions

---

## Estructura del repositori
```
nus_can/
├── firmware/          # ESP32-S3 C/C++ (PlatformIO)
│   ├── src/
│   │   ├── main.cpp
│   │   ├── sensors/   # IMU, temperatura
│   │   ├── ble/       # GATT server
│   │   └── power/     # gestió bateria
│   ├── include/
│   └── platformio.ini
├── backend/           # Fastify API + Next.js
│   ├── api/           # Fastify (ingestió dades)
│   ├── web/           # Next.js (dashboard + auth)
│   └── supabase/      # Migrations + Edge Functions
├── pipeline/          # Python data pipeline
│   ├── features/      # extracció de mètriques
│   ├── baseline/      # càlcul baseline rolling
│   ├── anomaly/       # detecció anomalies
│   └── tests/
├── app/               # React Native (futur)
├── src/               # Dashboard demo web (actual)
│   └── components/
├── docs/              # Documentació tècnica
├── CLAUDE.md          # Aquest fitxer
├── PROCESS_LOG.md     # Log de desenvolupament
└── README.md
```

---

## Model de dades principal

### Taula: dogs
```sql
id uuid PRIMARY KEY
owner_id uuid REFERENCES auth.users
name text NOT NULL
breed text
birth_date date
weight_kg numeric(4,1)
created_at timestamptz DEFAULT now()
```

### Taula: sensor_readings (time-series)
```sql
id bigserial PRIMARY KEY
dog_id uuid REFERENCES dogs
ts timestamptz NOT NULL          -- timestamp lectura
acc_x float4, acc_y float4, acc_z float4   -- acceleròmetre (g)
gyro_x float4, gyro_y float4, gyro_z float4 -- giroscopi (°/s)
temp_surface float4              -- temperatura superficial (°C)
battery_pct int2                 -- % bateria dispositiu
created_at timestamptz DEFAULT now()
```

### Taula: daily_metrics
```sql
id bigserial PRIMARY KEY
dog_id uuid REFERENCES dogs
date date NOT NULL
activity_index float4            -- 0-100 índex d'activitat
rest_hours float4                -- hores de descans
rest_fragmentation float4        -- índex de fragmentació (0-1)
symmetry_index float4            -- 0-100 (100 = perfecte)
avg_temp float4
steps_estimated int4
anomaly_score float4             -- 0-1 (>0.7 = alerta)
created_at timestamptz DEFAULT now()
UNIQUE(dog_id, date)
```

### Taula: baselines
```sql
id bigserial PRIMARY KEY
dog_id uuid REFERENCES dogs
metric text NOT NULL             -- 'activity_index', 'rest_hours', etc.
p10 float4, p50 float4, p90 float4   -- percentils del baseline
window_days int4 DEFAULT 30
computed_at timestamptz DEFAULT now()
```

### Taula: alerts
```sql
id bigserial PRIMARY KEY
dog_id uuid REFERENCES dogs
severity text CHECK (severity IN ('info','warning','urgent'))
metric text
message text
is_read boolean DEFAULT false
created_at timestamptz DEFAULT now()
```

---

## Eixos transversals (sempre presents)

### Seguretat
- RLS actiu a totes les taules per owner_id
- HTTPS everywhere, JWT tokens, refresh automàtic
- Dades del gos no sortiran mai sense consentiment explícit

### Escalabilitat
- Schema time-series optimitzat amb índexs per (dog_id, ts)
- Pipeline Python s'executa de forma asíncrona, no bloqueja l'API
- Arquitectura stateless: múltiples instàncies possibles

### Operabilitat
- Health check endpoint: GET /health
- Dispositiu reporta estat bateria en cada lectura
- Alerta automàtica si un dispositiu no sincronitza en >12h
- Totes les operacions crítiques tenen retry automàtic

---

## Convencions de codi

### TypeScript/JavaScript
- `camelCase` per variables i funcions
- `PascalCase` per components i classes
- `UPPER_SNAKE_CASE` per constants globals
- Imports absoluts des de `src/`
- Preferir `async/await` sobre `.then()`

### Python
- `snake_case` per tot
- Type hints obligatoris en funcions públiques
- Docstring en format Google Style
- Tests amb pytest

### Git
- Commits en anglès: `feat:`, `fix:`, `docs:`, `test:`, `chore:`
- Una funcionalitat = una branca = un PR
- Main branch sempre estable i deployable

---

## Fase actual de desenvolupament
**P0 → P1 → P2 → P3 → P4 → P5 → P6**
- [x] P0 — Setup repositori, CLAUDE.md, estructura
- [x] P1 — Firmware ESP32 (BLE + sensors) — FreeRTOS dual-core, buffer circular 720 pkts
- [x] P2 — App mòbil BLE → backend — React Native Expo, 4 pantalles, BLE sync, Zustand
- [x] P3 — Backend API (Fastify + Supabase schema) — ingest, dogs, metrics, alerts, RLS
- [x] P4 — Pipeline dades (mètriques + baseline) — v1.1 amb filtres anti-fals-positius
- [x] P5 — Dashboard web complet — DashboardReal.tsx connectat a Supabase + Realtime
- [ ] P6 — Integració + tests end-to-end + validació gos real

---

*Actualitza aquest fitxer amb cada decisió tècnica important.*
