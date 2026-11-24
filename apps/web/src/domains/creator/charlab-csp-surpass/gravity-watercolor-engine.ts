/**
 * Wave 39E — Rebelle 돌파 기울기 중력 수채화 + 종이 요철 그래뉼레이션 + 1클릭 드라이어 엔진.
 */

import type { Vec2 } from "./quickshape-colordrop-engine";

export interface WetPaintGrid {
  readonly width: number;
  readonly height: number;
  readonly pigment: Float32Array;
  readonly water: Float32Array;
  readonly driedPigment: Float32Array;
  readonly paperHeight: Float32Array;
  readonly stepCount: number;
}

export interface GravityWatercolorStepConfig {
  readonly gx: number;
  readonly gy: number;
  readonly paperGranulationStrength?: number;
  readonly diffusionRate?: number;
  readonly evaporationRate?: number;
  readonly dt?: number;
}

export interface WetPaintSummary {
  readonly totalWater: number;
  readonly totalWetPigment: number;
  readonly totalDriedPigment: number;
  readonly moisturePercent: number;
  readonly isCompletelyDry: boolean;
  readonly centerOfMass: Vec2;
}

export interface GravityWatercolorStepResult {
  readonly grid: WetPaintGrid;
  readonly summary: WetPaintSummary;
  readonly centerShift: Vec2;
  readonly valleyPoolingRatio: number;
}

const EPS = 1e-9;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function roundTo(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Rebelle급 중력 수채화용 종이 요철 포함 습윤 격자 생성. */
export function createWetPaintGrid(width = 20, height = 20): WetPaintGrid {
  const size = width * height;
  const paperHeight = new Float32Array(size);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const h =
        0.5 +
        0.28 * Math.sin(x * 0.95 + y * 0.4) * Math.cos(y * 0.85 - x * 0.3) +
        0.18 * Math.sin((x + y) * 1.45);
      paperHeight[y * width + x] = roundTo(clamp(h, 0.05, 0.95), 4);
    }
  }
  return {
    width,
    height,
    pigment: new Float32Array(size),
    water: new Float32Array(size),
    driedPigment: new Float32Array(size),
    paperHeight,
    stepCount: 0,
  };
}

/** 습윤 격자에 물감과 수분을 도포한다. */
export function depositWetWatercolor(
  grid: WetPaintGrid,
  cx: number,
  cy: number,
  radius: number,
  pigmentAmount = 0.85,
  waterAmount = 0.9,
): WetPaintGrid {
  const pigment = new Float32Array(grid.pigment);
  const water = new Float32Array(grid.water);
  const driedPigment = new Float32Array(grid.driedPigment);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= radius) {
        const falloff = 1 - (d / Math.max(0.5, radius)) * 0.55;
        const idx = y * grid.width + x;
        pigment[idx] = clamp(pigment[idx]! + pigmentAmount * falloff, 0, 1);
        water[idx] = clamp(water[idx]! + waterAmount * falloff, 0, 1);
      }
    }
  }
  return { ...grid, pigment, water, driedPigment };
}

/** 습윤 격자 통계(총 수분, 습윤/건조 안료, 안료 무게중심) 요약. */
export function summarizeWetPaintGrid(grid: WetPaintGrid): WetPaintSummary {
  let totalWater = 0;
  let totalWet = 0;
  let totalDried = 0;
  let weightedX = 0;
  let weightedY = 0;

  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const idx = y * grid.width + x;
      const w = grid.water[idx]!;
      const p = grid.pigment[idx]!;
      const d = grid.driedPigment[idx]!;
      totalWater += w;
      totalWet += p;
      totalDried += d;
      weightedX += x * (p + d);
      weightedY += y * (p + d);
    }
  }

  const totalMass = totalWet + totalDried;
  const centerOfMass: Vec2 =
    totalMass > EPS
      ? { x: roundTo(weightedX / totalMass, 4), y: roundTo(weightedY / totalMass, 4) }
      : { x: grid.width * 0.5, y: grid.height * 0.5 };
  const moisturePercent =
    totalMass > EPS ? roundTo(clamp((totalWater / Math.max(EPS, totalMass)) * 100, 0, 100), 1) : 0;

  return {
    totalWater: roundTo(totalWater, 5),
    totalWetPigment: roundTo(totalWet, 5),
    totalDriedPigment: roundTo(totalDried, 5),
    moisturePercent: totalWater < 1e-6 ? 0 : moisturePercent,
    isCompletelyDry: totalWater < 1e-6,
    centerOfMass,
  };
}

