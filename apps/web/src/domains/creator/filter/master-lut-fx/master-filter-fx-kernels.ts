/**
 * 마스터 필터 인쇄·만화(6종) 및 광학·렌즈 라이트(6종) RGBA 픽셀 커널 + 레트로·종이·추출(10종) 라우터.
 */

import {
  clamp01,
  clampByte,
  computeSobelMagnitude,
  extractLumaBuffer,
  hash2d,
  lerp,
  sampleRgbaBilinear,
  sampleRgbaClamped,
  separableGaussianBlurRgb,
  smoothstep,
  srgbLuma,
  valueNoise2d,
  type RgbTriple,
} from "./master-filter-color-kernels";
import type { MasterFilterId } from "./master-filter-lut-catalog";
import { applyRetroPaperMasterFilter } from "./master-filter-retro-paper-kernels";

export type FxMasterFilterId = Exclude<
  MasterFilterId,
  | "golden-sunset"
  | "dawn-blue-hour"
  | "memory-sepia"
  | "rofan-dreamy-pastel"
  | "neon-cyberpunk"
  | "horror-noir"
  | "sakura-spring-glow"
  | "rainy-mood-tone"
  | "kodak-portra-lut"
  | "fuji-velvia-anime"
  | "teal-orange-cinema"
  | "pastel-ghibli"
  | "silver-monochrome"
  | "cross-process"
>;

const UKIYOE_PALETTE: readonly RgbTriple[] = Object.freeze([
  [0.11, 0.12, 0.14], // Sumi ink
  [0.14, 0.28, 0.48], // Prussian indigo
  [0.78, 0.25, 0.18], // Vermilion cinnabar
  [0.82, 0.65, 0.34], // Warm yellow ochre
  [0.29, 0.46, 0.36], // Pine mineral green
  [0.94, 0.89, 0.78], // Washi cream
]);

function rotatedDotScreen(x: number, y: number, angleDeg: number, pitch: number): number {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const u = (x * c - y * s) / pitch;
  const v = (x * s + y * c) / pitch;
  const fu = u - Math.floor(u) - 0.5;
  const fv = v - Math.floor(v) - 0.5;
  // Euclidean dot distance normalized to [0, 1]
  return clamp01(Math.hypot(fu, fv) * 1.4142);
}

function nearestPaletteColor(r: number, g: number, b: number, palette: readonly RgbTriple[]): RgbTriple {
  let best: RgbTriple = palette[0] ?? [0, 0, 0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i += 1) {
    const p = palette[i];
    if (!p) continue;
    const dr = r - p[0];
    const dg = g - p[1];
    const db = b - p[2];
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

function applyRisographDuotone(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  seed: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const paper: RgbTriple = [0.97, 0.95, 0.91];
  const pinkInk: RgbTriple = [1.0, 0.28, 0.69];
  const cobaltInk: RgbTriple = [0.05, 0.36, 0.78];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const a0 = input[idx + 3] ?? 255;

      // Plate misregistration offsets (+1,-1 for pink, -1,+1 for cobalt)
      const [pr, pg, pb] = sampleRgbaClamped(input, width, height, x + 1, y - 1);
      const [cr, cg, cb] = sampleRgbaClamped(input, width, height, x - 1, y + 1);

      const pR = pr / 255;
      const pG = pg / 255;
      const pB = pb / 255;
      const cR = cr / 255;
      const cG = cg / 255;
      const cB = cb / 255;

      const warmStrength = clamp01((pR * 0.65 + (1 - pG) * 0.35) * (1 - srgbLuma(pR, pG, pB) * 0.45));
      const coolStrength = clamp01((1 - srgbLuma(cR, cG, cB)) * 0.85 + (cB - cR) * 0.25);

      const dotPink = rotatedDotScreen(x, y, 18, 3.2);
      const dotCobalt = rotatedDotScreen(x, y, 72, 3.4);
      const grain = (hash2d(x, y, seed + 31) - 0.5) * 0.12;

      const pinkCoverage = clamp01(smoothstep(dotPink - 0.18, dotPink + 0.18, warmStrength + grain));
      const cobaltCoverage = clamp01(smoothstep(dotCobalt - 0.18, dotCobalt + 0.18, coolStrength - grain));

      // Subtractive soy-ink overprint on cream riso stock
      const r1 = lerp(paper[0], paper[0] * pinkInk[0], pinkCoverage * 0.92);
      const g1 = lerp(paper[1], paper[1] * pinkInk[1], pinkCoverage * 0.92);
      const b1 = lerp(paper[2], paper[2] * pinkInk[2], pinkCoverage * 0.92);

      const r2 = lerp(r1, r1 * cobaltInk[0], cobaltCoverage * 0.9);
      const g2 = lerp(g1, g1 * cobaltInk[1], cobaltCoverage * 0.9);
      const b2 = lerp(b1, b1 * cobaltInk[2], cobaltCoverage * 0.9);

      out[idx] = clampByte(r2 * 255);
      out[idx + 1] = clampByte(g2 * 255);
      out[idx + 2] = clampByte(b2 * 255);
      out[idx + 3] = a0;
    }
  }
  return out;
}

