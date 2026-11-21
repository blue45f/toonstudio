/**
 * Studio No.9식 `기본 컷 단가 + 공정별 인세(%)` 기본 프리셋 + 한국 CP 표준 `MG 선공제 + RS(%)` 정산 원장 엔진 (T-007).
 * 플랫폼 수수료(30~50%), 3.3% 사업소득 원천징수(또는 법인 VAT 10%), G3 승인 컷 자동 적립 및 CSV/JSON 정산서를 생성한다.
 */

import { DIVISION_ROLE_METADATA, type DivisionRoleId } from "./layer-authority-rbac";

export type SettlementModelMode = "studio-no9-cut-plus-royalty" | "korean-cp-mg-rs";

export type TaxSettlementKind = "withholding_3_3" | "corporate_vat_10";

export interface ContributorRoyaltyContract {
  readonly contributorId: string;
  readonly name: string;
  readonly role: DivisionRoleId;
  readonly baseCutRateKrw: number;
  readonly stageRoyaltyPercent: number;
  readonly mgAdvanceKrw: number;
  readonly mgRecoupedPriorKrw: number;
  readonly rsPercent: number;
  readonly approvedG3Cuts: number;
  readonly taxKind: TaxSettlementKind;
}

export interface RoyaltyLedgerInput {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly periodLabel: string;
  readonly mode: SettlementModelMode;
  readonly grossPlatformRevenueKrw: number;
  /** 플랫폼 수수료율 0.30 ~ 0.50 */
  readonly platformFeeRate: number;
  readonly contributors: readonly ContributorRoyaltyContract[];
  readonly generatedAtIso?: string;
}

export interface ContributorPayoutLine {
  readonly contributorId: string;
  readonly name: string;
  readonly role: DivisionRoleId;
  readonly roleLabelKo: string;
  readonly roleLabelEn: string;
  readonly approvedG3Cuts: number;
  readonly baseCutPayKrw: number;
  readonly royaltyOrRsGrossKrw: number;
  readonly mgRecoupedThisPeriodKrw: number;
  readonly mgRemainingAfterKrw: number;
  readonly grossPayoutKrw: number;
  readonly taxKind: TaxSettlementKind;
  readonly taxDeltaKrw: number;
  readonly netPayoutKrw: number;
}

export interface RoyaltySettlementStatement {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly periodLabel: string;
  readonly mode: SettlementModelMode;
  readonly grossPlatformRevenueKrw: number;
  readonly platformFeeRate: number;
  readonly platformFeeKrw: number;
  readonly netDistributableRevenueKrw: number;
  readonly lines: readonly ContributorPayoutLine[];
  readonly totalApprovedG3Cuts: number;
  readonly totalBaseCutPayKrw: number;
  readonly totalRoyaltyPayoutKrw: number;
  readonly totalMgRecoupedKrw: number;
  readonly totalGrossPayoutKrw: number;
  readonly totalTaxDeltaKrw: number;
  readonly totalNetPayoutKrw: number;
  readonly generatedAtIso: string;
}

const FREELANCE_WITHHOLDING_RATE = 0.033;
const CORPORATE_VAT_RATE = 0.1;

