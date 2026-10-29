import { Group } from "react-konva/lib/ReactKonvaCore";
import type { ReactNode } from "react";
import type Konva from "konva";
import type { StudioFrameClip } from "@toonstudio/studio-project-model/frame-clip";
import { BlendIsolationGroup } from "../BlendIsolationGroup";
import { studioKonvaPanelClip } from "./studio-konva-panel-clip";

/** 컷의 같은 경로를 일반 합성과 요소 단위 합성 모두에 적용한다. */
export function StudioPanelClipGroup({ isolated, composite, cacheKey, clip, children }: {
  readonly isolated: boolean;
  readonly composite: NonNullable<Konva.NodeConfig["globalCompositeOperation"]>;
  readonly cacheKey: string;
  readonly clip: StudioFrameClip | null;
  readonly children: ReactNode;
}) {
  if (isolated) return <BlendIsolationGroup composite={composite} cacheKey={cacheKey}
    {...(clip ? { clip } : {})}>{children}</BlendIsolationGroup>;
  return clip ? <Group {...studioKonvaPanelClip(clip)}>{children}</Group> : children;
}
