/**
 * 평면 거울·유리창·빗물 웅덩이 프레넬(Fresnel) 반사 워퍼,
 * 타격 임팩트 프레임·궤적 모션 스미어·방향성 카메라 쉐이크 합성기,
 * 브리드슨(Bridson) 포아송 디스크 원근 군중 실루엣 배치 엔진.
 *
 * - 외부 서버 호출 0회(₩0), 순수 로컬 결정론적 연산만 사용한다.
 * - 브라우저 전역 스토리지(KV) 및 정규식을 일절 참조하지 않는다.
 */

export {
  scatterPerspectiveCrowdSilhouettes,
  type CrowdExtraInstance,
  type PerspectiveCrowdOptions,
  type PerspectiveCrowdResult,
} from "./perspective-crowd-scatter";

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export type Polygon2D = readonly Point2D[];

/**
 * 2D 반사 기준선 일반형 방정식 `a*x + b*y + c = 0`.
 * 예: 수평 지평선 `y = horizonY`는 `{ a: 0, b: 1, c: -horizonY }`로 표현한다.
 */
export interface ReflectionPlane2D {
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

export type ReflectionSurfacePreset = "rain-puddle" | "planar-mirror" | "window-glass";

export const SURFACE_PRESET_LABELS_KO: Readonly<Record<ReflectionSurfacePreset, string>> =
  Object.freeze({
    "rain-puddle": "빗물 웅덩이 반사",
    "planar-mirror": "평면 거울 반사",
    "window-glass": "유리창 겹반사",
  });

export const ACTION_IMPACT_LABELS_KO = Object.freeze({
  impactFrame: "타격 임팩트 프레임",
  motionSmear: "궤적 모션 스미어",
  cameraShake: "방향성 카메라 쉐이크",
  crowdScatter: "원근 배경 군중 배치",
});

export interface RaindropRippleSource {
  readonly centerX: number;
  readonly centerY: number;
  readonly wavelengthPx: number;
  readonly amplitudePx: number;
  readonly phaseRad: number;
  readonly dampingRadiusPx: number;
}

export interface PlanarReflectionInput {
  readonly width: number;
  readonly height: number;
  readonly sourceRgba: Uint8Array;
  readonly plane: ReflectionPlane2D;
  readonly surfacePreset?: ReflectionSurfacePreset;
  readonly reflectPositiveHalfSpace?: boolean;
  readonly fresnelF0?: number;
  readonly grazingAngleFalloffPx?: number;
  readonly distanceAttenuationPx?: number;
  readonly opacityScale?: number;
  readonly tintRgb?: readonly [number, number, number];
  readonly tintStrength?: number;
  readonly ripples?: readonly RaindropRippleSource[];
  readonly puddleMask?: Uint8Array;
}

export interface PlanarReflectionResult {
  readonly width: number;
  readonly height: number;
  readonly reflectionRgba: Uint8Array;
  readonly compositedRgba: Uint8Array;
  readonly sampledPixelCount: number;
  readonly peakFresnelWeight: number;
  readonly meanFresnelWeight: number;
  readonly planeNormal: readonly [number, number];
}

export interface ImpactSpikeWedge {
  readonly tip: Point2D;
  readonly baseLeft: Point2D;
  readonly baseRight: Point2D;
  readonly angleRad: number;
}

export interface ImpactFrameOptions {
  readonly width: number;
  readonly height: number;
  readonly impactCenter: Point2D;
  readonly innerClearRadiusPx: number;
  readonly outerBurstRadiusPx: number;
  readonly spikeCount: number;
  readonly invertPolarity?: boolean;
  readonly debrisShardCount?: number;
  readonly seed?: number;
}

export interface ImpactFrameResult {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly spikes: readonly ImpactSpikeWedge[];
  readonly debrisShards: readonly Polygon2D[];
  readonly whitePixelRatio: number;
  readonly blackPixelRatio: number;
}

export interface SwingArcMotionSmearOptions {
  readonly pivot: Point2D;
  readonly startAngleRad: number;
  readonly endAngleRad: number;
  readonly innerRadiusPx: number;
  readonly outerRadiusPx: number;
  readonly subdivisions?: number;
  readonly nonLinearExponent?: number;
  readonly trailingStreakCount?: number;
}

export interface MotionSmearResult {
  readonly mainRibbonPolygon: Polygon2D;
  readonly trailingStreakPolygons: readonly Polygon2D[];
  readonly arcLengthPx: number;
  readonly leadingEdgeMidpoint: Point2D;
  readonly areaPx2: number;
}

export interface CameraShakeOptions {
  readonly directionX: number;
  readonly directionY: number;
  readonly amplitudePx: number;
  readonly frequencyHz: number;
  readonly dampingRatio: number;
  readonly durationMs: number;
  readonly fps: number;
  readonly transverseRatio?: number;
  readonly rollAmplitudeDeg?: number;
}

export interface CameraShakeKeyframe {
  readonly frameIndex: number;
  readonly timeMs: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rotationDeg: number;
  readonly energyEnvelope: number;
}

export interface CameraShakeCurve {
  readonly keyframes: readonly CameraShakeKeyframe[];
  readonly peakDisplacementPx: number;
  readonly settledAtMs: number;
}

const DEFAULT_F0_BY_PRESET: Readonly<Record<ReflectionSurfacePreset, number>> = Object.freeze({
  "rain-puddle": 0.04,
  "planar-mirror": 0.92,
  "window-glass": 0.09,
});

function clamp(value: number, minValue: number, maxValue: number): number {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

function clampByte(value: number): number {
  const rounded = Math.round(value);
  if (rounded <= 0) return 0;
  if (rounded >= 255) return 255;
  return rounded;
}

function createSeededRng(seed: number): () => number {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/**
 * 슐릭(Schlick) 근사식으로 입사 여각 `cosTheta`에 대한 프레넬 반사율을 계산한다.
 * 수면·웅덩이 경계 근처(스침각 `cosTheta -> 0`)일수록 반사율이 1에 수렴한다.
 */
export function computeSchlickFresnel(cosTheta: number, f0: number): number {
  const c = clamp(cosTheta, 0, 1);
  const base = clamp(f0, 0, 1);
  const oneMinusC = 1 - c;
  const pow5 = oneMinusC * oneMinusC * oneMinusC * oneMinusC * oneMinusC;
  return clamp(base + (1 - base) * pow5, 0, 1);
}

/**
 * 2D 점 `(x, y)`를 직선 `a*x + b*y + c = 0` 너머로 대칭 이동한다.
 */
export function reflectPointAcrossPlane2D(
  x: number,
  y: number,
  plane: ReflectionPlane2D,
): Point2D {
  const norm = Math.hypot(plane.a, plane.b);
  if (!(norm > 1e-9)) {
    throw new RangeError("반사 기준선의 법선 벡터 길이는 0보다 커야 합니다.");
  }
  const nx = plane.a / norm;
  const ny = plane.b / norm;
  const cn = plane.c / norm;
  const signedDist = nx * x + ny * y + cn;
  return {
    x: x - 2 * signedDist * nx,
    y: y - 2 * signedDist * ny,
  };
}

function sampleRgbaBilinearPremultiplied(
  rgba: Uint8Array,
  width: number,
  height: number,
  sampleX: number,
  sampleY: number,
  out: Float64Array,
): boolean {
  if (sampleX < -0.5 || sampleX > width - 0.5 || sampleY < -0.5 || sampleY > height - 0.5) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    return false;
  }
  const clampedX = clamp(sampleX, 0, width - 1);
  const clampedY = clamp(sampleY, 0, height - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = clampedX - x0;
  const ty = clampedY - y0;

  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const a00 = (rgba[i00 + 3] ?? 0) / 255;
  const a10 = (rgba[i10 + 3] ?? 0) / 255;
  const a01 = (rgba[i01 + 3] ?? 0) / 255;
  const a11 = (rgba[i11 + 3] ?? 0) / 255;

  const alpha = w00 * a00 + w10 * a10 + w01 * a01 + w11 * a11;
  if (alpha <= 1e-6) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    return false;
  }

  const pr =
    w00 * (rgba[i00] ?? 0) * a00 +
    w10 * (rgba[i10] ?? 0) * a10 +
    w01 * (rgba[i01] ?? 0) * a01 +
    w11 * (rgba[i11] ?? 0) * a11;
  const pg =
    w00 * (rgba[i00 + 1] ?? 0) * a00 +
    w10 * (rgba[i10 + 1] ?? 0) * a10 +
    w01 * (rgba[i01 + 1] ?? 0) * a01 +
    w11 * (rgba[i11 + 1] ?? 0) * a11;
  const pb =
    w00 * (rgba[i00 + 2] ?? 0) * a00 +
    w10 * (rgba[i10 + 2] ?? 0) * a10 +
    w01 * (rgba[i01 + 2] ?? 0) * a01 +
    w11 * (rgba[i11 + 2] ?? 0) * a11;

  out[0] = pr / alpha;
  out[1] = pg / alpha;
  out[2] = pb / alpha;
  out[3] = alpha * 255;
  return true;
}

/**
 * 임의 평면 `ax + by + c = 0` 기준으로 캐릭터·소품 RGBA 레이어를 반사 워핑하고,
 * 슐릭 프레넬 스침각 부스트와 동심원 빗방울 파문 법선 섭동을 적용한다.
 */
export function warpPlanarFresnelReflection(
  input: PlanarReflectionInput,
): PlanarReflectionResult {
  const { width, height, sourceRgba, plane } = input;
  if (width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new RangeError("캔버스 가로·세로 크기는 1 이상의 정수여야 합니다.");
  }
  const expectedLength = width * height * 4;
  if (sourceRgba.length !== expectedLength) {
    throw new RangeError(`원본 RGBA 버퍼 길이가 예상값(${expectedLength})과 다릅니다.`);
  }
  if (input.puddleMask && input.puddleMask.length !== width * height) {
    throw new RangeError("웅덩이 마스크 길이는 픽셀 수(width * height)와 일치해야 합니다.");
  }

  const norm = Math.hypot(plane.a, plane.b);
  if (!(norm > 1e-9)) {
    throw new RangeError("반사 기준선의 법선 길이는 0보다 커야 합니다.");
  }
  const nx = plane.a / norm;
  const ny = plane.b / norm;
  const cn = plane.c / norm;

  const preset = input.surfacePreset ?? "rain-puddle";
  const reflectPositive = input.reflectPositiveHalfSpace ?? true;
  const f0 = input.fresnelF0 ?? DEFAULT_F0_BY_PRESET[preset];
  const grazingFalloffPx = Math.max(1, input.grazingAngleFalloffPx ?? Math.max(24, height * 0.28));
  const attenuationPx =
    input.distanceAttenuationPx ??
    (preset === "planar-mirror" ? Math.max(width, height) * 8 : Math.max(48, height * 0.65));
  const opacityScale = clamp(input.opacityScale ?? 1, 0, 1);
  const tintRgb = input.tintRgb ?? [112, 134, 158];
  const tintStrength = clamp(
    input.tintStrength ?? (preset === "rain-puddle" ? 0.18 : preset === "window-glass" ? 0.1 : 0),
    0,
    1,
  );
  const ripples = input.ripples ?? [];

  const reflectionRgba = new Uint8Array(expectedLength);
  const compositedRgba = new Uint8Array(sourceRgba);
  const sampleScratch = new Float64Array(4);

  let sampledPixelCount = 0;
  let peakFresnelWeight = 0;
  let fresnelSum = 0;
  let receiverCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const maskWeight = input.puddleMask ? (input.puddleMask[pixelIndex] ?? 0) / 255 : 1;
      if (maskWeight <= 0) continue;

      const signedDist = nx * x + ny * y + cn;
      const orientedDist = reflectPositive ? signedDist : -signedDist;
      if (orientedDist <= 0) continue;

      const cosTheta = orientedDist / Math.hypot(orientedDist, grazingFalloffPx);
      const fresnel = computeSchlickFresnel(cosTheta, f0);
      receiverCount += 1;
      fresnelSum += fresnel;
      if (fresnel > peakFresnelWeight) peakFresnelWeight = fresnel;

      let rippleOffsetX = 0;
      let rippleOffsetY = 0;
      for (let rIdx = 0; rIdx < ripples.length; rIdx += 1) {
        const ripple = ripples[rIdx]!;
        const dx = x - ripple.centerX;
        const dy = y - ripple.centerY;
        const dist = Math.hypot(dx, dy);
        const wavelength = Math.max(1e-3, ripple.wavelengthPx);
        const damping = Math.max(1e-3, ripple.dampingRadiusPx);
        const waveAngle = (2 * Math.PI * dist) / wavelength - ripple.phaseRad;
        const slope = ripple.amplitudePx * Math.sin(waveAngle) * Math.exp(-dist / damping);
        if (dist > 1e-6) {
          rippleOffsetX += (dx / dist) * slope;
          rippleOffsetY += (dy / dist) * slope;
        } else {
          rippleOffsetX += nx * slope;
          rippleOffsetY += ny * slope;
        }
      }

      const mirrorX = x - 2 * signedDist * nx + rippleOffsetX;
      const mirrorY = y - 2 * signedDist * ny + rippleOffsetY;
      const hit = sampleRgbaBilinearPremultiplied(
        sourceRgba,
        width,
        height,
        mirrorX,
        mirrorY,
        sampleScratch,
      );
      if (!hit) continue;

      const distFade = Math.exp(-orientedDist / Math.max(1, attenuationPx));
      const effectiveWeight = clamp(fresnel * distFade * maskWeight * opacityScale, 0, 1);
      const reflAlpha = (sampleScratch[3]! / 255) * effectiveWeight;
      if (reflAlpha <= 1 / 510) continue;

      sampledPixelCount += 1;
      const rr = sampleScratch[0]! * (1 - tintStrength) + tintRgb[0] * tintStrength;
      const rg = sampleScratch[1]! * (1 - tintStrength) + tintRgb[1] * tintStrength;
      const rb = sampleScratch[2]! * (1 - tintStrength) + tintRgb[2] * tintStrength;

      const offset = pixelIndex * 4;
      reflectionRgba[offset] = clampByte(rr);
      reflectionRgba[offset + 1] = clampByte(rg);
      reflectionRgba[offset + 2] = clampByte(rb);
      reflectionRgba[offset + 3] = clampByte(reflAlpha * 255);

      const fgAlpha = (compositedRgba[offset + 3] ?? 0) / 255;
      const outAlpha = fgAlpha + reflAlpha * (1 - fgAlpha);
      if (outAlpha > 1e-6) {
        compositedRgba[offset] = clampByte(
          ((compositedRgba[offset] ?? 0) * fgAlpha + rr * reflAlpha * (1 - fgAlpha)) / outAlpha,
        );
        compositedRgba[offset + 1] = clampByte(
          ((compositedRgba[offset + 1] ?? 0) * fgAlpha + rg * reflAlpha * (1 - fgAlpha)) / outAlpha,
        );
        compositedRgba[offset + 2] = clampByte(
          ((compositedRgba[offset + 2] ?? 0) * fgAlpha + rb * reflAlpha * (1 - fgAlpha)) / outAlpha,
        );
        compositedRgba[offset + 3] = clampByte(outAlpha * 255);
      }
    }
  }

