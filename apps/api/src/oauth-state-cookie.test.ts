import { afterEach, describe, expect, it, vi } from "vitest";

import {
  oauthLinkSessionCookieName,
  oauthPkceVerifierCookieName,
  oauthStateCookieName,
  resolveOAuthLinkSessionCookieClearOptions,
  resolveOAuthLinkSessionCookieOptions,
  resolveOAuthLinkSessionCookieValue,
  resolveOAuthPkceVerifierCookieClearOptions,
  resolveOAuthPkceVerifierCookieOptions,
  resolveOAuthPkceVerifierCookieValue,
  resolveOAuthStateCookieClearOptions,
  resolveOAuthStateCookieOptions,
  resolveOAuthStateCookieValue,
} from "./oauth-state-cookie";

const cookieKinds = [
  { kind: "state", name: oauthStateCookieName, options: resolveOAuthStateCookieOptions,
    clear: resolveOAuthStateCookieClearOptions, read: resolveOAuthStateCookieValue },
  { kind: "pkce", name: oauthPkceVerifierCookieName, options: resolveOAuthPkceVerifierCookieOptions,
    clear: resolveOAuthPkceVerifierCookieClearOptions, read: resolveOAuthPkceVerifierCookieValue },
  { kind: "link-session", name: oauthLinkSessionCookieName, options: resolveOAuthLinkSessionCookieOptions,
    clear: resolveOAuthLinkSessionCookieClearOptions, read: resolveOAuthLinkSessionCookieValue },
];

afterEach(() => vi.unstubAllEnvs());

describe.each(cookieKinds)("OAuth $kind 쿠키의 호스트 격리", ({ kind, name, options, clear, read }) => {
  it.each(["google", "apple", "kakao", "naver", "github"] as const)("운영 %s 쿠키는 상위 Domain 쿠키를 받지 않는다", (provider) => {
    vi.stubEnv("NODE_ENV", "production");
    const legacyName = `toonstudio-oauth-${kind}-${provider}`;
    expect(name(provider)).toBe(`__Host-${legacyName}`);
    expect(options(provider)).toMatchObject({
      httpOnly: true, secure: true, path: "/", sameSite: provider === "apple" ? "none" : "lax",
    });
    expect(options(provider)).not.toHaveProperty("domain");
    expect(clear(provider)).toEqual({ ...options(provider), maxAge: 0 });
    expect(read(`${legacyName}=attacker`, provider)).toBeNull();
    expect(read(`${legacyName}=attacker; ${name(provider)}=host%2Dflow`, provider)).toBe("host-flow");
  });

  it("개발 환경의 기존 이름과 공급자 경로를 유지한다", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(name("github")).toBe(`toonstudio-oauth-${kind}-github`);
    expect(options("github").path).toBe("/api/auth/oauth/github");
    expect(read(`${name("github")}=local-flow`, "github")).toBe("local-flow");
  });
});
