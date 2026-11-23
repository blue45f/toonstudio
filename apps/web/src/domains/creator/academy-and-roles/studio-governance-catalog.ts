/**
 * 글로벌 스튜디오급 8단계 웹툰 분업 파이프라인 · 7단계 규모별 거버넌스 · 6역할 RBAC 정본 카탈로그.
 *
 * - ShotGrid / Kitsu / Frame.io / Figma / Linear / CSP Teamwork 협업 패턴을 웹툰 실무에 맞게 정형화
 * - 7단계 규모 거버넌스: solo · amateur-club · classroom-edu · duo-trio · studio-8 · agency-30plus · cross-studio-federation
 * - 워크스페이스 5계층: Organization → Brand/Label → Series → Episode → Cut
 * - 샘플 원장·병목 데이터는 합성 예시(syntheticDemo: true)로만 제공하며 실제 고객 데이터를 포함하지 않음
 */

import {
  ACADEMY_ROLES_SPRITE_PATHS,
  type StudioCreatorRoleId,
} from "./studio-role-catalog";

export type PipelineStageId =
  | "conti"
  | "bg3d-vrm"
  | "lineart"
  | "flatting"
  | "shading"
  | "post-fx"
  | "lettering-loc"
  | "final-bom";

export type StudioGovernanceTierId =
  | "solo"
  | "amateur-club"
  | "classroom-edu"
  | "duo-trio"
  | "studio-8"
  | "agency-30plus"
  | "cross-studio-federation";

export type WorkspaceHierarchyLevelId =
  | "organization"
  | "brand-label"
  | "series"
  | "episode"
  | "cut";

export type StudioRbacRoleId =
  | "ep-pd"
  | "ad-lead"
  | "main-author"
  | "stage-assist"
  | "outsource-guest"
  | "client-reviewer";

export type StudioRbacActionId =
  | "manage-org"
  | "manage-billing-payout"
  | "approve-final-bom"
  | "assign-cuts"
  | "edit-all-layers"
  | "edit-assigned-stage-only"
  | "view-full-episode"
  | "view-sandbox-cuts-only"
  | "leave-pin-review"
  | "export-commercial-master"
  | "manage-federation-canon";

export interface PipelineStageSpec {
  readonly id: PipelineStageId;
  readonly order: number;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly ownerRoles: readonly StudioCreatorRoleId[];
  readonly requiredLayerPrefix: string;
  readonly minWidthPx: number;
  readonly minDpi: number;
  readonly requiresClosedRegions: boolean;
  readonly requiresBiblePalette: boolean;
  readonly defaultSlaHours: number;
  readonly baseCutRateKrw: number;
  readonly autoLocksPreviousStage: boolean;
  readonly spritePath: string;
  readonly handoffSummaryKo: string;
}

export const PIPELINE_STAGE_ORDER: readonly PipelineStageId[] = Object.freeze([
  "conti",
  "bg3d-vrm",
  "lineart",
  "flatting",
  "shading",
  "post-fx",
  "lettering-loc",
  "final-bom",
]);

