/**
 * Local actor presentation, gait/jump/stop-settle/motion-state animation,
 * camera director follow/zoom/pan, and self nameplate/bubble updates
 * for `StudioVirtualSpacePhaserCanvas`.
 */

import type { StudioActorAuraRuntime } from "./studio-virtual-space-actor-aura-runtime";
import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import type { StudioCameraPanRuntime } from "./studio-virtual-space-camera-pan";
import { studioCharacterPoseTextureKey } from "./studio-virtual-space-character-assets";
import {
  motionOneShotFinished,
  requestMotionState,
  sampleMotionRender,
  type StudioMotionKind,
  type StudioMotionState,
} from "./studio-virtual-space-character-motion";
import {
  resolveStudioCharacterAppearance,
  studioCharacterSkinForArtStyle,
  studioCharacterWalkClip,
  type StudioCharacterSkin,
} from "./studio-virtual-space-character-skins";
import type { StudioVirtualDecorationRuntime } from "./studio-virtual-space-decoration-runtime";
import type { StudioEmoteRuntime, StudioSpeechBubbleRuntime } from "./studio-virtual-space-emote-runtime";
import type { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import type { StudioVirtualEnvironmentPreference } from "./studio-virtual-space-environment-preference";
import type { StudioVirtualExperiencePreference } from "./studio-virtual-space-experience-preference";
import { STUDIO_GHOST_SPRITE_ALPHA } from "./studio-virtual-space-ghost-mode";
import { resolveStudioHdActorTint } from "./studio-virtual-space-hd-sprite-pipeline";
import type { StudioInteractionFxRuntime } from "./studio-virtual-space-interaction-fx";
import {
  stepStudioJump,
  studioRunGaitOffset,
  triggerStudioJump,
  type createStudioJumpMotionState,
} from "./studio-virtual-space-jump-motion";
import { studioVirtualDayPhase, type StudioLivingWorldRuntime, type studioVirtualTerrainAt } from "./studio-virtual-space-living-world";
import {
  facingAngleFromVelocity,
  stepTurnAngleSmooth,
  studioLocomotionStopSettle,
  type createStudioFacingTurnState,
} from "./studio-virtual-space-locomotion-feel";
import {
  studioAwayDozeMotion,
  studioEffectiveGaitStride,
  studioGaitShadowAlpha,
  studioGaitShadowScale,
  type studioPlayerLocomotionProfile,
} from "./studio-virtual-space-locomotion-presentation";
import { studioCadenceLimitedStride } from "./studio-virtual-space-locomotion-style";
import {
  STUDIO_CAMERA_DEADZONE_RADIUS,
  advanceBreathPhase,
  advanceWalkPhase,
  applyCameraDeadzone,
  breathOffset,
  nextLocomotionMode,
  turnLeanAngle,
  type StudioLocomotionMode,
} from "./studio-virtual-space-locomotion-transitions";
import type {
  StudioVirtualSpaceFacing,
  StudioVirtualSpacePeer,
  StudioVirtualSpacePoint,
} from "./studio-virtual-space-model";
import { buildStudioMotionRequest, type StudioMotionRequest } from "./studio-virtual-space-motion-api";
import {
  studioCampusFloorSurface,
  studioMotionFeelTerrainSurface,
  type StudioMotionFeelRuntime,
  type createStudioMotionFeelFrame,
} from "./studio-virtual-space-motion-feel-runtime";
import { studioVirtualNameplatePresentation } from "./studio-virtual-space-nameplate-layout";
import {
  activityState,
  studioEmoteFacing,
  studioFacingToward,
  type PeerVisual,
  type StudioVirtualSpacePhaserCanvasProps,
} from "./studio-virtual-space-phaser-canvas-model";
import type {
  StudioPhaserApplyAvatarVisual,
  StudioPhaserNameplateBase,
  StudioPhaserNameplateCandidate,
} from "./studio-virtual-space-phaser-peer-sync";
import { studioPoseSeatAnchors, type StudioSpacePose } from "./studio-virtual-space-pose-controller";
import { STUDIO_PRESENCE_BUBBLE_TTL_MS, type StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";
import type { StudioFixedStepPose, studioRenderViewport } from "./studio-virtual-space-presentation";
import type { studioVirtualQualityProfile } from "./studio-virtual-space-quality";
import { studioSceneOverlayScale } from "./studio-virtual-space-scene-art-runtime";
import { studioProjectTownPoint, studioTownDepthForPoint } from "./studio-virtual-space-semantic-world";
import { playStudioSfxSound } from "./studio-virtual-space-sound-engine";
import type { StudioSpriteCrossfadeRuntime } from "./studio-virtual-space-sprite-crossfade-runtime";
import {
  dampStudioDisplayPoint,
  studioDisplayDampTauSeconds,
  studioSmoothingPhaseSeed,
  type StudioDisplayPoint,
} from "./studio-virtual-space-sprite-smoothing";
import type { StudioSpaceThemeKey } from "./studio-virtual-space-theme";
import type { StudioUserZoomRuntime } from "./studio-virtual-space-user-zoom";
import { applyStudioCameraFollow, fitStudioHorizonArtwork } from "./studio-virtual-space-world-camera";
import type { StudioWorldFeelController } from "./studio-virtual-space-world-feel";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import type { DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG } from "./studio-virtual-space-physics";

export interface StudioPhaserLocalPresentationState {
  facing: StudioVirtualSpaceFacing;
  localDistance: number;
  lastFootstepDistance: number;
  previousRendered: StudioVirtualSpacePoint | null;
  localDisplayPoint: StudioDisplayPoint | null;
  wasLocalSeated: boolean;
  jumpQueued: boolean;
  jumpState: ReturnType<typeof createStudioJumpMotionState>;
  lastStoppedAt: number;
  preStopSpeed: number;
  locomotionMode: StudioLocomotionMode;
  walkPhase: number;
  breathPhase: number;
  turnState: ReturnType<typeof createStudioFacingTurnState>;
  localMotion: StudioMotionState;
  lastMotionRequest: StudioMotionRequest;
}

export interface UpdateStudioPhaserLocalPresentationParams {
  readonly state: StudioPhaserLocalPresentationState;
  readonly scene: import("phaser").Scene;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly navigationWorld: StudioVirtualSpaceWorldManifest;
  readonly peers: ReadonlyMap<string, PeerVisual>;
  readonly bridge: StudioVirtualSpaceEngineBridge;
  readonly snapshotSelf: StudioVirtualSpaceSnapshot["self"];
  readonly selfIdentity: string;
  readonly selfDisplayName: string;
  readonly selfChatBubbleText: string | null;
  readonly selfCustomSheetSkin: StudioCharacterSkin | null;
  readonly localSprite: import("phaser").GameObjects.Sprite;
  readonly localShadow: import("phaser").GameObjects.Ellipse;
  readonly localLabel: import("phaser").GameObjects.Text;
  readonly localPose: StudioFixedStepPose;
  readonly currentPoint: StudioVirtualSpacePoint;
  readonly velocity: StudioVirtualSpacePoint;
  readonly inputX: number;
  readonly inputY: number;
  readonly speed: number;
  readonly feelSpeed: number;
  readonly sprint: boolean;
  readonly sprintSpeed: number;
  readonly maxSpeed: number;
  readonly feelConfig: typeof DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG & {
    readonly acceleration: number;
    readonly deceleration: number;
    readonly maxSpeed: number;
  };
  readonly moving: boolean;
  readonly nextMoving: boolean;
  readonly directInput: boolean;
  readonly blocked: boolean;
  readonly ghostActive: boolean;
  readonly snapCamera: boolean;
  readonly time: number;
  readonly deltaMs: number;
  readonly dt: number;
  readonly reducedMotion: boolean;
  readonly crossfadeEnabled: boolean;
  readonly activity: StudioVirtualSpacePeer["state"]["activity"];
  readonly zoneId: string | null;
  readonly terrain: ReturnType<typeof studioVirtualTerrainAt>;
  readonly campusFloorMap: StudioVirtualSpaceWorldManifest["tilemap"] | null;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly spaceTheme: StudioSpaceThemeKey | undefined;
  readonly actorVisualScale: number;
  readonly playerLocomotion: ReturnType<typeof studioPlayerLocomotionProfile>;
  readonly worldFeel: StudioWorldFeelController;
  readonly motionFrame: ReturnType<typeof createStudioMotionFeelFrame>;
  readonly motionFeel: StudioMotionFeelRuntime | null;
  readonly experience: StudioVirtualExperiencePreference;
  readonly environment: StudioVirtualEnvironmentPreference;
  readonly qualityProfile: ReturnType<typeof studioVirtualQualityProfile>;
  readonly selfPose: StudioVirtualSpacePhaserCanvasProps["selfPose"];
  readonly waveActorIds: readonly string[];
  readonly seatedActors: NonNullable<StudioVirtualSpacePhaserCanvasProps["seatedActors"]>;
  readonly viewport: ReturnType<typeof studioRenderViewport>;
  readonly cameraBaseZoom: number;
  readonly cameraFollows: boolean;
  readonly cameraGround: { x: number; y: number };
  readonly cameraBase: { x: number; y: number };
  readonly cameraTarget: { x: number; y: number };
  readonly cameraPan: StudioCameraPanRuntime;
  readonly userZoom: StudioUserZoomRuntime;
  readonly horizonArtwork: import("phaser").GameObjects.Image | null;
  readonly screenFixedHorizon: boolean;
  readonly applyCameraMode: (deadzoneScale?: number) => void;
  readonly applyAvatarVisual: StudioPhaserApplyAvatarVisual;
  readonly translate: (ko: string, en: string) => string;
  readonly emotes: StudioEmoteRuntime | null;
  readonly speech: StudioSpeechBubbleRuntime | null;
  readonly livingWorld: StudioLivingWorldRuntime | null;
  readonly spriteCrossfades: StudioSpriteCrossfadeRuntime | null;
  readonly actorAura: StudioActorAuraRuntime | null;
  readonly decorationRuntime: StudioVirtualDecorationRuntime | null;
  readonly interactionFx: StudioInteractionFxRuntime | null;
}

export interface UpdateStudioPhaserLocalPresentationResult {
  readonly rendered: StudioVirtualSpacePoint;
  readonly localSeat: boolean;
  readonly localGaitStride: number;
  readonly activeDayPhase: ReturnType<typeof studioVirtualDayPhase>;
  readonly shownLocalEmote: string | null;
  readonly conversationFocus: StudioVirtualSpacePoint | null;
  readonly overlayScale: number;
  readonly pose: StudioSpacePose;
  readonly duplicateNames: Map<string, number>;
  readonly nameplateCandidates: StudioPhaserNameplateCandidate[];
  readonly nameplateBases: Map<string, StudioPhaserNameplateBase>;
}

export function updateStudioPhaserLocalPresentation(
  params: UpdateStudioPhaserLocalPresentationParams,
): UpdateStudioPhaserLocalPresentationResult {
  const {
    state,
    scene,
    manifest,
    navigationWorld,
    peers,
    bridge,
    snapshotSelf,
    selfIdentity,
    selfDisplayName,
    selfChatBubbleText,
    selfCustomSheetSkin,
    localSprite,
    localShadow,
    localLabel,
    localPose,
    currentPoint,
    velocity,
    inputX,
    inputY,
    speed,
    feelSpeed,
    sprint,
    sprintSpeed,
    maxSpeed,
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
    reducedMotion,
    crossfadeEnabled,
    activity,
    zoneId,
    terrain,
    campusFloorMap,
    artStyle,
    spaceTheme,
    actorVisualScale,
    playerLocomotion,
    worldFeel,
    motionFrame,
    motionFeel,
    experience,
    environment,
    qualityProfile,
    selfPose,
    waveActorIds,
    seatedActors,
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
    translate,
    emotes,
    speech,
    livingWorld,
    spriteCrossfades,
    actorAura,
    decorationRuntime,
    interactionFx,
  } = params;
  const locomotion = worldFeel.locomotion;

  interactionFx?.beginFrame(time, scene.cameras.main.worldView, reducedMotion, qualityProfile.particleRatio);
  const localResolved = resolveStudioCharacterAppearance(snapshotSelf, selfIdentity);
  const localSkin = studioCharacterSkinForArtStyle(localResolved.skin, artStyle);
  const localSeatRequested = !nextMoving && !directInput && resolveStudioCharacterAppearance(snapshotSelf, selfIdentity, "sit").clip === "sit"
    ? seatedActors.find((actor) => actor.id === selfIdentity)
    : undefined;
  const localSeat = scene.textures.exists(studioCharacterPoseTextureKey(localSkin, "sit")) ? localSeatRequested : undefined;
  const localPoseOverride = !nextMoving && !directInput && resolveStudioCharacterAppearance(snapshotSelf, selfIdentity, "sit").clip === "sit"
    ? selfPose
    : undefined;

  const dialogueFocus = bridge.getConversationFocus();
  if (dialogueFocus && !nextMoving && !localSeatRequested && !localPoseOverride) {
    state.facing = studioFacingToward(dialogueFocus.x - currentPoint.x, dialogueFocus.y - currentPoint.y);
  }
  const shownLocalEmote = emotes?.activeId("self", time) ?? null;
  const localEmotePose = emotes?.pose("self", time, reducedMotion) ?? null;
  const localWaving = shownLocalEmote === "wave" || waveActorIds.includes(selfIdentity);

  const seatAnchors = studioPoseSeatAnchors({ seatedActors, interactionSlots: manifest.interactionSlots });
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

  const rendered = localPose.sample(scene.game.loop.time);
  if (state.previousRendered) {
    const distance = Math.hypot(rendered.x - state.previousRendered.x, rendered.y - state.previousRendered.y);
    if (distance < 64) state.localDistance += distance;
  }
  const footstepGap = terrain.kind === "shallow-water" ? 18 : sprint ? 32 : 25;
  if (nextMoving && state.localDistance - state.lastFootstepDistance >= footstepGap) {
    livingWorld?.emitFootstep(rendered, terrain, time);
    state.lastFootstepDistance = state.localDistance;
  }
  state.previousRendered = rendered;
  localSprite.setData("walkDistance", state.localDistance).setData("actorReaction", shownLocalEmote).setData("actorUserStatus", snapshotSelf.userStatus);
  localSprite.setData("seatAttached", Boolean(localSeat));

  const localEmoteFacing = localSeatRequested || localPoseOverride || nextMoving ? null : studioEmoteFacing(localEmotePose);
  const localGaitStride = studioCadenceLimitedStride(
    studioEffectiveGaitStride(
      playerLocomotion.gaitDistancePerCycle,
      studioCharacterWalkClip(selfCustomSheetSkin ?? localSkin, state.facing)?.distancePerCycle,
    ),
    playerLocomotion.walkSpeed,
    locomotion,
  );
  localSprite.setData("gaitStrideOverride", locomotion.maxGaitCyclesPerSecond === null ? undefined : localGaitStride);
  motionFrame.stepPx = localGaitStride / 2;
  spriteCrossfades?.capture(localSprite);
  applyAvatarVisual(
    localSprite,
    snapshotSelf,
    localSeatRequested?.facing ?? poseFrame.anchor?.facing ?? localPoseOverride?.facing ?? localEmoteFacing ?? state.facing,
    localState,
    selfIdentity,
  );
  spriteCrossfades?.commit(localSprite, time, crossfadeEnabled);

  applyCameraMode(locomotion.cameraDeadzoneScale);
  const cameraMode = experience.cameraMode;
  const lookAhead = (reducedMotion || cameraMode === "steady"
    ? 0
    : cameraMode === "cinematic"
      ? sprint ? 0.32 : 0.24
      : sprint ? 0.24 : 0.16) * locomotion.cameraLookAheadScale;
  const cameraInput = worldFeel.cameraInput;
  cameraInput.x = rendered.x;
  cameraInput.y = rendered.y;
  cameraInput.velocityX = velocity.x;
  cameraInput.velocityY = velocity.y;
  cameraInput.maxSpeed = sprintSpeed;
  cameraInput.roomId = zoneId;
  cameraInput.now = time;
  cameraInput.deltaSeconds = dt;
  cameraInput.lookAheadSeconds = lookAhead;
  cameraInput.reducedMotion = reducedMotion;
  cameraInput.sprinting = sprint && nextMoving;
  const conversationFocus = bridge.getConversationFocus();
  worldFeel.camera.setFocus(conversationFocus ? conversationFocus.x : null, conversationFocus?.y ?? 0);
  const directed = worldFeel.camera.step(cameraInput);
  cameraGround.x = Math.max(0, Math.min(manifest.width, directed.targetX));
  cameraGround.y = Math.max(0, Math.min(manifest.height, directed.targetY));
  const cameraVisualTarget = studioProjectTownPoint(manifest, cameraGround);
  const directedPan = directed.roomTransitioning || conversationFocus !== null || reducedMotion;
  const deadzonedTarget = directedPan || !Number.isFinite(cameraBase.x)
    ? cameraVisualTarget
    : applyCameraDeadzone({
        playerX: cameraVisualTarget.x,
        playerY: cameraVisualTarget.y,
        cameraTargetX: cameraBase.x,
        cameraTargetY: cameraBase.y,
        deadzoneRadius: STUDIO_CAMERA_DEADZONE_RADIUS * locomotion.cameraDeadzoneScale,
      });
  cameraBase.x = deadzonedTarget.x;
  cameraBase.y = deadzonedTarget.y;
  const lookAround = cameraPan.sample({
    deltaSeconds: deltaMs / 1000,
    available: cameraFollows,
    directed: directed.roomTransitioning || conversationFocus !== null,
    snap: snapCamera,
    reducedMotion,
    moving: nextMoving,
    cssToWorld: viewport.ratio / scene.cameras.main.zoom,
    base: cameraBase,
    center: scene.cameras.main.midPoint,
    view: scene.cameras.main.worldView,
    world: manifest,
  });
  cameraTarget.x = cameraBase.x + directed.shakeX + lookAround.x;
  cameraTarget.y = cameraBase.y + directed.shakeY + lookAround.y;
  if (cameraFollows) scene.cameras.main.setZoom(cameraBaseZoom * directed.zoomFactor * userZoom.sample(dt, reducedMotion));
  if (horizonArtwork && screenFixedHorizon && cameraFollows) {
    fitStudioHorizonArtwork(horizonArtwork, scene.scale.gameSize, scene.cameras.main.zoom);
  }
  const followBase = Math.min(0.6, (cameraMode === "steady" ? 0.075 : cameraMode === "cinematic" ? 0.16 : 0.12) * locomotion.cameraFollowScale);
  applyStudioCameraFollow(scene.cameras.main, {
    deltaSeconds: dt,
    followBase,
    roomTransitioning: directed.roomTransitioning,
    immediate: snapCamera || reducedMotion || lookAround.direct,
    edgeSoftening: cameraFollows,
    world: manifest,
    centerOn: snapCamera ? cameraVisualTarget : lookAround.direct ? cameraTarget : null,
  });

  const localSurface = (campusFloorMap && studioCampusFloorSurface(campusFloorMap, rendered.x, rendered.y))
    || studioMotionFeelTerrainSurface(terrain.kind);
  const localMaterial = localSurface.material ?? localSurface.surface;
  const localDisplay = (state.localDisplayPoint = dampStudioDisplayPoint(
    state.localDisplayPoint,
    studioProjectTownPoint(manifest, localSeat?.anchorPoint ?? rendered),
    dt,
    { enabled: !reducedMotion, tauSeconds: studioDisplayDampTauSeconds(speed) * locomotion.displayDampScale },
  ));
  const localGroundPoint = localSeat?.anchorPoint ?? rendered;
  const localVisualPoint = studioProjectTownPoint(manifest, localGroundPoint);
  const localShadowPoint = localDisplay;
  const localEmoteBody = localSeat || nextMoving ? null : localEmotePose;
  const isLocalSeated = Boolean(localSeat);
  if (isLocalSeated !== state.wasLocalSeated) {
    state.wasLocalSeated = isLocalSeated;
    playStudioSfxSound(isLocalSeated ? "seat-settle" : "seat-stand", 0.88);
  }
  if (state.jumpQueued) {
    state.jumpQueued = false;
    const jumpLaunch = triggerStudioJump(state.jumpState, { seated: isLocalSeated, blocked });
    state.jumpState = jumpLaunch.state;
    if (jumpLaunch.triggered) {
      playStudioSfxSound("jump", 0.9);
      motionFeel?.emitJumpDust(localShadowPoint.x, localShadowPoint.y, localSprite.depth, localMaterial, true, reducedMotion || worldFeel.effective.reducedMotion);
    }
  }
  const jumpStep = stepStudioJump(state.jumpState, dt, isLocalSeated);
  state.jumpState = jumpStep.state;
  if (jumpStep.landed) {
    playStudioSfxSound("land", 0.95);
    motionFeel?.emitJumpDust(localShadowPoint.x, localShadowPoint.y, localSprite.depth, localMaterial, false, reducedMotion || worldFeel.effective.reducedMotion);
  }
  if (moving && !nextMoving) {
    state.lastStoppedAt = time;
    state.preStopSpeed = Math.max(feelSpeed, speed);
  }
  const stopSettle = !nextMoving && !localSeat && !jumpStep.airborne
    ? studioLocomotionStopSettle(time - state.lastStoppedAt, state.preStopSpeed, maxSpeed, reducedMotion)
    : null;
  const activeDayPhase = environment.dayPhase === "auto" ? studioVirtualDayPhase(time) : environment.dayPhase;
  actorAura?.beginFrame();
  const localDoze = activity === "away" && !nextMoving && !localSeat && !localEmoteBody && !jumpStep.airborne
    ? studioAwayDozeMotion(time, studioSmoothingPhaseSeed(selfIdentity), reducedMotion)
    : null;
  state.locomotionMode = nextLocomotionMode(state.locomotionMode, feelSpeed);
  state.walkPhase = advanceWalkPhase(state.walkPhase, feelSpeed, dt, maxSpeed);
  state.breathPhase = advanceBreathPhase(state.breathPhase, dt);
  const breathY = jumpStep.airborne ? 0 : breathOffset(state.breathPhase, state.locomotionMode);
  const runGait = studioRunGaitOffset(state.localDistance, localGaitStride, {
    moving: nextMoving,
    sprinting: sprint && nextMoving,
    airborne: jumpStep.airborne,
    velocityX: velocity.x,
    reducedMotion,
  });
  const gaitY = locomotion.inertial ? runGait.offsetY : runGait.offsetY * locomotion.gaitBobScale;
  localSprite.setPosition(
    localDisplay.x + (localEmoteBody?.bodyX ?? 0),
    localDisplay.y + gaitY + jumpStep.offsetY + (localEmoteBody?.bodyY ?? 0) + breathY + (localDoze?.offsetY ?? 0) + (stopSettle?.offsetY ?? 0),
  );
  const poseTextureUsed = localSprite.getData("poseTextureUsed") === true;
  const lieFallbackAngle = poseFrame.pose === "lie" && !poseTextureUsed ? 90 : 0;
  const turnTargetAngle = feelSpeed > 4 ? facingAngleFromVelocity(velocity, state.turnState.angle) : state.turnState.angle;
  state.turnState = stepTurnAngleSmooth(state.turnState, turnTargetAngle, dt, feelSpeed, feelConfig);
  const leanDegrees = turnLeanAngle(state.turnState.angularVelocity * 180 / Math.PI) * locomotion.leanScale;
  localSprite.setAngle(
    runGait.leanDegrees + (stopSettle?.leanDeg ?? 0) + (localEmoteBody?.bodyAngle ?? 0) + lieFallbackAngle + leanDegrees + (localDoze?.angleDegrees ?? 0),
  );
  if (selfCustomSheetSkin && !localSeat) {
    const desiredMotion: StudioMotionKind = jumpStep.airborne ? "jump" : nextMoving ? (sprint ? "run" : "walk") : localState;
    state.localMotion = requestMotionState(state.localMotion, desiredMotion, time);
    if (motionOneShotFinished(state.localMotion, time)) state.localMotion = requestMotionState(state.localMotion, "idle", time);
    if (!reducedMotion) {
      const motionSample = sampleMotionRender(state.localMotion, time);
      if (!jumpStep.airborne) localSprite.y += motionSample.offsetYPx;
      localSprite.angle += motionSample.rotationDeg + (motionSample.tiltRad * 180) / Math.PI;
    }
  }
  localSprite.setAlpha(ghostActive ? STUDIO_GHOST_SPRITE_ALPHA : 1);
  localSprite.setTint(resolveStudioHdActorTint({
    phase: activeDayPhase,
    style: artStyle,
    spaceTheme,
    facing: state.facing,
    focused: activity === "focused",
    away: activity === "away",
    ghost: ghostActive,
  }));
  localShadow.setAlpha(
    ghostActive
      ? 0.1
      : studioGaitShadowAlpha(state.localDistance, localGaitStride, nextMoving && !jumpStep.airborne, reducedMotion, 0.28) * jumpStep.shadowScale,
  );
  state.lastMotionRequest = buildStudioMotionRequest({
    pose: poseFrame.pose,
    locomotionMode: state.locomotionMode,
    speed: feelSpeed,
    facing: state.facing,
    walkPhase: state.walkPhase,
    poseBlend: poseFrame.poseBlend,
    squashX: 1,
    squashY: 1,
    leanDegrees: leanDegrees + runGait.leanDegrees,
    breathOffset: breathY,
    ghost: ghostActive,
  });
  localSprite.setDepth(studioTownDepthForPoint(manifest, localGroundPoint, 1_001));
  localShadow.setPosition(localShadowPoint.x, localShadowPoint.y + 1);
  const shadowScale = studioGaitShadowScale(state.localDistance, localGaitStride, nextMoving && !jumpStep.airborne, reducedMotion) * jumpStep.shadowScale;
  localShadow.setVisible(!localSeat).setScale(shadowScale, 1).setDepth(studioTownDepthForPoint(manifest, rendered, 990));
  actorAura?.drawActorGroundAndAura({
    x: localShadowPoint.x,
    y: localShadowPoint.y,
    distance: state.localDistance,
    stride: localGaitStride,
    moving: nextMoving,
    seated: isLocalSeated,
    ghost: ghostActive,
    reducedMotion,
    activity,
    userStatus: snapshotSelf.userStatus,
    reaction: shownLocalEmote,
    sprite: localSprite,
    timeMs: time,
  });
  if (motionFeel && !localSeat) {
    Object.assign(motionFrame, {
      time,
      deltaSeconds: dt,
      x: localShadowPoint.x,
      y: localShadowPoint.y,
      depth: localSprite.depth,
      speed,
      sprintSpeed,
      inputSpeed: maxSpeed * Math.min(1, Math.hypot(inputX, inputY)),
      surface: localSurface,
      particleDensity: worldFeel.effective.particleDensity * qualityProfile.particleRatio * (experience.effectLevel === "low" ? 0.5 : 1),
      reducedMotion: reducedMotion || worldFeel.effective.reducedMotion,
      vx: velocity.x,
      vy: velocity.y,
      sprinting: sprint && nextMoving,
      airborne: jumpStep.airborne,
    });
    motionFeel.step(motionFrame, localSprite);
  }

  const overlayScale = studioSceneOverlayScale(actorVisualScale, scene.cameras.main.zoom, viewport.ratio);
  const selfNameplate = studioVirtualNameplatePresentation({
    name: selfDisplayName,
    sessionId: "self",
    duplicateCount: 1,
    distance: 0,
    mode: "full",
    activity,
    userStatus: snapshotSelf.userStatus,
    translate,
  });
  localLabel.setText(selfNameplate.text).setVisible(true).setAlpha(1).setScale(overlayScale);
  const localHeadY = localDisplay.y - localSprite.displayHeight * localSprite.originY;
  const localLabelOffset = localLabel.displayHeight + 6 * overlayScale;
  localLabel.setPosition(localDisplay.x, localSeat || actorVisualScale < 1 ? localHeadY - localLabelOffset : localDisplay.y + 12)
    .setDepth(localSeat ? 160_000 : Math.round(localVisualPoint.y) + 1_002);
  const selfBubbleBase = localHeadY - (localSeat || actorVisualScale < 1 ? localLabelOffset + 4 * overlayScale : 4);
  const selfEmoteHeight = emotes?.place("self", localDisplay.x, selfBubbleBase, overlayScale, time, reducedMotion) ?? 0;
  const selfBubble = snapshotSelf.bubble;
  if (selfChatBubbleText) {
    speech?.show("self", selfChatBubbleText, "person");
    speech?.place("self", localDisplay.x, selfBubbleBase - selfEmoteHeight, overlayScale);
  } else if (selfBubble) {
    speech?.showTimed("self", selfBubble, "person", STUDIO_PRESENCE_BUBBLE_TTL_MS, time);
    speech?.place("self", localDisplay.x, selfBubbleBase - selfEmoteHeight, overlayScale, true, time);
  } else speech?.hide("self");
  decorationRuntime?.syncActor(
    selfIdentity,
    localSprite,
    localLabel,
    localVisualPoint,
    localSeatRequested?.facing ?? localPoseOverride?.facing ?? state.facing,
    nextMoving,
    localResolved,
    time,
  );
  interactionFx?.trackActor("self", localSprite, localGroundPoint.x, localGroundPoint.y, state.facing, shownLocalEmote, true);

  const duplicateNames = new Map<string, number>();
  for (const name of [selfDisplayName, ...[...peers.values()].map((peer) => peer.displayName)]) {
    duplicateNames.set(name, (duplicateNames.get(name) ?? 0) + 1);
  }
  const nameplateCandidates: StudioPhaserNameplateCandidate[] = [
    { id: "self", x: localLabel.x, y: localLabel.y, width: localLabel.displayWidth, height: localLabel.displayHeight, priority: 100 },
  ];
  const nameplateBases = new Map<string, StudioPhaserNameplateBase>([
    ["self", { label: localLabel, x: localLabel.x, y: localLabel.y, status: selfNameplate.status }],
  ]);

  return {
    rendered,
    localSeat: Boolean(localSeat),
    localGaitStride,
    activeDayPhase,
    shownLocalEmote,
    conversationFocus,
    overlayScale,
    pose: poseFrame.pose,
    duplicateNames,
    nameplateCandidates,
    nameplateBases,
  };
}
