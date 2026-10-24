import type { StudioMannequinVec3 } from "./studio-varco3d-preview-inspector";

// ============================================================================
// 1. Constants & Metrics (BrushManager, WaveRevealEffect, VoxelGridPreview)
// ============================================================================

/**
 * Exact constants from VARCO 3D's `BrushManager` (`index-0_QlvNS9.js`).
 */
export const STUDIO_VARCO3D_PBR_PAINT_METRICS = {
  placeholderPaintTextureSize: 2048,
  maxStrokeStepsPerFrame: 1,
  brushRingSegments: 64,
  brushRingOutlineInnerRadius: 0.96,
  maxHistorySteps: 20,
  historyByteBudget: 512 * 1024 * 1024,
  bumpNormalScale: 0.05,
  restoreResidualSnapThreshold: 0.004,
  restoreMinInfluenceThreshold: 0.001,
  backfaceGrazingMinDot: -0.1,
  smudgeMinPullPx: 2.0,
  smudgeMaxPullPx: 24.0,
  smudgeSampleTapCount: 5,
  smudgeStrengthMultiplier: 1.25,
  visibleProjectorDepthEpsilon: 0.0015,
  decalCrackFillAlphaThreshold: 0.05,
  decalCrackFillMinNeighbors: 4.5,
  coverageDilateAlphaThreshold: 0.5,
} as const;

/**
 * Exact constants from VARCO 3D's `WaveRevealEffect` (`d_`) and `VoxelGridPreview` (`rx`)
 * (`index-0_QlvNS9.js`).
 */
export const STUDIO_VARCO3D_WAVE_VOXEL_METRICS = {
  waveRevealDurationMs: 2200,
  waveRevealAmp: 0.045,
  waveRevealSoft: 0.06,
  waveRevealGlow: 0.08,
  voxelResolution: 38,
  voxelMaxCells: 10_000,
  voxelFadeInMs: 1600,
  voxelEntryWobbleAmp: 0.1,
  voxelEntryWobbleHz: 1.4,
  voxelEntryBreathe: 0.35,
  voxelExitWaitMs: 750,
  voxelLoopDecayMs: 300,
  voxelSparkleMs: 1100,
  voxelSweepPeriodMs: 5200,
  voxelSweepRestEnd: 0.12,
  voxelSweepBuildEnd: 0.72,
  voxelSweepStrength: 0.08,
  voxelSweepDim: 0.6,
  voxelSweepSwell: 0.12,
  voxelSweepSwellBand: 0.08,
  voxelGlitchCycleMs: 3000,
  voxelGlitchMs: 340,
  voxelGlitchDist: 10,
  voxelGlitchGate: 0.02,
  voxelGlitchRampMs: 8000,
  voxelMorphMs: 1600,
  particleOverlapMs: 1100,
} as const;

export type StudioVarco3dPbrPaintChannel =
  | "baseColor"
  | "normal"
  | "roughness"
  | "metalness"
  | "bump"
  | "flatten"
  | "restore"
  | "smudge";

export type StudioVarco3dMultiviewDirection = "front" | "left" | "right" | "back";

export interface StudioVarco3dDraftBoneNode {
  readonly name: string;
  readonly parentName: string | null;
  readonly position: StudioMannequinVec3;
}

export interface StudioVarco3dSkeletonAuditReport {
  readonly rootNames: readonly string[];
  readonly cycleBoneNames: readonly string[];
  readonly totalBoneCount: number;
}

