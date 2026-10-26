import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CSP_CS3O_SQLITE_SCHEMA,
  CSP_CSCR_PATH_REPAIR_RULES,
  CSP_CSCR_SQLITE_SCHEMA,
  CSP_DEFAULT_LAF_AUTO_ACTION_SET,
  CSP_DEFAULT_SGS_GRADATION_SETS,
  CSP_LAF_APPLICATION_UUID,
  CSP_PRESET_MAC_1_SHORTCUT_MENUS,
  CSP_SPWS_SQLITE_SCHEMA,
  decodeCspSpwsModifierMask,
  encodeCspLafAutoActionSet,
  encodeCspSgsGradationSet,
  encodeCspSpwsModifierMask,
  parseCspLafAutoActionSet,
  parseCspSgsGradationSet,
  repairCspCatalogMaterialPath,
} from "../csp-laf-sgs-spws";

describe("CSP .laf (Auto Action Set), .sgs (Gradation Set), .spws/.cs3o/.cscr codecs", () => {
  it("encodes and parses .laf Auto Action Set binaries lossless round-trip", () => {
    const encoded = encodeCspLafAutoActionSet(CSP_DEFAULT_LAF_AUTO_ACTION_SET);
    expect(encoded.byteLength).toBeGreaterThan(128);

    const parsed = parseCspLafAutoActionSet(encoded);
    expect(parsed.format).toBe("csp-laf");
    expect(parsed.applicationUuid).toBe(CSP_LAF_APPLICATION_UUID);
    expect(parsed.setName).toBe(CSP_DEFAULT_LAF_AUTO_ACTION_SET.setName);
    expect(parsed.actions).toHaveLength(CSP_DEFAULT_LAF_AUTO_ACTION_SET.actions.length);
    expect(parsed.actions[0]?.actionName).toBe("밑그림 레이어 작성");
    expect(parsed.actions[0]?.items.map((i) => i.actionItemKind)).toEqual([
      "layeractionrasterdetailnew",
      "layeractionsetuselayercolor",
      "layeractionchangedraftlayer",
    ]);
    expect(parsed.actions[3]?.items[0]?.dialogToggle).toBe(true);
  });

  it("parses real /Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Action/default.laf when installed", () => {
    const path = "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Action/default.laf";
    if (!existsSync(path)) return;
    const raw = new Uint8Array(readFileSync(path));
    const parsed = parseCspLafAutoActionSet(raw);
    expect(parsed.typename).toBe("typeActionSet");
    expect(parsed.applicationUuid).toBe(CSP_LAF_APPLICATION_UUID);
    expect(parsed.actions.length).toBeGreaterThan(0);
  });

  it("encodes and parses .sgs Gradation Set binaries lossless round-trip", () => {
    const encoded = encodeCspSgsGradationSet(CSP_DEFAULT_SGS_GRADATION_SETS);
    expect(encoded.byteLength).toBeGreaterThan(128);

    const parsed = parseCspSgsGradationSet(encoded);
    expect(parsed.format).toBe("csp-sgs");
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0]?.gradationSetName).toBe("하늘 (Sky)");
    expect(parsed.groups[0]?.items).toHaveLength(3);
    expect(parsed.groups[0]?.items[0]?.gradationName).toBe("푸른 하늘 (Blue Sky)");
    expect(parsed.groups[0]?.items[0]?.stops[0]?.r).toBe(28);
    expect(parsed.groups[0]?.items[0]?.stops[1]?.position01).toBeCloseTo(0.65, 2);
  });

  it("parses real /Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Gradation/default.sgs when installed", () => {
    const path = "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Gradation/default.sgs";
    if (!existsSync(path)) return;
    const raw = new Uint8Array(readFileSync(path));
    const parsed = parseCspSgsGradationSet(raw);
    expect(parsed.format).toBe("csp-sgs");
    expect(parsed.groups.length).toBeGreaterThan(0);
  });

  it("decodes and encodes .spws modifier bitmasks and exposes 8-table SQLite schema", () => {
    expect(Object.keys(CSP_SPWS_SQLITE_SCHEMA.tables)).toHaveLength(8);
    expect(CSP_CS3O_SQLITE_SCHEMA.tables.object3d).toContain("catalog_data");
    expect(CSP_CSCR_SQLITE_SCHEMA.tables.repairtable).toContain("targetpath");

    for (const mask of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const decoded = decodeCspSpwsModifierMask(mask);
      expect(encodeCspSpwsModifierMask(decoded)).toBe(mask);
    }

    const saveAs = CSP_PRESET_MAC_1_SHORTCUT_MENUS.find((r) => r.menuCommand === "filesaveas")!;
    expect(saveAs.decodedModifiers).toEqual({ shift: true, option: false, command: true });

    const canvasSize = CSP_PRESET_MAC_1_SHORTCUT_MENUS.find((r) => r.menuCommand === "editcanvassize")!;
    expect(canvasSize.decodedModifiers).toEqual({ shift: false, option: true, command: true });
  });

  it("repairs legacy catalog material paths using catalogPathRepairTable.cscr rules", () => {
    expect(CSP_CSCR_PATH_REPAIR_RULES).toHaveLength(5);
    expect(repairCspCatalogMaterialPath("::material:03_manga material:")).toBe(
      "::material:03_manga material:01_framing:",
    );
    expect(repairCspCatalogMaterialPath("::material:custom:")).toBe("::material:custom:");
  });
});
