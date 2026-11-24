/**
 * Wave 38F — 극한의 브러시 질감 6축 물리 엔진.
 *
 * - 임파스토 2.5D 두께 Float32Array 버퍼 -> 3x3 Sobel 노멀맵 & 사선 광원(Raking Light) 스펙큘러 셰이딩
 * - 16~48가닥 멀티 브리슬 스플레이 물리
 * - G펜 2-갈래 닙 탄성 갈라짐(Tine Split) & 메니스커스 분열(Railroading)
 * - 잉크 소진 갈필(Dry-Brush Starvation), 스트로크 끝 잉크 고임(Ink Pooling), 연필심 마모(Tip Wear)
 */

import {
  DEFAULT_RAKING_LIGHT_CONFIG,
  clampBrushNumber,
  computePaperTransfer,
  createPaperHeightmap3Channel,
  hashBrush2d,
  samplePaperChannel,
  smoothstepBrush,
  type BristleClusterConfig,
  type BristleSplayResult,
  type BristleStrand,
  type BrushStrokeSamplePoint,
  type ExtremeBrushStrokeParams,
  type ExtremeBrushStrokeResult,
  type ExtremeBrushStrokeSampleMetrics,
  type GPenNibConfig,
  type GPenTineSplitResult,
  type ImpastoBuffer25D,
  type ImpastoShadingResult,
  type InkPoolingResult,
  type InkStarvationConfig,
  type PencilTipWearState,
  type RakingLightConfig,
  type SobelNormalResult,
} from "./brush-texture-types-and-paper";

export {
  DEFAULT_BRUSH_PIGMENT_OKLCH,
  DEFAULT_GPEN_NIB_CONFIG,
  DEFAULT_RAKING_LIGHT_CONFIG,
  PAPER_PRESETS,
  computePaperTransfer,
  createPaperHeightmap3Channel,
  getPaperPresetSpec,
  samplePaperChannel,
  type BristleClusterConfig,
  type BristleSplayResult,
  type BristleStrand,
  type BrushOklchPigment,
  type BrushStrokeSamplePoint,
  type ExtremeBrushStrokeParams,
  type ExtremeBrushStrokeResult,
  type ExtremeBrushStrokeSampleMetrics,
  type GPenNibConfig,
  type GPenTineSplitResult,
  type ImpastoBuffer25D,
  type ImpastoShadingResult,
  type InkPoolingResult,
  type InkStarvationConfig,
  type PaperChannelSample,
  type PaperHeightmap3Channel,
  type PaperPresetId,
  type PaperPresetSpec,
  type PaperTransferInput,
  type PaperTransferResult,
  type PencilTipWearState,
  type RakingLightConfig,
  type SobelNormalResult,
} from "./brush-texture-types-and-paper";

const DEG_TO_RAD = Math.PI / 180;

/**
 * 16~48가닥 멀티 브리슬 스플레이 물리 시뮬레이터.
 */
