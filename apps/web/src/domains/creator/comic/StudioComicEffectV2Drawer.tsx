/**
 * 집중선·속도선·섬광 v2 프리셋 및 다각형 컷 테두리 지연 드로어.
 */
import { generateRoughFrameOutline, splitFramePolygonWithDualGutters } from "./studio-frame-polygon-author";
import {
  STUDIO_EFFECT_LINE_V2_PRESETS,
  effectLinePresetToElementPatch,
  type StudioFocusPresetId,
  type StudioSpeedPresetId,
} from "../render/studio-effect-line-planner-v2";
import {
  STUDIO_FLASH_SUBTOOL_PRESETS,
  flashVariantToFocusLinesPatch,
  type StudioFlashVariant,
} from "../render/studio-flash-geometry";

import type { El, FocusLinesEl, FrameEl, SpeedLinesEl } from "../studio-element-model";
import type { ReactElement } from "react";

const FOCUS_V2_IDS: readonly StudioFocusPresetId[] = [
  "scattered-focus",
  "dense-focus",
  "dark-curved-focus",
  "burst",
];
const SPEED_V2_IDS: readonly StudioSpeedPresetId[] = [
  "scattered-speed",
  "dark-speed",
  "gloom",
  "rain",
];
const FLASH_IDS: readonly StudioFlashVariant[] = [
  "flash",
  "dense-flash",
  "sea-urchin",
  "firework",
  "flash-pattern",
];

export interface StudioComicEffectV2DrawerProps {
  readonly selected: FocusLinesEl | SpeedLinesEl | FrameEl;
  readonly panelGutter: number;
  readonly panelSplitRatio: number;
  readonly onPatch: (patch: Partial<El>) => void;
  readonly onReplaceSplitFrames?: (frames: readonly [FrameEl, FrameEl]) => void;
}

export function StudioComicEffectV2Drawer({
  selected,
  panelGutter,
  panelSplitRatio,
  onPatch,
  onReplaceSplitFrames,
}: StudioComicEffectV2DrawerProps): ReactElement {
  if (selected.type === "focusLines") {
    return (
      <details className="rounded-lg border border-line/70 bg-card/45 p-2 [word-break:keep-all]">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between text-xs font-semibold text-fg-2">
          <span>고급 스트림·플래시 프리셋</span>
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {FOCUS_V2_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onPatch(effectLinePresetToElementPatch(id) as Partial<El>)}
              className="min-h-11 rounded-md border border-line bg-panel px-2 py-1 text-xs font-medium text-fg-2 transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none hover:bg-raised hover:text-fg"
            >
              {STUDIO_EFFECT_LINE_V2_PRESETS[id].label}
            </button>
          ))}
          {FLASH_IDS.map((variant) => (
            <button
              key={variant}
              type="button"
              onClick={() => onPatch(flashVariantToFocusLinesPatch(variant) as Partial<El>)}
              className="min-h-11 rounded-md border border-line bg-panel px-2 py-1 text-xs font-medium text-fg-2 transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none hover:bg-raised hover:text-fg"
            >
              {STUDIO_FLASH_SUBTOOL_PRESETS[variant].label}
            </button>
          ))}
        </div>
      </details>
    );
  }

  if (selected.type === "speedLines") {
    return (
      <details className="rounded-lg border border-line/70 bg-card/45 p-2 [word-break:keep-all]">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between text-xs font-semibold text-fg-2">
          <span>침울선·빗줄기 스트림 프리셋</span>
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {SPEED_V2_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onPatch(effectLinePresetToElementPatch(id) as Partial<El>)}
              className="min-h-11 rounded-md border border-line bg-panel px-2 py-1 text-xs font-medium text-fg-2 transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none hover:bg-raised hover:text-fg"
            >
              {STUDIO_EFFECT_LINE_V2_PRESETS[id].label}
            </button>
          ))}
        </div>
      </details>
    );
  }

  return (
    <details className="rounded-lg border border-line/70 bg-card/45 p-2 [word-break:keep-all]">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between text-xs font-semibold text-fg-2">
        <span>거친 손그림 테두리·독립 여백</span>
      </summary>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => {
            const rough = generateRoughFrameOutline(selected);
            onPatch({ points: rough.closedLocalPoints } as Partial<El>);
          }}
          className="min-h-11 rounded-md border border-line bg-panel px-2 py-1 text-xs font-semibold text-fg-2 transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none hover:bg-raised hover:text-fg"
        >
          거친 손그림 테두리
        </button>
        <button
          type="button"
          onClick={() => {
            if (onReplaceSplitFrames) {
              const midY = selected.y + selected.height * (panelSplitRatio / 100);
              const pair = splitFramePolygonWithDualGutters(
                selected,
                {
                  start: { x: selected.x - 20, y: midY },
                  end: { x: selected.x + selected.width + 20, y: midY },
                },
                {
                  horizontalGapPx: Math.max(24, panelGutter),
                  verticalGapPx: Math.max(8, Math.round(panelGutter * 0.5)),
                },
              );
              if (pair) onReplaceSplitFrames(pair);
            } else {
              onPatch({ points: undefined } as Partial<El>);
            }
          }}
          className="min-h-11 rounded-md border border-line bg-panel px-2 py-1 text-xs font-semibold text-fg-2 transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none hover:bg-raised hover:text-fg"
        >
          {onReplaceSplitFrames ? "독립 여백 2분할" : "직사각형 테두리 복원"}
        </button>
      </div>
    </details>
  );
}
