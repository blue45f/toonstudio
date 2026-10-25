/**
 * studio-procreate-adjustments-engine.ts
 *
 * REA(`reverse-engineer-anything`)를 통해 역공학한 Procreate Adjustments(조정) 15종 전체 체계 및
 * **Pencil Filters**(브러시로 캔버스에 조정 필터를 직접 칠하는 비파괴 공간 마스크 세션) 클린룸 내재화 엔진.
 *
 * 역공학 근거(REA Evidence IDs):
 * - `procreate-ipad-features.js` (`fucbpo-V.js` / `ypN6-mlN.js` / `app-CzuPj2sI.js`):
 *   `ev_22482a99a70629842037dbdb72528f372d0c9ce1aad19bfdb38d710af886704a`
 * - `procreate-handbook-app.js`:
 *   `ev_af0a9ac4a571dacc8add436b2a48d7fa161d09c8ef56694ec1882d2a8fd7eba1`
 */

export type ProcreateAdjustmentKind =
  | "hsb"
  | "color-balance"
  | "curves"
  | "gradient-map"
  | "gaussian-blur"
  | "motion-blur"
  | "perspective-blur"
  | "noise"
  | "sharpen"
  | "bloom"
  | "glitch"
  | "halftone"
  | "chromatic-aberration"
  | "liquify"
  | "clone";

export type ProcreateAdjustmentTargetMode = "layer" | "pencil";

