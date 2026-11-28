/**
 * Wave 133 — 3-심도(근/중/원경) 시차 날씨 파티클장 결정론적 합성 솔버.
 *
 * - Beer-Lambert 대기 투과율, 얼굴·말풍선 선분 무가림 우회·컬링, 얇은 렌즈 보케 불변식과
 *   순수 ES2017 FIPS 180-4 SHA-256 매니페스트 지문을 통합한다.
 */

import {
  DEPTH_LAYER_BOUNDS_METERS,
  DEPTH_LAYER_IDS,
  canonicalizeWeatherManifestJson,
  clampFinite,
  formatOklchCss,
  getWeatherPreset,
  sha256Wave133Hex,
  type AtmosphericWeatherFieldRequest,
  type AtmosphericWeatherFieldResult,
  type AtmosphericWeatherInvariants,
  type AtmosphericWeatherParticle,
  type DepthLayerId,
  type DepthLayerSummaryMetrics,
  type NormalizedKeepOutBox,
  type WeatherPresetSpec,
} from "./atmospheric-weather-types";
import {
  auditKeepOutOcclusions,
  buildFogBands,
  buildSegmentEndpoints,
  computeAtmosphericTransmittance,
  doesSegmentIntersectExpandedBox,
  findBlockingBox,
  normalizeKeepOutBoxes,
  sampleTransmittanceCurve,
  tryRelocateOutsideKeepOut,
  verifyMonotonicTransmittance,
  type DeterministicRng,
} from "./atmospheric-weather-keepout-and-optics";

export {
  auditKeepOutOcclusions,
  computeAtmosphericTransmittance,
  doesSegmentIntersectExpandedBox,
  sampleTransmittanceCurve,
};

function hashSeedWithLabel(seed: number, label: string): number {
  let state = (Math.floor(clampFinite(seed, 0, 0xffffffff, 13301)) >>> 0) ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i += 1) {
    state = Math.imul(state ^ label.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return state >>> 0;
}

function createMulberry32(initialSeed: number): DeterministicRng {
  let state = initialSeed >>> 0;
  const nextUnit = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    nextUnit,
    nextRange: (min: number, max: number): number => min + (max - min) * nextUnit(),
  };
}

interface LayerAllocation {
  readonly layer: DepthLayerId;
  readonly count: number;
}

function allocateLayerCounts(totalBudget: number): readonly LayerAllocation[] {
  const safeTotal = Math.round(clampFinite(totalBudget, 3, 600, 90));
  const fgCount = Math.max(1, Math.round(safeTotal * 0.22));
  const midCount = Math.max(1, Math.round(safeTotal * 0.36));
  const bgCount = Math.max(1, safeTotal - fgCount - midCount);
  return [
    { layer: "foreground", count: fgCount },
    { layer: "midground", count: midCount },
    { layer: "background", count: bgCount },
  ];
}

interface CandidateKinematics {
  readonly depthMeters: number;
  readonly radiusPx: number;
  readonly vxPxPerSec: number;
  readonly vyPxPerSec: number;
  readonly speedPxPerSec: number;
  readonly tiltDeg: number;
  readonly streakLengthPx: number;
  readonly bokehBlurPx: number;
  readonly transmittance: number;
  readonly fogBlend: number;
  readonly opacity: number;
  readonly motionJitterPx: number;
  readonly colorOklchCss: string;
}

