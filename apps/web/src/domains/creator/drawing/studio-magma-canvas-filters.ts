/**
 * Magma Studio 블렌드 브러시(Blend Brush)·리퀴파이(Liquify)·CSL 필터 커널 모음
 *
 * REA 정적·라이브 번들 분석(`chunk-88e51f61.js`)에서 확인된 Magma Studio의 WebGL 셰이더 및
 * Canvas Shader Language(CSL) 파이프라인을 순수 결정론적 CPU/TypedArray 커널로 클린룸 구현한다:
 * 1. Ping-Pong 리덕션 + 물감 저장소(Reservoir) 블렌드 브러시 (`paint**2`, `sqrt(stretch)`, `opacityLocked`)
 * 2. 2D 변위장(Displacement Field) 리퀴파이 브러시 (`push`, `twirl-cw`, `twirl-ccw`, `pinch`, `expand`, `reconstruct`)
 * 3. CSL MotionBlur (투명 픽셀 검은 번짐을 원천 차단하는 양방향 알파 가중 스트리킹)
 * 4. CSL Multi-Channel Curves (`redCurve(rgbCurve(r))` 마스터+개별 채널 합성 LUT)
 * 5. CSL Ordered Bayer Dither ($2\times2, 4\times4, 8\times8$ 순서 디더링 양자화)
 * 6. CSL ChromaticAberration (R/B 반대 방향 서브픽셀 색수차) & Outline (외곽선 추출)
 */

export interface RgbaColor01 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface MagmaBlendReservoirState {
  r: number;
  g: number;
  b: number;
  a: number;
  initialized: boolean;
}

