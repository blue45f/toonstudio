/**
 * 감정·상황 적응형 인터랙티브 스튜디오 음성 코치의 도메인 타입, 카탈로그 및 어댑터 계약.
 *
 * - 3종 페르소나(`warm-mentor`, `director`, `calm-assistant`)
 * - 5종 감정 톤(`warm-guide`, `calm-focus`, `celebrate`, `gentle-alert`, `creative-spark`)
 * - 10종 스튜디오 상황 모멘트(KO/EN 완전 대본 · 페르소나별 어조 차별화)
 * - 외부 뉴럴 보이스(Deepgram Flux/Aura-2, Gemini Live, ElevenLabs, Local-Expressive) 계약
 *   (API 키/토큰 하드코딩 절대 금지 · 미연결 시 로컬 운율 엔진으로 안전 폴백)
 */

export type VoiceCoachLocale = "ko" | "en";

/** 100% 옵트인 출력 모드: 기본 꺼짐, 조용한 이어콘+자막, 감정 음성+이어콘+자막 */
export type VoiceCoachOutputMode = "off" | "earcon-captions" | "full-voice";

export type VoiceCoachPersona = "warm-mentor" | "director" | "calm-assistant";

export type VoiceCoachEmotionTone =
  | "warm-guide"
  | "calm-focus"
  | "celebrate"
  | "gentle-alert"
  | "creative-spark";

export type VoiceCoachMomentId =
  | "canvas-welcome"
  | "beginner-step-done"
  | "brush-discovered"
  | "filter-applied"
  | "offline-saved"
  | "crdt-merged-lossless"
  | "backup-reminder"
  | "export-complete"
  | "focus-break-45m"
  | "hologram-ready";

export type NeuralVoiceProviderId =
  | "local-expressive"
  | "deepgram-flux"
  | "deepgram-aura2"
  | "gemini-live"
  | "elevenlabs-byok";

export type VoiceCoachMomentPriority = "ambient" | "helpful" | "important";

export type ProsodyContourType =
  | "warm-arch"
  | "level-settle"
  | "bright-lift"
  | "soft-dip"
  | "curious-rise";

export type ProsodyClausePunctuation =
  | "period"
  | "exclamation"
  | "question"
  | "comma"
  | "ellipsis"
  | "breath"
  | "none";

export type ProsodyClauseEmphasis = "soft" | "normal" | "warm-lift" | "bright";

export type VoiceCoachSemanticTone = "good" | "cool" | "accent" | "warn";

export interface VoiceCoachPersonaProfile {
  readonly id: VoiceCoachPersona;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly roleTagKo: string;
  readonly roleTagEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly cadenceHintKo: string;
  readonly cadenceHintEn: string;
  readonly basePitch: number;
  readonly baseRate: number;
  readonly pauseScale: number;
  readonly pitchRangeScale: number;
  readonly voiceNameHintsKo: readonly string[];
  readonly voiceNameHintsEn: readonly string[];
}

export interface VoiceCoachToneProfile {
  readonly id: VoiceCoachEmotionTone;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly feelingKo: string;
  readonly feelingEn: string;
  readonly earconLabelKo: string;
  readonly earconLabelEn: string;
  readonly semanticTone: VoiceCoachSemanticTone;
  readonly contourType: ProsodyContourType;
  readonly pitchShift: number;
  readonly rateMultiplier: number;
  readonly pauseMultiplier: number;
  readonly energyGain: number;
  readonly emotionDirectiveEn: string;
}

export interface BilingualScriptPair {
  readonly ko: string;
  readonly en: string;
}

export interface VoiceCoachMomentSpec {
  readonly id: VoiceCoachMomentId;
  readonly defaultTone: VoiceCoachEmotionTone;
  readonly priority: VoiceCoachMomentPriority;
  readonly cooldownMs: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly scripts: Readonly<Record<VoiceCoachPersona, BilingualScriptPair>>;
}

export type NeuralCredentialSource = "none" | "byok-session" | "server-proxy";

export type NeuralStreamingProtocol =
  | "browser-prosody"
  | "websocket-turn"
  | "rest-stream"
  | "realtime-bidirectional";

/**
 * 외부 뉴럴 보이스 공급자 설정 계약.
 * 실제 키 문자열은 이 구조체에 보관하지 않고, 서버 프록시 또는 런타임 세션 핸들 유무만 불리언으로 표현한다.
 */
