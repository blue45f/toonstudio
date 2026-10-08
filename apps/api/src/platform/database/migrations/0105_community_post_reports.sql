-- 커뮤니티 글 신고의 서버 정본화 (QA B15 F-B15-2 후속).
-- 지금까지 커뮤니티 글(fan_post)에는 신고 경로가 없어 운영자가 문제를 인지할
-- 방법이 없었다. 홍보 신고(creator_promotion_report)와 같은 복합 PK 패턴으로
-- 한 회원은 한 글을 한 번만 신고할 수 있게 하고, 상태 컬럼은 운영 신고 큐의
-- pending/resolved/dismissed 체계를 그대로 써서 admin 신고 목록에 합류시킨다.
-- 재실행 안전(IF NOT EXISTS)하게 작성한다.

BEGIN;

CREATE TABLE IF NOT EXISTS "fan_post_report" (
  "postId" text NOT NULL,
  "userId" text NOT NULL,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "resolvedBy" text,
  "resolvedAt" timestamp,
  "resolutionNote" text NOT NULL DEFAULT '',
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "fan_post_report_pkey" PRIMARY KEY ("postId", "userId"),
  CONSTRAINT "fan_post_report_post_fkey"
    FOREIGN KEY ("postId") REFERENCES "fan_post" ("id") ON DELETE CASCADE,
  CONSTRAINT "fan_post_report_user_fkey"
    FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE,
  CONSTRAINT "fan_post_report_resolver_fkey"
    FOREIGN KEY ("resolvedBy") REFERENCES "user" ("id") ON DELETE SET NULL,
  CONSTRAINT "fan_post_report_status_check"
    CHECK ("status" IN ('pending', 'resolved', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS "idx_fan_post_report_queue"
  ON "fan_post_report" ("status", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_fan_post_report_recent"
  ON "fan_post_report" ("createdAt");

COMMIT;
