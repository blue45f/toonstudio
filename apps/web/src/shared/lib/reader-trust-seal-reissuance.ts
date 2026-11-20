import {
  buildReaderTrustSeal,
  verifyReaderTrustSealDigest,
  type ReaderTrustSealPayload,
} from "./reader-trust-seal";
import type {
  SealRevocationEntry,
  SealRevocationReasonCode,
} from "./reader-trust-seal-revocation";

export interface SealRemediationProof {
  readonly resolvedReasonCode: SealRevocationReasonCode | "expiry-renewed";
  readonly replacementAssetLabel: string;
  readonly evidenceReferenceId: string;
  readonly verifiedBy: string;
}

export interface SealReissuanceRecord {
  readonly reissuanceSchemaVersion: 1;
  readonly supersedesSealDigestHash: string;
  readonly resolvedRevocationId: string | null;
  readonly remediationProof: SealRemediationProof;
  readonly reissuedSeal: ReaderTrustSealPayload;
  readonly reissuedAtIso: string;
  readonly reissuanceChainHash: string;
}

export interface SealReissuanceResult {
  readonly ok: boolean;
  readonly record: SealReissuanceRecord | null;
  readonly summary: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function computeReissuanceChainHash(
  record: Omit<SealReissuanceRecord, "reissuanceChainHash">,
): string {
  return fnv1aHex(
    JSON.stringify({
      reissuanceSchemaVersion: record.reissuanceSchemaVersion,
      supersedesSealDigestHash: record.supersedesSealDigestHash,
      resolvedRevocationId: record.resolvedRevocationId,
      remediationProof: record.remediationProof,
      reissuedSealDigestHash: record.reissuedSeal.sealDigestHash,
      reissuedMasterAuditHash: record.reissuedSeal.masterAuditHash,
      reissuedAtIso: record.reissuedAtIso,
    }),
  );
}

/**
 * 철회(revoked) 또는 만료(expired)된 ReaderTrustSealPayload에 대해
 * 대체 에셋·갱신 계약 증빙을 검증하고, 이전 배지를 승계하는 신규 트러스트 배지를 재발급한다.
 */
export function buildReissuedReaderTrustSeal(params: {
  readonly previousSeal: ReaderTrustSealPayload;
  readonly revocationEntry?: SealRevocationEntry | null;
  readonly remediationProof: SealRemediationProof;
  readonly updatedMasterAuditHash?: string;
  readonly reissuedAtIso?: string;
}): SealReissuanceResult {
  const { previousSeal, revocationEntry, remediationProof } = params;
  const reissuedAtIso = params.reissuedAtIso ?? new Date().toISOString();

  if (
    !remediationProof.replacementAssetLabel.trim() ||
    !remediationProof.evidenceReferenceId.trim() ||
    !remediationProof.verifiedBy.trim()
  ) {
    return {
      ok: false,
      record: null,
      summary: "대체 에셋명·증빙 참조 ID·검증자 정보가 모두 필요합니다.",
    };
  }

  if (
    revocationEntry &&
    remediationProof.resolvedReasonCode !== revocationEntry.reasonCode
  ) {
    return {
      ok: false,
      record: null,
      summary: `철회 사유(${revocationEntry.reasonCode})와 복구 증빙 사유(${remediationProof.resolvedReasonCode})가 일치하지 않습니다.`,
    };
  }

  const nextMasterAuditHash =
    params.updatedMasterAuditHash ??
    fnv1aHex(
      `${previousSeal.masterAuditHash}:${remediationProof.evidenceReferenceId}:${reissuedAtIso}`,
    );

  const reissuedSeal = buildReaderTrustSeal({
    seriesTitle: previousSeal.seriesTitle,
    verifiedStagesCount: previousSeal.verifiedStagesCount,
    totalStagesCount: previousSeal.totalStagesCount,
    commercialAssetsCleared: true,
    aiTrainingOptOut: previousSeal.aiTrainingOptOut,
    voiceConsentVerified: previousSeal.voiceConsentVerified,
    globalLocalesCount: previousSeal.globalLocalesCount,
    masterAuditHash: nextMasterAuditHash,
    issuedAtIso: reissuedAtIso,
  });

  const baseRecord: Omit<SealReissuanceRecord, "reissuanceChainHash"> = {
    reissuanceSchemaVersion: 1,
    supersedesSealDigestHash: previousSeal.sealDigestHash,
    resolvedRevocationId: revocationEntry?.revocationId ?? null,
    remediationProof,
    reissuedSeal,
    reissuedAtIso,
  };

  const record: SealReissuanceRecord = {
    ...baseRecord,
    reissuanceChainHash: computeReissuanceChainHash(baseRecord),
  };

  return {
    ok: true,
    record,
    summary: `트러스트 배지 재발급 완료 (${remediationProof.replacementAssetLabel} · ${reissuedSeal.sealDigestHash})`,
  };
}

export function verifySealReissuanceRecord(record: SealReissuanceRecord): boolean {
  if (!verifyReaderTrustSealDigest(record.reissuedSeal)) {
    return false;
  }
  const { reissuanceChainHash, ...rest } = record;
  return computeReissuanceChainHash(rest) === reissuanceChainHash;
}
