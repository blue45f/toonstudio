/**
 * Wave 68 — 실시간 2D 얕은 물방정식(Shallow-Water) 유체 수채화·유화 시뮬레이터 커널.
 *
 * - 2D 얕은 물방정식(수심 압력 구배 + 표면장력 + 태블릿 기울기 중력 + 모세관 종이 흡수)
 * - 2상 안료 분리(`mobilePigment` 유동상 ↔ `depositedPigment` 고착상) 및 증발 건조 전선(Drying Front)
 * - 고정 접촉선(Contact-Line Pinning) + 가장자리 증발 압력 강하에 의한 수채화 백런(Coffee-Ring) 응집
 * - 점도(Viscosity) + 빙엄 항복 응력(Bingham Yield Stress) 통합으로 저점도 수채화 ↔ 고점도 유화/임파스토 표현
 * - 보존형 양선형 플럭스 수송으로 물·안료 총질량을 수치적으로 엄밀 보존하며 CFL·NaN 발산을 원천 차단
 */

export const FLUID_PIGMENT_CHANNELS = 4 as const;
export const FLUID_WET_EPSILON = 1e-5;
export const FLUID_DEFAULT_MAX_CFL = 0.45;
const MAX_SUBSTEP_DT_SEC = 0.04;
const MAX_SUBSTEPS_PER_CALL = 16;

export type PaintMediumPresetId = "watercolor" | "gouache" | "oil-impasto" | "ink-wash";

export interface PaintMediumPreset {
  readonly id: PaintMediumPresetId;
  readonly labelKo: string;
  readonly viscosity: number;
  readonly surfaceTension: number;
  readonly pressureStiffness: number;
  readonly capillarySuction: number;
  readonly capillaryWicking: number;
  readonly evaporationRate: number;
  readonly edgeEvaporationBoost: number;
  readonly pigmentSettleRate: number;
  readonly granulationStrength: number;
  readonly contactPinningDrag: number;
  readonly impastoRetention: number;
}

export const PAINT_MEDIUM_PRESETS: Readonly<Record<PaintMediumPresetId, PaintMediumPreset>> = {
  watercolor: {
    id: "watercolor", labelKo: "투명 수채화", viscosity: 0.07, surfaceTension: 0.14,
    pressureStiffness: 5.4, capillarySuction: 0.2, capillaryWicking: 0.58,
    evaporationRate: 0.18, edgeEvaporationBoost: 2.8, pigmentSettleRate: 0.28,
    granulationStrength: 0.45, contactPinningDrag: 6.5, impastoRetention: 0.08,
  },
  "ink-wash": {
    id: "ink-wash", labelKo: "수묵 번짐", viscosity: 0.045, surfaceTension: 0.1,
    pressureStiffness: 5.8, capillarySuction: 0.3, capillaryWicking: 0.68,
    evaporationRate: 0.14, edgeEvaporationBoost: 2.0, pigmentSettleRate: 0.24,
    granulationStrength: 0.55, contactPinningDrag: 4.8, impastoRetention: 0.04,
  },
  gouache: {
    id: "gouache", labelKo: "불투명 과슈", viscosity: 3.2, surfaceTension: 0.22,
    pressureStiffness: 2.1, capillarySuction: 0.12, capillaryWicking: 0.04,
    evaporationRate: 0.24, edgeEvaporationBoost: 0.9, pigmentSettleRate: 0.72,
    granulationStrength: 0.18, contactPinningDrag: 12.0, impastoRetention: 0.52,
  },
  "oil-impasto": {
    id: "oil-impasto", labelKo: "고점도 유화 임파스토", viscosity: 14.0, surfaceTension: 0.28,
    pressureStiffness: 1.4, capillarySuction: 0.02, capillaryWicking: 0.004,
    evaporationRate: 0.03, edgeEvaporationBoost: 0.2, pigmentSettleRate: 0.18,
    granulationStrength: 0.08, contactPinningDrag: 18.0, impastoRetention: 0.95,
  },
};

export interface ShallowWaterFluidConfig {
  readonly mediumPreset?: PaintMediumPresetId;
  readonly cellSizeMm?: number;
  readonly gravityX?: number;
  readonly gravityY?: number;
  readonly viscosity?: number;
  readonly surfaceTension?: number;
  readonly pressureStiffness?: number;
  readonly capillarySuction?: number;
  readonly capillaryWicking?: number;
  readonly evaporationRate?: number;
  readonly edgeEvaporationBoost?: number;
  readonly pigmentSettleRate?: number;
  readonly granulationStrength?: number;
  readonly contactPinningDrag?: number;
  readonly impastoRetention?: number;
  readonly maxCflCourant?: number;
}