export const WEBTOON_8_STAGE_PIPELINE: readonly PipelineStageSpec[] = Object.freeze([
  {
    id: "conti",
    order: 1,
    labelKo: "1. 콘티 · 연출",
    shortLabelKo: "콘티",
    ownerRoles: ["story", "storyboard"],
    requiredLayerPrefix: "01_CONTI_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedRegions: false,
    requiresBiblePalette: false,
    defaultSlaHours: 8,
    baseCutRateKrw: 12_000,
    autoLocksPreviousStage: false,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolMarker,
    handoffSummaryKo: "컷 분할·대사 위치 확정 후 3D 배경·VRM 공정으로 바통 인계",
  },
  {
    id: "bg3d-vrm",
    order: 2,
    labelKo: "2. 3D 배경 · VRM",
    shortLabelKo: "3D/VRM",
    ownerRoles: ["stage3d", "character3d"],
    requiredLayerPrefix: "02_BG3D_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedRegions: false,
    requiresBiblePalette: false,
    defaultSlaHours: 10,
    baseCutRateKrw: 18_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolBg3d,
    handoffSummaryKo: "3D 원판·LT 선화·VRM 포즈 가이드 잠금 후 선화 공정 열림",
  },
  {
    id: "lineart",
    order: 3,
    labelKo: "3. 선화 · 펜터치",
    shortLabelKo: "선화",
    ownerRoles: ["lineart"],
    requiredLayerPrefix: "04_LINEART_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedRegions: true,
    requiresBiblePalette: false,
    defaultSlaHours: 14,
    baseCutRateKrw: 24_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolGpen,
    handoffSummaryKo: "닫힌 영역 0틈새 검증 후 선화 Read-Only 잠금 → 밑색 즉시 개방",
  },
  {
    id: "flatting",
    order: 4,
    labelKo: "4. 밑색 · 플랫",
    shortLabelKo: "밑색",
    ownerRoles: ["flatting"],
    requiredLayerPrefix: "05_FLAT_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedRegions: true,
    requiresBiblePalette: true,
    defaultSlaHours: 8,
    baseCutRateKrw: 15_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolFill,
    handoffSummaryKo: "캐릭터 바이블 팔레트 일치 통과 시 밑색 잠금 → 명암/채색 열림",
  },
  {
    id: "shading",
    order: 5,
    labelKo: "5. 명암 · 채색",
    shortLabelKo: "명암",
    ownerRoles: ["shading"],
    requiredLayerPrefix: "06_SHADE_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedRegions: false,
    requiresBiblePalette: true,
    defaultSlaHours: 12,
    baseCutRateKrw: 22_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolWatercolor,
    handoffSummaryKo: "광원·명암 검수 후 명암 레이어 잠금 → 후보정/FX 공정 인계",
  },
  {
    id: "post-fx",
    order: 6,
    labelKo: "6. 후보정 · FX",
    shortLabelKo: "후보정",
    ownerRoles: ["vfx"],
    requiredLayerPrefix: "07_VFX_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedRegions: false,
    requiresBiblePalette: false,
    defaultSlaHours: 6,
    baseCutRateKrw: 14_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolScreentone,
    handoffSummaryKo: "블룸·대기광·스크린톤 마감 후 식자/SFX/번역 공정 인계",
  },
  {
    id: "lettering-loc",
    order: 7,
    labelKo: "7. 식자 · SFX · 번역",
    shortLabelKo: "식자/번역",
    ownerRoles: ["lettering", "localization"],
    requiredLayerPrefix: "08_LETTERING_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedRegions: false,
    requiresBiblePalette: false,
    defaultSlaHours: 6,
    baseCutRateKrw: 13_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.toolBubbleSfx,
    handoffSummaryKo: "말풍선·의성어·다국어 슬롯 검증 후 최종 검수/BOM 출고로 인계",
  },
  {
    id: "final-bom",
    order: 8,
    labelKo: "8. 최종 검수 · BOM 출고",
    shortLabelKo: "BOM 출고",
    ownerRoles: ["producer", "video"],
    requiredLayerPrefix: "10_REVIEW_",
    minWidthPx: 1600,
    minDpi: 300,
    requiresClosedRegions: false,
    requiresBiblePalette: true,
    defaultSlaHours: 4,
    baseCutRateKrw: 10_000,
    autoLocksPreviousStage: true,
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemProduction,
    handoffSummaryKo: "Rights BOM 0건 누락·플랫폼 슬라이스·Remotion 예고편 최종 승인",
  },
]);

export interface WorkspaceHierarchyLevelSpec {
  readonly id: WorkspaceHierarchyLevelId;
  readonly depth: number;
  readonly labelKo: string;
  readonly exampleKo: string;
  readonly purposeKo: string;
}

