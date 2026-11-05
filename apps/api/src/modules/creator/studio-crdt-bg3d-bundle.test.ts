import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { hashStudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { STUDIO_BG3D_SIX_PASS_BUNDLE_CAPABILITY as CAP, studioBg3dSixPassArtifactSourceUri } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { bg3dBundleFixture } from "./studio-bg3d-bundle.test-fixture";
import { assertStudioBg3dBundleReaderInTransaction, readStudioBg3dBundleRecordInTransaction, verifyStudioBg3dSealedReferencesInTransaction } from "./studio-bg3d-bundle.repository";
import { assertStudioBg3dBundleJsonDocumentInTransaction, assertStudioCrdtBg3dBundleAdmission,
  hasValidStudioCrdtBg3dBundleRoots, snapshotStudioCrdtBg3dBundles, STUDIO_BG3D_BUNDLE_REVISIONS_ROOT as REVISIONS,
  STUDIO_BG3D_BUNDLE_ACTIVE_ROOT as HEADS } from "./studio-crdt-bg3d-bundle";
import { hasValidStudioCrdtRootSchema } from "./studio-crdt-root-schema";
import { STUDIO_CRDT_RASTER_SURFACES_ROOT } from "@toonstudio/contracts/studio-crdt-raster-document-contract";
import { canonicalStudioRasterJson } from "@toonstudio/contracts/studio-crdt-raster-ops";
import { createStudioFilterMaskSurfaceSpec } from "@toonstudio/contracts/studio-filter-mask-surface-contract";
import type { StudioBg3dBundleRecord, StudioBg3dBundleTransaction } from "./studio-bg3d-bundle.repository";

vi.mock("./studio-bg3d-bundle.repository", () => ({ assertStudioBg3dBundleReaderInTransaction: vi.fn(),
  readStudioBg3dBundleRecordInTransaction: vi.fn(), verifyStudioBg3dSealedReferencesInTransaction: vi.fn() }));
const { manifest } = bg3dBundleFixture(), manifestHash = hashStudioBg3dSixPassBundleManifest(manifest);
const tx = {} as StudioBg3dBundleTransaction;
function fixture(clientId?: number) {
  const doc = new Y.Doc(); if (clientId !== undefined) doc.clientID = clientId;
  const revision = { version: 1, pageId: manifest.pageId, bundleId: manifest.bundleId,
    renderRevisionId: manifest.renderRevisionId, parentRevisionId: null, manifestHash };
  doc.getMap(REVISIONS).set(JSON.stringify([manifest.pageId, manifest.bundleId, manifest.renderRevisionId]), JSON.stringify(revision));
  doc.getMap(HEADS).set(JSON.stringify([manifest.pageId, manifest.bundleId]), manifest.renderRevisionId);
  for (const layer of manifest.layers) {
    doc.getMap("scene-elements").set(layer.elementId, true);
    const record = doc.getMap(`scene-element:${layer.elementId}`);
    for (const [key, value] of Object.entries({ id: layer.elementId, pageId: manifest.pageId, layerId: manifest.groupId, payloadVersion: 1, type: "reference", deleted: false })) record.set(key, value);
    for (const [key, value] of Object.entries({ elementType: "image", x: 0, y: 0, width: 1, height: 1, rotation: 0, opacity: 1, blendMode: "normal",
      src: layer.role === "main-line" ? `studio-opfs-cas:${layer.artifact.contentHash}` : studioBg3dSixPassArtifactSourceUri(layer.artifact.contentHash),
      bg3dLtBundleId: manifest.bundleId, bg3dLtRole: layer.role, bg3dLtRenderMode: "separated",
      bg3dLtBundleReference: { kind: "bg3d-sixpass-bundle", bundleId: manifest.bundleId, renderRevisionId: manifest.renderRevisionId, manifestHash, role: layer.role, elementId: layer.elementId } })) record.set(`prop:${key}`, value);
  }
  return doc;
}
function sealed() { return { state: "sealed", manifest, manifestHash, artifacts: Array.from({ length: 7 }, () => ({})) } as StudioBg3dBundleRecord; }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(readStudioBg3dBundleRecordInTransaction).mockResolvedValue(sealed()); });
describe("봉인된 6패스 서버 문서 경계", () => {
  it.each([true, false, undefined])("등록된 Magic Layer 마스크 연결을 원격 6패스 이미지에 적용한다 (enabled=%s)", async (enabled) => {
    const before = fixture(11);
    const surface = createStudioFilterMaskSurfaceSpec({
      surfaceId: "filter-mask:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", width: 1, height: 1,
    });
    before.getMap(STUDIO_CRDT_RASTER_SURFACES_ROOT).set(surface.surfaceId, canonicalStudioRasterJson(surface));
    const sender = new Y.Doc(), receiver = new Y.Doc();
    try {
      const initial = Y.encodeStateAsUpdate(before), vector = Y.encodeStateVector(before);
      Y.applyUpdate(sender, initial); Y.applyUpdate(receiver, initial);
      expect(hasValidStudioCrdtRootSchema(receiver)).toBe(true);
      const image = sender.getMap("scene-element:element-color");
      sender.transact(() => {
        image.set("prop:filterMaskSurfaceId", surface.surfaceId);
        if (enabled !== undefined) image.set("prop:filterMaskEnabled", enabled);
      });
      const update = Y.encodeStateAsUpdate(sender, vector);
      Y.applyUpdate(receiver, update);
      expect(hasValidStudioCrdtRootSchema(receiver)).toBe(true);
      await expect(assertStudioCrdtBg3dBundleAdmission(tx, "work-one", before, receiver, [CAP], undefined, update)).resolves.toBeUndefined();
      const restored = snapshotStudioCrdtBg3dBundles(receiver).images.get("element-color");
      expect(restored?.props.filterMaskSurfaceId).toBe(surface.surfaceId);
      expect(restored?.props.filterMaskEnabled).toBe(enabled);
      expect(restored?.ref).toEqual(snapshotStudioCrdtBg3dBundles(before).images.get("element-color")?.ref);
    } finally { before.destroy(); sender.destroy(); receiver.destroy(); }
  });
  it.each([
    { surfaceRegistered: true, maskProps: { filterMaskEnabled: true } },
    { surfaceRegistered: true, maskProps: { filterMaskSurfaceId: "not-a-filter-mask" } },
    { surfaceRegistered: true, maskProps: { filterMaskSurfaceId: "filter-mask:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", filterMaskEnabled: "true" } },
    { surfaceRegistered: false, maskProps: { filterMaskSurfaceId: "filter-mask:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } },
  ])("잘못된 마스크 계약 또는 등록되지 않은 surface 참조를 거부한다: %j", ({ surfaceRegistered, maskProps }) => {
    const doc = fixture();
    try {
      if (surfaceRegistered) {
        const surface = createStudioFilterMaskSurfaceSpec({
          surfaceId: "filter-mask:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", width: 1, height: 1,
        });
        doc.getMap(STUDIO_CRDT_RASTER_SURFACES_ROOT).set(surface.surfaceId, canonicalStudioRasterJson(surface));
      }
      const image = doc.getMap("scene-element:element-color");
      for (const [key, value] of Object.entries(maskProps)) image.set(`prop:${key}`, value);
      expect(hasValidStudioCrdtRootSchema(doc)).toBe(false);
    } finally { doc.destroy(); }
  });
  it("작은 참조와 registry만 있는 6개 레이어를 일반 root schema로 읽는다", () => {
    const doc = fixture(); expect(hasValidStudioCrdtRootSchema(doc)).toBe(true); doc.destroy();
  });
  it.each(["https://example.test/leak.png", "data:image/png;base64,AAAA", "bg3d-lt-artifact://sha256/bad"])("외부/inline src %s를 거부한다", (src) => {
    const doc = fixture(); doc.getMap("scene-element:element-color").set("prop:src", src);
    expect(hasValidStudioCrdtRootSchema(doc)).toBe(false); doc.destroy();
  });
  it("원본·역할·활성 revision 결박과 미지원 registry를 거부한다", () => {
    for (const mutate of [
      (doc: Y.Doc) => doc.getMap("scene-element:element-color").set("prop:bg3dLtRole", "shadow"),
      (doc: Y.Doc) => doc.getMap(HEADS).set(JSON.stringify([manifest.pageId, manifest.bundleId]), ""),
      (doc: Y.Doc) => doc.getMap("studio-bg3d-bundle-unknown").set("x", "x"),
    ]) { const doc = fixture(); mutate(doc); expect(hasValidStudioCrdtRootSchema(doc)).toBe(false); doc.destroy(); }
  });
  it("같은 트랜잭션의 봉인·reader 검사를 통과한 6개를 원자로 게시한다", async () => {
    const before = new Y.Doc(), after = fixture(); await expect(assertStudioCrdtBg3dBundleAdmission(tx, "work-one", before, after, [CAP])).resolves.toBeUndefined();
    expect(assertStudioBg3dBundleReaderInTransaction).toHaveBeenCalledWith(tx, "work-one", [CAP]);
    expect(verifyStudioBg3dSealedReferencesInTransaction).toHaveBeenCalled(); before.destroy(); after.destroy();
  });
  it("5개 레이어만 게시하거나 다른 본문을 참조하면 거부한다", async () => {
    const before = new Y.Doc(), partial = fixture(); partial.getMap("scene-element:element-color").delete("prop:bg3dLtBundleReference");
    await expect(assertStudioCrdtBg3dBundleAdmission(tx, "work-one", before, partial, [CAP])).rejects.toThrow();
    const wrong = fixture(); wrong.getMap("scene-element:element-color").set("prop:src", studioBg3dSixPassArtifactSourceUri(`sha256:${"f".repeat(64)}`));
    await expect(assertStudioCrdtBg3dBundleAdmission(tx, "work-one", before, wrong, [CAP])).rejects.toThrow(); before.destroy(); partial.destroy(); wrong.destroy();
  });
  it("봉인되지 않은 작품 revision과 보존 이력 제거를 거부한다", async () => {
    const before = new Y.Doc(), after = fixture(); vi.mocked(readStudioBg3dBundleRecordInTransaction).mockResolvedValue({ ...sealed(), state: "prepared" });
    await expect(assertStudioCrdtBg3dBundleAdmission(tx, "work-one", before, after, [CAP])).rejects.toThrow();
    const removed = new Y.Doc(); await expect(assertStudioCrdtBg3dBundleAdmission(tx, "work-one", after, removed, [CAP])).rejects.toThrow();
    before.destroy(); after.destroy(); removed.destroy();
  });
  it("새 레이어 내용으로 바꾸면서 기존 bundle 역할을 조용히 분리할 수 없다", async () => {
    const before = fixture(), after = fixture();
    after.getMap("scene-element:element-color").delete("prop:bg3dLtBundleReference");
    await expect(assertStudioCrdtBg3dBundleAdmission(tx, "work-one", before, after, [CAP])).rejects.toThrow();
    before.destroy(); after.destroy();
  });
  it("LWW에서 지는 후보도 기존 revision ID를 다른 manifest로 재사용할 수 없다", async () => {
    const before = fixture(), after = fixture(), candidate = new Y.Doc();
    const key = JSON.stringify([manifest.pageId, manifest.bundleId, manifest.renderRevisionId]);
    const value = JSON.parse(before.getMap(REVISIONS).get(key) as string) as Record<string, unknown>;
    candidate.getMap(REVISIONS).set(key, JSON.stringify({ ...value, manifestHash: `sha256:${"f".repeat(64)}` }));
    await expect(assertStudioCrdtBg3dBundleAdmission(tx, "work-one", before, after, [CAP], candidate)).rejects.toThrow();
    before.destroy(); after.destroy(); candidate.destroy();
  });
  it("처음 게시하는 revision은 삭제 operation이 없는 여섯 활성 레이어여야 한다", async () => {
    const before = new Y.Doc(), after = fixture();
    after.getMap("studio-deletion-ops").set("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", JSON.stringify(["scene", "element-tone"]));
    await expect(assertStudioCrdtBg3dBundleAdmission(tx, "work-one", before, after, [CAP])).rejects.toThrow(/여섯 활성/);
    before.destroy(); after.destroy();
  });
  it("이미지의 raw layerId 교체는 거부하고 artist 좌표·불투명도·blend 변경은 허용한다", async () => {
    const before = fixture(), moved = fixture(); moved.getMap("scene-element:element-tone").set("layerId", "other-group");
    await expect(assertStudioCrdtBg3dBundleAdmission(tx, "work-one", before, moved, [CAP])).rejects.toThrow();
    const edited = fixture(), image = edited.getMap("scene-element:element-tone");
    image.set("prop:x", 20); image.set("prop:opacity", .4); image.set("prop:blendMode", "overlay");
    await expect(assertStudioCrdtBg3dBundleAdmission(tx, "work-one", before, edited, [CAP])).resolves.toBeUndefined();
    before.destroy(); moved.destroy(); edited.destroy();
  });
  it("그룹 변경이 LWW에서 져도 incoming scalar를 읽어 거부한다", async () => {
    const base = fixture(3), bytes = Y.encodeStateAsUpdate(base), vector = Y.encodeStateVector(base);
    const losing = new Y.Doc(); Y.applyUpdate(losing, bytes); losing.clientID = 1;
    losing.getMap("scene-element:element-tone").set("layerId", "other-group"); const update = Y.encodeStateAsUpdate(losing, vector);
    const before = new Y.Doc(); Y.applyUpdate(before, bytes); before.clientID = 2;
    before.getMap("scene-element:element-tone").set("layerId", manifest.groupId);
    const after = new Y.Doc(); Y.applyUpdate(after, Y.encodeStateAsUpdate(before)); Y.applyUpdate(after, update);
    expect(after.getMap("scene-element:element-tone").get("layerId")).toBe(manifest.groupId);
    await expect(assertStudioCrdtBg3dBundleAdmission(tx, "work-one", before, after, [CAP], undefined, update)).rejects.toThrow(/패배 후보/);
    base.destroy(); losing.destroy(); before.destroy(); after.destroy();
  });
  it("REST native 이미지도 봉인된 groupId와 일치해야 한다", async () => {
    const doc = fixture(), state = { contract: "toonstudio.bg3d-sixpass-bundles.v1", version: 1, minimumReaderCapability: CAP, minimumProjectVersion: 5,
      bundles: [{ bundleId: manifest.bundleId, activeRevisionId: manifest.renderRevisionId, revisions: [manifest] }] };
    const images = [...snapshotStudioCrdtBg3dBundles(doc).images].map(([id, image]) => ({ ...image.props, type: "image", id, groupId: image.layerId }));
    await expect(assertStudioBg3dBundleJsonDocumentInTransaction(tx, "work-one", { pagesList: [{ id: manifest.pageId, bg3dLtBundles: state, elements: images }] }, [CAP])).resolves.toBeUndefined();
    images[0] = { ...images[0], groupId: "other-group" };
    await expect(assertStudioBg3dBundleJsonDocumentInTransaction(tx, "work-one", { pagesList: [{ id: manifest.pageId, bg3dLtBundles: state, elements: images }] }, [CAP])).rejects.toThrow(); doc.destroy();
  });
  it("REST 이미지는 같은 groupId라도 다른 페이지·master·metadata로 이동시킬 수 없다", async () => {
    const doc = fixture(), state = { contract: "toonstudio.bg3d-sixpass-bundles.v1", version: 1, minimumReaderCapability: CAP, minimumProjectVersion: 5,
      bundles: [{ bundleId: manifest.bundleId, activeRevisionId: manifest.renderRevisionId, revisions: [manifest] }] };
    const images = [...snapshotStudioCrdtBg3dBundles(doc).images].map(([id, image]) => ({ ...image.props, type: "image", id, groupId: image.layerId }));
    const base = { pagesList: [{ id: manifest.pageId, elements: [], bg3dLtBundles: state }] };
    for (const changed of [
      { pagesList: [...base.pagesList, { id: "other-page", elements: images }] },
      { ...base, masterPage: { elements: images } },
      { ...base, metadata: { elements: images } },
    ]) await expect(assertStudioBg3dBundleJsonDocumentInTransaction(tx, "work-one", changed, [CAP])).rejects.toThrow();
    await expect(assertStudioBg3dBundleJsonDocumentInTransaction(tx, "work-one", { metadata: { type: "image", src: "data:image/png;base64,AA==", groupId: "ordinary" } }, [])).resolves.toBeUndefined();
    doc.destroy();
  });
  it("일반 요소의 그룹 후보는 새 native 계약으로 제한하지 않는다", async () => {
    const before = new Y.Doc(), after = new Y.Doc(); after.getMap("scene-element:text").set("layerId", "other-group");
    await expect(assertStudioCrdtBg3dBundleAdmission(tx, "work-one", before, after, [], undefined, Y.encodeStateAsUpdate(after))).resolves.toBeUndefined();
    expect(readStudioBg3dBundleRecordInTransaction).not.toHaveBeenCalled(); before.destroy(); after.destroy();
  });
  it("REST 저장은 이미지가 모두 삭제되어도 보존된 원본을 제거할 수 없다", async () => {
    const previous = { pagesList: [{ id: manifest.pageId, elements: [], bg3dLtBundles: { contract: "toonstudio.bg3d-sixpass-bundles.v1", version: 1, minimumReaderCapability: CAP, minimumProjectVersion: 5,
      bundles: [{ bundleId: manifest.bundleId, activeRevisionId: null, revisions: [manifest] }] } }] };
    await expect(assertStudioBg3dBundleJsonDocumentInTransaction(tx, "work-one", previous, [CAP], previous)).resolves.toBeUndefined();
    await expect(assertStudioBg3dBundleJsonDocumentInTransaction(tx, "work-one", { pages: [] }, [CAP], previous)).rejects.toThrow();
  });
  it("구조가 잘못된 registry를 조용히 통과시키지 않는다", () => {
    const doc = fixture(); doc.getMap(REVISIONS).set("bad", "{}"); expect(hasValidStudioCrdtBg3dBundleRoots(doc)).toBe(false); doc.destroy();
  });
});
