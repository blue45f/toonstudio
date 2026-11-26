/**
 * 멀티 포털 세이프 슬라이스·바이트 예산 컴파일러 및
 * 온디바이스 인체공학 펜 이동량·손목 피로 코치.
 *
 * - 외부 서버 호출 0회(₩0), 모든 슬라이싱·양자화 이진 탐색·필압/이동량 분석을 기기 안에서 끝낸다.
 * - 말풍선·캐릭터 눈/얼굴 보호 구역을 가로지르지 않는 최적 절단선을 동적 계획법(DP)으로 찾고,
 *   플랫폼별 회당·컷당 용량 상한(예: 2 MiB)을 만족하는 최고 화질·서브샘플링 조합을 이진 탐색한다.
 * - 스타일러스 물리 이동 거리(px/mm), 고필압(> 0.85) 지속 비율, 짧은 시간 내 실행 취소 연타,
 *   연속 작업 시간을 측정해 비의료적 휴식 알림과 단축키 습관 제안을 차분한 한국어로 안내한다.
 */

export const MIB_BYTES = 1024 * 1024;
export const DEFAULT_STYLUS_SCREEN_PPI = 264;
export const DEFAULT_HEAVY_PRESSURE_THRESHOLD = 0.85;

export type WebtoonPortalId =
  | "naver-webtoon"
  | "kakaopage"
  | "line-webtoon-en"
  | "line-webtoon-jp"
  | "piccoma";

export type SliceImageFormat = "jpeg" | "png" | "webp";
export type ChromaSubsamplingMode = "4:4:4" | "4:2:2" | "4:2:0";
export type KeepOutZoneKind =
  | "speech-balloon"
  | "character-eyes"
  | "character-face"
  | "sfx-lettering"
  | "panel-focal";

export interface PortalSliceSpec {
  readonly portalId: WebtoonPortalId | "custom";
  readonly labelKo: string;
  readonly targetWidthPx: number;
  readonly minSliceHeightPx: number;
  readonly maxSliceHeightPx: number;
  readonly maxSliceBytes: number;
  readonly maxTotalEpisodeBytes: number;
  readonly preferredFormat: SliceImageFormat;
  readonly allowedFormats: readonly SliceImageFormat[];
}

export interface KeepOutZone {
  readonly id: string;
  readonly kind: KeepOutZoneKind;
  readonly topPx: number;
  readonly bottomPx: number;
  readonly paddingPx?: number;
}

export interface EncodingAttemptParams {
  readonly sliceIndex: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly format: SliceImageFormat;
  readonly quality: number;
  readonly chromaSubsampling: ChromaSubsamplingMode;
  readonly quantizationBits: 6 | 7 | 8;
  readonly visualComplexity: number;
}

export interface PortalSafeSliceCompileInput {
  readonly totalHeightPx: number;
  readonly portal: WebtoonPortalId | PortalSliceSpec;
  readonly keepOutZones?: readonly KeepOutZone[];
  readonly rowVisualEnergy?: Float32Array | readonly number[];
  readonly candidateGridStepPx?: number;
  readonly minQuality?: number;
  readonly maxQuality?: number;
  readonly measureEncodedBytes?: (params: EncodingAttemptParams) => number;
}

export interface CompiledPortalSlice {
  readonly sliceIndex: number;
  readonly topPx: number;
  readonly bottomPx: number;
  readonly heightPx: number;
  readonly format: SliceImageFormat;
  readonly selectedQuality: number;
  readonly chromaSubsampling: ChromaSubsamplingMode;
  readonly quantizationBits: 6 | 7 | 8;
  readonly visualComplexity: number;
  readonly estimatedBytes: number;
  readonly sliceByteCap: number;
  readonly budgetUtilizationRatio: number;
  readonly binarySearchSteps: number;
  readonly withinByteCap: boolean;
  readonly intersectsCriticalKeepOut: boolean;
}

