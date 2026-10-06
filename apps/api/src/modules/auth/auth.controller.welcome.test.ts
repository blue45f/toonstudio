import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthController } from "./auth.controller";

import type { Request, Response } from "express";

const handleGoogleIdToken = vi.hoisted(() => vi.fn());
const consumeAuthOneTimeToken = vi.hoisted(() => vi.fn());
const grantRewardMilestone = vi.hoisted(() => vi.fn());

vi.mock("../../server/oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../server/oauth")>()),
  handleGoogleIdToken,
}));

vi.mock("../../server/auth-one-time-token", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../server/auth-one-time-token")>()),
  consumeAuthOneTimeToken,
}));

function controller(): AuthController {
  return new AuthController(
    { distributed: false },
    { mode: "direct" },
    null,
    { revokeSessionVersion: vi.fn() } as never,
    { grantRewardMilestone },
  );
}

function request(): Request {
  return {
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  } as Request;
}

function response(): Response {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response;
}

const verifiedTx = {
  update: () => ({
    set: () => ({
      where: () => ({
        returning: async () => [{ id: "user-new" }],
      }),
    }),
  }),
};

describe("welcome milestone trigger", () => {
  beforeEach(() => {
    handleGoogleIdToken.mockReset();
    consumeAuthOneTimeToken.mockReset();
    grantRewardMilestone.mockReset();
    grantRewardMilestone.mockResolvedValue({ granted: true });
  });

  it("이메일 인증 완료를 가입 확정으로 보고 웰컴을 1회 지급한다", async () => {
    consumeAuthOneTimeToken.mockImplementation(
      async (
        _purpose: string,
        _token: string,
        apply: (tx: unknown, userId: string) => Promise<string | null>,
      ) => apply(verifiedTx, "user-new"),
    );

    const result = await controller().verifyEmail(
      { token: "valid-verify-token" },
      request(),
    );

    expect(result).toEqual({ ok: true });
    expect(grantRewardMilestone).toHaveBeenCalledTimes(1);
    expect(grantRewardMilestone).toHaveBeenCalledWith(
      "user-new",
      "welcome",
      "user-new",
    );
  });

  it("인증 토큰이 유효하지 않으면 지급하지 않는다", async () => {
    consumeAuthOneTimeToken.mockResolvedValue(null);

    await expect(
      controller().verifyEmail({ token: "expired-token" }, request()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(grantRewardMilestone).not.toHaveBeenCalled();
  });

  it("소셜 신규 가입 완료 시에만 웰컴을 지급한다", async () => {
    handleGoogleIdToken.mockResolvedValue({
      id: "user-social",
      name: "새 가입자",
      email: "new@example.test",
      image: null,
      role: "user",
      sessionVersion: 1,
      isNewAccount: true,
    });

    const created = await controller().oauthGoogleIdToken(
      { idToken: "gis-token-new" },
      undefined,
      request(),
      response(),
    );

    expect(created.ok).toBe(true);
    // 내부 신규 신호는 클라이언트 응답에 노출되지 않는다.
    expect(created.user).not.toHaveProperty("isNewAccount");
    expect(grantRewardMilestone).toHaveBeenCalledTimes(1);
    expect(grantRewardMilestone).toHaveBeenCalledWith(
      "user-social",
      "welcome",
      "user-social",
    );

    grantRewardMilestone.mockClear();
    handleGoogleIdToken.mockResolvedValue({
      id: "user-social",
      name: "새 가입자",
      email: "new@example.test",
      image: null,
      role: "user",
      sessionVersion: 1,
    });

    const returning = await controller().oauthGoogleIdToken(
      { idToken: "gis-token-returning" },
      undefined,
      request(),
      response(),
    );

    expect(returning.ok).toBe(true);
    expect(grantRewardMilestone).not.toHaveBeenCalled();
  });

  it("지갑 지급이 실패해도 가입 확정은 롤백되지 않는다", async () => {
    grantRewardMilestone.mockRejectedValue(new Error("wallet unavailable"));
    handleGoogleIdToken.mockResolvedValue({
      id: "user-social",
      name: "새 가입자",
      email: "new@example.test",
      image: null,
      role: "user",
      sessionVersion: 1,
      isNewAccount: true,
    });

    const result = await controller().oauthGoogleIdToken(
      { idToken: "gis-token-wallet-down" },
      undefined,
      request(),
      response(),
    );

    expect(result.ok).toBe(true);
  });
});
