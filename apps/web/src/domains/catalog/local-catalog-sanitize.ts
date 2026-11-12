import type { DiscoverHomeSnapshot } from "./discover-home";
import type { Availability, PlatformId, Pricing, SerialStatus, Title, WorkType } from "@/shared/lib/types";

const CHOSEONG_COMPAT = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

const JUNGSEONG_COMPAT = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
  "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
] as const;

const JONGSEONG_COMPAT = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
  "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

const COMPOUND_JAMO_SPLIT: Record<string, string> = {
  ㄳ: "ㄱㅅ", ㄵ: "ㄴㅈ", ㄶ: "ㄴㅎ", ㄺ: "ㄹㄱ", ㄻ: "ㄹㅁ", ㄼ: "ㄹㅂ",
  ㄽ: "ㄹㅅ", ㄾ: "ㄹㅌ", ㄿ: "ㄹㅍ", ㅀ: "ㄹㅎ", ㅄ: "ㅂㅅ", ㅘ: "ㅗㅏ",
  ㅙ: "ㅗㅐ", ㅚ: "ㅗㅣ", ㅝ: "ㅜㅓ", ㅞ: "ㅜㅔ", ㅟ: "ㅜㅣ", ㅢ: "ㅡㅣ",
};

function expandCompoundJamo(jamo: string): string {
  return COMPOUND_JAMO_SPLIT[jamo] ?? jamo;
}

interface DecomposedText {
  readonly jamo: string;
  readonly syllableStarts: Set<number>;
  readonly choseong: string;
}

function decomposeHangulText(input: string): DecomposedText {
  const normalized = input.normalize("NFC").toLowerCase();
  let jamo = "";
  let choseong = "";
  const syllableStarts = new Set<number>([0]);

  for (const ch of normalized) {
    syllableStarts.add(jamo.length);
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const offset = code - 0xac00;
      const cho = CHOSEONG_COMPAT[Math.floor(offset / 588)] ?? "";
      const jung = JUNGSEONG_COMPAT[Math.floor((offset % 588) / 28)] ?? "";
      const jong = JONGSEONG_COMPAT[offset % 28] ?? "";
      choseong += cho;
      jamo += cho + expandCompoundJamo(jung) + expandCompoundJamo(jong);
    } else if (code >= 0x3131 && code <= 0x3163) {
      choseong += ch;
      jamo += expandCompoundJamo(ch);
    } else {
      choseong += ch;
      jamo += ch;
    }
  }

  return { jamo, syllableStarts, choseong };
}

/**
 * 2벌식 한글 조합 중간 상태(예: "ㅍ", "판ㅌ", "판타ㅈ", "달ㅂ", "닯", "산") 및
 * 초성 검색("ㅍㅌㅈ")을 모두 안전하게 매칭한다.
 */
export function matchesHangulAwareQuery(target: string, rawToken: string): boolean {
  const token = normalizeSearchToken(rawToken);
  if (!token) return true;
  const hay = target.normalize("NFC").toLowerCase();
  if (hay.includes(token)) return true;

  const targetDecomposed = decomposeHangulText(hay);
  const tokenDecomposed = decomposeHangulText(token);
  if (!tokenDecomposed.jamo) return true;

  if (/^[ㄱ-ㅎ]+$/u.test(token) && targetDecomposed.choseong.includes(token)) {
    return true;
  }

  let searchFrom = 0;
  while (searchFrom <= targetDecomposed.jamo.length - tokenDecomposed.jamo.length) {
    const idx = targetDecomposed.jamo.indexOf(tokenDecomposed.jamo, searchFrom);
    if (idx === -1) break;
    if (targetDecomposed.syllableStarts.has(idx)) {
      return true;
    }
    searchFrom = idx + 1;
  }

  return false;
}

export function normalizeSearchToken(value: string): string {
  return value.normalize("NFC").trim().toLowerCase();
}

