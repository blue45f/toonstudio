/**
 * Peer snapshot synchronization and per-frame peer rendering/fade/nameplate updates
 * for `StudioVirtualSpacePhaserCanvas`.
 */

import { studioVirtualArtStyle, type StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import {
  studioCharacterPoseTextureKey,
  studioCharacterStaticAsset,
  type StudioCharacterTextureAsset,
} from "./studio-virtual-space-character-assets";
import {
  resolveStudioCharacterAppearance,
  studioCharacterSkinForArtStyle,
  studioCharacterWalkClip,
  type StudioCharacterMotionState,
} from "./studio-virtual-space-character-skins";
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import type { StudioEmoteRuntime, StudioSpeechBubbleRuntime } from "./studio-virtual-space-emote-runtime";
import type { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import type { StudioVirtualExperiencePreference } from "./studio-virtual-space-experience-preference";
import { resolveStudioHdActorTint } from "./studio-virtual-space-hd-sprite-pipeline";
import type { StudioInteractionFxRuntime } from "./studio-virtual-space-interaction-fx";
import type { StudioInteractionFxLiveWiring } from "./studio-virtual-space-interaction-fx-live";
import {
  studioAwayDozeMotion,
  studioEffectiveGaitStride,
  studioGaitBodyOffset,
  type studioPlayerLocomotionProfile,
} from "./studio-virtual-space-locomotion-presentation";
import { studioCadenceLimitedStride } from "./studio-virtual-space-locomotion-style";
import { breathOffset, dampPeerOffset } from "./studio-virtual-space-locomotion-transitions";
import type {
  StudioVirtualSpaceFacing,
  StudioVirtualSpacePeer,
  StudioVirtualSpacePoint,
} from "./studio-virtual-space-model";
import type { StudioMotionFeelRuntime } from "./studio-virtual-space-motion-feel-runtime";
import {
  studioVirtualNameplatePresentation,
  type StudioVirtualNameplateStatus,
} from "./studio-virtual-space-nameplate-layout";
import type { createStudioNameplateRenderer } from "./studio-virtual-space-nameplate-renderer";
import { peerImpactOffsetAt } from "./studio-virtual-space-peer-motion";
import { applyStudioPeerImpact, createStudioPeerVisual } from "./studio-virtual-space-peer-visual";
import {
  STUDIO_EMOTE_DEDUPE_MS,
  activityState,
  studioEmoteFacing,
  type PeerVisual,
  type StudioVirtualSpacePhaserCanvasProps,
} from "./studio-virtual-space-phaser-canvas-model";
import { STUDIO_PRESENCE_BUBBLE_TTL_MS, type StudioVirtualSpaceSnapshot } from "./studio-virtual-space-presence";
import {
  studioPresenceEmoteBob,
  studioPresenceEmoteIndicator,
  studioPresenceEmoteParticleColor,
  studioPresenceEmoteReaction,
} from "./studio-virtual-space-presence-emote";
import type { StudioFixedStepClock, StudioFixedStepPose } from "./studio-virtual-space-presentation";
import { studioProjectTownPoint, studioTownDepthForPoint } from "./studio-virtual-space-semantic-world";
import type { StudioSpriteCrossfadeRuntime } from "./studio-virtual-space-sprite-crossfade-runtime";
import {
  studioActorVisibilityFadeAlpha,
  studioActorVisibilityFadeRendering,
  studioBreathPhaseAt,
  studioPeerPresenceFade,
  studioSmoothingPhaseSeed,
  transitionStudioActorVisibilityFade,
  type StudioActorVisibilityFadeState,
} from "./studio-virtual-space-sprite-smoothing";
import type { StudioSpaceThemeKey } from "./studio-virtual-space-theme";
import type { studioTownInterestSnapshot } from "./studio-virtual-space-town-program";
import type { StudioVirtualDecorationRuntime } from "./studio-virtual-space-decoration-runtime";
import type { StudioActorAuraRuntime } from "./studio-virtual-space-actor-aura-runtime";
import type { StudioWorldFeelController } from "./studio-virtual-space-world-feel";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";
import { studioWorldCanOccupy } from "./studio-virtual-space-world-pathfinding";
import type { studioVirtualDayPhase } from "./studio-virtual-space-living-world";

export interface StudioPhaserNameplateCandidate {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly priority: number;
}

export interface StudioPhaserNameplateBase {
  readonly label: import("phaser").GameObjects.Text;
  readonly x: number;
  readonly y: number;
  readonly status: StudioVirtualNameplateStatus | null;
}

export type StudioPhaserApplyAvatarVisual = (
  sprite: import("phaser").GameObjects.Sprite,
  avatar: Pick<StudioVirtualSpacePeer["state"], "avatarIndex" | "appearance">,
  nextFacing: StudioVirtualSpaceFacing,
  nextState: StudioCharacterMotionState,
  identity?: string,
) => void;

export interface SyncStudioPhaserSnapshotParams {
  readonly next: StudioVirtualSpaceSnapshot;
  readonly scene: import("phaser").Scene;
  readonly peers: Map<string, PeerVisual>;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly actorVisualScale: number;
  readonly gaitDistancePerCycle: number | undefined;
  readonly nameplateStyle: ReturnType<typeof createStudioNameplateRenderer>["nameplateStyle"];
  readonly hasStaticAsset: (asset: StudioCharacterTextureAsset) => boolean;
  readonly fallbackAsset: StudioCharacterTextureAsset;
  readonly runtimeInputBlocked: () => boolean;
  readonly onTapPeer: (peerId: string, point: StudioVirtualSpacePoint) => void;
  readonly frameTime: number;
  readonly reducedMotion: boolean;
  readonly effectLevel: StudioVirtualExperiencePreference["effectLevel"];
  readonly emotes: StudioEmoteRuntime | null;
  readonly motionFeel: StudioMotionFeelRuntime | null;
  readonly spriteCrossfades: StudioSpriteCrossfadeRuntime | null;
  readonly applyAvatarVisual: StudioPhaserApplyAvatarVisual;
  readonly queueEmoteReaction: (emote: StudioSpaceEmoteId, point: StudioVirtualSpacePoint | null) => void;
  readonly destroyPeerVisual: (id: string, visual: PeerVisual) => void;
  readonly localBody: import("phaser").GameObjects.Zone | null;
  readonly localSprite: import("phaser").GameObjects.Sprite | null;
  readonly localBodyPhysics: import("phaser").Physics.Arcade.Body | null;
  readonly moving: boolean;
  readonly facing: StudioVirtualSpaceFacing;
  readonly navigationWorld: StudioVirtualSpaceWorldManifest;
  readonly localPose: StudioFixedStepPose;
  readonly fixedStepClock: StudioFixedStepClock;
  readonly resetCollisionResponse: () => void;
  readonly onLocalHardSync: (point: StudioVirtualSpacePoint) => void;
  readonly selfIdentity: string;
  readonly lastSelfReaction: StudioVirtualSpaceSnapshot["selfReaction"];
  readonly fxWiring: StudioInteractionFxLiveWiring | null;
}

export function syncStudioVirtualSpaceSnapshot(params: SyncStudioPhaserSnapshotParams): {
  readonly selfChatBubbleText: string | null;
  readonly lastSelfReaction: StudioVirtualSpaceSnapshot["selfReaction"];
} {
  const {
    next,
    scene,
    peers,
    artStyle,
    actorVisualScale,
    gaitDistancePerCycle,
    nameplateStyle,
    hasStaticAsset,
    fallbackAsset,
    runtimeInputBlocked,
    onTapPeer,
    frameTime,
    reducedMotion,
    effectLevel,
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
    facing,
    navigationWorld,
    localPose,
    fixedStepClock,
    resetCollisionResponse,
    onLocalHardSync,
    selfIdentity,
    fxWiring,
  } = params;
  const nearby = new Set(next.nearbyPeers.map((peer) => peer.participant.sessionId));
  const present = new Set<string>();
  const reactionsBySession = new Map(next.peerReactions.map((item) => [item.sessionId, item] as const));
  const impactsBySession = new Map(next.peerImpacts.map((item) => [item.sessionId, item] as const));
  const chatBubblesBySession = new Map(next.chatBubbles.map((item) => [item.sessionId, item.text] as const));
  const typingSessions = new Set(next.peerTyping.map((item) => item.sessionId));
  const selfChatBubbleText = next.selfChatBubble?.text ?? null;
  const now = Date.now();

  for (const peer of next.peers) {
    const id = peer.participant.sessionId;
    present.add(id);
    const isNearby = nearby.has(id);
    let visual = peers.get(id);
    const state = activityState(peer.state.moving, isNearby, peer.state.activity);
    const skin = studioCharacterSkinForArtStyle(resolveStudioCharacterAppearance(peer.state, id).skin, artStyle);
    const requestedPeerAsset = studioCharacterStaticAsset(skin, peer.state.facing, state);
    const peerInitialAsset = hasStaticAsset(requestedPeerAsset) ? requestedPeerAsset : fallbackAsset;
    if (!visual) {
      visual = createStudioPeerVisual({
        scene,
        peer,
        asset: peerInitialAsset,
        actorVisualScale,
        gaitDistancePerCycle,
        nameplateStyle,
        nearby: isNearby,
        inputBlocked: runtimeInputBlocked,
        onTapPeer,
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
    visual.nearby = isNearby;
    visual.userStatus = peer.state.userStatus;
    visual.bubble = peer.state.bubble ?? null;
    const presenceEmote = peer.state.emote ?? null;
    if (presenceEmote !== visual.presenceEmote) {
      visual.presenceEmote = presenceEmote;
      const reaction = studioPresenceEmoteReaction(presenceEmote);
      if (reaction) emotes?.play(`peer:${id}`, reaction, frameTime);
      const color = studioPresenceEmoteParticleColor(presenceEmote);
      if (color !== null && !reducedMotion) {
        motionFeel?.burst(
          visual.sprite.x,
          visual.sprite.y - visual.sprite.displayHeight * visual.sprite.originY - 6,
          visual.sprite.depth + 2,
          6,
          color,
        );
      }
    }
    spriteCrossfades?.capture(visual.sprite);
    applyAvatarVisual(visual.sprite, visual, visual.facing, state, id);
    spriteCrossfades?.commit(visual.sprite, frameTime, !reducedMotion && effectLevel !== "low");
    visual.label.setText(peer.participant.displayName);

    const reaction = reactionsBySession.get(id);
    visual.chatBubble = chatBubblesBySession.get(id) ?? null;
    visual.typing = typingSessions.has(id);
    applyStudioPeerImpact(visual, impactsBySession.get(id), frameTime);
    const key = reaction && reaction.expiresAt > now ? `${reaction.reaction}@${reaction.expiresAt}` : "";
    if (key !== visual.emoteKey) {
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
      if (!reducedMotion && effectLevel !== "low") {
        visual.leavingAt = frameTime;
        continue;
      }
    } else {
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
      onLocalHardSync({ x: next.self.x, y: next.self.y });
    }
    applyAvatarVisual(
      localSprite,
      next.self,
      facing,
      activityState(moving, false, next.self.activity),
      selfIdentity,
    );
  }

  let nextLastSelfReaction = params.lastSelfReaction;
  if (next.selfReaction !== nextLastSelfReaction) {
    nextLastSelfReaction = next.selfReaction;
    const clock = frameTime;
    if (next.selfReaction && emotes?.activeId("self", clock) !== next.selfReaction) {
      emotes?.play("self", next.selfReaction, clock, "person", STUDIO_EMOTE_DEDUPE_MS);
      queueEmoteReaction(next.selfReaction, null);
    }
  }
  fxWiring?.syncObjectStates(next.objectStates);
  fxWiring?.pruneRemoteStates(present, frameTime);
  return { selfChatBubbleText, lastSelfReaction: nextLastSelfReaction };
}

export interface UpdateStudioPhaserPeersFrameParams {
  readonly scene: import("phaser").Scene;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly peers: Map<string, PeerVisual>;
  readonly peerVisibilityFades: Map<string, StudioActorVisibilityFadeState>;
  readonly peerInterest: ReturnType<typeof studioTownInterestSnapshot>;
  readonly currentPoint: StudioVirtualSpacePoint;
  readonly time: number;
  readonly reducedMotion: boolean;
  readonly crossfadeEnabled: boolean;
  readonly experience: StudioVirtualExperiencePreference;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly spaceTheme: StudioSpaceThemeKey | undefined;
  readonly activeDayPhase: ReturnType<typeof studioVirtualDayPhase>;
  readonly actorVisualScale: number;
  readonly overlayScale: number;
  readonly playerLocomotion: ReturnType<typeof studioPlayerLocomotionProfile>;
  readonly locomotion: StudioWorldFeelController["locomotion"];
  readonly seatedActors: NonNullable<StudioVirtualSpacePhaserCanvasProps["seatedActors"]>;
  readonly waveActorIds: readonly string[];
  readonly bridge: StudioVirtualSpaceEngineBridge;
  readonly duplicateNames: ReadonlyMap<string, number>;
  readonly translate: (ko: string, en: string) => string;
  readonly emotes: StudioEmoteRuntime | null;
  readonly speech: StudioSpeechBubbleRuntime | null;
  readonly spriteCrossfades: StudioSpriteCrossfadeRuntime | null;
  readonly actorAura: StudioActorAuraRuntime | null;
  readonly decorationRuntime: StudioVirtualDecorationRuntime | null;
  readonly interactionFx: StudioInteractionFxRuntime | null;
  readonly applyAvatarVisual: StudioPhaserApplyAvatarVisual;
  readonly destroyPeerVisual: (id: string, visual: PeerVisual) => void;
  readonly nameplateCandidates: StudioPhaserNameplateCandidate[];
  readonly nameplateBases: Map<string, StudioPhaserNameplateBase>;
}

export function updateStudioVirtualSpacePeersFrame(params: UpdateStudioPhaserPeersFrameParams): void {
  const {
    scene,
    manifest,
    peers,
    peerVisibilityFades,
    peerInterest,
    currentPoint,
    time,
    reducedMotion,
    crossfadeEnabled,
    experience,
    artStyle,
    spaceTheme,
    activeDayPhase,
    actorVisualScale,
    overlayScale,
    playerLocomotion,
    locomotion,
    seatedActors,
    waveActorIds,
    bridge,
    duplicateNames,
    translate,
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
  } = params;

  for (const [peerId, visual] of peers) {
    const presenceFade = studioPeerPresenceFade({
      spawnedAt: visual.spawnedAt,
      leavingAt: visual.leavingAt,
      now: time,
      reducedMotion,
      effectsSuppressed: experience.effectLevel === "low",
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
    const peerResolved = resolveStudioCharacterAppearance(visual, peerId);
    const peerSkin = studioCharacterSkinForArtStyle(peerResolved.skin, artStyle);
    const peerSeatRequested = !target.moving && resolveStudioCharacterAppearance(visual, peerId, "sit").clip === "sit"
      ? seatedActors.find((actor) => actor.id === peerId)
      : undefined;
    const peerSeat = scene.textures.exists(studioCharacterPoseTextureKey(peerSkin, "sit")) ? peerSeatRequested : undefined;
    const peerEmote = emotes?.activeId(`peer:${peerId}`, time) ?? null;
    const peerEmotePose = target.moving || peerSeatRequested ? null : emotes?.pose(`peer:${peerId}`, time, reducedMotion) ?? null;
    visual.sprite.setData("actorReaction", peerEmote).setData("actorUserStatus", visual.userStatus);
    const peerWaving = waveActorIds.includes(peerId) || peerEmote === "wave";
    const peerGroundPoint = peerSeat?.anchorPoint ?? target;
    const peerVisualPoint = studioProjectTownPoint(manifest, peerGroundPoint);
    const presenceBob = target.moving || peerSeatRequested || reducedMotion ? 0 : studioPresenceEmoteBob(visual.presenceEmote);
    const peerWalkDistance = Number(visual.sprite.getData("walkDistance") ?? 0);
    const peerGaitStride = studioCadenceLimitedStride(
      studioEffectiveGaitStride(
        visual.sprite.getData("gaitDistancePerCycle") as number | undefined,
        studioCharacterWalkClip(peerSkin, target.facing)?.distancePerCycle,
      ),
      playerLocomotion.walkSpeed,
      locomotion,
    );
    visual.sprite.setData("gaitStrideOverride", locomotion.maxGaitCyclesPerSecond === null ? undefined : peerGaitStride);
    const peerGaitRaw = studioGaitBodyOffset(peerWalkDistance, peerGaitStride, target.moving, reducedMotion);
    const peerGait = locomotion.inertial
      ? peerGaitRaw
      : { offsetX: peerGaitRaw.offsetX * locomotion.gaitSwayScale, offsetY: peerGaitRaw.offsetY * locomotion.gaitBobScale };
    const peerBreathY = !target.moving && !peerSeatRequested && !peerEmotePose && presenceBob === 0
      ? breathOffset(studioBreathPhaseAt(time, studioSmoothingPhaseSeed(peerId)), "idle")
      : 0;
    const peerDoze = visual.activity === "away" && !target.moving && !peerSeatRequested && !peerEmotePose
      ? studioAwayDozeMotion(time, studioSmoothingPhaseSeed(peerId), reducedMotion)
      : null;
    const peerImpact = peerImpactOffsetAt(visual.impactVx, visual.impactVy, time - visual.impactAt, {
      suppressed: reducedMotion || experience.effectLevel === "low",
    });
    const peerTargetX = peerVisualPoint.x + (peerEmotePose?.bodyX ?? 0) + peerImpact.x;
    const peerTargetY = peerVisualPoint.y + peerGait.offsetY + (peerEmotePose?.bodyY ?? 0) + presenceBob + peerBreathY
      + (peerDoze?.offsetY ?? 0) + peerImpact.y;
    const peerBeforeX = visual.sprite.x;
    const peerBeforeY = visual.sprite.y;
    if (distance >= 128) {
      visual.sprite.setPosition(peerTargetX, peerTargetY);
    } else {
      visual.sprite.setPosition(
        visual.sprite.x + dampPeerOffset(peerTargetX - visual.sprite.x, locomotion.peerDeadzonePx),
        visual.sprite.y + dampPeerOffset(peerTargetY - visual.sprite.y, locomotion.peerDeadzonePx),
      );
    }
    const peerRenderedStep = Math.hypot(visual.sprite.x - peerBeforeX, visual.sprite.y - peerBeforeY);
    if (peerRenderedStep > 0 && peerRenderedStep < 128) {
      visual.sprite.setData("walkDistance", peerWalkDistance + peerRenderedStep);
    }
    visual.sprite.setData("seatAttached", Boolean(peerSeat));
    const peerState = target.moving ? "walk" : peerSeatRequested ? "sit" : peerWaving ? "wave" : activityState(false, visual.nearby, visual.activity);
    spriteCrossfades?.capture(visual.sprite);
    applyAvatarVisual(visual.sprite, visual, peerSeatRequested?.facing ?? studioEmoteFacing(peerEmotePose) ?? target.facing, peerState, peerId);
    spriteCrossfades?.commit(visual.sprite, time, crossfadeEnabled);
    visual.sprite.setAngle((peerEmotePose?.bodyAngle ?? 0) + (peerDoze?.angleDegrees ?? 0));
    visual.sprite.setTint(resolveStudioHdActorTint({
      phase: activeDayPhase,
      style: artStyle,
      spaceTheme,
      facing: target.facing,
      focused: visual.activity === "focused",
      away: visual.activity === "away",
      ghost: false,
    }));
    visual.sprite.setDepth(studioTownDepthForPoint(manifest, peerGroundPoint, 1_001));
    const peerHeadY = visual.sprite.y - visual.sprite.displayHeight * visual.sprite.originY;
    const nameplate = studioVirtualNameplatePresentation({
      name: visual.displayName,
      sessionId: peerId,
      duplicateCount: duplicateNames.get(visual.displayName) ?? 1,
      distance: Math.hypot(target.x - currentPoint.x, target.y - currentPoint.y),
      mode: experience.nameplateMode,
      important: bridge.getFollowingPeer() === peerId || visual.nearby,
      activity: visual.activity,
      userStatus: visual.userStatus,
      emote: studioPresenceEmoteIndicator(visual.presenceEmote),
      typing: visual.typing,
      translate,
    });
    visual.label.setText(nameplate.text).setScale(Math.max(actorVisualScale < 1 ? 1 : 0, nameplate.scale) * overlayScale);
    const peerLabelOffset = visual.label.displayHeight + 6 * overlayScale;
    const peerLabelY = peerSeat || actorVisualScale < 1 ? peerHeadY - peerLabelOffset : visual.sprite.y + 18;
    const peerVisible = peerInterest.activeIds.has("peer:" + peerId);
    const peerFade = transitionStudioActorVisibilityFade(peerVisibilityFades.get(peerId) ?? null, peerVisible, time, {
      reducedMotion,
      effectsSuppressed: experience.effectLevel === "low",
    });
    peerVisibilityFades.set(peerId, peerFade);
    const peerFadeAlpha = studioActorVisibilityFadeAlpha(peerFade, time);
    const peerRendered = studioActorVisibilityFadeRendering(peerFade, time);
    visual.label.setPosition(visual.sprite.x, peerLabelY)
      .setDepth(peerSeat ? 160_000 : Math.round(visual.sprite.y) + 1_002)
      .setAlpha(nameplate.alpha * presenceFade * peerFadeAlpha);
    const peerBubbleBase = peerHeadY - (peerSeat || actorVisualScale < 1 ? peerLabelOffset + 4 * overlayScale : 4);
    const peerEmoteHeight = emotes?.place(`peer:${peerId}`, visual.sprite.x, peerBubbleBase, overlayScale, time, reducedMotion, peerRendered) ?? 0;
    if (visual.chatBubble && peerRendered) {
      speech?.show(`peer:${peerId}`, visual.chatBubble, "person");
      speech?.place(`peer:${peerId}`, visual.sprite.x, peerBubbleBase - peerEmoteHeight, overlayScale);
    } else if (visual.bubble && peerRendered) {
      speech?.showTimed(`peer:${peerId}`, visual.bubble, "person", STUDIO_PRESENCE_BUBBLE_TTL_MS, time);
      speech?.place(`peer:${peerId}`, visual.sprite.x, peerBubbleBase - peerEmoteHeight, overlayScale, true, time);
    } else if (visual.typing && peerRendered) {
      speech?.show(`peer:${peerId}`, "···", "person");
      speech?.place(`peer:${peerId}`, visual.sprite.x, peerBubbleBase - peerEmoteHeight, overlayScale);
    } else speech?.hide(`peer:${peerId}`);
    const labelVisible = peerRendered && nameplate.visible;
    visual.sprite.setVisible(peerRendered);
    visual.sprite.setAlpha((visual.activity === "away" ? 0.62 : 1) * presenceFade * peerFadeAlpha);
    visual.label.setVisible(labelVisible);
    if (peerRendered) {
      actorAura?.drawActorGroundAndAura({
        x: peerVisualPoint.x,
        y: peerVisualPoint.y,
        distance: peerWalkDistance,
        stride: peerGaitStride,
        moving: target.moving,
        seated: Boolean(peerSeat),
        ghost: false,
        reducedMotion,
        activity: visual.activity,
        userStatus: visual.userStatus,
        reaction: peerEmote,
        sprite: visual.sprite,
        timeMs: time,
        fadeAlpha: presenceFade * peerFadeAlpha,
      });
    }
    if (labelVisible) {
      nameplateCandidates.push({
        id: peerId,
        x: visual.label.x,
        y: visual.label.y,
        width: visual.label.displayWidth,
        height: visual.label.displayHeight,
        priority: visual.nearby ? 30 : 10,
      });
      nameplateBases.set(peerId, { label: visual.label, x: visual.label.x, y: visual.label.y, status: nameplate.status });
    }
    decorationRuntime?.syncActor(
      peerId,
      visual.sprite,
      visual.label,
      peerVisualPoint,
      peerSeatRequested?.facing ?? target.facing,
      target.moving,
      peerResolved,
      time,
    );
    interactionFx?.trackActor(peerId, visual.sprite, target.x, target.y, target.facing, peerEmote, peerRendered);
  }
}

export type StudioPhaserArtProfile = ReturnType<typeof studioVirtualArtStyle>;
