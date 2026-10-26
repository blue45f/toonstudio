import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CSP_SPWS_COMMAND_BAR_ITEMS,
  CSP_SPWS_DOCK_PALETTE_KIND_SPECS,
  CSP_TOMD_TARGET_UUID_TO_TOOL_KO,
  encodeCspTomdModifyKeySettingBlob,
  parseCspTomdModifyKeySettingBlob,
  resolveCspModifierKeyBehavior,
} from "../csp-tomd-spws-palette-dock";

describe("csp-tomd-spws-palette-dock", () => {
  it("round-trips DefaultToolModifyKey.tomd / UXToolModifyKey.tomd binary SettingData blobs cleanly", () => {
    const sampleBlob = encodeCspTomdModifyKeySettingBlob([
      {
        entryByteLength: 36,
        modifierFlags: 8,
        actionCode: 2,
        actionKind: "temporary_tool_switch",
        subParameter: 0,
        targetNodeUuidHex: "2374f61d92d44a74a6a4f104d8e73d2f",
        resolvedTargetToolNameKo: "손바닥",
      },
      {
        entryByteLength: 16,
        modifierFlags: 6,
        actionCode: 64,
        actionKind: "change_brush_size_drag",
        subParameter: 100,
        targetNodeUuidHex: null,
        resolvedTargetToolNameKo: null,
      },
    ]);

    expect(sampleBlob.byteLength).toBe(8 + 36 + 16);
    const parsed = parseCspTomdModifyKeySettingBlob(sampleBlob);
    expect(parsed.headerByteLength).toBe(8);
    expect(parsed.entryCount).toBe(2);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]?.actionKind).toBe("temporary_tool_switch");
    expect(parsed.entries[0]?.targetNodeUuidHex).toBe(
      "2374f61d92d44a74a6a4f104d8e73d2f",
    );
    expect(parsed.entries[0]?.resolvedTargetToolNameKo).toBe("손바닥");
    expect(parsed.entries[1]?.actionKind).toBe("change_brush_size_drag");
    expect(parsed.entries[1]?.subParameter).toBe(100);

    const reencoded = encodeCspTomdModifyKeySettingBlob(parsed.entries);
    expect(Array.from(reencoded)).toEqual(Array.from(sampleBlob));
  });

  it("validates real DefaultToolModifyKey.tomd if installed on macOS", () => {
    const tomdPath =
      "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Tool/DefaultToolModifyKey.tomd";
    if (!existsSync(tomdPath)) {
      return;
    }
    const raw = readFileSync(tomdPath);
    expect(raw.subarray(0, 15).toString("ascii")).toBe("SQLite format 3");
  });

  it("resolves Clip Studio Paint modifier key combinations accurately", () => {
    expect(Object.keys(CSP_TOMD_TARGET_UUID_TO_TOOL_KO).length).toBeGreaterThanOrEqual(
      10,
    );

    const spaceOnly = resolveCspModifierKeyBehavior({
      spaceKey: true,
    });
    expect(spaceOnly.modifierFlags).toBe(8);
    expect(spaceOnly.temporaryToolKo).toBe("손바닥");

    const spaceCtrl = resolveCspModifierKeyBehavior({
      spaceKey: true,
      ctrlOrMetaKey: true,
    });
    expect(spaceCtrl.modifierFlags).toBe(10);
    expect(spaceCtrl.temporaryToolKo).toBe("줌 인");

    const ctrlAlt = resolveCspModifierKeyBehavior({
      ctrlOrMetaKey: true,
      altKey: true,
    });
    expect(ctrlAlt.modifierFlags).toBe(6);
    expect(ctrlAlt.temporaryToolKo).toBe("브러시 크기 조절");

    const altEyedropper = resolveCspModifierKeyBehavior({
      altKey: true,
    });
    expect(altEyedropper.modifierFlags).toBe(4);
    expect(altEyedropper.temporaryToolKo).toBe("스포이트");

    const stylusTail = resolveCspModifierKeyBehavior({
      stylusTailEraser: true,
    });
    expect(stylusTail.modifierFlags).toBe(8192);
    expect(stylusTail.temporaryToolKo).toBe("지우개");

    const idle = resolveCspModifierKeyBehavior({});
    expect(idle.modifierFlags).toBe(0);
    expect(idle.temporaryToolKo).toBe("현재 보조 도구");
  });

  it("catalogs all 28 core .spws palettekind dock specs and 21 command bar items", () => {
    expect(CSP_SPWS_DOCK_PALETTE_KIND_SPECS).toHaveLength(28);
    expect(CSP_SPWS_COMMAND_BAR_ITEMS).toHaveLength(21);

    const colorBlend = CSP_SPWS_DOCK_PALETTE_KIND_SPECS.find(
      (p) => p.paletteKindId === "palettekindcolorblend",
    );
    expect(colorBlend?.titleKo).toBe("중간색");
    expect(colorBlend?.defaultDockSide).toBe("left");

    const psdSaveItem = CSP_SPWS_COMMAND_BAR_ITEMS.find(
      (item) => item.pwId === 28,
    );
    expect(psdSaveItem?.labelKo).toBe(".psd(Photoshop 문서)로 저장");
  });
});
