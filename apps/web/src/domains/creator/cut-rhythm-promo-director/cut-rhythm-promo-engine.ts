/**
 * 웹툰 컷 리듬 분석 -> 2.5D 다중 평면 패럴랙스 키프레임 자동 연출 엔진.
 *
 * - 100% 순수·결정론적 연산(난수/시계/스토리지 비의존).
 * - 어떤 컷 구성과 목표 길이(15초/30초, 30fps/60fps)에서도 총 프레임 오차 0(`frameDrift === 0`)을 보장한다.
 */

import {
  BGM_SECTION_LABELS_KO,
  SFX_MARKER_LABELS_KO,
  buildRemotionPromoManifest,
  createAudioCueIndex,
  generateAudioCueSheet,
  serializeRemotionPromoManifest,
} from "./audio-and-remotion-exporter";
import { BUILTIN_STORYBOARD_PRESETS, createPresetEntriesIndex } from "./storyboard-presets";
import type {
  AnalyzedWebtoonCut,
  CubicBezierTuple,
  CutParallaxTrack,
  CutRhythmAnalysisReport,
  DirectPromoPipelineOptions,
  DirectedWebtoonPromoPlan,
  EasingPresetName,
  EvaluatedParallaxPose,
  NarrativeBeat,
  ParallaxCameraKeyframe,
  ParallaxDirectorOptions,
  ParallaxLayerSpeeds,
  PromoAspectPreset,
  PromoDurationSec,
  PromoFps,
  RhythmAnalysisOptions,
  WebtoonCutInput,
} from "./types";

export {
  BGM_SECTION_LABELS_KO,
  BUILTIN_STORYBOARD_PRESETS,
  SFX_MARKER_LABELS_KO,
  buildRemotionPromoManifest,
  createAudioCueIndex,
  createPresetEntriesIndex,
  generateAudioCueSheet,
  serializeRemotionPromoManifest,
};

export const MIN_RECOMMENDED_BPM = 92;
export const MAX_RECOMMENDED_BPM = 148;

export const DEFAULT_PARALLAX_SPEEDS: ParallaxLayerSpeeds = {
  bgParallax: 0.25,
  mgParallax: 0.65,
  fgParallax: 1.15,
};

export const NARRATIVE_BEAT_LABELS_KO: Readonly<Record<NarrativeBeat, string>> = {
  hook: "훅 · 시선 고정",
  setup: "도입 · 상황 전개",
  "tension-rise": "긴장 상승",
  "climax-drop": "클라이맥스 드롭",
  cliffhanger: "클리프행어",
};

const BEAT_PACING_MULTIPLIER: Readonly<Record<NarrativeBeat, number>> = {
  hook: 0.88,
  setup: 1.04,
  "tension-rise": 0.92,
  "climax-drop": 1.18,
  cliffhanger: 1.1,
};

const BEAT_PRIORITY_FOR_RESIDUAL: Readonly<Record<NarrativeBeat, number>> = {
  "climax-drop": 5,
  cliffhanger: 4,
  setup: 3,
  "tension-rise": 2,
  hook: 1,
};

const EASING_CURVES: Readonly<Record<EasingPresetName, CubicBezierTuple>> = {
  "expo-out": [0.16, 1, 0.3, 1],
  "smooth-dolly": [0.37, 0, 0.63, 1],
  "tension-climb": [0.45, 0.05, 0.55, 0.95],
  "snap-impact": [0.12, 0.98, 0.22, 1],
  "silk-reveal": [0.22, 1, 0.36, 1],
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * 표준 3차 베지어 이징 커브(x1, y1, x2, y2)를 Newton-Raphson + 이진 탐색으로 정확히 평가한다.
 */
export function evaluateCubicBezier(t: number, curve: CubicBezierTuple): number {
  const x = clamp(t, 0, 1);
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const [x1, y1, x2, y2] = curve;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (u: number): number => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number): number => ((ay * u + by) * u + cy) * u;
  const sampleDerivX = (u: number): number => (3 * ax * u + 2 * bx) * u + cx;

  let u = x;
  for (let i = 0; i < 6; i += 1) {
    const err = sampleX(u) - x;
    if (Math.abs(err) < 1e-6) return sampleY(u);
    const deriv = sampleDerivX(u);
    if (Math.abs(deriv) < 1e-6) break;
    u = clamp(u - err / deriv, 0, 1);
  }

  let lo = 0;
  let hi = 1;
  u = x;
  for (let i = 0; i < 12; i += 1) {
    const curX = sampleX(u);
    if (Math.abs(curX - x) < 1e-6) break;
    if (curX < x) lo = u;
    else hi = u;
    u = (lo + hi) * 0.5;
  }
  return sampleY(u);
}

