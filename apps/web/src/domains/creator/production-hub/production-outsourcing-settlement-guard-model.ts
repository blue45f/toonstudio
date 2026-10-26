/**
 * Webtoon Division-of-Labor Outsourcing Settlement, Revision-Round Scope Guard & Tax/Escrow Ledger Model
 *
 * Clean-room internalization of REA reverse-engineering evidence:
 * - Kmong Enterprise & Market (`https://kmong.com/`, capture `ev_c98ec296a0b874d335f3f8ae58c2b12a512c89c3e28dfd8e090bd79587570514`,
 *   AST `ev_2a801e736626b7d913f64e6c4a27d8e169a0784de4a11ed0052e3882a7ad907b`, 264,841 AST nodes,
 *   routes `/buyer/order-list`, `/seller/order-list`, `/enterprise/simple-apply/gate`, `/kmongbiz/biz-postpaid/histories`)
 */

export type SettlementTaxMode = "freelancer-withholding-3.3" | "corporate-vat-10-postpaid";

export type EscrowOrderGateState = "escrow-funded" | "inspection-gate" | "released-settled";

export type SceneDifficultyTier = "standard" | "action-crowd" | "boss-vfx-heavy";

export interface DivisionOutsourcingOrder {
  readonly id: string;
  readonly orderCode: string;
  readonly partnerName: string;
  readonly stageLabelKo: string;
  readonly stageLabelEn: string;
  readonly contractedCuts: number;
  readonly baseCutRateKrw: number;
  readonly difficultyTier: SceneDifficultyTier;
  readonly freeRevisionRoundsIncluded: number;
  readonly requestedRevisionRounds: number;
  readonly extraRevisionFeePerRoundKrw: number;
  readonly taxMode: SettlementTaxMode;
  readonly escrowState: EscrowOrderGateState;
}

export interface DivisionSettlementCalculation {
  readonly orderId: string;
  readonly difficultyMultiplier: number;
  readonly baseSupplyKrw: number;
  readonly excessRevisionRounds: number;
  readonly revisionSurchargeKrw: number;
  readonly grossSupplyKrw: number;
  readonly withholdingTax33Krw: number;
  readonly vat10Krw: number;
  readonly netPayoutOrInvoiceKrw: number;
  readonly scopeCreepDetected: boolean;
}

export interface DivisionSettlementLedgerSummary {
  readonly totalOrders: number;
  readonly totalGrossSupplyKrw: number;
  readonly totalRevisionSurchargeKrw: number;
  readonly totalWithholdingTaxKrw: number;
  readonly totalVatKrw: number;
  readonly totalNetDisbursementKrw: number;
  readonly scopeCreepOrderCount: number;
  readonly settledOrderCount: number;
}

const DIFFICULTY_MULTIPLIERS: Readonly<Record<SceneDifficultyTier, number>> = {
  standard: 1.0,
  "action-crowd": 1.25,
  "boss-vfx-heavy": 1.4,
};

export const DEFAULT_DIVISION_OUTSOURCING_ORDERS: readonly DivisionOutsourcingOrder[] = [
  {
    id: "ord-line-1",
    orderCode: "KMG-ENT-2610-01",
    partnerName: "스튜디오 펜선결 (김선화)",
    stageLabelKo: "선화·펜선 분업 (전투씬 포함)",
    stageLabelEn: "Line Art & Inking (Action Scene)",
    contractedCuts: 45,
    baseCutRateKrw: 18000,
    difficultyTier: "action-crowd",
    freeRevisionRoundsIncluded: 2,
    requestedRevisionRounds: 3,
    extraRevisionFeePerRoundKrw: 85000,
    taxMode: "freelancer-withholding-3.3",
    escrowState: "inspection-gate",
  },
  {
    id: "ord-bg3d-2",
    orderCode: "KMG-BIZ-2610-02",
    partnerName: "아틀리에 픽셀돔 (법인 후불)",
    stageLabelKo: "3D 배경 모델링·소품 배치·은선 추출",
    stageLabelEn: "3D BG Modeling, Props & Line Export",
    contractedCuts: 28,
    baseCutRateKrw: 22000,
    difficultyTier: "standard",
    freeRevisionRoundsIncluded: 2,
    requestedRevisionRounds: 2,
    extraRevisionFeePerRoundKrw: 110000,
    taxMode: "corporate-vat-10-postpaid",
    escrowState: "released-settled",
  },
  {
    id: "ord-flat-3",
    orderCode: "KMG-ENT-2610-03",
    partnerName: "이밑색 프리랜서 어시",
    stageLabelKo: "밑색·부위별 ID 마스킹 분리",
    stageLabelEn: "Flat Color & Layer ID Masking",
    contractedCuts: 72,
    baseCutRateKrw: 7500,
    difficultyTier: "standard",
    freeRevisionRoundsIncluded: 1,
    requestedRevisionRounds: 1,
    extraRevisionFeePerRoundKrw: 45000,
    taxMode: "freelancer-withholding-3.3",
    escrowState: "released-settled",
  },
  {
    id: "ord-vfx-4",
    orderCode: "KMG-BIZ-2610-04",
    partnerName: "루미나 VFX 랩 (법인 후불)",
    stageLabelKo: "후보정·조명 LUT·각성 이펙트",
    stageLabelEn: "Compositing, LUT & Awakening VFX",
    contractedCuts: 36,
    baseCutRateKrw: 14000,
    difficultyTier: "boss-vfx-heavy",
    freeRevisionRoundsIncluded: 2,
    requestedRevisionRounds: 4,
    extraRevisionFeePerRoundKrw: 95000,
    taxMode: "corporate-vat-10-postpaid",
    escrowState: "escrow-funded",
  },
];

