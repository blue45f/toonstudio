import {
  getStaticPolicyDocument,
  isPolicySlug,
} from "../../../packages/core/src/legal-policy";
import {
  API_LANE_HEADER,
  EDGE_CACHE_HEADER,
  classifyApiLane,
} from "../edge-api-lane-router.mjs";
import {
  createEdgeApiCacheCoalescer,
  type EdgeCacheInput,
  type EdgeExecutionContext,
} from "../edge-cache-coalescer.mjs";
import {
  IMAGE_FORMATS,
  negotiateImageFormat,
  serveNegotiatedStaticImage,
  type NegotiatedAssetCandidate,
} from "../edge-image-negotiator.mjs";

import { CORE_CLIENT_IP_HEADER, trustedConnectingIp } from "./core-client-ip";
import {
  createEdgeErrorDiagnostics,
  type EdgeErrorDiagnosticsEnv,
  type EdgeErrorReporter,
} from "./edge-error-diagnostics";
import {
  cloudflareLargeAssetDescriptor,
  cloudflareLargeAssetKey,
  cloudflareSameOriginOnlyAllows,
  isCloudflareBundleV2ReleaseIndexNamespacePath,
  isCloudflareOversizedAssetPath,
  matchesIfNoneMatch,
  matchesIfRange,
  r2AssetResponseHeaders,
  r2PreflightHeaders,
  r2RangeHeaders,
  staticMediaFallback,
  type AssetsBinding,
  type CloudflareLargeAssetDescriptor,
  type R2BucketBinding,
  type R2ObjectBinding,
  type R2ObjectBodyBinding,
} from "./large-static-assets";
import { createNeisCreatorResourceEdge } from "./neis-creator-resource-edge";
import { isOgPagePath, mapDynamicPath } from "./og-share-routes";

export type { AssetsBinding, R2BucketBinding, R2ObjectBinding, R2ObjectBodyBinding } from "./large-static-assets";

export interface CloudflareStaticEnv extends EdgeErrorDiagnosticsEnv {
  readonly ASSETS: AssetsBinding;
  readonly LARGE_ASSETS?: R2BucketBinding;
  readonly CORE_API_ORIGIN?: string;
  readonly CORE_ORIGIN_SECRET?: string;
  /** Comma-separated stateless read replicas for public/catalog/search traffic. */
  readonly PUBLIC_READ_API_ORIGINS?: string;
  readonly SOCIAL_API_ORIGIN?: string;
  readonly PLAYGROUND_API_ORIGIN?: string;
  readonly ADMIN_API_ORIGIN?: string;
  readonly REALTIME_API_ORIGIN?: string;
  readonly LARGE_ASSET_ORIGIN?: string;
  /** Server-only key for the NEIS creator-resource edge adapter. */
  readonly NEIS_API_KEY?: string;
}

interface GatewayRuntime {
  readonly fetch: typeof globalThis.fetch;
  readonly cache?: EdgeCacheInput;
  readonly now?: () => number;
}

type DynamicRoute =
  | "core"
  | "public-read"
  | "social"
  | "playground"
  | "admin"
  | "realtime"
  | "large-asset";

interface OriginResolution {
  readonly origins: readonly URL[];
  readonly invalidConfiguration: boolean;
}

const DEFAULT_RUNTIME: GatewayRuntime = {
  fetch: globalThis.fetch.bind(globalThis),
};

const RETRYABLE_READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const RETRYABLE_UPSTREAM_STATUSES = new Set([502, 503, 504]);
const MAX_PUBLIC_READ_ORIGINS = 8;
const CORE_ORIGIN_AUTH_HEADER = "x-toonstudio-origin-secret";
const MINIMUM_CORE_ORIGIN_SECRET_BYTES = 32;
const CRAWLER_USER_AGENT_PATTERN =
  /bot|crawl|spider|facebookexternalhit|kakaotalk|slack|twitter|discord|whatsapp|telegram|line|pinterest|embedly|preview|naver|daum|skype|vkshare/iu;

