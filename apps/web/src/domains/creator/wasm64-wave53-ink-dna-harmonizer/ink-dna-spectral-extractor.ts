/**
 * Wave-53: 제로샷 작화 DNA 스펙트럼 추출기 (`ink-dna-spectral-extractor`).
 *
 * `128×128` 손그림 RGBA 샘플 버퍼와 참조 벡터 스트로크에서 선폭 분포, 고주파 가장자리 거칠기,
 * 필압 테이퍼 감마, 잉크 농도 바닥값, 미세 번짐 반경, 2D FFT 종이 결 스펙트럼을 결정론적으로 추출한다.
 */

export const DEFAULT_DNA_SAMPLE_SIZE = 128;
export const DEFAULT_INK_LUMINANCE_THRESHOLD = 0.62;
export const DEFAULT_PAPER_LUMINANCE_THRESHOLD = 0.78;
export const DEFAULT_MIN_SAMPLE_ALPHA = 0.25;

export interface InkSampleRgbaBuffer {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray | Uint8Array;
}

export interface VectorStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly widthPx: number;
  readonly opacity?: number;
}

export interface ReferenceVectorStroke {
  readonly id: string;
  readonly points: readonly VectorStrokePoint[];
  readonly sourceKind?: "hand-drawn" | "assistant" | "3d-extracted";
  readonly microBleedRadiusPx?: number;
}

export interface PaperGrainSpectrum {
  /** 초저·저·중·고 4개 방사 주파수 대역 에너지 비율 (합=1, 무지 종이는 0) */
  readonly radialBandEnergy: readonly [number, number, number, number];
  /** 지배적 종이 결·해칭 공간 주기 (px, 무지 종이는 0) */
  readonly dominantPeriodPx: number;
  /** 주 결·해칭 방향각 (라디안, [0..π)) */
  readonly dominantAngleRad: number;
  /** 방향성 이방성 [0..1] (0=등방성 종이 결, 1=강한 단방향 해칭) */
  readonly anisotropy: number;
  /** 종이 바탕 결 진폭 [0..1] */
  readonly grainAmplitude: number;
}

export interface InkStyleFeatureVector {
  readonly strokeWidthMeanPx: number;
  readonly strokeWidthVariancePx2: number;
  readonly edgeRoughnessIndex: number;
  readonly pressureTaperGamma: number;
  readonly inkDensityFloor: number;
  readonly microBleedRadiusPx: number;
}

export interface InkDnaProfile extends InkStyleFeatureVector {
  readonly sampleWidth: number;
  readonly sampleHeight: number;
  readonly paperGrainSpectrum: PaperGrainSpectrum;
  readonly inkPixelCount: number;
  readonly referenceStrokeCount: number;
  readonly dnaSignature: string;
}

export interface InkDnaExtractionOptions {
  readonly inkLuminanceThreshold?: number;
  readonly paperLuminanceThreshold?: number;
  readonly minAlpha?: number;
}

const EMPTY_SPECTRUM: PaperGrainSpectrum = {
  radialBandEnergy: [0, 0, 0, 0],
  dominantPeriodPx: 0,
  dominantAngleRad: 0,
  anisotropy: 0,
  grainAmplitude: 0,
};

function clamp01(v: number): number {
  return !Number.isFinite(v) || v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function clampRange(v: number, min: number, max: number): number {
  return !Number.isFinite(v) || v < min ? min : v > max ? max : v;
}

function validateSampleBuffer(sample: InkSampleRgbaBuffer): void {
  if (!Number.isInteger(sample.width) || !Number.isInteger(sample.height) || sample.width < 16 || sample.height < 16) {
    throw new Error("작화 DNA 샘플 해상도는 16×16 이상의 정수여야 합니다.");
  }
  const expected = sample.width * sample.height * 4;
  if (sample.rgba.length !== expected) {
    throw new Error(`RGBA 버퍼 길이(${sample.rgba.length})가 해상도(${sample.width}×${sample.height}×4=${expected})와 일치하지 않습니다.`);
  }
}

/** 1D 기수-2 Cooley-Tukey 고속 푸리에 변환(in-place). */
function fft1dInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    while ((j & bit) !== 0) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      const tr = re[i] ?? 0; const ti = im[i] ?? 0;
      re[i] = re[j] ?? 0; im[i] = im[j] ?? 0;
      re[j] = tr; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const wsRe = Math.cos((-2 * Math.PI) / len);
    const wsIm = Math.sin((-2 * Math.PI) / len);
    for (let start = 0; start < n; start += len) {
      let wRe = 1; let wIm = 0;
      for (let k = 0; k < half; k += 1) {
        const e = start + k; const o = e + half;
        const oRe = re[o] ?? 0; const oIm = im[o] ?? 0;
        const tRe = wRe * oRe - wIm * oIm; const tIm = wRe * oIm + wIm * oRe;
        const eRe = re[e] ?? 0; const eIm = im[e] ?? 0;
        re[e] = eRe + tRe; im[e] = eIm + tIm;
        re[o] = eRe - tRe; im[o] = eIm - tIm;
        const nextRe = wRe * wsRe - wIm * wsIm;
        wIm = wRe * wsIm + wIm * wsRe; wRe = nextRe;
      }
    }
  }
}

