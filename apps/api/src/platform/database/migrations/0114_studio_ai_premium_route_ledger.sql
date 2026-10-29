-- Studio AI usage ledger: record the operator-sponsored premium route.
-- When a user has not registered a personal key, the server tries the premium
-- route (provider id 'anthropic', operator key) first and falls back to the
-- reviewed free pool only after a definitive pre-inference rejection. The API
-- counts today's premium ledger rows to enforce the operator's daily budget and
-- refuses to use the premium route until this provider value is accepted here.
-- Additive only: the provider check gains one value and a lookup index is added.
-- The attempt-count contract (at most nine attempts) is unchanged.

BEGIN;

SET LOCAL search_path = public, pg_catalog;

ALTER TABLE "studio_ai_usage_ledger"
  DROP CONSTRAINT IF EXISTS "studio_ai_usage_provider_check";

ALTER TABLE "studio_ai_usage_ledger"
  ADD CONSTRAINT "studio_ai_usage_provider_check"
    CHECK (provider IN (
      'gemini', 'qwen', 'groq', 'sambanova', 'zai', 'mistral', 'cloudflare', 'openrouter', 'siliconflow', 'deepseek', 'anthropic'
    )) NOT VALID;

ALTER TABLE "studio_ai_usage_ledger"
  VALIDATE CONSTRAINT "studio_ai_usage_provider_check";

CREATE INDEX IF NOT EXISTS "idx_studio_ai_usage_provider_started"
  ON "studio_ai_usage_ledger" (provider, "startedAt");

COMMIT;
