import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";

import { StudioThreeDToggleControl } from "../StudioThreeDToggle";

import {
  HEAD_PART_REGION_LABELS_KO,
  HEAD_PART_REGIONS,
  HEAD_PART_SLIDER_SPECS,
  WEBTOON_HEAD_STYLE_IDS,
  WEBTOON_HEAD_STYLE_PRESETS,
  createDefaultHeadMixerState,
  resolveHeadMixerMorphTargets,
  setSingleHeadStylePreset,
  toggleHeadSymmetryMode,
  updateHeadPartSlider,
  updateHeadStyleWeight,
  type HeadPartRegionId,
  type Studio3dHeadMixerState,
} from "./studio-3d-head-mixer";

import { cn } from "@/shared/lib/utils";

export interface Studio3dHeadMixerPanelProps {
  readonly state: Studio3dHeadMixerState;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onChange: (next: Studio3dHeadMixerState) => void;
}

/**
 * CSP 2.0+ 3D 두상 모델 믹서 패널.
 * 9종 웹툰 기본 두상 가중치 블렌딩, 34부위 독립 슬라이더, 좌우 비대칭 편집,
 * 루미스·중심선 3D 가이드 토글을 차분한 스튜디오 토큰으로 제공한다.
 */
export function Studio3dHeadMixerPanel({
  state,
  disabled = false,
  className,
  onChange,
}: Studio3dHeadMixerPanelProps) {
  const [activeRegion, setActiveRegion] = useState<HeadPartRegionId>("eyes");
  const [activeSide, setActiveSide] = useState<"both" | "left" | "right">("both");

  const resolved = useMemo(() => resolveHeadMixerMorphTargets(state), [state]);
  const regionSliders = useMemo(
    () => HEAD_PART_SLIDER_SPECS.filter((spec) => spec.region === activeRegion),
    [activeRegion],
  );

  const isAsymmetric = state.symmetryMode === "asymmetric";
  const effectiveSide = isAsymmetric ? activeSide : "both";

  return (
    <section
      aria-label="3D 두상 모델 믹서"
      data-testid="studio-3d-head-mixer-panel"
      className={cn(
        "rounded-xl border border-line bg-card p-3 text-fg",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-line/70 pb-2">
        <div>
          <h3 className="text-xs font-semibold text-fg">3D 두상 모델 믹서</h3>
          <p className="text-[0.6875rem] text-fg-3">
            9종 기본 두상 비율 혼합과 {HEAD_PART_SLIDER_SPECS.length}부위 정밀 조형
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(createDefaultHeadMixerState("modern-drama"))}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-panel px-2.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          초기화
        </button>
      </header>

      <div className="mt-2.5">
        <p className="mb-1.5 text-[0.6875rem] font-semibold text-fg-2">
          웹툰 기본 두상 스타일 (9종 혼합)
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {WEBTOON_HEAD_STYLE_IDS.map((styleId) => {
            const preset = WEBTOON_HEAD_STYLE_PRESETS[styleId];
            const ratio = Math.round(resolved.normalizedStyleWeights[styleId] * 100);
            const isActive = ratio > 0;
            return (
              <div
                key={styleId}
                className={cn(
                  "rounded-lg border p-1.5 transition-colors",
                  isActive
                    ? "border-accent bg-accent/10"
                    : "border-line bg-panel",
                )}
              >
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={isActive}
                  onClick={() => onChange(setSingleHeadStylePreset(state, styleId))}
                  className="flex min-h-11 w-full flex-col items-start justify-center rounded px-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="text-[0.6875rem] font-semibold text-fg">
                    {preset.labelKo}
                  </span>
                  <span className="text-[0.625rem] tabular-nums text-fg-3">
                    {ratio}%
                  </span>
                </button>
                <input
                  type="range"
                  aria-label={`${preset.labelKo} 혼합 가중치`}
                  min={0}
                  max={1}
                  step={0.05}
                  value={state.styleWeights[styleId]}
                  disabled={disabled}
                  onChange={(event) => onChange(
                    updateHeadStyleWeight(state, styleId, event.currentTarget.valueAsNumber),
                  )}
                  className="mt-1 h-5 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 space-y-1 border-y border-line/70 py-1.5">
        <StudioThreeDToggleControl
          checked={isAsymmetric}
          disabled={disabled}
          label="좌우 비대칭 편집"
          description="눈·광대·턱·귀·입꼬리를 왼쪽과 오른쪽으로 분리해 조절합니다."
          labelClassName="text-xs font-medium text-fg-2"
          descriptionClassName="text-[0.6875rem] text-fg-3"
          onChange={(checked) => {
            onChange(toggleHeadSymmetryMode(state, checked ? "asymmetric" : "symmetric"));
            if (!checked) setActiveSide("both");
          }}
        />
        <StudioThreeDToggleControl
          checked={state.showLoomisGuide}
          disabled={disabled}
          label="루미스·중심선 3D 가이드"
          description="두개골 구·측면 타원·안면 3등분 기준선을 뷰포트에 투영합니다."
          labelClassName="text-xs font-medium text-fg-2"
          descriptionClassName="text-[0.6875rem] text-fg-3"
          onChange={(showLoomisGuide) => onChange({ ...state, showLoomisGuide })}
        />
      </div>

      {isAsymmetric ? (
        <div role="group" aria-label="편집 대상 면 선택" className="mt-2.5 grid grid-cols-3 gap-1.5">
          {([
            ["both", "양쪽 동시"],
            ["left", "왼쪽만"],
            ["right", "오른쪽만"],
          ] as const).map(([sideKey, label]) => (
            <button
              key={sideKey}
              type="button"
              disabled={disabled}
              aria-pressed={activeSide === sideKey}
              onClick={() => setActiveSide(sideKey)}
              className={cn(
                "min-h-11 rounded-lg border px-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                activeSide === sideKey
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="두상 부위 선택"
        className="mt-3 flex flex-wrap gap-1"
      >
        {HEAD_PART_REGIONS.map((region) => (
          <button
            key={region}
            type="button"
            role="tab"
            aria-selected={activeRegion === region}
            disabled={disabled}
            onClick={() => setActiveRegion(region)}
            className={cn(
              "min-h-11 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
              activeRegion === region
                ? "border-accent bg-accent/15 text-fg"
                : "border-line bg-panel text-fg-3 hover:text-fg",
            )}
          >
            {HEAD_PART_REGION_LABELS_KO[region]}
          </button>
        ))}
      </div>

      <div className="mt-2.5 space-y-2" role="tabpanel" aria-label={HEAD_PART_REGION_LABELS_KO[activeRegion]}>
        {regionSliders.map((spec) => {
          const currentValue = effectiveSide === "left" && spec.supportsAsymmetry
            ? (state.leftAsymmetryOffsets[spec.id] ?? 0)
            : effectiveSide === "right" && spec.supportsAsymmetry
              ? (state.rightAsymmetryOffsets[spec.id] ?? 0)
              : (state.partOffsets[spec.id] ?? 0);
          const resolvedValue = effectiveSide === "left"
            ? resolved.leftParts[spec.id]
            : effectiveSide === "right"
              ? resolved.rightParts[spec.id]
              : resolved.centerParts[spec.id];

          return (
            <label
              key={spec.id}
              className="block rounded-lg border border-line/80 bg-panel px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-fg-2">
                  {spec.labelKo}
                  {isAsymmetric && spec.supportsAsymmetry && effectiveSide !== "both"
                    ? ` (${effectiveSide === "left" ? "좌" : "우"})`
                    : ""}
                </span>
                <span aria-hidden="true" className="tabular-nums text-[0.6875rem] text-fg-3">
                  {Math.round(resolvedValue * 100)}%
                </span>
              </div>
              <input
                type="range"
                aria-label={spec.labelKo}
                min={spec.min}
                max={spec.max}
                step={spec.step}
                value={currentValue}
                disabled={disabled}
                onChange={(event) => onChange(
                  updateHeadPartSlider(state, spec.id, event.currentTarget.valueAsNumber, effectiveSide),
                )}
                className="mt-1 h-7 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
              />
            </label>
          );
        })}
      </div>

      <p role="status" className="mt-2.5 text-[0.6875rem] text-fg-3">
        {isAsymmetric ? "비대칭 편집 활성" : "좌우 대칭 편집"} · 루미스 가이드{" "}
        {state.showLoomisGuide ? "표시 중" : "숨김"}
      </p>
    </section>
  );
}
