/**
 * Wave 65A — AtelierGuide 서비스 내장 완전판 인터랙티브 매뉴얼 제어판.
 *
 * - 전체 서비스 7단계 비주얼 지하철 노선도 SVG(순수 시맨틱 OKLCH / currentColor · 역 클릭 즉시 필터)
 * - 0→프로 5단계 학습 로드맵 탭 + 빈도 필터(매일 쓰는 핵심 · 주간 활용 · 숨은 고수 기능) + 일상어 검색
 * - 인-스튜디오 컨텍스트 `?` 5초 툴팁 프리뷰 코치 카드 + 20종 전수 카드(따라하기·실수·팁·체크박스·진도율·JSON 복사)
 */

import {
  AlertCircle, Award, BookOpen, CheckCircle2, ChevronDown, ChevronUp, Compass,
  Copy, ExternalLink, Gem, HelpCircle, Lightbulb, MapPin, RotateCcw, Search, X,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  ATELIER_MANUAL_BRAND_NAME, ATELIER_MANUAL_SCHEMA_VERSION, ATELIER_MANUAL_UPDATED_AT,
  EVERYDAY_QUICK_SEARCH_CHIPS, LEARNING_LEVEL_ROADMAP, MANUAL_WORK_CONTEXT_SPECS,
  STUDIO_COMPLETE_FEATURE_GUIDES, STUDIO_JOURNEY_SUBWAY_STATIONS,
  computeMasteryProgress, exportInteractiveManualJson, formatOklch, getGuidesForStation,
  getRelatedHiddenGuides, recommendNextGuideForContext, searchManualGuides,
  type FeatureUsageFrequency, type InteractiveManualExportPayload, type LearningLevel,
  type ManualMasteryProgress, type ManualWorkContext, type StudioFeatureGuide,
  type StudioJourneyStationId,
} from "./atelier-manual-engine";

