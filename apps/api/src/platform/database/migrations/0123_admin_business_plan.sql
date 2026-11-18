-- 추가형 사업계획서 저장소. 기존 계정·원고·운영 정책은 변경하지 않는다.
-- 실행 승인은 기록만 보관하며 코드 수정·외부 제출·계정 변경·배포를 실행하지 않는다.
-- 재실행은 저장된 revision을 보존한다. 원복은 새 API를 비활성화하고 네 테이블을 보존한다.
-- 데이터 복구는 보관된 revision을 검토해 새 revision으로 저장한다. 기존 이력의 수정·삭제는 허용하지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

CREATE TABLE IF NOT EXISTS public.admin_business_plan (
  id integer PRIMARY KEY,
  revision integer NOT NULL DEFAULT 0,
  payload jsonb,
  updated_at timestamptz,
  CONSTRAINT admin_business_plan_singleton_check CHECK (id = 1),
  CONSTRAINT admin_business_plan_revision_check CHECK (revision >= 0),
  CONSTRAINT admin_business_plan_state_check CHECK (
    (revision = 0 AND payload IS NULL AND updated_at IS NULL)
    OR (revision > 0 AND payload IS NOT NULL AND updated_at IS NOT NULL
      AND (jsonb_typeof(payload) = 'object' AND payload->'schemaVersion' = '1'::jsonb) IS TRUE)
  )
);

CREATE TABLE IF NOT EXISTS public.admin_business_plan_revision (
  revision integer PRIMARY KEY,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_business_plan_snapshot_revision_check CHECK (revision > 0),
  CONSTRAINT admin_business_plan_snapshot_payload_check CHECK (
    (jsonb_typeof(payload) = 'object' AND payload->'schemaVersion' = '1'::jsonb) IS TRUE
  )
);

CREATE TABLE IF NOT EXISTS public.admin_business_plan_audit (
  revision integer PRIMARY KEY REFERENCES public.admin_business_plan_revision(revision) ON DELETE RESTRICT,
  actor_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  before_digest text NOT NULL,
  after_digest text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_business_plan_audit_before_digest_check CHECK (before_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT admin_business_plan_audit_after_digest_check CHECK (after_digest ~ '^[a-f0-9]{64}$')
);

CREATE TABLE IF NOT EXISTS public.admin_business_plan_receipt (
  actor_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  mutation_id uuid NOT NULL,
  request_digest text NOT NULL,
  accepted_revision integer NOT NULL REFERENCES public.admin_business_plan_revision(revision) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_user_id, mutation_id),
  CONSTRAINT admin_business_plan_receipt_digest_check CHECK (request_digest ~ '^[a-f0-9]{64}$')
);

-- 현재값과 별도로 원본 snapshot·감사·멱등성 기록을 append-only로 보호한다.
-- 단일 소유자 DB에서도 현재값 삭제로 revision을 재시작하거나 TRUNCATE로 이력을 지울 수 없다.
CREATE OR REPLACE FUNCTION public.admin_business_plan_immutable_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  RAISE EXCEPTION 'Business plan history is immutable' USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS admin_business_plan_delete_guard ON public.admin_business_plan;
CREATE TRIGGER admin_business_plan_delete_guard BEFORE DELETE ON public.admin_business_plan
  FOR EACH ROW EXECUTE FUNCTION public.admin_business_plan_immutable_guard();

DROP TRIGGER IF EXISTS admin_business_plan_revision_immutable ON public.admin_business_plan_revision;
CREATE TRIGGER admin_business_plan_revision_immutable BEFORE UPDATE OR DELETE ON public.admin_business_plan_revision
  FOR EACH ROW EXECUTE FUNCTION public.admin_business_plan_immutable_guard();
DROP TRIGGER IF EXISTS admin_business_plan_audit_immutable ON public.admin_business_plan_audit;
CREATE TRIGGER admin_business_plan_audit_immutable BEFORE UPDATE OR DELETE ON public.admin_business_plan_audit
  FOR EACH ROW EXECUTE FUNCTION public.admin_business_plan_immutable_guard();
DROP TRIGGER IF EXISTS admin_business_plan_receipt_immutable ON public.admin_business_plan_receipt;
CREATE TRIGGER admin_business_plan_receipt_immutable BEFORE UPDATE OR DELETE ON public.admin_business_plan_receipt
  FOR EACH ROW EXECUTE FUNCTION public.admin_business_plan_immutable_guard();

DROP TRIGGER IF EXISTS admin_business_plan_truncate_guard ON public.admin_business_plan;
CREATE TRIGGER admin_business_plan_truncate_guard BEFORE TRUNCATE ON public.admin_business_plan
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_business_plan_immutable_guard();
DROP TRIGGER IF EXISTS admin_business_plan_revision_truncate_guard ON public.admin_business_plan_revision;
CREATE TRIGGER admin_business_plan_revision_truncate_guard BEFORE TRUNCATE ON public.admin_business_plan_revision
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_business_plan_immutable_guard();
DROP TRIGGER IF EXISTS admin_business_plan_audit_truncate_guard ON public.admin_business_plan_audit;
CREATE TRIGGER admin_business_plan_audit_truncate_guard BEFORE TRUNCATE ON public.admin_business_plan_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_business_plan_immutable_guard();
DROP TRIGGER IF EXISTS admin_business_plan_receipt_truncate_guard ON public.admin_business_plan_receipt;
CREATE TRIGGER admin_business_plan_receipt_truncate_guard BEFORE TRUNCATE ON public.admin_business_plan_receipt
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_business_plan_immutable_guard();

REVOKE ALL ON FUNCTION public.admin_business_plan_immutable_guard() FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_business_plan, public.admin_business_plan_revision,
  public.admin_business_plan_audit, public.admin_business_plan_receipt FROM PUBLIC;
COMMIT;
