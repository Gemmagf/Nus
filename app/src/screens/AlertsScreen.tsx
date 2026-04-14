// ============================================================
// AlertsScreen.tsx — Historial d'alertes i notificacions
// Massiu Soft SL
// ============================================================
import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, SectionList
} from 'react-native'
import { fetchAlerts, markAlertRead } from '../services/api'
import { useAppStore } from '../store'
import { supabase } from '../services/api'

const C = {
  bg:      '#F0F4F8',
  card:    '#FFFFFF',
  primary: '#1565C0',
  success: '#2E7D32',
  warning: '#E65100',
  urgent:  '#B71C1C',
  text:    '#1A1A2E',
  sub:     '#607D8B',
  border:  '#E0E7EF',
}

interface AlertItem {
  id: number
  severity: 'info' | 'warning' | 'urgent'
  metric: string
  message: string
  created_at: string
  is_read: boolean
}

function severityColor(s: string) {
  return s === 'urgent' ? C.urgent : s === 'warning' ? C.warning : C.primary
}

function severityIcon(s: string) {
  return s === 'urgent' ? '🔴' : s === 'warning' ? '🟠' : 'ℹ️'
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (days > 0)  return `fa ${days}d`
  if (hours > 0) return `fa ${hours}h`
  if (mins > 0)  return `fa ${mins}min`
  return 'ara mateix'
}

function AlertCard({ alert, onMarkRead }: { alert: AlertItem; onMarkRead: (id: number) => void }) {
  const color = severityColor(alert.severity)
  return (
    <TouchableOpacity
      style={[styles.alertCard, { borderLeftColor: color, opacity: alert.is_read ? 0.55 : 1 }]}
      onPress={() => !alert.is_read && onMarkRead(alert.id)}
    >
      <View style={styles.alertHeader}>
        <Text style={[styles.alertSev, { color }]}>
          {severityIcon(alert.severity)} {alert.severity.toUpperCase()}
        </Text>
        <Text style={styles.alertTime}>{timeAgo(alert.created_at)}</Text>
      </View>
      <Text style={styles.alertMsg}>{alert.message}</Text>
      <View style={styles.alertFooter}>
        <Text style={styles.alertMetric}>{alert.metric}</Text>
        {!alert.is_read && (
          <Text style={[styles.alertAction, { color: C.primary }]}>Marcar com a llegit →</Text>
        )}
        {alert.is_read && <Text style={[styles.alertAction, { color: C.success }]}>✓ Llegit</Text>}
      </View>
    </TouchableOpacity>
  )
}

// Filtre de severitat
function FilterBar({ filter, setFilter }: { filter: string; setFilter: (f: string) => void }) {
  const OPTS = [
    { key: 'all',     label: 'Totes' },
    { key: 'urgent',  label: '🔴 Urgents' },
    { key: 'warning', label: '🟠 Avisos' },
    { key: 'info',    label: 'ℹ️ Info' },
  ]
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={filt.scroll}>
      {OPTS.map(o => (
        <TouchableOpacity key={o.key} style={[filt.btn, filter === o.key && filt.active]}
          onPress={() => setFilter(o.key)}>
          <Text style={[filt.txt, filter === o.key && filt.activeTxt]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}
const filt = StyleSheet.create({
  scroll:    { paddingHorizontal: 16, paddingVertical: 10 },
  btn:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.card, marginRight: 8, borderWidth: 1, borderColor: C.border },
  active:    { backgroundColor: C.primary, borderColor: C.primary },
  txt:       { fontSize: 13, color: C.text },
  activeTxt: { color: '#fff', fontWeight: '600' },
})

export default function AlertsScreen() {
  const { selectedDog, alerts: storeAlerts, setAlerts, markRead } = useAppStore()
  const [allAlerts, setAllAlerts]     = useState<AlertItem[]>([])
  const [loading, setLoading]         = useState(true)
  const [refreshing, setRefreshing]   = useState(false)
  const [filter, setFilter]           = useState('all')

  const load = useCallback(async () => {
    if (!selectedDog) return
    try {
      // Carrega totes les alertes (incloses les llegides)
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('dog_id', selectedDog.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      setAllAlerts(data ?? [])
      // Actualitza store amb no llegides
      const unread = (data ?? []).filter((a: AlertItem) => !a.is_read)
      setAlerts(unread)
    } catch (e) {
      console.error('Alerts load error', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedDog])

  useEffect(() => { load() }, [selectedDog?.id])

  const onRefresh = () => { setRefreshing(true); load() }

  const handleMarkRead = async (id: number) => {
    await markAlertRead(id)
    markRead(id)
    setAllAlerts(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a))
  }

  const handleMarkAllRead = async () => {
    const unread = allAlerts.filter(a => !a.is_read)
    await Promise.all(unread.map(a => markAlertRead(a.id)))
    unread.forEach(a => markRead(a.id))
    setAllAlerts(prev => prev.map(a => ({ ...a, is_read: true })))
  }

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

  const filtered = filter === 'all' ? allAlerts : allAlerts.filter(a => a.severity === filter)
  const unreadCount = allAlerts.filter(a => !a.is_read).length

  // Agrupar per dia
  const grouped: { [date: string]: AlertItem[] } = {}
  filtered.forEach(a => {
    const day = a.created_at.split('T')[0]
    if (!grouped[day]) grouped[day] = []
    grouped[day].push(a)
  })
  const sections = Object.entries(grouped)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, data]) => ({ title: date, data }))

  return (
    <View style={styles.container}>
      {/* Capçalera */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerTitle}>Alertes · {selectedDog.name}</Text>
          {unreadCount > 0
            ? <Text style={styles.headerSub}>{unreadCount} sense llegir</Text>
            : <Text style={[styles.headerSub, { color: C.success }]}>Tot al dia ✓</Text>
          }
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.readAllBtn} onPress={handleMarkAllRead}>
            <Text style={styles.readAllTxt}>Marcar-ho tot</Text>
          </TouchableOpacity>
        )}
      </View>

      <FilterBar filter={filter} setFilter={setFilter} />

      {filtered.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🎉</Text>
          <Text style={styles.emptyTitle}>Tot bé!</Text>
          <Text style={styles.emptyTxt}>No hi ha alertes per a aquest filtre.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionDate}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <AlertCard alert={item} onMarkRead={handleMarkRead} />
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  headerRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  headerTitle:  { fontSize: 18, fontWeight: '800', color: C.text },
  headerSub:    { fontSize: 12, color: C.sub, marginTop: 2 },
  readAllBtn:   { backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  readAllTxt:   { color: '#fff', fontWeight: '600', fontSize: 12 },
  sectionDate:  { fontSize: 11, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 16, marginBottom: 6 },
  alertCard:    { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 8, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  alertHeader:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  alertSev:     { fontSize: 11, fontWeight: '700' },
  alertTime:    { fontSize: 11, color: C.sub },
  alertMsg:     { fontSize: 14, color: C.text, lineHeight: 20 },
  alertFooter:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  alertMetric:  { fontSize: 11, color: C.sub, fontWeight: '600' },
  alertAction:  { fontSize: 11, fontWeight: '700' },
  emptyCard:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyIcon:    { fontSize: 48, marginBottom: 12 },
  emptyTitle:   { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 6 },
  emptyTxt:     { color: C.sub, textAlign: 'center', lineHeight: 22 },
})
