import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  tryCoalescePendingCrdtUpdate,
  type CoalesceablePendingCrdtUpdate,
} from "./studio-crdt-operation-error";
import {
  STUDIO_CRDT_PROTOCOL_VERSION,
  decodeStudioCrdtUpdate,
  encodeStudioCrdtUpdate,
} from "./studio-crdt-protocol";

function updates() {
  const source = new Y.Doc();
  try {
    const marks = source.getMap<number>("marks");
    marks.set("a", 1);
    const first = Y.encodeStateAsUpdate(source);
    const frontier = Y.encodeStateVector(source);
    marks.set("b", 2);
    return { first, next: Y.encodeStateAsUpdate(source, frontier) };
  } finally {
    source.destroy();
  }
}

function tailFor(
  update: Uint8Array,
  persistenceState: CoalesceablePendingCrdtUpdate["persistenceState"],
  persistenceStarted: boolean,
): CoalesceablePendingCrdtUpdate {
  return {
    request: {
      protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
      workId: "work-a",
      updateId: "11111111-1111-4111-8111-111111111111",
      clientSequence: 37,
      update: encodeStudioCrdtUpdate(update),
    },
    attempts: 0,
    persistenceState,
    persistenceStarted,
    persisted: Promise.resolve(persistenceState !== "failed"),
  };
}

function restoredMarks(update: string): Record<string, number> {
  const restored = new Y.Doc();
  try {
    Y.applyUpdate(restored, decodeStudioCrdtUpdate(update));
    return restored.getMap<number>("marks").toJSON();
  } finally {
    restored.destroy();
  }
}

describe("영속 저장이 시작된 CRDT 요청의 병합 금지", () => {
  it.each(["ready", "failed", "pending"] as const)(
    "%s 상태에서도 첫 put에 전달한 요청 ID·순번·payload를 바꾸지 않는다",
    (state) => {
      const update = updates();
      const tail = tailFor(update.first, state, true);
      const originalRequest = tail.request;
      const originalPayload = { ...tail.request };
      const originalPersistence = tail.persisted;

      expect(tryCoalescePendingCrdtUpdate(tail, update.next, true)).toBe(false);

      expect(tail.request).toBe(originalRequest);
      expect(tail.request).toEqual(originalPayload);
      expect(tail.persisted).toBe(originalPersistence);
      expect(tail.persistenceState).toBe(state);
      expect(tail.persistenceStarted).toBe(true);
      expect(tail.attempts).toBe(0);
      expect(restoredMarks(tail.request.update)).toEqual({ a: 1 });
    },
  );

  it("영속 저장을 시작하지 않은 ready 메모리 배치는 기존 ID와 순번으로 유효하게 병합한다", () => {
    const update = updates();
    const tail = tailFor(update.first, "ready", false);
    const original = { ...tail.request };

    expect(tryCoalescePendingCrdtUpdate(tail, update.next, true)).toBe(true);

    expect(tail.request.updateId).toBe(original.updateId);
    expect(tail.request.clientSequence).toBe(original.clientSequence);
    expect(tail.request.workId).toBe(original.workId);
    expect(tail.request.protocolVersion).toBe(original.protocolVersion);
    expect(tail.request.update).not.toBe(original.update);
    expect(restoredMarks(tail.request.update)).toEqual({ a: 1, b: 2 });
  });
});
