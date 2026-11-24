/**
 * 웹툰 1~60컷 전 에피소드 자동 연속성 감시관(Webtoon Continuity Guard) 스튜디오 패널.
 *
 * - props 없이 단독 렌더링 가능하며 60컷 타임라인 스캔·4대 연속성 오류 카드·원클릭 자동 교정을 제공한다.
 * - Calm Atelier 시맨틱 토큰 전용 (원시 색상 0건 · 브라우저 Web Storage 미사용 · KO/EN).
 */

import {
  AlertTriangle,
  CheckCircle2,
  FlipHorizontal2,
  Moon,
  PackageX,
  Palette,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Wand2,
} from "lucide-react";
import { useCallback, useMemo, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  analyzeEpisodeContinuity,
  applyAllContinuityFixes,
  applyContinuityFix,
  createDemo60CutEpisode,
  formatOklchCss,
  formatOklchSummary,
  type AttachmentSide,
  type ContinuityGateStatus,
  type ContinuityGuardConfig,
  type ContinuityIssue,
  type ContinuityIssueCategory,
  type ContinuityScanReport,
  type ContinuitySeverity,
  type CutSceneTag,
  type WebtoonCutSnapshot,
  type WebtoonEpisodeTimeline,
} from "./webtoon-continuity-guard";

export interface StudioWebtoonContinuityGuardPanelProps {
  readonly locale?: "ko" | "en";
  readonly initialEpisode?: WebtoonEpisodeTimeline;
  readonly config?: Partial<ContinuityGuardConfig>;
  readonly className?: string;
  readonly onEpisodeChange?: (
    episode: WebtoonEpisodeTimeline,
    report: ContinuityScanReport,
  ) => void;
}

type CategoryFilter = "all" | ContinuityIssueCategory;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const BTN_SECONDARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const CHIP_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const CATEGORY_ORDER: readonly ContinuityIssueCategory[] = [
  "prop-continuity",
  "left-right-flip",
  "color-shift",
  "lighting-direction",
];

function gateBadgeTone(status: ContinuityGateStatus): string {
  if (status === "pass") return "border-good/40 bg-good-soft text-good";
  if (status === "warn") return "border-warn/40 bg-warning-soft text-warn";
  return "border-bad/40 bg-bad-soft text-bad";
}

function severityBadgeTone(severity: ContinuitySeverity): string {
  if (severity === "critical") return "border-bad/40 bg-bad-soft text-bad";
  if (severity === "warning") return "border-warn/40 bg-warning-soft text-warn";
  return "border-cool/40 bg-cool/15 text-cool";
}

function categoryMeta(
  category: ContinuityIssueCategory,
  isEn: boolean,
): { readonly label: string; readonly shortLabel: string } {
  switch (category) {
    case "prop-continuity":
      return {
        label: isEn ? "Prop Vanish / Pop-in" : "소품 증발·돌연 출현",
        shortLabel: isEn ? "Props" : "소품",
      };
    case "left-right-flip":
      return {
        label: isEn ? "Left-Right Flip" : "좌우 반전 오류",
        shortLabel: isEn ? "L↔R Flip" : "좌우 반전",
      };
    case "color-shift":
      return {
        label: isEn ? "Color Shift (ΔE00)" : "의상·헤어 색감 급변",
        shortLabel: isEn ? "Color ΔE00" : "색감 ΔE00",
      };
    case "lighting-direction":
      return {
        label: isEn ? "Key Light Jump" : "조명 방향 불일치",
        shortLabel: isEn ? "Lighting" : "조명 방향",
      };
  }
}

