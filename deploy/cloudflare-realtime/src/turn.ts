import { REALTIME_PROTOCOL_VERSION, isRealtimeId } from "./protocol";
import {
  isAllowedRealtimeOrigin,
  resolveAllowedOrigins,
} from "./security";
import {
  REALTIME_TICKET_MAX_BYTES,
  verifyRealtimeTicket,
  type RealtimeTicketClaims,
} from "./ticket";

import type { RealtimeWorkerEnv } from "./runtime-types";

/**
 * Cloudflare Realtime TURN 자격증명 발급.
 *
 * 브라우저가 대칭 NAT·방화벽 뒤에서 직접 P2P 연결을 만들지 못하면 중계 경로가 필요하다.
 * TURN API 토큰은 Worker secret으로만 보관하고, 클라이언트에는 수 시간 단위 단기
 * 자격증명만 발급한다. secret이 없거나 kill switch가 켜지면 발급을 흉내 내지 않고
 * STUN 전용 정책을 정직하게 반환한다 — 클라이언트는 그 응답만으로 기존 동작을 유지한다.
 */
export const REALTIME_TURN_CREDENTIALS_PATH = "/v1/turn/credentials" as const;
export const REALTIME_TURN_TTL_SECONDS = 4 * 60 * 60;
export const REALTIME_TURN_STUN_URLS = [
  "stun:stun.cloudflare.com:3478",
] as const;

const REALTIME_TURN_MAX_BODY_BYTES = 1024;
const REALTIME_TURN_UPSTREAM_TIMEOUT_MS = 5_000;
const REALTIME_TURN_CACHE_MIN_REMAINING_MS = 10 * 60 * 1000;
const REALTIME_TURN_FAILURE_COOLDOWN_MS = 30 * 1000;
const REALTIME_TURN_CACHE_MAX_ENTRIES = 512;
const CLOUDFLARE_TURN_GENERATE_URL =
  "https://rtc.live.cloudflare.com/v1/turn/keys";

export interface RealtimeTurnIceServer {
  readonly urls: readonly string[];
  readonly username?: string;
  readonly credential?: string;
  readonly credentialType?: "password";
}

/** 웹 클라이언트의 StudioVoiceIcePolicyResponse 계약과 같은 모양으로 고정한다. */
export interface RealtimeTurnPolicy {
  readonly version: 1;
  readonly mode: "stun" | "turn";
  readonly iceServers: readonly RealtimeTurnIceServer[];
  readonly issuedAt: string;
  readonly expiresAt: string | null;
  readonly ttlSeconds: number;
}

export interface RealtimeTurnDependencies {
  readonly fetch?: typeof fetch;
  readonly nowMs?: () => number;
}

interface RealtimeTurnCacheEntry {
  readonly policy: RealtimeTurnPolicy;
  readonly expiresAtMs: number;
}

// isolate 메모리 캐시는 best-effort다. 같은 세션이 TTL 안에 반복 요청해도 Cloudflare
// 발급 API를 다시 부르지 않게 하는 것이 목적이며, isolate가 바뀌면 단순히 재발급한다.
const issuanceCache = new Map<string, RealtimeTurnCacheEntry>();
const failureCooldown = new Map<string, number>();

const ICE_URL_PATTERN =
  /^(stun|stuns|turn|turns):(?:\[[0-9a-f:.]+\]|(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?))(?::([1-9]\d{0,4}))?(?:\?transport=(udp|tcp))?$/iu;

