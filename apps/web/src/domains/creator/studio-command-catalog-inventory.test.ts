/**
 * S3-12 inventory equivalence tests (BLUEPRINT §4.2).
 *
 * The judgement for S3-12 is that the catalog and the live surfaces describe
 * the same set of commands with the same labels. The menu half is pinned by
 * `studio-command-catalog.test.ts` against the five command lists; this file
 * pins the surfaces that are not command lists — the tool rail, the
 * inspector panels, the menubar fixed buttons + command bar, and the
 * creation-mode launcher — against their live declarations, both ways, so a
 * surface cannot gain, lose or rename a row without the inventory following.
 * Nothing here renders anything: the inventory is registration data only.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  STUDIO_RAIL_TOOL_CATALOG,
  DEFAULT_STUDIO_RAIL_VISIBLE_IDS,
} from "./studio-app-settings";
import {
  findCatalogEntriesBySource,
  STUDIO_COMMAND_CATALOG,
  STUDIO_COMMAND_INVENTORY,
  STUDIO_COMMAND_INVENTORY_SOURCES,
  STUDIO_COMMAND_SOURCES,
  STUDIO_LAUNCHER_INVENTORY,
  STUDIO_MENU_ITEM_INVENTORY,
  STUDIO_MENUBAR_INVENTORY,
  STUDIO_PANEL_INVENTORY,
  STUDIO_TOOL_INVENTORY,
  studioCommandInventoryBySurface,
  studioCommandInventoryByTier,
  studioCommandSurfacesFor,
} from "./studio-command-catalog";
import {
  STUDIO_DOCUMENT_INSPECTOR_SECTIONS,
  STUDIO_IMAGE_INSPECTOR_SECTIONS,
  STUDIO_INSPECTOR_PRIMARY_SECTIONS,
  studioInspectorActions,
} from "./studio-inspector-layout";

const REPO_ROOT = path.resolve(__dirname, "../../../../..");

function readSource(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), "utf-8");
}

describe("s3-12 inventory — menu equivalence (the 138+ baseline)", () => {
  it("the menu inventory and the catalog claim exactly the same rows", () => {
    expect(STUDIO_MENU_ITEM_INVENTORY).toHaveLength(
      STUDIO_COMMAND_SOURCES.menu.measuredCount,
    );
    expect(new Set(STUDIO_MENU_ITEM_INVENTORY).size).toBe(
      STUDIO_MENU_ITEM_INVENTORY.length,
    );
    for (const nativeId of STUDIO_MENU_ITEM_INVENTORY) {
      expect(
        findCatalogEntriesBySource("menu", nativeId).length,
        `menu row ${nativeId} has no catalog entry`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("s3-12 inventory — tool rail equivalence", () => {
  it("registers every rail tool, in declaration order, labels and chords verbatim", () => {
    expect(STUDIO_TOOL_INVENTORY).toHaveLength(
      STUDIO_COMMAND_INVENTORY_SOURCES.tools.measuredCount,
    );
    expect(STUDIO_TOOL_INVENTORY.map((entry) => entry.nativeId)).toEqual(
      STUDIO_RAIL_TOOL_CATALOG.map((tool) => tool.id),
    );
    for (const [index, tool] of STUDIO_RAIL_TOOL_CATALOG.entries()) {
      const entry = STUDIO_TOOL_INVENTORY[index];
      expect(entry?.label, tool.id).toBe(tool.label);
      expect(entry?.shortcut ?? "", tool.id).toBe(tool.defaultShortcut);
      expect(entry?.surfaces, tool.id).toEqual(["toolbar"]);
    }
  });

  it("core tier is exactly the first-run rail — no silent promotions", () => {
    const core = STUDIO_TOOL_INVENTORY.filter(
      (entry) => entry.tier === "core",
    ).map((entry) => entry.nativeId);
    expect(new Set(core)).toEqual(new Set(DEFAULT_STUDIO_RAIL_VISIBLE_IDS));
  });
});

describe("s3-12 inventory — panel equivalence", () => {
  /** Panel inventory nativeId → the inspector action that labels it. */
  const ACTION_BY_PANEL: Readonly<Record<string, string>> = {
    "inspector/layers": "layers",
    "inspector/properties": "selection-properties",
    "inspector/publish": "publish",
    "inspector/document/canvas": "canvas",
    "inspector/document/grade": "grade",
    "inspector/document/navigator": "navigator",
    "inspector/image/quick": "image-quick",
    "inspector/image/fill": "image-fill",
    "inspector/image/transform": "image-transform",
    "inspector/image/retouch": "image-retouch",
    "inspector/image/mask": "image-mask",
  };

  function liveActionLabels(): Map<string, string> {
    const labels = new Map<string, string>();
    const contexts = [
      { hasSelection: false, selectedType: null, drawing: false },
      {
        hasSelection: false,
        selectedType: null,
        drawing: false,
        imageToolsAvailable: true,
      },
      { hasSelection: true, selectedType: "image", drawing: false },
    ] as const;
    for (const context of contexts) {
      for (const action of studioInspectorActions(context)) {
        labels.set(action.id, action.label);
      }
    }
    return labels;
  }

  it("every panel section exists in the inspector layout constants", () => {
    expect(STUDIO_PANEL_INVENTORY).toHaveLength(
      STUDIO_COMMAND_INVENTORY_SOURCES.panels.measuredCount,
    );
    for (const entry of STUDIO_PANEL_INVENTORY) {
      const parts = entry.nativeId.split("/");
      if (parts.length === 2) {
        expect(
          STUDIO_INSPECTOR_PRIMARY_SECTIONS as readonly string[],
        ).toContain(parts[1]);
      } else if (parts[1] === "document") {
        expect(
          STUDIO_DOCUMENT_INSPECTOR_SECTIONS as readonly string[],
        ).toContain(parts[2]);
      } else if (parts[1] === "image") {
        expect(STUDIO_IMAGE_INSPECTOR_SECTIONS as readonly string[]).toContain(
          parts[2],
        );
      } else {
        throw new Error(`unclassified panel id: ${entry.nativeId}`);
      }
      expect(entry.surfaces).toEqual(["panel"]);
    }
  });

  it("panel labels are the live inspector action labels, verbatim", () => {
    const labels = liveActionLabels();
    for (const entry of STUDIO_PANEL_INVENTORY) {
      const actionId = ACTION_BY_PANEL[entry.nativeId];
      expect(actionId, entry.nativeId).toBeDefined();
      expect(entry.label, entry.nativeId).toBe(labels.get(actionId ?? ""));
    }
  });
});

