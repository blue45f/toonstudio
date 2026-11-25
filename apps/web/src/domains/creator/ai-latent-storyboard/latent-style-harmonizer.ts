/**
 * 온디바이스 화풍 DNA 추출 · 3D LUT + OKLCH 색조/선화 굵기 일치화 · CIEDE2000(ΔE00) 실측 리포트 엔진.
 *
 * - 외부 API 호출 0건, 100% 브라우저/Node 온디바이스 TypedArray 결정론적 연산.
 * - 기준 컷 RGBA 버퍼에서 OKLCH 그림자 색조·하이라이트 색온도(K)·선화 굵기 분포·스크린톤 피치·채도 대역을 추출한다.
 * - 17×17×17 3D LUT 삼선형 보간 + OKLCH 색조 매칭 + 얇은 선의 Sobel 경계 강조를 적용하고
 *   보정 전/후 CIEDE2000(ΔE00) 지각 색차 축소량을 실측한다.
 */

import {
  analyzeLineartWidth,
  clampNum,
  computeCiede2000,
  computeSobelMagnitude,
  detectScreentonePitch,
  estimateKelvinFromXyz,
  oklabToOklch,
  oklabToSrgb,
  oklchToSrgb,
  quantileSorted,
  round2,
  round3,
  srgbToCieLab,
  srgbToOklab,
  srgbUnitToLinear,
  type CieLabColor,
  type LineartWidthDistribution,
  type OklabColor,
  type OklchColor,
  type ScreentonePitchProfile,
} from "./latent-style-color-math";

export {
  computeCiede2000,
  oklabToOklch,
  oklabToSrgb,
  oklchToOklab,
  oklchToSrgb,
  srgbToCieLab,
  srgbToOklab,
  srgbToOklch,
  type CieLabColor,
  type LineartWidthBucket,
  type LineartWidthDistribution,
  type OklabColor,
  type OklchColor,
  type ScreentonePitchProfile,
} from "./latent-style-color-math";

export interface RgbaImageBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface ChromaBandProfile {
  readonly p10: number;
  readonly median: number;
  readonly mean: number;
  readonly p90: number;
  readonly dynamicRange: number;
  readonly bandLabelKo: "저채도 차분" | "중채도 균형" | "고채도 선명";
}

export interface LuminanceProfile {
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
}

export interface ArtistStyleDna {
  readonly shadowOklch: OklchColor;
  readonly midtoneOklch: OklchColor;
  readonly highlightOklch: OklchColor;
  readonly shadowOklab: OklabColor;
  readonly midtoneOklab: OklabColor;
  readonly highlightOklab: OklabColor;
  readonly shadowLab: CieLabColor;
  readonly midtoneLab: CieLabColor;
  readonly highlightLab: CieLabColor;
  readonly highlightTempKelvin: number;
  readonly highlightTempBias: "warm" | "neutral" | "cool";
  readonly lineartWidthDistribution: LineartWidthDistribution;
  readonly screentonePitch: ScreentonePitchProfile;
  readonly chromaBand: ChromaBandProfile;
  readonly luminanceProfile: LuminanceProfile;
  readonly analyzedPixelCount: number;
}

export interface StyleHarmonizationOptions {
  /** OKLCH 색조·채도 대역 매칭 강도 (0..1, 기본 0.85). */
  readonly colorStrength?: number;
  /** 3D LUT 명도·톤 커브 일치 강도 (0..1, 기본 0.80). */
  readonly lutStrength?: number;
  /** 기준보다 얇은 선의 Sobel 경계 강조 강도. 얇게 만들기는 미지원 (0..1, 기본 0.70). */
  readonly lineartSyncStrength?: number;
  /** 기준 컷 스크린톤 피치 오버레이 강도 (0..1, 기본 0.35). */
  readonly screentoneBlend?: number;
  /** 3D LUT 격자 해상도 (기본 17 -> 17×17×17). */
  readonly lutGridSize?: number;
}

