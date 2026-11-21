/**
 * 실제 툰스튜디오 사이트 전체 페이지 중복·유사 라우트 전수 감사 및 통합 정본 모델.
 *
 * `catalog.routes.tsx`, `marketing.routes.tsx`, `creator.routes.tsx`, `legal.routes.tsx`,
 * `creator-resources.routes.tsx`, `market.routes.tsx`, `production.routes.tsx`,
 * `community.routes.tsx`에 실재하는 4대 중복·유사 구간(13개 라우트)을 단일 정본(Canonical)과
 * 명확한 역할 경계로 구조화한다.
 */

export type PageConsolidationStrategy = "single-canonical" | "role-separation" | "role-convergence";
export type PageRouteDisposition = "canonical" | "redirect-to-canonical" | "absorb-into-tab" | "role-canonical";
export type PageConsolidationFilter = "all" | "single-canonical" | "role-split";

export interface PageConsolidationRouteEntry {
  readonly path: string;
  readonly disposition: PageRouteDisposition;
  readonly destinationPath: string;
  readonly roleSummaryKo: string;
  readonly migrationActionKo: string;
}

export interface PageConsolidationGroup {
  readonly id:
    | "discover-consolidation"
    | "support-consolidation"
    | "materials-assets-separation"
    | "collaboration-convergence";
  readonly titleKo: string;
  readonly strategy: PageConsolidationStrategy;
  readonly canonicalPath: string;
  readonly problemSummaryKo: string;
  readonly decisionSummaryKo: string;
  readonly accentSlot: 1 | 2 | 3 | 4;
  readonly routes: readonly PageConsolidationRouteEntry[];
  readonly checklistKo: readonly string[];
}

export interface PageConsolidationAuditSummary {
  readonly groupCount: number;
  readonly totalRoutesAudited: number;
  readonly canonicalAnchorCount: number;
  readonly redirectOrAbsorbCount: number;
  readonly distinctRoleCount: number;
}

