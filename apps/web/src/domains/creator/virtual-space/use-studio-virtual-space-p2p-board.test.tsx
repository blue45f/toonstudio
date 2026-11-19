// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioLiveDirectPort } from "../live/studio-live-direct-port";
import type { StudioP2pBoardScope } from "./studio-virtual-space-p2p-board";
import { useStudioVirtualSpaceP2pBoard } from "./use-studio-virtual-space-p2p-board";

const participant = { sessionId: "alice", displayName: "Alice", role: "editor" as const };
const port: StudioLiveDirectPort = {
  getPeers: () => [],
  subscribe: () => () => undefined,
  send: () => false,
};
const scopeRev1: StudioP2pBoardScope = {
  boardId: "main-board", worldId: "world", contentRevision: "rev-1",
};
const scopeRev2: StudioP2pBoardScope = {
  boardId: "main-board", worldId: "world", contentRevision: "rev-2",
};
const storageKey = (scope: StudioP2pBoardScope, ownerId: string) => [
  "toonspectrum:p2p-board:v2",
  scope.worldId,
  scope.boardId,
  scope.contentRevision,
  ownerId,
].map(encodeURIComponent).join(":");

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("crypto", { randomUUID: () => "epoch-local" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useStudioVirtualSpaceP2pBoard", () => {
  it("restores only this account's revision-scoped browser items before writing a snapshot", async () => {
    const key = storageKey(scopeRev1, "user-alice");
    localStorage.setItem(key, JSON.stringify([{
      kind: "note", color: "#ffd166", x: .2, y: .3, text: "saved locally",
    }]));
    const { result, rerender } = renderHook((props: {
      scope: StudioP2pBoardScope;
      storageOwnerId: string;
    }) => useStudioVirtualSpaceP2pBoard({
      participant,
      port,
      enabled: true,
      scope: props.scope,
      storageOwnerId: props.storageOwnerId,
    }), { initialProps: { scope: scopeRev1, storageOwnerId: "user-alice" } });

    await waitFor(() => expect(result.current.snapshot.entities).toHaveLength(1));
    expect(result.current.snapshot.entities[0]).toMatchObject({
      kind: "note",
      text: "saved locally",
      ownerSessionId: "alice",
    });
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual([{
      kind: "note",
      color: "#ffd166",
      x: .2,
      y: .3,
      text: "saved locally",
    }]);

    rerender({ scope: scopeRev2, storageOwnerId: "user-alice" });
    await waitFor(() => expect(result.current.snapshot.entities).toHaveLength(0));
  });

  it("열람 중에는 내 작업을 전송·덮어쓰지 않고 편집 권한이 돌아오면 복원한다", async () => {
    const key = storageKey(scopeRev1, "user-alice");
    const saved = JSON.stringify([{ kind: "note", color: "#ffd166", x: .2, y: .3, text: "내 메모" }]);
    localStorage.setItem(key, saved);
    const viewer = { ...participant, role: "viewer" as const };
    const initialProps: { role: "viewer" | "editor" } = { role: "viewer" };
    const { result, rerender } = renderHook(({ role }: typeof initialProps) =>
      useStudioVirtualSpaceP2pBoard({
        participant: role === "viewer" ? viewer : participant, port, enabled: true, scope: scopeRev1, storageOwnerId: "user-alice",
      }), { initialProps });
    await waitFor(() => expect(result.current.snapshot.available).toBe(true));
    expect(result.current.snapshot.entities).toEqual([]);
    expect(localStorage.getItem(key)).toBe(saved);
    rerender({ role: "editor" });
    await waitFor(() => expect(result.current.snapshot.entities).toHaveLength(1));
    expect(result.current.snapshot.entities[0]).toMatchObject({ kind: "note", text: "내 메모" });
  });

  it("기기 저장이 실패해도 그림을 유지하고 같은 항목을 다시 저장한다", async () => {
    const key = storageKey(scopeRev1, "user-alice");
    const { result } = renderHook(() => useStudioVirtualSpaceP2pBoard({
      participant, port, enabled: true, scope: scopeRev1, storageOwnerId: "user-alice",
    }));
    await waitFor(() => expect(result.current.snapshot.available).toBe(true));
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    act(() => { result.current.addNote(.2, .3, "다시 저장할 수정 지시", "#ffd166"); });
    expect(result.current.localSaveFailed).toBe(true);
    expect(localStorage.getItem(key)).toBeNull();
    act(() => result.current.retryLocalSave());
    expect(write).toHaveBeenCalledTimes(2);
    expect(result.current.localSaveFailed).toBe(false);
    expect(result.current.snapshot.entities).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(key) ?? "null")).toEqual([
      { kind: "note", color: "#ffd166", x: .2, y: .3, text: "다시 저장할 수정 지시" },
    ]);
  });

  it("does not restore another account's local board cache on a shared browser", async () => {
    localStorage.setItem(storageKey(scopeRev1, "user-alice"), JSON.stringify([{
      kind: "note", color: "#ffd166", x: .2, y: .3, text: "Alice only",
    }]));
    const { result } = renderHook(() => useStudioVirtualSpaceP2pBoard({
      participant,
      port,
      enabled: true,
      scope: scopeRev1,
      storageOwnerId: "user-bob",
    }));

    await waitFor(() => expect(result.current.snapshot.available).toBe(true));
    expect(result.current.snapshot.entities).toEqual([]);
  });
});
