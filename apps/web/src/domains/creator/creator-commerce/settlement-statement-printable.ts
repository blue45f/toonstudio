/**
 * 다중 통화(KRW | USD | JPY | EUR) 정산 명세서 결정론 생성기.
 *
 * `RoyaltySettlementLedger`로부터 세율·플랫폼 수수료·실지급액·통화별 합계·환율 스냅샷·
 * 인쇄용 요약 카드 및 평문 정산표를 100% 결정론적으로 생성하고 SHA-256 다이제스트로 봉인한다.
 */

import {
  canonicalJsonStringify,
  computeSha256Hex,
} from "../creator-trust/creator-trust-sha256";
import {
  CURRENCY_SPECS,
  SUPPORTED_SETTLEMENT_CURRENCIES,
  convertCurrencyMinor,
  formatCurrencyMinor,
  roundHalfUp,
  type CurrencySpec,
  type RevenueStreamKind,
  type RoyaltyRecipientEntry,
  type RoyaltySettlementLedger,
  type SettlementCurrency,
  type TaxWithholdingProfile,
} from "./settlement-currency-utils";

export const PRINTABLE_SETTLEMENT_STATEMENT_SCHEMA_VERSION =
  "toonstudio.settlement-statement-printable.v1" as const;

export interface PrintableSettlementStatementOptions {
  /** 실지급액 환산 참고 통화 목록(기본: KRW, USD, JPY, EUR 전체). */
  readonly referenceCurrencies?: readonly SettlementCurrency[];
  readonly issuerDisplayName?: string;
  readonly statementTitleKo?: string;
  /** 특정 수취인 1인의 개별 지급 명세서만 추출할 때 지정한다. */
  readonly recipientFilterId?: string;
}

export interface PrintableCurrencyEquivalent {
  readonly currency: SettlementCurrency;
  readonly labelKo: string;
  readonly amountMinor: number;
  readonly formatted: string;
  readonly fxRateApplied: number;
}

export interface PrintableSummaryMetricCard {
  readonly key:
    | "gross-revenue"
    | "platform-fee"
    | "distributable-pool"
    | "withholding-tax"
    | "net-payout";
  readonly labelKo: string;
  readonly amountMinor: number;
  readonly formatted: string;
  readonly rateLabelKo: string | null;
}

export interface PrintableStreamFeeRow {
  readonly streamId: string;
  readonly kind: RevenueStreamKind;
  readonly kindLabelKo: string;
  readonly label: string;
  readonly sourceCurrency: SettlementCurrency;
  readonly sourceGrossMinor: number;
  readonly sourceGrossFormatted: string;
  readonly fxRateApplied: number;
  readonly convertedGrossMinor: number;
  readonly convertedGrossFormatted: string;
  readonly platformFeeRateBps: number;
  readonly platformFeeRatePercentText: string;
  readonly platformFeeMinor: number;
  readonly platformFeeFormatted: string;
  readonly distributableMinor: number;
  readonly distributableFormatted: string;
}

export interface PrintableRecipientTaxPayoutRow {
  readonly recipientId: string;
  readonly recipientName: string;
  readonly primaryRoleLabel: string;
  readonly effectiveShareBps: number;
  readonly effectiveSharePercentText: string;
  readonly grossAllocationMinor: number;
  readonly grossAllocationFormatted: string;
  readonly taxProfile: TaxWithholdingProfile;
  readonly taxProfileLabelKo: string;
  readonly withholdingRateBps: number;
  readonly withholdingRatePercentText: string;
  readonly incomeTaxMinor: number;
  readonly incomeTaxFormatted: string;
  readonly localIncomeTaxMinor: number;
  readonly localIncomeTaxFormatted: string;
  readonly withholdingTaxMinor: number;
  readonly withholdingTaxFormatted: string;
  readonly netPayoutMinor: number;
  readonly netPayoutFormatted: string;
  readonly multiCurrencyNetEquivalents: readonly PrintableCurrencyEquivalent[];
}

