import type { IpSlateFundDdReport } from "./studio-ip-slate-fund-dd";
import type { GlobalLocalizationRightsManifest } from "./studio-localization-rights-chain";
import type { SeriesCommercialPipelineOutput } from "./studio-rights-monetization-pipeline";

export interface ProvenanceChainStageCheck {
  readonly stage:
    | "rights-bom-receipt"
    | "ai-optout-manifest"
    | "license-offer"
    | "escrow-settlement"
    | "series-dossier"
    | "mg-readiness"
    | "advance-underwriting"
    | "ip-slate-dd"
    | "localization-rights";
  readonly valid: boolean;
  readonly hash: string;
  readonly detail: string;
}

export interface IpProvenanceChainAuditResult {
  readonly auditSchemaVersion: 1;
  readonly seriesTitle: string;
  readonly allStagesVerified: boolean;
  readonly brokenStages: readonly ProvenanceChainStageCheck["stage"][];
  readonly stages: readonly ProvenanceChainStageCheck[];
  readonly masterChainAuditHash: string;
  readonly summary: string;
}

const FNV_HEX_PATTERN = /^fnv1a-[0-9a-f]{8}$/;

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * 스튜디오 ERP · 법무 · 투자사 · 글로벌 유통 감사를 위해 제작(Rights BOM)부터 정산(Escrow),
 * 선정산 심사(Underwriting), 펀드 배분(DD), 글로벌 현지화(Localization)까지 해시 체인 참조 무결성을 대조한다.
 */
