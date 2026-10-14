/**
 * 소재 사용 이력 원장 — 최근 사용(MRU) + 사용 빈도 정렬의 단일 출처.
 *
 * 배경 (2026-10-14 main 실측):
 * - CSP 5.0 "최근 사용 소재(History 폴더)" + 빈도 정렬에 대응한다. 내부 패리티
 *   §4 감사 큐에도 Recently used materials·Material frequency sort가 남아 있었다.
 * - 통합 에셋 라이브러리(`studio-unified-asset-intelligence`)에는 MRU
 *   (`recents`, 최대 40건, `libraryView:"recent"`)가 이미 있으나 **사용 횟수는
 *   어디에도 기록되지 않아** 빈도순 정렬이 불가능했고, 별도 모듈
 *   (`studio-asset-catalog-enhancements`)의 빈도 정렬은 저장·호출부가 없는
 *   고아 상태에 tie-break가 이름 로케일 비교라 입력 순서에 따라 흔들렸다.
 * - 이 모듈이 그 빈틈을 메운다: 사용 이벤트 원장(ledger)을 개인 범위
 *   localStorage에 저장하는 패턴은 즐겨찾기(`studio-asset-favorites`)와
 *   설치 영수증(`creator-marketplace-install-receipt`)의 관습을 따른다 —
 *   소유자별 키 분리, 엄격 검증, 저장 실패 무시(편의 기능이 작업을 막지 않음).
 *   팀 공유 범위로 넓히지 않는다 (개인 사용 이력).
 *
 * 판정 연결:
 * - 소재를 쓰면 `recordMaterialUseInStorage` 한 번으로 원장에 쌓이고
 *   `recentMaterials`/`recentMaterialIds`가 즉시 그 소재를 맨 앞에 돌려준다
 *   → "최근 사용" 가상 폴더가 즉시 뜬다.
 * - 빈도 정렬은 결정적이다: 횟수 내림차순 → 최근 사용 내림차순 → id
 *   코드포인트 오름차순. 로케일·입력 순서에 의존하지 않으므로 동일 입력은
 *   항상 같은 순서를 낸다.
 */

import type { AssetUsageRecord } from "./studio-asset-catalog-enhancements";

export const MATERIAL_USAGE_STATE_VERSION = 1 as const;
export const MATERIAL_USAGE_STORAGE_KEY_PREFIX = "toonstudio.studio.material-usage.v1";
export const MATERIAL_USAGE_MAX_EVENTS = 2000;
export const MATERIAL_USAGE_DEFAULT_RECENT_COUNT = 40;
export const MATERIAL_USAGE_MAX_ID_LENGTH = 180;
export const MATERIAL_USAGE_MAX_SERIALIZED_CHARS = 512 * 1024;

export const MATERIAL_KINDS = [
  "brush",
  "image",
  "tone",
  "balloon",
  "pose",
  "3d",
  "template",
  "palette",
  "other",
] as const;

export type MaterialKind = (typeof MATERIAL_KINDS)[number];

const MATERIAL_KIND_SET: ReadonlySet<string> = new Set(MATERIAL_KINDS);
const STORAGE_KEY_MAX_LENGTH = 160;
const STORAGE_OWNER_PREVIEW_MAX_LENGTH = 72;

export interface MaterialUseEvent {
  readonly materialId: string;
  readonly kind: MaterialKind;
  /** Unix timestamp ms (통합 라이브러리 recents와 같은 단위). */
  readonly usedAt: number;
}

export interface MaterialUsageLedger {
  readonly version: typeof MATERIAL_USAGE_STATE_VERSION;
  readonly events: readonly MaterialUseEvent[];
}

export interface RecentMaterial {
  readonly materialId: string;
  readonly kind: MaterialKind;
  readonly lastUsedAt: number;
}

export interface MaterialFrequency {
  readonly materialId: string;
  readonly kind: MaterialKind;
  readonly useCount: number;
  readonly lastUsedAt: number;
}

/** 정렬 키 요약 — 통합 라이브러리·카탈로그 정렬이 공유하는 최소 형태. */
export interface MaterialUsageStat {
  readonly useCount: number;
  readonly lastUsedAt: number;
}

function freezeLedger(events: readonly MaterialUseEvent[]): MaterialUsageLedger {
  return Object.freeze({
    version: MATERIAL_USAGE_STATE_VERSION,
    events: Object.freeze([...events]),
  });
}

export function createMaterialUsageLedger(): MaterialUsageLedger {
  return freezeLedger([]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 통합 라이브러리와 같은 id 정규화 (NFKC·trim·길이 상한). */
export function sanitizeMaterialId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > MATERIAL_USAGE_MAX_ID_LENGTH) return null;
  return normalized;
}

