"""
compute_baseline.py — Càlcul del baseline individual per a cada gos
Massiu Soft SL

El baseline és la "normalitat" de cada gos individual, calculada
amb una rolling window dels últims N dies. Cada gos es compara
sempre amb ell mateix, mai amb valors poblacionals genèrics.

Executar: python -m pipeline.baseline.compute_baseline --dog_id <uuid>
"""
import argparse
import logging
from datetime import date, timedelta
import numpy as np
import pandas as pd
from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Mètriques sobre les que calculem baseline
BASELINE_METRICS = [
    "activity_index",
    "rest_hours",
    "rest_fragmentation",
    "symmetry_index",
    "avg_temp",
]

WINDOW_DAYS     = 30   # Finestra rolling
MIN_DAYS_NEEDED = 7    # Mínim de dies per generar un baseline vàlid


def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_daily_metrics(dog_id: str, window_days: int = WINDOW_DAYS) -> pd.DataFrame:
    """Obté les mètriques diàries dels últims N dies."""
    sb = get_supabase()
    from_date = (date.today() - timedelta(days=window_days)).isoformat()

    resp = sb.table("daily_metrics") \
        .select(",".join(["date"] + BASELINE_METRICS)) \
        .eq("dog_id", dog_id) \
        .gte("date", from_date) \
        .order("date") \
        .execute()

    if not resp.data:
        return pd.DataFrame()

    return pd.DataFrame(resp.data)


def compute_baseline_for_dog(dog_id: str, window_days: int = WINDOW_DAYS) -> list[dict]:
    """
    Computa els percentils P10/P50/P90 i la desviació estàndard
    per a cada mètrica del gos en la finestra de N dies.

    Retorna una llista de dicts (un per mètrica) llests per a upsert.
    """
    df = fetch_daily_metrics(dog_id, window_days)

    if df.empty:
        logger.warning(f"Sense dades per calcular baseline de dog_id={dog_id}")
        return []

    n_days = len(df)
    if n_days < MIN_DAYS_NEEDED:
        logger.info(f"dog_id={dog_id}: només {n_days} dies — mínim {MIN_DAYS_NEEDED} per generar baseline")
        return []

    results = []
    for metric in BASELINE_METRICS:
        if metric not in df.columns:
            continue
        values = df[metric].dropna()
        if len(values) < MIN_DAYS_NEEDED:
            continue

        baseline = {
            "dog_id":          dog_id,
            "metric":          metric,
            "p10":             float(np.percentile(values, 10)),
            "p50":             float(np.percentile(values, 50)),
            "p90":             float(np.percentile(values, 90)),
            "std_dev":         float(values.std()),
            "window_days":     window_days,
            "n_observations":  int(len(values)),
        }
        results.append(baseline)
        logger.info(
            f"Baseline {metric}: dog={dog_id} "
            f"p10={baseline['p10']:.2f} p50={baseline['p50']:.2f} p90={baseline['p90']:.2f}"
        )

    return results


def save_baselines(baselines: list[dict]) -> bool:
    if not baselines:
        return False
    sb = get_supabase()
    resp = sb.table("baselines") \
        .upsert(baselines, on_conflict="dog_id,metric") \
        .execute()
    return len(resp.data) > 0


def run(dog_id: str):
    baselines = compute_baseline_for_dog(dog_id)
    if baselines:
        ok = save_baselines(baselines)
        logger.info(f"Baselines guardats ({len(baselines)} mètriques): {ok}")
    return baselines


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Computa baseline individual Ernest")
    parser.add_argument("--dog_id", required=True)
    args = parser.parse_args()
    run(args.dog_id)
