// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BENCHMARK_3D_STUDIO_DATASET } from "./benchmark-3d-studio-data";
import { BENCHMARK_AI_ASSIST_DATASET } from "./benchmark-ai-assist-data";
import { BENCHMARK_BRUSHES_DATASET } from "./benchmark-brushes-data";
import { BENCHMARK_COLLAB_OFFICE_DATASET } from "./benchmark-collab-office-data";
import { BENCHMARK_FILTERS_DATASET } from "./benchmark-filters-data";
import {
  Benchmark3dStudioPage,
  BenchmarkAiAssistPage,
  BenchmarkBrushesPage,
  BenchmarkCollabOfficePage,
  BenchmarkFiltersPage,
} from "./BenchmarkDetailPage";
import { ALL_BENCHMARK_DATASETS } from "./benchmark-datasets";
import { BenchmarkHubPage } from "./BenchmarkHubPage";
import { BENCHMARK_CATEGORY_NAV, BENCHMARK_CROSS_LINKS } from "./benchmark-types";
import { hubTrackForPath } from "../engineering-hub-tracks";
import { SITEMAP_DIRECTORY_ENTRIES } from "../../site-directory-data";

import { isPublicCreativeRoute } from "@/shared/components/site-public-routes";
import { useI18n } from "@/shared/lib/i18n-core";
import { resolveSeoRoutePolicy } from "@/shared/lib/seo-route-policy";

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useMetaDescription: vi.fn(),
}));

const HANGUL = /[ㄱ-ㆎ가-힣]/u;
const BENCHMARK_ROUTES = [
  "/about/technology/benchmarks",
  "/about/technology/benchmarks/brushes",
  "/about/technology/benchmarks/filters",
  "/about/technology/benchmarks/collab-office",
  "/about/technology/benchmarks/3d-studio",
  "/about/technology/benchmarks/ai-assist",
] as const;

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

