import { describe, expect, it } from "vitest";

import { collectStudioShellFontUrls } from "./studio-offline-drawing-assets";

describe("오프라인 셸 글꼴의 배포 범위", () => {
  const sheet = "/fonts/pretendard/v1.3.9/shell.css";
  const html = `<link href="/other.css"><link href="${sheet}"><link href="${sheet}">`;
  it("실제 셸 CSS의 같은 버전 상대·절대 글꼴만 중복 없이 준비한다", () => {
    const urls = collectStudioShellFontUrls(html, () => `src:url(one.woff2);src:url('/fonts/pretendard/v1.3.9/two.woff2');src:url(one.woff2);`);
    expect(urls).toEqual([sheet, "/fonts/pretendard/v1.3.9/one.woff2", "/fonts/pretendard/v1.3.9/two.woff2"]);
  });
  it.each(["https://elsewhere.example/one.woff2", "../v1.0/one.woff2", "/api/private", "one.woff2?x=1"])(
    "셸 글꼴 CSS가 승인된 버전 경계를 벗어나면 빌드를 중단한다 (%s)", (reference) => {
      expect(() => collectStudioShellFontUrls(html, () => `src:url(${reference})`)).toThrow(/배포 경로/u);
    },
  );
});