const clamp = (v: number, min: number, max: number): number =>
  !Number.isFinite(v) ? min : v < min ? min : v > max ? max : v;

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hash2d01(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

function sampleBilinearRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  fx: number,
  fy: number,
): [number, number, number, number] {
  const cx = clamp(fx, 0, width - 1);
  const cy = clamp(fy, 0, height - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = cx - x0;
  const ty = cy - y0;

  const idx00 = (y0 * width + x0) * 4;
  const idx10 = (y0 * width + x1) * 4;
  const idx01 = (y1 * width + x0) * 4;
  const idx11 = (y1 * width + x1) * 4;

  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;

  const a00 = rgba[idx00 + 3] ?? 0;
  const a10 = rgba[idx10 + 3] ?? 0;
  const a01 = rgba[idx01 + 3] ?? 0;
  const a11 = rgba[idx11 + 3] ?? 0;
  const outA = a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11;

  if (outA <= 1e-4) return [0, 0, 0, 0];

  const pw00 = a00 * w00;
  const pw10 = a10 * w10;
  const pw01 = a01 * w01;
  const pw11 = a11 * w11;
  const r =
    ((rgba[idx00] ?? 0) * pw00 +
      (rgba[idx10] ?? 0) * pw10 +
      (rgba[idx01] ?? 0) * pw01 +
      (rgba[idx11] ?? 0) * pw11) /
    outA;
  const g =
    ((rgba[idx00 + 1] ?? 0) * pw00 +
      (rgba[idx10 + 1] ?? 0) * pw10 +
      (rgba[idx01 + 1] ?? 0) * pw01 +
      (rgba[idx11 + 1] ?? 0) * pw11) /
    outA;
  const b =
    ((rgba[idx00 + 2] ?? 0) * pw00 +
      (rgba[idx10 + 2] ?? 0) * pw10 +
      (rgba[idx01 + 2] ?? 0) * pw01 +
      (rgba[idx11 + 2] ?? 0) * pw11) /
    outA;

  return [r, g, b, outA];
}

/**
 * 1. Procreate Pencil Filters 세션 (`ProcreatePencilFilterSession`)
 *
 * 어떤 조정 필터(Gaussian Blur, Bloom, Glitch, HSB 등)든 레이어 전체에 일괄 적용하는 대신,
 * 브러시 필압·기울기로 공간 알파 마스크(`mask01`)에 칠하거나 지우면서(`erase`/`smudge`)
 * 실시간으로 필터 파라미터를 다시 조정할 수 있는 비파괴 세션이다.
 */
export class ProcreatePencilFilterSession {
  readonly width: number;
  readonly height: number;
  readonly kind: ProcreateAdjustmentKind;
  private readonly mask01: Float32Array;

  constructor(width: number, height: number, kind: ProcreateAdjustmentKind) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.kind = kind;
    this.mask01 = new Float32Array(this.width * this.height);
  }

  /**
   * 브러시 댑(paint) 또는 지우개(erase)로 Pencil Filter 가중치 마스크를 갱신한다.
   */
  paintFilterMaskDab(input: {
    readonly x: number;
    readonly y: number;
    readonly radiusPx: number;
    readonly pressure01: number;
    readonly softness01?: number;
    readonly mode?: "paint" | "erase";
  }): void {
    const r = Math.max(0.5, input.radiusPx);
    const strength = clamp(input.pressure01, 0, 1);
    const softness = clamp(input.softness01 ?? 0.5, 0.01, 1);
    const isErase = input.mode === "erase";

    const minX = Math.max(0, Math.floor(input.x - r));
    const maxX = Math.min(this.width - 1, Math.ceil(input.x + r));
    const minY = Math.max(0, Math.floor(input.y - r));
    const maxY = Math.min(this.height - 1, Math.ceil(input.y + r));

    for (let py = minY; py <= maxY; py += 1) {
      for (let px = minX; px <= maxX; px += 1) {
        const dist = Math.hypot(px - input.x, py - input.y);
        if (dist > r) continue;
        const normD = dist / r;
        const falloff =
          normD <= 1 - softness
            ? 1
            : clamp((1 - normD) / Math.max(1e-4, softness), 0, 1);
        const delta = strength * falloff;
        const idx = py * this.width + px;
        const prev = this.mask01[idx] ?? 0;
        this.mask01[idx] = isErase
          ? clamp(prev * (1 - delta), 0, 1)
          : clamp(prev + delta * (1 - prev), 0, 1);
      }
    }
  }

  getMaskValueAt(x: number, y: number): number {
    const ix = clamp(Math.round(x), 0, this.width - 1);
    const iy = clamp(Math.round(y), 0, this.height - 1);
    return this.mask01[iy * this.width + ix] ?? 0;
  }

  /**
   * 원본 버퍼(`sourceRgba`)와 임의 조정 필터 결과 버퍼(`filteredRgba`)를
   * Pencil Filter 마스크 가중치로 비파괴 합성한다.
   */
  compositeWithFilteredBuffer(
    sourceRgba: Uint8ClampedArray,
    filteredRgba: Uint8ClampedArray,
  ): Uint8ClampedArray {
    const out = new Uint8ClampedArray(sourceRgba.length);
    const totalPixels = this.width * this.height;
    for (let i = 0; i < totalPixels; i += 1) {
      const w = clamp(this.mask01[i] ?? 0, 0, 1);
      const base = i * 4;
      out[base] = clampByte((sourceRgba[base] ?? 0) * (1 - w) + (filteredRgba[base] ?? 0) * w);
      out[base + 1] = clampByte(
        (sourceRgba[base + 1] ?? 0) * (1 - w) + (filteredRgba[base + 1] ?? 0) * w,
      );
      out[base + 2] = clampByte(
        (sourceRgba[base + 2] ?? 0) * (1 - w) + (filteredRgba[base + 2] ?? 0) * w,
      );
      out[base + 3] = clampByte(
        (sourceRgba[base + 3] ?? 0) * (1 - w) + (filteredRgba[base + 3] ?? 0) * w,
      );
    }
    return out;
  }
}

/**
 * 2. Procreate Perspective Blur (`Positional` / `Directional` 소실점 방사 블러)
 */
export interface ProcreatePerspectiveBlurOptions {
  readonly width: number;
  readonly height: number;
  readonly vanishingX: number;
  readonly vanishingY: number;
  readonly mode: "positional" | "directional";
  readonly amount01: number;
  readonly directionalAngleRad?: number;
  readonly samples?: number;
}

