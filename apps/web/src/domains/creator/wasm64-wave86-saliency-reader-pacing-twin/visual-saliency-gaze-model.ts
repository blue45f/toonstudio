/**
 * Wave 86 — 프라이버시 안전 로컬 시각 현저성(Visual Saliency) 및 예측 시선 경로(Scanpath) 모델.
 *
 * 독자 개인정보나 실측 아이트래킹 로그를 수집·전송하지 않고 로컬 컷 RGBA 버퍼만으로
 * Itti-Koch 다중 스케일 중심-주변(휘도·R-G·B-Y 색채 대립), 4방향 엣지 오리엔테이션,
 * Hou-Zhang 2D FFT 스펙트럼 잔차, 대비 검증 말풍선·얼굴 사전을 결합해 시선 집중 지도를 추정한다.
 */

export interface VisualSaliencyPrivacyBase {
  readonly readerPiiCollected: false;
  readonly externalTelemetryUpload: false;
  readonly modelSource: "local-itti-koch-spectral-residual";
  readonly isSimulationEstimate: true;
}

export interface VisualSaliencyPrivacyGuarantee extends VisualSaliencyPrivacyBase {
  readonly processingScope: "local-on-device-panel-buffer";
  readonly disclaimerKo: string;
}

export const LOCAL_VISUAL_SALIENCY_PRIVACY_GUARANTEE: VisualSaliencyPrivacyGuarantee = {
  readerPiiCollected: false,
  externalTelemetryUpload: false,
  modelSource: "local-itti-koch-spectral-residual",
  processingScope: "local-on-device-panel-buffer",
  isSimulationEstimate: true,
  disclaimerKo:
    "독자 개인정보나 실제 시선 추적 로그를 수집·전송하지 않고 로컬 컷 화소로만 계산한 시각 현저성 추정치입니다.",
};

