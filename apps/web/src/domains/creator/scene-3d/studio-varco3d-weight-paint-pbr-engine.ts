import type { StudioMannequinVec3 } from "./studio-varco3d-preview-inspector";

export * from "./studio-varco3d-pbr-jfa-wave-engine";

// ============================================================================
// 1. Constants & Metrics (SkinWeightSession, RigWeightControls, RigJointList)
// ============================================================================

/**
 * Exact constants from VARCO 3D's `SkinWeightSession`, `writeVertexWeight`,
 * `attributeUpdateRanges`, `RigWeightControls`, and `RigJointList` (`index-0_QlvNS9.js`).
 */
export const STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS = {
  maxInfluences: 4,
  candidateInfluences: 5,
  weightEpsilon: 1e-6,
  maxHistorySteps: 80,
  maxGpuUpdateRanges: 24,
  spatialHashRadiusRatio: 0.05,
  spatialHashMinCellSize: 1e-4,
  weldCoordinateScale: 1e5,
  brushDefaultSizePx: 20,
  brushMinSizePx: 1,
  brushMaxSizePx: 100,
  brushShortcutStepPx: 2,
  brushDefaultStrength: 0.5,
  brushDefaultTargetWeight: 1.0,
  cursorRingInnerRadius: 0.96,
  cursorRingOuterRadius: 1.0,
  cursorRingSegments: 64,
  hiddenBaseLayer: 30,
} as const;

export const STUDIO_VARCO3D_RIGGED_TASK_TYPES = ["RIG", "AI_RIG", "EDIT_RIG"] as const;
export type StudioVarco3dRiggedTaskType = (typeof STUDIO_VARCO3D_RIGGED_TASK_TYPES)[number];
export type StudioVarco3dWeightBrushMode = "add" | "subtract" | "smooth" | "set";

const HIDDEN_BONE_PREFIX_REGEX = /^(?:mixamorig\d*[:_]?|HandLoRA_)/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ============================================================================
// 2. SkinWeightSession Heatmap, 5-Candidate Top-4 Solver & Brush Engine
// ============================================================================

/**
 * Reverse-engineered from VARCO 3D's `weightHeatRgb(w)` (`index-0_QlvNS9.js`).
 */
export function evaluateVarco3dWeightHeatRgb(
  weight: number,
): readonly [number, number, number] {
  const w = clamp(weight, 0, 1);
  const intensity = w / 2 + 0.5;
  if (w <= 0.25) {
    return [0, intensity * w * 4, intensity];
  }
  if (w <= 0.5) {
    return [0, intensity, intensity * (1 - (w - 0.25) * 4)];
  }
  if (w <= 0.75) {
    return [intensity * ((w - 0.5) * 4), intensity, 0];
  }
  return [intensity, intensity * (1 - (w - 0.75) * 4), 0];
}

/**
 * Reverse-engineered from VARCO 3D's `WEIGHT_RAMP_GRADIENT` (`index-0_QlvNS9.js`).
 */
