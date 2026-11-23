// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  BRUSH_FILTER_COMPETITOR_ROWS,
  QUANTITATIVE_PERFORMANCE_METRICS,
  SHAPER_3D_BREAKTHROUGH_PILLARS,
} from "./brush-filter-competitor-data";
import { StudioBrushFilterMatrixSection } from "./StudioBrushFilterMatrixSection";

afterEach(() => {
  cleanup();
});

describe("StudioBrushFilterMatrixSection", () => {
  it("renders all 6 brush/filter groups, 4 quantitative metrics, 4 3D shaper breakthrough pillars, and filters cleanly", () => {
    render(<StudioBrushFilterMatrixSection locale="ko" />);
    const root = screen.getByTestId("benchmark-brush-filter-3d-suite");
    expect(root.textContent).toContain("58");
    expect(root.textContent).toContain("0.005 ms");

    for (const row of BRUSH_FILTER_COMPETITOR_ROWS) {
      expect(screen.getByTestId(`bf-row-${row.id}`)).toBeTruthy();
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
  });

  it("leaks zero Korean characters in English locale", () => {
    render(<StudioBrushFilterMatrixSection locale="en" />);
    const root = screen.getByTestId("benchmark-brush-filter-3d-suite");
    expect(root.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);
  });
});
