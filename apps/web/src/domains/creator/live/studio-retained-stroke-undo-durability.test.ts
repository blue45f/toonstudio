import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCrdtDocument } from "./studio-crdt-document";
import { publishStudioCrdtDrawGraphDiff } from "./studio-crdt-scene-publisher";
import { StudioAutosaveOpfsSession } from "../studio-autosave-opfs-session";
import { isStudioAutosaveSupersededFailure } from "../studio-cuttoon-editor/runtime/studio-autosave-monotonic-gate";
import { createStudioOpfsMemoryFileSystem } from "../studio-opfs-filesystem";
import { createStudioOpfsRecoveryJournal } from "../studio-opfs-recovery-journal";
import { createStudioLifecycleEmergencyAutosave } from "../studio-pending-stroke-durability";
import {
  undoStudioRetainedStrokeHistory,
  type StudioRetainedStrokeQueuedBatch,
  type StudioRetainedStrokeUndoneBatch,
} from "../studio-retained-stroke-history";

import type { StudioAutosavePersistenceReceipt } from "../studio-autosave-opfs-session";
import type { DrawEl } from "../studio-element-model";
import type { PageState } from "../studio-page-state";

const stroke: DrawEl = {
  id: "pending", type: "draw", mode: "pen", kind: "freehand", brush: "pen",
  points: [10, 10, 50, 50], pressures: [0.5, 0.5], stroke: "#000000", strokeWidth: 10,
};
const earlierStroke = { ...stroke, id: "earlier" };
const disposals: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const dispose of disposals.splice(0)) await dispose();
  vi.useRealTimers();
});

function fixture(options: { empty?: boolean; holdFirstWrite?: boolean } = {}) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const fileSystem = createStudioOpfsMemoryFileSystem();
  const identity = { documentId: "retained-undo", documentVersion: 2, engineVersion: "studio-autosave-v2" };
  const makeJournal = () => createStudioOpfsRecoveryJournal({
    identity,
    adapter: {
      kind: "fake-opfs",
      read: fileSystem.read,
      writeAtomic: fileSystem.write,
      remove: async (path) => { await fileSystem.remove(path); },
      list: fileSystem.list,
      size: fileSystem.size,
      estimateQuota: async () => null,
      withExclusiveLock: async (_name, _signal, operation) => operation(),
    },
    now: () => 1000,
    randomToken: () => "retained-undo-writer",
  });
  const journal = makeJournal();
  let releaseFirstWrite = () => {};
  const firstWriteGate = options.holdFirstWrite
    ? new Promise<void>((resolve) => { releaseFirstWrite = resolve; })
    : Promise.resolve();
  let notifyFirstWriteStarted = () => {};
  const firstWriteStarted = new Promise<void>((resolve) => { notifyFirstWriteStarted = resolve; });
  const appendCheckpoint = journal.appendCheckpoint.bind(journal);
  let firstWrite = true;
  let checkpointStarts = 0;
  journal.appendCheckpoint = async (...args) => {
    checkpointStarts += 1;
    if (firstWrite) {
      firstWrite = false;
      notifyFirstWriteStarted();
      await firstWriteGate;
    }
    return appendCheckpoint(...args);
  };
  const sessionOptions = { autosaveKey: "retained-undo", ownerId: "writer", now: () => 1000 };
  const writer = new StudioAutosaveOpfsSession({ ...sessionOptions, journal });
  const document = new StudioCrdtDocument();
  disposals.push(() => { releaseFirstWrite(); document.destroy(); return writer.dispose(); });
  const pages: PageState[] = [{
    id: "page", elements: options.empty ? [] : [earlierStroke],
    bg: "#ffffff", bgGrad: null, canvasH: 1080,
  }];
  const pending = { current: {
    pageId: "page", strokes: [stroke], retryCount: 0,
    timer: setTimeout(() => { throw new Error("undone batch must not flush"); }, 500),
  } as StudioRetainedStrokeQueuedBatch | null };
  const undone = { current: null as StudioRetainedStrokeUndoneBatch | null };
  publishStudioCrdtDrawGraphDiff(document, [{ ...pages[0]!, elements: [] }], [
    { ...pages[0]!, elements: [...pages[0]!.elements, stroke] },
  ]);
  const writes: Array<Promise<StudioAutosavePersistenceReceipt>> = [];
  const state = { generation: 1, retryRequests: 0, saveInFlight: false };
  const persist = vi.fn((pagesOverride?: readonly PageState[]) => {
    const result = createStudioLifecycleEmergencyAutosave({
      payload: {
        version: 2,
        savedAt: "2026-09-07T00:00:00.000Z",
        pagesList: [...(pagesOverride ?? pages)],
        currentPageId: "page",
      },
      pending: pending.current,
      reason: "pointerup",
      savedAt: new Date(Date.UTC(2026, 8, 7, 0, 0, state.generation)).toISOString(),
      documentScope: { kind: "local" },
    });
    if (!result.ok) throw new Error(result.reason);
    writes.push(writer.write(result.payload));
  });
  const context = {
    pending, undone,
    getPages: () => pages,
    getHistoryIndex: () => 3,
    isBlocked: () => state.saveInFlight,
    publish: vi.fn((before: readonly PageState[], after: readonly PageState[]) => {
      publishStudioCrdtDrawGraphDiff(document, before, after, { registerNewDraws: false });
      return true;
    }),
    onUndone: vi.fn(() => { state.generation += 1; state.retryRequests += 1; }),
    persist,
  };
  async function readAfterCrash() {
    // Reopen only the durable bytes: no writer disposal, pagehide handler, flush, or memory history.
    const writesBeforeRead = fileSystem.counts.write;
    const reader = new StudioAutosaveOpfsSession({ ...sessionOptions, ownerId: "reader", journal: makeJournal() });
    const result = await reader.readLatest();
    expect(fileSystem.counts.write).toBe(writesBeforeRead);
    await reader.dispose();
    return result;
  }
  return {
    context, document, pending, undone, state, pages, writes, persist, readAfterCrash,
    releaseFirstWrite, firstWriteStarted, getCheckpointStarts: () => checkpointStarts,
  };
}

