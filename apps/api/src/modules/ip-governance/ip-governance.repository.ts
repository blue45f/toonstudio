import { Injectable } from "@nestjs/common";

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

/**
 * IP 거버넌스 영속 저장소 어댑터.
 * 기본 인메모리 구현체를 제공하며, 프로덕션 DB(PostgreSQL/Drizzle) 어댑터로 무중단 교체할 수 있도록 저장소 경계를 분리한다.
 */
@Injectable()
export class IpGovernanceRepository {
  private readonly sealsBySlug = new Map<string, ApiReaderTrustSeal>();
  private readonly revocationsBySealHash = new Map<string, ApiRevocationRecord>();
  private readonly supersededBySlug = new Map<string, string>();

  findSealBySlug(slug: string): ApiReaderTrustSeal | null {
    return this.sealsBySlug.get(slug) ?? null;
  }

  saveSeal(seal: ApiReaderTrustSeal): void {
    this.sealsBySlug.set(seal.slug, seal);
  }

  findRevocationBySealHash(sealDigestHash: string): ApiRevocationRecord | null {
    return this.revocationsBySealHash.get(sealDigestHash) ?? null;
  }

  saveRevocation(record: ApiRevocationRecord): void {
    this.revocationsBySealHash.set(record.sealDigestHash, record);
  }

  findSupersededSealHash(slug: string): string | null {
    return this.supersededBySlug.get(slug) ?? null;
  }

  saveSupersededSealHash(slug: string, previousSealDigestHash: string): void {
    this.supersededBySlug.set(slug, previousSealDigestHash);
  }
}
