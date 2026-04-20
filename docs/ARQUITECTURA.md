# Arquitectura del sistema Ernest

**Massiu Soft SL · v1.1 · 2026**

---

## Visió general

Ernest segueix una arquitectura **edge-to-cloud** en 4 capes:

```
┌─────────────────────────────────────────────────────────────────┐
│  CAPA 1 — DISPOSITIU (arnès)                                    │
│  ESP32-S3 · FreeRTOS · BLE 5.0                                  │
│  IMU MPU-6050 (6 eixos) + NTC temperatura + LiPo 1000mAh       │
└────────────────────────────┬────────────────────────────────────┘
                             │ BLE GATT (paquets 20 bytes, ~5s)
┌────────────────────────────▼────────────────────────────────────┐
│  CAPA 2 — APP MÒBIL                                             │
│  React Native · Expo · react-native-ble-plx                     │
│  Buffer memòria 500 pkts · flush cada 50 pkts · retry automàtic │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS REST (batches JSON)
┌────────────────────────────▼────────────────────────────────────┐
│  CAPA 3 — BACKEND + BASE DE DADES                               │
│  Fastify API (Railway) · Supabase Pro (PostgreSQL)              │
│  JWT + RLS · Rate limit 200 req/min · Ingest batch              │
└────────────────────────────┬────────────────────────────────────┘
                             │ cron 03:00 UTC (Edge Function)
┌────────────────────────────▼────────────────────────────────────┐
│  CAPA 4 — PIPELINE + DASHBOARD                                  │
│  Python 3.11 · pandas · numpy · scikit-learn                    │
│  React 19 + Recharts (Vercel) · Supabase Realtime               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Flux de dades complet

```
ESP32-S3
  │  (cada 5 s: acc_xyz, gyro_xyz, temp, battery)
  │  → buffer circular 720 paquets (≈1h offline)
  │  → BLE GATT NOTIFY (batches de 50 pkts)
  ▼
App mòbil (React Native)
  │  → buffer memòria (max 500 pkts)
  │  → flush automàtic cada 50 pkts (~4 min)
  │  → retry si error (pkts tornen al buffer)
  ▼
POST /api/v1/ingest/readings   [Fastify · Railway]
  │  → validació Zod (BatchSchema)
  │  → verificació JWT + propietat del gos (RLS)
  │  → upsert batch → sensor_readings (Supabase)
  │  → update device_health (last_seen, battery)
  ▼
sensor_readings [Supabase PostgreSQL]
  │  → índex (dog_id, ts DESC)
  │  → retencions time-series sense limit (Pro)
  ▼
Edge Function pipeline-daily [Deno · 03:00 UTC]
  │  → detecta gossos actius (lectures < 36h)
  │  → per cada gos:
  │    ├─ compute_daily_metrics (SQL RPC / Python)
  │    ├─ compute_baseline      (SQL RPC / Python)
  │    ├─ detect_anomalies      (SQL RPC / Python)
  │    └─ compute_walks_bathroom (SQL RPC / Python)
  │  → registra resultat a pipeline_runs
  ▼
daily_metrics + walk_sessions + bathroom_events + baselines + alerts
  ▼
Dashboard web [React 19 · Vercel]           App mòbil [pantalles]
  → Recharts (AreaChart, LineChart, Bar)      → HomeScreen (wellness)
  → Supabase Realtime (alertes noves)         → MetricsScreen (historial)
  → Selector gos · rang 7/14/30 dies         → AlertsScreen (push)
  → Vista propietari i veterinari             → DeviceScreen (BLE)