export interface ResolvedShallowWaterFluidConfig {
  readonly mediumPreset: PaintMediumPresetId;
  readonly cellSizeMm: number;
  readonly gravityX: number;
  readonly gravityY: number;
  readonly viscosity: number;
  readonly surfaceTension: number;
  readonly pressureStiffness: number;
  readonly capillarySuction: number;
  readonly capillaryWicking: number;
  readonly evaporationRate: number;
  readonly edgeEvaporationBoost: number;
  readonly pigmentSettleRate: number;
  readonly granulationStrength: number;
  readonly contactPinningDrag: number;
  readonly impastoRetention: number;
  readonly maxCflCourant: number;
}

export interface ShallowWaterPaintField {
  readonly width: number;
  readonly height: number;
  readonly cellCount: number;
  readonly channelCount: typeof FLUID_PIGMENT_CHANNELS;
  waterHeight: Float32Array;
  paperSaturation: Float32Array;
  paperGrain: Float32Array;
  velocityX: Float32Array;
  velocityY: Float32Array;
  pressure: Float32Array;
  mobilePigment: Float32Array;
  depositedPigment: Float32Array;
  impastoRelief: Float32Array;
  stepCount: number;
  elapsedSec: number;
  /** 핑퐁 스텝 동안 힙 재할당을 막기 위한 내부 스크래치 버퍼 */
  readonly scratchWater: Float32Array;
  readonly scratchMomX: Float32Array;
  readonly scratchMomY: Float32Array;
  readonly scratchVelX: Float32Array;
  readonly scratchVelY: Float32Array;
  readonly scratchEdge: Float32Array;
  readonly scratchMobilePigment: Float32Array;
}

export interface CreateShallowWaterFieldOptions {
  readonly paperGrainSeed?: number;
  readonly paperRoughness?: number;
}

export interface FluidPaintDropInput {
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly waterAmount: number;
  readonly pigmentAmounts: readonly [number, number, number, number];
  readonly initialVelocityX?: number;
  readonly initialVelocityY?: number;
  readonly impastoBody?: number;
  readonly edgeSoftness?: number;
}

export interface FluidPaintDropResult {
  readonly affectedCells: number;
  readonly addedWater: number;
  readonly addedPigmentByChannel: readonly [number, number, number, number];
  readonly totalAddedPigment: number;
}

export interface ShallowWaterStepSummary {
  readonly substepsExecuted: number;
  readonly dtExecutedSec: number;
  readonly totalWater: number;
  readonly totalMobilePigment: number;
  readonly totalDepositedPigment: number;
  readonly depositedDeltaPigment: number;
  readonly maxSpeedCellsPerSec: number;
  readonly activeWetCells: number;
  readonly cflClampedCells: number;
  readonly hadNonFiniteSanitized: boolean;
}

function sanitizeFinite(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function hash2D(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothValueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const top = hash2D(x0, y0, seed) + (hash2D(x0 + 1, y0, seed) - hash2D(x0, y0, seed)) * ux;
  const bot = hash2D(x0, y0 + 1, seed) + (hash2D(x0 + 1, y0 + 1, seed) - hash2D(x0, y0 + 1, seed)) * ux;
  return top + (bot - top) * uy;
}

/** 결정론적 냉압(Cold-Press) 수채화지 미세 요철 높이장을 생성한다 (`0..1`). */
export function generateDeterministicPaperGrain(
  width: number,
  height: number,
  seed: number = 6801,
  roughness: number = 0.65,
): Float32Array {
  const grain = new Float32Array(width * height);
  const safeRough = clamp(sanitizeFinite(roughness, 0.65), 0, 1);
  const safeSeed = Math.floor(sanitizeFinite(seed, 6801));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const combined =
        smoothValueNoise2D(x * 0.22, y * 0.22, safeSeed) * 0.52 +
        smoothValueNoise2D(x * 0.55, y * 0.55, safeSeed + 31) * 0.33 +
        hash2D(x, y, safeSeed + 97) * 0.15;
      grain[y * width + x] = clamp(0.5 + (combined - 0.5) * safeRough * 2.0, 0, 1);
    }
  }
  return grain;
}

