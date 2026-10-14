import {
  compileStudioClothXpbdModelV2,
  createStudioClothXpbdRuntimeV2,
  stepStudioClothXpbdV2,
  type StudioClothXpbdCapsuleFrameV2,
  type StudioClothXpbdCompiledModelV2,
  type StudioClothXpbdFailureCodeV2,
  type StudioClothXpbdKinematicPinV2,
} from "../studio-cloth-xpbd-kernel-v2";
import { sha256HexPortable } from "../studio-sha256";

import type {
  StudioVrmXpbdSkirtCapsuleProxy,
  StudioVrmXpbdSkirtMetrics,
  StudioVrmXpbdSkirtVec3,
  StudioVrmXpbdSkirtWaistFrame,
} from "./studio-vrm-xpbd-skirt";

/**
 * Deterministic XPBD cloth authority for non-skirt wardrobe garments
 * (상의/하의/아우터), extending `studio-vrm-xpbd-skirt.ts`.
 *
 * Scope decision (mannequin §5.4-3·P3): realtime cloth for every garment is
 * outside the performance budget, so version one ships ONLY the
 * "포즈 확정 시 베이크" (bake-on-pose-confirm) mode. A bake runs the same
 * rest-to-pose XPBD solve as the skirt authority, but it is triggered once
 * when the user confirms a pose — never per frame. `planStudioVrmXpbdGarmentBake`
 * is the gate that enforces that policy; there is deliberately no realtime
 * entry point in this module.
 *
 * Garment shapes are closed-ring tube stacks, mirroring the skirt topology:
 * - `top` / `outer-short` / `outer-long`: one torso tube pinned at the chest
 *   ring, hanging down past the waist (outer-long continues over the thighs).
 * - `bottom-pants` / `bottom-shorts`: two leg tubes pinned at the hip ring,
 *   following the thigh (and calf, for pants) capsule polylines.
 *
 * Self collision stays disabled, exactly like the skirt v1 contract.
 */

export const STUDIO_VRM_XPBD_GARMENT_BAKE_VERSION = 1 as const;
export const STUDIO_VRM_XPBD_GARMENT_SELF_COLLISION_ENABLED = false as const;
export const STUDIO_VRM_XPBD_GARMENT_SIMULATION_MODE = "bake-on-pose-confirm" as const;

export type StudioVrmXpbdGarmentSimulationMode = typeof STUDIO_VRM_XPBD_GARMENT_SIMULATION_MODE;

export const STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS = Object.freeze({
  maxParticles: 768,
  maxTriangles: 1_536,
  maxCapsules: 6,
  maxSolverIterations: 8,
  maxRestToPoseSteps: 24,
  /** Deterministic work proxy: particles × solver iterations × bake steps. */
  maxBakeWorkUnits: 120_000,
  maxCoordinateMagnitude: 10,
  minSegments: 12,
  maxSegments: 64,
  minRings: 3,
  maxRings: 16,
});

const MIN_VECTOR_LENGTH = 1e-6;
const MIN_CAPSULE_RADIUS = 0.004;
const MAX_CAPSULE_RADIUS = 0.5;
/** Final particle-vs-capsule penetration tolerated after contact projection (1mm, skirt parity). */
const MAX_FINAL_PENETRATION_M = 0.001;
const CONTACT_PROJECTION_PASSES = 8;

export type StudioVrmXpbdGarmentKind =
  | "top"
  | "outer-short"
  | "outer-long"
  | "bottom-pants"
  | "bottom-shorts";

export type StudioVrmXpbdGarmentSlot = "top" | "bottom" | "outer";

export type StudioVrmXpbdGarmentVec3 = StudioVrmXpbdSkirtVec3;
/** Model-local anchor frame. For torso garments the centre sits at the chest
 * ring; for leg garments it supplies the ring basis at the waist. */
export type StudioVrmXpbdGarmentAnchorFrame = StudioVrmXpbdSkirtWaistFrame;
export type StudioVrmXpbdGarmentCapsuleProxy = StudioVrmXpbdSkirtCapsuleProxy;
export type StudioVrmXpbdGarmentMetrics = StudioVrmXpbdSkirtMetrics;

export interface StudioVrmXpbdGarmentBodyProxies {
  /** Torso garments: spine→chest capsule. Leg garments: not required. */
  readonly torso?: StudioVrmXpbdGarmentCapsuleProxy;
  readonly hips: StudioVrmXpbdGarmentCapsuleProxy;
  readonly leftThigh: StudioVrmXpbdGarmentCapsuleProxy;
  readonly rightThigh: StudioVrmXpbdGarmentCapsuleProxy;
  /** Required by `bottom-pants` and `outer-long`. */
  readonly leftCalf?: StudioVrmXpbdGarmentCapsuleProxy;
  /** Required by `bottom-pants` and `outer-long`. */
  readonly rightCalf?: StudioVrmXpbdGarmentCapsuleProxy;
  /** Torso garments: keeps the tube off the upper arms. */
  readonly leftUpperArm?: StudioVrmXpbdGarmentCapsuleProxy;
  /** Torso garments: keeps the tube off the upper arms. */
  readonly rightUpperArm?: StudioVrmXpbdGarmentCapsuleProxy;
}

export interface StudioVrmXpbdGarmentTopologyInput {
  readonly kind: StudioVrmXpbdGarmentKind;
  readonly metrics: StudioVrmXpbdGarmentMetrics;
  readonly restAnchor: StudioVrmXpbdGarmentAnchorFrame;
  /** Measured physical body, independent of garment fit. */
  readonly restBody?: StudioVrmXpbdGarmentBodyProxies;
  readonly fit?: number;
  readonly segmentCount?: number;
  readonly ringCount?: number;
  readonly solverIterations?: number;
  readonly topologyEpoch?: number;
}

export interface StudioVrmXpbdGarmentTubeDimensions {
  readonly id: string;
  /** Anchor clearance added outside the measured body radius, in metres. */
  readonly clearanceM: number;
  readonly startRadiusX: number;
  readonly startRadiusZ: number;
  readonly endRadiusX: number;
  readonly endRadiusZ: number;
  readonly lengthM: number;
  readonly particleRadius: number;
}

export interface StudioVrmXpbdGarmentTopology {
  readonly version: typeof STUDIO_VRM_XPBD_GARMENT_BAKE_VERSION;
  readonly kind: StudioVrmXpbdGarmentKind;
  readonly slot: StudioVrmXpbdGarmentSlot;
  readonly mode: StudioVrmXpbdGarmentSimulationMode;
  readonly segmentCount: number;
  readonly ringCount: number;
  readonly tubeCount: number;
  readonly particleCount: number;
  readonly triangleCount: number;
  readonly solverIterations: number;
  readonly selfCollisionEnabled: typeof STUDIO_VRM_XPBD_GARMENT_SELF_COLLISION_ENABLED;
  readonly tubes: readonly StudioVrmXpbdGarmentTubeDimensions[];
  readonly restAnchor: StudioVrmXpbdGarmentAnchorFrame;
  readonly restPositions: Float32Array;
  readonly uvs: Float32Array;
  readonly triangleIndices: Uint32Array;
  /** Ring-0 particles of every tube; kinematically pinned during a bake. */
  readonly pinnedParticleIndices: Uint32Array;
  readonly compiledModel: StudioClothXpbdCompiledModelV2;
  readonly topologySha256: string;
}

export interface StudioVrmXpbdGarmentBakeInput {
  /** Required generation fence for stale asynchronous pose jobs. */
  readonly expectedPoseGeneration: number;
  readonly poseGeneration: number;
  /** Required topology fence. Callers must echo `topology.topologySha256`. */
  readonly expectedTopologySha256: string;
  readonly currentAnchor: StudioVrmXpbdGarmentAnchorFrame;
  readonly body: StudioVrmXpbdGarmentBodyProxies;
  readonly restToPoseSteps?: number;
  readonly solverIterations?: number;
}

export interface StudioVrmXpbdGarmentBakeDiagnostics {
  readonly contactProjectionPasses: number;
  readonly contactProjectionMaxDisplacementM: number;
  readonly maxCapsulePenetration: number;
  readonly finalCapsulePenetrationById: Readonly<Record<string, number>>;
  readonly totalCapsuleContactCount: number;
  readonly bakeWorkUnits: number;
  readonly nonFiniteCount: 0;
}