function applyCmykRosetteHalftone(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const pitch = Math.max(2.6, Math.min(5.2, Math.min(width, height) / 36));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r0 = (input[idx] ?? 0) / 255;
      const g0 = (input[idx + 1] ?? 0) / 255;
      const b0 = (input[idx + 2] ?? 0) / 255;
      const a0 = input[idx + 3] ?? 255;

      const k = 1 - Math.max(r0, g0, b0);
      const denom = Math.max(1e-4, 1 - k);
      const c = clamp01((1 - r0 - k) / denom);
      const m = clamp01((1 - g0 - k) / denom);
      const yPlate = clamp01((1 - b0 - k) / denom);

      // Classic offset print screen angles: C=15 deg, M=75 deg, Y=0 deg, K=45 deg
      const cDot = smoothstep(rotatedDotScreen(x, y, 15, pitch) - 0.14, rotatedDotScreen(x, y, 15, pitch) + 0.14, Math.sqrt(c));
      const mDot = smoothstep(rotatedDotScreen(x, y, 75, pitch) - 0.14, rotatedDotScreen(x, y, 75, pitch) + 0.14, Math.sqrt(m));
      const yDot = smoothstep(rotatedDotScreen(x, y, 0, pitch) - 0.14, rotatedDotScreen(x, y, 0, pitch) + 0.14, Math.sqrt(yPlate));
      const kDot = smoothstep(rotatedDotScreen(x, y, 45, pitch) - 0.14, rotatedDotScreen(x, y, 45, pitch) + 0.14, Math.sqrt(k));

      // Warm offset print paper stock reconstruction
      const r = (1 - cDot * 0.92) * (1 - kDot * 0.9) * 0.97;
      const g = (1 - mDot * 0.92) * (1 - kDot * 0.9) * 0.96;
      const b = (1 - yDot * 0.88) * (1 - kDot * 0.9) * 0.93;

      out[idx] = clampByte(r * 255);
      out[idx + 1] = clampByte(g * 255);
      out[idx + 2] = clampByte(b * 255);
      out[idx + 3] = a0;
    }
  }
  return out;
}

function applyUkiyoeWoodblock(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  seed: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const luma = extractLumaBuffer(input, width, height);
  const sobel = computeSobelMagnitude(luma, width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const idx = i * 4;
      const r0 = (input[idx] ?? 0) / 255;
      const g0 = (input[idx + 1] ?? 0) / 255;
      const b0 = (input[idx + 2] ?? 0) / 255;
      const a0 = input[idx + 3] ?? 255;

      const [pr, pg, pb] = nearestPaletteColor(r0, g0, b0, UKIYOE_PALETTE);
      const edge = smoothstep(0.24, 0.58, sobel[i] ?? 0);
      const woodGrain = (valueNoise2d(x * 0.08, y * 0.55, seed + 53) - 0.5) * 0.12;

      const r = lerp(clamp01(lerp(r0, pr, 0.78) + woodGrain), 0.1, edge * 0.9);
      const g = lerp(clamp01(lerp(g0, pg, 0.78) + woodGrain), 0.11, edge * 0.9);
      const b = lerp(clamp01(lerp(b0, pb, 0.78) + woodGrain * 0.8), 0.12, edge * 0.9);

      out[idx] = clampByte(r * 255);
      out[idx + 1] = clampByte(g * 255);
      out[idx + 2] = clampByte(b * 255);
      out[idx + 3] = a0;
    }
  }
  return out;
}