export interface RgbaPanelBuffer { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray | Uint8Array; }
export interface PanelRectPx { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface SpeechBalloonRegionInput { readonly id: string; readonly readingOrder: number; readonly bounds: PanelRectPx; readonly textCharCount?: number; readonly isPrimary?: boolean; readonly labelKo?: string; }
export interface FaceAnchorRegionInput { readonly id: string; readonly bounds: PanelRectPx; readonly eyeLineYRatio?: number; readonly prominence?: number; }
export interface FocalSubjectRegionInput { readonly id: string; readonly bounds: PanelRectPx; readonly kind: "speech-balloon" | "character-face" | "action-focal"; readonly labelKo?: string; }
export interface SaliencyFeatureWeights { readonly intensity: number; readonly colorOpponency: number; readonly orientation: number; readonly spectralResidual: number; readonly semanticPrior: number; }

export const DEFAULT_SALIENCY_FEATURE_WEIGHTS: SaliencyFeatureWeights = {
  intensity: 0.3,
  colorOpponency: 0.24,
  orientation: 0.2,
  spectralResidual: 0.14,
  semanticPrior: 0.12,
};

export interface VisualSaliencyOptions {
  readonly workingMaxDim?: number;
  readonly maxFixations?: number;
  readonly iorRadiusPx?: number;
  readonly iorSuppressionStrength?: number;
  readonly minFixationScore?: number;
  readonly speechBalloons?: readonly SpeechBalloonRegionInput[];
  readonly faceAnchors?: readonly FaceAnchorRegionInput[];
  readonly focalSubjects?: readonly FocalSubjectRegionInput[];
  readonly featureWeights?: Partial<SaliencyFeatureWeights>;
}

export type FixationTargetKind = "speech-balloon" | "character-face" | "action-focal" | "background-clutter";
export type BalloonGazeAuditSeverity = "pass" | "caution" | "hijack";

export interface PredictedFixationPoint {
  readonly rank: number;
  readonly x: number;
  readonly y: number;
  readonly normX: number;
  readonly normY: number;
  readonly score: number;
  readonly estimatedFixationMs: number;
  readonly quadrantKo: string;
  readonly matchedTargetKind: FixationTargetKind;
  readonly matchedTargetId: string | null;
}

export interface SaliencyChannelSummary {
  readonly intensityMean: number;
  readonly colorOpponencyMean: number;
  readonly orientationMean: number;
  readonly spectralResidualMean: number;
  readonly semanticPriorMean: number;
}

export interface PanelVisualSaliencyResult extends VisualSaliencyPrivacyBase {
  readonly privacy: VisualSaliencyPrivacyGuarantee;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly heatmapWidth: number;
  readonly heatmapHeight: number;
  readonly heatmap: Float32Array;
  readonly peakSaliency: number;
  readonly meanSaliency: number;
  readonly iorRadiusPx: number;
  readonly scanpath: readonly PredictedFixationPoint[];
  readonly channelSummary: SaliencyChannelSummary;
}

export interface BalloonGazeAuditInput {
  readonly panel?: RgbaPanelBuffer;
  readonly saliency?: PanelVisualSaliencyResult;
  readonly speechBalloons: readonly SpeechBalloonRegionInput[];
  readonly faceAnchors?: readonly FaceAnchorRegionInput[];
  readonly focalSubjects?: readonly FocalSubjectRegionInput[];
  readonly saliencyOptions?: VisualSaliencyOptions;
  readonly distractionRatioThreshold?: number;
}

export interface BalloonGazeAuditResult extends VisualSaliencyPrivacyBase {
  readonly privacy: VisualSaliencyPrivacyGuarantee;
  readonly primaryBalloonId: string | null;
  readonly backgroundHijackDetected: boolean;
  readonly severity: BalloonGazeAuditSeverity;
  readonly balloonGazeRank: number | null;
  readonly firstFixationTargetKind: FixationTargetKind | null;
  readonly primaryBalloonPeakSaliency: number;
  readonly primaryBalloonMeanSaliency: number;
  readonly backgroundPeakSaliency: number;
  readonly backgroundPeakPoint: {
    readonly x: number;
    readonly y: number;
    readonly normX: number;
    readonly normY: number;
    readonly quadrantKo: string;
  } | null;
  readonly distractionRatio: number;
  readonly guidanceKo: string;
  readonly saliency: PanelVisualSaliencyResult;
}

const clamp = (v: number, lo: number, hi: number): number =>
  !Number.isFinite(v) ? lo : v < lo ? lo : v > hi ? hi : v;

const pointInsideRect = (x: number, y: number, r: PanelRectPx, m = 0): boolean =>
  x >= r.x - m && x <= r.x + r.width + m && y >= r.y - m && y <= r.y + r.height + m;

function validatePanelBuffer(panel: RgbaPanelBuffer): void {
  if (!Number.isInteger(panel.width) || !Number.isInteger(panel.height)) {
    throw new Error("웹툰 컷 버퍼의 width와 height는 양의 정수여야 합니다.");
  }
  if (panel.width < 4 || panel.height < 4) {
    throw new Error("시각 현저성 분석은 최소 4×4 화소 이상의 컷 버퍼가 필요합니다.");
  }
  const req = panel.width * panel.height * 4;
  if (panel.data.length < req) {
    throw new Error(`RGBA 버퍼 길이가 부족합니다: 필요=${req}바이트, 실제=${panel.data.length}바이트`);
  }
}

/** 정규화 좌표(0..1)를 자연스러운 한글 컷 구역 이름으로 변환한다. */
export function resolveKoreanQuadrantLabel(normX: number, normY: number): string {
  const x = clamp(normX, 0, 1);
  const y = clamp(normY, 0, 1);
  const col = x < 0.36 ? "좌측" : x > 0.64 ? "우측" : "중앙";
  const row = y < 0.36 ? "상단" : y > 0.64 ? "하단" : "중단";
  if (col === "중앙" && row === "중단") return "화면 중앙";
  if (col === "중앙") return `${row} 중앙`;
  if (row === "중단") return `${col} 중단`;
  return `${col} ${row}`;
}

function extractWorkingChannels(panel: RgbaPanelBuffer, workingMaxDim: number) {
  const maxDim = Math.max(panel.width, panel.height);
  const scale = maxDim > workingMaxDim ? workingMaxDim / maxDim : 1;
  const w = Math.max(4, Math.round(panel.width * scale));
  const h = Math.max(4, Math.round(panel.height * scale));
  const luminance = new Float32Array(w * h);
  const rgOpponency = new Float32Array(w * h);
  const byOpponency = new Float32Array(w * h);
  const { width: srcW, height: srcH, data: src } = panel;
  const isNative = w === srcW && h === srcH;

  for (let y = 0; y < h; y += 1) {
    const sy0 = isNative ? y : Math.floor((y * srcH) / h);
    const sy1 = isNative ? y + 1 : Math.max(sy0 + 1, Math.floor(((y + 1) * srcH) / h));
    for (let x = 0; x < w; x += 1) {
      const sx0 = isNative ? x : Math.floor((x * srcW) / w);
      const sx1 = isNative ? x + 1 : Math.max(sx0 + 1, Math.floor(((x + 1) * srcW) / w));
      let rSum = 0, gSum = 0, bSum = 0, samples = 0;
      for (let sy = sy0; sy < sy1; sy += 1) {
        const rowOff = sy * srcW;
        for (let sx = sx0; sx < sx1; sx += 1) {
          const idx = (rowOff + sx) * 4;
          const a = (src[idx + 3] ?? 255) / 255;
          const bg = 0.5 * (1 - a);
          rSum += ((src[idx] ?? 0) / 255) * a + bg;
          gSum += ((src[idx + 1] ?? 0) / 255) * a + bg;
          bSum += ((src[idx + 2] ?? 0) / 255) * a + bg;
          samples += 1;
        }
      }
      const inv = samples > 0 ? 1 / samples : 1;
      const r = rSum * inv, g = gSum * inv, b = bSum * inv;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const outIdx = y * w + x;
      luminance[outIdx] = luma;
      const sc = (luma > 0.05 ? 1 : luma / 0.05) / Math.max(luma, 0.12);
      const rn = r * sc, gn = g * sc, bn = b * sc;
      rgOpponency[outIdx] = Math.max(0, rn - (gn + bn) * 0.5) - Math.max(0, gn - (rn + bn) * 0.5);
      byOpponency[outIdx] =
        Math.max(0, bn - (rn + gn) * 0.5) - Math.max(0, (rn + gn) * 0.5 - Math.abs(rn - gn) * 0.5 - bn);
    }
  }
  return { width: w, height: h, luminance, rgOpponency, byOpponency };
}

function separableGaussianBlur(input: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 2.5));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const val = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = val;
    sum += val;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] = (kernel[i] ?? 0) / (sum || 1);
  const temp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const off = y * w;
    for (let x = 0; x < w; x += 1) {
      let acc = 0;
      for (let k = -radius; k <= radius; k += 1) acc += (input[off + clamp(x + k, 0, w - 1)] ?? 0) * (kernel[k + radius] ?? 0);
      temp[off + x] = acc;
    }
  }
  for (let y = 0; y < h; y += 1) {
    const off = y * w;
    for (let x = 0; x < w; x += 1) {
      let acc = 0;
      for (let k = -radius; k <= radius; k += 1) acc += (temp[clamp(y + k, 0, h - 1) * w + x] ?? 0) * (kernel[k + radius] ?? 0);
      out[off + x] = acc;
    }
  }
  return out;
}

