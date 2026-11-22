/**
 * Rebelle 식 2D Shallow-Water 유체 수채화 · 종이 모세관 확산 · 과립화 · 백런 CPU 스텝 엔진
 * (100% 클린룸 수학·물리 구현, `studio-fluid-watercolor-wgsl.ts` WGSL Compute와 1:1 동일 수학, ₩0 로컬).
 */

import {
  DEFAULT_FLUID_WATERCOLOR_PARAMS,
  STUDIO_FLUID_WATERCOLOR_WGSL,
  STUDIO_FLUID_WATERCOLOR_WGSL_PARAM_FIELDS,
  STUDIO_FLUID_WATERCOLOR_WGSL_TRANSPORT_ENTRY,
  STUDIO_FLUID_WATERCOLOR_WGSL_VELOCITY_ENTRY,
  STUDIO_FLUID_WATERCOLOR_WGSL_WORKGROUP_X,
  STUDIO_FLUID_WATERCOLOR_WGSL_WORKGROUP_Y,
  computeFluidWatercolorDispatchSize,
  normalizeFluidWatercolorParams,
  packFluidWatercolorUniforms,
  type FluidWatercolorSimParams,
} from "./studio-fluid-watercolor-wgsl";

export {
  DEFAULT_FLUID_WATERCOLOR_PARAMS,
  STUDIO_FLUID_WATERCOLOR_WGSL,
  STUDIO_FLUID_WATERCOLOR_WGSL_PARAM_FIELDS,
  STUDIO_FLUID_WATERCOLOR_WGSL_TRANSPORT_ENTRY,
  STUDIO_FLUID_WATERCOLOR_WGSL_VELOCITY_ENTRY,
  STUDIO_FLUID_WATERCOLOR_WGSL_WORKGROUP_X,
  STUDIO_FLUID_WATERCOLOR_WGSL_WORKGROUP_Y,
  computeFluidWatercolorDispatchSize,
  normalizeFluidWatercolorParams,
  packFluidWatercolorUniforms,
  type FluidWatercolorSimParams,
};

export type FluidPaperGrainPreset = "cold-press" | "hot-press" | "rough";

