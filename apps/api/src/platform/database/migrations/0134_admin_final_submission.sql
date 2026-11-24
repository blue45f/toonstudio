-- 개인별 1R 최종 제출 점검과 서버 감사·멱등 영수증만 추가한다. 실제 제출·파일·문서는 변경하지 않는다.
-- 재적용은 기존 자료를 보존한다. 복구 시 이전 API 이미지로 돌아가고 새 테이블·이력은 남긴다.
-- 운영 DB 적용은 별도 승인 대상이며 요청 처리·앱 시작에서 이 SQL을 실행하지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

CREATE TABLE IF NOT EXISTS public.admin_final_submission (
  owner_user_id text PRIMARY KEY REFERENCES public."user"(id) ON DELETE RESTRICT,
  revision integer NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 2147483647),
  payload jsonb,
  updated_at timestamptz,
  CONSTRAINT admin_final_submission_payload_check CHECK ((
    (revision=0 AND payload IS NULL AND updated_at IS NULL) OR
    (revision>0 AND updated_at IS NOT NULL AND jsonb_typeof(payload)='object'
      AND payload->'schemaVersion'='1'::jsonb AND payload->'revision'=to_jsonb(revision)
      AND jsonb_typeof(payload->'documents')='array' AND jsonb_typeof(payload->'tasks')='array'
      AND jsonb_typeof(payload->'sources')='array' AND jsonb_typeof(payload->'updatedAt')='string')
  ) IS TRUE)
);

CREATE TABLE IF NOT EXISTS public.admin_final_submission_audit (
  owner_user_id text NOT NULL REFERENCES public.admin_final_submission(owner_user_id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision BETWEEN 1 AND 2147483647),
  actor_user_id text NOT NULL CHECK (actor_user_id=owner_user_id),
  mutation_id uuid NOT NULL,
  summary text NOT NULL CHECK (length(summary) BETWEEN 1 AND 500 AND length(btrim(summary))>0),
  before_digest text NOT NULL CHECK (before_digest ~ '^[a-f0-9]{64}$'),
  after_digest text NOT NULL CHECK (after_digest ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY(owner_user_id,revision),
  UNIQUE(owner_user_id,mutation_id)
);

CREATE TABLE IF NOT EXISTS public.admin_final_submission_receipt (
  owner_user_id text NOT NULL,
  mutation_id uuid NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  accepted_revision integer NOT NULL CHECK (accepted_revision BETWEEN 1 AND 2147483647),
  PRIMARY KEY(owner_user_id,mutation_id),
  FOREIGN KEY(owner_user_id,accepted_revision)
    REFERENCES public.admin_final_submission_audit(owner_user_id,revision) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.admin_final_submission_immutable_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  RAISE EXCEPTION 'Final submission history must be preserved' USING ERRCODE='23514';
END $$;

DROP TRIGGER IF EXISTS admin_final_submission_delete_guard ON public.admin_final_submission;
CREATE TRIGGER admin_final_submission_delete_guard BEFORE DELETE ON public.admin_final_submission
  FOR EACH ROW EXECUTE FUNCTION public.admin_final_submission_immutable_guard();
DROP TRIGGER IF EXISTS admin_final_submission_truncate_guard ON public.admin_final_submission;
CREATE TRIGGER admin_final_submission_truncate_guard BEFORE TRUNCATE ON public.admin_final_submission
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_final_submission_immutable_guard();
DROP TRIGGER IF EXISTS admin_final_submission_audit_immutable ON public.admin_final_submission_audit;
CREATE TRIGGER admin_final_submission_audit_immutable BEFORE UPDATE OR DELETE ON public.admin_final_submission_audit
  FOR EACH ROW EXECUTE FUNCTION public.admin_final_submission_immutable_guard();
DROP TRIGGER IF EXISTS admin_final_submission_audit_truncate_guard ON public.admin_final_submission_audit;
CREATE TRIGGER admin_final_submission_audit_truncate_guard BEFORE TRUNCATE ON public.admin_final_submission_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_final_submission_immutable_guard();
DROP TRIGGER IF EXISTS admin_final_submission_receipt_immutable ON public.admin_final_submission_receipt;
CREATE TRIGGER admin_final_submission_receipt_immutable BEFORE UPDATE OR DELETE ON public.admin_final_submission_receipt
  FOR EACH ROW EXECUTE FUNCTION public.admin_final_submission_immutable_guard();
DROP TRIGGER IF EXISTS admin_final_submission_receipt_truncate_guard ON public.admin_final_submission_receipt;
CREATE TRIGGER admin_final_submission_receipt_truncate_guard BEFORE TRUNCATE ON public.admin_final_submission_receipt
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_final_submission_immutable_guard();

ALTER TABLE public.admin_final_submission ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_final_submission_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_final_submission_receipt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION public.admin_final_submission_immutable_guard() FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_final_submission,public.admin_final_submission_audit,public.admin_final_submission_receipt FROM PUBLIC;
COMMIT;