export function resolveShallowWaterFluidConfig(
  config: ShallowWaterFluidConfig = {},
): ResolvedShallowWaterFluidConfig {
  const presetId: PaintMediumPresetId = config.mediumPreset ?? "watercolor";
  const p = PAINT_MEDIUM_PRESETS[presetId];
  return {
    mediumPreset: presetId,
    cellSizeMm: clamp(sanitizeFinite(config.cellSizeMm, 1.0), 0.1, 20.0),
    gravityX: clamp(sanitizeFinite(config.gravityX, 0), -80, 80),
    gravityY: clamp(sanitizeFinite(config.gravityY, 0), -80, 80),
    viscosity: clamp(sanitizeFinite(config.viscosity, p.viscosity), 0.01, 60.0),
    surfaceTension: clamp(sanitizeFinite(config.surfaceTension, p.surfaceTension), 0, 4.0),
    pressureStiffness: clamp(sanitizeFinite(config.pressureStiffness, p.pressureStiffness), 0.05, 25.0),
    capillarySuction: clamp(sanitizeFinite(config.capillarySuction, p.capillarySuction), 0, 4.0),
    capillaryWicking: clamp(sanitizeFinite(config.capillaryWicking, p.capillaryWicking), 0, 1.0),
    evaporationRate: clamp(sanitizeFinite(config.evaporationRate, p.evaporationRate), 0, 8.0),
    edgeEvaporationBoost: clamp(sanitizeFinite(config.edgeEvaporationBoost, p.edgeEvaporationBoost), 0, 12.0),
    pigmentSettleRate: clamp(sanitizeFinite(config.pigmentSettleRate, p.pigmentSettleRate), 0, 6.0),
    granulationStrength: clamp(sanitizeFinite(config.granulationStrength, p.granulationStrength), 0, 2.0),
    contactPinningDrag: clamp(sanitizeFinite(config.contactPinningDrag, p.contactPinningDrag), 0, 40.0),
    impastoRetention: clamp(sanitizeFinite(config.impastoRetention, p.impastoRetention), 0, 1.0),
    maxCflCourant: clamp(sanitizeFinite(config.maxCflCourant, FLUID_DEFAULT_MAX_CFL), 0.05, 0.48),
  };
}

/** 2D 얕은 물방정식 유체 캔버스 상태(`ShallowWaterPaintField`)를 할당한다. */
export function createShallowWaterPaintField(
  width: number,
  height: number,
  options: CreateShallowWaterFieldOptions = {},
): ShallowWaterPaintField {
  const safeW = Math.max(4, Math.floor(sanitizeFinite(width, 32)));
  const safeH = Math.max(4, Math.floor(sanitizeFinite(height, 32)));
  const cellCount = safeW * safeH;
  const pLen = cellCount * FLUID_PIGMENT_CHANNELS;
  return {
    width: safeW,
    height: safeH,
    cellCount,
    channelCount: FLUID_PIGMENT_CHANNELS,
    waterHeight: new Float32Array(cellCount),
    paperSaturation: new Float32Array(cellCount),
    paperGrain: generateDeterministicPaperGrain(safeW, safeH, options.paperGrainSeed, options.paperRoughness),
    velocityX: new Float32Array(cellCount),
    velocityY: new Float32Array(cellCount),
    pressure: new Float32Array(cellCount),
    mobilePigment: new Float32Array(pLen),
    depositedPigment: new Float32Array(pLen),
    impastoRelief: new Float32Array(cellCount),
    stepCount: 0,
    elapsedSec: 0,
    scratchWater: new Float32Array(cellCount),
    scratchMomX: new Float32Array(cellCount),
    scratchMomY: new Float32Array(cellCount),
    scratchVelX: new Float32Array(cellCount),
    scratchVelY: new Float32Array(cellCount),
    scratchEdge: new Float32Array(cellCount),
    scratchMobilePigment: new Float32Array(pLen),
  };
}