export interface FluidWatercolorPigmentRgb {
  /** 선형/정규화 RGB [0..1]. */
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface CreateFluidWatercolorGridOptions {
  readonly paperPreset?: FluidPaperGrainPreset;
  readonly seed?: number;
  readonly pigmentColor?: FluidWatercolorPigmentRgb;
  readonly paperTintRgb?: readonly [number, number, number];
}

export interface FluidWatercolorDab {
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly waterAmount: number;
  readonly pigmentAmount: number;
  /** 0 = 부드러운 가우시안형, 1 = 경계가 또렷한 수채화 원형 웅덩이. */
  readonly edgeHardness?: number;
}

/**
 * WebGPU 스토리지 버퍼와 1:1 대응되는 패킹 구조:
 * - `cells`: vec4 stride `[water, vx, vy, pigment]`
 * - `paper`: vec4 stride `[paperHeight, deposited, paperAbsorb, poreCapacity]`
 * - `velMid`: vec2 stride `[vxMid, vyMid]` (Pass 1 → Pass 2 중간 버퍼)
 */
export interface FluidWatercolorGrid {
  readonly width: number;
  readonly height: number;
  readonly cellCount: number;
  readonly paperPreset: FluidPaperGrainPreset;
  readonly seed: number;
  readonly pigmentColor: FluidWatercolorPigmentRgb;
  readonly paperTintRgb: readonly [number, number, number];
  cells: Float32Array;
  cellsScratch: Float32Array;
  paper: Float32Array;
  paperScratch: Float32Array;
  velMid: Float32Array;
  stepCount: number;
}

export interface FluidWatercolorDiagnostics {
  readonly stepCount: number;
  readonly totalSurfaceWater: number;
  readonly totalAbsorbedWater: number;
  readonly totalWater: number;
  readonly totalMobilePigment: number;
  readonly totalDepositedPigment: number;
  readonly totalPigment: number;
  readonly wetCellCount: number;
  readonly pigmentCenterOfMass: { readonly x: number; readonly y: number };
  readonly valleyPigmentMean: number;
  readonly peakPigmentMean: number;
  readonly valleyToPeakGranulationRatio: number;
  readonly edgeRingPigmentMean: number;
  readonly interiorPigmentMean: number;
  readonly edgeBackrunRatio: number;
}

export interface FluidWatercolorRgbaRenderOptions {
  readonly pigmentColor?: FluidWatercolorPigmentRgb;
  readonly paperTintRgb?: readonly [number, number, number];
  readonly reliefShading?: number;
  readonly pigmentAbsorptionGain?: number;
}

export interface FluidWatercolorRgbaFrame {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function hash2d01(seed: number, x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function valueNoise2d(seed: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const v00 = hash2d01(seed, xi, yi);
  const v10 = hash2d01(seed, xi + 1, yi);
  const v01 = hash2d01(seed, xi, yi + 1);
  const v11 = hash2d01(seed, xi + 1, yi + 1);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}

function samplePaperHeight(preset: FluidPaperGrainPreset, seed: number, x: number, y: number): number {
  const scale = preset === "rough" ? 0.28 : preset === "cold-press" ? 0.22 : 0.16;
  const n1 = valueNoise2d(seed, x * scale, y * scale);
  const n2 = valueNoise2d(seed ^ 0x51a7, x * scale * 2.1, y * scale * 2.1);
  const n3 = valueNoise2d(seed ^ 0x9e37, x * scale * 4.3, y * scale * 4.3);
  const fbm = n1 * 0.56 + n2 * 0.3 + n3 * 0.14;
  if (preset === "hot-press") return clamp(0.45 + (fbm - 0.5) * 0.35, 0, 1);
  if (preset === "rough") return clamp(0.5 + (fbm - 0.5) * 1.45, 0, 1);
  return clamp(0.5 + (fbm - 0.5) * 1.15, 0, 1);
}

/** 절차적 종이 높이맵을 초기화한 2D 유체 수채화 격자를 생성한다. */
export function createFluidWatercolorGrid(
  width: number,
  height: number,
  options?: CreateFluidWatercolorGridOptions,
): FluidWatercolorGrid {
  const safeW = Math.max(2, Math.min(1024, Math.trunc(width)));
  const safeH = Math.max(2, Math.min(1024, Math.trunc(height)));
  const cellCount = safeW * safeH;
  const paperPreset: FluidPaperGrainPreset = options?.paperPreset ?? "cold-press";
  const seed = Math.trunc(options?.seed ?? 20261122);
  const pigmentColor: FluidWatercolorPigmentRgb = options?.pigmentColor ?? { r: 0.12, g: 0.36, b: 0.72 };
  const paperTintRgb: readonly [number, number, number] = options?.paperTintRgb ?? [0.975, 0.962, 0.935];

  const cells = new Float32Array(cellCount * 4);
  const cellsScratch = new Float32Array(cellCount * 4);
  const paper = new Float32Array(cellCount * 4);
  const paperScratch = new Float32Array(cellCount * 4);
  const velMid = new Float32Array(cellCount * 2);

  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const idx = y * safeW + x;
      const h = Math.fround(samplePaperHeight(paperPreset, seed, x, y));
      paper[idx * 4] = h;
      paper[idx * 4 + 3] = Math.fround(0.25 + 0.5 * (1 - h));
    }
  }

