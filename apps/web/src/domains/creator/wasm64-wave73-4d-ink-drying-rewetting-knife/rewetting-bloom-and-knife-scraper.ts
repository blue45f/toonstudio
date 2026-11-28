/**
 * 물리 재습윤·콜리플라워 블룸(Cauliflower Bloom) 및 팔레트 나이프 스크래핑·스그라피토 커널.
 *
 * - `applyCleanWaterRewetBrush`: 매체별 용해도(`rewetSolubility * (1 - permanentStaining) * (1 - cureState)`)와
 *   경화도/용매 종류에 따라 건조 안료를 선택 재용해하고, 습윤 경계 바깥으로 질량 보존형 블룸을 형성한다.
 * - `applyPaletteKnifeScrape`: 칼날 폭·각도·필압과 경화 저항(`cure >= 0.92`)을 결합해 임파스토 능선을
 *   절삭하고 칼날 앞쪽 비드(`accumulatedBead`)를 퇴적하며 종이 결·밑칠(`underpaintExposureRatio`)을 드러낸다.
 */

import {
  TEMPORAL_MEDIUM_ORDER,
  clamp01,
  clampRange,
  computeFieldPigmentMetrics,
  getTemporalMediaProfileByIndex,
  rasterizeRadialStrokeMask,
  sanitizePositive,
  type Rgba4Tuple,
  type TemporalInkCanvasField,
  type TemporalMediumId,
} from "./temporal-ink-drying-field";

export type RewetSolventType =
  | "clean-water"
  | "odorless-mineral-spirits"
  | "gum-arabic-water";

export interface RewetBrushPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
}

export interface CleanWaterRewetParams {
  readonly points: readonly RewetBrushPoint[];
  readonly radiusPx: number;
  readonly waterAmountMm?: number;
  readonly solventType?: RewetSolventType;
  readonly bloomStrength?: number;
  readonly timestampSec?: number;
  readonly advectionPasses?: number;
}

export interface CleanWaterRewetResult {
  readonly touchedCellCount: number;
  readonly dissolvedPigmentMass: number;
  readonly bloomMigratedMass: number;
  readonly initialTotalPigmentMass: number;
  readonly finalTotalPigmentMass: number;
  readonly massConservationErrorRatio: number;
  readonly effectiveReactivationRatio: number;
  readonly peakBoundaryConcentrationRatio: number;
  readonly softenedCureDeltaAvg: number;
  readonly solventType: RewetSolventType;
  readonly mediumBreakdown: Readonly<Record<TemporalMediumId, number>>;
}

export interface PaletteKnifePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly bladeAngleRad?: number;
}

export interface PaletteKnifeScrapeParams {
  readonly points: readonly PaletteKnifePoint[];
  readonly bladeWidthPx: number;
  readonly bladeAngleRad?: number;
  readonly pressure?: number;
  readonly scrapeDepthMm?: number;
  readonly sgraffitoSharpness?: number;
  readonly timestampSec?: number;
}

export interface AccumulatedKnifeBead {
  readonly pigmentRgba4: Rgba4Tuple;
  readonly volumeHeightMm: number;
}

export interface PaletteKnifeScrapeResult {
  readonly scrapedCellCount: number;
  readonly initialTotalPigmentMass: number;
  readonly finalTotalPigmentMass: number;
  readonly massConservationErrorRatio: number;
  readonly scrapedPigmentMass: number;
  readonly depositedBeadMass: number;
  readonly peakBeadMass: number;
  readonly scrapedMassRatio: number;
  readonly averageHeightReductionMm: number;
  readonly underpaintExposureRatio: number;
  readonly resistanceFactor: number;
  readonly finalBead: AccumulatedKnifeBead;
}

export interface CompositedSurfaceSample {
  readonly rgbaLinear: Rgba4Tuple;
  readonly pigmentCoverage: number;
  readonly underpaintVisibility: number;
  readonly heightMm: number;
  readonly cureState: number;
}

function createEmptyMediumBreakdown(): Record<TemporalMediumId, number> {
  return {
    "transparent-watercolor": 0,
    "sumi-ink-wash": 0,
    "opaque-gouache": 0,
    "oil-impasto-alkyd": 0,
  };
}

/**
 * 맑은 물/아라비아검수/유화 용매 브러시로 건조 도막을 선택 재습윤하고
 * 질량 보존형 콜리플라워 블룸(Cauliflower Bloom)을 생성한다.
 */
