/**
 * Per-frame NPC director advance, chatter scheduling, visibility fading,
 * prompt candidate resolution, and event feed execution for `StudioVirtualSpacePhaserCanvas`.
 */

import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import { studioCharacterPoseTextureKey } from "./studio-virtual-space-character-assets";
import {
  studioCharacterWalkClip,
  type StudioCharacterMotionState,
  type StudioCharacterSkin,
} from "./studio-virtual-space-character-skins";
import type { StudioSpaceEmoteId } from "./studio-virtual-space-emote-catalog";
import type { StudioEmoteRuntime, StudioSpeechBubbleRuntime } from "./studio-virtual-space-emote-runtime";
import {
  studioNearbyNpcCandidates,
  studioNearbyNpcIdsKey,
  type StudioVirtualSpaceNearbyNpc,
} from "./studio-virtual-space-engine-events";
import type { StudioVirtualEnvironmentPreference } from "./studio-virtual-space-environment-preference";
import type { StudioVirtualExperiencePreference } from "./studio-virtual-space-experience-preference";
import { resolveStudioHdActorTint } from "./studio-virtual-space-hd-sprite-pipeline";
import type { StudioInteractionFxRuntime } from "./studio-virtual-space-interaction-fx";
import type { StudioInteractionFxLiveWiring } from "./studio-virtual-space-interaction-fx-live";
import { studioVirtualDayPhase } from "./studio-virtual-space-living-world";
import {
  studioEffectiveGaitStride,
  studioGaitBodyOffset,
  studioGaitShadowAlpha,
} from "./studio-virtual-space-locomotion-presentation";
import { breathOffset } from "./studio-virtual-space-locomotion-transitions";
import type {
  StudioVirtualSpaceFacing,
  StudioVirtualSpacePeer,
  StudioVirtualSpacePoint,
} from "./studio-virtual-space-model";
import { studioVirtualNameplatePresentation } from "./studio-virtual-space-nameplate-layout";
import { STUDIO_VIRTUAL_SPACE_WALK_SPEED } from "./studio-virtual-space-navigation";
import type {
  StudioNpcChatterActor,
  StudioNpcChatterScheduler,
  StudioNpcSpeechBubble,
} from "./studio-virtual-space-npc-chatter";
import {
  studioNpcActivityLabel,
  studioNpcInteraction,
  studioNpcLabel,
  studioNpcRole,
  type StudioNpcAtmosphere,
  type StudioNpcDirector,
} from "./studio-virtual-space-npc-director";
import type { StudioVirtualNpcGuideTourRequest, StudioVirtualNpcGuideTourState } from "./studio-virtual-space-npc-guide";
import {
  NPC_LOOK_DISTANCE,
  NPC_NOTICE_COOLDOWN_MS,
  studioEmoteFacing,
  studioFacingToward,
  type NpcVisual,
  type PeerVisual,
} from "./studio-virtual-space-phaser-canvas-model";
import type {
  StudioPhaserNameplateBase,
  StudioPhaserNameplateCandidate,
} from "./studio-virtual-space-phaser-peer-sync";
import { studioProjectTownPoint, studioTownDepthForPoint } from "./studio-virtual-space-semantic-world";
import type { StudioSpriteCrossfadeRuntime } from "./studio-virtual-space-sprite-crossfade-runtime";
import {
  STUDIO_ACTOR_VISIBILITY_MAX_FADE_OUTS,
  dampStudioDisplayPoint,
  studioActorVisibilityFadeAlpha,
  studioActorVisibilityFadeRendering,
  studioBreathPhaseAt,
  studioDisplayDampTauSeconds,
  studioSmoothingPhaseSeed,
  transitionStudioActorVisibilityFade,
  type StudioActorVisibilityFadeState,
  type StudioDisplayPoint,
} from "./studio-virtual-space-sprite-smoothing";
import type { StudioSpaceThemeKey } from "./studio-virtual-space-theme";
import { studioTownInterestSnapshot } from "./studio-virtual-space-town-program";
import type { StudioWorldEventFeed } from "./studio-virtual-space-world-feel";
import type {
  StudioVirtualSpaceWorldManifest,
  StudioWorldInteractionDefinition,
  StudioWorldPortalDefinition,
} from "./studio-virtual-space-world-manifest";
import {
  studioPortalPromptCandidate,
  studioWorldPromptTarget,
  type StudioWorldPromptCandidate,
  type StudioWorldPromptRuntime,
} from "./studio-virtual-space-world-prompt";

