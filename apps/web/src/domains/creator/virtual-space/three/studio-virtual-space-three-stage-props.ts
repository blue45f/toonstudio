import type {
  StudioVirtualSpaceEngineStatus,
  StudioVirtualSpaceNearbyNpc,
  StudioVirtualSpaceZoneChange,
} from "../studio-virtual-space-engine-events";
import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import type { StudioVirtualRuntimeMetrics } from "../studio-virtual-space-observability";
import type { StudioVirtualSpaceEngineLocalState } from "../studio-virtual-space-stage-state";
import type { StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import type {
  StudioVirtualSpaceWorldManifest,
  StudioWorldInteractionDefinition,
  StudioWorldNpcDefinition,
  StudioWorldPortalDefinition,
} from "../studio-virtual-space-world-manifest";
import type { VirtualThreeTheme, VirtualThreeThemeId, VirtualThreeThemePreviewState } from "./themes/virtual-three-theme-types";

/** 논리 공간·협업 계약과 독립 3D 테마만 받는다. 2D 테마·원화·장식 저장값은 받지 않는다. */
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
}
