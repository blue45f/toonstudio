/**
 * 2D/2.5D 화면 공간 라디오시티 간접광 번짐(Screen-Space Radiosity & Bounce Color Bleeding),
 * 서예풍 예각 먹물 맺힘·G펜 끝빠짐 조형기(Calligraphic Ink-Trap & Razor Taper Sculptor),
 * 미세 비대칭 표정·구면 각막 반사 안구 하이라이트 합성기(Eye-Catchlight Composer).
 *
 * - 서버 호출 0회(₩0), 모든 연산을 클라이언트 결정론 부동소수점 커널로 수행한다.
 * - 다중 스케일 수평선 링과 코사인 형태 계수(Form-Factor)·깊이/마스크 차폐로 배경 발광색이
 *   전경 캐릭터 그림자 외곽에 자연스럽게 스며들어 종이 인형처럼 따로 노는 현상을 없앤다.
 * - 선 교차 내각(`θ < 110°`)에서 모세관 먹물 맺힘 필렛을 합성하고, 3차 에르미트(Cubic-Hermite)
 *   곡선으로 G펜 특유의 날카로운 끝빠짐을 만든다.
 * - 3D 각막 구면 반사 벡터(`R = I - 2(N·I)N`), 반대편 하단 홍채 반사광 초승달, 자연스러운 `1~2°`
 *   양안 수렴각과 좌우 미세 비대칭 눈매를 물리 기반으로 배치한다.
 */

export type Vec2Tuple = readonly [number, number];
export type Vec3Tuple = readonly [number, number, number];
export type LinearRgbTuple = readonly [number, number, number];

export type RadiosityMoodPresetId = "sunset-warm-bleed" | "magic-circle-cyan" | "campfire-amber" | "custom";

export interface RadiosityHorizonRing {
  readonly radiusPx: number;
  readonly angularSampleCount: number;
  readonly ringWeight: number;
}

export interface RadiosityMoodPreset {
  readonly id: RadiosityMoodPresetId;
  readonly labelKo: string;
  readonly tintScaleRgb: LinearRgbTuple;
  readonly defaultBleedIntensity: number;
  readonly silhouetteWrapBias: number;
}

export const RADIOSITY_MOOD_PRESETS: Readonly<Record<Exclude<RadiosityMoodPresetId, "custom">, RadiosityMoodPreset>> = {
  "sunset-warm-bleed": { id: "sunset-warm-bleed", labelKo: "노을 역광 간접 번짐", tintScaleRgb: [1.18, 0.78, 0.46], defaultBleedIntensity: 0.52, silhouetteWrapBias: 0.28 },
  "magic-circle-cyan": { id: "magic-circle-cyan", labelKo: "청록 마법진 반사광", tintScaleRgb: [0.42, 0.96, 1.16], defaultBleedIntensity: 0.48, silhouetteWrapBias: 0.24 },
  "campfire-amber": { id: "campfire-amber", labelKo: "모닥불 호박색 잔광", tintScaleRgb: [1.22, 0.72, 0.34], defaultBleedIntensity: 0.5, silhouetteWrapBias: 0.3 },
};

export const DEFAULT_RADIOSITY_HORIZON_RINGS: readonly RadiosityHorizonRing[] = [
  { radiusPx: 3, angularSampleCount: 8, ringWeight: 0.46 },
  { radiusPx: 8, angularSampleCount: 12, ringWeight: 0.34 },
  { radiusPx: 18, angularSampleCount: 16, ringWeight: 0.2 },
];

export interface ScreenSpaceRadiosityInput {
  readonly width: number;
  readonly height: number;
  /** 배경 발광·조명 선형 RGBA 버퍼 (길이 = width * height * 4, A는 발광 가중치). */
  readonly backgroundEmissiveRgbaLinear: Float32Array;
  /** 전경 캐릭터 알베도 선형 RGBA 버퍼 (길이 = width * height * 4, A는 전경 불투명도). */
  readonly foregroundAlbedoRgbaLinear: Float32Array;
  /** 전경 그림자 마스크 (길이 = width * height, 1 = 그림자 영역, 0 = 직사광 영역). */
  readonly foregroundShadowMask?: Float32Array;
  /** 2.5D 깊이 버퍼 (길이 = width * height, 작을수록 카메라에 가까움). */
  readonly depthMap?: Float32Array;
  /** 전경 2D 화면 법선 XY (길이 = width * height * 2). 생략 시 알파 경계에서 자동 추출한다. */
  readonly normalXY?: Float32Array;
  readonly presetId?: RadiosityMoodPresetId;
  readonly customTintScaleRgb?: LinearRgbTuple;
  readonly horizonRings?: readonly RadiosityHorizonRing[];
  readonly bleedIntensity?: number;
  readonly depthSigma?: number;
  readonly occlusionStepCount?: number;
}

export interface ScreenSpaceRadiosityResult {
  readonly width: number;
  readonly height: number;
  readonly compositedRgbaLinear: Float32Array;
  readonly bounceIrradianceRgb: Float32Array;
  readonly resolvedNormalXY: Float32Array;
  readonly activeForegroundPixels: number;
  readonly shadowEdgePixelsAffected: number;
  readonly meanShadowBounceLuminance: number;
  readonly serverCostKrw: 0;
}

