import { bindConsumerReleaseFixture } from "../../../bg3d/studio-bg3d-bundle-release-consumer.test-fixture";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Bg3dVerifiedStoredRecord, prepareVerifiedBg3dModelRecord } from "../../../bg3d/bg3d-model-library";
import { loadStudioBg3dBundleThemePackRecord } from "../../../bg3d/studio-bg3d-bundle-asset-loader";
import {
  loadStudioBg3dBundleThemePacks,
  parseStudioBg3dBundleThemePacks,
  resetStudioBg3dBundleThemePacksCache,
  studioBg3dBundleAssetUrl,
  type StudioBg3dBundlePackRights,
} from "../../../bg3d/studio-bg3d-bundle-theme-packs";
import type { StudioBg3dGlbMetrics } from "../../../bg3d/studio-bg3d-glb-validation";
import { loadVirtualThreeThemeModelSource } from "./virtual-three-theme-model-source";
import type { VirtualThreeThemeModelRefBundle } from "./virtual-three-theme-types";

// 실제 catalog·loader는 같은 모듈 그래프에서 사용하고 registry·검증 준비 포트만 통제한다.
const ports = vi.hoisted(() => ({
  refs: new Map<string, VirtualThreeThemeModelRefBundle>(),
  prepare: vi.fn<typeof prepareVerifiedBg3dModelRecord>(),
}));
vi.mock("./virtual-three-theme-models", () => ({ findVirtualThreeThemeModelRef: (id: string) => ports.refs.get(id) }));
vi.mock("../../../bg3d/bg3d-model-library", () => ({ prepareVerifiedBg3dModelRecord: ports.prepare }));

