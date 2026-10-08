import { studioVisibleBootDeadline } from "./experience/studio-visible-boot-deadline";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  StudioFixedStepClock, StudioFixedStepPose,
  studioStableFacing, studioRenderViewport, studioCameraLerp, studioCoverRect,
} from "./studio-virtual-space-presentation";
import {
  StudioNpcDirector, studioNpcActivityLabel, studioNpcInteraction, studioNpcLabel, studioNpcRole,
} from "./studio-virtual-space-npc-director";
import { steerStudioWorldCruise } from "./studio-virtual-space-path-steering";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  EMPTY_STUDIO_WORLD_APPROACH,
  EMPTY_STUDIO_WORLD_WALK_OVER,
  StudioWorldPortalTracker,
  StudioWorldZoneTracker,
  resolveStudioWorldPortalArrival,
  resolveStudioWorldUnstuck,
  resolveStudioWorldZonePresence,
  stepStudioWorldInteractionApproach,
  stepStudioWorldWalkOver,
  studioWorldFloorFocusTarget,
  studioWorldHasModalBlocker,
  studioWorldInputBlocked,
  studioWorldPresenceZone,
  studioWorldPromptInteractGate,
  type StudioWorldApproachState,
  type StudioWorldPortalArrival,
  type StudioWorldWalkOverState,
} from "./studio-virtual-space-runtime-policy";
import { resolveStudioFollowStandOffPx } from "./studio-virtual-space-follow";

import { readStudioVirtualSpaceGamepadsInput } from "./studio-virtual-space-gamepad";
import {
  STUDIO_VIRTUAL_SPACE_WALK_SPEED,
} from "./studio-virtual-space-navigation";
import {
  DEFAULT_STUDIO_MOTION_CONFIG,
} from "./studio-virtual-space-motion";
import { DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG } from "./studio-virtual-space-physics";
import {
  createStudioFacingTurnState,
  facingAngleFromVelocity,
  locomotionDirectionalSquashStretch,
  shortestAngleDelta,
  stepTurnAngleSmooth,
  turnSlowdownFactor,
} from "./studio-virtual-space-locomotion-feel";
import { StudioMotionEaser } from "./studio-virtual-space-motion-easing";
import { scaleAroundOne, stepCrispVelocity, studioCadenceLimitedStride } from "./studio-virtual-space-locomotion-style";
import {
  advanceBreathPhase,
  advanceWalkPhase,
  applyCameraDeadzone,
  breathOffset,
  dampPeerOffset,
  nextLocomotionMode,
  STUDIO_CAMERA_DEADZONE_RADIUS,
  turnLeanAngle,
  type StudioLocomotionMode,
} from "./studio-virtual-space-locomotion-transitions";
import {
  studioDayNightTimeOfDay,
} from "./studio-virtual-space-day-night-cycle";
import {
  studioBuildingLifeAmbienceAt,
  studioBuildingSkyTint,
} from "./studio-virtual-space-building-life";
import {
  createStudioGhostModeApplier,
  studioGhostCollisionOverrides,
  studioGhostSeekInput,
  STUDIO_GHOST_SPRITE_ALPHA,
  STUDIO_GHOST_TOGGLE_KEY,
} from "./studio-virtual-space-ghost-mode";
import { buildStudioLocateGuide } from "./studio-virtual-space-locate-guide";
import {
  buildStudioMotionRequest,
  neutralStudioMotionRequest,
  type StudioMotionRequest,
} from "./studio-virtual-space-motion-api";
import { studioPoseSeatAnchors, type StudioSpacePose } from "./studio-virtual-space-pose-controller";
import {
  createMotionStateMachine,
  motionOneShotFinished,
  requestMotionState,
  sampleMotionRender,
  type StudioMotionKind,
  type StudioMotionState,
} from "./studio-virtual-space-character-motion";
import {
  customSpriteSheetSkin,
  getActiveSpriteSheetConfig,
  onSpriteSheetConfigChanged,
} from "./studio-virtual-space-sprite-sheet";
import {
  resolveStudioCharacterAppearance,
  studioCharacterSkinForArtStyle,
  studioCharacterWalkClip,
} from "./studio-virtual-space-character-skins";
import { studioProceduralNpcSkinByKey } from "./studio-virtual-space-npc-cast";
import {
  DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  studioVirtualArtObjectUrl,
  studioVirtualArtStyle,
  studioVirtualLivingTownAssetUrl,
} from "./studio-virtual-space-art-style";
import { StudioTextResolutionRuntime } from "./studio-virtual-space-text-resolution";
import { studioSpaceTheme } from "./studio-virtual-space-theme";
import { drawStudioModularCampus } from "./studio-virtual-space-modular-campus";
import { studioIllustratedPropFrame, studioRenderedTileWorld } from "./studio-virtual-space-scene-direction";
import { studioExperienceFrameGeometry } from "./studio-virtual-space-experience-art";
import { registerStudioSceneAtlas,
  StudioVirtualSetDressingRuntime, studioSceneActorScale, studioSceneOverlayScale } from "./studio-virtual-space-scene-art-runtime";
