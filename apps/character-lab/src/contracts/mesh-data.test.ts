import { describe, expect, it } from "vitest";

import { minimalHumanoidModelFixture } from "../testing/recipe-fixtures";

import { CHANNEL_FAMILY, CHANNEL_KEYS } from "./color-channels";
import {
  MATERIAL_PRESET_IDS,
  PART_ROLES,
  PART_ROLE_CHANNELS,
  PART_ROLE_LABELS_KO,
  PART_ROLE_SHADE_GROUP,
  RECIPE_COLOR_KEYS,
  allocatePartIds,
  allocatePartIdsByRole,
  countTriangles,
  meshPartChannel,
  rolePartId,
  validateMeshPartData,
  type MeshPartData,
} from "./mesh-data";

function mutate(part: MeshPartData, patch: Partial<MeshPartData>): MeshPartData {
  return { ...part, ...patch };
}

describe("contracts/mesh-data", () => {
  const model = minimalHumanoidModelFixture();
  const skin = model.parts[0] as MeshPartData;

  it("fixture 파츠는 모두 검증을 통과한다", () => {
    for (const part of model.parts) expect(validateMeshPartData(part)).toBeNull();
  });

  it("길이 정합 위반을 잡는다", () => {
    expect(validateMeshPartData(mutate(skin, { normals: new Float32Array(3) }))?.code).toBe("mesh-normals-length");
    expect(validateMeshPartData(mutate(skin, { uvs: new Float32Array(1) }))?.code).toBe("mesh-uvs-length");
    expect(validateMeshPartData(mutate(skin, { indices: new Uint32Array([0, 1]) }))?.code).toBe("mesh-indices-length");
  });

  it("인덱스 범위·NaN·가중치 합을 잡는다", () => {
    expect(validateMeshPartData(mutate(skin, { indices: new Uint32Array([0, 1, 9]) }))?.code).toBe("mesh-index-range");
    const nanPositions = new Float32Array(skin.positions);
    nanPositions[0] = Number.NaN;
    expect(validateMeshPartData(mutate(skin, { positions: nanPositions }))?.code).toBe("mesh-nan");
    const badWeights = new Float32Array(skin.jointWeights as Float32Array);
    badWeights[0] = 0.9;
    expect(validateMeshPartData(mutate(skin, { jointWeights: badWeights }))?.code).toBe("mesh-skin-weight-sum");
    expect(validateMeshPartData(mutate(skin, { jointWeights: undefined }))?.code).toBe("mesh-skin-pair");
    expect(validateMeshPartData(mutate(skin, { partId: 0 }))?.code).toBe("mesh-part-id");
    const failure = validateMeshPartData(mutate(skin, { partId: 0 }));
    expect(failure?.reasonKo).toMatch(/[가-힣]/u);
  });

  it("morph 길이 위반을 잡는다", () => {
    const bad = mutate(skin, { morphs: [{ name: "param:eyeSize:+", deltaPositions: new Float32Array(3) }] });
    expect(validateMeshPartData(bad)?.code).toBe("mesh-morph-length");
  });

  it("allocatePartIds는 1..n을 배정하고 0은 배경이다", () => {
    const palette = allocatePartIds(model.parts);
    expect(Object.keys(palette).map(Number)).toEqual([1, 2]);
    expect(palette[1]?.role).toBe("skin");
    expect(palette[2]?.labelKo).toBe("헤어");
    expect(palette[0]).toBeUndefined();
    expect(countTriangles(model.parts)).toBe(4);
  });

  it("underwear 역할은 기존 15역할 뒤(끝)에 추가되어 기존 partId가 밀리지 않는다", () => {
    // 2026-10-23 레시피 v3가 같은 규칙으로 4역할을 끝에 더했다(아래 시험). underwear의 위치·partId는 그대로다.
    expect(PART_ROLES).toHaveLength(20);
    expect(PART_ROLES[15]).toBe("underwear");
    expect(PART_ROLES.slice(0, 15)).toEqual(["skin", "head", "eyeball", "iris", "pupil", "eye-highlight", "brow", "lash", "teeth", "tongue", "hair", "top", "bottom", "shoes", "accessory"]);
    expect(rolePartId("accessory")).toBe(15);
    expect(rolePartId("underwear")).toBe(16);
    expect(PART_ROLE_LABELS_KO.underwear).toBe("속옷");
    expect(Object.keys(PART_ROLE_LABELS_KO)).toHaveLength(20);
  });

  it("역할 고정 partId는 PART_ROLES 인덱스 + 1이고 결손 역할이 있어도 나머지가 밀리지 않는다", () => {
    expect(PART_ROLES.map((role) => rolePartId(role))).toEqual(PART_ROLES.map((_, index) => index + 1));
    // 모든 역할이 순서대로 하나씩 있으면 순서 기반 팔레트와 같다
    const full = PART_ROLES.map((role) => ({ role }));
    expect(allocatePartIdsByRole(full)).toEqual(allocatePartIds(full));
    // 첫 역할이 비면 순서 기반은 밀리고 역할 고정은 밀리지 않는다(희소 팔레트)
    const [, ...rest] = full;
    const sparse = allocatePartIdsByRole(rest);
    expect(Object.keys(sparse).map(Number)).toEqual(rest.map((part) => rolePartId(part.role)));
    expect(sparse[1]).toBeUndefined();
    expect(allocatePartIds(rest)[1]?.role).toBe(rest[0]?.role);
  });
  describe("레시피 v3 역할·채널(2026-10-23 CORE-1)", () => {
    it("v3 역할 4개는 underwear 뒤에 붙어 partId 17~20이고 기존 partId는 그대로다", () => {
      expect(PART_ROLES.slice(16)).toEqual(["inner", "outer", "legwear", "hair-accessory"]);
      expect([rolePartId("inner"), rolePartId("outer"), rolePartId("legwear"), rolePartId("hair-accessory")]).toEqual([17, 18, 19, 20]);
      expect(PART_ROLE_LABELS_KO.inner).toMatch(/[가-힣]/u);
      expect(PART_ROLE_LABELS_KO["hair-accessory"]).toBe("헤어 액세서리");
    });

    it("cloth-knit 재질은 재질 어휘 끝에 붙는다(기존 순서 불변)", () => {
      expect(MATERIAL_PRESET_IDS.at(-1)).toBe("cloth-knit");
      expect(MATERIAL_PRESET_IDS.indexOf("unlit-highlight")).toBe(10);
    });

    it("역할 채널 표: 모든 채널은 그 계열 기본 키가 기본 채널과 맞고, 고정색 역할은 채널이 없다", () => {
      for (const role of PART_ROLES) {
        for (const channel of PART_ROLE_CHANNELS[role]) expect(CHANNEL_KEYS).toContain(channel);
      }
      expect(PART_ROLE_CHANNELS.teeth).toEqual([]);
      expect(PART_ROLE_CHANNELS.underwear).toEqual([]);
      expect(PART_ROLE_CHANNELS.eyeball).toEqual(["sclera"]);
      expect(PART_ROLE_CHANNELS.inner).toContain("top-accent");
      // 기본 채널(첫 항목)의 계열 = v2 색 키(역할이 레시피 색을 받던 키)
      expect(PART_ROLE_CHANNELS.top[0]).toBe("top");
      expect(CHANNEL_FAMILY[PART_ROLE_CHANNELS.inner[0] ?? "skin"]).toBe("top");
      expect(CHANNEL_FAMILY[PART_ROLE_CHANNELS.legwear[0] ?? "skin"]).toBe("bottom");
    });

    it("그림자 그룹은 v2 toonShadeTint 분류(피부·머리·혀 / 헤어·눈썹·속눈썹 / 나머지)와 같다", () => {
      const groups = { skin: [] as string[], hair: [] as string[], other: [] as string[] };
      for (const role of PART_ROLES) groups[PART_ROLE_SHADE_GROUP[role]].push(role);
      expect(groups.skin.sort()).toEqual(["head", "skin", "tongue"]);
      expect(groups.hair.sort()).toEqual(["brow", "hair", "lash"]);
      expect(groups.other).toHaveLength(PART_ROLES.length - 6);
    });

    it("RECIPE_COLOR_KEYS는 기본 8채널과 같은 배열이다", () => {
      expect([...RECIPE_COLOR_KEYS]).toEqual(["skin", "iris", "hair", "brow", "top", "bottom", "shoes", "accessory"]);
    });

    it("메시 channel은 역할 허용 채널이고 colorKey는 그 채널의 계열 기본 키와 같아야 한다", () => {
      const top = mutate(skin, { id: "top-trim", role: "top", colorKey: "top", channel: "top-trim" });
      expect(validateMeshPartData(top)).toBeNull();
      expect(meshPartChannel(top)).toBe("top-trim");
      expect(meshPartChannel(skin)).toBe("skin");
      expect(validateMeshPartData(mutate(top, { channel: "hair-tip" }))?.code).toBe("mesh-channel-role");
      expect(validateMeshPartData(mutate(top, { colorKey: "accessory" }))?.code).toBe("mesh-channel-family");
      expect(validateMeshPartData(mutate(top, { channel: "nope" as never }))?.code).toBe("mesh-channel");
      // 층 역할: inner 채널 → 계열 top(v2 엔진은 상의 색으로 그린다)
      expect(validateMeshPartData(mutate(skin, { role: "inner", colorKey: "top", channel: "inner" }))).toBeNull();
      // 공막: 계열 기본 키가 없으므로 colorKey를 두지 않는다
      expect(validateMeshPartData(mutate(skin, { role: "eyeball", channel: "sclera", colorKey: undefined }))).toBeNull();
      expect(validateMeshPartData(mutate(skin, { role: "eyeball", channel: "sclera" }))?.code).toBe("mesh-channel-family");
      expect(meshPartChannel({ colorKey: undefined, channel: undefined })).toBeNull();
    });

    it("영역 채널(입술·볼 홍조)은 머리 메시에만, 중복 없이 둔다", () => {
      expect(validateMeshPartData(mutate(skin, { role: "head", regionChannels: ["lip", "blush"] }))).toBeNull();
      expect(validateMeshPartData(mutate(skin, { regionChannels: ["lip"] }))?.code).toBe("mesh-region-channel-role");
      expect(validateMeshPartData(mutate(skin, { role: "head", regionChannels: ["lip", "lip"] }))?.code).toBe("mesh-region-channel");
      expect(validateMeshPartData(mutate(skin, { role: "head", regionChannels: ["sclera" as never] }))?.code).toBe("mesh-region-channel");
    });
  });
});