export interface StudioAtelierManualOsPanelProps {
  readonly initialLevel?: LearningLevel | "all";
  readonly initialFrequency?: FeatureUsageFrequency | "all";
  readonly initialStationId?: StudioJourneyStationId | "all";
  readonly initialWorkContext?: ManualWorkContext;
  readonly initialQuery?: string;
  readonly initialCompletedGuideIds?: readonly string[];
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onSelectGuide?: (guide: StudioFeatureGuide) => void;
  readonly onToggleCompleted?: (guideId: string, completedIds: readonly string[], progress: ManualMasteryProgress) => void;
  readonly onExportJson?: (json: string, payload: InteractiveManualExportPayload) => void;
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const LINK_BTN = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-canvas px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-accent hover:text-accent [word-break:keep-all] ${FOCUS_RING}`;

// 시맨틱 OKLCH SVG 팔레트 (휴 28°·48°·76°·154°·178°·198°·224°·240° — 바이올렛 265~325° 0%)
const SVG_PANEL_BG = formatOklch({ l: 0.98, c: 0.004, h: 240 }, 0.04);
const SVG_RAIL_STROKE = formatOklch({ l: 0.62, c: 0.014, h: 240 }, 0.36);
const SVG_EXPRESS_STROKE = formatOklch({ l: 0.6, c: 0.14, h: 48 }, 0.62);
const SVG_NODE_FILL = formatOklch({ l: 0.97, c: 0.004, h: 240 }, 0.14);
const SVG_GOOD_INK = formatOklch({ l: 0.55, c: 0.14, h: 154 });
const SVG_WARN_INK = formatOklch({ l: 0.58, c: 0.14, h: 76 });

const FREQUENCY_META: Readonly<Record<FeatureUsageFrequency, { readonly ko: string; readonly en: string; readonly badgeClass: string }>> = {
  daily: { ko: "매일 쓰는 핵심", en: "Daily Core", badgeClass: "border-accent bg-accent-soft text-accent" },
  weekly: { ko: "주간 활용", en: "Weekly Pro", badgeClass: "border-cool bg-info-soft text-cool" },
  "hidden-gem": { ko: "숨은 고수 기능", en: "Hidden Gem", badgeClass: "border-warn bg-warning-soft text-warn" },
};

function AtelierJourneySubwaySvg(props: {
  readonly activeStationId: StudioJourneyStationId | "all";
  readonly completedSet: ReadonlySet<string>;
  readonly isEn: boolean;
}): ReactElement {
  const { activeStationId, completedSet, isEn } = props;
  return (
    <svg
      data-testid="atelier-subway-map-svg"
      data-violet-free="true"
      data-active-station-id={activeStationId}
      viewBox="0 0 740 164"
      role="img"
      aria-label={isEn ? "ToonStudio 7-station creation journey subway map" : "ToonStudio 전체 서비스 7단계 비주얼 지하철 노선도"}
      className="h-44 w-full rounded-xl border border-line-strong bg-canvas text-fg"
    >
      <rect x="0" y="0" width="740" height="164" fill={SVG_PANEL_BG} />
      <text x="16" y="22" fill="currentColor" fontSize="11" fontWeight="700">
        {isEn ? "AtelierGuide 7-Station Creation Transit Map · 0 to Pro" : "AtelierGuide 전체 서비스 7단계 제작 지하철 노선도 · 0→프로"}
      </text>
      <text x="724" y="22" textAnchor="end" fill={SVG_WARN_INK} fontSize="9.5" fontWeight="700">
        {isEn ? "MAIN LINE (20) · HIDDEN EXPRESS (9)" : "본선 20종 · 숨은 기능 급행 9종"}
      </text>
      <line x1="62" y1="74" x2="674" y2="74" stroke={SVG_RAIL_STROKE} strokeWidth="6" strokeLinecap="round" />
      <path d="M 62 88 Q 215 144 368 88 Q 521 140 674 88" fill="none" stroke={SVG_EXPRESS_STROKE} strokeWidth="2.4" strokeDasharray="6 4" />
      <text x="368" y="152" textAnchor="middle" fill={SVG_WARN_INK} fontSize="8.8" fontWeight="600">
        {isEn
          ? "Hidden-Gem Express: 16K PCHIP · 0px Mirror · Cutaway · Backrun · 390px PiP · Color-Vision · CRDT · BOM · C2PA"
          : "숨은 기능 급행선: 16K 필압 · 0px 미러 · 솔리드 단면 · 수채화 백런 · 390px 폰뷰 · 색각 검수 · CRDT · Rights BOM · C2PA"}
      </text>
      {STUDIO_JOURNEY_SUBWAY_STATIONS.map((station, idx) => {
        const cx = 62 + idx * 102;
        const cy = 74;
        const guides = getGuidesForStation(station.id);
        const done = guides.filter((g) => completedSet.has(g.id)).length;
        const allDone = guides.length > 0 && done === guides.length;
        const isActive = activeStationId === station.id;
        const accent = formatOklch(station.accentOklch);
        const hasHidden = guides.some((g) => g.frequency === "hidden-gem");

        return (
          <g key={station.id} data-station-node={station.id}>
            <circle cx={cx} cy={cy} r={isActive ? 22 : 17} fill={formatOklch(station.accentOklch, isActive ? 0.24 : 0.08)} />
            <circle cx={cx} cy={cy} r="13" fill={allDone ? formatOklch(station.accentOklch, 0.24) : SVG_NODE_FILL} stroke={allDone ? SVG_GOOD_INK : accent} strokeWidth={isActive ? "3" : "2"} />
            {hasHidden ? <circle cx={cx + 11} cy={cy - 10} r="3.6" fill={SVG_WARN_INK} /> : null}
            <text x={cx} y={cy + 3.5} textAnchor="middle" fill="currentColor" fontSize="9.5" fontWeight="700" fontFamily="monospace">{station.code}</text>
            <text x={cx} y={cy - 23} textAnchor="middle" fill={accent} fontSize="8.5" fontWeight="700" fontFamily="monospace">{`Lv.${station.level} · ${done}/${guides.length}`}</text>
            <text x={cx} y={cy + 31} textAnchor="middle" fill="currentColor" fontSize="9.5" fontWeight="700">{isEn ? station.titleEn : station.titleKo}</text>
            <text x={cx} y={cy + 44} textAnchor="middle" fill="currentColor" fillOpacity={0.72} fontSize="7.8">{isEn ? station.subtitleEn : station.subtitleKo}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** AtelierGuide 서비스 내장 완전판 인터랙티브 매뉴얼 · 5단계 로드맵 · 숨은 기능 전수 가이드 제어판. */
export function StudioAtelierManualOsPanel(props: StudioAtelierManualOsPanelProps): ReactElement {
  const initialLevel = props.initialLevel ?? "all";
  const initialFrequency = props.initialFrequency ?? "all";
  const initialStationId = props.initialStationId ?? "all";
  const initialWorkContext = props.initialWorkContext ?? "first-open";
  const initialQuery = props.initialQuery ?? "";
  const initialCompleted = props.initialCompletedGuideIds ?? [];
  const isEn = (props.locale ?? "ko") === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const headingId = useId();
  const searchInputId = useId();

  const [selectedLevel, setSelectedLevel] = useState<LearningLevel | "all">(initialLevel);
  const [selectedFrequency, setSelectedFrequency] = useState<FeatureUsageFrequency | "all">(initialFrequency);
  const [selectedStationId, setSelectedStationId] = useState<StudioJourneyStationId | "all">(initialStationId);
  const [workContext, setWorkContext] = useState<ManualWorkContext>(initialWorkContext);
  const [query, setQuery] = useState<string>(initialQuery);
  const [completedIds, setCompletedIds] = useState<readonly string[]>(() => [...initialCompleted]);
  const [expandedGuideId, setExpandedGuideId] = useState<string | null>(STUDIO_COMPLETE_FEATURE_GUIDES[0].id);
  const [showTooltipPreview, setShowTooltipPreview] = useState<boolean>(true);
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const completedSet = useMemo(() => new Set(completedIds), [completedIds]);
  const progress = useMemo(() => computeMasteryProgress(completedIds), [completedIds]);
  const contextRec = useMemo(
    () => recommendNextGuideForContext({ currentContext: workContext, completedGuideIds: progress.validCompletedIds }),
    [workContext, progress.validCompletedIds],
  );
  const searchHits = useMemo(
    () => searchManualGuides(query, { level: selectedLevel, frequency: selectedFrequency, stationId: selectedStationId }),
    [query, selectedLevel, selectedFrequency, selectedStationId],
  );
  const exportBundle = useMemo(
    () => exportInteractiveManualJson({
      completedGuideIds: progress.validCompletedIds, currentContext: workContext, query,
      filters: { level: selectedLevel, frequency: selectedFrequency, stationId: selectedStationId },
    }),
    [progress.validCompletedIds, workContext, query, selectedLevel, selectedFrequency, selectedStationId],
  );

  const activeStation = useMemo(
    () => (selectedStationId === "all" ? null : STUDIO_JOURNEY_SUBWAY_STATIONS.find((s) => s.id === selectedStationId) ?? null),
    [selectedStationId],
  );
  const activeLevelSpec = useMemo(
    () => (selectedLevel === "all" ? null : LEARNING_LEVEL_ROADMAP.find((l) => l.level === selectedLevel) ?? null),
    [selectedLevel],
  );

  const handleToggleCompleted = (guideId: string): void => {
    const next = completedSet.has(guideId) ? completedIds.filter((id) => id !== guideId) : [...completedIds, guideId];
    const nextProgress = computeMasteryProgress(next);
    setCompletedIds(next);
    props.onToggleCompleted?.(guideId, nextProgress.validCompletedIds, nextProgress);
    setStatusMessage(
      completedSet.has(guideId)
        ? pick("실습 완료 체크를 해제했습니다.", "Unchecked practice completion.")
        : pick(`실습 완료! 현재 전체 진도 ${nextProgress.overallPercent}%입니다.`, `Practice checked! Mastery is now ${nextProgress.overallPercent}%.`),
    );
  };

  const handleJumpToGuide = (guide: StudioFeatureGuide): void => {
    setSelectedStationId("all"); setSelectedLevel("all"); setSelectedFrequency("all"); setQuery("");
    setExpandedGuideId(guide.id);
    props.onSelectGuide?.(guide);
    setStatusMessage(pick(`[${guide.titleKo}] 가이드를 펼쳤습니다.`, `Opened "${guide.titleEn}" guide.`));
  };

  const handleCopyJson = async (): Promise<void> => {
    setShowJsonPreview(true);
    props.onExportJson?.(exportBundle.json, exportBundle.payload);
    try {
      await navigator.clipboard.writeText(exportBundle.json);
      setStatusMessage(pick("AtelierGuide 전체 매뉴얼·진도 JSON을 클립보드에 복사했습니다.", "Copied AtelierGuide manual & progress JSON to clipboard."));
    } catch {
      setStatusMessage(pick("클립보드 권한이 없어 하단 JSON 미리보기 영역에 표시했습니다.", "Clipboard unavailable; JSON shown in preview below."));
    }
  };

  const handleResetAll = (): void => {
    setSelectedLevel(initialLevel); setSelectedFrequency(initialFrequency); setSelectedStationId(initialStationId);
    setWorkContext(initialWorkContext); setQuery(initialQuery); setCompletedIds([...initialCompleted]);
    setExpandedGuideId(STUDIO_COMPLETE_FEATURE_GUIDES[0].id); setShowJsonPreview(false);
    setStatusMessage(pick("매뉴얼 필터와 학습 상태를 초기값으로 되돌렸습니다.", "Reset manual filters and learning progress."));
  };

  const handleClearFilters = (): void => {
    setSelectedLevel("all"); setSelectedFrequency("all"); setSelectedStationId("all"); setQuery("");
  };

  return (
    <section
      data-testid="atelier-manual-os-panel"
      aria-labelledby={headingId}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg md:p-5 ${props.className ?? ""}`}
    >
      {/* 1. 헤더 + 진도율·랭크·배지 요약 */}
      <header className="space-y-3 border-b border-line pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent [word-break:keep-all]">
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {ATELIER_MANUAL_BRAND_NAME} · {pick("서비스 내장 완전판 매뉴얼", "Built-In Interactive Manual OS")}
              </span>
              <span data-testid="mastery-rank-badge" className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good [word-break:keep-all]">
                <Award className="h-3.5 w-3.5" aria-hidden="true" />
                {isEn ? progress.currentRank.titleEn : progress.currentRank.titleKo}
              </span>
              <span className="rounded-full border border-line-strong bg-card px-2.5 py-0.5 font-mono text-[11px] text-fg-2 tabular-nums">
                {ATELIER_MANUAL_UPDATED_AT}
              </span>
            </div>
            <h2 id={headingId} className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
              {pick("처음 배우는 5분부터 숨은 프로 기능 20종까지 — 단계별 인터랙티브 가이드", "From First 5 Minutes to All 20 Core & Hidden Pro Features")}
            </h2>
            <p className="text-xs text-fg-2 [word-break:keep-all]">
              {isEn ? progress.currentRank.nextMilestoneEn : progress.currentRank.nextMilestoneKo}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="manual-copy-json-btn" onClick={() => { void handleCopyJson(); }} className={BTN_SOLID}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("매뉴얼 JSON 복사", "Copy Manual JSON")}
            </button>
            <button type="button" data-testid="manual-toggle-json-btn" onClick={() => setShowJsonPreview((v) => !v)} className={showJsonPreview ? BTN_ACTIVE : BTN_OUTLINE}>
              {showJsonPreview ? pick("JSON 닫기", "Hide JSON") : pick("JSON 보기", "Preview JSON")}
            </button>
            <button type="button" data-testid="manual-reset-btn" onClick={handleResetAll} className={BTN_OUTLINE}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("초기화", "Reset")}
            </button>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-line bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span data-testid="mastery-overall-readout" className="font-semibold text-fg tabular-nums [word-break:keep-all]">
              {pick(`전체 학습 진도 ${progress.completedCount}/${progress.totalGuides} (${progress.overallPercent}%)`, `Overall Mastery ${progress.completedCount}/${progress.totalGuides} (${progress.overallPercent}%)`)}
            </span>
            <span data-testid="mastery-hidden-readout" className="inline-flex items-center gap-1 font-semibold text-warn tabular-nums [word-break:keep-all]">
              <Gem className="h-3.5 w-3.5" aria-hidden="true" />
              {pick(`숨은 고수 기능 ${progress.hiddenGemCompleted}/${progress.hiddenGemTotal} (${progress.hiddenGemPercent}%)`, `Hidden Gems ${progress.hiddenGemCompleted}/${progress.hiddenGemTotal} (${progress.hiddenGemPercent}%)`)}
            </span>
          </div>
          <div role="progressbar" aria-label={pick("전체 학습 진도율", "Overall manual mastery progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.overallPercent} className="h-2.5 w-full overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-accent transition-colors motion-reduce:transition-none" style={{ width: `${progress.overallPercent}%` }} />
          </div>
          {progress.unlockedBadges.length > 0 ? (
            <div data-testid="mastery-badges-strip" className="flex flex-wrap items-center gap-1.5 pt-1">
              {progress.unlockedBadges.map((badge) => (
                <span key={badge.id} data-testid={`unlocked-badge-${badge.id}`} className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2 py-0.5 text-[11px] font-semibold text-good [word-break:keep-all]">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  {isEn ? badge.titleEn : badge.titleKo}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      {/* 2. 전체 서비스 7단계 비주얼 지하철 노선도 SVG + 역 클릭 필터 */}
      <div className="space-y-2.5 rounded-xl border border-line-strong bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <MapPin className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("전체 서비스 7단계 지하철 노선도 (역을 누르면 해당 단계 기능으로 바로 필터됩니다)", "7-Station Service Transit Map (Click any station to filter immediately)")}
          </div>
          <button type="button" data-testid="subway-station-all" onClick={() => setSelectedStationId("all")} className={selectedStationId === "all" ? BTN_ACTIVE : BTN_OUTLINE}>
            {pick("전체 7역 보기", "All 7 Stations")}
          </button>
        </div>

        <AtelierJourneySubwaySvg activeStationId={selectedStationId} completedSet={completedSet} isEn={isEn} />

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7" role="group" aria-label={pick("7단계 노선 역 선택", "Select 7-station transit stop")}>
          {STUDIO_JOURNEY_SUBWAY_STATIONS.map((station) => {
            const isSelected = selectedStationId === station.id;
            const count = getGuidesForStation(station.id).length;
            return (
              <button
                key={station.id}
                type="button"
                data-testid={`subway-station-${station.id}`}
                aria-pressed={isSelected}
                onClick={() => {
                  const next = isSelected ? "all" : station.id;
                  setSelectedStationId(next);
                  if (next !== "all") {
                    setSelectedLevel("all");
                    const first = getGuidesForStation(next)[0];
                    if (first) setExpandedGuideId(first.id);
                  }
                }}
                className={`${isSelected ? BTN_ACTIVE : BTN_OUTLINE} flex-col gap-0.5 px-2 py-1.5 text-center`}
              >
                <span className="font-mono text-[10px] font-bold tabular-nums">{station.code} · {count}</span>
                <span className="text-[11px] font-semibold">{isEn ? station.titleEn : station.titleKo}</span>
              </button>
            );
          })}
        </div>

        {activeStation ? (
          <div data-testid="active-station-summary" className="rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs text-fg [word-break:keep-all]">
            <strong className="font-bold text-accent">{activeStation.code} · {isEn ? activeStation.titleEn : activeStation.titleKo}:</strong>{" "}
            {isEn ? activeStation.summaryEn : activeStation.summaryKo}
          </div>
        ) : null}
      </div>

      {/* 3. 인-스튜디오 컨텍스트 `?` 5초 툴팁 프리뷰 & 다음 추천 코치 */}
      <div data-testid="context-coach-card" className="space-y-3 rounded-xl border border-line-strong bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Compass className="h-4 w-4 text-accent" aria-hidden="true" />
            {pick("지금 작업 상황별 다음 추천 코치 · 인-스튜디오 `?` 5초 툴팁 미리보기", "Live Work-Context Coach & In-Studio `?` 5-Second Tooltip Preview")}
          </div>
          <button type="button" data-testid="tooltip-5s-toggle-btn" aria-expanded={showTooltipPreview} onClick={() => setShowTooltipPreview((v) => !v)} className={showTooltipPreview ? BTN_ACTIVE : BTN_OUTLINE}>
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {showTooltipPreview ? pick("`?` 5초 툴팁 숨기기", "Hide `?` 5s Tooltip") : pick("`?` 5초 툴팁 보기", "Show `?` 5s Tooltip")}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("현재 작업 상황 선택", "Choose current work context")}>
          {MANUAL_WORK_CONTEXT_SPECS.map((ctx) => (
            <button key={ctx.id} type="button" data-testid={`work-context-${ctx.id}`} aria-pressed={workContext === ctx.id} onClick={() => setWorkContext(ctx.id)} className={workContext === ctx.id ? BTN_ACTIVE : BTN_OUTLINE}>
              {isEn ? ctx.labelEn : ctx.labelKo}
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-lg border border-line bg-canvas p-3">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-[11px] font-bold text-accent [word-break:keep-all]">{pick("다음 추천 기능", "Recommended Next Skill")}</span>
              <kbd className="rounded border border-line-strong bg-raised px-1.5 py-0.5 font-mono text-[10px] font-semibold text-fg">{contextRec.primaryGuide.shortcut}</kbd>
            </div>
            <p data-testid="coach-primary-title" className="text-sm font-bold text-fg [word-break:keep-all]">
              {isEn ? contextRec.primaryGuide.titleEn : contextRec.primaryGuide.titleKo}
            </p>
            <p className="text-xs text-fg-2 [word-break:keep-all]">{isEn ? contextRec.rationaleEn : contextRec.rationaleKo}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" data-testid="coach-open-primary-btn" onClick={() => handleJumpToGuide(contextRec.primaryGuide)} className={BTN_SOLID}>
                {pick("따라하기 펼치기", "Open Step Guide")}
              </button>
              <button type="button" data-testid="coach-open-hidden-btn" onClick={() => handleJumpToGuide(contextRec.hiddenGemGuide)} className={BTN_OUTLINE}>
                <Gem className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
                {pick(`숨은 추천: ${contextRec.hiddenGemGuide.titleKo}`, `Hidden Gem: ${contextRec.hiddenGemGuide.titleEn}`)}
              </button>
            </div>
          </div>

          {showTooltipPreview ? (
            <div data-testid="tooltip-5s-preview" className="space-y-2 rounded-lg border border-accent bg-accent-soft p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-accent [word-break:keep-all]">
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  {pick("스튜디오 캔버스 `?` 5초 툴팁 프리뷰", "In-Studio `?` 5-Second Tooltip Preview")}
                </span>
                <span className="rounded-full border border-accent bg-canvas px-2 py-0.5 font-mono text-[10px] font-semibold text-accent">{contextRec.primaryGuide.atelierSuite}</span>
              </div>
              <p className="text-xs font-medium text-fg [word-break:keep-all]">{isEn ? contextRec.tooltip5sEn : contextRec.tooltip5sKo}</p>
              <a href={contextRec.primaryGuide.studioHref} className={LINK_BTN}>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("스튜디오에서 바로 실행", "Launch in Studio")}
              </a>
            </div>
          ) : null}
        </div>
      </div>

      {/* 4. 5단계 학습 로드맵 탭 + 빈도 필터 + 일상어 검색 */}
      <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
        <div data-testid="roadmap-level-tabs" className="flex flex-wrap gap-1.5" role="group" aria-label={pick("5단계 학습 로드맵 선택", "5-Level learning roadmap filter")}>
          <button type="button" data-testid="level-tab-all" aria-pressed={selectedLevel === "all"} onClick={() => setSelectedLevel("all")} className={selectedLevel === "all" ? BTN_ACTIVE : BTN_OUTLINE}>
            {pick("전체 5단계", "All 5 Levels")} ({STUDIO_COMPLETE_FEATURE_GUIDES.length})
          </button>
          {LEARNING_LEVEL_ROADMAP.map((lv) => {
            const lvProg = progress.byLevel.find((p) => p.level === lv.level);
            return (
              <button
                key={lv.level}
                type="button"
                data-testid={`level-tab-${lv.level}`}
                aria-pressed={selectedLevel === lv.level}
                onClick={() => {
                  setSelectedLevel(lv.level);
                  setSelectedStationId("all");
                  const first = STUDIO_COMPLETE_FEATURE_GUIDES.find((g) => g.level === lv.level);
                  if (first) setExpandedGuideId(first.id);
                }}
                className={selectedLevel === lv.level ? BTN_ACTIVE : BTN_OUTLINE}
              >
                <span>{lv.code}</span>
                <span className="font-mono text-[10px] tabular-nums">{lvProg ? `${lvProg.completed}/${lvProg.total}` : "0/4"}</span>
              </button>
            );
          })}
        </div>

        {activeLevelSpec ? (
          <div data-testid="active-level-banner" className="rounded-lg border border-line-strong bg-canvas px-3 py-2 text-xs [word-break:keep-all]">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <strong className="font-bold text-fg">{isEn ? activeLevelSpec.titleEn : activeLevelSpec.titleKo}</strong>
              <span className="font-mono text-[11px] text-fg-2 tabular-nums">
                {pick(`예상 ${activeLevelSpec.estimatedMinutes}분`, `Est. ${activeLevelSpec.estimatedMinutes} min`)}
              </span>
            </div>
            <p className="mt-0.5 text-fg-2">{isEn ? activeLevelSpec.outcomeEn : activeLevelSpec.outcomeKo}</p>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("사용 빈도 필터", "Feature usage frequency filter")}>
            <button type="button" data-testid="freq-filter-all" aria-pressed={selectedFrequency === "all"} onClick={() => setSelectedFrequency("all")} className={selectedFrequency === "all" ? BTN_ACTIVE : BTN_OUTLINE}>
              {pick("전체", "All")} <span className="font-mono tabular-nums">({STUDIO_COMPLETE_FEATURE_GUIDES.length})</span>
            </button>
            <button type="button" data-testid="freq-filter-daily" aria-pressed={selectedFrequency === "daily"} onClick={() => setSelectedFrequency("daily")} className={selectedFrequency === "daily" ? BTN_ACTIVE : BTN_OUTLINE}>
              {pick("매일 쓰는 핵심", "Daily Core")} <span className="font-mono tabular-nums">({progress.byFrequency.daily.total})</span>
            </button>
            <button type="button" data-testid="freq-filter-weekly" aria-pressed={selectedFrequency === "weekly"} onClick={() => setSelectedFrequency("weekly")} className={selectedFrequency === "weekly" ? BTN_ACTIVE : BTN_OUTLINE}>
              {pick("주간 활용", "Weekly")} <span className="font-mono tabular-nums">({progress.byFrequency.weekly.total})</span>
            </button>
            <button type="button" data-testid="freq-filter-hidden-gem" aria-pressed={selectedFrequency === "hidden-gem"} onClick={() => setSelectedFrequency("hidden-gem")} className={selectedFrequency === "hidden-gem" ? BTN_ACTIVE : BTN_OUTLINE}>
              <Gem className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
              {pick("숨은 고수 기능", "Hidden Gems")} <span className="font-mono tabular-nums">({progress.byFrequency.hiddenGem.total})</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={searchInputId} className="sr-only">{pick("일상어 매뉴얼 검색", "Search manual in everyday language")}</label>
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-fg-3" aria-hidden="true" />
              <input
                id={searchInputId}
                type="search"
                data-testid="manual-search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={pick("일상어로 검색: 예) 손이 떨려요, 왼손잡이, 폰에서 글자, 저작권...", "Search naturally: pressure, left-handed, 390px phone, Rights BOM...")}
                className={`min-h-11 w-full rounded-lg border border-line-strong bg-canvas pl-9 pr-10 text-xs text-fg placeholder:text-fg-3 ${FOCUS_RING}`}
              />
              {query ? (
                <button type="button" data-testid="manual-search-clear-btn" aria-label={pick("검색어 지우기", "Clear search query")} onClick={() => setQuery("")} className={`absolute right-1 inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md text-fg-2 hover:text-fg ${FOCUS_RING}`}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("자주 묻는 일상어:", "Everyday intents:")}</span>
          {EVERYDAY_QUICK_SEARCH_CHIPS.map((chip, idx) => {
            const label = isEn ? chip.queryEn : chip.queryKo;
            return (
              <button key={chip.queryKo} type="button" data-testid={`quick-chip-${idx}`} onClick={() => setQuery(label)} className={query === label ? BTN_ACTIVE : BTN_OUTLINE}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. 20종 전수 기능 카드 목록 */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
          <span data-testid="manual-result-count" className="font-semibold tabular-nums [word-break:keep-all]">
            {pick(`표시 중인 기능 가이드 ${searchHits.length} / ${STUDIO_COMPLETE_FEATURE_GUIDES.length}종`, `Showing ${searchHits.length} of ${STUDIO_COMPLETE_FEATURE_GUIDES.length} feature guides`)}
          </span>
          {(selectedLevel !== "all" || selectedFrequency !== "all" || selectedStationId !== "all" || query) ? (
            <button type="button" data-testid="manual-clear-filters-btn" onClick={handleClearFilters} className={BTN_OUTLINE}>
              {pick("필터 모두 해제", "Clear All Filters")}
            </button>
          ) : null}
        </div>

        {searchHits.length === 0 ? (
          <div data-testid="manual-empty-state" className="space-y-2 rounded-xl border border-line bg-card p-6 text-center">
            <p className="text-sm font-semibold text-fg [word-break:keep-all]">{pick("조건에 맞는 기능 가이드가 없습니다.", "No feature guides match your current filters.")}</p>
            <p className="text-xs text-fg-2 [word-break:keep-all]">{pick("검색어를 줄이거나 상단 필터를 해제하면 전체 20종 가이드를 볼 수 있습니다.", "Clear your filters or query to browse all 20 guides.")}</p>
            <button type="button" data-testid="manual-empty-reset-btn" onClick={handleClearFilters} className={BTN_SOLID}>
              {pick("전체 20종 다시 보기", "Show All 20 Guides")}
            </button>
          </div>
        ) : (
          <ul data-testid="manual-guide-list" className="space-y-2.5">
            {searchHits.map(({ guide }) => {
              const isExpanded = expandedGuideId === guide.id;
              const isCompleted = completedSet.has(guide.id);
              const freqMeta = FREQUENCY_META[guide.frequency];
              const relatedHidden = getRelatedHiddenGuides(guide.id);
              const checkboxId = `manual-cb-${guide.id}`;

              return (
                <li
                  key={guide.id}
                  data-testid={`guide-card-${guide.id}`}
                  data-frequency={guide.frequency}
                  data-level={guide.level}
                  className={`rounded-xl border p-3.5 transition-colors motion-reduce:transition-none ${isCompleted ? "border-good bg-card" : "border-line bg-card"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border border-line-strong bg-raised px-2 py-0.5 font-mono text-[10px] font-bold text-fg tabular-nums">{`Lv.${guide.level}`}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold [word-break:keep-all] ${freqMeta.badgeClass}`}>
                          {guide.frequency === "hidden-gem" ? <Gem className="h-3 w-3" aria-hidden="true" /> : null}
                          {isEn ? freqMeta.en : freqMeta.ko}
                        </span>
                        <span className="rounded-full border border-line bg-canvas px-2 py-0.5 font-mono text-[10px] font-semibold text-fg-2">{guide.atelierSuite}</span>
                        <kbd className="rounded border border-line-strong bg-raised px-1.5 py-0.5 font-mono text-[10px] font-semibold text-fg">{guide.shortcut}</kbd>
                      </div>
                      <h3 className="text-sm font-bold text-fg [word-break:keep-all]">{isEn ? guide.titleEn : guide.titleKo}</h3>
                      <p className="text-xs text-fg-2 [word-break:keep-all]">{isEn ? guide.plainOneLineEn : guide.plainOneLineKo}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor={checkboxId} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] ${isCompleted ? "border-good bg-good-soft text-good" : "border-line bg-canvas text-fg"}`}>
                        <input id={checkboxId} type="checkbox" data-testid={`guide-complete-checkbox-${guide.id}`} checked={isCompleted} onChange={() => handleToggleCompleted(guide.id)} className="h-4 w-4 accent-current" />
                        {isCompleted ? pick("실습 완료", "Done") : pick("실습 체크", "Mark Done")}
                      </label>
                      <button
                        type="button"
                        data-testid={`guide-expand-btn-${guide.id}`}
                        aria-expanded={isExpanded}
                        onClick={() => { setExpandedGuideId(isExpanded ? null : guide.id); if (!isExpanded) props.onSelectGuide?.(guide); }}
                        className={isExpanded ? BTN_ACTIVE : BTN_OUTLINE}
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                        {isExpanded ? pick("접기", "Collapse") : pick("따라하기 보기", "Step-by-Step")}
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div data-testid={`guide-details-${guide.id}`} className="mt-3 space-y-3 border-t border-line pt-3">
                      <div className="rounded-lg border border-line bg-canvas p-3 text-xs [word-break:keep-all]">
                        <strong className="font-bold text-fg">{pick("언제 쓰면 최고인가요?", "Best used when:")}</strong>{" "}
                        <span className="text-fg-2">{isEn ? guide.whenToUseEn : guide.whenToUseKo}</span>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-xs font-bold text-fg [word-break:keep-all]">
                          {pick(`클릭 단위 따라하기 (${guide.steps.length}단계)`, `Click-by-Click Walkthrough (${guide.steps.length} steps)`)}
                        </p>
                        <ol className="space-y-1.5">
                          {guide.steps.map((st) => (
                            <li key={st.stepNo} className="flex items-start gap-2.5 rounded-lg border border-line bg-canvas p-2.5 text-xs [word-break:keep-all]">
                              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[11px] font-bold text-on-accent tabular-nums">{st.stepNo}</span>
                              <div className="space-y-0.5">
                                <p className="font-bold text-fg">{isEn ? st.titleEn : st.titleKo}</p>
                                <p className="text-fg-2">{isEn ? st.actionEn : st.actionKo}</p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div className="grid gap-2.5 md:grid-cols-2">
                        <div className="rounded-lg border border-warn bg-warning-soft p-2.5 text-xs [word-break:keep-all]">
                          <p className="flex items-center gap-1 font-bold text-warn">
                            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            {pick("초보자가 자주 막히는 점 & 해결책", "Common Pitfall & Fix")}
                          </p>
                          <p className="mt-1 text-fg">{isEn ? guide.commonMistakeEn : guide.commonMistakeKo}</p>
                        </div>
                        <div className="rounded-lg border border-good bg-good-soft p-2.5 text-xs [word-break:keep-all]">
                          <p className="flex items-center gap-1 font-bold text-good">
                            <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
                            {pick("프로 작가 실전 팁", "Pro Atelier Tip")}
                          </p>
                          <p className="mt-1 text-fg">{isEn ? guide.proTipEn : guide.proTipKo}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <a href={guide.studioHref} data-testid={`guide-studio-link-${guide.id}`} className={LINK_BTN}>
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          {pick("스튜디오에서 바로 해보기", "Try Now in Studio")}
                        </a>
                        {relatedHidden.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("함께 알면 좋은 숨은 기능:", "Related hidden gems:")}</span>
                            {relatedHidden.map((rel) => (
                              <button key={rel.id} type="button" data-testid={`related-hidden-${guide.id}-${rel.id}`} onClick={() => handleJumpToGuide(rel)} className={BTN_OUTLINE}>
                                <Gem className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
                                {isEn ? rel.titleEn : rel.titleKo}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 6. JSON 내보내기 미리보기 & 상태 알림 */}
      {showJsonPreview ? (
        <div className="space-y-1.5 rounded-xl border border-line-strong bg-canvas p-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-fg-2">
            <span className="font-mono">{ATELIER_MANUAL_SCHEMA_VERSION}</span>
            <span className="font-mono tabular-nums">{exportBundle.json.length} chars</span>
          </div>
          <pre data-testid="manual-json-preview" className="max-h-56 overflow-auto rounded-lg bg-panel p-2.5 font-mono text-[11px] text-fg">
            {exportBundle.json}
          </pre>
        </div>
      ) : null}

      {statusMessage ? (
        <p role="status" aria-live="polite" data-testid="manual-status-message" className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
          {statusMessage}
        </p>
      ) : null}
    </section>
  );
}
