import { describe, expect, it } from "vitest";

import { KIT_BYTES_CACHE_LIMIT, createKitBytesCache } from "./kit-bytes-cache";

function bytes(length: number): Uint8Array {
  return new Uint8Array(length);
}

describe("키트 바이트 캐시", () => {
  it("기본 상한은 64 MiB다", () => {
    expect(KIT_BYTES_CACHE_LIMIT).toBe(64 * 1024 * 1024);
  });

  it("넣은 바이트를 같은 객체로 돌려주고 합계를 센다", () => {
    const cache = createKitBytesCache(100);
    const a = bytes(30);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.set("a", a)).toBe(true);
    expect(cache.get("a")).toBe(a);
    expect(cache.size()).toBe(30);
    expect(cache.urls()).toEqual(["a"]);
  });

  it("합계가 상한을 넘으면 가장 오래 쓰지 않은 항목부터 제거한다(읽으면 최근 사용으로 갱신)", () => {
    const cache = createKitBytesCache(100);
    cache.set("a", bytes(40));
    cache.set("b", bytes(40));
    expect(cache.get("a")).toBeDefined(); // a가 최근 사용 → 제거 순서는 b, a
    cache.set("c", bytes(40));
    expect(cache.urls()).toEqual(["a", "c"]);
    expect(cache.size()).toBe(80);
    expect(cache.get("b")).toBeUndefined();
  });

  it("같은 URL을 다시 넣으면 이전 크기를 빼고 교체한다", () => {
    const cache = createKitBytesCache(100);
    cache.set("a", bytes(60));
    cache.set("a", bytes(20));
    expect(cache.size()).toBe(20);
    expect(cache.urls()).toEqual(["a"]);
  });

  it("상한보다 큰 항목은 넣지 않고(기존 항목을 쫓아내지도 않고) false를 돌려준다", () => {
    const cache = createKitBytesCache(100);
    cache.set("a", bytes(50));
    expect(cache.set("big", bytes(101))).toBe(false);
    expect(cache.urls()).toEqual(["a"]);
    expect(cache.size()).toBe(50);
    // 이미 있던 URL을 상한 초과 바이트로 덮으려 하면 옛 항목은 버려진다(오래된 바이트를 남기지 않는다)
    expect(cache.set("a", bytes(101))).toBe(false);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  it("delete와 clear는 합계를 맞춘다", () => {
    const cache = createKitBytesCache(100);
    cache.set("a", bytes(10));
    cache.set("b", bytes(20));
    cache.delete("a");
    cache.delete("없음");
    expect(cache.size()).toBe(20);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.urls()).toEqual([]);
  });
});
