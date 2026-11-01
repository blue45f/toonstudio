import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioCrdtSceneGraphRuntime } from "./StudioLiveCollaborationProvider";
import type { StudioLiveTransportFactory } from "./studio-live-collaboration-transport";
import {
  hooks,
  rooms,
  offlineAuthority,
  lifecycle,
  recoveryDownloads,
  recoveryVault,
  recoveryVaultEntry,
  renderProviderOnce,
  renderProvider,
  resetStudioLiveProviderFixture,
  cleanupStudioLiveProviderFixture,
} from "./studio-live-collaboration-provider.test-support";

describe("StudioLiveCollaborationProvider lifecycle", () => {
  beforeEach(resetStudioLiveProviderFixture);

  afterEach(cleanupStudioLiveProviderFixture);


  it.each([
    ["local", undefined], ["server", "authoritative"], ["server", "mesh"],
  ] as const)("%s / %s 정상 전송 중 페이지 편집 권위를 유지하고 재연결 때는 다시 검증한다", async (mode, fanout) => {
    offlineAuthority.enabled = true;
    offlineAuthority.mode = mode;
    offlineAuthority.fanout = fanout;
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = { state: "ready", message: "정본 동기화 완료" };
    await renderProvider();
    await vi.waitFor(async () => {
      await renderProvider();
      expect(offlineAuthority.instances).toHaveLength(1);
    });
    const runtime = offlineAuthority.instances[0];
    const binding = lifecycle.bindings[0];
    expect(runtime.status.canonicalAuthority).toBe(true);
    binding.onStatus?.({ state: "syncing", message: "연속 변경 전송 중", pendingCount: 2 });
    expect(runtime.status.canonicalAuthority).toBe(true);

    const room = rooms.instances[0];
    room.ready = false;
    room.emit({ type: "transport-status", status: { state: "disconnected", message: "연결 종료", recoverable: true } });
    expect(runtime.status.canonicalAuthority).toBe(false);
    room.ready = true;
    binding.onStatus?.({ state: "syncing", message: "재연결 원고 확인 중" });
    expect(runtime.status.canonicalAuthority).toBe(false);
    binding.onStatus?.({ state: "ready", message: "정본 재확인 완료" });
    expect(runtime.status.canonicalAuthority).toBe(true);
    binding.onStatus?.({ state: "repairing", message: "누락된 서버 순번 복구 중" });
    expect(runtime.status.canonicalAuthority).toBe(false);
    binding.onStatus?.({ state: "syncing", message: "복구 전송 중" });
    expect(runtime.status.canonicalAuthority).toBe(false);
  });

  it.each([["local", undefined], ["server", "mesh"]] as const)("%s / %s 전달 대기는 편집을 유지하되 연결이 끊기면 재확인 전까지 잠근다", async (mode, fanout) => {
    offlineAuthority.enabled = true;
    offlineAuthority.mode = mode;
    offlineAuthority.fanout = fanout;
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = { state: "ready", message: "로컬 문서 준비 완료" };
    await renderProvider();
    await vi.waitFor(async () => {
      await renderProvider();
      expect(offlineAuthority.instances).toHaveLength(1);
    });
    const runtime = offlineAuthority.instances[0];
    const binding = lifecycle.bindings[0];
    const room = rooms.instances[0];
    binding.onStatus?.({ state: "retrying", message: "피어에게 전달한 변경을 기기에 보관 중", pendingCount: 1, nonAuthoritativeDeliveryPending: true });
    expect(runtime.status.canonicalAuthority).toBe(true);
    room.ready = false;
    room.emit({ type: "transport-status", status: { state: "disconnected", message: "연결 종료", recoverable: true } });
    expect(runtime.status.canonicalAuthority).toBe(false);
    room.ready = true;
    binding.onStatus?.({ state: "retrying", message: "재연결 대기", pendingCount: 1, nonAuthoritativeDeliveryPending: true });
    expect(runtime.status.canonicalAuthority).toBe(false);
    binding.onStatus?.({ state: "ready", message: "로컬 문서 재확인 완료" });
    expect(runtime.status.canonicalAuthority).toBe(true);
  });

  it("준비된 소켓만 있고 정본 확인이 없으면 새 오프라인 런타임에 권위를 부여하지 않는다", async () => {
    offlineAuthority.enabled = true;
    offlineAuthority.fanout = "authoritative";
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = { state: "syncing", message: "정본 대기" };
    await renderProvider();
    await vi.waitFor(async () => {
      await renderProvider();
      expect(offlineAuthority.instances).toHaveLength(1);
    });
    expect(offlineAuthority.instances[0].status.canonicalAuthority).toBe(false);
  });

  it("automatically recreates a failed server generation and stops retrying once connected", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
    lifecycle.roomStart = "reject";
    const options = { serverRequired: true };
    try {
      const failed = await renderProvider(options);
      expect(failed.room).toBeNull();
      expect(failed.availability).toBe("error");
      expect(failed.connectionRecovery).toBe("waiting");
      expect(rooms.instances).toHaveLength(1);
      lifecycle.roomStart = "resolve";
      await vi.advanceTimersByTimeAsync(2_000);
      const connected = await renderProvider(options);
      expect(rooms.instances).toHaveLength(2);
      expect(rooms.instances[0]?.closeCount).toBe(1);
      expect(connected.room?.ready).toBe(true);
      expect(connected.connectionRecovery).toBe("idle");
      await vi.advanceTimersByTimeAsync(60_000);
      await renderProvider(options);
      expect(rooms.instances).toHaveLength(2);
    } finally { hooks.unmount(); vi.useRealTimers(); }
  });

  it("does not reset the retry ladder when a ready socket fails initial document sync, and never exhausts", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
    lifecycle.roomStart = "resolve"; lifecycle.bindingStart = "reject";
    const options = { serverRequired: true };
    try {
      let failed = await renderProvider(options);
      for (const delay of [2000, 5000, 10000]) {
        expect(failed.availability).toBe("error");
        expect(failed.connectionRecovery).toBe("waiting");
        await vi.advanceTimersByTimeAsync(delay);
        failed = await renderProvider(options);
      }
      expect(rooms.instances).toHaveLength(4);
      // 소켓이 준비됐던 실패도 사다리를 리셋하지 않는다 — 다음 시도는 마지막 간격(30초)을
      // 채운 뒤에야 일어나고, 예전처럼 영구 정지하지도 않는다.
      await vi.advanceTimersByTimeAsync(29_999);
      await renderProvider(options);
      expect(rooms.instances).toHaveLength(4);
      await vi.advanceTimersByTimeAsync(30_001);
      failed = await renderProvider(options);
      expect(rooms.instances).toHaveLength(5);
      expect(failed.connectionRecovery).toBe("waiting");
    } finally { hooks.unmount(); vi.useRealTimers(); }
  });

  it("closes the previous room when the work or authorized participant changes", async () => {
    const onRoomChange = vi.fn();
    await renderProvider({ onRoomChange });
    const first = rooms.instances[0];

    await renderProvider({ workId: "work-b", onRoomChange });
    const second = rooms.instances[1];
    expect(first.closeCount).toBe(1);
    expect(first.unsubscribeCount).toBe(1);
    expect(second.options.workId).toBe("work-b");

    await renderProvider({ workId: "work-b", participant: null, onRoomChange });
    expect(second.closeCount).toBe(1);
    expect(rooms.instances).toHaveLength(2);

    await renderProvider({
      workId: "work-b",
      participant: { displayName: "서윤", role: "commenter" },
      onRoomChange,
    });
    const third = rooms.instances[2];
    expect(third.options.participant).toMatchObject({
      displayName: "서윤 · 이 탭",
      role: "commenter",
    });

    await renderProvider({
      workId: "work-b",
      participant: { displayName: "민호", role: "owner" },
      onRoomChange,
    });
    expect(third.closeCount).toBe(1);
    expect(third.unsubscribeCount).toBe(1);
    expect(rooms.instances[3].options.participant).toMatchObject({
      displayName: "민호 · 이 탭",
      role: "owner",
    });
  });

  it("updates page and tool presence without recreating the room", async () => {
    const onRoomChange = vi.fn();
    await renderProvider({ onRoomChange });
    const room = rooms.instances[0];

    expect(room.presenceUpdates).toEqual([{ pageId: "page-a", tool: "pen" }]);

    await renderProvider({ currentPageId: "page-b", currentTool: "eraser", onRoomChange });

    expect(rooms.instances).toHaveLength(1);
    expect(room.closeCount).toBe(0);
    expect(room.presenceUpdates).toEqual([
      { pageId: "page-a", tool: "pen" },
      { pageId: "page-b", tool: "eraser" },
    ]);
    expect(room.clearCursorCount).toBe(1);
  });

  it("builds no room until the deferred room module resolves, then runs the session normally", async () => {
    lifecycle.roomStart = "resolve";
    const onRoomChange = vi.fn();

    // One synchronous render pass is exactly what first paint of the canvas does. Nothing from
    // studio-live-collaboration-room may be reachable at that point — the module, its transports
    // and the live wire protocol only load once the gated effect asks for a session.
    const connecting = renderProviderOnce({ onRoomChange });
    expect(rooms.instances).toHaveLength(0);
    expect(onRoomChange).not.toHaveBeenCalled();
    expect(connecting.availability).toBe("connecting");

    const live = await renderProvider({ onRoomChange });

    expect(rooms.instances).toHaveLength(1);
    expect(rooms.instances[0]?.startCount).toBe(1);
    expect(onRoomChange).toHaveBeenCalledWith(expect.anything());
    expect(live.room).not.toBeNull();
    expect(live.availability).not.toBe("error");

    // The session still behaves the same after the chunk lands: presence, locks and chat all
    // flow through the subscription the deferred room installed.
    rooms.instances[0]?.emit({ type: "locks", locks: [] });
    const settled = await renderProvider({ onRoomChange });
    expect(settled.locks).toEqual([]);

    hooks.unmount();
    expect(rooms.instances[0]?.unsubscribeCount).toBe(1);
    await vi.waitFor(() => expect(rooms.instances[0]?.closeCount).toBe(1));
  });

  it("tears the effect down cleanly when it unmounts while the room module is still loading", async () => {
    const onRoomChange = vi.fn();

    renderProviderOnce({ onRoomChange });
    expect(rooms.instances).toHaveLength(0);
    hooks.unmount();
    for (let tick = 0; tick < 16; tick += 1) await Promise.resolve();

    // An in-flight import must not resurrect a room for an editor that is already gone, and no
    // room object may escape to the parent after the teardown.
    expect(rooms.instances).toHaveLength(0);
    expect(
      onRoomChange.mock.calls.filter(([exposedRoom]) => exposedRoom !== null)
    ).toHaveLength(0);
  });

  it("starts a same-origin jam on the local transport even when a server factory exists", async () => {
    const live = await renderProvider({ serverRequired: false });

    expect(rooms.instances).toHaveLength(1);
    // The adaptive cursor transport is always installed; a same-origin jam is the case where it
    // wraps no server base factory.
    const jamFactory = rooms.instances[0]?.options.dependencies?.transportFactory as
      { wrappedBaseFactory?: unknown } | undefined;
    expect(jamFactory).toBeTypeOf("function");
    expect(jamFactory?.wrappedBaseFactory ?? null).toBeNull();
    expect(live.usingLocalFallback).toBe(true);
    expect(live.availability).not.toBe("error");
  });

  it("fails closed when an authenticated work loses its server transport", async () => {
    const live = await renderProvider({ transportFactory: null, serverRequired: true });

    expect(rooms.instances).toHaveLength(0);
    expect(live.availability).toBe("error");
    expect(live.mode).toBe("server");
    expect(live.usingLocalFallback).toBe(false);
    expect(live.error).toContain("자동 전환하지 않았습니다");
  });

  it("latches a terminal authorization failure across retries and transport rotation", async () => {
    const options = { serverRequired: true };
    await renderProvider(options);
    const room = rooms.instances[0];
    room.emit({
      type: "transport-status",
      status: {
        state: "revoked",
        recoverable: false,
        message: "작품 접근 권한이 회수되었습니다.",
      },
    });

    const revoked = await renderProvider(options);
    expect(revoked.localFallbackAllowed).toBe(false);
    expect(revoked.sync).toMatchObject({
      phase: "revoked",
      operationSyncReady: false,
      editsDurablyProtected: false,
    });
    revoked.retryServer();
    revoked.useLocalFallback();
    const afterAttempt = await renderProvider(options);

    expect(rooms.instances).toHaveLength(1);
    expect(afterAttempt.usingLocalFallback).toBe(false);
    expect(room.closeCount).toBe(0);

    const rotatedTransportFactory: StudioLiveTransportFactory = () => {
      throw new Error("A revoked work must not open a replacement transport.");
    };
    const afterTokenRotation = await renderProvider({
      ...options,
      transportFactory: rotatedTransportFactory,
    });

    expect(rooms.instances).toHaveLength(1);
    expect(room.closeCount).toBe(1);
    expect(afterTokenRotation.sync).toMatchObject({
      phase: "revoked",
      operationSyncReady: false,
      editsDurablyProtected: false,
    });
    expect(afterTokenRotation.localFallbackAllowed).toBe(false);

    await renderProvider({
      ...options,
      workId: "work-b",
      transportFactory: rotatedTransportFactory,
    });
    expect(rooms.instances).toHaveLength(2);
    expect(rooms.instances[1]?.options.workId).toBe("work-b");
  });

  it("keeps transport revocation terminal when CRDT recovery reports afterward", async () => {
    lifecycle.roomStart = "resolve";
    const options = { serverRequired: true, outboxScope: "user-a" };
    await renderProvider(options);
    await vi.waitFor(() => expect(lifecycle.bindings).toHaveLength(1));

    rooms.instances[0]?.emit({
      type: "transport-status",
      status: {
        state: "revoked",
        recoverable: false,
        message: "작품 접근 권한이 회수되었습니다.",
      },
    });
    lifecycle.bindings[0]?.onStatus?.({
      state: "recovery-required",
      message: "거부된 변경 때문에 권위 원고 복구가 필요합니다.",
      code: "access_revoked",
      updateId: "private-update-id",
      recoveryUpdateCount: 1,
      collaborativeEditsBlocked: true,
      retryable: false,
      recoveryVaultId: "private-vault-id",
      recoveryExportAvailable: true,
    });

    const live = await renderProvider(options);
    expect(live.sync).toMatchObject({
      phase: "revoked",
      operationSyncReady: false,
      editsDurablyProtected: false,
    });
    expect(live.recovery).toBeNull();
    expect(live.error).toBe("작품 접근 권한이 회수되었습니다.");
    expect(live.localFallbackAllowed).toBe(false);
  });

  it("replaces CRDT recovery with transport revocation and keeps it across rotation", async () => {
    lifecycle.roomStart = "resolve";
    const options = { serverRequired: true, outboxScope: "user-a" };
    await renderProvider(options);
    await vi.waitFor(() => expect(lifecycle.bindings).toHaveLength(1));

    lifecycle.bindings[0]?.onStatus?.({
      state: "recovery-required",
      message: "거부된 변경 때문에 권위 원고 복구가 필요합니다.",
      code: "access_revoked",
      updateId: "private-update-id",
      recoveryUpdateCount: 1,
      collaborativeEditsBlocked: true,
      retryable: false,
      recoveryVaultId: "private-vault-id",
      recoveryExportAvailable: true,
    });
    expect((await renderProvider(options)).sync.phase).toBe("recovery-required");

    rooms.instances[0]?.emit({
      type: "transport-status",
      status: {
        state: "revoked",
        recoverable: false,
        message: "작품 접근 권한이 회수되었습니다.",
      },
    });
    const revoked = await renderProvider(options);
    expect(revoked.sync.phase).toBe("revoked");
    expect(revoked.recovery).toBeNull();
    expect(revoked.error).toBe("작품 접근 권한이 회수되었습니다.");

    const rotatedTransportFactory: StudioLiveTransportFactory = () => {
      throw new Error("A revoked work must not open a replacement transport.");
    };
    const afterRotation = await renderProvider({
      ...options,
      transportFactory: rotatedTransportFactory,
    });
    expect(rooms.instances).toHaveLength(1);
    expect(afterRotation.sync).toMatchObject({
      phase: "revoked",
      operationSyncReady: false,
      editsDurablyProtected: false,
    });
    expect(afterRotation.recovery).toBeNull();
    expect(afterRotation.localFallbackAllowed).toBe(false);
  });

  it("unsubscribes, closes, and clears the exposed room on unmount", async () => {
    lifecycle.roomStart = "resolve";
    const onRoomChange = vi.fn();
    let live = await renderProvider({ onRoomChange });
    const room = rooms.instances[0];
    await vi.waitFor(async () => {
      live = await renderProvider({ onRoomChange });
      expect(live.availability).toBe("ready");
    });

    hooks.unmount();

    expect(room.unsubscribeCount).toBe(1);
    await vi.waitFor(() => expect(room.closeCount).toBe(1));
    expect(onRoomChange).toHaveBeenLastCalledWith(null);
  });

  it("exposes the CRDT document only after binding sync and destroys it on unmount", async () => {
    lifecycle.roomStart = "resolve";
    const onRoomChange = vi.fn();
    const onCrdtDocumentChange = vi.fn();
    await renderProvider({ onRoomChange, onCrdtDocumentChange });

    await vi.waitFor(async () => {
      expect(lifecycle.bindings).toHaveLength(1);
      expect(onCrdtDocumentChange).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          publish: expect.any(Function),
          reconcileHistory: expect.any(Function),
          reconcilePages: expect.any(Function),
        })
      );
    });
    const room = rooms.instances[0];
    const binding = lifecycle.bindings[0];
    const document = lifecycle.documents[0];

    hooks.unmount();
    await vi.waitFor(async () => {
      expect(binding?.closeGracefullyCount).toBe(1);
      expect(document?.destroyCount).toBe(1);
      expect(room?.closeCount).toBe(1);
    });

    expect(onCrdtDocumentChange).toHaveBeenLastCalledWith(null, null);
    expect(onRoomChange).toHaveBeenLastCalledWith(null);
  });

  it("keeps operation sync fail-closed while the lazy runtime and initial binding are pending", async () => {
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStart = "pending";
    const onRoomChange = vi.fn();
    const onCrdtDocumentChange = vi.fn();
    const options = { onRoomChange, onCrdtDocumentChange };

    const connecting = await renderProvider(options);

    expect(onRoomChange).toHaveBeenCalledWith(expect.anything());
    expect(onCrdtDocumentChange).toHaveBeenLastCalledWith(null, null);
    expect(connecting.availability).toBe("connecting");
    await vi.waitFor(async () => {
      expect(lifecycle.bindings).toHaveLength(1);
      expect(lifecycle.bindingStartResolvers).toHaveLength(1);
    });
    expect(
      onCrdtDocumentChange.mock.calls.filter(([document]) => document !== null)
    ).toHaveLength(0);

    lifecycle.bindingStartResolvers[0]?.();

    await vi.waitFor(async () => {
      expect(onCrdtDocumentChange).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          publish: expect.any(Function),
          reconcileHistory: expect.any(Function),
          reconcilePages: expect.any(Function),
        })
      );
    });
  });

  it("does not overwrite a degraded local durability warning with ready after initial sync", async () => {
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = {
      state: "error",
      message: "실시간 서버 동기화는 유지되지만 IndexedDB 복구 저장소가 저하되었습니다.",
      durabilityAtRisk: true,
    };
    const onCrdtDocumentChange = vi.fn();
    const options = { onCrdtDocumentChange };
    await renderProvider(options);

    await vi.waitFor(async () => {
      expect(onCrdtDocumentChange).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          publish: expect.any(Function),
          reconcileHistory: expect.any(Function),
          reconcilePages: expect.any(Function),
        })
      );
    });
    const live = await renderProvider(options);

    expect(live.availability).toBe("error");
    expect(live.error).toContain("IndexedDB 복구 저장소가 저하");
    expect(live.sync).toMatchObject({
      phase: "durability-risk",
      editsDurablyProtected: true,
    });
  });

  it("exposes pending count, local durability, transport readiness, and the latest ACK", async () => {
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = {
      state: "ready",
      message: "팀 원고와 로컬 복구 저장소가 동기화됩니다.",
      pendingCount: 0,
      persistenceDurability: "durable",
      transportReady: true,
      lastAckAt: 1_234,
      lastAckServerSequence: "27",
    };
    const options = { onCrdtDocumentChange: vi.fn() };
    await renderProvider(options);

    await vi.waitFor(async () => {
      expect(options.onCrdtDocumentChange).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything()
      );
    });
    const live = await renderProvider(options);
    expect(live.sync).toMatchObject({
      phase: "synced",
      pendingCount: 0,
      persistenceDurability: "durable",
      transportReady: true,
      operationSyncReady: true,
      lastAckAt: 1_234,
      lastAckServerSequence: "27",
      editsDurablyProtected: true,
    });
  });

  it("does not trigger hard reload while synced", async () => {
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = {
      state: "ready",
      message: "팀 원고와 로컬 복구 저장소가 동기화됩니다.",
      pendingCount: 0,
      persistenceDurability: "durable",
      transportReady: true,
      lastAckAt: 1_234,
      lastAckServerSequence: "27",
    };

    const reloadSpy = vi.fn();
    vi.stubGlobal("location", { reload: reloadSpy } as unknown as Location);
    const onCrdtDocumentChange = vi.fn();
    const options = { onCrdtDocumentChange };
    await renderProvider(options);

    await vi.waitFor(async () => {
      expect(lifecycle.bindings).toHaveLength(1);
      expect(onCrdtDocumentChange).toHaveBeenCalledWith(expect.anything(), expect.anything());
    });

    const live = await renderProvider(options);
    await vi.waitFor(async () => {
      expect(live.sync.phase).toBe("synced");
    });

    live.reloadAuthoritative();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("exposes a same-generation authoritative save barrier and revokes it on teardown", async () => {
    lifecycle.roomStart = "resolve";
    const onAuthoritativeSaveBarrierChange = vi.fn();
    const options = {
      onCrdtDocumentChange: vi.fn(),
      onAuthoritativeSaveBarrierChange,
    };
    await renderProvider(options);

    await vi.waitFor(async () => {
      expect(onAuthoritativeSaveBarrierChange).toHaveBeenCalledWith(expect.any(Function));
    });
    const barrier = onAuthoritativeSaveBarrierChange.mock.calls
      .map(([candidate]) => candidate)
      .find((candidate) => typeof candidate === "function") as (() => Promise<unknown>);

    await expect(barrier()).resolves.toEqual({
      serverSequence: "41",
      acknowledgedAt: 1_234,
    });
    expect(lifecycle.bindings[0]?.authoritativeBarrierCount).toBe(1);

    hooks.unmount();
    expect(onAuthoritativeSaveBarrierChange).toHaveBeenLastCalledWith(null);
  });

  it("exposes delivery on the document runtime and rejects retained callbacks after teardown", async () => {
    lifecycle.roomStart = "resolve";
    const onCrdtDocumentChange = vi.fn();
    await renderProvider({ onCrdtDocumentChange });
    await vi.waitFor(() => expect(onCrdtDocumentChange).toHaveBeenCalledWith(expect.anything(), expect.anything()));
    const runtime = onCrdtDocumentChange.mock.calls.find(([document]) => document !== null)![1] as StudioCrdtSceneGraphRuntime;
    await runtime.flushAndWaitForDelivery(321);
    await expect(runtime.flushAndWaitForDraftProtection(654)).resolves.toEqual({
      protection: "device",
      serverSequence: null,
      acknowledgedAt: null,
      protectedUpdateIds: ["update-1"],
    });
    await runtime.acknowledgeDraftProtection(["update-1"]);
    expect(lifecycle.bindings[0]?.deliveryTimeouts).toEqual([321]);
    expect(lifecycle.bindings[0]?.draftProtectionTimeouts).toEqual([654]);
    expect(lifecycle.bindings[0]?.acknowledgedDraftProtection).toEqual([["update-1"]]);
    expect(lifecycle.bindings[0]?.authoritativeBarrierCount).toBe(0);
    hooks.unmount();
    expect(onCrdtDocumentChange).toHaveBeenLastCalledWith(null, null);
    await expect(runtime.flushAndWaitForDelivery()).rejects.toThrow("원고가 변경되었습니다");
    await expect(runtime.flushAndWaitForDraftProtection()).rejects.toThrow("원고가 변경되었습니다");
    await expect(runtime.acknowledgeDraftProtection(["update-2"])).rejects.toThrow("원고가 변경되었습니다");
    expect(lifecycle.bindings[0]?.deliveryTimeouts).toEqual([321]);
    expect(lifecycle.bindings[0]?.draftProtectionTimeouts).toEqual([654]);
  });

  it("rejects a late delivery completion from an older binding without affecting the new document runtime", async () => {
    lifecycle.roomStart = "resolve";
    const onCrdtDocumentChange = vi.fn();
    await renderProvider({ onCrdtDocumentChange });
    await vi.waitFor(() => expect(onCrdtDocumentChange).toHaveBeenCalledWith(expect.anything(), expect.anything()));
    const previous = onCrdtDocumentChange.mock.calls.find(([document]) => document !== null)![1] as StudioCrdtSceneGraphRuntime;
    let release!: () => void;
    lifecycle.bindings[0]!.deliveryBarrier = new Promise<void>((resolve) => { release = resolve; });
    const rejected = expect(previous.flushAndWaitForDelivery()).rejects.toThrow("원고가 변경되었습니다");
    await renderProvider({ workId: "work-b", onCrdtDocumentChange });
    await vi.waitFor(() => expect(lifecycle.bindings).toHaveLength(2));
    const current = onCrdtDocumentChange.mock.calls.filter(([document]) => document !== null).at(-1)![1] as StudioCrdtSceneGraphRuntime;
    expect(current).not.toBe(previous);
    await current.flushAndWaitForDelivery(456);
    release();
    await rejected;
    expect(lifecycle.bindings[0]?.deliveryTimeouts).toEqual([undefined]);
    expect(lifecycle.bindings[1]?.deliveryTimeouts).toEqual([456]);
  });

  it("reports fail-closed edit safety when both the server and browser outbox are unavailable", async () => {
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = {
      state: "ready",
      message: "팀 원고와 로컬 복구 저장소가 동기화됩니다.",
      pendingCount: 0,
      persistenceDurability: "durable",
      transportReady: true,
    };
    const onEditSafetyChange = vi.fn();
    const options = {
      onCrdtDocumentChange: vi.fn(),
      onEditSafetyChange,
    };
    await renderProvider(options);

    await vi.waitFor(async () => {
      await renderProvider(options);
      expect(onEditSafetyChange).toHaveBeenLastCalledWith(true);
    });

    lifecycle.bindings[0]?.onStatus?.({
      state: "error",
      message: "서버 연결과 브라우저 복구 저장소가 모두 준비되지 않았습니다.",
      durabilityAtRisk: true,
      pendingCount: 1,
      persistenceDurability: "unavailable",
      transportReady: false,
    });
    await renderProvider(options);

    expect(onEditSafetyChange).toHaveBeenLastCalledWith(false);
  });

  it("locks collaborative editing immediately when a permanent CRDT rejection requires recovery", async () => {
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = {
      state: "ready",
      message: "팀 원고가 실시간으로 동기화됩니다.",
    };
    const onCrdtDocumentChange = vi.fn();
    const options = { onCrdtDocumentChange, serverRequired: true };
    await renderProvider(options);

    await vi.waitFor(async () => {
      expect(lifecycle.bindings).toHaveLength(1);
      expect(onCrdtDocumentChange).toHaveBeenCalledWith(expect.anything(), expect.anything());
    });
    lifecycle.bindings[0]?.onStatus?.({
      state: "recovery-required",
      message: "서버가 이 변경을 영구 거부해 권위 원고 복구가 필요합니다.",
      code: "forbidden",
      updateId: "private-update-id",
      recoveryUpdateCount: 1,
      collaborativeEditsBlocked: true,
      retryable: false,
      recoveryVaultId: "private-vault-id",
      recoveryExportAvailable: true,
    });

    const live = await renderProvider(options);
    expect(live.sync).toMatchObject({
      phase: "recovery-required",
      operationSyncReady: false,
      editsDurablyProtected: false,
    });
    expect(live.recovery).toMatchObject({
      vaultId: "private-vault-id",
      updateCount: 1,
      exportAvailable: true,
      exported: false,
    });
    expect(live.localFallbackAllowed).toBe(false);
    expect(live.error).toContain("권위 원고 복구");
    expect(onCrdtDocumentChange).toHaveBeenLastCalledWith(null, null);

    live.retryServer();
    live.useLocalFallback();
    const afterBypassAttempts = await renderProvider(options);
    expect(rooms.instances).toHaveLength(1);
    expect(afterBypassAttempts.mode).toBe("server");
    expect(afterBypassAttempts.usingLocalFallback).toBe(false);
  });

  it("keeps an exported recovery boundary latched across transport factory rotation until full reload", async () => {
    lifecycle.roomStart = "resolve";
    const onCrdtDocumentChange = vi.fn();
    const options = { onCrdtDocumentChange, outboxScope: "user-a" };
    await renderProvider(options);

    await vi.waitFor(async () => {
      expect(lifecycle.bindings).toHaveLength(1);
      expect(onCrdtDocumentChange).toHaveBeenCalledWith(expect.anything(), expect.anything());
    });
    lifecycle.bindings[0]?.onStatus?.({
      state: "recovery-required",
      message: "거부된 변경을 내보낸 뒤 서버 원고를 다시 열어야 합니다.",
      code: "forbidden",
      updateId: "private-update-id",
      recoveryUpdateCount: 2,
      collaborativeEditsBlocked: true,
      retryable: false,
      recoveryVaultId: "private-vault-id",
      recoveryExportAvailable: true,
    });

    const recoveryRequired = await renderProvider(options);
    recoveryVault.entries.push(recoveryVaultEntry({
      rejectedUpdateId: "private-update-id",
    }));
    await recoveryRequired.exportRecovery();
    const exported = await renderProvider(options);
    expect(exported.recovery?.exported).toBe(true);
    expect(recoveryDownloads.count).toBe(1);

    const rotatedTransportFactory: StudioLiveTransportFactory = () => {
      throw new Error("The latched recovery boundary must not open a replacement transport.");
    };
    const afterTokenRotation = await renderProvider({
      ...options,
      transportFactory: rotatedTransportFactory,
    });

    expect(rooms.instances).toHaveLength(1);
    expect(afterTokenRotation.sync).toMatchObject({
      phase: "recovery-required",
      editsDurablyProtected: false,
    });
    expect(afterTokenRotation.recovery).toMatchObject({ exported: true, updateCount: 2 });
    expect(afterTokenRotation.localFallbackAllowed).toBe(false);
    expect(onCrdtDocumentChange).toHaveBeenLastCalledWith(null, null);
  });

  it("rehydrates a late preserved recovery frontier after transport generation rotation", async () => {
    lifecycle.roomStart = "resolve";
    const onCrdtDocumentChange = vi.fn();
    const options = { onCrdtDocumentChange, outboxScope: "user-late" };
    await renderProvider(options);

    await vi.waitFor(async () => {
      expect(lifecycle.bindings).toHaveLength(1);
      expect(onCrdtDocumentChange).toHaveBeenCalledWith(expect.anything(), expect.anything());
    });
    lifecycle.bindings[0]?.onStatus?.({
      state: "recovery-required",
      message: "복구 frontier를 영구 저장소에 보존하는 중입니다.",
      code: "forbidden",
      updateId: "late-preserved-update",
      recoveryUpdateCount: 1,
      collaborativeEditsBlocked: true,
      retryable: false,
      recoveryExportAvailable: false,
    });

    const preserving = await renderProvider(options);
    expect(preserving.recovery).toMatchObject({
      vaultId: null,
      exportAvailable: false,
      exported: false,
    });

    recoveryVault.entries.push(
      recoveryVaultEntry({
        scope: "user-late",
        rejectedUpdateId: "older-unrelated-update",
        vaultId: "older-vault",
        status: "exported",
      }),
      recoveryVaultEntry({
        scope: "user-late",
        rejectedUpdateId: "late-preserved-update",
        vaultId: "late-vault",
      })
    );
    // The first read races the manifest commit and sees no entry; the cancellable retry must recover.
    recoveryVault.emptyReadsBeforeVisible = 1;
    const rotatedTransportFactory: StudioLiveTransportFactory = () => {
      throw new Error("A recovery boundary must not open a replacement transport.");
    };
    const rotatedOptions = {
      ...options,
      transportFactory: rotatedTransportFactory,
    };
    const immediatelyAfterRotation = await renderProvider(rotatedOptions);
    expect(immediatelyAfterRotation.recovery?.exportAvailable).toBe(false);

    await vi.waitFor(async () => {
      expect((await renderProvider(rotatedOptions)).recovery).toMatchObject({
        vaultId: "late-vault",
        exportAvailable: true,
        exported: false,
      });
    });
    const hydrated = await renderProvider(rotatedOptions);
    await hydrated.exportRecovery();
    const exported = await renderProvider(rotatedOptions);

    expect(rooms.instances).toHaveLength(1);
    expect(recoveryVault.listCount).toBeGreaterThanOrEqual(3);
    expect(recoveryDownloads.count).toBe(1);
    expect(exported.recovery).toMatchObject({
      vaultId: "late-vault",
      exportAvailable: true,
      exported: true,
    });
  });

  it("keeps checking a terminal recovery boundary after the former retry window", async () => {
    lifecycle.roomStart = "resolve";
    const options = {
      onCrdtDocumentChange: vi.fn(),
      outboxScope: "user-slow-vault",
    };
    await renderProvider(options);
    await vi.waitFor(() => expect(lifecycle.bindings).toHaveLength(1));
    lifecycle.bindings[0]?.onStatus?.({
      state: "recovery-required",
      message: "대형 복구 frontier를 저장하는 중입니다.",
      code: "forbidden",
      updateId: "slow-preserved-update",
      recoveryUpdateCount: 4_097,
      collaborativeEditsBlocked: true,
      retryable: false,
      recoveryExportAvailable: false,
    });
    await renderProvider(options);

    recoveryVault.entries.push(recoveryVaultEntry({
      scope: "user-slow-vault",
      rejectedUpdateId: "slow-preserved-update",
      vaultId: "slow-vault",
    }));
    // The old implementation stopped permanently after ten reads. Keep the manifest hidden for
    // longer than that boundary and advance the low-frequency polling without a real-time wait.
    recoveryVault.emptyReadsBeforeVisible = 12;
    const rotatedOptions = {
      ...options,
      transportFactory: (() => {
        throw new Error("A terminal recovery boundary must remain closed.");
      }) as StudioLiveTransportFactory,
    };

    vi.useFakeTimers();
    try {
      await renderProvider(rotatedOptions);
      for (let attempt = 0; attempt < 13; attempt += 1) {
        await vi.advanceTimersByTimeAsync(5_000);
        await renderProvider(rotatedOptions);
      }
      expect((await renderProvider(rotatedOptions)).recovery).toMatchObject({
        vaultId: "slow-vault",
        updateCount: 4_097,
        exportAvailable: true,
        exported: false,
      });
      expect(recoveryVault.listCount).toBeGreaterThan(10);
      expect(rooms.instances).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never exposes a divergent document rejected during the initial outbox drain", async () => {
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = {
      state: "recovery-required",
      message: "보관된 변경이 영구 거부되어 권위 원고를 다시 불러와야 합니다.",
      code: "invalid_payload",
      updateId: "private-restored-update",
      recoveryUpdateCount: 2,
      collaborativeEditsBlocked: true,
      retryable: false,
      recoveryVaultId: "restored-vault-id",
      recoveryExportAvailable: true,
    };
    const onCrdtDocumentChange = vi.fn();
    const options = { onCrdtDocumentChange };
    await renderProvider(options);

    await vi.waitFor(async () => {
      expect(lifecycle.bindings).toHaveLength(1);
      expect(onCrdtDocumentChange).toHaveBeenCalled();
    });
    const live = await renderProvider(options);

    expect(
      onCrdtDocumentChange.mock.calls.filter(([document]) => document !== null)
    ).toHaveLength(0);
    expect(live.sync.phase).toBe("recovery-required");
    expect(live.sync.operationSyncReady).toBe(false);
  });

  it("fails closed and releases every resource when initial CRDT sync rejects", async () => {
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStart = "reject";
    const onRoomChange = vi.fn();
    const onCrdtDocumentChange = vi.fn();
    const options = { onRoomChange, onCrdtDocumentChange };
    await renderProvider(options);

    await vi.waitFor(async () => {
      expect(lifecycle.bindings).toHaveLength(1);
      expect(lifecycle.bindings[0]?.closeCount).toBe(1);
      expect(lifecycle.documents[0]?.destroyCount).toBe(1);
      expect(rooms.instances[0]?.closeCount).toBe(1);
    });
    const failed = await renderProvider(options);

    expect(failed.availability).toBe("error");
    expect(failed.error).toContain("binding start failed");
    expect(onCrdtDocumentChange).toHaveBeenLastCalledWith(null, null);
    expect(onRoomChange).toHaveBeenLastCalledWith(null);

    hooks.unmount();
    expect(rooms.instances[0]?.closeCount).toBe(1);
    expect(lifecycle.documents[0]?.destroyCount).toBe(1);
  });
});
