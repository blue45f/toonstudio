import {
  STUDIO_REALTIME_PROVIDER_PROTOCOL_VERSION,
  StudioRealtimeTicketSchema,
  type StudioRealtimeTicketRequest,
} from "../studio-realtime-provider-protocol";
import { createStudioRealtimeHttpTicketIssuer } from "../studio-realtime-ticket-client";

import {
  StudioVoiceIcePolicyResponseSchema,
  type StudioVoiceIcePolicyResponse,
} from "@/shared/lib/studio-voice-ice-policy-contract";

/**
 * WebRTC ICE 구성의 단일 출처.
 *
 * 지금까지 허들·피어 패브릭·프레즌스 직접 레인은 각자 STUN 주소 하나를 하드코딩해서
 * 대칭 NAT·방화벽 뒤에서는 직접 연결이 실패하면 대안이 없었다. 이 모듈이 실시간
 * Worker의 TURN 발급 엔드포인트에서 단기 자격증명을 받아 캐시하고, 발급이 없거나
 * 실패하면 기존 STUN 전용 구성으로 무중단 폴백한다. 자격증명은 메모리에만 두고
 * 저장소·URL·로그에 남기지 않는다.
 */
export const STUDIO_ICE_STUN_ONLY_SERVERS: readonly RTCIceServer[] =
  Object.freeze([Object.freeze({ urls: ["stun:stun.l.google.com:19302"] })]);

export const STUDIO_ICE_TURN_CREDENTIALS_PATH = "/v1/turn/credentials";
export const STUDIO_ICE_DEFAULT_PROVIDER_ID = "cloudflare-realtime-v1";

const STUDIO_ICE_REQUEST_TIMEOUT_MS = 10_000;
const STUDIO_ICE_MAX_RESPONSE_BYTES = 16 * 1024;
const STUDIO_ICE_FAILURE_BACKOFF_MS = 30_000;
const STUDIO_ICE_STUN_RESULT_CACHE_MS = 5 * 60 * 1000;
const STUDIO_ICE_REFRESH_LEAD_RATIO = 0.2;
const STUDIO_ICE_CACHE_MAX_ENTRIES = 64;

export interface StudioIceCredentialScope {
  readonly workId: string;
  readonly roomId: string;
  readonly sessionId: string;
}

export interface StudioIceCredentialResult {
  readonly iceServers: readonly StudioTurnIceServer[];
  /** TURN 자격증명의 수명(초). 0이면 만료 없는 STUN 전용 결과다. */
  readonly ttlSeconds: number;
}

export type StudioIceCredentialSource = (
  scope: StudioIceCredentialScope,
  signal: AbortSignal,
) => Promise<StudioIceCredentialResult | null>;

export interface StudioIceConfigurationCacheDependencies {
  readonly now?: () => number;
  readonly failureBackoffMs?: number;
  readonly stunResultCacheMs?: number;
  readonly refreshLeadRatio?: number;
}

interface StudioIceCacheEntry {
  readonly servers: readonly StudioTurnIceServer[];
  readonly expiresAtMs: number;
  readonly refreshAfterMs: number;
}

function scopeKey(scope: StudioIceCredentialScope): string {
  return JSON.stringify([scope.workId, scope.roomId]);
}

/**
 * TURN REST 자격증명 URL은 `credentialType` 쿼리를 쓰지만 표준 RTCIceServer 타입엔
 * 필드가 없다. 실제 브라우저가 받는 형태를 그대로 다루도록 로컬 확장을 쓴다.
 */
export type StudioTurnIceServer = RTCIceServer & {
  readonly credentialType?: string;
};

function cloneIceServers(
  servers: readonly StudioTurnIceServer[],
): StudioTurnIceServer[] {
  return servers.map((server) => ({
    urls:
      typeof server.urls === "string" || server.urls === undefined
        ? server.urls
        : [...server.urls],
    ...(server.username === undefined ? {} : { username: server.username }),
    ...(server.credential === undefined
      ? {}
      : { credential: server.credential }),
    ...(server.credentialType === undefined
      ? {}
      : { credentialType: server.credentialType }),
  }));
}

export class StudioIceConfigurationCache {
  private readonly now: () => number;
  private readonly failureBackoffMs: number;
  private readonly stunResultCacheMs: number;
  private readonly refreshLeadRatio: number;
  private readonly entries = new Map<string, StudioIceCacheEntry>();
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly lastFailureAt = new Map<string, number>();
  private readonly abortControllers = new Set<AbortController>();
  private source: StudioIceCredentialSource | null = null;
  private disposed = false;