export interface PortalSafeSliceReport {
  readonly portalSpec: PortalSliceSpec;
  readonly totalHeightPx: number;
  readonly cutLinesPx: readonly number[];
  readonly slices: readonly CompiledPortalSlice[];
  readonly balloonSplitCount: number;
  readonly eyeFaceSplitCount: number;
  readonly softKeepOutSplitCount: number;
  readonly totalBytes: number;
  readonly allSlicesWithinByteCap: boolean;
  readonly withinTotalEpisodeByteCap: boolean;
  readonly serverCostKrw: 0;
}

export interface ErgonomicStylusSample {
  readonly xPx: number;
  readonly yPx: number;
  readonly timestampMs: number;
  readonly pressure: number;
  readonly tiltXDeg?: number;
  readonly tiltYDeg?: number;
}

export interface ErgonomicStylusStroke {
  readonly strokeId: string;
  readonly kind?: "draw" | "erase" | "pan";
  readonly samples: readonly ErgonomicStylusSample[];
}

export interface StylusUndoEvent {
  readonly timestampMs: number;
  readonly action?: "undo" | "rapid-erase";
}

export interface MicroUndoBurst {
  readonly startTimestampMs: number;
  readonly endTimestampMs: number;
  readonly undoCount: number;
}

export type ErgonomicLoadLevel = "calm" | "moderate" | "elevated" | "rest-recommended";
export type ErgonomicRecommendationTopic =
  | "heavy-pressure-relief"
  | "micro-undo-rhythm"
  | "pen-travel-economy"
  | "continuous-session-break";

export interface ErgonomicCoachRecommendation {
  readonly topic: ErgonomicRecommendationTopic;
  readonly titleKo: string;
  readonly guidanceKo: string;
  readonly shortcutHintKo: string;
}

export interface StylusErgonomicSessionInput {
  readonly strokes: readonly ErgonomicStylusStroke[];
  readonly undoEvents?: readonly StylusUndoEvent[];
  readonly screenPpi?: number;
  readonly heavyPressureThreshold?: number;
  readonly restResetGapMs?: number;
  readonly undoBurstWindowMs?: number;
  readonly undoBurstMinCount?: number;
  readonly breakThresholdMinutes?: number;
}

export interface ErgonomicFatigueReport {
  readonly cumulativeTravelPx: number;
  readonly cumulativeTravelMm: number;
  readonly cumulativeTravelMeters: number;
  readonly activeDrawingDurationMs: number;
  readonly continuousSessionDurationMs: number;
  readonly continuousSessionMinutes: number;
  readonly sustainedHeavyPressureRatio: number;
  readonly peakHeavyPressureStreakMs: number;
  readonly microUndoThrashingBursts: readonly MicroUndoBurst[];
  readonly totalUndoCount: number;
  readonly fatigueLoadLevel: ErgonomicLoadLevel;
  readonly recommendations: readonly ErgonomicCoachRecommendation[];
  readonly serverCostKrw: 0;
}

/** 주요 국내외 웹툰 연재 플랫폼 슬라이스 규격표. */
export const WEBTOON_PORTAL_SLICE_SPECS: Readonly<Record<WebtoonPortalId, PortalSliceSpec>> =
  Object.freeze({
    "naver-webtoon": Object.freeze({
      portalId: "naver-webtoon",
      labelKo: "네이버 웹툰",
      targetWidthPx: 690,
      minSliceHeightPx: 320,
      maxSliceHeightPx: 1280,
      maxSliceBytes: 2 * MIB_BYTES,
      maxTotalEpisodeBytes: 20 * MIB_BYTES,
      preferredFormat: "jpeg",
      allowedFormats: Object.freeze(["jpeg", "png"] as const),
    }),
    kakaopage: Object.freeze({
      portalId: "kakaopage",
      labelKo: "카카오페이지",
      targetWidthPx: 720,
      minSliceHeightPx: 360,
      maxSliceHeightPx: 1400,
      maxSliceBytes: 2 * MIB_BYTES,
      maxTotalEpisodeBytes: 25 * MIB_BYTES,
      preferredFormat: "jpeg",
      allowedFormats: Object.freeze(["jpeg", "png"] as const),
    }),
    "line-webtoon-en": Object.freeze({
      portalId: "line-webtoon-en",
      labelKo: "라인 웹툰 글로벌(EN)",
      targetWidthPx: 800,
      minSliceHeightPx: 320,
      maxSliceHeightPx: 1280,
      maxSliceBytes: 2 * MIB_BYTES,
      maxTotalEpisodeBytes: 20 * MIB_BYTES,
      preferredFormat: "jpeg",
      allowedFormats: Object.freeze(["jpeg", "png"] as const),
    }),
    "line-webtoon-jp": Object.freeze({
      portalId: "line-webtoon-jp",
      labelKo: "라인 망가/웹툰(JP)",
      targetWidthPx: 800,
      minSliceHeightPx: 320,
      maxSliceHeightPx: 1280,
      maxSliceBytes: 2 * MIB_BYTES,
      maxTotalEpisodeBytes: 20 * MIB_BYTES,
      preferredFormat: "jpeg",
      allowedFormats: Object.freeze(["jpeg", "png"] as const),
    }),
    piccoma: Object.freeze({
      portalId: "piccoma",
      labelKo: "픽코마 스마트툰",
      targetWidthPx: 720,
      minSliceHeightPx: 360,
      maxSliceHeightPx: 1500,
      maxSliceBytes: 2 * MIB_BYTES,
      maxTotalEpisodeBytes: 30 * MIB_BYTES,
      preferredFormat: "jpeg",
      allowedFormats: Object.freeze(["jpeg", "webp", "png"] as const),
    }),
  });

