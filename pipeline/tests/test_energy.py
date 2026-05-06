# ============================================================
# pipeline/tests/test_energy.py
# Ernest — Tests del model d'energia i fatiga
# ============================================================

import pytest
import numpy as np
import pandas as pd
from datetime import datetime, timezone, timedelta

from features.compute_energy import (
    compute_energy_session,
    _breed_factor,
    _age_factor,
    _weight_factor,
    generate_energy_alerts,
    THRESHOLD_WARNING,
    THRESHOLD_URGENT,
)

# ── Helpers ───────────────────────────────────────────────────

def make_readings(
    n: int = 300,
    intensity: float = 0.3,
    temp: float = 38.5,
    start_ts: datetime | None = None,
) -> pd.DataFrame:
    """Genera N lectures sintètiques d'un gos en moviment."""
    if start_ts is None:
        start_ts = datetime(2026, 4, 28, 10, 0, 0, tzinfo=timezone.utc)
    ts = [start_ts + timedelta(seconds=i * 0.2) for i in range(n)]
    rng = np.random.default_rng(42)
    acc_z = 1.0 + intensity + rng.normal(0, 0.05, n)
    return pd.DataFrame({
        "ts":           ts,
        "acc_x":        rng.normal(0, intensity * 0.5, n),
        "acc_y":        rng.normal(0, intensity * 0.5, n),
        "acc_z":        acc_z,
        "gyro_x":       rng.normal(0, 5, n),
        "gyro_y":       rng.normal(0, 5, n),
        "gyro_z":       rng.normal(0, 5, n),
        "temp_surface": np.full(n, temp),
        "battery_pct":  np.full(n, 80, dtype=int),
    })


def make_stopped_readings(n: int = 150) -> pd.DataFrame:
    """Lectures d'un gos completament parat."""
    start = datetime(2026, 4, 28, 11, 0, 0, tzinfo=timezone.utc)
    ts = [start + timedelta(seconds=i * 0.2) for i in range(n)]
    rng = np.random.default_rng(7)
    return pd.DataFrame({
        "ts":           ts,
        "acc_x":        rng.normal(0, 0.01, n),
        "acc_y":        rng.normal(0, 0.01, n),
        "acc_z":        1.0 + rng.normal(0, 0.01, n),
        "gyro_x":       rng.normal(0, 0.5, n),
        "gyro_y":       rng.normal(0, 0.5, n),
        "gyro_z":       rng.normal(0, 0.5, n),
        "temp_surface": np.full(n, 38.0),
        "battery_pct":  np.full(n, 80, dtype=int),
    })


# ── Tests factors de raça ──────────────────────────────────────

def test_high_endurance_breed_lower_factor():
    assert _breed_factor("Bòrder Collie") < _breed_factor("Bulldog Anglès")


def test_low_endurance_breed_higher_factor():
    assert _breed_factor("Pug") > 1.0


def test_unknown_breed_default_factor():
    assert _breed_factor(None) == 1.0
    assert _breed_factor("Gos de Muntanya") == 1.0


def test_breed_case_insensitive():
    assert _breed_factor("LABRADOR") == _breed_factor("labrador")


# ── Tests factors d'edat ───────────────────────────────────────

def test_senior_dog_higher_drain():
    factor_adult  = _age_factor("2020-01-01")  # ~6 anys
    factor_senior = _age_factor("2012-01-01")  # ~14 anys
    assert factor_senior > factor_adult


def test_young_dog_higher_drain_than_adult():
    factor_adult = _age_factor("2020-01-01")   # ~6 anys
    factor_young = _age_factor("2025-06-01")   # ~11 mesos
    assert factor_young > factor_adult


def test_none_birth_date_returns_one():
    assert _age_factor(None) == 1.0


# ── Tests factors de pes ───────────────────────────────────────

def test_heavy_dog_more_drain():
    assert _weight_factor(40.0) > _weight_factor(20.0)


def test_light_dog_slightly_less_drain():
    assert _weight_factor(5.0) < _weight_factor(20.0)


# ── Tests model energia ───────────────────────────────────────

def test_active_dog_drains_energy():
    readings = make_readings(n=600, intensity=0.4)
    report = compute_energy_session("dog-1", "2026-04-28", readings)
    assert report.final_energy_pct < 100.0


def test_resting_dog_recovers_energy():
    # Comença amb energia baixa, gos parat → ha de recuperar
    readings = make_stopped_readings(n=300)
    report = compute_energy_session(
        "dog-2", "2026-04-28", readings, energy_start=40.0
    )
    assert report.final_energy_pct > 40.0


def test_bulldof_drains_faster_than_border_collie():
    readings = make_readings(n=600, intensity=0.35)
    report_bc = compute_energy_session(
        "dog-bc", "2026-04-28", readings, breed="Border Collie"
    )
    report_bd = compute_energy_session(
        "dog-bd", "2026-04-28", readings, breed="Bulldog"
    )
    assert report_bd.final_energy_pct < report_bc.final_energy_pct


def test_hot_dog_drains_faster():
    readings_cool = make_readings(n=600, intensity=0.3, temp=37.5)
    readings_hot  = make_readings(n=600, intensity=0.3, temp=39.8)
    report_cool = compute_energy_session("dog-c", "2026-04-28", readings_cool)
    report_hot  = compute_energy_session("dog-h", "2026-04-28", readings_hot)
    assert report_hot.final_energy_pct < report_cool.final_energy_pct


def test_energy_never_below_zero():
    readings = make_readings(n=3000, intensity=0.8)  # sessió molt intensa
    report = compute_energy_session("dog-x", "2026-04-28", readings)
    assert report.final_energy_pct >= 0.0
    assert all(s.energy_pct >= 0 for s in report.snapshots)


def test_energy_never_above_start():
    readings = make_readings(n=600, intensity=0.3)
    report = compute_energy_session("dog-y", "2026-04-28", readings)
    assert all(s.energy_pct <= 100.0 for s in report.snapshots)


def test_empty_readings_returns_full_energy():
    empty = pd.DataFrame(columns=["ts", "acc_x", "acc_y", "acc_z",
                                   "gyro_x", "gyro_y", "gyro_z",
                                   "temp_surface", "battery_pct"])
    report = compute_energy_session("dog-e", "2026-04-28", empty)
    assert report.final_energy_pct == 100.0


# ── Tests alertes ─────────────────────────────────────────────

def test_urgent_alert_generated_when_critical():
    # Gos molt pesat, raça de baixa resistència, molt d'exercici
    readings = make_readings(n=6000, intensity=0.8, temp=39.6)
    report = compute_energy_session(
        "dog-z", "2026-04-28", readings,
        breed="Bulldog", birth_date="2013-01-01", weight_kg=38.0
    )
    if report.peak_alert in ("urgent", "warning"):
        alerts = generate_energy_alerts("dog-z", "2026-04-28", report)
        assert any(a["severity"] in ("urgent", "warning") for a in alerts)


def test_healthy_dog_no_alert():
    readings = make_readings(n=150, intensity=0.25)  # sortida curta, moderada
    report = compute_energy_session(
        "dog-ok", "2026-04-28", readings,
        breed="Border Collie", birth_date="2021-06-01", weight_kg=18.0
    )
    # Un BC jove en passejada curta no hauria de tenir alerta urgent
    assert report.peak_alert != "urgent"
