# Guia de Deploy — Ernest

**Massiu Soft SL · v1.1**

Aquesta guia cobreix el deploy complet del sistema Ernest en producció. Segueix els passos en ordre.

---

## 0. Prerequisits

```bash
# Eines necessàries
node --version    # >= 20
python3 --version # >= 3.11
git --version

# CLIs de plataformes
npm i -g vercel          # deploy frontend
npm i -g railway         # deploy backend
npm i -g supabase        # migrations + edge functions
npm i -g eas-cli         # build app mòbil
```

Comptes necessaris:
- [Supabase](https://supabase.com) — BD, Auth, Edge Functions
- [Railway](https://railway.app) — Backend API
- [Vercel](https://vercel.com) — Dashboard web
- [Sentry](https://sentry.io) — Monitoring d'errors *(opcional)*
- [UptimeRobot](https://uptimerobot.com) — Health check *(opcional)*
- [Expo](https://expo.dev) — Builds app mòbil *(si es vol publicar)*

---

## 1. Preflight check

Abans de qualsevol deploy, executa el checklist automàtic:

```bash
# Des de l'arrel del projecte
./scripts/preflight_check.sh
```

Ha de sortir **0 errors** (els warnings no bloquegen el deploy).

---

## 2. Supabase — Base de dades

### 2.1 Crear projecte

1. Ves a [supabase.com](https://supabase.com) → **New project**
2. Nom: `ernest-prod` · Regió: Europa (Frankfurt)
3. Guarda la **Database Password** (la necessitaràs)

### 2.2 Obtenir claus

A **Project Settings → API**:
- `URL` → `SUPABASE_URL` i `VITE_SUPABASE_URL`
- `anon public` → `SUPABASE_ANON_KEY` i `VITE_SUPABASE_ANON_KEY`
- `service_role secret` → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ *mai al client*

A **Project Settings → API → JWT Settings**:
- `JWT Secret` → `JWT_SECRET` (per al backend Fastify)

### 2.3 Executar migrations

```bash
cd backend/supabase

# Autenticar-se a Supabase CLI
supabase login

# Linkar al projecte
supabase link --project-ref <PROJECT_REF>
# (PROJECT_REF = els 20 caràcters de la URL: abc123xyz...)

# Aplicar totes les migrations en ordre
supabase db push
```

Verifica que s'hagin creat:
- Taules: `dogs`, `sensor_readings`, `daily_metrics`, `baselines`, `alerts`, `device_health`, `walk_sessions`, `bathroom_events`, `pipeline_runs`
- Vista: `daily_summary`
- Funcions SQL: `compute_daily_metrics`, `compute_baseline`, `detect_anomalies`, `compute_walks_bathroom`

### 2.4 Verificar RLS

A **Table Editor → cada taula** confirma que RLS està activat (icona de candau verda).

### 2.5 Deploy Edge Function (pipeline cron)

```bash
# Des de l'arrel del projecte
supabase functions deploy pipeline-daily --no-verify-jwt
```

**Activar el cron:**
1. Supabase Dashboard → **Edge Functions** → `pipeline-daily`
2. **Add Schedule** → `0 3 * * *` (cada dia a les 03:00 UTC)

**Variables d'entorn de la Edge Function:**
A Edge Functions → `pipeline-daily` → **Secrets**:
```
SUPABASE_URL              = <el teu url>
SUPABASE_SERVICE_ROLE_KEY = <service role key>
PIPELINE_API_URL          = <url del backend Railway, si s'usa> (opcional)
```

---

## 3. Backend API — Railway

### 3.1 Crear servei

```bash
# Des de backend/api/
railway login
railway init    # → "Ernest API"
railway up      # primer deploy
```

O via dashboard: **New Project → Deploy from GitHub Repo** → selecciona `nus_can` → **Root Directory**: `backend/api`

### 3.2 Variables d'entorn a Railway

A **Railway → Ernest API → Variables**:

```env
NODE_ENV=production
PORT=3001
HOST=0.0.0.0

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

JWT_SECRET=<supabase jwt secret>

ALLOWED_ORIGINS=https://ernest.vercel.app,https://ernest.massiusoft.com

SENTRY_DSN=https://xxxx@xxxx.ingest.sentry.io/xxxx   # opcional
LOG_LEVEL=info
```

### 3.3 Configurar health check

A Railway → **Settings → Health Check**:
- Path: `/health`
- Timeout: 5 s

### 3.4 Obtenir la URL del backend

Anota la URL pública de Railway (ex: `https://ernest-api.up.railway.app`). La necessitaràs per a l'app mòbil i el preflight.

---

## 4. Dashboard web — Vercel

### 4.1 Deploy

```bash
# Des de l'arrel del projecte (on hi ha vercel.json)
vercel --prod
```

O via dashboard: **New Project → Import Git Repository** → selecciona `nus_can`.

### 4.2 Variables d'entorn a Vercel

A **Vercel → Ernest Dashboard → Settings → Environment Variables**:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SENTRY_DSN=https://xxxx@xxxx.ingest.sentry.io/xxxx   # opcional
```

Selecciona **Production** + **Preview** per a totes.

### 4.3 Domani personalitzat (opcional)

A **Domains** → afegeix `ernest.massiusoft.com` i configura el CNAME a DNS.

---

## 5. App mòbil — EAS Build

### 5.1 Configurar EAS

```bash
cd app
eas login
eas build:configure   # genera app.config.js si no existia
```

Edita `app/app.config.js` i omple:
```js
eas: { projectId: '<EL_TEU_PROJECT_ID>' }
```

### 5.2 Variables d'entorn de l'app

Crea `app/.env.production`:
```env
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_API_URL=https://ernest-api.up.railway.app
EXPO_PUBLIC_SENTRY_DSN=https://xxxx@xxxx.ingest.sentry.io/xxxx
```

### 5.3 Build i distribució

```bash
# APK intern (Android) per a testing
eas build --platform android --profile preview

# Build producció (iOS + Android)
eas build --platform all --profile production

# Submit a App Store / Google Play
eas submit --platform ios
eas submit --platform android
```

---

## 6. Monitoring — Sentry

### 6.1 Crear projectes Sentry

1. [sentry.io](https://sentry.io) → **New Project**
2. Crea **2 projectes**: `ernest-api` (Node) i `ernest-dashboard` (React)
3. Copia els DSN corresponents

### 6.2 Configurar DSN

Afegeix els DSN a:
- `.env` local (per a tests)
- Variables Railway (backend)
- Variables Vercel (frontend)
- `app/.env.production` (app mòbil)

### 6.3 Verificar

Fes una petició incorrecta a l'API i confirma que apareix a Sentry:
```bash
curl -X POST https://api.ernest.app/api/v1/ingest/readings \
  -H "Content-Type: application/json" \
  -d '{"invalid": true}'
```

---

## 7. Monitoring — UptimeRobot

1. [uptimerobot.com](https://uptimerobot.com) → **Add New Monitor**
2. Type: **HTTP(s)**
3. URL: `https://ernest-api.up.railway.app/health`
4. Interval: **5 minuts**
5. Alertes: email + (opcional) Slack

---

## 8. Firmware — ESP32-S3

### 8.1 Instal·lar PlatformIO

```bash
pip install platformio
# o via VS Code Extension: PlatformIO IDE
```

### 8.2 Compilar i flashejar

```bash
cd firmware

# Compilar
pio run

# Flashejar (amb ESP32-S3 connectat per USB)
pio run --target upload

# Monitor serial (debug)
pio device monitor --baud 115200
```

### 8.3 Verificar

```
[Ernest] IMU OK — acc: 0.01g 0.02g 0.98g
[Ernest] Temp: 37.2°C  Battery: 87%
[Ernest] BLE advertising...
[Ernest] BLE connected: XX:XX:XX:XX:XX:XX
[Ernest] Sent 50 readings via BLE
```

---

## 9. Verificació final E2E

Amb tot desplegat, comprova el flux complet:

```bash
# 1. Test de càrrega contra producció (necessita JWT real)
export TEST_JWT_TOKEN=<supabase-jwt>
export TEST_DOG_ID=<uuid-del-gos>
node backend/tests/load_test.js \
  --url https://ernest-api.up.railway.app \
  --concurrency 10 \
  --batches 100

# Resultat esperat:
# ✅ OK: 100/100 (100.0%)
# Latència p95: < 200ms
# Throughput: > 500 lectures/s
```

```bash
# 2. Preflight check final
ERNEST_API_URL=https://ernest-api.up.railway.app \
TEST_JWT_TOKEN=<token> \
TEST_DOG_ID=<uuid> \
./scripts/preflight_check.sh
```

---

## Checklist de deploy complet

```
SUPABASE
  ☐ Projecte creat a Europa
  ☐ 3 migrations aplicades (db push)
  ☐ RLS verificat a totes les taules
  ☐ Edge Function pipeline-daily desplegada
  ☐ Cron "0 3 * * *" activat
  ☐ Secrets de l'Edge Function configurats

RAILWAY (Backend API)
  ☐ Servei creat i connectat al repo
  ☐ 9 variables d'entorn configurades
  ☐ Health check /health actiu
  ☐ Deploy verd (log: "Ernest API running")

VERCEL (Dashboard web)
  ☐ Projecte connectat al repo
  ☐ VITE_SUPABASE_URL i ANON_KEY configurades
  ☐ Deploy correcte (verd)
  ☐ Domini personalitzat configurat (opcional)

APP MÒBIL
  ☐ EAS_PROJECT_ID omplert a app.config.js
  ☐ Variables EXPO_PUBLIC_* configurades
  ☐ Build preview (APK) testejat en dispositiu físic
  ☐ BLE connecta correctament amb l'arnès

FIRMWARE
  ☐ Flashejat a dispositiu físic
  ☐ BLE visible i connectable des de l'app
  ☐ Lectures apareixen a sensor_readings
  ☐ Test bateria 48h completat

MONITORING
  ☐ Sentry rep events del backend
  ☐ Sentry rep events del frontend
  ☐ UptimeRobot monitoritza /health
  ☐ Alerta email configurada per a downtime

VALIDACIÓ
  ☐ Test de càrrega passat (p95 < 200ms)
  ☐ Preflight check sense errors
  ☐ 14 dies de dades reals per a 1r baseline
```

---

## Rollback

Si cal revertir un deploy:

```bash
# Backend (Railway)
railway rollback          # reverteix a l'últim deploy estable

# Frontend (Vercel)
vercel rollback           # o des del dashboard: Deployments → Promote

# BD (Supabase)
# Les migrations SQL no es fan rollback automàticament.
# Crear una migration de reversió manual si cal.

# Edge Function
supabase functions deploy pipeline-daily --version <anterior>
```

---

## Contacte i suport

**Massiu Soft SL** · [hola@massiusoft.com](mailto:hola@massiusoft.com)

Incidències de producció: obrir issue a GitHub amb label `urgent`.