export function calculateDivisionSettlementItem(
  order: DivisionOutsourcingOrder,
): DivisionSettlementCalculation {
  const difficultyMultiplier = DIFFICULTY_MULTIPLIERS[order.difficultyTier] ?? 1.0;
  const baseSupplyKrw = Math.round(
    order.contractedCuts * order.baseCutRateKrw * difficultyMultiplier,
  );
  const excessRevisionRounds = Math.max(
    0,
    order.requestedRevisionRounds - order.freeRevisionRoundsIncluded,
  );
  const revisionSurchargeKrw = excessRevisionRounds * order.extraRevisionFeePerRoundKrw;
  const grossSupplyKrw = baseSupplyKrw + revisionSurchargeKrw;

  const withholdingTax33Krw =
    order.taxMode === "freelancer-withholding-3.3"
      ? Math.round(grossSupplyKrw * 0.033)
      : 0;
  const vat10Krw =
    order.taxMode === "corporate-vat-10-postpaid"
      ? Math.round(grossSupplyKrw * 0.1)
      : 0;

  const netPayoutOrInvoiceKrw =
    order.taxMode === "freelancer-withholding-3.3"
      ? grossSupplyKrw - withholdingTax33Krw
      : grossSupplyKrw + vat10Krw;

  return {
    orderId: order.id,
    difficultyMultiplier,
    baseSupplyKrw,
    excessRevisionRounds,
    revisionSurchargeKrw,
    grossSupplyKrw,
    withholdingTax33Krw,
    vat10Krw,
    netPayoutOrInvoiceKrw,
    scopeCreepDetected: excessRevisionRounds > 0,
  };
}

export function summarizeDivisionSettlementLedger(
  orders: readonly DivisionOutsourcingOrder[],
): DivisionSettlementLedgerSummary {
  let totalGrossSupplyKrw = 0;
  let totalRevisionSurchargeKrw = 0;
  let totalWithholdingTaxKrw = 0;
  let totalVatKrw = 0;
  let totalNetDisbursementKrw = 0;
  let scopeCreepOrderCount = 0;
  let settledOrderCount = 0;

  for (const order of orders) {
    const calc = calculateDivisionSettlementItem(order);
    totalGrossSupplyKrw += calc.grossSupplyKrw;
    totalRevisionSurchargeKrw += calc.revisionSurchargeKrw;
    totalWithholdingTaxKrw += calc.withholdingTax33Krw;
    totalVatKrw += calc.vat10Krw;
    totalNetDisbursementKrw += calc.netPayoutOrInvoiceKrw;
    if (calc.scopeCreepDetected) scopeCreepOrderCount += 1;
    if (order.escrowState === "released-settled") settledOrderCount += 1;
  }

  return {
    totalOrders: orders.length,
    totalGrossSupplyKrw,
    totalRevisionSurchargeKrw,
    totalWithholdingTaxKrw,
    totalVatKrw,
    totalNetDisbursementKrw,
    scopeCreepOrderCount,
    settledOrderCount,
  };
}
