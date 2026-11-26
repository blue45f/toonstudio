/**
 * Wasm64 Wave 11 Apex — 안구 도약(Saccade)·인지 부하 추정기, Kubelka-Munk 8밴드 분광 감산 혼색기,
 * 그리고 8자유도 사영 3×3 호모그래피(Homography) 소품·간판 원근 데칼 매퍼.
 *
 * - 외부 서버 호출 0회(₩0), 브라우저 스토리지 직접 접근 0건, 순수 결정론 수치 연산으로 동작한다.
 * - 말풍선 읽기 순서에 따른 시야각 도약 비용·Fitts 난이도·역-Z 교차(`dx`, `dy` 역전)와 컷당 과밀도를 판정한다.
 * - sRGB 물감을 400..700nm 8밴드 반사율 스펙트럼으로 변환하고 Kubelka-Munk 흡수/산란 비(`K/S`)로 감산 혼합한다.
 * - 4개 원근 모서리에서 정규화 DLT + 가우스 부분 피벗 소거로 3×3 호모그래피 `H`를 풀고 슈퍼샘플링 워핑한다.
 */

export const SPECTRAL_WAVELENGTHS_NM = [400, 443, 486, 529, 571, 614, 657, 700] as const;
export const DEFAULT_VIEWING_DISTANCE_MM = 350;
export const DEFAULT_DISPLAY_PPI = 326;
export const DEFAULT_MAX_CUT_LOAD_SCORE = 72;
export const DEFAULT_MAX_CUT_READING_MS = 6500;

export type SpectralVector8 = readonly [number, number, number, number, number, number, number, number];
export type SrgbByteTuple = readonly [number, number, number];
export type Point2D = readonly [number, number];
export type QuadCorners2D = readonly [Point2D, Point2D, Point2D, Point2D];
export type HomographyMatrix3x3 = readonly [number, number, number, number, number, number, number, number, number];
export type ReadingScanDirection = "ltr" | "rtl";
export type GazeCrossoverKind =
  | "reverse-z-dx-inversion"
  | "upward-dy-regression"
  | "gaze-segment-intersection"
  | "excessive-angular-jump";

export interface OrderedSpeechBalloon {
  readonly balloonId: string; readonly cutId: string; readonly readingOrder: number;
  readonly centerX: number; readonly centerY: number; readonly widthPx: number; readonly heightPx: number;
  readonly text: string; readonly fontSizePx?: number;
}

export interface CutViewportBounds {
  readonly cutId: string; readonly x: number; readonly y: number; readonly widthPx: number; readonly heightPx: number;
}

export interface OculomotorEstimatorOptions {
  readonly balloons: readonly OrderedSpeechBalloon[]; readonly cuts?: readonly CutViewportBounds[];
  readonly readingDirection?: ReadingScanDirection;
  readonly viewingDistanceMm?: number; readonly displayPpi?: number;
  readonly maxCutCognitiveLoadScore?: number; readonly maxCutReadingDurationMs?: number;
}

export interface BalloonFixationMetric {
  readonly balloonId: string; readonly cutId: string; readonly readingOrder: number;
  readonly lexicalUnitCount: number; readonly punctuationPauseCount: number;
  readonly estimatedFixationCount: number; readonly fixationDurationMs: number;
}

export interface SaccadeTransitionMetric {
  readonly fromBalloonId: string; readonly toBalloonId: string; readonly sameCut: boolean;
  readonly dxPx: number; readonly dyPx: number; readonly distancePx: number;
  readonly visualAngleDeg: number; readonly fittsIndexOfDifficultyBits: number;
  readonly saccadeFlightMs: number; readonly saccadeLatencyMs: number;
  readonly angularJumpCost: number; readonly crossovers: readonly GazeCrossoverKind[];
}

export interface GazeAnomalyFlag {
  readonly kind: GazeCrossoverKind | "excessive-cut-cognitive-density";
  readonly cutId: string; readonly balloonIds: readonly string[];
  readonly severity: "warn" | "critical"; readonly messageKo: string;
}

export interface CutReadingLoadSummary {
  readonly cutId: string; readonly balloonCount: number; readonly totalLexicalUnits: number;
  readonly balloonAreaRatio: number; readonly totalReadingDurationMs: number;
  readonly cognitiveLoadScore: number; readonly overloaded: boolean;
}

export interface OculomotorReadingLoadReport {
  readonly balloonFixations: readonly BalloonFixationMetric[];
  readonly saccades: readonly SaccadeTransitionMetric[];
  readonly cutSummaries: readonly CutReadingLoadSummary[];
  readonly anomalies: readonly GazeAnomalyFlag[];
  readonly totalEpisodeReadingDurationMs: number;
  readonly reverseZCrossoverCount: number; readonly overloadedCutCount: number; readonly serverCostKrw: 0;
}

export interface PigmentLayerInput {
  readonly srgb: SrgbByteTuple; readonly concentration: number;
  /** 안료 산란력 계수(기본값 1.0, 티타늄 화이트 등 불투명 안료는 1.5~2.5). */
  readonly scatteringStrength?: number;
}

export type SpectralUpliftMode = "pigment-natural" | "metamer-calibrated";

export interface KubelkaMunkMixResult {
  readonly srgb: SrgbByteTuple;
  readonly linearRgb: readonly [number, number, number];
  readonly cieXyzD65: readonly [number, number, number];
  readonly mixedReflectance: SpectralVector8; readonly mixedKsRatio: SpectralVector8;
  readonly naiveAdditiveSrgb: SrgbByteTuple; readonly chromaGainOverAdditive: number; readonly serverCostKrw: 0;
}

export interface HomographySolveResult {
  readonly matrix: HomographyMatrix3x3; readonly inverseMatrix: HomographyMatrix3x3;
  readonly determinant: number; readonly maxCornerReprojectionErrorPx: number;
}

export type HomographyAntiAliasingMode = "bilinear" | "supersample-2x2" | "supersample-4x4";

