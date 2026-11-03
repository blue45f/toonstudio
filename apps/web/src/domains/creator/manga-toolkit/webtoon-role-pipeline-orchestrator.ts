/**
 * webtoon-role-pipeline-orchestrator.ts
 *
 * REA 역공학 기반 웹툰·만화 8단계 직군 세분화(글작가·각색작가·보조 글작가·콘티작가·3D 배경작가·
 * 배경 어시스턴트·선화작가·선화 어시스턴트·밑색 어시스턴트·명암 어시스턴트·효과/무빙툰 어시스턴트·
 * 식자 디자이너·식자 어시스턴트·편집자/PD), 직군별 맞춤 메뉴 구성, 레이어 그룹 최소권한(RBAC) 잠금
 * 및 원클릭 공정 인계(1-Click Stage Handoff) 오케스트레이터.
 */

import { creatorRoleWorkspacePreset } from "../creator-role-workspace-presets";
import type { StudioDefaultWorkspaceId } from "../studio-workspaces";

import {
  creatorRoleDefinition,
  creatorText,
  type CreatorRoleId,
} from "@/shared/lib/creator-role-contract";

export type WebtoonPipelineStageId =
  | "story-script"
  | "storyboard-conte"
  | "bg3d-spatial"
  | "line-art-ink"
  | "flat-color-mask"
  | "shading-fx-post"
  | "lettering-sfx"
  | "pd-editorial-review";

export type WebtoonCanonicalLayerGroupId =
  | "story-notes"
  | "dialogue-draft"
  | "storyboard"
  | "panel-frame"
  | "camera-guide"
  | "background-3d"
  | "background-line"
  | "background-tone"
  | "main-lineart"
  | "assistant-line"
  | "flat-color"
  | "color-mask"
  | "shading"
  | "fx-overlay"
  | "balloon"
  | "dialogue-text"
  | "sfx-typography"
  | "review-annotation";

export interface WebtoonCanonicalLayerGroupSpec {
  readonly id: WebtoonCanonicalLayerGroupId;
  readonly labelKo: string;
  readonly stageId: WebtoonPipelineStageId;
  readonly descriptionKo: string;
}

