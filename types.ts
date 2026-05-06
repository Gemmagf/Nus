// ============================================================
// types.ts — Tipus globals del projecte Ernest
// Massiu Soft SL · 2025
// ============================================================

// ── Presentació / navegació ───────────────────────────────────

export interface SlideProps {
  onNext: () => void
  onPrev: () => void
  isFirst?: boolean
  isLast?: boolean
}

// ── Dispositiu BLE ────────────────────────────────────────────

/** Paquet de 20 bytes enviat per l'arnès via BLE cada ~5 s */
export interface SensorPacket {
  ts: number           // unix timestamp (uint32, s)
  accX: number         // acceleració X (int16 → g × 1000)
  accY: number         // acceleració Y
  accZ: number         // acceleració Z
  gyroX: number        // giroscopi X (int16 → °/s × 10)
  gyroY: number        // giroscopi Y
  gyroZ: number        // giroscopi Z
  tempSurface: number  // temperatura superficial (int16 → °C × 10)
  batteryPct: number   // % bateria (uint8, 0-100)
}

export type DeviceStatus = 'online' | 'offline' | 'syncing' | 'low_battery'

export interface DeviceHealth {
  batteryPct: number
  isOnline: boolean
  lastSeenAt: string  // ISO 8601
}

// ── Entitats principals ───────────────────────────────────────

export interface Dog {
  id: string
  ownerId: string
  name: string
  breed?: string
  birthDate?: string   // YYYY-MM-DD
  weightKg?: number
  deviceHealth?: DeviceHealth
}

export interface DailyMetrics {
  id: number
  dogId: string
  date: string           // YYYY-MM-DD
  activityIndex: number  // 0-100
  restHours: number
  restFragmentation: number  // 0-1
  symmetryIndex: number  // 0-100
  avgTemp: number        // °C
  stepsEstimated: number
  anomalyScore: number   // 0-1; >0.7 = alerta
  // migration 002
  walkCount?: number
  walkTotalMin?: number
  walkTotalM?: number
  stepsTotal?: number
  pipiCount?: number
  cacaCount?: number
}

export interface Baseline {
  id: number
  dogId: string
  metric: MetricKey
  p10: number
  p50: number
  p90: number
  windowDays: number
  computedAt: string
}

// ── Alertes ───────────────────────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'urgent'

export type MetricKey =
  | 'activity_index'
  | 'rest_hours'
  | 'rest_fragmentation'
  | 'symmetry_index'
  | 'avg_temp'
  | 'steps_estimated'
  | 'anomaly_score'
  | 'walk_count'
  | 'walk_total_min'
  | 'pipi_count'
  | 'caca_count'

export interface Alert {
  id: number
  dogId: string
  severity: AlertSeverity
  metric: MetricKey
  message: string
  createdAt: string
  isRead: boolean
}

// ── Passejades i events fisiològics ──────────────────────────

export interface WalkSession {
  id: number
  dogId: string
  date: string
  startedAt: string
  endedAt: string
  durationMin: number
  distanceM?: number
  steps?: number
  avgPaceKmh?: number
  avgSymmetry?: number
  avgActivity?: number
  detectionConfidence: number
  pipelineVersion: string
}

export type BathroomEventType = 'pipi' | 'caca' | 'unknown'

export interface BathroomEvent {
  id: number
  dogId: string
  date: string
  occurredAt: string
  eventType: BathroomEventType
  durationS: number
  postureScore?: number
  gyroLateral?: number
  accZDelta?: number
  walkSessionId?: number
  detectionConfidence: number
  pipelineVersion: string
}

// ── Pipeline ──────────────────────────────────────────────────

export interface PipelineRun {
  id: number
  runDate: string
  dogsTotal: number
  dogsOk: number
  dogsError: number
  errors: Record<string, string>
  createdAt: string
}

// ── API ───────────────────────────────────────────────────────

export interface IngestPayload {
  dogId: string
  readings: SensorPacket[]
}

export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
}

// ── Dashboard / UI ────────────────────────────────────────────

/** Estat de salut global calculat pel dashboard */
export interface WellnessSnapshot {
  score: number          // 0-100, fórmula: act×35%+sym×30%+rest×20%+temp×15%
  label: 'Excel·lent' | 'Bé' | 'Regular' | 'Preocupant'
  color: string          // hex / CSS color
  trend: 'up' | 'down' | 'stable'
}

export type ChartPeriod = 7 | 14 | 30 | 90

export interface ChartDataPoint {
  date: string
  value: number
  baseline?: number
}
