/**
 * 고급 지우개 세부 동작 지연 드로어 (`StudioEraserQuickPicker` 내부 마운트).
 */
import {
  DEFAULT_STUDIO_ADVANCED_ERASER_SETTINGS,
  STUDIO_ERASER_PROFILES,
  normalizeStudioAdvancedEraserSettings,
  type StudioAdvancedEraserSettings,
  type StudioEraserResponseProfileId,
  type StudioMultiLayerEraseScope,
} from "./studio-eraser-advanced-plan";

import type { ReactElement } from "react";

export interface StudioEraserAdvancedSectionProps {
  readonly advancedSettings?: Partial<StudioAdvancedEraserSettings> | null;
  readonly onAdvancedSettingsChange: (next: StudioAdvancedEraserSettings) => void;
}

export function StudioEraserAdvancedSection({
  advancedSettings,
  onAdvancedSettingsChange,
}: StudioEraserAdvancedSectionProps): ReactElement {
  const normalizedAdvanced = normalizeStudioAdvancedEraserSettings(
    advancedSettings ?? DEFAULT_STUDIO_ADVANCED_ERASER_SETTINGS,
  );

  return (
    <details
      data-studio-eraser-advanced="true"
      className="col-span-full rounded-xl border border-line/70 bg-card/60 px-3 py-2 text-xs [word-break:keep-all]"
    >
      <summary className="flex min-h-11 cursor-pointer items-center justify-between font-semibold text-fg">
        <span>지우개 세부 동작 (자 스냅 · 다중 레이어)</span>
        <span className="text-[0.65rem] text-fg-3">
          {STUDIO_ERASER_PROFILES[normalizedAdvanced.profile].labelKo}
        </span>
      </summary>
      <div className="space-y-2 border-t border-line/50 pt-2">
        <label className="flex min-h-11 items-center justify-between gap-2">
          <span className="text-fg-2">지우개 감도 질감</span>
          <select
            aria-label="지우개 감도 질감"
            value={normalizedAdvanced.profile}
            onChange={(e) =>
              onAdvancedSettingsChange({
                ...normalizedAdvanced,
                profile: e.target.value as StudioEraserResponseProfileId,
              })
            }
            className="min-h-11 rounded-lg border border-line bg-card px-2 text-xs text-fg"
          >
            {(Object.keys(STUDIO_ERASER_PROFILES) as StudioEraserResponseProfileId[]).map((id) => (
              <option key={id} value={id}>
                {STUDIO_ERASER_PROFILES[id].labelKo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2">
          <span className="text-fg-2">자·원근자에 맞추어 지우기 (스냅 지우개)</span>
          <input
            type="checkbox"
            aria-label="자·원근자에 맞추어 지우기"
            checked={normalizedAdvanced.snapToRulers}
            onChange={(e) =>
              onAdvancedSettingsChange({
                ...normalizedAdvanced,
                snapToRulers: e.target.checked,
              })
            }
            className="size-4 accent-accent"
          />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-2">
          <span className="text-fg-2">여러 레이어 동시 지우기 범위</span>
          <select
            aria-label="여러 레이어 동시 지우기 범위"
            value={normalizedAdvanced.multiLayerScope}
            onChange={(e) =>
              onAdvancedSettingsChange({
                ...normalizedAdvanced,
                multiLayerScope: e.target.value as StudioMultiLayerEraseScope,
              })
            }
            className="min-h-11 rounded-lg border border-line bg-card px-2 text-xs text-fg"
          >
            <option value="active-only">현재 레이어만</option>
            <option value="selected-layers">선택된 레이어들</option>
            <option value="all-visible-unlocked">보이는 모든 레이어 (참조 보호)</option>
          </select>
        </label>
      </div>
    </details>
  );
}
