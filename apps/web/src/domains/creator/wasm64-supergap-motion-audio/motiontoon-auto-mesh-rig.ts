/**
 * #21 단일 컷 2D→2.5D 자동 메시 리깅 & MotionToon 60fps 애니메이터 (₩0 로컬 · 0 AI 토큰).
 *
 * 2D 컷 알파 실루엣 위에 인덱스 삼각화 메시와 2.5D 의사 깊이(Pseudo-Depth)를 생성하고,
 * 호흡 흉부 상승·머리카락 바람 흔들림·눈깜빡임 본 가중치·패럴랙스를 60fps 예산 내에서 평가한다.
 */

export type MotionToonBoneId =
  | "root"
  | "chest"
  | "head"
  | "hair-left"
  | "hair-right"
  | "hair-back"
  | "eye-left"
  | "eye-right"
  | "shoulder-left"
  | "shoulder-right";

export const MOTIONTOON_BONE_IDS: readonly MotionToonBoneId[] = [
  "root",
  "chest",
  "head",
  "hair-left",
  "hair-right",
  "hair-back",
  "eye-left",
  "eye-right",
  "shoulder-left",
  "shoulder-right",
];

export interface BoneLandmarkOverride {
  readonly x: number;
  readonly y: number;
  readonly radiusPx?: number;
}

export interface CutSilhouetteInput {
  readonly width: number;
  readonly height: number;
  readonly alphaMask?: Uint8Array;
  readonly rgba?: Uint8Array | Uint8ClampedArray;
  readonly alphaThreshold?: number;
  readonly landmarks?: Readonly<Partial<Record<MotionToonBoneId, BoneLandmarkOverride>>>;
}

export interface MotionToonRigOptions {
  readonly gridCols?: number;
  readonly gridRows?: number;
  readonly boundarySnapSteps?: number;
}

export interface MotionToonBone {
  readonly index: number;
  readonly id: MotionToonBoneId;
  readonly parentIndex: number;
  readonly restX: number;
  readonly restY: number;
  readonly influenceRadiusPx: number;
}

export interface MotionToonRigMesh {
  readonly width: number;
  readonly height: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly silhouetteCoverage: number;
  readonly bounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
  readonly restPositions: Float32Array;
  readonly restDepths: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
  readonly boneIndices: Uint8Array;
  readonly boneWeights: Float32Array;
  readonly bones: readonly MotionToonBone[];
}

export interface MotionToonAnimParams {
  readonly breathHz?: number;
  readonly breathAmplitudePx?: number;
  readonly windStrength?: number;
  readonly windFrequencyHz?: number;
  readonly windDirection?: number;
  readonly blinkIntervalSec?: number;
  readonly blinkDurationSec?: number;
  readonly forceBlinkWeight?: number;
  readonly parallaxX?: number;
  readonly parallaxY?: number;
  readonly parallaxScalePx?: number;
}

export interface MotionToonBoneTransform {
  readonly id: MotionToonBoneId;
  readonly dx: number;
  readonly dy: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface MotionToonEvaluatedFrame {
  readonly timeSec: number;
  readonly deformedPositions: Float32Array;
  readonly deformedDepths: Float32Array;
  readonly boneTransforms: readonly MotionToonBoneTransform[];
  readonly breathingPhase: number;
  readonly blinkWeight: number;
  readonly hairSwayOffsetPx: number;
  readonly elapsedMs: number;
}

function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function sampleAlpha(input: CutSilhouetteInput, x: number, y: number): number {
  const ix = clamp(Math.round(x), 0, input.width - 1);
  const iy = clamp(Math.round(y), 0, input.height - 1);
  const idx = iy * input.width + ix;
  if (input.alphaMask) return input.alphaMask[idx] ?? 0;
  if (input.rgba) return input.rgba[idx * 4 + 3] ?? 0;
  return 255;
}

function estimateNormalizedInteriorDepth(
  input: CutSilhouetteInput,
  x: number,
  y: number,
  threshold: number,
  maxRayPx: number,
): number {
  const dirs: readonly (readonly [number, number])[] = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707],
  ];
  let minEdgeDist = maxRayPx;
  const step = Math.max(1, maxRayPx / 12);

  for (let d = 0; d < dirs.length; d += 1) {
    const dx = dirs[d][0];
    const dy = dirs[d][1];
    for (let dist = step; dist <= maxRayPx; dist += step) {
      const sx = x + dx * dist;
      const sy = y + dy * dist;
      if (
        sx < 0 || sy < 0 || sx >= input.width || sy >= input.height ||
        sampleAlpha(input, sx, sy) < threshold
      ) {
        if (dist < minEdgeDist) minEdgeDist = dist;
        break;
      }
    }
  }

  const ratio = clamp(minEdgeDist / Math.max(1, maxRayPx), 0, 1);
  return Math.sqrt(Math.max(0, 1 - (1 - ratio) * (1 - ratio)));
}

