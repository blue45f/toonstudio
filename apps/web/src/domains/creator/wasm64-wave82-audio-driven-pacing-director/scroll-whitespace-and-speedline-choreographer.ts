/**
 * Wave-82: 오디오 파형 연동 웹툰 세로 스크롤 여백·컷 비율·집중선·카메라 쉐이크 자동 연출기.
 *
 * `analyzeAudioTrackForComicPacing`이 산출한 에너지·3대역 충격량·무음 숨고르기·클라이맥스 지표를
 * 에피소드 컷 목록과 독자 평균 스크롤 속도(기본 620 px/s)에 매핑해 다음 연출 값을 결정론적으로 계산한다.
 * - 클라이맥스 직전 무음/긴장 구간 비례 세로 여백 확장(`40px..920px` 안전 범위)
 * - 클라이맥스 전면 풀블리드 확장 및 고속 액션 스태카토·분할/사선 컷 리듬 압축
 * - 인물 얼굴·말풍선 중앙 안전 타원을 침범하지 않는 방사형 집중선(Speedline) 벡터 합성
 * - 감쇠 조화 카메라 쉐이크 및 `prefersReducedMotion: true` 전정 보호(진동·섬광 0 강제 + 정적 강조 대체)
 */

import type { AudioEnvelopeFrame, AudioPacingAnalysis, SilenceHoldSegment } from "./waveform-energy-and-beat-analyzer";

/** 컷의 연출 역할 힌트. */
export type WebtoonCutRoleHint = "action" | "aftermath" | "climax" | "dialogue" | "establishing" | "suspense";

/** 오디오 역동성에 따라 결정되는 컷 호흡 모드. */
export type WebtoonPacingMode =
  | "breath-release"
  | "calm-dialogue"
  | "climax-impact"
  | "pre-drop-hush"
  | "staccato-action"
  | "tension-buildup";

/** 컷 프레임 배치 스타일. */
export type WebtoonPanelLayoutStyle =
  | "diagonal-slash"
  | "full-bleed-impact"
  | "staccato-split"
  | "standard-inset"
  | "wide-breath";

/** 집중선 시각 스타일. */
export type SpeedlineVisualStyle = "impact-flash" | "kinetic-slash" | "none" | "radial-burst" | "subtle-focus";

/** 저자극 모드(`prefersReducedMotion`) 대체 강조 방식. */
export type ReducedMotionSubstituteStyle = "expanded-whitespace-pause" | "high-contrast-frame" | "none";

/** 얼굴·말풍선 보호 영역(패널 정규화 좌표 0..1). */
export interface WebtoonFocalZone {
  readonly centerXRatio?: number;
  readonly centerYRatio?: number;
  readonly label?: string;
  readonly radiusXRatio?: number;
  readonly radiusYRatio?: number;
}

/** 에피소드 컷 입력 사양. */
export interface WebtoonPacingCutInput {
  readonly audioAnchorTimeMs?: number;
  readonly audioSpanMs?: number;
  readonly baseHeightPx?: number;
  readonly baseWidthPx?: number;
  readonly cutId: string;
  readonly dialogueCharCount?: number;
  readonly focalZone?: WebtoonFocalZone;
  readonly role?: WebtoonCutRoleHint;
  readonly sfxLabel?: string;
  readonly speechBalloonCount?: number;
  readonly title?: string;
}

/** 오디오 기반 세로 스크롤 연출 입력. */
export interface WebtoonPacingChoreographyInput {
  readonly analysis: AudioPacingAnalysis;
  readonly cuts: readonly WebtoonPacingCutInput[];
  readonly episodeId: string;
  readonly maxWhitespacePx?: number;
  readonly minWhitespacePx?: number;
  readonly prefersReducedMotion?: boolean;
  readonly readerScrollSpeedPxPerSec?: number;
  readonly seed?: number;
  readonly viewportWidthPx?: number;
}

/** 컷 구간에 매핑된 오디오 지표 요약. */
export interface CutAudioWindowSummary {
  readonly audioEndMs: number;
  readonly audioStartMs: number;
  readonly beatCount: number;
  readonly beatsPerSecond: number;
  readonly climaxCount: number;
  readonly dramaticScore: number;
  readonly highTransientPeak: number;
  readonly meanEnergy: number;
  readonly midMeanEnergy: number;
  readonly peakEnergy: number;
  readonly precedingSilenceDurationMs: number;
  readonly subBassPeak: number;
}