export const WGSL_SCREEN_SPACE_RADIOSITY_KERNEL = `
struct RadiosityUniforms {
  dims: vec2<u32>,
  bleedIntensity: f32,
  depthSigma: f32,
  wrapBias: f32,
  ringCount: u32,
};
@group(0) @binding(0) var<uniform> params: RadiosityUniforms;
@group(0) @binding(1) var<storage, read> bgEmissive: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> fgAlbedo: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> outComposite: array<vec4<f32>>;
`;

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clampInt(v: number, min: number, max: number): number {
  const t = Math.trunc(v);
  return t < min ? min : t > max ? max : t;
}

function linearLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function normalize3(v: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len <= 1e-12 ? [0, 0, 1] : [v[0] / len, v[1] / len, v[2] / len];
}

function dot3(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** 전경 실루엣 알파 경계에서 바깥 배경을 향하는 2D 소벨 단위 법선과 가장자리 인접도를 추출한다. */
export function synthesizeSilhouetteNormals2D(
  width: number,
  height: number,
  foregroundRgbaLinear: Float32Array,
): { readonly normalXY: Float32Array; readonly rimProximity: Float32Array } {
  const pixelCount = width * height;
  const normalXY = new Float32Array(pixelCount * 2);
  const rimProximity = new Float32Array(pixelCount);
  const sampleAlpha = (x: number, y: number): number => {
    const cx = clampInt(x, 0, width - 1);
    const cy = clampInt(y, 0, height - 1);
    return clamp(foregroundRgbaLinear[(cy * width + cx) * 4 + 3] ?? 0, 0, 1);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const a00 = sampleAlpha(x - 1, y - 1);
      const a10 = sampleAlpha(x, y - 1);
      const a20 = sampleAlpha(x + 1, y - 1);
      const a01 = sampleAlpha(x - 1, y);
      const a21 = sampleAlpha(x + 1, y);
      const a02 = sampleAlpha(x - 1, y + 1);
      const a12 = sampleAlpha(x, y + 1);
      const a22 = sampleAlpha(x + 1, y + 1);
      const gx = (a00 + 2 * a01 + a02) - (a20 + 2 * a21 + a22);
      const gy = (a00 + 2 * a10 + a20) - (a02 + 2 * a12 + a22);
      const mag = Math.hypot(gx, gy);
      if (mag > 1e-5) {
        normalXY[idx * 2] = gx / mag;
        normalXY[idx * 2 + 1] = gy / mag;
        rimProximity[idx] = clamp(mag * 0.5, 0, 1);
      } else {
        rimProximity[idx] = 0.22;
      }
    }
  }
  return { normalXY, rimProximity };
}

/**
 * 다중 스케일 수평선 링과 코사인 형태 계수·깊이/차폐 감쇠로 배경 발광색을
 * 전경 캐릭터 그림자 가장자리에 물리적으로 번지게 합성한다.
 */
