import * as THREE from "three";

import {
  studioSpaceEmoteById,
  studioSpaceEmoteDurationMs,
} from "../studio-virtual-space-emote-catalog";
import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import type { StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import type { StudioThreeLightingPreset } from "./studio-virtual-space-three-hdri-controller";
import type { StudioThreeActorNode } from "./studio-virtual-space-three-scene";

export const STUDIO_THREE_LIGHTING_PRESET_STORAGE_KEY = "toonstudio:three-lighting-preset:v1";

export function isStudioThreeLightingPreset(value: unknown): value is StudioThreeLightingPreset {
  return value === "day" || value === "studio" || value === "night";
}

export function studioThreeFillLightIntensity(preset: StudioThreeLightingPreset): number {
  switch (preset) {
    case "studio":
      return 0.6;
    case "night":
      return 0.22;
    case "day":
      return 0.35;
  }
}

export function readStoredStudioThreeLightingPreset(
  fallback: StudioThreeLightingPreset,
  storage: Pick<Storage, "getItem"> | null | undefined = typeof globalThis !== "undefined" ? globalThis.sessionStorage : null,
): StudioThreeLightingPreset {
  try {
    const raw = storage?.getItem(STUDIO_THREE_LIGHTING_PRESET_STORAGE_KEY);
    return isStudioThreeLightingPreset(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredStudioThreeLightingPreset(
  preset: StudioThreeLightingPreset,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof globalThis !== "undefined" ? globalThis.sessionStorage : null,
): void {
  try {
    storage?.setItem(STUDIO_THREE_LIGHTING_PRESET_STORAGE_KEY, preset);
  } catch {
    // Storage access can be blocked in privacy mode; ignore and keep runtime state.
  }
}

export function isStudioThreeCameraOrbitKey(code: string): boolean {
  return code === "KeyQ" || code === "KeyE" || code === "BracketLeft" || code === "BracketRight";
}

export function computeStudioThreeCameraOrbitDelta(input: {
  readonly keysDown: ReadonlySet<string>;
  readonly dt: number;
  readonly closestInteraction: unknown | null;
  readonly nearbyNpcCount: number;
}): number {
  let direction = 0;
  if (input.keysDown.has("KeyQ") || input.keysDown.has("BracketLeft")) {
    direction -= 1;
  }
  const canUseKeyEForCamera = input.closestInteraction === null && input.nearbyNpcCount === 0;
  if (input.keysDown.has("BracketRight") || (input.keysDown.has("KeyE") && canUseKeyEForCamera)) {
    direction += 1;
  }
  return direction * 1.45 * input.dt;
}

export function resetStudioThreeActorLimbs(node: StudioThreeActorNode): void {
  const baseLeftZ = node.armDownZLeft ?? 1.16;
  const baseRightZ = node.armDownZRight ?? -1.16;
  node.leftLeg.rotation.set(0, 0, 0);
  node.rightLeg.rotation.set(0, 0, 0);
  node.leftArm.rotation.set(0, 0, 0);
  node.rightArm.rotation.set(0, 0, 0);
  node.rigGroup.rotation.set(0, 0, 0);
  node.rigGroup.position.y = 0;
  if (node.vrmLeftUpperLeg) node.vrmLeftUpperLeg.rotation.set(0, 0, 0);
  if (node.vrmRightUpperLeg) node.vrmRightUpperLeg.rotation.set(0, 0, 0);
  if (node.vrmLeftUpperArm) {
    node.vrmLeftUpperArm.rotation.set(0.06, 0, baseLeftZ);
  }
  if (node.vrmRightUpperArm) {
    node.vrmRightUpperArm.rotation.set(0.06, 0, baseRightZ);
  }
  if (node.vrmLeftLowerArm) node.vrmLeftLowerArm.rotation.set(0, -0.14, 0);
  if (node.vrmRightLowerArm) node.vrmRightLowerArm.rotation.set(0, 0.14, 0);
  const expr = node.vrm?.expressionManager;
  if (expr) {
    expr.setValue("happy", 0);
    expr.setValue("relaxed", 0);
    expr.setValue("surprised", 0);
  }
}

export function triggerStudioThreeActorEmote(
  node: StudioThreeActorNode,
  emoteId: string,
  now: number,
  durationMs = studioSpaceEmoteDurationMs(emoteId),
): void {
  const safeNow = Number.isFinite(now) ? now : 0;
  const safeDuration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 2_400;
  node.emoteId = emoteId;
  node.emoteStartedAt = safeNow;
  node.emoteUntil = safeNow + safeDuration;
}

export function consumeAndSyncStudioThreeEmotes(input: {
  readonly bridge: Pick<StudioVirtualSpaceEngineBridge, "consumeEmote">;
  readonly snapshot: StudioVirtualSpaceSnapshot;
  readonly selfNode: StudioThreeActorNode;
  readonly actorNodes: ReadonlyMap<string, StudioThreeActorNode>;
  readonly now: number;
}): void {
  const { bridge, snapshot, selfNode, actorNodes, now } = input;
  const consumed = bridge.consumeEmote();
  if (consumed) {
    triggerStudioThreeActorEmote(selfNode, consumed, now);
  } else if (
    snapshot.selfReaction
    && (selfNode.emoteId !== snapshot.selfReaction || (selfNode.emoteUntil ?? 0) <= now)
  ) {
    triggerStudioThreeActorEmote(selfNode, snapshot.selfReaction, now);
  } else if (
    snapshot.self.emote
    && snapshot.self.emote !== "sit"
    && (selfNode.emoteId !== snapshot.self.emote || (selfNode.emoteUntil ?? 0) <= now)
  ) {
    triggerStudioThreeActorEmote(selfNode, snapshot.self.emote, now);
  }

  for (const reaction of snapshot.peerReactions) {
    const peerNode = actorNodes.get(`peer:${reaction.sessionId}`);
    if (!peerNode) continue;
    if (peerNode.emoteId !== reaction.reaction || (peerNode.emoteUntil ?? 0) <= now) {
      triggerStudioThreeActorEmote(peerNode, reaction.reaction, now);
    }
  }

  for (const peer of snapshot.peers) {
    const peerNode = actorNodes.get(`peer:${peer.participant.sessionId}`);
    if (!peerNode) continue;
    if (peer.state.emote === "sit" && !peerNode.moving) {
      peerNode.seated = true;
    } else if (peerNode.moving) {
      peerNode.seated = false;
    }
    if (
      peer.state.emote
      && peer.state.emote !== "sit"
      && (peerNode.emoteId !== peer.state.emote || (peerNode.emoteUntil ?? 0) <= now)
    ) {
      triggerStudioThreeActorEmote(peerNode, peer.state.emote, now);
    }
  }
}

function applyVrmEmoteExpression(node: StudioThreeActorNode, emoteId: string | null): void {
  const expr = node.vrm?.expressionManager;
  if (!expr) return;
  expr.setValue("happy", 0);
  expr.setValue("relaxed", 0);
  expr.setValue("surprised", 0);
  if (!emoteId) return;

  const def = studioSpaceEmoteById(emoteId);
  const expression = def?.expression ?? (
    emoteId === "wave" || emoteId === "dance" || emoteId === "cheer" || emoteId === "celebrate"
      ? "happy"
      : emoteId === "sit" || emoteId === "sleep" || emoteId === "bow"
        ? "calm"
        : null
  );
  if (expression === "happy" || expression === "wave") {
    expr.setValue("happy", 0.85);
  } else if (expression === "surprised") {
    expr.setValue("surprised", 0.85);
  } else if (expression === "calm") {
    expr.setValue("relaxed", 0.75);
  }
}

export function applyStudioThreeActorPose(
  node: StudioThreeActorNode,
  now: number,
  dt: number,
): void {
  const baseLeftZ = node.armDownZLeft ?? 1.16;
  const baseRightZ = node.armDownZRight ?? -1.16;
  const hadEmote = Boolean(node.emoteId);
  const emoteExpired = hadEmote && (node.moving || (node.emoteUntil ?? 0) <= now);
  if (emoteExpired) {
    node.emoteId = null;
    node.emoteStartedAt = 0;
    node.emoteUntil = 0;
    resetStudioThreeActorLimbs(node);
  }

  const emoteActive = !node.moving && Boolean(node.emoteId) && (node.emoteUntil ?? 0) > now;
  applyVrmEmoteExpression(node, emoteActive ? (node.emoteId ?? null) : null);

  if (node.moving) {
    const walkPhase = now * 0.011;
    const swing = Math.sin(walkPhase) * 0.42;
    const elbowLeft = Math.max(0.05, -swing * 0.55);
    const elbowRight = Math.max(0.05, swing * 0.55);
    node.leftLeg.rotation.x = swing;
    node.rightLeg.rotation.x = -swing;
    node.leftArm.rotation.x = -swing * 0.65;
    node.rightArm.rotation.x = swing * 0.65;
    node.leftArm.rotation.z = 0;
    node.rightArm.rotation.z = 0;
    if (node.vrmLeftUpperLeg) node.vrmLeftUpperLeg.rotation.x = swing * 0.65;
    if (node.vrmRightUpperLeg) node.vrmRightUpperLeg.rotation.x = -swing * 0.65;
    if (node.vrmLeftUpperArm) {
      node.vrmLeftUpperArm.rotation.z = baseLeftZ;
      node.vrmLeftUpperArm.rotation.x = 0.06 - swing * 0.45;
    }
    if (node.vrmRightUpperArm) {
      node.vrmRightUpperArm.rotation.z = baseRightZ;
      node.vrmRightUpperArm.rotation.x = 0.06 + swing * 0.45;
    }
    if (node.vrmLeftLowerArm) {
      node.vrmLeftLowerArm.rotation.x = elbowLeft;
      node.vrmLeftLowerArm.rotation.z = 0;
    }
    if (node.vrmRightLowerArm) {
      node.vrmRightLowerArm.rotation.x = elbowRight;
      node.vrmRightLowerArm.rotation.z = 0;
    }
    node.rigGroup.position.y = Math.abs(Math.cos(walkPhase)) * 0.045;
    node.rigGroup.rotation.set(0, 0, 0);
  } else if (emoteActive && node.emoteId) {
    const emoteId = node.emoteId;
    const motion = studioSpaceEmoteById(emoteId)?.motion ?? emoteId;
    if (emoteId === "wave" || motion === "pop") {
      const wave = Math.sin(now * 0.016) * 0.45;
      node.rightArm.rotation.x = -2.2 + wave * 0.35;
      node.rightArm.rotation.z = -0.45 + wave;
      node.leftArm.rotation.x = 0;
      node.leftArm.rotation.z = 0;
      if (node.vrmRightUpperArm) {
        node.vrmRightUpperArm.rotation.z = 0.65 + wave * 0.5;
        node.vrmRightUpperArm.rotation.x = -0.35;
      }
      if (node.vrmRightLowerArm) node.vrmRightLowerArm.rotation.z = wave * 0.6;
      if (node.vrmLeftUpperArm) {
        node.vrmLeftUpperArm.rotation.z = baseLeftZ;
        node.vrmLeftUpperArm.rotation.x = 0.06;
      }
      node.rigGroup.position.y = node.seated ? -0.22 : Math.abs(Math.sin(now * 0.008)) * 0.04;
      node.rigGroup.rotation.set(0, 0, 0);
    } else if (
      motion === "dance"
      || motion === "kpop-dance"
      || motion === "shuffle"
      || motion === "moonwalk"
    ) {
      const beat = now * 0.015;
      const bounce = Math.abs(Math.sin(beat)) * 0.16 + 0.02;
      const spin = Math.sin(beat * 0.5) * 0.55 + 0.08;
      node.rigGroup.position.y = (node.seated ? -0.22 : 0) + bounce;
      node.rigGroup.rotation.set(0, spin, Math.cos(beat * 0.5) * 0.12);
      node.leftArm.rotation.x = -1.15 + Math.sin(beat) * 0.65;
      node.rightArm.rotation.x = -1.15 - Math.sin(beat) * 0.65;
      node.leftLeg.rotation.x = node.seated ? -1.35 : Math.sin(beat) * 0.38;
      node.rightLeg.rotation.x = node.seated ? -1.35 : -Math.sin(beat) * 0.38;
      if (node.vrmLeftUpperArm) {
        node.vrmLeftUpperArm.rotation.z = baseLeftZ * 0.45 + Math.sin(beat) * 0.35;
        node.vrmLeftUpperArm.rotation.x = -0.65 + Math.cos(beat) * 0.4;
      }
      if (node.vrmRightUpperArm) {
        node.vrmRightUpperArm.rotation.z = baseRightZ * 0.45 + Math.sin(beat) * 0.35;
        node.vrmRightUpperArm.rotation.x = -0.65 - Math.cos(beat) * 0.4;
      }
      if (node.vrmLeftUpperLeg) node.vrmLeftUpperLeg.rotation.x = node.seated ? -1.35 : Math.sin(beat) * 0.35;
      if (node.vrmRightUpperLeg) node.vrmRightUpperLeg.rotation.x = node.seated ? -1.35 : -Math.sin(beat) * 0.35;
    } else if (
      motion === "sway"
      || motion === "yoga"
      || motion === "doze"
      || motion === "neck-stretch"
      || motion === "tai-chi"
      || motion === "shake"
      || emoteId === "think"
      || emoteId === "yoga"
      || emoteId === "bow"
    ) {
      const tilt = Math.sin(now * 0.006) * 0.16 + 0.12;
      node.rigGroup.rotation.set(emoteId === "bow" ? 0.45 : 0.1, 0, tilt);
      node.rigGroup.position.y = (node.seated ? -0.22 : 0) + Math.sin(now * 0.005) * 0.025;
      node.rightArm.rotation.x = -0.95;
      node.leftArm.rotation.x = -0.35;
      if (node.vrmRightUpperArm) {
        node.vrmRightUpperArm.rotation.z = baseRightZ * 0.65;
        node.vrmRightUpperArm.rotation.x = -0.85;
      }
      if (node.vrmLeftUpperArm) {
        node.vrmLeftUpperArm.rotation.z = baseLeftZ * 0.8;
        node.vrmLeftUpperArm.rotation.x = -0.25;
      }
    } else {
      // hop / cheers / celebratory bounce
      const bounce = Math.abs(Math.sin(now * 0.014)) * 0.22 + 0.04;
      const armSwing = Math.sin(now * 0.018) * 0.35;
      node.rigGroup.position.y = (node.seated ? -0.22 : 0) + bounce;
      node.rigGroup.rotation.set(0, 0, 0);
      node.leftArm.rotation.x = -1.6 + armSwing;
      node.rightArm.rotation.x = -1.6 - armSwing;
      if (node.vrmLeftUpperArm) {
        node.vrmLeftUpperArm.rotation.z = baseLeftZ * 0.35;
        node.vrmLeftUpperArm.rotation.x = -1.1 + armSwing;
      }
      if (node.vrmRightUpperArm) {
        node.vrmRightUpperArm.rotation.z = baseRightZ * 0.35;
        node.vrmRightUpperArm.rotation.x = -1.1 - armSwing;
      }
    }
    if (node.seated && motion !== "dance" && motion !== "kpop-dance" && motion !== "shuffle" && motion !== "moonwalk") {
      node.leftLeg.rotation.x = -1.35;
      node.rightLeg.rotation.x = -1.35;
      if (node.vrmLeftUpperLeg) node.vrmLeftUpperLeg.rotation.x = -1.35;
      if (node.vrmRightUpperLeg) node.vrmRightUpperLeg.rotation.x = -1.35;
    }
  } else if (node.seated) {
    node.leftLeg.rotation.x = -1.35;
    node.rightLeg.rotation.x = -1.35;
    if (node.vrmLeftUpperLeg) node.vrmLeftUpperLeg.rotation.x = -1.35;
    if (node.vrmRightUpperLeg) node.vrmRightUpperLeg.rotation.x = -1.35;
    node.leftArm.rotation.x = THREE.MathUtils.lerp(node.leftArm.rotation.x, -0.25, 0.2);
    node.rightArm.rotation.x = THREE.MathUtils.lerp(node.rightArm.rotation.x, -0.25, 0.2);
    node.leftArm.rotation.z = THREE.MathUtils.lerp(node.leftArm.rotation.z, 0, 0.2);
    node.rightArm.rotation.z = THREE.MathUtils.lerp(node.rightArm.rotation.z, 0, 0.2);
    if (node.vrmLeftUpperArm) {
      node.vrmLeftUpperArm.rotation.z = baseLeftZ;
      node.vrmLeftUpperArm.rotation.x = -0.2;
    }
    if (node.vrmRightUpperArm) {
      node.vrmRightUpperArm.rotation.z = baseRightZ;
      node.vrmRightUpperArm.rotation.x = -0.2;
    }
    node.rigGroup.position.y = -0.22;
    node.rigGroup.rotation.set(0, 0, 0);
  } else {
    node.leftLeg.rotation.x = THREE.MathUtils.lerp(node.leftLeg.rotation.x, 0, 0.2);
    node.rightLeg.rotation.x = THREE.MathUtils.lerp(node.rightLeg.rotation.x, 0, 0.2);
    node.leftArm.rotation.x = THREE.MathUtils.lerp(node.leftArm.rotation.x, 0, 0.2);
    node.rightArm.rotation.x = THREE.MathUtils.lerp(node.rightArm.rotation.x, 0, 0.2);
    node.leftArm.rotation.z = THREE.MathUtils.lerp(node.leftArm.rotation.z, 0, 0.2);
    node.rightArm.rotation.z = THREE.MathUtils.lerp(node.rightArm.rotation.z, 0, 0.2);
    if (node.vrmLeftUpperLeg) node.vrmLeftUpperLeg.rotation.x = THREE.MathUtils.lerp(node.vrmLeftUpperLeg.rotation.x, 0, 0.2);
    if (node.vrmRightUpperLeg) node.vrmRightUpperLeg.rotation.x = THREE.MathUtils.lerp(node.vrmRightUpperLeg.rotation.x, 0, 0.2);
    if (node.vrmLeftUpperArm) {
      node.vrmLeftUpperArm.rotation.z = baseLeftZ + Math.sin(now * 0.0022) * 0.02;
      node.vrmLeftUpperArm.rotation.x = THREE.MathUtils.lerp(node.vrmLeftUpperArm.rotation.x, 0.06, 0.2);
    }
    if (node.vrmRightUpperArm) {
      node.vrmRightUpperArm.rotation.z = baseRightZ - Math.sin(now * 0.0022) * 0.02;
      node.vrmRightUpperArm.rotation.x = THREE.MathUtils.lerp(node.vrmRightUpperArm.rotation.x, 0.06, 0.2);
    }
    if (node.vrmLeftLowerArm) {
      node.vrmLeftLowerArm.rotation.x = THREE.MathUtils.lerp(node.vrmLeftLowerArm.rotation.x, 0, 0.2);
      node.vrmLeftLowerArm.rotation.z = THREE.MathUtils.lerp(node.vrmLeftLowerArm.rotation.z, 0, 0.2);
    }
    if (node.vrmRightLowerArm) {
      node.vrmRightLowerArm.rotation.x = THREE.MathUtils.lerp(node.vrmRightLowerArm.rotation.x, 0, 0.2);
      node.vrmRightLowerArm.rotation.z = THREE.MathUtils.lerp(node.vrmRightLowerArm.rotation.z, 0, 0.2);
    }
    node.rigGroup.position.y = Math.sin(now * 0.003) * 0.015;
    node.rigGroup.rotation.set(0, 0, 0);
  }

  node.vrm?.update(dt);
}