/** Itti-Koch 특징 정규화 N(M): [0, 1] 정규화 후 (1 - m̄)^2 가중으로 희소 피크 강조. */
function applyIttiKochNormalization(map: Float32Array): Float32Array {
  const out = new Float32Array(map.length);
  let maxVal = -Infinity, minVal = Infinity;
  for (let i = 0; i < map.length; i += 1) {
    const v = map[i] ?? 0;
    if (v > maxVal) maxVal = v;
    if (v < minVal) minVal = v;
  }
  const range = maxVal - minVal;
  if (!Number.isFinite(range) || range < 1e-5) return out;
  let mean = 0;
  for (let i = 0; i < map.length; i += 1) {
    const n = ((map[i] ?? 0) - minVal) / range;
    out[i] = n;
    mean += n;
  }
  const factor = Math.pow(1 - mean / map.length, 2);
  for (let i = 0; i < out.length; i += 1) out[i] = (out[i] ?? 0) * factor;
  return out;
}

function computeCenterSurroundConspicuity(channel: Float32Array, w: number, h: number): Float32Array {
  const s1 = separableGaussianBlur(channel, w, h, 1.0);
  const s2 = separableGaussianBlur(channel, w, h, 2.2);
  const s4 = separableGaussianBlur(channel, w, h, 4.5);
  const s8 = separableGaussianBlur(channel, w, h, 8.5);
  const acc = new Float32Array(w * h);
  for (const [center, surround] of [[channel, s4], [s1, s4], [s1, s8], [s2, s8]] as const) {
    const diff = new Float32Array(w * h);
    for (let i = 0; i < diff.length; i += 1) diff[i] = Math.abs((center[i] ?? 0) - (surround[i] ?? 0));
    const weighted = applyIttiKochNormalization(diff);
    for (let i = 0; i < acc.length; i += 1) acc[i] = (acc[i] ?? 0) + (weighted[i] ?? 0) * 0.25;
  }
  return applyIttiKochNormalization(acc);
}

/** 0°·45°·90°·135° 4방향 엣지 오리엔테이션 에너지 계산. */
function computeOrientationEnergyMap(luma: Float32Array, w: number, h: number): Float32Array {
  const n = w * h;
  const d0 = new Float32Array(n), d90 = new Float32Array(n), d45 = new Float32Array(n), d135 = new Float32Array(n);
  for (let y = 0; y < h; y += 1) {
    const ym1 = Math.max(0, y - 1), yp1 = Math.min(h - 1, y + 1);
    const ym2 = Math.max(0, y - 2), yp2 = Math.min(h - 1, y + 2);
    for (let x = 0; x < w; x += 1) {
      const xm1 = Math.max(0, x - 1), xp1 = Math.min(w - 1, x + 1);
      const xm2 = Math.max(0, x - 2), xp2 = Math.min(w - 1, x + 2);
      const idx = y * w + x, c = luma[idx] ?? 0;
      d0[idx] = Math.abs((luma[y * w + xp1] ?? c) - c) + Math.abs((luma[y * w + xm1] ?? c) - c) + 0.5 * Math.abs((luma[y * w + xp2] ?? c) - (luma[y * w + xm2] ?? c));
      d90[idx] = Math.abs((luma[yp1 * w + x] ?? c) - c) + Math.abs((luma[ym1 * w + x] ?? c) - c) + 0.5 * Math.abs((luma[yp2 * w + x] ?? c) - (luma[ym2 * w + x] ?? c));
      d45[idx] = Math.abs((luma[ym1 * w + xp1] ?? c) - c) + Math.abs((luma[yp1 * w + xm1] ?? c) - c);
      d135[idx] = Math.abs((luma[yp1 * w + xp1] ?? c) - c) + Math.abs((luma[ym1 * w + xm1] ?? c) - c);
    }
  }
  const combined = new Float32Array(n);
  for (const dirMap of [d0, d90, d45, d135]) {
    const norm = applyIttiKochNormalization(separableGaussianBlur(dirMap, w, h, 2.2));
    for (let i = 0; i < n; i += 1) combined[i] = (combined[i] ?? 0) + (norm[i] ?? 0) * 0.25;
  }
  return applyIttiKochNormalization(combined);
}

