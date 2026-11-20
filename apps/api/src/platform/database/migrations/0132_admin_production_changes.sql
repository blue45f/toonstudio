-- 제작 변경 요청·서버 감사 이력·비공개 캡처 참조만 추가한다. 실제 제작·배포 작업은 실행하지 않는다.
-- 재실행은 기존 기록을 보존한다. 복구는 새 API 노출을 중지하고 원장과 증빙을 보존한다.
-- 자동 rollback으로 테이블이나 운영 데이터를 삭제하지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

CREATE TABLE IF NOT EXISTS public.admin_production_change_request (
  id uuid PRIMARY KEY,
  version integer NOT NULL CHECK (version > 0),
  document jsonb NOT NULL,
  created_by text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  updated_by text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_production_change_document_check CHECK ((
    jsonb_typeof(document) = 'object' AND document->>'id' = id::text
    AND document->'version' = to_jsonb(version) AND jsonb_typeof(document->'data') = 'object'
    AND jsonb_typeof(document->'history') = 'array'
    AND document->>'status' IN ('draft','submitted','analysis','review','approved','rejected','scheduled','applied','verified','closed')
    AND octet_length(document::text) <= 2097152) IS TRUE)
);
CREATE INDEX IF NOT EXISTS admin_production_change_updated_idx ON public.admin_production_change_request(updated_at DESC,id);

CREATE TABLE IF NOT EXISTS public.admin_production_change_audit (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.admin_production_change_request(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  actor_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  mutation_id uuid NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  action text NOT NULL CHECK (action IN ('create','save','transition')),
  before_document jsonb,
  after_document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_production_change_mutation_unique UNIQUE(actor_id,mutation_id),
  CONSTRAINT admin_production_change_before_check CHECK (((action='create' AND before_document IS NULL) OR
    (action<>'create' AND jsonb_typeof(before_document)='object' AND before_document->>'id'=request_id::text
      AND octet_length(before_document::text)<=2097152)) IS TRUE),
  CONSTRAINT admin_production_change_after_check CHECK ((jsonb_typeof(after_document)='object'
    AND after_document->>'id'=request_id::text AND after_document->'version'=to_jsonb(version)
    AND octet_length(after_document::text)<=2097152) IS TRUE)
);
CREATE INDEX IF NOT EXISTS admin_production_change_audit_request_idx ON public.admin_production_change_audit(request_id,created_at,id);

CREATE TABLE IF NOT EXISTS public.admin_production_change_capture (
  id uuid PRIMARY KEY,
  object_reference jsonb NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp')),
  byte_length integer NOT NULL CHECK (byte_length BETWEEN 1 AND 5242880),
  created_by text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_production_change_capture_reference_check CHECK ((jsonb_typeof(object_reference)='object'
    AND object_reference->>'purpose'='derived' AND object_reference->>'contentType'=content_type
    AND object_reference->'byteLength'=to_jsonb(byte_length)
    AND object_reference->>'digest' ~ '^sha256:[a-f0-9]{64}$'
    AND octet_length(object_reference::text)<=16384) IS TRUE)
);

CREATE OR REPLACE FUNCTION public.admin_production_change_evidence_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'Production change evidence is append-only' USING ERRCODE = '23514';
END $$;
DROP TRIGGER IF EXISTS admin_production_change_audit_immutable ON public.admin_production_change_audit;
CREATE TRIGGER admin_production_change_audit_immutable BEFORE UPDATE OR DELETE ON public.admin_production_change_audit
  FOR EACH ROW EXECUTE FUNCTION public.admin_production_change_evidence_immutable();
DROP TRIGGER IF EXISTS admin_production_change_capture_immutable ON public.admin_production_change_capture;
CREATE TRIGGER admin_production_change_capture_immutable BEFORE UPDATE OR DELETE ON public.admin_production_change_capture
  FOR EACH ROW EXECUTE FUNCTION public.admin_production_change_evidence_immutable();
REVOKE ALL ON FUNCTION public.admin_production_change_evidence_immutable() FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_production_change_request,public.admin_production_change_audit,public.admin_production_change_capture FROM PUBLIC;
COMMIT;
