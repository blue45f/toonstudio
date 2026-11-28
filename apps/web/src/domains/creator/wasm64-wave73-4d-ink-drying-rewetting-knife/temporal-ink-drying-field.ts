/**
 * 4D 시공간 잉크 건조 상태장(`TemporalInkCanvasField`) 및 결정론적 타임라인 스크러빙 엔진.
 *
 * - 셀별 4채널 습윤/고착 안료, 수분 두께(`waterMm`), 산화·바인더 경화도(`cureState`),
 *   도포/최종 습윤 시각, 임파스토 높이(`heightMm`), 종이 결(`paperTooth`), 지지체 흡수량을 관리한다.
 * - 4대 매체(투명 수채화, 수묵화, 불투명 과슈, 알키드 유화)의 증발·모세관·커피링·산화 경화를
 *   16ms~1800s 임의 시간 간격에 걸쳐 질량 보존 적분하고, 불변 로그 기반 비트 동일 스크러빙을 제공한다.
 */

export type TemporalMediumId =
  | "transparent-watercolor"
  | "sumi-ink-wash"
  | "opaque-gouache"
  | "oil-impasto-alkyd";

export type Rgba4Tuple = readonly [number, number, number, number];
export type Rgb3Tuple = readonly [number, number, number];

export interface TemporalMediaProfile {
  readonly id: TemporalMediumId;
  readonly mediumIndex: number;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly evaporationRateMmPerSec: number;
  readonly capillarySuctionRate: number;
  readonly maxSubstrateCapacityMm: number;
  readonly depositionRatePerSec: number;
  readonly coffeeRingStrength: number;
  readonly oxidationCureRatePerSec: number;
  readonly maxCureState: number;
  readonly rewetSolubility: number;
  readonly permanentStaining: number;
  readonly solventSofteningFactor: number;
  readonly defaultImpastoHeightMm: number;
  readonly shrinkageOnDry: number;
  readonly fiberWickingRate: number;
  readonly waterRewettable: boolean;
  readonly solventRewettable: boolean;
}

export const TEMPORAL_MEDIUM_ORDER: readonly TemporalMediumId[] = [
  "transparent-watercolor",
  "sumi-ink-wash",
  "opaque-gouache",
  "oil-impasto-alkyd",
];

export const TEMPORAL_MEDIA_PROFILES: Readonly<Record<TemporalMediumId, TemporalMediaProfile>> = {
  "transparent-watercolor": {
    id: "transparent-watercolor", mediumIndex: 0,
    labelKo: "투명 수채화 (코튼 수채지)",
    summaryKo: "모세관 증발이 빠르고 건조 경계 커피링이 강하며 30분 뒤에도 맑은 물로 재용해됩니다.",
    evaporationRateMmPerSec: 0.0048, capillarySuctionRate: 0.014, maxSubstrateCapacityMm: 0.42,
    depositionRatePerSec: 0.024, coffeeRingStrength: 0.82, oxidationCureRatePerSec: 0.00004,
    maxCureState: 0.1, rewetSolubility: 0.9, permanentStaining: 0.14, solventSofteningFactor: 0.04,
    defaultImpastoHeightMm: 0.03, shrinkageOnDry: 0.65, fiberWickingRate: 0.16,
    waterRewettable: true, solventRewettable: false,
  },
  "sumi-ink-wash": {
    id: "sumi-ink-wash", mediumIndex: 1,
    labelKo: "수묵화 (한지·선지 먹물)",
    summaryKo: "종이 섬유로 빠르게 스며들어 중심부는 영구 착색되고 바깥 번짐층만 부드럽게 재습윤됩니다.",
    evaporationRateMmPerSec: 0.0054, capillarySuctionRate: 0.032, maxSubstrateCapacityMm: 0.6,
    depositionRatePerSec: 0.038, coffeeRingStrength: 0.3, oxidationCureRatePerSec: 0.00018,
    maxCureState: 0.32, rewetSolubility: 0.56, permanentStaining: 0.72, solventSofteningFactor: 0.02,
    defaultImpastoHeightMm: 0.015, shrinkageOnDry: 0.78, fiberWickingRate: 0.46,
    waterRewettable: true, solventRewettable: false,
  },
  "opaque-gouache": {
    id: "opaque-gouache", mediumIndex: 2,
    labelKo: "불투명 과슈 (매트 아라비아검)",
    summaryKo: "무광으로 빠르게 마르지만 상부 불투명 도막의 물 브러시 재용해 리프팅성이 높습니다.",
    evaporationRateMmPerSec: 0.0072, capillarySuctionRate: 0.016, maxSubstrateCapacityMm: 0.34,
    depositionRatePerSec: 0.048, coffeeRingStrength: 0.16, oxidationCureRatePerSec: 0.00004,
    maxCureState: 0.08, rewetSolubility: 0.96, permanentStaining: 0.06, solventSofteningFactor: 0.03,
    defaultImpastoHeightMm: 0.22, shrinkageOnDry: 0.34, fiberWickingRate: 0.09,
    waterRewettable: true, solventRewettable: false,
  },
  "oil-impasto-alkyd": {
    id: "oil-impasto-alkyd", mediumIndex: 3,
    labelKo: "알키드 유화 임파스토",
    summaryKo: "산화 가교로 서서히 굳으며 두꺼운 능선을 유지합니다. 반경화 상태에서만 용매로 연화됩니다.",
    evaporationRateMmPerSec: 0.00028, capillarySuctionRate: 0.001, maxSubstrateCapacityMm: 0.08,
    depositionRatePerSec: 0.0038, coffeeRingStrength: 0, oxidationCureRatePerSec: 0.0015,
    maxCureState: 1, rewetSolubility: 0, permanentStaining: 0.04, solventSofteningFactor: 0.88,
    defaultImpastoHeightMm: 1.75, shrinkageOnDry: 0.04, fiberWickingRate: 0,
    waterRewettable: false, solventRewettable: true,
  },
};

