/**
 * Portal arrival/departure, bridge teleport, and unstuck rescue transitions
 * for `StudioVirtualSpacePhaserCanvas`.
 */

import type { StudioVirtualSpaceEngineBridge } from "./studio-virtual-space-engine-bridge";
import type { StudioStuckDetector } from "./studio-virtual-space-engine-events";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioMotionEaser } from "./studio-virtual-space-motion-easing";
import type { StudioFixedStepClock, StudioFixedStepPose } from "./studio-virtual-space-presentation";
import {
  EMPTY_STUDIO_WORLD_APPROACH,
  EMPTY_STUDIO_WORLD_WALK_OVER,
  resolveStudioWorldPortalArrival,
  resolveStudioWorldUnstuck,
  type StudioWorldApproachState,
  type StudioWorldPortalArrival,
  type StudioWorldPortalTracker,
  type StudioWorldWalkOverState,
} from "./studio-virtual-space-runtime-policy";
import { playStudioSfxSound } from "./studio-virtual-space-sound-engine";
import type { StudioWorldFeelController } from "./studio-virtual-space-world-feel";
import {
  studioWorldRoomAt,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldPortalDefinition,
} from "./studio-virtual-space-world-manifest";
import { resolveStudioWorldSpawn } from "./studio-virtual-space-world-pathfinding";
import {
  beginStudioZoneDepartureTransition,
  beginStudioZonePortalTransition,
  type StudioZoneTransitionState,
} from "./studio-virtual-space-zone-transition";

export interface StudioPhaserPortalTeleportMutableState {
  zoneTransition: StudioZoneTransitionState;
  pendingPortalArrival: StudioWorldPortalArrival | null;
  pendingBridgeTeleport: StudioVirtualSpacePoint | null;
  pendingDeparturePortal: StudioWorldPortalDefinition | null;
  arrivalRingPoint: StudioVirtualSpacePoint | null;
  motion: { velocity: StudioVirtualSpacePoint };
  path: readonly StudioVirtualSpacePoint[];
  previousRendered: StudioVirtualSpacePoint | null;
  lastWalkablePoint: StudioVirtualSpacePoint;
  lastPosition: StudioVirtualSpacePoint | null;
  lastPublishedPoint: StudioVirtualSpacePoint | null;
  approachState: StudioWorldApproachState;
  walkOverState: StudioWorldWalkOverState;
}

export interface StepStudioPhaserPortalAndTeleportParams {
  readonly state: StudioPhaserPortalTeleportMutableState;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly navigationWorld: StudioVirtualSpaceWorldManifest;
  readonly portals: readonly StudioWorldPortalDefinition[];
  readonly portalTracker: StudioWorldPortalTracker;
  readonly bridge: StudioVirtualSpaceEngineBridge;
  readonly localBody: import("phaser").GameObjects.Zone;
  readonly localBodyPhysics: import("phaser").Physics.Arcade.Body;
  readonly localPose: StudioFixedStepPose;
  readonly fixedStepClock: StudioFixedStepClock;
  readonly motionEaser: StudioMotionEaser;
  readonly stuckDetector: StudioStuckDetector;
  readonly worldFeel: StudioWorldFeelController;
  readonly lastAppliedVelocity: { x: number; y: number };
  readonly resetCollisionResponse: () => void;
  readonly emitStuck: (changed: boolean) => void;
  readonly onPortal?: (portal: StudioWorldPortalDefinition) => void;
  readonly onCancelFollow: () => void;
  readonly currentPoint: StudioVirtualSpacePoint;
  readonly time: number;
  readonly blocked: boolean;
  readonly worldReadyForHud: boolean;
  readonly reducedMotion: boolean;
  readonly transitionTeleportDueNow: boolean;
}

export interface StepStudioPhaserPortalAndTeleportResult {
  readonly currentPoint: StudioVirtualSpacePoint;
  readonly portal: StudioWorldPortalDefinition | null;
  readonly snapCamera: boolean;
  readonly teleportTarget: StudioVirtualSpacePoint | null;
}

