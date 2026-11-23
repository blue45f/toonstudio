/**
 * 한국 실무 웹툰 10단계 컷 분업 표준 파이프라인 정본 카탈로그 및 합성 예시 레코드.
 *
 * - 기존 8단계 파이프라인(`WEBTOON_8_STAGE_PIPELINE`)과 100% 하위 호환(`legacy8StageId` 매핑)
 * - 10단계 표준 공정: `script` → `conti` → `sketch` → `lineart` → `bg3d` →
 *   `flatting` → `shading` → `post-fx` → `lettering` → `pd-qa`
 */

import type { PipelineStageId } from "./studio-governance-catalog";
import { ACADEMY_ROLES_SPRITE_PATHS, type StudioCreatorRoleId } from "./studio-role-catalog";

export type Korean10StageId =
  | "script"
  | "conti"
  | "sketch"
  | "lineart"
  | "bg3d"
  | "flatting"
  | "shading"
  | "post-fx"
  | "lettering"
  | "pd-qa";

export interface Korean10StageSpec {
  readonly id: Korean10StageId;
  readonly order: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly shortLabelKo: string;
  readonly shortLabelEn: string;
  readonly legacy8StageId: PipelineStageId;
  readonly ownerRoles: readonly StudioCreatorRoleId[];
  readonly requiredLayerPrefix: string;
  readonly minWidthPx: number;
  readonly minDpi: number;
  readonly requiresClosedLineart: boolean;
  readonly requiresBiblePalette: boolean;
  readonly defaultSlaHours: number;
  readonly baseCutRateKrw: number;
  readonly autoLocksPreviousStage: boolean;
  readonly spritePath: string;
  readonly handoffSummaryKo: string;
  readonly handoffSummaryEn: string;
}

export interface CutLayerLockState {
  readonly layerId: string;
  readonly layerName: string;
  readonly stageId: Korean10StageId;
  readonly locked: boolean;
  readonly lockMode: "editable" | "read-only";
  readonly lockedReasonKo?: string;
  readonly lockedReasonEn?: string;
}

export interface CutHandoffRecord {
  readonly cutId: string;
  readonly episodeId: string;
  readonly currentStageId: Korean10StageId;
  readonly assigneeId: string;
  readonly assigneeNameKo: string;
  readonly assigneeNameEn?: string;
  readonly layers: readonly CutLayerLockState[];
  readonly widthPx: number;
  readonly dpi: number;
  readonly openLineGapCount: number;
  readonly biblePaletteMatchPercent: number;
  readonly rightsBomPassed: boolean;
  readonly missingRightsBomCount: number;
  readonly baseRateKrw?: number;
  readonly complexityMultiplier?: number;
  readonly rushBonusKrw?: number;
  readonly isFreelanceOutsource?: boolean;
  readonly nextAssigneeNameKo?: string;
  readonly nextAssigneeNameEn?: string;
  readonly handedOffAtIso?: string;
}

export const KOREAN_10STAGE_ORDER: readonly Korean10StageId[] = Object.freeze([
  "script",
  "conti",
  "sketch",
  "lineart",
  "bg3d",
  "flatting",
  "shading",
  "post-fx",
  "lettering",
  "pd-qa",
]);

