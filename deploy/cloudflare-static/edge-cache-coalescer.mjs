/**
 * 엣지 공개 읽기용 Singleflight(진행 중 요청 병합기) + Stale-While-Revalidate 캐시 실드.
 *
 * 동일한 공개 GET 캐시 미스가 동시에 N건 들어와도 서울 `onpod` 원점 호출은 정확히 1건으로
 * 합치고(1 MISS + N-1 COALESCED), 만료 직후 SWR 구간에서는 즉시 `STALE` 응답을 돌려준 뒤
 * `ctx.waitUntil`을 통해 백그라운드 갱신을 1건만 수행한다.
 */
import {
  API_LANE_HEADER,
  CORE_BYPASS_CACHE_CONTROL,
  EDGE_CACHE_HEADER,
  buildCanonicalEdgeCacheKey,
  classifyApiLane,
  hasPrivateOrAuthResponseHeaders,
  isEdgeCacheablePublicRead,
} from "./edge-api-lane-router.mjs";
import { negotiateImageFormat } from "./edge-image-negotiator.mjs";

export const EDGE_CACHE_STATUS = Object.freeze({
  HIT: "HIT",
  STALE: "STALE",
  COALESCED: "COALESCED",
  MISS: "MISS",
  BYPASS: "BYPASS",
});

export const DEFAULT_MAX_CACHEABLE_BYTES = 2 * 1024 * 1024;

const STORED_AT_HEADER = "x-toonstudio-cache-stored-at";
const FRESH_UNTIL_HEADER = "x-toonstudio-cache-fresh-until";
const STALE_UNTIL_HEADER = "x-toonstudio-cache-stale-until";
const INTERNAL_HEADERS = Object.freeze([STORED_AT_HEADER, FRESH_UNTIL_HEADER, STALE_UNTIL_HEADER]);
const INTERNAL_ACCEPT_VARIANT_PARAM = "__ts_edge_accept_variant";
const ACCEPT_NEGOTIATED_PATHS = Object.freeze(new Set(["/api/cover"]));
const ORIGIN_CONDITION_HEADERS = Object.freeze([
  "if-match", "if-none-match", "if-modified-since", "if-unmodified-since", "if-range", "range",
]);

const keyOf = (keyRequest) => (typeof keyRequest === "string" ? keyRequest : keyRequest.url);
const isWebSocketUpgradeRequest = (request) =>
  request?.headers?.get("upgrade")?.toLowerCase() === "websocket";
const isNullBodyStatus = (status) => status === 204 || status === 205 || status === 304;

function stripTrailingSlashes(pathname) {
  let end = pathname.length;
  while (end > 1 && pathname.charCodeAt(end - 1) === 47) end -= 1;
  return end === pathname.length ? pathname : pathname.slice(0, end);
}

function buildShieldCacheKey(request) {
  const canonicalUrl = buildCanonicalEdgeCacheKey(request);
  const parsed = new URL(canonicalUrl);
  const pathname = stripTrailingSlashes(parsed.pathname);
  if (!ACCEPT_NEGOTIATED_PATHS.has(pathname)) {
    return { flightKey: canonicalUrl, cacheKeyUrl: canonicalUrl, keyedByAccept: false };
  }
  const acceptVariant = negotiateImageFormat(request?.headers?.get("accept") ?? "");
  parsed.searchParams.set(INTERNAL_ACCEPT_VARIANT_PARAM, acceptVariant);
  const variantUrl = parsed.toString();
  return { flightKey: `${canonicalUrl}\0accept=${acceptVariant}`, cacheKeyUrl: variantUrl, keyedByAccept: true };
}

function hasNoStoreDirective(headers) {
  const raw = headers?.get("cache-control");
  if (!raw) return false;
  for (const part of raw.split(",")) {
    const token = part.split("=", 1)[0]?.trim().toLowerCase();
    if (token === "no-store") return true;
  }
  return false;
}

function hasUncoveredVaryHeader(headers, keyedByAccept) {
  const varyRaw = headers?.get("vary");
  if (!varyRaw) return false;
  for (const part of varyRaw.split(",")) {
    const token = part.trim().toLowerCase();
    if (!token || token === "accept-encoding") continue;
    if (token === "accept" && keyedByAccept) continue;
    return true;
  }
  return false;
}

function isUnshareableOriginResponse(response, keyedByAccept) {
  return (
    hasPrivateOrAuthResponseHeaders(response)
    || hasNoStoreDirective(response?.headers)
    || hasUncoveredVaryHeader(response?.headers, keyedByAccept)
  );
}