export interface StyleHarmonizationReport {
  readonly referenceDna: ArtistStyleDna;
  readonly beforeDna: ArtistStyleDna;
  readonly afterDna: ArtistStyleDna;
  readonly harmonizedBuffer: RgbaImageBuffer;
  readonly lutGridSize: number;
  readonly lutTable: Float32Array;
  readonly shadowDeltaE00Before: number;
  readonly shadowDeltaE00After: number;
  readonly midtoneDeltaE00Before: number;
  readonly midtoneDeltaE00After: number;
  readonly highlightDeltaE00Before: number;
  readonly highlightDeltaE00After: number;
  readonly meanDeltaE00Before: number;
  readonly meanDeltaE00After: number;
  readonly deltaE00Reduction: number;
  readonly deltaE00ReductionPct: number;
  readonly lineartWidthErrorBeforePx: number;
  readonly lineartWidthErrorAfterPx: number;
  /** 선화 강조 단계의 상태. 뒤에 적용하는 스크린톤의 선폭 영향과 구분한다. */
  readonly lineartSyncStatus: "disabled" | "already-matched" | "unsupported-thinning" | "expanded" | "skipped-overshoot";
  readonly screentoneApplied: boolean;
  readonly elapsedMs: number;
}

export type StylePresetId = "romance-pastel" | "noir-ink-thriller" | "sunset-slice-of-life";

export interface StylePresetMeta {
  readonly id: StylePresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly targetLineWidthPx: number;
  readonly screentonePitchPx: number;
}

export const STYLE_HARMONIZER_PRESETS: readonly StylePresetMeta[] = Object.freeze([
  Object.freeze({
    id: "romance-pastel",
    labelKo: "로맨스 파스텔 수채",
    labelEn: "Romance Pastel Wash",
    summaryKo: "따뜻한 로즈 하이라이트 · 보랏빛 섀도 · 섬세한 2px 펜선",
    targetLineWidthPx: 2,
    screentonePitchPx: 0,
  }),
  Object.freeze({
    id: "noir-ink-thriller",
    labelKo: "누아르 잉크 스릴러",
    labelEn: "Noir Ink Thriller",
    summaryKo: "차가운 청회색 그림자 · 굵은 4px G펜 선화 · 6px 스크린톤",
    targetLineWidthPx: 4,
    screentonePitchPx: 6,
  }),
  Object.freeze({
    id: "sunset-slice-of-life",
    labelKo: "노을 감성 일상툰",
    labelEn: "Golden Hour Slice-of-Life",
    summaryKo: "황금빛 4200K 하이라이트 · 따뜻한 엄버 그림자 · 3px 펜선",
    targetLineWidthPx: 3,
    screentonePitchPx: 0,
  }),
]);

interface ZoneAcc {
  okL: number;
  okA: number;
  okB: number;
  labL: number;
  labA: number;
  labB: number;
  count: number;
}

function makeZoneAcc(): ZoneAcc {
  return { okL: 0, okA: 0, okB: 0, labL: 0, labA: 0, labB: 0, count: 0 };
}

function addZone(acc: ZoneAcc, ok: OklabColor, lab: CieLabColor): void {
  acc.okL += ok.l;
  acc.okA += ok.a;
  acc.okB += ok.b;
  acc.labL += lab.l;
  acc.labA += lab.a;
  acc.labB += lab.b;
  acc.count += 1;
}

