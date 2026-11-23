// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  BRUSH_FILTER_COMPETITOR_ROWS,
  BRUSH_FILTER_SUMMARY_STATS,
  QUANTITATIVE_PERFORMANCE_METRICS,
  SHAPER_3D_BREAKTHROUGH_PILLARS,
  STUDIO_NEXTGEN_CAPABILITY_CARDS,
} from "./brush-filter-competitor-data";
import { StudioBrushFilterMatrixSection } from "./StudioBrushFilterMatrixSection";

afterEach(() => {
  cleanup();
});

describe("StudioBrushFilterMatrixSection", () => {
  it("enforces exact codebase-verified brush (502/640) and filter (183) breakdown arithmetic", () => {
    expect(
      BRUSH_FILTER_SUMMARY_STATS.coreProBrushes +
        BRUSH_FILTER_SUMMARY_STATS.mypaintCc0Brushes +
        BRUSH_FILTER_SUMMARY_STATS.globalSignatureFreeBrushes,
    ).toBe(502);
    expect(BRUSH_FILTER_SUMMARY_STATS.selectableFreeBrushes).toBe(502);
    expect(BRUSH_FILTER_SUMMARY_STATS.totalRegisteredBrushes).toBe(640);

    expect(
      BRUSH_FILTER_SUMMARY_STATS.studioCatalogFilters +
        BRUSH_FILTER_SUMMARY_STATS.photoshopWebFilters +
        BRUSH_FILTER_SUMMARY_STATS.masterLutWebtoonFilters,
    ).toBe(183);
    expect(BRUSH_FILTER_SUMMARY_STATS.freeFiltersTotal).toBe(183);
    expect(STUDIO_NEXTGEN_CAPABILITY_CARDS).toHaveLength(6);
  });

  it("renders exact brush/filter KPIs, 6 competitor rows, 6 next-gen capabilities, 5 quantitative metrics, and 4 3D shaper pillars", () => {
    render(<StudioBrushFilterMatrixSection locale="ko" />);
    const root = screen.getByTestId("benchmark-brush-filter-3d-suite");

    const brushKpi = screen.getByTestId("bf-kpi-free-brushes");
    expect(brushKpi.textContent).toContain("502");
    expect(brushKpi.textContent).toContain("640");
    expect(brushKpi.textContent).toContain("246");
    expect(brushKpi.textContent).toContain("196");
    expect(brushKpi.textContent).toContain("60");

    const filterKpi = screen.getByTestId("bf-kpi-free-filters");
    expect(filterKpi.textContent).toContain("183");
    expect(filterKpi.textContent).toContain("86");
    expect(filterKpi.textContent).toContain("61");
    expect(filterKpi.textContent).toContain("36");

    expect(root.textContent).toContain("0.005 ms");
    expect(root.textContent).toContain("+0.74 MB");

    for (const row of BRUSH_FILTER_COMPETITOR_ROWS) {
      expect(screen.getByTestId(`bf-row-${row.id}`)).toBeTruthy();
    }
    for (const card of STUDIO_NEXTGEN_CAPABILITY_CARDS) {
      expect(screen.getByTestId(`nextgen-capability-${card.id}`)).toBeTruthy();
    }
    for (const metric of QUANTITATIVE_PERFORMANCE_METRICS) {
      expect(screen.getByTestId(`quant-metric-${metric.id}`)).toBeTruthy();
    }
    for (const pillar of SHAPER_3D_BREAKTHROUGH_PILLARS) {
      expect(screen.getByTestId(`shaper-pillar-${pillar.id}`)).toBeTruthy();
    }

    fireEvent.click(screen.getByTestId("bf-filter-brush"));
    expect(screen.getByTestId("bf-row-brush-ink-webtoon")).toBeTruthy();
    expect(screen.queryByTestId("bf-row-filter-blur-optics")).toBeNull();

    fireEvent.click(screen.getByTestId("bf-filter-filter"));
    expect(screen.getByTestId("bf-row-filter-blur-optics")).toBeTruthy();
    expect(screen.queryByTestId("bf-row-brush-ink-webtoon")).toBeNull();

    fireEvent.click(screen.getByTestId("bf-filter-all"));
    expect(screen.getByTestId("bf-row-brush-ink-webtoon")).toBeTruthy();
    expect(screen.getByTestId("bf-row-filter-blur-optics")).toBeTruthy();
  });

  it("leaks zero Korean characters in English locale across all filter tabs and capability cards", () => {
    render(<StudioBrushFilterMatrixSection locale="en" />);
    const root = screen.getByTestId("benchmark-brush-filter-3d-suite");
    expect(root.textContent).toContain("502");
    expect(root.textContent).toContain("640");
    expect(root.textContent).toContain("183");
    expect(root.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);

    fireEvent.click(screen.getByTestId("bf-filter-brush"));
    expect(root.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);

    fireEvent.click(screen.getByTestId("bf-filter-filter"));
    expect(root.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);
  });
});
