import { describe, expect, it } from "vitest";

import {
  createStudioBundleManifestV2LoadDescriptor,
  createStudioBundleManifestV2LoadDescriptorForSurface,
  findManifestV2AssetForSurface,
  listManifestV2PackAssetsForSurface,
  parseStudioBundleManifestV2,
  selectManifestV2AssetForSurface,
  selectManifestV2AssetsForSurface,
  type StudioBundleManifestV2Asset,
} from "./studio-bundle-manifest-v2";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function validManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    kind: "toonstudio.asset-bundle.v2",
    generatedAt: "2026-10-20T00:00:00.000Z",
    source: { store: "itch.io", bundle: "Creator Bundle: Volume 1", creators: ["EmaceArt", "RG Poly"] },
    rights: { holder: "test", inServiceOnly: true, downloadable: false, statement: "in-service only" },
    inServiceOnly: true,
    downloadable: false,
    basePath: "packs/",
    totals: {
      packs: 1, assets: 2, files: 3, bytes: 30,
      byFormat: { glb: { assets: 1, files: 1, complete: 1 }, gltf: { assets: 1, files: 2, complete: 1 } },
      runtimeUsable: 2,
    },
    assets: [
      {
        id: "pack-a-model-glb",
        packId: "pack-a",
        format: "glb",
        role: "runtime",
        primary: "pack-a/native/model.glb",
        sourcePath: "001-pack/model.glb",
        files: [{ path: "pack-a/native/model.glb", kind: "primary", bytes: 10, sha256: SHA_A }],
        missingDependencies: [],
        convertedGlb: null,
      },
      {
        id: "pack-a-model-gltf",
        packId: "pack-a",
        format: "gltf",
        role: "runtime",
        primary: "pack-a/native/model/model.gltf",
        sourcePath: "001-pack/model/model.gltf",
        files: [
          { path: "pack-a/native/model/model.gltf", kind: "primary", bytes: 10, sha256: SHA_B },
          { path: "pack-a/native/model/model.bin", kind: "buffer", bytes: 10, sha256: SHA_A },
        ],
        missingDependencies: [],
        convertedGlb: "pack-a/converted/model.glb",
      },
    ],
    ...overrides,
  };
}

function makeAsset(partial: Partial<StudioBundleManifestV2Asset> & { id: string }): StudioBundleManifestV2Asset {
  return {
    packId: "pack-a",
    format: "glb",
    role: "runtime",
    primary: `${partial.id}.glb`,
    sourcePath: null,
    files: [],
    missingDependencies: [],
    complete: true,
    convertedGlb: null,
    ...partial,
  } as StudioBundleManifestV2Asset;
}

describe("parseStudioBundleManifestV2 — 정상 파싱", () => {
  it("스키마·권리·합계를 검증하고 동결된 구조를 돌려준다", () => {
    const manifest = parseStudioBundleManifestV2(validManifest());
    expect(manifest.kind).toBe("toonstudio.asset-bundle.v2");
    expect(manifest.version).toBe(2);
    expect(manifest.inServiceOnly).toBe(true);
    expect(manifest.downloadable).toBe(false);
    expect(manifest.basePath).toBe("packs/");
    expect(manifest.assets).toHaveLength(2);
    expect(manifest.assets[0]!.complete).toBe(true);
    expect(manifest.assets[1]!.convertedGlb).toBe("pack-a/converted/model.glb");
    expect(manifest.totals?.byFormat.gltf?.files).toBe(2);
    expect(manifest.totals?.runtimeUsable).toBe(2);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.assets)).toBe(true);
  });

  it("missingDependencies가 있으면 complete=false로 파생한다", () => {
    const raw = validManifest();
    (raw.assets as Array<Record<string, unknown>>)[0]!.missingDependencies = ["../Textures/gone.png"];
    const manifest = parseStudioBundleManifestV2(raw);
    expect(manifest.assets[0]!.complete).toBe(false);
    expect(manifest.assets[0]!.missingDependencies).toEqual(["../Textures/gone.png"]);
  });

  it("role이 없으면 blend는 source-only, 나머지는 runtime으로 파생한다", () => {
    const raw = validManifest({
      assets: [
        { id: "p-blend", packId: "p", format: "blend", primary: "p/model.blend", files: [] },
        { id: "p-fbx", packId: "p", format: "fbx", primary: "p/model.fbx", files: [] },
      ],
    });
    const manifest = parseStudioBundleManifestV2(raw);
    expect(manifest.assets[0]!.role).toBe("source-only");
    expect(manifest.assets[1]!.role).toBe("runtime");
  });
});

