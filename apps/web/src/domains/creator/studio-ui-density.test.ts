import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_UI_DENSITY_MODE,
  isStudioUiAdvancedRegion,
  loadStudioUiDensityState,
  normalizeStudioUiDensityMode,
  normalizeStudioUiDensityState,
  resolveStudioUiDensityInitialMode,
  saveStudioUiDensityState,
  STUDIO_UI_ADVANCED_REGIONS,
  STUDIO_UI_CHROME_REGIONS,
  STUDIO_UI_CORE_REGIONS,
  STUDIO_UI_DENSITY_ENTRY_INITIAL_MODE,
  STUDIO_UI_DENSITY_MATRIX,
  STUDIO_UI_DENSITY_MODES,
  STUDIO_UI_DENSITY_POLICY,
  studioUiAdvancedToolsToggleAccessibleName,
  studioUiAdvancedToolsToggleLabel,
  studioUiAdvancedToolsToggleTooltip,
  studioUiDensityAdvancedExpanded,
  studioUiDensityAllows,
  studioUiDensityDescription,
  studioUiDensityFirstScreenExposure,
  studioUiDensityFirstScreenVisibleRegions,
  studioUiDensityFromImmersive,
  studioUiDensityLabel,
  studioUiDensityPolicy,
  type StudioUiChromeRegion,
  type StudioUiDensityMode,
} from "./studio-ui-density";

describe("studio ui density modes", () => {
  it("starts new users in standard work and uses task-oriented labels", () => {
    expect(DEFAULT_STUDIO_UI_DENSITY_MODE).toBe("simple");
    expect(STUDIO_UI_DENSITY_MODES).toEqual(["focus", "simple", "full"]);
    expect(normalizeStudioUiDensityMode("nope")).toBe("simple");
    expect(normalizeStudioUiDensityMode("simple")).toBe("simple");
    expect(studioUiDensityFromImmersive(true)).toBe("focus");
    expect(studioUiDensityLabel("focus")).toBe("집중 작업");
    expect(studioUiDensityLabel("simple")).toBe("기본 작업");
    expect(studioUiDensityLabel("full")).toBe("전체 도구");
  });

  it("never exposes raw translation keys when a locale entry is missing", () => {
    const untranslated = (key: string) => key;
    expect(studioUiDensityLabel("focus", untranslated)).toBe("집중 작업");
    expect(studioUiDensityLabel("simple", untranslated)).toBe("기본 작업");
    expect(studioUiDensityDescription("full", untranslated)).toBe(
      "AI·3D를 포함한 모든 전문 도구와 패널을 표시합니다.",
    );
    expect(studioUiDensityLabel("full", () => "All tools")).toBe("All tools");
  });

  it("folds AI in standard work but honors reference tools users explicitly expose", () => {
    expect(studioUiDensityAllows("simple", "toolbar-draw")).toBe(true);
    expect(studioUiDensityAllows("simple", "toolbar-ai")).toBe(false);
    expect(studioUiDensityAllows("simple", "toolbar-reference")).toBe(true);
    expect(studioUiDensityAllows("simple", "toolbar-assets")).toBe(true);
    expect(studioUiDensityAllows("simple", "toolbar-insert")).toBe(true);
    expect(studioUiDensityAllows("focus", "toolbar-draw")).toBe(true);
    expect(studioUiDensityAllows("focus", "tool-rail")).toBe(true);
    expect(studioUiDensityAllows("focus", "quick-actions")).toBe(true);
    expect(studioUiDensityAllows("focus", "toolbar-assets")).toBe(true);
    expect(studioUiDensityAllows("focus", "toolbar-insert")).toBe(true);
    expect(studioUiDensityAllows("focus", "toolbar-cut")).toBe(true);
    expect(studioUiDensityAllows("focus", "toolbar-ai")).toBe(false);
    expect(studioUiDensityAllows("focus", "toolbar-reference")).toBe(false);
    expect(studioUiDensityAllows("focus", "right-panel")).toBe(false);
    expect(studioUiDensityAllows("full", "toolbar-ai")).toBe(true);
  });

  it("persists an existing user's density choice", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };
    expect(saveStudioUiDensityState(storage, { mode: "full" })).toBe(true);
    expect(loadStudioUiDensityState(storage).mode).toBe("full");
  });
});

