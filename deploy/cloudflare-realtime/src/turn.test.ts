import { describe, expect, it, vi } from "vitest";

import {
  REALTIME_TICKET_VERSION,
  signRealtimeTicket,
  type RealtimeTicketClaims,
} from "./ticket";
import {
  REALTIME_TURN_TTL_SECONDS,
  buildStunOnlyTurnPolicy,
  handleRealtimeTurnCredentialsRequest,
  issueRealtimeTurnPolicy,
  parseCloudflareTurnPolicy,
  type RealtimeTurnPolicy,
} from "./turn";

import type { RealtimeWorkerEnv } from "./runtime-types";

const TICKET_SECRET = "0123456789abcdef0123456789abcdef"; // gitleaks:allow -- deterministic unit-test fixture
const TURN_KEY_ID = "turn-key-id-fixture";
const TURN_API_TOKEN = "turn-api-token-fixture"; // gitleaks:allow -- deterministic unit-test fixture
const NOW = 1_700_000_000_000;
const ORIGIN = "https://toonstudio.cloud";

const CLOUDFLARE_ISSUE = {
  iceServers: {
    urls: [
      "stun:stun.cloudflare.com:3478",
      "turn:turn.cloudflare.com:3478?transport=udp",
      "turn:turn.cloudflare.com:3478?transport=tcp",
      "turns:turn.cloudflare.com:5349?transport=tcp",
    ],
    username: "cf-user-fixture",
    credential: "cf-credential-fixture",
  },
} as const;

function claims(
  overrides: Partial<RealtimeTicketClaims> = {},
): RealtimeTicketClaims {
  return {
    version: REALTIME_TICKET_VERSION,
    issuer: "toonspectrum-api",
    audience: "toonspectrum-realtime",
    subject: "artist-1",
    sessionVersion: 4,
    authorizationEpochMs: NOW - 5_000,
    workId: "work-1",
    roomId: "room-1",
    clientId: "client-1",
    origin: ORIGIN,
    scopes: ["presence", "comments", "screen-signaling"],
    nonce: "nonce_0123456789abcdef",
    issuedAtMs: NOW - 1_000,
    expiresAtMs: NOW + 60_000,
    sessionExpiresAtMs: NOW + 4 * 60 * 1000,
    ...overrides,
  };
}

function env(overrides: Record<string, unknown> = {}): RealtimeWorkerEnv {
  return {
    REALTIME_TICKET_SECRET: TICKET_SECRET,
    REALTIME_CONTROL_SECRET: "fedcba9876543210fedcba9876543210",
    REALTIME_TICKET_ISSUER: "toonspectrum-api",
    REALTIME_TICKET_AUDIENCE: "toonspectrum-realtime",
    REALTIME_TURN_KEY_ID: TURN_KEY_ID,
    REALTIME_TURN_API_TOKEN: TURN_API_TOKEN,
    ...overrides,
  } as unknown as RealtimeWorkerEnv;
}

function turnRequest(
  options: {
    ticket?: string;
    origin?: string;
    body?: unknown;
    method?: string;
    contentType?: string;
  } = {},
): Request {
  const method = options.method ?? "POST";
  return new Request("https://realtime.toonstudio.cloud/v1/turn/credentials", {
    method,
    headers: {
      "Content-Type": options.contentType ?? "application/json",
      Origin: options.origin ?? ORIGIN,
      ...(options.ticket === undefined
        ? {}
        : { Authorization: `Bearer ${options.ticket}` }),
    },
    ...(method === "POST"
      ? {
          body: JSON.stringify(
            options.body ?? { workId: "work-1", roomId: "room-1" },
          ),
        }
      : {}),
  });
}

