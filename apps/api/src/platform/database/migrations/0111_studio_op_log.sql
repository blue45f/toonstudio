-- op 채널 병행 로그 (HOST_INSERTION_SPEC 2절). Yjs CRDT 로그와 나란히 두는
-- 검증·복제 용도 기록이다. 프로덕션 권위는 creator_work_crdt_* 쪽에 그대로 있고,
-- 이 테이블들은 신규 협업 표면의 op 채널(studio:op:*)만 쓴다.

BEGIN;

CREATE TABLE IF NOT EXISTS "creator_work_op_log" (
  "workId" text NOT NULL,
  "sequence" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "opId" text NOT NULL,
  "actorId" text NOT NULL,
  "actorUserId" text,
  "op" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_op_log_pkey" PRIMARY KEY ("workId", "sequence"),
  CONSTRAINT "creator_work_op_log_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_op_log_actor_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "creator_work_op_log_work_op_id_unique" UNIQUE ("workId", "opId"),
  CONSTRAINT "creator_work_op_log_op_id_check"
    CHECK (length("opId") BETWEEN 3 AND 200),
  CONSTRAINT "creator_work_op_log_op_object_check"
    CHECK (jsonb_typeof("op") = 'object')
);

CREATE INDEX IF NOT EXISTS "idx_creator_work_op_log_actor_created"
  ON "creator_work_op_log" ("actorId", "createdAt" DESC);

-- 스냅샷 기준점. snapshot JSON은 {seq, state, opIds}를 통째로 담는다 —
-- 계약 요구 1(스냅샷 응답의 포함 opId 집합)을 재시작 뒤에도 지키기 위해서다.
CREATE TABLE IF NOT EXISTS "creator_work_op_snapshot" (
  "workId" text NOT NULL,
  "seq" bigint NOT NULL DEFAULT 0,
  "snapshot" jsonb NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "creator_work_op_snapshot_pkey" PRIMARY KEY ("workId"),
  CONSTRAINT "creator_work_op_snapshot_work_fkey"
    FOREIGN KEY ("workId") REFERENCES "creator_work"("id") ON DELETE CASCADE,
  CONSTRAINT "creator_work_op_snapshot_seq_check"
    CHECK ("seq" >= 0),
  CONSTRAINT "creator_work_op_snapshot_object_check"
    CHECK (jsonb_typeof("snapshot") = 'object')
);

COMMIT;