  return {
    width: safeW,
    height: safeH,
    cellCount,
    paperPreset,
    seed,
    pigmentColor,
    paperTintRgb,
    cells,
    cellsScratch,
    paper,
    paperScratch,
    velMid,
    stepCount: 0,
  };
}

/** 수채화 격자에 원형 물+안료 방울(dab)을 적재한다. */
export function depositFluidWatercolorDab(grid: FluidWatercolorGrid, dab: FluidWatercolorDab): number {
  const { width, height, cells } = grid;
  const r = Math.max(0.5, dab.radius);
  const hardness = clamp(dab.edgeHardness ?? 0.62, 0, 0.98);
  const waterAmt = Math.max(0, dab.waterAmount);
  const pigAmt = Math.max(0, dab.pigmentAmount);
  const minX = Math.max(0, Math.floor(dab.centerX - r - 1));
  const maxX = Math.min(width - 1, Math.ceil(dab.centerX + r + 1));
  const minY = Math.max(0, Math.floor(dab.centerY - r - 1));
  const maxY = Math.min(height - 1, Math.ceil(dab.centerY + r + 1));
  let affected = 0;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dist = Math.hypot(x - dab.centerX, y - dab.centerY);
      if (dist > r) continue;
      const t = dist / r;
      let profile = 1;
      if (t > hardness) {
        const u = clamp((t - hardness) / Math.max(1e-4, 1 - hardness), 0, 1);
        profile = 1 - u * u * (3 - 2 * u);
      }
      if (profile <= 0) continue;
      const off = (y * width + x) * 4;
      cells[off] = Math.fround((cells[off] ?? 0) + waterAmt * profile);
      cells[off + 3] = Math.fround((cells[off + 3] ?? 0) + pigAmt * profile);
      affected += 1;
    }
  }
  return affected;
}

function computeFaceFluxCpu(
  cells: Float32Array,
  paper: Float32Array,
  velMid: Float32Array,
  idxA: number,
  idxB: number,
  dx: number,
  dy: number,
  p: FluidWatercolorSimParams,
): readonly [number, number] {
  const offA = idxA * 4;
  const offB = idxB * 4;
  const wa = cells[offA]!;
  const wb = cells[offB]!;
  const piga = cells[offA + 3]!;
  const pigb = cells[offB + 3]!;

  const vFace = Math.fround(
    0.5 * ((velMid[idxA * 2]! + velMid[idxB * 2]!) * dx + (velMid[idxA * 2 + 1]! + velMid[idxB * 2 + 1]!) * dy),
  );
  const fAdv = Math.fround(vFace >= 0 ? vFace * wa : vFace * wb);
  const poreFactor = Math.fround(0.5 + 0.5 * (2 - paper[offA]! - paper[offB]!));
  const fCap = Math.fround(p.capillaryRate * (wa - wb) * poreFactor);
  const fWaterRaw = Math.fround(p.dt * (fAdv + fCap));
  const fWater = Math.fround(fWaterRaw > 0 ? Math.min(fWaterRaw, 0.24 * wa) : Math.max(fWaterRaw, -0.24 * wb));

  const concA = wa > p.wetEps ? Math.fround(piga / wa) : 0;
  const concB = wb > p.wetEps ? Math.fround(pigb / wb) : 0;
  const fPigAdv = Math.fround(fWater >= 0 ? fWater * concA : fWater * concB);

  const wetBoth = Math.fround(clamp((wa - p.wetEps) / 0.04, 0, 1) * clamp((wb - p.wetEps) / 0.04, 0, 1));
  const pigSrc = wa >= wb ? piga : pigb;
  const fBackrun = Math.fround(p.dt * p.backrunStrength * wetBoth * (wa - wb) * pigSrc);

  const fPigRaw = Math.fround(fPigAdv + fBackrun);
  const fPig = Math.fround(fPigRaw > 0 ? Math.min(fPigRaw, 0.24 * piga) : Math.max(fPigRaw, -0.24 * pigb));
  return [fWater, fPig];
}

