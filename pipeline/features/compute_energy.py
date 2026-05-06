# ============================================================
# pipeline/features/compute_energy.py
# Ernest — Model de pressupost energètic i detecció de fatiga
#
# Objectiu: estimar l'energia restant d'un gos durant una
# activitat i detectar senyals de fatiga *abans* que el gos
# pari completament.
#
# Model v1.0 — basat en IMU (intensitat + simetria), temperatura
# superficial, perfil del gos (raça, edat, pes) i historial.
#
# Massiu Soft SL · 2026
# ============================================================

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal, Sequence

import numpy as np
import pandas as pd

# ── Constants del model ───────────────────────────────────────

WINDOW_S         = 30      # finestra de càlcul (s)
READINGS_PER_S   = 5       # freq. mostreig (lectures/s) — 1 cada 200ms

# Drenatge base per finestra de 30s (% energia) per a un gos adult de referència
# (Labrador 25kg, 5 anys, 20°C)
DRAIN_BASE       = 1.2     # %/finestra en intensitat moderada (0.3g)

# Recuperació durant aturada
RECOVERY_PER_S   = 0.10    # % energia recuperada per segon de repòs real

# Llindars d'alerta
THRESHOLD_WARNING  = 35.0  # % energia → warning
THRESHOLD_URGENT   = 15.0  # % energia → urgent
THRESHOLD_SUDDEN   = 20.0  # caiguda sobtada en 5 min → warning immediat

# Temperatura (superficial NTC, °C)
TEMP_PENALTY_MILD   = 39.0   # × 1.25
TEMP_PENALTY_HIGH   = 39.5   # × 1.60

# Intensitat IMU de referència (g) per a DRAIN_BASE
INTENSITY_REF = 0.30

# ── Factors per raça (endurance relatiu) ─────────────────────
# Valors < 1 → alta resistència, > 1 → baixa resistència
BREED_ENDURANCE: dict[str, float] = {
    # Alta resistència
    "bòrder collie":       0.55,
    "border collie":       0.55,
    "husky siberià":       0.55,
    "siberian husky":      0.55,
    "malinois":            0.55,
    "pastor belga":        0.55,
    "vizsla":              0.60,
    "weimaraner":          0.60,
    "jack russell":        0.65,
    "pastor alemany":      0.70,
    "german shepherd":     0.70,
    # Resistència normal
    "labrador":            0.85,
    "llaurador":           0.85,
    "golden retriever":    0.85,
    "retriever":           0.85,
    "cocker spaniel":      0.90,
    "beagle":              0.90,
    "boxer":               1.00,
    # Baixa resistència / braquicèfals
    "bulldog":             1.60,
    "bulldog anglès":      1.60,
    "bulldog francès":     1.50,
    "pug":                 1.70,
    "carlí":               1.70,
    "shih tzu":            1.40,
    "pequinès":            1.50,
    # Default (raça desconeguda)
    "_default":            1.00,
}

# ── Dataclasses de sortida ────────────────────────────────────

FatigueSignal = Literal[
    "pauses_increasing",   # les aturades es fan més freqüents
    "symmetry_declining",  # índex de simetria cau > 5pt en 10 min
    "temp_elevated",       # temperatura superficial > 39°C
    "pace_slowing",        # velocitat de passeig caient consistentment
    "sudden_drop",         # caiguda d'energia sobtada (> 20% en 5 min)
]

AlertLevel = Literal["ok", "warning", "urgent"]


@dataclass
class EnergySnapshot:
    """Instantània de l'estat energètic en un moment donat."""
    ts: datetime
    energy_pct: float          # 0–100 (100 = ple, 0 = esgotat)
    drain_rate: float          # %/min drenatge actual
    fatigue_signals: list[FatigueSignal] = field(default_factory=list)
    alert_level: AlertLevel = "ok"
    estimated_remaining_min: float | None = None   # mins restants al ritme actual
    notes: str = ""


@dataclass
class SessionEnergyReport:
    """Resum energètic d'una sessió completa de passeig."""
    dog_id: str
    date: str                  # YYYY-MM-DD
    started_at: datetime
    ended_at: datetime | None
    snapshots: list[EnergySnapshot]
    final_energy_pct: float
    min_energy_pct: float
    max_drain_rate: float      # %/min màxim observat
    fatigue_onset_ts: datetime | None  # quan han aparegut els primers senyals
    peak_alert: AlertLevel
    breed_factor: float
    age_factor: float