function measureBalloonStats(cut: WebtoonCutInput): {
  readonly charCount: number;
  readonly wordCount: number;
  readonly speechDensity: number;
} {
  const joined = cut.balloonTexts.join(" ");
  const derivedChars = cut.balloonTexts.join("").replace(/\s+/gu, "").length;
  const derivedWords = joined
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length > 0).length;

  const charCount = Math.max(0, Math.round(cut.balloonCharCountOverride ?? derivedChars));
  const wordCount = Math.max(0, Math.round(cut.balloonWordCountOverride ?? derivedWords));
  const speechDensity = roundTo(clamp((charCount / 42) * 0.6 + (wordCount / 11) * 0.4, 0, 1), 4);
  return { charCount, wordCount, speechDensity };
}

function computeReadingWeight(params: {
  readonly charCount: number;
  readonly wordCount: number;
  readonly gutterRatio: number;
  readonly actionIntensity: number;
  readonly aspectRatio: number;
}): number {
  const balloonLoad = params.charCount * 0.042 + params.wordCount * 0.14;
  const gutterLoad = params.gutterRatio * 0.95;
  const actionLoad = params.actionIntensity * 0.68;
  let aspectLoad = 0.12;
  if (params.aspectRatio < 0.75) {
    aspectLoad = (0.85 - clamp(params.aspectRatio, 0.35, 0.75)) * 0.9;
  } else if (params.aspectRatio > 1.35) {
    aspectLoad = (clamp(params.aspectRatio, 1.35, 2.2) - 1.35) * 0.45;
  }
  return roundTo(Math.max(0.6, 0.55 + balloonLoad + gutterLoad + actionLoad + aspectLoad), 4);
}

interface CutPreliminaryMetrics {
  readonly cut: WebtoonCutInput;
  readonly index: number;
  readonly charCount: number;
  readonly wordCount: number;
  readonly speechDensity: number;
  readonly gutterRatio: number;
  readonly actionIntensity: number;
  readonly aspectRatio: number;
  readonly readingWeight: number;
}

function classifyNarrativeBeats(items: readonly CutPreliminaryMetrics[]): {
  readonly beats: readonly NarrativeBeat[];
  readonly climaxIndex: number;
} {
  const count = items.length;
  if (count === 1) return { beats: ["climax-drop"], climaxIndex: 0 };
  if (count === 2) return { beats: ["hook", "cliffhanger"], climaxIndex: 0 };
  if (count === 3) return { beats: ["hook", "climax-drop", "cliffhanger"], climaxIndex: 1 };

  let climaxIndex = Math.max(1, count - 2);
  let bestScore = -1;
  for (let i = 1; i < count - 1; i += 1) {
    const item = items[i];
    if (!item) continue;
    const posRatio = i / (count - 1);
    const goldenProximity = 1 - Math.abs(posRatio - 0.72);
    const score =
      item.actionIntensity * 0.72 +
      (1 - item.speechDensity) * 0.14 +
      item.gutterRatio * 0.06 +
      goldenProximity * 0.08;
    if (score > bestScore) {
      bestScore = score;
      climaxIndex = i;
    }
  }

  const beats: NarrativeBeat[] = items.map((item, idx) => {
    if (idx === 0) return "hook";
    if (idx === count - 1) return "cliffhanger";
    if (idx === climaxIndex) return "climax-drop";
    if (idx < climaxIndex) {
      if (idx === climaxIndex - 1) return "tension-rise";
      if (idx === 1 && item.actionIntensity < 0.72) return "setup";
      return item.actionIntensity >= 0.52 || idx >= Math.ceil(climaxIndex * 0.5)
        ? "tension-rise"
        : "setup";
    }
    return item.actionIntensity >= 0.78 ? "climax-drop" : "tension-rise";
  });

  return { beats, climaxIndex };
}

