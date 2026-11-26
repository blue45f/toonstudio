/**
 * Wave 38D — WebGPU 인스턴싱 + 8종 원근 소실점 절차적 대규모 군중 생성 엔진.
 *
 * - 결정론적 CPU 공간 해시 Poisson-disk 비겹침 배치 (20 ~ 2,000명).
 * - 깊이(Z) 기반 핀홀 원근 스케일링, 원거리 대기 원근 페이드, 근경 G펜 굵은 잉크 → 원경 얇은 실루엣 감쇄.
 * - 주인공 포컬 포인트(x, y)를 향한 자동 시선·몸 방향 정렬.
 * - WebGPU `drawIndexedIndirect` 64B 정렬 인스턴스 버퍼(`Float32Array`) + 20B 간접 드로우 인수 버퍼 패킹.
 */

import {
  CROWD_CAMERA_UNIFORM_BYTES,
  CROWD_INDIRECT_ARGS_BYTES,
  CROWD_INSTANCE_STRIDE_BYTES,
  CROWD_MAX_COUNT,
  CROWD_MIN_COUNT,
  clampNumber,
  getCrowdPresetById,
  mixOklch,
  type CrowdAgentInstance,
  type CrowdDrawCallMetrics,
  type CrowdFacingDirection,
  type CrowdGenerationOptions,
  type CrowdPresetSpec,
  type CrowdSceneResult,
  type ResolvedCrowdGenerationOptions,
} from "./crowd-presets-and-wgsl";
import { packCrowdInstanceBuffers } from "./crowd-gpu-buffer-contract";

export {
  CROWD_BASE_SILHOUETTE_INDEX_COUNT,
  CROWD_CAMERA_UNIFORM_BYTES,
  CROWD_INDIRECT_ARGS_BYTES,
  CROWD_INSTANCING_WGSL,
  CROWD_INSTANCE_STRIDE_BYTES,
  CROWD_INSTANCE_STRIDE_FLOATS,
  CROWD_MAX_COUNT,
  CROWD_MIN_COUNT,
  CROWD_PANEL_MAX_COUNT,
  CROWD_PRESETS,
  DEFAULT_CROWD_PRESET,
  formatOklch,
  getCrowdPresetById,
  mixOklch,
  oklchToSrgbBytes,
  validateCrowdWgslShader,
  type CrowdAgentInstance,
  type CrowdDrawCallMetrics,
  type CrowdFacingDirection,
  type CrowdGenerationOptions,
  type CrowdInstanceBufferPack,
  type CrowdPresetId,
  type CrowdPresetSpec,
  type CrowdSceneMetrics,
  type CrowdSceneResult,
  type CrowdSilhouetteProp,
  type CrowdSpatialLayout,
  type OklchColor,
  type ResolvedCrowdGenerationOptions,
  type WgslShaderValidationReport,
} from "./crowd-presets-and-wgsl";

export {
  renderCrowdPreviewCanvas,
  renderCrowdRgbaPreview,
  renderCrowdSvgLayer,
  type CrowdCanvasPreviewOptions,
  type CrowdRgbaPreviewBuffer,
  type CrowdSvgLayerResult,
  type CrowdSvgRenderOptions,
} from "./crowd-renderers";

export {
  CROWD_GPU_BIND_GROUP_LAYOUTS,
  encodeCrowdDrawIndexedIndirect, packCrowdInstanceBuffers, resetCrowdIndirectFrame,
  type CrowdIndirectDrawSubmission,
} from "./crowd-gpu-buffer-contract";

const DEFAULT_CANVAS_WIDTH = 960;
const DEFAULT_CANVAS_HEIGHT = 540;
const DEFAULT_SEED = 20260384;
const DEFAULT_NEAR_STROKE_PX = 3.2;
const DEFAULT_FAR_STROKE_PX = 0.45;
const DEFAULT_MAX_ATMOSPHERIC_FADE = 0.78;
const FOCAL_LENGTH_WIDTH_RATIO = 0.82;
const SUBMESHES_PER_NAIVE_CHARACTER = 3;
const ESTIMATED_MINUTES_PER_EXTRA_INK = 1.15;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * 결정론적 32비트 Mulberry32 난수 생성기(동일 시드·옵션 → 항상 비트 단위 동일 배치).
 */
