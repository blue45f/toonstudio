import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStudioBg3dSixPassBundleArtifacts, hashStudioBg3dSixPassBundleManifest, serializeStudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { createBg3dBundleProjectFixture, createBg3dBundleTestAuthority } from "../../bg3d/studio-bg3d-bundle-project.test-fixture";
import { ensureStudioBg3dSixPassCloudProject, hydrateStudioBg3dSixPassCloudProject } from "./studio-bg3d-six-pass-cloud-project";
import { ensureStudioLinked3dPassCloudProject, hydrateStudioLinked3dPassCloudProject } from "../../studio-linked-3d-pass-cloud-project";
import { collectStudioLinked3dPassProjectArchiveReferences } from "../../studio-linked-3d-pass-project-archive";
import { rememberStudioBg3dSixPassWorkReceipt } from "../../studio-cuttoon-editor/runtime/bg3d-six-pass/studio-bg3d-six-pass-work-receipts";
import { createStudioLinked3dRenderPageFixture } from "../../studio-linked-3d-render-test-fixture";
import { createStudioLinked3dPassCloudAssetDescriptor } from "../../studio-linked-3d-pass-cloud-sync";
import { prepareStudioLinked3dLinePass } from "../../studio-linked-3d-pass-transaction";
import { materializeStudioLinked3dLinePassLocator, upsertStudioLinked3dRenderLink } from "../../studio-linked-3d-render-document";
import { parseStudioProjectFile } from "../../studio-project-file";
import { migrateStudioShared3dStageCollectionDocument } from "../../studio-shared-3d-stage-collection";
import type { StudioOpfsAssetStore } from "../../studio-opfs-asset-store";
import type { StudioLinked3dPassCasAuthority } from "../../studio-linked-3d-pass-transaction";

const ports = vi.hoisted(() => ({
  authority: vi.fn<() => Promise<StudioOpfsAssetStore>>(), line: vi.fn<() => Promise<StudioLinked3dPassCasAuthority>>(),
  seal: vi.fn<typeof import("./studio-bg3d-six-pass-bundle-api").sealStudioBg3dSixPassRemoteBundle>(),
  hydrate: vi.fn<typeof import("./studio-bg3d-six-pass-bundle-api").hydrateStudioBg3dSixPassRemoteBundle>(),
  upload: vi.fn<typeof import("../../studio-work-asset-client").uploadStudioWorkAsset>(),
  download: vi.fn<typeof import("../../studio-work-asset-client").downloadStudioWorkAsset>(),
}));
vi.mock("./studio-bg3d-six-pass-bundle-api", () => ({ sealStudioBg3dSixPassRemoteBundle: ports.seal, hydrateStudioBg3dSixPassRemoteBundle: ports.hydrate }));
vi.mock("./studio-bg3d-six-pass-bundle-product-authority", () => ({ acquireStudioBg3dSixPassBundleProductAuthority: ports.authority,
  runStudioBg3dSixPassBundleMutationExclusive: async <T>(_owner: string, task: () => Promise<T>) => await task() }));
vi.mock("../../studio-linked-3d-pass-product-authority", () => ({ acquireStudioLinked3dPassProductAuthority: ports.line }));
vi.mock("../../studio-work-asset-client", () => ({ uploadStudioWorkAsset: ports.upload, downloadStudioWorkAsset: ports.download,
  deleteUnreferencedStudioWorkAssetUpload: vi.fn() }));