const DEFAULT_COVER: [string, string] = ["oklch(0.45 0.14 35)", "oklch(0.28 0.1 75)"];
const VALID_STATUSES = new Set<SerialStatus>(["ongoing", "completed", "hiatus"]);
const VALID_PRICING = new Set<Pricing>(["free", "wait-free", "paid", "subscription"]);
const VALID_PLATFORM_IDS = new Set<PlatformId>([
  "naver-webtoon", "naver-series", "kakao-page", "kakao-webtoon", "ridi",
  "munpia", "joara", "novelpia", "lezhin", "bomtoon", "toptoon", "postype",
  "mrblue", "comico", "toomics", "bookcube", "onestory", "kyobo", "yes24", "kmas",
]);
const PLATFORM_ID_ALIASES: Readonly<Record<string, PlatformId>> = {
  naver: "naver-webtoon",
  kakao: "kakao-page",
};

export function normalizePlatformId(value: unknown): PlatformId | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (VALID_PLATFORM_IDS.has(trimmed as PlatformId)) {
    return trimmed as PlatformId;
  }
  return PLATFORM_ID_ALIASES[trimmed] ?? null;
}

const PLACEHOLDER_AUTHOR_NAMES = new Set([
  "미상", "작가 미상", "작가미상", "익명", "알 수 없음", "unknown", "n/a", "-",
]);

export function isPlaceholderAuthorName(raw: unknown): boolean {
  if (typeof raw !== "string") return true;
  const trimmed = raw.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_AUTHOR_NAMES.has(trimmed.toLowerCase());
}

export function splitAuthorNames(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const parts = raw
    .split(/[,/]/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !isPlaceholderAuthorName(part));
  return [...new Set(parts)];
}

export function primaryAuthorName(raw: unknown): string | null {
  const names = splitAuthorNames(raw);
  return names[0] ?? null;
}

export function sanitizeExternalCatalogUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    return trimmed;
  } catch {
    return null;
  }
}

const PRICING_PRIORITY: Record<Pricing, number> = {
  free: 0,
  "wait-free": 1,
  subscription: 2,
  paid: 3,
};

function sanitizeAvailabilityEntry(entry: unknown): Availability | null {
  if (!entry || typeof entry !== "object") return null;
  const raw = entry as Partial<Availability> & { readonly platform?: string };
  const platformId = normalizePlatformId(raw.platformId ?? raw.platform);
  if (!platformId) return null;
  const pricing: Pricing =
    typeof raw.pricing === "string" && VALID_PRICING.has(raw.pricing as Pricing)
      ? (raw.pricing as Pricing)
      : "free";
  const safeUrl = sanitizeExternalCatalogUrl(raw.url);
  return {
    platformId,
    pricing,
    ...(typeof raw.isOriginal === "boolean" ? { isOriginal: raw.isOriginal } : {}),
    ...(safeUrl ? { url: safeUrl } : {}),
  };
}

function deduplicateAvailability(entries: readonly Availability[]): Availability[] {
  const byPlatform = new Map<PlatformId, Availability>();
  for (const candidate of entries) {
    const existing = byPlatform.get(candidate.platformId);
    if (!existing) {
      byPlatform.set(candidate.platformId, candidate);
      continue;
    }
    const mergedPricing =
      PRICING_PRIORITY[candidate.pricing] < PRICING_PRIORITY[existing.pricing]
        ? candidate.pricing
        : existing.pricing;
    const mergedUrl = existing.url ?? candidate.url;
    const mergedOriginal =
      existing.isOriginal === true || candidate.isOriginal === true
        ? true
        : existing.isOriginal === false || candidate.isOriginal === false
          ? false
          : undefined;
    byPlatform.set(candidate.platformId, {
      platformId: existing.platformId,
      pricing: mergedPricing,
      ...(typeof mergedOriginal === "boolean" ? { isOriginal: mergedOriginal } : {}),
      ...(mergedUrl ? { url: mergedUrl } : {}),
    });
  }
  return [...byPlatform.values()];
}

