// ============================================================
// pipeline-daily/index.ts — Supabase Edge Function
// Executa el pipeline de dades Ernest per a tots els gossos actius
// Programat: cron diari a les 03:00 UTC
//
// Deploy:
//   supabase functions deploy pipeline-daily --no-verify-jwt
//
// Cron (a Supabase Dashboard → Edge Functions → Schedules):
//   0 3 * * *   → pipeline-daily
//
// Massiu Soft SL
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PIPELINE_API_URL         = Deno.env.get('PIPELINE_API_URL') || ''

// Data objectiu: ahir (el pipeline calcula el dia complet anterior)
function yesterdayISO(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().split('T')[0]
}

interface PipelineResult {
  dog_id:  string
  date:    string
  ok:      boolean
  steps:   string[]
  error?:  string
}

// ── Lògica del pipeline per a un gos ─────────────────────────
// En producció, invoca el microservei Python; en fallback, fa les
// operacions directament via Supabase SQL (RPC functions).
async function runPipelineForDog(
  sb: ReturnType<typeof createClient>,
  dog_id: string,
  date: string
): Promise<PipelineResult> {
  const steps: string[] = []

  try {
    // ── Opció A: delegar al microservei Python ────────────────
    if (PIPELINE_API_URL) {
      const res = await fetch(`${PIPELINE_API_URL}/run`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dog_id, date }),
        signal:  AbortSignal.timeout(120_000)   // 2 min per gos
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Pipeline API error ${res.status}: ${text}`)
      }

      const result = await res.json()
      steps.push(...(result.steps ?? ['pipeline-api-ok']))
      return { dog_id, date, ok: true, steps }
    }

    // ── Opció B: RPC directa a Supabase ──────────────────────
    // Crida a funcions SQL definides a la BD que fan el càlcul

    // 1. Calcular mètriques diàries
    const { error: e1 } = await sb.rpc('compute_daily_metrics', { p_dog_id: dog_id, p_date: date })
    if (e1) throw new Error(`compute_daily_metrics: ${e1.message}`)
    steps.push('daily_metrics')

    // 2. Recalcular baseline rolling
    const { error: e2 } = await sb.rpc('compute_baseline', { p_dog_id: dog_id })
    if (e2) throw new Error(`compute_baseline: ${e2.message}`)
    steps.push('baseline')

    // 3. Detectar anomalies i generar alertes
    const { error: e3 } = await sb.rpc('detect_anomalies', { p_dog_id: dog_id, p_date: date })
    if (e3) throw new Error(`detect_anomalies: ${e3.message}`)
    steps.push('anomaly_detection')

    // 4. Calcular passejades i events fisiològics
    const { error: e4 } = await sb.rpc('compute_walks_bathroom', { p_dog_id: dog_id, p_date: date })
    if (e4) throw new Error(`compute_walks_bathroom: ${e4.message}`)
    steps.push('walks_bathroom')

    return { dog_id, date, ok: true, steps }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { dog_id, date, ok: false, steps, error: message }
  }
}

// ── Handler principal ─────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Supabase cron envia POST; acceptar també GET per a invocació manual
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const targetDate = new URL(req.url).searchParams.get('date') ?? yesterdayISO()

  console.log(`[pipeline-daily] Iniciant pipeline per a data: ${targetDate}`)

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })

  // 1. Obtenir tots els gossos actius (amb lectures les últimes 36h)
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString()

  const { data: activeDogs, error: dogsError } = await sb
    .from('sensor_readings')
    .select('dog_id')
    .gte('created_at', since)

  if (dogsError) {
    console.error('[pipeline-daily] Error obtenint gossos actius:', dogsError)
    return new Response(JSON.stringify({ error: dogsError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Desduplicar dog_ids
  const dogIds = [...new Set((activeDogs ?? []).map((r: { dog_id: string }) => r.dog_id))]
  console.log(`[pipeline-daily] ${dogIds.length} gossos actius a processar`)

  if (dogIds.length === 0) {
    return new Response(JSON.stringify({
      ok:      true,
      date:    targetDate,
      message: 'Cap gos actiu — pipeline no executat',
      dogs:    0
    }), { headers: { 'Content-Type': 'application/json' } })
  }

  // 2. Executar pipeline seqüencialment (evitar concurrència excessiva a BD)
  const results: PipelineResult[] = []
  for (const dog_id of dogIds) {
    const result = await runPipelineForDog(sb, dog_id, targetDate)
    results.push(result)

    if (!result.ok) {
      console.error(`[pipeline-daily] Error gos ${dog_id}:`, result.error)
    } else {
      console.log(`[pipeline-daily] OK gos ${dog_id} — steps: ${result.steps.join(', ')}`)
    }
  }

  // 3. Registrar execució a pipeline_runs (si existeix la taula)
  const ok_count    = results.filter(r => r.ok).length
  const error_count = results.filter(r => !r.ok).length

  await sb.from('pipeline_runs').insert({
    run_date:    targetDate,
    dogs_total:  dogIds.length,
    dogs_ok:     ok_count,
    dogs_error:  error_count,
    errors:      results.filter(r => !r.ok).map(r => ({ dog_id: r.dog_id, error: r.error })),
    finished_at: new Date().toISOString()
  }).then(() => {}).catch(() => {})  // silenciar si la taula no existeix

  const summary = {
    ok:          error_count === 0,
    date:        targetDate,
    dogs_total:  dogIds.length,
    dogs_ok:     ok_count,
    dogs_error:  error_count,
    results
  }

  console.log(`[pipeline-daily] Completat — OK: ${ok_count}/${dogIds.length}`)

  return new Response(JSON.stringify(summary), {
    status:  error_count > 0 ? 207 : 200,
    headers: { 'Content-Type': 'application/json' }
  })
})