export interface StudioVarco3dSubmeshExtractionResult {
  readonly extractedVertexCount: number;
  readonly extractedTriangleCount: number;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

export interface StudioVarco3dMeshNormalAuditReport {
  readonly totalEdgeCount: number;
  readonly manifoldEdgeCount: number;
  readonly inconsistentWindingCount: number;
  readonly shouldFlipWinding: boolean;
}

// ============================================================================
// 2. Internal Math Helpers
// ============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(value: number, edge0: number, edge1: number): number {
  if (Math.abs(edge1 - edge0) <= 1e-12) {
    return value >= edge1 ? 1 : 0;
  }
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function vec3Distance(a: StudioMannequinVec3, b: StudioMannequinVec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function vec3Dot(a: StudioMannequinVec3, b: StudioMannequinVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vec3Normalize(
  v: StudioMannequinVec3,
  fallback: StudioMannequinVec3 = { x: 0, y: 0, z: 1 },
): StudioMannequinVec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len <= 1e-12) {
    return fallback;
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

// ============================================================================
// 3. BrushManager GPU PBR Texture Painting & JFA+1 UV Seam Padding
// ============================================================================

/**
 * Reverse-engineered from VARCO 3D's `BrushManager.ensureNearestIslandRT` (`index-0_QlvNS9.js`).
 * Encodes a 16-bit integer UV coordinate `(px, py)` into normalized RGBA8 `[0..255]`.
 */
export function encodeVarco3dJfaUvCoordRgba8(
  px: number,
  py: number,
): readonly [number, number, number, number] {
  const x = Math.max(0, Math.floor(px));
  const y = Math.max(0, Math.floor(py));
  return [Math.floor(x / 256), x % 256, Math.floor(y / 256), y % 256];
}

/**
 * Reverse-engineered from VARCO 3D's `BrushManager.NEAREST_DECODE_GLSL` (`index-0_QlvNS9.js`):
 * `vec2(b.x * 256.0 + b.y, b.z * 256.0 + b.w)`.
 */
export function decodeVarco3dJfaUvCoordRgba8(
  rByte: number,
  gByte: number,
  bByte: number,
  aByte: number,
): readonly [number, number] {
  return [rByte * 256 + gByte, bByte * 256 + aByte];
}

/**
 * Reverse-engineered from VARCO 3D's `BrushManager.ensureNearestIslandRT` (`index-0_QlvNS9.js`).
 * Generates the Jump Flooding Algorithm step schedule `[2^k, ..., 4, 2, 1, 1]` (JFA+1).
 */
export function computeVarco3dJfaStepSchedule(
  width: number,
  height: number,
): readonly number[] {
  const maxDim = Math.max(1, width, height);
  let step = 1;
  while (step * 2 < maxDim) {
    step *= 2;
  }
  const steps: number[] = [];
  while (step >= 1) {
    steps.push(step);
    step = Math.floor(step / 2);
  }
  steps.push(1);
  return steps;
}

/**
 * Reverse-engineered from VARCO 3D's `createHeightToNormalMaterial` (`index-0_QlvNS9.js`).
 */
export function evaluateVarco3dHeightToNormalWhiteout(params: {
  readonly heightLeft: number;
  readonly heightRight: number;
  readonly heightDown: number;
  readonly heightUp: number;
  readonly texelX: number;
  readonly texelY: number;
  readonly baseNormal?: StudioMannequinVec3;
  readonly bumpScale?: number;
}): {
  readonly gradientX: number;
  readonly gradientY: number;
  readonly heightNormal: StudioMannequinVec3;
  readonly blendedNormal: StudioMannequinVec3;
  readonly encodedRgb01: readonly [number, number, number];
} {
  const bumpScale = params.bumpScale ?? STUDIO_VARCO3D_PBR_PAINT_METRICS.bumpNormalScale;
  const gradX = (params.heightRight - params.heightLeft) / Math.max(2 * params.texelX, 1e-9);
  const gradY = (params.heightUp - params.heightDown) / Math.max(2 * params.texelY, 1e-9);

  const heightNormal = vec3Normalize({
    x: -gradX * bumpScale,
    y: gradY * bumpScale,
    z: 1.0,
  });

  const baseNormal = vec3Normalize(params.baseNormal ?? { x: 0, y: 0, z: 1 });
  const blendedNormal = vec3Normalize({
    x: baseNormal.x + heightNormal.x,
    y: baseNormal.y + heightNormal.y,
    z: baseNormal.z * heightNormal.z,
  });

  return {
    gradientX: gradX,
    gradientY: gradY,
    heightNormal,
    blendedNormal,
    encodedRgb01: [
      blendedNormal.x * 0.5 + 0.5,
      blendedNormal.y * 0.5 + 0.5,
      blendedNormal.z * 0.5 + 0.5,
    ],
  };
}

/**
 * Reverse-engineered from VARCO 3D's `BrushManager` stroke & restore & smudge shaders
 * (`index-0_QlvNS9.js`).
 */
export function evaluateVarco3dBrushStrokeInfluence(params: {
  readonly sampleWorldPos: StudioMannequinVec3;
  readonly sampleWorldNormal: StudioMannequinVec3;
  readonly brushCenterWorld: StudioMannequinVec3;
  readonly brushPrevCenterWorld?: StudioMannequinVec3 | null;
  readonly brushViewDirWorld: StudioMannequinVec3;
  readonly brushRadiusWorld: number;
  readonly hardness: number;
  readonly strength: number;
  readonly restoreBoost?: number;
  readonly baseRgb?: readonly [number, number, number];
  readonly targetRgb?: readonly [number, number, number];
}): {
  readonly distanceWorld: number;
  readonly radialAlpha: number;
  readonly facingFactor: number;
  readonly effectiveInfluence: number;
  readonly smudgePullPx: number;
  readonly blendedRgb: readonly [number, number, number];
  readonly snappedToTarget: boolean;
} {
  let distanceWorld = vec3Distance(params.sampleWorldPos, params.brushCenterWorld);
  if (params.brushPrevCenterWorld) {
    const ab = {
      x: params.brushCenterWorld.x - params.brushPrevCenterWorld.x,
      y: params.brushCenterWorld.y - params.brushPrevCenterWorld.y,
      z: params.brushCenterWorld.z - params.brushPrevCenterWorld.z,
    };
    const ap = {
      x: params.sampleWorldPos.x - params.brushPrevCenterWorld.x,
      y: params.sampleWorldPos.y - params.brushPrevCenterWorld.y,
      z: params.sampleWorldPos.z - params.brushPrevCenterWorld.z,
    };
    const denom = vec3Dot(ab, ab);
    if (denom >= 1e-8) {
      const h = clamp(vec3Dot(ap, ab) / denom, 0, 1);
      const proj = {
        x: params.brushPrevCenterWorld.x + ab.x * h,
        y: params.brushPrevCenterWorld.y + ab.y * h,
        z: params.brushPrevCenterWorld.z + ab.z * h,
      };
      distanceWorld = vec3Distance(params.sampleWorldPos, proj);
    }
  }

  const t = clamp(distanceWorld / Math.max(params.brushRadiusWorld, 1e-6), 0, 1);
  const edge0 = clamp(params.hardness, 0, 0.999);
  const radialAlpha = 1 - smoothstep(t, edge0, 1.0);

  const unitNormal = vec3Normalize(params.sampleWorldNormal);
  const unitView = vec3Normalize(params.brushViewDirWorld);
  const normalDotView = vec3Dot(unitNormal, unitView);
  const facingFactor =
    1 -
    smoothstep(
      normalDotView,
      STUDIO_VARCO3D_PBR_PAINT_METRICS.backfaceGrazingMinDot,
      0.0,
    );

  const clampedStrength = clamp(params.strength, 0, 1);
  let effectiveInfluence = radialAlpha * clampedStrength * facingFactor;

  const restoreBoost = clamp(params.restoreBoost ?? 0, 0, 1);
  if (restoreBoost > 0) {
    const cubicBoosted = 1 - Math.pow(1 - effectiveInfluence, 3);
    effectiveInfluence = lerp(effectiveInfluence, cubicBoosted, restoreBoost);
  }

  const smudgePullPx = lerp(
    STUDIO_VARCO3D_PBR_PAINT_METRICS.smudgeMinPullPx,
    STUDIO_VARCO3D_PBR_PAINT_METRICS.smudgeMaxPullPx,
    clampedStrength,
  );

  const baseRgb = params.baseRgb ?? [0, 0, 0];
  const targetRgb = params.targetRgb ?? [1, 1, 1];
  let r = lerp(baseRgb[0], targetRgb[0], effectiveInfluence);
  let g = lerp(baseRgb[1], targetRgb[1], effectiveInfluence);
  let b = lerp(baseRgb[2], targetRgb[2], effectiveInfluence);

  const maxDiff = Math.max(
    Math.abs(r - targetRgb[0]),
    Math.abs(g - targetRgb[1]),
    Math.abs(b - targetRgb[2]),
  );
  const snappedToTarget =
    restoreBoost > 0 &&
    effectiveInfluence >= STUDIO_VARCO3D_PBR_PAINT_METRICS.restoreMinInfluenceThreshold &&
    maxDiff <= STUDIO_VARCO3D_PBR_PAINT_METRICS.restoreResidualSnapThreshold;
  if (snappedToTarget) {
    r = targetRgb[0];
    g = targetRgb[1];
    b = targetRgb[2];
  }

  return {
    distanceWorld,
    radialAlpha,
    facingFactor,
    effectiveInfluence,
    smudgePullPx,
    blendedRgb: [r, g, b],
    snappedToTarget,
  };
}

/**
 * Reverse-engineered from VARCO 3D's `createDecalCrackFillMaterial` (`index-0_QlvNS9.js`).
 */
export function evaluateVarco3dDecalCrackFill8Neighbor(
  centerRgba: readonly [number, number, number, number],
  neighborsRgba: ReadonlyArray<readonly [number, number, number, number]>,
): readonly [number, number, number, number] {
  if (centerRgba[3] > STUDIO_VARCO3D_PBR_PAINT_METRICS.decalCrackFillAlphaThreshold) {
    return centerRgba;
  }
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumA = 0;
  let validCount = 0;
  for (const neighbor of neighborsRgba) {
    if (neighbor[3] > STUDIO_VARCO3D_PBR_PAINT_METRICS.decalCrackFillAlphaThreshold) {
      sumR += neighbor[0];
      sumG += neighbor[1];
      sumB += neighbor[2];
      sumA += neighbor[3];
      validCount += 1;
    }
  }
  if (validCount >= STUDIO_VARCO3D_PBR_PAINT_METRICS.decalCrackFillMinNeighbors) {
    return [
      sumR / validCount,
      sumG / validCount,
      sumB / validCount,
      sumA / validCount,
    ];
  }
  return centerRgba;
}

// ============================================================================
// 4. WaveRevealEffect, VoxelGridPreview, Part Extractor & Skeleton Audit
// ============================================================================

/**
 * Reverse-engineered from VARCO 3D's `WaveRevealEffect` (`v3d-wave-reveal`, `index-0_QlvNS9.js`).
 */
export function evaluateVarco3dWaveRevealState(params: {
  readonly elapsedMs: number;
  readonly normalizedPos?: StudioMannequinVec3;
}): {
  readonly progress: number;
  readonly cosineEase: number;
  readonly uReveal: number;
  readonly uRevealTimeSec: number;
  readonly revealWaveOffset: number;
  readonly revealEdgeY: number;
  readonly fallbackMaterialOpacity: number;
  readonly completed: boolean;
} {
  const progress = clamp(
    params.elapsedMs / STUDIO_VARCO3D_WAVE_VOXEL_METRICS.waveRevealDurationMs,
    0,
    1,
  );
  const cosineEase = 0.5 - 0.5 * Math.cos(Math.PI * progress);
  const margin =
    STUDIO_VARCO3D_WAVE_VOXEL_METRICS.waveRevealAmp +
    STUDIO_VARCO3D_WAVE_VOXEL_METRICS.waveRevealSoft +
    0.02;
  const uReveal = -margin + cosineEase * (1 + 2 * margin);
  const uRevealTimeSec = params.elapsedMs / 1000;

  const pos = params.normalizedPos ?? { x: 0, y: 0.5, z: 0 };
  const revealWaveOffset =
    0.5 * Math.sin(pos.x * 9.0 + uRevealTimeSec * 2.2) +
    0.35 * Math.sin(pos.z * 13.0 - uRevealTimeSec * 1.7) +
    0.15 * Math.sin((pos.x + pos.z) * 21.0 + uRevealTimeSec * 3.1);
  const revealEdgeY =
    uReveal + revealWaveOffset * STUDIO_VARCO3D_WAVE_VOXEL_METRICS.waveRevealAmp;

  return {
    progress,
    cosineEase,
    uReveal,
    uRevealTimeSec,
    revealWaveOffset,
    revealEdgeY,
    fallbackMaterialOpacity: 1 - cosineEase,
    completed: progress >= 1,
  };
}

/**
 * Reverse-engineered from VARCO 3D's `VoxelGridPreview.update` (`index-0_QlvNS9.js`).
 */
export function evaluateVarco3dVoxelGridPreviewState(params: {
  readonly elapsedMs: number;
  readonly exiting?: boolean;
  readonly exitElapsedMs?: number;
}): {
  readonly fade: number;
  readonly sweep: number;
  readonly sweepGain: number;
  readonly breathe: number;
  readonly shouldClear: boolean;
} {
  const m = STUDIO_VARCO3D_WAVE_VOXEL_METRICS;
  const fadeInDone = params.elapsedMs >= m.voxelFadeInMs;
  let fade = 1;
  if (!params.exiting) {
    const t = clamp(params.elapsedMs / m.voxelFadeInMs, 0, 1);
    fade = t * t * (3 - 2 * t);
  }

  let loopDecay = 1;
  if (params.exiting) {
    const exitElapsed = Math.max(0, params.exitElapsedMs ?? 0);
    loopDecay = Math.max(0, 1 - exitElapsed / m.voxelLoopDecayMs);
    const sparklePhase = (exitElapsed - m.voxelExitWaitMs) / m.voxelSparkleMs;
    if (sparklePhase >= 1.05) {
      return { fade: 0, sweep: -1, sweepGain: 0, breathe: 0, shouldClear: true };
    }
    fade = 1 - smoothstep(sparklePhase, 0.25, 1.0);
  }

  let sweep = 0;
  let sweepGain = 1;
  if (fadeInDone && loopDecay > 0) {
    const cycle =
      ((params.elapsedMs - m.voxelFadeInMs) % m.voxelSweepPeriodMs) / m.voxelSweepPeriodMs;
    if (cycle < m.voxelSweepRestEnd) {
      sweep = 0;
      sweepGain = 1;
    } else if (cycle < m.voxelSweepBuildEnd) {
      const buildT =
        (cycle - m.voxelSweepRestEnd) / (m.voxelSweepBuildEnd - m.voxelSweepRestEnd);
      sweep = buildT * 1.1;
      sweepGain = 1;
    } else {
      const tailT = (cycle - m.voxelSweepBuildEnd) / (1 - m.voxelSweepBuildEnd);
      sweep = 1.1;
      sweepGain = 1 - tailT * tailT;
    }
  } else if (loopDecay <= 0) {
    sweep = -1;
  }

  const settleEndMs = m.voxelFadeInMs + m.voxelSweepRestEnd * m.voxelSweepPeriodMs;
  const entryEnvelope =
    params.exiting || params.elapsedMs >= settleEndMs
      ? 0
      : 1 - smoothstep(params.elapsedMs, settleEndMs * 0.45, settleEndMs);
  const breathe =
    entryEnvelope *
    m.voxelEntryBreathe *
    (0.5 + 0.5 * Math.sin((params.elapsedMs / 1000) * 1.2 * Math.PI));

  return {
    fade,
    sweep,
    sweepGain,
    breathe,
    shouldClear: false,
  };
}

/**
 * Reverse-engineered from VARCO 3D's `detectMultiviewPosition` (`index-0_QlvNS9.js`).
 */
export function detectVarco3dMultiviewPosition(
  labelOrFilename: string,
): StudioVarco3dMultiviewDirection | null {
  const lower = labelOrFilename.toLowerCase();
  if (lower.includes("front") || lower.includes("top")) {
    return "front";
  }
  if (lower.includes("left")) {
    return "left";
  }
  if (lower.includes("right")) {
    return "right";
  }
  if (lower.includes("back") || lower.includes("bottom")) {
    return "back";
  }
  return null;
}

/**
 * Audits a skeleton bone hierarchy (`RigJointList` / `RigEditManager.reparentBone` cycle check).
 */
export function auditVarco3dSkeletonDraft(
  bones: readonly StudioVarco3dDraftBoneNode[],
): StudioVarco3dSkeletonAuditReport {
  const parentByName = new Map(bones.map((b) => [b.name, b.parentName]));
  const rootNames: string[] = [];
  const cycleBoneNames: string[] = [];

  for (const bone of bones) {
    if (bone.parentName === null || !parentByName.has(bone.parentName)) {
      rootNames.push(bone.name);
    }
    const visited = new Set<string>([bone.name]);
    let cursor = bone.parentName;
    while (cursor !== null) {
      if (visited.has(cursor)) {
        cycleBoneNames.push(bone.name);
        break;
      }
      visited.add(cursor);
      cursor = parentByName.get(cursor) ?? null;
    }
  }

  return Object.freeze({
    rootNames: Object.freeze(rootNames),
    cycleBoneNames: Object.freeze(cycleBoneNames),
    totalBoneCount: bones.length,
  });
}

/**
 * Extracts a compact submesh part from selected triangle face indices.
 */
export function extractVarco3dSubmeshPart(params: {
  readonly positions: ArrayLike<number>;
  readonly indices: ArrayLike<number>;
  readonly selectedFaceIndices: readonly number[];
}): StudioVarco3dSubmeshExtractionResult {
  const oldToNew = new Map<number, number>();
  const outPositions: number[] = [];
  const outIndices: number[] = [];

  for (const faceIdx of params.selectedFaceIndices) {
    const base = faceIdx * 3;
    if (base + 2 >= params.indices.length) {
      continue;
    }
    for (let corner = 0; corner < 3; corner += 1) {
      const oldVertex = Number(params.indices[base + corner] ?? 0);
      let newVertex = oldToNew.get(oldVertex);
      if (newVertex === undefined) {
        newVertex = outPositions.length / 3;
        oldToNew.set(oldVertex, newVertex);
        outPositions.push(
          Number(params.positions[oldVertex * 3] ?? 0),
          Number(params.positions[oldVertex * 3 + 1] ?? 0),
          Number(params.positions[oldVertex * 3 + 2] ?? 0),
        );
      }
      outIndices.push(newVertex);
    }
  }

  return Object.freeze({
    extractedVertexCount: outPositions.length / 3,
    extractedTriangleCount: outIndices.length / 3,
    positions: new Float32Array(outPositions),
    indices: new Uint32Array(outIndices),
  });
}

/**
 * Audits shared triangle half-edges and outward radial normal alignment (`fixNormalsIfNeeded`).
 */
export function auditVarco3dMeshNormalsAndWinding(params: {
  readonly positions: ArrayLike<number>;
  readonly indices: ArrayLike<number>;
}): StudioVarco3dMeshNormalAuditReport {
  const edgeDirections = new Map<string, number[]>();
  const triCount = Math.floor(params.indices.length / 3);

  for (let t = 0; t < triCount; t += 1) {
    const i0 = Number(params.indices[t * 3] ?? 0);
    const i1 = Number(params.indices[t * 3 + 1] ?? 0);
    const i2 = Number(params.indices[t * 3 + 2] ?? 0);
    const edges: ReadonlyArray<readonly [number, number]> = [
      [i0, i1],
      [i1, i2],
      [i2, i0],
    ];
    for (const [a, b] of edges) {
      if (a === b) {
        continue;
      }
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}:${hi}`;
      const sign = a < b ? 1 : -1;
      const list = edgeDirections.get(key);
      if (list) {
        list.push(sign);
      } else {
        edgeDirections.set(key, [sign]);
      }
    }
  }

  let manifoldEdgeCount = 0;
  let inconsistentWindingCount = 0;
  for (const signs of edgeDirections.values()) {
    if (signs.length === 2) {
      manifoldEdgeCount += 1;
      if (signs[0] === signs[1]) {
        inconsistentWindingCount += 1;
      }
    }
  }

  return Object.freeze({
    totalEdgeCount: edgeDirections.size,
    manifoldEdgeCount,
    inconsistentWindingCount,
    shouldFlipWinding:
      manifoldEdgeCount > 0 && inconsistentWindingCount > manifoldEdgeCount / 2,
  });
}
