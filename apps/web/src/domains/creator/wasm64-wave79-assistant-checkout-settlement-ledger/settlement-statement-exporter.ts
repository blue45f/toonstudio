/**
 * 어시스턴트 정산서 한국어 Markdown 표 및 정규 JSON 영수증 내보내기 (Wave 79).
 *
 * - 원장 이진 머클 루트, 어시스턴트별 지급 내역, Rights BOM 라이선스 통과 여부를 한눈에 정리
 * - 국내 프리랜서 원천징수 참고 계산(`3.3%`: 소득세 `3.0%` + 지방소득세 `0.3%`)은
 *   `"참고용 예상 원천징수(3.3%)"`로 명확히 표시하며, 세무·법률 자문이 아님을 고지
 * - 정규 JSON 영수증의 SHA-256 다이제스트와 선택적 스튜디오 HMAC 검증을 지원
 */

import {
  type AssistantSettlementLineItem,
  type AssistantSettlementRole,
  type EpisodeSettlementPolicy,
  type EpisodeSettlementStatement,
} from "./contribution-rights-bom-settlement-ledger";
import {
  canonicalSerialize,
  constantTimeEqualHex,
  hmacSha256Hex,
  sha256Hex,
} from "./scoped-slice-crypto-checkout";

export const FREELANCER_WITHHOLDING_TOTAL_RATE = 0.033;
export const FREELANCER_WITHHOLDING_LABEL = "참고용 예상 원천징수(3.3%)";
export const TAX_NON_ADVISORY_NOTICE =
  "본 참고용 예상 원천징수(3.3%: 소득세 3.0% + 지방소득세 0.3%)는 정산 검토용 추정치이며, 세무 신고·법률 자문 효력이 없습니다. 실제 원천세 신고와 지급명세서 제출은 세무 대리인 또는 국세청 홈택스 기준을 따르십시오.";

const ROLE_LABELS_KO: Readonly<Record<AssistantSettlementRole, string>> = {
  background: "배경",
  lineart: "선화",
  colorist: "채색",
  letterer: "식자·효과음",
  "post-fx": "후보정",
};

const MODEL_LABELS_KO: Readonly<Record<EpisodeSettlementPolicy["model"], string>> = {
  "per-cut-rate": "컷당 단가 정산",
  "milestone-fixed": "회차 공정 정액 정산",
  "hybrid-revenue-share": "기본료 + 수익 지분 혼합 정산",
};

export interface AssistantWithholdingPreview {
  readonly assistantId: string;
  readonly assistantDisplayName: string;
  readonly grossPayoutKrw: number;
  readonly withholdingRateLabel: typeof FREELANCER_WITHHOLDING_LABEL;
  readonly estimatedIncomeTaxKrw: number;
  readonly estimatedLocalIncomeTaxKrw: number;
  readonly estimatedWithholdingTotalKrw: number;
  readonly estimatedNetPayoutKrw: number;
}

export interface SettlementReceiptTotals {
  readonly grossPayoutKrw: number;
  readonly estimatedIncomeTaxKrw: number;
  readonly estimatedLocalIncomeTaxKrw: number;
  readonly estimatedWithholdingTotalKrw: number;
  readonly estimatedNetPayoutKrw: number;
  readonly authorRetainedKrw: number;
  readonly roundingRemainderKrw: number;
}

export interface SettlementRightsClearanceSummary {
  readonly commercialClearancePassed: boolean;
  readonly totalAssetCount: number;
  readonly clearedAssetCount: number;
  readonly blockedAssetCount: number;
  readonly statusLabel: string;
}

export interface CanonicalSettlementReceiptDocument {
  readonly schemaVersion: "wave79-settlement-receipt/v1";
  readonly receiptId: string;
  readonly generatedAtIso: string;
  readonly ledgerId: string;
  readonly episodeId: string;
  readonly projectId: string;
  readonly settlementModel: EpisodeSettlementPolicy["model"];
  readonly settlementModelLabelKo: string;
  readonly merkleRootHex: string;
  readonly ledgerIntegrityVerified: boolean;
  readonly taxWithholdingLabel: typeof FREELANCER_WITHHOLDING_LABEL;
  readonly taxNonAdvisoryNotice: string;
  readonly rightsClearance: SettlementRightsClearanceSummary;
  readonly lineItems: readonly AssistantSettlementLineItem[];
  readonly withholdingPreviews: readonly AssistantWithholdingPreview[];
  readonly totals: SettlementReceiptTotals;
}

