/**
 * Wave 112 — 동양 수묵·한국화 화선지(Hanji) 이방성 모세관 발묵·파묵·갈필 물리 솔버.
 *
 * - 결정론적 화선지 닥섬유 기질 생성기(지표 기복, 이방성 투과도, 흡수율)
 * - 3-필드(유동 수분 · 현탁 탄소 · 섬유 흡착 탄소) 보존형 유한체적(FV) 모세관 솔버
 * - 수분 선행·탄소 지연 크로마토그래피 분리(발묵 테두리) 및 습지 파묵 확산 모델
 * - 엄격한 CFL 안정성 클램핑 및 총 탄소 질량 보존 검증
 */

import {
  getKoreanInkTechniqueConfig,
  SIZING_ABSORBENCY_DEFAULTS,
  type HanjiInkCanvas,
  type HanjiInkSimulationAudit,
  type HanjiPaperSubstrate,
  type HanjiRadialProfileSample,
  type HanjiSizingGrade,
  type HanjiStepSummary,
  type HanjiSubstrateOptions,
  type KoreanInkTechniqueConfig,
  type KoreanInkTechniquePreset,
  type SumiCarbonMassConservationReport,
  type SumiInkDropRecord,
  type SumiInkDropSpec,
} from "./hanji-physics-types";

export {
  getKoreanInkTechniqueConfig,
  type HanjiInkCanvas,
  type HanjiInkSimulationAudit,
  type HanjiPaperSubstrate,
  type HanjiRadialProfileSample,
  type HanjiSizingGrade,
  type HanjiStepSummary,
  type HanjiSubstrateOptions,
  type KoreanInkTechniqueConfig,
  type KoreanInkTechniquePreset,
  type SumiCarbonMassConservationReport,
  type SumiInkDropRecord,
  type SumiInkDropSpec,
} from "./hanji-physics-types";

const EPSILON = 1e-7;
const MAX_SUBSTEPS_PER_STEP = 6;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

