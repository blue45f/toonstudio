/**
 * Wave-34: 실시간 에피소드 레퍼런스 스타일 전이 3D LUT 및 셀 셰이딩 램프 베이커 (`OKLab` 색공간 기반).
 *
 * - 지각 균등 `OKLab` 색공간 변환 (`srgbToOklab`, `oklabToSrgb`)
 * - Reinhard 휘도 정규화 + Monge-Kantorovich `2x2` 색도 공분산 최적 수송 전이
 * - 먹선·선화 휘도 보존 (`preserveLineartLuminance`)으로 밝은 레퍼런스 전이 시 선화 번짐 차단
 * - 에피소드 레퍼런스 3단 셀 셰이딩 램프(`shadow`·`midtone`·`highlight`) 정량 추출
 * - 실시간 3D LUT 베이킹 및 삼선형 보간(`sampleStyleLut3D`)
 */

export const DEFAULT_LINEART_MAX_LUMINANCE = 0.22;
export const DEFAULT_LINEART_FEATHER_BAND = 0.1;
export const DEFAULT_LUT_GRID_SIZE = 17;

export interface SrgbColor { readonly r: number; readonly g: number; readonly b: number }
export interface OklabColor { readonly l: number; readonly a: number; readonly b: number }

export interface OklabChannelStats {
  readonly meanL: number;
  readonly meanA: number;
  readonly meanB: number;
  readonly stdL: number;
  readonly stdA: number;
  readonly stdB: number;
  /** (a, b) 색도 평면 공분산 E[(a - meanA)(b - meanB)] */
  readonly covAb: number;
  readonly sampleCount: number;
}

export interface CelShadingRamp {
  readonly shadow: SrgbColor;
  readonly shadowOklab: OklabColor;
  readonly midtone: SrgbColor;
  readonly midtoneOklab: OklabColor;
  readonly highlight: SrgbColor;
  readonly highlightOklab: OklabColor;
  readonly shadowUpperThresholdL: number;
  readonly highlightLowerThresholdL: number;
}

export interface StyleTransferBakeOptions {
  readonly strength?: number;
  readonly preserveLineartLuminance?: boolean;
  readonly lineartMaxLuminance?: number;
  readonly lineartFeatherBand?: number;
  readonly chromaCovarianceTransfer?: boolean;
  readonly lutGridSize?: number;
  readonly alphaThreshold?: number;
}

export interface StyleLut3D {
  readonly gridSize: number;
  readonly data: Float32Array;
  readonly strength: number;
  readonly preserveLineartLuminance: boolean;
  readonly sourceStats: OklabChannelStats;
  readonly referenceStats: OklabChannelStats;
  readonly celRamp: CelShadingRamp;
}

export interface EpisodeStyleTransferResult {
  readonly width: number;
  readonly height: number;
  readonly rgba: Float32Array;
  readonly lut: StyleLut3D;
  readonly preservedInkPixelCount: number;
  readonly meanDeltaOklab: number;
}

interface SymMatrix2x2 { readonly m00: number; readonly m01: number; readonly m11: number }

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min) return min;
  return value > max ? max : value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** 감마 인코딩된 단일 sRGB 채널 [0..1]을 선형 광량으로 변환한다 (IEC 61966-2-1). */
