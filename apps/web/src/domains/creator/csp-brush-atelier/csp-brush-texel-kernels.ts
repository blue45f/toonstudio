/**
 * 9대 카테고리 × 24 물리 텍스처 커널 및 6종 종이·바탕 높이장 평가기.
 * `csp-procedural-texture-synthesizer.ts`에서 호출되어 픽셀 단위 알파·부조·명암·혼색을 계산한다.
 */

import {
  studioOssDirectionalWaxSample,
  studioOssEqualAreaDiskOffset,
  studioOssFabricCrayonGrainAdhesion,
  studioOssKlecksChalkCoverage,
  studioOssUnitHash,
  studioOssValueNoise2d,
} from "../studio-oss-brush-kernels";
import type { CspPaperGrainId, CspProBrushSpec } from "./csp-all-categories-brush-catalog";

export interface CspTexelEval {
  readonly alpha: number;
  readonly height: number;
  readonly shadeDelta: number;
  readonly mixRatio: number;
  readonly paperHeight: number;
  readonly isScatter: boolean;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const span = edge1 - edge0;
  if (Math.abs(span) < 1e-6) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / span);
  return t * t * (3 - 2 * t);
}

/** 6종 종이·바탕 높이장(0=깊은 골, 1=높은 산) 결정론적 샘플링. */
export function samplePaperSubstrateHeight(
  grain: CspPaperGrainId,
  wx: number,
  wy: number,
  seed: number,
): number {
  if (grain === "none") return 1;
  if (grain === "smooth-kent") {
    return 0.88 + studioOssValueNoise2d(wx * 2.4, wy * 2.4, seed ^ 0x101) * 0.12;
  }
  if (grain === "cold-press-rough") {
    const raw =
      studioOssValueNoise2d(wx * 0.42, wy * 0.42, seed ^ 0x211) * 0.56
      + studioOssValueNoise2d(wx * 1.15, wy * 1.15, seed ^ 0x317) * 0.29
      + studioOssValueNoise2d(wx * 2.6, wy * 2.6, seed ^ 0x423) * 0.15;
    return clamp01(smoothstep(0.16, 0.84, raw));
  }
  if (grain === "cold-press-medium") {
    const raw =
      studioOssValueNoise2d(wx * 0.62, wy * 0.62, seed ^ 0x529) * 0.62
      + studioOssValueNoise2d(wx * 1.65, wy * 1.65, seed ^ 0x635) * 0.38;
    return clamp01(smoothstep(0.22, 0.82, raw));
  }
  if (grain === "hanji-fiber") {
    const raw =
      studioOssValueNoise2d(wx * 0.26, wy * 2.95, seed ^ 0x741) * 0.52
      + studioOssValueNoise2d(wx * 2.45, wy * 0.34, seed ^ 0x84d) * 0.28
      + studioOssValueNoise2d(wx * 1.3, wy * 1.3, seed ^ 0x959) * 0.2;
    return clamp01(smoothstep(0.18, 0.86, raw));
  }
  const warp = 0.5 + 0.5 * Math.sin(wx * 1.25);
  const weft = 0.5 + 0.5 * Math.sin(wy * 1.25);
  const thread = studioOssValueNoise2d(wx * 0.85, wy * 0.85, seed ^ 0xa65);
  return clamp01((warp * 0.44 + weft * 0.44 + thread * 0.12) * 0.92 + 0.08);
}