function fft1dRadix2(re: Float32Array, im: Float32Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i] ?? 0, ti = im[i] ?? 0;
      re[i] = re[j] ?? 0; im[i] = im[j] ?? 0; re[j] = tr; im[j] = ti;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, step = (sign * 2 * Math.PI) / len;
    const wsRe = Math.cos(step), wsIm = Math.sin(step);
    for (let start = 0; start < n; start += len) {
      let wRe = 1, wIm = 0;
      for (let k = 0; k < half; k += 1) {
        const i0 = start + k, i1 = i0 + half;
        const uRe = re[i0] ?? 0, uIm = im[i0] ?? 0;
        const vRe = (re[i1] ?? 0) * wRe - (im[i1] ?? 0) * wIm;
        const vIm = (re[i1] ?? 0) * wIm + (im[i1] ?? 0) * wRe;
        re[i0] = uRe + vRe; im[i0] = uIm + vIm; re[i1] = uRe - vRe; im[i1] = uIm - vIm;
        const nextRe = wRe * wsRe - wIm * wsIm;
        wIm = wRe * wsIm + wIm * wsRe; wRe = nextRe;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i += 1) { re[i] = (re[i] ?? 0) / n; im[i] = (im[i] ?? 0) / n; }
  }
}

function fft2dRadix2(re: Float32Array, im: Float32Array, grid: number, inverse: boolean): void {
  const bRe = new Float32Array(grid), bIm = new Float32Array(grid);
  for (let y = 0; y < grid; y += 1) {
    const off = y * grid;
    for (let x = 0; x < grid; x += 1) { bRe[x] = re[off + x] ?? 0; bIm[x] = im[off + x] ?? 0; }
    fft1dRadix2(bRe, bIm, inverse);
    for (let x = 0; x < grid; x += 1) { re[off + x] = bRe[x] ?? 0; im[off + x] = bIm[x] ?? 0; }
  }
  for (let x = 0; x < grid; x += 1) {
    for (let y = 0; y < grid; y += 1) { bRe[y] = re[y * grid + x] ?? 0; bIm[y] = im[y * grid + x] ?? 0; }
    fft1dRadix2(bRe, bIm, inverse);
    for (let y = 0; y < grid; y += 1) { re[y * grid + x] = bRe[y] ?? 0; im[y * grid + x] = bIm[y] ?? 0; }
  }
}

function bilinearResample(src: Float32Array, srcW: number, srcH: number, dstW: number, dstH: number): Float32Array {
  const out = new Float32Array(dstW * dstH);
  const sx = dstW > 1 ? (srcW - 1) / (dstW - 1) : 0, sy = dstH > 1 ? (srcH - 1) / (dstH - 1) : 0;
  for (let y = 0; y < dstH; y += 1) {
    const fy = y * sy, y0 = Math.floor(fy), y1 = Math.min(srcH - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < dstW; x += 1) {
      const fx = x * sx, x0 = Math.floor(fx), x1 = Math.min(srcW - 1, x0 + 1), tx = fx - x0;
      const top = (src[y0 * srcW + x0] ?? 0) * (1 - tx) + (src[y0 * srcW + x1] ?? 0) * tx;
      const bot = (src[y1 * srcW + x0] ?? 0) * (1 - tx) + (src[y1 * srcW + x1] ?? 0) * tx;
      out[y * dstW + x] = top * (1 - ty) + bot * ty;
    }
  }
  return out;
}

/** Hou & Zhang (2007) 2D FFT 스펙트럼 잔차(Spectral Residual) 현저성 맵. */
function computeSpectralResidualMap(luma: Float32Array, w: number, h: number): Float32Array {
  let minVal = Infinity, maxVal = -Infinity;
  for (let i = 0; i < luma.length; i += 1) {
    const v = luma[i] ?? 0;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }
  if (maxVal - minVal < 1e-5) return new Float32Array(w * h);

  const grid = 64;
  const re = bilinearResample(luma, w, h, grid, grid);
  const im = new Float32Array(grid * grid);
  fft2dRadix2(re, im, grid, false);
  const logAmp = new Float32Array(grid * grid), phase = new Float32Array(grid * grid);
  for (let i = 0; i < logAmp.length; i += 1) {
    logAmp[i] = Math.log(Math.hypot(re[i] ?? 0, im[i] ?? 0) + 1e-6);
    phase[i] = Math.atan2(im[i] ?? 0, re[i] ?? 0);
  }
  for (let y = 0; y < grid; y += 1) {
    for (let x = 0; x < grid; x += 1) {
      let avg = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = (y + dy + grid) % grid;
        for (let dx = -1; dx <= 1; dx += 1) avg += logAmp[ny * grid + ((x + dx + grid) % grid)] ?? 0;
      }
      const idx = y * grid + x, amp = Math.exp(clamp((logAmp[idx] ?? 0) - avg / 9, -10, 10)), ph = phase[idx] ?? 0;
      re[idx] = amp * Math.cos(ph); im[idx] = amp * Math.sin(ph);
    }
  }
  fft2dRadix2(re, im, grid, true);
  const srGrid = new Float32Array(grid * grid);
  for (let i = 0; i < srGrid.length; i += 1) srGrid[i] = (re[i] ?? 0) ** 2 + (im[i] ?? 0) ** 2;
  return applyIttiKochNormalization(bilinearResample(separableGaussianBlur(srGrid, grid, grid, 2.4), grid, grid, w, h));
}