export interface NeuralVoiceProviderConfig {
  readonly provider: NeuralVoiceProviderId;
  readonly model: string;
  readonly voiceId: string;
  readonly endpointUrl: string | null;
  readonly credentialSource: NeuralCredentialSource;
  readonly hasCredential: boolean;
  readonly streamingProtocol: NeuralStreamingProtocol;
  readonly fallbackToLocal: boolean;
  readonly timeoutMs: number;
}

export interface NeuralVoiceProviderCatalogEntry {
  readonly id: NeuralVoiceProviderId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly badgeKo: string;
  readonly badgeEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly defaultModel: string;
  readonly defaultVoiceId: string;
  readonly endpointHint: string;
  readonly streamingProtocol: NeuralStreamingProtocol;
  readonly supportsEmotionDirectives: boolean;
  readonly plainTextOnly: boolean;
}

export interface ExpressiveProsodyClause {
  readonly index: number;
  readonly text: string;
  readonly punctuation: ProsodyClausePunctuation;
  readonly pitch: number;
  readonly rate: number;
  readonly pauseMs: number;
  readonly emphasis: ProsodyClauseEmphasis;
  readonly gainScale: number;
  readonly estimatedDurationMs: number;
  readonly startOffsetMs: number;
}

export interface ExpressiveUtterancePlan {
  readonly rawText: string;
  readonly persona: VoiceCoachPersona;
  readonly tone: VoiceCoachEmotionTone;
  readonly locale: VoiceCoachLocale;
  readonly clauses: readonly ExpressiveProsodyClause[];
  readonly totalEstimatedDurationMs: number;
  readonly totalPauseMs: number;
  readonly averagePitch: number;
  readonly averageRate: number;
  readonly emotionDirective: string;
  /** Flux TTS 등 SSML 미지원 뉴럴 API에 바로 보낼 수 있는 순수 평문 */
  readonly plainTextForFlux: string;
}

export interface NeuralVoiceAvailability {
  readonly provider: NeuralVoiceProviderId;
  readonly status: "ready-local" | "ready-neural" | "fallback-local" | "misconfigured";
  readonly usingLocalFallback: boolean;
  readonly reasonCode:
    | "local-built-in"
    | "credential-ready"
    | "missing-credential"
    | "invalid-endpoint";
  readonly statusLabelKo: string;
  readonly statusLabelEn: string;
}

export interface NeuralVoiceSynthesisRequest {
  readonly text: string;
  readonly persona: VoiceCoachPersona;
  readonly tone: VoiceCoachEmotionTone;
  readonly locale: VoiceCoachLocale;
  readonly userRate?: number;
}

export interface NeuralVoiceSynthesisResult {
  readonly resolvedProvider: NeuralVoiceProviderId;
  readonly requestedProvider: NeuralVoiceProviderId;
  readonly usedFallback: boolean;
  readonly availability: NeuralVoiceAvailability;
  readonly plan: ExpressiveUtterancePlan;
  readonly audioBuffer: ArrayBuffer | null;
}

export interface NeuralVoiceAdapter {
  readonly id: NeuralVoiceProviderId;
  checkAvailability(config: NeuralVoiceProviderConfig): NeuralVoiceAvailability;
  synthesize(
    request: NeuralVoiceSynthesisRequest,
    config: NeuralVoiceProviderConfig,
  ): Promise<NeuralVoiceSynthesisResult>;
}

export interface VoiceCoachSettings {
  readonly outputMode: VoiceCoachOutputMode;
  readonly persona: VoiceCoachPersona;
  readonly provider: NeuralVoiceProviderId;
  readonly speedRate: number;
  readonly volume: number;
  readonly earconEnabled: boolean;
  readonly cooldownMs: number;
}

export interface VoiceCoachCaptionState {
  readonly active: boolean;
  readonly persona: VoiceCoachPersona;
  readonly tone: VoiceCoachEmotionTone;
  readonly momentId: VoiceCoachMomentId | null;
  readonly fullText: string;
  readonly currentClauseIndex: number;
  readonly totalClauses: number;
  readonly currentClause: ExpressiveProsodyClause | null;
  readonly plan: ExpressiveUtterancePlan | null;
  readonly earconPlayed: boolean;
  readonly stoppedByUser: boolean;
}

export const DEFAULT_VOICE_COACH_COOLDOWN_MS = 90_000;
export const DEFAULT_MIN_GLOBAL_INTERVAL_MS = 4_000;

export const VOICE_COACH_PERSONAS: readonly VoiceCoachPersona[] = Object.freeze([
  "warm-mentor",
  "director",
  "calm-assistant",
]);

export const VOICE_COACH_EMOTION_TONES: readonly VoiceCoachEmotionTone[] = Object.freeze([
  "warm-guide",
  "calm-focus",
  "celebrate",
  "gentle-alert",
  "creative-spark",
]);