import { studioVirtualWorldSetDressing } from "./studio-virtual-space-world-set-dressing";
import { studioVirtualWorldKind } from "./studio-virtual-space-world-presentation";
import { applyStudioWorldCamera, fitStudioHorizonArtwork, studioCameraEdgeLerpFactor } from "./studio-virtual-space-world-camera";
import {
  STUDIO_ZONE_FADE_COLOR,
  beginStudioZoneDepartureTransition,
  beginStudioZonePortalTransition,
  beginStudioZoneSpawnTransition,
  createStudioZoneTransitionState,
  drawStudioZoneSeparationVeil,
  drawStudioZoneTransitionOverlay,
  markStudioZoneTransitionReady,
  revealStudioZoneTransition,
  stepStudioZoneTransition,
  type StudioZoneTransitionState,
} from "./studio-virtual-space-zone-transition";
import { StudioCampusRuntime, createStudioCampusRuntimeFrame, type StudioCampusRuntimeFrame } from "./studio-virtual-space-campus-runtime";
import { studioVirtualCampusScene } from "./studio-virtual-space-campus-world";
import {
  StudioWorldPromptRuntime, studioPortalPromptCandidate, studioWorldMarkerVisible, studioWorldPromptTarget, type StudioWorldPromptCandidate,
} from "./studio-virtual-space-world-prompt";
import { studioProjectTownPoint, studioTownDepthForPoint } from "./studio-virtual-space-semantic-world";
import {
  StudioLivingWorldRuntime,
  queueStudioLivingWorldTextures,
  studioVirtualDayPhase,
  studioVirtualTerrainAt,
} from "./studio-virtual-space-living-world";
import {
  queueStudioAmbienceTextures,
  studioAmbienceCondition,
  StudioVirtualAmbienceRenderRuntime,
} from "./studio-virtual-space-ambience-render";
import { studioDayNightModulationAt } from "./studio-virtual-space-day-night-lighting";
import {
  queueStudioLightTextures,
  studioLightRenderRealTimeOfDay,
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
import { StudioCameraFollowModeController, studioAwayDozeMotion, studioBlinkScaleY, studioEffectiveGaitStride, studioGaitBodyOffset, studioGaitRockAngle, studioGaitShadowScale, studioGaitSquashScale, studioIdleSwayOffsetX, studioPlayerLocomotionProfile } from "./studio-virtual-space-locomotion-presentation";
import {
  DEFAULT_STUDIO_VIRTUAL_EXPERIENCE,
} from "./studio-virtual-space-experience-preference";
import {
  DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT,
} from "./studio-virtual-space-environment-preference";
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
import {
  sanitizeStudioVirtualRuntimeMetrics,
} from "./studio-virtual-space-observability";
import {
  layoutStudioVirtualNameplates,
  studioVirtualNameplatePresentation,
  type StudioVirtualNameplateStatus,
} from "./studio-virtual-space-nameplate-layout";
import {
  studioTownEnvironmentInteractions,
} from "./studio-virtual-space-town-layout";
import {
  StudioCharacterAssetResidency,
  studioCharacterPoseTextureKey,
  studioCharacterStaticAsset,
  studioCharacterWalkAnimationKey as walkAnimationKey,
} from "./studio-virtual-space-character-assets";
import type {
  StudioVirtualSpaceFacing,
  StudioVirtualSpacePeer,
  StudioVirtualSpacePoint,
} from "./studio-virtual-space-model";
import { STUDIO_PRESENCE_BUBBLE_TTL_MS, type StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";
import {
  StudioStuckDetector,
  StudioZoneChangeTracker,
  studioNearbyNpcCandidates,
  studioNearbyNpcIdsKey,
  type StudioSpaceUiEvent,
  type StudioVirtualSpaceEngineStatus,
  type StudioVirtualSpaceNearbyNpc,
} from "./studio-virtual-space-engine-events";
import { StudioWorldEventFeed, StudioWorldFeelController } from "./studio-virtual-space-world-feel";
import {
  StudioMotionFeelRuntime, createStudioMotionFeelFrame, studioCampusFloorSurface, studioMotionFeelTerrainSurface,
} from "./studio-virtual-space-motion-feel-runtime";
import { StudioSpriteCrossfadeRuntime } from "./studio-virtual-space-sprite-crossfade-runtime";
import {
  STUDIO_ACTOR_VISIBILITY_MAX_FADE_OUTS,
  dampStudioDisplayPoint, studioActorVisibilityFadeAlpha, studioActorVisibilityFadeRendering, studioBreathPhaseAt,
  studioDisplayDampTauSeconds, studioPeerPresenceFade, studioSmoothingPhaseSeed, transitionStudioActorVisibilityFade,
  type StudioActorVisibilityFadeState,
  type StudioDisplayPoint,
} from "./studio-virtual-space-sprite-smoothing";
import { StudioCollisionResponder, studioCollisionContact } from "./studio-virtual-space-collision-response";
import { applyStudioPeerImpact, createStudioPeerVisual, destroyStudioPeerVisual } from "./studio-virtual-space-peer-visual";
import { peerImpactOffsetAt } from "./studio-virtual-space-peer-motion";
import { StudioFrameRegistry } from "./studio-virtual-space-frame-registration";
import { StudioInteractionFxRuntime } from "./studio-virtual-space-interaction-fx";
import {
  createStudioInteractionFxLiveWiring, type StudioInteractionFxLiveWiring,
} from "./studio-virtual-space-interaction-fx-live";
import {
  createStudioBuildPlacementCanvasController,
  type StudioBuildPlacementCanvasController,
} from "./studio-virtual-space-build-placement-canvas";
import { createStudioOptionalSceneArtLoader } from "./studio-virtual-space-optional-scene-art";
import { createStudioNpcVisuals } from "./studio-virtual-space-npc-visuals";
import { createStudioLocalVisual } from "./studio-virtual-space-local-visual";
import { studioPresenceEmoteBob, studioPresenceEmoteIndicator, studioPresenceEmoteParticleColor, studioPresenceEmoteReaction } from "./studio-virtual-space-presence-emote";
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import {
  StudioEmoteRuntime, StudioSpeechBubbleRuntime, studioCanvasBubbleColors, studioCanvasNameplateColors, studioColorHex,
} from "./studio-virtual-space-emote-runtime";
import { StudioNpcChatterScheduler, type StudioNpcChatterActor, type StudioNpcSpeechBubble } from "./studio-virtual-space-npc-chatter";
import {
  studioWorldCollisionRects,
  studioWorldInteractions,
  studioWorldPropDepth,
  studioWorldPortals,
  studioWorldRoomAt,
  studioWorldSpawn,
  type StudioWorldInteractionDefinition,
  type StudioWorldPortalDefinition,
} from "./studio-virtual-space-world-manifest";
import {
  findStudioWorldPath,
  resolveStudioWorldSpawn,
  studioWorldCanOccupy,
  STUDIO_WORLD_PLAYER_RADIUS,
} from "./studio-virtual-space-world-pathfinding";
import { createStudioInteractionMarkers, createStudioPortalGateways, drawStudioLocateOverlay, drawStudioPrivateZoneOverlay, drawStudioRouteOverlay, drawStudioWorldDebugOverlay, createStudioRouteOverlayMemory } from "./studio-virtual-space-world-overlays";

import {
  activityState,
  nearestInteraction,
  propTextureKey,
  studioEmoteFacing,
  studioFacingToward,
  studioWorldMayTakeFocus,
  EMPTY_DECORATIONS,
  NPC_LOOK_DISTANCE,
  NPC_NOTICE_COOLDOWN_MS,
  STUDIO_EMOTE_DEDUPE_MS,
  WORLD_KEY_CODES,
  type InputEventLike,
  type NpcVisual,
  type OcclusionVisual,
  type PeerVisual,
  type StudioVirtualSpacePhaserCanvasProps,
} from "./studio-virtual-space-phaser-canvas-model";
import { createStudioSpriteVisualApplier } from "./studio-virtual-space-sprite-visual";
import { createStudioNameplateRenderer } from "./studio-virtual-space-nameplate-renderer";
import { createStudioCharacterTexturePreparer } from "./studio-virtual-space-character-texture-preparer";
import { studioCharacterBootAssets, studioSceneArtKeys } from "./studio-virtual-space-boot-assets";

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
    const cancelBootDeadline = studioVisibleBootDeadline(document, () => fail(new Error(`boot-timeout:${parent.dataset.bootStage}`)));
    cleanup.push(() => cancelBootDeadline());
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
      const characterAssets = new StudioCharacterAssetResidency({
        has: prepareCharacterTexture,
        load: (asset, complete) => {
          const loaderType = asset.atlas?.slicing ? "image" : asset.type;
          const event = `filecomplete-${loaderType}-${asset.key}`;
          const loaded = () => complete(prepareCharacterTexture(asset));
          const failed = (file: import("phaser").Loader.File) => {
            if (file.key === asset.key) complete(false);
          };
          scene.load.once(event, loaded);
          scene.load.on("loaderror", failed);
          queueCharacterTexture(asset);
          scene.load.start();
          return () => { scene.load.off(event, loaded); scene.load.off("loaderror", failed); };
        },
        remove: (asset) => {
          for (const key of asset.animationKeys ?? (asset.animationKey ? [asset.animationKey] : [])) {
            if (scene.anims.exists(key)) scene.anims.remove(key);
          }
          if (scene.textures.exists(asset.key)) scene.textures.remove(asset.key);
          frameRegistry.forget(asset.key);
        },
      });
      cleanup.push(() => characterAssets.close());
      const interactionById = new Map(interactions.map((interaction) => [interaction.id, interaction] as const));

      let applyCameraMode: (deadzoneScale?: number) => void = () => undefined;
      let focusWorldOnReady: () => void = () => undefined;
      let localPose = new StudioFixedStepPose(snapshotRef.current.self);
      const fixedStepClock = new StudioFixedStepClock();
      const cameraTarget = { x: snapshotRef.current.self.x, y: snapshotRef.current.self.y };
      let localDistance = 0;
      let previousRendered: StudioVirtualSpacePoint | null = null;
      let localBody: import("phaser").GameObjects.Zone | null = null;
      let localBodyPhysics: import("phaser").Physics.Arcade.Body | null = null;
      let localSprite: import("phaser").GameObjects.Sprite | null = null;
      let localShadow: import("phaser").GameObjects.Ellipse | null = null;
      let localLabel: import("phaser").GameObjects.Text | null = null;
      /** 로컬 캐릭터 모션 상태머신 (트랙1 소유: 블렌딩·렌더링. 전이 시점은 트랙3). */
      let localMotion: StudioMotionState = createMotionStateMachine("idle", 0);
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
      let path: readonly StudioVirtualSpacePoint[] = [];
      let approachState: StudioWorldApproachState = EMPTY_STUDIO_WORLD_APPROACH;
      let queuedInteraction: StudioWorldInteractionDefinition | null = null;
      let walkOverState: StudioWorldWalkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
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
      let zoneTransition: StudioZoneTransitionState = createStudioZoneTransitionState();
      let pendingPortalArrival: StudioWorldPortalArrival | null = null;
      let pendingBridgeTeleport: StudioVirtualSpacePoint | null = null;
      let pendingDeparturePortal: StudioWorldPortalDefinition | null = null;
      let arrivalRingPoint: StudioVirtualSpacePoint | null = null;
      /** 고스트 모드에서 비활성화하는 물리 충돌기들. */
      const ghostColliders: import("phaser").Physics.Arcade.Collider[] = [];
      /** T8: 따라가기 벽 통과가 현재 물리 충돌기에 적용돼 있는지. */
      let followWallPassApplied = false;
      /** 이동 느낌 상태 (트랙3 locomotion-feel 연결). */
      let walkPhase = 0;
      let breathPhase = 0;
      let locomotionMode: StudioLocomotionMode = "idle";
      let turnState = createStudioFacingTurnState(0);
      /** 클릭 이동 목적지 마커 펄스 시작 시각. */
      let markerStartedAt = 0;
      const routeOverlayMemory = createStudioRouteOverlayMemory();
      /** 트랙1 모션 렌더러 연결 지점: 매 프레임 조립되는 모션 요청. */
      // 트랙1 모션 렌더러 핸드오프용: 매 프레임 최신 요청을 보관한다 (트랙1 API 연결 시 소비).
      let _lastMotionRequest: StudioMotionRequest = neutralStudioMotionRequest();
      let lastPublishedPose: StudioSpacePose = "stand";
      let motion = { velocity: { x: 0, y: 0 } };
      const motionEaser = new StudioMotionEaser();
      let facing: StudioVirtualSpaceFacing = snapshotRef.current.self.facing;
      let moving = false;
      let lastPublishAt = -Infinity;
      let lastDiagnosticAt = -Infinity;
      let lastAssetCollectionAt = -Infinity;
      let lastPublishedFacing = facing;
      let lastPublishedMoving = moving;
      let gamepadInteractHeld = false;
      const heldKeys = new Set<string>();
      let keyboardInteractQueued = false;
      let wasInputBlocked = false;
      let modalInputBlocked = studioWorldHasModalBlocker(document);
      let lastStopRevision = bridge.getStopRevision();
      let lastPosition: StudioVirtualSpacePoint | null = null;
      let lastMovedAt = -Infinity;
      let lastPublishedPoint: StudioVirtualSpacePoint | null = null;
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
      let lastWalkablePoint: StudioVirtualSpacePoint = { x: snapshotRef.current.self.x, y: snapshotRef.current.self.y };
      const staticColliderObjects: import("phaser").GameObjects.GameObject[] = [];
      let lastFootstepDistance = 0;
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
      // 스프라이트 스무딩: 상태 전환 크로스페이드 런타임 + 배우별 표시 감쇠 좌표 캐시.
      let spriteCrossfades: StudioSpriteCrossfadeRuntime | null = null;
      let localDisplayPoint: StudioDisplayPoint | null = null;
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
      /** 장면의 모든 Phaser Text를 화면 배율에 맞는 해상도로 그린다. 픽셀 아트 화풍에서는 거친 글자를 유지한다. */
      let textResolution: StudioTextResolutionRuntime | null = null;
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
        path = findStudioWorldPath(
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

      const syncPeer = (peer: StudioVirtualSpacePeer, nearby: boolean) => {
        const id = peer.participant.sessionId;
        let visual = peers.get(id);
        const state = activityState(peer.state.moving, nearby, peer.state.activity);
        const skin = studioCharacterSkinForArtStyle(resolveStudioCharacterAppearance(peer.state, id).skin, artStyle);
        const requestedPeerAsset = studioCharacterStaticAsset(skin, peer.state.facing, state);
        const peerInitialAsset = hasStaticAsset(requestedPeerAsset) ? requestedPeerAsset : fallbackAsset;
        if (!visual) {
          visual = createStudioPeerVisual({
            scene,
            peer,
            asset: peerInitialAsset,
            actorVisualScale,
            gaitDistancePerCycle: playerLocomotion.gaitDistancePerCycle,
            nameplateStyle,
            nearby,
            inputBlocked: runtimeInputBlocked,
            onTapPeer: (peerId, point) => {
              queuedWalkOver = { id: peerId, point };
              bridge.setFollowingPeer(peerId);
            },
            now: frameTime,
          });
          peers.set(id, visual);
        }
        if (visual.leavingAt !== null) visual.leavingAt = null;
        visual.timeline.push({
          x: peer.state.x,
          y: peer.state.y,
          at: peer.lastSeen,
          sequence: peer.sequence,
          moving: peer.state.moving,
          facing: peer.state.facing,
        });
        visual.displayName = peer.participant.displayName;
        visual.targetX = peer.state.x;
        visual.targetY = peer.state.y;
        visual.avatarIndex = peer.state.avatarIndex;
        visual.appearance = peer.state.appearance;
        visual.facing = peer.state.facing;
        visual.moving = peer.state.moving;
        visual.activity = peer.state.activity;
        visual.nearby = nearby;
        visual.userStatus = peer.state.userStatus;
        visual.bubble = peer.state.bubble ?? null;
        // typing은 presence state에 없고, syncSnapshot이 W-1 peerTyping 목록으로 채운다.
        // main 프레즌스 지속 이모트: 바뀌는 순간 같은 뜻의 리액션 말풍선과 머리 위 파티클을 한 번 재생한다.
        const presenceEmote = peer.state.emote ?? null;
        if (presenceEmote !== visual.presenceEmote) {
          visual.presenceEmote = presenceEmote;
          const reaction = studioPresenceEmoteReaction(presenceEmote);
          if (reaction) emotes?.play(`peer:${id}`, reaction, frameTime);
          const color = studioPresenceEmoteParticleColor(presenceEmote);
          if (color !== null && !reducedMotion.matches) {
            motionFeel?.burst(visual.sprite.x, visual.sprite.y - visual.sprite.displayHeight * visual.sprite.originY - 6,
              visual.sprite.depth + 2, 6, color);
          }
        }
        spriteCrossfades?.capture(visual.sprite);
        applyAvatarVisual(visual.sprite, visual, visual.facing, state, id);
        spriteCrossfades?.commit(visual.sprite, frameTime,
          !reducedMotion.matches && experienceRef.current.effectLevel !== "low");
        visual.label.setText(peer.participant.displayName);
        // 몸 알파는 렌더 루프가 매 프레임 정한다 (자리 비움 0.62 × 입·퇴장 페이드).
      };

      const syncSnapshot = (next: StudioVirtualSpaceSnapshot) => {
        if (!sceneReady || cancelled) return;
        const nearby = new Set(next.nearbyPeers.map((peer) => peer.participant.sessionId));
        const present = new Set<string>();
        const reactionsBySession = new Map(next.peerReactions.map((item) => [item.sessionId, item] as const));
        const impactsBySession = new Map(next.peerImpacts.map((item) => [item.sessionId, item] as const));
        const chatBubblesBySession = new Map(next.chatBubbles.map((item) => [item.sessionId, item.text] as const));
        const typingSessions = new Set(next.peerTyping.map((item) => item.sessionId));
        selfChatBubbleText = next.selfChatBubble?.text ?? null;
        const now = Date.now();
        for (const peer of next.peers) {
          const id = peer.participant.sessionId;
          present.add(id);
          syncPeer(peer, nearby.has(id));
          const reaction = reactionsBySession.get(id);
          const visual = peers.get(id);
          if (visual) {
            visual.chatBubble = chatBubblesBySession.get(id) ?? null;
            visual.typing = typingSessions.has(id);
            applyStudioPeerImpact(visual, impactsBySession.get(id), frameTime);
          }
          const key = reaction && reaction.expiresAt > now ? `${reaction.reaction}@${reaction.expiresAt}` : "";
          if (visual && key !== visual.emoteKey) {
            visual.emoteKey = key;
            if (reaction && key) {
              emotes?.play(`peer:${id}`, reaction.reaction, frameTime);
              queueEmoteReaction(reaction.reaction, { x: peer.state.x, y: peer.state.y });
            }
          }
        }
        for (const [id, visual] of peers) {
          if (present.has(id)) continue;
          if (visual.leavingAt === null) {
            // 퇴장은 즉시 파괴하지 않고 페이드아웃을 시작한다(파괴는 렌더 루프가 페이드 완료 시점에 맡는다).
            // 모션 줄이기·효과 low에서는 기존처럼 즉시 파괴한다.
            if (!reducedMotion.matches && experienceRef.current.effectLevel !== "low") {
              visual.leavingAt = frameTime;
              continue;
            }
          } else {
            // 이미 퇴장 페이드 중이면 렌더 루프의 파괴를 기다린다.
            continue;
          }
          destroyPeerVisual(id, visual);
        }
        if (localBody && localSprite && localBodyPhysics) {
          const distance = Math.hypot(next.self.x - localBody.x, next.self.y - localBody.y);
          if (!moving && distance > 96 && studioWorldCanOccupy(navigationWorld, next.self)) {
            localBody.setPosition(next.self.x, next.self.y);
            localBodyPhysics.reset(next.self.x, next.self.y);
            resetCollisionResponse();
            localPose.reset(next.self, fixedStepClock.time);
            lastWalkablePoint = { x: next.self.x, y: next.self.y };
            previousRendered = null;
          }
          applyAvatarVisual(
            localSprite,
            next.self,
            facing,
            activityState(moving, false, next.self.activity),
            identityRef.current,
          );
        }
        // 컨트롤러 경로(상호작용 보상 등)로만 바뀐 내 리액션도 머리 위에 보여 준다.
        // 같은 id를 bridge.requestEmote로 방금 재생했다면 두 번 재생하지 않는다.
        if (next.selfReaction !== lastSelfReaction) {
          lastSelfReaction = next.selfReaction;
          const clock = frameTime;
          if (next.selfReaction && emotes?.activeId("self", clock) !== next.selfReaction) {
            emotes?.play("self", next.selfReaction, clock, "person", STUDIO_EMOTE_DEDUPE_MS);
            queueEmoteReaction(next.selfReaction, null);
          }
        }
        // 전파된 오브젝트 상태는 fx 런타임에 합친다(적용 중복 방지·부수효과 없음은 브리지가 맡는다).
        fxWiring?.syncObjectStates(next.objectStates);
        // 나간 피어가 남긴 원격 상태는 초기 상태로 되돌린다(브리지가 발신 세션으로 판정한다).
        fxWiring?.pruneRemoteStates(present, frameTime);
      };
      const runtime = { syncSnapshot };
      runtimeRef.current = runtime;

      scene.preload = function preload() {
        parent.dataset.bootStage = "loading-textures";
        this.load.on("loaderror", (file: import("phaser").Loader.File) => failedTextures.add(file.key));
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
          if (next) characterAssets.use("self", [studioCharacterStaticAsset(next, facing)]);
        });
        cleanup.push(disposeSpriteSheetListener);
        this.physics.world.setBounds(0, 0, manifest.width, manifest.height);

        const backgroundSource = this.textures.exists(backgroundTextureKey)
          ? this.textures.get(backgroundTextureKey).getSourceImage() : { width: manifest.width, height: manifest.height };
        const backgroundRect = studioCoverRect(
          manifest.width,
          manifest.height,
          backgroundSource.width,
          backgroundSource.height,
        );
        horizonArtwork = null;
        lastSkyTintPhase = null;
        if (this.textures.exists(horizonTextureKey)) {
          const horizonSource = this.textures.get(horizonTextureKey).getSourceImage();
          const horizonRect = studioCoverRect(manifest.width * 3, manifest.height * 3, horizonSource.width, horizonSource.height);
          horizonArtwork = this.add.image(manifest.width / 2, manifest.height / 2, horizonTextureKey)
          .setDisplaySize(horizonRect.width, horizonRect.height)
          .setScrollFactor(0.92)
          .setDepth(-1_004)
          .setAlpha(environmentPreference.backdrop === "city" ? 0.96 : 0.90);
        }
        if (this.textures.exists(backgroundTextureKey)) {
          this.add.image(backgroundRect.x, backgroundRect.y, backgroundTextureKey)
            .setOrigin(0)
            .setDisplaySize(backgroundRect.width, backgroundRect.height)
            .setDepth(-1_000)
            .setAlpha(manifest.tilemap ? 0.24 : environmentPreference.backdrop === "sky" ? 0.96 : 0.72);
        }
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

        for (const layer of worldSetDressing.length > 0 ? [] : manifest.occlusionLayers ?? []) {
          if (manifest.tilemap) {
            const foreground = this.add.graphics().setDepth(layer.depth);
            foreground.fillStyle(artProfile.palette.room, 1).fillPoints([...layer.polygon], true);
            foreground.lineStyle(4, artProfile.palette.wall, 0.86).strokePoints([...layer.polygon], true);
            const minX = Math.min(...layer.polygon.map((point) => point.x));
            const maxX = Math.max(...layer.polygon.map((point) => point.x));
            const minY = Math.min(...layer.polygon.map((point) => point.y));
            const maxY = Math.max(...layer.polygon.map((point) => point.y));
            foreground.lineStyle(2, artProfile.palette.line, 0.42)
              .lineBetween(minX + 18, (minY + maxY) / 2, maxX - 18, (minY + maxY) / 2);
            foreground.setAlpha(0.9);
            occlusionVisuals.push({ polygon: layer.polygon, object: foreground, outsideAlpha: 0.9 });
            cleanup.push(() => foreground.destroy());
            continue;
          }
          const maskGraphics = this.add.graphics().fillStyle(0xffffff).fillPoints([...layer.polygon], true).setVisible(false);
          const mask = maskGraphics.createGeometryMask();
          const foreground = this.add.image(backgroundRect.x, backgroundRect.y, backgroundTextureKey)
            .setOrigin(0).setDisplaySize(backgroundRect.width, backgroundRect.height)
            .setDepth(layer.depth).setMask(mask);
          occlusionVisuals.push({ polygon: layer.polygon, object: foreground, outsideAlpha: 1 });
          cleanup.push(() => { foreground.clearMask(true); foreground.destroy(); maskGraphics.destroy(); });
        }

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

        for (const prop of manifest.props) {
          if (!prop.assetUrl || !this.textures.exists(propTextureKey(prop))) continue;
          const illustratedFrame = worldAssetUrls?.has(prop.assetUrl) || !this.textures.exists(decorationTextureKeys.furniture)
            ? undefined : studioIllustratedPropFrame(prop.assetUrl, artStyle);
          const image = this.add.image(prop.x, prop.y,
            illustratedFrame === undefined ? propTextureKey(prop) : decorationTextureKeys.furniture, illustratedFrame)
            .setOrigin(prop.originX ?? 0.5, prop.originY ?? 1)
            .setAngle(prop.rotation ?? 0)
            .setAlpha(Math.max(0, Math.min(1, prop.alpha ?? 1)))
            .setDepth(studioWorldPropDepth(prop));
          if (prop.width && prop.height) {
            image.setDisplaySize(prop.width, prop.height);
          } else {
            image.setScale(prop.scale ?? 1);
          }
          const replacementFrame = worldAssetUrls?.has(prop.assetUrl) ? undefined : studioIllustratedPropFrame(prop.assetUrl, artStyle);
          if (replacementFrame !== undefined) {
            const info = { image, frame: replacementFrame, width: image.displayWidth, height: image.displayHeight,
              originX: prop.originX ?? .5, originY: prop.originY ?? 1 };
            illustratedProps.push(info);
            if (illustratedFrame !== undefined) {
              const geometry = studioExperienceFrameGeometry("furniture", artStyle, replacementFrame, info.width, info.height, info.originX, info.originY);
              image.setDisplaySize(geometry.width, geometry.height).setOrigin(geometry.originX, geometry.originY);
            }
          }
          const interaction = interactionById.get(prop.id);
          if (interaction) {
            image.setInteractive({ useHandCursor: true });
            image.on(
              "pointerdown",
              (
                _pointer: import("phaser").Input.Pointer,
                _localX: number,
                _localY: number,
                event: InputEventLike,
              ) => {
                event.stopPropagation();
                queuedInteraction = interaction;
              },
            );
          }
        }

        const self = snapshotRef.current.self;
        const spawn = studioWorldSpawn(manifest);
        const initialPoint = resolveStudioWorldSpawn(navigationWorld, self);
        if (!initialPoint) { fail(); return; }
        facing = studioWorldCanOccupy(navigationWorld, self)
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
            motion = { velocity: { x: localBodyPhysics.velocity.x, y: localBodyPhysics.velocity.y } };
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
          scene: this, point: initialPoint, facing, actorVisualScale, nameplateStyle,
          skin: selfCustomSheetSkin ?? studioCharacterSkinForArtStyle(resolveStudioCharacterAppearance(self, identityRef.current).skin, artStyle),
          hasStaticAsset, fallbackAsset, gaitDistancePerCycle: playerLocomotion.gaitDistancePerCycle,
          displayName: displayNameRef.current, updateDisplaySize,
        });
        localShadow = localVisual.shadow;
        localSprite = localVisual.sprite;
        localLabel = localVisual.label;
        lastWalkablePoint = initialPoint;
        decorationRuntime = new StudioVirtualDecorationRuntime(this, bodyZone, decorationTextureKeys);
        decorationRuntime.syncDecorations(studioVirtualDecorationStateForWorld(decorationsRef.current, manifest));
        lastDecorationState = decorationsRef.current;
        cleanup.push(() => { decorationRuntime?.destroy(); decorationRuntime = null; });

        const bubbleColors = studioCanvasBubbleColors(parent);
        emotes = new StudioEmoteRuntime(this, { nearestFilter: Phaser.Textures.FilterMode.NEAREST, colors: bubbleColors });
        speech = new StudioSpeechBubbleRuntime(this, bubbleColors);
        cleanup.push(() => { emotes?.destroy(); emotes = null; speech?.destroy(); speech = null; chatter.reset(); });
        promptRuntime = new StudioWorldPromptRuntime(this, bubbleColors);
        cleanup.push(() => { promptRuntime?.destroy(); promptRuntime = null; });
        motionFeel = new StudioMotionFeelRuntime(this);
        cleanup.push(() => { motionFeel?.destroy(); motionFeel = null; });
        spriteCrossfades = new StudioSpriteCrossfadeRuntime(this);
        cleanup.push(() => { spriteCrossfades?.destroy(); spriteCrossfades = null; });
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
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
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
          if (horizonArtwork && horizonUrl.includes("/cinematic-v9/")) fitStudioHorizonArtwork(horizonArtwork, gameSize, camera.zoom);
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
          path = [];
          motion = { velocity: { x: 0, y: 0 } };
          keyboardInteractQueued = false;
          localBodyPhysics?.setVelocity(0, 0);
          heldKeys.clear();
          this.input.keyboard?.resetKeys();
          gamepadInteractHeld = true;
          if (moving && localBody && !cancelled) {
            moving = false;
            lastPublishedMoving = false;
            callbacksRef.current.onLocalState({ point: { x: localBody.x, y: localBody.y }, facing, moving: false, zoneId: studioWorldRoomAt(manifest, localBody), pose: bridge.getPose() });
          }
          callbacksRef.current.onCancelFollow();
        };
        // Capture only canvas-owned keys before preventing browser scrolling. Phaser's
        // window keyboard handler ignores defaultPrevented events from focused elements.
        const preventGameScrolling = (event: KeyboardEvent) => {
          if (event.target !== canvas) return;
          if (event.key === "Escape") { if (buildPlacement?.handleEscape()) return; npcDirector.cancelGuideTour(); stopMovement(); return; }
          if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || runtimeInputBlocked()) return;
          if (!WORLD_KEY_CODES.has(event.code)) return;
          heldKeys.add(event.code);
          if (event.code === "KeyX" && !event.repeat && !buildPlacement?.active) queueKeyboardInteraction();
          // 고스트 모드 토글: 반투명 + 장애물 통과 이동 (대규모 이벤트 끼임 해소)
          if (event.code === STUDIO_GHOST_TOGGLE_KEY && !event.repeat) {
            const next = !bridge.isGhostMode();
            bridge.setGhostMode(next);
            applyGhostMode(next);
          }
          event.preventDefault();
        };
        const releaseKey = (event: KeyboardEvent) => { heldKeys.delete(event.code); };
        const promptHasFocus = () => document.activeElement?.matches('[data-interact-prompt="true"]') ?? false;
        const refocus = () => {
          if (this.input.keyboard) this.input.keyboard.enabled = document.activeElement === canvas;
          if (document.activeElement !== canvas && !promptHasFocus()) stopMovement();
        };
        const visibility = () => { if (document.hidden) { npcDirector.cancelGuideTour(); stopMovement(); } };
        const reduceMotionChanged = () => {
          camera.setLerp(reducedMotion.matches ? 1 : 0.12, reducedMotion.matches ? 1 : 0.12);
          currentQualityProfile = studioVirtualQualityProfile(experienceRef.current.qualityPreset, qualityEnvironment());
          adaptiveQuality.reset(currentQualityProfile.tier);
          lastQualityTier = currentQualityProfile.tier;
          resizeRuntime();
        };
        canvas.addEventListener("pointerdown", focusCanvas);
        canvas.addEventListener("keydown", preventGameScrolling);
        globalThis.addEventListener("keyup", releaseKey);
        document.addEventListener("focusin", refocus);
        document.addEventListener("visibilitychange", visibility);
        globalThis.addEventListener("blur", stopMovement);
        reducedMotion.addEventListener("change", reduceMotionChanged);
        const modalObserver = new MutationObserver(() => {
          modalInputBlocked = studioWorldHasModalBlocker(document);
        });
        modalObserver.observe(document.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["open", "role", "aria-modal", "aria-hidden", "hidden", "data-state", "data-presentation", "data-studio-input-blocker"],
        });
        cleanup.push(() => {
          canvas.removeEventListener("pointerdown", focusCanvas);
          canvas.removeEventListener("keydown", preventGameScrolling);
          globalThis.removeEventListener("keyup", releaseKey);
          document.removeEventListener("focusin", refocus);
          document.removeEventListener("visibilitychange", visibility);
          globalThis.removeEventListener("blur", stopMovement);
          reducedMotion.removeEventListener("change", reduceMotionChanged);
          modalObserver.disconnect();
        });
        portalTracker.seed(portals, initialPoint);
        zoneTracker.seed(studioWorldPresenceZone(manifest, initialPoint)?.id ?? null);
        // 스폰 시퀀스 시작: 월드 준비 완료(setReady 지점) 신호가 올 때까지 베일이 덮는다.
        zoneTransition = beginStudioZoneSpawnTransition(zoneTransition, {
          zoneId: studioWorldPresenceZone(manifest, initialPoint)?.id ?? null,
          now: this.game.loop.time,
          reducedMotion: reducedMotion.matches,
        });
        arrivalRingPoint = initialPoint;
        // 구역 안내와 끼임 해제 버튼은 HUD가 onZoneChange·onStuckChange로 그린다.
        sceneReady = true;
        parent.dataset.bootStage = manifest.tilemap ? "loading-tiles" : "ready";
        setFailure(false);
        if (!manifest.tilemap) {
          cancelBootDeadline();
          setReady(true);
          zoneTransition = markStudioZoneTransitionReady(zoneTransition, this.game.loop.time);
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
        textResolution?.sync(Math.max(cameraBaseZoom, viewport.ratio));
        if (decorationsRef.current !== lastDecorationState || placedFixturesRef.current !== lastPlacedFixtures) {
          lastDecorationState = decorationsRef.current;
          lastPlacedFixtures = placedFixturesRef.current;
          interactionFx?.syncPlacedFixtures(lastPlacedFixtures ?? []);
          navigationWorld = studioVirtualDecorationNavigationWorld(manifest, lastDecorationState);
          decorationRuntime?.syncDecorations(studioVirtualDecorationStateForWorld(lastDecorationState, manifest));
          npcDirector.updateNavigationWorld(navigationWorld);
          const destination = path.at(-1);
          if (destination) path = findStudioWorldPath(navigationWorld, localBodyPhysics.center, destination);
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
          zoneTransition = revealStudioZoneTransition(zoneTransition, time);
        }
        const steppedTransition = stepStudioZoneTransition(zoneTransition, time);
        zoneTransition = steppedTransition.state;
        const transitionTeleportDueNow = steppedTransition.frame.teleportDue;
        if (steppedTransition.frame.departureDue && pendingDeparturePortal) {
          const leavingPortal = pendingDeparturePortal;
          pendingDeparturePortal = null;
          callbacksRef.current.onPortal?.(leavingPortal);
        }
        const blocked = runtimeInputBlocked() || steppedTransition.frame.blocksInput;
        const worldReadyForHud = manifest.tilemap === undefined || initialTilesReady;
        if (blocked && !wasInputBlocked) {
          heldKeys.clear();
          bridge.clearMovement();
          path = [];
          motion = { velocity: { x: 0, y: 0 } };
          keyboardInteractQueued = false;
          localBodyPhysics.setVelocity(0, 0);
          this.input.keyboard?.resetKeys();
          callbacksRef.current.onCancelFollow();
        }
        wasInputBlocked = blocked;
        buildPlacement?.update(time, { canvasFocused: document.activeElement === this.game.canvas });
        const typing = blocked || buildPlacement?.active || document.activeElement !== this.game.canvas;
        if (bridge.getStopRevision() !== lastStopRevision) {
          lastStopRevision = bridge.getStopRevision();
          path = [];
          motion = { velocity: { x: 0, y: 0 } };
          localBodyPhysics.setVelocity(0, 0);
          walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
        }
        const requestedEmote = bridge.consumeEmote();
        if (requestedEmote) {
          // 같은 요청이 스냅샷(selfReaction) 경로로 이미 막 시작됐다면 두 번 재시작하지 않는다.
          emotes?.play("self", requestedEmote, time, "person", STUDIO_EMOTE_DEDUPE_MS);
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
        // 게임필 설정(1초 캐시): 입력 감도, 끼임 탈출 밀기.
        worldFeel.refresh(time, reducedMotion.matches);
        // 이동 감각(즉응형/관성형). 즉응형은 관성·반동·몸 찌그러짐 없이 입력에 바로 반응한다.
        const locomotion = worldFeel.locomotion;
        const shapedInput = worldFeel.shapeInput(ix, iy, time);
        ix = shapedInput.x;
        iy = shapedInput.y;

        const sprint = !typing && Boolean(heldKeys.has("ShiftLeft") || heldKeys.has("ShiftRight") || keys?.shift?.isDown || gamepad.sprint);
        let currentPoint = { x: localBodyPhysics.center.x, y: localBodyPhysics.center.y };
        // 고스트 모드에서는 벽 안을 의도적으로 통과하므로 점유 보정을 건너뛴다.
        const ghostActive = bridge.isGhostMode();
        const ghostOverrides = studioGhostCollisionOverrides(ghostActive);
        // T8: 따라가기 중 벽 통과를 켜면 고스트와 같은 기준으로 충돌을 우회한다 (물리 충돌기 + 점유 보정).
        const frameFollowConfig = bridge.getFollowConfig();
        const followWallPass = Boolean(bridge.getFollowingPeer()) && frameFollowConfig.ignoreCollisions;
        if (followWallPass !== followWallPassApplied) {
          followWallPassApplied = followWallPass;
          if (!ghostActive) setWorldCollidersActive(!followWallPass);
        }
        const skipOccupancyCorrection = ghostOverrides.skipOccupancyCorrection || followWallPass;
        if (!skipOccupancyCorrection && !studioWorldCanOccupy(navigationWorld, currentPoint)) {
          const fallback = studioWorldCanOccupy(navigationWorld, lastWalkablePoint)
            ? lastWalkablePoint
            : resolveStudioWorldSpawn(navigationWorld, currentPoint);
          if (!fallback) { fail(); return; }
          localBodyPhysics.reset(fallback.x, fallback.y);
          localBody.setPosition(fallback.x, fallback.y);
          localPose.reset(fallback, fixedStepClock.time);
          motion = { velocity: { x: 0, y: 0 } };
          resetCollisionResponse();
          path = [];
          currentPoint = fallback;
          emitStuck(stuckDetector.markCorrected(fallback));
        } else if (studioWorldCanOccupy(navigationWorld, currentPoint)) {
          // 통과 중 벽 안 좌표는 마지막 정상 위치로 남기지 않는다 (해제 직후 보정 되돌림 방지).
          lastWalkablePoint = currentPoint;
        }
        const terrain = studioVirtualTerrainAt(manifest, currentPoint);
        for (const visual of occlusionVisuals) {
          const inside = studioWorldPointInsideOcclusionPolygon(currentPoint, visual.polygon);
          const target = visual.outsideAlpha * (inside ? 0.18 : 1);
          const ratio = reducedMotion.matches ? 1 : Math.min(1, Math.max(0, deltaMs) / 140);
          visual.object.setAlpha(visual.object.alpha + (target - visual.object.alpha) * ratio);
        }
        // 매 프레임 같은 객체를 고쳐 쓴다. 가속·감속에는 게임필 가속 배율을 곱한다.
        const config = motionConfig;
        config.acceleration = DEFAULT_STUDIO_MOTION_CONFIG.acceleration / terrain.dragMultiplier * worldFeel.accelerationFactor;
        config.deceleration = DEFAULT_STUDIO_MOTION_CONFIG.deceleration * terrain.dragMultiplier * worldFeel.accelerationFactor;
        config.maxSpeed = playerLocomotion.walkSpeed * (sprint ? playerLocomotion.sprintMultiplier : 1) * terrain.speedMultiplier;
        const sprintSpeed = playerLocomotion.walkSpeed * playerLocomotion.sprintMultiplier * terrain.speedMultiplier;
        // 55px 안에서 대화 도구가 있는 가장 가까운 NPC 하나(매 프레임 배열 복사·정렬 없이 한 번 순회).
        let nearbyNpc: NpcVisual | undefined;
        let npcInteraction: StudioWorldInteractionDefinition | null = null;
        let nearbyNpcGap = 55;
        for (const npc of npcs.values()) {
          const gap = Math.hypot(npc.groundPoint.x - currentPoint.x, npc.groundPoint.y - currentPoint.y);
          if (gap >= nearbyNpcGap) continue;
          const candidate = studioNpcInteraction(manifest, npc.definition);
          if (!candidate) continue;
          nearbyNpc = npc; npcInteraction = candidate; nearbyNpcGap = gap;
        }
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
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
        } else {
          const previousApproach = approachState.pending;
          const decision = stepStudioWorldInteractionApproach(navigationWorld, approachState, currentPoint, {
            selection: selection ? { id: selection.id, point: selection.point, radius: selection.radius } : null,
            inRangeInteract: interactPressed && !selection,
            nearby: floorFocus,
            focus: floorFocus,
          });
          approachState = decision.state;
          const highlighted = decision.prompt ? interactionById.get(decision.highlightId ?? "") ?? null : null;
          promptInteraction = highlighted;
          const highlightChanged = (highlighted?.id ?? null) !== nearbyInteractionId;
          if (highlightChanged) {
            nearbyInteractionId = highlighted?.id ?? null;
            callbacksRef.current.onNearbyInteractionChange?.(highlighted);
            // 프롬프트 대상이 바뀌면 fx에도 알린다(카페 카운터 바리스타 권유 대사의 진입점).
            interactionFx?.prompted(highlighted, time);
          }
          // 2글자 원형 표식은 '모든 표식 보기'일 때 320px 안에서만 보이고, 프롬프트 대상은 'X' 키캡이 대신한다.
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
              // 월드 반응은 fx 런타임이 맡는다(종류별 연출·상태 가구 전이·전이 통지).
              // 웨이브 1의 burstInteractionCue는 fx의 startBurst가 상위 집합이라 이 지점에서는 물린다.
              interactionFx?.activate(chosen, currentPoint, time, reducedMotion.matches);
            }
          } else if (interactPressed && !selection) {
            // 매니페스트 프롬프트가 없을 때만 배치 가구가 입력을 받고, 소비한 입력은 방 액션으로 새지 않는다.
            if (promptInteraction || !fxWiring?.activatePlacedFixtureNear(currentPoint, time)) callbacksRef.current.onInteract(null);
          }
          if (decision.walkTarget && !directInput && !blocked) {
            const sameWalk = previousApproach
              && previousApproach.id === decision.state.pending?.id
              && previousApproach.walkTarget.x === decision.walkTarget.x
              && previousApproach.walkTarget.y === decision.walkTarget.y;
            if (!sameWalk) {
              const nextPath = findStudioWorldPath(navigationWorld, currentPoint, decision.walkTarget);
              if (nextPath.length === 0) approachState = EMPTY_STUDIO_WORLD_APPROACH;
              else path = nextPath;
            }
          }
        }

        const moveRequest = bridge.consumeMoveTarget();
        if (moveRequest && !blocked && !selection) {
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
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
            walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
          } else {
            const previousRoute = walkOverState.routeTarget;
            const followConfig = bridge.getFollowConfig();
            const followStandOffPx = resolveStudioFollowStandOffPx(followConfig);
            const walked = stepStudioWorldWalkOver(navigationWorld, walkOverState, currentPoint, {
              choice: walkChoice,
              followTarget: followPeer ? { id: followPeerId!, point: { x: followPeer.state.x, y: followPeer.state.y } } : null,
              direct: directInput,
              standOffPx: followStandOffPx,
              ignoreCollisions: followConfig.ignoreCollisions,
              // 도슨트 모드: 가이드가 멈추면 스탠드오프 2배 안에서는 붙으러 가지 않고 대기한다.
              holdSlackPx: followConfig.mode === "docent" ? followStandOffPx : 0,
            });
            walkOverState = walked.state;
            if (walked.follow && walked.state.targetId) bridge.setFollowingPeer(walked.state.targetId);
            const routeMoved = walked.routeTarget
              && (!previousRoute || previousRoute.x !== walked.routeTarget.x || previousRoute.y !== walked.routeTarget.y);
            if (walked.routeTarget && routeMoved && !directInput) {
              approachState = EMPTY_STUDIO_WORLD_APPROACH;
              if (followConfig.ignoreCollisions) {
                // 충돌 무시: 경로탐색을 건너뛰고 스탠드오프 지점으로 직행한다.
                path = [walked.routeTarget];
              } else {
                setPathTo(walked.routeTarget);
              }
            } else if (walked.follow && !walked.routeTarget) path = [];
          }
        }

        const cruise = steerStudioWorldCruise({
          manifest: navigationWorld,
          current: currentPoint,
          path,
          maxSpeed: config.maxSpeed,
          deceleration: config.deceleration,
          direct: blocked ? { x: 0, y: 0 } : { x: ix, y: iy },
        });
        if (directInput) {
          const interruptedNavigation = cruise.cleared || path.length > 0 || Boolean(followPeerId);
          if (followPeerId) bridge.setFollowingPeer(null);
          if (interruptedNavigation) callbacksRef.current.onCancelFollow();
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
          walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
        }
        if (!blocked) {
          path = cruise.path;
          ix = cruise.input.x;
          iy = cruise.input.y;
        }
        if (ghostActive && !blocked) {
          // 고스트: 내비게이션 게이팅을 우회해 목적지로 직진한다 (키보드 입력은 그대로 둔다).
          const destination = path.at(-1) ?? null;
          const seek = studioGhostSeekInput(currentPoint, destination);
          if (seek) { ix = seek.x; iy = seek.y; }
          else if (destination) { path = []; ix = 0; iy = 0; }
        }

        // locomotion-feel 연결: 커브 가속/감속 + 급정지 스키드
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
        const previousVelocity = motion.velocity;
        if (locomotion.inertial) {
          // 관성형: 출발 120ms ease-in 램프와 방향 반전 감속을 얹은 이징 스텝 (필 커브 자체는 easer가 위임)
          motion = { velocity: motionEaser.step(previousVelocity, feelTarget, dt, feelConfig, reducedMotion.matches) };
        } else {
          // 즉응형: 정해진 시간(출발 50ms·정지 30ms·반전 60ms) 안에 목표 속도로 옮긴다. 지형 마찰은 응답 시간에 반영한다.
          motion = {
            velocity: stepCrispVelocity(previousVelocity, feelTarget, dt, config.maxSpeed, locomotion,
              worldFeel.accelerationFactor / Math.max(0.5, terrain.dragMultiplier)),
          };
        }
        // 급회전 감속: 몸이 돌아가는 동안 일시적으로 속도를 줄인다(관성형에서만).
        let turnFactor = 1;
        const feelSpeed = Math.hypot(motion.velocity.x, motion.velocity.y);
        if (locomotion.inertial && feelSpeed > 4 && inputMagnitude > 0.001) {
          turnFactor = turnSlowdownFactor(shortestAngleDelta(
            Math.atan2(previousVelocity.y, previousVelocity.x),
            Math.atan2(feelTarget.y, feelTarget.x),
          ));
        }
        localBodyPhysics.setVelocity(motion.velocity.x * turnFactor, motion.velocity.y * turnFactor);
        // 벽에 비비며 제자리면 직각 방향으로 잠깐 밀어 준다(1.5초 끼임 판정·HUD 버튼은 stuckDetector가 그대로 맡는다).
        const body = localBodyPhysics;
        // 충돌 반발: 벽에 처음 닿은 프레임이면 직전 적용 속도를 반사해 몸이 살짝 튀어 나오게 한다.
        // 반발을 이번 프레임 속도로 채택하면 이저가 그 속도에서 이어받아 자연스럽게 감속한다.
        // 즉응형은 벽에서 튕기지 않고 벽을 따라 미끄러진다(반동 판정 자체를 건너뛴다).
        const bounce = locomotion.collisionBounce ? collisionResponder.sample({
          velocity: lastAppliedVelocity, contact: studioCollisionContact(body.blocked, body.touching),
          maxSpeed: config.maxSpeed, reducedMotion: reducedMotion.matches,
          effectsSuppressed: experienceRef.current.effectLevel === "low",
        }, time) : null;
        if (bounce) {
          motion = { velocity: bounce };
          localBodyPhysics.setVelocity(bounce.x, bounce.y);
          lastAppliedVelocity.x = bounce.x;
          lastAppliedVelocity.y = bounce.y;
          // 반발이 있으면 "멈춤"이 아니라 "튕김"이라 아래쪽 급정지 판정만으로는 흔들림이 죽는다.
          // 강한 충돌의 흔들림은 충격 시점에 여기서 함께 발화한다 (직전 프레임 속도가 판정 기준).
          worldFeel.noteImpact(true, 0, time, config.maxSpeed);
          // 같은 반발을 피어 화면에서도 재생할 수 있게 속도를 그대로 전파한다.
          callbacksRef.current.onSelfImpact?.(bounce.x, bounce.y);
        } else {
          lastAppliedVelocity.x = motion.velocity.x * turnFactor;
          lastAppliedVelocity.y = motion.velocity.y * turnFactor;
        }
        worldFeel.sampleStuck(currentPoint.x, currentPoint.y, ix, iy, body.blocked.left || body.blocked.right,
          body.blocked.up || body.blocked.down, time, directInput && !blocked);
        let portal: StudioWorldPortalDefinition | null = null;
        let snapCamera = false;
        const teleportRequest = worldReadyForHud ? bridge.consumeTeleport() : null;
        let teleportTarget = teleportRequest ? resolveStudioWorldSpawn(navigationWorld, teleportRequest) : null;
        if (teleportTarget && zoneTransition.phase === "idle") {
          // 미니맵·디렉터리의 같은 월드 순간이동도 포털과 같은 전환 시퀀스를 거친다.
          pendingBridgeTeleport = teleportTarget;
          zoneTransition = beginStudioZonePortalTransition(zoneTransition, {
            zoneId: studioWorldRoomAt(manifest, teleportTarget),
            now: time,
            reducedMotion: reducedMotion.matches,
          });
          localBodyPhysics.setVelocity(0, 0);
          motion = { velocity: { x: 0, y: 0 } };
          path = [];
          teleportTarget = null;
        }
        if (transitionTeleportDueNow && pendingPortalArrival) {
          // 포털 텔레포트 적용: 베일이 완전히 덮인 시점에 몸을 옮기고 카메라를 붙인다.
          const arrival = pendingPortalArrival;
          pendingPortalArrival = null;
          localBodyPhysics.reset(arrival.body.x, arrival.body.y);
          localPose.reset(arrival.body, fixedStepClock.time);
          previousRendered = null;
          motion = { velocity: arrival.velocity };
          localBodyPhysics.setVelocity(arrival.velocity.x, arrival.velocity.y);
          resetCollisionResponse();
          lastAppliedVelocity.x = arrival.velocity.x;
          lastAppliedVelocity.y = arrival.velocity.y;
          path = [];
          bridge.clearMovement();
          lastPosition = arrival.body;
          currentPoint = arrival.body;
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
          arrivalRingPoint = arrival.body;
          snapCamera = true;
          if (arrival.portal) callbacksRef.current.onPortal?.(arrival.portal);
        } else if (transitionTeleportDueNow && pendingBridgeTeleport) {
          const target = pendingBridgeTeleport;
          pendingBridgeTeleport = null;
          localBodyPhysics.reset(target.x, target.y);
          localBody.setPosition(target.x, target.y);
          localPose.reset(target, fixedStepClock.time);
          previousRendered = null;
          motion = { velocity: { x: 0, y: 0 } };
          motionEaser.reset();
          localBodyPhysics.setVelocity(0, 0);
          path = [];
          walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
          if (bridge.getFollowingPeer()) { bridge.setFollowingPeer(null); callbacksRef.current.onCancelFollow(); }
          portalTracker.seed(portals, target);
          lastWalkablePoint = target;
          lastPosition = target;
          currentPoint = target;
          lastPublishedPoint = null;
          arrivalRingPoint = target;
          snapCamera = true;
          emitStuck(stuckDetector.reset());
          worldFeel.resetStuck();
          resetCollisionResponse();
        } else if (teleportTarget) {
          localBodyPhysics.reset(teleportTarget.x, teleportTarget.y);
          localBody.setPosition(teleportTarget.x, teleportTarget.y);
          localPose.reset(teleportTarget, fixedStepClock.time);
          previousRendered = null;
          motion = { velocity: { x: 0, y: 0 } };
          motionEaser.reset();
          localBodyPhysics.setVelocity(0, 0);
          path = [];
          walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
          approachState = EMPTY_STUDIO_WORLD_APPROACH;
          if (bridge.getFollowingPeer()) { bridge.setFollowingPeer(null); callbacksRef.current.onCancelFollow(); }
          portalTracker.seed(portals, teleportTarget);
          lastWalkablePoint = teleportTarget;
          lastPosition = teleportTarget;
          currentPoint = teleportTarget;
          lastPublishedPoint = null;
          snapCamera = true;
          emitStuck(stuckDetector.reset());
          worldFeel.resetStuck();
          resetCollisionResponse();
        } else if (bridge.consumeUnstuck()) {
          const rescue = resolveStudioWorldUnstuck(navigationWorld, currentPoint);
          if (rescue.spawn) {
            localBodyPhysics.reset(rescue.spawn.x, rescue.spawn.y);
            localPose.reset(rescue.spawn, fixedStepClock.time);
            previousRendered = null;
            motion = { velocity: rescue.velocity };
            localBodyPhysics.setVelocity(rescue.velocity.x, rescue.velocity.y);
            path = [];
            walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
            approachState = EMPTY_STUDIO_WORLD_APPROACH;
            bridge.setFollowingPeer(null);
            lastPosition = rescue.spawn;
            currentPoint = rescue.cameraAnchor;
            snapCamera = true;
            emitStuck(stuckDetector.reset());
            worldFeel.resetStuck();
            resetCollisionResponse();
          }
        } else if (!blocked) {
          const arrival = resolveStudioWorldPortalArrival(
            portalTracker,
            navigationWorld,
            portals,
            currentPoint,
            motion.velocity,
            reducedMotion.matches,
          );
          portal = arrival.portal;
          const moved = arrival.body.x !== currentPoint.x || arrival.body.y !== currentPoint.y;
          if (portal?.href) {
            // 다른 월드로 나가는 문: 페이드아웃이 끝나면 페이지에 넘긴다.
            // 복귀 페이드인은 타이머가 아니라 새 월드의 스폰 시퀀스(월드 변경 시)나
            // 페이지의 같은-장소 확정 신호(requestPortalReveal)가 담당한다.
            if (zoneTransition.phase === "idle") {
              zoneTransition = beginStudioZoneDepartureTransition(zoneTransition, {
                now: time,
                reducedMotion: reducedMotion.matches,
              });
              pendingDeparturePortal = portal;
              localBodyPhysics.setVelocity(0, 0);
              motion = { velocity: { x: 0, y: 0 } };
              path = [];
            } else {
              callbacksRef.current.onPortal?.(portal);
            }
          } else if (portal && moved) {
            if (zoneTransition.phase === "idle") {
              // 같은 월드 순간이동: 몸은 베일이 완전히 덮인 시점에 옮긴다.
              pendingPortalArrival = arrival;
              zoneTransition = beginStudioZonePortalTransition(zoneTransition, {
                zoneId: studioWorldRoomAt(manifest, arrival.body),
                now: time,
                reducedMotion: reducedMotion.matches,
              });
              localBodyPhysics.setVelocity(0, 0);
              motion = { velocity: { x: 0, y: 0 } };
              path = [];
              bridge.clearMovement();
            } else {
              localBodyPhysics.reset(arrival.body.x, arrival.body.y);
              localPose.reset(arrival.body, fixedStepClock.time);
              previousRendered = null;
              motion = { velocity: arrival.velocity };
              localBodyPhysics.setVelocity(arrival.velocity.x, arrival.velocity.y);
              path = [];
              bridge.clearMovement();
              lastPosition = arrival.body;
              currentPoint = arrival.body;
              approachState = EMPTY_STUDIO_WORLD_APPROACH;
              snapCamera = true;
              callbacksRef.current.onPortal?.(portal);
            }
          } else if (portal) {
            callbacksRef.current.onPortal?.(portal);
          }
        }

        if (routeOverlay) {
          // 클릭 이동 경로 표시(목적지 마커·폴리라인)와 가장 가까운 포털의 바닥 펄스 링.
          drawStudioRouteOverlay(routeOverlay, {
            current: currentPoint, path, moving: feelSpeed > 5, now: time, wallNow: Date.now(),
            markerStartedAt, reducedMotion: reducedMotion.matches, portals, memory: routeOverlayMemory,
            projectPoint: (point) => studioProjectTownPoint(manifest, point),
          });
        }
        if (locateOverlay) {
          // 참가자 locate 안내선: 선택한 참가자 방향으로 안내선 + 가장자리 화살표 마커
          const locateId = bridge.getLocateTarget();
          const locateVisual = locateId ? peers.get(locateId) : undefined;
          // 참가자 안내가 없으면 W-2 지점 안내(게이트·포털·목적지)를 같은 안내선으로 그린다.
          const locatePoint = locateVisual ? { x: locateVisual.targetX, y: locateVisual.targetY } : bridge.getLocatePoint();
          const camera = this.cameras.main;
          drawStudioLocateOverlay(locateOverlay, buildStudioLocateGuide({
            self: currentPoint,
            target: locatePoint,
            cameraCenter: { x: camera.scrollX + camera.width / 2, y: camera.scrollY + camera.height / 2 },
            viewWidth: camera.width / camera.zoom,
            viewHeight: camera.height / camera.zoom,
          }), currentPoint, time, reducedMotion.matches);
        }
        // 전환 베일과 도착 링: 전환 순간에만 그리고, 끝나면 완전히 사라진다.
        drawStudioZoneTransitionOverlay({
          veil: transitionVeil, ring: arrivalRing, frame: steppedTransition.frame,
          width: this.cameras.main.width, height: this.cameras.main.height,
          arrivalGround: arrivalRingPoint ? studioProjectTownPoint(manifest, arrivalRingPoint) : null,
        });
        const zone = resolveStudioWorldZonePresence(zoneTracker, manifest, currentPoint, reducedMotion.matches);
        drawStudioZoneSeparationVeil({
          graphics: zoneVeil, rect: zone.separated ? zone.rect : null,
          alpha: artProfile.key === "neon" ? 0.18 : reducedMotion.matches ? 0.22 : 0.28,
          worldWidth: manifest.width, worldHeight: manifest.height,
        });
        const zoneChange = worldReadyForHud ? zoneChanges.next(currentPoint) : null;
        if (zoneChange) callbacksRef.current.onZoneChange?.(zoneChange);
        if (worldReadyForHud) {
          // 타일 이펙트·오피스 존 입장 파티클 소비: 진입 순간만 반응한다.
          if (tileEffectsRef.current !== tileTrackerEffects) {
            tileTrackerEffects = tileEffectsRef.current;
            tileTracker = new StudioTileEffectRuntimeTracker({ effects: tileTrackerEffects, officeZones: manifest.zones ?? [] });
          }
          const tileStep = tileTracker.next(currentPoint, { reducedMotion: reducedMotion.matches });
          if (tileStep.zoneEntryParticle) livingWorld?.triggerZoneEntryParticles(tileStep.zoneEntryParticle, currentPoint);
          if (tileStep.trigger) tileTriggerCallbackRef.current?.(tileStep.trigger);
        }
        parent.dataset.zoneId = zone.zoneId ?? "";
        parent.dataset.zoneSeparated = String(zone.separated);
        parent.dataset.zoneAnnounced = String(zone.announce);
        const activity = snapshotRef.current.self.activity;
        const speed = Math.hypot(motion.velocity.x, motion.velocity.y);
        // 빠르게 달리다 벽에 부딪혀 멈추면 화면을 흔든다(게임필 설정·모션 줄이기 존중, 세기는 collisionShake 곡선).
        worldFeel.noteImpact(body.touching.left || body.touching.right || body.touching.up || body.touching.down, speed, time, config.maxSpeed);
        const runtimeBudget = studioRuntimeBudget(parent.clientWidth, reducedMotion.matches, peers.size);
        const maxActiveNpcs = Math.min(runtimeBudget.maxActiveNpcs, currentQualityProfile.maxActiveNpcs);
        const peerInterest = studioTownInterestSnapshot(manifest, currentPoint, [...peers].map(([id, peer]) => ({
          id: `peer:${id}`,
          point: { x: peer.targetX, y: peer.targetY },
          kind: "peer" as const,
          important: bridge.getFollowingPeer() === id,
        })), currentQualityProfile.interestRadius);
        proximityOverlay?.clear();
        if (proximityOverlay && atmosphereRef.current !== "focus" && activity !== "focused" && activity !== "away") {
          // 대화 거리(게더타운식 근접 버블): 기본은 120px 안 동료가 있을 때만 발밑 버블과 연결선을 보이고,
          // '모든 표식 보기'면 190px 안까지 넓은 링도 함께 그린다. 배열을 만들지 않고 한 번 순회한다.
          const showAll = experienceRef.current.interactionRings;
          const reach = showAll ? 190 : 120;
          const origin = studioProjectTownPoint(manifest, currentPoint);
          let inRange = 0;
          for (const peer of peers.values()) {
            const distance = Math.hypot(peer.targetX - currentPoint.x, peer.targetY - currentPoint.y);
            if (distance > reach) continue;
            inRange += 1;
            const strength = Math.max(.08, .36 * (1 - distance / reach));
            proximityOverlay.lineStyle(distance < 80 ? 2 : 1, peer.activity === "focused" ? 0xf9b95d : 0x82e6ff, strength)
              .lineBetween(origin.x, origin.y - 6, peer.sprite.x, peer.sprite.y - 6);
          }
          if (inRange > 0) {
            proximityOverlay.fillStyle(0x8fdcff, .07).fillEllipse(origin.x, origin.y, 150, 70);
            proximityOverlay.lineStyle(2, 0xc5f4ff, .26).strokeEllipse(origin.x, origin.y, 150, 70);
            if (showAll) proximityOverlay.lineStyle(1.5, 0x8fdcff, .13).strokeCircle(origin.x, origin.y, 140);
          }
        }
        objectRuntime?.update(time, currentPoint);
        deskPodRuntime?.update([
          { point: currentPoint, focused: activity === "focused" },
          ...[...peers].map(([, peer]) => ({ point: { x: peer.targetX, y: peer.targetY }, focused: peer.activity === "focused" })),
        ], time, reducedMotion.matches);
        decorationRuntime?.update(time, currentPoint, reducedMotion.matches, speed);
        setDressingRuntime?.update(time, currentPoint, reducedMotion.matches, speed);
        tileWorld?.update(this.cameras.main.worldView);
        if (tileWorld) {
          const tileMetrics = tileWorld.diagnostics;
          parent.dataset.tileChunks = String(tileMetrics.chunks);
          parent.dataset.tileTextures = String(tileMetrics.textures);
          if (!engineFailed && !initialTilesReady && tileMetrics.ready) {
            initialTilesReady = true;
            startOptionalSceneArt?.(); startOptionalSceneArt = null;
            cancelBootDeadline();
            parent.dataset.bootStage = "ready";
            setReady(true);
            zoneTransition = markStudioZoneTransitionReady(zoneTransition, time);
            focusWorldOnReady();
          }
        }
        const environmentEffect = bridge.consumeEnvironmentEffect();
        if (environmentEffect) livingWorld?.triggerEnvironmentEffect(environmentEffect.effect, environmentEffect.point, time);
        livingWorld?.update(
          time,
          deltaMs,
          currentPoint,
          speed,
          reducedMotion.matches,
          currentQualityProfile,
          experienceRef.current.effectLevel,
          environmentRef.current,
          decorationsRef.current.presentationMode,
        );
        // 날씨 파티클과 앰비언트 순찰 배우는 앰비언스 렌더 런타임이 매 프레임 동기화한다.
        const ambienceCondition = studioAmbienceCondition(environmentRef.current.weather);
        const ambienceDayNight = bridge.getDayNightCycle();
        ambienceRender?.update({
          time,
          deltaMs,
          viewport: this.cameras.main.worldView,
          condition: ambienceCondition.particles,
          particleRatio: currentQualityProfile.weather ? currentQualityProfile.particleRatio : 0,
          reducedMotion: reducedMotion.matches,
          patrolWeather: ambienceCondition.patrol,
          timeOfDay: ambienceDayNight.enabled
            ? studioDayNightTimeOfDay(ambienceDayNight.now, ambienceDayNight.startMs, ambienceDayNight.cycleMs)
            : null,
          players: [currentPoint],
          ambientActorsEnabled: currentQualityProfile.ambientActors,
        });
        // 오브젝트 광원·가구 섀도우: 주야 사이클이 꺼져 있으면 실제 시계로 환경광을 대체한다.
        // 전면 틴트와 별개로, 광원 세기 계산에만 환경광 수치를 쓴다.
        const lightFraction = ambienceDayNight.enabled
          ? studioDayNightTimeOfDay(ambienceDayNight.now, ambienceDayNight.startMs, ambienceDayNight.cycleMs)
          : studioLightRenderRealTimeOfDay(new Date());
        const lightModulation = studioDayNightModulationAt(lightFraction);
        lightRender?.update({
          time,
          fixtures: bridge.getLightFixtures(),
          ambientLevel: studioBuildingLifeAmbienceAt(lightFraction).ambient,
          neonGlow: lightModulation.neonGlow,
          focus: { x: this.cameras.main.worldView.centerX, y: this.cameras.main.worldView.centerY },
          dynamicLights: currentQualityProfile.dynamicLights,
          particleRatio: currentQualityProfile.particleRatio,
          reducedMotion: reducedMotion.matches,
        });
        const traveled = lastPosition ? Math.hypot(currentPoint.x - lastPosition.x, currentPoint.y - lastPosition.y) : 0;
        if (traveled > 0.015) lastMovedAt = time;
        // Render frames can outnumber fixed physics steps. Do not toggle idle/walk on zero-step frames.
        const nextMoving = !blocked && speed > 5 && time - lastMovedAt < locomotion.movingHoldMs;
        lastPosition = currentPoint;
        if (speed > 10) facing = studioStableFacing(motion.velocity, facing);

        // fx 프레임 시작: 카메라 화면·모션 설정을 받고 풀 카운터를 되돌린다(trackActor보다 먼저).
        interactionFx?.beginFrame(time, this.cameras.main.worldView, reducedMotion.matches, currentQualityProfile.particleRatio);
        const localResolved = resolveStudioCharacterAppearance(snapshotRef.current.self, identityRef.current);
        const localSkin = studioCharacterSkinForArtStyle(localResolved.skin, artStyle);
        const localSeatRequested = !nextMoving && !directInput && resolveStudioCharacterAppearance(snapshotRef.current.self, identityRef.current, "sit").clip === "sit" ? poseRef.current.seatedActors.find((actor) => actor.id === identityRef.current) : undefined;
        const localSeat = scene.textures.exists(studioCharacterPoseTextureKey(localSkin, "sit")) ? localSeatRequested : undefined;
        const localPoseOverride = !nextMoving && !directInput && resolveStudioCharacterAppearance(snapshotRef.current.self, identityRef.current, "sit").clip === "sit" ? poseRef.current.selfPose : undefined;
        // NPC와 대화 중이고 앉아 있지 않을 때는 상대를 바라본다. 대화가 끝나거나
        // 걷기 시작하면 이동 방향 기준의 원래 facing으로 자연히 돌아간다.
        const dialogueFocus = bridge.getConversationFocus();
        if (dialogueFocus && !nextMoving && !localSeatRequested && !localPoseOverride) {
          facing = studioFacingToward(dialogueFocus.x - currentPoint.x, dialogueFocus.y - currentPoint.y);
        }
        const shownLocalEmote = emotes?.activeId("self", time) ?? null;
        const localEmotePose = emotes?.pose("self", time, reducedMotion.matches) ?? null;
        const localWaving = shownLocalEmote === "wave" || poseRef.current.waveActorIds.includes(identityRef.current);
        // 자세 상태 머신: 휴식 요청(앉기/눕기) 판정 + 이동 시작 시 자동 일어서기
        const seatAnchors = studioPoseSeatAnchors({ seatedActors: poseRef.current.seatedActors, interactionSlots: manifest.interactionSlots });
        const clearanceOffsets = [{ x: 44, y: 0 }, { x: -44, y: 0 }, { x: 0, y: 44 }, { x: 0, y: -44 }];
        const openArea = clearanceOffsets.every((offset) =>
          studioWorldCanOccupy(navigationWorld, { x: currentPoint.x + offset.x, y: currentPoint.y + offset.y }))
          && [...peers.values()].every((visual) =>
            Math.hypot(visual.targetX - currentPoint.x, visual.targetY - currentPoint.y) > 70);
        const poseFrame = bridge.updatePoseState({
          position: currentPoint,
          moving: nextMoving || directInput,
          seatAnchors,
          openArea,
          now: Date.now(),
        });
        const localState = nextMoving ? "walk" : poseFrame.pose !== "stand" ? poseFrame.pose
          : localSeatRequested || localPoseOverride ? "sit" : localWaving ? "wave" : activityState(false, false, activity);
        const rendered = localPose.sample(this.game.loop.time);
        if (previousRendered) {
          const distance = Math.hypot(rendered.x - previousRendered.x, rendered.y - previousRendered.y);
          if (distance < 64) localDistance += distance;
        }
        const footstepGap = terrain.kind === "shallow-water" ? 18 : sprint ? 32 : 25;
        if (nextMoving && localDistance - lastFootstepDistance >= footstepGap) {
          livingWorld?.emitFootstep(rendered, terrain, time);
          lastFootstepDistance = localDistance;
        }
        previousRendered = rendered;
        localSprite.setData("walkDistance", localDistance).setData("actorReaction", shownLocalEmote).setData("actorUserStatus", snapshotRef.current.self.userStatus);
        localSprite.setData("seatAttached", Boolean(localSeat));
        const localEmoteFacing = localSeatRequested || localPoseOverride || nextMoving ? null : studioEmoteFacing(localEmotePose);
        // 유효 보폭을 프레임 선택보다 먼저 한 번만 확정한다: 걷기 프레임(스프라이트 데이터)·몸 bob·그림자가 전부 같은 거리 위상을 써야
        // 속도가 바뀌어도 발 접지와 몸 움직임이 어긋나지 않는다. 즉응형은 걸음 주기를 초당 상한 안으로 맞춰 다리가 허둥대지 않게 한다.
        const localGaitStride = studioCadenceLimitedStride(
          studioEffectiveGaitStride(playerLocomotion.gaitDistancePerCycle,
            studioCharacterWalkClip(selfCustomSheetSkin ?? localSkin, facing)?.distancePerCycle),
          playerLocomotion.walkSpeed, locomotion);
        // 별도 키로 둬서 관성형으로 되돌리면 원래 클립 보폭이 그대로 살아난다(프레임 선택이 이 키를 우선한다).
        localSprite.setData("gaitStrideOverride", locomotion.maxGaitCyclesPerSecond === null ? undefined : localGaitStride);
        spriteCrossfades?.capture(localSprite);
        applyAvatarVisual(localSprite, snapshotRef.current.self,
          localSeatRequested?.facing ?? poseFrame.anchor?.facing ?? localPoseOverride?.facing ?? localEmoteFacing ?? facing, localState, identityRef.current);
        spriteCrossfades?.commit(localSprite, time, crossfadeEnabled);
        applyCameraMode(locomotion.cameraDeadzoneScale);
        const cameraMode = experienceRef.current.cameraMode;
        const lookAhead = (reducedMotion.matches || cameraMode === "steady" ? 0
          : cameraMode === "cinematic" ? sprint ? .32 : .24
            : sprint ? .24 : .16) * locomotion.cameraLookAheadScale;
        // 카메라 디렉터: 이동 방향 룩어헤드·달리기 줌아웃·방 전환 패닝·충돌 흔들림·대화 포커스(HUD 브리지).
        const cameraInput = worldFeel.cameraInput;
        cameraInput.x = rendered.x;
        cameraInput.y = rendered.y;
        cameraInput.velocityX = motion.velocity.x;
        cameraInput.velocityY = motion.velocity.y;
        cameraInput.maxSpeed = sprintSpeed;
        cameraInput.roomId = zone.zoneId;
        cameraInput.now = time;
        cameraInput.deltaSeconds = dt;
        cameraInput.lookAheadSeconds = lookAhead;
        cameraInput.reducedMotion = reducedMotion.matches;
        cameraInput.sprinting = sprint && nextMoving;
        const conversationFocus = bridge.getConversationFocus();
        worldFeel.camera.setFocus(conversationFocus ? conversationFocus.x : null, conversationFocus?.y ?? 0);
        const directed = worldFeel.camera.step(cameraInput);
        cameraGround.x = Math.max(0, Math.min(manifest.width, directed.targetX));
        cameraGround.y = Math.max(0, Math.min(manifest.height, directed.targetY));
        const cameraVisualTarget = studioProjectTownPoint(manifest, cameraGround);
        // 카메라 데드존(트랙3): 목표가 작은 반경 안에서 떨 때는 기준점을 고정한다.
        // 방 전환 패닝·대화 포커스·모션 줄이기에서는 디렉터가 직접 이끌므로 데드존을 쓰지 않는다.
        const directedPan = directed.roomTransitioning || conversationFocus !== null || reducedMotion.matches;
        const deadzonedTarget = directedPan || !Number.isFinite(cameraBase.x) ? cameraVisualTarget : applyCameraDeadzone({
          playerX: cameraVisualTarget.x,
          playerY: cameraVisualTarget.y,
          cameraTargetX: cameraBase.x,
          cameraTargetY: cameraBase.y,
          deadzoneRadius: STUDIO_CAMERA_DEADZONE_RADIUS * locomotion.cameraDeadzoneScale,
        });
        cameraBase.x = deadzonedTarget.x;
        cameraBase.y = deadzonedTarget.y;
        cameraTarget.x = cameraBase.x + directed.shakeX;
        cameraTarget.y = cameraBase.y + directed.shakeY;
        if (cameraFollows) this.cameras.main.setZoom(cameraBaseZoom * directed.zoomFactor);
        const followBase = Math.min(.6, (cameraMode === "steady" ? .075 : cameraMode === "cinematic" ? .16 : .12) * locomotion.cameraFollowScale);
        const followAmount = snapCamera || reducedMotion.matches ? 1
          : studioCameraLerp(dt, directed.roomTransitioning ? followBase * 2.2 : followBase);
        // 월드 경계 근처에서는 추종을 미리 늦춰 하드 클램프에서 화면이 튀지 않게 한다.
        const softenAtEdge = cameraFollows && !snapCamera && !reducedMotion.matches;
        const edgeFactorX = softenAtEdge
          ? studioCameraEdgeLerpFactor(this.cameras.main.midPoint.x, this.cameras.main.worldView.width, manifest.width)
          : 1;
        const edgeFactorY = softenAtEdge
          ? studioCameraEdgeLerpFactor(this.cameras.main.midPoint.y, this.cameras.main.worldView.height, manifest.height)
          : 1;
        this.cameras.main.setLerp(followAmount * edgeFactorX, followAmount * edgeFactorY);
        if (snapCamera) this.cameras.main.centerOn(cameraVisualTarget.x, cameraVisualTarget.y);

        const hasWalkClip = scene.anims.exists(walkAnimationKey(localSkin, facing)) || reducedMotion.matches;
        // 몸 bob·그림자·흔들림·스쿼시는 위에서 확정한 유효 보폭(localGaitStride)을 같은 거리 위상으로 쓴다.
        // (레거시 프로필도 시간 기반 사인 폴백 대신 이 보폭으로 잠근다.) 즉응형은 좌우 스웨이를 끄고 위아래 bob만 미세하게 남긴다.
        const gaitBody = studioGaitBodyOffset(localDistance, localGaitStride, nextMoving, reducedMotion.matches);
        const bodyOffset = locomotion.inertial ? gaitBody
          : { offsetX: gaitBody.offsetX * locomotion.gaitSwayScale, offsetY: gaitBody.offsetY * locomotion.gaitBobScale };
        const localGroundPoint = localSeat?.anchorPoint ?? rendered;
        const localVisualPoint = studioProjectTownPoint(manifest, localGroundPoint);
        // 표시 전용 지수 감쇠: 물리 스텝(60Hz)과 렌더 프레임이 어긋날 때 생기는 계단 이동과
        // 정지·회전 끝의 툭 끊김을 둥글게 한다. 논리 위치·충돌·카메라·깊이는 기존 좌표를 그대로 쓰고
        // 몸·그림자·이름표·이모트만 감쇠 좌표를 쓴다. 96px 초과 점프(텔레포트·포털·구조)는 즉시 스냅한다.
        // 시간상수는 속도 적응형이다: 느릴 때는 기본 50ms, 빠를수록 줄여 표시가 뒤처지지 않게 한다.
        localDisplayPoint = dampStudioDisplayPoint(localDisplayPoint, localVisualPoint, dt, {
          enabled: !reducedMotion.matches,
          tauSeconds: studioDisplayDampTauSeconds(speed) * locomotion.displayDampScale,
        });
        const localDisplay = localDisplayPoint;
        const localShadowPoint = localDisplay;
        const localEmoteBody = localSeat || nextMoving ? null : localEmotePose;
        // 자리 비움 졸기: 앉기·이모트가 없을 때만 긴 주기의 꾸벅임을 얹어 상태가 몸짓으로 읽히게 한다.
        const localDoze = activity === "away" && !nextMoving && !localSeat && !localEmoteBody
          ? studioAwayDozeMotion(time, studioSmoothingPhaseSeed(identityRef.current), reducedMotion.matches) : null;
        // 이동 모드·걸음 위상·호흡 (locomotion-feel 연결)
        locomotionMode = nextLocomotionMode(locomotionMode, feelSpeed);
        walkPhase = advanceWalkPhase(walkPhase, feelSpeed, dt, config.maxSpeed);
        breathPhase = advanceBreathPhase(breathPhase, dt);
        const breathY = breathOffset(breathPhase, locomotionMode);
        // 대기 무게 이동: 정지 중에도 좌우로 미세하게 흔들려 석상처럼 굳지 않게 한다.
        const localIdleSway = !nextMoving && !localSeat && !localEmoteBody
          ? studioIdleSwayOffsetX(time, studioSmoothingPhaseSeed(identityRef.current), reducedMotion.matches) : 0;
        localSprite.setPosition(localDisplay.x + bodyOffset.offsetX + localIdleSway + (localEmoteBody?.bodyX ?? 0),
          localDisplay.y + bodyOffset.offsetY + (localEmoteBody?.bodyY ?? 0) + breathY + (localDoze?.offsetY ?? 0));
        // 눕기 폴백(포즈 텍스처가 없을 때 idle 프레임+회전) + 급회전 린(lean)
        const poseTextureUsed = localSprite.getData("poseTextureUsed") === true;
        const lieFallbackAngle = poseFrame.pose === "lie" && !poseTextureUsed ? 90 : 0;
        const turnTargetAngle = feelSpeed > 4 ? facingAngleFromVelocity(motion.velocity, turnState.angle) : turnState.angle;
        turnState = stepTurnAngleSmooth(turnState, turnTargetAngle, dt, feelSpeed, feelConfig);
        const leanDegrees = turnLeanAngle(turnState.angularVelocity * 180 / Math.PI) * locomotion.leanScale;
        // 걸음 위상 동기 흔들림: 프레임 전환 사이에 연속적인 2차 모션을 넣는다 (위에서 확정한 유효 보폭 기준).
        const localRockAngle = studioGaitRockAngle(localDistance, localGaitStride, nextMoving, reducedMotion.matches) * locomotion.gaitRockScale;
        localSprite.setAngle((playerLocomotion.gaitDistancePerCycle ? 0 : nextMoving && !hasWalkClip ? Math.sin(time * 0.018) * 0.8 : 0)
          + localRockAngle
          + (localEmoteBody?.bodyAngle ?? 0) + lieFallbackAngle + leanDegrees + (localDoze?.angleDegrees ?? 0));
        // 캐릭터 모션 오버레이 (트랙1): 상태머신이 블렌딩한 변형을 가산한다.
        // 전이 시점(어떤 모션을 언제)은 트랙3 소유라, 아래는 기존 이동·자세 신호를
        // 그대로 쓰는 잠정 매핑이다. 프로시저럴 스킨은 기존 포즈 시트 경로를 유지해
        // 회귀를 막고, 커스텀 시트에만 오버레이를 적용한다.
        if (selfCustomSheetSkin && !localSeat) {
          const desiredMotion: StudioMotionKind = nextMoving ? (sprint ? "run" : "walk") : localState;
          localMotion = requestMotionState(localMotion, desiredMotion, time);
          if (motionOneShotFinished(localMotion, time)) localMotion = requestMotionState(localMotion, "idle", time);
          if (!reducedMotion.matches) {
            const motionSample = sampleMotionRender(localMotion, time);
            localSprite.y += motionSample.offsetYPx;
            localSprite.angle += motionSample.rotationDeg + (motionSample.tiltRad * 180) / Math.PI;
            if (motionSample.scaleY !== 1) localSprite.setScale(localSprite.scaleX, localSprite.scaleX * motionSample.scaleY);
          }
        }
        // 고스트 모드 (트랙1 렌더링): 반투명 + 그림자 옅게. 물리적 통과 판정은 트랙3 담당.
        localSprite.setAlpha(ghostActive ? STUDIO_GHOST_SPRITE_ALPHA : 1);
        localShadow.setAlpha(ghostActive ? 0.1 : 0.28);
        // 스쿼시 & 스트레치: 이동 방향 축을 따라 늘어나고 가감속이 변형에 실린다 (절차 근사).
        // 여기에 접지 스쿼시(걷기)와 절차적 깜빡임(대기)을 같은 위상 체계로 합성한다.
        // 즉응형(squashScale 0)은 몸을 찌그러뜨리지 않는다: 움직임은 걸음 프레임과 위아래 bob만으로 읽히게 한다.
        const rawSquash = locomotionDirectionalSquashStretch(motion.velocity, previousVelocity, dt, config.maxSpeed, reducedMotion.matches);
        const rawGaitSquash = studioGaitSquashScale(localDistance, localGaitStride, nextMoving, reducedMotion.matches);
        const squash = locomotion.squashScale === 1 ? rawSquash
          : { scaleX: scaleAroundOne(rawSquash.scaleX, locomotion.squashScale), scaleY: scaleAroundOne(rawSquash.scaleY, locomotion.squashScale) };
        const gaitSquash = locomotion.squashScale === 1 ? rawGaitSquash
          : { scaleX: scaleAroundOne(rawGaitSquash.scaleX, locomotion.squashScale), scaleY: scaleAroundOne(rawGaitSquash.scaleY, locomotion.squashScale) };
        const localBlinkY = !nextMoving && !localSeat
          ? studioBlinkScaleY(time, studioSmoothingPhaseSeed(identityRef.current), reducedMotion.matches) : 1;
        localSprite.setScale(localSprite.scaleX * squash.scaleX * gaitSquash.scaleX, localSprite.scaleY * squash.scaleY * gaitSquash.scaleY * localBlinkY);
        // 트랙1 모션 렌더러 연결 지점 (StudioMotionRequest 계약)
        _lastMotionRequest = buildStudioMotionRequest({
          pose: poseFrame.pose,
          locomotionMode,
          speed: feelSpeed,
          facing,
          walkPhase,
          poseBlend: poseFrame.poseBlend,
          squashX: squash.scaleX,
          squashY: squash.scaleY,
          leanDegrees,
          breathOffset: breathY,
          ghost: ghostActive,
        });
        localSprite.setDepth(studioTownDepthForPoint(manifest, localGroundPoint, 1_001));
        localShadow.setPosition(localShadowPoint.x, localShadowPoint.y + 1);
        const shadowScale = studioGaitShadowScale(localDistance, localGaitStride, nextMoving, reducedMotion.matches);
        localShadow.setVisible(!localSeat).setScale(shadowScale, 1);
        localShadow.setDepth(studioTownDepthForPoint(manifest, rendered, 990));
        // 발밑 연출: 먼지·발걸음 조각·미끄럼·급정지 퍼프·달리기 잔상(캠퍼스는 바닥 재질별 색).
        if (motionFeel && !localSeat) {
          motionFrame.time = time;
          motionFrame.deltaSeconds = dt;
          motionFrame.x = localShadowPoint.x;
          motionFrame.y = localShadowPoint.y;
          motionFrame.depth = localSprite.depth;
          motionFrame.speed = speed;
          motionFrame.sprintSpeed = sprintSpeed;
          motionFrame.inputSpeed = config.maxSpeed * Math.min(1, Math.hypot(ix, iy));
          motionFrame.surface = (campusFloorMap && studioCampusFloorSurface(campusFloorMap, rendered.x, rendered.y))
            || studioMotionFeelTerrainSurface(terrain.kind);
          motionFrame.particleDensity = worldFeel.effective.particleDensity * currentQualityProfile.particleRatio
            * (experienceRef.current.effectLevel === "low" ? 0.5 : 1);
          motionFrame.reducedMotion = reducedMotion.matches || worldFeel.effective.reducedMotion;
          motionFeel.step(motionFrame, localSprite);
        }
        const overlayScale = studioSceneOverlayScale(actorVisualScale, this.cameras.main.zoom, viewport.ratio);
        // 내 이름표도 집중·검토·자리 비움 상태를 같은 bt 라벨과 색 점으로 보여 준다.
        const selfNameplate = studioVirtualNameplatePresentation({
          name: displayNameRef.current, sessionId: "self", duplicateCount: 1, distance: 0, mode: "full",
          activity, userStatus: snapshotRef.current.self.userStatus, translate: btRef.current,
        });
        localLabel.setText(selfNameplate.text).setVisible(true).setAlpha(1).setScale(overlayScale);
        const localHeadY = localDisplay.y - localSprite.displayHeight * localSprite.originY;
        const localLabelOffset = localLabel.displayHeight + 6 * overlayScale;
        localLabel.setPosition(localDisplay.x, localSeat || actorVisualScale < 1 ? localHeadY - localLabelOffset : localDisplay.y + 12).setDepth(localSeat ? 160_000 : Math.round(localVisualPoint.y) + 1_002);
        const selfBubbleBase = localHeadY - (localSeat || actorVisualScale < 1 ? localLabelOffset + 4 * overlayScale : 4);
        const selfEmoteHeight = emotes?.place("self", localDisplay.x,
          selfBubbleBase, overlayScale, time, reducedMotion.matches) ?? 0;
        // 내 말풍선 우선순위: 채팅 말풍선 → 프레즌스 말풍선. 프레즌스 말풍선은 송신 측 TTL과 함께 페이드 아웃한다.
        const selfBubble = snapshotRef.current.self.bubble;
        if (selfChatBubbleText) {
          speech?.show("self", selfChatBubbleText, "person");
          speech?.place("self", localDisplay.x, selfBubbleBase - selfEmoteHeight, overlayScale);
        } else if (selfBubble) {
          speech?.showTimed("self", selfBubble, "person", STUDIO_PRESENCE_BUBBLE_TTL_MS, time);
          speech?.place("self", localDisplay.x, selfBubbleBase - selfEmoteHeight, overlayScale, true, time);
        } else speech?.hide("self");
        decorationRuntime?.syncActor(
          identityRef.current, localSprite, localLabel, localVisualPoint,
          localSeatRequested?.facing ?? localPoseOverride?.facing ?? facing, nextMoving, localResolved, time,
        );
        // fx 배우 추적: 든 커피 잔·무대 발표 스포트라이트는 최종 변환이 정해진 뒤에 붙인다.
        interactionFx?.trackActor("self", localSprite, localGroundPoint.x, localGroundPoint.y, facing, shownLocalEmote, true);
        const duplicateNames = new Map<string, number>();
        for (const name of [displayNameRef.current, ...[...peers.values()].map((peer) => peer.displayName)]) {
          duplicateNames.set(name, (duplicateNames.get(name) ?? 0) + 1);
        }
        const nameplateCandidates: Array<{ id: string; x: number; y: number; width: number; height: number; priority: number }> = [];
        const nameplateBases = new Map<string, {
          label: import("phaser").GameObjects.Text; x: number; y: number; status: StudioVirtualNameplateStatus | null;
        }>();
        nameplateCandidates.push({ id: "self", x: localLabel.x, y: localLabel.y, width: localLabel.displayWidth, height: localLabel.displayHeight, priority: 100 });
        nameplateBases.set("self", { label: localLabel, x: localLabel.x, y: localLabel.y, status: selfNameplate.status });

        for (const [peerId, visual] of peers) {
          // 입·퇴장 페이드: 등장은 부드럽게 차오르고, 퇴장은 페이드가 끝난 시점에 파괴한다.
          const presenceFade = studioPeerPresenceFade({
            spawnedAt: visual.spawnedAt,
            leavingAt: visual.leavingAt,
            now: time,
            reducedMotion: reducedMotion.matches,
            effectsSuppressed: experienceRef.current.effectLevel === "low",
          });
          if (visual.leavingAt !== null && presenceFade <= 0) {
            destroyPeerVisual(peerId, visual);
            continue;
          }
          const target = visual.timeline.sample(Date.now()) ?? {
            x: visual.targetX,
            y: visual.targetY,
            moving: visual.moving,
            facing: visual.facing,
          };
          const previousPoint = visual.sprite.getData("previousGroundPoint") as StudioVirtualSpacePoint | undefined;
          const distance = previousPoint ? Math.hypot(target.x - previousPoint.x, target.y - previousPoint.y) : 0;
          visual.sprite.setData("previousGroundPoint", { x: target.x, y: target.y });
          // walkDistance는 아래 위치 결정 뒤 "실제로 그려진 변위"로 누적한다 (목표점 델타는 패킷 간격으로 점프한다).
          const peerResolved = resolveStudioCharacterAppearance(visual, peerId);
          const peerSkin = studioCharacterSkinForArtStyle(peerResolved.skin, artStyle);
          const peerSeatRequested = !target.moving && resolveStudioCharacterAppearance(visual, peerId, "sit").clip === "sit" ? poseRef.current.seatedActors.find((actor) => actor.id === peerId) : undefined;
          const peerSeat = scene.textures.exists(studioCharacterPoseTextureKey(peerSkin, "sit")) ? peerSeatRequested : undefined;
          const peerEmote = emotes?.activeId(`peer:${peerId}`, time) ?? null;
          const peerEmotePose = target.moving || peerSeatRequested ? null : emotes?.pose(`peer:${peerId}`, time, reducedMotion.matches) ?? null;
          visual.sprite.setData("actorReaction", peerEmote).setData("actorUserStatus", visual.userStatus);
          const peerWaving = poseRef.current.waveActorIds.includes(peerId) || peerEmote === "wave";
          const peerGroundPoint = peerSeat?.anchorPoint ?? target;
          const peerVisualPoint = studioProjectTownPoint(manifest, peerGroundPoint);
          // main 이모트 렌더 힌트: 춤·환호는 몸을 띄우고 절·수면은 낮춘다(이동·앉기·모션 줄이기에서는 쓰지 않는다).
          const presenceBob = target.moving || peerSeatRequested || reducedMotion.matches ? 0 : studioPresenceEmoteBob(visual.presenceEmote);
          // 마이크로 모션: 걷기는 누적 거리와 동기된 게이트 bob, 대기는 캐릭터별 위상의 호흡을 얹는다.
          // 피어 위치 보간(타임라인·지터 감쇠)은 그대로 두고 표시 오프셋만 더한다.
          const peerWalkDistance = Number(visual.sprite.getData("walkDistance") ?? 0);
          // 프레임 선택과 같은 유효 보폭을 써야 bob과 발 접지의 위상이 어긋나지 않는다.
          const peerGaitStride = studioCadenceLimitedStride(
            studioEffectiveGaitStride(
              visual.sprite.getData("gaitDistancePerCycle") as number | undefined,
              studioCharacterWalkClip(peerSkin, target.facing)?.distancePerCycle),
            playerLocomotion.walkSpeed, locomotion);
          visual.sprite.setData("gaitStrideOverride", locomotion.maxGaitCyclesPerSecond === null ? undefined : peerGaitStride);
          const peerGaitRaw = studioGaitBodyOffset(peerWalkDistance, peerGaitStride,
            target.moving, reducedMotion.matches);
          const peerGait = locomotion.inertial ? peerGaitRaw
            : { offsetX: peerGaitRaw.offsetX * locomotion.gaitSwayScale, offsetY: peerGaitRaw.offsetY * locomotion.gaitBobScale };
          const peerBreathY = !target.moving && !peerSeatRequested && !peerEmotePose && presenceBob === 0
            ? breathOffset(studioBreathPhaseAt(time, studioSmoothingPhaseSeed(peerId)), "idle")
            : 0;
          const peerIdleSway = !target.moving && !peerSeatRequested && !peerEmotePose && presenceBob === 0
            ? studioIdleSwayOffsetX(time, studioSmoothingPhaseSeed(peerId), reducedMotion.matches) : 0;
          // 자리 비움은 몸짓으로도 읽히게: 긴 주기로 고개가 살짝 떨어졌다 돌아오는 졸기를 얹는다.
          const peerDoze = visual.activity === "away" && !target.moving && !peerSeatRequested && !peerEmotePose
            ? studioAwayDozeMotion(time, studioSmoothingPhaseSeed(peerId), reducedMotion.matches) : null;
          // 전파된 충돌 반발: 같은 감쇠 곡선으로 재생한 표시 오프셋(흡수 창이 지나면 0).
          const peerImpact = peerImpactOffsetAt(visual.impactVx, visual.impactVy, time - visual.impactAt,
            { suppressed: reducedMotion.matches || experienceRef.current.effectLevel === "low" });
          const peerTargetX = peerVisualPoint.x + peerGait.offsetX + peerIdleSway + (peerEmotePose?.bodyX ?? 0) + peerImpact.x;
          const peerTargetY = peerVisualPoint.y + peerGait.offsetY + (peerEmotePose?.bodyY ?? 0) + presenceBob + peerBreathY
            + (peerDoze?.offsetY ?? 0) + peerImpact.y;
          const peerBeforeX = visual.sprite.x;
          const peerBeforeY = visual.sprite.y;
          if (distance >= 128) {
            // 텔레포트급 점프는 즉시 스냅
            visual.sprite.setPosition(peerTargetX, peerTargetY);
          } else {
            // 피어 스냅샷 지터 감쇠: 작은 흔들림은 무시하고 큰 이동만 따라간다(즉응형은 데드존을 좁혀 느린 이동이 끊겨 보이지 않게 한다)
            visual.sprite.setPosition(
              visual.sprite.x + dampPeerOffset(peerTargetX - visual.sprite.x, locomotion.peerDeadzonePx),
              visual.sprite.y + dampPeerOffset(peerTargetY - visual.sprite.y, locomotion.peerDeadzonePx),
            );
          }
          // 게이트 위상은 목표점이 아니라 실제로 그려진 변위로 누적한다: 패킷 간격으로
          // 뭉텅이 점프하던 다리 프레임이 몸의 감쇠 이동과 같은 리듬으로 진행한다.
          const peerRenderedStep = Math.hypot(visual.sprite.x - peerBeforeX, visual.sprite.y - peerBeforeY);
          if (peerRenderedStep > 0 && peerRenderedStep < 128) {
            visual.sprite.setData("walkDistance", peerWalkDistance + peerRenderedStep);
          }
          visual.sprite.setData("seatAttached", Boolean(peerSeat));
          const peerState = target.moving ? "walk" : peerSeatRequested ? "sit" : peerWaving ? "wave" : activityState(false, visual.nearby, visual.activity);
          spriteCrossfades?.capture(visual.sprite);
          applyAvatarVisual(visual.sprite, visual, peerSeatRequested?.facing ?? studioEmoteFacing(peerEmotePose) ?? target.facing, peerState, peerId);
          spriteCrossfades?.commit(visual.sprite, time, crossfadeEnabled);
          const peerRockAngle = studioGaitRockAngle(peerWalkDistance, peerGaitStride, target.moving, reducedMotion.matches) * locomotion.gaitRockScale;
          if (target.moving && !reducedMotion.matches && !scene.anims.exists(walkAnimationKey(peerSkin, target.facing))) {
            visual.sprite.setAngle(Math.sin(time * 0.017 + visual.targetX * 0.01) * 0.65 + peerRockAngle);
          } else {
            visual.sprite.setAngle((peerEmotePose?.bodyAngle ?? 0) + peerRockAngle + (peerDoze?.angleDegrees ?? 0));
          }
          // 2차 모션 합성: 걷기는 접지 스쿼시, 대기는 절차적 깜빡임. 표시 스케일은 매 프레임
          // applyAvatarVisual이 되돌리므로 그 뒤에 곱해야 한다.
          const peerSquashRaw = studioGaitSquashScale(peerWalkDistance, peerGaitStride, target.moving, reducedMotion.matches);
          const peerSquash = locomotion.squashScale === 1 ? peerSquashRaw
            : { scaleX: scaleAroundOne(peerSquashRaw.scaleX, locomotion.squashScale), scaleY: scaleAroundOne(peerSquashRaw.scaleY, locomotion.squashScale) };
          const peerBlinkY = !target.moving && !peerSeat
            ? studioBlinkScaleY(time, studioSmoothingPhaseSeed(peerId), reducedMotion.matches) : 1;
          if (peerSquash.scaleX !== 1 || peerSquash.scaleY !== 1 || peerBlinkY !== 1) {
            visual.sprite.setScale(visual.sprite.scaleX * peerSquash.scaleX, visual.sprite.scaleY * peerSquash.scaleY * peerBlinkY);
          }
          visual.sprite.setDepth(studioTownDepthForPoint(manifest, peerGroundPoint, 1_001));
          const peerHeadY = visual.sprite.y - visual.sprite.displayHeight * visual.sprite.originY;
          const nameplate = studioVirtualNameplatePresentation({
            name: visual.displayName,
            sessionId: peerId,
            duplicateCount: duplicateNames.get(visual.displayName) ?? 1,
            distance: Math.hypot(target.x - currentPoint.x, target.y - currentPoint.y),
            mode: experienceRef.current.nameplateMode,
            important: bridge.getFollowingPeer() === peerId || visual.nearby,
            activity: visual.activity,
            userStatus: visual.userStatus,
            emote: studioPresenceEmoteIndicator(visual.presenceEmote),
            typing: visual.typing,
            translate: btRef.current,
          });
          visual.label.setText(nameplate.text).setScale(Math.max(actorVisualScale < 1 ? 1 : 0, nameplate.scale) * overlayScale);
          const peerLabelOffset = visual.label.displayHeight + 6 * overlayScale;
          const peerLabelY = peerSeat || actorVisualScale < 1 ? peerHeadY - peerLabelOffset : visual.sprite.y + 18;
          const peerVisible = peerInterest.activeIds.has("peer:" + peerId);
          // 관심 컬링도 즉시 토글이 아니라 가시성 페이드를 거친다 (NPC와 같은 상태 머신).
          // 논리 판정(peerVisible)은 그대로 두고, 그리기·말풍선·이름표는 페이드가 끝날 때까지 유지한다.
          const peerFade = transitionStudioActorVisibilityFade(peerVisibilityFades.get(peerId) ?? null, peerVisible, time, {
            reducedMotion: reducedMotion.matches,
            effectsSuppressed: experienceRef.current.effectLevel === "low",
          });
          peerVisibilityFades.set(peerId, peerFade);
          const peerFadeAlpha = studioActorVisibilityFadeAlpha(peerFade, time);
          const peerRendered = studioActorVisibilityFadeRendering(peerFade, time);
          visual.label.setPosition(visual.sprite.x, peerLabelY)
            .setDepth(peerSeat ? 160_000 : Math.round(visual.sprite.y) + 1_002)
            .setAlpha(nameplate.alpha * presenceFade * peerFadeAlpha);
          const peerBubbleBase = peerHeadY - (peerSeat || actorVisualScale < 1 ? peerLabelOffset + 4 * overlayScale : 4);
          const peerEmoteHeight = emotes?.place(`peer:${peerId}`, visual.sprite.x, peerBubbleBase, overlayScale, time, reducedMotion.matches, peerRendered) ?? 0;
          // 말풍선 우선순위: 채팅 말풍선 → 프레즌스 말풍선 → 입력 중(···) 표시.
          // 프레즌스 말풍선은 표시 시간을 송신 측 TTL과 같게 잡아 끝에서 함께 페이드 아웃한다.
          if (visual.chatBubble && peerRendered) {
            speech?.show(`peer:${peerId}`, visual.chatBubble, "person");
            speech?.place(`peer:${peerId}`, visual.sprite.x, peerBubbleBase - peerEmoteHeight, overlayScale);
          } else if (visual.bubble && peerRendered) {
            speech?.showTimed(`peer:${peerId}`, visual.bubble, "person", STUDIO_PRESENCE_BUBBLE_TTL_MS, time);
            speech?.place(`peer:${peerId}`, visual.sprite.x, peerBubbleBase - peerEmoteHeight, overlayScale, true, time);
          } else if (visual.typing && peerRendered) {
            // 입력 중에는 "···" 말풍선으로 바꾼다. 타이핑이 끝나면 다음 상태로 넘어간다.
            speech?.show(`peer:${peerId}`, "···", "person");
            speech?.place(`peer:${peerId}`, visual.sprite.x, peerBubbleBase - peerEmoteHeight, overlayScale);
          } else speech?.hide(`peer:${peerId}`);
          const labelVisible = peerRendered && nameplate.visible;
          visual.sprite.setVisible(peerRendered);
          // 자리 비움 0.62에 입·퇴장 페이드와 관심 가시성 페이드를 곱한다 (동기화 시점 고정값에서 매 프레임 합성으로 이관).
          visual.sprite.setAlpha((visual.activity === "away" ? 0.62 : 1) * presenceFade * peerFadeAlpha);
          visual.label.setVisible(labelVisible);
          if (labelVisible) {
            nameplateCandidates.push({ id: peerId, x: visual.label.x, y: visual.label.y, width: visual.label.displayWidth, height: visual.label.displayHeight, priority: visual.nearby ? 30 : 10 });
            nameplateBases.set(peerId, { label: visual.label, x: visual.label.x, y: visual.label.y, status: nameplate.status });
          }
          decorationRuntime?.syncActor(
            peerId, visual.sprite, visual.label, peerVisualPoint,
            peerSeatRequested?.facing ?? target.facing, target.moving, peerResolved, time,
          );
          interactionFx?.trackActor(peerId, visual.sprite, target.x, target.y, target.facing, peerEmote, peerRendered);
        }
        const tourRequest = guideTourRef.current;
        if ((tourRequest?.id ?? null) !== lastGuideRequestId) {
          lastGuideRequestId = tourRequest?.id ?? null;
          if (tourRequest) npcDirector.startGuideTour(tourRequest, identityRef.current); else npcDirector.cancelGuideTour();
        }
        const npcViews = npcDirector.advance(dt, {
          atmosphere: atmosphereRef.current,
          reducedMotion: reducedMotion.matches,
          focused: activity === "focused" || blocked,
          mobile: parent.clientWidth < 600,
          eventActive: studioVirtualDayPhase(time) === "dusk" || studioVirtualDayPhase(time) === "night",
          precipitation: Math.floor(time / 45_000) % 4 === 2,
          viewport: this.cameras.main.worldView,
          people: [
            { id: identityRef.current, point: currentPoint, velocity: motion.velocity, focused: activity === "focused" || blocked },
            ...[...peers].map(([id, peer]) => ({
              id, point: { x: peer.targetX, y: peer.targetY }, focused: peer.activity === "focused",
              velocity: peer.moving ? {
                x: peer.facing === "left" ? -STUDIO_VIRTUAL_SPACE_WALK_SPEED : peer.facing === "right" ? STUDIO_VIRTUAL_SPACE_WALK_SPEED : 0,
                y: peer.facing === "up" ? -STUDIO_VIRTUAL_SPACE_WALK_SPEED : peer.facing === "down" ? STUDIO_VIRTUAL_SPACE_WALK_SPEED : 0,
              } : { x: 0, y: 0 },
            })),
          ],
        });
        const mobileNameplates = parent.clientWidth < 600;
        const nearestMobileNpcId = mobileNameplates && npcViews.length > 0
          ? npcViews.reduce((nearest, candidate) => {
              const nearestDistance = Math.hypot(nearest.point.x - currentPoint.x, nearest.point.y - currentPoint.y);
              const candidateDistance = Math.hypot(candidate.point.x - currentPoint.x, candidate.point.y - currentPoint.y);
              return candidateDistance < nearestDistance ? candidate : nearest;
            }).id
          : null;
        const tourState = npcDirector.guideTourState;
        if (worldReadyForHud && callbacksRef.current.onNearbyNpcsChange) {
          const nearbyCandidates = studioNearbyNpcCandidates(npcViews, currentPoint);
          const key = studioNearbyNpcIdsKey(nearbyCandidates.map((candidate) => candidate.view));
          if (key !== nearbyNpcKey) {
            nearbyNpcKey = key;
            callbacksRef.current.onNearbyNpcsChange(nearbyCandidates.flatMap(({ view, distance }): StudioVirtualSpaceNearbyNpc[] => {
              const npc = npcs.get(view.id);
              if (!npc) return [];
              const identity = studioNpcLabel(npc.definition);
              const doing = studioNpcActivityLabel(npc.definition, view.phase);
              return [{ id: view.id, npc: npc.definition, labelKo: identity.ko, labelEn: identity.en,
                activityKo: doing.ko, activityEn: doing.en, skinKey: npc.definition.skinKey, distance,
                interaction: studioNpcInteraction(manifest, npc.definition) }];
            }));
          }
        }
        const npcInterest = studioTownInterestSnapshot(manifest, currentPoint, npcViews.map((view) => ({
          id: "npc:" + view.id, point: view.point, kind: "npc" as const, important: view.id === tourState?.guideId,
        })), currentQualityProfile.interestRadius);
        let visibleNpcCount = 0;
        const worldView = this.cameras.main.worldView;
        const chatterActors: StudioNpcChatterActor[] = [];
        for (const view of npcViews) {
          const npc = npcs.get(view.id);
          if (!npc) continue;
          chatterActors.push({
            id: view.id, role: studioNpcRole(npc.definition), point: view.point, phase: view.phase, greeting: view.greeting,
            visible: view.point.x >= worldView.x && view.point.x <= worldView.right && view.point.y >= worldView.y && view.point.y <= worldView.bottom,
          });
        }
        const chatterQuiet = blocked || atmosphereRef.current === "focus" || activity === "focused" || activity === "away";
        chatterBubbles = chatter.step({ time, actors: chatterActors, quiet: chatterQuiet, reducedMotion: reducedMotion.matches });
        for (const reaction of pendingEmoteReactions.splice(0)) {
          chatter.reactToPlayerEmote(reaction.emote, time, reaction.point ?? currentPoint, chatterActors, chatterQuiet);
        }
        for (const response of chatter.dueResponses(time)) emotes?.play(`npc:${response.npcId}`, response.emote, time, "npc");
        const speechByNpc = new Map(chatterBubbles.map((bubble) => [bubble.npcId, bubble] as const));
        // 매 프레임 JSON 직렬화 대신 바뀔 수 있는 필드만 이은 짧은 키로 변화를 비교한다.
        const tourKey = tourState
          ? `${tourState.requestId}|${tourState.guideId}|${tourState.status}|${tourState.stopIndex}|${tourState.stopCount}|${tourState.stopAction ?? ""}` : "";
        if (tourState && tourKey !== lastGuideState) { lastGuideState = tourKey; callbacksRef.current.onGuideTourChange?.(tourState); }
        // 페이드아웃 동시 상한: 이미 퇴장 중인 NPC가 상한에 닿아 있으면 새 퇴장은 즉시 숨김으로
        // 처리해 그리기 상한(래칫)을 지킨다. 퇴장 중인 NPC는 아래 상한 카운트에 이미 빠져 있다.
        let npcFadeOutsInFlight = 0;
        for (const fadeState of npcVisibilityFades.values()) {
          if (!fadeState.targetVisible && studioActorVisibilityFadeAlpha(fadeState, time) > 0) npcFadeOutsInFlight += 1;
        }
        for (const view of npcViews) {
          const npc = npcs.get(view.id);
          if (!npc) continue;
          const importantNpc = view.id === tourState?.guideId;
          const npcVisible = importantNpc || (npcInterest.activeIds.has("npc:" + view.id) && visibleNpcCount < maxActiveNpcs);
          if (npcVisible) visibleNpcCount += 1;
          // 관심 경계 팝 방지: 자격이 바뀌면 즉시 토글 대신 알파 페이드로 등장·퇴장한다.
          // 퇴장이 끝날 때까지 몸은 계속 그리되 상한 카운트에는 넣지 않아 래칫은 그대로 유지된다.
          const previousNpcFade = npcVisibilityFades.get(view.id) ?? null;
          const npcFade = transitionStudioActorVisibilityFade(previousNpcFade, npcVisible, time, {
            reducedMotion: reducedMotion.matches,
            effectsSuppressed: experienceRef.current.effectLevel === "low",
            instant: !npcVisible && npcFadeOutsInFlight >= STUDIO_ACTOR_VISIBILITY_MAX_FADE_OUTS,
          });
          if (previousNpcFade?.targetVisible && !npcFade.targetVisible && npcFade.fromAlpha > 0) npcFadeOutsInFlight += 1;
          npcVisibilityFades.set(view.id, npcFade);
          const npcFadeAlpha = studioActorVisibilityFadeAlpha(npcFade, time);
          const npcRendered = studioActorVisibilityFadeRendering(npcFade, time);
          npc.sprite.setVisible(npcRendered);
          npc.shadow.setVisible(npcRendered);
          if (!npcRendered) {
            npc.label.setVisible(false);
            emotes?.place(`npc:${view.id}`, 0, 0, 1, time, reducedMotion.matches, false);
            speech?.hide(`npc:${view.id}`);
            continue;
          }
          npc.phase = view.phase;
          npc.groundPoint = view.point;
          const attached = view.seatAttachmentPoint && scene.textures.exists(studioCharacterPoseTextureKey(npc.skin, "sit"));
          const groundPoint = attached ? view.seatAttachmentPoint! : view.point;
          const visualPoint = studioProjectTownPoint(manifest, groundPoint);
          const npcEmote = emotes?.activeId(`npc:${view.id}`, time) ?? null;
          const npcEmotePose = view.moving || attached ? null : emotes?.pose(`npc:${view.id}`, time, reducedMotion.matches) ?? null;
          // 표시 전용 지수 감쇠: 디렉터 60Hz 보간의 계단 이동과 웨이포인트 방향 전환의 꺾임을 둥글게 한다.
          // 시간상수는 로컬과 같은 속도 적응 규칙 — 디렉터 뷰가 노출한 현재 속도로 정한다. 좌석 부착 시에는 스냅한다.
          const npcDisplay = attached ? visualPoint : dampStudioDisplayPoint(npcDisplayPoints.get(view.id) ?? null,
            visualPoint, dt, { enabled: !reducedMotion.matches, tauSeconds: studioDisplayDampTauSeconds(view.speed) });
          if (!attached) npcDisplayPoints.set(view.id, npcDisplay);
          // 마이크로 모션: 걷기는 보행 거리와 동기된 게이트 bob(로컬·피어와 같은 함수), 대기는 NPC별 위상의 호흡.
          const npcGaitStride = studioEffectiveGaitStride(undefined,
            studioCharacterWalkClip(npc.skin, view.facing)?.distancePerCycle);
          const npcGait = studioGaitBodyOffset(view.distance, npcGaitStride,
            view.moving, reducedMotion.matches);
          const npcBreathY = !view.moving && !attached && !npcEmotePose
            ? breathOffset(studioBreathPhaseAt(time, studioSmoothingPhaseSeed(view.id)), "idle")
            : 0;
          const npcIdleSway = !view.moving && !attached && !npcEmotePose
            ? studioIdleSwayOffsetX(time, studioSmoothingPhaseSeed(view.id), reducedMotion.matches) : 0;
          const npcRockAngle = studioGaitRockAngle(view.distance, npcGaitStride, view.moving, reducedMotion.matches);
          npc.sprite.setPosition(npcDisplay.x + npcGait.offsetX + npcIdleSway + (npcEmotePose?.bodyX ?? 0),
            npcDisplay.y + npcGait.offsetY + (npcEmotePose?.bodyY ?? 0) + npcBreathY)
            .setAngle((npcEmotePose?.bodyAngle ?? 0) + npcRockAngle)
            .setDepth(studioTownDepthForPoint(manifest, groundPoint, 1_000)).setData("seatAttached", Boolean(attached));
          npc.sprite.setData("activityStage", view.activityStage).setData("activityAnchorId", view.activityAnchorId);
          npc.sprite.setData("walkDistance", view.distance).setData("actorReaction", npcEmote).setData("actorNpcPhase", view.phase);
          // 다가온 사람을 돌아본다(서 있을 때만). 대화 중(HUD 대화 포커스)인 NPC는 말하는 동작을 한다.
          const npcGap = Math.hypot(view.point.x - currentPoint.x, view.point.y - currentPoint.y);
          const lookAtPlayer = !view.moving && !attached && !blocked && npcGap < NPC_LOOK_DISTANCE;
          const talking = lookAtPlayer && conversationFocus !== null
            && Math.hypot(conversationFocus.x - view.point.x, conversationFocus.y - view.point.y) < 32;
          // 가시성 페이드 알파: 크로스페이드 런타임이 소유자 알파를 곱하므로 상태 전이 페이드와 함께 실린다.
          npc.sprite.setAlpha(npcFadeAlpha);
          spriteCrossfades?.capture(npc.sprite);
          applySpriteVisual(npc.sprite, npc.skin,
            studioEmoteFacing(npcEmotePose) ?? (lookAtPlayer ? studioFacingToward(currentPoint.x - view.point.x, currentPoint.y - view.point.y) : view.facing),
            npcEmote === "wave" && !view.moving && !attached ? "wave" : talking ? "talk" : view.animation);
          spriteCrossfades?.commit(npc.sprite, time, crossfadeEnabled);
          // 2차 모션 합성: 걷기는 접지 스쿼시, 대기는 절차적 깜빡임 (NPC도 사람과 같은 리듬 체계).
          const npcSquash = studioGaitSquashScale(view.distance, npcGaitStride, view.moving, reducedMotion.matches);
          const npcBlinkY = !view.moving && !attached
            ? studioBlinkScaleY(time, studioSmoothingPhaseSeed(view.id), reducedMotion.matches) : 1;
          if (npcSquash.scaleX !== 1 || npcSquash.scaleY !== 1 || npcBlinkY !== 1) {
            npc.sprite.setScale(npc.sprite.scaleX * npcSquash.scaleX, npc.sprite.scaleY * npcSquash.scaleY * npcBlinkY);
          }
          npc.shadow.setPosition(npcDisplay.x, npcDisplay.y + 1).setDepth(studioTownDepthForPoint(manifest, view.point, 990)).setVisible(!attached)
            .setAlpha(npcFadeAlpha);
          const headY = npc.sprite.y - npc.sprite.displayHeight * npc.sprite.originY;
          const identity = studioNpcLabel(npc.definition);
          const npcName = btRef.current(identity.ko, identity.en);
          const npcNameplate = studioVirtualNameplatePresentation({
            name: npcName,
            sessionId: `npc:${view.id}`,
            duplicateCount: 1,
            distance: npcGap,
            mode: experienceRef.current.nameplateMode,
            important: importantNpc || Boolean(view.greeting),
            // NPC가 쉬는 동안은 사람의 "자리 비움"이 아니라 "휴식 중"이다. 잠깐 기다리는 단계에는 상태를 붙이지 않는다.
            activity: view.phase === "inspect" ? "reviewing" : view.phase === "rest" ? "break" : "available",
            translate: btRef.current,
          });
          npc.label.setText(npcNameplate.text).setScale(Math.max(actorVisualScale < 1 ? 1 : 0, npcNameplate.scale) * overlayScale);
          const npcLabelOffset = npc.label.displayHeight + 6 * overlayScale;
          const npcLabelY = attached || actorVisualScale < 1 ? headY - npcLabelOffset : npcDisplay.y + 9;
          const npcLabelVisible = npcNameplate.visible
            && (!mobileNameplates || importantNpc || Boolean(view.greeting) || view.id === nearestMobileNpcId);
          npc.label.setPosition(npcDisplay.x, npcLabelY)
            .setDepth(attached ? 160_000 : studioTownDepthForPoint(manifest, groundPoint, 1_002))
            .setAlpha(npcNameplate.alpha * npcFadeAlpha).setVisible(npcLabelVisible);
          if (npcLabelVisible) {
            const id = `npc:${view.id}`;
            nameplateCandidates.push({
              id, x: npc.label.x, y: npc.label.y, width: npc.label.displayWidth,
              height: npc.label.displayHeight, priority: importantNpc ? 60 : view.greeting ? 35 : 8,
            });
            nameplateBases.set(id, { label: npc.label, x: npc.label.x, y: npc.label.y, status: npcNameplate.status });
          }
          const bubbleBase = headY - (attached || actorVisualScale < 1 ? npcLabelOffset + 2 * overlayScale : 4);
          const emoteHeight = emotes?.place(`npc:${view.id}`, npcDisplay.x, bubbleBase, overlayScale, time, reducedMotion.matches) ?? 0;
          // 이벤트 디렉터가 고른 인사 대사(다가오면 1회)가 잡담보다 먼저 보인다.
          const greetingLine = eventFeed.greeting(view.id, time);
          // fx가 주입한 대사(바리스타 알림 등)는 인사·잡담보다 먼저 보인다.
          const line = fxWiring?.npcLineFor(view.id, time) ?? greetingLine ?? speechByNpc.get(view.id)?.text;
          if (line) {
            speech?.show(`npc:${view.id}`, btRef.current(line.ko, line.en), "npc");
            speech?.place(`npc:${view.id}`, npcDisplay.x, bubbleBase - emoteHeight, overlayScale);
          } else speech?.hide(`npc:${view.id}`);
          interactionFx?.trackActor(view.id, npc.sprite, groundPoint.x, groundPoint.y, view.facing, npcEmote, true);
        }

        // 가장 가까운 상호작용 또는 NPC 하나에만 'X' 키캡과 바닥 링을 띄운다(interactionRings 설정과 무관).
        const promptCandidates: StudioWorldPromptCandidate[] = [];
        if (promptInteraction) {
          // 프롬프트 라벨은 fx가 상태까지 반영한다("추출 중… · 카페 카운터"). fx가 없으면 정의 라벨.
          const fxPromptLabel = interactionFx?.promptLabel(promptInteraction);
          promptCandidates.push({ id: promptInteraction.id, kind: "interaction", point: promptInteraction.point,
            radius: promptInteraction.radius, labelKo: fxPromptLabel?.ko ?? promptInteraction.labelKo, labelEn: fxPromptLabel?.en ?? promptInteraction.labelEn });
        }
        if (nearbyNpc && npcInteraction) {
          const identity = studioNpcLabel(nearbyNpc.definition);
          promptCandidates.push({ id: nearbyNpc.definition.id, kind: "npc", point: nearbyNpc.groundPoint, radius: 55,
            labelKo: `${identity.ko} · 대화`, labelEn: `${identity.en} · Talk` });
        }
        const placedCandidate = fxWiring?.placedPromptCandidate(currentPoint);
        if (placedCandidate) promptCandidates.push(placedCandidate);
        // 포털 근접 안내: 밟으면 이동하므로 키캡 없이 목적지 이름만 보여 준다.
        // 우선순위가 가장 낮아 상호작용·NPC 프롬프트가 있을 때는 양보한다.
        for (const portal of portals) promptCandidates.push(studioPortalPromptCandidate(manifest, portal));
        const promptTarget = blocked ? null : studioWorldPromptTarget(currentPoint, promptCandidates);
        const promptNpc = promptTarget?.kind === "npc" ? npcs.get(promptTarget.id) : undefined;
        promptRuntime?.update(promptTarget ? {
          target: promptTarget,
          anchorY: promptNpc
            ? promptNpc.sprite.y - promptNpc.sprite.displayHeight * promptNpc.sprite.originY - 26 * overlayScale
            : promptTarget.point.y - 58,
          label: btRef.current(promptTarget.labelKo, promptTarget.labelEn),
        } : null, time, reducedMotion.matches, overlayScale);
        // 대화할 수 있을 만큼 가까워지면 NPC 머리 위에 '!'가 뜬다(같은 NPC는 15초에 한 번).
        const promptNpcId = promptNpc ? promptNpc.definition.id : null;
        if (promptNpcId !== lastPromptNpcId) {
          lastPromptNpcId = promptNpcId;
          if (promptNpcId && time - (npcNoticedAt.get(promptNpcId) ?? -Infinity) >= NPC_NOTICE_COOLDOWN_MS) {
            npcNoticedAt.set(promptNpcId, time);
            emotes?.play(`npc:${promptNpcId}`, "exclaim", time, "npc");
          }
        }
        // 이벤트 디렉터(150ms 간격): 환영·미니게임 초대·오브젝트 강조·NPC 인사·동료 접근·타운 이벤트 → onSpaceUiEvent.
        if (worldReadyForHud && !blocked && eventFeed.due(time)) {
          const phasePreference = environmentRef.current.dayPhase;
          eventFeed.begin(time, identityRef.current, currentPoint.x, currentPoint.y, speed,
            phasePreference === "auto" ? studioVirtualDayPhase(time) : phasePreference);
          eventFeed.syncActors(peers, npcs.values(), (definition) => {
            const identity = studioNpcLabel(definition);
            return btRef.current(identity.ko, identity.en);
          });
          eventFeed.run();
        }
        if (campusRuntime && campusFrame) {
          // 캠퍼스 근접 연출(액자 스포트라이트·오락기 빛·게이트 고리·무대 조명)과 생동감(나비·새·물고기·김·반딧불).
          campusFrame.time = time;
          campusFrame.reducedMotion = reducedMotion.matches;
          campusFrame.playerX = currentPoint.x;
          campusFrame.playerY = currentPoint.y;
          const phasePreference = environmentRef.current.dayPhase;
          campusFrame.phase = phasePreference === "auto" ? studioVirtualDayPhase(time) : phasePreference;
          // 하늘 팔레트는 월드 뒤 지평선 아트워크에만 입힌다 (월드 위 전면 틴트 아님). 위상이 바뀔 때만 1회 적용.
          if (horizonArtwork && lastSkyTintPhase !== campusFrame.phase) {
            lastSkyTintPhase = campusFrame.phase;
            horizonArtwork.setTint(studioBuildingSkyTint(campusFrame.phase));
          }
          campusFrame.quality = currentQualityProfile;
          campusRuntime.update(campusFrame);
        }

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
            routeWaypoints: path.length,
            failedTextures: failedTextures.size,
            updatedAt: Date.now(),
          }));
        }

        const changed = !lastPublishedPoint || Math.hypot(localBody.x - lastPublishedPoint.x, localBody.y - lastPublishedPoint.y) > 0.02
          || nextMoving !== lastPublishedMoving || facing !== lastPublishedFacing || poseFrame.pose !== lastPublishedPose;
        const shouldPublish = changed && (time - lastPublishAt >= 80 || nextMoving !== lastPublishedMoving || Boolean(portal) || Boolean(teleportTarget));
        if (shouldPublish) {
          const point = { x: localBodyPhysics.center.x, y: localBodyPhysics.center.y };
          callbacksRef.current.onLocalState({
            point,
            facing,
            moving: nextMoving,
            zoneId: studioWorldRoomAt(manifest, point),
            pose: poseFrame.pose,
          });
          lastPublishedPoint = point;
          lastPublishAt = time;
          lastPublishedMoving = nextMoving;
          lastPublishedFacing = facing;
          lastPublishedPose = poseFrame.pose;
        }
        if (import.meta.env.DEV) {
          // 하네스(Playwright)가 배열을 만들어 둔 경우에만 프레임별 이동 궤적을 쌓는다. 응답 시간·미끄러짐·보폭 검증용이다.
          const trace = (globalThis as { __studioMotionTrace?: Array<Record<string, number | string>> }).__studioMotionTrace;
          if (trace) {
            trace.push({
              t: time, x: currentPoint.x, y: currentPoint.y, vx: motion.velocity.x, vy: motion.velocity.y,
              sx: localSprite.x, sy: localSprite.y, scaleX: localSprite.scaleX, scaleY: localSprite.scaleY, angle: localSprite.angle,
              frame: String(localSprite.frame.name), texture: localSprite.texture.key, moving: nextMoving ? 1 : 0,
              dist: localDistance, stride: localGaitStride, camX: this.cameras.main.scrollX, camY: this.cameras.main.scrollY,
            });
            if (trace.length > 2400) trace.splice(0, trace.length - 2400);
          }
        }
        if (import.meta.env.DEV && time - lastDiagnosticAt >= 250) {
          lastDiagnosticAt = time;
          parent.dataset.localX = currentPoint.x.toFixed(3);
          parent.dataset.localY = currentPoint.y.toFixed(3);
          parent.dataset.cameraScroll = `${Math.round(this.cameras.main.scrollX)},${Math.round(this.cameras.main.scrollY)},${this.cameras.main.zoom.toFixed(3)}`;
          parent.dataset.renderX = rendered.x.toFixed(3);
          parent.dataset.renderY = rendered.y.toFixed(3);
          parent.dataset.visualX = localSprite.x.toFixed(3);
          parent.dataset.visualY = localSprite.y.toFixed(3);
          parent.dataset.spriteOriginY = localSprite.originY.toFixed(6);
          parent.dataset.spriteHeight = localSprite.displayHeight.toFixed(3);
          parent.dataset.seated = String(Boolean(localSeat));
          parent.dataset.walkFrame = String(localSprite.frame.name);
          parent.dataset.pathLength = String(path.length);
          parent.dataset.loadedWalkSheets = String(this.textures.getTextureKeys().filter((key) => key.includes("walk-sheet")).length);
          parent.dataset.loadedActionSheets = String(this.textures.getTextureKeys().filter((key) => /-(talk|draw|review)-sheet-/u.test(key)).length);
          parent.dataset.walkDistance = localDistance.toFixed(2);
          parent.dataset.walkSpeed = String(playerLocomotion.walkSpeed);
          parent.dataset.gaitDistancePerCycle = String(playerLocomotion.gaitDistancePerCycle ?? "native");
          parent.dataset.pixelRatio = viewport.ratio.toFixed(2);
          parent.dataset.textResolution = String(textResolution?.current ?? 1);
          parent.dataset.localMoving = String(nextMoving);
          parent.dataset.localFacing = facing;
          parent.dataset.terrain = terrain.kind;
          parent.dataset.pathAllowed = String(studioWorldCanOccupy(navigationWorld, currentPoint));
          parent.dataset.dayPhase = environmentRef.current.dayPhase === "auto"
            ? studioVirtualDayPhase(time) : environmentRef.current.dayPhase;
          parent.dataset.weather = environmentRef.current.weather;
          parent.dataset.backdrop = environmentRef.current.backdrop;
          parent.dataset.livingWorld = String(Boolean(livingWorld));
          parent.dataset.objectPhysics = String(Boolean(objectRuntime));
          parent.dataset.decorationCount = String(decorationsRef.current.placements.length);
          parent.dataset.environmentInteractions = String(studioTownEnvironmentInteractions().length);
          parent.dataset.interestKey = peerInterest.key;
          parent.dataset.activePeerVisuals = String(peerInterest.activeIds.size);
          parent.dataset.activeNpcVisuals = String(visibleNpcCount);
          parent.dataset.maxParticles = String(Math.round(runtimeBudget.maxParticles * currentQualityProfile.particleRatio));
          parent.dataset.qualityTier = currentQualityProfile.tier;
          parent.dataset.controlMode = experienceRef.current.controlMode;
          parent.dataset.moveFeel = locomotion.feel;
          parent.dataset.gaitStride = String(Math.round(localGaitStride));
          parent.dataset.cameraPreference = experienceRef.current.cameraMode;
          parent.dataset.texture = localSprite.texture.key;
          parent.dataset.appearanceIssues = JSON.stringify(localSprite.getData("appearanceIssues") ?? []);
          parent.dataset.reaction = shownLocalEmote ?? "";
          parent.dataset.npcSpeech = JSON.stringify(chatterBubbles.map((bubble) => ({ id: bubble.npcId, ko: bubble.text.ko })));
          parent.dataset.emoteSequence = String(emotes?.sequence("self") ?? 0);
          parent.dataset.frameTime = time.toFixed(0);
          parent.dataset.emoteDebug = emotes?.debug("self") ?? "";
          parent.dataset.peers = JSON.stringify([...peers].map(([id, peer]) => ({ id, x: peer.sprite.x, y: peer.sprite.y, targetX: peer.targetX, targetY: peer.targetY, texture: peer.sprite.texture.key, reaction: emotes?.activeId(`peer:${id}`, time) ?? "" })));
          parent.dataset.npcs = JSON.stringify([...npcs].map(([id, npc]) => ({ id, x: npc.sprite.x, y: npc.sprite.y, floor: npc.groundPoint, phase: npc.phase, stage: npc.sprite.getData("activityStage"), anchor: npc.sprite.getData("activityAnchorId"), texture: npc.sprite.texture.key,
            frame: npc.sprite.frame.name, originX: npc.sprite.originX, originY: npc.sprite.originY,
            displayWidth: npc.sprite.displayWidth, displayHeight: npc.sprite.displayHeight })));
          parent.dataset.props = JSON.stringify(manifest.props.filter((prop) => prop.assetUrl).map((prop) => ({ id: prop.id, depth: studioWorldPropDepth(prop) })));
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
        loader: { timeout: 15000, maxParallelDownloads: 6 },
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
      {failure ? (
        <div className="studio-vspace-engine-message" role="alert">
          <p>{bt("공간을 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.", "The studio could not load. Check the connection and retry.")}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>{bt("다시 시도", "Retry")}</button>
        </div>
      ) : !ready ? (
        <div className="studio-vspace-engine-message" role="status">{bt("스튜디오 불러오는 중…", "Loading studio…")}</div>
      ) : null}
    </div>
  );
}
