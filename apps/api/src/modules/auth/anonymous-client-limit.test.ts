import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { createAnonymousClientLimiter } from "./anonymous-client-limit";

function request(remoteAddress: string, headers: Record<string, string> = {}) {
  return { headers, socket: { remoteAddress } };
}

function limiterAt(clock: { now: number }, limit = 3) {
  return createAnonymousClientLimiter({
    name: "test-bucket",
    limit,
    windowMs: 60_000,
    now: () => clock.now,
    environment: {},
  });
}

function statusOf(operation: () => void): number | null {
  try {
    operation();
    return null;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : -1;
  }
}

describe("createAnonymousClientLimiter", () => {
  it("한도까지는 통과시키고 넘으면 429 를 던진다", () => {
    const clock = { now: 1_000 };
    const limiter = limiterAt(clock);
    const client = request("198.51.100.7");
    expect(statusOf(() => limiter.enforce(client))).toBeNull();
    expect(statusOf(() => limiter.enforce(client))).toBeNull();
    expect(statusOf(() => limiter.enforce(client))).toBeNull();
    expect(statusOf(() => limiter.enforce(client))).toBe(429);
  });

  it("창이 지나면 다시 허용한다", () => {
    const clock = { now: 1_000 };
    const limiter = limiterAt(clock, 1);
    const client = request("198.51.100.7");
    limiter.enforce(client);
    expect(statusOf(() => limiter.enforce(client))).toBe(429);
    clock.now += 60_001;
    expect(statusOf(() => limiter.enforce(client))).toBeNull();
  });

  it("클라이언트마다 별도 한도를 쓴다", () => {
    const clock = { now: 1_000 };
    const limiter = limiterAt(clock, 1);
    limiter.enforce(request("198.51.100.7"));
    expect(statusOf(() => limiter.enforce(request("198.51.100.8")))).toBeNull();
    expect(statusOf(() => limiter.enforce(request("198.51.100.7")))).toBe(429);
  });

  it("위조 가능한 전달 헤더를 바꿔도 새 한도를 얻지 못한다", () => {
    const clock = { now: 1_000 };
    const limiter = limiterAt(clock, 2);
    limiter.enforce(request("198.51.100.7", { "x-forwarded-for": "203.0.113.1" }));
    limiter.enforce(request("198.51.100.7", { "x-forwarded-for": "203.0.113.2" }));
    expect(
      statusOf(() => limiter.enforce(request("198.51.100.7", { "x-real-ip": "203.0.113.3" }))),
    ).toBe(429);
  });

  it("버킷 이름이 다르면 서로의 한도에 영향을 주지 않는다", () => {
    const clock = { now: 1_000 };
    const first = createAnonymousClientLimiter({
      name: "a", limit: 1, windowMs: 60_000, now: () => clock.now, environment: {},
    });
    const second = createAnonymousClientLimiter({
      name: "b", limit: 1, windowMs: 60_000, now: () => clock.now, environment: {},
    });
    first.enforce(request("198.51.100.7"));
    expect(statusOf(() => second.enforce(request("198.51.100.7")))).toBeNull();
  });

  it("활성 신원 슬롯이 가득 차면 새 신원은 거부한다(회전 우회 방지)", () => {
    const clock = { now: 1_000 };
    const limiter = createAnonymousClientLimiter({
      name: "tiny", limit: 5, windowMs: 60_000, maximumIdentities: 2, now: () => clock.now, environment: {},
    });
    limiter.enforce(request("198.51.100.1"));
    limiter.enforce(request("198.51.100.2"));
    expect(statusOf(() => limiter.enforce(request("198.51.100.3")))).toBe(429);
    expect(statusOf(() => limiter.enforce(request("198.51.100.1")))).toBeNull();
  });

  it("429 본문에는 다시 시도할 수 있는 시간이 담긴다", () => {
    const clock = { now: 1_000 };
    const limiter = limiterAt(clock, 1);
    const client = request("198.51.100.7");
    limiter.enforce(client);
    try {
      limiter.enforce(client);
      throw new Error("expected 429");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const body = (error as HttpException).getResponse() as Record<string, unknown>;
      expect(body.code).toBe("rate_limited");
      expect(body.retryAfterSeconds).toBe(60);
    }
  });
});
