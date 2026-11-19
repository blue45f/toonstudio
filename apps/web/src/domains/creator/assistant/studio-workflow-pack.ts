import type { SkinToneId } from "./webtoon-color-harmony-assistant";
import type { PerspectiveGuidePreset } from "./webtoon-croquis-pose-guide";
import type { PomodoroMode, WebtoonProductionStage } from "./webtoon-focus-timer";
import type { WebtoonPlatformId } from "./webtoon-platform-spec-validator";
import type { ReaderScrollSpeedProfile } from "./webtoon-scroll-pacing-simulator";

export type WorkflowPackLicenseCode = "CC0" | "MIT" | "COMMERCIAL" | "CC-BY-NC" | "GPL-3.0";

export type WorkflowPackLockableField =
  | "platformId"
  | "skinToneId"
  | "perspectivePreset"
  | "readerSpeed";

export interface StudioWorkflowPackTeamPolicy {
  readonly teamLabel: string;
  readonly lockedFields: readonly WorkflowPackLockableField[];
  readonly requireCommercialClearance: boolean;
}

export interface StudioWorkflowPackRightsEntry {
  readonly assetLabel: string;
  readonly license: WorkflowPackLicenseCode;
}

export interface StudioWorkflowPack {
  readonly schemaVersion: 1 | 2;
  readonly id: string;
  readonly name: string;
  readonly genre: string;
  readonly summary: string;
  readonly platformId: WebtoonPlatformId;
  readonly skinToneId: SkinToneId;
  readonly perspectivePreset: PerspectiveGuidePreset;
  readonly focusStage: WebtoonProductionStage;
  readonly focusPreset: PomodoroMode;
  readonly readerSpeed: ReaderScrollSpeedProfile;
  readonly rightsBom: readonly StudioWorkflowPackRightsEntry[];
  /** schemaVersion 2 선택 필드: BG3D 기본 라이팅 프리셋 ID */
  readonly bg3dLightingPresetId?: string;
  /** schemaVersion 2 선택 필드: 2D 대표 브러시 슬롯 ID */
  readonly primaryBrushSlotId?: string;
  /** schemaVersion 2 선택 필드: 팀 스튜디오 강제 규약(Team Policy Lock) */
  readonly teamPolicyLock?: StudioWorkflowPackTeamPolicy;
}

export interface StudioWorkflowPackRightsClearance {
  readonly clearedForCommercialExport: boolean;
  readonly blockedLicenses: readonly WorkflowPackLicenseCode[];
  readonly summary: string;
}

const RESTRICTED_COMMERCIAL_LICENSES: ReadonlySet<WorkflowPackLicenseCode> = new Set([
  "CC-BY-NC",
  "GPL-3.0",
]);