export interface HomographyDecalWarpInput {
  readonly srcRgba: Uint8Array | Uint8ClampedArray;
  readonly srcWidth: number; readonly srcHeight: number; readonly dstWidth: number; readonly dstHeight: number;
  readonly targetQuad: QuadCorners2D; readonly srcQuad?: QuadCorners2D;
  readonly dstRgba?: Uint8ClampedArray; readonly opacity?: number;
  readonly antiAliasing?: HomographyAntiAliasingMode;
  readonly tileRepeatX?: number; readonly tileRepeatY?: number;
}

export interface HomographyDecalWarpResult {
  readonly rgba: Uint8ClampedArray; readonly width: number; readonly height: number;
  readonly homography: HomographySolveResult;
  readonly touchedBounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
  readonly coveredPixelCount: number; readonly serverCostKrw: 0;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

// ============================================================================
// 1. Oculomotor Saccade & Reading Load Estimator
// ============================================================================

function analyzeTextLexicalUnits(text: string): { readonly lexicalUnits: number; readonly punctuationPauses: number } {
  let lexicalUnits = 0;
  let punctuationPauses = 0;
  let inAsciiToken = false;
  let asciiRunLength = 0;
  const flushAscii = (): void => {
    if (inAsciiToken) {
      lexicalUnits += Math.max(1, Math.ceil(asciiRunLength / 4.5));
      inAsciiToken = false;
      asciiRunLength = 0;
    }
  };
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x20 || code === 0x00a0 || code === 0x3000) {
      flushAscii();
      continue;
    }
    const isHangulOrCjk =
      (code >= 0xac00 && code <= 0xd7a3) || (code >= 0x3131 && code <= 0x318e) ||
      (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3040 && code <= 0x30ff);
    const isPunctuation =
      code === 0x21 || code === 0x2c || code === 0x2e || code === 0x3a || code === 0x3b ||
      code === 0x3f || code === 0x2026 || code === 0x3001 || code === 0x3002 || code === 0xff01 || code === 0xff1f;
    if (isHangulOrCjk) {
      flushAscii();
      lexicalUnits += 1;
    } else if (isPunctuation) {
      flushAscii();
      punctuationPauses += 1;
    } else {
      inAsciiToken = true;
      asciiRunLength += 1;
    }
  }
  flushAscii();
  return { lexicalUnits, punctuationPauses };
}

function segmentsProperlyIntersect(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D): boolean {
  const cross = (o: Point2D, p: Point2D, q: Point2D): number =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(a1, a2, b1);
  const d2 = cross(a1, a2, b2);
  const d3 = cross(b1, b2, a1);
  const d4 = cross(b1, b2, a2);
  const eps = 1e-6;
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
}

/**
 * 정렬된 말풍선 시퀀스에 대해 인간 안구 응시 시간(Fixation), 시야각 도약(Saccade),
 * Fitts 목표 포착 난이도, 역-Z 시선 교차(`dx`, `dy` 역전) 및 컷별 인지 부하를 추정한다.
 */