export function computeScreenSpaceRadiosityBounce(
  input: ScreenSpaceRadiosityInput,
): ScreenSpaceRadiosityResult {
  const { width, height, backgroundEmissiveRgbaLinear, foregroundAlbedoRgbaLinear } = input;
  if (width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new RangeError("캔버스 가로·세로 크기는 양의 정수여야 합니다.");
  }
  const pixelCount = width * height;
  if (backgroundEmissiveRgbaLinear.length < pixelCount * 4 || foregroundAlbedoRgbaLinear.length < pixelCount * 4) {
    throw new RangeError("배경·전경 선형 RGBA 버퍼 길이가 해상도와 일치하지 않습니다.");
  }

  const preset = input.presetId && input.presetId !== "custom" ? RADIOSITY_MOOD_PRESETS[input.presetId] : undefined;
  const tintScale: LinearRgbTuple = input.customTintScaleRgb ?? preset?.tintScaleRgb ?? [1, 1, 1];
  const bleedIntensity = clamp(input.bleedIntensity ?? preset?.defaultBleedIntensity ?? 0.45, 0, 2.5);
  const wrapBias = preset?.silhouetteWrapBias ?? 0.26;
  const depthSigma = Math.max(0.02, input.depthSigma ?? 0.22);
  const occlusionStepCount = clampInt(input.occlusionStepCount ?? 4, 1, 12);
  const rings = input.horizonRings && input.horizonRings.length > 0 ? input.horizonRings : DEFAULT_RADIOSITY_HORIZON_RINGS;

  const synthesized = synthesizeSilhouetteNormals2D(width, height, foregroundAlbedoRgbaLinear);
  const resolvedNormalXY = input.normalXY && input.normalXY.length >= pixelCount * 2 ? input.normalXY : synthesized.normalXY;
  const rimProximity = synthesized.rimProximity;
  const compositedRgbaLinear = new Float32Array(pixelCount * 4);
  const bounceIrradianceRgb = new Float32Array(pixelCount * 3);

  let activeForegroundPixels = 0;
  let shadowEdgePixelsAffected = 0;
  let shadowBounceLumSum = 0;
  const refRadius = Math.max(2, rings[0]?.radiusPx ?? 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const off = idx * 4;
      const fgR = foregroundAlbedoRgbaLinear[off] ?? 0;
      const fgG = foregroundAlbedoRgbaLinear[off + 1] ?? 0;
      const fgB = foregroundAlbedoRgbaLinear[off + 2] ?? 0;
      const fgA = clamp(foregroundAlbedoRgbaLinear[off + 3] ?? 0, 0, 1);

      if (fgA <= 1e-4) {
        compositedRgbaLinear[off] = backgroundEmissiveRgbaLinear[off] ?? 0;
        compositedRgbaLinear[off + 1] = backgroundEmissiveRgbaLinear[off + 1] ?? 0;
        compositedRgbaLinear[off + 2] = backgroundEmissiveRgbaLinear[off + 2] ?? 0;
        compositedRgbaLinear[off + 3] = clamp(backgroundEmissiveRgbaLinear[off + 3] ?? 1, 0, 1);
        continue;
      }

      activeForegroundPixels += 1;
      const nx = resolvedNormalXY[idx * 2] ?? 0;
      const ny = resolvedNormalXY[idx * 2 + 1] ?? 0;
      const nMag = Math.hypot(nx, ny);
      const receiverDepth = input.depthMap ? (input.depthMap[idx] ?? 0.5) : 0.35;

      let accumR = 0;
      let accumG = 0;
      let accumB = 0;
      let totalWeight = 0;

      for (let rIdx = 0; rIdx < rings.length; rIdx += 1) {
        const ring = rings[rIdx];
        if (!ring || ring.radiusPx <= 0 || ring.angularSampleCount <= 0) continue;
        const sampleCount = Math.max(4, Math.trunc(ring.angularSampleCount));
        const radialFalloff = 1 / (1 + (ring.radiusPx / refRadius) ** 1.35);
        const phaseOffset = rIdx * GOLDEN_ANGLE;

        for (let s = 0; s < sampleCount; s += 1) {
          const angle = phaseOffset + (s / sampleCount) * Math.PI * 2;
          const dirX = Math.cos(angle);
          const dirY = Math.sin(angle);
          const sx = clampInt(Math.round(x + dirX * ring.radiusPx), 0, width - 1);
          const sy = clampInt(Math.round(y + dirY * ring.radiusPx), 0, height - 1);
          const sIdx = sy * width + sx;
          const sRgba = sIdx * 4;

          const sampleFgAlpha = clamp(foregroundAlbedoRgbaLinear[sRgba + 3] ?? 0, 0, 1);
          const emitterExposure = 1 - sampleFgAlpha * 0.88;
          if (emitterExposure <= 0.02) continue;

          const cosTerm = nMag > 1e-4 ? Math.max(0, (nx * dirX + ny * dirY + wrapBias) / (1 + wrapBias)) : 0.55;
          if (cosTerm <= 1e-4) continue;

          let visibility = 1;
          const emitterDepth = input.depthMap ? (input.depthMap[sIdx] ?? 0.6) : 0.6;
          for (let step = 1; step <= occlusionStepCount; step += 1) {
            const frac = step / (occlusionStepCount + 1);
            const mx = clampInt(Math.round(x + (sx - x) * frac), 0, width - 1);
            const my = clampInt(Math.round(y + (sy - y) * frac), 0, height - 1);
            const mIdx = my * width + mx;
            const midFgAlpha = clamp(foregroundAlbedoRgbaLinear[mIdx * 4 + 3] ?? 0, 0, 1);
            if (step > 1 && midFgAlpha > 0.75) visibility *= 0.68;
            if (input.depthMap) {
              const midDepth = input.depthMap[mIdx] ?? receiverDepth;
              const lineDepth = receiverDepth + (emitterDepth - receiverDepth) * frac;
              if (midDepth + 0.03 < lineDepth) visibility *= 0.58;
            }
          }

          const depthDiff = Math.abs(emitterDepth - receiverDepth);
          const depthCoherence = Math.exp(-(depthDiff * depthDiff) / (2 * depthSigma * depthSigma));
          const formFactor = cosTerm * radialFalloff * visibility * (0.35 + 0.65 * depthCoherence) * ring.ringWeight;
          const emitScale = emitterExposure * clamp(backgroundEmissiveRgbaLinear[sRgba + 3] ?? 1, 0, 2) * formFactor;

          accumR += (backgroundEmissiveRgbaLinear[sRgba] ?? 0) * emitScale;
          accumG += (backgroundEmissiveRgbaLinear[sRgba + 1] ?? 0) * emitScale;
          accumB += (backgroundEmissiveRgbaLinear[sRgba + 2] ?? 0) * emitScale;
          totalWeight += ring.ringWeight / sampleCount;
        }
      }

      const invNorm = totalWeight > 1e-6 ? 1 / totalWeight : 0;
      const irradR = accumR * invNorm * tintScale[0];
      const irradG = accumG * invNorm * tintScale[1];
      const irradB = accumB * invNorm * tintScale[2];
      bounceIrradianceRgb[idx * 3] = irradR;
      bounceIrradianceRgb[idx * 3 + 1] = irradG;
      bounceIrradianceRgb[idx * 3 + 2] = irradB;

      const fgLum = linearLuminance(fgR, fgG, fgB);
      const shadowMaskVal = input.foregroundShadowMask
        ? clamp(input.foregroundShadowMask[idx] ?? 0, 0, 1)
        : clamp(1 - fgLum * 0.9, 0.12, 1);
      const receptivity = shadowMaskVal * (0.42 + 0.58 * (rimProximity[idx] ?? 0.25)) * bleedIntensity;

      const bounceR = irradR * (0.38 + 0.62 * fgR) * receptivity;
      const bounceG = irradG * (0.38 + 0.62 * fgG) * receptivity;
      const bounceB = irradB * (0.38 + 0.62 * fgB) * receptivity;
      const bounceLum = linearLuminance(bounceR, bounceG, bounceB);
      if (shadowMaskVal >= 0.35 && bounceLum > 1e-5) {
        shadowEdgePixelsAffected += 1;
        shadowBounceLumSum += bounceLum;
      }

      compositedRgbaLinear[off] = (fgR + bounceR) * fgA + (backgroundEmissiveRgbaLinear[off] ?? 0) * (1 - fgA);
      compositedRgbaLinear[off + 1] = (fgG + bounceG) * fgA + (backgroundEmissiveRgbaLinear[off + 1] ?? 0) * (1 - fgA);
      compositedRgbaLinear[off + 2] = (fgB + bounceB) * fgA + (backgroundEmissiveRgbaLinear[off + 2] ?? 0) * (1 - fgA);
      compositedRgbaLinear[off + 3] = clamp(fgA + (backgroundEmissiveRgbaLinear[off + 3] ?? 1) * (1 - fgA), 0, 1);
    }
  }

  return {
    width,
    height,
    compositedRgbaLinear,
    bounceIrradianceRgb,
    resolvedNormalXY,
    activeForegroundPixels,
    shadowEdgePixelsAffected,
    meanShadowBounceLuminance: shadowEdgePixelsAffected > 0 ? shadowBounceLumSum / shadowEdgePixelsAffected : 0,
    serverCostKrw: 0,
  };
}

