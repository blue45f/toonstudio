-- G6 성능 실측 체계: field CWV sample table (traffic_web_vital).
--
-- The other traffic tables (traffic_page_view, traffic_session,
-- traffic_share_event) are likewise created outside this module — the
-- repositories only verify their presence in checkHealth(). Apply this DDL
-- through the same migration path as those tables before deploying the
-- web-vitals intake; without it, persistWebVitals fails and checkHealth()
-- reports not-ready, while page-view/heartbeat/share collection is unaffected.
--
-- Metrics are nullable on purpose: a null means the browser could not observe
-- the metric (e.g. INP on Safari), never a measured zero. CLS keeps 4 decimal
-- places, matching the client/server bounding in web-vitals-model.

-- PostgreSQL -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.traffic_web_vital (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  visitor_hash text NOT NULL,
  session_hash text NOT NULL,
  path text NOT NULL,
  lcp_ms integer,
  cls numeric(8, 4),
  inp_ms integer,
  country_code text,
  device_type text NOT NULL,
  browser text NOT NULL,
  os text NOT NULL
);
CREATE INDEX IF NOT EXISTS traffic_web_vital_occurred_at_idx
  ON public.traffic_web_vital (occurred_at);
CREATE INDEX IF NOT EXISTS traffic_web_vital_path_occurred_at_idx
  ON public.traffic_web_vital (path, occurred_at);

-- D1 (SQLite) ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS traffic_web_vital (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  path TEXT NOT NULL,
  lcp_ms INTEGER,
  cls REAL,
  inp_ms INTEGER,
  country_code TEXT,
  device_type TEXT NOT NULL,
  browser TEXT NOT NULL,
  os TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS traffic_web_vital_occurred_at_idx
  ON traffic_web_vital (occurred_at);
CREATE INDEX IF NOT EXISTS traffic_web_vital_path_occurred_at_idx
  ON traffic_web_vital (path, occurred_at);
