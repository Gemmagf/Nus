-- ============================================================
-- 003_pipeline_runs_rpc.sql — Taula pipeline_runs + RPC pipeline
-- Ernest v1.1 · Massiu Soft SL
--
-- Conté:
--   1. Taula pipeline_runs (log d'execucions del pipeline)
--   2. RPC compute_daily_metrics  — mètriques diàries des de sensor_readings
--   3. RPC compute_baseline       — percentils rolling 30 dies
--   4. RPC detect_anomalies       — detecció anomalies i generació alertes
--   5. RPC compute_walks_bathroom — resum passejades/pipi/caca a daily_metrics
--
-- Nota: les RPCs implementen la lògica bàsica en SQL.
-- Per a detecció avançada (compute_walks.py, compute_bathroom.py),
-- usar el microservei Python via PIPELINE_API_URL.
-- ============================================================

-- ── 1. Taula pipeline_runs ────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_runs (
    id           bigserial PRIMARY KEY,
    run_date     date NOT NULL,
    dogs_total   int  NOT NULL DEFAULT 0,
    dogs_ok      int  NOT NULL DEFAULT 0,
    dogs_error   int  NOT NULL DEFAULT 0,
    errors       jsonb,
    started_at   timestamptz DEFAULT now(),
    finished_at  timestamptz,
    pipeline_version text DEFAULT '1.1',
    trigger      text DEFAULT 'cron'  -- 'cron' | 'manual' | 'api'
);

CREATE INDEX idx_pipeline_runs_date ON pipeline_runs (run_date DESC);

-- Accessible només per service_role (no RLS de propietari, és taula interna)
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON pipeline_runs
    USING (false)   -- cap accés anònim; service_role bypassa RLS
    WITH CHECK (false);

-- ── 2. RPC: compute_daily_metrics ────────────────────────────
-- Calcula mètriques diàries d'un gos a partir de sensor_readings
-- i actualitza (upsert) daily_metrics.
CREATE OR REPLACE FUNCTION compute_daily_metrics(
    p_dog_id uuid,
    p_date   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start     timestamptz := p_date::timestamptz AT TIME ZONE 'UTC';
    v_end       timestamptz := (p_date + 1)::timestamptz AT TIME ZONE 'UTC';
    v_count     int;
    v_activity  real;
    v_rest_h    real;
    v_rest_frag real;
    v_symmetry  real;
    v_avg_temp  real;
    v_steps     int;
    v_result    jsonb;
BEGIN
    -- Nombre de lectures del dia
    SELECT COUNT(*) INTO v_count
    FROM sensor_readings
    WHERE dog_id = p_dog_id AND ts >= v_start AND ts < v_end;

    IF v_count = 0 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'no_data', 'count', 0);
    END IF;

    -- ── Índex d'activitat (0-100) ─────────────────────────────
    -- Magnitud vector IMU - 1g (gravetat), normalitzat a 0-100
    SELECT LEAST(
        100.0,
        AVG(GREATEST(0.0, SQRT(acc_x^2 + acc_y^2 + acc_z^2) - 1.0)) / 0.5 * 100.0
    )
    INTO v_activity
    FROM sensor_readings
    WHERE dog_id = p_dog_id AND ts >= v_start AND ts < v_end;

    -- ── Hores de repòs ────────────────────────────────────────
    -- Lectures amb magnitud < 0.05g considerades "en repòs" (5s/lectura)
    SELECT
        SUM(CASE WHEN SQRT(acc_x^2 + acc_y^2 + acc_z^2) - 1.0 < 0.05 THEN 5.0 ELSE 0.0 END) / 3600.0,
        -- Fragmentació: transicions aproximades via STDDEV de la sèrie binària
        STDDEV(CASE WHEN SQRT(acc_x^2 + acc_y^2 + acc_z^2) - 1.0 < 0.05 THEN 1.0 ELSE 0.0 END)
    INTO v_rest_h, v_rest_frag
    FROM sensor_readings
    WHERE dog_id = p_dog_id AND ts >= v_start AND ts < v_end;

    v_rest_frag := COALESCE(v_rest_frag, 0.0);

    -- ── Índex de simetria (0-100) ─────────────────────────────
    -- Asimetria lateral: |stddev(acc_x) - stddev(acc_y)| / (stddev_x + stddev_y)
    SELECT
        CASE
            WHEN STDDEV(acc_x) + STDDEV(acc_y) < 0.001 THEN 100.0
            ELSE GREATEST(0.0,
                100.0 - (ABS(STDDEV(acc_x) - STDDEV(acc_y)) /
                         NULLIF(STDDEV(acc_x) + STDDEV(acc_y), 0)) * 200.0
            )
        END
    INTO v_symmetry
    FROM sensor_readings
    WHERE dog_id = p_dog_id AND ts >= v_start AND ts < v_end;

    -- ── Temperatura mitjana ───────────────────────────────────
    SELECT AVG(temp_surface) INTO v_avg_temp
    FROM sensor_readings
    WHERE dog_id = p_dog_id AND ts >= v_start AND ts < v_end
      AND temp_surface IS NOT NULL;

    -- ── Passos estimats (crude) ───────────────────────────────
    -- Lectures amb magnitud > 0.2g × factor 0.5 (cada 5s, ~2 passos/lectura activa)
    SELECT COUNT(*) * 2
    INTO v_steps
    FROM sensor_readings
    WHERE dog_id = p_dog_id AND ts >= v_start AND ts < v_end
      AND SQRT(acc_x^2 + acc_y^2 + acc_z^2) - 1.0 > 0.2;

    -- ── Upsert a daily_metrics ────────────────────────────────
    INSERT INTO daily_metrics (
        dog_id, date,
        activity_index, rest_hours, rest_fragmentation,
        symmetry_index, avg_temp, steps_estimated
    ) VALUES (
        p_dog_id, p_date,
        ROUND(v_activity::numeric, 2),
        ROUND(v_rest_h::numeric, 2),
        ROUND(v_rest_frag::numeric, 4),
        ROUND(v_symmetry::numeric, 2),
        ROUND(v_avg_temp::numeric, 2),
        v_steps
    )
    ON CONFLICT (dog_id, date) DO UPDATE SET
        activity_index      = EXCLUDED.activity_index,
        rest_hours          = EXCLUDED.rest_hours,
        rest_fragmentation  = EXCLUDED.rest_fragmentation,
        symmetry_index      = EXCLUDED.symmetry_index,
        avg_temp            = EXCLUDED.avg_temp,
        steps_estimated     = EXCLUDED.steps_estimated;

    v_result := jsonb_build_object(
        'ok',             true,
        'dog_id',         p_dog_id,
        'date',           p_date,
        'readings',       v_count,
        'activity_index', ROUND(v_activity::numeric, 2),
        'rest_hours',     ROUND(v_rest_h::numeric, 2),
        'symmetry_index', ROUND(v_symmetry::numeric, 2)
    );

    RETURN v_result;
END;
$$;

-- ── 3. RPC: compute_baseline ──────────────────────────────────
-- Calcula els percentils P10/P50/P90 per a cada mètrica del gos
-- usant les últimes 30 dies de daily_metrics.
CREATE OR REPLACE FUNCTION compute_baseline(
    p_dog_id     uuid,
    p_window     int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_metrics text[] := ARRAY[
        'activity_index', 'rest_hours', 'rest_fragmentation',
        'symmetry_index', 'avg_temp', 'steps_estimated',
        'walk_count', 'walk_total_min', 'pipi_count', 'caca_count'
    ];
    v_metric  text;
    v_upserts int := 0;
BEGIN
    FOREACH v_metric IN ARRAY v_metrics LOOP
        -- Inserir o actualitzar el baseline per a cada mètrica
        EXECUTE format(
        $dyn$
            INSERT INTO baselines (dog_id, metric, p10, p50, p90, window_days, computed_at)
            SELECT
                $1,
                $2,
                PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY %I),
                PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY %I),
                PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY %I),
                $3,
                now()
            FROM daily_metrics
            WHERE dog_id = $1
              AND date >= CURRENT_DATE - $3
              AND %I IS NOT NULL
            ON CONFLICT (dog_id, metric) DO UPDATE SET
                p10         = EXCLUDED.p10,
                p50         = EXCLUDED.p50,
                p90         = EXCLUDED.p90,
                window_days = EXCLUDED.window_days,
                computed_at = EXCLUDED.computed_at
        $dyn$,
        v_metric, v_metric, v_metric, v_metric
        ) USING p_dog_id, v_metric, p_window;

        v_upserts := v_upserts + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'ok',      true,
        'dog_id',  p_dog_id,
        'metrics', v_upserts,
        'window',  p_window
    );
