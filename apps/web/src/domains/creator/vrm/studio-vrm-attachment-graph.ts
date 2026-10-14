import { studioDeterministicContentId } from "../studio-deterministic-serialization";

export interface StudioVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StudioEulerDegrees {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StudioTransform3d {
  readonly position: StudioVec3;
  readonly rotation: StudioEulerDegrees;
  readonly scale: StudioVec3;
}

export type StudioAttachmentKind = "figure" | "head" | "hand" | "prop" | "camera" | "light";

export interface StudioAttachmentConstraint {
  readonly type: "copy-position" | "copy-rotation" | "look-at" | "distance";
  readonly targetNodeId: string;
  readonly weight: number;
  readonly distance?: number;
}

export interface StudioAttachmentNode {
  readonly id: string;
  readonly kind: StudioAttachmentKind;
  readonly assetRevisionId: string;
  readonly parentNodeId?: string;
  readonly parentSocket?: string;
  readonly localTransform: StudioTransform3d;
  readonly constraints: readonly StudioAttachmentConstraint[];
  readonly visible: boolean;
  readonly locked: boolean;
}

export interface StudioAttachmentGraph {
  readonly version: 1;
  readonly revision: number;
  readonly nodes: readonly StudioAttachmentNode[];
}

const IDENTITY_TRANSFORM: StudioTransform3d = Object.freeze({
  position: Object.freeze({ x: 0, y: 0, z: 0 }),
  rotation: Object.freeze({ x: 0, y: 0, z: 0 }),
  scale: Object.freeze({ x: 1, y: 1, z: 1 }),
});

function finiteVec(value: StudioVec3, field: string): void {
  if (![value.x, value.y, value.z].every(Number.isFinite)) throw new TypeError(`${field} must be finite.`);
}

function validateTransform(transform: StudioTransform3d, field: string): void {
  finiteVec(transform.position, `${field}.position`);
  finiteVec(transform.rotation, `${field}.rotation`);
  finiteVec(transform.scale, `${field}.scale`);
  if ([transform.scale.x, transform.scale.y, transform.scale.z].some((value) => Math.abs(value) < 1e-6 || Math.abs(value) > 10_000)) {
    throw new RangeError(`${field}.scale is outside the supported range.`);
  }
}

function normalizeAngle(value: number): number {
  const normalized = ((value + 180) % 360 + 360) % 360 - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function addVec(left: StudioVec3, right: StudioVec3): StudioVec3 {
  return Object.freeze({ x: left.x + right.x, y: left.y + right.y, z: left.z + right.z });
}

function subtractVec(left: StudioVec3, right: StudioVec3): StudioVec3 {
  return Object.freeze({ x: left.x - right.x, y: left.y - right.y, z: left.z - right.z });
}

function multiplyVec(left: StudioVec3, right: StudioVec3): StudioVec3 {
  return Object.freeze({ x: left.x * right.x, y: left.y * right.y, z: left.z * right.z });
}

function divideVec(left: StudioVec3, right: StudioVec3): StudioVec3 {
  return Object.freeze({ x: left.x / right.x, y: left.y / right.y, z: left.z / right.z });
}

function rotateVector(vector: StudioVec3, rotation: StudioEulerDegrees): StudioVec3 {
  const rx = (rotation.x * Math.PI) / 180;
  const ry = (rotation.y * Math.PI) / 180;
  const rz = (rotation.z * Math.PI) / 180;
  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);
  const x1 = vector.x;
  const y1 = vector.y * cosX - vector.z * sinX;
  const z1 = vector.y * sinX + vector.z * cosX;
  const x2 = x1 * cosY + z1 * sinY;
  const y2 = y1;
  const z2 = -x1 * sinY + z1 * cosY;
  return Object.freeze({
    x: x2 * cosZ - y2 * sinZ,
    y: x2 * sinZ + y2 * cosZ,
    z: z2,
  });
}

function inverseRotateVector(vector: StudioVec3, rotation: StudioEulerDegrees): StudioVec3 {
  return rotateVector(vector, { x: -rotation.x, y: -rotation.y, z: -rotation.z });
}

function composeTransform(parent: StudioTransform3d, local: StudioTransform3d): StudioTransform3d {
  const scaled = multiplyVec(local.position, parent.scale);
  const rotated = rotateVector(scaled, parent.rotation);
  return Object.freeze({
    position: addVec(parent.position, rotated),
    rotation: Object.freeze({
      x: normalizeAngle(parent.rotation.x + local.rotation.x),
      y: normalizeAngle(parent.rotation.y + local.rotation.y),
      z: normalizeAngle(parent.rotation.z + local.rotation.z),
    }),
    scale: multiplyVec(parent.scale, local.scale),
  });
}

function localFromWorld(parent: StudioTransform3d, world: StudioTransform3d): StudioTransform3d {
  const relative = inverseRotateVector(subtractVec(world.position, parent.position), parent.rotation);
  return Object.freeze({
    position: divideVec(relative, parent.scale),
    rotation: Object.freeze({
      x: normalizeAngle(world.rotation.x - parent.rotation.x),
      y: normalizeAngle(world.rotation.y - parent.rotation.y),
      z: normalizeAngle(world.rotation.z - parent.rotation.z),
    }),
    scale: divideVec(world.scale, parent.scale),
  });
}

export function validateStudioAttachmentGraph(graph: StudioAttachmentGraph): StudioAttachmentGraph {
  if (graph.version !== 1) throw new TypeError("unsupported attachment graph version.");
  if (!Number.isSafeInteger(graph.revision) || graph.revision < 0) throw new RangeError("attachment graph revision is invalid.");
  if (graph.nodes.length > 2_048) throw new RangeError("attachment graph exceeds its node budget.");
  const nodes = new Map<string, StudioAttachmentNode>();
  for (const node of graph.nodes) {
    if (!node.id.trim() || !node.assetRevisionId.trim()) throw new TypeError("attachment identity is required.");
    if (nodes.has(node.id)) throw new TypeError(`duplicate attachment node: ${node.id}`);
    validateTransform(node.localTransform, node.id);
    for (const constraint of node.constraints) {
      if (!constraint.targetNodeId.trim() || !Number.isFinite(constraint.weight) || constraint.weight < 0 || constraint.weight > 1) {
        throw new TypeError(`invalid attachment constraint on ${node.id}`);
      }
      if (constraint.type === "distance" && (!Number.isFinite(constraint.distance) || (constraint.distance ?? -1) < 0)) {
        throw new TypeError(`distance constraint on ${node.id} is invalid.`);
      }
    }
    nodes.set(node.id, node);
  }
  for (const node of graph.nodes) {
    if (node.parentNodeId && !nodes.has(node.parentNodeId)) throw new TypeError(`attachment parent is missing: ${node.parentNodeId}`);
    for (const constraint of node.constraints) {
      if (!nodes.has(constraint.targetNodeId)) throw new TypeError(`constraint target is missing: ${constraint.targetNodeId}`);
    }
  }
  for (const node of graph.nodes) {
    const seen = new Set<string>([node.id]);
    let parentId = node.parentNodeId;
    while (parentId) {
      if (seen.has(parentId)) throw new TypeError("attachment graph contains a parent cycle.");
      seen.add(parentId);
      parentId = nodes.get(parentId)?.parentNodeId;
    }
  }
  return graph;
}

export function resolveStudioAttachmentWorldTransforms(
  graph: StudioAttachmentGraph,
): ReadonlyMap<string, StudioTransform3d> {
  validateStudioAttachmentGraph(graph);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const world = new Map<string, StudioTransform3d>();
  const resolve = (id: string): StudioTransform3d => {
    const cached = world.get(id);
    if (cached) return cached;
    const node = nodes.get(id);
    if (!node) throw new TypeError(`attachment node not found: ${id}`);
    const value = node.parentNodeId
      ? composeTransform(resolve(node.parentNodeId), node.localTransform)
      : node.localTransform;
    world.set(id, value);
    return value;
  };
  for (const node of graph.nodes) resolve(node.id);
  return world;
}

export function reparentStudioAttachment(
  graph: StudioAttachmentGraph,
  nodeId: string,
  parentNodeId: string | undefined,
  parentSocket?: string,
): StudioAttachmentGraph {
  validateStudioAttachmentGraph(graph);
  if (nodeId === parentNodeId) throw new TypeError("attachment cannot parent itself.");
  const world = resolveStudioAttachmentWorldTransforms(graph);
  const nodeWorld = world.get(nodeId);
  if (!nodeWorld) throw new TypeError("attachment node does not exist.");
  const parentWorld = parentNodeId ? world.get(parentNodeId) : IDENTITY_TRANSFORM;
  if (parentNodeId && !parentWorld) throw new TypeError("new attachment parent does not exist.");
  const nodes = graph.nodes.map((node) =>
    node.id === nodeId
      ? Object.freeze({
          ...node,
          ...(parentNodeId ? { parentNodeId } : { parentNodeId: undefined }),
          ...(parentSocket ? { parentSocket } : { parentSocket: undefined }),
          localTransform: localFromWorld(parentWorld ?? IDENTITY_TRANSFORM, nodeWorld),
        })
      : node,
  );
  const next = Object.freeze({ ...graph, revision: graph.revision + 1, nodes: Object.freeze(nodes) });
  validateStudioAttachmentGraph(next);
  return next;
}

function lerp(left: number, right: number, weight: number): number {
  return left + (right - left) * weight;
}

export function applyStudioAttachmentConstraints(graph: StudioAttachmentGraph): StudioAttachmentGraph {
  const world = resolveStudioAttachmentWorldTransforms(graph);
  const nodes = graph.nodes.map((node) => {
    if (node.locked || node.constraints.length === 0) return node;
    let currentWorld = world.get(node.id) ?? node.localTransform;
    for (const constraint of node.constraints) {
      const target = world.get(constraint.targetNodeId);
      if (!target || constraint.weight <= 0) continue;
      if (constraint.type === "copy-position") {
        currentWorld = { ...currentWorld, position: Object.freeze({
          x: lerp(currentWorld.position.x, target.position.x, constraint.weight),
          y: lerp(currentWorld.position.y, target.position.y, constraint.weight),
          z: lerp(currentWorld.position.z, target.position.z, constraint.weight),
        }) };
      } else if (constraint.type === "copy-rotation") {
        currentWorld = { ...currentWorld, rotation: Object.freeze({
          x: lerp(currentWorld.rotation.x, target.rotation.x, constraint.weight),
          y: lerp(currentWorld.rotation.y, target.rotation.y, constraint.weight),
          z: lerp(currentWorld.rotation.z, target.rotation.z, constraint.weight),
        }) };
      } else if (constraint.type === "look-at") {
        const dx = target.position.x - currentWorld.position.x;
        const dy = target.position.y - currentWorld.position.y;
        const dz = target.position.z - currentWorld.position.z;
        const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
        const pitch = (-Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
        currentWorld = { ...currentWorld, rotation: Object.freeze({
          x: lerp(currentWorld.rotation.x, pitch, constraint.weight),
          y: lerp(currentWorld.rotation.y, yaw, constraint.weight),
          z: currentWorld.rotation.z,
        }) };
      } else {
        const desired = constraint.distance ?? 0;
        const delta = subtractVec(currentWorld.position, target.position);
        const length = Math.hypot(delta.x, delta.y, delta.z) || 1;
        const constrained = {
          x: target.position.x + (delta.x / length) * desired,
          y: target.position.y + (delta.y / length) * desired,
          z: target.position.z + (delta.z / length) * desired,
        };
        currentWorld = { ...currentWorld, position: Object.freeze({
          x: lerp(currentWorld.position.x, constrained.x, constraint.weight),
          y: lerp(currentWorld.position.y, constrained.y, constraint.weight),
          z: lerp(currentWorld.position.z, constrained.z, constraint.weight),
        }) };
      }
    }
    const parentWorld = node.parentNodeId ? world.get(node.parentNodeId) : IDENTITY_TRANSFORM;
    return Object.freeze({
      ...node,
      localTransform: localFromWorld(parentWorld ?? IDENTITY_TRANSFORM, currentWorld),
    });
  });
  const next = Object.freeze({ ...graph, revision: graph.revision + 1, nodes: Object.freeze(nodes) });
  validateStudioAttachmentGraph(next);
  return next;
}

/* ── 소켓 카탈로그 + 그립 프리셋 (장착 기본값) ─────────────────────────
 * 종전에는 parentSocket이 자유 문자열이라 소품마다 제각각인 오프셋을 손으로 맞춰야 했고,
 * 양손 그립·어깨 멜빵 같은 접촉 패턴이 기본값으로 존재하지 않았다.
 * 아래 카탈로그가 표준 소켓(기본 로컬 트랜스폼 포함)을 단일 진실 원천으로 고정하고,
 * 그립 프리셋이 "소품을 골르면 곧바로 접촉이 맞는 상태"를 장착 기본값으로 제공한다.
 * 검증(validate)은 기존 문서 호환을 위해 자유 소켓을 계속 허용하고, 카탈로그 대조는
 * findStudioAttachmentSocket 같은 조회 API로 분리한다.
 */
export type StudioAttachmentSocketContact = "grip" | "support" | "strap" | "surface" | "loop";

export interface StudioAttachmentSocketDef {
  readonly id: string;
  readonly label: string;
  readonly contact: StudioAttachmentSocketContact;
  /** 소켓 기준 기본 로컬 트랜스폼(부모 노드 로컬, 미터/도). */
  readonly defaultLocalTransform: StudioTransform3d;
}

function socketTransform(x: number, y: number, z: number): StudioTransform3d {
  return Object.freeze({
    position: Object.freeze({ x, y, z }),
    rotation: Object.freeze({ x: 0, y: 0, z: 0 }),
    scale: Object.freeze({ x: 1, y: 1, z: 1 }),
  });
}

export const STUDIO_ATTACHMENT_SOCKET_CATALOG: readonly StudioAttachmentSocketDef[] = Object.freeze([
  Object.freeze({ id: "hand-right-grip", label: "오른손 그립", contact: "grip", defaultLocalTransform: IDENTITY_TRANSFORM }),
  Object.freeze({ id: "hand-left-grip", label: "왼손 그립", contact: "grip", defaultLocalTransform: IDENTITY_TRANSFORM }),
  Object.freeze({ id: "hand-right-support", label: "오른손 받침", contact: "support", defaultLocalTransform: IDENTITY_TRANSFORM }),
  Object.freeze({ id: "hand-left-support", label: "왼손 받침", contact: "support", defaultLocalTransform: IDENTITY_TRANSFORM }),
  Object.freeze({ id: "shoulder-strap-right", label: "오른쪽 어깨 멜빵", contact: "strap", defaultLocalTransform: socketTransform(0.2, 0.06, 0) }),
  Object.freeze({ id: "shoulder-strap-left", label: "왼쪽 어깨 멜빵", contact: "strap", defaultLocalTransform: socketTransform(-0.2, 0.06, 0) }),
  Object.freeze({ id: "back-carrier", label: "등 부착", contact: "surface", defaultLocalTransform: socketTransform(0, 0, -0.12) }),
  Object.freeze({ id: "neck-loop", label: "목 걸이", contact: "loop", defaultLocalTransform: socketTransform(0, -0.04, 0.03) }),
  Object.freeze({ id: "head-top", label: "머리 위", contact: "surface", defaultLocalTransform: socketTransform(0, 0.1, 0) }),
  Object.freeze({ id: "face-bridge", label: "콧등", contact: "surface", defaultLocalTransform: socketTransform(0, 0.02, 0.07) }),
  Object.freeze({ id: "waist-right", label: "오른쪽 허리", contact: "strap", defaultLocalTransform: socketTransform(0.14, -0.02, 0) }),
  Object.freeze({ id: "waist-left", label: "왼쪽 허리", contact: "strap", defaultLocalTransform: socketTransform(-0.14, -0.02, 0) }),
]);

const SOCKET_BY_ID = new Map(STUDIO_ATTACHMENT_SOCKET_CATALOG.map((socket) => [socket.id, socket]));

export function findStudioAttachmentSocket(socketId: string): StudioAttachmentSocketDef | undefined {
  return SOCKET_BY_ID.get(socketId);
}

export type StudioGripPresetId =
  | "one-hand-grip"
  | "two-hand-grip"
  | "one-hand-support"
  | "two-hand-support"
  | "shoulder-strap"
  | "back-carrier"
  | "neck-loop"
  | "head-wear";

export interface StudioGripPreset {
  readonly id: StudioGripPresetId;
  readonly label: string;
  readonly contact: StudioAttachmentSocketContact;
  /** 주 소켓 id를 손(side) 기준으로 고른다. */
  readonly primarySocketId: (side: "left" | "right") => string;
  /** 양손 프리셋에서만 존재하는 보조 소켓 id. */
  readonly secondarySocketId?: (side: "left" | "right") => string;
  /** 양손 프리셋에서 보조 손 노드까지 유지할 접촉 간격(미터, distance 제약). */
  readonly secondarySpanMeters?: number;
}

const otherSide = (side: "left" | "right"): "left" | "right" => (side === "left" ? "right" : "left");

export const STUDIO_ATTACHMENT_GRIP_PRESETS: readonly StudioGripPreset[] = Object.freeze([
  Object.freeze({ id: "one-hand-grip", label: "한손 그립", contact: "grip", primarySocketId: (side: "left" | "right") => `hand-${side}-grip` }),
  Object.freeze({
    id: "two-hand-grip", label: "양손 그립", contact: "grip",
    primarySocketId: (side: "left" | "right") => `hand-${side}-grip`,
    secondarySocketId: (side: "left" | "right") => `hand-${otherSide(side)}-grip`,
    secondarySpanMeters: 0.16,
  }),
  Object.freeze({ id: "one-hand-support", label: "한손 받침", contact: "support", primarySocketId: (side: "left" | "right") => `hand-${side}-support` }),
  Object.freeze({
    id: "two-hand-support", label: "양손 받침", contact: "support",
    primarySocketId: (side: "left" | "right") => `hand-${side}-support`,
    secondarySocketId: (side: "left" | "right") => `hand-${otherSide(side)}-support`,
    secondarySpanMeters: 0.22,
  }),
  Object.freeze({ id: "shoulder-strap", label: "어깨 멜빵", contact: "strap", primarySocketId: (side: "left" | "right") => `shoulder-strap-${side}` }),
  Object.freeze({ id: "back-carrier", label: "등 부착", contact: "surface", primarySocketId: () => "back-carrier" }),
  Object.freeze({ id: "neck-loop", label: "목 걸이", contact: "loop", primarySocketId: () => "neck-loop" }),
  Object.freeze({ id: "head-wear", label: "머리 착용", contact: "surface", primarySocketId: () => "head-top" }),
]);

const GRIP_PRESET_BY_ID = new Map(STUDIO_ATTACHMENT_GRIP_PRESETS.map((preset) => [preset.id, preset]));

export function findStudioGripPreset(presetId: StudioGripPresetId): StudioGripPreset | undefined {
  return GRIP_PRESET_BY_ID.get(presetId);
}

/**
 * 그립 프리셋으로 부착 노드를 만든다 — 소품 장착의 기본값 경로.
 * 소켓·기본 트랜스폼은 카탈로그에서 오고, 양손 프리셋은 보조 손 노드가 주어졌을 때만
 * 접촉 간격을 유지하는 distance 제약을 단다(보조 손이 없으면 제약을 만들지 않는다).
 */
export function createStudioAttachmentNodeFromGripPreset(input: {
  readonly id: string;
  readonly assetRevisionId: string;
  readonly presetId: StudioGripPresetId;
  readonly side?: "left" | "right";
  readonly parentNodeId: string;
  readonly secondaryParentNodeId?: string;
  readonly localTransform?: StudioTransform3d;
}): StudioAttachmentNode {
  const preset = findStudioGripPreset(input.presetId);
  if (!preset) throw new TypeError(`unknown grip preset: ${input.presetId}`);
  const side = input.side ?? "right";
  const socketId = preset.primarySocketId(side);
  const socket = findStudioAttachmentSocket(socketId);
  if (!socket) throw new TypeError(`grip preset socket is missing from the catalog: ${socketId}`);
  const constraints: StudioAttachmentConstraint[] = [];
  if (preset.secondarySocketId && input.secondaryParentNodeId && preset.secondarySpanMeters !== undefined) {
    constraints.push(Object.freeze({
      type: "distance",
      targetNodeId: input.secondaryParentNodeId,
      weight: 1,
      distance: preset.secondarySpanMeters,
    }));
  }
  const node: StudioAttachmentNode = Object.freeze({
    id: input.id,
    kind: preset.contact === "grip" || preset.contact === "support" ? "hand" : "prop",
    assetRevisionId: input.assetRevisionId,
    parentNodeId: input.parentNodeId,
    parentSocket: socket.id,
    localTransform: input.localTransform ?? socket.defaultLocalTransform,
    constraints: Object.freeze(constraints),
    visible: true,
    locked: false,
  });
  validateTransform(node.localTransform, node.id);
  return node;
}

export interface StudioAttachmentTransaction {
  readonly id: string;
  readonly before: StudioAttachmentGraph;
  readonly after: StudioAttachmentGraph;
  readonly beforeHash: string;
  readonly afterHash: string;
}

export function createStudioAttachmentTransaction(
  id: string,
  before: StudioAttachmentGraph,
  after: StudioAttachmentGraph,
): StudioAttachmentTransaction {
  validateStudioAttachmentGraph(before);
  validateStudioAttachmentGraph(after);
  if (!id.trim()) throw new TypeError("attachment transaction id is required.");
  return Object.freeze({
    id: id.trim(),
    before,
    after,
    beforeHash: studioDeterministicContentId(before),
    afterHash: studioDeterministicContentId(after),
  });
}