function cloudflareFetch(payload: unknown = CLOUDFLARE_ISSUE) {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function readPolicy(response: Response): Promise<RealtimeTurnPolicy> {
  return (await response.json()) as RealtimeTurnPolicy;
}

describe("Cloudflare TURN 발급 응답 변환", () => {
  it("STUN과 TURN 주소를 분리하고 단기 자격증명을 계약 모양으로 고정한다", () => {
    const policy = parseCloudflareTurnPolicy(CLOUDFLARE_ISSUE, NOW);

    expect(policy).not.toBeNull();
    if (policy === null) return;
    expect(policy.mode).toBe("turn");
    expect(policy.iceServers).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
      {
        urls: [
          "turn:turn.cloudflare.com:3478?transport=udp",
          "turn:turn.cloudflare.com:3478?transport=tcp",
          "turns:turn.cloudflare.com:5349?transport=tcp",
        ],
        username: "cf-user-fixture",
        credential: "cf-credential-fixture",
        credentialType: "password",
      },
    ]);
    expect(policy.ttlSeconds).toBe(REALTIME_TURN_TTL_SECONDS);
    expect(policy.expiresAt).not.toBeNull();
    expect(
      Date.parse(policy.expiresAt ?? "") - Date.parse(policy.issuedAt),
    ).toBe(REALTIME_TURN_TTL_SECONDS * 1_000);
  });

  it("TURN 주소가 없거나 사용자 정보가 박힌 주소면 거부한다", () => {
    expect(
      parseCloudflareTurnPolicy(
        { iceServers: { urls: ["stun:stun.cloudflare.com:3478"], username: "u", credential: "c" } },
        NOW,
      ),
    ).toBeNull();
    expect(
      parseCloudflareTurnPolicy(
        { iceServers: { urls: ["turn:user@turn.cloudflare.com:3478"], username: "u", credential: "c" } },
        NOW,
      ),
    ).toBeNull();
    expect(parseCloudflareTurnPolicy({ iceServers: null }, NOW)).toBeNull();
    expect(parseCloudflareTurnPolicy("nope", NOW)).toBeNull();
  });

  it("STUN 전용 정책은 만료 없는 정직한 빈 TURN 상태를 인코딩한다", () => {
    const policy = buildStunOnlyTurnPolicy(NOW);
    expect(policy.mode).toBe("stun");
    expect(policy.expiresAt).toBeNull();
    expect(policy.ttlSeconds).toBe(0);
    expect(policy.iceServers).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
    ]);
  });
});

