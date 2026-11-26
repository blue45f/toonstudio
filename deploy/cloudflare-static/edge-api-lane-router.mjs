/**
 * 목적별 4-Lane 엣지 API 라우터 및 fail-closed 공개 캐시 자격 판별기.
 *
 * 서울 `onpod` 코어 API 부하를 엣지 캐시 실드와 워크로드 격리로 절감하되,
 * 인증·쿠키·세션·변경 요청 또는 민감 응답은 단 한 건도 공유 캐시에 들어가지 않도록
 * fail-closed 경계를 강제한다.
 */

export const API_LANES = Object.freeze({
  EDGE_PUBLIC_READ: "edge-public-read",
  EDGE_AI_ASSIST: "edge-ai-assist",
  REALTIME_DO: "realtime-do",
  CORE_STATEFUL_ONPOD: "core-stateful-onpod",
});

export const API_LANE_HEADER = "X-ToonStudio-Api-Lane";
export const EDGE_CACHE_HEADER = "X-ToonStudio-Edge-Cache";
export const CORE_BYPASS_CACHE_CONTROL = "private, no-store";

const SAFE_PUBLIC_READ_METHODS = Object.freeze(new Set(["GET", "HEAD"]));

const EXACT_SENSITIVE_REQUEST_HEADERS = Object.freeze(new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "x-session-token",
  "x-api-key",
  "x-toonstudio-origin-secret",
]));

const SENSITIVE_REQUEST_HEADER_PREFIXES = Object.freeze([
  "x-session-",
  "x-auth-",
  "x-user-",
  "x-admin-",
  "x-csrf-",
]);

const REALTIME_PREFIXES = Object.freeze([
  "/api/realtime",
  "/api/studio-live",
  "/ws",
  "/socket.io",
]);

const SENSITIVE_CORE_PREFIXES = Object.freeze([
  "/api/auth",
  "/api/admin",
  "/api/billing",
  "/api/payments",
  "/api/checkout",
  "/api/subscriptions",
  "/api/me",
  "/api/account",
  "/api/users",
  "/api/projects",
  "/api/health/ready",
  "/api/config",
  "/api/catalog/ingest",
  "/api/catalog/admin",
  "/api/catalog/sync",
  "/api/studio/ai/billing",
  "/api/studio/ai/credits",
  "/api/studio-ai/billing",
  "/api/studio-ai/credits",
]);

const AI_ASSIST_PREFIXES = Object.freeze([
  "/api/studio-ai",
  "/api/studio/ai",
]);

function routePolicy(routeKey, matchType, path, ttlSeconds, swrSeconds) {
  return Object.freeze({ routeKey, matchType, path, ttlSeconds, swrSeconds });
}

/**
 * 익명 GET/HEAD 요청에 한해 엣지 캐시 및 Singleflight를 허용하는 공개 읽기 정책 표.
 * 각 항목은 명시적인 TTL과 stale-while-revalidate 창(초)을 가진다.
 */
export const PUBLIC_READ_ROUTE_POLICIES = Object.freeze([
  routePolicy("health-live", "exact", "/api/health/live", 10, 30),
  routePolicy("health-live", "exact", "/api/health", 10, 30),
  routePolicy("studio-ai-modes", "exact", "/api/studio/ai/modes", 300, 1800),
  routePolicy("studio-ai-openai-status", "exact", "/api/studio-ai/openai-assist/status", 30, 120),
  routePolicy("studio-ai-free-quota-status", "exact", "/api/studio/ai/free-quota-status", 30, 120),
  routePolicy("catalog", "prefix", "/api/catalog", 120, 600),
  routePolicy("rankings", "prefix", "/api/rankings", 60, 300),
  routePolicy("rankings", "prefix", "/api/ranking", 60, 300),
  routePolicy("public", "prefix", "/api/public", 120, 600),
  routePolicy("titles", "prefix", "/api/titles", 120, 600),
  routePolicy("authors", "prefix", "/api/authors", 120, 600),
  routePolicy("discovery", "exact", "/api/home", 60, 300),
  routePolicy("discovery", "exact", "/api/explore", 60, 300),
  routePolicy("discovery", "exact", "/api/tags", 120, 600),
  routePolicy("discovery", "exact", "/api/calendar", 60, 300),
  routePolicy("discovery", "exact", "/api/insights", 60, 300),
  routePolicy("discovery", "exact", "/api/kmas/book-webtoons", 120, 600),
  routePolicy("discovery", "exact", "/api/cover", 120, 600),
  routePolicy("search", "exact", "/api/search", 30, 120),
]);