export function estimateOculomotorReadingLoad(options: OculomotorEstimatorOptions): OculomotorReadingLoadReport {
  const readingDirection = options.readingDirection ?? "ltr";
  const viewingDistanceMm = Math.max(120, options.viewingDistanceMm ?? DEFAULT_VIEWING_DISTANCE_MM);
  const displayPpi = Math.max(72, options.displayPpi ?? DEFAULT_DISPLAY_PPI);
  const maxCutLoadScore = options.maxCutCognitiveLoadScore ?? DEFAULT_MAX_CUT_LOAD_SCORE;
  const maxCutReadingMs = options.maxCutReadingDurationMs ?? DEFAULT_MAX_CUT_READING_MS;
  const mmPerPx = 25.4 / displayPpi;

  const sortedBalloons = [...options.balloons].sort((a, b) => a.readingOrder - b.readingOrder);
  const cutMap = new Map<string, CutViewportBounds>();
  for (const cut of options.cuts ?? []) cutMap.set(cut.cutId, cut);

  const balloonFixations: BalloonFixationMetric[] = [];
  const fixationById = new Map<string, BalloonFixationMetric>();

  for (const balloon of sortedBalloons) {
    const { lexicalUnits, punctuationPauses } = analyzeTextLexicalUnits(balloon.text);
    const estimatedFixationCount = lexicalUnits === 0 ? 1 : Math.max(1, Math.ceil(lexicalUnits / 4.5));
    const fontSizePx = Math.max(8, balloon.fontSizePx ?? 15);
    const crowdingPenalty = fontSizePx < 13 ? 1 + (13 - fontSizePx) * 0.08 : 1;
    const rawFixationMs = (35 + estimatedFixationCount * 225 + punctuationPauses * 28) * crowdingPenalty;
    const metric: BalloonFixationMetric = {
      balloonId: balloon.balloonId, cutId: balloon.cutId, readingOrder: balloon.readingOrder,
      lexicalUnitCount: lexicalUnits, punctuationPauseCount: punctuationPauses,
      estimatedFixationCount, fixationDurationMs: Math.round(rawFixationMs * 100) / 100,
    };
    balloonFixations.push(metric);
    fixationById.set(balloon.balloonId, metric);
  }

  const saccades: SaccadeTransitionMetric[] = [];
  const anomalies: GazeAnomalyFlag[] = [];
  const cutJumpCostAccum = new Map<string, number>();
  const cutSaccadeMsAccum = new Map<string, number>();
  const cutReverseCountAccum = new Map<string, number>();

  for (let i = 0; i + 1 < sortedBalloons.length; i += 1) {
    const prev = sortedBalloons[i]!;
    const next = sortedBalloons[i + 1]!;
    const sameCut = prev.cutId === next.cutId;
    const dxPx = next.centerX - prev.centerX;
    const dyPx = next.centerY - prev.centerY;
    const distancePx = Math.hypot(dxPx, dyPx);
    const visualAngleDeg = 2 * (180 / Math.PI) * Math.atan((distancePx * mmPerPx) / (2 * viewingDistanceMm));

    const ux = distancePx > 1e-6 ? Math.abs(dxPx) / distancePx : 1;
    const uy = distancePx > 1e-6 ? Math.abs(dyPx) / distancePx : 0;
    const effectiveTargetWidthPx = Math.max(8, ux * Math.max(8, next.widthPx) + uy * Math.max(8, next.heightPx));
    const fittsIndexOfDifficultyBits = Math.log2(1 + distancePx / effectiveTargetWidthPx);
    const saccadeFlightMs = 21 + 2.2 * visualAngleDeg;
    const saccadeLatencyMs = 175 + (visualAngleDeg > 14 ? 65 : 0);
    const crossovers: GazeCrossoverKind[] = [];

    const rowBandHeightPx = Math.max(prev.heightPx, next.heightPx) * 0.75;
    const horizontalTolPx = Math.min(prev.widthPx, next.widthPx) * 0.18;
    const verticalTolPx = Math.min(prev.heightPx, next.heightPx) * 0.35;

    if (dyPx < -verticalTolPx) {
      crossovers.push("upward-dy-regression");
      anomalies.push({ kind: "upward-dy-regression", cutId: next.cutId, balloonIds: [prev.balloonId, next.balloonId], severity: sameCut ? "critical" : "warn", messageKo: "시선이 아래에서 위로 거슬러 올라갑니다(dy 역전). 먼저 읽는 말풍선을 위쪽에 배치해 주세요." });
    }
    const isHorizontalReverse = Math.abs(dyPx) <= rowBandHeightPx && ((readingDirection === "ltr" && dxPx < -horizontalTolPx) || (readingDirection === "rtl" && dxPx > horizontalTolPx));
    if (isHorizontalReverse) {
      crossovers.push("reverse-z-dx-inversion");
      anomalies.push({ kind: "reverse-z-dx-inversion", cutId: next.cutId, balloonIds: [prev.balloonId, next.balloonId], severity: "critical", messageKo: "같은 가로열에서 읽기 진행 반대 방향으로 시선이 역행합니다(역-Z dx 역전). 말풍선 좌우 순서나 세로 단차를 조정해 주세요." });
    }
    if (sameCut && visualAngleDeg > 16) {
      crossovers.push("excessive-angular-jump");
      anomalies.push({ kind: "excessive-angular-jump", cutId: next.cutId, balloonIds: [prev.balloonId, next.balloonId], severity: "warn", messageKo: "한 컷 안에서 말풍선 간 시야각 도약 폭이 너무 큽니다. 대사 간격을 줄이거나 시선 유도 요소를 배치해 주세요." });
    }
    if (sameCut && i >= 2) {
      for (let j = 0; j <= i - 2; j += 1) {
        const earlierStart = sortedBalloons[j]!; const earlierEnd = sortedBalloons[j + 1]!;
        if (earlierStart.cutId !== prev.cutId || earlierEnd.cutId !== prev.cutId) continue;
        if (segmentsProperlyIntersect([earlierStart.centerX, earlierStart.centerY], [earlierEnd.centerX, earlierEnd.centerY], [prev.centerX, prev.centerY], [next.centerX, next.centerY])) {
          crossovers.push("gaze-segment-intersection");
          anomalies.push({ kind: "gaze-segment-intersection", cutId: next.cutId, balloonIds: [earlierStart.balloonId, earlierEnd.balloonId, prev.balloonId, next.balloonId], severity: "critical", messageKo: "컷 내부 말풍선 시선 동선이 서로 X자로 꼬여 교차합니다. 말풍선 배치를 자연스러운 Z 흐름으로 풀어 주세요." });
          break;
        }
      }
    }
    const angularJumpCost = Math.round((visualAngleDeg * 1.6 + fittsIndexOfDifficultyBits * 4.5 + crossovers.length * 14) * 100) / 100;
    saccades.push({
      fromBalloonId: prev.balloonId, toBalloonId: next.balloonId, sameCut,
      dxPx: Math.round(dxPx * 100) / 100, dyPx: Math.round(dyPx * 100) / 100, distancePx: Math.round(distancePx * 100) / 100,
      visualAngleDeg: Math.round(visualAngleDeg * 1000) / 1000, fittsIndexOfDifficultyBits: Math.round(fittsIndexOfDifficultyBits * 1000) / 1000,
      saccadeFlightMs: Math.round(saccadeFlightMs * 100) / 100, saccadeLatencyMs, angularJumpCost, crossovers,
    });
    if (sameCut) {
      cutJumpCostAccum.set(next.cutId, (cutJumpCostAccum.get(next.cutId) ?? 0) + angularJumpCost);
      cutSaccadeMsAccum.set(next.cutId, (cutSaccadeMsAccum.get(next.cutId) ?? 0) + saccadeFlightMs + saccadeLatencyMs);
    }
    if (crossovers.length > 0) cutReverseCountAccum.set(next.cutId, (cutReverseCountAccum.get(next.cutId) ?? 0) + crossovers.length);
  }

  const balloonsByCut = new Map<string, OrderedSpeechBalloon[]>();
  for (const balloon of sortedBalloons) {
    const bucket = balloonsByCut.get(balloon.cutId);
    if (bucket) bucket.push(balloon); else balloonsByCut.set(balloon.cutId, [balloon]);
  }
  const cutSummaries: CutReadingLoadSummary[] = [];
  let overloadedCutCount = 0;

  for (const [cutId, cutBalloons] of balloonsByCut.entries()) {
    let totalLexicalUnits = 0; let totalFixationMs = 0; let balloonAreaSum = 0;
    let minX = Number.POSITIVE_INFINITY; let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY; let maxY = Number.NEGATIVE_INFINITY;
    for (const b of cutBalloons) {
      const fix = fixationById.get(b.balloonId);
      totalLexicalUnits += fix?.lexicalUnitCount ?? 0; totalFixationMs += fix?.fixationDurationMs ?? 0;
      balloonAreaSum += Math.max(1, b.widthPx) * Math.max(1, b.heightPx);
      minX = Math.min(minX, b.centerX - b.widthPx * 0.5); minY = Math.min(minY, b.centerY - b.heightPx * 0.5);
      maxX = Math.max(maxX, b.centerX + b.widthPx * 0.5); maxY = Math.max(maxY, b.centerY + b.heightPx * 0.5);
    }
    const declaredCut = cutMap.get(cutId);
    const cutArea = declaredCut ? Math.max(1, declaredCut.widthPx * declaredCut.heightPx) : Math.max(120_000, Math.max(1, maxX - minX) * Math.max(1, maxY - minY) * 1.35);
    const balloonAreaRatio = clamp(balloonAreaSum / cutArea, 0, 1);
    const totalReadingDurationMs = totalFixationMs + (cutSaccadeMsAccum.get(cutId) ?? 0);
    const jumpCost = cutJumpCostAccum.get(cutId) ?? 0;
    const reverseCount = cutReverseCountAccum.get(cutId) ?? 0;
    const cognitiveLoadScore = clamp(Math.round((totalLexicalUnits * 0.95 + Math.max(0, cutBalloons.length - 1) * 7.5 + balloonAreaRatio * 68 + jumpCost * 0.65 + reverseCount * 12) * 100) / 100, 0, 100);
    const overloaded = cognitiveLoadScore > maxCutLoadScore || totalReadingDurationMs > maxCutReadingMs || balloonAreaRatio > 0.4;
    if (overloaded) {
      overloadedCutCount += 1;
      anomalies.push({ kind: "excessive-cut-cognitive-density", cutId, balloonIds: cutBalloons.map((b) => b.balloonId), severity: cognitiveLoadScore > 85 ? "critical" : "warn", messageKo: "한 컷의 대사 밀도와 시선 체류 시간이 과도합니다. 말풍선을 다음 컷으로 나누거나 문장을 간결하게 줄여 주세요." });
    }
    cutSummaries.push({ cutId, balloonCount: cutBalloons.length, totalLexicalUnits, balloonAreaRatio: Math.round(balloonAreaRatio * 10000) / 10000, totalReadingDurationMs: Math.round(totalReadingDurationMs * 100) / 100, cognitiveLoadScore, overloaded });
  }

  let totalEpisodeReadingDurationMs = 0;
  for (const f of balloonFixations) totalEpisodeReadingDurationMs += f.fixationDurationMs;
  for (const s of saccades) totalEpisodeReadingDurationMs += s.saccadeFlightMs + s.saccadeLatencyMs;
  let reverseZCrossoverCount = 0;
  for (const s of saccades) reverseZCrossoverCount += s.crossovers.length;

  return {
    balloonFixations, saccades, cutSummaries, anomalies,
    totalEpisodeReadingDurationMs: Math.round(totalEpisodeReadingDurationMs * 100) / 100,
    reverseZCrossoverCount, overloadedCutCount, serverCostKrw: 0,
  };
}