export const WORKSPACE_HIERARCHY_LEVELS: readonly WorkspaceHierarchyLevelSpec[] = Object.freeze([
  {
    id: "organization",
    depth: 1,
    labelKo: "Organization (법인 · 연합 본부)",
    exampleKo: "블루아틀리에 스튜디오 그룹",
    purposeKo: "전사 보안 정책·통합 청구·공유 에셋 볼트·SSO 경계",
  },
  {
    id: "brand-label",
    depth: 2,
    labelKo: "Brand / Label (레이블 · 클래스 · 동아리)",
    exampleKo: "판타지 임프린트 / 2026 가을반",
    purposeKo: "임프린트별 스타일 가이드·강사/AD 책임 단위·정산 예산",
  },
  {
    id: "series",
    depth: 3,
    labelKo: "Series (작품 · 공유 세계관)",
    exampleKo: "밤의 우편배달부 시즌 2",
    purposeKo: "캐릭터 바이블 팔레트·3D 배경 라이브러리·고유명사 용어집",
  },
  {
    id: "episode",
    depth: 4,
    labelKo: "Episode (회차 · 마감 SLA 단위)",
    exampleKo: "12화 · 돌아온 봉투 (62컷)",
    purposeKo: "주간 마감 카운트다운·8단계 공정 병목 감시·통합 검수본",
  },
  {
    id: "cut",
    depth: 5,
    labelKo: "Cut (컷 · 바통 터치 · 외주 정산 단위)",
    exampleKo: "CUT-12-014 (선화→밑색 인계)",
    purposeKo: "이전 공정 Read-Only 잠금·외주 3~5컷 샌드박스·컷당 원고료 정산",
  },
]);

export interface StudioGovernanceTierSpec {
  readonly id: StudioGovernanceTierId;
  readonly labelKo: string;
  readonly headcountLabelKo: string;
  readonly summaryKo: string;
  readonly activeHierarchyLevels: readonly WorkspaceHierarchyLevelId[];
  readonly enabledPipelineStages: readonly PipelineStageId[];
  readonly approvalChromeMode: "hidden" | "lightweight-relay" | "instructor-rubric" | "full-gate" | "federated-council";
  readonly outsourceSandboxEnabled: boolean;
  readonly payoutLedgerEnabled: boolean;
  readonly aiBackfillAutoEnabled: boolean;
  readonly signatureFeaturesKo: readonly string[];
  readonly spritePath: string;
}

export const GOVERNANCE_TIER_ORDER: readonly StudioGovernanceTierId[] = Object.freeze([
  "solo",
  "amateur-club",
  "classroom-edu",
  "duo-trio",
  "studio-8",
  "agency-30plus",
  "cross-studio-federation",
]);

export const STUDIO_GOVERNANCE_TIERS: Readonly<
  Record<StudioGovernanceTierId, StudioGovernanceTierSpec>
