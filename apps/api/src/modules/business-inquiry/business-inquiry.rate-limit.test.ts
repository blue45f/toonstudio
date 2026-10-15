import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { BusinessInquiryController } from "./business-inquiry.controller";

import type { Request } from "express";

// 로그인 없이 DB 에 행을 쓰는 접수 경로다. 서비스의 이메일별 한도(시간당 4건)는 요청마다 이메일 값을
// 바꾸면 적용되지 않으므로, 한 클라이언트가 한도 없이 행을 쌓을 수 있었다(CWE-770). 클라이언트별
// 한도를 넘기면 429 여야 한다.
function clientRequest(remoteAddress: string, headers: Record<string, string> = {}): Request {
  return {
    headers,
    socket: { remoteAddress },
    aborted: false,
    once: vi.fn(),
    off: vi.fn(),
  } as unknown as Request;
}

function inquiry(index: number) {
  return {
    type: "partnership",
    email: `visitor${index}@example.com`,
    message: `제휴 문의 ${index}`,
  };
}

async function statusOf(call: () => unknown): Promise<number | null> {
  try {
    await call();
    return null;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : -1;
  }
}

describe("기업 문의 접수의 클라이언트별 제한", () => {
  it("한 클라이언트가 시간당 10건을 넘으면 이메일과 전달 헤더를 바꿔도 429 이다", async () => {
    const create = vi.fn().mockResolvedValue({ received: true });
    const controller = new BusinessInquiryController({ create } as never);
    for (let index = 0; index < 10; index += 1) {
      await controller.createInquiry(inquiry(index), clientRequest("198.51.100.50", {
        "x-forwarded-for": `203.0.113.${index + 1}`,
      }));
    }
    const rotated = clientRequest("198.51.100.50", { "x-forwarded-for": "203.0.113.250" });
    expect(await statusOf(() => controller.createInquiry(inquiry(99), rotated))).toBe(429);
    expect(create).toHaveBeenCalledTimes(10);
  });

  it("다른 클라이언트는 영향을 받지 않는다", async () => {
    const create = vi.fn().mockResolvedValue({ received: true });
    const controller = new BusinessInquiryController({ create } as never);
    for (let index = 0; index < 10; index += 1) {
      await controller.createInquiry(inquiry(index), clientRequest("198.51.100.51"));
    }
    const another = clientRequest("198.51.100.52");
    expect(await statusOf(() => controller.createInquiry(inquiry(0), another))).toBeNull();
  });

  it("요청 객체가 없는 직접 호출(테스트, 내부 사용)은 제한하지 않는다", async () => {
    const create = vi.fn().mockResolvedValue({ received: true });
    const controller = new BusinessInquiryController({ create } as never);
    for (let index = 0; index < 30; index += 1) await controller.createInquiry(inquiry(index));
    expect(create).toHaveBeenCalledTimes(30);
  });
});