function sampleLayerKinematics(
  layer: DepthLayerId,
  preset: WeatherPresetSpec,
  rng: DeterministicRng,
  effectiveWindX: number,
  effectiveWindY: number,
  extinctionBeta: number,
  focusStartMeters: number,
  focalDepthMeters: number,
  prefersReducedMotion: boolean,
): CandidateKinematics {
  const bounds = DEPTH_LAYER_BOUNDS_METERS[layer];
  const depthMeters =
    layer === "foreground"
      ? rng.nextRange(bounds.minMeters, bounds.maxMeters - 0.08)
      : layer === "midground"
        ? rng.nextRange(bounds.minMeters + 0.15, bounds.maxMeters - 0.25)
        : rng.nextRange(bounds.minMeters + 0.25, bounds.maxMeters);

  // 심도별 분리된 배율 구간으로 물리 비례 불변식(근경 > 중경 > 원경)을 엄격 보존한다.
  const sizeMultiplier =
    layer === "foreground"
      ? rng.nextRange(1.62, 2.38)
      : layer === "midground"
        ? rng.nextRange(0.88, 1.18)
        : rng.nextRange(0.36, 0.58);
  const radiusPx = preset.baseRadiusPx * sizeMultiplier;

  const parallaxMultiplier =
    layer === "foreground"
      ? rng.nextRange(1.52, 2.02)
      : layer === "midground"
        ? rng.nextRange(0.88, 1.12)
        : rng.nextRange(0.32, 0.54);

  const motionScale = prefersReducedMotion ? 0.35 : 1.0;
  const turbScale = prefersReducedMotion ? 0 : 1.0;
  const turbX = rng.nextRange(-preset.turbulenceAmpPxPerSec, preset.turbulenceAmpPxPerSec) * turbScale;
  const turbY = rng.nextRange(-preset.turbulenceAmpPxPerSec * 0.45, preset.turbulenceAmpPxPerSec * 0.45) * turbScale;

  const windMagX = Math.abs(effectiveWindX);
  const boundedTurbX =
    windMagX > 1e-3 ? clampFinite(turbX, -windMagX * 0.35, windMagX * 0.35, 0) : turbX;

  const vxPxPerSec = (effectiveWindX + boundedTurbX) * parallaxMultiplier * motionScale;
  const vyPxPerSec = (preset.baseGravityPxPerSec + effectiveWindY + turbY) * parallaxMultiplier * motionScale;
  const speedPxPerSec = Math.hypot(vxPxPerSec, vyPxPerSec);
  const tiltDeg = (Math.atan2(vxPxPerSec, Math.abs(vyPxPerSec) + 1e-3) * 180) / Math.PI;

  const rawStreak =
    preset.shape === "rain-streak"
      ? Math.max(radiusPx * 6.5, speedPxPerSec * preset.baseStreakFactor)
      : preset.shape === "ember-spark"
        ? Math.max(radiusPx * 2.2, speedPxPerSec * preset.baseStreakFactor)
        : preset.shape === "petal"
          ? radiusPx * 2.1
          : radiusPx * 1.4;

  const streakLengthPx = prefersReducedMotion
    ? Math.min(rawStreak, preset.reducedMotionMaxStreakPx)
    : Math.min(rawStreak, 140);

  const beer = computeAtmosphericTransmittance(depthMeters, extinctionBeta, focusStartMeters);

  // 얇은 렌즈 착란원(CoC) 기반 보케 블러: 중경 초점면이 항상 가장 선명하다.
  const cocBase = Math.abs(depthMeters - focalDepthMeters) / Math.max(depthMeters, 0.4);
  const bokehBlurPx =
    layer === "midground"
      ? clampFinite(cocBase * preset.bokehApertureGain * 0.28, 0.08, 0.85, 0.35)
      : layer === "foreground"
        ? clampFinite(2.4 + cocBase * preset.bokehApertureGain * 0.95, 2.6, 11.5, 4.2)
        : clampFinite(1.9 + cocBase * preset.bokehApertureGain * 1.15 + beer.fogBlend * 2.4, 2.0, 9.5, 3.4);

  const useAccent = rng.nextUnit() > 0.62;
  const baseColor = useAccent ? preset.particleAccentOklch : preset.particlePrimaryOklch;
  const blendedColor = {
    l: baseColor.l * (1 - beer.fogBlend * 0.48) + preset.fogOklch.l * (beer.fogBlend * 0.48),
    c: baseColor.c * (1 - beer.fogBlend * 0.52) + preset.fogOklch.c * (beer.fogBlend * 0.52),
    h: baseColor.h,
  };
  const layerAlpha = layer === "foreground" ? 0.86 : layer === "midground" ? 0.92 : 0.68;
  const opacity = clampFinite(layerAlpha * (0.38 + 0.62 * beer.transmittance), 0.14, 0.96, 0.72);
  const motionJitterPx = prefersReducedMotion ? 0 : rng.nextRange(0.4, 2.8) * parallaxMultiplier;

  return {
    depthMeters,
    radiusPx,
    vxPxPerSec,
    vyPxPerSec,
    speedPxPerSec,
    tiltDeg,
    streakLengthPx,
    bokehBlurPx,
    transmittance: beer.transmittance,
    fogBlend: beer.fogBlend,
    opacity,
    motionJitterPx,
    colorOklchCss: formatOklchCss(blendedColor, opacity),
  };
}

