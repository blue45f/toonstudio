/**
 * 결정론적 브러시 댑(dab) 생성기 및 물리 곡선 리샘플러.
 *
 * 동일 프리셋 + 동일 스트로크 포인트 입력에 대해 100% 동일한 스탬프 좌표·각도·필압·색상·입자
 * 시퀀스를 생성하며, 2D Canvas 렌더러와 단위 테스트가 함께 사용한다.
 */
import type {
  GenerateMasterBrushDabsOptions,
  GlobalMasterBrushDab,
  GlobalMasterBrushPreset,
  GlobalMasterRgbTuple,
  GlobalMasterStrokePoint,
} from "./global-master-brush-types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 문자열 시드에서 32비트 FNV-1a 해시를 계산한다. */
export function hashBrushSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 32비트 정수 시드 기반 결정론적 난수 생성기(Mulberry32). */
export function createDeterministicRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgbToHsl(rgb: GlobalMasterRgbTuple): readonly [number, number, number] {
  const r = clamp(rgb[0], 0, 255) / 255;
  const g = clamp(rgb[1], 0, 255) / 255;
  const b = clamp(rgb[2], 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (delta > 1e-6) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / delta + 2) / 6;
    } else {
      h = ((r - g) / delta + 4) / 6;
    }
  }
  return [h * 360, s, l];
}

