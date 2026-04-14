// ============================================================
// src/hooks/useDashboardData.ts — Hook de dades del dashboard
// Conecta amb Supabase per obtenir gossos, mètriques i alertes
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

export function useDashboardData(dogId?: string, days = 30) {
  const [dogs, setDogs]         = useState<Dog[]>([])
  const [metrics, setMetrics]   = useState<DailyMetric[]>([])
  const [alerts, setAlerts]     = useState<Alert[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const loadDogs = useCallback(async () => {
    const { data, error } = await supabase
      .from('dogs')
      .select('*, device_health(battery_pct, is_online, last_seen_at)')
      .eq('is_active', true)
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
    try {
      const dogsData = await loadDogs()
      setDogs(dogsData)
      const targetId = dogId ?? dogsData[0]?.id
      if (targetId) {
        const [m, a] = await Promise.all([loadMetrics(targetId), loadAlerts(targetId)])
        setMetrics(m)
        setAlerts(a)
      }
    } catch (e: any) {
      console.error('[Dashboard] Load error', e)
      setError(e.message ?? 'Error carregant dades')
    } finally {
      setLoading(false)
    }
  }, [dogId, loadDogs, loadMetrics, loadAlerts])

  useEffect(() => { load() }, [dogId, days])

  const markAlertRead = useCallback(async (alertId: number) => {
    await supabase.from('alerts').update({ is_read: true }).eq('id', alertId)
    setAlerts(prev => prev.filter(a => a.id !== alertId))
  }, [])

  // Realtime subscripció a noves alertes
  useEffect(() => {
    if (!dogId) return
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
  }, [dogId])

  return { dogs, metrics, alerts, loading, error, reload: load, markAlertRead }
}
