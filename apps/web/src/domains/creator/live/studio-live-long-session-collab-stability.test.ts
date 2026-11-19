import { describe, expect, it, vi } from "vitest";

import { SqliteStudioCrdtOutbox } from "./studio-crdt-outbox";
import { STUDIO_CRDT_PROTOCOL_VERSION, type StudioCrdtUpdateRequest } from "./studio-crdt-protocol";
import { STUDIO_LIVE_GESTURE_PREVIEW_VERSION } from "./studio-live-gesture-preview";
import {
  StudioLiveGesturePreviewRoomAdapter,
  type StudioLiveGesturePreviewRoomSource,
} from "./studio-live-gesture-preview-room-adapter";
import {
  STUDIO_LIVE_GESTURE_PREVIEW_TTL_MS,
  StudioLiveGesturePreviewStore,
  type StudioLiveGesturePreviewStoreScheduler,
} from "./studio-live-gesture-preview-store";
import { encodeStudioLiveInkSamples } from "./studio-live-ink-codec";
import {
  STUDIO_LIVE_INK_ACTIVE_STROKE_TTL_MS,
  STUDIO_LIVE_INK_MAX_ACTIVE_STROKES,
  STUDIO_LIVE_INK_PROTOCOL_VERSION,
  STUDIO_LIVE_INK_SAMPLE_SCHEMA,
  StudioLiveInkStrokeTracker,
  type StudioLiveInkBegin,
  type StudioLiveInkChunk,
} from "./studio-live-ink-protocol";

import type { StudioLocalDatabase } from "../studio-local-database";
import type { StudioLiveParticipant } from "./studio-live-collaboration-protocol";
import type { StudioLivePeer, StudioLiveRoomEvent } from "./studio-live-collaboration-room";
import type { StudioLiveGesturePreviewPayload } from "./studio-live-gesture-preview";

function inkPayload(count: number): ArrayBuffer {
  return encodeStudioLiveInkSamples(
    Array.from({ length: count }, (_, index) => ({
      x: index * 3,
      y: index * 2,
      pressure: 0.6,
      timeDeltaMs: 8,
    })),
  );
}

function inkBegin(strokeId: string, startedAt: number): StudioLiveInkBegin {
  return {
    kind: "ink:begin",
    protocolVersion: STUDIO_LIVE_INK_PROTOCOL_VERSION,
    strokeId,
    pageId: "page-collab",
    layerId: "layer-ink",
    coordinateSpaceId: "space-a4",
    coordinateSpaceRevision: 1,
    provider: {
      providerId: "vello-hybrid",
      providerVersion: "1.4.0",
      buildHash: "abc12345",
    },
    brushPresetId: "brush-gpen",
    brushContractHash: "deadbeef",
    seed: 42,
    mode: "pen",
    blendMode: "normal",
    color: "#111111",
    width: 8,
    opacity: 1,
    sampleSchema: STUDIO_LIVE_INK_SAMPLE_SCHEMA,
    startedAt,
  };
}

function inkChunk(
  strokeId: string,
  chunkSequence: number,
  firstSampleIndex: number,
  sampleCount = 4,
): StudioLiveInkChunk {
  return {
    kind: "ink:chunk",
    strokeId,
    chunkSequence,
    firstSampleIndex,
    sampleCount,
    payload: inkPayload(sampleCount),
  };
}

class MultiPeerFakeRoom implements StudioLiveGesturePreviewRoomSource {
  private readonly listeners = new Set<(event: StudioLiveRoomEvent) => void>();

  constructor(private peers: StudioLivePeer[]) {}