export function applyProcreatePerspectiveBlurFilter(
  sourceRgba: Uint8ClampedArray,
  options: ProcreatePerspectiveBlurOptions,
): Uint8ClampedArray {
  const { width, height, vanishingX, vanishingY, mode } = options;
  const amount = clamp(options.amount01, 0, 1);
  if (amount <= 1e-4) return new Uint8ClampedArray(sourceRgba);

  const sampleCount = Math.max(3, Math.min(25, Math.floor(options.samples ?? 9)));
  const out = new Uint8ClampedArray(sourceRgba.length);
  const maxDiag = Math.max(1, Math.hypot(width, height));
  const dirAngle = options.directionalAngleRad ?? 0;
  const dirCos = Math.cos(dirAngle);
  const dirSin = Math.sin(dirAngle);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const vx = x - vanishingX;
      const vy = y - vanishingY;
      const dist = Math.hypot(vx, vy);
      const distRatio = clamp(dist / (maxDiag * 0.5), 0, 1);
      const maxSpanPx = amount * distRatio * 24;

      if (maxSpanPx < 0.25) {
        const idx = (y * width + x) * 4;
        out[idx] = sourceRgba[idx] ?? 0;
        out[idx + 1] = sourceRgba[idx + 1] ?? 0;
        out[idx + 2] = sourceRgba[idx + 2] ?? 0;
        out[idx + 3] = sourceRgba[idx + 3] ?? 0;
        continue;
      }

      const ux = mode === "positional" ? (dist > 1e-4 ? vx / dist : 1) : dirCos;
      const uy = mode === "positional" ? (dist > 1e-4 ? vy / dist : 0) : dirSin;

      let sumPremulR = 0;
      let sumPremulG = 0;
      let sumPremulB = 0;
      let sumA = 0;

      for (let s = 0; s < sampleCount; s += 1) {
        const t = sampleCount === 1 ? 0 : s / (sampleCount - 1) - 0.5;
        const sx = x + ux * t * maxSpanPx;
        const sy = y + uy * t * maxSpanPx;
        const [r, g, b, a] = sampleBilinearRgba(sourceRgba, width, height, sx, sy);
        sumPremulR += r * a;
        sumPremulG += g * a;
        sumPremulB += b * a;
        sumA += a;
      }

      const outIdx = (y * width + x) * 4;
      if (sumA <= 1e-4) {
        out[outIdx] = 0;
        out[outIdx + 1] = 0;
        out[outIdx + 2] = 0;
        out[outIdx + 3] = 0;
      } else {
        out[outIdx] = clampByte(sumPremulR / sumA);
        out[outIdx + 1] = clampByte(sumPremulG / sumA);
        out[outIdx + 2] = clampByte(sumPremulB / sumA);
        out[outIdx + 3] = clampByte(sumA / sampleCount);
      }
    }
  }
  return out;
}

/**
 * 3. Procreate Bloom 필터 (`Threshold`, `Transition`, `Size`, `Burn`, `Amount`)
 */
export interface ProcreateBloomFilterOptions {
  readonly width: number;
  readonly height: number;
  readonly amount01: number;
  readonly threshold01?: number;
  readonly transition01?: number;
  readonly sizePx?: number;
  readonly burn01?: number;
}

