/**
 * Plotr 스토리 아틀리에 클린룸 핵심 데이터 모델.
 *
 * 공개 가이드/화면 관찰(REA Evidence)에서 도출한 제작 흐름(아이디어→대본→컷 분해→
 * 인물·배경·소품 일관성 고정→말풍선·효과·화풍→원고 인계)을 ToonStudio 도메인 계약에
 * 맞춰 100% 자체 타입으로 정의한다.
 */
import type { DualSubwayTimelineDocument } from "../studio-dual-subway-timeline";
import type { SpatialStoryBoardDocument } from "../studio-spatial-story-board-canvas";
import type {
  CodexEntityEntry,
  SceneSnapshotRecord,
  ScriptSceneCard,
} from "../../writer-room/studio-scrivenings-snapshot-codex";

export type PlotrOutputFormat =
  | "webtoon"
  | "cuttoon"
  | "print-manga"
  | "video-storyboard";

export type PlotrInputMode = "script" | "webnovel-story";

export type PlotrGenreTemplateId =
  | "rofan"
  | "regression-hunter"
  | "campus-romance"
  | "thriller";

export type PlotrDraftLength = "short" | "medium" | "long";
export type PlotrStoryScope = "oneshot" | "series-ep1";
export type PlotrAssetCategory = "character" | "location" | "prop";
export type PlotrEffectLineKind = "none" | "focus" | "speed" | "fall" | "flash";

export type PlotrArtStylePresetId =
  | "rough"
  | "anime"
  | "anime-3d"
  | "watercolor"
  | "bw-manga"
  | "cinematic"
  | "fantasy-photo"
  | "fantasy-illust"
  | "custom";

export type PlotrCameraSide = "left" | "center" | "right";

export type PlotrCameraFramingId = "closeup" | "bust" | "full" | "high-angle";

export type PlotrLightingMoodId = "sunny" | "sunset" | "rain" | "neon-night";

export type PlotrExpressionLockId = "calm" | "tense" | "angry" | "smile";

export interface PlotrCharacterPalette {
  readonly hairOklch: string;
  readonly eyeOklch: string;
  readonly outfitOklch: string;
  readonly presetLabelKo: string;
}

export interface PlotrCharacterBibleSpec {
  readonly palette: PlotrCharacterPalette;
  readonly expressionLock: PlotrExpressionLockId;
  readonly signatureProp: string;
  readonly silhouetteRule: string;
}

export interface PlotrConsistencyAsset {
  readonly id: string;
  readonly category: PlotrAssetCategory;
  readonly name: string;
  /** 비어 있으면 플로터 스타일의 빈 슬롯(+) 상태로 표시된다. */
  readonly visualNote: string;
  /** OKLCH 시맨틱 포인트 토큰(예: oklch(0.66 0.16 250)). */
  readonly swatchOklch: string;
  readonly costumeOrMaterial: string;
  readonly sourceProjectLabel?: string;
  /** 인물 카테고리 전용 일관성 바이블 설정(옵션 — 기존 스키마 v1 문서와 100% 호환). */
  readonly characterBible?: PlotrCharacterBibleSpec;
}

export interface PlotrCutDialogue {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly kind: "speech" | "narration";
}

export interface PlotrCutCard {
  readonly id: string;
  readonly orderIndex: number;
  readonly sceneTitle: string;
  readonly actionSummary: string;
  readonly dialogues: readonly PlotrCutDialogue[];
  readonly cameraShot: string;
  readonly cameraSide: PlotrCameraSide;
  readonly locationName: string;
  readonly emotionBeat: string;
  /** 0..100 서사 텐션 점수 — 텐션 곡선 SVG 차트에 직결된다. */
  readonly tensionScore: number;
  readonly effectLine: PlotrEffectLineKind;
  readonly sfxText: string;
  readonly referencedAssetIds: readonly string[];
  readonly bubblesApplied: boolean;
  readonly panelBorderEnabled: boolean;
  readonly panelBorderWidthPx: number;
  readonly renderReady: boolean;
  readonly compositionBrief: string;
  /** 비주얼 프리뷰 구도 프리셋(옵션 — 없으면 cameraShot에서 결정론 추론). */
  readonly framingPreset?: PlotrCameraFramingId;
  /** 비주얼 프리뷰 조명 무드(옵션 — 없으면 장면/세계관 문맥에서 결정론 추론). */
  readonly lightingMood?: PlotrLightingMoodId;
  readonly durationSec?: number;
  readonly foreshadowTag?: string;
}