export function computeLocalPlatformCoverage(
  titles: readonly Title[],
): { id: PlatformId; count: number }[] {
  const counts = new Map<PlatformId, number>();
  for (const title of titles) {
    if (!title || !Array.isArray(title.availability)) continue;
    const seenInTitle = new Set<PlatformId>();
    for (const avail of title.availability) {
      const pid = normalizePlatformId(avail?.platformId);
      if (!pid || seenInTitle.has(pid)) continue;
      seenInTitle.add(pid);
      counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, count]) => ({ id, count }));
}

export function sanitizePlatformCoverageList(
  raw: unknown,
  fallbackTitles?: readonly Title[],
): { id: PlatformId; count: number }[] {
  if (!Array.isArray(raw)) {
    return fallbackTitles ? computeLocalPlatformCoverage(fallbackTitles) : [];
  }
  const merged = new Map<PlatformId, number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as {
      id?: unknown;
      platformId?: unknown;
      platform?: unknown;
      count?: unknown;
    };
    const id = normalizePlatformId(item.id ?? item.platformId ?? item.platform);
    if (!id) continue;
    const count =
      typeof item.count === "number" && Number.isFinite(item.count) && item.count > 0
        ? Math.floor(item.count)
        : 0;
    if (count <= 0) continue;
    merged.set(id, (merged.get(id) ?? 0) + count);
  }
  if (merged.size === 0 && fallbackTitles && fallbackTitles.length > 0) {
    return computeLocalPlatformCoverage(fallbackTitles);
  }
  return [...merged.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, count]) => ({ id, count }));
}

/**
 * JSON 일부 필드가 누락·손상된 작품 레코드가 유입되더라도
 * 렌더러(TitleCard, DiscoverSpotlight 등)가 TypeError 없이 동작하도록 기본값을 보강한다.
 */
export function sanitizeTitleRecord(raw: unknown, fallbackIndex = 0): Title | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<Title> & Record<string, unknown>;
  const id =
    typeof item.id === "string" && item.id.trim().length > 0
      ? item.id.trim()
      : typeof item.slug === "string" && item.slug.trim().length > 0
        ? item.slug.trim()
        : "";
  const titleText =
    typeof item.title === "string" && item.title.trim().length > 0 ? item.title.trim() : "";
  if (!id && !titleText) return null;

  const safeId = id || `corrupted-title-${fallbackIndex}`;
  const safeSlug =
    typeof item.slug === "string" && item.slug.trim().length > 0 ? item.slug.trim() : safeId;
  const safeType: WorkType = item.type === "webnovel" ? "webnovel" : "webtoon";
  const safeStatus: SerialStatus =
    typeof item.status === "string" && VALID_STATUSES.has(item.status as SerialStatus)
      ? (item.status as SerialStatus)
      : "ongoing";
  const safeGenres = Array.isArray(item.genres)
    ? item.genres.filter((g): g is string => typeof g === "string" && g.trim().length > 0)
    : [];
  const safeTags = Array.isArray(item.tags)
    ? item.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];
  const safeAltTitles = Array.isArray(item.altTitles)
    ? item.altTitles.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : undefined;
  const safeCover: [string, string] =
    Array.isArray(item.cover) &&
    item.cover.length >= 2 &&
    typeof item.cover[0] === "string" &&
    typeof item.cover[1] === "string"
      ? [item.cover[0], item.cover[1]]
      : DEFAULT_COVER;
  const safeAvailability = Array.isArray(item.availability)
    ? deduplicateAvailability(
        item.availability
          .map((entry) => sanitizeAvailabilityEntry(entry))
          .filter((entry): entry is Availability => entry !== null),
      )
    : [];

  const rawStats = (item.stats && typeof item.stats === "object" ? item.stats : {}) as Partial<
    Title["stats"]
  >;
  const num = (v: unknown, fallback = 0): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const safeRatingDist: [number, number, number, number, number] =
    Array.isArray(rawStats.ratingDist) &&
    rawStats.ratingDist.length === 5 &&
    rawStats.ratingDist.every((v) => typeof v === "number" && Number.isFinite(v))
      ? (rawStats.ratingDist as [number, number, number, number, number])
      : [0, 0, 0, 0, 0];

  const rawAuthorStr = typeof item.author === "string" ? item.author.trim() : "";
  const safeAuthor =
    rawAuthorStr.length > 0 && !isPlaceholderAuthorName(rawAuthorStr) ? rawAuthorStr : "작가 미상";

  return {
    ...(item as Title),
    id: safeId,
    slug: safeSlug,
    type: safeType,
    title: titleText || "제목 미상",
    ...(safeAltTitles ? { altTitles: safeAltTitles } : {}),
    author: safeAuthor,
    ...(typeof item.artist === "string" && item.artist.trim().length > 0
      ? { artist: item.artist.trim() }
      : {}),
    genres: safeGenres,
    tags: safeTags,
    synopsis: typeof item.synopsis === "string" ? item.synopsis : "",
    cover: safeCover,
    ...(typeof item.coverImage === "string" && item.coverImage.trim().length > 0
      ? { coverImage: item.coverImage }
      : { coverImage: undefined }),
    status: safeStatus,
    ageRating:
      item.ageRating === "12" || item.ageRating === "15" || item.ageRating === "19"
        ? item.ageRating
        : "all",
    releaseYear:
      typeof item.releaseYear === "number" && Number.isFinite(item.releaseYear)
        ? item.releaseYear
        : 2025,
    availability: safeAvailability,
    stats: {
      views: num(rawStats.views, 0),
      likes: num(rawStats.likes, 0),
      bookmarks: num(rawStats.bookmarks, 0),
      ratingAvg: num(rawStats.ratingAvg, 0),
      ratingCount: num(rawStats.ratingCount, 0),
      ratingDist: safeRatingDist,
      rankDelta: num(rawStats.rankDelta, 0),
      trendingScore: num(rawStats.trendingScore, 0),
      completionRate: num(rawStats.completionRate, 0),
      bingeIndex: num(rawStats.bingeIndex, 0),
      ...(typeof rawStats.popularityRank === "number" && Number.isFinite(rawStats.popularityRank)
        ? { popularityRank: rawStats.popularityRank }
        : {}),
      ...(typeof rawStats.popularityPercentile === "number" &&
      Number.isFinite(rawStats.popularityPercentile)
        ? { popularityPercentile: rawStats.popularityPercentile }
        : {}),
    },
  };
}