/** 기준 컷 RGBA 버퍼에서 온디바이스 화풍 DNA를 추출한다. */
export function extractStyleDnaFromRgba(buffer: RgbaImageBuffer): ArtistStyleDna {
  const { width, height, data } = buffer;
  const pixelCount = Math.max(1, Math.min(width * height, Math.floor(data.length / 4)));
  const luma = new Float32Array(pixelCount);
  const chromas = new Float32Array(pixelCount);

  const shadowAcc = makeZoneAcc();
  const midAcc = makeZoneAcc();
  const highAcc = makeZoneAcc();
  const globalAcc = makeZoneAcc();
  let hX = 0;
  let hY = 0;
  let hZ = 0;
  let chromaSum = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const r = data[off] ?? 0;
    const g = data[off + 1] ?? 0;
    const b = data[off + 2] ?? 0;

    const ok = srgbToOklab(r, g, b);
    const lab = srgbToCieLab(r, g, b);
    const chroma = Math.hypot(ok.a, ok.b);
    luma[i] = ok.l;
    chromas[i] = chroma;
    chromaSum += chroma;
    addZone(globalAcc, ok, lab);

    if (ok.l >= 0.14 && ok.l <= 0.46) {
      addZone(shadowAcc, ok, lab);
    } else if (ok.l > 0.46 && ok.l < 0.72) {
      addZone(midAcc, ok, lab);
    } else if (ok.l >= 0.72) {
      addZone(highAcc, ok, lab);
      const lr = srgbUnitToLinear(r / 255);
      const lg = srgbUnitToLinear(g / 255);
      const lb = srgbUnitToLinear(b / 255);
      hX += 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
      hY += 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
      hZ += 0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb;
    }
  }

  const fallbackOk: OklabColor = {
    l: globalAcc.okL / pixelCount,
    a: globalAcc.okA / pixelCount,
    b: globalAcc.okB / pixelCount,
  };
  const fallbackLab: CieLabColor = {
    l: globalAcc.labL / pixelCount,
    a: globalAcc.labA / pixelCount,
    b: globalAcc.labB / pixelCount,
  };
  const avgOk = (acc: ZoneAcc, fbL: number): OklabColor =>
    acc.count > 0 ? { l: acc.okL / acc.count, a: acc.okA / acc.count, b: acc.okB / acc.count } : { l: fbL, a: fallbackOk.a, b: fallbackOk.b };
  const avgLab = (acc: ZoneAcc): CieLabColor =>
    acc.count > 0 ? { l: acc.labL / acc.count, a: acc.labA / acc.count, b: acc.labB / acc.count } : fallbackLab;

  const shadowOklab = avgOk(shadowAcc, Math.min(0.32, fallbackOk.l));
  const midtoneOklab = avgOk(midAcc, fallbackOk.l);
  const highlightOklab = avgOk(highAcc, Math.max(0.8, fallbackOk.l));

  const highlightTempKelvin = highAcc.count > 0 ? estimateKelvinFromXyz(hX, hY, hZ) : 6500;
  const highlightTempBias: "warm" | "neutral" | "cool" =
    highlightTempKelvin < 5600 ? "warm" : highlightTempKelvin > 7100 ? "cool" : "neutral";

  const sortedLuma = Float32Array.from(luma).sort();
  const sortedChroma = Float32Array.from(chromas).sort();
  const cP10 = round3(quantileSorted(sortedChroma, 0.1));
  const cP90 = round3(quantileSorted(sortedChroma, 0.9));
  const cMean = round3(chromaSum / pixelCount);
  const bandLabelKo: ChromaBandProfile["bandLabelKo"] =
    cMean < 0.055 ? "저채도 차분" : cMean < 0.115 ? "중채도 균형" : "고채도 선명";

  const edgeMag = computeSobelMagnitude(luma, width, height);
  return {
    shadowOklch: oklabToOklch(shadowOklab),
    midtoneOklch: oklabToOklch(midtoneOklab),
    highlightOklch: oklabToOklch(highlightOklab),
    shadowOklab,
    midtoneOklab,
    highlightOklab,
    shadowLab: avgLab(shadowAcc),
    midtoneLab: avgLab(midAcc),
    highlightLab: avgLab(highAcc),
    highlightTempKelvin,
    highlightTempBias,
    lineartWidthDistribution: analyzeLineartWidth(luma, edgeMag, width, height),
    screentonePitch: detectScreentonePitch(luma, width, height),
    chromaBand: {
      p10: cP10,
      median: round3(quantileSorted(sortedChroma, 0.5)),
      mean: cMean,
      p90: cP90,
      dynamicRange: round3(Math.max(0, cP90 - cP10)),
      bandLabelKo,
    },
    luminanceProfile: {
      p10: round3(quantileSorted(sortedLuma, 0.1)),
      p50: round3(quantileSorted(sortedLuma, 0.5)),
      p90: round3(quantileSorted(sortedLuma, 0.9)),
    },
    analyzedPixelCount: pixelCount,
  };
}

