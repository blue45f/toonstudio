import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_ICE_STUN_ONLY_SERVERS,
  StudioIceConfigurationCache,
  createStudioRealtimeTurnCredentialSource,
  fetchStudioRealtimeTurnCredentials,
  type StudioIceCredentialResult,
  type StudioIceCredentialScope,
} from "./studio-ice-configuration";

const SCOPE: StudioIceCredentialScope = {
  workId: "work-1",
  roomId: "room-1",
  sessionId: "session-1",
};

const TURN_RESULT: StudioIceCredentialResult = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478"] },
    {
      urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
      username: "cf-user",
      credential: "cf-credential",
      credentialType: "password",
    },
  ],
  ttlSeconds: 14_400,
};

const TURN_POLICY = {
  version: 1,
  mode: "turn",
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478"] },
    {
      urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
      username: "cf-user",
      credential: "cf-credential",
      credentialType: "password",
    },
  ],
  issuedAt: "2023-11-14T22:13:20.000Z",
  expiresAt: "2023-11-15T02:13:20.000Z",
  ttlSeconds: 14_400,
} as const;

const STUN_POLICY = {
  version: 1,
  mode: "stun",
  iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }],
  issuedAt: "2023-11-14T22:13:20.000Z",
  expiresAt: null,
  ttlSeconds: 0,
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("StudioIceConfigurationCache", () => {
  it("소스가 없으면 기존 STUN 전용 구성을 그대로 돌려준다", () => {
    const cache = new StudioIceConfigurationCache();
    expect(cache.getIceServers()).toEqual(STUDIO_ICE_STUN_ONLY_SERVERS);
    expect(cache.getIceServers(SCOPE)).toEqual([
      { urls: ["stun:stun.l.google.com:19302"] },
    ]);
  });

  it("발급 성공 후에는 TURN을 포함한 구성을 돌려주고 캐시는 복사본으로 보호한다", async () => {
    const cache = new StudioIceConfigurationCache({ now: () => 1_000 });
    cache.registerSource(async () => TURN_RESULT);
    await cache.ensureFresh(SCOPE);

    const servers = cache.getIceServers(SCOPE);
    expect(servers).toEqual(TURN_RESULT.iceServers);
    servers.push({ urls: ["turn:evil.example.com:3478"] });
    expect(cache.getIceServers(SCOPE)).toEqual(TURN_RESULT.iceServers);
  });

  it("캐시가 없으면 STUN을 즉시 돌려주고 백그라운드로 발급을 건다", async () => {
    const cache = new StudioIceConfigurationCache({ now: () => 1_000 });
    const source = vi.fn(async () => TURN_RESULT);
    cache.registerSource(source);

    expect(cache.getIceServers(SCOPE)).toEqual(STUDIO_ICE_STUN_ONLY_SERVERS);
    expect(source).toHaveBeenCalledTimes(1);
    await cache.ensureFresh(SCOPE);
    expect(cache.getIceServers(SCOPE)).toEqual(TURN_RESULT.iceServers);
  });

  it("TTL이 지나면 만료된 자격증명을 내주지 않고 재발급한다", async () => {
    let now = 1_000;
    const cache = new StudioIceConfigurationCache({ now: () => now });
    const source = vi.fn(async () => TURN_RESULT);
    cache.registerSource(source);
    await cache.ensureFresh(SCOPE);
    expect(source).toHaveBeenCalledTimes(1);

    now += 14_400_000 + 1;
    expect(cache.getIceServers(SCOPE)).toEqual(STUDIO_ICE_STUN_ONLY_SERVERS);
    await cache.ensureFresh(SCOPE);
    expect(source).toHaveBeenCalledTimes(2);
    expect(cache.getIceServers(SCOPE)).toEqual(TURN_RESULT.iceServers);
  });

  it("만료 전 갱신 구간에 들어서면 캐시를 유지한 채 백그라운드로 갱신한다", async () => {
    let now = 1_000;
    const cache = new StudioIceConfigurationCache({ now: () => now });
    const source = vi.fn(async () => TURN_RESULT);
    cache.registerSource(source);
    await cache.ensureFresh(SCOPE);

    now += 14_400_000 * 0.85;
    expect(cache.getIceServers(SCOPE)).toEqual(TURN_RESULT.iceServers);
    await cache.ensureFresh(SCOPE);
    expect(source).toHaveBeenCalledTimes(2);
  });

  it("발급 실패 시 STUN 폴백을 유지하고 백오프 동안 재시도하지 않는다", async () => {
    let now = 1_000;
    const cache = new StudioIceConfigurationCache({ now: () => now });
    const source = vi.fn(async () => null);
    cache.registerSource(source);

    await cache.ensureFresh(SCOPE);
    await cache.ensureFresh(SCOPE);
    expect(source).toHaveBeenCalledTimes(1);
    expect(cache.getIceServers(SCOPE)).toEqual(STUDIO_ICE_STUN_ONLY_SERVERS);

    now += 30_001;
    await cache.ensureFresh(SCOPE);
    expect(source).toHaveBeenCalledTimes(2);
  });

  it("소스가 throw해도 reject하지 않고 STUN 폴백을 유지한다", async () => {
    const cache = new StudioIceConfigurationCache({ now: () => 1_000 });
    cache.registerSource(async () => {
      throw new Error("발급 경로 단절");
    });
    await expect(cache.ensureFresh(SCOPE)).resolves.toBeUndefined();
    expect(cache.getIceServers(SCOPE)).toEqual(STUDIO_ICE_STUN_ONLY_SERVERS);
  });

  it("동시 갱신 요청은 발급 한 번으로 합쳐진다", async () => {
    const cache = new StudioIceConfigurationCache({ now: () => 1_000 });
    let release: ((result: StudioIceCredentialResult) => void) | null = null;
    const source = vi.fn(
      () =>
        new Promise<StudioIceCredentialResult>((resolve) => {
          release = resolve;
        }),
    );
    cache.registerSource(source);

    const first = cache.ensureFresh(SCOPE);
    const second = cache.ensureFresh(SCOPE);
    expect(source).toHaveBeenCalledTimes(1);
    release?.(TURN_RESULT);
    await Promise.all([first, second]);
    expect(cache.getIceServers(SCOPE)).toEqual(TURN_RESULT.iceServers);
  });

  it("STUN 전용 결과는 짧게 캐시되어 발급 엔드포인트를 반복 호출하지 않는다", async () => {
    let now = 1_000;
    const cache = new StudioIceConfigurationCache({ now: () => now });
    const source = vi.fn(async () => ({
      iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }],
      ttlSeconds: 0,
    }));
    cache.registerSource(source);
    await cache.ensureFresh(SCOPE);
    expect(cache.getIceServers(SCOPE)).toEqual([
      { urls: ["stun:stun.cloudflare.com:3478"] },
    ]);
    await cache.ensureFresh(SCOPE);
    expect(source).toHaveBeenCalledTimes(1);

    now += 5 * 60_000 + 1;
    await cache.ensureFresh(SCOPE);
    expect(source).toHaveBeenCalledTimes(2);
  });
});

