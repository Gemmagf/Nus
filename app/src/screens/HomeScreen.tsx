// ============================================================
// HomeScreen.tsx — Pantalla principal Ernest
// Mostra: benestar del dia, BLE status, alertes, mètriques clau
// Massiu Soft SL
// ============================================================
import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  StyleSheet, ActivityIndicator, Platform
} from 'react-native'
import { fetchDogs, fetchDailyMetrics, fetchAlerts, markAlertRead, fetchEnergySnapshots } from '../services/api'
import { useAppStore } from '../store'
import { useBleSync } from '../hooks/useBleSync'

// ── Paleta Ernest ─────────────────────────────────────────────
const C = {
  bg:       '#F0F4F8',
  card:     '#FFFFFF',
  primary:  '#1565C0',
  success:  '#2E7D32',
  warning:  '#E65100',
  urgent:   '#B71C1C',
  text:     '#1A1A2E',
  sub:      '#607D8B',
  border:   '#E0E7EF',
}

// ── Índex de Benestar (0-100) → color + etiqueta ──────────────
function wellnessColor(score: number): string {
  if (score >= 80) return C.success
  if (score >= 50) return C.warning
  return C.urgent
}
function wellnessLabel(score: number): string {
  if (score >= 80) return 'Excel·lent'
  if (score >= 60) return 'Bé'
  if (score >= 40) return 'Atenció'
  return 'Alerta'
}
function wellnessScore(m: any): number {
  if (!m) return 0
  // Fórmula v1.0: mitja ponderada de les mètriques normalitzades
  const act  = Math.min((m.activity_index ?? 50) / 100, 1) * 35
  const sym  = ((m.symmetry_index ?? 100) / 100) * 30
  const rest = Math.min((m.rest_hours ?? 8) / 12, 1) * 20
  const temp = m.avg_temp ? Math.max(0, 1 - Math.abs(m.avg_temp - 38.5) / 1.5) * 15 : 10
  return Math.round(act + sym + rest + temp)
}

