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

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface StudioEraserAdvancedSectionProps {
  readonly advancedSettings?: Partial<StudioAdvancedEraserSettings> | null;
  readonly onAdvancedSettingsChange: (next: StudioAdvancedEraserSettings) => void;
}

export function StudioEraserAdvancedSection({
  advancedSettings,
  onAdvancedSettingsChange,
}: StudioEraserAdvancedSectionProps): ReactElement {
  const bt = useBilingual("studio.eraserAdvanced");
  const normalizedAdvanced = normalizeStudioAdvancedEraserSettings(
    advancedSettings ?? DEFAULT_STUDIO_ADVANCED_ERASER_SETTINGS,
  );
  const profileLabels: Record<StudioEraserResponseProfileId, readonly [string, string]> = {
    hard: ["선명 지우개", "Crisp"],
    soft: ["부드러운 지우개", "Soft"],
    kneaded: ["떡지우개", "Kneaded"],
    rough: ["거친 지우개", "Textured"],
    dynamic: ["필압 반응 지우개", "Dynamic"],
  };

  return (
    <details
      data-studio-eraser-advanced="true"
      className="col-span-full rounded-xl border border-line/70 bg-card/60 px-3 py-2 text-xs [word-break:keep-all]"
    >
      <summary className="flex min-h-11 cursor-pointer items-center justify-between font-semibold text-fg">
        <span>{bt("지우개 세부 동작 (자 스냅 · 다중 레이어)", "Eraser options (ruler snap · multi-layer)")}</span>
        <span className="text-[0.65rem] text-fg-3">
          {bt(STUDIO_ERASER_PROFILES[normalizedAdvanced.profile].labelKo, profileLabels[normalizedAdvanced.profile]?.[1] ?? normalizedAdvanced.profile)}
        </span>
      </summary>
      <div className="space-y-2 border-t border-line/50 pt-2">
        <label className="flex min-h-11 items-center justify-between gap-2">
          <span className="text-fg-2">{bt("지우개 감도 질감", "Eraser feel")}</span>
          <select
            aria-label={bt("지우개 감도 질감", "Eraser feel")}
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
                {bt(STUDIO_ERASER_PROFILES[id].labelKo, profileLabels[id]?.[1] ?? id)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2">
          <span className="text-fg-2">{bt("자·원근자에 맞추어 지우기 (스냅 지우개)", "Snap eraser to active rulers")}</span>
          <input
            type="checkbox"
            aria-label={bt("자·원근자에 맞추어 지우기", "Snap eraser to active rulers")}
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
          <span className="text-fg-2">{bt("여러 레이어 동시 지우기 범위", "Multi-layer erase scope")}</span>
          <select
            aria-label={bt("여러 레이어 동시 지우기 범위", "Multi-layer erase scope")}
            value={normalizedAdvanced.multiLayerScope}
            onChange={(e) =>
              onAdvancedSettingsChange({
                ...normalizedAdvanced,
                multiLayerScope: e.target.value as StudioMultiLayerEraseScope,
              })
            }
            className="min-h-11 rounded-lg border border-line bg-card px-2 text-xs text-fg"
          >
            <option value="active-only">{bt("현재 레이어만", "Active layer only")}</option>
            <option value="selected-layers">{bt("선택된 레이어들", "Selected layers")}</option>
            <option value="all-visible-unlocked">{bt("보이는 모든 레이어 (참조 보호)", "All visible layers (keep reference)")}</option>
          </select>
        </label>
      </div>
    </details>
  );
}