export const WEBTOON_CANONICAL_LAYER_GROUPS: readonly WebtoonCanonicalLayerGroupSpec[] =
  Object.freeze([
    {
      id: "story-notes",
      labelKo: "원작·플롯·세계관 노트",
      stageId: "story-script",
      descriptionKo: "글작가·각색작가의 회차 플롯 및 캐릭터 설정 시트",
    },
    {
      id: "dialogue-draft",
      labelKo: "StoryLock 대본 초안",
      stageId: "story-script",
      descriptionKo: "장면·컷별 확정 대사 및 지문 원문",
    },
    {
      id: "storyboard",
      labelKo: "러프 콘티·연출 스케치",
      stageId: "storyboard-conte",
      descriptionKo: "컷 구도·시선 유도·인물 동선 러프 데생",
    },
    {
      id: "panel-frame",
      labelKo: "패널 프레임·컷 여백(Gutter)",
      stageId: "storyboard-conte",
      descriptionKo: "세로 스트립 컷 테두리 및 호흡 간격(action~timeSkip)",
    },
    {
      id: "camera-guide",
      labelKo: "카메라·투시 그리드 가이드",
      stageId: "storyboard-conte",
      descriptionKo: "2점 투시 수평선 및 앵글 가이드",
    },
    {
      id: "background-3d",
      labelKo: "3D 공간 모델러 배치 레이어",
      stageId: "bg3d-spatial",
      descriptionKo: "공간 모델러 3D 세트·동적 구성요소·태양광 스냅샷",
    },
    {
      id: "background-line",
      labelKo: "배경 LT 선화 레이어",
      stageId: "bg3d-spatial",
      descriptionKo: "3D 세트에서 추출한 주선·질감선 레이어",
    },
    {
      id: "background-tone",
      labelKo: "배경 스크린톤·태양 그림자",
      stageId: "bg3d-spatial",
      descriptionKo: "3D LT 할프톤·그림자 Multiply·공기원근 안개",
    },
    {
      id: "main-lineart",
      labelKo: "주연 캐릭터 메인 원화 선화",
      stageId: "line-art-ink",
      descriptionKo: "메인 선화 작가 전용 캐릭터 원화·표정 펜선",
    },
    {
      id: "assistant-line",
      labelKo: "선화 어시스턴트 클린업·소품 선화",
      stageId: "line-art-ink",
      descriptionKo: "선화 어시스턴트용 의상 주름·소품·모브 펜터치",
    },
    {
      id: "flat-color",
      labelKo: "밑색(Flat Color) 채우기",
      stageId: "flat-color-mask",
      descriptionKo: "밑색 어시스턴트 전용 선화 참조 닫힌 영역 채우기",
    },
    {
      id: "color-mask",
      labelKo: "파츠별 색분할 마스크",
      stageId: "flat-color-mask",
      descriptionKo: "피부·헤어·의상별 분리 클리핑 마스크",
    },
    {
      id: "shading",
      labelKo: "셀 명암·하이라이트·림라이트",
      stageId: "shading-fx-post",
      descriptionKo: "명암·채색 어시스턴트용 클리핑 셀 셰이딩 및 역광",
    },
    {
      id: "fx-overlay",
      labelKo: "이펙트·후보정·무빙툰 모션",
      stageId: "shading-fx-post",
      descriptionKo: "효과 어시스턴트용 집중선·파티클·ABLE 색보정·무빙툰 트리거",
    },
    {
      id: "balloon",
      labelKo: "말풍선·꼬리 벡터 레이어",
      stageId: "lettering-sfx",
      descriptionKo: "일반·외침·속마음·사각 나레이션 말풍선 도형",
    },
    {
      id: "dialogue-text",
      labelKo: "대사 타이포그래피 레이어",
      stageId: "lettering-sfx",
      descriptionKo: "식자 디자이너 전용 대사 텍스트 및 다국어 식자",
    },
    {
      id: "sfx-typography",
      labelKo: "효과음(SFX) 레터링 레이어",
      stageId: "lettering-sfx",
      descriptionKo: "식자·효과음 어시스턴트용 손글씨/벡터 효과음",
    },
    {
      id: "review-annotation",
      labelKo: "PD·편집자 검수 Redline 주석",
      stageId: "pd-editorial-review",
      descriptionKo: "편집자·PD 검수 피드백 핀 및 최종 승인 서명",
    },
  ]);

export interface WebtoonPipelineStageSpec {
  readonly id: WebtoonPipelineStageId;
  readonly stepNumber: number;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly primaryRoles: readonly CreatorRoleId[];
  readonly workspaceId: StudioDefaultWorkspaceId;
  readonly ownedLayerGroups: readonly WebtoonCanonicalLayerGroupId[];
  readonly competitorBenchmarks: readonly string[];
  readonly tailoredMenusKo: readonly string[];
}