export function simulateBristleSplay(
  config: BristleClusterConfig,
  pressure: number,
  velocityPxPerSec: number,
  inkReserve: number,
  seed = 17,
): BristleSplayResult {
  const count = Math.round(clampBrushNumber(config.bristleCount, 16, 48));
  const p = clampBrushNumber(pressure, 0.02, 1);
  const v = clampBrushNumber(velocityPxPerSec / 900, 0, 2);
  const reserve = clampBrushNumber(inkReserve, 0, 1);
  const stiffness = clampBrushNumber(config.stiffness, 0.05, 1);
  const splayFactor = clampBrushNumber(config.splayFactor, 0, 1);
  const clumpiness = clampBrushNumber(config.clumpiness, 0, 1);
  const tilt = clampBrushNumber(config.tiltRad, 0, Math.PI * 0.48);

  const tiltElongation = 1 + Math.sin(tilt) * 0.85;
  const splaySpread = 1 + p * splayFactor * (1.2 - 0.55 * stiffness) + v * 0.12;
  const baseRadius = Math.max(1.5, config.brushRadiusPx);
  const goldenAngle = 2.399963229728653;

  const strands: BristleStrand[] = [];
  let activeStrandCount = 0;
  let maxDist = 0;
  let inkSum = 0;

  for (let i = 0; i < count; i += 1) {
    const frac = (i + 0.5) / count;
    const radialNorm = Math.sqrt(frac);
    const angle = i * goldenAngle + config.azimuthRad + hashBrush2d(i, seed, 3) * 0.28;

    const clumpPull = 1 - clumpiness * 0.28 * Math.sin(angle * 3);
    const r = baseRadius * radialNorm * splaySpread * clumpPull;
    const rawX = Math.cos(angle) * r;
    const rawY = Math.sin(angle) * r * tiltElongation;

    const contactThreshold = radialNorm * (0.58 - 0.35 * splayFactor);
    const contactWeight = smoothstepBrush(contactThreshold - 0.14, contactThreshold + 0.22, p);
    const outerDryPenalty = radialNorm * (1 - reserve) * 0.52;
    const inkLoad = clampBrushNumber(
      reserve * (1 - outerDryPenalty) * (0.72 + 0.28 * (1 - radialNorm)),
      0,
      1,
    );

    const widthPx = Math.max(
      0.55,
      (baseRadius / Math.sqrt(count)) * (1.15 - 0.35 * radialNorm) * (0.75 + 0.45 * p),
    );
    const ridgeHeight = clampBrushNumber(
      contactWeight * (0.45 + 0.55 * inkLoad) * (0.7 + 0.3 * Math.cos(radialNorm * Math.PI)),
      0,
      1,
    );

    const dist = Math.hypot(rawX, rawY);
    if (dist > maxDist) maxDist = dist;
    if (contactWeight > 0.12) activeStrandCount += 1;
    inkSum += inkLoad;

    strands.push({
      index: i,
      offsetX: rawX,
      offsetY: rawY,
      widthPx,
      inkLoad,
      contactWeight,
      ridgeHeight,
    });
  }

  return {
    strands,
    activeStrandCount,
    effectiveSpanPx: maxDist * 2,
    meanInkLoad: count > 0 ? inkSum / count : 0,
    splayRatio: splaySpread,
  };
}

/**
 * G펜 2-갈래 닙 탄성 갈라짐(Tine Split)과 잉크 메니스커스 한계(Railroading)를 계산한다.
 */
export function simulateGPenTineSplit(
  config: GPenNibConfig,
  pressure: number,
  tiltRad: number,
  inkReserve: number,
): GPenTineSplitResult {
  const p = clampBrushNumber(pressure, 0, 1);
  const reserve = clampBrushNumber(inkReserve, 0, 1);
  const threshold = clampBrushNumber(config.splitThresholdPressure, 0.05, 0.75);
  const elasticity = clampBrushNumber(config.elasticity, 0.05, 1);
  const viscosity = clampBrushNumber(config.inkViscosity, 0.05, 1);
  const asym = clampBrushNumber(
    config.asymmetryBias + Math.sin(clampBrushNumber(tiltRad, -1.2, 1.2)) * 0.18,
    -0.45,
    0.45,
  );

  const excessPressure = Math.max(0, (p - threshold) / Math.max(0.1, 1 - threshold));
  const elasticResistance = 0.55 + elasticity * 0.75;
  const normalizedDeflection = clampBrushNumber(
    Math.pow(excessPressure, 1.18) / elasticResistance,
    0,
    1,
  );
  const tineSeparationPx = clampBrushNumber(
    config.maxSplitPx * normalizedDeflection,
    0,
    config.maxSplitPx,
  );

  const halfSplit = tineSeparationPx * 0.5;
  const leftTineOffsetPx = -halfSplit * (1 - asym);
  const rightTineOffsetPx = halfSplit * (1 + asym);
  const totalStrokeWidthPx = Math.max(
    config.baseWidthPx * (0.45 + 0.55 * p),
    config.baseWidthPx + tineSeparationPx,
  );

  const meniscusMaxPx = config.maxSplitPx * (0.32 + 0.52 * viscosity) * (0.25 + 0.75 * reserve);
  const meniscusIntact = tineSeparationPx <= meniscusMaxPx;
  const railroadGapRatio = meniscusIntact
    ? 0
    : clampBrushNumber((tineSeparationPx - meniscusMaxPx) / Math.max(0.5, config.maxSplitPx), 0, 1);

  const springRestoreForce = clampBrushNumber(normalizedDeflection * elasticity * 1.15, 0, 1);
  const snapBackSharpness = clampBrushNumber(
    0.4 + elasticity * 0.55 - normalizedDeflection * 0.15,
    0.1,
    1,
  );

  return {
    tineSeparationPx,
    leftTineOffsetPx,
    rightTineOffsetPx,
    totalStrokeWidthPx,
    meniscusIntact,
    railroadGapRatio,
    springRestoreForce,
    snapBackSharpness,
  };
}