// ============================================================================
// 2. 서예풍 예각 먹물 맺힘 & G펜 날카로운 끝빠짐 조형기
// ============================================================================

export interface CalligraphicStrokeSample {
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly pressure: number;
  readonly timestampMs: number;
}

export interface CalligraphicSculptOptions {
  /** 먹물 맺힘 발동 최대 내각 문턱값 (도, 기본 110°). */
  readonly acuteAngleThresholdDeg?: number;
  readonly meniscusPoolingGain?: number;
  readonly inkTrapReliefRatio?: number;
  readonly entryTaperLengthPx?: number;
  readonly releaseTaperLengthPx?: number;
  readonly releaseRazorSlope?: number;
  readonly meniscusArcSubdivisions?: number;
}

export interface AcuteInkPoolingFillet {
  readonly vertexIndex: number;
  readonly junctionPosition: Vec2Tuple;
  readonly interiorAngleDeg: number;
  readonly bisectorUnit: Vec2Tuple;
  readonly meniscusRadiusPx: number;
  readonly pooledInkAreaPx2: number;
  readonly inkTrapReliefPx: number;
  readonly meniscusArcPoints: readonly Vec2Tuple[];
}

export interface SculptedCalligraphicSample {
  readonly x: number;
  readonly y: number;
  readonly arcLengthPx: number;
  readonly originalWidthPx: number;
  readonly sculptedWidthPx: number;
  readonly taperFactor: number;
  readonly leftEdge: Vec2Tuple;
  readonly rightEdge: Vec2Tuple;
}

export interface CalligraphicSculptResult {
  readonly samples: readonly SculptedCalligraphicSample[];
  readonly acuteInkFillets: readonly AcuteInkPoolingFillet[];
  readonly totalArcLengthPx: number;
  readonly effectiveReleaseTaperPx: number;
  readonly releaseFlickSpeedPxPerSec: number;
  readonly tipWidthPx: number;
  readonly labelKo: string;
  readonly serverCostKrw: 0;
}

/** 3차 에르미트(Cubic-Hermite) 곡선으로 G펜 면도날 끝빠짐 계수 `u ∈ [0, 1]`를 평가한다. */
export function evaluateHermiteRazorTaper(u: number, tipSlope = 0.14): number {
  const t = clamp(u, 0, 1);
  const s0 = clamp(tipSlope, 0.01, 0.8);
  const t2 = t * t;
  const t3 = t2 * t;
  return clamp((t3 - 2 * t2 + t) * s0 + (-2 * t3 + 3 * t2), 0, 1);
}

