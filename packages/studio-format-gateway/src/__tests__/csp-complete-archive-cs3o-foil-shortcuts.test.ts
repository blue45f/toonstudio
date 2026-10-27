import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CSP_3D_ASSET_42_CATEGORIES,
  CSP_3D_FACIAL_21_MORPH_CHANNELS,
  CSP_3D_HEAD_10_FEATURE_POINTS,
  CSP_BUILTIN_CS3O_CHARACTER_OBJECT_SPECS,
  CSP_CROSS_PLATFORM_SPWS_PRESET_SPECS,
  CSP_DEFAULT_POSE_VER2_67_BONES,
  CSP_MENUV3_ALL_18_SVG_ICONS,
  CSP_PWPIECE_SPRITE_ATLAS_ARCHIVES,
  CSP_REMAINING_RESOURCE_ARCHIVE_SPECS,
  CSP_SPWS_DEFAULT_MENU_SHORTCUTS,
  CSP_SPWS_DEFAULT_TOOL_SHORTCUTS,
  CSP_SPWS_SHORTCUT_DB_SUMMARY,
  INITIAL_CSP_WKBRIDGE_BOARD_STATE,
  compileCsp48B1A2B7IndentationDslToXml,
  encodeCspCs3oObject3dHeader,
  encodeCspPwPieceSpriteAtlasEntry,
  evaluateCspPwglFoilStampShading,
  evaluateCspShadeDsSixStepToon,
  executeCspWkBridgeTellBoardCommand,
  parseCspCs3oObject3dHeader,
  parseCspPwPieceSpriteAtlasEntry,
  parseCspSpwsWorkspacePlacementBlob,
  stepCspParaparaFlipbookState,
  validateCspMaterialEditGroupTagLimit,
  type CspParaparaFlipbookState,
} from "../csp-complete-archive-cs3o-foil-shortcuts";