export const WEBTOON_E2E_ROLE_PIPELINE_STAGES: readonly WebtoonPipelineStageSpec[] =
  Object.freeze([
    {
      id: "story-script",
      stepNumber: 1,
      labelKo: "1단계 · 원작·글·각색 대본",
      summaryKo: "글작가·각색작가·보조 글작가가 듀얼페인 세계관 시트와 대본을 집필하고 잠급니다.",
      primaryRoles: ["story", "adaptation", "associate-writer", "planner"],
      workspaceId: "storyboard",
      ownedLayerGroups: ["story-notes", "dialogue-draft"],
      competitorBenchmarks: ["Scrivener", "NovelAI Lorebook", "Celtx", "Obsidian"],
      tailoredMenusKo: ["듀얼페인 대본·로어북", "캐릭터 6인 시트 잠금", "CJK 단어 예산 측정", "원작-각색 비교"],
    },
    {
      id: "storyboard-conte",
      stepNumber: 2,
      labelKo: "2단계 · 콘티·세로 스트립 연출",
      summaryKo: "콘티·연출작가가 대본을 세로 스크롤 컷과 호흡 간격(WT-*)으로 스테이징합니다.",
      primaryRoles: ["storyboard", "creator", "associate-artist"],
      workspaceId: "storyboard",
      ownedLayerGroups: ["storyboard", "panel-frame", "camera-guide"],
      competitorBenchmarks: ["Higgsfield Mangaka", "Storyboarder", "Clip Studio EX Story"],
      tailoredMenusKo: ["Mangaka 세로 스트립 스테이징", "6종 컷 간격 리듬", "카메라 샷 생성기", "말풍선 사전 배치"],
    },
    {
      id: "bg3d-spatial",
      stepNumber: 3,
      labelKo: "3단계 · 3D 공간 배경·LT 추출",
      summaryKo: "3D 배경작가·배경 어시스턴트가 2점 투시·단면 컷어웨이·태양광과 6패스 LT를 추출합니다.",
      primaryRoles: ["background", "three-d", "background-assistant"],
      workspaceId: "pose-3d",
      ownedLayerGroups: ["background-3d", "background-line", "background-tone"],
      competitorBenchmarks: ["SketchUp", "ACON3D", "Snaptoon", "Blender Grease Pencil"],
      tailoredMenusKo: ["Push/Pull 개구부·몰딩", "2점 투시 수직 잠금", "그림자 보존 실내 단면", "1-Click 6패스 LT 추출"],
    },
    {
      id: "line-art-ink",
      stepNumber: 4,
      labelKo: "4단계 · 메인 선화·펜터치 클린업",
      summaryKo: "선화작가가 주연 원화를 그리고 선화 어시스턴트가 의상·소품·모브 선화를 분담합니다.",
      primaryRoles: ["line-art", "character", "line-assistant", "assistant"],
      workspaceId: "csp-migration",
      ownedLayerGroups: ["main-lineart", "assistant-line"],
      competitorBenchmarks: ["Clip Studio Paint EX", "Procreate", "PaintTool SAI"],
      tailoredMenusKo: ["주연 원화 보호 잠금", "벡터 교차점 지우개", "선화 손떨림 보정", "Sub View 레퍼런스"],
    },
    {
      id: "flat-color-mask",
      stepNumber: 5,
      labelKo: "5단계 · 밑색·파츠 색분할 마스크",
      summaryKo: "밑색 어시스턴트가 메인 선화를 훼손하지 않고 닫힌 영역 채우기와 파츠 마스크를 완성합니다.",
      primaryRoles: ["flat-color-assistant"],
      workspaceId: "photo-edit",
      ownedLayerGroups: ["flat-color", "color-mask"],
      competitorBenchmarks: ["Clip Studio Paint Colorize", "Krita Colorize Mask", "ibisPaint"],
      tailoredMenusKo: ["선화 참조 틈새 닫기 채우기", "캐릭터 지정 컬러칩 잠금", "피부·헤어·의상 자동 분리", "미채색 픽셀 검출"],
    },
    {
      id: "shading-fx-post",
      stepNumber: 6,
      labelKo: "6단계 · 명암·이펙트·무빙툰 후보정",
      summaryKo: "채색·명암·효과 어시스턴트가 셀 셰이딩, ABLE 색보정, Rive/Spine 무빙툰 효과를 입힙니다.",
      primaryRoles: ["color", "shading-assistant", "effect-assistant"],
      workspaceId: "photo-edit",
      ownedLayerGroups: ["shading", "fx-overlay"],
      competitorBenchmarks: ["Adobe Photoshop", "ACON3D ABLE", "Rebelle", "Rive / Spine"],
      tailoredMenusKo: ["밑색 클리핑 셀 명암", "ABLE 발광·공기원근 필터", "집중선·스피드선 생성기", "무빙툰 상태머신 바인딩"],
    },
    {
      id: "lettering-sfx",
      stepNumber: 7,
      labelKo: "7단계 · 식자·타이포·효과음(SFX)",
      summaryKo: "식자 디자이너·어시스턴트가 대사를 흘려넣고 얼굴 침범 없는 말풍선과 효과음을 완성합니다.",
      primaryRoles: ["lettering", "lettering-assistant", "localization"],
      workspaceId: "vector-design",
      ownedLayerGroups: ["balloon", "dialogue-text", "sfx-typography"],
      competitorBenchmarks: ["Higgsfield Mangaka Lettering", "Figma", "WEBTOON Localization"],
      tailoredMenusKo: ["얼굴 회피 말풍선 배치", "22px 최소 가독성 검증", "장르별 한글 폰트 페어링", "다국어 식자 치환"],
    },
    {
      id: "pd-editorial-review",
      stepNumber: 8,
      labelKo: "8단계 · 편집·PD 검수 및 포털 슬라이스 승인",
      summaryKo: "편집자·PD·검수자가 WT-* 22개 규칙과 8대 포털 슬라이스를 검증하고 최종본을 동결합니다.",
      primaryRoles: ["editor", "producer", "reviewer", "educator"],
      workspaceId: "review",
      ownedLayerGroups: ["review-annotation"],
      competitorBenchmarks: ["CGWire Kitsu", "Linear", "Frame.io", "WEBTOON Canvas QA"],
      tailoredMenusKo: ["WT-* 22규칙 자동 프리플라이트", "컷별 Redline 피드백 핀", "8대 포털 안전 슬라이스", "최종 승인 잠금(Freeze)"],
    },
  ]);

