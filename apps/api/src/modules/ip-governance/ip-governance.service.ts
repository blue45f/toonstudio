import { Inject, Injectable } from "@nestjs/common";

import {
  IpGovernanceRepository,
  type ApiReaderTrustSeal,
  type ApiRevocationReasonCode,
  type ApiRevocationRecord,
  type ApiTrustSealLevel,
} from "./ip-governance.repository";

export interface ApiTrustSealLiveResponse {
  readonly seal: ApiReaderTrustSeal;
  readonly effectiveStatus: "active" | "revoked";
  readonly effectiveLevel: ApiTrustSealLevel;
  readonly matchedRevocation: ApiRevocationRecord | null;
  readonly tdmReservation: 1 | 0;
  readonly summary: string;
  readonly supersededSealDigestHash: string | null;
}

export interface ApiEscrowSettlementResponse {
  readonly slug: string;
  readonly action: "release" | "hold";
  readonly grossRevenueKrw: number;
  readonly advanceRecoupedKrw: number;
  readonly creatorPayoutKrw: number;
  readonly studioShareKrw: number;
  readonly reason: string;
  readonly settlementFinalityHash: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function computeSealDigest(base: Omit<ApiReaderTrustSeal, "sealDigestHash">): string {
  return fnv1aHex(
    JSON.stringify({
      seriesTitle: base.seriesTitle,
      level: base.level,
      verifiedStagesCount: base.verifiedStagesCount,
      totalStagesCount: base.totalStagesCount,
      commercialAssetsCleared: base.commercialAssetsCleared,
      aiTrainingOptOut: base.aiTrainingOptOut,
      voiceConsentVerified: base.voiceConsentVerified,
      globalLocalesCount: base.globalLocalesCount,
      masterAuditHash: base.masterAuditHash,
    }),
  );
}

/**
 * 실제 프로덕션 API 서비스: 작품별 Reader Trust Seal 발급·조회,
 * 실시간 철회 원장 등록, 대체 에셋 기반 1클릭 재발급, 철회 연동 에스크로 정산을 처리한다.
 */
@Injectable()
export class IpGovernanceService {
  constructor(
    @Inject(IpGovernanceRepository)
    private readonly repository: IpGovernanceRepository,
  ) {}

  issueTrustSeal(input: {
    readonly slug: string;
    readonly seriesTitle: string;
    readonly verifiedStagesCount?: number;
    readonly totalStagesCount?: number;
    readonly commercialAssetsCleared?: boolean;
    readonly aiTrainingOptOut?: boolean;
    readonly voiceConsentVerified?: boolean;
    readonly globalLocalesCount?: number;
    readonly masterAuditHash?: string;
    readonly issuedAtIso?: string;
  }): ApiTrustSealLiveResponse {
    const verifiedStagesCount = input.verifiedStagesCount ?? 10;
    const totalStagesCount = input.totalStagesCount ?? 10;
    const commercialAssetsCleared = input.commercialAssetsCleared ?? true;
    const aiTrainingOptOut = input.aiTrainingOptOut ?? true;
    const voiceConsentVerified = input.voiceConsentVerified ?? true;
    const globalLocalesCount = Math.max(0, Math.floor(input.globalLocalesCount ?? 2));
    const issuedAtIso = input.issuedAtIso ?? new Date().toISOString();
    const masterAuditHash =
      input.masterAuditHash ?? fnv1aHex(`toonstudio:${input.slug}:${input.seriesTitle}`);

    let level: ApiTrustSealLevel = "unverified";
    if (
      commercialAssetsCleared &&
      verifiedStagesCount >= 10 &&
      verifiedStagesCount === totalStagesCount &&
      voiceConsentVerified
    ) {
      level = "verified-10-stage";
    } else if (commercialAssetsCleared && verifiedStagesCount > 0) {
      level = "verified-commercial";
    }

    const base: Omit<ApiReaderTrustSeal, "sealDigestHash"> = {
      sealSchemaVersion: 1,
      slug: input.slug,
      seriesTitle: input.seriesTitle,
      level,
      verifiedStagesCount,
      totalStagesCount,
      commercialAssetsCleared,
      aiTrainingOptOut,
      voiceConsentVerified,
      globalLocalesCount,
      masterAuditHash,
      issuedAtIso,
    };
    const seal: ApiReaderTrustSeal = {
      ...base,
      sealDigestHash: computeSealDigest(base),
    };
    this.repository.saveSeal(seal);
    return this.getLiveTrustSeal(input.slug, input.seriesTitle);
  }