/** 결정론적 32비트 Mulberry32 난수 생성기. */
export function createSeededRng(seed: number): () => number {
  let state = (Math.floor(Number.isFinite(seed) ? seed : 0) >>> 0) || 0x6d2b79f5;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fbm2D(x: number, y: number, seed: number): number {
  let sum = 0;
  let amp = 0.54;
  let freq = 1;
  let norm = 0;
  for (let oct = 0; oct < 3; oct += 1) {
    const sx = x * freq;
    const sy = y * freq;
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const fx = sx - x0;
    const fy = sy - y0;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const s = seed + oct * 97;
    const nx0 = hash2D(x0, y0, s) + (hash2D(x0 + 1, y0, s) - hash2D(x0, y0, s)) * ux;
    const nx1 = hash2D(x0, y0 + 1, s) + (hash2D(x0 + 1, y0 + 1, s) - hash2D(x0, y0 + 1, s)) * ux;
    sum += (nx0 + (nx1 - nx0) * uy) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** 결정론적 화선지(Hanji) 이방성 닥섬유 기질을 생성한다. */
export function createHanjiPaperSubstrate(
  width: number,
  height: number,
  seed: number,
  options: HanjiSubstrateOptions = {},
): HanjiPaperSubstrate {
  const safeW = Math.max(8, Math.floor(clampNumber(width, 8, 512)));
  const safeH = Math.max(8, Math.floor(clampNumber(height, 8, 512)));
  const safeSeed = Math.floor(Number.isFinite(seed) ? seed : 112);
  const sizingGrade: HanjiSizingGrade = options.sizingGrade ?? "saengji-raw";
  const fiberAngleRad = Number.isFinite(options.fiberAngleRad) ? (options.fiberAngleRad as number) : 0;
  const fiberAnisotropy = clampNumber(options.fiberAnisotropy ?? 1.25, 0.25, 4.0);
  const roughness = clampNumber(options.fiberRoughness ?? 0.52, 0.05, 1.0);
  const absorbencyMean = clampNumber(
    options.absorbencyMean ?? SIZING_ABSORBENCY_DEFAULTS[sizingGrade],
    0.1,
    0.98,
  );

  const cellCount = safeW * safeH;
  const paperHeight = new Float32Array(cellCount);
  const fiberPermX = new Float32Array(cellCount);
  const fiberPermY = new Float32Array(cellCount);
  const absorbency = new Float32Array(cellCount);
  const strandBoost = new Float32Array(cellCount);

  const cosA = Math.cos(fiberAngleRad);
  const sinA = Math.sin(fiberAngleRad);
  const rng = createSeededRng(safeSeed ^ 0x51a7b3);
  const strandCount = Math.max(12, Math.floor(options.strandCount ?? Math.min(240, Math.round((safeW + safeH) * 1.4))));

  for (let s = 0; s < strandCount; s += 1) {
    const sx = rng() * safeW;
    const sy = rng() * safeH;
    const angle = fiberAngleRad + (rng() - 0.5) * 0.45;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const steps = Math.max(4, Math.ceil(6 + rng() * Math.max(8, Math.min(safeW, safeH) * 0.45)));
    const strength = 0.22 + rng() * 0.35;
    for (let k = 0; k <= steps; k += 1) {
      const px = Math.round(sx + dx * k);
      const py = Math.round(sy + dy * k);
      if (px >= 0 && px < safeW && py >= 0 && py < safeH) {
        const idx = py * safeW + px;
        strandBoost[idx] = Math.min(1, strandBoost[idx] + strength * 0.45);
      }
    }
  }

  const hasExplicitPerms =
    typeof options.basePermX === "number" &&
    Number.isFinite(options.basePermX) &&
    typeof options.basePermY === "number" &&
    Number.isFinite(options.basePermY);
  const primary = Math.sqrt(fiberAnisotropy);
  const secondary = 1 / primary;
  const macroPermX = hasExplicitPerms
    ? clampNumber(options.basePermX as number, 0.05, 8.0)
    : cosA * cosA * primary + sinA * sinA * secondary;
  const macroPermY = hasExplicitPerms
    ? clampNumber(options.basePermY as number, 0.05, 8.0)
    : sinA * sinA * primary + cosA * cosA * secondary;

  let sumHeight = 0;
  let sumPermX = 0;
  let sumPermY = 0;
  let sumAbs = 0;

  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const idx = y * safeW + x;
      const stretched = fbm2D((x * cosA + y * sinA) * 0.14, (-x * sinA + y * cosA) * 0.36, safeSeed + 17);
      const fine = fbm2D(x * 0.48, y * 0.48, safeSeed + 313);
      const h = clampNumber(
        0.5 + (stretched - 0.5) * 0.82 * roughness + (fine - 0.5) * 0.55 * roughness + (strandBoost[idx] - 0.18) * 0.42 * roughness,
        0,
        1,
      );
      const px = clampNumber(macroPermX * (0.84 + 0.32 * stretched), 0.03, 10.0);
      const py = clampNumber(macroPermY * (0.84 + 0.32 * fine), 0.03, 10.0);
      const localAbs = clampNumber(absorbencyMean * (1 - 0.32 * (h - 0.5)) * (0.9 + 0.2 * fine), 0.05, 1.0);

      paperHeight[idx] = h;
      fiberPermX[idx] = px;
      fiberPermY[idx] = py;
      absorbency[idx] = localAbs;
      sumHeight += h;
      sumPermX += px;
      sumPermY += py;
      sumAbs += localAbs;
    }
  }

  return {
    width: safeW,
    height: safeH,
    seed: safeSeed,
    sizingGrade,
    fiberAngleRad,
    fiberAnisotropy,
    paperHeight,
    fiberPermX,
    fiberPermY,
    absorbency,
    meanPermX: sumPermX / cellCount,
    meanPermY: sumPermY / cellCount,
    meanPaperHeight: sumHeight / cellCount,
    meanAbsorbency: sumAbs / cellCount,
  };
}

/** 3-필드(수분 · 현탁 탄소 · 흡착 탄소) 화선지 먹물 캔버스를 초기화한다. */
export function createHanjiInkCanvas(
  substrate: HanjiPaperSubstrate,
  preset: KoreanInkTechniquePreset = "balmuk-wet-bloom",
  configOverrides: Partial<KoreanInkTechniqueConfig> = {},
): HanjiInkCanvas {
  const base = getKoreanInkTechniqueConfig(preset);
  const config: KoreanInkTechniqueConfig = {
    ...base,
    ...configOverrides,
    preset,
    cflSafetyFactor: clampNumber(configOverrides.cflSafetyFactor ?? base.cflSafetyFactor, 0.05, 0.24),
  };
  const count = substrate.width * substrate.height;
  return {
    substrate,
    preset,
    config,
    waterField: new Float32Array(count),
    carbonSuspensionField: new Float32Array(count),
    depositedCarbonField: new Float32Array(count),
    fluxWaterX: new Float32Array(count),
    fluxCarbonX: new Float32Array(count),
    fluxWaterY: new Float32Array(count),
    fluxCarbonY: new Float32Array(count),
    outflowWater: new Float32Array(count),
    outflowCarbon: new Float32Array(count),
    scaleWater: new Float32Array(count),
    scaleCarbon: new Float32Array(count),
    dropHistory: [],
    stepCount: 0,
    elapsedTime: 0,
    depositedCarbonMassTotal: 0,
    initialWaterMassTotal: 0,
    lastCflNumber: 0,
    maxCflNumber: 0,
    cflClampCount: 0,
  };
}

/** 화선지 캔버스에 먹물 또는 물방울을 떨어뜨리고 정확한 누적 질량을 기록한다. */
export function depositSumiInkDrop(canvas: HanjiInkCanvas, drop: SumiInkDropSpec): SumiInkDropRecord {
  const { width, height } = canvas.substrate;
  const cx = clampNumber(drop.x, 0, width - 1);
  const cy = clampNumber(drop.y, 0, height - 1);
  const radius = clampNumber(drop.radius, 0.75, Math.max(width, height));
  const waterAmt = clampNumber(drop.waterAmount, 0, 10);
  const carbonAmt = clampNumber(drop.carbonAmount, 0, 10);
  const profile = drop.profile ?? "gaussian";

  const scanR = profile === "flat-disc" ? Math.ceil(radius) + 1 : Math.ceil(radius * 2.4) + 1;
  const minX = Math.max(0, Math.floor(cx - scanR));
  const maxX = Math.min(width - 1, Math.ceil(cx + scanR));
  const minY = Math.max(0, Math.floor(cy - scanR));
  const maxY = Math.min(height - 1, Math.ceil(cy + scanR));
  const invTwoSigmaSq = 1 / Math.max(0.5 * radius * radius, EPSILON);

  let addedWaterMass = 0;
  let addedCarbonMass = 0;
  let affectedCells = 0;

  for (let y = minY; y <= maxY; y += 1) {
    const dy = y - cy;
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      const distSq = dx * dx + dy * dy;
      let weight = 0;
      if (profile === "flat-disc") {
        const dist = Math.sqrt(distSq);
        weight = dist <= radius ? 1 : dist < radius + 1 ? radius + 1 - dist : 0;
      } else if (distSq <= scanR * scanR) {
        const g = Math.exp(-distSq * invTwoSigmaSq);
        weight = g >= 1e-4 ? g : 0;
      }
      if (weight <= 0) continue;

      const idx = y * width + x;
      const prevW = canvas.waterField[idx];
      canvas.waterField[idx] = prevW + waterAmt * weight;
      addedWaterMass += canvas.waterField[idx] - prevW;

      const prevC = canvas.carbonSuspensionField[idx];
      canvas.carbonSuspensionField[idx] = prevC + carbonAmt * weight;
      addedCarbonMass += canvas.carbonSuspensionField[idx] - prevC;
      affectedCells += 1;
    }
  }

  canvas.initialWaterMassTotal += addedWaterMass;
  canvas.depositedCarbonMassTotal += addedCarbonMass;
  const record: SumiInkDropRecord = { x: cx, y: cy, radius, addedWaterMass, addedCarbonMass, affectedCells };
  canvas.dropHistory.push(record);
  return record;
}