function summarizeLayerMetrics(
  layer: DepthLayerId,
  particles: readonly AtmosphericWeatherParticle[],
): DepthLayerSummaryMetrics {
  const bounds = DEPTH_LAYER_BOUNDS_METERS[layer];
  const subset = particles.filter((p) => p.layer === layer);
  const count = subset.length;
  if (count === 0) {
    return {
      layer,
      count: 0,
      minDepthMeters: bounds.minMeters,
      maxDepthMeters: bounds.maxMeters,
      meanDepthMeters: (bounds.minMeters + bounds.maxMeters) * 0.5,
      meanRadiusPx: 0,
      meanSpeedPxPerSec: 0,
      meanBokehBlurPx: 0,
      meanTransmittance: 1,
      meanFogBlend: 0,
    };
  }

  let depthSum = 0;
  let radiusSum = 0;
  let speedSum = 0;
  let blurSum = 0;
  let transSum = 0;
  let fogSum = 0;
  for (const p of subset) {
    depthSum += p.depthMeters;
    radiusSum += p.radiusPx;
    speedSum += p.speedPxPerSec;
    blurSum += p.bokehBlurPx;
    transSum += p.transmittance;
    fogSum += p.fogBlend;
  }

  return {
    layer,
    count,
    minDepthMeters: bounds.minMeters,
    maxDepthMeters: bounds.maxMeters,
    meanDepthMeters: depthSum / count,
    meanRadiusPx: radiusSum / count,
    meanSpeedPxPerSec: speedSum / count,
    meanBokehBlurPx: blurSum / count,
    meanTransmittance: transSum / count,
    meanFogBlend: fogSum / count,
  };
}

/**
 * 5종 정규 웹툰 날씨 프리셋 기반 3-심도 대기 원근·Beer-Lambert 산란 안개·
 * 주인공 얼굴·말풍선 무가림(0건) 파티클장을 결정론적으로 합성한다.
 */
