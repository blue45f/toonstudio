import { dbPool } from "../../platform/database";

import { CreatorAnalyticsNotConnectedError } from "./creator-analytics.service";
import type {
  CreatorAnalyticsTrafficReader,
  CreatorAnalyticsTrafficStats,
  CreatorAnalyticsTrafficWindow,
} from "./creator-analytics.traffic-source";

// Postgres 트래픽 리더 — 수집 파이프라인이 쌓는 public.traffic_page_view를
// 시리즈(slug) 단위로 집계한다. 봇(is_bot)은 관리자 개요와 같은 기준으로 제외한다.
// D1 저장소(TRAFFIC_ANALYTICS_STORE=d1) 배포에서는 D1 리더
// (creator-analytics.traffic-d1-repository.ts)가 같은 계약으로 집계한다.
// 어느 쪽이든 저장소가 선택되지 않은 리더를 읽어 0을 실측처럼 내지 않는다.

export interface PathViewsRow {
  path: string;
  views: number;
}

export interface SourceVisitsRow {
  source: string;
  medium: string;
  visits: number;
}

export class PostgresCreatorAnalyticsTrafficReader
  implements CreatorAnalyticsTrafficReader
{
  async readWindowStats(
    slug: string,
    window: CreatorAnalyticsTrafficWindow,
  ): Promise<CreatorAnalyticsTrafficStats> {
    const readiness = await dbPool.query<{ ready: boolean }>(
      "SELECT to_regclass('public.traffic_page_view') IS NOT NULL AS ready",
    );
    if (readiness.rows[0]?.ready !== true) {
      throw new CreatorAnalyticsNotConnectedError();
    }

    const detailPath = `/title/${slug}`;
    const [current, previous, sources] = await Promise.all([
      this.pathViews(detailPath, window.start, window.end),
      this.pathViews(detailPath, window.previousStart, window.start),
      this.sourceVisits(detailPath, window.start, window.end),
    ]);
    const currentSplit = splitPathViews(detailPath, current);
    const previousSplit = splitPathViews(detailPath, previous);
    return {
      detailViews: currentSplit.detailViews,
      episodeViews: currentSplit.episodeViews,
      previousDetailViews: previousSplit.detailViews,
      previousEpisodeViews: previousSplit.episodeViews,
      sources,
    };
  }

  private async pathViews(
    detailPath: string,
    start: Date,
    end: Date,
  ): Promise<readonly PathViewsRow[]> {
    const result = await dbPool.query<PathViewsRow>(
      `SELECT path, count(*)::int AS views
         FROM public.traffic_page_view
        WHERE occurred_at >= $1 AND occurred_at < $2
          AND is_bot = false
          AND (path = $3 OR path LIKE $4)
        GROUP BY path`,
      [start, end, detailPath, `${escapeLikePattern(detailPath)}/%`],
    );
    return result.rows;
  }

  private async sourceVisits(
    detailPath: string,
    start: Date,
    end: Date,
  ): Promise<readonly SourceVisitsRow[]> {
    const result = await dbPool.query<SourceVisitsRow>(
      `SELECT source, medium, count(*)::int AS visits
         FROM public.traffic_page_view
        WHERE occurred_at >= $1 AND occurred_at < $2
          AND is_bot = false
          AND (path = $3 OR path LIKE $4)
        GROUP BY source, medium
        ORDER BY visits DESC
        LIMIT 12`,
      [start, end, detailPath, `${escapeLikePattern(detailPath)}/%`],
    );
    return result.rows;
  }
}

/** LIKE 패턴에서 패턴 문자(\, %, _)를 이스케이프한다. D1 리더와 공유한다. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// 경로 그룹을 상세 조회와 회차 조회로 나눈다. /title/:slug/episodes 같은
// 리다이렉트 경로는 소비로 세지 않고 버린다. D1 리더와 공유한다.
export function splitPathViews(
  detailPath: string,
  rows: readonly PathViewsRow[],
): { detailViews: number; episodeViews: Map<number, number> } {
  const episodeViews = new Map<number, number>();
  let detailViews = 0;
  const readPrefix = `${detailPath}/read/`;
  for (const row of rows) {
    if (row.path === detailPath) {
      detailViews += row.views;
      continue;
    }
    if (row.path.startsWith(readPrefix)) {
      const raw = row.path.slice(readPrefix.length);
      if (/^\d+$/.test(raw)) {
        const episode = Number(raw);
        if (episode >= 1) {
          episodeViews.set(episode, (episodeViews.get(episode) ?? 0) + row.views);
        }
      }
    }
  }
  return { detailViews, episodeViews };
}