describe("parseStudioBundleManifestV2 — 거부 케이스", () => {
  it("kind/version이 다르면 거부한다", () => {
    expect(() => parseStudioBundleManifestV2(validManifest({ kind: "toonstudio.asset-bundle.v1" })))
      .toThrow(TypeError);
    expect(() => parseStudioBundleManifestV2(validManifest({ version: 1 }))).toThrow(TypeError);
    expect(() => parseStudioBundleManifestV2(null)).toThrow(TypeError);
    expect(() => parseStudioBundleManifestV2("manifest")).toThrow(TypeError);
  });

  it("권리 강제: inServiceOnly!==true 또는 downloadable!==false면 거부한다", () => {
    expect(() => parseStudioBundleManifestV2(validManifest({ inServiceOnly: false }))).toThrow(TypeError);
    expect(() => parseStudioBundleManifestV2(validManifest({ downloadable: true }))).toThrow(TypeError);
    const rightsBad = validManifest();
    (rightsBad.rights as Record<string, unknown>).downloadable = true;
    expect(() => parseStudioBundleManifestV2(rightsBad)).toThrow(TypeError);
    const noRightsFlag = validManifest();
    delete (noRightsFlag as Record<string, unknown>).inServiceOnly;
    expect(() => parseStudioBundleManifestV2(noRightsFlag)).toThrow(TypeError);
  });

  it("다운로드 필드를 가진 항목(매니페스트·에셋·파일)을 거부한다 (v1 규약 승계)", () => {
    expect(() => parseStudioBundleManifestV2(validManifest({ downloadUrl: "https://example.com/x" })))
      .toThrow(TypeError);
    const assetBad = validManifest();
    (assetBad.assets as Array<Record<string, unknown>>)[0]!.download = "x";
    expect(() => parseStudioBundleManifestV2(assetBad)).toThrow(TypeError);
    const assetFlag = validManifest();
    (assetFlag.assets as Array<Record<string, unknown>>)[0]!.downloadable = true;
    expect(() => parseStudioBundleManifestV2(assetFlag)).toThrow(TypeError);
    const fileBad = validManifest();
    const files = (fileBad.assets as Array<Record<string, unknown>>)[0]!.files as Array<Record<string, unknown>>;
    files[0]!.original = "x";
    expect(() => parseStudioBundleManifestV2(fileBad)).toThrow(TypeError);
  });

  it("blend의 runtime 선언, 중복 id, 깨진 해시, 상위 탈출 경로를 거부한다", () => {
    const blendRuntime = validManifest({
      assets: [{ id: "p-blend", packId: "p", format: "blend", role: "runtime", primary: "p/m.blend", files: [] }],
    });
    expect(() => parseStudioBundleManifestV2(blendRuntime)).toThrow(TypeError);

    const dup = validManifest();
    (dup.assets as Array<Record<string, unknown>>)[1]!.id = "pack-a-model-glb";
    expect(() => parseStudioBundleManifestV2(dup)).toThrow(TypeError);

    const badHash = validManifest();
    const files = (badHash.assets as Array<Record<string, unknown>>)[0]!.files as Array<Record<string, unknown>>;
    files[0]!.sha256 = "not-a-hash";
    expect(() => parseStudioBundleManifestV2(badHash)).toThrow(TypeError);

    const escape = validManifest();
    (escape.assets as Array<Record<string, unknown>>)[0]!.primary = "../outside.glb";
    expect(() => parseStudioBundleManifestV2(escape)).toThrow(TypeError);
  });
});

