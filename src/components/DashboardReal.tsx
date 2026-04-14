// ============================================================
// DashboardReal.tsx — Dashboard P5 connectat a Supabase real
// Substitueix DashboardDemo.tsx (dades hardcoded) per dades live
// Massiu Soft SL
// ============================================================
import React, { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, ReferenceLine, Legend
} from 'recharts'
import {
  Activity, Thermometer, AlertCircle, RefreshCw, Bluetooth,
  User, ClipboardList, Settings, TrendingUp, TrendingDown, Minus,
  CheckCircle, Wifi, WifiOff, Battery, BatteryLow
} from 'lucide-react'
import { useDashboardData, type Dog, type DailyMetric, type Alert } from '../hooks/useDashboardData'

// ── Paleta Ernest ─────────────────────────────────────────────
const COL = {
  primary:  '#1565C0',
  success:  '#2E7D32',
  warning:  '#E65100',
  urgent:   '#B71C1C',
  purple:   '#7B1FA2',
  teal:     '#0d9488',
}

// ── Utilitats ─────────────────────────────────────────────────
function wellnessScore(m?: DailyMetric | null): number {
  if (!m) return 0
  const act  = Math.min((m.activity_index  ?? 50) / 100, 1) * 35
  const sym  = ((m.symmetry_index ?? 100) / 100) * 30
  const rest = Math.min((m.rest_hours ?? 8) / 12, 1) * 20
  const temp = m.avg_temp ? Math.max(0, 1 - Math.abs(m.avg_temp - 38.5) / 1.5) * 15 : 10
  return Math.round(act + sym + rest + temp)
}

function wellnessColor(s: number) {
  return s >= 80 ? COL.success : s >= 50 ? COL.warning : COL.urgent
}

function trendIcon(vals: (number | null)[], last?: number | null) {
  if (!last || vals.length < 2) return <Minus size={14} className="text-slate-400" />
  const prev = vals[vals.length - 2]
  if (!prev) return <Minus size={14} className="text-slate-400" />
  const diff = last - prev
  if (diff > 2)  return <TrendingUp size={14} className="text-green-500" />
  if (diff < -2) return <TrendingDown size={14} className="text-red-500" />
  return <Minus size={14} className="text-slate-400" />
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

// ── Subcomponents ──────────────────────────────────────────────

function StatCard({ title, value, unit, trend, color = COL.primary }: {
  title: string; value: string; unit?: string; trend?: React.ReactNode; color?: string
}) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
      <div className="text-slate-500 text-xs font-bold uppercase mb-1">{title}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold text-slate-900">{value}</span>
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
      </div>
      {trend && <div className="mt-2 flex items-center gap-1 text-xs font-bold text-slate-400">{trend}</div>}
    </div>
  )
}

function AlertRow({ alert, onRead }: { alert: Alert; onRead: (id: number) => void }) {
  const colors: Record<string, string> = {
    urgent:  'border-red-500 bg-red-50',
    warning: 'border-orange-400 bg-orange-50',
    info:    'border-blue-400 bg-blue-50',
  }
  const icons: Record<string, string> = { urgent: '🔴', warning: '🟠', info: 'ℹ️' }
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border-l-4 mb-2 ${colors[alert.severity] ?? ''}`}>
      <span>{icons[alert.severity]}</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-slate-800 text-sm truncate">{alert.message}</div>
        <div className="text-xs text-slate-500 mt-0.5">{alert.metric} · {timeAgo(alert.created_at)}</div>
      </div>
      <button
        onClick={() => onRead(alert.id)}
        className="flex-shrink-0 text-xs text-slate-400 hover:text-slate-700 transition"
      >
        ✓
      </button>
    </div>
  )
}

function DogSelector({ dogs, selected, onSelect }: {
  dogs: Dog[]; selected?: string; onSelect: (id: string) => void
}) {
  if (dogs.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 px-6 py-3 border-b border-slate-100">
      {dogs.map(d => (
        <button
          key={d.id}
          onClick={() => onSelect(d.id)}
          className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
            selected === d.id
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'
          }`}
        >
          🐕 {d.name}
          {d.device_health?.is_online
            ? <span className="ml-1.5 text-green-400">●</span>
            : <span className="ml-1.5 text-slate-300">○</span>
          }
        </button>
      ))}
    </div>
  )
}