export const VOICE_COACH_MOMENT_IDS: readonly VoiceCoachMomentId[] = Object.freeze([
  "canvas-welcome",
  "beginner-step-done",
  "brush-discovered",
  "filter-applied",
  "offline-saved",
  "crdt-merged-lossless",
  "backup-reminder",
  "export-complete",
  "focus-break-45m",
  "hologram-ready",
]);

export const NEURAL_VOICE_PROVIDER_IDS: readonly NeuralVoiceProviderId[] = Object.freeze([
  "local-expressive",
  "deepgram-flux",
  "deepgram-aura2",
  "gemini-live",
  "elevenlabs-byok",
]);

export const VOICE_COACH_PERSONA_PROFILES: Readonly<
  Record<VoiceCoachPersona, VoiceCoachPersonaProfile>
> = Object.freeze({
  "warm-mentor": Object.freeze({
    id: "warm-mentor",
    labelKo: "다정한 아틀리에 멘토",
    labelEn: "Warm Atelier Mentor",
    roleTagKo: "격려 · 여유로운 호흡",
    roleTagEn: "Encouraging · Unhurried breath",
    descriptionKo: "작업 리듬을 존중하며 따뜻한 호흡과 부드러운 억양으로 곁을 지킵니다.",
    descriptionEn: "Respects your drawing rhythm with warm phrasing and unhurried pauses.",
    cadenceHintKo: "부드러운 아치 억양 · 여백 있는 호흡",
    cadenceHintEn: "Warm arch contour · generous breathing",
    basePitch: 1.04,
    baseRate: 0.96,
    pauseScale: 1.08,
    pitchRangeScale: 1.05,
    voiceNameHintsKo: Object.freeze(["Yuna", "Sora", "SunHi", "Google 한국의"]),
    voiceNameHintsEn: Object.freeze(["Samantha", "Karen", "Aria", "Google US English"]),
  }),
  director: Object.freeze({
    id: "director",
    labelKo: "연출 디렉터",
    labelEn: "Story Director",
    roleTagKo: "구도 감각 · 또렷한 템포",
    roleTagEn: "Framing focus · Crisp tempo",
    descriptionKo: "장면 밀도와 컷 호흡을 짚어 주며 또렷하고 생기 있는 템포로 안내합니다.",
    descriptionEn: "Highlights framing rhythm and pacing with clear, energetic delivery.",
    cadenceHintKo: "명료한 강세 · 리드미컬한 템포",
    cadenceHintEn: "Crisp emphasis · rhythmic pacing",
    basePitch: 0.98,
    baseRate: 1.04,
    pauseScale: 0.92,
    pitchRangeScale: 1.18,
    voiceNameHintsKo: Object.freeze(["InJoon", "MinHo", "Hyunsu", "Yuna"]),
    voiceNameHintsEn: Object.freeze(["Daniel", "Guy", "Alex", "Google UK English Male"]),
  }),
  "calm-assistant": Object.freeze({
    id: "calm-assistant",
    labelKo: "차분한 어시스턴트",
    labelEn: "Calm Assistant",
    roleTagKo: "담백함 · 몰입 보호",
    roleTagEn: "Minimal · Focus-safe",
    descriptionKo: "과장 없는 차분한 톤으로 저장·동기화·마감 점검만 간결하게 전합니다.",
    descriptionEn: "Delivers concise save, sync, and check-in cues without breaking concentration.",
    cadenceHintKo: "안정적 저음 · 깊은 정돈 호흡",
    cadenceHintEn: "Grounded pitch · serene pauses",
    basePitch: 0.94,
    baseRate: 0.93,
    pauseScale: 1.16,
    pitchRangeScale: 0.78,
    voiceNameHintsKo: Object.freeze(["JiMin", "SeoHyeon", "Yuna"]),
    voiceNameHintsEn: Object.freeze(["Serena", "Moira", "Jenny"]),
  }),
});

export const VOICE_COACH_TONE_PROFILES: Readonly<
  Record<VoiceCoachEmotionTone, VoiceCoachToneProfile>
