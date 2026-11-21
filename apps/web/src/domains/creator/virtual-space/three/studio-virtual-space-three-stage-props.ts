import type { StudioBuildPlacedFixture } from "../studio-virtual-space-build-mode-vitality";
import type { StudioBuildPlacementEvent } from "../studio-virtual-space-build-placement";
import type { StudioVirtualDecorationState } from "../studio-virtual-space-customization";
import type {
  StudioVirtualSpaceEngineStatus,
  StudioVirtualSpaceNearbyNpc,
  StudioVirtualSpaceZoneChange,
} from "../studio-virtual-space-engine-events";
import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "../studio-virtual-space-model";
import type { StudioVirtualRuntimeMetrics } from "../studio-virtual-space-observability";
import type { StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import type { StudioVirtualSpaceEngineLocalState } from "../studio-virtual-space-stage-state";
import type {
  StudioVirtualSpaceWorldManifest,
  StudioWorldInteractionDefinition,
  StudioWorldNpcDefinition,
  StudioWorldPortalDefinition,
} from "../studio-virtual-space-world-manifest";
import type { VirtualThreeTheme, VirtualThreeThemeId, VirtualThreeThemePreviewState } from "./themes/virtual-three-theme-types";

export type StudioThreeCameraMode = "quarter" | "third-person" | "first-person";

export interface StudioThreeLightingState {
  readonly timeOfDayHours: number;
  readonly interiorDimmer: number;
  readonly colorTemperatureK?: number;
}

export interface StudioThreeSeatedActor {
  readonly id: string;
  readonly anchorPoint: StudioVirtualSpacePoint;
  readonly facing: StudioVirtualSpaceFacing;
}

export interface StudioThreeVisemeFrame {
  readonly aa: number;
  readonly ih: number;
  readonly ou: number;
  readonly ee: number;
  readonly oh: number;
}

export interface StudioThreePhotoCapture {
  readonly dataUrl: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
}

/** 논리 공간·협업 계약과 독립 3D 테마·카메라·조명·협업 확장 props를 받는다. */
export interface StudioVirtualSpaceThreeStageProps {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly bridge: StudioVirtualSpaceEngineBridge;
  readonly selfDisplayName?: string;
  readonly theme: VirtualThreeTheme;
  readonly themeRequestRevision?: number;
  /** 요청 세대와 실제 무대 commit을 구분하도록 해당 테마 ID를 함께 알린다. */
  readonly onThemePreviewChange?: (themeId: VirtualThreeThemeId, preview: VirtualThreeThemePreviewState) => void;
  readonly onRuntimeMetrics?: (metrics: StudioVirtualRuntimeMetrics) => void;
  readonly onNpcInteract?: (interaction: StudioWorldInteractionDefinition, npc: StudioWorldNpcDefinition) => void;
  readonly onLocalState: (state: StudioVirtualSpaceEngineLocalState) => void;
  readonly onInteract: (interaction: StudioWorldInteractionDefinition | null) => void;
  readonly onNearbyInteractionChange?: (interaction: StudioWorldInteractionDefinition | null) => void;
  readonly onPortal?: (portal: StudioWorldPortalDefinition) => void;
  readonly onZoneChange?: (zone: StudioVirtualSpaceZoneChange) => void;
  readonly onNearbyNpcsChange?: (npcs: readonly StudioVirtualSpaceNearbyNpc[]) => void;
  readonly onEngineStatusChange?: (status: StudioVirtualSpaceEngineStatus) => void;
  readonly onReturnTo2d?: () => void;
  readonly decorations?: StudioVirtualDecorationState;
  readonly placedFixtures?: readonly StudioBuildPlacedFixture[];
  readonly onBuildPlacementEvent?: (event: StudioBuildPlacementEvent) => void;
  readonly seatedActors?: readonly StudioThreeSeatedActor[];
  readonly onPeerSelect?: (sessionId: string) => void;
  readonly onGhostModeChange?: (enabled: boolean) => void;
  readonly onStuckChange?: (stuck: boolean) => void;
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