// ============================================================================
// 2. Kubelka-Munk 8-Band Spectral Subtractive Paint Mixer (400..700nm)
// ============================================================================

const MIN_REFLECTANCE = 0.006;
const MAX_REFLECTANCE = 0.992;
const RAW_D65_X: SpectralVector8 = [1.183, 36.952, 5.347, 16.727, 74.91, 84.847, 19.046, 0.816];
const RAW_D65_Y: SpectralVector8 = [0.033, 2.927, 19.696, 91.214, 90.863, 40.408, 7.1, 0.294];
const RAW_D65_Z: SpectralVector8 = [5.619, 186.582, 65.347, 4.784, 0.192, 0.027, 0.0, 0.0];

function normalizeQuadratureWeights(raw: SpectralVector8, targetSum: number): SpectralVector8 {
  let sum = 0;
  for (let i = 0; i < 8; i += 1) sum += raw[i]!;
  const s = targetSum / sum;
  return [raw[0] * s, raw[1] * s, raw[2] * s, raw[3] * s, raw[4] * s, raw[5] * s, raw[6] * s, raw[7] * s];
}

const CIE_X_WEIGHTS_D65 = normalizeQuadratureWeights(RAW_D65_X, 0.95047);
const CIE_Y_WEIGHTS_D65 = normalizeQuadratureWeights(RAW_D65_Y, 1.0);
const CIE_Z_WEIGHTS_D65 = normalizeQuadratureWeights(RAW_D65_Z, 1.08883);

const PIGMENT_BASIS_WHITE: SpectralVector8 = [0.988, 0.988, 0.988, 0.988, 0.988, 0.988, 0.988, 0.988];
const PIGMENT_BASIS_BLACK: SpectralVector8 = [0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008];
const PIGMENT_BASIS_YELLOW: SpectralVector8 = [0.012, 0.018, 0.37, 0.895, 0.962, 0.968, 0.968, 0.968];
const PIGMENT_BASIS_BLUE: SpectralVector8 = [0.54, 0.895, 0.65, 0.295, 0.016, 0.011, 0.011, 0.011];
const PIGMENT_BASIS_CYAN: SpectralVector8 = [0.32, 0.76, 0.925, 0.79, 0.075, 0.016, 0.012, 0.012];
const PIGMENT_BASIS_GREEN: SpectralVector8 = [0.025, 0.075, 0.51, 0.895, 0.22, 0.022, 0.014, 0.014];
const PIGMENT_BASIS_RED: SpectralVector8 = [0.016, 0.014, 0.016, 0.024, 0.245, 0.885, 0.96, 0.968];
const PIGMENT_BASIS_MAGENTA: SpectralVector8 = [0.58, 0.74, 0.165, 0.024, 0.095, 0.79, 0.93, 0.945];