function measureRegionVisualPop(luma: Float32Array, w: number, h: number, r: PanelRectPx): number {
  const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(w - 1, Math.ceil(r.x + r.width)), y1 = Math.min(h - 1, Math.ceil(r.y + r.height));
  if (x1 <= x0 || y1 <= y0) return 0;
  let sum = 0, sq = 0, cnt = 0, edges = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const v = luma[y * w + x] ?? 0;
      sum += v; sq += v * v; cnt += 1;
      if (x < x1) edges += Math.abs(v - (luma[y * w + x + 1] ?? v));
    }
  }
  if (cnt === 0) return 0;
  const mean = sum / cnt, std = Math.sqrt(Math.max(0, sq / cnt - mean * mean));
  const pad = Math.max(2, Math.round(Math.min(r.width, r.height) * 0.25));
  let ringSum = 0, ringCnt = 0;
  for (let y = Math.max(0, y0 - pad); y <= Math.min(h - 1, y1 + pad); y += 1) {
    for (let x = Math.max(0, x0 - pad); x <= Math.min(w - 1, x1 + pad); x += 1) {
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
      ringSum += luma[y * w + x] ?? 0; ringCnt += 1;
    }
  }
  const surround = ringCnt > 0 ? clamp(Math.abs(mean - ringSum / ringCnt) / 0.35, 0, 1) : 0;
  return clamp(0.5 * surround + 0.3 * clamp(std / 0.22, 0, 1) + 0.2 * clamp((edges / cnt) * 4.5, 0, 1), 0, 1);
}

function splatEllipticalPrior(map: Float32Array, w: number, h: number, rect: PanelRectPx, cyRatio: number, rxRatio: number, ryRatio: number, strength: number): void {
  const cx = rect.x + rect.width * 0.5, cy = rect.y + rect.height * cyRatio;
  const rx = Math.max(1.5, rect.width * rxRatio), ry = Math.max(1.5, rect.height * ryRatio);
  for (let y = Math.max(0, Math.floor(rect.y - 1)); y <= Math.min(h - 1, Math.ceil(rect.y + rect.height + 1)); y += 1) {
    for (let x = Math.max(0, Math.floor(rect.x - 1)); x <= Math.min(w - 1, Math.ceil(rect.x + rect.width + 1)); x += 1) {
      const val = strength * Math.exp(-0.5 * (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2));
      const idx = y * w + x;
      if (val > (map[idx] ?? 0)) map[idx] = val;
    }
  }
}

function computeSemanticPriorMap(
  luma: Float32Array, w: number, h: number, srcW: number, srcH: number,
  balloons: readonly SpeechBalloonRegionInput[], faces: readonly FaceAnchorRegionInput[],
): { readonly map: Float32Array; readonly active: boolean } {
  const map = new Float32Array(w * h);
  if (balloons.length === 0 && faces.length === 0) return { map, active: false };
  const sx = w / srcW, sy = h / srcH;
  for (const b of balloons) {
    const rw: PanelRectPx = { x: b.bounds.x * sx, y: b.bounds.y * sy, width: Math.max(1, b.bounds.width * sx), height: Math.max(1, b.bounds.height * sy) };
    const pop = measureRegionVisualPop(luma, w, h, rw);
    if (pop < 0.08) continue;
    splatEllipticalPrior(map, w, h, rw, 0.5, 0.45, 0.45, Math.pow(pop, 1.45) * (b.isPrimary ? 1.0 : Math.max(0.55, 1 - (Math.max(1, b.readingOrder) - 1) * 0.14)));
  }
  for (const f of faces) {
    const rw: PanelRectPx = { x: f.bounds.x * sx, y: f.bounds.y * sy, width: Math.max(1, f.bounds.width * sx), height: Math.max(1, f.bounds.height * sy) };
    const pop = measureRegionVisualPop(luma, w, h, rw);
    if (pop < 0.08) continue;
    splatEllipticalPrior(map, w, h, rw, clamp(f.eyeLineYRatio ?? 0.42, 0.2, 0.7), 0.38, 0.34, Math.pow(pop, 1.25) * clamp(f.prominence ?? 0.9, 0.1, 1) * 0.88);
  }
  let peak = 0;
  for (let i = 0; i < map.length; i += 1) if ((map[i] ?? 0) > peak) peak = map[i] ?? 0;
  return { map, active: peak > 0.01 };
}

function classifyFixationTarget(
  x: number, y: number, balloons: readonly SpeechBalloonRegionInput[],
  faces: readonly FaceAnchorRegionInput[], subjects: readonly FocalSubjectRegionInput[],
): { readonly kind: FixationTargetKind; readonly id: string | null } {
  for (const b of balloons) if (pointInsideRect(x, y, b.bounds, 2)) return { kind: "speech-balloon", id: b.id };
  for (const s of subjects) if (pointInsideRect(x, y, s.bounds, 2)) return { kind: s.kind, id: s.id };
  for (const f of faces) if (pointInsideRect(x, y, f.bounds, 2)) return { kind: "character-face", id: f.id };
  return { kind: "background-clutter", id: null };
}