function zoneWeightsForL(l: number, sL: number, mL: number, hL: number): readonly [number, number, number] {
  const inv2SigmaSq = 1 / (2 * 0.22 * 0.22);
  const ws = Math.exp(-Math.pow(l - sL, 2) * inv2SigmaSq);
  const wm = Math.exp(-Math.pow(l - mL, 2) * inv2SigmaSq);
  const wh = Math.exp(-Math.pow(l - hL, 2) * inv2SigmaSq);
  const sum = ws + wm + wh + 1e-9;
  return [ws / sum, wm / sum, wh / sum];
}

function buildStyleHarmonizationLut3d(
  refDna: ArtistStyleDna,
  srcDna: ArtistStyleDna,
  colorStrength: number,
  lutStrength: number,
  gridSize: number,
): Float32Array {
  const lut = new Float32Array(gridSize * gridSize * gridSize * 3);
  const denom = Math.max(1, gridSize - 1);
  const chromaRatio = clampNum((refDna.chromaBand.mean + 0.008) / (srcDna.chromaBand.mean + 0.008), 0.45, 1.85);
  const residualScale = 1 + colorStrength * (chromaRatio - 1) * 0.45;

  let ptr = 0;
  for (let bi = 0; bi < gridSize; bi += 1) {
    const bVal = (bi / denom) * 255;
    for (let gi = 0; gi < gridSize; gi += 1) {
      const gVal = (gi / denom) * 255;
      for (let ri = 0; ri < gridSize; ri += 1) {
        const ok = srgbToOklab((ri / denom) * 255, gVal, bVal);
        const inkDamp = ok.l < 0.12 ? ok.l / 0.12 : 1;
        const [ws, wm, wh] = zoneWeightsForL(ok.l, srcDna.shadowOklab.l, srcDna.midtoneOklab.l, srcDna.highlightOklab.l);

        const srcL = ws * srcDna.shadowOklab.l + wm * srcDna.midtoneOklab.l + wh * srcDna.highlightOklab.l;
        const refL = ws * refDna.shadowOklab.l + wm * refDna.midtoneOklab.l + wh * refDna.highlightOklab.l;
        const srcA = ws * srcDna.shadowOklab.a + wm * srcDna.midtoneOklab.a + wh * srcDna.highlightOklab.a;
        const srcB = ws * srcDna.shadowOklab.b + wm * srcDna.midtoneOklab.b + wh * srcDna.highlightOklab.b;
        const refA = ws * refDna.shadowOklab.a + wm * refDna.midtoneOklab.a + wh * refDna.highlightOklab.a;
        const refB = ws * refDna.shadowOklab.b + wm * refDna.midtoneOklab.b + wh * refDna.highlightOklab.b;

        const outL = clampNum(ok.l + lutStrength * inkDamp * (refL - srcL), 0, 1);
        const outA = srcA + (ok.a - srcA) * residualScale + colorStrength * inkDamp * (refA - srcA);
        const outB = srcB + (ok.b - srcB) * residualScale + colorStrength * inkDamp * (refB - srcB);

        const [or, og, ob] = oklabToSrgb({ l: outL, a: outA, b: outB });
        lut[ptr] = or / 255;
        lut[ptr + 1] = og / 255;
        lut[ptr + 2] = ob / 255;
        ptr += 3;
      }
    }
  }
  return lut;
}