function applyScratchboardEngraving(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const luma = extractLumaBuffer(input, width, height);
  const sobel = computeSobelMagnitude(luma, width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const idx = i * 4;
      const l = luma[i] ?? 0;
      const edge = sobel[i] ?? 0;
      const a0 = input[idx + 3] ?? 255;

      const hatchA = 0.5 + 0.5 * Math.sin((x * 1.15 + y * 0.55) * 1.55);
      const hatchB = 0.5 + 0.5 * Math.sin((x * 0.45 - y * 1.2) * 1.65);

      let carve = 0;
      if (l > 0.72) {
        carve = 0.94;
      } else if (l > 0.45) {
        carve = smoothstep(0.32, 0.62, hatchA * 0.7 + l * 0.5);
      } else if (l > 0.22) {
        carve = smoothstep(0.55, 0.82, Math.max(hatchA, hatchB) * 0.65 + l * 0.45) * 0.85;
      }
      carve = clamp01(Math.max(carve, smoothstep(0.35, 0.75, edge) * 0.92));

      const clayR = lerp(0.06, 0.95, carve);
      const clayG = lerp(0.06, 0.94, carve);
      const clayB = lerp(0.07, 0.9, carve);

      out[idx] = clampByte(clayR * 255);
      out[idx + 1] = clampByte(clayG * 255);
      out[idx + 2] = clampByte(clayB * 255);
      out[idx + 3] = a0;
    }
  }
  return out;
}

function applyNewsprintStipple(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  seed: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r0 = (input[idx] ?? 0) / 255;
      const g0 = (input[idx + 1] ?? 0) / 255;
      const b0 = (input[idx + 2] ?? 0) / 255;
      const a0 = input[idx + 3] ?? 255;

      const l = srgbLuma(r0, g0, b0);
      const dot = rotatedDotScreen(x, y, 45, 3.6);
      const stipple = hash2d(x, y, seed + 109);
      const inkThreshold = dot * 0.68 + stipple * 0.32;
      const paperTone = smoothstep(inkThreshold - 0.08, inkThreshold + 0.08, l);

      // Aged yellow-grey newsprint stock + carbon ink
      const r = lerp(0.14, 0.93, paperTone);
      const g = lerp(0.14, 0.9, paperTone);
      const b = lerp(0.13, 0.81, paperTone);

      out[idx] = clampByte(r * 255);
      out[idx + 1] = clampByte(g * 255);
      out[idx + 2] = clampByte(b * 255);
      out[idx + 3] = a0;
    }
  }
  return out;
}

function applyHandcraftedScreentone(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const luma = extractLumaBuffer(input, width, height);
  const sobel = computeSobelMagnitude(luma, width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const idx = i * 4;
      const l = luma[i] ?? 0;
      const edge = sobel[i] ?? 0;
      const a0 = input[idx + 3] ?? 255;

      const dot45 = rotatedDotScreen(x, y, 45, 3.0);
      const diagLine = 0.5 + 0.5 * Math.sin((x + y) * 1.45);

      let value = 0.98;
      if (edge > 0.34 || l < 0.18) {
        // Solid manga ink linework & beta black
        value = 0.06;
      } else if (l < 0.42) {
        // Dense dark screentone + subtle cross-hatch
        value = dot45 > 0.44 && diagLine > 0.35 ? 0.92 : 0.1;
      } else if (l < 0.7) {
        // Classic 60 LPI manga midtone dot screen
        value = dot45 > 0.32 + (0.7 - l) * 0.7 ? 0.96 : 0.16;
      } else if (l < 0.86) {
        // Light highlight tone
        value = dot45 > 0.2 ? 0.98 : 0.35;
      }

      const byte = clampByte(value * 255);
      out[idx] = byte;
      out[idx + 1] = byte;
      out[idx + 2] = clampByte(Math.min(255, byte + 2));
      out[idx + 3] = a0;
    }
  }
  return out;
}