// 실제 GPU·서버 증거와 구분한 native-interface 및 transport 이음매 회귀다.
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() }))); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function fixture() {
  const f = await createBg3dBundleProjectFixture(true); const target = createBg3dBundleTestAuthority(), line = createBg3dBundleTestAuthority();
  ports.authority.mockResolvedValue(f.authority); ports.line.mockResolvedValue(line);
  return { ...f, target, line };
}
async function remoteFixture() {
  const f = await fixture(); ports.authority.mockResolvedValue(f.target);
  ports.hydrate.mockImplementation(async ({ workId, reference, authority }) => {
    if (workId !== "work-remote") throw new Error("작품 범위 불일치");
    const manifest = f.state.bundles[0].revisions.find((entry) => entry.renderRevisionId === reference.renderRevisionId);
    if (!manifest || hashStudioBg3dSixPassBundleManifest(manifest) !== reference.manifestHash) throw new Error("원격 fixture 참조 불일치");
    for (const { artifact } of getStudioBg3dSixPassBundleArtifacts(manifest)) {
      const bytes = await f.authority.get(artifact.contentHash, { verify: true });
      if (!bytes) throw new Error("원격 fixture 본문 누락");
      await authority.put(bytes, { mime: artifact.mimeType });
    }
    await authority.put(new TextEncoder().encode(serializeStudioBg3dSixPassBundleManifest(manifest)), { mime: "application/vnd.toonstudio.bg3d-sixpass-bundle+json" });
  });
  return f;
}

