-- 검수 펜 획을 기존 고정본 댓글에 추가한다. 기존 댓글은 빈 배열을 읽는다.
-- 실패하면 트랜잭션 전체가 복구된다. 원인을 확인한 뒤 같은 파일을 재실행하며,
-- 복구를 위해 기존 댓글·anchor·획을 삭제하거나 정본을 덮어쓰지 않는다.
-- SQL shape 검사는 현재 작품 ACL·불변 capture mapping에 대한 서버 인가를 대신하지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

ALTER TABLE studio_review_comment
  ADD COLUMN IF NOT EXISTS strokes jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE studio_review_comment ALTER COLUMN strokes SET DEFAULT '[]'::jsonb;
ALTER TABLE studio_review_comment ALTER COLUMN strokes SET NOT NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'studio_review_comment'::regclass
      AND conname = 'studio_review_comment_strokes_budget_check') THEN
    ALTER TABLE studio_review_comment ADD CONSTRAINT studio_review_comment_strokes_budget_check
      CHECK (CASE WHEN jsonb_typeof(strokes) = 'array'
        THEN jsonb_array_length(strokes) <= 50 AND octet_length(strokes::text) <= 2097152
        ELSE false END);
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION studio_validate_review_comment_strokes()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  stroke jsonb;
  point jsonb;
  identifiers text[] := ARRAY[]::text[];
  point_count integer := 0;
BEGIN
  -- 획이 없는 기존 댓글 정책과 해결·재오픈은 보존하고, 저장된 획과 위치는 함께 고정한다.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.strokes IS DISTINCT FROM OLD.strokes THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'review comment strokes are immutable';
    END IF;
    IF jsonb_array_length(OLD.strokes) > 0 AND NEW.anchor IS DISTINCT FROM OLD.anchor THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'review comment stroke anchors are immutable';
    END IF;
  END IF;
  IF jsonb_typeof(NEW.strokes) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'review comment strokes must be an array';
  END IF;
  IF jsonb_array_length(NEW.strokes) > 50 OR octet_length(NEW.strokes::text) > 2097152 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'review comment stroke budget exceeded';
  END IF;
  IF jsonb_array_length(NEW.strokes) = 0 THEN RETURN NEW; END IF;
  IF NEW.anchor->>'kind' IS DISTINCT FROM 'region'
    OR jsonb_typeof(NEW.anchor->'source') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'review comment strokes require a source-mapped region anchor';
  END IF;

  FOR stroke IN SELECT value FROM jsonb_array_elements(NEW.strokes) LOOP
    IF jsonb_typeof(stroke) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'review comment stroke must be an object';
    END IF;
    IF NOT stroke ?& ARRAY['id', 'points', 'color', 'width']
      OR stroke - ARRAY['id', 'points', 'color', 'width'] <> '{}'::jsonb
      OR jsonb_typeof(stroke->'id') IS DISTINCT FROM 'string'
      OR length(stroke->>'id') NOT BETWEEN 1 AND 64
      OR stroke->>'id' !~ '^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,63}$'
      OR jsonb_typeof(stroke->'color') IS DISTINCT FROM 'string'
      OR stroke->>'color' !~ '^#[a-fA-F0-9]{6}$'
      OR jsonb_typeof(stroke->'width') IS DISTINCT FROM 'number'
      OR jsonb_typeof(stroke->'points') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'review comment stroke shape is invalid';
    END IF;
    IF stroke->>'id' = ANY(identifiers) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'review comment stroke IDs must be unique';
    END IF;
    identifiers := array_append(identifiers, stroke->>'id');
    -- 폭은 JS의 양수 유한 float64 범위를 검사한다. JSON 정본의 최소값은 5e-324이다.
    -- DB numeric에서 양수여도 JS에서 0이 되는 underflow는 허용하지 않는다.
    IF (stroke->>'width')::numeric < 4.9406564584124654e-324
      OR (stroke->>'width')::numeric > 1.7976931348623157e308
      OR jsonb_array_length(stroke->'points') NOT BETWEEN 2 AND 500 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'review comment stroke width or point budget is invalid';
    END IF;
    point_count := point_count + jsonb_array_length(stroke->'points');
    IF point_count > 25000 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'review comment total point budget exceeded';
    END IF;
    FOR point IN SELECT value FROM jsonb_array_elements(stroke->'points') LOOP
      IF jsonb_typeof(point) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'review comment stroke point must be an object';
      END IF;
      IF NOT point ?& ARRAY['x', 'y'] OR point - ARRAY['x', 'y'] <> '{}'::jsonb
        OR jsonb_typeof(point->'x') IS DISTINCT FROM 'number'
        OR jsonb_typeof(point->'y') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'review comment stroke point shape is invalid';
      END IF;
      IF (point->>'x')::numeric NOT BETWEEN 0 AND 1.7976931348623157e308
        OR (point->>'y')::numeric NOT BETWEEN 0 AND 1.7976931348623157e308 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'review comment stroke point is outside the numeric budget';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;

-- 기존 studio_review_comment_anchor_check를 교체하거나 비활성화하지 않는다.
DROP TRIGGER IF EXISTS studio_review_comment_strokes_check ON studio_review_comment;
CREATE TRIGGER studio_review_comment_strokes_check
  BEFORE INSERT OR UPDATE ON studio_review_comment
  FOR EACH ROW EXECUTE FUNCTION studio_validate_review_comment_strokes();
REVOKE ALL ON FUNCTION studio_validate_review_comment_strokes() FROM PUBLIC;

COMMIT;
