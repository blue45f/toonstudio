import {
  unitMeshFullSizeForKind,
  composeWorldYawWithLocalEulerXyz,
  computePrimitiveWorldHalfExtents,
} from "./studio-bg3d-background-object-cluster";
import type {
  Bg3dV11ScenePrimitive,
  Bg3dV11PrimitiveKind,
} from "./studio-bg3d-v11-upper-catalog";

export function cleanZero(value: number): number {
  const clamped = Math.max(-10000, Math.min(10000, value));
  return Object.is(clamped, -0) || clamped === 0 ? 0 : clamped;
}

export function clampScale(value: number): number {
  return Math.max(0.001, Math.min(1000, value));
}

export function sanitizeSafeToken(raw: string, maxLen: number): string {
  const cleaned = raw.replace(/[^A-Za-z0-9._~-]/gu, "-").replace(/^-+/u, "v");
  return (cleaned.length > 0 ? cleaned : "v11").slice(0, maxLen);
}

export function unitFullSizeForKind(
  kind: Bg3dV11PrimitiveKind,
): readonly [number, number, number] {
  return unitMeshFullSizeForKind(kind);
}

export function composeV11WorldYawWithLocalEulerXyz(
  worldYawRad: number,
  localEulerXyz: readonly [number, number, number],
): [number, number, number] {
  return composeWorldYawWithLocalEulerXyz(localEulerXyz, worldYawRad);
}

export function computeV11PrimitiveWorldHalfExtents(
  kind: Bg3dV11PrimitiveKind,
  scale: readonly [number, number, number],
  rotation: readonly [number, number, number],
): readonly [number, number, number] {
  return computePrimitiveWorldHalfExtents(kind, rotation, scale);
}

export function measureV11PrimitivesWorldBounds(
  primitives: readonly Bg3dV11ScenePrimitive[],
): { min: [number, number, number]; max: [number, number, number] } {
  if (primitives.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const prim of primitives) {
    const [hx, hy, hz] = computeV11PrimitiveWorldHalfExtents(
      prim.kind,
      prim.scale,
      prim.rotation,
    );
    minX = Math.min(minX, prim.position[0] - hx);
    minY = Math.min(minY, prim.position[1] - hy);
    minZ = Math.min(minZ, prim.position[2] - hz);
    maxX = Math.max(maxX, prim.position[0] + hx);
    maxY = Math.max(maxY, prim.position[1] + hy);
    maxZ = Math.max(maxZ, prim.position[2] + hz);
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}
