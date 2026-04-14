"""
compute_bathroom.py — Detecció d'esdeveniments fisiològics (pipi/caca)
Ernest Pipeline v1.1 · Massiu Soft SL

Algorisme de detecció:
─────────────────────
Un "esdeveniment fisiològic" és una aturada breu de l'animal amb un patró
postural específic detectable per l'IMU de l'arnès dorsal.

PIPI:
  - Durada aturada: 15–90 s
  - En mascles: pic del giroscopi lateral (gyro_y o gyro_z) >30 °/s quan
    aixequen la pota posterior. Durada del pic: 2–5 s.
  - En femelles: lleugera flexió de grups (acc_z -0.05 a -0.15g vs baseline)
  - Context: normalment durant o just després d'una passejada

CACA:
  - Durada aturada: 30–120 s
  - Flexió dorsal pronunciada: acc_z disminueix -0.10 a -0.25g durant >10s
  - Possible moviment de cua o contractures: pics puntuals de gyro_x
  - posture_score: combina durada + flexió acc_z + context

CONFIANÇA:
  - Alta (>0.85): durada, postura i context coherents
  - Moderada (0.65–0.85): durada OK però postura no clara
  - Baixa (<0.65): només durada, postura ambigua → 'unknown'

ALERTES automàtiques:
  - pipi_count < P10(baseline) durant 2 dies consecutius → avís deshidratació
  - caca_count = 0 durant 2 dies consecutius → avís estrenyiment
  - caca_count > P90(baseline) → possible diarrea
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import List, Optional, Tuple
from datetime import datetime, timedelta


# ── Paràmetres ────────────────────────────────────────────────
# Aturada fisiològica
STILL_THRESHOLD   = 0.05   # g — magnitud per considerar quiet
MIN_PIPI_S        = 12     # s mínims per pipi
MAX_PIPI_S        = 95     # s màxims per pipi (si és més = caca o repòs)
MIN_CACA_S        = 28     # s mínims per caca
MAX_CACA_S        = 125    # s màxims per caca
MIN_STILL_CONF    = 0.65   # confiança mínima per reportar un event

# Senyal postural pipi (mascle: aixecar pota)
GYRO_LATERAL_MIN  = 25.0   # °/s — pic giroscopi lateral per detectar aixecar pota
GYRO_WINDOW_S     = 6      # s — finestra per buscar el pic

# Senyal postural caca (flexió dorsal)
ACC_Z_FLEX_DELTA  = -0.06  # g — caiguda acc_z per flexió
ACC_Z_FLEX_MIN_S  = 8      # s mínims de flexió sostinguda

SAMPLE_RATE_S     = 5      # s entre lectures


@dataclass
class BathroomEvent:
    dog_id:       str
    date:         str
    occurred_at:  datetime
    event_type:   str           # 'pipi', 'caca', 'unknown'
    duration_s:   float
    posture_score: float
    gyro_lateral: float
    acc_z_delta:  float
    confidence:   float
    walk_context: bool = False  # si va passar durant un passeig

    def to_dict(self) -> dict:
        return {
            'dog_id':       self.dog_id,
            'date':         self.date,
            'occurred_at':  self.occurred_at.isoformat(),
            'event_type':   self.event_type,
            'duration_s':   round(self.duration_s, 1),
            'posture_score':round(self.posture_score, 2),
            'gyro_lateral': round(self.gyro_lateral, 2),
            'acc_z_delta':  round(self.acc_z_delta, 3),
            'detection_confidence': round(self.confidence, 2),
        }


def compute_magnitude(df: pd.DataFrame) -> pd.Series:
    mag = np.sqrt(df['acc_x']**2 + df['acc_y']**2 + df['acc_z']**2) - 1.0
    return mag.clip(lower=0)


def detect_still_segments(
    df: pd.DataFrame,
    min_s: float,
    max_s: float,
) -> List[Tuple[int, int, float]]:
    """
    Troba segments on el gos està quiet (mag < STILL_THRESHOLD).
    Retorna llista de (idx_start, idx_end, duration_s).
    """
    mag  = compute_magnitude(df)
    still = (mag < STILL_THRESHOLD).values
    segs  = []

    i = 0
    while i < len(still):
        if still[i]:
            j = i
            while j < len(still) and still[j]:
                j += 1
            dur = (j - i) * SAMPLE_RATE_S
            if min_s <= dur <= max_s:
                segs.append((i, j - 1, dur))
            i = j
        else:
            i += 1
    return segs


def classify_event(
    seg: pd.DataFrame,
    duration_s: float,
) -> Tuple[str, float, float, float, float]:
    """
    Classifica un segment quiet com pipi, caca o unknown.
    Retorna (event_type, posture_score, gyro_lateral, acc_z_delta, confidence).
    """
    # 1. Pipi — buscar pic giroscopi lateral
    gyro_y_max = seg['gyro_y'].abs().max() if 'gyro_y' in seg.columns else 0.0
    gyro_z_max = seg['gyro_z'].abs().max() if 'gyro_z' in seg.columns else 0.0
    gyro_lateral = max(gyro_y_max, gyro_z_max)
    pipi_gyro_score = min(1.0, gyro_lateral / 50.0) if gyro_lateral > GYRO_LATERAL_MIN else 0.0

    # 2. Caca — buscar flexió dorsal sosticuda en acc_z
    acc_z_baseline = 1.0  # g — valor esperat en repòs normal
    acc_z_mean = seg['acc_z'].mean() if 'acc_z' in seg.columns else acc_z_baseline
    acc_z_delta = acc_z_mean - acc_z_baseline
    flex_sustained = (seg['acc_z'] < acc_z_baseline + ACC_Z_FLEX_DELTA).sum() * SAMPLE_RATE_S
    caca_flex_score = min(1.0, flex_sustained / (MIN_CACA_S * 0.5)) if acc_z_delta < ACC_Z_FLEX_DELTA else 0.0

    # Determinar tipus i scores
    if duration_s >= MIN_CACA_S and caca_flex_score > 0.3:
        # Candidat a caca
        posture_score = (caca_flex_score * 0.6 + min(1.0, duration_s / 90) * 0.4)
        confidence    = 0.55 + posture_score * 0.35
        event_type    = 'caca' if confidence >= MIN_STILL_CONF else 'unknown'

    elif duration_s <= MAX_PIPI_S and (pipi_gyro_score > 0.2 or duration_s >= MIN_PIPI_S):
        # Candidat a pipi
        dur_score     = min(1.0, (duration_s - MIN_PIPI_S) / (MAX_PIPI_S - MIN_PIPI_S))
        posture_score = pipi_gyro_score * 0.7 + dur_score * 0.3
        confidence    = 0.50 + posture_score * 0.40
        event_type    = 'pipi' if confidence >= MIN_STILL_CONF else 'unknown'

    else:
        posture_score = 0.3
        confidence    = 0.45
        event_type    = 'unknown'

    return event_type, posture_score, gyro_lateral, acc_z_delta, confidence


def detect_bathroom_events(
    dog_id: str,
    date: str,
    readings: pd.DataFrame,
    walk_periods: Optional[List[Tuple[datetime, datetime]]] = None,
) -> List[BathroomEvent]:
    """
    Detecta esdeveniments fisiològics (pipi/caca) a partir de lectures IMU.

    Args:
        dog_id:       UUID del gos
        date:         Data 'YYYY-MM-DD'
        readings:     DataFrame amb ts, acc_x, acc_y, acc_z, gyro_x, gyro_y, gyro_z
        walk_periods: Llista de (start, end) de sessions de passeig (opcional)

    Returns:
        Llista de BathroomEvent detectats
    """
    if readings.empty or len(readings) < 5:
        return []

    df = readings.copy()
    df['ts'] = pd.to_datetime(df['ts'])
    df = df.sort_values('ts').reset_index(drop=True)

    # Trobar segments quiet (longitud compatible amb pipi o caca)
    segs_pipi = detect_still_segments(df, MIN_PIPI_S, MAX_PIPI_S)
    segs_caca = detect_still_segments(df, MIN_CACA_S, MAX_CACA_S)

    # Combinar i deduplicar (caca inclou rangs de pipi)
    all_segs = list(set(segs_pipi + segs_caca))
    all_segs.sort(key=lambda x: x[0])

    events: List[BathroomEvent] = []
    used_idx = set()

    for (i_start, i_end, dur) in all_segs:
        # Evitar solapaments
        if any(i in used_idx for i in range(i_start, i_end + 1)):
            continue

        seg = df.iloc[i_start:i_end + 1]
        if seg.empty:
            continue

        event_type, posture, gyro_lat, acc_z_d, conf = classify_event(seg, dur)

        if conf < MIN_STILL_CONF:
            continue

        occurred_at = seg['ts'].iloc[len(seg)//2]  # timestamp del mig del segment

        # Context: durant un passeig?
        in_walk = False
        if walk_periods:
            in_walk = any(s <= occurred_at <= e for s, e in walk_periods)

        events.append(BathroomEvent(
            dog_id        = dog_id,
            date          = date,
            occurred_at   = occurred_at,
            event_type    = event_type,
            duration_s    = dur,
            posture_score = posture,
            gyro_lateral  = gyro_lat,
            acc_z_delta   = acc_z_d,
            confidence    = conf,
            walk_context  = in_walk,
        ))

        for idx in range(i_start, i_end + 1):
            used_idx.add(idx)

    return events


def compute_daily_bathroom_summary(events: List[BathroomEvent]) -> dict:
    """Resumeix els events fisiològics del dia per a daily_metrics."""
    pipi_count = sum(1 for e in events if e.event_type == 'pipi')
    caca_count = sum(1 for e in events if e.event_type == 'caca')
    return {'pipi_count': pipi_count, 'caca_count': caca_count}


def check_bathroom_alerts(
    dog_id: str,
    date: str,
    summary: dict,
    baseline: dict,      # {'pipi_count': {'p10':3,'p50':5,'p90':8}, 'caca_count': {...}}
    consecutive_days: int = 1,
) -> List[dict]:
    """
    Genera alertes si els comptadors s'allunyen del baseline individual.

    Args:
        summary:         {'pipi_count': N, 'caca_count': N}
        baseline:        percentils P10/P50/P90 per pipi i caca
        consecutive_days: dies consecutius fora de rang per activar avís

    Returns:
        Llista de dicts amb format d'alerta per inserir a la taula `alerts`
    """
    alerts = []
    pipi = summary.get('pipi_count', 0)
    caca = summary.get('caca_count', 0)

    # Baseline pipi
    if 'pipi_count' in baseline:
        b = baseline['pipi_count']
        p10, p50 = b.get('p10', 3), b.get('p50', 5)
        if pipi == 0:
            alerts.append({
                'dog_id':   dog_id, 'severity': 'urgent', 'metric': 'pipi_count',
                'message':  f'Cap episodi de micció detectat avui (baseline normal: {p50:.0f}/dia). '
                            f'Possible retenció urinària o deshidratació severa. Consulta el veterinari.',
            })
        elif pipi < p10:
            alerts.append({
                'dog_id':   dog_id, 'severity': 'warning', 'metric': 'pipi_count',
                'message':  f'Freqüència de micció baixa: {pipi} vegades (normal per a aquest gos: {p10:.0f}–{b.get("p90",8):.0f}/dia). '
                            f'Pot indicar deshidratació o problema renal.',
            })

    # Baseline caca
    if 'caca_count' in baseline:
        b = baseline['caca_count']
        p10, p50, p90 = b.get('p10',1), b.get('p50',2), b.get('p90',3)
        if caca == 0 and consecutive_days >= 2:
            alerts.append({
                'dog_id':   dog_id, 'severity': 'warning', 'metric': 'caca_count',
                'message':  f'Cap deposició detectada en {consecutive_days} dies (normal per a aquest gos: {p50:.0f}/dia). '
                            f'Possible estrenyiment. Revisa la ingesta d\'aigua i alimentació.',
            })
        elif caca > p90 * 1.5:
            alerts.append({
                'dog_id':   dog_id, 'severity': 'warning', 'metric': 'caca_count',
                'message':  f'Freqüència de deposicions elevada: {caca} vegades (normal: {p10:.0f}–{p90:.0f}/dia). '
                            f'Possible diarrea o irritació intestinal.',
            })

    return alerts


# ── Test ràpid ────────────────────────────────────────────────
if __name__ == '__main__':
    import json
    np.random.seed(99)

    # Simular un dia amb events fisiològics
    rows = []
    base_dt = datetime(2026, 4, 14, 6, 0, 0)

    # Horaris d'events simulats
    pipi_times = [
        (datetime(2026,4,14,8,12), 35),   # 35s, durant passejada
        (datetime(2026,4,14,10,30), 22),  # 22s
        (datetime(2026,4,14,13,5),  40),  # 40s
        (datetime(2026,4,14,16,20), 28),  # 28s
        (datetime(2026,4,14,20,10), 33),  # 33s
    ]
    caca_times = [
        (datetime(2026,4,14,8,30), 65),   # 65s, durant passejada
        (datetime(2026,4,14,19,45), 55),  # 55s
    ]

    def is_event(t, events):
        for start, dur in events:
            if start <= t <= start + timedelta(seconds=dur):
                return True, dur
        return False, 0

    t = datetime(2026,4,14,6,0)
    while t < datetime(2026,4,15,0,0):
        is_pipi, pdur = is_event(t, pipi_times)
        is_caca, cdur = is_event(t, caca_times)
        is_still = is_pipi or is_caca
        rows.append({
            'ts': t,
            'acc_x': np.random.normal(0, 0.02 if is_still else 0.25),
            'acc_y': np.random.normal(0, 0.02 if is_still else 0.25),
            'acc_z': np.random.normal(
                0.85 if is_caca else 1.0, 0.02 if is_still else 0.08
            ),
            'gyro_x': np.random.normal(0, 0.5 if is_still else 8),
            'gyro_y': np.random.normal(35 if is_pipi else 0, 3 if is_pipi else 1),
            'gyro_z': np.random.normal(0, 0.5 if is_still else 5),
        })
        t += timedelta(seconds=SAMPLE_RATE_S)

    df = pd.DataFrame(rows)
    events = detect_bathroom_events('test-dog', '2026-04-14', df)
    summary = compute_daily_bathroom_summary(events)

    print(f"Events detectats: {len(events)}")
    for e in events:
        print(f"  {e.occurred_at.strftime('%H:%M')} — {e.event_type:7s} "
              f"dur:{e.duration_s:.0f}s conf:{e.confidence:.2f} postura:{e.posture_score:.2f}")
    print("Resum diari:", json.dumps(summary, ensure_ascii=False))

    # Alertes
    baseline_ex = {
        'pipi_count': {'p10':3,'p50':5,'p90':8},
        'caca_count': {'p10':1,'p50':2,'p90':3},
    }
    alerts = check_bathroom_alerts('test-dog', '2026-04-14', summary, baseline_ex)
    print(f"\nAlertes generades: {len(alerts)}")
    for a in alerts: print(f"  [{a['severity'].upper()}] {a['message'][:80]}...")
