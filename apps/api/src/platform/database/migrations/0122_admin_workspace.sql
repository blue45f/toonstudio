-- 관리자 기록 저장만 추가한다. 원문·근거·공유 URL을 migration이나 공개 소스에 포함하지 않는다.
-- 재실행은 기존 기록을 보존한다. 원복은 이전 API/Web으로 되돌리고 새 테이블을 남긴다.
-- 원문·감사·receipt 영구 삭제는 이 migration의 원복에 포함하지 않으며 별도 승인·백업이 필요하다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.admin_workspace (
  id text PRIMARY KEY CHECK (id='toonstudio'),
  revision integer NOT NULL DEFAULT 0 CHECK (revision>=0),
  payload jsonb,
  payload_digest text,
  updated_by text REFERENCES public."user"(id) ON DELETE SET NULL,
  updated_at timestamptz,
  CONSTRAINT admin_workspace_state_check CHECK (((
    revision=0 AND payload IS NULL AND payload_digest IS NULL AND updated_by IS NULL AND updated_at IS NULL
  ) OR (
    revision>0 AND jsonb_typeof(payload)='object'
    AND payload->>'kind'='toonstudio-admin-workspace' AND payload->'schemaVersion'='1'::jsonb
    AND payload_digest ~ '^[a-f0-9]{64}$' AND octet_length(payload::text)<=12582912 AND updated_at IS NOT NULL
  )) IS TRUE)
);
CREATE TABLE IF NOT EXISTS public.admin_workspace_audit (
  board_id text NOT NULL REFERENCES public.admin_workspace(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision>0),
  actor_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('import','save')),
  before_digest text,
  after_digest text NOT NULL CHECK (after_digest ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(board_id,revision),
  CONSTRAINT admin_workspace_audit_before_check CHECK (((revision=1 AND before_digest IS NULL) OR (revision>1 AND before_digest ~ '^[a-f0-9]{64}$')) IS TRUE)
);
CREATE TABLE IF NOT EXISTS public.admin_workspace_receipt (
  board_id text NOT NULL,
  actor_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  mutation_id uuid NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  accepted_revision integer NOT NULL,
  accepted_at timestamptz NOT NULL,
  PRIMARY KEY(board_id,actor_user_id,mutation_id),
  FOREIGN KEY(board_id,accepted_revision) REFERENCES public.admin_workspace_audit(board_id,revision) ON DELETE RESTRICT
);

-- 구조만 준비한다. 실제 5개 보드 자료는 관리자가 인증된 화면에서 가져온다.
INSERT INTO public.admin_workspace(id) VALUES('toonstudio') ON CONFLICT(id) DO NOTHING;

ALTER TABLE public.admin_workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_workspace_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_workspace_receipt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_workspace, public.admin_workspace_audit, public.admin_workspace_receipt FROM PUBLIC;
DO $admin_workspace_privacy$
DECLARE browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.admin_workspace, public.admin_workspace_audit, public.admin_workspace_receipt FROM %I',browser_role);
    END IF;
  END LOOP;
END;
$admin_workspace_privacy$;
-- 승인된 runtime role의 최소 권한은 admin-workspace-database-contract.mjs로 부여한다.
COMMIT;