function CategoryIcon({ category }: { readonly category: ContinuityIssueCategory }): ReactElement {
  switch (category) {
    case "prop-continuity":
      return <PackageX className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "left-right-flip":
      return <FlipHorizontal2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "color-shift":
      return <Palette className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "lighting-direction":
      return <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
}

function formatSeverityLabel(severity: ContinuitySeverity, isEn: boolean): string {
  if (severity === "critical") return isEn ? "Critical" : "심각";
  if (severity === "warning") return isEn ? "Warning" : "주의";
  return isEn ? "Minor" : "경미";
}

function formatGateLabel(status: ContinuityGateStatus, isEn: boolean): string {
  if (status === "pass") return isEn ? "PASS" : "통과 (PASS)";
  if (status === "warn") return isEn ? "WARN" : "주의 (WARN)";
  return isEn ? "FAIL" : "교정 필요 (FAIL)";
}

function formatSideLabel(side: AttachmentSide | undefined, isEn: boolean): string {
  if (!side) return isEn ? "Unspecified" : "미지정";
  if (side === "left") return isEn ? "Left" : "좌측";
  if (side === "right") return isEn ? "Right" : "우측";
  if (side === "both") return isEn ? "Both" : "양측";
  return isEn ? "Center" : "중앙";
}

function formatSceneTagLabel(tag: CutSceneTag, isEn: boolean): string {
  const map: Readonly<Record<CutSceneTag, readonly [string, string]>> = {
    day: ["주간", "Day"],
    indoor: ["실내", "Indoor"],
    sunset: ["노을", "Sunset"],
    night: ["야간 · 색감 예외", "Night · Color Exempt"],
    flashback: ["회상 · 색감 예외", "Flashback · Color Exempt"],
    dream: ["꿈 · 색감 예외", "Dream · Color Exempt"],
    monochrome: ["흑백 · 색감 예외", "Monochrome · Exempt"],
    "costume-change": ["의상 교체", "Costume Change"],
    "mirror-reflection": ["거울 반사 예외", "Mirror Exempt"],
    "lighting-shift-intentional": ["연출 조명 전환", "Intentional Light Shift"],
  };
  const [ko, en] = map[tag];
  return isEn ? en : ko;
}

function cutCellTone(
  cut: WebtoonCutSnapshot,
  cutIssues: readonly ContinuityIssue[] | undefined,
  isSelected: boolean,
): string {
  const hasCritical = cutIssues?.some((i) => i.severity === "critical") ?? false;
  const hasWarning = (cutIssues?.length ?? 0) > 0 && !hasCritical;
  const isExemptMood = cut.sceneTags.includes("night") || cut.sceneTags.includes("flashback");

  if (isSelected) {
    return "border-accent bg-accent text-on-accent";
  }
  if (hasCritical) {
    return "border-bad/50 bg-bad-soft text-bad hover:border-bad";
  }
  if (hasWarning) {
    return "border-warn/50 bg-warning-soft text-warn hover:border-warn";
  }
  if (isExemptMood) {
    return "border-cool/40 bg-cool/15 text-cool hover:border-cool";
  }
  return "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg";
}

function formatCutCode(cutNumber: number): string {
  return String(cutNumber).padStart(2, "0");
}

/** 웹툰 1~60컷+ 전 에피소드 자동 연속성 감시관 단독 스튜디오 패널. */
export function StudioWebtoonContinuityGuardPanel({
  locale,
  initialEpisode,
  config,
  className = "",
  onEpisodeChange,
}: StudioWebtoonContinuityGuardPanelProps = {}): ReactElement {
  const storeLang = useI18n((state) => state.lang);
  const isEn = (locale ?? (storeLang.toLowerCase().startsWith("en") ? "en" : "ko")) === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [episode, setEpisode] = useState<WebtoonEpisodeTimeline>(
    () => initialEpisode ?? createDemo60CutEpisode(),
  );
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [selectedCutNumber, setSelectedCutNumber] = useState<number | null>(null);
  const [appliedFixCount, setAppliedFixCount] = useState<number>(0);
  const [scanRevision, setScanRevision] = useState<number>(1);
  const [statusNotice, setStatusNotice] = useState<string>("");

  const report = useMemo<ContinuityScanReport>(() => {
    void scanRevision;
    return analyzeEpisodeContinuity(episode, config);
  }, [config, episode, scanRevision]);

  const filteredIssues = useMemo<readonly ContinuityIssue[]>(() => {
    return report.issues.filter((issue) => {
      if (categoryFilter !== "all" && issue.category !== categoryFilter) return false;
      if (selectedCutNumber !== null && issue.cutNumber !== selectedCutNumber) return false;
      return true;
    });
  }, [categoryFilter, report.issues, selectedCutNumber]);

  const selectedCut = useMemo<WebtoonCutSnapshot | null>(() => {
    if (selectedCutNumber === null) return null;
    return episode.cuts.find((c) => c.cutNumber === selectedCutNumber) ?? null;
  }, [episode.cuts, selectedCutNumber]);

  const handleRescan = useCallback(() => {
    setScanRevision((rev) => rev + 1);
    const fresh = analyzeEpisodeContinuity(episode, config);
    setStatusNotice(
      isEn
        ? `Rescanned ${fresh.totalCuts} cuts: ${fresh.issues.length} continuity issues found (${fresh.exemptedColorTransitions.length} night/flashback transitions exempted).`
        : `전 ${fresh.totalCuts}컷 재스캔 완료: 연속성 오류 ${fresh.issues.length}건 적발 (야간·회상 색감 예외 ${fresh.exemptedColorTransitions.length}건).`,
    );
    onEpisodeChange?.(episode, fresh);
  }, [config, episode, isEn, onEpisodeChange]);

  const handleApplySingleFix = useCallback(
    (issue: ContinuityIssue) => {
      const result = applyContinuityFix(episode, issue, config);
      if (!result.applied) return;
      setEpisode(result.episode);
      setAppliedFixCount((count) => count + 1);
      setStatusNotice(
        isEn
          ? `Fixed: ${result.descriptionEn} · ${result.report.issues.length} issues remaining.`
          : `교정 완료: ${result.descriptionKo} · 잔여 오류 ${result.report.issues.length}건.`,
      );
      onEpisodeChange?.(result.episode, result.report);
    },
    [config, episode, isEn, onEpisodeChange],
  );

  const handleApplyAllFixes = useCallback(() => {
    const batch = applyAllContinuityFixes(episode, config);
    if (batch.appliedPatches.length === 0) return;
    setEpisode(batch.episode);
    setAppliedFixCount((count) => count + batch.appliedPatches.length);
    setStatusNotice(
      isEn
        ? `Applied ${batch.appliedPatches.length} automatic fixes across ${batch.report.totalCuts} cuts · ${batch.remainingIssueCount} issues remaining.`
        : `전 ${batch.report.totalCuts}컷 일괄 자동 교정 ${batch.appliedPatches.length}건 완료 · 잔여 오류 ${batch.remainingIssueCount}건.`,
    );
    onEpisodeChange?.(batch.episode, batch.report);
  }, [config, episode, isEn, onEpisodeChange]);

  const handleResetEpisode = useCallback(() => {
    const freshEpisode = initialEpisode ?? createDemo60CutEpisode();
    const freshReport = analyzeEpisodeContinuity(freshEpisode, config);
    setEpisode(freshEpisode);
    setCategoryFilter("all");
    setSelectedCutNumber(null);
    setAppliedFixCount(0);
    setStatusNotice(
      isEn
        ? `Reset timeline to initial state (${freshReport.issues.length} issues detected).`
        : `타임라인을 초기 스냅샷으로 복원했습니다(적발 오류 ${freshReport.issues.length}건).`,
    );
    onEpisodeChange?.(freshEpisode, freshReport);
  }, [config, initialEpisode, isEn, onEpisodeChange]);

  const GateIcon =
    report.status === "pass"
      ? ShieldCheck
      : report.status === "warn"
        ? AlertTriangle
        : ShieldAlert;

  return (
    <section
      data-testid="webtoon-continuity-guard-panel"
      aria-label={pick("웹툰 전 컷 자동 연속성 감시관", "Webtoon Continuity Guard")}
      className={`space-y-4 rounded-xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className}`}
    >
      {/* 헤더 및 주요 실행 바 */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg">
              {pick("웹툰 자동 연속성 감시관", "Webtoon Continuity Guard")}
            </h2>
            <span
              data-testid="continuity-gate-status"
              role="status"
              aria-live="polite"
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums ${gateBadgeTone(report.status)}`}
            >
              <GateIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {formatGateLabel(report.status, isEn)}
            </span>
            <span
              data-testid="continuity-score-badge"
              className="inline-flex items-center rounded-full border border-line bg-card px-2.5 py-0.5 text-xs font-semibold text-fg tabular-nums"
            >
              {pick(`연속성 ${report.score}/100`, `Integrity ${report.score}/100`)}
            </span>
          </div>
          <p className="text-xs text-fg-2">
            {pick(
              `${report.episodeTitleKo} · 소품 증발/출현 · 좌우 반전 · OKLCH ΔE00 색감 · 주광원 방위각 자동 감사`,
              `${report.episodeTitleEn} · Auto-audit for props, L↔R flips, OKLCH ΔE00 color drift, and key light azimuth`,
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="continuity-rescan-btn"
            onClick={handleRescan}
            className={BTN_SECONDARY}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {pick(`전체 ${report.totalCuts}컷 재스캔`, `Rescan ${report.totalCuts} Cuts`)}
          </button>
          <button
            type="button"
            data-testid="continuity-fix-all-btn"
            onClick={handleApplyAllFixes}
            disabled={report.issues.length === 0}
            className={BTN_PRIMARY}
          >
            <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
            {pick(
              `일괄 자동 교정 (${report.issues.length}건)`,
              `Fix All (${report.issues.length})`,
            )}
          </button>
          {appliedFixCount > 0 ? (
            <button
              type="button"
              data-testid="continuity-reset-btn"
              onClick={handleResetEpisode}
              className={BTN_SECONDARY}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("초기화", "Reset")}
            </button>
          ) : null}
        </div>
      </header>

      {/* 실시간 교정 알림 */}
      {statusNotice ? (
        <div
          data-testid="continuity-status-notice"
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-xs font-medium text-fg"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
          <span>{statusNotice}</span>
        </div>
      ) : null}

      {/* 4대 연속성 오류 카테고리 필터 + 야간/회상 예외 카운터 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label={pick("연속성 오류 분류 필터", "Continuity issue category filters")}
          className="flex flex-wrap items-center gap-1.5"
        >
          <button
            type="button"
            data-testid="continuity-filter-all"
            aria-pressed={categoryFilter === "all"}
            onClick={() => setCategoryFilter("all")}
            className={`${CHIP_BASE} ${
              categoryFilter === "all"
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
            }`}
          >
            <span>{pick("전체", "All")}</span>
            <span className="tabular-nums">({report.issues.length})</span>
          </button>

          {CATEGORY_ORDER.map((cat) => {
            const count = report.countsByCategory[cat];
            const active = categoryFilter === cat;
            const meta = categoryMeta(cat, isEn);
            return (
              <button
                key={cat}
                type="button"
                data-testid={`continuity-filter-${cat}`}
                aria-pressed={active}
                onClick={() => setCategoryFilter(cat)}
                className={`${CHIP_BASE} ${
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"
                }`}
              >
                <CategoryIcon category={cat} />
                <span>{meta.shortLabel}</span>
                <span className="tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>

        <span
          data-testid="continuity-exempt-badge"
          className="inline-flex items-center gap-1.5 rounded-full border border-cool/40 bg-cool/15 px-2.5 py-1 text-xs font-medium text-cool tabular-nums"
        >
          <Moon className="h-3.5 w-3.5" aria-hidden="true" />
          {pick(
            `야간·회상 색감 예외 ${report.exemptedColorTransitions.length}건`,
            `Night/Flashback Exempt: ${report.exemptedColorTransitions.length}`,
          )}
        </span>
      </div>

      {/* 1~60컷+ 타임라인 히트맵 스트립 */}
      <div className="space-y-2 rounded-lg border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-fg">
            {pick(
              `에피소드 타임라인 맵 (${report.scannedCutRange[0]}~${report.scannedCutRange[1]}컷 · 클릭해 컷 상세 점검)`,
              `Episode Timeline Map (Cuts #${report.scannedCutRange[0]}–#${report.scannedCutRange[1]} · Click to inspect)`,
            )}
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-fg-2">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-bad" aria-hidden="true" />
              {pick(`심각 ${report.countsBySeverity.critical}`, `Critical ${report.countsBySeverity.critical}`)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-warn" aria-hidden="true" />
              {pick(`주의 ${report.countsBySeverity.warning}`, `Warn ${report.countsBySeverity.warning}`)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-cool" aria-hidden="true" />
              {pick("야간·회상 예외", "Night/Flashback")}
            </span>
          </div>
        </div>

        <div
          data-testid="continuity-timeline-grid"
          className="grid grid-cols-6 gap-1 sm:grid-cols-10 md:grid-cols-12"
        >
          {episode.cuts.map((cut) => {
            const cutIssues = report.issuesByCut[cut.cutNumber];
            const issueCount = cutIssues?.length ?? 0;
            const isSelected = selectedCutNumber === cut.cutNumber;
            const isExemptMood =
              cut.sceneTags.includes("night") || cut.sceneTags.includes("flashback");
            return (
              <button
                key={cut.cutNumber}
                type="button"
                data-testid={`continuity-cut-cell-${cut.cutNumber}`}
                aria-pressed={isSelected}
                aria-label={pick(
                  `${cut.cutNumber}컷 (${cut.sceneNameKo}) 오류 ${issueCount}건`,
                  `Cut ${cut.cutNumber} (${cut.sceneNameEn}), ${issueCount} issues`,
                )}
                onClick={() =>
                  setSelectedCutNumber((prev) => (prev === cut.cutNumber ? null : cut.cutNumber))
                }
                className={`flex min-h-9 cursor-pointer flex-col items-center justify-center rounded-md border px-1 py-1 text-[11px] font-semibold tabular-nums transition-colors motion-reduce:transition-none ${cutCellTone(cut, cutIssues, isSelected)} ${FOCUS_RING}`}
              >
                <span>{formatCutCode(cut.cutNumber)}</span>
                {issueCount > 0 ? (
                  <span className="text-[10px] leading-none">
                    {pick(`${issueCount}건`, `${issueCount}!`)}
                  </span>
                ) : isExemptMood ? (
                  <span className="text-[10px] leading-none">
                    {cut.sceneTags.includes("night")
                      ? pick("야간", "NGT")
                      : pick("회상", "FLB")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* 선택된 컷 스냅샷 상세 인스펙터 */}
        {selectedCut ? (
          <div
            data-testid="continuity-cut-inspector"
            className="mt-2 space-y-2 rounded-lg border border-line bg-canvas p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <strong className="font-semibold text-fg tabular-nums">
                  {pick(`#${formatCutCode(selectedCut.cutNumber)}컷 스냅샷`, `Cut #${formatCutCode(selectedCut.cutNumber)} Snapshot`)}
                </strong>
                <span className="text-fg-2">
                  {isEn ? selectedCut.sceneNameEn : selectedCut.sceneNameKo}
                </span>
                {selectedCut.sceneTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-line bg-raised px-2 py-0.5 text-[11px] text-fg-2"
                  >
                    {formatSceneTagLabel(tag, isEn)}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-fg-2 tabular-nums">
                  {pick(
                    `주광원 방위 ${Math.round(selectedCut.keyLight.azimuthDeg)}° · 고도 ${selectedCut.keyLight.elevationDeg}°`,
                    `Key Light Az ${Math.round(selectedCut.keyLight.azimuthDeg)}° · Elev ${selectedCut.keyLight.elevationDeg}°`,
                  )}
                </span>
                <button
                  type="button"
                  data-testid="continuity-clear-cut-filter"
                  onClick={() => setSelectedCutNumber(null)}
                  className={`inline-flex min-h-8 cursor-pointer items-center rounded-md border border-line bg-card px-2 py-1 text-[11px] font-semibold text-fg-2 transition-colors motion-reduce:transition-none hover:bg-raised hover:text-fg ${FOCUS_RING}`}
                >
                  {pick("전체 컷 보기", "All Cuts")}
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {selectedCut.characters.map((char) => (
                <div
                  key={char.characterId}
                  className="space-y-1.5 rounded-md border border-line bg-card p-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-fg">
                      {isEn ? char.nameEn : char.nameKo}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span
                        title={formatOklchSummary(char.outfitColor)}
                        className="inline-block h-3.5 w-3.5 rounded-sm border border-line-strong"
                        style={{ backgroundColor: formatOklchCss(char.outfitColor) }}
                      />
                      <span
                        title={formatOklchSummary(char.hairColor)}
                        className="inline-block h-3.5 w-3.5 rounded-full border border-line-strong"
                        style={{ backgroundColor: formatOklchCss(char.hairColor) }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[11px] text-fg-2">
                    {char.props.length === 0 ? (
                      <span>{pick("착용 소품 없음", "No props")}</span>
                    ) : (
                      char.props.map((prop) => (
                        <span
                          key={prop.id}
                          className="rounded border border-line bg-raised px-1.5 py-0.5"
                        >
                          {isEn ? prop.labelEn : prop.labelKo}
                          {prop.side ? ` (${formatSideLabel(prop.side, isEn)})` : ""}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* 적발된 연속성 오류 카드 목록 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-fg tabular-nums">
            {selectedCutNumber !== null
              ? pick(
                  `#${formatCutCode(selectedCutNumber)}컷 연속성 오류 (${filteredIssues.length}건)`,
                  `Cut #${formatCutCode(selectedCutNumber)} Continuity Issues (${filteredIssues.length})`,
                )
              : pick(
                  `적발된 연속성 오류 (${filteredIssues.length}건)`,
                  `Detected Continuity Issues (${filteredIssues.length})`,
                )}
          </h3>
          {appliedFixCount > 0 ? (
            <span
              data-testid="continuity-applied-count"
              className="text-xs font-medium text-good tabular-nums"
            >
              {pick(`자동 교정 ${appliedFixCount}건 적용됨`, `${appliedFixCount} auto-fixes applied`)}
            </span>
          ) : null}
        </div>

        {filteredIssues.length === 0 ? (
          <div
            data-testid="continuity-empty-pass"
            className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-good/40 bg-good-soft px-4 py-6 text-center"
          >
            <CheckCircle2 className="h-5 w-5 text-good" aria-hidden="true" />
            <p className="text-xs font-semibold text-good">
              {report.issues.length === 0
                ? pick(
                    `전 ${report.totalCuts}컷 연속성 검사 통과 · 적발된 오류가 없습니다.`,
                    `All ${report.totalCuts} cuts passed continuity checks · 0 issues detected.`,
                  )
                : pick(
                    "선택한 조건에서 적발된 연속성 오류가 없습니다.",
                    "No continuity issues match the current filter.",
                  )}
            </p>
          </div>
        ) : (
          <ul data-testid="continuity-issue-list" className="space-y-2">
            {filteredIssues.map((issue) => {
              const catInfo = categoryMeta(issue.category, isEn);
              return (
                <li
                  key={issue.id}
                  data-testid={`continuity-issue-card-${issue.id}`}
                  className="rounded-lg border border-line bg-card p-3 transition-colors motion-reduce:transition-none hover:border-line-strong"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md border border-line bg-raised px-2 py-0.5 text-xs font-semibold text-fg tabular-nums">
                          {pick(
                            `#${formatCutCode(issue.previousCutNumber)} → #${formatCutCode(issue.cutNumber)}컷`,
                            `Cut #${formatCutCode(issue.previousCutNumber)} → #${formatCutCode(issue.cutNumber)}`,
                          )}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityBadgeTone(issue.severity)}`}
                        >
                          {formatSeverityLabel(issue.severity, isEn)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] font-medium text-fg-2">
                          <CategoryIcon category={issue.category} />
                          {catInfo.label}
                        </span>
                        <span className="text-[11px] text-fg-3">
                          {isEn ? issue.sceneNameEn : issue.sceneNameKo}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-fg">
                        {isEn ? issue.titleEn : issue.titleKo}
                      </p>
                      <p className="text-xs leading-relaxed text-fg-2">
                        {isEn ? issue.detailEn : issue.detailKo}
                      </p>

                      {/* 오류 유형별 실측 근거 배지 */}
                      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-fg-2 tabular-nums">
                        {issue.category === "color-shift" &&
                        issue.metrics.previousColor &&
                        issue.metrics.currentColor ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-1">
                            <span
                              aria-hidden="true"
                              className="inline-block h-3.5 w-3.5 rounded-sm border border-line-strong"
                              style={{ backgroundColor: formatOklchCss(issue.metrics.previousColor) }}
                            />
                            <span>→</span>
                            <span
                              aria-hidden="true"
                              className="inline-block h-3.5 w-3.5 rounded-sm border border-line-strong"
                              style={{ backgroundColor: formatOklchCss(issue.metrics.currentColor) }}
                            />
                            <strong className="text-fg">
                              ΔE00 {issue.metrics.deltaE00?.toFixed(2)}
                            </strong>
                            <span>
                              ({pick("허용", "Limit")} &lt; {issue.metrics.thresholdDeltaE00})
                            </span>
                          </span>
                        ) : null}

                        {issue.category === "lighting-direction" &&
                        issue.metrics.previousAzimuthDeg !== undefined &&
                        issue.metrics.currentAzimuthDeg !== undefined ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-1">
                            <Sun className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
                            <span>
                              {pick("방위각", "Azimuth")} {issue.metrics.previousAzimuthDeg}° →{" "}
                              {issue.metrics.currentAzimuthDeg}°
                            </span>
                            <strong className="text-fg">
                              (Δ{issue.metrics.azimuthDeltaDeg}°)
                            </strong>
                          </span>
                        ) : null}

                        {issue.category === "left-right-flip" &&
                        issue.metrics.previousSide &&
                        issue.metrics.currentSide ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-1">
                            <FlipHorizontal2 className="h-3.5 w-3.5 text-warn" aria-hidden="true" />
                            <span>
                              {formatSideLabel(issue.metrics.previousSide, isEn)} →{" "}
                              {formatSideLabel(issue.metrics.currentSide, isEn)}
                            </span>
                          </span>
                        ) : null}

                        {issue.category === "prop-continuity" && issue.metrics.propLabelKo ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-1">
                            <PackageX className="h-3.5 w-3.5 text-bad" aria-hidden="true" />
                            <span>
                              {isEn ? issue.metrics.propLabelEn : issue.metrics.propLabelKo}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <button
                        type="button"
                        data-testid={`continuity-fix-btn-${issue.id}`}
                        onClick={() => handleApplySingleFix(issue)}
                        className={BTN_PRIMARY}
                      >
                        <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {pick("원클릭 자동 교정", "Apply Auto-Fix")}
                      </button>
                      <span className="max-w-52 text-right text-[11px] text-fg-3">
                        {isEn ? issue.fixPatch.summaryEn : issue.fixPatch.summaryKo}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
