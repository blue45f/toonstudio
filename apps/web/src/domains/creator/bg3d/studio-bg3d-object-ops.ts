/**
 * Pure object-ops for Studio 3D background (CSP-style ground / step snap / visibility / lock).
 * Engine-free so unit tests and UI can share one contract.
 */

import type { BgPrimitiveKind } from "../studio-background-3d-metadata";

export type Bg3dVec3 = readonly [number, number, number];
export type Bg3dMutableVec3 = [number, number, number];

export interface StudioBg3dWorldBounds {
  readonly min: Bg3dVec3;
  readonly max: Bg3dVec3;
}

export type StudioBg3dSnapAxis = "xyz" | "xz" | "none";

export interface StudioBg3dSnapSettings {
  /** When false, numeric/gizmo commits pass through unchanged. */
  readonly enabled: boolean;
  /** World-unit move step (e.g. 0.1). ≤0 treated as off for translation. */
  readonly translateStep: number;
  /** Rotation step in degrees (e.g. 15). ≤0 treated as off for rotation. */
  readonly rotateStepDegrees: number;
  /** Which axes receive translate snap. */
  readonly translateAxes: StudioBg3dSnapAxis;
}

export interface StudioBg3dObjectFlags {
  readonly visible: boolean;
  readonly locked: boolean;
}

export const DEFAULT_STUDIO_BG3D_SNAP_SETTINGS: StudioBg3dSnapSettings = Object.freeze({
  enabled: false,
  translateStep: 0.25,
  rotateStepDegrees: 15,
  translateAxes: "xyz",
});

export const STUDIO_BG3D_TRANSLATE_STEP_OPTIONS = [0.05, 0.1, 0.25, 0.5, 1] as const;
export const STUDIO_BG3D_ROTATE_STEP_OPTIONS_DEG = [5, 15, 30, 45, 90] as const;

const EPSILON = 1e-9;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Snap a scalar to the nearest multiple of `step`. Non-finite or non-positive step → identity. */
export function snapScalar(value: number, step: number): number {
  if (!isFiniteNumber(value)) return 0;
  if (!isFiniteNumber(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

export function snapVec3(value: Bg3dVec3, step: number, axes: StudioBg3dSnapAxis = "xyz"): Bg3dMutableVec3 {
  const x = isFiniteNumber(value[0]) ? value[0] : 0;
  const y = isFiniteNumber(value[1]) ? value[1] : 0;
  const z = isFiniteNumber(value[2]) ? value[2] : 0;
  if (axes === "none" || !isFiniteNumber(step) || step <= 0) return [x, y, z];
  if (axes === "xz") return [snapScalar(x, step), y, snapScalar(z, step)];
  return [snapScalar(x, step), snapScalar(y, step), snapScalar(z, step)];
}

/** Snap Euler XYZ radians to a degree grid. */
export function snapEulerRadians(rotation: Bg3dVec3, stepDegrees: number): Bg3dMutableVec3 {
  const rx = isFiniteNumber(rotation[0]) ? rotation[0] : 0;
  const ry = isFiniteNumber(rotation[1]) ? rotation[1] : 0;
  const rz = isFiniteNumber(rotation[2]) ? rotation[2] : 0;
  if (!isFiniteNumber(stepDegrees) || stepDegrees <= 0) return [rx, ry, rz];
  const stepRad = (stepDegrees * Math.PI) / 180;
  return [snapScalar(rx, stepRad), snapScalar(ry, stepRad), snapScalar(rz, stepRad)];
}

export function applyStudioBg3dSnapToTransform(
  transform: { readonly position: Bg3dVec3; readonly rotation: Bg3dVec3; readonly scale?: Bg3dVec3 },
  settings: StudioBg3dSnapSettings
): { position: Bg3dMutableVec3; rotation: Bg3dMutableVec3 } {
  if (!settings.enabled) {
    return {
      position: [
        isFiniteNumber(transform.position[0]) ? transform.position[0] : 0,
        isFiniteNumber(transform.position[1]) ? transform.position[1] : 0,
        isFiniteNumber(transform.position[2]) ? transform.position[2] : 0,
      ],
      rotation: [
        isFiniteNumber(transform.rotation[0]) ? transform.rotation[0] : 0,
        isFiniteNumber(transform.rotation[1]) ? transform.rotation[1] : 0,
        isFiniteNumber(transform.rotation[2]) ? transform.rotation[2] : 0,
      ],
    };
  }
  return {
    position: snapVec3(transform.position, settings.translateStep, settings.translateAxes),
    rotation: snapEulerRadians(transform.rotation, settings.rotateStepDegrees),
  };
}

export function normalizeStudioBg3dSnapSettings(raw: unknown): StudioBg3dSnapSettings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_STUDIO_BG3D_SNAP_SETTINGS };
  }
  const candidate = raw as Partial<StudioBg3dSnapSettings>;
  const translateAxes =
    candidate.translateAxes === "xyz" ||
    candidate.translateAxes === "xz" ||
    candidate.translateAxes === "none"
      ? candidate.translateAxes
      : DEFAULT_STUDIO_BG3D_SNAP_SETTINGS.translateAxes;
  const translateStep = isFiniteNumber(candidate.translateStep)
    ? Math.min(10, Math.max(0.001, candidate.translateStep))
    : DEFAULT_STUDIO_BG3D_SNAP_SETTINGS.translateStep;
  const rotateStepDegrees = isFiniteNumber(candidate.rotateStepDegrees)
    ? Math.min(180, Math.max(0.5, candidate.rotateStepDegrees))
    : DEFAULT_STUDIO_BG3D_SNAP_SETTINGS.rotateStepDegrees;
  return {
    enabled: Boolean(candidate.enabled),
    translateStep,
    rotateStepDegrees,
    translateAxes,
  };
}