describe("POST /v1/turn/credentials", () => {
  it("유효한 ticket으로 Cloudflare 단기 자격증명을 발급한다", async () => {
    const fetchImpl = cloudflareFetch();
    const ticket = await signRealtimeTicket(claims(), TICKET_SECRET);
    const response = await handleRealtimeTurnCredentialsRequest(
      turnRequest({ ticket }),
      env(),
      { fetch: fetchImpl as unknown as typeof fetch, nowMs: () => NOW },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    const policy = await readPolicy(response);
    expect(policy.mode).toBe("turn");
    expect(policy.ttlSeconds).toBe(REALTIME_TURN_TTL_SECONDS);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_KEY_ID}/credentials/generate`,
    );
    expect(new Headers(init.headers).get("Authorization")).toBe(
      `Bearer ${TURN_API_TOKEN}`,
    );
    expect(JSON.parse(init.body as string)).toEqual({
      ttl: REALTIME_TURN_TTL_SECONDS,
    });
  });

  it("TURN secret이 없으면 발급을 흉내 내지 않고 STUN 전용을 반환한다", async () => {
    const fetchImpl = cloudflareFetch();
    const ticket = await signRealtimeTicket(claims(), TICKET_SECRET);
    const response = await handleRealtimeTurnCredentialsRequest(
      turnRequest({ ticket }),
      env({ REALTIME_TURN_KEY_ID: undefined, REALTIME_TURN_API_TOKEN: undefined }),
      { fetch: fetchImpl as unknown as typeof fetch, nowMs: () => NOW },
    );

    expect(response.status).toBe(200);
    const policy = await readPolicy(response);
    expect(policy.mode).toBe("stun");
    expect(policy.expiresAt).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("kill switch가 켜지면 secret이 있어도 STUN 전용으로 떨어진다", async () => {
    const fetchImpl = cloudflareFetch();
    const ticket = await signRealtimeTicket(claims(), TICKET_SECRET);
    const response = await handleRealtimeTurnCredentialsRequest(
      turnRequest({ ticket }),
      env({ REALTIME_TURN_ENABLED: "false" }),
      { fetch: fetchImpl as unknown as typeof fetch, nowMs: () => NOW },
    );

    expect(response.status).toBe(200);
    expect((await readPolicy(response)).mode).toBe("stun");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ticket이 없거나 위조되면 발급하지 않는다", async () => {
    const fetchImpl = cloudflareFetch();
    const missing = await handleRealtimeTurnCredentialsRequest(
      turnRequest(),
      env(),
      { fetch: fetchImpl as unknown as typeof fetch, nowMs: () => NOW },
    );
    expect(missing.status).toBe(401);
    expect((await missing.json() as { code: string }).code).toBe(
      "turn-authentication-required",
    );

    const ticket = await signRealtimeTicket(claims(), TICKET_SECRET);
    const tampered = `${ticket.slice(0, -1)}${ticket.endsWith("A") ? "B" : "A"}`;
    const forged = await handleRealtimeTurnCredentialsRequest(
      turnRequest({ ticket: tampered }),
      env(),
      { fetch: fetchImpl as unknown as typeof fetch, nowMs: () => NOW },
    );
    expect(forged.status).toBe(401);
    expect((await forged.json() as { code: string }).code).toBe(
      "turn-authentication-rejected",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ticket의 방 바인딩과 본문 scope가 다르면 거부한다", async () => {
    const ticket = await signRealtimeTicket(claims(), TICKET_SECRET);
    const response = await handleRealtimeTurnCredentialsRequest(
      turnRequest({ ticket, body: { workId: "work-1", roomId: "room-2" } }),
      env(),
      { fetch: cloudflareFetch() as unknown as typeof fetch, nowMs: () => NOW },
    );
    expect(response.status).toBe(401);
  });

  it("presence scope가 없는 ticket에는 발급하지 않는다", async () => {
    const ticket = await signRealtimeTicket(
      claims({ scopes: ["comments"] }),
      TICKET_SECRET,
    );
    const response = await handleRealtimeTurnCredentialsRequest(
      turnRequest({ ticket }),
      env(),
      { fetch: cloudflareFetch() as unknown as typeof fetch, nowMs: () => NOW },
    );
    expect(response.status).toBe(403);
    expect((await response.json() as { code: string }).code).toBe(
      "turn-scope-denied",
    );
  });

  it("허용되지 않은 Origin과 잘못된 본문을 거부한다", async () => {
    const ticket = await signRealtimeTicket(claims(), TICKET_SECRET);
    const badOrigin = await handleRealtimeTurnCredentialsRequest(
      turnRequest({ ticket, origin: "https://evil.example.com" }),
      env(),
      { nowMs: () => NOW },
    );
    expect(badOrigin.status).toBe(403);

    const badBody = await handleRealtimeTurnCredentialsRequest(
      turnRequest({ ticket, body: { workId: "work-1", roomId: "room-1", extra: 1 } }),
      env(),
      { nowMs: () => NOW },
    );
    expect(badBody.status).toBe(400);

    const badContentType = await handleRealtimeTurnCredentialsRequest(
      turnRequest({ ticket, contentType: "text/plain" }),
      env(),
      { nowMs: () => NOW },
    );
    expect(badContentType.status).toBe(400);
  });

  it("허용된 Origin의 preflight에만 CORS를 열어준다", async () => {
    const allowed = await handleRealtimeTurnCredentialsRequest(
      turnRequest({ method: "OPTIONS" }),
      env(),
      { nowMs: () => NOW },
    );
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("Access-Control-Allow-Headers")).toContain(
      "Authorization",
    );

    const denied = await handleRealtimeTurnCredentialsRequest(
      turnRequest({ method: "OPTIONS", origin: "https://evil.example.com" }),
      env(),
      { nowMs: () => NOW },
    );
    expect(denied.status).toBe(403);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("Cloudflare 발급이 실패하면 오류 대신 STUN 전용으로 무중단 폴백한다", async () => {
    const ticket = await signRealtimeTicket(
      claims({ clientId: "client-upstream-failure" }),
      TICKET_SECRET,
    );
    const failingFetch = vi.fn(async () =>
      new Response("upstream error", { status: 500 }),
    );
    const response = await handleRealtimeTurnCredentialsRequest(
      turnRequest({ ticket }),
      env(),
      { fetch: failingFetch as unknown as typeof fetch, nowMs: () => NOW },
    );
    expect(response.status).toBe(200);
    expect((await readPolicy(response)).mode).toBe("stun");

    const throwingFetch = vi.fn(async () => {
      throw new Error("network down");
    });
    const second = await handleRealtimeTurnCredentialsRequest(
      turnRequest({
        ticket: await signRealtimeTicket(
          claims({ clientId: "client-network-failure" }),
          TICKET_SECRET,
        ),
      }),
      env(),
      { fetch: throwingFetch as unknown as typeof fetch, nowMs: () => NOW },
    );
    expect(second.status).toBe(200);
    expect((await readPolicy(second)).mode).toBe("stun");
  });
});

describe("세션당 발급 캐시", () => {
  it("같은 세션의 반복 요청은 Cloudflare를 한 번만 부르고, 만료가 다가오면 재발급한다", async () => {
    const fetchImpl = cloudflareFetch();
    const cacheClaims = claims({ clientId: "client-cache" });
    const deps = {
      fetch: fetchImpl as unknown as typeof fetch,
      nowMs: () => NOW,
    };
    const first = await issueRealtimeTurnPolicy(env(), cacheClaims, deps);
    const second = await issueRealtimeTurnPolicy(env(), cacheClaims, deps);
    expect(first.mode).toBe("turn");
    expect(second).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const nearExpiry = await issueRealtimeTurnPolicy(env(), cacheClaims, {
      fetch: fetchImpl as unknown as typeof fetch,
      nowMs: () => NOW + REALTIME_TURN_TTL_SECONDS * 1_000 - 5 * 60 * 1000,
    });
    expect(nearExpiry.mode).toBe("turn");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
