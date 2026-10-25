/**
 * Clip Studio Paint 5.1.5 Filter PlugIn 호환 CPU 커널 모음.
 *
 * REA 역공학으로 식별된 CSP Filter PlugIn 번들(`FlowBasedAbstraction.bundle`,
 * `PencilArtFilter.bundle`, `Smoothing.bundle`, `SharpStrong.bundle`,
 * `Sphere.bundle`, `ZigZag.bundle`, `ChangeOfCurvedSurface.bundle`,
 * `LineWidthCorrect.bundle`, `TPPChromaticAberration.bundle`)의 결정론적 구현체다.
 */

import type { StudioFilterUnionWave } from "./studio-filter-union-wave";
import type { StudioImageDataLike } from "../studio-filters";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashUnit(x: number, y: number, seed: number): number {
  let hash = Math.imul((Math.trunc(x) | 0) ^ Math.imul(Math.trunc(y) | 0, 0x27d4eb2d), 0x85ebca6b);
  hash ^= Math.imul(Math.trunc(seed) | 0, 0xc2b2ae35);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2c1b3c6d);
  hash ^= hash >>> 12;
  return (hash >>> 0) / 4_294_967_296;
}

function luminance(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export function luminanceAt(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const safeX = clamp(Math.round(x), 0, width - 1);
  const safeY = clamp(Math.round(y), 0, height - 1);
  const offset = (safeY * width + safeX) * 4;
  return luminance(source[offset]!, source[offset + 1]!, source[offset + 2]!);
}

export function sobel(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  step = 1,
): { gx: number; gy: number } {
  const topLeft = luminanceAt(source, width, height, x - step, y - step);
  const top = luminanceAt(source, width, height, x, y - step);
  const topRight = luminanceAt(source, width, height, x + step, y - step);
  const left = luminanceAt(source, width, height, x - step, y);
  const right = luminanceAt(source, width, height, x + step, y);
  const bottomLeft = luminanceAt(source, width, height, x - step, y + step);
  const bottom = luminanceAt(source, width, height, x, y + step);
  const bottomRight = luminanceAt(source, width, height, x + step, y + step);
  return {
    gx: -topLeft + topRight - left * 2 + right * 2 - bottomLeft + bottomRight,
    gy: -topLeft - top * 2 - topRight + bottomLeft + bottom * 2 + bottomRight,
  };
}

export function computeCspInverseWarpCoordinates(params: {
  readonly effect: StudioFilterUnionWave;
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  readonly nx: number;
  readonly ny: number;
  readonly radius: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly minDimension: number;
  readonly phase: number;
  readonly strength: number;
  readonly wavelength: number;
}): { sourceX: number; sourceY: number } | null {
  const {
    effect,
    x,
    y,
    dx,
    dy,
    nx,
    ny,
    radius,
    centerX,
    centerY,
    halfWidth,
    halfHeight,
    minDimension,
    phase,
    strength,
    wavelength,
  } = params;

  switch (effect.kind) {
    case "sphere-warp": {
      const sphereRadius = Math.max(0.2, Math.min(1.5, effect.scale / 100));
      const normR = radius / sphereRadius;
      let targetX: number;
      let targetY: number;
      if (normR < 1 && normR > 0.000_001) {
        const z = Math.sqrt(Math.max(0, 1 - normR * normR));
        const refract = Math.asin(normR) / (Math.PI * 0.5);
        const targetRatio = (refract * (1 - 0.28 * z)) / normR;
        targetX = centerX + dx * targetRatio;
        targetY = centerY + dy * targetRatio;
      } else {
        const outerPull = 1 - 0.22 / Math.max(1, normR);
        targetX = centerX + dx * outerPull;
        targetY = centerY + dy * outerPull;
      }
      return {
        sourceX: x + (targetX - x) * strength,
        sourceY: y + (targetY - y) * strength,
      };
    }
    case "zigzag-warp": {
      const distance = Math.sqrt(dx * dx + dy * dy);
      const ridges = Math.max(2, Math.min(32, Math.round(effect.detail / 8) || 6));
      const waveArg = (distance / wavelength) * ridges + phase / Math.PI;
      const triangle = 1 - 4 * Math.abs(Math.round(waveArg - 0.25) - (waveArg - 0.25));
      const falloff = Math.max(0.2, 1 - Math.min(0.8, radius * 0.5));
      const radialDisp = triangle * strength * minDimension * 0.15 * falloff;
      const tangentDisp = triangle * strength * minDimension * 0.09 * falloff;
      const invDist = distance > 0.000_001 ? 1 / distance : 0;
      const ux = distance > 0.000_001 ? dx * invDist : 1;
      const uy = distance > 0.000_001 ? dy * invDist : 0;
      return {
        sourceX: x + ux * radialDisp - uy * tangentDisp,
        sourceY: y + uy * radialDisp + ux * tangentDisp,
      };
    }
    case "panorama-warp": {
      const fovScale = Math.max(0.4, Math.min(1.6, effect.scale / 100));
      const thetaX = clamp(nx * fovScale, -1.35, 1.35) * (Math.PI * 0.36);
      const cylX = Math.tan(thetaX) / Math.tan(Math.PI * 0.36);
      const cylY = (ny * (1 + Math.sin(Math.abs(thetaX)) * 0.45)) / fovScale;
      const rotCos = Math.cos(phase * 0.25);
      const rotSin = Math.sin(phase * 0.25);
      const targetX = centerX + (cylX * rotCos - cylY * rotSin) * halfWidth;
      const targetY = centerY + (cylX * rotSin + cylY * rotCos) * halfHeight;
      return {
        sourceX: x + (targetX - x) * strength,
        sourceY: y + (targetY - y) * strength,
      };
    }
    default:
      return null;
  }
}

export function applyFlowBasedAbstraction(
  image: StudioImageDataLike,
  effect: StudioFilterUnionWave,
): void {
  const { data, width, height } = image;
  const source = new Uint8ClampedArray(data.subarray(0, width * height * 4));
  const strength = Math.abs(effect.amount) / 100;
  const gradations = clamp(Math.round(effect.scale), 2, 16);
  const quantizeStep = 255 / (gradations - 1);
  const lineOpacity = clamp(effect.detail / 255, 0.15, 1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const grad = sobel(source, width, height, x, y);
      const mag = Math.sqrt(grad.gx * grad.gx + grad.gy * grad.gy);
      const invMag = mag > 0.000_1 ? 1 / mag : 0;
      const nx = mag > 0.000_1 ? grad.gx * invMag : 1;
      const ny = mag > 0.000_1 ? grad.gy * invMag : 0;
      const tx = -ny;
      const ty = nx;

      const centerLuma = luminanceAt(source, width, height, x, y);
      let sumR = source[offset]! * 1.4;
      let sumG = source[offset + 1]! * 1.4;
      let sumB = source[offset + 2]! * 1.4;
      let weightSum = 1.4;

      for (const step of [-2, -1, 1, 2]) {
        const sx = clamp(Math.round(x + tx * step), 0, width - 1);
        const sy = clamp(Math.round(y + ty * step), 0, height - 1);
        const sOffset = (sy * width + sx) * 4;
        const sampleLuma = luminance(source[sOffset]!, source[sOffset + 1]!, source[sOffset + 2]!);
        const w = Math.exp(-Math.abs(sampleLuma - centerLuma) / 48);
        sumR += source[sOffset]! * w;
        sumG += source[sOffset + 1]! * w;
        sumB += source[sOffset + 2]! * w;
        weightSum += w;
      }

      const normalLumaA = luminanceAt(source, width, height, x + nx * 1.5, y + ny * 1.5);
      const normalLumaB = luminanceAt(source, width, height, x - nx * 1.5, y - ny * 1.5);
      const dogEdge = Math.max(0, (normalLumaA + normalLumaB) * 0.5 - centerLuma);
      const edgeFactor = clamp((mag / 320 + dogEdge / 42) * lineOpacity, 0, 0.92);

      const meanR = sumR / weightSum;
      const meanG = sumG / weightSum;
      const meanB = sumB / weightSum;
      const qR = Math.round(meanR / quantizeStep) * quantizeStep;
      const qG = Math.round(meanG / quantizeStep) * quantizeStep;
      const qB = Math.round(meanB / quantizeStep) * quantizeStep;

      const targetR = clamp((qR * 0.88 + 18) * (1 - edgeFactor), 0, 255);
      const targetG = clamp((qG * 0.9 + 14) * (1 - edgeFactor), 0, 255);
      const targetB = clamp((qB * 0.92 + 10) * (1 - edgeFactor * 0.85), 0, 255);

      data[offset] = source[offset]! * (1 - strength) + targetR * strength;
      data[offset + 1] = source[offset + 1]! * (1 - strength) + targetG * strength;
      data[offset + 2] = source[offset + 2]! * (1 - strength) + targetB * strength;
    }
  }
}

