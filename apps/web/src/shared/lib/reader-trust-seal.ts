export type ReaderTrustSealLevel = "verified-10-stage" | "verified-commercial" | "unverified";

export interface ReaderTrustSealInput {
  readonly seriesTitle: string;
  readonly verifiedStagesCount: number;
  readonly totalStagesCount: number;
  readonly commercialAssetsCleared: boolean;
  readonly aiTrainingOptOut: boolean;
  readonly voiceConsentVerified: boolean;
  readonly globalLocalesCount: number;
  readonly masterAuditHash: string;
  readonly issuedAtIso?: string;
}

export interface ReaderTrustSealPayload {
  readonly sealSchemaVersion: 1;
  readonly seriesTitle: string;
  readonly level: ReaderTrustSealLevel;
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

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function computeSealDigest(payload: Omit<ReaderTrustSealPayload, "sealDigestHash">): string {
  return fnv1aHex(
    JSON.stringify({
      seriesTitle: payload.seriesTitle,
      level: payload.level,
      verifiedStagesCount: payload.verifiedStagesCount,
      totalStagesCount: payload.totalStagesCount,
      commercialAssetsCleared: payload.commercialAssetsCleared,
      aiTrainingOptOut: payload.aiTrainingOptOut,
      voiceConsentVerified: payload.voiceConsentVerified,
      globalLocalesCount: payload.globalLocalesCount,
      masterAuditHash: payload.masterAuditHash,
    }),
  );
}

/**
 * 독자 열람 페이지·작품 카드에 노출하는 클린 IP 트러스트 배지(Reader Trust Seal) 페이로드를 생성한다.
 */
export function buildReaderTrustSeal(input: ReaderTrustSealInput): ReaderTrustSealPayload {
  const issuedAtIso = input.issuedAtIso ?? new Date().toISOString();
  let level: ReaderTrustSealLevel;
  if (
    input.commercialAssetsCleared &&
    input.verifiedStagesCount >= 10 &&
    input.verifiedStagesCount === input.totalStagesCount &&
    input.voiceConsentVerified
  ) {
    level = "verified-10-stage";
  } else if (input.commercialAssetsCleared && input.verifiedStagesCount > 0) {
    level = "verified-commercial";
  } else {
    level = "unverified";
  }

  const base: Omit<ReaderTrustSealPayload, "sealDigestHash"> = {
    sealSchemaVersion: 1,
    seriesTitle: input.seriesTitle,
    level,
    verifiedStagesCount: input.verifiedStagesCount,
    totalStagesCount: input.totalStagesCount,
    commercialAssetsCleared: input.commercialAssetsCleared,
    aiTrainingOptOut: input.aiTrainingOptOut,
    voiceConsentVerified: input.voiceConsentVerified,
    globalLocalesCount: Math.max(0, Math.floor(input.globalLocalesCount)),
    masterAuditHash: input.masterAuditHash,
    issuedAtIso,
  };

  return {
    ...base,
    sealDigestHash: computeSealDigest(base),
  };
}

export function verifyReaderTrustSealDigest(seal: ReaderTrustSealPayload): boolean {
  const { sealDigestHash, ...rest } = seal;
  return computeSealDigest(rest) === sealDigestHash;
}

export function formatReaderTrustSealLabel(seal: ReaderTrustSealPayload): string {
  if (seal.level === "verified-10-stage") {
    return "클린 IP 10단계 완전 인증작";
  }
  if (seal.level === "verified-commercial") {
    return "상업 클린 에셋 인증작";
  }
  return "저작권 인증 대기";
}