export interface StudioVrmXpbdGarmentBakeReceipt {
  readonly kind: "studio-vrm-xpbd-garment-bake-receipt";
  readonly version: typeof STUDIO_VRM_XPBD_GARMENT_BAKE_VERSION;
  readonly complete: true;
  readonly mode: StudioVrmXpbdGarmentSimulationMode;
  readonly garmentKind: StudioVrmXpbdGarmentKind;
  readonly slot: StudioVrmXpbdGarmentSlot;
  readonly poseGeneration: number;
  readonly restToPoseSteps: number;
  readonly solverIterations: number;
  readonly particleCount: number;
  readonly triangleCount: number;
  readonly capsuleCount: number;
  readonly capsuleIds: readonly string[];
  readonly selfCollisionEnabled: typeof STUDIO_VRM_XPBD_GARMENT_SELF_COLLISION_ENABLED;
  readonly topologySha256: string;
  readonly kernelTopologySha256: string;
  readonly kernelReceiptChainSha256: string;
  readonly outputPositionsSha256: string;
  readonly outputSha256: string;
  readonly diagnostics: StudioVrmXpbdGarmentBakeDiagnostics;
  readonly receiptSha256: string;
}

export interface StudioVrmXpbdGarmentBakedMesh {
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly triangleIndices: Uint32Array;
  readonly receipt: StudioVrmXpbdGarmentBakeReceipt;
}

export type StudioVrmXpbdGarmentUnavailableCode =
  | "collision-unresolved"
  | "missing-input"
  | "invalid-input"
  | "budget-exceeded"
  | "stale-input"
  | "topology-mismatch"
  | "solver-unavailable"
  | "numerical-failure";

export interface StudioVrmXpbdGarmentUnavailable {
  readonly ok: false;
  readonly status: "unavailable";
  readonly code: StudioVrmXpbdGarmentUnavailableCode;
  readonly detail: string;
}

export type StudioVrmXpbdGarmentTopologyResult =
  | { readonly ok: true; readonly status: "ready"; readonly topology: StudioVrmXpbdGarmentTopology }
  | StudioVrmXpbdGarmentUnavailable;

export type StudioVrmXpbdGarmentBakeResult =
  | { readonly ok: true; readonly status: "ready"; readonly mesh: StudioVrmXpbdGarmentBakedMesh }
  | StudioVrmXpbdGarmentUnavailable;

/* ------------------------------------------------------------------ */
/* Bake gate — the "포즈 확정 시" policy.                              */
/* ------------------------------------------------------------------ */

export type StudioVrmXpbdGarmentBakePlan =
  | { readonly bake: true; readonly reason: "pose-confirmed" }
  | {
      readonly bake: false;
      readonly reason:
        | "pose-not-confirmed"
        | "already-baked-for-generation"
        | "invalid-generation";
    };

/**
 * Decides whether a bake may run. A bake is allowed exactly once per pose
 * generation, and only after the user confirms the pose. Pose edits alone
 * never trigger cloth work — that is what keeps the garment cloth inside
 * the performance budget on the posing loop.
 */
export function planStudioVrmXpbdGarmentBake(input: {
  readonly poseConfirmed: boolean;
  readonly poseGeneration: number;
  readonly lastBakedPoseGeneration?: number | null;
}): StudioVrmXpbdGarmentBakePlan {
  if (!Number.isSafeInteger(input.poseGeneration) || input.poseGeneration < 0) {
    return Object.freeze({ bake: false, reason: "invalid-generation" });
  }
  if (!input.poseConfirmed) {
    return Object.freeze({ bake: false, reason: "pose-not-confirmed" });
  }
  if (input.lastBakedPoseGeneration === input.poseGeneration) {
    return Object.freeze({ bake: false, reason: "already-baked-for-generation" });
  }
  return Object.freeze({ bake: true, reason: "pose-confirmed" });
}

/* ------------------------------------------------------------------ */
/* Wardrobe routing                                                    */
/* ------------------------------------------------------------------ */

const SKIRT_AUTHORITY_ITEM_IDS: ReadonlySet<string> = new Set(["pleated", "longskirt"]);
const LONG_OUTER_ITEM_IDS: ReadonlySet<string> = new Set(["coat", "robe", "labcoat"]);

/**
 * Routes a wardrobe item to its cloth authority. Skirts keep the dedicated
 * skirt authority (`"skirt-authority"`); shoes and one-piece dresses have no
 * bake garment yet and return `null` instead of silently misfitting.
 */
export function resolveStudioVrmXpbdGarmentKindForWardrobeItem(
  itemId: string,
  slot: string,
): StudioVrmXpbdGarmentKind | "skirt-authority" | null {
  if (SKIRT_AUTHORITY_ITEM_IDS.has(itemId)) return "skirt-authority";
  switch (slot) {
    case "top":
      return itemId === "dress" ? null : "top";
    case "bottom":
      return itemId === "shorts" ? "bottom-shorts" : "bottom-pants";
    case "outer":
      return LONG_OUTER_ITEM_IDS.has(itemId) ? "outer-long" : "outer-short";
    default:
      return null;
  }
}

export function garmentSlotForKind(kind: StudioVrmXpbdGarmentKind): StudioVrmXpbdGarmentSlot {
  switch (kind) {
    case "top":
      return "top";
    case "outer-short":
    case "outer-long":
      return "outer";
    case "bottom-pants":
    case "bottom-shorts":
      return "bottom";
  }
}

/* ------------------------------------------------------------------ */
/* Shared validation helpers (skirt-authority parity)                  */
/* ------------------------------------------------------------------ */