export interface TemporalStrokePoint { readonly x: number; readonly y: number; readonly pressure?: number; }

export interface SpatialTemporalStrokeEvent {
  readonly strokeId: string;
  readonly timestampSec: number;
  readonly medium: TemporalMediumId;
  readonly points: readonly TemporalStrokePoint[];
  readonly radiusPx: number;
  readonly pigmentRgba: Rgba4Tuple;
  readonly waterMm?: number;
  readonly heightMm?: number;
  readonly initialCureState?: number;
}

export interface DryingEnvironmentConfig {
  readonly ambientTempC?: number; readonly relativeHumidity?: number;
  readonly airflowMps?: number; readonly maxSubsteps?: number;
}

export interface TemporalInkCanvasInitOptions {
  readonly width: number; readonly height: number;
  readonly paperSeed?: number; readonly initialTimeSec?: number;
  readonly underpaintLinearRgb?: Rgb3Tuple;
}

interface TemporalFieldBufferSet {
  readonly width: number; readonly height: number; readonly cellCount: number; readonly paperSeed: number;
  readonly defaultUnderpaintLinearRgb: Rgb3Tuple;
  readonly wetPigment: Float32Array; readonly fixedPigment: Float32Array; readonly underpaintRgba: Float32Array;
  readonly waterMm: Float32Array; readonly cureState: Float32Array;
  readonly depositedAtSec: Float32Array; readonly lastWettedAtSec: Float32Array;
  readonly heightMm: Float32Array; readonly paperTooth: Float32Array;
  readonly substrateAbsorption: Float32Array; readonly mediumIndex: Uint8Array;
}

export interface TemporalInkCanvasField extends TemporalFieldBufferSet {
  currentTimeSec: number;
  readonly strokeLog: SpatialTemporalStrokeEvent[];
}

export interface TemporalInkSnapshot extends TemporalFieldBufferSet {
  readonly currentTimeSec: number;
  readonly strokeLog: readonly SpatialTemporalStrokeEvent[];
  readonly stateHash: string;
}

export interface TemporalFieldPigmentMetrics {
  readonly currentTimeSec: number; readonly totalWetPigmentMass: number;
  readonly totalFixedPigmentMass: number; readonly totalPigmentMass: number;
  readonly totalWaterMm: number; readonly meanWaterMm: number;
  readonly meanCureState: number; readonly meanHeightMm: number;
  readonly maxHeightMm: number; readonly activeCellCount: number; readonly stateHash: string;
}

export interface TemporalDryingStepResult {
  readonly previousTimeSec: number; readonly currentTimeSec: number;
  readonly deltaSec: number; readonly substepsExecuted: number;
  readonly initialPigmentMass: number; readonly finalPigmentMass: number;
  readonly massConservationErrorRatio: number; readonly evaporatedWaterMm: number;
  readonly newlyDepositedPigmentMass: number; readonly meanCureStateAfter: number;
}

export interface TemporalScrubResult {
  readonly field: TemporalInkCanvasField; readonly targetTimeSec: number;
  readonly appliedStrokeCount: number; readonly stateHash: string; readonly metrics: TemporalFieldPigmentMetrics;
}

export interface StrokeDepositResult {
  readonly strokeId: string; readonly touchedCellCount: number;
  readonly depositedPigmentMass: number; readonly depositedWaterMm: number; readonly timestampSec: number;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

export function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value <= min) return min;
  return value >= max ? max : value;
}

export function sanitizePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getTemporalMediaProfileByIndex(index: number): TemporalMediaProfile {
  return TEMPORAL_MEDIA_PROFILES[TEMPORAL_MEDIUM_ORDER[index] ?? "transparent-watercolor"];
}