export const PAGE_CONSOLIDATION_AUDIT_MAP: readonly PageConsolidationGroup[] = Object.freeze([
  {
    id: "discover-consolidation",
    titleKo: "탐색 중복 구간 → /discover 단일 정본",
    strategy: "single-canonical",
    canonicalPath: "/discover",
    problemSummaryKo:
      "작품·소재·창작자 탐색 입구가 /discover, /explore, /hub 세 곳에 분산되어 첫 방문자가 어느 탭에서 시작할지 헷갈립니다.",
    decisionSummaryKo:
      "/discover를 유일한 통합 탐색 정본으로 고정하고, /explore는 필터 쿼리를 보존한 채 리다이렉트, /hub는 큐레이션 탭으로 흡수합니다.",
    accentSlot: 1,
    routes: [
      {
        path: "/discover",
        disposition: "canonical",
        destinationPath: "/discover",
        roleSummaryKo: "작품·장르·태그·큐레이션 통합 탐색 정본 허브",
        migrationActionKo: "내비게이션 1차 진입점으로 고정 유지",
      },
      {
        path: "/explore",
        disposition: "redirect-to-canonical",
        destinationPath: "/discover",
        roleSummaryKo: "기존 장르·태그 탐색 별칭 표면",
        migrationActionKo: "장르·태그 쿼리 보존 상태로 /discover 리다이렉트 흡수",
      },
      {
        path: "/hub",
        disposition: "absorb-into-tab",
        destinationPath: "/discover?tab=studio-picks",
        roleSummaryKo: "작품·소재·사람 둘러보기 워크스페이스 표면",
        migrationActionKo: "/discover 내부 추천·큐레이션 탭으로 병합",
      },
    ],
    checklistKo: [
      "상단 메뉴·푸터·명령 팔레트 탐색 링크를 /discover 하나로 단일화",
      "기존 /explore·/hub 북마크 접속 시 쿼리를 잃지 않고 /discover로 즉시 이동",
      "검색·랭킹·연재 캘린더는 /discover 하위 보조 필터로 연결",
    ],
  },
  {
    id: "support-consolidation",
    titleKo: "고객센터·도움말 중복 → /studio/support 통합 허브",
    strategy: "single-canonical",
    canonicalPath: "/studio/support",
    problemSummaryKo:
      "창작자 지원(/studio/support), 일반 문의(/support), 도움말(/help)이 세 페이지로 갈라져 장애 신고와 FAQ 동선이 끊깁니다.",
    decisionSummaryKo:
      "/studio/support를 FAQ·장애 진단·문의 접수·저작권 지원을 묶은 통합 지원 정본으로 삼고 /support와 /help를 섹션 딥링크로 수렴합니다.",
    accentSlot: 2,
    routes: [
      {
        path: "/studio/support",
        disposition: "canonical",
        destinationPath: "/studio/support",
        roleSummaryKo: "FAQ·문의 접수·진단·저작권 지원 통합 고객센터 정본",
        migrationActionKo: "전역 고객지원 단일 정본 허브로 승격",
      },
      {
        path: "/support",
        disposition: "redirect-to-canonical",
        destinationPath: "/studio/support?section=inquiry",
        roleSummaryKo: "일반 사용자 문의 접수 별칭 표면",
        migrationActionKo: "/studio/support 문의 섹션으로 자동 리다이렉트",
      },
      {
        path: "/help",
        disposition: "absorb-into-tab",
        destinationPath: "/studio/support?section=faq",
        roleSummaryKo: "사용 안내·자주 묻는 질문 문서 표면",
        migrationActionKo: "/studio/support FAQ·가이드 탭으로 통합 흡수",
      },
    ],
    checklistKo: [
      "오류 안내 배너와 푸터 고객지원 링크를 /studio/support로 일원화",
      "독자 문의와 창작자 기술 지원을 같은 허브 안에서 탭으로 즉시 분기",
      "기존 /support·/help 외부 링크는 section 쿼리로 매끄럽게 착지",
    ],
  },
  {
    id: "materials-assets-separation",
    titleKo: "소재·에셋 3갈래 → 무료 검색·유료 마켓·내 소재함 역할 분리",
    strategy: "role-separation",
    canonicalPath: "/studio/assets",
    problemSummaryKo:
      "무료 공공 소재(/research/materials), 유료 거래(/market), 작업용 내 소재함(/studio/assets)의 경계가 흐려져 사용자가 어디서 찾고 관리할지 혼동합니다.",
    decisionSummaryKo:
      "세 경로를 무리하게 합치지 않고 '무료/CC0 검색 · 유료 거래 · 내 소재함' 3원 역할로 명확히 분리하고 상단 전환 칩으로 연결합니다.",
    accentSlot: 3,
    routes: [
      {
        path: "/research/materials",
        disposition: "role-canonical",
        destinationPath: "/research/materials",
        roleSummaryKo: "통합 무료·CC0·공공데이터 소재 검색 및 출처 검증",
        migrationActionKo: "무료/CC0 원천 검색 전용 정본으로 역할 고정",
      },
      {
        path: "/market",
        disposition: "role-canonical",
        destinationPath: "/market",
        roleSummaryKo: "유료 에셋·브러시·3D 배경 거래 및 상업 라이선스 구매",
        migrationActionKo: "유료 거래·결제·판매자 정산 전용 정본으로 분리",
      },
      {
        path: "/studio/assets",
        disposition: "role-canonical",
        destinationPath: "/studio/assets",
        roleSummaryKo: "내 소재함 · 보유 에셋 · Rights BOM 관리 및 캔버스 투입",
        migrationActionKo: "작업실 직결 내 소재함 정본으로 확정",
      },
    ],
    checklistKo: [
      "각 헤더에 [무료·CC0 검색] · [유료 마켓] · [내 소재함] 역할 배지 명시",
      "/research/materials·/market에서 담은 소재는 모두 /studio/assets로 일괄 수거",
      "출력 전 Rights BOM 라이선스 검증은 /studio/assets 단일 기준 사용",
    ],
  },
  {
    id: "collaboration-convergence",
    titleKo: "협업 4갈래 → 관제·실시간 공간·권한·공개 구인 역할 수렴",
    strategy: "role-convergence",
    canonicalPath: "/production",
    problemSummaryKo:
      "협업 기능이 /production, /studio/space, /team, /collaborate 네 곳에 흩어져 분업 관리와 실시간 공동 작업, 구인 게시판이 서로 겹칩니다.",
    decisionSummaryKo:
      "/production을 분업·외주·휴재 관제 정본으로 세우고, /studio/space(실시간 공간)·/team(팀 권한)·/collaborate(공개 구인) 세 보조 표면으로 역할을 수렴합니다.",
    accentSlot: 4,
    routes: [
      {
        path: "/production",
        disposition: "canonical",
        destinationPath: "/production",
        roleSummaryKo: "분업 배정·외주 검수·휴재 일정·마감 관제 정본",
        migrationActionKo: "협업·제작 운영 최상위 정본 허브로 고정",
      },
      {
        path: "/studio/space",
        disposition: "role-canonical",
        destinationPath: "/studio/space",
        roleSummaryKo: "실시간 가상 스튜디오·공동 캔버스·라이브 피드백 공간",
        migrationActionKo: "실시간 작업실 전용 표면으로 경계 고정",
      },
      {
        path: "/team",
        disposition: "role-canonical",
        destinationPath: "/team",
        roleSummaryKo: "팀 멤버 초대·권한 등급·사용량 관리 전용",
        migrationActionKo: "/team/people과 연계한 권한·조직 설정 전용으로 축소 명확화",
      },
      {
        path: "/collaborate",
        disposition: "role-canonical",
        destinationPath: "/collaborate",
        roleSummaryKo: "공개 어시스턴트·선화·채색 구인 및 외주 매칭 게시판",
        migrationActionKo: "외부 공개 구인·매칭 전용 창구로 역할 고정",
      },
    ],
    checklistKo: [
      "/production 대시보드에서 /studio/space·/team·/collaborate로 1클릭 분기 제공",
      "팀 권한 변경은 /team으로만 단일화해 /production과 중복 UI 제거",
      "외부 구인 모집글은 /collaborate에만 게시하고 채용 완료 시 /team으로 편입",
    ],
  },
]);

