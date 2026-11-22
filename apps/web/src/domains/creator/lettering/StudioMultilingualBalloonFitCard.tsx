/**
 * Studio Multilingual Balloon Fit Card — 다국어 말풍선 넘침·390px 가독성 사전 진단 요약 카드.
 *
 * `StudioLocalizationPanel` 안에서 현재 선택한 대사의 한국어 원문과 말풍선 박스 크기를
 * 바탕으로 en(1.35x)·ja(1.12x)·th(1.28x)·es(1.42x)·zh(0.85x) 번역 시 넘침 위험도,
 * 권장 폰트 축소율, 말풍선 최소 확장 px, 390px 모바일 최소 폰트 가드를 즉시 보여 준다.
 */

import { ArrowUpRight, FileSpreadsheet, Globe2, Layers, ShieldAlert } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import {
  BUBBLE_REFLOW_LOCALES,
  BUBBLE_SAFE_PADDING_RATIO,
  classifyOverflowCuts,
  createSfxNonDestructiveLayerMetadata,
  exportDialogueToCsv,
  exportDialogueToXliff,
  importDialogueFromCsv,
  importDialogueFromXliff,
  isBubbleReflowLocale,
  LOCALE_TYPOGRAPHY_PROFILES,
  reinjectLocalizedDialogueEntries,
  solveMultilingualBubbleReflow,
  updateSfxLocaleVariant,
  type BubbleBadgeTone,
  type BubbleReflowLocale,
  type DialogueInterchangeEntry,
} from "./multilingual-bubble-reflow-solver";
import {
  diagnoseMultilingualBalloonFit,
  normalizeMultilingualTargetLocale,
  type BalloonOverflowRisk,
} from "./studio-multilingual-balloon-fit";

import { cn } from "@/shared/lib/utils";

export interface StudioMultilingualBalloonFitCardProps {
  readonly sourceText: string;
  readonly boxWidthPx: number;
  readonly boxHeightPx: number;
  readonly fontSizePx: number;
  readonly lineHeight?: number;
  readonly activeTargetLocale?: string;
  readonly canvasWidthPx?: number;
  readonly cutId?: string;
  readonly bubbleId?: string;
  readonly speaker?: string;
  /** 언어별 번역 초안(제공 시 4개 국어 리플로우·CSV/XLIFF 추출에 그대로 사용). */
  readonly localizedTexts?: Readonly<Partial<Record<BubbleReflowLocale, string>>>;
  /** 권장 말풍선 높이/폰트 크기를 편집 초안에 반영할 때 호출되는 선택 콜백. */
  readonly onApplyRecommendation?: (patch: {
    readonly availableHeight: number;
    readonly actualFontSize: number;
  }) => void;
  /** CSV/XLIFF 역주입 완료 시 편집기에 결과를 전달하는 선택 콜백. */
  readonly onReinjectDialogue?: (entries: readonly DialogueInterchangeEntry[]) => void;
}

const REFLOW_BADGE_CLASS: Readonly<Record<BubbleBadgeTone, string>> = {
  green: "border-success/30 bg-success-soft/15 text-success",
  amber: "border-warning/35 bg-warning-soft/20 text-warning",
  red: "border-danger/45 bg-danger-soft/20 text-danger",
};

const SAMPLE_JA_TATEGAKI_TEXT = "「待って…本当に、行っちゃうの——？」";

const RISK_META: Readonly<Record<BalloonOverflowRisk, { readonly labelKo: string; readonly badgeClass: string }>> = {
  safe: {
    labelKo: "여유",
    badgeClass: "border-success/30 bg-success-soft/15 text-success",
  },
  tight: {
    labelKo: "빠듯",
    badgeClass: "border-warning/35 bg-warning-soft/20 text-warning",
  },
  overflow: {
    labelKo: "넘침",
    badgeClass: "border-danger/35 bg-danger-soft/15 text-danger",
  },
};