async function cancelBodySafely(response) {
  try {
    await response?.body?.cancel();
  } catch {
    // 본문 취소 실패가 응답 반환이나 정리 경로를 막지 않도록 무시한다.
  }
}

function parseFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseContentLength(headers) {
  const raw = headers.get("content-length")?.trim() ?? "";
  if (!/^\d+$/u.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function stripInternalHeaders(headers) {
  for (const name of INTERNAL_HEADERS) headers.delete(name);
}

function cloneSnapshot(meta) {
  return new Response(isNullBodyStatus(meta.status) ? null : meta.bodyBytes.slice(0), {
    status: meta.status,
    statusText: meta.statusText,
    headers: new Headers(meta.headers),
  });
}

async function captureSnapshot(response) {
  return {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers.entries()],
    bodyBytes: await response.arrayBuffer(),
  };
}

function adaptMapToEdgeCache(map) {
  const snapshots = new WeakMap();
  return {
    async match(keyRequest) {
      const stored = map.get(keyOf(keyRequest));
      if (!stored) return undefined;
      const meta = snapshots.get(stored);
      return meta ? cloneSnapshot(meta) : stored.clone();
    },
    async put(keyRequest, response) {
      const meta = await captureSnapshot(response);
      const cached = cloneSnapshot(meta);
      snapshots.set(cached, meta);
      map.set(keyOf(keyRequest), cached);
    },
    async delete(keyRequest) {
      return map.delete(keyOf(keyRequest));
    },
  };
}

function resolveEdgeCacheStore(cacheOption) {
  if (cacheOption === null) return null;
  if (cacheOption === undefined) {
    const candidate = globalThis.caches?.default;
    return candidate && typeof candidate.match === "function" && typeof candidate.put === "function"
      ? candidate
      : null;
  }
  if (cacheOption instanceof Map) return adaptMapToEdgeCache(cacheOption);
  return typeof cacheOption.match === "function" && typeof cacheOption.put === "function"
    ? cacheOption
    : null;
}

/** Cloudflare `caches.default`와 동일한 `match/put/delete` 계약을 제공하는 인메모리 엣지 캐시. */
export function createMemoryEdgeCache({ maxEntries = 512 } = {}) {
  const entries = new Map();
  return {
    get size() { return entries.size; },
    async match(keyRequest) {
      const meta = entries.get(keyOf(keyRequest));
      return meta ? cloneSnapshot(meta) : undefined;
    },
    async put(keyRequest, response) {
      const key = keyOf(keyRequest);
      const meta = await captureSnapshot(response);
      if (!entries.has(key) && entries.size >= maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey !== undefined) entries.delete(oldestKey);
      }
      entries.set(key, meta);
    },
    async delete(keyRequest) { return entries.delete(keyOf(keyRequest)); },
    clear() { entries.clear(); },
  };
}

async function safeCacheMatch(cacheStore, keyRequest) {
  if (!cacheStore) return undefined;
  try { return await cacheStore.match(keyRequest); } catch { return undefined; }
}

async function safeCachePut(cacheStore, keyRequest, response) {
  if (!cacheStore) return;
  try { await cacheStore.put(keyRequest, response); } catch { /* 캐시 기록 실패는 fail-open */ }
}

