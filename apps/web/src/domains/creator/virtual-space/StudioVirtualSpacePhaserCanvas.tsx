import { createStudioBootProgress } from "./studio-virtual-space-phaser-canvas-boot-progress";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  StudioFixedStepClock, StudioFixedStepPose,
  studioStableFacing, studioRenderViewport,
} from "./studio-virtual-space-presentation";
import { StudioNpcDirector } from "./studio-virtual-space-npc-director";
import { steerStudioWorldCruise } from "./studio-virtual-space-path-steering";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  EMPTY_STUDIO_WORLD_APPROACH,
  EMPTY_STUDIO_WORLD_WALK_OVER,
  StudioWorldPortalTracker,
  StudioWorldZoneTracker,
  stepStudioWorldInteractionApproach,
  stepStudioWorldWalkOver,
  studioWorldFloorFocusTarget,
  studioWorldHasModalBlocker,
  studioWorldInputBlocked,
  studioWorldPresenceZone,
  studioWorldPromptInteractGate,
} from "./studio-virtual-space-runtime-policy";
import { resolveStudioFollowStandOffPx } from "./studio-virtual-space-follow";

import { readStudioVirtualSpaceGamepadsInput } from "./studio-virtual-space-gamepad";
import { STUDIO_VIRTUAL_SPACE_WALK_SPEED } from "./studio-virtual-space-navigation";
import { DEFAULT_STUDIO_MOTION_CONFIG } from "./studio-virtual-space-motion";
import { DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG } from "./studio-virtual-space-physics";
import { resolveStudioThemeSurfacePhysics } from "./studio-virtual-space-theme-physics";
import {
  createStudioFacingTurnState,
  shortestAngleDelta,
  turnSlowdownFactor,
} from "./studio-virtual-space-locomotion-feel";
import { StudioMotionEaser } from "./studio-virtual-space-motion-easing";
import { stepCrispVelocity } from "./studio-virtual-space-locomotion-style";
import { createStudioJumpMotionState } from "./studio-virtual-space-jump-motion";
import { playStudioSfxSound } from "./studio-virtual-space-sound-engine";
import { studioEmoteSfxKind } from "./studio-virtual-space-sound-synth";
import {
  createStudioGhostModeApplier,
  studioGhostCollisionOverrides,
  studioGhostSeekInput,
} from "./studio-virtual-space-ghost-mode";
import { neutralStudioMotionRequest } from "./studio-virtual-space-motion-api";
import { type StudioSpacePose } from "./studio-virtual-space-pose-controller";
import { createMotionStateMachine } from "./studio-virtual-space-character-motion";
import {
  customSpriteSheetSkin,
  getActiveSpriteSheetConfig,
  onSpriteSheetConfigChanged,
} from "./studio-virtual-space-sprite-sheet";
import {
  resolveStudioCharacterAppearance,
  studioCharacterSkinForArtStyle,
} from "./studio-virtual-space-character-skins";
import { studioProceduralNpcSkinByKey } from "./studio-virtual-space-npc-cast";
import {
  DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  studioVirtualArtObjectUrl,
  studioVirtualArtStyle,
  studioVirtualLivingTownAssetUrl,
} from "./studio-virtual-space-art-style";
import { StudioTextResolutionRuntime } from "./studio-virtual-space-text-resolution";
import { createStudioTextureLod, type StudioTextureLodRuntime } from "./studio-virtual-space-texture-lod";
import { studioHdSpriteProfile } from "./studio-virtual-space-hd-sprite-pipeline";
import { StudioActorAuraRuntime, syncStudioCanvasDevDiagnostics } from "./studio-virtual-space-actor-aura-runtime";
import { StudioUserZoomRuntime } from "./studio-virtual-space-user-zoom";
import { StudioCameraPanRuntime, bindStudioCameraGestures } from "./studio-virtual-space-camera-pan";
import { studioSpaceTheme } from "./studio-virtual-space-theme";
import { drawStudioModularCampus } from "./studio-virtual-space-modular-campus";
import { studioRenderedTileWorld } from "./studio-virtual-space-scene-direction";
import {
  registerStudioSceneAtlas,
  StudioVirtualSetDressingRuntime,
  studioSceneActorScale,
} from "./studio-virtual-space-scene-art-runtime";
import { studioVirtualWorldSetDressing } from "./studio-virtual-space-world-set-dressing";
import { studioVirtualWorldKind } from "./studio-virtual-space-world-presentation";
import { applyStudioWorldCamera, fitStudioHorizonArtwork } from "./studio-virtual-space-world-camera";
import {
  STUDIO_ZONE_FADE_COLOR,
  beginStudioZoneSpawnTransition,
  createStudioZoneTransitionState,
  markStudioZoneTransitionReady,
  revealStudioZoneTransition,
  stepStudioZoneTransition,
} from "./studio-virtual-space-zone-transition";
import { StudioCampusRuntime, createStudioCampusRuntimeFrame, type StudioCampusRuntimeFrame } from "./studio-virtual-space-campus-runtime";
import { studioVirtualCampusScene } from "./studio-virtual-space-campus-world";
import { StudioWorldPromptRuntime, studioWorldMarkerVisible } from "./studio-virtual-space-world-prompt";
import { studioProjectTownPoint, studioTownDepthForPoint } from "./studio-virtual-space-semantic-world";
import {
  StudioLivingWorldRuntime,
  queueStudioLivingWorldTextures,
  studioVirtualTerrainAt,
} from "./studio-virtual-space-living-world";
import {
  queueStudioAmbienceTextures,
  StudioVirtualAmbienceRenderRuntime,
} from "./studio-virtual-space-ambience-render";
import {
  queueStudioLightTextures,
  StudioVirtualLightRenderRuntime,
} from "./studio-virtual-space-light-render";
import { StudioWorldObjectRuntime } from "./studio-virtual-space-object-runtime";
import { createStudioWorldTileRuntime, type StudioWorldTileRuntime } from "./studio-virtual-space-tile-runtime";
import { StudioTileEffectRuntimeTracker } from "./studio-virtual-space-tile-effect-runtime";
import { studioVirtualPlaceTileAssetUrl } from "./studio-virtual-space-place-world";
import { studioWorldPointInsideOcclusionPolygon } from "./studio-virtual-space-occlusion";
import { StudioVirtualDecorationRuntime } from "./studio-virtual-space-decoration-runtime";
import { StudioDeskPodRuntime } from "./studio-virtual-space-desk-pods";
import { studioRuntimeBudget, studioTownInterestSnapshot } from "./studio-virtual-space-town-program";
import { studioVirtualDecorationNavigationWorld, studioVirtualDecorationStateForWorld } from "./studio-virtual-space-decoration-layout";
import { StudioCameraFollowModeController, studioPlayerLocomotionProfile } from "./studio-virtual-space-locomotion-presentation";
import { DEFAULT_STUDIO_VIRTUAL_EXPERIENCE } from "./studio-virtual-space-experience-preference";
import { DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT } from "./studio-virtual-space-environment-preference";
import {
  StudioVirtualAdaptiveQualityController,
  studioVirtualAutomaticQualityTier,
  studioVirtualQualityProfile,
} from "./studio-virtual-space-quality";
import {
  probeStudioVirtualWebGL,
  studioVirtualRendererDecision,
  studioVirtualRendererPowerPreference,
} from "./studio-virtual-space-renderer";
import { sanitizeStudioVirtualRuntimeMetrics } from "./studio-virtual-space-observability";
import { layoutStudioVirtualNameplates } from "./studio-virtual-space-nameplate-layout";
import { studioTownEnvironmentInteractions } from "./studio-virtual-space-town-layout";
import { studioCharacterStaticAsset } from "./studio-virtual-space-character-assets";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";
import {
  StudioStuckDetector,
  StudioZoneChangeTracker,
  type StudioSpaceUiEvent,
  type StudioVirtualSpaceEngineStatus,
} from "./studio-virtual-space-engine-events";
import { StudioWorldEventFeed, StudioWorldFeelController } from "./studio-virtual-space-world-feel";
import {
  StudioMotionFeelRuntime,
  createStudioMotionFeelFrame,
  studioCampusFloorSurface,
  studioMotionFeelTerrainSurface,
} from "./studio-virtual-space-motion-feel-runtime";
import { StudioSpriteCrossfadeRuntime } from "./studio-virtual-space-sprite-crossfade-runtime";
import type {
  StudioActorVisibilityFadeState,
  StudioDisplayPoint,
} from "./studio-virtual-space-sprite-smoothing";
import { StudioCollisionResponder, studioCollisionContact } from "./studio-virtual-space-collision-response";
import { destroyStudioPeerVisual } from "./studio-virtual-space-peer-visual";
import { StudioFrameRegistry } from "./studio-virtual-space-frame-registration";
import { StudioInteractionFxRuntime } from "./studio-virtual-space-interaction-fx";
import {
  createStudioInteractionFxLiveWiring,
  type StudioInteractionFxLiveWiring,
} from "./studio-virtual-space-interaction-fx-live";
import {
  createStudioBuildPlacementCanvasController,
  type StudioBuildPlacementCanvasController,
} from "./studio-virtual-space-build-placement-canvas";
import { createStudioOptionalSceneArtLoader } from "./studio-virtual-space-optional-scene-art";
import { createStudioNpcVisuals } from "./studio-virtual-space-npc-visuals";
import { createStudioLocalVisual } from "./studio-virtual-space-local-visual";
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import {
  StudioEmoteRuntime,
  StudioSpeechBubbleRuntime,
  studioCanvasBubbleColors,
  studioCanvasNameplateColors,
  studioColorHex,
} from "./studio-virtual-space-emote-runtime";
import { StudioNpcChatterScheduler, type StudioNpcSpeechBubble } from "./studio-virtual-space-npc-chatter";
import {
  studioWorldCollisionRects,
  studioWorldInteractions,
  studioWorldPortals,
  studioWorldRoomAt,
  studioWorldSpawn,
  type StudioWorldInteractionDefinition,
} from "./studio-virtual-space-world-manifest";
import {
  findStudioWorldPath,
  resolveStudioWorldSpawn,
  studioWorldCanOccupy,
  STUDIO_WORLD_PLAYER_RADIUS,
} from "./studio-virtual-space-world-pathfinding";
import {
  createStudioInteractionMarkers,
  createStudioPortalGateways,
  createStudioRouteOverlayMemory,
  drawStudioPrivateZoneOverlay,
  drawStudioWorldDebugOverlay,
} from "./studio-virtual-space-world-overlays";

import {
  nearestInteraction,
  propTextureKey,
  studioWorldMayTakeFocus,
  EMPTY_DECORATIONS,
  STUDIO_EMOTE_DEDUPE_MS,
  type NpcVisual,
  type OcclusionVisual,
  type PeerVisual,
  type StudioVirtualSpacePhaserCanvasProps,
} from "./studio-virtual-space-phaser-canvas-model";
import { createStudioSpriteVisualApplier } from "./studio-virtual-space-sprite-visual";
import { createStudioNameplateRenderer } from "./studio-virtual-space-nameplate-renderer";
import { createStudioCharacterTexturePreparer } from "./studio-virtual-space-character-texture-preparer";
import { createStudioSceneCharacterAssetResidency } from "./studio-virtual-space-phaser-canvas-character-residency";
import { drawStudioBackdropLayers, drawStudioOcclusionLayers, placeStudioWorldPropImages } from "./studio-virtual-space-phaser-canvas-world-layers";
import { bindStudioCanvasInput } from "./studio-virtual-space-phaser-canvas-input";
import { StudioVirtualSpaceEngineMessage } from "./StudioVirtualSpaceEngineMessage";
import { studioCharacterBootAssets, studioSceneArtKeys } from "./studio-virtual-space-boot-assets";
import {
  syncStudioVirtualSpaceSnapshot,
  updateStudioVirtualSpacePeersFrame,
} from "./studio-virtual-space-phaser-peer-sync";
import {
  findNearestStudioInteractableNpc,
  updateStudioVirtualSpaceNpcsAndPromptsFrame,
} from "./studio-virtual-space-phaser-npc-frame";
import {
  stepStudioPhaserPortalAndTeleport,
  type StudioPhaserPortalTeleportMutableState,
} from "./studio-virtual-space-phaser-portal-teleport";
import {
  updateStudioPhaserAmbienceAndLighting,
  updateStudioPhaserCampusFrame,
  updateStudioPhaserOverlaysAndZone,
} from "./studio-virtual-space-phaser-environment-frame";
import {
  updateStudioPhaserLocalPresentation,
  type StudioPhaserLocalPresentationState,
} from "./studio-virtual-space-phaser-local-presentation";

export type {
  StudioVirtualSpaceEngineLocalState,
  StudioVirtualSpacePhaserCanvasProps,
} from "./studio-virtual-space-phaser-canvas-model";

/** main 캔버스 호환: Page가 이 모듈에서 이벤트 타입을 가져온다. */
export type { StudioSpaceUiEvent };