export interface ExportSettlementStatementOptions {
  readonly receiptId?: string;
  readonly generatedAtIso?: string;
  readonly studioSecret?: string;
}

export interface ExportedSettlementStatementBundle {
  readonly receiptId: string;
  readonly generatedAtIso: string;
  readonly merkleRootHex: string;
  readonly markdownSummary: string;
  readonly canonicalReceiptJson: string;
  readonly receiptSha256Hex: string;
  readonly receiptMacHex: string | null;
  readonly receiptDocument: CanonicalSettlementReceiptDocument;
  readonly withholdingPreviews: readonly AssistantWithholdingPreview[];
  readonly totals: SettlementReceiptTotals;
  readonly rightsClearanceSummary: SettlementRightsClearanceSummary;
}

export interface VerifyExportedReceiptResult {
  readonly valid: boolean;
  readonly reason: string | null;
  readonly computedSha256Hex: string;
}

function formatKrw(amount: number): string {
  return `${amount.toLocaleString("en-US")}원`;
}

function escapeMarkdownCell(text: string): string {
  // Markdown 테이블 셀 이스케이프: 백슬래시 우선 → 파이프 이스케이프 → 줄바꿈(LF/CRLF/단독 CR) 공백화
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r\n|\r|\n/g, " ");
}

/** 프리랜서 3.3%(소득세 3.0% + 지방소득세 0.3%) 참고용 원천징수 추정치를 계산한다. */
export function calculateFreelancerWithholdingPreview(
  line: AssistantSettlementLineItem,
): AssistantWithholdingPreview {
  const estimatedWithholdingTotalKrw = Math.floor(line.grossPayoutKrw * FREELANCER_WITHHOLDING_TOTAL_RATE);
  const estimatedIncomeTaxKrw = Math.floor((estimatedWithholdingTotalKrw * 10) / 11);
  const estimatedLocalIncomeTaxKrw = estimatedWithholdingTotalKrw - estimatedIncomeTaxKrw;
  const estimatedNetPayoutKrw = line.grossPayoutKrw - estimatedWithholdingTotalKrw;

  return {
    assistantId: line.assistantId,
    assistantDisplayName: line.assistantDisplayName,
    grossPayoutKrw: line.grossPayoutKrw,
    withholdingRateLabel: FREELANCER_WITHHOLDING_LABEL,
    estimatedIncomeTaxKrw,
    estimatedLocalIncomeTaxKrw,
    estimatedWithholdingTotalKrw,
    estimatedNetPayoutKrw,
  };
}

function renderRolesKo(roles: readonly AssistantSettlementRole[]): string {
  if (roles.length === 0) return "지분 참여";
  return roles.map((role) => ROLE_LABELS_KO[role]).join(" · ");
}

