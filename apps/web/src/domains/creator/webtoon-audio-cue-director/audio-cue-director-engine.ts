import { assertAudioCueInput, assertKoreanLipSyncInput, MAX_LIP_SYNC_FRAMES } from "./audio-cue-input-contract";

/**
 * Wave 45C — 웹툰 오디오 큐 디렉터 순수 엔진.
 *
 * - 한국어 유니코드 완성형(`0xAC00..0xD7A3`) 초성·중성·종성 정수 분해 기반
 *   7대 립싱크 비젬(`A`/`E`/`I`/`O`/`U`/`M-B-P`/`REST`) 타임라인 합성기
 * - 컷별 스크롤 진행률(`0..100%`) 트리거 BGM 무드 전환(`-14 LUFS`, 대사 `-10dB` 자동 덕킹)
 *   및 SFX 히트 마커 스케줄러
 * - 표준 WebVTT(`.vtt`) 자막 및 SMPTE 타임코드 포함 EDL/JSON 큐시트 직렬화
 *
 * 모든 타이밍·입모양·음압 수치는 규칙 기반 추정(`dataSourceKind: "estimate"`)이다.
 */

export const AUDIO_CUE_DATA_SOURCE_KIND = "estimate" as const;
export type AudioCueDataSourceKind = typeof AUDIO_CUE_DATA_SOURCE_KIND;

export const ESTIMATE_NOTICE_KO =
  "규칙 기반 추정(estimate) 큐시트입니다. 실제 오디오를 재생·합성하거나 저장하지 않습니다. 성우 녹음·파형 계측 후 최종 타임코드를 보정하세요.";
export const ESTIMATE_NOTICE_EN =
  "Rule-based estimate cue sheet; no audio playback, synthesis or storage. Re-conform final timecodes against recorded voice and mastered audio stems.";

export const HANGUL_SYLLABLE_START = 0xac00;
export const HANGUL_SYLLABLE_END = 0xd7a3;
export const HANGUL_JUNGSEONG_COUNT = 21;
export const HANGUL_JONGSEONG_COUNT = 28;
export const HANGUL_CHOSEONG_STRIDE = HANGUL_JUNGSEONG_COUNT * HANGUL_JONGSEONG_COUNT;

export const DEFAULT_LIP_SYNC_FPS = 24;
export const DEFAULT_SYLLABLES_PER_SECOND = 4.8;
export const TARGET_BGM_LUFS = -14;
export const DEFAULT_DIALOGUE_DUCKING_DB = -10;
export const DEFAULT_DUCKING_ATTACK_MS = 80;
export const DEFAULT_DUCKING_RELEASE_MS = 240;

export const LIP_SYNC_VISEMES = ["A", "E", "I", "O", "U", "M-B-P", "REST"] as const;
export type LipSyncViseme = (typeof LIP_SYNC_VISEMES)[number];

export const SPEECH_EMOTION_TONES = ["calm", "urgent", "whisper", "shout"] as const;
export type SpeechEmotionTone = (typeof SPEECH_EMOTION_TONES)[number];

export const BGM_MOOD_IDS = [
  "calm-daily", "mystery-pulse", "action-surge", "emotional-piano", "horror-drone", "silence-breath",
] as const;
export type BgmMoodId = (typeof BGM_MOOD_IDS)[number];

export const SFX_CATEGORY_IDS = [
  "impact-hit", "whoosh-slash", "heartbeat-pulse", "door-creak",
  "spark-chime", "crowd-murmur", "footstep-echo", "silence-drop",
] as const;
export type SfxCategoryId = (typeof SFX_CATEGORY_IDS)[number];

export type AudioCuePresetId = "noir-rooftop-chase" | "romance-station-confession" | "fantasy-dungeon-boss";
export type LipSyncSegmentPhase = "onset" | "glide" | "nucleus" | "coda" | "rest";
export type BgmCrossfadeCurve = "equal-power" | "linear-fade" | "hard-cut";
export type SemanticToneToken = "accent" | "cool" | "good" | "warn" | "bad" | "muted";

export interface VisemeProfile {
  readonly id: LipSyncViseme; readonly labelKo: string; readonly labelEn: string; readonly phoneticHintKo: string;
  readonly openness01: number; readonly width01: number; readonly roundness01: number; readonly semanticTone: SemanticToneToken;
}

export interface EmotionToneProfile {
  readonly id: SpeechEmotionTone; readonly labelKo: string; readonly labelEn: string;
  readonly rateMultiplier: number; readonly jawAmplitudeMultiplier: number; readonly pauseScale: number;
  readonly estimatedVocalRmsDbfs: number; readonly directionKo: string; readonly directionEn: string;
  readonly semanticTone: SemanticToneToken;
}

export interface BgmMoodProfile {
  readonly id: BgmMoodId; readonly labelKo: string; readonly labelEn: string;
  readonly bpm: number; readonly keySignature: string; readonly defaultCrossfadeMs: number;
  readonly instrumentationKo: string; readonly instrumentationEn: string; readonly semanticTone: SemanticToneToken;
}

export interface SfxCategoryProfile {
  readonly id: SfxCategoryId; readonly labelKo: string; readonly labelEn: string;
  readonly defaultDurationMs: number; readonly defaultGainDb: number; readonly peakLimitDbfs: number;
}

export interface DecomposedHangulSyllable {
  readonly char: string; readonly codePoint: number;
  readonly choseongIndex: number; readonly jungseongIndex: number; readonly jongseongIndex: number;
  readonly choseong: string; readonly jungseong: string; readonly jongseong: string;
  readonly hasBilabialOnset: boolean; readonly hasBilabialCoda: boolean;
  readonly glideViseme: LipSyncViseme | null; readonly vowelViseme: LipSyncViseme;
}

export interface KoreanLipSyncInput {
  readonly text: string; readonly syllablesPerSecond?: number; readonly emotionTone?: SpeechEmotionTone;
  readonly fps?: number; readonly startTimeMs?: number; readonly speaker?: string;
}

export interface LipSyncSegment {
  readonly segmentIndex: number; readonly viseme: LipSyncViseme; readonly phase: LipSyncSegmentPhase;
  readonly sourceChar: string; readonly startMs: number; readonly endMs: number; readonly durationMs: number;
  readonly openness01: number; readonly width01: number; readonly roundness01: number; readonly intensity01: number;
}

export interface LipSyncFrame {
  readonly frameIndex: number; readonly timeMs: number; readonly viseme: LipSyncViseme;
  readonly phase: LipSyncSegmentPhase; readonly sourceChar: string;
  readonly openness01: number; readonly width01: number; readonly roundness01: number; readonly intensity01: number;
}