export function synthesizeAtmosphericWeatherField(
  request: AtmosphericWeatherFieldRequest,
): AtmosphericWeatherFieldResult {
  const preset = getWeatherPreset(request.presetId);
  const viewportWidthPx = Math.round(clampFinite(request.viewportWidthPx ?? 800, 160, 4096, 800));
  const viewportHeightPx = Math.round(clampFinite(request.viewportHeightPx ?? 1200, 160, 8192, 1200));
  const seed = Math.floor(clampFinite(request.seed ?? 13301, 0, 0xffffffff, 13301)) >>> 0;
  const requestedParticleBudget = Math.round(
    clampFinite(
      request.particleBudget ?? preset.defaultParticleBudget,
      3,
      600,
      preset.defaultParticleBudget,
    ),
  );
  const extinctionBeta = clampFinite(
    request.extinctionBeta ?? preset.defaultExtinctionBeta,
    0.001,
    5.0,
    preset.defaultExtinctionBeta,
  );
  const focusStartMeters = clampFinite(
    request.focusStartMeters ?? preset.defaultFocusStartMeters,
    0.5,
    10.0,
    preset.defaultFocusStartMeters,
  );
  const focalDepthMeters = clampFinite(
    request.focalDepthMeters ?? preset.defaultFocalDepthMeters,
    DEPTH_LAYER_BOUNDS_METERS.midground.minMeters + 0.2,
    DEPTH_LAYER_BOUNDS_METERS.midground.maxMeters - 0.2,
    preset.defaultFocalDepthMeters,
  );
  const effectiveWindX = clampFinite(
    request.windX ?? preset.defaultWindX,
    -800,
    800,
    preset.defaultWindX,
  );
  const effectiveWindY = clampFinite(
    request.windY ?? preset.defaultWindY,
    -600,
    600,
    preset.defaultWindY,
  );
  const prefersReducedMotion = Boolean(request.prefersReducedMotion);
  const elapsedSeconds = prefersReducedMotion
    ? 0
    : clampFinite(request.elapsedSeconds ?? 0, 0, 3600, 0);
  const keepOutPaddingPx = clampFinite(request.keepOutPaddingPx ?? 8, 0, 64, 8);

  const faceKeepOutBoxes = normalizeKeepOutBoxes(
    request.faceKeepOutBoxes,
    "face",
    viewportWidthPx,
    viewportHeightPx,
    keepOutPaddingPx,
  );
  const balloonKeepOutBoxes = normalizeKeepOutBoxes(
    request.balloonKeepOutBoxes,
    "balloon",
    viewportWidthPx,
    viewportHeightPx,
    keepOutPaddingPx,
  );
  const allKeepOutBoxes: readonly NormalizedKeepOutBox[] = [
    ...faceKeepOutBoxes,
    ...balloonKeepOutBoxes,
  ];

  const rng = createMulberry32(hashSeedWithLabel(seed, preset.id));
  const allocations = allocateLayerCounts(requestedParticleBudget);
  const particles: AtmosphericWeatherParticle[] = [];
  let relocatedCount = 0;
  let culledCount = 0;
  let nextParticleId = 1;

  for (const allocation of allocations) {
    for (let i = 0; i < allocation.count; i += 1) {
      const kinematics = sampleLayerKinematics(
        allocation.layer,
        preset,
        rng,
        effectiveWindX,
        effectiveWindY,
        extinctionBeta,
        focusStartMeters,
        focalDepthMeters,
        prefersReducedMotion,
      );

      const rawX = rng.nextRange(8, viewportWidthPx - 8);
      const rawY = rng.nextRange(8, viewportHeightPx - 8);
      const advectedX =
        (((rawX + kinematics.vxPxPerSec * elapsedSeconds) % viewportWidthPx) + viewportWidthPx) %
        viewportWidthPx;
      const advectedY =
        (((rawY + kinematics.vyPxPerSec * elapsedSeconds) % viewportHeightPx) + viewportHeightPx) %
        viewportHeightPx;

      let finalX = clampFinite(advectedX, 2, viewportWidthPx - 2, viewportWidthPx * 0.5);
      let finalY = clampFinite(advectedY, 2, viewportHeightPx - 2, viewportHeightPx * 0.5);
      let seg = buildSegmentEndpoints(
        finalX,
        finalY,
        kinematics.vxPxPerSec,
        kinematics.vyPxPerSec,
        kinematics.streakLengthPx,
      );
      let relocationStatus: "original" | "relocated" = "original";

      const visualRadius = kinematics.radiusPx + kinematics.bokehBlurPx * 0.25;
      const blockingBox = findBlockingBox(finalX, finalY, seg, visualRadius, allKeepOutBoxes);
      if (blockingBox !== null) {
        const relocated = tryRelocateOutsideKeepOut(
          finalX,
          finalY,
          blockingBox,
          kinematics,
          allKeepOutBoxes,
          viewportWidthPx,
          viewportHeightPx,
          rng,
        );
        if (relocated === null) {
          culledCount += 1;
          continue;
        }
        finalX = relocated.x;
        finalY = relocated.y;
        seg = relocated.seg;
        relocationStatus = "relocated";
        relocatedCount += 1;
      }

      particles.push({
        id: nextParticleId,
        layer: allocation.layer,
        shape: preset.shape,
        depthMeters: kinematics.depthMeters,
        x: finalX,
        y: finalY,
        x1: seg.x1,
        y1: seg.y1,
        x2: seg.x2,
        y2: seg.y2,
        vxPxPerSec: kinematics.vxPxPerSec,
        vyPxPerSec: kinematics.vyPxPerSec,
        speedPxPerSec: kinematics.speedPxPerSec,
        tiltDeg: kinematics.tiltDeg,
        radiusPx: kinematics.radiusPx,
        streakLengthPx: kinematics.streakLengthPx,
        bokehBlurPx: kinematics.bokehBlurPx,
        transmittance: kinematics.transmittance,
        fogBlend: kinematics.fogBlend,
        opacity: kinematics.opacity,
        motionJitterPx: kinematics.motionJitterPx,
        relocationStatus,
        colorOklchCss: kinematics.colorOklchCss,
      });
      nextParticleId += 1;
    }
  }

  const occlusionAudit = auditKeepOutOcclusions(particles, faceKeepOutBoxes, balloonKeepOutBoxes);
  const layerMetrics: Record<DepthLayerId, DepthLayerSummaryMetrics> = {
    foreground: summarizeLayerMetrics("foreground", particles),
    midground: summarizeLayerMetrics("midground", particles),
    background: summarizeLayerMetrics("background", particles),
  };

  const transmittanceCurve = sampleTransmittanceCurve(extinctionBeta, focusStartMeters);
  const fogBands = buildFogBands(preset, extinctionBeta, focusStartMeters);
  const animatedFlickerHz = prefersReducedMotion ? 0 : preset.defaultFlickerHz;
  const maxMotionJitterPx = particles.reduce(
    (maxVal, p) => (p.motionJitterPx > maxVal ? p.motionJitterPx : maxVal),
    0,
  );

  const hasAllThreeLayers = DEPTH_LAYER_IDS.every((layer) => layerMetrics[layer].count > 0);
  const invariants: AtmosphericWeatherInvariants = {
    transmittanceStrictlyMonotonic: verifyMonotonicTransmittance(
      transmittanceCurve,
      extinctionBeta,
      focusStartMeters,
    ),
    sizeHierarchyValid: hasAllThreeLayers
      ? layerMetrics.foreground.meanRadiusPx > layerMetrics.midground.meanRadiusPx &&
        layerMetrics.midground.meanRadiusPx > layerMetrics.background.meanRadiusPx
      : true,
    speedHierarchyValid: hasAllThreeLayers
      ? layerMetrics.foreground.meanSpeedPxPerSec > layerMetrics.midground.meanSpeedPxPerSec &&
        layerMetrics.midground.meanSpeedPxPerSec > layerMetrics.background.meanSpeedPxPerSec
      : true,
    midgroundSharpestBokeh: hasAllThreeLayers
      ? layerMetrics.midground.meanBokehBlurPx < layerMetrics.foreground.meanBokehBlurPx &&
        layerMetrics.midground.meanBokehBlurPx < layerMetrics.background.meanBokehBlurPx
      : true,
    zeroFaceAndBalloonOcclusion: occlusionAudit.heroFaceAndBalloonOcclusionCount === 0,
    reducedMotionSafe: !prefersReducedMotion || (animatedFlickerHz === 0 && maxMotionJitterPx === 0),
  };

  const manifestPayload = {
    schemaVersion: "wave133-weather-field-v1",
    presetId: preset.id,
    seed,
    viewportWidthPx,
    viewportHeightPx,
    extinctionBeta: Number(extinctionBeta.toFixed(6)),
    focusStartMeters: Number(focusStartMeters.toFixed(4)),
    focalDepthMeters: Number(focalDepthMeters.toFixed(4)),
    effectiveWindX: Number(effectiveWindX.toFixed(4)),
    effectiveWindY: Number(effectiveWindY.toFixed(4)),
    prefersReducedMotion,
    animatedFlickerHz,
    relocatedCount,
    culledCount,
    heroFaceAndBalloonOcclusionCount: occlusionAudit.heroFaceAndBalloonOcclusionCount,
    faceKeepOutBoxes,
    balloonKeepOutBoxes,
    particleDigestRows: particles.map((p) => [
      p.id,
      p.layer,
      Number(p.depthMeters.toFixed(4)),
      Number(p.x.toFixed(2)),
      Number(p.y.toFixed(2)),
      Number(p.radiusPx.toFixed(3)),
      Number(p.bokehBlurPx.toFixed(3)),
      p.relocationStatus,
    ]),
  };
  const weatherFieldSha256Hex = sha256Wave133Hex(canonicalizeWeatherManifestJson(manifestPayload));

  return {
    schemaVersion: "wave133-weather-field-v1",
    presetId: preset.id,
    preset,
    seed,
    viewportWidthPx,
    viewportHeightPx,
    extinctionBeta,
    focusStartMeters,
    focalDepthMeters,
    effectiveWindX,
    effectiveWindY,
    prefersReducedMotion,
    animatedFlickerHz,
    maxMotionJitterPx,
    requestedParticleBudget,
    particles,
    relocatedCount,
    culledCount,
    faceKeepOutBoxes,
    balloonKeepOutBoxes,
    occlusionAudit,
    heroFaceAndBalloonOcclusionCount: occlusionAudit.heroFaceAndBalloonOcclusionCount,
    layerMetrics,
    transmittanceCurve,
    fogBands,
    invariants,
    weatherFieldSha256Hex,
  };
}