// ── Mètrica Card ─────────────────────────────────────────────
function MetricCard({ label, value, unit, color }: any) {
  return (
    <View style={[styles.metricCard, { borderLeftColor: color }]}>
      <Text style={styles.metricValue}>{value}<Text style={styles.metricUnit}> {unit}</Text></Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

// ── Alert Row ─────────────────────────────────────────────────
function AlertRow({ alert, onRead }: any) {
  const color = alert.severity === 'urgent' ? C.urgent : C.warning
  return (
    <TouchableOpacity style={[styles.alertRow, { borderLeftColor: color }]}
                      onPress={() => onRead(alert.id)}>
      <Text style={[styles.alertSev, { color }]}>
        {alert.severity === 'urgent' ? '🔴 URGENT' : '🟠 AVÍS'}
      </Text>
      <Text style={styles.alertMsg}>{alert.message}</Text>
      <Text style={styles.alertMeta}>{alert.metric} · Toca per marcar com a llegit</Text>
    </TouchableOpacity>
  )
}

// ── BLE Status Bar ────────────────────────────────────────────
function BleBar({ status, message, onConnect, onDisconnect, pending, lastSync }: any) {
  const color = status === 'connected' ? C.success : status === 'error' ? C.urgent : C.primary
  return (
    <View style={[styles.bleBar, { backgroundColor: color }]}>
      <View>
        <Text style={styles.bleTitle}>
          {status === 'connected' ? '● Connectat' :
           status === 'scanning'  ? '⟳ Buscant...' :
           status === 'connecting'? '⟳ Connectant...' :
           status === 'error'     ? '✕ Error' : '○ Desconnectat'}
        </Text>
        {message ? <Text style={styles.bleMsg}>{message}</Text> : null}
        {lastSync  ? <Text style={styles.bleMsg}>Última sync: {lastSync.toLocaleTimeString()}</Text> : null}
        {pending > 0 ? <Text style={styles.bleMsg}>{pending} paquets pendents</Text> : null}
      </View>
      <TouchableOpacity style={styles.bleBtn}
        onPress={status === 'connected' ? onDisconnect : onConnect}>
        <Text style={styles.bleBtnTxt}>
          {status === 'connected' ? 'Desconnectar' : 'Connectar'}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

// ── MAIN SCREEN ───────────────────────────────────────────────
export default function HomeScreen() {
  const { dogs, selectedDog, setDogs, selectDog,
          bleStatus, bleMessage, alerts, setAlerts, markRead,
          lastSync, pendingPkts, setBle,
          currentEnergy, energyAlertLevel, setEnergySnapshots } = useAppStore()

  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const { connect, disconnect } = useBleSync(
    selectedDog?.id,
    selectedDog?.device_health ? 'device_id_from_dog' : undefined
  )

  const load = useCallback(async () => {
    try {
      const dogsData = await fetchDogs()
      setDogs(dogsData)
      const dog = selectedDog ?? dogsData[0]
      if (dog) {
        if (!selectedDog) selectDog(dog)
        const [metricsData, alertsData, energyData] = await Promise.all([
          fetchDailyMetrics(dog.id, 1),
          fetchAlerts(dog.id),
          fetchEnergySnapshots(dog.id, 24),
        ])
        setMetrics(metricsData[metricsData.length - 1] ?? null)
        setAlerts(alertsData)
        setEnergySnapshots(energyData)
      }
    } catch (e) {
      console.error('Load error', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedDog])

  useEffect(() => { load() }, [])
  const onRefresh = () => { setRefreshing(true); load() }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
  }

  const wellness = wellnessScore(metrics)
  const unread = alerts.filter(a => !a.is_read)

  return (
    <ScrollView style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

      {/* BLE status */}
      <BleBar status={bleStatus} message={bleMessage}
              onConnect={connect} onDisconnect={disconnect}
              pending={pendingPkts} lastSync={lastSync} />

      {/* Dog selector */}
      {dogs.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dogScroll}>
          {dogs.map(d => (
            <TouchableOpacity key={d.id} onPress={() => { selectDog(d); load() }}
              style={[styles.dogChip, selectedDog?.id === d.id && styles.dogChipActive]}>
              <Text style={[styles.dogChipTxt, selectedDog?.id === d.id && styles.dogChipTxtActive]}>
                🐕 {d.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {selectedDog && (
        <>
          {/* Wellness score */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Índex de Benestar · Avui</Text>
            <View style={[styles.wellnessCard, { borderColor: wellnessColor(wellness) }]}>
              <Text style={[styles.wellnessNum, { color: wellnessColor(wellness) }]}>{wellness}</Text>
              <Text style={[styles.wellnessLbl, { color: wellnessColor(wellness) }]}>
                {wellnessLabel(wellness)}
              </Text>
              <Text style={styles.wellnessDog}>{selectedDog.name}</Text>
            </View>
          </View>

          {/* Energia última sortida */}
          {currentEnergy !== null && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>⚡ Energia · Última sortida</Text>
              <View style={[styles.energyCard, {
                borderColor: energyAlertLevel === 'urgent'  ? C.urgent  :
                             energyAlertLevel === 'warning' ? C.warning : C.success
              }]}>
                <View style={styles.energyLeft}>
                  <Text style={[styles.energyPct, { color:
                    energyAlertLevel === 'urgent'  ? C.urgent  :
                    energyAlertLevel === 'warning' ? C.warning : C.success
                  }]}>{Math.round(currentEnergy)}%</Text>
                  <Text style={styles.energySub}>
                    {currentEnergy > 60 ? 'Excel·lent' :
                     currentEnergy > 35 ? 'Moderada'   :
                     currentEnergy > 15 ? 'Baixa ⚠'   : 'Crítica 🚨'}
                  </Text>
                </View>
                {/* Barra visual */}
                <View style={styles.energyBarBg}>
                  <View style={[styles.energyBarFill, {
                    width: `${currentEnergy}%` as any,
                    backgroundColor:
                      energyAlertLevel === 'urgent'  ? C.urgent  :
                      energyAlertLevel === 'warning' ? C.warning : C.success,
                  }]} />
                </View>
              </View>
            </View>
          )}

          {/* Alertes */}
          {unread.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>⚠ Alertes actives ({unread.length})</Text>
              {unread.map(a => (
                <AlertRow key={a.id} alert={a} onRead={(id: number) => {
                  markAlertRead(id); markRead(id)
                }} />
              ))}
            </View>
          )}

          {/* Mètriques del dia */}
          {metrics && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mètriques d'avui</Text>
              <View style={styles.metricsGrid}>
                <MetricCard label="Activitat"  value={metrics.activity_index?.toFixed(0) ?? '—'} unit="/100" color={C.primary} />
                <MetricCard label="Repòs"      value={metrics.rest_hours?.toFixed(1) ?? '—'}      unit="h"    color={C.success} />
                <MetricCard label="Simetria"   value={metrics.symmetry_index?.toFixed(0) ?? '—'}  unit="/100" color="#7B1FA2" />
                <MetricCard label="Temperatura" value={metrics.avg_temp?.toFixed(1) ?? '—'}       unit="°C"   color={C.warning} />
              </View>
            </View>
          )}

          {!metrics && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTxt}>Sense dades per avui.{'\n'}Connecta l'arnès per començar.</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: C.bg },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  section:        { margin: 16, marginBottom: 0 },
  sectionTitle:   { fontSize: 13, fontWeight: '700', color: C.sub, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  bleBar:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, paddingTop: Platform.OS === 'ios' ? 52 : 14 },
  bleTitle:       { color: '#fff', fontWeight: '700', fontSize: 14 },
  bleMsg:         { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },
  bleBtn:         { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  bleBtnTxt:      { color: '#fff', fontWeight: '600', fontSize: 13 },
  dogScroll:      { paddingHorizontal: 16, paddingVertical: 10 },
  dogChip:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, marginRight: 8, borderWidth: 1, borderColor: C.border },
  dogChipActive:  { backgroundColor: C.primary, borderColor: C.primary },
  dogChipTxt:     { color: C.text, fontSize: 13 },
  dogChipTxtActive:{ color: '#fff', fontWeight: '600' },
  wellnessCard:   { backgroundColor: C.card, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  wellnessNum:    { fontSize: 72, fontWeight: '800', lineHeight: 80 },
  wellnessLbl:    { fontSize: 20, fontWeight: '700', marginTop: 4 },
  wellnessDog:    { color: C.sub, fontSize: 14, marginTop: 6 },
  metricsGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard:     { flex: 1, minWidth: '45%', backgroundColor: C.card, borderRadius: 14, padding: 16, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  metricValue:    { fontSize: 26, fontWeight: '800', color: C.text },
  metricUnit:     { fontSize: 13, fontWeight: '400', color: C.sub },
  metricLabel:    { fontSize: 11, color: C.sub, marginTop: 4, fontWeight: '500' },
  alertRow:       { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 4 },
  alertSev:       { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  alertMsg:       { fontSize: 14, color: C.text, lineHeight: 20 },
  alertMeta:      { fontSize: 11, color: C.sub, marginTop: 6 },
  emptyCard:      { margin: 16, backgroundColor: C.card, borderRadius: 14, padding: 32, alignItems: 'center' },
  emptyTxt:       { color: C.sub, textAlign: 'center', lineHeight: 22 },

  energyCard:     { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  energyLeft:     { minWidth: 72, alignItems: 'center' },
  energyPct:      { fontSize: 32, fontWeight: '800' },
  energySub:      { fontSize: 11, color: C.sub, fontWeight: '600', marginTop: 2 },
  energyBarBg:    { flex: 1, height: 10, backgroundColor: '#E0E7EF', borderRadius: 5, overflow: 'hidden' },
  energyBarFill:  { height: '100%', borderRadius: 5 },
})