function accumulateAxisFaceFluxes(canvas: HanjiInkCanvas, axis: "x" | "y", subDt: number): void {
  const { width, height, paperHeight, fiberPermX, fiberPermY, absorbency } = canvas.substrate;
  const cfg = canvas.config;
  const perm = axis === "x" ? fiberPermX : fiberPermY;
  const fluxW = axis === "x" ? canvas.fluxWaterX : canvas.fluxWaterY;
  const fluxC = axis === "x" ? canvas.fluxCarbonX : canvas.fluxCarbonY;
  const stride = axis === "x" ? 1 : width;
  const maxX = axis === "x" ? width - 1 : width;
  const maxY = axis === "y" ? height - 1 : height;

  for (let y = 0; y < maxY; y += 1) {
    const row = y * width;
    for (let x = 0; x < maxX; x += 1) {
      const i = row + x;
      const j = i + stride;
      const wi = canvas.waterField[i];
      const wj = canvas.waterField[j];
      const si = canvas.carbonSuspensionField[i];
      const sj = canvas.carbonSuspensionField[j];
      const kFace = (2 * perm[i] * perm[j]) / (perm[i] + perm[j] + EPSILON);

      let fw = 0;
      const dw = wi - wj;
      if (dw > 0 && wi > cfg.capillaryThreshold) {
        const suction = (0.65 + 0.35 * absorbency[j]) * (0.85 + 0.3 * (1 - paperHeight[j]));
        fw = cfg.waterCapillaryDiffusivity * kFace * subDt * dw * suction;
      } else if (dw < 0 && wj > cfg.capillaryThreshold) {
        const suction = (0.65 + 0.35 * absorbency[i]) * (0.85 + 0.3 * (1 - paperHeight[i]));
        fw = cfg.waterCapillaryDiffusivity * kFace * subDt * dw * suction;
      }

      let fc = 0;
      if (fw > 0 && si > 0) {
        const wf = Math.min(0.95, cfg.carbonAdvectionCoupling * (1 + cfg.wetMobilityBoost * Math.min(1, wj / 0.32)));
        fc += wf * fw * (si / Math.max(wi, EPSILON));
      } else if (fw < 0 && sj > 0) {
        const wf = Math.min(0.95, cfg.carbonAdvectionCoupling * (1 + cfg.wetMobilityBoost * Math.min(1, wi / 0.32)));
        fc += wf * fw * (sj / Math.max(wj, EPSILON));
      }

      const wBridge = wi < wj ? wi : wj;
      if (wBridge > 0.015) {
        const diffBoost = 1 + cfg.wetMobilityBoost * Math.min(1.8, wBridge / 0.32);
        fc += cfg.carbonBrownianDiffusivity * kFace * subDt * diffBoost * (si - sj);
      }

      fluxW[i] = fw;
      fluxC[i] = fc;
      if (fw > 0) canvas.outflowWater[i] += fw;
      else if (fw < 0) canvas.outflowWater[j] -= fw;
      if (fc > 0) canvas.outflowCarbon[i] += fc;
      else if (fc < 0) canvas.outflowCarbon[j] -= fc;
    }
  }
}

