import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./verify-studio-brush-media.mts", import.meta.url), "utf8");
const drawingUiSource = readFileSync(new URL("./lib/studio-brush-drawing-ui.ts", import.meta.url), "utf8");

function between(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe("Studio 브러시 품질 검증의 실제 UI 진입", () => {
  it("잉크 측정 전에 시작 안내를 실제 버튼으로 닫고 사라진 것을 확인한다", () => {
    const preparation = between("async function prepareStudioPage(", "async function selectBrush(");
    expect(preparation).toContain("await prepareStudioBrushDrawingUi(page)");
    expect(drawingUiSource).toContain('[data-studio-cinematic-canvas-welcome]');
    expect(drawingUiSource).toContain("/^(바로 그리기|Draw now)$/u");
    expect(drawingUiSource).toContain("/^(시작 안내 닫기|Close start guide)$/u");
    expect(drawingUiSource).toContain('await welcome.waitFor({ state: "hidden", timeout: 10_000 })');
    expect(drawingUiSource.indexOf('await welcome.waitFor({ state: "hidden"'))
      .toBeLessThan(drawingUiSource.indexOf('await page.keyboard.press("b")'));
    expect(preparation + drawingUiSource).not.toContain("addStyleTag");
    expect(preparation + drawingUiSource).not.toContain(".remove()");
  });

  it("내부 id 대신 화면 이름을 검색하고 같은 브러시를 선택했는지 확인한다", () => {
    const selection = between("async function selectBrush(", "function escapeRegExp(");
    expect(selection).toContain('.fill(brush.name)');
    expect(selection).not.toContain('.fill(brush.id)');
    expect(selection).toContain('name: `${brush.name} 선택`');
    expect(selection).toContain('^현재 도구 ${escapeRegExp(brush.name)},');
  });

  it("캡처 영역·픽셀 비교·settle 예산을 그대로 유지한다", () => {
    expect(source).toContain("const SETTLE_MS = 340");
    expect(source).toContain('return page.screenshot({ animations: "disabled", clip })');
    expect(source).toContain("compareFrames(page, settled, redo, 6)");
    expect(source).toContain("evaluateStudioBrushMediaCase(policy, metrics)");
  });
});