describe("s3-12 inventory — menubar and command-bar equivalence", () => {
  it("hint ids in the inventory are exactly the hint ids the menubar declares", () => {
    const source = readSource(STUDIO_MENUBAR_INVENTORY[0]?.source.file ?? "");
    const declared = new Set(
      [...source.matchAll(/\bid: "(menubar-[^"]+)"/gu)].map(
        (match) => match[1] as string,
      ),
    );
    expect(STUDIO_MENUBAR_INVENTORY).toHaveLength(
      STUDIO_COMMAND_INVENTORY_SOURCES.menubar.measuredCount,
    );
    expect(new Set(STUDIO_MENUBAR_INVENTORY.map((entry) => entry.hintId))).toEqual(
      declared,
    );
    for (const entry of STUDIO_MENUBAR_INVENTORY) {
      expect(entry.surfaces).toEqual(["menubar"]);
      expect(entry.label).not.toBe("");
    }
  });

  it("command-bar assignable rows are exactly the eleven slot commands", () => {
    const assignable = STUDIO_MENUBAR_INVENTORY.flatMap((entry) =>
      entry.commandBarId ? [entry.commandBarId] : [],
    ).sort();
    expect(assignable).toEqual(
      [
        "assets",
        "bubbles",
        "correct-current-stroke",
        "download",
        "export-open",
        "project",
        "publish",
        "redo",
        "save",
        "undo",
        "zoom-fit",
      ].sort(),
    );
  });
});

