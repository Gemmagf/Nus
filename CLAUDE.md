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

### Taula: walk_sessions (migration 002)
```sql
id bigserial PRIMARY KEY
dog_id uuid REFERENCES dogs
date date NOT NULL
started_at timestamptz NOT NULL
ended_at timestamptz NOT NULL
duration_min real NOT NULL          -- minuts de passeig
distance_m real                     -- metres estimats (passes × longitud_pas)
steps integer                       -- passes estimades
avg_pace_kmh real                   -- velocitat mitja (km/h)
avg_symmetry real                   -- índex simetria mitja (0-100)
avg_activity real                   -- magnitud IMU mitja normalitzada
detection_confidence real DEFAULT 1.0
pipeline_version text DEFAULT '1.1'
created_at timestamptz DEFAULT now()
```

### Taula: bathroom_events (migration 002)
```sql
id bigserial PRIMARY KEY
dog_id uuid REFERENCES dogs
date date NOT NULL
occurred_at timestamptz NOT NULL
event_type text CHECK (event_type IN ('pipi','caca','unknown'))
duration_s real NOT NULL            -- durada de l'aturada (s)
posture_score real                  -- 0-1, 1=molt clar
gyro_lateral real                   -- pic giroscopi lateral (aixecar pota)
acc_z_delta real                    -- canvi acc_z (flexió dorsal)
walk_session_id bigint REFERENCES walk_sessions(id)
detection_confidence real DEFAULT 0.8
pipeline_version text DEFAULT '1.1'
created_at timestamptz DEFAULT now()
```

### Columnes afegides a daily_metrics (migration 002)
```sql
walk_count smallint        -- nº passejades detectades
walk_total_min real        -- minuts totals caminant
walk_total_m real          -- metres totals estimats
steps_total integer        -- passes totals
pipi_count smallint        -- nº episodis pipi detectats
caca_count smallint        -- nº episodis caca detectats
```

### Vista: daily_summary
Inclou `hydration_level` (molt baix/baix/normal/alt) i `digestive_status` (cap/normal-baix/normal/elevat) calculats a partir de pipi_count i caca_count.

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

## Algorismes de detecció (pipeline v1.1)

### Detecció de passejades (compute_walks.py)
- Magnitud IMU: `mag = sqrt(acc_x²+acc_y²+acc_z²) - 1g`, clipejat a 0
- Llindar activitat: `WALK_THRESHOLD = 0.12g`
- Durada mínima: `MIN_WALK_MIN = 3.0 min`
- Pausa màxima dins sessió: `MAX_GAP_S = 60s`
- Suavitzat: rolling mean 5 lectures (≈25s)
- Comptar passes: pics acc_z > mitja + 1.2σ, refractori 0.3s
- Longitud pas per pes: <10kg→0.25m, 10-25kg→0.40m, >25kg→0.55m

### Detecció d'esdeveniments fisiològics (compute_bathroom.py)
- Pipi: aturada 12-95s + pic giroscopi lateral >25°/s (indica aixecar pota)
- Caca: aturada 28-125s + acc_z delta <-0.06g sostingut >8s (indica flexió dorsal)
- Confiança mínima: 0.65 per reportar l'esdeveniment
- Alertes: pipi=0 → urgent; pipi<P10 → warning; caca=0 dos dies → warning; caca>P90×1.5 → warning

### Demo visual (ernest_demo.html)
- Pure vanilla JS/HTML/CSS, sense dependencies externes
- Vista Propietari: emoji wellness, comptes de passeig/pipi/caca, timeline visual
- Vista Veterinari: graelles mètriques, sessions detallades, 6 gràfics SVG
- Vista App Mòbil: 3 mockups de telèfon (Nus, Lluna, Bruno)
- Escenari toggle: Gos sa ↔ Anomalia (1 pipi, cap caca, passeig curt)

---

## Fase actual de desenvolupament
**P0 → P1 → P2 → P3 → P4 → P5 → P6**
- [x] P0 — Setup repositori, CLAUDE.md, estructura
- [x] P1 — Firmware ESP32 (BLE + sensors) — FreeRTOS dual-core, buffer circular 720 pkts
- [x] P2 — App mòbil BLE → backend — React Native Expo, 4 pantalles, BLE sync, Zustand
- [x] P3 — Backend API (Fastify + Supabase schema) — ingest, dogs, metrics, alerts, RLS
- [x] P4 — Pipeline dades (mètriques + baseline) — v1.1 amb filtres anti-fals-positius
- [x] P5 — Dashboard web complet — DashboardReal.tsx connectat a Supabase + Realtime
- [x] P4+ — Anàlisi passejades + detecció pipi/caca — compute_walks.py, compute_bathroom.py, SQL migration 002, demo dual-view
- [ ] P6 — Integració + tests end-to-end + validació gos real

---

*Actualitza aquest fitxer amb cada decisió tècnica important.*