function hueToChannel(p: number, q: number, tInput: number): number {
  let t = tInput;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(hDeg: number, s: number, l: number): GlobalMasterRgbTuple {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const sat = clamp(s, 0, 1);
  const lum = clamp(l, 0, 1);
  if (sat <= 1e-6) {
    const gray = Math.round(lum * 255);
    return [gray, gray, gray];
  }
  const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
  const p = 2 * lum - q;
  return [
    Math.round(clamp(hueToChannel(p, q, h + 1 / 3), 0, 1) * 255),
    Math.round(clamp(hueToChannel(p, q, h), 0, 1) * 255),
    Math.round(clamp(hueToChannel(p, q, h - 1 / 3), 0, 1) * 255),
  ];
}

function computeDabRgb(
  baseRgb: GlobalMasterRgbTuple,
  preset: GlobalMasterBrushPreset,
  progress: number,
  randHue: number,
  randSat: number,
  randLum: number,
): GlobalMasterRgbTuple {
  const { colorJitter, km7PigmentMix } = preset;
  const hasJitter =
    colorJitter.hue > 0 || colorJitter.saturation > 0 || colorJitter.luminance > 0;
  if (!hasJitter && km7PigmentMix <= 0.05) {
    return baseRgb;
  }
  const [h, s, l] = rgbToHsl(baseRgb);
  const jitterFactor = colorJitter.perDab ? 1 : 0.45;
  const hDelta = (randHue * 2 - 1) * colorJitter.hue * jitterFactor;
  const sDelta = (randSat * 2 - 1) * colorJitter.saturation * jitterFactor;
  const lDelta = (randLum * 2 - 1) * colorJitter.luminance * jitterFactor;
  // KM7 분광 혼색 비율이 높을수록 스트로크 진행에 따라 채도를 유지하며 미세한 색온도 전이를 부여한다.
  const km7HueShift = Math.sin(progress * Math.PI) * km7PigmentMix * 4.5;
  const km7SatBoost = km7PigmentMix * 0.04 * (1 - progress * 0.4);
  return hslToRgb(
    h + hDelta + km7HueShift,
    clamp(s + sDelta + km7SatBoost, 0, 1),
    clamp(l + lDelta, 0.04, 0.96),
  );
}

/** 프리뷰 캔버스 크기에 맞춘 표현력 높은 S자 샘플 스트로크 포인트를 생성한다. */
export function buildMasterBrushSamplePoints(
  width: number,
  height: number,
  preset: GlobalMasterBrushPreset,
): readonly GlobalMasterStrokePoint[] {
  const padX = Math.max(14, width * 0.1);
  const usableW = Math.max(24, width - padX * 2);
  const midY = height * 0.52;
  const waveAmp =
    preset.category === "manga-tone-speed" || preset.tipProfile.shape === "anamorphic-flare"
      ? height * 0.14
      : height * 0.25;

  const sampleCount = 28;
  const points: GlobalMasterStrokePoint[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / (sampleCount - 1);
    const x = padX + usableW * t;
    const wave = Math.sin(t * Math.PI * 1.85 - 0.35) * waveAmp;
    const secondary = Math.sin(t * Math.PI * 3.2) * (waveAmp * 0.12);
    const y = clamp(midY - wave + secondary, height * 0.18, height * 0.84);
    const bell = Math.sin(t * Math.PI);
    const swell = 0.22 + 0.78 * Math.pow(clamp(bell, 0, 1), 0.62);
    const pressure = clamp(swell + Math.sin(t * Math.PI * 3) * 0.08, 0.12, 1.0);
    points.push({
      x,
      y,
      pressure,
      tiltX: 16 * Math.sin(t * Math.PI),
      tiltY: 10 * Math.cos(t * Math.PI),
      timestampMs: i * 14,
    });
  }
  return points;
}

/**
 * 입력 스트로크 포인트열로부터 프리셋의 물리·산란·테이퍼·필압·회전·KM7 색변동이 반영된
 * 결정론적 브러시 댑(dab) 배열을 생성한다.
 */
export function generateMasterBrushDabs(
  preset: GlobalMasterBrushPreset,
  points: readonly GlobalMasterStrokePoint[],
  options: GenerateMasterBrushDabsOptions = {},
): readonly GlobalMasterBrushDab[] {
  if (points.length === 0) return [];

  const sizeScale = clamp(options.sizeScale ?? 1, 0.2, 3.5);
  const maxDabs = clamp(options.maxDabs ?? 420, 12, 1200);
  const baseInk = options.inkRgb ?? preset.defaultInkRgb;
  const baseDiameter = Math.max(2, preset.defaultSizePx * sizeScale);
  const stepDistance = Math.max(0.9, baseDiameter * clamp(preset.spacing, 0.04, 1.5));

  // 누적 호길이 계산
  const cumulativeLengths: number[] = [0];
  let totalLength = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    totalLength += Math.hypot(curr.x - prev.x, curr.y - prev.y);
    cumulativeLengths.push(totalLength);
  }

  // 단일 점(탭) 스트로크 처리
  const rng = createDeterministicRng(hashBrushSeed(`${preset.id}:${preset.tipProfile.shape}`));
  const baseAngleRad = (preset.tipProfile.angleDeg * Math.PI) / 180;
  const dabs: GlobalMasterBrushDab[] = [];

  const emitAtSample = (
    stepIndex: number,
    x: number,
    y: number,
    tangentRad: number,
    rawPressure: number,
    progress: number,
    segmentSpeed: number,
    tiltMagnitude: number,
  ): void => {
    const startEnv =
      preset.taperStart > 0.005 ? smoothstep(0, preset.taperStart, progress) : 1;
    const endEnv =
      preset.taperEnd > 0.005 ? smoothstep(0, preset.taperEnd, 1 - progress) : 1;
    const taper = Math.max(0.08, Math.min(startEnv, endEnv));

    const curvedP = Math.pow(clamp(rawPressure, 0.04, 1), preset.pressureCurve.gamma);
    const speedNorm = clamp(segmentSpeed / 2.2, 0, 1);
    const velocityMod = clamp(
      1 - speedNorm * preset.pressureCurve.velocityInfluence * 0.48,
      0.38,
      1.32,
    );
    const sizeFactor =
      (preset.pressureCurve.minSizeRatio +
        (1 - preset.pressureCurve.minSizeRatio) * curvedP) *
      taper *
      velocityMod;
    const opacityFactor =
      (preset.pressureCurve.minOpacityRatio +
        (1 - preset.pressureCurve.minOpacityRatio) * curvedP) *
      (0.35 + 0.65 * taper);

    const tiltBoost = 1 + tiltMagnitude * preset.pressureCurve.tiltShading * 0.45;
    const baseRadiusX = Math.max(
      0.8,
      baseDiameter * 0.5 * sizeFactor * preset.tipProfile.ribbonWidthFactor * tiltBoost,
    );
    const baseRadiusY = Math.max(
      0.6,
      baseDiameter * 0.5 * sizeFactor * preset.tipProfile.aspectRatio,
    );

    const scatter = preset.scattering;
    const jitterCount =
      scatter.countJitter > 0
        ? Math.round((rng() * 2 - 1) * scatter.count * scatter.countJitter)
        : 0;
    const particleCount = clamp(scatter.count + jitterCount, 1, 10);

    const perpRad = tangentRad + Math.PI / 2;
    for (let pIdx = 0; pIdx < particleCount; pIdx += 1) {
      if (dabs.length >= maxDabs) return;

      const r1 = rng();
      const r2 = rng();
      const rRot = rng();
      const rHue = rng();
      const rSat = rng();
      const rLum = rng();
      const rGrain = rng();

      const offsetPerp = (r1 * 2 - 1) * scatter.scatterX * baseDiameter * 0.55;
      const offsetAlong = scatter.bothAxes
        ? (r2 * 2 - 1) * scatter.scatterY * baseDiameter * 0.55
        : (r2 - 0.5) * scatter.scatterY * baseDiameter * 0.35;

      const dabX =
        x + Math.cos(perpRad) * offsetPerp + Math.cos(tangentRad) * offsetAlong;
      const dabY =
        y + Math.sin(perpRad) * offsetPerp + Math.sin(tangentRad) * offsetAlong;

      const rotJitterRad = (rRot * 2 - 1) * Math.PI * preset.rotationJitter;
      const angleRad =
        (preset.tipProfile.followDirection ? tangentRad : 0) +
        baseAngleRad +
        rotJitterRad;

      const particleScale = particleCount > 1 ? 0.66 + r2 * 0.52 : 1;
      const opacity = clamp(
        preset.defaultOpacity *
          opacityFactor *
          (particleCount > 1 ? 0.72 + r1 * 0.28 : 1),
        0.04,
        1,
      );

      const grainFactor = clamp(
        1 - preset.grainTexture.depth * (0.28 + rGrain * 0.42),
        0.24,
        1,
      );
      const dualScale = preset.dualTipProfile?.enabled
        ? preset.dualTipProfile.scaleRatio
        : 0;
      const dualAngleRad = preset.dualTipProfile?.enabled
        ? angleRad + (preset.dualTipProfile.rotationOffsetDeg * Math.PI) / 180
        : angleRad;

      const rgb = computeDabRgb(baseInk, preset, progress, rHue, rSat, rLum);
      const dabSeed = hashBrushSeed(`${preset.id}:${stepIndex}:${pIdx}`);

      dabs.push({
        index: dabs.length,
        x: Math.round(dabX * 100) / 100,
        y: Math.round(dabY * 100) / 100,
        radiusX: Math.round(baseRadiusX * particleScale * 100) / 100,
        radiusY: Math.round(baseRadiusY * particleScale * 100) / 100,
        angleRad: Math.round(angleRad * 1000) / 1000,
        opacity: Math.round(opacity * 1000) / 1000,
        pressure: Math.round(curvedP * 1000) / 1000,
        progress: Math.round(progress * 1000) / 1000,
        seed: dabSeed,
        rgb,
        wetEdgeStrength: preset.wetness,
        impastoRidge: preset.impastoHeight,
        grainFactor: Math.round(grainFactor * 1000) / 1000,
        dualTipScale: dualScale,
        dualTipAngleRad: Math.round(dualAngleRad * 1000) / 1000,
        tipShape: preset.tipProfile.shape,
        blendBehavior: preset.blendBehavior,
      });
    }
  };

  if (points.length === 1 || totalLength < 0.5) {
    const pt = points[0]!;
    emitAtSample(0, pt.x, pt.y, 0, pt.pressure, 0.5, 0.3, 0.15);
    return dabs;
  }

  const stepCount = Math.max(2, Math.min(maxDabs, Math.ceil(totalLength / stepDistance) + 1));
  let segIndex = 0;

  for (let s = 0; s < stepCount; s += 1) {
    if (dabs.length >= maxDabs) break;
    const progress = stepCount > 1 ? s / (stepCount - 1) : 0.5;
    const targetDist = progress * totalLength;

    while (
      segIndex < points.length - 2 &&
      (cumulativeLengths[segIndex + 1] ?? 0) < targetDist
    ) {
      segIndex += 1;
    }

    const p0 = points[segIndex]!;
    const p1 = points[segIndex + 1] ?? p0;
    const segStart = cumulativeLengths[segIndex] ?? 0;
    const segEnd = cumulativeLengths[segIndex + 1] ?? segStart;
    const segLen = Math.max(1e-5, segEnd - segStart);
    const localT = clamp((targetDist - segStart) / segLen, 0, 1);

    const x = p0.x + (p1.x - p0.x) * localT;
    const y = p0.y + (p1.y - p0.y) * localT;
    const pressure = p0.pressure + (p1.pressure - p0.pressure) * localT;
    const tangentRad = Math.atan2(p1.y - p0.y, p1.x - p0.x);

    const dt =
      p0.timestampMs !== undefined && p1.timestampMs !== undefined
        ? Math.max(4, p1.timestampMs - p0.timestampMs)
        : 16;
    const speed = segLen / dt;
    const tiltX = (p0.tiltX ?? 0) + ((p1.tiltX ?? 0) - (p0.tiltX ?? 0)) * localT;
    const tiltY = (p0.tiltY ?? 0) + ((p1.tiltY ?? 0) - (p0.tiltY ?? 0)) * localT;
    const tiltMag = clamp(Math.hypot(tiltX, tiltY) / 60, 0, 1);

    emitAtSample(s, x, y, tangentRad, pressure, progress, speed, tiltMag);
  }

  return dabs;
}
