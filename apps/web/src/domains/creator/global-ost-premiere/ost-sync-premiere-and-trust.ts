/**
 * 웹 OST ↔ 컷 감정 자동 크로스페이드 · 라이브 시사회 극장 · 독자 스크롤 히트맵 +
 * 인간 작화 증명서 · 비가시적 포렌식 워터마크 · 작가 건강 코치 통합 모듈.
 */

import {
  buildStealthWatermarkSignature,
  computeDeterministicHex64,
  evaluateErgonomicBurnoutCoach,
  generateHumanCraftCertificate,
  type CraftContributionInput,
  type ErgonomicCoachEvaluation,
  type ErgonomicCoachInput,
  type ErgonomicRiskLevel,
  type ErgonomicStretchStep,
  type HumanCraftCertificate,
  type HumanCraftGradeId,
  type StealthWatermarkInput,
  type StealthWatermarkSignature,
  type WatermarkSessionPurpose,
} from "./human-craft-and-ergonomic-trust";

export {
  buildStealthWatermarkSignature,
  evaluateErgonomicBurnoutCoach,
  generateHumanCraftCertificate,
  type CraftContributionInput,
  type ErgonomicCoachEvaluation,
  type ErgonomicCoachInput,
  type ErgonomicRiskLevel,
  type ErgonomicStretchStep,
  type HumanCraftCertificate,
  type HumanCraftGradeId,
  type StealthWatermarkInput,
  type StealthWatermarkSignature,
  type WatermarkSessionPurpose,
};

export const STUDIO_AUDIO_OST_WORKSHOP_PATH = "/studio/assets/audio" as const;

export type CutEmotionTag = "calm" | "tension" | "climax" | "romance" | "comedy";

export interface OstInstrumentMix {
  readonly piano: number;
  readonly strings: number;
  readonly percussion: number;
}

export interface OstCuePoint {
  readonly cutIndex: number;
  readonly cutLabelKo: string;
  readonly scrollStart: number;
  readonly emotion: CutEmotionTag;
  readonly tempoBpm: number;
}

export interface DynamicOstMixResult {
  readonly scrollProgress: number;
  readonly activeCue: OstCuePoint;
  readonly nextCue: OstCuePoint | null;
  readonly crossfadeRatio: number;
  readonly isCrossfading: boolean;
  readonly dominantEmotion: CutEmotionTag;
  readonly dominantEmotionLabelKo: string;
  readonly layers: OstInstrumentMix;
  readonly masterTempoBpm: number;
  readonly audioWorkshopHref: string;
  readonly mixSummaryKo: string;
}

export interface ResolveDynamicOstOptions {
  readonly timeline?: readonly OstCuePoint[];
  readonly emotionOverride?: CutEmotionTag;
  readonly crossfadeWindow?: number;
}

export const CUT_EMOTION_LABELS_KO: Readonly<Record<CutEmotionTag, string>> = {
  calm: "잔잔함 · 도입",
  tension: "긴장 · 서스펜스",
  climax: "클라이맥스 · 격돌",
  romance: "로맨스 · 감정선",
  comedy: "코미디 · 경쾌함",
};

const EMOTION_LAYER_PROFILES: Readonly<Record<CutEmotionTag, OstInstrumentMix>> = {
  calm: { piano: 82, strings: 42, percussion: 12 },
  tension: { piano: 36, strings: 78, percussion: 68 },
  climax: { piano: 58, strings: 94, percussion: 96 },
  romance: { piano: 88, strings: 84, percussion: 18 },
  comedy: { piano: 76, strings: 34, percussion: 72 },
};

const EMOTION_DEFAULT_BPM: Readonly<Record<CutEmotionTag, number>> = {
  calm: 78,
  tension: 112,
  climax: 146,
  romance: 86,
  comedy: 124,
};

