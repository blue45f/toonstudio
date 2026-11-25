/**
 * Wave 38B — 플로팅 미니맵 & 명도/실루엣 흑백 검수 토글 · 비주얼 언두 필름스트립 스크러버 도크.
 *
 * Calm Atelier 시맨틱 토큰 전용(원시 색상 0건 · 44×44px 터치 타깃).
 */

import { Eye, Film, Map as MapIcon, Redo2, Undo2 } from "lucide-react";
import { useId, useMemo, type ReactElement } from "react";

import {
  MINIMAP_INSPECTION_META,
  computeMinimapViewportRect,
  computeValueContrastAudit,
  jumpToFilmstripIndex,
  panCanvasFromMinimapPoint,
  setFilmstripScrubPreview,
  stepFilmstripRedo,
  stepFilmstripUndo,
  toggleMinimapInspectionMode,
  type FilmstripBandTone,
  type MinimapInspectionMode,
  type MinimapInspectionState,
  type UndoFilmstripState,
} from "./command-palette-minimap";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_SEG = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none break-keep ${FOCUS_RING}`;

const INSPECTION_MODES: readonly MinimapInspectionMode[] = [
  "normal",
  "grayscale-value",
  "silhouette-contrast",
  "dark-reader",
];

const MINIMAP_ZONES: readonly {
  readonly id: string;
  readonly labelKo: string;
  readonly ratioX: number;
  readonly ratioY: number;
}[] = [
  { id: "nw", labelKo: "상단 왼쪽으로 이동", ratioX: 0.2, ratioY: 0.18 },
  { id: "n", labelKo: "상단 중앙으로 이동", ratioX: 0.5, ratioY: 0.18 },
  { id: "ne", labelKo: "상단 오른쪽으로 이동", ratioX: 0.8, ratioY: 0.18 },
  { id: "w", labelKo: "중단 왼쪽으로 이동", ratioX: 0.2, ratioY: 0.5 },
  { id: "c", labelKo: "원고 중앙으로 이동", ratioX: 0.5, ratioY: 0.5 },
  { id: "e", labelKo: "중단 오른쪽으로 이동", ratioX: 0.8, ratioY: 0.5 },
  { id: "sw", labelKo: "하단 왼쪽으로 이동", ratioX: 0.2, ratioY: 0.82 },
  { id: "s", labelKo: "하단 중앙으로 이동", ratioX: 0.5, ratioY: 0.82 },
  { id: "se", labelKo: "하단 오른쪽으로 이동", ratioX: 0.8, ratioY: 0.82 },
];

const SAMPLE_LUMINANCES_BY_MODE: Readonly<Record<MinimapInspectionMode, readonly number[]>> = {
  normal: [0.14, 0.22, 0.44, 0.52, 0.64, 0.82, 0.91],
  "grayscale-value": [0.12, 0.18, 0.42, 0.5, 0.66, 0.84, 0.94],
  "silhouette-contrast": [0.06, 0.08, 0.14, 0.88, 0.92, 0.96],
  "dark-reader": [0.16, 0.24, 0.36, 0.58, 0.74, 0.84],
};

const BAND_TONE_CSS_VAR: Readonly<Record<FilmstripBandTone, string>> = {
  fg: "var(--color-fg)",
  "fg-2": "var(--color-fg-2)",
  accent: "var(--color-accent)",
  cool: "var(--color-cool)",
  warn: "var(--color-warn)",
  raised: "var(--color-raised)",
};

const MINIMAP_W = 128;
const MINIMAP_H = 180;

export interface StudioMinimapFilmstripDockProps {
  readonly minimapState: MinimapInspectionState;
  readonly filmstripState: UndoFilmstripState;
  readonly onMinimapStateChange: (
    updater: (prev: MinimapInspectionState) => MinimapInspectionState,
  ) => void;
  readonly onFilmstripStateChange: (
    updater: (prev: UndoFilmstripState) => UndoFilmstripState,
  ) => void;
}

export function StudioMinimapFilmstripDock({
  minimapState,
  filmstripState,
  onMinimapStateChange,
  onFilmstripStateChange,
}: StudioMinimapFilmstripDockProps): ReactElement {
  const filmstripRangeId = useId();

  const minimapRect = useMemo(
    () => computeMinimapViewportRect(minimapState, MINIMAP_W, MINIMAP_H),
    [minimapState],
  );

  const contrastAudit = useMemo(
    () => computeValueContrastAudit(SAMPLE_LUMINANCES_BY_MODE[minimapState.inspectionMode]),
    [minimapState.inspectionMode],
  );

  const activeFilmstripIndex = filmstripState.previewIndex ?? filmstripState.cursorIndex;
  const activeFilmstripEntry = filmstripState.entries[activeFilmstripIndex];

  const minimapFilterClass =
    minimapState.inspectionMode === "grayscale-value"
      ? "grayscale"
      : minimapState.inspectionMode === "silhouette-contrast"
        ? "grayscale contrast-150"
        : "";

  return (
    <>
      {/* 플로팅 미니맵 & 명도/실루엣 흑백 검수 */}
      <div className="space-y-3 border-t border-line/60 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <MapIcon className="h-4 w-4 text-accent" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-fg break-keep">
              미니맵 예제 · 샘플 명도 계산
            </h3>
          </div>
          <span
            data-testid="minimap-inspection-badge"
            className="rounded-md bg-raised px-2 py-0.5 text-xs font-semibold text-fg-2 break-keep"
          >
            {MINIMAP_INSPECTION_META[minimapState.inspectionMode].shortLabelKo}
          </span>
        </div>

        <p data-testid="minimap-scope-notice" className="text-xs text-fg-3 break-keep">
          도형과 고정 명도 샘플을 사용해요. 시야 좌표·점수는 예제 계산이며 현재 원고의 축소 화면이나 실측 검수 결과가 아니에요.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="relative mx-auto h-[180px] w-[128px] shrink-0 overflow-hidden rounded-lg border border-line bg-canvas sm:mx-0">
            <svg
              viewBox={`0 0 ${MINIMAP_W} ${MINIMAP_H}`}
              data-testid="minimap-svg"
              className={`h-full w-full ${minimapFilterClass}`}
              aria-hidden="true"
            >
              <g
                transform={
                  minimapState.flippedHorizontal
                    ? `translate(${MINIMAP_W} 0) scale(-1 1)`
                    : undefined
                }
              >
                <rect
                  x="0"
                  y="0"
                  width={MINIMAP_W}
                  height={MINIMAP_H}
                  fill={
                    minimapState.inspectionMode === "dark-reader"
                      ? "var(--color-canvas)"
                      : "var(--color-panel)"
                  }
                />
                <rect x="14" y="14" width="100" height="42" rx="4" fill="var(--color-raised)" />
                <rect x="18" y="66" width="92" height="56" rx="4" fill="var(--color-accent-soft)" />
                <circle cx="56" cy="94" r="18" fill="var(--color-fg-2)" />
                <rect
                  x="14"
                  y="132"
                  width="100"
                  height="34"
                  rx="4"
                  fill="var(--color-cool)"
                  fillOpacity="0.28"
                />
              </g>
              <rect
                x={minimapRect.x}
                y={minimapRect.y}
                width={minimapRect.width}
                height={minimapRect.height}
                rx="3"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2"
              />
            </svg>

            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
              {MINIMAP_ZONES.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  data-testid={`minimap-zone-${zone.id}`}
                  aria-label={zone.labelKo}
                  onClick={() =>
                    onMinimapStateChange((prev) =>
                      panCanvasFromMinimapPoint(
                        prev,
                        zone.ratioX * MINIMAP_W,
                        zone.ratioY * MINIMAP_H,
                        MINIMAP_W,
                        MINIMAP_H,
                      ),
                    )
                  }
                  className={`cursor-pointer bg-transparent ${FOCUS_RING}`}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="화면 검수 필터">
              {INSPECTION_MODES.map((mode) => {
                const active = minimapState.inspectionMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    data-testid={`inspect-mode-${mode}`}
                    aria-pressed={active}
                    onClick={() =>
                      onMinimapStateChange((prev) => toggleMinimapInspectionMode(prev, mode))
                    }
                    className={`${BTN_SEG} ${
                      active
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg"
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{MINIMAP_INSPECTION_META[mode].shortLabelKo}</span>
                  </button>
                );
              })}
            </div>

            <div className="rounded-lg bg-panel p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-fg-3">샘플 실루엣 분리 점수</span>
                <span
                  data-testid="minimap-contrast-score"
                  className="font-semibold text-good tabular-nums"
                >
                  {contrastAudit.silhouetteSeparationScore}점
                </span>
              </div>
              <p className="mt-1 text-fg-2 break-keep">{contrastAudit.verdictKo}</p>
              <div className="mt-1.5 flex items-center justify-between text-fg-3 tabular-nums">
                <span>
                  시야 ({minimapState.panX}, {minimapState.panY})
                </span>
                <span>커버 {minimapRect.visibleCoveragePct}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 비주얼 언두 필름스트립 스크러버 */}
      <div className="space-y-3 border-t border-line/60 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Film className="h-4 w-4 text-accent" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-fg break-keep">언두 필름스트립 예제</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="filmstrip-undo-btn"
              aria-label="이전 단계로 되돌리기"
              disabled={filmstripState.cursorIndex <= 0}
              onClick={() => onFilmstripStateChange((prev) => stepFilmstripUndo(prev))}
              className={`${BTN_SEG} min-w-11 border-line bg-panel text-fg disabled:cursor-not-allowed disabled:opacity-45`}
            >
              <Undo2 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-testid="filmstrip-redo-btn"
              aria-label="다음 단계로 복구하기"
              disabled={filmstripState.cursorIndex >= filmstripState.entries.length - 1}
              onClick={() => onFilmstripStateChange((prev) => stepFilmstripRedo(prev))}
              className={`${BTN_SEG} min-w-11 border-line bg-panel text-fg disabled:cursor-not-allowed disabled:opacity-45`}
            >
              <Redo2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <p data-testid="filmstrip-scope-notice" className="text-xs text-fg-3 break-keep">
          미리 만든 단계와 색 띠를 선택해 보는 예제예요. 실제 편집 기록을 읽거나 원고를 되돌리지 않아요.
        </p>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {filmstripState.entries.map((entry, idx) => {
            const isCurrent = idx === filmstripState.cursorIndex;
            const isFuture = idx > filmstripState.cursorIndex;
            return (
              <button
                key={entry.id}
                type="button"
                data-testid={`filmstrip-step-${idx}`}
                aria-pressed={isCurrent}
                onMouseEnter={() =>
                  onFilmstripStateChange((prev) => setFilmstripScrubPreview(prev, idx))
                }
                onMouseLeave={() =>
                  onFilmstripStateChange((prev) => setFilmstripScrubPreview(prev, null))
                }
                onClick={() => onFilmstripStateChange((prev) => jumpToFilmstripIndex(prev, idx))}
                className={`flex min-h-11 w-20 shrink-0 cursor-pointer flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors motion-reduce:transition-none ${
                  isCurrent
                    ? "border-accent bg-accent-soft"
                    : isFuture
                      ? "border-line bg-panel opacity-55 hover:opacity-100"
                      : "border-line bg-panel hover:border-line-strong"
                } ${FOCUS_RING}`}
              >
                <svg viewBox="0 0 64 40" className="h-8 w-full rounded bg-canvas" aria-hidden="true">
                  {entry.thumbnailBands.map((band, bandIdx) => (
                    <rect
                      key={bandIdx}
                      x={(band.xPct / 100) * 64}
                      y={(band.yPct / 100) * 40}
                      width={(band.wPct / 100) * 64}
                      height={(band.hPct / 100) * 40}
                      rx="2"
                      fill={BAND_TONE_CSS_VAR[band.tone]}
                      fillOpacity={band.opacity}
                    />
                  ))}
                </svg>
                <span className="truncate text-xs font-semibold text-fg">{entry.labelKo}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <label htmlFor={filmstripRangeId} className="text-fg-2 break-keep">
              {activeFilmstripEntry
                ? `${activeFilmstripEntry.labelKo} · ${activeFilmstripEntry.deltaSummaryKo}`
                : "단계 선택"}
            </label>
            <span
              data-testid="filmstrip-cursor-badge"
              className="shrink-0 font-semibold text-fg tabular-nums"
            >
              {filmstripState.cursorIndex + 1} / {filmstripState.entries.length}
            </span>
          </div>
          <input
            id={filmstripRangeId}
            data-testid="filmstrip-scrubber"
            type="range"
            min={0}
            max={Math.max(0, filmstripState.entries.length - 1)}
            value={filmstripState.cursorIndex}
            onChange={(e) =>
              onFilmstripStateChange((prev) => jumpToFilmstripIndex(prev, Number(e.target.value)))
            }
            className={`min-h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
          />
        </div>
      </div>
    </>
  );
}
