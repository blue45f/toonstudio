// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DrawingToolComparisonPage } from "./DrawingToolComparisonPage";
import {
  COMPETITOR_ADVANTAGES,
  DRAWING_COMPARE_SNAPSHOT_DATE,
  DRAWING_COMPARISON_CATEGORIES,
  DRAWING_TOOL_PROFILES,
  TOONSTUDIO_HONEST_LIMITATIONS,
  collectAllDrawingEvidencePaths,
  countDrawingCriteria,
} from "./drawing-tool-comparison-data";

import { useI18n } from "@/shared/lib/i18n";
import { isPublicCreativeRoute } from "@/shared/components/site-public-routes";
import { resolveSeoRoutePolicy } from "@/shared/lib/seo-route-policy";

const REPO_ROOT = path.resolve(process.cwd());
const HANGUL = /[ㄱ-ㆎ가-힣]/u;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/about/technology/drawing-compare"]}>
      <DrawingToolComparisonPage />
    </MemoryRouter>,
  );
}

describe("DrawingToolComparisonPage (/about/technology/drawing-compare)", () => {
  beforeEach(() => {
    act(() => {
      useI18n.getState().setLang("ko");
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("8종 드로잉 툴, 7개 기술 영역, 37개(>=35) 비교 항목과 트랙 1 형제 내비게이션을 렌더링한다", () => {
    const { container } = renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: /드로잉 툴 8종 기술 심층 비교/u }),
    ).toBeTruthy();
    expect(document.title).toContain("드로잉 툴 8종 기술 심층 비교");
    expect(screen.getAllByText(new RegExp(DRAWING_COMPARE_SNAPSHOT_DATE, "u")).length).toBeGreaterThan(0);

    expect(DRAWING_TOOL_PROFILES.map((profile) => profile.id)).toEqual([
      "toonstudio",
      "csp",
      "krita",
      "magma",
      "procreate",
      "rebelle7",
      "photoshop",
      "ibis-medibang",
    ]);
    expect(DRAWING_COMPARISON_CATEGORIES).toHaveLength(7);
    expect(countDrawingCriteria()).toBe(37);
    expect(countDrawingCriteria()).toBeGreaterThanOrEqual(35);

    for (const profile of DRAWING_TOOL_PROFILES) {
      expect(screen.getByTestId(`drawing-profile-${profile.id}`)).toBeTruthy();
    }

    // 기술 허브 트랙 1 형제 바 연동 확인 (자기 자신 중복 링크 없음)
    const trackBar = screen.getByRole("navigation", { name: "현재 트랙 빠른 이동" });
    expect(trackBar.textContent).toContain("트랙 1 · 한눈에 보기");
    expect(within(trackBar).getByRole("link", { name: /경쟁 비교/u }).getAttribute("href")).toBe("/about/compare");
    expect(container.querySelectorAll('a[href="/about/technology/drawing-compare"]')).toHaveLength(1);
  });

  it("카테고리 탭 필터링과 검색, 빈 결과 초기화가 정확히 동작한다", () => {
    renderPage();

    expect(screen.getByTestId("drawing-visible-count").textContent).toContain("37개 항목");

    for (const category of DRAWING_COMPARISON_CATEGORIES) {
      const tab = screen.getByTestId(`drawing-category-tab-${category.id}`);
      expect(tab.className).toContain("min-h-11");
      fireEvent.click(tab);
      expect(tab.getAttribute("aria-selected")).toBe("true");
      expect(screen.getByTestId("drawing-visible-count").textContent).toContain(
        `${category.criteria.length}개 항목`,
      );
      for (const criterion of category.criteria) {
        expect(screen.getByTestId(`drawing-row-${criterion.id}`)).toBeTruthy();
      }
    }

    // 전체 영역으로 복귀 후 검색 검증
    fireEvent.click(screen.getByTestId("drawing-category-tab-all"));
    const searchInput = screen.getByTestId("drawing-compare-search");
    fireEvent.change(searchInput, { target: { value: "Watershed" } });
    expect(screen.getByTestId("drawing-row-watershed-auto-colorize")).toBeTruthy();
    expect(screen.queryByTestId("drawing-row-km7-spectral-mixing")).toBeNull();

    // 결과 없음 상태 및 필터 초기화
    fireEvent.change(searchInput, { target: { value: "존재하지않는엔진키워드xyz" } });
    expect(screen.getByTestId("drawing-empty-state")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /필터 초기화/u }));
    expect(screen.getByTestId("drawing-visible-count").textContent).toContain("37개 항목");
  });

  it("경쟁 툴 프리셋과 개별 토글이 ToonStudio 고정 및 최소 1종 불변식을 유지한다", () => {
    renderPage();

    fireEvent.click(screen.getByTestId("drawing-preset-core-trio"));
    expect(screen.getByTestId("drawing-tool-chip-csp").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("drawing-tool-chip-krita").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("drawing-tool-chip-magma").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("drawing-tool-chip-rebelle7").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("drawing-visible-count").textContent).toContain("ToonStudio + 3종");

    // 개별 칩 토글로 Rebelle 7 추가
    fireEvent.click(screen.getByTestId("drawing-tool-chip-rebelle7"));
    expect(screen.getByTestId("drawing-tool-chip-rebelle7").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("drawing-visible-count").textContent).toContain("ToonStudio + 4종");

    // 최소 1종 유지 불변식 검증
    fireEvent.click(screen.getByTestId("drawing-tool-chip-krita"));
    fireEvent.click(screen.getByTestId("drawing-tool-chip-magma"));
    fireEvent.click(screen.getByTestId("drawing-tool-chip-rebelle7"));
    expect(screen.getByTestId("drawing-visible-count").textContent).toContain("ToonStudio + 1종");
    fireEvent.click(screen.getByTestId("drawing-tool-chip-csp"));
    expect(screen.getByTestId("drawing-tool-chip-csp").getAttribute("aria-pressed")).toBe("true");
  });

  it("항목 클릭 펼침으로 기술 근거·구현 차이·저장소 경로를 확인하고 정직한 한계와 경쟁 툴 강점을 표시한다", () => {
    renderPage();

    // 첫 항목(km7-spectral-mixing)은 기본 펼침, 클릭 시 접힘
    const kmToggle = screen.getAllByTestId("drawing-detail-toggle-km7-spectral-mixing")[0]!;
    expect(kmToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByTestId("drawing-detail-panel-km7-spectral-mixing")[0]?.textContent).toContain(
      "studio-webgpu-km7-spectral-core.ts",
    );
    fireEvent.click(kmToggle);
    expect(kmToggle.getAttribute("aria-expanded")).toBe("false");

    // 유체 수채화 항목 펼침 검증
    const fluidToggle = screen.getAllByTestId("drawing-detail-toggle-fluid-watercolor-granulation")[0]!;
    expect(fluidToggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(fluidToggle);
    expect(fluidToggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByTestId("drawing-detail-panel-fluid-watercolor-granulation")[0]?.textContent).toContain(
      "studio-fluid-watercolor-sim.ts",
    );

    // 정직한 한계 & 경쟁 툴 강점 검증
    const honestSection = screen.getByTestId("drawing-honest-limits-section");
    expect(honestSection.textContent).toContain("ASSETS");
    expect(honestSection.textContent).toContain("G'MIC-Qt");
    expect(honestSection.textContent).toContain("ArtJam");
    expect(honestSection.textContent).toContain("NanoPixel");
    for (const note of COMPETITOR_ADVANTAGES) {
      expect(screen.getByTestId(`drawing-peer-lead-${note.toolId}`)).toBeTruthy();
    }
    for (const limit of TOONSTUDIO_HONEST_LIMITATIONS) {
      expect(screen.getByTestId(`drawing-honest-limit-${limit.id}`)).toBeTruthy();
    }
  });

  it("영어 로케일에서는 페이지 전체에 한글이 섞이지 않고 영문 제목·비교 문구를 표시한다", () => {
    const { container } = renderPage();
    act(() => {
      useI18n.getState().setLang("en");
    });

    expect(
      screen.getByRole("heading", { level: 1, name: /8 drawing tools compared in depth/u }),
    ).toBeTruthy();
    expect(document.title).toContain("8 Drawing Tools Deep Technical Comparison");
    expect(HANGUL.test(container.textContent ?? "")).toBe(false);
  });

  it("인용된 모든 저장소 경로가 실제 디스크에 존재하고 모든 신규 소스 파일이 800줄 이하다", () => {
    const repoPaths = collectAllDrawingEvidencePaths();
    expect(repoPaths.length).toBeGreaterThanOrEqual(60);
    for (const repoPath of repoPaths) {
      expect(existsSync(path.join(REPO_ROOT, repoPath)), `missing evidence file: ${repoPath}`).toBe(true);
    }

    const newFiles = [
      "apps/web/src/domains/legal/technology/drawing-tool-comparison-profiles.ts",
      "apps/web/src/domains/legal/technology/drawing-tool-comparison-axes-paint.ts",
      "apps/web/src/domains/legal/technology/drawing-tool-comparison-axes-workflow.ts",
      "apps/web/src/domains/legal/technology/drawing-tool-comparison-data.ts",
      "apps/web/src/domains/legal/technology/DrawingToolComparisonMatrix.tsx",
      "apps/web/src/domains/legal/technology/DrawingToolComparisonPage.tsx",
      "apps/web/src/domains/legal/technology/DrawingToolComparisonPage.test.tsx",
    ];
    for (const file of newFiles) {
      const lineCount = readFileSync(path.join(REPO_ROOT, file), "utf8").split("\n").length;
      expect(lineCount, `${file} exceeds 800 lines (${lineCount})`).toBeLessThanOrEqual(800);
    }
  });

  it("공개 창작 셸과 SEO 색인 정책 계약을 충족한다", () => {
    const pathname = "/about/technology/drawing-compare";
    expect(isPublicCreativeRoute(pathname)).toBe(true);
    expect(resolveSeoRoutePolicy(pathname).indexable).toBe(true);
  });
});
