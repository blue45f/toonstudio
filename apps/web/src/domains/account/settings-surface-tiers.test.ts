import { describe, expect, it } from "vitest";

import {
  initialSettingsAdvancedOpen,
  loadSettingsAdvancedOpen,
  normalizeSettingsAdvancedOpen,
  saveSettingsAdvancedOpen,
  SETTINGS_ADVANCED_GROUPS,
  settingsRevealGroupForEntry,
  settingsSectionTier,
  toggleSettingsAdvancedGroup,
} from "./settings-surface-tiers";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

describe("settings surface tiers", () => {
  it("classifies only the ambient and next-gen sections as advanced wholes", () => {
    expect(settingsSectionTier("#settings-ambient")).toBe("advanced");
    expect(settingsSectionTier("#settings-nextgen")).toBe("advanced");
    expect(settingsSectionTier("#settings-display")).toBe("daily");
    expect(settingsSectionTier("#settings-data")).toBe("daily");
    expect(settingsSectionTier("#account-security")).toBe("daily");
    expect(settingsSectionTier("#unknown")).toBe("daily");
  });

  it("keeps exactly three advanced groups on three different tabs", () => {
    expect(SETTINGS_ADVANCED_GROUPS.map((g) => g.id)).toEqual([
      "display-advanced",
      "data-advanced",
      "account-advanced",
    ]);
    expect(new Set(SETTINGS_ADVANCED_GROUPS.map((g) => g.tab)).size).toBe(3);
  });

  it("routes search entries to the group they must reveal first", () => {
    expect(settingsRevealGroupForEntry("ambient")).toBe("display-advanced");
    expect(settingsRevealGroupForEntry("nextgen")).toBe("display-advanced");
    expect(settingsRevealGroupForEntry("data")).toBe("data-advanced");
    expect(settingsRevealGroupForEntry("account")).toBe("account-advanced");
    expect(settingsRevealGroupForEntry("theme")).toBeNull();
    expect(settingsRevealGroupForEntry("page:/settings/ai")).toBeNull();
  });

  it("persists open groups and ignores unknown ids in stored values", () => {
    const storage = memoryStorage();
    expect(saveSettingsAdvancedOpen(storage, ["display-advanced", "bogus"])).toBe(true);
    expect(loadSettingsAdvancedOpen(storage)).toEqual(["display-advanced"]);
    expect(normalizeSettingsAdvancedOpen("nope")).toEqual([]);
    expect(normalizeSettingsAdvancedOpen(["data-advanced", "data-advanced"])).toEqual([
      "data-advanced",
    ]);
  });

  it("starts closed by default and opens the owning group on advanced deep links", () => {
    const storage = memoryStorage();
    expect(initialSettingsAdvancedOpen(storage, "")).toEqual([]);
    expect(initialSettingsAdvancedOpen(storage, "#settings-nextgen")).toEqual([
      "display-advanced",
    ]);
    expect(initialSettingsAdvancedOpen(storage, "#settings-data")).toEqual([]);
  });

  it("toggles groups without mutating the previous state", () => {
    const before: readonly string[] = [];
    const opened = toggleSettingsAdvancedGroup(before, "data-advanced");
    expect(opened).toEqual(["data-advanced"]);
    expect(before).toEqual([]);
    expect(toggleSettingsAdvancedGroup(opened, "data-advanced")).toEqual([]);
    expect(toggleSettingsAdvancedGroup(opened, "bogus")).toBe(opened);
  });
});
