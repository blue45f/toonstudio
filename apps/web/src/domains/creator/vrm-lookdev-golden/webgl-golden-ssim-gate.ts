/**
 * Wave 37G — Headless WebGL 골든 SSIM 자동 회귀 오라클.
 *
 * 3D VRM 캐릭터·헤어 렌더링 프레임(RGBA Uint8ClampedArray)의 시각 회귀를 결정론적으로 탐지한다.
 * - 지각 SSIM(YCbCr 가중 구조 유사도: 휘도·대비·구조 3항)
 * - 휘도/채도 히스토그램 기반 밀키 백화(워시아웃)·암부 뭉개짐(크러시) 비율
 * - 알파·배경 분리 기반 실루엣 결손률 및 IoU
 * - WebGL 셰이더 컴파일/링크 오류 제로(0-error) 오라클
 */

export type GoldenGateVerdict = "pass" | "warn" | "fail";

export type GoldenDiagnosticCode =
  | "SSIM_DROP"
  | "MILKY_WASHOUT"
  | "DARK_COLLAPSE"
  | "SILHOUETTE_LOSS"
  | "CHROMA_WASHOUT"
  | "SHADER_COMPILE_ERROR"
  | "DIMENSION_MISMATCH";

export type GoldenRegressionFaultId =
  | "clean-golden"
  | "milky-washout"
  | "dark-collapse"
  | "silhouette-dropout"
  | "shader-compile-error"
  | "subtle-tone-drift";

export interface GoldenFrameBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  readonly label?: string;
}

export interface WebGlShaderCompileRecord {
  readonly programName: string;
  readonly stage: "vertex" | "fragment" | "link";
  readonly compiled: boolean;
  readonly infoLog?: string;
}

export interface GoldenSsimThresholds {
  readonly passMinSsim: number;
  readonly warnMinSsim: number;
  readonly warnWashoutRatio: number;
  readonly failWashoutRatio: number;
  readonly failWashoutDelta: number;
  readonly warnDarkCollapseRatio: number;
  readonly failDarkCollapseRatio: number;
  readonly failDarkCollapseDelta: number;
  readonly warnSilhouetteLossRatio: number;
  readonly failSilhouetteLossRatio: number;
  readonly failChromaDropRatio: number;
  readonly maxShaderErrors: number;
}

export const DEFAULT_GOLDEN_SSIM_THRESHOLDS: GoldenSsimThresholds = {
  passMinSsim: 0.95,
  warnMinSsim: 0.88,
  warnWashoutRatio: 0.08,
  failWashoutRatio: 0.18,
  failWashoutDelta: 0.12,
  warnDarkCollapseRatio: 0.12,
  failDarkCollapseRatio: 0.24,
  failDarkCollapseDelta: 0.14,
  warnSilhouetteLossRatio: 0.03,
  failSilhouetteLossRatio: 0.08,
  failChromaDropRatio: 0.28,
  maxShaderErrors: 0,
};

export interface GoldenHistogramStats {
  readonly luminanceBins: readonly number[];
  readonly saturationBins: readonly number[];
  readonly meanLuminance: number;
  readonly meanSaturation: number;
  readonly washoutRatio: number;
  readonly darkCollapseRatio: number;
  readonly foregroundPixels: number;
}

export interface PerceptualSsimBreakdown {
  readonly ssim: number;
  readonly lumaSsim: number;
  readonly chromaSsim: number;
  readonly minWindowSsim: number;
  readonly windowCount: number;
}

export interface GoldenDiagnosticItem {
  readonly code: GoldenDiagnosticCode;
  readonly severity: "warn" | "fail";
  readonly messageKo: string;
  readonly messageEn: string;
  readonly metricValue: number;
  readonly thresholdValue: number;
}

export interface EvaluateWebGlGoldenGateInput {
  readonly width: number;
  readonly height: number;
  readonly referenceRgba: Uint8ClampedArray;
  readonly candidateRgba: Uint8ClampedArray;
  readonly candidateWidth?: number;
  readonly candidateHeight?: number;
  readonly shaderRecords?: readonly WebGlShaderCompileRecord[];
  readonly shaderErrors?: readonly string[];
  readonly thresholds?: Partial<GoldenSsimThresholds>;
}

