// ============================================================
// EnergyScreen.tsx — Pantalla d'energia i fatiga
// Ernest · Massiu Soft SL · 2026
//
// Mostra per a la sortida més recent:
//   - Gauge circular d'energia actual
//   - Corba d'evolució d'energia
//   - Senyals de fatiga detectats
//   - Temps restant estimat
//   - Comparativa amb sortides anteriors
// ============================================================

import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native'
import Svg, { Circle, Path, Line, Text as SvgText } from 'react-native-svg'
import { fetchEnergySnapshots } from '../services/api'
import { useAppStore } from '../store'
import type { EnergySnapshot } from '../services/api'

const { width: SCREEN_W } = Dimensions.get('window')

// ── Paleta ────────────────────────────────────────────────────
const C = {
  bg:       '#F0F4F8',
  card:     '#FFFFFF',
  primary:  '#1565C0',
  success:  '#22c55e',
  warning:  '#f59e0b',
  urgent:   '#ef4444',
  text:     '#1A1A2E',
  sub:      '#607D8B',
  border:   '#E0E7EF',
}

// ── Helpers ───────────────────────────────────────────────────

function energyColor(pct: number): string {
  if (pct > 60) return C.success
  if (pct > 35) return C.warning
  return C.urgent
}

function energyLabel(pct: number): string {
  if (pct > 70) return 'Excel·lent'
  if (pct > 50) return 'Bona'
  if (pct > 35) return 'Moderada'
  if (pct > 15) return 'Baixa ⚠'
  return 'Crítica 🚨'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ca-ES', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(startIso: string, endIso: string): string {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}min`
}

const SIGNAL_LABELS: Record<string, string> = {
  pauses_increasing:  '⏸ Aturades freqüents',
  symmetry_declining: '↔ Simetria baixant',
  temp_elevated:      '🌡 Temperatura alta',
  pace_slowing:       '🐢 Ritme lent',
  sudden_drop:        '⚡ Caiguda sobtada',
}

// ── Gauge circular ────────────────────────────────────────────

function EnergyGauge({ pct, size = 180 }: { pct: number; size?: number }) {
  const color  = energyColor(pct)
  const cx = size / 2
  const cy = size / 2
  const r  = size * 0.38
  const circumference = 2 * Math.PI * r
  const strokeDash = (pct / 100) * circumference
  const fontSize = size * 0.22

  return (
    <Svg width={size} height={size}>
      {/* Track */}
      <Circle cx={cx} cy={cy} r={r} stroke="#E0E7EF" strokeWidth={size * 0.07} fill="none" />
      {/* Progress — rotated -90deg */}
      <Circle
        cx={cx} cy={cy} r={r}
        stroke={color}
        strokeWidth={size * 0.07}
        fill="none"
        strokeDasharray={`${strokeDash} ${circumference}`}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
        rotation="-90"
        origin={`${cx},${cy}`}
      />
      {/* Label central */}
      <SvgText
        x={cx} y={cy - fontSize * 0.1}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="800"
        fill={color}
      >
        {Math.round(pct)}%
      </SvgText>
      <SvgText
        x={cx} y={cy + fontSize * 0.7}
        textAnchor="middle"
        fontSize={fontSize * 0.32}
        fill={C.sub}
      >
        {energyLabel(pct)}
      </SvgText>
    </Svg>
  )
}

// ── Gràfic d'evolució d'energia (sparkline manual) ────────────

function EnergyChart({ snapshots }: { snapshots: EnergySnapshot[] }) {
  if (snapshots.length < 2) return null

  const W = SCREEN_W - 64
  const H = 100
  const PAD = 8
  const minVal = 0
  const maxVal = 100

  const toX = (i: number) => PAD + (i / (snapshots.length - 1)) * (W - PAD * 2)
  const toY = (v: number) => H - PAD - ((v - minVal) / (maxVal - minVal)) * (H - PAD * 2)

  // Línia principal
  const points = snapshots.map((s, i) => `${toX(i)},${toY(s.energy_pct)}`).join(' ')
  const pathD  = `M ${points.replace(/ /g, ' L ')}`

  // Àrea sota la línia
  const areaD = `M ${toX(0)},${H - PAD} L ${points.replace(/ /g, ' L ')} L ${toX(snapshots.length - 1)},${H - PAD} Z`

  // Línies de referència
  const y35 = toY(35)
  const y15 = toY(15)

  // Punt de fatiga (primer snapshot amb alert != ok)
  const fatigueIdx = snapshots.findIndex(s => s.alert_level !== 'ok')
  const fatigueX   = fatigueIdx >= 0 ? toX(fatigueIdx) : null

  return (
    <View style={styles.chartContainer}>
      <Svg width={W} height={H}>
        {/* Àrea */}
        <Path d={areaD} fill={C.success} fillOpacity={0.08} />
        {/* Línia warning 35% */}
        <Line x1={PAD} y1={y35} x2={W - PAD} y2={y35}
          stroke={C.warning} strokeWidth={1} strokeDasharray="4,3" />
        <SvgText x={W - PAD + 2} y={y35 + 4} fontSize={8} fill={C.warning}>35%</SvgText>
        {/* Línia urgent 15% */}
        <Line x1={PAD} y1={y15} x2={W - PAD} y2={y15}
          stroke={C.urgent} strokeWidth={1} strokeDasharray="4,3" />
        <SvgText x={W - PAD + 2} y={y15 + 4} fontSize={8} fill={C.urgent}>15%</SvgText>
        {/* Marca de fatiga */}
        {fatigueX !== null && (
          <Line x1={fatigueX} y1={PAD} x2={fatigueX} y2={H - PAD}
            stroke={C.warning} strokeWidth={1.5} strokeDasharray="3,3" />
        )}
        {/* Corba principal */}
        <Path d={pathD} stroke={C.success} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      {/* Etiquetes horari */}
      <View style={styles.chartLabels}>
        <Text style={styles.chartLbl}>{formatTime(snapshots[0].ts)}</Text>
        {fatigueIdx > 0 && (
          <Text style={[styles.chartLbl, { color: C.warning }]}>
            ⚠ {formatTime(snapshots[fatigueIdx].ts)}
          </Text>
        )}
        <Text style={styles.chartLbl}>{formatTime(snapshots.at(-1)!.ts)}</Text>
      </View>
    </View>
  )
}