function sampleLut3dTrilinear(lut: Float32Array, gridSize: number, r: number, g: number, b: number): readonly [number, number, number] {
  const maxIdx = gridSize - 1;
  const rx = clampNum(r / 255, 0, 1) * maxIdx;
  const gy = clampNum(g / 255, 0, 1) * maxIdx;
  const bz = clampNum(b / 255, 0, 1) * maxIdx;
  const r0 = Math.floor(rx);
  const g0 = Math.floor(gy);
  const b0 = Math.floor(bz);
  const r1 = Math.min(maxIdx, r0 + 1);
  const g1 = Math.min(maxIdx, g0 + 1);
  const b1 = Math.min(maxIdx, b0 + 1);
  const fr = rx - r0;
  const fg = gy - g0;
  const fb = bz - b0;
  const strideB = gridSize * gridSize;
  const idx = (ri: number, gi: number, bi: number): number => (bi * strideB + gi * gridSize + ri) * 3;
  const c000 = idx(r0, g0, b0);
  const c100 = idx(r1, g0, b0);
  const c010 = idx(r0, g1, b0);
  const c110 = idx(r1, g1, b0);
  const c001 = idx(r0, g0, b1);
  const c101 = idx(r1, g0, b1);
  const c011 = idx(r0, g1, b1);
  const c111 = idx(r1, g1, b1);

  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch += 1) {
    const v0 = ((lut[c000 + ch] ?? 0) * (1 - fr) + (lut[c100 + ch] ?? 0) * fr) * (1 - fg) +
      ((lut[c010 + ch] ?? 0) * (1 - fr) + (lut[c110 + ch] ?? 0) * fr) * fg;
    const v1 = ((lut[c001 + ch] ?? 0) * (1 - fr) + (lut[c101 + ch] ?? 0) * fr) * (1 - fg) +
      ((lut[c011 + ch] ?? 0) * (1 - fr) + (lut[c111 + ch] ?? 0) * fr) * fg;
    out[ch] = Math.round(clampNum(v0 * (1 - fb) + v1 * fb, 0, 1) * 255);
  }
  return out;
}

function measureLineWidth(data: Uint8ClampedArray, width: number, height: number): number {
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i += 1) {
    const off = i * 4;
    luma[i] = (0.299 * (data[off] ?? 0) + 0.587 * (data[off + 1] ?? 0) + 0.114 * (data[off + 2] ?? 0)) / 255;
  }
  return analyzeLineartWidth(luma, computeSobelMagnitude(luma, width, height), width, height).meanPx;
}

