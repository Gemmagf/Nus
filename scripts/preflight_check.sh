#!/usr/bin/env bash
# ============================================================
# preflight_check.sh — Checklist pre-producció Ernest
# Massiu Soft SL
#
# Ús:
#   chmod +x scripts/preflight_check.sh
#   ./scripts/preflight_check.sh
#   ./scripts/preflight_check.sh --url https://api.ernest.app
#
# Variables d'entorn necessàries (o carrega .env automàticament):
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
#   ERNEST_API_URL (per defecte: http://localhost:3001)
#   TEST_JWT_TOKEN (opcional, per a tests autenticats)
# ============================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

# ── Carregar .env si existeix ────────────────────────────────
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# ── Paràmetres ────────────────────────────────────────────────
API_URL="${ERNEST_API_URL:-http://localhost:3001}"
for arg in "$@"; do
  case "$arg" in
    --url=*) API_URL="${arg#*=}" ;;
    --url)   shift; API_URL="$1" ;;
  esac
done

# ── Contadors ─────────────────────────────────────────────────
PASS=0; FAIL=0; WARN=0

pass() { echo -e "  ${GREEN}✅ $1${RESET}"; ((PASS++)); }
fail() { echo -e "  ${RED}❌ $1${RESET}"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}⚠️  $1${RESET}"; ((WARN++)); }
section() { echo -e "\n${BOLD}${BLUE}── $1 ──────────────────────────────────────────${RESET}"; }

# ── Helpers ───────────────────────────────────────────────────
check_env() {
  local var="$1"
  if [ -n "${!var:-}" ]; then
    pass "Variable d'entorn: $var"
  else
    fail "Variable d'entorn absent: $var"
  fi
}

http_check() {
  local label="$1" url="$2" expected_status="${3:-200}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
  if [ "$status" = "$expected_status" ]; then
    pass "$label (HTTP $status)"
  else
    fail "$label — esperat $expected_status, rebut $status"
  fi
}

command_exists() {
  command -v "$1" &>/dev/null
}

# ═════════════════════════════════════════════════════════════
echo -e "\n${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  ERNEST — PREFLIGHT CHECK PRE-PRODUCCIÓ${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "  API URL: ${API_URL}"
echo -e "  Data:    $(date -u '+%Y-%m-%d %H:%M UTC')"

# ══════════════════════════════════════════════════════════════
section "1. EINES I DEPENDÈNCIES"

command_exists node  && pass "Node.js $(node --version)" || fail "Node.js no trobat"
command_exists npm   && pass "npm $(npm --version)"      || fail "npm no trobat"
command_exists python3 && pass "Python $(python3 --version 2>&1 | awk '{print $2}')" || warn "Python3 no trobat (pipeline local)"
command_exists curl  && pass "curl disponible"           || fail "curl no trobat"
command_exists git   && pass "git disponible"            || warn "git no trobat"

# ══════════════════════════════════════════════════════════════
section "2. VARIABLES D'ENTORN"

# Backend (obligatòries)
check_env "SUPABASE_URL"
check_env "SUPABASE_SERVICE_ROLE_KEY"

# Frontend (obligatòries per al dashboard)
check_env "VITE_SUPABASE_URL"
check_env "VITE_SUPABASE_ANON_KEY"

# Opcionals
[ -n "${JWT_SECRET:-}" ]          && pass "JWT_SECRET configurat"          || warn "JWT_SECRET no configurat (usarà dev-secret)"
[ -n "${SENTRY_DSN:-}" ]          && pass "SENTRY_DSN configurat"          || warn "SENTRY_DSN absent (monitoring desactivat)"
[ -n "${PIPELINE_API_URL:-}" ]    && pass "PIPELINE_API_URL configurat"    || warn "PIPELINE_API_URL absent (Edge Function farà RPC directa)"

# ══════════════════════════════════════════════════════════════
section "3. FITXERS NECESSARIS"

check_file() {
  local path="$1"
  [ -f "$path" ] && pass "$path" || fail "Fitxer absent: $path"
}

check_file "backend/api/src/server.js"
check_file "backend/api/Dockerfile"
check_file "backend/supabase/migrations/001_initial_schema.sql"
check_file "backend/supabase/migrations/002_walks_bathroom.sql"
check_file "backend/supabase/functions/pipeline-daily/index.ts"
check_file "pipeline/features/compute_daily.py"
check_file "pipeline/features/compute_walks.py"
check_file "pipeline/features/compute_bathroom.py"
check_file "pipeline/baseline/compute_baseline.py"
check_file "pipeline/anomaly/detect_anomalies.py"
check_file "vercel.json"
check_file "railway.json"

# .env.example però NO .env al repositori
[ -f ".env.example" ] && pass ".env.example present" || warn ".env.example absent"
if git ls-files --error-unmatch ".env" &>/dev/null 2>&1; then
  fail ".env està al repositori git (risc de seguretat!)"