function applyAxisFaceFluxes(canvas: HanjiInkCanvas, axis: "x" | "y"): void {
  const { width, height } = canvas.substrate;
  const fluxW = axis === "x" ? canvas.fluxWaterX : canvas.fluxWaterY;
  const fluxC = axis === "x" ? canvas.fluxCarbonX : canvas.fluxCarbonY;
  const stride = axis === "x" ? 1 : width;
  const maxX = axis === "x" ? width - 1 : width;
  const maxY = axis === "y" ? height - 1 : height;

  for (let y = 0; y < maxY; y += 1) {
    const row = y * width;
    for (let x = 0; x < maxX; x += 1) {
      const i = row + x;
      const j = i + stride;
      const rawFw = fluxW[i];
      const fw = rawFw >= 0 ? rawFw * canvas.scaleWater[i] : rawFw * canvas.scaleWater[j];
      canvas.waterField[i] -= fw;
      canvas.waterField[j] += fw;

      const rawFc = fluxC[i];
      const fc = rawFc >= 0 ? rawFc * canvas.scaleCarbon[i] : rawFc * canvas.scaleCarbon[j];
      canvas.carbonSuspensionField[i] -= fc;
      canvas.carbonSuspensionField[j] += fc;
    }
  }
}

function executeSingleCapillarySubstep(canvas: HanjiInkCanvas, subDt: number): void {
  const { width, height, paperHeight, absorbency } = canvas.substrate;
  const { flocculationRate, hydrationPinningSuppression, evaporationRate } = canvas.config;
  const totalCells = width * height;

  canvas.outflowWater.fill(0);
  canvas.outflowCarbon.fill(0);
  accumulateAxisFaceFluxes(canvas, "x", subDt);
  accumulateAxisFaceFluxes(canvas, "y", subDt);

  for (let i = 0; i < totalCells; i += 1) {
    const maxW = canvas.waterField[i] * 0.9;
    canvas.scaleWater[i] = canvas.outflowWater[i] > maxW && canvas.outflowWater[i] > EPSILON ? maxW / canvas.outflowWater[i] : 1;
    const maxC = canvas.carbonSuspensionField[i] * 0.9;
    canvas.scaleCarbon[i] = canvas.outflowCarbon[i] > maxC && canvas.outflowCarbon[i] > EPSILON ? maxC / canvas.outflowCarbon[i] : 1;
  }

  applyAxisFaceFluxes(canvas, "x");
  applyAxisFaceFluxes(canvas, "y");

  for (let i = 0; i < totalCells; i += 1) {
    const w = canvas.waterField[i] < 0 ? 0 : canvas.waterField[i];
    const s = canvas.carbonSuspensionField[i] < 0 ? 0 : canvas.carbonSuspensionField[i];
    if (s > 0) {
      const shield = 1 / (1 + hydrationPinningSuppression * w);
      let capture = flocculationRate * (0.55 + 0.9 * absorbency[i]) * (0.75 + 0.5 * paperHeight[i]) * shield * subDt;
      if (w < 0.015) capture = Math.max(capture, Math.min(1, 0.32 * subDt * 6));
      const delta = s * clampNumber(capture, 0, 1);
      canvas.carbonSuspensionField[i] = s - delta;
      canvas.depositedCarbonField[i] += delta;
    } else {
      canvas.carbonSuspensionField[i] = 0;
    }
    const evap = evaporationRate * subDt * (0.72 + 0.28 * (1 - absorbency[i]));
    canvas.waterField[i] = w > evap ? w - evap : 0;
  }
}