# ── Funcions auxiliars ────────────────────────────────────────

def _breed_factor(breed: str | None) -> float:
    if not breed:
        return BREED_ENDURANCE["_default"]
    key = breed.lower().strip()
    # Cerca exacta
    if key in BREED_ENDURANCE:
        return BREED_ENDURANCE[key]
    # Cerca parcial
    for k, v in BREED_ENDURANCE.items():
        if k != "_default" and (k in key or key in k):
            return v
    return BREED_ENDURANCE["_default"]


def _age_factor(birth_date: str | None) -> float:
    """
    Factors per edat:
    - < 1 any : 1.30  (cadells s'esgoten i sobreexciten)
    - 1–2 anys: 1.15  (joves tendeixen a sobreexcitar-se)
    - 2–7 anys: 1.00  (edat òptima)
    - 7–10 anys: 1.25 (edat mitjana-avançada)
    - > 10 anys: 1.55 (sènior)
    """
    if not birth_date:
        return 1.0
    try:
        born = datetime.strptime(birth_date, "%Y-%m-%d")
        age_years = (datetime.now() - born).days / 365.25
    except ValueError:
        return 1.0

    if age_years < 1:
        return 1.30
    elif age_years < 2:
        return 1.15
    elif age_years < 7:
        return 1.00
    elif age_years < 10:
        return 1.25
    else:
        return 1.55


def _weight_factor(weight_kg: float | None) -> float:
    """Gossos grans gasten més energia per kg de massa activa.
    Factor correctiu relatiu a un gos de 20 kg de referència.
    """
    if not weight_kg or weight_kg <= 0:
        return 1.0
    # +1.5% per cada kg per sobre de 20; -1% per cada kg per sota de 10
    if weight_kg > 20:
        return 1.0 + (weight_kg - 20) * 0.015
    elif weight_kg < 10:
        return 1.0 - (10 - weight_kg) * 0.010
    return 1.0


def _temp_factor(temp_c: float | None) -> float:
    if temp_c is None:
        return 1.0
    if temp_c >= TEMP_PENALTY_HIGH:
        return 1.60
    if temp_c >= TEMP_PENALTY_MILD:
        return 1.25
    return 1.0


def _imu_intensity(df_window: pd.DataFrame) -> float:
    """Magnitud IMU normalitzada: mag = |acc| - 1g, clipejat a 0."""
    mag = np.sqrt(df_window["acc_x"]**2 + df_window["acc_y"]**2 + df_window["acc_z"]**2) - 1.0
    return float(np.clip(mag, 0, None).mean())


def _symmetry_index(df_window: pd.DataFrame) -> float:
    """Simetria lateral: 100 = perfecta, baixa quan la marxa és asimètrica."""
    std_x = df_window["acc_x"].std()
    std_y = df_window["acc_y"].std()
    if std_x + std_y < 1e-6:
        return 100.0
    asym = abs(std_x - std_y) / (std_x + std_y)
    return float(np.clip(100 - asym * 200, 0, 100))


def _is_stopped(df_window: pd.DataFrame, threshold: float = 0.05) -> bool:
    """El gos ha parat si la magnitud IMU és molt baixa."""
    intensity = _imu_intensity(df_window)
    return intensity < threshold


# ── Funció principal ──────────────────────────────────────────

