-- 영역별 버전과 사업 자료의 명시적 소유권을 추가한다. 기존 원문·감사는 변경하지 않는다.
-- 과거 updated_by는 소유권 증거가 아니므로 owner 없는 기존 사업 자료는 계속 비공개로 거부한다.
-- 원복은 이전 코드 배포와 별개로 자료를 보존한다. 열·원문·권한 이력 삭제는 별도 승인 대상이다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.admin_workspace
  ADD COLUMN IF NOT EXISTS operations_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS operations_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS business_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS business_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS business_owner_user_id text REFERENCES public."user"(id) ON DELETE RESTRICT;
ALTER TABLE public.admin_workspace_audit
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS scope_revision integer;
ALTER TABLE public.admin_workspace_receipt
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS accepted_scope_revision integer;

DO $admin_workspace_scope_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.admin_workspace'::regclass AND conname='admin_workspace_operations_scope_check') THEN
    ALTER TABLE public.admin_workspace ADD CONSTRAINT admin_workspace_operations_scope_check CHECK (
      (operations_revision=0 AND operations_updated_at IS NULL) OR (operations_revision>0 AND operations_updated_at IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.admin_workspace'::regclass AND conname='admin_workspace_business_scope_check') THEN
    ALTER TABLE public.admin_workspace ADD CONSTRAINT admin_workspace_business_scope_check CHECK (
      (business_revision=0 AND business_updated_at IS NULL) OR (business_revision>0 AND business_updated_at IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.admin_workspace_audit'::regclass AND conname='admin_workspace_audit_scope_check') THEN
    ALTER TABLE public.admin_workspace_audit ADD CONSTRAINT admin_workspace_audit_scope_check CHECK (((scope='legacy' AND scope_revision IS NULL)
      OR (scope IN ('operations','business') AND scope_revision>0)) IS TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.admin_workspace_receipt'::regclass AND conname='admin_workspace_receipt_scope_check') THEN
    ALTER TABLE public.admin_workspace_receipt ADD CONSTRAINT admin_workspace_receipt_scope_check CHECK (((scope='legacy' AND accepted_scope_revision IS NULL)
      OR (scope IN ('operations','business') AND accepted_scope_revision>0)) IS TRUE);
  END IF;
END;
$admin_workspace_scope_constraints$;

CREATE TABLE IF NOT EXISTS public.admin_workspace_business_grant (
  board_id text NOT NULL REFERENCES public.admin_workspace(id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  can_write boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT false,
  granted_by text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY(board_id,user_id),
  CONSTRAINT admin_workspace_grant_revoked_check CHECK (revoked_at IS NULL OR (NOT can_write AND NOT can_export))
);
CREATE TABLE IF NOT EXISTS public.admin_workspace_access_audit (
  id uuid PRIMARY KEY,
  board_id text NOT NULL REFERENCES public.admin_workspace(id) ON DELETE RESTRICT,
  actor_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  subject_user_id text REFERENCES public."user"(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('read','export','claim','access-list','grant','revoke')),
  mutation_id uuid,
  request_digest text,
  can_write boolean,
  can_export boolean,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(board_id,actor_user_id,mutation_id),
  CONSTRAINT admin_workspace_access_event_check CHECK (((
    action IN ('read','export','claim','access-list') AND subject_user_id IS NULL AND mutation_id IS NULL
      AND request_digest IS NULL AND can_write IS NULL AND can_export IS NULL
  ) OR (
    action IN ('grant','revoke') AND subject_user_id IS NOT NULL AND mutation_id IS NOT NULL
      AND request_digest ~ '^[a-f0-9]{64}$' AND can_write IS NOT NULL AND can_export IS NOT NULL
      AND (action='grant' OR (NOT can_write AND NOT can_export))
  )) IS TRUE)
);

ALTER TABLE public.admin_workspace_business_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_workspace_access_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_workspace_business_grant,public.admin_workspace_access_audit FROM PUBLIC;
DO $admin_workspace_access_privacy$
DECLARE browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.admin_workspace_business_grant,public.admin_workspace_access_audit FROM %I',browser_role);
    END IF;
  END LOOP;
END;
$admin_workspace_access_privacy$;
COMMIT;