export interface KoreanLipSyncTimeline {
  readonly dataSourceKind: AudioCueDataSourceKind; readonly estimateNoticeKo: string; readonly estimateNoticeEn: string;
  readonly text: string; readonly speaker: string; readonly emotionTone: SpeechEmotionTone;
  readonly baseSyllablesPerSecond: number; readonly effectiveSyllablesPerSecond: number;
  readonly fps: number; readonly startTimeMs: number; readonly endTimeMs: number;
  readonly durationMs: number; readonly totalFrames: number; readonly hangulSyllableCount: number;
  readonly hasSpokenDialogue: boolean; readonly decomposedSyllables: readonly DecomposedHangulSyllable[];
  readonly segments: readonly LipSyncSegment[]; readonly frames: readonly LipSyncFrame[];
  readonly visemeDistribution: Readonly<Record<LipSyncViseme, number>>;
}

export interface SfxMarkerInput {
  readonly id: string; readonly category: SfxCategoryId; readonly label: string;
  readonly offsetRatio01: number; readonly gainDb?: number; readonly pan?: number; readonly durationMs?: number;
}

export interface AudioCueCutInput {
  readonly id: string; readonly label: string; readonly panelHeightPx: number;
  readonly speaker: string; readonly dialogue: string; readonly emotionTone: SpeechEmotionTone;
  readonly syllablesPerSecond?: number; readonly bgmMood: BgmMoodId;
  readonly crossfadeMs?: number; readonly minCutDurationMs?: number; readonly sfxMarkers?: readonly SfxMarkerInput[];
}

export interface EpisodeAudioCueSheetInput {
  readonly episodeTitle: string; readonly episodeNumber?: number; readonly fps?: number;
  readonly targetLufs?: number; readonly dialogueDuckingDb?: number;
  readonly duckingAttackMs?: number; readonly duckingReleaseMs?: number;
  readonly defaultSyllablesPerSecond?: number; readonly cuts: readonly AudioCueCutInput[];
}

export interface ScheduledSfxEvent {
  readonly eventId: string; readonly cutId: string; readonly cutIndex: number;
  readonly category: SfxCategoryId; readonly label: string; readonly offsetRatio01: number;
  readonly triggerScrollPct: number; readonly triggerTimeMs: number; readonly endTimeMs: number;
  readonly durationMs: number; readonly gainDb: number; readonly pan: number; readonly peakLimitDbfs: number;
}

export interface BgmMoodTransition {
  readonly transitionId: string; readonly cutId: string; readonly cutIndex: number;
  readonly triggerScrollPct: number; readonly triggerTimeMs: number;
  readonly fromMood: BgmMoodId | null; readonly toMood: BgmMoodId;
  readonly crossfadeMs: number; readonly targetLufs: number; readonly curve: BgmCrossfadeCurve;
}

export interface BgmDuckingEnvelope {
  readonly envelopeId: string; readonly cutId: string; readonly cutIndex: number;
  readonly speaker: string; readonly emotionTone: SpeechEmotionTone; readonly triggerScrollPct: number;
  readonly startTimeMs: number; readonly endTimeMs: number;
  readonly attackMs: number; readonly releaseMs: number;
  readonly baseLufs: number; readonly duckingDb: number; readonly duckedLufs: number;
}

export interface ScheduledAudioCut {
  readonly cutId: string; readonly cutIndex: number; readonly label: string; readonly panelHeightPx: number;
  readonly scrollStartPct: number; readonly scrollEndPct: number;
  readonly startTimeMs: number; readonly endTimeMs: number; readonly durationMs: number;
  readonly bgmMood: BgmMoodId; readonly crossfadeMs: number;
  readonly speaker: string; readonly dialogue: string; readonly emotionTone: SpeechEmotionTone;
  readonly bgmTargetLufs: number; readonly bgmDuckedLufs: number; readonly isDuckingActive: boolean;
  readonly lipSync: KoreanLipSyncTimeline; readonly sfxEvents: readonly ScheduledSfxEvent[];
}

export interface EpisodeAudioCueSummary {
  readonly cutCount: number; readonly spokenCutCount: number; readonly bgmTransitionCount: number;
  readonly duckingWindowCount: number; readonly sfxEventCount: number;
  readonly totalLipSyncFrames: number; readonly totalHangulSyllables: number; readonly dominantViseme: LipSyncViseme;
  readonly targetLufs: number; readonly duckedFloorLufs: number; readonly reelsTeaserReady: boolean;
}

export interface EpisodeAudioCueSheet {
  readonly schemaVersion: "webtoon-audio-cue-sheet/v1";
  readonly dataSourceKind: AudioCueDataSourceKind; readonly estimateNoticeKo: string; readonly estimateNoticeEn: string;
  readonly episodeTitle: string; readonly originalEpisodeTitle?: string; readonly episodeNumber: number; readonly fps: number;
  readonly targetLufs: number; readonly dialogueDuckingDb: number;
  readonly duckingAttackMs: number; readonly duckingReleaseMs: number;
  readonly totalDurationMs: number; readonly totalPanelHeightPx: number;
  readonly cuts: readonly ScheduledAudioCut[]; readonly bgmTransitions: readonly BgmMoodTransition[];
  readonly duckingEnvelopes: readonly BgmDuckingEnvelope[]; readonly sfxSchedule: readonly ScheduledSfxEvent[];
  readonly summary: EpisodeAudioCueSummary;
}

export interface ExportWebVttOptions {
  readonly includeCueNotes?: boolean; readonly includeSfxCaptions?: boolean;
}

export interface ExportAudioCueJsonOptions {
  readonly includeLipSyncFrames?: boolean; readonly pretty?: boolean;
}

export interface AudioCueEdlEvent {
  readonly edlIndex: number; readonly track: "BGM" | "VOICE" | "DUCK" | "SFX";
  readonly cutId: string; readonly cutIndex: number; readonly triggerScrollPct: number;
  readonly inTimeMs: number; readonly outTimeMs: number; readonly inTimecode: string; readonly outTimecode: string;
  readonly label: string; readonly detail: string;
}

export interface AudioCueEpisodePreset {
  readonly id: AudioCuePresetId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly episodeTitle: string; readonly episodeNumber: number; readonly cuts: readonly AudioCueCutInput[];
}

export const HANGUL_CHOSEONG: readonly string[] = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
export const HANGUL_JUNGSEONG: readonly string[] = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];
export const HANGUL_JONGSEONG: readonly string[] = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ",
  "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

const BILABIAL_CHOSEONG_INDICES = new Set<number>([6, 7, 8, 17]);
const BILABIAL_JONGSEONG_INDICES = new Set<number>([10, 11, 14, 16, 17, 18, 26]);
const DIGIT_KOREAN_READINGS: Readonly<Record<string, string>> = {
  "0": "영", "1": "일", "2": "이", "3": "삼", "4": "사", "5": "오", "6": "육", "7": "칠", "8": "팔", "9": "구",
};

