import { describe, expect, it } from "vitest";

import {
  createStudioSaveSyncSignalStore,
  resolveSaveSyncCutMatch,
  resolveSaveSyncStatusFromSignals,
} from "../../studio-save-sync-signals";
import {
  composeStudioEmergencyPendingFingerprint,
  createStudioAutosaveMonotonicGate,
  createStudioAutosaveSupersededError,
  isStudioAutosaveSupersededFailure,
} from "./studio-autosave-monotonic-gate";

describe("studio-autosave-monotonic-gate", () => {
  it("blocks superseded OPFS/SQLite dispatches and out-of-order late receipts across cuts", () => {
    const gate = createStudioAutosaveMonotonicGate();
    const cut2Seq = gate.issueSnapshotSeq("doc-1");
    expect(gate.admitOpfsDispatch("doc-1", cut2Seq)).toBe(true);
    expect(gate.admitSqliteDispatch("doc-1", cut2Seq)).toBe(true);

    // Cut 3 edit arrives while Cut 2 save is still in flight.
    const cut3Seq = gate.issueSnapshotSeq("doc-1");
    expect(gate.admitOpfsDispatch("doc-1", cut2Seq)).toBe(false);
    expect(gate.admitSqliteDispatch("doc-1", cut2Seq)).toBe(false);
    expect(gate.admitOpfsDispatch("doc-1", cut3Seq)).toBe(true);
    expect(gate.admitSqliteDispatch("doc-1", cut3Seq)).toBe(true);

    // Cut 3's fast save finishes first; Cut 2's late save finishes afterwards and is rejected.
    expect(gate.admitDurableReceipt("doc-1", cut3Seq)).toBe(true);
    expect(gate.admitDurableReceipt("doc-1", cut2Seq)).toBe(false);
  });

  it("recognizes both single and AggregateError superseded abort failures", () => {
    const single = createStudioAutosaveSupersededError();
    expect(isStudioAutosaveSupersededFailure(single)).toBe(true);
    expect(
      isStudioAutosaveSupersededFailure(new AggregateError([single, createStudioAutosaveSupersededError()])),
    ).toBe(true);
    expect(
      isStudioAutosaveSupersededFailure(new AggregateError([single, new Error("disk full")])),
    ).toBe(false);
  });

  it("composes page, master, and active pending stroke fingerprints deterministically", () => {
    expect(
      composeStudioEmergencyPendingFingerprint({
        durablePendingBatch: { pageId: "page-2", strokes: [{ id: "s1" }, { id: "s2" }] },
        masterStrokeId: "m1",
        activePendingFingerprint: "active:a1:4",
      }),
    ).toBe("page-2:s1,s2|master:m1|active:a1:4");
  });
});

describe("save-sync signals multi-cut pending & completion matching", () => {
  it("marks deferred strokes as pending immediately on pointerup and matches completion to the active cut without out-of-order rollback", () => {
    const store = createStudioSaveSyncSignalStore();
    store.reset("doc-multi-cut");
    store.noteDurability("available");
    store.noteLeadership("leader");
    store.noteActivePage("cut-1", "1페이지");
    store.noteEditGeneration(1);
    store.noteDurableReceipt({
      authority: "opfs-journal",
      savedAtMs: 1_000,
      sequence: 1,
      revision: 1,
      generation: 1,
      snapshotSeq: 1,
      pendingFingerprint: "",
      savedPageId: "cut-1",
      savedPageLabel: "1페이지",
    });

    const afterCut1 = resolveSaveSyncStatusFromSignals(store.getSignals());
    expect(afterCut1.pendingOperationsCount).toBe(0);
    expect(resolveSaveSyncCutMatch(store.getSignals(), afterCut1)).toMatchObject({
      state: "matched",
      matchedPageId: "cut-1",
      matchedPageLabel: "1페이지",
    });

    // Switch to Cut 2 and draw deferred strokes (before 2s idle flush advances editGeneration).
    store.noteActivePage("cut-2", "2페이지");
    store.notePendingFingerprint("cut-2:stroke-a,stroke-b");
    const cut2Unsaved = resolveSaveSyncStatusFromSignals(store.getSignals());
    expect(cut2Unsaved.pendingOperationsCount).toBe(1);
    expect(cut2Unsaved.cloudSyncStatus).toBe("pending");
    expect(resolveSaveSyncCutMatch(store.getSignals(), cut2Unsaved)).toMatchObject({
      state: "saving",
      activePageId: "cut-2",
      activePageLabel: "2페이지",
      matchedPageId: null,
      matchedPageLabel: null,
    });

    // Switch rapidly to Cut 3 (flushing Cut 2 to generation 2) and draw on Cut 3.
    store.notePendingFingerprint("");
    store.noteEditGeneration(2);
    store.noteActivePage("cut-3", "3페이지");
    store.notePendingFingerprint("cut-3:stroke-c");

    // Cut 3's fast receipt (snapshotSeq: 3) arrives first.
    store.noteDurableReceipt({
      authority: "opfs-journal",
      savedAtMs: 3_000,
      sequence: 3,
      revision: 3,
      generation: 2,
      snapshotSeq: 3,
      pendingFingerprint: "cut-3:stroke-c",
      savedPageId: "cut-3",
      savedPageLabel: "3페이지",
    });
    const afterCut3Fast = resolveSaveSyncStatusFromSignals(store.getSignals());
    expect(afterCut3Fast.pendingOperationsCount).toBe(0);
    expect(afterCut3Fast.lastSavedAt).toBe(3_000);
    expect(resolveSaveSyncCutMatch(store.getSignals(), afterCut3Fast)).toMatchObject({
      state: "matched",
      matchedPageId: "cut-3",
      matchedPageLabel: "3페이지",
    });

    // Cut 2's late receipt (snapshotSeq: 2, older savedAtMs: 2_000) arrives afterwards and must be ignored.
    store.noteDurableReceipt({
      authority: "sqlite-fallback",
      savedAtMs: 2_000,
      sequence: null,
      revision: null,
      generation: 1,
      snapshotSeq: 2,
      pendingFingerprint: "cut-2:stroke-a,stroke-b",
      savedPageId: "cut-2",
      savedPageLabel: "2페이지",
    });
    const afterLateCut2 = resolveSaveSyncStatusFromSignals(store.getSignals());
    expect(afterLateCut2.pendingOperationsCount).toBe(0);
    expect(afterLateCut2.lastSavedAt).toBe(3_000);
    expect(resolveSaveSyncCutMatch(store.getSignals(), afterLateCut2)).toMatchObject({
      state: "matched",
      matchedPageId: "cut-3",
      matchedPageLabel: "3페이지",
    });
  });
});