export function srgbChannelToLinear(channel: number): number {
  const c = clamp01(channel);
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 선형 광량 채널 [0..1]을 감마 인코딩된 sRGB [0..1]로 변환한다 (IEC 61966-2-1). */
export function linearChannelToSrgb(linear: number): number {
  const c = clamp01(linear);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** sRGB [0..1] 색상을 지각 균등 OKLab 색공간으로 변환한다. */
export function srgbToOklab(color: SrgbColor): OklabColor {
  const r = srgbChannelToLinear(color.r);
  const g = srgbChannelToLinear(color.g);
  const b = srgbChannelToLinear(color.b);

  const l = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const m = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const s = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToLinearRgbUnclamped(lab: OklabColor): SrgbColor {
  const lRoot = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mRoot = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sRoot = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = lRoot * lRoot * lRoot;
  const m = mRoot * mRoot * mRoot;
  const s = sRoot * sRoot * sRoot;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function isLinearRgbInGamut(rgb: SrgbColor): boolean {
  const eps = 1e-6;
  return (
    rgb.r >= -eps && rgb.r <= 1 + eps &&
    rgb.g >= -eps && rgb.g <= 1 + eps &&
    rgb.b >= -eps && rgb.b <= 1 + eps
  );
}

function fitOklabIntoSrgbGamut(lab: OklabColor): OklabColor {
  const safeL = clamp01(lab.l);
  const candidate: OklabColor = { l: safeL, a: lab.a, b: lab.b };
  if (isLinearRgbInGamut(oklabToLinearRgbUnclamped(candidate))) return candidate;
  let low = 0;
  let high = 1;
  for (let iter = 0; iter < 10; iter += 1) {
    const mid = (low + high) * 0.5;
    if (isLinearRgbInGamut(oklabToLinearRgbUnclamped({ l: safeL, a: lab.a * mid, b: lab.b * mid }))) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return { l: safeL, a: lab.a * low, b: lab.b * low };
}

/** OKLab 색상을 sRGB [0..1] 색상으로 변환한다. */
export function oklabToSrgb(lab: OklabColor): SrgbColor {
  const linear = oklabToLinearRgbUnclamped({ l: clamp01(lab.l), a: lab.a, b: lab.b });
  return {
    r: clamp01(linearChannelToSrgb(linear.r)),
    g: clamp01(linearChannelToSrgb(linear.g)),
    b: clamp01(linearChannelToSrgb(linear.b)),
  };
}

function sqrtSym2x2(mat: SymMatrix2x2): SymMatrix2x2 {
  const det = Math.max(0, mat.m00 * mat.m11 - mat.m01 * mat.m01);
  const s = Math.sqrt(det);
  const t = Math.sqrt(Math.max(1e-14, mat.m00 + mat.m11 + 2 * s));
  return { m00: (mat.m00 + s) / t, m01: mat.m01 / t, m11: (mat.m11 + s) / t };
}

function invSym2x2(mat: SymMatrix2x2): SymMatrix2x2 {
  const det = Math.max(1e-14, mat.m00 * mat.m11 - mat.m01 * mat.m01);
  return { m00: mat.m11 / det, m01: -mat.m01 / det, m11: mat.m00 / det };
}

function sandwichSym2x2(outer: SymMatrix2x2, inner: SymMatrix2x2): SymMatrix2x2 {
  const t00 = outer.m00 * inner.m00 + outer.m01 * inner.m01;
  const t01 = outer.m00 * inner.m01 + outer.m01 * inner.m11;
  const t10 = outer.m01 * inner.m00 + outer.m11 * inner.m01;
  const t11 = outer.m01 * inner.m01 + outer.m11 * inner.m11;
  return {
    m00: t00 * outer.m00 + t01 * outer.m01,
    m01: 0.5 * (t00 * outer.m01 + t01 * outer.m11 + t10 * outer.m00 + t11 * outer.m01),
    m11: t10 * outer.m01 + t11 * outer.m11,
  };
}

function computeMongeKantorovichMap(src: OklabChannelStats, ref: OklabChannelStats): SymMatrix2x2 {
  const reg = 1e-5;
  const srcCov: SymMatrix2x2 = { m00: src.stdA ** 2 + reg, m01: src.covAb, m11: src.stdB ** 2 + reg };
  const refCov: SymMatrix2x2 = { m00: ref.stdA ** 2 + reg, m01: ref.covAb, m11: ref.stdB ** 2 + reg };
  const srcHalf = sqrtSym2x2(srcCov);
  const srcInvHalf = invSym2x2(srcHalf);
  const midSqrt = sqrtSym2x2(sandwichSym2x2(srcHalf, refCov));
  return sandwichSym2x2(srcInvHalf, midSqrt);
}

function collectOklabSamples(rgba: Float32Array, alphaThreshold: number, excludeLineartMaxL: number): OklabColor[] {
  const nonInk: OklabColor[] = [];
  const allOpaque: OklabColor[] = [];
  const pixelCount = Math.floor(rgba.length / 4);
  for (let i = 0; i < pixelCount; i += 1) {
    const base = i * 4;
    if ((rgba[base + 3] ?? 0) < alphaThreshold) continue;
    const lab = srgbToOklab({ r: rgba[base] ?? 0, g: rgba[base + 1] ?? 0, b: rgba[base + 2] ?? 0 });
    allOpaque.push(lab);
    if (lab.l > excludeLineartMaxL) nonInk.push(lab);
  }
  return nonInk.length > 0 ? nonInk : allOpaque;
}

/** RGBA [0..1] 버퍼에서 채색 영역의 OKLab 평균·표준편차·색도 공분산을 계산한다. */
export function computeOklabChannelStats(
  rgba: Float32Array,
  options?: { readonly alphaThreshold?: number; readonly excludeLineartMaxL?: number },
): OklabChannelStats {
  const samples = collectOklabSamples(
    rgba,
    options?.alphaThreshold ?? 0.05,
    options?.excludeLineartMaxL ?? DEFAULT_LINEART_MAX_LUMINANCE,
  );
  if (samples.length === 0) {
    return { meanL: 0.5, meanA: 0, meanB: 0, stdL: 0.15, stdA: 0.05, stdB: 0.05, covAb: 0, sampleCount: 0 };
  }
  let sumL = 0, sumA = 0, sumB = 0;
  for (const s of samples) { sumL += s.l; sumA += s.a; sumB += s.b; }
  const n = samples.length;
  const meanL = sumL / n, meanA = sumA / n, meanB = sumB / n;
  let varL = 0, varA = 0, varB = 0, covAb = 0;
  for (const s of samples) {
    const dl = s.l - meanL, da = s.a - meanA, db = s.b - meanB;
    varL += dl * dl; varA += da * da; varB += db * db; covAb += da * db;
  }
  return {
    meanL, meanA, meanB,
    stdL: Math.sqrt(varL / n), stdA: Math.sqrt(varA / n), stdB: Math.sqrt(varB / n),
    covAb: covAb / n, sampleCount: n,
  };
}

/** 레퍼런스 RGBA 버퍼로부터 3단 셀 셰이딩 램프(그림자·중간톤·하이라이트)를 정량 추출한다. */
export function extractCelShadingRamp(
  rgba: Float32Array,
  options?: { readonly alphaThreshold?: number; readonly excludeLineartMaxL?: number },
): CelShadingRamp {
  const samples = collectOklabSamples(
    rgba,
    options?.alphaThreshold ?? 0.05,
    options?.excludeLineartMaxL ?? DEFAULT_LINEART_MAX_LUMINANCE,
  );
  if (samples.length === 0) {
    const sh: OklabColor = { l: 0.35, a: 0, b: 0 };
    const md: OklabColor = { l: 0.62, a: 0, b: 0 };
    const hi: OklabColor = { l: 0.88, a: 0, b: 0 };
    return {
      shadow: oklabToSrgb(sh), shadowOklab: sh,
      midtone: oklabToSrgb(md), midtoneOklab: md,
      highlight: oklabToSrgb(hi), highlightOklab: hi,
      shadowUpperThresholdL: 0.485, highlightLowerThresholdL: 0.75,
    };
  }
  const sorted = [...samples].sort((p, q) => p.l - q.l);
  const pick = (q: number): OklabColor =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))] ?? { l: 0.5, a: 0, b: 0 };

  let centroids: [OklabColor, OklabColor, OklabColor] = [pick(0.18), pick(0.54), pick(0.88)];
  for (let iter = 0; iter < 8; iter += 1) {
    const accum = [
      { l: 0, a: 0, b: 0, count: 0 },
      { l: 0, a: 0, b: 0, count: 0 },
      { l: 0, a: 0, b: 0, count: 0 },
    ];
    for (const s of sorted) {
      let bestK = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let k = 0; k < 3; k += 1) {
        const c = centroids[k] ?? centroids[0];
        const dist = ((s.l - c.l) * 1.5) ** 2 + (s.a - c.a) ** 2 + (s.b - c.b) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestK = k;
        }
      }
      const bucket = accum[bestK];
      if (bucket !== undefined) {
        bucket.l += s.l;
        bucket.a += s.a;
        bucket.b += s.b;
        bucket.count += 1;
      }
    }
    const next = centroids
      .map((prev, k) => {
        const b = accum[k];
        return b !== undefined && b.count > 0
          ? { l: b.l / b.count, a: b.a / b.count, b: b.b / b.count }
          : prev;
      })
      .sort((p, q) => p.l - q.l);
    centroids = [next[0] ?? centroids[0], next[1] ?? centroids[1], next[2] ?? centroids[2]];
  }

  const shadowOklab = fitOklabIntoSrgbGamut(centroids[0]);
  const midtoneOklab = fitOklabIntoSrgbGamut(centroids[1]);
  const highlightOklab = fitOklabIntoSrgbGamut(centroids[2]);
  return {
    shadow: oklabToSrgb(shadowOklab),
    shadowOklab,
    midtone: oklabToSrgb(midtoneOklab),
    midtoneOklab,
    highlight: oklabToSrgb(highlightOklab),
    highlightOklab,
    shadowUpperThresholdL: 0.5 * (shadowOklab.l + midtoneOklab.l),
    highlightLowerThresholdL: 0.5 * (midtoneOklab.l + highlightOklab.l),
  };
}