export function buildVarco3dWeightRampGradientCss(): string {
  const stops = Array.from({ length: 9 }, (_, index) => {
    const t = index / 8;
    const [r, g, b] = evaluateVarco3dWeightHeatRgb(t);
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}) ${t * 100}%`;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/**
 * Reverse-engineered from VARCO 3D's `writeVertexWeight` (`index-0_QlvNS9.js`).
 */
export function writeVarco3dVertexSkinWeight(params: {
  readonly skinIndices: Uint16Array | Int32Array | number[];
  readonly skinWeights: Float32Array | Float64Array | number[];
  readonly vertexIndex: number;
  readonly boneIndex: number;
  readonly targetWeight: number;
  readonly boneCount: number;
}): void {
  const { skinIndices, skinWeights, vertexIndex, boneIndex, targetWeight, boneCount } = params;
  const maxInf = STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.maxInfluences;
  const eps = STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.weightEpsilon;

  const candidateIndices = new Int32Array(
    STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.candidateInfluences,
  );
  const candidateWeights = new Float64Array(
    STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.candidateInfluences,
  );
  const outputIndices = new Int32Array(maxInf);
  const outputWeights = new Float64Array(maxInf);

  const baseOffset = vertexIndex * maxInf;
  const clampedTarget = clamp(targetWeight, 0, 1);
  let candidateCount = 0;

  for (let slot = 0; slot < maxInf; slot += 1) {
    const idx = Number(skinIndices[baseOffset + slot] ?? 0);
    const weight = Number(skinWeights[baseOffset + slot] ?? 0);
    if (!(weight > eps)) {
      continue;
    }
    let existingPos = -1;
    for (let k = 0; k < candidateCount; k += 1) {
      if (candidateIndices[k] === idx) {
        existingPos = k;
        break;
      }
    }
    if (existingPos >= 0) {
      candidateWeights[existingPos] += weight;
    } else {
      candidateIndices[candidateCount] = idx;
      candidateWeights[candidateCount] = weight;
      candidateCount += 1;
    }
  }

  let targetPos = -1;
  for (let k = 0; k < candidateCount; k += 1) {
    if (candidateIndices[k] === boneIndex) {
      targetPos = k;
      break;
    }
  }
  if (targetPos < 0 && clampedTarget > eps) {
    targetPos = candidateCount;
    candidateIndices[candidateCount] = boneIndex;
    candidateCount += 1;
  }
  if (targetPos >= 0) {
    candidateWeights[targetPos] = clampedTarget;
  }

  let otherWeightSum = 0;
  for (let k = 0; k < candidateCount; k += 1) {
    if (k !== targetPos && candidateWeights[k] > eps) {
      otherWeightSum += candidateWeights[k];
    }
  }
  const remainder = Math.max(0, 1 - clampedTarget);
  if (otherWeightSum > eps) {
    const scale = remainder / otherWeightSum;
    for (let k = 0; k < candidateCount; k += 1) {
      if (k !== targetPos) {
        candidateWeights[k] *= scale;
      }
    }
  } else if (remainder > eps && boneCount > 1) {
    const fallbackBone = boneIndex === 0 ? 1 : 0;
    let fallbackPos = -1;
    for (let k = 0; k < candidateCount; k += 1) {
      if (candidateIndices[k] === fallbackBone) {
        fallbackPos = k;
        break;
      }
    }
    if (fallbackPos < 0) {
      fallbackPos = candidateCount;
      candidateIndices[candidateCount] = fallbackBone;
      candidateCount += 1;
    }
    candidateWeights[fallbackPos] = remainder;
  }

  let outCount = 0;
  let usedMask = 0;
  if (targetPos >= 0 && clampedTarget > eps) {
    outputIndices[outCount] = boneIndex;
    outputWeights[outCount] = clampedTarget;
    outCount += 1;
    usedMask |= 1 << targetPos;
  }

  while (outCount < maxInf) {
    let bestPos = -1;
    let bestWeight: number = eps;
    for (let k = 0; k < candidateCount; k += 1) {
      if ((usedMask & (1 << k)) === 0 && candidateWeights[k] > bestWeight) {
        bestPos = k;
        bestWeight = candidateWeights[k];
      }
    }
    if (bestPos < 0) {
      break;
    }
    outputIndices[outCount] = candidateIndices[bestPos];
    outputWeights[outCount] = candidateWeights[bestPos];
    outCount += 1;
    usedMask |= 1 << bestPos;
  }

  if (outCount > 0) {
    if (clampedTarget > eps && outputIndices[0] === boneIndex) {
      let otherOutSum = 0;
      for (let i = 1; i < outCount; i += 1) {
        otherOutSum += outputWeights[i];
      }
      if (otherOutSum > eps) {
        const scale = remainder / otherOutSum;
        for (let i = 1; i < outCount; i += 1) {
          outputWeights[i] *= scale;
        }
      } else {
        outputWeights[0] = 1;
      }
    } else {
      let totalSum = 0;
      for (let i = 0; i < outCount; i += 1) {
        totalSum += outputWeights[i];
      }
      if (totalSum > eps) {
        const inv = 1 / totalSum;
        for (let i = 0; i < outCount; i += 1) {
          outputWeights[i] *= inv;
        }
      }
    }
  }

  for (let i = 1; i < outCount; i += 1) {
    const idxVal = outputIndices[i];
    const weightVal = outputWeights[i];
    let j = i;
    while (j > 0 && outputWeights[j - 1] < weightVal) {
      outputIndices[j] = outputIndices[j - 1];
      outputWeights[j] = outputWeights[j - 1];
      j -= 1;
    }
    outputIndices[j] = idxVal;
    outputWeights[j] = weightVal;
  }

  for (let slot = 0; slot < maxInf; slot += 1) {
    skinIndices[baseOffset + slot] = slot < outCount ? outputIndices[slot] : 0;
    skinWeights[baseOffset + slot] = slot < outCount ? outputWeights[slot] : 0;
  }
}

export interface StudioVarco3dGpuUpdateRange {
  readonly start: number;
  readonly count: number;
}

/**
 * Reverse-engineered from VARCO 3D's `attributeUpdateRanges(sortedVertices, itemSize)`
 * (`index-0_QlvNS9.js`).
 */
export function coalesceVarco3dGpuUpdateRanges(
  sortedVertexIndices: readonly number[],
  itemSize: number,
  maxRanges: number = STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.maxGpuUpdateRanges,
): readonly StudioVarco3dGpuUpdateRange[] {
  if (sortedVertexIndices.length === 0) {
    return [];
  }
  const gaps: Array<{ index: number; gap: number }> = [];
  for (let i = 1; i < sortedVertexIndices.length; i += 1) {
    const gap = sortedVertexIndices[i]! - sortedVertexIndices[i - 1]! - 1;
    if (gap > 0) {
      gaps.push({ index: i, gap });
    }
  }
  gaps.sort((a, b) => b.gap - a.gap);
  const splitIndices = new Set(
    gaps.slice(0, Math.max(0, maxRanges - 1)).map((entry) => entry.index),
  );

  const ranges: StudioVarco3dGpuUpdateRange[] = [];
  let rangeStartIdx = 0;
  for (let i = 1; i <= sortedVertexIndices.length; i += 1) {
    if (i < sortedVertexIndices.length && !splitIndices.has(i)) {
      continue;
    }
    const firstVertex = sortedVertexIndices[rangeStartIdx]!;
    const lastVertex = sortedVertexIndices[i - 1]!;
    ranges.push({
      start: firstVertex * itemSize,
      count: (lastVertex - firstVertex + 1) * itemSize,
    });
    rangeStartIdx = i;
  }
  return ranges;
}

export interface StudioVarco3dSkinWeightBrushStrokeResult {
  readonly affectedVertices: readonly number[];
  readonly skinIndices: Uint16Array;
  readonly skinWeights: Float32Array;
  readonly heatColorsRgb: Float32Array;
  readonly gpuUpdateRanges4: readonly StudioVarco3dGpuUpdateRange[];
}

/**
 * Reverse-engineered from VARCO 3D's `SkinWeightSession.paintAt` & `ensureVertexAdjacency`
 * (`index-0_QlvNS9.js`).
 */
export function applyVarco3dSkinWeightBrushStroke(params: {
  readonly positions: Float32Array | readonly number[];
  readonly triangleIndices?: Uint16Array | Uint32Array | readonly number[];
  readonly skinIndices: ArrayLike<number>;
  readonly skinWeights: ArrayLike<number>;
  readonly boneIndex: number;
  readonly boneCount: number;
  readonly hitCenter: StudioMannequinVec3;
  readonly brushRadiusWorld: number;
  readonly mode: StudioVarco3dWeightBrushMode;
  readonly strength: number;
  readonly targetWeight?: number;
}): StudioVarco3dSkinWeightBrushStrokeResult {
  const vertexCount = Math.floor(params.positions.length / 3);
  const nextIndices = new Uint16Array(vertexCount * 4);
  const nextWeights = new Float32Array(vertexCount * 4);
  for (let i = 0; i < vertexCount * 4; i += 1) {
    nextIndices[i] = Math.round(params.skinIndices[i] ?? 0);
    nextWeights[i] = Number(params.skinWeights[i] ?? 0);
  }

  const radius = Math.max(params.brushRadiusWorld, 1e-5);
  const radiusSq = radius * radius;
  const strength = clamp(params.strength, 0, 1);
  const targetWeight = clamp(
    params.targetWeight ?? STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.brushDefaultTargetWeight,
    0,
    1,
  );

  const selectedWeightAt = (vertexIndex: number): number => {
    if (params.boneIndex < 0) {
      return 0;
    }
    const base = vertexIndex * 4;
    for (let slot = 0; slot < 4; slot += 1) {
      if (nextIndices[base + slot] === params.boneIndex) {
        return nextWeights[base + slot] ?? 0;
      }
    }
    return 0;
  };

  const affected: number[] = [];
  const distances: number[] = [];
  for (let v = 0; v < vertexCount; v += 1) {
    const vx = Number(params.positions[v * 3] ?? 0);
    const vy = Number(params.positions[v * 3 + 1] ?? 0);
    const vz = Number(params.positions[v * 3 + 2] ?? 0);
    const dx = vx - params.hitCenter.x;
    const dy = vy - params.hitCenter.y;
    const dz = vz - params.hitCenter.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq <= radiusSq) {
      affected.push(v);
      distances.push(Math.sqrt(distSq));
    }
  }

  let smoothTargetByVertex: Float64Array | null = null;
  if (params.mode === "smooth" && affected.length > 0) {
    smoothTargetByVertex = new Float64Array(vertexCount);
    const fallbackAverage =
      affected.reduce((sum, v) => sum + selectedWeightAt(v), 0) / affected.length;
    if (params.triangleIndices && params.triangleIndices.length >= 3) {
      const scale = STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.weldCoordinateScale;
      const rep = new Int32Array(vertexCount);
      const weldMap = new Map<string, number>();
      for (let v = 0; v < vertexCount; v += 1) {
        const key = `${Math.round(Number(params.positions[v * 3] ?? 0) * scale)}|${Math.round(
          Number(params.positions[v * 3 + 1] ?? 0) * scale,
        )}|${Math.round(Number(params.positions[v * 3 + 2] ?? 0) * scale)}`;
        const existing = weldMap.get(key);
        if (existing === undefined) {
          weldMap.set(key, v);
          rep[v] = v;
        } else {
          rep[v] = existing;
        }
      }
      const neighborsMap = new Map<number, Set<number>>();
      const ensureSet = (r: number): Set<number> => {
        let s = neighborsMap.get(r);
        if (!s) {
          s = new Set<number>();
          neighborsMap.set(r, s);
        }
        return s;
      };
      for (let i = 0; i + 2 < params.triangleIndices.length; i += 3) {
        const a = rep[Number(params.triangleIndices[i] ?? 0)] ?? 0;
        const b = rep[Number(params.triangleIndices[i + 1] ?? 0)] ?? 0;
        const c = rep[Number(params.triangleIndices[i + 2] ?? 0)] ?? 0;
        if (a !== b) {
          ensureSet(a).add(b);
          ensureSet(b).add(a);
        }
        if (b !== c) {
          ensureSet(b).add(c);
          ensureSet(c).add(b);
        }
        if (a !== c) {
          ensureSet(a).add(c);
          ensureSet(c).add(a);
        }
      }
      for (const v of affected) {
        const r = rep[v] ?? v;
        const neighbors = neighborsMap.get(r);
        if (!neighbors || neighbors.size === 0) {
          smoothTargetByVertex[v] = fallbackAverage;
        } else {
          let sum = 0;
          for (const n of neighbors) {
            sum += selectedWeightAt(n);
          }
          smoothTargetByVertex[v] = sum / neighbors.size;
        }
      }
    } else {
      for (const v of affected) {
        smoothTargetByVertex[v] = fallbackAverage;
      }
    }
  }

  for (let idx = 0; idx < affected.length; idx += 1) {
    const v = affected[idx]!;
    const dist = distances[idx]!;
    const falloff = 1 - clamp(dist / radius, 0, 1);
    const currentWeight = selectedWeightAt(v);
    let nextWeight: number;

    if (params.mode === "add") {
      nextWeight = currentWeight + strength * falloff * (1 - currentWeight);
    } else if (params.mode === "subtract") {
      nextWeight = currentWeight - strength * falloff;
    } else if (params.mode === "set") {
      nextWeight = lerp(currentWeight, targetWeight, strength * falloff);
    } else {
      const smoothGoal = smoothTargetByVertex ? smoothTargetByVertex[v]! : currentWeight;
      nextWeight = lerp(currentWeight, smoothGoal, strength * falloff);
    }

    writeVarco3dVertexSkinWeight({
      skinIndices: nextIndices,
      skinWeights: nextWeights,
      vertexIndex: v,
      boneIndex: params.boneIndex,
      targetWeight: clamp(nextWeight, 0, 1),
      boneCount: params.boneCount,
    });
  }

  const heatColorsRgb = new Float32Array(vertexCount * 3);
  for (let v = 0; v < vertexCount; v += 1) {
    const [r, g, b] = evaluateVarco3dWeightHeatRgb(selectedWeightAt(v));
    heatColorsRgb[v * 3] = r;
    heatColorsRgb[v * 3 + 1] = g;
    heatColorsRgb[v * 3 + 2] = b;
  }

  return {
    affectedVertices: affected,
    skinIndices: nextIndices,
    skinWeights: nextWeights,
    heatColorsRgb,
    gpuUpdateRanges4: coalesceVarco3dGpuUpdateRanges(affected, 4),
  };
}

/**
 * Reverse-engineered from VARCO 3D's `RigWeightControls` keyboard listener (`index-0_QlvNS9.js`).
 */
export function stepVarco3dWeightBrushSizeByKey(
  currentSizePx: number,
  key: string,
): number {
  if (key !== "[" && key !== "]") {
    return clamp(
      currentSizePx,
      STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.brushMinSizePx,
      STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.brushMaxSizePx,
    );
  }
  const delta =
    key === "]"
      ? STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.brushShortcutStepPx
      : -STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.brushShortcutStepPx;
  return clamp(
    currentSizePx + delta,
    STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.brushMinSizePx,
    STUDIO_VARCO3D_SKIN_WEIGHT_BRUSH_METRICS.brushMaxSizePx,
  );
}

/**
 * Reverse-engineered from VARCO 3D's `HIDDEN_BONE_PREFIX` & `displayBoneName` (`index-0_QlvNS9.js`).
 */
export function sanitizeVarco3dDisplayBoneName(rawBoneName: string): string {
  return rawBoneName.replace(HIDDEN_BONE_PREFIX_REGEX, "");
}

/**
 * Reverse-engineered from VARCO 3D's `rigCapabilities(task)` (`index-0_QlvNS9.js`).
 */
export function evaluateVarco3dRigCapabilities(task: {
  readonly type: string;
  readonly status: string;
  readonly humanoidClass?: "HUMANOID" | "NON_HUMANOID";
  readonly skeletonType?: string;
  readonly retargetProfileMatched?: boolean;
} | null): {
  readonly canEditRig: boolean;
  readonly animateBlockedReason: "non-humanoid" | "profile-mismatch" | null;
} {
  if (!task || task.status !== "COMPLETED") {
    return { canEditRig: false, animateBlockedReason: null };
  }
  const isRigged = (STUDIO_VARCO3D_RIGGED_TASK_TYPES as readonly string[]).includes(task.type);
  const isAnimatable = isRigged || task.type === "ANIMATE";
  if (!isAnimatable) {
    return { canEditRig: isRigged, animateBlockedReason: null };
  }
  const isNonHumanoid =
    task.humanoidClass === "NON_HUMANOID" || task.skeletonType === "ca";
  const isProfileMismatch = task.retargetProfileMatched === false;
  return {
    canEditRig: isRigged,
    animateBlockedReason: isNonHumanoid
      ? "non-humanoid"
      : isProfileMismatch
        ? "profile-mismatch"
        : null,
  };
}

// ============================================================================
// 3. Binary Rig Payload Packer (`buildRigPayload` from index-0_QlvNS9.js)
// ============================================================================

export interface StudioVarco3dBinaryRigJointSpec {
  readonly name: string;
  readonly parent: number | null;
  readonly translation: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number];
}

export interface StudioVarco3dBinaryRigSurfaceInput {
  readonly surfaceId: string;
  readonly vertexCount: number;
  readonly joints: Uint16Array;
  readonly weights: Float32Array;
}

export interface StudioVarco3dBinaryRigHeader {
  readonly joints: readonly StudioVarco3dBinaryRigJointSpec[];
  readonly inverseBind: {
    readonly offset: number;
    readonly length: number;
    readonly shape: readonly [number, 4, 4];
    readonly dtype: "float32";
  };
  readonly surfaceSkins: ReadonlyArray<{
    readonly surface: string;
    readonly joints: {
      readonly offset: number;
      readonly length: number;
      readonly shape: readonly [number, 4];
      readonly dtype: "uint16";
    };
    readonly weights: {
      readonly offset: number;
      readonly length: number;
      readonly shape: readonly [number, 4];
      readonly dtype: "float32";
    };
  }>;
}

/**
 * Reverse-engineered from VARCO 3D's `buildRigPayload` (`index-0_QlvNS9.js`).
 */
export function packVarco3dBinaryRigPayload(params: {
  readonly joints: readonly StudioVarco3dBinaryRigJointSpec[];
  readonly inverseBindMatricesRowMajor: Float32Array;
  readonly surfaces: readonly StudioVarco3dBinaryRigSurfaceInput[];
}): Uint8Array {
  if (params.surfaces.length === 0) {
    throw new Error("rig payload needs at least one skinned surface");
  }
  const binaryChunks: Uint8Array[] = [];
  let currentOffset = 0;

  const appendChunk = (
    typedArray: Uint16Array | Float32Array,
  ): { offset: number; length: number; dtype: "uint16" | "float32" } => {
    const view = new Uint8Array(
      typedArray.buffer,
      typedArray.byteOffset,
      typedArray.byteLength,
    );
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);
    const meta = {
      offset: currentOffset,
      length: copy.byteLength,
      dtype: (typedArray instanceof Uint16Array ? "uint16" : "float32") as
        | "uint16"
        | "float32",
    };
    binaryChunks.push(copy);
    currentOffset += copy.byteLength;
    return meta;
  };

  const inverseBindMeta = appendChunk(params.inverseBindMatricesRowMajor);
  const surfaceSkins = params.surfaces.map((surface) => {
    const normalizedWeights = new Float32Array(surface.vertexCount * 4);
    for (let v = 0; v < surface.vertexCount; v += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        const w = Math.max(0, surface.weights[v * 4 + k] ?? 0);
        normalizedWeights[v * 4 + k] = w;
        sum += w;
      }
      if (sum > 0 && sum !== 1) {
        for (let k = 0; k < 4; k += 1) {
          normalizedWeights[v * 4 + k] /= sum;
        }
      }
    }
    const jointsMeta = appendChunk(surface.joints);
    const weightsMeta = appendChunk(normalizedWeights);
    return {
      surface: surface.surfaceId,
      joints: {
        ...jointsMeta,
        shape: [surface.vertexCount, 4] as const,
        dtype: "uint16" as const,
      },
      weights: {
        ...weightsMeta,
        shape: [surface.vertexCount, 4] as const,
        dtype: "float32" as const,
      },
    };
  });

  const header: StudioVarco3dBinaryRigHeader = {
    joints: params.joints,
    inverseBind: {
      ...inverseBindMeta,
      shape: [params.joints.length, 4, 4] as const,
      dtype: "float32" as const,
    },
    surfaceSkins,
  };

  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const totalByteLength = 4 + headerBytes.byteLength + currentOffset;
  const output = new Uint8Array(totalByteLength);
  new DataView(output.buffer).setUint32(0, headerBytes.byteLength, true);
  output.set(headerBytes, 4);

  let writeCursor = 4 + headerBytes.byteLength;
  for (const chunk of binaryChunks) {
    output.set(chunk, writeCursor);
    writeCursor += chunk.byteLength;
  }
  return output;
}

/**
 * Unpacks a binary rig payload created by `packVarco3dBinaryRigPayload`.
 */
export function unpackVarco3dBinaryRigPayload(payload: Uint8Array): {
  readonly header: StudioVarco3dBinaryRigHeader;
  readonly binaryBodyByteLength: number;
} {
  if (payload.byteLength < 4) {
    throw new Error("Invalid binary rig payload: fewer than 4 bytes");
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const headerByteLength = view.getUint32(0, true);
  const headerSlice = payload.subarray(4, 4 + headerByteLength);
  const header = JSON.parse(
    new TextDecoder().decode(headerSlice),
  ) as StudioVarco3dBinaryRigHeader;
  return {
    header,
    binaryBodyByteLength: payload.byteLength - 4 - headerByteLength,
  };
}