/**
 * Local half-extents for primitive kinds used by `makeGeometry` in studio-background-3d-primitives.
 * Values are before object scale (unit mesh).
 */
export function localHalfExtentsForPrimitiveKind(kind: BgPrimitiveKind): Bg3dMutableVec3 {
  switch (kind) {
    case "box":
      return [0.5, 0.5, 0.5];
    case "cylinder":
    case "tube":
      return [0.3, 0.5, 0.3];
    case "plane":
      return [0.5, 0.001, 0.5];
    case "sphere":
      return [0.5, 0.5, 0.5];
    case "hemisphere":
      return [0.5, 0.5, 0.5];
    case "cone":
      return [0.4, 0.5, 0.4];
    case "pyramid":
      return [0.5, 0.5, 0.5];
    case "triangularPrism":
    case "hexPrism":
      return [0.5, 0.5, 0.5];
    case "torus":
      return [0.55, 0.15, 0.55];
    case "ring":
      return [0.5, 0.001, 0.5];
    case "capsule":
      return [0.3, 0.65, 0.3];
    default:
      return [0.5, 0.5, 0.5];
  }
}

/** Half-extents from a full axis-aligned size (custom GLB bounding size). */
export function halfExtentsFromSize(size: Bg3dVec3): Bg3dMutableVec3 {
  return [
    Math.max(EPSILON, Math.abs(isFiniteNumber(size[0]) ? size[0] : 1) / 2),
    Math.max(EPSILON, Math.abs(isFiniteNumber(size[1]) ? size[1] : 1) / 2),
    Math.max(EPSILON, Math.abs(isFiniteNumber(size[2]) ? size[2] : 1) / 2),
  ];
}