function buildMeniscusFillet(
  vertexIndex: number,
  prev: Vec2Tuple,
  curr: Vec2Tuple,
  next: Vec2Tuple,
  avgWidthPx: number,
  thresholdDeg: number,
  poolingGain: number,
  inkTrapReliefRatio: number,
  subdivisions: number,
): AcuteInkPoolingFillet | null {
  const inX = prev[0] - curr[0];
  const inY = prev[1] - curr[1];
  const outX = next[0] - curr[0];
  const outY = next[1] - curr[1];
  const inLen = Math.hypot(inX, inY);
  const outLen = Math.hypot(outX, outY);
  if (inLen <= 1e-5 || outLen <= 1e-5) return null;

  const uInX = inX / inLen;
  const uInY = inY / inLen;
  const uOutX = outX / outLen;
  const uOutY = outY / outLen;
  const interiorAngleDeg = Math.acos(clamp(uInX * uOutX + uInY * uOutY, -1, 1)) * RAD_TO_DEG;
  if (interiorAngleDeg <= 1e-3 || interiorAngleDeg >= thresholdDeg) return null;

  const bisLen = Math.hypot(uInX + uOutX, uInY + uOutY);
  if (bisLen <= 1e-6) return null;
  const bisX = (uInX + uOutX) / bisLen;
  const bisY = (uInY + uOutY) / bisLen;

  const acuity = clamp((thresholdDeg - interiorAngleDeg) / thresholdDeg, 0, 1);
  const maxArmReach = Math.min(inLen, outLen) * 0.45;
  const meniscusRadiusPx = Math.min(maxArmReach, Math.max(0.25, avgWidthPx * poolingGain * Math.pow(acuity, 1.15)));
  const tanHalf = Math.max(0.12, Math.tan((interiorAngleDeg * DEG_TO_RAD) * 0.5));
  const pooledInkAreaPx2 = Math.max(
    0,
    meniscusRadiusPx * meniscusRadiusPx * (1 / tanHalf - (Math.PI - interiorAngleDeg * DEG_TO_RAD) * 0.5),
  );
  const inkTrapReliefPx = interiorAngleDeg < 45 ? avgWidthPx * inkTrapReliefRatio * ((45 - interiorAngleDeg) / 45) : 0;

  const armDist = Math.min(maxArmReach, meniscusRadiusPx * 1.4 + avgWidthPx * 0.35);
  const startPt: Vec2Tuple = [curr[0] + uInX * armDist, curr[1] + uInY * armDist];
  const endPt: Vec2Tuple = [curr[0] + uOutX * armDist, curr[1] + uOutY * armDist];
  const ctrlDist = Math.max(0.1, meniscusRadiusPx * 0.72 - inkTrapReliefPx * 0.35);
  const ctrlPt: Vec2Tuple = [curr[0] + bisX * ctrlDist, curr[1] + bisY * ctrlDist];

  const steps = clampInt(subdivisions, 3, 16);
  const meniscusArcPoints: Vec2Tuple[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const inv = 1 - t;
    meniscusArcPoints.push([
      inv * inv * startPt[0] + 2 * inv * t * ctrlPt[0] + t * t * endPt[0],
      inv * inv * startPt[1] + 2 * inv * t * ctrlPt[1] + t * t * endPt[1],
    ]);
  }

  return {
    vertexIndex,
    junctionPosition: curr,
    interiorAngleDeg,
    bisectorUnit: [bisX, bisY],
    meniscusRadiusPx,
    pooledInkAreaPx2,
    inkTrapReliefPx,
    meniscusArcPoints,
  };
}

/**
 * 단일 G펜 스트로크에서 예각(`θ < 110°`) 먹물 맺힘 메니스커스를 합성하고,
 * 펜 튕김 속도에 반응하는 3차 에르미트 면도날 끝빠짐을 적용한다.
 */
