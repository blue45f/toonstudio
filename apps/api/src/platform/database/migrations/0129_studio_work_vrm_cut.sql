-- 기존 원고의 이미지 앵커와 같은 트랜잭션에서 팀 컷 원본을 봉인한다.
-- 구버전 복귀 시 새 쓰기 경로를 닫고 테이블과 원본 이미지는 보존한다.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS public.studio_work_vrm_cut (
  "workId" text NOT NULL,
  "anchorId" text NOT NULL,
  "pageId" text NOT NULL CHECK (length("pageId") BETWEEN 1 AND 160),
  "sceneText" text NOT NULL CHECK (octet_length("sceneText") BETWEEN 2 AND 2097152),
  "sceneSha256" text NOT NULL CHECK ("sceneSha256" ~ '^[0-9a-f]{64}$'),
  "compositeSha256" text NOT NULL CHECK ("compositeSha256" ~ '^[0-9a-f]{64}$'),
  "bundledModels" jsonb NOT NULL CHECK (jsonb_typeof("bundledModels") = 'array' AND jsonb_array_length("bundledModels") <= 12),
  attachments jsonb NOT NULL CHECK (jsonb_typeof(attachments) = 'array' AND jsonb_array_length(attachments) <= 12),
  rights jsonb,
  PRIMARY KEY ("workId", "anchorId"),
  FOREIGN KEY ("workId", "anchorId") REFERENCES public.creator_work_asset ("workId", "assetId") ON DELETE CASCADE
);
REVOKE ALL ON TABLE public.studio_work_vrm_cut FROM PUBLIC;
COMMIT;