describe("csp-complete-archive-cs3o-foil-shortcuts", () => {
  it("encodes and parses .cs3o CLIP_STUDIO_3D_DATA2 catalog_object binary headers with embedded FBX/NNB/PNG detection", () => {
    expect(CSP_BUILTIN_CS3O_CHARACTER_OBJECT_SPECS).toHaveLength(3);
    const payload = new TextEncoder().encode(
      "Kaydara FBX Binary  \0NNB1\x89PNG\r\n\x1a\n",
    );
    const encoded = encodeCspCs3oObject3dHeader({
      guidHex: "aabbccddeeff00112233445566778899",
      formatRevision: 2,
      payloadBytes: payload,
    });
    const parsed = parseCspCs3oObject3dHeader(encoded);
    expect(parsed.magicHeader).toBe("CLIP_STUDIO_3D_DATA2");
    expect(parsed.chunkTag).toBe("catalog_object");
    expect(parsed.guidHex).toBe("aabbccddeeff00112233445566778899");
    expect(parsed.formatRevision).toBe(2);
    expect(parsed.hasEmbeddedFbx).toBe(true);
    expect(parsed.hasEmbeddedNnb).toBe(true);
    expect(parsed.embeddedPngCount).toBe(1);
  });

  it("verifies default_pose_ver2.pep 67-node full-body skeleton, 42 3D categories, 21 facial morphs, and 10 head feature points", () => {
    expect(CSP_DEFAULT_POSE_VER2_67_BONES).toHaveLength(67);
    expect(CSP_DEFAULT_POSE_VER2_67_BONES).toContain("Hips");
    expect(CSP_DEFAULT_POSE_VER2_67_BONES).toContain("LeftHandIndex4");
    expect(CSP_DEFAULT_POSE_VER2_67_BONES).toContain("RightToe_End");
    expect(CSP_3D_ASSET_42_CATEGORIES).toHaveLength(42);
    expect(CSP_3D_FACIAL_21_MORPH_CHANNELS).toHaveLength(21);
    expect(CSP_3D_HEAD_10_FEATURE_POINTS).toHaveLength(10);
  });

  it("evaluates 46B67EA9[4] PWGLisfoilstamptex foil-stamp emboss/bump/sphere shader and 0A24C606[2] 6-step shadeDS toon shader", () => {
    const foil = evaluateCspPwglFoilStampShading({
      baseRgb01: [0.12, 0.14, 0.2],
      maskAlpha3x3: [0, 0, 1, 0, 0.8, 1, 0, 0.9, 1],
      bumpNormalXyz: [0.2, 0.1, 0.95],
      lightDirXyz: [0.3, 0.4, 0.86],
    });
    expect(foil.edgeNormalXyz[0]).toBeLessThan(0);
    expect(foil.featheredMaskAlpha01).toBeGreaterThan(0.5);
    expect(foil.foilCompositeRgb01[0]).toBeGreaterThan(0.12);

    const shadeLow = evaluateCspShadeDsSixStepToon({
      baseRgb01: [0.8, 0.4, 0.3],
      nDotL01: 0.1,
    });
    const shadeHigh = evaluateCspShadeDsSixStepToon({
      baseRgb01: [0.8, 0.4, 0.3],
      nDotL01: 0.92,
    });
    expect(shadeLow.stepIndex).toBe(0);
    expect(shadeHigh.stepIndex).toBe(5);
    expect(shadeHigh.shadedRgb01[0]).toBeGreaterThan(shadeLow.shadedRgb01[0]);
  });

  it("roundtrips PWPiece + png_ UI sprite atlas binary slices and compiles 48B1A2B7 indentation DSL to XML", () => {
    expect(CSP_PWPIECE_SPRITE_ATLAS_ARCHIVES).toHaveLength(8);
    expect(CSP_REMAINING_RESOURCE_ARCHIVE_SPECS).toHaveLength(10);

    const encodedAtlas = encodeCspPwPieceSpriteAtlasEntry({
      atlasWidthPx: 512,
      atlasHeightPx: 256,
      slices: [
        { sliceName: "commandbar_save", leftPx: 12, topPx: 8, rightPx: 36, bottomPx: 32 },
        { sliceName: "tool_pen", leftPx: 40, topPx: 8, rightPx: 64, bottomPx: 32 },
      ],
    });
    const parsedAtlas = parseCspPwPieceSpriteAtlasEntry(encodedAtlas);
    expect(parsedAtlas.atlasWidthPx).toBe(512);
    expect(parsedAtlas.atlasHeightPx).toBe(256);
    expect(parsedAtlas.slices).toHaveLength(2);
    expect(parsedAtlas.slices[0]?.sliceName).toBe("commandbar_save");
    expect(parsedAtlas.slices[0]?.widthPx).toBe(24);
    expect(parsedAtlas.slices[1]?.sliceName).toBe("tool_pen");

    const xml = compileCsp48B1A2B7IndentationDslToXml(
      [
        "E:package",
        "  A:version=3.0",
        "  E:metadata",
        "    E:dc:title",
        "      V:ToonStudio Comic Vol.1",
      ].join("\n"),
    );
    expect(xml).toContain('<package version="3.0">');
    expect(xml).toContain("<dc:title>ToonStudio Comic Vol.1</dc:title>");
  });

  it("verifies .spws shortcut tables (870 menu / 258 tool rows), cross-platform presets, and workspaceplacement parser", () => {
    expect(CSP_SPWS_SHORTCUT_DB_SUMMARY.totalMenuCommandRows).toBe(870);
    expect(CSP_SPWS_SHORTCUT_DB_SUMMARY.totalToolShortcutRows).toBe(258);
    expect(CSP_SPWS_DEFAULT_MENU_SHORTCUTS.length).toBeGreaterThanOrEqual(20);
    expect(CSP_SPWS_DEFAULT_TOOL_SHORTCUTS).toHaveLength(24);
    expect(CSP_CROSS_PLATFORM_SPWS_PRESET_SPECS).toHaveLength(9);

    // Encode UTF-16BE tags "dockplacement" and "pane"
    const tagStr = "dockplacement pane palette pane";
    const u16 = new Uint8Array(tagStr.length * 2);
    for (let i = 0; i < tagStr.length; i += 1) {
      u16[i * 2 + 1] = tagStr.charCodeAt(i);
    }
    const placement = parseCspSpwsWorkspacePlacementBlob(u16);
    expect(placement.detectedTags).toContain("dockplacement");
    expect(placement.detectedTags).toContain("pane");
    expect(placement.paneCount).toBe(2);
  });

  it("executes all 9 Ghidra-decompiled WKBridge _TellBoard IPC verbs, MENUv3 18 SVGs, and Parapara/Material controllers", () => {
    expect(CSP_MENUV3_ALL_18_SVG_ICONS).toHaveLength(18);

    let s = INITIAL_CSP_WKBRIDGE_BOARD_STATE;
    const jumped = executeCspWkBridgeTellBoardCommand(
      s,
      "jump\thttps://assets.clip-studio.com/ko-kr\tX-CSP-App:5.1.5",
    );
    expect(jumped.verb).toBe("jump");
    expect(jumped.nextState.currentUrl).toBe("https://assets.clip-studio.com/ko-kr");
    expect(jumped.nextState.lastHeaders["X-CSP-App"]).toBe("5.1.5");
    s = jumped.nextState;

    const getUrl = executeCspWkBridgeTellBoardCommand(s, "get\turl");
    expect(getUrl.responseString).toBe("https://assets.clip-studio.com/ko-kr");

    const setUa = executeCspWkBridgeTellBoardCommand(s, "agent\tToonStudioWKBridge/5.1.5");
    s = setUa.nextState;
    expect(executeCspWkBridgeTellBoardCommand(s, "get\tagent").responseString).toBe(
      "ToonStudioWKBridge/5.1.5",
    );

    const callRes = executeCspWkBridgeTellBoardCommand(
      s,
      "call\tonCloudSyncComplete\tline1[newline_s]line2",
    );
    expect(callRes.verb).toBe("call");
    expect(callRes.responseString).toContain("onCloudSyncComplete(");
    s = callRes.nextState;

    s = executeCspWkBridgeTellBoardCommand(s, "goback").nextState;
    expect(s.historyIndex).toBe(0);
    s = executeCspWkBridgeTellBoardCommand(s, "goforward").nextState;
    expect(s.historyIndex).toBe(1);
    s = executeCspWkBridgeTellBoardCommand(s, "redraw").nextState;
    expect(s.redrawCount).toBe(1);
    s = executeCspWkBridgeTellBoardCommand(s, "setpassesgenericmotionevent\t1").nextState;
    expect(s.passesGenericMotionEvent).toBe(true);
    s = executeCspWkBridgeTellBoardCommand(s, "enableremotedebug\t1").nextState;
    expect(s.remoteDebugEnabled).toBe(true);

    let flip: CspParaparaFlipbookState = {
      frameUrls: ["page_01.png", "page_02.png", "page_03.png"],
      currentFrameIndex: 0,
      intervalMs: 200,
      loop: true,
      isPlaying: false,
    };
    flip = stepCspParaparaFlipbookState(flip, "play");
    expect(flip.isPlaying).toBe(true);
    flip = stepCspParaparaFlipbookState(flip, "tick");
    expect(flip.currentFrameIndex).toBe(1);

    const tagCheck = validateCspMaterialEditGroupTagLimit(["브러시", "펜", "브러시", "웹툰"]);
    expect(tagCheck.uniqueTags).toEqual(["브러시", "펜", "웹툰"]);
    expect(tagCheck.withinLimit).toBe(true);

    const localCs3o =
      "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Pose/dessindollLeftHand.cs3o";
    if (existsSync(localCs3o)) {
      const rawSqlite = readFileSync(localCs3o);
      expect(rawSqlite.subarray(0, 15).toString("ascii")).toBe("SQLite format 3");
    }
  });
});