/** 2D FFT로 종이 바탕 영역의 방사 주파수 대역·지배 주기·방향 이방성을 산출한다. */
function analyzePaperGrainSpectrum(
  luminance: Float32Array,
  paperMask: Uint8Array,
  width: number,
  height: number,
): PaperGrainSpectrum {
  let paperSum = 0; let paperCount = 0;
  for (let i = 0; i < paperMask.length; i += 1) {
    if ((paperMask[i] ?? 0) === 1) { paperSum += luminance[i] ?? 1; paperCount += 1; }
  }
  if (paperCount < 16) return EMPTY_SPECTRUM;
  const mean = paperSum / paperCount;
  let varSum = 0;
  for (let i = 0; i < paperMask.length; i += 1) {
    if ((paperMask[i] ?? 0) === 1) varSum += ((luminance[i] ?? mean) - mean) ** 2;
  }
  const std = Math.sqrt(varSum / paperCount);
  if (std < 1e-4) return EMPTY_SPECTRUM;
  const grainAmplitude = clamp01(std * 6.5);

  let n = 16;
  while (n * 2 <= Math.min(width, height, DEFAULT_DNA_SAMPLE_SIZE)) n *= 2;
  const ox = Math.floor((width - n) / 2); const oy = Math.floor((height - n) / 2);
  const re = new Float64Array(n * n); const im = new Float64Array(n * n);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const s = (oy + y) * width + (ox + x);
      re[y * n + x] = (paperMask[s] ?? 0) === 1 ? (luminance[s] ?? mean) - mean : 0;
    }
  }

  const bufRe = new Float64Array(n); const bufIm = new Float64Array(n);
  const transformPass = (transpose: boolean): void => {
    for (let a = 0; a < n; a += 1) {
      for (let b = 0; b < n; b += 1) {
        const idx = transpose ? b * n + a : a * n + b;
        bufRe[b] = re[idx] ?? 0; bufIm[b] = im[idx] ?? 0;
      }
      fft1dInPlace(bufRe, bufIm);
      for (let b = 0; b < n; b += 1) {
        const idx = transpose ? b * n + a : a * n + b;
        re[idx] = bufRe[b] ?? 0; im[idx] = bufIm[b] ?? 0;
      }
    }
  };
  transformPass(false);
  transformPass(true);

  const bands: [number, number, number, number] = [0, 0, 0, 0];
  const half = n / 2;
  let total = 0; let peakE = 0; let peakFreq = 0; let peakNormal = 0;
  let cos2Sum = 0; let sin2Sum = 0;
  for (let v = 0; v < n; v += 1) {
    const fv = v <= half ? v : v - n;
    for (let u = 0; u < n; u += 1) {
      const fu = u <= half ? u : u - n;
      const r = Math.hypot(fu, fv);
      if (r < 1 || r > half) continue;
      const idx = v * n + u;
      const power = (re[idx] ?? 0) ** 2 + (im[idx] ?? 0) ** 2;
      if (power <= 0) continue;
      total += power;
      bands[r / half < 0.25 ? 0 : r / half < 0.5 ? 1 : r / half < 0.75 ? 2 : 3] += power;
      const angle = Math.atan2(fv, fu);
      cos2Sum += power * Math.cos(2 * angle); sin2Sum += power * Math.sin(2 * angle);
      if (power > peakE) { peakE = power; peakFreq = r; peakNormal = angle; }
    }
  }
  if (total <= 1e-12) return { ...EMPTY_SPECTRUM, grainAmplitude };
  const rawAngle = (peakNormal + Math.PI / 2) % Math.PI;
  return {
    radialBandEnergy: [bands[0] / total, bands[1] / total, bands[2] / total, bands[3] / total],
    dominantPeriodPx: peakFreq > 0 ? n / peakFreq : 0,
    dominantAngleRad: rawAngle < 0 ? rawAngle + Math.PI : rawAngle,
    anisotropy: clamp01(Math.hypot(cos2Sum, sin2Sum) / total),
    grainAmplitude,
  };
}