// ── DASHBOARD PRINCIPAL ────────────────────────────────────────
export const DashboardReal: React.FC = () => {
  const [selectedDogId, setSelectedDogId] = useState<string | undefined>()
  const [days, setDays]     = useState(30)
  const [activeNav, setActiveNav] = useState('pacients')

  const { dogs, metrics, alerts, loading, error, reload, markAlertRead } =
    useDashboardData(selectedDogId, days)

  // Seleccionar primer gos per defecte
  React.useEffect(() => {
    if (dogs.length > 0 && !selectedDogId) setSelectedDogId(dogs[0].id)
  }, [dogs])

  const selectedDog = dogs.find(d => d.id === selectedDogId)
  const lastMetric  = metrics.at(-1)
  const wellness    = wellnessScore(lastMetric)
  const wColor      = wellnessColor(wellness)

  // Dades per als gràfics (últims N dies)
  const chartData = useMemo(() => metrics.map(m => ({
    date:     m.date.slice(5),   // MM-DD
    activitat: m.activity_index != null ? Math.round(m.activity_index) : null,
    simetria:  m.symmetry_index != null ? Math.round(m.symmetry_index) : null,
    repos:     m.rest_hours != null ? +m.rest_hours.toFixed(1) : null,
    temp:      m.avg_temp != null ? +m.avg_temp.toFixed(1) : null,
    anomalia:  m.anomaly_score != null ? +(m.anomaly_score * 100).toFixed(0) : null,
  })), [metrics])

  const battery = selectedDog?.device_health?.battery_pct
  const isOnline = selectedDog?.device_health?.is_online

  return (
    <div className="w-full h-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col md:flex-row text-sm">

      {/* ── Sidebar ─────────────────────────────────────────── */}
      <div className="w-full md:w-60 bg-slate-900 text-slate-400 p-5 flex flex-col gap-6 flex-shrink-0">
        <div className="flex items-center gap-2 text-white">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white text-xs font-bold">E</div>
          <span className="font-bold text-base tracking-tight">Ernest</span>
          <span className="ml-auto text-xs text-slate-600 font-mono">v1.0</span>
        </div>

        <nav className="flex flex-col gap-1">
          <div className="text-xs font-semibold uppercase text-slate-600 mb-1 px-2">Monitorització</div>
          {[
            { key: 'pacients',   icon: <Activity size={16} />,     label: 'Pacients actius' },
            { key: 'historial',  icon: <ClipboardList size={16} />, label: 'Historial clínic' },
            { key: 'propietaris',icon: <User size={16} />,          label: 'Propietaris' },
            { key: 'settings',   icon: <Settings size={16} />,      label: 'Configuració' },
          ].map(item => (
            <button key={item.key}
              onClick={() => setActiveNav(item.key)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
                activeNav === item.key ? 'bg-slate-800 text-white' : 'hover:bg-slate-800 hover:text-white'
              }`}>
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Dispositiu info */}
        {selectedDog?.device_health && (
          <div className="mt-auto bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 text-xs">
            <div className="text-slate-500 mb-2 font-semibold uppercase tracking-wide">Dispositiu</div>
            <div className="flex items-center gap-2 mb-1">
              {isOnline ? <Wifi size={12} className="text-green-400" /> : <WifiOff size={12} className="text-slate-600" />}
              <span>{isOnline ? 'En línia' : 'Fora de línia'}</span>
            </div>
            <div className="flex items-center gap-2">
              {battery && battery < 20 ? <BatteryLow size={12} className="text-red-400" /> : <Battery size={12} className="text-slate-400" />}
              <span>Bateria: {battery ?? '—'}%</span>
            </div>
          </div>
        )}

        <button onClick={reload} className="flex items-center gap-2 text-slate-600 hover:text-white transition text-xs">
          <RefreshCw size={12} /> Actualitzar dades
        </button>
      </div>

      {/* ── Contingut principal ──────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

        {/* Dog selector */}
        <DogSelector dogs={dogs} selected={selectedDogId} onSelect={setSelectedDogId} />

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <Activity size={32} className="mx-auto mb-2 animate-pulse" />
              <div>Carregant dades de Supabase...</div>
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 max-w-sm text-center">
              <AlertCircle size={32} className="text-red-500 mx-auto mb-2" />
              <div className="font-bold text-red-700 mb-1">Error de connexió</div>
              <div className="text-red-600 text-xs mb-4">{error}</div>
              <div className="text-xs text-slate-500">Verifica les variables VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY al fitxer .env</div>
            </div>
          </div>
        ) : !selectedDog ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="text-4xl mb-3">🐕</div>
              <div>No s'han trobat gossos actius a la base de dades.</div>
              <div className="text-xs mt-1">Comprova la connexió Supabase i els permisos RLS.</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5">

            {/* Capçalera gos */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{selectedDog.name}</h2>
                <p className="text-slate-500 text-xs">
                  {selectedDog.breed ?? 'Raça no especificada'}
                  {selectedDog.weight_kg ? ` · ${selectedDog.weight_kg} kg` : ''}
                </p>
              </div>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                alerts.length > 0 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-green-100 text-green-700'
              }`}>
                {alerts.length > 0
                  ? <><AlertCircle size={14} /> {alerts.length} alerta{alerts.length > 1 ? 's' : ''} activa{alerts.length > 1 ? 's' : ''}</>
                  : <><CheckCircle size={14} /> Estat: Estable</>
                }
              </div>
            </div>

            {/* Wellness + Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="col-span-2 md:col-span-1 bg-white p-4 rounded-2xl border-2 border-slate-100 flex flex-col items-center justify-center">
                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Índex Benestar</div>
                <div className="text-5xl font-black" style={{ color: wColor }}>{wellness}</div>
                <div className="text-xs font-bold mt-1" style={{ color: wColor }}>
                  {wellness >= 80 ? 'Excel·lent' : wellness >= 60 ? 'Bé' : wellness >= 40 ? 'Atenció' : 'Alerta'}
                </div>
              </div>

              <StatCard
                title="Activitat"
                value={lastMetric?.activity_index?.toFixed(0) ?? '—'}
                unit="/100"
                trend={trendIcon(metrics.map(m => m.activity_index), lastMetric?.activity_index)}
              />
              <StatCard
                title="Simetria"
                value={lastMetric?.symmetry_index?.toFixed(0) ?? '—'}
                unit="/100"
                trend={trendIcon(metrics.map(m => m.symmetry_index), lastMetric?.symmetry_index)}
              />
              <StatCard
                title="Repòs"
                value={lastMetric?.rest_hours?.toFixed(1) ?? '—'}
                unit="h"
                trend={trendIcon(metrics.map(m => m.rest_hours), lastMetric?.rest_hours)}
              />
            </div>

            {/* Rang de dies */}
            <div className="flex gap-2 mb-4">
              {[7, 14, 30].map(d => (
                <button key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
                    days === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'
                  }`}
                >{d} dies</button>
              ))}
            </div>

            {metrics.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-100">
                <Activity size={32} className="mx-auto mb-2 opacity-30" />
                <div>Sense dades per als últims {days} dies.</div>
                <div className="text-xs mt-1">Conecta l'arnès per iniciar la recollida de dades.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Activitat */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-3 text-sm">Evolució Activitat</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="gradAct" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COL.primary} stopOpacity={0.15}/>
                          <stop offset="95%" stopColor={COL.primary} stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis domain={[0, 100]} hide />
                      <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: 11 }} />
                      <Area type="monotone" dataKey="activitat" stroke={COL.primary} strokeWidth={2}
                        fillOpacity={1} fill="url(#gradAct)" connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Simetria */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-3 text-sm">Índex de Simetria</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis domain={[0, 100]} hide />
                      <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: 11 }} />
                      <ReferenceLine y={85} stroke={COL.warning} strokeDasharray="4 4" label={{ value: 'Llindar', fontSize: 9 }} />
                      <Line type="monotone" dataKey="simetria" stroke={COL.purple} strokeWidth={2}
                        dot={false} activeDot={{ r: 4 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Repòs + Temperatura */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-3 text-sm">Repòs i Temperatura</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis yAxisId="l" hide />
                      <YAxis yAxisId="r" orientation="right" hide />
                      <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Line yAxisId="l" type="monotone" dataKey="repos"  name="Repòs (h)"  stroke={COL.success}  strokeWidth={2} dot={false} connectNulls />
                      <Line yAxisId="r" type="monotone" dataKey="temp"   name="Temp (°C)"  stroke={COL.warning}  strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Score d'anomalia */}
                <div className="bg-white p-4 rounded-2xl border border-slate-100">
                  <h3 className="font-bold text-slate-800 mb-3 text-sm">Score d'Anomalia (%)</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis domain={[0, 100]} hide />
                      <Tooltip contentStyle={{ borderRadius: '10px', border: 'none', fontSize: 11 }} />
                      <ReferenceLine y={70} stroke={COL.urgent} strokeDasharray="4 4" label={{ value: 'Alerta', fontSize: 9 }} />
                      <Bar dataKey="anomalia" name="Score anomalia"
                        fill={COL.warning} radius={[3, 3, 0, 0]}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        shape={(props: any) => {
                          const { x, y, width, height, value } = props
                          const color = value >= 70 ? COL.urgent : value >= 40 ? COL.warning : COL.success
                          return <rect x={x} y={y} width={width} height={height} fill={color} rx={3} />
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Alertes actives */}
            {alerts.length > 0 && (
              <div className="mt-4">
                <h3 className="font-bold text-slate-700 text-sm mb-2">⚠ Alertes actives</h3>
                {alerts.map(a => (
                  <AlertRow key={a.id} alert={a} onRead={markAlertRead} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
