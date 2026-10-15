import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CreatorEcosystemController } from "./creator-ecosystem.controller";

import type { Request } from "express";

// 로그인 없이 서버 키로 도서관 정보나루 API 를 부르는 조회다. 캐시는 같은 질의만 막으므로 ISBN 을
// 바꿔 가며 반복하면 서버 키의 쿼터를 소진시킬 수 있다(CWE-770).
function clientRequest(remoteAddress: string, headers: Record<string, string> = {}): Request {
  return {
    headers,
    socket: { remoteAddress },
    aborted: false,
    once: vi.fn(),
    off: vi.fn(),
  } as unknown as Request;
}

// 컨트롤러 메서드가 동기로 던지든 비동기로 거부하든 같은 방식으로 상태 코드를 읽는다.
async function statusOf(call: () => unknown): Promise<number | null> {
  try {
    await call();
    return null;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : -1;
  }
}

describe("도서관 소장 조회의 클라이언트별 제한", () => {
  it("분당 20회를 넘으면 429 이다", async () => {
    const getLibraryHoldings = vi.fn().mockResolvedValue({ status: "ok", items: [] });
    const controller = new CreatorEcosystemController({ getLibraryHoldings } as never);
    const client = clientRequest("198.51.100.30");
    for (let index = 0; index < 20; index += 1) {
      await controller.libraryHoldings(`97800000000${index % 10}`, "11", client);
    }
    expect(await statusOf(() => controller.libraryHoldings("9780000000099", "11", client))).toBe(429);
    expect(getLibraryHoldings).toHaveBeenCalledTimes(20);
  });

  it("전달 헤더를 바꿔도 새 한도를 얻지 못하고 다른 클라이언트는 영향을 받지 않는다", async () => {
    const getLibraryHoldings = vi.fn().mockResolvedValue({ status: "ok", items: [] });
    const controller = new CreatorEcosystemController({ getLibraryHoldings } as never);
    for (let index = 0; index < 20; index += 1) {
      await controller.libraryHoldings("9780000000001", "11", clientRequest("198.51.100.31", {
        "x-forwarded-for": `203.0.113.${index + 1}`,
      }));
    }
    const rotated = clientRequest("198.51.100.31", { "x-forwarded-for": "203.0.113.250" });
    expect(await statusOf(() => controller.libraryHoldings("9780000000001", "11", rotated))).toBe(429);
    const another = clientRequest("198.51.100.32");
    expect(await statusOf(() => controller.libraryHoldings("9780000000001", "11", another))).toBeNull();
  });
});
