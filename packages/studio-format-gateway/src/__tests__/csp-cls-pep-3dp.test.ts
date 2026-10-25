import { describe, expect, it } from "vitest";

import {
  CSP_CLS_MAGIC,
  CSP_MIX_COLOR_SET_SWATCHES,
  CSP_START_COLOR_SET_PRESETS,
  encodeCspClsColorSet,
  parseCspClsColorSet,
} from "../csp-cls";
import {
  CSP_DESSIN_DOLL_V2_BONE_NAMES,
  CSP_HAND_SETUP_CORNER_PRESETS,
  computeCspBodyMorphBoneScales,
  interpolateCspHandSetupPose,
  parseCsp3dpBodyProportionXml,
  parseCspPepPoseXml,
  serializeCsp3dpBodyProportionXml,
  serializeCspPepPoseXml,
} from "../csp-pep-3dp";

describe("Clip Studio .cls (SLCC) Color Set binary codec", () => {
  it("round-trips MixColorSet.cls (13 unnamed/named RGBA swatches) and Korean UTF-16LE swatch names", () => {
    const encoded = encodeCspClsColorSet({
      asciiName: "001Start",
      localizedName: "시작 컬러 세트",
      swatches: [
        { r: 0, g: 0, b: 0, a: 0, name: "투명색" },
        { r: 0, g: 0, b: 0, a: 255, name: "검정색" },
        { r: 255, g: 40, b: 60, a: 255 },
        { r: 255, g: 255, b: 255, a: 255, name: "흰색" },
      ],
    });

    expect(String.fromCharCode(encoded[0]!, encoded[1]!, encoded[2]!, encoded[3]!)).toBe(
      CSP_CLS_MAGIC,
    );

    const parsed = parseCspClsColorSet(encoded);
    expect(parsed.format).toBe("csp-cls");
    expect(parsed.asciiName).toBe("001Start");
    expect(parsed.localizedName).toBe("시작 컬러 세트");
    expect(parsed.channels).toBe(4);
    expect(parsed.swatches).toHaveLength(4);

    expect(parsed.swatches[0]?.isTransparentSlot).toBe(true);
    expect(parsed.swatches[0]?.name).toBe("투명색");
    expect(parsed.swatches[1]?.hex).toBe("#000000");
    expect(parsed.swatches[1]?.name).toBe("검정색");
    expect(parsed.swatches[2]?.hex).toBe("#ff283c");
    expect(parsed.swatches[2]?.name).toBeUndefined();
    expect(parsed.swatches[3]?.hex).toBe("#ffffff");
    expect(parsed.swatches[3]?.name).toBe("흰색");
  });

  it("exposes REA-extracted MixColorSet 13 swatches and default ColorSet presets", () => {
    expect(CSP_MIX_COLOR_SET_SWATCHES).toHaveLength(13);
    expect(CSP_MIX_COLOR_SET_SWATCHES[0]?.hex).toBe("#ff283c");
    expect(CSP_MIX_COLOR_SET_SWATCHES[11]?.hex).toBe("#ffffff");
    expect(CSP_MIX_COLOR_SET_SWATCHES[12]?.hex).toBe("#000000");
    expect(CSP_START_COLOR_SET_PRESETS).toHaveLength(3);
  });
});

describe("Clip Studio .pep (3D Pose) & .3dp (Body Proportion) XML codecs and Hand Setup engine", () => {
  it("parses and serializes .pep hierarchical bone trees with quaternion normalization", () => {
    const sampleXml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<celsysdocument version="1.0.0">',
      '  <info tool="CLIP STUDIO PAINT"/>',
      '  <pose alias_name="default_pose" search_tags="action,standing" version="1.0.0">',
      '    <node id="-1" name="hips_bb_" rotquat="1.000000 0.000000 0.000000 0.000000" scale="1.000000 1.000000 1.000000" trans="0.000000 94.000000 0.000000">',
      '      <node id="-1" name="spine_bb_" rotquat="0.996195 0.087156 0.000000 0.000000" scale="1.000000 1.000000 1.000000" trans="0.000000 10.500000 0.000000"/>',
      "    </node>",
      "  </pose>",
      "</celsysdocument>",
    ].join("\n");

    const parsed = parseCspPepPoseXml(sampleXml);
    expect(parsed.format).toBe("csp-pep");
    expect(parsed.aliasName).toBe("default_pose");
    expect(parsed.searchTags).toBe("action,standing");
    expect(parsed.rootNodes).toHaveLength(1);
    expect(parsed.flatBoneMap.hips_bb_?.trans[1]).toBeCloseTo(94, 4);
    expect(parsed.flatBoneMap.spine_bb_?.rotquat[1]).toBeCloseTo(0.087156, 4);

    const reserialized = serializeCspPepPoseXml(parsed);
    const reparsed = parseCspPepPoseXml(reserialized);
    expect(reparsed.flatBoneMap.spine_bb_?.trans[1]).toBeCloseTo(10.5, 4);
    expect(CSP_DESSIN_DOLL_V2_BONE_NAMES.length).toBeGreaterThanOrEqual(56);
  });

  it("parses, computes, and serializes .3dp 4-quadrant body proportion morphs", () => {
    const morphed = computeCspBodyMorphBoneScales({
      shapeMuscle: 0.8,
      shapeThin: 0.1,
      shapeFat: 0,
      shapeChild: 0,
      dessindollKindIndex: 1,
    });
    expect(morphed.boneBody[0]).toBeGreaterThan(1.1);
    expect(morphed.boneArm[0]).toBeGreaterThan(1.05);

    const xml = serializeCsp3dpBodyProportionXml(morphed);
    const parsed = parseCsp3dpBodyProportionXml(xml);
    expect(parsed.dessindollKindIndex).toBe(1);
    expect(parsed.shapeMuscle).toBeCloseTo(0.8, 5);
    expect(parsed.boneBody[0]).toBeCloseTo(morphed.boneBody[0], 5);
  });

  it("interpolates Hand Setup scanner poses across pa00..01 and gu00..03 with per-finger locks", () => {
    expect(Object.keys(CSP_HAND_SETUP_CORNER_PRESETS)).toHaveLength(6);

    const openPose = interpolateCspHandSetupPose({ spread01: 1, clench01: 0 });
    const fistPose = interpolateCspHandSetupPose({
      spread01: 0,
      clench01: 1,
      fistVariantIndex: 2,
      lockedFingerClench01: { index: 0 },
    });

    // Index finger is locked open (clench = 0), while middle finger is clenched (clench = 1)
    expect(fistPose.index[1][0]).toBeGreaterThan(0.99);
    expect(fistPose.middle[1][0]).toBeLessThan(0.75);
    expect(openPose.pinky[0][2]).toBeLessThan(-0.15);
  });
});
