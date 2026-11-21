import type {
  CollaborationRole,
  CollaborationType,
} from "../../../../../packages/core/src/collaboration";

import type { CollaborationTemplateKind } from "./collaboration-draft";

export type CollaborationQuickMatchId =
  | "deadline-ink-assist"
  | "background-3d-cut"
  | "longterm-serial-partner"
  | "portfolio-availability";

export type CollaborationQuickMatchTone = "accent" | "cool" | "good" | "warn";

export interface CollaborationQuickMatchCheckpoint {
  readonly step: "01" | "02" | "03";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
}

export interface CollaborationQuickMatchScenario {
  readonly id: CollaborationQuickMatchId;
  readonly tone: CollaborationQuickMatchTone;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly subtitleKo: string;
  readonly subtitleEn: string;
  readonly badgeKo: string;
  readonly badgeEn: string;
  readonly filterType: CollaborationType;
  readonly filterRole: CollaborationRole | "all";
  readonly template: CollaborationTemplateKind;
  readonly composeHref: string;
  readonly checkpoints: readonly [
    CollaborationQuickMatchCheckpoint,
    CollaborationQuickMatchCheckpoint,
    CollaborationQuickMatchCheckpoint,
  ];
}

export type CollaborationAdvancedSuiteId =
  | "crew-planner"
  | "instant-quote"
  | "topic-huddle"
  | "recruitment-plaza"
  | "security-rbac";

export interface CollaborationAdvancedSuiteMeta {
  readonly id: CollaborationAdvancedSuiteId;
  readonly anchorId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly defaultOpen: boolean;
}

export function buildQuickMatchComposeHref(
  template: CollaborationTemplateKind,
): string {
  return `/collaborate/new?template=${template}`;
}