def compute_energy_session(
    dog_id: str,
    date: str,
    readings: pd.DataFrame,
    breed: str | None = None,
    birth_date: str | None = None,
    weight_kg: float | None = None,
    energy_start: float = 100.0,
) -> SessionEnergyReport:
    """
    Calcula el pressupost energètic d'un gos durant una sessió d'activitat.

    Args:
        dog_id:        UUID del gos
        date:          Data de la sessió (YYYY-MM-DD)
        readings:      DataFrame de sensor_readings amb columnes:
                       [ts, acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z,
                        temp_surface, battery_pct]
        breed:         Raça del gos (opcional, millora la precisió)
        birth_date:    Data de naixement YYYY-MM-DD (opcional)
        weight_kg:     Pes del gos en kg (opcional)
        energy_start:  Energia inicial (0-100). Default 100.

    Returns:
        SessionEnergyReport amb snapshots cada WINDOW_S segons.
    """
    if readings.empty:
        empty_snap = EnergySnapshot(
            ts=datetime.now(timezone.utc),
            energy_pct=energy_start,
            drain_rate=0.0,
        )
        return SessionEnergyReport(
            dog_id=dog_id, date=date,
            started_at=datetime.now(timezone.utc), ended_at=None,
            snapshots=[empty_snap], final_energy_pct=energy_start,
            min_energy_pct=energy_start, max_drain_rate=0.0,
            fatigue_onset_ts=None, peak_alert="ok",
            breed_factor=_breed_factor(breed),
            age_factor=_age_factor(birth_date),
        )

    # Assegurem que ts és datetime
    readings = readings.copy()
    if not pd.api.types.is_datetime64_any_dtype(readings["ts"]):
        readings["ts"] = pd.to_datetime(readings["ts"], unit="s", utc=True)
    readings = readings.sort_values("ts").reset_index(drop=True)

    bf = _breed_factor(breed)
    af = _age_factor(birth_date)
    wf = _weight_factor(weight_kg)

    started_at = readings["ts"].iloc[0]
    snapshots: list[EnergySnapshot] = []
    energy = energy_start
    window_readings = int(WINDOW_S * READINGS_PER_S)
    step = max(1, window_readings // 2)  # 50% solapament

    # Història per detectar tendències
    symmetry_history: list[float] = []
    energy_history:   list[float] = []
    drain_history:    list[float] = []
    stop_times:       list[datetime] = []
    fatigue_onset_ts: datetime | None = None

    i = 0
    while i + window_readings <= len(readings):
        window = readings.iloc[i : i + window_readings]
        ts_mid = window["ts"].iloc[len(window) // 2]

        intensity  = _imu_intensity(window)
        sym        = _symmetry_index(window)
        avg_temp   = window["temp_surface"].mean() if "temp_surface" in window.columns else None
        stopped    = _is_stopped(window)

        # ── Càlcul drenatge / recuperació ──────────────────────────
        if stopped:
            # Recuperació: gos parat descansa
            recovery = RECOVERY_PER_S * WINDOW_S * 0.5  # recuperació parcial
            energy = min(energy_start, energy + recovery)
            drain = -recovery / (WINDOW_S / 60)  # negatiu = recuperació
            stop_times.append(ts_mid)
        else:
            # Drenatge proporcional a intensitat vs referència
            intensity_ratio = intensity / INTENSITY_REF if INTENSITY_REF > 0 else 1.0
            tf = _temp_factor(avg_temp)
            drain_pct = DRAIN_BASE * intensity_ratio * bf * af * wf * tf
            energy = max(0.0, energy - drain_pct)
            drain = drain_pct / (WINDOW_S / 60)  # %/min

        # ── Detecció de senyals de fatiga ──────────────────────────
        signals: list[FatigueSignal] = []

        symmetry_history.append(sym)
        energy_history.append(energy)
        drain_history.append(drain if drain > 0 else 0.0)

        # Simetria decreixent: > 5pt en últims 10 min (20 finestres solapades de 30s)
        n_sym = min(len(symmetry_history), 20)
        if n_sym >= 4:
            sym_trend = symmetry_history[-1] - symmetry_history[-n_sym]
            if sym_trend < -5.0:
                signals.append("symmetry_declining")

        # Temperatura elevada
        if avg_temp is not None and avg_temp >= TEMP_PENALTY_MILD:
            signals.append("temp_elevated")

        # Aturades cada cop més freqüents
        recent_min = 10
        recent_stops = sum(
            1 for t in stop_times
            if (ts_mid - t).total_seconds() < recent_min * 60
        )
        if len(stop_times) >= 3 and recent_stops >= 3:
            signals.append("pauses_increasing")

        # Caiguda sobtada: > THRESHOLD_SUDDEN% en últims 5 min (10 finestres)
        n_sudden = min(len(energy_history), 10)
        if n_sudden >= 4:
            sudden_drop = energy_history[-n_sudden] - energy_history[-1]
            if sudden_drop >= THRESHOLD_SUDDEN:
                signals.append("sudden_drop")

        # Pace ralentitzant: si la intensitat cau consistentment
        n_pace = min(len(drain_history), 6)
        if n_pace >= 4:
            pace_vals = drain_history[-n_pace:]
            if all(pace_vals[j] > pace_vals[j + 1] for j in range(len(pace_vals) - 1)):
                signals.append("pace_slowing")

        # ── Nivell d'alerta ────────────────────────────────────────
        if energy <= THRESHOLD_URGENT or "sudden_drop" in signals:
            alert = "urgent"
        elif energy <= THRESHOLD_WARNING or len(signals) >= 2:
            alert = "warning"
        else:
            alert = "ok"

        # Primer avís de fatiga
        if alert != "ok" and fatigue_onset_ts is None:
            fatigue_onset_ts = ts_mid

        # Temps restant estimat al ritme actual
        if drain > 0:
            rem = energy / drain
        else:
            rem = None

        snapshots.append(EnergySnapshot(
            ts=ts_mid,
            energy_pct=round(energy, 1),
            drain_rate=round(drain, 3),
            fatigue_signals=signals,
            alert_level=alert,
            estimated_remaining_min=round(rem, 1) if rem is not None else None,
        ))

        i += step

    if not snapshots:
        snapshots.append(EnergySnapshot(
            ts=started_at, energy_pct=energy_start, drain_rate=0.0
        ))

    final_energy = snapshots[-1].energy_pct
    min_energy   = min(s.energy_pct for s in snapshots)
    max_drain    = max((s.drain_rate for s in snapshots if s.drain_rate > 0), default=0.0)
    peak_alerts  = [s.alert_level for s in snapshots]
    peak_alert: AlertLevel = (
        "urgent" if "urgent" in peak_alerts
        else "warning" if "warning" in peak_alerts
        else "ok"
    )

    return SessionEnergyReport(
        dog_id=dog_id,
        date=date,
        started_at=started_at,
        ended_at=readings["ts"].iloc[-1],
        snapshots=snapshots,
        final_energy_pct=final_energy,
        min_energy_pct=min_energy,
        max_drain_rate=round(max_drain, 3),
        fatigue_onset_ts=fatigue_onset_ts,
        peak_alert=peak_alert,
        breed_factor=bf,
        age_factor=af,
    )


# ── Integració amb daily_metrics ────────────────────────────

def energy_to_daily_fields(report: SessionEnergyReport) -> dict:
    """
    Extreu els camps per afegir a daily_metrics / walk_sessions.
    """
    return {
        "energy_start_pct":     100.0,
        "energy_end_pct":       report.final_energy_pct,
        "energy_min_pct":       report.min_energy_pct,
        "max_drain_rate":       report.max_drain_rate,
        "fatigue_onset_min":    (
            round((report.fatigue_onset_ts - report.started_at).total_seconds() / 60, 1)
            if report.fatigue_onset_ts else None
        ),
        "peak_alert":           report.peak_alert,
        "breed_factor":         report.breed_factor,
        "age_factor":           report.age_factor,
    }


# ── Alertes d'energia ────────────────────────────────────────

def generate_energy_alerts(
    dog_id: str,
    date: str,
    report: SessionEnergyReport,
) -> list[dict]:
    """
    Genera alertes basades en l'informe energètic.
    Retorna llista de dicts compatibles amb la taula `alerts`.
    """
    alerts = []

    if report.peak_alert == "urgent":
        alerts.append({
            "dog_id":     dog_id,
            "severity":   "urgent",
            "metric":     "energy_pct",
            "message":    (
                f"⚠️ Energia crítica durant la sortida ({report.min_energy_pct:.0f}%). "
                f"El gos ha mostrat senyals d'esgotament sever."
            ),
            "created_at": date,
            "is_read":    False,
        })
    elif report.peak_alert == "warning":
        alerts.append({
            "dog_id":     dog_id,
            "severity":   "warning",
            "metric":     "energy_pct",
            "message":    (
                f"Energia baixa detectada ({report.min_energy_pct:.0f}%). "
                f"Considera reduir la durada de les properes sortides."
            ),
            "created_at": date,
            "is_read":    False,
        })

    if report.fatigue_onset_ts:
        elapsed = (report.fatigue_onset_ts - report.started_at).total_seconds() / 60
        alerts.append({
            "dog_id":     dog_id,
            "severity":   "info",
            "metric":     "fatigue_onset",
            "message":    (
                f"Primers senyals de fatiga als {elapsed:.0f} min de la sortida. "
                f"El teu gos sol tenir energia per ~{elapsed:.0f} min a aquest ritme."
            ),
            "created_at": date,
            "is_read":    False,
        })

    return alerts