/**
 * 스트로크 끝·정체 구간 잉크 고임(Ink Pooling) 계산기.
 */
export function computeInkPooling(
  velocityPxPerSec: number,
  wetness: number,
  inkReserve: number,
  isStrokeTerminal: boolean,
): InkPoolingResult {
  const w = clampBrushNumber(wetness, 0, 1);
  const r = clampBrushNumber(inkReserve, 0, 1);
  const speedNorm = clampBrushNumber(velocityPxPerSec / 450, 0, 2);
  const dwellBoost = clampBrushNumber(
    Math.exp(-speedNorm * 2.4) + (isStrokeTerminal ? 0.36 : 0),
    0,
    1,
  );

  const poolingFactor = clampBrushNumber(dwellBoost * w * r, 0, 1);
  const haloDarkening = clampBrushNumber(poolingFactor * 0.42, 0, 0.45);
  const edgeFeatherPx = clampBrushNumber(0.6 + poolingFactor * 3.4, 0.5, 4.5);

  return {
    poolingFactor,
    haloDarkening,
    edgeFeatherPx,
    dwellBoost,
  };
}

export function createInitialPencilTipWear(initialSharpnessMm = 0.25): PencilTipWearState {
  const initial = clampBrushNumber(initialSharpnessMm, 0.15, 0.6);
  return {
    initialSharpnessMm: initial,
    currentFlatWidthMm: initial,
    maxFlatWidthMm: 1.85,
    accumulatedDistancePx: 0,
    bevelAngleRad: 0.42,
    wearRate: 0.0014,
    sharpnessRatio: 1,
    graphiteTransferBoost: 0,
  };
}

/**
 * 누적 이동 거리·필압·종이 거칠기에 따른 연필심 마모(Tip Wear)를 적분한다.
 */
export function advancePencilTipWear(
  state: PencilTipWearState,
  deltaDistancePx: number,
  pressure: number,
  paperRoughness: number,
  tiltRad: number,
): PencilTipWearState {
  const dist = Math.max(0, deltaDistancePx);
  const p = clampBrushNumber(pressure, 0.05, 1);
  const rough = clampBrushNumber(paperRoughness, 0.1, 1);
  const tiltFactor = 0.75 + Math.sin(clampBrushNumber(tiltRad, 0, Math.PI * 0.48)) * 0.9;

  const abrasionMm = dist * state.wearRate * p * rough * tiltFactor;
  const nextFlat = clampBrushNumber(
    state.currentFlatWidthMm + abrasionMm,
    state.initialSharpnessMm,
    state.maxFlatWidthMm,
  );
  const span = Math.max(0.1, state.maxFlatWidthMm - state.initialSharpnessMm);
  const wearProgress = clampBrushNumber((nextFlat - state.initialSharpnessMm) / span, 0, 1);
  const sharpnessRatio = clampBrushNumber(1 - wearProgress * 0.85, 0.15, 1);

  return {
    ...state,
    currentFlatWidthMm: nextFlat,
    accumulatedDistancePx: state.accumulatedDistancePx + dist,
    bevelAngleRad: clampBrushNumber(
      0.32 + Math.sin(clampBrushNumber(tiltRad, 0, 1.4)) * 0.55,
      0.2,
      1.2,
    ),
    sharpnessRatio,
    graphiteTransferBoost: clampBrushNumber(wearProgress * 0.48, 0, 0.5),
  };
}

