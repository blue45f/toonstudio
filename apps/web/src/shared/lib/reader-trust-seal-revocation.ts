import {
  verifyReaderTrustSealDigest,
  type ReaderTrustSealLevel,
  type ReaderTrustSealPayload,
} from "./reader-trust-seal";

export type SealRevocationReasonCode =
  | "font-license-expired"
  | "voice-contract-terminated"
  | "asset-takedown"
  | "manual-compliance-hold";

export interface SealRevocationEntry {
  readonly revocationId: string;
  readonly sealDigestHash?: string;
  readonly masterAuditHash?: string;
  readonly reasonCode: SealRevocationReasonCode;
  readonly reasonDetail: string;
  readonly revokedAtIso: string;
}

export interface SealRevocationLedger {
  readonly ledgerSchemaVersion: 1;
  readonly entries: readonly SealRevocationEntry[];
  readonly updatedAtIso: string;
  readonly ledgerDigestHash: string;
}

export type ReaderTrustSealEffectiveStatus = "active" | "revoked" | "expired" | "tampered";

export interface ReaderTrustSealLiveStatus {
  readonly effectiveStatus: ReaderTrustSealEffectiveStatus;
  readonly effectiveLevel: ReaderTrustSealLevel;
  readonly digestValid: boolean;
  readonly matchedRevocation: SealRevocationEntry | null;
  readonly summary: string;
  readonly evaluatedAtIso: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export const SEAL_REVOCATION_REASON_LABELS: Record<SealRevocationReasonCode, string> = {
  "font-license-expired": "외주 폰트 라이선스 만료",
  "voice-contract-terminated": "성우 음성권 계약 해지",
  "asset-takedown": "외부 에셋 권리 회수",
  "manual-compliance-hold": "법무·컴플라이언스 임시 보류",
};

/**
 * 독자 트러스트 배지 철회 원장(Revocation Ledger)을 생성하고 무결성 해시를 부여한다.
 */
export function buildSealRevocationLedger(params: {
  readonly entries: readonly SealRevocationEntry[];
  readonly updatedAtIso?: string;
}): SealRevocationLedger {
  const updatedAtIso = params.updatedAtIso ?? new Date().toISOString();
  const normalizedEntries = [...params.entries];
  const ledgerDigestHash = fnv1aHex(
    JSON.stringify({
      ledgerSchemaVersion: 1,
      entries: normalizedEntries,
      updatedAtIso,
    }),
  );

  return {
    ledgerSchemaVersion: 1,
    entries: normalizedEntries,
    updatedAtIso,
    ledgerDigestHash,
  };
}

/**
 * 발급된 ReaderTrustSealPayload의 현재 유효 상태를 철회 원장 및 유효기간 기준으로 판정한다.
 */
export function evaluateReaderTrustSealLiveStatus(params: {
  readonly seal: ReaderTrustSealPayload;
  readonly ledger?: SealRevocationLedger | null;
  readonly expiresAtIso?: string | null;
  readonly asOfIso?: string;
}): ReaderTrustSealLiveStatus {
  const { seal, ledger, expiresAtIso } = params;
  const evaluatedAtIso = params.asOfIso ?? new Date().toISOString();
  const digestValid = verifyReaderTrustSealDigest(seal);

  if (!digestValid) {
    return {
      effectiveStatus: "tampered",
      effectiveLevel: "unverified",
      digestValid: false,
      matchedRevocation: null,
      summary: "트러스트 배지 서명 해시 위변조 감지 — 인증 효력 정지",
      evaluatedAtIso,
    };
  }

  const asOfMs = Date.parse(evaluatedAtIso);
  const matchedRevocation =
    ledger?.entries.find((entry) => {
      const hashMatch =
        (entry.sealDigestHash && entry.sealDigestHash === seal.sealDigestHash) ||
        (entry.masterAuditHash && entry.masterAuditHash === seal.masterAuditHash);
      if (!hashMatch) return false;
      const revokedMs = Date.parse(entry.revokedAtIso);
      if (Number.isNaN(revokedMs) || Number.isNaN(asOfMs)) return true;
      return asOfMs >= revokedMs;
    }) ?? null;

  if (matchedRevocation) {
    const label = SEAL_REVOCATION_REASON_LABELS[matchedRevocation.reasonCode];
    return {
      effectiveStatus: "revoked",
      effectiveLevel: "unverified",
      digestValid: true,
      matchedRevocation,
      summary: `인증 철회됨 (${label}: ${matchedRevocation.reasonDetail})`,
      evaluatedAtIso,
    };
  }

  if (expiresAtIso) {
    const expMs = Date.parse(expiresAtIso);
    if (!Number.isNaN(expMs) && !Number.isNaN(asOfMs) && asOfMs > expMs) {
      return {
        effectiveStatus: "expired",
        effectiveLevel: "unverified",
        digestValid: true,
        matchedRevocation: null,
        summary: `인증 유효기간 만료 (${expiresAtIso}) — 재검증 필요`,
        evaluatedAtIso,
      };
    }
  }

  return {
    effectiveStatus: "active",
    effectiveLevel: seal.level,
    digestValid: true,
    matchedRevocation: null,
    summary:
      seal.level === "verified-10-stage"
        ? "클린 IP 10단계 실시간 유효"
        : seal.level === "verified-commercial"
          ? "상업 클린 에셋 실시간 유효"
          : "저작권 인증 대기",
    evaluatedAtIso,
  };
}
