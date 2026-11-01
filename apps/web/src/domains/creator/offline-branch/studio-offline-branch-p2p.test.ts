import { describe, expect, it, vi } from "vitest";

import { connectStudioOfflineBranchPeerSync } from "./studio-offline-branch-p2p";

import type { StudioLiveRoom } from "../live/studio-live-collaboration-room";
import type { StudioPeerFabricEvent } from "../live/studio-peer-fabric";
import type { StudioOfflineBranchRuntime } from "./studio-offline-branch-runtime";

describe("connectStudioOfflineBranchPeerSync", () => {
  it("does not rebroadcast an unchanged pending branch signature", () => {
    const broadcast = vi.fn();
    const peerIds: string[] = [];
    const unsubscribeFabric = vi.fn();
    const unregisterBulk = vi.fn();
    const unsubscribeRuntime = vi.fn();
    const status = {
      state: "editing" as const,
      pendingOperations: 1,
      conflicts: 0,
      canonicalAuthority: false,
      durability: "durable" as const,
      storageMessage: "test",
    };
    const runtime = {
      status,
      snapshot: { heads: ["head-1"] },
      subscribe: vi.fn((listener: (next: typeof status) => void) => {
        listener(status);
        return unsubscribeRuntime;
      }),
    } as unknown as StudioOfflineBranchRuntime;
    const room = {
      peerFabric: {
        broadcast,
        getPeers: vi.fn(() => peerIds.map((sessionId) => ({ sessionId }))),
        subscribe: vi.fn(() => unsubscribeFabric),
      },
      peerBulk: {
        register: vi.fn(() => unregisterBulk),
      },
    } as unknown as StudioLiveRoom;

    const sync = connectStudioOfflineBranchPeerSync({
      runtime,
      room,
      workId: "work-1",
      scope: "user-1",
    });

    expect(sync.enabled).toBe(true);
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast.mock.calls[0]?.[0]).toBe("offline-branch-resolutions-v1");
    expect(JSON.parse(String(broadcast.mock.calls[0]?.[1])).wire).toBe("studio-offline-branch-hello-v3");
    sync.announce();
    expect(broadcast).toHaveBeenCalledTimes(1);

    peerIds.push("peer-2");
    sync.announce();
    expect(broadcast).toHaveBeenCalledTimes(2);

    sync.close();
    expect(unsubscribeRuntime).toHaveBeenCalledOnce();
    expect(unsubscribeFabric).toHaveBeenCalledOnce();
    expect(unregisterBulk).toHaveBeenCalledOnce();
  });

  it("이전 hello와 bundle은 교환하지 않고 해결된 journal의 변경도 공지한다", async () => {
    const broadcast = vi.fn();
    const exportPeerDocument = vi.fn(async () => Uint8Array.of(1));
    const listeners: Array<(next: typeof status) => void> = [];
    const helloListeners: Array<(event: StudioPeerFabricEvent) => void> = [];
    type Offer = { mimeType: string; metadata: Record<string, string> };
    const registrations: Array<{ accept: (sender: unknown, offer: Offer) => boolean }> = [];
    const status = {
      state: "merged" as const, pendingOperations: 0, conflicts: 0,
      canonicalAuthority: false, durability: "durable" as const, storageMessage: "test",
    };
    const snapshot = { heads: ["head-1"], resolutions: { "operation-1": { action: "keep-canonical" } } };
    const runtime = {
      status, snapshot, exportPeerDocument, peerPayloads: async () => [],
      subscribe: (listener: (next: typeof status) => void) => {
        listeners.push(listener); listener(status); return () => undefined;
      },
    } as unknown as StudioOfflineBranchRuntime;
    const room = {
      peerFabric: {
        broadcast, getPeers: () => [],
        subscribe: (_capability: string, listener: (event: StudioPeerFabricEvent) => void) => {
          helloListeners.push(listener); return () => undefined;
        },
      },
      peerBulk: {
        send: vi.fn(async () => undefined),
        register: (_kind: string, registration: typeof registrations[number]) => {
          registrations.push(registration); return () => undefined;
        },
      },
    } as unknown as StudioLiveRoom;
    const sync = connectStudioOfflineBranchPeerSync({ runtime, room, workId: "work-1", scope: "user-1" });
    helloListeners[0]?.({
      payload: JSON.stringify({ wire: "studio-offline-branch-hello-v2", workId: "work-1", scope: "user-1" }),
      sender: { sessionId: "old-peer" },
    } as unknown as StudioPeerFabricEvent);
    await Promise.resolve();
    expect(exportPeerDocument).not.toHaveBeenCalled();
    expect(registrations[0]?.accept(null, {
      mimeType: "application/vnd.toonstudio.offline-branch+binary",
      metadata: { wire: "studio-offline-branch-peer-bundle-v2", workId: "work-1", scope: "user-1" },
    })).toBe(false);
    expect(registrations[0]?.accept(null, {
      mimeType: "application/vnd.toonstudio.offline-branch+binary",
      metadata: { wire: "studio-offline-branch-peer-bundle-v3", workId: "work-1", scope: "user-1" },
    })).toBe(true);
    expect(broadcast).toHaveBeenCalledTimes(1);
    snapshot.heads = ["head-2"];
    listeners[0]?.(status);
    expect(broadcast).toHaveBeenCalledTimes(2);
    sync.close();
  });
});