/** Rebelle급 기기 기울기 (gx, gy) + 종이 요철 중력 수채화 이류(advection) 1스텝. */
export function stepGravityWatercolor(
  grid: WetPaintGrid,
  config: GravityWatercolorStepConfig,
): GravityWatercolorStepResult {
  const before = summarizeWetPaintGrid(grid);
  if (before.isCompletelyDry) {
    return { grid, summary: before, centerShift: { x: 0, y: 0 }, valleyPoolingRatio: 0 };
  }

  const { width, height } = grid;
  const dt = clamp(config.dt ?? 0.45, 0.05, 0.8);
  const gran = clamp(config.paperGranulationStrength ?? 0.32, 0, 0.8);
  const diffusion = clamp(config.diffusionRate ?? 0.08, 0, 0.25);
  const evap = clamp(config.evaporationRate ?? 0.02, 0, 0.25);

  const nextPigment = new Float32Array(grid.pigment);
  const nextWater = new Float32Array(grid.water);
  const nextDried = new Float32Array(grid.driedPigment);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const w = grid.water[idx]!;
      const p = grid.pigment[idx]!;
      if (w < 1e-4) continue;

      const gradX =
        (grid.paperHeight[y * width + Math.min(width - 1, x + 1)]! -
          grid.paperHeight[y * width + Math.max(0, x - 1)]!) *
        0.5;
      const gradY =
        (grid.paperHeight[Math.min(height - 1, y + 1) * width + x]! -
          grid.paperHeight[Math.max(0, y - 1) * width + x]!) *
        0.5;

      const vx = clamp(config.gx * 0.62 - gradX * gran, -0.85, 0.85);
      const vy = clamp(config.gy * 0.62 - gradY * gran, -0.85, 0.85);
      const mobility = clamp(w * dt, 0, 0.42);
      const fx = Math.abs(vx) * mobility;
      const fy = Math.abs(vy) * mobility;
      const totalOutFrac = Math.min(0.75, fx + fy + diffusion * w);
      const scale = fx + fy > EPS ? Math.min(1, totalOutFrac / (fx + fy + diffusion * w)) : 1;

      const flowX = fx * scale;
      const flowY = fy * scale;

      if (flowX > EPS) {
        const tIdx = y * width + clamp(x + (vx > 0 ? 1 : -1), 0, width - 1);
        if (tIdx !== idx) {
          nextPigment[idx] = Math.max(0, nextPigment[idx]! - p * flowX);
          nextWater[idx] = Math.max(0, nextWater[idx]! - w * flowX);
          nextPigment[tIdx] = clamp(nextPigment[tIdx]! + p * flowX, 0, 1.5);
          nextWater[tIdx] = clamp(nextWater[tIdx]! + w * flowX, 0, 1.5);
        }
      }
      if (flowY > EPS) {
        const tIdx = clamp(y + (vy > 0 ? 1 : -1), 0, height - 1) * width + x;
        if (tIdx !== idx) {
          nextPigment[idx] = Math.max(0, nextPigment[idx]! - p * flowY);
          nextWater[idx] = Math.max(0, nextWater[idx]! - w * flowY);
          nextPigment[tIdx] = clamp(nextPigment[tIdx]! + p * flowY, 0, 1.5);
          nextWater[tIdx] = clamp(nextWater[tIdx]! + w * flowY, 0, 1.5);
        }
      }

      const valleyFactor = clamp(1 - grid.paperHeight[idx]!, 0.1, 1);
      const settled = nextPigment[idx]! * evap * (0.5 + valleyFactor * 0.8);
      nextPigment[idx] = Math.max(0, nextPigment[idx]! - settled);
      nextDried[idx] = clamp(nextDried[idx]! + settled, 0, 1);
      nextWater[idx] = Math.max(0, nextWater[idx]! - evap * 0.45);
    }
  }

  for (let i = 0; i < nextPigment.length; i += 1) {
    nextPigment[i] = clamp(nextPigment[i]!, 0, 1);
    nextWater[i] = clamp(nextWater[i]!, 0, 1);
  }

  const nextGrid: WetPaintGrid = {
    ...grid,
    pigment: nextPigment,
    water: nextWater,
    driedPigment: nextDried,
    stepCount: grid.stepCount + 1,
  };
  const after = summarizeWetPaintGrid(nextGrid);

  let valleyMass = 0;
  let totalMass = 0;
  for (let i = 0; i < nextGrid.paperHeight.length; i += 1) {
    const m = nextGrid.pigment[i]! + nextGrid.driedPigment[i]!;
    totalMass += m;
    if (nextGrid.paperHeight[i]! < 0.5) valleyMass += m;
  }

  return {
    grid: nextGrid,
    summary: after,
    centerShift: {
      x: roundTo(after.centerOfMass.x - before.centerOfMass.x, 4),
      y: roundTo(after.centerOfMass.y - before.centerOfMass.y, 4),
    },
    valleyPoolingRatio: roundTo(totalMass > EPS ? valleyMass / totalMass : 0, 3),
  };
}

/** 1클릭 드라이어: 모든 습윤 수분을 0으로 고정하고 부유 안료를 즉시 건조층에 영구 정착한다. */
export function blowDry(grid: WetPaintGrid): {
  readonly grid: WetPaintGrid;
  readonly summary: WetPaintSummary;
} {
  const size = grid.width * grid.height;
  const driedPigment = new Float32Array(size);
  const pigment = new Float32Array(size);
  const water = new Float32Array(size);

  for (let i = 0; i < size; i += 1) {
    driedPigment[i] = clamp(grid.driedPigment[i]! + grid.pigment[i]!, 0, 1);
    pigment[i] = 0;
    water[i] = 0;
  }

  const driedGrid: WetPaintGrid = { ...grid, pigment, water, driedPigment };
  return { grid: driedGrid, summary: summarizeWetPaintGrid(driedGrid) };
}