describe("fetchStudioRealtimeTurnCredentials", () => {
  it("Worker 정책을 검증해 TURN 자격증명으로 변환하고 ticket을 Bearer로 제시한다", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(TURN_POLICY));
    const result = await fetchStudioRealtimeTurnCredentials({
      realtimeOrigin: "https://realtime.toonstudio.cloud",
      ticket: "ticket-fixture",
      scope: { workId: "work-1", roomId: "room-1" },
      fetch: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual(TURN_RESULT);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://realtime.toonstudio.cloud/v1/turn/credentials",
    );
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer ticket-fixture",
    );
    expect(JSON.parse(init.body as string)).toEqual({
      workId: "work-1",
      roomId: "room-1",
    });
  });

  it("STUN 전용 정책은 ttl 0 결과로 변환한다", async () => {
    const result = await fetchStudioRealtimeTurnCredentials({
      realtimeOrigin: "https://realtime.toonstudio.cloud",
      ticket: "ticket-fixture",
      scope: { workId: "work-1", roomId: "room-1" },
      fetch: (async () => jsonResponse(STUN_POLICY)) as typeof fetch,
    });
    expect(result).toEqual({
      iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }],
      ttlSeconds: 0,
    });
  });

  it("HTTP 오류·깨진 응답·계약 위반 응답은 전부 null로 떨어진다", async () => {
    const scope = { workId: "work-1", roomId: "room-1" };
    const base = {
      realtimeOrigin: "https://realtime.toonstudio.cloud",
      ticket: "ticket-fixture",
      scope,
    };
    await expect(
      fetchStudioRealtimeTurnCredentials({
        ...base,
        fetch: (async () => jsonResponse({}, 401)) as typeof fetch,
      }),
    ).resolves.toBeNull();
    await expect(
      fetchStudioRealtimeTurnCredentials({
        ...base,
        fetch: (async () =>
          new Response("not-json", { status: 200 })) as typeof fetch,
      }),
    ).resolves.toBeNull();
    await expect(
      fetchStudioRealtimeTurnCredentials({
        ...base,
        fetch: (async () =>
          jsonResponse({
            ...TURN_POLICY,
            iceServers: [{ urls: ["turn:turn.cloudflare.com:3478"] }],
          })) as typeof fetch,
      }),
    ).resolves.toBeNull();
    await expect(
      fetchStudioRealtimeTurnCredentials({
        ...base,
        fetch: (async () => {
          throw new Error("network down");
        }) as typeof fetch,
      }),
    ).resolves.toBeNull();
  });
});

