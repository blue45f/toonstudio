import { afterEach, describe, expect, it, vi } from "vitest";

import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";
import { openStudioLocalDatabase, type StudioLocalDatabase } from "../studio-local-database";
import { createStudioOpfsAssetStore } from "../studio-opfs-asset-store";
import { createStudioOpfsMemoryFileSystem } from "../studio-opfs-filesystem";
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { deleteStoredBg3dModelV12, getStoredBg3dModelV12, importVerifiedBg3dModelsAtomicallyWithDispositionV12,
  parseV12ModelManifest,
} from "./bg3d-model-library";
import type { Bg3dModelImportIngress, Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import { fingerprintStudioBg3dModelSourceRestriction, readStudioBg3dEffectiveModelSourceRestriction } from "./studio-bg3d-model-source-restriction";
import { resetStudioBg3dBundleThemePacksCache } from "./studio-bg3d-bundle-theme-packs";
import { createStudioBg3dLibrariesAuthority, STUDIO_BG3D_LIBRARIES_SQLITE_NAMESPACE, STUDIO_BG3D_LIBRARY_MANIFEST_KEYS,
  type StudioBg3dLibrariesAuthority, type StudioBg3dLibrariesRunExclusive } from "./studio-bg3d-libraries-sqlite-opfs-authority";
import { acquireStudioBg3dModelReadLeaseV12, type StudioBg3dModelReadLeaseResult,
  type StudioBg3dModelReadLeaseRecordIdentity } from "./studio-bg3d-model-read-lease";
import { combineStudioBg3dAbortSignals } from "./studio-bg3d-modal-operation-coordinator";
import { convertStudioBg3dPrimitiveToEditableMesh } from "./studio-bg3d-primitive-edit-mesh";

const databases: StudioLocalDatabase[] = [];
function deferred() {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}
function lease(result: StudioBg3dModelReadLeaseResult) {
  if (!result.ok) throw Error(`${result.code}: ${result.messageKo}`); return result.lease;
}
function boxFile(id: string): File {
  const source = convertStudioBg3dPrimitiveToEditableMesh({ id, kind: "box" });
  if (!source.ok) throw Error(source.detail);
  const result = exportStudioHybridDccMeshGlb({ assetId: id, sourceRevision: 1,
    sourceHash: hashStudioEditableMesh(source.value.mesh), mesh: source.value.mesh });
  if (!result.ok) throw Error("실제 box GLB가 필요합니다.");
  return new File([result.bytes], `${id}.glb`, { type: "model/gltf-binary" });
}
async function fixture(restrictedSource = false) {
  const database = await openStudioLocalDatabase({ vfs: "memory", memoryFilename: `read-lease-${crypto.randomUUID()}.sqlite3` });
  databases.push(database);
  const assets = createStudioOpfsAssetStore({ fs: createStudioOpfsMemoryFileSystem(), now: () => 1_000 });
  let tail: Promise<unknown> = Promise.resolve(), active = 0, queued = 0;
  const exclusive: StudioBg3dLibrariesRunExclusive = <T>(task: () => Promise<T>) => {
    queued += 1;
    const result = tail.then(async () => { active += 1; try { return await task(); } finally { active -= 1; } });
    tail = result.then(() => undefined, () => undefined); return result;
  };
  const createAuthority = () => createStudioBg3dLibrariesAuthority({ acquireDatabase: async () => database,
    acquireAssetStore: async () => assets, runExclusive: exclusive, now: () => 1_000, allowNonDurableAssetStoreForTests: true });
  // 별도 authority 두 개가 동일 browser WebLock을 공유하는 교차 탭 경계를 재현한다.
  const authority = createAuthority(), otherTab = createAuthority();
  const sourceFile = boxFile("source-box");
  let sourceIngress: Bg3dModelImportIngress | undefined;
  if (restrictedSource) {
    const digest = await crypto.subtle.digest("SHA-256", await sourceFile.arrayBuffer());
    const sha256: `sha256:${string}` = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    sourceIngress = { kind: "archive", sourceRestriction: { version: 1, modelFileExport: "service-only",
      origin: { kind: "bundle-pack", recordId: "verified-catalog-source", sha256 }, parent: null } };
  }
  const receipt = await importVerifiedBg3dModelsAtomicallyWithDispositionV12([
    { file: sourceFile, rights: { status: "licensed", commercialUse: true,
      attributionRequired: true, attribution: "원제작자", licenseName: "시험 사용권" }, ...(sourceIngress ? { ingress: sourceIngress } : {}) },
    { file: boxFile("edited-box"), rights: { status: "licensed", commercialUse: true,
      attributionRequired: true, attribution: "원제작자", licenseName: "시험 사용권" } },
  ], { authority, executionBackend: "direct", now: 1_000 });
  const a = receipt.records[0], b = receipt.records[1];
  if (!a || !b) throw Error("실제 V12 원본·파생본이 필요합니다.");
  const signals = [new AbortController(), new AbortController()];
  const options = { authority, signals: signals.map(({ signal }) => signal) };
  return { database, assets, authority, otherTab, a, b, options, signals,
    active: () => active, queued: () => queued, receipt };
}
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); resetStudioBg3dBundleThemePacksCache(); await Promise.all(databases.splice(0).map((database) => database.close())); });

