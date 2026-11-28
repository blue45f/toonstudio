import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

import { StudioThreeDToggleControl } from "../StudioThreeDToggle";

import {
  BACK_HAIR_PART_OPTIONS,
  BODY_MATRIX_ARCHETYPE_PRESETS,
  FRONT_HAIR_PART_OPTIONS,
  HAIR_COLOR_TOKEN_PRESETS,
  SIDE_HAIR_PART_OPTIONS,
  WEBTOON_21_BODY_SLIDER_SPECS,
  createDefaultBodyAndHairState,
  resolveBodyMatrixTo21Sliders,
  resolveThreePartHairColors,
  switchThreePartHairStyle,
  type BodySliderGroupId,
  type StudioWebtoonBodyAndHairState,
} from "./studio-webtoon-21-body-and-3part-hair";

import { cn } from "@/shared/lib/utils";

export interface StudioBodyRatioMatrixPadProps {
  readonly state: StudioWebtoonBodyAndHairState;
  readonly disabled?: boolean;
  readonly hairEditor?: ReactNode;
  readonly className?: string;
  readonly onChange: (next: StudioWebtoonBodyAndHairState) => void;
}

const BODY_GROUP_LABELS_KO: Readonly<Record<BodySliderGroupId, string>> = Object.freeze({
  overall: "전체·목",
  upper: "상체",
  lower: "하체",
  extremities: "팔·손발",
});

function clampSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(-1, value));
}

/**
 * CSP 2D 체형 매트릭스 패드 + Tooning Plus 21체형 슬라이더 + 3분할 헤어(앞·옆·뒤 + 메인 색 고정) 컨트롤러.
 */
