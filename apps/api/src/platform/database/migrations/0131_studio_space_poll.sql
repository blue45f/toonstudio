-- 공간의 팀 투표와 계정당 한 표를 보관한다. 이전 버전으로 복귀할 때는 쓰기를 중지하고 기존 집계를 보존한다.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS public.studio_space_poll (
  id uuid PRIMARY KEY,
  "workId" text NOT NULL REFERENCES public.creator_work(id) ON DELETE CASCADE,
  world text NOT NULL CHECK (length(world) BETWEEN 1 AND 256),
  question text NOT NULL CHECK (length(question) BETWEEN 1 AND 200),
  options text[] NOT NULL CHECK (cardinality(options) BETWEEN 2 AND 6),
  anonymous boolean NOT NULL,
  "createdBy" text REFERENCES public."user"(id) ON DELETE SET NULL,
  "creatorName" text NOT NULL,
  "requestHash" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "deadline" timestamptz,
  closed boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS studio_space_poll_current_idx ON public.studio_space_poll ("workId",world,"createdAt" DESC,id DESC);
CREATE TABLE IF NOT EXISTS public.studio_space_poll_vote (
  "pollId" uuid NOT NULL REFERENCES public.studio_space_poll(id) ON DELETE CASCADE,
  "voterId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "optionIndex" smallint NOT NULL CHECK ("optionIndex" BETWEEN 0 AND 5),
  "voterName" text,
  PRIMARY KEY ("pollId","voterId")
);
REVOKE ALL ON TABLE public.studio_space_poll, public.studio_space_poll_vote FROM PUBLIC;
COMMIT;