export function applyProcreateBloomFilter(
  sourceRgba: Uint8ClampedArray,
  options: ProcreateBloomFilterOptions,
): Uint8ClampedArray {
  const { width, height } = options;
  const amount = clamp(options.amount01, 0, 1);
  if (amount <= 1e-4) return new Uint8ClampedArray(sourceRgba);

  const threshold = clamp(options.threshold01 ?? 0.65, 0, 0.99);
  const transition = clamp(options.transition01 ?? 0.25, 0.02, 1);
  const radius = Math.max(1, Math.min(12, Math.round(options.sizePx ?? 3)));
  const burn = clamp(options.burn01 ?? 0.35, 0, 1);

  const brightR = new Float32Array(width * height);
  const brightG = new Float32Array(width * height);
  const brightB = new Float32Array(width * height);

  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    const r = (sourceRgba[idx] ?? 0) / 255;
    const g = (sourceRgba[idx + 1] ?? 0) / 255;
    const b = (sourceRgba[idx + 2] ?? 0) / 255;
    const a = (sourceRgba[idx + 3] ?? 0) / 255;
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) * a;
    const knee = clamp((lum - threshold + transition * 0.5) / transition, 0, 1);
    const weight = knee * knee * (3 - 2 * knee);
    brightR[i] = r * weight;
    brightG[i] = g * weight;
    brightB[i] = b * weight;
  }

  const out = new Uint8ClampedArray(sourceRgba.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = clamp(y + dy, 0, height - 1);
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = clamp(x + dx, 0, width - 1);
          const nIdx = ny * width + nx;
          sumR += brightR[nIdx] ?? 0;
          sumG += brightG[nIdx] ?? 0;
          sumB += brightB[nIdx] ?? 0;
          count += 1;
        }
      }
      const haloR = (sumR / count) * amount * (1 + burn * 0.85);
      const haloG = (sumG / count) * amount * (1 + burn * 0.85);
      const haloB = (sumB / count) * amount * (1 + burn * 0.85);

      const idx = (y * width + x) * 4;
      const baseR = (sourceRgba[idx] ?? 0) / 255;
      const baseG = (sourceRgba[idx + 1] ?? 0) / 255;
      const baseB = (sourceRgba[idx + 2] ?? 0) / 255;

      // Screen + Burn 하이브리드 광학 합성
      const screenR = 1 - (1 - baseR) * (1 - clamp(haloR, 0, 1));
      const screenG = 1 - (1 - baseG) * (1 - clamp(haloG, 0, 1));
      const screenB = 1 - (1 - baseB) * (1 - clamp(haloB, 0, 1));

      out[idx] = clampByte(screenR * 255);
      out[idx + 1] = clampByte(screenG * 255);
      out[idx + 2] = clampByte(screenB * 255);
      out[idx + 3] = sourceRgba[idx + 3] ?? 0;
    }
  }
  return out;
}

/**
 * 4. Procreate Glitch 필터 (`Artifact`, `Wave`, `Signal`, `Diverge`)
 */
export type ProcreateGlitchMode = "artifact" | "wave" | "signal" | "diverge";

export interface ProcreateGlitchFilterOptions {
  readonly width: number;
  readonly height: number;
  readonly mode: ProcreateGlitchMode;
  readonly amount01: number;
  readonly blockSizePx?: number;
  readonly seed?: number;
}

export function applyProcreateGlitchFilter(
  sourceRgba: Uint8ClampedArray,
  options: ProcreateGlitchFilterOptions,
): Uint8ClampedArray {
  const { width, height, mode } = options;
  const amount = clamp(options.amount01, 0, 1);
  if (amount <= 1e-4) return new Uint8ClampedArray(sourceRgba);

  const blockPx = Math.max(2, Math.floor(options.blockSizePx ?? 6));
  const seed = options.seed ?? 2026;
  const out = new Uint8ClampedArray(sourceRgba.length);

  for (let y = 0; y < height; y += 1) {
    const bandIndex = Math.floor(y / blockPx);
    const bandNoise = hash2d01(bandIndex, 17, seed) - 0.5;
    for (let x = 0; x < width; x += 1) {
      let shiftX = 0;
      let chromaSplitPx = amount * 6;

      switch (mode) {
        case "artifact": {
          const cellX = Math.floor(x / blockPx);
          const cellRand = hash2d01(cellX, bandIndex, seed);
          shiftX = cellRand > 0.65 ? (cellRand - 0.5) * amount * width * 0.35 : 0;
          break;
        }
        case "wave": {
          shiftX =
            Math.sin((y / Math.max(1, blockPx)) * Math.PI) *
            amount *
            width *
            0.18 *
            (1 + bandNoise);
          break;
        }
        case "signal": {
          shiftX = bandNoise * amount * width * 0.25;
          chromaSplitPx = amount * 10;
          break;
        }
        case "diverge": {
          shiftX = 0;
          chromaSplitPx = amount * 14;
          break;
        }
      }

      const [rSample] = sampleBilinearRgba(
        sourceRgba,
        width,
        height,
        x + shiftX - chromaSplitPx,
        y,
      );
      const [, gSample, , aSample] = sampleBilinearRgba(
        sourceRgba,
        width,
        height,
        x + shiftX,
        y,
      );
      const [, , bSample] = sampleBilinearRgba(
        sourceRgba,
        width,
        height,
        x + shiftX + chromaSplitPx,
        y,
      );

      const idx = (y * width + x) * 4;
      out[idx] = clampByte(rSample);
      out[idx + 1] = clampByte(gSample);
      out[idx + 2] = clampByte(bSample);
      out[idx + 3] = clampByte(aSample);
    }
  }
  return out;
}