export function sanitizeTitleArray(raw: unknown): Title[] {
  if (!Array.isArray(raw)) return [];
  const result: Title[] = [];
  for (let i = 0; i < raw.length; i++) {
    const sanitized = sanitizeTitleRecord(raw[i], i);
    if (sanitized) result.push(sanitized);
  }
  return result;
}

export function sanitizeDiscoverHomeSnapshot(raw: unknown): DiscoverHomeSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Partial<DiscoverHomeSnapshot> & Record<string, unknown>;
  const rawStats = (obj.stats && typeof obj.stats === "object" ? obj.stats : {}) as Record<
    string,
    unknown
  >;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const featured = sanitizeTitleArray(obj.featured);
  const topRated = sanitizeTitleArray(obj.topRated);
  const waitFree = sanitizeTitleArray(obj.waitFree);
  const newest = sanitizeTitleArray(obj.newest);
  const todayReleases = sanitizeTitleArray(obj.todayReleases);
  const spotlight = obj.spotlight ? sanitizeTitleRecord(obj.spotlight, 0) : null;
  const genres = Array.isArray(obj.genres)
    ? obj.genres.filter((g): g is string => typeof g === "string" && g.trim().length > 0)
    : [];

  return {
    ...(obj as DiscoverHomeSnapshot),
    spotlight,
    featured,
    topRated,
    waitFree,
    newest,
    todayDay: typeof obj.todayDay === "string" && obj.todayDay.trim().length > 0 ? obj.todayDay : "",
    todayReleases,
    genres,
    stats: {
      titles: num(rawStats.titles),
      platforms: num(rawStats.platforms),
      genres: num(rawStats.genres),
    },
    generatedAt: typeof obj.generatedAt === "string" ? obj.generatedAt : "",
  };
}