export interface PlotrArtStyleDna {
  readonly presetId: PlotrArtStylePresetId;
  readonly labelKo: string;
  readonly lineWeight: number;
  readonly proportionStyle: "sd" | "webtoon" | "realistic";
  readonly coloringTone: "cel" | "watercolor" | "monochrome" | "cinematic";
  readonly textureGrain: number;
  readonly backgroundAtmosphere: string;
}

export interface PlotrScriptHelperConfig {
  readonly genre: string;
  readonly targetReader: string;
  readonly mood: string;
  readonly scope: PlotrStoryScope;
  readonly length: PlotrDraftLength;
  readonly trendTags: readonly string[];
  readonly logline: string;
  readonly worldSettingNote: string;
}

export interface PlotrBatchQueueState {
  readonly active: boolean;
  readonly cancelled: boolean;
  readonly phase: "idle" | "resolving-assets" | "building-cuts" | "done" | "cancelled";
  readonly pendingAssetIds: readonly string[];
  readonly queuedCutIds: readonly string[];
  readonly completedCutIds: readonly string[];
  readonly concurrency: number;
  readonly statusMessageKo: string;
}

export interface PlotrReverseShotWarning {
  readonly cutId: string;
  readonly previousCutId: string;
  readonly locationName: string;
  readonly messageKo: string;
}

export interface PlotrDocumentState {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly title: string;
  readonly templateId: PlotrGenreTemplateId | null;
  readonly format: PlotrOutputFormat;
  readonly inputMode: PlotrInputMode;
  readonly helper: PlotrScriptHelperConfig;
  readonly rawScript: string;
  readonly assets: readonly PlotrConsistencyAsset[];
  readonly cuts: readonly PlotrCutCard[];
  readonly artStyle: PlotrArtStyleDna;
  readonly customStylePresets: readonly PlotrArtStyleDna[];
  readonly panelBorderEnabled: boolean;
  readonly panelBorderWidthPx: number;
  readonly scenes: readonly ScriptSceneCard[];
  readonly sceneSnapshots: readonly SceneSnapshotRecord[];
  readonly codexEntries: readonly CodexEntityEntry[];
  readonly subwayTimeline: DualSubwayTimelineDocument;
  readonly spatialBoard: SpatialStoryBoardDocument;
  readonly updatedAtIso: string;
}

export const PLOTR_FORMAT_META: Readonly<
  Record<
    PlotrOutputFormat,
    {
      readonly labelKo: string;
      readonly shortKo: string;
      readonly hintKo: string;
      readonly aspectLabel: string;
    }
  >
> = Object.freeze({
  webtoon: Object.freeze({
    labelKo: "웹툰 콘티",
    shortKo: "웹툰",
    hintKo: "세로 스크롤 호흡에 맞춰 컷과 여백을 나눕니다.",
    aspectLabel: "세로 스크롤",
  }),
  cuttoon: Object.freeze({
    labelKo: "컷만화",
    shortKo: "컷만화",
    hintKo: "1:1 정사각·4컷 호흡으로 짧은 장면을 또렷하게 끊습니다.",
    aspectLabel: "1:1 · 4컷",
  }),
  "print-manga": Object.freeze({
    labelKo: "출판만화 콘티",
    shortKo: "출판만화",
    hintKo: "쪽과 칸 단위로 단행본 페이지 구성을 정리합니다.",
    aspectLabel: "쪽 · 칸",
  }),
  "video-storyboard": Object.freeze({
    labelKo: "영상 스토리보드",
    shortKo: "영상",
    hintKo: "샷 크기·앵글·재생 시간(초)을 영상 문법으로 정리합니다.",
    aspectLabel: "16:9 · 샷",
  }),
});

export const PLOTR_EFFECT_LINE_LABELS: Readonly<Record<PlotrEffectLineKind, string>> =
  Object.freeze({
    none: "효과선 없음",
    focus: "집중선",
    speed: "속도선",
    fall: "낙하선",
    flash: "플래시",
  });

export const PLOTR_SFX_PRESETS: readonly string[] = Object.freeze([
  "쾅!",
  "콰앙!",
  "드드득",
  "스윽",
  "두근…",
  "번쩍!",
  "챙—!",
  "휘이잉",
]);

export const PLOTR_ASSET_CATEGORY_LABELS: Readonly<Record<PlotrAssetCategory, string>> =
  Object.freeze({
    character: "인물",
    location: "배경",
    prop: "소품",
  });