export const KOREAN_10STAGE_WEBTOON_PIPELINE: readonly Korean10StageSpec[] = Object.freeze([
  {
    id: "script",
    order: 1,
    labelKo: "1. 글작가 · 시나리오",
    labelEn: "1. Script · Story",
    shortLabelKo: "글작가",
    shortLabelEn: "Script",
    legacy8StageId: "conti",
    ownerRoles: ["story"],
    requiredLayerPrefix: "01_SCRIPT_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedLineart: false,
    requiresBiblePalette: false,
    defaultSlaHours: 6,
    baseCutRateKrw: 6_000,
    autoLocksPreviousStage: false,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolMarker,
    handoffSummaryKo: "회차 대본·대사·지문 확정 후 콘티 공정으로 바통 인계",
    handoffSummaryEn: "Locks episode script and dialogue beats before opening storyboard.",
  },
  {
    id: "conti",
    order: 2,
    labelKo: "2. 콘티 · 컷 연출",
    labelEn: "2. Storyboard · Conti",
    shortLabelKo: "콘티",
    shortLabelEn: "Conti",
    legacy8StageId: "conti",
    ownerRoles: ["storyboard"],
    requiredLayerPrefix: "02_CONTI_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedLineart: false,
    requiresBiblePalette: false,
    defaultSlaHours: 8,
    baseCutRateKrw: 12_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolMarker,
    handoffSummaryKo: "스크롤 호흡·말풍선 배치 확정 후 스케치 공정 개방",
    handoffSummaryEn: "Locks vertical pacing and balloon flow before opening rough sketch.",
  },
  {
    id: "sketch",
    order: 3,
    labelKo: "3. 스케치 · 러프",
    labelEn: "3. Rough Sketch",
    shortLabelKo: "스케치",
    shortLabelEn: "Sketch",
    legacy8StageId: "lineart",
    ownerRoles: ["storyboard", "lineart"],
    requiredLayerPrefix: "03_SKETCH_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedLineart: false,
    requiresBiblePalette: false,
    defaultSlaHours: 10,
    baseCutRateKrw: 14_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolVector,
    handoffSummaryKo: "인체 비율·동세·표정 러프 잠금 후 선화 공정 개방",
    handoffSummaryEn: "Locks anatomy, gesture, and expression roughs for clean lineart.",
  },
  {
    id: "lineart",
    order: 4,
    labelKo: "4. 선화 · 펜터치",
    labelEn: "4. Lineart · Inking",
    shortLabelKo: "선화",
    shortLabelEn: "Lineart",
    legacy8StageId: "lineart",
    ownerRoles: ["lineart"],
    requiredLayerPrefix: "04_LINEART_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedLineart: true,
    requiresBiblePalette: false,
    defaultSlaHours: 14,
    baseCutRateKrw: 24_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolGpen,
    handoffSummaryKo: "선화 열린 틈새 0건 검증·자동 잠금 후 3D배경·밑색 공정 인계",
    handoffSummaryEn: "Verifies zero open line gaps, locks lineart read-only, and opens 3D background.",
  },
  {
    id: "bg3d",
    order: 5,
    labelKo: "5. 3D배경 · 원근",
    labelEn: "5. 3D Background",
    shortLabelKo: "3D배경",
    shortLabelEn: "3D BG",
    legacy8StageId: "bg3d-vrm",
    ownerRoles: ["stage3d", "character3d"],
    requiredLayerPrefix: "05_BG3D_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedLineart: false,
    requiresBiblePalette: false,
    defaultSlaHours: 10,
    baseCutRateKrw: 18_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolBg3d,
    handoffSummaryKo: "3D 배경 렌더·상업 Rights BOM 검증 후 밑색/플랫팅 개방",
    handoffSummaryEn: "Verifies 3D background renders and Rights BOM before flatting.",
  },
  {
    id: "flatting",
    order: 6,
    labelKo: "6. 밑색 · 플랫팅",
    labelEn: "6. Flatting · Base Color",
    shortLabelKo: "밑색",
    shortLabelEn: "Flatting",
    legacy8StageId: "flatting",
    ownerRoles: ["flatting"],
    requiredLayerPrefix: "06_FLAT_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedLineart: true,
    requiresBiblePalette: true,
    defaultSlaHours: 8,
    baseCutRateKrw: 15_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolFill,
    handoffSummaryKo: "닫힌 영역 누수 0건·캐릭터 바이블 팔레트 검증 후 명암/채색 인계",
    handoffSummaryEn: "Checks closed fills and character bible palette before shading.",
  },
  {
    id: "shading",
    order: 7,
    labelKo: "7. 명암 · 채색",
    labelEn: "7. Shading · Rendering",
    shortLabelKo: "명암",
    shortLabelEn: "Shading",
    legacy8StageId: "shading",
    ownerRoles: ["shading"],
    requiredLayerPrefix: "07_SHADE_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedLineart: false,
    requiresBiblePalette: true,
    defaultSlaHours: 12,
    baseCutRateKrw: 22_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolWatercolor,
    handoffSummaryKo: "광원·명암 레이어 잠금 후 후보정/이펙트 공정 개방",
    handoffSummaryEn: "Locks lighting and shading passes before opening post-FX.",
  },
  {
    id: "post-fx",
    order: 8,
    labelKo: "8. 후보정 · 이펙트",
    labelEn: "8. Post-FX · Lighting",
    shortLabelKo: "후보정",
    shortLabelEn: "Post-FX",
    legacy8StageId: "post-fx",
    ownerRoles: ["vfx"],
    requiredLayerPrefix: "08_POSTFX_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedLineart: false,
    requiresBiblePalette: false,
    defaultSlaHours: 6,
    baseCutRateKrw: 14_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolScreentone,
    handoffSummaryKo: "블룸·대기광·이펙트 마감 잠금 후 식자/SFX 공정 인계",
    handoffSummaryEn: "Locks bloom, atmosphere, and VFX overlays before lettering.",
  },
  {
    id: "lettering",
    order: 9,
    labelKo: "9. 식자 · SFX",
    labelEn: "9. Lettering · SFX",
    shortLabelKo: "식자/SFX",
    shortLabelEn: "Lettering",
    legacy8StageId: "lettering-loc",
    ownerRoles: ["lettering", "localization"],
    requiredLayerPrefix: "09_LETTERING_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedLineart: false,
    requiresBiblePalette: false,
    defaultSlaHours: 6,
    baseCutRateKrw: 13_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolBubbleSfx,
    handoffSummaryKo: "폰트 Rights BOM·말풍선·의성어 검증 후 PD 검수/출고 인계",
    handoffSummaryEn: "Verifies font licenses, balloons, and SFX before PD QA.",
  },
  {
    id: "pd-qa",
    order: 10,
    labelKo: "10. PD검수 · 출고",
    labelEn: "10. PD QA · Delivery",
    shortLabelKo: "PD검수",
    shortLabelEn: "PD QA",
    legacy8StageId: "final-bom",
    ownerRoles: ["producer", "video"],
    requiredLayerPrefix: "10_PDQA_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedLineart: false,
    requiresBiblePalette: true,
    defaultSlaHours: 4,
    baseCutRateKrw: 10_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemProduction,
    handoffSummaryKo: "최종 Rights BOM·플랫폼 슬라이스·출고 잠금 완료",
    handoffSummaryEn: "Finalizes Rights BOM, platform slicing, and commercial release lock.",
  },
]);