export function applyPencilArt(
  image: StudioImageDataLike,
  effect: StudioFilterUnionWave,
): void {
  const { data, width, height } = image;
  const source = new Uint8ClampedArray(data.subarray(0, width * height * 4));
  const strength = Math.abs(effect.amount) / 100;
  const pitch = Math.max(1.2, clamp(effect.scale, 1, 16) * 0.55);
  const outlineGain = 0.45 + (effect.detail / 255) * 1.35;
  const theta1 = (effect.angle * Math.PI) / 180;
  const cos1 = Math.cos(theta1);
  const sin1 = Math.sin(theta1);
  const cos2 = Math.cos(theta1 + 1.134);
  const sin2 = Math.sin(theta1 + 1.134);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const luma = luminanceAt(source, width, height, x, y);
      const d0 = Math.abs(
        luminanceAt(source, width, height, x + 1, y) -
          luminanceAt(source, width, height, x - 1, y),
      );
      const d90 = Math.abs(
        luminanceAt(source, width, height, x, y + 1) -
          luminanceAt(source, width, height, x, y - 1),
      );
      const d45 = Math.abs(
        luminanceAt(source, width, height, x + 1, y + 1) -
          luminanceAt(source, width, height, x - 1, y - 1),
      );
      const d135 = Math.abs(
        luminanceAt(source, width, height, x + 1, y - 1) -
          luminanceAt(source, width, height, x - 1, y + 1),
      );
      const maxDirOutline = Math.max(d0, d90, d45, d135);
      const outlineInk = clamp((maxDirOutline * outlineGain) / 110, 0, 1);

      const grain = (hashUnit(x, y, effect.seed) - 0.5) * 0.7;
      const proj1 = (x * cos1 + y * sin1) / pitch;
      const proj2 = (x * cos2 + y * sin2) / pitch;
      const hatch1 = 0.5 + 0.5 * Math.sin(proj1 * Math.PI * 2 + grain);
      const hatch2 = 0.5 + 0.5 * Math.sin(proj2 * Math.PI * 2 - grain);
      const darkness = 1 - luma / 255;
      const primaryStroke = darkness > 0.12 ? (1 - hatch1) * darkness * 0.75 : 0;
      const crossStroke = darkness > 0.38 ? (1 - hatch2) * (darkness - 0.25) * 0.65 : 0;
      const pencilShade = clamp(outlineInk * 0.82 + primaryStroke + crossStroke, 0, 0.94);

      const paperR = 245 - pencilShade * 212;
      const paperG = 242 - pencilShade * 208;
      const paperB = 235 - pencilShade * 198;

      data[offset] = source[offset]! * (1 - strength) + paperR * strength;
      data[offset + 1] = source[offset + 1]! * (1 - strength) + paperG * strength;
      data[offset + 2] = source[offset + 2]! * (1 - strength) + paperB * strength;
    }
  }
}

