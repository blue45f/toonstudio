import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioBg3dModelAttachment, parseV12ModelManifest, readStudioBg3dModelSourceSnapshotV12 } from "./bg3d-model-library";
import { resetStudioBg3dBundleThemePacksCache } from "./studio-bg3d-bundle-theme-packs";
import { bindConsumerReleaseFixture, consumerReleaseFixture } from "./studio-bg3d-bundle-release-consumer.test-fixture";
import { readStudioBg3dEffectiveModelSourceRestriction } from "./studio-bg3d-model-source-restriction";
import { studioBg3dModelCacheKey } from "./studio-bg3d-model-material-variant";
import { createStudioBg3dSceneGlbArtifact } from "./studio-bg3d-scene-glb-artifact";
import { exportStudioBg3dCurrentSceneGlb } from "./studio-bg3d-scene-glb-command";
import { assertStudioBg3dSceneGlbExportProvenanceCurrent, assertStudioBg3dSceneGlbExportProvenanceSource,
  prepareStudioBg3dSceneGlbExportProvenance } from "./studio-bg3d-scene-glb-export-provenance";
import { assertStudioBg3dSceneGlbSourceCurrent, captureStudioBg3dSceneGlbSource, StudioBg3dSceneGlbError } from "./studio-bg3d-scene-glb-source";
import { createSceneGlbFixture, deferredSceneGlb, disposeSceneGlbFixtures, emptySceneGlbFixtureBundleCatalog } from "./studio-bg3d-scene-glb.test-fixture";

import type { StudioBg3dModelSourceRestrictionV1 } from "./studio-bg3d-model-source-restriction";
import type { StudioBg3dSceneGlbDownloadDependencies } from "./studio-bg3d-scene-glb-command";
import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";

