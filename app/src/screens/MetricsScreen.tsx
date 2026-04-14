// ============================================================
// MetricsScreen.tsx — Historial de mètriques (30 dies)
// Gràfics: activitat, simetria, repòs, temperatura
// Massiu Soft SL
// ============================================================
import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Dimensions, RefreshControl
} from 'react-native'
import { fetchDailyMetrics } from '../services/api'
import { useAppStore } from '../store'

const C = {
  bg:      '#F0F4F8',
  card:    '#FFFFFF',
  primary: '#1565C0',
  success: '#2E7D32',
  warning: '#E65100',
  urgent:  '#B71C1C',
  purple:  '#7B1FA2',
  text:    '#1A1A2E',
  sub:     '#607D8B',
  border:  '#E0E7EF',
}

const W = Dimensions.get('window').width - 32

// Tipus mètriques disponibles
const METRICS = [
  { key: 'activity_index',   label: 'Activitat',    unit: '/100', color: C.primary,  max: 100 },
  { key: 'symmetry_index',   label: 'Simetria',     unit: '/100', color: C.purple,   max: 100 },
  { key: 'rest_hours',       label: 'Repòs',        unit: 'h',    color: C.success,  max: 12  },
  { key: 'avg_temp',         label: 'Temperatura',  unit: '°C',   color: C.warning,  max: 40  },
]

// Mini sparkline SVG-like amb View (sense llibreria externa)
function Sparkline({ data, color, max, height = 60 }: {
  data: number[]; color: string; max: number; height?: number
}) {
  if (!data.length) return null
  const w = W - 32
  const step = w / Math.max(data.length - 1, 1)
  const valid = data.map(v => (v ?? 0))
  const minV = Math.min(...valid)
  const maxV = Math.max(max, ...valid)
  const range = maxV - minV || 1

  const points = valid.map((v, i) => ({
    x: i * step,
    y: height - ((v - minV) / range) * (height - 8) - 4,
  }))

  // Rendera barres verticals com aproximació (sense canvas/svg natiu)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 2, paddingTop: 4 }}>
      {valid.map((v, i) => {
        const ratio = (v - minV) / range
        const barH = Math.max(4, ratio * (height - 4))
        return (
          <View key={i} style={{ flex: 1, height: barH, backgroundColor: color, borderRadius: 2, opacity: 0.7 }} />
        )
      })}
    </View>
  )
}

// Targeta de mètrica amb gràfic
function MetricDetailCard({ metricKey, label, unit, color, max, data }: {
  metricKey: string; label: string; unit: string
  color: string; max: number; data: any[]
}) {
  const values = data.map(d => d[metricKey]).filter(v => v != null)
  const last    = values.at(-1)
  const prev    = values.at(-2)
  const avg     = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  const trend   = last != null && prev != null ? last - prev : null

  return (
    <View style={[card.wrap, { borderLeftColor: color }]}>
      <View style={card.header}>
        <Text style={card.label}>{label}</Text>
        <Text style={[card.value, { color }]}>
          {last != null ? last.toFixed(1) : '—'}
          <Text style={card.unit}> {unit}</Text>
        </Text>
      </View>

      {trend != null && (
        <Text style={[card.trend, { color: trend > 0 ? C.success : trend < 0 ? C.warning : C.sub }]}>
          {trend > 0 ? '▲' : trend < 0 ? '▼' : '—'} {Math.abs(trend).toFixed(1)} {unit} vs ahir
        </Text>
      )}
      {avg != null && (
        <Text style={card.avg}>Mitjana 30d: {avg.toFixed(1)} {unit}</Text>
      )}

      {values.length > 1 && (
        <View style={{ marginTop: 12 }}>
          <Sparkline data={values} color={color} max={max} />
          <View style={card.xLabels}>
            <Text style={card.xLbl}>{data[0]?.date?.slice(5) ?? ''}</Text>
            <Text style={card.xLbl}>{data[Math.floor(data.length / 2)]?.date?.slice(5) ?? ''}</Text>
            <Text style={card.xLbl}>{data[data.length - 1]?.date?.slice(5) ?? ''}</Text>
          </View>
        </View>
      )}
    </View>
  )
}