export interface MagmaBlendBrushDabParams {
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly hardness01: number;
  /** 전경 물감 주입량 (0..1, Magma 규격에 따라 제곱 `paint**2`으로 가중) */
  readonly paint01: number;
  readonly paintPressure: boolean;
  readonly paintTilt: boolean;
  /** 기존 캔버스 물감을 끌고 가는 거리 비율 (0..1, Magma 규격 `sqrt(stretch)`) */
  readonly stretch01: number;
  readonly flow01: number;
  readonly pressure01: number;
  readonly tilt01: number;
  readonly opacityLocked: boolean;
  readonly brushColor: { readonly r: number; readonly g: number; readonly b: number };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

export function createMagmaBlendReservoirState(): MagmaBlendReservoirState {
  return { r: 0, g: 0, b: 0, a: 0, initialized: false };
}

function computeRadialHardnessWeight(distRatio01: number, hardness01: number): number {
  if (distRatio01 >= 1) return 0;
  const h = clampRange(hardness01, 0, 0.999, 0.7);
  if (distRatio01 <= h) return 1;
  const u = (distRatio01 - h) / (1 - h);
  return 1 - u * u * (3 - 2 * u);
}

/**
 * Magma Studio(`chunk-88e51f61.js` `drawBlendBrush` / `blendReduction3` / `textureReservoir`)의
 * 리덕션 평균 + 물감 저장소(Reservoir) 블렌드 브러시 스텝을 RGBA 버퍼에 적용한다.
 */
export function applyMagmaBlendBrushDab(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  reservoir: MagmaBlendReservoirState,
  params: MagmaBlendBrushDabParams,
): { sampledPixelCount: number; modifiedPixelCount: number } {
  const rPx = clampRange(params.radiusPx, 1, 512, 12);
  const cx = clampRange(params.x, 0, width - 1, 0);
  const cy = clampRange(params.y, 0, height - 1, 0);
  const minX = Math.max(0, Math.floor(cx - rPx));
  const maxX = Math.min(width - 1, Math.ceil(cx + rPx));
  const minY = Math.max(0, Math.floor(cy - rPx));
  const maxY = Math.min(height - 1, Math.ceil(cy + rPx));

  // 1. 캔버스 발자국 내 알파 가중 평균 리덕션 (Magma blendReduction3 대응)
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumA = 0;
  let weightSum = 0;
  let sampledPixelCount = 0;

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const dist = Math.hypot(px - cx, py - cy);
      if (dist > rPx) continue;
      const w = computeRadialHardnessWeight(dist / rPx, params.hardness01);
      if (w <= 1e-5) continue;

      const idx = (py * width + px) * 4;
      const a = (rgba[idx + 3] ?? 0) / 255;
      const r = (rgba[idx] ?? 0) / 255;
      const g = (rgba[idx + 1] ?? 0) / 255;
      const b = (rgba[idx + 2] ?? 0) / 255;

      const alphaWeight = w * Math.max(0.02, a);
      sumR += r * alphaWeight;
      sumG += g * alphaWeight;
      sumB += b * alphaWeight;
      sumA += a * w;
      weightSum += alphaWeight;
      sampledPixelCount += 1;
    }
  }

  const canvasAvgR = weightSum > 1e-5 ? sumR / weightSum : params.brushColor.r;
  const canvasAvgG = weightSum > 1e-5 ? sumG / weightSum : params.brushColor.g;
  const canvasAvgB = weightSum > 1e-5 ? sumB / weightSum : params.brushColor.b;
  const canvasAvgA = sampledPixelCount > 0 ? clamp01(sumA / sampledPixelCount) : 1;

  // 2. Reservoir 갱신: stretch = sqrt(stretch01), paint = (paint01 * mod)^2
  const stretchCarry = Math.sqrt(clamp01(params.stretch01));
  let paintFactor = clamp01(params.paint01);
  if (params.paintPressure) paintFactor *= clamp01(params.pressure01);
  if (params.paintTilt) paintFactor *= 1 - clamp01(params.tilt01);
  const quadraticPaint = paintFactor * paintFactor;

  if (!reservoir.initialized) {
    reservoir.r = canvasAvgR;
    reservoir.g = canvasAvgG;
    reservoir.b = canvasAvgB;
    reservoir.a = canvasAvgA;
    reservoir.initialized = true;
  } else {
    reservoir.r = lerp(canvasAvgR, reservoir.r, stretchCarry);
    reservoir.g = lerp(canvasAvgG, reservoir.g, stretchCarry);
    reservoir.b = lerp(canvasAvgB, reservoir.b, stretchCarry);
    reservoir.a = lerp(canvasAvgA, reservoir.a, stretchCarry);
  }

  // 전경 물감 주입
  reservoir.r = lerp(reservoir.r, clamp01(params.brushColor.r), quadraticPaint);
  reservoir.g = lerp(reservoir.g, clamp01(params.brushColor.g), quadraticPaint);
  reservoir.b = lerp(reservoir.b, clamp01(params.brushColor.b), quadraticPaint);
  reservoir.a = Math.max(reservoir.a, quadraticPaint);

  // 3. 블렌딩된 Reservoir 색상을 캔버스에 도포
  const flow = clampRange(params.flow01, 0.02, 1, 0.65);
  let modifiedPixelCount = 0;

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const dist = Math.hypot(px - cx, py - cy);
      if (dist > rPx) continue;
      const w = computeRadialHardnessWeight(dist / rPx, params.hardness01) * flow;
      if (w <= 1e-4) continue;

      const idx = (py * width + px) * 4;
      const dstR = (rgba[idx] ?? 0) / 255;
      const dstG = (rgba[idx + 1] ?? 0) / 255;
      const dstB = (rgba[idx + 2] ?? 0) / 255;
      const dstA = (rgba[idx + 3] ?? 0) / 255;

      rgba[idx] = Math.round(lerp(dstR, reservoir.r, w) * 255);
      rgba[idx + 1] = Math.round(lerp(dstG, reservoir.g, w) * 255);
      rgba[idx + 2] = Math.round(lerp(dstB, reservoir.b, w) * 255);
      if (!params.opacityLocked) {
        rgba[idx + 3] = Math.round(lerp(dstA, Math.max(dstA, reservoir.a), w) * 255);
      }
      modifiedPixelCount += 1;
    }
  }

  return { sampledPixelCount, modifiedPixelCount };
}