/** 화선지 3-필드 이방성 모세관 시뮬레이션을 지정 스텝만큼 전진한다. */
export function stepHanjiCapillarySimulation(
  canvas: HanjiInkCanvas,
  steps = 1,
  dt?: number,
): HanjiStepSummary {
  const safeSteps = Math.max(0, Math.floor(clampNumber(steps, 0, 500)));
  const requestedDt = clampNumber(dt ?? canvas.config.defaultDt, 0.001, 100);
  const { fiberPermX, fiberPermY } = canvas.substrate;

  let maxPerm = 0.1;
  for (let i = 0; i < fiberPermX.length; i += 1) {
    if (fiberPermX[i] > maxPerm) maxPerm = fiberPermX[i];
    if (fiberPermY[i] > maxPerm) maxPerm = fiberPermY[i];
  }

  const maxDiff = Math.max(
    canvas.config.waterCapillaryDiffusivity * 1.15,
    canvas.config.carbonBrownianDiffusivity * (1 + canvas.config.wetMobilityBoost * 1.8),
    0.05,
  );
  const maxStableSubDt = canvas.config.cflSafetyFactor / (4 * maxDiff * maxPerm);
  const idealSubsteps = Math.max(1, Math.ceil(requestedDt / maxStableSubDt));
  const substeps = Math.min(MAX_SUBSTEPS_PER_STEP, idealSubsteps);
  const wasClamped = idealSubsteps > MAX_SUBSTEPS_PER_STEP;
  const subDt = Math.min(requestedDt / substeps, maxStableSubDt);
  const stepCfl = 4 * maxDiff * maxPerm * subDt;

  let clampedSteps = 0;
  for (let s = 0; s < safeSteps; s += 1) {
    for (let k = 0; k < substeps; k += 1) executeSingleCapillarySubstep(canvas, subDt);
    canvas.stepCount += 1;
    canvas.elapsedTime += subDt * substeps;
    canvas.lastCflNumber = stepCfl;
    if (stepCfl > canvas.maxCflNumber) canvas.maxCflNumber = stepCfl;
    if (wasClamped) {
      canvas.cflClampCount += 1;
      clampedSteps += 1;
    }
  }

  return {
    stepsExecuted: safeSteps,
    lastCflNumber: canvas.lastCflNumber,
    maxCflNumber: canvas.maxCflNumber,
    cflClampedSteps: clampedSteps,
    elapsedTime: canvas.elapsedTime,
  };
}