function evaluateDecorationTexel(
  brush: CspProBrushSpec,
  along: number,
  across: number,
  r: number,
  pressure01: number,
  seed: number,
): CspTexelEval {
  if (brush.textureKernel === "decor-lace") {
    const period = Math.abs(Math.sin((along + 1) * Math.PI * 2.25));
    const scallopEdge = 0.24 + period * 0.46;
    const bandTop = -0.34;
    if (across < bandTop || across > scallopEdge || Math.abs(along) > 0.96) {
      return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: 1, isScatter: false };
    }
    const stitchLine = Math.exp(-((across - (bandTop + 0.12)) ** 2) / 0.0022);
    const hemTrim = Math.exp(-((across - scallopEdge) ** 2) / 0.0032);
    const cellCenter = ((along + 1) * 2.25) % 1 - 0.5;
    const eyeletCutout = smoothstep(0.08, 0.16, Math.hypot(cellCenter * 0.72, (across - 0.24) * 1.35));
    const gatherPleat = 0.5 + 0.5 * Math.sin(along * 26 + across * 4);
    const alpha = clamp01(((0.48 + gatherPleat * 0.26) * eyeletCutout + stitchLine * 0.5 + hemTrim * 0.58) * (0.72 + pressure01 * 0.28));
    return {
      alpha,
      height: alpha * 0.52,
      shadeDelta: hemTrim * 0.24 + (gatherPleat - 0.5) * 0.22 - (1 - eyeletCutout) * 0.18,
      mixRatio: 0.18,
      paperHeight: 1,
      isScatter: hemTrim > 0.3,
    };
  }

  if (brush.textureKernel === "decor-petals") {
    let maxAlpha = 0;
    let bestShade = 0;
    let scatterHit = false;
    for (let i = 0; i < 7; i += 1) {
      const offset = studioOssEqualAreaDiskOffset(seed ^ 0x511, i, 0.74, i * 19);
      const rot = studioOssUnitHash(seed, i, 0x91) * Math.PI * 2;
      const scale = 0.18 + studioOssUnitHash(seed, i, 0xa3) * 0.18;
      const dx = along - offset.x;
      const dy = across - offset.y;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const u = (dx * cosR + dy * sinR) / scale;
      const v = (-dx * sinR + dy * cosR) / (scale * 0.66);
      const notch = u > 0.25 ? Math.exp(-((v * v) / 0.09)) * 0.36 * u : 0;
      const dist = Math.hypot(u, v) + notch;
      if (dist < 1) {
        const a = smoothstep(1, 0.68, dist) * (0.74 + pressure01 * 0.24);
        if (a > maxAlpha) {
          maxAlpha = a;
          bestShade = (0.35 - u * 0.35) * 0.32;
          scatterHit = offset.distance > 0.36;
        }
      }
    }
    return {
      alpha: clamp01(maxAlpha), height: maxAlpha * 0.28, shadeDelta: bestShade,
      mixRatio: 0.26, paperHeight: 1, isScatter: scatterHit && maxAlpha > 0.12,
    };
  }

  if (brush.textureKernel === "decor-sparkle") {
    let intensity = 0;
    let scatterHit = false;
    const stars = [
      { cx: 0, cy: 0, s: 0.88 }, { cx: -0.52, cy: -0.34, s: 0.38 }, { cx: 0.56, cy: -0.28, s: 0.42 },
      { cx: 0.36, cy: 0.52, s: 0.34 }, { cx: -0.44, cy: 0.48, s: 0.32 }, { cx: 0.1, cy: -0.68, s: 0.26 },
    ];
    for (let i = 0; i < stars.length; i += 1) {
      const star = stars[i]!;
      const u = (along - star.cx) / star.s;
      const v = (across - star.cy) / star.s;
      const d = Math.hypot(u, v);
      if (d > 1.15) continue;
      const cross4 = (0.036 / (Math.abs(u) * Math.abs(v) + 0.032)) * smoothstep(1.08, 0.05, d);
      const du = (u + v) * 0.7071;
      const dv = (u - v) * 0.7071;
      const crossDiag = (0.014 / (Math.abs(du) * Math.abs(dv) + 0.042)) * smoothstep(0.72, 0.04, d);
      const val = clamp01((cross4 * 0.58 + crossDiag * 0.32 + Math.exp(-(d * d) * 14) * 0.95) * (0.72 + pressure01 * 0.28));
      if (val > intensity) { intensity = val; scatterHit = i > 0; }
    }
    return {
      alpha: intensity, height: intensity * 0.48, shadeDelta: intensity * 0.42,
      mixRatio: 0, paperHeight: 1, isScatter: scatterHit && intensity > 0.15,
    };
  }

  const linkPhase = ((along + 1) * 1.8) % 1 - 0.5;
  const linkRingDist = Math.abs(Math.hypot(linkPhase * 1.85, across * 2.55) - 0.62);
  const chainAlpha = smoothstep(0.22, 0.06, linkRingDist) * smoothstep(0.96, 0.82, Math.abs(along));
  const leafSide = across >= 0 ? 1 : -1;
  const leafU = (((along + 1.25) * 1.8) % 1 - 0.5) * 2.1;
  const leafV = (Math.abs(across) - 0.48) * 2.4;
  const leafDist = Math.hypot(leafU - leafSide * leafV * 0.35, leafV * 1.18);
  const leafAlpha = smoothstep(0.54, 0.28, leafDist) * smoothstep(0.94, 0.78, Math.abs(along));
  const alpha = clamp01(Math.max(chainAlpha, leafAlpha * 0.9) * (0.74 + pressure01 * 0.26));
  return {
    alpha,
    height: alpha * 0.58,
    shadeDelta: chainAlpha > leafAlpha ? (0.14 - linkRingDist) * 1.1 : (0.28 - leafDist) * 0.5,
    mixRatio: leafAlpha > chainAlpha ? 0.35 : 0.08,
    paperHeight: 1,
    isScatter: r > 0.62 && leafAlpha > 0.2,
  };
}

