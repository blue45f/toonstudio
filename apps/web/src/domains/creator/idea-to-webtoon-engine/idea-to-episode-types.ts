/**
 * 아이디어 → 완성 웹툰 6단계 멀티모달 에이전트 파이프라인 강타입 계약.
 *
 * 6종 장르 × 3종 분량(4/12/24컷)의 결정론적 컴파일, 캐릭터 DNA 락,
 * 장기 연재 연속성 감사·자동 교정, 적응형 OST 감정 큐, ToonStudio 프로젝트
 * 블루프린트 JSON 출력을 위한 순수 타입과 상수를 정의한다.
 */

export type IdeaPipelineLocale = "ko" | "en";

export interface BilingualLine {
  readonly ko: string;
  readonly en: string;
}

export type WebtoonGenreId =
  | "romance-fantasy"
  | "modern-fantasy"
  | "murim"
  | "action-noir"
  | "slice-of-comedy"
  | "thriller";

export type EpisodeLengthId = "shorts-4" | "prologue-12" | "full-24";

export type StoryActId =
  | "setup"
  | "development"
  | "turn"
  | "climax"
  | "cliffhanger";

export type CameraShotType =
  | "ECU"
  | "CU"
  | "MS"
  | "WS"
  | "BirdEye"
  | "Dutch";

export type SpeechRegisterId = "formal" | "casual" | "archaic";

export type TimeOfDayId =
  | "dawn"
  | "morning"
  | "noon"
  | "dusk"
  | "night"
  | "midnight";

export type ScrollTempoId =
  | "compressed-action"
  | "steady-dialogue"
  | "expanded-tension"
  | "cliffhanger-drop";

export type CharacterRoleId =
  | "protagonist"
  | "deuteragonist"
  | "antagonist";

export type CharacterRelationType =
  | "ally"
  | "rival"
  | "mentor"
  | "foil"
  | "secret-bond";

export type PipelineStageId =
  | "story-beats"
  | "character-dna"
  | "scroll-panels"
  | "continuity-audit"
  | "adaptive-ost"
  | "studio-blueprint";

export type PipelineStageStatus = "completed" | "warning" | "repaired";

export type SemanticSwatchId =
  | "accent"
  | "cool"
  | "good"
  | "warn"
  | "bad"
  | "raised"
  | "fg-muted";

export interface CharacterPaletteToken {
  readonly swatchId: SemanticSwatchId;
  readonly cssVar: string;
  readonly role: BilingualLine;
}

export interface CharacterRelationshipEdge {
  readonly targetCharacterId: string;
  readonly targetName: BilingualLine;
  readonly relationType: CharacterRelationType;
  readonly summary: BilingualLine;
}

export interface CharacterDnaLock {
  readonly id: string;
  readonly role: CharacterRoleId;
  readonly name: BilingualLine;
  readonly appearanceAnchors: readonly BilingualLine[];
  readonly lockedOutfitId: string;
  readonly lockedOutfitLabel: BilingualLine;
  readonly signaturePaletteTokens: readonly CharacterPaletteToken[];
  readonly speechRegister: SpeechRegisterId;
  readonly speechRegisterRule: BilingualLine;
  readonly propsInventory: readonly BilingualLine[];
  readonly relationships: readonly CharacterRelationshipEdge[];
  readonly consistencyHash: string;
}

export interface StoryBeatNode {
  readonly beatId: string;
  readonly act: StoryActId;
  readonly order: number;
  readonly title: BilingualLine;
  readonly summary: BilingualLine;
  readonly tensionScore: number;
  readonly panelIndices: readonly number[];
  readonly isCliffhanger: boolean;
  readonly hookQuestion?: BilingualLine;
}

export interface PanelDialogueBubble {
  readonly id: string;
  readonly speakerId: string;
  readonly speakerName: BilingualLine;
  readonly speechRegister: SpeechRegisterId;
  readonly kind: "speech" | "thought" | "narration" | "shout";
  readonly text: BilingualLine;
}

