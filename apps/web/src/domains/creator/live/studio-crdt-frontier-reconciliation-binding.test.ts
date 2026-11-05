import { beforeEach, expect, it, vi } from "vitest";
import type { StudioCrdtSceneGraphFrontier, StudioCrdtSceneGraphChangedIds } from "./studio-crdt-history";
import type { StudioCrdtSceneGraphRuntime } from "./StudioLiveCollaborationProvider";
import { StudioCrdtDocument } from "./studio-crdt-document";
import type { PageState } from "../studio-page-state";
import { bindStudioCrdtFrontierReconciliation, readStudioCrdtBoundPageSnapshot } from "./studio-crdt-frontier-reconciliation-binding";

const { offline, hydrate } = vi.hoisted(() => ({ offline: { read: vi.fn(), reconcile: vi.fn(), subscribe: vi.fn() }, hydrate: vi.fn() }));
vi.mock("../offline-branch/studio-offline-host-integration", () => ({ studioOfflineDocumentFrontier: offline.read,
  reconcileStudioOfflineCrdtFrontier: offline.reconcile, subscribeStudioOfflineDocumentFrontier: offline.subscribe }));
vi.mock("../scene3d/bg3d-six-pass/studio-bg3d-six-pass-bundle-hydration", () => ({ hydrateStudioBg3dSixPassFrontier: hydrate }));
vi.mock("../studio-legacy-editor-runtime-helpers", () => ({ readyStudioWorkAssetImageSources: () => new Map() }));
const empty: StudioCrdtSceneGraphFrontier = { pages: [], strokes: [], sceneElements: [], layerGroups: [] };
const bundle: StudioCrdtSceneGraphFrontier = { ...empty, pages: [{ id: "page-1", deleted: false, orderIndex: 0,
  payload: { version: 1, props: {} }, bg3dLtBundleReferences: { version: 1, minimumProjectVersion: 5,
    minimumReaderCapability: "bg3d-sixpass-bundle.v1", revisions: [], active: {} } }] };
beforeEach(() => { vi.clearAllMocks(); offline.subscribe.mockReturnValue(vi.fn()); offline.reconcile.mockReturnValue(null); });
function fixture() {
  const document = new StudioCrdtDocument();
  const runtime = {} as StudioCrdtSceneGraphRuntime;
  const history: PageState[][] = [[]];
  const input = { document, runtimeRef: { current: runtime }, mountedRef: { current: true },
    pagesHistoryRef: { current: history }, pagesHiRef: { current: 0 }, revisionRef: { current: 0 }, accessRef: { current: { documentGeneration: 0 } },
    hydrator: { readySources: () => new Map() }, workId: null, reportError: vi.fn(), rebase: vi.fn(), setHistory: vi.fn(), setReconciled: vi.fn() };
  return { input, document };
}
it("일반 v8 문서의 최초 projection과 편집 준비는 동기적으로 완료한다", () => {
  const { input, document } = fixture(); offline.read.mockReturnValue(empty);
  const stop = bindStudioCrdtFrontierReconciliation(input);
  expect(offline.reconcile).toHaveBeenCalledOnce(); expect(input.setReconciled).toHaveBeenCalledWith(document);
  expect(hydrate).not.toHaveBeenCalled(); stop(); document.destroy();
});
it("6패스는 전체 hydration 완료 전 편집 준비·history 적용이 없고 완료 후 한 번 적용한다", async () => {
  const { input, document } = fixture(); offline.read.mockReturnValue(bundle);
  let resolve!: (result: { frontier: StudioCrdtSceneGraphFrontier; sources: Map<string, never> }) => void;
  hydrate.mockReturnValue(new Promise((done) => { resolve = done; }));
  const stop = bindStudioCrdtFrontierReconciliation(input);
  expect(offline.reconcile).not.toHaveBeenCalled(); expect(input.setReconciled).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(hydrate).toHaveBeenCalledOnce());
  resolve({ frontier: bundle, sources: new Map<string, never>() });
  await vi.waitFor(() => expect(offline.reconcile).toHaveBeenCalledOnce());
  expect(input.setReconciled).toHaveBeenCalledOnce(); stop(); document.destroy();
});
it("복원 실패 또는 작업 문서 교체 뒤 지연 응답은 history를 적용하지 않는다", async () => {
  const { input, document } = fixture(); offline.read.mockReturnValue(bundle); hydrate.mockRejectedValue(new Error("missing shadow"));
  const stop = bindStudioCrdtFrontierReconciliation(input);
  await vi.waitFor(() => expect(input.reportError).toHaveBeenCalledWith("missing shadow"));
  expect(offline.reconcile).not.toHaveBeenCalled(); expect(input.setReconciled).not.toHaveBeenCalled(); stop(); document.destroy();
});