function buildAutoBones(
  bounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number },
  overrides?: Readonly<Partial<Record<MotionToonBoneId, BoneLandmarkOverride>>>,
): readonly MotionToonBone[] {
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const cx = bounds.minX + bw * 0.5;
  const diag = Math.hypot(bw, bh);

  const defaults: ReadonlyArray<{
    readonly id: MotionToonBoneId;
    readonly parent: number;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
  }> = [
    { id: "root", parent: -1, x: cx, y: bounds.minY + bh * 0.86, radius: diag * 0.34 },
    { id: "chest", parent: 0, x: cx, y: bounds.minY + bh * 0.56, radius: diag * 0.28 },
    { id: "head", parent: 1, x: cx, y: bounds.minY + bh * 0.24, radius: diag * 0.22 },
    { id: "hair-left", parent: 2, x: cx - bw * 0.3, y: bounds.minY + bh * 0.33, radius: diag * 0.19 },
    { id: "hair-right", parent: 2, x: cx + bw * 0.3, y: bounds.minY + bh * 0.33, radius: diag * 0.19 },
    { id: "hair-back", parent: 2, x: cx, y: bounds.minY + bh * 0.38, radius: diag * 0.23 },
    { id: "eye-left", parent: 2, x: cx - bw * 0.14, y: bounds.minY + bh * 0.24, radius: Math.max(6, bw * 0.13) },
    { id: "eye-right", parent: 2, x: cx + bw * 0.14, y: bounds.minY + bh * 0.24, radius: Math.max(6, bw * 0.13) },
    { id: "shoulder-left", parent: 1, x: cx - bw * 0.28, y: bounds.minY + bh * 0.48, radius: diag * 0.2 },
    { id: "shoulder-right", parent: 1, x: cx + bw * 0.28, y: bounds.minY + bh * 0.48, radius: diag * 0.2 },
  ];

  return defaults.map((def, i) => {
    const ov = overrides ? overrides[def.id] : undefined;
    return {
      index: i,
      id: def.id,
      parentIndex: def.parent,
      restX: ov ? ov.x : def.x,
      restY: ov ? ov.y : def.y,
      influenceRadiusPx: Math.max(4, ov?.radiusPx ?? def.radius),
    };
  });
}

/**
 * #21 단일 2D 컷 실루엣에서 인덱스 삼각화 2.5D 메시와 호흡·머리카락·눈깜빡임 스키닝 가중치를 생성한다.
 */