```

---

## Decisions tècniques clau

### Firmware

| Decisió | Raó |
|---------|-----|
| ESP32-S3 (dual-core) | Core 0 → BLE, Core 1 → sensors. Aïllament de latències |
| Batch 50 lectures per paquet BLE | Equilibri latència (~4 min) vs consum bateria |
| Buffer circular 720 paquets | 1 h de dades offline sense pèrdua si el BLE cau |
| Watchdog timer 30 s | Auto-recovery sense intervenció humana |
| FreeRTOS tasks dedicades | Evita bloquejos entre lectura IMU i transmissió BLE |

### Backend API

| Decisió | Raó |
|---------|-----|
| Fastify (no Express) | Fins a 3× més ràpid en benchmarks, ideal per a ingest d'alta freqüència |
| Upsert amb `onConflict: dog_id,ts` | Idempotència: reintents de l'app no creen duplicats |
| RLS a totes les taules | Seguretat a nivell de BD, no depèn únicament del codi |
| Rate limit 200 req/min per IP | Protecció contra abusos sense penalitzar ús normal |
| `device_health` separada | Monitoratge del dispositiu sense contaminar time-series |

### Pipeline Python

| Decisió | Raó |
|---------|-----|
| Baseline individual (no genèric) | Cada gos és diferent; comparació amb ell mateix és més sensible |
| Percentils P10/P50/P90 (no mitja+σ) | Robusts davant outliers; P50 com a referència, no la mitja |
| Rolling 30 dies | Captura estacionalitat setmanal sense requerir massa historial |
| Filtres anti-fals-positiu v1.1 | Validació amb dades sintètiques: 59 fals positius → < 5 |
| Detecció passejades per IMU (no GPS) | No requereix mòdul GPS addicional a l'arnès |
| Confiança mínima 0.65 per pipi/caca | Preferim no reportar a reportar un fals positiu |

### Base de dades

| Decisió | Raó |
|---------|-----|
| Supabase Pro (PostgreSQL) | RLS natiu, Realtime, Edge Functions, tot integrat |
| Índex `(dog_id, ts DESC)` | Consultes time-series freqüents: O(log n) per rang de dates |
| Vista `daily_summary` | Abstracció per a l'app: hydration_level i digestive_status calculats |
| RPC SQL per al pipeline | L'Edge Function pot funcionar sense microservei Python extern |
| `pipeline_runs` | Auditoria i debugging de l'execució automàtica del pipeline |

### App mòbil

| Decisió | Raó |
|---------|-----|
| Buffer en memòria (no persistit) | Simplicitat MVP; pèrdua de paquets si l'app es tanca és acceptable |
| Flush en background | Garanteix sync quan l'usuari deixa l'app oberta |
| Singleton `bleService` | Evita múltiples instàncies de `BleManager` (crash en React Native) |
| Wellness score lineal (no ML) | Explicable al propietari; revisable post-pilot amb dades reals |

---

## Seguretat

```
Dispositiu → App mòbil
  BLE 5.0 (link layer encryption, parelles per UUID)

App mòbil → Backend
  HTTPS/TLS 1.3 obligatori
  JWT Supabase (exp: 1h, refresh automàtic)
  Payload: dog_id verificat vs owner_id (RLS)

Backend → Supabase
  Service Role Key (SERVIDOR, mai al client)
  RLS actiu: cap query sense context d'usuari passa

Frontend → Supabase
  Anon Key (pública, segura gràcies a RLS)
  Realtime només per a alertes del propietari

Dades personals
  Sentry: beforeSend elimina email i dades de request
  Replay: mask text + block media (GDPR)
  Dades del gos: mai surten sense JWT vàlid
```

---

## Escalabilitat

### Estimació de càrrega (10.000 gossos)

| Mètrica | Valor |
|---------|-------|
| Lectures/s ingestades | ~2.000 (50 pkts/gos × 10k gossos / 4 min flush) |
| Mida sensor_readings/dia | ~3.6 GB (10k gossos × 17.280 lectures/dia × ~20 bytes) |
| Pipeline cron diari | ~10 min (10k gossos × 60 ms/gos) |
| Consultes dashboard concurrents | Escalat automàtic via Supabase Pro connection pooling |

### Escalar verticalment
- **Backend**: Railway escala automàticament via Docker; stateless → múltiples instàncies
- **BD**: Supabase Pro permet llegir répliques per a consultes pesades
- **Pipeline**: particionament per rang de dog_id si el cron supera 15 min

---

## BLE GATT — Perfil custom

| Característica | UUID | Propietats |
|----------------|------|-----------|
| Service | `4fafc201-1fb5-459e-8fcc-c5c9c3319100` | — |
| SENSOR_DATA | `beb5483e-36e1-4688-b7f5-ea07361b26a8` | NOTIFY |
| CONFIG | `beb5483e-36e1-4688-b7f5-ea07361b26a9` | READ + WRITE |
| STATUS | `beb5483e-36e1-4688-b7f5-ea07361b26aa` | READ + NOTIFY |

### Format paquet sensor (20 bytes, little-endian)
```
Bytes 0–3:   uint32  timestamp (Unix s)
Bytes 4–5:   int16   acc_x  (×1000, en g)
Bytes 6–7:   int16   acc_y
Bytes 8–9:   int16   acc_z
Bytes 10–11: int16   gyro_x (×10, en °/s)
Bytes 12–13: int16   gyro_y
Bytes 14–15: int16   gyro_z
Bytes 16–17: int16   temp_surface (×100, en °C)
Byte  18:    uint8   battery_pct (0–100)
Byte  19:    uint8   seq (0–255, wrap-around)
```

---

## Versions i compatibilitat

| Component | Versió | Notes |
|-----------|--------|-------|
| Firmware | v1.0 | BLE GATT custom, FreeRTOS |
| Pipeline | v1.1 | Filtres anti-fals-positiu |
| Backend API | v1.0 | `/api/v1/` prefix |
| App mòbil | v1.0 | Expo 51, React Native 0.74 |
| Dashboard | v1.0 | React 19, Vite 6 |
| Schema BD | migration 003 | walk_sessions, bathroom_events, RPCs |