function hash2dUnit(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise2d(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const nx0 = hash2dUnit(x0, y0, seed) + (hash2dUnit(x0 + 1, y0, seed) - hash2dUnit(x0, y0, seed)) * ux;
  const nx1 = hash2dUnit(x0, y0 + 1, seed) + (hash2dUnit(x0 + 1, y0 + 1, seed) - hash2dUnit(x0, y0 + 1, seed)) * ux;
  return nx0 + (nx1 - nx0) * uy;
}

/** 결정론적 종이 섬유 요철 높이장(`0..1`)을 생성한다. */
export function generateDeterministicPaperTooth(width: number, height: number, seed: number): Float32Array {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const out = new Float32Array(safeW * safeH);
  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      out[y * safeW + x] = clamp01(
        valueNoise2d(x * 0.14, y * 0.14, seed) * 0.42 +
        valueNoise2d(x * 0.37, y * 0.37, seed + 97) * 0.3 +
        valueNoise2d(x * 0.83, y * 0.83, seed + 251) * 0.16 +
        valueNoise2d(x * 0.22, y * 0.61, seed + 509) * 0.12,
      );
    }
  }
  return out;
}

function cloneStrokeEvent(event: SpatialTemporalStrokeEvent): SpatialTemporalStrokeEvent {
  return {
    strokeId: event.strokeId,
    timestampSec: event.timestampSec,
    medium: event.medium,
    points: event.points.map((pt) => ({ x: pt.x, y: pt.y, pressure: pt.pressure })),
    radiusPx: event.radiusPx,
    pigmentRgba: [event.pigmentRgba[0], event.pigmentRgba[1], event.pigmentRgba[2], event.pigmentRgba[3]],
    waterMm: event.waterMm,
    heightMm: event.heightMm,
    initialCureState: event.initialCureState,
  };
}

function cloneBufferSet(src: TemporalFieldBufferSet): TemporalFieldBufferSet {
  return {
    width: src.width, height: src.height, cellCount: src.cellCount, paperSeed: src.paperSeed,
    defaultUnderpaintLinearRgb: [src.defaultUnderpaintLinearRgb[0], src.defaultUnderpaintLinearRgb[1], src.defaultUnderpaintLinearRgb[2]],
    wetPigment: new Float32Array(src.wetPigment), fixedPigment: new Float32Array(src.fixedPigment),
    underpaintRgba: new Float32Array(src.underpaintRgba), waterMm: new Float32Array(src.waterMm),
    cureState: new Float32Array(src.cureState), depositedAtSec: new Float32Array(src.depositedAtSec),
    lastWettedAtSec: new Float32Array(src.lastWettedAtSec), heightMm: new Float32Array(src.heightMm),
    paperTooth: new Float32Array(src.paperTooth), substrateAbsorption: new Float32Array(src.substrateAbsorption),
    mediumIndex: new Uint8Array(src.mediumIndex),
  };
}

/** 4D 시공간 잉크 건조 캔버스 상태장을 초기화한다. */
export function createTemporalInkCanvasField(options: TemporalInkCanvasInitOptions): TemporalInkCanvasField {
  const width = Math.max(1, Math.floor(sanitizePositive(options.width, 1)));
  const height = Math.max(1, Math.floor(sanitizePositive(options.height, 1)));
  const cellCount = width * height;
  const paperSeed = Math.floor(Number.isFinite(options.paperSeed) ? (options.paperSeed ?? 7301) : 7301);
  const bg = options.underpaintLinearRgb ?? [0.95, 0.93, 0.88];
  const defaultUnderpaintLinearRgb: Rgb3Tuple = [clamp01(bg[0]), clamp01(bg[1]), clamp01(bg[2])];
  const underpaintRgba = new Float32Array(cellCount * 4);
  for (let i = 0; i < cellCount; i += 1) {
    const o = i * 4;
    underpaintRgba[o] = defaultUnderpaintLinearRgb[0]; underpaintRgba[o + 1] = defaultUnderpaintLinearRgb[1];
    underpaintRgba[o + 2] = defaultUnderpaintLinearRgb[2]; underpaintRgba[o + 3] = 1;
  }
  return {
    width, height, cellCount, paperSeed, defaultUnderpaintLinearRgb,
    currentTimeSec: sanitizePositive(options.initialTimeSec ?? 0, 0),
    wetPigment: new Float32Array(cellCount * 4), fixedPigment: new Float32Array(cellCount * 4),
    underpaintRgba, waterMm: new Float32Array(cellCount), cureState: new Float32Array(cellCount),
    depositedAtSec: new Float32Array(cellCount).fill(-1), lastWettedAtSec: new Float32Array(cellCount).fill(-1),
    heightMm: new Float32Array(cellCount), paperTooth: generateDeterministicPaperTooth(width, height, paperSeed),
    substrateAbsorption: new Float32Array(cellCount), mediumIndex: new Uint8Array(cellCount), strokeLog: [],
  };
}