interface JungseongVisemeRule { readonly glide: LipSyncViseme | null; readonly vowel: LipSyncViseme }

const JUNGSEONG_VISEME_RULES: readonly JungseongVisemeRule[] = [
  { glide: null, vowel: "A" }, { glide: null, vowel: "E" }, { glide: "I", vowel: "A" }, { glide: "I", vowel: "E" },
  { glide: null, vowel: "E" }, { glide: null, vowel: "E" }, { glide: "I", vowel: "E" }, { glide: "I", vowel: "E" },
  { glide: null, vowel: "O" }, { glide: "O", vowel: "A" }, { glide: "O", vowel: "E" }, { glide: "O", vowel: "E" },
  { glide: "I", vowel: "O" }, { glide: null, vowel: "U" }, { glide: "U", vowel: "E" }, { glide: "U", vowel: "E" },
  { glide: "U", vowel: "I" }, { glide: "I", vowel: "U" }, { glide: null, vowel: "U" }, { glide: "U", vowel: "I" },
  { glide: null, vowel: "I" },
];

export const VISEME_PROFILES: Readonly<Record<LipSyncViseme, VisemeProfile>> = {
  A: { id: "A", labelKo: "개구 아(A)", labelEn: "Open A", phoneticHintKo: "ㅏ·ㅑ·ㅘ 큰 개구", openness01: 0.92, width01: 0.62, roundness01: 0.34, semanticTone: "accent" },
  E: { id: "E", labelKo: "중개구 에·어(E)", labelEn: "Mid E", phoneticHintKo: "ㅓ·ㅔ·ㅐ·ㅕ 중간 개구", openness01: 0.62, width01: 0.74, roundness01: 0.26, semanticTone: "cool" },
  I: { id: "I", labelKo: "평순 이(I)", labelEn: "Wide I", phoneticHintKo: "ㅣ·ㅟ·ㅢ 가로 펼침", openness01: 0.32, width01: 0.94, roundness01: 0.14, semanticTone: "good" },
  O: { id: "O", labelKo: "원순 오(O)", labelEn: "Round O", phoneticHintKo: "ㅗ·ㅛ 원순 중개구", openness01: 0.68, width01: 0.42, roundness01: 0.88, semanticTone: "warn" },
  U: { id: "U", labelKo: "원순 우·으(U)", labelEn: "Narrow U", phoneticHintKo: "ㅜ·ㅠ·ㅡ 좁은 돌출", openness01: 0.36, width01: 0.34, roundness01: 0.92, semanticTone: "accent" },
  "M-B-P": { id: "M-B-P", labelKo: "양순 폐쇄(M-B-P)", labelEn: "Bilabial M-B-P", phoneticHintKo: "ㅁ·ㅂ·ㅃ·ㅍ 입술 닫힘", openness01: 0.04, width01: 0.46, roundness01: 0.2, semanticTone: "bad" },
  REST: { id: "REST", labelKo: "휴지(REST)", labelEn: "Rest", phoneticHintKo: "호흡·쉼표·정적 정지", openness01: 0, width01: 0.48, roundness01: 0.14, semanticTone: "muted" },
};

export const EMOTION_TONE_PROFILES: Readonly<Record<SpeechEmotionTone, EmotionToneProfile>> = {
  calm: { id: "calm", labelKo: "차분(Calm)", labelEn: "Calm", rateMultiplier: 1.0, jawAmplitudeMultiplier: 0.92, pauseScale: 1.05, estimatedVocalRmsDbfs: -18, directionKo: "안정적 호흡 · 중음역 내레이션", directionEn: "Steady breath, balanced midrange", semanticTone: "cool" },
  urgent: { id: "urgent", labelKo: "긴박(Urgent)", labelEn: "Urgent", rateMultiplier: 1.28, jawAmplitudeMultiplier: 1.04, pauseScale: 0.72, estimatedVocalRmsDbfs: -15, directionKo: "빠른 음절 전환 · 짧은 휴지", directionEn: "Accelerated cadence, tight pauses", semanticTone: "warn" },
  whisper: { id: "whisper", labelKo: "속삭임(Whisper)", labelEn: "Whisper", rateMultiplier: 0.82, jawAmplitudeMultiplier: 0.58, pauseScale: 1.24, estimatedVocalRmsDbfs: -24, directionKo: "작은 개구 폭 · 근접 기식음", directionEn: "Subtle mouth opening, close-mic breath", semanticTone: "muted" },
  shout: { id: "shout", labelKo: "외침(Shout)", labelEn: "Shout", rateMultiplier: 1.12, jawAmplitudeMultiplier: 1.22, pauseScale: 0.88, estimatedVocalRmsDbfs: -12, directionKo: "최대 개구 · 강한 어택 강조", directionEn: "Wide jaw excursion, accented attack", semanticTone: "bad" },
};

export const BGM_MOOD_CATALOG: Readonly<Record<BgmMoodId, BgmMoodProfile>> = {
  "calm-daily": { id: "calm-daily", labelKo: "일상 어쿠스틱", labelEn: "Calm Acoustic", bpm: 92, keySignature: "C Major", defaultCrossfadeMs: 1400, instrumentationKo: "나일론 기타 · 펠트 피아노", instrumentationEn: "Nylon guitar & felt piano", semanticTone: "good" },
  "mystery-pulse": { id: "mystery-pulse", labelKo: "미스터리 펄스", labelEn: "Mystery Pulse", bpm: 108, keySignature: "D Minor", defaultCrossfadeMs: 1200, instrumentationKo: "저역 신스 아르페지오 · 첼로", instrumentationEn: "Low synth pulse & cello", semanticTone: "cool" },
  "action-surge": { id: "action-surge", labelKo: "액션 서지", labelEn: "Action Surge", bpm: 144, keySignature: "E Minor", defaultCrossfadeMs: 650, instrumentationKo: "타격 퍼커션 · 브라스 스태카토", instrumentationEn: "Taiko percussion & brass", semanticTone: "bad" },
  "emotional-piano": { id: "emotional-piano", labelKo: "감성 피아노", labelEn: "Emotional Piano", bpm: 76, keySignature: "F Major", defaultCrossfadeMs: 1800, instrumentationKo: "솔로 피아노 · 스트링 패드", instrumentationEn: "Solo piano & warm strings", semanticTone: "accent" },
  "horror-drone": { id: "horror-drone", labelKo: "공포 드론", labelEn: "Horror Drone", bpm: 64, keySignature: "Db Phrygian", defaultCrossfadeMs: 1500, instrumentationKo: "서브 베이스 드론 · 메탈릭 보잉", instrumentationEn: "Sub-bass drone & metallic bow", semanticTone: "warn" },
  "silence-breath": { id: "silence-breath", labelKo: "무음 여백", labelEn: "Silence Breath", bpm: 0, keySignature: "N/A", defaultCrossfadeMs: 450, instrumentationKo: "BGM 페이드아웃 · 룸톤 유지", instrumentationEn: "BGM fadeout, room tone only", semanticTone: "muted" },
};