describe("studio ui density policy declaration (BLUEPRINT §4.1)", () => {
  // The §4.1 table, pinned literally: any policy change must edit this expectation too.
  const EXPECTED_MATRIX: Record<StudioUiDensityMode, Record<StudioUiChromeRegion, boolean>> = {
    focus: {
      "toolbar-assets": true,
      "toolbar-cut": true,
      "toolbar-draw": true,
      "toolbar-reference": false,
      "toolbar-scene": false,
      "toolbar-style": false,
      "toolbar-ai": false,
      "toolbar-insert": true,
      "left-panel": false,
      "right-panel": false,
      "page-strip": false,
      "status-rail": true,
      "tool-rail": true,
      "quick-actions": true,
    },
    simple: {
      "toolbar-assets": true,
      "toolbar-cut": true,
      "toolbar-draw": true,
      "toolbar-reference": true,
      "toolbar-scene": true,
      "toolbar-style": true,
      "toolbar-ai": false,
      "toolbar-insert": true,
      "left-panel": true,
      "right-panel": true,
      "page-strip": true,
      "status-rail": true,
      "tool-rail": true,
      "quick-actions": true,
    },
    full: {
      "toolbar-assets": true,
      "toolbar-cut": true,
      "toolbar-draw": true,
      "toolbar-reference": true,
      "toolbar-scene": true,
      "toolbar-style": true,
      "toolbar-ai": true,
      "toolbar-insert": true,
      "left-panel": true,
      "right-panel": true,
      "page-strip": true,
      "status-rail": true,
      "tool-rail": true,
      "quick-actions": true,
    },
  };

  it("declares every mode × region cell and judges only through the matrix", () => {
    expect(STUDIO_UI_CHROME_REGIONS).toHaveLength(14);
    for (const mode of STUDIO_UI_DENSITY_MODES) {
      expect(Object.keys(STUDIO_UI_DENSITY_MATRIX[mode]).sort()).toEqual(
        [...STUDIO_UI_CHROME_REGIONS].sort(),
      );
      for (const region of STUDIO_UI_CHROME_REGIONS) {
        expect(typeof STUDIO_UI_DENSITY_MATRIX[mode][region]).toBe("boolean");
        expect(studioUiDensityAllows(mode, region)).toBe(EXPECTED_MATRIX[mode][region]);
        expect(STUDIO_UI_DENSITY_MATRIX[mode][region]).toBe(EXPECTED_MATRIX[mode][region]);
      }
    }
  });

  it("pins the §4.1 policy table: chrome, exposure, panels, persistence per mode", () => {
    expect(STUDIO_UI_DENSITY_POLICY).toEqual({
      focus: {
        chrome: "minimal",
        commandExposure: "core",
        panelScope: "active-only",
        persistence: "session",
      },
      simple: {
        chrome: "standard",
        commandExposure: "core-contextual",
        panelScope: "core",
        persistence: "persisted",
      },
      full: {
        chrome: "full",
        commandExposure: "all",
        panelScope: "all",
        persistence: "persisted",
      },
    });
    expect(studioUiDensityPolicy("focus").persistence).toBe("session");
    expect(studioUiDensityPolicy("nope" as StudioUiDensityMode)).toEqual(
      STUDIO_UI_DENSITY_POLICY.simple,
    );
  });

  it("pins the entry-path initial modes and always respects a saved choice", () => {
    expect(STUDIO_UI_DENSITY_ENTRY_INITIAL_MODE).toEqual({
      "first-entry": "simple",
      "learning-mission": "simple",
      "review-link": "simple",
    });
    // No saved choice (or a corrupt one) falls back to the entry default.
    expect(resolveStudioUiDensityInitialMode("first-entry", null)).toBe("simple");
    expect(resolveStudioUiDensityInitialMode("learning-mission", undefined)).toBe("simple");
    expect(resolveStudioUiDensityInitialMode("review-link", "bogus")).toBe("simple");
    // A persisted choice wins on every entry path — focus included (§4.1 rollback guard).
    for (const entry of ["first-entry", "learning-mission", "review-link"] as const) {
      expect(resolveStudioUiDensityInitialMode(entry, "full")).toBe("full");
      expect(resolveStudioUiDensityInitialMode(entry, "focus")).toBe("focus");
      expect(resolveStudioUiDensityInitialMode(entry, "simple")).toBe("simple");
    }
  });
});