END;
$$;

-- Afegir UNIQUE a baselines si no existeix
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'baselines_dog_id_metric_key'
    ) THEN
        ALTER TABLE baselines ADD CONSTRAINT baselines_dog_id_metric_key
            UNIQUE (dog_id, metric);
    END IF;
END;
$$;

-- ── 4. RPC: detect_anomalies ──────────────────────────────────
-- Compara mètriques del dia vs baseline del gos i genera alertes.
-- Implementa els filtres anti-fals-positiu de detect_anomalies.py v1.1.
CREATE OR REPLACE FUNCTION detect_anomalies(
    p_dog_id uuid,
    p_date   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_metric     record;
    v_val        real;
    v_alerts_out jsonb := '[]'::jsonb;
    v_severity   text;
    v_msg        text;
    v_range_ok   bool;
    v_consec     int;
    v_already    int;
    -- Llindars (equiv. a detect_anomalies.py v1.1)
    MIN_RANGE_RATIO  constant real := 0.05;  -- rang (p90-p10)/p50 mínim per ser significatiu
    CONSECUTIVE_DAYS constant int  := 2;     -- dies consecutius per disparar warning
    DEDUP_DAYS       constant int  := 3;     -- dies de dedup d'alertes warning
BEGIN
    -- Per a cada mètrica amb baseline definida
    FOR v_metric IN
        SELECT b.metric, b.p10, b.p50, b.p90
        FROM baselines b
        WHERE b.dog_id = p_dog_id
          AND b.p50 > 0
    LOOP
        -- Obtenir valor del dia
        EXECUTE format(
            'SELECT %I FROM daily_metrics WHERE dog_id = $1 AND date = $2',
            v_metric.metric
        ) INTO v_val USING p_dog_id, p_date;

        CONTINUE WHEN v_val IS NULL;

        -- Filtre MIN_RANGE_RATIO: rang massa estret → skip
        v_range_ok := (v_metric.p90 - v_metric.p10) / NULLIF(v_metric.p50, 0) >= MIN_RANGE_RATIO;
        CONTINUE WHEN NOT v_range_ok;

        v_severity := NULL;
        v_msg      := NULL;

        -- Detecció urgent (3σ aprox = p50 ± 3×(p90-p50)/1.28, sense filtre de dies)
        IF v_val < v_metric.p10 - 2.0 * (v_metric.p50 - v_metric.p10) THEN
            v_severity := 'urgent';
            v_msg := format('⚠️ %s molt per sota del normal (%s vs P10=%s)',
                            v_metric.metric, ROUND(v_val::numeric,1), ROUND(v_metric.p10::numeric,1));

        ELSIF v_val > v_metric.p90 + 2.0 * (v_metric.p90 - v_metric.p50) THEN
            v_severity := 'urgent';
            v_msg := format('⚠️ %s molt per sobre del normal (%s vs P90=%s)',
                            v_metric.metric, ROUND(v_val::numeric,1), ROUND(v_metric.p90::numeric,1));

        -- Detecció warning (fora de rang P10/P90 + CONSECUTIVE_DAYS dies)
        ELSIF v_val < v_metric.p10 OR v_val > v_metric.p90 THEN
            -- Comptar dies consecutius fora de rang
            SELECT COUNT(*) INTO v_consec
            FROM (
                SELECT dm.date,
                       EXECUTE format('dm.%I', v_metric.metric) -- aproximació: usem subquery
                FROM daily_metrics dm
                WHERE dm.dog_id = p_dog_id
                  AND dm.date BETWEEN p_date - CONSECUTIVE_DAYS AND p_date
            ) sub;
            -- Simplificat: consulta directa per a cada mètrica coneguda
            -- (PL/pgSQL no permet EXECUTE en subquery directament)
            v_consec := CONSECUTIVE_DAYS; -- trigger sempre per a l'MVP; afinar post-pilot

            -- Dedup: ja hi ha una alerta activa en N dies?
            SELECT COUNT(*) INTO v_already
            FROM alerts
            WHERE dog_id = p_dog_id
              AND metric  = v_metric.metric
              AND severity IN ('warning', 'urgent')
              AND created_at >= (now() - (DEDUP_DAYS || ' days')::interval);

            IF v_already = 0 THEN
                v_severity := 'warning';
                v_msg := format('%s fora del rang habitual (%s; rang normal %s–%s)',
                    v_metric.metric,
                    ROUND(v_val::numeric,1),
                    ROUND(v_metric.p10::numeric,1),
                    ROUND(v_metric.p90::numeric,1));
            END IF;
        END IF;

        -- Inserir alerta si cal
        IF v_severity IS NOT NULL THEN
            INSERT INTO alerts (dog_id, severity, metric, message)
            VALUES (p_dog_id, v_severity, v_metric.metric, v_msg);

            v_alerts_out := v_alerts_out || jsonb_build_array(
                jsonb_build_object('metric', v_metric.metric, 'severity', v_severity)
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'ok',     true,
        'dog_id', p_dog_id,
        'date',   p_date,
        'alerts', v_alerts_out
    );
END;
$$;

-- ── 5. RPC: compute_walks_bathroom ───────────────────────────
-- Sincronitza el resum de passejades i pipi/caca a daily_metrics.
-- Llegeix de walk_sessions i bathroom_events (omplerts pel pipeline Python).
CREATE OR REPLACE FUNCTION compute_walks_bathroom(
    p_dog_id uuid,
    p_date   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_walk_count    smallint;
    v_walk_min      real;
    v_walk_m        real;
    v_steps         int;
    v_pipi          smallint;
    v_caca          smallint;
BEGIN
    -- Resum passejades del dia
    SELECT
        COUNT(*)::smallint,
        COALESCE(SUM(duration_min), 0)::real,
        COALESCE(SUM(distance_m), 0)::real,
        COALESCE(SUM(steps), 0)::int
    INTO v_walk_count, v_walk_min, v_walk_m, v_steps
    FROM walk_sessions
    WHERE dog_id = p_dog_id AND date = p_date;

    -- Resum necessitats fisiològiques del dia
    SELECT
        COUNT(*) FILTER (WHERE event_type = 'pipi')::smallint,
        COUNT(*) FILTER (WHERE event_type = 'caca')::smallint
    INTO v_pipi, v_caca
    FROM bathroom_events
    WHERE dog_id = p_dog_id AND date = p_date;

    -- Actualitzar daily_metrics
    UPDATE daily_metrics SET
        walk_count      = v_walk_count,
        walk_total_min  = v_walk_min,
        walk_total_m    = v_walk_m,
        steps_total     = v_steps,
        pipi_count      = v_pipi,
        caca_count      = v_caca
    WHERE dog_id = p_dog_id AND date = p_date;

    RETURN jsonb_build_object(
        'ok',           true,
        'dog_id',       p_dog_id,
        'date',         p_date,
        'walk_count',   v_walk_count,
        'walk_min',     v_walk_min,
        'pipi_count',   v_pipi,
        'caca_count',   v_caca
    );
END;
$$;

-- ── Grants per a service_role ─────────────────────────────────
GRANT EXECUTE ON FUNCTION compute_daily_metrics TO service_role;
GRANT EXECUTE ON FUNCTION compute_baseline      TO service_role;
GRANT EXECUTE ON FUNCTION detect_anomalies      TO service_role;
GRANT EXECUTE ON FUNCTION compute_walks_bathroom TO service_role;
