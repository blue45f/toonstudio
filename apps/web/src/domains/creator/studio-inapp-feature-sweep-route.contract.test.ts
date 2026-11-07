import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sweep = readFileSync(
  new URL("../../../../../scripts/verify-studio-inapp-feature-sweep.mts", import.meta.url),
  "utf8",
);

describe("Studio in-app feature sweep route contract", () => {
  it("boots the real canvas editor before exercising editing controls", () => {
    expect(sweep).toContain('page.goto(`${baseUrl}/studio/canvas`');
    expect(sweep).toContain('waitForServer(`${baseUrl}/studio/canvas`)');
    expect(sweep).not.toContain('page.goto(`${baseUrl}/studio`, { waitUntil: "domcontentloaded", timeout: 30_000 });');
  });
});

it("브러시 설정 검증은 작업 메뉴를 먼저 펼치는 공통 진입을 사용한다", () => {
  const helper = sweep.slice(sweep.indexOf("async function openDrawSettings"), sweep.indexOf("async function openBrushLibrary"));
  expect(helper.indexOf("await expandWorkRow(page)")).toBeGreaterThan(-1);
  expect(helper.indexOf("await expandWorkRow(page)")).toBeLessThan(helper.indexOf('const settings ='));
  const step = sweep.slice(sweep.indexOf('id: "brush-settings-open"'), sweep.indexOf('id: "brush-size-and-opacity"'));
  expect(step).toContain("await openDrawSettings(page)");
  expect(step).not.toContain("brush settings chip");
});
