// ============================================================
// src/hooks/useDashboardData.ts — Hook de dades del dashboard
// Conecta amb Supabase per obtenir gossos, mètriques i alertes.
// Si Supabase no està configurat, retorna dades de demo.
// Massiu Soft SL
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface Dog {
  id: string
  name: string
  breed?: string
  birth_date?: string
  weight_kg?: number
  device_health?: {
    battery_pct: number
    is_online: boolean
    last_seen_at: string
  }
}

export interface DailyMetric {
  id: number
  dog_id: string
  date: string
  activity_index: number | null
  rest_hours: number | null
  rest_fragmentation: number | null
  symmetry_index: number | null
  avg_temp: number | null
  steps_estimated: number | null
  anomaly_score: number | null
}

export interface Alert {
  id: number
  dog_id: string
  severity: 'info' | 'warning' | 'urgent'
  metric: string
  message: string
  created_at: string
  is_read: boolean
}

// ── Dades de demo ─────────────────────────────────────────────
// S'usen quan VITE_SUPABASE_URL no està configurat.
const IS_DEMO = !import.meta.env.VITE_SUPABASE_URL

function makeDemoMetrics(dogId: string, days: number, scenario: 'sa' | 'anomalia'): DailyMetric[] {
  const metrics: DailyMetric[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const date = d.toISOString().split('T')[0]
    const isAnomaly = scenario === 'anomalia' && i <= 4

    // Base amb variació natural diària
    const noise = () => (Math.random() - 0.5) * 8
    const activity = isAnomaly
      ? Math.max(10, 28 + noise())
      : Math.min(100, 72 + noise())
    const symmetry = isAnomaly
      ? Math.max(60, 74 + noise())
      : Math.min(100, 91 + noise())
    const rest = isAnomaly
      ? Math.max(10, 14 + noise() / 2)
      : Math.min(16, 9.2 + noise() / 4)
    const temp = isAnomaly
      ? 39.1 + Math.random() * 0.4
      : 37.8 + (Math.random() - 0.5) * 0.6
    const anomalyScore = isAnomaly
      ? 0.7 + Math.random() * 0.25
      : Math.random() * 0.25

    metrics.push({
      id: i,
      dog_id: dogId,
      date,
      activity_index:     +activity.toFixed(1),
      rest_hours:         +rest.toFixed(1),
      rest_fragmentation: +(Math.random() * 0.3).toFixed(3),
      symmetry_index:     +symmetry.toFixed(1),
      avg_temp:           +temp.toFixed(1),
      steps_estimated:    Math.round(activity * 80 + Math.random() * 500),
      anomaly_score:      +anomalyScore.toFixed(2),
    })
  }
  return metrics
}

const DEMO_DOGS: Dog[] = [
  {
    id: 'demo-nus',
    name: 'Nus',
    breed: 'Llaurador Negre',
    birth_date: '2015-03-12',
    weight_kg: 28.5,
    device_health: { battery_pct: 74, is_online: true, last_seen_at: new Date().toISOString() }
  },
  {
    id: 'demo-lluna',
    name: 'Lluna',
    breed: 'Bòrder Collie',
    birth_date: '2019-07-04',
    weight_kg: 19.2,
    device_health: { battery_pct: 91, is_online: true, last_seen_at: new Date().toISOString() }
  },
  {
    id: 'demo-bruno',
    name: 'Bruno',
    breed: 'Pastor Alemany',
    birth_date: '2017-11-22',
    weight_kg: 34.0,
    device_health: { battery_pct: 38, is_online: false, last_seen_at: new Date(Date.now() - 4 * 3600000).toISOString() }
  },
]

const DEMO_ALERTS: Alert[] = [
  {
    id: 1,
    dog_id: 'demo-nus',
    severity: 'urgent',
    metric: 'activity_index',
    message: '⚠️ activity_index molt per sota del normal (28.3 vs P10=55.1)',
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    is_read: false,
  },
  {
    id: 2,
    dog_id: 'demo-nus',
    severity: 'warning',
    metric: 'avg_temp',
    message: 'avg_temp fora del rang habitual (39.2°C; rang normal 37.2–38.6)',
    created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
    is_read: false,
  },
]

// ── Hook principal ─────────────────────────────────────────────
export function useDashboardData(dogId?: string, days = 30) {
  const [dogs, setDogs]         = useState<Dog[]>([])
  const [metrics, setMetrics]   = useState<DailyMetric[]>([])
  const [alerts, setAlerts]     = useState<Alert[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [isDemo, setIsDemo]     = useState(false)

  const loadDogs = useCallback(async () => {
    const { data, error } = await supabase
      .from('dogs')
      .select('*, device_health(battery_pct, is_online, last_seen_at)')
      .order('created_at')
    if (error) throw error
    return (data ?? []) as Dog[]
  }, [])

  const loadMetrics = useCallback(async (id: string) => {
    const from = new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('daily_metrics')
      .select('*')
      .eq('dog_id', id)
      .gte('date', from)
      .order('date')
    if (error) throw error
    return (data ?? []) as DailyMetric[]
  }, [days])

  const loadAlerts = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('dog_id', id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw error
    return (data ?? []) as Alert[]
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    // Mode demo: sense Supabase configurat
    if (IS_DEMO) {
      await new Promise(r => setTimeout(r, 600)) // simula latència
      const targetId = dogId ?? 'demo-nus'
      const scenario = targetId === 'demo-nus' ? 'anomalia' : 'sa'
      setDogs(DEMO_DOGS)
      setMetrics(makeDemoMetrics(targetId, days, scenario as 'sa' | 'anomalia'))
      setAlerts(targetId === 'demo-nus' ? DEMO_ALERTS : [])
      setIsDemo(true)
      setLoading(false)
      return
    }

    try {
      const dogsData = await loadDogs()
      setDogs(dogsData)
      const targetId = dogId ?? dogsData[0]?.id
      if (targetId) {
        const [m, a] = await Promise.all([loadMetrics(targetId), loadAlerts(targetId)])
        setMetrics(m)
        setAlerts(a)
      }
      setIsDemo(false)
    } catch (e: unknown) {
      console.error('[Dashboard] Load error', e)
      // Fallback a demo si hi ha error de connexió
      const targetId = dogId ?? 'demo-nus'
      const scenario = targetId === 'demo-nus' ? 'anomalia' : 'sa'
      setDogs(DEMO_DOGS)
      setMetrics(makeDemoMetrics(targetId, days, scenario as 'sa' | 'anomalia'))
      setAlerts(targetId === 'demo-nus' ? DEMO_ALERTS : [])
      setIsDemo(true)
      setError(null) // no mostrar error, mostrar demo
    } finally {
      setLoading(false)
    }
  }, [dogId, loadDogs, loadMetrics, loadAlerts, days])

  useEffect(() => { load() }, [dogId, days])

  const markAlertRead = useCallback(async (alertId: number) => {
    if (!isDemo) {
      await supabase.from('alerts').update({ is_read: true }).eq('id', alertId)
    }
    setAlerts(prev => prev.filter(a => a.id !== alertId))
  }, [isDemo])

  // Realtime subscripció a noves alertes (només en mode live)
  useEffect(() => {
    if (!dogId || isDemo) return
    const channel = supabase
      .channel(`alerts-${dogId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'alerts',
        filter: `dog_id=eq.${dogId}`
      }, (payload) => {
        setAlerts(prev => [payload.new as Alert, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [dogId, isDemo])

  return { dogs, metrics, alerts, loading, error, isDemo, reload: load, markAlertRead }
}