const card = StyleSheet.create({
  wrap:    { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  header:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label:   { fontSize: 12, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.4 },
  value:   { fontSize: 28, fontWeight: '800', color: C.text },
  unit:    { fontSize: 13, fontWeight: '400', color: C.sub },
  trend:   { fontSize: 12, fontWeight: '600', marginTop: 4 },
  avg:     { fontSize: 11, color: C.sub, marginTop: 2 },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  xLbl:    { fontSize: 10, color: C.sub },
})

// Selector de rang de dies
function RangeSelector({ days, setDays }: { days: number; setDays: (d: number) => void }) {
  const OPTIONS = [7, 14, 30]
  return (
    <View style={range.wrap}>
      {OPTIONS.map(d => (
        <TouchableOpacity key={d} style={[range.btn, days === d && range.active]}
          onPress={() => setDays(d)}>
          <Text style={[range.txt, days === d && range.activeTxt]}>{d}d</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}
const range = StyleSheet.create({
  wrap:      { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginVertical: 12 },
  btn:       { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  active:    { backgroundColor: C.primary, borderColor: C.primary },
  txt:       { fontSize: 13, color: C.text },
  activeTxt: { color: '#fff', fontWeight: '700' },
})

export default function MetricsScreen() {
  const { selectedDog } = useAppStore()
  const [data, setData]         = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [days, setDays]         = useState(30)

  const load = useCallback(async () => {
    if (!selectedDog) return
    try {
      const raw = await fetchDailyMetrics(selectedDog.id, days)
      setData(raw)
    } catch (e) {
      console.error('Metrics load error', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedDog, days])

  useEffect(() => { setLoading(true); load() }, [days, selectedDog?.id])

  const onRefresh = () => { setRefreshing(true); load() }

  if (!selectedDog) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTxt}>Selecciona un gos a la pantalla principal</Text>
      </View>
    )
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
  }

  return (
    <ScrollView style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

      <View style={styles.header}>
        <Text style={styles.title}>{selectedDog.name}</Text>
        <Text style={styles.sub}>Historial de mètriques</Text>
      </View>

      <RangeSelector days={days} setDays={setDays} />

      {data.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTxt}>
            Sense dades per als últims {days} dies.{'\n'}Connecta l'arnès per recollir mesures.
          </Text>
        </View>
      ) : (
        <View style={{ paddingHorizontal: 16, paddingBottom: 32 }}>
          {METRICS.map(m => (
            <MetricDetailCard
              key={m.key}
              metricKey={m.key}
              label={m.label}
              unit={m.unit}
              color={m.color}
              max={m.max}
              data={data}
            />
          ))}

          {/* Resum anomalies */}
          {data.some(d => d.anomaly_score > 0.7) && (
            <View style={styles.anomalyCard}>
              <Text style={styles.anomalyTitle}>⚠ Dies amb anomalia detectada</Text>
              {data.filter(d => d.anomaly_score > 0.7).map(d => (
                <View key={d.date} style={styles.anomalyRow}>
                  <Text style={styles.anomalyDate}>{d.date}</Text>
                  <Text style={styles.anomalyScore}>Score: {d.anomaly_score?.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  header:       { padding: 16, paddingBottom: 0 },
  title:        { fontSize: 22, fontWeight: '800', color: C.text },
  sub:          { fontSize: 13, color: C.sub, marginTop: 2 },
  emptyCard:    { margin: 16, backgroundColor: C.card, borderRadius: 14, padding: 32, alignItems: 'center' },
  emptyTxt:     { color: C.sub, textAlign: 'center', lineHeight: 22 },
  anomalyCard:  { backgroundColor: '#FFF3E0', borderRadius: 14, padding: 16, borderLeftWidth: 4, borderLeftColor: C.warning },
  anomalyTitle: { fontWeight: '700', color: C.warning, marginBottom: 8 },
  anomalyRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  anomalyDate:  { color: C.text, fontSize: 13 },
  anomalyScore: { color: C.urgent, fontWeight: '700', fontSize: 13 },
})