export interface PrintableSourceCurrencyBucket {
  readonly currency: SettlementCurrency;
  readonly labelKo: string;
  readonly streamCount: number;
  readonly sourceGrossMinor: number;
  readonly sourceGrossFormatted: string;
  readonly convertedGrossMinor: number;
  readonly convertedGrossFormatted: string;
  readonly platformFeeMinor: number;
  readonly platformFeeFormatted: string;
  readonly distributableMinor: number;
  readonly distributableFormatted: string;
}

export interface PrintableFxSnapshotRow {
  readonly currency: SettlementCurrency;
  readonly labelKo: string;
  readonly krwPerMajor: number;
  readonly rateTextKo: string;
}

export interface PrintableSettlementTotals {
  readonly grossMinor: number;
  readonly grossFormatted: string;
  readonly platformFeeMinor: number;
  readonly platformFeeFormatted: string;
  readonly distributableMinor: number;
  readonly distributableFormatted: string;
  readonly withholdingTaxMinor: number;
  readonly withholdingTaxFormatted: string;
  readonly netPayoutMinor: number;
  readonly netPayoutFormatted: string;
}

export interface PrintableSettlementStatement {
  readonly schemaVersion: typeof PRINTABLE_SETTLEMENT_STATEMENT_SCHEMA_VERSION;
  readonly documentNumber: string;
  readonly documentTitleKo: string;
  readonly issuerDisplayName: string;
  readonly settlementId: string;
  readonly seriesId: string;
  readonly episodeId: string;
  readonly periodLabel: string;
  readonly generatedAtIso: string;
  readonly settlementCurrency: SettlementCurrency;
  readonly currencySpec: CurrencySpec;
  readonly recipientScope: "all-recipients" | "single-recipient";
  readonly scopedRecipientId: string | null;
  readonly weightedPlatformFeeRateBps: number;
  readonly weightedPlatformFeeRatePercentText: string;
  readonly effectiveWithholdingRateBps: number;
  readonly effectiveWithholdingRatePercentText: string;
  readonly summaryCards: readonly PrintableSummaryMetricCard[];
  readonly sourceCurrencyBreakdown: readonly PrintableSourceCurrencyBucket[];
  readonly streamRows: readonly PrintableStreamFeeRow[];
  readonly recipientRows: readonly PrintableRecipientTaxPayoutRow[];
  readonly fxSnapshotRows: readonly PrintableFxSnapshotRow[];
  readonly totalNetPayoutEquivalents: readonly PrintableCurrencyEquivalent[];
  readonly reconciliationBalanced: boolean;
  readonly reconciliationBadgeKo: string;
  readonly totals: PrintableSettlementTotals;
  readonly accountingNoticeKo: string;
  readonly plainTextPrintSummary: string;
  readonly ledgerFingerprint: string;
  readonly statementSha256: string;
}

const STREAM_KIND_LABELS_KO: Readonly<Record<RevenueStreamKind, string>> = Object.freeze({
  "serial-episode": "연재 회차 수익",
  "subscription-pool": "구독 수익 풀",
  "marketplace-sales": "마켓 에셋 판매",
});

const TAX_PROFILE_LABELS_KO: Readonly<Record<TaxWithholdingProfile, string>> = Object.freeze({
  "kr-freelancer-3.3": "프리랜서 사업소득 원천징수 (소득세 3.0% + 지방소득세 0.3%)",
  "kr-corporate-0": "법인 사업자 (원천징수 0% · 세금계산서 정산)",
  "non-resident-treaty": "비거주자 조세조약 원천징수",
});

function formatBpsPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function buildMultiCurrencyEquivalents(
  amountMinor: number,
  sourceCurrency: SettlementCurrency,
  referenceCurrencies: readonly SettlementCurrency[],
  fxTable: Readonly<Record<SettlementCurrency, number>>,
): readonly PrintableCurrencyEquivalent[] {
  return Object.freeze(
    referenceCurrencies.map((targetCurrency) => {
      const converted = convertCurrencyMinor(amountMinor, sourceCurrency, targetCurrency, fxTable);
      return Object.freeze({
        currency: targetCurrency,
        labelKo: CURRENCY_SPECS[targetCurrency].labelKo,
        amountMinor: converted.convertedMinor,
        formatted: formatCurrencyMinor(converted.convertedMinor, targetCurrency),
        fxRateApplied: converted.effectiveMajorRate,
      });
    }),
  );
}

function normalizeReferenceCurrencies(
  requested?: readonly SettlementCurrency[],
): readonly SettlementCurrency[] {
  if (!requested || requested.length === 0) {
    return SUPPORTED_SETTLEMENT_CURRENCIES;
  }
  const unique: SettlementCurrency[] = [];
  for (const currency of requested) {
    if (!SUPPORTED_SETTLEMENT_CURRENCIES.includes(currency)) {
      throw new RangeError(`지원하지 않는 정산 참고 통화입니다: ${String(currency)}`);
    }
    if (!unique.includes(currency)) unique.push(currency);
  }
  return Object.freeze(unique);
}

function buildPlainTextPrintSummary(params: {
  readonly documentNumber: string;
  readonly documentTitleKo: string;
  readonly issuerDisplayName: string;
  readonly ledger: RoyaltySettlementLedger;
  readonly totals: PrintableSettlementTotals;
  readonly weightedPlatformFeeRatePercentText: string;
  readonly effectiveWithholdingRatePercentText: string;
  readonly recipientRows: readonly PrintableRecipientTaxPayoutRow[];
  readonly fxSnapshotRows: readonly PrintableFxSnapshotRow[];
  readonly reconciliationBadgeKo: string;
}): string {
  const lines: string[] = [
    `=== ${params.documentTitleKo} ===`,
    `문서번호: ${params.documentNumber} | 발행: ${params.issuerDisplayName}`,
    `정산ID: ${params.ledger.settlementId} | 작품/회차: ${params.ledger.seriesId} / ${params.ledger.episodeId} | 정산기간: ${params.ledger.periodLabel}`,
    `정산통화: ${CURRENCY_SPECS[params.ledger.settlementCurrency].labelKo} | 발행일시: ${params.ledger.generatedAtIso} | 검산: ${params.reconciliationBadgeKo}`,
    "--- 정산 요약 ---",
    `총 매출: ${params.totals.grossFormatted}`,
    `플랫폼 수수료(${params.weightedPlatformFeeRatePercentText}): ${params.totals.platformFeeFormatted}`,
    `분배 가능액: ${params.totals.distributableFormatted}`,
    `원천징수 세액(실효 ${params.effectiveWithholdingRatePercentText}): ${params.totals.withholdingTaxFormatted}`,
    `총 실지급액: ${params.totals.netPayoutFormatted}`,
    "--- 수취인별 세율 · 실지급액 ---",
  ];

  for (const row of params.recipientRows) {
    lines.push(
      `${row.recipientName}(${row.primaryRoleLabel}) | 배분 ${row.grossAllocationFormatted} | 세율 ${row.withholdingRatePercentText} (${row.withholdingTaxFormatted}) | 실지급 ${row.netPayoutFormatted}`,
    );
  }

  lines.push("--- 적용 환율 스냅샷 ---");
  lines.push(params.fxSnapshotRows.map((row) => row.rateTextKo).join(" | "));
  return lines.join("\n");
}

/**
 * 다중 통화 정산 원장으로부터 인쇄·감사 제출용 정산 명세서(세율·수수료·실지급액·환율 표)를
 * 결정론적으로 생성한다.
 */
