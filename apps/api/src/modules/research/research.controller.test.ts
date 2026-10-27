/**
 * research.controller.test.ts — 리서치 컨트롤러 단위 테스트.
 * 서비스를 가짜로 대체하고 인증 경계·위임을 검증한다.
 */
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ResearchController } from "./research.controller";

import type { ResearchService } from "./research.service";

function serviceHarness() {
  const status = vi.fn(() => ({ configured: true, provider: "deepseek" }));
  const brief = vi.fn(async () => ({ result: { question: "질의" } }));
  const existenceCheck = vi.fn(async () => ({ result: { query: "제목" } }));
  const trendDigest = vi.fn(async () => ({ result: { sections: [] } }));
  const service = {
    status,
    brief,
    existenceCheck,
    trendDigest,
  } as unknown as ResearchService;
  return { service, status, brief, existenceCheck, trendDigest };
}

describe("ResearchController", () => {
  it("status를 위임한다", () => {
    const { service, status } = serviceHarness();
    const controller = new ResearchController(service);
    expect(controller.status()).toMatchObject({ configured: true });
    expect(status).toHaveBeenCalledTimes(1);
  });

  it("로그인 없이 brief를 호출하면 401을 반환한다", async () => {
    const { service, brief } = serviceHarness();
    const controller = new ResearchController(service);
    const error = await controller.brief(
      undefined,
      undefined,
      { question: "질의" } as never,
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).getResponse()).toMatchObject({
      code: "RESEARCH_LOGIN_REQUIRED",
    });
    expect(brief).not.toHaveBeenCalled();
  });

  it("인증된 brief·existence-check·trend-digest를 서비스에 위임한다", async () => {
    const { service, brief, existenceCheck, trendDigest } = serviceHarness();
    const controller = new ResearchController(service);
    await controller.brief("user-1", "idem-1", { question: "질의" } as never);
    await controller.existenceCheck("user-1", "idem-2", { title: "제목" } as never);
    await controller.trendDigest("user-1", "idem-3", {
      queries: ["판타지"],
    } as never);
    expect(brief.mock.calls[0].slice(0, 2)).toEqual(["user-1", { question: "질의" }]);
    expect(brief.mock.calls[0][2]).toBe("idem-1");
    expect(existenceCheck).toHaveBeenCalledTimes(1);
    expect(trendDigest).toHaveBeenCalledTimes(1);
  });
});
