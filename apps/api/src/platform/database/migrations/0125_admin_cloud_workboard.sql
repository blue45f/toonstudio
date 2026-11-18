-- 관리자 개인 작업 보드만 저장한다. 외부 저장소·배포·운영 데이터 실행 권한은 만들지 않는다.
-- 재적용은 기존 보드와 감사 이력을 보존한다. 코드 롤백 시에도 테이블을 보존한다.
-- 운영 적용은 별도 승인 작업이며, 요청 처리에서 이 DDL을 실행하지 않는다.
BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_cloud_workboard (
  owner_user_id text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  board_id text NOT NULL DEFAULT 'cloud-workboard-v1',
  revision bigint NOT NULL DEFAULT 0,
  payload jsonb NOT NULL,
  stored_at timestamptz,
  PRIMARY KEY(owner_user_id,board_id),
  CONSTRAINT admin_cloud_workboard_id_check CHECK(board_id='cloud-workboard-v1'),
  CONSTRAINT admin_cloud_workboard_revision_check CHECK(revision BETWEEN 0 AND 9007199254740991),
  CONSTRAINT admin_cloud_workboard_payload_check CHECK(
    jsonb_typeof(payload)='object' AND payload ?& ARRAY['schemaVersion','snapshotAt','tasks','audit']
    AND payload->'schemaVersion'='1'::jsonb AND jsonb_typeof(payload->'snapshotAt')='string'
    AND jsonb_typeof(payload->'tasks')='array' AND payload->'audit'='[]'::jsonb
  ),
  CONSTRAINT admin_cloud_workboard_time_check CHECK(
    (revision=0 AND stored_at IS NULL) OR (revision>0 AND stored_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.admin_cloud_workboard_audit (
  owner_user_id text NOT NULL,
  board_id text NOT NULL,
  revision bigint NOT NULL,
  actor_user_id text NOT NULL,
  mutation_id uuid NOT NULL,
  before_digest text NOT NULL,
  after_digest text NOT NULL,
  task_count integer NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY(owner_user_id,board_id,revision),
  UNIQUE(owner_user_id,mutation_id),
  FOREIGN KEY(owner_user_id,board_id)
    REFERENCES public.admin_cloud_workboard(owner_user_id,board_id) ON DELETE CASCADE,
  CONSTRAINT admin_cloud_workboard_audit_actor_check CHECK(actor_user_id=owner_user_id),
  CONSTRAINT admin_cloud_workboard_audit_revision_check CHECK(revision BETWEEN 1 AND 9007199254740991),
  CONSTRAINT admin_cloud_workboard_audit_before_check CHECK(before_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT admin_cloud_workboard_audit_after_check CHECK(after_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT admin_cloud_workboard_audit_count_check CHECK(task_count>=0)
);

CREATE TABLE IF NOT EXISTS public.admin_cloud_workboard_receipt (
  owner_user_id text NOT NULL,
  board_id text NOT NULL,
  mutation_id uuid NOT NULL,
  request_digest text NOT NULL,
  accepted_revision bigint NOT NULL,
  PRIMARY KEY(owner_user_id,mutation_id),
  FOREIGN KEY(owner_user_id,board_id,accepted_revision)
    REFERENCES public.admin_cloud_workboard_audit(owner_user_id,board_id,revision) ON DELETE CASCADE,
  CONSTRAINT admin_cloud_workboard_receipt_digest_check CHECK(request_digest ~ '^[a-f0-9]{64}$')
);

ALTER TABLE public.admin_cloud_workboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_cloud_workboard_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_cloud_workboard_receipt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_cloud_workboard,
  public.admin_cloud_workboard_audit, public.admin_cloud_workboard_receipt FROM PUBLIC;

COMMIT;