/** 입력 sRGB 색상을 추출된 3단 셀 셰이딩 램프로 양자화(또는 blend 비율 블렌딩)한다. */
export function quantizeColorToCelRamp(color: SrgbColor, ramp: CelShadingRamp, blend = 1): SrgbColor {
  const amount = clamp01(blend);
  const lab = srgbToOklab(color);
  const band =
    lab.l <= ramp.shadowUpperThresholdL
      ? ramp.shadow
      : lab.l >= ramp.highlightLowerThresholdL
        ? ramp.highlight
        : ramp.midtone;
  return {
    r: clamp01(color.r + (band.r - color.r) * amount),
    g: clamp01(color.g + (band.g - color.g) * amount),
    b: clamp01(color.b + (band.b - color.b) * amount),
  };
}

function transferWithCachedMap(
  lab: OklabColor,
  sourceStats: OklabChannelStats,
  referenceStats: OklabChannelStats,
  mkMap: SymMatrix2x2 | null,
  options?: StyleTransferBakeOptions,
): OklabColor {
  const strength = clamp01(options?.strength ?? 1);
  if (strength === 0) return lab;
  const preserveLineart = options?.preserveLineartLuminance ?? true;
  const lineartMaxL = options?.lineartMaxLuminance ?? DEFAULT_LINEART_MAX_LUMINANCE;
  const feather = Math.max(1e-4, options?.lineartFeatherBand ?? DEFAULT_LINEART_FEATHER_BAND);
  const paintWeight = preserveLineart ? smoothstep(lineartMaxL, lineartMaxL + feather, lab.l) : 1;
  const effectiveStrength = strength * paintWeight;
  if (effectiveStrength <= 1e-6) return lab;

  const lScale = sourceStats.stdL > 1e-3 ? clampRange(referenceStats.stdL / sourceStats.stdL, 0.35, 2.6) : 1;
  const targetL = clamp01((lab.l - sourceStats.meanL) * lScale + referenceStats.meanL);
  const da = lab.a - sourceStats.meanA;
  const db = lab.b - sourceStats.meanB;

  let targetA: number;
  let targetB: number;
  if (mkMap !== null) {
    const m00 = clampRange(mkMap.m00, -3.2, 3.2);
    const m01 = clampRange(mkMap.m01, -3.2, 3.2);
    const m11 = clampRange(mkMap.m11, -3.2, 3.2);
    targetA = referenceStats.meanA + m00 * da + m01 * db;
    targetB = referenceStats.meanB + m01 * da + m11 * db;
  } else {
    const aScale = sourceStats.stdA > 1e-3 ? clampRange(referenceStats.stdA / sourceStats.stdA, 0.25, 3) : 1;
    const bScale = sourceStats.stdB > 1e-3 ? clampRange(referenceStats.stdB / sourceStats.stdB, 0.25, 3) : 1;
    targetA = referenceStats.meanA + da * aScale;
    targetB = referenceStats.meanB + db * bScale;
  }

  return fitOklabIntoSrgbGamut({
    l: lab.l + (targetL - lab.l) * effectiveStrength,
    a: lab.a + (targetA - lab.a) * effectiveStrength,
    b: lab.b + (targetB - lab.b) * effectiveStrength,
  });
}