// ============================================================================
// Magma 인터랙티브 리퀴파이(Liquify) 2D 변위장
// ============================================================================

export type MagmaLiquifyMode =
  | "push"
  | "twirl-cw"
  | "twirl-ccw"
  | "pinch"
  | "expand"
  | "reconstruct";

export interface MagmaLiquifyStrokeStep {
  readonly x: number;
  readonly y: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly radiusPx: number;
  readonly hardness01: number;
  readonly stretch01: number;
  readonly mode: MagmaLiquifyMode;
}

/**
 * Magma Studio(`drawLiquifyBrush` / `liquifyDisplacement`)의 2D 실수 변위장(Displacement Field) 모델.
 */
export class MagmaLiquifyDisplacementField {
  public readonly width: number;
  public readonly height: number;
  /** 픽셀당 누적 X 변위 (source 샘플링 시 `x - dx` 위치 참조) */
  public readonly dxField: Float32Array;
  /** 픽셀당 누적 Y 변위 (source 샘플링 시 `y - dy` 위치 참조) */
  public readonly dyField: Float32Array;

  public constructor(width: number, height: number) {
    this.width = Math.max(1, Math.trunc(width));
    this.height = Math.max(1, Math.trunc(height));
    const count = this.width * this.height;
    this.dxField = new Float32Array(count);
    this.dyField = new Float32Array(count);
  }

  public reset(): void {
    this.dxField.fill(0);
    this.dyField.fill(0);
  }

  public applyStrokeStep(step: MagmaLiquifyStrokeStep): number {
    const rPx = clampRange(step.radiusPx, 1, 1024, 24);
    const cx = clampRange(step.x, 0, this.width - 1, 0);
    const cy = clampRange(step.y, 0, this.height - 1, 0);
    const stretch = clampRange(step.stretch01, 0.05, 1, 0.75);
    const minX = Math.max(0, Math.floor(cx - rPx));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + rPx));
    const minY = Math.max(0, Math.floor(cy - rPx));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + rPx));

    let affectedCount = 0;
    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const relX = px - cx;
        const relY = py - cy;
        const dist = Math.hypot(relX, relY);
        if (dist > rPx) continue;

        const weight =
          computeRadialHardnessWeight(dist / rPx, step.hardness01) * stretch;
        if (weight <= 1e-5) continue;

        const cellIdx = py * this.width + px;
        switch (step.mode) {
          case "push": {
            this.dxField[cellIdx] = (this.dxField[cellIdx] ?? 0) + step.deltaX * weight;
            this.dyField[cellIdx] = (this.dyField[cellIdx] ?? 0) + step.deltaY * weight;
            break;
          }
          case "twirl-cw":
          case "twirl-ccw": {
            const sign = step.mode === "twirl-cw" ? 1 : -1;
            const angle = sign * weight * 0.35;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const rotX = relX * cosA - relY * sinA - relX;
            const rotY = relX * sinA + relY * cosA - relY;
            this.dxField[cellIdx] = (this.dxField[cellIdx] ?? 0) + rotX;
            this.dyField[cellIdx] = (this.dyField[cellIdx] ?? 0) + rotY;
            break;
          }
          case "pinch": {
            this.dxField[cellIdx] = (this.dxField[cellIdx] ?? 0) - relX * weight * 0.35;
            this.dyField[cellIdx] = (this.dyField[cellIdx] ?? 0) - relY * weight * 0.35;
            break;
          }
          case "expand": {
            this.dxField[cellIdx] = (this.dxField[cellIdx] ?? 0) + relX * weight * 0.35;
            this.dyField[cellIdx] = (this.dyField[cellIdx] ?? 0) + relY * weight * 0.35;
            break;
          }
          case "reconstruct": {
            const keep = 1 - clamp01(weight);
            this.dxField[cellIdx] = (this.dxField[cellIdx] ?? 0) * keep;
            this.dyField[cellIdx] = (this.dyField[cellIdx] ?? 0) * keep;
            break;
          }
        }
        affectedCount += 1;
      }
    }
    return affectedCount;
  }
}