/** 캔버스 위에 젖은 수채화·유화 물감 방울(또는 브러시 댑)을 주입한다. */
export function depositFluidPaintDrop(
  field: ShallowWaterPaintField,
  drop: FluidPaintDropInput,
): FluidPaintDropResult {
  const cx = sanitizeFinite(drop.centerX, field.width * 0.5);
  const cy = sanitizeFinite(drop.centerY, field.height * 0.5);
  const radius = Math.max(0.5, sanitizeFinite(drop.radius, 3.0));
  const waterAmount = Math.max(0, sanitizeFinite(drop.waterAmount, 0));
  const initVx = sanitizeFinite(drop.initialVelocityX, 0);
  const initVy = sanitizeFinite(drop.initialVelocityY, 0);
  const impastoBody = Math.max(0, sanitizeFinite(drop.impastoBody, 0));
  const softness = clamp(sanitizeFinite(drop.edgeSoftness, 0.38), 0.05, 1.0);
  const pig: [number, number, number, number] = [
    Math.max(0, sanitizeFinite(drop.pigmentAmounts[0], 0)),
    Math.max(0, sanitizeFinite(drop.pigmentAmounts[1], 0)),
    Math.max(0, sanitizeFinite(drop.pigmentAmounts[2], 0)),
    Math.max(0, sanitizeFinite(drop.pigmentAmounts[3], 0)),
  ];

  const minX = Math.max(0, Math.floor(cx - radius - 1));
  const maxX = Math.min(field.width - 1, Math.ceil(cx + radius + 1));
  const minY = Math.max(0, Math.floor(cy - radius - 1));
  const maxY = Math.min(field.height - 1, Math.ceil(cy + radius + 1));
  const innerPlateau = radius * (1.0 - softness);

  let affectedCells = 0;
  let addedWater = 0;
  const added: [number, number, number, number] = [0, 0, 0, 0];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > radius) continue;
      let weight = 1.0;
      if (dist > innerPlateau) {
        const t = clamp((dist - innerPlateau) / Math.max(1e-5, radius - innerPlateau), 0, 1);
        weight = 0.5 * (1.0 + Math.cos(Math.PI * t));
      }
      if (weight <= 1e-5) continue;

      const idx = y * field.width + x;
      const prevH = field.waterHeight[idx] ?? 0;
      const dWater = waterAmount * weight;
      const nextH = prevH + dWater;
      field.waterHeight[idx] = nextH;
      addedWater += dWater;

      if (nextH > FLUID_WET_EPSILON && (initVx !== 0 || initVy !== 0)) {
        field.velocityX[idx] = ((field.velocityX[idx] ?? 0) * prevH + initVx * dWater) / nextH;
        field.velocityY[idx] = ((field.velocityY[idx] ?? 0) * prevH + initVy * dWater) / nextH;
      }

      const target = nextH > FLUID_WET_EPSILON ? field.mobilePigment : field.depositedPigment;
      const base = idx * FLUID_PIGMENT_CHANNELS;
      for (let c = 0; c < FLUID_PIGMENT_CHANNELS; c += 1) {
        const amt = (pig[c] ?? 0) * weight;
        target[base + c] = (target[base + c] ?? 0) + amt;
        added[c] = (added[c] ?? 0) + amt;
      }
      if (impastoBody > 0) {
        field.impastoRelief[idx] = (field.impastoRelief[idx] ?? 0) + impastoBody * weight;
      }
      affectedCells += 1;
    }
  }

  return {
    affectedCells,
    addedWater,
    addedPigmentByChannel: added,
    totalAddedPigment: added[0] + added[1] + added[2] + added[3],
  };
}

function sanitizeFieldBuffers(field: ShallowWaterPaintField): boolean {
  let sanitized = false;
  for (let i = 0; i < field.cellCount; i += 1) {
    const h = field.waterHeight[i] ?? 0;
    if (!Number.isFinite(h) || h < 0) { field.waterHeight[i] = 0; sanitized = true; }
    const sat = field.paperSaturation[i] ?? 0;
    if (!Number.isFinite(sat) || sat < 0 || sat > 1) {
      field.paperSaturation[i] = clamp(Number.isFinite(sat) ? sat : 0, 0, 1);
      sanitized = true;
    }
    if (!Number.isFinite(field.velocityX[i] ?? 0)) { field.velocityX[i] = 0; sanitized = true; }
    if (!Number.isFinite(field.velocityY[i] ?? 0)) { field.velocityY[i] = 0; sanitized = true; }
    const imp = field.impastoRelief[i] ?? 0;
    if (!Number.isFinite(imp) || imp < 0) { field.impastoRelief[i] = 0; sanitized = true; }
  }
  for (let i = 0; i < field.mobilePigment.length; i += 1) {
    const m = field.mobilePigment[i] ?? 0;
    if (!Number.isFinite(m) || m < 0) { field.mobilePigment[i] = 0; sanitized = true; }
    const d = field.depositedPigment[i] ?? 0;
    if (!Number.isFinite(d) || d < 0) { field.depositedPigment[i] = 0; sanitized = true; }
  }
  return sanitized;
}