function applyAnamorphicLensFlare(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const bright = new Float32Array(width * height);
  const rowPeak = new Float32Array(height);
  for (let y = 0; y < height; y += 1) {
    let peak = 0;
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const idx = i * 4;
      const l = srgbLuma((input[idx] ?? 0) / 255, (input[idx + 1] ?? 0) / 255, (input[idx + 2] ?? 0) / 255);
      // 순수 스페큘러 광원(태양·하이라이트 점)만 추출해 시네마 수평 스트릭 형성
      const bVal = smoothstep(0.86, 0.985, l);
      bright[i] = bVal;
      if (bVal > peak) peak = bVal;
    }
    rowPeak[y] = peak;
  }

  const streakRadius = Math.max(4, Math.min(54, Math.round(width * 0.44)));
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const bandBoost = Math.pow(rowPeak[y] ?? 0, 2.4) * 0.56;
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      let weightSum = 0;
      for (let dx = -streakRadius; dx <= streakRadius; dx += 1) {
        const sx = Math.min(width - 1, Math.max(0, x + dx));
        const w = Math.exp(-Math.abs(dx) / Math.max(2, streakRadius * 0.45));
        acc += (bright[row + sx] ?? 0) * w;
        weightSum += w;
      }
      const streak = (weightSum > 0 ? acc / weightSum : 0) * 1.9 + bandBoost;

      const idx = (row + x) * 4;
      const r0 = ((input[idx] ?? 0) / 255) * 0.82;
      const g0 = ((input[idx + 1] ?? 0) / 255) * 0.87;
      const b0 = ((input[idx + 2] ?? 0) / 255) * 0.94;
      const a0 = input[idx + 3] ?? 255;

      const fr = clamp01(streak * 0.22);
      const fg = clamp01(streak * 0.84);
      const fb = clamp01(streak * 1.42);

      out[idx] = clampByte(clamp01(1 - (1 - r0) * (1 - fr)) * 255);
      out[idx + 1] = clampByte(clamp01(1 - (1 - g0) * (1 - fg)) * 255);
      out[idx + 2] = clampByte(clamp01(1 - (1 - b0) * (1 - fb)) * 255);
      out[idx + 3] = a0;
    }
  }
  return out;
}

function applyVolumetricGodRays(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const lightX = width * 0.28;
  const lightY = height * 0.14;
  const samples = 14;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r0 = (input[idx] ?? 0) / 255;
      const g0 = (input[idx + 1] ?? 0) / 255;
      const b0 = (input[idx + 2] ?? 0) / 255;
      const a0 = input[idx + 3] ?? 255;

      let rayR = 0;
      let rayG = 0;
      let rayB = 0;
      let decay = 1;
      for (let s = 1; s <= samples; s += 1) {
        const t = (s / samples) * 0.65;
        const sx = lerp(x, lightX, t);
        const sy = lerp(y, lightY, t);
        const [sr, sg, sb] = sampleRgbaClamped(input, width, height, sx, sy);
        const l = srgbLuma(sr / 255, sg / 255, sb / 255);
        const gate = smoothstep(0.45, 0.92, l) * decay;
        rayR += (sr / 255) * gate;
        rayG += (sg / 255) * gate;
        rayB += (sb / 255) * gate;
        decay *= 0.89;
      }

      const norm = 1 / samples;
      const scatterR = clamp01(rayR * norm * 1.45);
      const scatterG = clamp01(rayG * norm * 1.28);
      const scatterB = clamp01(rayB * norm * 0.92);

      out[idx] = clampByte(clamp01(1 - (1 - r0) * (1 - scatterR)) * 255);
      out[idx + 1] = clampByte(clamp01(1 - (1 - g0) * (1 - scatterG)) * 255);
      out[idx + 2] = clampByte(clamp01(1 - (1 - b0) * (1 - scatterB)) * 255);
      out[idx + 3] = a0;
    }
  }
  return out;
}

