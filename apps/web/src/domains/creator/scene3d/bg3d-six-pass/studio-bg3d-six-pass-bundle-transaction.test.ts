import { hashStudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { beforeEach, expect, it, vi } from "vitest";
import { createBg3dBundleProjectFixture, createBg3dBundleTestAuthority } from "../../bg3d/studio-bg3d-bundle-project.test-fixture";
import { alignStudioBg3dSixPassPreparedLinePass, commitStudioBg3dSixPassPreparedBundle, preflightStudioBg3dSixPassPageCommit, prepareStudioBg3dSixPassBundle } from "./studio-bg3d-six-pass-bundle-transaction";
import { prepareStudioLinked3dLinePass, validateStudioLinked3dPassRevisionDescriptor } from "../../studio-linked-3d-pass-transaction";
import { StudioCrdtDocument } from "../../live/studio-crdt-document";
import { publishStudioCrdtSceneGraphDiff } from "../../live/studio-crdt-scene-publisher";
import type { PageState } from "../../studio-page-state";
import type { StudioBackground3DInsertResult } from "../../scene-3d/studio-3d-insert-contract";

vi.mock("./studio-bg3d-six-pass-bundle-product-authority", () => ({
  runStudioBg3dSixPassBundleMutationExclusive: async (_scope: string, task: () => Promise<unknown>) => task(),
}));
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() }))); });
async function fixture(retainPrevious = false) {
  const source = await createBg3dBundleProjectFixture(retainPrevious), authority = createBg3dBundleTestAuthority();
  const layers = [];
  for (const layer of source.manifest.layers) {
    const bytes = await source.authority.get(layer.artifact.contentHash);
    if (!bytes) throw new Error("fixture PNG가 없습니다.");
    layers.push({ role: layer.role, width: 1, height: 1, blendMode: "normal" as const, opacity: layer.opacity,
      pngDataUrl: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}` });
  }
  const result: StudioBackground3DInsertResult = { kind: "separated", width: 1, height: 1, bg3dScene: source.scene, layers,
    compositePngDataUrl: layers[0].pngDataUrl, perspectiveGuides: [] };
  const input = { authority, result, scene: source.scene, elements: source.project.pagesList[0].elements,
    pageId: source.manifest.pageId, bundleId: source.manifest.bundleId, groupId: source.manifest.groupId,
    anchorElementId: source.manifest.anchorElementId, renderRevisionId: "revision-prepared" };
  return { ...source, sourceAuthority: source.authority, authority, input };
}
it("일곱 원본과 manifest를 재읽은 뒤에만 6개 지속 locator·역할·artist presentation을 준비한다", async () => {
  const { authority, input } = await fixture(), prepared = await prepareStudioBg3dSixPassBundle(input);
  expect(prepared.retainedHashes).toHaveLength(8);
  expect(prepared.receipt).toMatchObject({ scope: "origin", state: "sealed" });
  expect(prepared.elements.every((entry) => entry.type === "image" && entry.opacity === .5 && entry.hidden && entry.blendMode === "multiply")).toBe(true);
  expect(prepared.elements.filter((entry) => entry.type === "image" && entry.src.startsWith("bg3d-lt-artifact://"))).toHaveLength(5);
  expect(await authority.ownerRefs(prepared.ownerId)).toEqual([]);
  const apply = vi.fn(() => true);
  expect(await commitStudioBg3dSixPassPreparedBundle({ authority, prepared, apply })).toBe(true);
  expect(apply).toHaveBeenCalledOnce(); expect(await authority.ownerRefs(prepared.ownerId)).toHaveLength(8);
});
it.each([false, new Error("document rejected")])("원고 거부·예외에서는 기존 owner snapshot을 복구한다 (%s)", async (result) => {
  const { authority, input } = await fixture(), prepared = await prepareStudioBg3dSixPassBundle(input);
  await authority.setOwnerRefs(prepared.ownerId, [prepared.manifest.scene.contentHash]);
  const before = await authority.ownerRefs(prepared.ownerId);
  const operation = commitStudioBg3dSixPassPreparedBundle({ authority, prepared, apply: () => { if (result instanceof Error) throw result; return result; } });
  if (result instanceof Error) await expect(operation).rejects.toThrow("document rejected"); else expect(await operation).toBe(false);
  expect(await authority.ownerRefs(prepared.ownerId)).toEqual(before);
});
it("누락·손상 PNG를 원고 commit 전 거부한다", async () => {
  const { input } = await fixture();
  await expect(prepareStudioBg3dSixPassBundle({ ...input, result: { ...input.result, layers: input.result.layers.slice(1) } })).rejects.toThrow(/여섯/);
  await expect(prepareStudioBg3dSixPassBundle({ ...input, result: { ...input.result, layers: input.result.layers.map((layer, index) => index ? layer : { ...layer, pngDataUrl: "data:image/png;base64,AAAA" }) } })).rejects.toThrow();
});

it("1→2 후 실행 취소된 1에서 재캡처해도 보존 tip 2를 부모로 삼고 선화 번호는 3으로 진행한다", async () => {
  const f = await fixture(true), bundle = f.state.bundles[0], first = bundle.revisions[0], tip = bundle.revisions[1];
  const layers = [];
  for (const layer of first.layers) {
    const sourceBytes = await f.sourceAuthority.get(layer.artifact.contentHash);
    if (!sourceBytes) throw new Error("undo 원본 PNG가 없습니다.");
    layers.push({ role: layer.role, width: 1, height: 1, pngDataUrl: `data:image/png;base64,${Buffer.from(sourceBytes).toString("base64")}` });
  }
  const prepared = await prepareStudioBg3dSixPassBundle({ ...f.input, result: { ...f.input.result, layers }, linePassRevision: 2,
    previousState: { ...f.state, bundles: [{ ...bundle, activeRevisionId: first.renderRevisionId }] } });
  expect(prepared.manifest.parentRevisionId).toBe(tip.renderRevisionId);
  expect(prepared.manifest.linePassRevision).toBe(3);
  expect(prepared.manifest.layers.at(-1)?.artifact.contentHash).toBe(first.layers.at(-1)?.artifact.contentHash);
  expect(prepared.state.bundles[0].revisions).toHaveLength(3);
});
it("실행 취소 후에도 보존 tip과 장면·main PNG가 같으면 선화 번호를 유지하고 첫 native는 legacy 번호를 승계한다", async () => {
  const f = await fixture(true), bundle = f.state.bundles[0], tip = bundle.revisions[1];
  const prepared = await prepareStudioBg3dSixPassBundle({ ...f.input, linePassRevision: 1,
    previousState: { ...f.state, bundles: [{ ...bundle, activeRevisionId: bundle.revisions[0].renderRevisionId }] } });
  expect(prepared.manifest.parentRevisionId).toBe(tip.renderRevisionId);
  expect(prepared.manifest.linePassRevision).toBe(tip.linePassRevision);
  const first = await fixture();
  expect((await prepareStudioBg3dSixPassBundle({ ...first.input, linePassRevision: 9 })).manifest.linePassRevision).toBe(9);
});

it("두 보존 분기가 있으면 활성 포인터로 부모를 임의 선택하지 않고 저장 전에 거부한다", async () => {
  const f = await fixture(true), bundle = f.state.bundles[0], tip = bundle.revisions[1];
  const fork = { ...tip, renderRevisionId: "revision-fork" };
  await expect(prepareStudioBg3dSixPassBundle({ ...f.input,
    previousState: { ...f.state, bundles: [{ ...bundle, activeRevisionId: bundle.revisions[0].renderRevisionId,
      revisions: [...bundle.revisions, fork] }] } })).rejects.toThrow(/분기|마지막/);
  expect(await f.authority.owners()).toEqual([]);
});

it("native 선화 번호 보정은 검증된 동일 장면·PNG의 새 descriptor만 만들고 기존 준비본은 보존한다", async () => {
  const f = await fixture(true);
  const line = await prepareStudioLinked3dLinePass({ authority: f.authority, sourceHash: f.manifest.scene.contentHash,
    scene: f.scene, layers: f.input.result.layers });
  const bundle = await prepareStudioBg3dSixPassBundle({ ...f.input, linePassRevision: line.descriptor.revision, previousState: f.state });
  const aligned = alignStudioBg3dSixPassPreparedLinePass(line, bundle.manifest, f.scene);
  expect(line.descriptor.revision).toBe(1);
  expect(aligned.descriptor.revision).toBe(2);
  expect(aligned).not.toBe(line);
  expect(aligned.descriptor.artifact).toBe(line.descriptor.artifact);
  expect(aligned.originalDataUrl).toBe(line.originalDataUrl);
  expect(aligned.descriptor.passRootHash).not.toBe(line.descriptor.passRootHash);
  expect(validateStudioLinked3dPassRevisionDescriptor(aligned.descriptor)).toBe(true);
  expect(() => alignStudioBg3dSixPassPreparedLinePass({ ...line, descriptor: { ...line.descriptor, sceneHash: `sha256:${"f".repeat(64)}` } }, bundle.manifest, f.scene)).toThrow(/선화/);
});

it.each([false, new Error("복구 원고 거부")])("복구된 orphan owner도 원고 거부 시 이전 참조를 정확히 복구한다 (%s)", async (rejected) => {
  const f = await fixture(true), orphan = f.manifest;
  for (const hash of [orphan.scene.contentHash, ...orphan.layers.map(({ artifact }) => artifact.contentHash), hashStudioBg3dSixPassBundleManifest(orphan)]) {
    const bytes = await f.sourceAuthority.get(hash, { verify: true });
    if (!bytes) throw new Error("복구 원본이 없습니다.");
    await f.authority.put(bytes);
  }
  const prepared = await prepareStudioBg3dSixPassBundle({ ...f.input, previousState: f.state });
  const restoredOwner = `studio-bg3d-sixpass:${orphan.pageId}:${orphan.bundleId}:${orphan.renderRevisionId}`;
  await f.authority.setOwnerRefs(restoredOwner, [orphan.scene.contentHash]);
  const before = await f.authority.ownerRefs(restoredOwner);
  const operation = commitStudioBg3dSixPassPreparedBundle({ authority: f.authority, prepared, restoredManifests: [orphan], apply: async () => {
    expect(await f.authority.ownerRefs(restoredOwner)).toHaveLength(8);
    if (rejected instanceof Error) throw rejected;
    return rejected;
  } });
  if (rejected instanceof Error) await expect(operation).rejects.toThrow("복구 원고 거부");
  else expect(await operation).toBe(false);
  expect(await f.authority.ownerRefs(restoredOwner)).toEqual(before);
  expect(await f.authority.ownerRefs(prepared.ownerId)).toEqual([]);
});

it("실제 CRDT에 다른 페이지가 있는데 전체 history 권위가 없으면 부분 snapshot으로 봉인하지 않는다", async () => {
  const f = await fixture(), page: PageState = f.project.pagesList[0];
  const other: PageState = { id: "other-page", elements: [], bg: "#fff", bgGrad: null, canvasH: 1080 };
  const document = new StudioCrdtDocument();
  try {
    publishStudioCrdtSceneGraphDiff(document, [], [page, other]);
    const before = document.encodeStateAsUpdate();
    await expect(preflightStudioBg3dSixPassPageCommit({ document, pages: [page], nextPage: page })).rejects.toThrow("전체 페이지 검증 경로");
    expect(document.encodeStateAsUpdate()).toEqual(before);
    await expect(preflightStudioBg3dSixPassPageCommit({ document, pages: [page, other], nextPage: page })).resolves.toBeUndefined();
    expect(document.encodeStateAsUpdate()).toEqual(before);
  } finally { document.destroy(); }
});