> = Object.freeze({
  "warm-guide": Object.freeze({
    id: "warm-guide",
    labelKo: "따뜻한 안내",
    labelEn: "Warm Guide",
    feelingKo: "편안하게 다음 손길을 열어 주는 환대 톤",
    feelingEn: "Welcoming cadence that opens the next stroke gently",
    earconLabelKo: "마림바 5음계 상행",
    earconLabelEn: "Rising marimba pentatonic",
    semanticTone: "good",
    contourType: "warm-arch",
    pitchShift: 0.03,
    rateMultiplier: 0.97,
    pauseMultiplier: 1.06,
    energyGain: 0.98,
    emotionDirectiveEn: "Speak with gentle warmth, unhurried breath pauses, and welcoming clarity.",
  }),
  "calm-focus": Object.freeze({
    id: "calm-focus",
    labelKo: "차분한 몰입",
    labelEn: "Calm Focus",
    feelingKo: "흐름을 깨지 않고 안심을 전하는 고요한 톤",
    feelingEn: "Quiet, grounded reassurance that protects deep focus",
    earconLabelKo: "셀레스타 5도 화음",
    earconLabelEn: "Open-fifth celesta chime",
    semanticTone: "cool",
    contourType: "level-settle",
    pitchShift: -0.05,
    rateMultiplier: 0.9,
    pauseMultiplier: 1.24,
    energyGain: 0.88,
    emotionDirectiveEn: "Speak softly and evenly with calm, spacious phrasing that protects focus.",
  }),
  celebrate: Object.freeze({
    id: "celebrate",
    labelKo: "성취 축하",
    labelEn: "Celebrate",
    feelingKo: "완성과 도약을 진심으로 반기는 밝은 탄력",
    feelingEn: "Genuine bright lift celebrating a milestone or export",
    earconLabelKo: "셀레스타 반짝 아르페지오",
    earconLabelEn: "Sparkling celesta arpeggio",
    semanticTone: "good",
    contourType: "bright-lift",
    pitchShift: 0.09,
    rateMultiplier: 1.08,
    pauseMultiplier: 0.86,
    energyGain: 1.06,
    emotionDirectiveEn: "Speak with genuine warmth, uplifted smile, and crisp celebratory energy.",
  }),
  "gentle-alert": Object.freeze({
    id: "gentle-alert",
    labelKo: "부드러운 알림",
    labelEn: "Gentle Alert",
    feelingKo: "놀라지 않게 휴식과 백업을 챙겨 주는 배려 톤",
    feelingEn: "Non-startling reminder for backups or healthy wrist breaks",
    earconLabelKo: "마림바 장3도 하행 노크",
    earconLabelEn: "Soft descending marimba tap",
    semanticTone: "warn",
    contourType: "soft-dip",
    pitchShift: -0.02,
    rateMultiplier: 0.92,
    pauseMultiplier: 1.16,
    energyGain: 0.92,
    emotionDirectiveEn: "Speak gently and reassuringly, never urgent or alarming.",
  }),
  "creative-spark": Object.freeze({
    id: "creative-spark",
    labelKo: "영감 스파크",
    labelEn: "Creative Spark",
    feelingKo: "새 브러시·필터·입체 표현에 호기심을 깨우는 톤",
    feelingEn: "Curious, bright phrasing for new brushes, filters, and previews",
    earconLabelKo: "리디안 셀레스타 반짝 화음",
    earconLabelEn: "Lydian celesta sparkle",
    semanticTone: "accent",
    contourType: "curious-rise",
    pitchShift: 0.06,
    rateMultiplier: 1.03,
    pauseMultiplier: 0.95,
    energyGain: 1.02,
    emotionDirectiveEn: "Speak with curious spark and expressive lift on texture and visual cues.",
  }),
});

export const VOICE_COACH_MOMENT_CATALOG: Readonly<
  Record<VoiceCoachMomentId, VoiceCoachMomentSpec>
