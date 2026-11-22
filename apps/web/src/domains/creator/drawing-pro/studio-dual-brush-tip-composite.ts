/**
 * 클린룸 듀얼 브러시 팁 마스크 합성 엔진 (`multiply` / `subtract` / `darken` / `overlay`).
 *
 * - 주 팁 마스크와 보조 팁 마스크(스케일·회전·오프셋·타일링·반전 지원, 이중선형 보간)를
 *   정규화 커버리지(0..1) 영역에서 순수 수학으로 합성한다.
 * - 모든 합성 모드는 `primary === 0` 일 때 `0`을 보존해 주 브러시 실루엣 바깥 번짐을 방지한다.
 */

export type DualBrushTipCompositeMode = "multiply" | "subtract" | "darken" | "overlay";

export const DUAL_BRUSH_TIP_COMPOSITE_MODES: readonly DualBrushTipCompositeMode[] = Object.freeze([
  "multiply",
  "subtract",
  "darken",
  "overlay",
]);

export interface BrushTipMaskBuffer {
  readonly width: number;
  readonly height: number;
  /** 정규화 커버리지(Float32Array 0..1) 또는 8비트 알파(Uint8Array 0..255). */
  readonly data: Float32Array | Uint8Array;
}

export interface DualBrushTipCompositeOptions {
  readonly mode: DualBrushTipCompositeMode;
  /** 보조 브러시 팁 합성 강도(0..1). 기본값 1. */
  readonly strength01?: number;
  /** 보조 브러시 팁 스케일(0.25..4). 기본값 1. */
  readonly secondaryScale?: number;
  /** 보조 브러시 팁 회전각(rad). 기본값 0. */
  readonly secondaryRotationRad?: number;
  /** 보조 브러시 팁 오프셋(px). 기본값 0. */
  readonly secondaryOffsetX?: number;
  readonly secondaryOffsetY?: number;
  /** 보조 팁을 경계 밖에서 반복 타일링할지 여부. 기본값 false. */
  readonly tileSecondary?: boolean;
  /** 보조 팁 마스크를 반전(1 - b)해 적용할지 여부. 기본값 false. */
  readonly invertSecondary?: boolean;
}