/** 단일 OKLab 색상에 Reinhard 휘도 전이 + Monge-Kantorovich 색도 전이 및 선화 보호를 적용한다. */
export function transferOklabColor(
  lab: OklabColor,
  sourceStats: OklabChannelStats,
  referenceStats: OklabChannelStats,
  options?: StyleTransferBakeOptions,
): OklabColor {
  const mkMap = (options?.chromaCovarianceTransfer ?? true)
    ? computeMongeKantorovichMap(sourceStats, referenceStats)
    : null;
  return transferWithCachedMap(lab, sourceStats, referenceStats, mkMap, options);
}

/** 소스 원고와 레퍼런스 에피소드의 색 통계를 분석해 실시간 삼선형 보간용 3D LUT를 굽는다. */
export function bakeStyleTransferLut3D(
  sourceRgba: Float32Array,
  referenceRgba: Float32Array,
  options?: StyleTransferBakeOptions,
): StyleLut3D {
  const gridSize = Math.round(clampRange(options?.lutGridSize ?? DEFAULT_LUT_GRID_SIZE, 4, 64));
  const strength = clamp01(options?.strength ?? 1);
  const preserveLineartLuminance = options?.preserveLineartLuminance ?? true;
  const statOpts = {
    alphaThreshold: options?.alphaThreshold ?? 0.05,
    excludeLineartMaxL: options?.lineartMaxLuminance ?? DEFAULT_LINEART_MAX_LUMINANCE,
  };

  const sourceStats = computeOklabChannelStats(sourceRgba, statOpts);
  const referenceStats = computeOklabChannelStats(referenceRgba, statOpts);
  const celRamp = extractCelShadingRamp(referenceRgba, statOpts);
  const mkMap = (options?.chromaCovarianceTransfer ?? true)
    ? computeMongeKantorovichMap(sourceStats, referenceStats)
    : null;

  const data = new Float32Array(gridSize * gridSize * gridSize * 3);
  const denom = gridSize - 1;
  for (let bIdx = 0; bIdx < gridSize; bIdx += 1) {
    const bNorm = bIdx / denom;
    for (let gIdx = 0; gIdx < gridSize; gIdx += 1) {
      const gNorm = gIdx / denom;
      for (let rIdx = 0; rIdx < gridSize; rIdx += 1) {
        const srcLab = srgbToOklab({ r: rIdx / denom, g: gNorm, b: bNorm });
        const mapped = oklabToSrgb(transferWithCachedMap(srcLab, sourceStats, referenceStats, mkMap, options));
        const offset = ((bIdx * gridSize + gIdx) * gridSize + rIdx) * 3;
        data[offset] = mapped.r;
        data[offset + 1] = mapped.g;
        data[offset + 2] = mapped.b;
      }
    }
  }

  return { gridSize, data, strength, preserveLineartLuminance, sourceStats, referenceStats, celRamp };
}

