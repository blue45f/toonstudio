-- NOT EXECUTED (the coordinator froze all further DB writes before the password rotation).
-- Objects that exist outside production-database-migrations.manifest. Run after the rotation with the new libpq env:
--   <onpod-run.sh> psql -X -v ON_ERROR_STOP=1 -1 -f sql/40-out-of-manifest-objects.sql
-- Sources (pinned commit 37b5183, DDL copied verbatim, only whitespace re-indented):
--   [A] apps/api/src/modules/traffic-analytics/traffic-web-vital.schema.sql   (PostgreSQL section)
--   [B] apps/api/src/modules/studio-ai/studio-3d-generation-postgres-store.ts  (#bootstrap, jobs + artifacts)
--   [C] apps/api/src/modules/studio-ai/studio-3d-generation-provider-identity-store.ts (#client, identities)
-- [B]/[C] are what the API itself executes lazily at runtime (CREATE TABLE IF NOT EXISTS); pre-creating them is required
-- once the API runs as a separate non-owning role that cannot CREATE in public.
SET search_path = public;

-- [A] traffic_web_vital
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

-- [B] studio_3d_generation_jobs / studio_3d_generation_artifacts
CREATE TABLE IF NOT EXISTS studio_3d_generation_jobs (
  job_id text PRIMARY KEY,
  user_id text NOT NULL,
  idempotency_key_hash text NOT NULL,
  generation integer NOT NULL,
  state text NOT NULL,
  created_at_ms bigint NOT NULL,
  updated_at_ms bigint NOT NULL,
  record_json jsonb NOT NULL,
  UNIQUE (user_id, idempotency_key_hash)
);
CREATE INDEX IF NOT EXISTS studio_3d_generation_jobs_user_created_idx
  ON studio_3d_generation_jobs (user_id, created_at_ms DESC);
CREATE TABLE IF NOT EXISTS studio_3d_generation_artifacts (
  revision_id text PRIMARY KEY,
  source_job_id text NOT NULL REFERENCES studio_3d_generation_jobs(job_id) ON DELETE RESTRICT,
  content_hash_sha256 text NOT NULL,
  byte_length bigint NOT NULL,
  mime_type text NOT NULL,
  object_key text NOT NULL,
  revision_json jsonb NOT NULL,
  artifact_bytes bytea NOT NULL,
  created_at_ms bigint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_3d_generation_artifacts_hash_idx
  ON studio_3d_generation_artifacts (content_hash_sha256);

-- [C] studio_3d_generation_provider_identities
CREATE TABLE IF NOT EXISTS studio_3d_generation_provider_identities (
  job_id text PRIMARY KEY,
  sealed_identity text NOT NULL,
  updated_at_ms bigint NOT NULL
);
