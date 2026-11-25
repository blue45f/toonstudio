/**
 * 무빙툰 릴스/쇼츠 BPM 비트 동기화 · -12dB BGM 사이드체인 덕킹 · -14 LUFS / -1.0 dBTP 리미터 프리플라이트 ·
 * WebVTT(.vtt) / SubRip(.srt) 자막 익스포터 엔진 (Wave 40E).
 */

import { requireFinite, requireSampleBudget, subtitleContentIssues } from "./reels-input-guards";

export type TimeSignatureId = "4/4" | "3/4" | "6/8";
export type BeatSnapMode = "downbeat" | "beat" | "half-beat";
export type AudioEventKind = "cut-transition" | "sfx-impact" | "camera-accent" | "title-drop";
export type DuckingTriggerSource = "dialogue" | "voiceover" | "sfx";
export type DuckingEnvelopePhase = "idle" | "attack" | "hold" | "release";
export type AudioStemRole = "bgm" | "dialogue" | "voiceover" | "sfx";
export type LoudnessPreflightStatus = "pass" | "adjust" | "clip-risk";
export type SubtitleFormatId = "vtt" | "srt";

export const TARGET_INTEGRATED_LUFS = -14.0;
export const MAX_TRUE_PEAK_DBTP = -1.0;
export const DEFAULT_BGM_DUCKING_DB = -12.0;
export const LUFS_TOLERANCE_LU = 1.0;

export const WEBVTT_TIMECODE_LINE_RE = /^\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}(?: .+)?$/;
export const SRT_TIMECODE_LINE_RE = /^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/;

export interface BpmGridConfig {
  readonly bpm: number;
  readonly durationSec: number;
  readonly timeSignature?: TimeSignatureId;
  readonly offsetSec?: number;
}

export interface BeatGridMarker {
  readonly index: number;
  readonly barNumber: number;
  readonly beatInBar: number;
  readonly timeSec: number;
  readonly isDownbeat: boolean;
  readonly energyWeight: number;
}

export interface BpmBeatGrid {
  readonly bpm: number;
  readonly timeSignature: TimeSignatureId;
  readonly beatsPerBar: number;
  readonly beatIntervalSec: number;
  readonly barIntervalSec: number;
  readonly durationSec: number;
  readonly offsetSec: number;
  readonly markers: readonly BeatGridMarker[];
  readonly downbeatTimesSec: readonly number[];
}

export interface AudioTimelineEvent {
  readonly id: string;
  readonly kind: AudioEventKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly rawTimeSec: number;
  readonly preferDownbeat?: boolean;
}

export interface SnappedTimelineEvent {
  readonly id: string;
  readonly kind: AudioEventKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly rawTimeSec: number;
  readonly snappedTimeSec: number;
  readonly deltaMs: number;
  readonly targetBar: number;
  readonly targetBeatInBar: number;
  readonly isDownbeatAligned: boolean;
}

export interface BeatSnapReport {
  readonly grid: BpmBeatGrid;
  readonly mode: BeatSnapMode;
  readonly snappedEvents: readonly SnappedTimelineEvent[];
  readonly totalEventCount: number;
  readonly downbeatAlignedCount: number;
  readonly meanAbsDeltaMs: number;
  readonly maxAbsDeltaMs: number;
  readonly syncTightnessScore: number;
}

export interface DuckingTriggerRegion {
  readonly id: string;
  readonly source: DuckingTriggerSource;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly customDuckDb?: number;
}

export interface DuckingCurveConfig {
  readonly durationSec: number;
  readonly triggers: readonly DuckingTriggerRegion[];
  readonly bgmBaseGainDb?: number;
  readonly duckingDepthDb?: number;
  readonly attackMs?: number;
  readonly holdMs?: number;
  readonly releaseMs?: number;
  readonly sampleStepMs?: number;
}

export interface MergedDuckingSpan {
  readonly startSec: number;
  readonly endSec: number;
  readonly attackStartSec: number;
  readonly holdEndSec: number;
  readonly releaseEndSec: number;
  readonly targetDuckDb: number;
  readonly triggerIds: readonly string[];
  readonly sources: readonly DuckingTriggerSource[];
}

export interface DuckingCurvePoint {
  readonly timeSec: number;
  readonly gainOffsetDb: number;
  readonly effectiveBgmDb: number;
  readonly phase: DuckingEnvelopePhase;
  readonly activeTriggerIds: readonly string[];
}

export interface BgmDuckingCurveResult {
  readonly durationSec: number;
  readonly bgmBaseGainDb: number;
  readonly duckingDepthDb: number;
  readonly attackMs: number;
  readonly holdMs: number;
  readonly releaseMs: number;
  readonly mergedSpans: readonly MergedDuckingSpan[];
  readonly samples: readonly DuckingCurvePoint[];
  readonly totalDuckedDurationSec: number;
  readonly duckedCoveragePct: number;
  readonly averageGainOffsetDb: number;
  readonly minGainOffsetDb: number;
}

export interface AudioStemMixInput {
  readonly stemId: string;
  readonly role: AudioStemRole;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly rmsDbfs: number;
  readonly peakDbtp: number;
  readonly activeDurationSec: number;
  readonly gainDb: number;
}