export function createDefaultStudioRoyaltyContracts(): readonly ContributorRoyaltyContract[] {
  return [
    {
      contributorId: "c-writer-1",
      name: "강민서",
      role: "writer",
      baseCutRateKrw: 12_000,
      stageRoyaltyPercent: 8,
      mgAdvanceKrw: 2_400_000,
      mgRecoupedPriorKrw: 1_200_000,
      rsPercent: 18,
      approvedG3Cuts: 80,
      taxKind: "withholding_3_3",
    },
    {
      contributorId: "c-line-1",
      name: "박서윤",
      role: "line",
      baseCutRateKrw: 24_000,
      stageRoyaltyPercent: 12,
      mgAdvanceKrw: 3_600_000,
      mgRecoupedPriorKrw: 2_100_000,
      rsPercent: 25,
      approvedG3Cuts: 80,
      taxKind: "withholding_3_3",
    },
    {
      contributorId: "c-bg3d-1",
      name: "정우진 (배경 스튜디오)",
      role: "bg3d",
      baseCutRateKrw: 14_000,
      stageRoyaltyPercent: 4,
      mgAdvanceKrw: 1_200_000,
      mgRecoupedPriorKrw: 1_200_000,
      rsPercent: 8,
      approvedG3Cuts: 60,
      taxKind: "corporate_vat_10",
    },
    {
      contributorId: "c-shade-1",
      name: "오세린",
      role: "shade",
      baseCutRateKrw: 18_000,
      stageRoyaltyPercent: 7,
      mgAdvanceKrw: 1_800_000,
      mgRecoupedPriorKrw: 900_000,
      rsPercent: 14,
      approvedG3Cuts: 80,
      taxKind: "withholding_3_3",
    },
    {
      contributorId: "c-fx-1",
      name: "신유나",
      role: "finishing_lettering",
      baseCutRateKrw: 9_000,
      stageRoyaltyPercent: 3,
      mgAdvanceKrw: 600_000,
      mgRecoupedPriorKrw: 600_000,
      rsPercent: 6,
      approvedG3Cuts: 80,
      taxKind: "withholding_3_3",
    },
  ];
}

/** G3 최종 승인 컷 발생 시 담당자 정산 원장에 승인 컷 수 자동 적립 */
export function accrueApprovedG3Cuts(
  contracts: readonly ContributorRoyaltyContract[],
  input: {
    readonly contributorId: string;
    readonly addedG3Cuts: number;
  },
): readonly ContributorRoyaltyContract[] {
  const delta = Math.max(0, Math.round(input.addedG3Cuts));
  if (delta === 0) return contracts;
  return contracts.map((contract) =>
    contract.contributorId === input.contributorId
      ? { ...contract, approvedG3Cuts: contract.approvedG3Cuts + delta }
      : contract,
  );
}

/**
 * 듀얼 모드 정산 계산기:
 * - studio-no9-cut-plus-royalty (기본값): G3 승인 컷 기본 단가 + 플랫폼 수수료 차감 순매출 × 공정별 인세(%)
 * - korean-cp-mg-rs (전환 옵션): 순매출 × RS(%)에서 미상환 MG 잔액을 선공제하고 초과분만 지급
 */