  return {
    width,
    height,
    reflectionRgba,
    compositedRgba,
    sampledPixelCount,
    peakFresnelWeight,
    meanFresnelWeight: receiverCount > 0 ? fresnelSum / receiverCount : 0,
    planeNormal: [nx, ny],
  };
}

function pointInTri2D(px: number, py: number, a: Point2D, b: Point2D, c: Point2D): boolean {
  const c1 = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
  const c2 = (c.x - b.x) * (py - b.y) - (c.y - b.y) * (px - b.x);
  const c3 = (a.x - c.x) * (py - c.y) - (a.y - c.y) * (px - c.x);
  return !((c1 < 0 || c2 < 0 || c3 < 0) && (c1 > 0 || c2 > 0 || c3 > 0));
}

/**
 * 고대비 흑백(0 또는 255) 방사형 타격 임팩트 프레임과 파편 폴리곤을 절차적으로 합성한다.
 */
export function generateActionImpactFrame(options: ImpactFrameOptions): ImpactFrameResult {
  const { width, height, impactCenter } = options;
  if (width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new RangeError("임팩트 프레임 크기는 1 이상의 정수여야 합니다.");
  }
  const spikeCount = Math.max(6, Math.floor(options.spikeCount));
  const innerRadius = Math.max(2, options.innerClearRadiusPx);
  const outerRadius = Math.max(innerRadius + 4, options.outerBurstRadiusPx);
  const invert = options.invertPolarity ?? false;
  const rng = createSeededRng(options.seed ?? 20261127);

  const sectorAngle = (2 * Math.PI) / spikeCount;
  const spikes: ImpactSpikeWedge[] = [];
  for (let i = 0; i < spikeCount; i += 1) {
    const baseAngle = -Math.PI + (i + 0.5) * sectorAngle;
    const jitterAngle = baseAngle + (rng() - 0.5) * sectorAngle * 0.22;
    const notchRadius = innerRadius * (0.78 + rng() * 0.44);
    const tipRadius = outerRadius * (0.72 + rng() * 0.36);
    const halfSpread = sectorAngle * (0.24 + rng() * 0.22);

    spikes.push({
      tip: {
        x: impactCenter.x + Math.cos(jitterAngle) * tipRadius,
        y: impactCenter.y + Math.sin(jitterAngle) * tipRadius,
      },
      baseLeft: {
        x: impactCenter.x + Math.cos(jitterAngle - halfSpread) * notchRadius,
        y: impactCenter.y + Math.sin(jitterAngle - halfSpread) * notchRadius,
      },
      baseRight: {
        x: impactCenter.x + Math.cos(jitterAngle + halfSpread) * notchRadius,
        y: impactCenter.y + Math.sin(jitterAngle + halfSpread) * notchRadius,
      },
      angleRad: jitterAngle,
    });
  }

  const shardCount = Math.max(0, Math.floor(options.debrisShardCount ?? 8));
  const debrisShards: Polygon2D[] = [];
  for (let s = 0; s < shardCount; s += 1) {
    const theta = rng() * Math.PI * 2;
    const dist = innerRadius + (outerRadius - innerRadius) * (0.28 + rng() * 0.62);
    const shardLen = Math.max(4, (outerRadius - innerRadius) * (0.08 + rng() * 0.14));
    const shardHalfWidth = Math.max(1.5, shardLen * 0.28);
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const vx = -uy;
    const vy = ux;
    const cx = impactCenter.x + ux * dist;
    const cy = impactCenter.y + uy * dist;
    debrisShards.push([
      { x: cx + ux * shardLen, y: cy + uy * shardLen },
      { x: cx + vx * shardHalfWidth, y: cy + vy * shardHalfWidth },
      { x: cx - ux * shardLen * 0.55, y: cy - uy * shardLen * 0.55 },
      { x: cx - vx * shardHalfWidth, y: cy - vy * shardHalfWidth },
    ]);
  }

  const rgba = new Uint8Array(width * height * 4);
  let whiteCount = 0;
  let blackCount = 0;
  const coreLum = invert ? 0 : 255;
  const bgLum = invert ? 255 : 0;

  for (let y = 0; y < height; y += 1) {
    const dy = y + 0.5 - impactCenter.y;
    for (let x = 0; x < width; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const dx = px - impactCenter.x;
      const dist = Math.hypot(dx, dy);
      let isBrightFlash = dist <= innerRadius * 0.82;

      if (!isBrightFlash && dist <= outerRadius * 1.12) {
        const angle = Math.atan2(dy, dx);
        const rawSector = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * spikeCount);
        const wedge = spikes[clamp(rawSector, 0, spikeCount - 1)]!;
        if (pointInTri2D(px, py, wedge.tip, wedge.baseLeft, wedge.baseRight)) {
          isBrightFlash = true;
        }
      }

      if (!isBrightFlash && debrisShards.length > 0) {
        for (let s = 0; s < debrisShards.length; s += 1) {
          const poly = debrisShards[s]!;
          if (
            pointInTri2D(px, py, poly[0]!, poly[1]!, poly[2]!) ||
            pointInTri2D(px, py, poly[0]!, poly[2]!, poly[3]!)
          ) {
            isBrightFlash = true;
            break;
          }
        }
      }

      const lum = isBrightFlash ? coreLum : bgLum;
      if (lum === 255) whiteCount += 1;
      else blackCount += 1;

      const idx = (y * width + x) * 4;
      rgba[idx] = lum;
      rgba[idx + 1] = lum;
      rgba[idx + 2] = lum;
      rgba[idx + 3] = 255;
    }
  }

  const totalPixels = width * height;
  return {
    width,
    height,
    rgba,
    spikes,
    debrisShards,
    whitePixelRatio: whiteCount / totalPixels,
    blackPixelRatio: blackCount / totalPixels,
  };
}