/** 캔버스 전체 또는 사각 영역에 밑칠 색상(`underpaintRgba`)을 도포한다. */
export function paintUnderpaintingLayer(
  field: TemporalInkCanvasField,
  colorRgb: Rgb3Tuple,
  rect?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): void {
  const r = clamp01(colorRgb[0]);
  const g = clamp01(colorRgb[1]);
  const b = clamp01(colorRgb[2]);
  const x0 = rect ? Math.max(0, Math.floor(rect.x)) : 0;
  const y0 = rect ? Math.max(0, Math.floor(rect.y)) : 0;
  const x1 = rect ? Math.min(field.width, Math.ceil(rect.x + rect.width)) : field.width;
  const y1 = rect ? Math.min(field.height, Math.ceil(rect.y + rect.height)) : field.height;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const o = (y * field.width + x) * 4;
      field.underpaintRgba[o] = r; field.underpaintRgba[o + 1] = g;
      field.underpaintRgba[o + 2] = b; field.underpaintRgba[o + 3] = 1;
    }
  }
}

/** 상태장의 모든 물리 버퍼를 Raw 32-bit 비트열 기준으로 FNV-1a 해시한다. */
export function computeTemporalFieldBitHash(field: TemporalInkCanvasField): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const mixU32 = (word: number): void => {
    h1 = Math.imul(h1 ^ word, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((word >>> 16) | (word << 16)), 0x85ebca6b) >>> 0;
  };
  const mixF32 = (arr: Float32Array): void => {
    const view = new Uint32Array(arr.buffer, arr.byteOffset, arr.length);
    for (let i = 0; i < view.length; i += 1) mixU32(view[i] === 0x80000000 ? 0 : view[i]);
  };
  mixU32(field.width >>> 0);
  mixU32(field.height >>> 0);
  mixU32(Math.round(field.currentTimeSec * 1000) >>> 0);
  mixF32(field.wetPigment); mixF32(field.fixedPigment); mixF32(field.waterMm); mixF32(field.cureState);
  mixF32(field.depositedAtSec); mixF32(field.lastWettedAtSec); mixF32(field.heightMm); mixF32(field.substrateAbsorption);
  for (let i = 0; i < field.mediumIndex.length; i += 1) mixU32(field.mediumIndex[i]);
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

/** 상태장의 안료 질량, 수분량, 경화도, 임파스토 높이 통계를 집계한다. */
export function computeFieldPigmentMetrics(field: TemporalInkCanvasField): TemporalFieldPigmentMetrics {
  let totalWetPigmentMass = 0;
  let totalFixedPigmentMass = 0;
  let totalWaterMm = 0;
  let cureSum = 0;
  let heightSum = 0;
  let maxHeightMm = 0;
  let activeCellCount = 0;

  for (let i = 0; i < field.cellCount; i += 1) {
    const o = i * 4;
    const wetM = field.wetPigment[o + 3];
    const fixedM = field.fixedPigment[o + 3];
    const water = field.waterMm[i];
    const h = field.heightMm[i];
    totalWetPigmentMass += wetM;
    totalFixedPigmentMass += fixedM;
    totalWaterMm += water;
    if (wetM + fixedM > 1e-6 || water > 1e-6 || h > 1e-6) {
      activeCellCount += 1;
      cureSum += field.cureState[i];
      heightSum += h;
      if (h > maxHeightMm) maxHeightMm = h;
    }
  }
  const denom = activeCellCount > 0 ? activeCellCount : 1;
  return {
    currentTimeSec: field.currentTimeSec, totalWetPigmentMass, totalFixedPigmentMass,
    totalPigmentMass: totalWetPigmentMass + totalFixedPigmentMass, totalWaterMm,
    meanWaterMm: activeCellCount > 0 ? totalWaterMm / denom : 0,
    meanCureState: activeCellCount > 0 ? cureSum / denom : 0,
    meanHeightMm: activeCellCount > 0 ? heightSum / denom : 0,
    maxHeightMm, activeCellCount, stateHash: computeTemporalFieldBitHash(field),
  };
}

/** 스트로크 경로로부터 연속 원형 감쇠 마스크를 래스터화한다. */
export function rasterizeRadialStrokeMask(
  width: number,
  height: number,
  points: readonly TemporalStrokePoint[],
  radiusPx: number,
): Float32Array {
  const mask = new Float32Array(width * height);
  const stepSpacing = Math.max(0.5, radiusPx * 0.35);
  const r2 = radiusPx * radiusPx;
  const stamp = (px: number, py: number, pressure: number): void => {
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    const safeP = clampRange(pressure, 0.05, 1);
    const minX = Math.max(0, Math.floor(px - radiusPx));
    const maxX = Math.min(width - 1, Math.ceil(px + radiusPx));
    const minY = Math.max(0, Math.floor(py - radiusPx));
    const maxY = Math.min(height - 1, Math.ceil(py + radiusPx));
    for (let y = minY; y <= maxY; y += 1) {
      const dy = y - py;
      for (let x = minX; x <= maxX; x += 1) {
        const d2 = (x - px) * (x - px) + dy * dy;
        if (d2 >= r2) continue;
        const norm = 1 - d2 / r2;
        const weight = norm * Math.sqrt(norm) * safeP;
        const idx = y * width + x;
        if (weight > mask[idx]) mask[idx] = weight;
      }
    }
  };
  for (let p = 0; p < points.length; p += 1) {
    const curr = points[p];
    const currP = curr.pressure ?? 1;
    stamp(curr.x, curr.y, currP);
    if (p + 1 < points.length) {
      const next = points[p + 1];
      if (!Number.isFinite(curr.x) || !Number.isFinite(curr.y) || !Number.isFinite(next.x) || !Number.isFinite(next.y)) continue;
      const nextP = next.pressure ?? 1;
      const steps = Math.max(1, Math.ceil(Math.hypot(next.x - curr.x, next.y - curr.y) / stepSpacing));
      for (let s = 1; s < steps; s += 1) {
        const t = s / steps;
        stamp(curr.x + (next.x - curr.x) * t, curr.y + (next.y - curr.y) * t, currP + (nextP - currP) * t);
      }
    }
  }
  return mask;
}