const ROLE_TO_STAGE_MAP: Readonly<Record<CreatorRoleId, WebtoonPipelineStageId>> = Object.freeze({
  story: "story-script",
  adaptation: "story-script",
  "associate-writer": "story-script",
  planner: "story-script",
  storyboard: "storyboard-conte",
  creator: "storyboard-conte",
  "associate-artist": "storyboard-conte",
  background: "bg3d-spatial",
  "three-d": "bg3d-spatial",
  "background-assistant": "bg3d-spatial",
  "line-art": "line-art-ink",
  character: "line-art-ink",
  "line-assistant": "line-art-ink",
  assistant: "line-art-ink",
  "flat-color-assistant": "flat-color-mask",
  color: "shading-fx-post",
  "shading-assistant": "shading-fx-post",
  "effect-assistant": "shading-fx-post",
  lettering: "lettering-sfx",
  "lettering-assistant": "lettering-sfx",
  localization: "lettering-sfx",
  editor: "pd-editorial-review",
  producer: "pd-editorial-review",
  reviewer: "pd-editorial-review",
  educator: "pd-editorial-review",
});

/** 세부 직군별 정밀 허용 레이어 그룹 (어시스턴트는 메인 원화/대본 원문 수정 불가) */
const ROLE_ALLOWED_LAYER_GROUPS: Readonly<
  Record<CreatorRoleId, readonly WebtoonCanonicalLayerGroupId[]>
