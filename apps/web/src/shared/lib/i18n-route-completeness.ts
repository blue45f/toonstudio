/**
 * 영문 동선 완결 실측 — 라우트 그룹별 한국어 단절 판정 (G7).
 *
 * 배경: 파일 단위 전수 목록(en-flow-hardcoded-inventory, 86,792건)은 있으나
 * "어느 라우트 동선이 영문으로 완결됐는가"를 판정하는 기준이 없어 partial이
 * 고착됐다. 이 모듈이 그 판정을 고정한다:
 *
 * - 단위는 라우트 그룹(app-routes.tsx의 그룹 + 전역 셸)이다. 각 그룹은
 *   소스 접두사를 최장일치(longest-prefix)로 단독 소유하므로 파일이 두
 *   그룹에 중복 계산되지 않는다.
 * - 판정은 숫자만으로 결정된다: critical = 로딩+에러 단절 건수.
 *   complete(완결) = 단절 0건 / critical-clear(핵심 동선 무단절) =
 *   critical 0건이나 라벨 단절 잔존 / broken(단절) = critical 1건 이상.
 * - 전체 게이트: P0 그룹 전부 + 전역 셸이 critical-clear 이상일 때만
 *   "핵심 영문 동선 완결"로 판정한다.
 * - 기준선(baseline)은 2026-10-14 전수 스캔 고정값이다. 재스캔 결과는
 *   기준선 이하(감소)만 허용하는 래칫으로 테스트가 강제한다.
 */

export type EnFlowTier = "P0" | "P1" | "P2";

export type EnFlowVerdict = "complete" | "critical-clear" | "broken";

export interface EnFlowRouteGroup {
  readonly id: string;
  /** 대표 라우트 경로 (app/routes/groups 실측). */
  readonly representativePaths: readonly string[];
  /** 이 그룹이 단독 소유하는 소스 접두사. 최장일치로 배정한다. */
  readonly sourcePrefixes: readonly string[];
  readonly tier: EnFlowTier;
}

export interface EnFlowGroupCounts {
  readonly loading: number;
  readonly error: number;
  readonly other: number;
  readonly filesWithBreaks: number;
}

export interface EnFlowGroupResult extends EnFlowGroupCounts {
  readonly id: string;
  readonly tier: EnFlowTier;
  readonly critical: number;
  readonly total: number;
  readonly verdict: EnFlowVerdict;
}

