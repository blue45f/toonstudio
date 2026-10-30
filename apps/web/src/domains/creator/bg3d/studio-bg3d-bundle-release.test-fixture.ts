import { createHash } from "node:crypto";

import { requireStudioBg3dBundleRelease } from "./studio-bg3d-bundle-release";

export function rawReleaseCatalog(modelSha = "a".repeat(64)) {
  return {
    schema: "toonstudio.bg3d-bundle-theme-packs.v1", version: 1, inServiceOnly: true, downloadable: false,
    rights: { holder: "합성 구매 팩", inServiceOnly: true, downloadable: false },
    assetRoot: "/assets/studio/bundle-v2/", themes: [{ id: "nature", label: "자연" }],
    packs: [{ catalogIds: ["cbv1-030-nature-megapack-extended"], title: "합성 자연", creator: "RG Poly",
      theme: "nature", category: "environment", ingestPackIds: ["cbv1-ingest-fixture-nature"],
      placeable: 1, twinCovered: 0, deferred: { fbx: 0, gltf: 0, blend: 0, overBudget: {} },
      rights: { serve: "allow", status: "public-domain", licenseName: "CC0-1.0", commercialUse: true, attributionRequired: false }, note: null }],
    assets: [{ id: "cbv1-ingest-fixture-nature-leaf", pack: 0, path: "cbv1-ingest-fixture-nature/native/Leaf.glb",
      bytes: 128, sha256: modelSha, tris: 12 }], presets: [], crowdPacks: [], pendingPacks: [],
    totals: { packs: 1, placeableAssets: 1, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 },
  };
}

/** 원문 SHA·길이를 실제 계산하는 합성 JSON fixture다. 실제 5,229개 admission 성공을 뜻하지 않는다. */
export function releaseFixture(modelSha = "a".repeat(64), indexPatch: Record<string, unknown> = {},
  mutateCatalog?: (catalog: ReturnType<typeof rawReleaseCatalog>) => void) {
  const catalog = rawReleaseCatalog(modelSha);
  mutateCatalog?.(catalog);
  const catalogText = JSON.stringify(catalog) + "\n";
  const catalogSha = createHash("sha256").update(catalogText).digest("hex");
  const index = { schema: "toonstudio.bundle-v2-deploy-index.v1", version: 1, files: 1, bytes: 128,
    packs: 1, objects: 1, objectBytes: 128, keyScheme: "sha256", catalogSha256: catalogSha, ...indexPatch };
  const indexText = JSON.stringify(index) + "\n", indexSha = createHash("sha256").update(indexText).digest("hex");
  const release = requireStudioBg3dBundleRelease({ schema: "toonstudio.bg3d-bundle-release.v1", version: 1,
    catalog: { url: `/assets/3d/environments/bundle-v1/theme-packs.${catalogSha}.json`, sha256: catalogSha,
      bytes: new TextEncoder().encode(catalogText).byteLength },
    index: { url: `/assets/3d/environments/bundle-v1/deploy-index.${indexSha}.json`, sha256: indexSha,
      bytes: new TextEncoder().encode(indexText).byteLength } });
  function response(kind: "catalog" | "index", text = kind === "catalog" ? catalogText : indexText) {
    return new Response(text, { headers: { "content-type": "application/json; charset=utf-8" } });
  }
  return { catalog, index, catalogText, indexText, release, response };
}
