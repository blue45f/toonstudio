import { expect, test } from "@playwright/test";

import {
  oauthLinkSessionCookieName, oauthPkceVerifierCookieName, oauthStateCookieName,
  resolveOAuthLinkSessionCookieValue, resolveOAuthPkceVerifierCookieValue, resolveOAuthStateCookieValue,
} from "../apps/api/src/oauth-state-cookie";
import { resolveSessionCookieName, resolveSessionCookieValue } from "../apps/api/src/session-cookie";

test("하위 도메인 iframe의 상위 Domain 쿠키가 운영 세션을 바꾸지 못한다", async ({ context, page }) => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const mainOrigin = "https://www.toonstudio.cloud";
  const displayOrigin = "https://untrusted.toonstudio.cloud";
  let receivedCookies = "";
  try {
    const oauthNames = [oauthStateCookieName("github"), oauthPkceVerifierCookieName("github"), oauthLinkSessionCookieName("apple")];
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (request.url().startsWith(`${mainOrigin}/api/`)) {
        receivedCookies = (await request.allHeaders()).cookie ?? "";
        await route.fulfill({ contentType: "application/json", body: "{}" });
      } else if (request.url().startsWith(displayOrigin)) {
        await route.fulfill({
          contentType: "text/html; charset=utf-8",
          headers: { "Content-Security-Policy": `frame-ancestors 'self' ${mainOrigin}` },
          body: "<!doctype html><title>하위 도메인 테스트 화면</title><body>하위 도메인 테스트 화면</body>",
        });
      } else {
        await route.fulfill({ contentType: "text/html; charset=utf-8", body: `<iframe title="하위 도메인 테스트" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-pointer-lock allow-modals" src="${displayOrigin}/"></iframe>` });
      }
    });
    for (const name of ["toonstudio-auth-session", resolveSessionCookieName(), ...oauthNames]) {
      await context.addCookies([{
        name, value: "host-session-fixture", url: mainOrigin,
        httpOnly: true, secure: true, sameSite: "Lax",
      }]);
    }
    await page.goto(mainOrigin);
    const display = page.frameLocator('iframe[title="하위 도메인 테스트"]');
    await expect(display.locator("body")).toHaveText("하위 도메인 테스트 화면");
    await display.locator("html").evaluate((_element, names) => {
      document.cookie = "toonstudio-auth-session=attacker-fixture; Domain=toonstudio.cloud; Path=/api; Secure; SameSite=Lax";
      document.cookie = "__Host-toonstudio-auth-session=attacker-fixture; Domain=toonstudio.cloud; Path=/; Secure; SameSite=Lax";
      for (const name of names) {
        document.cookie = `${name}=attacker-fixture; Domain=toonstudio.cloud; Path=/; Secure; SameSite=Lax`;
        document.cookie = `${name.replace(/^__Host-/u, "")}=attacker-fixture; Domain=toonstudio.cloud; Path=/api; Secure; SameSite=Lax`;
      }
    }, oauthNames);
    await page.evaluate(async () => { await fetch("/api/auth/session"); });
    expect(receivedCookies).toMatch(/^toonstudio-auth-session=attacker-fixture;/u);
    for (const name of oauthNames) {
      expect(receivedCookies).toContain(`${name.replace(/^__Host-/u, "")}=attacker-fixture`);
    }
    expect(resolveSessionCookieValue(receivedCookies)).toBe("host-session-fixture");
    expect(resolveOAuthStateCookieValue(receivedCookies, "github")).toBe("host-session-fixture");
    expect(resolveOAuthPkceVerifierCookieValue(receivedCookies, "github")).toBe("host-session-fixture");
    expect(resolveOAuthLinkSessionCookieValue(receivedCookies, "apple")).toBe("host-session-fixture");
    const allCookies = await context.cookies(`${mainOrigin}/api/auth/session`);
    expect(allCookies.filter((cookie) => oauthNames.includes(cookie.name))).toHaveLength(3);
    expect(allCookies.some((cookie) => cookie.name.startsWith("__Host-") && cookie.value === "attacker-fixture")).toBe(false);
    expect((await context.cookies(displayOrigin)).some((cookie) => cookie.name.startsWith("__Host-"))).toBe(false);
    const authCookies = (await context.cookies(`${mainOrigin}/api/auth/session`))
      .filter((cookie) => cookie.name === resolveSessionCookieName());
    expect(authCookies).toMatchObject([{
      domain: "www.toonstudio.cloud", path: "/", value: "host-session-fixture", httpOnly: true,
    }]);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