/** 기준 RGBA 색상에 맞춘 CPU 보정과 선화 강조의 적용·생략 상태를 반환한다. */
export function harmonizeBackgroundToStyleDna(
  referenceDna: ArtistStyleDna,
  targetBuffer: RgbaImageBuffer,
  options: StyleHarmonizationOptions = {},
): StyleHarmonizationReport {
  const start = typeof performance !== "undefined" ? performance.now() : 0;
  const colorStrength = clampNum(options.colorStrength ?? 0.85, 0, 1);
  const lutStrength = clampNum(options.lutStrength ?? 0.8, 0, 1);
  const lineartSyncStrength = clampNum(options.lineartSyncStrength ?? 0.7, 0, 1);
  const screentoneBlend = clampNum(options.screentoneBlend ?? 0.35, 0, 1);
  const lutGridSize = Math.round(clampNum(options.lutGridSize ?? 17, 9, 25));

  const beforeDna = extractStyleDnaFromRgba(targetBuffer);
  const lutTable = buildStyleHarmonizationLut3d(referenceDna, beforeDna, colorStrength, lutStrength, lutGridSize);

  const { width, height, data } = targetBuffer;
  const outData = new Uint8ClampedArray(data.length);
  const pixelCount = width * height;
  const srcLuma = new Float32Array(pixelCount);

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const r = data[off] ?? 0;
    const g = data[off + 1] ?? 0;
    const b = data[off + 2] ?? 0;
    srcLuma[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const [nr, ng, nb]: readonly [number, number, number] = colorStrength === 0 && lutStrength === 0
      ? [r, g, b]
      : sampleLut3dTrilinear(lutTable, lutGridSize, r, g, b);
    outData[off] = nr;
    outData[off + 1] = ng;
    outData[off + 2] = nb;
    outData[off + 3] = data[off + 3] ?? 255;
  }

  let lineartSyncStatus: StyleHarmonizationReport["lineartSyncStatus"] = "disabled";
  if (lineartSyncStrength > 0.01) {
    const referenceWidth = referenceDna.lineartWidthDistribution.meanPx;
    const baseWidth = measureLineWidth(outData, width, height);
    const widthDiff = referenceWidth - baseWidth;
    lineartSyncStatus = widthDiff < -0.45 ? "unsupported-thinning" : "already-matched";
    if (widthDiff > 0.45) {
      const beforeExpansion = outData.slice();
      const edgeMag = computeSobelMagnitude(srcLuma, width, height);
      const dilateRadius = Math.min(2, Math.max(1, Math.round(widthDiff * 0.55)));
      const [inkR, inkG, inkB] = oklchToSrgb({
        l: Math.min(0.11, referenceDna.shadowOklch.l * 0.45),
        c: Math.min(0.035, referenceDna.shadowOklch.c * 0.5),
        h: referenceDna.shadowOklch.h,
      });
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const mag = edgeMag[y * width + x] ?? 0;
          if (mag < 0.42) continue;
          const edgeAlpha = clampNum((mag - 0.35) * 0.9 * lineartSyncStrength, 0, 0.92);
          for (let dy = -dilateRadius; dy <= dilateRadius; dy += 1) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -dilateRadius; dx <= dilateRadius; dx += 1) {
              const nx = x + dx;
              if (nx < 0 || nx >= width || dx * dx + dy * dy > dilateRadius * dilateRadius + 0.35) continue;
              const off = (ny * width + nx) * 4;
              const wBlend = edgeAlpha * (dx === 0 && dy === 0 ? 1 : 0.72);
              outData[off] = Math.round((outData[off] ?? 0) * (1 - wBlend) + inkR * wBlend);
              outData[off + 1] = Math.round((outData[off + 1] ?? 0) * (1 - wBlend) + inkG * wBlend);
              outData[off + 2] = Math.round((outData[off + 2] ?? 0) * (1 - wBlend) + inkB * wBlend);
            }
          }
        }
      }
      // 픽셀 단위 확장이 기준 굵기를 지나치면 색상 보정 직후 버퍼로 되돌린다.
      const expandedWidth = measureLineWidth(outData, width, height);
      if (Math.abs(expandedWidth - referenceWidth) >= Math.abs(baseWidth - referenceWidth)) {
        outData.set(beforeExpansion);
        lineartSyncStatus = "skipped-overshoot";
      } else {
        lineartSyncStatus = "expanded";
      }
    }
  }

  const screentoneApplied = referenceDna.screentonePitch.detected && screentoneBlend > 0.05;
  if (screentoneApplied) {
    const pitch = Math.max(3, referenceDna.screentonePitch.pitchPx);
    const darken = 1 - 0.16 * screentoneBlend;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const off = (y * width + x) * 4;
        const r = outData[off] ?? 0;
        const g = outData[off + 1] ?? 0;
        const b = outData[off + 2] ?? 0;
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (lum < 0.22 || lum > 0.58) continue;
        if (Math.cos(((x + y) * Math.PI) / pitch) * Math.cos(((x - y) * Math.PI) / pitch) > 0.35) {
          outData[off] = Math.round(r * darken);
          outData[off + 1] = Math.round(g * darken);
          outData[off + 2] = Math.round(b * darken);
        }
      }
    }
  }

  const harmonizedBuffer: RgbaImageBuffer = { width, height, data: outData };
  const afterDna = extractStyleDnaFromRgba(harmonizedBuffer);

  const shadowDeltaE00Before = round2(computeCiede2000(beforeDna.shadowLab, referenceDna.shadowLab));
  const shadowDeltaE00After = round2(computeCiede2000(afterDna.shadowLab, referenceDna.shadowLab));
  const midtoneDeltaE00Before = round2(computeCiede2000(beforeDna.midtoneLab, referenceDna.midtoneLab));
  const midtoneDeltaE00After = round2(computeCiede2000(afterDna.midtoneLab, referenceDna.midtoneLab));
  const highlightDeltaE00Before = round2(computeCiede2000(beforeDna.highlightLab, referenceDna.highlightLab));
  const highlightDeltaE00After = round2(computeCiede2000(afterDna.highlightLab, referenceDna.highlightLab));

  const meanDeltaE00Before = round2(shadowDeltaE00Before * 0.3 + midtoneDeltaE00Before * 0.4 + highlightDeltaE00Before * 0.3);
  const meanDeltaE00After = round2(shadowDeltaE00After * 0.3 + midtoneDeltaE00After * 0.4 + highlightDeltaE00After * 0.3);
  const deltaE00Reduction = round2(meanDeltaE00Before - meanDeltaE00After);

  return {
    referenceDna,
    beforeDna,
    afterDna,
    harmonizedBuffer,
    lutGridSize,
    lutTable,
    shadowDeltaE00Before,
    shadowDeltaE00After,
    midtoneDeltaE00Before,
    midtoneDeltaE00After,
    highlightDeltaE00Before,
    highlightDeltaE00After,
    meanDeltaE00Before,
    meanDeltaE00After,
    deltaE00Reduction,
    deltaE00ReductionPct: meanDeltaE00Before > 0.01 ? round2((deltaE00Reduction / meanDeltaE00Before) * 100) : 0,
    lineartWidthErrorBeforePx: round2(Math.abs(beforeDna.lineartWidthDistribution.meanPx - referenceDna.lineartWidthDistribution.meanPx)),
    lineartWidthErrorAfterPx: round2(Math.abs(afterDna.lineartWidthDistribution.meanPx - referenceDna.lineartWidthDistribution.meanPx)),
    lineartSyncStatus,
    screentoneApplied,
    elapsedMs: round2(typeof performance !== "undefined" ? performance.now() - start : 0),
  };
}