describe("studio first-screen exposure (complexity diet)", () => {
  it("partitions every chrome region into core or advanced exactly once", () => {
    const all = [...STUDIO_UI_CORE_REGIONS, ...STUDIO_UI_ADVANCED_REGIONS];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(14);
    expect([...all].sort()).toEqual([...STUDIO_UI_CHROME_REGIONS].sort());
    expect(isStudioUiAdvancedRegion("toolbar-ai")).toBe(true);
    expect(isStudioUiAdvancedRegion("toolbar-reference")).toBe(true);
    expect(isStudioUiAdvancedRegion("toolbar-draw")).toBe(false);
  });

  it("folds the advanced clusters on a fresh simple entry and keeps the core visible", () => {
    for (const region of STUDIO_UI_ADVANCED_REGIONS) {
      expect(studioUiDensityFirstScreenExposure("simple", region)).toBe("folded");
    }
    for (const region of STUDIO_UI_CORE_REGIONS) {
      expect(studioUiDensityFirstScreenExposure("simple", region)).toBe("visible");
    }
    // First screen in simple shows the 10 core regions only.
    expect(studioUiDensityFirstScreenVisibleRegions("simple")).toEqual(
      expect.arrayContaining([...STUDIO_UI_CORE_REGIONS]),
    );
    expect(studioUiDensityFirstScreenVisibleRegions("simple")).toHaveLength(10);
  });

  it("reveals folded clusters after expansion without changing the mode", () => {
    expect(studioUiDensityFirstScreenExposure("simple", "toolbar-scene", true)).toBe("visible");
    expect(studioUiDensityFirstScreenVisibleRegions("simple", true)).toHaveLength(14);
  });

  it("never folds in full and keeps the focus set unchanged", () => {
    for (const region of STUDIO_UI_ADVANCED_REGIONS) {
      expect(studioUiDensityFirstScreenExposure("full", region)).toBe("visible");
      expect(studioUiDensityFirstScreenExposure("focus", region)).toBe("hidden");
    }
    expect(studioUiDensityFirstScreenExposure("focus", "toolbar-draw")).toBe("visible");
    expect(studioUiDensityFirstScreenExposure("focus", "right-panel")).toBe("hidden");
  });

  it("persists the expansion choice and defaults legacy states to folded", () => {
    expect(normalizeStudioUiDensityState({ mode: "simple" }).advancedExpanded).toBe(false);
    expect(normalizeStudioUiDensityState({ mode: "simple", advancedExpanded: true }).advancedExpanded).toBe(true);
    expect(normalizeStudioUiDensityState({ mode: "simple", advancedExpanded: "yes" }).advancedExpanded).toBe(false);
    expect(studioUiDensityAdvancedExpanded(undefined)).toBe(false);
    const map = new Map<string, string>();
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
    };
    expect(saveStudioUiDensityState(storage, { mode: "simple", advancedExpanded: true })).toBe(true);
    const loaded = loadStudioUiDensityState(storage);
    expect(loaded.mode).toBe("simple");
    expect(studioUiDensityAdvancedExpanded(loaded)).toBe(true);
  });

  it("labels the single expander in product voice without leaking keys", () => {
    const untranslated = (key: string) => key;
    expect(studioUiAdvancedToolsToggleLabel(false, untranslated)).toBe("고급 도구 펼치기");
    expect(studioUiAdvancedToolsToggleLabel(true, untranslated)).toBe("고급 도구 접기");
    expect(studioUiAdvancedToolsToggleLabel(false, () => "Show advanced tools")).toBe("Show advanced tools");
    // 메뉴 안의 '고급 도구 펼치기 (N개)' 행과 구분되는 접근 이름 — 보이는 글자로 시작한다(WCAG 2.5.3, B-15).
    expect(studioUiAdvancedToolsToggleAccessibleName(false)).toBe("고급 도구 펼치기 (도구 막대)");
    expect(studioUiAdvancedToolsToggleAccessibleName(true)).toBe("고급 도구 접기 (도구 막대)");
    expect(studioUiAdvancedToolsToggleTooltip(false)).toContain("메뉴 안의");
  });
});
