import {
  curateStudioUnifiedAssetHighlights,
  searchStudioUnifiedAssets,
  type StudioUnifiedAssetCategory,
  type StudioUnifiedAssetItem,
  type StudioUnifiedAssetScope,
} from "./studio-unified-asset-catalog";

export const STUDIO_UNIFIED_ASSET_LIBRARY_STORAGE_KEY =
  "toonstudio.studio.unified-asset-library.v1";

export const STUDIO_UNIFIED_ASSET_LIBRARY_STATE_VERSION = 1 as const;

const MAX_FAVORITES = 200;
const MAX_RECENTS = 40;
const MAX_TRAY_ITEMS = 24;
const MAX_RATINGS = 500;
const MAX_FLAGS = 500;
const MAX_ID_LENGTH = 180;

export type StudioUnifiedAssetLibraryView =
  | "all"
  | "favorites"
  | "recent"
  | "tray";

export type StudioUnifiedAssetFormat =
  | "all"
  | "template"
  | "image"
  | "vector"
  | "3d"
  | "tool";

export type StudioUnifiedAssetRightsFilter = "all" | "ready" | "review";
export type StudioUnifiedAssetEditabilityFilter = "all" | "editable";

/** Lightroom식 선별(culling) 메타 — 별점 1~5. 0은 미평가를 뜻한다. */
export type StudioUnifiedAssetRating = 1 | 2 | 3 | 4 | 5;

/** 선별 플래그. pick=채택 후보, hold=보류, reject=제외. */
export type StudioUnifiedAssetFlag = "pick" | "hold" | "reject";

export type StudioUnifiedAssetFlagFilter = "all" | StudioUnifiedAssetFlag | "unflagged";

export interface StudioUnifiedAssetRatingEntry {
  readonly id: string;
  readonly rating: StudioUnifiedAssetRating;
}

export interface StudioUnifiedAssetFlagEntry {
  readonly id: string;
  readonly flag: StudioUnifiedAssetFlag;
}
export type StudioUnifiedAssetSort = "recommended" | "name" | "rating";

export type StudioUnifiedAssetRightsStatus =
  | "verified"
  | "studio"
  | "personal"
  | "review";

export type StudioUnifiedAssetEditability =
  | "editable"
  | "scalable"
  | "flattened";

export interface StudioUnifiedAssetFacet {
  readonly format: Exclude<StudioUnifiedAssetFormat, "all">;
  readonly rights: StudioUnifiedAssetRightsStatus;
  readonly editability: StudioUnifiedAssetEditability;
}

export interface StudioUnifiedAssetRecentUse {
  readonly id: string;
  readonly usedAt: number;
}

export interface StudioUnifiedAssetLibraryState {
  readonly version: typeof STUDIO_UNIFIED_ASSET_LIBRARY_STATE_VERSION;
  readonly favorites: readonly string[];
  readonly recents: readonly StudioUnifiedAssetRecentUse[];
  readonly tray: readonly string[];
  readonly ratings: readonly StudioUnifiedAssetRatingEntry[];
  readonly flags: readonly StudioUnifiedAssetFlagEntry[];
}

export interface DiscoverStudioUnifiedAssetsInput {
  readonly query?: string;
  readonly category?: StudioUnifiedAssetCategory;
  readonly scope?: StudioUnifiedAssetScope;
  readonly libraryView?: StudioUnifiedAssetLibraryView;
  readonly format?: StudioUnifiedAssetFormat;
  readonly rights?: StudioUnifiedAssetRightsFilter;
  readonly editability?: StudioUnifiedAssetEditabilityFilter;
  readonly sort?: StudioUnifiedAssetSort;
  readonly minRating?: number;
  readonly flagFilter?: StudioUnifiedAssetFlagFilter;
  readonly limit?: number;
  readonly libraryState?: StudioUnifiedAssetLibraryState;
}

export const STUDIO_UNIFIED_ASSET_FORMAT_LABELS: Readonly<
  Record<StudioUnifiedAssetFormat, string>
> = Object.freeze({
  all: "전체 형식",
  template: "템플릿",
  image: "이미지",
  vector: "벡터",
  "3d": "3D",
  tool: "제작 도구",
});

