import { ForbiddenException, GoneException, HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ManuscriptVersionShareController } from "./manuscript-version-share.controller";
import {
  VersionSharePasswordLockedException,
  type ManuscriptVersionShareService,
} from "./manuscript-version-share.service";

import type { Response } from "express";

const TOKEN = "token-value-123456";

function setup(resolveShare: () => Promise<unknown>) {
  const setHeader = vi.fn();
  const serviceResolve = vi.fn(resolveShare);
  const controller = new ManuscriptVersionShareController({
    resolveShare: serviceResolve,
  } as unknown as ManuscriptVersionShareService);
  const response = { setHeader } as unknown as Response;
  return { controller, response, setHeader, serviceResolve };
}

describe("공유 링크 해석 컨트롤러의 Retry-After 헤더", () => {
  it("비밀번호 시도 한도(429)에는 본문의 retryAfterSeconds 와 같은 값을 Retry-After 로 싣는다", async () => {
    const locked = new VersionSharePasswordLockedException(540);
    const { controller, response, setHeader } = setup(async () => {
      throw locked;
    });

    const error = await controller
      .resolveShare({ token: TOKEN }, "guess", response, "user-1")
      .catch((e: unknown) => e);

    expect(error).toBe(locked);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).getResponse()).toMatchObject({
      code: "version_share_password_locked",
      retryAfterSeconds: 540,
    });
    expect(setHeader).toHaveBeenCalledTimes(1);
    expect(setHeader).toHaveBeenCalledWith("Retry-After", "540");
  });

  it("다른 오류와 정상 응답에는 Retry-After 를 붙이지 않는다", async () => {
    const gone = setup(async () => {
      throw new GoneException({ code: "version_share_revoked" });
    });
    await expect(
      gone.controller.resolveShare({ token: TOKEN }, undefined, gone.response, "user-1"),
    ).rejects.toBeInstanceOf(GoneException);
    expect(gone.setHeader).not.toHaveBeenCalled();

    const unauthorized = setup(async () => {
      throw new HttpException({ code: "version_share_password_invalid" }, 401);
    });
    await expect(
      unauthorized.controller.resolveShare({ token: TOKEN }, "guess", unauthorized.response, "user-1"),
    ).rejects.toMatchObject({ status: 401 });
    expect(unauthorized.setHeader).not.toHaveBeenCalled();

    const ok = setup(async () => ({ kind: "ok" }));
    await expect(
      ok.controller.resolveShare({ token: TOKEN }, "right", ok.response, "user-1"),
    ).resolves.toEqual({ kind: "ok" });
    expect(ok.setHeader).not.toHaveBeenCalled();
  });

  it("빈 비밀번호 헤더는 비밀번호 없음으로 넘기고, 로그인하지 않은 호출은 서비스에 닿지 않는다", async () => {
    const { controller, response, serviceResolve } = setup(async () => ({ kind: "ok" }));

    await controller.resolveShare({ token: TOKEN }, "", response, "user-1");
    expect(serviceResolve).toHaveBeenCalledWith(TOKEN, undefined);

    serviceResolve.mockClear();
    await expect(
      controller.resolveShare({ token: TOKEN }, "guess", response, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(serviceResolve).not.toHaveBeenCalled();
  });
});