/** 방사형 집중선 단일 쐐기 벡터(픽셀 좌표). */
export interface RadialSpeedlineVector {
  readonly angleRad: number;
  readonly baseLeftX: number;
  readonly baseLeftY: number;
  readonly baseRightX: number;
  readonly baseRightY: number;
  readonly index: number;
  readonly innerX: number;
  readonly innerY: number;
  readonly lengthPx: number;
  readonly opacity: number;
  readonly outerX: number;
  readonly outerY: number;
  readonly taperWidthPx: number;
}

/** 보호 안전 타원(픽셀 좌표). */
export interface FocalClearEllipsePx {
  readonly cx: number;
  readonly cy: number;
  readonly label: string;
  readonly rx: number;
  readonly ry: number;
}

/** 컷별 방사형 집중선 합성 결과. */
export interface SpeedlineLayerPlan {
  readonly clearZoneEllipse: FocalClearEllipsePx;
  readonly enabled: boolean;
  readonly innerClearRadiusRatio: number;
  readonly lineCount: number;
  readonly linesIntrudingClearZone: number;
  readonly speedlineDensity: number;
  readonly style: SpeedlineVisualStyle;
  readonly taperWidthPx: number;
  readonly vectors: readonly RadialSpeedlineVector[];
}

/** 감쇠 조화 카메라 쉐이크 및 섬광 연출 큐. */
export interface CameraShakeCue {
  readonly calmContrastBorderPx: number;
  readonly calmVisualSubstitute: ReducedMotionSubstituteStyle;
  readonly dampingRatio: number;
  readonly decayRatePerSec: number;
  readonly durationMs: number;
  readonly flashIntensity: number;
  readonly reducedMotionSubstituted: boolean;
  readonly rollPeakDeg: number;
  readonly shakeAmplitudePx: number;
  readonly shakeFrequencyHz: number;
}

/** 감쇠 카메라 쉐이크 시점 샘플링 결과. */
export interface SampledCameraShakeOffset {
  readonly dxPx: number;
  readonly dyPx: number;
  readonly rollDeg: number;
}

/** 연출이 완료된 단일 웹툰 컷 기하·효과 사양. */
export interface ChoreographedWebtoonCut {
  readonly aspectRatioHeightOverWidth: number;
  readonly audioSummary: CutAudioWindowSummary;
  readonly cameraShake: CameraShakeCue;
  readonly cutId: string;
  readonly cutIndex: number;
  readonly diagonalTiltDeg: number;
  readonly fullBleed: boolean;
  readonly heightScaleRatio: number;
  readonly insetHorizontalPx: number;
  readonly layoutStyle: WebtoonPanelLayoutStyle;
  readonly pacingMode: WebtoonPacingMode;
  readonly panelBottomY: number;
  readonly panelHeightPx: number;
  readonly panelTopY: number;
  readonly panelWidthPx: number;
  readonly scrollEndY: number;
  readonly scrollStartY: number;
  readonly sfxLabel: string | null;
  readonly speedlines: SpeedlineLayerPlan;
  readonly splitColumns: number;
  readonly title: string;
  readonly whitespaceAfterPx: number;
  readonly whitespaceBeforePx: number;
}

/** 에피소드 전체 오디오 연동 연출 결과. */
export interface WebtoonPacingChoreographyResult {
  readonly averageWhitespacePx: number;
  readonly climaxCutIds: readonly string[];
  readonly cuts: readonly ChoreographedWebtoonCut[];
  readonly episodeId: string;
  readonly maxShakeAmplitudePx: number;
  readonly prefersReducedMotion: boolean;
  readonly readerScrollSpeedPxPerSec: number;
  readonly totalAudioDurationMs: number;
  readonly totalScrollHeightPx: number;
  readonly totalSpeedlineVectors: number;
  readonly viewportWidthPx: number;
}

export const DEFAULT_READER_SCROLL_SPEED_PX_PER_SEC = 620;
export const DEFAULT_MIN_WHITESPACE_PX = 40;
export const DEFAULT_MAX_WHITESPACE_PX = 920;
export const DEFAULT_VIEWPORT_WIDTH_PX = 800;

const TWO_PI = Math.PI * 2;

function clamp(v: number, min: number, max: number): number {
  return !Number.isFinite(v) ? min : v < min ? min : v > max ? max : v;
}

function roundTo(v: number, digits: number): number {
  if (!Number.isFinite(v)) return 0;
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}

