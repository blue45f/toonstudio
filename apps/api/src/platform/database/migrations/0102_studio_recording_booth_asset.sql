-- Recording-booth takes saved as durable project assets for a work.
-- This is not call recording and grants no review, publication, document, or media authority.
BEGIN;

CREATE TABLE IF NOT EXISTS studio_recording_booth_asset (
  id text PRIMARY KEY,
  "workId" text NOT NULL REFERENCES creator_work(id) ON DELETE CASCADE,
  "authorUserId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  "boothId" text NOT NULL CHECK (char_length("boothId") BETWEEN 1 AND 160),
  "durationMs" integer NOT NULL CHECK ("durationMs" BETWEEN 1 AND 300000),
  "contentType" text NOT NULL CHECK ("contentType" IN ('audio/webm')),
  "byteLength" integer NOT NULL CHECK ("byteLength" BETWEEN 1 AND 5242880),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  "objectReference" jsonb NOT NULL,
  "requestHash" text NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
  "operationId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT statement_timestamp(),
  "deletedAt" timestamptz,
  "deleteOperationId" text,
  CONSTRAINT studio_recording_booth_asset_delete_state CHECK (
    ("deletedAt" IS NULL AND "deleteOperationId" IS NULL)
    OR ("deletedAt" IS NOT NULL AND "deleteOperationId" IS NOT NULL AND "deletedAt" >= "createdAt")
  ),
  CONSTRAINT studio_recording_booth_asset_object CHECK (
    jsonb_typeof("objectReference") = 'object'
    AND "objectReference"->>'contractVersion' = 'toonspectrum.private-object-storage.v2'
    AND "objectReference"->>'purpose' = 'derived'
    AND "objectReference"->>'contentType' = "contentType"
    AND ("objectReference"->>'byteLength')::integer = "byteLength"
    AND "objectReference"->>'digest' = 'sha256:' || sha256
    AND nullif("objectReference"->>'providerId','') IS NOT NULL
    AND nullif("objectReference"->>'objectPath','') IS NOT NULL
  ),
  CONSTRAINT studio_recording_booth_asset_operation_unique UNIQUE ("authorUserId", "operationId")
);

CREATE INDEX IF NOT EXISTS studio_recording_booth_asset_work_idx
  ON studio_recording_booth_asset ("workId", "createdAt" DESC)
  WHERE "deletedAt" IS NULL;

CREATE OR REPLACE FUNCTION studio_recording_booth_asset_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."deletedAt" IS NOT NULL OR NEW."deleteOperationId" IS NOT NULL THEN
      RAISE EXCEPTION 'new recording booth asset cannot start deleted';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM creator_work WHERE id = OLD."workId") THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'recording booth asset is retained until parent deletion';
  END IF;
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-'deletedAt'-'deleteOperationId') IS DISTINCT FROM
     (to_jsonb(OLD)-'deletedAt'-'deleteOperationId') THEN
    RAISE EXCEPTION 'recording booth asset immutable fields changed';
  END IF;
  IF OLD."deletedAt" IS NOT NULL OR NEW."deletedAt" IS NULL OR NEW."deleteOperationId" IS NULL
     OR NEW."deletedAt" < OLD."createdAt" THEN
    RAISE EXCEPTION 'invalid recording booth asset deletion transition';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS studio_recording_booth_asset_guard_update ON studio_recording_booth_asset;
CREATE TRIGGER studio_recording_booth_asset_guard_update BEFORE INSERT OR UPDATE OR DELETE ON studio_recording_booth_asset
  FOR EACH ROW EXECUTE FUNCTION studio_recording_booth_asset_guard();

REVOKE ALL ON TABLE studio_recording_booth_asset FROM PUBLIC;
REVOKE ALL ON FUNCTION studio_recording_booth_asset_guard() FROM PUBLIC;
COMMIT;
