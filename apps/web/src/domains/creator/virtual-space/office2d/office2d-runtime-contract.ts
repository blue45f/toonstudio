import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import type { StudioVirtualSpacePhaserCanvasProps } from "../studio-virtual-space-phaser-canvas-model";
import type { StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import type { StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import type { Office2dRendererHost } from "./office2d-renderer";
import type { Office2dCharacterKey } from "./office2d-sprite-catalog";

export type Office2dRuntimeCallbacks = Pick<StudioVirtualSpacePhaserCanvasProps,
  | "onLocalState" | "onInteract" | "onNearbyInteractionChange" | "onPeerSelect" | "onCancelFollow" | "onPortal" | "onZoneChange"
  | "onNearbyNpcsChange" | "onStuckChange" | "onGhostModeChange" | "onNpcInteract" | "onSelfImpact" | "onRuntimeMetrics"
  | "onObjectStateChange" | "onTileEffectTrigger" | "onGuideTourChange">;

export type Office2dStageProps = Pick<StudioVirtualSpacePhaserCanvasProps,
  "atmosphere" | "spaceTheme" | "decorations" | "placedFixtures" | "tileEffects" | "waveActorIds" | "guideTourRequest">;

export interface Office2dRuntimeOptions {
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly bridge: StudioVirtualSpaceEngineBridge;
  readonly host: Office2dRendererHost;
  readonly selfIdentity: string;
  readonly getSnapshot: () => StudioVirtualSpaceSnapshot;
  readonly getSelfName: () => string;
  readonly getSeatedActors: () => NonNullable<StudioVirtualSpacePhaserCanvasProps["seatedActors"]>;
  readonly getCallbacks: () => Office2dRuntimeCallbacks;
  readonly getStageProps?: () => Office2dStageProps;
  readonly getLanguage: () => "ko" | "en";
  readonly getReducedMotion: () => boolean;
  /** 스테이지 상단 음소거 토글 상태(없으면 소리 허용). */
  readonly getSoundMuted?: () => boolean;
  /** 실제 시계(ms). 테스트는 고정 값을 넣는다. */
  readonly clock?: () => number;
  /** 참가자 아바타 번호 + 신원 → 직군 시트. 없으면 번호를 시트 수로 나눈 나머지로 고른다. */
  readonly getAvatarCharacter?: (avatarIndex: number, identity: string) => Office2dCharacterKey;
  /** 빈 작업실을 채우는 상주 동료를 둘지(기본 true). */
  readonly ambientCoworkers?: boolean;
}