function exchangeCapillaryPair(
  idxA: number,
  idxB: number,
  wickCoeff: number,
  pigmentDiffCoeff: number,
  srcWater: Float32Array,
  srcPigment: Float32Array,
  dstWater: Float32Array,
  dstPigment: Float32Array,
): void {
  const hA = srcWater[idxA] ?? 0;
  const hB = srcWater[idxB] ?? 0;
  const diff = hA - hB;
  if (Math.abs(diff) > FLUID_WET_EPSILON && wickCoeff > 1e-5) {
    const donor = diff > 0 ? idxA : idxB;
    const receiver = diff > 0 ? idxB : idxA;
    const donorH = srcWater[donor] ?? 0;
    const transferH = Math.min(Math.abs(diff * wickCoeff), donorH * 0.24);
    if (donorH > FLUID_WET_EPSILON && transferH > 0) {
      const frac = transferH / donorH;
      dstWater[donor] = (dstWater[donor] ?? 0) - transferH;
      dstWater[receiver] = (dstWater[receiver] ?? 0) + transferH;
      const dBase = donor * FLUID_PIGMENT_CHANNELS;
      const rBase = receiver * FLUID_PIGMENT_CHANNELS;
      for (let c = 0; c < FLUID_PIGMENT_CHANNELS; c += 1) {
        const dp = (srcPigment[dBase + c] ?? 0) * frac;
        dstPigment[dBase + c] = Math.max(0, (dstPigment[dBase + c] ?? 0) - dp);
        dstPigment[rBase + c] = (dstPigment[rBase + c] ?? 0) + dp;
      }
    }
  }
  // 습윤 수막 내 보존형 Fickian 안료 상호확산(Wet-on-Wet 블룸 혼색)
  if (pigmentDiffCoeff > 1e-5 && hA > FLUID_WET_EPSILON && hB > FLUID_WET_EPSILON) {
    const wetBridge = Math.min(1.0, Math.min(hA, hB) * 2.5);
    const kDiff = pigmentDiffCoeff * wetBridge;
    const baseA = idxA * FLUID_PIGMENT_CHANNELS;
    const baseB = idxB * FLUID_PIGMENT_CHANNELS;
    for (let c = 0; c < FLUID_PIGMENT_CHANNELS; c += 1) {
      const pA = srcPigment[baseA + c] ?? 0;
      const pB = srcPigment[baseB + c] ?? 0;
      const flux = (pA - pB) * kDiff;
      if (flux > 0) {
        const clamped = Math.min(flux, (dstPigment[baseA + c] ?? 0) * 0.24);
        dstPigment[baseA + c] = (dstPigment[baseA + c] ?? 0) - clamped;
        dstPigment[baseB + c] = (dstPigment[baseB + c] ?? 0) + clamped;
      } else if (flux < 0) {
        const clamped = Math.min(-flux, (dstPigment[baseB + c] ?? 0) * 0.24);
        dstPigment[baseB + c] = (dstPigment[baseB + c] ?? 0) - clamped;
        dstPigment[baseA + c] = (dstPigment[baseA + c] ?? 0) + clamped;
      }
    }
  }
}