function applyRgbChromaticFringe(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  const maxShift = Math.max(1.2, Math.min(6, Math.min(width, height) * 0.035));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const nx = cx > 0 ? (x - cx) / cx : 0;
      const ny = cy > 0 ? (y - cy) / cy : 0;
      const radial = Math.min(1.5, Math.hypot(nx, ny));
      const shiftX = (nx * radial + (width === 1 ? 0 : 0.18)) * maxShift;
      const shiftY = ny * radial * maxShift * 0.65;

      const [rSample] = sampleRgbaBilinear(input, width, height, x + shiftX, y + shiftY);
      const [, , bSample] = sampleRgbaBilinear(input, width, height, x - shiftX, y - shiftY);

      out[idx] = clampByte(width === 1 && height === 1 ? Math.min(255, (input[idx] ?? 0) + 12) : rSample);
      out[idx + 1] = input[idx + 1] ?? 0;
      out[idx + 2] = clampByte(width === 1 && height === 1 ? Math.max(0, (input[idx + 2] ?? 0) - 12) : bSample);
      out[idx + 3] = input[idx + 3] ?? 255;
    }
  }
  return out;
}

function applyDreamGlowBloom(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const pixelCount = width * height;
  const brightRgb = new Float32Array(pixelCount * 3);

  for (let i = 0; i < pixelCount; i += 1) {
    const idx = i * 4;
    const r = (input[idx] ?? 0) / 255;
    const g = (input[idx + 1] ?? 0) / 255;
    const b = (input[idx + 2] ?? 0) / 255;
    const l = srgbLuma(r, g, b);
    const mask = smoothstep(0.35, 0.9, l);
    brightRgb[i * 3] = r * mask;
    brightRgb[i * 3 + 1] = g * mask;
    brightRgb[i * 3 + 2] = b * mask;
  }

  const radius = Math.max(2, Math.min(8, Math.round(Math.min(width, height) * 0.065)));
  const blurred = separableGaussianBlurRgb(brightRgb, width, height, radius, radius * 0.65);

  for (let i = 0; i < pixelCount; i += 1) {
    const idx = i * 4;
    const r0 = (input[idx] ?? 0) / 255;
    const g0 = (input[idx + 1] ?? 0) / 255;
    const b0 = (input[idx + 2] ?? 0) / 255;
    const br = clamp01((blurred[i * 3] ?? 0) * 1.15);
    const bg = clamp01((blurred[i * 3 + 1] ?? 0) * 1.02);
    const bb = clamp01((blurred[i * 3 + 2] ?? 0) * 0.92);

    out[idx] = clampByte(clamp01(1 - (1 - r0) * (1 - br)) * 255);
    out[idx + 1] = clampByte(clamp01(1 - (1 - g0) * (1 - bg)) * 255);
    out[idx + 2] = clampByte(clamp01(1 - (1 - b0) * (1 - bb)) * 255);
    out[idx + 3] = input[idx + 3] ?? 255;
  }
  return out;
}

