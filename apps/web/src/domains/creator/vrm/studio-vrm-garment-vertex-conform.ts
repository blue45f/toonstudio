/**
 * VRoid XWear · CC4 Conform Clothing 클린룸 — 3D 의상 버텍스 자동 컨폼,
 * 피부 충돌 밀어내기(Pushout) 및 대칭 언더메시 트리밍 엔진.
 *
 * - 기준 체형 대비 타깃 체형의 구간별(어깨·가슴·허리·골반·신장) 비율 편차를 의상 정점에 자동 컨폼
 * - 피부 관통 정점을 최근접 체형 표면 법선 밖으로 밀어내어 최소 여유 간격(`minClearanceMm`) 확보
 * - 의상 아래 가려지는 캐릭터 피부 삼각형을 대칭 브러시(`mirrorX`) 또는 자동 근접 가림으로 트리밍
 */

export type Vec3Tuple = readonly [number, number, number];

export interface ConformMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
}

export interface BodyZoneFitProfile {
  readonly heightScale: number;
  readonly shoulderWidthScale: number;
  readonly chestDepthScale: number;
  readonly waistWidthScale: number;
  readonly hipWidthScale: number;
}

export interface GarmentConformOptions {
  /** 의상이 피부 표면 바깥에 유지해야 할 최소 여유 두께(mm). */
  readonly minClearanceMm: number;
  /** 피부 밀어내기 후 스파이크 방지를 위한 완화 패스 반복 수. */
  readonly pushoutIterations: number;
  /** 피부 관통 검출 최대 반경(m). */
  readonly collisionSearchRadiusM: number;
}

export interface GarmentConformResult {
  readonly positions: Float32Array;
  readonly initialPenetrationCount: number;
  readonly remainingPenetrationCount: number;
  readonly maxPushoutMm: number;
}

export interface UnderMeshTrimMask {
  readonly vertexCount: number;
  /** `1`이면 의상에 가려져 렌더링에서 제외(트리밍), `0`이면 표시 유지. */
  readonly hiddenFlags: Uint8Array;
}

export const NEUTRAL_BODY_ZONE_PROFILE: BodyZoneFitProfile = Object.freeze({
  heightScale: 1,
  shoulderWidthScale: 1,
  chestDepthScale: 1,
  waistWidthScale: 1,
  hipWidthScale: 1,
});

export const DEFAULT_GARMENT_CONFORM_OPTIONS: GarmentConformOptions = Object.freeze({
  minClearanceMm: 3.5,
  pushoutIterations: 2,
  collisionSearchRadiusM: 0.12,
});

const MM_TO_M = 0.001;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function gaussianWeight(value: number, center: number, sigma: number): number {
  const d = (value - center) / Math.max(1e-4, sigma);
  return Math.exp(-0.5 * d * d);
}

/**
 * 1단계: 타깃 체형 비율(어깨·가슴·허리·골반·신장)을 의상 정점에 매끄럽게 자동 컨폼한다.
 */
export function conformGarmentVerticesToBodyProfile(
  garmentPositions: Float32Array,
  targetProfile: BodyZoneFitProfile,
  referenceHeightM = 1.7,
): Float32Array {
  const out = new Float32Array(garmentPositions.length);
  const hScale = clamp(targetProfile.heightScale, 0.65, 1.35);
  const shScale = clamp(targetProfile.shoulderWidthScale, 0.75, 1.35);
  const chScale = clamp(targetProfile.chestDepthScale, 0.75, 1.35);
  const waScale = clamp(targetProfile.waistWidthScale, 0.75, 1.35);
  const hiScale = clamp(targetProfile.hipWidthScale, 0.75, 1.35);
  const safeRefH = Math.max(0.5, referenceHeightM);

  for (let i = 0; i < garmentPositions.length; i += 3) {
    const x = garmentPositions[i];
    const y = garmentPositions[i + 1];
    const z = garmentPositions[i + 2];
    const normY = clamp(y / safeRefH, 0, 1);

    const wShoulder = gaussianWeight(normY, 0.81, 0.1);
    const wChest = gaussianWeight(normY, 0.72, 0.1);
    const wWaist = gaussianWeight(normY, 0.61, 0.08);
    const wHip = gaussianWeight(normY, 0.51, 0.1);

    const scaleX =
      1
      + (shScale - 1) * wShoulder
      + (waScale - 1) * wWaist
      + (hiScale - 1) * wHip;
    const scaleZ =
      1
      + (chScale - 1) * wChest
      + (waScale - 1) * wWaist * 0.7
      + (hiScale - 1) * wHip * 0.8;

    out[i] = x * scaleX;
    out[i + 1] = y * hScale;
    out[i + 2] = z * scaleZ;
  }
  return out;
}

