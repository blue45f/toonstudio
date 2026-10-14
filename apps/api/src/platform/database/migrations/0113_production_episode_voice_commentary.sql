-- Episode review voice commentary: recorded narration pinned to one episode
-- of a production project, with the view keyframes captured while recording.
-- This is not call recording and grants no review, publication, document,
-- or media authority beyond the project's existing collaboration access.
BEGIN;

CREATE TABLE IF NOT EXISTS production_episode_voice_commentary (
  id text PRIMARY KEY,
  "projectId" text NOT NULL REFERENCES production_project(id) ON DELETE CASCADE,
  "episodeId" text NOT NULL,
  "authorUserId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  track jsonb NOT NULL,
  "durationMs" integer NOT NULL CHECK ("durationMs" BETWEEN 0 AND 86400000),
  "contentType" text NOT NULL CHECK ("contentType" IN ('audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav')),
  "byteLength" integer NOT NULL CHECK ("byteLength" BETWEEN 1 AND 5242880),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  "objectReference" jsonb NOT NULL,
  "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  "operationId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  "expiresAt" timestamptz NOT NULL,
  "deletedAt" timestamptz,
  "deleteOperationId" text,
  CONSTRAINT production_episode_voice_commentary_retention CHECK (
    "expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '30 days'
  ),
  CONSTRAINT production_episode_voice_commentary_delete_state CHECK (
    ("deletedAt" IS NULL AND "deleteOperationId" IS NULL)
    OR ("deletedAt" IS NOT NULL AND "deleteOperationId" IS NOT NULL AND "deletedAt" >= "createdAt")
  ),
  CONSTRAINT production_episode_voice_commentary_track CHECK (
    jsonb_typeof(track) = 'object'
    AND track->>'version' = '1'
    AND track->>'id' = id
    AND track->>'episodeId' = "episodeId"
    AND nullif(track->>'authorName','') IS NOT NULL
  ),
  CONSTRAINT production_episode_voice_commentary_object CHECK (
    jsonb_typeof("objectReference") = 'object'
    AND "objectReference"->>'contractVersion' = 'toonspectrum.private-object-storage.v2'
    AND "objectReference"->>'purpose' = 'derived'
    AND "objectReference"->>'contentType' = "contentType"
    AND ("objectReference"->>'byteLength')::integer = "byteLength"
    AND "objectReference"->>'digest' = 'sha256:' || sha256
    AND nullif("objectReference"->>'providerId','') IS NOT NULL
    AND nullif("objectReference"->>'objectPath','') IS NOT NULL
  ),
  CONSTRAINT production_episode_voice_commentary_operation_unique UNIQUE ("authorUserId", "operationId")
);

CREATE INDEX IF NOT EXISTS idx_production_episode_voice_commentary_episode
  ON production_episode_voice_commentary ("projectId", "episodeId", "createdAt" DESC)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_production_episode_voice_commentary_expiry
  ON production_episode_voice_commentary ("expiresAt")
  WHERE "deletedAt" IS NULL;

CREATE OR REPLACE FUNCTION production_episode_voice_commentary_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."deletedAt" IS NOT NULL OR NEW."deleteOperationId" IS NOT NULL THEN
      RAISE EXCEPTION 'new episode voice commentary cannot start deleted';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM production_project WHERE id = OLD."projectId") THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'episode voice commentary is retained until parent deletion';
  END IF;
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-'deletedAt'-'deleteOperationId') IS DISTINCT FROM
     (to_jsonb(OLD)-'deletedAt'-'deleteOperationId') THEN
    RAISE EXCEPTION 'episode voice commentary immutable fields changed';
  END IF;
  IF OLD."deletedAt" IS NOT NULL OR NEW."deletedAt" IS NULL OR NEW."deleteOperationId" IS NULL
     OR NEW."deletedAt" < OLD."createdAt" THEN
    RAISE EXCEPTION 'invalid episode voice commentary deletion transition';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS production_episode_voice_commentary_guard_update ON production_episode_voice_commentary;
CREATE TRIGGER production_episode_voice_commentary_guard_update BEFORE INSERT OR UPDATE OR DELETE ON production_episode_voice_commentary
  FOR EACH ROW EXECUTE FUNCTION production_episode_voice_commentary_guard();

REVOKE ALL ON TABLE production_episode_voice_commentary FROM PUBLIC;
REVOKE ALL ON FUNCTION production_episode_voice_commentary_guard() FROM PUBLIC;
COMMIT;