export function srgbChannelToLinear(srgbByte: number): number {
  const v = clamp(srgbByte / 255, 0, 1);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearChannelToSrgbByte(linear: number): number {
  const c = clamp(linear, 0, 1);
  const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(clamp(encoded * 255, 0, 255));
}

function spectralToCieXyzD65(spectrum: SpectralVector8): readonly [number, number, number] {
  let x = 0; let y = 0; let z = 0;
  for (let i = 0; i < 8; i += 1) {
    const r = clamp(spectrum[i]!, 0, 1);
    x += CIE_X_WEIGHTS_D65[i]! * r;
    y += CIE_Y_WEIGHTS_D65[i]! * r;
    z += CIE_Z_WEIGHTS_D65[i]! * r;
  }
  return [x, y, z];
}

function cieXyzD65ToLinearRgb(xyz: readonly [number, number, number]): readonly [number, number, number] {
  const [x, y, z] = xyz;
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

function invertGeneral3x3(m: HomographyMatrix3x3): { readonly inverse: HomographyMatrix3x3; readonly determinant: number } {
  const c00 = m[4] * m[8] - m[5] * m[7]; const c01 = -(m[3] * m[8] - m[5] * m[6]); const c02 = m[3] * m[7] - m[4] * m[6];
  const c10 = -(m[1] * m[8] - m[2] * m[7]); const c11 = m[0] * m[8] - m[2] * m[6]; const c12 = -(m[0] * m[7] - m[1] * m[6]);
  const c20 = m[1] * m[5] - m[2] * m[4]; const c21 = -(m[0] * m[5] - m[2] * m[3]); const c22 = m[0] * m[4] - m[1] * m[3];
  const det = m[0] * c00 + m[1] * c01 + m[2] * c02;
  if (Math.abs(det) < 1e-12) throw new Error("사영 호모그래피 행렬이 특이(Singular) 상태라 역변환할 수 없습니다.");
  const invDet = 1 / det;
  return {
    determinant: det,
    inverse: [
      c00 * invDet, c10 * invDet, c20 * invDet,
      c01 * invDet, c11 * invDet, c21 * invDet,
      c02 * invDet, c12 * invDet, c22 * invDet,
    ],
  };
}

const SPEC_PSEUDOINVERSE_8X3: ReadonlyArray<readonly [number, number, number]> = (() => {
  const rows: [number[], number[], number[]] = [[], [], []];
  for (let i = 0; i < 8; i += 1) {
    const [lr, lg, lb] = cieXyzD65ToLinearRgb([CIE_X_WEIGHTS_D65[i]!, CIE_Y_WEIGHTS_D65[i]!, CIE_Z_WEIGHTS_D65[i]!]);
    rows[0].push(lr); rows[1].push(lg); rows[2].push(lb);
  }
  const gram: number[] = [];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      let dot = 0;
      for (let k = 0; k < 8; k += 1) dot += rows[r]![k]! * rows[c]![k]!;
      gram.push(dot);
    }
  }
  const gramInv = invertGeneral3x3(gram as unknown as HomographyMatrix3x3).inverse;
  const pinv: Array<readonly [number, number, number]> = [];
  for (let k = 0; k < 8; k += 1) {
    const t0 = rows[0][k]!; const t1 = rows[1][k]!; const t2 = rows[2][k]!;
    pinv.push([
      t0 * gramInv[0] + t1 * gramInv[3] + t2 * gramInv[6],
      t0 * gramInv[1] + t1 * gramInv[4] + t2 * gramInv[7],
      t0 * gramInv[2] + t1 * gramInv[5] + t2 * gramInv[8],
    ]);
  }
  return pinv;
})();

/** Kubelka-Munk 순방향 변환: 반사율 `R`에서 흡수/산란 비 `K/S = (1 - R)^2 / (2R)`를 계산한다. */
export function reflectanceToKubelkaMunkKs(reflectance: number): number {
  const r = clamp(reflectance, MIN_REFLECTANCE, MAX_REFLECTANCE);
  return ((1 - r) * (1 - r)) / (2 * r);
}

/** Kubelka-Munk 역변환: `K/S` 비에서 반사율 `R = 1 + (K/S) - sqrt((K/S)^2 + 2*(K/S))`를 복원한다. */
export function kubelkaMunkKsToReflectance(ksRatio: number): number {
  const ks = Math.max(0, ksRatio);
  return clamp(1 + ks - Math.sqrt(ks * ks + 2 * ks), MIN_REFLECTANCE, MAX_REFLECTANCE);
}

/** sRGB 바이트 색상 `[0..255]`을 400..700nm 8밴드 물리 안료 반사율 스펙트럼으로 변환한다. */
export function srgbToSpectralReflectance8(
  srgb: SrgbByteTuple,
  mode: SpectralUpliftMode = "pigment-natural",
): SpectralVector8 {
  const r = srgbChannelToLinear(srgb[0]);
  const g = srgbChannelToLinear(srgb[1]);
  const b = srgbChannelToLinear(srgb[2]);
  const cMin = Math.min(r, g, b);
  const cMax = Math.max(r, g, b);

  let cMid: number;
  let primary: SpectralVector8;
  let secondary: SpectralVector8;
  if (r >= g && g >= b) { cMid = g; primary = PIGMENT_BASIS_RED; secondary = PIGMENT_BASIS_YELLOW; }
  else if (g > r && r >= b) { cMid = r; primary = PIGMENT_BASIS_GREEN; secondary = PIGMENT_BASIS_YELLOW; }
  else if (g >= b && b > r) { cMid = b; primary = PIGMENT_BASIS_GREEN; secondary = PIGMENT_BASIS_CYAN; }
  else if (b > g && g >= r) { cMid = g; primary = PIGMENT_BASIS_BLUE; secondary = PIGMENT_BASIS_CYAN; }
  else if (b > r && r > g) { cMid = r; primary = PIGMENT_BASIS_BLUE; secondary = PIGMENT_BASIS_MAGENTA; }
  else { cMid = b; primary = PIGMENT_BASIS_RED; secondary = PIGMENT_BASIS_MAGENTA; }

  const wWhite = cMin; const wBlack = 1 - cMax; const wSec = cMid - cMin; const wPri = cMax - cMid;
  const out = [0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 8; i += 1) {
    out[i] = clamp(
      wWhite * PIGMENT_BASIS_WHITE[i]! + wBlack * PIGMENT_BASIS_BLACK[i]! + wSec * secondary[i]! + wPri * primary[i]!,
      MIN_REFLECTANCE, MAX_REFLECTANCE,
    );
  }
  if (mode === "metamer-calibrated") {
    for (let iter = 0; iter < 4; iter += 1) {
      const curLin = cieXyzD65ToLinearRgb(spectralToCieXyzD65(out as unknown as SpectralVector8));
      const errR = r - curLin[0]; const errG = g - curLin[1]; const errB = b - curLin[2];
      for (let k = 0; k < 8; k += 1) {
        const p = SPEC_PSEUDOINVERSE_8X3[k]!;
        out[k] = clamp(out[k]! + p[0] * errR + p[1] * errG + p[2] * errB, MIN_REFLECTANCE, MAX_REFLECTANCE);
      }
    }
  }
  return [out[0]!, out[1]!, out[2]!, out[3]!, out[4]!, out[5]!, out[6]!, out[7]!];
}