function unavailable(
  code: StudioVrmXpbdGarmentUnavailableCode,
  detail: string,
): StudioVrmXpbdGarmentUnavailable {
  return Object.freeze({ ok: false, status: "unavailable", code, detail });
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function f32(value: number): number {
  return Math.fround(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function isFiniteBounded(
  value: number,
  maximum = STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxCoordinateMagnitude,
): boolean {
  return Number.isFinite(value) && Math.abs(value) <= maximum;
}

function normalizeVector(vector: StudioVrmXpbdGarmentVec3): StudioVrmXpbdGarmentVec3 | undefined {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!Number.isFinite(length) || length < MIN_VECTOR_LENGTH) return undefined;
  return [f32(vector[0] / length), f32(vector[1] / length), f32(vector[2] / length)];
}

function dot(a: StudioVrmXpbdGarmentVec3, b: StudioVrmXpbdGarmentVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: StudioVrmXpbdGarmentVec3, b: StudioVrmXpbdGarmentVec3): StudioVrmXpbdGarmentVec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function sub(a: StudioVrmXpbdGarmentVec3, b: StudioVrmXpbdGarmentVec3): StudioVrmXpbdGarmentVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Error(value: unknown, label: string): string | undefined {
  if (!Array.isArray(value) || value.length !== 3) return `${label} must be an XYZ tuple.`;
  for (let axis = 0; axis < 3; axis += 1) {
    if (!isFiniteBounded(value[axis] as number)) {
      return `${label}[${axis}] must be finite and within the coordinate budget.`;
    }
  }
  return undefined;
}

function freezeVec3(value: StudioVrmXpbdGarmentVec3): StudioVrmXpbdGarmentVec3 {
  return Object.freeze([f32(value[0]), f32(value[1]), f32(value[2])]) as StudioVrmXpbdGarmentVec3;
}

function normalizeAnchorFrame(
  value: unknown,
  label: string,
): { readonly ok: true; readonly frame: StudioVrmXpbdGarmentAnchorFrame } | StudioVrmXpbdGarmentUnavailable {
  if (!isRecord(value)) return unavailable("missing-input", `${label} is required.`);
  for (const key of ["center", "right", "up", "forward"] as const) {
    const error = vec3Error(value[key], `${label}.${key}`);
    if (error) return unavailable("invalid-input", error);
  }
  const center = value.center as StudioVrmXpbdGarmentVec3;
  const suppliedRight = normalizeVector(value.right as StudioVrmXpbdGarmentVec3);
  const suppliedUp = normalizeVector(value.up as StudioVrmXpbdGarmentVec3);
  const suppliedForward = normalizeVector(value.forward as StudioVrmXpbdGarmentVec3);
  if (!suppliedRight || !suppliedUp || !suppliedForward) {
    return unavailable("invalid-input", `${label} axes must have a non-zero finite length.`);
  }
  const upWithoutRight: StudioVrmXpbdGarmentVec3 = [
    suppliedUp[0] - suppliedRight[0] * dot(suppliedRight, suppliedUp),
    suppliedUp[1] - suppliedRight[1] * dot(suppliedRight, suppliedUp),
    suppliedUp[2] - suppliedRight[2] * dot(suppliedRight, suppliedUp),
  ];
  const up = normalizeVector(upWithoutRight);
  const forward = up ? normalizeVector(cross(suppliedRight, up)) : undefined;
  if (!up || !forward || dot(forward, suppliedForward) < 0.5) {
    return unavailable(
      "invalid-input",
      `${label} must contain a non-degenerate right-handed orthogonal basis.`,
    );
  }
  return {
    ok: true,
    frame: Object.freeze({
      center: freezeVec3(center),
      right: freezeVec3(suppliedRight),
      up: freezeVec3(up),
      forward: freezeVec3(forward),
    }),
  };
}

function hashText(value: string): string {
  return sha256HexPortable(new TextEncoder().encode(value));
}

function typedArrayBytes(values: Float32Array | Uint32Array): Uint8Array {
  const bytes = new Uint8Array(4 + values.length * 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, values.length, true);
  if (values instanceof Float32Array) {
    for (let index = 0; index < values.length; index += 1) {
      view.setFloat32(4 + index * 4, values[index]!, true);
    }
  } else {
    for (let index = 0; index < values.length; index += 1) {
      view.setUint32(4 + index * 4, values[index]!, true);
    }
  }
  return bytes;
}

function hashTypedArray(values: Float32Array | Uint32Array): string {
  return sha256HexPortable(typedArrayBytes(values));
}

function metricsError(value: unknown): string | undefined {
  if (!isRecord(value)) return "metrics are required.";
  for (const [key, minimum, maximum] of [
    ["totalHeight", 0.35, 3.5],
    ["headUnits", 1.5, 14],
    ["hipsHeight", 0.1, 2.8],
    ["legLength", 0.1, 2.2],
    ["shoulderSpan", 0.03, 1.2],
  ] as const) {
    const field = value[key];
    if (typeof field !== "number" || !Number.isFinite(field) || field < minimum || field > maximum) {
      return `metrics.${key} must be finite and in [${minimum}, ${maximum}].`;
    }
  }
  return undefined;
}

function capsuleError(value: unknown, label: string): string | undefined {
  if (!isRecord(value)) return `${label} is required.`;
  for (const key of ["restHead", "restTail", "currentHead", "currentTail"] as const) {
    const error = vec3Error(value[key], `${label}.${key}`);
    if (error) return error;
  }
  if (
    typeof value.radius !== "number" ||
    !Number.isFinite(value.radius) ||
    value.radius < MIN_CAPSULE_RADIUS ||
    value.radius > MAX_CAPSULE_RADIUS
  ) {
    return `${label}.radius must be finite and in [${MIN_CAPSULE_RADIUS}, ${MAX_CAPSULE_RADIUS}].`;
  }
  if (
    value.friction !== undefined &&
    (typeof value.friction !== "number" ||
      !Number.isFinite(value.friction) ||
      value.friction < 0 ||
      value.friction > 1)
  ) {
    return `${label}.friction must be finite and in [0, 1].`;
  }
  return undefined;
}

interface NamedCapsuleProxy {
  readonly id: string;
  readonly proxy: StudioVrmXpbdGarmentCapsuleProxy;
}

const CAPSULE_IDS_BY_KIND: Readonly<Record<StudioVrmXpbdGarmentKind, readonly string[]>> =
  Object.freeze({
    top: Object.freeze(["torso", "hips", "leftThigh", "rightThigh", "leftUpperArm", "rightUpperArm"]),
    "outer-short": Object.freeze(
      ["torso", "hips", "leftThigh", "rightThigh", "leftUpperArm", "rightUpperArm"],
    ),
    "outer-long": Object.freeze(
      ["torso", "hips", "leftThigh", "rightThigh", "leftCalf", "rightCalf"],
    ),
    "bottom-pants": Object.freeze(["hips", "leftThigh", "rightThigh", "leftCalf", "rightCalf"]),
    "bottom-shorts": Object.freeze(["hips", "leftThigh", "rightThigh"]),
  });

function normalizeBodyProxies(
  kind: StudioVrmXpbdGarmentKind,
  value: unknown,
): { readonly ok: true; readonly capsules: readonly NamedCapsuleProxy[] } | StudioVrmXpbdGarmentUnavailable {
  if (!isRecord(value)) return unavailable("missing-input", "body proxies are required.");
  const ids = CAPSULE_IDS_BY_KIND[kind];
  if (ids.length > STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxCapsules) {
    return unavailable("budget-exceeded", "Body capsule count exceeds the garment budget.");
  }
  const capsules: NamedCapsuleProxy[] = [];
  for (const id of ids) {
    const issue = capsuleError(value[id], `body.${id}`);
    if (issue) {
      return unavailable(isRecord(value[id]) ? "invalid-input" : "missing-input", issue);
    }
    capsules.push(
      Object.freeze({ id, proxy: value[id] as unknown as StudioVrmXpbdGarmentCapsuleProxy }),
    );
  }
  return { ok: true, capsules: Object.freeze(capsules) };
}

function capsuleById(
  capsules: readonly NamedCapsuleProxy[],
  id: string,
): StudioVrmXpbdGarmentCapsuleProxy {
  const found = capsules.find((capsule) => capsule.id === id);
  if (!found) throw new Error(`capsule ${id} is required for this garment kind.`);
  return found.proxy;
}

/* ------------------------------------------------------------------ */
/* Tube geometry                                                       */
/* ------------------------------------------------------------------ */

type TubeSide = "torso" | "leftLeg" | "rightLeg";

interface TubeSpec {
  readonly id: string;
  readonly side: TubeSide;
  readonly clearanceM: number;
  readonly lengthScale: number;
}

function tubeSpecsForKind(kind: StudioVrmXpbdGarmentKind): readonly TubeSpec[] {
  switch (kind) {
    case "top":
      return Object.freeze([Object.freeze({ id: "torso", side: "torso" as const, clearanceM: 0.02, lengthScale: 1 })]);
    case "outer-short":
      return Object.freeze([Object.freeze({ id: "torso", side: "torso" as const, clearanceM: 0.034, lengthScale: 1.08 })]);
    case "outer-long":
      return Object.freeze([Object.freeze({ id: "torso", side: "torso" as const, clearanceM: 0.034, lengthScale: 1.62 })]);
    case "bottom-pants":
      return Object.freeze([
        Object.freeze({ id: "leftLeg", side: "leftLeg" as const, clearanceM: 0.018, lengthScale: 0.96 }),
        Object.freeze({ id: "rightLeg", side: "rightLeg" as const, clearanceM: 0.018, lengthScale: 0.96 }),
      ]);
    case "bottom-shorts":
      return Object.freeze([
        Object.freeze({ id: "leftLeg", side: "leftLeg" as const, clearanceM: 0.018, lengthScale: 0.52 }),
        Object.freeze({ id: "rightLeg", side: "rightLeg" as const, clearanceM: 0.018, lengthScale: 0.52 }),
      ]);
  }
}

function defaultSegmentCount(kind: StudioVrmXpbdGarmentKind): number {
  return kind === "bottom-pants" || kind === "bottom-shorts" ? 24 : 40;
}

function defaultRingCount(kind: StudioVrmXpbdGarmentKind): number {
  switch (kind) {
    case "top":
      return 8;
    case "outer-short":
      return 9;
    case "outer-long":
      return 12;
    case "bottom-pants":
      return 9;
    case "bottom-shorts":
      return 6;
  }
}

function defaultBakeSteps(kind: StudioVrmXpbdGarmentKind): number {
  switch (kind) {
    case "top":
      return 12;
    case "outer-short":
      return 14;
    case "outer-long":
      return 18;
    case "bottom-pants":
      return 16;
    case "bottom-shorts":
      return 10;
  }
}

function torsoTubeDimensions(
  kind: StudioVrmXpbdGarmentKind,
  metrics: StudioVrmXpbdGarmentMetrics,
  fit: number,
  segmentCount: number,
  spec: TubeSpec,
): StudioVrmXpbdGarmentTubeDimensions {
  const radiusScale = kind === "top" ? 1 : 1.1;
  const startRadiusX = clamp(
    Math.max(metrics.totalHeight * 0.088, metrics.shoulderSpan * 0.88) * fit * radiusScale,
    0.08,
    0.38,
  );
  const startRadiusZ = startRadiusX * 0.76;
  const hemFlare = kind === "outer-long" ? 1.24 : kind === "outer-short" ? 1.1 : 1.03;
  const torsoSpan = Math.max(0.2, metrics.totalHeight - metrics.hipsHeight);
  const lengthM = clamp(torsoSpan * 0.92 * spec.lengthScale, 0.18, 1.6);
  const circumferenceStep = (Math.PI * 2 * startRadiusX) / segmentCount;
  const particleRadius = clamp(circumferenceStep * 0.18, 0.0025, 0.012);
  return Object.freeze({
    id: spec.id,
    clearanceM: spec.clearanceM,
    startRadiusX: f32(startRadiusX),
    startRadiusZ: f32(startRadiusZ),
    endRadiusX: f32(startRadiusX * hemFlare),
    endRadiusZ: f32(startRadiusZ * hemFlare),
    lengthM: f32(lengthM),
    particleRadius: f32(particleRadius),
  });
}

function legTubeDimensions(
  kind: StudioVrmXpbdGarmentKind,
  spec: TubeSpec,
  thigh: StudioVrmXpbdGarmentCapsuleProxy,
  calf: StudioVrmXpbdGarmentCapsuleProxy | undefined,
  segmentCount: number,
): StudioVrmXpbdGarmentTubeDimensions {
  const startRadius = thigh.radius + spec.clearanceM;
  const endRadius =
    kind === "bottom-pants" && calf
      ? calf.radius + spec.clearanceM * 0.85
      : thigh.radius * 0.94 + spec.clearanceM;
  const thighLength = Math.hypot(...sub(thigh.restTail, thigh.restHead));
  const calfLength =
    kind === "bottom-pants" && calf ? Math.hypot(...sub(calf.restTail, calf.restHead)) : 0;
  const lengthM = (thighLength + calfLength) * spec.lengthScale;
  const circumferenceStep = (Math.PI * 2 * startRadius) / segmentCount;
  const particleRadius = clamp(circumferenceStep * 0.18, 0.0025, 0.012);
  return Object.freeze({
    id: spec.id,
    clearanceM: spec.clearanceM,
    startRadiusX: f32(startRadius),
    startRadiusZ: f32(startRadius),
    endRadiusX: f32(endRadius),
    endRadiusZ: f32(endRadius),
    lengthM: f32(lengthM),
    particleRadius: f32(particleRadius),
  });
}

/** Torso tube ring point: ring 0 is the pinned chest ring, rings hang along −up. */
function torsoRingPoint(
  frame: StudioVrmXpbdGarmentAnchorFrame,
  dimensions: StudioVrmXpbdGarmentTubeDimensions,
  segment: number,
  segmentCount: number,
  ring: number,
  ringCount: number,
): StudioVrmXpbdGarmentVec3 {
  const angle = (segment / segmentCount) * Math.PI * 2;
  const t = ring / (ringCount - 1);
  const easedT = t * t * (3 - 2 * t);
  const radiusX = dimensions.startRadiusX + (dimensions.endRadiusX - dimensions.startRadiusX) * easedT;
  const radiusZ = dimensions.startRadiusZ + (dimensions.endRadiusZ - dimensions.startRadiusZ) * easedT;
  const x = Math.cos(angle) * radiusX;
  const z = Math.sin(angle) * radiusZ;
  const y = -dimensions.lengthM * t;
  return [
    f32(frame.center[0] + frame.right[0] * x + frame.forward[0] * z + frame.up[0] * y),
    f32(frame.center[1] + frame.right[1] * x + frame.forward[1] * z + frame.up[1] * y),
    f32(frame.center[2] + frame.right[2] * x + frame.forward[2] * z + frame.up[2] * y),
  ];
}

interface LegAxis {
  /** Polyline points, hip → knee (→ ankle for pants). */
  readonly points: readonly StudioVrmXpbdGarmentVec3[];
  readonly radii: readonly number[];
}

function legAxis(
  thigh: StudioVrmXpbdGarmentCapsuleProxy,
  calf: StudioVrmXpbdGarmentCapsuleProxy | undefined,
  clearanceM: number,
  posed: boolean,
): LegAxis {
  const head = posed ? thigh.currentHead : thigh.restHead;
  const knee = posed ? thigh.currentTail : thigh.restTail;
  if (calf) {
    const ankle = posed ? calf.currentTail : calf.restTail;
    return {
      points: [head, knee, ankle],
      radii: [thigh.radius + clearanceM, calf.radius + clearanceM, calf.radius + clearanceM * 0.85],
    };
  }
  return {
    points: [head, knee],
    radii: [thigh.radius + clearanceM, thigh.radius * 0.94 + clearanceM],
  };
}

function legAxisPointAt(
  axis: LegAxis,
  distanceM: number,
): { readonly point: StudioVrmXpbdGarmentVec3; readonly axisDir: StudioVrmXpbdGarmentVec3; readonly radius: number } {
  const segmentLengths: number[] = [];
  let total = 0;
  for (let index = 0; index + 1 < axis.points.length; index += 1) {
    const length = Math.hypot(...sub(axis.points[index + 1]!, axis.points[index]!));
    segmentLengths.push(length);
    total += length;
  }
  const target = clamp(distanceM, 0, Math.max(0, total - 1e-6));
  let remaining = target;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index]!;
    const isLast = index === segmentLengths.length - 1;
    if (remaining <= length || isLast) {
      const alpha = length > MIN_VECTOR_LENGTH ? clamp(remaining / length, 0, 1) : 0;
      const a = axis.points[index]!;
      const b = axis.points[index + 1]!;
      const point: StudioVrmXpbdGarmentVec3 = [
        a[0] + (b[0] - a[0]) * alpha,
        a[1] + (b[1] - a[1]) * alpha,
        a[2] + (b[2] - a[2]) * alpha,
      ];
      const axisDir = normalizeVector(sub(b, a)) ?? [0, -1, 0];
      const radius = axis.radii[index]! + (axis.radii[index + 1]! - axis.radii[index]!) * alpha;
      return { point, axisDir, radius };
    }
    remaining -= length;
  }
  const last = axis.points[axis.points.length - 1]!;
  return { point: last, axisDir: [0, -1, 0], radius: axis.radii[axis.radii.length - 1]! };
}