it("봉인 전 검사도 동일 history 권위의 전체 pages와 현재 index를 읽고 해제 시 참조를 지운다", () => {
  const { input, document } = fixture(); offline.read.mockReturnValue(empty);
  const page: PageState = { id: "page-one", elements: [], bg: "#fff", bgGrad: null, canvasH: 1080 };
  input.pagesHistoryRef.current = [[page]];
  expect(readStudioCrdtBoundPageSnapshot(document)).toBeNull();
  const stop = bindStudioCrdtFrontierReconciliation(input);
  expect(readStudioCrdtBoundPageSnapshot(document)).toBe(input.pagesHistoryRef.current[0]);
  input.pagesHistoryRef.current.push([page, { ...page, id: "page-two" }]); input.pagesHiRef.current = 1;
  expect(readStudioCrdtBoundPageSnapshot(document)).toBe(input.pagesHistoryRef.current[1]);
  stop(); expect(readStudioCrdtBoundPageSnapshot(document)).toBeNull(); document.destroy();
});

function changes(id: string): StudioCrdtSceneGraphChangedIds {
  return { strokeIds: new Set([`stroke-${id}`]), sceneElementIds: new Set([`element-${id}`]),
    pageIds: new Set([`page-${id}`]), layerGroupIds: new Set([`group-${id}`]) };
}
function delayedHydration() {
  const pending: { resolve(): void; reject(error: Error): void }[] = [];
  hydrate.mockImplementation((frontier: StudioCrdtSceneGraphFrontier) => new Promise((resolve, reject) => {
    pending.push({ resolve: () => resolve({ frontier, sources: new Map() }), reject });
  }));
  return pending;
}
function onFrontier(): (frontier: StudioCrdtSceneGraphFrontier, changedIds: StudioCrdtSceneGraphChangedIds | null) => void {
  return offline.subscribe.mock.calls[0]![2];
}

it("최초 전체 복원을 생략해도 다음 frontier의 이력 재조정 범위는 null을 유지한다", async () => {
  const { input, document } = fixture(); offline.read.mockReturnValue(bundle);
  const pending = delayedHydration(), stop = bindStudioCrdtFrontierReconciliation(input);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  onFrontier()(bundle, changes("a"));
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  pending[1]!.resolve();
  await vi.waitFor(() => expect(offline.reconcile).toHaveBeenCalledOnce());
  expect(offline.reconcile.mock.calls[0]![0].changedIds).toBeNull();
  pending[0]!.resolve(); await new Promise((resolve) => setTimeout(resolve, 0));
  expect(offline.reconcile).toHaveBeenCalledOnce(); stop(); document.destroy();
});

it("복원 실패 뒤 다음 frontier가 네 종류의 미반영 변경 ID를 함께 적용한다", async () => {
  const { input, document } = fixture(); offline.read.mockReturnValue(empty);
  const pending = delayedHydration(), stop = bindStudioCrdtFrontierReconciliation(input);
  offline.reconcile.mockClear();
  onFrontier()(bundle, changes("a"));
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  pending[0]!.reject(new Error("missing body"));
  await vi.waitFor(() => expect(input.reportError).toHaveBeenCalledWith("missing body"));
  onFrontier()(bundle, changes("b"));
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  pending[1]!.resolve();
  await vi.waitFor(() => expect(offline.reconcile).toHaveBeenCalledOnce());
  expect(offline.reconcile.mock.calls[0]![0].changedIds).toEqual({
    strokeIds: new Set(["stroke-a", "stroke-b"]), sceneElementIds: new Set(["element-a", "element-b"]),
    pageIds: new Set(["page-a", "page-b"]), layerGroupIds: new Set(["group-a", "group-b"]),
  });
  // 적용 뒤 새 원격 변경에 이전 ID가 남아 로컬 undo 범위를 넓히지 않는다.
  onFrontier()(empty, changes("c"));
  expect(offline.reconcile.mock.calls[1]![0].changedIds).toEqual(changes("c")); stop(); document.destroy();
});

it("번들이 없는 frontier가 복원을 추월해도 미반영 ID를 반영하고 늦은 복원 결과를 버린다", async () => {
  const { input, document } = fixture(); offline.read.mockReturnValue(empty);
  const pending = delayedHydration(), stop = bindStudioCrdtFrontierReconciliation(input);
  offline.reconcile.mockClear();
  onFrontier()(bundle, changes("a"));
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  onFrontier()(empty, changes("b"));
  expect(offline.reconcile.mock.calls[0]![0].changedIds.sceneElementIds).toEqual(new Set(["element-a", "element-b"]));
  pending[0]!.resolve(); await new Promise((resolve) => setTimeout(resolve, 0));
  expect(offline.reconcile).toHaveBeenCalledOnce(); stop(); document.destroy();
});
