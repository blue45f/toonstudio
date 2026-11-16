import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
describe("production canvas diagnostic entry", () => {
  it.each(["./verify-studio-canvas-chrome.mts", "./verify-studio-canvas-surfaces.mts"])("opens the drawing route rather than testing the workspace home in %s", (file) => {
    const verifier = source(file);
    expect(verifier).toContain('const studioUrl = `${origin}studio/canvas`;');
    expect(verifier).not.toContain('const studioUrl = `${origin}studio`;');
    expect(verifier).toContain('await page.goto(studioUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });');
    expect(verifier).toContain('[data-studio-canvas-viewport]');
  });
  it("keeps canvas chrome and save-state reachability assertions", () => {
    const verifier = source("./verify-studio-canvas-chrome.mts");
    for (const condition of ["!metrics.reliabilityIdleRowPresent", "!metrics.reliabilityRailInFlow", "mobile.metrics.noticeStripFlowHeight === 0"])
      expect(verifier).toContain(condition);
    expect(verifier).toContain("const reliabilityReachable = await verifyReliabilityAccess(page);");
    expect(verifier).toMatch(/invariant\(\s*reliabilityReachable,/);

    // 정상 상태의 More 진입과 실패 상태 칩 모두 실제 진단을 열고 원래 캔버스로 복귀해야 한다.
    const access = verifier.match(/async function verifyReliabilityAccess\([\s\S]+?\n\}/)?.[0];
    expect(access).toBeDefined();
    for (const contract of [
      "const before = await viewport.boundingBox();",
      "page.locator('[data-studio-reliability-chip]').filter({ visible: true })",
      'await (await visibleStudioControl(chip, "저장·화면 상태")).click()',
      'else await runStudioClarityAction(page, "status")',
      'page.getByRole("dialog", { name: "저장·화면 문제 해결", exact: true })',
      'for (const channel of ["save", "gpu", "storage"])',
      'await dialog.locator(`[data-studio-reliability-detail-channel="${channel}"]`).waitFor({ state: "visible" })',
      'await page.keyboard.press("Escape")',
      'await dialog.waitFor({ state: "hidden" })',
      "const after = await viewport.boundingBox();",
      "invariant(before !== null && after !== null",
      "document.activeElement?.matches(",
      '[data-studio-clarity-more-trigger="true"], [data-studio-reliability-chip]',
      "invariant(focusRestored,",
    ]) expect(access).toContain(contract);
    for (const coordinate of ["x", "y", "width", "height"])
      expect(access).toContain(`Math.abs(before.${coordinate} - after.${coordinate}) <= 1`);
  });
  it("retains all DPR, allocation and tool-transition checks", () => {
    const verifier = source("./verify-studio-canvas-surfaces.mts");
    expect(verifier).toContain("STUDIO_CANVAS_SURFACE_MAX_BACKING_PIXEL_RATIO = 20.5");
    expect(verifier).toContain("STUDIO_CANVAS_SURFACE_TOOL_TRANSITION_CYCLES = 3");
    for (const dpr of ["dpr-1", "dpr-1.5", "dpr-2"]) expect(verifier).toContain(dpr);
    expect(verifier).toContain("await waitForStableHydratedEditor(page)");
    expect(verifier).toContain("await exerciseToolTransitions(page)");
    expect(verifier).toContain("collectStudioCanvasSurfaceContractFailures");
  });
});