export function StudioMultilingualBalloonFitCard({
  sourceText,
  boxWidthPx,
  boxHeightPx,
  fontSizePx,
  lineHeight = 1.35,
  activeTargetLocale,
  canvasWidthPx,
  cutId = "cut-001",
  bubbleId = "bubble-001",
  speaker = "화자",
  localizedTexts,
  onApplyRecommendation,
  onReinjectDialogue,
}: StudioMultilingualBalloonFitCardProps): ReactElement | null {
  const activeNormalizedLocale = activeTargetLocale
    ? normalizeMultilingualTargetLocale(activeTargetLocale)
    : null;

  const initialReflowLocale: BubbleReflowLocale =
    activeNormalizedLocale && isBubbleReflowLocale(activeNormalizedLocale)
      ? activeNormalizedLocale
      : "ko";

  const [reflowLocale, setReflowLocale] = useState<BubbleReflowLocale>(initialReflowLocale);
  const [jaTategakiEnabled, setJaTategakiEnabled] = useState(true);
  const [interchangeFormat, setInterchangeFormat] = useState<"csv" | "xliff" | null>(null);
  const [interchangePayload, setInterchangePayload] = useState("");
  const [reinjectSummaryKo, setReinjectSummaryKo] = useState<string | null>(null);

  const report = useMemo(() => {
    if (
      !Number.isFinite(boxWidthPx) ||
      boxWidthPx <= 0 ||
      !Number.isFinite(boxHeightPx) ||
      boxHeightPx <= 0 ||
      !Number.isFinite(fontSizePx) ||
      fontSizePx <= 0
    ) {
      return null;
    }
    return diagnoseMultilingualBalloonFit({
      sourceText,
      boxWidthPx,
      boxHeightPx,
      fontSizePx,
      lineHeight,
      canvasWidthPx,
    });
  }, [boxHeightPx, boxWidthPx, canvasWidthPx, fontSizePx, lineHeight, sourceText]);

  const effectiveLocalizedTexts = useMemo<Readonly<Record<BubbleReflowLocale, string>>>(
    () => ({
      ko: localizedTexts?.ko ?? sourceText,
      en: localizedTexts?.en ?? sourceText,
      ja: localizedTexts?.ja ?? (sourceText.trim() ? sourceText : SAMPLE_JA_TATEGAKI_TEXT),
      es: localizedTexts?.es ?? sourceText,
    }),
    [localizedTexts, sourceText],
  );

  const reflowBatch = useMemo(() => {
    if (!report) return null;
    return classifyOverflowCuts(
      BUBBLE_REFLOW_LOCALES.map((loc) => ({
        cutId,
        bubbleId: `${bubbleId}-${loc}`,
        locale: loc,
        text: effectiveLocalizedTexts[loc],
        boxWidthPx,
        boxHeightPx,
        baseFontSizePx: fontSizePx,
        writingMode: loc === "ja" && jaTategakiEnabled ? "vertical-rl" : "horizontal-tb",
      })),
      { safePaddingRatio: BUBBLE_SAFE_PADDING_RATIO },
    );
  }, [boxHeightPx, boxWidthPx, bubbleId, cutId, effectiveLocalizedTexts, fontSizePx, jaTategakiEnabled, report]);

  const activeReflow = useMemo(() => {
    if (!report) return null;
    const textForPreview =
      reflowLocale === "ja" && jaTategakiEnabled && !localizedTexts?.ja
        ? `${effectiveLocalizedTexts.ja}「ー…—」`
        : effectiveLocalizedTexts[reflowLocale];
    return solveMultilingualBubbleReflow({
      cutId,
      bubbleId,
      locale: reflowLocale,
      text: textForPreview,
      boxWidthPx,
      boxHeightPx,
      baseFontSizePx: fontSizePx,
      lineHeight: reflowLocale === "ko" ? lineHeight : undefined,
      writingMode: reflowLocale === "ja" && jaTategakiEnabled ? "vertical-rl" : "horizontal-tb",
    });
  }, [
    boxHeightPx,
    boxWidthPx,
    bubbleId,
    cutId,
    effectiveLocalizedTexts,
    fontSizePx,
    jaTategakiEnabled,
    lineHeight,
    localizedTexts?.ja,
    reflowLocale,
    report,
  ]);

  const sfxMetadata = useMemo(() => {
    const base = createSfxNonDestructiveLayerMetadata({
      sfxId: `sfx-${bubbleId}`,
      cutId,
      sourceText: "콰앙!",
      sourceLocale: "ko",
      backgroundLayerId: `bg-${cutId}`,
      outlineWidthPx: 6,
      archShape: "arcUp",
    });
    return updateSfxLocaleVariant(base, "en", { text: "KRA-KOOM!", scaleFactor: 0.92 });
  }, [bubbleId, cutId]);

  const baseInterchangeEntries = useMemo<readonly DialogueInterchangeEntry[]>(
    () => [
      {
        cutId,
        bubbleId,
        speaker,
        kind: "dialogue",
        writingMode: reflowLocale === "ja" && jaTategakiEnabled ? "vertical-rl" : "horizontal-tb",
        sourceLocale: "ko",
        texts: effectiveLocalizedTexts,
        sfxOutlineWidthPx: sfxMetadata.outline.widthPx,
        sfxArchShape: sfxMetadata.archWarp.shape,
        notes: "14% safe padding reflow",
      },
    ],
    [bubbleId, cutId, effectiveLocalizedTexts, jaTategakiEnabled, reflowLocale, sfxMetadata, speaker],
  );

  if (!report || !activeReflow || !reflowBatch) return null;

  const handleExportCsv = () => {
    const csv = exportDialogueToCsv(baseInterchangeEntries);
    setInterchangeFormat("csv");
    setInterchangePayload(csv);
    setReinjectSummaryKo(null);
  };

  const handleExportXliff = () => {
    const target = reflowLocale === "ko" ? "en" : reflowLocale;
    const xml = exportDialogueToXliff(baseInterchangeEntries, {
      originalName: `${cutId}-dialogue.json`,
      sourceLocale: "ko",
      targetLocale: target,
    });
    setInterchangeFormat("xliff");
    setInterchangePayload(xml);
    setReinjectSummaryKo(null);
  };

  const handleRoundTripReinject = () => {
    if (!interchangePayload || !interchangeFormat) return;
    const imported =
      interchangeFormat === "csv"
        ? importDialogueFromCsv(interchangePayload)
        : importDialogueFromXliff(interchangePayload).entries;
    const reinjected = reinjectLocalizedDialogueEntries(baseInterchangeEntries, imported);
    setReinjectSummaryKo(
      `${interchangeFormat.toUpperCase()} 역주입 완료 · 반영 ${reinjected.updatedCount}건 · 유지 ${reinjected.unchangedCount}건 · 미매칭 ${reinjected.unmatchedIds.length}건`,
    );
    onReinjectDialogue?.(reinjected.entries);
  };

  const activeDiagnosis =
    (activeNormalizedLocale
      ? report.locales.find((item) => item.locale === activeNormalizedLocale)
      : null) ?? report.locales[0] ?? null;

  const needsAdjustment =
    report.maxRequiredExpandPx > 0 || report.currentFontBelowMobileFloor;

  const recommendedHeightPx = Math.ceil(boxHeightPx + report.maxRequiredExpandPx);
  const recommendedSafeFontPx = report.currentFontBelowMobileFloor
    ? report.minCanvasFontSizeForMobilePx
    : activeDiagnosis?.recommendedFontSizePx ?? fontSizePx;

  return (
    <section
      data-testid="multilingual-balloon-fit-card"
      aria-label="다국어 말풍선 넘침·390px 가독성 사전 진단"
      className="mt-4 rounded-2xl border border-line bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[0.65rem] font-bold tracking-[0.08em] text-accent">
            <Globe2 size={13} aria-hidden="true" />
            다국어 말풍선 사전 진단
          </p>
          <p className="mt-1 text-xs leading-5 text-fg-2">{report.summaryKo}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-bold tabular-nums",
            RISK_META[report.worstRisk].badgeClass,
          )}
        >
          최대 위험 · {RISK_META[report.worstRisk].labelKo}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-panel px-3 py-2 text-[0.68rem] text-fg-3 tabular-nums">
        <span>원문 {report.sourceCharCount}자</span>
        <span>
          박스 {Math.round(report.boxWidthPx)}×{Math.round(report.boxHeightPx)}px
        </span>
        <span>
          390px 실효 폰트 {report.currentMobileFontPx}px
          (최소 {report.mobileMinReadableFontPx}px · 캔버스 {report.minCanvasFontSizeForMobilePx}px)
        </span>
      </div>

      {report.currentFontBelowMobileFloor || report.guardedLocaleCount > 0 ? (
        <p
          role="status"
          className="mt-2.5 flex items-start gap-1.5 rounded-xl border border-warning/35 bg-warning-soft/15 px-3 py-2 text-[0.68rem] leading-5 text-warning"
        >
          <ShieldAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            {report.currentFontBelowMobileFloor
              ? `현재 폰트(${report.fontSizePx}px)가 390px 모바일에서 ${report.currentMobileFontPx}px로 작습니다. 캔버스 폰트를 최소 ${report.minCanvasFontSizeForMobilePx}px 이상으로 유지하세요.`
              : `390px 모바일 가독성 하한(${report.mobileMinReadableFontPx}px) 보호가 ${report.guardedLocaleCount}개 언어에서 작동했습니다. 추가 폰트 축소 대신 말풍선 높이를 최소 ${report.maxRequiredExpandPx}px 넓히세요.`}
          </span>
        </p>
      ) : null}

      <ul
        aria-label="언어별 말풍선 넘침 예측"
        className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
      >
        {report.locales.map((item) => {
          const riskMeta = RISK_META[item.risk];
          const isCurrentTarget = item.locale === activeNormalizedLocale;
          return (
            <li
              key={item.locale}
              data-testid={`balloon-fit-locale-${item.locale}`}
              data-risk={item.risk}
              className={cn(
                "rounded-xl border p-2.5 text-xs",
                isCurrentTarget
                  ? "border-accent/50 bg-accent-soft/10"
                  : "border-line bg-panel/70",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-fg">
                  {item.labelKo}
                  <span className="ml-1 text-[0.62rem] font-normal tabular-nums text-fg-3">
                    {item.expansionFactor}x
                  </span>
                </span>
                <span
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[0.58rem] font-bold leading-none",
                    riskMeta.badgeClass,
                  )}
                >
                  {riskMeta.labelKo}
                </span>
              </div>

              <dl className="mt-2 space-y-1 text-[0.64rem] text-fg-3 tabular-nums">
                <div className="flex justify-between gap-1">
                  <dt>예상 길이</dt>
                  <dd className="text-fg-2">
                    {item.estimatedCharCount}자 · {item.estimatedLineCount}줄
                  </dd>
                </div>
                <div className="flex justify-between gap-1">
                  <dt>권장 폰트</dt>
                  <dd className="text-fg-2">
                    {item.recommendedFontSizePx}px
                    {item.recommendedFontShrinkPercent > 0
                      ? ` (-${item.recommendedFontShrinkPercent}%)`
                      : ""}
                  </dd>
                </div>
                <div className="flex justify-between gap-1">
                  <dt>최소 확장</dt>
                  <dd className={item.minBalloonExpandPx > 0 ? "font-semibold text-danger" : "text-fg-2"}>
                    {item.minBalloonExpandPx > 0 ? `+${item.minBalloonExpandPx}px` : "0px"}
                  </dd>
                </div>
              </dl>

              {item.mobileReadabilityGuarded ? (
                <p className="mt-1.5 text-[0.58rem] font-semibold text-warning">
                  390px 가독성 가드 ({item.effectiveMobileFontPx}px)
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div
        data-testid="multilingual-reflow-solver-section"
        className="mt-3 rounded-xl border border-line bg-panel/80 p-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="4개 국어 자동 리플로우 언어 선택">
            {BUBBLE_REFLOW_LOCALES.map((loc) => (
              <button
                key={loc}
                type="button"
                aria-pressed={reflowLocale === loc}
                data-testid={`reflow-locale-btn-${loc}`}
                onClick={() => setReflowLocale(loc)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-lg border px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  reflowLocale === loc
                    ? "border-accent bg-accent-soft/15 text-accent"
                    : "border-line bg-card text-fg-2 hover:text-fg",
                )}
              >
                {LOCALE_TYPOGRAPHY_PROFILES[loc].labelKo} ({loc.toUpperCase()})
              </button>
            ))}
            {reflowLocale === "ja" ? (
              <button
                type="button"
                aria-pressed={jaTategakiEnabled}
                data-testid="reflow-tategaki-toggle"
                onClick={() => setJaTategakiEnabled((prev) => !prev)}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-lg border px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  jaTategakiEnabled
                    ? "border-accent bg-accent-soft/15 text-accent"
                    : "border-line bg-card text-fg-2",
                )}
              >
                일본어 세로쓰기(Tategaki) {jaTategakiEnabled ? "켜짐" : "꺼짐"}
              </button>
            ) : null}
          </div>

          <span
            data-testid="reflow-overflow-badge"
            data-badge-tone={activeReflow.badgeTone}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[0.66rem] font-bold tabular-nums",
              REFLOW_BADGE_CLASS[activeReflow.badgeTone],
            )}
          >
            {activeReflow.badgeLabelKo} · 빨간 넘침 배지 {reflowBatch.redBadgeCount}개 언어
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.68rem] text-fg-3 tabular-nums">
          <span>
            세이프 패딩 {Math.round(activeReflow.safePaddingRatio * 100)}% (내부{" "}
            {Math.round(activeReflow.innerWidthPx)}×{Math.round(activeReflow.innerHeightPx)}px)
          </span>
          <span>
            자동 맞춤 {activeReflow.fittedFontSizePx}px · 행간 {activeReflow.fittedLineHeight} ·{" "}
            {activeReflow.lineCount}
            {activeReflow.writingMode === "vertical-rl" ? "열" : "줄"}
          </span>
          {activeReflow.hyphenatedLineCount > 0 ? (
            <span>하이픈 줄바꿈 {activeReflow.hyphenatedLineCount}줄</span>
          ) : null}
        </div>

        {activeReflow.tategaki ? (
          <div
            data-testid="reflow-tategaki-summary"
            className="mt-2 rounded-lg border border-line bg-card px-2.5 py-2 text-[0.68rem] text-fg-2"
          >
            <p className="font-semibold text-fg">
              세로쓰기 글리프 경계 처리 · 90° 회전 {activeReflow.tategaki.transform.rotatedGlyphCount}자 ·
              세로 치환 {activeReflow.tategaki.transform.substitutedGlyphCount}자 (말줄임{" "}
              {activeReflow.tategaki.transform.ellipsisCount} · 장음{" "}
              {activeReflow.tategaki.transform.prolongedSoundCount} · 괄호{" "}
              {activeReflow.tategaki.transform.bracketCount} · 대시{" "}
              {activeReflow.tategaki.transform.dashCount})
            </p>
            <p className="mt-1 truncate font-mono text-[0.65rem] text-fg-3">
              {activeReflow.tategaki.transform.verticalSubstitutedText}
            </p>
          </div>
        ) : null}

        <div
          data-testid="reflow-sfx-metadata-strip"
          className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card px-2.5 py-2 text-[0.66rem] text-fg-3"
        >
          <span className="flex items-center gap-1.5 font-semibold text-fg-2">
            <Layers size={13} aria-hidden="true" />
            SFX 비손상 레이어 분리 ({sfxMetadata.backgroundPreservation.backgroundLayerId} 잠금)
          </span>
          <span className="tabular-nums">
            외곽선 {sfxMetadata.outline.widthPx}px · 아치 {sfxMetadata.archWarp.shape} ({sfxMetadata.archWarp.bendPercent}%)
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="reflow-export-csv"
            onClick={handleExportCsv}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-bold text-fg-2 transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <FileSpreadsheet size={13} aria-hidden="true" />
            <span>CSV 추출</span>
          </button>
          <button
            type="button"
            data-testid="reflow-export-xliff"
            onClick={handleExportXliff}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-bold text-fg-2 transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span>XLIFF 1.2 추출</span>
          </button>
          {interchangePayload ? (
            <button
              type="button"
              data-testid="reflow-roundtrip-reinject"
              onClick={handleRoundTripReinject}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft/10 px-3 text-xs font-bold text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span>왕복 역주입 적용</span>
            </button>
          ) : null}
        </div>

        {interchangePayload ? (
          <pre
            data-testid="reflow-interchange-preview"
            className="mt-2 max-h-28 overflow-auto rounded-lg border border-line bg-card p-2 font-mono text-[0.65rem] text-fg-3"
          >
            {interchangePayload}
          </pre>
        ) : null}

        {reinjectSummaryKo ? (
          <p data-testid="reflow-reinject-status" className="mt-1.5 text-[0.68rem] font-semibold text-success">
            {reinjectSummaryKo}
          </p>
        ) : null}
      </div>

      {onApplyRecommendation && needsAdjustment ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <p className="text-[0.66rem] leading-5 text-fg-3 tabular-nums">
            권장 반영값 · 말풍선 높이 {recommendedHeightPx}px · 폰트 {recommendedSafeFontPx}px
          </p>
          <button
            type="button"
            onClick={() =>
              onApplyRecommendation({
                availableHeight: recommendedHeightPx,
                actualFontSize: recommendedSafeFontPx,
              })
            }
            className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-accent/40 bg-panel px-3 text-xs font-bold text-accent transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span>권장 여유값 반영</span>
            <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
