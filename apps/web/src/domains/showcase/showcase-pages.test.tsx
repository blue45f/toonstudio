// @vitest-environment jsdom
import { existsSync } from "node:fs";
import path from "node:path";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BENCHMARK_AXES,
  BENCHMARK_DEVICE_CARDS,
  BENCHMARK_PERSONAS,
  BENCHMARK_TOOLS,
  STUDIO_BENCHMARK_SNAPSHOT,
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

const REPO_ROOT = path.resolve(process.cwd());

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

  it("maintains 7 tools, 7 axes, 4 personas, and honest 2026-11 benchmark metadata", () => {
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
    expect(BENCHMARK_AXES).toHaveLength(7);
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
