-- 사업 자료는 서비스 관리자 전체가 아닌 소유자와 명시적 부여 계정만 접근한다.
-- 기존 원문에는 소유자를 자동 배정하지 않는다. 확인된 데이터 귀속은 별도 검토 후 복구한다.
-- 추가형·재실행 안전. 이전 API로 되돌리면 권한 경계가 사라지므로 원복 시 보드 경로를 비활성화한다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

ALTER TABLE public.admin_business_plan ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES public."user"(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.admin_business_plan_grant (
  user_id text PRIMARY KEY REFERENCES public."user"(id) ON DELETE RESTRICT,
  can_write boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT false,
  granted_by text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT admin_business_plan_grant_revoked_check CHECK (revoked_at IS NULL OR (can_write=false AND can_export=false))
);

CREATE TABLE IF NOT EXISTS public.admin_business_plan_access_audit (
  id uuid PRIMARY KEY,
  actor_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  action text NOT NULL,
  subject_user_id text REFERENCES public."user"(id) ON DELETE RESTRICT,
  mutation_id uuid,
  request_digest text,
  can_write boolean,
  can_export boolean,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_business_plan_access_audit_request_unique UNIQUE(actor_user_id,mutation_id),
  CONSTRAINT admin_business_plan_access_audit_shape_check CHECK ((
    (action IN ('read','export','access-list') AND subject_user_id IS NULL AND mutation_id IS NULL AND request_digest IS NULL AND can_write IS NULL AND can_export IS NULL)
    OR (action='claim' AND subject_user_id IS NULL AND mutation_id IS NOT NULL AND request_digest ~ '^[a-f0-9]{64}$' AND can_write IS NULL AND can_export IS NULL)
    OR (action IN ('grant','revoke') AND subject_user_id IS NOT NULL AND mutation_id IS NOT NULL AND request_digest ~ '^[a-f0-9]{64}$' AND can_write IS NOT NULL AND can_export IS NOT NULL
      AND (action <> 'revoke' OR (can_write=false AND can_export=false)))
  ) IS TRUE)
);

DROP TRIGGER IF EXISTS admin_business_plan_access_audit_immutable ON public.admin_business_plan_access_audit;
CREATE TRIGGER admin_business_plan_access_audit_immutable BEFORE UPDATE OR DELETE ON public.admin_business_plan_access_audit
  FOR EACH ROW EXECUTE FUNCTION public.admin_business_plan_immutable_guard();
DROP TRIGGER IF EXISTS admin_business_plan_access_audit_truncate_guard ON public.admin_business_plan_access_audit;
CREATE TRIGGER admin_business_plan_access_audit_truncate_guard BEFORE TRUNCATE ON public.admin_business_plan_access_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_business_plan_immutable_guard();

ALTER TABLE public.admin_business_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_business_plan_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_business_plan_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_business_plan_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_business_plan_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_business_plan_access_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_business_plan_grant,public.admin_business_plan_access_audit FROM PUBLIC;
COMMIT;