export function StudioVirtualSpacePhaserCanvas({
  manifest,
  worldAssetUrls,
  snapshot,
  bridge,
  selfIdentity = "local",
  selfDisplayName = "Me",
  renderer = "auto",
  debugWorld = false,
  atmosphere = "balanced",
  artStyle = DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  spaceTheme,
  decorations = EMPTY_DECORATIONS,
  experiencePreference = DEFAULT_STUDIO_VIRTUAL_EXPERIENCE,
  environmentPreference = DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT,
  onRuntimeMetrics,
  selfPose,
  waveActorIds = [],
  seatedActors = [],
  onNpcInteract,
  guideTourRequest = null,
  onGuideTourChange,
  onLocalState,
  onInteract,
  onNearbyInteractionChange,
  onPeerSelect,
  onCancelFollow,
  onPortal,
  onZoneChange,
  onNearbyNpcsChange,
  onStuckChange,
  onGhostModeChange,
  onEngineStatusChange,
  onSpaceUiEvent,
  onSelfImpact,
  onObjectStateChange,
  onBuildPlacementEvent,
  tileEffects = [],
  placedFixtures,
  onTileEffectTrigger,
}: StudioVirtualSpacePhaserCanvasProps) {
  const bt = useBilingual("StudioVirtualSpacePhaserCanvas");
  const btRef = useRef(bt);
  btRef.current = bt;
  const [failure, setFailure] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const [slowLoad, setSlowLoad] = useState(false);
  const atmosphereRef = useRef(atmosphere);
  atmosphereRef.current = atmosphere;
  const poseRef = useRef({ selfPose, waveActorIds, seatedActors });
  poseRef.current = { selfPose, waveActorIds, seatedActors };
  const decorationsRef = useRef(decorations);
  decorationsRef.current = decorations;
  const experienceRef = useRef(experiencePreference);
  experienceRef.current = experiencePreference;
  const environmentRef = useRef(environmentPreference);
  environmentRef.current = environmentPreference;
  const metricsCallbackRef = useRef(onRuntimeMetrics);
  metricsCallbackRef.current = onRuntimeMetrics;
  const guideTourRef = useRef(guideTourRequest);
  guideTourRef.current = guideTourRequest;
  const identityRef = useRef(selfIdentity);
  identityRef.current = selfIdentity;
  const displayNameRef = useRef(selfDisplayName);
  displayNameRef.current = selfDisplayName;
  const tileEffectsRef = useRef(tileEffects);
  tileEffectsRef.current = tileEffects;
  const placedFixturesRef = useRef(placedFixtures); placedFixturesRef.current = placedFixtures;
  const buildPlacementEventRef = useRef(onBuildPlacementEvent); buildPlacementEventRef.current = onBuildPlacementEvent;
  const tileTriggerCallbackRef = useRef(onTileEffectTrigger);
  tileTriggerCallbackRef.current = onTileEffectTrigger;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const snapshotRef = useRef(snapshot);
  const callbacksRef = useRef({
    onLocalState,
    onInteract,
    onNearbyInteractionChange,
    onNpcInteract,
    onGuideTourChange,
    onPeerSelect,
    onCancelFollow,
    onPortal,
    onZoneChange,
    onNearbyNpcsChange,
    onStuckChange,
    onGhostModeChange,
    onSpaceUiEvent,
    onSelfImpact,
    onObjectStateChange,
  });
  const runtimeRef = useRef<{
    syncSnapshot: (next: StudioVirtualSpaceSnapshot) => void;
  } | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
    runtimeRef.current?.syncSnapshot(snapshot);
  }, [snapshot]);

  useEffect(() => {
    callbacksRef.current = {
      onLocalState,
      onInteract,
      onNearbyInteractionChange,
      onNpcInteract,
      onGuideTourChange,
      onPeerSelect,
      onCancelFollow,
      onPortal,
      onZoneChange,
      onNearbyNpcsChange,
      onStuckChange,
      onGhostModeChange,
      onSpaceUiEvent,
      onSelfImpact,
      onObjectStateChange,
    };
  }, [
    onCancelFollow,
    onInteract,
    onLocalState,
    onNearbyInteractionChange,
    onNpcInteract,
    onGuideTourChange,
    onPeerSelect,
    onPortal,
    onZoneChange,
    onNearbyNpcsChange,
    onStuckChange,
    onGhostModeChange,
    onSpaceUiEvent,
    onSelfImpact,
    onObjectStateChange,
  ]);

  const engineStatus: StudioVirtualSpaceEngineStatus = failure ? "error" : ready ? "ready" : "loading";
  const engineStatusCallbackRef = useRef(onEngineStatusChange);
  engineStatusCallbackRef.current = onEngineStatusChange;
  useEffect(() => {
    engineStatusCallbackRef.current?.(engineStatus);
  }, [engineStatus]);

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return undefined;

    parent.dataset.artStyle = artStyle;
    parent.dataset.bootStage = "waiting-frame";
    delete parent.dataset.engineError;
    delete parent.dataset.tileError;
    delete parent.dataset.sceneArt;
    const artProfile = studioVirtualArtStyle(artStyle);
    const spaceThemeDef = spaceTheme ? studioSpaceTheme(spaceTheme) : null;
    if (spaceThemeDef) {
      parent.dataset.spaceTheme = spaceThemeDef.key;
      parent.style.background = `linear-gradient(180deg, ${spaceThemeDef.backgroundGradient[0]} 0%, ${spaceThemeDef.backgroundGradient[1]} 55%, ${spaceThemeDef.backgroundGradient[2]} 100%)`;
    }
    const mount = document.createElement("div");
    mount.className = "studio-vspace-engine-mount";
    parent.append(mount);
    setFailure(false);
    setReady(false);
    setLoadProgress(null);
    setSlowLoad(false);
    let cancelled = false;
    let sceneReady = false;
    let engineFailed = false;
    const cleanup: (() => void)[] = [];
    const fail = (reason?: unknown) => {
      if (cancelled) return;
      if (!engineFailed) parent.dataset.engineError = reason instanceof Error ? reason.message : "runtime-failure";
      engineFailed = true;
      bridge.clearMovement();
      setFailure(true);
      setReady(false);
    };
    // 부팅 제한(진행이 멈추면 실패)과 로딩 화면의 진행 막대·느린 연결 안내는 한 묶음이 맡는다.
    const boot = createStudioBootProgress({
      visibility: document,
      onTimeout: () => fail(new Error(`boot-timeout:${parent.dataset.bootStage}`)),
      onProgress: setLoadProgress,
      onSlow: () => setSlowLoad(true),
    });
    cleanup.push(boot.dispose);
    let game: import("phaser").Game | null = null;

    void (async () => {
      // React StrictMode can destroy and recreate this WebGL game in the same task.
      // Yield one frame so Chromium releases the previous framebuffer before Phaser
      // allocates the replacement, and never let RESIZE observe a 0×0 mount.
      await new Promise<void>((resolve) => globalThis.requestAnimationFrame(() => resolve()));
      if (cancelled || !mount.isConnected) return;
      parent.dataset.bootStage = "loading-engine";
      const mountRect = parent.getBoundingClientRect();
      const reducedMotion = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
      const qualityEnvironment = () => ({
        viewportWidth: parent.clientWidth,
        reducedMotion: reducedMotion.matches,
        deviceMemory: (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
      let currentQualityProfile = studioVirtualQualityProfile(experienceRef.current.qualityPreset, qualityEnvironment());
      const adaptiveQuality = new StudioVirtualAdaptiveQualityController(currentQualityProfile.tier);
      let resizeRuntime: () => void = () => undefined;
      let lastMetricsAt = -Infinity;
      let lastQualityTier = currentQualityProfile.tier;
      let lastRequestedQualityPreset = experienceRef.current.qualityPreset;
      let viewport = studioRenderViewport(
        mountRect.width,
        mountRect.height,
        Math.min(globalThis.devicePixelRatio || 1, currentQualityProfile.dprCap),
      );
      mount.style.width = `${Math.max(1, Math.round(mountRect.width || parent.clientWidth || 1))}px`;
      mount.style.height = `${Math.max(1, Math.round(mountRect.height || parent.clientHeight || 1))}px`;

      const Phaser = await import("phaser");
      if (cancelled || !mount.isConnected) return;
      parent.dataset.bootStage = "preparing-scene";

      const scene = new Phaser.Scene("ToonStudioVirtualStudio") as import("phaser").Scene & {
        preload: () => void;
        create: () => void;
        update: (time: number, deltaMs: number) => void;
      };
      const peers = new Map<string, PeerVisual>();
      const npcs = new Map<string, NpcVisual>();
      let navigationWorld = studioVirtualDecorationNavigationWorld(manifest, decorationsRef.current);
      const npcDirector = new StudioNpcDirector(manifest);
      npcDirector.updateNavigationWorld(navigationWorld);
      cleanup.push(() => npcDirector.dispose());
      let lastGuideRequestId: string | null = null;
      let lastGuideState = "";
      const interactionMarkers = new Map<string, import("phaser").GameObjects.Container>();
      const occlusionVisuals: OcclusionVisual[] = [];
      const interactions = Object.freeze([
        ...studioWorldInteractions(manifest),
        ...(manifest.tilemap ? [] : studioTownEnvironmentInteractions()),
      ]) as readonly StudioWorldInteractionDefinition[];
      const portals = studioWorldPortals(manifest);
      const {
        backgroundTextureKey, backgroundUrl, horizonTextureKey, horizonUrl, livingTextureKeys,
        decorationTextureKeys, landmarksTextureKey, actorExpressionTextureKey, sceneArtAtlases,
      } = studioSceneArtKeys({ manifest, artStyle, backdrop: environmentPreference.backdrop });
      const actorVisualScale = studioSceneActorScale(manifest);
      const playerLocomotion = studioPlayerLocomotionProfile(actorVisualScale < 1);
      const worldSetDressing = studioVirtualWorldSetDressing(manifest);
      const objectTextureKeys = {
        door: `studio-object-${artStyle}-door`,
        crate: `studio-object-${artStyle}-crate`,
        lantern: `studio-object-${artStyle}-lantern`,
        bench: `studio-object-${artStyle}-bench`,
      } as const;
      const portalTracker = new StudioWorldPortalTracker();
      const zoneTracker = new StudioWorldZoneTracker();
      const failedTextures = new Set<string>();
      const bootAssets = studioCharacterBootAssets({ manifest, artStyle, self: snapshotRef.current.self, identity: identityRef.current });
      const { fallbackAsset, npcFallbackAsset, npcBootAssets, bootSelfAsset } = bootAssets;
      let selfCustomSheetSkin = bootAssets.selfCustomSheetSkin;
      // 프레임마다 따로 그려진 걷기·행동 시트의 발 기준선·몸통 중심·크기를 정지 그림에 맞추는 보정(로드 직후 한 번 측정).
      const frameRegistry = new StudioFrameRegistry();
      const { prepareCharacterTexture, queueCharacterTexture } = createStudioCharacterTexturePreparer({ scene, failedTextures, frameRegistry });
      const characterAssets = createStudioSceneCharacterAssetResidency({ scene, prepareCharacterTexture, queueCharacterTexture, frameRegistry });
      cleanup.push(() => characterAssets.close());
      const interactionById = new Map(interactions.map((interaction) => [interaction.id, interaction] as const));

      let applyCameraMode: (deadzoneScale?: number) => void = () => undefined;
      let focusWorldOnReady: () => void = () => undefined;
      let localPose = new StudioFixedStepPose(snapshotRef.current.self);
      const fixedStepClock = new StudioFixedStepClock();
      const cameraTarget = { x: snapshotRef.current.self.x, y: snapshotRef.current.self.y };
      const localPresentation: StudioPhaserLocalPresentationState = {
        facing: snapshotRef.current.self.facing,
        localDistance: 0,
        lastFootstepDistance: 0,
        previousRendered: null,
        localDisplayPoint: null,
        wasLocalSeated: false,
        jumpQueued: false,
        jumpState: createStudioJumpMotionState(),
        lastStoppedAt: -1_000,
        preStopSpeed: 0,
        locomotionMode: "idle",
        walkPhase: 0,
        breathPhase: 0,
        turnState: createStudioFacingTurnState(0),
        localMotion: createMotionStateMachine("idle", 0),
        lastMotionRequest: neutralStudioMotionRequest(),
      };
      let localBody: import("phaser").GameObjects.Zone | null = null;
      let localBodyPhysics: import("phaser").Physics.Arcade.Body | null = null;
      let localSprite: import("phaser").GameObjects.Sprite | null = null;
      let localShadow: import("phaser").GameObjects.Ellipse | null = null;
      let localLabel: import("phaser").GameObjects.Text | null = null;
      let emotes: StudioEmoteRuntime | null = null;
      const { nameplateStyle, statusDots, syncStatusDot } = createStudioNameplateRenderer({ scene, parent });
      let speech: StudioSpeechBubbleRuntime | null = null;
      /** NPC 대사·이모트 반응은 이 브라우저에서만 연출하고 프레즌스로 보내지 않는다. */
      const chatter = new StudioNpcChatterScheduler(manifest.id);
      let chatterBubbles: readonly StudioNpcSpeechBubble[] = [];
      /** 근처 NPC가 반응할 사람 이모트. point가 null이면 내 위치다(피어는 보낸 사람 위치). */
      const pendingEmoteReactions: { readonly emote: StudioSpaceEmoteId; readonly point: StudioVirtualSpacePoint | null }[] = [];
      const queueEmoteReaction = (emote: StudioSpaceEmoteId, point: StudioVirtualSpacePoint | null) => {
        if (pendingEmoteReactions.length < 16) pendingEmoteReactions.push({ emote, point });
      };
      /** update(time)의 rAF 시각. 스냅샷 동기화처럼 프레임 밖에서 시작한 이모트도 같은 시계를 쓴다(loop.time과 다르다). */
      let frameTime = 0;
      let lastSelfReaction: StudioVirtualSpaceSnapshot["selfReaction"] = snapshotRef.current.selfReaction;
      /** 자기 말풍선 채팅 텍스트. syncSnapshot이 갱신하고 렌더 루프가 읽는다. */
      let selfChatBubbleText: string | null = snapshotRef.current.selfChatBubble?.text ?? null;
      const portalState: StudioPhaserPortalTeleportMutableState = {
        zoneTransition: createStudioZoneTransitionState(),
        pendingPortalArrival: null,
        pendingBridgeTeleport: null,
        pendingDeparturePortal: null,
        arrivalRingPoint: null,
        motion: { velocity: { x: 0, y: 0 } },
        path: [],
        previousRendered: null,
        lastWalkablePoint: { x: snapshotRef.current.self.x, y: snapshotRef.current.self.y },
        lastPosition: null,
        lastPublishedPoint: null,
        approachState: EMPTY_STUDIO_WORLD_APPROACH,
        walkOverState: EMPTY_STUDIO_WORLD_WALK_OVER,
      };
      let queuedInteraction: StudioWorldInteractionDefinition | null = null;
      let queuedWalkOver: { id: string; point: StudioVirtualSpacePoint } | null = null;
      let campusRuntime: StudioCampusRuntime | null = null;
      let campusFrame: StudioCampusRuntimeFrame | null = null;
      /** 캠퍼스 경계 밖 지평선 아트워크. 시간대 하늘 틴트는 이 배경에만 입힌다. */
      let horizonArtwork: import("phaser").GameObjects.Image | null = null;
      let lastSkyTintPhase: string | null = null;
      let promptRuntime: StudioWorldPromptRuntime | null = null;
      /** 상호작용 fx 런타임(오브젝트 반응·배지·발표 스포트라이트)과 그 라이브 배선 브리지. create에서 만든다. */
      let interactionFx: StudioInteractionFxRuntime | null = null;
      let buildPlacement: StudioBuildPlacementCanvasController | null = null;
      let fxWiring: StudioInteractionFxLiveWiring | null = null;
      let lastMarkerCullAt = -Infinity;
      let zoneVeil: import("phaser").GameObjects.Graphics | null = null;
      let highlightRing: import("phaser").GameObjects.Graphics | null = null;
      let routeOverlay: import("phaser").GameObjects.Graphics | null = null;
      let proximityOverlay: import("phaser").GameObjects.Graphics | null = null;
      /** 참가자 locate 안내선 오버레이. */
      let locateOverlay: import("phaser").GameObjects.Graphics | null = null;
      // 구역·포털·스폰 전환 시퀀스(순수 상태 머신)와 도착 연출용 그래픽스.
      let transitionVeil: import("phaser").GameObjects.Graphics | null = null;
      let arrivalRing: import("phaser").GameObjects.Graphics | null = null;
      /** 고스트 모드에서 비활성화하는 물리 충돌기들. */
      const ghostColliders: import("phaser").Physics.Arcade.Collider[] = [];
      /** T8: 따라가기 벽 통과가 현재 물리 충돌기에 적용돼 있는지. */
      let followWallPassApplied = false;
      /** 클릭 이동 목적지 마커 펄스 시작 시각. */
      let markerStartedAt = 0;
      const routeOverlayMemory = createStudioRouteOverlayMemory();
      let lastPublishedPose: StudioSpacePose = "stand";
      const motionEaser = new StudioMotionEaser();
      let moving = false;
      let lastPublishAt = -Infinity;
      let lastDiagnosticAt = -Infinity;
      let lastAssetCollectionAt = -Infinity;
      let lastPublishedFacing = localPresentation.facing;
      let lastPublishedMoving = moving;
      let gamepadInteractHeld = false;
      const heldKeys = new Set<string>();
      let keyboardInteractQueued = false;
      let wasInputBlocked = false;
      let modalInputBlocked = studioWorldHasModalBlocker(document);
      let lastStopRevision = bridge.getStopRevision();
      let lastMovedAt = -Infinity;
      let nearbyInteractionId: string | null = null;
      let keys: Record<string, import("phaser").Input.Keyboard.Key> | null = null;
      let livingWorld: StudioLivingWorldRuntime | null = null;
      let ambienceRender: StudioVirtualAmbienceRenderRuntime | null = null;
      let lightRender: StudioVirtualLightRenderRuntime | null = null;
      let tileWorld: StudioWorldTileRuntime | null = null;
      let initialTilesReady = false;
      const runtimeInputBlocked = () => engineFailed || (manifest.tilemap !== undefined && !initialTilesReady)
        || studioWorldInputBlocked(document, modalInputBlocked);
      let objectRuntime: StudioWorldObjectRuntime | null = null;
      let decorationRuntime: StudioVirtualDecorationRuntime | null = null;
      let setDressingRuntime: StudioVirtualSetDressingRuntime | null = null;
      let startOptionalSceneArt: (() => void) | null = null;
      const illustratedProps: Array<{ readonly image: import("phaser").GameObjects.Image; readonly frame: number;
        readonly width: number; readonly height: number; readonly originX: number; readonly originY: number }> = [];
      let deskPodRuntime: StudioDeskPodRuntime | null = null;
      let lastDecorationState = decorationsRef.current; let lastPlacedFixtures = placedFixturesRef.current;
      const staticColliderObjects: import("phaser").GameObjects.GameObject[] = [];
      const stuckDetector = new StudioStuckDetector();
      const emitStuck = (changed: boolean) => { if (changed) callbacksRef.current.onStuckChange?.(stuckDetector.value); };
      const zoneChanges = new StudioZoneChangeTracker(manifest);
      // 타일 이펙트 실행 판정: 배치가 바뀌면 트래커를 새로 만들어 기준선을 다시 잡는다.
      let tileTracker = new StudioTileEffectRuntimeTracker({ effects: tileEffectsRef.current, officeZones: manifest.zones ?? [] });
      let tileTrackerEffects = tileEffectsRef.current;
      let nearbyNpcKey = "";
      // main 게임필 이식: 입력 감도·가속·끼임 탈출·충돌 흔들림·카메라 디렉터(world-feel), 발밑 연출(motion-feel),
      // 이벤트 디렉터(근접 트리거·NPC 인사·동료 접근 → onSpaceUiEvent). 매 프레임 객체를 만들지 않는다.
      const worldFeel = new StudioWorldFeelController();
      // 충돌 반발 판정: Arcade blocked(한 스텝 늦게 도착)와 직전 적용 속도를 맞춰 onset을 잡는다.
      const collisionResponder = new StudioCollisionResponder();
      const lastAppliedVelocity = { x: 0, y: 0 };
      /** 순간이동·강제 재배치 뒤에는 충돌 이력과 직전 속도를 버린다 (도착 직후 엉뚱한 반발 방지). */
      const resetCollisionResponse = () => {
        collisionResponder.reset();
        lastAppliedVelocity.x = 0;
        lastAppliedVelocity.y = 0;
      };
      const motionFrame = createStudioMotionFeelFrame();
      let motionFeel: StudioMotionFeelRuntime | null = null;
      /** 오브젝트 사용 순간의 미세 반응: 대상 지점에 짧은 반짝임을 터뜨린다 (발밑 연출 이미터를 재사용한다). */
      const burstInteractionCue = (point: StudioVirtualSpacePoint) => {
        if (reducedMotion.matches || experienceRef.current.effectLevel === "low") return;
        const projected = studioProjectTownPoint(manifest, point);
        motionFeel?.burst(projected.x, projected.y - 12, studioTownDepthForPoint(manifest, point, 1_001) + 2, 7, 0xf5d78a);
      };
      // 스프라이트 스무딩: 상태 전환 크로스페이드 런타임 + 배우별 표시 감쇠 좌표 캐시 + 접지 AO/오라.
      let spriteCrossfades: StudioSpriteCrossfadeRuntime | null = null;
      let actorAura: StudioActorAuraRuntime | null = null;
      const npcDisplayPoints = new Map<string, StudioDisplayPoint>();
      /** NPC 가시성 페이드 상태: 관심 경계에서 툭 나타나고 사라지던 팝을 알파 전이로 바꾼다. */
      const npcVisibilityFades = new Map<string, StudioActorVisibilityFadeState>();
      /** 동료 가시성 페이드 상태: 관심 컬링 토글에도 같은 전이를 적용한다 (입·퇴장 페이드와 별개 층). */
      const peerVisibilityFades = new Map<string, StudioActorVisibilityFadeState>();
      /** UI 이벤트는 이벤트 피드와 fx 알림이 같은 출구로 낸다. */
      const emitSpaceUiEvent = (event: StudioSpaceUiEvent) => {
        if (import.meta.env.DEV) parent.dataset.spaceUiEvent = `${event.kind}:${event.titleKo}`.slice(0, 120);
        callbacksRef.current.onSpaceUiEvent?.(event);
      };
      const eventFeed = new StudioWorldEventFeed(manifest, interactions, emitSpaceUiEvent);
      const cameraGround = { x: 0, y: 0 };
      // 데드존이 비교할 직전 카메라 기준점(흔들림 제외). 첫 프레임은 NaN이라 목표를 그대로 따른다.
      const cameraBase = { x: Number.NaN, y: Number.NaN };
      // 캠퍼스 바닥 아틀라스만 재질 표를 알고 있다. 게시 월드의 다른 타일셋은 지형 분류를 쓴다.
      const campusFloorMap = studioVirtualCampusScene(manifest) ? manifest.tilemap ?? null : null;
      const motionConfig: { acceleration: number; deceleration: number; maxSpeed: number } = { ...DEFAULT_STUDIO_MOTION_CONFIG };
      let cameraBaseZoom = 1;
      const userZoom = new StudioUserZoomRuntime(bridge.userZoom);
      const cameraPan = new StudioCameraPanRuntime(bridge.cameraPan);
      /** 화면에 고정된 원경(cinematic-v9)은 줌이 바뀔 때마다 화면을 덮도록 다시 맞춘다. */
      const screenFixedHorizon = horizonUrl.includes("/cinematic-v9/");
      /** 장면의 모든 Phaser Text를 화면 배율에 맞는 해상도로 그린다. 픽셀 아트 화풍에서는 거친 글자를 유지한다. */
      let textResolution: StudioTextResolutionRuntime | null = null;
      /** 크게 줄어 그려지는 스프라이트의 텍스처를 반감 사본으로 올려 앨리어싱을 없앤다(WebGL 전용). */
      let textureLod: StudioTextureLodRuntime | null = null;
      let cameraFollows = true;
      let lastPromptNpcId: string | null = null;
      const npcNoticedAt = new Map<string, number>();

      const {
        updateDisplaySize,
        hasStaticAsset,
        applySpriteVisual,
        applyAvatarVisual,
      } = createStudioSpriteVisualApplier({
        scene,
        isCancelled: () => cancelled,
        isSceneReady: () => sceneReady,
        characterAssets,
        reducedMotion,
        artStyle,
        actorExpressionTextureKey,
        fallbackAsset,
        identityRef,
        getSelfCustomSheetSkin: () => selfCustomSheetSkin,
        frameRegistry,
      });

      const getPeerSnapshot = (id: string) =>
        snapshotRef.current.peers.find((peer) => peer.participant.sessionId === id);

      const setPathTo = (point: StudioVirtualSpacePoint) => {
        if (runtimeInputBlocked()) return;
        if (!localBody) return;
        markerStartedAt = Date.now();
        portalState.path = findStudioWorldPath(
          navigationWorld,
          { x: localBodyPhysics?.center.x ?? localBody.x, y: localBodyPhysics?.center.y ?? localBody.y },
          point,
        );
      };

      /** 동료 비주얼의 완전한 파괴: 스프라이트·이름표·상태 점·이모트·말풍선·장식·에셋 거주를 한곳에서 해제한다. */
      const destroyPeerVisual = (id: string, visual: PeerVisual) => {
        peerVisibilityFades.delete(id);
        return destroyStudioPeerVisual({
        releaseCrossfade: (sprite) => spriteCrossfades?.release(sprite),
        destroyStatusDot: (dotId) => { statusDots.get(dotId)?.destroy(); statusDots.delete(dotId); },
        removeEmote: (key) => emotes?.remove(key),
        removeSpeech: (key) => speech?.remove(key),
        removeDecoration: (actorId) => decorationRuntime?.removeActor(actorId),
        releaseAsset: (owner) => characterAssets.release(owner),
        }, peers, id, visual);
      };

      /** 월드 충돌기(벽·장애물) 활성/비활성. 고스트 모드와 따라가기 벽 통과가 공유한다. */
      const { setWorldCollidersActive, applyGhostMode } = createStudioGhostModeApplier({
        colliders: ghostColliders,
        followWallPassApplied: () => followWallPassApplied,
        localSprite: () => localSprite,
        onGhostModeChange: (enabled) => callbacksRef.current.onGhostModeChange?.(enabled),
      });

      const syncSnapshot = (next: StudioVirtualSpaceSnapshot) => {
        if (!sceneReady || cancelled) return;
        const result = syncStudioVirtualSpaceSnapshot({
          next,
          scene,
          peers,
          artStyle,
          actorVisualScale,
          gaitDistancePerCycle: playerLocomotion.gaitDistancePerCycle,
          nameplateStyle,
          hasStaticAsset,
          fallbackAsset,
          runtimeInputBlocked,
          onTapPeer: (peerId, point) => {
            queuedWalkOver = { id: peerId, point };
            bridge.setFollowingPeer(peerId);
          },
          frameTime,
          reducedMotion: reducedMotion.matches,
          effectLevel: experienceRef.current.effectLevel,
          emotes,
          motionFeel,
          spriteCrossfades,
          applyAvatarVisual,
          queueEmoteReaction,
          destroyPeerVisual,
          localBody,
          localSprite,
          localBodyPhysics,
          moving,
          facing: localPresentation.facing,
          navigationWorld,
          localPose,
          fixedStepClock,
          resetCollisionResponse,
          onLocalHardSync: (point) => {
            portalState.lastWalkablePoint = point;
            localPresentation.previousRendered = null;
          },
          selfIdentity: identityRef.current,
          lastSelfReaction,
          fxWiring,
        });
        selfChatBubbleText = result.selfChatBubbleText;
        lastSelfReaction = result.lastSelfReaction;
      };
      const runtime = { syncSnapshot };
      runtimeRef.current = runtime;

      scene.preload = function preload() {
        parent.dataset.bootStage = "loading-textures";
        this.load.on("loaderror", (file: import("phaser").Loader.File) => failedTextures.add(file.key));
        boot.watchLoader(this.load);
        this.load.image(backgroundTextureKey, backgroundUrl);
        this.load.image(horizonTextureKey, horizonUrl);
        queueStudioLivingWorldTextures(this.load, livingTextureKeys, artStyle);
        queueStudioAmbienceTextures(this.load);
        queueStudioLightTextures(this.load);
        this.load.spritesheet(decorationTextureKeys.decor, studioVirtualLivingTownAssetUrl(artStyle, "decor-sheet"), { frameWidth: 128, frameHeight: 128 });
        this.load.spritesheet(decorationTextureKeys.accessory, studioVirtualLivingTownAssetUrl(artStyle, "accessory-sheet"), { frameWidth: 96, frameHeight: 96 });
        this.load.image(objectTextureKeys.door, studioVirtualArtObjectUrl(artStyle, "door"));
        this.load.image(objectTextureKeys.crate, studioVirtualArtObjectUrl(artStyle, "crate"));
        this.load.image(objectTextureKeys.lantern, studioVirtualArtObjectUrl(artStyle, "lantern"));
        this.load.image(objectTextureKeys.bench, studioVirtualArtObjectUrl(artStyle, "bench"));

        // Ready means the world and a safe actor frame exist, not that every clip has downloaded.
        for (const asset of new Map([fallbackAsset, bootSelfAsset, npcFallbackAsset, ...npcBootAssets].map((item) => [item.key, item])).values()) {
          queueCharacterTexture(asset);
        }

        const loadedProps = new Set<string>();
        for (const prop of manifest.props) {
          if (!prop.assetUrl) continue;
          const key = propTextureKey(prop);
          if (loadedProps.has(key)) continue;
          loadedProps.add(key);
          this.load.image(key, worldAssetUrls?.get(prop.assetUrl) ?? studioVirtualPlaceTileAssetUrl(prop.assetUrl, artStyle));
        }
      };

      scene.create = function create() {
        if (cancelled || engineFailed) return;
        parent.dataset.bootStage = "creating-scene";
        // 이후 만들어지는 모든 Text(이름표·구역 이름·안내 글자)를 붙잡아 같은 해상도로 맞춘다.
        textResolution = artProfile.pixelated ? null : new StudioTextResolutionRuntime(this.sys.events);
        cleanup.push(() => textResolution?.dispose());
        // 1x 화면에서 원본이 2~7배로 줄어 그려지는 스프라이트(가구·아바타·NPC)는 이중선형만으로는 선이 끊기고 윤곽이 계단진다.
        // 화면 밀도를 재서 반감 사본을 GPU 텍스처에 올린다. 픽셀 아트(NEAREST)와 캔버스 렌더러는 그대로 둔다.
        textureLod = createStudioTextureLod(this, { pixelated: artProfile.pixelated });
        cleanup.push(() => textureLod?.dispose());
        // HD 스프라이트 파이프라인(v9): DPR·이펙트 레벨로 SD/HD/ULTRA를 골라 진단에 남긴다.
        // 실제 샘플링 전환은 textureLod가 맡고, 그림자·광원 값은 CSS/조명 런타임과 공유한다.
        try {
          const hd = studioHdSpriteProfile({
            dpr: globalThis.devicePixelRatio || 1,
            viewportWidth: parent.clientWidth || 1280,
            pixelated: artProfile.pixelated,
            reducedMotion: reducedMotion.matches,
            effectLevel: experienceRef.current.effectLevel === "low" ? "low" : experienceRef.current.effectLevel === "high" ? "high" : "medium",
          });
          parent.dataset.hdSpriteTier = hd.tier;
          parent.dataset.hdSpriteSampling = hd.sampling;
        } catch { /* 진단 실패는 엔진 실패로 취급하지 않는다 */ }
        for (const [key, atlas] of sceneArtAtlases) {
          if (this.textures.exists(key) && !registerStudioSceneAtlas(this.textures.get(key), atlas)) {
            failedTextures.add(key);
            this.textures.remove(key);
          }
        }
        for (const asset of [fallbackAsset, bootSelfAsset, npcFallbackAsset, ...npcBootAssets]) prepareCharacterTexture(asset);
        if ((!manifest.tilemap && failedTextures.has(backgroundTextureKey))
          || !this.textures.exists(fallbackAsset.key)) { fail(); return; }
        characterAssets.use("fallback", [fallbackAsset]);
        if (this.textures.exists(bootSelfAsset.key)) characterAssets.use("self", [bootSelfAsset]);
        // 커스터마이저에서 시트를 바꾸면 로컬 스킨을 교체하고 텍스처를 확보한다.
        // applyAvatarVisual이 다음 프레임부터 새 스킨을 쓴다.
        const disposeSpriteSheetListener = onSpriteSheetConfigChanged(() => {
          const config = getActiveSpriteSheetConfig();
          const next = config ? customSpriteSheetSkin(config) : null;
          if (next?.key === selfCustomSheetSkin?.key) return;
          selfCustomSheetSkin = next;
          if (next) characterAssets.use("self", [studioCharacterStaticAsset(next, localPresentation.facing)]);
        });
        cleanup.push(disposeSpriteSheetListener);
        this.physics.world.setBounds(0, 0, manifest.width, manifest.height);

        const backdrop = drawStudioBackdropLayers(this, manifest, { backgroundTextureKey, horizonTextureKey, backdrop: environmentPreference.backdrop });
        const { backgroundRect } = backdrop;
        horizonArtwork = backdrop.horizonArtwork;
        lastSkyTintPhase = null;
        if (manifest.tilemap) {
          tileWorld = createStudioWorldTileRuntime(this, studioRenderedTileWorld(manifest.tilemap, artStyle), `studio-world-${manifest.id}`, {
            resolveUrl: (url) => worldAssetUrls?.get(url) ?? studioVirtualPlaceTileAssetUrl(url, artStyle),
            parseGid: Phaser.Tilemaps.Parsers.Tiled.ParseGID,
            onError: (message) => { parent.dataset.tileError = message; fail(); },
          });
          cleanup.push(() => { tileWorld?.destroy(); tileWorld = null; });
        }
        const campusScene = studioVirtualCampusScene(manifest);
        if (campusScene) {
          // 캠퍼스 벽·문·표지판·오브젝트·절벽은 전용 런타임이 그린다(Canvas 비대화 방지).
          campusRuntime = new StudioCampusRuntime(this, campusScene, {
            style: artStyle,
            translate: (ko, en) => btRef.current(ko, en),
            ...(spaceThemeDef ? { theme: spaceThemeDef } : {}),
          });
          campusFrame = createStudioCampusRuntimeFrame(this.cameras.main.worldView);
          cleanup.push(() => { campusRuntime?.destroy(); campusRuntime = null; });
        }

        livingWorld = new StudioLivingWorldRuntime(this, manifest, artStyle, livingTextureKeys);
        cleanup.push(() => { livingWorld?.destroy(); livingWorld = null; });
        // 날씨 파티클·앰비언트 순찰(가이드 NPC+동물) 렌더는 전용 런타임이 전담한다.
        const ambienceGuideSkin = studioProceduralNpcSkinByKey("npc-guide");
        const ambienceGuideAsset = studioCharacterStaticAsset(ambienceGuideSkin, "down");
        const ambienceGuideInitialAsset = hasStaticAsset(ambienceGuideAsset) ? ambienceGuideAsset
          : hasStaticAsset(npcFallbackAsset) ? npcFallbackAsset : fallbackAsset;
        ambienceRender = new StudioVirtualAmbienceRenderRuntime(this, manifest, {
          skin: ambienceGuideSkin,
          textureKey: ambienceGuideInitialAsset.key,
          textureFrame: ambienceGuideInitialAsset.frame,
          visualWidth: 92 * 0.72 * actorVisualScale,
          visualHeight: 123 * 0.72 * actorVisualScale,
          applyVisual: applySpriteVisual,
        });
        cleanup.push(() => { ambienceRender?.destroy(); ambienceRender = null; });
        // 오브젝트 광원(램프·네온·모니터 글로우)과 가구 블롭 섀도우는 전용 런타임이 전담한다.
        lightRender = new StudioVirtualLightRenderRuntime(this, manifest);
        cleanup.push(() => { lightRender?.destroy(); lightRender = null; });
        if (!manifest.tilemap) {
          deskPodRuntime = new StudioDeskPodRuntime(this);
          cleanup.push(() => { deskPodRuntime?.destroy(); deskPodRuntime = null; });
        }

        const modularCampus = manifest.tilemap ? [] : drawStudioModularCampus(this, manifest, artStyle);
        parent.dataset.worldPresentation = worldSetDressing.length > 0 ? "illustrated-place" : manifest.tilemap ? "tilemap" : modularCampus.length > 0 ? "modular-campus" : "illustrated";
        cleanup.push(() => modularCampus.forEach((item) => item.destroy()));
        setDressingRuntime = new StudioVirtualSetDressingRuntime(this, manifest, {
          landmarks: landmarksTextureKey, furniture: decorationTextureKeys.furniture, cat: decorationTextureKeys.cat, artStyle,
        }, artProfile.palette);
        cleanup.push(() => { setDressingRuntime?.destroy(); setDressingRuntime = null; });

        drawStudioOcclusionLayers(this, manifest, worldSetDressing.length > 0 ? [] : manifest.occlusionLayers ?? [], {
          artProfile, backgroundRect, backgroundTextureKey, occlusionVisuals, onCleanup: (dispose) => cleanup.push(dispose),
        });

        routeOverlay = this.add.graphics().setDepth(650);
        locateOverlay = this.add.graphics().setDepth(60_001);
        proximityOverlay = this.add.graphics().setDepth(780);
        zoneVeil = this.add.graphics().setDepth(40_000);
        highlightRing = this.add.graphics().setDepth(80_000);
        arrivalRing = this.add.graphics().setDepth(85_000);
        // 전환 베일: 화면 고정, 씬이 그려지기 전 첫 프레임부터 덮어 둔다(스폰 시퀀스가 걷어 낸다).
        transitionVeil = this.add.graphics().setScrollFactor(0).setDepth(300_000);
        if (!reducedMotion.matches) {
          transitionVeil.fillStyle(STUDIO_ZONE_FADE_COLOR, 1);
          transitionVeil.fillRect(0, 0, this.cameras.main.width, this.cameras.main.height);
        }

        drawStudioPrivateZoneOverlay(this, manifest, btRef.current("프라이빗", "Private"));
        if (debugWorld) {
          drawStudioWorldDebugOverlay(this, manifest, interactions);
          parent.dataset.authoringOverlay = "true";
        } else {
          delete parent.dataset.authoringOverlay;
        }

        placeStudioWorldPropImages(this, manifest, {
          worldAssetUrls, artStyle, decorationTextureKeys, illustratedProps, interactionById,
          onSelect: (interaction) => { queuedInteraction = interaction; },
        });

        const self = snapshotRef.current.self;
        const spawn = studioWorldSpawn(manifest);
        const initialPoint = resolveStudioWorldSpawn(navigationWorld, self);
        if (!initialPoint) { fail(); return; }
        localPresentation.facing = studioWorldCanOccupy(navigationWorld, self)
          ? self.facing
          : spawn.facing ?? "down";
        localPose = new StudioFixedStepPose(initialPoint);
        fixedStepClock.reset(this.game.loop.time);
        localPose.reset(initialPoint, fixedStepClock.time);
        cameraTarget.x = initialPoint.x; cameraTarget.y = initialPoint.y;

        const bodyZone = this.add.zone(initialPoint.x, initialPoint.y, STUDIO_WORLD_PLAYER_RADIUS * 2, STUDIO_WORLD_PLAYER_RADIUS * 2);
        localBody = bodyZone;
        this.physics.add.existing(bodyZone);
        localBodyPhysics = bodyZone.body as import("phaser").Physics.Arcade.Body;
        localBodyPhysics.setCircle(STUDIO_WORLD_PLAYER_RADIUS);
        localBodyPhysics.setCollideWorldBounds(true);
        localBodyPhysics.setMaxVelocity(STUDIO_VIRTUAL_SPACE_WALK_SPEED * 1.4);
        const observePhysics = (fixedDelta: number) => {
          if (localBodyPhysics) {
            localPose.observe(localBodyPhysics.center, fixedStepClock.advance(fixedDelta));
            // 충돌 뒤의 실제 속도를 받아 벽에서 반대로 움직일 때 불필요한 제동을 없앤다.
            portalState.motion = { velocity: { x: localBodyPhysics.velocity.x, y: localBodyPhysics.velocity.y } };
          }
        };
        this.physics.world.on(Phaser.Physics.Arcade.Events.WORLD_STEP, observePhysics);
        cleanup.push(() => this.physics.world.off(Phaser.Physics.Arcade.Events.WORLD_STEP, observePhysics));

        for (const collider of studioWorldCollisionRects(manifest)) {
          const zone = this.add.zone(collider.x, collider.y, collider.width, collider.height).setOrigin(0);
          this.physics.add.existing(zone, true);
          // 고스트 모드에서 비활성화할 수 있게 충돌기를 보관한다.
          ghostColliders.push(this.physics.add.collider(bodyZone, zone));
          staticColliderObjects.push(zone);
        }
        if (!manifest.tilemap) {
          objectRuntime = new StudioWorldObjectRuntime(this, manifest, bodyZone, staticColliderObjects, objectTextureKeys);
          cleanup.push(() => { objectRuntime?.destroy(); objectRuntime = null; });
        }

        const localVisual = createStudioLocalVisual({
          scene: this, point: initialPoint, facing: localPresentation.facing, actorVisualScale, nameplateStyle,
          skin: selfCustomSheetSkin ?? studioCharacterSkinForArtStyle(resolveStudioCharacterAppearance(self, identityRef.current).skin, artStyle),
          hasStaticAsset, fallbackAsset, gaitDistancePerCycle: playerLocomotion.gaitDistancePerCycle,
          displayName: displayNameRef.current, updateDisplaySize,
        });
        localShadow = localVisual.shadow;
        localSprite = localVisual.sprite;
        localLabel = localVisual.label;
        portalState.lastWalkablePoint = initialPoint;
        decorationRuntime = new StudioVirtualDecorationRuntime(this, bodyZone, decorationTextureKeys);
        decorationRuntime.syncDecorations(studioVirtualDecorationStateForWorld(decorationsRef.current, manifest));
        lastDecorationState = decorationsRef.current;
        cleanup.push(() => { decorationRuntime?.destroy(); decorationRuntime = null; });

        const bubbleColors = studioCanvasBubbleColors(parent);
        emotes = new StudioEmoteRuntime(this, { nearestFilter: Phaser.Textures.FilterMode.NEAREST, colors: bubbleColors, burst: (x, y, depth, count, color) => { if (experienceRef.current.effectLevel !== "low") motionFeel?.spark(x, y, depth, count, color); } });
        speech = new StudioSpeechBubbleRuntime(this, bubbleColors);
        cleanup.push(() => { emotes?.destroy(); emotes = null; speech?.destroy(); speech = null; chatter.reset(); });
        promptRuntime = new StudioWorldPromptRuntime(this, bubbleColors);
        cleanup.push(() => { promptRuntime?.destroy(); promptRuntime = null; });
        motionFeel = new StudioMotionFeelRuntime(this);
        cleanup.push(() => { motionFeel?.destroy(); motionFeel = null; });
        spriteCrossfades = new StudioSpriteCrossfadeRuntime(this);
        actorAura = new StudioActorAuraRuntime(this);
        cleanup.push(() => { spriteCrossfades?.destroy(); spriteCrossfades = null; actorAura?.destroy(); actorAura = null; });
        // 상호작용 fx 런타임: 오브젝트 반응(김·추출 고리·준비 완료 배지)·발표 스포트라이트를
        // 라이브 캔버스가 직접 생성·구동한다. 배지 색은 이름표와 같은 CSS 토큰에서 읽고,
        // 대사 주입·전파 적용은 라이브 배선 브리지가 맡는다.
        const fxBadgeColors = studioCanvasNameplateColors(parent);
        fxWiring = createStudioInteractionFxLiveWiring(
          (callbacks) => new StudioInteractionFxRuntime(this, interactions, {
            style: artStyle,
            objects: campusScene?.objects ?? [],
            badge: { plate: fxBadgeColors.plate, text: fxBadgeColors.text, accent: fxBadgeColors.self },
            translate: (ko, en) => btRef.current(ko, en),
          }, callbacks),
          {
            now: () => frameTime,
            notify: emitSpaceUiEvent,
            selfEmote: (emote) => { emotes?.play("self", emote, frameTime, "person", STUDIO_EMOTE_DEDUPE_MS); },
            onObjectStateChange: (change) => callbacksRef.current.onObjectStateChange?.(change),
            npcCandidates: () => [...npcs.values()].map((visual) => ({ id: visual.definition.id, point: visual.groundPoint })),
          },
        );
        interactionFx = fxWiring.runtime;
        interactionFx.syncPlacedFixtures(placedFixturesRef.current ?? []);
        cleanup.push(() => { interactionFx?.destroy(); interactionFx = null; fxWiring = null; });
        buildPlacement = createStudioBuildPlacementCanvasController(this, {
          bridge, heldKeys, badgeColors: { plate: fxBadgeColors.plate, text: fxBadgeColors.text },
          getWorld: () => navigationWorld,
          getOccupiedPoints: () => [
            ...(placedFixturesRef.current ?? []).map((fixture) => fixture.point),
            ...decorationsRef.current.placements.map((placement) => ({ x: placement.x, y: placement.y })),
          ],
          getPlacedCount: () => (placedFixturesRef.current ?? []).length,
          getSelfPoint: () => ({ x: localBodyPhysics?.center.x ?? initialPoint.x, y: localBodyPhysics?.center.y ?? initialPoint.y }),
          isInputBlocked: runtimeInputBlocked,
          reducedMotion: () => reducedMotion.matches,
          translate: (ko, en) => btRef.current(ko, en),
          emit: (event) => buildPlacementEventRef.current?.(event),
          onSessionStart: () => bridge.clearMovement(),
        });
        cleanup.push(() => { buildPlacement?.destroy(); buildPlacement = null; });
        for (const [id, marker] of createStudioInteractionMarkers(this, interactions, artProfile, Phaser.Geom,
          (interaction) => { queuedInteraction = interaction; })) interactionMarkers.set(id, marker);
        createStudioPortalGateways(this, manifest, portals, artProfile, (ko, en) => btRef.current(ko, en), (portal) => setPathTo(portal.point));

        for (const [id, visual] of createStudioNpcVisuals({
          scene: this, manifest, views: npcDirector.views, artStyle, actorVisualScale,
          hasStaticAsset, fallbackAsset, npcFallbackAsset, nameplateStyle,
          translate: (ko, en) => btRef.current(ko, en),
          inputBlocked: runtimeInputBlocked,
          interact: (interaction, definition) => {
            if (callbacksRef.current.onNpcInteract) callbacksRef.current.onNpcInteract(interaction, definition);
            else callbacksRef.current.onInteract(interaction);
          },
          applySpriteVisual,
        })) npcs.set(id, visual);

        keys = this.input.keyboard?.addKeys({
          w: Phaser.Input.Keyboard.KeyCodes.W,
          a: Phaser.Input.Keyboard.KeyCodes.A,
          s: Phaser.Input.Keyboard.KeyCodes.S,
          d: Phaser.Input.Keyboard.KeyCodes.D,
          up: Phaser.Input.Keyboard.KeyCodes.UP,
          down: Phaser.Input.Keyboard.KeyCodes.DOWN,
          left: Phaser.Input.Keyboard.KeyCodes.LEFT,
          right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
          shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
          interact: Phaser.Input.Keyboard.KeyCodes.E,
        }, false, false) as Record<string, import("phaser").Input.Keyboard.Key> | null;

        this.input.on("pointerdown", (pointer: import("phaser").Input.Pointer) => {
          if (buildPlacement?.consumePointerDown(pointer)) return;
          if (!pointer.leftButtonDown() || runtimeInputBlocked()) return;
          const nativePointer = pointer.event as PointerEvent | undefined;
          if (nativePointer?.pointerType === "touch" && experienceRef.current.controlMode !== "tap") return;
          bridge.setFollowingPeer(null);
          callbacksRef.current.onCancelFollow();
          portalState.approachState = EMPTY_STUDIO_WORLD_APPROACH;
          queuedInteraction = null;
          setPathTo({ x: pointer.worldX, y: pointer.worldY });
        });

        const camera = this.cameras.main;
        camera.setBounds(0, 0, manifest.width, manifest.height);
        camera.startFollow(cameraTarget, false, reducedMotion.matches ? 1 : 0.12, reducedMotion.matches ? 1 : 0.12);
        const cameraModeController = new StudioCameraFollowModeController(camera);
        applyCameraMode = (deadzoneScale = 1) => cameraModeController.update(experienceRef.current.cameraMode, deadzoneScale);
        applyCameraMode();
        const resizeCamera = (gameSize: { width: number; height: number }) => {
          parent.dataset.cameraMode = applyStudioWorldCamera(camera, manifest, gameSize.width / viewport.ratio, gameSize.height / viewport.ratio, viewport.ratio);
          // 카메라 디렉터의 속도 줌·대화 줌은 추종(follow) 카메라에서만, 이 기준 줌에 곱한다.
          cameraBaseZoom = camera.zoom;
          cameraFollows = parent.dataset.cameraMode === "follow";
          if (horizonArtwork && screenFixedHorizon) fitStudioHorizonArtwork(horizonArtwork, gameSize, camera.zoom);
          // 사용자 줌은 추종 카메라에서만 쓴다(고정 프레임 장소는 화면 전체가 이미 보인다).
          userZoom.setView(cameraBaseZoom, { cssWidth: gameSize.width / viewport.ratio, cssHeight: gameSize.height / viewport.ratio, ratio: viewport.ratio }, manifest, cameraFollows);
        };
        resizeCamera({ width: this.scale.width, height: this.scale.height });
        this.scale.on("resize", (gameSize: { width: number; height: number }) => resizeCamera(gameSize));
        // 입장 연출은 카메라 페이드가 아니라 스폰 전환 시퀀스(베일)가 담당한다.
        // 씬 준비 완료 신호가 와야 열리므로 로딩 속도와 무관하게 잘리지 않는다.

        const canvas = this.game.canvas;
        canvas.tabIndex = 0;
        canvas.setAttribute("role", "application");
        canvas.setAttribute("aria-label", btRef.current(
          "가상 스튜디오 · WASD/방향키로 이동 · E 또는 X로 상호작용 · Tab으로 메뉴 이동",
          "Virtual studio · WASD/arrows to move · E or X to interact · Tab to menus",
        ));
        const focusCanvas = () => canvas.focus({ preventScroll: true });
        bridge.setFocusHandler(focusCanvas);
        cleanup.push(() => bridge.setFocusHandler(null));
        const queueKeyboardInteraction = () => {
          if (document.activeElement === canvas && !runtimeInputBlocked()) {
            keyboardInteractQueued = true;
          }
        };

        const stopMovement = () => {
          bridge.clearMovement();
          portalState.path = [];
          portalState.motion = { velocity: { x: 0, y: 0 } };
          keyboardInteractQueued = false;
          localBodyPhysics?.setVelocity(0, 0);
          heldKeys.clear();
          this.input.keyboard?.resetKeys();
          gamepadInteractHeld = true;
          if (moving && localBody && !cancelled) {
            moving = false;
            lastPublishedMoving = false;
            callbacksRef.current.onLocalState({ point: { x: localBody.x, y: localBody.y }, facing: localPresentation.facing, moving: false, zoneId: studioWorldRoomAt(manifest, localBody), pose: bridge.getPose() });
          }
          callbacksRef.current.onCancelFollow();
        };
        const reduceMotionChanged = () => {
          camera.setLerp(reducedMotion.matches ? 1 : 0.12, reducedMotion.matches ? 1 : 0.12);
          currentQualityProfile = studioVirtualQualityProfile(experienceRef.current.qualityPreset, qualityEnvironment());
          adaptiveQuality.reset(currentQualityProfile.tier);
          lastQualityTier = currentQualityProfile.tier;
          resizeRuntime();
        };
        cleanup.push(bindStudioCanvasInput({
          canvas, keyboard: () => this.input.keyboard, heldKeys, reducedMotion, focusCanvas, stopMovement,
          isSceneReady: () => sceneReady, isInputBlocked: runtimeInputBlocked,
          onEscape: () => { if (buildPlacement?.handleEscape()) return; npcDirector.cancelGuideTour(); stopMovement(); },
          onInteractKey: () => { if (!buildPlacement?.active) queueKeyboardInteraction(); },
          onJumpKey: () => { if (!buildPlacement?.active && document.activeElement === canvas && !runtimeInputBlocked()) localPresentation.jumpQueued = true; },
          onGhostToggle: () => { const next = !bridge.isGhostMode(); bridge.setGhostMode(next); applyGhostMode(next); },
          onHidden: () => { npcDirector.cancelGuideTour(); stopMovement(); },
          onReducedMotionChange: reduceMotionChanged,
          onModalBlockerChange: (blocked) => { modalInputBlocked = blocked; },
        }));
        cleanup.push(bindStudioCameraGestures(canvas, { zoom: bridge.userZoom, pan: bridge.cameraPan, canZoom: () => sceneReady && bridge.userZoom.getSnapshot().available, canPan: () => sceneReady && bridge.cameraPan.getSnapshot().available && !runtimeInputBlocked() && !buildPlacement?.active, focused: () => document.activeElement === canvas, onPinchStart: stopMovement }));
        portalTracker.seed(portals, initialPoint);
        zoneTracker.seed(studioWorldPresenceZone(manifest, initialPoint)?.id ?? null);
        // 스폰 시퀀스 시작: 월드 준비 완료(setReady 지점) 신호가 올 때까지 베일이 덮는다.
        portalState.zoneTransition = beginStudioZoneSpawnTransition(portalState.zoneTransition, {
          zoneId: studioWorldPresenceZone(manifest, initialPoint)?.id ?? null,
          now: this.game.loop.time,
          reducedMotion: reducedMotion.matches,
        });
        portalState.arrivalRingPoint = initialPoint;
        // 구역 안내와 끼임 해제 버튼은 HUD가 onZoneChange·onStuckChange로 그린다.
        sceneReady = true;
        parent.dataset.bootStage = manifest.tilemap ? "loading-tiles" : "ready";
        setFailure(false);
        if (!manifest.tilemap) {
          boot.settle();
          setReady(true);
          portalState.zoneTransition = markStudioZoneTransitionReady(portalState.zoneTransition, this.game.loop.time);
        }
        const contextLost = (event: Event) => { event.preventDefault(); stopMovement(); fail(); };
        canvas.addEventListener("webglcontextlost", contextLost);
        cleanup.push(() => canvas.removeEventListener("webglcontextlost", contextLost));
        focusWorldOnReady = () => {
          const stage = parent.closest('[data-studio-virtual-space="true"]') ?? parent.parentElement ?? parent;
          if (studioWorldMayTakeFocus(document.activeElement, stage)) focusCanvas();
        };
        if (!manifest.tilemap) focusWorldOnReady();
        syncSnapshot(snapshotRef.current);
        startOptionalSceneArt = createStudioOptionalSceneArtLoader(this, manifest, {
          artStyle, palette: artProfile.palette, parent, illustratedProps, sceneArtAtlases, failedTextures,
          textureKeys: { furniture: decorationTextureKeys.furniture, cat: decorationTextureKeys.cat,
            landmarks: landmarksTextureKey, actorExpression: actorExpressionTextureKey },
          hasSetDressing: worldSetDressing.length > 0, isCancelled: () => cancelled || engineFailed,
          swapSetDressingRuntime: (runtime) => { setDressingRuntime?.destroy(); setDressingRuntime = runtime; },
          refreshDecorationTextures: () => decorationRuntime?.refreshTextures(),
          onCleanup: (fn) => cleanup.push(fn),
        });
        if (!manifest.tilemap) { startOptionalSceneArt(); startOptionalSceneArt = null; }
      };

      scene.update = function update(time: number, deltaMs: number) {
        frameTime = time;
        if (!localBody || !localBodyPhysics || !localSprite || !localShadow || !localLabel) return;
        const dt = Math.min(0.05, Math.max(0, deltaMs / 1000));
        // 스프라이트 크로스페이드는 모션 감소·저사양 효과 단계에서는 끈다 (즉시 교체가 기본 계약).
        const crossfadeEnabled = !reducedMotion.matches && experienceRef.current.effectLevel !== "low";
        if (!sceneReady || cancelled) return;
        textResolution?.sync(Math.max(cameraBaseZoom * userZoom.current, viewport.ratio));
        textureLod?.update(time);
        if (decorationsRef.current !== lastDecorationState || placedFixturesRef.current !== lastPlacedFixtures) {
          lastDecorationState = decorationsRef.current;
          lastPlacedFixtures = placedFixturesRef.current;
          interactionFx?.syncPlacedFixtures(lastPlacedFixtures ?? []);
          navigationWorld = studioVirtualDecorationNavigationWorld(manifest, lastDecorationState);
          decorationRuntime?.syncDecorations(studioVirtualDecorationStateForWorld(lastDecorationState, manifest));
          npcDirector.updateNavigationWorld(navigationWorld);
          const destination = portalState.path.at(-1);
          if (destination) portalState.path = findStudioWorldPath(navigationWorld, localBodyPhysics.center, destination);
        }
        const requestedQuality = experienceRef.current.qualityPreset;
        if (requestedQuality !== lastRequestedQualityPreset) {
          lastRequestedQualityPreset = requestedQuality;
          currentQualityProfile = studioVirtualQualityProfile(requestedQuality, qualityEnvironment());
          adaptiveQuality.reset(currentQualityProfile.tier);
          lastQualityTier = currentQualityProfile.tier;
          resizeRuntime();
        }
        const qualitySample = adaptiveQuality.sample(deltaMs, requestedQuality === "auto" && !reducedMotion.matches, studioVirtualAutomaticQualityTier(qualityEnvironment()));
        if (qualitySample.tier !== lastQualityTier) {
          lastQualityTier = qualitySample.tier;
          currentQualityProfile = studioVirtualQualityProfile(qualitySample.tier, qualityEnvironment());
          resizeRuntime();
        }
        parent.dataset.qualityTier = currentQualityProfile.tier;
        if (time - lastAssetCollectionAt >= 1_000) {
          characterAssets.collect();
          lastAssetCollectionAt = time;
        }
        fixedStepClock.reconcile(this.game.loop.time);
        // 전환 시퀀스를 한 step 진전시킨다. 복귀는 타이머가 아니라 준비 완료·
        // 페이지 확정 신호(consumePortalReveal)로만 이뤄진다.
        if (bridge.consumePortalReveal()) {
          portalState.zoneTransition = revealStudioZoneTransition(portalState.zoneTransition, time);
        }
        const steppedTransition = stepStudioZoneTransition(portalState.zoneTransition, time);
        portalState.zoneTransition = steppedTransition.state;
        const transitionTeleportDueNow = steppedTransition.frame.teleportDue;
        if (steppedTransition.frame.departureDue && portalState.pendingDeparturePortal) {
          const leavingPortal = portalState.pendingDeparturePortal;
          portalState.pendingDeparturePortal = null;
          callbacksRef.current.onPortal?.(leavingPortal);
        }
        const blocked = runtimeInputBlocked() || steppedTransition.frame.blocksInput;
        const worldReadyForHud = manifest.tilemap === undefined || initialTilesReady;
        if (blocked && !wasInputBlocked) {
          heldKeys.clear();
          bridge.clearMovement();
          portalState.path = [];
          portalState.motion = { velocity: { x: 0, y: 0 } };
          keyboardInteractQueued = false;
          localBodyPhysics.setVelocity(0, 0);
          this.input.keyboard?.resetKeys();
          callbacksRef.current.onCancelFollow();
        }
        wasInputBlocked = blocked;
        buildPlacement?.update(time, { canvasFocused: document.activeElement === this.game.canvas });
        const typing = blocked || buildPlacement?.active || document.activeElement !== this.game.canvas || bridge.cameraPan.isLooking();
        if (bridge.getStopRevision() !== lastStopRevision) {
          lastStopRevision = bridge.getStopRevision();
          portalState.path = [];
          portalState.motion = { velocity: { x: 0, y: 0 } };
          localBodyPhysics.setVelocity(0, 0);
          portalState.walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
          portalState.approachState = EMPTY_STUDIO_WORLD_APPROACH;
        }
        const requestedEmote = bridge.consumeEmote();
        if (requestedEmote) {
          // 같은 요청이 스냅샷(selfReaction) 경로로 이미 막 시작됐다면 두 번 재시작하지 않는다.
          emotes?.play("self", requestedEmote, time, "person", STUDIO_EMOTE_DEDUPE_MS);
          playStudioSfxSound(studioEmoteSfxKind(requestedEmote), 0.85);
          queueEmoteReaction(requestedEmote, null);
        }
        let ix = blocked || buildPlacement?.active ? 0 : bridge.getJoystick().x;
        let iy = blocked || buildPlacement?.active ? 0 : bridge.getJoystick().y;
        if (!typing) {
          if (heldKeys.has("ArrowLeft") || heldKeys.has("KeyA") || keys?.left?.isDown || keys?.a?.isDown) ix -= 1;
          if (heldKeys.has("ArrowRight") || heldKeys.has("KeyD") || keys?.right?.isDown || keys?.d?.isDown) ix += 1;
          if (heldKeys.has("ArrowUp") || heldKeys.has("KeyW") || keys?.up?.isDown || keys?.w?.isDown) iy -= 1;
          if (heldKeys.has("ArrowDown") || heldKeys.has("KeyS") || keys?.down?.isDown || keys?.s?.isDown) iy += 1;
        }

        const pads = typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"
          ? Array.from(navigator.getGamepads())
          : [];
        const gamepad = readStudioVirtualSpaceGamepadsInput(pads);
        if (!typing) { ix += gamepad.x; iy += gamepad.y; }
        worldFeel.refresh(time, reducedMotion.matches);
        const locomotion = worldFeel.locomotion;
        const shapedInput = worldFeel.shapeInput(ix, iy, time);
        ix = shapedInput.x;
        iy = shapedInput.y;

        const sprint = !typing && Boolean(heldKeys.has("ShiftLeft") || heldKeys.has("ShiftRight") || keys?.shift?.isDown || gamepad.sprint);
        let currentPoint = { x: localBodyPhysics.center.x, y: localBodyPhysics.center.y };
        const ghostActive = bridge.isGhostMode();
        const ghostOverrides = studioGhostCollisionOverrides(ghostActive);
        const frameFollowConfig = bridge.getFollowConfig();
        const followWallPass = Boolean(bridge.getFollowingPeer()) && frameFollowConfig.ignoreCollisions;
        if (followWallPass !== followWallPassApplied) {
          followWallPassApplied = followWallPass;
          if (!ghostActive) setWorldCollidersActive(!followWallPass);
        }
        const skipOccupancyCorrection = ghostOverrides.skipOccupancyCorrection || followWallPass;
        if (!skipOccupancyCorrection && !studioWorldCanOccupy(navigationWorld, currentPoint)) {
          const fallback = studioWorldCanOccupy(navigationWorld, portalState.lastWalkablePoint)
            ? portalState.lastWalkablePoint
            : resolveStudioWorldSpawn(navigationWorld, currentPoint);
          if (!fallback) { fail(); return; }
          localBodyPhysics.reset(fallback.x, fallback.y);
          localBody.setPosition(fallback.x, fallback.y);
          localPose.reset(fallback, fixedStepClock.time);
          portalState.motion = { velocity: { x: 0, y: 0 } };
          resetCollisionResponse();
          portalState.path = [];
          currentPoint = fallback;
          emitStuck(stuckDetector.markCorrected(fallback));
        } else if (studioWorldCanOccupy(navigationWorld, currentPoint)) {
          portalState.lastWalkablePoint = currentPoint;
        }
        const terrain = studioVirtualTerrainAt(manifest, currentPoint);
        for (const visual of occlusionVisuals) {
          const inside = studioWorldPointInsideOcclusionPolygon(currentPoint, visual.polygon);
          const target = visual.outsideAlpha * (inside ? 0.18 : 1);
          const ratio = reducedMotion.matches ? 1 : Math.min(1, Math.max(0, deltaMs) / 140);
          visual.object.setAlpha(visual.object.alpha + (target - visual.object.alpha) * ratio);
        }
        const themePhysics = resolveStudioThemeSurfacePhysics(spaceTheme, ((campusFloorMap && studioCampusFloorSurface(campusFloorMap, currentPoint.x, currentPoint.y)) || studioMotionFeelTerrainSurface(terrain.kind)).surface);
        const config = motionConfig;
        config.acceleration = DEFAULT_STUDIO_MOTION_CONFIG.acceleration / terrain.dragMultiplier * worldFeel.accelerationFactor * themePhysics.accelerationScale;
        config.deceleration = DEFAULT_STUDIO_MOTION_CONFIG.deceleration * terrain.dragMultiplier * worldFeel.accelerationFactor * themePhysics.brakingScale;
        config.maxSpeed = playerLocomotion.walkSpeed * (sprint ? playerLocomotion.sprintMultiplier : 1) * terrain.speedMultiplier * themePhysics.maxSpeedScale;
        const sprintSpeed = playerLocomotion.walkSpeed * playerLocomotion.sprintMultiplier * terrain.speedMultiplier * themePhysics.maxSpeedScale;

        const { nearbyNpc, npcInteraction } = findNearestStudioInteractableNpc(manifest, npcs, currentPoint);
        const radiusInteraction = nearestInteraction(interactions, currentPoint);
        const floorFocus = studioWorldFloorFocusTarget({
          npcNearby: Boolean(npcInteraction),
          interaction: radiusInteraction
            ? { id: radiusInteraction.id, point: radiusInteraction.point, radius: radiusInteraction.radius }
            : null,
        });
        const promptInteract = studioWorldPromptInteractGate({
          requested: bridge.consumeInteract(),
          canvasFocused: document.activeElement === this.game.canvas,
          promptFocused: document.activeElement?.matches('[data-interact-prompt="true"]') ?? false,
          blocked,
        });
        const interactPressed = promptInteract || (!typing && Boolean(
          keyboardInteractQueued
          || (gamepad.interact && !gamepadInteractHeld),
        ));
        keyboardInteractQueued = false;
        gamepadInteractHeld = gamepad.interact;
        const directInput = Math.hypot(ix, iy) > 0.04;
        emitStuck(stuckDetector.sample({ time, directional: directInput && !blocked, point: currentPoint }));
        const selection = queuedInteraction;
        queuedInteraction = null;
        let promptInteraction: StudioWorldInteractionDefinition | null = null;
        if (interactPressed && npcInteraction && !selection && !floorFocus) {
          if (callbacksRef.current.onNpcInteract && nearbyNpc) callbacksRef.current.onNpcInteract(npcInteraction, nearbyNpc.definition);
          else callbacksRef.current.onInteract(npcInteraction);
          if (nearbyNpc) burstInteractionCue(nearbyNpc.groundPoint);
          portalState.approachState = EMPTY_STUDIO_WORLD_APPROACH;
        } else {
          const previousApproach = portalState.approachState.pending;
          const decision = stepStudioWorldInteractionApproach(navigationWorld, portalState.approachState, currentPoint, {
            selection: selection ? { id: selection.id, point: selection.point, radius: selection.radius } : null,
            inRangeInteract: interactPressed && !selection,
            nearby: floorFocus,
            focus: floorFocus,
          });
          portalState.approachState = decision.state;
          const highlighted = decision.prompt ? interactionById.get(decision.highlightId ?? "") ?? null : null;
          promptInteraction = highlighted;
          const highlightChanged = (highlighted?.id ?? null) !== nearbyInteractionId;
          if (highlightChanged) {
            nearbyInteractionId = highlighted?.id ?? null;
            callbacksRef.current.onNearbyInteractionChange?.(highlighted);
            interactionFx?.prompted(highlighted, time);
          }
          if (highlightChanged || time - lastMarkerCullAt >= 200) {
            lastMarkerCullAt = time;
            for (const [id, marker] of interactionMarkers) {
              marker.setVisible(studioWorldMarkerVisible({ prompted: id === nearbyInteractionId, showAll: experienceRef.current.interactionRings,
                distance: Math.hypot(marker.x - currentPoint.x, marker.y - currentPoint.y) }));
            }
          }
          highlightRing?.clear();
          if (highlighted && experienceRef.current.interactionRings) {
            highlightRing?.lineStyle(3, 0xf5d78a, 1).strokeCircle(highlighted.point.x, highlighted.point.y, highlighted.radius);
          }
          if (decision.activateId) {
            const chosen = interactionById.get(decision.activateId) ?? (selection?.id === decision.activateId ? selection : null);
            if (chosen) {
              callbacksRef.current.onInteract(chosen);
              interactionFx?.activate(chosen, currentPoint, time, reducedMotion.matches);
            }
          } else if (interactPressed && !selection) {
            if (promptInteraction || !fxWiring?.activatePlacedFixtureNear(currentPoint, time)) callbacksRef.current.onInteract(null);
          }
          if (decision.walkTarget && !directInput && !blocked) {
            const sameWalk = previousApproach
              && previousApproach.id === decision.state.pending?.id
              && previousApproach.walkTarget.x === decision.walkTarget.x
              && previousApproach.walkTarget.y === decision.walkTarget.y;
            if (!sameWalk) {
              const nextPath = findStudioWorldPath(navigationWorld, currentPoint, decision.walkTarget);
              if (nextPath.length === 0) portalState.approachState = EMPTY_STUDIO_WORLD_APPROACH;
              else portalState.path = nextPath;
            }
          }
        }

        const moveRequest = bridge.consumeMoveTarget();
        if (moveRequest && !blocked && !selection) {
          portalState.approachState = EMPTY_STUDIO_WORLD_APPROACH;
          setPathTo(moveRequest);
        }

        const followPeerId = bridge.getFollowingPeer();
        const followPeer = followPeerId ? getPeerSnapshot(followPeerId) : null;
        const walkChoice = queuedWalkOver;
        queuedWalkOver = null;
        if (!blocked && (walkChoice || followPeerId)) {
          if (followPeerId && !followPeer && !walkChoice) {
            bridge.setFollowingPeer(null);
            callbacksRef.current.onCancelFollow();
            portalState.walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
          } else {
            const previousRoute = portalState.walkOverState.routeTarget;
            const followConfig = bridge.getFollowConfig();
            const followStandOffPx = resolveStudioFollowStandOffPx(followConfig);
            const walked = stepStudioWorldWalkOver(navigationWorld, portalState.walkOverState, currentPoint, {
              choice: walkChoice,
              followTarget: followPeer ? { id: followPeerId!, point: { x: followPeer.state.x, y: followPeer.state.y } } : null,
              direct: directInput,
              standOffPx: followStandOffPx,
              ignoreCollisions: followConfig.ignoreCollisions,
              holdSlackPx: followConfig.mode === "docent" ? followStandOffPx : 0,
            });
            portalState.walkOverState = walked.state;
            if (walked.follow && walked.state.targetId) bridge.setFollowingPeer(walked.state.targetId);
            const routeMoved = walked.routeTarget
              && (!previousRoute || previousRoute.x !== walked.routeTarget.x || previousRoute.y !== walked.routeTarget.y);
            if (walked.routeTarget && routeMoved && !directInput) {
              portalState.approachState = EMPTY_STUDIO_WORLD_APPROACH;
              if (followConfig.ignoreCollisions) portalState.path = [walked.routeTarget];
              else setPathTo(walked.routeTarget);
            } else if (walked.follow && !walked.routeTarget) portalState.path = [];
          }
        }

        const cruise = steerStudioWorldCruise({
          manifest: navigationWorld,
          current: currentPoint,
          path: portalState.path,
          maxSpeed: config.maxSpeed,
          deceleration: config.deceleration,
          direct: blocked ? { x: 0, y: 0 } : { x: ix, y: iy },
        });
        if (directInput) {
          const interruptedNavigation = cruise.cleared || portalState.path.length > 0 || Boolean(followPeerId);
          if (followPeerId) bridge.setFollowingPeer(null);
          if (interruptedNavigation) callbacksRef.current.onCancelFollow();
          portalState.approachState = EMPTY_STUDIO_WORLD_APPROACH;
          portalState.walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
        }
        if (!blocked) {
          portalState.path = cruise.path;
          ix = cruise.input.x;
          iy = cruise.input.y;
        }
        if (ghostActive && !blocked) {
          const destination = portalState.path.at(-1) ?? null;
          const seek = studioGhostSeekInput(currentPoint, destination);
          if (seek) { ix = seek.x; iy = seek.y; }
          else if (destination) { portalState.path = []; ix = 0; iy = 0; }
        }

        const inputMagnitude = Math.hypot(ix, iy);
        const feelTarget = inputMagnitude > 0.001
          ? { x: ix / Math.max(1, inputMagnitude) * config.maxSpeed, y: iy / Math.max(1, inputMagnitude) * config.maxSpeed }
          : { x: 0, y: 0 };
        const feelConfig = {
          ...DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG,
          acceleration: config.acceleration,
          deceleration: config.deceleration,
          maxSpeed: config.maxSpeed,
        };
        const previousVelocity = portalState.motion.velocity;
        if (locomotion.inertial) {
          portalState.motion = { velocity: motionEaser.step(previousVelocity, feelTarget, dt, feelConfig, reducedMotion.matches) };
        } else {
          portalState.motion = {
            velocity: stepCrispVelocity(previousVelocity, feelTarget, dt, config.maxSpeed, locomotion,
              worldFeel.accelerationFactor / Math.max(0.5, terrain.dragMultiplier)),
          };
        }
        let turnFactor = 1;
        const feelSpeed = Math.hypot(portalState.motion.velocity.x, portalState.motion.velocity.y);
        if (locomotion.inertial && feelSpeed > 4 && inputMagnitude > 0.001) {
          turnFactor = turnSlowdownFactor(shortestAngleDelta(
            Math.atan2(previousVelocity.y, previousVelocity.x),
            Math.atan2(feelTarget.y, feelTarget.x),
          ));
        }
        localBodyPhysics.setVelocity(portalState.motion.velocity.x * turnFactor, portalState.motion.velocity.y * turnFactor);
        const body = localBodyPhysics;
        const bounce = locomotion.collisionBounce ? collisionResponder.sample({
          velocity: lastAppliedVelocity, contact: studioCollisionContact(body.blocked, body.touching),
          maxSpeed: config.maxSpeed, reducedMotion: reducedMotion.matches,
          effectsSuppressed: experienceRef.current.effectLevel === "low",
        }, time) : null;
        if (bounce) {
          portalState.motion = { velocity: bounce };
          localBodyPhysics.setVelocity(bounce.x, bounce.y);
          lastAppliedVelocity.x = bounce.x;
          lastAppliedVelocity.y = bounce.y;
          worldFeel.noteImpact(true, 0, time, config.maxSpeed);
          callbacksRef.current.onSelfImpact?.(bounce.x, bounce.y);
        } else {
          lastAppliedVelocity.x = portalState.motion.velocity.x * turnFactor;
          lastAppliedVelocity.y = portalState.motion.velocity.y * turnFactor;
        }
        worldFeel.sampleStuck(currentPoint.x, currentPoint.y, ix, iy, body.blocked.left || body.blocked.right,
          body.blocked.up || body.blocked.down, time, directInput && !blocked);

        portalState.previousRendered = localPresentation.previousRendered;
        const portalStep = stepStudioPhaserPortalAndTeleport({
          state: portalState,
          manifest,
          navigationWorld,
          portals,
          portalTracker,
          bridge,
          localBody,
          localBodyPhysics,
          localPose,
          fixedStepClock,
          motionEaser,
          stuckDetector,
          worldFeel,
          lastAppliedVelocity,
          resetCollisionResponse,
          emitStuck,
          onPortal: callbacksRef.current.onPortal,
          onCancelFollow: callbacksRef.current.onCancelFollow,
          currentPoint,
          time,
          blocked,
          worldReadyForHud,
          reducedMotion: reducedMotion.matches,
          transitionTeleportDueNow,
        });
        localPresentation.previousRendered = portalState.previousRendered;
        currentPoint = portalStep.currentPoint;
        const { portal, snapCamera, teleportTarget } = portalStep;

        const activity = snapshotRef.current.self.activity;
        const speed = Math.hypot(portalState.motion.velocity.x, portalState.motion.velocity.y);
        worldFeel.noteImpact(body.touching.left || body.touching.right || body.touching.up || body.touching.down, speed, time, config.maxSpeed);
        const runtimeBudget = studioRuntimeBudget(parent.clientWidth, reducedMotion.matches, peers.size);
        const maxActiveNpcs = Math.min(runtimeBudget.maxActiveNpcs, currentQualityProfile.maxActiveNpcs);
        const peerInterest = studioTownInterestSnapshot(manifest, currentPoint, [...peers].map(([id, peer]) => ({
          id: `peer:${id}`,
          point: { x: peer.targetX, y: peer.targetY },
          kind: "peer" as const,
          important: bridge.getFollowingPeer() === id,
        })), currentQualityProfile.interestRadius);

        const overlayStep = updateStudioPhaserOverlaysAndZone({
          scene: this,
          manifest,
          parent,
          artProfile,
          currentPoint,
          path: portalState.path,
          portals,
          peers,
          bridge,
          feelSpeed,
          speed,
          time,
          markerStartedAt,
          reducedMotion: reducedMotion.matches,
          worldReadyForHud,
          atmosphere: atmosphereRef.current,
          activity,
          interactionRings: experienceRef.current.interactionRings,
          routeOverlay,
          routeOverlayMemory,
          locateOverlay,
          transitionVeil,
          arrivalRing,
          arrivalRingPoint: portalState.arrivalRingPoint,
          zoneVeil,
          proximityOverlay,
          steppedTransition,
          zoneTracker,
          zoneChanges,
          onZoneChange: callbacksRef.current.onZoneChange,
          tileEffects: tileEffectsRef.current,
          tileTracker,
          tileTrackerEffects,
          onTileEffectTrigger: tileTriggerCallbackRef.current,
          livingWorld,
          objectRuntime,
          deskPodRuntime,
          decorationRuntime,
          setDressingRuntime,
        });
        const zone = overlayStep.zone;
        tileTracker = overlayStep.tileTracker;
        tileTrackerEffects = overlayStep.tileTrackerEffects;

        tileWorld?.update(this.cameras.main.worldView);
        if (tileWorld) {
          const tileMetrics = tileWorld.diagnostics;
          parent.dataset.tileChunks = String(tileMetrics.chunks);
          parent.dataset.tileTextures = String(tileMetrics.textures);
          if (!initialTilesReady) boot.noteTiles(tileMetrics);
          if (!engineFailed && !initialTilesReady && tileMetrics.ready) {
            initialTilesReady = true;
            startOptionalSceneArt?.(); startOptionalSceneArt = null;
            boot.settle();
            parent.dataset.bootStage = "ready";
            setReady(true);
            portalState.zoneTransition = markStudioZoneTransitionReady(portalState.zoneTransition, time);
            focusWorldOnReady();
          }
        }
        updateStudioPhaserAmbienceAndLighting({
          scene: this,
          bridge,
          time,
          deltaMs,
          currentPoint,
          speed,
          reducedMotion: reducedMotion.matches,
          qualityProfile: currentQualityProfile,
          effectLevel: experienceRef.current.effectLevel,
          environment: environmentRef.current,
          presentationMode: decorationsRef.current.presentationMode,
          hasCampusRuntime: Boolean(campusRuntime),
          livingWorld,
          ambienceRender,
          lightRender,
        });

        const traveled = portalState.lastPosition ? Math.hypot(currentPoint.x - portalState.lastPosition.x, currentPoint.y - portalState.lastPosition.y) : 0;
        if (traveled > 0.015) lastMovedAt = time;
        const nextMoving = !blocked && speed > 5 && time - lastMovedAt < locomotion.movingHoldMs;
        portalState.lastPosition = currentPoint;
        if (speed > 10) localPresentation.facing = studioStableFacing(portalState.motion.velocity, localPresentation.facing);

        const localResult = updateStudioPhaserLocalPresentation({
          state: localPresentation,
          scene: this,
          manifest,
          navigationWorld,
          peers,
          bridge,
          snapshotSelf: snapshotRef.current.self,
          selfIdentity: identityRef.current,
          selfDisplayName: displayNameRef.current,
          selfChatBubbleText,
          selfCustomSheetSkin,
          localSprite,
          localShadow,
          localLabel,
          localPose,
          currentPoint,
          velocity: portalState.motion.velocity,
          inputX: ix,
          inputY: iy,
          speed,
          feelSpeed,
          sprint,
          sprintSpeed,
          maxSpeed: config.maxSpeed,
          feelConfig,
          moving,
          nextMoving,
          directInput,
          blocked,
          ghostActive,
          snapCamera,
          time,
          deltaMs,
          dt,
          reducedMotion: reducedMotion.matches,
          crossfadeEnabled,
          activity,
          zoneId: zone.zoneId,
          terrain,
          campusFloorMap,
          artStyle,
          spaceTheme,
          actorVisualScale,
          playerLocomotion,
          worldFeel,
          motionFrame,
          motionFeel,
          experience: experienceRef.current,
          environment: environmentRef.current,
          qualityProfile: currentQualityProfile,
          selfPose: poseRef.current.selfPose,
          waveActorIds: poseRef.current.waveActorIds,
          seatedActors: poseRef.current.seatedActors,
          viewport,
          cameraBaseZoom,
          cameraFollows,
          cameraGround,
          cameraBase,
          cameraTarget,
          cameraPan,
          userZoom,
          horizonArtwork,
          screenFixedHorizon,
          applyCameraMode,
          applyAvatarVisual,
          translate: btRef.current,
          emotes,
          speech,
          livingWorld,
          spriteCrossfades,
          actorAura,
          decorationRuntime,
          interactionFx,
        });
        const {
          rendered,
          localSeat,
          localGaitStride,
          activeDayPhase,
          shownLocalEmote,
          conversationFocus,
          overlayScale,
          pose: currentPose,
          duplicateNames,
          nameplateCandidates,
          nameplateBases,
        } = localResult;

        updateStudioVirtualSpacePeersFrame({
          scene: this,
          manifest,
          peers,
          peerVisibilityFades,
          peerInterest,
          currentPoint,
          time,
          reducedMotion: reducedMotion.matches,
          crossfadeEnabled,
          experience: experienceRef.current,
          artStyle,
          spaceTheme,
          activeDayPhase,
          actorVisualScale,
          overlayScale,
          playerLocomotion,
          locomotion,
          seatedActors: poseRef.current.seatedActors,
          waveActorIds: poseRef.current.waveActorIds,
          bridge,
          duplicateNames,
          translate: btRef.current,
          emotes,
          speech,
          spriteCrossfades,
          actorAura,
          decorationRuntime,
          interactionFx,
          applyAvatarVisual,
          destroyPeerVisual,
          nameplateCandidates,
          nameplateBases,
        });

        const npcResult = updateStudioVirtualSpaceNpcsAndPromptsFrame({
          scene: this,
          manifest,
          parent,
          npcs,
          peers,
          npcDirector,
          npcDisplayPoints,
          npcVisibilityFades,
          npcNoticedAt,
          chatter,
          pendingEmoteReactions,
          eventFeed,
          time,
          dt,
          currentPoint,
          velocity: portalState.motion.velocity,
          speed,
          blocked,
          worldReadyForHud,
          reducedMotion: reducedMotion.matches,
          crossfadeEnabled,
          atmosphere: atmosphereRef.current,
          activity,
          activeDayPhase,
          environment: environmentRef.current,
          experience: experienceRef.current,
          artStyle,
          spaceTheme,
          actorVisualScale,
          overlayScale,
          interestRadius: currentQualityProfile.interestRadius,
          maxActiveNpcs,
          selfIdentity: identityRef.current,
          tourRequest: guideTourRef.current,
          lastGuideRequestId,
          lastGuideState,
          nearbyNpcKey,
          lastPromptNpcId,
          conversationFocus,
          promptInteraction,
          nearbyNpc,
          npcInteraction,
          portals,
          emotes,
          speech,
          promptRuntime,
          spriteCrossfades,
          interactionFx,
          fxWiring,
          applySpriteVisual,
          translate: btRef.current,
          onNearbyNpcsChange: callbacksRef.current.onNearbyNpcsChange,
          onGuideTourChange: callbacksRef.current.onGuideTourChange,
          nameplateCandidates,
          nameplateBases,
        });
        lastGuideRequestId = npcResult.lastGuideRequestId;
        lastGuideState = npcResult.lastGuideState;
        nearbyNpcKey = npcResult.nearbyNpcKey;
        lastPromptNpcId = npcResult.lastPromptNpcId;
        chatterBubbles = npcResult.chatterBubbles;
        const visibleNpcCount = npcResult.visibleNpcCount;

        lastSkyTintPhase = updateStudioPhaserCampusFrame({
          campusRuntime,
          campusFrame,
          horizonArtwork,
          lastSkyTintPhase,
          time,
          reducedMotion: reducedMotion.matches,
          currentPoint,
          dayPhasePreference: environmentRef.current.dayPhase,
          qualityProfile: currentQualityProfile,
        });

        const nameplateLayout = layoutStudioVirtualNameplates(nameplateCandidates);
        for (const [id, base] of nameplateBases) {
          const offset = nameplateLayout.get(id) ?? { x: 0, y: 0 };
          base.label.setPosition(base.x + offset.x, base.y + offset.y);
          syncStatusDot(id, base.label, base.status);
        }
        for (const [id, dot] of statusDots) if (!nameplateBases.has(id)) dot.setVisible(false);

        if (metricsCallbackRef.current && time - lastMetricsAt >= 1_000) {
          lastMetricsAt = time;
          metricsCallbackRef.current(sanitizeStudioVirtualRuntimeMetrics({
            fps: qualitySample.fps,
            frameTimeMs: qualitySample.frameTimeMs,
            qualityTier: currentQualityProfile.tier,
            peerCount: peers.size,
            visiblePeerCount: peerInterest.activeIds.size,
            npcCount: npcs.size,
            visibleNpcCount,
            routeWaypoints: portalState.path.length,
            failedTextures: failedTextures.size,
            updatedAt: Date.now(),
          }));
        }

        const changed = !portalState.lastPublishedPoint || Math.hypot(localBody.x - portalState.lastPublishedPoint.x, localBody.y - portalState.lastPublishedPoint.y) > 0.02
          || nextMoving !== lastPublishedMoving || localPresentation.facing !== lastPublishedFacing || currentPose !== lastPublishedPose;
        const shouldPublish = changed && (time - lastPublishAt >= 80 || nextMoving !== lastPublishedMoving || Boolean(portal) || Boolean(teleportTarget));
        if (shouldPublish) {
          const point = { x: localBodyPhysics.center.x, y: localBodyPhysics.center.y };
          callbacksRef.current.onLocalState({
            point,
            facing: localPresentation.facing,
            moving: nextMoving,
            zoneId: studioWorldRoomAt(manifest, point),
            pose: currentPose,
          });
          portalState.lastPublishedPoint = point;
          lastPublishAt = time;
          lastPublishedMoving = nextMoving;
          lastPublishedFacing = localPresentation.facing;
          lastPublishedPose = currentPose;
        }
        if (import.meta.env.DEV) {
          const trace = (globalThis as { __studioMotionTrace?: Array<Record<string, number | string>> }).__studioMotionTrace;
          if (trace) {
            trace.push({
              t: time, x: currentPoint.x, y: currentPoint.y, vx: portalState.motion.velocity.x, vy: portalState.motion.velocity.y,
              sx: localSprite.x, sy: localSprite.y, scaleX: localSprite.scaleX, scaleY: localSprite.scaleY, angle: localSprite.angle,
              frame: String(localSprite.frame.name), texture: localSprite.texture.key, moving: nextMoving ? 1 : 0,
              dist: localPresentation.localDistance, stride: localGaitStride, camX: this.cameras.main.scrollX, camY: this.cameras.main.scrollY,
            });
            if (trace.length > 2400) trace.splice(0, trace.length - 2400);
          }
        }
        if (import.meta.env.DEV && time - lastDiagnosticAt >= 250) {
          lastDiagnosticAt = time; Object.assign(parent.dataset, textureLod?.diagnostics() ?? { textureLod: "off", textureLodFailures: "[]" });
          syncStudioCanvasDevDiagnostics({
            parent, currentPoint, rendered, camera: this.cameras.main, localSprite, localSeat,
            pathLength: portalState.path.length, textureKeys: this.textures.getTextureKeys(), localDistance: localPresentation.localDistance, walkSpeed: playerLocomotion.walkSpeed,
            gaitDistancePerCycle: playerLocomotion.gaitDistancePerCycle, pixelRatio: viewport.ratio,
            textResolution: textResolution?.current ?? 1,
            textureLodDiagnostics: textureLod?.diagnostics() ?? { textureLod: "off", textureLodFailures: "[]" },
            nextMoving, facing: localPresentation.facing, terrainKind: terrain.kind, pathAllowed: studioWorldCanOccupy(navigationWorld, currentPoint),
            dayPhase: activeDayPhase, weather: environmentRef.current.weather, backdrop: environmentRef.current.backdrop,
            hasLivingWorld: Boolean(livingWorld), hasObjectPhysics: Boolean(objectRuntime),
            decorationCount: decorationsRef.current.placements.length,
            environmentInteractionsCount: studioTownEnvironmentInteractions().length,
            interestKey: peerInterest.key, activePeerVisualsCount: peerInterest.activeIds.size, visibleNpcCount,
            maxParticles: Math.round(runtimeBudget.maxParticles * currentQualityProfile.particleRatio),
            qualityTier: currentQualityProfile.tier, controlMode: experienceRef.current.controlMode,
            moveFeel: locomotion.feel, localGaitStride, cameraPreference: experienceRef.current.cameraMode,
            shownLocalEmote, chatterBubbles, emoteSequence: emotes?.sequence("self") ?? 0, time,
            emoteDebug: emotes?.debug("self") ?? "", peers: [...peers],
            activePeerEmote: (id) => emotes?.activeId(`peer:${id}`, time) ?? "", npcs: [...npcs], manifest,
          });
        }
        // fx 프레임 끝: 상태 가구 진행·발동 연출·풀 정리를 배우 변환이 모두 정해진 뒤에 돌린다.
        interactionFx?.endFrame(currentPoint, nextMoving);
        // 크로스페이드 진행: 모든 배우의 최종 변환이 정해진 뒤 이전 그림을 겹쳐 바랜다.
        spriteCrossfades?.step(time);
        moving = nextMoving;
      };

      // 렌더러 판정: Phaser.AUTO는 소프트웨어 WebGL(SwiftShader 등)도 WebGL로 골라
      // GPU 없는 환경에서 가장 느린 경로가 기본이 된다. 실제 컨텍스트를 프로브해
      // 하드웨어 WebGL만 WebGL로, 나머지는 Canvas를 최후 폴백으로 쓴다.
      // (판정 근거는 studio-virtual-space-renderer.ts 참조)
      const rendererDecision = studioVirtualRendererDecision(renderer, probeStudioVirtualWebGL());
      const rendererType = rendererDecision.kind === "webgl" ? Phaser.WEBGL : Phaser.CANVAS;
      const powerPreference = studioVirtualRendererPowerPreference(
        rendererDecision.kind,
        currentQualityProfile.tier,
      );
      parent.dataset.rendererKind = rendererDecision.kind;
      parent.dataset.rendererReason = rendererDecision.reason;
      if (rendererDecision.probe.rendererName) {
        parent.dataset.webglRenderer = rendererDecision.probe.rendererName;
      }
      game = new Phaser.Game({
        type: rendererType,
        ...(powerPreference ? { render: { powerPreference } } : {}),
        parent: mount,
        loader: { timeout: 180_000, maxParallelDownloads: 6 },
        // Phaser는 시작과 탭 복귀 직후 120프레임(기본 panicMax) 동안 프레임 간격을 16.7ms로 잘라 물리를 한 프레임에 한 걸음만
        // 돌린다. 60fps에서는 티가 안 나지만 그보다 느린 기기에서는 그동안 아바타가 실제보다 느리게 걷는다(14fps에서 처음 약 8초는
        // 속도의 4분의 1, 30fps면 4초 동안 절반). 10프레임으로 줄여 첫 걸음부터 실제 시간을 따라가게 한다.
        fps: { panicMax: 10 },
        transparent: false,
        backgroundColor: spaceThemeDef ? studioColorHex(spaceThemeDef.backgroundColor) : "#17181b",
        antialias: !artProfile.pixelated,
        roundPixels: artProfile.pixelated,
        pixelArt: artProfile.pixelated,
        scale: {
          mode: Phaser.Scale.NONE,
          width: viewport.width,
          height: viewport.height,
          zoom: 1 / viewport.ratio,
        },
        physics: {
          default: "arcade",
          arcade: {
            debug: false,
            gravity: { x: 0, y: 0 },
            fps: 60,
            fixedStep: true,
          },
        },
        scene,
      });
      if (parent.dataset.bootStage === "preparing-scene") parent.dataset.bootStage = "booting-game";
      const resize = () => {
        if (cancelled || !mount.isConnected) return;
        const rect = parent.getBoundingClientRect();
        const next = studioRenderViewport(
          rect.width,
          rect.height,
          Math.min(globalThis.devicePixelRatio || 1, currentQualityProfile.dprCap),
        );
        mount.style.width = `${next.cssWidth}px`; mount.style.height = `${next.cssHeight}px`;
        if (game?.isBooted && (next.width !== viewport.width || next.height !== viewport.height || next.ratio !== viewport.ratio)) {
          viewport = next;
          game.scale.setZoom(1 / next.ratio);
          game.scale.resize(next.width, next.height);
          textureLod?.invalidate();
        }
      };
      resizeRuntime = resize;
      const observer = new ResizeObserver(resize);
      observer.observe(parent);
      globalThis.addEventListener("resize", resize);
      cleanup.push(() => { observer.disconnect(); globalThis.removeEventListener("resize", resize); });
    })().catch(fail);

    return () => {
      cancelled = true;
      sceneReady = false;
      cleanup.forEach((dispose) => dispose());
      bridge.clearMovement();
      runtimeRef.current = null;
      callbacksRef.current.onNearbyInteractionChange?.(null);
      game?.destroy(true);
      mount.remove();
    };
  }, [artStyle, spaceTheme, attempt, bridge, debugWorld, environmentPreference.backdrop, manifest, renderer, worldAssetUrls]);

  return (
    <div
      ref={hostRef}
      className="studio-vspace-phaser-canvas absolute inset-0 z-[2]"
      data-studio-phaser-runtime="true"
      data-studio-engine-status={failure ? "error" : ready ? "ready" : "loading"}
      data-world-id={manifest.id}
      data-world-kind={studioVirtualWorldKind(manifest)}
      data-art-style={artStyle}
      data-backdrop={environmentPreference.backdrop}
    >
      <StudioVirtualSpaceEngineMessage failure={failure} ready={ready} loadProgress={loadProgress} slowLoad={slowLoad} onRetry={() => setAttempt((value) => value + 1)} />
    </div>
  );
}