> = Object.freeze({
  "canvas-welcome": Object.freeze({
    id: "canvas-welcome",
    defaultTone: "warm-guide",
    priority: "ambient",
    cooldownMs: DEFAULT_VOICE_COACH_COOLDOWN_MS,
    labelKo: "작업실 첫인사",
    labelEn: "Atelier Welcome",
    scripts: Object.freeze({
      "warm-mentor": Object.freeze({
        ko: "작업실에 오신 걸 환영해요. 급하게 그리지 않아도 괜찮아요, 먼저 편한 선 하나만 가볍게 그어 볼까요?",
        en: "Welcome back to the atelier. No need to rush, try laying down one relaxed line to warm up?",
      }),
      director: Object.freeze({
        ko: "작업실 조명 켜졌습니다. 오늘 컷의 첫 리듬을 잡아 볼까요? 시선이 머물 한 선부터 시작해 보세요.",
        en: "Studio lights are up. Ready to set today's rhythm? Start with one bold line that anchors the frame.",
      }),
      "calm-assistant": Object.freeze({
        ko: "캔버스가 준비되었습니다. 현재 브러시와 로컬 저장이 안정적이니, 원하시는 페이스로 작업을 시작하세요.",
        en: "Your canvas is ready. Brush and local save are both steady, so begin at your own pace.",
      }),
    }),
  }),
  "beginner-step-done": Object.freeze({
    id: "beginner-step-done",
    defaultTone: "celebrate",
    priority: "helpful",
    cooldownMs: DEFAULT_VOICE_COACH_COOLDOWN_MS,
    labelKo: "초보 단계 완료",
    labelEn: "Guided Step Complete",
    scripts: Object.freeze({
      "warm-mentor": Object.freeze({
        ko: "방금 한 단계를 정말 깔끔하게 해내셨어요! 손끝 감각이 벌써 자리 잡았네요, 다음 단계도 이 흐름대로 가 볼까요?",
        en: "You just wrapped that step cleanly! Your hand already found the flow, shall we carry it into the next step?",
      }),
      director: Object.freeze({
        ko: "좋아요, 첫 시퀀스가 탄탄하게 섰습니다! 이 템포 그대로 다음 컷 연출로 넘어가 보죠.",
        en: "Nice cut, that opening step landed with real clarity! Keep this momentum rolling into the next beat.",
      }),
      "calm-assistant": Object.freeze({
        ko: "현재 안내 단계를 마쳤습니다. 작업 내용이 안전하게 이어졌으니, 준비되시면 다음 단계를 진행해 주세요.",
        en: "Current guided step complete. Your progress is preserved, so move ahead whenever you feel ready.",
      }),
    }),
  }),
  "brush-discovered": Object.freeze({
    id: "brush-discovered",
    defaultTone: "creative-spark",
    priority: "ambient",
    cooldownMs: DEFAULT_VOICE_COACH_COOLDOWN_MS,
    labelKo: "새 브러시 발견",
    labelEn: "Brush Discovered",
    scripts: Object.freeze({
      "warm-mentor": Object.freeze({
        ko: "새 브러시 질감이 아주 매력적이네요! 필압을 살짝 풀어 길게 그어 보면, 숨겨진 종이결이 더 곱게 살아나요.",
        en: "What a lively brush texture! Try easing your pressure on a long stroke, and the subtle paper grain comes alive.",
      }),
      director: Object.freeze({
        ko: "흥미로운 질감 선택이에요! 이 브러시는 명암 경계나 머리카락 하이라이트에 쓰면 장면 밀도가 확 살아납니다.",
        en: "Great texture pick! Use this brush along shadow edges or hair highlights, and watch the scene depth lift.",
      }),
      "calm-assistant": Object.freeze({
        ko: "새로운 브러시 프리셋을 불러왔습니다. 굵기와 투명도만 살짝 조절하면 원하시는 필감에 금방 맞춰집니다.",
        en: "New brush preset loaded. Adjust size and opacity lightly to dial in your preferred touch.",
      }),
    }),
  }),
  "filter-applied": Object.freeze({
    id: "filter-applied",
    defaultTone: "creative-spark",
    priority: "ambient",
    cooldownMs: DEFAULT_VOICE_COACH_COOLDOWN_MS,
    labelKo: "필터 분위기 전환",
    labelEn: "Filter Applied",
    scripts: Object.freeze({
      "warm-mentor": Object.freeze({
        ko: "필터가 장면 분위기를 부드럽게 바꿔 놓았어요. 전후 비교를 한 번 보시고, 원하시면 강도만 살짝 덜어 내도 좋아요.",
        en: "That filter gently shifted the mood. Peek at before and after, and dial back strength if you want a softer feel.",
      }),
      director: Object.freeze({
        ko: "분위기 전환이 확 살아났네요! 시선이 주인공에게 모이는지, 전체 구도를 한 발 물러서 확인해 보세요.",
        en: "Strong mood shift! Step back for a second, and check whether the eye still lands squarely on your focal point.",
      }),
      "calm-assistant": Object.freeze({
        ko: "필터 적용을 마쳤습니다. 원본 레이어는 그대로 보존되어 있으니, 언제든 강도를 바꾸거나 되돌릴 수 있어요.",
        en: "Filter applied cleanly. Your original layer stays intact, so you can tune or revert it anytime.",
      }),
    }),
  }),
  "offline-saved": Object.freeze({
    id: "offline-saved",
    defaultTone: "calm-focus",
    priority: "helpful",
    cooldownMs: DEFAULT_VOICE_COACH_COOLDOWN_MS,
    labelKo: "오프라인 안전 저장",
    labelEn: "Offline Saved",
    scripts: Object.freeze({
      "warm-mentor": Object.freeze({
        ko: "방금 그린 작업이 기기 안에 안전하게 저장되었어요. 인터넷이 잠시 끊겨도 걱정 마시고, 마음 편히 이어 그리세요.",
        en: "Your work is safely tucked into local storage. Even if the network dips, keep drawing without worry.",
      }),
      director: Object.freeze({
        ko: "로컬 저장 완료. 오프라인 상태에서도 모든 컷이 단단히 기록되고 있으니, 몰입을 깨지 말고 계속 가시죠.",
        en: "Local save locked in. Every panel is recorded offline, so protect your focus and keep rolling.",
      }),
      "calm-assistant": Object.freeze({
        ko: "로컬 저장소에 작업본을 기록했습니다. 연결이 돌아오면 변경분만 조용히 동기화합니다.",
        en: "Changes saved safely to local storage. Once your connection returns, updates will sync quietly.",
      }),
    }),
  }),
  "crdt-merged-lossless": Object.freeze({
    id: "crdt-merged-lossless",
    defaultTone: "calm-focus",
    priority: "helpful",
    cooldownMs: DEFAULT_VOICE_COACH_COOLDOWN_MS,
    labelKo: "무손실 협업 병합",
    labelEn: "Lossless CRDT Merge",
    scripts: Object.freeze({
      "warm-mentor": Object.freeze({
        ko: "함께 작업한 변경 사항이 한 획도 놓치지 않고 곱게 합쳐졌어요. 겹친 부분 없이 그대로 이어가셔도 됩니다.",
        en: "Everyone's edits merged smoothly without losing a single stroke. Nothing collided, so feel free to continue.",
      }),
      director: Object.freeze({
        ko: "협업 병합 깔끔하게 끝났습니다. 팀원의 수정본이 충돌 없이 반영됐으니, 전체 호흡만 한 번 훑어 보시죠.",
        en: "Clean lossless merge across collaborators. Teammate updates are in place, give the sequence a quick glance.",
      }),
      "calm-assistant": Object.freeze({
        ko: "무손실 CRDT 병합을 마쳤습니다. 모든 레이어와 선 기록이 손실 없이 최신 상태로 정렬되었습니다.",
        en: "Lossless CRDT merge complete. Every layer and stroke history is aligned to the latest state.",
      }),
    }),
  }),
  "backup-reminder": Object.freeze({
    id: "backup-reminder",
    defaultTone: "gentle-alert",
    priority: "important",
    cooldownMs: DEFAULT_VOICE_COACH_COOLDOWN_MS,
    labelKo: "백업 스냅샷 권유",
    labelEn: "Backup Reminder",
    scripts: Object.freeze({
      "warm-mentor": Object.freeze({
        ko: "작품이 꽤 풍성해졌어요. 잠깐 숨 고르는 김에 백업 스냅샷을 하나 남겨 두면, 마음이 훨씬 든든할 거예요.",
        en: "Your piece has grown rich with detail. While catching your breath, saving a backup snapshot will give peace of mind.",
      }),
      director: Object.freeze({
        ko: "중요한 분량이 쌓였습니다. 다음 큰 수정에 들어가기 전에, 지금 버전을 체크포인트로 하나 묶어 두시죠.",
        en: "Substantial progress is on canvas. Before the next major pass, lock a backup checkpoint right here.",
      }),
      "calm-assistant": Object.freeze({
        ko: "최근 변경이 여러 건 누적되었습니다. 여유가 되실 때 백업 스냅샷을 하나 생성해 두시면 안전합니다.",
        en: "Several edits have accumulated since your last backup. Create a backup snapshot when convenient.",
      }),
    }),
  }),
  "export-complete": Object.freeze({
    id: "export-complete",
    defaultTone: "celebrate",
    priority: "important",
    cooldownMs: DEFAULT_VOICE_COACH_COOLDOWN_MS,
    labelKo: "원고 내보내기 완료",
    labelEn: "Export Complete",
    scripts: Object.freeze({
      "warm-mentor": Object.freeze({
        ko: "원고 내보내기가 말끔하게 끝났어요! 긴 시간 공들여 완성하시느라 정말 수고 많으셨어요, 잠깐 기지개 한 번 켜 볼까요?",
        en: "Export finished cleanly! You poured real care into finishing this, take a moment to stretch and admire your work.",
      }),
      director: Object.freeze({
        ko: "최종 마스터 출력 완료! 해상도와 여백까지 깔끔하게 떨어졌으니, 이제 독자에게 공개할 준비가 됐습니다.",
        en: "Final master export wrapped! Resolution and margins checked out clean, your episode is ready for readers.",
      }),
      "calm-assistant": Object.freeze({
        ko: "파일 내보내기를 성공적으로 완료했습니다. 출력 패키지 점검이 끝났으니 바로 확인하거나 공유하실 수 있습니다.",
        en: "Export completed successfully. Output files are verified and ready to review or share.",
      }),
    }),
  }),
  "focus-break-45m": Object.freeze({
    id: "focus-break-45m",
    defaultTone: "gentle-alert",
    priority: "important",
    cooldownMs: DEFAULT_VOICE_COACH_COOLDOWN_MS,
    labelKo: "45분 손목·눈 휴식",
    labelEn: "45-Minute Focus Break",
    scripts: Object.freeze({
      "warm-mentor": Object.freeze({
        ko: "벌써 45분 동안 푹 빠져 그리셨어요. 손목을 가볍게 털어 주고 물 한 모금 마신 뒤 돌아오면, 선이 더 부드러워질 거예요.",
        en: "You have been deeply focused for 45 minutes. Loosen your wrists and sip some water, your lines will feel fresher after a pause.",
      }),
      director: Object.freeze({
        ko: "45분 집중 주행 완료. 잠깐 시야를 멀리 두고 눈을 식혀 주세요, 잠시 쉬고 보면 구도가 훨씬 또렷해집니다.",
        en: "45-minute focus sprint logged. Rest your eyes on a distant point, fresh eyes always catch stronger framing.",
      }),
      "calm-assistant": Object.freeze({
        ko: "45분 연속 작업이 지났습니다. 손목과 눈의 피로를 줄이기 위해 짧은 휴식을 취한 뒤 이어가시길 권장합니다.",
        en: "45 minutes of continuous work elapsed. Take a short pause for your wrists and eyes before continuing.",
      }),
    }),
  }),
  "hologram-ready": Object.freeze({
    id: "hologram-ready",
    defaultTone: "creative-spark",
    priority: "helpful",
    cooldownMs: DEFAULT_VOICE_COACH_COOLDOWN_MS,
    labelKo: "홀로그램 미리보기 준비",
    labelEn: "Hologram Preview Ready",
    scripts: Object.freeze({
      "warm-mentor": Object.freeze({
        ko: "입체 홀로그램 미리보기가 반짝이게 준비됐어요! 각도를 천천히 돌려 보면서, 빛이 맺히는 결을 느껴 보세요.",
        en: "Your hologram preview is glowing and ready! Tilt the view slowly, and feel how light catches each layer.",
      }),
      director: Object.freeze({
        ko: "홀로그램 스테이지 준비 완료! 카메라 앵글을 기울여, 레이어 깊이감과 빛 반사가 의도대로 살아나는지 점검해 보죠.",
        en: "Hologram stage is live! Sweep the viewing angle to verify layer depth and specular highlights.",
      }),
      "calm-assistant": Object.freeze({
        ko: "홀로그램 미리보기 렌더링이 준비되었습니다. 시점 컨트롤을 움직여 깊이 레이어를 실시간으로 확인하실 수 있습니다.",
        en: "Hologram preview rendering is ready. Move the view control to inspect depth layers in real time.",
      }),
    }),
  }),
});

