/**
 * webtoon-role-pipeline-orchestrator.ts
 *
 * REA 역공학 기반 웹툰·만화 8단계 직군 세분화(글작가·각색작가·보조 글작가·콘티작가·3D 배경작가·
 * 배경 어시스턴트·선화작가·선화 어시스턴트·밑색 어시스턴트·명암 어시스턴트·효과/무빙툰 어시스턴트·
 * 식자 디자이너·식자 어시스턴트·편집자/PD), 직군별 메뉴·권한 예시와 공정 인계 계획을 계산한다.
 * 실제 문서·서버 접근 권한·담당자·작업공간을 변경하는 인증 경로가 아니다.
 */

import { STUDIO_ROLE_PIPELINE_ROLES, type StudioRolePipelineGroupId, type StudioRolePipelineStageId } from "@toonstudio/contracts/studio-role-pipeline";

import { creatorRoleWorkspacePreset } from "../creator-role-workspace-presets";
import type { StudioDefaultWorkspaceId } from "../studio-workspaces";

import {
  creatorRoleDefinition,
  creatorText,
  type CreatorRoleId,
} from "@/shared/lib/creator-role-contract";

export type WebtoonPipelineStageId = StudioRolePipelineStageId;
export type WebtoonCanonicalLayerGroupId = StudioRolePipelineGroupId;

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
      summaryKo: "3D 배경작가·배경 어시스턴트가 도형·2점 투시와 6패스 LT 출력을 적용합니다. 6패스는 WebGL·일반 원고 페이지를 지원하며, 단면·태양광은 계산 미리보기입니다.",
      primaryRoles: ["background", "three-d", "background-assistant"],
      workspaceId: "pose-3d",
      ownedLayerGroups: ["background-3d", "background-line", "background-tone"],
      competitorBenchmarks: ["SketchUp", "ACON3D", "Snaptoon", "Blender Grease Pencil"],
      tailoredMenusKo: ["Push/Pull 개구부·몰딩", "2점 투시 수직 잠금", "그림자 보존 실내 단면 계산", "6패스 LT 출력 설정 (WebGL·일반 페이지)"],
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
  const stage = WEBTOON_E2E_ROLE_PIPELINE_STAGES[Math.max(0, stageIdx)];
  if (!stage) throw new Error("분업 계획의 기본 공정이 정의되지 않았습니다.");
  const nextStage =
    stageIdx >= 0 && stageIdx + 1 < WEBTOON_E2E_ROLE_PIPELINE_STAGES.length
      ? WEBTOON_E2E_ROLE_PIPELINE_STAGES[stageIdx + 1] ?? null
      : null;

  const wsPreset = creatorRoleWorkspacePreset(roleId);
  const def = creatorRoleDefinition(roleId);
  const roleLabelKo = def ? creatorText(def.label, "ko") : roleId;
  const isLead = LEAD_OR_MAIN_ROLES.has(roleId);
  const isAssistant = ASSISTANT_PROPOSE_ROLES.has(roleId);
  const canonWriteAccess = isLead ? "full" : isAssistant ? "propose-only" : "read-only";
  const allowedLayerGroups = canonWriteAccess === "read-only"
    ? []
    : STUDIO_ROLE_PIPELINE_ROLES.find((role) => role.id === roleId)?.groupIds ?? ROLE_ALLOWED_LAYER_GROUPS[roleId] ?? stage.ownedLayerGroups;
  const allowedSet = new Set<WebtoonCanonicalLayerGroupId>(allowedLayerGroups);
  const lockedLayerGroups = WEBTOON_CANONICAL_LAYER_GROUPS.map((g) => g.id).filter(
    (id) => !allowedSet.has(id),
  );

  const requiresLeadReview = isAssistant;
  const canApproveDepartment =
    roleId === "creator" || roleId === "editor" || roleId === "producer";

  const permissionBadgeKo = "권한 예시 · " + (
    roleId === "creator"
      ? "총괄 작가 · 전체 18개 그룹 및 공정 승인 계획"
      : canApproveDepartment
        ? `총괄 검수 · 승인 동결 및 피드백 계획 (허용 레이어 ${allowedLayerGroups.length}종)`
        : canonWriteAccess === "read-only"
          ? "읽기 전용 검토 · 원고 편집·승인 권한을 부여하지 않음"
          : isAssistant
            ? `전문 어시스턴트 · 담당 레이어 ${allowedLayerGroups.length}종 편집 제안 (책임자 검토 필요)`
            : `파트 메인 작가 · 담당 레이어 ${allowedLayerGroups.length}종 편집 계획`);

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
    | "blocked-upstream-freeze"
    | "blocked-other-user-lock"
    | "blocked-role-rbac";
  readonly reasonKo: string;
  readonly reasonEn: string;
}

