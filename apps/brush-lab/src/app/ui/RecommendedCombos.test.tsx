// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RecommendedCombos } from "./RecommendedCombos";

import type { FamilyRecommendation } from "../../bench/recommended-combos";

afterEach(() => {
  cleanup();
});

const SAMPLE: readonly FamilyRecommendation[] = [
  { presetId: "pencil-hb", laneId: "cpu-reference", reasonKo: "가장 빠르고 결정적이다", zigzagMs: 120, spiralMs: 900, noteKo: null },
  { presetId: "charcoal", laneId: "bristle-pbd", reasonKo: "그레인이 가장 뚜렷하다", zigzagMs: 200, spiralMs: 1500, noteKo: "실험 레인" },
];

describe("RecommendedCombos", () => {
  it("빈 데이터에서는 안내만 보인다", () => {
    render(<RecommendedCombos combos={[]} />);
    expect(screen.getByRole("heading", { name: "추천 조합" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("행마다 프리셋·레인·이유·수치·주의가 보인다", () => {
    render(<RecommendedCombos combos={SAMPLE} />);
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(table.textContent).toContain("pencil-hb");
    expect(table.textContent).toContain("bristle-pbd");
    expect(table.textContent).toContain("그레인이 가장 뚜렷하다");
    expect(table.textContent).toContain("실험 레인");
  });
});