function meanOfArray(arr: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < arr.length; i += 1) sum += arr[i] ?? 0;
  return arr.length > 0 ? sum / arr.length : 0;
}

/** 2D RGBA 컷 버퍼에서 로컬 시각 현저성 히트맵(`[0..1]`)과 WTA+IOR 예측 스캔패스를 계산한다. */
export function computePanelVisualSaliencyMap(
  panel: RgbaPanelBuffer,
  options: VisualSaliencyOptions = {},
): PanelVisualSaliencyResult {
  validatePanelBuffer(panel);
  const workingMaxDim = Math.max(16, Math.round(options.workingMaxDim ?? 160));
  const maxFixations = clamp(Math.round(options.maxFixations ?? 6), 1, 16);
  const iorRadiusPx = Math.max(4, options.iorRadiusPx ?? Math.max(8, Math.round(Math.min(panel.width, panel.height) * 0.14)));
  const iorStrength = clamp(options.iorSuppressionStrength ?? 0.92, 0.4, 1);
  const minFixationScore = clamp(options.minFixationScore ?? 0.1, 0.01, 0.95);
  const speechBalloons = options.speechBalloons ?? [];
  const faceAnchors = options.faceAnchors ?? [];
  const focalSubjects = options.focalSubjects ?? [];

  const ch = extractWorkingChannels(panel, workingMaxDim);
  const { width: w, height: h } = ch;
  const intensityMap = computeCenterSurroundConspicuity(ch.luminance, w, h);
  const rgMap = computeCenterSurroundConspicuity(ch.rgOpponency, w, h);
  const byMap = computeCenterSurroundConspicuity(ch.byOpponency, w, h);
  const colorRaw = new Float32Array(w * h);
  for (let i = 0; i < colorRaw.length; i += 1) colorRaw[i] = 0.5 * ((rgMap[i] ?? 0) + (byMap[i] ?? 0));
  const colorMap = applyIttiKochNormalization(colorRaw);
  const orientationMap = computeOrientationEnergyMap(ch.luminance, w, h);
  const srMap = computeSpectralResidualMap(ch.luminance, w, h);
  const prior = computeSemanticPriorMap(ch.luminance, w, h, panel.width, panel.height, speechBalloons, faceAnchors);

  const fw = options.featureWeights;
  const weights: SaliencyFeatureWeights = {
    intensity: fw?.intensity ?? DEFAULT_SALIENCY_FEATURE_WEIGHTS.intensity,
    colorOpponency: fw?.colorOpponency ?? DEFAULT_SALIENCY_FEATURE_WEIGHTS.colorOpponency,
    orientation: fw?.orientation ?? DEFAULT_SALIENCY_FEATURE_WEIGHTS.orientation,
    spectralResidual: fw?.spectralResidual ?? DEFAULT_SALIENCY_FEATURE_WEIGHTS.spectralResidual,
    semanticPrior: prior.active ? (fw?.semanticPrior ?? DEFAULT_SALIENCY_FEATURE_WEIGHTS.semanticPrior) : 0,
  };
  const invW = 1 / Math.max(weights.intensity + weights.colorOpponency + weights.orientation + weights.spectralResidual + weights.semanticPrior, 1e-6);

  const rawCombined = new Float32Array(w * h);
  let rawPeak = 0;
  for (let i = 0; i < rawCombined.length; i += 1) {
    const score = ((intensityMap[i] ?? 0) * weights.intensity + (colorMap[i] ?? 0) * weights.colorOpponency + (orientationMap[i] ?? 0) * weights.orientation + (srMap[i] ?? 0) * weights.spectralResidual + (prior.map[i] ?? 0) * weights.semanticPrior) * invW;
    rawCombined[i] = score;
    if (score > rawPeak) rawPeak = score;
  }

  // 중심와(Foveal) 시지각 통합 가우시안 풀링으로 엣지 링 대신 피사체·잡음 군집의 중심에 피크를 모은다.
  const pooled = rawPeak >= 1e-5 ? separableGaussianBlur(rawCombined, w, h, clamp(Math.min(w, h) * 0.032, 1.6, 3.6)) : rawCombined;
  let maxPooled = 0;
  for (let i = 0; i < pooled.length; i += 1) if ((pooled[i] ?? 0) > maxPooled) maxPooled = pooled[i] ?? 0;

  const heatmap = new Float32Array(w * h);
  let meanSaliency = 0, peakSaliency = 0;
  if (maxPooled >= 1e-5) {
    for (let i = 0; i < heatmap.length; i += 1) {
      const n = clamp((pooled[i] ?? 0) / maxPooled, 0, 1);
      heatmap[i] = n; meanSaliency += n;
      if (n > peakSaliency) peakSaliency = n;
    }
    meanSaliency /= heatmap.length;
  }

  const residual = new Float32Array(heatmap);
  const scaleX = panel.width / w, scaleY = panel.height / h;
  const iorRx = iorRadiusPx / scaleX, iorRy = iorRadiusPx / scaleY;
  const scanpath: PredictedFixationPoint[] = [];

  for (let rank = 1; rank <= maxFixations; rank += 1) {
    let bestIdx = -1, bestVal = -1;
    for (let i = 0; i < residual.length; i += 1) {
      const v = residual[i] ?? 0;
      if (v > bestVal) { bestVal = v; bestIdx = i; }
    }
    if (bestIdx < 0 || bestVal < minFixationScore) break;

    const peakY = Math.floor(bestIdx / w), peakX = bestIdx - peakY * w;
    let wSum = 0, cxAcc = 0, cyAcc = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      const ny = peakY + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = peakX + dx;
        if (nx < 0 || nx >= w) continue;
        const val = residual[ny * w + nx] ?? 0;
        if (val > 0) { wSum += val; cxAcc += (nx + 0.5) * val; cyAcc += (ny + 0.5) * val; }
      }
    }
    const workCx = wSum > 0 ? cxAcc / wSum : peakX + 0.5, workCy = wSum > 0 ? cyAcc / wSum : peakY + 0.5;
    const srcX = clamp(workCx * scaleX, 0, panel.width - 1), srcY = clamp(workCy * scaleY, 0, panel.height - 1);
    const normX = clamp(srcX / panel.width, 0, 1), normY = clamp(srcY / panel.height, 0, 1);
    const target = classifyFixationTarget(srcX, srcY, speechBalloons, faceAnchors, focalSubjects);

    scanpath.push({
      rank,
      x: Number(srcX.toFixed(2)),
      y: Number(srcY.toFixed(2)),
      normX: Number(normX.toFixed(4)),
      normY: Number(normY.toFixed(4)),
      score: Number(clamp(bestVal, 0, 1).toFixed(4)),
      estimatedFixationMs: Math.round(180 + clamp(bestVal, 0, 1) * 240),
      quadrantKo: resolveKoreanQuadrantLabel(normX, normY),
      matchedTargetKind: target.kind,
      matchedTargetId: target.id,
    });

    const hardRx = iorRx + 0.75, hardRy = iorRy + 0.75, softRx = iorRx * 1.65, softRy = iorRy * 1.65;
    for (let y = Math.max(0, Math.floor(workCy - softRy - 1)); y <= Math.min(h - 1, Math.ceil(workCy + softRy + 1)); y += 1) {
      for (let x = Math.max(0, Math.floor(workCx - softRx - 1)); x <= Math.min(w - 1, Math.ceil(workCx + softRx + 1)); x += 1) {
        const idx = y * w + x;
        if (((x + 0.5 - workCx) / hardRx) ** 2 + ((y + 0.5 - workCy) / hardRy) ** 2 <= 1.0) {
          residual[idx] = 0;
        } else {
          const atten = 1 - iorStrength * Math.exp(-0.5 * (((x + 0.5 - workCx) / iorRx) ** 2 + ((y + 0.5 - workCy) / iorRy) ** 2));
          residual[idx] = (residual[idx] ?? 0) * Math.max(0, atten);
        }
      }
    }
  }

  return {
    ...LOCAL_VISUAL_SALIENCY_PRIVACY_GUARANTEE,
    privacy: LOCAL_VISUAL_SALIENCY_PRIVACY_GUARANTEE,
    sourceWidth: panel.width,
    sourceHeight: panel.height,
    heatmapWidth: w,
    heatmapHeight: h,
    heatmap,
    peakSaliency: Number(peakSaliency.toFixed(4)),
    meanSaliency: Number(meanSaliency.toFixed(4)),
    iorRadiusPx,
    scanpath,
    channelSummary: {
      intensityMean: Number(meanOfArray(intensityMap).toFixed(4)),
      colorOpponencyMean: Number(meanOfArray(colorMap).toFixed(4)),
      orientationMean: Number(meanOfArray(orientationMap).toFixed(4)),
      spectralResidualMean: Number(meanOfArray(srMap).toFixed(4)),
      semanticPriorMean: Number(meanOfArray(prior.map).toFixed(4)),
    },
  };
}

