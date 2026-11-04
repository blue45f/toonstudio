-- 원복은 프로젝트별 직군 파이프라인을 끄고 기존 배정·원고·영수증을 보존한다. 컬럼 삭제는 별도 승인 없이는 하지 않는다.
-- NULL은 기존 동작을 유지하는 기본 OFF 상태다. 기존 정책 행이나 버전을 다시 쓰지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '90s';

ALTER TABLE public.creator_work_scoped_write_policy
  ADD COLUMN IF NOT EXISTS "rolePipeline" jsonb DEFAULT NULL;

DO $studio_role_pipeline_policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.creator_work_scoped_write_policy'::regclass
      AND conname = 'creator_scoped_write_role_pipeline_check'
  ) THEN
    ALTER TABLE public.creator_work_scoped_write_policy
      ADD CONSTRAINT creator_scoped_write_role_pipeline_check CHECK (
        "rolePipeline" IS NULL OR (
          jsonb_typeof("rolePipeline") = 'object'
          AND "rolePipeline"->'version' = '1'::jsonb
          AND jsonb_typeof("rolePipeline"->'enabled') = 'boolean'
          AND jsonb_typeof("rolePipeline"->'productionProjectId') = 'string'
          AND length("rolePipeline"->>'productionProjectId') BETWEEN 1 AND 160
          AND "rolePipeline"->>'activeStageId' IN ('story-script','storyboard-conte','bg3d-spatial','line-art-ink',
            'flat-color-mask','shading-fx-post','lettering-sfx','pd-editorial-review')
          AND jsonb_typeof("rolePipeline"->'roleBindings') = 'array'
          AND jsonb_array_length("rolePipeline"->'roleBindings') BETWEEN 1 AND 1000
          AND jsonb_typeof("rolePipeline"->'groupMappings') = 'array'
          AND jsonb_array_length("rolePipeline"->'groupMappings') BETWEEN 1 AND 18
          AND jsonb_typeof("rolePipeline"->'stageTasks') = 'array'
          AND jsonb_array_length("rolePipeline"->'stageTasks') = 8
          AND jsonb_typeof("rolePipeline"->'frozenStageIds') = 'array'
          AND jsonb_array_length("rolePipeline"->'frozenStageIds') <= 8
          AND jsonb_typeof("rolePipeline"->'approvedAt') IN ('null','string')
          AND jsonb_typeof("rolePipeline"->'history') = 'array'
          AND jsonb_array_length("rolePipeline"->'history') <= 1000
        ) IS TRUE
      );
  END IF;
END
$studio_role_pipeline_policy$;

COMMIT;