/** 8밴드 반사율 스펙트럼을 CIE 1931 XYZ(D65) 적분을 거쳐 sRGB 바이트 색상으로 변환한다. */
export function spectralReflectance8ToSrgb(spectrum: SpectralVector8): {
  readonly srgb: SrgbByteTuple; readonly linearRgb: readonly [number, number, number]; readonly cieXyzD65: readonly [number, number, number];
} {
  const cieXyzD65 = spectralToCieXyzD65(spectrum);
  const rawLin = cieXyzD65ToLinearRgb(cieXyzD65);
  const linearRgb: readonly [number, number, number] = [clamp(rawLin[0], 0, 1), clamp(rawLin[1], 0, 1), clamp(rawLin[2], 0, 1)];
  return {
    srgb: [linearChannelToSrgbByte(linearRgb[0]), linearChannelToSrgbByte(linearRgb[1]), linearChannelToSrgbByte(linearRgb[2])],
    linearRgb, cieXyzD65,
  };
}

/** 다중 sRGB 물감을 농도·산란력 가중 Kubelka-Munk 8밴드 분광 감산 방식으로 혼합한다. */
export function mixKubelkaMunkSpectralPigments(
  pigments: readonly PigmentLayerInput[],
  upliftMode: SpectralUpliftMode = "pigment-natural",
): KubelkaMunkMixResult {
  if (pigments.length === 0) {
    return { ...spectralReflectance8ToSrgb(PIGMENT_BASIS_WHITE), mixedReflectance: PIGMENT_BASIS_WHITE, mixedKsRatio: [0, 0, 0, 0, 0, 0, 0, 0], naiveAdditiveSrgb: [255, 255, 255], chromaGainOverAdditive: 0, serverCostKrw: 0 };
  }
  let totalConcentration = 0;
  for (const p of pigments) if (p.concentration > 0) totalConcentration += p.concentration;
  if (totalConcentration <= 0) {
    const firstSpec = srgbToSpectralReflectance8(pigments[0]!.srgb, upliftMode);
    return { ...spectralReflectance8ToSrgb(firstSpec), mixedReflectance: firstSpec, mixedKsRatio: firstSpec.map((v) => reflectanceToKubelkaMunkKs(v)) as unknown as SpectralVector8, naiveAdditiveSrgb: pigments[0]!.srgb, chromaGainOverAdditive: 0, serverCostKrw: 0 };
  }

  const accumK = [0, 0, 0, 0, 0, 0, 0, 0]; const accumS = [0, 0, 0, 0, 0, 0, 0, 0];
  let naiveR = 0; let naiveG = 0; let naiveB = 0;
  for (const pigment of pigments) {
    if (pigment.concentration <= 0) continue;
    const weight = pigment.concentration / totalConcentration;
    const scattering = Math.max(0.05, pigment.scatteringStrength ?? 1.0);
    const spec = srgbToSpectralReflectance8(pigment.srgb, upliftMode);
    for (let band = 0; band < 8; band += 1) {
      const ks = reflectanceToKubelkaMunkKs(spec[band]!);
      accumK[band] = accumK[band]! + weight * ks * scattering; accumS[band] = accumS[band]! + weight * scattering;
    }
    naiveR += weight * pigment.srgb[0]; naiveG += weight * pigment.srgb[1]; naiveB += weight * pigment.srgb[2];
  }

  const mixedKs: number[] = []; const mixedRefl: number[] = [];
  for (let band = 0; band < 8; band += 1) {
    const ks = accumK[band]! / Math.max(1e-9, accumS[band]!);
    mixedKs.push(ks); mixedRefl.push(kubelkaMunkKsToReflectance(ks));
  }
  const mixedReflectance = mixedRefl as unknown as SpectralVector8;
  const mixedKsRatio = mixedKs as unknown as SpectralVector8;
  const converted = spectralReflectance8ToSrgb(mixedReflectance);
  const naiveAdditiveSrgb: SrgbByteTuple = [Math.round(clamp(naiveR, 0, 255)), Math.round(clamp(naiveG, 0, 255)), Math.round(clamp(naiveB, 0, 255))];
  const kmChroma = Math.max(...converted.srgb) - Math.min(...converted.srgb);
  const additiveChroma = Math.max(...naiveAdditiveSrgb) - Math.min(...naiveAdditiveSrgb);
  return { ...converted, mixedReflectance, mixedKsRatio, naiveAdditiveSrgb, chromaGainOverAdditive: kmChroma - additiveChroma, serverCostKrw: 0 };
}

// ============================================================================
// 3. Projective 3×3 Homography Prop Decal Mapper (DLT + Supersampled Warp)
// ============================================================================

function computeIsotropicNormalization(quad: QuadCorners2D): {
  readonly normPoints: QuadCorners2D; readonly matrix: HomographyMatrix3x3; readonly inverseMatrix: HomographyMatrix3x3;
} {
  const cx = 0.25 * (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]);
  const cy = 0.25 * (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]);
  let meanDist = 0;
  for (let i = 0; i < 4; i += 1) meanDist += Math.hypot(quad[i]![0] - cx, quad[i]![1] - cy);
  meanDist *= 0.25;
  if (meanDist < 1e-9) throw new Error("호모그래피 모서리 점들이 한 점으로 수축되어 사영 행렬을 구할 수 없습니다.");
  const scale = Math.SQRT2 / meanDist; const invScale = 1 / scale;
  return {
    normPoints: [[(quad[0][0] - cx) * scale, (quad[0][1] - cy) * scale], [(quad[1][0] - cx) * scale, (quad[1][1] - cy) * scale], [(quad[2][0] - cx) * scale, (quad[2][1] - cy) * scale], [(quad[3][0] - cx) * scale, (quad[3][1] - cy) * scale]],
    matrix: [scale, 0, -cx * scale, 0, scale, -cy * scale, 0, 0, 1],
    inverseMatrix: [invScale, 0, cx, 0, invScale, cy, 0, 0, 1],
  };
}

