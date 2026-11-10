import { describe, expect, it } from "vitest";

import { kitManifestJson } from "../testing/kit-fixtures";
import { kitManifestV2Json } from "../testing/kit-v2-fixtures";
import { characterPackageManifestFixture } from "../testing/manifest-fixtures";

import { parseKitManifest } from "./character-kit";
import { parseAnyKitManifest, parseKitManifestV2 } from "./character-kit-v2";
import {
  AUTHORED_HAIR_MESH_PATTERN,
  characterPackageIndexSchema,
  parseAuthoredHairMeshName,
  parseCharacterPackageManifest,
  slotCapabilitySchema,
} from "./package-manifest";

function hairVariantMeshes(manifestJson: Record<string, unknown>, presetId: string): Array<Record<string, unknown>> {
  const parts = manifestJson.parts as Array<Record<string, unknown>>;
  const part = parts.find((candidate) => candidate.id === presetId);
  if (!part) throw new Error(`테스트 설정 오류: ${presetId} 파츠가 없습니다.`);
  const variants = part.variants as Record<string, Record<string, unknown>>;
  const female = variants.female;
  if (!female) throw new Error(`테스트 설정 오류: ${presetId} female 변형이 없습니다.`);
  return female.meshes as Array<Record<string, unknown>>;
}