const CRITICAL_KEEP_OUT_PENALTY = 1e12;
const SOFT_KEEP_OUT_PENALTY = 1e8;

const QUANTIZATION_TIERS = Object.freeze([
  Object.freeze({ chromaSubsampling: "4:4:4" as const, quantizationBits: 8 as const }),
  Object.freeze({ chromaSubsampling: "4:2:2" as const, quantizationBits: 8 as const }),
  Object.freeze({ chromaSubsampling: "4:2:0" as const, quantizationBits: 8 as const }),
  Object.freeze({ chromaSubsampling: "4:2:0" as const, quantizationBits: 7 as const }),
  Object.freeze({ chromaSubsampling: "4:2:0" as const, quantizationBits: 6 as const }),
]);

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function isCriticalKeepOutKind(kind: KeepOutZoneKind): boolean {
  return kind === "speech-balloon" || kind === "character-eyes" || kind === "character-face";
}

function isCutInsideZone(yPx: number, zone: KeepOutZone, totalHeightPx: number): boolean {
  if (yPx <= 0 || yPx >= totalHeightPx) return false;
  const pad = Math.max(0, zone.paddingPx ?? 12);
  return yPx > Math.max(0, zone.topPx - pad) && yPx < Math.min(totalHeightPx, zone.bottomPx + pad);
}

/** RGBA 세로 원고 버퍼에서 행별 가로 인접 픽셀 변화량(0..1)을 추출한다. */
export function computeStripRowEnergyProfile(
  rgbaBytes: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (rgbaBytes.length < w * h * 4) {
    throw new RangeError("RGBA 바이트 버퍼 길이가 원고 해상도보다 작습니다.");
  }
  const profile = new Float32Array(h);
  if (w === 1) return profile;

  const norm = 1 / ((w - 1) * 3 * 255);
  for (let y = 0; y < h; y += 1) {
    let rowDiff = 0;
    const rowBase = y * w * 4;
    for (let x = 0; x < w - 1; x += 1) {
      const idx = rowBase + x * 4;
      rowDiff +=
        Math.abs(rgbaBytes[idx + 4]! - rgbaBytes[idx]!) +
        Math.abs(rgbaBytes[idx + 5]! - rgbaBytes[idx + 1]!) +
        Math.abs(rgbaBytes[idx + 6]! - rgbaBytes[idx + 2]!);
    }
    profile[y] = clamp(rowDiff * norm * 4, 0, 1);
  }
  return profile;
}