/** 전체 캔버스의 유동 탄소 + 흡착 탄소 총질량 보존 오차와 수치 건전성을 검증한다. */
export function measureSumiCarbonMassConservation(canvas: HanjiInkCanvas): SumiCarbonMassConservationReport {
  const { waterField, carbonSuspensionField, depositedCarbonField } = canvas;
  let mobileMass = 0;
  let depositedMass = 0;
  let nonFiniteCellCount = 0;
  let negativeCellCount = 0;

  for (let i = 0; i < carbonSuspensionField.length; i += 1) {
    const w = waterField[i];
    const s = carbonSuspensionField[i];
    const d = depositedCarbonField[i];
    if (!Number.isFinite(w) || !Number.isFinite(s) || !Number.isFinite(d)) {
      nonFiniteCellCount += 1;
      continue;
    }
    if (w < -1e-6 || s < -1e-6 || d < -1e-6) negativeCellCount += 1;
    mobileMass += s;
    depositedMass += d;
  }

  const expected = canvas.depositedCarbonMassTotal;
  const actual = mobileMass + depositedMass;
  const absoluteError = Math.abs(actual - expected);
  const relativeErrorPercent = expected > EPSILON ? (absoluteError / expected) * 100 : absoluteError > EPSILON ? 100 : 0;

  return {
    expectedTotalCarbonMass: expected,
    actualMobileCarbonMass: mobileMass,
    actualDepositedCarbonMass: depositedMass,
    actualTotalCarbonMass: actual,
    absoluteError,
    relativeErrorPercent,
    nonFiniteCellCount,
    negativeCellCount,
    conserved: relativeErrorPercent < 1.0 && nonFiniteCellCount === 0 && negativeCellCount === 0,
  };
}

