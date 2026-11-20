import type { ReaderTrustSealPayload } from "@/shared/lib/reader-trust-seal";
import {
  evaluateReaderTrustSealLiveStatus,
  type ReaderTrustSealLiveStatus,
  type SealRevocationLedger,
} from "@/shared/lib/reader-trust-seal-revocation";

export type DerivativeIpMedium =
  | "movingtoon-shortform"
  | "merchandise-goods"
  | "novelization"
  | "video-adaptation";

export interface DerivativeIpRequest {
  readonly medium: DerivativeIpMedium;
  readonly projectTitle: string;
  readonly partnerName: string;
  readonly targetLocales: readonly string[];
  readonly requiresVoiceSynthesis: boolean;
}

export interface DerivativeIpClearanceItem {
  readonly medium: DerivativeIpMedium;
  readonly projectTitle: string;
  readonly partnerName: string;
  readonly cleared: boolean;
  readonly blockedReasons: readonly string[];
  readonly inheritedSealDigestHash: string;
  readonly inheritedMasterAuditHash: string;
}

export interface DerivativeIpChainManifest {
  readonly derivativeSchemaVersion: 1;
  readonly sourceSeriesTitle: string;
  readonly sourceSealDigestHash: string;
  readonly sourceMasterAuditHash: string;
  readonly sourceLiveStatus: ReaderTrustSealLiveStatus;
  readonly allDerivativesCleared: boolean;
  readonly items: readonly DerivativeIpClearanceItem[];
  readonly derivativeChainHash: string;
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

export const DERIVATIVE_IP_MEDIUM_LABELS: Record<DerivativeIpMedium, string> = {
  "movingtoon-shortform": "숏폼 무빙툰",
  "merchandise-goods": "굿즈·머천다이징",
  novelization: "웹소설 노블라이즈",
  "video-adaptation": "드라마·애니 영상화",
};

/**
 * 원작 웹툰의 Reader Trust Seal과 실시간 철회 상태를 바탕으로
 * 2차 파생 IP(무빙툰·굿즈·노블라이즈·영상화)의 저작권 승계 가능 여부를 판정하고 해시 체인을 발급한다.
 */
export function buildDerivativeIpChainManifest(params: {
  readonly seal: ReaderTrustSealPayload;
  readonly revocationLedger?: SealRevocationLedger | null;
  readonly expiresAtIso?: string | null;
  readonly asOfIso?: string;
  readonly requests: readonly DerivativeIpRequest[];
}): DerivativeIpChainManifest {
  const evaluatedAtIso = params.asOfIso ?? new Date().toISOString();
  const liveStatus = evaluateReaderTrustSealLiveStatus({
    seal: params.seal,
    ledger: params.revocationLedger,
    expiresAtIso: params.expiresAtIso,
    asOfIso: evaluatedAtIso,
  });

  const items: DerivativeIpClearanceItem[] = params.requests.map((req) => {
    const blockedReasons: string[] = [];

    if (liveStatus.effectiveStatus !== "active") {
      blockedReasons.push(`원작 트러스트 배지 비활성 (${liveStatus.summary})`);
    }
    if (!params.seal.commercialAssetsCleared) {
      blockedReasons.push("원작 상업 에셋 라이선스 미승인");
    }
    if (req.requiresVoiceSynthesis && !params.seal.voiceConsentVerified) {
      blockedReasons.push("성우 AI 음성권 계약 미인증으로 무빙툰·더빙 파생 불가");
    }
    if (req.medium === "video-adaptation" && liveStatus.effectiveLevel !== "verified-10-stage") {
      blockedReasons.push("영상화 파생 IP는 10단계 완전 프로비넌스 인증 필수");
    }
    if (req.targetLocales.length > 0 && params.seal.globalLocalesCount === 0) {
      blockedReasons.push("글로벌 현지화 저작권 체인 미검증");
    }

    return {
      medium: req.medium,
      projectTitle: req.projectTitle,
      partnerName: req.partnerName,
      cleared: blockedReasons.length === 0,
      blockedReasons,
      inheritedSealDigestHash: params.seal.sealDigestHash,
      inheritedMasterAuditHash: params.seal.masterAuditHash,
    };
  });

  const allDerivativesCleared = items.length > 0 && items.every((item) => item.cleared);
  const derivativeChainHash = fnv1aHex(
    JSON.stringify({
      sourceSealDigestHash: params.seal.sealDigestHash,
      sourceMasterAuditHash: params.seal.masterAuditHash,
      effectiveStatus: liveStatus.effectiveStatus,
      allDerivativesCleared,
      items: items.map((i) => ({
        medium: i.medium,
        projectTitle: i.projectTitle,
        cleared: i.cleared,
      })),
    }),
  );

  return {
    derivativeSchemaVersion: 1,
    sourceSeriesTitle: params.seal.seriesTitle,
    sourceSealDigestHash: params.seal.sealDigestHash,
    sourceMasterAuditHash: params.seal.masterAuditHash,
    sourceLiveStatus: liveStatus,
    allDerivativesCleared,
    items,
    derivativeChainHash,
    evaluatedAtIso,
  };
}
