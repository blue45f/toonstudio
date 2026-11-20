import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sweep = readFileSync(
  new URL("../../../../../scripts/verify-studio-inapp-feature-sweep.mts", import.meta.url),
  "utf8",
);
const entry = readFileSync(
  new URL("../../../../../scripts/lib/studio-verifier-entry-points.ts", import.meta.url),
  "utf8",
);
const interactions = readFileSync(
  new URL("../../../../../scripts/lib/studio-inapp-sweep-interactions.ts", import.meta.url),
  "utf8",
);

describe("Studio in-app feature sweep route contract", () => {
  it("boots the real canvas editor before exercising editing controls", () => {
    expect(sweep).toContain('page.goto(`${baseUrl}/studio/canvas`');
    expect(sweep).toContain('waitForServer(`${baseUrl}/studio/canvas`)');
    expect(sweep).not.toContain('page.goto(`${baseUrl}/studio`, { waitUntil: "domcontentloaded", timeout: 30_000 });');
  });
});

it("브러시 설정 검증은 현재 펜 재클릭의 공통 진입으로 같은 설정 시트를 연다", () => {
  const helper = sweep.slice(sweep.indexOf("async function openDrawSettings"), sweep.indexOf("async function openBrushLibrary"));
  expect(helper).toContain("return openStudioMobileDrawSettings(page)");
  expect(entry).toContain('button[data-studio-primary-action="draw"]');
  expect(entry).toContain('page.locator("#studio-mobile-draw-settings")');
  expect(entry).toContain('name: "브러시 굵기 슬라이더"');
  const step = sweep.slice(sweep.indexOf('id: "brush-settings-open"'), sweep.indexOf('id: "brush-size-and-opacity"'));
  expect(step).toContain("await openDrawSettings(page)");
  expect(step).not.toContain("brush settings chip");
});


it("펜 선택 완료를 확인한 뒤 같은 펜으로 설정을 열며 삭제된 작업 토글을 요구하지 않는다", () => {
  const helper = entry.slice(entry.indexOf("export async function openStudioMobileDrawSettings"));
  const selection = helper.indexOf('getAttribute("aria-pressed")');
  const expanded = helper.indexOf('getAttribute("aria-expanded")');
  expect(selection).toBeGreaterThan(-1);
  expect(expanded).toBeGreaterThan(selection);
  expect(helper).toContain('[aria-pressed="true"]');
  expect(helper).not.toContain("data-studio-mobile-workspace-toggle");
});

it("현재 전체 도구로 실제 선택한 뒤 기존 정본 도크의 활성 상태를 확인한다", () => {
  for (const label of ["선택", "펜", "픽셀", "지우개", "채우기", "도형"]) expect(sweep).toContain('selectWorkspaceTool(page, "' + label + '")');
  const helper = sweep.slice(sweep.indexOf("async function selectWorkspaceTool"), sweep.indexOf("const STEPS:"));
  expect(helper).toContain("await useCatalogTool(page, STUDIO_SWEEP_TOOLS[name])");
  expect(helper).toContain("studioSweepToolState(page, name)");
  expect(helper).toContain("await assertStudioSweepTool(page, name)");
  expect(interactions).toContain('includeHidden: true');
  expect(helper).toContain('getAttribute("aria-pressed")');
  const catalog = sweep.slice(sweep.indexOf("async function useCatalogTool"), sweep.indexOf("async function selectMenuCommand"));
  expect(catalog).toContain("await openStudioAllTools(page)");
  expect(catalog).toContain('name: "전체 도구 검색"');
  expect(catalog).toContain('button[data-studio-catalog-tool-id="${id}"]');
  expect(catalog).toContain('getAttribute("aria-disabled")');
  expect(catalog).toContain("await clickInView(entry, 5_000)");
  expect(catalog).toContain('await catalog.waitFor({ state: "hidden" })');
});