  constructor(dependencies: StudioIceConfigurationCacheDependencies = {}) {
    this.now = dependencies.now ?? Date.now;
    this.failureBackoffMs =
      dependencies.failureBackoffMs ?? STUDIO_ICE_FAILURE_BACKOFF_MS;
    this.stunResultCacheMs =
      dependencies.stunResultCacheMs ?? STUDIO_ICE_STUN_RESULT_CACHE_MS;
    this.refreshLeadRatio =
      dependencies.refreshLeadRatio ?? STUDIO_ICE_REFRESH_LEAD_RATIO;
  }

  registerSource(source: StudioIceCredentialSource | null): void {
    this.source = source;
  }

  /**
   * 동기 스냅샷. 신선한 캐시가 있으면 그 구성을, 없으면 STUN 전용을 돌려주고
   * 백그라운드 갱신을 건다. 연결 수립 경로가 이 함수 때문에 느려지거나 실패하지 않는다.
   */
  getIceServers(scope?: StudioIceCredentialScope): RTCIceServer[] {
    const nowMs = this.now();
    if (scope !== undefined) {
      const entry = this.entries.get(scopeKey(scope));
      if (entry !== undefined && entry.expiresAtMs > nowMs) {
        if (entry.refreshAfterMs <= nowMs) void this.ensureFresh(scope);
        return cloneIceServers(entry.servers);
      }
      void this.ensureFresh(scope);
    }
    const freshest = this.freshestEntry(nowMs);
    return freshest !== null
      ? cloneIceServers(freshest.servers)
      : cloneIceServers(STUDIO_ICE_STUN_ONLY_SERVERS);
  }

  /** 캐시를 미리 채운다. 결과와 무관하게 절대 reject하지 않는다. */
  ensureFresh(scope: StudioIceCredentialScope): Promise<void> {
    if (this.disposed || this.source === null) return Promise.resolve();
    const key = scopeKey(scope);
    const pending = this.inFlight.get(key);
    if (pending !== undefined) return pending;
    const entry = this.entries.get(key);
    const nowMs = this.now();
    if (entry !== undefined && entry.refreshAfterMs > nowMs) {
      return Promise.resolve();
    }
    const failedAt = this.lastFailureAt.get(key);
    if (
      failedAt !== undefined &&
      nowMs - failedAt < this.failureBackoffMs
    ) {
      return Promise.resolve();
    }
    const source = this.source;
    const controller = new AbortController();
    this.abortControllers.add(controller);
    const self: { current: Promise<void> | null } = { current: null };
    const refresh = (async () => {
      try {
        const result = await source(scope, controller.signal);
        if (this.disposed) return;
        if (result === null || result.iceServers.length === 0) {
          this.lastFailureAt.set(key, this.now());
          return;
        }
        this.lastFailureAt.delete(key);
        this.store(key, result);
      } catch {
        if (!this.disposed) this.lastFailureAt.set(key, this.now());
      } finally {
        this.abortControllers.delete(controller);
        if (this.inFlight.get(key) === self.current) this.inFlight.delete(key);
      }
    })();
    self.current = refresh;
    this.inFlight.set(key, refresh);
    return refresh;
  }

  dispose(): void {
    this.disposed = true;
    for (const controller of this.abortControllers) controller.abort();
    this.abortControllers.clear();
    this.inFlight.clear();
    this.entries.clear();
  }

  private store(key: string, result: StudioIceCredentialResult): void {
    const nowMs = this.now();
    const ttlMs =
      result.ttlSeconds > 0
        ? result.ttlSeconds * 1_000
        : this.stunResultCacheMs;
    if (this.entries.size >= STUDIO_ICE_CACHE_MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, {
      servers: cloneIceServers(result.iceServers),
      expiresAtMs: nowMs + ttlMs,
      refreshAfterMs:
        result.ttlSeconds > 0
          ? nowMs + ttlMs * (1 - this.refreshLeadRatio)
          : nowMs + ttlMs,
    });
  }

  private freshestEntry(nowMs: number): StudioIceCacheEntry | null {
    let freshest: StudioIceCacheEntry | null = null;
    for (const entry of this.entries.values()) {
      if (entry.expiresAtMs <= nowMs) continue;
      if (freshest === null || entry.expiresAtMs > freshest.expiresAtMs) {
        freshest = entry;
      }
    }
    return freshest;
  }
}

export const studioIceConfiguration = new StudioIceConfigurationCache();

export function registerStudioIceCredentialSource(
  source: StudioIceCredentialSource | null,
): void {
  studioIceConfiguration.registerSource(source);
}

export function getStudioIceServers(
  scope?: StudioIceCredentialScope,
): RTCIceServer[] {
  return studioIceConfiguration.getIceServers(scope);
}

export function primeStudioIceServers(
  scope: StudioIceCredentialScope,
): Promise<void> {
  return studioIceConfiguration.ensureFresh(scope);
}