export const STUDIO_UNIFIED_ASSET_RIGHTS_LABELS: Readonly<
  Record<StudioUnifiedAssetRightsStatus, string>
> = Object.freeze({
  verified: "권리 확인",
  studio: "Studio 제공",
  personal: "개인 보관",
  review: "권리 검토 필요",
});

export const STUDIO_UNIFIED_ASSET_EDITABILITY_LABELS: Readonly<
  Record<StudioUnifiedAssetEditability, string>
> = Object.freeze({
  editable: "구성 편집 가능",
  scalable: "크기 편집 가능",
  flattened: "평면 에셋",
});

export const STUDIO_UNIFIED_ASSET_FLAG_LABELS: Readonly<
  Record<StudioUnifiedAssetFlag, string>
> = Object.freeze({
  pick: "선별",
  hold: "보류",
  reject: "제외",
});

const STUDIO_UNIFIED_ASSET_FLAG_SET: ReadonlySet<string> = new Set(["pick", "hold", "reject"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > MAX_ID_LENGTH) return null;
  return normalized;
}

function sanitizeIdList(value: unknown, limit: number): readonly string[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const unique = new Set<string>();
  for (const candidate of value) {
    const id = sanitizeId(candidate);
    if (!id || unique.has(id)) continue;
    unique.add(id);
    if (unique.size >= limit) break;
  }
  return Object.freeze([...unique]);
}

function sanitizeRecents(value: unknown): readonly StudioUnifiedAssetRecentUse[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const recents = new Map<string, StudioUnifiedAssetRecentUse>();
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const id = sanitizeId(candidate.id);
    const usedAt = candidate.usedAt;
    if (!id || typeof usedAt !== "number" || !Number.isFinite(usedAt) || usedAt < 0) continue;
    const previous = recents.get(id);
    if (!previous || usedAt > previous.usedAt) recents.set(id, Object.freeze({ id, usedAt }));
    // Keep memory bounded while still considering late, newer records.
    if (recents.size > MAX_RECENTS) {
      let oldest: StudioUnifiedAssetRecentUse | undefined;
      for (const recent of recents.values()) {
        if (!oldest || recent.usedAt < oldest.usedAt) oldest = recent;
      }
      if (oldest) recents.delete(oldest.id);
    }
  }
  return Object.freeze([...recents.values()].sort((left, right) => right.usedAt - left.usedAt));
}

function sanitizeRatings(value: unknown): readonly StudioUnifiedAssetRatingEntry[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const byId = new Map<string, StudioUnifiedAssetRating>();
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const id = sanitizeId(candidate.id);
    const rating = candidate.rating;
    if (!id || typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      continue;
    }
    // Later entries win so a re-rate in persisted data replaces the older value.
    byId.set(id, rating as StudioUnifiedAssetRating);
  }
  return Object.freeze(
    [...byId]
      .slice(0, MAX_RATINGS)
      .map(([id, rating]) => Object.freeze({ id, rating })),
  );
}

function sanitizeFlags(value: unknown): readonly StudioUnifiedAssetFlagEntry[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const byId = new Map<string, StudioUnifiedAssetFlag>();
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const id = sanitizeId(candidate.id);
    const flag = candidate.flag;
    if (!id || typeof flag !== "string" || !STUDIO_UNIFIED_ASSET_FLAG_SET.has(flag)) continue;
    byId.set(id, flag as StudioUnifiedAssetFlag);
  }
  return Object.freeze(
    [...byId]
      .slice(0, MAX_FLAGS)
      .map(([id, flag]) => Object.freeze({ id, flag })),
  );
}

