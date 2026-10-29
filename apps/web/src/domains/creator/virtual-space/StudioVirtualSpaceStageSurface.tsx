import { StudioOffice2dCanvas } from "./office2d/StudioOffice2dCanvas";
import { StudioVirtualSpaceLegacyStage, StudioVirtualSpaceThreeStage } from "./office2d/StudioVirtualSpaceStages";
import type { StudioVirtualStageKind } from "./office2d/studio-virtual-space-stage-mode";
import type { StudioVirtualSpacePhaserCanvasProps } from "./studio-virtual-space-phaser-canvas-model";
import type { StudioVirtualSpaceThreeStageProps } from "./three/studio-virtual-space-three-stage-props";
import { useVirtualThreeThemeContext } from "./three/ui/virtual-three-theme-context";

type LogicalStageProps = Omit<StudioVirtualSpaceThreeStageProps, "theme" | "themeRequestRevision" | "onThemePreviewChange">;
export interface StudioVirtualSpaceStageSurfaceProps {
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
    onEngineStatusChange={logical.onEngineStatusChange} theme={theme.theme} themeRequestRevision={theme.requestRevision}
    onThemePreviewChange={theme.onThemePreviewChange} />;
}

/** 각 renderer에 명시적인 논리 입력과 해당 renderer의 표현 설정만 전달한다. */
export function StudioVirtualSpaceStageSurface({ stageKind, logical, twoD }: StudioVirtualSpaceStageSurfaceProps) {
  if (stageKind === "three") return <ThreeThemeStage logical={logical} />;
  if (stageKind === "legacy") return <StudioVirtualSpaceLegacyStage {...twoD} {...logical} />;
  return <StudioOffice2dCanvas {...twoD} {...logical} />;
}
