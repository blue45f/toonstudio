import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  API_LANES,
  API_LANE_HEADER,
  CORE_BYPASS_CACHE_CONTROL,
  EDGE_CACHE_HEADER,
  buildCanonicalEdgeCacheKey,
  classifyApiLane,
  isEdgeCacheablePublicRead,
} from "./edge-api-lane-router.mjs";
import {
  EDGE_CACHE_STATUS,
  createEdgeApiCacheCoalescer,
  createMemoryEdgeCache,
} from "./edge-cache-coalescer.mjs";

const BASE = "https://www.toonstudio.cloud";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("classifyApiLane — 목적별 4-Lane 분류", () => {
  it("익명 공개 읽기 GET/HEAD 경로를 명시적 TTL·SWR 정책과 함께 edge-public-read로 분류한다", () => {
    const cases = [
      ["/api/studio/ai/modes", 300, 1800, "studio-ai-modes"],
      ["/api/studio-ai/openai-assist/status", 30, 120, "studio-ai-openai-status"],
      ["/api/studio/ai/free-quota-status", 30, 120, "studio-ai-free-quota-status"],
      ["/api/catalog/brushes?genre=webtoon", 120, 600, "catalog"],
      ["/api/rankings/weekly", 60, 300, "rankings"],
      ["/api/health/live", 10, 30, "health-live"],
    ];

    for (const [path, ttlSeconds, swrSeconds, routeKey] of cases) {
      const result = classifyApiLane(new Request(`${BASE}${path}`));
      assert.equal(result.lane, API_LANES.EDGE_PUBLIC_READ, path);
      assert.equal(result.cacheable, true, path);
      assert.equal(result.ttlSeconds, ttlSeconds, path);
      assert.equal(result.swrSeconds, swrSeconds, path);
      assert.equal(result.routeKey, routeKey, path);
      assert.equal(
        result.cacheControl,
        `public, max-age=${ttlSeconds}, stale-while-revalidate=${swrSeconds}`,
        path,
      );
    }

    const headCatalog = classifyApiLane(new Request(`${BASE}/api/catalog/packs`, { method: "HEAD" }));
    assert.equal(headCatalog.lane, API_LANES.EDGE_PUBLIC_READ);
    assert.equal(headCatalog.cacheable, true);
  });

  it("AI 추론·창작 보조 경로를 edge-ai-assist로 격리하고 캐시를 우회한다", () => {
    const paths = [
      ["POST", "/api/studio-ai/openai-assist", { authorization: "Bearer token" }],
      ["POST", "/api/studio/ai/generate", { cookie: "sid=1" }],
      ["POST", "/api/studio/ai/director", {}],
      ["GET", "/api/studio-ai/jobs/job-42", {}],
    ];

    for (const [method, path, headers] of paths) {
      const result = classifyApiLane(new Request(`${BASE}${path}`, { method, headers }));
      assert.equal(result.lane, API_LANES.EDGE_AI_ASSIST, `${method} ${path}`);
      assert.equal(result.cacheable, false, `${method} ${path}`);
      assert.equal(result.cacheControl, CORE_BYPASS_CACHE_CONTROL, `${method} ${path}`);
    }
  });

  it("실시간 협업 시그널링 경로를 realtime-do 레인으로 분류한다", () => {
    const paths = [
      ["GET", "/api/realtime/rooms/room-1"],
      ["POST", "/api/realtime/signal"],
      ["GET", "/ws/collab/room-1"],
      ["GET", "/api/studio-live/session"],
      ["GET", "/socket.io/?EIO=4&transport=websocket"],
    ];

    for (const [method, path] of paths) {
      const result = classifyApiLane(new Request(`${BASE}${path}`, { method }));
      assert.equal(result.lane, API_LANES.REALTIME_DO, `${method} ${path}`);
      assert.equal(result.cacheable, false, `${method} ${path}`);
      assert.equal(result.cacheControl, CORE_BYPASS_CACHE_CONTROL, `${method} ${path}`);
    }
  });

  it("인증·변경·결제·관리자·개인 경로와 비정상 입력은 항상 core-stateful-onpod로 닫는다", () => {
    const cases = [
      new Request(`${BASE}/api/auth/session`),
      new Request(`${BASE}/api/billing/checkout`, { method: "POST" }),
      new Request(`${BASE}/api/admin/users`),
      new Request(`${BASE}/api/me`),
      new Request(`${BASE}/api/projects/proj-1`, { method: "DELETE" }),
      new Request(`${BASE}/api/catalog/brushes`, { method: "POST" }),
      new Request(`${BASE}/api/rankings/weekly`, { method: "PUT" }),
      new Request(`${BASE}/api/studio/ai/modes`, { method: "PATCH" }),
      new Request(`${BASE}/api/health/ready`),
      new Request(`${BASE}/api/config`),
      new Request(`${BASE}/api/catalog/ingest`),
      new Request(`${BASE}/api/studio/ai/billing/usage`),
    ];

    for (const request of cases) {
      const result = classifyApiLane(request);
      assert.equal(result.lane, API_LANES.CORE_STATEFUL_ONPOD, `${request.method} ${request.url}`);
      assert.equal(result.cacheable, false);
      assert.equal(result.cacheControl, CORE_BYPASS_CACHE_CONTROL);
    }

    assert.equal(classifyApiLane(null).lane, API_LANES.CORE_STATEFUL_ONPOD);
    assert.equal(classifyApiLane({ url: "not-a-valid-url", headers: new Headers() }).cacheable, false);
  });

  it("긴 후행 슬래시 경로도 선형 시간으로 정규화한다", () => {
    const flood = "/".repeat(50_000);
    const started = performance.now();
    const result = classifyApiLane(new Request(`${BASE}/api/catalog/items${flood}`));
    assert.equal(result.lane, API_LANES.EDGE_PUBLIC_READ);
    assert.ok(performance.now() - started < 200);
  });
});