/** 3D 스타일 LUT에서 삼선형 보간(Trilinear Interpolation)으로 sRGB 색상을 샘플링한다. */
export function sampleStyleLut3D(lut: StyleLut3D, color: SrgbColor): SrgbColor {
  const n = lut.gridSize;
  const maxIdx = n - 1;
  const rS = clamp01(color.r) * maxIdx;
  const gS = clamp01(color.g) * maxIdx;
  const bS = clamp01(color.b) * maxIdx;

  const r0 = Math.min(maxIdx, Math.floor(rS));
  const g0 = Math.min(maxIdx, Math.floor(gS));
  const b0 = Math.min(maxIdx, Math.floor(bS));
  const r1 = Math.min(maxIdx, r0 + 1);
  const g1 = Math.min(maxIdx, g0 + 1);
  const b1 = Math.min(maxIdx, b0 + 1);
  const fr = rS - r0;
  const fg = gS - g0;
  const fb = bS - b0;

  const read = (ri: number, gi: number, bi: number, ch: number): number =>
    lut.data[((bi * n + gi) * n + ri) * 3 + ch] ?? 0;

  const interp = (ch: number): number => {
    const c00 = read(r0, g0, b0, ch) * (1 - fr) + read(r1, g0, b0, ch) * fr;
    const c10 = read(r0, g1, b0, ch) * (1 - fr) + read(r1, g1, b0, ch) * fr;
    const c01 = read(r0, g0, b1, ch) * (1 - fr) + read(r1, g0, b1, ch) * fr;
    const c11 = read(r0, g1, b1, ch) * (1 - fr) + read(r1, g1, b1, ch) * fr;
    const c0 = c00 * (1 - fg) + c10 * fg;
    const c1 = c01 * (1 - fg) + c11 * fg;
    return clamp01(c0 * (1 - fb) + c1 * fb);
  };

  return { r: interp(0), g: interp(1), b: interp(2) };
}

