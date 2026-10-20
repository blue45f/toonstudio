import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioBundleImageRecord,
  filterStudioBundleAssets,
  isStudioBundleAssetEligibleForSelection,
  parseStudioBundleCatalog,
  studioBundleAssetUrl,
} from "./studio-bundle-asset-delivery";

const fixture = () => ({
  id: "cbv1-045-food-props-render-001",
  name: "로우폴리 음식 소품 렌더 · Low Poly Food Render",
  kind: "prop-image",
  category: "rendered-prop",
  path: "assets/cbv1-045-food-props-render-001/prop.webp",
  previewPath: "assets/cbv1-045-food-props-render-001/thumbnail.webp",
  sha256: "a".repeat(64),
  bytes: 4096,
  width: 1536,
  height: 1536,
  style: "stylized-low-poly",
  visualReviewed: true,
  curationStatus: "selected-after-visual-triage",
  studioRuntimeVerified: false,
  derivedFromPack: "cbv1-045-low-poly-food-packaging",
  derivedFrom: "cbv1-045-model-0001",
  sourceModelSha256: "b".repeat(64),
  renderResolution: [1536, 1536],
  renderVariants: ["color", "line"],
  selectionTerm: "food",
  technicalChecks: ["source-GLB-checksum-bound", "transparent-alpha"],
  license: {
    id: "EmaceArt-Asset-License",
    provider: "EmaceArt",
    sourceUrl: "https://itch.io/b/3905/creator-bundle-volume-1",
    commercialUse: true,
    redistributionAllowed: false,
    inServiceOnly: true,
    checkedOn: "2026-10-20",
  },
});

const draftSlot = () => ({
  ...fixture(),
  id: "cbv1-042-kitchen-props-render-001",
  path: "assets/cbv1-042-kitchen-props-render-001/prop.webp",
  previewPath: "assets/cbv1-042-kitchen-props-render-001/thumbnail.webp",
  derivedFromPack: "cbv1-042-kitchen-restaurant-megapack",
  derivedFrom: null,
  bytes: null,
  sha256: null,
  sourceModelSha256: null,
  curationStatus: "draft-pending-render",
  license: {...fixture().license, checkedOn: null},
});

const manifest = (assets: unknown[], pack: Record<string, unknown> = {}) => ({
  schema: "toonstudio.asset-delivery.v1",
  pack: {id: "bundle-renders-v1", title: "Creator Bundle 렌더 소품", inServiceOnly: true, downloadable: false, ...pack},
  assets,
});