export const SFX_CATEGORY_CATALOG: Readonly<Record<SfxCategoryId, SfxCategoryProfile>> = {
  "impact-hit": { id: "impact-hit", labelKo: "충격 타격", labelEn: "Impact Hit", defaultDurationMs: 420, defaultGainDb: -2, peakLimitDbfs: -1.5 },
  "whoosh-slash": { id: "whoosh-slash", labelKo: "검격·스위시", labelEn: "Whoosh Slash", defaultDurationMs: 360, defaultGainDb: -3, peakLimitDbfs: -2.0 },
  "heartbeat-pulse": { id: "heartbeat-pulse", labelKo: "심장 박동", labelEn: "Heartbeat Pulse", defaultDurationMs: 650, defaultGainDb: -5, peakLimitDbfs: -4.0 },
  "door-creak": { id: "door-creak", labelKo: "문 열림·삐걱", labelEn: "Door Creak", defaultDurationMs: 780, defaultGainDb: -6, peakLimitDbfs: -4.5 },
  "spark-chime": { id: "spark-chime", labelKo: "반짝·각성음", labelEn: "Spark Chime", defaultDurationMs: 520, defaultGainDb: -4, peakLimitDbfs: -3.0 },
  "crowd-murmur": { id: "crowd-murmur", labelKo: "군중 소음", labelEn: "Crowd Murmur", defaultDurationMs: 1200, defaultGainDb: -9, peakLimitDbfs: -6.0 },
  "footstep-echo": { id: "footstep-echo", labelKo: "발소리 울림", labelEn: "Footstep Echo", defaultDurationMs: 480, defaultGainDb: -5, peakLimitDbfs: -3.5 },
  "silence-drop": { id: "silence-drop", labelKo: "정적 드롭", labelEn: "Silence Drop", defaultDurationMs: 500, defaultGainDb: -4, peakLimitDbfs: -2.5 },
};

export const AUDIO_CUE_EPISODE_PRESETS: readonly [AudioCueEpisodePreset, AudioCueEpisodePreset, AudioCueEpisodePreset] = [
  {
    id: "noir-rooftop-chase", labelKo: "누아르 옥상 추격", labelEn: "Noir Rooftop Chase",
    summaryKo: "빗속 도입 → 추격 긴박 → 검격 외침 → 무음 정적 → 반전 속삭임",
    summaryEn: "Rainy intro, urgent chase, shout impact, silence beat, and whisper twist",
    episodeTitle: "12화 · 옥상 추격전 — 비 오는 밤의 대치", episodeNumber: 12,
    cuts: [
      { id: "cut-1", label: "1컷 · 빗속 옥상 전경", panelHeightPx: 1120, speaker: "내레이션", dialogue: "비가 멈추지 않는 밤, 발소리가 옥상 문 앞에서 멎었다.", emotionTone: "calm", bgmMood: "mystery-pulse", crossfadeMs: 1200, sfxMarkers: [{ id: "sfx-1", category: "footstep-echo", label: "젖은 콘크리트 발소리", offsetRatio01: 0.35, gainDb: -5, pan: -0.25 }] },
      { id: "cut-2", label: "2컷 · 비상구 돌파", panelHeightPx: 980, speaker: "서진", dialogue: "잠깐! 지금 문 열면 함정이야, 뒤로 물러서!", emotionTone: "urgent", bgmMood: "action-surge", crossfadeMs: 650, sfxMarkers: [{ id: "sfx-2", category: "door-creak", label: "철제 비상문 튕김", offsetRatio01: 0.2, gainDb: -4, pan: 0.3 }] },
      { id: "cut-3", label: "3컷 · 난간 격돌 액션", panelHeightPx: 1360, speaker: "강현", dialogue: "피해! 바로 위에서 내려친다!", emotionTone: "shout", bgmMood: "action-surge", crossfadeMs: 500, sfxMarkers: [{ id: "sfx-3", category: "whoosh-slash", label: "공기 가르는 궤적", offsetRatio01: 0.28, gainDb: -2.5, pan: -0.4 }, { id: "sfx-4", category: "impact-hit", label: "금속 난간 강타", offsetRatio01: 0.66, gainDb: -1.5, pan: 0.15 }] },
      { id: "cut-4", label: "4컷 · 무음 정적 클로즈업", panelHeightPx: 840, speaker: "", dialogue: "", emotionTone: "calm", bgmMood: "silence-breath", crossfadeMs: 420, minCutDurationMs: 1450, sfxMarkers: [{ id: "sfx-5", category: "silence-drop", label: "저역 컷오프 정적", offsetRatio01: 0.18, gainDb: -4, pan: 0 }] },
      { id: "cut-5", label: "5컷 · 반전 고백 클리프행어", panelHeightPx: 1180, speaker: "유리", dialogue: "미안해... 열쇠는 처음부터 내 주머니에 있었어.", emotionTone: "whisper", bgmMood: "emotional-piano", crossfadeMs: 1800, sfxMarkers: [{ id: "sfx-6", category: "heartbeat-pulse", label: "느린 심장 고동", offsetRatio01: 0.45, gainDb: -6, pan: 0 }] },
    ],
  },
  {
    id: "romance-station-confession", labelKo: "막차 플랫폼 고백", labelEn: "Last Train Confession",
    summaryKo: "일상 어쿠스틱에서 심장 박동 SFX와 감성 피아노로 이어지는 감정선 전환",
    summaryEn: "Acoustic daily beat crossfading into emotional piano confession",
    episodeTitle: "7화 · 막차 플랫폼 — 고백 10초 전", episodeNumber: 7,
    cuts: [
      { id: "rom-1", label: "1컷 · 플랫폼 안내 전광판", panelHeightPx: 1020, speaker: "하늘", dialogue: "막차까지 딱 삼 분 남았네. 오늘도 수고했어.", emotionTone: "calm", bgmMood: "calm-daily", crossfadeMs: 1400, sfxMarkers: [{ id: "rsfx-1", category: "crowd-murmur", label: "역사 안내 배경음", offsetRatio01: 0.15, gainDb: -10, pan: 0 }] },
      { id: "rom-2", label: "2컷 · 소매를 잡는 손", panelHeightPx: 960, speaker: "도윤", dialogue: "잠깐만, 가지 마... 할 말이 있어.", emotionTone: "whisper", bgmMood: "silence-breath", crossfadeMs: 550, sfxMarkers: [{ id: "rsfx-2", category: "heartbeat-pulse", label: "가까운 심장 박동", offsetRatio01: 0.4, gainDb: -5, pan: 0 }] },
      { id: "rom-3", label: "3컷 · 시선 교차 클로즈업", panelHeightPx: 1240, speaker: "도윤", dialogue: "봄부터 계속 좋아했어. 다음 역까지 같이 걸을까?", emotionTone: "calm", bgmMood: "emotional-piano", crossfadeMs: 1900, sfxMarkers: [{ id: "rsfx-3", category: "spark-chime", label: "가로등 점등 차임", offsetRatio01: 0.62, gainDb: -5, pan: 0.2 }] },
      { id: "rom-4", label: "4컷 · 미소 엔딩 컷", panelHeightPx: 1080, speaker: "하늘", dialogue: "바보, 그 말 기다리고 있었어!", emotionTone: "urgent", bgmMood: "emotional-piano", crossfadeMs: 900, sfxMarkers: [] },
    ],
  },
  {
    id: "fantasy-dungeon-boss", labelKo: "심연 보스 각성", labelEn: "Abyss Boss Awakening",
    summaryKo: "공포 드론 진입 → 각성 차임 → 액션 서지 폭발과 다중 타격 마커",
    summaryEn: "Horror drone entrance into action surge boss phase with layered SFX",
    episodeTitle: "24화 · 심연의 문 — 흑요석 수호자 각성", episodeNumber: 24,
    cuts: [
      { id: "fan-1", label: "1컷 · 봉인석 균열", panelHeightPx: 1180, speaker: "아린", dialogue: "공기가 차가워졌어. 봉인이 풀리고 있어...", emotionTone: "whisper", bgmMood: "horror-drone", crossfadeMs: 1600, sfxMarkers: [{ id: "fsfx-1", category: "door-creak", label: "거석 균열 진동", offsetRatio01: 0.5, gainDb: -4, pan: 0 }] },
      { id: "fan-2", label: "2컷 · 붉은 안광 점화", panelHeightPx: 920, speaker: "", dialogue: "", emotionTone: "calm", bgmMood: "horror-drone", crossfadeMs: 600, minCutDurationMs: 1300, sfxMarkers: [{ id: "fsfx-2", category: "spark-chime", label: "마력 각성 공명", offsetRatio01: 0.35, gainDb: -3, pan: 0 }] },
      { id: "fan-3", label: "3컷 · 전열 방패 전개", panelHeightPx: 1320, speaker: "카엘", dialogue: "전원 방벽 올려! 충격파가 온다!", emotionTone: "shout", bgmMood: "action-surge", crossfadeMs: 500, sfxMarkers: [{ id: "fsfx-3", category: "whoosh-slash", label: "충격파 쇄도", offsetRatio01: 0.25, gainDb: -2, pan: -0.35 }, { id: "fsfx-4", category: "impact-hit", label: "방벽 정면 충돌", offsetRatio01: 0.72, gainDb: -1, pan: 0.2 }] },
      { id: "fan-4", label: "4컷 · 반격 돌입", panelHeightPx: 1080, speaker: "아린", dialogue: "지금이야! 오른팔 빈틈을 뚫어!", emotionTone: "urgent", bgmMood: "action-surge", crossfadeMs: 500, sfxMarkers: [{ id: "fsfx-5", category: "whoosh-slash", label: "반격 참격", offsetRatio01: 0.55, gainDb: -2, pan: 0.4 }] },
    ],
  },
];

