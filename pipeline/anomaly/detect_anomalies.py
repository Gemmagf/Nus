"""
detect_anomalies.py — Detecció d'anomalies i generació d'alertes
Massiu Soft SL · v1.1

Millores v1.1 (fix falsos positius):
- Filtre de CONSECUTIVE_DAYS: una mètrica ha d'estar fora del rang N dies
  consecutius abans de generar warning (excepte urgent, que és immediat).
- MIN_RANGE_RATIO: ignora la mètrica si el rang P10-P90 és < X% del P50
  (evita alertes en mètriques amb variació quasi nul·la com rest_fragmentation).
- Deduplicació: no crea alertes duplicades si ja n'hi ha una d'activa (no llegida)
  per la mateixa mètrica en els últims N dies.
"""
import argparse
import logging
from datetime import date, timedelta
from typing import Optional
from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# ── Configuració v1.1 ────────────────────────────────────────
CONSECUTIVE_DAYS      = 2      # Dies consecutius fora de rang per generar warning
URGENT_STD_MULTIPLIER = 3.0   # Urgent immediat si > p50 ± N*std_dev
MULTI_WARN_THRESHOLD  = 3     # Urgent si N+ mètriques simultànies en warning
MIN_RANGE_RATIO       = 0.05  # Ignora si rang (p90-p10)/p50 < 5% (rang massa estret)
DEDUP_DAYS            = 3     # No duplicar alerta si ja n'hi ha una activa en N dies

# ── Missatges d'alerta ───────────────────────────────────────
ALERT_MESSAGES = {
    "activity_index": {
        "low":  "L'activitat ha estat baixa durant diversos dies. Pot indicar malestar o cansament.",
        "high": "L'activitat ha estat inusual·lament alta. Comprova que el gos no estigui estressat."
    },
    "rest_hours": {
        "low":  "El gos ha descansat menys del que és habitual en ell durant diversos dies.",
        "high": "El gos ha dormit molt més del normal durant diversos dies. Possible letargia."
    },
    "rest_fragmentation": {
        "high": "El son del gos ha estat molt fragmentat durant diverses nits. Possible discomfort."
    },
    "symmetry_index": {
        "low":  "S'ha detectat una asimetria persistent en la marxa. Possible coixesa incipient."
    },
    "avg_temp": {
        "high": "La temperatura superficial és elevada. Possible febre o inflamació local.",
        "low":  "La temperatura superficial és baixa respecte al normal."
    }
}


def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_recent_metrics(dog_id: str, target_date: date, n_days: int) -> list[dict]:
    """Obté les mètriques dels últims N dies (inclòs el dia actual)."""
    sb = get_supabase()
    from_date = (target_date - timedelta(days=n_days - 1)).isoformat()
    resp = sb.table("daily_metrics") \
        .select("*") \
        .eq("dog_id", dog_id) \
        .gte("date", from_date) \
        .lte("date", target_date.isoformat()) \
        .order("date") \
        .execute()
    return resp.data or []


def fetch_baselines(dog_id: str) -> dict:
    sb = get_supabase()
    resp = sb.table("baselines").select("*").eq("dog_id", dog_id).execute()
    return {row["metric"]: row for row in (resp.data or [])}


def fetch_active_alerts(dog_id: str, target_date: date) -> set[str]:
    """Retorna el conjunt de mètriques amb alerta activa (no llegida) en els últims DEDUP_DAYS."""
    sb = get_supabase()
    from_date = (target_date - timedelta(days=DEDUP_DAYS)).isoformat()
    resp = sb.table("alerts") \
        .select("metric") \
        .eq("dog_id", dog_id) \
        .eq("is_read", False) \
        .gte("created_at", from_date) \
        .execute()
    return {row["metric"] for row in (resp.data or [])}


def is_range_meaningful(baseline: dict) -> bool:
    """Comprova que el rang P10-P90 és prou ampli per tenir significança."""
    p10, p50, p90 = baseline.get("p10", 0), baseline.get("p50", 1), baseline.get("p90", 0)
    if p50 == 0:
        return False
    range_ratio = (p90 - p10) / abs(p50)
    return range_ratio >= MIN_RANGE_RATIO