/** 에피소드 캔버스 RGBA 버퍼에 레퍼런스 스타일 3D LUT를 적용하고 먹선 보존 지표를 반환한다. */
export function applyEpisodeStyleTransfer(
  sourceRgba: Float32Array,
  width: number,
  height: number,
  referenceRgba: Float32Array,
  options?: StyleTransferBakeOptions,
): EpisodeStyleTransferResult {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const pixelCount = safeW * safeH;
  const lut = bakeStyleTransferLut3D(sourceRgba, referenceRgba, options);
  const outRgba = new Float32Array(pixelCount * 4);
  const lineartMaxL = options?.lineartMaxLuminance ?? DEFAULT_LINEART_MAX_LUMINANCE;
  const preserveInk = options?.preserveLineartLuminance ?? true;

  let preservedInkPixelCount = 0;
  let deltaSum = 0;
  let opaqueCount = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const base = i * 4;
    const srcColor: SrgbColor = {
      r: clamp01(sourceRgba[base] ?? 0),
      g: clamp01(sourceRgba[base + 1] ?? 0),
      b: clamp01(sourceRgba[base + 2] ?? 0),
    };
    const alpha = clamp01(sourceRgba[base + 3] ?? 1);
    const srcLab = srgbToOklab(srcColor);
    const isInk = preserveInk && alpha >= 0.05 && srcLab.l <= lineartMaxL;
    const mapped = isInk ? srcColor : sampleStyleLut3D(lut, srcColor);
    if (isInk) preservedInkPixelCount += 1;

    outRgba[base] = mapped.r;
    outRgba[base + 1] = mapped.g;
    outRgba[base + 2] = mapped.b;
    outRgba[base + 3] = alpha;

    if (alpha >= 0.05) {
      const dstLab = srgbToOklab(mapped);
      deltaSum += Math.hypot(dstLab.l - srcLab.l, dstLab.a - srcLab.a, dstLab.b - srcLab.b);
      opaqueCount += 1;
    }
  }

  return {
    width: safeW,
    height: safeH,
    rgba: outRgba,
    lut,
    preservedInkPixelCount,
    meanDeltaOklab: opaqueCount > 0 ? deltaSum / opaqueCount : 0,
  };
}