function clamp(value: number, min: number, max: number): number { return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min; }
function round1(value: number): number { return Math.round(value * 10) / 10; }
function round2(value: number): number { return Math.round(value * 100) / 100; }
function createEmptyVisemeDistribution(): Record<LipSyncViseme, number> { return { A: 0, E: 0, I: 0, O: 0, U: 0, "M-B-P": 0, REST: 0 }; }

/** 프리셋 ID로 기본 에피소드 오디오 큐 프리셋을 조회한다. */
export function getAudioCueEpisodePreset(presetId: AudioCuePresetId): AudioCueEpisodePreset {
  return AUDIO_CUE_EPISODE_PRESETS.find((preset) => preset.id === presetId) ?? AUDIO_CUE_EPISODE_PRESETS[0];
}

/** 한국어 완성형 한글 1음절(`0xAC00..0xD7A3`)을 정확한 정수 연산으로 초성·중성·종성과 립싱크 비젬으로 분해한다. */
export function decomposeHangulSyllable(char: string): DecomposedHangulSyllable | null {
  if (char.length === 0) return null;
  const codePoint = char.charCodeAt(0);
  if (codePoint < HANGUL_SYLLABLE_START || codePoint > HANGUL_SYLLABLE_END) return null;

  const syllableIndex = codePoint - HANGUL_SYLLABLE_START;
  const choseongIndex = Math.floor(syllableIndex / HANGUL_CHOSEONG_STRIDE);
  const remainder = syllableIndex % HANGUL_CHOSEONG_STRIDE;
  const jungseongIndex = Math.floor(remainder / HANGUL_JONGSEONG_COUNT);
  const jongseongIndex = remainder % HANGUL_JONGSEONG_COUNT;
  const rule = JUNGSEONG_VISEME_RULES[jungseongIndex] ?? { glide: null, vowel: "E" as const };

  return {
    char, codePoint, choseongIndex, jungseongIndex, jongseongIndex,
    choseong: HANGUL_CHOSEONG[choseongIndex] ?? "",
    jungseong: HANGUL_JUNGSEONG[jungseongIndex] ?? "",
    jongseong: HANGUL_JONGSEONG[jongseongIndex] ?? "",
    hasBilabialOnset: BILABIAL_CHOSEONG_INDICES.has(choseongIndex),
    hasBilabialCoda: BILABIAL_JONGSEONG_INDICES.has(jongseongIndex),
    glideViseme: rule.glide,
    vowelViseme: rule.vowel,
  };
}

function classifyLatinViseme(char: string): LipSyncViseme | null {
  const lower = char.toLowerCase();
  if (lower === "m" || lower === "b" || lower === "p") return "M-B-P";
  if (lower === "a") return "A";
  if (lower === "e") return "E";
  if (lower === "i" || lower === "y") return "I";
  if (lower === "o") return "O";
  if (lower === "u" || lower === "w") return "U";
  return lower >= "a" && lower <= "z" ? "E" : null;
}

function classifyPauseFactor(char: string): number {
  if (char === "." || char === "!" || char === "?" || char === "…" || char === "~") return 1.15;
  if (char === "," || char === ";" || char === ":" || char === "·" || char === "-" || char === "—") return 0.72;
  return /\s/u.test(char) ? 0.34 : 0;
}