export function applyCleanWaterRewetBrush(
  field: TemporalInkCanvasField,
  params: CleanWaterRewetParams,
): CleanWaterRewetResult {
  const solventType: RewetSolventType = params.solventType ?? "clean-water";
  const breakdown = createEmptyMediumBreakdown();
  const initialMetrics = computeFieldPigmentMetrics(field);
  const safeRadius = Number.isFinite(params.radiusPx) ? params.radiusPx : 0;

  if (safeRadius <= 0 || params.points.length === 0) {
    return {
      touchedCellCount: 0,
      dissolvedPigmentMass: 0,
      bloomMigratedMass: 0,
      initialTotalPigmentMass: initialMetrics.totalPigmentMass,
      finalTotalPigmentMass: initialMetrics.totalPigmentMass,
      massConservationErrorRatio: 0,
      effectiveReactivationRatio: 0,
      peakBoundaryConcentrationRatio: 1,
      softenedCureDeltaAvg: 0,
      solventType,
      mediumBreakdown: breakdown,
    };
  }

  const waterAmountMm = sanitizePositive(params.waterAmountMm ?? 0.38, 0.38);
  const bloomStrength = clamp01(params.bloomStrength ?? 0.78);
  const timestampSec = sanitizePositive(params.timestampSec ?? field.currentTimeSec, field.currentTimeSec);
  const advectionPasses = Math.max(1, Math.min(8, Math.floor(params.advectionPasses ?? 4)));
  const { width, height, cellCount } = field;
  const wetMask = rasterizeRadialStrokeMask(width, height, params.points, safeRadius);

  // 1단계: 매체 선택적 재용해 및 반경화 유화 연화
  let touchedCellCount = 0;
  let fixedMassInZone = 0;
  let dissolvedPigmentMass = 0;
  let softenedCureSum = 0;
  let softenedCellCount = 0;

  for (let i = 0; i < cellCount; i += 1) {
    const m = wetMask[i];
    if (m <= 1e-5) continue;
    touchedCellCount += 1;

    const o = i * 4;
    const fixedM = field.fixedPigment[o + 3];
    const profile = getTemporalMediaProfileByIndex(field.mediumIndex[i]);
    const cure = field.cureState[i];

    field.waterMm[i] += waterAmountMm * m;
    field.lastWettedAtSec[i] = timestampSec;
    if (fixedM <= 1e-7) continue;
    fixedMassInZone += fixedM;

    let dissolveFrac = 0;
    if (solventType === "clean-water" || solventType === "gum-arabic-water") {
      if (profile.waterRewettable) {
        const baseSol = profile.rewetSolubility * (1 - profile.permanentStaining) * (1 - cure);
        const gumBoost = solventType === "gum-arabic-water" ? 1.12 : 1;
        dissolveFrac = clampRange(baseSol * gumBoost * (0.48 + 0.52 * m), 0, 0.98);
      }
    } else if (profile.solventRewettable && cure < 0.75) {
      const mobility = clamp01((0.75 - cure) / 0.75);
      const softenDelta = profile.solventSofteningFactor * (0.35 + 0.65 * mobility) * m * 0.52;
      const nextCure = Math.max(0, cure - softenDelta);
      field.cureState[i] = nextCure;
      softenedCureSum += cure - nextCure;
      softenedCellCount += 1;
      dissolveFrac = clampRange(profile.solventSofteningFactor * (0.38 + 0.62 * mobility) * (0.45 + 0.55 * m), 0, 0.9);
    }

    if (dissolveFrac <= 1e-7) continue;
    const dR = field.fixedPigment[o] * dissolveFrac;
    const dG = field.fixedPigment[o + 1] * dissolveFrac;
    const dB = field.fixedPigment[o + 2] * dissolveFrac;
    const dM = fixedM * dissolveFrac;

    field.fixedPigment[o] = Math.max(0, field.fixedPigment[o] - dR);
    field.fixedPigment[o + 1] = Math.max(0, field.fixedPigment[o + 1] - dG);
    field.fixedPigment[o + 2] = Math.max(0, field.fixedPigment[o + 2] - dB);
    field.fixedPigment[o + 3] = Math.max(0, fixedM - dM);

    field.wetPigment[o] += dR;
    field.wetPigment[o + 1] += dG;
    field.wetPigment[o + 2] += dB;
    field.wetPigment[o + 3] += dM;

    dissolvedPigmentMass += dM;
    const mediumId = TEMPORAL_MEDIUM_ORDER[field.mediumIndex[i]] ?? "transparent-watercolor";
    breakdown[mediumId] += dM;
  }

  // 2단계: 질량 보존형 반경 외곽 콜리플라워 블룸 이류
  const deltaWet = new Float32Array(cellCount * 4);
  const dxTable = [-1, 1, 0, 0, -1, 1, -1, 1];
  const dyTable = [0, 0, -1, 1, -1, -1, 1, 1];
  const dirScale = [1, 1, 1, 1, 0.7071, 0.7071, 0.7071, 0.7071];
  let bloomMigratedMass = 0;

  if (bloomStrength > 1e-5 && dissolvedPigmentMass > 1e-7) {
    for (let pass = 0; pass < advectionPasses; pass += 1) {
      deltaWet.fill(0);
      for (let y = 0; y < height; y += 1) {
        const row = y * width;
        for (let x = 0; x < width; x += 1) {
          const idx = row + x;
          const m = wetMask[idx];
          const o = idx * 4;
          const wetM = field.wetPigment[o + 3];
          if (m <= 0.14 || wetM <= 1e-7) continue;

          const profile = getTemporalMediaProfileByIndex(field.mediumIndex[idx]);
          const mediaBloom = solventType === "odorless-mineral-spirits"
            ? (profile.solventRewettable ? 0.35 : 0)
            : (profile.waterRewettable ? 0.32 + 0.68 * profile.coffeeRingStrength : 0);
          if (mediaBloom <= 0) continue;

          const weights = [0, 0, 0, 0, 0, 0, 0, 0];
          const targets = [-1, -1, -1, -1, -1, -1, -1, -1];
          let weightSum = 0;
          for (let k = 0; k < 8; k += 1) {
            const nx = x + dxTable[k];
            const ny = y + dyTable[k];
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const nIdx = ny * width + nx;
            const nMask = wetMask[nIdx];
            if (nMask >= m - 0.015 || (nMask <= 0 && m < 0.38)) continue;
            const rimPref = nMask > 0.02 && nMask < 0.48 ? 1.55 : 0.9;
            const w = (m - nMask) * dirScale[k] * rimPref * (0.75 + 0.5 * (1 - field.paperTooth[nIdx]));
            weights[k] = w;
            targets[k] = nIdx;
            weightSum += w;
          }
          if (weightSum <= 1e-7) continue;

          const moveFrac = clampRange(bloomStrength * mediaBloom * 0.42 * (1 - field.cureState[idx]), 0, 0.48);
          if (moveFrac <= 1e-7) continue;
          const outR = field.wetPigment[o] * moveFrac;
          const outG = field.wetPigment[o + 1] * moveFrac;
          const outB = field.wetPigment[o + 2] * moveFrac;
          const outM = wetM * moveFrac;

          deltaWet[o] -= outR;
          deltaWet[o + 1] -= outG;
          deltaWet[o + 2] -= outB;
          deltaWet[o + 3] -= outM;
          bloomMigratedMass += outM;

          for (let k = 0; k < 8; k += 1) {
            if (weights[k] <= 0) continue;
            const nIdx = targets[k];
            const share = weights[k] / weightSum;
            const no = nIdx * 4;
            deltaWet[no] += outR * share;
            deltaWet[no + 1] += outG * share;
            deltaWet[no + 2] += outB * share;
            deltaWet[no + 3] += outM * share;
            if (field.depositedAtSec[nIdx] < 0) {
              field.depositedAtSec[nIdx] = field.depositedAtSec[idx] >= 0 ? field.depositedAtSec[idx] : timestampSec;
              field.mediumIndex[nIdx] = field.mediumIndex[idx];
            }
            field.lastWettedAtSec[nIdx] = timestampSec;
          }
        }
      }
      for (let i = 0; i < cellCount * 4; i += 1) {
        field.wetPigment[i] = Math.max(0, field.wetPigment[i] + deltaWet[i]);
      }
    }
  }

  let centerMassSum = 0;
  let centerCount = 0;
  let rimMassSum = 0;
  let rimCount = 0;
  for (let i = 0; i < cellCount; i += 1) {
    const m = wetMask[i];
    if (m <= 1e-5) continue;
    const o = i * 4;
    const totalM = field.wetPigment[o + 3] + field.fixedPigment[o + 3];
    if (m >= 0.7) { centerMassSum += totalM; centerCount += 1; }
    else if (m >= 0.04 && m <= 0.44) { rimMassSum += totalM; rimCount += 1; }
  }
  const centerAvg = centerCount > 0 ? centerMassSum / centerCount : 0;
  const rimAvg = rimCount > 0 ? rimMassSum / rimCount : centerAvg;

  const finalMetrics = computeFieldPigmentMetrics(field);
  const massConservationErrorRatio = initialMetrics.totalPigmentMass > 1e-7
    ? Math.abs(finalMetrics.totalPigmentMass - initialMetrics.totalPigmentMass) / initialMetrics.totalPigmentMass
    : 0;

  return {
    touchedCellCount,
    dissolvedPigmentMass,
    bloomMigratedMass,
    initialTotalPigmentMass: initialMetrics.totalPigmentMass,
    finalTotalPigmentMass: finalMetrics.totalPigmentMass,
    massConservationErrorRatio,
    effectiveReactivationRatio: fixedMassInZone > 1e-7 ? dissolvedPigmentMass / fixedMassInZone : 0,
    peakBoundaryConcentrationRatio: centerAvg > 1e-6 ? rimAvg / centerAvg : 1,
    softenedCureDeltaAvg: softenedCellCount > 0 ? softenedCureSum / softenedCellCount : 0,
    solventType,
    mediumBreakdown: breakdown,
  };
}

