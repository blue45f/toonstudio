// 연재 시리즈 회차 추가/갱신 검증 — works.ts와 series.ts 간 순환 의존성 제거용 리프 모듈.
import { eq, sql } from "drizzle-orm";

import { creatorSeries, creatorWorks, db } from "../../platform/database";
import { withDatabaseCapability } from "../../platform/http/service-availability";
import { nextEpisodeNumber } from "../../server/creator/community-contract";
import { requireCreatorCommunitySchema } from "./community-schema";

// 소유 시리즈 조회(없으면/남의 것이면 throw) — 회차 추가·시리즈 수정 공용.
export async function getOwnedSeriesOrThrow(
  seriesId: string,
  userId: string,
): Promise<{ id: string; title: string }> {
  return withDatabaseCapability("creator.series.write", async () => {
    await requireCreatorCommunitySchema("creator.series.write");
    const [series] = await db
      .select({ id: creatorSeries.id, title: creatorSeries.title, ownerId: creatorSeries.userId })
      .from(creatorSeries)
      .where(eq(creatorSeries.id, seriesId))
      .limit(1);
    if (!series) throw new Error("시리즈를 찾을 수 없습니다.");
    if (series.ownerId !== userId) throw new Error("내 시리즈에만 회차를 추가할 수 있습니다.");
    return { id: series.id, title: series.title };
  });
}

// 다음 회차 번호 — 시리즈 내 max(episodeNo) + 1.
export async function nextEpisodeNoOf(seriesId: string): Promise<number> {
  return withDatabaseCapability("creator.series.write", async () => {
    await requireCreatorCommunitySchema("creator.series.write");
    const [row] = await db
      .select({ max: sql<number | null>`max(${creatorWorks.episodeNo})` })
      .from(creatorWorks)
      .where(eq(creatorWorks.seriesId, seriesId));
    return nextEpisodeNumber([row?.max]);
  });
}

// 회차 추가/연결 시 시리즈 갱신일 bump — recent 정렬("최신 회차 갱신") 근거.
export async function touchSeries(seriesId: string): Promise<void> {
  try {
    await db.update(creatorSeries).set({ updatedAt: new Date() }).where(eq(creatorSeries.id, seriesId));
  } catch {
    // best-effort
  }
}
