import { ChevronDown, SunMedium } from "lucide-react";
import { useId, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  getStudioHybridDccPbrPreset,
  STUDIO_HYBRID_DCC_PBR_PRESETS,
  type StudioHybridDccPbrPresetId,
} from "./materials/studio-hybrid-dcc-pbr-presets";
import {
  STUDIO_HYBRID_DCC_SNAP_LIMITS,
  type StudioHybridDccViewportPreferences,
} from "./studio-hybrid-dcc-viewport-interaction";

interface Props {
  readonly preferences: StudioHybridDccViewportPreferences;
  readonly onChange: (patch: Partial<StudioHybridDccViewportPreferences>) => void;
  readonly isolatedAssetId: string | null;
  readonly hasSelection: boolean;
  readonly dragging: boolean;
  readonly onToggleIsolation: () => void;
  readonly notice: string;
  readonly pbrPresetId?: StudioHybridDccPbrPresetId;
  readonly onPbrPresetChange?: (presetId: StudioHybridDccPbrPresetId) => void;
}
const CONTROL = "min-h-11 min-w-0 rounded-lg border border-line bg-card px-2.5 text-xs text-fg-2 tabular-nums transition-[background-color,border-color,color,transform] duration-150 hover:bg-raised hover:text-fg enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none aria-[pressed=true]:border-accent/55 aria-[pressed=true]:bg-accent-soft aria-[pressed=true]:font-semibold aria-[pressed=true]:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 [word-break:keep-all]";

export function StudioHybridDccViewportInteractionBar({
  preferences, onChange, isolatedAssetId, hasSelection, dragging, onToggleIsolation, notice,
  pbrPresetId = "studio-clay", onPbrPresetChange,
}: Props) {
  const id = useId();
  const bt = useBilingual("StudioHybridDccViewportInteractionBar");
  const [inputError, setInputError] = useState("");
  const activePbrPreset = getStudioHybridDccPbrPreset(pbrPresetId);
  return (
    <section aria-label="뷰포트 스냅과 표시 설정" className="mt-2 space-y-2 rounded-xl border border-line bg-panel p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={CONTROL} aria-pressed={preferences.snapping} disabled={dragging}
          onClick={() => onChange({ snapping: !preferences.snapping })}>
          스냅 {preferences.snapping ? "켜짐" : "꺼짐"} · Shift+Tab
        </button>
        <button type="button" className={CONTROL} aria-pressed={Boolean(isolatedAssetId)}
          disabled={dragging || (!hasSelection && !isolatedAssetId)} onClick={onToggleIsolation}>
          {isolatedAssetId ? "격리 해제 · 전체 복원" : "선택 오브젝트 격리"}
        </button>
        {([
          ["showGrid", "그리드"], ["showAxes", "좌표축"], ["showGround", "바닥 그림자"],
        ] as const).map(([key, label]) => (
          <button key={key} type="button" className={CONTROL} aria-pressed={preferences[key]}
            onClick={() => onChange({ [key]: !preferences[key] })}>{label}</button>
        ))}
        <span className="text-[11px] text-fg-3">/ 격리 · F 선택 맞춤 · Esc 드래그 취소</span>
      </div>
      {onPbrPresetChange ? (
        <details className="group rounded-xl border border-line/70 bg-canvas/35" data-testid="studio-hybrid-dcc-pbr-look-disclosure">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-fg-2 hover:bg-raised/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            <span className="inline-flex min-w-0 items-center gap-1.5 [word-break:keep-all]">
              <SunMedium size={13} aria-hidden="true" className="shrink-0 text-accent" />
              <span className="truncate">{bt("스튜디오 표면 질감", "Studio surface look")}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-fg-3">
              <span className="rounded-full bg-raised px-2 py-0.5 text-fg-2">
                {bt(activePbrPreset.label[0], activePbrPreset.label[1])}
              </span>
              <ChevronDown size={13} aria-hidden="true" className="shrink-0 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
            </span>
          </summary>
          <div className="grid grid-cols-2 gap-1.5 border-t border-line/60 p-2 sm:grid-cols-3" role="group" aria-label={bt("스튜디오 표면 질감 프리셋", "Studio surface presets")}>
            {STUDIO_HYBRID_DCC_PBR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={preset.id === pbrPresetId}
                disabled={dragging}
                data-studio-hybrid-dcc-pbr-preset={preset.id}
                onClick={() => onPbrPresetChange(preset.id)}
                className={`${CONTROL} flex flex-col items-start justify-center py-1.5 text-left`}
              >
                <span className="max-w-full truncate font-semibold text-fg">{bt(preset.label[0], preset.label[1])}</span>
                <span className="max-w-full truncate text-[10px] font-normal text-fg-3">{bt(preset.hint[0], preset.hint[1])}</span>
              </button>
            ))}
          </div>
        </details>
      ) : null}
      <fieldset disabled={!preferences.snapping || dragging} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <legend className="sr-only">드래그 스냅 간격</legend>
        {([
          ["translationStep", "이동 스냅 간격 (m)", 0.01],
          ["rotationStepDegrees", "회전 스냅 각도 (°)", 1],
          ["scaleStep", "크기 스냅 간격 (배율)", 0.01],
        ] as const).map(([key, label, step]) => (
          <div key={key} className="grid gap-1">
            <label htmlFor={`${id}-${key}`} className="text-[11px] text-fg-3">{label}</label>
            <input key={`${key}:${preferences[key]}`} id={`${id}-${key}`} type="number" className={CONTROL}
              min={STUDIO_HYBRID_DCC_SNAP_LIMITS[key].min} max={STUDIO_HYBRID_DCC_SNAP_LIMITS[key].max}
              step={step} defaultValue={preferences[key]}
              onBlur={(event) => {
                const input = event.currentTarget;
                const value = input.valueAsNumber;
                const { min, max } = STUDIO_HYBRID_DCC_SNAP_LIMITS[key];
                if (!Number.isFinite(value) || value < min || value > max) {
                  input.value = String(preferences[key]);
                  setInputError(`${label}: ${min}~${max} 범위의 유한한 값을 입력하세요.`);
                  return;
                }
                setInputError("");
                onChange({ [key]: value });
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
                if (event.key === "Escape") {
                  event.stopPropagation();
                  event.currentTarget.value = String(preferences[key]);
                  event.currentTarget.blur();
                }
              }} />
          </div>
        ))}
      </fieldset>
      {isolatedAssetId ? <p role="status" className="truncate text-xs text-accent">{isolatedAssetId}만 표시 중 · 문서의 숨김 상태는 변경하지 않습니다.</p> : null}
      {inputError ? <p role="alert" className="text-xs text-fg-2">{inputError}</p> : null}
      {notice ? <p role="status" className="text-xs text-fg-2">{notice}</p> : null}
    </section>
  );
}