export function sculptCalligraphicStroke(
  points: readonly CalligraphicStrokeSample[],
  options: CalligraphicSculptOptions = {},
): CalligraphicSculptResult {
  if (points.length < 2) {
    throw new RangeError("서예풍 스트로크 조형에는 최소 2개 이상의 샘플 정점이 필요합니다.");
  }

  const thresholdDeg = clamp(options.acuteAngleThresholdDeg ?? 110, 15, 165);
  const poolingGain = clamp(options.meniscusPoolingGain ?? 0.42, 0.05, 1.5);
  const inkTrapReliefRatio = clamp(options.inkTrapReliefRatio ?? 0.2, 0, 0.6);
  const entryTaperPx = Math.max(0, options.entryTaperLengthPx ?? 16);
  const baseReleaseTaperPx = Math.max(2, options.releaseTaperLengthPx ?? 32);
  const releaseRazorSlope = clamp(options.releaseRazorSlope ?? 0.14, 0.01, 0.8);
  const arcSubdivisions = options.meniscusArcSubdivisions ?? 5;

  const arcLengths = new Float64Array(points.length);
  for (let i = 1; i < points.length; i += 1) {
    const p0 = points[i - 1]!;
    const p1 = points[i]!;
    arcLengths[i] = (arcLengths[i - 1] ?? 0) + Math.hypot(p1.x - p0.x, p1.y - p0.y);
  }
  const totalArcLengthPx = arcLengths[points.length - 1] ?? 0;

  const tailStartIdx = Math.max(0, points.length - 4);
  const tailDistPx = totalArcLengthPx - (arcLengths[tailStartIdx] ?? 0);
  const tailDtSec = Math.max(0.004, (points[points.length - 1]!.timestampMs - points[tailStartIdx]!.timestampMs) / 1000);
  const releaseFlickSpeedPxPerSec = tailDistPx / tailDtSec;
  const flickBoost = clamp(1 + (releaseFlickSpeedPxPerSec - 400) / 1800, 0.85, 1.75);
  const effectiveReleaseTaperPx = Math.min(totalArcLengthPx * 0.72, baseReleaseTaperPx * flickBoost);
  const effectiveEntryTaperPx = Math.min(totalArcLengthPx * 0.35, entryTaperPx);

  const acuteInkFillets: AcuteInkPoolingFillet[] = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;
    const avgW = (prev.widthPx + curr.widthPx + next.widthPx) / 3;
    const fillet = buildMeniscusFillet(
      i, [prev.x, prev.y], [curr.x, curr.y], [next.x, next.y], avgW, thresholdDeg, poolingGain, inkTrapReliefRatio, arcSubdivisions,
    );
    if (fillet) acuteInkFillets.push(fillet);
  }

  const samples: SculptedCalligraphicSample[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i]!;
    const s = arcLengths[i] ?? 0;
    const entryU = effectiveEntryTaperPx > 1e-4 ? clamp(s / effectiveEntryTaperPx, 0, 1) : 1;
    const releaseU = effectiveReleaseTaperPx > 1e-4 ? clamp(Math.max(0, totalArcLengthPx - s) / effectiveReleaseTaperPx, 0, 1) : 1;
    const taperFactor = Math.min(
      entryU < 1 ? evaluateHermiteRazorTaper(entryU, 0.28) : 1,
      releaseU < 1 ? evaluateHermiteRazorTaper(releaseU, releaseRazorSlope) : 1,
    );
    const rawWidth = Math.max(0.01, pt.widthPx) * (0.35 + 0.65 * clamp(pt.pressure, 0, 1)) * taperFactor;
    const sculptedWidthPx = i === points.length - 1 ? Math.min(0.02, rawWidth) : rawWidth;
    const prevPt = points[Math.max(0, i - 1)]!;
    const nextPt = points[Math.min(points.length - 1, i + 1)]!;
    const tx = nextPt.x - prevPt.x;
    const ty = nextPt.y - prevPt.y;
    const tLen = Math.hypot(tx, ty);
    const nx = tLen > 1e-6 ? -ty / tLen : 0;
    const ny = tLen > 1e-6 ? tx / tLen : 1;
    const halfW = sculptedWidthPx * 0.5;
    samples.push({
      x: pt.x, y: pt.y, arcLengthPx: s, originalWidthPx: pt.widthPx, sculptedWidthPx, taperFactor,
      leftEdge: [pt.x + nx * halfW, pt.y + ny * halfW], rightEdge: [pt.x - nx * halfW, pt.y - ny * halfW],
    });
  }

  return {
    samples, acuteInkFillets, totalArcLengthPx, effectiveReleaseTaperPx, releaseFlickSpeedPxPerSec,
    tipWidthPx: samples[samples.length - 1]?.sculptedWidthPx ?? 0,
    labelKo: "G펜 먹물 맺힘·끝빠짐 조형 완료", serverCostKrw: 0,
  };
}

// ============================================================================
// 3. 미세 비대칭 표정 & 구면 각막 반사 안구 하이라이트 합성기
// ============================================================================

export type MicroExpressionMood = "neutral-alive" | "wistful-smile" | "tense-focus" | "gentle-surprise";

export interface MicroExpressionSpec {
  readonly mood: MicroExpressionMood;
  readonly labelKo: string;
  readonly palpebralAsymmetryRatio: number;
  readonly lowerLidSquintLeft: number;
  readonly lowerLidSquintRight: number;
  readonly irisScaleFactor: number;
}

export const MICRO_EXPRESSION_SPECS: Readonly<Record<MicroExpressionMood, MicroExpressionSpec>> = {
  "neutral-alive": { mood: "neutral-alive", labelKo: "생기 있는 기본 응시", palpebralAsymmetryRatio: 0.026, lowerLidSquintLeft: 0.03, lowerLidSquintRight: 0.045, irisScaleFactor: 1 },
  "wistful-smile": { mood: "wistful-smile", labelKo: "아련한 미소 비대칭", palpebralAsymmetryRatio: 0.045, lowerLidSquintLeft: 0.11, lowerLidSquintRight: 0.145, irisScaleFactor: 1.03 },
  "tense-focus": { mood: "tense-focus", labelKo: "긴장된 집중 눈매", palpebralAsymmetryRatio: -0.034, lowerLidSquintLeft: 0.08, lowerLidSquintRight: 0.055, irisScaleFactor: 0.94 },
  "gentle-surprise": { mood: "gentle-surprise", labelKo: "부드러운 놀람", palpebralAsymmetryRatio: 0.022, lowerLidSquintLeft: 0.01, lowerLidSquintRight: 0.02, irisScaleFactor: 0.97 },
};

export interface EyeCatchlightPlacement {
  readonly eyeSide: "left" | "right";
  readonly gazeDirection: Vec3Tuple;
  readonly cornealSpecularNormal: Vec3Tuple;
  readonly reflectedRayVector: Vec3Tuple;
  readonly viewerAlignmentCosine: number;
  readonly primaryCatchlightUv: Vec2Tuple;
  readonly primaryCatchlightRadiusRatio: number;
  readonly oppositeIrisCausticCenterUv: Vec2Tuple;
  readonly irisCausticCrescentArcUv: readonly Vec2Tuple[];
  readonly irisCausticLuminanceWeight: number;
  readonly palpebralOpeningRatio: number;
  readonly lowerLidLiftRatio: number;
}

