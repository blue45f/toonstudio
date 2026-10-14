import {
  allTitles,
  getTitle,
} from "../../../../../packages/core/src/catalog/catalog-store";
import { loadTitleEpisodeEntries } from "../../server/title-episodes";

import type {
  CreatorAnalyticsSeriesCatalog,
  CreatorAnalyticsSeriesRecord,
} from "./creator-analytics.traffic-source";

// 시리즈 카탈로그 어댑터 — 공개 카탈로그(번들 스냅샷)의 작품을 slug 키로 노출하고,
// 회차 메타데이터는 독서 표면이 이미 쓰는 회차 스냅샷(server/title-episodes)에서
// 붙인다. 스냅샷에 없는 작품은 회차 목록이 빈 채로 나가고(지어내지 않음),
// 트래픽 조회수만으로 KPI·유입을 구성한다.

export class CatalogCreatorAnalyticsSeriesCatalog
  implements CreatorAnalyticsSeriesCatalog
{
  listSeries(): readonly CreatorAnalyticsSeriesRecord[] {
    return allTitles()
      .filter((title) => typeof title.slug === "string" && title.slug.length > 0)
      .map((title) => this.toRecord(title.id, title.slug, title.title));
  }

  findSeries(seriesId: string): CreatorAnalyticsSeriesRecord | null {
    const title = getTitle(seriesId);
    if (!title || typeof title.slug !== "string" || title.slug.length === 0) {
      return null;
    }
    return this.toRecord(title.id, title.slug, title.title);
  }

  private toRecord(
    titleId: string,
    slug: string,
    title: string,
  ): CreatorAnalyticsSeriesRecord {
    const entry = loadTitleEpisodeEntries().get(titleId);
    return {
      id: slug,
      slug,
      title,
      episodes: (entry?.episodes ?? []).map((episode) => ({
        episode: episode.number,
        title: episode.title ?? `${episode.number}화`,
        publishedAt: episode.publishedAt ?? "",
      })),
    };
  }
}
