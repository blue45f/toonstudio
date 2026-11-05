import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import * as Y from "yjs";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY as CAP } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { STUDIO_LEGACY_PIGMENT_PRESERVATION_CAPABILITY as PRESERVED } from "@toonstudio/contracts/studio-legacy-pigment-archive";
import { StudioCrdtService } from "./studio-crdt.service";
import { hasValidStudioCrdtRootSchema } from "./studio-crdt-root-schema";
import { StudioBg3dReaderUpgradeRequiredError } from "./studio-bg3d-reader-capability";
import { assertStudioBg3dBundleReaderInTransaction } from "./studio-bg3d-bundle.repository";
import { performJoin } from "./studio-live-gateway-join";
import { MemoryStudioCrdtRepository, MemoryStudioCrdtClusterLoadRepository, allowStoredRasterAssetReferences, allowStoredWorkAssetReferences } from "../../../../../tests/integration/api-web/api/modules/creator/studio-crdt.service.test-support";
import type { StudioBg3dBundleService } from "./studio-bg3d-bundle.service";
import type { StudioLiveGatewayHost } from "./studio-live-gateway-host";
import type { StudioLiveSocket } from "./studio-live.protocol";

vi.mock("./studio-bg3d-bundle.repository", () => ({ STUDIO_BG3D_BUNDLE_REPOSITORY: Symbol("test repository"), assertStudioBg3dBundleReaderInTransaction: vi.fn(),
  readStudioBg3dBundleRecordInTransaction: vi.fn(), verifyStudioBg3dSealedReferencesInTransaction: vi.fn() }));