export interface BinocularCatchlightComposeInput {
  readonly leftEyeCenterMm?: Vec3Tuple;
  readonly rightEyeCenterMm?: Vec3Tuple;
  readonly corneaRadiusMm?: number;
  readonly irisRadiusMm?: number;
  readonly focalTargetMm: Vec3Tuple;
  readonly keyLightDirection: Vec3Tuple;
  readonly viewerDirection?: Vec3Tuple;
  readonly clampNaturalPortraitVergence?: boolean;
  readonly microExpression?: MicroExpressionMood;
}

export interface BinocularCatchlightComposeResult {
  readonly leftEye: EyeCatchlightPlacement;
  readonly rightEye: EyeCatchlightPlacement;
  readonly resolvedFocalTargetMm: Vec3Tuple;
  readonly binocularVergenceDeg: number;
  readonly isWithinNaturalVergenceBand: boolean;
  readonly apertureAsymmetryDelta: number;
  readonly expressionLabelKo: string;
  readonly serverCostKrw: 0;
}

/** 입사 광선 단위 벡터 `I`와 단위 표면 법선 `N`에 대해 `R = I - 2(N · I)N`을 계산한다. */
export function reflectIncidentRay3D(incident: Vec3Tuple, normal: Vec3Tuple): Vec3Tuple {
  const unitI = normalize3(incident);
  const unitN = normalize3(normal);
  const nDotI = dot3(unitN, unitI);
  return normalize3([
    unitI[0] - 2 * nDotI * unitN[0],
    unitI[1] - 2 * nDotI * unitN[1],
    unitI[2] - 2 * nDotI * unitN[2],
  ]);
}

function buildEyeLocalBasis(gazeDir: Vec3Tuple): {
  readonly rightAxis: Vec3Tuple;
  readonly upAxis: Vec3Tuple;
} {
  const forwardAxis = normalize3(gazeDir);
  const worldUp: Vec3Tuple = Math.abs(forwardAxis[1]) > 0.96 ? [0, 0, 1] : [0, 1, 0];
  const rightAxis = normalize3([
    worldUp[1] * forwardAxis[2] - worldUp[2] * forwardAxis[1],
    worldUp[2] * forwardAxis[0] - worldUp[0] * forwardAxis[2],
    worldUp[0] * forwardAxis[1] - worldUp[1] * forwardAxis[0],
  ]);
  const upAxis = normalize3([
    forwardAxis[1] * rightAxis[2] - forwardAxis[2] * rightAxis[1],
    forwardAxis[2] * rightAxis[0] - forwardAxis[0] * rightAxis[2],
    forwardAxis[0] * rightAxis[1] - forwardAxis[1] * rightAxis[0],
  ]);
  return { rightAxis, upAxis };
}

function composeSingleEyeCatchlight(
  eyeSide: "left" | "right", eyeCenterMm: Vec3Tuple, focalTargetMm: Vec3Tuple, corneaRadiusMm: number,
  irisRadiusMm: number, toKeyLightUnit: Vec3Tuple, toViewerUnit: Vec3Tuple, palpebralOpeningRatio: number, lowerLidLiftRatio: number,
): EyeCatchlightPlacement {
  const gazeDirection = normalize3([focalTargetMm[0] - eyeCenterMm[0], focalTargetMm[1] - eyeCenterMm[1], focalTargetMm[2] - eyeCenterMm[2]]);
  const cornealSpecularNormal = normalize3([toKeyLightUnit[0] + toViewerUnit[0], toKeyLightUnit[1] + toViewerUnit[1], toKeyLightUnit[2] + toViewerUnit[2]]);
  const reflectedRayVector = reflectIncidentRay3D([-toKeyLightUnit[0], -toKeyLightUnit[1], -toKeyLightUnit[2]], cornealSpecularNormal);
  const viewerAlignmentCosine = clamp(dot3(reflectedRayVector, toViewerUnit), -1, 1);

  const basis = buildEyeLocalBasis(gazeDirection);
  const localX = dot3(cornealSpecularNormal, basis.rightAxis) * (corneaRadiusMm / irisRadiusMm);
  const localY = dot3(cornealSpecularNormal, basis.upAxis) * (corneaRadiusMm / irisRadiusMm);
  const radialLen = Math.hypot(localX, localY);
  const clampScale = radialLen > 0.86 ? 0.86 / radialLen : 1;
  const primaryU = localX * clampScale;
  const primaryV = localY * clampScale;

  const causticDirAngle = radialLen > 1e-5 ? Math.atan2(-primaryV, -primaryU) : -Math.PI * 0.5;
  const causticRadius = clamp(0.46 + 0.22 * Math.min(1, radialLen), 0.42, 0.72);
  const crescentSpanRad = 78 * DEG_TO_RAD;
  const irisCausticCrescentArcUv: Vec2Tuple[] = [];
  for (let i = 0; i <= 6; i += 1) {
    const frac = i / 6 - 0.5;
    const theta = causticDirAngle + frac * crescentSpanRad;
    const archR = causticRadius * (1 - 0.32 * frac * frac);
    irisCausticCrescentArcUv.push([Math.cos(theta) * archR, Math.sin(theta) * archR]);
  }
  const grazeFactor = clamp(dot3(cornealSpecularNormal, gazeDirection), 0.15, 1);
  return {
    eyeSide, gazeDirection, cornealSpecularNormal, reflectedRayVector, viewerAlignmentCosine,
    primaryCatchlightUv: [primaryU, primaryV],
    primaryCatchlightRadiusRatio: clamp(0.14 + 0.06 * grazeFactor, 0.11, 0.24),
    oppositeIrisCausticCenterUv: [Math.cos(causticDirAngle) * causticRadius, Math.sin(causticDirAngle) * causticRadius],
    irisCausticCrescentArcUv,
    irisCausticLuminanceWeight: clamp(0.28 + 0.34 * (1 - grazeFactor * 0.45), 0.18, 0.65),
    palpebralOpeningRatio, lowerLidLiftRatio,
  };
}