export function StudioBodyRatioMatrixPad({
  state,
  disabled = false,
  className,
  hairEditor,
  onChange,
}: StudioBodyRatioMatrixPadProps) {
  const [activeTab, setActiveTab] = useState<"body" | "hair">("body");
  const [bodyGroup, setBodyGroup] = useState<BodySliderGroupId>("overall");
  const padRef = useRef<HTMLDivElement | null>(null);

  const resolved21 = useMemo(
    () => resolveBodyMatrixTo21Sliders(state.matrix, state.sliderOffsets),
    [state.matrix, state.sliderOffsets],
  );
  const resolvedHairColors = useMemo(
    () => resolveThreePartHairColors(state.hair),
    [state.hair],
  );
  const visibleSliders = useMemo(
    () => WEBTOON_21_BODY_SLIDER_SPECS.filter((spec) => spec.group === bodyGroup),
    [bodyGroup],
  );

  const commitMatrix = (muscularityX: number, fullnessY: number) => {
    if (disabled) return;
    onChange({
      ...state,
      matrix: {
        muscularityX: clampSigned(muscularityX),
        fullnessY: clampSigned(fullnessY),
      },
    });
  };

  const handlePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !padRef.current) return;
    if (event.type === "pointermove" && (event.buttons & 1) === 0) return;
    const rect = padRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    commitMatrix(nx, ny);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = event.shiftKey ? 0.15 : 0.05;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      commitMatrix(state.matrix.muscularityX - step, state.matrix.fullnessY);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      commitMatrix(state.matrix.muscularityX + step, state.matrix.fullnessY);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      commitMatrix(state.matrix.muscularityX, state.matrix.fullnessY - step);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      commitMatrix(state.matrix.muscularityX, state.matrix.fullnessY + step);
    }
  };

  return (
    <section
      aria-label="체형 매트릭스 및 3분할 헤어 편집기"
      data-testid="studio-body-ratio-matrix-pad"
      className={cn("rounded-xl border border-line bg-card p-3 text-fg", className)}
    >
      <header className="flex items-center justify-between gap-2 border-b border-line/70 pb-2">
        <div>
          <h3 className="text-xs font-semibold text-fg">체형 매트릭스 · 3분할 헤어</h3>
          <p className="text-[0.6875rem] text-fg-3">
            2D 체형 패드, 21부위 비율, 앞·옆·뒷머리 독립 조합
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(createDefaultBodyAndHairState())}
          hidden={activeTab === "hair" && Boolean(hairEditor)}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-45"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          초기화
        </button>
      </header>

      <div role="tablist" aria-label="편집 영역 선택" className="mt-2.5 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "body"}
          onClick={() => setActiveTab("body")}
          className={cn(
            "min-h-11 rounded-lg border text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            activeTab === "body"
              ? "border-accent bg-accent text-on-accent"
              : "border-line bg-panel text-fg-2 hover:bg-raised",
          )}
        >
          2D 체형 · 21슬라이더
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "hair"}
          onClick={() => setActiveTab("hair")}
          className={cn(
            "min-h-11 rounded-lg border text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            activeTab === "hair"
              ? "border-accent bg-accent text-on-accent"
              : "border-line bg-panel text-fg-2 hover:bg-raised",
          )}
        >
          헤어 3분할 (앞·옆·뒤)
        </button>
      </div>

      {activeTab === "body" ? (
        <div className="mt-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            {BODY_MATRIX_ARCHETYPE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange({
                  ...state,
                  matrix: preset.matrix,
                  sliderOffsets: { ...preset.overrides },
                })}
                className="min-h-11 rounded-lg border border-line bg-panel px-2 text-xs font-medium text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {preset.labelKo}
              </button>
            ))}
          </div>

          <div
            ref={padRef}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label="2D 체형 비율 매트릭스 패드"
            aria-valuemin={-100}
            aria-valuemax={100}
            aria-valuenow={Math.round(state.matrix.muscularityX * 100)}
            aria-valuetext={`근육 ${Math.round(state.matrix.muscularityX * 100)}%, 볼륨 ${Math.round(state.matrix.fullnessY * 100)}%`}
            onPointerDown={handlePointer}
            onPointerMove={handlePointer}
            onKeyDown={handleKeyDown}
            className="relative mt-2.5 aspect-square w-full cursor-crosshair select-none rounded-lg border border-line bg-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <svg viewBox="0 0 100 100" className="size-full" aria-hidden="true">
              <line x1={50} y1={6} x2={50} y2={94} className="stroke-line-strong" strokeWidth={1} />
              <line x1={6} y1={50} x2={94} y2={50} className="stroke-line-strong" strokeWidth={1} />
              <rect x={25} y={25} width={50} height={50} className="fill-none stroke-line" strokeWidth={0.8} strokeDasharray="2 2" />
              <circle
                cx={(state.matrix.muscularityX * 0.5 + 0.5) * 88 + 6}
                cy={(state.matrix.fullnessY * 0.5 + 0.5) * 88 + 6}
                r={4.2}
                className="fill-accent stroke-on-accent"
                strokeWidth={1.6}
              />
            </svg>
            <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[0.625rem] font-medium text-fg-3">
              슬림·긴 비율
            </span>
            <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[0.625rem] font-medium text-fg-3">
              볼륨·중량감
            </span>
            <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[0.625rem] font-medium text-fg-3">
              마름
            </span>
            <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[0.625rem] font-medium text-fg-3">
              근육
            </span>
          </div>

          <div role="tablist" aria-label="21체형 세부 부위" className="mt-2.5 grid grid-cols-4 gap-1">
            {(["overall", "upper", "lower", "extremities"] as const).map((group) => (
              <button
                key={group}
                type="button"
                role="tab"
                aria-selected={bodyGroup === group}
                onClick={() => setBodyGroup(group)}
                className={cn(
                  "min-h-11 rounded-lg border px-1 text-[0.6875rem] font-medium transition-colors",
                  bodyGroup === group
                    ? "border-accent bg-accent/15 text-fg"
                    : "border-line bg-panel text-fg-3 hover:text-fg",
                )}
              >
                {BODY_GROUP_LABELS_KO[group]}
              </button>
            ))}
          </div>

          <div className="mt-2 space-y-1.5">
            {visibleSliders.map((spec) => (
              <label key={spec.id} className="block rounded-lg border border-line/80 bg-panel px-2.5 py-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-fg-2">{spec.labelKo}</span>
                  <span aria-hidden="true" className="tabular-nums text-[0.6875rem] text-fg-3">
                    {Math.round(resolved21[spec.id] * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  aria-label={spec.labelKo}
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={state.sliderOffsets[spec.id] ?? 0}
                  disabled={disabled}
                  onChange={(event) => onChange({
                    ...state,
                    sliderOffsets: {
                      ...state.sliderOffsets,
                      [spec.id]: event.currentTarget.valueAsNumber,
                    },
                  })}
                  className="mt-1 h-7 w-full cursor-pointer accent-accent"
                />
              </label>
            ))}
          </div>
        </div>
      ) : hairEditor ?? (
        <div className="mt-2.5 space-y-2.5">
          <StudioThreeDToggleControl
            checked={state.hair.lockMainColor}
            disabled={disabled}
            label="메인 헤어 색 고정"
            description="앞·옆·뒷머리 파츠를 바꿔도 캐릭터 고유 머리색이 바뀌지 않습니다."
            labelClassName="text-xs font-medium text-fg-2"
            descriptionClassName="text-[0.6875rem] text-fg-3"
            onChange={(lockMainColor) => onChange({
              ...state,
              hair: {
                ...state.hair,
                lockMainColor,
                frontColorIdOverride: lockMainColor ? null : state.hair.frontColorIdOverride,
                sideColorIdOverride: lockMainColor ? null : state.hair.sideColorIdOverride,
                backColorIdOverride: lockMainColor ? null : state.hair.backColorIdOverride,
              },
            })}
          />

          <div role="group" aria-label="메인 헤어 색상 선택" className="grid grid-cols-4 gap-1">
            {HAIR_COLOR_TOKEN_PRESETS.map((swatch) => (
              <button
                key={swatch.id}
                type="button"
                disabled={disabled}
                aria-pressed={state.hair.mainColorId === swatch.id}
                onClick={() => onChange({
                  ...state,
                  hair: { ...state.hair, mainColorId: swatch.id },
                })}
                className={cn(
                  "min-h-11 rounded-lg border px-1.5 text-[0.6875rem] font-medium transition-colors",
                  state.hair.mainColorId === swatch.id
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-raised",
                )}
              >
                {swatch.labelKo}
              </button>
            ))}
          </div>

          {([
            ["front", "앞머리", FRONT_HAIR_PART_OPTIONS, state.hair.frontId],
            ["side", "옆머리", SIDE_HAIR_PART_OPTIONS, state.hair.sideId],
            ["back", "뒷머리", BACK_HAIR_PART_OPTIONS, state.hair.backId],
          ] as const).map(([slot, titleKo, options, selectedId]) => (
            <div key={slot}>
              <p className="mb-1 text-[0.6875rem] font-semibold text-fg-2">{titleKo}</p>
              <div className="grid grid-cols-2 gap-1">
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={selectedId === opt.id}
                    onClick={() => onChange({
                      ...state,
                      hair: switchThreePartHairStyle(state.hair, slot, opt.id),
                    })}
                    className={cn(
                      "min-h-11 rounded-lg border px-2 text-xs font-medium transition-colors",
                      selectedId === opt.id
                        ? "border-accent bg-accent/15 text-fg"
                        : "border-line bg-panel text-fg-2 hover:bg-raised",
                    )}
                  >
                    {opt.labelKo}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <p role="status" className="text-[0.6875rem] text-fg-3">
            적용 색: 앞({resolvedHairColors.frontColorId}) · 옆({resolvedHairColors.sideColorId}) · 뒤(
            {resolvedHairColors.backColorId})
          </p>
        </div>
      )}
    </section>
  );
}