const services: StudioCrdtService[] = [];
function harness() {
  const repository = new MemoryStudioCrdtRepository();
  const bundles = { hasRetainedBundles: vi.fn(async () => true), assertReaderCapability: vi.fn(async (_workId: string, readers: readonly string[]) => {
    if (!readers.includes(CAP)) throw new StudioBg3dReaderUpgradeRequiredError();
  }) };
  const service = new StudioCrdtService(repository, allowStoredRasterAssetReferences, allowStoredWorkAssetReferences, new MemoryStudioCrdtClusterLoadRepository(), {}, undefined, bundles as unknown as StudioBg3dBundleService);
  services.push(service); return { repository, bundles, service };
}
afterEach(() => { for (const service of services.splice(0)) service.onModuleDestroy(); vi.resetAllMocks(); });
describe("6패스 작품 reader capability gate", () => {
  it("보존 원본이 있는 작품의 구 reader sync와 쓰기를 거부하고 지원 reader에게만 요구 계약을 보낸다", async () => {
    const h = harness(); await expect(h.service.syncBytes("work-one")).rejects.toBeInstanceOf(StudioBg3dReaderUpgradeRequiredError);
    await expect(h.service.syncBytes("work-one", null, [CAP])).resolves.toMatchObject({ requiredReaderCapabilities: [CAP] });
    const doc = new Y.Doc(); doc.getMap("metadata").set("example", true);
    await expect(h.service.applyUpdateBytes({ workId: "work-one", actorUserId: "actor", updateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", data: Y.encodeStateAsUpdate(doc) })).rejects.toBeInstanceOf(StudioBg3dReaderUpgradeRequiredError);
    expect(h.repository.receipts.size).toBe(0); doc.destroy();
  });
  it("사전 읽기 뒤 생긴 retained feature도 실제 append transaction에서 구 reader 쓰기를 거부한다", async () => {
    const h = harness(); h.bundles.assertReaderCapability.mockResolvedValue(undefined); h.bundles.hasRetainedBundles.mockResolvedValue(false);
    vi.mocked(assertStudioBg3dBundleReaderInTransaction).mockRejectedValueOnce(new ConflictException({ code: "studio_bg3d_reader_upgrade_required" }));
    const doc = new Y.Doc(); doc.getMap("metadata").set("example", true);
    await expect(h.service.applyUpdateBytes({ workId: "work-one", actorUserId: "actor", updateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", data: Y.encodeStateAsUpdate(doc) })).rejects.toBeInstanceOf(StudioBg3dReaderUpgradeRequiredError);
    expect(assertStudioBg3dBundleReaderInTransaction).toHaveBeenCalledWith(h.repository.validationTransaction, "work-one", []);
    expect(h.repository.receipts.size).toBe(0); doc.destroy();
  });
  it("기능 작품의 구 reader는 adapter room 참가 전 거부한다", async () => {
    const principal = { userId: "actor" }, join = vi.fn(), disconnectInvalidJoinSession = vi.fn();
    const client = { id: "old", data: {}, join, emit: vi.fn() } as unknown as StudioLiveSocket;
    const host = { isCurrentJoinTransition: () => true, socketAuthentication: { revalidate: async () => true, principal: () => principal },
      isSocketPrincipalCurrent: () => true, hasUserConnectionCapacity: () => true,
      creatorService: { getWorkTeam: async () => ({ workId: "work-one", viewer: { userId: "actor", status: "active", capabilities: { view: true } } }) },
      studioCrdtService: { assertReaderCapability: async () => { throw new StudioBg3dReaderUpgradeRequiredError(); } },
      disconnectInvalidJoinSession, logger: { warn: vi.fn() } } as unknown as StudioLiveGatewayHost;
    await expect(performJoin.call(host, client, { workId: "work-one", clientInstanceId: "old-client" }, 1)).resolves.toMatchObject({ ok: false, code: "reader_upgrade_required", requiredReaderCapabilities: [CAP] });
    expect(join).not.toHaveBeenCalled(); expect(disconnectInvalidJoinSession).toHaveBeenCalledWith(client);
  });
});

// Git 63dc 실제 reader/publisher와 Git 5165 producer로 만든 합성 update다. 실제 사용자 데이터는 없다.
const oldReaderFixture = {
  "oldSeedBase64": "ASGfrYazDwAnAQdzdHJva2VzDHdpcmU3LXN0cm9rZQEoAJ+thrMPAAJpZAF3DHdpcmU3LXN0cm9rZSgAn62Gsw8ABnBhZ2VJZAF3CHBhZ2Utb25lKACfrYazDwAHbGF5ZXJJZAF3CXBhZ2Utcm9vdCEAn62Gsw8ABnN0YXR1cwEoAJ+thrMPAA5wYXlsb2FkVmVyc2lvbgF9BigAn62Gsw8ABHR5cGUBdwRkcmF3KACfrYazDwAEa2luZAF3CGZyZWVoYW5kKACfrYazDwAEbW9kZQF3A3BlbigAn62Gsw8ABnN0cm9rZQF3ByMxMjM0NTYoAJ+thrMPAAtzdHJva2VXaWR0aAF9AygAn62Gsw8AB29wYWNpdHkBfQEoAJ+thrMPAApleHRlbnNpb25zAXYBE2JydXNoRW5naW5lUHJvZ3JhbXN2Agd2ZXJzaW9ufQEDb2lsdgMOYnJpc3RsZVBoeXNpY3N5E2JyaXN0bGVMb2FkRHluYW1pY3N5DWltcGFzdG9SZWxpZWZ5JwCfrYazDwAGcG9pbnRzACcAn62Gsw8ACXByZXNzdXJlcwAnAJ+thrMPAAZ0aWx0WHMAJwCfrYazDwAGdGlsdFlzACcAn62Gsw8ABnR3aXN0cwAnAJ+thrMPAAZzcGVlZHMAJwCfrYazDwATdGFuZ2VudGlhbFByZXNzdXJlcwAHAQxzdHJva2Utb3JkZXIBKACfrYazDxQIc3Ryb2tlSWQBdwx3aXJlNy1zdHJva2UoAJ+thrMPFAZwYWdlSWQBdwhwYWdlLW9uZSgAn62Gsw8UB2xheWVySWQBdwlwYWdlLXJvb3QoAJ+thrMPFAZhY3RpdmUBeAgAn62Gsw8NBH0BfQJ9Cn0UCACfrYazDw4CfD8AAAB8PwAAAAgAn62Gsw8PAn0AfQAIAJ+thrMPEAJ9AH0ACACfrYazDxECfQB9AAgAn62Gsw8SAn0AfQAIAJ+thrMPEwJ9AH0AqJ+thrMPBAF3CWZpbmFsaXplZAGfrYazDwEEAQ==",
  "newV7Base64": "AROhteS1DQCon62Gsw8CAXcIcGFnZS1vbmWon62Gsw8DAXcJcGFnZS1yb290oZ+thrMPKQGon62Gsw8FAX0HqJ+thrMPBgF3BGRyYXeon62Gsw8HAXcIZnJlZWhhbmSon62Gsw8IAXcDcGVuqJ+thrMPCQF3ByMxMjM0NTaon62Gsw8KAX0DqJ+thrMPCwF9AaifrYazDwwBdgITYnJ1c2hFbmdpbmVQcm9ncmFtc3YCB3ZlcnNpb259AQNvaWx2Aw5icmlzdGxlUGh5c2ljc3kTYnJpc3RsZUxvYWREeW5hbWljc3kNaW1wYXN0b1JlbGllZnkKcHNkR3JvdXBJZHcNcHNkLWdyb3VwLW9uZYifrYazDxwEfQF9An0KfRSIn62Gsw8eAnw/AAAAfD8AAACIn62Gsw8gAn0AfQCIn62Gsw8iAn0AfQCIn62Gsw8kAn0AfQCIn62Gsw8mAn0AfQCIn62Gsw8oAn0AfQCoobXktQ0CAXcJZmluYWxpemVkAp+thrMPAgILGRGhteS1DQECAQ==",
  "oldDowngradeBase64": "AROfrYazDyqoobXktQ0AAXcIcGFnZS1vbmWoobXktQ0BAXcJcGFnZS1yb290oaG15LUNGwGoobXktQ0DAX0GqKG15LUNBAF3BGRyYXeoobXktQ0FAXcIZnJlZWhhbmSoobXktQ0GAXcDcGVuqKG15LUNBwF3ByNhYmNkZWaoobXktQ0IAX0DqKG15LUNCQF9AaihteS1DQoBdgETYnJ1c2hFbmdpbmVQcm9ncmFtc3YCB3ZlcnNpb259AQNvaWx2Aw5icmlzdGxlUGh5c2ljc3kTYnJpc3RsZUxvYWREeW5hbWljc3kNaW1wYXN0b1JlbGllZnmIobXktQ0OBH0BfQJ9Cn0UiKG15LUNEAJ8PwAAAHw/AAAAiKG15LUNEgJ9AH0AiKG15LUNFAJ9AH0AiKG15LUNFgJ9AH0AiKG15LUNGAJ9AH0AiKG15LUNGgJ9AH0AqJ+thrMPLAF3CWZpbmFsaXplZAKfrYazDwMCCxkRLAGhteS1DQEAHA==",
  "newTombstoneFullBase64": "AyGfrYazDwAnAQdzdHJva2VzDHdpcmU3LXN0cm9rZQEoAJ+thrMPAAJpZAF3DHdpcmU3LXN0cm9rZSEAn62Gsw8ABnBhZ2VJZAEhAJ+thrMPAAdsYXllcklkASEAn62Gsw8ABnN0YXR1cwEhAJ+thrMPAA5wYXlsb2FkVmVyc2lvbgEhAJ+thrMPAAR0eXBlASEAn62Gsw8ABGtpbmQBIQCfrYazDwAEbW9kZQEhAJ+thrMPAAZzdHJva2UBIQCfrYazDwALc3Ryb2tlV2lkdGgBIQCfrYazDwAHb3BhY2l0eQEhAJ+thrMPAApleHRlbnNpb25zAScAn62Gsw8ABnBvaW50cwAnAJ+thrMPAAlwcmVzc3VyZXMAJwCfrYazDwAGdGlsdFhzACcAn62Gsw8ABnRpbHRZcwAnAJ+thrMPAAZ0d2lzdHMAJwCfrYazDwAGc3BlZWRzACcAn62Gsw8AE3RhbmdlbnRpYWxQcmVzc3VyZXMABwEMc3Ryb2tlLW9yZGVyASgAn62Gsw8UCHN0cm9rZUlkAXcMd2lyZTctc3Ryb2tlKACfrYazDxQGcGFnZUlkAXcIcGFnZS1vbmUoAJ+thrMPFAdsYXllcklkAXcJcGFnZS1yb290KACfrYazDxQGYWN0aXZlAXgBAJ+thrMPDQQBAJ+thrMPDgIBAJ+thrMPDwIBAJ+thrMPEAIBAJ+thrMPEQIBAJ+thrMPEgIBAJ+thrMPEwKhn62Gsw8EAROhteS1DQCon62Gsw8CAXcIcGFnZS1vbmWon62Gsw8DAXcJcGFnZS1yb290oZ+thrMPKQGon62Gsw8FAX0HqJ+thrMPBgF3BGRyYXeon62Gsw8HAXcIZnJlZWhhbmSon62Gsw8IAXcDcGVuqJ+thrMPCQF3ByMxMjM0NTaon62Gsw8KAX0DqJ+thrMPCwF9AaifrYazDwwBdgITYnJ1c2hFbmdpbmVQcm9ncmFtc3YCB3ZlcnNpb259AQNvaWx2Aw5icmlzdGxlUGh5c2ljc3kTYnJpc3RsZUxvYWREeW5hbWljc3kNaW1wYXN0b1JlbGllZnkKcHNkR3JvdXBJZHcNcHNkLWdyb3VwLW9uZYifrYazDxwEfQF9An0KfRSIn62Gsw8eAnw/AAAAfD8AAACIn62Gsw8gAn0AfQCIn62Gsw8iAn0AfQCIn62Gsw8kAn0AfQCIn62Gsw8mAn0AfQCIn62Gsw8oAn0AfQCoobXktQ0CAXcJZmluYWxpemVkAdyeq+wHACgBE3N0dWRpby1kZWxldGlvbi1vcHMkMjEzNTZjOWYtYjkzYi00ZjRjLTliZmQtOGY2NmI2YzExMWM3AXcZWyJzdHJva2UiLCJ3aXJlNy1zdHJva2UiXQKfrYazDwICCxkRobXktQ0BAgE="
} as const;

const preservedDocuments: Y.Doc[] = [];
afterEach(() => { for (const doc of preservedDocuments.splice(0)) doc.destroy(); });
const oldFeatures = [CAP];
const newFeatures = [CAP, PRESERVED];
const wireBytes = (base64: string): Uint8Array => Uint8Array.from(Buffer.from(base64, "base64"));
const updateId = (id: number) => `70000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
function trackedDoc() { const doc = new Y.Doc(); preservedDocuments.push(doc); return doc; }
function preservedHarness() {
  const h = harness();
  h.bundles.hasRetainedBundles.mockResolvedValue(false);
  h.bundles.assertReaderCapability.mockResolvedValue(undefined);
  return h;
}
function strokeRecord(doc: Y.Doc): Y.Map<unknown> {
  const record = doc.getMap<Y.Map<unknown>>("strokes").get("wire7-stroke");
  if (!(record instanceof Y.Map)) throw new Error("시험용 획 레코드가 없습니다.");
  return record;
}
function preservedDoc(field: "psdGroupId" | "colorizeMaskEnabled" = "psdGroupId"): Y.Doc {
  const doc = trackedDoc();
  Y.applyUpdate(doc, wireBytes(oldReaderFixture.oldSeedBase64));
  Y.applyUpdate(doc, wireBytes(oldReaderFixture.newV7Base64));
  const record = strokeRecord(doc);
  const extensions = { ...(record.get("extensions") as Record<string, unknown>) };
  delete extensions.psdGroupId;
  extensions[field] = field === "psdGroupId" ? "psd-group-one" : false;
  record.set("extensions", extensions);
  return doc;
}
async function serverDocument(service: StudioCrdtService): Promise<Y.Doc> {
  const doc = trackedDoc();
  Y.applyUpdate(doc, (await service.syncBytes("work-one", null, newFeatures)).update);
  return doc;
}
function append(service: StudioCrdtService, id: number, data: Uint8Array, readerCapabilities: readonly string[]) {
  return service.applyUpdateBytes({ workId: "work-one", actorUserId: "synthetic-actor", updateId: updateId(id), data, readerCapabilities });
}
function coldService(h: ReturnType<typeof preservedHarness>): StudioCrdtService {
  const service = new StudioCrdtService(h.repository, allowStoredRasterAssetReferences, allowStoredWorkAssetReferences,
    new MemoryStudioCrdtClusterLoadRepository(), {}, undefined, h.bundles as unknown as StudioBg3dBundleService);
  services.push(service); return service;
}
const upgradeError = () => ({ requiredReaderCapabilities: [PRESERVED] });

describe("archive 없는 v7 보존 필드의 구 reader 차단", () => {
  it("부모 전의 실제 v7 delta도 ACK·sync부터 보존 reader를 요구해 3단계 구 writer 손실을 막는다", async () => {
    const h = preservedHarness(), child = wireBytes(oldReaderFixture.newV7Base64);
    const pending = trackedDoc(); Y.applyUpdate(pending, child);
    expect(pending.store.pendingStructs).not.toBeNull();
    await expect(append(h.service, 51, child, oldFeatures)).rejects.toMatchObject(upgradeError());
    expect(h.repository.receipts.size).toBe(0);
    const first = await append(h.service, 52, child, newFeatures);
    expect(first.serverSequence).toBe("1"); expect(first.requiredReaderCapabilities).toEqual([PRESERVED]);
    await expect(h.service.syncBytes("work-one", null, oldFeatures)).rejects.toMatchObject(upgradeError());
    await expect(append(h.service, 53, wireBytes(oldReaderFixture.oldDowngradeBase64), oldFeatures)).rejects.toMatchObject(upgradeError());
    await expect(append(h.service, 54, wireBytes(oldReaderFixture.oldSeedBase64), oldFeatures)).rejects.toMatchObject(upgradeError());
    expect(h.repository.receipts.size).toBe(1); expect(h.repository.nextSequence).toBe(2n);
    const completed = await append(h.service, 55, wireBytes(oldReaderFixture.oldSeedBase64), newFeatures);
    expect(completed.serverSequence).toBe("2"); expect(completed.requiredReaderCapabilities).toEqual([PRESERVED]);
    const current = await serverDocument(h.service);
    expect(current.store.pendingStructs).toBeNull(); expect(strokeRecord(current).get("payloadVersion")).toBe(7);
    expect((strokeRecord(current).get("extensions") as Record<string, unknown>).psdGroupId).toBe("psd-group-one");
  });

  it.each([1, 2, 3, 4, 5, 6])("정상 v%s의 out-of-order 좌표·일반 JSON 값 7은 보존 요구로 오인하지 않는다", async (version) => {
    const h = preservedHarness(), doc = trackedDoc(); Y.applyUpdate(doc, wireBytes(oldReaderFixture.oldSeedBase64));
    const record = strokeRecord(doc); record.set("payloadVersion", version);
    if (version < 6) record.delete("extensions");
    const parent = Y.encodeStateAsUpdate(doc), vector = Y.encodeStateVector(doc);
    record.set("strokeWidth", 7); record.set("shapeParams", { ordinaryValue: 7 });
    const points = record.get("points"); if (!(points instanceof Y.Array)) throw new Error("시험용 좌표가 없습니다.");
    points.delete(0, points.length); points.push([7, 2, 10, 20]);
    const child = Y.encodeStateAsUpdate(doc, vector), pending = trackedDoc(); Y.applyUpdate(pending, child);
    expect(pending.store.pendingStructs).not.toBeNull();
    expect((await append(h.service, 61, child, oldFeatures)).requiredReaderCapabilities).toBeUndefined();
    expect((await append(h.service, 62, parent, oldFeatures)).requiredReaderCapabilities).toBeUndefined();
    const sync = await h.service.syncBytes("work-one", null, oldFeatures), current = trackedDoc(); Y.applyUpdate(current, sync.update);
    expect(current.store.pendingStructs).toBeNull(); expect(strokeRecord(current).get("payloadVersion")).toBe(version);
    expect(strokeRecord(current).get("strokeWidth")).toBe(7);
    expect(strokeRecord(current).get("shapeParams")).toEqual({ ordinaryValue: 7 });
    expect(h.repository.receipts.size).toBe(2); expect(h.repository.nextSequence).toBe(3n);
  });

  it.each([1, 2, 3, 4, 5, 6].flatMap((version) => [
    { version, field: "psdGroupId", value: "ordinary" },
    { version, field: "colorizeMaskEnabled", value: false },
  ]))("정상 v$version shapeParams의 $field는 부모 도착 순서와 무관하게 허용한다", async ({ version, field, value }) => {
    const doc = trackedDoc(); Y.applyUpdate(doc, wireBytes(oldReaderFixture.oldSeedBase64));
    const record = strokeRecord(doc); record.set("payloadVersion", version);
    if (version < 6) record.delete("extensions");
    const parent = Y.encodeStateAsUpdate(doc), vector = Y.encodeStateVector(doc), shapeParams = { [field]: value };
    record.set("shapeParams", shapeParams);
    const child = Y.encodeStateAsUpdate(doc, vector), pending = trackedDoc(); Y.applyUpdate(pending, child);
    expect(pending.store.pendingStructs).not.toBeNull();
    expect(hasValidStudioCrdtRootSchema(doc)).toBe(true);
    expect(hasValidStudioCrdtRootSchema(pending)).toBe(true);
    for (const [first, second] of [[parent, child], [child, parent]] as const) {
      const h = preservedHarness();
      expect((await append(h.service, 71, first, oldFeatures)).requiredReaderCapabilities).toBeUndefined();
      expect((await append(h.service, 72, second, oldFeatures)).requiredReaderCapabilities).toBeUndefined();
      const sync = await h.service.syncBytes("work-one", null, oldFeatures), current = trackedDoc(); Y.applyUpdate(current, sync.update);
      expect(current.store.pendingStructs).toBeNull(); expect(hasValidStudioCrdtRootSchema(current)).toBe(true);
      expect(strokeRecord(current).get("payloadVersion")).toBe(version);
      expect(strokeRecord(current).get("shapeParams")).toEqual(shapeParams);
      expect(strokeRecord(current).get("extensions") ?? {}).not.toHaveProperty(field);
      expect(h.repository.receipts.size).toBe(2); expect(h.repository.nextSequence).toBe(3n);
    }
  });

  it.each(["psdGroupId", "colorizeMaskEnabled"] as const)("첫 %s 도착도 candidate 단계에서 구 writer를 거절한다", async (field) => {
    const h = preservedHarness(), doc = preservedDoc(field);
    expect(strokeRecord(doc).get("payloadVersion")).toBe(7);
    await expect(append(h.service, 1, Y.encodeStateAsUpdate(doc), oldFeatures)).rejects.toMatchObject(upgradeError());
    expect(h.repository.receipts.size).toBe(0);
    expect(h.repository.updates.get("work-one") ?? []).toHaveLength(0);
    expect(h.repository.nextSequence).toBe(1n);
  });

  it.each(["psdGroupId", "colorizeMaskEnabled"] as const)("첫 %s commit 응답과 cold sync도 실제 요구 cap을 유지한다", async (field) => {
    const h = preservedHarness(), doc = preservedDoc(field);
    const result = await append(h.service, 2, Y.encodeStateAsUpdate(doc), newFeatures);
    expect(result.serverSequence).toBe("1");
    expect(result.requiredReaderCapabilities).toEqual([PRESERVED]);
    await expect(h.service.syncBytes("work-one", null, oldFeatures)).rejects.toMatchObject(upgradeError());
    const cold = coldService(h);
    await expect(cold.syncBytes("work-one", null, oldFeatures)).rejects.toMatchObject(upgradeError());
    const unrelated = trackedDoc(); unrelated.getMap("metadata").set("synthetic", true);
    await expect(append(cold, 3, Y.encodeStateAsUpdate(unrelated), oldFeatures)).rejects.toMatchObject(upgradeError());
    expect(h.repository.receipts.size).toBe(1); expect(h.repository.nextSequence).toBe(2n);
    const current = await serverDocument(cold);
    expect(strokeRecord(current).get("payloadVersion")).toBe(7);
    expect((strokeRecord(current).get("extensions") as Record<string, unknown>)[field])
      .toEqual(field === "psdGroupId" ? "psd-group-one" : false);
  });

  it("실제 producer의 v7 tombstone도 cold 구 reader에게 노출하지 않는다", async () => {
    const h = preservedHarness();
    const result = await append(h.service, 4, wireBytes(oldReaderFixture.newTombstoneFullBase64), newFeatures);
    expect(result.serverSequence).toBe("1"); expect(result.requiredReaderCapabilities).toEqual([PRESERVED]);
    const cold = coldService(h);
    await expect(cold.syncBytes("work-one", null, oldFeatures)).rejects.toMatchObject(upgradeError());
    const current = await serverDocument(cold);
    expect(current.getMap("studio-deletion-ops").size).toBeGreaterThan(0);
    expect(strokeRecord(current).get("payloadVersion")).toBe(7);
    expect((strokeRecord(current).get("extensions") as Record<string, unknown>).psdGroupId).toBe("psd-group-one");
    expect(h.repository.receipts.size).toBe(1); expect(h.repository.nextSequence).toBe(2n);
  });

  it("실제 63dc publisher의 v7→v6 덮어쓰기를 거절하고 최신 편집·undo·redo·삭제는 보존한다", async () => {
    const h = preservedHarness();
    expect((await append(h.service, 10, wireBytes(oldReaderFixture.oldSeedBase64), oldFeatures)).serverSequence).toBe("1");
    expect((await append(h.service, 11, wireBytes(oldReaderFixture.newV7Base64), newFeatures)).serverSequence).toBe("2");
    const before = await serverDocument(h.service), fingerprint = JSON.stringify(strokeRecord(before).toJSON());
    // 같은 fixture에 실제 구 publisher 바이트를 적용하면 보존 필드가 사라지는 유효 update임을 확인한다.
    const corrupted = trackedDoc(); Y.applyUpdate(corrupted, Y.encodeStateAsUpdate(before));
    Y.applyUpdate(corrupted, wireBytes(oldReaderFixture.oldDowngradeBase64));
    expect(strokeRecord(corrupted).get("payloadVersion")).toBe(6);
    expect((strokeRecord(corrupted).get("extensions") as Record<string, unknown>).psdGroupId).toBeUndefined();
    await expect(append(h.service, 12, wireBytes(oldReaderFixture.oldDowngradeBase64), oldFeatures)).rejects.toMatchObject(upgradeError());
    expect(h.repository.receipts.size).toBe(2); expect(h.repository.nextSequence).toBe(3n);
    expect(JSON.stringify(strokeRecord(await serverDocument(h.service)).toJSON())).toBe(fingerprint);
    const latest = await serverDocument(h.service);
    const undo = new Y.UndoManager(latest.getMap("strokes"), { captureTimeout: 0 });
    const expectedStrokes = ["#abcdef", "#123456", "#abcdef"];
    const actions = [() => strokeRecord(latest).set("stroke", "#abcdef"), () => undo.undo(), () => undo.redo()];
    for (const [index, action] of actions.entries()) {
      const vector = Y.encodeStateVector(latest); action();
      const applied = await append(h.service, 20 + index, Y.encodeStateAsUpdate(latest, vector), newFeatures);
      expect(applied.serverSequence).toBe(String(3 + index));
      const observed = await serverDocument(h.service);
      expect(strokeRecord(observed).get("stroke")).toBe(expectedStrokes[index]);
      expect(strokeRecord(observed).get("payloadVersion")).toBe(7);
      expect((strokeRecord(observed).get("extensions") as Record<string, unknown>).psdGroupId).toBe("psd-group-one");
    }
    undo.destroy();
    const deleted = await append(h.service, 30, wireBytes(oldReaderFixture.newTombstoneFullBase64), newFeatures);
    expect(deleted.serverSequence).toBe("6");
    const observed = await serverDocument(h.service);
    expect(observed.getMap("studio-deletion-ops").size).toBeGreaterThan(0);
    expect((strokeRecord(observed).get("extensions") as Record<string, unknown>).psdGroupId).toBe("psd-group-one");
    expect(h.repository.receipts.size).toBe(6); expect(h.repository.nextSequence).toBe(7n);
  });

  it("다른 service의 첫 v7 commit과 겹친 구 writer를 durable before 검증에서 거절한다", async () => {
    const h = preservedHarness(), peer = coldService(h);
    let enter: (() => void) | undefined, release: (() => void) | undefined, calls = 0;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    h.repository.beforeAppend = async () => { if (++calls === 1) { enter?.(); await blocked; } };
    const oldWrite = append(h.service, 40, wireBytes(oldReaderFixture.oldDowngradeBase64), oldFeatures);
    const rejected = expect(oldWrite).rejects.toMatchObject(upgradeError());
    await entered;
    try {
      const first = await append(peer, 41, Y.encodeStateAsUpdate(preservedDoc()), newFeatures);
      expect(first.serverSequence).toBe("1"); expect(first.requiredReaderCapabilities).toEqual([PRESERVED]);
    } finally { release?.(); }
    await rejected;
    expect(h.repository.receipts.size).toBe(1); expect(h.repository.nextSequence).toBe(2n);
    const current = await serverDocument(peer);
    expect(strokeRecord(current).get("payloadVersion")).toBe(7);
    expect((strokeRecord(current).get("extensions") as Record<string, unknown>).psdGroupId).toBe("psd-group-one");
  });
});
