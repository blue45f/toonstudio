import { describe, expect, it } from "vitest";

import { CHARACTER_SLOT_KINDS } from "./character-shaper-contract";
import {
  SHAPER_HEAD_PART_TYPES,
  SHAPER_HEAD_PART_TYPE_IDS,
  SHAPER_PRESET_FORMAT_VERSION,
  bridgeShaperPresetToCharacterRecipe,
  mapCharacterSlotToShaperPartType,
  mapShaperPartTypeToCharacterSlots,
  parseShaperNativePreset,
  parseShaperProjectArchive,
  rgbToHexColor,
  serializeShaperNativePreset,
} from "./character-shaper-native-preset-codec";

describe("character-shaper-native-preset-codec", () => {
  it("14개 ShaperHeadPartType(0..13) 및 ToonStudio 15개 CharacterSlotKind와 양방향 매핑한다", () => {
    expect(SHAPER_HEAD_PART_TYPES).toHaveLength(14);
    expect(SHAPER_HEAD_PART_TYPE_IDS.head).toBe(0);
    expect(SHAPER_HEAD_PART_TYPE_IDS.handPose).toBe(13);

    for (const slot of CHARACTER_SLOT_KINDS) {
      const partType = mapCharacterSlotToShaperPartType(slot);
      expect(SHAPER_HEAD_PART_TYPES).toContain(partType);
      const backMapped = mapShaperPartTypeToCharacterSlots(partType);
      expect(backMapped.length).toBeGreaterThan(0);
    }

    expect(mapShaperPartTypeToCharacterSlots("style")).toEqual([
      "face-shape",
      "hair",
      "irises",
    ]);
  });

  it("헤더 버전 검증 실패 및 빈 입력에 대해 명시적 오류를 반환한다", () => {
    expect(parseShaperNativePreset("")).toEqual({
      ok: false,
      error: "Empty Shaper preset payload",
    });

    const badVersion = parseShaperNativePreset("2.0\nmt*head,mid*0");
    expect(badVersion.ok).toBe(false);
    if (!badVersion.ok) {
      expect(badVersion.error).toContain(SHAPER_PRESET_FORMAT_VERSION);
    }
  });

  it("head 프리셋(정점·크리즈·심·3D 펜 라인)을 파싱하고 무손실 직렬화 라운드트립을 보장한다", () => {
    const sampleHeadPreset = [
      "1.0",
      "mt*head,mid*head_02,name*sharp_jaw,v*0.52/-0.12/0.1,v*-0.52/-0.12/0.1,p*0.45,p*0.8,sposC*0/1.2/0.3,sposL*-0.35/1.15/0.2,sposR*0.35/1.15/0.2,l*,lt*2.5/1/0/0.1/0.12/0.15/0.95/2,lp*0.1/1.22/0.4,lpt*2.2/0.35/0.45/0/0/1/head/mesh_0/head_02",
    ].join("\n");

    const parsed = parseShaperNativePreset(sampleHeadPreset);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const doc = parsed.document;
    expect(doc.partType).toBe("head");
    expect(doc.baseMeshId).toBe("head_02");
    expect(doc.name).toBe("sharp_jaw");
    expect(doc.vertices).toEqual([
      { x: 0.52, y: -0.12, z: 0.1 },
      { x: -0.52, y: -0.12, z: 0.1 },
    ]);
    expect(doc.creasePowers).toEqual([0.45, 0.8]);
    expect(doc.seams).toEqual({
      center: { x: 0, y: 1.2, z: 0.3 },
      left: { x: -0.35, y: 1.15, z: 0.2 },
      right: { x: 0.35, y: 1.15, z: 0.2 },
    });
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0]?.thickness).toBe(2.5);
    expect(doc.lines[0]?.layer).toBe(2);
    expect(doc.lines[0]?.points[0]).toEqual({
      position: { x: 0.1, y: 1.22, z: 0.4 },
      thickness: 2.2,
      v0d: 0.35,
      v1d: 0.45,
      normal: { x: 0, y: 0, z: 1 },
      baseMeshType: "head",
      partMeshId: "mesh_0",
      partBaseMeshId: "head_02",
    });

    const serialized = serializeShaperNativePreset(doc);
    const reparsed = parseShaperNativePreset(serialized);
    expect(reparsed).toEqual(parsed);
  });

  it("hair 프리셋(스트랜드 hp* 및 헤어 베이스 캡 hb*/hbv*)을 파싱하고 라운드트립한다", () => {
    const sampleHairPreset = [
      "1.0",
      "mt*6,mid*hair_base_01,name*wolf_cut,h*,hp*strand_03/0.25/0.6/10/-15/5/0.1/0.4/0.2/0/5/0/1.1/1.2/1/0.85,hb*cap_01,hbv*0.1/0.2/0.8/0.9/0.05/-0.05",
    ].join("\n");

    const parsed = parseShaperNativePreset(sampleHairPreset);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.document.partType).toBe("hair");
    expect(parsed.document.hairStrands).toHaveLength(1);
    expect(parsed.document.hairStrands[0]).toEqual({
      baseMeshId: "strand_03",
      v0d: 0.25,
      v1d: 0.6,
      rotation: { x: 10, y: -15, z: 5 },
      controlPointPos: { x: 0.1, y: 0.4, z: 0.2 },
      controlPointRot: { x: 0, y: 5, z: 0 },
      controlPointScale: { x: 1.1, y: 1.2, z: 1 },
      outline: 0.85,
    });
    expect(parsed.document.hairBases).toEqual([
      {
        baseId: "cap_01",
        uvTransform: { x: 0.1, y: 0.2, w: 0.8, h: 0.9, tx: 0.05, ty: -0.05 },
      },
    ]);

    const reparsed = parseShaperNativePreset(serializeShaperNativePreset(parsed.document));
    expect(reparsed).toEqual(parsed);
  });

  it("eyes(EyeballData), body, pose, clothTop/acc 및 defaultStyle.preset 토큰을 정확히 파싱하고 라운드트립한다", () => {
    const eyesRaw =
      "1.0\nmt*eyes,mid*eye_01,name*sparkle_eye,ebtid*iris_04,ebtp*0/0/1.2/1.2,ebhtid*hl_02,ebhtp*0.1/0.1/0.5/0.5,eblt*0/-8/2,ebrt*0/8/-2,ebht*cam,ebhp*0.15/-0.1,ebha*0.9";
    const eyesParsed = parseShaperNativePreset(eyesRaw);
    expect(eyesParsed.ok).toBe(true);
    if (!eyesParsed.ok) return;
    expect(eyesParsed.document.eyeball).toEqual({
      irisTexId: "iris_04",
      irisRect: { x: 0, y: 0, w: 1.2, h: 1.2 },
      highlightTexId: "hl_02",
      highlightRect: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
      leftEyeRotation: { x: 0, y: -8, z: 2 },
      rightEyeRotation: { x: 0, y: 8, z: -2 },
      highlightTrackingMode: "cam",
      highlightPosition: { x: 0.15, y: -0.1 },
      highlightAlpha: 0.9,
    });
    expect(parseShaperNativePreset(serializeShaperNativePreset(eyesParsed.document))).toEqual(eyesParsed);

    const bodyPoseRaw =
      "1.0\nmt*pose,name*action_guard,sex*1,muscle*0.65,fat*0.15,bN*LeftArm,bP*-0.25/1.35/0.1,bA*15/-30/45,bS*1/1/1,bN*RightArm,bP*0.25/1.35/0.1,bA*10/20/-35,camP*0.4/1.5/-2.8,camR*8/-12/0,camFov*32";
    const poseParsed = parseShaperNativePreset(bodyPoseRaw);
    expect(poseParsed.ok).toBe(true);
    if (!poseParsed.ok) return;
    expect(poseParsed.document.bodyProportions).toEqual({ sex: 1, muscle: 0.65, fat: 0.15 });
    expect(poseParsed.document.bones).toHaveLength(2);
    expect(poseParsed.document.camera).toEqual({
      position: { x: 0.4, y: 1.5, z: -2.8 },
      rotation: { x: 8, y: -12, z: 0 },
      fov: 32,
    });
    expect(parseShaperNativePreset(serializeShaperNativePreset(poseParsed.document))).toEqual(poseParsed);

    const styleRaw =
      "1.0\nhC*0.2/0.25/0.4,sC*0.98/0.88/0.82,ssT*shade_01,ssC*0.85/0.7/0.68,ssL*0.48,ssW*0.12,rsT*rim_01,rsC*1/0.95/0.9,rsL*0.75,rsW*0.08,olC*0.12/0.1/0.1,olT*1.4,olP*0.9,hID*hb_02,shT*toon_cel,lAX*35,lAY*-25";
    const styleParsed = parseShaperNativePreset(styleRaw);
    expect(styleParsed.ok).toBe(true);
    if (!styleParsed.ok) return;
    expect(styleParsed.document.partType).toBe("style");
    expect(styleParsed.document.style?.shaderType).toBe("toon_cel");
    expect(styleParsed.document.style?.lightAngleX).toBe(35);
    expect(styleParsed.document.style?.lightAngleY).toBe(-25);
    expect(parseShaperNativePreset(serializeShaperNativePreset(styleParsed.document))).toEqual(styleParsed);
  });

  it(".shaper 프로젝트 아카이브를 파싱하고 ToonStudio CharacterRecipe로 브리지 변환한다", () => {
    const archive = parseShaperProjectArchive({
      "head.preset": "1.0\nmt*head,mid*h01,name*hero_head,v*0.65/-0.2/0.1,l*,lt*2/1/0/0/0/0/1/0,lp*0/1/0,lpt*2/0.1/0.2/0/0/1/head/m0/h01",
      "eyes.preset": "1.0\nmt*eyes,mid*e01,name*calm_eyes,ebtid*amber_iris,ebtp*0/0/1.4/1.4",
      "hair.preset": "1.0\nmt*hair,mid*hr01,name*short_layered,h*,hp*s1/0.1/0.2/0/0/0/0/0/0/0/0/0/1/1/1/1",
      "clothTop.preset": "1.0\nmt*clothTop,name*blazer_uniform,cC*#2b3a55,oR*1.1",
      "acc.preset": "1.0\nmt*acc,name*earring_cross,acc*Head/0.1/1.5/0/0/0/0/1/1/1",
      "pose.preset": "1.0\nmt*pose,name*dramatic_turn,bN*Spine,bA*5/15/0,camP*0/1.4/-2.5,camR*5/0/0,camFov*28",
      "handPose.preset": "1.0\nmt*handPose,name*peace_left,bN*LeftHandIndex1,bA*0/0/12",
      "defaultStyle.preset": "1.0\nhC*0.15/0.2/0.35,sC*0.96/0.86/0.8,ssC*0.4/0.5/0.7",
    });

    expect(archive.ok).toBe(true);
    expect(archive.errors).toHaveLength(0);

    const bridged = bridgeShaperPresetToCharacterRecipe(Object.values(archive.presets));
    expect(bridged.recipe.slots["face-shape"]).toBe("face-shape:shaper-hero_head");
    expect(bridged.recipe.slots.eyes).toBe("eyes:shaper-calm_eyes");
    expect(bridged.recipe.slots.irises).toBe("irises:shaper-amber_iris");
    expect(bridged.recipe.slots.hair).toBe("hair:shaper-short_layered");
    expect(bridged.recipe.slots.top).toBe("top:shaper-blazer_uniform");
    expect(bridged.recipe.slots.accessory).toEqual(["accessory:shaper-earring_cross"]);
    expect(bridged.recipe.slots.pose).toBe("pose:shaper-dramatic_turn");
    expect(bridged.recipe.slots["hand-pose"]).toBe("hand-pose:shaper-peace_left");
    expect(bridged.recipe.handSide).toBe("left");
    expect(bridged.recipe.colors.top).toBe("#2b3a55");
    expect(bridged.recipe.colors.skin).toBe(rgbToHexColor({ r: 0.96, g: 0.86, b: 0.8 }));
    expect(bridged.recipe.colors.hairBase).toBe(rgbToHexColor({ r: 0.15, g: 0.2, b: 0.35 }));
    expect(bridged.surfaceLineCount).toBe(1);
    expect(bridged.hairStrandCount).toBe(1);
    expect(bridged.camera?.fov).toBe(28);
    expect(bridged.semanticMorphs.irisSize).toBeCloseTo(0.2, 3);
  });
});
