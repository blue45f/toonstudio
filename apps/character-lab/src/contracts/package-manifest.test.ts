import { describe, expect, it } from "vitest";

import { characterPackageManifestFixture } from "../testing/manifest-fixtures";

import { characterPackageIndexSchema, parseAuthoredHairMeshName, parseCharacterPackageManifest, slotCapabilitySchema } from "./package-manifest";

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

  it("헤어 메시 규약 파서", () => {
    expect(parseAuthoredHairMeshName("TS_AuthoredHair_soft-bob_LOD1")).toEqual({ style: "soft-bob", lod: 1 });
    expect(parseAuthoredHairMeshName("Body")).toBeNull();
  });

  it("index.json 스키마", () => {
    expect(characterPackageIndexSchema.safeParse({ packages: [{ characterId: "mina", displayName: "미나", baseUrl: "/assets/characters/mina" }] }).success).toBe(true);
    expect(characterPackageIndexSchema.safeParse({ packages: [{ characterId: "mina" }] }).success).toBe(false);
  });
});