function freezeState(
  favorites: readonly string[],
  recents: readonly StudioUnifiedAssetRecentUse[],
  tray: readonly string[],
  ratings: readonly StudioUnifiedAssetRatingEntry[] = [],
  flags: readonly StudioUnifiedAssetFlagEntry[] = [],
): StudioUnifiedAssetLibraryState {
  return Object.freeze({
    version: STUDIO_UNIFIED_ASSET_LIBRARY_STATE_VERSION,
    favorites: Object.freeze([...favorites].slice(0, MAX_FAVORITES)),
    recents: Object.freeze([...recents].slice(0, MAX_RECENTS)),
    tray: Object.freeze([...tray].slice(0, MAX_TRAY_ITEMS)),
    ratings: Object.freeze([...ratings].slice(0, MAX_RATINGS)),
    flags: Object.freeze([...flags].slice(0, MAX_FLAGS)),
  });
}

export function createStudioUnifiedAssetLibraryState(): StudioUnifiedAssetLibraryState {
  return freezeState([], [], []);
}

export function sanitizeStudioUnifiedAssetLibraryState(
  value: unknown,
): StudioUnifiedAssetLibraryState {
  if (!isRecord(value)) return createStudioUnifiedAssetLibraryState();
  return freezeState(
    sanitizeIdList(value.favorites, MAX_FAVORITES),
    sanitizeRecents(value.recents),
    sanitizeIdList(value.tray, MAX_TRAY_ITEMS),
    sanitizeRatings(value.ratings),
    sanitizeFlags(value.flags),
  );
}

export function parseStudioUnifiedAssetLibraryState(
  serialized: string | null | undefined,
): StudioUnifiedAssetLibraryState {
  if (!serialized) return createStudioUnifiedAssetLibraryState();
  try {
    return sanitizeStudioUnifiedAssetLibraryState(JSON.parse(serialized));
  } catch {
    return createStudioUnifiedAssetLibraryState();
  }
}

export function serializeStudioUnifiedAssetLibraryState(
  state: StudioUnifiedAssetLibraryState,
): string {
  return JSON.stringify(sanitizeStudioUnifiedAssetLibraryState(state));
}

function toggleBoundedId(
  values: readonly string[],
  id: string,
  limit: number,
): readonly string[] {
  const sanitized = sanitizeId(id);
  if (!sanitized) return values;
  if (values.includes(sanitized)) {
    return Object.freeze(values.filter((value) => value !== sanitized));
  }
  return Object.freeze([sanitized, ...values].slice(0, limit));
}

export function toggleStudioUnifiedAssetFavorite(
  state: StudioUnifiedAssetLibraryState,
  id: string,
): StudioUnifiedAssetLibraryState {
  return freezeState(
    toggleBoundedId(state.favorites, id, MAX_FAVORITES),
    state.recents,
    state.tray,
    state.ratings,
    state.flags,
  );
}

export function toggleStudioUnifiedAssetTray(
  state: StudioUnifiedAssetLibraryState,
  id: string,
): StudioUnifiedAssetLibraryState {
  return freezeState(
    state.favorites,
    state.recents,
    toggleBoundedId(state.tray, id, MAX_TRAY_ITEMS),
    state.ratings,
    state.flags,
  );
}

export function recordStudioUnifiedAssetUse(
  state: StudioUnifiedAssetLibraryState,
  id: string,
  usedAt = Date.now(),
): StudioUnifiedAssetLibraryState {
  const sanitized = sanitizeId(id);
  if (!sanitized || !Number.isFinite(usedAt) || usedAt < 0) return state;
  const recents = [
    Object.freeze({ id: sanitized, usedAt }),
    ...state.recents.filter((item) => item.id !== sanitized),
  ].slice(0, MAX_RECENTS);
  return freezeState(state.favorites, recents, state.tray, state.ratings, state.flags);
}

export function getStudioUnifiedAssetRating(
  state: StudioUnifiedAssetLibraryState,
  id: string,
): StudioUnifiedAssetRating | 0 {
  const sanitized = sanitizeId(id);
  if (!sanitized) return 0;
  return state.ratings.find((entry) => entry.id === sanitized)?.rating ?? 0;
}

export function getStudioUnifiedAssetFlag(
  state: StudioUnifiedAssetLibraryState,
  id: string,
): StudioUnifiedAssetFlag | null {
  const sanitized = sanitizeId(id);
  if (!sanitized) return null;
  return state.flags.find((entry) => entry.id === sanitized)?.flag ?? null;
}

