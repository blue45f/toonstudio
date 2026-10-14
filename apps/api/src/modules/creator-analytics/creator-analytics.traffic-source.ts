import type {
  CreatorAnalyticsPeriod,
  CreatorAnalyticsResponse,
  CreatorAnalyticsTrafficSource,
} from "./creator-analytics.dto";
import {
  computeDeltaPct,
  computeRetentionPoints,
  detectDropOffEpisodes,
  normalizeShares,
} from "./creator-analytics.math";
import {
  CreatorAnalyticsNotConnectedError,
  type CreatorAnalyticsAggregationSource,
} from "./creator-analytics.service";

// 트래픽 실집계 소스.
//
// 독서 트래픽(traffic_page_view — /title/:slug 상세와 /title/:slug/read/:episode
// 리더 경로)은 실제로 수집·저장되고 있어, 조회수·회차별 조회수·리텐션·유입 경로는
// 실측으로 집계할 수 있다. 반면 회차별 좋아요·댓글·구독 전환은 실측 저장소가
// 없다(review는 작품 단위, 구독은 기간 산출 불가) — 그래서 이 소스는:
// - KPI는 실측 가능한 views만 돌려준다(없는 지표를 0으로 채우지 않는다).
// - 회차 행의 likes/comments/newSubscribers는 DTO optional 계약대로 생략하고,
//   웹은 빈 값(—)으로 표시한다.
// - 유입 경로는 DTO의 고정 라벨 체계(홈/랭킹/…)로 강제 매핑하지 않고, 저장된
//   source/medium 분류를 있는 그대로 라벨링한다(direct만 "직접 방문"으로 번역).
// 시리즈 정체성은 공개 카탈로그 slug다(트래픽 경로가 slug 기준이므로).
// 카탈로그에 없는 seriesId는 지어내지 않고 연결 전(404)으로 처리한다.

export interface CreatorAnalyticsEpisodeMeta {
  readonly episode: number;
  readonly title: string;
  readonly publishedAt: string;
}

export interface CreatorAnalyticsSeriesRecord {
  /** 공개 식별자 = 카탈로그 slug (트래픽 경로와 같은 키) */
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly episodes: readonly CreatorAnalyticsEpisodeMeta[];
}

export interface CreatorAnalyticsSeriesCatalog {
  listSeries(): readonly CreatorAnalyticsSeriesRecord[];
  findSeries(seriesId: string): CreatorAnalyticsSeriesRecord | null;
}

export interface CreatorAnalyticsTrafficWindow {
  readonly start: Date;
  readonly end: Date;
  readonly previousStart: Date;
}

export interface CreatorAnalyticsTrafficStats {
  readonly detailViews: number;
  readonly episodeViews: ReadonlyMap<number, number>;
  readonly previousDetailViews: number;
  readonly previousEpisodeViews: ReadonlyMap<number, number>;
  readonly sources: readonly { source: string; medium: string; visits: number }[];
}

export interface CreatorAnalyticsTrafficReader {
  /**
   * 한 시리즈(slug)의 기간·직전 기간 조회 통계를 읽는다.
   * 저장소 자체가 없으면(테이블 미생성) CreatorAnalyticsNotConnectedError를 던져
   * "연결 전"으로 떨어지게 하고, 그 외 조회 오류는 그대로 전파한다.
   */
  readWindowStats(
    slug: string,
    window: CreatorAnalyticsTrafficWindow,
  ): Promise<CreatorAnalyticsTrafficStats>;
}

const PERIOD_DAYS: Readonly<Record<CreatorAnalyticsPeriod, number>> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export class TrafficCreatorAnalyticsSource
  implements CreatorAnalyticsAggregationSource
{
  constructor(
    private readonly catalog: CreatorAnalyticsSeriesCatalog,
    private readonly traffic: CreatorAnalyticsTrafficReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getAnalytics(
    period: CreatorAnalyticsPeriod,
    seriesId?: string,
  ): Promise<CreatorAnalyticsResponse> {
    const series = this.catalog.listSeries();
    const selected = seriesId
      ? this.catalog.findSeries(seriesId)
      : (series[0] ?? null);
    if (!selected) {
      // 카탈로그에 없는 시리즈는 집계를 지어내지 않는다 — 연결 전과 같은 404로
      // 떨어져 웹이 샘플 숫자를 보여 주지 않게 한다.
      throw new CreatorAnalyticsNotConnectedError(
        "이 시리즈의 실제 집계를 찾을 수 없어요. 공개된 시리즈인지 확인해 주세요.",
      );
    }

    const days = PERIOD_DAYS[period];
    const end = this.now();
    const start = new Date(end.getTime() - days * DAY_MS);
    const previousStart = new Date(start.getTime() - days * DAY_MS);
    const stats = await this.traffic.readWindowStats(selected.slug, {
      start,
      end,
      previousStart,
    });

    const episodeInputs = selected.episodes.map((episode) => ({
      episode: episode.episode,
      title: episode.title,
      views: stats.episodeViews.get(episode.episode) ?? 0,
    }));
    const retention = computeRetentionPoints(episodeInputs);
    const totalViews =
      stats.detailViews +
      episodeInputs.reduce((sum, episode) => sum + episode.views, 0);
    const previousTotalViews =
      stats.previousDetailViews +
      [...stats.previousEpisodeViews.values()].reduce(
        (sum, views) => sum + views,
        0,
      );

    return {
      seriesId: selected.id,
      period,
      generatedAt: end.toISOString(),
      mock: false,
      kpis: [
        {
          key: "views",
          value: totalViews,
          deltaPct: computeDeltaPct(totalViews, previousTotalViews),
        },
      ],
      retention,
      trafficSources: buildTrafficSources(stats.sources),
      episodes: selected.episodes.map((episode) => ({
        episode: episode.episode,
        title: episode.title,
        publishedAt: episode.publishedAt,
        views: stats.episodeViews.get(episode.episode) ?? 0,
        // likes/comments/newSubscribers: 회차 단위 실측 저장소가 없어 생략한다.
      })),
      dropOffEpisodes: detectDropOffEpisodes(retention),
      series: series.map((record) => ({
        id: record.id,
        title: record.title,
        episodeCount: record.episodes.length,
      })),
    };
  }
}

function buildTrafficSources(
  rows: readonly { source: string; medium: string; visits: number }[],
): CreatorAnalyticsTrafficSource[] {
  const sorted = [...rows]
    .filter((row) => row.visits > 0)
    .sort((a, b) => b.visits - a.visits);
  const shares = normalizeShares(sorted.map((row) => row.visits));
  return sorted.map((row, index) => {
    const labels = sourceLabels(row.source, row.medium);
    return {
      source: row.source,
      labelKo: labels.ko,
      labelEn: labels.en,
      visits: row.visits,
      sharePct: shares[index] ?? 0,
    };
  });
}

function sourceLabels(source: string, medium: string): { ko: string; en: string } {
  if (source === "direct") return { ko: "직접 방문", en: "Direct" };
  if (medium === "organic") return { ko: `${source} 검색`, en: `${source} (search)` };
  if (medium === "social") return { ko: `${source} 소셜`, en: `${source} (social)` };
  // UTM 소스명·리퍼러 호스트 같은 고유명은 번역하지 않고 실측값 그대로 쓴다.
  return { ko: source, en: source };
}
