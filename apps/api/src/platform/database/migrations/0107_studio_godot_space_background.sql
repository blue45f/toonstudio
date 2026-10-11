-- Godot 가상스튜디오 공간 배경 GLB 업로드의 서버 정본 (DESIGN §14).
-- (workId, assetId) 한 행에 업로드된 배경 1건: 메타데이터 + bytea 페이로드.
BEGIN;

CREATE TABLE IF NOT EXISTS "studio_godot_space_background" (
  "workId" text NOT NULL,
  "assetId" text NOT NULL,
  "fileName" text NOT NULL,
  "byteSize" integer NOT NULL,
  "sha256" text NOT NULL,
  "payload" bytea NOT NULL,
  "uploadedByUserId" text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "studio_godot_space_background_pkey" PRIMARY KEY ("workId", "assetId"),
  CONSTRAINT "studio_godot_space_background_payload_size_check" CHECK (octet_length("payload") = "byteSize")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'studio_godot_space_background_uploadedByUserId_user_id_fk'
  ) THEN
    ALTER TABLE "studio_godot_space_background"
      ADD CONSTRAINT "studio_godot_space_background_uploadedByUserId_user_id_fk"
      FOREIGN KEY ("uploadedByUserId") REFERENCES "user"("id") ON DELETE restrict;
  END IF;
END $$;

COMMIT;
