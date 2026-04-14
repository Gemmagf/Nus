-- ============================================================
-- 002_walks_bathroom.sql — Passejades + necessitats fisiològiques
-- Ernest v1.1 · Massiu Soft SL
-- ============================================================

-- ── Sessió de passeig ─────────────────────────────────────────
-- Una "sessió" és un període de moviment sostingut (>5 min, activitat >0.1g)
CREATE TABLE walk_sessions (
    id              bigserial PRIMARY KEY,
    dog_id          uuid NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    date            date NOT NULL,
    started_at      timestamptz NOT NULL,
    ended_at        timestamptz NOT NULL,

    -- Durada i distància
    duration_min    real NOT NULL,          -- minuts de passeig
    distance_m      real,                   -- metres estimats (passes × longitud_pas)
    steps           integer,                -- passes estimades

    -- Qualitat de la marxa durant el passeig
    avg_pace_kmh    real,                   -- velocitat mitja
    avg_symmetry    real,                   -- índex simetria mitja (0-100)
    avg_activity    real,                   -- magnitud IMU mitja normalitzada

    -- Detectat automàticament pel pipeline
    detection_confidence real DEFAULT 1.0,  -- 0-1 confiança detecció
    pipeline_version     text DEFAULT '1.1',
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_walks_dog_date ON walk_sessions (dog_id, date DESC);
CREATE INDEX idx_walks_dog_ts   ON walk_sessions (dog_id, started_at DESC);

ALTER TABLE walk_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_access" ON walk_sessions
    USING (dog_id IN (SELECT id FROM dogs WHERE owner_id = auth.uid()));

-- ── Resum de passejades per dia ───────────────────────────────
-- Vista calculada (o columnes a daily_metrics)
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS walk_count        smallint;  -- nº passejades
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS walk_total_min    real;      -- minuts totals
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS walk_total_m      real;      -- metres totals
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS steps_total       integer;   -- passes totals

-- ── Esdeveniments fisiològics ─────────────────────────────────
-- Detectat per: aturada + patró postura IMU + durada característica
-- Pipi:  aturada 15-90s, possible spike lateral giroscopi (aixecar pota, mascles)
--        o lleugera flexió (femelles)
-- Caca:  aturada 30-120s, flexió dorsal pronunciada (acc_z canvi sostingut)
CREATE TABLE bathroom_events (
    id              bigserial PRIMARY KEY,
    dog_id          uuid NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    date            date NOT NULL,
    occurred_at     timestamptz NOT NULL,

    -- Tipus d'esdeveniment
    event_type      text NOT NULL CHECK (event_type IN ('pipi','caca','unknown')),

    -- Senyal IMU que ha disparat la detecció
    duration_s      real NOT NULL,          -- durada de l'aturada (s)
    posture_score   real,                   -- score postura (0-1, 1=molt clar)
    gyro_lateral    real,                   -- pic giroscopi lateral (indicador aixecar pota)
    acc_z_delta     real,                   -- canvi acc_z (indicador flexió)

    -- Context
    walk_session_id bigint REFERENCES walk_sessions(id),  -- si va passar durant un passeig
    detection_confidence real DEFAULT 0.8,
    pipeline_version     text DEFAULT '1.1',
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_bathroom_dog_date ON bathroom_events (dog_id, date DESC);
CREATE INDEX idx_bathroom_dog_ts   ON bathroom_events (dog_id, occurred_at DESC);

ALTER TABLE bathroom_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_access" ON bathroom_events
    USING (dog_id IN (SELECT id FROM dogs WHERE owner_id = auth.uid()));

-- ── Resum fisiològic per dia (afegit a daily_metrics) ────────
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS pipi_count  smallint;  -- nº pipi detectats
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS caca_count  smallint;  -- nº caca detectats

-- ── Baseline de passejades i necessitats ─────────────────────
-- Les mètriques 'walk_count', 'walk_total_min', 'pipi_count', 'caca_count'
-- s'afegiran automàticament a la taula baselines amb l'algorisme existent.
-- Exemple de mètriques noves:
--   metric = 'walk_count'      → P10=1, P50=3, P90=5
--   metric = 'walk_total_min'  → P10=20, P50=45, P90=80
--   metric = 'pipi_count'      → P10=3, P50=5, P90=8
--   metric = 'caca_count'      → P10=1, P50=2, P90=3

-- ── Vista unificada per a l'app (propietari) ─────────────────
CREATE OR REPLACE VIEW daily_summary AS
SELECT
    dm.dog_id,
    dm.date,
    dm.activity_index,
    dm.rest_hours,
    dm.symmetry_index,
    dm.avg_temp,
    dm.anomaly_score,
    dm.walk_count,
    dm.walk_total_min,
    dm.walk_total_m,
    dm.steps_total,
    dm.pipi_count,
    dm.caca_count,
    -- Nivell d'hidratació estimat (pipi < 2 → alerta deshidratació)
    CASE
        WHEN dm.pipi_count IS NULL THEN 'desconegut'
        WHEN dm.pipi_count <= 1 THEN 'molt baix'
        WHEN dm.pipi_count <= 3 THEN 'baix'
        WHEN dm.pipi_count <= 7 THEN 'normal'
        ELSE 'alt'
    END AS hydration_level,
    -- Activitat digestiva estimada
    CASE
        WHEN dm.caca_count IS NULL THEN 'desconegut'
        WHEN dm.caca_count = 0 THEN 'cap'
        WHEN dm.caca_count = 1 THEN 'normal-baix'
        WHEN dm.caca_count = 2 THEN 'normal'
        ELSE 'elevat'
    END AS digestive_status
FROM daily_metrics dm;

-- Vista accessible pels propietaris via RLS heretada de daily_metrics