function sanitizeKind(value: unknown): MaterialKind | null {
  return typeof value === "string" && MATERIAL_KIND_SET.has(value)
    ? (value as MaterialKind)
    : null;
}

function sanitizeEvent(value: unknown): MaterialUseEvent | null {
  if (!isRecord(value)) return null;
  const materialId = sanitizeMaterialId(value.materialId);
  const kind = sanitizeKind(value.kind);
  const usedAt = value.usedAt;
  if (
    !materialId
    || !kind
    || typeof usedAt !== "number"
    || !Number.isFinite(usedAt)
    || usedAt < 0
  ) {
    return null;
  }
  return Object.freeze({ materialId, kind, usedAt });
}

/**
 * 손상·미지 데이터를 canonical 원장으로 정규화한다. 잘못된 이벤트는 건별로
 * 버리고(원장 전체를 버리지 않는다), 연속 중복은 마지막 시각으로 접고,
 * 상한을 넘으면 가장 최근 이벤트만 남긴다.
 */
export function sanitizeMaterialUsageLedger(value: unknown): MaterialUsageLedger {
  if (!isRecord(value) || !Array.isArray(value.events)) return createMaterialUsageLedger();
  const deduped: MaterialUseEvent[] = [];
  for (const candidate of value.events) {
    const event = sanitizeEvent(candidate);
    if (!event) continue;
    const last = deduped[deduped.length - 1];
    if (last && last.materialId === event.materialId && last.kind === event.kind) {
      deduped[deduped.length - 1] = event;
    } else {
      deduped.push(event);
    }
  }
  const trimmed = deduped.length > MATERIAL_USAGE_MAX_EVENTS
    ? deduped.slice(deduped.length - MATERIAL_USAGE_MAX_EVENTS)
    : deduped;
  return freezeLedger(trimmed);
}

export function parseMaterialUsageLedger(
  serialized: string | null | undefined,
): MaterialUsageLedger {
  if (!serialized || serialized.length > MATERIAL_USAGE_MAX_SERIALIZED_CHARS) {
    return createMaterialUsageLedger();
  }
  try {
    return sanitizeMaterialUsageLedger(JSON.parse(serialized) as unknown);
  } catch {
    return createMaterialUsageLedger();
  }
}

export function serializeMaterialUsageLedger(ledger: MaterialUsageLedger): string {
  return JSON.stringify(sanitizeMaterialUsageLedger(ledger));
}

/**
 * 사용 이벤트 1건을 기록한다 (순수·불변). 같은 소재·종류의 연속 기록은
 * 횟수를 부풀리지 않고 마지막 시각만 갱신한다 — 팔레트 스크롤 같은
 * 노이즈성 반복 호출이 빈도를 왜곡하지 않게 하기 위함이다.
 * 유효하지 않은 입력이면 원본 참조를 그대로 돌려준다.
 */
export function recordMaterialUse(
  ledger: MaterialUsageLedger,
  materialId: string,
  kind: MaterialKind,
  usedAt: number = Date.now(),
): MaterialUsageLedger {
  const sanitizedId = sanitizeMaterialId(materialId);
  if (!sanitizedId || !MATERIAL_KIND_SET.has(kind)) return ledger;
  if (typeof usedAt !== "number" || !Number.isFinite(usedAt) || usedAt < 0) return ledger;
  const event: MaterialUseEvent = Object.freeze({ materialId: sanitizedId, kind, usedAt });
  const last = ledger.events[ledger.events.length - 1];
  const events = last && last.materialId === sanitizedId && last.kind === kind
    ? [...ledger.events.slice(0, -1), event]
    : [...ledger.events, event];
  const trimmed = events.length > MATERIAL_USAGE_MAX_EVENTS
    ? events.slice(events.length - MATERIAL_USAGE_MAX_EVENTS)
    : events;
  return freezeLedger(trimmed);
}

/** 최근 사용 순 (가장 최근이 앞). "최근 사용" 가상 폴더의 내용 순서다. */
export function recentMaterials(
  ledger: MaterialUsageLedger,
  count: number = MATERIAL_USAGE_DEFAULT_RECENT_COUNT,
  kind?: MaterialKind,
): RecentMaterial[] {
  const limit = Math.max(0, Math.floor(count));
  if (limit === 0) return [];
  const seen = new Map<string, RecentMaterial>();
  for (let index = ledger.events.length - 1; index >= 0; index -= 1) {
    const event = ledger.events[index];
    if (!event) continue;
    if (kind && event.kind !== kind) continue;
    if (!seen.has(event.materialId)) {
      seen.set(event.materialId, {
        materialId: event.materialId,
        kind: event.kind,
        lastUsedAt: event.usedAt,
      });
      if (seen.size >= limit) break;
    }
  }
  return [...seen.values()];
}