describe("createStudioRealtimeTurnCredentialSource", () => {
  const ticketPayload = {
    version: 1,
    providerId: "cloudflare-realtime-v1",
    scope: { workId: "work-1", roomId: "room-1" },
    workloads: ["presence"],
    capabilities: [
      "presence.snapshot-v1",
      "presence.members-v1",
      "presence.cursor-v1",
      "presence.resume-v1",
    ],
    issuedAt: "2023-11-14T22:13:20.000Z",
    expiresAt: "2023-11-14T22:15:20.000Z",
    ticket: "t".repeat(64),
  } as const;

  it("presence ticket을 발급받아 Worker 엔드포인트까지 연결한다", async () => {
    const issue = vi.fn(async () => ticketPayload);
    const fetchImpl = vi.fn(async () => jsonResponse(TURN_POLICY));
    const source = createStudioRealtimeTurnCredentialSource({
      realtimeOrigin: "https://realtime.toonstudio.cloud",
      ticketIssuer: { issue },
      fetch: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      source(SCOPE, new AbortController().signal),
    ).resolves.toEqual(TURN_RESULT);
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "cloudflare-realtime-v1",
        sessionId: "session-1",
        scope: { workId: "work-1", roomId: "room-1" },
        workloads: ["presence"],
      }),
      expect.anything(),
    );
    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(new Headers(init.headers).get("Authorization")).toBe(
      `Bearer ${"t".repeat(64)}`,
    );
  });

  it("ticket 발급이 거부되거나 응답이 계약과 다르면 null을 돌려준다", async () => {
    const denied = createStudioRealtimeTurnCredentialSource({
      realtimeOrigin: "https://realtime.toonstudio.cloud",
      ticketIssuer: {
        issue: async () => {
          throw new Error("denied");
        },
      },
    });
    await expect(
      denied(SCOPE, new AbortController().signal),
    ).resolves.toBeNull();

    const mismatched = createStudioRealtimeTurnCredentialSource({
      realtimeOrigin: "https://realtime.toonstudio.cloud",
      ticketIssuer: {
        issue: async () => ({
          ...ticketPayload,
          scope: { workId: "work-1", roomId: "room-2" },
        }),
      },
      fetch: (async () => jsonResponse(TURN_POLICY)) as typeof fetch,
    });
    await expect(
      mismatched(SCOPE, new AbortController().signal),
    ).resolves.toBeNull();
  });
});
