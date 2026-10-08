-- 커뮤니티 글 좋아요의 서버 정본화 (QA B15 F-B15-2 후속).
-- 지금까지 커뮤니티 글(fan_post)에는 좋아요가 없어 독자가 반응을 남길 방법이
-- 댓글뿐이었다. 작품 좋아요(creator_work_like)·홍보 댓글 좋아요
-- (creator_promotion_comment_like)와 같은 복합 PK 패턴으로, 한 회원은 한 글에
-- 한 번만 좋아요할 수 있게 한다. 토글은 서버가 기존 행 유무로 판정하고
-- ON CONFLICT DO NOTHING으로 중복 요청에도 상태가 어긋나지 않는다.
-- 재실행 안전(IF NOT EXISTS)하게 작성한다.

BEGIN;

CREATE TABLE IF NOT EXISTS "fan_post_like" (
  "postId" text NOT NULL,
  "userId" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "fan_post_like_pkey" PRIMARY KEY ("postId", "userId"),
  CONSTRAINT "fan_post_like_post_fkey"
    FOREIGN KEY ("postId") REFERENCES "fan_post" ("id") ON DELETE CASCADE,
  CONSTRAINT "fan_post_like_user_fkey"
    FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_fan_post_like_user"
  ON "fan_post_like" ("userId", "createdAt");

COMMIT;
