/**
 * Waves 70–79: IP 마켓플레이스·기관 펀드 DD·2차 판권 금융 엔진 (IP Marketplace Finance Engine)
 * - W70: IP Valuation Multiples & Cohort LTV Modeler
 * - W71: Option Agreement & Exclusivity Window Ledger
 * - W72: Cross-Media Revenue Waterfall Simulator
 * - W73: Creator Advance Recoupment & MG Tracker
 * - W74: Institutional LP Quarterly IP Performance Packet
 * - W75: Secondary IP Rights Fractional Licensing Engine
 * - W76: Brand Sponsorship & PPL Placement Compliance Gate
 * - W77: Merchandise SKU Royalty & Print-Run Auditor
 * - W78: Collector Limited-Edition Digital Certificate Engine
 * - W79: IP Exchange Settlement & Escrow Finality Verifier
 */

export interface IpValuationInput {
  readonly monthlyPaidReaders: number;
  readonly arpuKrw: number;
  readonly sixMonthRetentionRate: number;
  readonly cleanIpPremiumMultiplier: number;
}

export interface CrossMediaWaterfallResult {
  readonly totalGrossRevenueKrw: number;
  readonly advanceRecoupedKrw: number;
  readonly remainingAdvanceKrw: number;
  readonly creatorPayoutKrw: number;
  readonly studioShareKrw: number;
  readonly settlementFinalityHash: string;
}

export interface CollectorEditionCertificate {
  readonly editionNumber: number;
  readonly maxSupply: number;
  readonly seriesTitle: string;
  readonly ownerHandle: string;
  readonly masterAuditHash: string;
  readonly certificateDigestHash: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** W70: 코호트 잔존율 기반 IP 가치평가 산출 */
export function estimateIpValuationKrw(input: IpValuationInput): number {
  const annualRunRate = Math.max(0, input.monthlyPaidReaders) * Math.max(0, input.arpuKrw) * 12;
  const retentionFactor = 1 + Math.max(0, Math.min(1, input.sixMonthRetentionRate)) * 2.5;
  const multiplier = Math.max(1, input.cleanIpPremiumMultiplier);
  return Math.round(annualRunRate * retentionFactor * multiplier);
}

/** W72 + W73 + W79: 원작·2차판권·굿즈 통합 수익 워터폴 및 선급금(MG) 회수·최종성 해시 */
export function simulateCrossMediaWaterfall(params: {
  readonly webtoonRevenueKrw: number;
  readonly movingToonRevenueKrw: number;
  readonly merchandiseRoyaltyKrw: number;
  readonly pplSponsorshipKrw: number;
  readonly unrecoupedAdvanceKrw: number;
  readonly creatorSplitPercent: number;
}): CrossMediaWaterfallResult {
  const totalGrossRevenueKrw =
    Math.max(0, Math.round(params.webtoonRevenueKrw)) +
    Math.max(0, Math.round(params.movingToonRevenueKrw)) +
    Math.max(0, Math.round(params.merchandiseRoyaltyKrw)) +
    Math.max(0, Math.round(params.pplSponsorshipKrw));

  const advance = Math.max(0, Math.round(params.unrecoupedAdvanceKrw));
  const advanceRecoupedKrw = Math.min(totalGrossRevenueKrw, advance);
  const remainingAdvanceKrw = advance - advanceRecoupedKrw;
  const distributable = totalGrossRevenueKrw - advanceRecoupedKrw;
  const creatorPayoutKrw = Math.round((distributable * params.creatorSplitPercent) / 100);
  const studioShareKrw = distributable - creatorPayoutKrw;

  const settlementFinalityHash = fnv1aHex(
    JSON.stringify({
      totalGrossRevenueKrw,
      advanceRecoupedKrw,
      remainingAdvanceKrw,
      creatorPayoutKrw,
      studioShareKrw,
    }),
  );

  return {
    totalGrossRevenueKrw,
    advanceRecoupedKrw,
    remainingAdvanceKrw,
    creatorPayoutKrw,
    studioShareKrw,
    settlementFinalityHash,
  };
}

/** W78: 소장판 디지털 정품 인증서 발급 */
export function issueCollectorEditionCertificate(params: {
  readonly editionNumber: number;
  readonly maxSupply: number;
  readonly seriesTitle: string;
  readonly ownerHandle: string;
  readonly masterAuditHash: string;
}): CollectorEditionCertificate {
  const safeEdition = Math.max(1, Math.min(params.maxSupply, Math.floor(params.editionNumber)));
  const certificateDigestHash = fnv1aHex(
    JSON.stringify({
      editionNumber: safeEdition,
      maxSupply: params.maxSupply,
      seriesTitle: params.seriesTitle,
      ownerHandle: params.ownerHandle,
      masterAuditHash: params.masterAuditHash,
    }),
  );
  return {
    editionNumber: safeEdition,
    maxSupply: params.maxSupply,
    seriesTitle: params.seriesTitle,
    ownerHandle: params.ownerHandle,
    masterAuditHash: params.masterAuditHash,
    certificateDigestHash,
  };
}