describe("contracts/package-manifest", () => {
  it("pipeline.py 형식 fixture를 수용하고 알 수 없는 상위 키를 보존한다", () => {
    const json = { ...characterPackageManifestFixture(), extraTopLevel: { any: true } };
    const result = parseCharacterPackageManifest(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.capabilities.authoredHair.style).toBe("soft-bob");
      expect(result.manifest.capabilities.semanticFaceShapes.shapeKeys).toHaveLength(24);
      expect((result.manifest as Record<string, unknown>).extraTopLevel).toEqual({ any: true });
      expect(result.manifest.files.glb?.sha256).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it("kind·schemaVersion·sha256 형식을 거부한다", () => {
    const base = characterPackageManifestFixture();
    expect(parseCharacterPackageManifest({ ...base, kind: "other" }).ok).toBe(false);
    expect(parseCharacterPackageManifest({ ...base, schemaVersion: 2 }).ok).toBe(false);
    expect(parseCharacterPackageManifest({ ...base, files: { glb: { path: "a.glb", bytes: 1, sha256: "xyz" } } }).ok).toBe(false);
    expect(parseCharacterPackageManifest({ ...base, characterId: "Bad Id" }).ok).toBe(false);
    const failure = parseCharacterPackageManifest({ ...base, kind: "other" });
    if (!failure.ok) expect(failure.failure.reasonKo).toMatch(/manifest 형식/u);
  });

  it("characterLab 확장은 선택이며 부분 지정을 허용한다", () => {
    const withExt = characterPackageManifestFixture({
      characterLab: { slotCapabilities: { body: { status: "partial", reasonKo: "체형 morph 없음" } }, boneMap: { "mixamorig:Hips": "hips" } },
    });
    const result = parseCharacterPackageManifest(withExt);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.characterLab?.boneMap?.["mixamorig:Hips"]).toBe("hips");
    const bad = characterPackageManifestFixture({ characterLab: { boneMap: { X: "notABone" as never } } });
    expect(parseCharacterPackageManifest(bad).ok).toBe(false);
  });

  it("slotCapability는 프리셋 단위 unavailablePresets를 선택으로 받고 키 형식을 검사한다", () => {
    expect(slotCapabilitySchema.safeParse({ status: "available" }).success).toBe(true);
    expect(slotCapabilitySchema.safeParse({ status: "partial", reasonKo: "일부 미제작", unavailablePresets: { "hair/twin-tail": "트윈테일 미제작" } }).success).toBe(true);
    expect(slotCapabilitySchema.safeParse({ status: "partial", unavailablePresets: { "twin-tail": "x" } }).success).toBe(false);
    expect(slotCapabilitySchema.safeParse({ status: "partial", unavailablePresets: { "hair/twin-tail": 1 } }).success).toBe(false);
    // 기존 manifest의 characterLab.slotCapabilities도 그대로 통과한다
    const legacy = characterPackageManifestFixture({ characterLab: { slotCapabilities: { hair: { status: "partial", reasonKo: "일부" } } } });
    expect(parseCharacterPackageManifest(legacy).ok).toBe(true);
    const withPresets = characterPackageManifestFixture({
      characterLab: { slotCapabilities: { hair: { status: "partial", unavailablePresets: { "hair/twin-tail": "미제작" } } } },
    });
    expect(parseCharacterPackageManifest(withPresets).ok).toBe(true);
  });

  it("meshRoles는 underwear 역할을 허용한다", () => {
    const manifest = characterPackageManifestFixture({ characterLab: { meshRoles: { TS_Underwear: "underwear" } } });
    expect(parseCharacterPackageManifest(manifest).ok).toBe(true);
  });

  it("AUTHORED_HAIR_MESH_PATTERN은 명명 캡처(groups.style·groups.lod)와 위치 캡처([1]·[2])를 동시에 제공한다", () => {
    expect(AUTHORED_HAIR_MESH_PATTERN.source).toBe("^TS_AuthoredHair_(?<style>[a-z0-9-]+)_LOD(?<lod>\\d+)$");
    expect(AUTHORED_HAIR_MESH_PATTERN.flags).toBe("u");
    const validCases: ReadonlyArray<readonly [string, string, string]> = [
      ["TS_AuthoredHair_short-layered_LOD0", "short-layered", "0"],
      ["TS_AuthoredHair_soft-bob_LOD1", "soft-bob", "1"],
      ["TS_AuthoredHair_twin-tail_LOD2", "twin-tail", "2"],
      ["TS_AuthoredHair_wolf-layered-02_LOD10", "wolf-layered-02", "10"],
      ["TS_AuthoredHair_a_LOD0", "a", "0"],
      ["TS_AuthoredHair_bob9_LOD3", "bob9", "3"],
    ];

    for (const [meshName, expectedStyle, expectedLod] of validCases) {
      const match = AUTHORED_HAIR_MESH_PATTERN.exec(meshName);
      expect(match, meshName).not.toBeNull();
      expect(match?.[1], `${meshName} [1]`).toBe(expectedStyle);
      expect(match?.[2], `${meshName} [2]`).toBe(expectedLod);
      expect(match?.groups?.style, `${meshName} groups.style`).toBe(expectedStyle);
      expect(match?.groups?.lod, `${meshName} groups.lod`).toBe(expectedLod);
      expect(AUTHORED_HAIR_MESH_PATTERN.lastIndex).toBe(0);
    }
  });

  it("헤어 메시 규약 정규식·파서는 유효·무효 이름, 하이픈, LOD 경계를 구분한다", () => {
    expect(parseAuthoredHairMeshName("TS_AuthoredHair_short-layered_LOD0")).toEqual({ style: "short-layered", lod: 0 });
    expect(parseAuthoredHairMeshName("TS_AuthoredHair_soft-bob_LOD1")).toEqual({ style: "soft-bob", lod: 1 });
    expect(parseAuthoredHairMeshName("TS_AuthoredHair_a-b-c_LOD2")).toEqual({ style: "a-b-c", lod: 2 });
    expect(parseAuthoredHairMeshName("TS_AuthoredHair_a_LOD0")).toEqual({ style: "a", lod: 0 });
    expect(parseAuthoredHairMeshName("TS_AuthoredHair_short-layered_LOD12")).toEqual({ style: "short-layered", lod: 12 });
    expect(parseAuthoredHairMeshName(`TS_AuthoredHair_short-layered_LOD${Number.MAX_SAFE_INTEGER}`)).toEqual({
      style: "short-layered",
      lod: Number.MAX_SAFE_INTEGER,
    });

    const invalidMeshNames = [
      "",
      "Body",
      "TS_Head",
      "AuthoredHair_short-layered_LOD0",
      "ts_authoredhair_short-layered_lod0",
      "TS_AuthoredHair__LOD0",
      "TS_AuthoredHair_Short-Layered_LOD0",
      "TS_AuthoredHair_short_layered_LOD0",
      "TS_AuthoredHair_short-layered_lod0",
      "TS_AuthoredHair_short-layered_LOD",
      "TS_AuthoredHair_short-layered_LOD-1",
      "TS_AuthoredHair_short-layered_LOD0.5",
      "TS_AuthoredHair_short-layered_LOD0a",
      "TS_AuthoredHair_short-layered_LOD0_Outline",
      " TS_AuthoredHair_short-layered_LOD0",
      "TS_AuthoredHair_short-layered_LOD0 ",
    ];

    for (const invalid of invalidMeshNames) {
      expect(AUTHORED_HAIR_MESH_PATTERN.exec(invalid), invalid).toBeNull();
      expect(parseAuthoredHairMeshName(invalid), invalid).toBeNull();
    }

    // 정규식 숫자 매칭은 통과하더라도 안전 정수를 넘는 LOD 번호는 파서가 거부한다
    expect(parseAuthoredHairMeshName("TS_AuthoredHair_short-layered_LOD99999999999999999999")).toBeNull();
  });

  it("character-kit v1·v2 파서가 groups.style·groups.lod 계약으로 하이픈 헤어 메시(TS_AuthoredHair_short-layered_LOD0)를 통과시키고 불일치는 거부한다", () => {
    const v1Json = kitManifestJson();
    expect(hairVariantMeshes(v1Json, "hair/short-layered")[0]?.node).toBe("TS_AuthoredHair_short-layered_LOD0");
    const v1Parsed = parseKitManifest(v1Json);
    expect(v1Parsed.ok).toBe(true);

    const v2Json = kitManifestV2Json();
    expect(hairVariantMeshes(v2Json, "hair/short-layered")[0]?.node).toBe("TS_AuthoredHair_short-layered_LOD0");
    const v2Parsed = parseKitManifestV2(v2Json);
    expect(v2Parsed.ok).toBe(true);
    expect(parseAnyKitManifest(v1Json)).toMatchObject({ ok: true, version: 1 });
    expect(parseAnyKitManifest(v2Json)).toMatchObject({ ok: true, version: 2 });

    // style 불일치 거부(v1·v2)
    const v1WrongStyle = kitManifestJson();
    hairVariantMeshes(v1WrongStyle, "hair/short-layered")[0]!.node = "TS_AuthoredHair_soft-bob_LOD0";
    const v1StyleResult = parseKitManifest(v1WrongStyle);
    expect(v1StyleResult.ok).toBe(false);
    if (!v1StyleResult.ok) expect(v1StyleResult.failure.reasonKo).toContain("TS_AuthoredHair_short-layered_LOD<n>");

    const v2WrongStyle = kitManifestV2Json();
    hairVariantMeshes(v2WrongStyle, "hair/short-layered")[0]!.node = "TS_AuthoredHair_soft-bob_LOD0";
    const v2StyleResult = parseKitManifestV2(v2WrongStyle);
    expect(v2StyleResult.ok).toBe(false);
    if (!v2StyleResult.ok) expect(v2StyleResult.failure.reasonKo).toContain("TS_AuthoredHair_short-layered_LOD<n>");

    // lod 필드와 이름의 LOD 번호 불일치 거부(v1·v2)
    const v1WrongLod = kitManifestJson();
    hairVariantMeshes(v1WrongLod, "hair/short-layered")[1]!.lod = 2;
    const v1LodResult = parseKitManifest(v1WrongLod);
    expect(v1LodResult.ok).toBe(false);
    if (!v1LodResult.ok) expect(v1LodResult.failure.reasonKo).toContain("lod 필드(2)가 이름의 LOD(1)와 다릅니다");

    const v2WrongLod = kitManifestV2Json();
    hairVariantMeshes(v2WrongLod, "hair/short-layered")[1]!.lod = 2;
    const v2LodResult = parseKitManifestV2(v2WrongLod);
    expect(v2LodResult.ok).toBe(false);
    if (!v2LodResult.ok) expect(v2LodResult.failure.reasonKo).toContain("TS_AuthoredHair_short-layered_LOD<n>이고 lod 필드와 같아야 합니다");
  });

  it("index.json 스키마", () => {
    expect(characterPackageIndexSchema.safeParse({ packages: [{ characterId: "mina", displayName: "미나", baseUrl: "/assets/characters/mina" }] }).success).toBe(true);
    expect(characterPackageIndexSchema.safeParse({ packages: [{ characterId: "mina" }] }).success).toBe(false);
  });
});
