import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createStudioBg3dSixPassBundleReceipt, hashStudioBg3dSixPassBundleManifest, parseStudioBg3dSixPassBundleManifest,
  STUDIO_BG3D_SIX_PASS_ROLES, type StudioBg3dSixPassBundleManifest } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { StudioCrdtDocument } from "../live/studio-crdt-document";
import { publishStudioCrdtSceneGraphDiff } from "../live/studio-crdt-scene-publisher";
import { upsertStudioLinked3dRenderLink } from "../studio-linked-3d-render-document";
import { bindStudioBg3dRenderedImage } from "../studio-cuttoon-editor/studio-cuttoon-bg3d-insert";
import { createBg3dBundleProjectFixture, createBg3dBundleTestAuthority } from "./studio-bg3d-bundle-project.test-fixture";
import { createDefaultStudioBg3dSceneDocument, normalizeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { StudioOpfsAssetStore } from "../studio-opfs-asset-store";
import type { PageState } from "../studio-page-state";
import type { El } from "../studio-element-model";
import type { StudioBackground3DInsertResult } from "../scene-3d/studio-3d-insert-contract";

const { remoteGet, remotePut } = vi.hoisted(() => ({ remoteGet: vi.fn(), remotePut: vi.fn() }));
vi.mock("@/platform/api", () => ({ api: { raw: { get: remoteGet, put: remotePut } }, apiPath: (value: string) => `/api${value}` }));
let lineAuthority: StudioOpfsAssetStore, bundleAuthority: StudioOpfsAssetStore;
vi.mock("../studio-linked-3d-pass-product-authority", () => ({ acquireStudioLinked3dPassProductAuthority: async () => lineAuthority }));
vi.mock("../scene3d/bg3d-six-pass/studio-bg3d-six-pass-bundle-product-authority", () => ({ acquireStudioBg3dSixPassBundleProductAuthority: async () => bundleAuthority,
  runStudioBg3dSixPassBundleMutationExclusive: async (_scope: string, task: () => Promise<unknown>) => task() }));
beforeEach(() => { remoteGet.mockReset(); remotePut.mockReset(); vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() }))); });
afterEach(() => vi.unstubAllGlobals());
async function fixture(recapture = false) {
  const source = await createBg3dBundleProjectFixture();
  lineAuthority = recapture ? source.authority : createBg3dBundleTestAuthority();
  bundleAuthority = recapture ? source.authority : createBg3dBundleTestAuthority();
  const layers = [];
  for (const layer of source.manifest.layers) {
    const bytes = await source.authority.get(layer.artifact.contentHash);
    if (!bytes) throw new Error("회귀 PNG 원본이 없습니다.");
    layers.push({ role: layer.role, width: 1, height: 1, pngDataUrl: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}` });
  }
  const result: StudioBackground3DInsertResult = { kind: "separated", width: 1, height: 1, layers,
    compositePngDataUrl: layers[0].pngDataUrl, perspectiveGuides: [], bg3dScene: source.scene };
  let page: PageState = recapture ? source.project.pagesList[0] : { ...source.project.pagesList[0], elements: [], groups: [],
    bg3dLtBundles: undefined, shared3dStage: undefined, linked3dRender: undefined };
  let accepted: boolean | Error = true, currentPageId = page.id;
  let document: StudioCrdtDocument | null = null;
  const commit = vi.fn((elements: El[], patch: Partial<PageState>) => {
    if (accepted instanceof Error) throw accepted;
    if (!accepted) return false;
    page = { ...page, ...patch, elements }; return true;
  });
  const setError = vi.fn();
  const bind = (realtime = true, workId?: string) => bindStudioBg3dRenderedImage({ setError, setStatusNotice: vi.fn(), elementById: new Map(page.elements.map((element) => [element.id, element])),
    groups: page.groups ?? [], canvasH: page.canvasH, isRealtimeTeamSession: realtime, elements: page.elements, activePage: page,
    bg3dDccSourceRef: { current: null }, commit, setSelectedId: vi.fn(), setTool: vi.fn(), announceDrawingShortcut: vi.fn(),
    masterEditMode: false, pageEditLocked: false, currentStudioDrawingAssistDocument: () => null,
    bg3dDccShotMappingsRef: { current: [] }, bg3dMutationTicketRef: { current: { test: "authorized-unit-scope" } }, canApplyStudioMutation: () => true,
    currentPageIdRef: { get current() { return currentPageId; } }, authorizedWorkAssetScopeId: workId, studioAuthUserId: undefined,
    studioCrdtDocumentRef: { get current() { return document; } }, studioCrdtSceneRuntimeRef: { current: null }, setDrawingAssistPreview: vi.fn() });
  return { ...source, result, commit, setError, bind, read: () => page, reject: () => { accepted = false; }, navigate: () => { currentPageId = "other-page"; },
    restore: (next: PageState) => { page = next; }, accept: () => { accepted = true; },
    throwCommit: () => { accepted = new Error("원고 commit 예외"); }, setDocument: (value: StudioCrdtDocument) => { document = value; } };
}
it("기본 도형 6패스는 realtime에서도 실제 일곱 CAS 원본·두 owner·원고 한 commit으로 들어간다", async () => {
  const f = await fixture(); expect(await f.bind()(f.result)).toBe(true);
  expect(f.commit).toHaveBeenCalledOnce(); expect(f.setError).toHaveBeenLastCalledWith(null);
  const page = f.read(), bundle = page.bg3dLtBundles?.bundles[0], revision = bundle?.revisions[0];
  expect(page.elements).toHaveLength(6); expect(bundle?.activeRevisionId).toBe(revision?.renderRevisionId);
  if (!revision) throw new Error("6패스 실제 원고 영수증이 없습니다.");
  for (const artifact of [revision.scene, ...revision.layers.map((layer) => layer.artifact)]) expect(await bundleAuthority.get(artifact.contentHash, { verify: true })).not.toBeNull();
  expect(await bundleAuthority.ownerRefs(`studio-bg3d-sixpass:${page.id}:${bundle.bundleId}:${revision.renderRevisionId}`)).toHaveLength(8);
  expect(await lineAuthority.ownerRefs(`studio-linked-3d-pass:${page.id}:${bundle.bundleId}`)).toHaveLength(1);
  expect(page.elements.every((element) => element.type === "image" && element.bg3dLtBundleReference?.renderRevisionId === revision.renderRevisionId)).toBe(true);
});
it("recapture는 여섯 stable ID·그룹·artist 표현과 이전 원본을 유지한다", async () => {
  const f = await fixture(true), before = f.read(), ids = before.elements.map((element) => element.id);
  expect(await f.bind()(f.result, f.manifest.anchorElementId)).toBe(true);
  const after = f.read(), bundle = after.bg3dLtBundles?.bundles[0];
  expect(after.elements.map((element) => element.id)).toEqual(ids); expect(after.groups).toEqual(before.groups);
  expect(after.elements.every((element) => element.type === "image" && element.opacity === .5 && element.hidden && element.blendMode === "multiply")).toBe(true);
  expect(bundle?.revisions).toHaveLength(2); expect(bundle?.revisions[1].parentRevisionId).toBe(f.manifest.renderRevisionId);
  expect(bundle?.revisions[1].linePassRevision).toBe(before.linked3dRender?.links[0].passRevision?.revision);
});
it.each(["document-rejected", "navigated"])("%s이면 native owner는 복구되고 원고가 바뀌지 않는다", async (reason) => {
  const f = await fixture(true), before = f.read();
  const lineOwner = `studio-linked-3d-pass:${before.id}:${f.manifest.bundleId}`;
  const lineRefs = await lineAuthority.ownerRefs(lineOwner), bundleOwners = await bundleAuthority.owners();
  if (reason === "document-rejected") f.reject(); else f.navigate();
  expect(await f.bind()(f.result, f.manifest.anchorElementId)).toBe(false); expect(f.read()).toBe(before);
  expect(await lineAuthority.ownerRefs(lineOwner)).toEqual(lineRefs);
  for (const owner of (await bundleAuthority.owners()).filter((owner) => !bundleOwners.includes(owner))) expect(await bundleAuthority.ownerRefs(owner)).toEqual([]);
});
it.each(["ordinary-lt", "unlink"])("native 6패스의 %s 전환은 기존 문서·원본 변경 전에 명시 거부한다", async (operation) => {
  const f = await fixture(true), base = createDefaultStudioBg3dSceneDocument(), before = f.read();
  const output = operation === "ordinary-lt" ? { ...f.result, bg3dScene: normalizeStudioBg3dSceneDocument({ ...f.scene, output: base.output }) }
    : { ...f.result, sharedStageMutation: { kind: "unlink" as const } };
  expect(await f.bind(false)(output, f.manifest.anchorElementId)).toBe(false);
  expect(f.commit).not.toHaveBeenCalled(); expect(f.read()).toBe(before);
  expect(f.setError).toHaveBeenLastCalledWith(expect.stringContaining("아직 지원하지 않습니다"));
});

it("실제 adapter의 1→2→실행 취소 1→재캡처는 마지막 보존 리비전 2와 선화 번호 3을 결박한다", async () => {
  const f = await fixture();
  expect(await f.bind()(f.result)).toBe(true);
  const first = f.read(), firstBundle = first.bg3dLtBundles?.bundles[0], initial = firstBundle?.revisions[0];
  if (!firstBundle || !initial) throw new Error("첫 native 원고가 없습니다.");
  const source = await createBg3dBundleProjectFixture(true), layers = [];
  for (const layer of source.manifest.layers) {
    const bytes = await source.authority.get(layer.artifact.contentHash);
    if (!bytes) throw new Error("두 번째 캡처 PNG가 없습니다.");
    layers.push({ role: layer.role, width: 1, height: 1, pngDataUrl: `data:image/png;base64,${Buffer.from(bytes).toString("base64")}` });
  }
  expect(await f.bind()({ ...f.result, layers }, initial.anchorElementId)).toBe(true);
  const second = f.read(), retained = second.bg3dLtBundles?.bundles[0], tip = retained?.revisions.at(-1);
  if (!retained || !tip || !second.bg3dLtBundles) throw new Error("두 번째 보존 원고가 없습니다.");
  f.restore({ ...first, bg3dLtBundles: { ...second.bg3dLtBundles, bundles: [{ ...retained, activeRevisionId: initial.renderRevisionId }] } });
  expect(await f.bind()(f.result, initial.anchorElementId)).toBe(true);
  const third = f.read(), revision = third.bg3dLtBundles?.bundles[0].revisions.at(-1);
  expect(revision?.parentRevisionId).toBe(tip.renderRevisionId);
  expect(revision?.linePassRevision).toBe(3);
  expect(third.linked3dRender?.links[0].passRevision.revision).toBe(3);
  expect(third.linked3dRender?.links[0].passRevision.artifact.contentHash).toBe(initial.layers.at(-1)?.artifact.contentHash);
  expect(third.elements.map((element) => element.id)).toEqual(first.elements.map((element) => element.id));
  expect(first.linked3dRender?.links[0].passRevision.revision).toBe(1);
  expect(second.linked3dRender?.links[0].passRevision.revision).toBe(2);
});

function remoteSealedChain(initial: StudioBg3dSixPassBundleManifest) {
  const revisions = [initial];
  const pending = new Map<string, { manifest: StudioBg3dSixPassBundleManifest; uploaded: string[] }>();
  const response = (manifest: StudioBg3dSixPassBundleManifest, sealed: boolean, uploaded: readonly string[]) => ({ json: async () => ({
    version: 1, workId: "work-one", state: sealed ? "sealed" : "prepared", manifest,
    manifestHash: hashStudioBg3dSixPassBundleManifest(manifest), sealedAt: sealed ? "2026-11-05T00:00:00Z" : null,
    receipt: sealed ? createStudioBg3dSixPassBundleReceipt(manifest, "work-one") : null, uploadedRoles: uploaded }) });
  remoteGet.mockImplementation(async (url: string) => {
    if (url.endsWith("/sealed-chain")) return { json: async () => ({ version: 1, workId: "work-one", bundleId: initial.bundleId,
      sealedTipRevisionId: revisions.at(-1)?.renderRevisionId ?? null, revisions }) };
    const id = /\/revisions\/([^/]+)/u.exec(url)?.[1];
    const manifest = revisions.find(({ renderRevisionId }) => renderRevisionId === id);
    if (!manifest) throw new Error("서버에 없는 봉인 원본입니다.");
    return response(manifest, true, ["scene", ...STUDIO_BG3D_SIX_PASS_ROLES]);
  });
  remotePut.mockImplementation(async (url: string, options: { json?: { manifest?: unknown }; body?: FormData }) => {
    const id = /\/revisions\/([^/]+)/u.exec(url)?.[1];
    if (!id) throw new Error("revision 경로가 없습니다.");
    if (options.json?.manifest) {
      const manifest = parseStudioBg3dSixPassBundleManifest(options.json.manifest);
      if (manifest.parentRevisionId !== revisions.at(-1)?.renderRevisionId) throw new Error("stale parent");
      pending.set(id, { manifest, uploaded: [] });
    }
    const record = pending.get(id);
    if (!record) throw new Error("준비된 원본이 없습니다.");
    const role = url.split("/artifacts/")[1];
    if (role) record.uploaded.push(role);
    const sealed = url.endsWith("/seal");
    if (sealed) {
      if (record.manifest.parentRevisionId !== revisions.at(-1)?.renderRevisionId || record.uploaded.length !== 7) throw new Error("봉인 경합 또는 본문 누락");
      revisions.push(record.manifest);
    }
    return response(record.manifest, sealed, record.uploaded);
  });
  return revisions;
}
it.each(["false", "throw"])("원격 봉인 후 local commit %s도 다음 명시적 적용에서 복구하여 저장한다", async (failure) => {
  const f = await fixture(true), before = f.read(), revisions = remoteSealedChain(f.manifest);
  if (failure === "false") f.reject(); else f.throwCommit();
  expect(await f.bind(true, "work-one")(f.result, f.manifest.anchorElementId)).toBe(false);
  expect(f.read()).toBe(before); expect(revisions).toHaveLength(2);
  const orphan = revisions[1], owner = `studio-bg3d-sixpass:${before.id}:${orphan.bundleId}:${orphan.renderRevisionId}`;
  expect(await bundleAuthority.ownerRefs(owner)).toEqual([]);
  f.accept();
  expect(await f.bind(true, "work-one")(f.result, f.manifest.anchorElementId)).toBe(true);
  const after = f.read(), bundle = after.bg3dLtBundles?.bundles[0];
  expect(revisions).toHaveLength(3); expect(bundle?.revisions).toHaveLength(3);
  expect(bundle?.revisions.at(-1)?.parentRevisionId).toBe(orphan.renderRevisionId);
  expect(bundle?.activeRevisionId).toBe(revisions[2].renderRevisionId);
  expect(after.elements.map(({ id }) => id)).toEqual(before.elements.map(({ id }) => id));
  expect(await bundleAuthority.ownerRefs(owner)).toHaveLength(8);
});
it("미게시 첫 native가 있는 legacy target도 서버의 stable 역할 ID를 복구해 저장한다", async () => {
  const f = await fixture(true), native = f.read(), revisions = remoteSealedChain(f.manifest);
  const elements = native.elements.filter((element) => element.type !== "image" || (element.bg3dLtRole !== "shadow" && element.bg3dLtRole !== "depth")).map((element) => {
    if (element.type !== "image") return element;
    const { bg3dLtBundleReference: _reference, ...legacy } = element;
    return legacy;
  });
  const descriptor = native.linked3dRender?.links[0].passRevision, shotId = f.scene.activeShotId;
  if (!descriptor || !native.shared3dStage || !shotId) throw new Error("legacy 연결 원고가 없습니다.");
  const linked3dRender = upsertStudioLinked3dRenderLink({ value: undefined, bundleId: f.manifest.bundleId,
    shotId, passRevision: descriptor, elements, shared3dStage: native.shared3dStage });
  if (!linked3dRender) throw new Error("legacy 네 역할의 연결을 만들지 못했습니다.");
  f.restore({ ...native, elements, linked3dRender, bg3dLtBundles: undefined });
  expect(await f.bind(true, "work-one")(f.result, f.manifest.anchorElementId)).toBe(true);
  expect(f.read().bg3dLtBundles?.bundles[0].revisions).toHaveLength(2);
  expect(revisions).toHaveLength(2);
  expect(f.read().elements.map(({ id }) => id)).toEqual(native.elements.map(({ id }) => id));
});

it("복구 전체가 CRDT 전이 예산을 넘으면 서버 seal 전에 실제 그림자 publisher가 거부한다", async () => {
  const f = await fixture(true), before = f.read(), revisions = remoteSealedChain(f.manifest);
  for (let index = 0; index < 160; index += 1) {
    const parent = revisions.at(-1);
    if (!parent) throw new Error("복구 부모가 없습니다.");
    revisions.push(parseStudioBg3dSixPassBundleManifest({ ...f.manifest,
      renderRevisionId: `orphan-${index}-${"r".repeat(75)}`, parentRevisionId: parent.renderRevisionId }));
  }
  const document = new StudioCrdtDocument();
  try {
    publishStudioCrdtSceneGraphDiff(document, [], [before]);
    f.setDocument(document);
    const original = document.encodeStateAsUpdate();
    expect(await f.bind(true, "work-one")(f.result, f.manifest.anchorElementId)).toBe(false);
    expect(remotePut).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled(); expect(f.read()).toBe(before);
    expect(f.setError).toHaveBeenLastCalledWith(expect.stringContaining("CRDT 메시지 예산"));
    expect(document.encodeStateAsUpdate()).toEqual(original);
  } finally { document.destroy(); }
});