  subscribe(listener: (event: StudioLiveRoomEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getPeers(): StudioLivePeer[] {
    return [...this.peers];
  }

  emitPreview(participant: StudioLiveParticipant, payload: StudioLiveGesturePreviewPayload): void {
    for (const listener of [...this.listeners]) {
      listener({ type: "gesture-preview", participant, payload });
    }
  }

  setPeers(peers: StudioLivePeer[]): void {
    this.peers = peers;
    for (const listener of [...this.listeners]) {
      listener({ type: "presence", peers: [...peers] });
    }
  }
}

describe("long-session multi-user collaborative drawing stability", () => {
  it("reaps orphaned ink strokes past TTL while keeping actively streaming strokes alive", () => {
    const tracker = new StudioLiveInkStrokeTracker();
    let now = 1_000_000;

    // Fill all active stroke slots without ever delivering ink:end (simulates dropped packets).
    for (let index = 0; index < STUDIO_LIVE_INK_MAX_ACTIVE_STROKES; index += 1) {
      expect(tracker.accept(inkBegin(`orphan-${index}`, now), now)).toBe(true);
    }
    expect(tracker.activeStrokeCount).toBe(STUDIO_LIVE_INK_MAX_ACTIVE_STROKES);

    // Before TTL expires, overflow still fails closed.
    now += STUDIO_LIVE_INK_ACTIVE_STROKE_TTL_MS - 1_000;
    expect(tracker.accept(inkBegin("blocked-before-ttl", now), now)).toBe(false);

    // Keep stroke 0 actively streaming so only truly idle orphaned strokes expire.
    expect(tracker.accept(inkChunk("orphan-0", 1, 0, 4), now)).toBe(true);

    // Advance past TTL of strokes 1..7 (while stroke 0 is still within TTL).
    now += 2_000;
    const expired = tracker.pruneExpired(now);
    expect(expired).toHaveLength(STUDIO_LIVE_INK_MAX_ACTIVE_STROKES - 1);
    expect(expired).not.toContain("orphan-0");
    expect(tracker.activeStrokeCount).toBe(1);

    // New strokes are now admitted cleanly without permanent peer deadlock.
    expect(tracker.accept(inkBegin("fresh-after-reap", now), now)).toBe(true);
    expect(tracker.activeStrokeCount).toBe(2);
  });

  it("handles 4-peer simultaneous multi-chunk drawing without duplicate reconciliations or orphaned previews", () => {
    let now = 500_000;
    const scheduler: StudioLiveGesturePreviewStoreScheduler = {
      now: () => now,
      setInterval: () => 1,
      clearInterval: () => undefined,
    };
    const store = new StudioLiveGesturePreviewStore({ pageId: "page-a", scheduler });
    const peers: StudioLivePeer[] = ["peer-1", "peer-2", "peer-3", "peer-4"].map((sessionId) => ({
      sessionId,
      displayName: sessionId,
      role: "editor",
      visibility: "active",
      pageId: "page-a",
      lastSeenAt: now,
    }));
    const room = new MultiPeerFakeRoom(peers);
    const adapter = new StudioLiveGesturePreviewRoomAdapter({ pageId: "page-a", store });
    const listener = vi.fn();
    adapter.subscribe(listener);
    adapter.setRoom(room);

    const authoritativeIds: string[] = [];
    for (let round = 0; round < 15; round += 1) {
      now += 40;
      for (const peer of peers) {
        const gestureId = `${peer.sessionId}-stroke-${round}`;
        const callsBeforeBegin = listener.mock.calls.length;
        room.emitPreview(peer, {
          version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
          gestureId,
          pageId: "page-a",
          seq: 1,
          phase: "begin",
          operation: "draw",
          base: { documentGeneration: 1 },
          renderer: { kind: "freehand", mode: "pen", stroke: "#222222", strokeWidth: 4 },
          samples: { startIndex: 0, points: [0, 0, 10, 10], pressures: [0.5, 0.5] },
        });
        expect(listener.mock.calls.length - callsBeforeBegin).toBe(1);

        for (let step = 0; step < 4; step += 1) {
          const callsBeforeAppend = listener.mock.calls.length;
          room.emitPreview(peer, {
            version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
            gestureId,
            pageId: "page-a",
            seq: step + 2,
            phase: "append",
            operation: "draw",
            samples: {
              startIndex: 2 + step * 2,
              points: [20 + step * 4, 20 + step * 4, 22 + step * 4, 22 + step * 4],
              pressures: [0.5, 0.5],
            },
          });
          expect(listener.mock.calls.length - callsBeforeAppend).toBe(1);
        }

        room.emitPreview(peer, {
          version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
          gestureId,
          pageId: "page-a",
          seq: 6,
          phase: "end",
          operation: "draw",
        });
        authoritativeIds.push(gestureId);
        adapter.setAuthoritativeElementIds("page-a", authoritativeIds);
        expect(adapter.markAuthoritativeProjection("page-a", gestureId)).toBe(true);
      }
    }

    // Orphaned stroke from a peer that disappears or goes silent past TTL is cleaned up cleanly.
    room.emitPreview(peers[0]!, {
      version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
      gestureId: "orphaned-no-end",
      pageId: "page-a",
      seq: 1,
      phase: "begin",
      operation: "draw",
      base: { documentGeneration: 1 },
      renderer: { kind: "freehand", mode: "pen", stroke: "#222222", strokeWidth: 4 },
      samples: { startIndex: 0, points: [1, 1, 2, 2], pressures: [0.5, 0.5] },
    });
    expect(adapter.getSnapshot()).toHaveLength(1);

    now += STUDIO_LIVE_GESTURE_PREVIEW_TTL_MS + 100;
    room.setPeers(peers.slice(1));
    expect(adapter.getSnapshot()).toEqual([]);
    expect(adapter.getEligiblePreviewKeys()).toEqual([]);
    adapter.dispose();
  });

  it("keeps SqliteStudioCrdtOutbox clean across 500 rapid put/remove ACK cycles", async () => {
    const rows = new Map<string, {
      scope: string;
      workId: string;
      updateId: string;
      clientSequence: number;
      requestPayload: string;
      payloadBytes: number;
      createdAt: number;
      updatedAt: number;
      attemptCount: number;
      lastAttemptAt: number | null;
      nextRetryAt: number | null;
      lastErrorCode: string | null;
      lastErrorMessage: string | null;
      acknowledgedAt: number | null;
    }>();

    const fakeDb = {
      listCrdtOutboxCandidates: async (scope: string, workId: string) =>
        [...rows.values()].filter((row) => row.scope === scope && row.workId === workId),
      enqueueCrdtOutboxRecord: async (record: {
        scope: string;
        workId: string;
        updateId: string;
        clientSequence: number;
        requestPayload: string;
        payloadBytes: number;
        createdAt: number;
      }) => {
        const key = `${record.scope}:${record.workId}:${record.updateId}`;
        const existing = rows.get(key);
        if (existing?.acknowledgedAt !== null && existing !== undefined) {
          return "acknowledged" as const;
        }
        rows.set(key, {
          ...record,
          updatedAt: record.createdAt,
          attemptCount: 0,
          lastAttemptAt: null,
          nextRetryAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          acknowledgedAt: null,
        });
        return "enqueued" as const;
      },
      acknowledgeCrdtOutboxRecord: async (
        scope: string,
        workId: string,
        updateId: string,
        acknowledgedAt: number,
      ) => {
        const key = `${scope}:${workId}:${updateId}`;
        const existing = rows.get(key);
        if (existing) existing.acknowledgedAt = acknowledgedAt;
      },
      recordCrdtOutboxRetry: async () => undefined,
    };

    const outbox = new SqliteStudioCrdtOutbox({
      acquireDatabase: async () => fakeDb as unknown as StudioLocalDatabase,
      now: () => 2_000_000,
    });

    for (let seq = 1; seq <= 500; seq += 1) {
      const request: StudioCrdtUpdateRequest = {
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: "work-soak",
        updateId: `upd-${seq}`,
        clientSequence: seq,
        update: "AAECAw==",
      };
      await outbox.put("user-soak", request);
      await outbox.remove("user-soak", "work-soak", request.updateId);
    }

    expect(outbox.listEmergency("user-soak", "work-soak")).toEqual([]);
    expect(await outbox.list("user-soak", "work-soak")).toEqual([]);
    expect(outbox.getStatus().state).toBe("durable");
  });
});
