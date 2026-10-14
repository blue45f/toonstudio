import { describe, expect, it } from "vitest";

import { STUDIO_MENU_ITEM_INVENTORY } from "./studio-command-catalog";
import {
  STUDIO_MENUBAR_ADVANCED_NATIVE_IDS,
  STUDIO_MENUBAR_ADVANCED_SOURCE_GROUPS,
  STUDIO_MENUBAR_FILTER_CORE_NATIVE_IDS,
  foldStudioMenubarGroupsForDensity,
  studioMenubarCommandTier,
  studioMenubarNativeId,
  studioMenubarTierExposure,
  type StudioMenubarFoldableGroup,
  type StudioMenubarFoldableItem,
} from "./studio-menubar-catalog";

interface TestItem extends StudioMenubarFoldableItem {
  readonly fold?: boolean;
}

interface TestGroup extends StudioMenubarFoldableGroup<TestItem> {
  readonly label: string;
}

const buildFoldItem = (
  groupId: string,
  advancedCount: number,
  expanded: boolean,
): TestItem => ({
  id: `advanced-fold:${groupId}:${advancedCount}:${expanded ? "open" : "closed"}`,
  fold: true,
});

const FOLD = { mode: "simple" as const, advancedExpanded: false, buildFoldItem };

describe("studioMenubarCommandTier", () => {
  it("derives the advanced set from the catalog inventory — no orphan ids", () => {
    const inventory = new Set(STUDIO_MENU_ITEM_INVENTORY);
    expect(STUDIO_MENUBAR_ADVANCED_NATIVE_IDS.length).toBeGreaterThan(0);
    for (const nativeId of STUDIO_MENUBAR_ADVANCED_NATIVE_IDS) {
      expect(inventory.has(nativeId)).toBe(true);
    }
    // No duplicates, and the filter core rows the catalog names stay core.
    expect(new Set(STUDIO_MENUBAR_ADVANCED_NATIVE_IDS).size).toBe(
      STUDIO_MENUBAR_ADVANCED_NATIVE_IDS.length,
    );
    for (const coreId of STUDIO_MENUBAR_FILTER_CORE_NATIVE_IDS) {
      expect(inventory.has(coreId)).toBe(true);
      expect(studioMenubarCommandTier(coreId)).toBe("core");
    }
  });

  it("folds whole specialist source groups and the filter pack, keeps daily commands core", () => {
    for (const groupId of STUDIO_MENUBAR_ADVANCED_SOURCE_GROUPS) {
      const sample = STUDIO_MENU_ITEM_INVENTORY.find((id) => id.startsWith(`${groupId}/`));
      expect(sample, `catalogue group ${groupId}`).toBeDefined();
      expect(studioMenubarCommandTier(sample!)).toBe("advanced");
    }
    expect(studioMenubarCommandTier("filter/gaussian-blur")).toBe("advanced");
    expect(studioMenubarCommandTier("filter/last-filter")).toBe("core");
    expect(studioMenubarCommandTier("file/save-draft")).toBe("core");
    expect(studioMenubarCommandTier("edit/undo")).toBe("core");
    expect(studioMenubarCommandTier("help/command-search")).toBe("core");
    expect(studioMenubarCommandTier("brush/brush-lab")).toBe("core");
  });

  it("defaults unknown native ids to core so unregistered commands are never silently folded", () => {
    expect(studioMenubarCommandTier("future-group/future-item")).toBe("core");
    expect(studioMenubarNativeId("view", "zoom-in")).toBe("view/zoom-in");
  });
});

describe("studioMenubarTierExposure", () => {
  it("matches the §4.1 exposure table: focus core-only, simple core+contextual, full all", () => {
    expect(studioMenubarTierExposure("full", "advanced", false)).toBe("visible");
    expect(studioMenubarTierExposure("simple", "advanced", false)).toBe("folded");
    expect(studioMenubarTierExposure("focus", "advanced", false)).toBe("folded");
    expect(studioMenubarTierExposure("simple", "core", false)).toBe("visible");
    expect(studioMenubarTierExposure("focus", "core", false)).toBe("visible");
    expect(studioMenubarTierExposure("simple", "contextual", false)).toBe("visible");
  });

  it("lets the explicit disclosure win in the modes that fold", () => {
    expect(studioMenubarTierExposure("simple", "advanced", true)).toBe("visible");
    expect(studioMenubarTierExposure("focus", "advanced", true)).toBe("visible");
  });
});

describe("foldStudioMenubarGroupsForDensity", () => {
  const groups: TestGroup[] = [
    {
      id: "file",
      label: "파일",
      items: [
        { id: "save-draft", sourceGroupId: "file" },
        { id: "publish", sourceGroupId: "file" },
        { id: "team", sourceGroupId: "collaboration" },
        { id: "comments", sourceGroupId: "collaboration" },
      ],
    },
    {
      id: "filter",
      label: "효과",
      items: [{ id: "last-filter" }, { id: "gaussian-blur" }, { id: "levels" }],
    },
    { id: "help", label: "도움말", items: [{ id: "command-search" }, { id: "shortcuts" }] },
    { id: "ai", label: "AI 도우미", items: [{ id: "ai-assist" }, { id: "stock" }] },
  ];

  it("returns the identical array for full mode and for an unwired mode", () => {
    expect(
      foldStudioMenubarGroupsForDensity(groups, { ...FOLD, mode: "full" }),
    ).toBe(groups);
    expect(
      foldStudioMenubarGroupsForDensity(groups, { ...FOLD, mode: undefined }),
    ).toBe(groups);
  });

  it("in simple, advanced rows are exposed only through the fold row, with its count", () => {
    const folded = foldStudioMenubarGroupsForDensity(groups, FOLD);
    const file = folded.find((group) => group.id === "file")!;
    expect(file.items.map((item) => item.id)).toEqual([
      "save-draft",
      "publish",
      "advanced-fold:file:2:closed",
    ]);
    const filter = folded.find((group) => group.id === "filter")!;
    expect(filter.items.map((item) => item.id)).toEqual([
      "last-filter",
      "levels",
      "advanced-fold:filter:1:closed",
    ]);
    // A group whose rows are all advanced keeps its title plus the fold row.
    const ai = folded.find((group) => group.id === "ai")!;
    expect(ai.items.map((item) => item.id)).toEqual(["advanced-fold:ai:2:closed"]);
    // Core-only groups keep their original reference (no re-render churn).
    expect(folded.find((group) => group.id === "help")).toBe(groups[2]);
  });

  it("when expanded, advanced rows reappear after the fold row in original order", () => {
    const folded = foldStudioMenubarGroupsForDensity(groups, {
      ...FOLD,
      advancedExpanded: true,
    });
    const file = folded.find((group) => group.id === "file")!;
    expect(file.items.map((item) => item.id)).toEqual([
      "save-draft",
      "publish",
      "advanced-fold:file:2:open",
      "team",
      "comments",
    ]);
  });

  it("folds the same way in focus (core-only exposure)", () => {
    const folded = foldStudioMenubarGroupsForDensity(groups, { ...FOLD, mode: "focus" });
    expect(folded.find((group) => group.id === "filter")!.items.map((item) => item.id)).toEqual([
      "last-filter",
      "levels",
      "advanced-fold:filter:1:closed",
    ]);
  });
});
