import type { PageState } from "../../studio-page-state";
import type { El } from "../../studio-element-model";
import { beforeEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createBg3dBundleProjectFixture, createBg3dBundleTestAuthority } from "../../bg3d/studio-bg3d-bundle-project.test-fixture";
import type { StudioOpfsAssetStore } from "../../studio-opfs-asset-store";
import { hydrateStudioBg3dSixPassFrontier } from "./studio-bg3d-six-pass-bundle-hydration";
import { StudioCrdtDocument } from "../../live/studio-crdt-document";
import { asStudioCrdtDocumentHost } from "../../live/studio-crdt-document-host";
import { publishStudioCrdtSceneGraphDiff } from "../../live/studio-crdt-scene-publisher";
import { reconcileStudioCrdtSceneGraphPages } from "../../live/studio-crdt-page-bridge";

let bundleAuthority: StudioOpfsAssetStore, lineAuthority: StudioOpfsAssetStore;
vi.mock("./studio-bg3d-six-pass-bundle-product-authority", () => ({
  acquireStudioBg3dSixPassBundleProductAuthority: async () => bundleAuthority,
  runStudioBg3dSixPassBundleMutationExclusive: async (_scope: string, task: () => Promise<unknown>) => task(),
}));
vi.mock("../../studio-linked-3d-pass-product-authority", () => ({ acquireStudioLinked3dPassProductAuthority: async () => lineAuthority }));
beforeEach(() => vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() }))));
async function fixture() {
  const f = await createBg3dBundleProjectFixture(); bundleAuthority = f.authority; lineAuthority = createBg3dBundleTestAuthority();
  const author = new StudioCrdtDocument(), peer = new StudioCrdtDocument();
  const page: PageState = { ...f.project.pagesList[0], groups: [{ id: "group-1", name: "6패스" }],
    elements: f.project.pagesList[0].elements.map((el) => el.type === "image" ? { ...el, bg3dLtRenderMode: "separated" as const } : el) };
  publishStudioCrdtSceneGraphDiff(author, [], [page]);
  Y.applyUpdate(asStudioCrdtDocumentHost(peer).doc, Y.encodeStateAsUpdate(asStudioCrdtDocumentHost(author).doc));
  const frontier = { pages: peer.getPages(true), strokes: peer.getStrokes({ includeDeleted: true }),
    sceneElements: peer.getSceneElements({ includeDeleted: true }), layerGroups: peer.getLayerGroups({ includeDeleted: true }) };
  return { f, author, peer, page, frontier };
}
it("수신 탭은 일곱 원본 검증 후 여섯 이미지·원본 scene·기존 선화 index를 함께 복원한다", async () => {
  const { f, author, peer, page, frontier } = await fixture();
  const hydrated = await hydrateStudioBg3dSixPassFrontier(frontier, null);
  expect(hydrated.sources.size).toBe(6);
  expect(hydrated.frontier.pages[0].bg3dLtBundles).toEqual(f.state);
  expect(hydrated.frontier.pages[0].linked3dRender).toEqual(page.linked3dRender);
  const base: PageState = { ...page, elements: [], groups: [], shared3dStage: undefined, linked3dRender: undefined, bg3dLtBundles: undefined };
  const reconciled = reconcileStudioCrdtSceneGraphPages<El, PageState>([base], hydrated.frontier.strokes, hydrated.frontier.sceneElements,
    hydrated.frontier.pages, hydrated.frontier.layerGroups, undefined, hydrated.sources);
  expect(reconciled.pages[0].elements).toHaveLength(6);
  expect(reconciled.pages[0].elements.map((el) => ({ type: el.type, opacity: el.opacity, hidden: el.hidden, blendMode: el.blendMode }))).toEqual(Array.from({ length: 6 }, () => ({ type: "image", opacity: .5, hidden: true, blendMode: "multiply" })));
  const anchor = hydrated.sources.get(f.manifest.anchorElementId)!;
  expect(anchor.bg3dScene).toEqual(f.scene);
  expect(await lineAuthority.get(f.manifest.layers.find(({ role }) => role === "main-line")!.artifact.contentHash)).toBeTruthy();
  author.destroy(); peer.destroy();
});
it("본문 하나가 없으면 부분 frontier를 반환하지 않는다", async () => {
  const { f, author, peer, frontier } = await fixture();
  await bundleAuthority.delete(f.manifest.layers[2].artifact.contentHash);
  await expect(hydrateStudioBg3dSixPassFrontier(frontier, null)).rejects.toThrow(/누락/);
  expect(peer.getSceneElements()).toHaveLength(6); // Y 참조는 유지하고 표시 원본을 만들지 않는다.
  author.destroy(); peer.destroy();
});

it("재캡처 수신 때 이전 local anchor scene이 검증된 새 scene을 덮어쓰지 않는다", async () => {
  const { f, author, peer, page, frontier } = await fixture();
  const oldAnchor = page.elements.find((entry) => entry.type === "image" && entry.id === f.manifest.anchorElementId)!;
  if (oldAnchor.type !== "image" || !oldAnchor.bg3dLtBundleReference) throw new Error("fixture anchor가 없습니다.");
  const nextReference = { ...oldAnchor.bg3dLtBundleReference, renderRevisionId: "revision-next", manifestHash: `sha256:${"f".repeat(64)}` as const };
  const nextScene = { ...f.scene, camera: { ...f.scene.camera, position: [5, 6, 7] as [number, number, number] } };
  const source = { ...oldAnchor, bg3dScene: nextScene, bg3dLtBundleReference: nextReference };
  const records = frontier.sceneElements.map((record) => record.id === oldAnchor.id ? { ...record, payload: { ...record.payload,
    props: { ...record.payload.props, bg3dLtBundleReference: nextReference } } } : record);
  const reconciled = reconcileStudioCrdtSceneGraphPages<El, PageState>([page], [], records, frontier.pages, frontier.layerGroups, undefined, new Map([[oldAnchor.id, source]]));
  const next = reconciled.pages[0].elements.find((entry) => entry.id === oldAnchor.id);
  expect(next?.type === "image" && next.bg3dScene?.camera.position).toEqual([5, 6, 7]);
  expect(next?.type === "image" && next.bg3dLtBundleReference?.renderRevisionId).toBe("revision-next");
  expect(next?.opacity).toBe(.5); author.destroy(); peer.destroy();
});