export type StudioPhaserApplySpriteVisual = (
  sprite: import("phaser").GameObjects.Sprite,
  skin: StudioCharacterSkin,
  nextFacing: StudioVirtualSpaceFacing,
  nextState: StudioCharacterMotionState,
) => void;

export function findNearestStudioInteractableNpc(
  manifest: StudioVirtualSpaceWorldManifest,
  npcs: ReadonlyMap<string, NpcVisual>,
  currentPoint: StudioVirtualSpacePoint,
): {
  readonly nearbyNpc: NpcVisual | undefined;
  readonly npcInteraction: StudioWorldInteractionDefinition | null;
} {
  let nearbyNpc: NpcVisual | undefined;
  let npcInteraction: StudioWorldInteractionDefinition | null = null;
  let nearbyNpcGap = 55;
  for (const npc of npcs.values()) {
    const gap = Math.hypot(npc.groundPoint.x - currentPoint.x, npc.groundPoint.y - currentPoint.y);
    if (gap >= nearbyNpcGap) continue;
    const candidate = studioNpcInteraction(manifest, npc.definition);
    if (!candidate) continue;
    nearbyNpc = npc;
    npcInteraction = candidate;
    nearbyNpcGap = gap;
  }
  return { nearbyNpc, npcInteraction };
}

export interface UpdateStudioPhaserNpcsFrameParams {
  readonly scene: import("phaser").Scene;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly parent: HTMLElement;
  readonly npcs: ReadonlyMap<string, NpcVisual>;
  readonly peers: ReadonlyMap<string, PeerVisual>;
  readonly npcDirector: StudioNpcDirector;
  readonly npcDisplayPoints: Map<string, StudioDisplayPoint>;
  readonly npcVisibilityFades: Map<string, StudioActorVisibilityFadeState>;
  readonly npcNoticedAt: Map<string, number>;
  readonly chatter: StudioNpcChatterScheduler;
  readonly pendingEmoteReactions: Array<{ readonly emote: StudioSpaceEmoteId; readonly point: StudioVirtualSpacePoint | null }>;
  readonly eventFeed: StudioWorldEventFeed;
  readonly time: number;
  readonly dt: number;
  readonly currentPoint: StudioVirtualSpacePoint;
  readonly velocity: StudioVirtualSpacePoint;
  readonly speed: number;
  readonly blocked: boolean;
  readonly worldReadyForHud: boolean;
  readonly reducedMotion: boolean;
  readonly crossfadeEnabled: boolean;
  readonly atmosphere: StudioNpcAtmosphere;
  readonly activity: StudioVirtualSpacePeer["state"]["activity"];
  readonly activeDayPhase: ReturnType<typeof studioVirtualDayPhase>;
  readonly environment: StudioVirtualEnvironmentPreference;
  readonly experience: StudioVirtualExperiencePreference;
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly spaceTheme: StudioSpaceThemeKey | undefined;
  readonly actorVisualScale: number;
  readonly overlayScale: number;
  readonly interestRadius: number;
  readonly maxActiveNpcs: number;
  readonly selfIdentity: string;
  readonly tourRequest: StudioVirtualNpcGuideTourRequest | null;
  readonly lastGuideRequestId: string | null;
  readonly lastGuideState: string;
  readonly nearbyNpcKey: string;
  readonly lastPromptNpcId: string | null;
  readonly conversationFocus: StudioVirtualSpacePoint | null;
  readonly promptInteraction: StudioWorldInteractionDefinition | null;
  readonly nearbyNpc: NpcVisual | undefined;
  readonly npcInteraction: StudioWorldInteractionDefinition | null;
  readonly portals: readonly StudioWorldPortalDefinition[];
  readonly emotes: StudioEmoteRuntime | null;
  readonly speech: StudioSpeechBubbleRuntime | null;
  readonly promptRuntime: StudioWorldPromptRuntime | null;
  readonly spriteCrossfades: StudioSpriteCrossfadeRuntime | null;
  readonly interactionFx: StudioInteractionFxRuntime | null;
  readonly fxWiring: StudioInteractionFxLiveWiring | null;
  readonly applySpriteVisual: StudioPhaserApplySpriteVisual;
  readonly translate: (ko: string, en: string) => string;
  readonly onNearbyNpcsChange?: (npcs: readonly StudioVirtualSpaceNearbyNpc[]) => void;
  readonly onGuideTourChange?: (state: StudioVirtualNpcGuideTourState) => void;
  readonly nameplateCandidates: StudioPhaserNameplateCandidate[];
  readonly nameplateBases: Map<string, StudioPhaserNameplateBase>;
}