/**
 * 2단계: 타깃 캐릭터 피부 메시와의 관통 정점을 검출해 최소 여유 간격(`minClearanceMm`) 밖으로 밀어낸다.
 */
export function resolveGarmentSkinPushout(
  garmentPositions: Float32Array,
  bodyMesh: ConformMeshData,
  options: GarmentConformOptions = DEFAULT_GARMENT_CONFORM_OPTIONS,
): GarmentConformResult {
  const out = new Float32Array(garmentPositions);
  const bodyPos = bodyMesh.positions;
  const bodyNorm = bodyMesh.normals;
  const bodyVertCount = Math.floor(bodyPos.length / 3);
  if (bodyVertCount === 0) {
    return {
      positions: out,
      initialPenetrationCount: 0,
      remainingPenetrationCount: 0,
      maxPushoutMm: 0,
    };
  }

  const clearanceM = Math.max(0.0005, options.minClearanceMm * MM_TO_M);
  const maxRadiusSq = Math.max(0.01, options.collisionSearchRadiusM) ** 2;
  const iterations = Math.max(1, Math.min(6, Math.floor(options.pushoutIterations)));

  let initialPenetrationCount = 0;
  let maxPushoutM = 0;

  const evaluatePenetration = (gIdx: number) => {
    const gx = out[gIdx];
    const gy = out[gIdx + 1];
    const gz = out[gIdx + 2];

    let bestDistSq = maxRadiusSq;
    let bestBodyIdx = -1;
    for (let b = 0; b < bodyVertCount; b += 1) {
      const b3 = b * 3;
      const dx = gx - bodyPos[b3];
      const dy = gy - bodyPos[b3 + 1];
      const dz = gz - bodyPos[b3 + 2];
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestBodyIdx = b3;
      }
    }
    if (bestBodyIdx < 0) return null;

    const nx = bodyNorm[bestBodyIdx];
    const ny = bodyNorm[bestBodyIdx + 1];
    const nz = bodyNorm[bestBodyIdx + 2];
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nLen <= 1e-8) return null;
    const invN = 1 / nLen;
    const unx = nx * invN;
    const uny = ny * invN;
    const unz = nz * invN;

    const signedDist =
      (gx - bodyPos[bestBodyIdx]) * unx
      + (gy - bodyPos[bestBodyIdx + 1]) * uny
      + (gz - bodyPos[bestBodyIdx + 2]) * unz;

    return { signedDist, unx, uny, unz };
  };

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let g = 0; g < out.length; g += 3) {
      const hit = evaluatePenetration(g);
      if (!hit) continue;
      if (hit.signedDist < clearanceM) {
        if (iter === 0) initialPenetrationCount += 1;
        const push = clearanceM - hit.signedDist;
        out[g] += hit.unx * push;
        out[g + 1] += hit.uny * push;
        out[g + 2] += hit.unz * push;
        if (push > maxPushoutM) maxPushoutM = push;
      }
    }
  }

  let remainingPenetrationCount = 0;
  for (let g = 0; g < out.length; g += 3) {
    const hit = evaluatePenetration(g);
    if (hit && hit.signedDist < clearanceM - 1e-4) {
      remainingPenetrationCount += 1;
    }
  }

  return {
    positions: out,
    initialPenetrationCount,
    remainingPenetrationCount,
    maxPushoutMm: maxPushoutM / MM_TO_M,
  };
}

