-- 관리자 NestJS 검증 보드와 서버 변경 이력만 추가한다. 운영 설정·배포 작업은 실행하지 않는다.
-- 재실행 시 기존 문서와 이력을 보존한다. 복구는 새 API 노출을 중단하고 데이터를 보존한다.
-- 테이블 삭제나 운영 데이터 되돌리기는 이 migration의 자동 복구 범위에 포함하지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

CREATE TABLE IF NOT EXISTS public.admin_nestjs_quality_board (
  repository text PRIMARY KEY CHECK (repository = 'blue45f/toonstudio'),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  document jsonb NOT NULL,
  updated_by text REFERENCES public."user"(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_nestjs_quality_board_document_check CHECK ((
    jsonb_typeof(document) = 'object' AND document->'schemaVersion' = '1'::jsonb
    AND document->>'repository' = repository AND jsonb_typeof(document->'tasks') = 'array'
    AND jsonb_typeof(document->'snapshot') = 'object' AND jsonb_typeof(document->'sourceHistory') = 'array'
    AND octet_length(document::text) <= 4194304) IS TRUE)
);

CREATE TABLE IF NOT EXISTS public.admin_nestjs_quality_history (
  repository text NOT NULL REFERENCES public.admin_nestjs_quality_board(repository) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  actor_id text NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  mutation_id text NOT NULL CHECK (mutation_id ~ '^[A-Za-z0-9._:-]{8,128}$'),
  request_digest text NOT NULL CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
  changed_task_ids jsonb NOT NULL CHECK (jsonb_typeof(changed_task_ids) = 'array'),
  snapshot_changed boolean NOT NULL,
  before_document jsonb NOT NULL,
  after_document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repository, revision),
  CONSTRAINT admin_nestjs_quality_history_mutation_unique UNIQUE(repository, actor_id, mutation_id),
  CONSTRAINT admin_nestjs_quality_history_before_check CHECK ((
    jsonb_typeof(before_document) = 'object' AND before_document->'schemaVersion' = '1'::jsonb
    AND before_document->>'repository' = repository AND octet_length(before_document::text) <= 4194304) IS TRUE),
  CONSTRAINT admin_nestjs_quality_history_after_check CHECK ((
    jsonb_typeof(after_document) = 'object' AND after_document->'schemaVersion' = '1'::jsonb
    AND after_document->>'repository' = repository AND octet_length(after_document::text) <= 4194304) IS TRUE)
);

CREATE OR REPLACE FUNCTION public.admin_nestjs_quality_history_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION 'NestJS verification history is append-only' USING ERRCODE = '23514';
END $$;
DROP TRIGGER IF EXISTS admin_nestjs_quality_history_immutable ON public.admin_nestjs_quality_history;
CREATE TRIGGER admin_nestjs_quality_history_immutable
  BEFORE UPDATE OR DELETE ON public.admin_nestjs_quality_history
  FOR EACH ROW EXECUTE FUNCTION public.admin_nestjs_quality_history_immutable();

REVOKE ALL ON FUNCTION public.admin_nestjs_quality_history_immutable() FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_nestjs_quality_board, public.admin_nestjs_quality_history FROM PUBLIC;
COMMIT;