export const BUILTIN_STUDIO_WORKFLOW_PACKS: readonly StudioWorkflowPack[] = [
  {
    schemaVersion: 2,
    id: "rofan-episode1-starter",
    name: "로맨스판타지 1화 세팅 팩",
    genre: "로맨스판타지",
    summary: "화사한 피부톤 팔레트, 네이버 웹툰 규격, 하이앵글 궁전 구도와 50분 몰입 리듬을 한 번에 적용합니다.",
    platformId: "naver-webtoon",
    skinToneId: "warm-fair",
    perspectivePreset: "high-angle",
    focusStage: "background-3d",
    focusPreset: "deep-flow-50",
    readerSpeed: "immersive",
    bg3dLightingPresetId: "palace-golden-hour",
    primaryBrushSlotId: "g-pen-crisp",
    rightsBom: [
      { assetLabel: "궁전 복도 파라메트릭 3D 조명 프리셋", license: "CC0" },
      { assetLabel: "로판 한글 식자 스타일 세트", license: "COMMERCIAL" },
    ],
  },
  {
    schemaVersion: 2,
    id: "modern-romance-daily",
    name: "현대 로맨스 · 일상 컷 팩",
    genre: "현대 로맨스",
    summary: "부드러운 피치 톤, 아이레벨 대화 구도, 표준 독자 스크롤 속도와 25분 집중 사이클로 정리합니다.",
    platformId: "kakao-page",
    skinToneId: "blush-peach",
    perspectivePreset: "eye-level",
    focusStage: "storyboard",
    focusPreset: "standard-25",
    readerSpeed: "casual",
    bg3dLightingPresetId: "cafe-soft-daylight",
    primaryBrushSlotId: "soft-pencil-rough",
    rightsBom: [
      { assetLabel: "카페·오피스 기본 라이팅 프로파일", license: "CC0" },
      { assetLabel: "일상 말풍선·의성어 프리셋", license: "MIT" },
    ],
  },
  {
    schemaVersion: 2,
    id: "action-noir-3d-stage",
    name: "액션 · 느와르 3D 연출 팩",
    genre: "액션 / 느와르",
    summary: "역동적인 로우앵글 투시, 빠른 정주행 페이싱, 레진 규격과 15분 스프린트 마감 모드로 전환합니다.",
    platformId: "lezhin-comics",
    skinToneId: "sun-kissed-tan",
    perspectivePreset: "low-angle",
    focusStage: "lineart",
    focusPreset: "sprint-15",
    readerSpeed: "skimmer",
    bg3dLightingPresetId: "noir-rim-backlit",
    primaryBrushSlotId: "ink-brush-dynamic",
    rightsBom: [
      { assetLabel: "느와르 역광 Live Ink 프리셋", license: "CC0" },
      { assetLabel: "액션 타격 효과음 번들", license: "COMMERCIAL" },
    ],
  },
  {
    schemaVersion: 2,
    id: "global-canvas-shortform",
    name: "글로벌 캔버스 · 숏폼 세팅 팩",
    genre: "글로벌 연재",
    summary: "WEBTOON Canvas 규격, 더치 틸트 훅 구도, 쿨톤 팔레트로 첫 3컷 이탈을 줄이는 세팅입니다.",
    platformId: "webtoon-canvas",
    skinToneId: "cool-pale",
    perspectivePreset: "dutch-tilt",
    focusStage: "finishing-sfx",
    focusPreset: "standard-25",
    readerSpeed: "skimmer",
    bg3dLightingPresetId: "studio-cool-neutral",
    primaryBrushSlotId: "clean-mono-liner",
    rightsBom: [
      { assetLabel: "글로벌 세로 스크롤 여백 가이드", license: "MIT" },
    ],
  },
];

/**
 * 워크플로우 팩에 포함된 에셋 라이선스가 상업 연재/내보내기 기준(Rights BOM)을 통과하는지 판정한다.
 * NC(비상업) 또는 GPL 계열 항목이 하나라도 있으면 상업 내보내기 경고를 반환한다.
 */
export function evaluateWorkflowPackRightsClearance(
  pack: StudioWorkflowPack,
): StudioWorkflowPackRightsClearance {
  const blocked = pack.rightsBom
    .map((entry) => entry.license)
    .filter((license) => RESTRICTED_COMMERCIAL_LICENSES.has(license));
  const uniqueBlocked = [...new Set(blocked)];

  if (uniqueBlocked.length > 0) {
    return {
      clearedForCommercialExport: false,
      blockedLicenses: uniqueBlocked,
      summary: `상업 내보내기 전 확인 필요 (${uniqueBlocked.join(", ")} 라이선스 포함)`,
    };
  }

  return {
    clearedForCommercialExport: true,
    blockedLicenses: [],
    summary: `상업 연재 클린 (${pack.rightsBom.length}개 항목 Rights BOM 통과)`,
  };
}

export function serializeStudioWorkflowPack(pack: StudioWorkflowPack): string {
  return JSON.stringify(pack, null, 2);
}

const VALID_PLATFORMS = new Set<WebtoonPlatformId>([
  "naver-webtoon",
  "kakao-page",
  "lezhin-comics",
  "webtoon-canvas",
]);
const VALID_SKIN_TONES = new Set<SkinToneId>([
  "warm-fair",
  "cool-pale",
  "blush-peach",
  "sun-kissed-tan",
  "dark-rich",
]);
const VALID_PERSPECTIVES = new Set<PerspectiveGuidePreset>([
  "eye-level",
  "low-angle",
  "high-angle",
  "dutch-tilt",
]);
const VALID_STAGES = new Set<WebtoonProductionStage>([
  "storyboard",
  "draft",
  "lineart",
  "flat-color",
  "background-3d",
  "finishing-sfx",
]);
const VALID_MODES = new Set<PomodoroMode>(["standard-25", "deep-flow-50", "sprint-15"]);
const VALID_SPEEDS = new Set<ReaderScrollSpeedProfile>(["skimmer", "casual", "immersive"]);
const VALID_LICENSES = new Set<WorkflowPackLicenseCode>([
  "CC0",
  "MIT",
  "COMMERCIAL",
  "CC-BY-NC",
  "GPL-3.0",
]);
const VALID_LOCK_FIELDS = new Set<WorkflowPackLockableField>([
  "platformId",
  "skinToneId",
  "perspectivePreset",
  "readerSpeed",
]);