function allocateZeroDriftFrames(params: {
  readonly items: readonly CutPreliminaryMetrics[];
  readonly beats: readonly NarrativeBeat[];
  readonly totalFrames: number;
  readonly fps: PromoFps;
  readonly framesPerBeat: number;
}): readonly number[] {
  const { items, beats, totalFrames, fps, framesPerBeat } = params;
  const count = items.length;
  const weighted = items.map((item, idx) => {
    const beat = beats[idx] ?? "setup";
    return item.readingWeight * BEAT_PACING_MULTIPLIER[beat];
  });
  const totalWeight = weighted.reduce((sum, w) => sum + w, 0) || 1;
  const minCutFrames = Math.max(1, Math.min(Math.floor(totalFrames / count), Math.round(fps * 0.75)));
  const halfBeat = Math.max(2, framesPerBeat * 0.5);

  const ideals = weighted.map((w) => (w / totalWeight) * totalFrames);
  const allocated = ideals.map((ideal) => {
    const snapped = Math.round(ideal / halfBeat) * halfBeat;
    const withinWindow = Math.abs(snapped - ideal) <= ideal * 0.22;
    const candidate = withinWindow ? Math.round(snapped) : Math.round(ideal);
    return Math.max(minCutFrames, candidate);
  });

  let diff = totalFrames - allocated.reduce((sum, frames) => sum + frames, 0);
  while (diff !== 0) {
    let targetIdx = -1;
    let bestMetric = -Infinity;

    for (let i = 0; i < count; i += 1) {
      const current = allocated[i] ?? minCutFrames;
      const ideal = ideals[i] ?? minCutFrames;
      const beat = beats[i] ?? "setup";
      if (diff < 0 && current <= minCutFrames) continue;

      const errorMargin = diff > 0 ? ideal - current : current - ideal;
      const priorityBonus = BEAT_PRIORITY_FOR_RESIDUAL[beat] * 0.05;
      const metric = errorMargin + priorityBonus;
      if (metric > bestMetric) {
        bestMetric = metric;
        targetIdx = i;
      }
    }

    if (targetIdx === -1) break;
    const step = diff > 0 ? 1 : -1;
    allocated[targetIdx] = (allocated[targetIdx] ?? minCutFrames) + step;
    diff -= step;
  }

  return allocated;
}

/**
 * 웹툰 다중 컷의 말풍선 밀도·여백(거터) 호흡·액션 강도·종횡비를 분석해
 * 서사 비트, 권장 BPM(92..148), 0프레임 오차 타임라인을 산출한다.
 */
