import {
  buildReaderTrustSeal,
  type ReaderTrustSealPayload,
} from "@/shared/lib/reader-trust-seal";

import type { EpisodeDeliveryPackage } from "./studio-episode-delivery-package";
import type { IpProvenanceChainAuditResult } from "./studio-ip-provenance-chain-verifier";
import type { GlobalLocalizationRightsManifest } from "./studio-localization-rights-chain";
import type { VoiceSynthesisConsentLedger } from "./studio-voice-synthesis-consent-ledger";

/**
 * 스튜디오 내보내기·프로비넌스 감사 결과를 독자 열람 페이지용 `ReaderTrustSealPayload`로 변환하는 브리지.
 */
export function buildReaderTrustSealFromAudit(params: {
  readonly audit: IpProvenanceChainAuditResult;
  readonly deliveryPackage: EpisodeDeliveryPackage;
  readonly localizationManifest?: GlobalLocalizationRightsManifest | null;
  readonly voiceLedger?: VoiceSynthesisConsentLedger | null;
  readonly issuedAtIso?: string;
}): ReaderTrustSealPayload {
  const { audit, deliveryPackage, localizationManifest, voiceLedger } = params;
  const verifiedStagesCount = audit.stages.filter((s) => s.valid).length;

  return buildReaderTrustSeal({
    seriesTitle: audit.seriesTitle,
    verifiedStagesCount,
    totalStagesCount: audit.stages.length,
    commercialAssetsCleared: deliveryPackage.commercialReady && audit.allStagesVerified,
    aiTrainingOptOut: deliveryPackage.aiOptOutManifest.tdmReservation === 1,
    voiceConsentVerified: Boolean(voiceLedger?.allContractsCleared),
    globalLocalesCount: localizationManifest?.clearedLocaleCount ?? 0,
    masterAuditHash: audit.masterChainAuditHash,
    issuedAtIso: params.issuedAtIso,
  });
}