describe("isEdgeCacheablePublicRead — 100% fail-closed 캐시 자격 가드", () => {
  const okPublicResponse = () => new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  it("익명 공개 GET/HEAD + 안전한 200 응답만 허용한다", () => {
    assert.equal(
      isEdgeCacheablePublicRead(new Request(`${BASE}/api/catalog/items`), okPublicResponse()),
      true,
    );
    assert.equal(
      isEdgeCacheablePublicRead(new Request(`${BASE}/api/studio/ai/modes`, { method: "HEAD" }), okPublicResponse()),
      true,
    );
  });

  it("인증·쿠키·세션 헤더나 비-GET/HEAD 메서드가 하나라도 있으면 무조건 거부한다", () => {
    const blockedRequests = [
      new Request(`${BASE}/api/catalog/items`, { headers: { Authorization: "Bearer secret" } }),
      new Request(`${BASE}/api/catalog/items`, { headers: { Cookie: "session=user-a" } }),
      new Request(`${BASE}/api/catalog/items`, { headers: { "X-Session-Token": "tok-1" } }),
      new Request(`${BASE}/api/catalog/items`, { headers: { "Proxy-Authorization": "Basic abc" } }),
      new Request(`${BASE}/api/catalog/items`, { headers: { "X-User-Id": "u-1" } }),
      new Request(`${BASE}/api/catalog/items`, { headers: { "X-Admin-Key": "k-1" } }),
      new Request(`${BASE}/api/catalog/items`, { headers: { "X-Csrf-Token": "csrf" } }),
      new Request(`${BASE}/api/catalog/items`, { headers: { Cookie: "" } }),
      new Request(`${BASE}/api/studio/ai/free-quota-status`, { headers: { Cookie: "sid=u1" } }),
      new Request(`${BASE}/api/catalog/items`, { method: "POST" }),
      new Request(`${BASE}/api/catalog/items`, { method: "PUT" }),
      new Request(`${BASE}/api/catalog/items`, { method: "PATCH" }),
      new Request(`${BASE}/api/catalog/items`, { method: "DELETE" }),
      new Request(`${BASE}/api/catalog/items`, { method: "OPTIONS" }),
      new Request(`${BASE}/api/catalog/items`, { headers: { Range: "bytes=0-10" } }),
      new Request(`${BASE}/api/catalog/items`, { headers: { Upgrade: "websocket" } }),
    ];

    for (const request of blockedRequests) {
      assert.equal(isEdgeCacheablePublicRead(request, okPublicResponse()), false);
    }
  });

  it("Set-Cookie, private/no-store/no-cache, Vary 민감 헤더, 비-200 응답은 무조건 거부한다", () => {
    const publicRequest = new Request(`${BASE}/api/catalog/items`);
    const blockedResponses = [
      null,
      undefined,
      new Response("ok", { status: 200, headers: { "Set-Cookie": "sid=abc; HttpOnly" } }),
      new Response("ok", { status: 200, headers: { "Cache-Control": "private, max-age=60" } }),
      new Response("ok", { status: 200, headers: { "Cache-Control": "no-store" } }),
      new Response("ok", { status: 200, headers: { "Cache-Control": "no-cache" } }),
      new Response("ok", { status: 200, headers: { "Cache-Control": "public, max-age=0" } }),
      new Response("ok", { status: 200, headers: { "Cache-Control": "public, s-maxage=0" } }),
      new Response("ok", { status: 200, headers: { Pragma: "no-cache" } }),
      new Response("ok", { status: 200, headers: { Vary: "Cookie" } }),
      new Response("ok", { status: 200, headers: { Vary: "Accept-Encoding, Authorization" } }),
      new Response("ok", { status: 200, headers: { Vary: "*" } }),
      new Response("ok", { status: 200, headers: { "WWW-Authenticate": "Bearer" } }),
      new Response("created", { status: 201 }),
      new Response(null, { status: 204 }),
      new Response(null, { status: 304 }),
      new Response("not found", { status: 404 }),
      new Response("error", { status: 500 }),
      new Response("unavailable", { status: 503 }),
    ];

    for (const response of blockedResponses) {
      assert.equal(isEdgeCacheablePublicRead(publicRequest, response), false);
    }
  });
});