function policyToCredentialResult(
  policy: StudioVoiceIcePolicyResponse,
): StudioIceCredentialResult | null {
  if (policy.mode === "direct") return null;
  return {
    iceServers: policy.iceServers.map((server) => ({
      urls: [...server.urls],
      ...(server.username === undefined
        ? {}
        : { username: server.username }),
      ...(server.credential === undefined
        ? {}
        : { credential: server.credential }),
      ...(server.credentialType === undefined
        ? {}
        : { credentialType: server.credentialType }),
    })),
    ttlSeconds: policy.mode === "turn" ? policy.ttlSeconds : 0,
  };
}

export interface StudioRealtimeTurnCredentialsRequest {
  readonly realtimeOrigin: string;
  readonly ticket: string;
  readonly scope: { readonly workId: string; readonly roomId: string };
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

/**
 * 실시간 Worker의 TURN 발급 엔드포인트를 호출한다. 어떤 실패도 throw하지 않고
 * null을 돌려주며, 호출부는 null을 STUN 전용 폴백으로 해석한다.
 */
export async function fetchStudioRealtimeTurnCredentials(
  request: StudioRealtimeTurnCredentialsRequest,
): Promise<StudioIceCredentialResult | null> {
  const origin = request.realtimeOrigin?.trim();
  if (!origin || !request.ticket) return null;
  const fetchImpl =
    request.fetch ?? globalThis.fetch?.bind(globalThis);
  if (typeof fetchImpl !== "function") return null;
  const timeoutMs = Math.min(
    30_000,
    Math.max(1_000, Math.trunc(request.timeoutMs ?? STUDIO_ICE_REQUEST_TIMEOUT_MS)),
  );
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal?.addEventListener("abort", abort, { once: true });
  const timeout = globalThis.setTimeout(abort, timeoutMs);
  try {
    const response = await fetchImpl(
      `${origin}${STUDIO_ICE_TURN_CREDENTIALS_PATH}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${request.ticket}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workId: request.scope.workId,
          roomId: request.scope.roomId,
        }),
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    const source = await response.text();
    if (
      source.length === 0 ||
      new TextEncoder().encode(source).byteLength >
        STUDIO_ICE_MAX_RESPONSE_BYTES
    ) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(source) as unknown;
    } catch {
      return null;
    }
    const policy = StudioVoiceIcePolicyResponseSchema.safeParse(parsed);
    if (!policy.success) return null;
    return policyToCredentialResult(policy.data);
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timeout);
    request.signal?.removeEventListener("abort", abort);
  }
}

export interface StudioIceTicketIssuerLike {
  issue(
    request: StudioRealtimeTicketRequest,
    signal: AbortSignal,
  ): Promise<unknown>;
}

export interface StudioRealtimeTurnCredentialSourceOptions {
  readonly realtimeOrigin: string;
  readonly providerId?: string;
  readonly ticketIssuer?: StudioIceTicketIssuerLike;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

/**
 * 기존 실시간 ticket 발급 경로(API 세션 쿠키)로 presence 전용 ticket을 받아
 * Worker 발급 엔드포인트에 제시하는 자격증명 소스. ticket의 opaque 토큰은 이
 * 호출 스택 안에서만 소비하고 어디에도 보관하지 않는다.
 */
export function createStudioRealtimeTurnCredentialSource(
  options: StudioRealtimeTurnCredentialSourceOptions,
): StudioIceCredentialSource {
  const ticketIssuer =
    options.ticketIssuer ?? createStudioRealtimeHttpTicketIssuer({});
  const providerId =
    options.providerId?.trim() || STUDIO_ICE_DEFAULT_PROVIDER_ID;
  return async (scope, signal) => {
    try {
      const rawTicket = await ticketIssuer.issue(
        {
          version: STUDIO_REALTIME_PROVIDER_PROTOCOL_VERSION,
          providerId,
          sessionId: scope.sessionId,
          scope: { workId: scope.workId, roomId: scope.roomId },
          workloads: ["presence"],
          capabilities: [
            "presence.snapshot-v1",
            "presence.members-v1",
            "presence.cursor-v1",
            "presence.resume-v1",
          ],
        },
        signal,
      );
      const ticket = StudioRealtimeTicketSchema.safeParse(rawTicket);
      if (!ticket.success) return null;
      if (
        ticket.data.providerId !== providerId ||
        ticket.data.scope.workId !== scope.workId ||
        ticket.data.scope.roomId !== scope.roomId
      ) {
        return null;
      }
      return await fetchStudioRealtimeTurnCredentials({
        realtimeOrigin: options.realtimeOrigin,
        ticket: ticket.data.ticket,
        scope,
        fetch: options.fetch,
        timeoutMs: options.timeoutMs,
        signal,
      });
    } catch {
      return null;
    }
  };
}
