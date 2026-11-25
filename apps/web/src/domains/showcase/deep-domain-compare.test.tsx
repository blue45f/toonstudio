// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  DEEP_COMPARE_COLUMN_PRESETS,
  DEEP_COMPARE_COMPETITOR_IDS,
  DEEP_COMPARE_DOMAINS,
  DEEP_COMPARE_STATUS_META,
  DEEP_COMPARE_TOOLS,
  computeDomainSummary,
  filterDeepCompareRows,
  getDeepCompareDomain,
  getDeepCompareTool,
  isDeepCompareDomainId,
  parseDeepCompareDomainId,
  type DeepCompareDomainId,
  type DeepCompareRow,
} from "./deep-domain-compare-data";
import { DeepDomainCompareTabsSection } from "./DeepDomainCompareTabsSection";
import { StudioCompetitorBenchmarkPage } from "./StudioCompetitorBenchmarkPage";

import { useI18n } from "@/shared/lib/i18n";

const REPO_ROOT = path.resolve(process.cwd());
const SHOWCASE_DIR = path.join(REPO_ROOT, "apps/web/src/domains/showcase");

function LocationSpy() {
  const location = useLocation();
  return <output data-testid="router-location-search">{location.search}</output>;
}

describe("Wave 53B — Deep 5-domain comparison data & honesty contracts", () => {
  it("exposes exactly 8 tools in canonical order including Magma Studio", () => {
    expect(DEEP_COMPARE_TOOLS.map((tool) => tool.id)).toEqual([
      "toonstudio",
      "magma",
      "csp",
      "procreate",
      "photoshop",
      "rebelle7",
      "blender",
      "ibispaint",
    ]);
    expect(DEEP_COMPARE_COMPETITOR_IDS).toHaveLength(7);
    expect(getDeepCompareTool("magma").name).toBe("Magma Studio");
    expect(getDeepCompareTool("toonstudio").isPinnedBaseline).toBe(true);
  });

  it("exposes 5 domains (brushes, filters, drawing, collab, studio3d) with exact row counts 10/8/8/8/8 (42 rows)", () => {
    expect(DEEP_COMPARE_DOMAINS.map((domain) => domain.id)).toEqual([
      "brushes",
      "filters",
      "drawing",
      "collab",
      "studio3d",
    ]);
    expect(DEEP_COMPARE_DOMAINS.map((domain) => domain.rows.length)).toEqual([10, 8, 8, 8, 8]);
    const totalRows = DEEP_COMPARE_DOMAINS.reduce((sum, domain) => sum + domain.rows.length, 0);
    expect(totalRows).toBe(42);
  });

  it("verifies all 42 evidencePath entries exist on disk", () => {
    for (const domain of DEEP_COMPARE_DOMAINS) {
      for (const item of domain.rows) {
        const diskPath = path.join(REPO_ROOT, item.evidencePath);
        expect(existsSync(diskPath), `${domain.id}/${item.id}: ${item.evidencePath}`).toBe(true);
      }
    }
  });

  it("provides complete ko/en copy across all 42 rows and 336 cells with zero Korean leakage in en", () => {
    for (const domain of DEEP_COMPARE_DOMAINS) {
      expect(domain.title.ko.length).toBeGreaterThan(0);
      expect(domain.title.en).not.toMatch(/[\uAC00-\uD7A3]/u);
      expect(domain.subtitle.en).not.toMatch(/[\uAC00-\uD7A3]/u);
      expect(domain.candidTakeaway.en).not.toMatch(/[\uAC00-\uD7A3]/u);

      for (const item of domain.rows) {
        expect(item.title.ko.length).toBeGreaterThan(0);
        expect(item.title.en).not.toMatch(/[\uAC00-\uD7A3]/u);
        expect(item.toonstudioSpec.ko.length).toBeGreaterThan(0);
        expect(item.toonstudioSpec.en).not.toMatch(/[\uAC00-\uD7A3]/u);

        for (const tool of DEEP_COMPARE_TOOLS) {
          const cell = item.cells[tool.id];
          expect(cell.summary.ko.length).toBeGreaterThan(0);
          expect(cell.summary.en.length).toBeGreaterThan(0);
          expect(cell.summary.en).not.toMatch(/[\uAC00-\uD7A3]/u);
        }
      }
    }
  });

  it("enforces candid ToonStudio statuses (current/partial/target only) with expanding items in every domain", () => {
    const allowedTs = new Set(["current", "partial", "target"]);
    let totalTargets = 0;

    for (const domain of DEEP_COMPARE_DOMAINS) {
      const summary = computeDomainSummary(domain.rows);
      expect(summary.currentCount).toBeGreaterThan(0);
      expect(summary.expandingCount).toBeGreaterThan(0);
      totalTargets += summary.targetCount;

      for (const item of domain.rows) {
        expect(allowedTs.has(item.cells.toonstudio.status), item.id).toBe(true);
      }
    }
    expect(totalTargets).toBeGreaterThanOrEqual(1);
  });

  it("credits verified competitor strengths honestly across Magma, Rebelle 7, CSP, Procreate, Photoshop, Blender & ibisPaint", () => {
    const brushes = getDeepCompareDomain("brushes").rows;
    const filters = getDeepCompareDomain("filters").rows;
    const drawing = getDeepCompareDomain("drawing").rows;
    const collab = getDeepCompareDomain("collab").rows;
    const studio3d = getDeepCompareDomain("studio3d").rows;

    expect(brushes.find((r) => r.id === "brush-crayon-pastel")?.cells.magma.status).toBe("native-strength");
    expect(brushes.find((r) => r.id === "brush-wet-watercolor")?.cells.rebelle7.status).toBe("native-strength");
    expect(brushes.find((r) => r.id === "brush-impasto-oil")?.cells.rebelle7.status).toBe("native-strength");
    expect(brushes.find((r) => r.id === "brush-gpen")?.cells.csp.status).toBe("native-strength");
    expect(brushes.find((r) => r.id === "brush-4b-pencil")?.cells.procreate.status).toBe("native-strength");
    expect(brushes.find((r) => r.id === "brush-screentone")?.cells.ibispaint.status).toBe("native-strength");
    expect(filters.find((r) => r.id === "filter-gradient-map")?.cells.photoshop.status).toBe("native-strength");
    expect(drawing.find((r) => r.id === "draw-10k-bvh-instancing")?.cells.blender.status).toBe("native-strength");
    expect(collab.find((r) => r.id === "collab-crdt-live")?.cells.magma.status).toBe("native-strength");
    expect(collab.find((r) => r.id === "collab-rights-c2pa")?.cells.photoshop.status).toBe("native-strength");
    expect(studio3d.find((r) => r.id === "s3d-browser-set")?.cells.blender.status).toBe("native-strength");
    expect(studio3d.find((r) => r.id === "s3d-surface-paint-4layer")?.cells.procreate.status).toBe("native-strength");
  });

  it("contains zero fabricated FPS numbers, speed multipliers, or fake survey ratios", () => {
    const forbiddenMetricPattern = /\b\d+\s*fps\b|\b\d+x\s*faster\b|\d+%\s*(?:만족|설문|더\s*빠름)/iu;
    for (const domain of DEEP_COMPARE_DOMAINS) {
      expect(domain.subtitle.ko).not.toMatch(forbiddenMetricPattern);
      expect(domain.candidTakeaway.ko).not.toMatch(forbiddenMetricPattern);
      for (const item of domain.rows) {
        expect(item.toonstudioSpec.ko).not.toMatch(forbiddenMetricPattern);
        expect(item.toonstudioSpec.en).not.toMatch(forbiddenMetricPattern);
        for (const tool of DEEP_COMPARE_TOOLS) {
          expect(item.cells[tool.id].summary.ko).not.toMatch(forbiddenMetricPattern);
          expect(item.cells[tool.id].summary.en).not.toMatch(forbiddenMetricPattern);
        }
      }
    }
  });

  it("enforces violet-free OKLCH accents (0% hue in 270..320 deg) and zero raw hex/rgb/hsl across data & TSX source", () => {
    for (const meta of Object.values(DEEP_COMPARE_STATUS_META)) {
      expect(meta.oklchAccent).not.toMatch(/#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(/i);
      const match = meta.oklchAccent.match(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/);
      expect(match, meta.oklchAccent).not.toBeNull();
      const hue = Number(match?.[1] ?? 0);
      expect(hue < 270 || hue > 320, `${meta.status}: hue=${hue}`).toBe(true);
    }

    for (const filename of ["deep-domain-compare-data.ts", "DeepDomainCompareTabsSection.tsx"]) {
      const source = readFileSync(path.join(SHOWCASE_DIR, filename), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(source, filename).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgb\(|\brgba\(|\bhsl\(/i);
    }
  });

  it("enforces zero Sparkles icon usage and zero transition-all in DeepDomainCompareTabsSection.tsx", () => {
    const source = readFileSync(path.join(SHOWCASE_DIR, "DeepDomainCompareTabsSection.tsx"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    expect(source).not.toContain("Sparkles");
    expect(source).not.toMatch(/\btransition-all\b/);
  });

  it("resolves domain and tool helpers safely with deterministic fallbacks", () => {
    expect(isDeepCompareDomainId("brushes")).toBe(true);
    expect(isDeepCompareDomainId("studio3d")).toBe(true);
    expect(isDeepCompareDomainId("invalid-tab")).toBe(false);
    expect(parseDeepCompareDomainId("collab")).toBe("collab");
    expect(parseDeepCompareDomainId("unknown")).toBe("brushes");
    expect(parseDeepCompareDomainId(null)).toBe("brushes");
    expect(getDeepCompareDomain("filters").order).toBe(2);
    expect(getDeepCompareTool("rebelle7").shortName).toBe("Rebelle 7");
  });
});

describe("Wave 53B — Pure summary & filter utilities", () => {
  it("computes deterministic summary counts across all 5 domains", () => {
    for (const domain of DEEP_COMPARE_DOMAINS) {
      const summary = computeDomainSummary(domain.rows);
      expect(summary.totalRows).toBe(domain.rows.length);
      expect(summary.currentCount + summary.expandingCount).toBe(domain.rows.length);
      expect(summary.expandingCount).toBe(summary.partialCount + summary.targetCount);
      expect(summary.competitorStrengthRowCount).toBeGreaterThanOrEqual(4);
      expect(summary.competitorStrengthCellCount).toBeGreaterThanOrEqual(summary.competitorStrengthRowCount);
    }
  });

  it("recomputes competitor strength counts dynamically for narrowed tool subsets", () => {
    const collabRows = getDeepCompareDomain("collab").rows;
    const allSummary = computeDomainSummary(collabRows);
    const magmaOnlySummary = computeDomainSummary(collabRows, ["toonstudio", "magma"]);

    expect(magmaOnlySummary.competitorStrengthRowCount).toBe(1);
    expect(magmaOnlySummary.competitorStrengthCellCount).toBe(1);
    expect(allSummary.competitorStrengthCellCount).toBeGreaterThan(magmaOnlySummary.competitorStrengthCellCount);
  });

  it("filters rows accurately across all, toonstudio-lead, rival-strength, and expanding modes", () => {
    const brushRows = getDeepCompareDomain("brushes").rows;
    const summary = computeDomainSummary(brushRows);

    expect(filterDeepCompareRows(brushRows, "all", "", "ko")).toHaveLength(10);
    expect(filterDeepCompareRows(brushRows, "toonstudio-lead", "", "ko")).toHaveLength(summary.currentCount);
    expect(filterDeepCompareRows(brushRows, "rival-strength", "", "ko")).toHaveLength(
      summary.competitorStrengthRowCount,
    );
    expect(filterDeepCompareRows(brushRows, "expanding", "", "ko")).toHaveLength(summary.expandingCount);
  });

  it("matches search queries across feature title, spec, evidence path, and visible tool cells in ko and en", () => {
    const brushRows = getDeepCompareDomain("brushes").rows;
    expect(filterDeepCompareRows(brushRows, "all", "크레용", "ko").map((r) => r.id)).toContain("brush-crayon-pastel");
    expect(filterDeepCompareRows(brushRows, "all", "foley", "en").map((r) => r.id)).toContain("brush-foley-haptic");
    expect(filterDeepCompareRows(brushRows, "all", "tactile_texture_kernel.rs", "en").map((r) => r.id)).toEqual([
      "brush-dry-ink",
    ]);
    expect(filterDeepCompareRows(brushRows, "all", "zzz-nonexistent-query", "en")).toHaveLength(0);
  });

  it("counts target rows inside expanding filter and computeDomainSummary", () => {
    const collabRows = getDeepCompareDomain("collab").rows;
    const c2paRow = collabRows.find((r) => r.id === "collab-rights-c2pa");
    expect(c2paRow?.cells.toonstudio.status).toBe("target");

    const synthetic: readonly DeepCompareRow[] = c2paRow ? [c2paRow] : [];
    const summary = computeDomainSummary(synthetic);
    expect(summary.targetCount).toBe(1);
    expect(summary.expandingCount).toBe(1);
    expect(filterDeepCompareRows(synthetic, "expanding", "", "ko")).toHaveLength(1);
  });

  it("validates every column preset pins toonstudio and exposes 2..8 unique valid tools", () => {
    const validIds = new Set(DEEP_COMPARE_TOOLS.map((t) => t.id));
    for (const preset of DEEP_COMPARE_COLUMN_PRESETS) {
      expect(preset.tools[0]).toBe("toonstudio");
      expect(preset.tools.length).toBeGreaterThanOrEqual(2);
      expect(preset.tools.length).toBeLessThanOrEqual(8);
      expect(new Set(preset.tools).size).toBe(preset.tools.length);
      for (const id of preset.tools) {
        expect(validIds.has(id)).toBe(true);
      }
    }
  });
});

describe("Wave 53B — DeepDomainCompareTabsSection interactive UI & /compare/studio integration", () => {
  beforeEach(() => {
    act(() => {
      useI18n.getState().setLang("ko");
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders ARIA tablist with 5 tabs and links aria-controls to active tabpanel", () => {
    render(
      <MemoryRouter initialEntries={["/compare/studio"]}>
        <DeepDomainCompareTabsSection locale="ko" />
      </MemoryRouter>,
    );

    const tablist = screen.getByRole("tablist");
    const tabs = screen.getAllByRole("tab");
    expect(tablist).toBeTruthy();
    expect(tabs).toHaveLength(5);

    const brushesTab = screen.getByTestId("deep-compare-tab-brushes");
    expect(brushesTab.getAttribute("aria-selected")).toBe("true");
    expect(brushesTab.getAttribute("aria-controls")).toBe("deep-compare-panel-brushes");
    expect(screen.getByTestId("deep-compare-panel-brushes").getAttribute("aria-labelledby")).toBe(
      "deep-compare-tab-brushes",
    );
  });

  it("switches across all 5 domain tabs and renders exact row counts (10, 8, 8, 8, 8)", () => {
    render(
      <MemoryRouter initialEntries={["/compare/studio"]}>
        <DeepDomainCompareTabsSection locale="ko" />
      </MemoryRouter>,
    );

    const expectations: readonly (readonly [DeepCompareDomainId, number, string])[] = [
      ["brushes", 10, "brush-foley-haptic"],
      ["filters", 8, "filter-colorblind-lms"],
      ["drawing", 8, "draw-10k-bvh-instancing"],
      ["collab", 8, "collab-crdt-live"],
      ["studio3d", 8, "s3d-manifold-gate"],
    ];

    for (const [domainId, expectedRows, probeRowId] of expectations) {
      fireEvent.click(screen.getByTestId(`deep-compare-tab-${domainId}`));
      expect(screen.getByTestId(`deep-compare-panel-${domainId}`)).toBeTruthy();
      expect(screen.getByTestId("deep-compare-table").querySelectorAll("tbody tr")).toHaveLength(expectedRows);
      expect(screen.getByTestId(`deep-compare-row-${probeRowId}`)).toBeTruthy();
    }
  });

  it("supports keyboard ArrowRight, ArrowLeft, End, and Home navigation across tabs", () => {
    render(
      <MemoryRouter initialEntries={["/compare/studio"]}>
        <DeepDomainCompareTabsSection locale="ko" />
      </MemoryRouter>,
    );

    const brushesTab = screen.getByTestId("deep-compare-tab-brushes");
    fireEvent.keyDown(brushesTab, { key: "ArrowRight" });
    expect(screen.getByTestId("deep-compare-panel-filters")).toBeTruthy();

    fireEvent.keyDown(screen.getByTestId("deep-compare-tab-filters"), { key: "End" });
    expect(screen.getByTestId("deep-compare-panel-studio3d")).toBeTruthy();

    fireEvent.keyDown(screen.getByTestId("deep-compare-tab-studio3d"), { key: "ArrowLeft" });
    expect(screen.getByTestId("deep-compare-panel-collab")).toBeTruthy();

    fireEvent.keyDown(screen.getByTestId("deep-compare-tab-collab"), { key: "Home" });
    expect(screen.getByTestId("deep-compare-panel-brushes")).toBeTruthy();
  });

  it("reads ?compareTab= from URL query and syncs tab changes while preserving other query params", () => {
    render(
      <MemoryRouter initialEntries={["/compare/studio?ref=nav&compareTab=collab"]}>
        <DeepDomainCompareTabsSection locale="ko" />
        <LocationSpy />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("deep-compare-panel-collab")).toBeTruthy();
    expect(screen.getByTestId("deep-compare-tab-collab").getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByTestId("deep-compare-tab-studio3d"));
    expect(screen.getByTestId("deep-compare-panel-studio3d")).toBeTruthy();
    const search = screen.getByTestId("router-location-search").textContent ?? "";
    expect(search).toContain("ref=nav");
    expect(search).toContain("compareTab=studio3d");
  });

  it("accepts ?domain= query alias on initial load and normalizes to compareTab on click", () => {
    render(
      <MemoryRouter initialEntries={["/compare/studio?domain=drawing"]}>
        <DeepDomainCompareTabsSection locale="ko" />
        <LocationSpy />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("deep-compare-panel-drawing")).toBeTruthy();
    fireEvent.click(screen.getByTestId("deep-compare-tab-filters"));
    const search = screen.getByTestId("router-location-search").textContent ?? "";
    expect(search).toContain("compareTab=filters");
    expect(search).not.toContain("domain=");
  });

  it("works cleanly in standalone mode without a Router wrapper", () => {
    render(<DeepDomainCompareTabsSection locale="ko" initialDomainId="filters" />);
    expect(screen.getByTestId("deep-compare-panel-filters")).toBeTruthy();
    fireEvent.click(screen.getByTestId("deep-compare-tab-collab"));
    expect(screen.getByTestId("deep-compare-panel-collab")).toBeTruthy();
  });

  it("displays accurate tabular-nums summary bar metrics per tab", () => {
    render(
      <MemoryRouter initialEntries={["/compare/studio"]}>
        <DeepDomainCompareTabsSection locale="ko" />
      </MemoryRouter>,
    );

    const brushesSummary = computeDomainSummary(getDeepCompareDomain("brushes").rows);
    expect(screen.getByTestId("deep-compare-summary-current").textContent).toContain(`${brushesSummary.currentCount}`);
    expect(screen.getByTestId("deep-compare-summary-rival").textContent).toContain(
      `${brushesSummary.competitorStrengthRowCount}`,
    );
    expect(screen.getByTestId("deep-compare-summary-expanding").textContent).toContain(
      `${brushesSummary.expandingCount}`,
    );
    expect(screen.getByTestId("deep-compare-summary-tools").textContent).toContain("8");
  });

  it("filters table rows via all 4 status filter buttons", () => {
    render(
      <MemoryRouter initialEntries={["/compare/studio"]}>
        <DeepDomainCompareTabsSection locale="ko" />
      </MemoryRouter>,
    );

    const brushSummary = computeDomainSummary(getDeepCompareDomain("brushes").rows);

    fireEvent.click(screen.getByTestId("deep-compare-filter-toonstudio-lead"));
    expect(screen.getByTestId("deep-compare-table").querySelectorAll("tbody tr")).toHaveLength(
      brushSummary.currentCount,
    );

    fireEvent.click(screen.getByTestId("deep-compare-filter-rival-strength"));
    expect(screen.getByTestId("deep-compare-table").querySelectorAll("tbody tr")).toHaveLength(
      brushSummary.competitorStrengthRowCount,
    );

    fireEvent.click(screen.getByTestId("deep-compare-filter-expanding"));
    expect(screen.getByTestId("deep-compare-table").querySelectorAll("tbody tr")).toHaveLength(
      brushSummary.expandingCount,
    );

    fireEvent.click(screen.getByTestId("deep-compare-filter-all"));
    expect(screen.getByTestId("deep-compare-table").querySelectorAll("tbody tr")).toHaveLength(10);
  });

  it("supports live search, clear button, empty state, and one-click reset", () => {
    render(
      <MemoryRouter initialEntries={["/compare/studio"]}>
        <DeepDomainCompareTabsSection locale="ko" />
      </MemoryRouter>,
    );

    const input = screen.getByTestId("deep-compare-search-input");
    fireEvent.change(input, { target: { value: "크레용" } });
    expect(screen.getByTestId("deep-compare-row-brush-crayon-pastel")).toBeTruthy();
    expect(screen.getByTestId("deep-compare-table").querySelectorAll("tbody tr")).toHaveLength(1);

    fireEvent.click(screen.getByTestId("deep-compare-search-clear"));
    expect(screen.getByTestId("deep-compare-table").querySelectorAll("tbody tr")).toHaveLength(10);

    fireEvent.change(input, { target: { value: "not-a-real-capability-xyz" } });
    expect(screen.getByTestId("deep-compare-empty")).toBeTruthy();

    fireEvent.click(screen.getByTestId("deep-compare-reset-filters"));
    expect(screen.getByTestId("deep-compare-table").querySelectorAll("tbody tr")).toHaveLength(10);
  });

  it("toggles competitor columns freely (2..8 tools), guards minimum 2 tools, and applies presets", () => {
    render(
      <MemoryRouter initialEntries={["/compare/studio"]}>
        <DeepDomainCompareTabsSection locale="ko" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("deep-compare-th-magma")).toBeTruthy();
    fireEvent.click(screen.getByTestId("deep-compare-preset-browser-collab"));
    expect(screen.getByTestId("deep-compare-summary-tools").textContent).toContain("3");
    expect(screen.getByTestId("deep-compare-th-magma")).toBeTruthy();
    expect(screen.getByTestId("deep-compare-th-csp")).toBeTruthy();
    expect(screen.queryByTestId("deep-compare-th-blender")).toBeNull();

    // Hide CSP so only ToonStudio + Magma remain (2 tools)
    fireEvent.click(screen.getByTestId("deep-compare-col-toggle-csp"));
    expect(screen.getByTestId("deep-compare-summary-tools").textContent).toContain("2");

    // Attempt to hide last remaining competitor (Magma) — guardrail keeps >= 2 tools
    const magmaToggle = screen.getByTestId("deep-compare-col-toggle-magma");
    expect(magmaToggle.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(magmaToggle);
    expect(screen.getByTestId("deep-compare-summary-tools").textContent).toContain("2");
    expect(screen.getByTestId("deep-compare-th-magma")).toBeTruthy();

    // Switch back to all 8 tools preset
    fireEvent.click(screen.getByTestId("deep-compare-preset-all8"));
    expect(screen.getByTestId("deep-compare-summary-tools").textContent).toContain("8");
    expect(screen.getByTestId("deep-compare-th-blender")).toBeTruthy();
  });

  it("updates cell evidence inspector when clicking rival and ToonStudio cells", () => {
    render(
      <MemoryRouter initialEntries={["/compare/studio?compareTab=collab"]}>
        <DeepDomainCompareTabsSection locale="ko" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("deep-compare-cell-collab-crdt-live-magma"));
    const inspector = screen.getByTestId("deep-compare-inspector");
    expect(inspector.textContent).toContain("Magma Studio");
    expect(inspector.textContent).toContain("타사 강점");
    expect(inspector.textContent).toContain("studio-live-socket-transport-crdt.ts");
    expect(inspector.textContent).toContain("ToonStudio 코드 경로");
    expect(screen.getByRole("link", { name: "Magma 공식 요금제" }).getAttribute("href")).toBe("https://magma.com/pricing");
  });

  it("enforces min-h-11 touch target sizing on every interactive button", () => {
    render(
      <MemoryRouter initialEntries={["/compare/studio"]}>
        <DeepDomainCompareTabsSection locale="ko" />
      </MemoryRouter>,
    );

    const root = screen.getByTestId("deep-domain-compare-section");
    const buttons = root.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(90);
    for (const button of buttons) {
      expect(button.className, button.getAttribute("data-testid") ?? "button").toContain("min-h-11");
    }
  });

  it("leaks zero Korean characters in English mode across all 5 tabs, filters, and empty state", () => {
    render(
      <MemoryRouter initialEntries={["/compare/studio"]}>
        <DeepDomainCompareTabsSection locale="en" />
      </MemoryRouter>,
    );

    const root = screen.getByTestId("deep-domain-compare-section");
    for (const domain of DEEP_COMPARE_DOMAINS) {
      fireEvent.click(screen.getByTestId(`deep-compare-tab-${domain.id}`));
      expect(root.textContent, domain.id).not.toMatch(/[\uAC00-\uD7A3]/u);
    }

    fireEvent.click(screen.getByTestId("deep-compare-filter-rival-strength"));
    expect(root.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);

    fireEvent.change(screen.getByTestId("deep-compare-search-input"), {
      target: { value: "nonexistent-en-token" },
    });
    expect(screen.getByTestId("deep-compare-empty")).toBeTruthy();
    expect(root.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);
  });

  it("mounts cleanly inside StudioCompetitorBenchmarkPage (/compare/studio) with full ko/en parity", () => {
    render(
      <MemoryRouter initialEntries={["/compare/studio?compareTab=studio3d"]}>
        <StudioCompetitorBenchmarkPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("deep-domain-compare-section")).toBeTruthy();
    expect(screen.getByTestId("deep-compare-panel-studio3d")).toBeTruthy();
    expect(screen.getByTestId("deep-compare-row-s3d-vrm-42socket")).toBeTruthy();

    act(() => {
      useI18n.getState().setLang("en");
    });
    expect(screen.getByTestId("studio-benchmark-page").textContent).not.toMatch(/[\uAC00-\uD7A3]/u);
  });
});