export interface GoldenSsimGateReport {
  readonly verdict: GoldenGateVerdict;
  readonly ssim: number;
  readonly lumaSsim: number;
  readonly chromaSsim: number;
  readonly minWindowSsim: number;
  readonly washoutRatio: number;
  readonly washoutDelta: number;
  readonly darkCollapseRatio: number;
  readonly darkCollapseDelta: number;
  readonly silhouetteLossRatio: number;
  readonly silhouetteIoU: number;
  readonly chromaDropRatio: number;
  readonly shaderErrorCount: number;
  readonly failedShaderLogs: readonly string[];
  readonly referenceHistogram: GoldenHistogramStats;
  readonly candidateHistogram: GoldenHistogramStats;
  readonly diagnostics: readonly GoldenDiagnosticItem[];
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly evaluatedPixels: number;
  readonly windowCount: number;
}

export interface SynthesizeVrmLookdevFrameOptions {
  readonly width?: number;
  readonly height?: number;
  readonly transparentBackdrop?: boolean;
}

export interface FaultInjectionBundle {
  readonly faultId: GoldenRegressionFaultId;
  readonly candidate: GoldenFrameBuffer;
  readonly shaderRecords: readonly WebGlShaderCompileRecord[];
}

const SSIM_C1 = (0.01 * 255) ** 2;
const SSIM_C2 = (0.03 * 255) ** 2;
const SSIM_C3 = SSIM_C2 / 2;
const ALPHA_MASK_THRESHOLD = 16;
const WASHOUT_LUMA_MIN = 0.84;
const WASHOUT_SAT_MAX = 0.18;
const DARK_COLLAPSE_LUMA_MAX = 0.08;
const MATTE_BG_CHANNEL = 128;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function createEmptyHistogram(): GoldenHistogramStats {
  return {
    luminanceBins: new Array<number>(16).fill(0),
    saturationBins: new Array<number>(8).fill(0),
    meanLuminance: 0,
    meanSaturation: 0,
    washoutRatio: 0,
    darkCollapseRatio: 0,
    foregroundPixels: 0,
  };
}

/** RGBA 프레임을 중립 매트 위에 합성한 Rec.709 Y/Cb/Cr 평면으로 변환한다. */
function extractYCbCrPlanes(rgba: Uint8ClampedArray, pixelCount: number) {
  const y = new Float64Array(pixelCount);
  const cb = new Float64Array(pixelCount);
  const cr = new Float64Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const a = (rgba[off + 3] ?? 255) / 255;
    const invA = 1 - a;
    const r = (rgba[off] ?? 0) * a + MATTE_BG_CHANNEL * invA;
    const g = (rgba[off + 1] ?? 0) * a + MATTE_BG_CHANNEL * invA;
    const b = (rgba[off + 2] ?? 0) * a + MATTE_BG_CHANNEL * invA;
    y[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    cb[i] = clamp(128 + (-0.1146 * r - 0.3854 * g + 0.5 * b), 0, 255);
    cr[i] = clamp(128 + (0.5 * r - 0.4542 * g - 0.0458 * b), 0, 255);
  }
  return { y, cb, cr };
}

/** 단일 채널 평면 쌍에 대해 슬라이딩 8×8 윈도우 SSIM을 산출한다(투명 여백 윈도우는 제외해 캐릭터 민감도를 유지한다). */
function computeChannelSsim(
  planeA: Float64Array,
  planeB: Float64Array,
  width: number,
  height: number,
  activeMask?: Uint8Array,
) {
  const winW = Math.min(8, width);
  const winH = Math.min(8, height);
  const stepX = Math.max(1, Math.floor(winW / 2));
  const stepY = Math.max(1, Math.floor(winH / 2));
  const area = winW * winH;
  const denomVar = Math.max(1, area - 1);

  let sumSsim = 0;
  let minSsim = 1;
  let count = 0;

  for (let y0 = 0; y0 <= height - winH; y0 += stepY) {
    for (let x0 = 0; x0 <= width - winW; x0 += stepX) {
      if (activeMask) {
        let hasActive = false;
        for (let dy = 0; dy < winH && !hasActive; dy += 1) {
          const row = (y0 + dy) * width + x0;
          for (let dx = 0; dx < winW; dx += 1) {
            if (activeMask[row + dx] === 1) {
              hasActive = true;
              break;
            }
          }
        }
        if (!hasActive) continue;
      }
      let sumA = 0;
      let sumB = 0;
      for (let dy = 0; dy < winH; dy += 1) {
        const row = (y0 + dy) * width + x0;
        for (let dx = 0; dx < winW; dx += 1) {
          sumA += planeA[row + dx] ?? 0;
          sumB += planeB[row + dx] ?? 0;
        }
      }
      const muA = sumA / area;
      const muB = sumB / area;
      let varA = 0;
      let varB = 0;
      let covAB = 0;
      for (let dy = 0; dy < winH; dy += 1) {
        const row = (y0 + dy) * width + x0;
        for (let dx = 0; dx < winW; dx += 1) {
          const da = (planeA[row + dx] ?? 0) - muA;
          const db = (planeB[row + dx] ?? 0) - muB;
          varA += da * da;
          varB += db * db;
          covAB += da * db;
        }
      }
      varA /= denomVar;
      varB /= denomVar;
      covAB /= denomVar;
      const sigA = Math.sqrt(Math.max(0, varA));
      const sigB = Math.sqrt(Math.max(0, varB));
      const lum = (2 * muA * muB + SSIM_C1) / (muA * muA + muB * muB + SSIM_C1);
      const con = (2 * sigA * sigB + SSIM_C2) / (varA + varB + SSIM_C2);
      const str = (covAB + SSIM_C3) / (sigA * sigB + SSIM_C3);
      const localSsim = clamp(lum * con * str, 0, 1);
      sumSsim += localSsim;
      if (localSsim < minSsim) minSsim = localSsim;
      count += 1;
    }
  }
  return count === 0 ? { mean: 1, min: 1, windows: 0 } : { mean: sumSsim / count, min: minSsim, windows: count };
}

