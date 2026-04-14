"""
detect_anomalies.py — Detecció d'anomalies i generació d'alertes
Massiu Soft SL

Compara les mètriques del dia actual amb el baseline del gos.
Genera alertes a la taula 'alerts' si hi ha desviacions significatives.

Regles v1.0 (estadística simple):
- Warning: mètrica fora del rang [p10, p90] del baseline
- Urgent:  mètrica fora de [p50 ± 3*std_dev] O múltiples warnings simultàniament
"""
import argparse
import logging
from datetime import date
from typing import Optional
from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Configuració de llindars
WARN_CONSECUTIVE_DAYS  = 2    # Alerta si la desviació dura N dies seguits
URGENT_STD_MULTIPLIER  = 3.0  # Urgent si > p50 ± N*std_dev
MULTI_WARN_THRESHOLD   = 3    # Urgent si N+ mètriques en warning simultàniament

# Missatges d'alerta per mètrica
ALERT_MESSAGES = {
    "activity_index": {
        "low":  "L'activitat d'avui és significativament menor que el normal. Pot indicar malestar o cansament.",
        "high": "L'activitat d'avui és inusual·lament alta. Comprova que el gos no estigui estressat."
    },
    "rest_hours": {
        "low":  "El gos ha descansat menys del que és habitual en ell.",
        "high": "El gos ha dormit molt més del normal. Pot indicar letargia."
    },
    "rest_fragmentation": {
        "high": "El son del gos ha estat molt fragmentat. Possible discomfort o dolor nocturn."
    },
    "symmetry_index": {
        "low":  "S'ha detectat una possible asimetria en la marxa. Podria indicar coixesa incipient."
    },
    "avg_temp": {
        "high": "La temperatura superficial és superior a la normal. Possible febre o inflamació local.",
        "low":  "La temperatura superficial és inferior a la normal."
    }
}


def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_today_metrics(dog_id: str, target_date: date) -> Optional[dict]:
    sb = get_supabase()
    resp = sb.table("daily_metrics") \
        .select("*") \
        .eq("dog_id", dog_id) \
        .eq("date", target_date.isoformat()) \
        .single() \
        .execute()
    return resp.data


def fetch_baselines(dog_id: str) -> dict:
    """Retorna un dict {metric: baseline_dict}."""
    sb = get_supabase()
    resp = sb.table("baselines") \
        .select("*") \
        .eq("dog_id", dog_id) \
        .execute()
    return {row["metric"]: row for row in (resp.data or [])}


def evaluate_metric(metric: str, value: float, baseline: dict) -> Optional[dict]:
    """
    Avalua si un valor és anòmal respecte al seu baseline.
    Retorna un dict d'alerta o None si és normal.
    """
    if not baseline or value is None:
        return None

    p10, p50, p90 = baseline["p10"], baseline["p50"], baseline["p90"]
    std_dev = baseline.get("std_dev", 0) or 0

    is_low  = value < p10
    is_high = value > p90
    is_urgent = (
        std_dev > 0 and
        abs(value - p50) > URGENT_STD_MULTIPLIER * std_dev
    )

    if not (is_low or is_high):
        return None  # Dins del rang normal

    direction = "low" if is_low else "high"
    msg_map = ALERT_MESSAGES.get(metric, {})
    message = msg_map.get(direction, f"{metric} fora del rang normal ({direction})")

    severity = "urgent" if is_urgent else "warning"
    return {
        "metric":   metric,
        "severity": severity,
        "message":  message,
        "detail": {
            "value":    round(value, 2),
            "p10":      round(p10, 2),
            "p50":      round(p50, 2),
            "p90":      round(p90, 2),
            "direction": direction
        }
    }


def run(dog_id: str, target_date: date):
    """Detecta anomalies i genera alertes per a un gos i data."""
    metrics  = fetch_today_metrics(dog_id, target_date)
    if not metrics:
        logger.warning(f"Sense mètriques per dog_id={dog_id} date={target_date}")
        return []

    baselines = fetch_baselines(dog_id)
    if not baselines:
        logger.info(f"Sense baseline per dog_id={dog_id} — no es detecten anomalies")
        return []

    alerts_to_create = []
    for metric, baseline in baselines.items():
        value = metrics.get(metric)
        if value is None:
            continue
        alert = evaluate_metric(metric, value, baseline)
        if alert:
            alerts_to_create.append(alert)
            logger.info(f"Anomalia detectada: dog={dog_id} metric={metric} severity={alert['severity']}")

    # Escalat: si hi ha N+ warnings simultanis → urgent
    if len(alerts_to_create) >= MULTI_WARN_THRESHOLD:
        for a in alerts_to_create:
            a["severity"] = "urgent"
        logger.warning(f"Múltiples anomalies ({len(alerts_to_create)}) → escalat a URGENT")

    # Guardar alertes a la BD
    if alerts_to_create:
        sb = get_supabase()
        rows = [{"dog_id": dog_id, **a} for a in alerts_to_create]
        sb.table("alerts").insert(rows).execute()
        logger.info(f"{len(rows)} alertes creades per dog_id={dog_id}")

    # Actualitzar anomaly_score a daily_metrics
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
    parser = argparse.ArgumentParser(description="Detecta anomalies Ernest")
    parser.add_argument("--dog_id", required=True)
    parser.add_argument("--date",   default=date.today().isoformat())
    args = parser.parse_args()
    run(args.dog_id, date.fromisoformat(args.date))
