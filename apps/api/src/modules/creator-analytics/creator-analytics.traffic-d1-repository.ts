import type {
  TrafficD1Executor,
  TrafficD1Statement,
} from "../traffic-analytics/traffic-analytics-d1.client";

import { CreatorAnalyticsNotConnectedError } from "./creator-analytics.service";
import {
  escapeLikePattern,
  splitPathViews,
  type PathViewsRow,
  type SourceVisitsRow,
} from "./creator-analytics.traffic-repository";
import type {
  CreatorAnalyticsTrafficReader,
  CreatorAnalyticsTrafficStats,
  CreatorAnalyticsTrafficWindow,
} from "./creator-analytics.traffic-source";

// D1 트래픽 리더 — TRAFFIC_ANALYTICS_STORE=d1 배포에서 Postgres 리더와 같은
// 계약(CreatorAnalyticsTrafficReader)으로 D1(SQLite)의 traffic_page_view를
// 시리즈(slug) 단위로 집계한다.
//
// Postgres 리더와의 차이만 방언으로 흡수한다:
// - 준비 확인은 to_regclass 대신 sqlite_master 조회다. 테이블이 없으면
//   Postgres 리더와 같이 "연결 전"(CreatorAnalyticsNotConnectedError)으로
//   떨어지고, RPC 전송 오류는 그대로 전파한다(0을 실측처럼 내지 않는다).
// - occurred_at은 D1 수집 경로가 ISO 문자열(TEXT)로 저장하므로 기간 비교도
//   ISO 문자열로 한다(traffic-analytics-d1.repository.ts와 같은 규약).
// - 봇 제외는 is_bot = 0, 집계는 count(*) — 의미는 Postgres와 동일하다.
// 경로 분리·LIKE 이스케이프는 Postgres 리더의 공용 헬퍼를 그대로 쓴다.

export class D1CreatorAnalyticsTrafficReader
  implements CreatorAnalyticsTrafficReader
{
  constructor(private readonly executor: TrafficD1Executor) {}

  async readWindowStats(
    slug: string,
    window: CreatorAnalyticsTrafficWindow,
  ): Promise<CreatorAnalyticsTrafficStats> {
    const detailPath = `/title/${slug}`;
    // 준비 확인을 먼저 단독으로 실행한다 — 테이블이 없을 때 뒤 쿼리의
    // "no such table" 오류가 아니라 "연결 전"으로 떨어지게 하기 위해서다.
    const [readiness] = await this.executor.execute([
      {
        sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'traffic_page_view'",
        params: [],
      },
    ]);
    if ((readiness?.results.length ?? 0) === 0) {
      throw new CreatorAnalyticsNotConnectedError();
    }
    const statements: readonly TrafficD1Statement[] = [
      pathViewsStatement(detailPath, window.start, window.end),
      pathViewsStatement(detailPath, window.previousStart, window.start),
      sourceVisitsStatement(detailPath, window.start, window.end),
    ];
    const [current, previous, sources] = await this.executor.execute(statements);
    const currentSplit = splitPathViews(
      detailPath,
      parsePathViews(current?.results ?? []),
    );
    const previousSplit = splitPathViews(
      detailPath,
      parsePathViews(previous?.results ?? []),
    );
    return {
      detailViews: currentSplit.detailViews,
      episodeViews: currentSplit.episodeViews,
      previousDetailViews: previousSplit.detailViews,
      previousEpisodeViews: previousSplit.episodeViews,
      sources: parseSourceVisits(sources?.results ?? []),
    };
  }
}

function pathViewsStatement(
  detailPath: string,
  start: Date,
  end: Date,
): TrafficD1Statement {
  return {
    sql: `SELECT path, count(*) AS views
            FROM traffic_page_view
           WHERE occurred_at >= ? AND occurred_at < ?
             AND is_bot = 0
             AND (path = ? OR path LIKE ? ESCAPE '\\')
           GROUP BY path`,
    params: [
      start.toISOString(),
      end.toISOString(),
      detailPath,
      `${escapeLikePattern(detailPath)}/%`,
    ],
  };
}

function sourceVisitsStatement(
  detailPath: string,
  start: Date,
  end: Date,
): TrafficD1Statement {
  return {
    sql: `SELECT source, medium, count(*) AS visits
            FROM traffic_page_view
           WHERE occurred_at >= ? AND occurred_at < ?
             AND is_bot = 0
             AND (path = ? OR path LIKE ? ESCAPE '\\')
           GROUP BY source, medium
           ORDER BY visits DESC
           LIMIT 12`,
    params: [
      start.toISOString(),
      end.toISOString(),
      detailPath,
      `${escapeLikePattern(detailPath)}/%`,
    ],
  };
}

function parsePathViews(
  rows: readonly Record<string, unknown>[],
): readonly PathViewsRow[] {
  const parsed: PathViewsRow[] = [];
  for (const row of rows) {
    if (typeof row.path === "string") {
      parsed.push({ path: row.path, views: toCount(row.views) });
    }
  }
  return parsed;
}

function parseSourceVisits(
  rows: readonly Record<string, unknown>[],
): readonly SourceVisitsRow[] {
  const parsed: SourceVisitsRow[] = [];
  for (const row of rows) {
    if (typeof row.source === "string" && typeof row.medium === "string") {
      parsed.push({
        source: row.source,
        medium: row.medium,
        visits: toCount(row.visits),
      });
    }
  }
  return parsed;
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}
