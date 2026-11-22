/**
 * 디지털 언더페인팅 3층 자동채색 패널 (React.lazy 독립 모듈).
 *
 * - 원본 선화 Multiply 비파괴 잠금 상태 표시
 * - A~F 캐릭터 레터 마킹 펜 선택 + 첫 컷 팔레트 전파 토글
 * - 기본색(Normal) / 음영(Multiply) / 하이라이트(Screen) 3층 클리핑 설정
 * - 세로 비율 H/W > 2.0 장편 컷 감지 및 256px 오버랩 페더링 타일링 안내
 */
import {
  Check,
  Grid2x2,
  Layers,
  Lock,
  PaintBucket,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import {
  DEFAULT_CHARACTER_PALETTES,
  UNDERPAINTING_CHARACTER_LABELS,
  UNDERPAINTING_DEFAULT_TILE_OVERLAP_PX,
  UNDERPAINTING_TALL_ASPECT_THRESHOLD,
  planVerticalOverlapTiles,
  type CelLightPinPreset,
  type UnderpaintingCharacterLabel,
  type UnderpaintingCharacterPalette,
  type UnderpaintingColorJob,
  type UnderpaintingMarkingStroke,
  type UnderpaintingOutputMode,
  type UnderpaintingShadingLevel,
} from "./studio-underpainting-three-layer-engine";

import { cn } from "@/shared/lib/utils";

export interface StudioUnderpaintingPanelProps {
  readonly cutId: string;
  readonly lineartLayerId: string;
  readonly lineartLayerName?: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly activeMarkLabel?: UnderpaintingCharacterLabel;
  readonly markingStrokes?: readonly UnderpaintingMarkingStroke[];
  readonly characterPalettes?: Partial<
    Record<UnderpaintingCharacterLabel, UnderpaintingCharacterPalette>
  >;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onChangeActiveMarkLabel?: (label: UnderpaintingCharacterLabel) => void;
  readonly onClearMarkings?: () => void;
  readonly onRunUnderpainting: (job: UnderpaintingColorJob) => void;
}

const OUTPUT_MODES: readonly {
  readonly id: UnderpaintingOutputMode;
  readonly label: string;
  readonly detail: string;
}[] = Object.freeze([
  {
    id: "base_shadow_highlight",
    label: "3층 분리",
    detail: "기본색(Normal) · 음영(Multiply) · 하이라이트(Screen)",
  },
  {
    id: "base_shadow",
    label: "2층 분리",
    detail: "기본색(Normal) · 음영(Multiply)",
  },
  {
    id: "flat_base",
    label: "기본색만",
    detail: "선화 아래 밑색 1층",
  },
  {
    id: "flattened",
    label: "합쳐진 채색",
    detail: "선화 잠금 아래 단일 합본",
  },
]);

const SHADING_LEVELS: readonly {
  readonly id: UnderpaintingShadingLevel;
  readonly label: string;
}[] = Object.freeze([
  { id: "flat", label: "플랫" },
  { id: "cel_1", label: "1단 셀" },
  { id: "cel_2", label: "2단 셀" },
  { id: "cel_highlight", label: "셀+림광" },
]);

const LIGHT_PIN_OPTIONS: readonly {
  readonly id: Exclude<CelLightPinPreset, "custom">;
  readonly label: string;
}[] = Object.freeze([
  { id: "top-left-45", label: "좌상단 45°" },
  { id: "top-down", label: "정면 상단" },
  { id: "top-right-45", label: "우상단 45°" },
]);

const MARK_BADGE_TONE: Readonly<Record<UnderpaintingCharacterLabel, string>> = Object.freeze({
  A: "border-accent/60 bg-accent-soft text-accent",
  B: "border-cool/60 bg-cool/15 text-cool",
  C: "border-good/60 bg-good/15 text-good",
  D: "border-warn/60 bg-warn/15 text-warn",
  E: "border-bad/60 bg-bad/15 text-bad",
  F: "border-line-strong bg-raised text-fg",
});

const INTERACTIVE_TRANSITION =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none motion-reduce:transform-none";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function StudioUnderpaintingPanel({
  cutId,
  lineartLayerId,
  lineartLayerName = "원본 선화",
  canvasWidth,
  canvasHeight,
  activeMarkLabel,
  markingStrokes = [],
  characterPalettes = DEFAULT_CHARACTER_PALETTES,
  busy = false,
  disabled = false,
  className,
  onChangeActiveMarkLabel,
  onClearMarkings,
  onRunUnderpainting,
}: StudioUnderpaintingPanelProps): ReactElement {
  const [internalMarkLabel, setInternalMarkLabel] =
    useState<UnderpaintingCharacterLabel>("A");
  const [outputMode, setOutputMode] =
    useState<UnderpaintingOutputMode>("base_shadow_highlight");
  const [shadingLevel, setShadingLevel] =
    useState<UnderpaintingShadingLevel>("cel_highlight");
  const [propagateFromFirstCut, setPropagateFromFirstCut] = useState(true);
  const [autoCloseGaps, setAutoCloseGaps] = useState(true);
  const [lightPinPreset, setLightPinPreset] =
    useState<Exclude<CelLightPinPreset, "custom">>("top-left-45");
  const [instructionText, setInstructionText] = useState("");
  const [shadowOpacityPct, setShadowOpacityPct] = useState(48);
  const [highlightOpacityPct, setHighlightOpacityPct] = useState(58);

  const selectedMark = activeMarkLabel ?? internalMarkLabel;
  const effectiveDisabled = disabled || busy;

  const tilePlan = useMemo(
    () =>
      planVerticalOverlapTiles(
        canvasWidth,
        canvasHeight,
        UNDERPAINTING_DEFAULT_TILE_OVERLAP_PX,
      ),
    [canvasHeight, canvasWidth],
  );

  const strokeCountByLabel = useMemo(() => {
    const counts: Record<UnderpaintingCharacterLabel, number> = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0,
      F: 0,
    };
    for (const stroke of markingStrokes) {
      counts[stroke.label] += 1;
    }
    return counts;
  }, [markingStrokes]);

  const handleSelectMark = (label: UnderpaintingCharacterLabel) => {
    if (onChangeActiveMarkLabel) {
      onChangeActiveMarkLabel(label);
    } else {
      setInternalMarkLabel(label);
    }
  };

  const handleRun = () => {
    if (effectiveDisabled) return;
    onRunUnderpainting({
      cutId,
      lineartLayerId,
      instructionText: instructionText.trim() || undefined,
      characterPalettes,
      markingStrokes,
      outputMode,
      shadingLevel,
      propagateFromFirstCut,
      shadowOpacity: shadowOpacityPct / 100,
      highlightOpacity: highlightOpacityPct / 100,
      tileOverlapPx: UNDERPAINTING_DEFAULT_TILE_OVERLAP_PX,
      gapCloseRadiusPx: autoCloseGaps ? "auto" : 0,
      protectMicroDetailAreaPx: 24,
      lightPin: { preset: lightPinPreset, hardEdge: true },
    });
  };

  return (
    <section
      aria-label="디지털 언더페인팅 3층 자동채색"
      data-underpainting-tiling={tilePlan.usedTiling ? "active" : "single"}
      className={cn(
        "flex w-full max-w-md flex-col gap-3 rounded-2xl border border-line bg-panel p-3 text-fg [word-break:keep-all]",
        className,
      )}
    >
      {/* 헤더 + 원본 선화 Multiply 비파괴 잠금 배지 */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-fg">언더페인팅 자동 채색</h2>
          <p className="mt-0.5 text-xs text-fg-2">
            원본 선화를 건드리지 않고 아래층에 3층 클리핑 채색을 분리합니다.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent">
          <Lock size={12} aria-hidden />
          곱하기 잠금
        </span>
      </div>

      {/* 원본 선화 레이어 고정 표시 & 3층 스택 미리보기 */}
      <div
        aria-label="생성 레이어 구조 미리보기"
        className="flex flex-col gap-1 rounded-xl border border-line bg-card p-2.5"
      >
        <div className="flex items-center justify-between rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs">
          <span className="inline-flex items-center gap-1.5 font-bold text-fg">
            <Lock size={13} aria-hidden className="text-accent" />
            {lineartLayerName}
          </span>
          <span className="font-semibold text-fg-2">Multiply · 비파괴 잠금</span>
        </div>

        {outputMode === "base_shadow_highlight" ? (
          <div className="ml-3 flex items-center justify-between rounded-lg border border-dashed border-line bg-raised/60 px-2.5 py-1 text-xs text-fg-2">
            <span>↳ 하이라이트 (클리핑)</span>
            <span className="tabular-nums">Screen · {highlightOpacityPct}%</span>
          </div>
        ) : null}

        {outputMode === "base_shadow_highlight" || outputMode === "base_shadow" ? (
          <div className="ml-3 flex items-center justify-between rounded-lg border border-dashed border-line bg-raised/60 px-2.5 py-1 text-xs text-fg-2">
            <span>↳ 음영 (클리핑)</span>
            <span className="tabular-nums">Multiply · {shadowOpacityPct}%</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-fg-2">
          <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
            <Layers size={13} aria-hidden className="text-accent" />
            {outputMode === "flattened" ? "합쳐진 채색" : "기본색 (클리핑 기준)"}
          </span>
          <span className="tabular-nums">Normal · 100%</span>
        </div>
      </div>

      {/* 장편 세로 컷(H/W > 2.0) 256px 오버랩 페더링 타일링 상태 배너 */}
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "flex items-start gap-2 rounded-xl border p-2.5 text-xs",
          tilePlan.usedTiling
            ? "border-accent/50 bg-accent-soft text-fg"
            : "border-line bg-card text-fg-2",
        )}
      >
        <Grid2x2
          size={15}
          aria-hidden
          className={cn("mt-0.5 shrink-0", tilePlan.usedTiling ? "text-accent" : "text-fg-3")}
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold tabular-nums text-fg">
            컷 비율 {tilePlan.aspectRatio.toFixed(2)} ({canvasWidth}×{canvasHeight}px)
          </p>
          <p className="mt-0.5 text-fg-2 tabular-nums">
            {tilePlan.usedTiling
              ? `세로 ${UNDERPAINTING_TALL_ASPECT_THRESHOLD.toFixed(1)}배 초과 — ${tilePlan.tiles.length}타일 · ${tilePlan.overlapPx}px 오버랩 페더링으로 3층 분리 지원`
              : "단일 타일 처리 범위입니다. 세로 2.0배가 넘으면 256px 페더링 타일링이 자동 켜집니다."}
          </p>
        </div>
      </div>

      {/* A~F 캐릭터 레터 마킹 펜 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-fg">A~F 인물 레터 마킹</span>
          {markingStrokes.length > 0 && onClearMarkings ? (
            <button
              type="button"
              disabled={effectiveDisabled}
              onClick={onClearMarkings}
              className={cn(
                "inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg",
                INTERACTIVE_TRANSITION,
                FOCUS_RING,
              )}
            >
              <Trash2 size={13} aria-hidden />
              마킹 초기화 ({markingStrokes.length})
            </button>
          ) : null}
        </div>

        <div
          role="radiogroup"
          aria-label="캐릭터 마킹 레터 선택"
          className="grid grid-cols-6 gap-1.5"
        >
          {UNDERPAINTING_CHARACTER_LABELS.map((label) => {
            const active = selectedMark === label;
            const count = strokeCountByLabel[label];
            const paletteName = characterPalettes[label]?.name ?? `인물 ${label}`;
            return (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={`${label} 마킹 펜 (${paletteName})`}
                disabled={effectiveDisabled}
                onClick={() => handleSelectMark(label)}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center rounded-lg border text-xs font-bold tabular-nums enabled:active:scale-[0.97]",
                  INTERACTIVE_TRANSITION,
                  FOCUS_RING,
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : MARK_BADGE_TONE[label],
                )}
              >
                <span>{label}</span>
                {count > 0 ? (
                  <span className="text-[10px] font-semibold opacity-90">{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2">
          <input
            type="checkbox"
            checked={propagateFromFirstCut}
            disabled={effectiveDisabled}
            onChange={(event) => setPropagateFromFirstCut(event.target.checked)}
            className="size-4 accent-accent"
          />
          <span>첫 컷 팔레트 전파 (시트 없이 같은 인물 색 유지)</span>
        </label>

        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2">
          <input
            type="checkbox"
            checked={autoCloseGaps}
            disabled={effectiveDisabled}
            onChange={(event) => setAutoCloseGaps(event.target.checked)}
            className="size-4 accent-accent"
          />
          <span>선화 틈새 자동 닫힘 (0~12px · &lt; 24px² 미세 디테일 보호)</span>
        </label>
      </div>

      {/* 출력 층 모드 & 명암 단계 */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold text-fg">층 분리 방식</span>
        <div role="radiogroup" aria-label="언더페인팅 층 분리 방식" className="grid grid-cols-2 gap-1.5">
          {OUTPUT_MODES.map((entry) => {
            const active = outputMode === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={effectiveDisabled}
                onClick={() => setOutputMode(entry.id)}
                className={cn(
                  "flex min-h-11 flex-col items-start justify-center rounded-lg border px-2.5 py-1.5 text-left",
                  INTERACTIVE_TRANSITION,
                  FOCUS_RING,
                  active
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <span className="inline-flex items-center gap-1 text-xs font-bold">
                  {active ? <Check size={12} aria-hidden className="text-accent" /> : null}
                  {entry.label}
                </span>
                <span className="text-[11px] text-fg-3">{entry.detail}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="명암 단계">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-fg-2">
            <Sun size={13} aria-hidden /> 명암
          </span>
          {SHADING_LEVELS.map((level) => {
            const active = shadingLevel === level.id;
            return (
              <button
                key={level.id}
                type="button"
                aria-pressed={active}
                disabled={effectiveDisabled}
                onClick={() => setShadingLevel(level.id)}
                className={cn(
                  "min-h-11 rounded-lg border px-2.5 text-xs font-semibold",
                  INTERACTIVE_TRANSITION,
                  FOCUS_RING,
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {level.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="단일 광원 방향 핀">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-fg-2">
            광원 핀
          </span>
          {LIGHT_PIN_OPTIONS.map((pinOpt) => {
            const active = lightPinPreset === pinOpt.id;
            return (
              <button
                key={pinOpt.id}
                type="button"
                aria-pressed={active}
                disabled={effectiveDisabled}
                onClick={() => setLightPinPreset(pinOpt.id)}
                className={cn(
                  "min-h-11 rounded-lg border px-2.5 text-xs font-semibold",
                  INTERACTIVE_TRANSITION,
                  FOCUS_RING,
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {pinOpt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 세부 불투명도 접이식 설정 */}
      <details className="rounded-xl border border-line bg-card px-3 py-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-semibold text-fg-2">
          <span>음영 · 하이라이트 농도 조절</span>
          <span className="tabular-nums text-fg-3">
            음영 {shadowOpacityPct}% · 림광 {highlightOpacityPct}%
          </span>
        </summary>
        <div className="mt-2 flex flex-col gap-2 pb-1">
          <label className="flex items-center justify-between gap-2 text-xs text-fg-2">
            <span>음영 불투명도 (Multiply)</span>
            <input
              type="range"
              min={35}
              max={65}
              value={shadowOpacityPct}
              disabled={effectiveDisabled}
              aria-label="음영 불투명도"
              onChange={(event) => setShadowOpacityPct(Number(event.target.value))}
              className="h-6 w-28 accent-accent"
            />
            <span className="w-10 text-right tabular-nums text-fg">{shadowOpacityPct}%</span>
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-fg-2">
            <span>하이라이트 불투명도 (Screen)</span>
            <input
              type="range"
              min={40}
              max={80}
              value={highlightOpacityPct}
              disabled={effectiveDisabled}
              aria-label="하이라이트 불투명도"
              onChange={(event) => setHighlightOpacityPct(Number(event.target.value))}
              className="h-6 w-28 accent-accent"
            />
            <span className="w-10 text-right tabular-nums text-fg">
              {highlightOpacityPct}%
            </span>
          </label>
        </div>
      </details>

      {/* 한 줄 색 지시 + 실행 버튼 */}
      <div className="flex flex-col gap-2">
        <label className="sr-only" htmlFor="underpainting-instruction-input">
          한 줄 색 지시
        </label>
        <input
          id="underpainting-instruction-input"
          type="text"
          value={instructionText}
          disabled={effectiveDisabled}
          onChange={(event) => setInstructionText(event.target.value)}
          placeholder="한 줄 색 지시 (예: 노을빛 역광, 교복은 감색)"
          className={cn(
            "min-h-11 rounded-lg border border-line bg-card px-3 text-xs text-fg placeholder:text-fg-3",
            FOCUS_RING,
          )}
        />

        <button
          type="button"
          disabled={effectiveDisabled}
          onClick={handleRun}
          className={cn(
            "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-bold text-on-accent enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
            INTERACTIVE_TRANSITION,
            FOCUS_RING,
          )}
        >
          {busy ? (
            <Sparkles size={15} aria-hidden />
          ) : (
            <PaintBucket size={15} aria-hidden />
          )}
          <span>{busy ? "언더페인팅 계산 중" : "3층 언더페인팅 적용"}</span>
        </button>
      </div>
    </section>
  );
}

export default StudioUnderpaintingPanel;