> = Object.freeze({
  creator: WEBTOON_CANONICAL_LAYER_GROUPS.map((g) => g.id),
  story: ["story-notes", "dialogue-draft", "review-annotation"],
  adaptation: ["story-notes", "dialogue-draft", "storyboard", "panel-frame"],
  "associate-writer": ["story-notes", "dialogue-draft"],
  planner: ["story-notes", "review-annotation"],
  storyboard: ["storyboard", "panel-frame", "camera-guide", "dialogue-draft", "balloon"],
  "associate-artist": ["storyboard", "panel-frame", "camera-guide", "assistant-line"],
  background: ["background-3d", "background-line", "background-tone", "camera-guide"],
  "three-d": ["background-3d", "background-line", "background-tone", "camera-guide"],
  "background-assistant": ["background-3d", "background-line", "background-tone"],
  "line-art": ["main-lineart", "assistant-line", "storyboard"],
  character: ["main-lineart", "assistant-line", "flat-color", "color-mask"],
  "line-assistant": ["assistant-line"],
  assistant: ["assistant-line", "flat-color", "color-mask", "background-tone"],
  "flat-color-assistant": ["flat-color", "color-mask"],
  color: ["flat-color", "color-mask", "shading", "fx-overlay", "background-tone"],
  "shading-assistant": ["shading"],
  "effect-assistant": ["fx-overlay", "sfx-typography"],
  lettering: ["balloon", "dialogue-text", "sfx-typography"],
  "lettering-assistant": ["balloon", "sfx-typography"],
  localization: ["dialogue-text", "sfx-typography"],
  editor: ["review-annotation", "dialogue-draft", "dialogue-text"],
  producer: ["review-annotation", "story-notes"],
  reviewer: ["review-annotation"],
  educator: ["review-annotation", "story-notes", "storyboard"],
});

export interface ResolvedRolePipelinePreset {
  readonly roleId: CreatorRoleId;
  readonly roleLabelKo: string;
  readonly stage: WebtoonPipelineStageSpec;
  readonly nextStage: WebtoonPipelineStageSpec | null;
  readonly workspaceId: StudioDefaultWorkspaceId;
  readonly recommendedCommandBarSlots: readonly string[];
  readonly familiarTools: readonly string[];
  readonly tailoredMenusKo: readonly string[];
  readonly allowedLayerGroups: readonly WebtoonCanonicalLayerGroupId[];
  readonly lockedLayerGroups: readonly WebtoonCanonicalLayerGroupId[];
  readonly canonWriteAccess: "full" | "propose-only" | "read-only";
  readonly requiresLeadReview: boolean;
  readonly canApproveDepartment: boolean;
  readonly permissionBadgeKo: string;
}

const LEAD_OR_MAIN_ROLES: ReadonlySet<CreatorRoleId> = new Set([
  "creator",
  "story",
  "adaptation",
  "storyboard",
  "line-art",
  "character",
  "background",
  "three-d",
  "color",
  "lettering",
  "editor",
  "producer",
]);

const ASSISTANT_PROPOSE_ROLES: ReadonlySet<CreatorRoleId> = new Set([
  "associate-writer",
  "associate-artist",
  "assistant",
  "line-assistant",
  "flat-color-assistant",
  "shading-assistant",
  "background-assistant",
  "effect-assistant",
  "lettering-assistant",
  "localization",
]);