export const NEURAL_VOICE_PROVIDER_CATALOG: Readonly<
  Record<NeuralVoiceProviderId, NeuralVoiceProviderCatalogEntry>
> = Object.freeze({
  "local-expressive": Object.freeze({
    id: "local-expressive",
    labelKo: "로컬 운율 엔진",
    labelEn: "Local Prosody Engine",
    badgeKo: "기본 내장 · 무료",
    badgeEn: "Built-in · Ready",
    summaryKo: "브라우저 Web Audio 이어콘 + 절별 호흡·피치 운율 분할 + 실시간 자막으로 키 없이 즉시 동작합니다.",
    summaryEn: "Runs offline with Web Audio earcons, breathing-clause prosody, and live CC with zero keys.",
    defaultModel: "atelier-prosody-v1",
    defaultVoiceId: "system-expressive",
    endpointHint: "local://browser-prosody",
    streamingProtocol: "browser-prosody",
    supportsEmotionDirectives: true,
    plainTextOnly: true,
  }),
  "deepgram-flux": Object.freeze({
    id: "deepgram-flux",
    labelKo: "Deepgram Flux TTS",
    labelEn: "Deepgram Flux TTS",
    badgeKo: "턴 기반 뉴럴 슬롯",
    badgeEn: "Turn-based Neural Slot",
    summaryKo: "실시간 턴 기반 저지연 합성(/v2/speak 평문 청크 규격). 서버 프록시 또는 BYOK 미연결 시 로컬로 폴백합니다.",
    summaryEn: "Low-latency turn-based synthesis (/v2/speak plain-text chunks). Safely falls back to local when unconfigured.",
    defaultModel: "flux-kit-en",
    defaultVoiceId: "flux-kit-en",
    endpointHint: "wss://api.deepgram.com/v2/speak",
    streamingProtocol: "websocket-turn",
    supportsEmotionDirectives: false,
    plainTextOnly: true,
  }),
  "deepgram-aura2": Object.freeze({
    id: "deepgram-aura2",
    labelKo: "Deepgram Aura-2",
    labelEn: "Deepgram Aura-2",
    badgeKo: "스트리밍 뉴럴 슬롯",
    badgeEn: "Streaming Neural Slot",
    summaryKo: "자연스러운 대화형 음성(/v1/speak). 인증 미설정 시 오류 없이 로컬 운율 엔진으로 폴백합니다.",
    summaryEn: "Natural conversational voices (/v1/speak). Falls back silently to the local prosody engine without credentials.",
    defaultModel: "aura-2-thalia-en",
    defaultVoiceId: "aura-2-thalia-en",
    endpointHint: "https://api.deepgram.com/v1/speak",
    streamingProtocol: "rest-stream",
    supportsEmotionDirectives: false,
    plainTextOnly: true,
  }),
  "gemini-live": Object.freeze({
    id: "gemini-live",
    labelKo: "Gemini Live 보이스",
    labelEn: "Gemini Live Voice",
    badgeKo: "감정 지시 뉴럴 슬롯",
    badgeEn: "Emotion-aware Slot",
    summaryKo: "감정 지시문과 호흡 톤을 이해하는 양방향 실시간 오디오 연동 계약. 키 미연결 시 로컬 안전 폴백.",
    summaryEn: "Bidirectional realtime audio contract supporting emotion directives. Uses local fallback when unconfigured.",
    defaultModel: "gemini-live-2.5-flash",
    defaultVoiceId: "aoede-warm",
    endpointHint: "wss://generativelanguage.googleapis.com/ws/live",
    streamingProtocol: "realtime-bidirectional",
    supportsEmotionDirectives: true,
    plainTextOnly: true,
  }),
  "elevenlabs-byok": Object.freeze({
    id: "elevenlabs-byok",
    labelKo: "ElevenLabs (BYOK)",
    labelEn: "ElevenLabs (BYOK)",
    badgeKo: "사용자 키 슬롯",
    badgeEn: "BYOK Slot",
    summaryKo: "사용자 보유 키(BYOK) 또는 팀 프록시 연결용 고표현력 보이스 어댑터. 키 미연결 시 로컬 안전 폴백.",
    summaryEn: "Expressive voice adapter for user-supplied keys or studio proxies. Safe local fallback by default.",
    defaultModel: "eleven_multilingual_v2",
    defaultVoiceId: "atelier-soft-mentor",
    endpointHint: "https://api.elevenlabs.io/v1/text-to-speech",
    streamingProtocol: "rest-stream",
    supportsEmotionDirectives: true,
    plainTextOnly: true,
  }),
});

