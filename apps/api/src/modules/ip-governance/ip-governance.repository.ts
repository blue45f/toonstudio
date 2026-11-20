import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Pool } from "pg";

export const IP_GOVERNANCE_POOL = Symbol("IP_GOVERNANCE_POOL");

export type ApiTrustSealLevel = "verified-10-stage" | "verified-commercial" | "unverified";
export type ApiRevocationReasonCode =
  | "font-license-expired"
  | "voice-contract-terminated"
  | "asset-takedown"
  | "manual-compliance-hold";

export interface ApiReaderTrustSeal {
  readonly sealSchemaVersion: 1;
  readonly slug: string;
  readonly seriesTitle: string;
  readonly level: ApiTrustSealLevel;
  readonly verifiedStagesCount: number;
  readonly totalStagesCount: number;
  readonly commercialAssetsCleared: boolean;
  readonly aiTrainingOptOut: boolean;
  readonly voiceConsentVerified: boolean;
  readonly globalLocalesCount: number;
  readonly masterAuditHash: string;
  readonly issuedAtIso: string;
  readonly sealDigestHash: string;
}

export interface ApiRevocationRecord {
  readonly revocationId: string;
  readonly slug: string;
  readonly sealDigestHash: string;
  readonly reasonCode: ApiRevocationReasonCode;
  readonly reasonDetail: string;
  readonly revokedAtIso: string;
}

export const IP_GOVERNANCE_SCHEMA_SQL = `
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
`.trim();

/**
 * IP 거버넌스 영속 저장소 어댑터.
 * PostgreSQL `pg` Pool이 주입되면 실제 SQL 테이블에 영속 저장하고,
 * 미주입 로컬/단위 테스트 환경에서는 안전한 인메모리 저장소로 폴백한다.
 */
@Injectable()
export class IpGovernanceRepository {
  private readonly sealsBySlug = new Map<string, ApiReaderTrustSeal>();
  private readonly revocationsBySealHash = new Map<string, ApiRevocationRecord>();
  private readonly supersededBySlug = new Map<string, string>();

  constructor(
    @Optional()
    @Inject(IP_GOVERNANCE_POOL)
    private readonly pool: Pool | null = null,
  ) {}

  async findSealBySlug(slug: string): Promise<ApiReaderTrustSeal | null> {
    if (this.pool) {
      const res = await this.pool.query<{ payload: ApiReaderTrustSeal }>(
        "SELECT payload FROM ip_governance_trust_seals WHERE slug = $1",
        [slug],
      );
      return res.rows[0]?.payload ?? null;
    }
    return this.sealsBySlug.get(slug) ?? null;
  }

  async saveSeal(seal: ApiReaderTrustSeal): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO ip_governance_trust_seals(slug, payload, updated_at)
         VALUES($1, $2::jsonb, now())
         ON CONFLICT (slug) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
        [seal.slug, JSON.stringify(seal)],
      );
      return;
    }
    this.sealsBySlug.set(seal.slug, seal);
  }

  async findRevocationBySealHash(sealDigestHash: string): Promise<ApiRevocationRecord | null> {
    if (this.pool) {
      const res = await this.pool.query<{ payload: ApiRevocationRecord }>(
        "SELECT payload FROM ip_governance_revocations WHERE seal_digest_hash = $1",
        [sealDigestHash],
      );
      return res.rows[0]?.payload ?? null;
    }
    return this.revocationsBySealHash.get(sealDigestHash) ?? null;
  }

  async saveRevocation(record: ApiRevocationRecord): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO ip_governance_revocations(seal_digest_hash, slug, payload, revoked_at)
         VALUES($1, $2, $3::jsonb, now())
         ON CONFLICT (seal_digest_hash) DO UPDATE SET payload = EXCLUDED.payload, revoked_at = now()`,
        [record.sealDigestHash, record.slug, JSON.stringify(record)],
      );
      return;
    }
    this.revocationsBySealHash.set(record.sealDigestHash, record);
  }

  async findSupersededSealHash(slug: string): Promise<string | null> {
    if (this.pool) {
      const res = await this.pool.query<{ superseded_seal_digest_hash: string | null }>(
        "SELECT superseded_seal_digest_hash FROM ip_governance_trust_seals WHERE slug = $1",
        [slug],
      );
      return res.rows[0]?.superseded_seal_digest_hash ?? null;
    }
    return this.supersededBySlug.get(slug) ?? null;
  }

  async saveSupersededSealHash(slug: string, previousSealDigestHash: string): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `UPDATE ip_governance_trust_seals
         SET superseded_seal_digest_hash = $2, updated_at = now()
         WHERE slug = $1`,
        [slug, previousSealDigestHash],
      );
      return;
    }
    this.supersededBySlug.set(slug, previousSealDigestHash);
  }
}
