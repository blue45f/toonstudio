import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Bg3dVerifiedStoredRecord, prepareVerifiedBg3dModelRecord } from "../../../bg3d/bg3d-model-library";
import type { loadStudioBg3dBundleThemePackRecord } from "../../../bg3d/studio-bg3d-bundle-asset-loader";
import { parseStudioBg3dBundleThemePacks, type StudioBg3dBundlePackRights, type StudioBg3dBundleThemePacks } from "../../../bg3d/studio-bg3d-bundle-theme-packs";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, type StudioBg3dGlbMetrics } from "../../../bg3d/studio-bg3d-glb-validation";
import { validateStudioBg3dGlbOffMainThread, type StudioBg3dGlbWorkerValidationOutcome } from "../../../bg3d/studio-bg3d-glb-validation-worker-client";
import { STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS } from "../../../bg3d/studio-bg3d-meshopt";
import type { StudioThreeGeneratedAsset } from "../studio-virtual-space-three-generated-assets";
import type { VirtualThreeThemeModelRef, VirtualThreeThemeModelRefBundle, VirtualThreeThemeModelRefGenerated } from "./virtual-three-theme-types";
import { loadVirtualThreeThemeModelSource } from "./virtual-three-theme-model-source";

const ports = vi.hoisted(() => {
  const publication: { current: StudioBg3dBundleThemePacks | null; revision: number } = { current: null, revision: 1 };
  const generated: StudioThreeGeneratedAsset[] = [];
  return {
    publication, generated, refs: new Map<string, VirtualThreeThemeModelRef>(),
    record: vi.fn<typeof loadStudioBg3dBundleThemePackRecord>(),
    prepare: vi.fn<typeof prepareVerifiedBg3dModelRecord>(),
    fetch: vi.fn<typeof fetch>(),
  };
});
vi.mock("./virtual-three-theme-models", () => ({ findVirtualThreeThemeModelRef: (id: string) => ports.refs.get(id) }));
vi.mock("../studio-virtual-space-three-generated-assets", () => ({ STUDIO_THREE_GENERATED_ASSETS: ports.generated }));
vi.mock("../../../bg3d/studio-bg3d-bundle-theme-packs", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../bg3d/studio-bg3d-bundle-theme-packs")>();
  return {
    ...actual,
    loadStudioBg3dBundleThemePacks: async () => {
      if (!ports.publication.current) throw new Error("테스트 catalog가 없습니다.");
      return ports.publication.current;
    },
    getLoadedStudioBg3dBundleThemePacks: () => ports.publication.current,
    getStudioBg3dBundleThemePacksPublicationRevision: () => ports.publication.revision,
    findStudioBg3dBundleAsset: (id: string) => ports.publication.current?.assets.find(asset => asset.id === id) ?? null,
  };
});
vi.mock("../../../bg3d/studio-bg3d-bundle-asset-loader", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../bg3d/studio-bg3d-bundle-asset-loader")>();
  return { ...actual, loadStudioBg3dBundleThemePackRecord: ports.record };
});
vi.mock("../../../bg3d/bg3d-model-library", () => ({ prepareVerifiedBg3dModelRecord: ports.prepare }));
// 병렬 import도 같은 export spy를 사용하며 beforeEach에서 검증 결과를 주입한다.
vi.mock("../../../bg3d/studio-bg3d-glb-validation-worker-client", { spy: true });
const workerPort = vi.mocked(validateStudioBg3dGlbOffMainThread);