/** 보정된 DCT/서브샘플링 엔트로피 모델로 슬라이스 인코딩 바이트 크기를 단조 증가 함수로 추정한다. */
export function estimateSliceEncodedBytes(params: EncodingAttemptParams): number {
  const pixels = Math.max(1, params.widthPx) * Math.max(1, params.heightPx);
  const normalizedQ = clamp(params.quality, 1, 100) / 100;
  const complexity = clamp(params.visualComplexity, 0.05, 1.0);
  const subScale =
    params.chromaSubsampling === "4:4:4" ? 1.0 : params.chromaSubsampling === "4:2:2" ? 0.76 : 0.58;
  const quantScale = params.quantizationBits === 8 ? 1.0 : params.quantizationBits === 7 ? 0.71 : 0.49;
  const fmtScale = params.format === "png" ? 2.35 : params.format === "webp" ? 0.74 : 1.0;

  const baseBpp = 0.18 + 1.65 * normalizedQ * normalizedQ + 2.9 * Math.pow(normalizedQ, 6);
  const effectiveBpp = baseBpp * (0.32 + 1.45 * complexity) * subScale * quantScale * fmtScale;
  return 640 + Math.ceil((pixels * effectiveBpp) / 8);
}

function optimizeSingleSliceBudget(
  sliceIndex: number,
  topPx: number,
  bottomPx: number,
  spec: PortalSliceSpec,
  sliceByteCap: number,
  visualComplexity: number,
  minQuality: number,
  maxQuality: number,
  measureBytes: (params: EncodingAttemptParams) => number,
): CompiledPortalSlice {
  const heightPx = bottomPx - topPx;
  const format = spec.preferredFormat;
  const qMin = clamp(Math.floor(minQuality), 1, 100);
  const qMax = clamp(Math.floor(maxQuality), qMin, 100);
  let totalSteps = 0;
  let best: {
    quality: number;
    chromaSubsampling: ChromaSubsamplingMode;
    quantizationBits: 6 | 7 | 8;
    bytes: number;
  } | null = null;

  for (let t = 0; t < QUANTIZATION_TIERS.length; t += 1) {
    const tier = QUANTIZATION_TIERS[t]!;
    const minBytes = measureBytes({
      sliceIndex,
      widthPx: spec.targetWidthPx,
      heightPx,
      format,
      quality: qMin,
      chromaSubsampling: tier.chromaSubsampling,
      quantizationBits: tier.quantizationBits,
      visualComplexity,
    });
    totalSteps += 1;
    if (minBytes > sliceByteCap && t < QUANTIZATION_TIERS.length - 1) continue;

    let lo = qMin;
    let hi = qMax;
    let chosenQ = qMin;
    let chosenBytes = minBytes;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const bytes = measureBytes({
        sliceIndex,
        widthPx: spec.targetWidthPx,
        heightPx,
        format,
        quality: mid,
        chromaSubsampling: tier.chromaSubsampling,
        quantizationBits: tier.quantizationBits,
        visualComplexity,
      });
      totalSteps += 1;
      if (bytes <= sliceByteCap) {
        chosenQ = mid;
        chosenBytes = bytes;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    best = {
      quality: chosenQ,
      chromaSubsampling: tier.chromaSubsampling,
      quantizationBits: tier.quantizationBits,
      bytes: chosenBytes,
    };
    if (chosenBytes <= sliceByteCap) break;
  }

  const resolved = best!;
  return {
    sliceIndex,
    topPx,
    bottomPx,
    heightPx,
    format,
    selectedQuality: resolved.quality,
    chromaSubsampling: resolved.chromaSubsampling,
    quantizationBits: resolved.quantizationBits,
    visualComplexity,
    estimatedBytes: resolved.bytes,
    sliceByteCap,
    budgetUtilizationRatio: sliceByteCap > 0 ? resolved.bytes / sliceByteCap : 0,
    binarySearchSteps: totalSteps,
    withinByteCap: resolved.bytes <= sliceByteCap,
    intersectsCriticalKeepOut: false,
  };
}

/**
 * 세로 스크롤 웹툰 원고에 대해 말풍선·눈/얼굴 미절단 동적 계획법(DP)과
 * 슬라이스별 용량 상한(<= 2 MiB 등) 충족 이진 탐색을 수행한다.
 */
export function compilePortalSafeSlices(input: PortalSafeSliceCompileInput): PortalSafeSliceReport {
  const totalHeightPx = Math.max(1, Math.floor(input.totalHeightPx));
  const spec = typeof input.portal === "string" ? WEBTOON_PORTAL_SLICE_SPECS[input.portal] : input.portal;
  const zones = input.keepOutZones ?? [];
  const stepPx = clamp(Math.floor(input.candidateGridStepPx ?? 4), 1, 32);
  const minQuality = input.minQuality ?? 35;
  const maxQuality = input.maxQuality ?? 98;
  const measureBytes = input.measureEncodedBytes ?? estimateSliceEncodedBytes;

  const candidateSet = new Set<number>([0, totalHeightPx]);
  for (let y = stepPx; y < totalHeightPx; y += stepPx) candidateSet.add(y);
  for (let z = 0; z < zones.length; z += 1) {
    const zone = zones[z]!;
    const pad = Math.max(0, zone.paddingPx ?? 12);
    candidateSet.add(clamp(Math.floor(zone.topPx - pad), 0, totalHeightPx));
    candidateSet.add(clamp(Math.ceil(zone.bottomPx + pad), 0, totalHeightPx));
  }

  const candidates = Array.from(candidateSet).sort((a, b) => a - b);
  const n = candidates.length;
  const seamPenalties = new Float64Array(n);

  for (let idx = 1; idx < n - 1; idx += 1) {
    const y = candidates[idx]!;
    let penalty = 0;
    for (let z = 0; z < zones.length; z += 1) {
      const zone = zones[z]!;
      if (isCutInsideZone(y, zone, totalHeightPx)) {
        penalty += isCriticalKeepOutKind(zone.kind) ? CRITICAL_KEEP_OUT_PENALTY : SOFT_KEEP_OUT_PENALTY;
      }
    }
    if (input.rowVisualEnergy && y < input.rowVisualEnergy.length) {
      penalty += Math.max(0, input.rowVisualEnergy[y]!) * 2400;
    }
    seamPenalties[idx] = penalty;
  }

  let cutLines: number[];
  if (totalHeightPx <= spec.maxSliceHeightPx) {
    cutLines = [0, totalHeightPx];
  } else {
    const dpCost = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
    const dpPrev = new Int32Array(n).fill(-1);
    dpCost[0] = 0;
    const idealHeight = 0.78 * spec.maxSliceHeightPx;
    const minTailHeight = Math.min(96, Math.floor(spec.minSliceHeightPx * 0.4));

    for (let j = 1; j < n; j += 1) {
      const yj = candidates[j]!;
      const isFinal = j === n - 1;
      for (let i = j - 1; i >= 0; i -= 1) {
        const height = yj - candidates[i]!;
        if (height > spec.maxSliceHeightPx) break;
        const prevCost = dpCost[i]!;
        if (!Number.isFinite(prevCost)) continue;
        if (height < spec.minSliceHeightPx && !isFinal && height < minTailHeight) continue;

        const heightPenalty =
          height < spec.minSliceHeightPx
            ? 600 + (spec.minSliceHeightPx - height) * 4
            : 80 * Math.pow((height - idealHeight) / spec.maxSliceHeightPx, 2);
        const totalCandidateCost = prevCost + seamPenalties[j]! + heightPenalty + 10;
        if (totalCandidateCost < dpCost[j]!) {
          dpCost[j] = totalCandidateCost;
          dpPrev[j] = i;
        }
      }
    }

    if (dpPrev[n - 1]! < 0) {
      cutLines = [0];
      for (let cursor = spec.maxSliceHeightPx; cursor < totalHeightPx; cursor += spec.maxSliceHeightPx) {
        cutLines.push(cursor);
      }
      cutLines.push(totalHeightPx);
    } else {
      const reversed: number[] = [];
      for (let cur = n - 1; cur >= 0; cur = dpPrev[cur]!) {
        reversed.push(candidates[cur]!);
        if (cur === 0) break;
      }
      cutLines = reversed.reverse();
    }
  }

  let balloonSplitCount = 0;
  let eyeFaceSplitCount = 0;
  let softKeepOutSplitCount = 0;
  const criticalCutFlags = new Set<number>();

  for (let c = 1; c < cutLines.length - 1; c += 1) {
    const cutY = cutLines[c]!;
    for (let z = 0; z < zones.length; z += 1) {
      const zone = zones[z]!;
      if (!isCutInsideZone(cutY, zone, totalHeightPx)) continue;
      if (zone.kind === "speech-balloon") {
        balloonSplitCount += 1;
        criticalCutFlags.add(c);
      } else if (zone.kind === "character-eyes" || zone.kind === "character-face") {
        eyeFaceSplitCount += 1;
        criticalCutFlags.add(c);
      } else {
        softKeepOutSplitCount += 1;
      }
    }
  }

  const sliceCount = cutLines.length - 1;
  const sliceComplexities = new Float64Array(sliceCount);
  for (let s = 0; s < sliceCount; s += 1) {
    const top = cutLines[s]!;
    const bottom = cutLines[s + 1]!;
    if (input.rowVisualEnergy && input.rowVisualEnergy.length > 0) {
      let sum = 0;
      let count = 0;
      for (let r = top; r < Math.min(bottom, input.rowVisualEnergy.length); r += 1) {
        sum += clamp(input.rowVisualEnergy[r]!, 0, 1);
        count += 1;
      }
      sliceComplexities[s] = count > 0 ? clamp(sum / count, 0.08, 1.0) : 0.45;
    } else {
      let overlapPx = 0;
      for (let z = 0; z < zones.length; z += 1) {
        const zone = zones[z]!;
        const ov = Math.min(bottom, zone.bottomPx) - Math.max(top, zone.topPx);
        if (ov > 0) overlapPx += ov;
      }
      sliceComplexities[s] = 0.35 + 0.45 * clamp(overlapPx / Math.max(1, bottom - top), 0, 1);
    }
  }

  const buildSlices = (cap: number): CompiledPortalSlice[] =>
    Array.from({ length: sliceCount }, (_, s) => ({
      ...optimizeSingleSliceBudget(
        s,
        cutLines[s]!,
        cutLines[s + 1]!,
        spec,
        cap,
        sliceComplexities[s]!,
        minQuality,
        maxQuality,
        measureBytes,
      ),
      intersectsCriticalKeepOut: criticalCutFlags.has(s) || criticalCutFlags.has(s + 1),
    }));

  let slices = buildSlices(spec.maxSliceBytes);
  let totalBytes = slices.reduce((acc, item) => acc + item.estimatedBytes, 0);
  if (totalBytes > spec.maxTotalEpisodeBytes && sliceCount > 0) {
    slices = buildSlices(Math.min(spec.maxSliceBytes, Math.floor(spec.maxTotalEpisodeBytes / sliceCount)));
    totalBytes = slices.reduce((acc, item) => acc + item.estimatedBytes, 0);
  }

  return {
    portalSpec: spec,
    totalHeightPx,
    cutLinesPx: Object.freeze(cutLines),
    slices: Object.freeze(slices.map((s) => Object.freeze(s))),
    balloonSplitCount,
    eyeFaceSplitCount,
    softKeepOutSplitCount,
    totalBytes,
    allSlicesWithinByteCap: slices.every((s) => s.withinByteCap),
    withinTotalEpisodeByteCap: totalBytes <= spec.maxTotalEpisodeBytes,
    serverCostKrw: 0,
  };
}

/**
 * 타임스탬프가 기록된 스타일러스 스트로크와 실행 취소 이력을 분석하여
 * 물리 이동 거리(mm/px), 고필압(> 0.85) 지속 비율, 실행 취소 연타, 연속 작업 시간을 산출한다.
 */
export function analyzeStylusErgonomicSession(
  input: StylusErgonomicSessionInput,
): ErgonomicFatigueReport {
  const screenPpi = Math.max(72, input.screenPpi ?? DEFAULT_STYLUS_SCREEN_PPI);
  const mmPerPx = 25.4 / screenPpi;
  const heavyThreshold = clamp(input.heavyPressureThreshold ?? DEFAULT_HEAVY_PRESSURE_THRESHOLD, 0.1, 0.99);
  const restResetGapMs = Math.max(30_000, input.restResetGapMs ?? 5 * 60 * 1000);
  const undoWindowMs = Math.max(1_000, input.undoBurstWindowMs ?? 10_000);
  const undoMinCount = Math.max(2, Math.floor(input.undoBurstMinCount ?? 4));
  const breakThresholdMin = Math.max(10, input.breakThresholdMinutes ?? 40);

  let cumulativeTravelPx = 0;
  let activeDrawingDurationMs = 0;
  let heavyPressureDurationMs = 0;
  let totalSampleWeight = 0;
  let heavySampleWeight = 0;
  let peakHeavyPressureStreakMs = 0;
  const strokeIntervals: Array<{ startMs: number; endMs: number }> = [];

  for (let s = 0; s < input.strokes.length; s += 1) {
    const samples = input.strokes[s]!.samples;
    if (samples.length === 0) continue;

    const first = samples[0]!;
    const last = samples[samples.length - 1]!;
    strokeIntervals.push({ startMs: first.timestampMs, endMs: Math.max(first.timestampMs, last.timestampMs) });

    if (samples.length === 1) {
      totalSampleWeight += 1;
      if (first.pressure > heavyThreshold) heavySampleWeight += 1;
      continue;
    }

    let strokeHeavyStreak = 0;
    for (let i = 1; i < samples.length; i += 1) {
      const prev = samples[i - 1]!;
      const curr = samples[i]!;
      cumulativeTravelPx += Math.hypot(curr.xPx - prev.xPx, curr.yPx - prev.yPx);
      const dt = Math.max(0, curr.timestampMs - prev.timestampMs);
      activeDrawingDurationMs += dt;

      const isHeavy =
        (prev.pressure > heavyThreshold && curr.pressure > heavyThreshold) ||
        0.5 * (prev.pressure + curr.pressure) > heavyThreshold;
      const weight = dt > 0 ? dt : 1;
      totalSampleWeight += weight;

      if (isHeavy) {
        heavySampleWeight += weight;
        heavyPressureDurationMs += dt;
        strokeHeavyStreak += dt;
        if (strokeHeavyStreak > peakHeavyPressureStreakMs) peakHeavyPressureStreakMs = strokeHeavyStreak;
      } else {
        strokeHeavyStreak = 0;
      }
    }
  }

  strokeIntervals.sort((a, b) => a.startMs - b.startMs);
  let longestContinuousMs = 0;
  if (strokeIntervals.length > 0) {
    let blockStart = strokeIntervals[0]!.startMs;
    let blockEnd = strokeIntervals[0]!.endMs;
    for (let i = 1; i < strokeIntervals.length; i += 1) {
      const item = strokeIntervals[i]!;
      if (item.startMs - blockEnd >= restResetGapMs) {
        if (blockEnd - blockStart > longestContinuousMs) longestContinuousMs = blockEnd - blockStart;
        blockStart = item.startMs;
        blockEnd = item.endMs;
      } else if (item.endMs > blockEnd) {
        blockEnd = item.endMs;
      }
    }
    if (blockEnd - blockStart > longestContinuousMs) longestContinuousMs = blockEnd - blockStart;
  }

  const sortedUndos = [...(input.undoEvents ?? [])].map((e) => e.timestampMs).sort((a, b) => a - b);
  const bursts: MicroUndoBurst[] = [];
  let winStartIdx = 0;
  while (winStartIdx < sortedUndos.length) {
    const startTs = sortedUndos[winStartIdx]!;
    let winEndIdx = winStartIdx;
    while (winEndIdx + 1 < sortedUndos.length && sortedUndos[winEndIdx + 1]! - startTs <= undoWindowMs) {
      winEndIdx += 1;
    }
    const count = winEndIdx - winStartIdx + 1;
    if (count >= undoMinCount) {
      bursts.push(Object.freeze({ startTimestampMs: startTs, endTimestampMs: sortedUndos[winEndIdx]!, undoCount: count }));
      winStartIdx = winEndIdx + 1;
    } else {
      winStartIdx += 1;
    }
  }

  const cumulativeTravelMm = cumulativeTravelPx * mmPerPx;
  const cumulativeTravelMeters = cumulativeTravelMm / 1000;
  const sustainedHeavyPressureRatio = totalSampleWeight > 0 ? heavySampleWeight / totalSampleWeight : 0;
  const continuousSessionMinutes = longestContinuousMs / 60_000;
  const recommendations: ErgonomicCoachRecommendation[] = [];

  if (sustainedHeavyPressureRatio >= 0.35 || heavyPressureDurationMs >= 15_000) {
    recommendations.push(
      Object.freeze({
        topic: "heavy-pressure-relief",
        titleKo: "필압 곡선을 조금 가볍게 낮춰보세요",
        guidanceKo:
          "강한 필압(> 85%)으로 길게 누르는 구간이 자주 감지됐어요. 최대 굵기에 도달하는 필압 상한을 낮추면 손가락에 힘을 덜 주고도 선명한 먹선을 그을 수 있어요.",
        shortcutHintKo: "브러시 설정 > 필압 감도 곡선 완만하게 조정",
      }),
    );
  }
  if (bursts.length > 0) {
    recommendations.push(
      Object.freeze({
        topic: "micro-undo-rhythm",
        titleKo: "실행 취소 연타 대신 가벼운 러프·변형 도구를 써보세요",
        guidanceKo:
          "짧은 시간 안에 같은 선을 여러 번 지우고 다시 긋고 있어요. 화면을 살짝 축소해 큰 흐름을 잡거나 올가미 변형으로 선 위치를 바로잡으면 손목 왕복이 확 줄어들어요.",
        shortcutHintKo: "Ctrl+T 자유 변형 · Z 줌 축소 점검 · R 캔버스 회전",
      }),
    );
  }
  if (cumulativeTravelMeters >= 12) {
    recommendations.push(
      Object.freeze({
        topic: "pen-travel-economy",
        titleKo: "큰 면적 채색은 채우기·확장 브러시로 동선을 줄여보세요",
        guidanceKo:
          "누적 펜 이동 거리가 길어졌어요. 넓은 어둠이나 톤 영역은 올가미 채우기나 브러시 크기 단축키로 손목 회전 반경을 아껴보세요.",
        shortcutHintKo: "[ / ] 브러시 크기 즉시 변경 · Alt+클릭 스포이드",
      }),
    );
  }
  if (continuousSessionMinutes >= breakThresholdMin) {
    recommendations.push(
      Object.freeze({
        topic: "continuous-session-break",
        titleKo: "잠시 펜을 내려놓고 손과 어깨의 긴장을 풀어주세요",
        guidanceKo: `${Math.round(continuousSessionMinutes)}분 동안 쉬지 않고 집중해 작업했어요. 1~2분만 먼 곳을 바라보며 손바닥과 어깨를 가볍게 펴주면 다음 컷 선맛이 한결 안정돼요.`,
        shortcutHintKo: "Ctrl+S 중간 저장 후 2분 휴식",
      }),
    );
  }

  let score = 0;
  if (sustainedHeavyPressureRatio >= 0.35) score += 2;
  else if (sustainedHeavyPressureRatio >= 0.18) score += 1;
  if (bursts.length >= 2) score += 2;
  else if (bursts.length === 1) score += 1;
  if (continuousSessionMinutes >= breakThresholdMin) score += 2;
  else if (continuousSessionMinutes >= breakThresholdMin * 0.6) score += 1;
  if (cumulativeTravelMeters >= 15) score += 1;

  return {
    cumulativeTravelPx,
    cumulativeTravelMm,
    cumulativeTravelMeters,
    activeDrawingDurationMs,
    continuousSessionDurationMs: longestContinuousMs,
    continuousSessionMinutes,
    sustainedHeavyPressureRatio,
    peakHeavyPressureStreakMs,
    microUndoThrashingBursts: Object.freeze(bursts),
    totalUndoCount: sortedUndos.length,
    fatigueLoadLevel: score >= 5 ? "rest-recommended" : score >= 3 ? "elevated" : score >= 1 ? "moderate" : "calm",
    recommendations: Object.freeze(recommendations),
    serverCostKrw: 0,
  };
}