export function analyzeWebtoonCutRhythm(
  cuts: readonly WebtoonCutInput[],
  options: RhythmAnalysisOptions = {},
): CutRhythmAnalysisReport {
  if (cuts.length === 0) {
    throw new Error("최소 1개 이상의 웹툰 컷이 필요합니다.");
  }

  const targetDurationSec: PromoDurationSec = options.targetDurationSec ?? 15;
  const fps: PromoFps = options.fps ?? 30;
  const totalFrames = targetDurationSec * fps;

  const prelim: CutPreliminaryMetrics[] = cuts.map((cut, index) => {
    const { charCount, wordCount, speechDensity } = measureBalloonStats(cut);
    const gutterRatio = roundTo(clamp(cut.gutterWhitespaceRatio, 0, 1), 4);
    const actionIntensity = roundTo(clamp(cut.actionIntensity, 0, 1), 4);
    const aspectRatio = roundTo(clamp(cut.aspectRatio, 0.35, 2.4), 4);
    const readingWeight = computeReadingWeight({
      charCount,
      wordCount,
      gutterRatio,
      actionIntensity,
      aspectRatio,
    });
    return {
      cut,
      index,
      charCount,
      wordCount,
      speechDensity,
      gutterRatio,
      actionIntensity,
      aspectRatio,
      readingWeight,
    };
  });

  const { beats, climaxIndex } = classifyNarrativeBeats(prelim);
  const averageActionIntensity = roundTo(
    prelim.reduce((acc, item) => acc + item.actionIntensity, 0) / prelim.length,
    4,
  );
  const averageGutterRatio = roundTo(
    prelim.reduce((acc, item) => acc + item.gutterRatio, 0) / prelim.length,
    4,
  );
  const peakActionIntensity = prelim.reduce(
    (peak, item) => Math.max(peak, item.actionIntensity),
    0,
  );

  const computedBpm = Math.round(
    clamp(
      94 +
        averageActionIntensity * 38 +
        peakActionIntensity * 14 -
        averageGutterRatio * 15 +
        clamp((prelim.length - 5) * 2.5, -5, 8),
      MIN_RECOMMENDED_BPM,
      MAX_RECOMMENDED_BPM,
    ),
  );
  const recommendedBpm =
    options.bpmOverride !== undefined
      ? Math.round(clamp(options.bpmOverride, MIN_RECOMMENDED_BPM, MAX_RECOMMENDED_BPM))
      : computedBpm;
  const framesPerBeat = roundTo((fps * 60) / recommendedBpm, 4);

  const frameDurations = allocateZeroDriftFrames({
    items: prelim,
    beats,
    totalFrames,
    fps,
    framesPerBeat,
  });

  let cursorFrame = 0;
  const beatArcBias: Readonly<Record<NarrativeBeat, number>> = {
    hook: 0.62,
    setup: 0.42,
    "tension-rise": 0.72,
    "climax-drop": 0.98,
    cliffhanger: 0.78,
  };

  const analyzedCuts: AnalyzedWebtoonCut[] = prelim.map((item, idx) => {
    const durationFrames = frameDurations[idx] ?? 1;
    const startFrame = cursorFrame;
    const endFrame = startFrame + durationFrames;
    cursorFrame = endFrame;

    const beat = beats[idx] ?? "setup";
    const emotionalArcScore = roundTo(
      clamp(item.actionIntensity * 0.62 + beatArcBias[beat] * 0.38, 0.1, 1),
      4,
    );

    return {
      id: item.cut.id,
      index: idx,
      order: item.cut.order,
      title: item.cut.title,
      sceneSummary: item.cut.sceneSummary,
      balloonTexts: [...item.cut.balloonTexts],
      balloonCharCount: item.charCount,
      balloonWordCount: item.wordCount,
      speechDensity: item.speechDensity,
      gutterWhitespaceRatio: item.gutterRatio,
      actionIntensity: item.actionIntensity,
      aspectRatio: item.aspectRatio,
      depthLayers: {
        ...item.cut.depthLayers,
        focusPoint: {
          x: roundTo(clamp(item.cut.depthLayers.focusPoint.x, -1, 1), 4),
          y: roundTo(clamp(item.cut.depthLayers.focusPoint.y, -1, 1), 4),
        },
      },
      readingWeight: item.readingWeight,
      beat,
      emotionalArcScore,
      startFrame,
      endFrame,
      durationFrames,
      startSec: roundTo(startFrame / fps, 3),
      endSec: roundTo(endFrame / fps, 3),
      durationSec: roundTo(durationFrames / fps, 3),
      beatSpanCount: roundTo(durationFrames / framesPerBeat, 2),
    };
  });

  const climaxCut = analyzedCuts[climaxIndex] ?? analyzedCuts[0];
  if (!climaxCut) {
    throw new Error("분석된 웹툰 컷을 찾을 수 없습니다.");
  }
  const allocatedFrames = analyzedCuts.reduce((sum, cut) => sum + cut.durationFrames, 0);

  return {
    targetDurationSec,
    fps,
    totalFrames,
    allocatedFrames,
    frameDrift: totalFrames - allocatedFrames,
    recommendedBpm,
    framesPerBeat,
    averageActionIntensity,
    averageGutterRatio,
    climaxCutId: climaxCut.id,
    climaxFrame: climaxCut.startFrame,
    cuts: analyzedCuts,
  };
}

