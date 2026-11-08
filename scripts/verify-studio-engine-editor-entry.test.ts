import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveStudioRoute } from "../apps/web/src/domains/creator/studio-router/studio-route-manifest";

const verifiers = [
  "verify-studio-hokusai-live-integration.mts",
  "verify-studio-living-ink-integration.mts",
  "verify-studio-hybrid-dcc-integration.mts",
] as const;

describe("production engine verifier entry", () => {
  it.each(verifiers)("%s enters the shipped canvas instead of the project home", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const suffix = source.match(/const studioUrl = `\$\{origin\}([^`]+)`;/u)?.[1];
    expect(suffix).toBe("studio/canvas");
    const url = new URL(suffix ?? "", "http://127.0.0.1:5199/");
    expect(resolveStudioRoute({ pathname: url.pathname })).toMatchObject({ kind: "editor" });
  });

  it("does not confuse the project home with an editor", () => {
    expect(resolveStudioRoute({ pathname: "/studio" }).kind).not.toBe("editor");
  });

  it.each([
    "verify-studio-brush-media.mts",
    "verify-studio-hokusai-live-integration.mts",
    "verify-studio-living-ink-integration.mts",
  ])("%s는 도킹 패널을 확장하고 해당 팝업의 닫힘만 기다린다", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source).toContain('[data-studio-brush-workbench-dock="true"]');
    expect(source).toContain('await dock.waitFor({ state: "visible" })');
    expect(source).toContain('await dock.getByRole("button", { name: "확장 보기", exact: true }).click()');
    if (file === "verify-studio-brush-media.mts") {
      expect(source).toContain('import { prepareStudioBrushDrawingUi } from "./lib/studio-brush-drawing-ui"');
      const preparation = source.match(/async function prepareStudioPage\([^]*?\n\}/u)?.[0] ?? "";
      expect(preparation).toContain("await prepareStudioBrushDrawingUi(page)");
      const drawingUi = readFileSync(new URL("lib/studio-brush-drawing-ui.ts", import.meta.url), "utf8");
      const readinessCall = "await waitForStudioDrawingReady(page, { requireWelcome: true })";
      expect(drawingUi).toContain("export async function prepareStudioBrushDrawingUi(page: Page)");
      expect(drawingUi).toContain(readinessCall);
      expect(drawingUi.indexOf(readinessCall)).toBeLessThan(drawingUi.indexOf('await page.keyboard.press("b")'));
      expect(source).toContain('const catalog = page.getByRole("dialog", { name: "브러시 전체 라이브러리" })');
    } else {
      expect(source).toContain("await waitForStudioDrawingReady(page");
      expect(source).toMatch(/page\.locator\('\[role="dialog"\]\[data-studio-brush-floating\]'\)\s*\.locator\('\[data-studio-brush-catalog-session="true"\]'\)/u);
    }
  });

  it("builds the exact production bundle before engine preview probes", () => {
    const workflow = readFileSync(new URL("../.github/workflows/main-full-qa-fast-diagnostics.yml", import.meta.url), "utf8");
    const job = workflow.split("  engine-extended:")[1]?.split("  studio-browser-core:")[0] ?? "";
    const buildAt = job.indexOf("run: pnpm run build:bundle");
    const previewAt = job.indexOf("pnpm run verify:studio-hokusai-live-integration");
    expect(buildAt).toBeGreaterThanOrEqual(0);
    expect(previewAt).toBeGreaterThan(buildAt);
    for (const command of [
      "verify:studio-hokusai-wasm", "verify:studio-hokusai-natural-media-quality",
      "verify:studio-hokusai-live-integration", "verify:studio-living-ink-execution",
      "verify:studio-living-ink-integration", "verify:studio-hybrid-dcc-integration",
    ]) expect(job).toContain(`pnpm run ${command}`);
    expect(job).not.toContain("continue-on-error");
    expect(job).not.toContain("|| true");
  });
  it("executes each engine regression exactly once through the mandatory portfolio", () => {
    const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
    const staticJob = workflow.split("  static:")[1]?.split("  serial:")[0] ?? "";
    const portfolio = readFileSync(
      new URL("ci-required-vitest-targets.txt", import.meta.url),
      "utf8",
    )
      .trim()
      .split(/\r?\n/u)
      .filter(Boolean);

    expect(staticJob).toContain('node scripts/ci-core-regression-shards.mjs "${{ matrix.shard }}"');
    for (const target of [
      "scripts/verify-studio-engine-editor-entry.test.ts",
      "scripts/verify-studio-hokusai-live-integration.test.ts",
      "scripts/verify-studio-living-ink-integration.test.ts",
      "scripts/verify-studio-hybrid-dcc-integration.test.ts",
      "scripts/verify-studio-hybrid-dcc-opfs-race.test.ts",
    ]) {
      expect(
        portfolio.filter((entry) => entry === target),
        `${target} must remain mandatory without duplicate execution`,
      ).toHaveLength(1);
    }
  });
});