/** Leg tube ring point: rings follow the leg capsule polyline, plane ⊥ axis. */
function legRingPoint(
  axis: LegAxis,
  basisFrame: StudioVrmXpbdGarmentAnchorFrame,
  dimensions: StudioVrmXpbdGarmentTubeDimensions,
  segment: number,
  segmentCount: number,
  ring: number,
  ringCount: number,
): StudioVrmXpbdGarmentVec3 {
  const angle = (segment / segmentCount) * Math.PI * 2;
  const t = ring / (ringCount - 1);
  const { point, axisDir } = legAxisPointAt(axis, dimensions.lengthM * t);
  // Radius profile is defined over the tube's own length so the recorded
  // dimensions describe the actual rings (start = hip, end = hem).
  const radius = dimensions.startRadiusX + (dimensions.endRadiusX - dimensions.startRadiusX) * t;
  const rightProjected = sub(
    basisFrame.right,
    [
      axisDir[0] * dot(basisFrame.right, axisDir),
      axisDir[1] * dot(basisFrame.right, axisDir),
      axisDir[2] * dot(basisFrame.right, axisDir),
    ],
  );
  const right = normalizeVector(rightProjected) ?? normalizeVector(basisFrame.forward) ?? [1, 0, 0];
  const forward = normalizeVector(cross(axisDir, right)) ?? [0, 0, 1];
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  return [
    f32(point[0] + right[0] * x + forward[0] * z),
    f32(point[1] + right[1] * x + forward[1] * z),
    f32(point[2] + right[2] * x + forward[2] * z),
  ];
}

