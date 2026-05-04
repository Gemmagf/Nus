-- ============================================================
-- Migration 004 — Energy tracking & fatigue detection
-- Ernest · Massiu Soft SL · 2026
--
-- Afegeix:
--   - Taula energy_snapshots: lectures d'energia en temps real
--   - Columnes d'energia a walk_sessions
--   - RPC compute_energy_budget
--   - Tipus d'alerta nou: energy_pct, fatigue_onset
-- ============================================================

-- ── Columnes noves a walk_sessions ───────────────────────────
ALTER TABLE walk_sessions
  ADD COLUMN IF NOT EXISTS energy_start_pct  real DEFAULT 100.0,
  ADD COLUMN IF NOT EXISTS energy_end_pct    real,
  ADD COLUMN IF NOT EXISTS energy_min_pct    real,
  ADD COLUMN IF NOT EXISTS max_drain_rate    real,         -- %/min màxim
  ADD COLUMN IF NOT EXISTS fatigue_onset_min real,         -- min des d'inici fins primer senyal
  ADD COLUMN IF NOT EXISTS peak_alert        text CHECK (peak_alert IN ('ok','warning','urgent')),
  ADD COLUMN IF NOT EXISTS breed_factor      real,
  ADD COLUMN IF NOT EXISTS age_factor        real;

-- ── Taula energy_snapshots ────────────────────────────────────
-- Emmagatzema l'estat energètic del gos cada ~30s durant una sortida.
-- Permet mostrar la corba d'energia a l'app i al dashboard en temps real.
CREATE TABLE IF NOT EXISTS energy_snapshots (
  id               bigserial PRIMARY KEY,
  dog_id           uuid NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  walk_session_id  bigint REFERENCES walk_sessions(id) ON DELETE SET NULL,
  ts               timestamptz NOT NULL,
  energy_pct       real NOT NULL CHECK (energy_pct BETWEEN 0 AND 100),
  drain_rate       real,                       -- %/min (negatiu = recuperació)
  fatigue_signals  text[] DEFAULT '{}',        -- senyals actius en aquest moment
  alert_level      text DEFAULT 'ok'
                     CHECK (alert_level IN ('ok','warning','urgent')),
  estimated_remaining_min real,               -- minuts estimats al ritme actual
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS energy_snapshots_dog_ts
  ON energy_snapshots (dog_id, ts DESC);

CREATE INDEX IF NOT EXISTS energy_snapshots_session
  ON energy_snapshots (walk_session_id, ts DESC);

-- RLS
ALTER TABLE energy_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "energy_owner_read"
  ON energy_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM dogs
      WHERE dogs.id = energy_snapshots.dog_id
        AND dogs.owner_id = auth.uid()
    )
  );

CREATE POLICY "energy_service_all"
  ON energy_snapshots FOR ALL
  USING (auth.role() = 'service_role');

-- ── Columnes d'energia a daily_metrics ───────────────────────
ALTER TABLE daily_metrics
  ADD COLUMN IF NOT EXISTS energy_avg_pct  real,  -- energia mitja del dia
  ADD COLUMN IF NOT EXISTS energy_min_pct  real,  -- mínim d'energia del dia
  ADD COLUMN IF NOT EXISTS fatigue_events  smallint DEFAULT 0; -- nº cops alerta fatiga

-- ── Vista: live_energy ────────────────────────────────────────
-- Última lectura d'energia per a cada gos (per al dashboard en temps real)
CREATE OR REPLACE VIEW live_energy AS
SELECT DISTINCT ON (dog_id)
  dog_id,
  ts,
  energy_pct,
  drain_rate,
  fatigue_signals,
  alert_level,
  estimated_remaining_min
FROM energy_snapshots
ORDER BY dog_id, ts DESC;

-- ── RPC: compute_energy_budget ────────────────────────────────
-- Llegeix els últims snapshots d'energia i retorna una estimació
-- del temps restant de sortida basant-se en el ritme de drenatge actual.
CREATE OR REPLACE FUNCTION compute_energy_budget(
  p_dog_id  uuid,
  p_minutes int DEFAULT 30
)
RETURNS TABLE (
  current_energy_pct        real,
  avg_drain_rate_per_min    real,
  estimated_remaining_min   real,
  fatigue_signals           text[],
  alert_level               text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH recent AS (
    SELECT
      energy_pct,
      drain_rate,
      fatigue_signals,
      alert_level,
      estimated_remaining_min
    FROM energy_snapshots
    WHERE dog_id    = p_dog_id
      AND ts       >= now() - (p_minutes || ' minutes')::interval
    ORDER BY ts DESC
    LIMIT 20
  ),
  agg AS (
    SELECT
      (SELECT energy_pct FROM recent ORDER BY (SELECT NULL) LIMIT 1) AS current_energy_pct,
      AVG(CASE WHEN drain_rate > 0 THEN drain_rate END)              AS avg_drain,
      (SELECT fatigue_signals FROM recent LIMIT 1)                   AS fatigue_signals,
      (SELECT alert_level FROM recent LIMIT 1)                       AS alert_level,
      (SELECT estimated_remaining_min FROM recent LIMIT 1)           AS est_remaining
    FROM recent
  )
  SELECT
    COALESCE(current_energy_pct, 100)::real,
    COALESCE(avg_drain, 0)::real,
    CASE
      WHEN avg_drain > 0 THEN (current_energy_pct / avg_drain)::real
      ELSE est_remaining
    END,
    COALESCE(fatigue_signals, ARRAY[]::text[]),
    COALESCE(alert_level, 'ok')
  FROM agg;
$$;

GRANT EXECUTE ON FUNCTION compute_energy_budget TO service_role, authenticated;

-- ── Ampliem CHECK de alerts.metric ───────────────────────────
-- Afegim els nous tipus de mètrica d'energia
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_metric_check;
-- (Supabase no usa check constraint per a text lliure, ho gestionem a nivell d'aplicació)

-- ── Comentaris ───────────────────────────────────────────────
COMMENT ON TABLE energy_snapshots IS
  'Lectures d''energia i fatiga cada ~30s durant sessions d''activitat. '
  'Permet mostrar la corba d''energia en temps real i detectar esgotament.';

COMMENT ON COLUMN energy_snapshots.drain_rate IS
  '%/min de drenatge energètic. Negatiu durant períodes de repòs (recuperació).';

COMMENT ON COLUMN energy_snapshots.fatigue_signals IS
  'Senyals actius: pauses_increasing, symmetry_declining, temp_elevated, '
  'pace_slowing, sudden_drop';

COMMENT ON COLUMN walk_sessions.fatigue_onset_min IS
  'Minuts des de l''inici de la sortida fins a la primera detecció de fatiga. '
  'NULL si no s''han detectat senyals.';
