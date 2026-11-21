/**
 * StudioParametricEmotionBubblePanel — 8파라미터 감정 말풍선 편집기 +
 * 이어진 말풍선 병합/비파괴 분할 + 감정 말풍선 갤러리 지연 마운트 패널.
 *
 * - 시맨틱 CSS 토큰만 사용(raw hex/slate/white 금지).
 * - `StudioBubbleEmotionGallery`는 `React.lazy(() => import(...))` 동적 import 경계로 마운트한다.
 */
import {
  Combine,
  GalleryHorizontalEnd,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Split,
} from "lucide-react";
import { Suspense, lazy, useMemo, useState, type ReactElement } from "react";

import {
  PARAMETRIC_BUBBLE_EMOTION_PRESETS,
  PARAMETRIC_BUBBLE_PRESET_TABLE,
  PARAMETRIC_BUBBLE_SHAPE_META,
  PARAMETRIC_BUBBLE_SLIDER_SPECS,
  applyParametricEmotionPreset,
  createParametricEmotionBubble,
  generateParametricBubbleGeometry,
  mapParametricShapeToBubbleVariant,
  mergeParametricEmotionBubbles,
  splitParametricEmotionBubbleGroup,
  type ParametricBubbleBaseShape,
  type ParametricBubbleEmotionPreset,
  type ParametricBubbleMergedGroup,
  type ParametricBubbleSliderKey,
  type ParametricEmotionBubble,
} from "./studio-parametric-emotion-bubble";

import type { BubbleVariant } from "../studio-assets";

import { cn } from "@/shared/lib/utils";

const LazyStudioBubbleEmotionGallery = lazy(() =>
  import("./StudioBubbleEmotionGallery").then((mod) => ({
    default: mod.StudioBubbleEmotionGallery,
  })),
);

export interface StudioParametricEmotionBubblePanelProps {
  readonly onInsertBubble?: (variant: BubbleVariant) => void;
}

type ActivePanelMode = "parametric" | "gallery";

function buildCompanionBubble(primary: ParametricEmotionBubble): ParametricEmotionBubble {
  return createParametricEmotionBubble({
    id: `${primary.id}-linked`,
    x: primary.x + Math.round(primary.width * 0.56),
    y: primary.y + Math.round(primary.height * 0.24),
    width: Math.round(primary.width * 0.78),
    height: Math.round(primary.height * 0.8),
    baseShape: primary.baseShape,
    emotionPreset: primary.emotionPreset,
    geometryParams: primary.geometryParams,
    tail: {
      visible: true,
      targetCanvasPos: [primary.x + primary.width + 64, primary.y + primary.height + 52],
      curveBias: -0.2,
    },
    seed: (primary.seed ?? 17) + 31,
  });
}