/** 첫 시선이 의도된 말풍선에 안착하는지, 고대비 배경 잡음에 탈취되는지 감사한다. */
export function auditBalloonFirstGazePriority(input: BalloonGazeAuditInput): BalloonGazeAuditResult {
  const saliency =
    input.saliency ??
    (() => {
      if (!input.panel) throw new Error("auditBalloonFirstGazePriority는 saliency 결과 또는 panel 버퍼 중 하나가 필요합니다.");
      return computePanelVisualSaliencyMap(input.panel, {
        ...input.saliencyOptions,
        speechBalloons: input.speechBalloons,
        faceAnchors: input.faceAnchors ?? input.saliencyOptions?.faceAnchors,
        focalSubjects: input.focalSubjects ?? input.saliencyOptions?.focalSubjects,
      });
    })();

  const { speechBalloons } = input;
  const faceAnchors = input.faceAnchors ?? [], focalSubjects = input.focalSubjects ?? [];
  const threshold = clamp(input.distractionRatioThreshold ?? 1.15, 0.6, 5);
  const primaryBalloon =
    speechBalloons.find((b) => b.isPrimary) ?? [...speechBalloons].sort((a, b) => a.readingOrder - b.readingOrder)[0] ?? null;

  const { heatmap, heatmapWidth: w, heatmapHeight: h, sourceWidth, sourceHeight } = saliency;
  const scaleX = sourceWidth / w, scaleY = sourceHeight / h;
  let primaryPeak = 0, primarySum = 0, primaryCells = 0, bgPeak = 0, bgX = 0, bgY = 0, hasBg = false;

  for (let y = 0; y < h; y += 1) {
    const srcY = (y + 0.5) * scaleY;
    for (let x = 0; x < w; x += 1) {
      const srcX = (x + 0.5) * scaleX, val = heatmap[y * w + x] ?? 0;
      if (primaryBalloon && pointInsideRect(srcX, srcY, primaryBalloon.bounds, 2)) {
        if (val > primaryPeak) primaryPeak = val;
        primarySum += val; primaryCells += 1;
      }
      const inside =
        speechBalloons.some((b) => pointInsideRect(srcX, srcY, b.bounds, 3)) ||
        faceAnchors.some((f) => pointInsideRect(srcX, srcY, f.bounds, 3)) ||
        focalSubjects.some((s) => pointInsideRect(srcX, srcY, s.bounds, 3));
      if (!inside && val > bgPeak) { bgPeak = val; bgX = srcX; bgY = srcY; hasBg = true; }
    }
  }

  const primaryMean = primaryCells > 0 ? primarySum / primaryCells : 0;
  const distractionRatio = bgPeak <= 1e-4 ? 0 : Number((bgPeak / Math.max(primaryPeak, 0.05)).toFixed(3));
  const balloonHit = primaryBalloon ? saliency.scanpath.find((fix) => pointInsideRect(fix.x, fix.y, primaryBalloon.bounds, 3)) : undefined;
  const balloonGazeRank = balloonHit ? balloonHit.rank : null;

  const firstFix = saliency.scanpath[0] ?? null;
  const firstKind = firstFix ? firstFix.matchedTargetKind : null;
  const bgNormX = hasBg ? clamp(bgX / sourceWidth, 0, 1) : 0.5, bgNormY = hasBg ? clamp(bgY / sourceHeight, 0, 1) : 0.5;
  const bgQuadKo = resolveKoreanQuadrantLabel(bgNormX, bgNormY);
  const backgroundPeakPoint = hasBg
    ? { x: Number(bgX.toFixed(2)), y: Number(bgY.toFixed(2)), normX: Number(bgNormX.toFixed(4)), normY: Number(bgNormY.toFixed(4)), quadrantKo: bgQuadKo }
    : null;

  const backgroundHijackDetected =
    primaryBalloon !== null &&
    ((firstKind === "background-clutter" && balloonGazeRank !== 1) || (distractionRatio >= threshold && balloonGazeRank !== 1));

  let severity: BalloonGazeAuditSeverity = "pass";
  let guidanceKo = "첫 시선이 의도한 말풍선에 안정적으로 안착합니다. 배경과의 시각 대비 균형이 양호합니다.";
  if (primaryBalloon === null) {
    severity = "caution";
    guidanceKo = "비교할 대표 말풍선 영역이 지정되지 않아 전체 시각 현저성 분포만 확인했습니다.";
  } else if (backgroundHijackDetected) {
    severity = "hijack";
    const hijackQuad = firstFix && firstFix.matchedTargetKind === "background-clutter" ? firstFix.quadrantKo : bgQuadKo;
    guidanceKo = `이 컷에서 시선이 첫 말풍선보다 ${hijackQuad} 고대비 배경으로 먼저 쏠립니다. 배경 명암 대비나 선 밀도를 한 단계 낮추고 말풍선 테두리와 대사 대비를 높여 보세요.`;
  } else if (balloonGazeRank !== 1) {
    severity = "caution";
    guidanceKo =
      firstKind === "character-face"
        ? "첫 시선이 인물 얼굴에 먼저 머문 뒤 첫 말풍선으로 이어집니다. 대사를 가장 먼저 읽히게 하려면 말풍선 위치와 명도 대비를 소폭 강조해 보세요."
        : "첫 시선이 대표 말풍선 이외의 주요 피사체로 먼저 이동합니다. 읽기 순서가 의도와 맞는지 한 번 점검해 보세요.";
  } else if (distractionRatio >= 0.9) {
    severity = "caution";
    guidanceKo = `첫 시선은 말풍선에 안착하지만 ${bgQuadKo} 배경의 시각 대비가 말풍선과 비슷해 주의가 분산될 수 있습니다.`;
  }

  return {
    ...LOCAL_VISUAL_SALIENCY_PRIVACY_GUARANTEE,
    privacy: LOCAL_VISUAL_SALIENCY_PRIVACY_GUARANTEE,
    primaryBalloonId: primaryBalloon ? primaryBalloon.id : null,
    backgroundHijackDetected,
    severity,
    balloonGazeRank,
    firstFixationTargetKind: firstKind,
    primaryBalloonPeakSaliency: Number(primaryPeak.toFixed(4)),
    primaryBalloonMeanSaliency: Number(primaryMean.toFixed(4)),
    backgroundPeakSaliency: Number(bgPeak.toFixed(4)),
    backgroundPeakPoint,
    distractionRatio,
    guidanceKo,
    saliency,
  };
}