/* ------------------------------------------------------------------ */
/* Topology                                                            */
/* ------------------------------------------------------------------ */

interface ResolvedTube {
  readonly spec: TubeSpec;
  readonly dimensions: StudioVrmXpbdGarmentTubeDimensions;
  readonly particleOffset: number;
}

function topologyHash(topology: Omit<StudioVrmXpbdGarmentTopology, "topologySha256">): string {
  const anchor = topology.restAnchor;
  return hashText(
    [
      `version=${topology.version}`,
      `kind=${topology.kind}`,
      `mode=${topology.mode}`,
      `segments=${topology.segmentCount}`,
      `rings=${topology.ringCount}`,
      `tubes=${topology.tubeCount}`,
      `particles=${topology.particleCount}`,
      `triangles=${topology.triangleCount}`,
      `iterations=${topology.solverIterations}`,
      `selfCollision=${topology.selfCollisionEnabled ? 1 : 0}`,
      `tubeDims=${topology.tubes
        .map(
          (tube) =>
            `${tube.id}:${tube.clearanceM},${tube.startRadiusX},${tube.startRadiusZ},${tube.endRadiusX},${tube.endRadiusZ},${tube.lengthM},${tube.particleRadius}`,
        )
        .join(";")}`,
      `anchor=${[...anchor.center, ...anchor.right, ...anchor.up, ...anchor.forward].join(",")}`,
      `rest=${hashTypedArray(topology.restPositions)}`,
      `uv=${hashTypedArray(topology.uvs)}`,
      `tri=${hashTypedArray(topology.triangleIndices)}`,
      `pins=${hashTypedArray(topology.pinnedParticleIndices)}`,
      `kernel=${topology.compiledModel.topologySha256}`,
    ].join("|"),
  );
}

function mapKernelFailure(code: StudioClothXpbdFailureCodeV2): StudioVrmXpbdGarmentUnavailableCode {
  switch (code) {
    case "budget-exceeded":
      return "budget-exceeded";
    case "stale-step":
      return "stale-input";
    case "topology-mismatch":
      return "topology-mismatch";
    case "numerical-failure":
      return "numerical-failure";
    case "invalid-input":
      return "solver-unavailable";
  }
}

function createTopologyUnchecked(
  input: StudioVrmXpbdGarmentTopologyInput,
): StudioVrmXpbdGarmentTopologyResult {
  const kinds: readonly string[] = ["top", "outer-short", "outer-long", "bottom-pants", "bottom-shorts"];
  if (!kinds.includes(input.kind)) {
    return unavailable("invalid-input", "kind must be a supported garment kind.");
  }
  const metricIssue = metricsError(input.metrics);
  if (metricIssue) {
    return unavailable(isRecord(input.metrics) ? "invalid-input" : "missing-input", metricIssue);
  }
  const normalizedRestAnchor = normalizeAnchorFrame(input.restAnchor, "restAnchor");
  if (!normalizedRestAnchor.ok) return normalizedRestAnchor;
  const fit = input.fit ?? 1;
  if (!Number.isFinite(fit) || fit < 0.75 || fit > 1.35) {
    return unavailable("invalid-input", "fit must be finite and in [0.75, 1.35].");
  }
  const segmentCount = input.segmentCount ?? defaultSegmentCount(input.kind);
  const ringCount = input.ringCount ?? defaultRingCount(input.kind);
  const solverIterations = input.solverIterations ?? 8;
  const topologyEpoch = input.topologyEpoch ?? 1;
  if (
    !Number.isInteger(segmentCount) ||
    segmentCount < STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.minSegments
  ) {
    return unavailable(
      "invalid-input",
      `segmentCount must be an integer >= ${STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.minSegments}.`,
    );
  }
  if (segmentCount > STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxSegments) {
    return unavailable("budget-exceeded", "segmentCount exceeds the garment topology budget.");
  }
  if (!Number.isInteger(ringCount) || ringCount < STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.minRings) {
    return unavailable(
      "invalid-input",
      `ringCount must be an integer >= ${STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.minRings}.`,
    );
  }
  if (ringCount > STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxRings) {
    return unavailable("budget-exceeded", "ringCount exceeds the garment topology budget.");
  }
  if (
    !Number.isInteger(solverIterations) ||
    solverIterations < 1 ||
    solverIterations > STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxSolverIterations
  ) {
    return unavailable(
      solverIterations > STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxSolverIterations
        ? "budget-exceeded"
        : "invalid-input",
      `solverIterations must be an integer in [1, ${STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxSolverIterations}].`,
    );
  }
  if (!Number.isSafeInteger(topologyEpoch) || topologyEpoch < 1) {
    return unavailable("invalid-input", "topologyEpoch must be a positive safe integer.");
  }

  const specs = tubeSpecsForKind(input.kind);
  const tubeCount = specs.length;
  const particleCount = segmentCount * ringCount * tubeCount;
  const triangleCount = segmentCount * (ringCount - 1) * 2 * tubeCount;
  if (particleCount > STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxParticles) {
    return unavailable(
      "budget-exceeded",
      `Particle count ${particleCount} exceeds ${STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxParticles}.`,
    );
  }
  if (triangleCount > STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxTriangles) {
    return unavailable(
      "budget-exceeded",
      `Triangle count ${triangleCount} exceeds ${STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxTriangles}.`,
    );
  }
  const defaultWork =
    particleCount * solverIterations * defaultBakeSteps(input.kind);
  if (defaultWork > STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxBakeWorkUnits) {
    return unavailable(
      "budget-exceeded",
      `Default bake work ${defaultWork} exceeds ${STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxBakeWorkUnits}.`,
    );
  }

  // Leg tubes are measured off the rest body; without it their radii/lengths
  // would be guesses, so leg garments fail closed instead.
  let restCapsules: readonly NamedCapsuleProxy[] | undefined;
  if (input.restBody !== undefined) {
    const normalizedBody = normalizeBodyProxies(input.kind, input.restBody);
    if (!normalizedBody.ok) return normalizedBody;
    restCapsules = normalizedBody.capsules;
  }
  const isLegKind = input.kind === "bottom-pants" || input.kind === "bottom-shorts";
  if (isLegKind && !restCapsules) {
    return unavailable("missing-input", "restBody is required to measure leg garment tubes.");
  }

  const tubes: ResolvedTube[] = [];
  let particleOffset = 0;
  for (const spec of specs) {
    let dimensions: StudioVrmXpbdGarmentTubeDimensions;
    if (spec.side === "torso") {
      dimensions = torsoTubeDimensions(input.kind, input.metrics, fit, segmentCount, spec);
    } else {
      const thigh = capsuleById(restCapsules!, spec.side === "leftLeg" ? "leftThigh" : "rightThigh");
      const calf =
        input.kind === "bottom-pants"
          ? capsuleById(restCapsules!, spec.side === "leftLeg" ? "leftCalf" : "rightCalf")
          : undefined;
      dimensions = legTubeDimensions(input.kind, spec, thigh, calf, segmentCount);
    }
    tubes.push(Object.freeze({ spec, dimensions, particleOffset }));
    particleOffset += segmentCount * ringCount;
  }

  const restPositions = new Float32Array(particleCount * 3);
  const uvs = new Float32Array(particleCount * 2);
  const particleRadii = new Float32Array(particleCount);
  for (const tube of tubes) {
    for (let ring = 0; ring < ringCount; ring += 1) {
      for (let segment = 0; segment < segmentCount; segment += 1) {
        const particle = tube.particleOffset + ring * segmentCount + segment;
        let point: StudioVrmXpbdGarmentVec3;
        if (tube.spec.side === "torso") {
          point = torsoRingPoint(
            normalizedRestAnchor.frame,
            tube.dimensions,
            segment,
            segmentCount,
            ring,
            ringCount,
          );
        } else {
          const thigh = capsuleById(
            restCapsules!,
            tube.spec.side === "leftLeg" ? "leftThigh" : "rightThigh",
          );
          const calf =
            input.kind === "bottom-pants"
              ? capsuleById(restCapsules!, tube.spec.side === "leftLeg" ? "leftCalf" : "rightCalf")
              : undefined;
          point = legRingPoint(
            legAxis(thigh, calf, tube.spec.clearanceM, false),
            normalizedRestAnchor.frame,
            tube.dimensions,
            segment,
            segmentCount,
            ring,
            ringCount,
          );
        }
        restPositions.set(point, particle * 3);
        uvs[particle * 2] = f32(segment / segmentCount);
        uvs[particle * 2 + 1] = f32(ring / (ringCount - 1));
        particleRadii[particle] = tube.dimensions.particleRadius;
      }
    }
  }

  const triangleIndices = new Uint32Array(triangleCount * 3);
  let triangleOffset = 0;
  for (const tube of tubes) {
    for (let ring = 0; ring < ringCount - 1; ring += 1) {
      for (let segment = 0; segment < segmentCount; segment += 1) {
        const next = (segment + 1) % segmentCount;
        const upper = tube.particleOffset + ring * segmentCount + segment;
        const upperNext = tube.particleOffset + ring * segmentCount + next;
        const lower = tube.particleOffset + (ring + 1) * segmentCount + segment;
        const lowerNext = tube.particleOffset + (ring + 1) * segmentCount + next;
        triangleIndices.set(
          [upper, lower, upperNext, upperNext, lower, lowerNext],
          triangleOffset,
        );
        triangleOffset += 6;
      }
    }
  }
  const pinnedParticleIndices = Uint32Array.from(
    tubes.flatMap((tube) =>
      Array.from({ length: segmentCount }, (_, segment) => tube.particleOffset + segment),
    ),
  );
  const compiled = compileStudioClothXpbdModelV2({
    restPositions,
    triangleIndices,
    particleRadii,
    gravity: [0, -9.81, 0],
    dampingPerSecond: 1.4,
    structuralCompliance: 0.000_002,
    bendCompliance: 0.000_06,
    selfCollisionEnabled: STUDIO_VRM_XPBD_GARMENT_SELF_COLLISION_ENABLED,
    solverIterations,
    topologyEpoch,
  });
  if (!compiled.ok) {
    return unavailable(mapKernelFailure(compiled.code), `XPBD compile failed: ${compiled.detail}`);
  }
  const topologyWithoutHash: Omit<StudioVrmXpbdGarmentTopology, "topologySha256"> = {
    version: STUDIO_VRM_XPBD_GARMENT_BAKE_VERSION,
    kind: input.kind,
    slot: garmentSlotForKind(input.kind),
    mode: STUDIO_VRM_XPBD_GARMENT_SIMULATION_MODE,
    segmentCount,
    ringCount,
    tubeCount,
    particleCount,
    triangleCount,
    solverIterations,
    selfCollisionEnabled: STUDIO_VRM_XPBD_GARMENT_SELF_COLLISION_ENABLED,
    tubes: Object.freeze(tubes.map((tube) => tube.dimensions)),
    restAnchor: normalizedRestAnchor.frame,
    restPositions: compiled.model.restPositions,
    uvs,
    triangleIndices: compiled.model.triangleIndices,
    pinnedParticleIndices,
    compiledModel: compiled.model,
  };
  const topology = Object.freeze({
    ...topologyWithoutHash,
    topologySha256: topologyHash(topologyWithoutHash),
  });
  return Object.freeze({ ok: true, status: "ready", topology });
}