/** 사용자 동선 순서 기준 우선순위: 진입·탐색·제작·게시(P0) → 거래·협업·계정(P1) → 나머지(P2). */
export const EN_FLOW_ROUTE_GROUPS: readonly EnFlowRouteGroup[] = [
  {
    id: "global-shell",
    representativePaths: ["* (전 라우트 공통 셸)"],
    sourcePrefixes: ["apps/web/src/app/", "apps/web/src/shared/", "apps/web/src/platform/"],
    tier: "P0",
  },
  {
    id: "catalog",
    representativePaths: ["/", "/explore", "/calendar", "/search", "/library"],
    sourcePrefixes: ["apps/web/src/domains/catalog/"],
    tier: "P0",
  },
  {
    id: "creator-studio",
    representativePaths: ["/studio", "/studio/new", "/studio/editor"],
    sourcePrefixes: ["apps/web/src/domains/creator/", "apps/web/src/domains/creator-ecosystem/"],
    tier: "P0",
  },
  {
    id: "production",
    representativePaths: ["/production", "/production/projects", "/team/people"],
    sourcePrefixes: [
      "apps/web/src/domains/creator/production-hub/",
      "apps/web/src/domains/creator/studio-production/",
    ],
    tier: "P0",
  },
  {
    id: "market",
    representativePaths: ["/market", "/market/browse", "/market/checkout/:id"],
    sourcePrefixes: ["apps/web/src/domains/market/"],
    tier: "P1",
  },
  {
    id: "creator-resources",
    representativePaths: ["/resources", "/studio/assets"],
    sourcePrefixes: ["apps/web/src/domains/creator-resources/"],
    tier: "P1",
  },
  {
    id: "collaboration-community",
    representativePaths: ["/collaborate", "/community", "/reviews"],
    sourcePrefixes: ["apps/web/src/domains/collaboration/", "apps/web/src/domains/community/"],
    tier: "P1",
  },
  {
    id: "account",
    representativePaths: ["/account", "/notifications/messages"],
    sourcePrefixes: [
      "apps/web/src/domains/account/",
      "apps/web/src/domains/auth/",
      "apps/web/src/domains/messages/",
    ],
    tier: "P1",
  },
  {
    id: "engagement",
    representativePaths: ["/notifications", "/lists/:slug"],
    sourcePrefixes: ["apps/web/src/domains/engagement/", "apps/web/src/domains/author-notices/"],
    tier: "P1",
  },
  {
    id: "learn",
    representativePaths: ["/learn", "/guide"],
    sourcePrefixes: ["apps/web/src/domains/learn/"],
    tier: "P1",
  },
  {
    id: "legal",
    representativePaths: ["/about", "/about/technology"],
    sourcePrefixes: ["apps/web/src/domains/legal/"],
    tier: "P2",
  },
  {
    id: "marketing",
    representativePaths: ["/home", "/features", "/pricing"],
    sourcePrefixes: ["apps/web/src/domains/marketing/"],
    tier: "P2",
  },
  {
    id: "experience",
    representativePaths: ["/fortune", "/play"],
    sourcePrefixes: [
      "apps/web/src/domains/fortune/",
      "apps/web/src/domains/play/",
      "apps/web/src/domains/promotion/",
    ],
    tier: "P2",
  },
  {
    id: "integrations",
    representativePaths: ["/integrations"],
    sourcePrefixes: ["apps/web/src/domains/integrations/"],
    tier: "P2",
  },
  {
    id: "admin",
    representativePaths: ["/admin"],
    sourcePrefixes: ["apps/web/src/domains/admin/"],
    tier: "P2",
  },
  {
    id: "monetization",
    representativePaths: ["/creator/revenue", "/memberships"],
    sourcePrefixes: ["apps/web/src/domains/monetization/"],
    tier: "P2",
  },
  {
    id: "newsletter",
    representativePaths: ["/newsletter"],
    sourcePrefixes: ["apps/web/src/domains/newsletter/"],
    tier: "P2",
  },
  {
    id: "cuts",
    representativePaths: ["/cuts"],
    sourcePrefixes: ["apps/web/src/domains/cuts/"],
    tier: "P2",
  },
  {
    id: "character-chat",
    representativePaths: ["/character-chat"],
    sourcePrefixes: ["apps/web/src/domains/character-chat/"],
    tier: "P2",
  },
];

/**
 * 2026-10-14 전수 스캔(en-flow-hardcoded-inventory/inventory.json, 86,792건)을
 * 위 소유 규칙으로 집계한 고정 기준선. 합계가 스캔 총계와 일치하고
 * 미배정 파일이 0건임을 테스트가 고정한다. 재스캔 시 이 값은 감소만 허용.
 */
export const EN_FLOW_BASELINE_2026_10_14: Readonly<Record<string, EnFlowGroupCounts>> = {
  "global-shell": { loading: 87, error: 405, other: 3703, filesWithBreaks: 187 },
  catalog: { loading: 23, error: 39, other: 363, filesWithBreaks: 24 },
  "creator-studio": { loading: 1273, error: 8030, other: 55028, filesWithBreaks: 2496 },
  production: { loading: 51, error: 361, other: 3618, filesWithBreaks: 111 },
  market: { loading: 24, error: 83, other: 1071, filesWithBreaks: 61 },
  "creator-resources": { loading: 42, error: 205, other: 2841, filesWithBreaks: 75 },
  "collaboration-community": { loading: 85, error: 118, other: 893, filesWithBreaks: 56 },
  account: { loading: 31, error: 75, other: 398, filesWithBreaks: 27 },
  engagement: { loading: 14, error: 32, other: 298, filesWithBreaks: 16 },
  learn: { loading: 14, error: 84, other: 2086, filesWithBreaks: 27 },
  legal: { loading: 30, error: 158, other: 2058, filesWithBreaks: 106 },
  marketing: { loading: 6, error: 11, other: 681, filesWithBreaks: 30 },
  experience: { loading: 31, error: 67, other: 1632, filesWithBreaks: 75 },
  integrations: { loading: 23, error: 50, other: 313, filesWithBreaks: 19 },
  admin: { loading: 6, error: 12, other: 202, filesWithBreaks: 12 },
  monetization: { loading: 2, error: 0, other: 16, filesWithBreaks: 10 },
  newsletter: { loading: 0, error: 3, other: 4, filesWithBreaks: 4 },
  cuts: { loading: 0, error: 0, other: 54, filesWithBreaks: 7 },
  "character-chat": { loading: 0, error: 4, other: 54, filesWithBreaks: 6 },
};