function buildMarkdownSummary(doc: CanonicalSettlementReceiptDocument): string {
  const lines: string[] = [
    `# 회차 어시스턴트 정산 명세서 (${doc.episodeId})`,
    "",
    `- **영수증 ID**: \`${doc.receiptId}\``,
    `- **프로젝트 / 원장**: \`${doc.projectId}\` / \`${doc.ledgerId}\``,
    `- **정산 모델**: ${doc.settlementModelLabelKo} (\`${doc.settlementModel}\`)`,
    `- **생성 시각**: ${doc.generatedAtIso}`,
    `- **원장 머클 루트(SHA-256)**: \`${doc.merkleRootHex}\``,
    `- **원장 무결성 검증**: ${doc.ledgerIntegrityVerified ? "통과" : "실패(지급 보류)"}`,
    `- **Rights BOM 상업 라이선스 게이트**: ${doc.rightsClearance.statusLabel} (검증 완료 ${doc.rightsClearance.clearedAssetCount}/${doc.rightsClearance.totalAssetCount}건)`,
    "",
    "## 어시스턴트별 지급 내역",
    "",
    `| 어시스턴트 | 담당 공정 | 승인 컷 | 작업 시간(분) | 기본·정액 | 가산금 | 수익 지분(보정) | 세전 총액 | ${FREELANCER_WITHHOLDING_LABEL} | 예상 실지급액 | Rights BOM |`,
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];

  const previewById = new Map<string, AssistantWithholdingPreview>();
  for (const preview of doc.withholdingPreviews) {
    previewById.set(preview.assistantId, preview);
  }

  for (const item of doc.lineItems) {
    const preview = previewById.get(item.assistantId);
    const shareCell =
      item.revenueSharePercent > 0 || item.revenueShareKrw > 0
        ? `${formatKrw(item.revenueShareKrw)} (${item.revenueSharePercent.toFixed(2)}%${item.roundingAdjustmentKrw > 0 ? `, +${item.roundingAdjustmentKrw}원` : ""})`
        : "-";
    const bomCell = item.rightsClearancePassed
      ? "통과"
      : `차단(${item.blockedAssetIds.length}건)`;

    lines.push(
      `| ${escapeMarkdownCell(item.assistantDisplayName)} (\`${item.assistantId}\`) | ${renderRolesKo(item.roles)} | ${item.approvedCutCount} | ${item.totalActiveWorkMinutes} | ${formatKrw(item.basePayoutKrw)} | ${formatKrw(item.complexityAndUrgentBonusKrw)} | ${shareCell} | ${formatKrw(item.grossPayoutKrw)} | ${formatKrw(preview?.estimatedWithholdingTotalKrw ?? 0)} | ${formatKrw(preview?.estimatedNetPayoutKrw ?? item.grossPayoutKrw)} | ${bomCell} |`,
    );
  }

  lines.push(
    `| **합계** | - | - | - | - | - | - | **${formatKrw(doc.totals.grossPayoutKrw)}** | **${formatKrw(doc.totals.estimatedWithholdingTotalKrw)}** | **${formatKrw(doc.totals.estimatedNetPayoutKrw)}** | ${doc.rightsClearance.commercialClearancePassed ? "전체 통과" : "보류 항목 있음"} |`,
  );

  if (doc.settlementModel === "hybrid-revenue-share") {
    lines.push(
      "",
      "## 수익 분배 정합성 요약",
      "",
      `- **메인 작가 보유 정산액**: ${formatKrw(doc.totals.authorRetainedKrw)}`,
      `- **원 단위 반올림 오차 보정(최대 잔여법)**: ${formatKrw(doc.totals.roundingRemainderKrw)}`,
    );
  }

  lines.push(
    "",
    "## 세무 참고 안내",
    "",
    `> ${doc.taxNonAdvisoryNotice}`,
  );

  return lines.join("\n");
}

/**
 * 계산된 회차 정산 명세서를 한국어 Markdown 표와 정규 JSON 영수증 묶음으로 내보낸다.
 */