/** 기준·후보 RGBA 프레임 쌍의 YCbCr 가중 지각 SSIM을 계산한다. */
export function computePerceptualSsim(
  width: number,
  height: number,
  referenceRgba: Uint8ClampedArray,
  candidateRgba: Uint8ClampedArray,
): PerceptualSsimBreakdown {
  const pixelCount = width * height;
  if (pixelCount <= 0 || referenceRgba.length < pixelCount * 4 || candidateRgba.length < pixelCount * 4) {
    return { ssim: 0, lumaSsim: 0, chromaSsim: 0, minWindowSsim: 0, windowCount: 0 };
  }
  const activeMask = new Uint8Array(pixelCount);
  let activePixels = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const aOff = i * 4 + 3;
    if ((referenceRgba[aOff] ?? 255) >= ALPHA_MASK_THRESHOLD || (candidateRgba[aOff] ?? 255) >= ALPHA_MASK_THRESHOLD) {
      activeMask[i] = 1;
      activePixels += 1;
    }
  }
  const maskArg = activePixels > 0 ? activeMask : undefined;
  const refP = extractYCbCrPlanes(referenceRgba, pixelCount);
  const candP = extractYCbCrPlanes(candidateRgba, pixelCount);
  const yRes = computeChannelSsim(refP.y, candP.y, width, height, maskArg);
  const cbRes = computeChannelSsim(refP.cb, candP.cb, width, height, maskArg);
  const crRes = computeChannelSsim(refP.cr, candP.cr, width, height, maskArg);
  const chromaSsim = (cbRes.mean + crRes.mean) * 0.5;
  return {
    ssim: roundTo(clamp(0.8 * yRes.mean + 0.2 * chromaSsim, 0, 1), 6),
    lumaSsim: roundTo(yRes.mean, 6),
    chromaSsim: roundTo(chromaSsim, 6),
    minWindowSsim: roundTo(clamp(Math.min(yRes.min, cbRes.min, crRes.min), 0, 1), 6),
    windowCount: yRes.windows,
  };
}

/** 단일 프레임의 휘도·채도 히스토그램, 밀키 백화 비율, 암부 뭉개짐 비율을 계산한다. */
export function analyzeFrameHistogram(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): GoldenHistogramStats {
  const pixelCount = width * height;
  if (pixelCount <= 0 || rgba.length < pixelCount * 4) return createEmptyHistogram();

  const lumaCounts = new Array<number>(16).fill(0);
  const satCounts = new Array<number>(8).fill(0);
  let fgCount = 0;
  let sumLuma = 0;
  let sumSat = 0;
  let washoutCount = 0;
  let darkCollapseCount = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    if ((rgba[off + 3] ?? 255) < ALPHA_MASK_THRESHOLD) continue;
    const r = (rgba[off] ?? 0) / 255;
    const g = (rgba[off + 1] ?? 0) / 255;
    const b = (rgba[off + 2] ?? 0) / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC > 1e-6 ? (maxC - minC) / maxC : 0;

    const lBin = Math.min(15, Math.max(0, Math.floor(luma * 16)));
    const sBin = Math.min(7, Math.max(0, Math.floor(sat * 8)));
    lumaCounts[lBin] = (lumaCounts[lBin] ?? 0) + 1;
    satCounts[sBin] = (satCounts[sBin] ?? 0) + 1;
    sumLuma += luma;
    sumSat += sat;
    fgCount += 1;
    if (luma >= WASHOUT_LUMA_MIN && sat <= WASHOUT_SAT_MAX) washoutCount += 1;
    if (luma <= DARK_COLLAPSE_LUMA_MAX) darkCollapseCount += 1;
  }

  if (fgCount === 0) return createEmptyHistogram();
  return {
    luminanceBins: lumaCounts.map((c) => roundTo(c / fgCount, 4)),
    saturationBins: satCounts.map((c) => roundTo(c / fgCount, 4)),
    meanLuminance: roundTo(sumLuma / fgCount, 4),
    meanSaturation: roundTo(sumSat / fgCount, 4),
    washoutRatio: roundTo(washoutCount / fgCount, 4),
    darkCollapseRatio: roundTo(darkCollapseCount / fgCount, 4),
    foregroundPixels: fgCount,
  };
}

