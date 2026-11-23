/**
 * 웹툰 플랫폼 반려 0건 자동 검수 통합 패널
 * (스마트 안전 분할선·모바일 360px 가독성 · 다국어 번역 식자 감사 · 0-Defect 출고 게이트).
 * Calm Atelier 시맨틱 토큰 전용(원시 색상 미사용 · 명시적 transition 속성만 사용).
 */

import { AlertTriangle, CheckCircle2, Globe2, Lock, RotateCcw, Scissors, ShieldCheck, Smartphone, Unlock, Wrench } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_BLOCKED_GATE_INPUT, DEFAULT_MULTILINGUAL_LETTERING_ENTRIES, LETTERING_TARGET_LANGS,
  auditMultilingualLetteringOverflow, buildClearedGateInput, evaluateZeroDefectPlatformGate,
  normalizeJapaneseVerticalPunctuation,
  type LetteringIssueCode, type LetteringTargetLang, type MultilingualLetteringEntry, type ZeroDefectPlatformGateInput,
} from "./i18n-lettering-and-platform-gate";
import {
  DEFAULT_MOBILE_QA_CUTS, DEFAULT_SMART_SLICE_DEMO, WEBTOON_PLATFORM_SPECS, WEBTOON_PLATFORM_SPEC_LIST,
  auditMobileReadabilityAndOcclusion, buildRemediatedMobileQaCuts, computeSmartSafeSlices,
  type MobileQaCut, type MobileQaIssueCode, type ProtectedBox, type WebtoonPlatformId,
} from "./smart-safe-slice-and-mobile-qa";

export interface AutoQaLayoutSpecPanelProps {
  readonly initialTab?: "slice-mobile" | "i18n-lettering" | "zero-defect-gate";
  readonly initialPlatformId?: WebtoonPlatformId;
  readonly initialCanvasHeight?: number;
  readonly initialProtectedBoxes?: readonly ProtectedBox[];
  readonly initialMobileCuts?: readonly MobileQaCut[];
  readonly initialLetteringEntries?: readonly MultilingualLetteringEntry[];
  readonly initialGateInput?: ZeroDefectPlatformGateInput;
}

