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

  // 경로가 `//host` 로 시작하면 `new URL(경로, 기준)` 이 scheme-relative URL 로 해석해
  // 다른 출처로 보내 버린다(열린 리다이렉트). 어떤 요청 경로도 정본 출처를 벗어나면 안 된다.
  it.each([
    ["https://toonstudio.cloud//evil.example/phish?next=1", "https://www.toonstudio.cloud/evil.example/phish?next=1"],
    ["https://toonstudio.cloud///evil.example/", "https://www.toonstudio.cloud/evil.example/"],
    ["https://toonstudio.cloud/\\evil.example/phish", "https://www.toonstudio.cloud/evil.example/phish"],
    ["https://toonstudio.cloud/\\\\evil.example", "https://www.toonstudio.cloud/evil.example"],
    ["https://toonstudio.cloud//evil.example@www.toonstudio.cloud/", "https://www.toonstudio.cloud/evil.example@www.toonstudio.cloud/"],
    ["https://toonstudio.cloud/%2f%2fevil.example/x", "https://www.toonstudio.cloud/%2f%2fevil.example/x"],
  ])("선행 슬래시가 여러 개인 경로로 다른 출처에 리다이렉트하지 않는다: %s", (requestUrl, expected) => {
    const response = canonicalRedirect(new Request(requestUrl));
    const location = response.headers.get("location") ?? "";
    expect(new URL(location).origin).toBe(CANONICAL_ORIGIN);
    expect(location).toBe(expected);
  });

  it("루트 경로와 쿼리는 그대로 정본 출처로 보낸다", () => {
    const response = canonicalRedirect(new Request("https://toonstudio.cloud/?utm=a"));
    expect(response.headers.get("location")).toBe("https://www.toonstudio.cloud/?utm=a");
  });
});