/** 기준 대비 후보 프레임의 캐릭터 실루엣 결손률과 IoU를 계산한다. */
function analyzeSilhouetteIntegrity(
  width: number,
  height: number,
  referenceRgba: Uint8ClampedArray,
  candidateRgba: Uint8ClampedArray,
): { readonly lossRatio: number; readonly iou: number } {
  const pixelCount = width * height;
  if (pixelCount <= 0) return { lossRatio: 1, iou: 0 };

  let hasTransparency = false;
  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4 + 3;
    if ((referenceRgba[off] ?? 255) < ALPHA_MASK_THRESHOLD || (candidateRgba[off] ?? 255) < ALPHA_MASK_THRESHOLD) {
      hasTransparency = true;
      break;
    }
  }

  let refCount = 0;
  let missingCount = 0;
  let intersection = 0;
  let union = 0;

  if (hasTransparency) {
    for (let i = 0; i < pixelCount; i += 1) {
      const off = i * 4 + 3;
      const inRef = (referenceRgba[off] ?? 255) >= ALPHA_MASK_THRESHOLD;
      const inCand = (candidateRgba[off] ?? 255) >= ALPHA_MASK_THRESHOLD;
      if (inRef) refCount += 1;
      if (inRef && !inCand) missingCount += 1;
      if (inRef && inCand) intersection += 1;
      if (inRef || inCand) union += 1;
    }
  } else {
    const corners = [0, width - 1, (height - 1) * width, height * width - 1];
    let bgR = 0;
    let bgG = 0;
    let bgB = 0;
    for (const idx of corners) {
      bgR += referenceRgba[idx * 4] ?? 0;
      bgG += referenceRgba[idx * 4 + 1] ?? 0;
      bgB += referenceRgba[idx * 4 + 2] ?? 0;
    }
    bgR /= 4;
    bgG /= 4;
    bgB /= 4;
    const threshSq = 18 * 18;
    for (let i = 0; i < pixelCount; i += 1) {
      const off = i * 4;
      const inRef = ((referenceRgba[off] ?? 0) - bgR) ** 2 + ((referenceRgba[off + 1] ?? 0) - bgG) ** 2 + ((referenceRgba[off + 2] ?? 0) - bgB) ** 2 > threshSq;
      const inCand = ((candidateRgba[off] ?? 0) - bgR) ** 2 + ((candidateRgba[off + 1] ?? 0) - bgG) ** 2 + ((candidateRgba[off + 2] ?? 0) - bgB) ** 2 > threshSq;
      if (inRef) refCount += 1;
      if (inRef && !inCand) missingCount += 1;
      if (inRef && inCand) intersection += 1;
      if (inRef || inCand) union += 1;
    }
  }
  return refCount === 0
    ? { lossRatio: 0, iou: 1 }
    : { lossRatio: roundTo(missingCount / refCount, 4), iou: roundTo(union > 0 ? intersection / union : 1, 4) };
}

function collectShaderErrors(records?: readonly WebGlShaderCompileRecord[], rawErrors?: readonly string[]): readonly string[] {
  const logs: string[] = [];
  for (const rec of records ?? []) {
    if (!rec.compiled) logs.push(`[${rec.programName}:${rec.stage}] ${rec.infoLog?.trim() || "컴파일 실패 상세 로그 없음"}`);
  }
  for (const msg of rawErrors ?? []) {
    const trimmed = msg.trim();
    if (trimmed.length > 0) logs.push(trimmed);
  }
  return logs;
}