/**
 * 계획 화면의 직군·동결·선점 예시를 판정한다. 실제 편집 권한은 서버 계약이 정본이다.
 */
export function evaluateRoleLayerEditGuard(params: {
  readonly roleId: CreatorRoleId;
  readonly targetLayerGroup: WebtoonCanonicalLayerGroupId;
  readonly isApprovedFrozen?: boolean;
  readonly frozenLayerGroups?: readonly WebtoonCanonicalLayerGroupId[];
  readonly lockedByOtherUser?: string | null;
}): RoleLayerEditGuardResult {
  const preset = resolveRolePipelinePreset(params.roleId);
  const layerSpec = WEBTOON_CANONICAL_LAYER_GROUPS.find(
    (g) => g.id === params.targetLayerGroup,
  );
  const layerLabel = layerSpec?.labelKo ?? params.targetLayerGroup;

  if (params.isApprovedFrozen) {
    return {
      allowed: false,
      code: "blocked-approved-freeze",
      reasonKo: `[계획상 최종 동결] '${layerLabel}' 그룹은 ${preset.roleLabelKo}의 편집 계획에서 제외됩니다.`,
      reasonEn: `Final freeze preview: ${params.targetLayerGroup} is excluded from this role's edit plan.`,
    };
  }

  if (params.frozenLayerGroups?.includes(params.targetLayerGroup)) {
    return {
      allowed: false,
      code: "blocked-upstream-freeze",
      reasonKo: `[계획상 이전 공정 동결] '${layerLabel}' 그룹은 이미 인계한 공정에 속합니다.`,
      reasonEn: `Upstream freeze preview: ${params.targetLayerGroup} belongs to an earlier handed-off stage.`,
    };
  }

  if (params.lockedByOtherUser) {
    return {
      allowed: false,
      code: "blocked-other-user-lock",
      reasonKo: `[선점 잠금 예시] '${layerLabel}' 그룹을 '${params.lockedByOtherUser}' 작업자가 편집하는 조건입니다.`,
      reasonEn: `Lock preview: ${params.targetLayerGroup} is assigned to another worker.`,
    };
  }

  if (!preset.allowedLayerGroups.includes(params.targetLayerGroup)) {
    return {
      allowed: false,
      code: "blocked-role-rbac",
      reasonKo: `[권한 예시상 제외] ${preset.roleLabelKo}의 담당 그룹에 '${layerLabel}'이 없습니다.`,
      reasonEn: `Permission preview: ${params.targetLayerGroup} is outside this role's planned groups.`,
    };
  }

  return {
    allowed: true,
    code: "allowed",
    reasonKo: preset.requiresLeadReview
      ? `[계획상 제안 가능] '${layerLabel}' 그룹의 편집 제안은 책임자 검토가 필요합니다.`
      : `[계획상 편집 가능] '${layerLabel}' 그룹이 ${preset.roleLabelKo}의 담당 예시에 포함됩니다.`,
    reasonEn: preset.requiresLeadReview
      ? `Proposal preview: edits to ${params.targetLayerGroup} require lead review.`
      : `Edit preview: ${params.targetLayerGroup} is included in this role's planned groups.`,
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

export interface RolePipelineHandoffGuardResult {
  readonly allowed: boolean;
  readonly code: "allowed" | "blocked-invalid-state" | "blocked-completed" | "blocked-role" | "blocked-final-approval";
  readonly reasonKo: string;
  readonly reasonEn: string;
}

/** 저장·전송 권한이 아닌, 지역 분업 계획의 순서와 선택 직군을 검증한다. */
export function evaluateRolePipelineHandoff(
  state: WebtoonPipelineHandoffState,
  actorRoleId: CreatorRoleId,
): RolePipelineHandoffGuardResult {
  const invalidState: RolePipelineHandoffGuardResult = {
    allowed: false, code: "blocked-invalid-state",
    reasonKo: "공정·담당·동결 이력이 일치하지 않아 계획을 진행하지 않았습니다. 초기화 후 다시 선택해 주세요.",
    reasonEn: "Stage, assignee and freeze history do not match. Reset this local plan before continuing.",
  };
  if (!state || !Array.isArray(state.frozenLayerGroups) || !Array.isArray(state.handoffHistory)) return invalidState;
  const frozenGroups: readonly WebtoonCanonicalLayerGroupId[] = state.frozenLayerGroups;
  const history: readonly WebtoonPipelineHandoffLogEntry[] = state.handoffHistory;
  const currentIndex = WEBTOON_E2E_ROLE_PIPELINE_STAGES.findIndex((stage) => stage.id === state.activeStageId);
  const current = WEBTOON_E2E_ROLE_PIPELINE_STAGES[currentIndex];
  const expectedFrozen = state.isEpisodeApprovedFrozen
    ? WEBTOON_CANONICAL_LAYER_GROUPS.map((group) => group.id)
    : WEBTOON_E2E_ROLE_PIPELINE_STAGES.slice(0, currentIndex).flatMap((stage) => stage.ownedLayerGroups);
  const frozen = new Set(frozenGroups);
  const invalid = !current || !current.primaryRoles.includes(state.activeAssigneeRoleId)
    || typeof state.isEpisodeApprovedFrozen !== "boolean"
    || frozen.size !== state.frozenLayerGroups.length || frozen.size !== expectedFrozen.length
    || expectedFrozen.some((group) => !frozen.has(group))
    || state.handoffHistory.length !== currentIndex + Number(state.isEpisodeApprovedFrozen)
    || (state.isEpisodeApprovedFrozen && currentIndex !== WEBTOON_E2E_ROLE_PIPELINE_STAGES.length - 1)
    || !Object.hasOwn(ROLE_TO_STAGE_MAP, actorRoleId);
  const invalidHistory = history.some((entry, index) => {
    const from = WEBTOON_E2E_ROLE_PIPELINE_STAGES[index];
    const to = WEBTOON_E2E_ROLE_PIPELINE_STAGES[index + 1] ?? from;
    if (!entry || !from || !to || !Object.hasOwn(ROLE_TO_STAGE_MAP, entry.actorRoleId)
      || !Array.isArray(entry.lockedUpstreamLayerGroups) || typeof entry.noteKo !== "string") return true;
    const lockedGroups: readonly WebtoonCanonicalLayerGroupId[] = entry.lockedUpstreamLayerGroups;
    const actor = resolveRolePipelinePreset(entry.actorRoleId);
    return entry.fromStageId !== from.id || entry.toStageId !== to.id
      || lockedGroups.length !== from.ownedLayerGroups.length
      || new Set(lockedGroups).size !== from.ownedLayerGroups.length
      || lockedGroups.some((group) => !from.ownedLayerGroups.includes(group))
      || (!actor.canApproveDepartment && (actor.canonWriteAccess === "read-only" || !from.primaryRoles.includes(entry.actorRoleId)))
      || (index === WEBTOON_E2E_ROLE_PIPELINE_STAGES.length - 1 && !actor.canApproveDepartment);
  });
  if (invalid || invalidHistory || !current) return invalidState;
  if (state.isEpisodeApprovedFrozen) return {
    allowed: false, code: "blocked-completed",
    reasonKo: "최종 동결 계획이 완료됐습니다. 실제 원고 승인이나 권한 변경은 수행하지 않았습니다.",
    reasonEn: "The final freeze plan is complete. No manuscript approval or permissions were changed.",
  };
  const preset = resolveRolePipelinePreset(actorRoleId);
  if (currentIndex === WEBTOON_E2E_ROLE_PIPELINE_STAGES.length - 1 && !preset.canApproveDepartment) return {
    allowed: false, code: "blocked-final-approval",
    reasonKo: "최종 동결 계획은 총괄 작가·편집자·PD 예시 직군을 선택해야 진행할 수 있습니다.",
    reasonEn: "Select the creator, editor or producer preview role to plan the final freeze.",
  };
  if ((preset.canonWriteAccess === "read-only" || !current.primaryRoles.includes(actorRoleId)) && !preset.canApproveDepartment) return {
    allowed: false, code: "blocked-role",
    reasonKo: "현재 공정의 담당 직군 또는 총괄 예시 직군을 선택해야 인계 계획을 진행할 수 있습니다.",
    reasonEn: "Select a role from the current stage or a lead preview role to plan this handoff.",
  };
  return {
    allowed: true, code: "allowed",
    reasonKo: "이 탭의 인계 계획만 다음 단계로 이동합니다. 실제 담당자와 작업공간은 바뀌지 않습니다.",
    reasonEn: "Only this tab's handoff plan advances. Actual assignees and workspaces remain unchanged.",
  };
}

/** 공정·행위 직군이 맞을 때만 지역 계획을 이동한다. 거절·완료 상태는 그대로 보존한다. */
export function executeOneClickStageHandoff(
  state: WebtoonPipelineHandoffState,
  params?: { readonly actorRoleId?: CreatorRoleId; readonly noteKo?: string },
): WebtoonPipelineHandoffState {
  const actorRole = params?.actorRoleId ?? state?.activeAssigneeRoleId;
  if (!actorRole || !evaluateRolePipelineHandoff(state, actorRole).allowed) return state;
  const currentIndex = WEBTOON_E2E_ROLE_PIPELINE_STAGES.findIndex((stage) => stage.id === state.activeStageId);
  const currentStage = WEBTOON_E2E_ROLE_PIPELINE_STAGES[currentIndex];
  if (!currentStage) return state;
  const nextStage = WEBTOON_E2E_ROLE_PIPELINE_STAGES[currentIndex + 1];
  if (!nextStage) return {
    ...state,
    frozenLayerGroups: WEBTOON_CANONICAL_LAYER_GROUPS.map((group) => group.id),
    isEpisodeApprovedFrozen: true,
    handoffHistory: [...state.handoffHistory, {
      fromStageId: currentStage.id, toStageId: currentStage.id, actorRoleId: actorRole,
      lockedUpstreamLayerGroups: currentStage.ownedLayerGroups,
      noteKo: params?.noteKo ?? `${currentStage.labelKo} 최종 동결 계획 완료 (실제 원고 미적용)`,
    }],
  };
  const nextAssignee = nextStage.primaryRoles[0];
  if (!nextAssignee) return state;
  return {
    activeStageId: nextStage.id,
    activeAssigneeRoleId: nextAssignee,
    frozenLayerGroups: Array.from(new Set([...state.frozenLayerGroups, ...currentStage.ownedLayerGroups])),
    isEpisodeApprovedFrozen: false,
    handoffHistory: [...state.handoffHistory, {
      fromStageId: currentStage.id, toStageId: nextStage.id, actorRoleId: actorRole,
      lockedUpstreamLayerGroups: currentStage.ownedLayerGroups,
      noteKo: params?.noteKo ?? `${currentStage.labelKo} → ${nextStage.labelKo} 인계 계획 (이전 공정 ${currentStage.ownedLayerGroups.length}개 그룹 동결 예시)`,
    }],
  };
}

export interface ParallelRoleCollaborationResult {
  readonly conflictFree: boolean;
  readonly overlappingLayerGroups: readonly WebtoonCanonicalLayerGroupId[];
  readonly summaryKo: string;
  readonly summaryEn: string;
}

/**
 * 두 세부 직군이 동일 페이지/컷에서 동시 협업할 때 레이어 그룹 충돌 여부를 계산한다.
 */
export function evaluateParallelRoleCollaborationPair(
  primaryRoleId: CreatorRoleId,
  partnerRoleId: CreatorRoleId,
): ParallelRoleCollaborationResult {
  const primaryPreset = resolveRolePipelinePreset(primaryRoleId);
  const partnerPreset = resolveRolePipelinePreset(partnerRoleId);
  const partnerSet = new Set(partnerPreset.allowedLayerGroups);
  const overlappingLayerGroups = primaryPreset.allowedLayerGroups.filter((group) =>
    partnerSet.has(group),
  );
  const conflictFree = overlappingLayerGroups.length === 0;
  return {
    conflictFree,
    overlappingLayerGroups,
    summaryKo: conflictFree
      ? `[병렬 협업 가능] ${primaryPreset.roleLabelKo} + ${partnerPreset.roleLabelKo} 직군은 담당 레이어 그룹이 겹치지 않아 무충돌 동시 작업이 가능합니다.`
      : `[동시 편집 조율 필요] 겹치는 레이어 그룹(${overlappingLayerGroups.join(", ")})이 ${overlappingLayerGroups.length}개 있어 선점 잠금 조율이 필요합니다.`,
    summaryEn: conflictFree
      ? `Parallel ready: ${primaryRoleId} and ${partnerRoleId} have disjoint planned layer groups.`
      : `Coordination needed: ${overlappingLayerGroups.length} overlapping layer groups (${overlappingLayerGroups.join(", ")}).`,
  };
}

const STAGE_DELIVERABLE_CHECKLIST_KO: Readonly<
  Record<WebtoonPipelineStageId, readonly string[]>
> = {
  "story-script": [
    "인물 대사 호흡(풍선당 24단어 이하) 검증",
    "씬별 설정(배경·시간대·소품) 태그 명시",
    "클리프행어 엔딩 비트 점검",
  ],
  "storyboard-conte": [
    "1600px 화면당 1.0~2.5컷 스크롤 밀도 준수",
    "말풍선 얼굴 가림 0% 안전 여백 확보",
    "180° 카메라 대화 시선 축 고정",
  ],
  "bg3d-spatial": [
    "2점 투시(Two-Point) 수직선 왜곡 0° 잠금",
    "실내 단면 컷어웨이 외부 채광 그림자 보존",
    "6패스 LT 레이어 확인 (WebGL·일반 원고 페이지)",
  ],
  "line-art-ink": [
    "벡터 교차점 지우개 마감 누락 점검",
    "주연 캐릭터 외곽선 필압·두께 일관성",
    "채색용 폐곡선(Gap-Closing) 틈새 확인",
  ],
  "flat-color-mask": [
    "캐릭터 파츠별(피부·헤어·의상) 마스크 분리",
    "안티에일리어싱 경계 미채색 픽셀 0건",
    "캐릭터 시트 기준 HEX 팔레트 고정",
  ],
  "shading-fx-post": [
    "밑색 그룹 클리핑 마스크 결합 유지",
    "시간대별 태양광 방향과 셀 명암 일치",
    "효과음·집중선 별도 레이어 분리",
  ],
  "lettering-sfx": [
    "모바일 최소 가독성(22px 이상) 준수",
    "말풍선 안전 여백(좌우 20px) 확보",
    "다국어 번역 식자 레이어 독립 유지",
  ],
  "pd-editorial-review": [
    "WT-* 41개 웹툰 품질 규칙 전수 통과",
    "포털별(Naver 690px / Webtoon 800px) 안전 절단선 검증",
    "최종 승인 후 전 레이어 동결(Freeze) 확인",
  ],
};

export function resolveStageDeliverableChecklist(
  stageId: WebtoonPipelineStageId,
): readonly string[] {
  return STAGE_DELIVERABLE_CHECKLIST_KO[stageId] ?? [];
}

export interface KritaMediBangRoleWorkflowGuide {
  readonly stageId: WebtoonPipelineStageId;
  readonly kritaFeaturePresetKo: string;
  readonly mediBangCloudRuleKo: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

/**
 * Krita (Colorize Mask / Wrap-around / Halftone) & MediBang Paint (Cloud Page Lock / Team Project) 직군별 레퍼런스 가이드
 */
export function resolveKritaColorizeAndMediBangCloudWorkflowGuide(
  stageId: WebtoonPipelineStageId,
): KritaMediBangRoleWorkflowGuide {
  const kritaByStage: Readonly<Record<WebtoonPipelineStageId, string>> = {
    "story-script": "Krita Comic Project Manager (페이지·대본 메타데이터 구조화)",
    "storyboard-conte": "Krita Storyboard Docker (컷별 보드 메모·재생 시간 큐)",
    "bg3d-spatial": "Krita Wrap-Around Mode (타일링 벽지·바닥 텍스처 이음매 제거)",
    "line-art-ink": "Krita Weighted Stabilizer & Vector Layer (무결점 펜선 보정)",
    "flat-color-mask": "Krita Colorize Mask (선화 틈새 자동 닫기 + 스트로크 힌트 밑색 분리)",
    "shading-fx-post": "Krita Halftone Screentone & Tangential Brush (그라데이션 망점·이펙트)",
    "lettering-sfx": "Krita SVG Text & Speech Bubble Vector Library (비파괴 대사 편집)",
    "pd-editorial-review": "Krita Exporter Batch Slice & Color Profile Guard (sRGB 색역 고정)",
  };
  const mediBangByStage: Readonly<Record<WebtoonPipelineStageId, string>> = {
    "story-script": "MediBang Team Cloud 스토리 노트 버전 이력 보존",
    "storyboard-conte": "MediBang Comic Panel Divide (직선·대각선 칸 나누기 여백 규격화)",
    "bg3d-spatial": "MediBang Perspective Snap Guide (1·2·3점 및 어안 소실점 스냅)",
    "line-art-ink": "MediBang Page Check-Out Lock (선화 담당자 단독 체크아웃 잠금)",
    "flat-color-mask": "MediBang Reference Layer Fill (주선화 참조 레이어 기반 영역 채우기)",
    "shading-fx-post": "MediBang 1000+ Cloud Screentones (배경·감정 톤 클라우드 동기화)",
    "lettering-sfx": "MediBang Manga Font Cloud (대사·독백·외침 전용 서체 프리셋)",
    "pd-editorial-review": "MediBang Team Project Lead Review (편집자/PD 검수 승인 전 병합 잠금)",
  };
  const kritaFeaturePresetKo = kritaByStage[stageId];
  const mediBangCloudRuleKo = mediBangByStage[stageId];
  return {
    stageId,
    kritaFeaturePresetKo,
    mediBangCloudRuleKo,
    summaryKo: `${kritaFeaturePresetKo} · ${mediBangCloudRuleKo}`,
    summaryEn: `Krita (${stageId}) & MediBang Cloud page lock workflow preset`,
  };
}

export function computeRoleCognitiveLoadReductionMetrics(roleId: CreatorRoleId): {
  readonly hiddenNonOwnedGroupsCount: number;
  readonly cognitiveLoadReductionPct: number;
  readonly summaryKo: string;
  readonly summaryEn: string;
} {
  const preset = resolveRolePipelinePreset(roleId);
  const totalGroups = WEBTOON_CANONICAL_LAYER_GROUPS.length;
  const hiddenNonOwnedGroupsCount = Math.max(0, totalGroups - preset.allowedLayerGroups.length);
  const cognitiveLoadReductionPct = Math.round((hiddenNonOwnedGroupsCount / totalGroups) * 100);
  return {
    hiddenNonOwnedGroupsCount,
    cognitiveLoadReductionPct,
    summaryKo: `직무 문맥 필터: 비담당 ${hiddenNonOwnedGroupsCount}/${totalGroups}그룹 자동 접힘 (인지 부하 ${cognitiveLoadReductionPct}% 절감)`,
    summaryEn: `Role contextual filter: ${hiddenNonOwnedGroupsCount}/${totalGroups} non-owned groups collapsed (${cognitiveLoadReductionPct}% cognitive load reduction)`,
  };
}