/** Builds a deterministic tube-stack garment topology and its XPBD model. */
export function createStudioVrmXpbdGarmentTopology(
  input: StudioVrmXpbdGarmentTopologyInput,
): StudioVrmXpbdGarmentTopologyResult {
  try {
    if (!isRecord(input)) return unavailable("missing-input", "Topology input is required.");
    return createTopologyUnchecked(input);
  } catch {
    return unavailable("invalid-input", "Topology input could not be validated safely.");
  }
}

/* ------------------------------------------------------------------ */
/* Bake (rest → confirmed pose, one shot)                              */
/* ------------------------------------------------------------------ */

function lerp(a: number, b: number, alpha: number): number {
  return f32(a + (b - a) * alpha);
}

function lerpVec3(
  a: StudioVrmXpbdGarmentVec3,
  b: StudioVrmXpbdGarmentVec3,
  alpha: number,
): StudioVrmXpbdGarmentVec3 {
  return [lerp(a[0], b[0], alpha), lerp(a[1], b[1], alpha), lerp(a[2], b[2], alpha)];
}

function capsuleFrameAt(
  named: NamedCapsuleProxy,
  previousAlpha: number,
  currentAlpha: number,
): StudioClothXpbdCapsuleFrameV2 {
  const proxy = named.proxy;
  return {
    id: named.id,
    previousHead: lerpVec3(proxy.restHead, proxy.currentHead, previousAlpha),
    previousTail: lerpVec3(proxy.restTail, proxy.currentTail, previousAlpha),
    currentHead: lerpVec3(proxy.restHead, proxy.currentHead, currentAlpha),
    currentTail: lerpVec3(proxy.restTail, proxy.currentTail, currentAlpha),
    radius: f32(proxy.radius),
    friction: f32(proxy.friction ?? 0.35),
  };
}

interface TubeRuntime {
  readonly tube: ResolvedTubeLike;
  readonly restPins: readonly StudioVrmXpbdGarmentVec3[];
  readonly currentPins: readonly StudioVrmXpbdGarmentVec3[];
}

interface ResolvedTubeLike {
  readonly spec: TubeSpec;
  readonly dimensions: StudioVrmXpbdGarmentTubeDimensions;
  readonly particleOffset: number;
}

function resolveTubes(topology: StudioVrmXpbdGarmentTopology): ResolvedTubeLike[] {
  const specs = tubeSpecsForKind(topology.kind);
  return specs.map((spec, index) => ({
    spec,
    dimensions: topology.tubes[index]!,
    particleOffset: index * topology.segmentCount * topology.ringCount,
  }));
}

function pinPointsForTube(
  topology: StudioVrmXpbdGarmentTopology,
  tube: ResolvedTubeLike,
  anchor: StudioVrmXpbdGarmentAnchorFrame,
  capsules: readonly NamedCapsuleProxy[],
  posed: boolean,
): readonly StudioVrmXpbdGarmentVec3[] {
  return Object.freeze(
    Array.from({ length: topology.segmentCount }, (_, segment) => {
      if (tube.spec.side === "torso") {
        return freezeVec3(
          torsoRingPoint(anchor, tube.dimensions, segment, topology.segmentCount, 0, topology.ringCount),
        );
      }
      const thigh = capsuleById(
        capsules,
        tube.spec.side === "leftLeg" ? "leftThigh" : "rightThigh",
      );
      const calf =
        topology.kind === "bottom-pants"
          ? capsuleById(capsules, tube.spec.side === "leftLeg" ? "leftCalf" : "rightCalf")
          : undefined;
      return freezeVec3(
        legRingPoint(
          legAxis(thigh, calf, tube.spec.clearanceM, posed),
          anchor,
          tube.dimensions,
          segment,
          topology.segmentCount,
          0,
          topology.ringCount,
        ),
      );
    }),
  );
}

function pointSegmentDistance(
  point: StudioVrmXpbdGarmentVec3,
  head: StudioVrmXpbdGarmentVec3,
  tail: StudioVrmXpbdGarmentVec3,
): number {
  const sx = tail[0] - head[0];
  const sy = tail[1] - head[1];
  const sz = tail[2] - head[2];
  const lengthSquared = sx * sx + sy * sy + sz * sz;
  const projection =
    lengthSquared > MIN_VECTOR_LENGTH * MIN_VECTOR_LENGTH
      ? clamp(
          ((point[0] - head[0]) * sx + (point[1] - head[1]) * sy + (point[2] - head[2]) * sz) /
            lengthSquared,
          0,
          1,
        )
      : 0;
  return Math.hypot(
    point[0] - (head[0] + sx * projection),
    point[1] - (head[1] + sy * projection),
    point[2] - (head[2] + sz * projection),
  );
}