export function applySmoothing(
  image: StudioImageDataLike,
  effect: StudioFilterUnionWave,
): void {
  const { data, width, height } = image;
  const source = new Uint8ClampedArray(data.subarray(0, width * height * 4));
  const strength = Math.abs(effect.amount) / 100;
  const step = clamp(Math.round(effect.scale), 1, 4);
  const threshold = 16 + (effect.detail / 255) * 180;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const nOff = (clamp(y - step, 0, height - 1) * width + x) * 4;
      const sOff = (clamp(y + step, 0, height - 1) * width + x) * 4;
      const wOff = (y * width + clamp(x - step, 0, width - 1)) * 4;
      const eOff = (y * width + clamp(x + step, 0, width - 1)) * 4;
      const nwOff = (clamp(y - step, 0, height - 1) * width + clamp(x - step, 0, width - 1)) * 4;
      const neOff = (clamp(y - step, 0, height - 1) * width + clamp(x + step, 0, width - 1)) * 4;
      const swOff = (clamp(y + step, 0, height - 1) * width + clamp(x - step, 0, width - 1)) * 4;
      const seOff = (clamp(y + step, 0, height - 1) * width + clamp(x + step, 0, width - 1)) * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        const c = source[offset + channel]!;
        const n = source[nOff + channel]!;
        const s = source[sOff + channel]!;
        const w = source[wOff + channel]!;
        const e = source[eOff + channel]!;
        const nw = source[nwOff + channel]!;
        const ne = source[neOff + channel]!;
        const sw = source[swOff + channel]!;
        const se = source[seOff + channel]!;

        const cornerNE = Math.abs(n - e) < threshold ? (n + e + ne) / 3 : c;
        const cornerSW = Math.abs(s - w) < threshold ? (s + w + sw) / 3 : c;
        const cornerNW = Math.abs(n - w) < threshold ? (n + w + nw) / 3 : c;
        const cornerSE = Math.abs(s - e) < threshold ? (s + e + se) / 3 : c;
        const ringAvg = (n + s + w + e + (nw + ne + sw + se) * 0.5) / 6;
        const target = (cornerNE + cornerSW + cornerNW + cornerSE) * 0.16 + ringAvg * 0.36;
        data[offset + channel] = c * (1 - strength) + target * strength;
      }
    }
  }
}