/**
 * 5. Procreate Chromatic Aberration (`Transverse` 방사형 중심 폴오프 vs `Displace` 방향성 벡터)
 */
export interface ProcreateChromaticAberrationOptions {
  readonly width: number;
  readonly height: number;
  readonly mode: "transverse" | "displace";
  readonly amount01: number;
  /** Transverse 모드 중심점 (기본 캔버스 중앙) */
  readonly focalX?: number;
  readonly focalY?: number;
  /** Displace 모드 변위 각도 (라디안) */
  readonly angleRad?: number;
  /** 중심부 보호 폴오프 비율 (0..1) */
  readonly falloff01?: number;
  /** 색수차 채널 투명도 유지 비율 (0..1) */
  readonly transparency01?: number;
}

export function applyProcreateChromaticAberrationFilter(
  sourceRgba: Uint8ClampedArray,
  options: ProcreateChromaticAberrationOptions,
): Uint8ClampedArray {
  const { width, height, mode } = options;
  const amount = clamp(options.amount01, 0, 1);
  if (amount <= 1e-4) return new Uint8ClampedArray(sourceRgba);

  const focalX = options.focalX ?? width * 0.5;
  const focalY = options.focalY ?? height * 0.5;
  const falloff = clamp(options.falloff01 ?? 0.25, 0, 0.95);
  const transparency = clamp(options.transparency01 ?? 0, 0, 1);
  const angleRad = options.angleRad ?? 0;
  const maxRadius = Math.max(1, Math.hypot(width * 0.5, height * 0.5));
  const maxShiftPx = amount * 14;

  const out = new Uint8ClampedArray(sourceRgba.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let dx = 0;
      let dy = 0;
      if (mode === "transverse") {
        const vx = x - focalX;
        const vy = y - focalY;
        const dist = Math.hypot(vx, vy);
        const normDist = clamp(dist / maxRadius, 0, 1.5);
        const falloffGain =
          normDist <= falloff ? 0 : clamp((normDist - falloff) / (1 - falloff), 0, 1.5);
        if (dist > 1e-4) {
          dx = (vx / dist) * maxShiftPx * falloffGain;
          dy = (vy / dist) * maxShiftPx * falloffGain;
        }
      } else {
        const falloffGain = 1 - falloff * 0.5;
        dx = Math.cos(angleRad) * maxShiftPx * falloffGain;
        dy = Math.sin(angleRad) * maxShiftPx * falloffGain;
      }

      const [r, , , aR] = sampleBilinearRgba(sourceRgba, width, height, x - dx, y - dy);
      const [, g, , aG] = sampleBilinearRgba(sourceRgba, width, height, x, y);
      const [, , b, aB] = sampleBilinearRgba(sourceRgba, width, height, x + dx, y + dy);

      const idx = (y * width + x) * 4;
      const origA = sourceRgba[idx + 3] ?? 0;
      const spreadA = Math.max(aR, aG, aB);

      out[idx] = clampByte(r);
      out[idx + 1] = clampByte(g);
      out[idx + 2] = clampByte(b);
      out[idx + 3] = clampByte(origA * (1 - transparency) + spreadA * transparency);
    }
  }
  return out;
}

/**
 * 6. Procreate Noise 필터 (`Clouds` / `Ridges` / `Turbulence`, `Single` vs `Multi` 채널, `Octaves`)
 */
export interface ProcreateNoiseFilterOptions {
  readonly width: number;
  readonly height: number;
  readonly generator: "clouds" | "ridges" | "turbulence";
  readonly channelMode: "single" | "multi";
  readonly amount01: number;
  readonly scale01?: number;
  readonly octaves?: number;
  readonly seed?: number;
}