/** WGSL 2패스 커널과 1:1 동일 수학으로 CPU 유체 수채화 시뮬레이션을 `steps`회 진행한다. */
export function stepFluidWatercolorCpu(
  grid: FluidWatercolorGrid,
  params?: Partial<FluidWatercolorSimParams>,
  steps = 1,
): void {
  const p = normalizeFluidWatercolorParams(params);
  const { width, height } = grid;
  const totalSteps = Math.max(1, Math.min(256, Math.trunc(steps)));

  for (let step = 0; step < totalSteps; step += 1) {
    const cellIn = grid.cells;
    const cellOut = grid.cellsScratch;
    const paperIn = grid.paper;
    const paperOut = grid.paperScratch;
    const velMid = grid.velMid;

    // Pass 1: fluid_watercolor_velocity_step
    for (let y = 0; y < height; y += 1) {
      const yU = y > 0 ? y - 1 : 0;
      const yD = y + 1 < height ? y + 1 : height - 1;
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        const off = idx * 4;
        if (cellIn[off]! <= p.wetEps) {
          velMid[idx * 2] = 0;
          velMid[idx * 2 + 1] = 0;
          continue;
        }
        const xL = x > 0 ? x - 1 : 0;
        const xR = x + 1 < width ? x + 1 : width - 1;
        const idxL = (y * width + xL) * 4;
        const idxR = (y * width + xR) * 4;
        const idxU = (yU * width + x) * 4;
        const idxD = (yD * width + x) * 4;

        const etaL = Math.fround(cellIn[idxL]! + p.paperSlopeCoupling * paperIn[idxL]!);
        const etaR = Math.fround(cellIn[idxR]! + p.paperSlopeCoupling * paperIn[idxR]!);
        const etaU = Math.fround(cellIn[idxU]! + p.paperSlopeCoupling * paperIn[idxU]!);
        const etaD = Math.fround(cellIn[idxD]! + p.paperSlopeCoupling * paperIn[idxD]!);

        const ax = Math.fround(p.gravityX - p.pressureStrength * Math.fround(0.5 * (etaR - etaL)));
        const ay = Math.fround(p.gravityY - p.pressureStrength * Math.fround(0.5 * (etaD - etaU)));
        const valley = Math.fround(1 - paperIn[off]!);
        const damp = Math.fround(1 / (1 + p.dt * (p.viscosity + p.fiberDrag * valley)));

        velMid[idx * 2] = Math.fround(clamp((cellIn[off + 1]! + p.dt * ax) * damp, -p.maxSpeed, p.maxSpeed));
        velMid[idx * 2 + 1] = Math.fround(clamp((cellIn[off + 2]! + p.dt * ay) * damp, -p.maxSpeed, p.maxSpeed));
      }
    }

    // Pass 2: fluid_watercolor_transport_step
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        const off = idx * 4;
        let netWater = 0;
        let netPigment = 0;

        if (x + 1 < width) {
          const [fw, fp] = computeFaceFluxCpu(cellIn, paperIn, velMid, idx, idx + 1, 1, 0, p);
          netWater = Math.fround(netWater - fw);
          netPigment = Math.fround(netPigment - fp);
        }
        if (x > 0) {
          const [fw, fp] = computeFaceFluxCpu(cellIn, paperIn, velMid, idx, idx - 1, -1, 0, p);
          netWater = Math.fround(netWater - fw);
          netPigment = Math.fround(netPigment - fp);
        }
        if (y + 1 < height) {
          const [fw, fp] = computeFaceFluxCpu(cellIn, paperIn, velMid, idx, idx + width, 0, 1, p);
          netWater = Math.fround(netWater - fw);
          netPigment = Math.fround(netPigment - fp);
        }
        if (y > 0) {
          const [fw, fp] = computeFaceFluxCpu(cellIn, paperIn, velMid, idx, idx - width, 0, -1, p);
          netWater = Math.fround(netWater - fw);
          netPigment = Math.fround(netPigment - fp);
        }

        const waterAfter = Math.fround(Math.max(0, cellIn[off]! + netWater));
        const pigmentAfter = Math.fround(Math.max(0, cellIn[off + 3]! + netPigment));
        const evap = Math.fround(Math.min(waterAfter, p.dt * p.evaporationRate));
        const waterPostEvap = Math.fround(waterAfter - evap);

        const h = paperIn[off]!;
        const depositedPrev = paperIn[off + 1]!;
        const absorbPrev = paperIn[off + 2]!;
        const poreCap = paperIn[off + 3]!;

        const absorbDelta = Math.fround(Math.min(waterPostEvap, p.dt * p.absorptionRate * Math.max(0, poreCap - absorbPrev)));
        const waterFinal = Math.fround(waterPostEvap - absorbDelta);
        const absorbFinal = Math.fround(Math.max(0, absorbPrev + absorbDelta - p.dt * p.evaporationRate * 0.35));

        const valley = Math.fround(1 - h);
        const shallowBoost = Math.fround(1 + 0.5 * (1 - clamp(waterAfter, 0, 1)));
        const settleFrac = Math.fround(
          clamp(p.dt * p.granulationRate * (0.05 + 1.95 * valley * valley) * shallowBoost, 0, 0.95),
        );
        const evapRatio = waterAfter > p.wetEps ? Math.fround(evap / waterAfter) : 0;
        const depositDelta = Math.fround(pigmentAfter * clamp(settleFrac + evapRatio * 0.65, 0, 1));

        cellOut[off] = waterFinal;
        cellOut[off + 1] = waterFinal > p.wetEps ? velMid[idx * 2]! : 0;
        cellOut[off + 2] = waterFinal > p.wetEps ? velMid[idx * 2 + 1]! : 0;
        cellOut[off + 3] = Math.fround(pigmentAfter - depositDelta);

        paperOut[off] = h;
        paperOut[off + 1] = Math.fround(depositedPrev + depositDelta);
        paperOut[off + 2] = absorbFinal;
        paperOut[off + 3] = poreCap;
      }
    }

    grid.cells = cellOut;
    grid.cellsScratch = cellIn;
    grid.paper = paperOut;
    grid.paperScratch = paperIn;
    grid.stepCount += 1;
  }
}