function buildBeatCameraSpec(
  cut: AnalyzedWebtoonCut,
  motionScale: number,
  aspectPreset: PromoAspectPreset,
): {
  readonly styleKo: string;
  readonly layerSpeeds: ParallaxLayerSpeeds;
  readonly keyframes: readonly [
    ParallaxCameraKeyframe,
    ParallaxCameraKeyframe,
    ParallaxCameraKeyframe,
  ];
} {
  const fx = cut.depthLayers.focusPoint.x;
  const fy = cut.depthLayers.focusPoint.y;
  const verticalBias = aspectPreset === "9:16" ? 1 : 0.72;
  const intensity = 0.65 + cut.actionIntensity * 0.55;
  const gain = motionScale * intensity;

  const endFrame = Math.max(cut.startFrame, cut.endFrame - 1);
  const frameAt = (progress: number): number =>
    Math.round(lerp(cut.startFrame, endFrame, clamp(progress, 0, 1)));

  const makeKf = (
    phase: ParallaxCameraKeyframe["phase"],
    localProgress: number,
    zoom: number,
    panX: number,
    panY: number,
    tiltDeg: number,
    microShakeAmp: number,
    microShakeFreqHz: number,
    easingName: EasingPresetName,
  ): ParallaxCameraKeyframe => ({
    phase,
    localProgress: roundTo(localProgress, 3),
    frame: frameAt(localProgress),
    zoom: roundTo(zoom, 4),
    panX: roundTo(panX, 4),
    panY: roundTo(panY, 4),
    tiltDeg: roundTo(tiltDeg, 3),
    microShakeAmp: roundTo(microShakeAmp, 4),
    microShakeFreqHz: roundTo(microShakeFreqHz, 2),
    easing: EASING_CURVES[easingName],
    easingName,
  });

  if (cut.beat === "hook") {
    return {
      styleKo: "시선 고정 푸시인",
      layerSpeeds: { ...DEFAULT_PARALLAX_SPEEDS },
      keyframes: [
        makeKf("start", 0, 1.0, -fx * 0.08 * gain, 0.05 * verticalBias * gain, -1.2 * gain, 0, 0, "expo-out"),
        makeKf("mid", 0.45, 1.12 + 0.04 * gain, fx * 0.04 * gain, fy * 0.04 * verticalBias, 0.4 * gain, 0, 0, "expo-out"),
        makeKf("end", 1, 1.17 + 0.05 * gain, fx * 0.08 * gain, fy * 0.06 * verticalBias, 0, 0, 0, "silk-reveal"),
      ],
    };
  }

  if (cut.beat === "setup") {
    const isTallCut = cut.aspectRatio < 0.85;
    const panSpanX = isTallCut ? 0.03 : 0.1;
    const panSpanY = isTallCut ? 0.11 * verticalBias : 0.03 * verticalBias;
    return {
      styleKo: isTallCut ? "종스크롤 수직 패닝" : "수평 와이드 패닝",
      layerSpeeds: { ...DEFAULT_PARALLAX_SPEEDS },
      keyframes: [
        makeKf("start", 0, 1.04, -panSpanX * gain, -panSpanY * gain, 0, 0, 0, "smooth-dolly"),
        makeKf("mid", 0.5, 1.08, fx * 0.03, fy * 0.03, 0.35 * fx, 0, 0, "smooth-dolly"),
        makeKf("end", 1, 1.11, panSpanX * gain, panSpanY * gain, 0, 0, 0, "smooth-dolly"),
      ],
    };
  }

  if (cut.beat === "tension-rise") {
    const tiltDir = fx >= 0 ? -1 : 1;
    return {
      styleKo: "긴장 가속 달리인 + 더치 틸트",
      layerSpeeds: { ...DEFAULT_PARALLAX_SPEEDS },
      keyframes: [
        makeKf("start", 0, 1.03, -fx * 0.04 * gain, 0.03 * verticalBias, 0, 0, 0, "tension-climb"),
        makeKf("mid", 0.58, 1.14 + 0.04 * gain, fx * 0.05 * gain, fy * 0.04 * verticalBias, tiltDir * 1.4 * gain, 0.004 * gain, 12, "tension-climb"),
        makeKf("end", 1, 1.25 + 0.05 * gain, fx * 0.09 * gain, fy * 0.06 * verticalBias, tiltDir * 2.5 * gain, 0.008 * gain, 16, "tension-climb"),
      ],
    };
  }

  if (cut.beat === "climax-drop") {
    const tiltSnap = fx >= 0 ? 3.2 : -3.2;
    return {
      styleKo: "스냅 줌 임팩트 + 미세 쉐이크",
      layerSpeeds: { ...DEFAULT_PARALLAX_SPEEDS },
      keyframes: [
        makeKf("start", 0, 1.04, -fx * 0.03, 0.02, 0, 0.006 * gain, 18, "snap-impact"),
        makeKf("mid", 0.28, 1.32 + 0.08 * gain, fx * 0.1 * gain, fy * 0.07 * verticalBias, tiltSnap * gain, 0.024 * gain, 24, "snap-impact"),
        makeKf("end", 1, 1.24 + 0.04 * gain, fx * 0.07 * gain, fy * 0.05 * verticalBias, tiltSnap * 0.35 * gain, 0.005 * gain, 16, "expo-out"),
      ],
    };
  }

  return {
    styleKo: "여운 슬로우 리빌 풀백",
    layerSpeeds: { ...DEFAULT_PARALLAX_SPEEDS },
    keyframes: [
      makeKf("start", 0, 1.2 + 0.04 * gain, fx * 0.08 * gain, fy * 0.06 * verticalBias, -0.8 * gain, 0, 0, "silk-reveal"),
      makeKf("mid", 0.55, 1.11 + 0.02 * gain, fx * 0.03 * gain, fy * 0.02 * verticalBias, -0.25 * gain, 0, 0, "silk-reveal"),
      makeKf("end", 1, 1.02, 0, 0, 0, 0, 0, "silk-reveal"),
    ],
  };
}