describe("createEdgeApiCacheCoalescer — Singleflight·SWR·보안 격리 증명", () => {
  it("동시 50건의 공개 카탈로그·AI 모드 GET 미스를 정확히 1건의 원점 호출로 병합한다", async () => {
    const cache = createMemoryEdgeCache();
    let currentTime = 1_700_000_000_000;
    const coalescer = createEdgeApiCacheCoalescer({ cache, now: () => currentTime });

    for (const [label, urls] of [
      [
        "catalog",
        Array.from({ length: 50 }, (_, index) =>
          index % 2 === 0
            ? `${BASE}/api/catalog/brushes?page=1&sort=popular`
            : `${BASE}/api/catalog/brushes?sort=popular&page=1`),
      ],
      [
        "studio-ai-modes",
        Array.from({ length: 50 }, () => `${BASE}/api/studio/ai/modes`),
      ],
    ]) {
      let originCalls = 0;
      const gate = createDeferred();
      const originFetch = async () => {
        originCalls += 1;
        await gate.promise;
        return new Response(JSON.stringify({ label, rev: originCalls }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };

      const pending = urls.map((url) => coalescer.handle(new Request(url), originFetch));
      // 50건이 모두 진입한 뒤 원점 응답을 한 번에 해제한다.
      await Promise.resolve();
      gate.resolve();

      const responses = await Promise.all(pending);
      assert.equal(originCalls, 1, `${label}: origin must be fetched exactly once`);
      assert.equal(coalescer.getStats().inFlightMisses, 0, `${label}: singleflight map must clean up`);

      const statuses = responses.map((response) => response.headers.get(EDGE_CACHE_HEADER));
      assert.equal(statuses.filter((status) => status === EDGE_CACHE_STATUS.MISS).length, 1, label);
      assert.equal(statuses.filter((status) => status === EDGE_CACHE_STATUS.COALESCED).length, 49, label);

      for (const response of responses) {
        assert.equal(response.status, 200);
        assert.equal(response.headers.get(API_LANE_HEADER), API_LANES.EDGE_PUBLIC_READ);
        assert.deepEqual(await response.json(), { label, rev: 1 });
      }

      // 직후 51번째 요청은 원점 호출 없이 즉시 HIT 되어야 한다.
      currentTime += 5_000;
      const hitResponse = await coalescer.handle(new Request(urls[0]), originFetch);
      assert.equal(originCalls, 1);
      assert.equal(hitResponse.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.HIT);
      assert.equal(hitResponse.headers.get("age"), "5");
      assert.deepEqual(await hitResponse.json(), { label, rev: 1 });
    }
  });

  it("Singleflight 원점 오류가 발생하면 모든 대기자가 오류를 받고 맵을 깨끗이 정리한다", async () => {
    const cache = createMemoryEdgeCache();
    const coalescer = createEdgeApiCacheCoalescer({ cache });
    let originCalls = 0;
    const gate = createDeferred();

    const failingFetch = async () => {
      originCalls += 1;
      await gate.promise;
      throw new Error("onpod upstream timeout");
    };

    const requests = Array.from({ length: 10 }, () =>
      coalescer.handle(new Request(`${BASE}/api/rankings/daily`), failingFetch));
    await Promise.resolve();
    gate.reject(new Error("onpod upstream timeout"));

    const settled = await Promise.allSettled(requests);
    assert.equal(originCalls, 1);
    assert.equal(settled.every((item) => item.status === "rejected"), true);
    assert.equal(coalescer.getStats().inFlightMisses, 0);
    assert.equal(cache.size, 0);

    // 정리 후 후속 요청은 정상 복구되어야 한다.
    const recovered = await coalescer.handle(
      new Request(`${BASE}/api/rankings/daily`),
      async () => new Response(JSON.stringify({ recovered: true }), { status: 200 }),
    );
    assert.equal(recovered.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.MISS);
    assert.deepEqual(await recovered.json(), { recovered: true });
  });

  it("SWR 구간에서는 즉시 STALE 응답을 반환하고 ctx.waitUntil로 백그라운드 갱신을 정확히 1건만 실행한다", async () => {
    const cache = createMemoryEdgeCache();
    let currentTime = 1_700_000_000_000;
    const coalescer = createEdgeApiCacheCoalescer({ cache, now: () => currentTime });

    let originCalls = 0;
    let deferredRefresh = null;
    const originFetch = async () => {
      originCalls += 1;
      if (originCalls === 1) {
        return new Response(JSON.stringify({ version: 1 }), { status: 200 });
      }
      if (originCalls === 2) {
        deferredRefresh = createDeferred();
        return deferredRefresh.promise;
      }
      return new Response(JSON.stringify({ version: originCalls }), { status: 200 });
    };

    const url = `${BASE}/api/studio/ai/modes`; // TTL 300s, SWR 1800s
    const waitUntilPromises = [];
    const ctx = { waitUntil: (promise) => { waitUntilPromises.push(promise); } };

    // 1. t=0: 초기 MISS
    const first = await coalescer.handle(new Request(url), originFetch, ctx);
    assert.equal(first.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.MISS);
    assert.deepEqual(await first.json(), { version: 1 });
    assert.equal(originCalls, 1);
    assert.equal(waitUntilPromises.length, 0);

    // 2. t=299s: 아직 신선 -> HIT
    currentTime += 299_000;
    const fresh = await coalescer.handle(new Request(url), originFetch, ctx);
    assert.equal(fresh.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.HIT);
    assert.equal(originCalls, 1);
    assert.equal(waitUntilPromises.length, 0);

    // 3. t=301s: TTL 초과, SWR 창 내부 -> 동시 5건 모두 즉시 STALE 반환, 백그라운드 갱신은 1건만!
    currentTime += 2_000;
    const staleResponses = await Promise.all(
      Array.from({ length: 5 }, () => coalescer.handle(new Request(url), originFetch, ctx)),
    );
    assert.equal(originCalls, 2);
    assert.equal(waitUntilPromises.length, 1);
    assert.equal(coalescer.getStats().inFlightRevalidations, 1);

    for (const response of staleResponses) {
      assert.equal(response.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.STALE);
      assert.equal(response.headers.get(API_LANE_HEADER), API_LANES.EDGE_PUBLIC_READ);
      assert.deepEqual(await response.json(), { version: 1 });
    }

    // 4. 백그라운드 갱신 완료 후 다음 요청은 version 2로 HIT!
    deferredRefresh.resolve(new Response(JSON.stringify({ version: 2 }), { status: 200 }));
    await Promise.all(waitUntilPromises);
    assert.equal(coalescer.getStats().inFlightRevalidations, 0);

    currentTime += 1_000;
    const refreshedHit = await coalescer.handle(new Request(url), originFetch, ctx);
    assert.equal(refreshedHit.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.HIT);
    assert.deepEqual(await refreshedHit.json(), { version: 2 });
    assert.equal(originCalls, 2);

    // 5. TTL(300s) + SWR(1800s) 모두 지난 뒤에는 만료되어 동기 MISS로 원점 재조회!
    currentTime += 2_200_000;
    const expiredMiss = await coalescer.handle(new Request(url), originFetch, ctx);
    assert.equal(expiredMiss.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.MISS);
    assert.deepEqual(await expiredMiss.json(), { version: 3 });
    assert.equal(originCalls, 3);
  });

  it("인증·쿠키·POST·Set-Cookie·private 응답은 캐시를 절대 우회해 사용자 간 캐시 유출이 0건임을 증명한다", async () => {
    const cache = createMemoryEdgeCache();
    const coalescer = createEdgeApiCacheCoalescer({ cache });
    let originCalls = 0;

    // 1. 인증된 사용자 A, B 요청은 절대 캐시에 저장되지 않고 각자 원점에서 응답을 받는다.
    const authFetch = async (request) => {
      originCalls += 1;
      return new Response(JSON.stringify({
        cookie: request.headers.get("cookie"),
        auth: request.headers.get("authorization"),
        call: originCalls,
      }), { status: 200 });
    };

    const userA = await coalescer.handle(
      new Request(`${BASE}/api/catalog/brushes`, { headers: { Cookie: "sid=user-A" } }),
      authFetch,
    );
    const userB = await coalescer.handle(
      new Request(`${BASE}/api/catalog/brushes`, { headers: { Cookie: "sid=user-B" } }),
      authFetch,
    );
    assert.equal(userA.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.BYPASS);
    assert.equal(userB.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.BYPASS);
    assert.equal(userA.headers.get("cache-control"), CORE_BYPASS_CACHE_CONTROL);
    assert.equal(userB.headers.get("cache-control"), CORE_BYPASS_CACHE_CONTROL);
    assert.equal(cache.size, 0);
    assert.deepEqual(await userA.json(), { cookie: "sid=user-A", auth: null, call: 1 });
    assert.deepEqual(await userB.json(), { cookie: "sid=user-B", auth: null, call: 2 });

    // 2. 익명 캐시가 채워진 뒤에도 Authorization/X-Session-Token 요청은 캐시 HIT 없이 BYPASS한다.
    const anonMiss = await coalescer.handle(
      new Request(`${BASE}/api/catalog/brushes`),
      async () => new Response(JSON.stringify({ scope: "public" }), { status: 200 }),
    );
    assert.equal(anonMiss.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.MISS);
    assert.equal(cache.size, 1);

    const authBypassAfterWarm = await coalescer.handle(
      new Request(`${BASE}/api/catalog/brushes`, { headers: { "X-Session-Token": "user-c-token" } }),
      authFetch,
    );
    assert.equal(authBypassAfterWarm.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.BYPASS);
    assert.equal(authBypassAfterWarm.headers.get(API_LANE_HEADER), API_LANES.CORE_STATEFUL_ONPOD);
    assert.equal(originCalls, 3);

    // 3. 원점이 Set-Cookie 또는 private 응답을 반환하면 캐시하지 않으며 대기자에게도 절대 공유하지 않는다.
    let setCookieCalls = 0;
    const setCookieGate = createDeferred();
    const setCookieFetch = async () => {
      setCookieCalls += 1;
      const ticket = setCookieCalls;
      if (ticket === 1) await setCookieGate.promise;
      return new Response(JSON.stringify({ ticket }), {
        status: 200,
        headers: {
          "Set-Cookie": `sid=ticket-${ticket}; HttpOnly`,
          "Cache-Control": "private, no-store",
        },
      });
    };

    const setCookieUrl = `${BASE}/api/rankings/private-accident`;
    const concurrentPrivate = [
      coalescer.handle(new Request(setCookieUrl), setCookieFetch),
      coalescer.handle(new Request(setCookieUrl), setCookieFetch),
      coalescer.handle(new Request(setCookieUrl), setCookieFetch),
    ];
    await Promise.resolve();
    setCookieGate.resolve();
    const privateResponses = await Promise.all(concurrentPrivate);

    assert.equal(setCookieCalls, 3);
    const tickets = new Set();
    for (const response of privateResponses) {
      assert.equal(response.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.BYPASS);
      tickets.add((await response.json()).ticket);
    }
    assert.equal(tickets.size, 3, "each waiter must receive its own response, never another user's Set-Cookie");
    assert.equal(await cache.match(new Request(setCookieUrl)), undefined);
  });

  it("원시 Map 주입 캐시와 HEAD 요청, 정규화 캐시 키가 결정적으로 동작한다", async () => {
    const rawMap = new Map();
    const coalescer = createEdgeApiCacheCoalescer({ cache: rawMap });
    let originCalls = 0;

    // 1. 콜드 HEAD는 GET 캐시 키를 빈 본문으로 오염시키지 않는다.
    const coldHead = await coalescer.handle(
      new Request(`${BASE}/api/catalog/packs`, { method: "HEAD" }),
      async () => {
        originCalls += 1;
        return new Response(null, { status: 200, headers: { "x-origin": "head" } });
      },
    );
    assert.equal(coldHead.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.MISS);
    assert.equal(coldHead.body, null);
    assert.equal(rawMap.size, 0);

    // 2. GET이 캐시를 채운 뒤에는 쿼리 순서가 다른 GET과 HEAD 모두 HIT 된다.
    const warmGet = await coalescer.handle(
      new Request(`${BASE}/api/catalog/packs?b=2&a=1`),
      async () => {
        originCalls += 1;
        return new Response(JSON.stringify({ packs: [1, 2] }), { status: 200 });
      },
    );
    assert.equal(warmGet.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.MISS);
    assert.equal(rawMap.size, 1);
    assert.equal(
      buildCanonicalEdgeCacheKey(new Request(`${BASE}/api/catalog/packs?b=2&a=1#frag`)),
      `${BASE}/api/catalog/packs?a=1&b=2`,
    );

    for (let index = 0; index < 20; index += 1) {
      const hit = await coalescer.handle(
        new Request(`${BASE}/api/catalog/packs?a=1&b=2`),
        async () => { throw new Error("must not reach origin on cache hit"); },
      );
      assert.equal(hit.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.HIT);
      assert.deepEqual(await hit.json(), { packs: [1, 2] });
    }

    const warmHead = await coalescer.handle(
      new Request(`${BASE}/api/catalog/packs?a=1&b=2`, { method: "HEAD" }),
      async () => { throw new Error("must not reach origin on HEAD hit"); },
    );
    assert.equal(warmHead.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.HIT);
    assert.equal(warmHead.body, null);
    assert.equal(originCalls, 2);
  });

  it("SWR 백그라운드 갱신이 실패하거나 Set-Cookie를 반환해도 STALE 응답을 보호하고 캐시를 오염시키지 않는다", async () => {
    const cache = createMemoryEdgeCache();
    let currentTime = 1_700_000_000_000;
    const coalescer = createEdgeApiCacheCoalescer({ cache, now: () => currentTime });

    let call = 0;
    const originFetch = async () => {
      call += 1;
      if (call === 1) return new Response(JSON.stringify({ version: 1 }), { status: 200 });
      if (call === 2) throw new Error("temporary network failure");
      return new Response(JSON.stringify({ version: 3 }), {
        status: 200,
        headers: { "Set-Cookie": "sid=poison" },
      });
    };

    const url = `${BASE}/api/studio-ai/openai-assist/status`; // TTL 30s, SWR 120s
    const first = await coalescer.handle(new Request(url), originFetch);
    assert.equal(first.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.MISS);

    // SWR 구간에서 네트워크 오류 발생 -> STALE은 정상 응답되고 재검증 상태도 정리된다.
    currentTime += 35_000;
    const wait1 = [];
    const stale1 = await coalescer.handle(new Request(url), originFetch, { waitUntil: (p) => wait1.push(p) });
    assert.equal(stale1.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.STALE);
    assert.deepEqual(await stale1.json(), { version: 1 });
    await Promise.all(wait1);
    assert.equal(coalescer.getStats().inFlightRevalidations, 0);

    // 다음 SWR 갱신이 Set-Cookie를 반환해도 캐시를 덮어쓰지 않는다.
    currentTime += 5_000;
    const wait2 = [];
    const stale2 = await coalescer.handle(new Request(url), originFetch, { waitUntil: (p) => wait2.push(p) });
    assert.equal(stale2.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.STALE);
    await Promise.all(wait2);
    assert.equal(coalescer.getStats().inFlightRevalidations, 0);

    const stillClean = await cache.match(new Request(url));
    assert.deepEqual(await stillClean.json(), { version: 1 });
  });

  it("비-200 오류 폭주를 1건으로 흡수하되 캐시하지 않으며, 초과 크기·비캐시 레인·caches.default를 정확히 처리한다", async () => {
    const cache = createMemoryEdgeCache();
    const coalescer = createEdgeApiCacheCoalescer({ cache, maxCacheableBytes: 16 });

    // 1. 동시 10건 503 오류: 원점은 1건만 호출하고 캐시에 저장하지 않는다.
    let errCalls = 0;
    const errGate = createDeferred();
    const errPending = Array.from({ length: 10 }, () =>
      coalescer.handle(new Request(`${BASE}/api/rankings/storm`), async () => {
        errCalls += 1;
        await errGate.promise;
        return new Response("upstream busy", { status: 503 });
      }));
    await Promise.resolve();
    errGate.resolve();
    const errResponses = await Promise.all(errPending);
    assert.equal(errCalls, 1);
    assert.equal(cache.size, 0);
    for (const response of errResponses) {
      assert.equal(response.status, 503);
      assert.equal(response.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.BYPASS);
    }

    // 2. maxCacheableBytes 초과 응답은 캐시하지 않고 BYPASS로 전달한다.
    const oversized = await coalescer.handle(
      new Request(`${BASE}/api/catalog/large`),
      async () => new Response("0123456789abcdefghijklmnopqrstuvwxyz", { status: 200 }),
    );
    assert.equal(oversized.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.BYPASS);
    assert.equal(cache.size, 0);

    // 3. AI-assist / realtime-do / core-stateful-onpod 레인은 BYPASS + private, no-store 헤더를 붙인다.
    const aiRes = await coalescer.handle(
      new Request(`${BASE}/api/studio-ai/openai-assist`, { method: "POST", body: "{}" }),
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    assert.equal(aiRes.headers.get(API_LANE_HEADER), API_LANES.EDGE_AI_ASSIST);
    assert.equal(aiRes.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.BYPASS);
    assert.equal(aiRes.headers.get("cache-control"), CORE_BYPASS_CACHE_CONTROL);

    const rtRes = await coalescer.handle(
      new Request(`${BASE}/api/realtime/rooms/r1`),
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    assert.equal(rtRes.headers.get(API_LANE_HEADER), API_LANES.REALTIME_DO);
    assert.equal(rtRes.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.BYPASS);

    // 4. globalThis.caches.default 자동 감지 호환성 확인.
    const defaultStore = createMemoryEdgeCache();
    const previousCaches = globalThis.caches;
    Object.defineProperty(globalThis, "caches", {
      value: { default: defaultStore },
      configurable: true,
      writable: true,
    });
    try {
      const autoCoalescer = createEdgeApiCacheCoalescer();
      const miss = await autoCoalescer.handle(
        new Request(`${BASE}/api/studio/ai/free-quota-status`),
        async () => new Response(JSON.stringify({ remaining: 5 }), { status: 200 }),
      );
      assert.equal(miss.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.MISS);
      const hit = await autoCoalescer.handle(
        new Request(`${BASE}/api/studio/ai/free-quota-status`),
        async () => { throw new Error("should hit caches.default"); },
      );
      assert.equal(hit.headers.get(EDGE_CACHE_HEADER), EDGE_CACHE_STATUS.HIT);
      assert.deepEqual(await hit.json(), { remaining: 5 });
    } finally {
      Object.defineProperty(globalThis, "caches", {
        value: previousCaches,
        configurable: true,
        writable: true,
      });
    }
  });
});
