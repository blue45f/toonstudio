-- 롤백: DROP TABLE IF EXISTS "studio_project_library_entry"; (동기화 정본만 사라지고
-- 기기 로컬 라이브러리는 그대로 남아 이어가기가 로컬 동작으로 돌아간다.)
-- 작품 라이브러리(이어가기 목록) 계정 동기화 서버 정본 (사용성 웨이브 2, 2026-10-12).
-- 지금까지 작품 목록 메타데이터는 기기 로컬(localStorage)에만 있어 기기를 바꾸면
-- 이어가기가 끊겼다. (userId, projectId) 한 행에 작품 항목 전체(JSON)를 담고,
-- 병합 판정용으로 항목의 updatedAt을 별도 컬럼에 미러링한다.
BEGIN;

CREATE TABLE IF NOT EXISTS "studio_project_library_entry" (
  "userId" text NOT NULL,
  "projectId" text NOT NULL,
  "entry" jsonb NOT NULL,
  "entryUpdatedAt" timestamp with time zone NOT NULL,
  "syncedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "studio_project_library_entry_pkey" PRIMARY KEY ("userId", "projectId")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'studio_project_library_entry_userId_user_id_fk'
  ) THEN
    ALTER TABLE "studio_project_library_entry"
      ADD CONSTRAINT "studio_project_library_entry_userId_user_id_fk"
      FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE cascade;
  END IF;
END $$;

COMMIT;