function fbmNoise(
  x: number,
  y: number,
  scale: number,
  octaves: number,
  generator: "clouds" | "ridges" | "turbulence",
  seed: number,
): number {
  let value = 0;
  let amp = 0.5;
  let freq = Math.max(0.02, (1 - scale * 0.85) * 0.5);
  let norm = 0;

  for (let o = 0; o < octaves; o += 1) {
    const n = hash2d01(Math.floor(x * freq * 10), Math.floor(y * freq * 10), seed + o * 31);
    let sample = n;
    if (generator === "ridges") {
      sample = 1 - Math.abs(n * 2 - 1);
      sample = sample * sample;
    } else if (generator === "turbulence") {
      sample = Math.abs(n * 2 - 1);
    }
    value += sample * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return norm > 0 ? value / norm : 0.5;
}

export function applyProcreateNoiseFilter(
  sourceRgba: Uint8ClampedArray,
  options: ProcreateNoiseFilterOptions,
): Uint8ClampedArray {
  const { width, height, generator, channelMode } = options;
  const amount = clamp(options.amount01, 0, 1);
  if (amount <= 1e-4) return new Uint8ClampedArray(sourceRgba);

  const scale = clamp(options.scale01 ?? 0.25, 0, 1);
  const octaves = Math.max(1, Math.min(8, Math.round(options.octaves ?? 4)));
  const seed = options.seed ?? 1337;
  const out = new Uint8ClampedArray(sourceRgba.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = sourceRgba[idx] ?? 0;
      const g = sourceRgba[idx + 1] ?? 0;
      const b = sourceRgba[idx + 2] ?? 0;
      const a = sourceRgba[idx + 3] ?? 0;

      if (channelMode === "single") {
        const mono = (fbmNoise(x, y, scale, octaves, generator, seed) - 0.5) * 255 * amount;
        out[idx] = clampByte(r + mono);
        out[idx + 1] = clampByte(g + mono);
        out[idx + 2] = clampByte(b + mono);
      } else {
        const nr = (fbmNoise(x, y, scale, octaves, generator, seed + 1) - 0.5) * 255 * amount;
        const ng = (fbmNoise(x, y, scale, octaves, generator, seed + 2) - 0.5) * 255 * amount;
        const nb = (fbmNoise(x, y, scale, octaves, generator, seed + 3) - 0.5) * 255 * amount;
        out[idx] = clampByte(r + nr);
        out[idx + 1] = clampByte(g + ng);
        out[idx + 2] = clampByte(b + nb);
      }
      out[idx + 3] = a;
    }
  }
  return out;
}

/**
 * 7. Procreate Liquify (`Crystals`, `Edge`, `Reconstruct`, 비파괴 `Adjust` 엔벨로프 포함 8모드)
 */
export type ProcreateLiquifyMode =
  | "push"
  | "twirl-right"
  | "twirl-left"
  | "pinch"
  | "expand"
  | "crystals"
  | "edge"
  | "reconstruct";

