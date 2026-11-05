import { afterEach, expect, it, vi } from "vitest";
import { createBg3dBundleProjectFixture } from "../bg3d/studio-bg3d-bundle-project.test-fixture";
import { StudioCrdtDocument } from "./studio-crdt-document";
import { bindStudioCrdtFrontierReconciliation } from "./studio-crdt-frontier-reconciliation-binding";
import { reconcileStudioCrdtSceneGraphHistory, type StudioCrdtSceneGraphFrontier } from "./studio-crdt-history";
import { publishStudioCrdtSceneGraphDiff } from "./studio-crdt-scene-publisher";
import type { StudioCrdtSceneGraphRuntime } from "./StudioLiveCollaborationProvider";
import type { El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";

// hydration 전체를 fixture frontier·source로 대체해 완료 순서를 제어하며 문서·구독·history·재전송은 실제 구현을 쓴다.
const { hydrate } = vi.hoisted(() => ({ hydrate: vi.fn() }));
vi.mock("../scene3d/bg3d-six-pass/studio-bg3d-six-pass-bundle-hydration", () => ({ hydrateStudioBg3dSixPassFrontier: hydrate }));
vi.mock("../studio-legacy-editor-runtime-helpers", () => ({ readyStudioWorkAssetImageSources: () => new Map() }));
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach((stop) => stop()); vi.resetAllMocks(); });

function text(id: string, value: string): El {
  return { id, type: "text", text: value, x: 0, y: 0, width: 100, fontSize: 24, fill: "#111", rotation: 0 };
}
function deferredHydrations(sources: ReadonlyMap<string, El>) {
  const pending: { frontier: StudioCrdtSceneGraphFrontier; resolve(): void; reject(error: Error): void }[] = [];
  hydrate.mockImplementation((frontier: StudioCrdtSceneGraphFrontier) => new Promise((resolve, reject) => {
    pending.push({ frontier, resolve: () => resolve({ frontier, sources }), reject });
  }));
  return pending;
}
async function fixture() {
  const bundle = await createBg3dBundleProjectFixture();
  const receiver = new StudioCrdtDocument(), sender = new StudioCrdtDocument();
  cleanup.push(() => receiver.destroy(), () => sender.destroy());
  const bundlePage = bundle.project.pagesList[0]!;
  const baseline: PageState[] = [{ ...bundlePage, elements: [...bundlePage.elements,
    text("shared-a", "A-original"), text("victim", "삭제 전"), text("shared-b", "B-original")] }];
  publishStudioCrdtSceneGraphDiff(receiver, [], baseline);
  sender.applyUpdate(receiver.encodeStateAsUpdate());
  const pending = deferredHydrations(new Map(bundlePage.elements.map((element) => [element.id, element])));
  const input = { document: receiver, runtimeRef: { current: { reconcileHistory: reconcileStudioCrdtSceneGraphHistory } as StudioCrdtSceneGraphRuntime },
    mountedRef: { current: true }, pagesHistoryRef: { current: [baseline] }, pagesHiRef: { current: 0 },
    revisionRef: { current: 0 }, accessRef: { current: { documentGeneration: 0 } },
    hydrator: { readySources: () => new Map() }, workId: null,
    reportError: vi.fn(), rebase: vi.fn(), setHistory: vi.fn(), setReconciled: vi.fn() };
  cleanup.push(bindStudioCrdtFrontierReconciliation(input));
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  pending[0]!.resolve();
  await vi.waitFor(() => expect(input.setReconciled).toHaveBeenCalledOnce());
  pending.splice(0);
  const local: PageState[] = [{ ...baseline[0]!, elements: [...baseline[0]!.elements, text("local", "local-only")] }];
  publishStudioCrdtSceneGraphDiff(receiver, baseline, local);
  input.pagesHistoryRef.current = [baseline, local, [{ ...local[0]!, elements: [...local[0]!.elements, text("redo-only", "redo-only")] }]];
  input.pagesHiRef.current = 1;
  sender.applyUpdate(receiver.encodeStateAsUpdate(sender.encodeStateVector()));
  return { receiver, sender, input, pending };
}

function send(sender: StudioCrdtDocument, receiver: StudioCrdtDocument) {
  receiver.applyUpdate(sender.encodeStateAsUpdate(receiver.encodeStateVector()));
}
function expectPeerState(pages: PageState[]) {
  const elements = pages[0]!.elements;
  expect.soft(elements.find((entry) => entry.id === "shared-a")).toMatchObject({ text: "A-peer" });
  expect.soft(elements.find((entry) => entry.id === "shared-b")).toMatchObject({ text: "B-peer" });
  expect.soft(elements.some((entry) => entry.id === "victim")).toBe(false);
}