function assertNonDegenerateQuad(quad: QuadCorners2D, label: string): void {
  for (let i = 0; i < 4; i += 1) {
    const a = quad[i]!; const b = quad[(i + 1) % 4]!; const c = quad[(i + 2) % 4]!;
    if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-7) {
      throw new Error(`${label}의 세 모서리가 일직선상에 있어 유효한 사각형이 아닙니다.`);
    }
  }
}

function multiply3x3(a: HomographyMatrix3x3, b: HomographyMatrix3x3): HomographyMatrix3x3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

function solveLinear8x8Gaussian(matrixRows: number[][], rhs: number[]): readonly number[] {
  const n = 8; const aug = matrixRows.map((row, idx) => [...row, rhs[idx]!]);
  for (let col = 0; col < n; col += 1) {
    let pivotRow = col; let maxVal = Math.abs(aug[col]![col]!);
    for (let r = col + 1; r < n; r += 1) { const candidate = Math.abs(aug[r]![col]!); if (candidate > maxVal) { maxVal = candidate; pivotRow = r; } }
    if (maxVal < 1e-12) throw new Error("8자유도 DLT 선형계가 특이 행렬이어서 호모그래피를 해독할 수 없습니다.");
    if (pivotRow !== col) { const tmp = aug[col]!; aug[col] = aug[pivotRow]!; aug[pivotRow] = tmp; }
    const pivot = aug[col]![col]!;
    for (let c = col; c <= n; c += 1) aug[col]![c] = aug[col]![c]! / pivot;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = aug[r]![col]!; if (Math.abs(factor) < 1e-15) continue;
      for (let c = col; c <= n; c += 1) aug[r]![c] = aug[r]![c]! - factor * aug[col]![c]!;
    }
  }
  return aug.map((row) => row[n]!);
}

export function projectPointHomography(h: HomographyMatrix3x3, point: Point2D): Point2D {
  const [u, v] = point;
  const w = h[6] * u + h[7] * v + h[8];
  return Math.abs(w) < 1e-12 ? [Number.NaN, Number.NaN] : [(h[0] * u + h[1] * v + h[2]) / w, (h[3] * u + h[4] * v + h[5]) / w];
}

/** 4개 원본 모서리와 4개 목표 원근 모서리로부터 정규화 DLT + 가우스 소거로 3×3 호모그래피를 구한다. */
export function solveHomography3x3(srcQuad: QuadCorners2D, dstQuad: QuadCorners2D): HomographySolveResult {
  assertNonDegenerateQuad(srcQuad, "원본 텍스처 사각형");
  assertNonDegenerateQuad(dstQuad, "목표 원근 사각형");
  const normSrc = computeIsotropicNormalization(srcQuad);
  const normDst = computeIsotropicNormalization(dstQuad);
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const [u, v] = normSrc.normPoints[i]!;
    const [x, y] = normDst.normPoints[i]!;
    rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); rhs.push(x);
    rows.push([0, 0, 0, u, v, 1, -u * y, -v * y]); rhs.push(y);
  }
  const sol = solveLinear8x8Gaussian(rows, rhs);
  const hNorm: HomographyMatrix3x3 = [sol[0]!, sol[1]!, sol[2]!, sol[3]!, sol[4]!, sol[5]!, sol[6]!, sol[7]!, 1];
  const unnormalized = multiply3x3(normDst.inverseMatrix, multiply3x3(hNorm, normSrc.matrix));
  const s = Math.abs(unnormalized[8]) > 1e-12 ? 1 / unnormalized[8] : 1;
  const matrix: HomographyMatrix3x3 = [
    unnormalized[0] * s, unnormalized[1] * s, unnormalized[2] * s,
    unnormalized[3] * s, unnormalized[4] * s, unnormalized[5] * s,
    unnormalized[6] * s, unnormalized[7] * s, unnormalized[8] * s,
  ];
  const { inverse, determinant } = invertGeneral3x3(matrix);
  let maxErr = 0;
  for (let i = 0; i < 4; i += 1) {
    const projected = projectPointHomography(matrix, srcQuad[i]!);
    maxErr = Math.max(maxErr, Math.hypot(projected[0] - dstQuad[i]![0], projected[1] - dstQuad[i]![1]));
  }
  return { matrix, inverseMatrix: inverse, determinant, maxCornerReprojectionErrorPx: maxErr };
}

function samplePremultipliedBilinearRgba(
  src: Uint8Array | Uint8ClampedArray, srcW: number, srcH: number, texX: number, texY: number,
): readonly [number, number, number, number] {
  const cx = clamp(texX - 0.5, 0, srcW - 1);
  const cy = clamp(texY - 0.5, 0, srcH - 1);
  const x0 = Math.floor(cx); const y0 = Math.floor(cy);
  const x1 = Math.min(srcW - 1, x0 + 1); const y1 = Math.min(srcH - 1, y0 + 1);
  const fx = cx - x0; const fy = cy - y0;
  const w00 = (1 - fx) * (1 - fy); const w10 = fx * (1 - fy); const w01 = (1 - fx) * fy; const w11 = fx * fy;
  const idx00 = (y0 * srcW + x0) * 4; const idx10 = (y0 * srcW + x1) * 4;
  const idx01 = (y1 * srcW + x0) * 4; const idx11 = (y1 * srcW + x1) * 4;
  const a00 = src[idx00 + 3]! / 255; const a10 = src[idx10 + 3]! / 255;
  const a01 = src[idx01 + 3]! / 255; const a11 = src[idx11 + 3]! / 255;
  return [
    w00 * src[idx00]! * a00 + w10 * src[idx10]! * a10 + w01 * src[idx01]! * a01 + w11 * src[idx11]! * a11,
    w00 * src[idx00 + 1]! * a00 + w10 * src[idx10 + 1]! * a10 + w01 * src[idx01 + 1]! * a01 + w11 * src[idx11 + 1]! * a11,
    w00 * src[idx00 + 2]! * a00 + w10 * src[idx10 + 2]! * a10 + w01 * src[idx01 + 2]! * a01 + w11 * src[idx11 + 2]! * a11,
    w00 * a00 + w10 * a10 + w01 * a01 + w11 * a11,
  ];
}