> = Object.freeze({
  solo: {
    id: "solo",
    labelKo: "1인 솔로 작가",
    headcountLabelKo: "1명 + AI 팀원",
    summaryKo: "결재·배정 메뉴를 완전히 숨기고 90% 캔버스와 AI 자동 보완에 집중합니다.",
    activeHierarchyLevels: ["series", "episode", "cut"],
    enabledPipelineStages: ["conti", "lineart", "flatting", "shading", "lettering-loc", "final-bom"],
    approvalChromeMode: "hidden",
    outsourceSandboxEnabled: false,
    payoutLedgerEnabled: false,
    aiBackfillAutoEnabled: true,
    signatureFeaturesKo: [
      "결재·RBAC UI 자동 숨김으로 캔버스 몰입 극대화",
      "비어 있는 직군(3D·밑색·번역·숏폼) AI 팀원 즉시 자동 배치",
      "로컬 SQLite WASM + OPFS 자동 저장과 Rights BOM 원클릭 점검",
    ],
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemStudio,
  },
  "amateur-club": {
    id: "amateur-club",
    labelKo: "아마추어 · 동아리 릴레이",
    headcountLabelKo: "3~12명 동아리·합작",
    summaryKo: "대학 만화동아리·단편 릴레이 합작을 위한 가벼운 컷 순번 바통 터치와 공동 크레딧 룸입니다.",
    activeHierarchyLevels: ["brand-label", "series", "episode", "cut"],
    enabledPipelineStages: ["conti", "lineart", "flatting", "shading", "lettering-loc", "final-bom"],
    approvalChromeMode: "lightweight-relay",
    outsourceSandboxEnabled: false,
    payoutLedgerEnabled: false,
    aiBackfillAutoEnabled: true,
    signatureFeaturesKo: [
      "부담 없는 릴레이 순번 바통 터치 & 동아리 컷 점유 표시",
      "공통 캐릭터 시트·말풍선 폰트 1클릭 동기화",
      "공동 참여자 크레딧·공모전 출고 번들 자동 정리",
    ],
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemGuideMap,
  },
  "classroom-edu": {
    id: "classroom-edu",
    labelKo: "학원 · 대학 교육생 클래스",
    headcountLabelKo: "강사 1~3명 + 수강생 15~60명",
    summaryKo: "웹툰 학원·대학 전공 수업을 위한 강사 라이브 첨삭 핀, 과제함 제출, 주차별 루브릭 평가 워크스페이스입니다.",
    activeHierarchyLevels: ["organization", "brand-label", "episode", "cut"],
    enabledPipelineStages: ["conti", "bg3d-vrm", "lineart", "flatting", "shading", "lettering-loc"],
    approvalChromeMode: "instructor-rubric",
    outsourceSandboxEnabled: true,
    payoutLedgerEnabled: false,
    aiBackfillAutoEnabled: false,
    signatureFeaturesKo: [
      "강사 전용 라이브 첨삭 레이어(원본 비파괴 오버레이 핀 & 전후 스와이프)",
      "주차별 과제함·마감 제출 현황판 & 학생별 격리 작업 샌드박스",
      "선화 닫힌 영역·팔레트·해상도 자동 채점 체크리스트 연동",
    ],
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemGuideMap,
  },
  "duo-trio": {
    id: "duo-trio",
    labelKo: "2~3인 소규모 팀",
    headcountLabelKo: "2~3명 (글·그림·어시)",
    summaryKo: "메인 작가와 채색·배경 어시스턴트가 컷 단위 원클릭 바통 터치로 호흡을 맞춥니다.",
    activeHierarchyLevels: ["series", "episode", "cut"],
    enabledPipelineStages: PIPELINE_STAGE_ORDER,
    approvalChromeMode: "lightweight-relay",
    outsourceSandboxEnabled: true,
    payoutLedgerEnabled: true,
    aiBackfillAutoEnabled: true,
    signatureFeaturesKo: [
      "선화 완료 즉시 이전 공정 Read-Only 잠금 + 어시 밑색 레이어 개방",
      "간편 컷당 어시 원고료 자동 집계 원장",
      "단기 외주 3~5컷 제한 반출 샌드박스 지원",
    ],
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemProduction,
  },
  "studio-8": {
    id: "studio-8",
    labelKo: "7~8인 스튜디오 제작팀",
    headcountLabelKo: "6~12명 전담 분업 셀",
    summaryKo: "8단계 표준 분업 파이프라인, 캐릭터 바이블 팔레트 강제 동기화, 마감 SLA 병목 경보를 상시 가동합니다.",
    activeHierarchyLevels: ["brand-label", "series", "episode", "cut"],
    enabledPipelineStages: PIPELINE_STAGE_ORDER,
    approvalChromeMode: "full-gate",
    outsourceSandboxEnabled: true,
    payoutLedgerEnabled: true,
    aiBackfillAutoEnabled: false,
    signatureFeaturesKo: [
      "8단계 컷 바통 터치 5대 자동 검수 게이트 상시 적용",
      "마감 SLA 병목 감지기(지연 컷·공정 적체·재배치 처방전)",
      "공정별·컷별 원고료 자동 정산 원장 & 승인/보류 분리 집계",
    ],
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemProduction,
  },
  "agency-30plus": {
    id: "agency-30plus",
    labelKo: "30인+ 웹툰 에이전시",
    headcountLabelKo: "30명+ 멀티 레이블·다작품",
    summaryKo: "5계층 워크스페이스(Organization→Label→Series→Episode→Cut), 6역할 RBAC, 외주 샌드박스·세션 워터마크를 통합 통제합니다.",
    activeHierarchyLevels: ["organization", "brand-label", "series", "episode", "cut"],
    enabledPipelineStages: PIPELINE_STAGE_ORDER,
    approvalChromeMode: "full-gate",
    outsourceSandboxEnabled: true,
    payoutLedgerEnabled: true,
    aiBackfillAutoEnabled: false,
    signatureFeaturesKo: [
      "5계층 워크스페이스 권한 상속 및 6역할 세밀 RBAC 통제",
      "외주 반출 3~5컷 격리 샌드박스 + 세션 워터마크 + 반입 BOM 자동 검증",
      "다작품 EP/AD 마감 SLA 통합 관제 & 대량 컷 정산 원장",
    ],
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemProduction,
  },
  "cross-studio-federation": {
    id: "cross-studio-federation",
    labelKo: "스튜디오 간 연합 룸 (Federation)",
    headcountLabelKo: "2개+ 스튜디오 연합 제작",
    summaryKo: "다수 제작사·글로벌 현지화 스튜디오가 공유 세계관 Canon Hub와 공유 에셋 볼트를 보안 격리된 연합 룸에서 공동 운영합니다.",
    activeHierarchyLevels: ["organization", "brand-label", "series", "episode", "cut"],
    enabledPipelineStages: PIPELINE_STAGE_ORDER,
    approvalChromeMode: "federated-council",
    outsourceSandboxEnabled: true,
    payoutLedgerEnabled: true,
    aiBackfillAutoEnabled: false,
    signatureFeaturesKo: [
      "공유 세계관 Canon Hub(캐릭터 바이블·연표·금칙어 멀티 스튜디오 실시간 동기화)",
      "공유 에셋 볼트(3D 배경·VRM·브러시 라이선스 교차 Rights BOM 자동 추적)",
      "스튜디오 간 연합 룸(상대 법인 미공개 회차 차단 + 컷 단위 합동 검수·정산)",
    ],
    spritePath: ACADEMY_ROLES_SPRITE_PATHS.emblemBg3d,
  },
});