export const COMMON_SECURITY_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self' https://sharer.kakao.com https://*.tosspayments.com; script-src 'self' 'sha256-BWhbEGcNa8uwq1jepRHRSXlu8tgsEcnKrHTJQEooJUM=' 'sha256-GrX39s3Az4qEddGQLCYCCB+jrL9X7dvOAVgBXB8l6nM=' 'wasm-unsafe-eval' https://accounts.google.com https://t1.kakaocdn.net https://static.cloudflareinsights.com https://js.tosspayments.com; style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' blob: https://api.artic.edu https://openaccess-api.clevelandart.org https://commons.wikimedia.org https://ko.wikipedia.org https://api.open-meteo.com https://accounts.google.com https://www.googleapis.com https://graph.microsoft.com https://storage.googleapis.com https://api.unsplash.com https://images.unsplash.com https://api.openai.com https://api.anthropic.com https://openrouter.ai https://api.z.ai https://api.deepseek.com https://ybsgfhofuvkhywbpytnl.supabase.co https://cdn.jsdelivr.net https://kapi.kakao.com https://cloudflareinsights.com https://toonspectrum-realtime.toonspectrum-realtime.workers.dev wss://toonspectrum-realtime.toonspectrum-realtime.workers.dev https://realtime.toonstudio.cloud wss://realtime.toonstudio.cloud https://*.tosspayments.com; frame-src 'self' https://accounts.google.com https://www.youtube-nocookie.com https://player.vimeo.com https://*.tosspayments.com; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests; block-all-mixed-content",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), cross-origin-isolated=(self)",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
} as const);

function jsonError(status: number, code: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...COMMON_SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

function isEdgeLivenessRequest(request: Request, url: URL): boolean {
  const method = request.method.toUpperCase();
  return (method === "GET" || method === "HEAD")
    && (url.pathname === "/api/health" || url.pathname === "/api/health/live");
}

function edgeLivenessResponse(request: Request): Response {
  const body = request.method.toUpperCase() === "HEAD"
    ? null
    : JSON.stringify({ status: "ok" });
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      pragma: "no-cache",
      "x-toonstudio-health-source": "cloudflare-edge",
      ...COMMON_SECURITY_HEADERS,
    },
  });
}

function edgePolicyResponse(request: Request, requestUrl: URL): Response | null {
  const prefix = "/api/legal/policies/";
  if (!requestUrl.pathname.startsWith(prefix)) return null;
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return withSecurityHeaders(new Response(null, {
      status: 405,
      headers: { allow: "GET, HEAD" },
    }));
  }
  const slug = requestUrl.pathname.slice(prefix.length);
  if (!isPolicySlug(slug) || slug.includes("/")) {
    return jsonError(404, "policy_not_found");
  }
  const body = JSON.stringify(getStaticPolicyDocument(slug));
  return withSecurityHeaders(new Response(method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=86400",
      "x-toonstudio-policy-source": "first-party-release",
    },
  }));
}

function validatedCoreOriginSecret(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const normalized = raw.trim();
  if (
    raw !== normalized
    || new TextEncoder().encode(normalized).byteLength < MINIMUM_CORE_ORIGIN_SECRET_BYTES
  ) {
    return null;
  }
  return normalized;
}

function validatedOrigin(raw: string | undefined): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.pathname !== "/"
    || url.search !== ""
    || url.hash !== ""
  ) {
    return null;
  }
  return url;
}

function isCrawlerRequest(request: Request): boolean {
  const method = request.method.toUpperCase();
  return (method === "GET" || method === "HEAD")
    && CRAWLER_USER_AGENT_PATTERN.test(request.headers.get("user-agent") ?? "");
}

function isDynamicPath(pathname: string): boolean {
  return isCloudflareOversizedAssetPath(pathname)
    || pathname === "/api"
    || pathname.startsWith("/api/")
    || pathname === "/socket.io"
    || pathname.startsWith("/socket.io/")
    || isOgPagePath(pathname);
}

function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get("upgrade")?.toLowerCase() === "websocket";
}