export function createDeterministicRng(seed: number): () => number {
  let state = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeAngleDiff(delta: number): number {
  let d = delta;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function classifyFacingDirection(yawRad: number): CrowdFacingDirection {
  const absYaw = Math.abs(yawRad);
  if (absYaw <= 0.34) return "front";
  if (absYaw >= Math.PI * 0.76) return "back";
  return yawRad < 0 ? "left" : "right";
}

export function resolveCrowdGenerationOptions(
  options: CrowdGenerationOptions = {},
): ResolvedCrowdGenerationOptions {
  const preset = getCrowdPresetById(options.presetId);
  const count = Math.round(
    clampNumber(options.count ?? preset.defaultCount, CROWD_MIN_COUNT, CROWD_MAX_COUNT),
  );
  const seed = Number.isFinite(options.seed) ? Math.floor(options.seed as number) : DEFAULT_SEED;
  const canvasWidth = Math.round(clampNumber(options.canvasWidth ?? DEFAULT_CANVAS_WIDTH, 240, 4096));
  const canvasHeight = Math.round(
    clampNumber(options.canvasHeight ?? DEFAULT_CANVAS_HEIGHT, 160, 4096),
  );
  const horizonRatio = clampNumber(options.horizonRatio ?? preset.defaultHorizonRatio, 0.15, 0.72);
  const vanishingX = clampNumber(options.vanishingX ?? preset.defaultVanishingX, 0.15, 0.85);
  const focalPointX = clampNumber(options.focalPointX ?? preset.defaultFocalX, 0.05, 0.95);
  const focalPointY = clampNumber(options.focalPointY ?? preset.defaultFocalY, 0.15, 0.95);
  const focalAttention = clampNumber(
    options.focalAttention ?? preset.defaultFocalAttention,
    0,
    1,
  );
  const strokeAttenuation = clampNumber(
    options.strokeAttenuation ?? preset.defaultStrokeAttenuation,
    0,
    1,
  );
  const nearStrokeWidthPx = clampNumber(
    options.nearStrokeWidthPx ?? DEFAULT_NEAR_STROKE_PX,
    0.8,
    8,
  );
  const farStrokeWidthPx = clampNumber(
    options.farStrokeWidthPx ?? DEFAULT_FAR_STROKE_PX,
    0.2,
    nearStrokeWidthPx,
  );
  const maxAtmosphericFade = clampNumber(
    options.maxAtmosphericFade ?? DEFAULT_MAX_ATMOSPHERIC_FADE,
    0.1,
    0.92,
  );

  return {
    presetId: preset.id,
    count,
    seed,
    canvasWidth,
    canvasHeight,
    horizonRatio,
    vanishingX,
    focalPointX,
    focalPointY,
    focalAttention,
    strokeAttenuation,
    nearStrokeWidthPx,
    farStrokeWidthPx,
    maxAtmosphericFade,
  };
}

interface PlacedGroundPoint {
  readonly placedCount: number;
  readonly worldX: Float32Array;
  readonly worldZ: Float32Array;
  readonly minSpacingM: number;
  readonly overlapViolations: number;
  readonly minObservedWorldSpacingM: number;
}

/**
 * 평탄 타입 배열 공간 해시 기반 고속 Poisson-disk 비겹침 원근 배치기.
 * - 객체 할당을 배제해 2,000명 규모도 `< 5ms` 안에 배치하고 3×3 이웃 검사로 겹침 0건을 보장한다.
 */
function samplePerspectivePoissonPositions(
  preset: CrowdPresetSpec,
  resolved: ResolvedCrowdGenerationOptions,
  rng: () => number,
): PlacedGroundPoint {
  const { count, canvasWidth, vanishingX } = resolved;
  const nearM = preset.nearDistanceM;
  const farM = preset.farDistanceM;
  const depthSpan = Math.max(1, farM - nearM);
  const focalPx = canvasWidth * FOCAL_LENGTH_WIDTH_RATIO;
  const vpX = canvasWidth * vanishingX;

  const leftSlope = ((vpX - canvasWidth * 0.04) / focalPx) * preset.corridorHalfWidthRatio;
  const rightSlope = ((canvasWidth * 0.96 - vpX) / focalPx) * preset.corridorHalfWidthRatio;
  const widthSlope = leftSlope + rightSlope;

  // 실제 사다리꼴 바닥 면적에서 겹침 없이 목표 인원을 수용할 수 있는 최소 반경 산출
  const trapezoidAreaM2 = 0.5 * (nearM + farM) * widthSlope * depthSpan;
  const packingBoundRadius = Math.sqrt((trapezoidAreaM2 * 0.36) / (count * Math.PI));
  const minSpacingM = Math.max(0.14, Math.min(preset.minSpacingM, packingBoundRadius));
  const minSpacingSq = minSpacingM * minSpacingM;

  const minWorldX = -leftSlope * farM - minSpacingM;
  const maxWorldX = rightSlope * farM + minSpacingM;
  const cellSize = minSpacingM;
  const gridCols = Math.max(4, Math.ceil((maxWorldX - minWorldX) / cellSize) + 2);
  const gridRows = Math.max(4, Math.ceil(depthSpan / cellSize) + 2);

  // 빈 테두리 한 칸을 두어 가장자리에서도 같은 3×3 이웃을 검사한다.
  const gridStride = gridCols + 2;
  const cellHead = new Int32Array(gridStride * (gridRows + 2));
  cellHead.fill(-1);
  const nextNode = new Int32Array(count);
  nextNode.fill(-1);
  const placedX = new Float32Array(count);
  const placedZ = new Float32Array(count);
  let placed = 0;

  const invCellSize = 1 / cellSize;
  const rowsFormation = Math.max(5, Math.round(Math.sqrt(count * 1.35)));
  const colsFormation = Math.max(4, Math.ceil(count / rowsFormation));
  const stadiumTiers = Math.max(6, Math.min(Math.floor(depthSpan / (minSpacingM * 1.15)), Math.round(Math.sqrt(count * 0.85))));

  let candX = 0;
  let candZ = 0;

  const tryPlacePoint = (wx: number, wz: number): boolean => {
    const gx = Math.floor((wx - minWorldX) * invCellSize);
    const gz = Math.floor((wz - nearM) * invCellSize);
    if (gx < 0 || gx >= gridCols || gz < 0 || gz >= gridRows) return false;

    const cellIdx = (gz + 1) * gridStride + gx + 1;
    for (let row = cellIdx - gridStride; row <= cellIdx + gridStride; row += gridStride) {
      for (let cell = row - 1; cell <= row + 1; cell += 1) {
        let idx = cellHead[cell] ?? -1;
        while (idx !== -1) {
          const dx = wx - (placedX[idx] ?? 0);
          const dz = wz - (placedZ[idx] ?? 0);
          if (dx * dx + dz * dz < minSpacingSq) {
            return false;
          }
          idx = nextNode[idx] ?? -1;
        }
      }
    }

    const id = placed;
    placedX[id] = wx;
    placedZ[id] = wz;
    nextNode[id] = cellHead[cellIdx] ?? -1;
    cellHead[cellIdx] = id;
    placed += 1;
    return true;
  };

  const pickCandidate = (indexHint: number): void => {
    if (preset.layout === "formation-ranks") {
      const row = Math.floor(indexHint / colsFormation) % rowsFormation;
      const col = indexHint % colsFormation;
      const rawT = (row + 0.35 + (rng() - 0.5) * 0.24) / rowsFormation;
      const depthT = clampNumber(Math.sqrt(clampNumber(rawT, 0.001, 1)), 0.02, 0.99);
      candZ = nearM + depthT * depthSpan;
      const minX = -leftSlope * candZ;
      const maxX = rightSlope * candZ;
      const colFrac = (col + 0.5 + (rng() - 0.5) * 0.22) / colsFormation;
      candX = minX + colFrac * (maxX - minX);
      return;
    }

    if (preset.layout === "tiered-stadium") {
      const tier = Math.min(stadiumTiers - 1, Math.floor(Math.sqrt(rng()) * stadiumTiers));
      const depthT = clampNumber((tier + 0.2 + rng() * 0.55) / stadiumTiers, 0.02, 0.992);
      candZ = nearM + depthT * depthSpan;
      const minX = -leftSlope * candZ;
      const maxX = rightSlope * candZ;
      candX = minX + rng() * (maxX - minX);
      return;
    }

    const depthT = clampNumber(Math.sqrt(rng()) * 0.96 + 0.02, 0.015, 0.995);
    candZ = nearM + depthT * depthSpan;
    const minX = -leftSlope * candZ;
    const maxX = rightSlope * candZ;
    let u = rng();

    if (preset.layout === "narrow-alley") {
      u = 0.12 + 0.76 * (0.5 * (u + rng()));
    } else if (preset.layout === "terrace-tables") {
      u = u < 0.58 ? 0.08 + rng() * 0.44 : 0.58 + rng() * 0.36;
    } else if (preset.layout === "crosswalk-lanes") {
      const band = Math.floor(rng() * 5);
      u = clampNumber((band + 0.1 + rng() * 0.8) / 5, 0.02, 0.98);
    } else if (preset.layout === "corridor-clusters") {
      const groupCenter = 0.12 + 0.76 * ((indexHint * 0.381966) % 1);
      u = clampNumber(groupCenter + (rng() - 0.5) * 0.28, 0.03, 0.97);
    }

    candX = minX + u * (maxX - minX);
  };

  // 1차 고속 다트 스로잉(제로 튜플 할당)
  const maxAttemptsPerAgent = 12;
  for (let i = 0; i < count; i += 1) {
    let accepted = false;
    for (let attempt = 0; attempt < maxAttemptsPerAgent; attempt += 1) {
      pickCandidate(i + attempt * 7);
      if (tryPlacePoint(candX, candZ)) {
        accepted = true;
        break;
      }
    }
    if (!accepted) {
      for (let retry = 0; retry < 10; retry += 1) {
        const depthT = clampNumber(Math.sqrt(rng()), 0.02, 0.995);
        const wz = nearM + depthT * depthSpan;
        const minX = -leftSlope * wz;
        const maxX = rightSlope * wz;
        if (tryPlacePoint(minX + rng() * (maxX - minX), wz)) {
          break;
        }
      }
    }
  }

  // 3차 확정 보충(고밀도 2,000명에서 누락분 발생 시 격자 스캔으로 겹침 0건 유지하며 채움)
  if (placed < count) {
    const stepZ = minSpacingM * 1.04;
    const stepX = minSpacingM * 1.04;
    for (let wz = nearM + stepZ * 0.5; wz < farM && placed < count; wz += stepZ) {
      const minX = -leftSlope * wz + stepX * 0.3;
      const maxX = rightSlope * wz - stepX * 0.3;
      for (let wx = minX; wx <= maxX && placed < count; wx += stepX) {
        tryPlacePoint(wx, wz);
      }
    }
  }

  // O(N) 공간 해시 비겹침 감사
  let overlapViolations = 0;
  let minObservedSq = Number.POSITIVE_INFINITY;
  const auditTolSq = minSpacingSq * 0.985;

  for (let i = 0; i < placed; i += 1) {
    const wx = placedX[i] ?? 0;
    const wz = placedZ[i] ?? 0;
    // 배치 후보의 좌표 대신 저장된 Float32 좌표에서 감사 셀을 계산한다.
    const gx = Math.floor((wx - minWorldX) / cellSize);
    const gz = Math.floor((wz - nearM) / cellSize);
    const cellIdx = (gz + 1) * gridStride + gx + 1;

    for (let row = cellIdx - gridStride; row <= cellIdx + gridStride; row += gridStride) {
      for (let cell = row - 1; cell <= row + 1; cell += 1) {
        let j = cellHead[cell] ?? -1;
        // 셀 인덱스는 삽입 역순이므로 앞에서 검사한 점에 도달하면 탐색을 끝낸다.
        while (j > i) {
          const dx = wx - (placedX[j] ?? 0);
          const dz = wz - (placedZ[j] ?? 0);
          const dSq = dx * dx + dz * dz;
          if (dSq < minObservedSq) minObservedSq = dSq;
          if (dSq < auditTolSq) overlapViolations += 1;
          j = nextNode[j] ?? -1;
        }
      }
    }
  }

  return {
    placedCount: placed,
    worldX: placedX,
    worldZ: placedZ,
    minSpacingM,
    overlapViolations,
    minObservedWorldSpacingM: Number.isFinite(minObservedSq) ? Math.sqrt(minObservedSq) : minSpacingM,
  };
}

function sortIndicesByDepthDesc(
  order: Int32Array,
  worldZ: Float32Array,
  worldX: Float32Array,
): void {
  const n = order.length;
  if (n <= 1) return;
  const stack = new Int32Array(64);
  let sp = 0;
  stack[sp++] = 0;
  stack[sp++] = n - 1;

  while (sp > 0) {
    const hi = stack[--sp] ?? 0;
    const lo = stack[--sp] ?? 0;
    if (hi - lo <= 16) {
      for (let i = lo + 1; i <= hi; i += 1) {
        const key = order[i] ?? 0;
        const kz = worldZ[key] ?? 0;
        const kx = worldX[key] ?? 0;
        let j = i - 1;
        while (j >= lo) {
          const cur = order[j] ?? 0;
          const cz = worldZ[cur] ?? 0;
          if (cz > kz || (cz === kz && (worldX[cur] ?? 0) <= kx)) break;
          order[j + 1] = cur;
          j -= 1;
        }
        order[j + 1] = key;
      }
      continue;
    }

    const mid = (lo + hi) >> 1;
    const pivotIdx = order[mid] ?? 0;
    const pz = worldZ[pivotIdx] ?? 0;
    const px = worldX[pivotIdx] ?? 0;
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (i <= hi) {
        const idx = order[i] ?? 0;
        const z = worldZ[idx] ?? 0;
        if (z < pz || (z === pz && (worldX[idx] ?? 0) >= px)) break;
        i += 1;
      }
      while (j >= lo) {
        const idx = order[j] ?? 0;
        const z = worldZ[idx] ?? 0;
        if (z > pz || (z === pz && (worldX[idx] ?? 0) <= px)) break;
        j -= 1;
      }
      if (i <= j) {
        const tmp = order[i] ?? 0;
        order[i] = order[j] ?? 0;
        order[j] = tmp;
        i += 1;
        j -= 1;
      }
    }
    if (lo < j) {
      stack[sp++] = lo;
      stack[sp++] = j;
    }
    if (i < hi) {
      stack[sp++] = i;
      stack[sp++] = hi;
    }
  }
}

/**
 * 결정론적 원근 소실점 기반 대규모 군중 생성기 진입점.
 *
 * - Poisson-disk 비겹침 배치 + 원경→근경 painter's order 깊이 정렬.
 * - 깊이(Z) 기반 원근 스케일 단조 감소 · 근경 G펜 선두께 > 원경 실루엣 감쇄 · 원거리 대기 페이드.
 * - 주인공 포컬 포인트(x, y)를 향한 자동 시선·몸 방향 정렬.
 * - WebGPU 64B 정렬 인스턴스 버퍼 및 20B `drawIndexedIndirect` 버퍼 동시 패킹.
 */
export function generateProceduralCrowd(options: CrowdGenerationOptions = {}): CrowdSceneResult {
  const startMs = nowMs();
  const resolved = resolveCrowdGenerationOptions(options);
  const preset = getCrowdPresetById(resolved.presetId);
  const mixedSeed =
    (resolved.seed ^ Math.imul(preset.index + 1, 2654435761) ^ Math.imul(resolved.count, 2246822519)) >>>
    0;
  const rng = createDeterministicRng(mixedSeed);

  const ground = samplePerspectivePoissonPositions(preset, resolved, rng);
  const {
    canvasWidth,
    canvasHeight,
    horizonRatio,
    vanishingX,
    focalPointX,
    focalPointY,
    focalAttention,
    strokeAttenuation,
    nearStrokeWidthPx,
    farStrokeWidthPx,
    maxAtmosphericFade,
  } = resolved;

  const vpX = canvasWidth * vanishingX;
  const vpY = canvasHeight * horizonRatio;
  const focalPx = canvasWidth * FOCAL_LENGTH_WIDTH_RATIO;
  const focalScreenX = canvasWidth * focalPointX;
  const focalScreenY = canvasHeight * focalPointY;

  const nearM = preset.nearDistanceM;
  const farM = preset.farDistanceM;
  const depthSpan = Math.max(0.001, farM - nearM);
  const cameraEyeHeightM = ((canvasHeight * 0.94 - vpY) * nearM) / focalPx;
  const baseForegroundHeightPx = Math.min(canvasHeight * 0.37, Math.max(88, (canvasHeight - vpY) * 0.62));
  const screenXMin = canvasWidth * 0.02;
  const screenXMax = canvasWidth * 0.98;
  const screenYMin = canvasHeight * 0.14;
  const screenYMax = canvasHeight * 0.96;
  const fadeWeight = 0.35 + 0.65 * strokeAttenuation;
  const strokeWidthRange = nearStrokeWidthPx - farStrokeWidthPx;
  const headBlend = clampNumber(0.45 + 0.55 * focalAttention, 0, 1);
  const bodyBlend = clampNumber(0.22 + 0.64 * focalAttention, 0, 1);
  const strokeInkBase = {
    l: Math.max(0.08, preset.inkNearOklch.l * 0.58),
    c: preset.inkNearOklch.c * 0.85,
    h: preset.inkNearOklch.h,
  };

  // 원경 → 근경(worldZ 내림차순) 정렬용 인덱스 배열
  const order = new Int32Array(ground.placedCount);
  for (let i = 0; i < ground.placedCount; i += 1) {
    order[i] = i;
  }
  sortIndicesByDepthDesc(order, ground.worldZ, ground.worldX);

  const agents: CrowdAgentInstance[] = new Array(ground.placedCount);
  let lodNear = 0;
  let lodMid = 0;
  let lodFar = 0;
  let sumGazeAlignment = 0;
  let minStroke = Number.POSITIVE_INFINITY;
  let maxStroke = 0;

  for (let outIdx = 0; outIdx < ground.placedCount; outIdx += 1) {
    const srcIdx = order[outIdx] ?? outIdx;
    const worldX = ground.worldX[srcIdx] ?? 0;
    const worldZ = ground.worldZ[srcIdx] ?? nearM;
    const depth = clampNumber((worldZ - nearM) / depthSpan, 0, 1);
    const worldY = preset.elevationSlope * (worldZ - nearM);

    // 핀홀 원근 투영(깊이 증가 시 perspectiveScale 엄격 단조 감소)
    const perspectiveScale = nearM / worldZ;
    const screenX = clampNumber(vpX + (worldX * focalPx) / worldZ, screenXMin, screenXMax);
    const rawGroundY = vpY + ((cameraEyeHeightM - worldY) * focalPx) / worldZ;
    const screenY = clampNumber(rawGroundY, screenYMin, screenYMax);

    const heightFactor = 0.91 + rng() * 0.18;
    const seated =
      preset.seatedRatio > 0 &&
      (preset.layout === "terrace-tables"
        ? worldX < 0 && rng() < Math.min(0.92, preset.seatedRatio * 1.45)
        : rng() < preset.seatedRatio);
    const silhouetteHeightPx =
      baseForegroundHeightPx * perspectiveScale * heightFactor * (seated ? 0.74 : 1);
    const silhouetteWidthPx = silhouetteHeightPx * (seated ? 0.34 : 0.28);

    // 원거리 대기 원근 페이드 & 근경 G펜 → 원경 얇은 실루엣 선두께 감쇄
    const depthCurve = Math.pow(depth, 0.85);
    const atmosphericFade = clampNumber(
      depthCurve * maxAtmosphericFade * fadeWeight,
      0,
      maxAtmosphericFade,
    );
    const opacity = clampNumber(1 - atmosphericFade * 0.56, 0.28, 1);
    const strokeWidthPx = clampNumber(
      nearStrokeWidthPx - strokeWidthRange * (depthCurve * strokeAttenuation),
      farStrokeWidthPx,
      nearStrokeWidthPx,
    );
    if (strokeWidthPx < minStroke) minStroke = strokeWidthPx;
    if (strokeWidthPx > maxStroke) maxStroke = strokeWidthPx;

    // 주인공 포컬 포인트(x, y)를 향한 자동 시선·몸 방향 정렬
    const headScreenY = screenY - silhouetteHeightPx * 0.86;
    const dxFocal = focalScreenX - screenX;
    const dyFocal = focalScreenY - headScreenY;
    const gazeAngleRad = Math.atan2(dyFocal, dxFocal);
    const targetYawRad = Math.atan2(
      dxFocal,
      Math.max(16, Math.abs(dyFocal) * 0.55 + worldZ * 3.5),
    );

    let naturalBaseYaw: number;
    if (preset.layout === "crosswalk-lanes") {
      naturalBaseYaw = srcIdx % 2 === 0 ? 0.85 : -0.85;
    } else if (preset.layout === "formation-ranks") {
      naturalBaseYaw = (rng() - 0.5) * 0.14;
    } else if (preset.layout === "subway-aisle") {
      naturalBaseYaw = worldX >= 0 ? -0.65 : 0.65;
    } else {
      naturalBaseYaw = (rng() - 0.5) * 1.1;
    }

    const focalYawDelta = normalizeAngleDiff(targetYawRad - naturalBaseYaw);
    const headYawRad = naturalBaseYaw + focalYawDelta * headBlend;
    const bodyYawRad = naturalBaseYaw + focalYawDelta * bodyBlend;
    const gazeAlignmentScore = clampNumber(0.5 + 0.5 * Math.cos(headYawRad - targetYawRad), 0, 1);
    sumGazeAlignment += gazeAlignmentScore;

    const lodTier: 0 | 1 | 2 = depth < 0.28 ? 0 : depth < 0.66 ? 1 : 2;
    if (lodTier === 0) lodNear += 1;
    else if (lodTier === 1) lodMid += 1;
    else lodFar += 1;

    const propVariant = (srcIdx % 3) as 0 | 1 | 2;
    const stridePhase = rng();
    const fillOklch = mixOklch(preset.inkNearOklch, preset.hazeFarOklch, atmosphericFade);
    const strokeOklch = mixOklch(strokeInkBase, preset.hazeFarOklch, atmosphericFade * 0.82);

    agents[outIdx] = {
      id: outIdx,
      worldX,
      worldY,
      worldZ,
      depth,
      screenX,
      screenY,
      perspectiveScale,
      heightFactor,
      silhouetteHeightPx,
      silhouetteWidthPx,
      strokeWidthPx,
      atmosphericFade,
      opacity,
      gazeAngleRad,
      headYawRad,
      bodyYawRad,
      gazeAlignmentScore,
      facing: classifyFacingDirection(headYawRad),
      lodTier,
      seated,
      propVariant,
      stridePhase,
      fillOklch,
      strokeOklch,
    };
  }

  const gpuBuffers = packCrowdInstanceBuffers(agents, preset, resolved);
  const naiveDrawCalls = agents.length * SUBMESHES_PER_NAIVE_CHARACTER;
  const instancedDrawCalls = agents.length > 0 ? 1 : 0;
  const drawCallReductionPct =
    naiveDrawCalls > 0 ? ((naiveDrawCalls - instancedDrawCalls) / naiveDrawCalls) * 100 : 0;

  const drawCallMetrics: CrowdDrawCallMetrics = {
    basis: "theoretical-instancing",
    agentCount: agents.length,
    naiveDrawCalls,
    instancedDrawCalls,
    drawCallReductionPct,
    instanceStrideBytes: CROWD_INSTANCE_STRIDE_BYTES,
    instanceBufferBytes: gpuBuffers.instanceData.byteLength,
    indirectArgsBytes: CROWD_INDIRECT_ARGS_BYTES,
    cameraUniformBytes: CROWD_CAMERA_UNIFORM_BYTES,
    lodDistribution: {
      near: lodNear,
      mid: lodMid,
      far: lodFar,
    },
    estimatedManualInkMinutesSaved: Math.round(agents.length * ESTIMATED_MINUTES_PER_EXTRA_INK),
  };

  const generationTimeMs = Math.max(0.01, nowMs() - startMs);

  return {
    preset,
    options: resolved,
    agents,
    metrics: {
      requestedCount: resolved.count,
      placedCount: agents.length,
      generationTimeMs,
      overlapViolations: ground.overlapViolations,
      minObservedWorldSpacingM: ground.minObservedWorldSpacingM,
      meanGazeAlignment: agents.length > 0 ? sumGazeAlignment / agents.length : 0,
      nearStrokeWidthPx: maxStroke,
      farStrokeWidthPx: Number.isFinite(minStroke) ? minStroke : 0,
      drawCallMetrics,
    },
    gpuBuffers,
  };
}