export function evaluateCspBrushTexel(
  brush: CspProBrushSpec,
  nx: number,
  ny: number,
  wx: number,
  wy: number,
  pressure01: number,
  tilt01: number,
  velocity01: number,
  dirRad: number,
  paperTooth: number,
  colorMix: number,
  seed: number,
): CspTexelEval {
  const cosD = Math.cos(dirRad);
  const sinD = Math.sin(dirRad);
  const along = nx * cosD + ny * sinD;
  const across = -nx * sinD + ny * cosD;
  const tiltStretch = 1 + (brush.tiltExpandMax - 1) * tilt01 * 0.45;
  const r = Math.hypot(along / tiltStretch, across);
  const paper = samplePaperSubstrateHeight(brush.paperGrain, wx, wy, seed);

  switch (brush.textureKernel) {
    case "decor-lace":
    case "decor-petals":
    case "decor-sparkle":
    case "decor-chain":
      return evaluateDecorationTexel(brush, along, across, r, pressure01, seed);
    case "ink-nib": {
      const nibRadius = brush.id === "csp-mapping-pen" ? 0.76 : 0.88;
      const feather = Math.max(0.03, (1 - brush.hardness01) * 0.38 + 0.055);
      const alpha = clamp01(smoothstep(nibRadius + feather, nibRadius - feather, r) * (1 - paperTooth * (1 - paper) * 0.16) * (0.72 + pressure01 * 0.28));
      return { alpha, height: alpha * 0.08, shadeDelta: 0, mixRatio: 0, paperHeight: paper, isScatter: false };
    }
    case "ink-rough": {
      const effR = r + (studioOssValueNoise2d(wx * 1.4, wy * 1.4, seed ^ 0x31) - 0.5) * 0.22 * (0.45 + paperTooth * 0.75);
      const drySkip = smoothstep((1 - pressure01) * 0.42 * paperTooth, 0.56, paper);
      const alpha = clamp01(smoothstep(0.92, 0.68, effR) * (r > 0.62 ? drySkip : 0.42 + 0.58 * drySkip) * (0.68 + pressure01 * 0.32));
      return { alpha, height: alpha * 0.14, shadeDelta: (paper - 0.5) * 0.12, mixRatio: 0, paperHeight: paper, isScatter: r > 0.78 && alpha > 0.12 };
    }
    case "graphite-tooth": {
      const leadAniso = studioOssValueNoise2d(along * 1.6, across * 14.5, seed ^ 0x412);
      const grit = studioOssValueNoise2d(wx * 2.8, wy * 2.8, seed ^ 0x45a);
      const effR = r + (paper - 0.5) * 0.24 + (leadAniso - 0.5) * 0.16;
      if (effR > 0.96) return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: paper, isScatter: false };
      const skipThr = clamp01((1 - pressure01 ** 1.15) * (0.56 * paperTooth + 0.12));
      const peakCatch = smoothstep(skipThr - 0.11, skipThr + 0.13, paper * 0.72 + grit * 0.28);
      const alpha = clamp01(smoothstep(0.96, 0.42, effR) * peakCatch * (0.42 + 0.58 * leadAniso) * brush.opacity01 * (0.34 + pressure01 * 0.66) * 1.24);
      return { alpha, height: alpha * 0.16, shadeDelta: (grit - 0.5) * 0.14, mixRatio: colorMix * 0.2, paperHeight: paper, isScatter: false };
    }
    case "wax-crayon": {
      const adhesion = studioOssFabricCrayonGrainAdhesion(wx, wy, pressure01, velocity01 * 45, seed, dirRad);
      const directional = studioOssDirectionalWaxSample(along * 8.5, across * 16.5, 0, seed ^ 0x3b71, 1.25);
      const strandRib = studioOssValueNoise2d(along * 0.95, across * 18.5, seed ^ 0x71c3);
      const effR = r + (directional.wax - 0.5) * 0.3 + (adhesion.paperPeak - 0.5) * 0.24;
      if (effR > 0.96) {
        if (r >= 0.76 && r <= 1.04) {
          const crumb = studioOssValueNoise2d(wx * 1.5, wy * 1.5, seed ^ 0x99d1);
          if (crumb > 0.68 && adhesion.paperPeak > 0.44) {
            const cAlpha = clamp01((crumb - 0.68) * 2.4 * (0.45 + pressure01 * 0.45));
            return { alpha: cAlpha, height: cAlpha * 0.35, shadeDelta: 0.08, mixRatio: 0.1, paperHeight: adhesion.paperPeak, isScatter: true };
          }
        }
        return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: adhesion.paperPeak, isScatter: false };
      }
      const valleyFill = pressure01 ** 1.38;
      const skipThr = clamp01((1 - valleyFill) * (0.54 * paperTooth + velocity01 * 0.14));
      const peakCatch = smoothstep(skipThr - 0.09, skipThr + 0.11, adhesion.paperPeak * 0.65 + paper * 0.35);
      const grooveCut = 1 - directional.scrape * (0.52 - valleyFill * 0.28);
      const dryBody = peakCatch * (0.52 + 0.48 * directional.wax) * (0.3 + 0.7 * strandRib) * 1.18;
      const alpha = clamp01(smoothstep(0.96, 0.52, effR) * grooveCut * (dryBody * (1 - valleyFill * 0.44) + valleyFill * (0.76 + 0.24 * adhesion.deposit)));
      return { alpha, height: alpha * (0.32 + directional.wax * 0.34), shadeDelta: (strandRib - 0.5) * 0.18, mixRatio: colorMix * 0.35, paperHeight: adhesion.paperPeak, isScatter: false };
    }
    case "oil-pastel": {
      const smear = studioOssValueNoise2d(along * 1.1, across * 15, seed ^ 0x51a);
      const creamRidge = 0.5 + 0.5 * Math.sin(across * 22 + smear * 4.2);
      const effR = r + (paper - 0.5) * 0.2 + (smear - 0.5) * 0.16;
      if (effR > 0.96) return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: paper, isScatter: false };
      const skipThr = clamp01((1 - pressure01 ** 1.1) * 0.36 * paperTooth);
      const catchVal = smoothstep(skipThr - 0.08, skipThr + 0.12, paper * 0.6 + smear * 0.4);
      const alpha = clamp01(smoothstep(0.96, 0.58, effR) * (0.28 + 0.72 * catchVal) * (0.55 + pressure01 * 0.45));
      return { alpha, height: alpha * (0.48 + creamRidge * 0.52) * brush.impastoRidge01, shadeDelta: (creamRidge - 0.5) * 0.36, mixRatio: colorMix * (0.4 + smear * 0.55), paperHeight: paper, isScatter: false };
    }
    case "chalk-powder": {
      const klecks = studioOssKlecksChalkCoverage(along, across, seed ^ 0x621, 1.45);
      const powder = studioOssValueNoise2d(wx * 2.9, wy * 2.9, seed ^ 0x677);
      const skipThr = clamp01((1 - pressure01) * 0.48 * paperTooth);
      const alpha = clamp01(klecks * (0.34 + 0.66 * smoothstep(skipThr - 0.1, skipThr + 0.12, paper)) * (0.62 + 0.38 * powder) * (0.55 + pressure01 * 0.65) * 1.35);
      return { alpha, height: alpha * 0.2, shadeDelta: (powder - 0.5) * 0.16, mixRatio: colorMix * 0.25, paperHeight: paper, isScatter: r > 0.74 && alpha > 0.1 };
    }
    case "charcoal-grit": {
      const highGrit = studioOssValueNoise2d(wx * 3.6, wy * 3.6, seed ^ 0x731);
      const deepCluster = studioOssValueNoise2d(along * 2.2, across * 11.5, seed ^ 0x77b);
      const effR = r + (highGrit - 0.5) * 0.28 + (paper - 0.5) * 0.22;
      if (effR > 0.98) return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: paper, isScatter: false };
      const skipThr = clamp01((1 - pressure01 ** 0.95) * 0.54 * paperTooth);
      const tooth = smoothstep(skipThr - 0.1, skipThr + 0.12, paper * 0.62 + highGrit * 0.38);
      const alpha = clamp01(smoothstep(0.98, 0.36, effR) * tooth * (0.32 + 0.68 * deepCluster) * (0.48 + pressure01 * 0.64) * 1.25);
      return { alpha, height: alpha * 0.22, shadeDelta: (deepCluster - 0.55) * 0.24, mixRatio: colorMix * 0.34, paperHeight: paper, isScatter: r > 0.76 && alpha > 0.12 };
    }
    case "watercolor-wash":
    case "watercolor-bloom": {
      const isBloom = brush.textureKernel === "watercolor-bloom";
      const warp = (studioOssValueNoise2d(along * 3.2, across * 3.2, seed ^ 0x811) - 0.5) * (isBloom ? 0.24 : 0.15)
        + (isBloom ? Math.sin(Math.atan2(across, along) * 5 + seed) * 0.06 : 0);
      const effR = r + warp;
      if (effR > 0.98) return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: paper, isScatter: false };
      const granulation = 0.62 + 0.38 * (1 - paper * paperTooth * 0.85);
      const coreLevel = isBloom ? 0.24 : brush.id === "csp-opaque-wc" ? 0.68 : brush.id === "csp-dense-wc" ? 0.46 : 0.32;
      const edgeRing = Math.exp(-((effR - 0.84) ** 2) / (isBloom ? 0.0085 : 0.0072)) * brush.wetEdgeDarkening01;
      const ringBoost = edgeRing * (isBloom ? 0.56 : brush.id === "csp-opaque-wc" ? 0.26 : 0.48);
      const alpha = clamp01(smoothstep(0.98, 0.89, effR) * (coreLevel * (0.65 + pressure01 * 0.35) * granulation + ringBoost));
      return { alpha, height: alpha * 0.1, shadeDelta: -edgeRing * 0.42 + (1 - granulation) * 0.14, mixRatio: colorMix * 0.72, paperHeight: paper, isScatter: false };
    }
    case "oil-impasto":
    case "gouache-matte": {
      const isOil = brush.textureKernel === "oil-impasto";
      const bristles = Math.max(12, brush.bristleCount);
      const warp = studioOssValueNoise2d(along * 1.4, across * 2.2, seed ^ 0x915) * 2.4;
      const track = (0.5 + 0.5 * Math.sin(across * bristles * 0.95 + warp)) * 0.58 + studioOssValueNoise2d(along * 0.65, across * bristles * 0.42, seed ^ 0x96b) * 0.42;
      const effD = Math.max(Math.abs(along) * 0.96, Math.abs(across) * 1.04) * 0.62 + r * 0.38 + (track - 0.5) * 0.16;
      if (effD > 0.96) return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: paper, isScatter: false };
      const alpha = clamp01(smoothstep(0.96, 0.74, effD) * (isOil ? 0.38 + 0.62 * track : 0.64 + 0.36 * track) * (1 - paperTooth * (1 - paper) * (isOil ? 0.28 : 0.22)) * (0.58 + pressure01 * 0.44));
      return {
        alpha,
        height: clamp01(alpha * (0.35 + track * 0.65) * brush.impastoRidge01),
        shadeDelta: Math.cos(across * bristles * 0.95 + warp) * brush.impastoRidge01 * (isOil ? 0.46 : 0.24),
        mixRatio: colorMix * (0.35 + track * 0.5),
        paperHeight: paper,
        isScatter: false,
      };
    }
    case "palette-knife": {
      const boxDist = Math.max(Math.abs(along) * 0.94, Math.abs(across) * 1.08);
      if (boxDist > 0.96) return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: paper, isScatter: false };
      const scrape = studioOssValueNoise2d(along * 0.55, across * 24, seed ^ 0xa21);
      const edgeLip = Math.exp(-((across - 0.66) ** 2) / 0.014);
      const backLip = Math.exp(-((across + 0.66) ** 2) / 0.025) * 0.45;
      const body = (0.22 + 0.58 * scrape) * (0.42 + 0.58 * paper);
      const alpha = clamp01(smoothstep(0.96, 0.84, boxDist) * (body * (0.45 + pressure01 * 0.45) + edgeLip * 0.72 + backLip * 0.35));
      return {
        alpha,
        height: clamp01((body * 0.38 + edgeLip * 0.95 + backLip * 0.42) * brush.impastoRidge01),
        shadeDelta: edgeLip * 0.52 - Math.exp(-((across - 0.78) ** 2) / 0.01) * 0.44 + (scrape - 0.5) * 0.22,
        mixRatio: colorMix * (0.5 + scrape * 0.45),
        paperHeight: paper,
        isScatter: false,
      };
    }
    case "sumi-dry-rake": {
      const bristles = Math.max(20, brush.bristleCount);
      const hairBand = 0.5 + 0.5 * Math.sin(across * bristles * 1.12 + studioOssValueNoise2d(along * 0.9, across * 2.6, seed ^ 0xb13) * 2.1);
      const hairSplit = studioOssValueNoise2d(along * 0.52, across * bristles * 0.55, seed ^ 0xb5d);
      const effR = r + (hairSplit - 0.5) * 0.22;
      if (effR > 0.98) return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: paper, isScatter: false };
      const dryThr = brush.id === "csp-calligraphy-fude" ? clamp01((1 - pressure01) * 0.44 + r * 0.22) : clamp01((1 - pressure01 * 0.68) * (0.52 * paperTooth) + 0.16);
      const alpha = clamp01(smoothstep(0.98, 0.52, effR) * smoothstep(dryThr - 0.08, dryThr + 0.09, hairBand * 0.55 + hairSplit * 0.3 + paper * 0.15) * (0.72 + pressure01 * 0.28));
      return { alpha, height: alpha * 0.14, shadeDelta: (hairBand - 0.5) * 0.12, mixRatio: 0.08, paperHeight: paper, isScatter: r > 0.76 && alpha > 0.15 };
    }
    case "sumi-wet-bleed": {
      const effR = r + (paper - 0.5) * 0.28 + (studioOssValueNoise2d(along * 2.5, across * 5.2, seed ^ 0xc19) - 0.5) * 0.18;
      if (effR > 1) return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: paper, isScatter: false };
      const halo = Math.exp(-((effR - 0.78) ** 2) / 0.018) * brush.wetEdgeDarkening01 * 0.38;
      const alpha = clamp01((smoothstep(0.82, 0.18, effR) * (0.58 + pressure01 * 0.36) + halo) * (0.68 + 0.32 * (1 - paper * paperTooth * 0.75)));
      return { alpha, height: alpha * 0.08, shadeDelta: -halo * 0.34, mixRatio: colorMix * 0.55, paperHeight: paper, isScatter: false };
    }
    case "airbrush-mist": {
      if (r >= 1) return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: 1, isScatter: false };
      const falloff = brush.hardness01 < 0.35 ? Math.exp(-(r * r) * 4.4) : smoothstep(1, 0.22, r) ** 1.18;
      const alpha = clamp01(falloff * (0.92 + 0.08 * studioOssValueNoise2d(wx * 3.8, wy * 3.8, seed ^ 0xd11)) * brush.opacity01 * (0.45 + pressure01 * 0.55));
      return { alpha, height: 0, shadeDelta: 0, mixRatio: colorMix * 0.18, paperHeight: 1, isScatter: false };
    }
    case "tone-scrape": {
      if (r >= 0.98) return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: paper, isScatter: false };
      const fleck = studioOssValueNoise2d(wx * 4.2, wy * 4.2, seed ^ 0xe15);
      const hatch = 0.5 + 0.5 * Math.sin((along * 0.7 + across * 0.7) * 38 + fleck * 2.5);
      const alpha = clamp01(smoothstep(0.98, 0.28, r) * smoothstep(0.64 - pressure01 * 0.14, 0.76 - pressure01 * 0.14, fleck * 0.68 + hatch * 0.32) * 0.94);
      return { alpha, height: 0, shadeDelta: 0.18, mixRatio: 0, paperHeight: paper, isScatter: alpha > 0.22 };
    }
    case "eraser-kneaded": {
      if (r >= 0.96) return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: paper, isScatter: false };
      const alpha = clamp01(smoothstep(0.96, 0.18, r) * (0.42 + 0.58 * paper * paperTooth + (1 - paperTooth) * 0.58) * brush.opacity01 * (0.38 + pressure01 * 0.62));
      return { alpha, height: alpha * 0.1, shadeDelta: 0.26, mixRatio: 0, paperHeight: paper, isScatter: false };
    }
    case "eraser-vector": {
      return {
        alpha: clamp01(smoothstep(0.86, 0.8, r)),
        height: 0,
        shadeDelta: Math.abs(along) < 0.05 || Math.abs(across) < 0.05 ? 0.18 : 0,
        mixRatio: 0,
        paperHeight: 1,
        isScatter: false,
      };
    }
    case "blend-smudge": {
      const smearR = Math.hypot(along * 0.78, across * 1.15);
      if (smearR >= 0.98) return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: paper, isScatter: false };
      const drag = 0.52 + 0.48 * smoothstep(-0.85, 0.85, along);
      const alpha = clamp01(smoothstep(0.98, 0.2, smearR) * drag * (0.84 + 0.16 * Math.sin(across * 16)) * (0.45 + pressure01 * 0.5));
      return { alpha, height: alpha * 0.12, shadeDelta: (drag - 0.75) * 0.22, mixRatio: clamp01(colorMix * drag), paperHeight: paper, isScatter: false };
    }
    case "blend-painterly": {
      const bristles = Math.max(20, brush.bristleCount);
      const shapeDist = Math.max(Math.abs(along) * 0.94, Math.abs(across) * 1.04) * 0.58 + r * 0.42;
      if (shapeDist > 0.96) return { alpha: 0, height: 0, shadeDelta: 0, mixRatio: 0, paperHeight: paper, isScatter: false };
      const warp = studioOssValueNoise2d(along * 1.1, across * 2.5, seed ^ 0xf1b) * 2.0;
      const track = 0.5 + 0.5 * Math.sin(across * bristles * 0.92 + warp);
      const alpha = clamp01(smoothstep(0.96, 0.56, shapeDist) * (0.34 + 0.66 * track) * (0.48 + pressure01 * 0.48));
      return {
        alpha,
        height: alpha * track * brush.impastoRidge01,
        shadeDelta: Math.cos(across * bristles * 0.92 + warp) * brush.impastoRidge01 * 0.34,
        mixRatio: clamp01(colorMix * (0.35 + 0.65 * track) * (0.5 + 0.5 * smoothstep(-0.8, 0.8, along))),
        paperHeight: paper,
        isScatter: false,
      };
    }
  }
}
