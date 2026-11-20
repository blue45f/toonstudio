/**
 * 인라인 슬래시(`/`) 연출 커맨드 및 `@` 스토리바이블 바인딩 타입·명세 정의.
 */

import type { StudioWriterRoomSfx } from "@toonstudio/contracts/studio-writer-room";

import type { SfxCategory } from "../../studio-sfx-presets";
import type { CutReadinessSlots } from "../../planning/studio-story-living-spec-store";

export const SLASH_COMMAND_IDS = [
  "cut",
  "shot",
  "balloon",
  "sfx",
  "voice_emotion",
  "bg_set",
  "ai_conti",
] as const;

export type SlashDirectingCommandId = (typeof SLASH_COMMAND_IDS)[number];

export interface SlashDirectingCommandSpec {
  readonly id: SlashDirectingCommandId;
  readonly primaryToken: string;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly template: string;
  readonly aliases: readonly string[];
}

export const SLASH_DIRECTING_COMMANDS: readonly SlashDirectingCommandSpec[] = Object.freeze([
  {
    id: "cut",
    primaryToken: "/컷",
    labelKo: "새 컷 시작",
    descriptionKo: "새 컷 블록을 열고 장면 동작 요약을 기록합니다.",
    template: "/컷 ",
    aliases: ["컷", "패널", "cut", "panel"],
  },
  {
    id: "shot",
    primaryToken: "/샷",
    labelKo: "3D 카메라 앵글",
    descriptionKo: "샷 크기, 앵글, 렌즈 프리셋을 컷에 지정합니다.",
    template: "/샷 바스트샷 50mm ",
    aliases: ["샷", "3d앵글", "앵글", "카메라", "shot", "angle", "camera"],
  },
  {
    id: "balloon",
    primaryToken: "/말풍선",
    labelKo: "말풍선 대사",
    descriptionKo: "화자, 감정 톤, 대사 문장을 한 줄에 작성합니다.",
    template: "/말풍선 @인물 [일반] ",
    aliases: ["말풍선", "대사", "나레이션", "balloon", "dialogue"],
  },
  {
    id: "sfx",
    primaryToken: "/효과음",
    labelKo: "효과음(SFX)",
    descriptionKo: "효과음 텍스트와 강도·크기를 지정하고 프리셋을 연결합니다.",
    template: "/효과음 쾅! [강함/큼]",
    aliases: ["효과음", "sfx", "sound"],
  },
  {
    id: "voice_emotion",
    primaryToken: "/성우감정",
    labelKo: "성우 감정·호흡",
    descriptionKo: "보이스 더빙용 감정 태그와 호흡 지시를 남깁니다.",
    template: "/성우감정 @인물 분노 · 숨 가쁘게",
    aliases: ["성우감정", "성우", "보이스", "voice", "emotion"],
  },
  {
    id: "bg_set",
    primaryToken: "/배경세트",
    labelKo: "배경 세트·조명",
    descriptionKo: "장소, 시간대, 3D 배경 세트 참조를 연결합니다.",
    template: "/배경세트 @장소 · 야간",
    aliases: ["배경세트", "배경", "장소", "세트", "bg", "location", "set"],
  },
  {
    id: "ai_conti",
    primaryToken: "/AI콘티",
    labelKo: "AI 콘티 시드",
    descriptionKo: "러프 콘티 생성용 구도·빛·화풍 지시문을 기록합니다.",
    template: "/AI콘티 ",
    aliases: ["ai콘티", "콘티", "ai", "conti", "storyboard"],
  },
]);

export type MentionEntityKind = "character" | "location" | "prop" | "rule";

export interface StoryBibleMentionEntity {
  readonly id: string;
  readonly kind: MentionEntityKind;
  readonly name: string;
  readonly aliases?: readonly string[];
  readonly characterLockId?: string;
  readonly voicePresetId?: string;
  readonly bg3dSetId?: string;
  readonly summary?: string;
}

export interface StoryBibleMentionCatalog {
  readonly entities: readonly StoryBibleMentionEntity[];
}

export interface SlashMentionBinding {
  readonly rawToken: string;
  readonly mentionText: string;
  readonly entityId: string;
  readonly kind: MentionEntityKind;
  readonly name: string;
  readonly characterLockId?: string;
  readonly voicePresetId?: string;
  readonly bg3dSetId?: string;
}

export interface SlashUnresolvedMention {
  readonly lineNumber: number;
  readonly rawToken: string;
  readonly mentionText: string;
}

export type BalloonEmotionPreset =
  | "general"
  | "shout"
  | "thought"
  | "whisper"
  | "narration"
  | "fury";

export interface SlashDialogueSeed {
  readonly id: string;
  readonly speakerId: string | null;
  readonly speakerName: string | null;
  readonly emotion: BalloonEmotionPreset;
  readonly text: string;
  readonly lineNumber: number;
}

export interface SlashSfxSeed {
  readonly id: string;
  readonly text: string;
  readonly presetId: string | null;
  readonly category: SfxCategory | null;
  readonly emphasis: StudioWriterRoomSfx["style"]["emphasis"];
  readonly scale: StudioWriterRoomSfx["style"]["scale"];
  readonly lineNumber: number;
}

export interface SlashVoiceCueSeed {
  readonly speakerId: string | null;
  readonly speakerName: string | null;
  readonly voicePresetId: string | null;
  readonly emotion: string;
  readonly deliveryNote: string;
  readonly lineNumber: number;
}

export interface SlashCutSeed {
  readonly id: string;
  readonly cutNumber: number;
  readonly sceneId: string;
  readonly title: string;
  readonly shot: string;
  readonly lensPreset: "telephoto" | "standard" | "wide" | "ultra-wide";
  readonly location: string;
  readonly time: string;
  readonly bg3dSetId: string | null;
  readonly actions: readonly string[];
  readonly dialogues: readonly SlashDialogueSeed[];
  readonly sfxList: readonly SlashSfxSeed[];
  readonly voiceCues: readonly SlashVoiceCueSeed[];
  readonly aiContiPrompts: readonly string[];
  readonly characterIds: readonly string[];
  readonly characterLockIds: readonly string[];
  readonly locationIds: readonly string[];
  readonly propIds: readonly string[];
  readonly ruleIds: readonly string[];
  readonly mentions: readonly SlashMentionBinding[];
  readonly readinessSlots: CutReadinessSlots;
  readonly startLine: number;
}

export interface SlashSceneSeed {
  readonly id: string;
  readonly order: number;
  readonly heading: string;
  readonly location: string;
  readonly time: string;
  readonly bg3dSetId: string | null;
  readonly cutIds: readonly string[];
  readonly characterIds: readonly string[];
}

export interface SlashScriptDiagnostic {
  readonly severity: "warning" | "error";
  readonly code: "UNKNOWN_SLASH_COMMAND" | "UNRESOLVED_MENTION" | "EMPTY_CUT";
  readonly lineNumber: number;
  readonly message: string;
}

export interface SlashScriptAst {
  readonly episodeTitle: string;
  readonly scenes: readonly SlashSceneSeed[];
  readonly cuts: readonly SlashCutSeed[];
  readonly unresolvedMentions: readonly SlashUnresolvedMention[];
  readonly diagnostics: readonly SlashScriptDiagnostic[];
}

export interface InlineTriggerDetection {
  readonly kind: "slash" | "mention";
  readonly query: string;
  readonly rangeStart: number;
  readonly rangeEnd: number;
}
