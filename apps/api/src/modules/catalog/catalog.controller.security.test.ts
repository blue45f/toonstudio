import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogController } from "./catalog.controller";

import type { CatalogService } from "./catalog.service";
import type { Request, Response } from "express";

// 보안 회귀 테스트 모음이다. catalog.controller.test.ts 와 분리해 두면 이 파일의 모듈 목(mock)이
// 기존 테스트에 영향을 주지 않고, 이 파일만 필수 CI 타깃으로 등록할 수 있다.
const { isAdminUser } = vi.hoisted(() => ({ isAdminUser: vi.fn() }));
vi.mock("../../server/app-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../server/app-config")>()),
  isAdminUser,
}));

function createController(): CatalogController {
  return new CatalogController({} as unknown as CatalogService);
}

describe("CatalogController affiliate click log", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 쿼리의 줄바꿈은 WHATWG URL 파서가 제거해 검증은 통과하지만, 원본 문자열을 그대로 로그에 쓰면
  // 공격자가 `[Affiliate Click] ...` 형태의 가짜 로그 줄을 끼워 넣을 수 있다(로그 위조, CWE-117).
  it("요청 값에 줄바꿈이 있어도 로그는 한 줄이고 검증된 목적지만 남긴다", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const redirect = vi.fn();
    const forgedTo =
      "https://ridibooks.com/books/1\n[Affiliate Click] platform=forged to=https://evil.test/steal";

    await createController().redirectAffiliate(
      "ridi",
      forgedTo,
      {
        headers: {
          referer: "https://toonstudio.com/a\r\n[Affiliate Click] forged",
          "user-agent": "agent\u2028second-line",
        },
      } as unknown as Request,
      { redirect } as unknown as Response,
    );

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = String(logSpy.mock.calls[0]?.[0]);
    // 한 줄이어야 가짜 `[Affiliate Click]` 기록이 새 로그 레코드로 시작될 수 없다.
    expect(line).not.toMatch(/[\r\n\u2028\u2029]/u);
    expect(line.startsWith("[Affiliate Click] platform=ridi timestamp=")).toBe(true);
    expect(line).not.toContain(" platform=forged");
  });

  it("지나치게 긴 헤더 값은 잘라서 남긴다", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await createController().redirectAffiliate(
      "ridi",
      "https://ridibooks.com/books/1",
      { headers: { "user-agent": "x".repeat(5_000) } } as unknown as Request,
      { redirect: vi.fn() } as unknown as Response,
    );
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(String(logSpy.mock.calls[0]?.[0]).length).toBeLessThan(1_000);
  });
});

// force 는 5분 TTL 캐시를 건너뛰고 KMAS 상류 조회를 즉시 다시 실행한다. 익명 호출이 반복하면
// 상류 쿼터와 서버 자원을 소진시키므로 관리자 세션에서만 허용하고, 그 외에는 평소 요청과 같다.
describe("CatalogController KMAS merge-on-access force", () => {
  function controllerWithMerge() {
    const mergeKmasOnSiteAccess = vi.fn().mockResolvedValue({ enabled: true, cached: true });
    const controller = new CatalogController({ mergeKmasOnSiteAccess } as unknown as CatalogService);
    return { controller, mergeKmasOnSiteAccess };
  }

  afterEach(() => isAdminUser.mockReset());

  it.each(["1", "true"])("익명 호출의 force=%s 는 캐시 우회를 일으키지 않는다", async (force) => {
    isAdminUser.mockResolvedValue(false);
    const { controller, mergeKmasOnSiteAccess } = controllerWithMerge();
    await controller.mergeKmasOnAccess(force, undefined);
    expect(mergeKmasOnSiteAccess).toHaveBeenCalledWith({ force: false });
  });

  it("관리자가 아닌 로그인 사용자의 force 도 무시한다", async () => {
    isAdminUser.mockResolvedValue(false);
    const { controller, mergeKmasOnSiteAccess } = controllerWithMerge();
    await controller.mergeKmasOnAccess("1", "member-1");
    expect(isAdminUser).toHaveBeenCalledWith("member-1");
    expect(mergeKmasOnSiteAccess).toHaveBeenCalledWith({ force: false });
  });

  it("관리자 세션의 force 는 그대로 전달한다", async () => {
    isAdminUser.mockResolvedValue(true);
    const { controller, mergeKmasOnSiteAccess } = controllerWithMerge();
    await controller.mergeKmasOnAccess("true", "admin-1");
    expect(mergeKmasOnSiteAccess).toHaveBeenCalledWith({ force: true });
  });

  it("force 가 없거나 거짓 값이면 관리자 조회 없이 평소 병합으로 처리한다", async () => {
    const { controller, mergeKmasOnSiteAccess } = controllerWithMerge();
    await controller.mergeKmasOnAccess(undefined, "admin-1");
    await controller.mergeKmasOnAccess("0", "admin-1");
    expect(isAdminUser).not.toHaveBeenCalled();
    expect(mergeKmasOnSiteAccess).toHaveBeenNthCalledWith(1, { force: false });
    expect(mergeKmasOnSiteAccess).toHaveBeenNthCalledWith(2, { force: false });
  });
});