// ── PANTALLA PRINCIPAL ────────────────────────────────────────

export default function EnergyScreen() {
  const { selectedDog, energySnapshots, setEnergySnapshots } = useAppStore()
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!selectedDog) { setLoading(false); return }
    try {
      const snaps = await fetchEnergySnapshots(selectedDog.id, 24)
      setEnergySnapshots(snaps)
    } catch (e) {
      console.error('[EnergyScreen] Error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedDog])

  useEffect(() => { load() }, [selectedDog])

  const onRefresh = () => { setRefreshing(true); load() }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
  }

  if (!selectedDog) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyIcon}>🐕</Text>
        <Text style={styles.emptyTxt}>Selecciona un gos a la pantalla d'inici</Text>
      </View>
    )
  }

  const snaps = energySnapshots
  const last  = snaps.at(-1)
  const first = snaps.at(0)

  const minEnergy   = snaps.length ? Math.min(...snaps.map(s => s.energy_pct)) : null
  const fatigueIdx  = snaps.findIndex(s => s.alert_level !== 'ok')
  const fatigueOnset = fatigueIdx >= 0 ? snaps[fatigueIdx] : null

  const allSignals = [...new Set(snaps.flatMap(s => s.fatigue_signals))]

  if (!last || snaps.length === 0) {
    return (
      <ScrollView style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>⚡</Text>
          <Text style={styles.emptyTitle}>Sense dades d'energia</Text>
          <Text style={styles.emptyTxt}>
            Quan el teu gos surti a passejar amb l'arnès posat,{'\n'}
            aquí veuràs com evoluciona la seva energia en temps real.
          </Text>
        </View>
      </ScrollView>
    )
  }

  return (
    <ScrollView style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

      {/* Capçalera */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Energia de {selectedDog.name}</Text>
        {first && last && (
          <Text style={styles.headerSub}>
            Sortida de {formatDuration(first.ts, last.ts)} · {new Date(first.ts).toLocaleDateString('ca-ES')}
          </Text>
        )}
      </View>

      {/* Gauge principal */}
      <View style={styles.gaugeCard}>
        <EnergyGauge pct={last.energy_pct} size={180} />

        {/* Estat */}
        <View style={[styles.alertBadge,
          last.alert_level === 'urgent'  ? styles.badgeUrgent  :
          last.alert_level === 'warning' ? styles.badgeWarning : styles.badgeOk
        ]}>
          <Text style={styles.alertBadgeTxt}>
            {last.alert_level === 'urgent'  ? '🚨 Energia crítica' :
             last.alert_level === 'warning' ? '⚠️ Energia baixa'  : '✅ Energia adequada'}
          </Text>
        </View>

        {/* Temps restant */}
        {last.drain_rate > 0 && last.estimated_remaining_min !== null && (
          <View style={styles.remainingRow}>
            <Text style={styles.remainingTxt}>
              ⏱ ~{Math.round(last.estimated_remaining_min)} min restants al ritme actual
            </Text>
          </View>
        )}
      </View>

      {/* Resum inici / mínim / final */}
      <View style={styles.summaryRow}>
        {[
          { label: 'Inici',  value: '100%',                                  sub: first ? formatTime(first.ts) : '' },
          { label: 'Mínim',  value: `${Math.round(minEnergy ?? 0)}%`,         sub: 'punt més baix', color: energyColor(minEnergy ?? 0) },
          { label: 'Final',  value: `${Math.round(last.energy_pct)}%`,        sub: formatTime(last.ts), color: energyColor(last.energy_pct) },
        ].map(item => (
          <View key={item.label} style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{item.label}</Text>
            <Text style={[styles.summaryValue, item.color ? { color: item.color } : {}]}>{item.value}</Text>
            <Text style={styles.summarySub}>{item.sub}</Text>
          </View>
        ))}
      </View>

      {/* Gràfic evolució */}
      {snaps.length >= 3 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Evolució durant la sortida</Text>
          <EnergyChart snapshots={snaps} />
        </View>
      )}

      {/* Primer senyal de fatiga */}
      {fatigueOnset && (
        <View style={[styles.card, styles.fatigueCard]}>
          <Text style={styles.fatigueTitle}>⚠ Primers senyals de fatiga</Text>
          {first && (
            <Text style={styles.fatigueSub}>
              Als {Math.round((new Date(fatigueOnset.ts).getTime() - new Date(first.ts).getTime()) / 60000)} min de la sortida
              ({formatTime(fatigueOnset.ts)})
            </Text>
          )}
          <Text style={styles.fatigueTip}>
            💡 La propera vegada, considera girar als {
              Math.max(5, Math.round((new Date(fatigueOnset.ts).getTime() - new Date(first.ts).getTime()) / 60000) - 5)
            } min per evitar l'esgotament.
          </Text>
        </View>
      )}

      {/* Senyals de fatiga */}
      {allSignals.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Senyals detectats</Text>
          {allSignals.map(sig => (
            <View key={sig} style={styles.signalRow}>
              <Text style={styles.signalTxt}>{SIGNAL_LABELS[sig] ?? sig}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Com llegir-ho */}
      <View style={[styles.card, styles.infoCard]}>
        <Text style={styles.infoTitle}>ℹ️ Com s'estima l'energia</Text>
        <Text style={styles.infoTxt}>
          L'Ernest analitza la intensitat del moviment, la simetria de la marxa i la temperatura corporal cada 30 segons.
          El model té en compte la raça ({selectedDog.breed ?? 'desconeguda'}), l'edat i el pes del teu gos.{'\n\n'}
          • Verd {'>'} 60%: el gos pot continuar còmodament{'\n'}
          • Ambre 35-60%: considera reduir el ritme{'\n'}
          • Vermell {'<'} 35%: el gos necessita parar i descansar
        </Text>
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

// ── Estils ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: C.bg },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

  header:         { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  headerTitle:    { fontSize: 22, fontWeight: '800', color: C.text },
  headerSub:      { fontSize: 13, color: C.sub, marginTop: 2 },

  gaugeCard:      { backgroundColor: C.card, margin: 16, marginTop: 8, borderRadius: 20, padding: 20, alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },

  alertBadge:     { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  badgeOk:        { backgroundColor: '#dcfce7' },
  badgeWarning:   { backgroundColor: '#fef3c7' },
  badgeUrgent:    { backgroundColor: '#fee2e2' },
  alertBadgeTxt:  { fontWeight: '700', fontSize: 14 },

  remainingRow:   { backgroundColor: '#f1f5f9', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
  remainingTxt:   { fontSize: 13, color: C.sub, fontWeight: '600' },

  summaryRow:     { flexDirection: 'row', marginHorizontal: 16, gap: 8, marginBottom: 8 },
  summaryCard:    { flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 12, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  summaryLabel:   { fontSize: 11, color: C.sub, fontWeight: '600', marginBottom: 4 },
  summaryValue:   { fontSize: 22, fontWeight: '800', color: C.text },
  summarySub:     { fontSize: 10, color: C.sub, marginTop: 2, textAlign: 'center' },

  card:           { backgroundColor: C.card, margin: 16, marginTop: 0, borderRadius: 16, padding: 16, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  sectionTitle:   { fontSize: 13, fontWeight: '700', color: C.sub, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },

  chartContainer: { alignItems: 'center' },
  chartLabels:    { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 4 },
  chartLbl:       { fontSize: 10, color: C.sub },

  fatigueCard:    { borderLeftWidth: 4, borderLeftColor: C.warning },
  fatigueTitle:   { fontSize: 15, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  fatigueSub:     { fontSize: 13, color: C.sub, marginBottom: 8 },
  fatigueTip:     { fontSize: 13, color: '#78350f', lineHeight: 20, backgroundColor: '#fef3c7', padding: 10, borderRadius: 10 },

  signalRow:      { backgroundColor: '#fef9c3', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  signalTxt:      { fontSize: 13, color: '#713f12', fontWeight: '600' },

  infoCard:       { backgroundColor: '#f0f9ff', borderLeftWidth: 4, borderLeftColor: C.primary },
  infoTitle:      { fontSize: 14, fontWeight: '700', color: C.primary, marginBottom: 8 },
  infoTxt:        { fontSize: 13, color: '#0c4a6e', lineHeight: 22 },

  emptyCard:      { margin: 32, backgroundColor: C.card, borderRadius: 20, padding: 32, alignItems: 'center' },
  emptyIcon:      { fontSize: 48, marginBottom: 12 },
  emptyTitle:     { fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 8 },
  emptyTxt:       { color: C.sub, textAlign: 'center', lineHeight: 22, fontSize: 14 },
})