function sampleRgbaBilinear(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const clampedX = clampRange(x, 0, width - 1, 0);
  const clampedY = clampRange(y, 0, height - 1, 0);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;

  const idx00 = (y0 * width + x0) * 4;
  const idx10 = (y0 * width + x1) * 4;
  const idx01 = (y1 * width + x0) * 4;
  const idx11 = (y1 * width + x1) * 4;

  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c += 1) {
    const top = lerp(src[idx00 + c] ?? 0, src[idx10 + c] ?? 0, fx);
    const bottom = lerp(src[idx01 + c] ?? 0, src[idx11 + c] ?? 0, fx);
    out[c] = Math.round(lerp(top, bottom, fy));
  }
  return out;
}

/**
 * 누적된 리퀴파이 변위장을 원본 RGBA 버퍼에 양선형 보간(Bilinear Interpolation)으로 적용한다.
 */
export function applyLiquifyDisplacementToBuffer(
  srcRgba: Uint8ClampedArray,
  field: MagmaLiquifyDisplacementField,
): Uint8ClampedArray {
  const { width, height, dxField, dyField } = field;
  const out = new Uint8ClampedArray(srcRgba.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cellIdx = y * width + x;
      const srcX = x - (dxField[cellIdx] ?? 0);
      const srcY = y - (dyField[cellIdx] ?? 0);
      const [r, g, b, a] = sampleRgbaBilinear(srcRgba, width, height, srcX, srcY);
      const dstIdx = cellIdx * 4;
      out[dstIdx] = r;
      out[dstIdx + 1] = g;
      out[dstIdx + 2] = b;
      out[dstIdx + 3] = a;
    }
  }

  return out;
}

// ============================================================================
// Magma CSL (Canvas Shader Language) 필터 커널 모음
// ============================================================================

/**
 * Magma CSL `filter MotionBlur(angle, distance)` 클린룸 구현.
 *
 * 투명한 배경 픽셀(`alpha = 0, rgb = 0`)의 검은색이 불투명한 선화/채색 경계에 번지는 현상을 막기 위해
 * RGB는 `sample.rgb * sample.a`로 알파 가중 누적하고 알파는 탭 전체 평균을 취한다.
 */
export function applyMagmaMotionBlurFilter(
  srcRgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: {
    readonly angleDeg: number;
    readonly distancePx: number;
    readonly sampleSteps?: number;
  },
): Uint8ClampedArray {
  const distance = clampRange(options.distancePx, 0, 256, 12);
  if (distance <= 0.1) return new Uint8ClampedArray(srcRgba);

  const halfRadius = Math.max(1, Math.min(32, Math.round(options.sampleSteps ?? 10)));
  const rad = (clampRange(options.angleDeg, -360, 360, 0) * Math.PI) / 180;
  const dirX = Math.cos(rad) * distance;
  const dirY = Math.sin(rad) * distance;

  const out = new Uint8ClampedArray(srcRgba.length);
  const totalTaps = halfRadius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let accumR = 0;
      let accumG = 0;
      let accumB = 0;
      let accumAlphaWeight = 0;
      let accumRawAlpha = 0;

      for (let i = -halfRadius; i <= halfRadius; i += 1) {
        const t = i / halfRadius;
        const sampleX = x + t * dirX;
        const sampleY = y + t * dirY;
        const [sr, sg, sb, sa] = sampleRgbaBilinear(
          srcRgba,
          width,
          height,
          sampleX,
          sampleY,
        );
        const a01 = sa / 255;
        accumR += sr * a01;
        accumG += sg * a01;
        accumB += sb * a01;
        accumAlphaWeight += a01;
        accumRawAlpha += sa;
      }

      const dstIdx = (y * width + x) * 4;
      if (accumAlphaWeight > 1e-5) {
        out[dstIdx] = Math.round(accumR / accumAlphaWeight);
        out[dstIdx + 1] = Math.round(accumG / accumAlphaWeight);
        out[dstIdx + 2] = Math.round(accumB / accumAlphaWeight);
      } else {
        out[dstIdx] = 0;
        out[dstIdx + 1] = 0;
        out[dstIdx + 2] = 0;
      }
      out[dstIdx + 3] = Math.round(accumRawAlpha / totalTaps);
    }
  }

  return out;
}