export const DEFAULT_OST_CUT_TIMELINE: readonly OstCuePoint[] = [
  { cutIndex: 1, cutLabelKo: "1컷 · 새벽 빗소리 도입", scrollStart: 0.0, emotion: "calm", tempoBpm: 78 },
  { cutIndex: 14, cutLabelKo: "14컷 · 옥상 재회와 시선 교차", scrollStart: 0.22, emotion: "romance", tempoBpm: 86 },
  { cutIndex: 29, cutLabelKo: "29컷 · 경보음과 추격 시작", scrollStart: 0.46, emotion: "tension", tempoBpm: 114 },
  { cutIndex: 47, cutLabelKo: "47컷 · 결계 붕괴 클라이맥스", scrollStart: 0.7, emotion: "climax", tempoBpm: 148 },
  { cutIndex: 60, cutLabelKo: "60컷 · 에필로그 티격태격 쿠키", scrollStart: 0.88, emotion: "comedy", tempoBpm: 124 },
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function cosineEase(t: number): number {
  const safe = clamp(t, 0, 1);
  return 0.5 - 0.5 * Math.cos(Math.PI * safe);
}

function blendLayerValue(from: number, to: number, ratio: number): number {
  return Math.round(clamp(from + (to - from) * ratio, 0, 100));
}

/** 독자 스크롤 진행도(0~1)와 컷 감정 태그에 따라 피아노·스트링·퍼커션 볼륨을 실시간 크로스페이드한다. */
export function resolveDynamicOstLayerMix(
  scrollProgress: number,
  options: ResolveDynamicOstOptions = {},
): DynamicOstMixResult {
  const progress = roundTo(clamp(scrollProgress, 0, 1), 4);
  const rawTimeline =
    options.timeline && options.timeline.length > 0 ? options.timeline : DEFAULT_OST_CUT_TIMELINE;
  const timeline = [...rawTimeline].sort((a, b) => a.scrollStart - b.scrollStart);
  const crossfadeWindow = clamp(options.crossfadeWindow ?? 0.08, 0.01, 0.25);

  let activeIndex = 0;
  for (let i = 0; i < timeline.length; i += 1) {
    const cue = timeline[i];
    if (cue && progress >= cue.scrollStart) activeIndex = i;
  }

  const activeCue = timeline[activeIndex] ?? DEFAULT_OST_CUT_TIMELINE[0]!;
  const nextCue = timeline[activeIndex + 1] ?? null;

  if (options.emotionOverride) {
    const targetEmotion = options.emotionOverride;
    const baseLayers = EMOTION_LAYER_PROFILES[targetEmotion];
    const masterTempoBpm = EMOTION_DEFAULT_BPM[targetEmotion];
    const audioWorkshopHref = `${STUDIO_AUDIO_OST_WORKSHOP_PATH}?emotion=${targetEmotion}&bpm=${masterTempoBpm}`;
    return {
      scrollProgress: progress,
      activeCue: { ...activeCue, emotion: targetEmotion, tempoBpm: masterTempoBpm },
      nextCue,
      crossfadeRatio: 0,
      isCrossfading: false,
      dominantEmotion: targetEmotion,
      dominantEmotionLabelKo: CUT_EMOTION_LABELS_KO[targetEmotion],
      layers: baseLayers,
      masterTempoBpm,
      audioWorkshopHref,
      mixSummaryKo:
        `${CUT_EMOTION_LABELS_KO[targetEmotion]} 프리뷰 고정 · 피아노 ${baseLayers.piano}% · ` +
        `스트링 ${baseLayers.strings}% · 퍼커션 ${baseLayers.percussion}% (${masterTempoBpm} BPM)`,
    };
  }

  let rawFade = 0;
  if (nextCue) {
    const fadeStart = Math.max(activeCue.scrollStart, nextCue.scrollStart - crossfadeWindow);
    if (progress > fadeStart && nextCue.scrollStart > fadeStart) {
      rawFade = clamp((progress - fadeStart) / (nextCue.scrollStart - fadeStart), 0, 1);
    }
  }

  const easedRatio = roundTo(cosineEase(rawFade), 3);
  const isCrossfading = nextCue !== null && easedRatio > 0.01 && easedRatio < 0.99;

  const fromMix = EMOTION_LAYER_PROFILES[activeCue.emotion];
  const toMix = nextCue ? EMOTION_LAYER_PROFILES[nextCue.emotion] : fromMix;

  const layers: OstInstrumentMix = {
    piano: blendLayerValue(fromMix.piano, toMix.piano, easedRatio),
    strings: blendLayerValue(fromMix.strings, toMix.strings, easedRatio),
    percussion: blendLayerValue(fromMix.percussion, toMix.percussion, easedRatio),
  };

  const masterTempoBpm = Math.round(
    activeCue.tempoBpm + ((nextCue?.tempoBpm ?? activeCue.tempoBpm) - activeCue.tempoBpm) * easedRatio,
  );
  const dominantEmotion = nextCue && easedRatio >= 0.5 ? nextCue.emotion : activeCue.emotion;
  const dominantEmotionLabelKo = CUT_EMOTION_LABELS_KO[dominantEmotion];
  const audioWorkshopHref = `${STUDIO_AUDIO_OST_WORKSHOP_PATH}?emotion=${dominantEmotion}&bpm=${masterTempoBpm}`;

  const mixSummaryKo = isCrossfading && nextCue
    ? `${CUT_EMOTION_LABELS_KO[activeCue.emotion]} → ${CUT_EMOTION_LABELS_KO[nextCue.emotion]} 크로스페이드(${Math.round(easedRatio * 100)}%) · ` +
      `피아노 ${layers.piano}% · 스트링 ${layers.strings}% · 퍼커션 ${layers.percussion}%`
    : `${dominantEmotionLabelKo} 싱크 활성 · 피아노 ${layers.piano}% · 스트링 ${layers.strings}% · 퍼커션 ${layers.percussion}% (${masterTempoBpm} BPM)`;

  return {
    scrollProgress: progress,
    activeCue,
    nextCue,
    crossfadeRatio: easedRatio,
    isCrossfading,
    dominantEmotion,
    dominantEmotionLabelKo,
    layers,
    masterTempoBpm,
    audioWorkshopHref,
    mixSummaryKo,
  };
}

export interface PremiereDanmakuMessage {
  readonly id: string;
  readonly atCutIndex: number;
  readonly atSecond: number;
  readonly authorLabel: string;
  readonly text: string;
  readonly reactionKind: "cheer" | "gasp" | "theory" | "ost-love";
}

export interface AuthorCommentaryMarker {
  readonly cutIndex: number;
  readonly titleKo: string;
  readonly commentaryKo: string;
  readonly voiceDurationSec: number;
}

export interface FanArtRemixRevenueSplit {
  readonly challengeTitleKo: string;
  readonly featuredCutIndex: number;
  readonly originalAuthorSharePercent: number;
  readonly remixCreatorSharePercent: number;
  readonly platformInfraSharePercent: number;
  readonly totalPercentCheck: number;
  readonly settlementRuleKo: string;
  readonly licenseScopeKo: string;
}

export interface PremiereTheaterSession {
  readonly sessionId: string;
  readonly episodeTitle: string;
  readonly scheduledStartIso: string;
  readonly concurrentViewers: number;
  readonly syncModeKo: string;
  readonly audioWorkshopHref: string;
  readonly danmakuQueue: readonly PremiereDanmakuMessage[];
  readonly commentaryMarkers: readonly AuthorCommentaryMarker[];
  readonly remixChallengeSplit: FanArtRemixRevenueSplit;
  readonly premiereReadinessKo: string;
}

export const DEFAULT_PREMIERE_DANMAKU: readonly PremiereDanmakuMessage[] = [
  {
    id: "dm-1", atCutIndex: 14, atSecond: 38, authorLabel: "독자_하늘별",
    text: "여기서 피아노랑 스트링 같이 올라오는 연출 소름 돋아요!", reactionKind: "ost-love",
  },
  {
    id: "dm-2", atCutIndex: 29, atSecond: 84, authorLabel: "추리왕_민수",
    text: "@카이 눈썹 흉터 방향 복선 회수한 거 맞죠?!", reactionKind: "theory",
  },
  {
    id: "dm-3", atCutIndex: 47, atSecond: 142, authorLabel: "밤샘독자",
    text: "결계 깨지는 47컷 구도 미쳤다... 1컷 리믹스 무조건 도전합니다", reactionKind: "gasp",
  },
];

export const DEFAULT_AUTHOR_COMMENTARIES: readonly AuthorCommentaryMarker[] = [
  {
    cutIndex: 14,
    titleKo: "옥상 빗방울 역광 연출 비하인드",
    commentaryKo: "세라의 장미빛 은발 림라이트만 살리고 배경 채도를 낮춰 첫 대사가 돋보이게 잡았습니다.",
    voiceDurationSec: 24,
  },
  {
    cutIndex: 47,
    titleKo: "클라이맥스 47컷 퍼커션 박자 싱크",
    commentaryKo: "유진이 검을 뽑는 타이밍에 맞춰 148 BPM 퍼커션이 터지도록 여백 길이를 220px로 늘렸습니다.",
    voiceDurationSec: 31,
  },
];

export function buildPremiereTheaterSession(input: {
  readonly episodeTitle?: string;
  readonly scheduledStartIso?: string;
  readonly concurrentViewers?: number;
  readonly featuredCutIndex?: number;
  readonly danmaku?: readonly PremiereDanmakuMessage[];
  readonly commentaries?: readonly AuthorCommentaryMarker[];
  readonly originalAuthorSharePercent?: number;
  readonly remixCreatorSharePercent?: number;
} = {}): PremiereTheaterSession {
  const episodeTitle = input.episodeTitle?.trim() || "제12화 · 빗속의 결계 붕괴";
  const scheduledStartIso = input.scheduledStartIso?.trim() || "2026-11-24T22:00:00+09:00";
  const concurrentViewers = Math.max(1, Math.round(input.concurrentViewers ?? 1280));
  const featuredCutIndex = Math.max(1, Math.round(input.featuredCutIndex ?? 47));

  const authorShare = Math.round(clamp(input.originalAuthorSharePercent ?? 55, 50, 80));
  const maxRemixShare = 100 - authorShare - 5;
  const remixShare = Math.round(clamp(input.remixCreatorSharePercent ?? 35, 10, maxRemixShare));
  const platformShare = 100 - authorShare - remixShare;

  const sessionHash = computeDeterministicHex64(`${episodeTitle}|${scheduledStartIso}|${featuredCutIndex}`).slice(0, 8);
  const danmakuQueue = input.danmaku && input.danmaku.length > 0 ? input.danmaku : DEFAULT_PREMIERE_DANMAKU;
  const commentaryMarkers =
    input.commentaries && input.commentaries.length > 0 ? input.commentaries : DEFAULT_AUTHOR_COMMENTARIES;

  return {
    sessionId: `PREMIERE-${sessionHash.toUpperCase()}`,
    episodeTitle,
    scheduledStartIso,
    concurrentViewers,
    syncModeKo: "동시 입장 스크롤 동기화 + 탄막 레이어 + 작가 음성 코멘터리 오버레이",
    audioWorkshopHref: `${STUDIO_AUDIO_OST_WORKSHOP_PATH}?mode=premiere&cut=${featuredCutIndex}`,
    danmakuQueue,
    commentaryMarkers,
    remixChallengeSplit: {
      challengeTitleKo: `${featuredCutIndex}컷 공식 팬아트 리믹스 챌린지`,
      featuredCutIndex,
      originalAuthorSharePercent: authorShare,
      remixCreatorSharePercent: remixShare,
      platformInfraSharePercent: platformShare,
      totalPercentCheck: authorShare + remixShare + platformShare,
      settlementRuleKo: `원작자 ${authorShare}% · 리믹스 참가자 ${remixShare}% · 정산/인프라 ${platformShare}% (자동 분배 원장 기록)`,
      licenseScopeKo: "공식 지정 1컷 선화/구도 기반 비상업·승인 굿즈 리믹스 한정, AI 학습 재배포 금지",
    },
    premiereReadinessKo: `동시 시사회 정원 ${concurrentViewers.toLocaleString("ko-KR")}명 · 탄막 ${danmakuQueue.length}건 · 코멘터리 ${commentaryMarkers.length}개 준비 완료`,
  };
}

export interface CutDwellSample {
  readonly cutIndex: number;
  readonly cutTitleKo: string;
  readonly avgDwellSeconds: number;
  readonly readerCompletionPercent: number;
  readonly dropOffDeltaPercent: number;
  readonly replayRatePercent: number;
}

export type CutHeatmapSeverity = "peak" | "healthy" | "watch" | "drop-alert";

export interface CutHeatmapDiagnostic {
  readonly sample: CutDwellSample;
  readonly heatIntensity: number;
  readonly severity: CutHeatmapSeverity;
  readonly severityLabelKo: string;
  readonly actionHintKo: string;
}

export interface ScrollDwellHeatmapReport {
  readonly cuts: readonly CutHeatmapDiagnostic[];
  readonly averageDwellSeconds: number;
  readonly overallRetentionPercent: number;
  readonly peakCutIndex: number;
  readonly dropAlertCuts: readonly CutHeatmapDiagnostic[];
  readonly summaryKo: string;
}

export const DEFAULT_SCROLL_DWELL_SAMPLES: readonly CutDwellSample[] = [
  { cutIndex: 1, cutTitleKo: "1컷 · 도입 빗소리", avgDwellSeconds: 4.8, readerCompletionPercent: 98, dropOffDeltaPercent: 2.0, replayRatePercent: 11 },
  { cutIndex: 14, cutTitleKo: "14컷 · 옥상 재회", avgDwellSeconds: 7.4, readerCompletionPercent: 95, dropOffDeltaPercent: 1.5, replayRatePercent: 28 },
  { cutIndex: 24, cutTitleKo: "24컷 · 설정 장문 설명", avgDwellSeconds: 1.8, readerCompletionPercent: 83, dropOffDeltaPercent: 11.2, replayRatePercent: 3 },
  { cutIndex: 35, cutTitleKo: "35컷 · 추격 전환", avgDwellSeconds: 5.1, readerCompletionPercent: 80, dropOffDeltaPercent: 2.4, replayRatePercent: 14 },
  { cutIndex: 47, cutTitleKo: "47컷 · 결계 붕괴", avgDwellSeconds: 9.2, readerCompletionPercent: 79, dropOffDeltaPercent: 0.9, replayRatePercent: 42 },
  { cutIndex: 60, cutTitleKo: "60컷 · 다음 화 예고", avgDwellSeconds: 6.3, readerCompletionPercent: 77, dropOffDeltaPercent: 1.8, replayRatePercent: 21 },
];

export function analyzeScrollDwellHeatmap(
  samples: readonly CutDwellSample[] = DEFAULT_SCROLL_DWELL_SAMPLES,
): ScrollDwellHeatmapReport {
  const source = samples.length > 0 ? samples : DEFAULT_SCROLL_DWELL_SAMPLES;
  const maxDwell = Math.max(0.5, ...source.map((item) => item.avgDwellSeconds));

  const cuts: CutHeatmapDiagnostic[] = source.map((sample) => {
    const heatIntensity = Math.round(clamp((sample.avgDwellSeconds / maxDwell) * 100, 5, 100));
    let severity: CutHeatmapSeverity = "healthy";
    let severityLabelKo = "안정 체류";
    let actionHintKo = "현재 컷 호흡과 말풍선 밀도를 유지해도 좋습니다.";

    if (sample.dropOffDeltaPercent >= 7.5 || sample.avgDwellSeconds < 2.2) {
      severity = "drop-alert";
      severityLabelKo = "이탈 주의 컷";
      actionHintKo =
        "독자 이탈 폭이 크거나 체류 시간이 짧습니다. 장문 말풍선을 2컷으로 분할하고 시선 유도 효과음을 배치하세요.";
    } else if (sample.dropOffDeltaPercent >= 4.5 || sample.avgDwellSeconds < 3.2) {
      severity = "watch";
      severityLabelKo = "속도 점검";
      actionHintKo = "스크롤 통과 속도가 빠른 구간입니다. 컷 사이 세로 여백이나 리액션 클로즈업을 보강해 보세요.";
    } else if (heatIntensity >= 85 || sample.replayRatePercent >= 30) {
      severity = "peak";
      severityLabelKo = "몰입 피크 컷";
      actionHintKo = "재열람률과 체류 시간이 가장 높습니다. 1컷 팬아트 리믹스 챌린지·시사회 하이라이트 후보로 추천합니다.";
    }

    return { sample, heatIntensity, severity, severityLabelKo, actionHintKo };
  });

  const averageDwellSeconds = roundTo(
    source.reduce((sum, item) => sum + item.avgDwellSeconds, 0) / source.length,
    1,
  );
  const overallRetentionPercent = roundTo(source[source.length - 1]?.readerCompletionPercent ?? 0, 1);
  const peakEntry = [...cuts].sort((a, b) => b.sample.avgDwellSeconds - a.sample.avgDwellSeconds)[0];
  const peakCutIndex = peakEntry?.sample.cutIndex ?? source[0]?.cutIndex ?? 1;
  const dropAlertCuts = cuts.filter((item) => item.severity === "drop-alert");

  const summaryKo =
    dropAlertCuts.length > 0
      ? `평균 체류 ${averageDwellSeconds}초 · 완독률 ${overallRetentionPercent}% · 이탈 주의 ${dropAlertCuts.length}컷(${dropAlertCuts.map((c) => `${c.sample.cutIndex}컷`).join(", ")}) 진단`
      : `평균 체류 ${averageDwellSeconds}초 · 완독률 ${overallRetentionPercent}% · 이탈 급증 구간 없음 (최고 몰입 ${peakCutIndex}컷)`;

  return { cuts, averageDwellSeconds, overallRetentionPercent, peakCutIndex, dropAlertCuts, summaryKo };
}
