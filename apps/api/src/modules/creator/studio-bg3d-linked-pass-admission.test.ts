import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashStudioBg3dSixPassBundleManifest, parseStudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { extractStudioLinked3dPassAssetRequirements } from "@toonstudio/contracts/studio-linked-3d-pass-asset-fence";
import { bg3dBundleFixture } from "./studio-bg3d-bundle.test-fixture";
import { extractStudioBg3dLinkedPassRequirementsInTransaction } from "./studio-bg3d-linked-pass-admission";
import type { StudioBg3dBundleTransaction } from "./studio-bg3d-bundle.repository";

const gate = vi.hoisted(() => vi.fn<(...args: readonly unknown[]) => Promise<void>>());
vi.mock("./studio-bg3d-bundle-rest-gate", () => ({ assertStudioBg3dRestDocumentInTransaction: gate }));
const transaction = Object.freeze({}) as StudioBg3dBundleTransaction;
const CAP = ["bg3d-sixpass-bundle.v1"];
function fixture(byteSize = 9 * 1024 * 1024) {
  const source = bg3dBundleFixture().manifest;
  const manifest = parseStudioBg3dSixPassBundleManifest({ ...source,
    layers: source.layers.map((layer) => ({ ...layer, artifact: { ...layer.artifact, byteSize } })) });
  const main = manifest.layers[5], locator = `studio-opfs-cas:${main.artifact.contentHash}`, hash = manifest.cameraHash;
  const elements = manifest.layers.map((layer): Record<string, unknown> => ({ id: layer.elementId, type: "image", groupId: manifest.groupId,
    src: layer.role === "main-line" ? locator : `bg3d-lt-artifact://sha256/${layer.artifact.contentHash.slice(7)}`,
    bg3dLtBundleId: manifest.bundleId, bg3dLtRole: layer.role, bg3dLtRenderMode: "separated", blendMode: layer.blendMode,
    bg3dLtBundleReference: { kind: "bg3d-sixpass-bundle", bundleId: manifest.bundleId, renderRevisionId: manifest.renderRevisionId,
      manifestHash: hashStudioBg3dSixPassBundleManifest(manifest), role: layer.role, elementId: layer.elementId } }));
  const artifact = { pass: "line", role: "main-line", contentHash: main.artifact.contentHash, byteSize,
    mime: "image/png", width: manifest.width, height: manifest.height, locator };
  const link = { bundleId: manifest.bundleId, shotId: "shot-one", sourceShotId: null, stageSourceHash: hash,
    layers: manifest.layers.map(({ role, elementId }) => ({ role, elementId })), corrections: [],
    passRevision: { revision: 1, sourceHash: hash, sceneHash: hash, cameraHash: hash, baseGeometryHash: hash,
      topologyHash: hash, objectIdentityHash: hash, passRootHash: hash, objectStableIds: [], artifact } };
  const page = { id: manifest.pageId, elements, bg3dLtBundles: { contract: "toonstudio.bg3d-sixpass-bundles.v1", version: 1,
    minimumReaderCapability: CAP[0], minimumProjectVersion: 5,
    bundles: [{ bundleId: manifest.bundleId, activeRevisionId: manifest.renderRevisionId, revisions: [manifest] }] },
    linked3dRender: { kind: "toonstudio.studio-linked-3d-render", version: 2, authority: "studio-project-linked-3d-pass-index", links: [link] } };
  return { page, link, locator, envelope: { cover: "", pages: [], doc: { pagesList: [page] } } };
}

describe("봉인된 native main-line의 legacy 중복 업로드 제외", () => {
  beforeEach(() => { gate.mockReset(); gate.mockResolvedValue(); });
  it("같은 tx의 봉인·reader 검증을 통과한 정확 9MiB main-line만 일반 행 요구에서 제외한다", async () => {
    const f = fixture();
    expect(() => extractStudioLinked3dPassAssetRequirements(f.envelope)).toThrow(/cloud PNG limits/);
    await expect(extractStudioBg3dLinkedPassRequirementsInTransaction(transaction, "work-one", f.envelope, CAP)).resolves.toEqual([]);
    expect(gate).toHaveBeenCalledWith(transaction, "work-one", f.envelope.doc, CAP, undefined);
  });
  it.each(["미봉인", "다른 작품", "구 reader", "registry 손실"])("%s 검증이 거부되면 marker가 있어도 예외를 만들지 않는다", async (message) => {
    const f = fixture(); gate.mockRejectedValueOnce(new Error(message));
    await expect(extractStudioBg3dLinkedPassRequirementsInTransaction(transaction, "work-one", f.envelope, CAP)).rejects.toThrow(message);
  });
  it("검증된 manifest와 다른 native receipt bytes를 받아들이지 않는다", async () => {
    const f = fixture(); f.link.passRevision.artifact.byteSize -= 1;
    await expect(extractStudioBg3dLinkedPassRequirementsInTransaction(transaction, "work-one", f.envelope, CAP)).rejects.toThrow(/cloud PNG limits/);
  });
  it("native가 있어도 cover의 임의 reserved locator는 거부한다", async () => {
    const f = fixture(); f.envelope.cover = f.locator;
    await expect(extractStudioBg3dLinkedPassRequirementsInTransaction(transaction, "work-one", f.envelope, CAP)).rejects.toThrow(/exact receipt pair/);
  });
  it("동일 PNG hash를 쓰는 별도 ordinary LT는 일반 행 요구를 유지한다", async () => {
    const f = fixture(68), ordinary = structuredClone(f.link);
    ordinary.bundleId = "ordinary-bundle"; ordinary.layers = [{ role: "main-line", elementId: "ordinary-line" }];
    f.page.linked3dRender.links.push(ordinary);
    f.page.elements.push({ id: "ordinary-line", type: "image", src: f.locator });
    const requirements = await extractStudioBg3dLinkedPassRequirementsInTransaction(transaction, "work-one", f.envelope, CAP);
    expect(requirements).toHaveLength(1); expect(requirements[0]?.byteSize).toBe(68);
  });
  it("동일 hash라도 ordinary의 9MiB 계약은 넓히지 않는다", async () => {
    const f = fixture(), ordinary = structuredClone(f.link);
    ordinary.bundleId = "ordinary-bundle"; ordinary.layers = [{ role: "main-line", elementId: "ordinary-line" }];
    f.page.linked3dRender.links.push(ordinary);
    f.page.elements.push({ id: "ordinary-line", type: "image", src: f.locator });
    await expect(extractStudioBg3dLinkedPassRequirementsInTransaction(transaction, "work-one", f.envelope, CAP)).rejects.toThrow(/cloud PNG limits/);
  });
});
