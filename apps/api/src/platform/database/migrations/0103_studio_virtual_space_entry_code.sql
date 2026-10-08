-- F-B06-1: 가상 스튜디오 입장코드의 서버 정본화.
-- 지금까지 6자리 입장코드는 클라이언트에서만 생성·형식 검사됐고 서버에는 발급
-- 기록 자체가 없어, 형식만 맞으면 어떤 코드로도 게스트 입장이 가능했다. 이제
-- 코드는 이 테이블에 sha256 해시로만 저장되고, 발급·만료·회수를 서버가 권위
-- 있게 판정한다. 코드 원문은 발급 응답에서 한 번만 반환한다.
-- 검증 실패 잠금은 코드가 아니라 공간 단위로 건다(studio_virtual_space_entry_attempt):
-- 틀린 코드는 어떤 레코드와도 매칭되지 않으므로 레코드별 카운터로는 셀 수 없다.
-- 재실행 안전(IF NOT EXISTS)하게 작성한다.

BEGIN;

CREATE TABLE IF NOT EXISTS "studio_virtual_space_entry_code" (
  "id" text NOT NULL,
  "spaceId" text NOT NULL,
  "spaceName" text NOT NULL DEFAULT '',
  "codeHash" text NOT NULL,
  "createdByUserId" text NOT NULL,
  "expiresAt" timestamp with time zone NOT NULL,
  "revokedAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "studio_virtual_space_entry_code_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "studio_virtual_space_entry_code_user_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "user" ("id") ON DELETE CASCADE,
  CONSTRAINT "studio_virtual_space_entry_code_hash_check"
    CHECK ("codeHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "studio_virtual_space_entry_code_space_check"
    CHECK (char_length(btrim("spaceId")) BETWEEN 1 AND 160),
  CONSTRAINT "studio_virtual_space_entry_code_revoked_check"
    CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);

-- 같은 공간에 같은 코드가 동시에 둘 살아 있지 않게 한다(회수된 코드는 재발급 가능).
CREATE UNIQUE INDEX IF NOT EXISTS "studio_virtual_space_entry_code_live_unique"
  ON "studio_virtual_space_entry_code" ("spaceId", "codeHash")
  WHERE "revokedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "studio_virtual_space_entry_code_space_expiry_idx"
  ON "studio_virtual_space_entry_code" ("spaceId", "expiresAt");

-- 공간별 검증 실패 카운터와 잠금. 실패가 임계에 닿으면 일정 시간 그 공간의
-- 코드 검증을 전부 잠가 6자리 코드 무차별 대입을 막는다.
CREATE TABLE IF NOT EXISTS "studio_virtual_space_entry_attempt" (
  "spaceId" text NOT NULL,
  "failedAttempts" integer NOT NULL DEFAULT 0,
  "lockedUntil" timestamp with time zone,
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "studio_virtual_space_entry_attempt_pkey" PRIMARY KEY ("spaceId"),
  CONSTRAINT "studio_virtual_space_entry_attempt_space_check"
    CHECK (char_length(btrim("spaceId")) BETWEEN 1 AND 160),
  CONSTRAINT "studio_virtual_space_entry_attempt_count_check"
    CHECK ("failedAttempts" >= 0)
);

COMMIT;