/** 기준 컷 + 3D 배경 데모 RGBA 픽스처 쌍을 결정론적으로 생성한다. */
export function createStyleHarmonizerDemoFixtures(
  presetId: StylePresetId,
  width = 120,
  height = 96,
): { readonly reference: RgbaImageBuffer; readonly target3d: RgbaImageBuffer } {
  const refData = new Uint8ClampedArray(width * height * 4);
  const targetData = new Uint8ClampedArray(width * height * 4);

  const pal =
    presetId === "romance-pastel"
      ? { high: [252, 232, 238] as const, mid: [224, 186, 208] as const, shadow: [112, 82, 134] as const, ink: [36, 24, 48] as const, lineW: 2, tonePitch: 0 }
      : presetId === "noir-ink-thriller"
        ? { high: [212, 224, 238] as const, mid: [104, 122, 146] as const, shadow: [42, 54, 78] as const, ink: [14, 18, 28] as const, lineW: 4, tonePitch: 6 }
        : { high: [255, 224, 178] as const, mid: [232, 154, 108] as const, shadow: [118, 66, 52] as const, ink: [38, 22, 18] as const, lineW: 3, tonePitch: 0 };

  const setPx = (buf: Uint8ClampedArray, x: number, y: number, rgb: readonly [number, number, number]): void => {
    const off = (y * width + x) * 4;
    buf[off] = rgb[0];
    buf[off + 1] = rgb[1];
    buf[off + 2] = rgb[2];
    buf[off + 3] = 255;
  };

  for (let y = 0; y < height; y += 1) {
    const v = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / Math.max(1, width - 1);
      let refRgb: readonly [number, number, number] = v < 0.36 ? pal.high : v < 0.72 ? pal.mid : pal.shadow;
      if (pal.tonePitch > 0 && v >= 0.4 && v <= 0.7) {
        const dot = (x % pal.tonePitch === 0 && y % pal.tonePitch === 0) || ((x + 3) % pal.tonePitch === 0 && (y + 3) % pal.tonePitch === 0);
        if (dot) refRgb = [Math.round(refRgb[0] * 0.62), Math.round(refRgb[1] * 0.62), Math.round(refRgb[2] * 0.62)];
      }
      const isRefLine = Math.abs(y - Math.round(height * 0.36)) < pal.lineW || Math.abs(x - Math.round(width * 0.48)) < pal.lineW;
      setPx(refData, x, y, isRefLine ? pal.ink : refRgb);

      const isBldg = x > width * 0.24 && x < width * 0.78 && y > height * 0.28;
      let tRgb: readonly [number, number, number] =
        y > height * 0.7
          ? [54, 74, 64]
          : isBldg
            ? [Math.round(126 + 18 * u), Math.round(148 + 14 * u), Math.round(134 + 12 * (1 - u))]
            : [Math.round(176 + 38 * (1 - v)), Math.round(212 + 26 * (1 - v)), Math.round(234 + 18 * (1 - v))];

      const isWire =
        (isBldg && (Math.abs(x - Math.round(width * 0.24)) <= 1 || Math.abs(x - Math.round(width * 0.78)) <= 1 || Math.abs(y - Math.round(height * 0.28)) <= 1)) ||
        Math.abs(y - Math.round(height * 0.7)) <= 1;
      if (isWire) tRgb = [22, 26, 30];
      setPx(targetData, x, y, tRgb);
    }
  }

  return {
    reference: { width, height, data: refData },
    target3d: { width, height, data: targetData },
  };
}

