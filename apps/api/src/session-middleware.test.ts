import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifySessionToken } from "./server/session";
import { isSessionAllowed } from "./server/user-lifecycle";
import { AUTH_SESSION_COOKIE_NAME, resolveSessionCookieName, resolveSessionCookieValue } from "./session-cookie";
import {
  getSessionAuthenticationPrincipal,
  getSessionAuthenticationSource,
  sessionAuth,
} from "./session-middleware";

import type { Request } from "express";

function request(headers: Request["headers"]): Request {
  return { headers } as Request;
}

vi.mock("./server/session", () => ({
  verifySessionToken: vi.fn(),
}));

vi.mock("./server/user-lifecycle", () => ({
  isSessionAllowed: vi.fn(),
}));

describe("session middleware", () => {
  const nextTick = async () =>
    new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    vi.mocked(verifySessionToken).mockReset();
    vi.mocked(isSessionAllowed).mockReset();
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("uses valid x-user-id token first", async () => {
    const next = vi.fn();
    vi.mocked(verifySessionToken).mockReturnValue({
      userId: "header-user",
      sessionVersion: 1,
      expiresAt: Date.now() + 1_000,
    });
    vi.mocked(isSessionAllowed).mockResolvedValue(true);

    const req = request({ "x-user-id": "raw-token" });
    sessionAuth(req, {} as never, next);
    await nextTick();

    expect(req.headers["x-user-id"]).toBe("header-user");
    expect(getSessionAuthenticationSource(req)).toBe("header");
    expect(getSessionAuthenticationPrincipal(req)).toMatchObject({
      userId: "header-user",
      sessionVersion: 1,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("falls back to auth session cookie when header is absent", async () => {
    const next = vi.fn();
    vi.mocked(verifySessionToken).mockImplementation((token: unknown) =>
      token === "cookie-token" ? { userId: "cookie-user", sessionVersion: 1, expiresAt: Date.now() + 1_000 } : null
    );
    vi.mocked(isSessionAllowed).mockResolvedValue(true);

    const req = request({ cookie: `${AUTH_SESSION_COOKIE_NAME}=cookie-token` });
    sessionAuth(req, {} as never, next);
    await nextTick();

    expect(req.headers["x-user-id"]).toBe("cookie-user");
    expect(getSessionAuthenticationSource(req)).toBe("cookie");
    expect(getSessionAuthenticationPrincipal(req)).toMatchObject({
      userId: "cookie-user",
      sessionVersion: 1,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("운영에서는 유효한 토큰이어도 레거시 Domain 쿠키로 인증하지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const next = vi.fn();
    vi.mocked(verifySessionToken).mockReturnValue({
      userId: "attacker-user", sessionVersion: 1, expiresAt: Date.now() + 1_000,
    });
    const req = request({ cookie: `${AUTH_SESSION_COOKIE_NAME}=signed-attacker-token` });
    sessionAuth(req, {} as never, next);
    await nextTick();
    expect(verifySessionToken).not.toHaveBeenCalled();
    expect(isSessionAllowed).not.toHaveBeenCalled();
    expect(getSessionAuthenticationPrincipal(req)).toBeNull();
    expect(next).toHaveBeenCalledOnce();
  });

  it("운영에서는 선행 레거시 쿠키와 관계없이 __Host- 쿠키의 사용자를 인증한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const next = vi.fn();
    vi.mocked(verifySessionToken).mockReturnValue({
      userId: "host-user", sessionVersion: 1, expiresAt: Date.now() + 1_000,
    });
    vi.mocked(isSessionAllowed).mockResolvedValue(true);
    const req = request({ cookie: `${AUTH_SESSION_COOKIE_NAME}=attacker-token; ${resolveSessionCookieName()}=host-token` });
    sessionAuth(req, {} as never, next);
    await nextTick();
    expect(verifySessionToken).toHaveBeenCalledExactlyOnceWith("host-token");
    expect(getSessionAuthenticationPrincipal(req)?.userId).toBe("host-user");
  });

  it("clears auth header when neither header nor cookie are valid", async () => {
    const next = vi.fn();
    vi.mocked(verifySessionToken).mockReturnValue(null);
    vi.mocked(isSessionAllowed).mockResolvedValue(false);

    const req = request({});
    sessionAuth(req, {} as never, next);
    await nextTick();

    expect(req.headers).toEqual({});
    expect(getSessionAuthenticationSource(req)).toBeNull();
    expect(getSessionAuthenticationPrincipal(req)).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("propagates lifecycle dependency failures instead of logging the user out", async () => {
    const next = vi.fn();
    const dependencyError = new Error("database unavailable");
    vi.mocked(verifySessionToken).mockReturnValue({
      userId: "existing-user",
      sessionVersion: 1,
      expiresAt: Date.now() + 1_000,
    });
    vi.mocked(isSessionAllowed).mockRejectedValue(dependencyError);

    const req = request({ cookie: `${AUTH_SESSION_COOKIE_NAME}=cookie-token` });
    sessionAuth(req, {} as never, next);
    await nextTick();

    expect(req.headers["x-user-id"]).toBeUndefined();
    expect(getSessionAuthenticationSource(req)).toBeNull();
    expect(getSessionAuthenticationPrincipal(req)).toBeNull();
    expect(next).toHaveBeenCalledWith(dependencyError);
  });

  it("falls back to a valid cookie and records cookie auth after an invalid header", async () => {
    const next = vi.fn();
    vi.mocked(verifySessionToken).mockImplementation((token: unknown) =>
      token === "cookie-token"
        ? {
            userId: "cookie-user",
            sessionVersion: 1,
            expiresAt: Date.now() + 1_000,
          }
        : null,
    );
    vi.mocked(isSessionAllowed).mockResolvedValue(true);

    const req = request({
      "x-user-id": "invalid-header-token",
      cookie: `${AUTH_SESSION_COOKIE_NAME}=cookie-token`,
    });
    sessionAuth(req, {} as never, next);
    await nextTick();

    expect(req.headers["x-user-id"]).toBe("cookie-user");
    expect(getSessionAuthenticationSource(req)).toBe("cookie");
    expect(getSessionAuthenticationPrincipal(req)).toMatchObject({
      userId: "cookie-user",
      sessionVersion: 1,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("session cookie parser export parity", () => {
  it("returns configured auth cookie when present", () => {
    expect(resolveSessionCookieValue("a=1; b=2")).toBeNull();
    expect(resolveSessionCookieValue(`${AUTH_SESSION_COOKIE_NAME}=v`)).toBe("v");
  });
});