export const COLLABORATION_QUICK_MATCH_SCENARIOS: readonly CollaborationQuickMatchScenario[] =
  Object.freeze([
    {
      id: "deadline-ink-assist",
      tone: "accent",
      titleKo: "마감 임박 선화·채색 보조",
      titleEn: "Deadline line-art & color assist",
      subtitleKo: "이번 회차 선화·밑색 병목을 바로 나눠 맡길 작업자 찾기",
      subtitleEn: "Find line-art and flatting help for this episode's deadline",
      badgeKo: "의뢰 · 선화",
      badgeEn: "Commission · Line art",
      filterType: "commission",
      filterRole: "ink",
      template: "ink",
      composeHref: buildQuickMatchComposeHref("ink"),
      checkpoints: [
        {
          step: "01",
          labelKo: "분량·파일 규격",
          labelEn: "Cut count & files",
          detailKo: "컷 수(예: 15~30컷), 캔버스 해상도, .clip/.psd 레이어 분리 기준을 먼저 적어요.",
          detailEn: "Specify cut count, canvas resolution, and .clip/.psd layer rules upfront.",
        },
        {
          step: "02",
          labelKo: "마감·피드백 시점",
          labelEn: "Deadline & feedback",
          detailKo: "1차 납품일과 수정 회신 마감 시간을 한국 시간(KST) 기준으로 맞춰 두세요.",
          detailEn: "Align the first handoff date and revision cutoff in KST.",
        },
        {
          step: "03",
          labelKo: "보수·수정 횟수",
          labelEn: "Pay & revisions",
          detailKo: "컷당·회차당 단가, 포함 수정 횟수, 유료 테스트 여부를 공고에 명시하세요.",
          detailEn: "State per-cut/episode rate, included revision rounds, and paid test policy.",
        },
      ],
    },
    {
      id: "background-3d-cut",
      tone: "cool",
      titleKo: "3D·배경 컷 외주",
      titleEn: "3D & background cut commission",
      subtitleKo: "건축·실내·소품 3D 배치와 배경 리터칭을 맡길 전문가 찾기",
      subtitleEn: "Commission 3D scene placement and background finishing",
      badgeKo: "의뢰 · 배경",
      badgeEn: "Commission · Background",
      filterType: "commission",
      filterRole: "background",
      template: "background",
      composeHref: buildQuickMatchComposeHref("background"),
      checkpoints: [
        {
          step: "01",
          labelKo: "배경 분량·시점",
          labelEn: "Scope & camera angles",
          detailKo: "필요한 배경 컷 수와 스케치업·블렌더 원본 납품 포함 여부를 적어 두세요.",
          detailEn: "Clarify cut count and whether raw SketchUp/Blender scenes are delivered.",
        },
        {
          step: "02",
          labelKo: "소재 라이선스",
          labelEn: "Asset licensing",
          detailKo: "상업 연재에 쓸 수 있는 3D 소재 출처와 2차 활용 허용 범위를 확인하세요.",
          detailEn: "Verify commercial serialization rights for every 3D asset used.",
        },
        {
          step: "03",
          labelKo: "납품 단계·정산",
          labelEn: "Milestones & payout",
          detailKo: "구도 확인(1차)과 리터칭 최종본(2차) 일정, 납품 후 지급일을 합의하세요.",
          detailEn: "Agree on layout check, final retouch delivery, and post-handoff payout date.",
        },
      ],
    },
    {
      id: "longterm-serial-partner",
      tone: "good",
      titleKo: "장기 연재 파트너 구함",
      titleEn: "Long-term serial partner",
      subtitleKo: "글·콘티·작화를 주간 연재 호흡으로 함께 끌고 갈 팀원 모집",
      subtitleEn: "Recruit a story or art teammate for ongoing serialization",
      badgeKo: "팀원 · 콘티",
      badgeEn: "Team · Story",
      filterType: "team",
      filterRole: "story",
      template: "team",
      composeHref: buildQuickMatchComposeHref("team"),
      checkpoints: [
        {
          step: "01",
          labelKo: "역할·분업 범위",
          labelEn: "Role & ownership",
          detailKo: "콘티·연출·작화·마감 검수 중 각자 맡는 공정과 주당 투입 시간을 정하세요.",
          detailEn: "Define who owns storyboards, art, final checks, and weekly hours.",
        },
        {
          step: "02",
          labelKo: "목표 일정·회차",
          labelEn: "Schedule & episodes",
          detailKo: "투고 목표 플랫폼, 세이브 원고 목표 회차, 주간 회의 요일을 먼저 맞추세요.",
          detailEn: "Align target platform, buffer episode count, and weekly check-in cadence.",
        },
        {
          step: "03",
          labelKo: "지분·크레딧·하차",
          labelEn: "Splits, credits & exit",
          detailKo: "수익 배분 비율, 공동 저작 표기, 중도 하차 시 원고 사용 조건을 서면화하세요.",
          detailEn: "Document revenue split, co-author credits, and exit terms in writing.",
        },
      ],
    },
    {
      id: "portfolio-availability",
      tone: "warn",
      titleKo: "내 포트폴리오·가능 일정 홍보",
      titleEn: "Promote portfolio & availability",
      subtitleKo: "작업 가능한 요일·단가·대표 컷을 올려 의뢰 제안을 바로 받기",
      subtitleEn: "Share your available schedule, rates, and sample cuts to get hired",
      badgeKo: "홍보 · 전체",
      badgeEn: "Available · All",
      filterType: "available",
      filterRole: "all",
      template: "ink",
      composeHref: buildQuickMatchComposeHref("ink"),
      checkpoints: [
        {
          step: "01",
          labelKo: "대표 공정·샘플",
          labelEn: "Core stage & samples",
          detailKo: "가장 자신 있는 공정(선화·채색·배경)과 공개 가능한 대표 컷 링크를 첨부하세요.",
          detailEn: "Highlight your strongest stage and link public sample cuts you have rights to show.",
        },
        {
          step: "02",
          labelKo: "가능 일정·분량",
          labelEn: "Availability & capacity",
          detailKo: "즉시 투입 가능한 날짜와 주당 소화 가능한 컷 수를 구체적으로 적어 두세요.",
          detailEn: "List your earliest start date and realistic weekly cut capacity.",
        },
        {
          step: "03",
          labelKo: "희망 단가·연락",
          labelEn: "Rates & private contact",
          detailKo: "최소 희망 단가와 작업 툴을 밝히고, 개인 연락처는 공개 본문에 적지 마세요.",
          detailEn: "Share base rates and tools, and keep private contact details out of public text.",
        },
      ],
    },
  ]);