it.each([
  { order: "old-first", localDuring: false }, { order: "new-first", localDuring: false },
  { order: "old-first", localDuring: true }, { order: "new-first", localDuring: true },
])("6패스 복원 $order, 대기 중 로컬 편집 $localDuring 뒤 두 클라이언트 undo/redo가 원격 변경을 보존한다", async ({ order, localDuring }) => {
  const { receiver, sender, input, pending } = await fixture();
  sender.patchSceneElement("shared-a", { set: { text: "A-peer" } }); send(sender, receiver);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  if (localDuring) {
    const previous = input.pagesHistoryRef.current[1]!;
    const next: PageState[] = [{ ...previous[0]!, elements: [...previous[0]!.elements, text("during-local", "복원 중 로컬 편집")] }];
    publishStudioCrdtSceneGraphDiff(receiver, previous, next);
    input.pagesHistoryRef.current = [...input.pagesHistoryRef.current.slice(0, 2), next];
    input.pagesHiRef.current = 2;
    sender.applyUpdate(receiver.encodeStateAsUpdate(sender.encodeStateVector()));
  }
  sender.deleteSceneElement("victim"); send(sender, receiver);
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  sender.patchSceneElement("shared-b", { set: { text: "B-peer" } }); send(sender, receiver);
  await vi.waitFor(() => expect(pending).toHaveLength(3));
  const completions = order === "old-first" ? pending : [...pending].reverse();
  completions.forEach((entry) => entry.resolve());
  await vi.waitFor(() => expect(input.setReconciled).toHaveBeenCalledTimes(2));
  expectPeerState(input.pagesHistoryRef.current[input.pagesHiRef.current]!);
  // 앱의 history 이동과 동일하게 현재→대상 snapshot 차이만 발행한 뒤 상대 문서로 재전송한다.
  for (const index of [0, 1, 2, 1]) {
    const previous = input.pagesHistoryRef.current[input.pagesHiRef.current]!;
    const next = input.pagesHistoryRef.current[index]!;
    expectPeerState(next);
    publishStudioCrdtSceneGraphDiff(receiver, previous, next);
    input.pagesHiRef.current = index;
    sender.applyUpdate(receiver.encodeStateAsUpdate(sender.encodeStateVector()));
    for (const document of [receiver, sender]) {
      expect.soft(document.getSceneElement("shared-a")?.payload.props.text).toBe("A-peer");
      expect.soft(document.getSceneElement("shared-b")?.payload.props.text).toBe("B-peer");
      expect.soft(document.getSceneElement("victim", true)?.deleted).toBe(true);
      expect.soft(Boolean(document.getSceneElement("local"))).toBe(index !== 0);
      expect.soft(Boolean(document.getSceneElement("redo-only"))).toBe(!localDuring && index === 2);
      expect.soft(Boolean(document.getSceneElement("during-local"))).toBe(localDuring && index === 2);
    }
  }
  expect(input.reportError).not.toHaveBeenCalled();
});

it.each(["same-property", "different-property"])("마지막 원격 frontier 복원 중 같은 요소를 %s로 로컬 재편집해도 현재 값과 undo/redo를 보존한다", async (mode) => {
  const { receiver, sender, input, pending } = await fixture();
  sender.patchSceneElement("shared-a", { set: { text: "A-peer" } }); send(sender, receiver);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  const previous = input.pagesHistoryRef.current[1]!;
  const next: PageState[] = previous.map((page) => ({ ...page, elements: page.elements.map((element) => element.id !== "shared-a" ? element
    : { ...element, ...(mode === "same-property" ? { text: "A-local" } : { x: 120 }) }) }));
  publishStudioCrdtSceneGraphDiff(receiver, previous, next);
  input.pagesHistoryRef.current = [...input.pagesHistoryRef.current.slice(0, 2), next]; input.pagesHiRef.current = 2;
  sender.applyUpdate(receiver.encodeStateAsUpdate(sender.encodeStateVector()));
  pending[0]!.resolve();
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  pending[1]!.resolve();
  await vi.waitFor(() => expect(input.setReconciled).toHaveBeenCalledTimes(2));
  for (const index of [2, 1, 2]) {
    const before = input.pagesHistoryRef.current[input.pagesHiRef.current]!;
    const after = input.pagesHistoryRef.current[index]!;
    const expectedText = mode === "same-property" && index === 2 ? "A-local" : "A-peer";
    const expectedX = mode === "different-property" && index === 2 ? 120 : 0;
    expect.soft(after[0]!.elements.find(({ id }) => id === "shared-a")).toMatchObject({ text: expectedText, x: expectedX });
    publishStudioCrdtSceneGraphDiff(receiver, before, after); input.pagesHiRef.current = index;
    sender.applyUpdate(receiver.encodeStateAsUpdate(sender.encodeStateVector()));
    for (const document of [receiver, sender]) expect.soft(document.getSceneElement("shared-a")?.payload.props)
      .toMatchObject({ text: expectedText, x: expectedX });
  }
  expect(input.reportError).not.toHaveBeenCalled();
});