/**
 * 2.5D 임파스토 두께 Float32Array 버퍼에서 3x3 Sobel 노멀맵을 산출한다.
 */
export function computeImpastoSobelNormals(
  thickness: Float32Array,
  width: number,
  height: number,
  reliefScale = 2.6,
): SobelNormalResult {
  const safeW = Math.max(3, Math.floor(width));
  const safeH = Math.max(3, Math.floor(height));
  const normals = new Float32Array(safeW * safeH * 3);
  const scale = clampBrushNumber(reliefScale, 0.1, 12);

  const sample = (x: number, y: number): number => {
    const cx = clampBrushNumber(x, 0, safeW - 1);
    const cy = clampBrushNumber(y, 0, safeH - 1);
    return thickness[cy * safeW + cx] ?? 0;
  };

  let maxSlope = 0;
  let deviationSumDeg = 0;
  let nonFlatCount = 0;
  const total = safeW * safeH;

  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const tl = sample(x - 1, y - 1);
      const tc = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const ml = sample(x - 1, y);
      const mr = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const bc = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

      const dx = -gx * scale;
      const dy = -gy * scale;
      const dz = 1;
      const invLen = 1 / Math.hypot(dx, dy, dz);
      const nx = dx * invLen;
      const ny = dy * invLen;
      const nz = dz * invLen;

      const outIdx = (y * safeW + x) * 3;
      normals[outIdx] = nx;
      normals[outIdx + 1] = ny;
      normals[outIdx + 2] = nz;

      const slope = Math.hypot(gx, gy);
      if (slope > maxSlope) maxSlope = slope;
      const devDeg = Math.acos(clampBrushNumber(nz, -1, 1)) / DEG_TO_RAD;
      deviationSumDeg += devDeg;
      if (devDeg > 2.0) nonFlatCount += 1;
    }
  }

  return {
    width: safeW,
    height: safeH,
    normals,
    maxSlope,
    meanDeviationDeg: total > 0 ? deviationSumDeg / total : 0,
    nonFlatRatio: total > 0 ? nonFlatCount / total : 0,
  };
}

/**
 * 2.5D 임파스토 두께 버퍼와 Sobel 노멀맵을 사선 광원(Raking Light)으로 셰이딩한다.
 */
