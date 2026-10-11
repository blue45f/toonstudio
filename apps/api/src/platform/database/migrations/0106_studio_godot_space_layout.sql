-- Godot 가상스튜디오 공간 정의(월드 저작) 서버 정본.
-- (workId, spaceId) 한 행에 공간 포맷 v1 정의 전체 + 낙관적 동시성 revision.
BEGIN;

CREATE TABLE IF NOT EXISTS "studio_godot_space_layout" (
  "workId" text NOT NULL,
  "spaceId" text NOT NULL,
  "definition" jsonb NOT NULL,
  "revision" integer NOT NULL DEFAULT 0,
  "updatedByUserId" text NOT NULL,
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "studio_godot_space_layout_pkey" PRIMARY KEY ("workId", "spaceId")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'studio_godot_space_layout_updatedByUserId_user_id_fk'
  ) THEN
    ALTER TABLE "studio_godot_space_layout"
      ADD CONSTRAINT "studio_godot_space_layout_updatedByUserId_user_id_fk"
      FOREIGN KEY ("updatedByUserId") REFERENCES "user"("id") ON DELETE restrict;
  END IF;
END $$;

COMMIT;