/**
 * 좌·우 양안의 `1~2°` 자연 수렴각, 3D 구면 각막 주 하이라이트(`R = I - 2(N·I)N`),
 * 반대편 홍채 반사광 초승달, 미세 비대칭 눈매를 일괄 계산한다.
 */
export function composeBinocularEyeCatchlights(
  input: BinocularCatchlightComposeInput,
): BinocularCatchlightComposeResult {
  const leftCenter = input.leftEyeCenterMm ?? [-31, 0, 0];
  const rightCenter = input.rightEyeCenterMm ?? [31, 0, 0];
  const corneaRadiusMm = Math.max(4, input.corneaRadiusMm ?? 7.8);
  const irisRadiusMm = Math.max(3, input.irisRadiusMm ?? 5.9);
  const toKeyLightUnit = normalize3(input.keyLightDirection);
  const toViewerUnit = normalize3(input.viewerDirection ?? [0, 0, 1]);
  const spec = MICRO_EXPRESSION_SPECS[input.microExpression ?? "neutral-alive"];

  const midEye: Vec3Tuple = [
    (leftCenter[0] + rightCenter[0]) * 0.5,
    (leftCenter[1] + rightCenter[1]) * 0.5,
    (leftCenter[2] + rightCenter[2]) * 0.5,
  ];
  const ipdMm = Math.max(
    40,
    Math.hypot(rightCenter[0] - leftCenter[0], rightCenter[1] - leftCenter[1], rightCenter[2] - leftCenter[2]),
  );

  let resolvedTarget: Vec3Tuple = input.focalTargetMm;
  if (input.clampNaturalPortraitVergence) {
    const dx = resolvedTarget[0] - midEye[0];
    const dy = resolvedTarget[1] - midEye[1];
    const dz = resolvedTarget[2] - midEye[2];
    const dist = Math.max(1e-3, Math.hypot(dx, dy, dz));
    const minDistMm = ipdMm / (2 * Math.tan(1.0 * DEG_TO_RAD));
    const maxDistMm = ipdMm / (2 * Math.tan(0.5 * DEG_TO_RAD));
    const clampedDist = clamp(dist, minDistMm * 1.03, maxDistMm * 0.97);
    const scale = clampedDist / dist;
    resolvedTarget = [
      midEye[0] + dx * scale,
      midEye[1] + dy * scale,
      midEye[2] + (Math.abs(dz) < 1e-3 ? clampedDist : dz * scale),
    ];
  }

  const leftOpening = clamp(1 + spec.palpebralAsymmetryRatio * 0.5, 0.72, 1.15);
  const rightOpening = clamp(1 - spec.palpebralAsymmetryRatio * 0.5, 0.72, 1.15);
  const scaledIrisMm = irisRadiusMm * spec.irisScaleFactor;
  const leftEye = composeSingleEyeCatchlight(
    "left", leftCenter, resolvedTarget, corneaRadiusMm, scaledIrisMm, toKeyLightUnit, toViewerUnit, leftOpening, spec.lowerLidSquintLeft,
  );
  const rightEye = composeSingleEyeCatchlight(
    "right", rightCenter, resolvedTarget, corneaRadiusMm, scaledIrisMm, toKeyLightUnit, toViewerUnit, rightOpening, spec.lowerLidSquintRight,
  );

  const binocularVergenceDeg = Math.acos(clamp(dot3(leftEye.gazeDirection, rightEye.gazeDirection), -1, 1)) * RAD_TO_DEG;
  return {
    leftEye,
    rightEye,
    resolvedFocalTargetMm: resolvedTarget,
    binocularVergenceDeg,
    isWithinNaturalVergenceBand: binocularVergenceDeg >= 1.0 - 1e-3 && binocularVergenceDeg <= 2.0 + 1e-3,
    apertureAsymmetryDelta: leftEye.palpebralOpeningRatio - rightEye.palpebralOpeningRatio,
    expressionLabelKo: spec.labelKo,
    serverCostKrw: 0,
  };
}