describe("모델 원본·파생본의 V12 읽기 잠금", () => {
  it("실제 SQLite/OPFS에서 제한 원본→B→C를 저장·재열기하고 같은 제한의 lease를 유지한다", async () => {
    resetStudioBg3dBundleThemePacksCache();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      schema: "toonstudio.bg3d-bundle-theme-packs.v1", version: 1, inServiceOnly: true, downloadable: false,
      rights: { inServiceOnly: true, downloadable: false }, themes: [], packs: [], assets: [],
    }))));
    const f = await fixture(true);
    const derive = async (parent: Bg3dVerifiedStoredRecord, name: string) => {
      const imported = await importVerifiedBg3dModelsAtomicallyWithDispositionV12([{ file: boxFile(name), rights: parent.rights,
        sourceReceipt: { sourceRecordId: parent.id, sourceContentHash: parent.contentHash,
          sourceRestrictionFingerprint: fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(parent)) } }],
      { authority: f.authority, executionBackend: "direct", now: 1_000 });
      const result = imported.records[0]; if (!result) throw Error("실제 저장 파생 record 필요"); return result;
    };
    const b = await derive(f.a, "derived-B"), c = await derive(b, "derived-C");
    const reopened = await getStoredBg3dModelV12(c.id, { authority: f.otherTab, executionBackend: "direct" });
    expect(reopened?.sourceRestriction).toEqual(c.sourceRestriction);
    expect(c.sourceRestriction?.modelFileExport).toBe("service-only");
    expect(c.sourceRestriction?.origin).toEqual(f.a.sourceRestriction?.origin);
    expect(b.sourceRestriction?.parent).toEqual({ recordId: f.a.id, sha256: f.a.contentHash });
    expect(c.sourceRestriction?.parent).toEqual({ recordId: b.id, sha256: b.contentHash });
    expect(c.contentHash).not.toBe(f.a.contentHash);
    const held = lease(await acquireStudioBg3dModelReadLeaseV12([f.a, c], f.options));
    try { expect(held.isCurrent()).toBe(true); } finally { await held.release(); }
    expect(f.active()).toBe(0);
  });

  it("실제 public import의 두 record·CAS를 읽고 manifest/owner/cleanup은 전혀 쓰지 않는다", async () => {
    const f = await fixture(), raw = await f.authority.readManifest("models");
    const write = vi.spyOn(f.database, "kvSet"), put = vi.spyOn(f.assets, "put"), owners = vi.spyOn(f.assets, "setOwnerRefs"), sweep = vi.spyOn(f.assets, "sweep");
    const held = lease(await acquireStudioBg3dModelReadLeaseV12([f.a, f.b], f.options));
    expect(held.isCurrent()).toBe(true); expect(f.active()).toBe(1);
    expect(await f.authority.readManifest("models")).toBe(raw);
    const first = held.release(); expect(held.isCurrent()).toBe(false);
    await Promise.all([first, held.release()]);
    expect(f.active()).toBe(0); expect(await f.authority.readManifest("models")).toBe(raw);
    for (const call of [write, put, owners, sweep]) expect(call).not.toHaveBeenCalled();
  });

  it("동일 WebLock의 다른 탭 public delete는 동기 장면 actor 1회와 release가 끝날 때까지 대기한다", async () => {
    const f = await fixture(), held = lease(await acquireStudioBg3dModelReadLeaseV12([f.a, f.b], f.options));
    let deleted = false; const queuedBefore = f.queued();
    const deleting = deleteStoredBg3dModelV12(f.a.id, { authority: f.otherTab, now: 1_001 }).then(() => { deleted = true; });
    await vi.waitFor(() => expect(f.queued()).toBeGreaterThan(queuedBefore));
    expect(deleted).toBe(false);
    const actor = vi.fn(); if (held.isCurrent()) actor();
    expect(actor).toHaveBeenCalledOnce(); expect(deleted).toBe(false);
    await held.release(); await deleting;
    expect(await getStoredBg3dModelV12(f.a.id, { authority: f.authority })).toBe(null);
    expect(await getStoredBg3dModelV12(f.b.id, { authority: f.authority })).not.toBe(null);
    expect(held.isCurrent()).toBe(false);
  });

  it.each(["source", "derived"])("snapshot 직전 %s 삭제는 원본 복사·재시도·history 없이 거부한다", async (kind) => {
    const f = await fixture(), missing = kind === "source" ? f.a : f.b;
    await deleteStoredBg3dModelV12(missing.id, { authority: f.otherTab, now: 1_001 });
    const actor = vi.fn(), result = await acquireStudioBg3dModelReadLeaseV12([f.a, f.b], f.options);
    if (result.ok && result.lease.isCurrent()) { actor(); await result.lease.release(); }
    expect(result).toMatchObject({ ok: false, code: "record-changed" });
    expect(actor).not.toHaveBeenCalled(); expect(f.active()).toBe(0);
  });

  it.each(["rights", "hash", "bytes", "mime"])("현재 %s가 원본 identity와 다르면 권리를 승격하거나 다른 바이트를 받지 않는다", async (field) => {
    const f = await fixture();
    let changed: StudioBg3dModelReadLeaseRecordIdentity = f.a;
    if (field === "rights") changed = { ...f.a, rights: { ...f.a.rights, status: "owned" } };
    if (field === "hash") changed = { ...f.a, contentHash: `sha256:${"0".repeat(64)}` };
    if (field === "bytes") changed = { ...f.a, byteSize: f.a.byteSize + 4 };
    if (field === "mime") changed = { ...f.a, mime: "application/octet-stream" };
    const result = await acquireStudioBg3dModelReadLeaseV12([changed, f.b], f.options);
    expect(result).toMatchObject({ ok: false, code: field === "mime" ? "invalid-record" : "record-changed" });
    expect(f.active()).toBe(0);
  });

  it("authority가 같은 크기의 잘못된 CAS 바이트를 돌려줘도 실제 SHA로 거부한다", async () => {
    const f = await fixture(), original = f.assets.get.bind(f.assets);
    vi.spyOn(f.assets, "get").mockImplementation(async (...args) => {
      const bytes = await original(...args); if (bytes) bytes[0] ^= 1; return bytes;
    });
    expect(await acquireStudioBg3dModelReadLeaseV12([f.a, f.b], f.options)).toMatchObject({ ok: false, code: "record-changed" });
    expect(f.active()).toBe(0);
  });

  it("actual SQLite 원본의 출처 제한만 달라져도 두 record의 장면 반영 lease를 발행하지 않는다", async () => {
    const f = await fixture(), originalBytes = await f.a.blob.arrayBuffer();
    const current = parseV12ModelManifest(await f.authority.readManifest("models"));
    const changed = { ...current, revision: current.revision + 1, updatedAt: 1_001,
      records: current.records.map((record) => record.id === f.a.id ? { ...record,
        sourceRestriction: { ...readStudioBg3dEffectiveModelSourceRestriction(record), modelFileExport: "service-only" } } : record) };
    const raw = JSON.stringify(changed); parseV12ModelManifest(raw);
    await f.database.kvSet(STUDIO_BG3D_LIBRARIES_SQLITE_NAMESPACE, STUDIO_BG3D_LIBRARY_MANIFEST_KEYS.models, raw);
    const actor = vi.fn(), result = await acquireStudioBg3dModelReadLeaseV12([f.a, f.b], f.options);
    if (result.ok) { if (result.lease.isCurrent()) actor(); await result.lease.release(); }
    expect(result).toMatchObject({ ok: false, code: "record-changed" }); expect(actor).not.toHaveBeenCalled();
    expect(f.active()).toBe(0); expect(await f.authority.readManifest("models")).toBe(raw);
    expect(await f.a.blob.arrayBuffer()).toEqual(originalBytes);
  });

  it.each([0, 1])("원래 signal %s의 취소·lease timeout은 combined wrapper dispose 뒤에도 자동 해제한다", async (index) => {
    const f = await fixture(), combined = combineStudioBg3dAbortSignals(f.options.signals);
    const held = lease(await acquireStudioBg3dModelReadLeaseV12([f.a, f.b], f.options));
    combined.dispose();
    const controller = f.signals[index]; if (!controller) throw Error("원래 signal 필요");
    controller.abort(new DOMException("operation timeout", "TimeoutError"));
    expect(held.isCurrent()).toBe(false);
    await held.release();
    await deleteStoredBg3dModelV12(f.b.id, { authority: f.otherTab, now: 1_001 });
    expect(await getStoredBg3dModelV12(f.b.id, { authority: f.authority })).toBe(null);
    expect(f.active()).toBe(0);
  });

  it("검증 중 취소도 caller를 깨우고 물리 CAS 읽기가 끝나면 쓰기 잠금을 남기지 않는다", async () => {
    const f = await fixture(), gate = deferred(), entered = deferred(), original = f.assets.get.bind(f.assets);
    vi.spyOn(f.assets, "get").mockImplementation(async (...args) => { entered.release(); await gate.promise; return original(...args); });
    const acquiring = acquireStudioBg3dModelReadLeaseV12([f.a, f.b], f.options);
    await entered.promise; f.signals[0]?.abort();
    expect(await acquiring).toMatchObject({ ok: false, code: "aborted" });
    gate.release();
    await deleteStoredBg3dModelV12(f.a.id, { authority: f.otherTab, now: 1_001 });
    expect(f.active()).toBe(0);
  });

  it("구형 authority·Web Locks 부재·이미 취소된 요청·중복 ID는 비원자 fallback 없이 거부한다", async () => {
    const f = await fixture();
    const legacy: StudioBg3dLibrariesAuthority = { readManifest: f.authority.readManifest, readBlob: f.authority.readBlob, mutate: f.authority.mutate };
    expect(await acquireStudioBg3dModelReadLeaseV12([f.a], { ...f.options, authority: legacy }))
      .toMatchObject({ ok: false, code: "unsupported-authority" });
    const noLocks = createStudioBg3dLibrariesAuthority({ runExclusive: null });
    expect(await acquireStudioBg3dModelReadLeaseV12([f.a], { ...f.options, authority: noLocks }))
      .toMatchObject({ ok: false, code: "read-failed" });
    f.signals[0]?.abort();
    expect(await acquireStudioBg3dModelReadLeaseV12([f.a], f.options)).toMatchObject({ ok: false, code: "aborted" });
    expect(await acquireStudioBg3dModelReadLeaseV12([f.a, f.a], f.options)).toMatchObject({ ok: false, code: "invalid-record" });
    await vi.waitFor(() => expect(f.active()).toBe(0));
  });

  it("strict manifest 오류를 성공으로 바꾸지 않으며 readonly callback에 쓰기 port를 주지 않는다", async () => {
    const f = await fixture(), read = f.authority.withReadSnapshot;
    if (!read) throw Error("새 snapshot capability 필요");
    await read.call(f.authority, "models", async (context) => { expect(Object.keys(context).sort()).toEqual(["currentRaw", "getBlob"]); });
    await f.database.kvSet(STUDIO_BG3D_LIBRARIES_SQLITE_NAMESPACE, STUDIO_BG3D_LIBRARY_MANIFEST_KEYS.models, "{}");
    expect(await acquireStudioBg3dModelReadLeaseV12([f.a, f.b], f.options)).toMatchObject({ ok: false, code: "read-failed" });
    expect(f.active()).toBe(0);
  });
});
