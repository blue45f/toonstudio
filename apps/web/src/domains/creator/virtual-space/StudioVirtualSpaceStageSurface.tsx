import { StudioOffice2dCanvas } from "./office2d/StudioOffice2dCanvas";
import { StudioVirtualSpaceLegacyStage, StudioVirtualSpaceThreeStage } from "./office2d/StudioVirtualSpaceStages";
import type { StudioVirtualStageKind } from "./office2d/studio-virtual-space-stage-mode";
import { studioVirtualDecorationStateForWorld } from "./studio-virtual-space-decoration-layout";
import type { StudioVirtualSpacePhaserCanvasProps } from "./studio-virtual-space-phaser-canvas-model";
import type { StudioVirtualSpaceThreeStageProps } from "./three/studio-virtual-space-three-stage-props";
import { useVirtualThreeThemeContext } from "./three/ui/virtual-three-theme-context";

import { WorkstationSpaceContext, type WorkstationSpace } from "./use-studio-workstation-notebook";

type LogicalStageProps = Omit<StudioVirtualSpaceThreeStageProps, "theme" | "themeRequestRevision" | "onThemePreviewChange">;
export interface StudioVirtualSpaceStageSurfaceProps {
  readonly workstationSpace?: WorkstationSpace;
  readonly stageKind: StudioVirtualStageKind;
  readonly logical: LogicalStageProps;
  readonly twoD: Omit<StudioVirtualSpacePhaserCanvasProps, keyof LogicalStageProps>;
}

function ThreeThemeStage({ logical }: Pick<StudioVirtualSpaceStageSurfaceProps, "logical">) {
  const theme = useVirtualThreeThemeContext();
  return <StudioVirtualSpaceThreeStage manifest={logical.manifest} snapshot={logical.snapshot} bridge={logical.bridge}
    selfDisplayName={logical.selfDisplayName} onRuntimeMetrics={logical.onRuntimeMetrics} onNpcInteract={logical.onNpcInteract}
    onLocalState={logical.onLocalState} onInteract={logical.onInteract} onNearbyInteractionChange={logical.onNearbyInteractionChange}
    onPortal={logical.onPortal} onZoneChange={logical.onZoneChange} onNearbyNpcsChange={logical.onNearbyNpcsChange}
    onEngineStatusChange={logical.onEngineStatusChange} {...(logical.onReturnTo2d ? { onReturnTo2d: logical.onReturnTo2d } : {})}
    theme={theme.theme} themeRequestRevision={theme.requestRevision} onThemePreviewChange={theme.onThemePreviewChange} />;
}

/** 각 renderer에 명시적인 논리 입력과 해당 renderer의 표현 설정만 전달한다. */
export function StudioVirtualSpaceStageSurface({ stageKind, logical, twoD, workstationSpace }: StudioVirtualSpaceStageSurfaceProps) {
  if (stageKind === "three") return <ThreeThemeStage logical={logical} />;
  // 저장·실행 취소 원본은 유지하고, 화면에는 이동 판정과 같은 월드 좌표를 전달한다.
  const decorations = twoD.decorations ? studioVirtualDecorationStateForWorld(twoD.decorations, logical.manifest) : undefined;
  return <WorkstationSpaceContext.Provider value={workstationSpace ?? null}>
    {stageKind === "legacy" ? <StudioVirtualSpaceLegacyStage {...twoD} {...logical} decorations={decorations} />
      : <StudioOffice2dCanvas {...twoD} {...logical} decorations={decorations} />}
  </WorkstationSpaceContext.Provider>;
}