export function verifySeriesIpProvenanceChain(
  pipeline: SeriesCommercialPipelineOutput,
  optionalDdReport?: IpSlateFundDdReport | null,
  optionalLocalizationManifest?: GlobalLocalizationRightsManifest | null,
): IpProvenanceChainAuditResult {
  const stages: ProvenanceChainStageCheck[] = [];

  const firstPkg = pipeline.deliveryPackages[0];
  const firstOffer = pipeline.licenseOffers[0];
  const firstSettlement = pipeline.settlements[0];
  const dossierEp0 = pipeline.seriesDossier.episodes[0];

  const receiptHash = dossierEp0?.integrityHash ?? "";
  stages.push({
    stage: "rights-bom-receipt",
    valid: Boolean(firstPkg && FNV_HEX_PATTERN.test(receiptHash) && firstPkg.commercialReady),
    hash: receiptHash,
    detail: firstPkg?.commercialReady ? "원고 Rights BOM 상업 클린 확인" : "원고 Rights BOM 미통과 또는 누락",
  });

  const optOutHash = firstPkg?.aiOptOutManifest.manifestIntegrityHash ?? "";
  stages.push({
    stage: "ai-optout-manifest",
    valid: Boolean(
      firstPkg &&
        FNV_HEX_PATTERN.test(optOutHash) &&
        firstPkg.aiOptOutManifest.receiptIntegrityHash === receiptHash,
    ),
    hash: optOutHash,
    detail: "AI 학습 옵트아웃 매니페스트 ↔ Rights BOM 해시 일치",
  });

  const offerHash = firstOffer?.offerIntegrityHash ?? "";
  stages.push({
    stage: "license-offer",
    valid: Boolean(
      firstOffer &&
        FNV_HEX_PATTERN.test(offerHash) &&
        firstOffer.receiptIntegrityHash === receiptHash &&
        firstOffer.optOutManifestHash === optOutHash,
    ),
    hash: offerHash,
    detail: "Spectrum 라이선스 제안 ↔ Rights BOM·Opt-Out 해시 일치",
  });

  const settlementHash = firstSettlement?.settlementIntegrityHash ?? "";
  stages.push({
    stage: "escrow-settlement",
    valid: Boolean(
      firstSettlement &&
        FNV_HEX_PATTERN.test(settlementHash) &&
        firstSettlement.offerIntegrityHash === offerHash &&
        firstSettlement.packageIntegrityHash === firstPkg?.packageIntegrityHash &&
        firstSettlement.receiptIntegrityHash === receiptHash,
    ),
    hash: settlementHash,
    detail: "에스크로 정산 지시서 ↔ 제안서·납품 패키지 해시 일치",
  });

  const dossierHash = pipeline.seriesDossier.dossierHash;
  stages.push({
    stage: "series-dossier",
    valid: FNV_HEX_PATTERN.test(dossierHash) && pipeline.seriesDossier.allEpisodesCleared,
    hash: dossierHash,
    detail: "연재작 IP 실사 도시에 전 회차 클린 확인",
  });

  const mgHash = pipeline.mgReadiness.readinessDigestHash;
  stages.push({
    stage: "mg-readiness",
    valid:
      FNV_HEX_PATTERN.test(mgHash) &&
      pipeline.mgReadiness.settlementHashes.includes(settlementHash),
    hash: mgHash,
    detail: "창작자 MG 신뢰도 리포트 ↔ 정산 해시 원장 포함 확인",
  });

  const underwriting = pipeline.advanceUnderwriting;
  stages.push({
    stage: "advance-underwriting",
    valid:
      FNV_HEX_PATTERN.test(underwriting.underwritingIntegrityHash) &&
      underwriting.dossierHash === dossierHash &&
      underwriting.mgReadinessDigestHash === mgHash,
    hash: underwriting.underwritingIntegrityHash,
    detail: "선정산·MG 한도 심사 ↔ 도시에·MG 다이제스트 해시 일치",
  });

  if (optionalDdReport) {
    const matchingAlloc = optionalDdReport.allocations.find(
      (a) => a.underwritingHash === underwriting.underwritingIntegrityHash,
    );
    stages.push({
      stage: "ip-slate-dd",
      valid:
        FNV_HEX_PATTERN.test(optionalDdReport.ddPackageHash) && Boolean(matchingAlloc),
      hash: optionalDdReport.ddPackageHash,
      detail: matchingAlloc
        ? "IP 슬레이트 펀드 배분표 ↔ 작품 선정산 심사 해시 연결 확인"
        : "IP 슬레이트 펀드 배분표에서 해당 심사 해시를 찾을 수 없음",
    });
  }

  if (optionalLocalizationManifest) {
    const locValid =
      FNV_HEX_PATTERN.test(optionalLocalizationManifest.localizationChainHash) &&
      optionalLocalizationManifest.allLocalesCleared &&
      optionalLocalizationManifest.sourceReceiptIntegrityHash === receiptHash &&
      optionalLocalizationManifest.sourcePackageIntegrityHash === firstPkg?.packageIntegrityHash;
    stages.push({
      stage: "localization-rights",
      valid: Boolean(locValid),
      hash: optionalLocalizationManifest.localizationChainHash,
      detail: locValid
        ? `글로벌 다국어(${optionalLocalizationManifest.clearedLocaleCount}개 로케일) 공급망 체인 일치`
        : "글로벌 현지화 라이선스 보류 또는 원작 해시 불일치",
    });
  }

  const brokenStages = stages.filter((s) => !s.valid).map((s) => s.stage);
  const allStagesVerified = stages.length > 0 && brokenStages.length === 0;
  const masterChainAuditHash = fnv1aHex(
    JSON.stringify({
      seriesTitle: pipeline.seriesTitle,
      allStagesVerified,
      stages: stages.map((s) => ({ stage: s.stage, valid: s.valid, hash: s.hash })),
    }),
  );

  return {
    auditSchemaVersion: 1,
    seriesTitle: pipeline.seriesTitle,
    allStagesVerified,
    brokenStages,
    stages,
    masterChainAuditHash,
    summary: allStagesVerified
      ? `전 구간(${stages.length}/${stages.length}) IP 프로비넌스 해시 체인 검증 통과 (${masterChainAuditHash})`
      : `해시 체인 불일치 감지: ${brokenStages.join(", ")}`,
  };
}