function executeSingleShallowWaterSubstep(
  field: ShallowWaterPaintField,
  subDt: number,
  cfg: ResolvedShallowWaterFluidConfig,
): { maxSpeed: number; cflClampedCells: number; depositedDelta: number } {
  const { width, height, cellCount } = field;
  const {
    waterHeight, paperSaturation, paperGrain, velocityX, velocityY, pressure,
    mobilePigment, depositedPigment, impastoRelief, scratchWater, scratchMomX,
    scratchMomY, scratchVelX, scratchVelY, scratchEdge, scratchMobilePigment,
  } = field;

  const invCellScale = 1.0 / Math.max(0.25, cfg.cellSizeMm);
  const maxAllowedSpeed = cfg.maxCflCourant / Math.max(subDt, 1e-4);
  const gravityMag = Math.hypot(cfg.gravityX, cfg.gravityY);
  const binghamYieldStress = Math.max(0, (cfg.viscosity - 1.0) * 0.48);

  // 1단계: 정수압 + 표면장력 + 건조 전선 증발 압력 강하(Coffee-Ring 방사형 흡인)
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const rowUp = (y > 0 ? y - 1 : 0) * width;
    const rowDn = (y < height - 1 ? y + 1 : height - 1) * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const xLt = x > 0 ? x - 1 : 0;
      const xRt = x < width - 1 ? x + 1 : width - 1;
      const h = waterHeight[idx] ?? 0;
      const hL = waterHeight[row + xLt] ?? 0;
      const hR = waterHeight[row + xRt] ?? 0;
      const hU = waterHeight[rowUp + x] ?? 0;
      const hD = waterHeight[rowDn + x] ?? 0;
      const lapH = hL + hR + hU + hD - 4.0 * h;
      const grainHead = ((paperGrain[idx] ?? 0.5) - 0.5) * 0.06 * Math.min(h, 0.25);

      let edgeFactor = 0;
      if (h > FLUID_WET_EPSILON) {
        const thinThresh = Math.max(FLUID_WET_EPSILON * 2.0, h * 0.42);
        const thinNeighbors =
          (hL < thinThresh ? 1 : 0) + (hR < thinThresh ? 1 : 0) +
          (hU < thinThresh ? 1 : 0) + (hD < thinThresh ? 1 : 0);
        const dropRatio = Math.max(0, (h - 0.25 * (hL + hR + hU + hD)) / Math.max(h, 0.08));
        edgeFactor = clamp(thinNeighbors * 0.34 + dropRatio * 0.45, 0, 1);
      }
      scratchEdge[idx] = edgeFactor;

      const baseHydrostatic = cfg.pressureStiffness * (h + grainHead);
      // Deegan 모세관 보충류: 증발이 빠른 젖은 가장자리에서 압력이 낮아져 중심부 안료를 고리로 흡인
      const rimSuctionCap = Math.max(0, baseHydrostatic * 0.72);
      const dryingFrontSuction = Math.min(
        rimSuctionCap,
        edgeFactor * cfg.evaporationRate * cfg.edgeEvaporationBoost * 1.15,
      );
      pressure[idx] = baseHydrostatic - cfg.surfaceTension * lapH - dryingFrontSuction;
    }
  }

  // 2단계: 얕은 물방정식 속도 갱신 (압력 구배 + 중력 + 점도·항복 응력 + 접촉선 피닝 + CFL)
  let maxSpeed = 0;
  let cflClampedCells = 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const rowUp = (y > 0 ? y - 1 : 0) * width;
    const rowDn = (y < height - 1 ? y + 1 : height - 1) * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const h = waterHeight[idx] ?? 0;
      if (h <= FLUID_WET_EPSILON) {
        scratchVelX[idx] = 0;
        scratchVelY[idx] = 0;
        continue;
      }
      const xLt = x > 0 ? x - 1 : 0;
      const xRt = x < width - 1 ? x + 1 : width - 1;
      const gradPx = 0.5 * ((pressure[row + xRt] ?? 0) - (pressure[row + xLt] ?? 0)) * invCellScale;
      const gradPy = 0.5 * ((pressure[rowDn + x] ?? 0) - (pressure[rowUp + x] ?? 0)) * invCellScale;

      const depthMobility = h / (h + 0.08);
      let ax = -gradPx + cfg.gravityX * depthMobility;
      let ay = -gradPy + cfg.gravityY * depthMobility;

      if (binghamYieldStress > 0) {
        const accelMag = Math.hypot(ax, ay);
        if (accelMag <= binghamYieldStress) {
          ax *= 0.04;
          ay *= 0.04;
        } else if (accelMag > 1e-6) {
          const excess = (accelMag - binghamYieldStress) / accelMag;
          ax *= excess;
          ay *= excess;
        }
      }

      const edgeFactor = scratchEdge[idx] ?? 0;
      const pinningRelief = clamp(1.0 - gravityMag * 0.16, 0.12, 1.0);
      const evapPinFactor = clamp(cfg.evaporationRate * 3.5, 0.2, 1.4);
      const thinPinning = h < 0.34 ? (1.0 - h / 0.34) * edgeFactor * evapPinFactor : 0;
      const viscousDrag =
        cfg.viscosity * (1.2 + 0.45 / (h + 0.12)) + cfg.contactPinningDrag * thinPinning * pinningRelief;
      const damp = Math.exp(-viscousDrag * subDt);

      let vx = ((velocityX[idx] ?? 0) + ax * subDt) * damp;
      let vy = ((velocityY[idx] ?? 0) + ay * subDt) * damp;
      if ((x === 0 && vx < 0) || (x === width - 1 && vx > 0)) vx = 0;
      if ((y === 0 && vy < 0) || (y === height - 1 && vy > 0)) vy = 0;

      const speed = Math.hypot(vx, vy);
      if (speed > maxAllowedSpeed && speed > 1e-8) {
        const scale = maxAllowedSpeed / speed;
        vx *= scale;
        vy *= scale;
        cflClampedCells += 1;
      }
      const clampedSpeed = Math.hypot(vx, vy);
      if (clampedSpeed > maxSpeed) maxSpeed = clampedSpeed;
      scratchVelX[idx] = vx;
      scratchVelY[idx] = vy;
    }
  }

  // 3단계: 보존형 양선형 수송(Conservative Bilinear Advection) — 물·운동량·4채널 안료 엄밀 보존
  scratchWater.fill(0);
  scratchMomX.fill(0);
  scratchMomY.fill(0);
  scratchMobilePigment.fill(0);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const h = waterHeight[idx] ?? 0;
      const base = idx * FLUID_PIGMENT_CHANNELS;
      const pigSum =
        (mobilePigment[base] ?? 0) + (mobilePigment[base + 1] ?? 0) +
        (mobilePigment[base + 2] ?? 0) + (mobilePigment[base + 3] ?? 0);
      if (h <= FLUID_WET_EPSILON && pigSum <= 0) continue;

      const vx = scratchVelX[idx] ?? 0;
      const vy = scratchVelY[idx] ?? 0;
      const tx = clamp(x + vx * subDt, 0, width - 1);
      const ty = clamp(y + vy * subDt, 0, height - 1);
      const x0 = Math.floor(tx);
      const y0 = Math.floor(ty);
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const fx = tx - x0;
      const fy = ty - y0;

      const targets: readonly [number, number][] = [
        [y0 * width + x0, (1.0 - fx) * (1.0 - fy)],
        [y0 * width + x1, fx * (1.0 - fy)],
        [y1 * width + x0, (1.0 - fx) * fy],
        [y1 * width + x1, fx * fy],
      ];
      const momX = h * vx;
      const momY = h * vy;
      for (let t = 0; t < 4; t += 1) {
        const pair = targets[t];
        if (!pair) continue;
        const dstIdx = pair[0];
        const w = pair[1];
        if (w <= 0) continue;
        scratchWater[dstIdx] = (scratchWater[dstIdx] ?? 0) + h * w;
        scratchMomX[dstIdx] = (scratchMomX[dstIdx] ?? 0) + momX * w;
        scratchMomY[dstIdx] = (scratchMomY[dstIdx] ?? 0) + momY * w;
        const dstBase = dstIdx * FLUID_PIGMENT_CHANNELS;
        for (let c = 0; c < FLUID_PIGMENT_CHANNELS; c += 1) {
          scratchMobilePigment[dstBase + c] =
            (scratchMobilePigment[dstBase + c] ?? 0) + (mobilePigment[base + c] ?? 0) * w;
        }
      }
    }
  }

  // 4단계: 저점도 모세관 번짐 + 습윤 수막 내 보존형 안료 상호확산(Wet-on-Wet)
  const wickCoeff = clamp((cfg.capillaryWicking / (1.0 + cfg.viscosity * 2.2)) * subDt, 0, 0.18);
  const pigmentDiffCoeff = clamp((0.65 / (1.0 + cfg.viscosity * 3.0)) * subDt, 0, 0.14);
  waterHeight.set(scratchWater);
  mobilePigment.set(scratchMobilePigment);
  if (wickCoeff > 1e-5 || pigmentDiffCoeff > 1e-5) {
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        const idx = row + x;
        if (x + 1 < width) {
          exchangeCapillaryPair(idx, idx + 1, wickCoeff, pigmentDiffCoeff, scratchWater, scratchMobilePigment, waterHeight, mobilePigment);
        }
        if (y + 1 < height) {
          exchangeCapillaryPair(idx, idx + width, wickCoeff, pigmentDiffCoeff, scratchWater, scratchMobilePigment, waterHeight, mobilePigment);
        }
      }
    }
  }

  // 5단계: 모세관 종이 흡수 + 건조 전선 증발 + 2상 안료 고착(mobilePigment → depositedPigment)
  let depositedDelta = 0;
  for (let i = 0; i < cellCount; i += 1) {
    const hBefore = Math.max(0, waterHeight[i] ?? 0);
    const edgeFactor = scratchEdge[i] ?? 0;
    const valleyTrap = 1.0 - (paperGrain[i] ?? 0.5);

    if (hBefore > FLUID_WET_EPSILON) {
      const prevHForVel = Math.max(FLUID_WET_EPSILON, scratchWater[i] ?? hBefore);
      velocityX[i] = clamp((scratchMomX[i] ?? 0) / prevHForVel, -maxAllowedSpeed, maxAllowedSpeed);
      velocityY[i] = clamp((scratchMomY[i] ?? 0) / prevHForVel, -maxAllowedSpeed, maxAllowedSpeed);

      const sat = paperSaturation[i] ?? 0;
      const sucked = Math.min(hBefore, cfg.capillarySuction * Math.max(0, 1.0 - sat) * (0.65 + 0.7 * valleyTrap) * subDt);
      const afterSuction = Math.max(0, hBefore - sucked);
      const localEvap = cfg.evaporationRate * (1.0 + cfg.edgeEvaporationBoost * edgeFactor);
      const evaporated = Math.min(afterSuction, localEvap * subDt);
      const nextH = Math.max(0, afterSuction - evaporated);

      paperSaturation[i] = clamp(sat + sucked - cfg.evaporationRate * 0.35 * subDt, 0, 1);

      const lossRatio = clamp((sucked + evaporated) / hBefore, 0, 1);
      const settleBase = cfg.pigmentSettleRate * (0.6 + cfg.granulationStrength * valleyTrap) * subDt;
      const transferFraction =
        nextH <= FLUID_WET_EPSILON ? 1.0 : clamp(lossRatio * (0.65 + 0.35 * edgeFactor) + settleBase, 0, 1);

      const base = i * FLUID_PIGMENT_CHANNELS;
      let cellDepAdded = 0;
      for (let c = 0; c < FLUID_PIGMENT_CHANNELS; c += 1) {
        const mob = mobilePigment[base + c] ?? 0;
        if (mob <= 0) continue;
        const delta = mob * transferFraction;
        mobilePigment[base + c] = mob - delta;
        depositedPigment[base + c] = (depositedPigment[base + c] ?? 0) + delta;
        cellDepAdded += delta;
      }
      depositedDelta += cellDepAdded;
      if (cellDepAdded > 0 && cfg.impastoRetention > 0) {
        impastoRelief[i] = (impastoRelief[i] ?? 0) + cellDepAdded * cfg.impastoRetention * 0.22;
      }
      if (nextH <= FLUID_WET_EPSILON) {
        waterHeight[i] = 0;
        velocityX[i] = 0;
        velocityY[i] = 0;
      } else {
        waterHeight[i] = nextH;
      }
    } else {
      waterHeight[i] = 0;
      velocityX[i] = 0;
      velocityY[i] = 0;
      paperSaturation[i] = Math.max(0, (paperSaturation[i] ?? 0) - cfg.evaporationRate * 0.4 * subDt);
      const base = i * FLUID_PIGMENT_CHANNELS;
      for (let c = 0; c < FLUID_PIGMENT_CHANNELS; c += 1) {
        const mob = mobilePigment[base + c] ?? 0;
        if (mob > 0) {
          mobilePigment[base + c] = 0;
          depositedPigment[base + c] = (depositedPigment[base + c] ?? 0) + mob;
          depositedDelta += mob;
        }
      }
    }
  }

  return { maxSpeed, cflClampedCells, depositedDelta };
}