export function exportSettlementStatementSummary(
  statement: EpisodeSettlementStatement,
  options?: ExportSettlementStatementOptions,
): ExportedSettlementStatementBundle {
  const generatedAtIso = options?.generatedAtIso ?? statement.calculatedAtIso;
  const receiptId =
    options?.receiptId?.trim() ||
    `rcpt-${sha256Hex(`wave79-receipt-id:v1:${statement.ledgerId}:${statement.episodeId}:${statement.merkleRootHex}:${generatedAtIso}`).slice(0, 16)}`;

  const withholdingPreviews = statement.lineItems.map(calculateFreelancerWithholdingPreview);

  let estimatedIncomeTaxKrw = 0;
  let estimatedLocalIncomeTaxKrw = 0;
  let estimatedWithholdingTotalKrw = 0;
  let estimatedNetPayoutKrw = 0;
  for (const preview of withholdingPreviews) {
    estimatedIncomeTaxKrw += preview.estimatedIncomeTaxKrw;
    estimatedLocalIncomeTaxKrw += preview.estimatedLocalIncomeTaxKrw;
    estimatedWithholdingTotalKrw += preview.estimatedWithholdingTotalKrw;
    estimatedNetPayoutKrw += preview.estimatedNetPayoutKrw;
  }

  const totals: SettlementReceiptTotals = {
    grossPayoutKrw: statement.totalAssistantGrossPayoutKrw,
    estimatedIncomeTaxKrw,
    estimatedLocalIncomeTaxKrw,
    estimatedWithholdingTotalKrw,
    estimatedNetPayoutKrw,
    authorRetainedKrw: statement.authorRetainedKrw,
    roundingRemainderKrw: statement.roundingRemainderKrw,
  };

  const blockedAssetCount = statement.rightsBomGate.blockers.length;
  const rightsClearanceSummary: SettlementRightsClearanceSummary = {
    commercialClearancePassed: statement.rightsBomGate.commercialClearancePassed,
    totalAssetCount: statement.rightsBomGate.totalAssetCount,
    clearedAssetCount: statement.rightsBomGate.clearedAssetCount,
    blockedAssetCount,
    statusLabel: statement.rightsBomGate.commercialClearancePassed
      ? "상업 출고·정산 승인 가능"
      : `라이선스 차단 ${blockedAssetCount}건 발견 — 정산 보류 권고`,
  };

  const receiptDocument: CanonicalSettlementReceiptDocument = {
    schemaVersion: "wave79-settlement-receipt/v1",
    receiptId,
    generatedAtIso,
    ledgerId: statement.ledgerId,
    episodeId: statement.episodeId,
    projectId: statement.projectId,
    settlementModel: statement.model,
    settlementModelLabelKo: MODEL_LABELS_KO[statement.model],
    merkleRootHex: statement.merkleRootHex,
    ledgerIntegrityVerified: statement.ledgerIntegrityVerified,
    taxWithholdingLabel: FREELANCER_WITHHOLDING_LABEL,
    taxNonAdvisoryNotice: TAX_NON_ADVISORY_NOTICE,
    rightsClearance: rightsClearanceSummary,
    lineItems: statement.lineItems,
    withholdingPreviews,
    totals,
  };

  const canonicalReceiptJson = canonicalSerialize(receiptDocument);
  const receiptSha256Hex = sha256Hex(canonicalReceiptJson);
  const receiptMacHex =
    options?.studioSecret !== undefined
      ? hmacSha256Hex(options.studioSecret, `wave79-receipt-mac:v1:${canonicalReceiptJson}`)
      : null;

  const markdownSummary = buildMarkdownSummary(receiptDocument);

  return {
    receiptId,
    generatedAtIso,
    merkleRootHex: statement.merkleRootHex,
    markdownSummary,
    canonicalReceiptJson,
    receiptSha256Hex,
    receiptMacHex,
    receiptDocument,
    withholdingPreviews,
    totals,
    rightsClearanceSummary,
  };
}

/** 내보낸 정규 JSON 정산 영수증의 SHA-256 다이제스트와 선택적 스튜디오 HMAC을 검증한다. */
export function verifyExportedSettlementReceipt(
  bundle: ExportedSettlementStatementBundle,
  studioSecret?: string,
): VerifyExportedReceiptResult {
  const computedSha256Hex = sha256Hex(bundle.canonicalReceiptJson);
  if (!constantTimeEqualHex(computedSha256Hex, bundle.receiptSha256Hex)) {
    return {
      valid: false,
      reason: "정규 JSON 정산 영수증의 SHA-256 다이제스트가 일치하지 않습니다.",
      computedSha256Hex,
    };
  }

  let reparsed: CanonicalSettlementReceiptDocument;
  try {
    reparsed = JSON.parse(bundle.canonicalReceiptJson) as CanonicalSettlementReceiptDocument;
  } catch {
    return {
      valid: false,
      reason: "정산 영수증 JSON 형식이 손상되었습니다.",
      computedSha256Hex,
    };
  }

  if (reparsed.merkleRootHex !== bundle.merkleRootHex || reparsed.receiptId !== bundle.receiptId) {
    return {
      valid: false,
      reason: "영수증 헤더(receiptId/merkleRootHex)가 본문 JSON과 일치하지 않습니다.",
      computedSha256Hex,
    };
  }

  if (studioSecret !== undefined) {
    const expectedMac = hmacSha256Hex(studioSecret, `wave79-receipt-mac:v1:${bundle.canonicalReceiptJson}`);
    if (bundle.receiptMacHex === null || !constantTimeEqualHex(expectedMac, bundle.receiptMacHex)) {
      return {
        valid: false,
        reason: "정산 영수증 스튜디오 HMAC 서명이 유효하지 않습니다.",
        computedSha256Hex,
      };
    }
  }

  return {
    valid: true,
    reason: null,
    computedSha256Hex,
  };
}