export function sanitizeCatalogApiData<T>(apiUrl: string | null, raw: T | null): T | null {
  if (!raw || !apiUrl || typeof raw !== "object") return raw;
  const pathname = apiUrl.split("?")[0] ?? "";

  if (pathname === "/data/home.json" || pathname === "/api/home") {
    return (sanitizeDiscoverHomeSnapshot(raw) ?? raw) as unknown as T;
  }

  if (pathname === "/api/explore") {
    const obj = raw as Record<string, unknown>;
    const results = sanitizeTitleArray(Array.isArray(obj.results) ? obj.results : obj.titles);
    const shown = Array.isArray(obj.shown) ? sanitizeTitleArray(obj.shown) : results;
    const tags = Array.isArray(obj.tags)
      ? obj.tags
          .filter(
            (entry): entry is { tag: string; count: number } =>
              Boolean(entry) &&
              typeof entry === "object" &&
              typeof (entry as { tag?: unknown }).tag === "string" &&
              (entry as { tag: string }).tag.trim().length > 0,
          )
          .map((entry) => ({
            tag: entry.tag,
            count:
              typeof entry.count === "number" && Number.isFinite(entry.count) && entry.count >= 0
                ? entry.count
                : 0,
          }))
      : [];
    const genres = Array.isArray(obj.genres)
      ? obj.genres.filter((g): g is string => typeof g === "string" && g.trim().length > 0)
      : [];
    const rawCatalog =
      obj.catalog && typeof obj.catalog === "object"
        ? (obj.catalog as Record<string, unknown>)
        : {};
    const platformCoverage = sanitizePlatformCoverageList(rawCatalog.platformCoverage, results);
    const filteredPlatformCoverage = sanitizePlatformCoverageList(
      rawCatalog.filteredPlatformCoverage,
      results,
    );
    return {
      ...obj,
      results,
      shown,
      tags,
      genres,
      catalog: {
        ...rawCatalog,
        platformCoverage,
        filteredPlatformCoverage,
      },
    } as unknown as T;
  }

  if (pathname === "/api/search") {
    const obj = raw as Record<string, unknown>;
    const items = sanitizeTitleArray(Array.isArray(obj.items) ? obj.items : obj.results);
    const rawCatalog =
      obj.catalog && typeof obj.catalog === "object"
        ? (obj.catalog as Record<string, unknown>)
        : null;
    return {
      ...obj,
      items,
      ...(rawCatalog ? {
        catalog: {
          ...rawCatalog,
          platformCoverage: sanitizePlatformCoverageList(rawCatalog.platformCoverage, items),
          filteredPlatformCoverage: sanitizePlatformCoverageList(
            rawCatalog.filteredPlatformCoverage,
            items,
          ),
        },
      } : {}),
    } as unknown as T;
  }

  if (pathname === "/api/authors") {
    const obj = raw as Record<string, unknown>;
    const rawAuthors = Array.isArray(obj.authors) ? obj.authors : [];
    const authors = rawAuthors
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .filter((entry) => !isPlaceholderAuthorName(entry.name))
      .map((entry) => {
        const name = (entry.name as string).trim();
        const cover: [string, string] =
          Array.isArray(entry.cover) &&
          entry.cover.length >= 2 &&
          typeof entry.cover[0] === "string" &&
          typeof entry.cover[1] === "string"
            ? [entry.cover[0], entry.cover[1]]
            : DEFAULT_COVER;
        return {
          ...entry,
          name,
          workCount:
            typeof entry.workCount === "number" && Number.isFinite(entry.workCount)
              ? entry.workCount
              : 0,
          totalViews:
            typeof entry.totalViews === "number" && Number.isFinite(entry.totalViews)
              ? entry.totalViews
              : 0,
          avgRating:
            typeof entry.avgRating === "number" && Number.isFinite(entry.avgRating)
              ? entry.avgRating
              : 0,
          topGenres: Array.isArray(entry.topGenres)
            ? entry.topGenres.filter((g): g is string => typeof g === "string" && g.trim().length > 0)
            : [],
          types: Array.isArray(entry.types)
            ? entry.types.filter((t): t is WorkType => t === "webtoon" || t === "webnovel")
            : [],
          cover,
          ...(typeof entry.coverImage === "string" && entry.coverImage.trim().length > 0
            ? { coverImage: entry.coverImage }
            : { coverImage: undefined }),
        };
      });
    return {
      ...obj,
      total: authors.length,
      authors,
    } as unknown as T;
  }

  if (pathname.startsWith("/api/authors/")) {
    const obj = raw as Record<string, unknown>;
    const works = sanitizeTitleArray(obj.works);
    const rawAuthor = obj.author;
    const authorName =
      typeof rawAuthor === "string" && rawAuthor.trim().length > 0
        ? rawAuthor.trim()
        : typeof rawAuthor === "object" &&
            rawAuthor !== null &&
            typeof (rawAuthor as { name?: unknown }).name === "string"
          ? (rawAuthor as { name: string }).name.trim() || "작가 미상"
          : "작가 미상";
    const genres = Array.isArray(obj.genres)
      ? obj.genres.filter((g): g is string => typeof g === "string" && g.trim().length > 0)
      : [...new Set(works.flatMap((w) => w.genres ?? []))].slice(0, 6);
    const platforms = Array.isArray(obj.platforms)
      ? [
          ...new Set(
            obj.platforms
              .map((p) => normalizePlatformId(p))
              .filter((id): id is PlatformId => id !== null),
          ),
        ]
      : [
          ...new Set(
            works.flatMap((w) =>
              (w.availability ?? [])
                .map((a) => normalizePlatformId(a?.platformId))
                .filter((id): id is PlatformId => id !== null),
            ),
          ),
        ];
    return {
      ...obj,
      author: authorName,
      works,
      totalViews:
        typeof obj.totalViews === "number" && Number.isFinite(obj.totalViews)
          ? obj.totalViews
          : works.reduce((sum, w) => sum + (w.stats?.views ?? 0), 0),
      avg:
        typeof obj.avg === "number" && Number.isFinite(obj.avg)
          ? obj.avg
          : works.length > 0
            ? works.reduce((sum, w) => sum + (w.stats?.ratingAvg ?? 0), 0) / works.length
            : 0,
      genres,
      platforms,
    } as unknown as T;
  }

  if (pathname.startsWith("/api/titles/") && !pathname.endsWith("/episodes")) {
    const obj = raw as Record<string, unknown>;
    const sanitizedTitle = obj.title ? sanitizeTitleRecord(obj.title, 0) : null;
    if (!sanitizedTitle) return raw;
    const similar = sanitizeTitleArray(obj.similar);
    const byAuthor = Array.isArray(obj.byAuthor) ? sanitizeTitleArray(obj.byAuthor) : undefined;
    const original = obj.original
      ? sanitizeTitleRecord(obj.original, 0) ?? sanitizedTitle
      : sanitizedTitle;
    const adaptations = sanitizeTitleArray(obj.adaptations);
    return {
      ...obj,
      title: sanitizedTitle,
      similar,
      ...(byAuthor ? { byAuthor } : {}),
      original,
      adaptations,
    } as unknown as T;
  }

  if (pathname === "/api/tags") {
    const obj = raw as Record<string, unknown>;
    const rawTags = Array.isArray(obj.tags) ? obj.tags : [];
    const tags = rawTags
      .filter(
        (entry): entry is { tag: string; count?: unknown } =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof (entry as { tag?: unknown }).tag === "string" &&
          (entry as { tag: string }).tag.trim().length > 0,
      )
      .map((entry) => ({
        tag: entry.tag.trim(),
        count:
          typeof entry.count === "number" && Number.isFinite(entry.count) && entry.count >= 0
            ? entry.count
            : 0,
      }));
    return {
      ...obj,
      tags,
    } as unknown as T;
  }

  return raw;
}

