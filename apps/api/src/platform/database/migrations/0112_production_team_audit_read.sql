BEGIN;
-- 감사 로그 열람(관리자 기간·행위자별 조회)을 위한 읽기 인덱스.
-- 기존 production_team_audit_workspace(workspace_id, id DESC)는 최신순 키셋 조회만 받쳐 주고,
-- 기간 필터와 행위자 필터는 워크스페이스 안에서 전 행을 훑어야 했다.
CREATE INDEX IF NOT EXISTS production_team_audit_workspace_occurred
  ON production_team_audit(workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS production_team_audit_workspace_actor
  ON production_team_audit(workspace_id, actor_user_id, id DESC);
COMMIT;