export interface CurveControlPoint {
  readonly x: number; // 0..1
  readonly y: number; // 0..1
}

function buildCurveLut256(points?: readonly CurveControlPoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  if (!points || points.length === 0) {
    for (let i = 0; i < 256; i += 1) lut[i] = i;
    return lut;
  }

  const sorted = [...points]
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
    .sort((a, b) => a.x - b.x);

  if (sorted.length === 0) {
    for (let i = 0; i < 256; i += 1) lut[i] = i;
    return lut;
  }

  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    if (t <= sorted[0]!.x) {
      lut[i] = Math.round(sorted[0]!.y * 255);
      continue;
    }
    const last = sorted[sorted.length - 1]!;
    if (t >= last.x) {
      lut[i] = Math.round(last.y * 255);
      continue;
    }

    let segIndex = 0;
    for (let s = 0; s < sorted.length - 1; s += 1) {
      if (t >= sorted[s]!.x && t <= sorted[s + 1]!.x) {
        segIndex = s;
        break;
      }
    }
    const p0 = sorted[segIndex]!;
    const p1 = sorted[segIndex + 1]!;
    const span = Math.max(1e-6, p1.x - p0.x);
    const localU = (t - p0.x) / span;
    lut[i] = Math.round(lerp(p0.y, p1.y, localU) * 255);
  }
  return lut;
}

/**
 * Magma CSL `filter Curves(rgbCurve, redCurve, greenCurve, blueCurve)` 클린룸 구현.
 *
 * 마스터 `rgbCurve`를 먼저 통과시킨 뒤 개별 `redCurve`, `greenCurve`, `blueCurve` LUT를 합성(`redCurve(rgbCurve(r))`)한다.
 */
export function applyMagmaMultiChannelCurvesFilter(
  srcRgba: Uint8ClampedArray,
  options: {
    readonly masterCurve?: readonly CurveControlPoint[];
    readonly redCurve?: readonly CurveControlPoint[];
    readonly greenCurve?: readonly CurveControlPoint[];
    readonly blueCurve?: readonly CurveControlPoint[];
  },
): Uint8ClampedArray {
  const masterLut = buildCurveLut256(options.masterCurve);
  const redLut = buildCurveLut256(options.redCurve);
  const greenLut = buildCurveLut256(options.greenCurve);
  const blueLut = buildCurveLut256(options.blueCurve);

  const out = new Uint8ClampedArray(srcRgba.length);
  for (let i = 0; i < srcRgba.length; i += 4) {
    const rMaster = masterLut[srcRgba[i] ?? 0] ?? 0;
    const gMaster = masterLut[srcRgba[i + 1] ?? 0] ?? 0;
    const bMaster = masterLut[srcRgba[i + 2] ?? 0] ?? 0;
    out[i] = redLut[rMaster] ?? 0;
    out[i + 1] = greenLut[gMaster] ?? 0;
    out[i + 2] = blueLut[bMaster] ?? 0;
    out[i + 3] = srcRgba[i + 3] ?? 0;
  }
  return out;
}

const BAYER_4X4: readonly number[] = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

/**
 * Magma CSL `filter Dither` 순서 디더링(Ordered Bayer Matrix Quantization) 필터.
 */