/**
 * 분석된 리듬 리포트를 바탕으로 컷별 2.5D 다중 평면(BG 0.25 · MG 0.65 · FG 1.15)
 * 카메라 키프레임(start / mid / end) 트랙을 생성한다.
 */
export function generateParallaxCameraKeyframes(
  rhythmReport: CutRhythmAnalysisReport,
  options: ParallaxDirectorOptions = {},
): readonly CutParallaxTrack[] {
  const motionScale = clamp(options.motionScale ?? 1, 0.5, 1.5);
  const aspectPreset: PromoAspectPreset = options.aspectPreset ?? "9:16";

  return rhythmReport.cuts.map((cut) => {
    const spec = buildBeatCameraSpec(cut, motionScale, aspectPreset);
    return {
      cutId: cut.id,
      beat: cut.beat,
      startFrame: cut.startFrame,
      endFrame: cut.endFrame,
      durationFrames: cut.durationFrames,
      layerSpeeds: spec.layerSpeeds,
      cameraStyleKo: spec.styleKo,
      keyframes: spec.keyframes,
    };
  });
}

/**
 * 임의의 절대 프레임 시점에서 현재 활성 컷의 2.5D 카메라 포즈와
 * BG/MG/FG 평면별 패럴랙스 변환 오프셋을 결정론적으로 계산한다.
 */
