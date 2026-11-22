/**
 * Studio Multilingual Balloon Fit Card — 다국어 말풍선 넘침·390px 가독성 사전 진단 요약 카드.
 *
 * `StudioLocalizationPanel` 안에서 현재 선택한 대사의 한국어 원문과 말풍선 박스 크기를
 * 바탕으로 en(1.35x)·ja(1.12x)·th(1.28x)·es(1.42x)·zh(0.85x) 번역 시 넘침 위험도,
 * 권장 폰트 축소율, 말풍선 최소 확장 px, 390px 모바일 최소 폰트 가드를 즉시 보여 준다.
 */

import { ArrowUpRight, Globe2, ShieldAlert } from "lucide-react";
import { useMemo, type ReactElement } from "react";

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
  /** 권장 말풍선 높이/폰트 크기를 편집 초안에 반영할 때 호출되는 선택 콜백. */
  readonly onApplyRecommendation?: (patch: {
    readonly availableHeight: number;
    readonly actualFontSize: number;
  }) => void;
}

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
  onApplyRecommendation,
}: StudioMultilingualBalloonFitCardProps): ReactElement | null {
  const activeNormalizedLocale = activeTargetLocale
    ? normalizeMultilingualTargetLocale(activeTargetLocale)
    : null;

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

  if (!report) return null;

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