const OWNER = "cbv1-008-unit-shared-pack";
const RIGHTS: StudioBg3dBundlePackRights = {
  serve: "allow", status: "public-domain", licenseName: "합성 shared-loader CC0", commercialUse: true, attributionRequired: false,
};
function glbFixture(): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{}] }));
  const padded = Math.ceil(json.byteLength / 4) * 4;
  const bytes = new Uint8Array(20 + padded);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20); bytes.set(json, 20);
  return bytes;
}
const GLB = glbFixture();
const HASH: `sha256:${string}` = `sha256:${createHash("sha256").update(GLB).digest("hex")}`;
function rawCatalog(id: string) {
  return {
    schema: "toonstudio.bg3d-bundle-theme-packs.v1", version: 1, inServiceOnly: true, downloadable: false,
    rights: { holder: "합성 테스트", inServiceOnly: true, downloadable: false }, assetRoot: "/assets/studio/bundle-v2/", themes: [],
    packs: [{ catalogIds: [OWNER], title: "합성 shared 팩", creator: "테스트", theme: null, category: "prop", ingestPackIds: ["unit-shared"],
      placeable: 1, twinCovered: 0, deferred: { fbx: 0, gltf: 0, blend: 0, overBudget: {} }, rights: RIGHTS, note: null }],
    assets: [{ id, pack: 0, path: "unit-shared/model.glb", bytes: GLB.byteLength, sha256: HASH.slice(7), tris: 0 }],
    presets: [], crowdPacks: [], pendingPacks: [],
    totals: { packs: 1, placeableAssets: 1, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 },
  };
}
function metrics(): StudioBg3dGlbMetrics {
  return {
    byteSize: GLB.byteLength, jsonByteSize: GLB.byteLength - 20, binByteSize: 0, nodes: 0, meshes: 0, meshPrimitives: 0,
    drawCalls: 0, triangles: 0, materials: 0, textures: 0, images: 0, imageBytes: 0, estimatedDecodedImageBytes: 0,
    maxImageDimension: 0, undeterminedImageDimensions: 0, lights: 0, animations: 0, animationChannels: 0,
    animationKeyframes: 0, animationValues: 0, skins: 0, joints: 0, morphTargets: 0, accessorElements: 0, estimatedDecodedGeometryBytes: 0,
  };
}
function record(id: string): Bg3dVerifiedStoredRecord {
  return {
    id, storageVersion: 2, name: "합성 shared 모델", format: "glb", blob: new Blob([Uint8Array.from(GLB).buffer], { type: "model/gltf-binary" }),
    thumbnail: null, createdAt: 1, updatedAt: 1, contentHash: HASH, byteSize: GLB.byteLength, mime: "model/gltf-binary",
    validationVersion: 1, validatedAt: 1, validatorProfile: "mobile", validatorMetrics: metrics(),
    rights: { status: RIGHTS.status, commercialUse: true, attributionRequired: false, licenseName: RIGHTS.licenseName },
  };
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("아직 준비하지 않은 gate입니다."); };
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
let sharedSequence = 0;
beforeEach(() => {
  vi.resetAllMocks();
  ports.refs.clear();
  resetStudioBg3dBundleThemePacksCache();
});
afterEach(() => {
  resetStudioBg3dBundleThemePacksCache();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("실제 catalog·shared loader의 caller 취소 경계", () => {
  it("첫 caller 취소가 다른 caller와 공용 GLB fetch·worker 준비를 중단하지 않는다", async () => {
    expect(vi.isMockFunction(loadStudioBg3dBundleThemePacks)).toBe(false);
    expect(vi.isMockFunction(loadStudioBg3dBundleThemePackRecord)).toBe(false);
    const id = `cbv1-ingest-unit-shared-${++sharedSequence}`;
    ports.refs.set(id, { source: "bundle", assetId: id, expectedSha256: HASH, byteLength: GLB.byteLength, catalogId: OWNER });
    const raw = rawCatalog(id);
    bindConsumerReleaseFixture(() => raw);
    const data = parseStudioBg3dBundleThemePacks(raw);
    const asset = data.assets[0];
    if (!asset) throw new Error("합성 catalog에 모델이 없습니다.");
    const nativeUrl = studioBg3dBundleAssetUrl(asset, data);
    const nativeStarted = deferred<void>();
    const nativeBody = deferred<Uint8Array>();
    const nativeRequests: (RequestInit | undefined)[] = [];
    const metadataResponses: Response[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (/^\/assets\/3d\/environments\/bundle-v1\/theme-packs\.[a-f0-9]{64}\.json$/u.test(url)) {
        // catalog 재조회마다 JSON 본문 소유권을 새로 만든다. GLB gate를 공유하지 않는다.
        const response = new Response(JSON.stringify(raw), { headers: { "content-type": "application/json" } });
        metadataResponses.push(response);
        return response;
      }
      if (url !== nativeUrl) throw new Error(`예상하지 않은 합성 fetch입니다: ${url}`);
      nativeRequests.push(init);
      nativeStarted.resolve(undefined);
      return new Response(Uint8Array.from(await nativeBody.promise).buffer, { headers: { "content-type": "model/gltf-binary" } });
    });
    vi.stubGlobal("fetch", fetcher);
    ports.prepare.mockImplementation(async (input, options) => {
      if (!("file" in input)) throw new Error("공유 번들 loader는 파일·예상 SHA가 있는 import item을 전달해야 합니다.");
      expect(options?.idFactory?.()).toBe(id);
      expect(input.expectedSha256).toBe(HASH);
      expect(new Uint8Array(await input.file.arrayBuffer())).toEqual(GLB);
      return record(id);
    });
    const a = new AbortController(); const b = new AbortController();
    const first = loadVirtualThreeThemeModelSource(id, a.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = loadVirtualThreeThemeModelSource(id, b.signal);
    try {
      await nativeStarted.promise;
      a.abort(); await rejected;
      expect(b.signal.aborted).toBe(false);
      expect(nativeRequests).toHaveLength(1);
      expect(nativeRequests[0]?.signal).toBeUndefined();
      expect(ports.prepare).not.toHaveBeenCalled();
      nativeBody.resolve(Uint8Array.from(GLB));
      const survivor = await second;
      expect(survivor.contentHash).toBe(HASH);
      expect(survivor.byteLength).toBe(GLB.byteLength);
      expect(new Uint8Array(await survivor.blob.arrayBuffer())).toEqual(GLB);
      expect(() => survivor.assertCurrent()).not.toThrow();
      expect(nativeRequests).toHaveLength(1);
      expect(ports.prepare).toHaveBeenCalledTimes(1);
      expect(ports.prepare.mock.calls[0]?.[1]).toMatchObject({ profile: "mobile", executionBackend: "worker" });
      expect(ports.prepare.mock.calls[0]?.[1]?.signal).toBeUndefined();
      expect(metadataResponses.length).toBeGreaterThanOrEqual(1);
      expect(new Set(metadataResponses).size).toBe(metadataResponses.length);
      expect(metadataResponses.every(response => response.bodyUsed)).toBe(true);
    } finally {
      // 단언 실패 때도 실제 공유 작업을 끝낸 뒤 global fetch를 복원한다.
      a.abort(); nativeBody.resolve(Uint8Array.from(GLB));
      await Promise.allSettled([first, second, rejected]);
    }
  });
});
