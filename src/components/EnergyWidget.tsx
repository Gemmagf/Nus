// ============================================================
// src/components/EnergyWidget.tsx
// Ernest — Widget de pressupost energètic i fatiga
//
// Mostra l'energia restant del gos durant i després d'una sortida:
//  - Barra / gauge circular d'energia actual
//  - Corba d'evolució (AreaChart)
//  - Senyals de fatiga actius
//  - Temps restant estimat
//
// Massiu Soft SL · 2026
// ============================================================

import React, { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { Battery, BatteryLow, BatteryWarning, Zap, AlertTriangle, Clock } from 'lucide-react'

// ── Tipus locals ──────────────────────────────────────────────

export type FatigueSignal =
  | 'pauses_increasing'
  | 'symmetry_declining'
  | 'temp_elevated'
  | 'pace_slowing'
  | 'sudden_drop'

export interface EnergySnapshot {
  ts: string              // ISO 8601
  energy_pct: number      // 0-100
  drain_rate: number      // %/min
  fatigue_signals: FatigueSignal[]
  alert_level: 'ok' | 'warning' | 'urgent'
  estimated_remaining_min: number | null
}

interface EnergyWidgetProps {
  dogName: string
  breed?: string
  snapshots: EnergySnapshot[]
  sessionStartedAt?: string   // ISO 8601
  isLive?: boolean            // si la sessió és en curs
}

// ── Constants ─────────────────────────────────────────────────

const SIGNAL_LABELS: Record<FatigueSignal, string> = {
  pauses_increasing:  'Aturades més freqüents',
  symmetry_declining: 'Simetria de marxa baixant',
  temp_elevated:      'Temperatura corporal alta',
  pace_slowing:       'Ritme decreixent',
  sudden_drop:        'Caiguda sobtada d\'energia',
}

const SIGNAL_ICONS: Record<FatigueSignal, string> = {
  pauses_increasing:  '⏸️',
  symmetry_declining: '↔️',
  temp_elevated:      '🌡️',
  pace_slowing:       '🐢',
  sudden_drop:        '⚡',
}

// ── Helpers ───────────────────────────────────────────────────

function energyColor(pct: number): string {
  if (pct > 60) return '#22c55e'   // verd
  if (pct > 35) return '#f59e0b'   // ambre
  return '#ef4444'                  // vermell
}

function energyLabel(pct: number): string {
  if (pct > 70) return 'Excel·lent'
  if (pct > 50) return 'Bona'
  if (pct > 35) return 'Moderada'
  if (pct > 15) return 'Baixa'
  return 'Crítica'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ca-ES', {
    hour: '2-digit', minute: '2-digit'
  })
}

function formatDuration(startIso: string, endIso: string): string {
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}min`
}

// ── Sub-components ────────────────────────────────────────────

function EnergyGauge({ pct }: { pct: number }) {
  const color  = energyColor(pct)
  const radius = 54
  const circ   = 2 * Math.PI * radius
  const stroke = (pct / 100) * circ

  return (
    <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        {/* Track */}
        <circle
          cx="70" cy="70" r={radius}
          fill="none" stroke="#e2e8f0" strokeWidth="10"
        />
        {/* Progress */}
        <circle
          cx="70" cy="70" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${stroke} ${circ}`}
          strokeDashoffset={circ / 4}  /* start from top */
          style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.5s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold text-slate-900" style={{ color }}>
          {Math.round(pct)}%
        </span>
        <span className="text-xs text-slate-500 font-medium">{energyLabel(pct)}</span>
      </div>
    </div>
  )
}

function BatteryIcon({ pct }: { pct: number }) {
  if (pct > 35) return <Battery size={16} className="text-green-500" />
  if (pct > 15) return <BatteryWarning size={16} className="text-amber-500" />
  return <BatteryLow size={16} className="text-red-500" />
}

// ── Tooltip customitzat per al gràfic ──────────────────────────

function EnergyTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; payload: { fatigue_signals: FatigueSignal[] } }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const pct     = payload[0].value
  const signals = payload[0].payload.fatigue_signals ?? []
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm">
      <div className="font-bold text-slate-900 mb-1">{label}</div>
      <div className="flex items-center gap-2 mb-1">
        <BatteryIcon pct={pct} />
        <span style={{ color: energyColor(pct) }} className="font-semibold">
          {Math.round(pct)}% energia
        </span>
      </div>
      {signals.length > 0 && (
        <div className="border-t border-slate-100 mt-2 pt-2 space-y-1">
          {signals.map(s => (
            <div key={s} className="flex items-center gap-1 text-xs text-slate-600">
              <span>{SIGNAL_ICONS[s]}</span>
              <span>{SIGNAL_LABELS[s]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Component principal ───────────────────────────────────────

export const EnergyWidget: React.FC<EnergyWidgetProps> = ({
  dogName,
  snapshots,
  sessionStartedAt,
  isLive = false,
}) => {
  const last = snapshots.at(-1)
  const first = snapshots.at(0)

  const chartData = useMemo(() =>
    snapshots.map(s => ({
      time: formatTime(s.ts),
      energy_pct: s.energy_pct,
      fatigue_signals: s.firstActiveSignals ?? s.fatigue_signals,
    })),
    [snapshots]
  )

  const allSignals = useMemo(() => {
    const seen = new Set<FatigueSignal>()
    snapshots.forEach(s => s.fatigue_signals.forEach(sig => seen.add(sig)))
    return Array.from(seen)
  }, [snapshots])

  const fatigueOnsetIdx = useMemo(() =>
    snapshots.findIndex(s => s.alert_level !== 'ok'),
    [snapshots]
  )
  const fatigueOnset = fatigueOnsetIdx >= 0 ? snapshots[fatigueOnsetIdx] : null

  if (!last || snapshots.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex items-center justify-center h-48">
        <p className="text-slate-400 text-sm">Sense dades d'energia per a aquesta sessió</p>
      </div>
    )
  }

  const alertColor = {
    ok:      'bg-green-50 border-green-200 text-green-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    urgent:  'bg-red-50 border-red-200 text-red-700',
  }[last.alert_level]

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Capçalera */}
      <div className="px-6 pt-5 pb-4 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-amber-500" />
          <h3 className="font-bold text-slate-800">Energia de {dogName}</h3>
          {isLive && (
            <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              EN CURS
            </span>
          )}
        </div>
        {first && last && sessionStartedAt && (
          <span className="text-xs text-slate-400">
            {formatDuration(first.ts, last.ts)} de sortida
          </span>
        )}
      </div>

      <div className="p-6">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Gauge + estat actual */}
          <div className="flex flex-col items-center gap-4 min-w-[180px]">
            <EnergyGauge pct={last.energy_pct} />

            {/* Estat actual */}
            <div className={`w-full text-center text-xs font-semibold px-3 py-2 rounded-lg border ${alertColor}`}>
              {last.alert_level === 'ok' && '✅ Energia adequada'}
              {last.alert_level === 'warning' && '⚠️ Energia baixa'}
              {last.alert_level === 'urgent' && '🚨 Energia crítica'}
            </div>

            {/* Temps restant estimat */}
            {last.estimated_remaining_min !== null && last.drain_rate > 0 && (
              <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-4 py-2 rounded-xl w-full justify-center">
                <Clock size={14} className="text-slate-400" />
                <span>~{Math.round(last.estimated_remaining_min)} min restants</span>
              </div>
            )}
          </div>

          {/* Gràfic evolució */}
          <div className="flex-1 min-h-[180px]">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-3">
              Evolució d'energia durant la sortida
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="energyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis domain={[0, 100]} hide />
                <Tooltip content={<EnergyTooltip />} />
                {/* Zones de referència */}
                <ReferenceLine y={35} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5} />
                <ReferenceLine y={15} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.5} />
                {/* Línia del punt de fatiga */}
                {fatigueOnset && (
                  <ReferenceLine
                    x={formatTime(fatigueOnset.ts)}
                    stroke="#f59e0b"
                    strokeDasharray="4 2"
                    label={{ value: 'Fatiga', position: 'top', fontSize: 10, fill: '#f59e0b' }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="energy_pct"
                  stroke="#22c55e"
                  strokeWidth={2.5}
                  fill="url(#energyGrad)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#22c55e' }}
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-1 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="inline-block w-6 border-t border-dashed border-amber-400" /> Warning 35%
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-6 border-t border-dashed border-red-400" /> Urgent 15%
              </span>
            </div>
          </div>
        </div>

        {/* Senyals de fatiga detectats */}
        {allSignals.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={14} className="text-amber-500" />
              <span className="text-xs font-semibold text-slate-600 uppercase">
                Senyals de fatiga detectats
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {allSignals.map(sig => (
                <span
                  key={sig}
                  className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-full font-medium"
                >
                  {SIGNAL_ICONS[sig]} {SIGNAL_LABELS[sig]}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Resum de la sessió */}
        {first && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              {
                label: 'Inici',
                value: `${Math.round(100)}%`,
                sub: formatTime(first.ts),
                color: '#22c55e',
              },
              {
                label: 'Mínim',
                value: `${Math.round(Math.min(...snapshots.map(s => s.energy_pct)))}%`,
                sub: 'punt més baix',
                color: energyColor(Math.min(...snapshots.map(s => s.energy_pct))),
              },
              {
                label: 'Final',
                value: `${Math.round(last.energy_pct)}%`,
                sub: formatTime(last.ts),
                color: energyColor(last.energy_pct),
              },
            ].map(item => (
              <div
                key={item.label}
                className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100"
              >
                <div className="text-xs text-slate-500 mb-1">{item.label}</div>
                <div className="text-lg font-bold" style={{ color: item.color }}>
                  {item.value}
                </div>
                <div className="text-[10px] text-slate-400">{item.sub}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