export interface StudioRbacRoleSpec {
  readonly id: StudioRbacRoleId;
  readonly labelKo: string;
  readonly scopeSummaryKo: string;
  readonly allowedActions: readonly StudioRbacActionId[];
}

export const RBAC_ACTION_LABELS: Readonly<Record<StudioRbacActionId, string>> = Object.freeze({
  "manage-org": "조직·레이블·팀원 관리",
  "manage-billing-payout": "컷당 원고료 정산 확정",
  "approve-final-bom": "최종 검수 & Rights BOM 출고 승인",
  "assign-cuts": "컷 담당 배정 & 외주 샌드박스 발급",
  "edit-all-layers": "전 공정 레이어 편집 및 잠금 해제",
  "edit-assigned-stage-only": "배정된 담당 공정 레이어만 편집",
  "view-full-episode": "회차 전체 컷 열람",
  "view-sandbox-cuts-only": "배정된 외주 샌드박스 컷(3~5장)만 열람",
  "leave-pin-review": "좌표 핀 피드백 및 수정 요청",
  "export-commercial-master": "상업용 마스터 원본 반출",
  "manage-federation-canon": "연합 Canon Hub·공유 에셋 볼트 관리",
});

export const STUDIO_RBAC_ROLES: Readonly<Record<StudioRbacRoleId, StudioRbacRoleSpec>> =
  Object.freeze({
    "ep-pd": {
      id: "ep-pd",
      labelKo: "EP · 총괄 PD",
      scopeSummaryKo: "조직·정산·최종 BOM 출고·연합 룸 거버넌스를 총괄하며 원고 직접 수정은 잠금 보호합니다.",
      allowedActions: [
        "manage-org",
        "manage-billing-payout",
        "approve-final-bom",
        "assign-cuts",
        "view-full-episode",
        "leave-pin-review",
        "export-commercial-master",
        "manage-federation-canon",
      ],
    },
    "ad-lead": {
      id: "ad-lead",
      labelKo: "AD · 작화팀장",
      scopeSummaryKo: "작화 품질·캐릭터 바이블 통일·전 공정 레이어 교정 및 컷 바통 터치 승인을 맡습니다.",
      allowedActions: [
        "approve-final-bom",
        "assign-cuts",
        "edit-all-layers",
        "edit-assigned-stage-only",
        "view-full-episode",
        "leave-pin-review",
        "manage-federation-canon",
      ],
    },
    "main-author": {
      id: "main-author",
      labelKo: "메인 작가",
      scopeSummaryKo: "작품 연출·전 공정 레이어 편집·컷 배정 및 최종 출고 승인을 함께 결정합니다.",
      allowedActions: [
        "approve-final-bom",
        "assign-cuts",
        "edit-all-layers",
        "edit-assigned-stage-only",
        "view-full-episode",
        "leave-pin-review",
        "export-commercial-master",
      ],
    },
    "stage-assist": {
      id: "stage-assist",
      labelKo: "선화·채색·배경·식자 어시",
      scopeSummaryKo: "전체 흐름 맥락을 보되 자기 담당 공정 레이어만 편집하며 이전 공정은 읽기 전용으로 보호됩니다.",
      allowedActions: [
        "edit-assigned-stage-only",
        "view-full-episode",
        "leave-pin-review",
      ],
    },
    "outsource-guest": {
      id: "outsource-guest",
      labelKo: "외주 게스트",
      scopeSummaryKo: "세션 워터마크가 적용된 배정 컷 3~5장 샌드박스만 열람·작업하며 타 컷과 원본 마스터는 완전 차단됩니다.",
      allowedActions: ["edit-assigned-stage-only", "view-sandbox-cuts-only"],
    },
    "client-reviewer": {
      id: "client-reviewer",
      labelKo: "독자 · 클라이언트 리뷰어",
      scopeSummaryKo: "고정 검수본 열람과 좌표 핀 코멘트만 허용되며 레이어 편집·원본 다운로드가 불가합니다.",
      allowedActions: ["view-full-episode", "leave-pin-review"],
    },
  });