export function StudioParametricEmotionBubblePanel({
  onInsertBubble,
}: StudioParametricEmotionBubblePanelProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<ActivePanelMode>("parametric");
  const [primaryBubble, setPrimaryBubble] = useState<ParametricEmotionBubble>(() =>
    createParametricEmotionBubble({
      id: "parametric-main",
      x: 24,
      y: 20,
      width: 200,
      height: 118,
      baseShape: "shout",
      emotionPreset: "action",
      seed: 17,
    }),
  );
  const [mergedGroup, setMergedGroup] = useState<ParametricBubbleMergedGroup | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const previewGeometry = useMemo(
    () => generateParametricBubbleGeometry(primaryBubble),
    [primaryBubble],
  );

  const activePresetMeta = PARAMETRIC_BUBBLE_PRESET_TABLE[primaryBubble.emotionPreset];

  const handleSelectShape = (shape: ParametricBubbleBaseShape) => {
    setMergedGroup(null);
    setMergeError(null);
    setPrimaryBubble((prev) =>
      createParametricEmotionBubble({
        ...prev,
        baseShape: shape,
        tail: { ...prev.tail, visible: shape !== "self-talk" },
      }),
    );
  };

  const handleSelectPreset = (preset: ParametricBubbleEmotionPreset) => {
    setMergedGroup(null);
    setMergeError(null);
    setPrimaryBubble((prev) => applyParametricEmotionPreset(prev, preset, true));
  };

  const handleSliderChange = (key: ParametricBubbleSliderKey, value: number) => {
    setMergedGroup(null);
    setMergeError(null);
    setPrimaryBubble((prev) =>
      createParametricEmotionBubble({
        ...prev,
        emotionPreset: "custom",
        geometryParams: {
          ...prev.geometryParams,
          [key]: value,
        },
      }),
    );
  };

  const handleToggleTail = () => {
    setMergedGroup(null);
    setPrimaryBubble((prev) =>
      createParametricEmotionBubble({
        ...prev,
        tail: {
          ...prev.tail,
          visible: !prev.tail.visible,
        },
      }),
    );
  };

  const handleMergeLinked = async () => {
    setMerging(true);
    setMergeError(null);
    try {
      const companion = buildCompanionBubble(primaryBubble);
      const result = await mergeParametricEmotionBubbles([primaryBubble, companion]);
      if (result.ok) {
        setMergedGroup(result.group);
      } else {
        setMergeError(result.reason);
      }
    } finally {
      setMerging(false);
    }
  };

  const handleSplitMerged = () => {
    if (!mergedGroup) return;
    const restored = splitParametricEmotionBubbleGroup(mergedGroup);
    if (restored[0]) {
      setPrimaryBubble(restored[0]);
    }
    setMergedGroup(null);
    setMergeError(null);
  };

  const handleInsert = () => {
    const variant = mapParametricShapeToBubbleVariant(
      primaryBubble.baseShape,
      primaryBubble.emotionPreset,
    );
    onInsertBubble?.(variant);
  };

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-studio-parametric-emotion-bubble="true"
      className="mx-2.5 mt-2.5 rounded-2xl border border-line/60 bg-card/70 p-2"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-fg transition-colors hover:bg-raised [word-break:keep-all]">
        <span className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="shrink-0 text-accent" aria-hidden />
          <span>8파라미터 감정 말풍선 · 갤러리</span>
        </span>
        <span className="rounded-md border border-line/60 bg-panel px-1.5 py-0.5 text-[0.62rem] font-medium tabular-nums text-fg-3">
          {mergedGroup ? "병합 2개" : activePresetMeta.labelKo}
        </span>
      </summary>

      {open ? (
        <div className="mt-2 space-y-2.5 border-t border-line/50 pt-2.5">
          {/* 모드 전환 탭: 8파라미터 편집기 vs 감정 말풍선 갤러리 */}
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-panel p-1">
            <button
              type="button"
              onClick={() => setActiveMode("parametric")}
              aria-pressed={activeMode === "parametric"}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors [word-break:keep-all]",
                activeMode === "parametric"
                  ? "bg-card text-fg shadow-sm ring-1 ring-line/60"
                  : "text-fg-3 hover:bg-raised hover:text-fg-2",
              )}
            >
              <Sparkles size={14} aria-hidden />
              8파라미터 편집
            </button>
            <button
              type="button"
              onClick={() => setActiveMode("gallery")}
              aria-pressed={activeMode === "gallery"}
              data-studio-emotion-gallery-tab="true"
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors [word-break:keep-all]",
                activeMode === "gallery"
                  ? "bg-card text-fg shadow-sm ring-1 ring-line/60"
                  : "text-fg-3 hover:bg-raised hover:text-fg-2",
              )}
            >
              <GalleryHorizontalEnd size={14} aria-hidden />
              감정 갤러리
            </button>
          </div>

          {activeMode === "gallery" ? (
            <Suspense
              fallback={
                <div className="rounded-xl border border-line/60 bg-panel px-3 py-6 text-center text-xs text-fg-3">
                  감정 말풍선 갤러리를 불러오는 중…
                </div>
              }
            >
              <div className="max-h-96 overflow-y-auto overscroll-contain rounded-xl border border-line/60 bg-canvas p-2.5">
                <LazyStudioBubbleEmotionGallery />
              </div>
            </Suspense>
          ) : (
            <div className="space-y-2.5">
              {/* 실시간 SVG 미리보기 */}
              <div className="rounded-xl border border-line/60 bg-canvas p-2">
                <svg
                  viewBox={mergedGroup ? "0 0 380 220" : "0 0 260 190"}
                  role="img"
                  aria-label={mergedGroup ? "이어진 감정 말풍선 미리보기" : "8파라미터 감정 말풍선 미리보기"}
                  className="mx-auto block h-32 w-full"
                >
                  {mergedGroup ? (
                    <g>
                      {mergedGroup.tailPathsD.map((d, idx) => (
                        <path
                          key={`tail-${idx}`}
                          d={d}
                          className="fill-card stroke-fg"
                          strokeWidth={mergedGroup.strokeWidth}
                          strokeLinejoin="round"
                        />
                      ))}
                      <path
                        d={mergedGroup.unionPathD}
                        className="fill-card stroke-fg"
                        strokeWidth={mergedGroup.strokeWidth}
                        strokeLinejoin="round"
                      />
                      {mergedGroup.needlePathsD.map((d, idx) => (
                        <path
                          key={`needle-${idx}`}
                          d={d}
                          className="fill-none stroke-fg-2"
                          strokeWidth={Math.max(1, mergedGroup.strokeWidth * 0.55)}
                          strokeLinecap="round"
                        />
                      ))}
                    </g>
                  ) : (
                    <g>
                      {previewGeometry.tailPathD ? (
                        <path
                          d={previewGeometry.tailPathD}
                          className="fill-card stroke-fg"
                          strokeWidth={previewGeometry.strokeWidth}
                          strokeLinejoin="round"
                        />
                      ) : null}
                      <path
                        d={previewGeometry.bodyPathD}
                        className="fill-card stroke-fg"
                        strokeWidth={previewGeometry.strokeWidth}
                        strokeDasharray={previewGeometry.strokeDasharray}
                        strokeLinejoin="round"
                      />
                      {previewGeometry.needlePathsD.map((d, idx) => (
                        <path
                          key={`needle-${idx}`}
                          d={d}
                          className="fill-none stroke-fg-2"
                          strokeWidth={Math.max(1, previewGeometry.strokeWidth * 0.55)}
                          strokeLinecap="round"
                        />
                      ))}
                    </g>
                  )}
                </svg>
              </div>

              {/* 6종 기본형 */}
              <div className="space-y-1">
                <p className="text-[0.68rem] font-semibold text-fg-2">기본형 (6종)</p>
                <div className="grid grid-cols-3 gap-1">
                  {PARAMETRIC_BUBBLE_SHAPE_META.map((shape) => (
                    <button
                      key={shape.id}
                      type="button"
                      onClick={() => handleSelectShape(shape.id)}
                      aria-pressed={primaryBubble.baseShape === shape.id}
                      className={cn(
                        "min-h-11 rounded-lg border px-2 text-xs font-medium transition-colors [word-break:keep-all]",
                        primaryBubble.baseShape === shape.id
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line/60 bg-panel text-fg-2 hover:bg-raised",
                      )}
                    >
                      {shape.labelKo}
                    </button>
                  ))}
                </div>
              </div>

              {/* 9종 감정 프리셋 */}
              <div className="space-y-1">
                <p className="text-[0.68rem] font-semibold text-fg-2">감정 프리셋 (9종)</p>
                <div className="grid grid-cols-3 gap-1">
                  {PARAMETRIC_BUBBLE_EMOTION_PRESETS.map((presetId) => {
                    const meta = PARAMETRIC_BUBBLE_PRESET_TABLE[presetId];
                    return (
                      <button
                        key={presetId}
                        type="button"
                        onClick={() => handleSelectPreset(presetId)}
                        aria-pressed={primaryBubble.emotionPreset === presetId}
                        className={cn(
                          "min-h-11 rounded-lg border px-1.5 text-[0.7rem] font-medium transition-colors [word-break:keep-all]",
                          primaryBubble.emotionPreset === presetId
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-line/60 bg-panel text-fg-2 hover:bg-raised",
                        )}
                      >
                        {meta.labelKo}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 8개 형상 슬라이더 */}
              <div className="space-y-1.5 rounded-xl border border-line/50 bg-panel/70 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.68rem] font-semibold text-fg-2">형상 세부 조절 (8파라미터)</p>
                  <button
                    type="button"
                    onClick={handleToggleTail}
                    aria-pressed={primaryBubble.tail.visible}
                    className={cn(
                      "min-h-9 rounded-lg border px-2 text-[0.68rem] font-medium transition-colors",
                      primaryBubble.tail.visible
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line/60 bg-card text-fg-3 hover:bg-raised",
                    )}
                  >
                    꼬리 {primaryBubble.tail.visible ? "켬" : "끔"}
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {PARAMETRIC_BUBBLE_SLIDER_SPECS.map((spec) => {
                    const currentValue = primaryBubble.geometryParams[spec.key];
                    const inputId = `parametric-bubble-slider-${spec.key}`;
                    return (
                      <div key={spec.key} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2">
                        <label htmlFor={inputId} className="text-[0.68rem] font-medium text-fg-2 [word-break:keep-all]">
                          {spec.labelKo}
                        </label>
                        <input
                          id={inputId}
                          type="range"
                          min={spec.min}
                          max={spec.max}
                          step={spec.step}
                          value={currentValue}
                          onChange={(event) => handleSliderChange(spec.key, Number(event.target.value))}
                          className="w-full accent-accent"
                        />
                        <span className="text-right text-[0.68rem] font-semibold tabular-nums text-fg-3">
                          {currentValue}
                          {spec.unit}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {mergeError ? (
                <p role="alert" className="rounded-lg border border-warn/40 bg-panel px-2.5 py-1.5 text-xs text-warn">
                  {mergeError}
                </p>
              ) : null}

              {/* 이어진 말풍선 병합/비파괴 분할 + 캔버스 삽입 */}
              <div className="grid grid-cols-2 gap-1.5">
                {mergedGroup ? (
                  <button
                    type="button"
                    onClick={handleSplitMerged}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-2 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised"
                  >
                    <Split size={14} aria-hidden />
                    비파괴 분할
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={merging}
                    onClick={() => {
                      void handleMergeLinked();
                    }}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-2 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised disabled:opacity-50"
                  >
                    <Combine size={14} aria-hidden />
                    이어진 말풍선 병합
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleInsert}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-2 text-xs font-semibold text-on-accent transition-opacity hover:opacity-95"
                >
                  <Plus size={14} aria-hidden />
                  캔버스에 넣기
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </details>
  );
}