/**
 * 2D 얕은 물방정식 유체 수채화·유화 시뮬레이션을 `dtSec`만큼 전진시킨다.
 * CFL 안정성 확보를 위해 자동 서브스텝을 수행하며, NaN/Infinity 오염을 차단한다.
 */
export function stepShallowWaterFluidSimulation(
  field: ShallowWaterPaintField,
  dtSec: number,
  config: ShallowWaterFluidConfig = {},
): ShallowWaterStepSummary {
  const hadNonFiniteSanitized = sanitizeFieldBuffers(field);
  const cfg = resolveShallowWaterFluidConfig(config);
  if (!Number.isFinite(dtSec) || dtSec <= 0) {
    return summarizeFieldState(field, 0, 0, 0, 0, 0, hadNonFiniteSanitized);
  }

  const clampedDt = Math.min(dtSec, MAX_SUBSTEP_DT_SEC * MAX_SUBSTEPS_PER_CALL);
  const substeps = Math.min(MAX_SUBSTEPS_PER_CALL, Math.max(1, Math.ceil(clampedDt / MAX_SUBSTEP_DT_SEC)));
  const subDt = clampedDt / substeps;
  let peakSpeed = 0;
  let totalCflClamped = 0;
  let totalDepositedDelta = 0;

  for (let s = 0; s < substeps; s += 1) {
    const res = executeSingleShallowWaterSubstep(field, subDt, cfg);
    if (res.maxSpeed > peakSpeed) peakSpeed = res.maxSpeed;
    totalCflClamped += res.cflClampedCells;
    totalDepositedDelta += res.depositedDelta;
    field.stepCount += 1;
    field.elapsedSec += subDt;
  }

  return summarizeFieldState(
    field, substeps, clampedDt, totalDepositedDelta, peakSpeed, totalCflClamped, hadNonFiniteSanitized,
  );
}

function summarizeFieldState(
  field: ShallowWaterPaintField,
  substepsExecuted: number,
  dtExecutedSec: number,
  depositedDeltaPigment: number,
  maxSpeedCellsPerSec: number,
  cflClampedCells: number,
  hadNonFiniteSanitized: boolean,
): ShallowWaterStepSummary {
  let totalWater = 0; let activeWetCells = 0;
  for (let i = 0; i < field.cellCount; i += 1) {
    const h = field.waterHeight[i] ?? 0;
    totalWater += h;
    if (h > FLUID_WET_EPSILON) activeWetCells += 1;
  }
  let totalMobilePigment = 0; let totalDepositedPigment = 0;
  for (let i = 0; i < field.mobilePigment.length; i += 1) {
    totalMobilePigment += field.mobilePigment[i] ?? 0;
    totalDepositedPigment += field.depositedPigment[i] ?? 0;
  }
  return {
    substepsExecuted, dtExecutedSec, totalWater, totalMobilePigment, totalDepositedPigment,
    depositedDeltaPigment, maxSpeedCellsPerSec, activeWetCells, cflClampedCells, hadNonFiniteSanitized,
  };
}