export function stepStudioPhaserPortalAndTeleport(
  params: StepStudioPhaserPortalAndTeleportParams,
): StepStudioPhaserPortalAndTeleportResult {
  const {
    state,
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
    onPortal,
    onCancelFollow,
    time,
    blocked,
    worldReadyForHud,
    reducedMotion,
    transitionTeleportDueNow,
  } = params;

  let currentPoint = params.currentPoint;
  let portal: StudioWorldPortalDefinition | null = null;
  let snapCamera = false;
  const teleportRequest = worldReadyForHud ? bridge.consumeTeleport() : null;
  let teleportTarget = teleportRequest ? resolveStudioWorldSpawn(navigationWorld, teleportRequest) : null;

  if (teleportTarget && state.zoneTransition.phase === "idle") {
    state.pendingBridgeTeleport = teleportTarget;
    state.zoneTransition = beginStudioZonePortalTransition(state.zoneTransition, {
      zoneId: studioWorldRoomAt(manifest, teleportTarget),
      now: time,
      reducedMotion,
    });
    localBodyPhysics.setVelocity(0, 0);
    state.motion = { velocity: { x: 0, y: 0 } };
    state.path = [];
    teleportTarget = null;
  }

  if (transitionTeleportDueNow && state.pendingPortalArrival) {
    const arrival = state.pendingPortalArrival;
    state.pendingPortalArrival = null;
    localBodyPhysics.reset(arrival.body.x, arrival.body.y);
    localPose.reset(arrival.body, fixedStepClock.time);
    state.previousRendered = null;
    state.motion = { velocity: arrival.velocity };
    localBodyPhysics.setVelocity(arrival.velocity.x, arrival.velocity.y);
    resetCollisionResponse();
    lastAppliedVelocity.x = arrival.velocity.x;
    lastAppliedVelocity.y = arrival.velocity.y;
    state.path = [];
    bridge.clearMovement();
    state.lastPosition = arrival.body;
    currentPoint = arrival.body;
    state.approachState = EMPTY_STUDIO_WORLD_APPROACH;
    state.arrivalRingPoint = arrival.body;
    snapCamera = true;
    if (arrival.portal) onPortal?.(arrival.portal);
  } else if (transitionTeleportDueNow && state.pendingBridgeTeleport) {
    const target = state.pendingBridgeTeleport;
    state.pendingBridgeTeleport = null;
    localBodyPhysics.reset(target.x, target.y);
    localBody.setPosition(target.x, target.y);
    localPose.reset(target, fixedStepClock.time);
    state.previousRendered = null;
    state.motion = { velocity: { x: 0, y: 0 } };
    motionEaser.reset();
    localBodyPhysics.setVelocity(0, 0);
    state.path = [];
    state.walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
    state.approachState = EMPTY_STUDIO_WORLD_APPROACH;
    if (bridge.getFollowingPeer()) {
      bridge.setFollowingPeer(null);
      onCancelFollow();
    }
    portalTracker.seed(portals, target);
    state.lastWalkablePoint = target;
    state.lastPosition = target;
    currentPoint = target;
    state.lastPublishedPoint = null;
    state.arrivalRingPoint = target;
    snapCamera = true;
    emitStuck(stuckDetector.reset());
    worldFeel.resetStuck();
    resetCollisionResponse();
  } else if (teleportTarget) {
    localBodyPhysics.reset(teleportTarget.x, teleportTarget.y);
    localBody.setPosition(teleportTarget.x, teleportTarget.y);
    localPose.reset(teleportTarget, fixedStepClock.time);
    state.previousRendered = null;
    state.motion = { velocity: { x: 0, y: 0 } };
    motionEaser.reset();
    localBodyPhysics.setVelocity(0, 0);
    state.path = [];
    state.walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
    state.approachState = EMPTY_STUDIO_WORLD_APPROACH;
    if (bridge.getFollowingPeer()) {
      bridge.setFollowingPeer(null);
      onCancelFollow();
    }
    portalTracker.seed(portals, teleportTarget);
    state.lastWalkablePoint = teleportTarget;
    state.lastPosition = teleportTarget;
    currentPoint = teleportTarget;
    state.lastPublishedPoint = null;
    snapCamera = true;
    emitStuck(stuckDetector.reset());
    worldFeel.resetStuck();
    resetCollisionResponse();
  } else if (bridge.consumeUnstuck()) {
    const rescue = resolveStudioWorldUnstuck(navigationWorld, currentPoint);
    if (rescue.spawn) {
      localBodyPhysics.reset(rescue.spawn.x, rescue.spawn.y);
      localPose.reset(rescue.spawn, fixedStepClock.time);
      state.previousRendered = null;
      state.motion = { velocity: rescue.velocity };
      localBodyPhysics.setVelocity(rescue.velocity.x, rescue.velocity.y);
      state.path = [];
      state.walkOverState = EMPTY_STUDIO_WORLD_WALK_OVER;
      state.approachState = EMPTY_STUDIO_WORLD_APPROACH;
      bridge.setFollowingPeer(null);
      state.lastPosition = rescue.spawn;
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
      state.motion.velocity,
      reducedMotion,
    );
    portal = arrival.portal;
    const moved = arrival.body.x !== currentPoint.x || arrival.body.y !== currentPoint.y;
    if (portal?.href) {
      if (state.zoneTransition.phase === "idle") {
        playStudioSfxSound("portal", 0.9);
        state.zoneTransition = beginStudioZoneDepartureTransition(state.zoneTransition, {
          now: time,
          reducedMotion,
        });
        state.pendingDeparturePortal = portal;
        localBodyPhysics.setVelocity(0, 0);
        state.motion = { velocity: { x: 0, y: 0 } };
        state.path = [];
      } else {
        onPortal?.(portal);
      }
    } else if (portal && moved) {
      if (state.zoneTransition.phase === "idle") {
        playStudioSfxSound("portal", 0.9);
        state.pendingPortalArrival = arrival;
        state.zoneTransition = beginStudioZonePortalTransition(state.zoneTransition, {
          zoneId: studioWorldRoomAt(manifest, arrival.body),
          now: time,
          reducedMotion,
        });
        localBodyPhysics.setVelocity(0, 0);
        state.motion = { velocity: { x: 0, y: 0 } };
        state.path = [];
        bridge.clearMovement();
      } else {
        localBodyPhysics.reset(arrival.body.x, arrival.body.y);
        localPose.reset(arrival.body, fixedStepClock.time);
        state.previousRendered = null;
        state.motion = { velocity: arrival.velocity };
        localBodyPhysics.setVelocity(arrival.velocity.x, arrival.velocity.y);
        state.path = [];
        bridge.clearMovement();
        state.lastPosition = arrival.body;
        currentPoint = arrival.body;
        state.approachState = EMPTY_STUDIO_WORLD_APPROACH;
        snapCamera = true;
        onPortal?.(portal);
      }
    } else if (portal) {
      onPortal?.(portal);
    }
  }

  return { currentPoint, portal, snapCamera, teleportTarget };
}