/** 선형 스캔으로 끝 슬래시를 제거해 ReDoS 가능성을 원천 차단한다. */
function normalizePathname(pathname) {
  let end = pathname.length;
  while (end > 1 && pathname.charCodeAt(end - 1) === 47) end -= 1;
  return end === pathname.length ? pathname : pathname.slice(0, end);
}

function pathWithin(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function matchPublicReadPolicy(pathname) {
  for (const policy of PUBLIC_READ_ROUTE_POLICIES) {
    if (policy.matchType === "exact" && pathname === policy.path) return policy;
    if (policy.matchType === "prefix" && pathWithin(pathname, policy.path)) return policy;
  }
  return null;
}

function isWebSocketUpgrade(request) {
  return request?.headers?.get("upgrade")?.toLowerCase() === "websocket";
}

/** 요청에 인증·쿠키·세션 헤더가 하나라도 있으면 true를 반환한다(fail-closed). */
export function hasAuthOrSessionHeaders(request) {
  if (!request?.headers || typeof request.headers.keys !== "function") return true;
  for (const rawName of request.headers.keys()) {
    const name = rawName.toLowerCase();
    if (EXACT_SENSITIVE_REQUEST_HEADERS.has(name)) return true;
    for (const prefix of SENSITIVE_REQUEST_HEADER_PREFIXES) {
      if (name.startsWith(prefix)) return true;
    }
  }
  return false;
}

export function buildPublicCacheControl(ttlSeconds, swrSeconds) {
  return `public, max-age=${ttlSeconds}, stale-while-revalidate=${swrSeconds}`;
}

/** 동일 의미의 쿼리 파라미터 순서 차이를 정규화한 캐시 키 URL을 만든다. */
export function buildCanonicalEdgeCacheKey(request) {
  const url = new URL(request.url);
  url.pathname = normalizePathname(url.pathname);
  url.hash = "";
  const entries = [...url.searchParams.entries()].sort(
    ([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
  );
  url.search = "";
  for (const [key, value] of entries) {
    url.searchParams.append(key, value);
  }
  return url.toString();
}

function makeDescriptor(lane, cacheable, routeKey, ttlSeconds, swrSeconds, cacheControl, reason) {
  return Object.freeze({
    lane,
    cacheable,
    routeKey,
    ttlSeconds,
    swrSeconds,
    cacheControl,
    reason,
  });
}

function coreBypassDescriptor(routeKey, reason) {
  return makeDescriptor(
    API_LANES.CORE_STATEFUL_ONPOD,
    false,
    routeKey,
    0,
    0,
    CORE_BYPASS_CACHE_CONTROL,
    reason,
  );
}

/**
 * `/api/*` 및 `/ws/*` 요청을 목적별 4-Lane 중 하나로 순수 분류한다.
 * 비정상 입력이나 알 수 없는 경로는 항상 `core-stateful-onpod`(캐시 우회)로 닫는다.
 */
export function classifyApiLane(request) {
  if (!request || typeof request.url !== "string" || !request.headers) {
    return coreBypassDescriptor("core-stateful", "invalid-request");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(request.url);
  } catch {
    return coreBypassDescriptor("core-stateful", "invalid-url");
  }

  const method = String(request.method ?? "").toUpperCase();
  const pathname = normalizePathname(parsedUrl.pathname);

  if (REALTIME_PREFIXES.some((prefix) => pathWithin(pathname, prefix))) {
    return makeDescriptor(
      API_LANES.REALTIME_DO,
      false,
      "realtime-do",
      0,
      0,
      CORE_BYPASS_CACHE_CONTROL,
      "realtime-signaling",
    );
  }

  if (SENSITIVE_CORE_PREFIXES.some((prefix) => pathWithin(pathname, prefix))) {
    return coreBypassDescriptor("core-stateful", "sensitive-core-route");
  }

  const publicPolicy = matchPublicReadPolicy(pathname);
  if (publicPolicy) {
    const safeMethod = SAFE_PUBLIC_READ_METHODS.has(method);
    const hasCredentials = hasAuthOrSessionHeaders(request);
    const wsUpgrade = isWebSocketUpgrade(request);
    const hasRange = request.headers.has("range");

    if (safeMethod && !hasCredentials && !wsUpgrade && !hasRange) {
      return makeDescriptor(
        API_LANES.EDGE_PUBLIC_READ,
        true,
        publicPolicy.routeKey,
        publicPolicy.ttlSeconds,
        publicPolicy.swrSeconds,
        buildPublicCacheControl(publicPolicy.ttlSeconds, publicPolicy.swrSeconds),
        "public-read-allowlist",
      );
    }

    const bypassReason = !safeMethod
      ? "mutating-method"
      : hasCredentials
        ? "auth-header-present"
        : wsUpgrade
          ? "websocket-upgrade"
          : "range-request";
    return coreBypassDescriptor(publicPolicy.routeKey, bypassReason);
  }

  if (AI_ASSIST_PREFIXES.some((prefix) => pathWithin(pathname, prefix))) {
    return makeDescriptor(
      API_LANES.EDGE_AI_ASSIST,
      false,
      "edge-ai-assist",
      0,
      0,
      CORE_BYPASS_CACHE_CONTROL,
      "ai-inference-isolation",
    );
  }

  const defaultReason = hasAuthOrSessionHeaders(request)
    ? "auth-header-present"
    : SAFE_PUBLIC_READ_METHODS.has(method)
      ? "default-core-route"
      : "mutating-method";
  return coreBypassDescriptor("core-stateful", defaultReason);
}

export function isEdgeCacheablePublicReadRequest(request) {
  return classifyApiLane(request).cacheable;
}

function parseCacheControlTokens(rawHeader) {
  const directives = new Map();
  if (!rawHeader) return directives;
  for (const part of rawHeader.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      directives.set(trimmed.toLowerCase(), "");
    } else {
      const key = trimmed.slice(0, eqIndex).trim().toLowerCase();
      const rawValue = trimmed.slice(eqIndex + 1).trim();
      const value = rawValue.replace(/^"|"$/gu, "").toLowerCase();
      directives.set(key, value);
    }
  }
  return directives;
}

export function hasSetCookieHeader(headers) {
  if (!headers) return true;
  if (typeof headers.getSetCookie === "function" && headers.getSetCookie().length > 0) {
    return true;
  }
  return headers.has("set-cookie");
}

export function hasPrivateOrAuthResponseHeaders(response) {
  if (!response?.headers) return true;
  if (hasSetCookieHeader(response.headers)) return true;
  if (response.headers.has("www-authenticate")) return true;
  const cc = parseCacheControlTokens(response.headers.get("cache-control"));
  if (cc.has("private")) return true;
  const varyRaw = response.headers.get("vary");
  if (varyRaw) {
    for (const token of varyRaw.split(",")) {
      const normalized = token.trim().toLowerCase();
      if (normalized === "*" || normalized === "cookie" || normalized === "authorization") {
        return true;
      }
    }
  }
  return false;
}

/**
 * 요청과 응답 쌍이 공유 엣지 캐시에 들어가도 안전한지 fail-closed로 판정한다.
 * 인증/쿠키/세션 헤더, 비-GET/HEAD 메서드, Set-Cookie, private/no-store/no-cache,
 * max-age=0/s-maxage=0, Vary: Cookie/Authorization/*, 비-200 상태는 모두 거부한다.
 */
export function isEdgeCacheablePublicRead(request, response) {
  if (!isEdgeCacheablePublicReadRequest(request)) return false;
  if (!response || typeof response.status !== "number" || !response.headers) return false;
  if (response.status !== 200) return false;
  if (hasPrivateOrAuthResponseHeaders(response)) return false;

  const pragma = response.headers.get("pragma")?.toLowerCase() ?? "";
  if (pragma.includes("no-cache")) return false;

  const cc = parseCacheControlTokens(response.headers.get("cache-control"));
  if (cc.has("no-store") || cc.has("no-cache")) return false;
  if (cc.get("max-age") === "0" || cc.get("s-maxage") === "0") return false;

  return true;
}