function buildBypassResponse(response, classification, enforcePrivateCacheControl) {
  const headers = new Headers(response.headers);
  stripInternalHeaders(headers);
  headers.set(API_LANE_HEADER, classification.lane);
  headers.set(EDGE_CACHE_HEADER, EDGE_CACHE_STATUS.BYPASS);
  if (enforcePrivateCacheControl) headers.set("cache-control", CORE_BYPASS_CACHE_CONTROL);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function buildStoredCacheEntry(snapshot, classification, storedAtMs) {
  const freshUntilMs = storedAtMs + classification.ttlSeconds * 1000;
  const staleUntilMs = storedAtMs + (classification.ttlSeconds + classification.swrSeconds) * 1000;
  const headers = new Headers(snapshot.headers);
  stripInternalHeaders(headers);
  headers.set(
    "cache-control",
    `public, max-age=${classification.ttlSeconds}, s-maxage=${classification.ttlSeconds + classification.swrSeconds}, stale-while-revalidate=${classification.swrSeconds}`,
  );
  headers.set(STORED_AT_HEADER, String(storedAtMs));
  headers.set(FRESH_UNTIL_HEADER, String(freshUntilMs));
  headers.set(STALE_UNTIL_HEADER, String(staleUntilMs));
  return new Response(isNullBodyStatus(snapshot.status) ? null : snapshot.bodyBytes.slice(0), {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers,
  });
}

function buildClientResponse(source, { method, lane, cacheStatus, clientCacheControl, ageSeconds }) {
  const headers = new Headers(source.headers);
  stripInternalHeaders(headers);
  if (clientCacheControl) headers.set("cache-control", clientCacheControl);
  if (ageSeconds !== undefined) headers.set("age", String(Math.max(0, ageSeconds)));
  headers.set(API_LANE_HEADER, lane);
  headers.set(EDGE_CACHE_HEADER, cacheStatus);
  const body = method === "HEAD" || isNullBodyStatus(source.status)
    ? null
    : source.bodyBytes !== undefined ? source.bodyBytes.slice(0) : source.body;
  if (method === "HEAD" && source.body) void cancelBodySafely(source);
  return new Response(body, { status: source.status, statusText: source.statusText, headers });
}

async function readBoundedSnapshot(response, maxCacheableBytes) {
  const declaredBytes = parseContentLength(response.headers);
  if (declaredBytes !== null && declaredBytes > maxCacheableBytes) return null;
  const meta = await captureSnapshot(response);
  return { ...meta, oversized: meta.bodyBytes.byteLength > maxCacheableBytes };
}

/** 4-Lane 분류 + Singleflight 요청 병합 + SWR 엣지 캐시 실드 핸들러를 생성한다. */
export function createEdgeApiCacheCoalescer(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const maxCacheableBytes = Number.isInteger(options.maxCacheableBytes) && options.maxCacheableBytes > 0
    ? options.maxCacheableBytes
    : DEFAULT_MAX_CACHEABLE_BYTES;
  const cacheOption = options.cache;
  const inFlightMisses = new Map();
  const inFlightRevalidations = new Map();

  async function executeOriginFlight(request, classification, flightKey, cacheKeyRequest, keyedByAccept, cacheStore, originFetch) {
    try {
      const originResponse = await originFetch(request);
      if (isUnshareableOriginResponse(originResponse, keyedByAccept)) {
        return { kind: "private-unshareable", leaderResponse: originResponse };
      }
      const cacheable = isEdgeCacheablePublicRead(request, originResponse);
      const snapshot = await readBoundedSnapshot(originResponse, maxCacheableBytes);
      if (!snapshot) return { kind: "private-unshareable", leaderResponse: originResponse };
      if (!cacheable || snapshot.oversized) return { kind: "shared-uncacheable-safe", snapshot };

      if (cacheStore) {
        await safeCachePut(cacheStore, cacheKeyRequest, buildStoredCacheEntry(snapshot, classification, now()));
      }
      return { kind: "shared-cacheable", snapshot };
    } finally {
      inFlightMisses.delete(flightKey);
    }
  }

  function triggerBackgroundRevalidate(request, classification, flightKey, cacheKeyRequest, keyedByAccept, cacheStore, originFetch, ctx) {
    if (inFlightRevalidations.has(flightKey)) return;
    const refreshRequest = request.method.toUpperCase() === "GET"
      ? request
      : new Request(request.url, { method: "GET", headers: request.headers });

    const refreshPromise = (async () => {
      try {
        const refreshed = await originFetch(refreshRequest);
        if (isUnshareableOriginResponse(refreshed, keyedByAccept) || !isEdgeCacheablePublicRead(refreshRequest, refreshed)) {
          await cancelBodySafely(refreshed);
          return;
        }
        const snapshot = await readBoundedSnapshot(refreshed, maxCacheableBytes);
        if (!snapshot || snapshot.oversized) return;
        await safeCachePut(cacheStore, cacheKeyRequest, buildStoredCacheEntry(snapshot, classification, now()));
      } catch {
        // 백그라운드 재검증 실패는 이미 반환된 STALE 응답을 깨뜨리지 않는다.
      } finally {
        inFlightRevalidations.delete(flightKey);
      }
    })();

    inFlightRevalidations.set(flightKey, refreshPromise);
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(refreshPromise);
  }

  async function renderOutcome(outcome, { isLeader, request, classification, method, originFetch }) {
    if (outcome.kind === "shared-cacheable") {
      return buildClientResponse(outcome.snapshot, {
        method, lane: classification.lane,
        cacheStatus: isLeader ? EDGE_CACHE_STATUS.MISS : EDGE_CACHE_STATUS.COALESCED,
        clientCacheControl: classification.cacheControl,
      });
    }
    if (outcome.kind === "shared-uncacheable-safe") {
      return buildClientResponse(outcome.snapshot, {
        method, lane: classification.lane, cacheStatus: EDGE_CACHE_STATUS.BYPASS, clientCacheControl: null,
      });
    }
    if (isLeader) return buildBypassResponse(outcome.leaderResponse, classification, false);
    // 원점이 Set-Cookie/private/no-store 또는 키 미반영 Vary를 반환했다면 다른 대기자에게 절대 공유하지 않는다(fail-closed).
    return buildBypassResponse(await originFetch(request), classification, false);
  }

  async function handle(request, originFetch, ctx) {
    const classification = classifyApiLane(request);
    const method = String(request?.method ?? "GET").toUpperCase();
    if (!classification.cacheable) {
      const originResponse = await originFetch(request);
      if (isWebSocketUpgradeRequest(request) || originResponse.status === 101) return originResponse;
      return buildBypassResponse(originResponse, classification, true);
    }

    // 조건·범위 헤더는 URL 캐시 키에 포함되지 않는다. 원점에 그대로 전달해
    // 304/412/206을 일반 GET의 캐시 적중이나 진행 중 요청과 섞지 않는다.
    if (ORIGIN_CONDITION_HEADERS.some((name) => request.headers.has(name))) {
      return buildBypassResponse(await originFetch(request), classification, false);
    }

    const { flightKey, cacheKeyUrl, keyedByAccept } = buildShieldCacheKey(request);
    const cacheKeyRequest = new Request(cacheKeyUrl, { method: "GET" });
    const cacheStore = resolveEdgeCacheStore(cacheOption);

    if (method === "GET") {
      const activeBeforeLookup = inFlightMisses.get(flightKey);
      if (activeBeforeLookup) {
        return renderOutcome(await activeBeforeLookup, { isLeader: false, request, classification, method, originFetch });
      }
    }

    const cached = await safeCacheMatch(cacheStore, cacheKeyRequest);
    if (cached) {
      const currentTime = now();
      const storedAt = parseFiniteNumber(cached.headers.get(STORED_AT_HEADER)) ?? currentTime;
      const freshUntil = parseFiniteNumber(cached.headers.get(FRESH_UNTIL_HEADER))
        ?? (storedAt + classification.ttlSeconds * 1000);
      const staleUntil = parseFiniteNumber(cached.headers.get(STALE_UNTIL_HEADER))
        ?? (freshUntil + classification.swrSeconds * 1000);
      const ageSeconds = Math.max(0, Math.floor((currentTime - storedAt) / 1000));

      if (currentTime < freshUntil) {
        return buildClientResponse(cached, {
          method, lane: classification.lane, cacheStatus: EDGE_CACHE_STATUS.HIT,
          clientCacheControl: classification.cacheControl, ageSeconds,
        });
      }
      if (currentTime < staleUntil) {
        triggerBackgroundRevalidate(request, classification, flightKey, cacheKeyRequest, keyedByAccept, cacheStore, originFetch, ctx);
        return buildClientResponse(cached, {
          method, lane: classification.lane, cacheStatus: EDGE_CACHE_STATUS.STALE,
          clientCacheControl: classification.cacheControl, ageSeconds,
        });
      }
      await cancelBodySafely(cached);
    }

    if (method === "HEAD") {
      const originResponse = await originFetch(request);
      return !isUnshareableOriginResponse(originResponse, keyedByAccept) && isEdgeCacheablePublicRead(request, originResponse)
        ? buildClientResponse(originResponse, {
          method: "HEAD", lane: classification.lane, cacheStatus: EDGE_CACHE_STATUS.MISS,
          clientCacheControl: classification.cacheControl,
        })
        : buildBypassResponse(originResponse, classification, false);
    }

    // await 이후 동기 구간에서 즉시 inFlightMisses를 확인·등록해 N건 동시 미스를 정확히 1건으로 병합한다.
    const existingFlight = inFlightMisses.get(flightKey);
    if (existingFlight) {
      return renderOutcome(await existingFlight, { isLeader: false, request, classification, method, originFetch });
    }

    const flightPromise = executeOriginFlight(request, classification, flightKey, cacheKeyRequest, keyedByAccept, cacheStore, originFetch);
    inFlightMisses.set(flightKey, flightPromise);
    return renderOutcome(await flightPromise, { isLeader: true, request, classification, method, originFetch });
  }

  return {
    handle,
    getStats() {
      return Object.freeze({ inFlightMisses: inFlightMisses.size, inFlightRevalidations: inFlightRevalidations.size });
    },
  };
}