export function shadeImpastoRakingLight(
  impasto: ImpastoBuffer25D,
  light: RakingLightConfig = DEFAULT_RAKING_LIGHT_CONFIG,
): ImpastoShadingResult {
  const { width, height } = impasto;
  const sobel = computeImpastoSobelNormals(impasto.thickness, width, height, light.reliefScale);
  const total = width * height;
  const luminance = new Float32Array(total);
  const specular = new Float32Array(total);

  const azRad = light.azimuthDeg * DEG_TO_RAD;
  const elRad = clampBrushNumber(light.elevationDeg, 4, 86) * DEG_TO_RAD;
  const lx = Math.cos(elRad) * Math.cos(azRad);
  const ly = Math.cos(elRad) * Math.sin(azRad);
  const lz = Math.sin(elRad);

  const hxRaw = lx;
  const hyRaw = ly;
  const hzRaw = lz + 1;
  const invHLen = 1 / Math.max(1e-6, Math.hypot(hxRaw, hyRaw, hzRaw));
  const hx = hxRaw * invHLen;
  const hy = hyRaw * invHLen;
  const hz = hzRaw * invHLen;

  const specPower = clampBrushNumber(light.specularPower, 4, 128);
  const specStrength = clampBrushNumber(light.specularStrength, 0, 1.5);
  const ambient = clampBrushNumber(light.ambientStrength, 0.05, 0.8);
  const intensity = clampBrushNumber(light.intensity, 0.2, 2.5);

  let minLum = 1;
  let maxLum = 0;
  let sumLum = 0;
  let sumLum2 = 0;
  let paintedCount = 0;
  let peakSpecular = 0;

  for (let i = 0; i < total; i += 1) {
    const t = impasto.thickness[i] ?? 0;
    const nx = sobel.normals[i * 3] ?? 0;
    const ny = sobel.normals[i * 3 + 1] ?? 0;
    const nz = sobel.normals[i * 3 + 2] ?? 1;
    const baseL = impasto.pigmentL[i] ?? 0.94;
    const wet = impasto.wetnessMap[i] ?? 0;

    const ndotl = Math.max(0, nx * lx + ny * ly + nz * lz);
    const ndoth = Math.max(0, nx * hx + ny * hy + nz * hz);
    const specVal =
      t > 0.02
        ? Math.pow(ndoth, specPower) * specStrength * (0.42 + 0.58 * wet) * Math.min(1, t * 1.4)
        : 0;

    const diffuse = ambient + (1 - ambient) * ndotl * intensity;
    const shadedL = clampBrushNumber(baseL * diffuse + specVal * 0.42, 0.04, 0.99);

    luminance[i] = shadedL;
    specular[i] = clampBrushNumber(specVal, 0, 1);

    if (specVal > peakSpecular) peakSpecular = specVal;
    if (t > 0.02) {
      if (shadedL < minLum) minLum = shadedL;
      if (shadedL > maxLum) maxLum = shadedL;
      sumLum += shadedL;
      sumLum2 += shadedL * shadedL;
      paintedCount += 1;
    }
  }

  const meanL = paintedCount > 0 ? sumLum / paintedCount : 0.94;
  const variance = paintedCount > 0 ? Math.max(0, sumLum2 / paintedCount - meanL * meanL) : 0;

  return {
    width,
    height,
    luminance,
    specular,
    normals: sobel.normals,
    luminanceVariance: variance,
    luminanceRange: paintedCount > 0 ? Math.max(0, maxLum - minLum) : 0,
    peakSpecular,
    meanNormalDeviationDeg: sobel.meanDeviationDeg,
  };
}

/**
 * 데모 및 검증용 결정론적 S-커브 스트로크 샘플을 생성한다.
 */
export function createDemoBrushStrokePoints(
  width: number,
  height: number,
  pressureScale = 0.85,
  stepCount = 26,
): readonly BrushStrokeSamplePoint[] {
  const count = Math.max(8, Math.floor(stepCount));
  const points: BrushStrokeSamplePoint[] = [];
  const pScale = clampBrushNumber(pressureScale, 0.15, 1);

  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const x = width * (0.12 + 0.76 * t);
    const y = height * (0.52 + 0.24 * Math.sin(t * Math.PI * 1.75));
    const bell = Math.sin(t * Math.PI);
    const pressure = clampBrushNumber(0.18 + 0.82 * Math.pow(bell, 0.65) * pScale, 0.08, 1);
    const tiltRad = 0.25 + 0.35 * t;
    const velocityPxPerSec = t > 0.86 ? 24 : 260 + 180 * Math.sin(t * Math.PI);
    points.push({
      x,
      y,
      pressure,
      tiltRad,
      velocityPxPerSec,
      timestampMs: i * 16,
    });
  }
  return points;
}

/**
 * 극한의 브러시 6축 전체 파이프라인을 입력 스트로크에 실행하고 2.5D 임파스토 셰이딩 결과를 반환한다.
 */