export function resolveRolePipelinePreset(roleId: CreatorRoleId): ResolvedRolePipelinePreset {
  const stageId = ROLE_TO_STAGE_MAP[roleId] ?? "storyboard-conte";
  const stageIdx = WEBTOON_E2E_ROLE_PIPELINE_STAGES.findIndex((s) => s.id === stageId);
  const stage = WEBTOON_E2E_ROLE_PIPELINE_STAGES[Math.max(0, stageIdx)]!;
  const nextStage =
    stageIdx >= 0 && stageIdx + 1 < WEBTOON_E2E_ROLE_PIPELINE_STAGES.length
      ? WEBTOON_E2E_ROLE_PIPELINE_STAGES[stageIdx + 1]!
      : null;

  const wsPreset = creatorRoleWorkspacePreset(roleId);
  const def = creatorRoleDefinition(roleId);
  const roleLabelKo = def ? creatorText(def.label, "ko") : roleId;
  const allowedLayerGroups = ROLE_ALLOWED_LAYER_GROUPS[roleId] ?? stage.ownedLayerGroups;
  const allowedSet = new Set<WebtoonCanonicalLayerGroupId>(allowedLayerGroups);
  const lockedLayerGroups = WEBTOON_CANONICAL_LAYER_GROUPS.map((g) => g.id).filter(
    (id) => !allowedSet.has(id),
  );

  const isLead = LEAD_OR_MAIN_ROLES.has(roleId);
  const isAssistant = ASSISTANT_PROPOSE_ROLES.has(roleId);
  const canonWriteAccess = isLead ? "full" : isAssistant ? "propose-only" : "read-only";
  const requiresLeadReview = isAssistant;
  const canApproveDepartment =
    roleId === "creator" || roleId === "editor" || roleId === "producer";

  const permissionBadgeKo =
    roleId === "creator"
      ? "총괄 작가 · 전체 18개 레이어 그룹 편집 및 공정 승인"
      : canApproveDepartment
        ? `총괄 검수 · 승인 동결 및 피드백 권한 (허용 레이어 ${allowedLayerGroups.length}종)`
        : isAssistant
          ? `전문 어시스턴트 최소권한 · 담당 레이어 ${allowedLayerGroups.length}종만 편집 (원화·대본 잠금 보호)`
          : `파트 메인 작가 · 담당 레이어 ${allowedLayerGroups.length}종 정본 편집 권한`;

  return {
    roleId,
    roleLabelKo,
    stage,
    nextStage,
    workspaceId: wsPreset?.workspaceId ?? stage.workspaceId,
    recommendedCommandBarSlots: (wsPreset?.recommendedCommandBarSlots ?? []).filter(
      (slot): slot is Exclude<typeof slot, null> => slot !== null,
    ),
    familiarTools: wsPreset?.familiarTools ?? stage.competitorBenchmarks,
    tailoredMenusKo: stage.tailoredMenusKo,
    allowedLayerGroups,
    lockedLayerGroups,
    canonWriteAccess,
    requiresLeadReview,
    canApproveDepartment,
    permissionBadgeKo,
  };
}

export interface RoleLayerEditGuardResult {
  readonly allowed: boolean;
  readonly code:
    | "allowed"
    | "blocked-approved-freeze"
    | "blocked-other-user-lock"
    | "blocked-role-rbac";
  readonly reasonKo: string;
}

/**
 * 직군별 레이어 그룹 편집 시도 시 최소권한(RBAC)·최종 승인 동결·타 작업자 선점 여부를 판정
 */
export function evaluateRoleLayerEditGuard(params: {
  readonly roleId: CreatorRoleId;
  readonly targetLayerGroup: WebtoonCanonicalLayerGroupId;
  readonly isApprovedFrozen?: boolean;
  readonly lockedByOtherUser?: string | null;
}): RoleLayerEditGuardResult {
  const preset = resolveRolePipelinePreset(params.roleId);
  const layerSpec = WEBTOON_CANONICAL_LAYER_GROUPS.find(
    (g) => g.id === params.targetLayerGroup,
  );
  const layerLabel = layerSpec?.labelKo ?? params.targetLayerGroup;

  if (params.isApprovedFrozen && !preset.canApproveDepartment) {
    return {
      allowed: false,
      code: "blocked-approved-freeze",
      reasonKo: `[최종 승인 동결 보호] '${layerLabel}' 레이어는 PD/편집자 최종 승인 상태이므로 ${preset.roleLabelKo} 권한으로 수정할 수 없습니다.`,
    };
  }

  if (params.lockedByOtherUser) {
    return {
      allowed: false,
      code: "blocked-other-user-lock",
      reasonKo: `[동시 작업 선점 잠금] '${layerLabel}' 레이어는 현재 '${params.lockedByOtherUser}' 작업자가 편집 중입니다.`,
    };
  }

  if (!preset.allowedLayerGroups.includes(params.targetLayerGroup)) {
    return {
      allowed: false,
      code: "blocked-role-rbac",
      reasonKo: `[직군 RBAC 보호] ${preset.roleLabelKo} 직군은 '${layerLabel}' 레이어를 수정할 수 없습니다 (허용: ${preset.allowedLayerGroups.join(", ")}).`,
    };
  }

  return {
    allowed: true,
    code: "allowed",
    reasonKo: `[편집 허용] ${preset.roleLabelKo} 직군 권한으로 '${layerLabel}' 레이어를 안전하게 편집할 수 있습니다.`,
  };
}

