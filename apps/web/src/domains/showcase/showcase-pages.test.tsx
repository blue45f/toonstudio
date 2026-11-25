// @vitest-environment jsdom
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BENCHMARK_HEATMAP_LEGEND,
  BENCHMARK_SVG_PIGMENTS,
  COMPETITOR_IDS,
  HEAD_TO_HEAD_PROFILES,
  WORKFLOW_ENVIRONMENTS,
  buildRadarPolygonPoints,
  computeRadarGeometry,
  computeRadarRingPath,
} from "./benchmark-visual-matrix-data";
import { BenchmarkVisualMatrixSection } from "./BenchmarkVisualMatrixSection";
import {
  BENCHMARK_AXES,
  BENCHMARK_DEVICE_CARDS,
  BENCHMARK_PERSONAS,
  BENCHMARK_STATUS_COVERAGE_SCORE,
  BENCHMARK_TOOLS,
  STUDIO_BENCHMARK_SNAPSHOT,
  computeToolAverageCoverageIndex,
  getBenchmarkAxesByCategory,
  getToolAxisCoverageScore,
} from "./competitor-benchmark-data";
import {
  AI_HARNESS_PILLARS,
  NEXTGEN_CHROME_API_SPECS,
  REMOTION_CODE_RECIPES,
  TECH_ARCHITECTURE_CARDS,
  probeBrowserNextGenWebApis,
} from "./nextgen-tech-showcase-data";
import {
  installSpeculationRulesOnce,
  startSafeViewTransition,
} from "./nextgen-web-platform-enhancer";
import { StudioCompetitorBenchmarkPage } from "./StudioCompetitorBenchmarkPage";
import { ToonStudioTechShowcasePage } from "./ToonStudioTechShowcasePage";

import { useI18n } from "@/shared/lib/i18n";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");

const REQUIRED_SHOWCASE_SPRITES = [
  "/assets/studio/vibrant-sprites/emblem-benchmark.webp",
  "/assets/studio/vibrant-sprites/emblem-tech-lab.webp",
  "/assets/studio/vibrant-sprites/tech-remotion.webp",
  "/assets/studio/vibrant-sprites/tech-webgpu.webp",
  ...BENCHMARK_DEVICE_CARDS.map((card) => card.spritePath),
] as const;

