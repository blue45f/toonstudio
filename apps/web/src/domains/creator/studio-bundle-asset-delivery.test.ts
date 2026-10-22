import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioBundleImageRecord,
  filterStudioBundleAssets,
  isStudioBundleAssetEligibleForSelection,
  parseStudioBundleCatalog,
  studioBundleAssetUrl,
} from "./studio-bundle-asset-delivery";

/** 원장이 연 팩의 슬롯에 sync 스크립트가 스탬프하는 블록(원장 투영 + 팩 id). 로더는 이 블록이 있는 완성 슬롯만 전달한다. */
const ledgerRights = () => ({
  ledgerPackId: "cbv1-045-food-packaging",
  serve: "allow",
  status: "licensed",
  licenseName: "Creator Bundle: Volume 1 — fixture license",
  commercialUse: true,
  attributionRequired: false,
});

// fixture()는 원장이 연 팩의 스탬프된 완성 슬롯이다. 부정 시험은 이 fixture를 변이해야 의미가 있다 — 권리 블록이 없는 슬롯은
// 로더가 나머지 검증보다 앞서 건너뛰므로 어떤 변이를 해도 던지지 않는다.
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
  rights: ledgerRights(),
});

function withoutKey<T extends Record<string, unknown>>(value: T, key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = {...value};
  delete copy[key];
  return copy;
}

/** 원장이 열지 않은 팩의 슬롯 모양: 블록이 없다. */
function withoutRights<T extends Record<string, unknown>>(slot: T): Omit<T, "rights"> {
  const copy: Record<string, unknown> = {...slot};
  delete copy.rights;
  return copy as Omit<T, "rights">;
}

