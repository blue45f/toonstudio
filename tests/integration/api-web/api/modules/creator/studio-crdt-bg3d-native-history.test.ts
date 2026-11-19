import { hashStudioBg3dSixPassBundleManifest, parseStudioBg3dSixPassBundleState } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY as CAP } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { readStudioBg3dBundleRecordInTransaction } from "../../../../../../apps/api/src/modules/creator/studio-bg3d-bundle.repository";
import { bg3dTestObject } from "../../../../../../apps/api/src/modules/creator/studio-bg3d-bundle.test-fixture";
import { snapshotStudioCrdtBg3dBundles } from "../../../../../../apps/api/src/modules/creator/studio-crdt-bg3d-bundle";
import { StudioCrdtInvalidPayloadError } from "../../../../../../apps/api/src/modules/creator/studio-crdt-service-contracts";
import { StudioCrdtService } from "../../../../../../apps/api/src/modules/creator/studio-crdt.service";
import { createBg3dBundleProjectFixture } from "../../../../../../apps/web/src/domains/creator/bg3d/studio-bg3d-bundle-project.test-fixture";
import { StudioCrdtDocument } from "../../../../../../apps/web/src/domains/creator/live/studio-crdt-document";
import { asStudioCrdtDocumentHost } from "../../../../../../apps/web/src/domains/creator/live/studio-crdt-document-host";
import { publishStudioCrdtSceneGraphDiff } from "../../../../../../apps/web/src/domains/creator/live/studio-crdt-scene-publisher";

import { MemoryStudioCrdtRepository, MemoryStudioCrdtClusterLoadRepository, allowStoredRasterAssetReferences, allowStoredWorkAssetReferences } from "./studio-crdt.service.test-support";

import type { StudioBg3dBundleRecord } from "../../../../../../apps/api/src/modules/creator/studio-bg3d-bundle.repository";
import type { StudioBg3dBundleService } from "../../../../../../apps/api/src/modules/creator/studio-bg3d-bundle.service";
import type { StudioCrdtCompatibleOrderedPage } from "../../../../../../apps/web/src/domains/creator/live/studio-crdt-page-bridge";
import type { ImageEl } from "../../../../../../apps/web/src/domains/creator/studio-element-model";

type NativeHistoryPage = StudioCrdtCompatibleOrderedPage<ImageEl> & { linked3dRender?: undefined };

