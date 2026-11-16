import { useId } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { STUDIO_HYBRID_DCC_SCULPT_BRUSH_LABELS } from "./studio-hybrid-dcc-tool-catalog";

import type { StudioHybridDccSculptStrokeModel } from "./useStudioHybridDccSculptStroke";

const BRUSHES = ["grab", "smooth", "inflate", "clay", "crease", "flatten", "scrape", "snakeHook"] as const;
const RADIUS_PRESETS = ["0.2", "0.45", "0.8"] as const;
const STRENGTH_PRESETS = ["0.1", "0.2", "0.45"] as const;
const BUTTON = "min-h-11 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 [word-break:keep-all]";

export interface StudioHybridDccSculptToolsProps {
  readonly model: StudioHybridDccSculptStrokeModel;
  readonly busy: boolean;
  readonly hasActiveAsset?: boolean;
  readonly onAddSculptSphere?: () => void;
  readonly onSubdivideActive?: () => void;
}

/** 드래그 중 임시 메시와 확정·취소 상태를 원본 편집 이력과 구분해 안내한다. */
export function StudioHybridDccSculptTools({
  model,
  busy,
  hasActiveAsset = false,
  onAddSculptSphere,
  onSubdivideActive,
}: StudioHybridDccSculptToolsProps) {
  const bt = useBilingual("StudioHybridDccSculptTools");
  const id = useId();
  return <div className="mt-3 space-y-2.5" data-studio-hybrid-dcc-sculpt-phase={model.phase}>
    {(onAddSculptSphere || onSubdivideActive) ? (
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-line/70 bg-canvas/35 p-2">
        {onAddSculptSphere ? (
          <button
            type="button"
            disabled={busy}
            onClick={onAddSculptSphere}
            className={cn(BUTTON, "border-accent/55 bg-accent-soft text-accent hover:bg-accent/15")}
          >
            {bt("조형 구체 추가", "Add sculpt sphere")}
          </button>
        ) : null}
        {onSubdivideActive ? (
          <button
            type="button"
            disabled={busy || !hasActiveAsset}
            onClick={onSubdivideActive}
            className={cn(BUTTON, "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}
          >
            {bt("1단계 세분화 (Subdivide)", "Subdivide +1")}
          </button>
        ) : null}
      </div>
    ) : null}
    <div role="radiogroup" aria-label={bt("조형 브러시 종류", "Sculpt brush type")}
      className="flex flex-wrap gap-1.5 rounded-xl border border-line/70 bg-canvas/35 p-2">
      {BRUSHES.map((kind) => <button key={kind} type="button" role="radio" aria-checked={model.kind === kind}
        disabled={busy} onClick={() => model.setKind(kind)}
        className={cn(BUTTON, model.kind === kind ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}>
        {bt(STUDIO_HYBRID_DCC_SCULPT_BRUSH_LABELS[kind][0], STUDIO_HYBRID_DCC_SCULPT_BRUSH_LABELS[kind][1])}
      </button>)}
      <button type="button" aria-pressed={model.carve} disabled={busy} onClick={() => model.setCarve((current) => !current)}
        className={cn(BUTTON, model.carve ? "border-warn bg-warn/10 text-warn" : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}>
        {model.carve ? bt("깎기 켜짐", "Carve on") : bt("깎기 꺼짐", "Carve off")}
      </button>
    </div>
    <div className="space-y-2.5">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`${id}-radius`} className="text-xs font-semibold text-fg">
            {bt("드래그 브러시 크기", "Drag brush size")}
          </label>
          <div className="flex gap-1">
            {RADIUS_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={busy}
                onClick={() => model.setRadiusText(preset)}
                className={cn(
                  "min-h-11 min-w-11 rounded-md border px-2 font-mono text-[0.6875rem] font-semibold",
                  model.radiusText === preset
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
                )}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
        <input id={`${id}-radius`} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
          value={model.radiusText} disabled={busy}
          aria-invalid={model.radiusError ? true : undefined}
          aria-describedby={`${id}-radius-help${model.radiusError ? ` ${id}-radius-error` : ""}`}
          onChange={(event) => { if (!busy) model.setRadiusText(event.target.value); }}
          className="min-h-11 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40" />
        <p id={`${id}-radius-help`} className="text-xs text-fg-2">
          {bt("드래그 영역의 반경입니다. 모델 단위를 사용합니다.", "Radius for drag strokes in model units.")}
        </p>
        {model.radiusError ? <p id={`${id}-radius-error`} role="alert" className="text-xs text-warn">{model.radiusError}</p> : null}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`${id}-strength`} className="text-xs font-semibold text-fg">
            {bt("브러시 강도", "Brush strength")}
          </label>
          <div className="flex gap-1">
            {STRENGTH_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={busy}
                onClick={() => model.setStrengthText(preset)}
                className={cn(
                  "min-h-11 min-w-11 rounded-md border px-2 font-mono text-[0.6875rem] font-semibold",
                  model.strengthText === preset
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-3 hover:bg-raised hover:text-fg",
                )}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
        <input id={`${id}-strength`} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
          value={model.strengthText} disabled={busy}
          aria-invalid={model.strengthError ? true : undefined}
          aria-describedby={model.strengthError ? `${id}-strength-error` : undefined}
          onChange={(event) => { if (!busy) model.setStrengthText(event.target.value); }}
          className="min-h-11 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40" />
        <p className="text-xs text-fg-2">
          {bt("기본 0.2 · 높을수록 한 번에 깊게 조형됩니다 (최대 2).", "Default 0.2 · Higher values displace deeper per stroke (max 2).")}
        </p>
        {model.strengthError ? <p id={`${id}-strength-error`} role="alert" className="text-xs text-warn">{model.strengthError}</p> : null}
      </div>
    </div>
    <div role="group" aria-label={bt("대칭 조형 축", "Mirror symmetry axes")}
      className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line/70 bg-canvas/35 p-2">
      <span className="px-1 text-xs font-semibold text-fg-2 [word-break:keep-all]">
        {bt("미러 대칭", "Mirror symmetry")}
      </span>
      {(["x", "y", "z"] as const).map((axis) => {
        const active = model.symmetry[axis];
        const axisUpper = axis.toUpperCase();
        return (
          <button
            key={axis}
            type="button"
            aria-pressed={active}
            disabled={busy}
            data-studio-sculpt-symmetry={axis}
            onClick={() => model.toggleSymmetry(axis)}
            className={cn(
              BUTTON,
              "min-w-11",
              active
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            {bt(`${axisUpper} 대칭`, `Mirror ${axisUpper}`)}
          </button>
        );
      })}
      <span className="ml-auto rounded-full bg-raised px-2 py-0.5 font-mono text-[0.65rem] text-fg-3">
        {(["x", "y", "z"] as const).filter((axis) => model.symmetry[axis]).map((axis) => axis.toUpperCase()).join("·") || bt("꺼짐", "Off")}
      </span>
    </div>
    <p className="text-xs text-fg-2">{bt("원본 메시에서 조형합니다. 드래그 한 번을 되돌리기 한 번으로 복원하며 Esc로 취소합니다.", "Sculpt the source mesh. One undo restores a drag; Esc cancels it.")}</p>
    {model.engaged ? <button type="button" onClick={model.cancel} className={cn(BUTTON, "border-line bg-card text-fg-2 hover:bg-raised")}>
      {bt("조형 취소", "Cancel sculpting")}
    </button> : null}
    {model.notice ? <p role="status" className="text-xs text-fg-2">{model.notice}</p> : null}
    {model.error ? <p role="alert" className="text-xs text-warn">{model.error}</p> : null}
  </div>;
}
