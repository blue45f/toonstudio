/**
 * 지난 회차 페이지 실데이터 매핑 (잔여 배선 ③).
 *
 * 비교 검수 프리셋 "전 회차와 비교"는 풀 안에 page 소스가 있어야 동작하는데,
 * 지금까지 페이지는 previousEpisodePages를 아무도 채우지 않아 프리셋이 항상
 * "풀에 없음" 안내로 끝났다. 이 모듈이 그 매핑을 순수 함수로 소유한다:
 *
 *  - findPreviousEpisode: 회차 기획(episodePlans)의 회차 번호로 "바로 앞 회차"를 정한다.
 *    기획이 없는 회차는 회차 목록(aggregate.episodes)의 순서를 폴백으로 쓴다.
 *  - buildPreviousEpisodePoolItems: 앞 회차 공정들의 head 리비전을 page 풀 항목으로
 *    바꾼다(compare-review-model의 poolItemFromPage). 이미지 공정만, 상한 적용.
 *    렌더 URL은 잔여 배선 ②의 해석기를 그대로 재사용한다(없으면 플레이스홀더).
 */

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { poolItemFromPage, type ComparePoolItem } from "./compare-review-model";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";

export interface PreviousEpisodeRef {
  readonly episodeId: string;
  /** 회차 번호. 기획이 없어 순서 폴백으로 정한 경우 null. */
  readonly episodeNumber: number | null;
  /** 페인·풀 라벨용 표시 이름. 예: "12화". 번호를 모르면 "지난 회차". */
  readonly episodeLabel: string;
}

/** 회차별 최신 기획(revision 최대)의 번호 맵. */
function latestPlanNumbers(
  aggregate: Pick<ProductionProjectAggregate, "episodePlans">,
): ReadonlyMap<string, number> {
  const best = new Map<string, { revision: number; episodeNumber: number }>();
  for (const plan of aggregate.episodePlans) {
    const current = best.get(plan.episodeId);
    if (!current || plan.revision > current.revision) {
      best.set(plan.episodeId, { revision: plan.revision, episodeNumber: plan.episodeNumber });
    }
  }
  return new Map([...best].map(([episodeId, value]) => [episodeId, value.episodeNumber]));
}

/**
 * 현재 회차의 바로 앞 회차를 찾는다. 대상은 aggregate.episodes에 있는 회차뿐이다.
 * - 현재 회차 번호를 알면: 그보다 작은 번호 중 가장 큰 번호의 회차.
 * - 모르면: episodes 배열에서 현재 회차의 바로 앞 항목.
 * 앞 회차가 없으면 null(첫 회차) — 프리셋은 이 경우 풀에 page가 없어 안내로 떨어진다.
 */
export function findPreviousEpisode(
  aggregate: Pick<ProductionProjectAggregate, "episodePlans" | "episodes">,
  currentEpisodeId: string,
): PreviousEpisodeRef | null {
  const numbers = latestPlanNumbers(aggregate);
  const currentNumber = numbers.get(currentEpisodeId) ?? null;
  if (currentNumber !== null) {
    let best: PreviousEpisodeRef | null = null;
    for (const episode of aggregate.episodes) {
      if (episode.episodeId === currentEpisodeId) continue;
      const number = numbers.get(episode.episodeId);
      if (number === undefined || number >= currentNumber) continue;
      if (!best || (best.episodeNumber !== null && number > best.episodeNumber)) {
        best = { episodeId: episode.episodeId, episodeNumber: number, episodeLabel: `${number}화` };
      }
    }
    if (best) return best;
  }
  const index = aggregate.episodes.findIndex((episode) => episode.episodeId === currentEpisodeId);
  if (index > 0) {
    const previous = aggregate.episodes[index - 1];
    const number = numbers.get(previous.episodeId) ?? null;
    return {
      episodeId: previous.episodeId,
      episodeNumber: number,
      episodeLabel: number !== null ? `${number}화` : "지난 회차",
    };
  }
  return null;
}

/** 풀에 넣을 지난 회차 페이지 상한. 프리셋·페인 선택에 필요한 만큼만 넣는다. */
export const PREVIOUS_EPISODE_PAGE_LIMIT = 8;

/**
 * 앞 회차 공정들을 page 풀 항목으로 매핑한다.
 * 공정당 head 리비전 1장만 넣는다(지난 회차 비교는 "그 회차의 대표 결과물"이 목적이며,
 * 전 리비전을 넣으면 풀이 버전 항목에 묻힌다). 텍스트·미디어 공정은 제외한다.
 */
export function buildPreviousEpisodePoolItems(input: {
  readonly processes: readonly ProductionManuscriptProcess[];
  readonly projectId: string;
  readonly episodeId: string;
  readonly episodeLabel: string;
  readonly resolveImageUrl?: (processId: string, revisionId: string) => string | null;
  readonly addedBy: string;
  readonly addedAt: string;
  readonly limit?: number;
}): ComparePoolItem[] {
  const limit = input.limit ?? PREVIOUS_EPISODE_PAGE_LIMIT;
  const items: ComparePoolItem[] = [];
  for (const process of input.processes) {
    if (items.length >= limit) break;
    if (process.processType !== "image") continue;
    const head = process.headRevision ?? process.revisions[0] ?? null;
    if (!head) continue;
    items.push(poolItemFromPage({
      projectId: input.projectId,
      episodeId: input.episodeId,
      pageId: head.id,
      label: `${input.episodeLabel} · ${process.label}`,
      imageUrl: input.resolveImageUrl ? input.resolveImageUrl(process.artifact.id, head.id) : null,
      addedBy: input.addedBy,
      addedAt: input.addedAt,
    }));
  }
  return items;
}