export function applySharpStrong(
  image: StudioImageDataLike,
  effect: StudioFilterUnionWave,
): void {
  const { data, width, height } = image;
  const source = new Uint8ClampedArray(data.subarray(0, width * height * 4));
  const strength = Math.abs(effect.amount) / 100;
  const step = clamp(Math.round(effect.scale), 1, 4);
  const diagWeight = 0.45 + (effect.detail / 255) * 0.85;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const nOff = (clamp(y - step, 0, height - 1) * width + x) * 4;
      const sOff = (clamp(y + step, 0, height - 1) * width + x) * 4;
      const wOff = (y * width + clamp(x - step, 0, width - 1)) * 4;
      const eOff = (y * width + clamp(x + step, 0, width - 1)) * 4;
      const nwOff = (clamp(y - step, 0, height - 1) * width + clamp(x - step, 0, width - 1)) * 4;
      const neOff = (clamp(y - step, 0, height - 1) * width + clamp(x + step, 0, width - 1)) * 4;
      const swOff = (clamp(y + step, 0, height - 1) * width + clamp(x - step, 0, width - 1)) * 4;
      const seOff = (clamp(y + step, 0, height - 1) * width + clamp(x + step, 0, width - 1)) * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        const c = source[offset + channel]!;
        const ortho =
          source[nOff + channel]! +
          source[sOff + channel]! +
          source[wOff + channel]! +
          source[eOff + channel]!;
        const diag =
          source[nwOff + channel]! +
          source[neOff + channel]! +
          source[swOff + channel]! +
          source[seOff + channel]!;
        const neighborMean = (ortho + diag * diagWeight) / (4 + 4 * diagWeight);
        const detailBoost = (c - neighborMean) * 2.35 + (c - 128) * 0.18;
        const target = clamp(c + detailBoost, 0, 255);
        data[offset + channel] = c * (1 - strength) + target * strength;
      }
    }
  }
}

