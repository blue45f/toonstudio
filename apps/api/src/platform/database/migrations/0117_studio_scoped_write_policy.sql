-- 원복은 기존 정책·영수증을 보존하고 해당 capability 제공만 중단한다. 테이블 삭제는 별도 승인 없이는 하지 않는다.
-- 운영 적용 전 main의 migration 번호와 checksum manifest를 정합화한다. 런타임 자동 DDL은 사용하지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

CREATE TABLE IF NOT EXISTS creator_work_scoped_write_policy (
  "workId" text PRIMARY KEY REFERENCES creator_work(id) ON DELETE CASCADE,
  "policyVersion" integer NOT NULL CONSTRAINT creator_scoped_write_policy_version_check CHECK ("policyVersion">0),
  targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  grants jsonb NOT NULL DEFAULT '[]'::jsonb,
  ownership jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updatedBy" text NOT NULL REFERENCES "user"(id),
  "updatedAt" timestamptz NOT NULL,
  CONSTRAINT creator_scoped_write_policy_shape_check CHECK (
    jsonb_typeof(targets)='array' AND jsonb_array_length(targets)<=100000
    AND jsonb_typeof(grants)='array' AND jsonb_array_length(grants)<=100000
    AND jsonb_typeof(ownership)='object'
  )
);

CREATE TABLE IF NOT EXISTS creator_work_scoped_write_receipt (
  "workId" text NOT NULL REFERENCES creator_work(id) ON DELETE CASCADE,
  kind text NOT NULL CONSTRAINT creator_scoped_write_receipt_kind_check CHECK (kind IN ('management','rest','crdt','op','graph','capture','asset','submission')),
  "mutationId" text NOT NULL,
  "actorUserId" text NOT NULL REFERENCES "user"(id),
  "requestHash" text NOT NULL,
  "policyVersion" integer NOT NULL,
  "targetIds" jsonb NOT NULL,
  response jsonb,
  "createdAt" timestamptz NOT NULL,
  PRIMARY KEY ("workId",kind,"mutationId"),
  CONSTRAINT creator_scoped_write_receipt_hash_check CHECK ("requestHash" ~ '^[a-f0-9]{64}$' AND "policyVersion">0),
  CONSTRAINT creator_scoped_write_receipt_shape_check CHECK (length("mutationId") BETWEEN 1 AND 240
    AND jsonb_typeof("targetIds")='array' AND jsonb_array_length("targetIds")<=100000)
);

COMMIT;