/** 전체 페이지 중복 감사 지도의 요약 통계를 집계한다. */
export function summarizePageConsolidationAudit(
  groups: readonly PageConsolidationGroup[] = PAGE_CONSOLIDATION_AUDIT_MAP,
): PageConsolidationAuditSummary {
  let totalRoutesAudited = 0;
  let canonicalAnchorCount = 0;
  let redirectOrAbsorbCount = 0;
  let distinctRoleCount = 0;

  for (const group of groups) {
    for (const route of group.routes) {
      totalRoutesAudited += 1;
      if (route.disposition === "canonical") canonicalAnchorCount += 1;
      else if (route.disposition === "redirect-to-canonical" || route.disposition === "absorb-into-tab") {
        redirectOrAbsorbCount += 1;
      } else {
        distinctRoleCount += 1;
      }
    }
  }

  return {
    groupCount: groups.length,
    totalRoutesAudited,
    canonicalAnchorCount,
    redirectOrAbsorbCount,
    distinctRoleCount,
  };
}

/** 통합 전략 기준으로 페이지 감사 구간을 필터링한다. */
export function filterPageConsolidationGroups(
  groups: readonly PageConsolidationGroup[],
  filter: PageConsolidationFilter,
): readonly PageConsolidationGroup[] {
  if (filter === "all") return groups;
  if (filter === "single-canonical") {
    return groups.filter((group) => group.strategy === "single-canonical");
  }
  return groups.filter(
    (group) => group.strategy === "role-separation" || group.strategy === "role-convergence",
  );
}