/** 파일 경로를 소유 그룹에 배정한다 (최장 접두사 일치, 없으면 null). */
export function assignEnFlowGroup(filePath: string): string | null {
  let best: string | null = null;
  let bestLength = -1;
  for (const group of EN_FLOW_ROUTE_GROUPS) {
    for (const prefix of group.sourcePrefixes) {
      if (filePath.startsWith(prefix) && prefix.length > bestLength) {
        best = group.id;
        bestLength = prefix.length;
      }
    }
  }
  return best;
}

export function verdictForCounts(counts: EnFlowGroupCounts): EnFlowVerdict {
  const critical = counts.loading + counts.error;
  if (critical + counts.other === 0) return "complete";
  if (critical === 0) return "critical-clear";
  return "broken";
}

export function evaluateEnFlowGroup(
  group: EnFlowRouteGroup,
  counts: EnFlowGroupCounts,
): EnFlowGroupResult {
  const critical = counts.loading + counts.error;
  return {
    ...counts,
    id: group.id,
    tier: group.tier,
    critical,
    total: critical + counts.other,
    verdict: verdictForCounts(counts),
  };
}

export interface EnFlowSummary {
  readonly results: readonly EnFlowGroupResult[];
  readonly totalBreaks: number;
  readonly totalCritical: number;
  readonly completeGroups: number;
  readonly criticalClearGroups: number;
  /** P0 그룹 + 전역 셸이 전부 critical-clear 이상일 때만 true. */
  readonly coreFlowComplete: boolean;
  /** 전 그룹 complete일 때만 true — G7 최종 판정. */
  readonly allRoutesComplete: boolean;
}

export function summarizeEnFlow(
  snapshot: Readonly<Record<string, EnFlowGroupCounts>>,
): EnFlowSummary {
  const empty: EnFlowGroupCounts = { loading: 0, error: 0, other: 0, filesWithBreaks: 0 };
  const results = EN_FLOW_ROUTE_GROUPS.map((group) =>
    evaluateEnFlowGroup(group, snapshot[group.id] ?? empty),
  );
  const p0Clear = results
    .filter((result) => result.tier === "P0")
    .every((result) => result.verdict !== "broken");
  return {
    results,
    totalBreaks: results.reduce((sum, result) => sum + result.total, 0),
    totalCritical: results.reduce((sum, result) => sum + result.critical, 0),
    completeGroups: results.filter((result) => result.verdict === "complete").length,
    criticalClearGroups: results.filter((result) => result.verdict !== "broken").length,
    coreFlowComplete: p0Clear,
    allRoutesComplete: results.every((result) => result.verdict === "complete"),
  };
}

/** 재스캔 결과가 기준선보다 늘어난 그룹 id 목록 (래칫 위반). 감소·동일만 허용. */
export function findEnFlowRegressions(
  snapshot: Readonly<Record<string, EnFlowGroupCounts>>,
  baseline: Readonly<Record<string, EnFlowGroupCounts>> = EN_FLOW_BASELINE_2026_10_14,
): string[] {
  const regressed: string[] = [];
  for (const group of EN_FLOW_ROUTE_GROUPS) {
    const current = snapshot[group.id];
    const base = baseline[group.id];
    if (!current || !base) continue;
    if (
      current.loading + current.error > base.loading + base.error ||
      current.other > base.other
    ) {
      regressed.push(group.id);
    }
  }
  return regressed;
}
