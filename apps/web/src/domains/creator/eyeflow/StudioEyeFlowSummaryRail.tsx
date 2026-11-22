/**
 * 시선 동선(Eye-Flow) 및 말풍선 꼬리 얼굴/눈 가림 요약 진단 레일.
 *
 * 캔버스/뷰포트 바깥 사이드 영역에 배치되어 작업 캔버스 점유율(`>= 82%`)을 침범하지 않는다.
 * 모든 인터랙션 버튼은 `min-h-11`(44px 이상) 터치 타깃, 시맨틱 색상 토큰,
 * `motion-reduce:transition-none` 및 한글 우선 문구를 따른다.
 */
import { AlertTriangle, CircleAlert, Eye, EyeOff, Route, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { useState, type ReactElement } from "react";

import type { MultiPageEyeFlowSummary } from "./studio-eyeflow-page-adapter";
import type { CutRhythmPresetId, EyeFlowReadingDirection } from "./studio-eyeflow-types";

import { cn } from "@/shared/lib/utils";

export interface StudioEyeFlowSummaryRailProps {
  readonly summary: MultiPageEyeFlowSummary;
  readonly pageLabels: ReadonlyMap<string, string>;
  readonly overlayVisible: boolean;
  readonly onToggleOverlay: () => void;
  readonly direction: EyeFlowReadingDirection;
  readonly onChangeDirection: (next: EyeFlowReadingDirection) => void;
  readonly onJumpToPage?: (pageId: string) => void;
  readonly activeRhythmPreset?: CutRhythmPresetId | null;
  readonly onApplyRhythmPreset?: (preset: CutRhythmPresetId) => void;
  readonly className?: string;
}

const DIRECTION_OPTIONS: ReadonlyArray<{
  readonly id: EyeFlowReadingDirection;
  readonly label: string;
}> = [
  { id: "ltr-ttb", label: "좌→우 웹툰" },
  { id: "rtl-ttb", label: "우→좌 만화" },
];

export function StudioEyeFlowSummaryRail({
  summary,
  pageLabels,
  overlayVisible,
  onToggleOverlay,
  direction,
  onChangeDirection,
  onJumpToPage,
  activeRhythmPreset,
  onApplyRhythmPreset,
  className,
}: StudioEyeFlowSummaryRailProps): ReactElement {
  const [selectedRhythmPreview, setSelectedRhythmPreview] = useState<CutRhythmPresetId>(
    activeRhythmPreset ?? "tension-escalation",
  );
  const effectiveRhythmPreset = activeRhythmPreset ?? selectedRhythmPreview;
  const activeRhythmSummary = summary.rhythmPreviews.find(
    (entry) => entry.preset === effectiveRhythmPreset,
  );

  const handleSelectRhythm = (preset: CutRhythmPresetId): void => {
    setSelectedRhythmPreview(preset);
    onApplyRhythmPreset?.(preset);
  };

  const hasCritical = summary.criticalCount > 0;
  const hasWarning = summary.warningCount > 0;
  const statusLabel = hasCritical ? "수정 필요" : hasWarning ? "주의" : "양호";
  const statusBadgeClass = hasCritical
    ? "bg-bad/15 text-bad border-bad/40"
    : hasWarning
      ? "bg-warn/15 text-warn border-warn/40"
      : "bg-accent-soft text-accent border-accent/30";

  return (
    <section
      aria-label="시선 동선 및 꼬리 가림 점검"
      data-studio-eyeflow-rail="true"
      className={cn(
        "rounded-xl border border-line bg-panel/95 p-3 text-fg shadow-sm [word-break:keep-all]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Route size={14} aria-hidden className="shrink-0 text-accent" />
          <h3 className="truncate text-sm font-bold text-fg">시선 동선 · 꼬리 가드</h3>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
            statusBadgeClass,
          )}
        >
          {summary.overallScore}점 · {statusLabel}
        </span>
      </div>

      {/* 오버레이 토글 + 읽기 방향 전환 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-pressed={overlayVisible}
          onClick={onToggleOverlay}
          className={cn(
            "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            overlayVisible
              ? "border-accent bg-accent text-on-accent"
              : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
          )}
        >
          {overlayVisible ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
          <span>{overlayVisible ? "동선 안내선 끄기" : "동선 안내선 켜기"}</span>
        </button>

        <div
          role="group"
          aria-label="시선 동선 읽기 방향"
          className="inline-flex min-h-11 items-center overflow-hidden rounded-lg border border-line bg-card p-0.5"
        >
          {DIRECTION_OPTIONS.map((option) => {
            const active = direction === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChangeDirection(option.id)}
                className={cn(
                  "min-h-11 rounded-md px-2 text-xs font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 핵심 카운터 요약 */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <div className="rounded-lg border border-line bg-card px-2 py-1.5">
          <p className="text-xs text-fg-3">시선 역주행</p>
          <p
            className={cn(
              "mt-0.5 text-xs font-bold tabular-nums",
              summary.reversalCount > 0 ? "text-warn" : "text-fg",
            )}
          >
            {summary.reversalCount}건
          </p>
        </div>
        <div className="rounded-lg border border-line bg-card px-2 py-1.5">
          <p className="text-xs text-fg-3">얼굴·눈 가림</p>
          <p
            className={cn(
              "mt-0.5 text-xs font-bold tabular-nums",
              summary.occlusionCount > 0 ? "text-bad" : "text-fg",
            )}
          >
            {summary.occlusionCount}건
          </p>
        </div>
        <div className="rounded-lg border border-line bg-card px-2 py-1.5">
          <p className="text-xs text-fg-3">꼬리 교차</p>
          <p
            className={cn(
              "mt-0.5 text-xs font-bold tabular-nums",
              summary.tailCrossingCount > 0 ? "text-bad" : "text-fg",
            )}
          >
            {summary.tailCrossingCount}건
          </p>
        </div>
      </div>

      {/* 1클릭 3종 리듬 변환 + 390×844 모바일 스포일러 가드 */}
      {summary.rhythmPreviews.length > 0 ? (
        <div
          data-studio-eyeflow-rhythm="true"
          className="mt-2.5 rounded-lg border border-line bg-card p-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-fg">
              <Sparkles size={13} aria-hidden className="text-accent" />
              1클릭 컷 리듬
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-fg-3">
              <Smartphone size={12} aria-hidden />
              390×844 가드{" "}
              {summary.spoilerRiskCount > 0 ? `${summary.spoilerRiskCount}건` : "안전"}
            </span>
          </div>
          <div
            role="group"
            aria-label="1클릭 컷 리듬 프리셋"
            className="mt-1.5 grid grid-cols-3 gap-1"
          >
            {summary.rhythmPreviews.map((presetEntry) => {
              const active = effectiveRhythmPreset === presetEntry.preset;
              return (
                <button
                  key={presetEntry.preset}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleSelectRhythm(presetEntry.preset)}
                  className={cn(
                    "min-h-11 rounded-md border px-1.5 text-[11px] font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                    active
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {presetEntry.labelKo}
                </button>
              );
            })}
          </div>
          {activeRhythmSummary ? (
            <p className="mt-1.5 text-[11px] leading-4 text-fg-3 tabular-nums">
              {activeRhythmSummary.summaryKo}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 진단 항목 목록 */}
      <div className="mt-2.5 space-y-1.5">
        {summary.totalBalloons === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-2.5 py-2.5 text-xs leading-5 text-fg-3">
            말풍선을 배치하면 Z-패턴 시선 흐름과 얼굴 가림을 자동으로 점검합니다.
          </p>
        ) : summary.issues.length === 0 ? (
          <p className="flex items-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 py-2.5 text-xs leading-5 text-fg-2">
            <ShieldCheck size={14} aria-hidden className="shrink-0 text-accent" />
            <span>말풍선 {summary.totalBalloons}개의 시선 동선과 꼬리 배치가 안전합니다.</span>
          </p>
        ) : (
          <ul className="max-h-56 space-y-1.5 overflow-y-auto">
            {summary.issues.map((issue) => {
              const pageLabel = pageLabels.get(issue.pageId) ?? issue.pageId;
              return (
                <li key={issue.id}>
                  <button
                    type="button"
                    disabled={!onJumpToPage}
                    onClick={() => onJumpToPage?.(issue.pageId)}
                    className="block min-h-11 w-full rounded-lg border border-line bg-card px-2.5 py-2 text-left transition-colors duration-150 motion-reduce:transition-none hover:bg-raised disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <div className="flex items-start gap-2">
                      {issue.severity === "critical" ? (
                        <CircleAlert size={14} aria-hidden className="mt-0.5 shrink-0 text-bad" />
                      ) : (
                        <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0 text-warn" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold leading-5 text-fg">
                          {issue.messageKo}
                          <span className="ml-1 font-normal text-fg-3">· {pageLabel}</span>
                        </p>
                        <p className="mt-0.5 text-xs leading-5 text-fg-3">{issue.detailKo}</p>
                        {issue.recommendedTailTip ? (
                          <p className="mt-1 text-xs font-semibold tabular-nums text-good">
                            권장 꼬리 끝 ({Math.round(issue.recommendedTailTip.x)},{" "}
                            {Math.round(issue.recommendedTailTip.y)})
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