/**
 * 팔레트 나이프 스크래핑 및 스그라피토 물리 커널.
 * 반경화 임파스토 능선을 깎아 칼날 앞쪽 비드(`accumulatedBead`)로 밀어 퇴적하고 밑칠을 드러낸다.
 */
export function applyPaletteKnifeScrape(
  field: TemporalInkCanvasField,
  params: PaletteKnifeScrapeParams,
): PaletteKnifeScrapeResult {
  const initialMetrics = computeFieldPigmentMetrics(field);
  const safeWidthPx = Number.isFinite(params.bladeWidthPx) ? params.bladeWidthPx : 0;
  const basePressure = clamp01(params.pressure ?? 0.78);

  if (safeWidthPx <= 0 || basePressure <= 0 || params.points.length === 0) {
    return {
      scrapedCellCount: 0,
      initialTotalPigmentMass: initialMetrics.totalPigmentMass,
      finalTotalPigmentMass: initialMetrics.totalPigmentMass,
      massConservationErrorRatio: 0,
      scrapedPigmentMass: 0,
      depositedBeadMass: 0,
      peakBeadMass: 0,
      scrapedMassRatio: 0,
      averageHeightReductionMm: 0,
      underpaintExposureRatio: 0,
      resistanceFactor: 0,
      finalBead: { pigmentRgba4: [0, 0, 0, 0], volumeHeightMm: 0 },
    };
  }

  const defaultAngle = Number.isFinite(params.bladeAngleRad) ? (params.bladeAngleRad ?? Math.PI / 4) : Math.PI / 4;
  const scrapeDepthMm = sanitizePositive(params.scrapeDepthMm ?? 1.35, 1.35);
  const sharpness = clamp01(params.sgraffitoSharpness ?? 0.68);
  const timestampSec = sanitizePositive(params.timestampSec ?? field.currentTimeSec, field.currentTimeSec);
  const { width, height, cellCount } = field;

  const pathPoints: PaletteKnifePoint[] = params.points.length === 1
    ? [params.points[0], { x: params.points[0].x + 1, y: params.points[0].y, pressure: params.points[0].pressure, bladeAngleRad: params.points[0].bladeAngleRad }]
    : [...params.points];

  const bead: [number, number, number, number] = [0, 0, 0, 0];
  let beadHeightMm = 0;
  let peakBeadMass = 0;
  let scrapedPigmentMass = 0;
  let depositedBeadMass = 0;
  let dominantMediumIndex = 3;

  const touchedFlags = new Uint8Array(cellCount);
  const initialCellMass = new Float32Array(cellCount);
  const initialCellHeight = new Float32Array(cellCount);
  const cellVisitCount = new Uint16Array(cellCount);
  let resistanceSum = 0;
  let resistanceSamples = 0;

  const halfBlade = safeWidthPx * 0.5;
  const bladeSamples = Math.max(3, Math.ceil(safeWidthPx * 1.5));
  const beadOverflowCapacity = Math.max(1.8, safeWidthPx * 0.45);

  const depositMassToCell = (cx: number, cy: number, rM: number, gM: number, bM: number, mass: number, dH: number): void => {
    if (mass <= 1e-8 && dH <= 1e-8) return;
    const idx = Math.max(0, Math.min(height - 1, Math.round(cy))) * width + Math.max(0, Math.min(width - 1, Math.round(cx)));
    const o = idx * 4;
    field.wetPigment[o] += rM;
    field.wetPigment[o + 1] += gM;
    field.wetPigment[o + 2] += bM;
    field.wetPigment[o + 3] += mass;
    field.heightMm[idx] += dH;
    field.mediumIndex[idx] = dominantMediumIndex;
    if (field.depositedAtSec[idx] < 0) field.depositedAtSec[idx] = timestampSec;
    field.lastWettedAtSec[idx] = timestampSec;
    depositedBeadMass += mass;
  };

  let lastPosX = pathPoints[0].x;
  let lastPosY = pathPoints[0].y;
  let lastTx = 1;
  let lastTy = 0;
  let lastNx = 0;
  let lastNy = 1;

  for (let p = 0; p < pathPoints.length - 1; p += 1) {
    const a = pathPoints[p];
    const b = pathPoints[p + 1];
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
    const segDx = b.x - a.x;
    const segDy = b.y - a.y;
    const segLen = Math.hypot(segDx, segDy);
    if (segLen < 1e-4) continue;

    lastTx = segDx / segLen;
    lastTy = segDy / segLen;
    lastNx = -lastTy;
    lastNy = lastTx;

    const pStart = clamp01(a.pressure ?? basePressure);
    const pEnd = clamp01(b.pressure ?? basePressure);
    const angleStart = Number.isFinite(a.bladeAngleRad) ? (a.bladeAngleRad ?? defaultAngle) : defaultAngle;
    const angleEnd = Number.isFinite(b.bladeAngleRad) ? (b.bladeAngleRad ?? defaultAngle) : defaultAngle;
    const stepCount = Math.max(1, Math.ceil(segLen / 0.85));

    for (let step = 0; step <= stepCount; step += 1) {
      const t = step / stepCount;
      const px = a.x + segDx * t;
      const py = a.y + segDy * t;
      lastPosX = px;
      lastPosY = py;

      const curPressure = pStart + (pEnd - pStart) * t;
      const attackFactor = 0.28 + 0.72 * Math.abs(Math.sin(angleStart + (angleEnd - angleStart) * t));

      for (let bi = 0; bi < bladeSamples; bi += 1) {
        const uNorm = bladeSamples === 1 ? 0 : (bi / (bladeSamples - 1)) * 2 - 1;
        const sx = Math.round(px + lastNx * uNorm * halfBlade);
        const sy = Math.round(py + lastNy * uNorm * halfBlade);
        if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;

        const idx = sy * width + sx;
        if (cellVisitCount[idx] >= 2) continue;
        cellVisitCount[idx] += 1;

        const o = idx * 4;
        const wetM = field.wetPigment[o + 3];
        const fixedM = field.fixedPigment[o + 3];
        const totalCellM = wetM + fixedM;
        if (touchedFlags[idx] === 0) {
          touchedFlags[idx] = 1;
          initialCellMass[idx] = totalCellM;
          initialCellHeight[idx] = field.heightMm[idx];
        }
        if (totalCellM <= 1e-7 && field.heightMm[idx] <= 1e-7) continue;

        const cure = field.cureState[idx];
        let workability: number;
        if (cure < 0.7) workability = 1 - 0.42 * (cure / 0.7);
        else if (cure < 0.92) {
          const uStiff = (cure - 0.7) / 0.22;
          workability = 0.58 * (1 - uStiff) * (1 - uStiff) + 0.025 * uStiff;
        } else {
          workability = Math.max(0, (1 - cure) * 0.22);
        }
        resistanceSum += 1 - workability;
        resistanceSamples += 1;

        const toothShield = (1 - field.paperTooth[idx]) * (1 - sharpness * 0.78) * 0.38;
        const bladeProfile = 1 - 0.22 * uNorm * uNorm;
        const cutBase = clamp01(
          curPressure * attackFactor * workability * bladeProfile * (1 - toothShield) * (cellVisitCount[idx] === 1 ? 1 : 0.35),
        );
        if (cutBase <= 1e-7) continue;

        const fixedCut = cutBase * (cure >= 0.92 ? 0.5 : 0.9);
        const rCut = field.wetPigment[o] * cutBase + field.fixedPigment[o] * fixedCut;
        const gCut = field.wetPigment[o + 1] * cutBase + field.fixedPigment[o + 1] * fixedCut;
        const bCut = field.wetPigment[o + 2] * cutBase + field.fixedPigment[o + 2] * fixedCut;
        const mCut = wetM * cutBase + fixedM * fixedCut;

        field.wetPigment[o] = Math.max(0, field.wetPigment[o] * (1 - cutBase));
        field.wetPigment[o + 1] = Math.max(0, field.wetPigment[o + 1] * (1 - cutBase));
        field.wetPigment[o + 2] = Math.max(0, field.wetPigment[o + 2] * (1 - cutBase));
        field.wetPigment[o + 3] = Math.max(0, wetM * (1 - cutBase));

        field.fixedPigment[o] = Math.max(0, field.fixedPigment[o] * (1 - fixedCut));
        field.fixedPigment[o + 1] = Math.max(0, field.fixedPigment[o + 1] * (1 - fixedCut));
        field.fixedPigment[o + 2] = Math.max(0, field.fixedPigment[o + 2] * (1 - fixedCut));
        field.fixedPigment[o + 3] = Math.max(0, fixedM * (1 - fixedCut));

        const curH = field.heightMm[idx];
        const heightCut = Math.min(curH, Math.max(curH * cutBase * 0.88, scrapeDepthMm * cutBase * 0.55));
        field.heightMm[idx] = Math.max(0, curH - heightCut);

        bead[0] += rCut;
        bead[1] += gCut;
        bead[2] += bCut;
        bead[3] += mCut;
        beadHeightMm += heightCut;
        scrapedPigmentMass += mCut;
        dominantMediumIndex = field.mediumIndex[idx];
        if (bead[3] > peakBeadMass) peakBeadMass = bead[3];
      }

      if (bead[3] > beadOverflowCapacity) {
        const spill = clampRange(((bead[3] - beadOverflowCapacity) / bead[3]) * 0.5, 0, 0.35);
        const sR = bead[0] * spill;
        const sG = bead[1] * spill;
        const sB = bead[2] * spill;
        const sM = bead[3] * spill;
        const sH = beadHeightMm * spill;
        bead[0] -= sR; bead[1] -= sG; bead[2] -= sB; bead[3] -= sM; beadHeightMm -= sH;
        const rail = halfBlade + 1.1;
        depositMassToCell(px + lastNx * rail, py + lastNy * rail, sR * 0.5, sG * 0.5, sB * 0.5, sM * 0.5, sH * 0.5);
        depositMassToCell(px - lastNx * rail, py - lastNy * rail, sR * 0.5, sG * 0.5, sB * 0.5, sM * 0.5, sH * 0.5);
      }
    }
  }

  // 스트로크 종료 시 칼날 앞쪽 누적 비드를 릿지로 퇴적(전체 질량 보존)
  const finalBead: AccumulatedKnifeBead = {
    pigmentRgba4: [bead[0], bead[1], bead[2], bead[3]],
    volumeHeightMm: beadHeightMm,
  };
  if (bead[3] > 1e-8 || beadHeightMm > 1e-8) {
    const ridgeTargets: { x: number; y: number; weight: number }[] = [];
    let ridgeWeightSum = 0;
    for (let bi = 0; bi < bladeSamples; bi += 1) {
      const uNorm = bladeSamples === 1 ? 0 : (bi / (bladeSamples - 1)) * 2 - 1;
      for (let ahead = 1; ahead <= 2; ahead += 1) {
        const rx = Math.max(0, Math.min(width - 1, Math.round(lastPosX + lastTx * ahead + lastNx * uNorm * halfBlade)));
        const ry = Math.max(0, Math.min(height - 1, Math.round(lastPosY + lastTy * ahead + lastNy * uNorm * halfBlade)));
        const weight = (1.15 - 0.3 * uNorm * uNorm) * (ahead === 1 ? 1 : 0.65);
        ridgeTargets.push({ x: rx, y: ry, weight });
        ridgeWeightSum += weight;
      }
    }
    if (ridgeWeightSum > 0) {
      for (let i = 0; i < ridgeTargets.length; i += 1) {
        const share = ridgeTargets[i].weight / ridgeWeightSum;
        depositMassToCell(
          ridgeTargets[i].x,
          ridgeTargets[i].y,
          bead[0] * share,
          bead[1] * share,
          bead[2] * share,
          bead[3] * share,
          beadHeightMm * share,
        );
      }
    }
  }

  let scrapedCellCount = 0;
  let zoneInitialMass = 0;
  let heightReductionSum = 0;
  let exposureSum = 0;
  let exposureCount = 0;
  for (let i = 0; i < cellCount; i += 1) {
    if (touchedFlags[i] === 0) continue;
    scrapedCellCount += 1;
    const initM = initialCellMass[i];
    zoneInitialMass += initM;
    heightReductionSum += Math.max(0, initialCellHeight[i] - field.heightMm[i]);
    if (initM > 1e-6) {
      const o = i * 4;
      const remainM = field.wetPigment[o + 3] + field.fixedPigment[o + 3];
      exposureSum += clamp01(clamp01((initM - remainM) / initM) * (0.78 + 0.32 * field.paperTooth[i]));
      exposureCount += 1;
    }
  }

  const finalMetrics = computeFieldPigmentMetrics(field);
  const massConservationErrorRatio = initialMetrics.totalPigmentMass > 1e-7
    ? Math.abs(finalMetrics.totalPigmentMass - initialMetrics.totalPigmentMass) / initialMetrics.totalPigmentMass
    : 0;

  return {
    scrapedCellCount,
    initialTotalPigmentMass: initialMetrics.totalPigmentMass,
    finalTotalPigmentMass: finalMetrics.totalPigmentMass,
    massConservationErrorRatio,
    scrapedPigmentMass,
    depositedBeadMass,
    peakBeadMass,
    scrapedMassRatio: zoneInitialMass > 1e-7 ? scrapedPigmentMass / zoneInitialMass : 0,
    averageHeightReductionMm: scrapedCellCount > 0 ? heightReductionSum / scrapedCellCount : 0,
    underpaintExposureRatio: exposureCount > 0 ? exposureSum / exposureCount : 0,
    resistanceFactor: resistanceSamples > 0 ? resistanceSum / resistanceSamples : 0,
    finalBead,
  };
}