function closestPointOnSegment(
  point: StudioVrmXpbdGarmentVec3,
  head: StudioVrmXpbdGarmentVec3,
  tail: StudioVrmXpbdGarmentVec3,
): StudioVrmXpbdGarmentVec3 {
  const sx = tail[0] - head[0];
  const sy = tail[1] - head[1];
  const sz = tail[2] - head[2];
  const lengthSquared = sx * sx + sy * sy + sz * sz;
  const projection =
    lengthSquared > MIN_VECTOR_LENGTH * MIN_VECTOR_LENGTH
      ? clamp(
          ((point[0] - head[0]) * sx + (point[1] - head[1]) * sy + (point[2] - head[2]) * sz) /
            lengthSquared,
          0,
          1,
        )
      : 0;
  return [head[0] + sx * projection, head[1] + sy * projection, head[2] + sz * projection];
}

/**
 * Particle-level final contact projection (pure, no three dependency).
 * Pushes every non-pinned particle out of every body capsule; returns the
 * largest single-particle displacement so the caller can fail closed when
 * the repair would distort the garment (skirt parity: one capsule diameter).
 */
function projectParticleContacts(
  positions: Float32Array,
  topology: StudioVrmXpbdGarmentTopology,
  capsules: readonly NamedCapsuleProxy[],
  fallbackDir: StudioVrmXpbdGarmentVec3,
): { readonly maxDisplacementM: number; readonly maxPenetrationM: number } {
  const pinned = new Set(topology.pinnedParticleIndices);
  const original = new Float32Array(positions);
  for (let pass = 0; pass < CONTACT_PROJECTION_PASSES; pass += 1) {
    for (let particle = 0; particle < topology.particleCount; particle += 1) {
      if (pinned.has(particle)) continue;
      const offset = particle * 3;
      for (const named of capsules) {
        const point: StudioVrmXpbdGarmentVec3 = [
          positions[offset]!,
          positions[offset + 1]!,
          positions[offset + 2]!,
        ];
        const target = named.proxy.radius + topology.compiledModel.particleRadii[particle]!;
        const closest = closestPointOnSegment(point, named.proxy.currentHead, named.proxy.currentTail);
        const delta = sub(point, closest);
        const distance = Math.hypot(delta[0], delta[1], delta[2]);
        if (distance >= target) continue;
        const dir =
          distance > MIN_VECTOR_LENGTH
            ? ([delta[0] / distance, delta[1] / distance, delta[2] / distance] as const)
            : fallbackDir;
        positions[offset] = f32(closest[0] + dir[0] * target);
        positions[offset + 1] = f32(closest[1] + dir[1] * target);
        positions[offset + 2] = f32(closest[2] + dir[2] * target);
      }
    }
  }
  let maxDisplacementM = 0;
  let maxPenetrationM = 0;
  for (let particle = 0; particle < topology.particleCount; particle += 1) {
    if (pinned.has(particle)) continue;
    const offset = particle * 3;
    maxDisplacementM = Math.max(
      maxDisplacementM,
      Math.hypot(
        positions[offset]! - original[offset]!,
        positions[offset + 1]! - original[offset + 1]!,
        positions[offset + 2]! - original[offset + 2]!,
      ),
    );
    const point: StudioVrmXpbdGarmentVec3 = [
      positions[offset]!,
      positions[offset + 1]!,
      positions[offset + 2]!,
    ];
    for (const named of capsules) {
      const distance = pointSegmentDistance(point, named.proxy.currentHead, named.proxy.currentTail);
      maxPenetrationM = Math.max(
        maxPenetrationM,
        named.proxy.radius + topology.compiledModel.particleRadii[particle]! - distance,
      );
    }
  }
  return { maxDisplacementM, maxPenetrationM: Math.max(0, maxPenetrationM) };
}

function finalPenetrationByCapsule(
  topology: StudioVrmXpbdGarmentTopology,
  positions: Float32Array,
  capsules: readonly NamedCapsuleProxy[],
): Readonly<Record<string, number>> {
  const pinned = new Set(topology.pinnedParticleIndices);
  const result: Record<string, number> = {};
  for (const named of capsules) {
    let maximum = 0;
    for (let particle = 0; particle < topology.particleCount; particle += 1) {
      if (pinned.has(particle)) continue;
      const offset = particle * 3;
      const point: StudioVrmXpbdGarmentVec3 = [
        positions[offset]!,
        positions[offset + 1]!,
        positions[offset + 2]!,
      ];
      const distance = pointSegmentDistance(point, named.proxy.currentHead, named.proxy.currentTail);
      maximum = Math.max(
        maximum,
        named.proxy.radius + topology.compiledModel.particleRadii[particle]! - distance,
      );
    }
    result[named.id] = f32(Math.max(0, maximum));
  }
  return Object.freeze(result);
}

function receiptHash(receipt: Omit<StudioVrmXpbdGarmentBakeReceipt, "receiptSha256">): string {
  return hashText(
    [
      `kind=${receipt.kind}`,
      `version=${receipt.version}`,
      `complete=${receipt.complete ? 1 : 0}`,
      `mode=${receipt.mode}`,
      `garment=${receipt.garmentKind}`,
      `slot=${receipt.slot}`,
      `generation=${receipt.poseGeneration}`,
      `steps=${receipt.restToPoseSteps}`,
      `iterations=${receipt.solverIterations}`,
      `counts=${receipt.particleCount},${receipt.triangleCount},${receipt.capsuleCount}`,
      `capsules=${receipt.capsuleIds.join(",")}`,
      `selfCollision=${receipt.selfCollisionEnabled ? 1 : 0}`,
      `topology=${receipt.topologySha256}`,
      `kernelTopology=${receipt.kernelTopologySha256}`,
      `kernelReceipts=${receipt.kernelReceiptChainSha256}`,
      `positions=${receipt.outputPositionsSha256}`,
      `output=${receipt.outputSha256}`,
      `penetration=${receipt.diagnostics.maxCapsulePenetration}`,
      `finalPenetration=${receipt.capsuleIds.map((id) => `${id}:${receipt.diagnostics.finalCapsulePenetrationById[id]}`).join(",")}`,
      `contacts=${receipt.diagnostics.totalCapsuleContactCount}`,
      `contactProjection=${receipt.diagnostics.contactProjectionPasses},${receipt.diagnostics.contactProjectionMaxDisplacementM}`,
      `work=${receipt.diagnostics.bakeWorkUnits}`,
      `nonFinite=${receipt.diagnostics.nonFiniteCount}`,
    ].join("|"),
  );
}

