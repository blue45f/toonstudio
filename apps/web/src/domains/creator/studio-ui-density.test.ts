import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_UI_DENSITY_MODE,
  loadStudioUiDensityState,
  normalizeStudioUiDensityMode,
  resolveStudioUiDensityInitialMode,
  saveStudioUiDensityState,
  STUDIO_UI_CHROME_REGIONS,
  STUDIO_UI_DENSITY_ENTRY_INITIAL_MODE,
  STUDIO_UI_DENSITY_MATRIX,
  STUDIO_UI_DENSITY_MODES,
  STUDIO_UI_DENSITY_POLICY,
  studioUiDensityAllows,
  studioUiDensityDescription,
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