/**
 * 로컬 크롤링 카탈로그 스냅샷(Title 배열)에서 외부 API 호출 없이
 * 제목·이명·작가·그림작가·장르·태그·시놉시스를 즉시 필터링한다.
 * 한글 조합 중(예: "ㅍ", "판ㅌ", "달ㅂ", "닯") 자모 입력도 음절 경계 기준으로 매칭한다.
 */
export function filterTitlesByLocalQuery<
  T extends Pick<Title, "title" | "author" | "genres" | "tags"> &
    Partial<Pick<Title, "altTitles" | "artist" | "synopsis">>,
>(titles: readonly T[], rawQuery: string): T[] {
  const normalized = normalizeSearchToken(rawQuery);
  if (!normalized) return [...titles];
  const tokens = normalized.split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) return [...titles];

  return titles.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const fields = [
      item.title ?? "",
      ...(Array.isArray(item.altTitles) ? item.altTitles : []),
      item.author ?? "",
      item.artist ?? "",
      ...(Array.isArray(item.genres) ? item.genres : []),
      ...(Array.isArray(item.tags) ? item.tags : []),
      item.synopsis ?? "",
    ].filter((field): field is string => typeof field === "string" && field.length > 0);

    const joined = fields.join(" ");
    return tokens.every((token) => matchesHangulAwareQuery(joined, token));
  });
}

