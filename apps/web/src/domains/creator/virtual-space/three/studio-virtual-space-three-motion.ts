import * as THREE from "three";

import { studioCameraLerp, STUDIO_GAIT_DISTANCE_PER_CYCLE, STUDIO_PEER_TELEPORT_DISTANCE } from "../studio-virtual-space-presentation";
import {
  studioSpaceEmoteById,
  studioSpaceEmoteDurationMs,
} from "../studio-virtual-space-emote-catalog";
import type { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";
import type { StudioVirtualSpaceSnapshot } from "../studio-virtual-space-presence";
import { STUDIO_THREE_SCALE } from "./studio-virtual-space-three-coordinates";
import type { StudioThreeLightingPreset } from "./studio-virtual-space-three-hdri-controller";
import type { StudioThreeActorNode } from "./studio-virtual-space-three-scene";
import type { StudioThreeVisemeFrame } from "./studio-virtual-space-three-stage-props";
import { applyStudioThreeVrmaGesturePose } from "./studio-virtual-space-three-vrma-emotes";

export const STUDIO_THREE_LIGHTING_PRESET_STORAGE_KEY = "toonstudio:three-lighting-preset:v1";

/** VRM 1.0 표준 18 프리셋 표정 키. */
export const STUDIO_THREE_VRM_PRESET_EXPRESSIONS = Object.freeze([
  "happy", "angry", "sad", "relaxed", "surprised",
  "aa", "ih", "ou", "ee", "oh",
  "blink", "blinkLeft", "blinkRight",
  "lookUp", "lookDown", "lookLeft", "lookRight",
  "neutral",
] as const);

/** Hero VRM 1.0 8종 확장 8 커스텀 표정 키. */
export const STUDIO_THREE_VRM_CUSTOM_EXPRESSIONS = Object.freeze([
  "big-smile", "flustered", "half-lidded", "shadowed-neutral",
  "shout", "smirk", "teary", "wink",
] as const);

export type StudioThreeVrmExpressionName =
  | (typeof STUDIO_THREE_VRM_PRESET_EXPRESSIONS)[number]
  | (typeof STUDIO_THREE_VRM_CUSTOM_EXPRESSIONS)[number];

const VISEME_KEYS = ["aa", "ih", "ou", "ee", "oh"] as const;
const EMOTE_CUSTOM_EXPRESSION_MAP: Readonly<Record<string, (typeof STUDIO_THREE_VRM_CUSTOM_EXPRESSIONS)[number]>> = Object.freeze({
  laugh: "big-smile",
  heart: "flustered",
  sleep: "half-lidded",
  exclaim: "shout",
  cheers: "wink",
  "kpop-dance": "wink",
  think: "smirk",
});

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
  storage?: Pick<Storage, "getItem"> | null,
): StudioThreeLightingPreset {
  try {
    const target = storage === undefined ? globalThis.sessionStorage : storage;
    const raw = target?.getItem(STUDIO_THREE_LIGHTING_PRESET_STORAGE_KEY);
    return isStudioThreeLightingPreset(raw) ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredStudioThreeLightingPreset(
  preset: StudioThreeLightingPreset,
  storage?: Pick<Storage, "setItem"> | null,
): void {
  if (!isStudioThreeLightingPreset(preset)) return;
  try {
    const target = storage === undefined ? globalThis.sessionStorage : storage;
    target?.setItem(STUDIO_THREE_LIGHTING_PRESET_STORAGE_KEY, preset);
  } catch {
    // 저장소 getter 자체가 차단돼도 현재 화면의 선택은 유지한다.
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

/** 18 프리셋 및 8 커스텀 표정을 안전하게 설정한다. */
export function applyStudioThreeVrmExpression(
  node: StudioThreeActorNode,
  expressionName: StudioThreeVrmExpressionName,
  weight: number,
): boolean {
  const expr = node.vrm?.expressionManager;
  if (!expr) return false;
  const clamped = Number.isFinite(weight) ? Math.min(1, Math.max(0, weight)) : 0;
  expr.setValue(expressionName, clamped);
  return true;
}

/** 3~6초 지터 주기로 자연스러운 자동 눈깜빡임(`blink`)을 구동한다. */
export function updateStudioThreeActorAutoBlink(
  node: StudioThreeActorNode,
  now: number,
  jitterSample?: number,
): number {
  const expr = node.vrm?.expressionManager;
  if (!expr || !Number.isFinite(now)) return 0;

  if (node.nextBlinkAt === undefined) {
    const seed = jitterSample !== undefined
      ? Math.min(1, Math.max(0, jitterSample))
      : (((node.id.charCodeAt(0) || 17) * 37) % 100) / 100;
    node.nextBlinkAt = now + 3_000 + seed * 3_000;
    return 0;
  }

  const blinkDurationMs = 140;
  if (node.blinkStartedAt === undefined && now >= node.nextBlinkAt) {
    node.blinkStartedAt = now - node.nextBlinkAt < blinkDurationMs ? node.nextBlinkAt : now;
  }
  if (node.blinkStartedAt !== undefined) {
    const elapsed = now - node.blinkStartedAt;
    if (elapsed >= 0 && elapsed < blinkDurationMs) {
      const half = blinkDurationMs / 2;
      const weight = elapsed <= half ? elapsed / half : 1 - (elapsed - half) / half;
      expr.setValue("blink", weight);
      node.blinkWasActive = true;
      return weight;
    }
    node.blinkStartedAt = undefined;
    const nextJitter = jitterSample !== undefined
      ? Math.min(1, Math.max(0, jitterSample))
      : ((Math.sin(now * 0.0017) + 1) * 0.5);
    node.nextBlinkAt = now + 3_000 + nextJitter * 3_000;
  }

  if (node.blinkWasActive) {
    expr.setValue("blink", 0);
    node.blinkWasActive = false;
  }
  return 0;
}

/** 음성/허들 Viseme(`aa`/`ih`/`ou`/`ee`/`oh`)를 실시간 립싱크 블렌드한다. */
export function applyStudioThreeVisemeFrame(
  node: StudioThreeActorNode,
  frame: StudioThreeVisemeFrame | null | undefined,
): void {
  const expr = node.vrm?.expressionManager;
  if (!expr) return;
  if (!frame) {
    if (!node.visemeActive) return;
    for (const key of VISEME_KEYS) expr.setValue(key, 0);
    node.visemeActive = false;
    return;
  }
  let anyActive = false;
  for (const key of VISEME_KEYS) {
    const raw = frame[key];
    const weight = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
    if (weight > 0.005) anyActive = true;
    expr.setValue(key, weight);
  }
  node.visemeActive = anyActive;
}

/** `vrm.lookAt` 및 목·머리 본을 근접 대상 방향으로 자연스럽게 응시시킨다. */
export function updateStudioThreeActorLookAt(
  node: StudioThreeActorNode,
  targetWorldPos: THREE.Vector3 | null,
  dt = 0.016,
): void {
  const blend = studioCameraLerp(dt, 0.14);
  const lookAt = node.vrm?.lookAt;
  if (!targetWorldPos) {
    if (lookAt) lookAt.target = null;
    if (node.vrmNeck) {
      node.vrmNeck.rotation.y = THREE.MathUtils.lerp(node.vrmNeck.rotation.y, 0, blend);
      node.vrmNeck.rotation.x = THREE.MathUtils.lerp(node.vrmNeck.rotation.x, 0, blend);
    }
    if (node.vrmHead) {
      node.vrmHead.rotation.y = THREE.MathUtils.lerp(node.vrmHead.rotation.y, 0, blend);
      node.vrmHead.rotation.x = THREE.MathUtils.lerp(node.vrmHead.rotation.x, 0, blend);
    }
    return;
  }

  const dx = targetWorldPos.x - node.group.position.x;
  const dz = targetWorldPos.z - node.group.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 6.5 || dist < 0.15) {
    if (lookAt) lookAt.target = null;
    return;
  }

  if (lookAt) {
    if (typeof lookAt.lookAt === "function") {
      lookAt.lookAt(targetWorldPos);
    } else {
      const proxy = (node.lookAtProxy ??= new THREE.Object3D());
      proxy.position.copy(targetWorldPos);
      lookAt.target = proxy;
    }
  }

  const worldYaw = Math.atan2(dx, dz);
  let relYaw = worldYaw - node.currentYaw;
  while (relYaw > Math.PI) relYaw -= Math.PI * 2;
  while (relYaw < -Math.PI) relYaw += Math.PI * 2;
  const clampedYaw = THREE.MathUtils.clamp(relYaw, -0.45, 0.45);
  const eyeY = node.seated ? 1.12 : 1.52;
  const clampedPitch = THREE.MathUtils.clamp(-Math.atan2(targetWorldPos.y - eyeY, dist), -0.22, 0.22);

  if (node.vrmNeck) {
    node.vrmNeck.rotation.y = THREE.MathUtils.lerp(node.vrmNeck.rotation.y, clampedYaw * 0.4, blend);
    node.vrmNeck.rotation.x = THREE.MathUtils.lerp(node.vrmNeck.rotation.x, clampedPitch * 0.4, blend);
  }
  if (node.vrmHead) {
    node.vrmHead.rotation.y = THREE.MathUtils.lerp(node.vrmHead.rotation.y, clampedYaw * 0.6, blend);
    node.vrmHead.rotation.x = THREE.MathUtils.lerp(node.vrmHead.rotation.x, clampedPitch * 0.6, blend);
  }
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
  if (node.vrmHips) node.vrmHips.position.y = node.vrmHipsBaseY ?? 0;
  if (node.vrmSpine) node.vrmSpine.rotation.set(0, 0, 0);
  if (node.vrmChest) node.vrmChest.rotation.set(0, 0, 0);
  if (node.vrmNeck) node.vrmNeck.rotation.set(0, 0, 0);
  if (node.vrmHead) node.vrmHead.rotation.set(0, 0, 0);
  if (node.vrmLeftUpperLeg) node.vrmLeftUpperLeg.rotation.set(0, 0, 0);
  if (node.vrmRightUpperLeg) node.vrmRightUpperLeg.rotation.set(0, 0, 0);
  if (node.vrmLeftLowerLeg) node.vrmLeftLowerLeg.rotation.set(0, 0, 0);
  if (node.vrmRightLowerLeg) node.vrmRightLowerLeg.rotation.set(0, 0, 0);
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
  const supportsCustom = (name: string) =>
    typeof expr.getExpression === "function" ? Boolean(expr.getExpression(name)) : false;

  for (const custom of STUDIO_THREE_VRM_CUSTOM_EXPRESSIONS) {
    if (supportsCustom(custom)) expr.setValue(custom, 0);
  }
  expr.setValue("happy", 0);
  expr.setValue("relaxed", 0);
  expr.setValue("surprised", 0);
  if (!emoteId) return;

  const customMatch = EMOTE_CUSTOM_EXPRESSION_MAP[emoteId];
  if (customMatch && supportsCustom(customMatch)) {
    expr.setValue(customMatch, 0.8);
  }

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

function updateWalkPhase(node: StudioThreeActorNode, dt: number): { readonly phase: number; readonly blend: number } {
  const { x, z } = node.group.position;
  const gait = node.gait ??= { x, z, phase: 0 };
  const distance = Math.hypot(x - gait.x, z - gait.z) / STUDIO_THREE_SCALE;
  const prevBlend = typeof node.group.userData.gaitBlend === "number" ? node.group.userData.gaitBlend : 0;
  let nextBlend: number;
  if (node.moving && distance <= STUDIO_PEER_TELEPORT_DISTANCE) {
    gait.phase = (gait.phase + distance * 2 * Math.PI / STUDIO_GAIT_DISTANCE_PER_CYCLE) % (2 * Math.PI);
    nextBlend = Math.min(1, prevBlend + (1 - prevBlend) * Math.min(1, dt * 14));
  } else {
    // 정지 시 위상을 0으로 강제 초기화해 다리가 뚝 끊기는 스냅을 방지하고 가장 가까운 접지 위상으로 부드럽게 감쇠한다.
    const nearestRest = Math.round(gait.phase / Math.PI) * Math.PI;
    gait.phase += (nearestRest - gait.phase) * Math.min(1, dt * 12);
    nextBlend = prevBlend * Math.exp(-dt * 12);
    if (nextBlend < 0.02) {
      nextBlend = 0;
      gait.phase = 0;
    }
  }
  node.group.userData.gaitBlend = nextBlend;
  gait.x = x;
  gait.z = z;
  return { phase: gait.phase, blend: nextBlend };
}

function applySeatedLegsAndHips(node: StudioThreeActorNode): void {
  node.leftLeg.rotation.x = -1.35;
  node.rightLeg.rotation.x = -1.35;
  if (node.vrmLeftUpperLeg) node.vrmLeftUpperLeg.rotation.x = -1.35;
  if (node.vrmRightUpperLeg) node.vrmRightUpperLeg.rotation.x = -1.35;
  if (node.vrmLeftLowerLeg) node.vrmLeftLowerLeg.rotation.x = 1.35;
  if (node.vrmRightLowerLeg) node.vrmRightLowerLeg.rotation.x = 1.35;
  if (node.vrmHips) node.vrmHips.position.y = (node.vrmHipsBaseY ?? 0) - 0.32;
}

function applyBreathingPose(node: StudioThreeActorNode, now: number): void {
  if (node.vrmSpine) node.vrmSpine.rotation.x = Math.sin(now * 0.0022) * 0.018;
  if (node.vrmChest) node.vrmChest.rotation.x = Math.sin(now * 0.0022 - 0.35) * 0.024;
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

  // 자동 눈깜빡임은 이모트 표정 이전에 평가해 만료 원복 시퀀스를 보존한다.
  updateStudioThreeActorAutoBlink(node, now);
  const emoteActive = !node.moving && Boolean(node.emoteId) && (node.emoteUntil ?? 0) > now;
  applyVrmEmoteExpression(node, emoteActive ? (node.emoteId ?? null) : null);

  const { phase: walkPhase, blend: walkBlend } = updateWalkPhase(node, dt);
  const jumpHeight = typeof node.group.userData.jumpHeight === "number" ? Math.max(0, node.group.userData.jumpHeight) : 0;
  const restBlend = studioCameraLerp(dt, 0.2);
  if (node.moving || (!node.seated && !emoteActive && walkBlend > 0.05)) {
    const swing = Math.sin(walkPhase) * 0.42 * (node.moving ? 1 : walkBlend);
    const elbowLeft = Math.max(0.05, -swing * 0.55);
    const elbowRight = Math.max(0.05, swing * 0.55);
    const kneeLeft = Math.max(0, -swing * 0.72);
    const kneeRight = Math.max(0, swing * 0.72);
    node.leftLeg.rotation.x = swing;
    node.rightLeg.rotation.x = -swing;
    node.leftArm.rotation.x = -swing * 0.65;
    node.rightArm.rotation.x = swing * 0.65;
    node.leftArm.rotation.z = 0;
    node.rightArm.rotation.z = 0;
    if (node.vrmHips) node.vrmHips.position.y = node.vrmHipsBaseY ?? 0;
    if (node.vrmLeftUpperLeg) node.vrmLeftUpperLeg.rotation.x = swing * 0.65;
    if (node.vrmRightUpperLeg) node.vrmRightUpperLeg.rotation.x = -swing * 0.65;
    if (node.vrmLeftLowerLeg) node.vrmLeftLowerLeg.rotation.x = kneeLeft;
    if (node.vrmRightLowerLeg) node.vrmRightLowerLeg.rotation.x = kneeRight;
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
    node.rigGroup.position.y = Math.sin(walkPhase) ** 2 * 0.012 * (node.moving ? 1 : walkBlend) + jumpHeight;
    node.rigGroup.rotation.set(0, 0, 0);
  } else if (emoteActive && node.emoteId) {
    const emoteId = node.emoteId;
    const motion = studioSpaceEmoteById(emoteId)?.motion ?? emoteId;
    const elapsedSec = Math.max(0, (now - (node.emoteStartedAt ?? now)) / 1000);
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
      if (node.vrmLeftLowerLeg) node.vrmLeftLowerLeg.rotation.x = node.seated ? 1.35 : Math.max(0, -Math.sin(beat) * 0.3);
      if (node.vrmRightLowerLeg) node.vrmRightLowerLeg.rotation.x = node.seated ? 1.35 : Math.max(0, Math.sin(beat) * 0.3);
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
    // kit-v2 16종 손포즈·제스처 프로시저럴 손가락·팔 관절 연동
    applyStudioThreeVrmaGesturePose(node, emoteId, elapsedSec);
    if (node.seated && motion !== "dance" && motion !== "kpop-dance" && motion !== "shuffle" && motion !== "moonwalk") {
      applySeatedLegsAndHips(node);
    }
  } else if (node.seated) {
    node.group.userData.gaitBlend = 0;
    applySeatedLegsAndHips(node);
    applyBreathingPose(node, now);
    // 데스크 착석 중 은은한 작화·타이핑 팔 움직임으로 생동감을 더한다.
    const deskWork = Math.sin(now * 0.008) * 0.07;
    node.leftArm.rotation.x = THREE.MathUtils.lerp(node.leftArm.rotation.x, -0.34 + deskWork * 0.4, restBlend);
    node.rightArm.rotation.x = THREE.MathUtils.lerp(node.rightArm.rotation.x, -0.36 - deskWork, restBlend);
    node.leftArm.rotation.z = THREE.MathUtils.lerp(node.leftArm.rotation.z, 0.06, restBlend);
    node.rightArm.rotation.z = THREE.MathUtils.lerp(node.rightArm.rotation.z, -0.06, restBlend);
    if (node.vrmLeftUpperArm) {
      node.vrmLeftUpperArm.rotation.z = baseLeftZ;
      node.vrmLeftUpperArm.rotation.x = -0.28 + deskWork * 0.35;
    }
    if (node.vrmRightUpperArm) {
      node.vrmRightUpperArm.rotation.z = baseRightZ;
      node.vrmRightUpperArm.rotation.x = -0.3 - deskWork * 0.7;
    }
    node.rigGroup.position.y = -0.22;
    node.rigGroup.rotation.set(0, 0, 0);
  } else {
    applyBreathingPose(node, now);
    node.leftLeg.rotation.x = THREE.MathUtils.lerp(node.leftLeg.rotation.x, jumpHeight > 0.05 ? -0.25 : 0, restBlend);
    node.rightLeg.rotation.x = THREE.MathUtils.lerp(node.rightLeg.rotation.x, jumpHeight > 0.05 ? 0.22 : 0, restBlend);
    node.leftArm.rotation.x = THREE.MathUtils.lerp(node.leftArm.rotation.x, jumpHeight > 0.05 ? -0.45 : 0, restBlend);
    node.rightArm.rotation.x = THREE.MathUtils.lerp(node.rightArm.rotation.x, jumpHeight > 0.05 ? -0.45 : 0, restBlend);
    node.leftArm.rotation.z = THREE.MathUtils.lerp(node.leftArm.rotation.z, 0, restBlend);
    node.rightArm.rotation.z = THREE.MathUtils.lerp(node.rightArm.rotation.z, 0, restBlend);
    if (node.vrmHips) node.vrmHips.position.y = THREE.MathUtils.lerp(node.vrmHips.position.y, node.vrmHipsBaseY ?? 0, restBlend);
    if (node.vrmLeftUpperLeg) node.vrmLeftUpperLeg.rotation.x = THREE.MathUtils.lerp(node.vrmLeftUpperLeg.rotation.x, jumpHeight > 0.05 ? -0.25 : 0, restBlend);
    if (node.vrmRightUpperLeg) node.vrmRightUpperLeg.rotation.x = THREE.MathUtils.lerp(node.vrmRightUpperLeg.rotation.x, jumpHeight > 0.05 ? 0.2 : 0, restBlend);
    if (node.vrmLeftLowerLeg) node.vrmLeftLowerLeg.rotation.x = THREE.MathUtils.lerp(node.vrmLeftLowerLeg.rotation.x, jumpHeight > 0.05 ? 0.35 : 0, restBlend);
    if (node.vrmRightLowerLeg) node.vrmRightLowerLeg.rotation.x = THREE.MathUtils.lerp(node.vrmRightLowerLeg.rotation.x, jumpHeight > 0.05 ? 0.25 : 0, restBlend);
    const idleLeftZ = node.vrm ? Math.sign(baseLeftZ || 1) * 1.36 : baseLeftZ;
    const idleRightZ = node.vrm ? Math.sign(baseRightZ || -1) * 1.36 : baseRightZ;
    if (node.vrmLeftUpperArm) {
      node.vrmLeftUpperArm.rotation.z = idleLeftZ + Math.sin(now * 0.0022) * 0.018;
      node.vrmLeftUpperArm.rotation.x = THREE.MathUtils.lerp(node.vrmLeftUpperArm.rotation.x, jumpHeight > 0.05 ? -0.35 : 0.05, restBlend);
    }
    if (node.vrmRightUpperArm) {
      node.vrmRightUpperArm.rotation.z = idleRightZ - Math.sin(now * 0.0022) * 0.018;
      node.vrmRightUpperArm.rotation.x = THREE.MathUtils.lerp(node.vrmRightUpperArm.rotation.x, jumpHeight > 0.05 ? -0.35 : 0.05, restBlend);
    }
    if (node.vrmLeftLowerArm) {
      node.vrmLeftLowerArm.rotation.x = THREE.MathUtils.lerp(node.vrmLeftLowerArm.rotation.x, node.vrm ? 0.06 : 0, restBlend);
      node.vrmLeftLowerArm.rotation.y = THREE.MathUtils.lerp(node.vrmLeftLowerArm.rotation.y, node.vrm ? -0.16 : 0, restBlend);
      node.vrmLeftLowerArm.rotation.z = THREE.MathUtils.lerp(node.vrmLeftLowerArm.rotation.z, 0, restBlend);
    }
    if (node.vrmRightLowerArm) {
      node.vrmRightLowerArm.rotation.x = THREE.MathUtils.lerp(node.vrmRightLowerArm.rotation.x, node.vrm ? 0.06 : 0, restBlend);
      node.vrmRightLowerArm.rotation.y = THREE.MathUtils.lerp(node.vrmRightLowerArm.rotation.y, node.vrm ? 0.16 : 0, restBlend);
      node.vrmRightLowerArm.rotation.z = THREE.MathUtils.lerp(node.vrmRightLowerArm.rotation.z, 0, restBlend);
    }
    node.rigGroup.position.y = jumpHeight > 0.01 ? jumpHeight : THREE.MathUtils.lerp(node.rigGroup.position.y, 0, restBlend);
    node.rigGroup.rotation.set(0, 0, 0);
  }

  node.vrm?.update(dt);
}