export function rigCutToMotionToonMesh(
  silhouette: CutSilhouetteInput,
  options: MotionToonRigOptions = {},
): MotionToonRigMesh {
  const width = Math.max(2, Math.floor(silhouette.width));
  const height = Math.max(2, Math.floor(silhouette.height));
  const threshold = silhouette.alphaThreshold ?? 16;
  const cols = clamp(Math.floor(options.gridCols ?? 16), 4, 48);
  const rows = clamp(Math.floor(options.gridRows ?? 20), 4, 64);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let fgPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (sampleAlpha(silhouette, x, y) >= threshold) {
        fgPixels += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const silhouetteCoverage = fgPixels / (width * height);
  if (maxX < minX || maxY < minY) {
    minX = 0;
    minY = 0;
    maxX = width - 1;
    maxY = height - 1;
  }

  const bounds = { minX, minY, maxX, maxY };
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const bones = buildAutoBones(bounds, silhouette.landmarks);

  const activeCells = new Uint8Array(cols * rows);
  let activeCellCount = 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x0 = minX + (c / cols) * bw;
      const x1 = minX + ((c + 1) / cols) * bw;
      const y0 = minY + (r / rows) * bh;
      const y1 = minY + ((r + 1) / rows) * bh;
      if (
        sampleAlpha(silhouette, (x0 + x1) * 0.5, (y0 + y1) * 0.5) >= threshold ||
        sampleAlpha(silhouette, x0, y0) >= threshold ||
        sampleAlpha(silhouette, x1, y0) >= threshold ||
        sampleAlpha(silhouette, x0, y1) >= threshold ||
        sampleAlpha(silhouette, x1, y1) >= threshold
      ) {
        activeCells[r * cols + c] = 1;
        activeCellCount += 1;
      }
    }
  }
  if (activeCellCount === 0) activeCells.fill(1);

  const gridVertStride = cols + 1;
  const gridToMeshVert = new Int32Array((cols + 1) * (rows + 1));
  gridToMeshVert.fill(-1);

  const posList: number[] = [];
  const uvList: number[] = [];
  const depthList: number[] = [];
  const maxRayPx = Math.max(8, Math.min(bw, bh) * 0.35);

  const ensureVertex = (gc: number, gr: number): number => {
    const key = gr * gridVertStride + gc;
    const existing = gridToMeshVert[key];
    if (existing >= 0) return existing;

    let vx = minX + (gc / cols) * bw;
    let vy = minY + (gr / rows) * bh;
    if (sampleAlpha(silhouette, vx, vy) < threshold && fgPixels > 0) {
      const cx = (minX + maxX) * 0.5;
      const cy = (minY + maxY) * 0.5;
      const snapSteps = clamp(options.boundarySnapSteps ?? 4, 1, 8);
      for (let s = 1; s <= snapSteps; s += 1) {
        const pull = (s / snapSteps) * 0.12;
        const tx = vx + (cx - vx) * pull;
        const ty = vy + (cy - vy) * pull;
        if (sampleAlpha(silhouette, tx, ty) >= threshold) {
          vx = tx;
          vy = ty;
          break;
        }
      }
    }

    const vertIndex = posList.length / 2;
    gridToMeshVert[key] = vertIndex;
    posList.push(vx, vy);
    uvList.push(vx / Math.max(1, width - 1), vy / Math.max(1, height - 1));

    const domeDepth = estimateNormalizedInteriorDepth(silhouette, vx, vy, threshold, maxRayPx);
    const headBone = bones[2];
    const headDist = Math.hypot(vx - headBone.restX, vy - headBone.restY);
    const faceBias =
      Math.exp(-(headDist * headDist) / (2 * headBone.influenceRadiusPx * headBone.influenceRadiusPx)) * 0.15;
    depthList.push(clamp(0.15 + domeDepth * 0.72 + faceBias, 0.05, 1.0));
    return vertIndex;
  };

  const triIndices: number[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (activeCells[r * cols + c] === 0) continue;
      const v00 = ensureVertex(c, r);
      const v10 = ensureVertex(c + 1, r);
      const v01 = ensureVertex(c, r + 1);
      const v11 = ensureVertex(c + 1, r + 1);
      triIndices.push(v00, v10, v11, v00, v11, v01);
    }
  }

  const vertexCount = posList.length / 2;
  const restPositions = new Float32Array(posList);
  const restDepths = new Float32Array(depthList);
  const uvs = new Float32Array(uvList);
  const indices = new Uint32Array(triIndices);
  const boneIndices = new Uint8Array(vertexCount * 4);
  const boneWeights = new Float32Array(vertexCount * 4);

  const rawWeights = new Float32Array(bones.length);
  const headY = bones[2].restY;

  for (let v = 0; v < vertexCount; v += 1) {
    const vx = restPositions[v * 2];
    const vy = restPositions[v * 2 + 1];

    for (let b = 0; b < bones.length; b += 1) {
      const bone = bones[b];
      const dx = vx - bone.restX;
      const dy = vy - bone.restY;
      const distSq = dx * dx + dy * dy;
      const r = bone.influenceRadiusPx;
      let w = Math.exp(-distSq / (2 * r * r));

      if (bone.id === "eye-left" || bone.id === "eye-right") {
        w = distSq > r * r * 1.44 ? 0 : w * 2.4;
      } else if (bone.id === "hair-left" || bone.id === "hair-right" || bone.id === "hair-back") {
        if (vy < headY - bh * 0.2) w *= 0.25;
      }
      rawWeights[b] = w;
    }

    const topIdx = [0, 0, 0, 0];
    const topVal = [-1, -1, -1, -1];
    for (let b = 0; b < bones.length; b += 1) {
      const w = rawWeights[b];
      for (let slot = 0; slot < 4; slot += 1) {
        if (w > topVal[slot]) {
          for (let shift = 3; shift > slot; shift -= 1) {
            topVal[shift] = topVal[shift - 1];
            topIdx[shift] = topIdx[shift - 1];
          }
          topVal[slot] = w;
          topIdx[slot] = b;
          break;
        }
      }
    }

    let sum = 0;
    for (let slot = 0; slot < 4; slot += 1) {
      if (topVal[slot] > 1e-6) sum += topVal[slot];
      else topVal[slot] = 0;
    }

    const base = v * 4;
    if (sum <= 1e-6) {
      boneIndices[base] = 0;
      boneWeights[base] = 1;
    } else {
      for (let slot = 0; slot < 4; slot += 1) {
        boneIndices[base + slot] = topIdx[slot];
        boneWeights[base + slot] = topVal[slot] / sum;
      }
    }
  }

  return {
    width,
    height,
    vertexCount,
    triangleCount: indices.length / 3,
    silhouetteCoverage: Number(silhouetteCoverage.toFixed(4)),
    bounds,
    restPositions,
    restDepths,
    uvs,
    indices,
    boneIndices,
    boneWeights,
    bones,
  };
}

