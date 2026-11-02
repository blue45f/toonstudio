import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

export type MarketDisplaySortMode =
  | "server"
  | "updatedDesc"
  | "nameAsc"
  | "byteSizeAsc"
  | "entriesDesc";

function isCommercialAllowedLicense(license: CreatorMarketplaceResourceRecord["license"]): boolean {
  return license !== "cc-by-nc-4.0";
}

/**
 * 실제 게시 manifest 속성(종류·공유 태그·호환 렌더러·상업 이용·AI 공개·배급자 다양성)만으로
 * 결정론적 유사 소재를 점수화한다. 허위 평점·인기도는 사용하지 않는다.
 */
export function scoreSimilarMarketResources(
  target: CreatorMarketplaceResourceRecord,
  candidates: readonly CreatorMarketplaceResourceRecord[],
  limit = 4,
): CreatorMarketplaceResourceRecord[] {
  if (limit <= 0) return [];
  const targetTags = new Set(target.tags.map((tag) => tag.toLocaleLowerCase("ko-KR")));
  const targetEngines = new Set(target.compatibility.engines);
  const targetCommercial = isCommercialAllowedLicense(target.license);

  const scored: Array<{
    readonly record: CreatorMarketplaceResourceRecord;
    readonly score: number;
  }> = [];

  for (const candidate of candidates) {
    if (candidate.id === target.id) continue;
    let score = 0;

    if (candidate.kind === target.kind) {
      score += 40;
    } else if (
      (target.kind === "3d-asset" && candidate.kind === "3d-preset") ||
      (target.kind === "3d-preset" && candidate.kind === "3d-asset") ||
      (target.kind === "palette" && candidate.kind === "filter") ||
      (target.kind === "filter" && candidate.kind === "palette")
    ) {
      score += 20;
    }

    let sharedTagCount = 0;
    for (const rawTag of candidate.tags) {
      if (targetTags.has(rawTag.toLocaleLowerCase("ko-KR"))) {
        sharedTagCount += 1;
      }
    }
    score += Math.min(sharedTagCount, 4) * 14;

    let sharedEngineCount = 0;
    for (const engine of candidate.compatibility.engines) {
      if (targetEngines.has(engine)) {
        sharedEngineCount += 1;
      }
    }
    score += Math.min(sharedEngineCount, 3) * 6;

    if (candidate.containsAi === target.containsAi) {
      score += 8;
    }
    if (isCommercialAllowedLicense(candidate.license) === targetCommercial) {
      score += 8;
    }
    // 배급자 섹션("이 배급자의 다른 소재")과 겹치지 않도록 타 배급자에 소폭 다양성 가산점을 부여
    if (candidate.publisher.id !== target.publisher.id) {
      score += 4;
    }

    if (score > 0) {
      scored.push({ record: candidate, score });
    }
  }

  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return right.record.updatedAt.localeCompare(left.record.updatedAt);
  });

  return scored.slice(0, limit).map((entry) => entry.record);
}

/**
 * 서버 페이지네이션 결과를 훼손하지 않고, 현재 불러온 페이지 내부에서만 보조 정렬을 수행한다.
 */
export function sortMarketResourcesForDisplay(
  items: readonly CreatorMarketplaceResourceRecord[],
  mode: MarketDisplaySortMode,
): readonly CreatorMarketplaceResourceRecord[] {
  if (mode === "server" || items.length <= 1) return items;
  const copy = [...items];
  switch (mode) {
    case "updatedDesc":
      return copy.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    case "nameAsc":
      return copy.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko-KR"));
    case "byteSizeAsc":
      return copy.sort((a, b) => (a.manifestByteSize ?? 0) - (b.manifestByteSize ?? 0));
    case "entriesDesc":
      return copy.sort(
        (a, b) => (b.entries?.length ?? 0) - (a.entries?.length ?? 0),
      );
  }
}