/** 시공간 스트로크 이벤트를 캔버스 상태장에 도포하고 불변 로그에 기록한다. */
export function depositTemporalInkStroke(
  field: TemporalInkCanvasField,
  event: SpatialTemporalStrokeEvent,
  recordHistory = true,
): StrokeDepositResult {
  const safeRadius = Number.isFinite(event.radiusPx) ? event.radiusPx : 0;
  const safeTimestamp = sanitizePositive(event.timestampSec, field.currentTimeSec);
  const baseMass = sanitizePositive(event.pigmentRgba[3], 0);
  if (safeRadius <= 0 || event.points.length === 0 || baseMass <= 0) {
    return { strokeId: event.strokeId, touchedCellCount: 0, depositedPigmentMass: 0, depositedWaterMm: 0, timestampSec: safeTimestamp };
  }

  const profile = TEMPORAL_MEDIA_PROFILES[event.medium];
  const rC = clamp01(event.pigmentRgba[0]);
  const gC = clamp01(event.pigmentRgba[1]);
  const bC = clamp01(event.pigmentRgba[2]);
  const defaultWater = profile.waterRewettable ? 0.42 : 0.12;
  const targetWaterMm = sanitizePositive(event.waterMm ?? defaultWater, defaultWater);
  const targetHeightMm = sanitizePositive(event.heightMm ?? profile.defaultImpastoHeightMm, profile.defaultImpastoHeightMm);
  const initialCure = clampRange(event.initialCureState ?? 0, 0, profile.maxCureState);
  const mask = rasterizeRadialStrokeMask(field.width, field.height, event.points, safeRadius);

  let touchedCellCount = 0;
  let depositedPigmentMass = 0;
  let depositedWaterMm = 0;
  const wetShare = 1 - initialCure;

  for (let i = 0; i < field.cellCount; i += 1) {
    const w = mask[i];
    if (w <= 1e-5) continue;
    touchedCellCount += 1;
    const addedMass = baseMass * w * (0.88 + 0.24 * (1 - field.paperTooth[i]));
    const addedWater = targetWaterMm * w;
    const o = i * 4;
    const wetM = addedMass * wetShare;
    const fixM = addedMass * initialCure;

    field.wetPigment[o] += rC * wetM; field.wetPigment[o + 1] += gC * wetM;
    field.wetPigment[o + 2] += bC * wetM; field.wetPigment[o + 3] += wetM;
    field.fixedPigment[o] += rC * fixM; field.fixedPigment[o + 1] += gC * fixM;
    field.fixedPigment[o + 2] += bC * fixM; field.fixedPigment[o + 3] += fixM;

    field.waterMm[i] += addedWater;
    field.heightMm[i] += targetHeightMm * w;
    field.mediumIndex[i] = profile.mediumIndex;
    field.cureState[i] = Math.max(field.cureState[i], initialCure);
    if (field.depositedAtSec[i] < 0) field.depositedAtSec[i] = safeTimestamp;
    field.lastWettedAtSec[i] = safeTimestamp;
    depositedPigmentMass += addedMass;
    depositedWaterMm += addedWater;
  }

  if (safeTimestamp > field.currentTimeSec) field.currentTimeSec = safeTimestamp;
  if (recordHistory) field.strokeLog.push(cloneStrokeEvent({ ...event, timestampSec: safeTimestamp }));
  return { strokeId: event.strokeId, touchedCellCount, depositedPigmentMass, depositedWaterMm, timestampSec: safeTimestamp };
}