describe("s3-12 inventory — launcher equivalence", () => {
  it("creation modes are exactly the launcher's CREATION_MODES, labels verbatim", () => {
    const source = readSource(STUDIO_LAUNCHER_INVENTORY[0]?.source.file ?? "");
    const declared = [
      ...source.matchAll(
        /\bid: "([a-z]+)",\s*\n\s*labelKo: "([^"]+)"/gu,
      ),
    ].map((match) => ({ id: match[1] as string, labelKo: match[2] as string }));
    expect(STUDIO_LAUNCHER_INVENTORY).toHaveLength(
      STUDIO_COMMAND_INVENTORY_SOURCES.launcher.measuredCount,
    );
    expect(
      STUDIO_LAUNCHER_INVENTORY.map((entry) => ({
        id: entry.nativeId,
        labelKo: entry.label,
      })),
    ).toEqual(declared);
    expect(STUDIO_LAUNCHER_INVENTORY.map((entry) => entry.nativeId)).toEqual([
      "draw",
      "story",
      "character",
      "background",
      "assets",
      "ai",
    ]);
  });
});

describe("s3-12 inventory — integrity", () => {
  it("ids are unique and the aggregate is the four inventories in order", () => {
    const ids = STUDIO_COMMAND_INVENTORY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(STUDIO_COMMAND_INVENTORY).toHaveLength(
      STUDIO_TOOL_INVENTORY.length +
        STUDIO_PANEL_INVENTORY.length +
        STUDIO_MENUBAR_INVENTORY.length +
        STUDIO_LAUNCHER_INVENTORY.length,
    );
  });

  it("every catalogId link points at a real catalog entry", () => {
    const catalogIds = new Set(STUDIO_COMMAND_CATALOG.map((entry) => entry.id));
    for (const entry of STUDIO_COMMAND_INVENTORY) {
      if (entry.catalogId) {
        expect(catalogIds.has(entry.catalogId), entry.id).toBe(true);
      }
      expect(entry.label, entry.id).not.toBe("");
    }
  });

  it("surface and tier selectors partition the inventory", () => {
    expect(studioCommandInventoryBySurface("toolbar")).toHaveLength(
      STUDIO_TOOL_INVENTORY.length,
    );
    expect(studioCommandInventoryBySurface("panel")).toHaveLength(
      STUDIO_PANEL_INVENTORY.length,
    );
    expect(studioCommandInventoryBySurface("menubar")).toHaveLength(
      STUDIO_MENUBAR_INVENTORY.length,
    );
    expect(studioCommandInventoryBySurface("launcher")).toHaveLength(
      STUDIO_LAUNCHER_INVENTORY.length,
    );
    const byTier =
      studioCommandInventoryByTier("core").length +
      studioCommandInventoryByTier("contextual").length +
      studioCommandInventoryByTier("advanced").length;
    expect(byTier).toBe(STUDIO_COMMAND_INVENTORY.length);
  });

  it("catalog entries derive §4.2 surfaces from their origins", () => {
    const saveDraft = STUDIO_COMMAND_CATALOG.find(
      (entry) => entry.id === "file.save-draft",
    );
    // menu origin → menubar; quick-access origin → palette.
    expect(studioCommandSurfacesFor(saveDraft!)).toEqual(
      expect.arrayContaining(["menubar", "palette"]),
    );
    let sawLauncher = false;
    for (const entry of STUDIO_COMMAND_CATALOG) {
      const surfaces = studioCommandSurfacesFor(entry);
      expect(surfaces.length, entry.id).toBeGreaterThan(0);
      if (surfaces.includes("launcher")) sawLauncher = true;
    }
    expect(sawLauncher).toBe(true);
  });
});