/** 기준 컷 | 보정 전 3D 배경 | 일치화 완료 3분할 비교 RGBA 버퍼 합성. */
export function renderStyleComparisonStripRgba(
  reference: RgbaImageBuffer,
  beforeTarget: RgbaImageBuffer,
  afterHarmonized: RgbaImageBuffer,
  dividerWidthPx = 2,
): RgbaImageBuffer {
  const panelW = reference.width;
  const panelH = reference.height;
  const totalW = panelW * 3 + dividerWidthPx * 2;
  const out = new Uint8ClampedArray(totalW * panelH * 4);
  const panels = [reference, beforeTarget, afterHarmonized] as const;

  for (let y = 0; y < panelH; y += 1) {
    for (let p = 0; p < 3; p += 1) {
      const src = panels[p]!;
      const xStart = p * (panelW + dividerWidthPx);
      for (let x = 0; x < panelW; x += 1) {
        const sOff = (Math.min(src.height - 1, y) * src.width + Math.min(src.width - 1, x)) * 4;
        const dOff = (y * totalW + (xStart + x)) * 4;
        out[dOff] = src.data[sOff] ?? 0;
        out[dOff + 1] = src.data[sOff + 1] ?? 0;
        out[dOff + 2] = src.data[sOff + 2] ?? 0;
        out[dOff + 3] = 255;
      }
      if (p < 2) {
        for (let d = 0; d < dividerWidthPx; d += 1) {
          const dOff = (y * totalW + (xStart + panelW + d)) * 4;
          out[dOff] = 148;
          out[dOff + 1] = 152;
          out[dOff + 2] = 160;
          out[dOff + 3] = 255;
        }
      }
    }
  }
  return { width: totalW, height: panelH, data: out };
}