it("각 획은 요청한 모드로 선택된 뒤 실제 문서 기록이 추가되어야 한다", () => {
  const draw = sweep.slice(sweep.indexOf("async function drawStroke"), sweep.indexOf("function dock"));
  expect(draw).toContain("await selectWorkspaceTool(page, tool)");
  expect(draw.indexOf("await studioSweepHistoryAppends(page)")).toBeLessThan(draw.indexOf("await page.mouse.down()"));
  expect(draw.indexOf("await waitForStudioSweepDrawingCommit(page, before)")).toBeGreaterThan(draw.indexOf("await page.mouse.up()"));
  expect(sweep).toContain('drawStroke(page, "픽셀", 12)');
  expect(sweep).toContain('drawStroke(page, "지우개", 12)');
  expect(sweep).toContain('drawStroke(page, "도형", 6)');
  expect(interactions).toContain('getAttribute("data-studio-history-total-appends")');
});

it("모바일 페이지·색상·독립 포즈 화면의 현재 UI 계약을 따른다", () => {
  expect(sweep).not.toContain('button[data-studio-primary-action="pages"]');
  expect(sweep).toContain('await runStudioClarityAction(page, "pages")');
  expect(sweep).toContain('page.locator("#studio-mobile-pages-sheet")');
  expect(sweep).toContain('[data-studio-mobile-color-controls="true"]');
  expect(sweep).toContain('name: "헥스 색상 코드"');
  expect(sweep).toContain('getAttribute("data-studio-primary-color")');
  expect(sweep).not.toContain('name: /^색상 #/u');
  expect(sweep).toContain('data-testid="studio-poser-varco3d-workbench-toggle"');
  expect(sweep).not.toContain('force: true');
});

it("45개 실제 검사 범위와 필터·기록·레이어의 결과 단언을 유지한다", () => {
  const steps = sweep.slice(sweep.indexOf("const STEPS:"), sweep.indexOf("interface ProfileReport"));
  const staticCount = [...steps.matchAll(/\bid: "/gu)].length;
  const routes = [...steps.matchAll(/\.\.\.\(\[([^\]]+)\] as const\)/gu)]
    .flatMap(match => [...match[1]!.matchAll(/"(\/studio\/[^"\n]+)"/gu)].map(route => route[1]));
  expect(staticCount).toBe(34);
  expect(routes).toHaveLength(10);
  expect(steps.match(/createStudioQuickBrushStep\(/gu)).toHaveLength(1);
  expect(staticCount + routes.length + 1).toBe(45);
  expect(entry).toContain('button[aria-controls="studio-mobile-edit-options"]');
  expect(steps.match(/await showStudioMobileEditOptions\(page\)/gu)).toHaveLength(3);
  const history = interactions.slice(interactions.indexOf("export async function verifyStudioSweepUndoRedo"), interactions.indexOf("export async function verifyStudioSweepZoom"));
  expect(steps).toContain("run: verifyStudioSweepUndoRedo");
  expect(history).toContain("await showStudioMobileEditOptions(page)");
  expect(history).toContain("await studioDocumentHistoryButtons(page, label)");
  expect(history).toContain('[["실행취소", depth - 1], ["다시실행", depth]]');
  expect(history).toContain("await page.waitForFunction");
  expect(steps).toContain('verifyStudioSweepZoom(page, (id) => selectMenuCommand(page, "view", id))');
  expect(steps).toContain('[data-studio-clarity-mobile-quick-actions="true"] button');
  expect(steps).not.toContain('page.keyboard.press("Shift+Space")');
  expect(steps).toContain('[data-studio-mobile-filter-select="primary"]');
  expect(steps).toContain('await select.selectOption("brightness-contrast")');
  expect(steps).toContain("expected four draw modes");
  expect(steps).toContain("numeric entry did not update the slider");
  expect(steps).toContain("held filter comparison did not show the original");
  expect(steps).toContain("released filter comparison did not restore the preview");
  expect(steps).toContain("layer comp did not restore captured visibility");
  expect(steps).toContain("renamed layer comp was not saved to the durable OPFS document");
  expect(steps).toContain("quick action wheel did not expose all six slots");
  expect(steps).toContain("windowed history did not close");
  expect(steps).toContain("windowed asset menu did not close");
  expect(steps).not.toContain("{ skipped:");
});
