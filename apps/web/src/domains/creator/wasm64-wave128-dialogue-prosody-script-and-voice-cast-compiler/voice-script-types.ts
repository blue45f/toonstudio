/**
 * Wave 128 — 웹툰 대사 운율·감정·호흡 연기 대본 & 멀티스피커 성우 캐스팅·부스 스케줄 계약 타입.
 *
 * ES2017 strict TypeScript + verbatimModuleSyntax 준수.
 */

/** 웹툰 말풍선 시각 유형 (6종). */
export type DialogueBalloonStyle =
  | "oval-normal"
  | "shout-jagged"
  | "whisper-dashed"
  | "thought-cloud"
  | "narration-box"
  | "phone-radio";

/** 연기 전달 스타일 (6종). */
export type VoiceDeliveryStyle =
  | "shout"
  | "whisper"
  | "inner-monologue"
  | "narration"
  | "urgent-dialogue"
  | "calm-dialogue";

/** 음향 공간·필터 태그 (4종). */
export type AcousticReverbTag =
  | "dry-close"
  | "inner-monologue-hall"
  | "phone-bandpass"
  | "studio-narrator";

/** 성우 배역 등급. */
export type VoiceActorTier = "lead" | "supporting" | "narrator" | "ensemble";

/** 캐릭터-성우 배정 방식. */
export type CastAssignmentMode = "fixed-lead" | "graph-colored" | "unassigned-shortage";

/** 입력 웹툰 대사 큐. */
export interface EpisodeDialogueCueInput {
  readonly lineId: string;
  readonly sceneId: string;
  readonly cutId: string;
  readonly characterId: string;
  readonly characterNameKo?: string;
  readonly textKo: string;
  readonly balloonStyle: DialogueBalloonStyle;
  readonly overlapInterrupt?: boolean;
}

/** 운율·타임라인 컴파일 옵션. */
export interface DialogueProsodyCompileOptions {
  readonly defaultInterLineGapMs?: number;
  readonly sceneTransitionGapMs?: number;
  readonly interruptOverlapRatio?: number;
  readonly minimumLineDurationMs?: number;
}

/** 정규화된 운율 컴파일 옵션. */
export interface ResolvedDialogueProsodyOptions {
  readonly defaultInterLineGapMs: number;
  readonly sceneTransitionGapMs: number;
  readonly interruptOverlapRatio: number;
  readonly minimumLineDurationMs: number;
}

/** 대사 문장부호·표현 프로파일. */
export interface PunctuationCueProfile {
  readonly exclamationCount: number;
  readonly questionCount: number;
  readonly interrobangCount: number;
  readonly ellipsisCount: number;
  readonly tildeCount: number;
  readonly emDashCount: number;
}

/** 컴파일된 단일 대사 연기 큐. */
export interface CompiledDialogueLine {
  readonly lineIndex: number;
  readonly lineId: string;
  readonly sceneId: string;
  readonly cutId: string;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly textKo: string;
  readonly normalizedTextKo: string;
  readonly isEmptyCue: boolean;
  readonly balloonStyle: DialogueBalloonStyle;
  readonly deliveryStyle: VoiceDeliveryStyle;
  readonly acousticReverbTag: AcousticReverbTag;
  readonly syllableCount: number;
  readonly punctuation: PunctuationCueProfile;
  readonly speakingRateSps: number;
  readonly pitchShiftSemitones: number;
  readonly energyDb: number;
  readonly preBreathMs: number;
  readonly postHoldMs: number;
  readonly speechDurationMs: number;
  readonly estimatedDurationMs: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly overlapInterrupt: boolean;
  readonly intentionalOverlapMs: number;
  readonly emotionCueKo: string;
  readonly breathDirectionKo: string;
}

/** 씬별 대사 요약. */
export interface SceneDialogueSummary {
  readonly sceneId: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly lineCount: number;
  readonly characterIds: readonly string[];
  readonly shoutLineCount: number;
}

/** 컴파일된 에피소드 대사 운율 연기 대본. */
export interface CompiledVoiceProsodyScript {
  readonly lines: readonly CompiledDialogueLine[];
  readonly scenes: readonly SceneDialogueSummary[];
  readonly characterIds: readonly string[];
  readonly totalDurationMs: number;
  readonly totalSyllables: number;
  readonly unintendedOverlapCount: number;
  readonly intentionalInterruptCount: number;
  readonly deliveryBreakdown: Readonly<Record<VoiceDeliveryStyle, number>>;
  readonly reverbBreakdown: Readonly<Record<AcousticReverbTag, number>>;
  readonly emptyLineIds: readonly string[];
  readonly prosodyScriptSha256Hex: string;
}

/** 투입 가능한 성우 프로파일. */
export interface VoiceActorProfile {
  readonly actorId: string;
  readonly nameKo: string;
  readonly vocalTier: VoiceActorTier;
  readonly fixedLeadCharacterIds?: readonly string[];
  readonly maxConsecutiveShoutLines?: number;
  readonly hourlyRateKrw: number;
}

/** 같은 씬에 동시 등장하는 두 캐릭터 사이의 간섭 간선. */
export interface SceneInterferenceEdge {
  readonly characterA: string;
  readonly characterB: string;
  readonly sharedSceneIds: readonly string[];
}