function parseIceUrl(value: string): "stun" | "turn" | null {
  const match = ICE_URL_PATTERN.exec(value);
  if (match === null) return null;
  const scheme = match[1].toLowerCase();
  const port = match[2] ? Number(match[2]) : null;
  const transport = match[3]?.toLowerCase();
  if (port !== null && port > 65_535) return null;
  if ((scheme === "stuns" || scheme === "turns") && transport === "udp") {
    return null;
  }
  return scheme === "stun" || scheme === "stuns" ? "stun" : "turn";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function policyTimestamps(
  nowMs: number,
  ttlSeconds: number,
): { issuedAt: string; expiresAt: string | null } {
  const issuedAtSeconds = Math.floor(nowMs / 1_000);
  return {
    issuedAt: new Date(issuedAtSeconds * 1_000).toISOString(),
    expiresAt:
      ttlSeconds > 0
        ? new Date((issuedAtSeconds + ttlSeconds) * 1_000).toISOString()
        : null,
  };
}

export function buildStunOnlyTurnPolicy(nowMs: number): RealtimeTurnPolicy {
  return {
    version: 1,
    mode: "stun",
    iceServers: [{ urls: [...REALTIME_TURN_STUN_URLS] }],
    ...policyTimestamps(nowMs, 0),
    ttlSeconds: 0,
  };
}

/**
 * Cloudflare 발급 응답({iceServers: {urls, username, credential}})을 계약 모양으로
 * 변환한다. STUN과 TURN 주소는 별도 항목으로 분리하고, 형식이 조금이라도 어긋나면
 * null을 돌려 호출부가 STUN 전용으로 떨어지게 한다.
 */
export function parseCloudflareTurnPolicy(
  payload: unknown,
  nowMs: number,
): RealtimeTurnPolicy | null {
  if (!isRecord(payload) || !isRecord(payload.iceServers)) return null;
  const { urls, username, credential } = payload.iceServers;
  if (
    !Array.isArray(urls) ||
    urls.length === 0 ||
    urls.length > 8 ||
    typeof username !== "string" ||
    username.length === 0 ||
    username.length > 512 ||
    typeof credential !== "string" ||
    credential.length === 0 ||
    credential.length > 2_048
  ) {
    return null;
  }
  const stunUrls: string[] = [];
  const turnUrls: string[] = [];
  for (const url of urls) {
    if (typeof url !== "string" || url.length > 2_048) return null;
    const kind = parseIceUrl(url);
    if (kind === null) return null;
    (kind === "stun" ? stunUrls : turnUrls).push(url);
  }
  if (turnUrls.length === 0) return null;
  const iceServers: RealtimeTurnIceServer[] = [];
  if (stunUrls.length > 0) iceServers.push({ urls: stunUrls });
  iceServers.push({
    urls: turnUrls,
    username,
    credential,
    credentialType: "password",
  });
  return {
    version: 1,
    mode: "turn",
    iceServers,
    ...policyTimestamps(nowMs, REALTIME_TURN_TTL_SECONDS),
    ttlSeconds: REALTIME_TURN_TTL_SECONDS,
  };
}

function turnSecrets(
  env: RealtimeWorkerEnv,
): { keyId: string; apiToken: string } | null {
  if (env.REALTIME_TURN_ENABLED?.trim().toLowerCase() === "false") {
    return null;
  }
  const keyId = env.REALTIME_TURN_KEY_ID?.trim();
  const apiToken = env.REALTIME_TURN_API_TOKEN?.trim();
  if (!keyId || !apiToken) return null;
  return { keyId, apiToken };
}

async function fetchCloudflareTurnPolicy(
  secrets: { keyId: string; apiToken: string },
  fetchImpl: typeof fetch,
  nowMs: number,
): Promise<RealtimeTurnPolicy | null> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REALTIME_TURN_UPSTREAM_TIMEOUT_MS,
  );
  try {
    const response = await fetchImpl(
      `${CLOUDFLARE_TURN_GENERATE_URL}/${encodeURIComponent(secrets.keyId)}/credentials/generate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secrets.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: REALTIME_TURN_TTL_SECONDS }),
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    return parseCloudflareTurnPolicy(
      (await response.json()) as unknown,
      nowMs,
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function issueRealtimeTurnPolicy(
  env: RealtimeWorkerEnv,
  claims: RealtimeTicketClaims,
  dependencies: RealtimeTurnDependencies = {},
): Promise<RealtimeTurnPolicy> {
  const nowMs = (dependencies.nowMs ?? Date.now)();
  const secrets = turnSecrets(env);
  if (secrets === null) return buildStunOnlyTurnPolicy(nowMs);

  const cacheKey = `${claims.subject}:${claims.clientId}`;
  const cached = issuanceCache.get(cacheKey);
  if (
    cached !== undefined &&
    cached.expiresAtMs - nowMs > REALTIME_TURN_CACHE_MIN_REMAINING_MS
  ) {
    return cached.policy;
  }
  const lastFailureAt = failureCooldown.get(cacheKey);
  if (
    lastFailureAt !== undefined &&
    nowMs - lastFailureAt < REALTIME_TURN_FAILURE_COOLDOWN_MS
  ) {
    return buildStunOnlyTurnPolicy(nowMs);
  }

  const policy = await fetchCloudflareTurnPolicy(
    secrets,
    dependencies.fetch ?? fetch,
    nowMs,
  );
  if (policy === null) {
    failureCooldown.set(cacheKey, nowMs);
    return buildStunOnlyTurnPolicy(nowMs);
  }
  failureCooldown.delete(cacheKey);
  if (issuanceCache.size >= REALTIME_TURN_CACHE_MAX_ENTRIES) {
    const oldest = issuanceCache.keys().next().value;
    if (oldest !== undefined) issuanceCache.delete(oldest);
  }
  issuanceCache.set(cacheKey, {
    policy,
    expiresAtMs: nowMs + policy.ttlSeconds * 1_000,
  });
  return policy;
}

function errorResponse(
  status: number,
  code: string,
  origin?: string,
): Response {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin !== undefined) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return new Response(
    JSON.stringify({ version: REALTIME_PROTOCOL_VERSION, ok: false, code }),
    { status, headers },
  );
}

function preflightResponse(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "600",
      "Cache-Control": "no-store",
      Vary: "Origin",
    },
  });
}

function extractBearerTicket(header: string | null): string | null {
  if (header === null || !header.startsWith("Bearer ")) return null;
  const ticket = header.slice("Bearer ".length);
  if (
    ticket.length === 0 ||
    ticket.trim() !== ticket ||
    new TextEncoder().encode(ticket).byteLength > REALTIME_TICKET_MAX_BYTES
  ) {
    return null;
  }
  return ticket;
}

function parseTurnRequestScope(
  body: Uint8Array,
): { workId: string; roomId: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const keys = Object.keys(parsed);
  if (
    keys.length !== 2 ||
    !Object.hasOwn(parsed, "workId") ||
    !Object.hasOwn(parsed, "roomId") ||
    !isRealtimeId(parsed.workId) ||
    !isRealtimeId(parsed.roomId)
  ) {
    return null;
  }
  return { workId: parsed.workId, roomId: parsed.roomId };
}

/**
 * POST /v1/turn/credentials — WebSocket 입장과 같은 realtime ticket으로 인증한다.
 * ticket의 workId/roomId 바인딩은 요청 본문의 scope와 대조해 검증하고, presence
 * scope가 없는 ticket에는 발급하지 않는다.
 */
export async function handleRealtimeTurnCredentialsRequest(
  request: Request,
  env: RealtimeWorkerEnv,
  dependencies: RealtimeTurnDependencies = {},
): Promise<Response> {
  const url = new URL(request.url);
  const allowedOrigins = resolveAllowedOrigins(env.REALTIME_ALLOWED_ORIGINS);
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") {
    return origin !== null && isAllowedRealtimeOrigin(origin, allowedOrigins)
      ? preflightResponse(origin)
      : errorResponse(403, "origin-denied");
  }
  if (request.method !== "POST") {
    return errorResponse(405, "turn-method-not-allowed");
  }
  if (!isAllowedRealtimeOrigin(origin, allowedOrigins)) {
    return errorResponse(403, "origin-denied");
  }
  if (
    url.search !== "" ||
    request.headers.get("Content-Type") !== "application/json"
  ) {
    return errorResponse(400, "invalid-turn-request", origin);
  }
  const declaredLength = request.headers.get("Content-Length");
  if (
    declaredLength !== null &&
    (!/^(?:0|[1-9]\d*)$/u.test(declaredLength) ||
      Number(declaredLength) > REALTIME_TURN_MAX_BODY_BYTES)
  ) {
    return errorResponse(413, "turn-request-too-large", origin);
  }
  const ticket = extractBearerTicket(request.headers.get("Authorization"));
  if (ticket === null) {
    return errorResponse(401, "turn-authentication-required", origin);
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > REALTIME_TURN_MAX_BODY_BYTES) {
    return errorResponse(413, "turn-request-too-large", origin);
  }
  const scope = parseTurnRequestScope(body);
  if (scope === null) {
    return errorResponse(400, "invalid-turn-request", origin);
  }
  const nowMs = (dependencies.nowMs ?? Date.now)();
  const verified = await verifyRealtimeTicket(
    ticket,
    env.REALTIME_TICKET_SECRET,
    {
      issuer: env.REALTIME_TICKET_ISSUER,
      audience: env.REALTIME_TICKET_AUDIENCE,
      workId: scope.workId,
      roomId: scope.roomId,
      origin,
      nowMs,
    },
  );
  if (!verified.ok) {
    return errorResponse(401, "turn-authentication-rejected", origin);
  }
  if (!verified.claims.scopes.includes("presence")) {
    return errorResponse(403, "turn-scope-denied", origin);
  }
  const policy = await issueRealtimeTurnPolicy(env, verified.claims, {
    ...dependencies,
    nowMs: () => nowMs,
  });
  return new Response(JSON.stringify(policy), {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      Vary: "Origin",
    },
  });
}
