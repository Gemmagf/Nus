// ============================================================
// api.ts — Client REST per al backend Ernest
// Massiu Soft SL
// ============================================================
import { createClient } from '@supabase/supabase-js'
import type { SensorPacket } from './ble'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Auth ─────────────────────────────────────────────────────
export async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

// ── Ingestió de dades ─────────────────────────────────────────
export async function ingestReadings(
  dogId: string,
  deviceId: string,
  packets: SensorPacket[]
): Promise<{ ok: boolean; ingested: number }> {
  const token = await getAuthToken()
  if (!token) throw new Error('Usuari no autenticat')

  const readings = packets.map(p => ({
    ts:           p.timestamp,
    acc_x:        p.acc_x,
    acc_y:        p.acc_y,
    acc_z:        p.acc_z,
    gyro_x:       p.gyro_x,
    gyro_y:       p.gyro_y,
    gyro_z:       p.gyro_z,
    temp_surface: p.temp_surface,
    battery_pct:  p.battery_pct,
    seq:          p.seq,
  }))

  const res = await fetch(`${API_URL}/api/v1/ingest/readings`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ dog_id: dogId, device_id: deviceId, readings }),
  })

  if (!res.ok) throw new Error(`Ingest error: ${res.status}`)
  return res.json()
}

// ── Gossos ───────────────────────────────────────────────────
export async function fetchDogs() {
  const { data, error } = await supabase
    .from('dogs')
    .select('*, device_health(last_seen_at, battery_pct, is_online)')
    .eq('is_active', true)
    .order('created_at')
  if (error) throw error
  return data
}

// ── Mètriques diàries ────────────────────────────────────────
export async function fetchDailyMetrics(dogId: string, days = 30) {
  const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('daily_metrics')
    .select('*')
    .eq('dog_id', dogId)
    .gte('date', from)
    .order('date')
  if (error) throw error
  return data
}

// ── Alertes ──────────────────────────────────────────────────
export async function fetchAlerts(dogId: string) {
  const { data, error } = await supabase
    .from('alerts')
    .select('*')
    .eq('dog_id', dogId)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data
}

export async function markAlertRead(alertId: number) {
  const { error } = await supabase
    .from('alerts')
    .update({ is_read: true })
    .eq('id', alertId)
  if (error) throw error
}