describe("5대 세부 기술 벤치마크 데이터 무결성", () => {
  it("영역별 최소 항목 수와 필수 비교 도구를 빠짐없이 포함한다", () => {
    expect(ALL_BENCHMARK_DATASETS).toHaveLength(5);
    expect(BENCHMARK_CATEGORY_NAV).toHaveLength(5);

    expect(BENCHMARK_BRUSHES_DATASET.rows.length).toBeGreaterThanOrEqual(14);
    expect(BENCHMARK_BRUSHES_DATASET.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "ToonStudio",
        "Clip Studio Paint",
        "Procreate",
        "Krita",
        "Rebelle 7",
        "Adobe Photoshop",
        "Magma Studio",
      ]),
    );

    expect(BENCHMARK_FILTERS_DATASET.rows.length).toBeGreaterThanOrEqual(14);
    expect(BENCHMARK_FILTERS_DATASET.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "ToonStudio",
        "Adobe Photoshop",
        "Clip Studio Paint",
        "Krita (G'MIC)",
        "Procreate",
        "Magma Studio",
      ]),
    );

    expect(BENCHMARK_COLLAB_OFFICE_DATASET.rows.length).toBeGreaterThanOrEqual(12);
    expect(BENCHMARK_COLLAB_OFFICE_DATASET.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "ToonStudio",
        "Magma Studio",
        "Gather Town",
        "ZEP",
        "Figma / FigJam",
        "Creco",
        "Miro",
        "Frame.io / SyncSketch",
      ]),
    );

    expect(BENCHMARK_3D_STUDIO_DATASET.rows.length).toBeGreaterThanOrEqual(12);
    expect(BENCHMARK_3D_STUDIO_DATASET.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "ToonStudio",
        "Blender",
        "SketchUp",
        "ACON3D",
        "CSP 3D / Modeler",
        "DesignDoll",
        "Shapr3D",
        "Nomad Sculpt",
        "Spline",
        "Tooning Plus",
      ]),
    );

    expect(BENCHMARK_AI_ASSIST_DATASET.rows.length).toBeGreaterThanOrEqual(12);
    expect(BENCHMARK_AI_ASSIST_DATASET.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "ToonStudio",
        "Tooning Plus",
        "Adobe Photoshop (Firefly)",
        "Krita AI Diffusion",
        "Clip Studio Paint",
        "Canva / ComfyUI",
      ]),
    );
  });

  it("모든 비교 행이 전 도구의 셀, 실제 존재하는 저장소 근거 파일, 정직한 한계를 가진다", () => {
    const repoRoot = process.cwd();

    for (const dataset of ALL_BENCHMARK_DATASETS) {
      const subGroupIds = new Set(dataset.subGroups.map((group) => group.id));
      expect(dataset.honestTradeoffs.length, dataset.id).toBeGreaterThanOrEqual(4);

      for (const row of dataset.rows) {
        expect(subGroupIds.has(row.subGroupId), `${dataset.id}:${row.id}`).toBe(true);
        expect(row.honestLimit.ko.trim().length, `${dataset.id}:${row.id}`).toBeGreaterThan(10);
        expect(row.honestLimit.en.trim().length, `${dataset.id}:${row.id}`).toBeGreaterThan(10);
        expect(HANGUL.test(row.title.en), `${dataset.id}:${row.id}`).toBe(false);
        expect(HANGUL.test(row.honestLimit.en), `${dataset.id}:${row.id}`).toBe(false);
        expect(row.evidencePaths.length, `${dataset.id}:${row.id}`).toBeGreaterThan(0);

        for (const repoPath of row.evidencePaths) {
          expect(existsSync(join(repoRoot, repoPath)), `missing evidence path: ${repoPath}`).toBe(true);
        }

        for (const tool of dataset.tools) {
          const cell = row.cells[tool.id];
          expect(cell, `missing cell ${dataset.id}:${row.id}:${tool.id}`).toBeDefined();
          expect(cell?.summary.ko.trim().length, `${dataset.id}:${row.id}:${tool.id}`).toBeGreaterThan(0);
          expect(HANGUL.test(cell?.summary.en ?? ""), `${dataset.id}:${row.id}:${tool.id}`).toBe(false);
        }
      }
    }
  });

  it("모든 벤치마크 소스 파일은 750줄 이하이고 보라 네온 슬롭·any를 사용하지 않는다", () => {
    const files = [
      "benchmark-types.ts",
      "benchmark-brushes-data.ts",
      "benchmark-filters-data.ts",
      "benchmark-collab-office-data.ts",
      "benchmark-3d-studio-data.ts",
      "benchmark-ai-assist-data.ts",
      "benchmark-datasets.ts",
      "BenchmarkDetailPrimitives.tsx",
      "BenchmarkDetailPage.tsx",
      "BenchmarkHubPage.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(
        join(process.cwd(), "apps/web/src/domains/legal/technology/benchmarks", file),
        "utf8",
      );
      expect(source.split("\n").length, file).toBeLessThanOrEqual(750);
      expect(source, file).not.toMatch(/:\s*any\b/u);
      expect(source, file).not.toMatch(/from-purple|via-violet|blur-3xl|backdrop-blur/u);
    }
  });
});