describe("bundle render delivery catalog boundary", () => {
  it("admits a non-CC0 license declared by the manifest itself", () => {
    const result = parseStudioBundleCatalog(manifest([fixture()]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      licenseId: "EmaceArt-Asset-License",
      licenseUrl: null,
      provider: "EmaceArt",
      derivedFromPack: "cbv1-045-low-poly-food-packaging",
      renderVariants: ["color", "line"],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
  });

  it("admits a background render alongside prop images", () => {
    const background = {
      ...fixture(),
      id: "cbv1-021-slavica-scene-render-001",
      kind: "background",
      path: "assets/cbv1-021-slavica-scene-render-001/background.webp",
      previewPath: "assets/cbv1-021-slavica-scene-render-001/thumbnail.webp",
      width: 2048,
      height: 1152,
      renderResolution: [2048, 1152],
    };
    const result = parseStudioBundleCatalog(manifest([fixture(), background]));
    expect(result.map((asset) => asset.kind)).toEqual(["prop-image", "background"]);
  });

  it("accepts a deed URL when the pack declares the license set", () => {
    const asset = fixture();
    const result = parseStudioBundleCatalog(manifest(
      [{...asset, license: {...asset.license, url: "https://emaceart.dev/license"}}],
      {licenses: [{id: "EmaceArt-Asset-License", provider: "EmaceArt", sourceHost: "itch.io", deedUrl: "https://emaceart.dev/license"}]},
    ));
    expect(result[0].licenseUrl).toBe("https://emaceart.dev/license");
  });

  it("rejects an asset whose license is not in the pack declaration", () => {
    const asset = fixture();
    expect(() => parseStudioBundleCatalog(manifest(
      [{...asset, license: {...asset.license, id: "RG-Poly-Asset-License", provider: "RG Poly"}}],
      {licenses: [{id: "EmaceArt-Asset-License", provider: "EmaceArt", sourceHost: "itch.io"}]},
    ))).toThrow();
  });

  it("rejects a deed URL that differs from the pack declaration", () => {
    const asset = fixture();
    expect(() => parseStudioBundleCatalog(manifest(
      [{...asset, license: {...asset.license, url: "https://example.com/other-license"}}],
      {licenses: [{id: "EmaceArt-Asset-License", provider: "EmaceArt", sourceHost: "itch.io", deedUrl: "https://emaceart.dev/license"}]},
    ))).toThrow();
  });

  it("rejects inconsistent declarations for the same license id", () => {
    const first = fixture();
    const second = {
      ...fixture(),
      id: "cbv1-045-food-props-render-002",
      path: "assets/cbv1-045-food-props-render-002/prop.webp",
      license: {...fixture().license, provider: "Someone Else"},
    };
    expect(() => parseStudioBundleCatalog(manifest([first, second]))).toThrow();
    const third = {
      ...second,
      license: {...fixture().license, sourceUrl: "https://example.com/bundle"},
    };
    expect(() => parseStudioBundleCatalog(manifest([first, third]))).toThrow();
  });

  it("does not let bundle assets be mislabeled as CC0", () => {
    const asset = fixture();
    expect(() => parseStudioBundleCatalog(manifest([{
      ...asset,
      license: {...asset.license, id: "CC0-1.0"},
    }]))).toThrow();
  });

  it("requires the in-service-only license terms, not merely commercial use", () => {
    const asset = fixture();
    expect(() => parseStudioBundleCatalog(manifest([{
      ...asset,
      license: {...asset.license, redistributionAllowed: true},
    }]))).toThrow();
    expect(() => parseStudioBundleCatalog(manifest([{
      ...asset,
      license: {...asset.license, inServiceOnly: false},
    }]))).toThrow();
    expect(() => parseStudioBundleCatalog(manifest([{
      ...asset,
      license: {...asset.license, commercialUse: false},
    }]))).toThrow();
  });

  it("requires the pack itself to declare in-service-only, non-downloadable delivery", () => {
    expect(() => parseStudioBundleCatalog(manifest([fixture()], {downloadable: true}))).toThrow();
    expect(() => parseStudioBundleCatalog(manifest([fixture()], {inServiceOnly: false}))).toThrow();
    const withoutPack = {schema: "toonstudio.asset-delivery.v1", assets: [fixture()]};
    expect(() => parseStudioBundleCatalog(withoutPack)).toThrow();
  });

  it.each(["model", "surface-texture", "effect-mask"])("rejects the non-render kind %s", (kind) => {
    expect(() => parseStudioBundleCatalog(manifest([{...fixture(), kind}]))).toThrow();
  });

  it.each(["original", "download", "downloadUrl", "downloadPath"])("rejects an entry carrying a %s field", (key) => {
    expect(() => parseStudioBundleCatalog(manifest([{...fixture(), [key]: "assets/x/y.webp"}]))).toThrow();
    expect(() => parseStudioBundleCatalog(manifest([{...draftSlot(), [key]: "assets/x/y.webp"}]))).toThrow();
  });

  it("skips pre-render draft slots while loading completed entries", () => {
    const result = parseStudioBundleCatalog(manifest([draftSlot(), fixture()]));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(fixture().id);
    expect(parseStudioBundleCatalog(manifest([draftSlot()]))).toEqual([]);
  });

  it("still rejects a completed entry whose integrity fields are empty", () => {
    const asset = fixture();
    expect(() => parseStudioBundleCatalog(manifest([{...asset, sha256: null}]))).toThrow();
    expect(() => parseStudioBundleCatalog(manifest([{...asset, bytes: null}]))).toThrow();
  });

  it("does not admit duplicate IDs, even across draft slots", () => {
    expect(() => parseStudioBundleCatalog(manifest([fixture(), fixture()]))).toThrow();
    expect(() => parseStudioBundleCatalog(manifest([draftSlot(), fixture()]))).not.toThrow();
    const sameIdCompleted = {...fixture(), id: draftSlot().id};
    expect(() => parseStudioBundleCatalog(manifest([draftSlot(), sameIdCompleted]))).toThrow();
  });

  // secretlint-disable-next-line @secretlint/secretlint-rule-basicauth -- synthetic URL-userinfo rejection fixture
  it.each(["http://itch.io/b/3905", "https://user:pass@itch.io/b/3905", "https://itch.io:8443/b/3905", "not-a-url"])("rejects a forged source URL %s", (sourceUrl) => {
    const asset = fixture();
    expect(() => parseStudioBundleCatalog(manifest([{
      ...asset,
      license: {...asset.license, sourceUrl},
    }]))).toThrow();
  });

  it("validates the optional license check date while tolerating a null draft value", () => {
    const asset = fixture();
    expect(() => parseStudioBundleCatalog(manifest([{
      ...asset,
      license: {...asset.license, checkedOn: "October 20"},
    }]))).toThrow();
    expect(parseStudioBundleCatalog(manifest([{
      ...asset,
      license: {...asset.license, checkedOn: null},
    }]))).toHaveLength(1);
  });

  it("rejects a render resolution record that disagrees with the delivered size", () => {
    expect(() => parseStudioBundleCatalog(manifest([{...fixture(), renderResolution: [1024, 1024]}]))).toThrow();
  });

  it.each(["../secret.webp", "assets/../secret.webp", "assets//prop.webp", "https://example.com/prop.webp", "assets/prop.glb", "assets/prop.webp?token=x"])("rejects unsafe path %s", (input) => {
    expect(() => studioBundleAssetUrl(input)).toThrow();
  });

  it("builds delivery URLs only under the bundle pack root", () => {
    expect(studioBundleAssetUrl("assets/cbv1-045-food-props-render-001/prop.webp"))
      .toBe("/assets/studio/bundle-renders-v1/assets/cbv1-045-food-props-render-001/prop.webp");
  });

  it("filters by name, provider, license and selection term with kind narrowing", () => {
    const assets = parseStudioBundleCatalog(manifest([fixture()]));
    expect(filterStudioBundleAssets(assets, "음식")).toHaveLength(1);
    expect(filterStudioBundleAssets(assets, "emaceart")).toHaveLength(1);
    expect(filterStudioBundleAssets(assets, "food")).toHaveLength(1);
    expect(filterStudioBundleAssets(assets, "없는검색어")).toHaveLength(0);
    expect(filterStudioBundleAssets(assets, "", "background")).toHaveLength(0);
    expect(filterStudioBundleAssets(assets, "", "prop-image")).toHaveLength(1);
  });

  it("gates new selection on visual review without rejecting explicit exclusions silently", () => {
    const [reviewed] = parseStudioBundleCatalog(manifest([fixture()]));
    expect(isStudioBundleAssetEligibleForSelection(reviewed)).toBe(true);
    const [unreviewed] = parseStudioBundleCatalog(manifest([{...fixture(), visualReviewed: false}]));
    expect(isStudioBundleAssetEligibleForSelection(unreviewed)).toBe(false);
    const [rejected] = parseStudioBundleCatalog(manifest([{...fixture(), curationStatus: "rejected"}]));
    expect(isStudioBundleAssetEligibleForSelection(rejected)).toBe(false);
  });
});

describe("bundle render image record", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubDelivery(bytes: Uint8Array, width = 1536, height = 1536): void {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      headers: {get: () => String(bytes.byteLength)},
      body: {
        getReader: () => {
          let sent = false;
          return {
            read: async () => {
              if (sent) return {done: true, value: undefined};
              sent = true;
              return {done: false, value: bytes};
            },
            cancel: async () => {},
            releaseLock: () => {},
          };
        },
      },
    })));
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({width, height, close: () => {}})));
  }

  it("verifies integrity and stamps the declared license into the canvas record rights", async () => {
    const bytes = new TextEncoder().encode("bundle-render-webp-bytes");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const [asset] = parseStudioBundleCatalog(manifest([{...fixture(), sha256, bytes: bytes.byteLength}]));
    stubDelivery(bytes);
    const record = await createStudioBundleImageRecord(asset);
    expect(record.id).toBe("bundle:cbv1-045-food-props-render-001");
    expect(record.kind).toBe("imported");
    expect(record.contentHash).toBe(`sha256:${sha256}`);
    expect(record.dataUrl.startsWith("data:image/webp;base64,")).toBe(true);
    expect(record.rights).toMatchObject({
      sourceKind: "imported",
      sourceId: "cbv1-045-food-props-render-001",
      licenseId: "EmaceArt-Asset-License",
      licenseUrl: null,
      attributionRequired: false,
      rightsConfirmed: true,
    });
  });

  it("refuses bytes that do not match the manifest hash", async () => {
    const [asset] = parseStudioBundleCatalog(manifest([fixture()]));
    stubDelivery(new TextEncoder().encode("different-bytes"));
    await expect(createStudioBundleImageRecord(asset)).rejects.toThrow("무결성");
  });
});