function pathWithin(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const PUBLIC_READ_EXACT_PATHS = new Set([
  "/api/random",
  "/api/home",
  "/api/calendar",
  "/api/insights",
  "/api/ranking",
  "/api/explore",
  "/api/tags",
  "/api/authors",
  "/api/search",
  "/api/titles",
  "/api/kmas/book-webtoons",
  "/api/cover",
]);

function isPublicReadPath(pathname: string): boolean {
  return PUBLIC_READ_EXACT_PATHS.has(pathname)
    || pathWithin(pathname, "/api/public")
    || pathWithin(pathname, "/api/titles")
    || pathWithin(pathname, "/api/authors");
}

function classifyDynamicRoute(request: Request, requestUrl: URL): DynamicRoute {
  if (isCloudflareOversizedAssetPath(requestUrl.pathname)) {
    return "large-asset";
  }
  if (
    requestUrl.pathname === "/socket.io"
    || requestUrl.pathname.startsWith("/socket.io/")
    || pathWithin(requestUrl.pathname, "/api/realtime")
    || pathWithin(requestUrl.pathname, "/api/studio-live")
  ) {
    return "realtime";
  }
  if (pathWithin(requestUrl.pathname, "/api/admin")) return "admin";
  if (
    pathWithin(requestUrl.pathname, "/api/community")
    || pathWithin(requestUrl.pathname, "/api/reviews")
  ) {
    return "social";
  }
  if (
    pathWithin(requestUrl.pathname, "/api/fortune")
    || pathWithin(requestUrl.pathname, "/api/play")
  ) {
    return "playground";
  }
  if (
    RETRYABLE_READ_METHODS.has(request.method.toUpperCase())
    && isPublicReadPath(requestUrl.pathname)
  ) {
    return "public-read";
  }
  return "core";
}

function optionalOrigin(
  raw: string | undefined,
  fallback: URL | null,
): OriginResolution {
  if (raw === undefined || raw.trim() === "") {
    return {
      origins: fallback ? [fallback] : [],
      invalidConfiguration: false,
    };
  }
  const origin = validatedOrigin(raw.trim());
  return origin
    ? { origins: [origin], invalidConfiguration: false }
    : { origins: [], invalidConfiguration: true };
}

function publicReadOrigins(
  raw: string | undefined,
  fallback: URL | null,
): OriginResolution {
  if (raw === undefined || raw.trim() === "") {
    return {
      origins: fallback ? [fallback] : [],
      invalidConfiguration: false,
    };
  }
  const values = raw.split(",").map((value) => value.trim());
  if (
    values.length === 0
    || values.length > MAX_PUBLIC_READ_ORIGINS
    || values.some((value) => value === "")
  ) {
    return { origins: [], invalidConfiguration: true };
  }
  const origins: URL[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const origin = validatedOrigin(value);
    if (!origin || seen.has(origin.origin)) {
      return { origins: [], invalidConfiguration: true };
    }
    origins.push(origin);
    seen.add(origin.origin);
  }
  return { origins, invalidConfiguration: false };
}

function resolveOrigins(
  route: DynamicRoute,
  env: CloudflareStaticEnv,
): OriginResolution {
  const core = validatedOrigin(env.CORE_API_ORIGIN?.trim());
  switch (route) {
    case "public-read":
      return publicReadOrigins(env.PUBLIC_READ_API_ORIGINS, core);
    case "social":
      return optionalOrigin(env.SOCIAL_API_ORIGIN, core);
    case "playground":
      return optionalOrigin(env.PLAYGROUND_API_ORIGIN, core);
    case "admin":
      return optionalOrigin(env.ADMIN_API_ORIGIN, core);
    case "realtime":
      return optionalOrigin(env.REALTIME_API_ORIGIN, core);
    case "large-asset":
      // Static sidecars and R2 are the normal authorities. A final HTTP origin
      // is used only when explicitly configured; never wake the Core API for files.
      return optionalOrigin(env.LARGE_ASSET_ORIGIN, null);
    case "core":
      return {
        origins: core ? [core] : [],
        invalidConfiguration: env.CORE_API_ORIGIN !== undefined && core === null,
      };
  }
}

function cyrb53(value: string): number {
  let high = 0xdeadbeef;
  let low = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    high = Math.imul(high ^ code, 2_654_435_761);
    low = Math.imul(low ^ code, 1_597_334_677);
  }
  high = Math.imul(high ^ (high >>> 16), 2_246_822_507)
    ^ Math.imul(low ^ (low >>> 13), 3_266_489_909);
  low = Math.imul(low ^ (low >>> 16), 2_246_822_507)
    ^ Math.imul(high ^ (high >>> 13), 3_266_489_909);
  return 4_294_967_296 * (2_097_151 & low) + (high >>> 0);
}