/** 가상 폴더 멤버십: 아직 존재하는 소재만, MRU 순서 그대로. */
export function recentMaterialIds(
  ledger: MaterialUsageLedger,
  availableIds?: ReadonlySet<string>,
  count: number = MATERIAL_USAGE_DEFAULT_RECENT_COUNT,
  kind?: MaterialKind,
): string[] {
  return recentMaterials(ledger, count, kind)
    .map((recent) => recent.materialId)
    .filter((id) => !availableIds || availableIds.has(id));
}

/** 소재별 횟수·최근 시각 요약. 빈도 정렬 키의 단일 도출 지점. */
export function materialUsageStats(
  ledger: MaterialUsageLedger,
): ReadonlyMap<string, MaterialUsageStat> {
  const stats = new Map<string, { useCount: number; lastUsedAt: number }>();
  for (const event of ledger.events) {
    const previous = stats.get(event.materialId);
    stats.set(event.materialId, {
      useCount: (previous?.useCount ?? 0) + 1,
      lastUsedAt: Math.max(previous?.lastUsedAt ?? 0, event.usedAt),
    });
  }
  return stats;
}

/**
 * 빈도 비교자 — 결정적 tie-break의 정본.
 * 횟수 내림차순 → 최근 사용 내림차순 → id 코드포인트 오름차순.
 * `localeCompare`를 쓰지 않으므로 로케일·런타임 환경이 달라도 순서가 같다.
 */
export function compareMaterialFrequency(
  stats: ReadonlyMap<string, MaterialUsageStat>,
  leftId: string,
  rightId: string,
): number {
  if (leftId === rightId) return 0;
  const left = stats.get(leftId);
  const right = stats.get(rightId);
  const countDelta = (right?.useCount ?? 0) - (left?.useCount ?? 0);
  if (countDelta !== 0) return countDelta;
  const recentDelta = (right?.lastUsedAt ?? 0) - (left?.lastUsedAt ?? 0);
  if (recentDelta !== 0) return recentDelta;
  return leftId < rightId ? -1 : 1;
}

/** 사용 빈도 순위. sinceMs를 주면 그 이후 이벤트만 센다 (예: 최근 90일). */
export function frequentMaterials(
  ledger: MaterialUsageLedger,
  count: number,
  options?: { readonly kind?: MaterialKind; readonly sinceMs?: number },
): MaterialFrequency[] {
  const limit = Math.max(0, Math.floor(count));
  if (limit === 0) return [];
  const byId = new Map<string, MaterialFrequency>();
  for (const event of ledger.events) {
    if (options?.kind && event.kind !== options.kind) continue;
    if (options?.sinceMs !== undefined && event.usedAt < options.sinceMs) continue;
    const previous = byId.get(event.materialId);
    byId.set(event.materialId, {
      materialId: event.materialId,
      kind: event.kind,
      useCount: (previous?.useCount ?? 0) + 1,
      lastUsedAt: Math.max(previous?.lastUsedAt ?? 0, event.usedAt),
    });
  }
  const stats = new Map(
    [...byId.values()].map((entry) => [
      entry.materialId,
      { useCount: entry.useCount, lastUsedAt: entry.lastUsedAt },
    ]),
  );
  return [...byId.values()]
    .sort((a, b) => compareMaterialFrequency(stats, a.materialId, b.materialId))
    .slice(0, limit);
}

/** 임의 소재 목록을 빈도순으로 정렬한다 (원본 불변, 결정적). */
export function sortMaterialsByFrequency<T>(
  items: readonly T[],
  ledger: MaterialUsageLedger,
  keyOf: (item: T) => string,
): T[] {
  const stats = materialUsageStats(ledger);
  return [...items].sort((a, b) => compareMaterialFrequency(stats, keyOf(a), keyOf(b)));
}

/** 임의 소재 목록을 최근 사용순으로 정렬한다 (미사용은 뒤, 동률은 빈도→id). */
export function sortMaterialsByRecent<T>(
  items: readonly T[],
  ledger: MaterialUsageLedger,
  keyOf: (item: T) => string,
): T[] {
  const stats = materialUsageStats(ledger);
  return [...items].sort((a, b) => {
    const leftId = keyOf(a);
    const rightId = keyOf(b);
    if (leftId === rightId) return 0;
    const recentDelta = (stats.get(rightId)?.lastUsedAt ?? 0)
      - (stats.get(leftId)?.lastUsedAt ?? 0);
    if (recentDelta !== 0) return recentDelta;
    return compareMaterialFrequency(stats, leftId, rightId);
  });
}