type PanelTabId = "slice-mobile" | "i18n-lettering" | "zero-defect-gate";
type LangFilter = "ALL" | LetteringTargetLang;

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_SOLID = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 ${FOCUS_RING}`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;
const BADGE_GOOD = "inline-flex items-center gap-1 rounded-full border border-good/40 bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good";
const BADGE_BAD = "inline-flex items-center gap-1 rounded-full border border-bad/40 bg-bad-soft px-2.5 py-0.5 text-[11px] font-semibold text-bad";
const BADGE_WARN = "inline-flex items-center gap-1 rounded-full border border-warn/40 bg-warning-soft px-2.5 py-0.5 text-[11px] font-semibold text-warn";

const MOBILE_CODE_LABELS: Readonly<Record<MobileQaIssueCode, { readonly ko: string; readonly en: string }>> = {
  "micro-font": { ko: "소형 폰트(<11px)", en: "Micro Font (<11px)" },
  "text-wall": { ko: "말풍선 글벽(3+)", en: "Text Wall (3+)" },
  "face-occlusion": { ko: "얼굴 가림(>12%)", en: "Face Occlusion (>12%)" },
};

const LETTERING_CODE_LABELS: Readonly<Record<LetteringIssueCode, { readonly ko: string; readonly en: string }>> = {
  overflow: { ko: "말풍선 오버플로우", en: "Balloon Overflow" },
  "vertical-punct": { ko: "JA 세로 구두점", en: "JA Vertical Punct" },
  "sfx-inpaint-missing": { ko: "SFX 배경 복원 누락", en: "SFX Inpaint Missing" },
};

function remediateLetteringEntry(
  entry: MultilingualLetteringEntry,
  occupancyRatio: number,
  scaleBoost: number,
): MultilingualLetteringEntry {
  const scale = occupancyRatio > 1 ? Math.min(2.4, Math.sqrt(occupancyRatio) * scaleBoost) : 1;
  return {
    ...entry,
    balloonWidthPx: Math.ceil(entry.balloonWidthPx * scale),
    balloonHeightPx: Math.ceil(entry.balloonHeightPx * scale),
    translatedText: entry.targetLang === "JA" ? normalizeJapaneseVerticalPunctuation(entry.translatedText) : entry.translatedText,
    verticalGlyphRotationApplied: entry.targetLang === "JA" ? true : entry.verticalGlyphRotationApplied,
    inpaintReady: entry.kind === "sfx" ? true : entry.inpaintReady,
  };
}

export function AutoQaLayoutSpecPanel({
  initialTab = "slice-mobile",
  initialPlatformId = "naver",
  initialCanvasHeight,
  initialProtectedBoxes,
  initialMobileCuts,
  initialLetteringEntries,
  initialGateInput,
}: AutoQaLayoutSpecPanelProps = {}): ReactElement {
  const uid = useId();
  const lang = useI18n((state) => state.lang);
  const isEn = lang === "en";
  const locale = isEn ? "en-US" : "ko-KR";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const baseCanvasHeight = initialCanvasHeight ?? DEFAULT_SMART_SLICE_DEMO.canvasHeight;
  const baseProtectedBoxes = initialProtectedBoxes ?? DEFAULT_SMART_SLICE_DEMO.protectedBoxes;
  const baseMobileCuts = initialMobileCuts ?? DEFAULT_MOBILE_QA_CUTS;
  const baseLetteringEntries = initialLetteringEntries ?? DEFAULT_MULTILINGUAL_LETTERING_ENTRIES;
  const baseGateInput = initialGateInput ?? { ...DEFAULT_BLOCKED_GATE_INPUT, platformId: initialPlatformId };

  const [activeTab, setActiveTab] = useState<PanelTabId>(initialTab);
  const [platformId, setPlatformId] = useState<WebtoonPlatformId>(baseGateInput.platformId);
  const [viewportWidthPx, setViewportWidthPx] = useState<360 | 390>(360);
  const [mobileCuts, setMobileCuts] = useState<readonly MobileQaCut[]>(baseMobileCuts);
  const [letteringEntries, setLetteringEntries] = useState<readonly MultilingualLetteringEntry[]>(baseLetteringEntries);
  const [langFilter, setLangFilter] = useState<LangFilter>("ALL");
  const [gateInput, setGateInput] = useState<ZeroDefectPlatformGateInput>(baseGateInput);
  const [statusNotice, setStatusNotice] = useState("");

  const sliceResult = useMemo(
    () => computeSmartSafeSlices(baseCanvasHeight, platformId, baseProtectedBoxes),
    [baseCanvasHeight, baseProtectedBoxes, platformId],
  );
  const mobileAudit = useMemo(
    () => auditMobileReadabilityAndOcclusion(mobileCuts, viewportWidthPx),
    [mobileCuts, viewportWidthPx],
  );
  const letteringAudit = useMemo(
    () => auditMultilingualLetteringOverflow(letteringEntries),
    [letteringEntries],
  );
  const gateResult = useMemo(
    () => evaluateZeroDefectPlatformGate({ ...gateInput, platformId, sliceAccidentCount: sliceResult.safeAccidentCount }),
    [gateInput, platformId, sliceResult.safeAccidentCount],
  );

  const visibleLetteringIssues = useMemo(
    () => (langFilter === "ALL" ? letteringAudit.issues : letteringAudit.issues.filter((i) => i.targetLang === langFilter)),
    [langFilter, letteringAudit.issues],
  );

  const handlePlatformSelect = (nextId: WebtoonPlatformId): void => {
    setPlatformId(nextId);
    setGateInput((prev) => ({ ...prev, platformId: nextId }));
    const spec = WEBTOON_PLATFORM_SPECS[nextId];
    setStatusNotice(pick(
      `플랫폼 프리셋을 ${spec.nameKo}(${spec.widthPx}×${spec.maxSliceHeightPx.toLocaleString("ko-KR")}px)으로 전환했습니다.`,
      `Switched platform preset to ${spec.nameEn} (${spec.widthPx}x${spec.maxSliceHeightPx.toLocaleString("en-US")}px).`,
    ));
  };

  const handleFixLetteringEntry = (entryId: string): void => {
    setLetteringEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        const metric = letteringAudit.entryMetrics.find((m) => m.entryId === entry.id);
        return remediateLetteringEntry(entry, metric?.occupancyRatio ?? 1, 1.18);
      }),
    );
    setStatusNotice(pick("선택한 다국어 식자 경고를 보정했습니다.", "Remediated selected multilingual lettering warning."));
  };

  const handleFixAllLettering = (): void => {
    setLetteringEntries((prev) =>
      prev.map((entry) => {
        const metric = letteringAudit.entryMetrics.find((m) => m.entryId === entry.id);
        return remediateLetteringEntry(entry, metric?.occupancyRatio ?? 1, 1.2);
      }),
    );
    setStatusNotice(pick("다국어 오버플로우·일본어 구두점·SFX 복원 항목을 일괄 보정했습니다.", "Auto-remediated overflow, JA vertical punctuation, and SFX inpainting."));
  };

  const tabs: readonly { readonly id: PanelTabId; readonly label: string }[] = [
    { id: "slice-mobile", label: pick("스마트 안전 분할선·모바일 360px", "Smart Safe Slice & Mobile 360px") },
    { id: "i18n-lettering", label: pick("다국어 번역 식자 감사", "Multilingual Lettering Audit") },
    { id: "zero-defect-gate", label: pick("0-Defect 출고 게이트", "0-Defect Release Gate") },
  ];

  return (
    <section
      aria-label={pick("웹툰 레이아웃·식자·다국어·출고 규격 자동 검수", "Webtoon Layout, Lettering, i18n & Release QA")}
      data-testid="auto-qa-layout-spec-panel"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5 text-fg [word-break:keep-all]"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-fg">{pick("플랫폼 반려 0건 레이아웃·다국어·출고 게이트", "Zero-Rejection Layout, i18n & Release Gate")}</h2>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              "스마트 여백 스냅 분할, 모바일 360px 가독성·얼굴 가림, 5개 언어 식자 오버플로우, 0-Defect 납품 규격을 로컬에서 즉시 판정합니다.",
              "Verify gutter-snapped slices, 360px mobile readability & face occlusion, 5-language lettering overflow, and 0-Defect platform release gates locally.",
            )}
          </p>
        </div>
        <span data-testid="header-gate-badge" className={gateResult.readyToShip ? BADGE_GOOD : BADGE_BAD}>
          {gateResult.readyToShip ? <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
          <span className="tabular-nums">
            {gateResult.readyToShip
              ? pick(`출고 승인 · ${gateResult.score}점`, `Ready to Ship · ${gateResult.score}/100`)
              : pick(`출고 잠금 · ${gateResult.score}점`, `Release Locked · ${gateResult.score}/100`)}
          </span>
        </span>
      </header>

      <div role="tablist" aria-label={pick("자동 검수 기능 탭", "Auto-QA feature tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button key={tab.id} id={`${uid}-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`${uid}-panel-${tab.id}`} data-testid={`tab-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? BTN_SOLID : BTN_OUTLINE}>
            {tab.label}
          </button>
        ))}
      </div>

      {statusNotice ? <div role="status" aria-live="polite" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2">{statusNotice}</div> : null}

      {activeTab === "slice-mobile" ? (
        <div id={`${uid}-panel-slice-mobile`} role="tabpanel" aria-labelledby={`${uid}-tab-slice-mobile`} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                <Scissors className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("플랫폼 규격 프리셋 전환", "Platform Spec Presets")}
              </span>
              <span className="text-[11px] text-fg-3 tabular-nums">
                {pick(`원고 세로 높이 ${sliceResult.canvasHeight.toLocaleString("ko-KR")}px`, `Canvas Height ${sliceResult.canvasHeight.toLocaleString("en-US")}px`)}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label={pick("웹툰 플랫폼 선택", "Select webtoon platform")}>
              {WEBTOON_PLATFORM_SPEC_LIST.map((spec) => {
                const active = spec.id === platformId;
                return (
                  <button key={spec.id} type="button" aria-pressed={active} data-testid={`platform-btn-${spec.id}`} onClick={() => handlePlatformSelect(spec.id)} className={`flex min-h-11 cursor-pointer flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors motion-reduce:transition-none ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-fg" : "border-line bg-panel text-fg-2 hover:bg-raised"}`}>
                    <span className="font-bold text-fg">{pick(spec.nameKo, spec.nameEn)}</span>
                    <span className="text-[11px] text-fg-3 tabular-nums">{spec.widthPx}×{spec.maxSliceHeightPx.toLocaleString(locale)}px · ≤{spec.maxFileSizeMb}MB</span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <article className="flex flex-col gap-2 rounded-lg border border-bad/40 bg-bad-soft p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-bad">{pick("고정 간격 절단 (기존 방식)", "Naive Fixed-Interval Slicing")}</h3>
                  <span data-testid="naive-accident-count" className="text-sm font-extrabold text-bad tabular-nums">
                    {pick(`절단 사고 ${sliceResult.naiveAccidentCount}건`, `${sliceResult.naiveAccidentCount} Accidents`)}
                  </span>
                </div>
                <ul className="flex flex-col gap-1 text-[11px] text-fg-2">
                  {sliceResult.naiveAccidents.length > 0 ? (
                    sliceResult.naiveAccidents.slice(0, 4).map((acc) => (
                      <li key={`${acc.sliceY}-${acc.boxId}`} className="tabular-nums">Y={acc.sliceY.toLocaleString(locale)}px · {pick(acc.labelKo, acc.labelEn)}</li>
                    ))
                  ) : (
                    <li>{pick("고정 간격 절단 사고 없음", "No fixed-interval accidents")}</li>
                  )}
                </ul>
              </article>

              <article className="flex flex-col gap-2 rounded-lg border border-good/40 bg-good-soft p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold text-good">{pick("스마트 안전 분할선 (여백 스냅)", "Smart Safe Gutter Slicing")}</h3>
                  <span data-testid="safe-accident-count" className="text-sm font-extrabold text-good tabular-nums">
                    {pick(`절단 사고 ${sliceResult.safeAccidentCount}건`, `${sliceResult.safeAccidentCount} Accidents`)}
                  </span>
                </div>
                <p className="text-[11px] text-fg-2 tabular-nums">
                  {pick(
                    `총 ${sliceResult.segments.length}개 분할 슬라이스 · 최대 높이 ${sliceResult.maxSegmentHeightPx.toLocaleString("ko-KR")}px · 사고 ${sliceResult.preventedAccidentCount}건 예방`,
                    `${sliceResult.segments.length} slices · max height ${sliceResult.maxSegmentHeightPx.toLocaleString("en-US")}px · ${sliceResult.preventedAccidentCount} accident(s) prevented`,
                  )}
                </p>
                <p className="truncate text-[11px] text-fg-3 tabular-nums">
                  {pick("안전 절단 Y: ", "Safe Cut Y: ")}
                  {sliceResult.safeSliceYs.slice(0, 5).map((y) => `${y.toLocaleString(locale)}px`).join(", ")}
                  {sliceResult.safeSliceYs.length > 5 ? ` … (+${sliceResult.safeSliceYs.length - 5})` : ""}
                </p>
              </article>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Smartphone className="h-4 w-4 text-cool" aria-hidden="true" />
                <h3 className="text-xs font-bold text-fg">{pick("모바일 360px/390px 가독성 · 얼굴 가림 감사", "Mobile 360px/390px Readability & Face Occlusion")}</h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([360, 390] as const).map((vw) => (
                  <button key={vw} type="button" aria-pressed={viewportWidthPx === vw} data-testid={`viewport-btn-${vw}`} onClick={() => setViewportWidthPx(vw)} className={`${viewportWidthPx === vw ? BTN_SOLID : BTN_OUTLINE} tabular-nums`}>{vw}px</button>
                ))}
                <button type="button" data-testid="mobile-fix-btn" onClick={() => { setMobileCuts(buildRemediatedMobileQaCuts(baseMobileCuts, viewportWidthPx)); setStatusNotice(pick("모바일 폰트·여백·얼굴 가림 보정 시뮬레이션을 적용했습니다.", "Applied simulated mobile readability & occlusion fixes.")); }} className={BTN_OUTLINE}>
                  <Wrench className="h-3.5 w-3.5" aria-hidden="true" /> {pick("자동 보정 시험", "Simulate Fix")}
                </button>
                <button type="button" data-testid="mobile-reset-btn" onClick={() => setMobileCuts(baseMobileCuts)} className={BTN_OUTLINE}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> {pick("원본", "Reset")}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 tabular-nums">
              {(["micro-font", "text-wall", "face-occlusion"] as const).map((code) => (
                <span key={code} data-testid={`mobile-count-${code}`} className={mobileAudit.countsByCode[code] > 0 ? BADGE_WARN : BADGE_GOOD}>
                  {pick(MOBILE_CODE_LABELS[code].ko, MOBILE_CODE_LABELS[code].en)}: {mobileAudit.countsByCode[code]}
                </span>
              ))}
            </div>

            {mobileAudit.issues.length > 0 ? (
              <ul className="flex flex-col gap-2" data-testid="mobile-issues-list">
                {mobileAudit.issues.map((issue) => (
                  <li key={issue.id} className="flex flex-col gap-1 rounded-lg border border-line bg-panel p-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={issue.severity === "critical" ? BADGE_BAD : BADGE_WARN}>{pick(MOBILE_CODE_LABELS[issue.code].ko, MOBILE_CODE_LABELS[issue.code].en)}</span>
                      <span className="text-[11px] text-fg-3 tabular-nums">{pick(`컷 #${issue.cutNumber}`, `Cut #${issue.cutNumber}`)}</span>
                    </div>
                    <p className="font-semibold text-fg">{pick(issue.messageKo, issue.messageEn)}</p>
                    <p className="text-[11px] text-fg-2">{pick(issue.suggestionKo, issue.suggestionEn)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p data-testid="mobile-audit-pass" className="rounded-lg border border-good/40 bg-good-soft px-3 py-2 text-xs font-semibold text-good">
                {pick(`${viewportWidthPx}px 기준 모바일 가독성·글벽·얼굴 가림 결함 0건 통과`, `Passed ${viewportWidthPx}px mobile readability, text-wall & occlusion checks with 0 issues.`)}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {activeTab === "i18n-lettering" ? (
        <div id={`${uid}-panel-i18n-lettering`} role="tabpanel" aria-labelledby={`${uid}-tab-i18n-lettering`} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-card p-3.5">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("대상 언어 필터", "Target language filter")}>
              <Globe2 className="mr-1 h-4 w-4 text-accent" aria-hidden="true" />
              {(["ALL", ...LETTERING_TARGET_LANGS] as const).map((code) => {
                const count = code === "ALL" ? letteringAudit.issues.length : letteringAudit.countsByLang[code];
                return (
                  <button key={code} type="button" aria-pressed={langFilter === code} data-testid={`lang-filter-${code}`} onClick={() => setLangFilter(code)} className={`${langFilter === code ? BTN_SOLID : BTN_OUTLINE} tabular-nums`}>
                    {code === "ALL" ? pick("전체", "ALL") : code} ({count})
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" data-testid="lettering-fix-all-btn" onClick={handleFixAllLettering} className={BTN_SOLID}>
                <Wrench className="h-3.5 w-3.5" aria-hidden="true" /> {pick("식자 일괄 보정", "Auto-Fix All")}
              </button>
              <button type="button" data-testid="lettering-reset-btn" onClick={() => setLetteringEntries(baseLetteringEntries)} className={BTN_OUTLINE}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> {pick("원본", "Reset")}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 tabular-nums">
            {(["overflow", "vertical-punct", "sfx-inpaint-missing"] as const).map((code) => (
              <span key={code} data-testid={`lettering-count-${code}`} className={letteringAudit.countsByCode[code] > 0 ? BADGE_BAD : BADGE_GOOD}>
                {pick(LETTERING_CODE_LABELS[code].ko, LETTERING_CODE_LABELS[code].en)}: {letteringAudit.countsByCode[code]}
              </span>
            ))}
          </div>

          {visibleLetteringIssues.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="lettering-issues-list">
              {visibleLetteringIssues.map((issue) => (
                <li key={issue.id} className="flex flex-col gap-1.5 rounded-xl border border-line bg-card p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={issue.severity === "critical" ? BADGE_BAD : BADGE_WARN}>{pick(LETTERING_CODE_LABELS[issue.code].ko, LETTERING_CODE_LABELS[issue.code].en)}</span>
                      <span className="rounded bg-raised px-2 py-0.5 font-mono text-[11px] font-semibold text-fg-2 tabular-nums">{issue.targetLang} · #{issue.cutNumber}</span>
                    </div>
                    <button type="button" data-testid={`fix-lettering-${issue.entryId}`} onClick={() => handleFixLetteringEntry(issue.entryId)} className={BTN_OUTLINE}>
                      {pick("즉시 보정", "Fix Entry")}
                    </button>
                  </div>
                  <p className="font-semibold text-fg">{pick(issue.messageKo, issue.messageEn)}</p>
                  <p className="text-[11px] text-fg-2">{pick(issue.suggestionKo, issue.suggestionEn)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p data-testid="lettering-audit-pass" className="rounded-lg border border-good/40 bg-good-soft px-3 py-2.5 text-xs font-semibold text-good">
              {pick("선택한 언어 범위의 식자 오버플로우·세로쓰기·SFX 복원 결함 0건", "0 overflow, vertical punctuation, or SFX inpaint issues in the selected language scope.")}
            </p>
          )}
        </div>
      ) : null}

      {activeTab === "zero-defect-gate" ? (
        <div id={`${uid}-panel-zero-defect-gate`} role="tabpanel" aria-labelledby={`${uid}-tab-zero-defect-gate`} className="flex flex-col gap-4">
          <div className={`flex flex-col gap-3 rounded-xl border p-4 ${gateResult.readyToShip ? "border-good/40 bg-good-soft" : "border-bad/40 bg-bad-soft"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {gateResult.readyToShip ? <CheckCircle2 className="h-5 w-5 text-good" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5 text-bad" aria-hidden="true" />}
                <div>
                  <h3 data-testid="gate-status-badge" className={`text-sm font-bold ${gateResult.readyToShip ? "text-good" : "text-bad"}`}>
                    {gateResult.readyToShip
                      ? pick("0-Defect 출고 승인 (반려 위험 0건)", "0-Defect Ready to Ship (0 Blockers)")
                      : pick(`출고 잠금 · 차단 사유 ${gateResult.blockingFailureCount}건`, `Release Locked · ${gateResult.blockingFailureCount} Blocking Issue(s)`)}
                  </h3>
                  <p className="text-xs text-fg-2 tabular-nums">
                    {pick(
                      `${gateResult.platform.nameKo} 납품 기준 · ${gateResult.passedCheckCount}/${gateResult.totalCheckCount} 항목 통과`,
                      `${gateResult.platform.nameEn} spec · ${gateResult.passedCheckCount}/${gateResult.totalCheckCount} checks passed`,
                    )}
                  </p>
                </div>
              </div>
              <strong data-testid="gate-score" className="text-2xl font-extrabold text-fg tabular-nums">
                {gateResult.score}<span className="text-xs font-semibold text-fg-3">/100</span>
              </strong>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-canvas">
              <div className={`h-full rounded-full transition-[width] motion-reduce:transition-none ${gateResult.readyToShip ? "bg-good" : "bg-accent"}`} style={{ width: `${gateResult.score}%` }} />
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="gate-clear-all-btn" onClick={() => { setGateInput(buildClearedGateInput(platformId)); setStatusNotice(pick("0-Defect 출고 규격 전 항목을 해소해 출고 잠금을 해제했습니다.", "Resolved all blocking items and unlocked the 0-Defect release gate.")); }} className={BTN_SOLID}>
                <Unlock className="h-3.5 w-3.5" aria-hidden="true" /> {pick("전 항목 해소 · 출고 잠금 해제", "Resolve All & Unlock")}
              </button>
              <button type="button" data-testid="gate-fix-spec-btn" onClick={() => { const spec = WEBTOON_PLATFORM_SPECS[platformId]; setGateInput((prev) => ({ ...prev, exportWidthPx: spec.widthPx, maxSliceHeightPx: spec.maxSliceHeightPx, maxSliceFileSizeMb: 1.65, colorSpace: "sRGB" })); }} className={BTN_OUTLINE}>
                {pick("규격·용량·sRGB 맞춤", "Align Spec · 2MB · sRGB")}
              </button>
              <button type="button" data-testid="gate-reset-btn" onClick={() => setGateInput({ ...baseGateInput, platformId })} className={BTN_OUTLINE}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> {pick("차단 샘플 복원", "Reset Blocked")}
              </button>
            </div>
          </div>

          <ul className="flex flex-col gap-2" data-testid="gate-checklist">
            {gateResult.checks.map((check) => (
              <li key={check.id} data-testid={`gate-check-${check.id}`} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-line bg-card p-3 text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-fg">
                    {pick(check.labelKo, check.labelEn)}
                    <span className="ml-2 text-[11px] font-normal text-fg-3 tabular-nums">({check.weight}pt)</span>
                  </span>
                  <span className="text-fg-2">{pick(check.reasonKo, check.reasonEn)}</span>
                </div>
                <span className={check.passed ? BADGE_GOOD : BADGE_BAD}>{check.passed ? pick("통과", "PASS") : pick("차단", "BLOCKED")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
