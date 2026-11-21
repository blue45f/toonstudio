import { describe, expect, it } from "vitest";

import {
  createStudioCommandJournal,
  type StudioCommandJsonValue,
} from "../studio-command-journal";
import {
  STUDIO_COMMAND_IDENTITY_POLICY_KEY,
  STUDIO_COMMAND_SEQUENCE_IDENTITY_POLICY,
} from "../studio-cuttoon-editor/runtime/history/studio-command-journal-identity";
import {
  createStudioPagesHistoryCommandJournal,
  restoreStudioPagesHistoryCommandJournal,
  summarizeStudioHistorySnapshot,
  type StudioPagesHistoryCommandJournal,
} from "../studio-pages-history-command-journal";

const blank = [{ id: "page-1", elements: [], canvasH: 2000 }];
const ink = [{ id: "page-1", elements: [{ id: "stroke-1", type: "draw", points: [0, 1, 2, 3] }], canvasH: 2000 }];

function cycle(bridge: StudioPagesHistoryCommandJournal): void {
  bridge.recordTransition({
    mutationKind: "elements.commit", previousPages: blank, nextPages: ink,
    previousHistoryIndex: 0, nextHistoryIndex: 1,
  });
  if (bridge.recordUndo({ pages: blank, historyIndex: 0 }) !== "recorded"
    || bridge.recordRedo({ pages: ink, historyIndex: 1 }) !== "recorded"
    || bridge.recordUndo({ pages: blank, historyIndex: 0 }) !== "recorded") {
    throw new Error("정상 반복 중 기록 horizon을 다시 시작했습니다.");
  }
}