/** 기준 골든 프레임과 후보 WebGL 프레임의 시각 회귀·셰이더 무결성을 통합 판정한다. */
export function evaluateWebGlGoldenSsimGate(input: EvaluateWebGlGoldenGateInput): GoldenSsimGateReport {
  const thresholds: GoldenSsimThresholds = { ...DEFAULT_GOLDEN_SSIM_THRESHOLDS, ...input.thresholds };
  const failedShaderLogs = collectShaderErrors(input.shaderRecords, input.shaderErrors);
  const shaderErrorCount = failedShaderLogs.length;
  const candW = input.candidateWidth ?? input.width;
  const candH = input.candidateHeight ?? input.height;
  const expectedLen = input.width * input.height * 4;

  if (
    input.width <= 0 ||
    input.height <= 0 ||
    candW !== input.width ||
    candH !== input.height ||
    input.referenceRgba.length < expectedLen ||
    input.candidateRgba.length < expectedLen
  ) {
    const diag: GoldenDiagnosticItem = {
      code: "DIMENSION_MISMATCH",
      severity: "fail",
      messageKo: `프레임 해상도 또는 RGBA 버퍼 길이가 일치하지 않습니다(기준 ${input.width}×${input.height}, 후보 ${candW}×${candH}).`,
      messageEn: `Frame dimension or RGBA length mismatch (ref ${input.width}x${input.height}, cand ${candW}x${candH}).`,
      metricValue: candW * candH,
      thresholdValue: input.width * input.height,
    };
    return {
      verdict: "fail", ssim: 0, lumaSsim: 0, chromaSsim: 0, minWindowSsim: 0,
      washoutRatio: 0, washoutDelta: 0, darkCollapseRatio: 0, darkCollapseDelta: 0,
      silhouetteLossRatio: 1, silhouetteIoU: 0, chromaDropRatio: 0,
      shaderErrorCount, failedShaderLogs,
      referenceHistogram: createEmptyHistogram(), candidateHistogram: createEmptyHistogram(),
      diagnostics: [diag], summaryKo: `실패(FAIL): ${diag.messageKo}`, summaryEn: `FAIL: ${diag.messageEn}`,
      evaluatedPixels: 0, windowCount: 0,
    };
  }

  const ssimRes = computePerceptualSsim(input.width, input.height, input.referenceRgba, input.candidateRgba);
  const refHist = analyzeFrameHistogram(input.width, input.height, input.referenceRgba);
  const candHist = analyzeFrameHistogram(input.width, input.height, input.candidateRgba);
  const silhouette = analyzeSilhouetteIntegrity(input.width, input.height, input.referenceRgba, input.candidateRgba);

  const washoutDelta = roundTo(Math.max(0, candHist.washoutRatio - refHist.washoutRatio), 4);
  const darkCollapseDelta = roundTo(Math.max(0, candHist.darkCollapseRatio - refHist.darkCollapseRatio), 4);
  const chromaDropRatio = refHist.meanSaturation > 0.05
    ? roundTo(Math.max(0, (refHist.meanSaturation - candHist.meanSaturation) / refHist.meanSaturation), 4)
    : 0;

  const diagnostics: GoldenDiagnosticItem[] = [];
  const isBitExactFrame = ssimRes.ssim >= 0.999999 && silhouette.lossRatio === 0;

  if (shaderErrorCount > thresholds.maxShaderErrors) {
    diagnostics.push({
      code: "SHADER_COMPILE_ERROR",
      severity: "fail",
      messageKo: `WebGL 셰이더 컴파일/링크 오류 ${shaderErrorCount}건 감지: ${failedShaderLogs[0] ?? "오류 로그 확인 필요"}`,
      messageEn: `${shaderErrorCount} WebGL shader error(s): ${failedShaderLogs[0] ?? "inspect log"}`,
      metricValue: shaderErrorCount,
      thresholdValue: thresholds.maxShaderErrors,
    });
  }

  if (!isBitExactFrame) {
    if (candHist.washoutRatio >= thresholds.failWashoutRatio && washoutDelta >= thresholds.failWashoutDelta * 0.5) {
      diagnostics.push({
        code: "MILKY_WASHOUT",
        severity: "fail",
        messageKo: `밀키 백화(워시아웃) 결함 탐지: 고휘도·저채도 비율 ${(candHist.washoutRatio * 100).toFixed(1)}%(기준 대비 +${(washoutDelta * 100).toFixed(1)}%p).`,
        messageEn: `Milky washout fault: ${(candHist.washoutRatio * 100).toFixed(1)}% (+${(washoutDelta * 100).toFixed(1)}pp).`,
        metricValue: candHist.washoutRatio,
        thresholdValue: thresholds.failWashoutRatio,
      });
    } else if (candHist.washoutRatio >= thresholds.warnWashoutRatio && washoutDelta >= 0.03) {
      diagnostics.push({
        code: "MILKY_WASHOUT",
        severity: "warn",
        messageKo: `밀키 백화 주의: 고휘도·저채도 비율이 ${(candHist.washoutRatio * 100).toFixed(1)}%로 상승했습니다.`,
        messageEn: `Milky washout warning: ${(candHist.washoutRatio * 100).toFixed(1)}%.`,
        metricValue: candHist.washoutRatio,
        thresholdValue: thresholds.warnWashoutRatio,
      });
    }

    if (chromaDropRatio >= thresholds.failChromaDropRatio) {
      diagnostics.push({
        code: "CHROMA_WASHOUT",
        severity: "fail",
        messageKo: `평균 채도가 기준 대비 ${(chromaDropRatio * 100).toFixed(1)}% 급락했습니다(톤매핑 탈색 위험).`,
        messageEn: `Mean chroma dropped ${(chromaDropRatio * 100).toFixed(1)}% vs golden.`,
        metricValue: chromaDropRatio,
        thresholdValue: thresholds.failChromaDropRatio,
      });
    }

    if (candHist.darkCollapseRatio >= thresholds.failDarkCollapseRatio && darkCollapseDelta >= thresholds.failDarkCollapseDelta * 0.5) {
      diagnostics.push({
        code: "DARK_COLLAPSE",
        severity: "fail",
        messageKo: `암부 뭉개짐(크러시) 결함 탐지: 극저휘도 픽셀 ${(candHist.darkCollapseRatio * 100).toFixed(1)}%(기준 대비 +${(darkCollapseDelta * 100).toFixed(1)}%p).`,
        messageEn: `Dark collapse fault: ${(candHist.darkCollapseRatio * 100).toFixed(1)}% (+${(darkCollapseDelta * 100).toFixed(1)}pp).`,
        metricValue: candHist.darkCollapseRatio,
        thresholdValue: thresholds.failDarkCollapseRatio,
      });
    } else if (candHist.darkCollapseRatio >= thresholds.warnDarkCollapseRatio && darkCollapseDelta >= 0.04) {
      diagnostics.push({
        code: "DARK_COLLAPSE",
        severity: "warn",
        messageKo: `암부 뭉개짐 주의: 극저휘도 픽셀이 ${(candHist.darkCollapseRatio * 100).toFixed(1)}%로 증가했습니다.`,
        messageEn: `Dark collapse warning: ${(candHist.darkCollapseRatio * 100).toFixed(1)}%.`,
        metricValue: candHist.darkCollapseRatio,
        thresholdValue: thresholds.warnDarkCollapseRatio,
      });
    }

    if (silhouette.lossRatio >= thresholds.failSilhouetteLossRatio) {
      diagnostics.push({
        code: "SILHOUETTE_LOSS",
        severity: "fail",
        messageKo: `캐릭터 실루엣 결손 ${(silhouette.lossRatio * 100).toFixed(1)}% 발생(IoU ${silhouette.iou.toFixed(3)}).`,
        messageEn: `Silhouette dropout ${(silhouette.lossRatio * 100).toFixed(1)}% (IoU ${silhouette.iou.toFixed(3)}).`,
        metricValue: silhouette.lossRatio,
        thresholdValue: thresholds.failSilhouetteLossRatio,
      });
    } else if (silhouette.lossRatio >= thresholds.warnSilhouetteLossRatio) {
      diagnostics.push({
        code: "SILHOUETTE_LOSS",
        severity: "warn",
        messageKo: `실루엣 경계 미세 손실 ${(silhouette.lossRatio * 100).toFixed(1)}%가 관찰됩니다.`,
        messageEn: `Minor silhouette loss ${(silhouette.lossRatio * 100).toFixed(1)}%.`,
        metricValue: silhouette.lossRatio,
        thresholdValue: thresholds.warnSilhouetteLossRatio,
      });
    }

    if (ssimRes.ssim < thresholds.warnMinSsim) {
      diagnostics.push({
        code: "SSIM_DROP",
        severity: "fail",
        messageKo: `지각 SSIM ${ssimRes.ssim.toFixed(4)}가 실패 기준(${thresholds.warnMinSsim.toFixed(2)}) 미만입니다.`,
        messageEn: `Perceptual SSIM ${ssimRes.ssim.toFixed(4)} below fail threshold ${thresholds.warnMinSsim.toFixed(2)}.`,
        metricValue: ssimRes.ssim,
        thresholdValue: thresholds.warnMinSsim,
      });
    } else if (ssimRes.ssim < thresholds.passMinSsim) {
      diagnostics.push({
        code: "SSIM_DROP",
        severity: "warn",
        messageKo: `지각 SSIM ${ssimRes.ssim.toFixed(4)}가 통과 기준(${thresholds.passMinSsim.toFixed(2)})에 소폭 미달합니다.`,
        messageEn: `Perceptual SSIM ${ssimRes.ssim.toFixed(4)} slightly below pass threshold ${thresholds.passMinSsim.toFixed(2)}.`,
        metricValue: ssimRes.ssim,
        thresholdValue: thresholds.passMinSsim,
      });
    }
  }

  const verdict: GoldenGateVerdict = diagnostics.some((d) => d.severity === "fail")
    ? "fail"
    : diagnostics.some((d) => d.severity === "warn")
      ? "warn"
      : "pass";

  const summaryKo =
    verdict === "pass"
      ? `통과(PASS): 지각 SSIM ${ssimRes.ssim.toFixed(4)} · 백화 ${(candHist.washoutRatio * 100).toFixed(1)}% · 암부 ${(candHist.darkCollapseRatio * 100).toFixed(1)}% · 셰이더 오류 0건`
      : `${verdict === "warn" ? "주의(WARN)" : "실패(FAIL)"}: ${diagnostics.map((d) => d.messageKo).join(" / ")}`;
  const summaryEn =
    verdict === "pass"
      ? `PASS: SSIM ${ssimRes.ssim.toFixed(4)} · Washout ${(candHist.washoutRatio * 100).toFixed(1)}% · Dark ${(candHist.darkCollapseRatio * 100).toFixed(1)}% · 0 shader errors`
      : `${verdict.toUpperCase()}: ${diagnostics.map((d) => d.messageEn).join(" / ")}`;

  return {
    verdict, ssim: ssimRes.ssim, lumaSsim: ssimRes.lumaSsim, chromaSsim: ssimRes.chromaSsim,
    minWindowSsim: ssimRes.minWindowSsim, washoutRatio: candHist.washoutRatio, washoutDelta,
    darkCollapseRatio: candHist.darkCollapseRatio, darkCollapseDelta,
    silhouetteLossRatio: silhouette.lossRatio, silhouetteIoU: silhouette.iou, chromaDropRatio,
    shaderErrorCount, failedShaderLogs, referenceHistogram: refHist, candidateHistogram: candHist,
    diagnostics, summaryKo, summaryEn, evaluatedPixels: input.width * input.height, windowCount: ssimRes.windowCount,
  };
}

