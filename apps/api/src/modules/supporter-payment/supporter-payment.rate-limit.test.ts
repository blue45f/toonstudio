import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { SupporterPaymentController } from "./supporter-payment.controller";

import type { Request } from "express";

// 로그인 없이 DB 에 후원 주문 행을 만드는 경로다. 서비스의 한도(10분에 300건)는 모든 클라이언트가
// 함께 쓰는 전역 한도라서, 한 클라이언트가 그 한도를 혼자 채우면 다른 후원자의 주문 생성까지 막힌다
// (CWE-770). 전역 한도보다 훨씬 낮은 클라이언트별 한도를 넘기면 429 여야 한다.
function clientRequest(remoteAddress: string, headers: Record<string, string> = {}): Request {
  return {
    headers,
    socket: { remoteAddress },
    aborted: false,
    once: vi.fn(),
    off: vi.fn(),
  } as unknown as Request;
}

const orderBody = { amount: 5_000, supporterName: "후원자", message: "응원합니다" };

async function statusOf(call: () => unknown): Promise<number | null> {
  try {
    await call();
    return null;
  } catch (error) {
    return error instanceof HttpException ? error.getStatus() : -1;
  }
}

describe("후원 주문 생성의 클라이언트별 제한", () => {
  it("한 클라이언트가 10분에 10건을 넘으면 전달 헤더를 바꿔도 429 이다", async () => {
    const createOrder = vi.fn().mockResolvedValue({ orderId: "TS_SUPPORT_TEST" });
    const controller = new SupporterPaymentController({ createOrder } as never);
    for (let index = 0; index < 10; index += 1) {
      await controller.createOrder(orderBody, clientRequest("198.51.100.60", {
        "x-forwarded-for": `203.0.113.${index + 1}`,
      }));
    }
    const rotated = clientRequest("198.51.100.60", { "x-forwarded-for": "203.0.113.250" });
    expect(await statusOf(() => controller.createOrder(orderBody, rotated))).toBe(429);
    expect(createOrder).toHaveBeenCalledTimes(10);
  });

  it("다른 클라이언트는 영향을 받지 않는다", async () => {
    const createOrder = vi.fn().mockResolvedValue({ orderId: "TS_SUPPORT_TEST" });
    const controller = new SupporterPaymentController({ createOrder } as never);
    for (let index = 0; index < 10; index += 1) {
      await controller.createOrder(orderBody, clientRequest("198.51.100.61"));
    }
    const another = clientRequest("198.51.100.62");
    expect(await statusOf(() => controller.createOrder(orderBody, another))).toBeNull();
  });

  it("요청 객체가 없는 직접 호출(테스트, 내부 사용)은 제한하지 않는다", async () => {
    const createOrder = vi.fn().mockResolvedValue({ orderId: "TS_SUPPORT_TEST" });
    const controller = new SupporterPaymentController({ createOrder } as never);
    for (let index = 0; index < 30; index += 1) await controller.createOrder(orderBody);
    expect(createOrder).toHaveBeenCalledTimes(30);
  });
});