describe("Showcase data contracts & sprite assets", () => {
  it("verifies all referenced vibrant sprite WebP assets exist on disk", () => {
    for (const spriteUrl of REQUIRED_SHOWCASE_SPRITES) {
      const diskPath = path.join(REPO_ROOT, "apps/web/public", spriteUrl.replace(/^\//u, ""));
      expect(existsSync(diskPath), spriteUrl).toBe(true);
    }
  });

  it("maintains 7 tools, 9 axes (preserving legacy 7 + 2 new), 4 personas, and honest 2026-11 benchmark metadata", () => {
    expect(STUDIO_BENCHMARK_SNAPSHOT).toBe("2026-11");
    expect(BENCHMARK_TOOLS.map((tool) => tool.id)).toEqual([
      "toonstudio",
      "csp",
      "procreate",
      "photoshop",
      "rebelle7",
      "blender",
      "ibispaint",
    ]);
    expect(BENCHMARK_AXES).toHaveLength(9);
    expect(BENCHMARK_AXES.map((axis) => axis.id)).toEqual([
      "install-device",
      "drawing-pigment",
      "scene3d-vrm",
      "webtoon-animatic",
      "collab-local-db",
      "rights-delivery",
      "pricing-interop",
      "brush-tactile-perf",
      "nondestructive-assist",
    ]);
    expect(BENCHMARK_PERSONAS).toHaveLength(4);
    expect(BENCHMARK_DEVICE_CARDS).toHaveLength(6);

    for (const axis of BENCHMARK_AXES) {
      for (const tool of BENCHMARK_TOOLS) {
        expect(axis.cells[tool.id].badge.ko.length).toBeGreaterThan(0);
        expect(axis.cells[tool.id].badge.en.length).toBeGreaterThan(0);
      }
    }
  });

  it("exposes 8 architecture cards, Remotion recipes, AI harness pillars, and 8 Chrome APIs", () => {
    expect(TECH_ARCHITECTURE_CARDS).toHaveLength(8);
    expect(REMOTION_CODE_RECIPES.length).toBeGreaterThanOrEqual(3);
    expect(AI_HARNESS_PILLARS.length).toBeGreaterThanOrEqual(6);
    expect(NEXTGEN_CHROME_API_SPECS).toHaveLength(8);
  });
});

describe("Next-gen Chrome Web API enhancer & probe", () => {
  afterEach(() => {
    document.head.querySelectorAll("script[data-toonstudio-speculation]").forEach((node) => node.remove());
  });

  it("probes full next-gen support vs safe baseline fallback deterministically", () => {
    const full = probeBrowserNextGenWebApis({
      windowObj: {
        EyeDropper: function EyeDropper() {},
        PressureObserver: function PressureObserver() {},
        AudioContext: function AudioContext() {},
        viewport: { segments: [{}, {}] },
        matchMedia: () => ({ matches: false }),
      },
      documentObj: { startViewTransition: () => ({}) },
      navigatorObj: {
        gpu: {},
        storage: { getDirectory: () => Promise.resolve({}) },
        hid: {},
        requestMIDIAccess: () => Promise.resolve({}),
        getGamepads: () => [],
        xr: {},
        hardwareConcurrency: 12,
        maxTouchPoints: 5,
      },
      cssSupports: () => true,
      scriptSupports: () => true,
      popoverSupported: true,
    });

    expect(full.supportedCount).toBe(8);
    expect(full.totalCount).toBe(8);
    expect(full.readinessTier).toBe("nextgen-ready");
    expect(full.hardware.cores).toBe(12);
    expect(full.hardware.computePressure).toBe(true);
    expect(full.hardware.viewportSegments).toBe(true);

    const baseline = probeBrowserNextGenWebApis({
      windowObj: { matchMedia: (query) => ({ matches: query.includes("reduced-motion") }) },
      documentObj: {},
      navigatorObj: { maxTouchPoints: 0 },
      cssSupports: () => false,
      scriptSupports: () => false,
      popoverSupported: false,
    });

    expect(baseline.supportedCount).toBe(0);
    expect(baseline.readinessTier).toBe("baseline");
    expect(baseline.hardware.prefersReducedMotion).toBe(true);
  });

  it("uses View Transitions when supported and respects reduced-motion / fallback safely", () => {
    const update = vi.fn();
    const startViewTransition = vi.fn((cb: () => void) => {
      cb();
      return { finished: Promise.resolve() };
    });

    const supported = startSafeViewTransition(update, {
      doc: { startViewTransition },
      win: { matchMedia: () => ({ matches: false }) as MediaQueryList },
    });
    expect(supported).toEqual({ usedViewTransition: true, reason: "view-transition" });
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);

    const reducedUpdate = vi.fn();
    const reduced = startSafeViewTransition(reducedUpdate, {
      doc: { startViewTransition },
      win: { matchMedia: (q) => ({ matches: q.includes("reduced-motion") }) as MediaQueryList },
    });
    expect(reduced).toEqual({ usedViewTransition: false, reason: "reduced-motion" });
    expect(reducedUpdate).toHaveBeenCalledTimes(1);

    const fallbackUpdate = vi.fn();
    const unsupported = startSafeViewTransition(fallbackUpdate, {
      doc: {},
      win: { matchMedia: () => ({ matches: false }) as MediaQueryList },
    });
    expect(unsupported).toEqual({ usedViewTransition: false, reason: "unsupported" });
    expect(fallbackUpdate).toHaveBeenCalledTimes(1);
  });

  it("installs Speculation Rules once idempotently and skips cleanly when unsupported", () => {
    const unsupported = installSpeculationRulesOnce({
      doc: document,
      scriptSupports: () => false,
    });
    expect(unsupported.installed).toBe(false);
    expect(unsupported.status).toBe("unsupported");

    const first = installSpeculationRulesOnce({
      doc: document,
      scriptSupports: (type) => type === "speculationrules",
    });
    expect(first.installed).toBe(true);
    expect(first.status).toBe("installed");

    const second = installSpeculationRulesOnce({
      doc: document,
      scriptSupports: (type) => type === "speculationrules",
    });
    expect(second.installed).toBe(true);
    expect(second.status).toBe("already-installed");
    expect(document.head.querySelectorAll("script[data-toonstudio-speculation]").length).toBe(1);
  });
});

describe("StudioCompetitorBenchmarkPage (/compare/studio)", () => {
  beforeEach(() => {
    act(() => {
      useI18n.getState().setLang("ko");
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders benchmark matrix, switches persona filters & axes, refreshes live probe, and toggles high-contrast & en", () => {
    render(
      <MemoryRouter initialEntries={["/compare/studio"]}>
        <StudioCompetitorBenchmarkPage />
      </MemoryRouter>,
    );

    const root = screen.getByTestId("studio-benchmark-page");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("ToonStudio vs 글로벌 제작 도구 6종");
    expect(screen.getByTestId("benchmark-live-probe")).toBeTruthy();

    for (const api of NEXTGEN_CHROME_API_SPECS) {
      const badge = screen.getByTestId(`benchmark-probe-status-${api.id}`);
      expect(badge.className).toContain("shrink-0");
      expect(badge.className).toContain("whitespace-nowrap");
    }

    for (const tool of BENCHMARK_TOOLS) {
      expect(screen.getByTestId(`benchmark-tool-cell-${tool.id}`)).toBeTruthy();
    }
    for (const device of BENCHMARK_DEVICE_CARDS) {
      expect(screen.getByTestId(`benchmark-device-card-${device.id}`)).toBeTruthy();
    }

    // 페르소나 필터 전환
    fireEvent.click(screen.getByTestId("benchmark-persona-tech-director"));
    expect(screen.getByTestId("benchmark-persona-spotlight-tech-director")).toBeTruthy();
    expect(screen.getByTestId("benchmark-axis-panel-scene3d-vrm")).toBeTruthy();

    // 전체 복귀 후 축 전환
    fireEvent.click(screen.getByTestId("benchmark-persona-all"));
    fireEvent.click(screen.getByTestId("benchmark-axis-tab-rights-delivery"));
    expect(screen.getByTestId("benchmark-axis-panel-rights-delivery")).toBeTruthy();

    // 라이브 프로브 갱신
    fireEvent.click(screen.getByTestId("benchmark-probe-refresh"));
    expect(screen.getByTestId("benchmark-live-probe").textContent).toContain("#2");

    // 고대비 토글
    const hcButton = screen.getByTestId("benchmark-high-contrast-toggle");
    expect(root.getAttribute("data-showcase-high-contrast")).toBe("false");
    fireEvent.click(hcButton);
    expect(root.getAttribute("data-showcase-high-contrast")).toBe("true");
    expect(hcButton.getAttribute("aria-pressed")).toBe("true");

    // 영문 전환 시 한글 잔류 0건
    act(() => {
      useI18n.getState().setLang("en");
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("ToonStudio vs. 6 Global Creative Tools");
    expect(root.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);
  });
});

describe("ToonStudioTechShowcasePage (/tech)", () => {
  beforeEach(() => {
    act(() => {
      useI18n.getState().setLang("ko");
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("switches across all 4 tabs, switches Remotion recipes, runs live Chrome API probe, and toggles high-contrast & en", () => {
    render(
      <MemoryRouter initialEntries={["/tech"]}>
        <ToonStudioTechShowcasePage />
      </MemoryRouter>,
    );

    const root = screen.getByTestId("tech-showcase-page");
    expect(screen.getByTestId("tech-panel-architecture")).toBeTruthy();
    for (const card of TECH_ARCHITECTURE_CARDS) {
      expect(screen.getByTestId(`tech-arch-card-${card.id}`)).toBeTruthy();
    }

    // 탭 2: Remotion 파이프라인 & 레시피 전환
    fireEvent.click(screen.getByTestId("tech-tab-remotion"));
    expect(screen.getByTestId("tech-panel-remotion")).toBeTruthy();
    expect(screen.getByTestId("remotion-recipe-code").textContent).toContain("useCurrentFrame");

    fireEvent.click(screen.getByTestId("remotion-recipe-cli-deterministic-render"));
    expect(screen.getByTestId("remotion-recipe-code").textContent).toContain("tools/media/brand-film");

    // 탭 3: AI 개발 스킬
    fireEvent.click(screen.getByTestId("tech-tab-ai-skills"));
    expect(screen.getByTestId("tech-panel-ai-skills")).toBeTruthy();
    expect(screen.getByTestId("ai-pillar-unconnected-code-gate")).toBeTruthy();

    // 탭 4: 차세대 크롬 API 라이브 프로브
    fireEvent.click(screen.getByTestId("tech-tab-chrome-apis"));
    expect(screen.getByTestId("tech-panel-chrome-apis")).toBeTruthy();
    for (const api of NEXTGEN_CHROME_API_SPECS) {
      expect(screen.getByTestId(`tech-chrome-api-${api.id}`)).toBeTruthy();
    }

    fireEvent.click(screen.getByTestId("tech-view-transition-demo"));
    expect(screen.getByTestId("tech-probe-runtime-banner").textContent).toContain("#1");

    // 탭 5: 범용 9-LLM · CLI · MCP · API 가이드
    fireEvent.click(screen.getByTestId("tech-tab-llm-mcp-api"));
    expect(screen.getByTestId("tech-panel-llm-mcp-api")).toBeTruthy();
    fireEvent.click(screen.getByTestId("llm-client-claude-code"));
    expect(screen.getByTestId("llm-client-config-json").textContent).toContain("claude-code");
    fireEvent.click(screen.getByTestId("mcp-tool-studio_stroke_endurance_bench"));
    expect(screen.getByTestId("mcp-tool-detail").textContent).toContain("10000");

    // 탭 6: 최신 논문 근거 & 전 페이지 UI/UX 설계
    fireEvent.click(screen.getByTestId("tech-tab-papers-rd"));
    expect(screen.getByTestId("tech-panel-papers-rd")).toBeTruthy();
    expect(screen.getByTestId("research-paper-kubelka-munk-1931")).toBeTruthy();
    expect(screen.getByTestId("sitewide-ux-axis-route-transition-choreography")).toBeTruthy();
    fireEvent.click(screen.getByTestId("paper-filter-crdt"));
    expect(screen.getByTestId("research-paper-yata-yjs-2016")).toBeTruthy();

    // 고대비 토글
    const hcButton = screen.getByTestId("tech-high-contrast-toggle");
    fireEvent.click(hcButton);
    expect(root.getAttribute("data-showcase-high-contrast")).toBe("true");

    // 영문 전환 시 전 탭 한글 잔류 0건
    act(() => {
      useI18n.getState().setLang("en");
    });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Next-Gen Web, Remotion & AI Engineering Showcase");
    expect(root.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);
    fireEvent.click(screen.getByTestId("tech-tab-llm-mcp-api"));
    expect(root.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);
  });
});

describe("Wave 49C — 9-axis benchmark visual matrix, 1:1 head-to-head & semantic SVG charts", () => {
  afterEach(() => {
    cleanup();
  });

  it("verifies all 9 axes evidencePaths exist on disk and credits native competitor strengths honestly on new axes", () => {
    for (const axis of BENCHMARK_AXES) {
      expect(axis.evidencePaths.length).toBeGreaterThan(0);
      for (const relPath of axis.evidencePaths) {
        expect(existsSync(path.join(REPO_ROOT, relPath)), `${axis.id}: ${relPath}`).toBe(true);
      }
    }

    const tactileAxis = BENCHMARK_AXES.find((axis) => axis.id === "brush-tactile-perf");
    const assistAxis = BENCHMARK_AXES.find((axis) => axis.id === "nondestructive-assist");
    expect(tactileAxis?.order).toBe(8);
    expect(tactileAxis?.cells.rebelle7.status).toBe("native-strength");
    expect(tactileAxis?.cells.procreate.status).toBe("native-strength");
    expect(tactileAxis?.cells.csp.status).toBe("native-strength");
    expect(tactileAxis?.cells.toonstudio.status).toBe("partial");
    expect(assistAxis?.order).toBe(9);
    expect(assistAxis?.cells.toonstudio.status).toBe("partial");
    expect(assistAxis?.cells.toonstudio.note.ko).toContain("실제 컷 반영이나 저장은 현재 확인되지 않았습니다.");
    expect(tactileAxis?.documentation?.procreate).toBe("https://help.procreate.com/procreate/handbook/brushes/brush-studio-settings");
  });

  it("partitions the 9 axes evenly into 3 domain categories and computes deterministic public-spec coverage scores", () => {
    expect(getBenchmarkAxesByCategory("all")).toHaveLength(9);
    expect(getBenchmarkAxesByCategory("drawing-tactile")).toHaveLength(3);
    expect(getBenchmarkAxesByCategory("scene3d-webtoon")).toHaveLength(3);
    expect(getBenchmarkAxesByCategory("collab-delivery")).toHaveLength(3);

    expect(BENCHMARK_STATUS_COVERAGE_SCORE.current).toBe(100);
    expect(BENCHMARK_STATUS_COVERAGE_SCORE["native-strength"]).toBe(100);
    expect(BENCHMARK_STATUS_COVERAGE_SCORE.none).toBe(0);

    for (const tool of BENCHMARK_TOOLS) {
      const avg = computeToolAverageCoverageIndex(tool.id, BENCHMARK_AXES);
      expect(avg).toBeGreaterThanOrEqual(0);
      expect(avg).toBeLessThanOrEqual(100);
      for (const axis of BENCHMARK_AXES) {
        const score = getToolAxisCoverageScore(axis, tool.id);
        expect(score).toBe(BENCHMARK_STATUS_COVERAGE_SCORE[axis.cells[tool.id].status]);
      }
    }
  });

  it("validates all 6 Head-to-Head competitor profiles expose leads, candid rival strengths, and open round-trip formats", () => {
    expect(COMPETITOR_IDS).toEqual(["csp", "procreate", "photoshop", "rebelle7", "blender", "ibispaint"]);
    for (const compId of COMPETITOR_IDS) {
      const profile = HEAD_TO_HEAD_PROFILES[compId];
      expect(profile.competitorId).toBe(compId);
      expect(profile.toonstudioLeads.length).toBeGreaterThanOrEqual(3);
      expect(profile.competitorStrengths.length).toBeGreaterThanOrEqual(3);
      expect(profile.roundTripFormats.length).toBeGreaterThanOrEqual(2);
      expect(profile.roundTripSteps).toHaveLength(3);
      expect(profile.headline.en).not.toMatch(/[\uAC00-\uD7A3]/u);
      expect(profile.honestVerdict.en).not.toMatch(/[\uAC00-\uD7A3]/u);
    }
  });

  it("validates all 3 workflow toolchain environments compare concrete legacy steps against 3-step ToonStudio browser flow", () => {
    expect(WORKFLOW_ENVIRONMENTS.map((env) => env.id)).toEqual([
      "solo-webtoon",
      "five-person-team",
      "ipad-desktop-hybrid",
    ]);
    for (const env of WORKFLOW_ENVIRONMENTS) {
      expect(env.legacySteps.length).toBeGreaterThan(env.toonstudioSteps.length);
      expect(env.toonstudioSteps).toHaveLength(3);
      expect(env.coexistenceNote.ko.length).toBeGreaterThan(10);
      expect(env.coexistenceNote.en).not.toMatch(/[\uAC00-\uD7A3]/u);
    }
  });

  it("computes finite 9-axis SVG radar polygon geometry and concentric rings", () => {
    const pts = computeRadarGeometry("toonstudio", BENCHMARK_AXES);
    expect(pts).toHaveLength(9);
    for (const pt of pts) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
      expect(Number.isFinite(pt.labelX)).toBe(true);
      expect(Number.isFinite(pt.labelY)).toBe(true);
    }
    const polygon = buildRadarPolygonPoints(pts);
    expect(polygon.split(" ")).toHaveLength(9);
    const ring = computeRadarRingPath(9, 0.5);
    expect(ring.split(" ")).toHaveLength(9);
  });

  it("enforces violet-free OKLCH hues (0% in 270..320 deg) and zero raw hex/rgb/hsl across pigments", () => {
    const colorStrings = [
      ...Object.values(BENCHMARK_SVG_PIGMENTS),
      ...BENCHMARK_HEATMAP_LEGEND.map((item) => item.oklchStroke),
    ];
    expect(BENCHMARK_HEATMAP_LEGEND).toHaveLength(5);

    for (const value of colorStrings) {
      expect(value).not.toMatch(/#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(/i);
      const match = value.match(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/);
      expect(match, value).not.toBeNull();
      const hue = Number(match![1]);
      expect(hue < 270 || hue > 320, `${value} hue=${hue}`).toBe(true);
    }
  });

  it("renders the 7x9 visual heatmap (63 cells) and filters rows across all 4 domain category tabs", () => {
    render(<BenchmarkVisualMatrixSection locale="ko" />);

    expect(screen.getByTestId("visual-heatmap-section")).toBeTruthy();
    expect(screen.getByTestId("visual-heatmap-legend").querySelectorAll("li")).toHaveLength(5);
    expect(screen.getByTestId("visual-heatmap-table").querySelectorAll("tbody tr")).toHaveLength(9);

    for (const axis of BENCHMARK_AXES) {
      for (const tool of BENCHMARK_TOOLS) {
        expect(screen.getByTestId(`heatmap-cell-${axis.id}-${tool.id}`)).toBeTruthy();
      }
    }

    fireEvent.click(screen.getByTestId("heatmap-filter-drawing-tactile"));
    expect(screen.getByTestId("visual-heatmap-table").querySelectorAll("tbody tr")).toHaveLength(3);
    expect(screen.getByTestId("heatmap-row-brush-tactile-perf")).toBeTruthy();
    expect(screen.queryByTestId("heatmap-row-nondestructive-assist")).toBeNull();

    fireEvent.click(screen.getByTestId("heatmap-filter-scene3d-webtoon"));
    expect(screen.getByTestId("visual-heatmap-table").querySelectorAll("tbody tr")).toHaveLength(3);
    expect(screen.getByTestId("heatmap-row-nondestructive-assist")).toBeTruthy();

    fireEvent.click(screen.getByTestId("heatmap-filter-collab-delivery"));
    expect(screen.getByTestId("visual-heatmap-table").querySelectorAll("tbody tr")).toHaveLength(3);
    expect(screen.getByTestId("heatmap-row-rights-delivery")).toBeTruthy();

    fireEvent.click(screen.getByTestId("heatmap-filter-all"));
    expect(screen.getByTestId("visual-heatmap-table").querySelectorAll("tbody tr")).toHaveLength(9);
  });

  it("updates inspector bar, syncs 1:1 matchup opponent, and invokes onSelectAxis when clicking heatmap cells", () => {
    const onSelectAxis = vi.fn();
    render(<BenchmarkVisualMatrixSection locale="ko" onSelectAxis={onSelectAxis} />);

    fireEvent.click(screen.getByTestId("heatmap-cell-brush-tactile-perf-rebelle7"));
    expect(onSelectAxis).toHaveBeenCalledWith("brush-tactile-perf");
    expect(screen.getByTestId("heatmap-inspector-bar").textContent).toContain("Rebelle 7");
    expect(screen.getByTestId("h2h-active-panel-rebelle7")).toBeTruthy();
    expect(screen.getByTestId("benchmark-coverage-svg").getAttribute("data-competitor-id")).toBe("rebelle7");
  });

  it("switches all 6 competitors in 1:1 Head-to-Head comparator and displays all 3 structured cards", () => {
    render(<BenchmarkVisualMatrixSection locale="ko" />);

    for (const compId of COMPETITOR_IDS) {
      fireEvent.click(screen.getByTestId(`h2h-competitor-${compId}`));
      expect(screen.getByTestId(`h2h-competitor-${compId}`).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByTestId(`h2h-active-panel-${compId}`)).toBeTruthy();
      expect(screen.getByTestId("h2h-toonstudio-leads").querySelectorAll("li").length).toBeGreaterThanOrEqual(3);
      expect(screen.getByTestId("h2h-competitor-strengths").querySelectorAll("li").length).toBeGreaterThanOrEqual(3);
      expect(screen.getByTestId("h2h-roundtrip-paths").querySelectorAll("li")).toHaveLength(3);
    }
  });

  it("renders pure semantic SVG coverage chart with mandatory honesty label and toggles radar vs bar mode", () => {
    render(<BenchmarkVisualMatrixSection locale="ko" />);

    const badge = screen.getByTestId("coverage-honesty-badge");
    expect(badge.textContent).toContain("공개 스펙 커버리지 지수 · 실측 성능 아님");

    const radarSvg = screen.getByTestId("benchmark-coverage-svg");
    expect(radarSvg.getAttribute("data-chart-mode")).toBe("radar");
    expect(screen.getByTestId("radar-polygon-toonstudio")).toBeTruthy();
    expect(screen.getByTestId("radar-polygon-competitor")).toBeTruthy();
    expect(radarSvg.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(/i);

    fireEvent.click(screen.getByTestId("coverage-mode-bar"));
    const barSvg = screen.getByTestId("benchmark-coverage-svg");
    expect(barSvg.getAttribute("data-chart-mode")).toBe("bar");
    expect(screen.getByTestId("bar-row-brush-tactile-perf")).toBeTruthy();
    expect(screen.getByTestId("bar-row-nondestructive-assist")).toBeTruthy();
    expect(barSvg.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|hsl\(/i);
  });

  it("switches across all 3 workflow environments and compares legacy multi-tool vs ToonStudio 3-step flow", () => {
    render(<BenchmarkVisualMatrixSection locale="ko" />);

    expect(screen.getByTestId("workflow-track-legacy").getAttribute("data-step-count")).toBe("5");
    expect(screen.getByTestId("workflow-track-toonstudio").getAttribute("data-step-count")).toBe("3");

    fireEvent.click(screen.getByTestId("workflow-env-five-person-team"));
    expect(screen.getByTestId("workflow-track-legacy").getAttribute("data-step-count")).toBe("6");
    expect(screen.getByTestId("workflow-track-toonstudio").getAttribute("data-step-count")).toBe("3");
    expect(screen.getByTestId("workflow-coexistence-note").textContent).toContain("CMYK");

    fireEvent.click(screen.getByTestId("workflow-env-ipad-desktop-hybrid"));
    expect(screen.getByTestId("workflow-track-legacy").getAttribute("data-step-count")).toBe("5");
    expect(screen.getByTestId("workflow-track-toonstudio").getAttribute("data-step-count")).toBe("3");
    expect(screen.getByTestId("workflow-coexistence-note").textContent).toContain("Procreate");
  });

  it("enforces zero Korean leakage in English mode across all interactive states and min-h-11 on every button", () => {
    render(<BenchmarkVisualMatrixSection locale="en" />);
    const root = screen.getByTestId("benchmark-visual-matrix-hub");

    const buttons = root.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThan(20);
    for (const button of buttons) {
      expect(button.className, button.getAttribute("data-testid") ?? button.textContent ?? "button").toContain("min-h-11");
    }

    expect(screen.getByTestId("coverage-honesty-badge").textContent).toContain(
      "Public-Spec Coverage Index · Not a Performance Benchmark",
    );
    expect(root.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);

    for (const compId of COMPETITOR_IDS) {
      fireEvent.click(screen.getByTestId(`h2h-competitor-${compId}`));
      expect(root.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);
    }

    fireEvent.click(screen.getByTestId("coverage-mode-bar"));
    expect(root.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);

    for (const env of WORKFLOW_ENVIRONMENTS) {
      fireEvent.click(screen.getByTestId(`workflow-env-${env.id}`));
      expect(root.textContent).not.toMatch(/[\uAC00-\uD7A3]/u);
    }
  });
});