/** 테스트 및 라이브 오라클 검증용 결정론적 3D VRM 캐릭터·헤어 골든 프레임을 합성한다. */
export function synthesizeVrmLookdevFrame(options: SynthesizeVrmLookdevFrameOptions = {}): GoldenFrameBuffer {
  const width = Math.max(16, Math.round(options.width ?? 64));
  const height = Math.max(16, Math.round(options.height ?? 64));
  const transparent = options.transparentBackdrop ?? true;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const ny = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const nx = (x + 0.5) / width;
      const off = (y * width + x) * 4;
      const headDist = Math.hypot((nx - 0.5) / 0.24, (ny - 0.44) / 0.25);
      const hairDist = Math.hypot((nx - 0.5) / 0.30, (ny - 0.39) / 0.28);
      const inBody = ny >= 0.67 && Math.abs(nx - 0.5) < 0.28 + (ny - 0.67) * 0.35;
      const inBangs = hairDist < 1.0 && ny < 0.43 + 0.04 * Math.sin(nx * 24);
      const inBackHair = hairDist < 1.04 && ny >= 0.36 && ny < 0.72 && Math.abs(nx - 0.5) > 0.16;

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (inBody) {
        const shade = 0.78 + 0.22 * (1 - nx);
        r = Math.round(74 * shade);
        g = Math.round(102 * shade);
        b = Math.round(158 * shade);
        a = 255;
      }
      if (inBackHair) {
        r = 104;
        g = 72;
        b = 64;
        a = 255;
      }
      if (headDist < 1.0) {
        const celLit = nx < 0.58 ? 1.0 : 0.88;
        r = Math.round(234 * celLit);
        g = Math.round(192 * celLit);
        b = Math.round(168 * celLit);
        a = 255;
        if (Math.hypot((nx - 0.41) / 0.042, (ny - 0.48) / 0.036) < 1 || Math.hypot((nx - 0.59) / 0.042, (ny - 0.48) / 0.036) < 1) {
          r = 52;
          g = 78;
          b = 132;
        }
        if (ny > 0.415 && ny < 0.438 && ((nx > 0.36 && nx < 0.46) || (nx > 0.54 && nx < 0.64))) {
          r = 86;
          g = 58;
          b = 48;
        }
      }
      if (inBangs) {
        const ring = Math.exp(-((ny - 0.27) ** 2) / 0.0014) * (0.6 + 0.4 * Math.cos((nx - 0.5) * 9));
        r = Math.round(clamp(124 + ring * 78, 0, 240));
        g = Math.round(clamp(82 + ring * 62, 0, 225));
        b = Math.round(clamp(74 + ring * 56, 0, 220));
        a = 255;
      }
      if (a === 0 && !transparent) {
        r = 46;
        g = 50;
        b = 60;
        a = 255;
      }
      data[off] = r;
      data[off + 1] = g;
      data[off + 2] = b;
      data[off + 3] = a;
    }
  }
  return { width, height, data, label: "golden-vrm-front" };
}