export function buildPrintableSettlementStatement(
  ledger: RoyaltySettlementLedger,
  options?: PrintableSettlementStatementOptions,
): PrintableSettlementStatement {
  const referenceCurrencies = normalizeReferenceCurrencies(options?.referenceCurrencies);
  const issuerDisplayName = options?.issuerDisplayName?.trim() || "ToonStudio 크리에이터 정산 센터";
  const documentTitleKo =
    options?.statementTitleKo?.trim() || "다중 통화 크리에이터 로열티 정산 명세서";

  const scopedRecipientId = options?.recipientFilterId?.trim() || null;
  let targetRecipients: readonly RoyaltyRecipientEntry[] = ledger.recipients;
  if (scopedRecipientId !== null) {
    const matched = ledger.recipients.filter((entry) => entry.recipientId === scopedRecipientId);
    if (matched.length === 0) {
      throw new RangeError(`정산 원장에 존재하지 않는 수취인 ID입니다: ${scopedRecipientId}`);
    }
    targetRecipients = matched;
  }

  const currency = ledger.settlementCurrency;
  const fx = ledger.fxSnapshotKrwPerMajor;

  const streamRows: readonly PrintableStreamFeeRow[] = Object.freeze(
    ledger.streams.map((stream) =>
      Object.freeze({
        streamId: stream.streamId,
        kind: stream.kind,
        kindLabelKo: STREAM_KIND_LABELS_KO[stream.kind],
        label: stream.label,
        sourceCurrency: stream.sourceCurrency,
        sourceGrossMinor: stream.sourceGrossMinor,
        sourceGrossFormatted: formatCurrencyMinor(stream.sourceGrossMinor, stream.sourceCurrency),
        fxRateApplied: stream.fxRateApplied,
        convertedGrossMinor: stream.convertedGrossMinor,
        convertedGrossFormatted: formatCurrencyMinor(stream.convertedGrossMinor, currency),
        platformFeeRateBps: stream.platformFeeRateBps,
        platformFeeRatePercentText: formatBpsPercent(stream.platformFeeRateBps),
        platformFeeMinor: stream.platformFeeMinor,
        platformFeeFormatted: formatCurrencyMinor(stream.platformFeeMinor, currency),
        distributableMinor: stream.distributableMinor,
        distributableFormatted: formatCurrencyMinor(stream.distributableMinor, currency),
      }),
    ),
  );

  const sourceCurrencyBreakdown: readonly PrintableSourceCurrencyBucket[] = Object.freeze(
    SUPPORTED_SETTLEMENT_CURRENCIES.flatMap((sourceCurrency) => {
      const matching = ledger.streams.filter((stream) => stream.sourceCurrency === sourceCurrency);
      if (matching.length === 0) return [];
      const sourceGrossMinor = matching.reduce((acc, s) => acc + s.sourceGrossMinor, 0);
      const convertedGrossMinor = matching.reduce((acc, s) => acc + s.convertedGrossMinor, 0);
      const platformFeeMinor = matching.reduce((acc, s) => acc + s.platformFeeMinor, 0);
      const distributableMinor = matching.reduce((acc, s) => acc + s.distributableMinor, 0);
      return [
        Object.freeze({
          currency: sourceCurrency,
          labelKo: CURRENCY_SPECS[sourceCurrency].labelKo,
          streamCount: matching.length,
          sourceGrossMinor,
          sourceGrossFormatted: formatCurrencyMinor(sourceGrossMinor, sourceCurrency),
          convertedGrossMinor,
          convertedGrossFormatted: formatCurrencyMinor(convertedGrossMinor, currency),
          platformFeeMinor,
          platformFeeFormatted: formatCurrencyMinor(platformFeeMinor, currency),
          distributableMinor,
          distributableFormatted: formatCurrencyMinor(distributableMinor, currency),
        }),
      ];
    }),
  );

  const recipientRows: readonly PrintableRecipientTaxPayoutRow[] = Object.freeze(
    targetRecipients.map((recipient) =>
      Object.freeze({
        recipientId: recipient.recipientId,
        recipientName: recipient.recipientName,
        primaryRoleLabel: recipient.primaryRoleLabel,
        effectiveShareBps: recipient.effectiveShareBps,
        effectiveSharePercentText: formatBpsPercent(recipient.effectiveShareBps),
        grossAllocationMinor: recipient.grossAllocationMinor,
        grossAllocationFormatted: formatCurrencyMinor(recipient.grossAllocationMinor, currency),
        taxProfile: recipient.taxProfile,
        taxProfileLabelKo: TAX_PROFILE_LABELS_KO[recipient.taxProfile],
        withholdingRateBps: recipient.withholdingRateBps,
        withholdingRatePercentText: formatBpsPercent(recipient.withholdingRateBps),
        incomeTaxMinor: recipient.incomeTaxMinor,
        incomeTaxFormatted: formatCurrencyMinor(recipient.incomeTaxMinor, currency),
        localIncomeTaxMinor: recipient.localIncomeTaxMinor,
        localIncomeTaxFormatted: formatCurrencyMinor(recipient.localIncomeTaxMinor, currency),
        withholdingTaxMinor: recipient.withholdingTaxMinor,
        withholdingTaxFormatted: formatCurrencyMinor(recipient.withholdingTaxMinor, currency),
        netPayoutMinor: recipient.netPayoutMinor,
        netPayoutFormatted: formatCurrencyMinor(recipient.netPayoutMinor, currency),
        multiCurrencyNetEquivalents: buildMultiCurrencyEquivalents(
          recipient.netPayoutMinor,
          currency,
          referenceCurrencies,
          fx,
        ),
      }),
    ),
  );

  const grossMinor = ledger.reconciliation.totalGrossMinor;
  const platformFeeMinor = ledger.reconciliation.totalPlatformFeeMinor;
  const distributableMinor =
    scopedRecipientId === null
      ? ledger.reconciliation.totalDistributableMinor
      : targetRecipients.reduce((acc, r) => acc + r.grossAllocationMinor, 0);
  const withholdingTaxMinor =
    scopedRecipientId === null
      ? ledger.reconciliation.totalWithholdingTaxMinor
      : targetRecipients.reduce((acc, r) => acc + r.withholdingTaxMinor, 0);
  const netPayoutMinor =
    scopedRecipientId === null
      ? ledger.reconciliation.totalNetPayoutMinor
      : targetRecipients.reduce((acc, r) => acc + r.netPayoutMinor, 0);

  const weightedPlatformFeeRateBps =
    grossMinor > 0 ? roundHalfUp((platformFeeMinor * 10_000) / grossMinor) : 0;
  const effectiveWithholdingRateBps =
    distributableMinor > 0 ? roundHalfUp((withholdingTaxMinor * 10_000) / distributableMinor) : 0;

  const weightedPlatformFeeRatePercentText = formatBpsPercent(weightedPlatformFeeRateBps);
  const effectiveWithholdingRatePercentText = formatBpsPercent(effectiveWithholdingRateBps);

  const totals: PrintableSettlementTotals = Object.freeze({
    grossMinor,
    grossFormatted: formatCurrencyMinor(grossMinor, currency),
    platformFeeMinor,
    platformFeeFormatted: formatCurrencyMinor(platformFeeMinor, currency),
    distributableMinor,
    distributableFormatted: formatCurrencyMinor(distributableMinor, currency),
    withholdingTaxMinor,
    withholdingTaxFormatted: formatCurrencyMinor(withholdingTaxMinor, currency),
    netPayoutMinor,
    netPayoutFormatted: formatCurrencyMinor(netPayoutMinor, currency),
  });

  const summaryCards: readonly PrintableSummaryMetricCard[] = Object.freeze([
    Object.freeze({
      key: "gross-revenue" as const,
      labelKo: "총 매출(환산)",
      amountMinor: totals.grossMinor,
      formatted: totals.grossFormatted,
      rateLabelKo: null,
    }),
    Object.freeze({
      key: "platform-fee" as const,
      labelKo: "플랫폼 수수료",
      amountMinor: totals.platformFeeMinor,
      formatted: totals.platformFeeFormatted,
      rateLabelKo: `가중 평균 ${weightedPlatformFeeRatePercentText}`,
    }),
    Object.freeze({
      key: "distributable-pool" as const,
      labelKo: scopedRecipientId === null ? "총 분배 가능액" : "수취인 배분액(세전)",
      amountMinor: totals.distributableMinor,
      formatted: totals.distributableFormatted,
      rateLabelKo: null,
    }),
    Object.freeze({
      key: "withholding-tax" as const,
      labelKo: "원천징수 세액",
      amountMinor: totals.withholdingTaxMinor,
      formatted: totals.withholdingTaxFormatted,
      rateLabelKo: `실효 세율 ${effectiveWithholdingRatePercentText}`,
    }),
    Object.freeze({
      key: "net-payout" as const,
      labelKo: "실지급액(세후)",
      amountMinor: totals.netPayoutMinor,
      formatted: totals.netPayoutFormatted,
      rateLabelKo: null,
    }),
  ]);

  const fxSnapshotRows: readonly PrintableFxSnapshotRow[] = Object.freeze(
    SUPPORTED_SETTLEMENT_CURRENCIES.map((code) => {
      const krwPerMajor = fx[code];
      return Object.freeze({
        currency: code,
        labelKo: CURRENCY_SPECS[code].labelKo,
        krwPerMajor,
        rateTextKo:
          code === "KRW"
            ? "1 KRW = ₩1 (기준)"
            : `1 ${code} = ₩${krwPerMajor.toLocaleString("en-US")}`,
      });
    }),
  );

  const totalNetPayoutEquivalents = buildMultiCurrencyEquivalents(
    netPayoutMinor,
    currency,
    referenceCurrencies,
    fx,
  );

  const reconciliationBadgeKo = ledger.reconciliation.balanced
    ? "0오차 정산 검산 통과"
    : "정산 불일치 점검 필요";
  const documentNumber =
    scopedRecipientId === null
      ? `STMT-${ledger.settlementId}-${currency}`
      : `STMT-${ledger.settlementId}-${currency}-${scopedRecipientId}`;
  const accountingNoticeKo =
    "본 명세서는 정수 최소 화폐 단위와 최대 잉여법(Hamilton)으로 산출된 정산 참고 자료입니다. 실제 세무 신고·지급명세서 제출 시 관할 세무서 및 지급일 고시 환율 기준을 최종 확인하세요.";

  const plainTextPrintSummary = buildPlainTextPrintSummary({
    documentNumber,
    documentTitleKo,
    issuerDisplayName,
    ledger,
    totals,
    weightedPlatformFeeRatePercentText,
    effectiveWithholdingRatePercentText,
    recipientRows,
    fxSnapshotRows,
    reconciliationBadgeKo,
  });

  const body = {
    schemaVersion: PRINTABLE_SETTLEMENT_STATEMENT_SCHEMA_VERSION,
    documentNumber,
    documentTitleKo,
    issuerDisplayName,
    settlementId: ledger.settlementId,
    seriesId: ledger.seriesId,
    episodeId: ledger.episodeId,
    periodLabel: ledger.periodLabel,
    generatedAtIso: ledger.generatedAtIso,
    settlementCurrency: currency,
    currencySpec: CURRENCY_SPECS[currency],
    recipientScope:
      scopedRecipientId === null ? ("all-recipients" as const) : ("single-recipient" as const),
    scopedRecipientId,
    weightedPlatformFeeRateBps,
    weightedPlatformFeeRatePercentText,
    effectiveWithholdingRateBps,
    effectiveWithholdingRatePercentText,
    summaryCards,
    sourceCurrencyBreakdown,
    streamRows,
    recipientRows,
    fxSnapshotRows,
    totalNetPayoutEquivalents,
    reconciliationBalanced: ledger.reconciliation.balanced,
    reconciliationBadgeKo,
    totals,
    accountingNoticeKo,
    plainTextPrintSummary,
    ledgerFingerprint: ledger.ledgerFingerprint,
  };

  return Object.freeze({
    ...body,
    statementSha256: computeSha256Hex(canonicalJsonStringify(body)),
  });
}