function bakeUnchecked(
  topology: StudioVrmXpbdGarmentTopology,
  input: StudioVrmXpbdGarmentBakeInput,
): StudioVrmXpbdGarmentBakeResult {
  if (!isRecord(topology)) return unavailable("missing-input", "Topology is required.");
  if (input.expectedTopologySha256 === undefined) {
    return unavailable("missing-input", "expectedTopologySha256 is required.");
  }
  if (input.expectedPoseGeneration === undefined || input.poseGeneration === undefined) {
    return unavailable("missing-input", "Both pose generation fences are required.");
  }
  if (
    !Number.isSafeInteger(input.expectedPoseGeneration) ||
    !Number.isSafeInteger(input.poseGeneration) ||
    input.expectedPoseGeneration < 0 ||
    input.poseGeneration < 0
  ) {
    return unavailable("invalid-input", "Pose generations must be non-negative safe integers.");
  }
  if (input.expectedPoseGeneration !== input.poseGeneration) {
    return unavailable(
      "stale-input",
      `Expected pose generation ${input.expectedPoseGeneration}, received ${input.poseGeneration}.`,
    );
  }
  if (input.expectedTopologySha256 !== topology.topologySha256) {
    return unavailable("stale-input", "The expected garment topology hash is stale.");
  }
  if (topologyHash(topology) !== topology.topologySha256) {
    return unavailable("topology-mismatch", "The garment topology arrays no longer match their hash.");
  }
  const normalizedCurrentAnchor = normalizeAnchorFrame(input.currentAnchor, "currentAnchor");
  if (!normalizedCurrentAnchor.ok) return normalizedCurrentAnchor;
  const normalizedBody = normalizeBodyProxies(topology.kind, input.body);
  if (!normalizedBody.ok) return normalizedBody;

  const restToPoseSteps = input.restToPoseSteps ?? defaultBakeSteps(topology.kind);
  const solverIterations = input.solverIterations ?? topology.solverIterations;
  if (!Number.isInteger(restToPoseSteps) || restToPoseSteps < 1) {
    return unavailable("invalid-input", "restToPoseSteps must be a positive integer.");
  }
  if (restToPoseSteps > STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxRestToPoseSteps) {
    return unavailable("budget-exceeded", "restToPoseSteps exceeds the garment bake budget.");
  }
  if (!Number.isInteger(solverIterations) || solverIterations < 1) {
    return unavailable("invalid-input", "solverIterations must be a positive integer.");
  }
  if (solverIterations > STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxSolverIterations) {
    return unavailable("budget-exceeded", "solverIterations exceeds the garment bake budget.");
  }
  const bakeWorkUnits = topology.particleCount * solverIterations * restToPoseSteps;
  if (bakeWorkUnits > STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxBakeWorkUnits) {
    return unavailable(
      "budget-exceeded",
      `Bake work ${bakeWorkUnits} exceeds ${STUDIO_VRM_XPBD_GARMENT_BAKE_BUDGETS.maxBakeWorkUnits}.`,
    );
  }

  const runtimeResult = createStudioClothXpbdRuntimeV2(topology.compiledModel);
  if (!runtimeResult.ok) {
    return unavailable(
      mapKernelFailure(runtimeResult.code),
      `XPBD runtime unavailable: ${runtimeResult.detail}`,
    );
  }
  const runtime = runtimeResult.runtime;
  const tubes = resolveTubes(topology);
  const tubePins: TubeRuntime[] = tubes.map((tube) => ({
    tube,
    restPins: pinPointsForTube(topology, tube, topology.restAnchor, normalizedBody.capsules, false),
    currentPins: pinPointsForTube(
      topology,
      tube,
      normalizedCurrentAnchor.frame,
      normalizedBody.capsules,
      true,
    ),
  }));
  const kernelReceiptHashes: string[] = [];
  let maxCapsulePenetration = 0;
  let totalCapsuleContactCount = 0;
  for (let step = 0; step < restToPoseSteps; step += 1) {
    const previousAlpha = step / restToPoseSteps;
    const currentAlpha = (step + 1) / restToPoseSteps;
    const capsules = normalizedBody.capsules.map((capsule) =>
      capsuleFrameAt(capsule, previousAlpha, currentAlpha),
    );
    const kinematicPins: StudioClothXpbdKinematicPinV2[] = [];
    for (const { tube, restPins, currentPins } of tubePins) {
      for (let segment = 0; segment < topology.segmentCount; segment += 1) {
        kinematicPins.push({
          particle: tube.particleOffset + segment,
          previous: lerpVec3(restPins[segment]!, currentPins[segment]!, previousAlpha),
          current: lerpVec3(restPins[segment]!, currentPins[segment]!, currentAlpha),
        });
      }
    }
    const stepped = stepStudioClothXpbdV2(runtime, {
      expectedStepIndex: step,
      expectedTopologySha256: topology.compiledModel.topologySha256,
      kinematicPins,
      capsules,
      solverIterations,
    });
    if (!stepped.ok) {
      return unavailable(mapKernelFailure(stepped.code), `XPBD bake failed: ${stepped.detail}`);
    }
    kernelReceiptHashes.push(stepped.receipt.receiptSha256);
    maxCapsulePenetration = Math.max(
      maxCapsulePenetration,
      stepped.receipt.diagnostics.maxCapsulePenetration,
    );
    totalCapsuleContactCount += stepped.receipt.capsuleContactCount;
  }

  const positions = new Float32Array(runtime.positions);
  const projection = projectParticleContacts(
    positions,
    topology,
    normalizedBody.capsules,
    normalizedCurrentAnchor.frame.right,
  );
  if (!Number.isFinite(projection.maxDisplacementM) || !Number.isFinite(projection.maxPenetrationM)) {
    return unavailable("numerical-failure", "The baked garment produced non-finite contact results.");
  }
  if (projection.maxPenetrationM > MAX_FINAL_PENETRATION_M) {
    return unavailable(
      "collision-unresolved",
      `The baked garment still intersects a body capsule by ${projection.maxPenetrationM}m.`,
    );
  }
  const maxCapsuleDiameter = Math.max(
    ...normalizedBody.capsules.map((capsule) => capsule.proxy.radius * 2),
  );
  if (projection.maxDisplacementM > maxCapsuleDiameter) {
    return unavailable(
      "collision-unresolved",
      "The contact repair would distort the garment by more than one body-capsule diameter.",
    );
  }
  const outputPositionsSha256 = hashTypedArray(positions);
  const outputSha256 = hashText(
    `${topology.topologySha256}|${outputPositionsSha256}|pose=${input.poseGeneration}`,
  );
  const capsuleIds = Object.freeze(normalizedBody.capsules.map(({ id }) => id));
  const diagnostics: StudioVrmXpbdGarmentBakeDiagnostics = Object.freeze({
    contactProjectionPasses: CONTACT_PROJECTION_PASSES,
    contactProjectionMaxDisplacementM: f32(projection.maxDisplacementM),
    maxCapsulePenetration: f32(maxCapsulePenetration),
    finalCapsulePenetrationById: finalPenetrationByCapsule(
      topology,
      positions,
      normalizedBody.capsules,
    ),
    totalCapsuleContactCount,
    bakeWorkUnits,
    nonFiniteCount: 0,
  });
  const receiptWithoutHash: Omit<StudioVrmXpbdGarmentBakeReceipt, "receiptSha256"> = {
    kind: "studio-vrm-xpbd-garment-bake-receipt",
    version: STUDIO_VRM_XPBD_GARMENT_BAKE_VERSION,
    complete: true,
    mode: STUDIO_VRM_XPBD_GARMENT_SIMULATION_MODE,
    garmentKind: topology.kind,
    slot: topology.slot,
    poseGeneration: input.poseGeneration,
    restToPoseSteps,
    solverIterations,
    particleCount: topology.particleCount,
    triangleCount: topology.triangleCount,
    capsuleCount: normalizedBody.capsules.length,
    capsuleIds,
    selfCollisionEnabled: STUDIO_VRM_XPBD_GARMENT_SELF_COLLISION_ENABLED,
    topologySha256: topology.topologySha256,
    kernelTopologySha256: topology.compiledModel.topologySha256,
    kernelReceiptChainSha256: hashText(kernelReceiptHashes.join("|")),
    outputPositionsSha256,
    outputSha256,
    diagnostics,
  };
  const receipt: StudioVrmXpbdGarmentBakeReceipt = Object.freeze({
    ...receiptWithoutHash,
    receiptSha256: receiptHash(receiptWithoutHash),
  });
  const mesh: StudioVrmXpbdGarmentBakedMesh = Object.freeze({
    positions,
    uvs: new Float32Array(topology.uvs),
    triangleIndices: new Uint32Array(topology.triangleIndices),
    receipt,
  });
  return Object.freeze({ ok: true, status: "ready", mesh });
}

/**
 * Bakes a fresh rest garment to a fenced, user-confirmed pose. One-shot and
 * synchronous by design: callers run it only when
 * `planStudioVrmXpbdGarmentBake` allows, never from the render loop.
 * The supplied topology and caller state are never mutated, so every
 * unavailable result is fail-closed and retryable.
 */
export function bakeStudioVrmXpbdGarmentPose(
  topology: StudioVrmXpbdGarmentTopology,
  input: StudioVrmXpbdGarmentBakeInput,
): StudioVrmXpbdGarmentBakeResult {
  try {
    if (!isRecord(input)) return unavailable("missing-input", "Bake input is required.");
    return bakeUnchecked(topology, input);
  } catch {
    return unavailable("invalid-input", "Garment bake input could not be validated safely.");
  }
}