/** 기준 골든 프레임에 회귀 결함 시나리오를 불변(immutable) 주입한다. */
export function applyGoldenRegressionFault(
  reference: GoldenFrameBuffer,
  faultId: GoldenRegressionFaultId,
): FaultInjectionBundle {
  const mutated = new Uint8ClampedArray(reference.data);
  const pixelCount = reference.width * reference.height;
  const healthyShaders: readonly WebGlShaderCompileRecord[] = [
    { programName: "vrm-mtoon-body", stage: "vertex", compiled: true },
    { programName: "vrm-mtoon-body", stage: "fragment", compiled: true },
    { programName: "vrm-hair-angelring", stage: "fragment", compiled: true },
  ];

  if (faultId === "clean-golden") {
    return { faultId, candidate: { width: reference.width, height: reference.height, data: mutated, label: faultId }, shaderRecords: healthyShaders };
  }
  if (faultId === "shader-compile-error") {
    return {
      faultId,
      candidate: { width: reference.width, height: reference.height, data: mutated, label: faultId },
      shaderRecords: [
        ...healthyShaders.slice(0, 2),
        { programName: "vrm-hair-angelring", stage: "fragment", compiled: false, infoLog: "ERROR: 0:114: 'uHairRimTint' : undeclared identifier" },
      ],
    };
  }

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    if ((mutated[off + 3] ?? 0) < ALPHA_MASK_THRESHOLD) continue;
    const r = mutated[off] ?? 0;
    const g = mutated[off + 1] ?? 0;
    const b = mutated[off + 2] ?? 0;
    const y = Math.floor(i / reference.width);

    if (faultId === "milky-washout") {
      const lift = 0.84;
      mutated[off] = Math.round(r * (1 - lift) + 246 * lift);
      mutated[off + 1] = Math.round(g * (1 - lift) + 246 * lift);
      mutated[off + 2] = Math.round(b * (1 - lift) + 248 * lift);
    } else if (faultId === "dark-collapse") {
      mutated[off] = Math.round(r * 0.14);
      mutated[off + 1] = Math.round(g * 0.12);
      mutated[off + 2] = Math.round(b * 0.13);
    } else if (faultId === "silhouette-dropout" && y < Math.floor(reference.height * 0.38)) {
      mutated[off] = 0;
      mutated[off + 1] = 0;
      mutated[off + 2] = 0;
      mutated[off + 3] = 0;
    } else if (faultId === "subtle-tone-drift") {
      // 경미한 감마·명암 드리프트(WARN 구간: SSIM ~0.91~0.94, 과도한 백화 없음)
      mutated[off] = clamp(Math.round(r * 0.72 + 44), 0, 255);
      mutated[off + 1] = clamp(Math.round(g * 0.75 + 36), 0, 255);
      mutated[off + 2] = clamp(Math.round(b * 0.78 + 30), 0, 255);
    }
  }
  return {
    faultId,
    candidate: { width: reference.width, height: reference.height, data: mutated, label: faultId },
    shaderRecords: healthyShaders,
  };
}
