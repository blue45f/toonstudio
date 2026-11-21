/**
 * 집중선·속도선·섬광 v2 프리셋, 사선·다각형 컷 분할 나이프 및 만화 연출 툴킷 지연 드로어.
 */
import { Suspense, lazy, useState } from "react";

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

import type { PanelKnifeCommitResult } from "./studio-panel-knife-pointer";
import type { El, FocusLinesEl, FrameEl, SpeedLinesEl } from "../studio-element-model";
import type { LayerGroup } from "../studio-layers";
import type { ReactElement } from "react";

const LazyPanelKnifeControlSection = lazy(() =>
  import("./StudioPanelKnifeControlSection").then((m) => ({
    default: m.StudioPanelKnifeControlSection,
  })),
);

const LazyMangaToolkitPanel = lazy(() =>
  import("../manga-toolkit/MangaToolkitPanel").then((m) => ({
    default: m.MangaToolkitPanel,
  })),
);

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

const DRAWER_BUTTON_CLASS =
  "min-h-11 rounded-md border border-line bg-panel px-2 py-1 text-xs font-medium text-fg-2 transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none motion-reduce:transform-none enabled:active:scale-[0.98] hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function LazyMangaToolkitDisclosure(): ReactElement {
  const [opened, setOpened] = useState(false);
  return (
    <details
      onToggle={(event) => setOpened(event.currentTarget.open)}
      className="rounded-lg border border-line/70 bg-card/45 p-2 [word-break:keep-all]"
    >
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-xs font-semibold text-fg-2">
        <span>만화 연출 툴킷</span>
        <span className="text-[0.68rem] font-normal text-fg-3">컷·말풍선·효과선</span>
      </summary>
      {opened ? (
        <div className="mt-2 rounded-lg border border-line/60 bg-panel/60">
          <Suspense
            fallback={
              <p className="px-3 py-4 text-xs text-fg-3" role="status">
                만화 연출 툴킷을 불러오는 중입니다...
              </p>
            }
          >
            <LazyMangaToolkitPanel />
          </Suspense>
        </div>
      ) : null}
    </details>
  );
}

export interface StudioComicEffectV2DrawerProps {
  readonly selected: FocusLinesEl | SpeedLinesEl | FrameEl;
  readonly panelGutter: number;
  readonly panelSplitRatio: number;
  readonly onPatch: (patch: Partial<El>) => void;
  readonly onReplaceSplitFrames?: (frames: readonly [FrameEl, FrameEl]) => void;
  readonly elements?: readonly El[];
  readonly groups?: readonly LayerGroup[];
  readonly onCommitKnifeSplit?: (result: PanelKnifeCommitResult) => void;
}

export function StudioComicEffectV2Drawer({
  selected,
  panelGutter,
  panelSplitRatio,
  onPatch,
  onReplaceSplitFrames,
  elements,
  groups,
  onCommitKnifeSplit,
}: StudioComicEffectV2DrawerProps): ReactElement {
  const [knifeOpened, setKnifeOpened] = useState(false);

  if (selected.type === "focusLines") {
    return (
      <div className="space-y-2">
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
                className={DRAWER_BUTTON_CLASS}
              >
                {STUDIO_EFFECT_LINE_V2_PRESETS[id].label}
              </button>
            ))}
            {FLASH_IDS.map((variant) => (
              <button
                key={variant}
                type="button"
                onClick={() => onPatch(flashVariantToFocusLinesPatch(variant) as Partial<El>)}
                className={DRAWER_BUTTON_CLASS}
              >
                {STUDIO_FLASH_SUBTOOL_PRESETS[variant].label}
              </button>
            ))}
          </div>
        </details>
        <LazyMangaToolkitDisclosure />
      </div>
    );
  }

  if (selected.type === "speedLines") {
    return (
      <div className="space-y-2">
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
                className={DRAWER_BUTTON_CLASS}
              >
                {STUDIO_EFFECT_LINE_V2_PRESETS[id].label}
              </button>
            ))}
          </div>
        </details>
        <LazyMangaToolkitDisclosure />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <details
        onToggle={(event) => setKnifeOpened(event.currentTarget.open)}
        className="rounded-lg border border-line/70 bg-card/45 p-2 [word-break:keep-all]"
      >
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-xs font-semibold text-fg-2">
          <span>사선·다각형 컷 나이프</span>
          <span className="text-[0.68rem] font-normal text-fg-3">드래그 분할</span>
        </summary>
        {knifeOpened ? (
          <div className="mt-2">
            <Suspense
              fallback={
                <p className="px-2 py-3 text-xs text-fg-3" role="status">
                  컷 분할 나이프를 여는 중입니다...
                </p>
              }
            >
              <LazyPanelKnifeControlSection
                frame={selected}
                panelGutter={panelGutter}
                panelSplitRatio={panelSplitRatio}
                elements={elements}
                groups={groups}
                onReplaceSplitFrames={onReplaceSplitFrames}
                onCommitKnifeSplit={onCommitKnifeSplit}
              />
            </Suspense>
          </div>
        ) : null}
      </details>

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
            className={`${DRAWER_BUTTON_CLASS} font-semibold`}
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
            className={`${DRAWER_BUTTON_CLASS} font-semibold`}
          >
            {onReplaceSplitFrames ? "독립 여백 2분할" : "직사각형 테두리 복원"}
          </button>
        </div>
      </details>

      <LazyMangaToolkitDisclosure />
    </div>
  );
}