export interface LoudnessPreflightInput {
  readonly stems: readonly AudioStemMixInput[];
  readonly totalDurationSec: number;
  readonly duckingCurve?: BgmDuckingCurveResult;
  readonly targetLufs?: number;
  readonly truePeakCeilingDbtp?: number;
  readonly limiterEnabled?: boolean;
}

export interface LoudnessStemContribution {
  readonly stemId: string;
  readonly role: AudioStemRole;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly effectiveRmsDbfs: number;
  readonly effectivePeakDbtp: number;
  readonly duckingAppliedDb: number;
  readonly energySharePct: number;
}

export interface LoudnessLimiterPreflightReport {
  readonly targetIntegratedLufs: number;
  readonly maxTruePeakDbtp: number;
  readonly limiterEnabled: boolean;
  readonly rawIntegratedLufs: number;
  readonly shortTermMaxLufs: number;
  readonly loudnessRangeLu: number;
  readonly rawTruePeakDbtp: number;
  readonly recommendedMakeupGainDb: number;
  readonly preLimiterPeakDbtp: number;
  readonly requiredLimiterReductionDb: number;
  readonly masteredIntegratedLufs: number;
  readonly masteredTruePeakDbtp: number;
  readonly platformNormalizationGainDb: number;
  readonly isLufsCompliant: boolean;
  readonly isTruePeakCompliant: boolean;
  readonly needsLimiterEngagement: boolean;
  readonly status: LoudnessPreflightStatus;
  readonly stemBreakdown: readonly LoudnessStemContribution[];
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface SubtitleCueInput {
  readonly id: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly text: string;
  readonly speaker?: string;
}

export interface SubtitleTimingIssue {
  readonly cueId: string;
  readonly kind: "invalid-range" | "overlap" | "fast-reading-speed" | "empty-text" | "unsupported-content";
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface SubtitleTimingValidation {
  readonly valid: boolean;
  readonly cueCount: number;
  readonly totalDurationSec: number;
  readonly maxCharsPerSec: number;
  readonly issues: readonly SubtitleTimingIssue[];
}

export interface SubtitleExportOptions {
  readonly title?: string;
  readonly safeZoneLinePct?: number;
  readonly includeSpeakerLabel?: boolean;
}

export interface SubtitleTrackExportResult {
  readonly cueCount: number;
  readonly vttContent: string;
  readonly srtContent: string;
  readonly vttTimecodeFormatValid: boolean;
  readonly srtTimecodeFormatValid: boolean;
  readonly validation: SubtitleTimingValidation;
}

export interface ReelsAudioSessionPreset {
  readonly sessionId: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly bpm: number;
  readonly timeSignature: TimeSignatureId;
  readonly durationSec: number;
  readonly bgmBaseGainDb: number;
  readonly events: readonly AudioTimelineEvent[];
  readonly duckingTriggers: readonly DuckingTriggerRegion[];
  readonly stems: readonly AudioStemMixInput[];
  readonly subtitleCuesKo: readonly SubtitleCueInput[];
  readonly subtitleCuesEn: readonly SubtitleCueInput[];
}

export const DEFAULT_REELS_AUDIO_SESSION: ReelsAudioSessionPreset = {
  sessionId: "ep12-reels-trailer-128bpm",
  titleKo: "EP.12 옥상 대치 15초 릴스 마스터 세션",
  titleEn: "EP.12 Rooftop Clash 15s Reels Master Session",
  bpm: 128,
  timeSignature: "4/4",
  durationSec: 15,
  bgmBaseGainDb: -6,
  events: [
    { id: "ev-intro-cut", kind: "cut-transition", labelKo: "오프닝 빗소리 → 옥상 컷 전환", labelEn: "Rain Intro -> Rooftop Cut", rawTimeSec: 1.79, preferDownbeat: true },
    { id: "ev-sword-draw", kind: "sfx-impact", labelKo: "검집 발도 임팩트 SFX", labelEn: "Blade Unsheathe Impact SFX", rawTimeSec: 3.84, preferDownbeat: true },
    { id: "ev-dolly-climax", kind: "camera-accent", labelKo: "돌리 줌 클로즈업 악센트", labelEn: "Dolly-Zoom Close-Up Accent", rawTimeSec: 7.42, preferDownbeat: true },
    { id: "ev-title-drop", kind: "title-drop", labelKo: "회차 타이틀 로고 드롭", labelEn: "Episode Title Drop", rawTimeSec: 11.34, preferDownbeat: true },
  ],
  duckingTriggers: [
    { id: "dk-line-1", source: "dialogue", labelKo: "서준 대사 #1", labelEn: "Seojun Line #1", startSec: 1.9, endSec: 3.4 },
    { id: "dk-sfx-1", source: "sfx", labelKo: "발도 금속 마찰음 SFX", labelEn: "Metallic Unsheathe SFX", startSec: 3.65, endSec: 4.35 },
    { id: "dk-vo-2", source: "voiceover", labelKo: "내레이션 클라이맥스", labelEn: "Climax Voiceover", startSec: 7.5, endSec: 10.6 },
    { id: "dk-cta-3", source: "dialogue", labelKo: "다음 화 예고 콜아웃", labelEn: "Next-Ep Teaser Callout", startSec: 11.8, endSec: 13.9 },
  ],
  stems: [
    { stemId: "stem-bgm", role: "bgm", labelKo: "오케스트라 신스 BGM", labelEn: "Orchestral Synth BGM", rmsDbfs: -11.5, peakDbtp: -1.8, activeDurationSec: 15, gainDb: -2.0 },
    { stemId: "stem-dlg", role: "dialogue", labelKo: "주역 대사 트랙", labelEn: "Lead Dialogue Track", rmsDbfs: -15.2, peakDbtp: -3.2, activeDurationSec: 3.6, gainDb: 0.5 },
    { stemId: "stem-vo", role: "voiceover", labelKo: "내레이션 보이스오버", labelEn: "Narrator Voiceover", rmsDbfs: -14.8, peakDbtp: -2.9, activeDurationSec: 3.1, gainDb: 0.5 },
    { stemId: "stem-sfx", role: "sfx", labelKo: "타격·빗소리 SFX", labelEn: "Impact & Rain SFX", rmsDbfs: -16.4, peakDbtp: -0.9, activeDurationSec: 2.8, gainDb: 0.0 },
  ],
  subtitleCuesKo: [
    { id: "sub-1", startSec: 1.9, endSec: 3.4, speaker: "서준", text: "비 그치기 전에 끝낸다." },
    { id: "sub-2", startSec: 4.5, endSec: 7.1, speaker: "유나", text: "옥상 열쇠는 처음부터 여기 있었어." },
    { id: "sub-3", startSec: 7.5, endSec: 10.6, speaker: "내레이션", text: "열두 번째 밤, 숨겨진 인과가 뒤집힌다." },
    { id: "sub-4", startSec: 11.8, endSec: 14.2, speaker: "예고", text: "지금 바로 EP.12 전체 컷 보기" },
  ],
  subtitleCuesEn: [
    { id: "sub-1", startSec: 1.9, endSec: 3.4, speaker: "Seojun", text: "We finish this before the rain stops." },
    { id: "sub-2", startSec: 4.5, endSec: 7.1, speaker: "Yuna", text: "The rooftop key was here all along." },
    { id: "sub-3", startSec: 7.5, endSec: 10.6, speaker: "Narrator", text: "On the twelfth night, hidden causality turns." },
    { id: "sub-4", startSec: 11.8, endSec: 14.2, speaker: "Teaser", text: "Read Episode 12 full cut right now." },
  ],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits = 3): number {
  const factor = Math.pow(10, digits);
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function beatsPerBarForSignature(sig: TimeSignatureId): number {
  return sig === "3/4" ? 3 : sig === "6/8" ? 6 : 4;
}

function findNearestMarker(markers: readonly BeatGridMarker[], timeSec: number): BeatGridMarker | undefined {
  let best = markers[0];
  if (!best) return undefined;
  let minDist = Math.abs(timeSec - best.timeSec);
  for (const marker of markers) {
    const dist = Math.abs(timeSec - marker.timeSec);
    if (dist < minDist) {
      minDist = dist;
      best = marker;
    }
  }
  return best;
}

/** BPM과 박자표에 따라 결정론적 비트·다운비트 그리드를 생성한다. */
export function buildBpmBeatGrid(config: BpmGridConfig): BpmBeatGrid {
  requireFinite(config.bpm, "BPM", 40, 240);
  requireFinite(config.durationSec, "클립 길이", Number.MIN_VALUE);
  requireFinite(config.offsetSec ?? 0, "비트 시작 위치", 0);
  const bpm = config.bpm;
  const durationSec = Math.max(0.5, config.durationSec);
  const timeSignature: TimeSignatureId = config.timeSignature ?? "4/4";
  const offsetSec = Math.max(0, config.offsetSec ?? 0);
  const beatsPerBar = beatsPerBarForSignature(timeSignature);
  const beatIntervalSec = 60 / bpm;
  const barIntervalSec = beatIntervalSec * beatsPerBar;
  const markers: BeatGridMarker[] = [];
  const downbeatTimesSec: number[] = [];

  const markerCount = Math.max(0, Math.floor((durationSec + 1e-6 - offsetSec) / beatIntervalSec) + 1);
  requireSampleBudget(markerCount);
  for (let index = 0; index < markerCount; index += 1) {
    const timeSec = offsetSec + index * beatIntervalSec;
    const barNumber = Math.floor(index / beatsPerBar) + 1;
    const beatInBar = (index % beatsPerBar) + 1;
    const isDownbeat = beatInBar === 1;
    const energyWeight = isDownbeat ? 1.0 : timeSignature === "4/4" && beatInBar === 3 ? 0.72 : 0.45;
    const roundedTime = roundTo(timeSec, 4);
    markers.push({ index, barNumber, beatInBar, timeSec: roundedTime, isDownbeat, energyWeight });
    if (isDownbeat) downbeatTimesSec.push(roundedTime);
  }

  return {
    bpm: roundTo(bpm, 2), timeSignature, beatsPerBar,
    beatIntervalSec: roundTo(beatIntervalSec, 4), barIntervalSec: roundTo(barIntervalSec, 4),
    durationSec: roundTo(durationSec, 3), offsetSec: roundTo(offsetSec, 4),
    markers, downbeatTimesSec,
  };
}

/** 컷 전환·효과음 타점 이벤트를 BPM 비트 또는 다운비트(강박)에 정밀 스냅 정렬한다. */
export function snapTimelineEventsToBeatGrid(
  events: readonly AudioTimelineEvent[],
  config: BpmGridConfig & { readonly mode?: BeatSnapMode },
): BeatSnapReport {
  const grid = buildBpmBeatGrid(config);
  const mode: BeatSnapMode = config.mode ?? "downbeat";
  const downbeatMarkers = grid.markers.filter((m) => m.isDownbeat);

  const snappedEvents: SnappedTimelineEvent[] = events.map((event) => {
    const rawTimeSec = clamp(event.rawTimeSec, 0, grid.durationSec);
    const useDownbeat = mode === "downbeat" || Boolean(event.preferDownbeat);
    let bestTime = rawTimeSec;
    let bestBar = 1;
    let bestBeat = 1;
    let isDownbeatAligned = false;

    if (useDownbeat) {
      const marker = findNearestMarker(downbeatMarkers, rawTimeSec);
      if (marker) {
        bestTime = marker.timeSec;
        bestBar = marker.barNumber;
        bestBeat = marker.beatInBar;
        isDownbeatAligned = true;
      }
    } else if (mode === "half-beat" && grid.markers.length > 0) {
      const step = grid.beatIntervalSec / 2;
      const stepIdx = Math.max(0, Math.round((rawTimeSec - grid.offsetSec) / step));
      bestTime = roundTo(clamp(grid.offsetSec + stepIdx * step, 0, grid.durationSec), 4);
      const beatFloat = stepIdx / 2;
      bestBar = Math.floor(beatFloat / grid.beatsPerBar) + 1;
      bestBeat = (Math.floor(beatFloat) % grid.beatsPerBar) + 1;
      isDownbeatAligned = stepIdx % (grid.beatsPerBar * 2) === 0;
    } else {
      const marker = findNearestMarker(grid.markers, rawTimeSec);
      if (marker) {
        bestTime = marker.timeSec;
        bestBar = marker.barNumber;
        bestBeat = marker.beatInBar;
        isDownbeatAligned = marker.isDownbeat;
      }
    }

    return {
      id: event.id, kind: event.kind, labelKo: event.labelKo, labelEn: event.labelEn,
      rawTimeSec: roundTo(rawTimeSec, 4), snappedTimeSec: roundTo(bestTime, 4),
      deltaMs: Math.round((bestTime - rawTimeSec) * 1000),
      targetBar: bestBar, targetBeatInBar: bestBeat, isDownbeatAligned,
    };
  });

  const absDeltas = snappedEvents.map((e) => Math.abs(e.deltaMs));
  const meanAbsDeltaMs = absDeltas.length > 0 ? roundTo(absDeltas.reduce((a, v) => a + v, 0) / absDeltas.length, 1) : 0;
  const maxAbsDeltaMs = absDeltas.length > 0 ? Math.max(...absDeltas) : 0;
  const downbeatAlignedCount = snappedEvents.filter((e) => e.isDownbeatAligned).length;
  const halfBarMs = Math.max(1, (grid.barIntervalSec * 1000) / 2);
  const syncTightnessScore = Math.round(clamp(100 - (meanAbsDeltaMs / halfBarMs) * 45, 0, 100));

  return {
    grid, mode, snappedEvents, totalEventCount: snappedEvents.length,
    downbeatAlignedCount, meanAbsDeltaMs, maxAbsDeltaMs, syncTightnessScore,
  };
}

function smoothCosineRamp(t: number): number {
  const c = clamp(t, 0, 1);
  return 0.5 - 0.5 * Math.cos(c * Math.PI);
}

/** 특정 재생 시점(timeSec)의 BGM 사이드체인 덕킹 감쇄량(dB)을 결정론적으로 평가한다. */
export function evaluateDuckingGainAtTime(
  curve: Pick<BgmDuckingCurveResult, "bgmBaseGainDb" | "mergedSpans">,
  timeSec: number,
): DuckingCurvePoint {
  const t = Math.max(0, timeSec);
  let deepestOffset = 0;
  let phase: DuckingEnvelopePhase = "idle";
  const activeIds = new Set<string>();

  for (const span of curve.mergedSpans) {
    if (t < span.attackStartSec || t > span.releaseEndSec) continue;
    let gainAtT: number;
    let spanPhase: DuckingEnvelopePhase;

    if (t < span.startSec) {
      const frac = clamp((t - span.attackStartSec) / Math.max(1e-4, span.startSec - span.attackStartSec), 0, 1);
      gainAtT = span.targetDuckDb * smoothCosineRamp(frac);
      spanPhase = "attack";
    } else if (t <= span.holdEndSec) {
      gainAtT = span.targetDuckDb;
      spanPhase = "hold";
    } else {
      const frac = clamp((t - span.holdEndSec) / Math.max(1e-4, span.releaseEndSec - span.holdEndSec), 0, 1);
      gainAtT = span.targetDuckDb * (1 - smoothCosineRamp(frac));
      spanPhase = "release";
    }

    if (gainAtT < deepestOffset || (gainAtT === deepestOffset && spanPhase === "hold")) {
      deepestOffset = gainAtT;
      phase = spanPhase;
    }
    if (Math.abs(gainAtT) > 0.01) {
      for (const id of span.triggerIds) activeIds.add(id);
    }
  }

  const gainOffsetDb = roundTo(deepestOffset, 2);
  return {
    timeSec: roundTo(t, 3), gainOffsetDb,
    effectiveBgmDb: roundTo(curve.bgmBaseGainDb + gainOffsetDb, 2),
    phase, activeTriggerIds: Array.from(activeIds),
  };
}

/** 대사·보이스오버·SFX 구간을 병합하여 자동 -12dB BGM 사이드체인 덕킹 커브를 생성한다. */
export function generateBgmSidechainDuckingCurve(config: DuckingCurveConfig): BgmDuckingCurveResult {
  requireFinite(config.durationSec, "클립 길이", Number.MIN_VALUE);
  for (const value of [config.bgmBaseGainDb ?? -6, config.duckingDepthDb ?? DEFAULT_BGM_DUCKING_DB, config.attackMs ?? 45, config.holdMs ?? 120, config.releaseMs ?? 260]) requireFinite(value, "덕킹 가정값");
  requireFinite(config.sampleStepMs ?? 50, "표본 간격", 10, 250);
  for (const trigger of config.triggers) {
    requireFinite(trigger.startSec, "트리거 시작", 0);
    requireFinite(trigger.endSec, "트리거 종료", trigger.startSec);
    requireFinite(trigger.customDuckDb ?? -12, "트리거 덕킹 가정값");
  }
  const durationSec = Math.max(0.5, config.durationSec);
  const bgmBaseGainDb = config.bgmBaseGainDb ?? -6;
  const duckingDepthDb = -Math.abs(config.duckingDepthDb ?? DEFAULT_BGM_DUCKING_DB);
  const attackMs = clamp(config.attackMs ?? 45, 5, 300);
  const holdMs = clamp(config.holdMs ?? 120, 0, 500);
  const releaseMs = clamp(config.releaseMs ?? 260, 20, 1200);
  const sampleStepMs = clamp(config.sampleStepMs ?? 50, 10, 250);
  const attackSec = attackMs / 1000;
  const holdSec = holdMs / 1000;
  const releaseSec = releaseMs / 1000;

  const validSorted = config.triggers
    .filter((tr) => tr.endSec > tr.startSec && tr.startSec < durationSec)
    .map((tr) => ({
      ...tr,
      startSec: clamp(tr.startSec, 0, durationSec),
      endSec: clamp(tr.endSec, 0, durationSec),
      duckDb: -Math.abs(tr.customDuckDb ?? duckingDepthDb),
    }))
    .sort((a, b) => a.startSec - b.startSec);

  const mergedSpans: MergedDuckingSpan[] = [];
  for (const trig of validSorted) {
    const prev = mergedSpans[mergedSpans.length - 1];
    if (prev && trig.startSec <= prev.holdEndSec + attackSec) {
      const mergedEnd = Math.max(prev.endSec, trig.endSec);
      const mergedHoldEnd = Math.min(durationSec, mergedEnd + holdSec);
      mergedSpans[mergedSpans.length - 1] = {
        startSec: prev.startSec, endSec: roundTo(mergedEnd, 4),
        attackStartSec: prev.attackStartSec, holdEndSec: roundTo(mergedHoldEnd, 4),
        releaseEndSec: roundTo(Math.min(durationSec, mergedHoldEnd + releaseSec), 4),
        targetDuckDb: Math.min(prev.targetDuckDb, trig.duckDb),
        triggerIds: [...prev.triggerIds, trig.id],
        sources: Array.from(new Set<DuckingTriggerSource>([...prev.sources, trig.source])),
      };
    } else {
      const holdEndSec = Math.min(durationSec, trig.endSec + holdSec);
      mergedSpans.push({
        startSec: roundTo(trig.startSec, 4), endSec: roundTo(trig.endSec, 4),
        attackStartSec: roundTo(Math.max(0, trig.startSec - attackSec), 4),
        holdEndSec: roundTo(holdEndSec, 4),
        releaseEndSec: roundTo(Math.min(durationSec, holdEndSec + releaseSec), 4),
        targetDuckDb: trig.duckDb, triggerIds: [trig.id], sources: [trig.source],
      });
    }
  }

  const samples: DuckingCurvePoint[] = [];
  const stepSec = sampleStepMs / 1000;
  const totalSteps = Math.max(1, Math.ceil(durationSec / stepSec));
  requireSampleBudget(totalSteps + 1);
  let gainSum = 0;
  let duckedSamples = 0;
  let minGainOffsetDb = 0;

  for (let i = 0; i <= totalSteps; i += 1) {
    const point = evaluateDuckingGainAtTime({ bgmBaseGainDb, mergedSpans }, Math.min(durationSec, i * stepSec));
    samples.push(point);
    gainSum += point.gainOffsetDb;
    if (point.gainOffsetDb <= -0.5) duckedSamples += 1;
    if (point.gainOffsetDb < minGainOffsetDb) minGainOffsetDb = point.gainOffsetDb;
  }

  const totalDuckedDurationSec = roundTo(mergedSpans.reduce((acc, s) => acc + Math.max(0, s.holdEndSec - s.startSec), 0), 3);
  return {
    durationSec: roundTo(durationSec, 3), bgmBaseGainDb: roundTo(bgmBaseGainDb, 2),
    duckingDepthDb: roundTo(duckingDepthDb, 2), attackMs, holdMs, releaseMs, mergedSpans, samples,
    totalDuckedDurationSec, duckedCoveragePct: roundTo((duckedSamples / Math.max(1, samples.length)) * 100, 1),
    averageGainOffsetDb: roundTo(gainSum / Math.max(1, samples.length), 2), minGainOffsetDb: roundTo(minGainOffsetDb, 2),
  };
}

function dbToLinearPower(db: number): number {
  return Math.pow(10, db / 10);
}

function linearPowerToDb(power: number): number {
  return power <= 1e-12 ? -70 : 10 * Math.log10(power);
}

/** 통합 라우드니스(-14 LUFS) 및 True-Peak(-1.0 dBTP) 리미터 프리플라이트를 계산한다. */
export function evaluateLoudnessLimiterPreflight(input: LoudnessPreflightInput): LoudnessLimiterPreflightReport {
  const targetIntegratedLufs = input.targetLufs ?? TARGET_INTEGRATED_LUFS;
  const maxTruePeakDbtp = input.truePeakCeilingDbtp ?? MAX_TRUE_PEAK_DBTP;
  const limiterEnabled = input.limiterEnabled ?? true;
  const totalDurationSec = Math.max(0.5, input.totalDurationSec);
  const kWeightCalibrationDb = -0.691;
  const interSampleHeadroomDb = 0.35;

  const computedStems = input.stems.map((stem) => {
    const activeRatio = clamp(stem.activeDurationSec / totalDurationSec, 0.05, 1.0);
    const duckingAppliedDb = stem.role === "bgm" && input.duckingCurve ? input.duckingCurve.averageGainOffsetDb : 0;
    const effectiveRmsDbfs = roundTo(stem.rmsDbfs + stem.gainDb + duckingAppliedDb, 2);
    const effectivePeakDbtp = roundTo(stem.peakDbtp + stem.gainDb + interSampleHeadroomDb, 2);
    const weightedPower = activeRatio * dbToLinearPower(effectiveRmsDbfs);
    const momentaryPower = dbToLinearPower(effectiveRmsDbfs);
    return { stem, effectiveRmsDbfs, effectivePeakDbtp, duckingAppliedDb, weightedPower, momentaryPower };
  });

  const totalWeightedPower = computedStems.reduce((acc, s) => acc + s.weightedPower, 0);
  const totalMomentaryPower = computedStems.reduce((acc, s) => acc + s.momentaryPower, 0);
  const rawIntegratedLufs = roundTo(linearPowerToDb(totalWeightedPower) + kWeightCalibrationDb, 2);
  const shortTermMaxLufs = roundTo(linearPowerToDb(totalMomentaryPower) + kWeightCalibrationDb, 2);
  const loudnessRangeLu = roundTo(clamp(Math.abs(shortTermMaxLufs - rawIntegratedLufs) * 1.65 + 1.8, 1.2, 18), 2);

  const sortedPeaks = computedStems.map((s) => s.effectivePeakDbtp).sort((a, b) => b - a);
  const primaryPeak = sortedPeaks[0] ?? -18;
  const secondaryPeak = sortedPeaks[1] ?? -40;
  const peakCrestLift = secondaryPeak > primaryPeak - 6 ? roundTo(0.45 * dbToLinearPower((secondaryPeak - primaryPeak) / 2), 2) : 0;
  const rawTruePeakDbtp = roundTo(primaryPeak + peakCrestLift, 2);

  const recommendedMakeupGainDb = roundTo(clamp(targetIntegratedLufs - rawIntegratedLufs, -18, 18), 2);
  const preLimiterPeakDbtp = roundTo(rawTruePeakDbtp + recommendedMakeupGainDb, 2);
  const requiredLimiterReductionDb = roundTo(Math.max(0, preLimiterPeakDbtp - maxTruePeakDbtp), 2);
  const needsLimiterEngagement = requiredLimiterReductionDb > 0.05;

  const masteredTruePeakDbtp = limiterEnabled ? roundTo(Math.min(preLimiterPeakDbtp, maxTruePeakDbtp), 2) : preLimiterPeakDbtp;
  const limiterDensityTrimDb = limiterEnabled && requiredLimiterReductionDb > 2.5
    ? -Math.min(0.45, (requiredLimiterReductionDb - 2.5) * 0.08)
    : 0;
  const masteredIntegratedLufs = roundTo(rawIntegratedLufs + recommendedMakeupGainDb + limiterDensityTrimDb, 2);
  const platformNormalizationGainDb = roundTo(Math.min(0, targetIntegratedLufs - masteredIntegratedLufs), 2);

  const isLufsCompliant = Math.abs(masteredIntegratedLufs - targetIntegratedLufs) <= LUFS_TOLERANCE_LU;
  const isTruePeakCompliant = masteredTruePeakDbtp <= maxTruePeakDbtp + 0.001;
  const status: LoudnessPreflightStatus = !isTruePeakCompliant
    ? "clip-risk"
    : !isLufsCompliant || (limiterEnabled && requiredLimiterReductionDb > 6)
      ? "adjust"
      : "pass";

  const stemBreakdown: LoudnessStemContribution[] = computedStems.map((item) => ({
    stemId: item.stem.stemId, role: item.stem.role, labelKo: item.stem.labelKo, labelEn: item.stem.labelEn,
    effectiveRmsDbfs: item.effectiveRmsDbfs, effectivePeakDbtp: item.effectivePeakDbtp,
    duckingAppliedDb: roundTo(item.duckingAppliedDb, 2),
    energySharePct: totalWeightedPower > 0 ? roundTo((item.weightedPower / totalWeightedPower) * 100, 1) : 0,
  }));

  const sign = recommendedMakeupGainDb >= 0 ? "+" : "";
  const summaryKo = status === "pass"
    ? `입력 수치의 예상 목표 범위 충족: ${masteredIntegratedLufs.toFixed(1)} LUFS / ${masteredTruePeakDbtp.toFixed(1)} dBTP (메이크업 ${sign}${recommendedMakeupGainDb.toFixed(1)}dB, 리미터 GR ${requiredLimiterReductionDb.toFixed(1)}dB)`
    : status === "clip-risk"
      ? `클리핑 위험: True-Peak ${masteredTruePeakDbtp.toFixed(1)} dBTP가 상한(${maxTruePeakDbtp.toFixed(1)} dBTP) 초과 — 리미터를 활성화하세요.`
      : `조정 권장: 목표 ${targetIntegratedLufs.toFixed(1)} LUFS 대비 과도한 리미터 압축(GR ${requiredLimiterReductionDb.toFixed(1)}dB) 또는 라우드니스 편차 감지.`;
  const summaryEn = status === "pass"
    ? `Estimated scalar target range met: ${masteredIntegratedLufs.toFixed(1)} LUFS / ${masteredTruePeakDbtp.toFixed(1)} dBTP (Makeup ${sign}${recommendedMakeupGainDb.toFixed(1)}dB, Limiter GR ${requiredLimiterReductionDb.toFixed(1)}dB)`
    : status === "clip-risk"
      ? `Clip risk: True-Peak ${masteredTruePeakDbtp.toFixed(1)} dBTP exceeds ${maxTruePeakDbtp.toFixed(1)} dBTP ceiling — engage limiter.`
      : `Adjustment advised: heavy limiter GR (${requiredLimiterReductionDb.toFixed(1)}dB) or LUFS drift.`;

  return {
    targetIntegratedLufs, maxTruePeakDbtp, limiterEnabled, rawIntegratedLufs, shortTermMaxLufs,
    loudnessRangeLu, rawTruePeakDbtp, recommendedMakeupGainDb, preLimiterPeakDbtp, requiredLimiterReductionDb,
    masteredIntegratedLufs, masteredTruePeakDbtp, platformNormalizationGainDb, isLufsCompliant,
    isTruePeakCompliant, needsLimiterEngagement, status, stemBreakdown, summaryKo, summaryEn,
  };
}

function formatTimecodeWithSeparator(timeSec: number, msSeparator: "." | ","): string {
  // 정수 밀리초 반올림을 먼저 수행하여 59.9996초가 00:01:00.000으로 정확히 올림되도록 보장한다.
  const totalMs = Math.round(Math.max(0, Number.isFinite(timeSec) ? timeSec : 0) * 1000);
  const ms = String(totalMs % 1000).padStart(3, "0");
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}${msSeparator}${ms}`;
}

/** 초 단위 타임스탬프를 WebVTT 정밀 타임코드(HH:MM:SS.mmm)로 변환한다. */
export function formatWebVttTimecode(timeSec: number): string {
  return formatTimecodeWithSeparator(timeSec, ".");
}

/** 초 단위 타임스탬프를 SubRip 정밀 타임코드(HH:MM:SS,mmm)로 변환한다. */
export function formatSubRipTimecode(timeSec: number): string {
  return formatTimecodeWithSeparator(timeSec, ",");
}

/** 자막 큐 배열의 시간 순서·겹침·가독 속도(초당 글자 수)를 검증한다. */
export function validateSubtitleTiming(cues: readonly SubtitleCueInput[]): SubtitleTimingValidation {
  const issues: SubtitleTimingIssue[] = [];
  let maxCharsPerSec = 0;
  let totalDurationSec = 0;

  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i];
    if (!cue) continue;
    const trimmed = cue.text.trim();
    if (trimmed.length === 0) {
      issues.push({ cueId: cue.id, kind: "empty-text", messageKo: `${cue.id}: 자막 텍스트가 비어 있습니다.`, messageEn: `${cue.id}: Subtitle text is empty.` });
    }
    if (!Number.isFinite(cue.startSec) || !Number.isFinite(cue.endSec) || cue.startSec < 0 || cue.endSec <= cue.startSec || Math.round(cue.endSec * 1000) <= Math.round(cue.startSec * 1000)) {
      issues.push({ cueId: cue.id, kind: "invalid-range", messageKo: `${cue.id}: 종료 시각이 시작 시각보다 뒤여야 합니다.`, messageEn: `${cue.id}: End time must be strictly after start time.` });
      continue;
    }

    const duration = cue.endSec - cue.startSec;
    totalDurationSec = Math.max(totalDurationSec, cue.endSec);
    const cpsLimit = /[\u3131-\uD79D\u3040-\u30FF\u4E00-\u9FFF]/.test(trimmed) ? 18 : 24;
    const cps = trimmed.replace(/\s+/g, "").length / Math.max(0.1, duration);
    if (cps > maxCharsPerSec) maxCharsPerSec = cps;
    if (cps > cpsLimit) {
      issues.push({
        cueId: cue.id, kind: "fast-reading-speed",
        messageKo: `${cue.id}: 읽기 속도 ${cps.toFixed(1)}자/초가 권장 상한(${cpsLimit}자/초)을 초과했습니다.`,
        messageEn: `${cue.id}: Reading speed ${cps.toFixed(1)} chars/s exceeds ${cpsLimit} chars/s.`,
      });
    }

    const prev = i > 0 ? cues[i - 1] : undefined;
    if (prev && cue.startSec < prev.endSec - 0.001) {
      issues.push({
        cueId: cue.id, kind: "overlap",
        messageKo: `${cue.id}: 이전 자막(${prev.id})과 타임코드가 겹칩니다.`,
        messageEn: `${cue.id}: Overlaps with previous cue (${prev.id}).`,
      });
    }
  }

  return {
    valid: issues.length === 0, cueCount: cues.length,
    totalDurationSec: roundTo(totalDurationSec, 3), maxCharsPerSec: roundTo(maxCharsPerSec, 1), issues,
  };
}

/** WebVTT(.vtt) 및 SubRip(.srt) 자막 트랙을 동시 생성하고 타임코드 규격을 자동 검증한다. */
export function generateSubtitleTracks(
  cues: readonly SubtitleCueInput[],
  options?: SubtitleExportOptions,
): SubtitleTrackExportResult {
  const sortedCues = [...cues].sort((a, b) => a.startSec - b.startSec);
  const timing = validateSubtitleTiming(sortedCues);
  const contentIssues = subtitleContentIssues(sortedCues, options);
  const validation = { ...timing, valid: timing.valid && contentIssues.length === 0, issues: [...timing.issues, ...contentIssues] };
  if (!validation.valid) return { cueCount: cues.length, vttContent: "", srtContent: "", vttTimecodeFormatValid: false, srtTimecodeFormatValid: false, validation };
  const includeSpeaker = options?.includeSpeakerLabel ?? false;
  const linePct = options?.safeZoneLinePct !== undefined ? clamp(Math.round(options.safeZoneLinePct), 15, 92) : undefined;

  const vttBlocks: string[] = [options?.title ? `WEBVTT - ${options.title}` : "WEBVTT"];
  const srtBlocks: string[] = [];
  const vttTimeLines: string[] = [];
  const srtTimeLines: string[] = [];

  for (let i = 0; i < sortedCues.length; i += 1) {
    const cue = sortedCues[i];
    if (!cue) continue;
    const startSec = cue.startSec;
    const endSec = cue.endSec;
    const bodyText = includeSpeaker && cue.speaker ? `[${cue.speaker}] ${cue.text}` : cue.text;

    const cueSettings = linePct !== undefined ? ` line:${linePct}% align:center` : "";
    const vttTimeLine = `${formatWebVttTimecode(startSec)} --> ${formatWebVttTimecode(endSec)}${cueSettings}`;
    vttTimeLines.push(vttTimeLine);
    vttBlocks.push(`${cue.id}\n${vttTimeLine}\n${bodyText}`);

    const srtTimeLine = `${formatSubRipTimecode(startSec)} --> ${formatSubRipTimecode(endSec)}`;
    srtTimeLines.push(srtTimeLine);
    srtBlocks.push(`${i + 1}\n${srtTimeLine}\n${bodyText}`);
  }

  const vttContent = `${vttBlocks.join("\n\n")}\n`;
  const srtContent = srtBlocks.length > 0 ? `${srtBlocks.join("\n\n")}\n` : "";
  return {
    cueCount: sortedCues.length,
    vttContent,
    srtContent,
    vttTimecodeFormatValid: vttContent.startsWith("WEBVTT") && vttTimeLines.every((line) => WEBVTT_TIMECODE_LINE_RE.test(line)),
    srtTimecodeFormatValid: srtTimeLines.every((line) => SRT_TIMECODE_LINE_RE.test(line)),
    validation,
  };
}