export function calculateRoyaltySettlement(input: RoyaltyLedgerInput): RoyaltySettlementStatement {
  const platformFeeRate = Math.max(0.3, Math.min(0.5, input.platformFeeRate));
  const grossPlatformRevenueKrw = Math.max(0, Math.round(input.grossPlatformRevenueKrw));
  const platformFeeKrw = Math.round(grossPlatformRevenueKrw * platformFeeRate);
  const netDistributableRevenueKrw = Math.max(0, grossPlatformRevenueKrw - platformFeeKrw);

  const lines: ContributorPayoutLine[] = input.contributors.map((contract) => {
    const roleMeta = DIVISION_ROLE_METADATA[contract.role];
    const approvedG3Cuts = Math.max(0, Math.round(contract.approvedG3Cuts));
    const unrecoupedMg = Math.max(0, contract.mgAdvanceKrw - contract.mgRecoupedPriorKrw);
    const isNo9 = input.mode === "studio-no9-cut-plus-royalty";
    const baseCutPayKrw = isNo9 ? Math.round(contract.baseCutRateKrw * approvedG3Cuts) : 0;
    const royaltyOrRsGrossKrw = Math.round(
      netDistributableRevenueKrw * (Math.max(0, isNo9 ? contract.stageRoyaltyPercent : contract.rsPercent) / 100),
    );
    const mgRecoupedThisPeriodKrw = isNo9 ? 0 : Math.min(unrecoupedMg, royaltyOrRsGrossKrw);
    const mgRemainingAfterKrw = Math.max(0, unrecoupedMg - mgRecoupedThisPeriodKrw);
    const grossPayoutKrw = isNo9
      ? baseCutPayKrw + royaltyOrRsGrossKrw
      : Math.max(0, royaltyOrRsGrossKrw - mgRecoupedThisPeriodKrw);

    const taxDeltaKrw =
      contract.taxKind === "withholding_3_3"
        ? -Math.floor(grossPayoutKrw * FREELANCE_WITHHOLDING_RATE)
        : Math.round(grossPayoutKrw * CORPORATE_VAT_RATE);
    const netPayoutKrw = grossPayoutKrw + taxDeltaKrw;

    return {
      contributorId: contract.contributorId,
      name: contract.name,
      role: contract.role,
      roleLabelKo: roleMeta.shortKo,
      roleLabelEn: roleMeta.shortEn,
      approvedG3Cuts,
      baseCutPayKrw,
      royaltyOrRsGrossKrw,
      mgRecoupedThisPeriodKrw,
      mgRemainingAfterKrw,
      grossPayoutKrw,
      taxKind: contract.taxKind,
      taxDeltaKrw,
      netPayoutKrw,
    };
  });

  const totalApprovedG3Cuts = lines.reduce((sum, item) => sum + item.approvedG3Cuts, 0);
  const totalBaseCutPayKrw = lines.reduce((sum, item) => sum + item.baseCutPayKrw, 0);
  const totalRoyaltyPayoutKrw = lines.reduce((sum, item) => sum + item.royaltyOrRsGrossKrw, 0);
  const totalMgRecoupedKrw = lines.reduce((sum, item) => sum + item.mgRecoupedThisPeriodKrw, 0);
  const totalGrossPayoutKrw = lines.reduce((sum, item) => sum + item.grossPayoutKrw, 0);
  const totalTaxDeltaKrw = lines.reduce((sum, item) => sum + item.taxDeltaKrw, 0);
  const totalNetPayoutKrw = lines.reduce((sum, item) => sum + item.netPayoutKrw, 0);

  return {
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    periodLabel: input.periodLabel,
    mode: input.mode,
    grossPlatformRevenueKrw,
    platformFeeRate,
    platformFeeKrw,
    netDistributableRevenueKrw,
    lines,
    totalApprovedG3Cuts,
    totalBaseCutPayKrw,
    totalRoyaltyPayoutKrw,
    totalMgRecoupedKrw,
    totalGrossPayoutKrw,
    totalTaxDeltaKrw,
    totalNetPayoutKrw,
    generatedAtIso: input.generatedAtIso ?? "2026-11-21T12:00:00.000Z",
  };
}

function escapeCsvCell(value: string | number): string {
  const raw = String(value);
  if (/[",\n\r]/u.test(raw)) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

/** RFC-4180 호환 CSV 정산서 생성기 */
export function exportSettlementLedgerToCsv(statement: RoyaltySettlementStatement): string {
  const header = [
    "project_id",
    "period",
    "settlement_mode",
    "contributor_id",
    "contributor_name",
    "role",
    "approved_g3_cuts",
    "base_cut_pay_krw",
    "royalty_or_rs_gross_krw",
    "mg_recouped_krw",
    "gross_payout_krw",
    "tax_kind",
    "tax_delta_krw",
    "net_payout_krw",
  ];

  const rows = statement.lines.map((line) => [
    statement.projectId,
    statement.periodLabel,
    statement.mode,
    line.contributorId,
    line.name,
    line.role,
    line.approvedG3Cuts,
    line.baseCutPayKrw,
    line.royaltyOrRsGrossKrw,
    line.mgRecoupedThisPeriodKrw,
    line.grossPayoutKrw,
    line.taxKind,
    line.taxDeltaKrw,
    line.netPayoutKrw,
  ]);

  const totalRow = [
    statement.projectId,
    statement.periodLabel,
    statement.mode,
    "TOTAL",
    "TOTAL",
    "all",
    statement.totalApprovedG3Cuts,
    statement.totalBaseCutPayKrw,
    statement.totalRoyaltyPayoutKrw,
    statement.totalMgRecoupedKrw,
    statement.totalGrossPayoutKrw,
    "mixed",
    statement.totalTaxDeltaKrw,
    statement.totalNetPayoutKrw,
  ];

  return [header, ...rows, totalRow]
    .map((cells) => cells.map((cell) => escapeCsvCell(cell)).join(","))
    .join("\n");
}

/** 정본 JSON 정산서 직렬화 */
export function exportSettlementLedgerToJson(statement: RoyaltySettlementStatement): string {
  return JSON.stringify(statement, null, 2);
}
