/**
 * Wasm64 Wave 128 공개 배럴 진입점 (`wasm64-wave128-dialogue-prosody-script-and-voice-cast-compiler`).
 *
 * - `voice-script-types`: 대사 큐·운율·성우 풀·간섭 그래프·성대 휴식·부스 스케줄 계약 타입
 * - `voice-script-sha256`: 순수 ES2017 동기 FIPS 180-4 SHA-256 및 키 순서 무관 정규 JSON 직렬화
 * - `dialogue-prosody-and-breath-analyzer`: 한국어 대사 운율·감정·호흡 분석 및 무중첩 타임라인 컴파일러
 * - `voice-cast-and-booth-scheduler`: 씬 공존 간섭 그래프 컬러링 성우 캐스팅 및 성대 피로 보호 스케줄러
 * - `voice-script-svg-and-report`: 인쇄 안전 순수 OKLCH 멀티트랙 타임라인 SVG 및 한국어 녹음 감독 브리프
 */

export {
  ACOUSTIC_REVERB_LABELS_KO,
  BALLOON_STYLE_LABELS_KO,
  DELIVERY_STYLE_LABELS_KO,
  VOICE_ACTOR_TIER_LABELS_KO,
  type AcousticReverbTag,
  type BoothActorSession,
  type CastAssignmentMode,
  type CharacterCastAssignment,
  type CompiledDialogueLine,
  type CompiledVoiceProsodyScript,
  type DialogueBalloonStyle,
  type DialogueProsodyCompileOptions,
  type EpisodeDialogueCueInput,
  type HydrationBreakEvent,
  type PunctuationCueProfile,
  type ResolvedDialogueProsodyOptions,
  type ResolvedVoiceCastScheduleOptions,
  type SameSceneDoubleCastCollision,
  type SceneDialogueSummary,
  type SceneInterferenceEdge,
  type VoiceActorProfile,
  type VoiceActorTier,
  type VoiceCastAndBoothSchedule,
  type VoiceCastScheduleOptions,
  type VoiceCastTimelineSvgOptions,
  type VoiceDeliveryStyle,
} from "./voice-script-types";

export {
  canonicalizeVoiceJson,
  computeVoiceManifestSha256Hex,
  encodeVoiceUtf8Bytes,
  sha256VoiceBytesHex,
  sha256VoiceUtf8Hex,
} from "./voice-script-sha256";

export {
  DEFAULT_INTER_LINE_GAP_MS,
  DEFAULT_INTERRUPT_OVERLAP_RATIO,
  DEFAULT_MINIMUM_LINE_DURATION_MS,
  DEFAULT_SCENE_TRANSITION_GAP_MS,
  analyzeKoreanPunctuation,
  compileVoiceActingProsodyScript,
  countKoreanSpeakableSyllables,
  countUnintendedDialogueOverlaps,
  inferAcousticReverbTag,
  inferVoiceDeliveryStyle,
  resolveDialogueProsodyOptions,
} from "./dialogue-prosody-and-breath-analyzer";

export {
  DEFAULT_BOOTH_SETUP_MINUTES_PER_ACTOR,
  DEFAULT_DIRECTION_MINUTES_PER_LINE,
  DEFAULT_HYDRATION_BREAK_DURATION_MS,
  DEFAULT_MAX_CONSECUTIVE_SHOUT_LINES,
  DEFAULT_MINIMUM_BILLABLE_HOURS_PER_ACTOR,
  DEFAULT_TAKE_RETAKE_MULTIPLIER,
  assignVoiceActorsWithoutSceneCollision,
  buildSceneInterferenceGraph,
  resolveVoiceCastScheduleOptions,
} from "./voice-cast-and-booth-scheduler";

export {
  escapeVoiceXml,
  renderVoiceCastTimelineSvg,
  summarizeVoiceCastScriptKo,
} from "./voice-script-svg-and-report";