export interface UpdateStudioPhaserNpcsFrameResult {
  readonly lastGuideRequestId: string | null;
  readonly lastGuideState: string;
  readonly nearbyNpcKey: string;
  readonly lastPromptNpcId: string | null;
  readonly chatterBubbles: readonly StudioNpcSpeechBubble[];
  readonly visibleNpcCount: number;
}

export function updateStudioVirtualSpaceNpcsAndPromptsFrame(
  params: UpdateStudioPhaserNpcsFrameParams,
): UpdateStudioPhaserNpcsFrameResult {
  const {
    scene,
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
    velocity,
    speed,
    blocked,
    worldReadyForHud,
    reducedMotion,
    crossfadeEnabled,
    atmosphere,
    activity,
    activeDayPhase,
    environment,
    experience,
    artStyle,
    spaceTheme,
    actorVisualScale,
    overlayScale,
    interestRadius,
    maxActiveNpcs,
    selfIdentity,
    tourRequest,
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
    translate,
    onNearbyNpcsChange,
    onGuideTourChange,
    nameplateCandidates,
    nameplateBases,
  } = params;

  let { lastGuideRequestId, lastGuideState, nearbyNpcKey, lastPromptNpcId } = params;
  if ((tourRequest?.id ?? null) !== lastGuideRequestId) {
    lastGuideRequestId = tourRequest?.id ?? null;
    if (tourRequest) npcDirector.startGuideTour(tourRequest, selfIdentity);
    else npcDirector.cancelGuideTour();
  }

  const worldView = scene.cameras.main.worldView;
  const npcViews = npcDirector.advance(dt, {
    atmosphere,
    reducedMotion,
    focused: activity === "focused" || blocked,
    mobile: parent.clientWidth < 600,
    eventActive: studioVirtualDayPhase(time) === "dusk" || studioVirtualDayPhase(time) === "night",
    precipitation: Math.floor(time / 45_000) % 4 === 2,
    viewport: worldView,
    people: [
      { id: selfIdentity, point: currentPoint, velocity, focused: activity === "focused" || blocked },
      ...[...peers].map(([id, peer]) => ({
        id,
        point: { x: peer.targetX, y: peer.targetY },
        focused: peer.activity === "focused",
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
  if (worldReadyForHud && onNearbyNpcsChange) {
    const nearbyCandidates = studioNearbyNpcCandidates(npcViews, currentPoint);
    const key = studioNearbyNpcIdsKey(nearbyCandidates.map((candidate) => candidate.view));
    if (key !== nearbyNpcKey) {
      nearbyNpcKey = key;
      onNearbyNpcsChange(nearbyCandidates.flatMap(({ view, distance }): StudioVirtualSpaceNearbyNpc[] => {
        const npc = npcs.get(view.id);
        if (!npc) return [];
        const identity = studioNpcLabel(npc.definition);
        const doing = studioNpcActivityLabel(npc.definition, view.phase);
        return [{
          id: view.id,
          npc: npc.definition,
          labelKo: identity.ko,
          labelEn: identity.en,
          activityKo: doing.ko,
          activityEn: doing.en,
          skinKey: npc.definition.skinKey,
          distance,
          interaction: studioNpcInteraction(manifest, npc.definition),
        }];
      }));
    }
  }

  const npcInterest = studioTownInterestSnapshot(manifest, currentPoint, npcViews.map((view) => ({
    id: "npc:" + view.id,
    point: view.point,
    kind: "npc" as const,
    important: view.id === tourState?.guideId,
  })), interestRadius);

  let visibleNpcCount = 0;
  const chatterActors: StudioNpcChatterActor[] = [];
  for (const view of npcViews) {
    const npc = npcs.get(view.id);
    if (!npc) continue;
    chatterActors.push({
      id: view.id,
      role: studioNpcRole(npc.definition),
      point: view.point,
      phase: view.phase,
      greeting: view.greeting,
      visible: view.point.x >= worldView.x && view.point.x <= worldView.right && view.point.y >= worldView.y && view.point.y <= worldView.bottom,
    });
  }
  const chatterQuiet = blocked || atmosphere === "focus" || activity === "focused" || activity === "away";
  const chatterBubbles = chatter.step({ time, actors: chatterActors, quiet: chatterQuiet, reducedMotion });
  for (const reaction of pendingEmoteReactions.splice(0)) {
    chatter.reactToPlayerEmote(reaction.emote, time, reaction.point ?? currentPoint, chatterActors, chatterQuiet);
  }
  for (const response of chatter.dueResponses(time)) emotes?.play(`npc:${response.npcId}`, response.emote, time, "npc");
  const speechByNpc = new Map(chatterBubbles.map((bubble) => [bubble.npcId, bubble] as const));

  const tourKey = tourState
    ? `${tourState.requestId}|${tourState.guideId}|${tourState.status}|${tourState.stopIndex}|${tourState.stopCount}|${tourState.stopAction ?? ""}`
    : "";
  if (tourState && tourKey !== lastGuideState) {
    lastGuideState = tourKey;
    onGuideTourChange?.(tourState);
  }

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
    const previousNpcFade = npcVisibilityFades.get(view.id) ?? null;
    const npcFade = transitionStudioActorVisibilityFade(previousNpcFade, npcVisible, time, {
      reducedMotion,
      effectsSuppressed: experience.effectLevel === "low",
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
      emotes?.place(`npc:${view.id}`, 0, 0, 1, time, reducedMotion, false);
      speech?.hide(`npc:${view.id}`);
      continue;
    }
    npc.phase = view.phase;
    npc.groundPoint = view.point;
    const attached = view.seatAttachmentPoint && scene.textures.exists(studioCharacterPoseTextureKey(npc.skin, "sit"));
    const groundPoint = attached ? view.seatAttachmentPoint! : view.point;
    const visualPoint = studioProjectTownPoint(manifest, groundPoint);
    const npcEmote = emotes?.activeId(`npc:${view.id}`, time) ?? null;
    const npcEmotePose = view.moving || attached ? null : emotes?.pose(`npc:${view.id}`, time, reducedMotion) ?? null;
    const npcDisplay = attached
      ? visualPoint
      : dampStudioDisplayPoint(npcDisplayPoints.get(view.id) ?? null, visualPoint, dt, {
          enabled: !reducedMotion,
          tauSeconds: studioDisplayDampTauSeconds(view.speed),
        });
    if (!attached) npcDisplayPoints.set(view.id, npcDisplay);
    const npcGaitStride = studioEffectiveGaitStride(undefined, studioCharacterWalkClip(npc.skin, view.facing)?.distancePerCycle);
    const npcGait = studioGaitBodyOffset(view.distance, npcGaitStride, view.moving, reducedMotion);
    const npcBreathY = !view.moving && !attached && !npcEmotePose
      ? breathOffset(studioBreathPhaseAt(time, studioSmoothingPhaseSeed(view.id)), "idle")
      : 0;
    npc.sprite.setPosition(
      npcDisplay.x + (npcEmotePose?.bodyX ?? 0),
      npcDisplay.y + npcGait.offsetY + (npcEmotePose?.bodyY ?? 0) + npcBreathY,
    )
      .setAngle(npcEmotePose?.bodyAngle ?? 0)
      .setDepth(studioTownDepthForPoint(manifest, groundPoint, 1_000))
      .setData("seatAttached", Boolean(attached));
    npc.sprite.setData("activityStage", view.activityStage).setData("activityAnchorId", view.activityAnchorId);
    npc.sprite.setData("walkDistance", view.distance).setData("actorReaction", npcEmote).setData("actorNpcPhase", view.phase);
    const npcGap = Math.hypot(view.point.x - currentPoint.x, view.point.y - currentPoint.y);
    const lookAtPlayer = !view.moving && !attached && !blocked && npcGap < NPC_LOOK_DISTANCE;
    const talking = lookAtPlayer && conversationFocus !== null
      && Math.hypot(conversationFocus.x - view.point.x, conversationFocus.y - view.point.y) < 32;
    npc.sprite.setAlpha(npcFadeAlpha);
    npc.sprite.setTint(resolveStudioHdActorTint({
      phase: activeDayPhase,
      style: artStyle,
      spaceTheme,
      facing: view.facing,
      focused: view.phase === "work" || view.phase === "inspect",
      away: view.phase === "rest",
      ghost: false,
    }));
    spriteCrossfades?.capture(npc.sprite);
    const npcBaseFacing = !view.moving && !attached && view.phase === "wait" ? "down" : view.facing;
    applySpriteVisual(
      npc.sprite,
      npc.skin,
      studioEmoteFacing(npcEmotePose) ?? (lookAtPlayer ? studioFacingToward(currentPoint.x - view.point.x, currentPoint.y - view.point.y) : npcBaseFacing),
      npcEmote === "wave" && !view.moving && !attached ? "wave" : talking ? "talk" : view.animation,
    );
    spriteCrossfades?.commit(npc.sprite, time, crossfadeEnabled);
    npc.shadow.setPosition(npcDisplay.x, npcDisplay.y + 1)
      .setDepth(studioTownDepthForPoint(manifest, view.point, 990))
      .setVisible(!attached)
      .setAlpha(npcFadeAlpha * studioGaitShadowAlpha(view.distance, npcGaitStride, view.moving, reducedMotion, 1));
    const headY = npc.sprite.y - npc.sprite.displayHeight * npc.sprite.originY;
    const identity = studioNpcLabel(npc.definition);
    const npcName = translate(identity.ko, identity.en);
    const npcNameplate = studioVirtualNameplatePresentation({
      name: npcName,
      sessionId: `npc:${view.id}`,
      duplicateCount: 1,
      distance: npcGap,
      mode: experience.nameplateMode,
      important: importantNpc || Boolean(view.greeting),
      activity: view.phase === "inspect" ? "reviewing" : view.phase === "rest" ? "break" : "available",
      translate,
    });
    npc.label.setText(npcNameplate.text).setScale(Math.max(actorVisualScale < 1 ? 1 : 0, npcNameplate.scale) * overlayScale);
    const npcLabelOffset = npc.label.displayHeight + 6 * overlayScale;
    const npcLabelY = attached || actorVisualScale < 1 ? headY - npcLabelOffset : npcDisplay.y + 9;
    const npcLabelVisible = npcNameplate.visible && npcNameplate.lod !== "dot"
      && (!mobileNameplates || importantNpc || Boolean(view.greeting) || view.id === nearestMobileNpcId);
    npc.label.setPosition(npcDisplay.x, npcLabelY)
      .setDepth(attached ? 160_000 : studioTownDepthForPoint(manifest, groundPoint, 1_002))
      .setAlpha(npcNameplate.alpha * npcFadeAlpha)
      .setVisible(npcLabelVisible);
    if (npcLabelVisible) {
      const id = `npc:${view.id}`;
      nameplateCandidates.push({
        id,
        x: npc.label.x,
        y: npc.label.y,
        width: npc.label.displayWidth,
        height: npc.label.displayHeight,
        priority: importantNpc ? 60 : view.greeting ? 35 : 8,
      });
      nameplateBases.set(id, { label: npc.label, x: npc.label.x, y: npc.label.y, status: npcNameplate.status });
    }
    const bubbleBase = headY - (attached || actorVisualScale < 1 ? npcLabelOffset + 2 * overlayScale : 4);
    const emoteHeight = emotes?.place(`npc:${view.id}`, npcDisplay.x, bubbleBase, overlayScale, time, reducedMotion) ?? 0;
    const greetingLine = eventFeed.greeting(view.id, time);
    const line = fxWiring?.npcLineFor(view.id, time) ?? greetingLine ?? speechByNpc.get(view.id)?.text;
    if (line) {
      speech?.show(`npc:${view.id}`, translate(line.ko, line.en), "npc");
      speech?.place(`npc:${view.id}`, npcDisplay.x, bubbleBase - emoteHeight, overlayScale);
    } else speech?.hide(`npc:${view.id}`);
    interactionFx?.trackActor(view.id, npc.sprite, groundPoint.x, groundPoint.y, view.facing, npcEmote, true);
  }

  const promptCandidates: StudioWorldPromptCandidate[] = [];
  if (promptInteraction) {
    const fxPromptLabel = interactionFx?.promptLabel(promptInteraction);
    promptCandidates.push({
      id: promptInteraction.id,
      kind: "interaction",
      point: promptInteraction.point,
      radius: promptInteraction.radius,
      labelKo: fxPromptLabel?.ko ?? promptInteraction.labelKo,
      labelEn: fxPromptLabel?.en ?? promptInteraction.labelEn,
    });
  }
  if (nearbyNpc && npcInteraction) {
    const identity = studioNpcLabel(nearbyNpc.definition);
    promptCandidates.push({
      id: nearbyNpc.definition.id,
      kind: "npc",
      point: nearbyNpc.groundPoint,
      radius: 55,
      labelKo: `${identity.ko} · 대화`,
      labelEn: `${identity.en} · Talk`,
    });
  }
  const placedCandidate = fxWiring?.placedPromptCandidate(currentPoint);
  if (placedCandidate) promptCandidates.push(placedCandidate);
  for (const portal of portals) promptCandidates.push(studioPortalPromptCandidate(manifest, portal));
  const promptTarget = blocked ? null : studioWorldPromptTarget(currentPoint, promptCandidates);
  const promptNpc = promptTarget?.kind === "npc" ? npcs.get(promptTarget.id) : undefined;
  promptRuntime?.update(promptTarget ? {
    target: promptTarget,
    anchorY: promptNpc
      ? promptNpc.sprite.y - promptNpc.sprite.displayHeight * promptNpc.sprite.originY - 26 * overlayScale
      : promptTarget.point.y - 58,
    label: translate(promptTarget.labelKo, promptTarget.labelEn),
  } : null, time, reducedMotion, overlayScale);
  const promptNpcId = promptNpc ? promptNpc.definition.id : null;
  if (promptNpcId !== lastPromptNpcId) {
    lastPromptNpcId = promptNpcId;
    if (promptNpcId && time - (npcNoticedAt.get(promptNpcId) ?? -Infinity) >= NPC_NOTICE_COOLDOWN_MS) {
      npcNoticedAt.set(promptNpcId, time);
      emotes?.play(`npc:${promptNpcId}`, "exclaim", time, "npc");
    }
  }

  if (worldReadyForHud && !blocked && eventFeed.due(time)) {
    const phasePreference = environment.dayPhase;
    eventFeed.begin(
      time,
      selfIdentity,
      currentPoint.x,
      currentPoint.y,
      speed,
      phasePreference === "auto" ? studioVirtualDayPhase(time) : phasePreference,
    );
    eventFeed.syncActors(peers, npcs.values(), (definition) => {
      const identity = studioNpcLabel(definition);
      return translate(identity.ko, identity.en);
    });
    eventFeed.run();
  }

  return {
    lastGuideRequestId,
    lastGuideState,
    nearbyNpcKey,
    lastPromptNpcId,
    chatterBubbles,
    visibleNpcCount,
  };
}
