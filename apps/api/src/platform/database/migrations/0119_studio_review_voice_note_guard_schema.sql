-- 0093 원문과 체크섬을 보존하고 일반 백업에 포함되는 public 함수로 트리거를 연결한다.
-- 시스템 함수의 ACL도 덤프되므로 기존 함수를 정리하되 다른 참조가 있으면 전체 롤백한다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION public.studio_review_voice_note_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."deletedAt" IS NOT NULL OR NEW."deleteOperationId" IS NOT NULL THEN
      RAISE EXCEPTION 'new review voice note cannot start deleted';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.creator_work WHERE id = OLD."workId") THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'review voice note is retained until parent deletion';
  END IF;
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW)-'deletedAt'-'deleteOperationId') IS DISTINCT FROM
     (to_jsonb(OLD)-'deletedAt'-'deleteOperationId') THEN
    RAISE EXCEPTION 'review voice note immutable fields changed';
  END IF;
  IF OLD."deletedAt" IS NOT NULL OR NEW."deletedAt" IS NULL OR NEW."deleteOperationId" IS NULL
     OR NEW."deletedAt" < OLD."createdAt" THEN
    RAISE EXCEPTION 'invalid review voice note deletion transition';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS studio_review_voice_note_guard_update ON public.studio_review_voice_note;
CREATE TRIGGER studio_review_voice_note_guard_update
  BEFORE INSERT OR UPDATE OR DELETE ON public.studio_review_voice_note
  FOR EACH ROW EXECUTE FUNCTION public.studio_review_voice_note_guard();

REVOKE ALL ON FUNCTION public.studio_review_voice_note_guard() FROM PUBLIC;
DROP FUNCTION IF EXISTS pg_catalog.studio_review_voice_note_guard() RESTRICT;
COMMIT;