export function applyMagmaOrderedDitherFilter(
  srcRgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: {
    readonly levels: number;
    readonly strength01: number;
  },
): Uint8ClampedArray {
  const levels = Math.round(clampRange(options.levels, 2, 64, 4));
  const strength = clamp01(options.strength01);
  const step = 255 / (levels - 1);
  const out = new Uint8ClampedArray(srcRgba.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bayerVal = (BAYER_4X4[(y & 3) * 4 + (x & 3)] ?? 0) / 16 - 0.5;
      const offset = bayerVal * step * strength;
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const raw = (srcRgba[idx + c] ?? 0) + offset;
        const quantized = Math.round(clampRange(raw, 0, 255, 0) / step) * step;
        out[idx + c] = Math.round(clampRange(quantized, 0, 255, 0));
      }
      out[idx + 3] = srcRgba[idx + 3] ?? 0;
    }
  }

  return out;
}

/**
 * Magma CSL `filter ChromaticAberration` 및 `filter Outline` 클린룸 구현.
 */
export function applyMagmaChromaticAberrationFilter(
  srcRgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: { readonly shiftXPx: number; readonly shiftYPx: number },
): Uint8ClampedArray {
  const sx = clampRange(options.shiftXPx, -64, 64, 2);
  const sy = clampRange(options.shiftYPx, -64, 64, 0);
  const out = new Uint8ClampedArray(srcRgba.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r] = sampleRgbaBilinear(srcRgba, width, height, x - sx, y - sy);
      const [, , b] = sampleRgbaBilinear(srcRgba, width, height, x + sx, y + sy);
      const idx = (y * width + x) * 4;
      out[idx] = r;
      out[idx + 1] = srcRgba[idx + 1] ?? 0;
      out[idx + 2] = b;
      out[idx + 3] = srcRgba[idx + 3] ?? 0;
    }
  }
  return out;
}

export function applyMagmaOutlineFilter(
  srcRgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: {
    readonly radiusPx: number;
    readonly outlineColor: { readonly r: number; readonly g: number; readonly b: number };
    readonly outlineOnly?: boolean;
  },
): Uint8ClampedArray {
  const rPx = Math.round(clampRange(options.radiusPx, 1, 16, 2));
  const out = new Uint8ClampedArray(srcRgba.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const centerAlpha = srcRgba[idx + 3] ?? 0;
      let maxNeighborAlpha = 0;

      for (let dy = -rPx; dy <= rPx; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -rPx; dx <= rPx; dx += 1) {
          if (dx * dx + dy * dy > rPx * rPx) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const na = srcRgba[(ny * width + nx) * 4 + 3] ?? 0;
          if (na > maxNeighborAlpha) maxNeighborAlpha = na;
        }
      }

      const outlineAlpha = Math.max(0, maxNeighborAlpha - centerAlpha);
      if (options.outlineOnly) {
        out[idx] = options.outlineColor.r;
        out[idx + 1] = options.outlineColor.g;
        out[idx + 2] = options.outlineColor.b;
        out[idx + 3] = outlineAlpha;
      } else if (centerAlpha < 250 && outlineAlpha > 0) {
        const t = outlineAlpha / 255;
        const cA = centerAlpha / 255;
        out[idx] = Math.round(lerp(options.outlineColor.r, srcRgba[idx] ?? 0, cA));
        out[idx + 1] = Math.round(lerp(options.outlineColor.g, srcRgba[idx + 1] ?? 0, cA));
        out[idx + 2] = Math.round(lerp(options.outlineColor.b, srcRgba[idx + 2] ?? 0, cA));
        out[idx + 3] = Math.min(255, Math.round(centerAlpha + outlineAlpha * t));
      } else {
        out[idx] = srcRgba[idx] ?? 0;
        out[idx + 1] = srcRgba[idx + 1] ?? 0;
        out[idx + 2] = srcRgba[idx + 2] ?? 0;
        out[idx + 3] = centerAlpha;
      }
    }
  }

  return out;
}
