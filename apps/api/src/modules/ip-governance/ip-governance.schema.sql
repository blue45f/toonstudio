-- ToonStudio IP Governance PostgreSQL Schema
-- Stores Reader Trust Seals, active revocation entries, and creator settlement hold/restore alerts.

CREATE TABLE IF NOT EXISTS ip_governance_trust_seals (
  slug TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  superseded_seal_digest_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ip_governance_revocations (
  seal_digest_hash TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  payload JSONB NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_governance_revocations_slug
  ON ip_governance_revocations (slug, revoked_at DESC);

CREATE TABLE IF NOT EXISTS ip_governance_creator_alerts (
  alert_id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('revocation-hold', 'reissuance-restored')),
  reason_code TEXT NOT NULL,
  title TEXT NOT NULL,
  remediation_guide TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_governance_creator_alerts_slug
  ON ip_governance_creator_alerts (slug, created_at DESC);