export function evaluateParallaxCameraAtFrame(
  tracks: readonly CutParallaxTrack[],
  frame: number,
  options: { readonly reducedMotion?: boolean } = {},
): EvaluatedParallaxPose {
  const lastTrack = tracks[tracks.length - 1];
  if (!lastTrack) {
    throw new Error("평가할 패럴랙스 트랙이 비어 있습니다.");
  }

  const clampedFrame = Math.round(clamp(frame, 0, Math.max(0, lastTrack.endFrame - 1)));
  const activeTrack =
    tracks.find((track) => clampedFrame >= track.startFrame && clampedFrame < track.endFrame) ??
    lastTrack;

  const [startKf, midKf, endKf] = activeTrack.keyframes;
  const span = Math.max(1, activeTrack.durationFrames - 1);
  const localProgress = clamp((clampedFrame - activeTrack.startFrame) / span, 0, 1);

  const inFirstHalf = localProgress <= midKf.localProgress;
  const fromKf = inFirstHalf ? startKf : midKf;
  const toKf = inFirstHalf ? midKf : endKf;
  const segSpan = Math.max(1e-5, toKf.localProgress - fromKf.localProgress);
  const segT = clamp((localProgress - fromKf.localProgress) / segSpan, 0, 1);
  const eased = evaluateCubicBezier(segT, toKf.easing);

  const zoom = lerp(fromKf.zoom, toKf.zoom, eased);
  const panX = lerp(fromKf.panX, toKf.panX, eased);
  const panY = lerp(fromKf.panY, toKf.panY, eased);
  const tiltDeg = lerp(fromKf.tiltDeg, toKf.tiltDeg, eased);
  const shakeAmp = options.reducedMotion ? 0 : lerp(fromKf.microShakeAmp, toKf.microShakeAmp, eased);
  const shakeFreq = lerp(fromKf.microShakeFreqHz, toKf.microShakeFreqHz, eased);

  const decay = Math.exp(-3.0 * Math.abs(localProgress - midKf.localProgress));
  const phase = (clampedFrame - activeTrack.startFrame) * (shakeFreq * 0.075 + 0.35);
  const shakeOffsetX = shakeAmp > 0 ? Math.sin(phase) * shakeAmp * decay : 0;
  const shakeOffsetY = shakeAmp > 0 ? Math.cos(phase * 1.43) * shakeAmp * decay * 0.72 : 0;

  const { bgParallax, mgParallax, fgParallax } = activeTrack.layerSpeeds;
  const effectiveX = panX + shakeOffsetX;
  const effectiveY = panY + shakeOffsetY;
  const zoomDelta = zoom - 1;

  return {
    cutId: activeTrack.cutId,
    beat: activeTrack.beat,
    frame: clampedFrame,
    localProgress: roundTo(localProgress, 4),
    zoom: roundTo(zoom, 4),
    panX: roundTo(panX, 4),
    panY: roundTo(panY, 4),
    tiltDeg: roundTo(tiltDeg, 3),
    shakeOffsetX: roundTo(shakeOffsetX, 5),
    shakeOffsetY: roundTo(shakeOffsetY, 5),
    layerSpeeds: activeTrack.layerSpeeds,
    bgOffset: {
      x: roundTo(effectiveX * bgParallax, 5),
      y: roundTo(effectiveY * bgParallax, 5),
      scale: roundTo(1 + zoomDelta * (0.45 + bgParallax), 4),
    },
    mgOffset: {
      x: roundTo(effectiveX * mgParallax, 5),
      y: roundTo(effectiveY * mgParallax, 5),
      scale: roundTo(1 + zoomDelta * (0.35 + mgParallax), 4),
    },
    fgOffset: {
      x: roundTo(effectiveX * fgParallax, 5),
      y: roundTo(effectiveY * fgParallax, 5),
      scale: roundTo(1 + zoomDelta * fgParallax, 4),
    },
  };
}

/**
 * 웹툰 컷 배열에서 리듬 분석 -> 2.5D 패럴랙스 -> 오디오 큐시트 -> Remotion 매니페스트까지
 * 한 번에 결정론적으로 산출하는 통합 파이프라인.
 */
export function directWebtoonPromo(
  cuts: readonly WebtoonCutInput[],
  options: DirectPromoPipelineOptions = {},
): DirectedWebtoonPromoPlan {
  const rhythm = analyzeWebtoonCutRhythm(cuts, {
    targetDurationSec: options.targetDurationSec,
    fps: options.fps,
    bpmOverride: options.bpmOverride,
  });
  const parallaxTracks = generateParallaxCameraKeyframes(rhythm, {
    motionScale: options.motionScale,
    aspectPreset: options.aspectPreset,
  });
  const audioCueSheet = generateAudioCueSheet(rhythm);
  const manifest = buildRemotionPromoManifest(rhythm, parallaxTracks, audioCueSheet, {
    aspectPreset: options.aspectPreset,
    compositionId: options.compositionId,
    seriesTitle: options.seriesTitle,
    episodeTitle: options.episodeTitle,
    presetId: options.presetId,
  });
  return {
    rhythm,
    parallaxTracks,
    audioCueSheet,
    manifest,
  };
}
