// @vitest-environment jsdom
import { existsSync } from "node:fs";
import path from "node:path";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CompetitorComparisonPage } from "./CompetitorComparisonPage";
import {
  COMPARISON_AXES,
  COMPARISON_SNAPSHOT_DATE,
  COMPETITOR_PROFILES,
  DECISION_SCENARIOS,
  collectAllComparisonEvidencePaths,
  countComparisonCriteria,
} from "./competitor-comparison-data";

import { useI18n } from "@/shared/lib/i18n";

const REPO_ROOT = path.resolve(process.cwd());

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/about/compare"]}>
      <CompetitorComparisonPage />
    </MemoryRouter>,
  );
}

describe("CompetitorComparisonPage", () => {
  beforeEach(() => {
    act(() => {
      useI18n.getState().setLang("ko");
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders ToonStudio and all 7 competitor profiles with honest beta ₩0 summary", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: /ToonStudio vs 주요 제작 도구 7종/u }),
    ).toBeTruthy();
    expect(document.title).toContain("ToonStudio vs 경쟁 도구 7종 비교");
    expect(screen.getAllByText(new RegExp(COMPARISON_SNAPSHOT_DATE, "u")).length).toBeGreaterThan(0);

    for (const profile of COMPETITOR_PROFILES) {
      expect(screen.getByTestId(`compare-profile-${profile.id}`)).toBeTruthy();
      expect(screen.getAllByText(profile.name).length).toBeGreaterThan(0);
    }

    expect(COMPETITOR_PROFILES.map((profile) => profile.id)).toEqual([
      "toonstudio",
      "csp",
      "procreate",
      "photoshop",
      "rebelle",
      "blender",
      "creco",
      "acon3d",
    ]);
    expect(countComparisonCriteria()).toBe(20);
  });

  it("switches across all 5 comparison axes and updates rows, guide, and evidence panels", () => {
    renderPage();

    expect(COMPARISON_AXES).toHaveLength(5);

    for (const axis of COMPARISON_AXES) {
      const tab = screen.getByTestId(`compare-axis-tab-${axis.id}`);
      expect(tab.className).toContain("min-h-11");
      fireEvent.click(tab);
      expect(tab.getAttribute("aria-selected")).toBe("true");
      expect(screen.getByTestId(`compare-axis-guide-${axis.id}`).textContent).toContain(
        axis.whenToUseGuide.ko,
      );

      for (const criterion of axis.criteria) {
        expect(screen.getByTestId(`compare-row-${criterion.id}`)).toBeTruthy();
      }
    }

    // 1축으로 돌아가 근거 패널 토글 검증
    fireEvent.click(screen.getByTestId("compare-axis-tab-drawing-spectral"));
    const firstToggle = screen.getAllByTestId("compare-evidence-toggle-spectral-pigment-km7")[0]!;
    expect(firstToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByTestId("compare-evidence-panel-spectral-pigment-km7")[0]?.textContent).toContain(
      "studio-webgpu-km7-spectral-core.ts",
    );
    fireEvent.click(firstToggle);
    expect(firstToggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("filters compared tools by preset and individual toggles while keeping ToonStudio pinned", () => {
    renderPage();
    const matrix = screen.getByTestId("competitor-comparison-matrix");

    fireEvent.click(screen.getByTestId("compare-group-webtoon-core"));
    expect(screen.getByTestId("compare-tool-toggle-csp").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("compare-tool-toggle-creco").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("compare-tool-toggle-acon3d").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("compare-tool-toggle-rebelle").getAttribute("aria-pressed")).toBe("false");
    expect(matrix.textContent).toContain("표시 중: ToonStudio + 3종");

    // 개별 토글로 Blender 추가
    fireEvent.click(screen.getByTestId("compare-tool-toggle-blender"));
    expect(screen.getByTestId("compare-tool-toggle-blender").getAttribute("aria-pressed")).toBe("true");
    expect(matrix.textContent).toContain("표시 중: ToonStudio + 4종");

    // 최소 1종 비교 도구 유지 불변식
    fireEvent.click(screen.getByTestId("compare-tool-toggle-creco"));
    fireEvent.click(screen.getByTestId("compare-tool-toggle-acon3d"));
    fireEvent.click(screen.getByTestId("compare-tool-toggle-blender"));
    expect(matrix.textContent).toContain("표시 중: ToonStudio + 1종");
    fireEvent.click(screen.getByTestId("compare-tool-toggle-csp"));
    expect(screen.getByTestId("compare-tool-toggle-csp").getAttribute("aria-pressed")).toBe("true");
  });

  it("renders all objective decision scenarios and Current vs Target disclosure cleanly in ko and en", () => {
    renderPage();

    for (const scenario of DECISION_SCENARIOS) {
      expect(screen.getByTestId(`compare-scenario-${scenario.id}`)).toBeTruthy();
    }

    expect(screen.getByRole("heading", { name: /현재 구현\(Current\)과 향후 목표\(Target\)/u })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "관련 페이지 이동" });
    expect(within(nav).getByRole("link", { name: /새 작품 시작하기/u }).getAttribute("href")).toBe("/studio/new");
    expect(within(nav).getByRole("link", { name: /IR · 투자 소개/u }).getAttribute("href")).toBe("/ir");
    expect(within(nav).getByRole("link", { name: /기술과 신뢰 허브/u }).getAttribute("href")).toBe("/about/technology");
    expect(within(nav).getByRole("link", { name: /독자용 두 작품 비교/u }).getAttribute("href")).toBe("/compare");

    act(() => {
      useI18n.getState().setLang("en");
    });

    expect(
      screen.getByRole("heading", { level: 1, name: /ToonStudio vs\. 7 leading creative tools/u }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { name: /When should you pick which tool\?/u })).toBeTruthy();
    expect(document.title).toContain("ToonStudio vs. 7 Creative Tools");
  });

  it("cites only real repository source and documentation paths that exist on disk", () => {
    const repoPaths = collectAllComparisonEvidencePaths();
    expect(repoPaths.length).toBeGreaterThanOrEqual(20);
    for (const repoPath of repoPaths) {
      expect(existsSync(path.join(REPO_ROOT, repoPath)), `missing cited evidence file: ${repoPath}`).toBe(true);
    }
  });
});