function orderedReadOrigins(
  request: Request,
  origins: readonly URL[],
): readonly URL[] {
  if (origins.length <= 1) return origins;
  const url = new URL(request.url);
  const edgeRequestId = request.headers.get("cf-ray")?.trim();
  const routingKey = edgeRequestId
    ? `${edgeRequestId}:${url.pathname}:${url.search}`
    : `${request.method}:${url.pathname}:${url.search}`;
  return [...origins].sort((left, right) => {
    const rightScore = cyrb53(`${routingKey}\u0000${right.origin}`);
    const leftScore = cyrb53(`${routingKey}\u0000${left.origin}`);
    return rightScore - leftScore || left.origin.localeCompare(right.origin);
  });
}

function removePublicReadCredentials(headers: Headers): void {
  headers.delete("authorization");
  headers.delete("proxy-authorization");
  headers.delete("cookie");
  for (const name of [...headers.keys()]) {
    if (
      name.startsWith("x-user-")
      || name.startsWith("x-admin-")
      || name.startsWith("x-csrf-")
      || name.startsWith("x-session-")
    ) {
      headers.delete(name);
    }
  }
}

async function cancelRetryResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // A failed best-effort body cancellation must not suppress a safe replica retry.
  }
}

export function createUpstreamApiRequest(
  request: Request,
  origin: URL,
  route: DynamicRoute,
  attempt: number,
  coreOriginSecret?: string,
): Request {
  const incoming = new URL(request.url);
  const upstream = new URL(incoming.pathname + incoming.search, origin);
  const ogQuery = mapDynamicPath(incoming);
  if (ogQuery) {
    upstream.pathname = "/api/og";
    upstream.search = ogQuery.toString();
  }

  const headers = new Headers(request.headers);
  const connectingIp = trustedConnectingIp(request);
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.delete("forwarded");
  headers.delete("true-client-ip");
  headers.delete("x-forwarded-for");
  headers.delete("x-real-ip");
  headers.delete(CORE_ORIGIN_AUTH_HEADER);
  headers.delete(CORE_CLIENT_IP_HEADER);
  headers.delete(API_LANE_HEADER);
  headers.delete(EDGE_CACHE_HEADER);
  if (route === "public-read" || route === "large-asset" || ogQuery) {
    removePublicReadCredentials(headers);
  } else if (connectingIp) {
    headers.set("x-forwarded-for", connectingIp);
    // 출처 비밀과 함께 보낼 때만 싣는다. Core API 는 같은 요청이 비밀을 증명할 때만 이 헤더를 신뢰한다.
    if (coreOriginSecret) headers.set(CORE_CLIENT_IP_HEADER, connectingIp);
  }
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", "https");
  headers.set("x-toonstudio-edge", "cloudflare-static-gateway-v2");
  headers.set("x-toonstudio-edge-route", route);
  headers.set("x-toonstudio-edge-attempt", String(attempt));
  if (!ogQuery && route !== "large-asset") {
    headers.set(API_LANE_HEADER, classifyApiLane(request).lane);
  }
  if (coreOriginSecret) {
    headers.set(CORE_ORIGIN_AUTH_HEADER, coreOriginSecret);
  }

  const upstreamRequest = new Request(upstream, request);
  return new Request(upstreamRequest, {
    headers,
    redirect: "manual",
    signal: request.signal,
  });
}