function computeNaturalBlinkWeight(timeSec: number, intervalSec: number, durationSec: number): number {
  const safeInterval = Math.max(0.4, intervalSec);
  const safeDuration = clamp(durationSec, 0.06, safeInterval * 0.5);
  const localT = ((timeSec % safeInterval) + safeInterval) % safeInterval;
  if (localT >= safeDuration) return 0;

  const u = localT / safeDuration;
  if (u < 0.42) {
    const p = u / 0.42;
    return p * p * (3 - 2 * p);
  }
  const p = (u - 0.42) / 0.58;
  return 1 - p * p * (3 - 2 * p);
}

/**
 * #21 MotionToon 60fps 프레임 평가기: 호흡 흉부 상승, 머리카락 바람 흔들림, 눈깜빡임·2.5D 패럴랙스를 적용한다.
 */
export function evaluateMotionToonFrame(
  rig: MotionToonRigMesh,
  timeSec: number,
  params: MotionToonAnimParams = {},
  outPositions?: Float32Array,
): MotionToonEvaluatedFrame {
  const startMs = performance.now();
  const breathHz = params.breathHz ?? 0.28;
  const breathAmp = params.breathAmplitudePx ?? Math.max(2, (rig.bounds.maxY - rig.bounds.minY) * 0.018);
  const windStrength = params.windStrength ?? 1.0;
  const windFreq = params.windFrequencyHz ?? 0.95;
  const windDir = params.windDirection ?? 1.0;
  const parallaxX = clamp(params.parallaxX ?? 0, -1, 1);
  const parallaxY = clamp(params.parallaxY ?? 0, -1, 1);
  const parallaxScalePx = params.parallaxScalePx ?? 10;

  const breathingPhase = Math.pow(0.5 - 0.5 * Math.cos(2 * Math.PI * breathHz * timeSec), 1.3);
  const chestLiftY = -breathingPhase * breathAmp;
  const gust = 0.72 + 0.28 * Math.sin(timeSec * 0.75 * Math.PI);
  const hairBaseAmp = Math.max(1.5, (rig.bounds.maxX - rig.bounds.minX) * 0.025) * windStrength * gust;
  const omegaWind = 2 * Math.PI * windFreq;
  const hairLeftDx = Math.sin(omegaWind * timeSec + 0.35) * hairBaseAmp * windDir;
  const hairRightDx = Math.sin(omegaWind * timeSec + 1.1) * hairBaseAmp * windDir;
  const hairBackDx = Math.sin(omegaWind * timeSec + 1.95) * hairBaseAmp * 0.85 * windDir;

  const blinkWeight =
    params.forceBlinkWeight !== undefined
      ? clamp(params.forceBlinkWeight, 0, 1)
      : computeNaturalBlinkWeight(timeSec, params.blinkIntervalSec ?? 3.6, params.blinkDurationSec ?? 0.16);

  const boneDx = new Float32Array(rig.bones.length);
  const boneDy = new Float32Array(rig.bones.length);
  const boneSx = new Float32Array(rig.bones.length);
  const boneSy = new Float32Array(rig.bones.length);
  boneSx.fill(1);
  boneSy.fill(1);

  boneDy[1] = chestLiftY;
  boneSx[1] = 1 + breathingPhase * 0.02;
  boneSy[1] = 1 + breathingPhase * 0.012;
  boneDy[2] = chestLiftY * 0.25;
  boneDx[2] = Math.sin(timeSec * 0.65) * 0.8;
  boneDx[3] = hairLeftDx;
  boneDy[3] = chestLiftY * 0.2 + Math.abs(hairLeftDx) * 0.12;
  boneDx[4] = hairRightDx;
  boneDy[4] = chestLiftY * 0.2 + Math.abs(hairRightDx) * 0.12;
  boneDx[5] = hairBackDx;
  boneDy[5] = chestLiftY * 0.18;
  boneDx[6] = boneDx[2];
  boneDy[6] = boneDy[2];
  boneSy[6] = 1 - blinkWeight * 0.92;
  boneDx[7] = boneDx[2];
  boneDy[7] = boneDy[2];
  boneSy[7] = 1 - blinkWeight * 0.92;
  boneDy[8] = chestLiftY * 0.58;
  boneDy[9] = chestLiftY * 0.58;

  const deformedPositions =
    outPositions && outPositions.length === rig.restPositions.length
      ? outPositions
      : new Float32Array(rig.restPositions.length);
  const deformedDepths = new Float32Array(rig.restDepths.length);
  const headRestY = rig.bones[2].restY;
  const bh = Math.max(1, rig.bounds.maxY - rig.bounds.minY);

  for (let v = 0; v < rig.vertexCount; v += 1) {
    const rx = rig.restPositions[v * 2];
    const ry = rig.restPositions[v * 2 + 1];
    const base = v * 4;
    let outX = 0;
    let outY = 0;

    for (let slot = 0; slot < 4; slot += 1) {
      const w = rig.boneWeights[base + slot];
      if (w <= 0) continue;
      const bIdx = rig.boneIndices[base + slot];
      const bone = rig.bones[bIdx];
      let localX = bone.restX + (rx - bone.restX) * boneSx[bIdx] + boneDx[bIdx];
      const localY = bone.restY + (ry - bone.restY) * boneSy[bIdx] + boneDy[bIdx];

      if (bIdx === 3 || bIdx === 4 || bIdx === 5) {
        const strandDrop = clamp((ry - headRestY) / (bh * 0.5), 0, 1.5);
        localX += Math.sin(omegaWind * timeSec - strandDrop * 1.4) * hairBaseAmp * 0.35 * strandDrop * windDir;
      }
      outX += localX * w;
      outY += localY * w;
    }

    const depth = rig.restDepths[v];
    const depthOffset = depth - 0.35;
    deformedPositions[v * 2] = outX + parallaxX * depthOffset * parallaxScalePx;
    deformedPositions[v * 2 + 1] = outY + parallaxY * depthOffset * parallaxScalePx;
    deformedDepths[v] = clamp(depth + breathingPhase * 0.025, 0, 1);
  }

  const boneTransforms: MotionToonBoneTransform[] = rig.bones.map((bone, i) => ({
    id: bone.id,
    dx: Number(boneDx[i].toFixed(3)),
    dy: Number(boneDy[i].toFixed(3)),
    scaleX: Number(boneSx[i].toFixed(4)),
    scaleY: Number(boneSy[i].toFixed(4)),
  }));

  return {
    timeSec,
    deformedPositions,
    deformedDepths,
    boneTransforms,
    breathingPhase: Number(breathingPhase.toFixed(4)),
    blinkWeight: Number(blinkWeight.toFixed(4)),
    hairSwayOffsetPx: Number(((hairLeftDx + hairRightDx) * 0.5).toFixed(3)),
    elapsedMs: Number((performance.now() - startMs).toFixed(3)),
  };
}
