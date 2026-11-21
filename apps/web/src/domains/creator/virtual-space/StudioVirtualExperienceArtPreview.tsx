import { Suspense, useId, useState } from "react";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { studioCharacterAtlasGridFrames } from "./studio-virtual-space-character-atlas";
import { studioExperienceAssetUrl, studioExperienceAtlas, type StudioExperienceAtlasKind } from "./studio-virtual-space-experience-art";
import "./studio-virtual-space-experience-art-preview.css";

const LazyStudioManualSpectaclePanel = lazyRetry(
  () =>
    import("../interactive-manual-spectacle/StudioManualSpectaclePanel").then((module) => ({
      default: module.StudioManualSpectaclePanel,
    })),
  "StudioManualSpectaclePanel",
);

/** 가구·건물 선택과 배치 지도는 장면 렌더러와 같은 원본 프레임을 표시한다. */
export function StudioVirtualExperienceArtPreview({ kind, artStyle, frame: index, className, x, y, width, height, preserveAspectRatio = "xMidYMid meet" }: {
  readonly kind: StudioExperienceAtlasKind;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly frame: number;
  readonly className?: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly preserveAspectRatio?: string;
}) {
  const clipId = useId(), atlas = studioExperienceAtlas(kind, artStyle);
  const frame = studioCharacterAtlasGridFrames(atlas)[index];
  const [manualSpectacleOpen, setManualSpectacleOpen] = useState(false);
  const svg = <svg className={["studio-experience-art-preview", className].filter(Boolean).join(" ")}
    x={x} y={y} width={width} height={height} viewBox={frame ? `${frame.x} ${frame.y} ${frame.width} ${frame.height}` : "0 0 1 1"}
    preserveAspectRatio={preserveAspectRatio} overflow="hidden" pointerEvents="none" aria-hidden="true" focusable="false"
    data-experience-atlas={kind} data-experience-frame={index} data-art-style={artStyle}>
    {frame ? <>
      <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse"><rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} /></clipPath></defs>
      <image href={studioExperienceAssetUrl(kind, artStyle)} x="0" y="0" width={atlas.width} height={atlas.height} pointerEvents="none" clipPath={`url(#${clipId})`} />
    </> : null}
  </svg>;
  if (x !== undefined || y !== undefined) return svg;
  return <>
    {svg}
    <details
      data-testid="studio-manual-spectacle-disclosure"
      className="mt-3 rounded-xl border border-line bg-panel p-3 text-left"
      onToggle={(event) => setManualSpectacleOpen(event.currentTarget.open)}
    >
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-xs font-semibold text-fg">
        <span className="min-w-0 [word-break:keep-all]">
          3분 인터랙티브 매뉴얼 · 비포/애프터 쇼케이스 · 4대 장르 무드 · IP 가치 평가
        </span>
      </summary>
      {manualSpectacleOpen ? (
        <div className="mt-3 border-t border-line pt-3">
          <Suspense
            fallback={
              <div className="rounded-xl border border-line bg-card p-3 text-xs text-fg-2">
                3분 인터랙티브 매뉴얼과 IP 가치 시뮬레이터를 불러오는 중입니다.
              </div>
            }
          >
            <LazyStudioManualSpectaclePanel />
          </Suspense>
        </div>
      ) : null}
    </details>
  </>;
}