/** 화선지 모세관 시뮬레이션의 발묵 번짐 반경, 크로마토그래피 띠 폭, 이방성 비율, 방사 프로파일을 감사한다. */
export function auditHanjiInkSimulation(
  canvas: HanjiInkCanvas,
  focusCenter?: { readonly x: number; readonly y: number },
): HanjiInkSimulationAudit {
  const { width, height, seed, sizingGrade } = canvas.substrate;
  const massConservation = measureSumiCarbonMassConservation(canvas);
  const lastDrop = canvas.dropHistory[canvas.dropHistory.length - 1];
  const carbonDensityGrid = new Float32Array(width * height);
  const waterDensityGrid = new Float32Array(width * height);

  let totalCarbon = 0;
  let sumCX = 0;
  let sumCY = 0;
  let maxCarbonDensity = 0;
  let maxWaterDensity = 0;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const w = Math.max(0, canvas.waterField[idx]);
      const c = Math.max(0, canvas.carbonSuspensionField[idx] + canvas.depositedCarbonField[idx]);
      waterDensityGrid[idx] = w;
      carbonDensityGrid[idx] = c;
      if (w > maxWaterDensity) maxWaterDensity = w;
      if (c > maxCarbonDensity) maxCarbonDensity = c;
      totalCarbon += c;
      sumCX += c * x;
      sumCY += c * y;
    }
  }

  const centerX = focusCenter?.x ?? (lastDrop ? lastDrop.x : totalCarbon > EPSILON ? sumCX / totalCarbon : (width - 1) * 0.5);
  const centerY = focusCenter?.y ?? (lastDrop ? lastDrop.y : totalCarbon > EPSILON ? sumCY / totalCarbon : (height - 1) * 0.5);

  let totalWater = 0;
  let waterR2 = 0;
  let carbonR2 = 0;
  let carbonX2 = 0;
  let carbonY2 = 0;
  const maxBins = Math.min(24, Math.ceil(Math.min(width, height) * 0.5));
  const binCount = new Float64Array(maxBins);
  const binW = new Float64Array(maxBins);
  const binMob = new Float64Array(maxBins);
  const binDep = new Float64Array(maxBins);

  for (let y = 0; y < height; y += 1) {
    const dy = y - centerY;
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const dx = x - centerX;
      const idx = row + x;
      const r2 = dx * dx + dy * dy;
      const w = waterDensityGrid[idx];
      const c = carbonDensityGrid[idx];
      totalWater += w;
      waterR2 += w * r2;
      carbonR2 += c * r2;
      carbonX2 += c * dx * dx;
      carbonY2 += c * dy * dy;
      const rBin = Math.floor(Math.sqrt(r2));
      if (rBin >= 0 && rBin < maxBins) {
        binCount[rBin] += 1;
        binW[rBin] += w;
        binMob[rBin] += Math.max(0, canvas.carbonSuspensionField[idx]);
        binDep[rBin] += Math.max(0, canvas.depositedCarbonField[idx]);
      }
    }
  }

  const waterSpreadRadius = totalWater > EPSILON ? Math.sqrt((2 * waterR2) / totalWater) : 0;
  const carbonSpreadRadius = totalCarbon > EPSILON ? Math.sqrt((2 * carbonR2) / totalCarbon) : 0;
  const xSpreadRadius = totalCarbon > EPSILON ? 2 * Math.sqrt(carbonX2 / totalCarbon) : 0;
  const ySpreadRadius = totalCarbon > EPSILON ? 2 * Math.sqrt(carbonY2 / totalCarbon) : 0;

  const radialProfile: HanjiRadialProfileSample[] = [];
  for (let r = 0; r < maxBins; r += 1) {
    const n = binCount[r] > 0 ? binCount[r] : 1;
    const meanMobileCarbon = binMob[r] / n;
    const meanDepositedCarbon = binDep[r] / n;
    radialProfile.push({
      radiusCells: r,
      meanWater: binW[r] / n,
      meanMobileCarbon,
      meanDepositedCarbon,
      meanTotalCarbon: meanMobileCarbon + meanDepositedCarbon,
    });
  }

  return {
    width,
    height,
    seed,
    preset: canvas.preset,
    presetLabelKo: canvas.config.labelKo,
    sizingGrade,
    stepCount: canvas.stepCount,
    elapsedTime: canvas.elapsedTime,
    cflNumber: canvas.lastCflNumber,
    maxCflNumber: canvas.maxCflNumber,
    cflStable: canvas.maxCflNumber <= canvas.config.cflSafetyFactor + 1e-6,
    cflClampCount: canvas.cflClampCount,
    massConservation,
    initialDropRadius: lastDrop ? lastDrop.radius : 0,
    centerX,
    centerY,
    waterSpreadRadius,
    carbonSpreadRadius,
    chromatographicHaloWidth: Math.max(0, waterSpreadRadius - carbonSpreadRadius),
    xSpreadRadius,
    ySpreadRadius,
    anisotropySpreadRatio: xSpreadRadius / Math.max(ySpreadRadius, EPSILON),
    maxCarbonDensity,
    maxWaterDensity,
    radialProfile,
    carbonDensityGrid,
    waterDensityGrid,
  };
}