/** 소재가 삭제됐을 때 원장에서 흔적을 지운다 (고아 항목 방지). */
export function forgetMaterial(
  ledger: MaterialUsageLedger,
  materialId: string,
): MaterialUsageLedger {
  const sanitizedId = sanitizeMaterialId(materialId);
  if (!sanitizedId) return ledger;
  if (!ledger.events.some((event) => event.materialId === sanitizedId)) return ledger;
  return freezeLedger(ledger.events.filter((event) => event.materialId !== sanitizedId));
}

export function clearMaterialUsage(): MaterialUsageLedger {
  return createMaterialUsageLedger();
}

/**
 * 카탈로그 정렬 모듈(`studio-asset-catalog-enhancements`) 어댑터:
 * 원장 요약을 그 모듈의 `AssetCatalogState.usageRecords` 형태로 변환한다.
 * 패널은 `{ usageRecords: usageRecordsFromMaterialUsage(ledger), pinnedAssetIds }`
 * 를 만들어 `filterAndSortAssets(assets, state, { recentOnly: true }, "recent")`
 * (최근 사용 폴더) 또는 `"frequency"`(빈도순)로 그대로 호출하면 된다.
 */
export function usageRecordsFromMaterialUsage(
  ledger: MaterialUsageLedger,
): Readonly<Record<string, AssetUsageRecord>> {
  const records: Record<string, AssetUsageRecord> = {};
  for (const [materialId, stat] of materialUsageStats(ledger)) {
    records[materialId] = Object.freeze({
      assetId: materialId,
      useCount: stat.useCount,
      lastUsedAt: stat.lastUsedAt,
    });
  }
  return Object.freeze(records);
}

// --- 저장 (개인 범위, 즐겨찾기와 같은 소유자 키 패턴) ---

function ownerHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function ownerPreview(value: string): string {
  try {
    return encodeURIComponent(value).slice(0, STORAGE_OWNER_PREVIEW_MAX_LENGTH);
  } catch {
    return "invalid-unicode";
  }
}

/** 게스트와 로그인 소유자는 결정적·유계·비겹침 키를 받는다. */
export function materialUsageStorageKey(userId: string | null): string {
  const normalizedUserId = userId?.trim() ?? "";
  if (!normalizedUserId) return `${MATERIAL_USAGE_STORAGE_KEY_PREFIX}:guest`;
  const owner = `${ownerPreview(normalizedUserId)}-${ownerHash(normalizedUserId)}`;
  return `${MATERIAL_USAGE_STORAGE_KEY_PREFIX}:user:${owner}`.slice(0, STORAGE_KEY_MAX_LENGTH);
}

export type MaterialUsageStorage = Pick<Storage, "getItem" | "setItem">;

export function loadMaterialUsageLedger(
  storage: MaterialUsageStorage | null,
  userId: string | null,
): MaterialUsageLedger {
  if (!storage) return createMaterialUsageLedger();
  try {
    return parseMaterialUsageLedger(storage.getItem(materialUsageStorageKey(userId)));
  } catch {
    return createMaterialUsageLedger();
  }
}

export function saveMaterialUsageLedger(
  storage: MaterialUsageStorage | null,
  userId: string | null,
  ledger: MaterialUsageLedger,
): MaterialUsageLedger {
  const normalized = sanitizeMaterialUsageLedger(ledger);
  if (!storage) return normalized;
  try {
    storage.setItem(materialUsageStorageKey(userId), serializeMaterialUsageLedger(normalized));
  } catch {
    // 사용 이력은 편의 기능이다. 비공개/용량 제한 저장소가 작업을 막으면 안 된다.
  }
  return normalized;
}

/**
 * 소재 사용 지점(삽입·적용·선택 확정)의 단일 호출 지점:
 * 읽고 → 기록하고 → 저장하고 → 새 원장을 돌려준다. 호출부는 반환된
 * 원장으로 "최근 사용" 폴더와 빈도 정렬을 즉시 다시 그리면 된다.
 */
export function recordMaterialUseInStorage(
  storage: MaterialUsageStorage | null,
  userId: string | null,
  materialId: string,
  kind: MaterialKind,
  usedAt: number = Date.now(),
): MaterialUsageLedger {
  const next = recordMaterialUse(
    loadMaterialUsageLedger(storage, userId),
    materialId,
    kind,
    usedAt,
  );
  return saveMaterialUsageLedger(storage, userId, next);
}
