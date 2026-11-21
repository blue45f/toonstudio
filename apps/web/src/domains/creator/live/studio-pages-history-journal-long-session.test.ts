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
