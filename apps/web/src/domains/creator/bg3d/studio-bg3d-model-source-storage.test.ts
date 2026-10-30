import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importVerifiedBg3dModelsAtomicallyWithDispositionV12, parseV12ModelManifest,
  prepareVerifiedBg3dModelRecord, readStudioBg3dModelSourceSnapshotV12 } from "./bg3d-model-library";
import { fingerprintStudioBg3dModelSourceRestriction, readStudioBg3dEffectiveModelSourceRestriction } from "./studio-bg3d-model-source-restriction";
import { resetStudioBg3dBundleThemePacksCache } from "./studio-bg3d-bundle-theme-packs";
import type { Bg3dModelImportIngress, Bg3dModelImportItem, Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import type { StudioBg3dModelSourceRestrictionV1 } from "./studio-bg3d-model-source-restriction";
import type { StudioBg3dLibrariesAuthority, StudioBg3dLibraryBlobReceipt } from "./studio-bg3d-libraries-sqlite-opfs-authority";

const RIGHTS = { status: "licensed", commercialUse: true, attributionRequired: false, licenseName: "시험 사용권" } satisfies Bg3dVerifiedStoredRecord["rights"];
async function digest(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const value = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return `sha256:${Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
function file(marker: string): File {
  const json = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, scenes: [{}], extras: { marker } }));
  const padded = new Uint8Array(Math.ceil(json.byteLength / 4) * 4); padded.fill(32); padded.set(json);
  const bytes = new Uint8Array(20 + padded.byteLength), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, padded.byteLength, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.set(padded, 20); return new File([bytes], `${marker}.glb`, { type: "model/gltf-binary" });
}
function memory() {
  let raw: string | null = null, beforeMutation: (() => void) | null = null, writes = 0, reads = 0;
  const cas = new Map<string, Uint8Array>();
  const readBlob = async (receipt: StudioBg3dLibraryBlobReceipt) => {
    const bytes = cas.get(receipt.hash); if (!bytes) throw Error("CAS missing"); return Uint8Array.from(bytes);
  };
  const authority: StudioBg3dLibrariesAuthority = {
    readManifest: async () => raw, readBlob,
    async withReadSnapshot(_slot, callback) { reads += 1; return callback({ currentRaw: raw, getBlob: readBlob }); },
    async mutate(_slot, _refs, operation) {
      const mutate = beforeMutation; beforeMutation = null; mutate?.();
      const result = await operation({ now: 1_000, currentRaw: raw, getBlob: readBlob,
        async putBlob(bytes, mime) { const hash = await digest(bytes); cas.set(hash, Uint8Array.from(bytes)); return { hash, bytes: bytes.byteLength, mime }; } });
      parseV12ModelManifest(result.nextRaw); raw = result.nextRaw; writes += 1; return result.result;
    },
  };
  let sequence = 0;
  const save = async (input: Bg3dModelImportItem) => {
    const result = await importVerifiedBg3dModelsAtomicallyWithDispositionV12([input], {
      authority, executionBackend: "direct", now: 1_000, idFactory: () => `stored-${++sequence}`,
    });
    const record = result.records[0]; if (!record) throw Error("record required"); return record;
  };
  return { authority, cas, save, raw: () => raw, writes: () => writes, reads: () => reads,
    setRaw(value: string) { raw = value; }, beforeMutation(callback: () => void) { beforeMutation = callback; } };
}
function receipt(record: Bg3dVerifiedStoredRecord) {
  return { sourceRecordId: record.id, sourceContentHash: record.contentHash,
    sourceRestrictionFingerprint: fingerprintStudioBg3dModelSourceRestriction(readStudioBg3dEffectiveModelSourceRestriction(record)) };
}
function restricted(recordId: string, sha256: `sha256:${string}`): StudioBg3dModelSourceRestrictionV1 {
  return { version: 1, modelFileExport: "service-only", origin: { kind: "bundle-pack", recordId, sha256 }, parent: null };
}
beforeEach(() => { resetStudioBg3dBundleThemePacksCache(); vi.stubGlobal("fetch", vi.fn(async () => new Response("catalog unavailable", { status: 503 }))); });
afterEach(() => { resetStudioBg3dBundleThemePacksCache(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("모델 V12 원본 제한의 실제 codec·import·dedup", () => {
  it("plain import는 unknown이며 GLB bytes를 바꾸지 않고 legacy 필드부재는 strict roundtrip한다", async () => {
    const f = memory(), input = file("plain"), record = await f.save({ file: input, rights: RIGHTS });
    expect(record.sourceRestriction).toEqual({ version: 1, modelFileExport: "unknown", origin: null, parent: null });
    expect(new Uint8Array(await record.blob.arrayBuffer())).toEqual(new Uint8Array(await input.arrayBuffer()));
    const parsed = parseV12ModelManifest(f.raw());
    const legacy = JSON.stringify({ ...parsed, records: parsed.records.map((row) =>
      Object.fromEntries(Object.entries(row).filter(([key]) => key !== "sourceRestriction"))) });
    expect(JSON.stringify(parseV12ModelManifest(legacy))).toBe(legacy); f.setRaw(legacy);
    const actual = await readStudioBg3dModelSourceSnapshotV12(record.id, { authority: f.authority });
    expect(actual?.record).not.toHaveProperty("sourceRestriction");
    expect(readStudioBg3dEffectiveModelSourceRestriction(actual?.record ?? {})).toEqual(record.sourceRestriction);
  });

  it.each(["user-file", "studio-generated"])("명시 %s 재업로드는 기존 최초 root ID로 dedup하고 정책은 승격하지 않는다", async (kind) => {
    const f = memory(), input = file("same-root");
    const ingress: Bg3dModelImportIngress = kind === "user-file" ? { kind: "user-file", modelFileExport: "allowed" } : { kind: "studio-generated", modelFileExport: "allowed" };
    const first = await f.save({ file: input, rights: RIGHTS, ingress });
    const again = await f.save({ file: input, rights: RIGHTS, ingress });
    expect(again.id).toBe(first.id); expect(again.sourceRestriction).toEqual(first.sourceRestriction);
    expect(again.sourceRestriction?.origin?.recordId).toBe(first.id); expect(parseV12ModelManifest(f.raw()).records).toHaveLength(1);
    const before = f.raw();
    await expect(f.save({ file: input, rights: RIGHTS, ingress: { kind: "user-file", modelFileExport: "unknown" } }))
      .rejects.toMatchObject({ code: "source-restriction-conflict" }); expect(f.raw()).toBe(before);
  });

  it("legacy unknown·서로 다른 최초 kind·직전 parent는 같은 hash라는 이유로 합치지 않는다", async () => {
    const f = memory(), input = file("old"); await f.save({ file: input, rights: RIGHTS });
    const before = f.raw();
    await expect(f.save({ file: input, rights: RIGHTS, ingress: { kind: "user-file", modelFileExport: "allowed" } }))
      .rejects.toMatchObject({ code: "source-restriction-conflict" }); expect(f.raw()).toBe(before);
    const other = memory(), root = await other.save({ file: input, rights: RIGHTS, ingress: { kind: "user-file", modelFileExport: "allowed" } });
    await expect(other.save({ file: input, rights: RIGHTS, ingress: { kind: "studio-generated", modelFileExport: "allowed" } }))
      .rejects.toMatchObject({ code: "source-restriction-conflict" });
    const derived = await other.save({ file: file("derived"), rights: RIGHTS, sourceReceipt: receipt(root) });
    await expect(other.save({ file: file("derived"), rights: RIGHTS, ingress: { kind: "user-file", modelFileExport: "allowed" } }))
      .rejects.toMatchObject({ code: "source-restriction-conflict" });
    expect(derived.sourceRestriction?.parent?.recordId).toBe(root.id);
  });

  it("archive의 allowed 자기 주장은 unknown이고 service-only→B→C는 origin SHA와 parent를 각각 보존한다", async () => {
    const f = memory(), original = file("A"), sha256 = await digest(new Uint8Array(await original.arrayBuffer()));
    const policy = restricted("catalog-original", sha256);
    const a = await f.save({ file: original, rights: RIGHTS, ingress: { kind: "archive", sourceRestriction: policy } });
    const b = await f.save({ file: file("B"), rights: RIGHTS, sourceReceipt: receipt(a) });
    const c = await f.save({ file: file("C"), rights: RIGHTS, sourceReceipt: receipt(b) });
    expect(c.contentHash).not.toBe(sha256); expect(c.sourceRestriction?.origin).toEqual(policy.origin);
    expect(b.sourceRestriction?.parent).toEqual({ recordId: a.id, sha256: a.contentHash });
    expect(c.sourceRestriction?.parent).toEqual({ recordId: b.id, sha256: b.contentHash });
    const reopened = await readStudioBg3dModelSourceSnapshotV12(c.id, { authority: f.authority });
    expect(reopened?.record.sourceRestriction).toEqual(c.sourceRestriction);
    const archivedAllowed: StudioBg3dModelSourceRestrictionV1 = { version: 1, modelFileExport: "allowed",
      origin: { kind: "user-file", recordId: "untrusted-archive", sha256 }, parent: null };
    expect((await f.save({ file: file("archive"), rights: RIGHTS, ingress: { kind: "archive", sourceRestriction: archivedAllowed } }))
      .sourceRestriction?.modelFileExport).toBe("unknown");
  });

  it("byte-identical derivative는 기존 record를 재사용하고 parent_self를 만들지 않는다", async () => {
    const f = memory(), input = file("noop"), a = await f.save({ file: input, rights: RIGHTS, ingress: { kind: "user-file", modelFileExport: "allowed" } });
    const result = await f.save({ file: input, rights: RIGHTS, sourceReceipt: receipt(a) });
    expect(result.id).toBe(a.id); expect(result.sourceRestriction).toEqual(a.sourceRestriction);
    expect(result.sourceRestriction?.parent).toBeNull(); expect(parseV12ModelManifest(f.raw()).records).toHaveLength(1);
    const derivedFile = file("noop-derived"), b = await f.save({ file: derivedFile, rights: RIGHTS, sourceReceipt: receipt(a) });
    const repeated = await f.save({ file: derivedFile, rights: RIGHTS, sourceReceipt: receipt(b) });
    expect(repeated.id).toBe(b.id); expect(repeated.sourceRestriction).toEqual(b.sourceRestriction);
    expect(repeated.sourceRestriction?.parent).toEqual({ recordId: a.id, sha256: a.contentHash });
    expect(parseV12ModelManifest(f.raw()).records).toHaveLength(2);
  });

  it("source receipt의 restriction만 저장 직전에 바뀌어도 lock 안에서 child 저장을 거부한다", async () => {
    const f = memory(), a = await f.save({ file: file("source"), rights: RIGHTS, ingress: { kind: "user-file", modelFileExport: "allowed" } });
    const beforeWrites = f.writes();
    f.beforeMutation(() => {
      const current = parseV12ModelManifest(f.raw());
      f.setRaw(JSON.stringify({ ...current, records: current.records.map((row) => ({ ...row,
        sourceRestriction: { ...readStudioBg3dEffectiveModelSourceRestriction(row), modelFileExport: "unknown" } })) }));
    });
    await expect(f.save({ file: file("child"), rights: RIGHTS, sourceReceipt: receipt(a) })).rejects.toMatchObject({ code: "source-changed" });
    expect(f.writes()).toBe(beforeWrites); expect(parseV12ModelManifest(f.raw()).records).toHaveLength(1);
  });

  it("actual CAS SHA·receipt SHA·rights를 검사하고 같은 크기의 손상 bytes를 거부한다", async () => {
    const f = memory(), a = await f.save({ file: file("CAS"), rights: RIGHTS });
    const before = f.raw();
    await expect(f.save({ file: file("wrong-sha"), rights: RIGHTS,
      sourceReceipt: { ...receipt(a), sourceContentHash: `sha256:${"0".repeat(64)}` } })).rejects.toMatchObject({ code: "source-changed" });
    await expect(f.save({ file: file("wrong-policy"), rights: RIGHTS,
      sourceReceipt: { ...receipt(a), sourceRestrictionFingerprint: "{}" } })).rejects.toMatchObject({ code: "source-changed" });
    expect(f.raw()).toBe(before);
    await expect(f.save({ file: file("wrong-rights"), rights: { ...RIGHTS, licenseName: "다른 사용권" }, sourceReceipt: receipt(a) }))
      .rejects.toMatchObject({ code: "rights-conflict" });
    const bytes = f.cas.get(a.contentHash); if (!bytes) throw Error("CAS required");
    const corrupt = Uint8Array.from(bytes), first = corrupt[0]; if (first === undefined) throw Error("CAS empty");
    corrupt[0] = first ^ 1; f.cas.set(a.contentHash, corrupt);
    await expect(readStudioBg3dModelSourceSnapshotV12(a.id, { authority: f.authority })).rejects.toMatchObject({ code: "source-changed" });
  });

  it("명시 malformed 제한·동시 ingress/receipt는 legacy로 숨기거나 bytes를 쓰지 않는다", async () => {
    const f = memory(), a = await f.save({ file: file("schema"), rights: RIGHTS }), current = parseV12ModelManifest(f.raw());
    const malformed = JSON.stringify({ ...current, records: current.records.map((row) => ({ ...row, sourceRestriction: null })) });
    expect(() => parseV12ModelManifest(malformed)).toThrow();
    const before = f.raw();
    await expect(f.save({ file: file("invalid"), rights: RIGHTS, ingress: { kind: "user-file", modelFileExport: "allowed" }, sourceReceipt: receipt(a) }))
      .rejects.toMatchObject({ code: "invalid-file" }); expect(f.raw()).toBe(before);
  });

  it("catalog 실패는 확인된 local을 막지 않지만 없는 원본을 non-bundle 허가로 바꾸지 않는다", async () => {
    const f = memory(), a = await f.save({ file: file("local"), rights: RIGHTS });
    expect((await readStudioBg3dModelSourceSnapshotV12(a.id, { authority: f.authority }))?.sourceKind).toBe("local-library");
    await expect(readStudioBg3dModelSourceSnapshotV12("missing-source", { authority: f.authority })).rejects.toMatchObject({ code: "source-unavailable" });
  });

  it("실제 strict catalog의 exact bundle은 local 저장소 없이 SHA를 확인하고 service-only를 보존한다", async () => {
    const input = file("pack"), sha256 = await digest(new Uint8Array(await input.arrayBuffer())), id = "cbv1-ingest-test-001";
    const raw = { schema: "toonstudio.bg3d-bundle-theme-packs.v1", version: 1, inServiceOnly: true, downloadable: false,
      rights: { holder: "시험 제작자", inServiceOnly: true, downloadable: false }, assetRoot: "/assets/studio/bundle-v2/",
      themes: [{ id: "city", label: "도시" }], packs: [{ catalogIds: ["cbv1-test"], title: "Test", creator: "Tester", theme: "city",
        category: "environment", ingestPackIds: ["test"], placeable: 1, twinCovered: 0, deferred: { fbx: 0, gltf: 0, blend: 0, overBudget: {} },
        rights: { serve: "allow", ...RIGHTS }, note: null }],
      assets: [{ id, pack: 0, path: "test/pack.glb", bytes: input.size, sha256: sha256.slice(7), tris: 0 }],
      presets: [], crowdPacks: [], pendingPacks: [], totals: { packs: 1, placeableAssets: 1, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 } };
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => String(url).includes("theme-packs.json")
      ? new Response(JSON.stringify(raw)) : new Response(await input.arrayBuffer(), { headers: { "content-type": "model/gltf-binary" } })));
    const loaded = await prepareVerifiedBg3dModelRecord({ file: input, rights: RIGHTS,
      ingress: { kind: "bundle-runtime", sourceRecordId: id, sourceContentHash: sha256 } }, { executionBackend: "direct", idFactory: () => id });
    expect(loaded.sourceRestriction).toEqual(restricted(id, sha256));
    const f = memory(), localRead = vi.spyOn(f.authority, "withReadSnapshot").mockRejectedValue(new Error("local unavailable"));
    const snapshot = await readStudioBg3dModelSourceSnapshotV12(id, { authority: f.authority, executionBackend: "direct" });
    expect(localRead).not.toHaveBeenCalled(); expect(snapshot?.sourceKind).toBe("bundle-pack");
    expect(snapshot?.record.sourceRestriction).toEqual(restricted(id, sha256)); expect(snapshot?.catalogIdentity).toBeTruthy();
  });
});