def evaluate_metric(metric: str, value: float, baseline: dict) -> Optional[dict]:
    """
    Avalua si un valor és anòmal. Retorna dict o None.
    Urgent: desviació > 3σ del P50 → alerta immediata sense filtre de dies.
    Warning: fora de P10-P90 → requereix validació de dies consecutius.
    """
    if not baseline or value is None:
        return None
    if not is_range_meaningful(baseline):
        return None   # rang massa estret → ignorem per evitar FP

    p10  = baseline["p10"]
    p50  = baseline["p50"]
    p90  = baseline["p90"]
    std  = baseline.get("std_dev", 0) or 0

    is_low  = value < p10
    is_high = value > p90
    if not (is_low or is_high):
        return None

    is_urgent = std > 0 and abs(value - p50) > URGENT_STD_MULTIPLIER * std
    direction = "low" if is_low else "high"
    msg = ALERT_MESSAGES.get(metric, {}).get(direction, f"{metric} fora del rang ({direction})")

    return {
        "metric":    metric,
        "severity":  "urgent" if is_urgent else "warning",
        "message":   msg,
        "is_urgent": is_urgent,
        "detail": {
            "value":     round(value, 2),
            "p10":       round(p10, 2),
            "p50":       round(p50, 2),
            "p90":       round(p90, 2),
            "direction": direction
        }
    }


def check_consecutive(metric: str, direction: str,
                       recent_metrics: list[dict], baseline: dict,
                       n_days: int) -> bool:
    """
    Comprova si la mètrica ha estat fora del rang en els N dies anteriors.
    Retorna True si s'han acumulat N dies consecutius.
    """
    if len(recent_metrics) < n_days:
        return False
    p10, p90 = baseline["p10"], baseline["p90"]
    count = 0
    for row in reversed(recent_metrics[-n_days:]):
        v = row.get(metric)
        if v is None:
            break
        if direction == "low"  and v < p10: count += 1
        elif direction == "high" and v > p90: count += 1
        else: break
    return count >= n_days


def run(dog_id: str, target_date: date):
    """Detecta anomalies i genera alertes per a un gos i data."""
    recent = fetch_recent_metrics(dog_id, target_date, n_days=max(CONSECUTIVE_DAYS + 1, DEDUP_DAYS + 1))
    if not recent:
        logger.warning(f"Sense mètriques per dog_id={dog_id} date={target_date}")
        return []

    today_metrics = next((r for r in recent if r["date"] == target_date.isoformat()), None)
    if not today_metrics:
        return []

    baselines     = fetch_baselines(dog_id)
    active_alerts = fetch_active_alerts(dog_id, target_date)
    if not baselines:
        return []

    alerts_to_create = []

    for metric, baseline in baselines.items():
        value = today_metrics.get(metric)
        if value is None:
            continue

        candidate = evaluate_metric(metric, value, baseline)
        if not candidate:
            continue

        # ── Urgent: alerta immediata, sense filtre de dies ──
        if candidate["is_urgent"]:
            alerts_to_create.append(candidate)
            logger.warning(f"URGENT dog={dog_id} {metric}={value:.2f}")
            continue

        # ── Warning: requereix N dies consecutius ────────────
        direction = candidate["detail"]["direction"]
        if not check_consecutive(metric, direction, recent, baseline, CONSECUTIVE_DAYS):
            logger.debug(f"Ignorat (dies insuficients): dog={dog_id} {metric}")
            continue

        # ── Deduplicació: no repetir si ja hi ha alerta activa ─
        if metric in active_alerts:
            logger.debug(f"Deduplicat: dog={dog_id} {metric} ja té alerta activa")
            continue

        alerts_to_create.append(candidate)
        logger.info(f"Warning dog={dog_id} {metric}={value:.2f} ({direction}) {CONSECUTIVE_DAYS} dies consecutius")

    # Escalat multi-mètrica
    if len(alerts_to_create) >= MULTI_WARN_THRESHOLD:
        for a in alerts_to_create:
            a["severity"] = "urgent"
        logger.warning(f"Multi-warning escalat a URGENT: dog={dog_id} ({len(alerts_to_create)} mètriques)")

    # Guardar a BD
    if alerts_to_create:
        sb = get_supabase()
        clean = [{k: v for k, v in a.items() if k != "is_urgent"} for a in alerts_to_create]
        rows = [{"dog_id": dog_id, **a} for a in clean]
        sb.table("alerts").insert(rows).execute()

    # Actualitzar anomaly_score
    anomaly_score = min(len(alerts_to_create) / 5.0, 1.0)
    sb = get_supabase()
    sb.table("daily_metrics") \
        .update({"anomaly_score": round(anomaly_score, 3)}) \
        .eq("dog_id", dog_id) \
        .eq("date", target_date.isoformat()) \
        .execute()

    return alerts_to_create


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--dog_id", required=True)
    parser.add_argument("--date",   default=date.today().isoformat())
    args = parser.parse_args()
    run(args.dog_id, date.fromisoformat(args.date))