function buildDeterministicSubsteps(deltaSec: number, maxSubsteps: number): number[] {
  const safeMax = Math.max(4, Math.min(64, Math.floor(maxSubsteps)));
  if (deltaSec <= 0.5) return [deltaSec];
  if (deltaSec <= 8) {
    const count = Math.min(safeMax, Math.max(2, Math.ceil(deltaSec / 0.5)));
    return Array.from({ length: count }, () => deltaSec / count);
  }
  const fineCount = Math.min(8, Math.floor(safeMax / 2));
  const out: number[] = Array.from({ length: fineCount }, () => 8 / fineCount);
  const remaining = deltaSec - 8;
  const coarseCount = Math.max(2, safeMax - fineCount);
  let weightSum = 0;
  let w = 1;
  for (let i = 0; i < coarseCount; i += 1) { weightSum += w; w *= 1.24; }
  w = 1;
  let assigned = 0;
  for (let i = 0; i < coarseCount; i += 1) {
    const step = i === coarseCount - 1 ? Math.max(0, remaining - assigned) : (remaining * w) / weightSum;
    out.push(step); assigned += step; w *= 1.24;
  }
  return out;
}

/** 임의 경과 시간 `deltaSec`(16ms ~ 1800s+) 동안 증발·모세관·커피링 이류·안료 침착·산화 경화를 적분한다. */
export function advanceTemporalDryingState(
  field: TemporalInkCanvasField,
  deltaSec: number,
  env?: DryingEnvironmentConfig,
): TemporalDryingStepResult {
  const previousTimeSec = field.currentTimeSec;
  const metricsBefore = computeFieldPigmentMetrics(field);
  if (!Number.isFinite(deltaSec) || deltaSec <= 0) {
    return {
      previousTimeSec, currentTimeSec: previousTimeSec, deltaSec: 0, substepsExecuted: 0,
      initialPigmentMass: metricsBefore.totalPigmentMass, finalPigmentMass: metricsBefore.totalPigmentMass,
      massConservationErrorRatio: 0, evaporatedWaterMm: 0, newlyDepositedPigmentMass: 0,
      meanCureStateAfter: metricsBefore.meanCureState,
    };
  }

  const tempC = clampRange(env?.ambientTempC ?? 22, 5, 45);
  const humidity = clampRange(env?.relativeHumidity ?? 0.45, 0.05, 0.95);
  const airflow = clampRange(env?.airflowMps ?? 0.2, 0, 4);
  const evapEnvFactor = Math.max(0.15, (1.15 - humidity) * (0.75 + 0.015 * tempC) * (1 + 0.35 * airflow));
  const cureEnvFactor = Math.max(0.35, 0.65 + 0.016 * tempC);

  const substeps = buildDeterministicSubsteps(deltaSec, env?.maxSubsteps ?? 28);
  const { width, height, cellCount } = field;
  const edgeFactor = new Float32Array(cellCount);
  const deltaWet = new Float32Array(cellCount * 4);
  let totalEvaporatedWater = 0;
  let totalNewlyDeposited = 0;

  for (let s = 0; s < substeps.length; s += 1) {
    const dt = substeps[s];
    if (dt <= 0) continue;

    // 1단계: 건조 전선 노출도 계산
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        const idx = row + x;
        const w = field.waterMm[idx];
        if (w <= 1e-6) { edgeFactor[idx] = 0; continue; }
        const thresh = w * 0.72;
        let dryCount = 0;
        let nCount = 0;
        if (x > 0) { nCount += 1; if (field.waterMm[idx - 1] < thresh) dryCount += 1; }
        if (x + 1 < width) { nCount += 1; if (field.waterMm[idx + 1] < thresh) dryCount += 1; }
        if (y > 0) { nCount += 1; if (field.waterMm[idx - width] < thresh) dryCount += 1; }
        if (y + 1 < height) { nCount += 1; if (field.waterMm[idx + width] < thresh) dryCount += 1; }
        edgeFactor[idx] = nCount > 0 ? dryCount / nCount : 0;
      }
    }

    // 2단계: 질량 보존 커피링 바깥쪽 이류 및 섬유 모세관 번짐
    deltaWet.fill(0);
    const transportTimeFactor = 1 - Math.exp(-0.22 * dt);
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        const idx = row + x;
        const o = idx * 4;
        const wetMass = field.wetPigment[o + 3];
        const water = field.waterMm[idx];
        if (wetMass <= 1e-7 || water <= 1e-5) continue;

        const profile = getTemporalMediaProfileByIndex(field.mediumIndex[idx]);
        if (profile.coffeeRingStrength <= 0 && profile.fiberWickingRate <= 0) continue;
        const neighbors = [x > 0 ? idx - 1 : -1, x + 1 < width ? idx + 1 : -1, y > 0 ? idx - width : -1, y + 1 < height ? idx + width : -1];
        const weights = [0, 0, 0, 0];
        let weightSum = 0;

        for (let k = 0; k < 4; k += 1) {
          const nIdx = neighbors[k];
          if (nIdx < 0) continue;
          const nWater = field.waterMm[nIdx];
          let combined = 0;
          if (profile.coffeeRingStrength > 0 && nWater > 1e-5 && nWater < water * 0.98) {
            combined += profile.coffeeRingStrength * ((water - nWater) / (water + 1e-5)) * (0.4 + 1.2 * edgeFactor[nIdx]);
          }
          if (profile.fiberWickingRate > 0 && nWater < water * 0.65) {
            combined += profile.fiberWickingRate * 0.25 * (0.65 + 0.7 * (1 - field.paperTooth[nIdx]));
          }
          if (combined > 0) { weights[k] = combined; weightSum += combined; }
        }
        if (weightSum <= 1e-7) continue;

        const moveFrac = clampRange(
          (profile.coffeeRingStrength * 0.36 + profile.fiberWickingRate * 0.14) * transportTimeFactor * (1 - field.cureState[idx]),
          0, 0.32,
        );
        if (moveFrac <= 1e-7) continue;

        const outR = field.wetPigment[o] * moveFrac;
        const outG = field.wetPigment[o + 1] * moveFrac;
        const outB = field.wetPigment[o + 2] * moveFrac;
        const outM = wetMass * moveFrac;
        deltaWet[o] -= outR; deltaWet[o + 1] -= outG; deltaWet[o + 2] -= outB; deltaWet[o + 3] -= outM;

        for (let k = 0; k < 4; k += 1) {
          if (weights[k] <= 0) continue;
          const nIdx = neighbors[k];
          const share = weights[k] / weightSum;
          const no = nIdx * 4;
          deltaWet[no] += outR * share; deltaWet[no + 1] += outG * share;
          deltaWet[no + 2] += outB * share; deltaWet[no + 3] += outM * share;
          if (field.depositedAtSec[nIdx] < 0) {
            field.depositedAtSec[nIdx] = field.currentTimeSec;
            field.mediumIndex[nIdx] = field.mediumIndex[idx];
          }
          field.lastWettedAtSec[nIdx] = Math.max(field.lastWettedAtSec[nIdx], field.lastWettedAtSec[idx]);
        }
      }
    }
    for (let i = 0; i < cellCount * 4; i += 1) field.wetPigment[i] = Math.max(0, field.wetPigment[i] + deltaWet[i]);

    // 3단계: 증발·모세관 흡습·산화 경화·안료 침착·도막 수축
    for (let i = 0; i < cellCount; i += 1) {
      const o = i * 4;
      const wetM = field.wetPigment[o + 3];
      const fixedM = field.fixedPigment[o + 3];
      const waterBefore = field.waterMm[i];
      const absorbedBefore = field.substrateAbsorption[i];
      const totalM = wetM + fixedM;
      if (totalM <= 1e-7 && waterBefore <= 1e-7 && absorbedBefore <= 1e-7 && field.heightMm[i] <= 1e-7) continue;

      const profile = getTemporalMediaProfileByIndex(field.mediumIndex[i]);
      const effEvap = profile.evaporationRateMmPerSec * evapEnvFactor * (1 + 0.85 * edgeFactor[i]);
      const evapLoss = waterBefore > 1e-7 ? waterBefore * (1 - Math.exp(-effEvap * dt)) : 0;
      const waterMid = Math.max(0, waterBefore - evapLoss);
      const suctionGain = Math.min(
        Math.max(0, profile.maxSubstrateCapacityMm - absorbedBefore),
        waterMid * (1 - Math.exp(-profile.capillarySuctionRate * dt)),
      );
      const waterAfter = Math.max(0, waterMid - suctionGain);
      const absorbedPool = absorbedBefore + suctionGain;
      const absorbedAfter = Math.max(0, absorbedPool * Math.exp(-effEvap * 0.35 * dt));

      field.waterMm[i] = waterAfter < 1e-6 ? 0 : waterAfter;
      field.substrateAbsorption[i] = absorbedAfter < 1e-6 ? 0 : absorbedAfter;
      totalEvaporatedWater += evapLoss + (absorbedPool - absorbedAfter);

      const prevCure = field.cureState[i];
      let nextCure = prevCure;
      if (totalM > 1e-7 && profile.oxidationCureRatePerSec > 0) {
        nextCure = clampRange(
          profile.maxCureState - (profile.maxCureState - prevCure) * Math.exp(-profile.oxidationCureRatePerSec * cureEnvFactor * dt),
          prevCure, profile.maxCureState,
        );
        field.cureState[i] = nextCure;
      }

      if (wetM > 1e-7) {
        let settle: number;
        if (profile.waterRewettable) {
          const waterLoss = waterBefore > 1e-6 ? clamp01((waterBefore - field.waterMm[i]) / waterBefore) : 1;
          const timeSettle = 1 - Math.exp(-profile.depositionRatePerSec * (0.85 + 0.4 * (1 - field.paperTooth[i])) * dt);
          settle = field.waterMm[i] <= 1e-6 ? 1 : clamp01(1 - (1 - waterLoss) * (1 - timeSettle));
        } else {
          const cureAdv = 1 - prevCure > 1e-5 ? clamp01((nextCure - prevCure) / (1 - prevCure)) : 1;
          settle = nextCure >= 0.92 ? 1 : clamp01(Math.max(cureAdv, (1 - Math.exp(-profile.depositionRatePerSec * dt)) * 0.5));
        }
        const dR = field.wetPigment[o] * settle;
        const dG = field.wetPigment[o + 1] * settle;
        const dB = field.wetPigment[o + 2] * settle;
        const dM = wetM * settle;
        field.wetPigment[o] = Math.max(0, field.wetPigment[o] - dR); field.wetPigment[o + 1] = Math.max(0, field.wetPigment[o + 1] - dG);
        field.wetPigment[o + 2] = Math.max(0, field.wetPigment[o + 2] - dB); field.wetPigment[o + 3] = Math.max(0, wetM - dM);
        field.fixedPigment[o] += dR; field.fixedPigment[o + 1] += dG;
        field.fixedPigment[o + 2] += dB; field.fixedPigment[o + 3] += dM;
        totalNewlyDeposited += dM;
      }

      if (field.heightMm[i] > 1e-6 && waterBefore > 1e-6 && profile.shrinkageOnDry > 0) {
        const lostFrac = clamp01((waterBefore - field.waterMm[i]) / waterBefore);
        field.heightMm[i] = Math.max(0, field.heightMm[i] * (1 - profile.shrinkageOnDry * 0.28 * lostFrac));
      }
    }
  }

  field.currentTimeSec = previousTimeSec + deltaSec;
  const metricsAfter = computeFieldPigmentMetrics(field);
  const massErr = metricsBefore.totalPigmentMass > 1e-7
    ? Math.abs(metricsAfter.totalPigmentMass - metricsBefore.totalPigmentMass) / metricsBefore.totalPigmentMass
    : 0;
  return {
    previousTimeSec, currentTimeSec: field.currentTimeSec, deltaSec, substepsExecuted: substeps.length,
    initialPigmentMass: metricsBefore.totalPigmentMass, finalPigmentMass: metricsAfter.totalPigmentMass,
    massConservationErrorRatio: massErr, evaporatedWaterMm: totalEvaporatedWater,
    newlyDepositedPigmentMass: totalNewlyDeposited, meanCureStateAfter: metricsAfter.meanCureState,
  };
}

