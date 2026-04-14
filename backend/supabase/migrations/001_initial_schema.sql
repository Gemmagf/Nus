-- ============================================================
-- 001_initial_schema.sql — Schema inicial Ernest
-- Massiu Soft SL
-- ============================================================

-- Extensió TimescaleDB (activar a Supabase: Database → Extensions)
-- CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── Gossos ────────────────────────────────────────────────────
CREATE TABLE dogs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        text NOT NULL,
    breed       text,
    birth_date  date,
    weight_kg   numeric(4,1),
    device_id   text UNIQUE,       -- MAC address del dispositiu BLE
    is_active   boolean DEFAULT true,
    created_at  timestamptz DEFAULT now(),
    updated_at  timestamptz DEFAULT now()
);

-- RLS: cada propietari només veu els seus gossos
ALTER TABLE dogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_access" ON dogs
    USING (owner_id = auth.uid());

-- ── Lectures de sensors (time-series) ────────────────────────
CREATE TABLE sensor_readings (
    id          bigserial,
    dog_id      uuid NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    ts          timestamptz NOT NULL,
    acc_x       real, acc_y real, acc_z real,       -- g
    gyro_x      real, gyro_y real, gyro_z real,     -- °/s
    temp_surface real,                              -- °C
    battery_pct smallint,                          -- 0-100
    seq         smallint,                          -- número seqüència BLE
    created_at  timestamptz DEFAULT now(),
    PRIMARY KEY (dog_id, ts)
);

-- Índex per consultes temporals per gos
CREATE INDEX idx_readings_dog_ts ON sensor_readings (dog_id, ts DESC);

-- RLS: accés via dog.owner_id
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_access" ON sensor_readings
    USING (
        dog_id IN (SELECT id FROM dogs WHERE owner_id = auth.uid())
    );

-- ── Mètriques diàries calculades ─────────────────────────────
CREATE TABLE daily_metrics (
    id                  bigserial PRIMARY KEY,
    dog_id              uuid NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    date                date NOT NULL,
    activity_index      real,               -- 0-100
    rest_hours          real,               -- hores de descans
    rest_fragmentation  real,               -- 0-1 (1 = molt fragmentat)
    symmetry_index      real,               -- 0-100 (100 = perfecte)
    avg_temp            real,               -- °C mitja del dia
    steps_estimated     integer,
    anomaly_score       real DEFAULT 0,     -- 0-1 (>0.7 = possible alerta)
    pipeline_version    text DEFAULT '1.0',
    created_at          timestamptz DEFAULT now(),
    UNIQUE(dog_id, date)
);

CREATE INDEX idx_daily_dog_date ON daily_metrics (dog_id, date DESC);
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_access" ON daily_metrics
    USING (dog_id IN (SELECT id FROM dogs WHERE owner_id = auth.uid()));

-- ── Baselines individuals per gos ────────────────────────────
CREATE TABLE baselines (
    id              bigserial PRIMARY KEY,
    dog_id          uuid NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    metric          text NOT NULL,      -- 'activity_index', 'rest_hours', etc.
    p10             real,               -- percentil 10
    p50             real,               -- mediana
    p90             real,               -- percentil 90
    std_dev         real,
    window_days     integer DEFAULT 30,
    n_observations  integer,            -- quantes lectures ha usat
    computed_at     timestamptz DEFAULT now(),
    UNIQUE(dog_id, metric)
);

ALTER TABLE baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_access" ON baselines
    USING (dog_id IN (SELECT id FROM dogs WHERE owner_id = auth.uid()));

-- ── Alertes ──────────────────────────────────────────────────
CREATE TABLE alerts (
    id          bigserial PRIMARY KEY,
    dog_id      uuid NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
    severity    text NOT NULL CHECK (severity IN ('info','warning','urgent')),
    metric      text,
    message     text NOT NULL,
    detail      jsonb,                  -- dades addicionals de context
    is_read     boolean DEFAULT false,
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_alerts_dog_unread ON alerts (dog_id, is_read, created_at DESC);
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_access" ON alerts
    USING (dog_id IN (SELECT id FROM dogs WHERE owner_id = auth.uid()));

-- ── Device health (per al monitoratge automàtic) ─────────────
CREATE TABLE device_health (
    device_id       text PRIMARY KEY,
    dog_id          uuid REFERENCES dogs(id),
    last_seen_at    timestamptz,
    battery_pct     smallint,
    firmware_ver    text,
    is_online       boolean DEFAULT false,
    updated_at      timestamptz DEFAULT now()
);

-- ── Funció helper: actualitzar updated_at ────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dogs_updated_at BEFORE UPDATE ON dogs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER device_health_updated_at BEFORE UPDATE ON device_health
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
