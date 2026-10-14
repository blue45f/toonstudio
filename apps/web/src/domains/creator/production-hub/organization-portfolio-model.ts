import type { TeamWorkspaceDetail } from "@toonstudio/contracts/production-workspace";

import type { ProductionProjectSummary } from "./production-dashboard-api";

/**
 * 조직 포트폴리오 — 연결한 팀들의 작품을 한 표의 행으로 만든다.
 *
 * 데이터 경계(정직성 규칙):
 * - 작품 목록의 출처는 팀 상세(서버 계약)의 연결 작품뿐이다. 연결하지 않은 팀의 작품은 넣지 않는다.
 * - 진척 수치는 내가 접근 권한을 가진 작품의 포트폴리오 요약(/production/projects)에서만 온다.
 *   팀에 연결돼 있어도 작품 권한이 없으면 수치를 지어내지 않고 accessible=false + attention="unknown"으로 둔다.
 * - 조인 키는 workId다. 팀 상세의 작품과 포트폴리오 요약이 같은 작품을 가리키는 유일한 공통 식별자다.
 */

export type OrganizationPortfolioAttention = "critical" | "warning" | "ok" | "unknown";

export interface OrganizationPortfolioRow {
  readonly teamId: string;
  readonly teamName: string;
  /** 제작 프로젝트 id. 작품 개요 화면 경로(/production/projects/:id/overview)에 쓴다. */
  readonly projectId: string;
  readonly workId: string;
  readonly title: string;
  /** 포트폴리오 요약이 있어 수치를 표시할 수 있는가. false면 권한 없음으로만 표시한다. */
  readonly accessible: boolean;
  readonly healthScore: number | null;
  readonly activeEpisodeCount: number | null;
  readonly overdueTaskCount: number | null;
  readonly blockedTaskCount: number | null;
  readonly reviewTaskCount: number | null;
  readonly nextReleaseAt: string | null;
  readonly attention: OrganizationPortfolioAttention;
}

export interface OrganizationPortfolio {
  readonly rows: readonly OrganizationPortfolioRow[];
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly unknownCount: number;
}

const ATTENTION_ORDER: Record<OrganizationPortfolioAttention, number> = {
  critical: 0,
  warning: 1,
  ok: 2,
  unknown: 3,
};

/** 주의 단계 판정. 지연·치명 리스크가 있으면 critical, 막힘·낮은 건강도는 warning. 요약이 없으면 unknown. */
export function derivePortfolioAttention(
  summary: ProductionProjectSummary | undefined,
): OrganizationPortfolioAttention {
  if (!summary) return "unknown";
  if (summary.overdueTaskCount > 0 || summary.criticalRiskCount > 0) return "critical";
  if (summary.blockedTaskCount > 0 || summary.healthScore < 60) return "warning";
  return "ok";
}

function compareRows(a: OrganizationPortfolioRow, b: OrganizationPortfolioRow): number {
  const byAttention = ATTENTION_ORDER[a.attention] - ATTENTION_ORDER[b.attention];
  if (byAttention !== 0) return byAttention;
  // 다음 게시가 임박한 작품을 먼저. 게시 일정이 없으면 뒤로.
  if (a.nextReleaseAt && b.nextReleaseAt && a.nextReleaseAt !== b.nextReleaseAt) {
    return a.nextReleaseAt.localeCompare(b.nextReleaseAt);
  }
  if (a.nextReleaseAt && !b.nextReleaseAt) return -1;
  if (!a.nextReleaseAt && b.nextReleaseAt) return 1;
  return a.title.localeCompare(b.title);
}

/**
 * 연결 팀 상세 + 내 포트폴리오 요약을 작품 행으로 조인한다.
 * 같은 팀 상세가 중복으로 들어와도 (teamId, projectId) 기준으로 한 번만 넣는다.
 */
export function buildOrganizationPortfolio(
  details: readonly TeamWorkspaceDetail[],
  summaries: readonly ProductionProjectSummary[],
): OrganizationPortfolio {
  const summaryByWorkId = new Map(summaries.map((summary) => [summary.workId, summary]));
  const seen = new Set<string>();
  const rows: OrganizationPortfolioRow[] = [];
  for (const detail of details) {
    for (const project of detail.projects) {
      const key = `${detail.workspace.id}:${project.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const summary = summaryByWorkId.get(project.workId);
      rows.push({
        teamId: detail.workspace.id,
        teamName: detail.workspace.name,
        projectId: project.id,
        workId: project.workId,
        title: project.title,
        accessible: summary !== undefined,
        healthScore: summary?.healthScore ?? null,
        activeEpisodeCount: summary?.activeEpisodeCount ?? null,
        overdueTaskCount: summary?.overdueTaskCount ?? null,
        blockedTaskCount: summary?.blockedTaskCount ?? null,
        reviewTaskCount: summary?.reviewTaskCount ?? null,
        nextReleaseAt: summary?.nextReleaseAt ?? null,
        attention: derivePortfolioAttention(summary),
      });
    }
  }
  rows.sort(compareRows);
  return {
    rows,
    criticalCount: rows.filter((row) => row.attention === "critical").length,
    warningCount: rows.filter((row) => row.attention === "warning").length,
    unknownCount: rows.filter((row) => row.attention === "unknown").length,
  };
}