export interface DualBrushTipCompositeResult {
  readonly width: number;
  readonly height: number;
  readonly mode: DualBrushTipCompositeMode;
  readonly coverage: Float32Array;
  readonly maskU8: Uint8Array;
  readonly minCoverage: number;
  readonly maxCoverage: number;
  readonly meanCoverage: number;
  readonly activePixelCount: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * 단일 픽셀 정규화 커버리지(0..1)에 대해 두 브러시 팁을 지정 모드로 합성한다.
 * `primary01 === 0` 이면 모드와 무관하게 항상 0을 반환한다.
 */
export function blendDualBrushTipCoverage(
  primary01: number,
  secondary01: number,
  mode: DualBrushTipCompositeMode,
  strength01 = 1,
): number {
  const a = clamp01(primary01);
  if (a <= 0) return 0;
  const b = clamp01(secondary01);
  const s = clamp01(strength01);

  let blended: number;
  switch (mode) {
    case "multiply":
      blended = a * b;
      break;
    case "subtract":
      blended = Math.max(0, a - b);
      break;
    case "darken":
      blended = Math.min(a, b);
      break;
    case "overlay":
      blended = a < 0.5 ? 2 * a * b : 1 - 2 * (1 - a) * (1 - b);
      break;
  }

  return clamp01(a + (blended - a) * s);
}

function readNormalizedMask(buffer: BrushTipMaskBuffer, x: number, y: number): number {
  const idx = y * buffer.width + x;
  const raw = buffer.data[idx] ?? 0;
  return buffer.data instanceof Float32Array ? clamp01(raw) : clamp01(raw / 255);
}

function wrapCoord(v: number, size: number): number {
  const m = v % size;
  return m < 0 ? m + size : m;
}

function sampleTipMaskBilinear(
  buffer: BrushTipMaskBuffer,
  x: number,
  y: number,
  tile: boolean,
): number {
  const { width, height } = buffer;
  if (width <= 0 || height <= 0) return 0;

  let sx = x;
  let sy = y;
  if (tile) {
    sx = wrapCoord(sx, width);
    sy = wrapCoord(sy, height);
  } else if (sx < 0 || sx > width - 1 || sy < 0 || sy > height - 1) {
    return 0;
  }

  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = tile ? (x0 + 1) % width : Math.min(width - 1, x0 + 1);
  const y1 = tile ? (y0 + 1) % height : Math.min(height - 1, y0 + 1);
  const fx = sx - x0;
  const fy = sy - y0;

  const v00 = readNormalizedMask(buffer, x0, y0);
  const v10 = readNormalizedMask(buffer, x1, y0);
  const v01 = readNormalizedMask(buffer, x0, y1);
  const v11 = readNormalizedMask(buffer, x1, y1);

  const top = v00 + (v10 - v00) * fx;
  const bottom = v01 + (v11 - v01) * fx;
  return clamp01(top + (bottom - top) * fy);
}

/**
 * 주 브러시 팁 마스크와 보조 브러시 팁 마스크를 지정 모드로 합성한다.
 */
export function compositeDualBrushTipMasks(
  primary: BrushTipMaskBuffer,
  secondary: BrushTipMaskBuffer,
  options: DualBrushTipCompositeOptions,
): DualBrushTipCompositeResult {
  const { width, height } = primary;
  const total = Math.max(0, width * height);
  const coverage = new Float32Array(total);
  const maskU8 = new Uint8Array(total);

  if (total === 0) {
    return {
      width,
      height,
      mode: options.mode,
      coverage,
      maskU8,
      minCoverage: 0,
      maxCoverage: 0,
      meanCoverage: 0,
      activePixelCount: 0,
    };
  }

  const strength = clamp01(options.strength01 ?? 1);
  const scale = clamp(options.secondaryScale ?? 1, 0.25, 4);
  const rot = Number.isFinite(options.secondaryRotationRad) ? options.secondaryRotationRad! : 0;
  const offsetX = Number.isFinite(options.secondaryOffsetX) ? options.secondaryOffsetX! : 0;
  const offsetY = Number.isFinite(options.secondaryOffsetY) ? options.secondaryOffsetY! : 0;
  const tile = options.tileSecondary ?? false;
  const invert = options.invertSecondary ?? false;

  const cosR = Math.cos(-rot);
  const sinR = Math.sin(-rot);
  const pCx = (width - 1) * 0.5;
  const pCy = (height - 1) * 0.5;
  const sCx = (secondary.width - 1) * 0.5;
  const sCy = (secondary.height - 1) * 0.5;
  const ratioX = secondary.width > 1 && width > 1 ? (secondary.width - 1) / (width - 1) : 1;
  const ratioY = secondary.height > 1 && height > 1 ? (secondary.height - 1) / (height - 1) : 1;

  let minCoverage = 1;
  let maxCoverage = 0;
  let sumCoverage = 0;
  let activePixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const a = readNormalizedMask(primary, x, y);
      let out = 0;
      if (a > 0) {
        const dx = (x - pCx - offsetX) / scale;
        const dy = (y - pCy - offsetY) / scale;
        const rx = dx * cosR - dy * sinR;
        const ry = dx * sinR + dy * cosR;
        const sx = sCx + rx * ratioX;
        const sy = sCy + ry * ratioY;
        const sampled = sampleTipMaskBilinear(secondary, sx, sy, tile);
        const b = invert ? 1 - sampled : sampled;
        out = blendDualBrushTipCoverage(a, b, options.mode, strength);
      }

      coverage[idx] = out;
      const byteVal = Math.round(out * 255);
      maskU8[idx] = byteVal;
      if (out < minCoverage) minCoverage = out;
      if (out > maxCoverage) maxCoverage = out;
      sumCoverage += out;
      if (byteVal > 0) activePixelCount += 1;
    }
  }

  return {
    width,
    height,
    mode: options.mode,
    coverage,
    maskU8,
    minCoverage,
    maxCoverage,
    meanCoverage: sumCoverage / total,
    activePixelCount,
  };
}

/** 결정적 원형 브러시 팁 마스크를 생성한다(hardness 0..1). */
export function generateRadialBrushTipMask(size: number, hardness01 = 0.7): BrushTipMaskBuffer {
  const dim = Math.max(1, Math.min(512, Math.round(size)));
  const hardness = clamp01(hardness01);
  const data = new Float32Array(dim * dim);
  const center = (dim - 1) * 0.5;
  const maxR = Math.max(0.5, dim * 0.5);

  for (let y = 0; y < dim; y += 1) {
    for (let x = 0; x < dim; x += 1) {
      const distNorm = Math.hypot(x - center, y - center) / maxR;
      let cov = 0;
      if (distNorm < 1) {
        if (hardness >= 0.999 || distNorm <= hardness) {
          cov = 1;
        } else {
          const t = (distNorm - hardness) / (1 - hardness);
          cov = 1 - t * t * (3 - 2 * t);
        }
      }
      data[y * dim + x] = clamp01(cov);
    }
  }
  return { width: dim, height: dim, data };
}

/** 결정적 해시 기반 절차적 브러시 질감 팁 마스크를 생성한다(외부 에셋 없음). */
export function generateProceduralGrainTipMask(
  size: number,
  seed = 1337,
  frequency = 0.35,
): BrushTipMaskBuffer {
  const dim = Math.max(1, Math.min(512, Math.round(size)));
  const freq = clamp(frequency, 0.05, 4);
  const data = new Float32Array(dim * dim);

  for (let y = 0; y < dim; y += 1) {
    for (let x = 0; x < dim; x += 1) {
      const h = Math.sin(x * 12.9898 * freq + y * 78.233 * freq + seed * 0.137) * 43758.5453;
      const frac = h - Math.floor(h);
      const wave = 0.5 + 0.5 * Math.sin(x * freq * 1.7 + y * freq * 1.3 + seed * 0.05);
      data[y * dim + x] = clamp01(0.55 * frac + 0.45 * wave);
    }
  }
  return { width: dim, height: dim, data };
}