type Fixture = Awaited<ReturnType<typeof createSceneGlbFixture>>;
const signal = () => new AbortController().signal;
const catalogFetch = vi.fn<typeof fetch>();
beforeEach(() => {
  resetStudioBg3dBundleThemePacksCache();
  bindConsumerReleaseFixture(emptySceneGlbFixtureBundleCatalog);
  catalogFetch.mockReset().mockImplementation(async () => consumerReleaseFixture(emptySceneGlbFixtureBundleCatalog()).catalogResponse());
  vi.stubGlobal("fetch", catalogFetch);
});
afterEach(() => { disposeSceneGlbFixtures(); resetStudioBg3dBundleThemePacksCache(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function localPolicy(f: Fixture, modelFileExport: StudioBg3dModelSourceRestrictionV1["modelFileExport"]) {
  if (!f.record || !f.entry) throw Error("실제 로컬 모델 필요");
  const record = { ...f.record, sourceRestriction: { ...readStudioBg3dEffectiveModelSourceRestriction(f.record), modelFileExport } };
  f.setStoredRecord(record); f.cache.set(studioBg3dModelCacheKey(record.id, f.backend), { ...f.entry, record });
  return record;
}
function noReads(f: Fixture) {
  expect(f.authorityReads.manifest).not.toHaveBeenCalled(); expect(f.authorityReads.snapshot).not.toHaveBeenCalled();
  expect(f.authorityReads.blob).not.toHaveBeenCalled(); expect(f.mutationAttempts).not.toHaveBeenCalled();
  expect(catalogFetch).not.toHaveBeenCalled();
}
function noSceneWrites(f: Fixture) {
  expect(f.mutationAttempts).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled(); expect(f.replace).not.toHaveBeenCalled();
  if (f.entry) expect(f.entry.dispose).not.toHaveBeenCalled();
}
function downloadPorts(f: Fixture) {
  return {
    prepare: vi.fn<typeof createStudioBg3dSceneGlbArtifact>(createStudioBg3dSceneGlbArtifact),
    createObjectUrl: vi.fn<StudioBg3dSceneGlbDownloadDependencies["createObjectUrl"]>(() => "blob:unexpected"),
    triggerDownload: vi.fn<StudioBg3dSceneGlbDownloadDependencies["triggerDownload"]>(),
    revokeObjectUrl: vi.fn<StudioBg3dSceneGlbDownloadDependencies["revokeObjectUrl"]>(),
    scheduleRevoke: vi.fn<StudioBg3dSceneGlbDownloadDependencies["scheduleRevoke"]>(),
    provenanceAuthority: f.authority,
  };
}

describe("현재 표시 장면 GLB의 실제 출처 권위 연결", () => {
  it("fixture는 실제 strict V12 manifest와 같은 Blob을 readonly snapshot으로 제공한다", async () => {
    const f = await createSceneGlbFixture(); if (!f.record) throw Error("실제 record 필요");
    const original = new Uint8Array(await f.record.blob.arrayBuffer()), raw = await f.authority.readManifest("models");
    const manifest = parseV12ModelManifest(raw), row = manifest.records[0]; if (!row) throw Error("실제 strict row 필요");
    expect(row.sourceRestriction).toEqual({ version: 1, modelFileExport: "allowed",
      origin: { kind: "studio-generated", recordId: f.record.id, sha256: f.record.contentHash }, parent: null });
    expect(await f.authority.readBlob(row.blobRef)).toEqual(original);
    const snapshot = await f.authority.withReadSnapshot("models", async (context) => {
      const before = parseV12ModelManifest(context.currentRaw), first = before.records[0]; if (!first || !f.record) throw Error("snapshot row 필요");
      f.setStoredRecord({ ...f.record, name: "새 정본 이름" });
      return { revision: before.revision, bytes: await context.getBlob(first.blobRef) };
    });
    expect(snapshot.bytes).toEqual(original); expect(snapshot.revision).toBe(manifest.revision);
    expect(parseV12ModelManifest(await f.authority.readManifest("models")).revision).toBe(manifest.revision + 1);
    noSceneWrites(f);
  });

  it("명시 allowed인 자체 제작 원본은 실제 저장 읽기로 준비하고 최종 fence를 통과한다", async () => {
    const f = await createSceneGlbFixture(), active = signal(), source = captureStudioBg3dSceneGlbSource(f.host, active);
    const before = JSON.stringify(f.runtime.current.document);
    const proof = await prepareStudioBg3dSceneGlbExportProvenance(source,
      { authority: f.authority, signal: active, assertCurrent: () => assertStudioBg3dSceneGlbSourceCurrent(f.host, source, active) });
    expect(proof.assetCount).toBe(1); expect(Object.isFrozen(proof)).toBe(true);
    expect(() => assertStudioBg3dSceneGlbExportProvenanceSource(proof, source)).not.toThrow();
    await expect(assertStudioBg3dSceneGlbExportProvenanceCurrent(proof, source)).resolves.toBeUndefined();
    expect(f.authorityReads.blob).toHaveBeenCalled(); expect(JSON.stringify(f.runtime.current.document)).toBe(before); noSceneWrites(f);
  });

  it.each(["service-only", "unknown"])("표시 로컬 모델의 %s 제한은 도형이 함께 있어도 전체 준비를 거부한다", async (policy) => {
    const f = await createSceneGlbFixture(); localPolicy(f, policy === "service-only" ? "service-only" : "unknown");
    const source = captureStudioBg3dSceneGlbSource(f.host, signal());
    expect(source.document.nodes).toHaveLength(2); expect(source.assets.size).toBe(1);
    await expect(prepareStudioBg3dSceneGlbExportProvenance(source, { authority: f.authority }))
      .rejects.toMatchObject({ code: policy === "service-only" ? "rights-restricted" : "rights-unavailable" });
    noSceneWrites(f);
  });

  it.each(["parent", "tag"])("%s로 숨긴 제한 모델은 표시 source에서 제외하며 저장 권위를 조회하지 않는다", async (hiddenBy) => {
    const f = await createSceneGlbFixture(); localPolicy(f, "service-only");
    const model = f.models[0]; if (!model) throw Error("실제 모델 필요");
    if (hiddenBy === "parent") {
      const parent = { ...f.primitive, id: "hidden-parent", locked: false, visible: false };
      model.parentId = parent.id; f.runtime.current = { ...f.runtime.current, primitives: [...f.runtime.current.primitives, parent] };
    } else {
      const customModels = f.runtime.current.customModels.map((candidate) => candidate.id === model.id ? { ...candidate, tags: ["비공개"] } : candidate);
      f.runtime.current = { ...f.runtime.current, customModels,
        document: { ...f.runtime.current.document, meta: { hiddenTags: ["비공개"] } } };
    }
    f.refresh(); const source = captureStudioBg3dSceneGlbSource(f.host, signal());
    expect(source.assets.size).toBe(0);
    const proof = await prepareStudioBg3dSceneGlbExportProvenance(source, { authority: f.authority });
    expect(proof.assetCount).toBe(0); await assertStudioBg3dSceneGlbExportProvenanceCurrent(proof, source); noReads(f);
  });

  it("같은 attachment의 숨김 인스턴스가 있어도 표시 인스턴스의 제한은 우회되지 않는다", async () => {
    const f = await createSceneGlbFixture(); localPolicy(f, "service-only");
    const model = f.models[0]; if (!model) throw Error("실제 모델 필요"); model.visible = false;
    f.runtime.current = { ...f.runtime.current, customModels: [model, { ...model, id: "visible-second", visible: true }] }; f.refresh();
    const source = captureStudioBg3dSceneGlbSource(f.host, signal()); expect(source.assets.size).toBe(1);
    await expect(prepareStudioBg3dSceneGlbExportProvenance(source, { authority: f.authority })).rejects.toMatchObject({ code: "rights-restricted" });
    noSceneWrites(f);
  });

  it("동일한 licensed 표시 권리라도 sourceRestriction가 없는 레거시는 allowed로 승격하지 않는다", async () => {
    const f = await createSceneGlbFixture(); if (!f.record || !f.entry) throw Error("실제 모델 필요");
    const legacy = { ...f.record }; Reflect.deleteProperty(legacy, "sourceRestriction");
    f.setStoredRecord(legacy); f.cache.set(studioBg3dModelCacheKey(legacy.id, f.backend), { ...f.entry, record: legacy });
    const source = captureStudioBg3dSceneGlbSource(f.host, signal());
    expect(legacy.rights.status).toBe("licensed"); expect(legacy.rights.commercialUse).toBe(true);
    await expect(prepareStudioBg3dSceneGlbExportProvenance(source, { authority: f.authority })).rejects.toMatchObject({ code: "rights-unavailable" });
    noSceneWrites(f);
  });

  it("도형만 있는 source는 authority 메서드를 하나도 호출하지 않는다", async () => {
    const f = await createSceneGlbFixture(false), source = captureStudioBg3dSceneGlbSource(f.host, signal());
    const proof = await prepareStudioBg3dSceneGlbExportProvenance(source, { authority: f.authority });
    await assertStudioBg3dSceneGlbExportProvenanceCurrent(proof, source); expect(proof.assetCount).toBe(0); noReads(f);
  });

  it("다른 source·복사한 proof DTO를 현재 장면의 영수증으로 받지 않는다", async () => {
    const f = await createSceneGlbFixture(), source = captureStudioBg3dSceneGlbSource(f.host, signal());
    const proof = await prepareStudioBg3dSceneGlbExportProvenance(source, { authority: f.authority });
    const other = captureStudioBg3dSceneGlbSource(f.host, signal());
    expect(() => assertStudioBg3dSceneGlbExportProvenanceSource(proof, other)).toThrow(StudioBg3dSceneGlbError);
    expect(() => assertStudioBg3dSceneGlbExportProvenanceSource({ ...proof }, source)).toThrow(StudioBg3dSceneGlbError);
    expect(() => assertStudioBg3dSceneGlbExportProvenanceSource(proof, { ...source })).toThrow(StudioBg3dSceneGlbError);
    await expect(assertStudioBg3dSceneGlbExportProvenanceCurrent({ ...proof }, source)).rejects.toMatchObject({ code: "rights-unavailable" });
    noSceneWrites(f);
  });

  it("준비 이후 asset map의 객체가 바뀌면 같은 record라도 이전 proof를 거부한다", async () => {
    const f = await createSceneGlbFixture(), captured = captureStudioBg3dSceneGlbSource(f.host, signal()), assets = new Map(captured.assets);
    const source = { ...captured, assets }, proof = await prepareStudioBg3dSceneGlbExportProvenance(source, { authority: f.authority });
    const first = [...assets][0]; if (!first) throw Error("실제 source asset 필요"); assets.set(first[0], { ...first[1] });
    expect(() => assertStudioBg3dSceneGlbExportProvenanceSource(proof, source)).toThrow(StudioBg3dSceneGlbError);
    await expect(assertStudioBg3dSceneGlbExportProvenanceCurrent(proof, source)).rejects.toMatchObject({ code: "rights-unavailable" }); noSceneWrites(f);
  });

  it.each(["rights", "restriction"])("준비 뒤 durable %s 변경은 최종 current fence에서 거부한다", async (change) => {
    const f = await createSceneGlbFixture(); if (!f.record) throw Error("실제 record 필요");
    const source = captureStudioBg3dSceneGlbSource(f.host, signal());
    const proof = await prepareStudioBg3dSceneGlbExportProvenance(source, { authority: f.authority });
    // source cache는 고정한다. 실제 저장 row의 권리·제한 재조회가 검출해야 한다.
    if (change === "restriction") f.setStoredRecord({ ...f.record, sourceRestriction: { ...readStudioBg3dEffectiveModelSourceRestriction(f.record), modelFileExport: "service-only" } });
    else f.setStoredRecord({ ...f.record, rights: { ...f.record.rights, commercialUse: false } });
    await expect(assertStudioBg3dSceneGlbExportProvenanceCurrent(proof, source)).rejects.toMatchObject({ code: "source-changed" }); noSceneWrites(f);
  });

  it.each(["revision", "name-timestamp"])("출력 원본·권리가 같은 %s 변경은 전체 manifest 증가만으로 거부하지 않는다", async (change) => {
    const f = await createSceneGlbFixture(); if (!f.record) throw Error("실제 record 필요");
    const source = captureStudioBg3dSceneGlbSource(f.host, signal());
    const proof = await prepareStudioBg3dSceneGlbExportProvenance(source, { authority: f.authority });
    f.setStoredRecord(change === "revision" ? f.record : { ...f.record, name: "출력 무관 표시 이름", updatedAt: 2 });
    await expect(assertStudioBg3dSceneGlbExportProvenanceCurrent(proof, source)).resolves.toBeUndefined(); noSceneWrites(f);
  });

  it("정본 metadata가 같아도 저장 CAS 바이트가 바뀌면 최종 proof를 재사용하지 않는다", async () => {
    const f = await createSceneGlbFixture(); if (!f.record) throw Error("실제 record 필요");
    const source = captureStudioBg3dSceneGlbSource(f.host, signal());
    const proof = await prepareStudioBg3dSceneGlbExportProvenance(source, { authority: f.authority });
    const bytes = new Uint8Array(await f.record.blob.arrayBuffer()), last = bytes.length - 1, value = bytes[last];
    if (value === undefined) throw Error("실제 CAS 바이트 필요"); bytes[last] = value ^ 1;
    f.setStoredRecord({ ...f.record, blob: new Blob([bytes], { type: f.record.mime }) });
    await expect(assertStudioBg3dSceneGlbExportProvenanceCurrent(proof, source)).rejects.toMatchObject({ code: "rights-unavailable" }); noSceneWrites(f);
  });

  it("취소된 표시 모델 요청은 출처 I/O를 시작하지 않는다", async () => {
    const f = await createSceneGlbFixture(), source = captureStudioBg3dSceneGlbSource(f.host, signal()), controller = new AbortController(); controller.abort();
    await expect(prepareStudioBg3dSceneGlbExportProvenance(source, { authority: f.authority, signal: controller.signal })).rejects.toMatchObject({ code: "aborted" }); noReads(f);
  });

  it("CAS 읽기 중 취소는 실제 download 명령에서도 artifact·URL·download를 시작하지 않는다", async () => {
    const f = await createSceneGlbFixture(); if (!f.record) throw Error("실제 record 필요");
    const ready = deferredSceneGlb<void>(), entered = deferredSceneGlb<void>(), original = f.record.blob.arrayBuffer.bind(f.record.blob);
    vi.spyOn(f.record.blob, "arrayBuffer").mockImplementation(async () => { entered.resolve(undefined); await ready.promise; return original(); });
    const controller = new AbortController(), deps = downloadPorts(f);
    const pending = exportStudioBg3dCurrentSceneGlb(f.host, { name: "취소", signal: controller.signal }, deps);
    await entered.promise; controller.abort(); ready.resolve(undefined);
    expect(await pending).toMatchObject({ ok: false, code: "aborted" });
    expect(deps.prepare).not.toHaveBeenCalled(); expect(deps.createObjectUrl).not.toHaveBeenCalled(); expect(deps.triggerDownload).not.toHaveBeenCalled(); noSceneWrites(f);
  });

  it("실제 authority 조회 실패는 artifact·URL·download 없이 명시적으로 실패한다", async () => {
    const f = await createSceneGlbFixture(), deps = downloadPorts(f);
    vi.spyOn(f.authority, "withReadSnapshot").mockRejectedValueOnce(Error("원본 저장소 읽기 실패"));
    const result = await exportStudioBg3dCurrentSceneGlb(f.host, { name: "권위 조회 실패", signal: signal() }, deps);
    expect(result).toMatchObject({ ok: false, code: "rights-unavailable" });
    expect(deps.prepare).not.toHaveBeenCalled(); expect(deps.createObjectUrl).not.toHaveBeenCalled(); expect(deps.triggerDownload).not.toHaveBeenCalled(); noSceneWrites(f);
  });

  it("catalog 실패와 authoritative row 부재는 cache의 allowed만으로 다운로드 허가를 만들지 않는다", async () => {
    const missing = await createSceneGlbFixture(false), f = await createSceneGlbFixture(), deps = { ...downloadPorts(f), provenanceAuthority: missing.authority };
    catalogFetch.mockResolvedValueOnce(new Response("catalog unavailable", { status: 503 }));
    const result = await exportStudioBg3dCurrentSceneGlb(f.host, { name: "출처 조회 실패", signal: signal() }, deps);
    expect(result).toMatchObject({ ok: false, code: "rights-unavailable" });
    expect(catalogFetch).toHaveBeenCalledWith(consumerReleaseFixture(emptySceneGlbFixtureBundleCatalog()).release.catalog.url,
      expect.objectContaining({ cache: "force-cache", credentials: "same-origin", redirect: "error" }));
    expect(missing.authorityReads.snapshot).toHaveBeenCalledOnce();
    expect(deps.prepare).not.toHaveBeenCalled(); expect(deps.createObjectUrl).not.toHaveBeenCalled(); expect(deps.triggerDownload).not.toHaveBeenCalled();
    noSceneWrites(f); noSceneWrites(missing);
  });

  it("strict catalog→실제 배포 loader·validator를 통과한 번들은 cache allowed와 관계없이 service-only로 거부한다", async () => {
    const f = await createSceneGlbFixture(); if (!f.record || !f.entry || !f.models[0]) throw Error("실제 GLB 모델 필요");
    const bytes = new Uint8Array(await f.record.blob.arrayBuffer()), id = `cbv1-ingest-scene-proof-${crypto.randomUUID()}`;
    const sha256 = f.record.contentHash, assetUrl = `/assets/studio/bundle-v2/${sha256.slice(7)}.glb`;
    const rights: Bg3dVerifiedStoredRecord["rights"] = { status: "licensed", commercialUse: true, attributionRequired: false, licenseName: "시험 사용권" };
    const catalog = { ...emptySceneGlbFixtureBundleCatalog(), sourceManifest: { generatedAt: "2026-10-29T00:00:00Z" },
      themes: [{ id: "city", label: "도시" }], packs: [{ catalogIds: ["cbv1-fixture"], title: "자체 제작 시험 팩", creator: "fixture",
        theme: "city", category: "environment", ingestPackIds: ["test"], placeable: 1, twinCovered: 0,
        deferred: { fbx: 0, gltf: 0, blend: 0, overBudget: {} }, rights: { serve: "allow", ...rights }, note: null }],
      assets: [{ id, pack: 0, path: "test/box.glb", bytes: bytes.byteLength, sha256: sha256.slice(7), tris: f.record.validatorMetrics.triangles }],
      totals: { packs: 1, placeableAssets: 1, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 } };
    bindConsumerReleaseFixture(() => catalog);
    const release = consumerReleaseFixture(catalog);
    catalogFetch.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === release.release.catalog.url) return release.catalogResponse();
      if (url === assetUrl) return new Response(Uint8Array.from(bytes).buffer, { headers: { "Content-Type": "model/gltf-binary" } });
      return new Response("fixture에 없는 URL", { status: 404 });
    });
    // cache의 단색·allowed DTO는 출처 권위가 아니다. 자체 제작 바이트를 catalog HTTP 입력으로만 제공한다.
    const cachedRecord = { ...f.record, id, rights };
    const attachment = createStudioBg3dModelAttachment(cachedRecord, { attachmentId: "attachment-scene-model" });
    f.cache.delete(studioBg3dModelCacheKey(f.record.id, f.backend)); f.attachments.delete(f.record.id);
    f.cache.set(studioBg3dModelCacheKey(id, f.backend), { ...f.entry, record: cachedRecord }); f.attachments.set(id, attachment); f.reverse.set(attachment.id, id);
    f.models[0].modelId = id; f.refresh();
    const snapshot = await readStudioBg3dModelSourceSnapshotV12(id, { authority: f.authority, executionBackend: "direct" });
    expect(snapshot?.sourceKind).toBe("bundle-pack"); expect(snapshot?.catalogIdentity).toBeTruthy();
    expect(snapshot?.record.sourceRestriction).toEqual({ version: 1, modelFileExport: "service-only",
      origin: { kind: "bundle-pack", recordId: id, sha256 }, parent: null });
    expect(await snapshot?.record.blob.arrayBuffer()).toEqual(await f.record.blob.arrayBuffer());
    const source = captureStudioBg3dSceneGlbSource(f.host, signal());
    await expect(prepareStudioBg3dSceneGlbExportProvenance(source, { authority: f.authority, executionBackend: "direct" }))
      .rejects.toMatchObject({ code: "rights-restricted" });
    expect(catalogFetch.mock.calls.some(([url]) => url === assetUrl)).toBe(true);
    expect(f.authorityReads.manifest).not.toHaveBeenCalled(); expect(f.authorityReads.snapshot).not.toHaveBeenCalled(); expect(f.authorityReads.blob).not.toHaveBeenCalled();
    noSceneWrites(f);
  });
});
