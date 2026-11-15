import { CheckCircle2, RotateCcw, Scissors, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cx } from "@/shared/lib/cx";
import { formatNumber } from "@toonstudio/core/format";
import { planStripSlices, type ExportPreset, type StripSlice } from "./studio-export-presets";
import {
  adjustSingleSliceBoundary,
  analyzeStripSlicePlan,
  buildInspectableStripModel,
  planSmartStripSliceBoundaries,
  stripSlicesToBoundaries,
  type SliceInspectablePageLike,
} from "./studio-smart-slice-boundaries";

export interface StudioResolvedPresetSlices {
  readonly current?: readonly StripSlice[];
  readonly all?: readonly StripSlice[];
}

export interface StudioSliceBoundaryInspectorProps {
  readonly preset: ExportPreset;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly exportScale: number;
  readonly pageCount: number;
  readonly activePageIndex: number;
  readonly selectedPageIndices: readonly number[];
  readonly pages: readonly SliceInspectablePageLike[] | null | undefined;
  readonly onResolvedSlicesChange: (resolved: StudioResolvedPresetSlices) => void;
}

export function StudioSliceBoundaryInspector({
  preset,
  canvasWidth,
  canvasHeight,
  exportScale,
  pageCount,
  activePageIndex,
  selectedPageIndices,
  pages,
  onResolvedSlicesChange,
}: StudioSliceBoundaryInspectorProps) {
  const safeActiveIndex = Math.max(0, Math.min(Math.max(0, (pages?.length ?? pageCount) - 1), activePageIndex));

  const currentPages = useMemo<readonly SliceInspectablePageLike[]>(() => {
    const active = pages?.[safeActiveIndex];
    if (active) {
      return [{ ...active, canvasH: active.canvasH ?? canvasHeight }];
    }
    return [{ id: `page-${safeActiveIndex + 1}`, canvasH: canvasHeight, elements: [] }];
  }, [canvasHeight, pages, safeActiveIndex]);

  const allPages = useMemo<readonly SliceInspectablePageLike[]>(() => {
    const indices =
      selectedPageIndices.length > 0
        ? selectedPageIndices
        : Array.from({ length: Math.max(1, pageCount) }, (_, idx) => idx);
    return indices.map((idx) => {
      const found = pages?.[idx];
      return found
        ? { ...found, canvasH: found.canvasH ?? canvasHeight }
        : { id: `page-${idx + 1}`, canvasH: canvasHeight, elements: [] };
    });
  }, [canvasHeight, pageCount, pages, selectedPageIndices]);

  const currentModel = useMemo(
    () =>
      buildInspectableStripModel({
        pages: currentPages,
        sourceCanvasWidth: canvasWidth,
        fallbackPageHeight: canvasHeight,
        exportScale,
        preset,
      }),
    [canvasHeight, canvasWidth, currentPages, exportScale, preset],
  );

  const allModel = useMemo(
    () =>
      buildInspectableStripModel({
        pages: allPages,
        sourceCanvasWidth: canvasWidth,
        fallbackPageHeight: canvasHeight,
        exportScale,
        preset,
      }),
    [allPages, canvasHeight, canvasWidth, exportScale, preset],
  );

  const currentMultiSlice = currentModel.totalHeight > currentModel.maxSliceHeight;
  const allMultiSlice = pageCount > 1 && allModel.totalHeight > allModel.maxSliceHeight;

  const [scope, setScope] = useState<"current" | "all">(() =>
    currentMultiSlice ? "current" : "all",
  );
  const effectiveScope: "current" | "all" =
    scope === "all" && allMultiSlice
      ? "all"
      : currentMultiSlice
        ? "current"
        : allMultiSlice
          ? "all"
          : "current";

  const [customByKey, setCustomByKey] = useState<Record<string, readonly number[]>>({});

  const currentKey = `${preset.id}:current:${currentModel.totalHeight}:${currentModel.maxSliceHeight}`;
  const allKey = `${preset.id}:all:${allModel.totalHeight}:${allModel.maxSliceHeight}`;

  const currentDefaultBoundaries = useMemo(
    () => stripSlicesToBoundaries(planStripSlices(currentModel.totalHeight, currentModel.maxSliceHeight)),
    [currentModel.maxSliceHeight, currentModel.totalHeight],
  );
  const allDefaultBoundaries = useMemo(
    () => stripSlicesToBoundaries(planStripSlices(allModel.totalHeight, allModel.maxSliceHeight)),
    [allModel.maxSliceHeight, allModel.totalHeight],
  );

  const currentReport = useMemo(
    () =>
      analyzeStripSlicePlan({
        targetWidth: currentModel.targetWidth,
        totalHeight: currentModel.totalHeight,
        maxSliceHeight: currentModel.maxSliceHeight,
        boundaries: customByKey[currentKey] ?? currentDefaultBoundaries,
        obstacles: currentModel.obstacles,
      }),
    [currentDefaultBoundaries, currentKey, currentModel, customByKey],
  );

  const allReport = useMemo(
    () =>
      analyzeStripSlicePlan({
        targetWidth: allModel.targetWidth,
        totalHeight: allModel.totalHeight,
        maxSliceHeight: allModel.maxSliceHeight,
        boundaries: customByKey[allKey] ?? allDefaultBoundaries,
        obstacles: allModel.obstacles,
      }),
    [allDefaultBoundaries, allKey, allModel, customByKey],
  );

  useEffect(() => {
    onResolvedSlicesChange({
      current: customByKey[currentKey] ? currentReport.slices : undefined,
      all: customByKey[allKey] ? allReport.slices : undefined,
    });
  }, [allKey, allReport.slices, currentKey, currentReport.slices, customByKey, onResolvedSlicesChange]);

  if (!currentMultiSlice && !allMultiSlice) {
    return null;
  }

  const activeKey = effectiveScope === "all" ? allKey : currentKey;
  const activeModel = effectiveScope === "all" ? allModel : currentModel;
  const activeReport = effectiveScope === "all" ? allReport : currentReport;
  const hasCustom = Boolean(customByKey[activeKey]);
  const sumHeight = activeReport.slices.reduce((sum, slice) => sum + slice.height, 0);

  const applySmartAutoAdjust = () => {
    const smart = planSmartStripSliceBoundaries({
      totalHeight: activeModel.totalHeight,
      maxSliceHeight: activeModel.maxSliceHeight,
      obstacles: activeModel.obstacles,
    });
    setCustomByKey((prev) => ({ ...prev, [activeKey]: smart }));
  };

  const resetUniform = () => {
    setCustomByKey((prev) => {
      const next = { ...prev };
      delete next[activeKey];
      return next;
    });
  };

  const moveBoundary = (boundaryIndex: number, nextY: number) => {
    const updated = adjustSingleSliceBoundary({
      totalHeight: activeModel.totalHeight,
      boundaries: activeReport.boundaries,
      boundaryIndex,
      nextY,
    });
    setCustomByKey((prev) => ({ ...prev, [activeKey]: updated }));
  };

  return (
    <div
      data-testid="studio-slice-boundary-inspector"
      className="mt-2 space-y-2 rounded-lg border border-line bg-card/70 p-2 text-[10px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="inline-flex items-center gap-1 font-bold text-fg">
          <Scissors size={11} className="text-accent" aria-hidden />
          분할선 미리보기 · 경계 조정
        </span>
        <span
          data-testid="studio-slice-collision-status"
          className={cx(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold",
            activeReport.bubbleCutCount > 0
              ? "bg-bad/15 text-bad"
              : activeReport.frameCutCount > 0
                ? "bg-warn/15 text-warn"
                : "bg-good/15 text-good",
          )}
        >
          {activeReport.bubbleCutCount > 0 ? (
            <>
              <TriangleAlert size={10} aria-hidden />
              말풍선·대사 절단 {activeReport.bubbleCutCount}건
            </>
          ) : activeReport.frameCutCount > 0 ? (
            <>
              <TriangleAlert size={10} aria-hidden />
              컷 프레임 절단 {activeReport.frameCutCount}건
            </>
          ) : (
            <>
              <CheckCircle2 size={10} aria-hidden />
              말풍선·컷 절단 없음
            </>
          )}
        </span>
      </div>

      {currentMultiSlice && allMultiSlice ? (
        <div className="flex gap-1" role="group" aria-label="분할 미리보기 범위">
          <button
            type="button"
            data-testid="studio-slice-scope-current"
            aria-pressed={effectiveScope === "current"}
            onClick={() => setScope("current")}
            className={cx(
              "flex-1 rounded border px-1.5 py-1 text-[10px] font-semibold",
              effectiveScope === "current"
                ? "border-accent bg-accent-soft text-fg"
                : "border-line bg-panel text-fg-3",
            )}
          >
            현재 페이지 ({currentReport.slices.length}장)
          </button>
          <button
            type="button"
            data-testid="studio-slice-scope-all"
            aria-pressed={effectiveScope === "all"}
            onClick={() => setScope("all")}
            className={cx(
              "flex-1 rounded border px-1.5 py-1 text-[10px] font-semibold",
              effectiveScope === "all"
                ? "border-accent bg-accent-soft text-fg"
                : "border-line bg-panel text-fg-3",
            )}
          >
            연결 전체 ({allReport.slices.length}장)
          </button>
        </div>
      ) : null}

      {/* 비례 세로 스트립 미니맵: 컷(사각)·말풍선(알약)·분할선 표시 */}
      <div
        data-testid="studio-slice-minimap"
        aria-label="세로 웹툰 분할선 위치 미니맵"
        className="relative h-20 w-full overflow-hidden rounded border border-line/80 bg-panel"
      >
        {activeReport.obstacles.map((obs) => {
          const topPct = (obs.topY / activeReport.totalHeight) * 100;
          const heightPct = Math.max(1.5, ((obs.bottomY - obs.topY) / activeReport.totalHeight) * 100);
          return (
            <div
              key={obs.id}
              title={`${obs.label} (${obs.topY}~${obs.bottomY}px)`}
              style={{ top: `${topPct}%`, height: `${heightPct}%` }}
              className={cx(
                "pointer-events-none absolute",
                obs.kind === "bubble"
                  ? "left-[28%] right-[12%] rounded-full border border-accent/60 bg-accent/20"
                  : "left-[8%] right-[8%] border border-fg-3/35 bg-card/55",
              )}
            />
          );
        })}
        {activeReport.boundaryReports.map((boundary) => {
          const topPct = (boundary.y / activeReport.totalHeight) * 100;
          return (
            <div
              key={`line-${boundary.boundaryIndex}`}
              data-slice-line-status={boundary.status}
              style={{ top: `${topPct}%` }}
              className={cx(
                "pointer-events-none absolute inset-x-0 border-t border-dashed",
                boundary.status === "bubble-cut"
                  ? "border-bad"
                  : boundary.status === "frame-cut"
                    ? "border-warn"
                    : "border-good",
              )}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          data-testid="studio-slice-auto-adjust"
          onClick={applySmartAutoAdjust}
          className="inline-flex min-h-7 flex-1 items-center justify-center gap-1 rounded border border-accent/40 bg-accent-soft/45 px-2 py-1 font-semibold text-accent hover:bg-accent-soft"
        >
          <Sparkles size={11} aria-hidden />
          안전 여백 자동 맞춤
        </button>
        {hasCustom ? (
          <button
            type="button"
            data-testid="studio-slice-reset-uniform"
            onClick={resetUniform}
            className="inline-flex min-h-7 items-center justify-center gap-1 rounded border border-line bg-panel px-2 py-1 font-semibold text-fg-2 hover:bg-raised"
          >
            <RotateCcw size={10} aria-hidden />
            균등 복원
          </button>
        ) : null}
      </div>

      <div className="max-h-36 space-y-1.5 overflow-y-auto pr-0.5">
        {activeReport.boundaryReports.map((boundary) => {
          const idx = boundary.boundaryIndex;
          const collisionLabel =
            boundary.cutBubbles.length > 0
              ? `절단: ${boundary.cutBubbles.map((item) => item.label).join(", ")}`
              : boundary.cutFrames.length > 0
                ? `절단: ${boundary.cutFrames.map((item) => item.label).join(", ")}`
                : "여백 통과 (안전)";
          return (
            <div
              key={idx}
              data-testid={`studio-slice-boundary-row-${idx}`}
              className="rounded border border-line/70 bg-panel/75 px-2 py-1"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-semibold text-fg-2">
                  경계 #{idx + 1} ({idx + 1}장 {formatNumber(boundary.prevSliceHeight)}px ↔ {idx + 2}장{" "}
                  {formatNumber(boundary.nextSliceHeight)}px)
                </span>
              </div>
              <p
                className={cx(
                  "mt-0.5 truncate",
                  boundary.status === "bubble-cut"
                    ? "font-semibold text-bad"
                    : boundary.status === "frame-cut"
                      ? "text-warn"
                      : "text-good",
                )}
              >
                {collisionLabel}
              </p>
              <div className="mt-1 flex items-center gap-1">
                <button
                  type="button"
                  data-testid={`studio-slice-boundary-up-${idx}`}
                  onClick={() => moveBoundary(idx, boundary.y - 32)}
                  aria-label={`경계 ${idx + 1} 위로 32px 이동`}
                  className="h-6 rounded border border-line bg-card px-1.5 font-semibold text-fg-2 hover:bg-raised"
                >
                  −32
                </button>
                <label className="flex flex-1 items-center gap-1 text-fg-3">
                  <span className="sr-only">경계 {idx + 1} Y 좌표</span>
                  <input
                    type="number"
                    data-testid={`studio-slice-boundary-input-${idx}`}
                    aria-label={`분할선 ${idx + 1} Y 위치(px)`}
                    value={boundary.y}
                    onChange={(event) => moveBoundary(idx, Number(event.target.value))}
                    className="h-6 w-full rounded border border-line bg-card px-1.5 text-center tabular-nums text-fg"
                  />
                </label>
                <button
                  type="button"
                  data-testid={`studio-slice-boundary-down-${idx}`}
                  onClick={() => moveBoundary(idx, boundary.y + 32)}
                  aria-label={`경계 ${idx + 1} 아래로 32px 이동`}
                  className="h-6 rounded border border-line bg-card px-1.5 font-semibold text-fg-2 hover:bg-raised"
                >
                  +32
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {activeReport.oversizedSliceIndices.length > 0 ? (
        <p role="status" className="rounded bg-warn/10 px-2 py-1 text-warn">
          경계 수동 이동으로 {activeReport.oversizedSliceIndices.map((i) => `${i + 1}장`).join(", ")} 높이가 규격 상한(
          {formatNumber(activeReport.maxSliceHeight)}px)을 넘었습니다. 안전 여백 자동 맞춤으로 상한 안에 맞출 수 있어요.
        </p>
      ) : null}

      <p
        data-testid="studio-slice-height-check"
        className="tabular-nums text-[9.5px] text-fg-3"
      >
        출력 순서 1→{activeReport.slices.length}장 유지 · 전체 높이 합계 {formatNumber(sumHeight)} /{" "}
        {formatNumber(activeReport.totalHeight)} px 일치
      </p>
    </div>
  );
}
