-- AI 모델 종료·무료 플랜 한도의 공용 검토 기록. 계정·인프라 설정은 변경하지 않는다.
-- 재실행은 기존 보드·감사 기록을 보존한다. 앱 롤백 시 이 추가형 테이블은 보존한다.
BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_ai_operations_board (
  id integer PRIMARY KEY CONSTRAINT admin_ai_operations_board_singleton CHECK (id=1),
  revision integer NOT NULL DEFAULT 0 CONSTRAINT admin_ai_operations_board_revision CHECK (revision>=0),
  payload jsonb,
  updated_at timestamptz,
  CONSTRAINT admin_ai_operations_board_state CHECK (
    (revision=0 AND payload IS NULL AND updated_at IS NULL)
    OR (revision>0 AND payload IS NOT NULL AND updated_at IS NOT NULL)
  ),
  CONSTRAINT admin_ai_operations_board_payload CHECK (payload IS NULL OR (
    jsonb_typeof(payload)='object' AND payload ?& ARRAY['meta','items','sources']
    AND jsonb_typeof(payload->'meta')='object'
    AND jsonb_typeof(payload->'items')='array' AND jsonb_typeof(payload->'sources')='array'
    AND octet_length(payload::text)<=4194304
  ))
);

CREATE TABLE IF NOT EXISTS public.admin_ai_operations_audit (
  revision integer PRIMARY KEY CONSTRAINT admin_ai_operations_audit_revision CHECK (revision>0),
  actor_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  before_digest text NOT NULL CONSTRAINT admin_ai_operations_audit_before CHECK (before_digest ~ '^[a-f0-9]{64}$'),
  after_digest text NOT NULL CONSTRAINT admin_ai_operations_audit_after CHECK (after_digest ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_ai_operations_receipt (
  actor_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  mutation_id uuid NOT NULL,
  request_digest text NOT NULL CONSTRAINT admin_ai_operations_receipt_digest CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  accepted_revision integer NOT NULL UNIQUE REFERENCES public.admin_ai_operations_audit(revision) ON DELETE RESTRICT,
  PRIMARY KEY (actor_user_id,mutation_id)
);

INSERT INTO public.admin_ai_operations_board(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
REVOKE ALL ON TABLE public.admin_ai_operations_board, public.admin_ai_operations_audit,
  public.admin_ai_operations_receipt FROM PUBLIC;

COMMIT;
