import { describe, expect, it } from "vitest";

import {
  isStudioCommandExposed,
  loadPinnedCommandIds,
  normalizePinnedCommandIds,
  savePinnedCommandIds,
  searchStudioCommands,
  STUDIO_COMMAND_ADVANCED_BADGE_LABEL,
  STUDIO_PINNED_COMMANDS_STORAGE_KEY,
  studioCommandEffectiveSurfaces,
  studioCommandsForSurface,
  studioCommandSurfaces,
  studioCommandTier,
  togglePinnedCommandId,
} from "./studio-command-exposure";

import type { StudioCommandExposureEntry } from "./studio-command-exposure";

/** Fixtures mirror measured catalog shapes (category + origin sources). */
const CORE: StudioCommandExposureEntry = {
  id: "edit.undo",
  category: "edit",
  labels: [{ locale: "ko", label: "실행 취소" }, { locale: "en", label: "Undo" }],
  aliases: [{ term: "되돌리기" }],
  origins: [{ source: "menu" }, { source: "quick-access" }, { source: "keymap" }],
};
const CONTEXTUAL: StudioCommandExposureEntry = {
  id: "text.add-balloon",
  category: "text",
  labels: [{ locale: "ko", label: "말풍선 추가" }],
  aliases: [],
  origins: [{ source: "menu" }],
};
const ADVANCED: StudioCommandExposureEntry = {
  id: "filter.gaussian-blur",
  category: "filter",
  labels: [{ locale: "ko", label: "가우시안 흐림" }],
  aliases: [{ term: "블러" }],
  origins: [{ source: "menu" }],
};
const PANEL: StudioCommandExposureEntry = {
  id: "window.layers",
  category: "window",
  labels: [{ locale: "ko", label: "레이어 패널" }],
  aliases: [],
  origins: [{ source: "menu" }],
};
const ALL = [CORE, CONTEXTUAL, ADVANCED, PANEL];

describe("studio command exposure — tier derivation (BLUEPRINT §4.2)", () => {
  it("derives tier from measured origins and category, never a hand list", () => {
    expect(studioCommandTier(CORE)).toBe("core");
    expect(studioCommandTier(CONTEXTUAL)).toBe("contextual");
    expect(studioCommandTier(ADVANCED)).toBe("advanced");
    expect(studioCommandTier(PANEL)).toBe("contextual");
  });

  it("derives surfaces from origins, and palette always carries every command", () => {
    expect(studioCommandSurfaces(CORE)).toContain("menubar");
    expect(studioCommandSurfaces(CORE)).toContain("toolbar");
    expect(studioCommandSurfaces(CORE)).toContain("launcher");
    expect(studioCommandSurfaces(PANEL)).toContain("panel");
    for (const entry of ALL) {
      expect(studioCommandSurfaces(entry)).toContain("palette");
    }
  });
});

describe("studio command exposure — S3-14 acceptance", () => {
  it("command search reaches every tier in every density mode", () => {
    for (const query of ["", "흐림", "blur", "말풍선", "되돌리기"]) {
      const hits = searchStudioCommands(ALL, query, {});
      if (query === "") expect(hits.map((hit) => hit.entry.id)).toHaveLength(4);
      expect(hits.some((hit) => hit.tier === "advanced")).toBe(query === "" || query === "흐림" || query === "blur");
    }
    const advancedHit = searchStudioCommands(ALL, "흐림", {})[0];
    expect(advancedHit?.tier).toBe("advanced");
    expect(advancedHit?.badge).toBe("advanced");
    expect(STUDIO_COMMAND_ADVANCED_BADGE_LABEL).toBe("고급 도구");
    // Search exposure does not depend on mode at all: palette is always full reach.
    expect(isStudioCommandExposed(ADVANCED, "palette", { mode: "focus" })).toBe(true);
    expect(isStudioCommandExposed(ADVANCED, "palette", { mode: "simple" })).toBe(true);
  });

  it("pinned outranks tier and density on toolbar and launcher", () => {
    const pinned = [ADVANCED.id];
    expect(isStudioCommandExposed(ADVANCED, "toolbar", { mode: "focus" })).toBe(false);
    expect(isStudioCommandExposed(ADVANCED, "toolbar", { mode: "focus", pinnedIds: pinned })).toBe(true);
    expect(isStudioCommandExposed(ADVANCED, "launcher", { mode: "simple", pinnedIds: pinned })).toBe(true);
    expect(studioCommandEffectiveSurfaces(ADVANCED, true)).toContain("toolbar");
    expect(studioCommandEffectiveSurfaces(ADVANCED, true)).toContain("launcher");
    // Pinned commands lead the mount point, in pin order.
    const toolbar = studioCommandsForSurface(ALL, "toolbar", { mode: "full", pinnedIds: pinned });
    expect(toolbar[0]?.id).toBe(ADVANCED.id);
    const hits = searchStudioCommands(ALL, "", { pinnedIds: pinned });
    expect(hits[0]?.entry.id).toBe(ADVANCED.id);
    expect(hits[0]?.pinned).toBe(true);
  });

  it("applies the tier × density matrix on mount surfaces", () => {
    expect(isStudioCommandExposed(CORE, "toolbar", { mode: "focus" })).toBe(true);
    expect(isStudioCommandExposed(CONTEXTUAL, "menubar", { mode: "focus" })).toBe(false);
    expect(isStudioCommandExposed(CONTEXTUAL, "menubar", { mode: "simple" })).toBe(false);
    expect(
      isStudioCommandExposed(CONTEXTUAL, "menubar", { mode: "simple", activeCategories: ["text"] }),
    ).toBe(true);
    expect(isStudioCommandExposed(CONTEXTUAL, "menubar", { mode: "full" })).toBe(true);
    expect(isStudioCommandExposed(ADVANCED, "menubar", { mode: "simple", activeCategories: ["filter"] })).toBe(false);
    expect(isStudioCommandExposed(ADVANCED, "menubar", { mode: "full" })).toBe(true);
    expect(isStudioCommandExposed(PANEL, "panel", { mode: "full" })).toBe(true);
    expect(isStudioCommandExposed(PANEL, "toolbar", { mode: "full" })).toBe(false);
  });
});

describe("studio pinned commands — persistence", () => {
  it("normalizes, toggles and round-trips pin order", () => {
    expect(normalizePinnedCommandIds(["a", "a", "", 1, "b"])).toEqual(["a", "b"]);
    expect(normalizePinnedCommandIds("nope")).toEqual([]);
    expect(togglePinnedCommandId([], "x")).toEqual(["x"]);
    expect(togglePinnedCommandId(["x", "y"], "x")).toEqual(["y"]);

    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    };
    expect(savePinnedCommandIds(storage, ["filter.gaussian-blur", "edit.undo"])).toBe(true);
    expect(map.has(STUDIO_PINNED_COMMANDS_STORAGE_KEY)).toBe(true);
    expect(loadPinnedCommandIds(storage)).toEqual(["filter.gaussian-blur", "edit.undo"]);
    expect(loadPinnedCommandIds(null)).toEqual([]);
    expect(savePinnedCommandIds(null, [])).toBe(false);
  });
});