function buildSegmentMetrics(viseme: LipSyncViseme, tone: EmotionToneProfile, phase: LipSyncSegmentPhase) {
  const profile = VISEME_PROFILES[viseme];
  const phaseWeight = phase === "nucleus" ? 1 : phase === "glide" ? 0.86 : phase === "rest" ? 0 : 0.78;
  return {
    openness01: round2(clamp(profile.openness01 * tone.jawAmplitudeMultiplier * (phase === "rest" ? 0 : 1), 0, 1)),
    width01: round2(clamp(profile.width01 * (phase === "rest" ? 1 : 0.92 + tone.jawAmplitudeMultiplier * 0.08), 0, 1)),
    roundness01: round2(clamp(profile.roundness01, 0, 1)),
    intensity01: round2(clamp(phaseWeight * tone.jawAmplitudeMultiplier * 0.82, 0, 1)),
  };
}

interface RawVisemeSlice { readonly viseme: LipSyncViseme; readonly phase: LipSyncSegmentPhase; readonly sourceChar: string; readonly durationMs: number }

function pushHangulSlices(slices: RawVisemeSlice[], decomposed: DecomposedHangulSyllable, syllableDurationMs: number, sourceChar: string): void {
  const onsetRatio = decomposed.hasBilabialOnset ? 0.25 : 0;
  const codaRatio = decomposed.hasBilabialCoda ? 0.24 : 0;
  const remaining = Math.max(0.35, 1 - onsetRatio - codaRatio);
  const glideRatio = decomposed.glideViseme ? remaining * 0.32 : 0;
  const nucleusRatio = remaining - glideRatio;

  if (onsetRatio > 0) slices.push({ viseme: "M-B-P", phase: "onset", sourceChar, durationMs: syllableDurationMs * onsetRatio });
  if (decomposed.glideViseme && glideRatio > 0) slices.push({ viseme: decomposed.glideViseme, phase: "glide", sourceChar, durationMs: syllableDurationMs * glideRatio });
  slices.push({ viseme: decomposed.vowelViseme, phase: "nucleus", sourceChar, durationMs: syllableDurationMs * nucleusRatio });
  if (codaRatio > 0) slices.push({ viseme: "M-B-P", phase: "coda", sourceChar, durationMs: syllableDurationMs * codaRatio });
}

/** 한국어 대사 음절을 7대 립싱크 비젬(`A`/`E`/`I`/`O`/`U`/`M-B-P`/`REST`) 프레임 시퀀스로 합성한다. */
export function synthesizeKoreanLipSyncTimeline(input: KoreanLipSyncInput): KoreanLipSyncTimeline {
  assertKoreanLipSyncInput(input);
  const emotionTone: SpeechEmotionTone = input.emotionTone ?? "calm";
  const toneProfile = EMOTION_TONE_PROFILES[emotionTone];
  const baseSyllablesPerSecond = round2(clamp(input.syllablesPerSecond ?? DEFAULT_SYLLABLES_PER_SECOND, 1.5, 10));
  const effectiveSyllablesPerSecond = round2(clamp(baseSyllablesPerSecond * toneProfile.rateMultiplier, 1.2, 13));
  const fps = Math.round(clamp(input.fps ?? DEFAULT_LIP_SYNC_FPS, 12, 60));
  const startTimeMs = round1(Math.max(0, input.startTimeMs ?? 0));
  const trimmedText = input.text.trim();
  const speaker = input.speaker ?? "";

  if (trimmedText.length === 0) {
    return {
      dataSourceKind: AUDIO_CUE_DATA_SOURCE_KIND, estimateNoticeKo: ESTIMATE_NOTICE_KO, estimateNoticeEn: ESTIMATE_NOTICE_EN,
      text: input.text, speaker, emotionTone, baseSyllablesPerSecond, effectiveSyllablesPerSecond, fps,
      startTimeMs, endTimeMs: startTimeMs, durationMs: 0, totalFrames: 0, hangulSyllableCount: 0,
      hasSpokenDialogue: false, decomposedSyllables: [], segments: [], frames: [], visemeDistribution: createEmptyVisemeDistribution(),
    };
  }

  const syllableDurationMs = 1000 / effectiveSyllablesPerSecond;
  const decomposedSyllables: DecomposedHangulSyllable[] = [];
  const rawSlices: RawVisemeSlice[] = [];
  let spokenUnits = 0;

  for (const char of Array.from(trimmedText)) {
    const decomposed = decomposeHangulSyllable(char);
    if (decomposed) {
      decomposedSyllables.push(decomposed);
      spokenUnits += 1;
      pushHangulSlices(rawSlices, decomposed, syllableDurationMs, char);
      continue;
    }
    const digitReading = DIGIT_KOREAN_READINGS[char];
    if (digitReading) {
      const digitHangul = decomposeHangulSyllable(digitReading);
      if (digitHangul) {
        spokenUnits += 1;
        pushHangulSlices(rawSlices, digitHangul, syllableDurationMs, char);
        continue;
      }
    }
    const latinViseme = classifyLatinViseme(char);
    if (latinViseme) {
      spokenUnits += 1;
      rawSlices.push({ viseme: latinViseme, phase: latinViseme === "M-B-P" ? "onset" : "nucleus", sourceChar: char, durationMs: syllableDurationMs * 0.58 });
      continue;
    }
    const pauseFactor = classifyPauseFactor(char);
    if (pauseFactor > 0) {
      const pauseMs = syllableDurationMs * pauseFactor * toneProfile.pauseScale;
      const last = rawSlices[rawSlices.length - 1];
      if (last && last.viseme === "REST") {
        rawSlices[rawSlices.length - 1] = { ...last, durationMs: Math.min(syllableDurationMs * 2.2, last.durationMs + pauseMs * 0.45) };
      } else {
        rawSlices.push({ viseme: "REST", phase: "rest", sourceChar: char, durationMs: pauseMs });
      }
    }
  }

  if (rawSlices.length === 0) {
    rawSlices.push({ viseme: "REST", phase: "rest", sourceChar: Array.from(trimmedText)[0] ?? "", durationMs: syllableDurationMs * 0.6 });
  } else if (rawSlices[rawSlices.length - 1]?.viseme !== "REST") {
    rawSlices.push({ viseme: "REST", phase: "rest", sourceChar: "", durationMs: Math.max(1000 / fps, syllableDurationMs * 0.35 * toneProfile.pauseScale) });
  }

  let cursorMs = startTimeMs;
  const segments: LipSyncSegment[] = rawSlices.map((slice, idx) => {
    const segStart = round1(cursorMs);
    cursorMs += slice.durationMs;
    const segEnd = round1(cursorMs);
    const metrics = buildSegmentMetrics(slice.viseme, toneProfile, slice.phase);
    return { segmentIndex: idx, viseme: slice.viseme, phase: slice.phase, sourceChar: slice.sourceChar, startMs: segStart, endMs: segEnd, durationMs: round1(Math.max(0, segEnd - segStart)), ...metrics };
  });

  const endTimeMs = segments[segments.length - 1]?.endMs ?? startTimeMs;
  const durationMs = round1(Math.max(0, endTimeMs - startTimeMs));
  const frameStepMs = 1000 / fps;
  const totalFrames = Math.max(1, Math.ceil((durationMs * fps) / 1000));
  if (totalFrames > MAX_LIP_SYNC_FRAMES) throw new RangeError("립싱크 프레임 상한을 넘었습니다.");
  const distribution = createEmptyVisemeDistribution();
  const frames: LipSyncFrame[] = [];

  let segmentCursor = 0;
  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
    const fStart = startTimeMs + frameIndex * frameStepMs;
    const fEnd = fStart + frameStepMs;
    let bestSegment = segments[segments.length - 1];
    let bestOverlap = -1;
    while (segmentCursor < segments.length - 1 && (segments[segmentCursor]?.endMs ?? 0) <= fStart) segmentCursor += 1;
    for (let candidate = segmentCursor; candidate < segments.length; candidate += 1) {
      const seg = segments[candidate];
      if (!seg || seg.startMs >= fEnd) break;
      const overlap = Math.min(fEnd, seg.endMs) - Math.max(fStart, seg.startMs);
      if (overlap > bestOverlap) { bestOverlap = overlap; bestSegment = seg; }
    }
    const active = bestSegment ?? segments[0];
    const viseme: LipSyncViseme = active ? active.viseme : "REST";
    distribution[viseme] += 1;
    frames.push({
      frameIndex, timeMs: round1(fStart), viseme, phase: active ? active.phase : "rest",
      sourceChar: active ? active.sourceChar : "", openness01: active ? active.openness01 : 0,
      width01: active ? active.width01 : 0.48, roundness01: active ? active.roundness01 : 0.14,
      intensity01: active ? active.intensity01 : 0,
    });
  }

  return {
    dataSourceKind: AUDIO_CUE_DATA_SOURCE_KIND, estimateNoticeKo: ESTIMATE_NOTICE_KO, estimateNoticeEn: ESTIMATE_NOTICE_EN,
    text: input.text, speaker, emotionTone, baseSyllablesPerSecond, effectiveSyllablesPerSecond, fps,
    startTimeMs, endTimeMs, durationMs, totalFrames, hangulSyllableCount: decomposedSyllables.length,
    hasSpokenDialogue: spokenUnits > 0, decomposedSyllables, segments, frames, visemeDistribution: distribution,
  };
}