export interface DiscoverLocalMatchResult {
  readonly titles: Title[];
  readonly genres: string[];
  readonly tags: string[];
}

/**
 * 탐색 허브(/discover)에 이미 로드된 로컬 크롤링 스냅샷(/data/home.json)에서
 * 입력 검색어와 일치하는 작품·장르·태그를 외부 API 없이 즉시 추출한다.
 */
export function collectDiscoverLocalMatches(
  snapshot: DiscoverHomeSnapshot | null | undefined,
  rawQuery: string,
  limit = 6,
): DiscoverLocalMatchResult {
  const normalized = normalizeSearchToken(rawQuery);
  if (!snapshot || !normalized) {
    return { titles: [], genres: [], tags: [] };
  }

  const pool: Title[] = [];
  const seenIds = new Set<string>();
  const pushUnique = (items: readonly Title[] | undefined) => {
    if (!Array.isArray(items)) return;
    for (let i = 0; i < items.length; i++) {
      const sanitized = sanitizeTitleRecord(items[i], i);
      if (!sanitized || seenIds.has(sanitized.id)) continue;
      seenIds.add(sanitized.id);
      pool.push(sanitized);
    }
  };

  if (snapshot.spotlight) pushUnique([snapshot.spotlight]);
  pushUnique(snapshot.featured);
  pushUnique(snapshot.todayReleases);
  pushUnique(snapshot.topRated);
  pushUnique(snapshot.waitFree);
  pushUnique(snapshot.newest);

  const matchedTitles = filterTitlesByLocalQuery(pool, normalized).slice(0, limit);
  const matchedGenres = (Array.isArray(snapshot.genres) ? snapshot.genres : [])
    .filter((genre) => typeof genre === "string" && matchesHangulAwareQuery(genre, normalized))
    .slice(0, 6);
  const snapshotWithTags = snapshot as DiscoverHomeSnapshot & {
    readonly tags?: readonly { readonly tag: string }[];
  };
  const tagCandidates = new Set<string>();
  for (const entry of Array.isArray(snapshotWithTags.tags) ? snapshotWithTags.tags : []) {
    if (entry && typeof entry.tag === "string" && entry.tag.trim()) {
      tagCandidates.add(entry.tag.trim());
    }
  }
  for (const item of pool) {
    for (const tag of item.tags ?? []) {
      if (typeof tag === "string" && tag.trim()) tagCandidates.add(tag.trim());
    }
  }
  const matchedTags = [...tagCandidates]
    .filter((tag) => matchesHangulAwareQuery(tag, normalized))
    .slice(0, 6);

  return {
    titles: matchedTitles,
    genres: matchedGenres,
    tags: matchedTags,
  };
}
