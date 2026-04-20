#!/usr/bin/env node
// ============================================================
// load_test.js — Test de càrrega E2E per a POST /api/v1/ingest/readings
// Ernest · Massiu Soft SL
//
// Ús:
//   node backend/tests/load_test.js [--url <url>] [--concurrency <n>] [--batches <n>]
//
// Exemples:
//   node backend/tests/load_test.js                           # local, 100 batches × 50 pkts
//   node backend/tests/load_test.js --url https://api.ernest.app --concurrency 20
//   node backend/tests/load_test.js --batches 500 --concurrency 50
// ============================================================

import { parseArgs } from 'node:util'
import crypto from 'node:crypto'

// ── Configuració ─────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    url:         { type: 'string',  default: 'http://localhost:3001' },
    token:       { type: 'string',  default: process.env.TEST_JWT_TOKEN || '' },
    dog_id:      { type: 'string',  default: process.env.TEST_DOG_ID   || crypto.randomUUID() },
    concurrency: { type: 'string',  default: '10' },
    batches:     { type: 'string',  default: '100' },
    readings:    { type: 'string',  default: '50' },
    verbose:     { type: 'boolean', default: false },
  }
})

const BASE_URL    = args.url
const JWT_TOKEN   = args.token
const DOG_ID      = args.dog_id
const CONCURRENCY = parseInt(args.concurrency)
const TOTAL       = parseInt(args.batches)
const PKT_SIZE    = parseInt(args.readings)
const VERBOSE     = args.verbose

const ENDPOINT = `${BASE_URL}/api/v1/ingest/readings`

// ── Generador de dades sintètiques ───────────────────────────
function randomFloat(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(4))
}

function generateBatch(batchIndex) {
  const now = Math.floor(Date.now() / 1000)
  const readings = Array.from({ length: PKT_SIZE }, (_, i) => ({
    ts:           now - (PKT_SIZE - i) * 5,  // cada 5 segons
    acc_x:        randomFloat(-0.5, 0.5),
    acc_y:        randomFloat(-0.5, 0.5),
    acc_z:        randomFloat(0.8, 1.2),     // gravetat + soroll
    gyro_x:       randomFloat(-10, 10),
    gyro_y:       randomFloat(-10, 10),
    gyro_z:       randomFloat(-5,  5),
    temp_surface: randomFloat(36.5, 38.5),
    battery_pct:  Math.floor(randomFloat(20, 100)),
    seq:          (batchIndex * PKT_SIZE + i) % 256
  }))

  return {
    dog_id:    DOG_ID,
    device_id: `test-device-${batchIndex % 5}`,
    readings
  }
}

// ── Execució d'una petició ────────────────────────────────────
async function sendBatch(batchIndex) {
  const body    = generateBatch(batchIndex)
  const start   = Date.now()

  const headers = {
    'Content-Type': 'application/json',
    ...(JWT_TOKEN ? { Authorization: `Bearer ${JWT_TOKEN}` } : {})
  }

  try {
    const res = await fetch(ENDPOINT, {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(10_000)
    })

    const elapsed = Date.now() - start
    const ok      = res.ok
    const status  = res.status

    if (VERBOSE) {
      const text = await res.text()
      console.log(`[${batchIndex}] ${status} ${elapsed}ms — ${text.slice(0, 80)}`)
    }

    return { ok, status, elapsed }
  } catch (err) {
    const elapsed = Date.now() - start
    if (VERBOSE) console.error(`[${batchIndex}] ERROR ${elapsed}ms — ${err.message}`)
    return { ok: false, status: 0, elapsed, error: err.message }
  }
}

// ── Pool de concurrència ──────────────────────────────────────
async function runWithConcurrency(tasks, concurrency) {
  const results = []
  let i = 0

  async function worker() {
    while (i < tasks.length) {
      const idx = i++
      results[idx] = await tasks[idx]()
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker())
  await Promise.all(workers)
  return results
}

// ── Estadístiques ─────────────────────────────────────────────
function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function printStats(results) {
  const ok     = results.filter(r => r.ok)
  const errors = results.filter(r => !r.ok)
  const times  = results.map(r => r.elapsed).sort((a, b) => a - b)

  const total_pkts = ok.length * PKT_SIZE
  const duration_s = (times.reduce((s, t) => s + t, 0) / 1000).toFixed(1)

  console.log('\n═══════════════════════════════════════════════════')
  console.log('  ERNEST — RESULTAT TEST DE CÀRREGA')
  console.log('═══════════════════════════════════════════════════')
  console.log(`  URL:            ${ENDPOINT}`)
  console.log(`  Batches totals: ${TOTAL}   (${PKT_SIZE} lectures/batch)`)
  console.log(`  Concurrència:   ${CONCURRENCY} workers en paral·lel`)
  console.log('───────────────────────────────────────────────────')
  console.log(`  ✅ OK:          ${ok.length} / ${results.length}  (${(ok.length/results.length*100).toFixed(1)}%)`)
  console.log(`  ❌ Errors:      ${errors.length}`)
  if (errors.length > 0) {
    const byStatus = {}
    errors.forEach(e => { byStatus[e.status] = (byStatus[e.status] || 0) + 1 })
    Object.entries(byStatus).forEach(([s, n]) => console.log(`     → HTTP ${s}: ${n}`))
  }
  console.log('───────────────────────────────────────────────────')
  console.log(`  Latència p50:   ${percentile(times, 50)} ms`)
  console.log(`  Latència p95:   ${percentile(times, 95)} ms`)
  console.log(`  Latència p99:   ${percentile(times, 99)} ms`)
  console.log(`  Latència max:   ${times[times.length - 1]} ms`)
  console.log(`  Latència min:   ${times[0]} ms`)
  console.log('───────────────────────────────────────────────────')
  console.log(`  Paquets ingerits: ~${total_pkts.toLocaleString()} lectures`)
  console.log(`  Temps total wall: ${duration_s}s`)
  const throughput = (total_pkts / parseFloat(duration_s)).toFixed(0)
  console.log(`  Throughput:       ~${throughput} lectures/s`)
  console.log('═══════════════════════════════════════════════════\n')

  // Exit code 1 si >5% errors
  if (errors.length / results.length > 0.05) {
    console.error('⚠️  Massa errors (>5%). Comprova el servidor i el token JWT.')
    process.exit(1)
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  if (!JWT_TOKEN) {
    console.warn('⚠️  TEST_JWT_TOKEN no definit. Les peticions rebran 401.')
    console.warn('   Exporta el token: export TEST_JWT_TOKEN=<supabase-jwt>\n')
  }

  console.log(`🚀 Ernest load test`)
  console.log(`   ${TOTAL} batches × ${PKT_SIZE} lectures = ${TOTAL * PKT_SIZE} paquets totals`)
  console.log(`   Concurrència: ${CONCURRENCY} | Endpoint: ${ENDPOINT}\n`)

  const tasks = Array.from({ length: TOTAL }, (_, i) => () => sendBatch(i))

  const t0      = Date.now()
  const results = await runWithConcurrency(tasks, CONCURRENCY)
  const wall_s  = ((Date.now() - t0) / 1000).toFixed(2)

  console.log(`   Completat en ${wall_s}s de rellotge`)

  printStats(results)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
