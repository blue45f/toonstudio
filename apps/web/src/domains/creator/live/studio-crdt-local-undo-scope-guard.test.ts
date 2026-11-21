import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { StrokeMergeClient } from "./merge/stroke-merge-sync";
import { StrokeUndoManager } from "./merge/stroke-merge-undo";
import {
  LOCAL_USER_ORIGIN,
  REMOTE_PEER_ORIGIN,
  SYNC_HYDRATION_ORIGIN,
  ScopedLocalUndoHistory,
  createLocalUndoTrackedOrigins,
  isLocalUndoableOrigin,
  isStrictlyLocalUndoScope,
} from "./studio-crdt-local-undo-scope-guard";

describe("studio-crdt-local-undo-scope-guard & Y.UndoManager / StrokeUndoManager 격리 무결성 (AC-011)", () => {
  it("LOCAL_USER_ORIGIN만 undo 스택에 기록하고 원격 피어·초기 동기화 편집은 무시한다", () => {
    expect(isLocalUndoableOrigin(LOCAL_USER_ORIGIN)).toBe(true);
    expect(isLocalUndoableOrigin(REMOTE_PEER_ORIGIN)).toBe(false);
    expect(isLocalUndoableOrigin(SYNC_HYDRATION_ORIGIN)).toBe(false);

    const tracked = createLocalUndoTrackedOrigins();
    expect(isStrictlyLocalUndoScope(tracked)).toBe(true);
    expect(isStrictlyLocalUndoScope(new Set([LOCAL_USER_ORIGIN, REMOTE_PEER_ORIGIN]))).toBe(false);
    expect(isStrictlyLocalUndoScope(new Set([LOCAL_USER_ORIGIN, SYNC_HYDRATION_ORIGIN]))).toBe(false);

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

  it("실제 Y.Doc + Y.UndoManager에서 원격 피어 동기화와 초기 하이드레이션은 로컬 Cmd+Z 스택을 오염시키지 않는다", () => {
    const localDoc = new Y.Doc();
    const remoteDoc = new Y.Doc();
    const localStrokes = localDoc.getMap<string>("strokes");
    const remoteStrokes = remoteDoc.getMap<string>("strokes");

    const undoManager = new Y.UndoManager(localStrokes, {
      trackedOrigins: createLocalUndoTrackedOrigins(),
      captureTimeout: 0,
    });

    // 1) 초기 동기화(hydration) 트랜잭션 → 로컬 Undo 스택 미기록
    localDoc.transact(() => {
      localStrokes.set("seed-bg", "배경-초기값");
    }, SYNC_HYDRATION_ORIGIN);
    expect(undoManager.canUndo()).toBe(false);

    // 2) 로컬 사용자 편집 → Undo 스택 기록
    localDoc.transact(() => {
      localStrokes.set("local-stroke-1", "작가A-선화1");
    }, LOCAL_USER_ORIGIN);
    expect(undoManager.canUndo()).toBe(true);

    // 3) 원격 피어 편집을 Y.applyUpdate(REMOTE_PEER_ORIGIN)로 수신 → 로컬 Undo 스택 비오염
    remoteDoc.transact(() => {
      remoteStrokes.set("remote-stroke-1", "동료B-배경선");
    }, LOCAL_USER_ORIGIN);
    Y.applyUpdate(localDoc, Y.encodeStateAsUpdate(remoteDoc), REMOTE_PEER_ORIGIN);

    expect(localStrokes.get("remote-stroke-1")).toBe("동료B-배경선");
    expect(undoManager.undoStack).toHaveLength(1);

    // 4) 로컬 Undo 실행 시 내 획만 되돌리고 원격 획·초기 배경은 온전히 유지된다
    undoManager.undo();
    expect(localStrokes.get("local-stroke-1")).toBeUndefined();
    expect(localStrokes.get("remote-stroke-1")).toBe("동료B-배경선");
    expect(localStrokes.get("seed-bg")).toBe("배경-초기값");
    expect(undoManager.canUndo()).toBe(false);

    // 5) Redo 시 내 획만 복원된다
    undoManager.redo();
    expect(localStrokes.get("local-stroke-1")).toBe("작가A-선화1");
    expect(localStrokes.get("remote-stroke-1")).toBe("동료B-배경선");

    undoManager.destroy();
    localDoc.destroy();
    remoteDoc.destroy();
  });

  it("StrokeUndoManager.track은 LOCAL_USER_ORIGIN만 수락하고 원격·하이드레이션 op은 redoStack도 보존한 채 무시한다", () => {
    const client = new StrokeMergeClient("artist-a");
    const peer = new StrokeMergeClient("artist-b");
    const undo = new StrokeUndoManager({
      state: () => client.state,
      submit: (body) => client.createOp(body),
    });

    const makeStroke = (id: string) => ({
      id,
      pageId: "page-1",
      layerId: "layer-ink",
      payload: {
        version: 1 as const,
        type: "draw" as const,
        kind: "pen" as const,
        mode: "pen" as const,
        stroke: "#111111",
        strokeWidth: 3,
        points: [0, 0, 10, 10],
      },
    });

    const hydratedOp = peer.createOp({ kind: "add", stroke: makeStroke("s-hydrate") });
    client.receive({ ...hydratedOp, seq: 1 });
    expect(undo.track(hydratedOp, SYNC_HYDRATION_ORIGIN)).toBe(false);
    expect(undo.canUndo).toBe(false);

    const localOp = client.createOp({ kind: "add", stroke: makeStroke("s-local-1") });
    expect(undo.track(localOp, LOCAL_USER_ORIGIN)).toBe(true);
    expect(undo.canUndo).toBe(true);

    // 로컬 Undo 후 redoStack이 쌓인 상태에서 원격 피어 op가 들어와도 redoStack이 지워지지 않는다
    const undoOp = undo.undo();
    expect(undoOp?.body).toEqual({ kind: "remove", strokeId: "s-local-1" });
    expect(undo.canRedo).toBe(true);

    const remoteOp = peer.createOp({ kind: "add", stroke: makeStroke("s-remote-1") });
    client.receive({ ...remoteOp, seq: 2 });
    expect(undo.track(remoteOp, REMOTE_PEER_ORIGIN)).toBe(false);
    expect(undo.canRedo).toBe(true);
    expect(client.state.strokes.get("s-remote-1")?.deleted).toBe(false);

    // 로컬 Redo는 내 획만 되살리며 원격 획은 건드리지 않는다
    const redoOp = undo.redo();
    expect(redoOp?.body).toEqual({ kind: "restore", strokeId: "s-local-1" });
    expect(client.state.strokes.get("s-local-1")?.deleted).toBe(false);
    expect(client.state.strokes.get("s-remote-1")?.deleted).toBe(false);
  });
});
