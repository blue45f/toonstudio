export type StudioMarketplaceSearchSort =
  | "relevance"
  | "quality"
  | "rating"
  | "newest"
  | "price-asc"
  | "price-desc";
export type StudioMarketplaceAiFilter = "none" | "assisted" | "generated";

export interface StudioMarketplaceSearchItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly type: string;
  readonly compatibilityTargets: readonly string[];
  readonly destinations: readonly string[];
  readonly priceMinor: number;
  readonly currency: string;
  readonly rating: number;
  readonly reviewCount: number;
  readonly qualityScore: number;
  readonly aiClassification: StudioMarketplaceAiFilter;
  readonly owned: boolean;
  readonly installed: boolean;
  readonly saved: boolean;
  readonly rightsStatus: "allowed" | "warning" | "blocked";
  readonly updatedAt: string;
}

export interface StudioMarketplaceSearchQuery {
  readonly text: string;
  readonly types: readonly string[];
  readonly compatibilityTargets: readonly string[];
  readonly destinations: readonly string[];
  readonly aiClassifications: readonly StudioMarketplaceAiFilter[];
  readonly minimumPriceMinor: number | null;
  readonly maximumPriceMinor: number | null;
  readonly onlyOwned: boolean;
  readonly onlyInstalled: boolean;
  readonly onlySaved: boolean;
  readonly includeBlockedRights: boolean;
  readonly sort: StudioMarketplaceSearchSort;
  readonly limit: number;
}

export interface StudioMarketplaceSearchHit {
  readonly item: StudioMarketplaceSearchItem;
  readonly relevance: number;
}

export interface StudioMarketplaceFacet {
  readonly value: string;
  readonly count: number;
}