/** 특정 셀의 밑칠, 고착/습윤 안료 및 종이 결을 합성해 표면 노출 색상을 샘플링한다. */
export function sampleCompositedSurfaceRgba(field: TemporalInkCanvasField, x: number, y: number): CompositedSurfaceSample {
  const ix = Math.max(0, Math.min(field.width - 1, Math.floor(Number.isFinite(x) ? x : 0)));
  const iy = Math.max(0, Math.min(field.height - 1, Math.floor(Number.isFinite(y) ? y : 0)));
  const idx = iy * field.width + ix;
  const o = idx * 4;
  const totalM = field.wetPigment[o + 3] + field.fixedPigment[o + 3];
  const pigmentCoverage = clamp01(1 - Math.exp(-totalM * 2.4));
  const underpaintVisibility = 1 - pigmentCoverage;
  const toothTint = 0.94 + 0.06 * field.paperTooth[idx];

  const pigR = totalM > 1e-6 ? clamp01((field.wetPigment[o] + field.fixedPigment[o]) / totalM) : 0;
  const pigG = totalM > 1e-6 ? clamp01((field.wetPigment[o + 1] + field.fixedPigment[o + 1]) / totalM) : 0;
  const pigB = totalM > 1e-6 ? clamp01((field.wetPigment[o + 2] + field.fixedPigment[o + 2]) / totalM) : 0;

  return {
    rgbaLinear: [
      clamp01(pigR * pigmentCoverage + field.underpaintRgba[o] * toothTint * underpaintVisibility),
      clamp01(pigG * pigmentCoverage + field.underpaintRgba[o + 1] * toothTint * underpaintVisibility),
      clamp01(pigB * pigmentCoverage + field.underpaintRgba[o + 2] * toothTint * underpaintVisibility),
      1,
    ],
    pigmentCoverage,
    underpaintVisibility,
    heightMm: field.heightMm[idx],
    cureState: field.cureState[idx],
  };
}