export interface GeneratedPanelBlueprint {
  readonly panelIndex: number;
  readonly panelId: string;
  readonly beatId: string;
  readonly act: StoryActId;
  readonly cameraShot: CameraShotType;
  readonly panelWidthPx: number;
  readonly panelHeightPx: number;
  readonly gutterBeforePx: number;
  readonly scrollTempo: ScrollTempoId;
  readonly tensionScore: number;
  readonly timeOfDay: TimeOfDayId;
  readonly timeSlotOrder: number;
  readonly isFlashback: boolean;
  readonly featuredCharacterIds: readonly string[];
  readonly outfitAssignments: Readonly<Record<string, string>>;
  readonly dialogues: readonly PanelDialogueBubble[];
  readonly sfx: BilingualLine;
  readonly bg3dPresetId: string;
  readonly bg3dPresetLabel: BilingualLine;
  readonly lightingMood: BilingualLine;
  readonly visualDirection: BilingualLine;
  readonly isCliffhangerPanel: boolean;
}

export type ContinuityRuleId =
  | "OUTFIT_MISMATCH"
  | "TIMELINE_REGRESSION"
  | "DIALOGUE_BUBBLE_OVERLOAD"
  | "MISSING_CLIFFHANGER"
  | "MONOTONOUS_SHOT_SEQUENCE";

export type ContinuityFindingSeverity = "error" | "warning";

export interface ContinuityAuditFinding {
  readonly findingId: string;
  readonly ruleId: ContinuityRuleId;
  readonly severity: ContinuityFindingSeverity;
  readonly panelIndices: readonly number[];
  readonly characterId?: string;
  readonly message: BilingualLine;
  readonly autoFixPreview: BilingualLine;
}

export interface ContinuityAuditReport {
  readonly checkedAtSeed: string;
  readonly score: number;
  readonly passed: boolean;
  readonly findings: readonly ContinuityAuditFinding[];
  readonly countsByRule: Readonly<Record<ContinuityRuleId, number>>;
}

export interface AdaptiveOstEmotionCue {
  readonly cueId: string;
  readonly startPanelIndex: number;
  readonly endPanelIndex: number;
  readonly act: StoryActId;
  readonly emotionTag: BilingualLine;
  readonly averageTension: number;
  readonly bpm: number;
  readonly musicalKey: string;
  readonly instrumentLayers: readonly BilingualLine[];
  readonly crossfadeDurationSec: number;
  readonly crossfadeEntryPanel: number;
  readonly intensityCurve: readonly number[];
}

export interface PipelineAgentStep {
  readonly stageNumber: 1 | 2 | 3 | 4 | 5 | 6;
  readonly stageId: PipelineStageId;
  readonly agentName: BilingualLine;
  readonly title: BilingualLine;
  readonly summary: BilingualLine;
  readonly artifactCount: number;
  readonly status: PipelineStageStatus;
}

export interface StudioBlueprintLayerSpec {
  readonly layerId: string;
  readonly kind: "bg3d" | "sketch" | "ink" | "color" | "lighting" | "lettering" | "sfx" | "audio-cue";
  readonly label: string;
  readonly locked: boolean;
  readonly visible: boolean;
}

export interface StudioBlueprintPanelNode {
  readonly panelId: string;
  readonly panelIndex: number;
  readonly act: StoryActId;
  readonly yOffsetPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly gutterBeforePx: number;
  readonly cameraShot: CameraShotType;
  readonly tensionScore: number;
  readonly bg3dPresetId: string;
  readonly sfxText: string;
  readonly dialogueCount: number;
  readonly dialogues: readonly {
    readonly id: string;
    readonly speakerId: string;
    readonly kind: PanelDialogueBubble["kind"];
    readonly text: string;
  }[];
  readonly isCliffhangerPanel: boolean;
}

export interface ToonStudioBlueprintJsonDocument {
  readonly schemaVersion: "toonstudio.episode-blueprint.v2";
  readonly generator: "toonstudio-idea-to-webtoon-6stage";
  readonly deterministicSeed: string;
  readonly locale: IdeaPipelineLocale;
  readonly episodeMeta: {
    readonly title: string;
    readonly logline: string;
    readonly genre: WebtoonGenreId;
    readonly lengthId: EpisodeLengthId;
    readonly panelCount: number;
    readonly stripWidthPx: number;
    readonly totalStripHeightPx: number;
    readonly continuityScore: number;
  };
  readonly canvas: {
    readonly widthPx: number;
    readonly totalHeightPx: number;
    readonly readingDirection: "ttb";
    readonly exportSliceHeightPx: number;
    readonly colorSpace: "oklch-srgb-managed";
  };
  readonly characterBible: readonly {
    readonly id: string;
    readonly role: CharacterRoleId;
    readonly name: string;
    readonly lockedOutfitId: string;
    readonly speechRegister: SpeechRegisterId;
    readonly paletteCssVars: readonly string[];
    readonly consistencyHash: string;
  }[];
  readonly storyBeats: readonly {
    readonly beatId: string;
    readonly act: StoryActId;
    readonly title: string;
    readonly tensionScore: number;
    readonly panelIndices: readonly number[];
    readonly isCliffhanger: boolean;
  }[];
  readonly layers: readonly StudioBlueprintLayerSpec[];
  readonly panels: readonly StudioBlueprintPanelNode[];
  readonly audioTrackCues: readonly {
    readonly cueId: string;
    readonly startPanelIndex: number;
    readonly endPanelIndex: number;
    readonly bpm: number;
    readonly musicalKey: string;
    readonly crossfadeDurationSec: number;
    readonly averageTension: number;
  }[];
  readonly auditSummary: {
    readonly score: number;
    readonly passed: boolean;
    readonly findingCount: number;
  };
}

