import { describe, expect, it, vi } from "vitest";

import { CORE_BYPASS_CACHE_CONTROL, EDGE_CACHE_HEADER } from "./edge-api-lane-router.mjs";
import { createEdgeApiCacheCoalescer, createMemoryEdgeCache } from "./edge-cache-coalescer.mjs";

const URL = "https://www.toonstudio.cloud/api/catalog/brushes";

function createGate() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release: () => release() };
}

describe("엣지 캐시의 조건부 응답 경계", () => {
  it.each([204, 205, 304])("원점의 %s 응답은 null 본문과 상태를 유지하고 공유 캐시에 저장하지 않는다", async (status) => {
    const cache = createMemoryEdgeCache();
    const shield = createEdgeApiCacheCoalescer({ cache });
    const response = await shield.handle(new Request(URL), async () => new Response(null, {
      status, headers: { etag: '"current"' },
    }));

    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
    expect(await response.text()).toBe("");
    expect(response.headers.get("etag")).toBe('"current"');
    expect(response.headers.get(EDGE_CACHE_HEADER)).toBe("BYPASS");
    expect(cache.size).toBe(0);
    expect(shield.getStats().inFlightMisses).toBe(0);
  });

  it.each([204, 205, 304])("인메모리 캐시 snapshot의 %s 응답도 본문을 만들어내지 않는다", async (status) => {
    const cache = createMemoryEdgeCache();
    const key = new Request(URL);
    await cache.put(key, new Response(null, { status }));
    for (let visit = 0; visit < 2; visit += 1) {
      const response = await cache.match(key);
      expect(response?.status).toBe(status);
      expect(response?.body).toBeNull();
    }
  });

  it.each([true, false])("조건부 요청이 먼저 시작하는지(%s)와 무관하게 일반 GET은 304를 공유하지 않는다", async (conditionalFirst) => {
    const cache = createMemoryEdgeCache();
    const shield = createEdgeApiCacheCoalescer({ cache });
    const entered = createGate();
    const release = createGate();
    const conditionalRequest = new Request(URL, { headers: { "if-none-match": '"current"' } });
    const plainRequest = new Request(URL);
    const originFetch = vi.fn(async (request: Request) => {
      const conditional = request.headers.has("if-none-match");
      if (conditional === conditionalFirst) {
        entered.release();
        await release.promise;
      }
      return conditional
        ? new Response(null, { status: 304, headers: { etag: '"current"' } })
        : new Response("complete catalogue", { headers: { etag: '"current"' } });
    });

    const first = shield.handle(conditionalFirst ? conditionalRequest : plainRequest, originFetch);
    await entered.promise;
    const second = shield.handle(conditionalFirst ? plainRequest : conditionalRequest, originFetch);
    release.release();
    const responses = await Promise.all([first, second]);
    const conditional = responses[conditionalFirst ? 0 : 1];
    const plain = responses[conditionalFirst ? 1 : 0];

    expect(originFetch).toHaveBeenCalledTimes(2);
    expect(conditional?.status).toBe(304);
    expect(conditional?.body).toBeNull();
    expect(conditional?.headers.get(EDGE_CACHE_HEADER)).toBe("BYPASS");
    expect(plain?.status).toBe(200);
    expect(await plain?.text()).toBe("complete catalogue");
    expect(cache.size).toBe(1);

    const cached = await shield.handle(plainRequest, originFetch);
    expect(cached.status).toBe(200);
    expect(await cached.text()).toBe("complete catalogue");
    expect(cached.headers.get(EDGE_CACHE_HEADER)).toBe("HIT");
    expect(originFetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["if-match", '"current"'],
    ["if-none-match", '"current"'],
    ["if-modified-since", "Thu, 26 Nov 2026 00:00:00 GMT"],
    ["if-unmodified-since", "Thu, 26 Nov 2026 00:00:00 GMT"],
    ["if-range", '"current"'],
    ["range", "bytes=0-9"],
  ])("%s 헤더는 캐시 적중을 우회하고 기존 공유 표현을 교체하지 않는다", async (header, value) => {
    const shield = createEdgeApiCacheCoalescer({ cache: createMemoryEdgeCache() });
    const originFetch = vi.fn(async () => new Response("cached representation"));
    await shield.handle(new Request(URL), originFetch);
    originFetch.mockImplementation(async () => new Response("conditional representation", {
      headers: { "cache-control": "no-store", "set-cookie": "scope=conditional; Secure" },
    }));
    const request = new Request(URL, { headers: { [header]: value } });
    const response = await shield.handle(request, originFetch);

    expect(await response.text()).toBe("conditional representation");
    expect(response.headers.get(EDGE_CACHE_HEADER)).toBe("BYPASS");
    expect(response.headers.get("cache-control")).toBe(header === "range" ? CORE_BYPASS_CACHE_CONTROL : "no-store");
    expect(response.headers.get("set-cookie")).toBe("scope=conditional; Secure");
    expect(originFetch).toHaveBeenLastCalledWith(request);
    const cached = await shield.handle(new Request(URL), originFetch);
    expect(await cached.text()).toBe("cached representation");
    expect(originFetch).toHaveBeenCalledTimes(2);
  });
});
