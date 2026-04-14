"""
compute_daily.py — Càlcul de mètriques diàries per a cada gos
Massiu Soft SL

Agafa les lectures brutes de sensor_readings per a una data i gos,
i genera una fila a daily_metrics.

Executar: python -m pipeline.features.compute_daily --dog_id <uuid> --date 2025-04-14
"""
import argparse
import logging
from datetime import date, datetime, timedelta
from typing import Optional
import numpy as np
import pandas as pd
from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")


def get_supabase():
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_readings(dog_id: str, target_date: date) -> pd.DataFrame:
    """Obté les lectures brutes d'un dia per a un gos."""
    sb = get_supabase()
    start = datetime.combine(target_date, datetime.min.time()).isoformat()
    end   = datetime.combine(target_date + timedelta(days=1), datetime.min.time()).isoformat()

    resp = sb.table("sensor_readings") \
        .select("ts,acc_x,acc_y,acc_z,gyro_x,gyro_y,gyro_z,temp_surface,battery_pct") \
        .eq("dog_id", dog_id) \
        .gte("ts", start) \
        .lt("ts", end) \
        .order("ts") \
        .execute()

    if not resp.data:
        return pd.DataFrame()

    df = pd.DataFrame(resp.data)
    df["ts"] = pd.to_datetime(df["ts"], utc=True)
    return df


def compute_activity_index(df: pd.DataFrame) -> float:
    """
    Índex d'activitat (0–100) basat en la magnitud del vector acceleració.
    0 = completament quiet, 100 = activitat màxima.
    """
    if df.empty:
        return 0.0
    # Magnitud del vector IMU sense gravetat
    mag = np.sqrt(df["acc_x"]**2 + df["acc_y"]**2 + df["acc_z"]**2) - 1.0
    mag = mag.clip(lower=0)
    # Normalitzar a 0-100 (threshold empíric: >0.5g = activitat plena)
    raw = mag.mean() / 0.5
    return float(min(raw * 100, 100.0))


def compute_rest_metrics(df: pd.DataFrame) -> tuple[float, float]:
    """
    Retorna (rest_hours, rest_fragmentation).
    rest_hours: hores en que l'activitat és < llindar de repòs.
    rest_fragmentation: proporció de transicions repòs↔activitat (0=molt tranquil, 1=molt fragmentat).
    """
    if df.empty:
        return 0.0, 0.0

    REST_THRESHOLD_G = 0.05  # < 0.05g = en repòs
    mag = np.sqrt(df["acc_x"]**2 + df["acc_y"]**2 + df["acc_z"]**2) - 1.0
    mag = mag.clip(lower=0)

    is_rest = mag < REST_THRESHOLD_G

    # Hores de repòs (assumint interval ~5s entre lectures)
    sample_interval_s = 5.0
    rest_seconds = is_rest.sum() * sample_interval_s
    rest_hours = rest_seconds / 3600.0

    # Fragmentació: nombre de transicions / nombre total de lectures
    transitions = (is_rest.diff() != 0).sum()
    fragmentation = float(transitions / max(len(is_rest), 1))

    return float(rest_hours), float(fragmentation)


def compute_symmetry_index(df: pd.DataFrame) -> float:
    """
    Índex de simetria de marxa (0–100).
    Compara l'asimetria entre eixos laterals de l'acceleròmetre.
    100 = perfecta simetria, <85 = possible coixesa.
    Nota: estimació preliminar; caldrà validar amb dades reals.
    """
    if df.empty or len(df) < 10:
        return 100.0

    # Asymmetry ratio basat en desviació estàndard acc_x vs acc_y
    std_x = df["acc_x"].std()
    std_y = df["acc_y"].std()
    if std_x + std_y < 0.001:
        return 100.0  # Sense moviment

    asymmetry = abs(std_x - std_y) / (std_x + std_y)
    # Convertir a escala 0-100 (0% asimetria → 100, 50% → 0)
    symmetry = max(0.0, 100.0 - (asymmetry * 200.0))
    return float(symmetry)


def compute_metrics(dog_id: str, target_date: date) -> Optional[dict]:
    """
    Computa totes les mètriques diàries per a un gos i data.
    Retorna un dict llest per inserir a daily_metrics.
    """
    df = fetch_readings(dog_id, target_date)

    if df.empty:
        logger.warning(f"Sense dades per dog_id={dog_id} date={target_date}")
        return None

    activity_index   = compute_activity_index(df)
    rest_hours, frag = compute_rest_metrics(df)
    symmetry_index   = compute_symmetry_index(df)
    avg_temp         = float(df["temp_surface"].mean()) if "temp_surface" in df else None
    # Estimació crua de passos (acceleració > 0.2g = 1 pas cada ~500ms)
    mag = np.sqrt(df["acc_x"]**2 + df["acc_y"]**2 + df["acc_z"]**2) - 1.0
    steps_estimated  = int((mag > 0.2).sum() * 0.5)

    result = {
        "dog_id":              dog_id,
        "date":                target_date.isoformat(),
        "activity_index":      round(activity_index, 2),
        "rest_hours":          round(rest_hours, 2),
        "rest_fragmentation":  round(frag, 4),
        "symmetry_index":      round(symmetry_index, 2),
        "avg_temp":            round(avg_temp, 2) if avg_temp else None,
        "steps_estimated":     steps_estimated,
        "pipeline_version":    "1.0"
    }

    logger.info(f"Mètriques calculades: dog={dog_id} date={target_date} activity={activity_index:.1f}")
    return result


def save_metrics(metrics: dict) -> bool:
    """Insereix o actualitza les mètriques a daily_metrics."""
    sb = get_supabase()
    resp = sb.table("daily_metrics") \
        .upsert(metrics, on_conflict="dog_id,date") \
        .execute()
    return len(resp.data) > 0


def run(dog_id: str, target_date: date):
    metrics = compute_metrics(dog_id, target_date)
    if metrics:
        ok = save_metrics(metrics)
        logger.info(f"Guardat: {ok} — {metrics}")
    return metrics


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Computa mètriques diàries Ernest")
    parser.add_argument("--dog_id", required=True)
    parser.add_argument("--date",   default=date.today().isoformat())
    args = parser.parse_args()
    run(args.dog_id, date.fromisoformat(args.date))