export function simulateExtremeBrushStroke(
  points: readonly BrushStrokeSamplePoint[],
  params: ExtremeBrushStrokeParams,
): ExtremeBrushStrokeResult {
  const safeW = Math.max(24, Math.floor(params.width));
  const safeH = Math.max(24, Math.floor(params.height));
  const total = safeW * safeH;
  const paper = createPaperHeightmap3Channel(params.presetId, safeW, safeH, 42);

  const thickness = new Float32Array(total);
  const pigmentL = new Float32Array(total);
  const pigmentC = new Float32Array(total);
  const pigmentH = new Float32Array(total);
  const wetnessMap = new Float32Array(total);

  for (let i = 0; i < total; i += 1) {
    const grainH = paper.heightField[i] ?? 0.5;
    pigmentL[i] = clampBrushNumber(0.92 + (grainH - 0.5) * 0.06, 0.82, 0.98);
    pigmentC[i] = 0.012;
    pigmentH[i] = 85;
  }

  const effectivePoints =
    points.length >= 2 ? points : createDemoBrushStrokePoints(safeW, safeH, 0.85, 22);

  const starvationConfig: InkStarvationConfig = {
    initialInkLoad: 1.0,
    depletionRate: 0.0022 * (1.2 - params.wetness * 0.35),
    dryThreshold: 0.32,
    paperAbsorbencyFactor: paper.valleyMean,
  };

  let inkReserve = starvationConfig.initialInkLoad;
  let tipWear = createInitialPencilTipWear(params.initialWearMm ?? 0.25);
  let accumulatedDistance = 0;
  let peakTineSplitPx = 0;
  let maxStarvationBreakup = 0;
  let endPoolingFactor = 0;
  let finalBristles: BristleSplayResult = simulateBristleSplay(
    {
      bristleCount: params.bristleCount,
      brushRadiusPx: params.brushRadiusPx,
      stiffness: 0.55,
      splayFactor: 0.65,
      clumpiness: 0.25,
      tiltRad: 0.35,
      azimuthRad: 0,
    },
    0.5,
    200,
    1,
  );

  const sampleMetrics: ExtremeBrushStrokeSampleMetrics[] = [];

  for (let i = 0; i < effectivePoints.length; i += 1) {
    const pt = effectivePoints[i];
    if (!pt) continue;
    const prev = i > 0 ? (effectivePoints[i - 1] ?? pt) : pt;
    const dx = pt.x - prev.x;
    const dy = pt.y - prev.y;
    const segDist = Math.hypot(dx, dy);
    const strokeAngle = segDist > 1e-4 ? Math.atan2(dy, dx) : 0;
    accumulatedDistance += segDist;

    const paperSample = samplePaperChannel(paper, pt.x / safeW, pt.y / safeH);
    const transfer = computePaperTransfer({
      paper: paperSample,
      pressure: pt.pressure,
      wetness: params.wetness,
      strokeAngleRad: strokeAngle,
      grainAngleRad: paper.grainAngleRad,
    });

    const depletion =
      segDist *
      starvationConfig.depletionRate *
      (0.55 + 0.65 * pt.pressure) *
      (0.75 + 0.5 * paperSample.absorbency);
    inkReserve = clampBrushNumber(inkReserve - depletion, 0.04, 1);
    const starvationBreakup =
      inkReserve < starvationConfig.dryThreshold
        ? clampBrushNumber(
            (starvationConfig.dryThreshold - inkReserve) / starvationConfig.dryThreshold,
            0,
            1,
          )
        : 0;
    if (starvationBreakup > maxStarvationBreakup) maxStarvationBreakup = starvationBreakup;

    const isTerminal = i === effectivePoints.length - 1 || i === effectivePoints.length - 2;
    const pooling = computeInkPooling(pt.velocityPxPerSec, params.wetness, inkReserve, isTerminal);
    if (isTerminal) endPoolingFactor = Math.max(endPoolingFactor, pooling.poolingFactor);

    const tineSplit = simulateGPenTineSplit(params.nibConfig, pt.pressure, pt.tiltRad, inkReserve);
    if (tineSplit.tineSeparationPx > peakTineSplitPx) {
      peakTineSplitPx = tineSplit.tineSeparationPx;
    }

    tipWear = advancePencilTipWear(tipWear, segDist, pt.pressure, paper.roughnessIndex, pt.tiltRad);

    finalBristles = simulateBristleSplay(
      {
        bristleCount: params.bristleCount,
        brushRadiusPx: params.brushRadiusPx,
        stiffness: 0.55,
        splayFactor: 0.62,
        clumpiness: 0.22,
        tiltRad: pt.tiltRad,
        azimuthRad: strokeAngle,
      },
      pt.pressure,
      pt.velocityPxPerSec,
      inkReserve,
      17 + i,
    );

    const perpX = -Math.sin(strokeAngle);
    const perpY = Math.cos(strokeAngle);
    const depositGain =
      clampBrushNumber(params.impastoLoad, 0.1, 2.5) *
      (0.35 + 0.65 * pt.pressure) *
      (1 - starvationBreakup * 0.68);

    for (const strand of finalBristles.strands) {
      if (strand.contactWeight < 0.1) continue;
      const tineSide =
        strand.index % 2 === 0 ? tineSplit.leftTineOffsetPx : tineSplit.rightTineOffsetPx;
      const sx = pt.x + strand.offsetX + perpX * tineSide * 0.45;
      const sy = pt.y + strand.offsetY + perpY * tineSide * 0.45;
      const radius = Math.max(1, Math.ceil(strand.widthPx * 1.15));

      const minX = Math.max(0, Math.floor(sx - radius));
      const maxX = Math.min(safeW - 1, Math.ceil(sx + radius));
      const minY = Math.max(0, Math.floor(sy - radius));
      const maxY = Math.min(safeH - 1, Math.ceil(sy + radius));

      for (let py = minY; py <= maxY; py += 1) {
        for (let px = minX; px <= maxX; px += 1) {
          const d = Math.hypot(px - sx, py - sy);
          if (d > radius + 0.5) continue;
          const normD = d / Math.max(1, radius);
          const idx = py * safeW + px;
          const cellH = paper.heightField[idx] ?? 0.5;
          if (starvationBreakup > 0.15 && cellH < starvationBreakup * 0.72) continue;

          const ridgeProfile =
            (1 - normD * normD) * 0.75 + Math.exp(-Math.pow((normD - 0.72) / 0.24, 2)) * 0.42;
          const cellTransfer = transfer.totalTransfer * (0.45 + 0.55 * cellH);
          const addThickness =
            depositGain *
            strand.ridgeHeight *
            ridgeProfile *
            cellTransfer *
            (1 + pooling.poolingFactor * 0.45) *
            0.38;

          const prevThick = thickness[idx] ?? 0;
          thickness[idx] = clampBrushNumber(prevThick + addThickness, 0, 3.2);

          const alpha = clampBrushNumber(addThickness * 1.65, 0, 1);
          const targetL = clampBrushNumber(
            params.pigmentOklch.l - pooling.haloDarkening * 0.22,
            0.12,
            0.92,
          );
          pigmentL[idx] = (pigmentL[idx] ?? 0.94) * (1 - alpha) + targetL * alpha;
          pigmentC[idx] = (pigmentC[idx] ?? 0.01) * (1 - alpha) + params.pigmentOklch.c * alpha;
          pigmentH[idx] = params.pigmentOklch.h;
          wetnessMap[idx] = Math.max(wetnessMap[idx] ?? 0, params.wetness * strand.inkLoad);
        }
      }
    }

    sampleMetrics.push({
      distancePx: accumulatedDistance,
      inkReserve,
      starvationBreakup,
      pooling,
      tineSplit,
      transfer,
      tipFlatWidthMm: tipWear.currentFlatWidthMm,
    });
  }

  let peakThickness = 0;
  let thickSum = 0;
  let coveredCount = 0;
  for (let i = 0; i < total; i += 1) {
    const val = thickness[i] ?? 0;
    if (val > peakThickness) peakThickness = val;
    thickSum += val;
    if (val > 0.02) coveredCount += 1;
  }

  const impasto: ImpastoBuffer25D = {
    width: safeW,
    height: safeH,
    thickness,
    pigmentL,
    pigmentC,
    pigmentH,
    wetnessMap,
    peakThickness,
    meanThickness: total > 0 ? thickSum / total : 0,
    coverageRatio: total > 0 ? coveredCount / total : 0,
  };

  const shading = shadeImpastoRakingLight(impasto, params.rakingLight);

  return {
    paper,
    impasto,
    shading,
    finalBristles,
    finalTipWear: tipWear,
    peakTineSplitPx,
    endInkReserve: inkReserve,
    maxStarvationBreakup,
    endPoolingFactor,
    samples: sampleMetrics,
  };
}