const BUNDLE_ID = "cbv1-ingest-unit-model-source-1";
const SECOND_BUNDLE_ID = "cbv1-ingest-unit-model-source-2";
const GENERATED_ID = "tripo-unit-model-source";
const OWNER = "cbv1-008-unit-pack";
const RIGHTS: StudioBg3dBundlePackRights = {
  serve: "allow", status: "public-domain", licenseName: "합성 테스트 CC0", commercialUse: true, attributionRequired: false,
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
const bundleRef: VirtualThreeThemeModelRefBundle = { source: "bundle", assetId: BUNDLE_ID, expectedSha256: HASH, byteLength: GLB.byteLength, catalogId: OWNER };
const generatedRef: VirtualThreeThemeModelRefGenerated = {
  source: "generated", id: GENERATED_ID, provenanceId: GENERATED_ID, url: "/models/tripo3d-mcp/unit-model-source.glb", sha256: HASH.slice(7), byteLength: GLB.byteLength,
};

function catalog(options: { owner?: string; rights?: StudioBg3dBundlePackRights | null; sha?: `sha256:${string}`; bytes?: number; path?: string; ids?: readonly string[] } = {}): StudioBg3dBundleThemePacks {
  const ids = options.ids ?? [BUNDLE_ID, SECOND_BUNDLE_ID];
  return parseStudioBg3dBundleThemePacks({
    schema: "toonstudio.bg3d-bundle-theme-packs.v1", version: 1, inServiceOnly: true, downloadable: false,
    rights: { holder: "합성 테스트", inServiceOnly: true, downloadable: false }, assetRoot: "/assets/studio/bundle-v2/", themes: [],
    packs: [{ catalogIds: [options.owner ?? OWNER], title: "합성 팩", creator: "테스트", theme: null, category: "prop", ingestPackIds: ["unit-pack"],
      placeable: ids.length, twinCovered: 0, deferred: { fbx: 0, gltf: 0, blend: 0, overBudget: {} },
      rights: options.rights === undefined ? RIGHTS : options.rights, note: null }],
    assets: ids.map((id, index) => ({ id, pack: 0, path: options.path ?? `unit-pack/model-${index}.glb`,
      bytes: options.bytes ?? GLB.byteLength, sha256: (options.sha ?? HASH).slice(7), tris: 0 })),
    presets: [], crowdPacks: [], pendingPacks: [], totals: { packs: 1, placeableAssets: ids.length, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 },
  });
}
function metrics(): StudioBg3dGlbMetrics {
  return {
    byteSize: GLB.byteLength, jsonByteSize: GLB.byteLength - 20, binByteSize: 0, nodes: 0, meshes: 0, meshPrimitives: 0,
    drawCalls: 0, triangles: 0, materials: 0, textures: 0, images: 0, imageBytes: 0, estimatedDecodedImageBytes: 0,
    maxImageDimension: 0, undeterminedImageDimensions: 0, lights: 0, animations: 0, animationChannels: 0,
    animationKeyframes: 0, animationValues: 0, skins: 0, joints: 0, morphTargets: 0, accessorElements: 0, estimatedDecodedGeometryBytes: 0,
  };
}
function record(overrides: Partial<Bg3dVerifiedStoredRecord> = {}): Bg3dVerifiedStoredRecord {
  return {
    id: BUNDLE_ID, storageVersion: 2, name: "합성 모델", format: "glb", blob: new Blob([Uint8Array.from(GLB).buffer], { type: "model/gltf-binary" }),
    thumbnail: null, createdAt: 1, updatedAt: 1, contentHash: HASH, byteSize: GLB.byteLength, mime: "model/gltf-binary",
    validationVersion: 1, validatedAt: 1, validatorProfile: "mobile", validatorMetrics: metrics(),
    rights: { status: RIGHTS.status, commercialUse: true, attributionRequired: false, licenseName: RIGHTS.licenseName }, ...overrides,
  };
}
function outcome(verifiedBytes = Uint8Array.from(GLB)): StudioBg3dGlbWorkerValidationOutcome {
  return {
    execution: "worker", selectedExecutionBackend: "worker", attemptedExecutionBackends: ["worker"],
    result: { ok: true, code: "valid", message: "합성 검증", profile: "mobile", verifiedSha256: HASH, verifiedBytes,
      cumulativeBytesAfter: verifiedBytes.byteLength, usesBasisTextures: false, requiresBasisTextures: false, metrics: metrics() },
  };
}
function response(chunks: readonly Uint8Array[] = [GLB], headers: HeadersInit = {}): Response {
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    for (const chunk of chunks) controller.enqueue(Uint8Array.from(chunk));
    controller.close();
  } }), { headers });
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("아직 준비하지 않은 gate입니다."); };
  let reject: (cause: unknown) => void = () => { throw new Error("아직 준비하지 않은 gate입니다."); };
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  ports.refs.clear(); ports.refs.set(BUNDLE_ID, bundleRef); ports.refs.set(SECOND_BUNDLE_ID, { ...bundleRef, assetId: SECOND_BUNDLE_ID }); ports.refs.set(GENERATED_ID, generatedRef);
  ports.generated.splice(0, ports.generated.length, { id: GENERATED_ID, provider: "tripo", url: generatedRef.url, sha256: generatedRef.sha256,
    byteLength: GLB.byteLength, heightMeters: 1, rooms: [], offset: [0, 0] });
  ports.publication.current = catalog(); ports.publication.revision += 1;
  ports.record.mockImplementation(async id => record({ id }));
  ports.prepare.mockResolvedValue(record());
  workerPort.mockResolvedValue(outcome());
  ports.fetch.mockImplementation(async () => response());
  vi.stubGlobal("fetch", ports.fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("번들 모델의 현재 catalog와 검증 레코드 경계", () => {
  it("현재 owner·권리·SHA·bytes를 확인하고 worker record의 Blob만 전달한다", async () => {
    const verified = record();
    ports.record.mockResolvedValueOnce(verified);
    const source = await loadVirtualThreeThemeModelSource(BUNDLE_ID);
    expect(ports.record).toHaveBeenCalledExactlyOnceWith(BUNDLE_ID, undefined, "worker", ports.prepare);
    expect(source.blob).toBe(verified.blob);
    expect(source.contentHash).toBe(HASH);
    expect(source.byteLength).toBe(GLB.byteLength);
    expect(source.metrics).toEqual(verified.validatorMetrics);
    expect(source.rights).toEqual(verified.rights);
    expect(() => source.assertCurrent()).not.toThrow();
    expect(ports.fetch).not.toHaveBeenCalled();
  });

  it.each(["owner", "no-rights", "commercial", "sha", "bytes"])("현재 catalog의 %s 불일치면 record를 준비하지 않는다", async mismatch => {
    if (mismatch === "owner") ports.publication.current = catalog({ owner: "cbv1-999-other" });
    if (mismatch === "no-rights") ports.publication.current = catalog({ rights: null });
    if (mismatch === "commercial") ports.publication.current = catalog({ rights: { ...RIGHTS, commercialUse: false } });
    if (mismatch === "sha") ports.publication.current = catalog({ sha: `sha256:${"a".repeat(64)}` });
    if (mismatch === "bytes") ports.publication.current = catalog({ bytes: GLB.byteLength + 4 });
    await expect(loadVirtualThreeThemeModelSource(BUNDLE_ID)).rejects.toThrow("카탈로그");
    expect(ports.record).not.toHaveBeenCalled();
  });

  it.each(["hash", "size", "blob-size", "rights"])("검증 record의 %s가 참조와 다르면 renderer에 주지 않는다", async mismatch => {
    let verified = record();
    if (mismatch === "hash") verified = record({ contentHash: `sha256:${"b".repeat(64)}` });
    if (mismatch === "size") verified = record({ byteSize: GLB.byteLength + 1 });
    if (mismatch === "blob-size") verified = record({ blob: new Blob([Uint8Array.of(1)], { type: "model/gltf-binary" }) });
    if (mismatch === "rights") verified = record({ rights: { ...verified.rights, licenseName: "다른 권리" } });
    ports.record.mockResolvedValueOnce(verified);
    await expect(loadVirtualThreeThemeModelSource(BUNDLE_ID)).rejects.toThrow("검증된 바이트");
  });

  it("record 준비 중의 정상 same-value 재조회와 여러 모델의 순차 준비를 허용한다", async () => {
    ports.record.mockImplementation(async id => {
      ports.publication.current = catalog();
      return record({ id });
    });
    const first = await loadVirtualThreeThemeModelSource(BUNDLE_ID);
    const second = await loadVirtualThreeThemeModelSource(SECOND_BUNDLE_ID);
    expect(() => first.assertCurrent()).not.toThrow();
    expect(() => second.assertCurrent()).not.toThrow();
  });

  it("구매 팩의 필수 출처를 보존하고 record에서 누락되거나 바뀌면 거부한다", async () => {
    const rights: StudioBg3dBundlePackRights = {
      ...RIGHTS, status: "licensed", attributionRequired: true, attribution: "Test Pack by Tester",
    };
    ports.publication.current = catalog({ rights });
    const verified = record({ rights: {
      status: rights.status, commercialUse: true, licenseName: rights.licenseName,
      attributionRequired: true, attribution: rights.attribution,
    } });
    ports.record.mockResolvedValueOnce(verified);
    const source = await loadVirtualThreeThemeModelSource(BUNDLE_ID);
    if (source.rights === null) throw new Error("구매 팩의 출처·권리 정보가 없습니다.");
    expect(source.rights.attribution).toBe(rights.attribution);
    for (const attribution of [undefined, "Other Creator"]) {
      ports.record.mockResolvedValueOnce(record({ rights: { ...verified.rights, attribution } }));
      await expect(loadVirtualThreeThemeModelSource(BUNDLE_ID)).rejects.toThrow("검증된 바이트");
    }
    ports.publication.current = catalog({ rights: { ...rights, attribution: "Updated Creator" } });
    expect(() => source.assertCurrent()).toThrow("출처 또는 권리");
  });

  it("반환 뒤 A→B→내용이 같은 새 A 발행을 최종 assertCurrent에서 거부한다", async () => {
    const source = await loadVirtualThreeThemeModelSource(BUNDLE_ID);
    ports.publication.current = catalog({ rights: { ...RIGHTS, commercialUse: false } }); ports.publication.revision += 1;
    expect(() => source.assertCurrent()).toThrow("출처 또는 권리");
    ports.publication.current = catalog(); ports.publication.revision += 1;
    expect(() => source.assertCurrent()).toThrow("출처 또는 권리");
  });
});

describe("기존 생성 모델의 출처·전송·Worker 경계", () => {
  it("기존 provenance와 정확한 SHA/bytes로 Worker를 호출하고 validator 소유 snapshot만 반환한다", async () => {
    const verified = Uint8Array.from(GLB);
    workerPort.mockImplementationOnce(async bytes => {
      const originalInput = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      originalInput.fill(0xff);
      return outcome(verified);
    });
    const signal = new AbortController().signal;
    const source = await loadVirtualThreeThemeModelSource(GENERATED_ID, signal);
    verified.fill(0xee);
    expect(new Uint8Array(await source.blob.arrayBuffer())).toEqual(GLB);
    expect(source.rights).toBeNull();
    expect(source.contentHash).toBe(HASH);
    expect(ports.fetch).toHaveBeenCalledWith(generatedRef.url, { credentials: "same-origin", redirect: "error", signal });
    const validation = workerPort.mock.calls[0];
    expect(validation?.[1]).toMatchObject({ declared: { byteSize: GLB.byteLength, sha256: generatedRef.sha256, mimeType: "model/gltf-binary" }, profile: "mobile" });
    expect(validation?.[1].budgets).toBe(DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES);
    expect(validation?.[1].supportedRequiredExtensions).toBe(STUDIO_BG3D_CANONICAL_REQUIRED_GLTF_EXTENSIONS);
    expect(validation?.[2]).toEqual({ executionBackend: "worker", signal });
  });

  it.each(["id", "provenance", "url", "sha", "bytes"])("기존 metadata의 %s와 다른 참조는 fetch 전에 거부한다", async mismatch => {
    let ref = generatedRef;
    if (mismatch === "id") ref = { ...ref, id: "tripo-other-id" };
    if (mismatch === "provenance") ref = { ...ref, provenanceId: "tripo-missing-source" };
    if (mismatch === "url") ref = { ...ref, url: "/models/tripo3d-mcp/other.glb" };
    if (mismatch === "sha") ref = { ...ref, sha256: "a".repeat(64) };
    if (mismatch === "bytes") ref = { ...ref, byteLength: ref.byteLength + 4 };
    ports.refs.set(GENERATED_ID, ref);
    await expect(loadVirtualThreeThemeModelSource(GENERATED_ID)).rejects.toThrow("기존 출처 metadata");
    expect(ports.fetch).not.toHaveBeenCalled();
  });

  it.each(["oversized", "truncated", "no-body", "wrong-length", "bad-length", "http"])("%s 응답은 Worker 전에 거부한다", async mismatch => {
    if (mismatch === "oversized") ports.fetch.mockResolvedValueOnce(response([GLB, Uint8Array.of(1)]));
    if (mismatch === "truncated") ports.fetch.mockResolvedValueOnce(response([GLB.subarray(0, GLB.byteLength - 1)]));
    if (mismatch === "no-body") ports.fetch.mockResolvedValueOnce(new Response(null));
    if (mismatch === "wrong-length") ports.fetch.mockResolvedValueOnce(response([GLB], { "content-length": String(GLB.byteLength + 1) }));
    if (mismatch === "bad-length") ports.fetch.mockResolvedValueOnce(response([GLB], { "content-length": "-1" }));
    if (mismatch === "http") ports.fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(loadVirtualThreeThemeModelSource(GENERATED_ID)).rejects.toThrow();
    expect(workerPort).not.toHaveBeenCalled();
  });

  it("압축 Content-Length 대신 해제된 실제 스트림의 정확한 길이를 검증한다", async () => {
    ports.fetch.mockResolvedValueOnce(response([GLB], { "content-encoding": "gzip", "content-length": "1" }));
    const source = await loadVirtualThreeThemeModelSource(GENERATED_ID);
    expect(source.byteLength).toBe(GLB.byteLength);
    expect(workerPort).toHaveBeenCalledTimes(1);
  });

  it("Worker의 hash 실패를 main-thread 검증이나 상업 이용 허가로 대체하지 않는다", async () => {
    workerPort.mockResolvedValueOnce({ execution: "worker", selectedExecutionBackend: "worker", attemptedExecutionBackends: ["worker"], result: { ok: false, code: "hash-mismatch" } });
    await expect(loadVirtualThreeThemeModelSource(GENERATED_ID)).rejects.toThrow("hash-mismatch");
    expect(workerPort).toHaveBeenCalledTimes(1);
  });

  it("추가 decode 대기 뒤 호출할 assertCurrent도 기존 생성 provenance 변경을 거부한다", async () => {
    const source = await loadVirtualThreeThemeModelSource(GENERATED_ID);
    const original = ports.generated[0];
    if (!original) throw new Error("생성 fixture가 없습니다.");
    ports.generated.splice(0, 1, { ...original, url: "/models/tripo3d-mcp/changed.glb" });
    expect(() => source.assertCurrent()).toThrow("기존 출처 metadata");
  });

  it("한 generated caller의 취소가 다른 독립 fetch 요청을 취소하지 않는다", async () => {
    const a = new AbortController(); const b = new AbortController();
    const bothStarted = deferred<void>(); const survivorBody = deferred<Response>();
    ports.fetch.mockImplementation((_url, init) => {
      if (ports.fetch.mock.calls.length === 2) bothStarted.resolve(undefined);
      if (init?.signal === a.signal) return new Promise<Response>((_resolve, reject) => {
        a.signal.addEventListener("abort", () => reject(new DOMException("취소", "AbortError")), { once: true });
      });
      return survivorBody.promise;
    });
    const first = loadVirtualThreeThemeModelSource(GENERATED_ID, a.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = loadVirtualThreeThemeModelSource(GENERATED_ID, b.signal);
    await bothStarted.promise;
    const workerClient = await import("../../../bg3d/studio-bg3d-glb-validation-worker-client");
    expect(workerClient.validateStudioBg3dGlbOffMainThread).toBe(workerPort);
    expect(workerPort).not.toHaveBeenCalled();
    a.abort(); await rejected;
    expect(b.signal.aborted).toBe(false);
    survivorBody.resolve(response());
    expect((await second).contentHash).toBe(HASH);
    expect(ports.fetch).toHaveBeenCalledTimes(2);
    expect(workerPort).toHaveBeenCalledTimes(1);
    expect(workerPort.mock.calls[0]?.[2]).toEqual({ executionBackend: "worker", signal: b.signal });
  });
});

describe("소스 어댑터 입구", () => {
  it("미등록 URL·새 Tripo 후보와 pre-aborted caller는 어떤 I/O도 시작하지 않는다", async () => {
    await expect(loadVirtualThreeThemeModelSource("/assets/3d/tripo/batch11/toonstudio_cafe_counter.glb")).rejects.toThrow("등록되지 않은");
    const controller = new AbortController(); controller.abort();
    await expect(loadVirtualThreeThemeModelSource(BUNDLE_ID, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(ports.record).not.toHaveBeenCalled(); expect(ports.fetch).not.toHaveBeenCalled(); expect(workerPort).not.toHaveBeenCalled();
  });
});