function createRng(seed: number): () => number {
  let s = (seed >>> 0) || 0x85ebca6b;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 선분 `(x1, y1) -> (x2, y2)`가 보호 타원 `(cx, cy, rx, ry)` 내부에 침범하는지 해석적으로 판정한다. */
function segmentIntrudesEllipse(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ellipse: FocalClearEllipsePx,
): boolean {
  const rx = Math.max(1e-3, ellipse.rx);
  const ry = Math.max(1e-3, ellipse.ry);
  const ax = (x1 - ellipse.cx) / rx;
  const ay = (y1 - ellipse.cy) / ry;
  const dx = (x2 - ellipse.cx) / rx - ax;
  const dy = (y2 - ellipse.cy) / ry - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 1e-12 ? clamp(-(ax * dx + ay * dy) / lenSq, 0, 1) : 0;
  const px = ax + t * dx;
  const py = ay + t * dy;
  return px * px + py * py < 0.999;
}

/** 집중선 벡터 목록 중 보호 안전 타원(얼굴·말풍선 중앙 영역)을 침범하는 선 개수를 계산한다. */
export function countSpeedlinesIntrudingClearZone(
  vectors: readonly RadialSpeedlineVector[],
  ellipse: FocalClearEllipsePx,
): number {
  let count = 0;
  for (const v of vectors) {
    if (
      segmentIntrudesEllipse(v.innerX, v.innerY, v.outerX, v.outerY, ellipse) ||
      segmentIntrudesEllipse(v.innerX, v.innerY, v.baseLeftX, v.baseLeftY, ellipse) ||
      segmentIntrudesEllipse(v.innerX, v.innerY, v.baseRightX, v.baseRightY, ellipse)
    ) {
      count += 1;
    }
  }
  return count;
}

function resolveFocalClearEllipse(
  panelW: number,
  panelH: number,
  focalZone: WebtoonFocalZone | undefined,
  impactEnergy: number,
): { readonly ellipse: FocalClearEllipsePx; readonly ratio: number } {
  const safeW = Math.max(80, panelW);
  const safeH = Math.max(80, panelH);
  const cx = safeW * clamp(focalZone?.centerXRatio ?? 0.5, 0.22, 0.78);
  const cy = safeH * clamp(focalZone?.centerYRatio ?? 0.45, 0.22, 0.78);

  const tighten = 1 - clamp(impactEnergy, 0, 1) * 0.14;
  const reqRx = clamp((focalZone?.radiusXRatio ?? 0.27) * tighten, 0.16, 0.42);
  const reqRy = clamp((focalZone?.radiusYRatio ?? 0.25) * tighten, 0.16, 0.42);
  const maxRx = Math.max(12, Math.min(cx, safeW - cx) - 10);
  const maxRy = Math.max(12, Math.min(cy, safeH - cy) - 10);
  const rx = clamp(safeW * reqRx, Math.min(18, maxRx), maxRx);
  const ry = clamp(safeH * reqRy, Math.min(18, maxRy), maxRy);

  return {
    ellipse: {
      cx: roundTo(cx, 2),
      cy: roundTo(cy, 2),
      rx: roundTo(rx, 2),
      ry: roundTo(ry, 2),
      label: focalZone?.label ?? "인물 얼굴·말풍선 보호 영역",
    },
    ratio: roundTo((rx / safeW + ry / safeH) * 0.5, 4),
  };
}

/** 컷의 충격 에너지·초저역·고역 트랜지언트와 보호 영역을 바탕으로 방사형 집중선 벡터를 생성한다. */
export function synthesizeRadialSpeedlinesForCut(params: {
  readonly audioSummary: CutAudioWindowSummary;
  readonly focalZone?: WebtoonFocalZone;
  readonly pacingMode: WebtoonPacingMode;
  readonly panelHeightPx: number;
  readonly panelWidthPx: number;
  readonly prefersReducedMotion: boolean;
  readonly seed: number;
}): SpeedlineLayerPlan {
  const { audioSummary, focalZone, pacingMode, panelWidthPx, panelHeightPx, prefersReducedMotion, seed } = params;
  const impactDrive = clamp(
    audioSummary.highTransientPeak * 0.48 + audioSummary.subBassPeak * 0.38 + audioSummary.dramaticScore * 0.24,
    0,
    1,
  );
  const { ellipse, ratio } = resolveFocalClearEllipse(panelWidthPx, panelHeightPx, focalZone, impactDrive);

  const quiet = pacingMode === "calm-dialogue" && impactDrive < 0.24 && audioSummary.climaxCount === 0;
  const hush = pacingMode === "pre-drop-hush" && audioSummary.climaxCount === 0;
  if (quiet || hush || impactDrive < 0.18) {
    return {
      enabled: false, style: "none", speedlineDensity: 0, innerClearRadiusRatio: ratio,
      taperWidthPx: 0, lineCount: 0, clearZoneEllipse: ellipse, vectors: [], linesIntrudingClearZone: 0,
    };
  }

  let style: SpeedlineVisualStyle = "subtle-focus";
  if (pacingMode === "climax-impact" || audioSummary.climaxCount > 0) {
    style = prefersReducedMotion ? "radial-burst" : "impact-flash";
  } else if (pacingMode === "staccato-action") {
    style = "kinetic-slash";
  } else if (impactDrive >= 0.45) {
    style = "radial-burst";
  }

  const rawDensity = clamp((impactDrive - 0.14) / 0.86 + (pacingMode === "climax-impact" ? 0.18 : 0), 0.08, 1);
  const density = prefersReducedMotion ? clamp(rawDensity * 0.72, 0.08, 0.72) : rawDensity;
  const targetLines = Math.round(12 + density * (prefersReducedMotion ? 52 : 84));
  const taperWidthPx = roundTo(1.8 + density * 6.4, 2);

  const rng = createRng(seed);
  const vectors: RadialSpeedlineVector[] = [];

  for (let i = 0; i < targetLines; i += 1) {
    const angleRad = (i / targetLines) * TWO_PI + (rng() - 0.5) * (TWO_PI / targetLines) * 0.58;
    const ux = Math.cos(angleRad);
    const uy = Math.sin(angleRad);
    const invEll = Math.sqrt((ux * ux) / (ellipse.rx * ellipse.rx) + (uy * uy) / (ellipse.ry * ellipse.ry));
    const rEll = invEll > 1e-9 ? 1 / invEll : Math.max(ellipse.rx, ellipse.ry);
    const tx = ux > 1e-9 ? (panelWidthPx - ellipse.cx) / ux : ux < -1e-9 ? -ellipse.cx / ux : Number.POSITIVE_INFINITY;
    const ty = uy > 1e-9 ? (panelHeightPx - ellipse.cy) / uy : uy < -1e-9 ? -ellipse.cy / uy : Number.POSITIVE_INFINITY;
    const rRect = Math.min(tx, ty);
    const minInnerR = rEll * 1.06;
    if (!Number.isFinite(rRect) || rRect <= minInnerR + 6) continue;

    const span = rRect - minInnerR;
    const rInner = minInnerR + rng() * Math.min(rEll * 0.26, span * 0.36);
    const innerX = ellipse.cx + ux * rInner;
    const innerY = ellipse.cy + uy * rInner;
    const outerX = clamp(ellipse.cx + ux * rRect, 0, panelWidthPx);
    const outerY = clamp(ellipse.cy + uy * rRect, 0, panelHeightPx);

    const halfW = Math.min(taperWidthPx * (0.55 + rng() * 0.75) * 0.5, span * 0.25);
    const baseLeftX = clamp(outerX + uy * halfW, 0, panelWidthPx);
    const baseLeftY = clamp(outerY - ux * halfW, 0, panelHeightPx);
    const baseRightX = clamp(outerX - uy * halfW, 0, panelWidthPx);
    const baseRightY = clamp(outerY + ux * halfW, 0, panelHeightPx);

    const cand: RadialSpeedlineVector = {
      index: vectors.length,
      angleRad: roundTo(angleRad, 5),
      innerX: roundTo(innerX, 2),
      innerY: roundTo(innerY, 2),
      outerX: roundTo(outerX, 2),
      outerY: roundTo(outerY, 2),
      baseLeftX: roundTo(baseLeftX, 2),
      baseLeftY: roundTo(baseLeftY, 2),
      baseRightX: roundTo(baseRightX, 2),
      baseRightY: roundTo(baseRightY, 2),
      taperWidthPx: roundTo(halfW * 2, 2),
      opacity: roundTo(clamp(0.38 + density * 0.54 + (rng() - 0.5) * 0.14, 0.2, 0.96), 3),
      lengthPx: roundTo(Math.hypot(outerX - innerX, outerY - innerY), 2),
    };

    if (countSpeedlinesIntrudingClearZone([cand], ellipse) === 0) {
      vectors.push(cand);
    }
  }

  return {
    enabled: vectors.length > 0,
    style: vectors.length > 0 ? style : "none",
    speedlineDensity: roundTo(density, 4),
    innerClearRadiusRatio: ratio,
    taperWidthPx,
    lineCount: vectors.length,
    clearZoneEllipse: ellipse,
    vectors,
    linesIntrudingClearZone: countSpeedlinesIntrudingClearZone(vectors, ellipse),
  };
}

/** 감쇠 조화 진동식 `A * exp(-lambda * t) * sin(2 * pi * f * t)`로 경과 시각의 카메라 쉐이크 변위를 계산한다. */
export function sampleDampedCameraShakeOffset(cue: CameraShakeCue, elapsedMs: number): SampledCameraShakeOffset {
  if (cue.shakeAmplitudePx <= 0 || cue.durationMs <= 0 || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > cue.durationMs) {
    return { dxPx: 0, dyPx: 0, rollDeg: 0 };
  }
  const t = elapsedMs / 1000;
  const env = Math.exp(-cue.decayRatePerSec * t);
  const w = TWO_PI * cue.shakeFrequencyHz;
  return {
    dxPx: roundTo(cue.shakeAmplitudePx * env * Math.sin(w * t), 3),
    dyPx: roundTo(cue.shakeAmplitudePx * 0.68 * env * Math.cos(w * 1.17 * t), 3),
    rollDeg: roundTo(cue.rollPeakDeg * env * Math.sin(w * 0.72 * t), 3),
  };
}

function summarizeAudioWindow(analysis: AudioPacingAnalysis, startMs: number, endMs: number): CutAudioWindowSummary {
  const spanMs = Math.max(1, endMs - startMs);
  const winFrames: AudioEnvelopeFrame[] = analysis.frames.filter((f) => f.timeMs >= startMs && f.timeMs <= endMs);

  let meanEnergy = 0;
  let peakEnergy = 0;
  let subBassPeak = 0;
  let midMeanEnergy = 0;
  let highTransientPeak = 0;
  if (winFrames.length > 0) {
    let eSum = 0;
    let mSum = 0;
    for (const fr of winFrames) {
      eSum += fr.normalizedEnergy;
      mSum += fr.bands.mid150To2500Hz;
      if (fr.normalizedEnergy > peakEnergy) peakEnergy = fr.normalizedEnergy;
      if (fr.bands.subBass20To150Hz > subBassPeak) subBassPeak = fr.bands.subBass20To150Hz;
      if (fr.bands.highTransient2500PlusHz > highTransientPeak) highTransientPeak = fr.bands.highTransient2500PlusHz;
    }
    meanEnergy = eSum / winFrames.length;
    midMeanEnergy = mSum / winFrames.length;
  }

  let beatCount = 0;
  for (const t of analysis.beatTimestampsMs) {
    if (t >= startMs && t <= endMs) beatCount += 1;
  }

  let climaxCount = 0;
  let maxDramatic = 0;
  let climaxPreSilenceMs = 0;
  for (const cl of analysis.climaxMoments) {
    if (cl.timeMs >= startMs - 40 && cl.timeMs <= endMs + 40) {
      climaxCount += 1;
      maxDramatic = Math.max(maxDramatic, cl.dramaticScore);
      climaxPreSilenceMs = Math.max(climaxPreSilenceMs, cl.precededBySilenceMs);
    }
  }

  let adjSilenceMs = 0;
  for (const hold of analysis.silenceHolds as readonly SilenceHoldSegment[]) {
    if (hold.precedesClimax && hold.endMs >= startMs - 450 && hold.endMs <= startMs + spanMs * 0.45) {
      adjSilenceMs = Math.max(adjSilenceMs, hold.durationMs);
    }
  }

  return {
    audioStartMs: roundTo(startMs, 2),
    audioEndMs: roundTo(endMs, 2),
    meanEnergy: roundTo(meanEnergy, 4),
    peakEnergy: roundTo(peakEnergy, 4),
    subBassPeak: roundTo(subBassPeak, 4),
    midMeanEnergy: roundTo(midMeanEnergy, 4),
    highTransientPeak: roundTo(highTransientPeak, 4),
    beatCount,
    beatsPerSecond: roundTo(beatCount / (spanMs / 1000), 3),
    climaxCount,
    dramaticScore: roundTo(maxDramatic, 4),
    precedingSilenceDurationMs: roundTo(Math.max(climaxPreSilenceMs, adjSilenceMs), 2),
  };
}

function classifyPacingMode(cut: WebtoonPacingCutInput, s: CutAudioWindowSummary, nextClimax: boolean): WebtoonPacingMode {
  if (s.climaxCount > 0 || (cut.role === "climax" && s.peakEnergy >= 0.55)) return "climax-impact";
  if ((s.meanEnergy <= 0.14 && nextClimax) || (cut.role === "suspense" && s.meanEnergy <= 0.28)) return "pre-drop-hush";
  if ((s.beatsPerSecond >= 2.6 && s.highTransientPeak >= 0.42) || (cut.role === "action" && s.peakEnergy >= 0.45)) {
    return "staccato-action";
  }
  if (nextClimax && s.peakEnergy > s.meanEnergy * 1.25) return "tension-buildup";
  if (cut.role === "aftermath" && s.meanEnergy < 0.35) return "breath-release";
  return "calm-dialogue";
}

function computeWhitespaceBeforePx(
  mode: WebtoonPacingMode,
  cut: WebtoonPacingCutInput,
  s: CutAudioWindowSummary,
  prev: CutAudioWindowSummary | null,
  scrollSpeed: number,
  prefersReducedMotion: boolean,
  minPx: number,
  maxPx: number,
): number {
  let raw: number;
  if (mode === "climax-impact") {
    const silencePx = (s.precedingSilenceDurationMs / 1000) * scrollSpeed * 1.15;
    const prevQuietBonus = prev && prev.meanEnergy <= 0.16 ? scrollSpeed * 0.28 : 0;
    const dropBonus = s.dramaticScore * 190 + (s.precedingSilenceDurationMs > 0 ? 110 : 60);
    raw = Math.max(220, silencePx + prevQuietBonus + dropBonus);
  } else if (mode === "pre-drop-hush") {
    raw = 150 + scrollSpeed * 0.24;
  } else if (mode === "tension-buildup") {
    raw = 135 + s.peakEnergy * 85;
  } else if (mode === "staccato-action") {
    raw = 44 + (1 - clamp(s.beatsPerSecond / 5, 0, 1)) * 28;
  } else if (mode === "breath-release") {
    raw = 140 + (1 - s.meanEnergy) * 70;
  } else {
    raw = 82 + clamp((cut.dialogueCharCount ?? 24) * 0.45, 0, 36);
  }
  if (prefersReducedMotion && mode === "climax-impact") raw += 36;
  return Math.round(clamp(raw, minPx, maxPx));
}

function computePanelGeometry(
  mode: WebtoonPacingMode,
  cutIndex: number,
  cut: WebtoonPacingCutInput,
  s: CutAudioWindowSummary,
  viewportW: number,
  prefersReducedMotion: boolean,
): {
  readonly diagonalTiltDeg: number;
  readonly fullBleed: boolean;
  readonly heightScaleRatio: number;
  readonly layoutStyle: WebtoonPanelLayoutStyle;
  readonly panelHeightPx: number;
  readonly panelWidthPx: number;
  readonly splitColumns: number;
} {
  const baseW = Math.round(clamp(cut.baseWidthPx ?? viewportW - 48, 240, viewportW));
  const baseH = Math.round(clamp(cut.baseHeightPx ?? 680, 260, 1800));

  if (mode === "climax-impact") {
    const ratio = roundTo(clamp(1.28 + s.dramaticScore * 0.36, 1.25, 1.68), 3);
    return {
      layoutStyle: "full-bleed-impact", fullBleed: true, panelWidthPx: viewportW,
      heightScaleRatio: ratio, panelHeightPx: Math.round(clamp(baseH * ratio, 240, 2200)),
      splitColumns: 1, diagonalTiltDeg: 0,
    };
  }
  if (mode === "staccato-action") {
    const sharp = s.highTransientPeak >= 0.58;
    const ratio = roundTo(clamp(0.68 + (1 - clamp(s.beatsPerSecond / 6, 0, 1)) * 0.16, 0.62, 0.86), 3);
    return {
      layoutStyle: sharp ? "diagonal-slash" : "staccato-split",
      fullBleed: false,
      panelWidthPx: Math.round(viewportW - 24),
      heightScaleRatio: ratio,
      panelHeightPx: Math.round(clamp(baseH * ratio, 240, 2200)),
      splitColumns: sharp ? 2 : 3,
      diagonalTiltDeg: prefersReducedMotion ? 0 : sharp ? (cutIndex % 2 === 0 ? 5.5 : -5.5) : 0,
    };
  }
  if (mode === "pre-drop-hush" || mode === "breath-release") {
    const ratio = roundTo(0.92 + (1 - s.meanEnergy) * 0.12, 3);
    return {
      layoutStyle: "wide-breath", fullBleed: false, panelWidthPx: Math.round(viewportW - 64),
      heightScaleRatio: ratio, panelHeightPx: Math.round(clamp(baseH * ratio, 240, 2200)),
      splitColumns: 1, diagonalTiltDeg: 0,
    };
  }
  const ratio = roundTo(clamp(0.95 + s.meanEnergy * 0.14, 0.9, 1.12), 3);
  return {
    layoutStyle: "standard-inset", fullBleed: false, panelWidthPx: Math.min(baseW, viewportW - 48),
    heightScaleRatio: ratio, panelHeightPx: Math.round(clamp(baseH * ratio, 240, 2200)),
    splitColumns: 1, diagonalTiltDeg: 0,
  };
}

function buildCameraShakeCue(s: CutAudioWindowSummary, mode: WebtoonPacingMode, prefersReducedMotion: boolean): CameraShakeCue {
  const force = clamp(s.subBassPeak * 0.58 + s.highTransientPeak * 0.27 + s.dramaticScore * 0.3, 0, 1);
  const active = mode === "climax-impact" || (mode === "staccato-action" && force >= 0.55) || s.climaxCount > 0;
  if (!active || force < 0.32) {
    return {
      shakeAmplitudePx: 0, shakeFrequencyHz: 0, dampingRatio: 0, decayRatePerSec: 0, durationMs: 0,
      rollPeakDeg: 0, flashIntensity: 0, reducedMotionSubstituted: false, calmVisualSubstitute: "none", calmContrastBorderPx: 0,
    };
  }
  if (prefersReducedMotion) {
    const major = mode === "climax-impact" || s.precedingSilenceDurationMs > 0;
    return {
      shakeAmplitudePx: 0, shakeFrequencyHz: 0, dampingRatio: 0, decayRatePerSec: 0, durationMs: 0,
      rollPeakDeg: 0, flashIntensity: 0, reducedMotionSubstituted: true,
      calmVisualSubstitute: major ? "high-contrast-frame" : "expanded-whitespace-pause",
      calmContrastBorderPx: major ? 6 : 3,
    };
  }
  return {
    shakeAmplitudePx: roundTo(clamp(3 + force * 18, 2, 22), 2),
    shakeFrequencyHz: roundTo(15 + s.highTransientPeak * 10, 2),
    dampingRatio: roundTo(0.26 + (1 - force) * 0.14, 3),
    decayRatePerSec: roundTo(5.2 + (1 - force) * 3.4, 2),
    durationMs: Math.round(240 + force * 320),
    rollPeakDeg: roundTo(clamp(0.4 + force * 2.1, 0.3, 2.6), 2),
    flashIntensity: roundTo(mode === "climax-impact" ? clamp(0.28 + force * 0.62, 0, 0.92) : clamp(force * 0.3, 0, 0.4), 3),
    reducedMotionSubstituted: false,
    calmVisualSubstitute: "none",
    calmContrastBorderPx: 0,
  };
}

/** 분석된 오디오 역동성을 세로 스크롤 웹툰의 여백, 컷 비율, 집중선, 카메라 쉐이크로 자동 연출한다. */
export function choreographWebtoonPacingFromAudio(input: WebtoonPacingChoreographyInput): WebtoonPacingChoreographyResult {
  const viewportW = Math.round(clamp(input.viewportWidthPx ?? DEFAULT_VIEWPORT_WIDTH_PX, 320, 1600));
  const scrollSpeed = clamp(input.readerScrollSpeedPxPerSec ?? DEFAULT_READER_SCROLL_SPEED_PX_PER_SEC, 200, 1800);
  const minWs = Math.round(clamp(input.minWhitespacePx ?? DEFAULT_MIN_WHITESPACE_PX, 16, 200));
  const maxWs = Math.round(clamp(input.maxWhitespacePx ?? DEFAULT_MAX_WHITESPACE_PX, Math.max(minWs + 80, 240), 1400));
  const prefersReducedMotion = Boolean(input.prefersReducedMotion);
  const baseSeed = input.seed ?? 82026;

  const totalDur = Math.max(0, input.analysis.durationMs);
  const sliceMs = input.cuts.length > 0 ? totalDur / input.cuts.length : 0;
  const summaries = input.cuts.map((cut, i) => {
    const startMs = cut.audioAnchorTimeMs !== undefined ? clamp(cut.audioAnchorTimeMs, 0, totalDur) : i * sliceMs;
    const span = cut.audioSpanMs !== undefined && cut.audioSpanMs > 0 ? cut.audioSpanMs : sliceMs;
    const endMs = cut.audioAnchorTimeMs !== undefined ? clamp(startMs + span, startMs, totalDur) : (i + 1) * sliceMs;
    return summarizeAudioWindow(input.analysis, startMs, Math.max(startMs, endMs));
  });

  const cuts: ChoreographedWebtoonCut[] = [];
  const climaxCutIds: string[] = [];
  let cursorY = 0;
  let wsTotal = 0;
  let maxShake = 0;
  let totalSpeedlines = 0;

  for (let i = 0; i < input.cuts.length; i += 1) {
    const cutInput = input.cuts[i];
    const summary = summaries[i];
    const nextHasClimax = Boolean(i + 1 < summaries.length && summaries[i + 1].climaxCount > 0);
    const pacingMode = classifyPacingMode(cutInput, summary, nextHasClimax);

    const whitespaceBeforePx = computeWhitespaceBeforePx(
      pacingMode, cutInput, summary, i > 0 ? summaries[i - 1] : null, scrollSpeed, prefersReducedMotion, minWs, maxWs,
    );
    const rawAfter = pacingMode === "climax-impact" ? 140 + summary.dramaticScore * 90 : pacingMode === "staccato-action" ? minWs : 64;
    const whitespaceAfterPx = Math.round(clamp(rawAfter, minWs, Math.min(maxWs, 360)));

    const geom = computePanelGeometry(pacingMode, i, cutInput, summary, viewportW, prefersReducedMotion);
    const speedlines = synthesizeRadialSpeedlinesForCut({
      panelWidthPx: geom.panelWidthPx,
      panelHeightPx: geom.panelHeightPx,
      audioSummary: summary,
      pacingMode,
      focalZone: cutInput.focalZone,
      prefersReducedMotion,
      seed: baseSeed + i * 97 + 13,
    });
    const cameraShake = buildCameraShakeCue(summary, pacingMode, prefersReducedMotion);

    const scrollStartY = cursorY;
    const panelTopY = scrollStartY + whitespaceBeforePx;
    const panelBottomY = panelTopY + geom.panelHeightPx;
    const scrollEndY = panelBottomY + whitespaceAfterPx;
    cursorY = scrollEndY;

    wsTotal += whitespaceBeforePx;
    if (cameraShake.shakeAmplitudePx > maxShake) maxShake = cameraShake.shakeAmplitudePx;
    totalSpeedlines += speedlines.lineCount;
    if (pacingMode === "climax-impact") climaxCutIds.push(cutInput.cutId);

    cuts.push({
      cutIndex: i,
      cutId: cutInput.cutId,
      title: cutInput.title ?? `컷 ${i + 1}`,
      pacingMode,
      layoutStyle: geom.layoutStyle,
      fullBleed: geom.fullBleed,
      panelWidthPx: geom.panelWidthPx,
      panelHeightPx: geom.panelHeightPx,
      insetHorizontalPx: Math.max(0, Math.round((viewportW - geom.panelWidthPx) * 0.5)),
      heightScaleRatio: geom.heightScaleRatio,
      aspectRatioHeightOverWidth: roundTo(geom.panelHeightPx / Math.max(1, geom.panelWidthPx), 4),
      splitColumns: geom.splitColumns,
      diagonalTiltDeg: geom.diagonalTiltDeg,
      whitespaceBeforePx,
      whitespaceAfterPx,
      scrollStartY,
      panelTopY,
      panelBottomY,
      scrollEndY,
      sfxLabel: cutInput.sfxLabel ?? null,
      audioSummary: summary,
      speedlines,
      cameraShake,
    });
  }

  return {
    episodeId: input.episodeId,
    viewportWidthPx: viewportW,
    readerScrollSpeedPxPerSec: scrollSpeed,
    prefersReducedMotion,
    totalAudioDurationMs: input.analysis.durationMs,
    totalScrollHeightPx: cursorY,
    averageWhitespacePx: cuts.length > 0 ? roundTo(wsTotal / cuts.length, 2) : 0,
    maxShakeAmplitudePx: roundTo(maxShake, 2),
    totalSpeedlineVectors: totalSpeedlines,
    climaxCutIds,
    cuts,
  };
}