describe("retained Undo durable recovery", () => {
  it.each([false, true])("replaces the pending snapshot before recovery, including an empty page (%s)", async (empty) => {
    const f = fixture({ empty });
    f.persist();
    await f.writes[0];
    expect(undoStudioRetainedStrokeHistory(f.context)).toBe(true);
    expect(f.writes).toHaveLength(2);
    expect(f.state).toMatchObject({ generation: 2, retryRequests: 1 });
    expect(f.undone.current?.strokes).toEqual([stroke]);
    expect(f.pending.current).toBeNull();
    vi.advanceTimersByTime(500);
    await f.writes[1];
    const recovered = await f.readAfterCrash();
    expect(recovered?.state).toBe("snapshot");
    if (recovered?.state !== "snapshot") throw new Error("Undo checkpoint missing");
    expect(recovered.payload.pagesList[0]?.elements)
      .toEqual(empty ? [] : [earlierStroke]);
    expect(recovered.payload.pendingStrokeDurability).toBeUndefined();
    expect(recovered.payload.lifecycleDurability?.pendingStrokeIds).toBeUndefined();
    expect(recovered.savedAt).toBe("2026-09-07T00:00:02.000Z");
    expect(f.document.getStroke("pending", true)?.deleted).toBe(true);
    if (!empty) expect(f.document.getStroke("earlier")).toMatchObject({ id: "earlier", deleted: false });
    expect(f.pages[0]!.elements).toEqual(empty ? [] : [earlierStroke]);
  });

  it("persists Undo when the converged React page already contains the pending stroke", async () => {
    const f = fixture();
    f.pages[0] = { ...f.pages[0]!, elements: [...f.pages[0]!.elements, stroke] };
    f.persist();
    await f.writes[0];

    expect(undoStudioRetainedStrokeHistory(f.context)).toBe(true);
    await f.writes[1];
    const recovered = await f.readAfterCrash();
    expect(recovered).toMatchObject({
      state: "snapshot",
      payload: { pagesList: [{ elements: [{ id: "earlier" }] }] },
    });
    expect(f.document.getStroke("pending", true)?.deleted).toBe(true);
  });

  it("실제 저널 기록이 시작된 pointerup 저장 뒤에 새 Undo 세대를 기록한다", async () => {
    const f = fixture({ holdFirstWrite: true });
    f.persist();
    await f.firstWriteStarted;
    expect(f.getCheckpointStarts()).toBe(1);
    expect(undoStudioRetainedStrokeHistory(f.context)).toBe(true);
    expect(f.writes).toHaveLength(2);
    expect(f.getCheckpointStarts()).toBe(1);
    expect(f.context.onUndone.mock.invocationCallOrder[0]).toBeLessThan(f.persist.mock.invocationCallOrder[1]!);
    f.releaseFirstWrite();
    expect(await Promise.all(f.writes)).toMatchObject([
      { revision: 1, savedAt: "2026-09-07T00:00:01.000Z" },
      { revision: 2, savedAt: "2026-09-07T00:00:02.000Z" },
    ]);
    expect(f.getCheckpointStarts()).toBe(2);
    const recovered = await f.readAfterCrash();
    expect(recovered).toMatchObject({
      state: "snapshot", revision: 2, savedAt: "2026-09-07T00:00:02.000Z",
      payload: { pagesList: [{ elements: [{ id: "earlier" }] }] },
    });
    if (recovered?.state === "snapshot") expect(recovered.payload.pagesList[0]!.elements).toHaveLength(1);
    expect(f.document.getStroke("pending", true)?.deleted).toBe(true);
  });

  it.each([false, true])("시작 전 pointerup 저장은 같은 턴 Undo로 대체하고 새 원고만 복구한다 (%s)", async (empty) => {
    const f = fixture({ empty, holdFirstWrite: true });
    f.persist();
    expect(f.getCheckpointStarts()).toBe(0);
    expect(undoStudioRetainedStrokeHistory(f.context)).toBe(true);
    expect(f.writes).toHaveLength(2);
    const settled = Promise.allSettled(f.writes);
    await f.firstWriteStarted;
    expect(f.getCheckpointStarts()).toBe(1);
    f.releaseFirstWrite();
    const [replaced, saved] = await settled;
    expect(replaced?.status).toBe("rejected");
    if (replaced?.status !== "rejected") throw new Error("대체된 원고에 내구 영수증을 발행하면 안 됩니다.");
    expect(isStudioAutosaveSupersededFailure(replaced.reason)).toBe(true);
    expect(saved).toMatchObject({
      status: "fulfilled", value: { revision: 1, savedAt: "2026-09-07T00:00:02.000Z" },
    });
    expect(f.getCheckpointStarts()).toBe(1);
    expect(f.pending.current).toBeNull();
    expect(f.state).toMatchObject({ generation: 2, retryRequests: 1 });
    vi.advanceTimersByTime(500);
    const recovered = await f.readAfterCrash();
    expect(recovered).toMatchObject({ state: "snapshot", revision: 1, savedAt: "2026-09-07T00:00:02.000Z" });
    if (recovered?.state !== "snapshot") throw new Error("Undo checkpoint missing");
    expect(recovered.payload.pagesList[0]?.elements).toEqual(empty ? [] : [earlierStroke]);
    expect(recovered.payload.pendingStrokeDurability).toBeUndefined();
    expect(recovered.payload.lifecycleDurability?.pendingStrokeIds).toBeUndefined();
    expect(f.document.getStroke("pending", true)?.deleted).toBe(true);
  });

  it.each(["saving", "publication-rejected", "page-missing"] as const)(
    "preserves the queued stroke and previous recovery when Undo is %s", async (reason) => {
      const f = fixture();
      f.persist();
      await f.writes[0];
      const before = await f.readAfterCrash();
      const pending = f.pending.current;
      if (reason === "saving") f.state.saveInFlight = true;
      if (reason === "publication-rejected") f.context.publish.mockReturnValue(false);
      if (reason === "page-missing") f.context.getPages = () => [];
      expect(undoStudioRetainedStrokeHistory(f.context)).toBe(false);
      expect(f.pending.current).toBe(pending);
      expect(f.undone.current).toBeNull();
      expect(f.context.onUndone).not.toHaveBeenCalled();
      expect(f.persist).toHaveBeenCalledOnce();
      expect(f.state).toMatchObject({ generation: 1, retryRequests: 0 });
      expect(await f.readAfterCrash()).toEqual(before);
      expect(f.document.getStroke("pending")?.deleted).toBe(false);
      if (reason !== "publication-rejected") expect(f.context.publish).not.toHaveBeenCalled();
      if (pending?.timer) clearTimeout(pending.timer);
    },
  );
});