/** 현재 시공간 상태장의 불변 스냅샷을 깊은 복사로 캡처한다. */
export function captureTemporalInkSnapshot(field: TemporalInkCanvasField): TemporalInkSnapshot {
  return {
    ...cloneBufferSet(field),
    currentTimeSec: field.currentTimeSec,
    strokeLog: field.strokeLog.map(cloneStrokeEvent),
    stateHash: computeTemporalFieldBitHash(field),
  };
}

/** 저장된 스냅샷으로부터 독립적인 상태장을 복원한다. */
export function restoreTemporalInkSnapshot(snapshot: TemporalInkSnapshot): TemporalInkCanvasField {
  return {
    ...cloneBufferSet(snapshot),
    currentTimeSec: snapshot.currentTimeSec,
    strokeLog: snapshot.strokeLog.map(cloneStrokeEvent),
  };
}

/** 불변 스트로크 로그를 원본 변형 없이 임의 시점 `targetTimeSec`으로 결정론적 타임-트래블 스크러빙한다. */
export function scrubTemporalDryingTimeline(
  source: TemporalInkCanvasField | TemporalInkSnapshot,
  targetTimeSec: number,
  env?: DryingEnvironmentConfig,
): TemporalScrubResult {
  const safeTarget = sanitizePositive(targetTimeSec, 0);
  const rebuilt = createTemporalInkCanvasField({
    width: source.width, height: source.height, paperSeed: source.paperSeed,
    initialTimeSec: 0, underpaintLinearRgb: source.defaultUnderpaintLinearRgb,
  });
  rebuilt.underpaintRgba.set(source.underpaintRgba);

  const indexed = source.strokeLog
    .map((event, order) => ({ event, order }))
    .filter((entry) => entry.event.timestampSec <= safeTarget)
    .sort((a, b) => (a.event.timestampSec !== b.event.timestampSec ? a.event.timestampSec - b.event.timestampSec : a.order - b.order));

  let cursorTime = 0;
  for (let i = 0; i < indexed.length; i += 1) {
    const ev = indexed[i].event;
    if (ev.timestampSec > cursorTime) {
      advanceTemporalDryingState(rebuilt, ev.timestampSec - cursorTime, env);
      cursorTime = ev.timestampSec;
    }
    depositTemporalInkStroke(rebuilt, ev, true);
  }
  if (safeTarget > cursorTime) advanceTemporalDryingState(rebuilt, safeTarget - cursorTime, env);
  else rebuilt.currentTimeSec = safeTarget;

  rebuilt.strokeLog.length = 0;
  for (let i = 0; i < source.strokeLog.length; i += 1) rebuilt.strokeLog.push(cloneStrokeEvent(source.strokeLog[i]));
  const metrics = computeFieldPigmentMetrics(rebuilt);
  return { field: rebuilt, targetTimeSec: safeTarget, appliedStrokeCount: indexed.length, stateHash: metrics.stateHash, metrics };
}