function isStudioUnifiedAssetRating(value: number): value is StudioUnifiedAssetRating {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

export function setStudioUnifiedAssetRating(
  state: StudioUnifiedAssetLibraryState,
  id: string,
  rating: StudioUnifiedAssetRating | 0,
): StudioUnifiedAssetLibraryState {
  const sanitized = sanitizeId(id);
  if (!sanitized) return state;
  if (rating !== 0 && !isStudioUnifiedAssetRating(rating)) return state;
  const rest = state.ratings.filter((entry) => entry.id !== sanitized);
  const ratings = rating === 0
    ? rest
    : [...rest, Object.freeze({ id: sanitized, rating })];
  return freezeState(state.favorites, state.recents, state.tray, ratings, state.flags);
}

export function setStudioUnifiedAssetFlag(
  state: StudioUnifiedAssetLibraryState,
  id: string,
  flag: StudioUnifiedAssetFlag | null,
): StudioUnifiedAssetLibraryState {
  const sanitized = sanitizeId(id);
  if (!sanitized) return state;
  if (flag !== null && !STUDIO_UNIFIED_ASSET_FLAG_SET.has(flag)) return state;
  const rest = state.flags.filter((entry) => entry.id !== sanitized);
  const flags = flag === null
    ? rest
    : [...rest, Object.freeze({ id: sanitized, flag })];
  return freezeState(state.favorites, state.recents, state.tray, state.ratings, flags);
}

export type StudioUnifiedAssetCurationPresetId = "pick-top" | "hold" | "reject" | "clear";

export interface StudioUnifiedAssetCurationPreset {
  readonly id: StudioUnifiedAssetCurationPresetId;
  readonly label: string;
  /** undefined면 기존 플래그 유지, null이면 플래그 해제. */
  readonly flag?: StudioUnifiedAssetFlag | null;
  /** undefined면 기존 별점 유지, 0이면 별점 해제. */
  readonly rating?: StudioUnifiedAssetRating | 0;
}

/** 여러 에셋에 한 번에 적용하는 선별 프리셋. 별점·플래그를 함께 묶어 선별 속도를 올린다. */
export const STUDIO_UNIFIED_ASSET_CURATION_PRESETS: readonly StudioUnifiedAssetCurationPreset[] =
  Object.freeze([
    Object.freeze({ id: "pick-top", label: "선별 · 별점 4", flag: "pick" as const, rating: 4 as const }),
    Object.freeze({ id: "hold", label: "보류로 표시", flag: "hold" as const }),
    Object.freeze({ id: "reject", label: "제외로 표시", flag: "reject" as const }),
    Object.freeze({ id: "clear", label: "선별 해제", flag: null, rating: 0 as const }),
  ]);

export function applyStudioUnifiedAssetCurationPreset(
  state: StudioUnifiedAssetLibraryState,
  ids: readonly string[],
  presetId: StudioUnifiedAssetCurationPresetId,
): StudioUnifiedAssetLibraryState {
  const preset = STUDIO_UNIFIED_ASSET_CURATION_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) return state;
  let next = state;
  for (const id of ids) {
    if (preset.flag !== undefined) next = setStudioUnifiedAssetFlag(next, id, preset.flag);
    if (preset.rating !== undefined) next = setStudioUnifiedAssetRating(next, id, preset.rating);
  }
  return next;
}

/**
 * 이미지 조정 프리셋(밝기·곡선·필터 그래프)의 일괄 적용 지점 — 설계만 존재하고 실행 경로는 없다.
 *
 * 조정 그래프는 캔버스 문서의 레이어에서만 동작하고, 라이브러리 에셋은 내용이 바뀌면
 * 콘텐츠 해시가 달라지는 불변 저장 단위라 "라이브러리에서 바로 굽기"는 새 에셋 생성·권리 메타
 * 승계·되돌리기 정책까지 함께 결정해야 한다. 그 결정이 나기 전까지 이 레지스트리는 비어 있고,
 * 관리 UI는 빈 레지스트리를 보고 일괄 조정 적용을 정직하게 비활성으로 표시한다.
 * 굽기 파이프라인이 생기면 프리셋을 이 계약으로 등록하고 UI는 그대로 소비한다.
 */