export function createCoreApiRequest(request: Request, origin: URL): Request {
  return createUpstreamApiRequest(request, origin, "core", 0);
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(COMMON_SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function retryableRead(request: Request, route: DynamicRoute): boolean {
  return route === "public-read"
    && RETRYABLE_READ_METHODS.has(request.method.toUpperCase())
    && !isWebSocketUpgrade(request);
}

const NEGOTIABLE_IMAGE_PATH_PATTERN = /\.(?:png|jpe?g|webp|avif)$/iu;

function isNegotiableImageRequest(request: Request, url: URL): boolean {
  const method = request.method.toUpperCase();
  return (method === "GET" || method === "HEAD") && NEGOTIABLE_IMAGE_PATH_PATTERN.test(url.pathname);
}

async function readR2ObjectResponse(
  request: Request,
  key: string,
  descriptor: CloudflareLargeAssetDescriptor,
  env: CloudflareStaticEnv,
  reportError: EdgeErrorReporter,
): Promise<Response | null> {
  if (!env.LARGE_ASSETS) return null;
  const method = request.method.toUpperCase();
  let operation: "r2_get" | "r2_head" | "r2_response" = method === "HEAD" ? "r2_head" : "r2_get";
  try {
    let partial = false;
    let object: R2ObjectBinding | R2ObjectBodyBinding | null;
    if (method === "HEAD") {
      object = await env.LARGE_ASSETS.head(key);
    } else {
      const requestedRange = r2RangeHeaders(request);
      let acceptedRange = requestedRange;
      if (requestedRange && request.headers.has("if-range")) {
        operation = "r2_head";
        const metadata = await env.LARGE_ASSETS.head(key);
        if (!metadata) return null;
        acceptedRange = matchesIfRange(request, metadata.httpEtag) ? requestedRange : undefined;
      }
      operation = "r2_get";
      object = await env.LARGE_ASSETS.get(key, acceptedRange ? { range: acceptedRange } : undefined);
      partial = Boolean(acceptedRange && object?.range);
    }
    if (!object) return null;

    operation = "r2_response";
    const headers = r2AssetResponseHeaders(object, descriptor, partial);
    if (matchesIfNoneMatch(request, object.httpEtag)) {
      headers.delete("content-length");
      headers.delete("content-range");
      return withSecurityHeaders(new Response(null, { status: 304, headers }));
    }
    const body = method === "HEAD" ? null : (object as R2ObjectBodyBinding).body;
    return withSecurityHeaders(new Response(body, { status: partial ? 206 : 200, headers }));
  } catch (cause) {
    reportError(env, request, { route: "large-asset", operation, attempt: 1, retrying: false }, cause);
    return null;
  }
}

async function serveR2LargeAsset(
  request: Request,
  env: CloudflareStaticEnv,
  reportError: EdgeErrorReporter,
): Promise<Response | null> {
  const requestUrl = new URL(request.url);
  const descriptor = cloudflareLargeAssetDescriptor(requestUrl.pathname);
  if (!descriptor) return null;

  const method = request.method.toUpperCase();
  // 동일 출처 전용 경로는 메서드 분기·R2 접근보다 먼저, R2 바인딩 유무와 무관하게 판정한다.
  if (descriptor.sameOriginOnly && !cloudflareSameOriginOnlyAllows(request.headers)) {
    const rejection = jsonError(403, "BUNDLE_ASSET_SAME_ORIGIN_ONLY", { vary: "Sec-Fetch-Site" });
    return method === "HEAD" ? new Response(null, rejection) : rejection;
  }
  if (descriptor.getHeadOnly && method !== "GET" && method !== "HEAD") {
    return withSecurityHeaders(new Response(null, {
      status: 405, headers: { allow: "GET, HEAD", vary: "Sec-Fetch-Site" },
    }));
  }
  const key = cloudflareLargeAssetKey(requestUrl.pathname);
  if (!key || !env.LARGE_ASSETS) return null;

  if (method === "OPTIONS") {
    return withSecurityHeaders(new Response(null, { status: 204, headers: r2PreflightHeaders(descriptor) }));
  }
  if (method !== "GET" && method !== "HEAD") {
    return withSecurityHeaders(new Response(null, {
      status: 405,
      headers: descriptor.sameOriginOnly ? { allow: "GET, HEAD, OPTIONS", vary: "Sec-Fetch-Site" } : { allow: "GET, HEAD, OPTIONS" },
    }));
  }
  return readR2ObjectResponse(request, key, descriptor, env, reportError);
}

async function serveNegotiatedR2MediaImage(
  request: Request,
  descriptor: CloudflareLargeAssetDescriptor,
  env: CloudflareStaticEnv,
  reportError: EdgeErrorReporter,
): Promise<Response> {
  const preferredFormat = negotiateImageFormat(request.headers.get("accept"));
  if (env.LARGE_ASSETS) {
    let r2Hit = false;
    const r2Response = await serveNegotiatedStaticImage(
      request,
      async (candidate: NegotiatedAssetCandidate, variantRequest: Request) => {
        if (!candidate.isOriginal && preferredFormat === IMAGE_FORMATS.ORIGINAL && candidate.bucket === null) {
          return null;
        }
        const variantDescriptor = candidate.contentType
          ? { ...descriptor, contentType: candidate.contentType }
          : descriptor;
        const response = await readR2ObjectResponse(variantRequest, candidate.key, variantDescriptor, env, reportError);
        if (response) r2Hit = true;
        return response;
      },
    );
    if (r2Hit) return withSecurityHeaders(r2Response);
  }
  return withSecurityHeaders(await serveNegotiatedStaticImage(
    request,
    (_candidate, variantRequest) => env.ASSETS.fetch(variantRequest),
  ));
}

class UpstreamExhaustedError extends Error {
  readonly attempted: number;

  constructor(attempted: number) {
    super("UPSTREAM_EXHAUSTED");
    this.attempted = attempted;
  }
}

export function createCloudflareStaticGateway(
  runtime: GatewayRuntime = DEFAULT_RUNTIME,
) {
  const neisCreatorResources = createNeisCreatorResourceEdge(runtime);
  const reportError = createEdgeErrorDiagnostics();
  const apiCacheCoalescer = createEdgeApiCacheCoalescer({
    cache: runtime.cache,
    now: runtime.now,
  });
  return async function fetchRequest(
    request: Request,
    env: CloudflareStaticEnv,
    ctx?: EdgeExecutionContext,
  ): Promise<Response> {
    const requestUrl = new URL(request.url);
    if (isEdgeLivenessRequest(request, requestUrl)) {
      return edgeLivenessResponse(request);
    }
    if (isCloudflareBundleV2ReleaseIndexNamespacePath(requestUrl.pathname)
      && !cloudflareLargeAssetDescriptor(requestUrl.pathname)) {
      const rejection = jsonError(404, "BUNDLE_RELEASE_INDEX_NOT_FOUND");
      return request.method === "HEAD" ? new Response(null, rejection) : rejection;
    }
    if (!isDynamicPath(requestUrl.pathname)) {
      if (isNegotiableImageRequest(request, requestUrl)) {
        return withSecurityHeaders(await serveNegotiatedStaticImage(
          request,
          (_candidate, variantRequest) => env.ASSETS.fetch(variantRequest),
        ));
      }
      return env.ASSETS.fetch(request);
    }
    // Human navigation stays on Static Assets. Only recognized crawler traffic wakes the
    // Core API for per-route Open Graph metadata.
    if (isOgPagePath(requestUrl.pathname) && !isCrawlerRequest(request)) {
      return env.ASSETS.fetch(request);
    }

    const policyResponse = edgePolicyResponse(request, requestUrl);
    if (policyResponse) return policyResponse;

    const neisResponse = await neisCreatorResources.search(request, env);
    if (neisResponse) return withSecurityHeaders(neisResponse);

    const route = classifyDynamicRoute(request, requestUrl);
    if (route === "large-asset") {
      // 대형 에셋은 R2 원본 그대로만 서빙한다. 압축 sidecar를 Worker가
      // content-encoding과 함께 돌려주면 엣지가 한 겹 더 압축해 단일 라벨
      // 이중 압축이 되었고(2026-10-13 운영 실측: 전 경로 이중 brotli),
      // 어떤 클라이언트도 해제하지 못해 엔진·모델 로딩이 깨졌다.
      // R2 원본 + 엣지 네이티브 압축 조합은 클라이언트별로 정확히 동작한다.
      const largeAsset = cloudflareLargeAssetDescriptor(requestUrl.pathname);
      if (largeAsset?.staticFallback && isNegotiableImageRequest(request, requestUrl)) {
        return serveNegotiatedR2MediaImage(request, largeAsset, env, reportError);
      }
      const r2Response = await serveR2LargeAsset(request, env, reportError);
      if (r2Response) return r2Response;
      // R2 미디어 이관 경로는 R2에 아직 없으면 Static Assets로 돌린다(단계 이관·롤백 안전망).
      if (largeAsset?.staticFallback) return withSecurityHeaders(await staticMediaFallback(request, env.ASSETS));
      // 동일 출처 전용(bundle-v2) 바이트는 R2에만 있다. 폴백 원본의 응답 헤더(CORS 등)가 가드 계약을 깨지 못하게 닫는다.
      if (largeAsset?.sameOriginOnly) {
        const unavailable = jsonError(503, "LARGE_ASSET_UNAVAILABLE", { vary: "Sec-Fetch-Site" });
        return request.method === "HEAD" ? new Response(null, unavailable) : unavailable;
      }
    }

    const configuredCoreSecret = env.CORE_ORIGIN_SECRET;
    const coreOriginSecret = validatedCoreOriginSecret(configuredCoreSecret);
    if (configuredCoreSecret !== undefined && coreOriginSecret === null) {
      return jsonError(503, "CORE_API_UNAVAILABLE");
    }
    const coreOrigin = validatedOrigin(env.CORE_API_ORIGIN);
    const resolution = resolveOrigins(route, env);
    const selfReferential = resolution.origins.some(
      (origin) => origin.origin === requestUrl.origin,
    );
    const origins = resolution.origins.filter(
      (origin) => origin.origin !== requestUrl.origin,
    );
    if (
      resolution.invalidConfiguration
      || selfReferential
      || origins.length === 0
    ) {
      return jsonError(
        503,
        route === "large-asset"
          ? "LARGE_ASSET_UNAVAILABLE"
          : "CORE_API_UNAVAILABLE",
      );
    }

    async function proxyToOrderedOrigins(targetRequest: Request): Promise<Response> {
      const orderedOrigins = retryableRead(targetRequest, route)
        ? orderedReadOrigins(targetRequest, origins)
        : origins.slice(0, 1);
      let attempted = 0;
      for (const [index, origin] of orderedOrigins.entries()) {
        attempted += 1;
        let operation: "upstream_fetch" | "upstream_response" = "upstream_fetch";
        try {
          const response = await runtime.fetch(
            createUpstreamApiRequest(
              targetRequest,
              origin,
              route,
              index,
              coreOrigin?.origin === origin.origin
                ? coreOriginSecret ?? undefined
                : undefined,
            ),
          );
          operation = "upstream_response";
          // Reconstructing a WebSocket upgrade response drops the runtime-specific
          // WebSocket handle. Security headers apply to HTTP responses; the upgrade
          // handshake must pass through unchanged.
          if (isWebSocketUpgrade(targetRequest) || response.status === 101) return response;
          const shouldRetry = retryableRead(targetRequest, route)
            && RETRYABLE_UPSTREAM_STATUSES.has(response.status)
            && index + 1 < orderedOrigins.length;
          if (shouldRetry) {
            await cancelRetryResponse(response);
            continue;
          }
          const patchedResponse = await neisCreatorResources.patchProviderAvailability(
            targetRequest,
            response,
            env,
          );
          return withSecurityHeaders(patchedResponse);
        } catch (cause) {
          const retrying = retryableRead(targetRequest, route) && index + 1 < orderedOrigins.length;
          reportError(env, targetRequest, { route, operation, attempt: attempted, retrying }, cause);
          if (retrying) {
            continue;
          }
        }
      }
      throw new UpstreamExhaustedError(attempted);
    }

    const useEdgeApiShield = !isWebSocketUpgrade(request)
      && !isOgPagePath(requestUrl.pathname)
      && route !== "large-asset";
    try {
      return useEdgeApiShield
        ? await apiCacheCoalescer.handle(request, proxyToOrderedOrigins, ctx)
        : await proxyToOrderedOrigins(request);
    } catch (cause) {
      if (cause instanceof UpstreamExhaustedError) {
        return jsonError(
          502,
          cause.attempted > 0 ? "CORE_API_UPSTREAM_FAILED" : "CORE_API_UNAVAILABLE",
        );
      }
      return jsonError(502, "CORE_API_UPSTREAM_FAILED");
    }
  };
}

const fetchRequest = createCloudflareStaticGateway();

export default {
  fetch: fetchRequest,
};