describe("5대 벤치마크 허브 & 세부 페이지 렌더링 및 인터랙션", () => {
  it("허브 페이지가 5개 세부 벤치마크 카드와 drawing-compare·/about/compare 교차 링크를 렌더링한다", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/about/technology/benchmarks"]}>
        <BenchmarkHubPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("5대 기술 벤치마크");

    for (const dataset of ALL_BENCHMARK_DATASETS) {
      const card = screen.getByTestId(`benchmark-hub-card-${dataset.id}`);
      expect(within(card).getByRole("link").getAttribute("href")).toBe(dataset.path);
    }

    expect(screen.getByTestId("benchmark-cross-link-drawing-compare").getAttribute("href")).toBe(
      "/about/technology/drawing-compare",
    );
    expect(screen.getByTestId("benchmark-cross-link-service-compare").getAttribute("href")).toBe("/about/compare");
    expect(BENCHMARK_CROSS_LINKS.length).toBeGreaterThanOrEqual(4);

    for (const link of container.querySelectorAll("a[href]")) {
      expect(link.className, link.textContent ?? "").toContain("min-h-11");
    }
  });

  it.each([
    ["brushes", "/about/technology/benchmarks/brushes", BenchmarkBrushesPage, "브러시 종류별"],
    ["filters", "/about/technology/benchmarks/filters", BenchmarkFiltersPage, "필터 · 리터칭"],
    ["collab-office", "/about/technology/benchmarks/collab-office", BenchmarkCollabOfficePage, "실시간 협업"],
    ["3d-studio", "/about/technology/benchmarks/3d-studio", Benchmark3dStudioPage, "3D 배경"],
    ["ai-assist", "/about/technology/benchmarks/ai-assist", BenchmarkAiAssistPage, "AI 보조"],
  ] as const)("세부 벤치마크 라우트 %s (%s)를 정상 렌더링한다", (_id, path, PageComponent, headingPart) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <PageComponent />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(headingPart);
    expect(screen.getByRole("heading", { level: 2, name: /경쟁 도구가 앞서는 영역/u })).toBeTruthy();
  });

  it("세부 페이지에서 검색, 서브그룹 필터, 경쟁 툴 토글, 근거 펼침이 정확히 동작한다", () => {
    render(
      <MemoryRouter initialEntries={["/about/technology/benchmarks/3d-studio"]}>
        <Benchmark3dStudioPage />
      </MemoryRouter>,
    );

    const searchInput = screen.getByRole("searchbox");
    fireEvent.change(searchInput, { target: { value: "Shapr3D" } });
    expect(screen.getByTestId("benchmark-row-direct-cad-shapr3d")).toBeTruthy();
    expect(screen.queryByTestId("benchmark-row-pbd-cloth-drape")).toBeNull();

    // 근거 패널 펼침 토글 확인
    const toggleBtn = screen.getByTestId("benchmark-evidence-toggle-direct-cad-shapr3d");
    fireEvent.click(toggleBtn);
    const panel = screen.getByTestId("benchmark-evidence-table-direct-cad-shapr3d");
    expect(panel.textContent).toContain("studio-hybrid-cad-direct-gestures.ts");

    // 경쟁 도구 선택/해제 토글 확인
    const shaprToggle = screen.getByTestId("benchmark-tool-toggle-shapr3d");
    expect(shaprToggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(shaprToggle);
    expect(shaprToggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("영어 로케일에서 허브와 세부 페이지 UI에 한글이 섞이지 않는다", () => {
    useI18n.getState().setLang("en");
    const { container } = render(
      <MemoryRouter initialEntries={["/about/technology/benchmarks/ai-assist"]}>
        <BenchmarkAiAssistPage />
      </MemoryRouter>,
    );
    expect(HANGUL.test(container.textContent ?? "")).toBe(false);
  });
});

describe("6개 벤치마크 라우트 등록·공개 셸·SEO·브레드크럼·디렉터리 연결", () => {
  it("허브 + 5대 세부 라우트가 라우터·공개 셸·SEO·브레드크럼·시각 분류·사이트맵·허브 트랙에 모두 등록돼 있다", () => {
    const legalRoutesSource = readFileSync(
      join(process.cwd(), "apps/web/src/app/routes/groups/legal.routes.tsx"),
      "utf8",
    );
    const breadcrumbSource = readFileSync(
      join(process.cwd(), "apps/web/src/app/routes/route-breadcrumb.ts"),
      "utf8",
    );
    const stageDesignSource = readFileSync(
      join(process.cwd(), "apps/web/src/app/routes/route-stage-design.ts"),
      "utf8",
    );
    const directoryPaths = new Set(SITEMAP_DIRECTORY_ENTRIES.map((entry) => entry.href));

    expect(stageDesignSource).toContain('"/about/technology"');

    for (const routePath of BENCHMARK_ROUTES) {
      expect(legalRoutesSource, `legalRoutes missing ${routePath}`).toContain(`path: "${routePath}"`);
      expect(breadcrumbSource, `breadcrumb missing ${routePath}`).toContain(`"${routePath}":`);
      expect(isPublicCreativeRoute(routePath), `isPublicCreativeRoute ${routePath}`).toBe(true);
      expect(resolveSeoRoutePolicy(routePath).indexable, `SEO indexable ${routePath}`).toBe(true);
      expect(directoryPaths.has(routePath), `sitemap directory ${routePath}`).toBe(true);
      expect(hubTrackForPath(routePath)?.id, `hub track ${routePath}`).toBe("glance");
    }
  });
});