/** 소품·간판·타일 RGBA 텍스처를 소실점 벽면 4모서리 사각형으로 사영 워핑하고 슈퍼샘플링 합성한다. */
export function warpRgbaDecalWithHomography(input: HomographyDecalWarpInput): HomographyDecalWarpResult {
  const { srcRgba, srcWidth, srcHeight, dstWidth, dstHeight, targetQuad } = input;
  if (srcWidth <= 0 || srcHeight <= 0 || dstWidth <= 0 || dstHeight <= 0) {
    throw new Error("데칼 워핑 입출력 해상도는 1px 이상이어야 합니다.");
  }
  if (srcRgba.length < srcWidth * srcHeight * 4) {
    throw new Error("원본 RGBA 버퍼 길이가 srcWidth × srcHeight × 4보다 작습니다.");
  }
  const srcQuad: QuadCorners2D = input.srcQuad ?? [[0, 0], [srcWidth, 0], [srcWidth, srcHeight], [0, srcHeight]];
  const homography = solveHomography3x3(srcQuad, targetQuad);
  const invH = homography.inverseMatrix;
  const outRgba = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  if (input.dstRgba) {
    if (input.dstRgba.length < outRgba.length) throw new Error("대상 배경 RGBA 버퍼 길이가 dstWidth × dstHeight × 4보다 작습니다.");
    outRgba.set(input.dstRgba.subarray(0, outRgba.length));
  }

  const opacity = clamp(input.opacity ?? 1, 0, 1);
  const repeatX = Math.max(1, input.tileRepeatX ?? 1);
  const repeatY = Math.max(1, input.tileRepeatY ?? 1);
  const gridSubdiv = input.antiAliasing === "supersample-4x4" ? 4 : input.antiAliasing === "bilinear" ? 1 : 2;
  const invSampleCount = 1 / (gridSubdiv * gridSubdiv);
  const minX = clamp(Math.floor(Math.min(targetQuad[0][0], targetQuad[1][0], targetQuad[2][0], targetQuad[3][0])), 0, dstWidth - 1);
  const maxX = clamp(Math.ceil(Math.max(targetQuad[0][0], targetQuad[1][0], targetQuad[2][0], targetQuad[3][0])), 0, dstWidth - 1);
  const minY = clamp(Math.floor(Math.min(targetQuad[0][1], targetQuad[1][1], targetQuad[2][1], targetQuad[3][1])), 0, dstHeight - 1);
  const maxY = clamp(Math.ceil(Math.max(targetQuad[0][1], targetQuad[1][1], targetQuad[2][1], targetQuad[3][1])), 0, dstHeight - 1);
  let coveredPixelCount = 0;

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      let accumPr = 0; let accumPg = 0; let accumPb = 0; let accumAlpha = 0;
      for (let sy = 0; sy < gridSubdiv; sy += 1) {
        const sampleY = py + (sy + 0.5) / gridSubdiv;
        for (let sx = 0; sx < gridSubdiv; sx += 1) {
          const sampleX = px + (sx + 0.5) / gridSubdiv;
          const w = invH[6] * sampleX + invH[7] * sampleY + invH[8];
          if (w <= 1e-7) continue;
          const u = (invH[0] * sampleX + invH[1] * sampleY + invH[2]) / w;
          const v = (invH[3] * sampleX + invH[4] * sampleY + invH[5]) / w;
          if (u < 0 || u > srcWidth || v < 0 || v > srcHeight) continue;
          const wrappedU = repeatX > 1 ? ((u * repeatX) % srcWidth + srcWidth) % srcWidth : u;
          const wrappedV = repeatY > 1 ? ((v * repeatY) % srcHeight + srcHeight) % srcHeight : v;
          const [pr, pg, pb, pa] = samplePremultipliedBilinearRgba(srcRgba, srcWidth, srcHeight, wrappedU, wrappedV);
          accumPr += pr; accumPg += pg; accumPb += pb; accumAlpha += pa;
        }
      }
      const srcAlpha = clamp(accumAlpha * invSampleCount * opacity, 0, 1);
      if (srcAlpha <= 1e-5) continue;
      coveredPixelCount += 1;
      const srcPremulR = accumPr * invSampleCount * opacity;
      const srcPremulG = accumPg * invSampleCount * opacity;
      const srcPremulB = accumPb * invSampleCount * opacity;
      const dstIdx = (py * dstWidth + px) * 4;
      const dstAlpha = outRgba[dstIdx + 3]! / 255;
      const invSrcAlpha = 1 - srcAlpha;
      const outAlpha = srcAlpha + dstAlpha * invSrcAlpha;
      if (outAlpha > 1e-6) {
        outRgba[dstIdx] = Math.round(clamp((srcPremulR + outRgba[dstIdx]! * dstAlpha * invSrcAlpha) / outAlpha, 0, 255));
        outRgba[dstIdx + 1] = Math.round(clamp((srcPremulG + outRgba[dstIdx + 1]! * dstAlpha * invSrcAlpha) / outAlpha, 0, 255));
        outRgba[dstIdx + 2] = Math.round(clamp((srcPremulB + outRgba[dstIdx + 2]! * dstAlpha * invSrcAlpha) / outAlpha, 0, 255));
        outRgba[dstIdx + 3] = Math.round(clamp(outAlpha * 255, 0, 255));
      }
    }
  }
  return { rgba: outRgba, width: dstWidth, height: dstHeight, homography, touchedBounds: { minX, minY, maxX, maxY }, coveredPixelCount, serverCostKrw: 0 };
}