export interface StudioMarketplaceSearchResult {
  readonly total: number;
  readonly hits: readonly StudioMarketplaceSearchHit[];
  readonly typeFacets: readonly StudioMarketplaceFacet[];
  readonly aiFacets: readonly StudioMarketplaceFacet[];
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

function queryTokens(value: string): string[] {
  return normalized(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function validUnique(values: readonly string[]): boolean {
  return values.every((value) => value.trim().length > 0)
    && new Set(values).size === values.length;
}

function relevance(item: StudioMarketplaceSearchItem, text: string): number {
  const query = normalized(text);
  if (!query) return item.qualityScore * 0.15 + item.rating * 2;
  const title = normalized(item.title);
  const description = normalized(item.description);
  const tags = item.tags.map(normalized);
  let score = 0;
  if (title === query) score += 120;
  else if (title.startsWith(query)) score += 85;
  else if (title.includes(query)) score += 60;
  for (const token of queryTokens(query)) {
    if (title.includes(token)) score += 20;
    if (tags.some((tag) => tag.includes(token))) score += 12;
    if (description.includes(token)) score += 4;
  }
  score += item.qualityScore * 0.15 + item.rating * 2;
  if (item.owned) score += 2;
  if (item.installed) score += 2;
  return score;
}

function facets(values: readonly string[]): StudioMarketplaceFacet[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => Object.freeze({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function validateQuery(query: StudioMarketplaceSearchQuery): void {
  if (!validUnique(query.types)
    || !validUnique(query.compatibilityTargets)
    || !validUnique(query.destinations)
    || new Set(query.aiClassifications).size !== query.aiClassifications.length
    || !Number.isSafeInteger(query.limit)
    || query.limit < 1
    || (query.minimumPriceMinor !== null
      && (!Number.isSafeInteger(query.minimumPriceMinor) || query.minimumPriceMinor < 0))
    || (query.maximumPriceMinor !== null
      && (!Number.isSafeInteger(query.maximumPriceMinor) || query.maximumPriceMinor < 0))
    || (query.minimumPriceMinor !== null
      && query.maximumPriceMinor !== null
      && query.minimumPriceMinor > query.maximumPriceMinor)) {
    throw new Error("Marketplace search filters are invalid.");
  }
}

function validateItem(item: StudioMarketplaceSearchItem): void {
  if (
    !item.id.trim()
    || !item.title.trim()
    || !item.type.trim()
    || !item.currency.trim()
    || !validUnique(item.tags)
    || !validUnique(item.compatibilityTargets)
    || !validUnique(item.destinations)
    || !Number.isSafeInteger(item.priceMinor)
    || item.priceMinor < 0
    || !Number.isFinite(item.rating)
    || item.rating < 0
    || item.rating > 5
    || !Number.isSafeInteger(item.reviewCount)
    || item.reviewCount < 0
    || !Number.isFinite(item.qualityScore)
    || item.qualityScore < 0
    || item.qualityScore > 100
    || !Number.isFinite(Date.parse(item.updatedAt))
  ) {
    throw new Error(`Marketplace item is invalid: ${item.id}`);
  }
}

export function searchStudioMarketplace(
  catalog: readonly StudioMarketplaceSearchItem[],
  query: StudioMarketplaceSearchQuery,
): StudioMarketplaceSearchResult {
  validateQuery(query);
  const ids = catalog.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("Marketplace item ids must be unique.");
  catalog.forEach(validateItem);
  const types = new Set(query.types);
  const compatibility = new Set(query.compatibilityTargets);
  const destinations = new Set(query.destinations);
  const ai = new Set(query.aiClassifications);
  const filtered = catalog.filter((item) => {
    if (!query.includeBlockedRights && item.rightsStatus === "blocked") return false;
    if (types.size > 0 && !types.has(item.type)) return false;
    if (compatibility.size > 0
      && ![...compatibility].every((target) => item.compatibilityTargets.includes(target))) return false;
    if (destinations.size > 0
      && ![...destinations].every((destination) => item.destinations.includes(destination))) return false;
    if (ai.size > 0 && !ai.has(item.aiClassification)) return false;
    if (query.minimumPriceMinor !== null && item.priceMinor < query.minimumPriceMinor) return false;
    if (query.maximumPriceMinor !== null && item.priceMinor > query.maximumPriceMinor) return false;
    if (query.onlyOwned && !item.owned) return false;
    if (query.onlyInstalled && !item.installed) return false;
    if (query.onlySaved && !item.saved) return false;
    return true;
  });
  const hits = filtered.map((item) => Object.freeze({ item, relevance: relevance(item, query.text) }));
  hits.sort((left, right) => {
    const value = query.sort === "relevance"
      ? right.relevance - left.relevance
      : query.sort === "quality"
        ? right.item.qualityScore - left.item.qualityScore
        : query.sort === "rating"
          ? right.item.rating - left.item.rating || right.item.reviewCount - left.item.reviewCount
          : query.sort === "newest"
            ? Date.parse(right.item.updatedAt) - Date.parse(left.item.updatedAt)
            : query.sort === "price-asc"
              ? left.item.priceMinor - right.item.priceMinor
              : right.item.priceMinor - left.item.priceMinor;
    return value || left.item.id.localeCompare(right.item.id);
  });
  return Object.freeze({
    total: hits.length,
    hits: Object.freeze(hits.slice(0, query.limit)),
    typeFacets: Object.freeze(facets(filtered.map((item) => item.type))),
    aiFacets: Object.freeze(facets(filtered.map((item) => item.aiClassification))),
  });
}

/**
 * 기성 웹툰 3D 스케치업(.skp) 소재 시장(텀블벅, 에이콘3D, 픽셀) 대표 아키타입 카탈로그.
 * 문 개폐·서랍 슬라이드·들창 들어열개·병풍 폴딩·조명 점등 등 동적 구성 요소(Dynamic Components)를 내장한다.
 */
export const STUDIO_WEBTOON_SKP_MARKETPLACE_CATALOG: readonly StudioMarketplaceSearchItem[] = Object.freeze([
  Object.freeze({
    id: "skp-archetype-fantasy-imperial-palace",
    title: "판타지 황실 대성전 & 알현실 3D 공간 배경",
    description:
      "텀블벅·에이콘3D·픽셀 호환 로맨스판타지 황실 세트. 대형 양개문, 옥좌 비밀 통로, 마법 샹들리에, 발코니 창문 동적 구성 요소(OnClick ANIMATE) 내장.",
    tags: ["판타지 황실", "황실", "로판", "텀블벅", "에이콘3D", "픽셀", "스케치업", "동적컴포넌트"],
    type: "3d-background",
    compatibilityTargets: ["web", "desktop"],
    destinations: ["webtoon", "illustration"],
    priceMinor: 45000,
    currency: "KRW",
    rating: 4.9,
    reviewCount: 312,
    qualityScore: 97,
    aiClassification: "none",
    owned: true,
    installed: true,
    saved: true,
    rightsStatus: "allowed",
    updatedAt: "2026-10-15T00:00:00.000Z",
  }),
  Object.freeze({
    id: "skp-archetype-modern-high-school-classroom",
    title: "현대 고등학교 교실 & 복도 3D 공간 배경",
    description:
      "에이콘3D·텀블벅·픽셀 호환 학원물 교실 세트. 복도 미닫이 앞·뒷문, 운동장 미닫이창, 교탁 서랍, 학생 사물함, 천장 형광등 동적 구성 요소 내장.",
    tags: ["현대 고등학교 교실", "고등학교", "교실", "학교", "에이콘3D", "텀블벅", "픽셀", "스케치업", "동적컴포넌트"],
    type: "3d-background",
    compatibilityTargets: ["web", "desktop"],
    destinations: ["webtoon", "video"],
    priceMinor: 29000,
    currency: "KRW",
    rating: 4.9,
    reviewCount: 428,
    qualityScore: 96,
    aiClassification: "none",
    owned: true,
    installed: true,
    saved: true,
    rightsStatus: "allowed",
    updatedAt: "2026-10-18T00:00:00.000Z",
  }),
  Object.freeze({
    id: "skp-archetype-protagonist-studio-apartment",
    title: "주인공 자취방 원룸 & 오피스텔 3D 공간 배경",
    description:
      "에이콘3D·픽셀·텀블벅 호환 현대 일상물 자취방 세트. 현관 방화문, 책상 서랍, 붙박이 옷장 도어, 베란다 이중 미닫이창, 독서 스탠드 조명 동적 인터랙션 내장.",
    tags: ["주인공 자취방", "자취방", "원룸", "에이콘3D", "픽셀", "텀블벅", "스케치업", "동적컴포넌트"],
    type: "3d-background",
    compatibilityTargets: ["web", "desktop"],
    destinations: ["webtoon", "video"],
    priceMinor: 24000,
    currency: "KRW",
    rating: 4.8,
    reviewCount: 275,
    qualityScore: 95,
    aiClassification: "none",
    owned: true,
    installed: true,
    saved: true,
    rightsStatus: "allowed",
    updatedAt: "2026-10-20T00:00:00.000Z",
  }),
  Object.freeze({
    id: "skp-archetype-joseon-dynasty-tavern",
    title: "조선시대 저막 (주막·객주) 3D 공간 배경",
    description:
      "텀블벅·에이콘3D·픽셀 호환 사극·무협 조선시대 저막 세트. 싸리문 대문, 대청 들어열개 들창, 한식 격자 미닫이 방문, 산수화 병풍, 부엌 찬장 서랍, 처마 초롱불 동적 구성 요소 내장.",
    tags: ["조선시대 저막", "저막", "주막", "조선시대", "사극", "텀블벅", "에이콘3D", "픽셀", "스케치업", "동적컴포넌트"],
    type: "3d-background",
    compatibilityTargets: ["web", "desktop"],
    destinations: ["webtoon", "illustration"],
    priceMinor: 39000,
    currency: "KRW",
    rating: 4.9,
    reviewCount: 198,
    qualityScore: 96,
    aiClassification: "none",
    owned: true,
    installed: true,
    saved: true,
    rightsStatus: "allowed",
    updatedAt: "2026-10-22T00:00:00.000Z",
  }),
]);

