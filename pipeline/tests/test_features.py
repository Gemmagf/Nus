"""
test_features.py — Tests del pipeline de dades Ernest
Massiu Soft SL
"""
import pytest
import numpy as np
import pandas as pd
from pipeline.features.compute_daily import (
    compute_activity_index,
    compute_rest_metrics,
    compute_symmetry_index
)
from pipeline.anomaly.detect_anomalies import evaluate_metric


# ── Helpers ──────────────────────────────────────────────────
def make_df(acc_x=None, acc_y=None, acc_z=None, temp=None, n=100):
    """Crea un DataFrame de proves amb valors controlats."""
    rng = np.random.default_rng(42)
    return pd.DataFrame({
        "acc_x":        acc_x if acc_x is not None else rng.normal(0, 0.05, n),
        "acc_y":        acc_y if acc_y is not None else rng.normal(0, 0.05, n),
        "acc_z":        (acc_z if acc_z is not None else np.ones(n)),  # 1g en repòs
        "gyro_x":       rng.normal(0, 1, n),
        "gyro_y":       rng.normal(0, 1, n),
        "gyro_z":       rng.normal(0, 1, n),
        "temp_surface": temp if temp is not None else np.full(n, 38.5),
    })


# ── Tests activity_index ─────────────────────────────────────
class TestActivityIndex:
    def test_quiet_dog_low_activity(self):
        """Gos quiet → índex baix"""
        df = make_df(acc_x=np.zeros(100), acc_y=np.zeros(100), acc_z=np.ones(100))
        idx = compute_activity_index(df)
        assert idx < 5.0, f"Esperava activitat baixa, obtingut {idx}"

    def test_active_dog_high_activity(self):
        """Gos actiu → índex alt"""
        rng = np.random.default_rng(0)
        df = make_df(
            acc_x=rng.normal(0, 0.4, 100),
            acc_y=rng.normal(0, 0.4, 100),
            acc_z=rng.normal(1, 0.4, 100)
        )
        idx = compute_activity_index(df)
        assert idx > 30.0, f"Esperava activitat alta, obtingut {idx}"

    def test_empty_df_returns_zero(self):
        assert compute_activity_index(pd.DataFrame()) == 0.0

    def test_max_capped_at_100(self):
        """L'índex no pot superar 100"""
        rng = np.random.default_rng(1)
        df = make_df(acc_x=rng.normal(0, 5, 100), acc_y=rng.normal(0, 5, 100))
        assert compute_activity_index(df) <= 100.0


# ── Tests rest_metrics ───────────────────────────────────────
class TestRestMetrics:
    def test_sleeping_dog_high_rest(self):
        """Gos dormint → moltes hores de repòs"""
        df = make_df(acc_x=np.zeros(720), acc_y=np.zeros(720), acc_z=np.ones(720))
        rest_h, frag = compute_rest_metrics(df)
        assert rest_h > 0.5, f"Esperava >0.5h de repòs, obtingut {rest_h}"
        assert frag < 0.1, f"Esperava baixa fragmentació, obtingut {frag}"

    def test_active_dog_low_rest(self):
        """Gos actiu → poc repòs"""
        rng = np.random.default_rng(2)
        df = make_df(acc_x=rng.normal(0, 0.5, 100), acc_y=rng.normal(0, 0.5, 100))
        rest_h, _ = compute_rest_metrics(df)
        assert rest_h < 0.2


# ── Tests symmetry_index ─────────────────────────────────────
class TestSymmetryIndex:
    def test_symmetric_gait_high_index(self):
        """Marxa simètrica → índex alt"""
        rng = np.random.default_rng(3)
        n = 200
        v = rng.normal(0, 0.1, n)
        df = make_df(acc_x=v, acc_y=v.copy())  # X i Y iguals
        idx = compute_symmetry_index(df)
        assert idx > 80.0, f"Esperava alta simetria, obtingut {idx}"

    def test_asymmetric_gait_low_index(self):
        """Marxa asimètrica → índex baix"""
        rng = np.random.default_rng(4)
        n = 200
        df = make_df(
            acc_x=rng.normal(0, 0.5, n),   # molt moviment en X
            acc_y=rng.normal(0, 0.01, n)   # quasi res en Y
        )
        idx = compute_symmetry_index(df)
        assert idx < 80.0, f"Esperava baixa simetria, obtingut {idx}"

    def test_no_movement_returns_100(self):
        df = make_df(acc_x=np.zeros(50), acc_y=np.zeros(50))
        assert compute_symmetry_index(df) == 100.0


# ── Tests anomaly detection ──────────────────────────────────
class TestAnomalyDetection:
    BASELINE = {"p10": 40.0, "p50": 60.0, "p90": 80.0, "std_dev": 10.0}

    def test_normal_value_no_alert(self):
        result = evaluate_metric("activity_index", 60.0, self.BASELINE)
        assert result is None

    def test_low_value_warning(self):
        result = evaluate_metric("activity_index", 35.0, self.BASELINE)
        assert result is not None
        assert result["severity"] in ("warning", "urgent")
        assert result["detail"]["direction"] == "low"

    def test_high_value_warning(self):
        result = evaluate_metric("activity_index", 85.0, self.BASELINE)
        assert result is not None
        assert result["detail"]["direction"] == "high"

    def test_extreme_value_urgent(self):
        """Valor a >3 std_dev del p50 → urgent"""
        extreme_value = 60.0 + 4 * 10.0  # p50 + 4*std
        result = evaluate_metric("activity_index", extreme_value, self.BASELINE)
        assert result is not None
        assert result["severity"] == "urgent"

    def test_none_value_no_alert(self):
        result = evaluate_metric("activity_index", None, self.BASELINE)
        assert result is None

    def test_no_baseline_no_alert(self):
        result = evaluate_metric("activity_index", 50.0, {})
        assert result is None
