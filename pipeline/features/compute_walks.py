"""
compute_walks.py — Detecció de sessions de passeig i anàlisi de moviment
Ernest Pipeline v1.1 · Massiu Soft SL

Algorisme:
  1. Calcular magnitud IMU per lectura: mag = sqrt(ax²+ay²+az²) - 1g
  2. Suavitzar amb mitjana mòbil (finestra 10s = 2 lectures)
  3. Classificar cada lectura com ACTIVA (mag > WALK_THRESHOLD) o QUIETA
  4. Agrupar seqüències actives contigües en sessions potencials
  5. Filtrar per durada mínima (MIN_WALK_MIN) i eliminar falsos positius
  6. Per cada sessió: calcular durada, passes, distància, simetria, velocitat

Detecció de passes (step detection):
  - Pics de acc_z normalitzats: pic >1.3σ per sobre la mitja
  - Filtre de refractori: mínim 0.3s entre pics (evita doble comptar)
  - Longitud de pas estimada: 0.4 × sqrt(height_m) (Grieve & Gear 1966)
  - Height estimada des de raça i pes si no disponible
"""

import math
import numpy as np
import pandas as pd
from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime, timedelta


# ── Paràmetres ────────────────────────────────────────────────
WALK_THRESHOLD   = 0.12   # g — llindar activitat per considerar moviment
MIN_WALK_MIN     = 3.0    # minuts mínims per comptar com a passeig
MAX_GAP_S        = 60     # s — màxima pausa dins una sessió (gos s'atura breu)
SMOOTH_WINDOW    = 5      # lectures per suavitzar (≈25s a 5s/lectura)
STEP_Z_SIGMA     = 1.2    # σ per sobre la mitja per detectar pas
STEP_REFRACTORY  = 0.3    # s mínim entre passes
SAMPLE_RATE_S    = 5      # s entre lectures (1 paquet = 50 lectures a 10Hz)

# Longitud de pas per pes (cm) — aproximació empírica
def stride_length_m(weight_kg: float) -> float:
    """Longitud de pas estimada en metres a partir del pes del gos."""
    # Petits (<10kg): ~0.25m, Mitja (10-25kg): ~0.40m, Grans (>25kg): ~0.55m
    if weight_kg < 10:  return 0.25
    if weight_kg < 25:  return 0.40
    return 0.55


@dataclass
class WalkSession:
    dog_id:       str
    date:         str
    started_at:   datetime
    ended_at:     datetime
    duration_min: float
    distance_m:   float
    steps:        int
    avg_pace_kmh: float
    avg_symmetry: float
    avg_activity: float
    confidence:   float = 1.0

    def to_dict(self) -> dict:
        return {
            'dog_id':       self.dog_id,
            'date':         self.date,
            'started_at':   self.started_at.isoformat(),
            'ended_at':     self.ended_at.isoformat(),
            'duration_min': round(self.duration_min, 1),
            'distance_m':   round(self.distance_m, 0),
            'steps':        self.steps,
            'avg_pace_kmh': round(self.avg_pace_kmh, 2),
            'avg_symmetry': round(self.avg_symmetry, 1),
            'avg_activity': round(self.avg_activity, 3),
            'detection_confidence': round(self.confidence, 2),
        }


def compute_magnitude(df: pd.DataFrame) -> pd.Series:
    """Magnitud vectorial de l'acceleració menys la gravetat."""
    mag = np.sqrt(df['acc_x']**2 + df['acc_y']**2 + df['acc_z']**2) - 1.0
    return mag.clip(lower=0)


def smooth(series: pd.Series, window: int) -> pd.Series:
    """Mitjana mòbil centrada."""
    return series.rolling(window=window, center=True, min_periods=1).mean()


def detect_steps(acc_z: pd.Series, timestamps: pd.Series) -> int:
    """
    Detecta passes a partir de pics de acc_z.
    Retorna el nombre de passes estimades.
    """
    z = acc_z.values
    mean_z = np.mean(z)
    std_z  = np.std(z)
    threshold = mean_z + STEP_Z_SIGMA * std_z

    steps = 0
    last_step_ts = -np.inf
    ts_vals = timestamps.values

    for i in range(1, len(z) - 1):
        if z[i] > threshold and z[i] > z[i-1] and z[i] >= z[i+1]:
            t = ts_vals[i].astype('int64') / 1e9  # ns → s
            if t - last_step_ts >= STEP_REFRACTORY:
                steps += 1
                last_step_ts = t

    return steps


