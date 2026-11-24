/**
 * C2PA 원본 권리·자동 정산 원장 + 적응형 동적 수위 AI 워터마킹 출고 게이트 스튜디오 패널.
 *
 * - Props 없이 단독 렌더 가능(모든 props optional).
 * - Calm Atelier 시맨틱 토큰 전용(원시 색상 0건 · 브라우저 스토리지 비의존 · 명시적 transition 속성만 사용).
 */

import { AlertTriangle, CheckCircle2, Copy, Download, FileCheck2, Link2, RotateCcw, ShieldAlert, ShieldCheck, Sliders } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_EXPORT_RIGHTS_BOM_ITEMS, INVISIBLE_PSNR_FLOOR_DB, createDemoWebtoonWatermarkCanvas,
  embedAdaptiveAiWatermark, evaluateWatermarkAttackScenario, evaluateWatermarkExportPreflightGate,
  extractAdaptiveAiWatermark, type ExportRightsBomItem, type TextureRegionClass,
  type WatermarkAttackKind, type WatermarkExportPreflightReport,
} from "./adaptive-ai-watermark-gate";
import {
  CONTRIBUTOR_ROLE_CATALOG, DEFAULT_DERIVATIVE_ROYALTY_RULES, DEFAULT_LEDGER_TIMESTAMP_ISO, TOTAL_SHARE_BPS,
  appendLedgerBlock, calculateDerivativeRoyaltySettlement, calculateKoreanTaxSettlement,
  createDefaultRightsSettlementFixture, createRightsSettlementLedger, simulateLedgerBlockTamper,
  validateContributorSplits, verifyRightsSettlementLedger,
  type BusinessVatMode, type ContributorEquityEntry, type DerivativeWorkCategory,
} from "./c2pa-rights-settlement-ledger";

export type RightsWatermarkGateTab = "settlement" | "chain" | "watermark";

export interface StudioRightsWatermarkGatePanelProps {
  readonly initialTab?: RightsWatermarkGateTab;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly initialWorkId?: string;
  readonly initialEpisodeTitle?: string;
  readonly initialAuthorId?: string;
  readonly initialContributors?: readonly ContributorEquityEntry[];
  readonly initialPrimaryGrossKrw?: number;
  readonly initialDerivativeGrossKrw?: number;
  readonly initialWatermarkStrength?: number;
  readonly initialRightsBomItems?: readonly ExportRightsBomItem[];
}

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_DANGER = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-bad bg-bad-soft px-3 py-2 text-xs font-semibold text-bad transition-colors motion-reduce:transition-none hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const INPUT_CLS = `min-h-11 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`;

const ATTACK_SCENARIOS: readonly { readonly id: WatermarkAttackKind; readonly ko: string; readonly en: string }[] = [
  { id: "none-clean", ko: "원본 무손실", en: "Clean Original" },
  { id: "crop-20pct", ko: "크롭 20%", en: "20% Crop" },
  { id: "recompress-jpeg-q70", ko: "JPEG Q70 재압축", en: "JPEG Q70" },
  { id: "ai-inpaint-tamper", ko: "AI 국소 변조(32%)", en: "AI Inpaint (32%)" },
];

const REGION_LABELS: Readonly<Record<TextureRegionClass, { readonly ko: string; readonly en: string }>> = {
  "flat-skin-cel": { ko: "단색 피부 · 셀 채색", en: "Flat Skin & Cel" },
  "mid-structure": { ko: "중간 선화 · 의상", en: "Mid Structure" },
  "high-freq-hair-bg": { ko: "고주파 머리카락 · 배경", en: "High-Freq Hair & BG" },
};

const NON_COMMERCIAL_DEMO_ASSET: ExportRightsBomItem = {
  assetId: "asset-demo-editorial-only",
  assetName: "테스트 비상업 폰트 (Editorial Only)",
  kind: "font",
  licenseName: "CC-BY-NC 4.0 (비상업 전용)",
  commercialUseAllowed: false,
  aiTrainingAllowed: false,
  attributionRequired: true,
  attributionIncluded: false,
};

function formatKrw(value: number, isKo: boolean): string {
  return `${Math.round(value).toLocaleString(isKo ? "ko-KR" : "en-US")}${isKo ? "원" : " KRW"}`;
}

