// ============================================================
// store/index.ts — Estat global (Zustand)
// Massiu Soft SL
// ============================================================
import { create } from 'zustand'
import type { BleStatus } from '../services/ble'

interface Dog {
  id: string; name: string; breed?: string; weight_kg?: number
  device_health?: { battery_pct: number; is_online: boolean; last_seen_at: string }
}

interface Alert {
  id: number; severity: 'info'|'warning'|'urgent'; metric: string
  message: string; created_at: string; is_read: boolean
}

interface AppState {
  // Auth
  userId: string | null
  setUserId: (id: string | null) => void

  // Gossos
  dogs:        Dog[]
  selectedDog: Dog | null
  setDogs:     (d: Dog[]) => void
  selectDog:   (d: Dog | null) => void

  // BLE
  bleStatus:   BleStatus
  bleMessage:  string
  setBle:      (s: BleStatus, msg?: string) => void

  // Alertes
  alerts:      Alert[]
  setAlerts:   (a: Alert[]) => void
  markRead:    (id: number) => void

  // Sincronització
  lastSync:    Date | null
  pendingPkts: number
  setLastSync: (d: Date) => void
  setPending:  (n: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  userId:      null,
  setUserId:   (id) => set({ userId: id }),

  dogs:        [],
  selectedDog: null,
  setDogs:     (dogs) => set({ dogs }),
  selectDog:   (dog) => set({ selectedDog: dog }),

  bleStatus:   'idle',
  bleMessage:  '',
  setBle:      (bleStatus, bleMessage = '') => set({ bleStatus, bleMessage }),

  alerts:      [],
  setAlerts:   (alerts) => set({ alerts }),
  markRead:    (id) => set(s => ({ alerts: s.alerts.filter(a => a.id !== id) })),

  lastSync:    null,
  pendingPkts: 0,
  setLastSync: (lastSync) => set({ lastSync }),
  setPending:  (pendingPkts) => set({ pendingPkts }),
}))
