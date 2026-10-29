-- Studio AI usage ledger: keep each call's conservative token reservation.
-- When a provider never reports usage (timeout, network error, cancel), the
-- general quota already charges the call its full reservation, but the ledger
-- kept only NULL token columns, so the operator-sponsored premium budget had to
-- guess a fixed amount and under-counted large AI-assist calls. The API now
-- writes the reservation on premium rows, counts unknown-usage premium rows at
-- that value, and keeps the premium route closed until this column exists.
-- Additive only: one nullable column with a non-negative check. Existing rows
-- keep NULL (the budget counts them at the largest possible reservation).
-- The check is added only when missing: the empty-database bootstrap provisions
-- the current Drizzle schema, which already declares it, before replaying
-- migrations, and PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS.

BEGIN;

SET LOCAL search_path = public, pg_catalog;

ALTER TABLE "studio_ai_usage_ledger"
  ADD COLUMN IF NOT EXISTS "reservedTokens" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'studio_ai_usage_reserved_tokens_check'
      AND conrelid = 'studio_ai_usage_ledger'::regclass
  ) THEN
    ALTER TABLE "studio_ai_usage_ledger"
      ADD CONSTRAINT "studio_ai_usage_reserved_tokens_check"
        CHECK ("reservedTokens" IS NULL OR "reservedTokens" >= 0) NOT VALID;
  END IF;
END $$;

ALTER TABLE "studio_ai_usage_ledger"
  VALIDATE CONSTRAINT "studio_ai_usage_reserved_tokens_check";

COMMIT;