/** 수채화 시뮬레이션 격자를 Beer-Lambert 감산 투과 + 종이 요철 명암으로 RGBA 버퍼에 합성한다. */
export function renderFluidWatercolorRgba(
  grid: FluidWatercolorGrid,
  options?: FluidWatercolorRgbaRenderOptions,
): FluidWatercolorRgbaFrame {
  const { width, height, cells, paper } = grid;
  const pigment = options?.pigmentColor ?? grid.pigmentColor;
  const paperTint = options?.paperTintRgb ?? grid.paperTintRgb;
  const reliefShading = clamp(options?.reliefShading ?? 0.08, 0, 0.25);
  const gain = clamp(options?.pigmentAbsorptionGain ?? 1.85, 0.2, 6);

  const absR = 1 - clamp(pigment.r, 0.02, 0.98);
  const absG = 1 - clamp(pigment.g, 0.02, 0.98);
  const absB = 1 - clamp(pigment.b, 0.02, 0.98);

  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const off = idx * 4;
      const h = paper[off]!;
      const density = (cells[off + 3]! + paper[off + 1]! * 1.15) * gain;

      const xL = x > 0 ? x - 1 : 0;
      const yU = y > 0 ? y - 1 : 0;
      const slope = (h - paper[(y * width + xL) * 4]!) + (h - paper[(yU * width + x) * 4]!);
      const shade = 1 + clamp(slope * reliefShading * 2.5, -reliefShading, reliefShading);

      data[off] = Math.round(clamp(paperTint[0] * Math.exp(-absR * density) * shade, 0, 1) * 255);
      data[off + 1] = Math.round(clamp(paperTint[1] * Math.exp(-absG * density) * shade, 0, 1) * 255);
      data[off + 2] = Math.round(clamp(paperTint[2] * Math.exp(-absB * density) * shade, 0, 1) * 255);
      data[off + 3] = 255;
    }
  }
  return { width, height, data };
}

