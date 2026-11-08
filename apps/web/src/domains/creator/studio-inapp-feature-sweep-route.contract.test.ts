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


it("펜 선택으로 닫힌 메뉴를 다시 펼친 뒤 설정을 연다", () => {
  const helper = sweep.slice(sweep.indexOf("async function openDrawSettings"), sweep.indexOf("async function openBrushLibrary"));
  expect(helper.indexOf("await clickInView(pen)")).toBeLessThan(helper.indexOf("await expandWorkRow(page)"));
});

it("접힌 메뉴 도구도 사용자와 같은 펼치기와 선택 확인을 거친다", () => {
  for (const label of ["선택", "픽셀", "채우기", "도형"]) expect(sweep).toContain('selectWorkspaceTool(page, "' + label + '")');
  const helper = sweep.slice(sweep.indexOf("async function selectWorkspaceTool"), sweep.indexOf("const STEPS:"));
  expect(helper).toContain("await expandWorkRow(page)");
  expect(helper).toContain('includeHidden: true');
  expect(helper).toContain('getAttribute("aria-pressed")');
});

it("모바일 페이지·색상·독립 포즈 화면의 현재 UI 계약을 따른다", () => {
  expect(sweep).not.toContain('button[data-studio-primary-action="pages"]');
  expect(sweep).toContain('button[aria-controls="studio-mobile-pages-sheet"]');
  expect(sweep).toContain('[data-studio-mobile-color-controls="true"]');
  expect(sweep).toContain('name: "헥스 색상 코드"');
  expect(sweep).toContain('getAttribute("data-studio-primary-color")');
  expect(sweep).not.toContain('name: /^색상 #/u');
  expect(sweep).toContain('data-testid="studio-poser-varco3d-workbench-toggle"');
  expect(sweep).not.toContain('force: true');
});