else
  pass ".env NO està al repositori git"
fi

# ══════════════════════════════════════════════════════════════
section "4. BACKEND API — SALUT DEL SERVIDOR"

http_check "GET /health" "${API_URL}/health" "200"

# Test d'ingestió sense JWT (ha de retornar 401)
http_check "POST /ingest sense JWT retorna 401" \
  "${API_URL}/api/v1/ingest/readings" "401"

# Si hi ha token de test, prova autenticada
if [ -n "${TEST_JWT_TOKEN:-}" ] && [ -n "${TEST_DOG_ID:-}" ]; then
  INGEST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${API_URL}/api/v1/ingest/readings" \
    -H "Authorization: Bearer ${TEST_JWT_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"dog_id\":\"${TEST_DOG_ID}\",\"device_id\":\"preflight\",\"readings\":[{\"ts\":$(date +%s),\"acc_x\":0.01,\"acc_y\":0.01,\"acc_z\":1.0,\"gyro_x\":0,\"gyro_y\":0,\"gyro_z\":0,\"temp_surface\":37.5,\"battery_pct\":80,\"seq\":0}]}" \
    --max-time 10 2>/dev/null || echo "000")
  [ "$INGEST_STATUS" = "201" ] && pass "POST /ingest autenticat retorna 201" \
                               || fail "POST /ingest autenticat retorna $INGEST_STATUS (esperat 201)"
else
  warn "TEST_JWT_TOKEN / TEST_DOG_ID no configurats — salt del test d'ingestió autenticada"
fi

# ══════════════════════════════════════════════════════════════
section "5. PIPELINE PYTHON — TESTS UNITARIS"

if command_exists python3 && [ -f "pipeline/tests/test_features.py" ]; then
  if python3 -m pytest pipeline/tests/ -q --tb=no 2>&1 | tail -1 | grep -q "passed"; then
    PASSED=$(python3 -m pytest pipeline/tests/ -q --tb=no 2>&1 | tail -1)
    pass "pytest: $PASSED"
  else
    fail "pytest: alguns tests fallen — executa: python3 -m pytest pipeline/tests/ -v"
  fi
else
  warn "pytest no executat (python3 o tests absents)"
fi

# ══════════════════════════════════════════════════════════════
section "6. SEGURETAT"

# Claus secrets no hardcoded als fitxers de codi
SECRETS_IN_CODE=0
for pattern in "eyJhbGci" "service_role" "secret.*=.*[A-Za-z0-9]{32}"; do
  if grep -rq "$pattern" backend/api/src/ 2>/dev/null; then
    fail "Possible secret hardcoded al codi backend: pattern '$pattern'"
    SECRETS_IN_CODE=1
  fi
done
[ $SECRETS_IN_CODE -eq 0 ] && pass "Cap secret hardcoded detectat al codi"

# .gitignore inclou .env
if grep -q "^\.env$" .gitignore 2>/dev/null; then
  pass ".env inclòs a .gitignore"
else
  fail ".env NO inclòs a .gitignore"
fi

# ══════════════════════════════════════════════════════════════
section "7. GIT — ESTAT DEL REPOSITORI"

if command_exists git; then
  BRANCH=$(git branch --show-current 2>/dev/null || echo "desconegut")
  pass "Branca actual: $BRANCH"

  UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  [ "$UNCOMMITTED" = "0" ] && pass "Sense canvis sense commitar" \
                            || warn "$UNCOMMITTED fitxers amb canvis pendents de commitar"

  # Verificar que main és estable (darrer commit no és WIP)
  LAST_MSG=$(git log -1 --pretty=%s 2>/dev/null || echo "")
  echo "$LAST_MSG" | grep -qi "wip\|temp\|draft" \
    && warn "Darrer commit sembla temporal: '$LAST_MSG'" \
    || pass "Darrer commit: '$LAST_MSG'"
fi

# ══════════════════════════════════════════════════════════════
# ── Resum final ───────────────────────────────────────────────
echo -e "\n${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  RESUM PREFLIGHT${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════════${RESET}"
echo -e "  ${GREEN}✅ OK:       $PASS${RESET}"
echo -e "  ${YELLOW}⚠️  Avisos:   $WARN${RESET}"
echo -e "  ${RED}❌ Errors:   $FAIL${RESET}"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}${BOLD}  ⛔ NO llest per a producció — corregeix els errors.${RESET}\n"
  exit 1
elif [ $WARN -gt 3 ]; then
  echo -e "${YELLOW}${BOLD}  ⚠️  Llest amb warnings — revisa els avisos abans de deploy.${RESET}\n"
  exit 0
else
  echo -e "${GREEN}${BOLD}  🚀 Sistema llest per a producció!${RESET}\n"
  exit 0
fi