function resolveCrossfadeCurve(crossfadeMs: number, toMood: BgmMoodId): BgmCrossfadeCurve {
  if (crossfadeMs <= 80) return "hard-cut";
  return toMood === "silence-breath" ? "linear-fade" : "equal-power";
}

/** 컷별 스크롤 진행률(`0..100%`) 기반 BGM 무드 전환(`-14 LUFS`, 대사 `-10dB` 자동 덕킹) 및 SFX 히트 마커 큐시트를 구축한다. */
export function buildEpisodeAudioCueSheet(input: EpisodeAudioCueSheetInput): EpisodeAudioCueSheet {
  assertAudioCueInput(input);
  const fps = Math.round(clamp(input.fps ?? DEFAULT_LIP_SYNC_FPS, 12, 60));
  const targetLufs = round1(clamp(input.targetLufs ?? TARGET_BGM_LUFS, -24, -8));
  const dialogueDuckingDb = round1(clamp(input.dialogueDuckingDb ?? DEFAULT_DIALOGUE_DUCKING_DB, -24, -3));
  const duckingAttackMs = Math.round(clamp(input.duckingAttackMs ?? DEFAULT_DUCKING_ATTACK_MS, 10, 400));
  const duckingReleaseMs = Math.round(clamp(input.duckingReleaseMs ?? DEFAULT_DUCKING_RELEASE_MS, 40, 1200));
  const defaultSps = round2(clamp(input.defaultSyllablesPerSecond ?? DEFAULT_SYLLABLES_PER_SECOND, 1.5, 10));
  const episodeNumber = Math.max(1, Math.round(input.episodeNumber ?? 1));
  const episodeTitle = input.episodeTitle.trim() ? input.episodeTitle : "무제 에피소드";

  const sanitizedHeights = input.cuts.map((cut) => Math.max(240, Math.round(Number.isFinite(cut.panelHeightPx) ? cut.panelHeightPx : 1000)));
  const totalPanelHeightPx = sanitizedHeights.reduce((acc, h) => acc + h, 0);

  let cumulativePx = 0;
  let timelineCursorMs = 0;
  const scheduledCuts: ScheduledAudioCut[] = [];
  const bgmTransitions: BgmMoodTransition[] = [];
  const duckingEnvelopes: BgmDuckingEnvelope[] = [];
  const sfxSchedule: ScheduledSfxEvent[] = [];
  const aggregateDistribution = createEmptyVisemeDistribution();
  let totalLipSyncFrames = 0;
  let totalHangulSyllables = 0;

  for (let cutIndex = 0; cutIndex < input.cuts.length; cutIndex += 1) {
    const cut = input.cuts[cutIndex];
    if (!cut) continue;
    const panelHeightPx = sanitizedHeights[cutIndex] ?? 1000;
    const scrollStartPct = totalPanelHeightPx > 0 ? round1((cumulativePx / totalPanelHeightPx) * 100) : 0;
    cumulativePx += panelHeightPx;
    const scrollEndPct = cutIndex === input.cuts.length - 1
      ? (input.cuts.length > 0 ? 100 : 0)
      : (totalPanelHeightPx > 0 ? round1((cumulativePx / totalPanelHeightPx) * 100) : 0);

    const moodProfile = BGM_MOOD_CATALOG[cut.bgmMood];
    const crossfadeMs = Math.round(clamp(cut.crossfadeMs ?? moodProfile.defaultCrossfadeMs, 0, 5000));
    const cutStartMs = round1(timelineCursorMs);

    const lipSync = synthesizeKoreanLipSyncTimeline({
      text: cut.dialogue, speaker: cut.speaker, emotionTone: cut.emotionTone,
      syllablesPerSecond: cut.syllablesPerSecond ?? defaultSps, fps, startTimeMs: cutStartMs,
    });

    const scrollReadingFloorMs = Math.round(clamp(panelHeightPx * 1.15, 900, 2600));
    const explicitMinMs = cut.minCutDurationMs !== undefined ? Math.max(400, Math.round(cut.minCutDurationMs)) : scrollReadingFloorMs;
    const cutDurationMs = round1(lipSync.hasSpokenDialogue ? Math.max(lipSync.durationMs + 220, Math.min(explicitMinMs, lipSync.durationMs + 750)) : explicitMinMs);
    const cutEndMs = round1(cutStartMs + cutDurationMs);
    timelineCursorMs = cutEndMs;

    const prevCut = scheduledCuts[cutIndex - 1];
    if (cutIndex === 0 || (prevCut && prevCut.bgmMood !== cut.bgmMood)) {
      bgmTransitions.push({
        transitionId: `bgm-tr-${cutIndex + 1}`, cutId: cut.id, cutIndex,
        triggerScrollPct: scrollStartPct, triggerTimeMs: cutStartMs,
        fromMood: prevCut ? prevCut.bgmMood : null, toMood: cut.bgmMood,
        crossfadeMs, targetLufs: cut.bgmMood === "silence-breath" ? -48 : targetLufs,
        curve: resolveCrossfadeCurve(crossfadeMs, cut.bgmMood),
      });
    }

    const isDuckingActive = lipSync.hasSpokenDialogue && lipSync.durationMs > 0 && cut.bgmMood !== "silence-breath";
    const bgmTargetLufs = cut.bgmMood === "silence-breath" ? -48 : targetLufs;
    const bgmDuckedLufs = isDuckingActive ? round1(bgmTargetLufs + dialogueDuckingDb) : bgmTargetLufs;

    if (isDuckingActive) {
      duckingEnvelopes.push({
        envelopeId: `duck-${cutIndex + 1}`, cutId: cut.id, cutIndex,
        speaker: cut.speaker.trim() || "화자", emotionTone: cut.emotionTone, triggerScrollPct: scrollStartPct,
        startTimeMs: lipSync.startTimeMs, endTimeMs: lipSync.endTimeMs,
        attackMs: duckingAttackMs, releaseMs: duckingReleaseMs,
        baseLufs: bgmTargetLufs, duckingDb: dialogueDuckingDb, duckedLufs: bgmDuckedLufs,
      });
    }

    const cutSfxEvents: ScheduledSfxEvent[] = (cut.sfxMarkers ?? []).map((marker, mIdx) => {
      const cat = SFX_CATEGORY_CATALOG[marker.category];
      const offsetRatio01 = round2(clamp(marker.offsetRatio01, 0, 1));
      const triggerScrollPct = round1(scrollStartPct + (scrollEndPct - scrollStartPct) * offsetRatio01);
      const triggerTimeMs = round1(cutStartMs + cutDurationMs * offsetRatio01);
      const durationMs = Math.round(clamp(marker.durationMs ?? cat.defaultDurationMs, 80, 6000));
      const event: ScheduledSfxEvent = {
        eventId: marker.id || `sfx-${cutIndex + 1}-${mIdx + 1}`, cutId: cut.id, cutIndex,
        category: marker.category, label: marker.label, offsetRatio01,
        triggerScrollPct, triggerTimeMs, endTimeMs: round1(triggerTimeMs + durationMs), durationMs,
        gainDb: round1(clamp(marker.gainDb ?? cat.defaultGainDb, -24, 0)),
        pan: round2(clamp(marker.pan ?? 0, -1, 1)), peakLimitDbfs: cat.peakLimitDbfs,
      };
      sfxSchedule.push(event);
      return event;
    });

    totalLipSyncFrames += lipSync.totalFrames;
    if (totalLipSyncFrames > 300000) throw new RangeError("에피소드 립싱크 프레임 상한을 넘었습니다.");
    totalHangulSyllables += lipSync.hangulSyllableCount;
    for (const viseme of LIP_SYNC_VISEMES) aggregateDistribution[viseme] += lipSync.visemeDistribution[viseme];

    scheduledCuts.push({
      cutId: cut.id, cutIndex, label: cut.label, panelHeightPx,
      scrollStartPct, scrollEndPct, startTimeMs: cutStartMs, endTimeMs: cutEndMs, durationMs: cutDurationMs,
      bgmMood: cut.bgmMood, crossfadeMs, speaker: cut.speaker, dialogue: cut.dialogue,
      emotionTone: cut.emotionTone, bgmTargetLufs, bgmDuckedLufs, isDuckingActive, lipSync, sfxEvents: cutSfxEvents,
    });
  }

  sfxSchedule.sort((a, b) => a.triggerTimeMs - b.triggerTimeMs || a.cutIndex - b.cutIndex);

  let dominantViseme: LipSyncViseme = "REST";
  let dominantCount = -1;
  for (const viseme of LIP_SYNC_VISEMES) {
    if (viseme !== "REST" && aggregateDistribution[viseme] > dominantCount && aggregateDistribution[viseme] > 0) {
      dominantCount = aggregateDistribution[viseme];
      dominantViseme = viseme;
    }
  }

  const totalDurationMs = round1(timelineCursorMs);
  const spokenCutCount = scheduledCuts.filter((c) => c.lipSync.hasSpokenDialogue).length;

  return {
    schemaVersion: "webtoon-audio-cue-sheet/v1", dataSourceKind: AUDIO_CUE_DATA_SOURCE_KIND,
    estimateNoticeKo: ESTIMATE_NOTICE_KO, estimateNoticeEn: ESTIMATE_NOTICE_EN,
    episodeTitle, originalEpisodeTitle: input.episodeTitle, episodeNumber, fps, targetLufs, dialogueDuckingDb, duckingAttackMs, duckingReleaseMs,
    totalDurationMs, totalPanelHeightPx, cuts: scheduledCuts, bgmTransitions, duckingEnvelopes, sfxSchedule,
    summary: {
      cutCount: scheduledCuts.length, spokenCutCount, bgmTransitionCount: bgmTransitions.length,
      duckingWindowCount: duckingEnvelopes.length, sfxEventCount: sfxSchedule.length,
      totalLipSyncFrames, totalHangulSyllables, dominantViseme, targetLufs,
      duckedFloorLufs: round1(targetLufs + dialogueDuckingDb),
      reelsTeaserReady: totalDurationMs >= 3000 && totalDurationMs <= 65000 && spokenCutCount > 0,
    },
  };
}

/** 밀리초를 표준 WebVTT 타임스탬프(`HH:MM:SS.mmm`)로 변환한다. */
export function formatWebVttTimestamp(ms: number): string {
  const safeMs = Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0));
  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const millis = safeMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

/** 밀리초와 FPS를 SMPTE 논드롭 타임코드(`HH:MM:SS:FF`)로 변환한다. */
export function formatSmpteTimecode(ms: number, fps: number = DEFAULT_LIP_SYNC_FPS): string {
  const safeFps = Math.round(clamp(fps, 12, 60));
  const totalFrames = Math.round((Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000) * safeFps);
  const frames = totalFrames % safeFps;
  const totalSeconds = Math.floor(totalFrames / safeFps);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

export { exportAudioCueWebVtt, exportAudioCueJson } from "./audio-cue-output";