/** 2-패스 Chamfer 거리장으로 잉크 내부 픽셀에서 배경까지의 최단 거리를 계산한다. */
function computeInsideInkDistance(inkMask: Uint8Array, width: number, height: number): Float32Array {
  const size = width * height;
  const dist = new Float32Array(size);
  const inf = width + height;
  for (let i = 0; i < size; i += 1) dist[i] = (inkMask[i] ?? 0) === 1 ? inf : 0;
  const relax = (y: number, x: number, stepX: number, stepY: number): void => {
    const i = y * width + x;
    let d = dist[i] ?? 0;
    if (d === 0) return;
    const nx = x + stepX; const ny = y + stepY;
    if (nx >= 0 && nx < width) d = Math.min(d, (dist[y * width + nx] ?? inf) + 1);
    if (ny >= 0 && ny < height) {
      d = Math.min(d, (dist[ny * width + x] ?? inf) + 1);
      if (x > 0) d = Math.min(d, (dist[ny * width + x - 1] ?? inf) + Math.SQRT2);
      if (x + 1 < width) d = Math.min(d, (dist[ny * width + x + 1] ?? inf) + Math.SQRT2);
    }
    dist[i] = d;
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) relax(y, x, -1, -1);
  for (let y = height - 1; y >= 0; y -= 1) for (let x = width - 1; x >= 0; x -= 1) relax(y, x, 1, 1);
  return dist;
}

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = clamp01(q) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return (sorted[lo] ?? 0) * (1 - (pos - lo)) + (sorted[hi] ?? 0) * (pos - lo);
}

/** 참조 벡터 스트로크 집합에서 선폭 분포·고주파 거칠기·테이퍼 감마·농도 바닥값을 계측한다. */
export function measureVectorStrokeMetrics(strokes: readonly ReferenceVectorStroke[]): InkStyleFeatureVector {
  const widths: number[] = [];
  const opacities: number[] = [];
  const bleeds: number[] = [];
  let turnDiffSum = 0; let turnDiffCount = 0;
  let widthJitterSum = 0; let widthJitterCount = 0;
  let logNum = 0; let logDen = 0;

  for (const stroke of strokes) {
    if (stroke.microBleedRadiusPx !== undefined && Number.isFinite(stroke.microBleedRadiusPx)) {
      bleeds.push(Math.max(0, stroke.microBleedRadiusPx));
    }
    const pts = stroke.points;
    if (pts.length === 0) continue;
    const cumLen = new Float64Array(pts.length);
    let maxW = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      if (!p) continue;
      const w = Math.max(0.1, Number.isFinite(p.widthPx) ? p.widthPx : 1);
      widths.push(w);
      if (w > maxW) maxW = w;
      opacities.push(clamp01(p.opacity ?? 1));
      if (i > 0) {
        const prev = pts[i - 1];
        cumLen[i] = (cumLen[i - 1] ?? 0) + Math.hypot(p.x - (prev?.x ?? p.x), p.y - (prev?.y ?? p.y));
      }
    }
    const totalLen = cumLen[pts.length - 1] ?? 0;
    const turns: number[] = [];
    for (let i = 1; i + 1 < pts.length; i += 1) {
      const a = pts[i - 1]; const b = pts[i]; const c = pts[i + 1];
      if (!a || !b || !c) continue;
      const dx0 = b.x - a.x; const dy0 = b.y - a.y; const dx1 = c.x - b.x; const dy1 = c.y - b.y;
      if (Math.hypot(dx0, dy0) > 1e-4 && Math.hypot(dx1, dy1) > 1e-4) {
        turns.push(Math.atan2(dx0 * dy1 - dy0 * dx1, dx0 * dx1 + dy0 * dy1));
      }
      widthJitterSum += Math.abs(Math.max(0.1, c.widthPx) - 2 * Math.max(0.1, b.widthPx) + Math.max(0.1, a.widthPx)) / Math.max(0.5, maxW);
      widthJitterCount += 1;
    }
    for (let i = 1; i < turns.length; i += 1) { turnDiffSum += Math.abs((turns[i] ?? 0) - (turns[i - 1] ?? 0)); turnDiffCount += 1; }
    if (totalLen > 1e-3 && maxW > 0.1 && pts.length >= 3) {
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        if (!p) continue;
        const dEnd = Math.min((cumLen[i] ?? 0) / totalLen, 1 - (cumLen[i] ?? 0) / totalLen);
        if (dEnd <= 0.005 || dEnd >= 0.25) continue;
        const lnT = Math.log(clampRange(dEnd / 0.25, 0.05, 0.98));
        logNum += lnT * Math.log(clampRange(p.widthPx / maxW, 0.05, 1));
        logDen += lnT * lnT;
      }
    }
  }
  if (widths.length === 0) {
    return { strokeWidthMeanPx: 0, strokeWidthVariancePx2: 0, edgeRoughnessIndex: 0, pressureTaperGamma: 0.1, inkDensityFloor: 1, microBleedRadiusPx: 0 };
  }
  const meanW = widths.reduce((a, w) => a + w, 0) / widths.length;
  const varianceW = widths.reduce((a, w) => a + (w - meanW) ** 2, 0) / widths.length;
  opacities.sort((a, b) => a - b);
  return {
    strokeWidthMeanPx: meanW,
    strokeWidthVariancePx2: varianceW,
    edgeRoughnessIndex: clamp01((turnDiffCount > 0 ? turnDiffSum / turnDiffCount : 0) * 1.35 + (widthJitterCount > 0 ? widthJitterSum / widthJitterCount : 0) * 1.15),
    pressureTaperGamma: logDen > 1e-6 ? clampRange(logNum / logDen, 0.1, 3.0) : 0.1,
    inkDensityFloor: clampRange(percentile(opacities, 0.15), 0.1, 1),
    microBleedRadiusPx: bleeds.length > 0 ? bleeds.reduce((a, v) => a + v, 0) / bleeds.length : 0,
  };
}