export function applyLineWidthCorrect(
  image: StudioImageDataLike,
  effect: StudioFilterUnionWave,
): void {
  const { data, width, height } = image;
  const source = new Uint8ClampedArray(data.subarray(0, width * height * 4));
  const strength = Math.abs(effect.amount) / 100;
  const radius = clamp(Math.round(effect.scale), 1, 5);
  const thinMode = effect.detail >= 128;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      let minLuma = 256;
      let maxLuma = -1;
      let minR = source[offset]!;
      let minG = source[offset + 1]!;
      let minB = source[offset + 2]!;
      let maxR = minR;
      let maxG = minG;
      let maxB = minB;

      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const sx = clamp(x + dx, 0, width - 1);
          const sy = clamp(y + dy, 0, height - 1);
          const sOff = (sy * width + sx) * 4;
          const r = source[sOff]!;
          const g = source[sOff + 1]!;
          const b = source[sOff + 2]!;
          const l = luminance(r, g, b);
          if (l < minLuma) {
            minLuma = l;
            minR = r;
            minG = g;
            minB = b;
          }
          if (l > maxLuma) {
            maxLuma = l;
            maxR = r;
            maxG = g;
            maxB = b;
          }
        }
      }

      const targetR = thinMode ? clamp(maxR * 0.85 + 32, 0, 255) : clamp(minR * 0.78, 0, 255);
      const targetG = thinMode ? clamp(maxG * 0.85 + 32, 0, 255) : clamp(minG * 0.78, 0, 255);
      const targetB = thinMode ? clamp(maxB * 0.85 + 32, 0, 255) : clamp(minB * 0.78, 0, 255);

      data[offset] = source[offset]! * (1 - strength) + targetR * strength;
      data[offset + 1] = source[offset + 1]! * (1 - strength) + targetG * strength;
      data[offset + 2] = source[offset + 2]! * (1 - strength) + targetB * strength;
    }
  }
}

export function applyFilmCameraStyle(
  image: StudioImageDataLike,
  effect: StudioFilterUnionWave,
): void {
  const { data, width, height } = image;
  const source = new Uint8ClampedArray(data.subarray(0, width * height * 4));
  const strength = Math.abs(effect.amount) / 100;
  const warmth = clamp(effect.scale / 100, 0.1, 1.5);
  const fade = clamp(effect.detail / 255, 0.1, 1);
  const halfW = Math.max(1, width / 2);
  const halfH = Math.max(1, height / 2);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const r = source[offset]!;
      const g = source[offset + 1]!;
      const b = source[offset + 2]!;
      const luma = luminance(r, g, b) / 255;
      const shadow = (1 - luma) * (1 - luma);
      const highlight = luma * luma;
      const nx = (x - halfW) / halfW;
      const ny = (y - halfH) / halfH;
      const vig = Math.max(0.55, 1 - (nx * nx + ny * ny) * 0.24 * fade);
      const grain = (hashUnit(x, y, effect.seed) - 0.5) * 26;

      const filmR = clamp((r * 0.9 + 22 * fade + 28 * warmth * highlight - 6 * shadow) * vig + grain, 0, 255);
      const filmG = clamp((g * 0.88 + 18 * fade + 10 * warmth * highlight + 8 * shadow) * vig + grain * 0.92, 0, 255);
      const filmB = clamp((b * 0.82 + 26 * fade + 24 * shadow - 20 * warmth * highlight) * vig + grain * 0.85, 0, 255);

      data[offset] = r * (1 - strength) + filmR * strength;
      data[offset + 1] = g * (1 - strength) + filmG * strength;
      data[offset + 2] = b * (1 - strength) + filmB * strength;
    }
  }
}