export interface StudioUnifiedAssetBulkAdjustmentPreset {
  readonly id: string;
  readonly label: string;
  readonly apply: (items: readonly StudioUnifiedAssetItem[]) => Promise<void>;
}

export const STUDIO_UNIFIED_ASSET_BULK_ADJUSTMENT_PRESETS:
  readonly StudioUnifiedAssetBulkAdjustmentPreset[] = Object.freeze([]);

export function deriveStudioUnifiedAssetFacet(
  item: StudioUnifiedAssetItem,
): StudioUnifiedAssetFacet {
  const rights: StudioUnifiedAssetRightsStatus =
    item.discoverability === "caution" || item.badges.includes("권리 미확인")
      ? "review"
      : item.scope === "mine"
        ? item.badges.includes("권리 확인")
          ? "verified"
          : "personal"
        : "studio";

  switch (item.source.kind) {
    case "scene-template":
      return Object.freeze({
        format: "template",
        rights,
        editability: "editable",
      });
    case "element":
      return Object.freeze({
        format: "vector",
        rights,
        editability: "editable",
      });
    case "object-3d":
      return Object.freeze({
        format: "3d",
        rights,
        editability: "editable",
      });
    case "native-tool":
      return Object.freeze({
        format: "tool",
        rights,
        editability: "editable",
      });
    case "background":
      return Object.freeze({
        format: item.preview.kind === "svg" ? "vector" : "image",
        rights,
        editability: item.preview.kind === "svg" ? "scalable" : "flattened",
      });
    case "local":
    case "builtin-raster":
      return Object.freeze({
        format: item.preview.kind === "svg" ? "vector" : "image",
        rights,
        editability: item.preview.kind === "svg" ? "scalable" : "flattened",
      });
    default: {
      const exhaustive: never = item.source;
      throw new Error(`지원하지 않는 에셋 소스입니다: ${String(exhaustive)}`);
    }
  }
}

function matchesLibraryView(
  item: StudioUnifiedAssetItem,
  view: StudioUnifiedAssetLibraryView,
  state: StudioUnifiedAssetLibraryState,
): boolean {
  if (view === "favorites") return state.favorites.includes(item.id);
  if (view === "recent") return state.recents.some((recent) => recent.id === item.id);
  if (view === "tray") return state.tray.includes(item.id);
  return true;
}

function matchesFacetFilters(
  item: StudioUnifiedAssetItem,
  format: StudioUnifiedAssetFormat,
  rights: StudioUnifiedAssetRightsFilter,
  editability: StudioUnifiedAssetEditabilityFilter,
): boolean {
  const facet = deriveStudioUnifiedAssetFacet(item);
  if (format !== "all" && facet.format !== format) return false;
  if (rights === "ready" && facet.rights === "review") return false;
  if (rights === "review" && facet.rights !== "review") return false;
  if (editability === "editable" && facet.editability === "flattened") return false;
  return true;
}

function matchesCurationFilter(
  item: StudioUnifiedAssetItem,
  state: StudioUnifiedAssetLibraryState,
  minRating: number,
  flagFilter: StudioUnifiedAssetFlagFilter,
): boolean {
  if (minRating > 0 && getStudioUnifiedAssetRating(state, item.id) < minRating) return false;
  if (flagFilter === "all") return true;
  const flag = getStudioUnifiedAssetFlag(state, item.id);
  return flagFilter === "unflagged" ? flag === null : flag === flagFilter;
}