export function createDefaultNeuralProviderConfig(
  provider: NeuralVoiceProviderId = "local-expressive",
): NeuralVoiceProviderConfig {
  const entry = NEURAL_VOICE_PROVIDER_CATALOG[provider];
  return Object.freeze({
    provider,
    model: entry.defaultModel,
    voiceId: entry.defaultVoiceId,
    endpointUrl: provider === "local-expressive" ? null : entry.endpointHint,
    credentialSource: "none",
    hasCredential: provider === "local-expressive",
    streamingProtocol: entry.streamingProtocol,
    fallbackToLocal: true,
    timeoutMs: 8_000,
  });
}

export function getVoiceCoachMomentScript(
  momentId: VoiceCoachMomentId,
  persona: VoiceCoachPersona,
  locale: VoiceCoachLocale,
): string {
  const pair = VOICE_COACH_MOMENT_CATALOG[momentId].scripts[persona];
  return locale === "ko" ? pair.ko : pair.en;
}

export function getTonePreviewMomentId(tone: VoiceCoachEmotionTone): VoiceCoachMomentId {
  switch (tone) {
    case "warm-guide":
      return "canvas-welcome";
    case "calm-focus":
      return "offline-saved";
    case "celebrate":
      return "export-complete";
    case "gentle-alert":
      return "focus-break-45m";
    case "creative-spark":
      return "brush-discovered";
  }
}
