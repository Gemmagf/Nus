// ============================================================
// DeviceScreen.tsx — Gestió del dispositiu BLE Ernest
// Mostra: estat connexió, info dispositiu, bateria, parella
// Massiu Soft SL
// ============================================================
import React, { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform, Switch
} from 'react-native'
import { useAppStore } from '../store'
import { useBleSync } from '../hooks/useBleSync'
import { bleService } from '../services/ble'

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

function BatteryBar({ pct }: { pct: number }) {
  const color = pct > 50 ? C.success : pct > 20 ? C.warning : C.urgent
  return (
    <View style={bat.wrap}>
      <View style={[bat.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  )
}
const bat = StyleSheet.create({
  wrap: { height: 10, backgroundColor: '#E0E7EF', borderRadius: 5, overflow: 'hidden', flex: 1 },
  fill: { height: '100%', borderRadius: 5 },
})

function InfoRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.infoValue}>{value}</Text>
        {sub ? <Text style={styles.infoSub}>{sub}</Text> : null}
      </View>
    </View>
  )
}

export default function DeviceScreen() {
  const { bleStatus, bleMessage, selectedDog, lastSync, pendingPkts } = useAppStore()
  const { connect, disconnect, flush } = useBleSync(
    selectedDog?.id,
    selectedDog?.device_health ? 'device_id_from_dog' : undefined
  )
  const [autoConnect, setAutoConnect] = useState(true)
  const [connecting, setConnecting] = useState(false)

  const deviceName = bleService.getDeviceName()
  const battery = selectedDog?.device_health?.battery_pct ?? null
  const isOnline = selectedDog?.device_health?.is_online ?? false
  const lastSeen = selectedDog?.device_health?.last_seen_at
    ? new Date(selectedDog.device_health.last_seen_at).toLocaleString()
    : '—'

  const handleConnect = async () => {
    setConnecting(true)
    try { await connect() }
    catch { /* errors handled in store via setBle */ }
    finally { setConnecting(false) }
  }

  const handleDisconnect = async () => {
    Alert.alert('Desconnectar', 'Vols desconnectar l\'arnès?', [
      { text: 'Cancel·la', style: 'cancel' },
      { text: 'Desconnecta', style: 'destructive', onPress: disconnect },
    ])
  }

  const handleFlush = async () => {
    if (pendingPkts === 0) {
      Alert.alert('Sense paquets', 'No hi ha paquets pendents d\'enviar.')
      return
    }
    await flush()
    Alert.alert('Sincronitzat', `${pendingPkts} paquets enviats al servidor.`)
  }

  const statusColor = bleStatus === 'connected' ? C.success
    : bleStatus === 'error' ? C.urgent : C.primary

  const statusLabel: Record<string, string> = {
    idle:       '○ Desconnectat',
    scanning:   '⟳ Escanejant...',
    connecting: '⟳ Connectant...',
    connected:  '● Connectat',
    error:      '✕ Error',
  }

  return (
    <ScrollView style={styles.container}>
      {/* Estat de connexió */}
      <View style={[styles.statusCard, { borderColor: statusColor }]}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.statusTitle, { color: statusColor }]}>
            {statusLabel[bleStatus] ?? bleStatus}
          </Text>
          {bleMessage ? <Text style={styles.statusMsg}>{bleMessage}</Text> : null}
          {deviceName ? <Text style={styles.statusMsg}>Dispositiu: {deviceName}</Text> : null}
        </View>
      </View>

      {/* Acció principal */}
      <View style={styles.section}>
        {bleStatus === 'connected' ? (
          <TouchableOpacity style={[styles.btn, { backgroundColor: C.urgent }]} onPress={handleDisconnect}>
            <Text style={styles.btnTxt}>Desconnectar arnès</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: C.primary, opacity: connecting ? 0.7 : 1 }]}
            onPress={handleConnect}
            disabled={connecting}
          >
            {connecting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnTxt}>Connectar arnès Ernest</Text>
            }
          </TouchableOpacity>
        )}
      </View>

      {/* Info dispositiu */}
      {selectedDog && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informació del dispositiu</Text>
          <View style={styles.card}>
            <InfoRow label="Gos" value={selectedDog.name} />
            {selectedDog.breed && <InfoRow label="Raça" value={selectedDog.breed} />}
            <InfoRow label="Estat cloud" value={isOnline ? 'En línia' : 'Fora de línia'} />
            <InfoRow label="Última connexió" value={lastSeen} />
            {lastSync && (
              <InfoRow label="Última sync" value={lastSync.toLocaleTimeString()} />
            )}
          </View>
        </View>
      )}

      {/* Bateria */}
      {battery !== null && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bateria del dispositiu</Text>
          <View style={styles.card}>
            <View style={styles.batteryRow}>
              <Text style={styles.batteryPct}>{battery}%</Text>
              <BatteryBar pct={battery} />
            </View>
            <Text style={styles.batteryNote}>
              {battery < 20 ? '⚠ Bateria baixa — carrega l\'arnès aviat' :
               battery < 50 ? 'Bateria moderada' : 'Bateria correcta'}
            </Text>
          </View>
        </View>
      )}

      {/* Sincronització */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sincronització de dades</Text>
        <View style={styles.card}>
          <InfoRow
            label="Paquets pendents"
            value={`${pendingPkts}`}
            sub={pendingPkts > 0 ? 'Pendent d\'enviar' : 'Tot sincronitzat'}
          />
          <TouchableOpacity
            style={[styles.btnSmall, { backgroundColor: pendingPkts > 0 ? C.primary : '#ccc' }]}
            onPress={handleFlush}
            disabled={pendingPkts === 0}
          >
            <Text style={styles.btnSmallTxt}>Forçar sincronització ara</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Configuració */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Configuració</Text>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.switchLabel}>Connexió automàtica</Text>
              <Text style={styles.switchSub}>Connecta al obrir l'app si l'arnès és a prop</Text>
            </View>
            <Switch
              value={autoConnect}
              onValueChange={setAutoConnect}
              trackColor={{ true: C.primary }}
            />
          </View>
        </View>
      </View>

      {/* UUIDs diagnòstic */}
      <View style={[styles.section, { marginBottom: 40 }]}>
        <Text style={styles.sectionTitle}>Diagnòstic BLE</Text>
        <View style={styles.card}>
          <Text style={styles.diagLabel}>Service UUID</Text>
          <Text style={styles.diagVal}>4fafc201-1fb5-459e-8fcc-c5c9c3319100</Text>
          <Text style={[styles.diagLabel, { marginTop: 8 }]}>Sensor Characteristic</Text>
          <Text style={styles.diagVal}>beb5483e-36e1-4688-b7f5-ea07361b26a8</Text>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: C.bg },
  statusCard:    { margin: 16, backgroundColor: C.card, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 2, gap: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  statusDot:     { width: 14, height: 14, borderRadius: 7 },
  statusTitle:   { fontWeight: '700', fontSize: 15 },
  statusMsg:     { color: C.sub, fontSize: 12, marginTop: 2 },
  section:       { marginHorizontal: 16, marginTop: 16 },
  sectionTitle:  { fontSize: 12, fontWeight: '700', color: C.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  card:          { backgroundColor: C.card, borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  btn:           { borderRadius: 14, padding: 16, alignItems: 'center' },
  btnTxt:        { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnSmall:      { borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 12 },
  btnSmallTxt:   { color: '#fff', fontWeight: '600', fontSize: 14 },
  infoRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  infoLabel:     { color: C.sub, fontSize: 13 },
  infoValue:     { color: C.text, fontWeight: '600', fontSize: 13 },
  infoSub:       { color: C.sub, fontSize: 11, marginTop: 2 },
  batteryRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  batteryPct:    { fontSize: 22, fontWeight: '800', color: C.text, width: 52 },
  batteryNote:   { color: C.sub, fontSize: 12 },
  switchRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchLabel:   { fontSize: 14, fontWeight: '600', color: C.text },
  switchSub:     { fontSize: 11, color: C.sub, marginTop: 2, maxWidth: '80%' },
  diagLabel:     { fontSize: 11, fontWeight: '700', color: C.sub, textTransform: 'uppercase' },
  diagVal:       { fontSize: 10, color: C.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginTop: 2 },
})