/**
 * Rotates a vector by a Three.js default `XYZ` Euler (radians): R = Rx · Ry · Rz, so the vector
 * sees Z first, then Y, then X. The matrix entries are the ones `Matrix4.makeRotationFromEuler`
 * builds for order `XYZ`, which keeps this engine-free helper numerically consistent (to floating-point
 * rounding) with what the viewport renders for `object.rotation`.
 *
 * A single non-zero axis gives the same result in every composition order, which is how an
 * X → Y → Z (= `ZYX`) sequence once slipped through yaw-only tests. Non-finite rotation or vector
 * components are treated as 0 so callers never propagate NaN into transforms.
 */
export function rotateVectorEulerXyz(vector: Bg3dVec3, rotation: Bg3dVec3): Bg3dMutableVec3 {
  const x = isFiniteNumber(vector[0]) ? vector[0] : 0;
  const y = isFiniteNumber(vector[1]) ? vector[1] : 0;
  const z = isFiniteNumber(vector[2]) ? vector[2] : 0;
  const rx = isFiniteNumber(rotation[0]) ? rotation[0] : 0;
  const ry = isFiniteNumber(rotation[1]) ? rotation[1] : 0;
  const rz = isFiniteNumber(rotation[2]) ? rotation[2] : 0;

  const a = Math.cos(rx);
  const b = Math.sin(rx);
  const c = Math.cos(ry);
  const d = Math.sin(ry);
  const e = Math.cos(rz);
  const f = Math.sin(rz);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;

  return [
    c * e * x - c * f * y + d * z,
    (af + be * d) * x + (ae - bf * d) * y - b * c * z,
    (bf - ae * d) * x + (be + af * d) * y + a * c * z,
  ];
}

/**
 * World-space axis-aligned half height of an oriented box with local half-extents × scale.
 * Used so 접지 (ground) lands the lowest corner of the OBB on y=0.
 */
export function worldAabbHalfExtents(
  localHalfExtents: Bg3dVec3,
  rotation: Bg3dVec3,
  scale: Bg3dVec3
): Bg3dMutableVec3 {
  const sx = Math.abs(isFiniteNumber(scale[0]) ? scale[0] : 1);
  const sy = Math.abs(isFiniteNumber(scale[1]) ? scale[1] : 1);
  const sz = Math.abs(isFiniteNumber(scale[2]) ? scale[2] : 1);
  const hx = Math.abs(isFiniteNumber(localHalfExtents[0]) ? localHalfExtents[0] : 0.5) * sx;
  const hy = Math.abs(isFiniteNumber(localHalfExtents[1]) ? localHalfExtents[1] : 0.5) * sy;
  const hz = Math.abs(isFiniteNumber(localHalfExtents[2]) ? localHalfExtents[2] : 0.5) * sz;

  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  for (const ox of [-1, 1] as const) {
    for (const oy of [-1, 1] as const) {
      for (const oz of [-1, 1] as const) {
        const world = rotateVectorEulerXyz([hx * ox, hy * oy, hz * oz], rotation);
        maxX = Math.max(maxX, Math.abs(world[0]));
        maxY = Math.max(maxY, Math.abs(world[1]));
        maxZ = Math.max(maxZ, Math.abs(world[2]));
      }
    }
  }
  return [maxX, maxY, maxZ];
}

/**
 * Move object so its oriented AABB bottom rests on groundY (default 0).
 * Keeps X/Z and rotation/scale; only adjusts position.y.
 */
export function groundTransformPosition(
  position: Bg3dVec3,
  rotation: Bg3dVec3,
  scale: Bg3dVec3,
  localHalfExtents: Bg3dVec3,
  groundY = 0
): Bg3dMutableVec3 {
  const half = worldAabbHalfExtents(localHalfExtents, rotation, scale);
  const x = isFiniteNumber(position[0]) ? position[0] : 0;
  const z = isFiniteNumber(position[2]) ? position[2] : 0;
  const gy = isFiniteNumber(groundY) ? groundY : 0;
  return [x, gy + half[1], z];
}