function computePolygonAreaAbs(polygon: Polygon2D): number {
  if (polygon.length < 3) return 0;
  let twiceArea = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const curr = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;
    twiceArea += curr.x * next.y - next.x * curr.y;
  }
  return Math.abs(twiceArea) * 0.5;
}

/**
 * 무기·팔다리 스윙 호(arc)를 따라 비선형 두께 감쇠를 갖는 모션 스미어 리본 폴리곤과 잔상 꼬리를 생성한다.
 */
export function generateSwingArcMotionSmear(
  options: SwingArcMotionSmearOptions,
): MotionSmearResult {
  const { pivot, startAngleRad, endAngleRad, innerRadiusPx, outerRadiusPx } = options;
  if (!(innerRadiusPx >= 0 && outerRadiusPx > innerRadiusPx)) {
    throw new RangeError("바깥 반지름은 안쪽 반지름보다 커야 합니다.");
  }
  const sweep = endAngleRad - startAngleRad;
  if (Math.abs(sweep) < 1e-5) {
    throw new RangeError("스윙 시작 각도와 끝 각도 차이가 너무 작습니다.");
  }

  const subdivisions = Math.max(6, Math.floor(options.subdivisions ?? 24));
  const exponent = Math.max(0.35, options.nonLinearExponent ?? 2.1);
  const midRadius = 0.5 * (innerRadiusPx + outerRadiusPx);
  const halfThickness = 0.5 * (outerRadiusPx - innerRadiusPx);

  const outerChain: Point2D[] = [];
  const innerChain: Point2D[] = [];
  for (let i = 0; i <= subdivisions; i += 1) {
    const u = i / subdivisions;
    const angle = startAngleRad + sweep * u;
    const widthScale = Math.pow(u, exponent);
    const rOuter = midRadius + halfThickness * widthScale;
    const rInner = midRadius - halfThickness * widthScale;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    outerChain.push({ x: pivot.x + cosA * rOuter, y: pivot.y + sinA * rOuter });
    innerChain.push({ x: pivot.x + cosA * rInner, y: pivot.y + sinA * rInner });
  }

  const mainRibbonPolygon: Point2D[] = [...outerChain];
  for (let i = innerChain.length - 1; i >= 1; i -= 1) {
    mainRibbonPolygon.push(innerChain[i]!);
  }

  const streakCount = Math.max(0, Math.floor(options.trailingStreakCount ?? 3));
  const trailingStreakPolygons: Polygon2D[] = [];
  const sweepSign = sweep >= 0 ? 1 : -1;
  for (let s = 0; s < streakCount; s += 1) {
    const bandRatio = (s + 0.5) / streakCount;
    const bandRadius = innerRadiusPx + (outerRadiusPx - innerRadiusPx) * bandRatio;
    const bandHalfWidth = Math.max(1.5, (outerRadiusPx - innerRadiusPx) / (streakCount * 3.2));
    const anchorAngle = startAngleRad + sweep * (0.14 + 0.08 * (s % 2));
    const tailAngle = startAngleRad - sweepSign * Math.min(0.45, Math.abs(sweep) * (0.18 + 0.07 * s));
    trailingStreakPolygons.push([
      {
        x: pivot.x + Math.cos(anchorAngle) * (bandRadius + bandHalfWidth),
        y: pivot.y + Math.sin(anchorAngle) * (bandRadius + bandHalfWidth),
      },
      {
        x: pivot.x + Math.cos(tailAngle) * bandRadius,
        y: pivot.y + Math.sin(tailAngle) * bandRadius,
      },
      {
        x: pivot.x + Math.cos(anchorAngle) * (bandRadius - bandHalfWidth),
        y: pivot.y + Math.sin(anchorAngle) * (bandRadius - bandHalfWidth),
      },
    ]);
  }

  return {
    mainRibbonPolygon,
    trailingStreakPolygons,
    arcLengthPx: Math.abs(sweep) * midRadius,
    leadingEdgeMidpoint: {
      x: pivot.x + Math.cos(endAngleRad) * midRadius,
      y: pivot.y + Math.sin(endAngleRad) * midRadius,
    },
    areaPx2: computePolygonAreaAbs(mainRibbonPolygon),
  };
}

