import {
  evaluateCreatorAdvanceUnderwriting,
  type CreatorAdvanceUnderwritingResult,
} from "./studio-creator-advance-underwriting";
import {
  buildCreatorMgReadinessReport,
  type CreatorMgReadinessReport,
} from "./studio-creator-mg-readiness";
import {
  buildEpisodeDeliveryPackage,
  type EpisodeDeliveryCutInput,
  type EpisodeDeliveryPackage,
} from "./studio-episode-delivery-package";
import {
  buildEpisodeEscrowSettlement,
  type EpisodeEscrowSettlement,
} from "./studio-episode-escrow-settlement";
import {
  buildEpisodeRightsDossier,
  type EpisodeRightsDossier,
} from "./studio-episode-rights-dossier";
import {
  buildStudioSpectrumLicenseOffer,
  type SpectrumLicenseTier,
  type SpectrumRevenueParticipant,
  type StudioSpectrumLicenseOffer,
} from "./studio-spectrum-license-offer";

import type { StudioWorkflowPack } from "../assistant/studio-workflow-pack";
import type { StudioWorkflowPackRightsReceipt } from "../assistant/studio-workflow-pack-rights-receipt";

export interface SeriesEpisodePipelineInput {
  readonly episodeLabel: string;
  readonly pack: StudioWorkflowPack;
  readonly cuts: readonly EpisodeDeliveryCutInput[];
  readonly baseLicenseFeeKrw: number;
}

export interface SeriesCommercialPipelineOutput {
  readonly seriesTitle: string;
  readonly deliveryPackages: readonly EpisodeDeliveryPackage[];
  readonly licenseOffers: readonly StudioSpectrumLicenseOffer[];
  readonly settlements: readonly EpisodeEscrowSettlement[];
  readonly seriesDossier: EpisodeRightsDossier;
  readonly mgReadiness: CreatorMgReadinessReport;
  readonly advanceUnderwriting: CreatorAdvanceUnderwritingResult;
}

/**
 * 워크플로우 팩 → 납품 패키지(Rights BOM·PNG 청크·dHash·AI 옵트아웃) → Spectrum 라이선스 제안 →
 * 1원 에스크로 정산 → MG 신뢰도 → 제작비 선정산 심사까지 전 주기를 단일 호출로 실행하는 통합 오케스트레이터.
 */
export function runSeriesCommercialPipeline(params: {
  readonly seriesTitle: string;
  readonly rightsHolder?: string;
  readonly tier: SpectrumLicenseTier;
  readonly participants: readonly SpectrumRevenueParticipant[];
  readonly episodes: readonly SeriesEpisodePipelineInput[];
  readonly platformFeeBps?: number;
  readonly timestampIso?: string;
}): SeriesCommercialPipelineOutput {
  const timestampIso = params.timestampIso ?? new Date().toISOString();
  const deliveryPackages: EpisodeDeliveryPackage[] = [];
  const licenseOffers: StudioSpectrumLicenseOffer[] = [];
  const settlements: EpisodeEscrowSettlement[] = [];
  const dossierInputs: { readonly episodeLabel: string; readonly receipt: StudioWorkflowPackRightsReceipt }[] = [];

  for (const ep of params.episodes) {
    const pkg = buildEpisodeDeliveryPackage({
      seriesTitle: params.seriesTitle,
      episodeLabel: ep.episodeLabel,
      rightsHolder: params.rightsHolder,
      pack: ep.pack,
      cuts: ep.cuts,
      generatedAtIso: timestampIso,
    });
    const receipt = JSON.parse(pkg.receiptJson) as StudioWorkflowPackRightsReceipt;
    const offer = buildStudioSpectrumLicenseOffer({
      seriesTitle: params.seriesTitle,
      episodeLabel: ep.episodeLabel,
      tier: params.tier,
      baseLicenseFeeKrw: ep.baseLicenseFeeKrw,
      participants: params.participants,
      receipt,
      optOutManifest: pkg.aiOptOutManifest,
      issuedAtIso: timestampIso,
    });
    const settlement = buildEpisodeEscrowSettlement({
      offer,
      deliveryPackage: pkg,
      platformFeeBps: params.platformFeeBps,
      settledAtIso: timestampIso,
    });

    deliveryPackages.push(pkg);
    licenseOffers.push(offer);
    settlements.push(settlement);
    dossierInputs.push({ episodeLabel: ep.episodeLabel, receipt });
  }

  const seriesDossier = buildEpisodeRightsDossier(
    params.seriesTitle,
    dossierInputs,
    timestampIso,
  );
  const mgReadiness = buildCreatorMgReadinessReport({
    seriesTitle: params.seriesTitle,
    settlements,
    evaluatedAtIso: timestampIso,
  });
  const advanceUnderwriting = evaluateCreatorAdvanceUnderwriting({
    dossier: seriesDossier,
    mgReport: mgReadiness,
    evaluatedAtIso: timestampIso,
  });

  return {
    seriesTitle: params.seriesTitle,
    deliveryPackages,
    licenseOffers,
    settlements,
    seriesDossier,
    mgReadiness,
    advanceUnderwriting,
  };
}