function hashSignature(values: readonly number[]): string {
  let h = 0x811c9dc5;
  for (const value of values) {
    const q = Math.round((Number.isFinite(value) ? value : 0) * 10_000);
    h = Math.imul(h ^ (q & 0xff), 0x01000193);
    h = Math.imul(h ^ ((q >>> 8) & 0xff), 0x01000193);
    h = Math.imul(h ^ ((q >>> 16) & 0xff), 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** 두 작화 특성 벡터 사이의 정규화된 지각 스타일 거리를 산출한다. */
export function computeStyleFeatureDistance(a: InkStyleFeatureVector, b: InkStyleFeatureVector): number {
  const dw = (a.strokeWidthMeanPx - b.strokeWidthMeanPx) / 3.0;
  const ds = (Math.sqrt(Math.max(0, a.strokeWidthVariancePx2)) - Math.sqrt(Math.max(0, b.strokeWidthVariancePx2))) / 1.5;
  const dr = (a.edgeRoughnessIndex - b.edgeRoughnessIndex) / 0.25;
  const dt = (a.pressureTaperGamma - b.pressureTaperGamma) / 0.85;
  const df = (a.inkDensityFloor - b.inkDensityFloor) / 0.2;
  const db = (a.microBleedRadiusPx - b.microBleedRadiusPx) / 1.0;
  return Math.sqrt((dw * dw + ds * ds + dr * dr * 1.4 + dt * dt * 1.2 + df * df + db * db * 0.8) / 6.4);
}

/** 두 `InkDnaProfile` 사이의 종합 스타일 거리(필치 + 종이 결 스펙트럼)를 산출한다. */
export function computeInkStyleDistance(a: InkDnaProfile, b: InkDnaProfile): number {
  const dGrain = (a.paperGrainSpectrum.grainAmplitude - b.paperGrainSpectrum.grainAmplitude) / 0.35;
  const dAniso = (a.paperGrainSpectrum.anisotropy - b.paperGrainSpectrum.anisotropy) / 0.4;
  return Math.hypot(computeStyleFeatureDistance(a, b), Math.hypot(dGrain, dAniso) * 0.35);
}

/** `128×128` 손그림 RGBA 샘플과 참조 벡터 스트로크에서 작가 고유의 `InkDnaProfile`을 추출한다. */
export function extractInkDnaProfile(
  sample: InkSampleRgbaBuffer,
  referenceStrokes: readonly ReferenceVectorStroke[] = [],
  options: InkDnaExtractionOptions = {},
): InkDnaProfile {
  validateSampleBuffer(sample);
  const { width, height, rgba } = sample;
  const inkMaxY = clampRange(options.inkLuminanceThreshold ?? DEFAULT_INK_LUMINANCE_THRESHOLD, 0.1, 0.9);
  const paperMinY = clampRange(options.paperLuminanceThreshold ?? DEFAULT_PAPER_LUMINANCE_THRESHOLD, inkMaxY + 0.05, 0.98);
  const minAlpha = clampRange(options.minAlpha ?? DEFAULT_MIN_SAMPLE_ALPHA, 0.01, 1);

  const count = width * height;
  const luminance = new Float32Array(count); const darkness = new Float32Array(count);
  const inkMask = new Uint8Array(count); const paperMask = new Uint8Array(count);
  let inkPixelCount = 0; let paperLumSum = 0; let paperLumCount = 0;

  for (let i = 0; i < count; i += 1) {
    const base = i * 4;
    const a = (rgba[base + 3] ?? 255) / 255;
    const rawY = (0.2126 * (rgba[base] ?? 255) + 0.7152 * (rgba[base + 1] ?? 255) + 0.0722 * (rgba[base + 2] ?? 255)) / 255;
    const effY = a < minAlpha ? 1 : rawY * a + (1 - a);
    luminance[i] = effY; darkness[i] = 1 - effY;
    if (effY <= inkMaxY) { inkMask[i] = 1; inkPixelCount += 1; }
    else if (effY >= paperMinY) { paperMask[i] = 1; paperLumSum += effY; paperLumCount += 1; }
  }

  const paperGrainSpectrum = analyzePaperGrainSpectrum(luminance, paperMask, width, height);
  const insideDist = computeInsideInkDistance(inkMask, width, height);
  const haloFloor = (paperLumCount > 0 ? 1 - paperLumSum / paperLumCount : 0) + 0.04;
  const inkMinDarkness = 1 - inkMaxY;

  const ridgeWidths: number[] = []; const coreDarkness: number[] = []; const boundaryDarkness: number[] = [];
  // 얇은 선의 양쪽 경계가 서로 상쇄되지 않도록 2배각 축방향(cos 2θ, sin 2θ)으로 법선 방향을 누적한다.
  const axialX = new Float32Array(count); const axialY = new Float32Array(count); const isBoundary = new Uint8Array(count);
  let boundaryCount = 0; let bleedWeightedArea = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x; const d = darkness[i] ?? 0;
      const gx = -(darkness[i - width - 1] ?? 0) + (darkness[i - width + 1] ?? 0) - 2 * (darkness[i - 1] ?? 0) + 2 * (darkness[i + 1] ?? 0) - (darkness[i + width - 1] ?? 0) + (darkness[i + width + 1] ?? 0);
      const gy = -(darkness[i - width - 1] ?? 0) - 2 * (darkness[i - width] ?? 0) - (darkness[i - width + 1] ?? 0) + (darkness[i + width - 1] ?? 0) + 2 * (darkness[i + width] ?? 0) + (darkness[i + width + 1] ?? 0);
      const mag2 = gx * gx + gy * gy;
      if (mag2 > 1e-8) { axialX[i] = (gx * gx - gy * gy) / mag2; axialY[i] = (2 * gx * gy) / mag2; }
      if ((inkMask[i] ?? 0) === 1) {
        const touchesBg = (inkMask[i - 1] ?? 0) === 0 || (inkMask[i + 1] ?? 0) === 0 || (inkMask[i - width] ?? 0) === 0 || (inkMask[i + width] ?? 0) === 0;
        if (touchesBg) { isBoundary[i] = 1; boundaryCount += 1; boundaryDarkness.push(d); } else { coreDarkness.push(d); }
        const dv = insideDist[i] ?? 0;
        if (dv >= Math.max(insideDist[i - 1] ?? 0, insideDist[i + 1] ?? 0, insideDist[i - width] ?? 0, insideDist[i + width] ?? 0) - 0.05) {
          ridgeWidths.push(Math.max(1, dv * 2));
        }
      } else if (d > haloFloor && d < inkMinDarkness) {
        const nearInk =
          (inkMask[i - 1] ?? 0) === 1 || (inkMask[i + 1] ?? 0) === 1 || (inkMask[i - width] ?? 0) === 1 || (inkMask[i + width] ?? 0) === 1 ||
          (darkness[i - 1] ?? 0) > haloFloor || (darkness[i + 1] ?? 0) > haloFloor || (darkness[i - width] ?? 0) > haloFloor || (darkness[i + width] ?? 0) > haloFloor;
        if (nearInk) bleedWeightedArea += (d - haloFloor) / Math.max(0.05, inkMinDarkness - haloFloor);
      }
    }
  }

  let axialJitterSum = 0; let axialJitterCount = 0;
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      if ((isBoundary[y * width + x] ?? 0) === 0) continue;
      let sx = 0; let sy = 0; let nCount = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const ni = (y + dy) * width + (x + dx);
          if ((isBoundary[ni] ?? 0) === 1) { sx += axialX[ni] ?? 0; sy += axialY[ni] ?? 0; nCount += 1; }
        }
      }
      if (nCount >= 3) { axialJitterSum += clamp01(1 - Math.hypot(sx, sy) / nCount); axialJitterCount += 1; }
    }
  }

  const rasterMeanW = ridgeWidths.length > 0 ? ridgeWidths.reduce((a, v) => a + v, 0) / ridgeWidths.length : 0;
  const rasterVarW = ridgeWidths.length > 0 ? ridgeWidths.reduce((a, v) => a + (v - rasterMeanW) ** 2, 0) / ridgeWidths.length : 0;
  const bMean = boundaryDarkness.length > 0 ? boundaryDarkness.reduce((a, v) => a + v, 0) / boundaryDarkness.length : 0;
  const boundaryDarkStd = boundaryDarkness.length > 1 ? Math.sqrt(boundaryDarkness.reduce((a, v) => a + (v - bMean) ** 2, 0) / boundaryDarkness.length) : 0;
  const rasterRoughness = clamp01((axialJitterCount > 0 ? axialJitterSum / axialJitterCount : 0) * 2.2 + boundaryDarkStd * 2.4);

  const floorSamples = coreDarkness.length >= 8 ? coreDarkness : boundaryDarkness;
  floorSamples.sort((a, b) => a - b);
  const rasterFloor = floorSamples.length > 0 ? clampRange(percentile(floorSamples, 0.15), 0.1, 1) : 1;
  const rasterBleed = boundaryCount > 0 ? clampRange((bleedWeightedArea / boundaryCount) * 2.6, 0, 6) : 0;
  const rasterGamma = ridgeWidths.length >= 4 ? clampRange(0.15 + (Math.sqrt(rasterVarW) / Math.max(0.8, rasterMeanW)) * 2.1, 0.1, 3.0) : 0.1;

  const vec = referenceStrokes.some((s) => s.points.length >= 2) ? measureVectorStrokeMetrics(referenceStrokes) : null;
  const hasInk = inkPixelCount >= 8;
  const strokeWidthMeanPx = hasInk && vec ? rasterMeanW * 0.45 + vec.strokeWidthMeanPx * 0.55 : vec ? vec.strokeWidthMeanPx : rasterMeanW;
  const strokeWidthVariancePx2 = hasInk && vec ? rasterVarW * 0.45 + vec.strokeWidthVariancePx2 * 0.55 : vec ? vec.strokeWidthVariancePx2 : rasterVarW;
  const edgeRoughnessIndex = hasInk && vec ? clamp01(rasterRoughness * 0.5 + vec.edgeRoughnessIndex * 0.5) : vec ? vec.edgeRoughnessIndex : rasterRoughness;
  const pressureTaperGamma = vec ? vec.pressureTaperGamma : rasterGamma;
  const inkDensityFloor = hasInk ? rasterFloor : (vec?.inkDensityFloor ?? 1);
  const microBleedRadiusPx = hasInk ? rasterBleed : (vec?.microBleedRadiusPx ?? 0);

  return {
    sampleWidth: width, sampleHeight: height,
    strokeWidthMeanPx, strokeWidthVariancePx2, edgeRoughnessIndex, pressureTaperGamma, inkDensityFloor, microBleedRadiusPx,
    paperGrainSpectrum, inkPixelCount, referenceStrokeCount: referenceStrokes.length,
    dnaSignature: hashSignature([
      strokeWidthMeanPx, strokeWidthVariancePx2, edgeRoughnessIndex, pressureTaperGamma, inkDensityFloor, microBleedRadiusPx,
      paperGrainSpectrum.dominantPeriodPx, paperGrainSpectrum.dominantAngleRad, paperGrainSpectrum.anisotropy, paperGrainSpectrum.grainAmplitude,
    ]),
  };
}