function parseOptionalTeamPolicy(raw: unknown): StudioWorkflowPackTeamPolicy | undefined | null {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.teamLabel !== "string" || candidate.teamLabel.trim().length === 0) return null;
  if (typeof candidate.requireCommercialClearance !== "boolean") return null;
  if (!Array.isArray(candidate.lockedFields)) return null;
  const lockedFields: WorkflowPackLockableField[] = [];
  for (const field of candidate.lockedFields) {
    if (!VALID_LOCK_FIELDS.has(field as WorkflowPackLockableField)) return null;
    lockedFields.push(field as WorkflowPackLockableField);
  }
  return {
    teamLabel: candidate.teamLabel.trim(),
    lockedFields: [...new Set(lockedFields)],
    requireCommercialClearance: candidate.requireCommercialClearance,
  };
}

export function parseStudioWorkflowPack(raw: string): StudioWorkflowPack | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Record<string, unknown>;
    if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) return null;
    if (typeof candidate.id !== "string" || candidate.id.trim().length === 0) return null;
    if (typeof candidate.name !== "string" || candidate.name.trim().length === 0) return null;
    if (typeof candidate.genre !== "string" || typeof candidate.summary !== "string") return null;
    if (!VALID_PLATFORMS.has(candidate.platformId as WebtoonPlatformId)) return null;
    if (!VALID_SKIN_TONES.has(candidate.skinToneId as SkinToneId)) return null;
    if (!VALID_PERSPECTIVES.has(candidate.perspectivePreset as PerspectiveGuidePreset)) return null;
    if (!VALID_STAGES.has(candidate.focusStage as WebtoonProductionStage)) return null;
    if (!VALID_MODES.has(candidate.focusPreset as PomodoroMode)) return null;
    if (!VALID_SPEEDS.has(candidate.readerSpeed as ReaderScrollSpeedProfile)) return null;
    if (!Array.isArray(candidate.rightsBom)) return null;

    const rightsBom: StudioWorkflowPackRightsEntry[] = [];
    for (const item of candidate.rightsBom) {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      if (typeof entry.assetLabel !== "string" || entry.assetLabel.trim().length === 0) return null;
      if (!VALID_LICENSES.has(entry.license as WorkflowPackLicenseCode)) return null;
      rightsBom.push({
        assetLabel: entry.assetLabel.trim(),
        license: entry.license as WorkflowPackLicenseCode,
      });
    }

    const teamPolicyLock = parseOptionalTeamPolicy(candidate.teamPolicyLock);
    if (teamPolicyLock === null) return null;

    const bg3dLightingPresetId =
      typeof candidate.bg3dLightingPresetId === "string" && candidate.bg3dLightingPresetId.trim().length > 0
        ? candidate.bg3dLightingPresetId.trim()
        : undefined;
    const primaryBrushSlotId =
      typeof candidate.primaryBrushSlotId === "string" && candidate.primaryBrushSlotId.trim().length > 0
        ? candidate.primaryBrushSlotId.trim()
        : undefined;

    return {
      schemaVersion: candidate.schemaVersion,
      id: candidate.id.trim(),
      name: candidate.name.trim(),
      genre: candidate.genre.trim(),
      summary: candidate.summary.trim(),
      platformId: candidate.platformId as WebtoonPlatformId,
      skinToneId: candidate.skinToneId as SkinToneId,
      perspectivePreset: candidate.perspectivePreset as PerspectiveGuidePreset,
      focusStage: candidate.focusStage as WebtoonProductionStage,
      focusPreset: candidate.focusPreset as PomodoroMode,
      readerSpeed: candidate.readerSpeed as ReaderScrollSpeedProfile,
      rightsBom,
      ...(bg3dLightingPresetId ? { bg3dLightingPresetId } : {}),
      ...(primaryBrushSlotId ? { primaryBrushSlotId } : {}),
      ...(teamPolicyLock ? { teamPolicyLock } : {}),
    };
  } catch {
    return null;
  }
}
