import { describe, expect, it } from "vitest";

import {
  LOCAL_USER_ORIGIN,
  REMOTE_PEER_ORIGIN,
  SYNC_HYDRATION_ORIGIN,
  ScopedLocalUndoHistory,
  isLocalUndoableOrigin,
} from "./studio-crdt-local-undo-scope-guard";

describe("studio-crdt-local-undo-scope-guard (AC-009)", () => {
  it("LOCAL_USER_ORIGIN만 undo 스택에 기록하고 원격 피어·초기 동기화 편집은 무시한다", () => {
    expect(isLocalUndoableOrigin(LOCAL_USER_ORIGIN)).toBe(true);
    expect(isLocalUndoableOrigin(REMOTE_PEER_ORIGIN)).toBe(false);
    expect(isLocalUndoableOrigin(SYNC_HYDRATION_ORIGIN)).toBe(false);

    const history = new ScopedLocalUndoHistory(50);
    expect(history.record({ id: "sync-1", origin: SYNC_HYDRATION_ORIGIN, summaryKo: "초기 로드", timestampMs: 1 })).toBe(false);
    expect(history.record({ id: "local-1", origin: LOCAL_USER_ORIGIN, summaryKo: "선화 획 추가", timestampMs: 2 })).toBe(true);
    expect(history.record({ id: "remote-1", origin: REMOTE_PEER_ORIGIN, summaryKo: "동료 말풍선 이동", timestampMs: 3 })).toBe(false);
    expect(history.record({ id: "local-2", origin: LOCAL_USER_ORIGIN, summaryKo: "밑색 채우기", timestampMs: 4 })).toBe(true);

    expect(history.getUndoDepth()).toBe(2);
    expect(history.undo()?.id).toBe("local-2");
    expect(history.undo()?.id).toBe("local-1");
    expect(history.undo()).toBeNull();
    expect(history.redo()?.id).toBe("local-1");
  });
});