def detect_walks(
    dog_id: str,
    date: str,
    readings: pd.DataFrame,
    weight_kg: float = 20.0,
) -> List[WalkSession]:
    """
    Detecta sessions de passeig a partir de les lectures IMU d'un dia.

    Args:
        dog_id:    UUID del gos
        date:      Data en format 'YYYY-MM-DD'
        readings:  DataFrame amb columnes: ts, acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z
        weight_kg: Pes del gos per estimar longitud de pas

    Returns:
        Llista de WalkSession detectades
    """
    if readings.empty or len(readings) < 10:
        return []

    df = readings.copy()
    df['ts'] = pd.to_datetime(df['ts'])
    df = df.sort_values('ts').reset_index(drop=True)

    # Magnitud i suavitzat
    df['mag']        = compute_magnitude(df)
    df['mag_smooth'] = smooth(df['mag'], SMOOTH_WINDOW)
    df['is_active']  = df['mag_smooth'] > WALK_THRESHOLD

    # Simetria per lectura: |std(acc_x) - std(acc_y)| normalitzat
    # (calculem en finestres de 30s = ~6 lectures)
    window_asym = 6
    df['sym_raw'] = (
        df['acc_x'].rolling(window_asym, min_periods=2).std() -
        df['acc_y'].rolling(window_asym, min_periods=2).std()
    ).abs()
    max_asym = df['sym_raw'].max() or 1.0
    df['sym'] = (1 - df['sym_raw'] / max_asym) * 100  # 0-100

    # Agrupar en sessions: seqüències actives amb pauses < MAX_GAP_S
    sessions: List[WalkSession] = []
    in_session  = False
    sess_start  = None
    sess_end    = None
    gap_counter = 0

    for i, row in df.iterrows():
        if row['is_active']:
            if not in_session:
                in_session = True
                sess_start = i
            sess_end    = i
            gap_counter = 0
        else:
            if in_session:
                gap_counter += SAMPLE_RATE_S
                if gap_counter > MAX_GAP_S:
                    # Tancar sessió actual
                    seg = df.loc[sess_start:sess_end]
                    session = _build_session(dog_id, date, seg, weight_kg)
                    if session:
                        sessions.append(session)
                    in_session  = False
                    sess_start  = None
                    gap_counter = 0

    # Tancar última sessió si estava oberta
    if in_session and sess_start is not None:
        seg = df.loc[sess_start:sess_end]
        session = _build_session(dog_id, date, seg, weight_kg)
        if session:
            sessions.append(session)

    return sessions


def _build_session(
    dog_id: str,
    date: str,
    seg: pd.DataFrame,
    weight_kg: float,
) -> Optional[WalkSession]:
    """Construeix un WalkSession a partir d'un segment de dades."""
    if seg.empty:
        return None

    started_at   = seg['ts'].iloc[0]
    ended_at     = seg['ts'].iloc[-1]
    duration_min = (ended_at - started_at).total_seconds() / 60

    if duration_min < MIN_WALK_MIN:
        return None  # massa curt, no compta com a passeig

    # Passes i distància
    steps    = detect_steps(seg['acc_z'], seg['ts'])
    stride   = stride_length_m(weight_kg)
    dist_m   = steps * stride

    # Velocitat (km/h)
    pace_kmh = (dist_m / 1000) / (duration_min / 60) if duration_min > 0 else 0

    # Simetria mitja
    avg_sym  = seg['sym'].mean() if 'sym' in seg.columns else 90.0

    # Activitat mitja
    avg_act  = seg['mag'].mean()

    # Confiança: major si durada llarga i activitat consistent
    conf = min(1.0, 0.5 + duration_min/60 * 0.3 + avg_act * 0.5)

    return WalkSession(
        dog_id       = dog_id,
        date         = date,
        started_at   = started_at,
        ended_at     = ended_at,
        duration_min = duration_min,
        distance_m   = dist_m,
        steps        = steps,
        avg_pace_kmh = pace_kmh,
        avg_symmetry = avg_sym,
        avg_activity = avg_act,
        confidence   = conf,
    )


def compute_daily_walk_summary(walks: List[WalkSession]) -> dict:
    """Resumeix les sessions de passeig del dia per a daily_metrics."""
    if not walks:
        return {'walk_count': 0, 'walk_total_min': 0.0, 'walk_total_m': 0.0, 'steps_total': 0}
    return {
        'walk_count':     len(walks),
        'walk_total_min': round(sum(w.duration_min for w in walks), 1),
        'walk_total_m':   round(sum(w.distance_m   for w in walks), 0),
        'steps_total':    sum(w.steps for w in walks),
    }


# ── Test ràpid ────────────────────────────────────────────────
if __name__ == '__main__':
    import json

    # Simular un dia amb 3 passejades (matí, migdia, tarda)
    np.random.seed(42)
    rows = []
    base = datetime(2026, 4, 14, 7, 0, 0)

    # Passejada 1: 8:00-8:25 (25min)
    walk_intervals = [
        (datetime(2026,4,14,8,0),  datetime(2026,4,14,8,25)),
        (datetime(2026,4,14,13,0), datetime(2026,4,14,13,12)),
        (datetime(2026,4,14,19,30),datetime(2026,4,14,19,50)),
    ]
    t = datetime(2026,4,14,6,0)
    while t < datetime(2026,4,15,0,0):
        is_walk = any(s <= t <= e for s,e in walk_intervals)
        mag = np.random.uniform(0.2,0.6) if is_walk else np.random.uniform(0.0,0.08)
        rows.append({
            'ts': t, 'dog_id': 'test-dog',
            'acc_x': np.random.normal(0,    0.1 if not is_walk else 0.3),
            'acc_y': np.random.normal(0,    0.1 if not is_walk else 0.3),
            'acc_z': np.random.normal(1.0 + (mag if is_walk else 0), 0.05),
            'gyro_x': np.random.normal(0, 5 if is_walk else 0.5),
            'gyro_y': np.random.normal(0, 5 if is_walk else 0.5),
            'gyro_z': np.random.normal(0, 3 if is_walk else 0.5),
        })
        t += timedelta(seconds=SAMPLE_RATE_S)

    df = pd.DataFrame(rows)
    walks = detect_walks('test-dog', '2026-04-14', df, weight_kg=28.0)
    print(f"Sessions detectades: {len(walks)}")
    for w in walks:
        print(f"  {w.started_at.strftime('%H:%M')} → {w.ended_at.strftime('%H:%M')}"
              f"  {w.duration_min:.0f}min  {w.distance_m:.0f}m  {w.steps} passes"
              f"  {w.avg_pace_kmh:.1f}km/h  sim:{w.avg_symmetry:.0f}")
    print("Resum diari:", json.dumps(compute_daily_walk_summary(walks), ensure_ascii=False))
