import { describe, expect, it } from "vitest";

import { CANONICAL_ORIGIN, canonicalRedirect } from "./index";

describe("toonstudio apex canonical redirect", () => {
  it("preserves path and query while forcing the canonical origin", async () => {
    const response = canonicalRedirect(
      new Request(
        "https://toonstudio.cloud/production/projects/demo%20one?tab=review&mode=full",
      ),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://www.toonstudio.cloud/production/projects/demo%20one?tab=review&mode=full",
    );
    expect(response.headers.get("x-toonstudio-canonical-origin")).toBe(
      CANONICAL_ORIGIN,
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=3600",
    );
    expect(response.headers.get("strict-transport-security")).toContain(
      "includeSubDomains",
    );
    expect(await response.text()).toBe("");
  });

  it.each(["GET", "HEAD", "POST"])(
    "uses method-preserving 308 for %s requests",
    (method) => {
      const response = canonicalRedirect(
        new Request("https://toonstudio.cloud/studio", {
          method,
          body: method === "POST" ? "payload" : undefined,
        }),
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(
        "https://www.toonstudio.cloud/studio",
      );
    },
  );

  // 요청 경로가 `//`로 시작하면 `new URL("//host/..", base)`가 스킴 상대 URL(권한부)로 해석돼
  // 정본 도메인을 벗어난다. apex 도메인이 신뢰 도메인으로 외부 피싱 사이트를 중계하는 오픈
  // 리다이렉트(CWE-601)가 되므로, 어떤 경로 모양이든 목적지는 정본 Origin에 머물러야 한다.
  it.each([
    ["https://toonstudio.cloud//evil.example/phish?x=1", "//evil.example/phish", "?x=1"],
    ["https://toonstudio.cloud///evil.example/phish", "///evil.example/phish", ""],
    ["https://toonstudio.cloud/\\evil.example/phish", "//evil.example/phish", ""],
    ["https://toonstudio.cloud/\\\\evil.example", "///evil.example", ""],
    ["https://toonstudio.cloud//evil.example@www.toonstudio.cloud/", "//evil.example@www.toonstudio.cloud/", ""],
  ])("does not turn a protocol-relative path into an off-site redirect: %s", (requestUrl, path, search) => {
    const response = canonicalRedirect(new Request(requestUrl));
    const location = response.headers.get("location") ?? "";
    const target = new URL(location);

    expect(target.origin).toBe(CANONICAL_ORIGIN);
    expect(target.hostname).toBe("www.toonstudio.cloud");
    expect(target.username).toBe("");
    expect(target.pathname).toBe(path);
    expect(target.search).toBe(search);
    expect(response.status).toBe(308);
  });

  it("never reflects an untrusted host into the redirect target", () => {
    const response = canonicalRedirect(
      new Request("https://attacker.invalid/path?next=https://evil.invalid"),
    );
    const location = response.headers.get("location");
    expect(location).toBe(
      "https://www.toonstudio.cloud/path?next=https://evil.invalid",
    );
    expect(new URL(location ?? "").origin).toBe(CANONICAL_ORIGIN);
  });
});