it("속성 이력 재조정 callback 안의 로컬 재편집도 오래된 frontier로 덮지 않는다", async () => {
  const { receiver, sender, input, pending } = await fixture();
  input.rebase.mockImplementationOnce(() => {
    const previous = input.pagesHistoryRef.current[1]!;
    const next = previous.map((page) => ({ ...page, elements: page.elements.map((element) => element.id === "shared-a"
      ? { ...element, text: "A-reentrant" } : element) }));
    publishStudioCrdtSceneGraphDiff(receiver, previous, next);
    input.pagesHistoryRef.current = [...input.pagesHistoryRef.current.slice(0, 2), next]; input.pagesHiRef.current = 2;
  });
  sender.patchSceneElement("shared-a", { set: { text: "A-peer" } }); send(sender, receiver);
  await vi.waitFor(() => expect(pending.length).toBeGreaterThan(0));
  for (let index = 0; index < pending.length; index += 1) { pending[index]!.resolve(); await new Promise((resolve) => setTimeout(resolve, 0)); }
  await vi.waitFor(() => expect(input.setReconciled).toHaveBeenCalledTimes(2));
  expect(input.pagesHistoryRef.current[1]![0]!.elements.find(({ id }) => id === "shared-a")).toMatchObject({ text: "A-peer" });
  expect(input.pagesHistoryRef.current[2]![0]!.elements.find(({ id }) => id === "shared-a")).toMatchObject({ text: "A-reentrant" });
});

it("복원 전 생성된 원격 요소를 다시 편집해도 모든 undo snapshot에서 원격 생성을 보존한다", async () => {
  const { receiver, sender, input, pending } = await fixture();
  sender.addSceneElement({ id: "peer-new", pageId: "page-1", layerId: "page-root", payload: { version: 1, type: "text",
    props: { text: "new", x: 0, y: 0, width: 100, fontSize: 24, fill: "#111", rotation: 0 } } }); send(sender, receiver);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  sender.patchSceneElement("peer-new", { set: { text: "new-edited" } }); send(sender, receiver);
  await vi.waitFor(() => expect(pending).toHaveLength(2)); pending.forEach((entry) => entry.resolve());
  await vi.waitFor(() => expect(input.setReconciled).toHaveBeenCalledTimes(2));
  for (const pages of input.pagesHistoryRef.current) expect.soft(pages[0]!.elements.find(({ id }) => id === "peer-new"))
    .toMatchObject({ text: "new-edited" });
  publishStudioCrdtSceneGraphDiff(receiver, input.pagesHistoryRef.current[1]!, input.pagesHistoryRef.current[0]!);
  sender.applyUpdate(receiver.encodeStateAsUpdate(sender.encodeStateVector()));
  expect.soft(receiver.getSceneElement("peer-new")).not.toBeNull(); expect.soft(sender.getSceneElement("peer-new")).not.toBeNull();
});

it.each(["same-property", "different-property"])("복원 대기 중 %s의 undo도 상대방 변경을 재발행하지 않고 로컬 redo를 보존한다", async (mode) => {
  const { receiver, sender, input, pending } = await fixture();
  const base = input.pagesHistoryRef.current[1]!;
  const local = base.map((page) => ({ ...page, elements: page.elements.map((element) => element.id !== "shared-a" ? element
    : { ...element, ...(mode === "same-property" ? { text: "local-before" } : { x: 10 }) }) }));
  publishStudioCrdtSceneGraphDiff(receiver, base, local);
  input.pagesHistoryRef.current = [input.pagesHistoryRef.current[0]!, local];
  sender.applyUpdate(receiver.encodeStateAsUpdate(sender.encodeStateVector()));
  sender.patchSceneElement("shared-a", { set: { text: "A-peer" } }); send(sender, receiver);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  publishStudioCrdtSceneGraphDiff(receiver, input.pagesHistoryRef.current[1]!, input.pagesHistoryRef.current[0]!);
  input.pagesHiRef.current = 0; sender.applyUpdate(receiver.encodeStateAsUpdate(sender.encodeStateVector()));
  expect.soft(receiver.getSceneElement("shared-a")?.payload.props.text).toBe("A-peer");
  expect.soft(sender.getSceneElement("shared-a")?.payload.props.text).toBe("A-peer");
  pending[0]!.resolve(); await vi.waitFor(() => expect(pending).toHaveLength(2)); pending[1]!.resolve();
  await vi.waitFor(() => expect(input.setReconciled).toHaveBeenCalledTimes(2));
  for (const index of [0, 1, 0]) {
    const before = input.pagesHistoryRef.current[input.pagesHiRef.current]!;
    const after = input.pagesHistoryRef.current[index]!;
    const x = mode === "different-property" && index === 1 ? 10 : 0;
    expect.soft(after[0]!.elements.find(({ id }) => id === "shared-a")).toMatchObject({ text: "A-peer", x });
    publishStudioCrdtSceneGraphDiff(receiver, before, after); input.pagesHiRef.current = index;
    sender.applyUpdate(receiver.encodeStateAsUpdate(sender.encodeStateVector()));
    for (const document of [receiver, sender]) expect.soft(document.getSceneElement("shared-a")?.payload.props).toMatchObject({ text: "A-peer", x });
  }
});