export interface WebtoonPipelineHandoffLogEntry {
  readonly fromStageId: WebtoonPipelineStageId;
  readonly toStageId: WebtoonPipelineStageId;
  readonly actorRoleId: CreatorRoleId;
  readonly lockedUpstreamLayerGroups: readonly WebtoonCanonicalLayerGroupId[];
  readonly noteKo: string;
}

export interface WebtoonPipelineHandoffState {
  readonly activeStageId: WebtoonPipelineStageId;
  readonly activeAssigneeRoleId: CreatorRoleId;
  readonly frozenLayerGroups: readonly WebtoonCanonicalLayerGroupId[];
  readonly isEpisodeApprovedFrozen: boolean;
  readonly handoffHistory: readonly WebtoonPipelineHandoffLogEntry[];
}

export function createInitialRolePipelineHandoffState(): WebtoonPipelineHandoffState {
  return {
    activeStageId: "story-script",
    activeAssigneeRoleId: "story",
    frozenLayerGroups: [],
    isEpisodeApprovedFrozen: false,
    handoffHistory: [],
  };
}

/**
 * 원클릭 다음 공정 인계(`executeOneClickStageHandoff`) — 완료된 이전 공정의 레이어를 자동 잠금하고
 * 다음 담당 직군과 추천 작업공간으로 안전하게 인계합니다.
 */
export function executeOneClickStageHandoff(
  state: WebtoonPipelineHandoffState,
  params?: {
    readonly actorRoleId?: CreatorRoleId;
    readonly noteKo?: string;
  },
): WebtoonPipelineHandoffState {
  const currentIdx = WEBTOON_E2E_ROLE_PIPELINE_STAGES.findIndex(
    (s) => s.id === state.activeStageId,
  );
  const currentStage = WEBTOON_E2E_ROLE_PIPELINE_STAGES[Math.max(0, currentIdx)]!;
  const actorRole = params?.actorRoleId ?? state.activeAssigneeRoleId;

  const mergedFrozen = Array.from(
    new Set<WebtoonCanonicalLayerGroupId>([
      ...state.frozenLayerGroups,
      ...currentStage.ownedLayerGroups,
    ]),
  );

  // 마지막 8단계에서 인계/승인 실행 시 에피소드 전체 승인 동결
  if (currentIdx + 1 >= WEBTOON_E2E_ROLE_PIPELINE_STAGES.length) {
    return {
      ...state,
      frozenLayerGroups: WEBTOON_CANONICAL_LAYER_GROUPS.map((g) => g.id),
      isEpisodeApprovedFrozen: true,
      handoffHistory: [
        ...state.handoffHistory,
        {
          fromStageId: currentStage.id,
          toStageId: currentStage.id,
          actorRoleId: actorRole,
          lockedUpstreamLayerGroups: currentStage.ownedLayerGroups,
          noteKo:
            params?.noteKo ??
            `${currentStage.labelKo} 최종 검수 완료 및 전 레이어 승인 동결(Freeze)`,
        },
      ],
    };
  }

  const nextStage = WEBTOON_E2E_ROLE_PIPELINE_STAGES[currentIdx + 1]!;
  const nextAssignee = nextStage.primaryRoles[0]!;

  return {
    activeStageId: nextStage.id,
    activeAssigneeRoleId: nextAssignee,
    frozenLayerGroups: mergedFrozen,
    isEpisodeApprovedFrozen: false,
    handoffHistory: [
      ...state.handoffHistory,
      {
        fromStageId: currentStage.id,
        toStageId: nextStage.id,
        actorRoleId: actorRole,
        lockedUpstreamLayerGroups: currentStage.ownedLayerGroups,
        noteKo:
          params?.noteKo ??
          `${currentStage.labelKo} → ${nextStage.labelKo} 인계 완료 (상위 레이어 ${currentStage.ownedLayerGroups.length}종 잠금 보호)`,
      },
    ],
  };
}