const draftSlot = () => ({
  ...withoutRights(fixture()),
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
      rights: ledgerRights(),
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.isFrozen(result[0].rights)).toBe(true);
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

  it.each(["CC0-1.0", "cc0-1.0", "Cc0-1.0"])("does not let bundle assets be mislabeled as CC0 (%s)", (id) => {
    const asset = fixture();
    expect(() => parseStudioBundleCatalog(manifest([{
      ...asset,
      license: {...asset.license, id},
    }]))).toThrow();
    // 에셋의 라이선스는 정상 선언돼 있고, 팩 선언에 CC0 계열 id가 섞인 것만이 거부 사유다.
    const declared = {id: "EmaceArt-Asset-License", provider: "EmaceArt", sourceHost: "itch.io"};
    expect(parseStudioBundleCatalog(manifest([asset], {licenses: [declared]}))).toHaveLength(1);
    expect(() => parseStudioBundleCatalog(manifest(
      [asset],
      {licenses: [declared, {id, provider: "EmaceArt", sourceHost: "itch.io"}]},
    ))).toThrow();
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
    expect(filterStudioBundleAssets(assets, "fixture license")).toHaveLength(1);
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

describe("bundle render ledger rights gate", () => {
  const second = () => ({
    ...fixture(),
    id: "cbv1-028-nature-props-render-001",
    path: "assets/cbv1-028-nature-props-render-001/prop.webp",
    previewPath: "assets/cbv1-028-nature-props-render-001/thumbnail.webp",
    derivedFromPack: "cbv1-028-lumagrove-wonky-woods",
    rights: {...ledgerRights(), ledgerPackId: "cbv1-028-lumagrove-wonky-woods"},
  });

  it("skips a completed slot that carries no ledger rights block, however complete its own declarations are", () => {
    const closed = withoutRights(fixture());
    expect(parseStudioBundleCatalog(manifest([closed]))).toEqual([]);
    expect(parseStudioBundleCatalog(manifest([{...closed, rights: null}]))).toEqual([]);
    expect(parseStudioBundleCatalog(manifest([{...closed, rights: undefined}]))).toEqual([]);
  });

  it("keeps delivering stamped slots next to a closed one, and a closed slot's thin data never blocks the catalog", () => {
    const closed = {...withoutRights(second()), sha256: null, bytes: null, license: undefined, path: 42};
    const result = parseStudioBundleCatalog(manifest([closed, fixture()]));
    expect(result.map((asset) => asset.id)).toEqual([fixture().id]);
    // 반대로 블록이 있는 슬롯의 자료는 여전히 전수 검증된다.
    expect(() => parseStudioBundleCatalog(manifest([{...second(), sha256: null}]))).toThrow();
  });

  it("skips a slot whose pack id is missing, even with a well-formed block", () => {
    expect(parseStudioBundleCatalog(manifest([{...fixture(), derivedFromPack: undefined}]))).toEqual([]);
    expect(parseStudioBundleCatalog(manifest([{...fixture(), derivedFromPack: null}]))).toEqual([]);
    expect(parseStudioBundleCatalog(manifest([withoutKey(fixture(), "derivedFromPack")]))).toEqual([]);
    expect(() => parseStudioBundleCatalog(manifest([{...fixture(), derivedFromPack: 7}]))).toThrow();
  });

  it("closes a block that is not commercially usable or needs attribution instead of delivering it", () => {
    expect(parseStudioBundleCatalog(manifest([{...fixture(), rights: {...ledgerRights(), commercialUse: false}}]))).toEqual([]);
    expect(parseStudioBundleCatalog(manifest([{...fixture(), rights: {...ledgerRights(), attributionRequired: true}}]))).toEqual([]);
  });

  it("does not let a draft slot through because it carries a block", () => {
    expect(parseStudioBundleCatalog(manifest([{...draftSlot(), rights: ledgerRights()}]))).toEqual([]);
  });

  it("rejects a malformed block rather than reading around it", () => {
    const malformed: unknown[] = [
      "allow", 7, true, [], [ledgerRights()],
      {...ledgerRights(), serve: "hold"},
      {...ledgerRights(), serve: "ALLOW"},
      {...ledgerRights(), serve: undefined},
      {...ledgerRights(), status: "free"},
      {...ledgerRights(), status: undefined},
      {...ledgerRights(), commercialUse: "true"},
      {...ledgerRights(), attributionRequired: 0},
      {...ledgerRights(), ledgerPackId: ""},
      {...ledgerRights(), ledgerPackId: 7},
      {...ledgerRights(), licenseName: ""},
      {...ledgerRights(), licenseName: "x".repeat(201)},
      {...ledgerRights(), licenseName: "bad\nname"},
      {...ledgerRights(), downloadUrl: "assets/x/y.webp"},
      {...ledgerRights(), original: "assets/x/y.webp"},
      withoutKey(ledgerRights(), "licenseName"),
      withoutKey(ledgerRights(), "ledgerPackId"),
      JSON.parse('{"ledgerPackId":"p","serve":"allow","status":"licensed","licenseName":"n","commercialUse":true,"__proto__":{"attributionRequired":false}}'),
    ];
    for (const rights of malformed) {
      expect(() => parseStudioBundleCatalog(manifest([{...fixture(), rights}])), JSON.stringify(rights)).toThrow();
    }
  });

  it("reads only the known block fields and ignores unknown ones, so a newer manifest never breaks an older client", () => {
    const [asset] = parseStudioBundleCatalog(manifest([{...fixture(), rights: {...ledgerRights(), attributionText: "future field", extra: 1}}]));
    expect(asset.rights).toEqual(ledgerRights());
    expect(Object.keys(asset.rights).sort()).toEqual(Object.keys(ledgerRights()).sort());
  });

  it("only admits image files inside the slot's own folder, so a stamped slot cannot point at another slot's files", () => {
    const own = fixture();
    for (const overrides of [
      {path: "assets/cbv1-042-kitchen-props-render-001/prop.webp"},
      {previewPath: "assets/cbv1-042-kitchen-props-render-001/thumbnail.webp"},
      {path: `assets/${own.id}/nested/prop.webp`},
      {previewPath: `previews/${own.id}.png`},
      {previewPath: "previews/anything.png"},
      {path: `assets/${own.id}.webp`},
    ]) {
      expect(() => parseStudioBundleCatalog(manifest([{...own, ...overrides}])), JSON.stringify(overrides)).toThrow();
    }
    expect(parseStudioBundleCatalog(manifest([{...own, previewPath: `assets/${own.id}/thumbnail.png`}]))).toHaveLength(1);
  });

  it("takes the delivered rights from the block, not from the slot's own license declaration", () => {
    const [asset] = parseStudioBundleCatalog(manifest([{
      ...fixture(),
      license: {...fixture().license, id: "EmaceArt-Asset-License"},
      rights: {...ledgerRights(), licenseName: "Ledger-granted license name", status: "public-domain"},
    }]));
    expect(asset.rights).toEqual({
      ledgerPackId: "cbv1-045-food-packaging", serve: "allow", status: "public-domain",
      licenseName: "Ledger-granted license name", commercialUse: true, attributionRequired: false,
    });
    expect(asset.licenseId).toBe("EmaceArt-Asset-License");
  });

  it("is unaffected by selection filtering: only the stamped slots exist to filter", () => {
    const assets = parseStudioBundleCatalog(manifest([withoutRights(fixture()), second()]));
    expect(assets.map((asset) => asset.id)).toEqual([second().id]);
    expect(filterStudioBundleAssets(assets, "lumagrove")).toHaveLength(0);
    expect(filterStudioBundleAssets(assets, "emaceart")).toHaveLength(1);
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

  it("verifies integrity and stamps the ledger-granted license into the canvas record rights", async () => {
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
      licenseId: "creator-bundle-ledger:cbv1-045-food-packaging",
      licenseLabel: "Creator Bundle: Volume 1 — fixture license",
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
