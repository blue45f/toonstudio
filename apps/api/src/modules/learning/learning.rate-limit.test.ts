import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { LearningController } from "./learning.module";

import type { Request } from "express";

// 로그인 없이 서버 키로 YouTube Data API(search.list 는 호출당 100 쿼터 단위)를 부르는 엔드포인트다.
// 캐시는 같은 질의만 막으므로 질의를 바꿔 가며 반복하면 서버 키의 일일 쿼터를 소진시킬 수 있다
// (CWE-770). 클라이언트별 한도를 넘기면 429 여야 한다.
function clientRequest(remoteAddress: string, headers: Record<string, string> = {}): Request {
  return {
    headers,
    socket: { remoteAddress },
    aborted: false,
    once: vi.fn(),
    off: vi.fn(),
  } as unknown as Request;
}

async function exhaust(
  limit: number,
  call: (index: number) => unknown,
): Promise<{ status: number | null }> {
  for (let index = 0; index < limit; index += 1) await call(index);
  try {
    await call(limit);
    return { status: null };
  } catch (error) {
    return { status: error instanceof HttpException ? error.getStatus() : -1 };
  }
}

describe("학습 YouTube 검색의 클라이언트별 제한", () => {
  it("분당 30회를 넘으면 429 이고 질의/헤더를 바꿔도 우회하지 못한다", async () => {
    const search = vi.fn().mockResolvedValue({ status: "ok", items: [] });
    const controller = new LearningController({ search } as never);
    const outcome = await exhaust(30, (index) =>
      controller.searchYouTube(`콘티 연출 ${index}`, "8", clientRequest("198.51.100.20", {
        "x-forwarded-for": `203.0.113.${index + 1}`,
      })));
    expect(outcome.status).toBe(429);
    expect(search).toHaveBeenCalledTimes(30);
  });

  it("다른 클라이언트는 영향을 받지 않는다", async () => {
    const search = vi.fn().mockResolvedValue({ status: "ok", items: [] });
    const controller = new LearningController({ search } as never);
    await exhaust(30, (index) => controller.searchYouTube(`q${index}`, "8", clientRequest("198.51.100.21")));
    await expect(
      Promise.resolve(controller.searchYouTube("q", "8", clientRequest("198.51.100.22"))),
    ).resolves.toBeDefined();
  });

  it("요청 객체가 없는 직접 호출(테스트, 내부 사용)은 제한하지 않는다", async () => {
    const search = vi.fn().mockResolvedValue({ status: "ok", items: [] });
    const controller = new LearningController({ search } as never);
    for (let index = 0; index < 60; index += 1) await controller.searchYouTube("q", "8");
    expect(search).toHaveBeenCalledTimes(60);
  });
});