vi.mock("../../../../../../apps/api/src/modules/creator/studio-bg3d-bundle.repository", () => ({
  STUDIO_BG3D_BUNDLE_REPOSITORY: Symbol("test repository"), assertStudioBg3dBundleReaderInTransaction: vi.fn(),
  readStudioBg3dBundleRecordInTransaction: vi.fn(), verifyStudioBg3dSealedReferencesInTransaction: vi.fn(),
}));
const services: StudioCrdtService[] = [], documents: StudioCrdtDocument[] = [];
beforeEach(() => vi.resetAllMocks());
afterEach(() => { for (const service of services.splice(0)) service.onModuleDestroy(); for (const document of documents.splice(0)) document.destroy(); });
async function nativeHistory() {
  const f = await createBg3dBundleProjectFixture(true), manifests = f.state.bundles[0].revisions;
  vi.mocked(readStudioBg3dBundleRecordInTransaction).mockImplementation(async (_transaction, key): Promise<StudioBg3dBundleRecord> => {
    const manifest = manifests.find((value) => value.renderRevisionId === key.renderRevisionId);
    if (!manifest) throw new Error("unknown sealed revision");
    const artifacts = await Promise.all([{ role: "scene" as const, artifact: manifest.scene }, ...manifest.layers].map(async ({ role, artifact }) => {
      const bytes = await f.authority.get(artifact.contentHash);
      if (!bytes) throw new Error("시험용 봉인 아티팩트의 원본 바이트가 없습니다.");
      return { role, object: bg3dTestObject(bytes, artifact.mimeType) };
    }));
    return { state: "sealed", sealedAt: "2026-11-19T00:00:00.000Z", manifest, manifestHash: hashStudioBg3dSixPassBundleManifest(manifest), artifacts };
  });
  const repository = new MemoryStudioCrdtRepository(), bundles = {
    requiredReaders: async (): Promise<readonly string[]> => [CAP],
    assertReaderCapability: async () => undefined,
  } satisfies Pick<StudioBg3dBundleService, "requiredReaders" | "assertReaderCapability">;
  const server = new StudioCrdtService(repository, allowStoredRasterAssetReferences, allowStoredWorkAssetReferences, new MemoryStudioCrdtClusterLoadRepository(), {}, undefined, bundles as unknown as StudioBg3dBundleService);
  services.push(server);
  const browser = new StudioCrdtDocument(); documents.push(browser); const doc = asStudioCrdtDocumentHost(browser).doc;
  const second: NativeHistoryPage = { ...f.project.pagesList[0], linked3dRender: undefined, shared3dStage: undefined };
  const firstManifest = manifests[0], first: NativeHistoryPage = { ...second, elements: second.elements.map((element) => {
    const layer = firstManifest.layers.find(({ elementId }) => elementId === element.id)!;
    return { ...element, src: layer.role === "main-line" ? `studio-opfs-cas:${layer.artifact.contentHash}` : `bg3d-lt-artifact://sha256/${layer.artifact.contentHash.slice(7)}`,
      bg3dLtBundleReference: { ...element.bg3dLtBundleReference!, renderRevisionId: firstManifest.renderRevisionId, manifestHash: hashStudioBg3dSixPassBundleManifest(firstManifest) } };
  }), bg3dLtBundles: parseStudioBg3dSixPassBundleState({ ...f.state, bundles: [{ ...f.state.bundles[0], activeRevisionId: firstManifest.renderRevisionId, revisions: [firstManifest] }] }),
    linked3dRender: undefined, shared3dStage: undefined };
  const base: NativeHistoryPage = { ...first, elements: [], groups: [], bg3dLtBundles: undefined, linked3dRender: undefined, shared3dStage: undefined };
  let previous: readonly NativeHistoryPage[] = [base];
  let sequence = 0;
  const append = async (data: Uint8Array) => await server.applyUpdateBytes({ workId: "work-one", actorUserId: "actor", updateId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(++sequence).padStart(12, "0")}`, readerCapabilities: [CAP], data });
  const publish = async (pages: readonly NativeHistoryPage[]) => {
    const vector = Y.encodeStateVector(doc); publishStudioCrdtSceneGraphDiff(browser, previous, pages);
    const data = Y.encodeStateAsUpdate(doc, vector);
    const result = await append(data);
    previous = pages; return result;
  };
  const snapshot = async () => {
    const current = new Y.Doc(); Y.applyUpdate(current, (await server.syncBytes("work-one", null, [CAP])).update);
    try { return snapshotStudioCrdtBg3dBundles(current); } finally { current.destroy(); }
  };
  return { browser, doc, first, second, base, publish, append, snapshot };
}
describe("실제 Web publisher의 6패스 실행 취소 바이트를 API에 저장", () => {
  it("첫 삽입→undo→redo가 raw deleted flag 없이 operation/ack로 저장된다", async () => {
    const f = await nativeHistory(); await f.publish([f.first]);
    expect((await f.snapshot()).images.size).toBe(6);
    await f.publish([f.base]);
    expect(f.doc.getMap("scene-element:el-color").get("deleted")).not.toBe(true);
    expect(f.doc.getMap("studio-deletion-ops").size).toBeGreaterThan(0);
    expect([...(await f.snapshot()).images.values()].every(({ deleted }) => deleted)).toBe(true);
    await f.publish([f.first]);
    expect(f.doc.getMap("studio-deletion-acks").size).toBeGreaterThan(0);
    expect([...(await f.snapshot()).images.values()].every(({ deleted }) => !deleted)).toBe(true);
  });
  it("role3개 삭제 snapshot을 보존한 채 recapture와 retained history jump를 저장한다", async () => {
    const f = await nativeHistory(); await f.publish([f.first]);
    const subset = { ...f.first, elements: f.first.elements.slice(3) }; await f.publish([subset]);
    expect([...(await f.snapshot()).images.values()].filter(({ deleted }) => !deleted)).toHaveLength(3);
    await f.publish([f.second]);
    expect([...(await f.snapshot()).images.values()].every(({ deleted }) => !deleted)).toBe(true);
    await f.publish([subset]);
    const state = await f.snapshot(); expect(state.revisions.size).toBe(2);
    expect([...state.images.values()].filter(({ deleted }) => !deleted)).toHaveLength(3);
  });
});

it("새 head를 role3개만으로 처음 게시하는 실제 Web Y 바이트는 저장하지 않는다", async () => {
  const f = await nativeHistory();
  await expect(f.publish([{ ...f.first, elements: f.first.elements.slice(3) }])).rejects.toBeInstanceOf(StudioCrdtInvalidPayloadError);
  expect((await f.snapshot()).images.size).toBe(0);
});
it("관측하지 못한 동시 삭제는 실제 Web restore ack가 있어도 삭제 상태로 남는다", async () => {
  const f = await nativeHistory(); await f.publish([f.first]); const baseline = Y.encodeStateAsUpdate(f.doc);
  const first = new StudioCrdtDocument(baseline), concurrent = new StudioCrdtDocument(baseline); documents.push(first, concurrent);
  const firstDoc = asStudioCrdtDocumentHost(first).doc, otherDoc = asStudioCrdtDocumentHost(concurrent).doc;
  let vector = Y.encodeStateVector(firstDoc); first.deleteSceneElement("el-color"); await f.append(Y.encodeStateAsUpdate(firstDoc, vector));
  const restorer = new StudioCrdtDocument(Y.encodeStateAsUpdate(firstDoc)); documents.push(restorer);
  vector = Y.encodeStateVector(otherDoc); concurrent.deleteSceneElement("el-color"); await f.append(Y.encodeStateAsUpdate(otherDoc, vector));
  const restoredDoc = asStudioCrdtDocumentHost(restorer).doc; vector = Y.encodeStateVector(restoredDoc);
  expect(restorer.restoreSceneElement("el-color")).toBe(true); await f.append(Y.encodeStateAsUpdate(restoredDoc, vector));
  expect((await f.snapshot()).images.get("el-color")?.deleted).toBe(true);
});