/** UI 시뮬레이션 및 단위 검증용 합성 10단계 컷 예시(실제 고객 데이터 아님). */
export const SAMPLE_KOREAN_10STAGE_CUT_RECORDS: readonly CutHandoffRecord[] = Object.freeze([
  {
    cutId: "CUT-14-001",
    episodeId: "EP-14",
    currentStageId: "lineart",
    assigneeId: "ext-ink-01",
    assigneeNameKo: "서연(선화 외주)",
    assigneeNameEn: "Seoyeon (Lineart)",
    layers: [
      { layerId: "l-script", layerName: "01_SCRIPT_BEATS", stageId: "script", locked: true, lockMode: "read-only" },
      { layerId: "l-conti", layerName: "02_CONTI_PANEL", stageId: "conti", locked: true, lockMode: "read-only" },
      { layerId: "l-sketch", layerName: "03_SKETCH_ROUGH", stageId: "sketch", locked: false, lockMode: "editable" },
      { layerId: "l-line", layerName: "04_LINEART_MAIN", stageId: "lineart", locked: false, lockMode: "editable" },
    ],
    widthPx: 1600,
    dpi: 350,
    openLineGapCount: 0,
    biblePaletteMatchPercent: 99,
    rightsBomPassed: true,
    missingRightsBomCount: 0,
    complexityMultiplier: 1.0,
    isFreelanceOutsource: true,
    nextAssigneeNameKo: "도윤(3D배경)",
    nextAssigneeNameEn: "Doyoon (3D BG)",
  },
  {
    cutId: "CUT-14-002",
    episodeId: "EP-14",
    currentStageId: "flatting",
    assigneeId: "ext-flat-01",
    assigneeNameKo: "민수(밑색 어시)",
    assigneeNameEn: "Minsu (Flatting)",
    layers: [
      { layerId: "l-line-2", layerName: "04_LINEART_MAIN", stageId: "lineart", locked: true, lockMode: "read-only" },
      { layerId: "l-bg-2", layerName: "05_BG3D_CAFE", stageId: "bg3d", locked: true, lockMode: "read-only" },
      { layerId: "l-flat-2", layerName: "06_FLAT_CHAR", stageId: "flatting", locked: false, lockMode: "editable" },
    ],
    widthPx: 1600,
    dpi: 300,
    openLineGapCount: 0,
    biblePaletteMatchPercent: 98,
    rightsBomPassed: true,
    missingRightsBomCount: 0,
    complexityMultiplier: 1.0,
    isFreelanceOutsource: true,
    nextAssigneeNameKo: "지아(명암)",
    nextAssigneeNameEn: "Jia (Shading)",
  },
  {
    cutId: "CUT-14-003",
    episodeId: "EP-14",
    currentStageId: "bg3d",
    assigneeId: "ext-bg3d-01",
    assigneeNameKo: "아크3D(배경 외주)",
    assigneeNameEn: "Arc3D (Background)",
    layers: [
      { layerId: "l-line-3", layerName: "04_LINEART_MAIN", stageId: "lineart", locked: true, lockMode: "read-only" },
      { layerId: "l-bg-3", layerName: "05_BG3D_STREET", stageId: "bg3d", locked: false, lockMode: "editable" },
    ],
    widthPx: 1600,
    dpi: 300,
    openLineGapCount: 0,
    biblePaletteMatchPercent: 96,
    rightsBomPassed: false,
    missingRightsBomCount: 1,
    complexityMultiplier: 1.25,
    isFreelanceOutsource: true,
    nextAssigneeNameKo: "민수(밑색)",
    nextAssigneeNameEn: "Minsu (Flatting)",
  },
]);