  getLiveTrustSeal(slug: string, fallbackTitle?: string): ApiTrustSealLiveResponse {
    const seal = this.repository.findSealBySlug(slug);
    if (!seal) {
      return this.issueTrustSeal({
        slug,
        seriesTitle: fallbackTitle ?? slug,
      });
    }
    const matchedRevocation = this.repository.findRevocationBySealHash(seal.sealDigestHash);
    const effectiveStatus = matchedRevocation ? "revoked" : "active";
    const effectiveLevel: ApiTrustSealLevel = matchedRevocation ? "unverified" : seal.level;
    const summary = matchedRevocation
      ? `인증 철회됨 (${matchedRevocation.reasonCode}: ${matchedRevocation.reasonDetail})`
      : seal.level === "verified-10-stage"
        ? "클린 IP 10단계 실시간 유효"
        : "상업 클린 에셋 실시간 유효";

    return {
      seal,
      effectiveStatus,
      effectiveLevel,
      matchedRevocation,
      tdmReservation: seal.aiTrainingOptOut ? 1 : 0,
      summary,
      supersededSealDigestHash: this.repository.findSupersededSealHash(slug),
    };
  }

  revokeTrustSeal(params: {
    readonly slug: string;
    readonly reasonCode: ApiRevocationReasonCode;
    readonly reasonDetail: string;
    readonly revokedAtIso?: string;
  }): ApiTrustSealLiveResponse {
    const current = this.getLiveTrustSeal(params.slug);
    const record: ApiRevocationRecord = {
      revocationId: `REV-${fnv1aHex(`${params.slug}:${params.reasonCode}:${current.seal.sealDigestHash}`).slice(6)}`,
      slug: params.slug,
      sealDigestHash: current.seal.sealDigestHash,
      reasonCode: params.reasonCode,
      reasonDetail: params.reasonDetail,
      revokedAtIso: params.revokedAtIso ?? new Date().toISOString(),
    };
    this.repository.saveRevocation(record);
    return this.getLiveTrustSeal(params.slug);
  }

  reissueTrustSeal(params: {
    readonly slug: string;
    readonly replacementAssetLabel: string;
    readonly evidenceReferenceId: string;
    readonly reissuedAtIso?: string;
  }): ApiTrustSealLiveResponse {
    const current = this.getLiveTrustSeal(params.slug);
    const reissuedAtIso = params.reissuedAtIso ?? new Date().toISOString();
    this.repository.saveSupersededSealHash(params.slug, current.seal.sealDigestHash);
    return this.issueTrustSeal({
      slug: params.slug,
      seriesTitle: current.seal.seriesTitle,
      verifiedStagesCount: current.seal.verifiedStagesCount,
      totalStagesCount: current.seal.totalStagesCount,
      commercialAssetsCleared: true,
      aiTrainingOptOut: current.seal.aiTrainingOptOut,
      voiceConsentVerified: current.seal.voiceConsentVerified,
      globalLocalesCount: current.seal.globalLocalesCount,
      masterAuditHash: fnv1aHex(
        `${current.seal.masterAuditHash}:${params.evidenceReferenceId}:${params.replacementAssetLabel}`,
      ),
      issuedAtIso: reissuedAtIso,
    });
  }

  executeEscrowSettlement(params: {
    readonly slug: string;
    readonly grossRevenueKrw: number;
    readonly unrecoupedAdvanceKrw: number;
    readonly creatorSplitPercent: number;
  }): ApiEscrowSettlementResponse {
    const live = this.getLiveTrustSeal(params.slug);
    const gross = Math.max(0, Math.round(params.grossRevenueKrw));
    const advance = Math.max(0, Math.round(params.unrecoupedAdvanceKrw));

    if (live.effectiveStatus !== "active") {
      return {
        slug: params.slug,
        action: "hold",
        grossRevenueKrw: gross,
        advanceRecoupedKrw: 0,
        creatorPayoutKrw: 0,
        studioShareKrw: 0,
        reason: `트러스트 배지 비활성(${live.summary}) — 배지 재발급 완료 시까지 정산 보류`,
        settlementFinalityHash: fnv1aHex(`hold:${params.slug}:${gross}:${live.seal.sealDigestHash}`),
      };
    }

    const advanceRecoupedKrw = Math.min(gross, advance);
    const distributable = gross - advanceRecoupedKrw;
    const creatorPayoutKrw = Math.round((distributable * params.creatorSplitPercent) / 100);
    const studioShareKrw = distributable - creatorPayoutKrw;

    return {
      slug: params.slug,
      action: "release",
      grossRevenueKrw: gross,
      advanceRecoupedKrw,
      creatorPayoutKrw,
      studioShareKrw,
      reason: "클린 IP 트러스트 배지 유효 — 1원 단위 정산 지급 승인",
      settlementFinalityHash: fnv1aHex(
        JSON.stringify({
          slug: params.slug,
          gross,
          advanceRecoupedKrw,
          creatorPayoutKrw,
          studioShareKrw,
          sealDigestHash: live.seal.sealDigestHash,
        }),
      ),
    };
  }
}
