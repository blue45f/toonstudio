import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_SESSION_COOKIE_NAME,
  resolveSessionCookieClearOptions,
  resolveSessionCookieName,
  resolveSessionCookieOptions,
  resolveSessionCookieValue,
} from "./session-cookie";

describe("auth session cookie parser", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "test"));
  afterEach(() => vi.unstubAllEnvs());

  it("extracts the configured cookie value from a raw Cookie header", () => {
    expect(
      resolveSessionCookieValue(
        `other=1; ${AUTH_SESSION_COOKIE_NAME}=abc.123; path=/;`,
      ),
    ).toBe("abc.123");
  });

  it("supports repeated header arrays by concatenating entries", () => {
    expect(
      resolveSessionCookieValue(
        [
          `other=1; ${AUTH_SESSION_COOKIE_NAME}=from-first`,
          `${AUTH_SESSION_COOKIE_NAME}=from-second`,
        ],
      ),
    ).toBe("from-first");
  });

  it("returns null when cookie is absent", () => {
    expect(resolveSessionCookieValue(`other=1; demo=x`)).toBeNull();
    expect(resolveSessionCookieValue(undefined)).toBeNull();
  });

  it("운영에서는 __Host- 쿠키의 필수 속성을 발급과 삭제에 똑같이 적용한다", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveSessionCookieName()).toBe("__Host-toonstudio-auth-session");
    expect(resolveSessionCookieOptions()).toMatchObject({
      secure: true, httpOnly: true, path: "/", sameSite: "lax",
    });
    expect(resolveSessionCookieOptions()).not.toHaveProperty("domain");
    expect(resolveSessionCookieClearOptions()).toEqual({
      ...resolveSessionCookieOptions(), maxAge: 0,
    });
  });

  it("운영에서는 앞에 삽입된 레거시 Domain 쿠키를 무시하고 호스트 쿠키만 읽는다", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveSessionCookieValue(`${AUTH_SESSION_COOKIE_NAME}=injected`)).toBeNull();
    expect(resolveSessionCookieValue(
      `${AUTH_SESSION_COOKIE_NAME}=injected; __Host-toonstudio-auth-session=trusted`,
    )).toBe("trusted");
  });

  it("로컬 HTTP 개발은 기존 이름과 비 Secure 쿠키를 유지한다", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveSessionCookieName()).toBe(AUTH_SESSION_COOKIE_NAME);
    expect(resolveSessionCookieOptions()).toMatchObject({ secure: false, path: "/" });
    expect(resolveSessionCookieValue(`${AUTH_SESSION_COOKIE_NAME}=local`)).toBe("local");
    expect(resolveSessionCookieValue("__Host-toonstudio-auth-session=other")).toBeNull();
  });
});