/** 보존량·중력 질량중심·종이 골짜기 과립화·가장자리 백런 비율을 정량 측정한다. */
export function measureFluidWatercolorDiagnostics(grid: FluidWatercolorGrid): FluidWatercolorDiagnostics {
  const { width, height, cells, paper } = grid;
  let totalSurfaceWater = 0;
  let totalAbsorbedWater = 0;
  let totalMobilePigment = 0;
  let totalDepositedPigment = 0;
  let wetCellCount = 0;
  let weightedX = 0;
  let weightedY = 0;
  let valleySum = 0;
  let valleyCount = 0;
  let peakSum = 0;
  let peakCount = 0;
  let edgeSum = 0;
  let edgeCount = 0;
  let interiorSum = 0;
  let interiorCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const off = idx * 4;
      const water = cells[off]!;
      const mobile = cells[off + 3]!;
      const h = paper[off]!;
      const deposited = paper[off + 1]!;
      const absorbed = paper[off + 2]!;
      const totalPigCell = mobile + deposited;

      totalSurfaceWater += water;
      totalAbsorbedWater += absorbed;
      totalMobilePigment += mobile;
      totalDepositedPigment += deposited;
      if (water > 1e-4) wetCellCount += 1;

      if (totalPigCell > 1e-5) {
        weightedX += x * totalPigCell;
        weightedY += y * totalPigCell;
        if (h < 0.42) {
          valleySum += deposited;
          valleyCount += 1;
        } else if (h > 0.58) {
          peakSum += deposited;
          peakCount += 1;
        }

        let nearDryEdge = false;
        if (x > 0 && cells[(idx - 1) * 4]! < water * 0.45) nearDryEdge = true;
        if (x + 1 < width && cells[(idx + 1) * 4]! < water * 0.45) nearDryEdge = true;
        if (y > 0 && cells[(idx - width) * 4]! < water * 0.45) nearDryEdge = true;
        if (y + 1 < height && cells[(idx + width) * 4]! < water * 0.45) nearDryEdge = true;

        if (water > 0.03) {
          if (nearDryEdge) {
            edgeSum += totalPigCell;
            edgeCount += 1;
          } else {
            interiorSum += totalPigCell;
            interiorCount += 1;
          }
        }
      }
    }
  }

  const totalPigment = totalMobilePigment + totalDepositedPigment;
  const valleyPigmentMean = valleyCount > 0 ? valleySum / valleyCount : 0;
  const peakPigmentMean = peakCount > 0 ? peakSum / peakCount : 0;
  const edgeRingPigmentMean = edgeCount > 0 ? edgeSum / edgeCount : 0;
  const interiorPigmentMean = interiorCount > 0 ? interiorSum / interiorCount : 0;

  return {
    stepCount: grid.stepCount,
    totalSurfaceWater,
    totalAbsorbedWater,
    totalWater: totalSurfaceWater + totalAbsorbedWater,
    totalMobilePigment,
    totalDepositedPigment,
    totalPigment,
    wetCellCount,
    pigmentCenterOfMass: {
      x: totalPigment > 1e-8 ? weightedX / totalPigment : width * 0.5,
      y: totalPigment > 1e-8 ? weightedY / totalPigment : height * 0.5,
    },
    valleyPigmentMean,
    peakPigmentMean,
    valleyToPeakGranulationRatio: peakPigmentMean > 1e-6 ? valleyPigmentMean / peakPigmentMean : 0,
    edgeRingPigmentMean,
    interiorPigmentMean,
    edgeBackrunRatio: interiorPigmentMean > 1e-6 ? edgeRingPigmentMean / interiorPigmentMean : 0,
  };
}