export interface CutPayoutEntryInput {
  readonly cutId: string;
  readonly stageId: PipelineStageId;
  readonly assigneeId: string;
  readonly assigneeNameKo: string;
  readonly baseRateKrw?: number;
  readonly complexityMultiplier?: number;
  readonly rushBonusKrw?: number;
  readonly gateApproved: boolean;
}

export interface PipelineWorkloadCut {
  readonly cutId: string;
  readonly stageId: PipelineStageId;
  readonly assigneeNameKo: string;
  readonly elapsedHours: number;
  readonly remainingDeadlineHours: number;
  readonly blockedByPreviousStage?: boolean;
}

/** UI 체험용 합성 예시 데이터(실제 고객·매출 데이터 아님). */
export const SAMPLE_CUT_PAYOUT_ENTRIES: readonly CutPayoutEntryInput[] = Object.freeze([
  { cutId: "CUT-12-001", stageId: "lineart", assigneeId: "u-ink", assigneeNameKo: "서연(선화)", complexityMultiplier: 1.2, gateApproved: true },
  { cutId: "CUT-12-002", stageId: "lineart", assigneeId: "u-ink", assigneeNameKo: "서연(선화)", complexityMultiplier: 1.0, gateApproved: true },
  { cutId: "CUT-12-001", stageId: "flatting", assigneeId: "u-flat", assigneeNameKo: "민수(밑색)", complexityMultiplier: 1.0, gateApproved: true },
  { cutId: "CUT-12-002", stageId: "shading", assigneeId: "u-shade", assigneeNameKo: "지아(명암)", complexityMultiplier: 1.3, rushBonusKrw: 5_000, gateApproved: false },
  { cutId: "CUT-12-003", stageId: "bg3d-vrm", assigneeId: "u-ext-3d", assigneeNameKo: "외주-아크3D", complexityMultiplier: 1.5, gateApproved: true },
  { cutId: "CUT-12-004", stageId: "lettering-loc", assigneeId: "u-loc", assigneeNameKo: "하윤(식자·번역)", complexityMultiplier: 1.0, gateApproved: false },
]);

export const SAMPLE_SLA_WORKLOAD_CUTS: readonly PipelineWorkloadCut[] = Object.freeze([
  { cutId: "CUT-12-011", stageId: "lineart", assigneeNameKo: "서연(선화)", elapsedHours: 19, remainingDeadlineHours: 14 },
  { cutId: "CUT-12-012", stageId: "lineart", assigneeNameKo: "서연(선화)", elapsedHours: 16, remainingDeadlineHours: 14 },
  { cutId: "CUT-12-013", stageId: "shading", assigneeNameKo: "지아(명암)", elapsedHours: 18, remainingDeadlineHours: 10 },
  { cutId: "CUT-12-014", stageId: "shading", assigneeNameKo: "지아(명암)", elapsedHours: 14, remainingDeadlineHours: 10 },
  { cutId: "CUT-12-015", stageId: "shading", assigneeNameKo: "지아(명암)", elapsedHours: 9, remainingDeadlineHours: 10, blockedByPreviousStage: true },
  { cutId: "CUT-12-016", stageId: "lettering-loc", assigneeNameKo: "하윤(식자)", elapsedHours: 3, remainingDeadlineHours: 16 },
]);