describe("동일 원고의 장시간 command journal", () => {
  it.each([4, 5])("Undo/Redo만 반복해도 %i개 기록 경계에서 현재 snapshot으로 재설정한다", (compactAt) => {
    const bridge = createStudioPagesHistoryCommandJournal({ compactAt });
    bridge.recordTransition({
      mutationKind: "elements.commit", previousPages: blank, nextPages: ink,
      previousHistoryIndex: 0, nextHistoryIndex: 1,
    });
    for (let step = 1; step < compactAt; step += 1) {
      const target = step % 2 === 1 ? { pages: blank, historyIndex: 0 } : { pages: ink, historyIndex: 1 };
      const result = step % 2 === 1 ? bridge.recordUndo(target) : bridge.recordRedo(target);
      expect(result).toBe("recorded");
      expect(bridge.matchesTarget(target)).toBe(true);
      expect(bridge.replayPlan().recordCount).toBe(step + 1);
    }
    const target = compactAt % 2 === 1 ? { pages: blank, historyIndex: 0 } : { pages: ink, historyIndex: 1 };
    const result = compactAt % 2 === 1 ? bridge.recordUndo(target) : bridge.recordRedo(target);
    expect(result).toBe("rebased");
    expect(bridge.matchesTarget(target)).toBe(true);
    expect(bridge.replayPlan()).toMatchObject({
      recordCount: 0, nextSequence: 1,
      checkpoint: { id: "checkpoint:1", upToSequence: 0, state: summarizeStudioHistorySnapshot(target.pages, target.historyIndex) },
    });
    const restored = restoreStudioPagesHistoryCommandJournal(bridge.serialize());
    expect(restored.matchesTarget(target)).toBe(true);
  });

  it("새 획 없는 1,400회 Undo/Redo에서 기본 상한을 넘지 않고 재열기 뒤 새 편집을 기록한다", () => {
    let bridge = createStudioPagesHistoryCommandJournal();
    bridge.recordTransition({
      mutationKind: "elements.commit", previousPages: blank, nextPages: ink,
      previousHistoryIndex: 0, nextHistoryIndex: 1,
    });
    let rebased = 0;
    for (let index = 1; index <= 700; index += 1) {
      const undo = bridge.recordUndo({ pages: blank, historyIndex: 0 });
      if (undo === "rebased" || index % 100 === 0) {
        expect(bridge.matchesTarget({ pages: blank, historyIndex: 0 })).toBe(true);
      }
      const redo = bridge.recordRedo({ pages: ink, historyIndex: 1 });
      if (redo === "rebased" || index % 100 === 0) {
        expect(bridge.matchesTarget({ pages: ink, historyIndex: 1 })).toBe(true);
      }
      if (index <= 200) expect([undo, redo]).toEqual(["recorded", "recorded"]);
      if (undo === "rebased") rebased += 1;
      if (redo === "rebased") rebased += 1;
      if (undo === "rebased" || redo === "rebased" || index % 50 === 0) {
        expect(bridge.replayPlan().recordCount).toBeLessThanOrEqual(448);
      }
      if (index === 300) {
        const serialized = bridge.serialize();
        bridge = restoreStudioPagesHistoryCommandJournal(serialized);
        expect(bridge.serialize()).toBe(serialized);
        expect(bridge.matchesTarget({ pages: ink, historyIndex: 1 })).toBe(true);
      }
    }
    expect(rebased).toBeGreaterThan(0);
    bridge.recordUndo({ pages: blank, historyIndex: 0 });
    bridge = restoreStudioPagesHistoryCommandJournal(bridge.serialize());
    expect(bridge.matchesTarget({ pages: blank, historyIndex: 0 })).toBe(true);
    cycle(bridge);
    expect(bridge.replayPlan().nextSequence).toBe(5);
    expect(bridge.matchesTarget({ pages: blank, historyIndex: 0 })).toBe(true);
  }, 30_000);

  it("대기한 coalesced 편집이 경계를 채워도 Undo 결과 snapshot을 보존한다", () => {
    const bridge = createStudioPagesHistoryCommandJournal({ compactAt: 4 });
    bridge.recordTransition({
      mutationKind: "elements.commit", previousPages: blank, nextPages: ink,
      previousHistoryIndex: 0, nextHistoryIndex: 1,
    });
    bridge.recordUndo({ pages: blank, historyIndex: 0 });
    bridge.recordRedo({ pages: ink, historyIndex: 1 });
    const moved = [{ id: "page-1", canvasH: 2000, elements: [{ id: "stroke-1", type: "draw", points: [10, 11, 12, 13] }] }];
    bridge.recordTransition({
      mutationKind: "elements.transform", previousPages: ink, nextPages: moved,
      previousHistoryIndex: 1, nextHistoryIndex: 2, coalesceKey: "move:stroke-1",
    });
    expect(bridge.recordUndo({ pages: ink, historyIndex: 1 })).toBe("rebased");
    expect(bridge.matchesTarget({ pages: ink, historyIndex: 1 })).toBe(true);
    expect(bridge.replayPlan().recordCount).toBe(0);
    const restored = restoreStudioPagesHistoryCommandJournal(bridge.serialize());
    expect(restored.matchesTarget({ pages: ink, historyIndex: 1 })).toBe(true);
  });

  it("기존737번째 cycle의 고유 undo:2948을 중복으로 거절하지 않는다", () => {
    const bridge = createStudioPagesHistoryCommandJournal();
    for (let index = 0; index < 737; index += 1) cycle(bridge);
    const plan = bridge.replayPlan();
    expect(plan.nextSequence).toBe(2949);
    expect(plan.checkpoint?.upToSequence).toBe(2688);
    expect(plan.batches.at(-1)).toMatchObject({ mode: "undo", sequence: 2948 });
    expect(bridge.matchesTarget({ pages: blank, historyIndex: 0 })).toBe(true);
    const restored = restoreStudioPagesHistoryCommandJournal(bridge.serialize());
    expect(restored.serialize()).toBe(bridge.serialize());
    expect(restored.recordRedo({ pages: ink, historyIndex: 1 })).toBe("recorded");
    expect(restored.matchesTarget({ pages: ink, historyIndex: 1 })).toBe(true);
  }, 30_000);

  it("26,000개 기록과 여러 retention/compaction 경계를 재개하며 기록 보관·직렬화 크기 상한을 유지한다", () => {
    let bridge = createStudioPagesHistoryCommandJournal();
    let serializedAtReopen = "";
    for (let index = 1; index <= 6500; index += 1) {
      cycle(bridge);
      if (index % 1300 === 0) {
        const plan = bridge.replayPlan();
        expect(plan.nextSequence).toBe(index * 4 + 1);
        expect(plan.recordCount).toBeLessThan(448);
        expect(plan.checkpoint?.idempotency.length).toBe(4096);
        expect(plan.checkpoint?.extensions[STUDIO_COMMAND_IDENTITY_POLICY_KEY]).toBe(STUDIO_COMMAND_SEQUENCE_IDENTITY_POLICY);
        serializedAtReopen = bridge.serialize();
        bridge = restoreStudioPagesHistoryCommandJournal(serializedAtReopen);
        expect(bridge.serialize()).toBe(serializedAtReopen);
        expect(bridge.matchesTarget({ pages: blank, historyIndex: 0 })).toBe(true);
      }
    }
    expect(bridge.replayPlan().nextSequence).toBe(26001);
    expect(new TextEncoder().encode(serializedAtReopen).byteLength).toBeLessThan(4 * 1024 * 1024);
    cycle(bridge);
    expect(bridge.replayPlan().nextSequence).toBe(26005);
  }, 60_000);

  it("legacy literal checkpoint는 그대로 복구하며 명시된 기존 rebase에서만 새 정책으로 옮긴다", () => {
    const legacy = createStudioCommandJournal({
      limits: { maxRecords: 512, maxPayloadBytes: 128 * 1024, maxSerializedBytes: 4 * 1024 * 1024 },
      extensions: { integration: "studio-pages-history", version: 1 },
    });
    legacy.compact({
      id: "checkpoint:history-rebase",
      state: summarizeStudioHistorySnapshot(blank, 0) as unknown as StudioCommandJsonValue,
      extensions: { integration: "studio-pages-history", reason: "history-horizon-rebase" },
    });
    const original = legacy.serialize();
    const restored = restoreStudioPagesHistoryCommandJournal(original);
    expect(restored.serialize()).toBe(original);
    expect(restored.matchesTarget({ pages: blank, historyIndex: 0 })).toBe(true);
    cycle(restored);
    expect(restored.replayPlan().checkpoint?.id).toBe("checkpoint:history-rebase");
    expect(restored.replayPlan().checkpoint?.extensions[STUDIO_COMMAND_IDENTITY_POLICY_KEY]).toBeUndefined();
    restored.rebase({ pages: blank, historyIndex: 0 });
    const checkpoint = restored.replayPlan().checkpoint;
    expect(checkpoint).toMatchObject({ id: "checkpoint:1", upToSequence: 0 });
    expect(checkpoint?.extensions[STUDIO_COMMAND_IDENTITY_POLICY_KEY]).toBe(STUDIO_COMMAND_SEQUENCE_IDENTITY_POLICY);
    expect(restored.matchesTarget({ pages: blank, historyIndex: 0 })).toBe(true);
    const reopened = restoreStudioPagesHistoryCommandJournal(restored.serialize());
    expect(reopened.recordUndo({ pages: blank, historyIndex: 0 })).toBe("rebased");
    expect(reopened.matchesTarget({ pages: blank, historyIndex: 0 })).toBe(true);
    cycle(reopened);
    expect(reopened.replayPlan().nextSequence).toBe(5);
  });
});