function downloadJsonFile(filename: string, payload: unknown): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/ld+json" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  URL.revokeObjectURL(url);
}

export function StudioRightsWatermarkGatePanel({
  initialTab = "settlement", locale, className, initialWorkId, initialEpisodeTitle,
  initialAuthorId = "han-jiwoo", initialContributors, initialPrimaryGrossKrw,
  initialDerivativeGrossKrw, initialWatermarkStrength = 3, initialRightsBomItems,
}: StudioRightsWatermarkGatePanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const defaultFixture = useMemo(() => createDefaultRightsSettlementFixture(), []);
  const workId = initialWorkId?.trim() || defaultFixture.workId;
  const episodeTitle = initialEpisodeTitle?.trim() || defaultFixture.episodeTitle;

  const [activeTab, setActiveTab] = useState<RightsWatermarkGateTab>(initialTab);
  const [statusNotice, setStatusNotice] = useState("");
  const [contributors, setContributors] = useState<readonly ContributorEquityEntry[]>(() => initialContributors ?? defaultFixture.contributors);
  const [primaryGrossKrw, setPrimaryGrossKrw] = useState(initialPrimaryGrossKrw ?? defaultFixture.defaultPrimaryGrossKrw);
  const [vatMode, setVatMode] = useState<BusinessVatMode>("exclusive-add-10");
  const [derivativeCategory, setDerivativeCategory] = useState<DerivativeWorkCategory>("merchandise-goods");
  const [derivativeGrossKrw, setDerivativeGrossKrw] = useState(initialDerivativeGrossKrw ?? defaultFixture.defaultDerivativeGrossKrw);
  const [tamperSimulated, setTamperSimulated] = useState(false);

  const [authorId, setAuthorId] = useState(initialAuthorId);
  const [watermarkWorkId, setWatermarkWorkId] = useState(workId);
  const [watermarkStrength, setWatermarkStrength] = useState(initialWatermarkStrength);
  const [attackKind, setAttackKind] = useState<WatermarkAttackKind>("none-clean");
  const [exportChannel, setExportChannel] = useState<WatermarkExportPreflightReport["targetChannel"]>("commercial-webtoon");
  const [injectRightsBomConflict, setInjectRightsBomConflict] = useState(false);

  const splitValidation = useMemo(() => validateContributorSplits(contributors), [contributors]);
  const activeDerivativeRule = useMemo(
    () => DEFAULT_DERIVATIVE_ROYALTY_RULES.find((r) => r.category === derivativeCategory) ?? DEFAULT_DERIVATIVE_ROYALTY_RULES[0],
    [derivativeCategory],
  );
  const primarySettlement = useMemo(() => (
    splitValidation.valid
      ? calculateKoreanTaxSettlement({ workId, periodLabel: "2026-11", grossRevenueKrw: primaryGrossKrw, contributors, vatMode })
      : null
  ), [contributors, primaryGrossKrw, splitValidation.valid, vatMode, workId]);

  const derivativeSettlement = useMemo(() => (
    splitValidation.valid && activeDerivativeRule
      ? calculateDerivativeRoyaltySettlement({ workId, periodLabel: "2026-11", derivativeGrossRevenueKrw: derivativeGrossKrw, rule: activeDerivativeRule, contributors, vatMode })
      : null
  ), [activeDerivativeRule, contributors, derivativeGrossKrw, splitValidation.valid, vatMode, workId]);

  const demoCanvas = useMemo(() => createDemoWebtoonWatermarkCanvas(128, 128), []);
  const watermarkEmbed = useMemo(() => embedAdaptiveAiWatermark(demoCanvas, 128, 128, {
    authorId, workId: watermarkWorkId, timestampIso: DEFAULT_LEDGER_TIMESTAMP_ISO, strength: watermarkStrength,
  }), [authorId, demoCanvas, watermarkStrength, watermarkWorkId]);
  const cleanExtraction = useMemo(() => extractAdaptiveAiWatermark(watermarkEmbed.pixels, 128, 128, {
    expectedAuthorId: watermarkEmbed.authorId, expectedWorkId: watermarkEmbed.workId, expectedTimestampIso: watermarkEmbed.timestampIso,
  }), [watermarkEmbed]);
  const attackReport = useMemo(() => evaluateWatermarkAttackScenario(watermarkEmbed, attackKind), [attackKind, watermarkEmbed]);

  const effectiveLedger = useMemo(() => {
    let base = createRightsSettlementLedger({
      workId, episodeTitle, contributors: splitValidation.valid ? contributors : defaultFixture.contributors, createdAtIso: DEFAULT_LEDGER_TIMESTAMP_ISO,
    });
    if (primarySettlement) {
      base = appendLedgerBlock(base, {
        eventType: "settlement-payout", timestampIso: "2026-11-24T01:00:00Z",
        payload: { statementId: primarySettlement.statementId, grossRevenueKrw: primarySettlement.grossRevenueKrw, totalNetPayoutKrw: primarySettlement.totalNetPayoutKrw, statementSha256: primarySettlement.statementSha256 },
      });
    }
    if (derivativeSettlement) {
      base = appendLedgerBlock(base, {
        eventType: "derivative-royalty", timestampIso: "2026-11-24T02:00:00Z",
        payload: { category: derivativeSettlement.rule.category, upstreamOriginalPoolKrw: derivativeSettlement.upstreamOriginalPoolKrw, statementSha256: derivativeSettlement.upstreamTeamStatement.statementSha256 },
      });
    }
    base = appendLedgerBlock(base, {
      eventType: "watermark-seal", timestampIso: "2026-11-24T03:00:00Z",
      payload: { authorId: watermarkEmbed.authorId, workId: watermarkEmbed.workId, overallPsnrDb: watermarkEmbed.overallPsnrDb, flatRegionPsnrDb: watermarkEmbed.flatRegionPsnrDb, payloadDigestSha256: watermarkEmbed.payloadDigestSha256 },
    });
    return tamperSimulated ? simulateLedgerBlockTamper(base, Math.min(1, base.blocks.length - 1)) : base;
  }, [contributors, defaultFixture.contributors, derivativeSettlement, episodeTitle, primarySettlement, splitValidation.valid, tamperSimulated, watermarkEmbed, workId]);

  const ledgerVerification = useMemo(() => verifyRightsSettlementLedger(effectiveLedger), [effectiveLedger]);
  const activeBomItems = useMemo<readonly ExportRightsBomItem[]>(() => {
    const base = initialRightsBomItems ?? DEFAULT_EXPORT_RIGHTS_BOM_ITEMS;
    return injectRightsBomConflict ? [...base, NON_COMMERCIAL_DEMO_ASSET] : base;
  }, [initialRightsBomItems, injectRightsBomConflict]);

  const preflightReport = useMemo(() => evaluateWatermarkExportPreflightGate({
    targetChannel: exportChannel, nowIso: DEFAULT_LEDGER_TIMESTAMP_ISO, rightsBomItems: activeBomItems,
    watermarkEmbed, watermarkExtract: cleanExtraction, ledgerVerification,
  }), [activeBomItems, cleanExtraction, exportChannel, ledgerVerification, watermarkEmbed]);

  const handleUpdateShareBps = (contributorId: string, rawValue: string): void => {
    const parsed = Number.parseInt(rawValue, 10);
    const nextBps = Number.isFinite(parsed) ? Math.max(0, Math.min(TOTAL_SHARE_BPS, parsed)) : 0;
    setContributors((prev) => prev.map((item) => (item.contributorId === contributorId ? { ...item, shareBps: nextBps } : item)));
  };

  const handleToggleTax = (contributorId: string): void => {
    setContributors((prev) => prev.map((item) => (
      item.contributorId === contributorId
        ? { ...item, taxClassification: item.taxClassification === "freelancer-withholding-3.3" ? "business-vat-10" : "freelancer-withholding-3.3" }
        : item
    )));
  };

  const handleCopyJsonLd = (): void => {
    const text = JSON.stringify({ manifest: effectiveLedger.manifest, smartContractJsonLd: effectiveLedger.smartContractJsonLd }, null, 2);
    const doneMsg = pick("C2PA v2.1 · JSON-LD 스키마를 클립보드에 복사했습니다.", "Copied C2PA v2.1 & JSON-LD schema.");
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(() => setStatusNotice(doneMsg), () => setStatusNotice(doneMsg));
      return;
    }
    setStatusNotice(doneMsg);
  };

  const handleDownloadJsonLd = (): void => {
    downloadJsonFile(`${workId}-c2pa-settlement-schema.jsonld`, {
      manifest: effectiveLedger.manifest, smartContractJsonLd: effectiveLedger.smartContractJsonLd, verification: ledgerVerification,
    });
    setStatusNotice(pick("C2PA v2.1 · 스마트 계약 호환 JSON-LD 파일을 저장했습니다.", "Downloaded C2PA v2.1 & JSON-LD schema file."));
  };

  const tabs: readonly { readonly id: RightsWatermarkGateTab; readonly label: string }[] = [
    { id: "settlement", label: pick("권리·정산 원장 (10,000 bps)", "Rights & 10,000 bps Ledger") },
    { id: "chain", label: pick("해시 체인 무결성 감사", "Hash Chain Audit") },
    { id: "watermark", label: pick("적응형 AI 워터마크 · 출고 게이트", "Adaptive Watermark & Gate") },
  ];

  const gateToneCls = preflightReport.status === "PASS" ? "bg-good-soft text-good" : preflightReport.status === "WARN" ? "bg-warning-soft text-warn" : "bg-bad-soft text-bad";
  const verdictToneCls = attackReport.extraction.verdict === "VERIFIED_INTACT" ? "bg-good-soft text-good" : attackReport.extraction.verdict === "TAMPER_DETECTED" ? "bg-bad-soft text-bad" : "bg-warning-soft text-warn";

  return (
    <section
      className={`flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5 text-fg [word-break:keep-all] ${className ?? ""}`}
      aria-label={pick("C2PA 권리·정산 원장 및 적응형 AI 워터마크 출고 게이트", "C2PA Rights Settlement & Adaptive Watermark Gate")}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-fg">{pick("C2PA 원본 권리·자동 정산 원장 & AI 워터마크 출고 게이트", "C2PA Rights Ledger & Adaptive AI Watermark Gate")}</h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "로컬 SHA-256 해시 체인 원장 · 10,000 bps 직무 지분 정산(3.3% / 10%) · 엔트로피 적응형 DCT 워터마크를 출고 전 검증합니다.",
              "Verify local SHA-256 hash-chain ledger, 10,000 bps role splits (3.3% / 10% tax), and entropy-adaptive DCT watermarking before export.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-info-soft px-3 py-1 text-xs font-semibold text-cool">
            {pick("로컬 검증 원장 · 온체인 미실행(스키마 호환)", "Local Verified Ledger · Off-Chain Schema")}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${gateToneCls}`}>
            {pick(`출고 게이트: ${preflightReport.status}`, `Export Gate: ${preflightReport.status}`)}
          </span>
        </div>
      </header>

      <div role="tablist" aria-label={pick("권리·워터마크 게이트 탭", "Rights and watermark gate tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? BTN_PRIMARY : BTN_OUTLINE}>
            {tab.label}
          </button>
        ))}
      </div>

      {statusNotice ? (
        <div role="status" aria-live="polite" className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs font-semibold text-accent">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{statusNotice}</span>
        </div>
      ) : null}

      {activeTab === "settlement" ? (
        <div id={`${uid}-panel-settlement`} role="tabpanel" aria-labelledby={`${uid}-tab-settlement`} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${splitValidation.valid ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
                {pick(`지분 합계 ${splitValidation.totalBps.toLocaleString("ko-KR")} / 10,000 bps`, `Total Equity ${splitValidation.totalBps.toLocaleString("en-US")} / 10,000 bps`)}
              </span>
              {!splitValidation.valid ? (
                <span className="text-xs font-semibold text-bad">
                  {pick(splitValidation.issues[0]?.messageKo ?? "지분 합계가 10,000 bps와 다릅니다.", splitValidation.issues[0]?.messageEn ?? "Total equity must equal 10,000 bps.")}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setContributors(initialContributors ?? defaultFixture.contributors); setStatusNotice(pick("6개 직무 지분을 합계 10,000 bps 기준으로 복원했습니다.", "Restored 6-role splits to exact 10,000 bps.")); }} className={BTN_OUTLINE}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{pick("10,000 bps 기준 복원", "Restore 10,000 bps")}
              </button>
              <button type="button" onClick={handleCopyJsonLd} className={BTN_OUTLINE}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />{pick("JSON-LD 복사", "Copy JSON-LD")}
              </button>
              <button type="button" onClick={handleDownloadJsonLd} className={BTN_PRIMARY}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />{pick("C2PA · JSON-LD 저장", "Save C2PA JSON-LD")}
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-line bg-card p-3.5">
              <label htmlFor={`${uid}-primary-gross`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("회차 총 정산 매출 (KRW)", "Episode Gross Revenue (KRW)")}</label>
              <input id={`${uid}-primary-gross`} type="number" min={0} step={100000} value={primaryGrossKrw} onChange={(e) => setPrimaryGrossKrw(Math.max(0, Number.parseInt(e.target.value || "0", 10) || 0))} className={`${INPUT_CLS} tabular-nums`} />
            </div>
            <div className="rounded-xl border border-line bg-card p-3.5">
              <label htmlFor={`${uid}-vat-mode`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("사업자 부가세 10% 산정 방식", "Business VAT 10% Mode")}</label>
              <select id={`${uid}-vat-mode`} value={vatMode} onChange={(e) => setVatMode(e.target.value as BusinessVatMode)} className={INPUT_CLS}>
                <option value="exclusive-add-10">{pick("공급가액 + 부가세 10% 별도 가산", "Supply + 10% VAT Added")}</option>
                <option value="inclusive-extract-10">{pick("부가세 10% 포함 계약 역산", "10% VAT Inclusive Extract")}</option>
              </select>
            </div>
            <div className="rounded-xl border border-line bg-card p-3.5">
              <label htmlFor={`${uid}-deriv-cat`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("2차 창작 로열티 카테고리", "Derivative Royalty Category")}</label>
              <select id={`${uid}-deriv-cat`} value={derivativeCategory} onChange={(e) => setDerivativeCategory(e.target.value as DerivativeWorkCategory)} className={INPUT_CLS}>
                {DEFAULT_DERIVATIVE_ROYALTY_RULES.map((rule) => (
                  <option key={rule.category} value={rule.category}>{pick(rule.labelKo, rule.labelEn)} ({(rule.upstreamOriginalRoyaltyBps / 100).toFixed(1)}%)</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line bg-card">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-raised text-fg-2">
                  <th className="px-3 py-2.5 font-semibold">{pick("직무 · 기여자", "Role & Contributor")}</th>
                  <th className="px-3 py-2.5 font-semibold">{pick("지분 (bps)", "Equity (bps)")}</th>
                  <th className="px-3 py-2.5 font-semibold">{pick("세무 유형", "Tax Class")}</th>
                  <th className="px-3 py-2.5 font-semibold">{pick("배분액", "Gross")}</th>
                  <th className="px-3 py-2.5 font-semibold">{pick("원천징수 3.3% / 부가세 10%", "3.3% WHT / 10% VAT")}</th>
                  <th className="px-3 py-2.5 font-semibold">{pick("실지급액", "Net Payout")}</th>
                </tr>
              </thead>
              <tbody>
                {contributors.map((entry) => {
                  const line = primarySettlement?.lines.find((l) => l.contributorId === entry.contributorId);
                  const roleMeta = CONTRIBUTOR_ROLE_CATALOG[entry.role];
                  const isBiz = entry.taxClassification === "business-vat-10";
                  return (
                    <tr key={entry.contributorId} className="border-b border-line last:border-b-0">
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-fg">{entry.displayName}</div>
                        <div className="text-[11px] text-fg-3">{pick(roleMeta.labelKo, roleMeta.labelEn)}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <label htmlFor={`${uid}-bps-${entry.contributorId}`} className="sr-only">{`${entry.displayName} bps`}</label>
                        <input id={`${uid}-bps-${entry.contributorId}`} type="number" min={0} max={TOTAL_SHARE_BPS} step={50} value={entry.shareBps} onChange={(e) => handleUpdateShareBps(entry.contributorId, e.target.value)} className={`min-h-11 w-24 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs text-fg tabular-nums ${FOCUS_RING}`} />
                      </td>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => handleToggleTax(entry.contributorId)} className={BTN_OUTLINE}>
                          {isBiz ? pick("사업자 10%", "Business 10%") : pick("프리랜서 3.3%", "Freelancer 3.3%")}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-fg">{line ? formatKrw(line.allocatedGrossKrw, isKo) : "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums text-fg-2">
                        {line ? (isBiz ? `${line.taxDirection === "added-vat" ? "+" : ""}${formatKrw(line.vatKrw, isKo)}` : `-${formatKrw(line.withholdingTaxTotalKrw, isKo)}`) : "—"}
                      </td>
                      <td className="px-3 py-2.5 font-semibold tabular-nums text-fg">{line ? formatKrw(line.netPayoutKrw, isKo) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {derivativeSettlement ? (
            <div className="grid gap-3 rounded-xl border border-line bg-card p-4 md:grid-cols-4">
              <div>
                <label htmlFor={`${uid}-deriv-gross`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("2차 창작 총 매출 (KRW)", "Derivative Gross (KRW)")}</label>
                <input id={`${uid}-deriv-gross`} type="number" min={0} step={1000000} value={derivativeGrossKrw} onChange={(e) => setDerivativeGrossKrw(Math.max(0, Number.parseInt(e.target.value || "0", 10) || 0))} className={`${INPUT_CLS} tabular-nums`} />
              </div>
              <div className="rounded-lg bg-raised p-3">
                <div className="text-[11px] text-fg-3">{pick("원본 팀 로열티 풀", "Original Team Pool")}</div>
                <div className="mt-1 text-sm font-bold text-accent tabular-nums">{formatKrw(derivativeSettlement.upstreamOriginalPoolKrw, isKo)}</div>
                <div className="text-[11px] text-fg-2 tabular-nums">{(derivativeSettlement.rule.upstreamOriginalRoyaltyBps / 100).toFixed(2)}%</div>
              </div>
              <div className="rounded-lg bg-raised p-3">
                <div className="text-[11px] text-fg-3">{pick("2차 제작자 배분 풀", "Derivative Creator Pool")}</div>
                <div className="mt-1 text-sm font-bold text-fg tabular-nums">{formatKrw(derivativeSettlement.derivativeCreatorPoolKrw, isKo)}</div>
                <div className="text-[11px] text-fg-2 tabular-nums">{(derivativeSettlement.rule.derivativeCreatorShareBps / 100).toFixed(2)}%</div>
              </div>
              <div className="rounded-lg bg-raised p-3">
                <div className="text-[11px] text-fg-3">{pick("원본 팀 세후 실지급 합계", "Team Net Payout Total")}</div>
                <div className="mt-1 text-sm font-bold text-good tabular-nums">{formatKrw(derivativeSettlement.upstreamTeamStatement.totalNetPayoutKrw, isKo)}</div>
                <div className="text-[11px] text-fg-2">{pick("AI 2차 생성 금지 적용", "AI Derivative Disallowed")}</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "chain" ? (
        <div id={`${uid}-panel-chain`} role="tabpanel" aria-labelledby={`${uid}-tab-chain`} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card p-4">
            <div className="flex items-center gap-2.5">
              {ledgerVerification.valid ? <ShieldCheck className="h-5 w-5 text-good" aria-hidden="true" /> : <ShieldAlert className="h-5 w-5 text-bad" aria-hidden="true" />}
              <div>
                <div className="text-sm font-bold text-fg">
                  {ledgerVerification.valid
                    ? pick(`SHA-256 해시 체인 무결성 통과 (${ledgerVerification.checkedBlocks}개 블록)`, `SHA-256 Hash Chain Verified Intact (${ledgerVerification.checkedBlocks} blocks)`)
                    : pick(`원장 변조 감지됨 — 블록 #${ledgerVerification.tamperedBlockIndices.join(", #")}`, `Ledger Tamper Detected — Block #${ledgerVerification.tamperedBlockIndices.join(", #")}`)}
                </div>
                <div className="font-mono text-[11px] text-fg-3">HEAD: {ledgerVerification.headHash.slice(0, 24)}…</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setTamperSimulated(true); setStatusNotice(pick("블록 #1 페이로드 변조를 주입해 해시 체인 감지를 시뮬레이션했습니다.", "Injected payload tamper into block #1.")); }} className={BTN_DANGER}>
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{pick("블록 변조 시뮬레이션", "Simulate Block Tamper")}
              </button>
              <button type="button" onClick={() => { setTamperSimulated(false); setStatusNotice(pick("원본 SHA-256 해시 체인을 복구했습니다.", "Restored intact SHA-256 hash chain.")); }} className={BTN_OUTLINE}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{pick("원본 체인 복구", "Restore Intact Chain")}
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {effectiveLedger.blocks.map((block) => {
              const isTampered = ledgerVerification.tamperedBlockIndices.includes(block.index);
              return (
                <article key={`${block.index}-${block.eventType}`} className={`rounded-xl border p-3.5 ${isTampered ? "border-bad bg-bad-soft" : "border-line bg-card"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg tabular-nums">
                      <Link2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />#{block.index} · {block.eventType}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isTampered ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}>
                      {isTampered ? pick("변조 감지", "Tampered") : pick("무결", "Intact")}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 font-mono text-[11px] text-fg-2">
                    <div>prev: {block.prevHash.slice(0, 20)}…</div>
                    <div>hash: {block.blockHash.slice(0, 20)}…</div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="grid gap-3 rounded-xl border border-line bg-card p-4 md:grid-cols-2">
            <div>
              <h3 className="text-xs font-bold text-good">{pick("현재 구현 (로컬 검증 완료)", "Implemented Locally (Active)")}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-fg-2">
                {(isKo ? effectiveLedger.capabilityBoundary.implementedLocallyKo : effectiveLedger.capabilityBoundary.implementedLocallyEn).map((item) => (<li key={item}>{item}</li>))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-bold text-cool">{pick("외부 체인·CA 연동 옵션 (현재 미연결)", "External Chain / CA Options (Not Connected)")}</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-fg-2">
                {effectiveLedger.capabilityBoundary.externalAdapterOptions.map((opt) => (<li key={opt.adapterId}>{pick(opt.labelKo, opt.labelEn)}</li>))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "watermark" ? (
        <div id={`${uid}-panel-watermark`} role="tabpanel" aria-labelledby={`${uid}-tab-watermark`} className="flex flex-col gap-4">
          <div className="grid gap-3 rounded-xl border border-line bg-card p-4 md:grid-cols-4">
            <div>
              <label htmlFor={`${uid}-wm-author`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("작성자 ID (페이로드)", "Author ID (Payload)")}</label>
              <input id={`${uid}-wm-author`} type="text" value={authorId} onChange={(e) => setAuthorId(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label htmlFor={`${uid}-wm-work`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("작품 ID (페이로드)", "Work ID (Payload)")}</label>
              <input id={`${uid}-wm-work`} type="text" value={watermarkWorkId} onChange={(e) => setWatermarkWorkId(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label htmlFor={`${uid}-wm-strength`} className="mb-1 flex items-center justify-between text-xs font-semibold text-fg-2">
                <span>{pick("적응형 기준 수위", "Adaptive Strength")}</span>
                <span className="tabular-nums text-accent">{watermarkStrength} / 5</span>
              </label>
              <input id={`${uid}-wm-strength`} type="range" min={1} max={5} step={1} value={watermarkStrength} onChange={(e) => setWatermarkStrength(Number.parseInt(e.target.value, 10))} className="min-h-11 w-full accent-accent" />
            </div>
            <div>
              <label htmlFor={`${uid}-export-channel`} className="mb-1 block text-xs font-semibold text-fg-2">{pick("출고 채널", "Export Channel")}</label>
              <select id={`${uid}-export-channel`} value={exportChannel} onChange={(e) => setExportChannel(e.target.value as WatermarkExportPreflightReport["targetChannel"])} className={INPUT_CLS}>
                <option value="commercial-webtoon">{pick("상업 웹툰 연재", "Commercial Webtoon")}</option>
                <option value="global-distribution">{pick("글로벌 플랫폼 배포", "Global Distribution")}</option>
                <option value="print-book">{pick("단행본 인쇄", "Print Book")}</option>
                <option value="portfolio-noncommercial">{pick("비상업 포트폴리오", "Non-Commercial Portfolio")}</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-line bg-card p-3.5">
              <div className="text-[11px] text-fg-3">{pick("전체 비가시 화질 (기준 >= 38 dB)", "Overall PSNR (Floor >= 38 dB)")}</div>
              <div className="mt-1 text-lg font-bold text-good tabular-nums">{watermarkEmbed.overallPsnrDb} dB</div>
              <div className="text-[11px] text-fg-2">{watermarkEmbed.psnrPass ? pick(`>= ${INVISIBLE_PSNR_FLOOR_DB} dB 통과`, `>= ${INVISIBLE_PSNR_FLOOR_DB} dB Passed`) : pick("기준 미달", "Below Floor")}</div>
            </div>
            {watermarkEmbed.regionMetrics.map((metric) => {
              const lbl = REGION_LABELS[metric.region];
              return (
                <div key={metric.region} className="rounded-xl border border-line bg-card p-3.5">
                  <div className="text-[11px] text-fg-3">{pick(lbl.ko, lbl.en)}</div>
                  <div className="mt-1 text-base font-bold text-fg tabular-nums">{metric.psnrDb} dB</div>
                  <div className="text-[11px] text-fg-2 tabular-nums">
                    {pick(`엔트로피 ${metric.meanEntropy} · 수위 ${metric.meanAdaptiveMargin}`, `Entropy ${metric.meanEntropy} · Margin ${metric.meanAdaptiveMargin}`)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-accent" aria-hidden="true" />
                <h3 className="text-sm font-bold text-fg">{pick("크롭 · 재압축 · AI 변조 탐지 시뮬레이터", "Crop · Recompression · AI Tamper Simulator")}</h3>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold tabular-nums ${verdictToneCls}`}>
                {attackReport.extraction.verdict} · {Math.round(attackReport.extraction.detectionConfidence * 100)}%
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ATTACK_SCENARIOS.map((sc) => (
                <button key={sc.id} type="button" aria-pressed={attackKind === sc.id} onClick={() => setAttackKind(sc.id)} className={attackKind === sc.id ? BTN_PRIMARY : BTN_OUTLINE}>
                  {pick(sc.ko, sc.en)}
                </button>
              ))}
            </div>
            <p className="text-xs text-fg-2">{pick(attackReport.summaryKo, attackReport.summaryEn)}</p>
            <div className="grid gap-2 text-xs md:grid-cols-4">
              <div className="rounded-lg bg-raised p-2.5"><div className="text-[11px] text-fg-3">{pick("추출 작성자 ID", "Extracted Author")}</div><div className="font-mono font-semibold text-fg">{attackReport.extraction.extractedAuthorId || "—"}</div></div>
              <div className="rounded-lg bg-raised p-2.5"><div className="text-[11px] text-fg-3">{pick("추출 작품 ID", "Extracted Work")}</div><div className="font-mono font-semibold text-fg">{attackReport.extraction.extractedWorkId || "—"}</div></div>
              <div className="rounded-lg bg-raised p-2.5"><div className="text-[11px] text-fg-3">{pick("CRC-16 · 비트 정확도", "CRC-16 · Bit Accuracy")}</div><div className="font-semibold tabular-nums text-fg">{attackReport.extraction.crcValid ? "PASS" : "FAIL"} · {Math.round(attackReport.extraction.bitAccuracy * 100)}%</div></div>
              <div className="rounded-lg bg-raised p-2.5"><div className="text-[11px] text-fg-3">{pick("변조 의심 블록 비율", "Suspect Tamper Area")}</div><div className="font-semibold tabular-nums text-fg">{Math.round(attackReport.extraction.tamperedBlockRatio * 100)}% ({attackReport.extraction.suspectBlockCount}/{attackReport.extraction.evaluatedBlocks})</div></div>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-accent" aria-hidden="true" />
                <h3 className="text-sm font-bold text-fg">{pick("Rights BOM · C2PA · 워터마크 통합 출고 프리플라이트", "Unified Export Preflight Gate (Rights BOM + C2PA + Watermark)")}</h3>
              </div>
              <button type="button" aria-pressed={injectRightsBomConflict} onClick={() => setInjectRightsBomConflict((prev) => !prev)} className={injectRightsBomConflict ? BTN_DANGER : BTN_OUTLINE}>
                {injectRightsBomConflict ? pick("비상업 에셋 충돌 해제", "Clear Non-Commercial Conflict") : pick("Rights BOM 비상업 에셋 충돌 테스트", "Test Rights BOM Conflict")}
              </button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {preflightReport.checks.map((chk) => {
                const badgeCls = chk.status === "pass" ? "bg-good-soft text-good" : chk.status === "warn" ? "bg-warning-soft text-warn" : "bg-bad-soft text-bad";
                return (
                  <div key={chk.id} className="rounded-lg border border-line bg-raised p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-fg">{pick(chk.titleKo, chk.titleEn)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${badgeCls}`}>{chk.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-fg-2">{pick(chk.detailKo, chk.detailEn)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