/** 의상 정점과 근접·덮인 캐릭터 피부 정점을 자동 탐지해 초기 언더메시 트리밍 마스크를 생성한다. */
export function createAutoUnderMeshTrimMask(
  bodyMesh: ConformMeshData,
  garmentPositions: Float32Array,
  coverRadiusM = 0.045,
): UnderMeshTrimMask {
  const bodyVertCount = Math.floor(bodyMesh.positions.length / 3);
  const hiddenFlags = new Uint8Array(bodyVertCount);
  const gVertCount = Math.floor(garmentPositions.length / 3);
  const radiusSq = Math.max(0.005, coverRadiusM) ** 2;

  for (let b = 0; b < bodyVertCount; b += 1) {
    const b3 = b * 3;
    const bx = bodyMesh.positions[b3];
    const by = bodyMesh.positions[b3 + 1];
    const bz = bodyMesh.positions[b3 + 2];
    const nx = bodyMesh.normals[b3];
    const ny = bodyMesh.normals[b3 + 1];
    const nz = bodyMesh.normals[b3 + 2];

    for (let g = 0; g < gVertCount; g += 1) {
      const g3 = g * 3;
      const dx = garmentPositions[g3] - bx;
      const dy = garmentPositions[g3 + 1] - by;
      const dz = garmentPositions[g3 + 2] - bz;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq <= radiusSq && dx * nx + dy * ny + dz * nz >= -0.005) {
        hiddenFlags[b] = 1;
        break;
      }
    }
  }

  return { vertexCount: bodyVertCount, hiddenFlags };
}

/**
 * VRoid Dress-up 스타일 대칭 브러시(`mirrorX`)로 언더메시 트리밍 마스크를 칠하거나 지운다.
 */
export function paintUnderMeshTrimBrush(
  mask: UnderMeshTrimMask,
  bodyPositions: Float32Array,
  brushCenter: Vec3Tuple,
  brushRadiusM: number,
  action: "hide" | "reveal",
  mirrorX = true,
): UnderMeshTrimMask {
  const nextFlags = new Uint8Array(mask.hiddenFlags);
  const rSq = Math.max(0.002, brushRadiusM) ** 2;
  const flagValue = action === "hide" ? 1 : 0;

  const paintAt = (cx: number, cy: number, cz: number) => {
    for (let v = 0; v < mask.vertexCount; v += 1) {
      const v3 = v * 3;
      const dx = bodyPositions[v3] - cx;
      const dy = bodyPositions[v3 + 1] - cy;
      const dz = bodyPositions[v3 + 2] - cz;
      if (dx * dx + dy * dy + dz * dz <= rSq) {
        nextFlags[v] = flagValue;
      }
    }
  };

  paintAt(brushCenter[0], brushCenter[1], brushCenter[2]);
  if (mirrorX) {
    paintAt(-brushCenter[0], brushCenter[1], brushCenter[2]);
  }
  return { vertexCount: mask.vertexCount, hiddenFlags: nextFlags };
}

/** 트리밍 마스크의 모든 꼭짓점이 숨김(`1`)인 피부 삼각형을 제거한 새 인덱스 버퍼를 반환한다. */
export function applyUnderMeshTrimToIndices(
  bodyIndices: Uint16Array | Uint32Array,
  mask: UnderMeshTrimMask,
): Uint32Array {
  const kept: number[] = [];
  for (let i = 0; i < bodyIndices.length; i += 3) {
    const a = bodyIndices[i];
    const b = bodyIndices[i + 1];
    const c = bodyIndices[i + 2];
    if (mask.hiddenFlags[a] === 1 && mask.hiddenFlags[b] === 1 && mask.hiddenFlags[c] === 1) {
      continue;
    }
    kept.push(a, b, c);
  }
  return new Uint32Array(kept);
}