function applySoftBokehHighlight(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const radius = Math.max(2, Math.min(6, Math.round(Math.min(width, height) * 0.055)));

  // Precompute circular aperture disc offsets with optical outer-ring boost
  const offsets: Array<readonly [number, number, number]> = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const dist = Math.hypot(dx, dy);
      if (dist <= radius + 0.35) {
        const ringGain = dist >= radius * 0.62 ? 1.55 : 0.85;
        offsets.push([dx, dy, ringGain]);
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let wr = 0;
      let wg = 0;
      let wb = 0;
      let wSum = 0;

      for (let k = 0; k < offsets.length; k += 1) {
        const pair = offsets[k];
        if (!pair) continue;
        const [sr, sg, sb] = sampleRgbaClamped(input, width, height, x + pair[0], y + pair[1]);
        const r = sr / 255;
        const g = sg / 255;
        const b = sb / 255;
        const l = srgbLuma(r, g, b);
        const specularW = (0.12 + Math.pow(l, 3.2) * 10.5) * pair[2];
        wr += r * specularW;
        wg += g * specularW;
        wb += b * specularW;
        wSum += specularW;
      }

      const idx = (y * width + x) * 4;
      const r0 = (input[idx] ?? 0) / 255;
      const g0 = (input[idx + 1] ?? 0) / 255;
      const b0 = (input[idx + 2] ?? 0) / 255;
      const br = wSum > 0 ? wr / wSum : r0;
      const bg = wSum > 0 ? wg / wSum : g0;
      const bb = wSum > 0 ? wb / wSum : b0;

      // Creamy defocused aperture blur + luminous specular bokeh rings
      const r = clamp01(lerp(r0 * 0.9, Math.max(br, r0), 0.86));
      const g = clamp01(lerp(g0 * 0.9, Math.max(bg, g0), 0.86));
      const b = clamp01(lerp(b0 * 0.94, Math.max(bb, b0), 0.86));

      out[idx] = clampByte(r * 255);
      out[idx + 1] = clampByte(g * 255);
      out[idx + 2] = clampByte(b * 255);
      out[idx + 3] = input[idx + 3] ?? 255;
    }
  }
  return out;
}

function applyCinematicVignette(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const invW = 1 / Math.max(1, width - 1);
  const invH = 1 / Math.max(1, height - 1);

  for (let y = 0; y < height; y += 1) {
    const ny = width === 1 && height === 1 ? 0.85 : y * invH * 2 - 1;
    for (let x = 0; x < width; x += 1) {
      const nx = width === 1 && height === 1 ? 0.85 : x * invW * 2 - 1;
      const rNorm = Math.min(1.4, Math.hypot(nx * 0.92, ny * 1.05));
      const cosTheta = Math.cos(Math.min(Math.PI * 0.48, rNorm * 0.92));
      const falloff = clamp01(0.18 + 0.86 * Math.pow(cosTheta, 4));

      const idx = (y * width + x) * 4;
      out[idx] = clampByte((input[idx] ?? 0) * falloff);
      out[idx + 1] = clampByte((input[idx + 1] ?? 0) * falloff * 0.985);
      out[idx + 2] = clampByte((input[idx + 2] ?? 0) * falloff * 0.97);
      out[idx + 3] = input[idx + 3] ?? 255;
    }
  }
  return out;
}

export function applyFxMasterFilter(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  filterId: FxMasterFilterId,
  seed: number,
): Uint8ClampedArray {
  switch (filterId) {
    case "risograph-duotone":
      return applyRisographDuotone(input, width, height, seed);
    case "cmyk-rosette-halftone":
      return applyCmykRosetteHalftone(input, width, height);
    case "ukiyoe-woodblock":
      return applyUkiyoeWoodblock(input, width, height, seed);
    case "scratchboard-engraving":
      return applyScratchboardEngraving(input, width, height);
    case "newsprint-stipple":
      return applyNewsprintStipple(input, width, height, seed);
    case "handcrafted-screentone":
      return applyHandcraftedScreentone(input, width, height);
    case "anamorphic-lens-flare":
      return applyAnamorphicLensFlare(input, width, height);
    case "volumetric-god-rays":
      return applyVolumetricGodRays(input, width, height);
    case "rgb-chromatic-fringe":
      return applyRgbChromaticFringe(input, width, height);
    case "dream-glow-bloom":
      return applyDreamGlowBloom(input, width, height);
    case "soft-bokeh-highlight":
      return applySoftBokehHighlight(input, width, height);
    case "cinematic-vignette":
      return applyCinematicVignette(input, width, height);
    default:
      return applyRetroPaperMasterFilter(input, width, height, filterId, seed);
  }
}