function recentPosition(
  state: StudioUnifiedAssetLibraryState,
  id: string,
): number {
  const index = state.recents.findIndex((recent) => recent.id === id);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

export function discoverStudioUnifiedAssets(
  items: readonly StudioUnifiedAssetItem[],
  input: DiscoverStudioUnifiedAssetsInput = {},
): readonly StudioUnifiedAssetItem[] {
  const query = input.query?.trim() ?? "";
  const category = input.category ?? "all";
  const scope = input.scope ?? "all";
  const libraryView = input.libraryView ?? "all";
  const format = input.format ?? "all";
  const rights = input.rights ?? "all";
  const editability = input.editability ?? "all";
  const sort = input.sort ?? "recommended";
  const minRating = input.minRating ?? 0;
  const flagFilter = input.flagFilter ?? "all";
  const state = input.libraryState ?? createStudioUnifiedAssetLibraryState();
  const limit = Math.max(1, Math.min(240, Math.floor(input.limit ?? 80)));

  const eligible = items
    .filter((item) => category === "all" || item.category === category)
    .filter((item) => scope === "all" || item.scope === scope)
    .filter((item) => matchesLibraryView(item, libraryView, state))
    .filter((item) => matchesFacetFilters(item, format, rights, editability))
    .filter((item) => matchesCurationFilter(item, state, minRating, flagFilter));

  const hasStructuredFilters =
    libraryView !== "all"
    || format !== "all"
    || rights !== "all"
    || editability !== "all"
    || minRating > 0
    || flagFilter !== "all";
  const result = query
    ? [...searchStudioUnifiedAssets(eligible, { query, limit: 240 })]
    : hasStructuredFilters
      ? [...eligible].sort(
          (left, right) =>
            right.sortPriority - left.sortPriority
            || left.title.localeCompare(right.title, "ko"),
        )
      : [...curateStudioUnifiedAssetHighlights(eligible, { limit: 120 })];

  if (libraryView === "recent") {
    result.sort(
      (left, right) => recentPosition(state, left.id) - recentPosition(state, right.id),
    );
  } else if (sort === "rating") {
    result.sort(
      (left, right) =>
        getStudioUnifiedAssetRating(state, right.id) - getStudioUnifiedAssetRating(state, left.id)
        || right.sortPriority - left.sortPriority
        || left.title.localeCompare(right.title, "ko"),
    );
  } else if (sort === "name") {
    result.sort((left, right) => left.title.localeCompare(right.title, "ko"));
  }

  return Object.freeze(result.slice(0, limit));
}

function normalizeToken(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
}

function itemTokens(item: StudioUnifiedAssetItem): ReadonlySet<string> {
  return new Set(
    [item.title, item.categoryLabel, ...item.keywords, ...item.badges]
      .flatMap((value) => normalizeToken(value).split(/[^\p{L}\p{N}]+/u))
      .filter((value) => value.length >= 2),
  );
}

function relatedScore(
  anchor: StudioUnifiedAssetItem,
  candidate: StudioUnifiedAssetItem,
): number {
  const anchorFacet = deriveStudioUnifiedAssetFacet(anchor);
  const candidateFacet = deriveStudioUnifiedAssetFacet(candidate);
  let score = 0;
  if (anchor.category === candidate.category) score += 50;
  if (anchorFacet.format === candidateFacet.format) score += 30;
  if (anchor.source.kind === candidate.source.kind) score += 16;
  if (anchor.scope === candidate.scope) score += 6;
  if (candidate.discoverability === "featured") score += 10;
  if (candidateFacet.rights === "review") score -= 120;

  const anchorTokens = itemTokens(anchor);
  const candidateTokens = itemTokens(candidate);
  for (const token of anchorTokens) {
    if (candidateTokens.has(token)) score += 12;
  }
  return score;
}

export function findRelatedStudioUnifiedAssets(
  items: readonly StudioUnifiedAssetItem[],
  anchor: StudioUnifiedAssetItem,
  limit = 6,
): readonly StudioUnifiedAssetItem[] {
  const boundedLimit = Math.max(1, Math.min(12, Math.floor(limit)));
  return Object.freeze(
    items
      .filter(
        (item) =>
          item.id !== anchor.id
          && deriveStudioUnifiedAssetFacet(item).rights !== "review",
      )
      .map((item) => ({ item, score: relatedScore(anchor, item) }))
      .filter(({ score }) => score > 0)
      .sort(
        (left, right) =>
          right.score - left.score
          || right.item.sortPriority - left.item.sortPriority
          || left.item.title.localeCompare(right.item.title, "ko"),
      )
      .slice(0, boundedLimit)
      .map(({ item }) => item),
  );
}