describe("표면별 선택", () => {
  const assets: StudioBundleManifestV2Asset[] = [
    makeAsset({ id: "a-fbx", format: "fbx" }),
    makeAsset({ id: "a-gltf", format: "gltf" }),
    makeAsset({ id: "a-glb", format: "glb" }),
    makeAsset({ id: "a-obj", format: "obj" }),
    makeAsset({ id: "a-dae", format: "dae" }),
    makeAsset({ id: "a-blend", format: "blend", role: "source-only" }),
    makeAsset({ id: "b-glb", packId: "pack-b", format: "glb" }),
  ];

  it("web: glb > gltf > fbx > obj > dae 순으로 정렬하고 blend는 제외한다", () => {
    const selected = selectManifestV2AssetsForSurface(
      assets.filter((asset) => asset.packId === "pack-a"),
      "web",
    );
    expect(selected.map((asset) => asset.id)).toEqual(["a-glb", "a-gltf", "a-fbx", "a-obj", "a-dae"]);
    expect(selectManifestV2AssetForSurface(assets, "web")?.id).toBe("a-glb");
  });

  it("unity-stage: glb/gltf만 허용한다", () => {
    const selected = selectManifestV2AssetsForSurface(
      assets.filter((asset) => asset.packId === "pack-a"),
      "unity-stage",
    );
    expect(selected.map((asset) => asset.id)).toEqual(["a-glb", "a-gltf"]);
    const fbxOnly = [makeAsset({ id: "only-fbx", format: "fbx" })];
    expect(selectManifestV2AssetForSurface(fbxOnly, "unity-stage")).toBeNull();
  });

  it("offline: 전 포맷을 받고 blend(source-only)가 마지막이다", () => {
    const selected = selectManifestV2AssetsForSurface(
      assets.filter((asset) => asset.packId === "pack-a"),
      "offline",
    );
    expect(selected.map((asset) => asset.id))
      .toEqual(["a-glb", "a-gltf", "a-fbx", "a-obj", "a-dae", "a-blend"]);
  });

  it("web·unity-stage는 source-only 역할을 제외한다", () => {
    const sourceOnlyGlb = [makeAsset({ id: "so-glb", format: "glb", role: "source-only" })];
    expect(selectManifestV2AssetForSurface(sourceOnlyGlb, "web")).toBeNull();
    expect(selectManifestV2AssetForSurface(sourceOnlyGlb, "offline")?.id).toBe("so-glb");
  });

  it("complete=false 에셋은 포맷 선호보다 뒤(최후순위)로 밀린다", () => {
    const mixed = [
      makeAsset({ id: "m-glb-incomplete", format: "glb", complete: false, missingDependencies: ["x.bin"] }),
      makeAsset({ id: "m-fbx", format: "fbx" }),
    ];
    expect(selectManifestV2AssetForSurface(mixed, "web")?.id).toBe("m-fbx");
    expect(selectManifestV2AssetsForSurface(mixed, "web").map((asset) => asset.id))
      .toEqual(["m-fbx", "m-glb-incomplete"]);
  });

  it("packId 단건/목록 조회가 팩 경계를 지킨다", () => {
    expect(findManifestV2AssetForSurface(assets, "pack-b", "web")?.id).toBe("b-glb");
    expect(findManifestV2AssetForSurface(assets, "pack-b", "unity-stage")?.id).toBe("b-glb");
    expect(findManifestV2AssetForSurface(assets, "no-such-pack", "web")).toBeNull();
    expect(listManifestV2PackAssetsForSurface(assets, "pack-a", "web").map((asset) => asset.id))
      .toEqual(["a-glb", "a-gltf", "a-fbx", "a-obj", "a-dae"]);
  });
});

describe("로드 디스크립터", () => {
  it("basePath와 primary를 결합하고 의존 해석 기준을 주 파일 폴더로 잡는다", () => {
    const manifest = parseStudioBundleManifestV2(validManifest());
    const gltf = manifest.assets[1]!;
    const descriptor = createStudioBundleManifestV2LoadDescriptor(manifest, gltf);
    expect(descriptor.assetId).toBe("pack-a-model-gltf");
    expect(descriptor.format).toBe("gltf");
    expect(descriptor.primaryUrl).toBe("packs/pack-a/native/model/model.gltf");
    expect(descriptor.baseUrl).toBe("packs/pack-a/native/model/");
    expect(descriptor.resolveDependency("model.bin")).toBe("packs/pack-a/native/model/model.bin");
    expect(descriptor.resolveDependency("../Textures/wood.png"))
      .toBe("packs/pack-a/native/Textures/wood.png");
    expect(descriptor.resolveDependency("https://cdn.example.com/x.png"))
      .toBe("https://cdn.example.com/x.png");
    expect(descriptor.files).toHaveLength(2);
    expect(descriptor.complete).toBe(true);
  });

  it("options.baseUrl이 매니페스트 basePath보다 우선한다", () => {
    const manifest = parseStudioBundleManifestV2(validManifest());
    const descriptor = createStudioBundleManifestV2LoadDescriptor(
      manifest,
      manifest.assets[0]!,
      { baseUrl: "/assets/studio/bundle-v2" },
    );
    expect(descriptor.primaryUrl).toBe("/assets/studio/bundle-v2/pack-a/native/model.glb");
    expect(descriptor.baseUrl).toBe("/assets/studio/bundle-v2/pack-a/native/");
  });

  it("표면 기반 디스크립터 생성이 선택과 결합된다", () => {
    const manifest = parseStudioBundleManifestV2(validManifest());
    const webDescriptor = createStudioBundleManifestV2LoadDescriptorForSurface(manifest, "pack-a", "web");
    expect(webDescriptor?.format).toBe("glb");
    const unityDescriptor = createStudioBundleManifestV2LoadDescriptorForSurface(manifest, "pack-a", "unity-stage");
    expect(unityDescriptor?.format).toBe("glb");
    expect(createStudioBundleManifestV2LoadDescriptorForSurface(manifest, "no-pack", "web")).toBeNull();
  });
});
