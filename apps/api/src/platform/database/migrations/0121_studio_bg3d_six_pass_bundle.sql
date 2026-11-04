-- 추가형 변경: 기존 image 업로드 한도·문서·레이어·요금 한도를 변경하지 않는다.
-- 재실행은 동일 테이블/인덱스/트리거 정의에서 안전하다. 원복은 새 API를 비활성화하고 행·원본을 보존한다.
-- 테이블/열 삭제와 이미 봉인된 revision의 변환은 원복에 포함하지 않으며 별도 승인이 필요하다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

CREATE TABLE IF NOT EXISTS public.studio_bg3d_bundle_revision (
  "workId" text NOT NULL REFERENCES public.creator_work(id) ON DELETE CASCADE,
  "bundleId" text NOT NULL,
  "renderRevisionId" text NOT NULL,
  "parentRevisionId" text,
  "manifestHash" text NOT NULL,
  manifest jsonb NOT NULL,
  "reservedBytes" bigint NOT NULL,
  state text NOT NULL DEFAULT 'prepared',
  "createdBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "sealedAt" timestamptz,
  PRIMARY KEY ("workId", "bundleId", "renderRevisionId"),
  CONSTRAINT studio_bg3d_bundle_parent_fk FOREIGN KEY ("workId", "bundleId", "parentRevisionId")
    REFERENCES public.studio_bg3d_bundle_revision("workId", "bundleId", "renderRevisionId"),
  CONSTRAINT studio_bg3d_bundle_ids_check CHECK (
    length("bundleId") BETWEEN 1 AND 160 AND length("renderRevisionId") BETWEEN 1 AND 160
    AND ("parentRevisionId" IS NULL OR (length("parentRevisionId") BETWEEN 1 AND 160 AND "parentRevisionId" <> "renderRevisionId"))),
  CONSTRAINT studio_bg3d_bundle_state_check CHECK ((state = 'prepared' AND "sealedAt" IS NULL) OR (state = 'sealed' AND "sealedAt" IS NOT NULL)),
  CONSTRAINT studio_bg3d_bundle_hash_check CHECK ("manifestHash" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT studio_bg3d_bundle_bytes_check CHECK ("reservedBytes" BETWEEN 1 AND 402980864),
  CONSTRAINT studio_bg3d_bundle_manifest_check CHECK ((jsonb_typeof(manifest) = 'object'
    AND manifest->>'contract' = 'toonstudio.bg3d-sixpass-bundle.v1'
    AND manifest->'version' = '1'::jsonb AND manifest->'minimumProjectVersion' = '5'::jsonb
    AND manifest->>'bundleId' = "bundleId" AND manifest->>'renderRevisionId' = "renderRevisionId"
    AND manifest->>'parentRevisionId' IS NOT DISTINCT FROM "parentRevisionId"
    AND jsonb_typeof(manifest->'layers') = 'array' AND jsonb_array_length(manifest->'layers') = 6
    AND octet_length(manifest::text) <= 16384) IS TRUE)
);
CREATE INDEX IF NOT EXISTS studio_bg3d_bundle_work_idx ON public.studio_bg3d_bundle_revision("workId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS studio_bg3d_bundle_sealed_parent_unique
  ON public.studio_bg3d_bundle_revision("workId", "bundleId", (coalesce("parentRevisionId", ''))) WHERE state = 'sealed';

CREATE TABLE IF NOT EXISTS public.studio_bg3d_bundle_artifact (
  "workId" text NOT NULL, "bundleId" text NOT NULL, "renderRevisionId" text NOT NULL,
  role text NOT NULL, "contentHash" text NOT NULL, "byteSize" bigint NOT NULL, "objectReference" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("workId", "bundleId", "renderRevisionId", role),
  CONSTRAINT studio_bg3d_bundle_artifact_revision_fk FOREIGN KEY ("workId", "bundleId", "renderRevisionId")
    REFERENCES public.studio_bg3d_bundle_revision("workId", "bundleId", "renderRevisionId") ON DELETE CASCADE,
  CONSTRAINT studio_bg3d_artifact_role_check CHECK (role IN ('scene','color','tone','shadow','depth','texture-line','main-line')),
  CONSTRAINT studio_bg3d_artifact_hash_check CHECK ("contentHash" ~ '^sha256:[a-f0-9]{64}$'),
  CONSTRAINT studio_bg3d_artifact_bytes_check CHECK ("byteSize" BETWEEN 1 AND 67108864 AND (role <> 'scene' OR "byteSize" <= 327680)),
  CONSTRAINT studio_bg3d_artifact_object_check CHECK (("objectReference"->>'purpose' = 'source'
    AND "objectReference"->>'digest' = "contentHash" AND ("objectReference"->>'byteLength')::bigint = "byteSize") IS TRUE)
);

CREATE OR REPLACE FUNCTION public.studio_bg3d_bundle_guard() RETURNS trigger LANGUAGE plpgsql
SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE revision public.studio_bg3d_bundle_revision%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.creator_work WHERE id = OLD."workId") THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'BG3D bundle revisions are retained until work deletion';
  END IF;
  IF TG_TABLE_NAME = 'studio_bg3d_bundle_artifact' THEN
    IF TG_OP = 'UPDATE' THEN
      IF to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'BG3D artifact is immutable';
    END IF;
    SELECT * INTO STRICT revision FROM public.studio_bg3d_bundle_revision
      WHERE "workId" = NEW."workId" AND "bundleId" = NEW."bundleId" AND "renderRevisionId" = NEW."renderRevisionId" FOR UPDATE;
    IF revision.state <> 'prepared' THEN RAISE EXCEPTION 'sealed BG3D revision cannot accept artifacts'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'prepared' THEN RAISE EXCEPTION 'BG3D revision must start prepared'; END IF;
    RETURN NEW;
  END IF;
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
  IF NEW."createdBy" IS NULL AND OLD."createdBy" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public."user" WHERE id=OLD."createdBy")
    AND (to_jsonb(NEW)-'createdBy') = (to_jsonb(OLD)-'createdBy') THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-'state'-'sealedAt') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'sealedAt')
    OR OLD.state <> 'prepared' OR NEW.state <> 'sealed' OR NEW."sealedAt" < OLD."createdAt" THEN
    RAISE EXCEPTION 'BG3D revision manifest and parent are immutable';
  END IF;
  IF (SELECT count(*) FROM public.studio_bg3d_bundle_artifact
    WHERE "workId"=NEW."workId" AND "bundleId"=NEW."bundleId" AND "renderRevisionId"=NEW."renderRevisionId") <> 7 THEN
    RAISE EXCEPTION 'BG3D revision requires scene and six artifacts';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS studio_bg3d_revision_guard ON public.studio_bg3d_bundle_revision;
CREATE TRIGGER studio_bg3d_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON public.studio_bg3d_bundle_revision
  FOR EACH ROW EXECUTE FUNCTION public.studio_bg3d_bundle_guard();
DROP TRIGGER IF EXISTS studio_bg3d_artifact_guard ON public.studio_bg3d_bundle_artifact;
CREATE TRIGGER studio_bg3d_artifact_guard BEFORE INSERT OR UPDATE OR DELETE ON public.studio_bg3d_bundle_artifact
  FOR EACH ROW EXECUTE FUNCTION public.studio_bg3d_bundle_guard();
REVOKE ALL ON FUNCTION public.studio_bg3d_bundle_guard() FROM PUBLIC;
REVOKE ALL ON TABLE public.studio_bg3d_bundle_revision, public.studio_bg3d_bundle_artifact FROM PUBLIC;
COMMIT;