export interface CompiledWebtoonEpisodePlan {
  readonly planId: string;
  readonly deterministicSeed: string;
  readonly logline: string;
  readonly locale: IdeaPipelineLocale;
  readonly episodeTitle: BilingualLine;
  readonly genre: WebtoonGenreId;
  readonly lengthId: EpisodeLengthId;
  readonly stages: readonly PipelineAgentStep[];
  readonly storyBeats: readonly StoryBeatNode[];
  readonly characters: readonly CharacterDnaLock[];
  readonly panels: readonly GeneratedPanelBlueprint[];
  readonly continuityAudit: ContinuityAuditReport;
  readonly ostCues: readonly AdaptiveOstEmotionCue[];
  readonly studioBlueprint: ToonStudioBlueprintJsonDocument;
  readonly totalStripHeightPx: number;
  readonly repairCount: number;
}

export interface IdeaToWebtoonInput {
  readonly logline: string;
  readonly genre: WebtoonGenreId;
  readonly lengthId: EpisodeLengthId;
  readonly locale?: IdeaPipelineLocale;
}

export interface IdeaPromptPreset {
  readonly id: string;
  readonly genre: WebtoonGenreId;
  readonly lengthId: EpisodeLengthId;
  readonly chipLabel: BilingualLine;
  readonly logline: BilingualLine;
}

export interface EpisodeLengthSpec {
  readonly id: EpisodeLengthId;
  readonly panelCount: 4 | 12 | 24;
  readonly label: BilingualLine;
  readonly description: BilingualLine;
}

export interface BlueprintValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly document: ToonStudioBlueprintJsonDocument | null;
}

export const WEBTOON_STRIP_WIDTH_PX = 800;
export const WEBTOON_EXPORT_SLICE_HEIGHT_PX = 1280;
export const MAX_BUBBLES_PER_PANEL = 3;
export const MAX_BUBBLE_CHAR_LENGTH = 48;
export const MONOTONOUS_SHOT_RUN_THRESHOLD = 3;
export const CLIFFHANGER_MIN_TENSION = 75;

export const WEBTOON_GENRE_IDS: readonly WebtoonGenreId[] = [
  "romance-fantasy",
  "modern-fantasy",
  "murim",
  "action-noir",
  "slice-of-comedy",
  "thriller",
] as const;

export const EPISODE_LENGTH_SPECS: readonly EpisodeLengthSpec[] = [
  {
    id: "shorts-4",
    panelCount: 4,
    label: { ko: "4컷 쇼츠", en: "4-Panel Shorts" },
    description: {
      ko: "SNS·피드용 초압축 훅 전개",
      en: "High-hook micro pacing for vertical feeds",
    },
  },
  {
    id: "prologue-12",
    panelCount: 12,
    label: { ko: "12컷 프롤로그", en: "12-Panel Prologue" },
    description: {
      ko: "세계관·주연 첫인상·엔딩 반전 구성",
      en: "World hook, cast lock, and ending twist",
    },
  },
  {
    id: "full-24",
    panelCount: 24,
    label: { ko: "24컷 정규화", en: "24-Panel Full Episode" },
    description: {
      ko: "주간 연재 호흡·감정선·클리프행어 완결",
      en: "Full weekly serialization rhythm and cliffhanger",
    },
  },
] as const;

export const TIME_OF_DAY_RANK: Readonly<Record<TimeOfDayId, number>> = {
  dawn: 0,
  morning: 1,
  noon: 2,
  dusk: 3,
  night: 4,
  midnight: 5,
};