/** 캐릭터별 성우 배정 결과. */
export interface CharacterCastAssignment {
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly actorId: string | null;
  readonly actorNameKo: string;
  readonly assignmentMode: CastAssignmentMode;
  readonly lineCount: number;
  readonly shoutLineCount: number;
  readonly sceneIds: readonly string[];
  readonly interferenceDegree: number;
}

/** 동일 씬 내 1인 2역 충돌 기록. */
export interface SameSceneDoubleCastCollision {
  readonly sceneId: string;
  readonly actorId: string;
  readonly characterIds: readonly string[];
}

/** 연속 외침으로 인한 성대 피로 보호 휴식 이벤트. */
export interface HydrationBreakEvent {
  readonly breakId: string;
  readonly actorId: string;
  readonly actorNameKo: string;
  readonly afterLineId: string;
  readonly beforeLineId: string;
  readonly sceneId: string;
  readonly consecutiveShoutRun: number;
  readonly maxAllowedConsecutiveShouts: number;
  readonly breakStartMs: number;
  readonly breakDurationMs: number;
  readonly reasonKo: string;
}

/** 성우별 녹음 부스 세션 및 비용 추정치. */
export interface BoothActorSession {
  readonly actorId: string;
  readonly actorNameKo: string;
  readonly vocalTier: VoiceActorTier;
  readonly assignedCharacterIds: readonly string[];
  readonly lineCount: number;
  readonly shoutLineCount: number;
  readonly maxConsecutiveShoutObserved: number;
  readonly hydrationBreakCount: number;
  readonly activeSpeechMs: number;
  readonly estimatedBoothMinutes: number;
  readonly billableHours: number;
  readonly hourlyRateKrw: number;
  readonly estimatedCostKrw: number;
  readonly costEstimationBasisKo: string;
}

/** 성우 캐스팅 및 부스 스케줄 옵션. */
export interface VoiceCastScheduleOptions {
  readonly defaultMaxConsecutiveShoutLines?: number;
  readonly hydrationBreakDurationMs?: number;
  readonly takeRetakeMultiplier?: number;
  readonly boothSetupMinutesPerActor?: number;
  readonly directionMinutesPerLine?: number;
  readonly minimumBillableHoursPerActor?: number;
}

/** 정규화된 부스 스케줄 옵션. */
export interface ResolvedVoiceCastScheduleOptions {
  readonly defaultMaxConsecutiveShoutLines: number;
  readonly hydrationBreakDurationMs: number;
  readonly takeRetakeMultiplier: number;
  readonly boothSetupMinutesPerActor: number;
  readonly directionMinutesPerLine: number;
  readonly minimumBillableHoursPerActor: number;
}

/** 멀티스피커 성우 캐스팅 및 녹음 부스 스케줄 결과. */
export interface VoiceCastAndBoothSchedule {
  readonly castFeasible: boolean;
  readonly feasibilityReasonKo: string;
  readonly shortageActorCount: number;
  readonly maxSceneCliqueSize: number;
  readonly chromaticLowerBound: number;
  readonly availableActorCount: number;
  readonly sameSceneDoubleCastCollisionCount: number;
  readonly sameSceneCollisions: readonly SameSceneDoubleCastCollision[];
  readonly fixedLeadConflictIssues: readonly string[];
  readonly interferenceEdges: readonly SceneInterferenceEdge[];
  readonly assignments: readonly CharacterCastAssignment[];
  readonly characterToActorId: Readonly<Record<string, string | null>>;
  readonly hydrationBreakEvents: readonly HydrationBreakEvent[];
  readonly actorSessions: readonly BoothActorSession[];
  readonly totalBoothDurationMinutes: number;
  readonly totalHydrationBreakMinutes: number;
  readonly estimatedTotalStudioCostKrw: number;
  readonly isCostEstimate: true;
  readonly costEstimateDisclaimerKo: string;
  readonly scriptManifestSha256Hex: string;
}

/** OKLCH 타임라인 SVG 렌더 옵션. */
export interface VoiceCastTimelineSvgOptions {
  readonly titleKo?: string;
  readonly widthPx?: number;
  readonly showInterferenceSummary?: boolean;
}

export const BALLOON_STYLE_LABELS_KO: Readonly<Record<DialogueBalloonStyle, string>> = {
  "oval-normal": "일반 말풍선",
  "shout-jagged": "외침 톱니풍선",
  "whisper-dashed": "속삭임 점선풍선",
  "thought-cloud": "내면 구름풍선",
  "narration-box": "내레이션 박스",
  "phone-radio": "전화·무전 풍선",
};

export const DELIVERY_STYLE_LABELS_KO: Readonly<Record<VoiceDeliveryStyle, string>> = {
  shout: "외침",
  whisper: "속삭임",
  "inner-monologue": "내면 독백",
  narration: "내레이션",
  "urgent-dialogue": "긴박 대사",
  "calm-dialogue": "차분 대사",
};

export const ACOUSTIC_REVERB_LABELS_KO: Readonly<Record<AcousticReverbTag, string>> = {
  "dry-close": "근접 드라이",
  "inner-monologue-hall": "내면 잔향홀",
  "phone-bandpass": "전화 대역필터",
  "studio-narrator": "스튜디오 내레이터",
};

export const VOICE_ACTOR_TIER_LABELS_KO: Readonly<Record<VoiceActorTier, string>> = {
  lead: "주연",
  supporting: "조연",
  narrator: "내레이터",
  ensemble: "단역·멀티",
};