/**
 * 타격 충격 방향을 따라 감쇠 조화 진동하는 카메라 쉐이크 키프레임 곡선을 생성한다.
 * 마지막 키프레임은 항상 원점 `(0, 0, 0)`으로 정확히 복귀한다.
 */
export function generateDirectionalCameraShake(options: CameraShakeOptions): CameraShakeCurve {
  const dirLen = Math.hypot(options.directionX, options.directionY);
  if (!(dirLen > 1e-9)) {
    throw new RangeError("카메라 쉐이크 충격 방향 벡터의 길이는 0보다 커야 합니다.");
  }
  if (!(options.fps > 0 && options.durationMs > 0 && options.amplitudePx >= 0)) {
    throw new RangeError("카메라 쉐이크 시간·프레임레이트·진폭 설정이 올바르지 않습니다.");
  }

  const ux = options.directionX / dirLen;
  const uy = options.directionY / dirLen;
  const vx = -uy;
  const vy = ux;

  const zeta = clamp(options.dampingRatio, 0.02, 0.99);
  const omegaN = 2 * Math.PI * Math.max(0.5, options.frequencyHz);
  const omegaD = omegaN * Math.sqrt(1 - zeta * zeta);
  const transverseRatio = clamp(options.transverseRatio ?? 0.22, 0, 1);
  const rollAmp = options.rollAmplitudeDeg ?? 0;

  const totalFrames = Math.max(2, Math.round((options.durationMs / 1000) * options.fps));
  const keyframes: CameraShakeKeyframe[] = [];
  let peakDisplacementPx = 0;
  let settledAtMs = options.durationMs;

  for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex += 1) {
    const isLast = frameIndex === totalFrames;
    const timeMs = isLast ? options.durationMs : (frameIndex * 1000) / options.fps;
    const tSec = timeMs / 1000;
    const rawEnvelope = isLast ? 0 : Math.exp(-zeta * omegaN * tSec);
    const progress = timeMs / options.durationMs;
    const tailWindow =
      progress > 0.85 ? 0.5 * (1 + Math.cos(((progress - 0.85) / 0.15) * Math.PI)) : 1;
    const envelope = isLast ? 0 : rawEnvelope * tailWindow;

    const axialDisp = options.amplitudePx * envelope * Math.cos(omegaD * tSec);
    const transverseDisp =
      options.amplitudePx * transverseRatio * envelope * Math.sin(omegaD * 1.73 * tSec);
    const offsetX = isLast ? 0 : ux * axialDisp + vx * transverseDisp;
    const offsetY = isLast ? 0 : uy * axialDisp + vy * transverseDisp;
    const rotationDeg = isLast ? 0 : rollAmp * envelope * Math.sin(omegaD * 1.15 * tSec);

    const disp = Math.hypot(offsetX, offsetY);
    if (disp > peakDisplacementPx) peakDisplacementPx = disp;
    if (envelope > 0.02) {
      settledAtMs = Math.min(options.durationMs, ((frameIndex + 1) * 1000) / options.fps);
    }

    keyframes.push({
      frameIndex,
      timeMs,
      offsetX,
      offsetY,
      rotationDeg,
      energyEnvelope: envelope,
    });
  }

  return { keyframes, peakDisplacementPx, settledAtMs };
}