export function groundPrimitiveTransform(
  kind: BgPrimitiveKind,
  position: Bg3dVec3,
  rotation: Bg3dVec3,
  scale: Bg3dVec3,
  groundY = 0
): Bg3dMutableVec3 {
  return groundTransformPosition(
    position,
    rotation,
    scale,
    localHalfExtentsForPrimitiveKind(kind),
    groundY
  );
}

export function groundModelTransform(
  boundingSize: Bg3dVec3,
  position: Bg3dVec3,
  rotation: Bg3dVec3,
  scale: Bg3dVec3,
  groundY = 0
): Bg3dMutableVec3 {
  return groundTransformPosition(
    position,
    rotation,
    scale,
    halfExtentsFromSize(boundingSize),
    groundY
  );
}

/**
 * Translate an object's current world position so the *measured geometry bounds* are centered on
 * target X/Z and rest on target Y. Unlike size/half-extent helpers, this does not assume the model
 * pivot is already at the geometry center: imported assets commonly keep authoring-tool pivots far
 * away from their meshes.
 *
 * The caller is responsible for measuring bounds after rotation/scale (and animation, if relevant)
 * and converting the returned world position back into parent-local space. Invalid or inverted
 * bounds return null so an editor command can fail closed instead of moving an object unpredictably.
 */
export function centerAndGroundWorldBoundsPosition(
  worldPosition: Bg3dVec3,
  bounds: StudioBg3dWorldBounds,
  target: Bg3dVec3 = [0, 0, 0]
): Bg3dMutableVec3 | null {
  const values = [
    ...worldPosition,
    ...bounds.min,
    ...bounds.max,
    ...target,
  ];
  if (!values.every(isFiniteNumber)) return null;
  if (
    bounds.max[0] < bounds.min[0] ||
    bounds.max[1] < bounds.min[1] ||
    bounds.max[2] < bounds.min[2]
  ) {
    return null;
  }

  // Halving before addition avoids overflowing when valid imported coordinates are very large.
  const centerX = bounds.min[0] / 2 + bounds.max[0] / 2;
  const centerZ = bounds.min[2] / 2 + bounds.max[2] / 2;
  const next: Bg3dMutableVec3 = [
    worldPosition[0] + target[0] - centerX,
    worldPosition[1] + target[1] - bounds.min[1],
    worldPosition[2] + target[2] - centerZ,
  ];
  return next.every(isFiniteNumber) ? next : null;
}

export function normalizeStudioBg3dObjectFlags(raw: {
  readonly visible?: unknown;
  readonly locked?: unknown;
}): StudioBg3dObjectFlags {
  return {
    visible: raw.visible === false ? false : true,
    locked: raw.locked === true,
  };
}

export function isBgObjectVisible(raw: { readonly visible?: unknown } | null | undefined): boolean {
  if (!raw) return true;
  return raw.visible !== false;
}

export function isBgObjectLocked(raw: { readonly locked?: unknown } | null | undefined): boolean {
  if (!raw) return false;
  return raw.locked === true;
}

/** Whether transform/gizmo edits should be rejected for the selected object. */
export function isBgObjectTransformBlocked(
  raw: { readonly locked?: unknown; readonly visible?: unknown } | null | undefined
): boolean {
  return isBgObjectLocked(raw);
}

export interface StudioBg3dLayerListItem {
  readonly id: string;
  readonly label: string;
  readonly kind: "primitive" | "model";
  readonly visible: boolean;
  readonly locked: boolean;
  readonly parentId?: string | null;
}

export function filterStudioBg3dLayerItems(
  items: readonly StudioBg3dLayerListItem[],
  query: string
): StudioBg3dLayerListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((item) => item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q));
}

export function studioBg3dSnapSettingsSummary(settings: StudioBg3dSnapSettings): string {
  if (!settings.enabled) return "스냅 끔";
  const axes =
    settings.translateAxes === "xz" ? "XZ" : settings.translateAxes === "none" ? "회전만" : "XYZ";
  return `이동 ${settings.translateStep} · 회전 ${settings.rotateStepDegrees}° · ${axes}`;
}