describe("6패스 원고의 작품 승격·원격 재열기", () => {
  it("모든 본문 선검증 후 원본 배열 순서와 무관하게 같은 작품에 부모부터 봉인한다", async () => {
    const f = await fixture(); const page = f.project.pagesList[0];
    const project = { ...f.project, pagesList: [{ ...page, bg3dLtBundles: { ...f.state,
      bundles: [{ ...f.state.bundles[0], revisions: [...f.state.bundles[0].revisions].reverse() }] } }] };
    const reads = vi.spyOn(f.authority, "get");
    ports.seal.mockImplementation(async () => { expect(reads.mock.calls.length).toBeGreaterThanOrEqual(15); throw new Error("확인 뒤 중단"); });
    await expect(ensureStudioBg3dSixPassCloudProject({ workId: "work-new", project })).rejects.toThrow("확인 뒤 중단");
    expect(ports.seal).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ workId: "work-new", prepared: { manifest: f.state.bundles[0].revisions[0] } }));
    ports.seal.mockReset();
    await ensureStudioBg3dSixPassCloudProject({ workId: "work-new", project });
    expect(ports.seal.mock.calls.map(([input]) => [input.workId, input.prepared.manifest.renderRevisionId])).toEqual([["work-new", "rev-1"], ["work-new", "rev-2"]]);
  });
  it("늦은 보존 본문·manifest 손상이 있어도 첫 원격 봉인을 시작하지 않는다", async () => {
    const f = await fixture(); const original = f.authority.get.bind(f.authority);
    vi.spyOn(f.authority, "get").mockImplementation(async (hash, options) => hash === hashStudioBg3dSixPassBundleManifest(f.manifest) ? null : await original(hash, options));
    await expect(ensureStudioBg3dSixPassCloudProject({ workId: "work-missing", project: f.project })).rejects.toThrow(/manifest/);
    expect(ports.seal).not.toHaveBeenCalled();
  });
  it("실제 PNG 디코드가 거부되면 원격 봉인을 시작하지 않는다", async () => {
    const f = await fixture(); vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 2, height: 1, close: vi.fn() })));
    await expect(ensureStudioBg3dSixPassCloudProject({ workId: "work-bad-decode", project: f.project })).rejects.toThrow();
    expect(ports.seal).not.toHaveBeenCalled();
  });
  it("같은 작품의 검증된 불변 봉인은 재전송하지 않으며 다른 작품에는 새로 봉인한다", async () => {
    const f = await fixture();
    for (const manifest of f.state.bundles[0].revisions) rememberStudioBg3dSixPassWorkReceipt("work-known", hashStudioBg3dSixPassBundleManifest(manifest));
    await ensureStudioBg3dSixPassCloudProject({ workId: "work-known", project: f.project }); expect(ports.seal).not.toHaveBeenCalled();
    await ensureStudioBg3dSixPassCloudProject({ workId: "work-other", project: f.project }); expect(ports.seal).toHaveBeenCalledTimes(2);
  });
  it("기존 cloud helper의 native 전용 원고는 generic 8MiB 선화 업로드로 보내지 않는다", async () => {
    const f = await fixture();
    await expect(ensureStudioLinked3dPassCloudProject({ workId: "work-wrapper", project: f.project })).resolves.toEqual([]);
    expect(ports.seal).toHaveBeenCalledTimes(2); expect(ports.upload).not.toHaveBeenCalled();
  });
  it("마지막 native 봉인 실패는 legacy 업로드와 다음 저장 단계 전에 전파한다", async () => {
    const f = await fixture(); ports.seal.mockRejectedValueOnce(new Error("봉인 응답 유실"));
    await expect(ensureStudioLinked3dPassCloudProject({ workId: "work-failed", project: f.project })).rejects.toThrow("봉인 응답 유실");
    expect(ports.seal).toHaveBeenCalledOnce(); expect(ports.upload).not.toHaveBeenCalled();
  });
  it("원격 모든 보존 revision을 복원하고 두 CAS owner를 보장한 뒤 한 번 적용한다", async () => {
    const f = await remoteFixture(); const apply = vi.fn(async (project) => {
      for (const manifest of f.state.bundles[0].revisions) expect(await f.target.ownerRefs(`studio-bg3d-sixpass:page-1:bundle-1:${manifest.renderRevisionId}`)).toHaveLength(8);
      for (const ref of collectStudioLinked3dPassProjectArchiveReferences(project)) {
        expect(await f.line.get(ref.contentHash, { verify: true })).not.toBeNull(); expect(await f.line.ownerRefs(ref.ownerId)).toContain(ref.contentHash);
      }
      return "applied";
    });
    await expect(hydrateStudioLinked3dPassCloudProject({ workId: "work-remote", project: f.project, apply })).resolves.toBe("applied");
    expect(apply).toHaveBeenCalledExactlyOnceWith(f.project); expect(ports.download).not.toHaveBeenCalled();
    expect(ports.hydrate.mock.calls.map(([input]) => input.reference.renderRevisionId)).toEqual(["rev-1", "rev-2"]);
  });
  it("native·일반 LT 혼합 작품은 양쪽 원본과 owner를 복원한 뒤 한 번만 적용한다", async () => {
    const f = await remoteFixture(), normal = createStudioLinked3dRenderPageFixture("normal-page");
    const image = normal.elements[0], sourceHash = migrateStudioShared3dStageCollectionDocument(normal.shared3dStage)?.stages[0]?.background.sourceHash;
    if (image.type !== "image" || !image.bg3dScene || !sourceHash) throw new Error("일반 LT fixture가 없습니다.");
    const png = f.manifest.layers[0].artifact, bytes = await f.authority.get(png.contentHash);
    if (!bytes) throw new Error("혼합 fixture PNG가 없습니다.");
    const prepared = await prepareStudioLinked3dLinePass({ authority: f.authority, sourceHash, scene: image.bg3dScene,
      layers: [{ role: "main-line", width: 1, height: 1, pngDataUrl: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}` }] });
    const bundleId = normal.linked3dRender!.links[0].bundleId;
    const elements = materializeStudioLinked3dLinePassLocator(normal.elements, bundleId, prepared.descriptor);
    if (!elements) throw new Error("일반 LT locator를 만들지 못했습니다.");
    const linked3dRender = upsertStudioLinked3dRenderLink({ value: normal.linked3dRender, bundleId,
      shotId: image.bg3dScene.activeShotId!, passRevision: prepared.descriptor, elements, shared3dStage: normal.shared3dStage! });
    const project = parseStudioProjectFile({ ...f.project, pagesList: [...f.project.pagesList, { ...normal, elements, linked3dRender }] });
    const descriptor = createStudioLinked3dPassCloudAssetDescriptor(prepared.descriptor.artifact);
    ports.download.mockImplementation(async (_workId, reference) => ({ blob: new Blob([Uint8Array.from(bytes)], { type: "image/png" }), manifest: {
      version: 1, assetId: reference.assetId, elementType: "image", mimeType: "image/png", byteSize: bytes.byteLength,
      sha256: png.contentHash.slice(7), intrinsicImage: { width: 1, height: 1, decodedRgbaBytes: 4 }, descriptor, updatedAt: "2026-11-05T00:00:00.000Z" } }));
    const apply = vi.fn(async () => {
      for (const ref of collectStudioLinked3dPassProjectArchiveReferences(project)) expect(await f.line.ownerRefs(ref.ownerId)).toContain(ref.contentHash);
      for (const manifest of f.state.bundles[0].revisions) expect(await f.target.ownerRefs(`studio-bg3d-sixpass:page-1:bundle-1:${manifest.renderRevisionId}`)).toHaveLength(8);
      return "mixed";
    });
    await expect(hydrateStudioLinked3dPassCloudProject({ workId: "work-remote", project, apply })).resolves.toBe("mixed");
    expect(apply).toHaveBeenCalledOnce(); expect(ports.download).toHaveBeenCalledOnce();
  });
  it("레이어가 없는 inactive 원고도 보존된 revision마다 8본문 owner를 유지한다", async () => {
    const f = await remoteFixture(); const page = f.project.pagesList[0];
    const project = parseStudioProjectFile({ ...f.project, pagesList: [{ ...page, elements: [], groups: [], linked3dRender: undefined,
      bg3dLtBundles: { ...f.state, bundles: [{ ...f.state.bundles[0], activeRevisionId: null }] } }] });
    const apply = vi.fn(() => "empty");
    await expect(hydrateStudioLinked3dPassCloudProject({ workId: "work-remote", project, apply })).resolves.toBe("empty");
    for (const manifest of f.state.bundles[0].revisions) expect(await f.target.ownerRefs(`studio-bg3d-sixpass:page-1:bundle-1:${manifest.renderRevisionId}`)).toHaveLength(8);
    expect(apply).toHaveBeenCalledOnce(); expect(ports.download).not.toHaveBeenCalled();
  });
  it.each(["remote-failure", "wrong-png", "stale-apply", "line-owner-failure"])("%s는 원고를 성공으로 반영하지 않고 두 owner 권위를 보상한다", async (reason) => {
    const f = await remoteFixture(); const apply = vi.fn(() => reason === "stale-apply" ? false : "unexpected");
    if (reason === "remote-failure") ports.hydrate.mockRejectedValueOnce(new Error("원격 봉인 불일치"));
    if (reason === "wrong-png") vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 2, height: 1, close: vi.fn() })));
    if (reason === "line-owner-failure") vi.spyOn(f.line, "setOwnerRefs").mockRejectedValueOnce(new Error("owner 실패"));
    await expect(hydrateStudioBg3dSixPassCloudProject({ workId: "work-remote", project: f.project, apply })).rejects.toThrow();
    expect(apply).toHaveBeenCalledTimes(reason === "stale-apply" ? 1 : 0);
    for (const manifest of f.state.bundles[0].revisions) expect(await f.target.ownerRefs(`studio-bg3d-sixpass:page-1:bundle-1:${manifest.renderRevisionId}`)).toEqual([]);
    for (const ref of collectStudioLinked3dPassProjectArchiveReferences(f.project)) expect(await f.line.ownerRefs(ref.ownerId)).toEqual([]);
  });
  it("복원 중 취소되면 원고와 owner를 적용하지 않는다", async () => {
    const f = await remoteFixture(); const controller = new AbortController(), hydrate = ports.hydrate.getMockImplementation()!;
    ports.hydrate.mockImplementation(async (input) => { await hydrate(input); controller.abort(); });
    const apply = vi.fn(); await expect(hydrateStudioBg3dSixPassCloudProject({ workId: "work-remote", project: f.project, signal: controller.signal, apply })).rejects.toThrow();
    expect(apply).not.toHaveBeenCalled(); expect(ports.hydrate).toHaveBeenCalledOnce();
  });
});
