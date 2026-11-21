import { StudioOffice2dCanvas } from "./office2d/StudioOffice2dCanvas";
import { StudioVirtualSpaceLegacyStage, StudioVirtualSpaceThreeStage } from "./office2d/StudioVirtualSpaceStages";
import type { StudioVirtualStageKind } from "./office2d/studio-virtual-space-stage-mode";
import { studioVirtualDecorationStateForWorld } from "./studio-virtual-space-decoration-layout";
import type { StudioVirtualSpacePhaserCanvasProps } from "./studio-virtual-space-phaser-canvas-model";
import type {
  StudioThreeCameraMode,
  StudioThreeLightingState,
  StudioThreePhotoCapture,
  StudioThreeVisemeFrame,
  StudioVirtualSpaceThreeStageProps,
} from "./three/studio-virtual-space-three-stage-props";
import { useVirtualThreeThemeContext } from "./three/ui/virtual-three-theme-context";

import { WorkstationSpaceContext, type WorkstationSpace } from "./use-studio-workstation-notebook";

type LogicalStageProps = Omit<
  StudioVirtualSpaceThreeStageProps,
  | "theme"
  | "themeRequestRevision"
  | "onThemePreviewChange"
  | "decorations"
  | "placedFixtures"
  | "onBuildPlacementEvent"
  | "seatedActors"
  | "onPeerSelect"
  | "onGhostModeChange"
  | "onStuckChange"
  | "lightingState"
  | "cameraMode"
  | "onCameraModeChange"
  | "visemeByActorId"
  | "liveScreenStream"
  | "onPhotoCaptureToCut"
  | "onOpenCustomize"
  | "proximityRadiusPx"
  | "ghostMode"
>;

export interface StudioVirtualSpaceThreeExtraProps {
  readonly decorations?: StudioVirtualSpacePhaserCanvasProps["decorations"];
  readonly placedFixtures?: StudioVirtualSpacePhaserCanvasProps["placedFixtures"];
  readonly onBuildPlacementEvent?: StudioVirtualSpacePhaserCanvasProps["onBuildPlacementEvent"];
  readonly seatedActors?: StudioVirtualSpacePhaserCanvasProps["seatedActors"];
  readonly onPeerSelect?: StudioVirtualSpacePhaserCanvasProps["onPeerSelect"];
  readonly onGhostModeChange?: StudioVirtualSpacePhaserCanvasProps["onGhostModeChange"];
  readonly onStuckChange?: StudioVirtualSpacePhaserCanvasProps["onStuckChange"];
  readonly lightingState?: StudioThreeLightingState;
  readonly cameraMode?: StudioThreeCameraMode;
  readonly onCameraModeChange?: (mode: StudioThreeCameraMode) => void;
  readonly visemeByActorId?: Readonly<Record<string, StudioThreeVisemeFrame>>;
  readonly liveScreenStream?: MediaStream | null;
  readonly onPhotoCaptureToCut?: (capture: StudioThreePhotoCapture) => void;
  readonly onOpenCustomize?: () => void;
  readonly proximityRadiusPx?: number;
  readonly ghostMode?: boolean;
}

export interface StudioVirtualSpaceStageSurfaceProps {
  readonly workstationSpace?: WorkstationSpace;
  readonly stageKind: StudioVirtualStageKind;
  readonly logical: LogicalStageProps;
  readonly twoD: Omit<StudioVirtualSpacePhaserCanvasProps, keyof LogicalStageProps>;
  readonly three?: StudioVirtualSpaceThreeExtraProps;
}

function ThreeThemeStage({
  logical,
  three,
}: Pick<StudioVirtualSpaceStageSurfaceProps, "logical" | "three">) {
  const theme = useVirtualThreeThemeContext();
  const threeDecorations = three?.decorations
    ? studioVirtualDecorationStateForWorld(three.decorations, logical.manifest)
    : undefined;
  return <StudioVirtualSpaceThreeStage
    manifest={logical.manifest}
    snapshot={logical.snapshot}
    bridge={logical.bridge}
    selfDisplayName={logical.selfDisplayName}
    onRuntimeMetrics={logical.onRuntimeMetrics}
    onNpcInteract={logical.onNpcInteract}
    onLocalState={logical.onLocalState}
    onInteract={logical.onInteract}
    onNearbyInteractionChange={logical.onNearbyInteractionChange}
    onPortal={logical.onPortal}
    onZoneChange={logical.onZoneChange}
    onNearbyNpcsChange={logical.onNearbyNpcsChange}
    onEngineStatusChange={logical.onEngineStatusChange}
    {...(logical.onReturnTo2d ? { onReturnTo2d: logical.onReturnTo2d } : {})}
    {...(threeDecorations !== undefined ? { decorations: threeDecorations } : {})}
    {...(three?.placedFixtures !== undefined ? { placedFixtures: three.placedFixtures } : {})}
    {...(three?.onBuildPlacementEvent !== undefined ? { onBuildPlacementEvent: three.onBuildPlacementEvent } : {})}
    {...(three?.seatedActors !== undefined ? { seatedActors: three.seatedActors } : {})}
    {...(three?.onPeerSelect !== undefined ? { onPeerSelect: three.onPeerSelect } : {})}
    {...(three?.onGhostModeChange !== undefined ? { onGhostModeChange: three.onGhostModeChange } : {})}
    {...(three?.onStuckChange !== undefined ? { onStuckChange: three.onStuckChange } : {})}
    {...(three?.lightingState !== undefined ? { lightingState: three.lightingState } : {})}
    {...(three?.cameraMode !== undefined ? { cameraMode: three.cameraMode } : {})}
    {...(three?.onCameraModeChange !== undefined ? { onCameraModeChange: three.onCameraModeChange } : {})}
    {...(three?.visemeByActorId !== undefined ? { visemeByActorId: three.visemeByActorId } : {})}
    {...(three?.liveScreenStream !== undefined ? { liveScreenStream: three.liveScreenStream } : {})}
    {...(three?.onPhotoCaptureToCut !== undefined ? { onPhotoCaptureToCut: three.onPhotoCaptureToCut } : {})}
    {...(three?.onOpenCustomize !== undefined ? { onOpenCustomize: three.onOpenCustomize } : {})}
    {...(three?.proximityRadiusPx !== undefined ? { proximityRadiusPx: three.proximityRadiusPx } : {})}
    {...(three?.ghostMode !== undefined ? { ghostMode: three.ghostMode } : {})}
    theme={theme.theme}
    themeRequestRevision={theme.requestRevision}
    onThemePreviewChange={theme.onThemePreviewChange}
  />;
}

/** 각 renderer에 명시적인 논리 입력과 해당 renderer의 표현 설정만 전달한다. */
export function StudioVirtualSpaceStageSurface({ stageKind, logical, twoD, three, workstationSpace }: StudioVirtualSpaceStageSurfaceProps) {
  // 저장·실행 취소 원본은 유지하고, 화면에는 이동 판정과 같은 월드 좌표를 전달한다.
  const decorations = twoD.decorations ? studioVirtualDecorationStateForWorld(twoD.decorations, logical.manifest) : undefined;
  return <WorkstationSpaceContext.Provider value={workstationSpace ?? null}>
    {stageKind === "three"
      ? <ThreeThemeStage logical={logical} three={three} />
      : stageKind === "legacy"
        ? <StudioVirtualSpaceLegacyStage {...twoD} {...logical} decorations={decorations} />
        : <StudioOffice2dCanvas {...twoD} {...logical} decorations={decorations} />}
  </WorkstationSpaceContext.Provider>;
}