export function evaluateProcreateLiquifyDisplacementAt(input: {
  readonly x: number;
  readonly y: number;
  readonly brushX: number;
  readonly brushY: number;
  readonly radiusPx: number;
  readonly mode: ProcreateLiquifyMode;
  readonly pressure01: number;
  readonly distortion01: number;
  readonly momentum01: number;
  readonly strokeDeltaX?: number;
  readonly strokeDeltaY?: number;
  /** 비파괴 Adjust 슬라이더 (0 = 원본 복원, 1 = 100% 변형 적용) */
  readonly adjustEnvelope01?: number;
}): { readonly displacedX: number; readonly displacedY: number } {
  const r = Math.max(1, input.radiusPx);
  const dx = input.x - input.brushX;
  const dy = input.y - input.brushY;
  const dist = Math.hypot(dx, dy);
  const envelope = clamp(input.adjustEnvelope01 ?? 1, 0, 1);

  if (dist >= r || envelope <= 1e-4 || input.mode === "reconstruct") {
    return { displacedX: input.x, displacedY: input.y };
  }

  const falloff = (1 - dist / r) ** 2;
  const strength =
    clamp(input.pressure01, 0, 1) *
    (1 + clamp(input.momentum01, 0, 1) * 0.5) *
    falloff *
    envelope;

  let offsetX = 0;
  let offsetY = 0;

  switch (input.mode) {
    case "push": {
      offsetX = (input.strokeDeltaX ?? 0) * strength;
      offsetY = (input.strokeDeltaY ?? 0) * strength;
      break;
    }
    case "twirl-right":
    case "twirl-left": {
      const sign = input.mode === "twirl-right" ? 1 : -1;
      const angle = sign * strength * Math.PI * 0.65;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      offsetX = dx * cosA - dy * sinA - dx;
      offsetY = dx * sinA + dy * cosA - dy;
      break;
    }
    case "pinch": {
      offsetX = -dx * strength * 0.55;
      offsetY = -dy * strength * 0.55;
      break;
    }
    case "expand": {
      offsetX = dx * strength * 0.65;
      offsetY = dy * strength * 0.65;
      break;
    }
    case "crystals": {
      const facetCount = Math.max(4, Math.round(6 + clamp(input.distortion01, 0, 1) * 14));
      const angle = Math.atan2(dy, dx);
      const quantizedAngle =
        (Math.round((angle / (Math.PI * 2)) * facetCount) / facetCount) * Math.PI * 2;
      const crystalRadius = dist * (1 + 0.28 * clamp(input.distortion01, 0.1, 1));
      offsetX = Math.cos(quantizedAngle) * crystalRadius - dx;
      offsetY = Math.sin(quantizedAngle) * crystalRadius - dy;
      offsetX *= strength;
      offsetY *= strength;
      break;
    }
    case "edge": {
      // 브러시 진행 수직 경계선 쪽으로 픽셀을 끌어당겨 칼날 같은 윤곽 형성
      const targetRing = r * 0.5;
      const scaleToRing = dist > 1e-4 ? (targetRing - dist) / dist : 0;
      offsetX = dx * scaleToRing * strength * 0.7;
      offsetY = dy * scaleToRing * strength * 0.7;
      break;
    }
  }

  return {
    displacedX: input.x + offsetX,
    displacedY: input.y + offsetY,
  };
}

/**
 * 8. Procreate Clone (복제 도장 툴 — 고정핀 `lockSourcePin` 및 이동 오프셋 복제)
 */
export function applyProcreateCloneStampDab(
  rgba: Uint8ClampedArray,
  options: {
    readonly width: number;
    readonly height: number;
    readonly sourceX: number;
    readonly sourceY: number;
    readonly targetX: number;
    readonly targetY: number;
    readonly radiusPx: number;
    readonly strength01: number;
  },
): Uint8ClampedArray {
  const { width, height, sourceX, sourceY, targetX, targetY } = options;
  const r = Math.max(1, options.radiusPx);
  const strength = clamp(options.strength01, 0, 1);
  const out = new Uint8ClampedArray(rgba);

  const offsetX = sourceX - targetX;
  const offsetY = sourceY - targetY;

  const minX = Math.max(0, Math.floor(targetX - r));
  const maxX = Math.min(width - 1, Math.ceil(targetX + r));
  const minY = Math.max(0, Math.floor(targetY - r));
  const maxY = Math.min(height - 1, Math.ceil(targetY + r));

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const dist = Math.hypot(px - targetX, py - targetY);
      if (dist > r) continue;
      const falloff = (1 - dist / r) * strength;
      const [sr, sg, sb, sa] = sampleBilinearRgba(
        rgba,
        width,
        height,
        px + offsetX,
        py + offsetY,
      );
      const dstIdx = (py * width + px) * 4;
      out[dstIdx] = clampByte((rgba[dstIdx] ?? 0) * (1 - falloff) + sr * falloff);
      out[dstIdx + 1] = clampByte((rgba[dstIdx + 1] ?? 0) * (1 - falloff) + sg * falloff);
      out[dstIdx + 2] = clampByte((rgba[dstIdx + 2] ?? 0) * (1 - falloff) + sb * falloff);
      out[dstIdx + 3] = clampByte((rgba[dstIdx + 3] ?? 0) * (1 - falloff) + sa * falloff);
    }
  }
  return out;
}