export const COLLABORATION_ADVANCED_SUITES: readonly CollaborationAdvancedSuiteMeta[] =
  Object.freeze([
    {
      id: "crew-planner",
      anchorId: "collab-suite-crew",
      labelKo: "주간 분업 시뮬레이터",
      labelEn: "Weekly crew planner",
      summaryKo: "컷 수별 작업 시간·외주비·마감 여유 계산",
      summaryEn: "Estimate weekly hours, outsourcing cost, and deadline margin",
      defaultOpen: false,
    },
    {
      id: "instant-quote",
      anchorId: "collab-suite-quote",
      labelKo: "즉시 견적·파트너 매칭",
      labelEn: "Instant quote & matcher",
      summaryKo: "공정·긴급도·권리 범위별 예상 견적 산출",
      summaryEn: "Calculate per-cut estimates by urgency and IP scope",
      defaultOpen: false,
    },
    {
      id: "topic-huddle",
      anchorId: "collab-suite-huddle",
      labelKo: "회차 토픽·허들·읽음 확인",
      labelEn: "Topic huddles & receipts",
      summaryKo: "외주 접근 범위 분리와 수정 지시 읽음 확인",
      summaryEn: "Isolate guest topics and verify revision read receipts",
      defaultOpen: false,
    },
    {
      id: "recruitment-plaza",
      anchorId: "collab-suite-plaza",
      labelKo: "실시간 구인 광장",
      labelEn: "Live recruitment plaza",
      summaryKo: "긴급 대타·파티 슬롯 실시간 매칭",
      summaryEn: "Match urgent fill-in slots and multi-role parties",
      defaultOpen: true,
    },
    {
      id: "security-rbac",
      anchorId: "collab-suite-rbac",
      labelKo: "보안 역할·권한(RBAC)",
      labelEn: "Security roles (RBAC)",
      summaryKo: "작품·레이어 단위 접근 권한 및 감사 로그",
      summaryEn: "Manage layer-level access permissions and audit logs",
      defaultOpen: true,
    },
  ]);

/**
 * URL 검색 파라미터(`type`, `role`)가 정확히 일치하는 퀵매치 시나리오를 찾는다.
 */
export function resolveActiveQuickMatchScenario(
  params: Pick<URLSearchParams, "get">,
): CollaborationQuickMatchScenario | null {
  const currentType = params.get("type") || "all";
  const currentRole = params.get("role") || "all";
  return (
    COLLABORATION_QUICK_MATCH_SCENARIOS.find(
      (scenario) =>
        scenario.filterType === currentType &&
        scenario.filterRole === currentRole,
    ) ?? null
  );
}

/**
 * 선택한 퀵매치 시나리오의 `type`과 `role`을 URL 검색 파라미터에 동시 적용한다.
 * 이미 활성화된 시나리오를 다시 누르면 `type`과 `role`만 깔끔하게 해제한다.
 */
export function applyQuickMatchToSearchParams(
  current: URLSearchParams,
  scenario: CollaborationQuickMatchScenario,
): URLSearchParams {
  const next = new URLSearchParams(current);
  next.delete("cursor");

  const alreadyActive =
    (current.get("type") || "all") === scenario.filterType &&
    (current.get("role") || "all") === scenario.filterRole;

  if (alreadyActive) {
    next.delete("type");
    next.delete("role");
    return next;
  }

  next.set("type", scenario.filterType);
  if (scenario.filterRole === "all") {
    next.delete("role");
  } else {
    next.set("role", scenario.filterRole);
  }
  return next;
}

const COLLABORATION_FILTER_KEYS = [
  "type",
  "role",
  "q",
  "payType",
  "workMode",
  "status",
] as const;

export function hasActiveCollaborationFilters(
  params: Pick<URLSearchParams, "get">,
): boolean {
  return COLLABORATION_FILTER_KEYS.some((key) => {
    const value = params.get(key);
    return Boolean(value && value !== "all");
  });
}

/**
 * 퀵매치 및 검색 필터 파라미터를 초기화한다. 로그인 사용자의 `view` 탭은 유지한다.
 */
export function clearCollaborationQuickMatchParams(
  current: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams();
  const view = current.get("view");
  if (view && view !== "all") {
    next.set("view", view);
  }
  return next;
}
