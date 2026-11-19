import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_CRDT_COMPACTION_MIN_UPDATE_BYTES,
  STUDIO_CRDT_RECONNECT_SNAPSHOT_JUMP_GAP_MS,
  STUDIO_CRDT_RECONNECT_SNAPSHOT_JUMP_MAX_BYTES,
  STUDIO_CRDT_RECONNECT_SNAPSHOT_JUMP_MAX_DELTAS,
  StudioCrdtDocument,
  compactStudioCrdtSnapshot,
  shouldJumpToCrdtSnapshotOnReconnect,
} from "./studio-crdt-document";
import {
  STUDIO_CRDT_MAX_RECONCILED_HISTORY_DEPTH,
  trimStudioCrdtHistoryWindow,
} from "./studio-crdt-history";
import { SqliteStudioCrdtOutbox } from "./studio-crdt-outbox";
import { STUDIO_CRDT_PROTOCOL_VERSION, type StudioCrdtUpdateRequest } from "./studio-crdt-protocol";
import { createStudioLiveEnvelope, type StudioLiveParticipant } from "./studio-live-collaboration-protocol";
import { StudioLiveDynamicBrushOverlayRenderer } from "./studio-live-dynamic-brush-overlay";
import { STUDIO_LIVE_GESTURE_PREVIEW_VERSION } from "./studio-live-gesture-preview";
import {
  STUDIO_LIVE_GESTURE_PREVIEW_SLEEP_WAKE_GAP_MS,
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
  StudioLiveInkOverlayRenderer,
  StudioLiveInkPredictionRenderer,
} from "./studio-live-ink-overlay";
import {
  STUDIO_LIVE_INK_ACTIVE_STROKE_TTL_MS,
  STUDIO_LIVE_INK_MAX_ACTIVE_STROKES,
  STUDIO_LIVE_INK_PROTOCOL_VERSION,
  STUDIO_LIVE_INK_SAMPLE_SCHEMA,
  StudioLiveInkStrokeTracker,
  type StudioLiveInkBegin,
  type StudioLiveInkChunk,
} from "./studio-live-ink-protocol";
import {
  STUDIO_HEARTBEAT_THROTTLE_THRESHOLD_MS,
  STUDIO_LIVE_AUTO_DEGRADE_FRAME_MS_THRESHOLD,
  STUDIO_LIVE_AUTO_DEGRADE_PEER_THRESHOLD,
  StudioAdaptiveSaveScheduler,
  StudioLiveHeartbeatJitterGuard,
  collectStudioLiveLongSessionDiagnostics,
  evaluateStudioLiveAutoDegrade,
  evaluateStudioStorageQuota,
  probeStudioStorageQuota,
  serializeStudioLiveDiagnosticsJson,
} from "./studio-live-long-session-diagnostics";
import {
  STUDIO_LIVE_P2P_STALE_PEER_TTL_MS,
  applyStudioLiveP2pOverlay,
} from "./studio-live-p2p-overlay-transport";
import {
  STUDIO_REMOTE_CURSOR_TTL_MS,
  StudioRemoteCursorOverlayStore,
} from "./studio-live-remote-cursor-store";
import { StudioLiveRetainedMediaOverlayRenderer } from "./studio-live-retained-media-overlay";

import type { StudioLocalDatabase } from "../studio-local-database";
import type { StudioLivePeer, StudioLiveRoomEvent } from "./studio-live-collaboration-room";
import type { StudioLiveTransport } from "./studio-live-collaboration-transport";
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
        updateId: `12345678-1234-4234-8234-${String(seq).padStart(12, "0")}`,
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

  it("releases canvas backing stores and cancels pending wake timers when live overlays detach", () => {
    const makeCanvas = () => {
      const context = {
        save() {},
        restore() {},
        setTransform() {},
        clearRect() {},
        beginPath() {},
        arc() {},
        fill() {},
        stroke() {},
        drawImage() {},
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4),
          width: w,
          height: h,
        }),
        putImageData() {},
      };
      return {
        width: 1024,
        height: 768,
        getContext: () => context,
      } as unknown as HTMLCanvasElement;
    };
    const surface = {
      left: 0,
      top: 0,
      width: 1024,
      height: 768,
      documentScale: 1,
      documentWidth: 1024,
      flipX: false,
    };

    const inkCanvas = makeCanvas();
    const inkRenderer = new StudioLiveInkOverlayRenderer();
    inkRenderer.attach(inkCanvas);
    inkRenderer.setSurface(surface);
    expect(inkCanvas.width).toBeGreaterThan(1);
    inkRenderer.attach(null);
    expect(inkCanvas.width).toBe(1);
    expect(inkCanvas.height).toBe(1);

    const predictionCanvas = makeCanvas();
    const predictionRenderer = new StudioLiveInkPredictionRenderer();
    predictionRenderer.attach(predictionCanvas);
    predictionRenderer.setSurface(surface);
    expect(predictionCanvas.width).toBeGreaterThan(1);
    predictionRenderer.attach(null);
    expect(predictionCanvas.width).toBe(1);
    expect(predictionCanvas.height).toBe(1);

    const activeCanvas = makeCanvas();
    const settledCanvas = makeCanvas();
    const retainedRenderer = new StudioLiveRetainedMediaOverlayRenderer();
    retainedRenderer.attach({ activeCanvas, settledCanvas });
    retainedRenderer.setSurface(surface);
    expect(activeCanvas.width).toBeGreaterThan(1);
    expect(settledCanvas.width).toBeGreaterThan(1);
    retainedRenderer.attach(null);
    expect(activeCanvas.width).toBe(1);
    expect(activeCanvas.height).toBe(1);
    expect(settledCanvas.width).toBe(1);
    expect(settledCanvas.height).toBe(1);
  });

  it("evicts silent ghost peers past TTL in P2P overlay so long-session mesh does not poison", async () => {
    let now = 3_000_000;
    const listeners = new Set<(value: unknown) => void>();
    const primary: StudioLiveTransport = {
      mode: "server",
      canvasLockPolicy: "cooperative",
      crdtFanout: "mesh",
      ready: true,
      connect: async () => undefined,
      send: () => true,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      close: () => undefined,
    };
    const self: StudioLiveParticipant = {
      sessionId: "self-session",
      displayName: "Self",
      role: "editor",
    };
    const ghost: StudioLiveParticipant = {
      sessionId: "ghost-session",
      displayName: "Ghost",
      role: "editor",
    };
    const factory = applyStudioLiveP2pOverlay(() => primary, {
      now: () => now,
      createPeerConnection: () => {
        throw new Error("ICE unavailable");
      },
    });
    const transport = factory({ workId: "work-mesh", participant: self });
    await transport.connect();

    const hello = createStudioLiveEnvelope({
      workId: "work-mesh",
      sender: ghost,
      sentAt: now,
      sequence: 1,
      kind: "presence:hello",
      payload: { visibility: "active", pageId: "page-1" },
    });
    for (const listener of listeners) listener(hello);
    expect(transport.direct?.getPeers().map((peer) => peer.sessionId)).toEqual(["ghost-session"]);

    now += STUDIO_LIVE_P2P_STALE_PEER_TTL_MS + 1_000;
    expect(transport.direct?.getPeers()).toEqual([]);
    transport.close();
  });

  it("bounds Undo/Redo history depth during remote CRDT reconciliation while preserving currentIndex", () => {
    const history = Array.from({ length: 240 }, (_, index) => [{ id: `snap-${index}` }]);
    const currentIndex = 225;
    const activeSnapshot = history[currentIndex];

    const bounded = trimStudioCrdtHistoryWindow(history, currentIndex);
    expect(bounded.trimmed).toBe(true);
    expect(bounded.history).toHaveLength(STUDIO_CRDT_MAX_RECONCILED_HISTORY_DEPTH);
    expect(bounded.history[bounded.currentIndex]).toBe(activeSnapshot);

    // Histories within the cap return the original array reference without extra allocation.
    const small = history.slice(0, 10);
    const untouched = trimStudioCrdtHistoryWindow(small, 5);
    expect(untouched.trimmed).toBe(false);
    expect(untouched.history).toBe(small);
    expect(untouched.currentIndex).toBe(5);
  });

  it("purges pre-sleep previews on sleep-wake gap and coalesces 6-peer burst notifications into one frame", () => {
    let now = 4_000_000;
    const pendingFrames: (() => void)[] = [];
    const scheduler: StudioLiveGesturePreviewStoreScheduler = {
      now: () => now,
      setInterval: () => 1,
      clearInterval: () => undefined,
    };
    const store = new StudioLiveGesturePreviewStore({ pageId: "page-a", scheduler });
    const peers: StudioLivePeer[] = Array.from({ length: 6 }, (_, index) => ({
      sessionId: `burst-peer-${index + 1}`,
      displayName: `Peer ${index + 1}`,
      role: "editor",
      visibility: "active",
      pageId: "page-a",
      lastSeenAt: now,
    }));
    const room = new MultiPeerFakeRoom(peers);
    const adapter = new StudioLiveGesturePreviewRoomAdapter({
      pageId: "page-a",
      store,
      now: () => now,
      coalesceListenerNotifications: true,
      scheduleFrame: (flush) => {
        pendingFrames.push(flush);
        return pendingFrames.length;
      },
      cancelFrame: () => undefined,
    });
    const listener = vi.fn();
    adapter.subscribe(listener);
    adapter.setRoom(room);

    // 6 peers each send begin + 3 appends in one frame (24 events) -> coalesced to 1 frame flush.
    for (const peer of peers) {
      room.emitPreview(peer, {
        version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
        gestureId: `${peer.sessionId}-g1`,
        pageId: "page-a",
        seq: 1,
        phase: "begin",
        operation: "draw",
        base: { documentGeneration: 1 },
        renderer: { kind: "freehand", mode: "pen", stroke: "#222222", strokeWidth: 4 },
        samples: { startIndex: 0, points: [0, 0, 5, 5], pressures: [0.5, 0.5] },
      });
      for (let seq = 2; seq <= 4; seq += 1) {
        room.emitPreview(peer, {
          version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
          gestureId: `${peer.sessionId}-g1`,
          pageId: "page-a",
          seq,
          phase: "append",
          operation: "draw",
          samples: { startIndex: seq, points: [seq * 4, seq * 4], pressures: [0.5] },
        });
      }
    }
    expect(listener).toHaveBeenCalledTimes(0);
    expect(pendingFrames).toHaveLength(1);
    pendingFrames.shift()!();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(adapter.getSnapshot()).toHaveLength(6);

    // Simulate 20-minute sleep-wake gap: next room event purges stale pre-sleep previews first.
    now += STUDIO_LIVE_GESTURE_PREVIEW_SLEEP_WAKE_GAP_MS + 1_000;
    room.emitPreview(peers[0]!, {
      version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
      gestureId: "post-wake-stroke",
      pageId: "page-a",
      seq: 1,
      phase: "begin",
      operation: "draw",
      base: { documentGeneration: 2 },
      renderer: { kind: "freehand", mode: "pen", stroke: "#222222", strokeWidth: 4 },
      samples: { startIndex: 0, points: [10, 10, 20, 20], pressures: [0.5, 0.5] },
    });
    adapter.flushPendingNotifications();
    expect(adapter.getSnapshot().map((entry) => entry.gestureId)).toEqual(["post-wake-stroke"]);

    // Backward NTP clock jump must NOT trigger a false sleep-wake purge.
    now -= 60_000;
    room.emitPreview(peers[0]!, {
      version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
      gestureId: "post-wake-stroke",
      pageId: "page-a",
      seq: 2,
      phase: "append",
      operation: "draw",
      samples: { startIndex: 2, points: [30, 30], pressures: [0.5] },
    });
    adapter.setCoalesceListenerNotifications(false);
    expect(adapter.getSnapshot().map((entry) => entry.gestureId)).toEqual(["post-wake-stroke"]);
    adapter.dispose();
  });

  it("compacts accumulated CRDT updates cleanly and enforces reconnect snapshot-jump thresholds", () => {
    const doc = new StudioCrdtDocument();
    const updates: Uint8Array[] = [];
    const unsubscribe = doc.subscribe((update) => {
      updates.push(update);
    });
    for (let index = 0; index < 20; index += 1) {
      doc.addStroke({
        id: `compact-stroke-${index}`,
        pageId: "page-1",
        layerId: "layer-1",
        points: [index, index, index + 10, index + 12],
        pressures: [0.5, 0.7],
        stroke: "#111111",
        strokeWidth: 4,
        opacity: 1,
      });
    }
    unsubscribe();
    const result = compactStudioCrdtSnapshot(updates);
    expect(result.rawBytes).toBeGreaterThan(0);
    expect(result.compactedBytes).toBeLessThanOrEqual(result.rawBytes);
    expect(STUDIO_CRDT_COMPACTION_MIN_UPDATE_BYTES).toBe(256 * 1024);

    const restored = new StudioCrdtDocument(result.compacted);
    expect(restored.getStrokes()).toHaveLength(20);
    restored.destroy();
    doc.destroy();

    expect(shouldJumpToCrdtSnapshotOnReconnect({
      gapMs: 1_000,
      queuedDeltaCount: 10,
      estimatedDeltaBytes: 8_192,
    })).toBe(false);
    expect(shouldJumpToCrdtSnapshotOnReconnect({
      gapMs: STUDIO_CRDT_RECONNECT_SNAPSHOT_JUMP_GAP_MS,
      queuedDeltaCount: 1,
      estimatedDeltaBytes: 128,
    })).toBe(true);
    expect(shouldJumpToCrdtSnapshotOnReconnect({
      gapMs: 1_000,
      queuedDeltaCount: STUDIO_CRDT_RECONNECT_SNAPSHOT_JUMP_MAX_DELTAS,
      estimatedDeltaBytes: 128,
    })).toBe(true);
    expect(shouldJumpToCrdtSnapshotOnReconnect({
      gapMs: 1_000,
      queuedDeltaCount: 1,
      estimatedDeltaBytes: STUDIO_CRDT_RECONNECT_SNAPSHOT_JUMP_MAX_BYTES,
    })).toBe(true);
  });

  it("clamps backward OS clock jumps in Ink tracker so orphaned strokes still expire on time", () => {
    const tracker = new StudioLiveInkStrokeTracker();
    let now = 5_000_000;
    expect(tracker.accept(inkBegin("clock-skew-stroke", now), now)).toBe(true);
    // Simulate NTP stepping OS clock backward by 2 minutes.
    now -= 120_000;
    expect(tracker.pruneExpired(now)).toEqual([]);
    expect(tracker.activeStrokeCount).toBe(1);
    // Advancing just past TTL from the clamped time still reaps cleanly without waiting 120s + TTL.
    now += STUDIO_LIVE_INK_ACTIVE_STROKE_TTL_MS + 100;
    expect(tracker.pruneExpired(now)).toEqual(["clock-skew-stroke"]);
    expect(tracker.activeStrokeCount).toBe(0);
  });

  it("collects 6-metric diagnostics JSON and defers autosave during active input under a strict maxWait cap", () => {
    const healthy = collectStudioLiveLongSessionDiagnostics({
      activeInkStrokes: 2,
      settledStrokeCount: 3,
      undoHistoryDepth: 42,
      outboxQueueSize: 0,
      p2pRelayFallbackPeers: 0,
      heapUsedMb: 184.5,
      now: () => 9_000_000,
    });
    expect(healthy.status).toBe("healthy");
    const parsed = JSON.parse(serializeStudioLiveDiagnosticsJson(healthy)) as Record<string, unknown>;
    expect(parsed.undoHistoryDepth).toBe(42);
    expect(parsed.heapUsedMb).toBe(184.5);

    const degraded = collectStudioLiveLongSessionDiagnostics({
      activeInkStrokes: 8,
      outboxQueueSize: 40,
      heapUsedMb: 812,
      now: () => 9_000_000,
    });
    expect(degraded.status).toBe("degraded");

    let now = 1_000;
    const timers: { id: number; run: () => void; dueAt: number }[] = [];
    let nextTimerId = 1;
    const onSave = vi.fn();
    const scheduler = new StudioAdaptiveSaveScheduler({
      idleDelayMs: 1_500,
      maxWaitMs: 10_000,
      onSave,
      now: () => now,
      setTimeout: (fn, delayMs) => {
        const entry = { id: nextTimerId++, run: fn, dueAt: now + delayMs };
        timers.push(entry);
        return entry.id;
      },
      clearTimeout: (handle) => {
        const index = timers.findIndex((entry) => entry.id === handle);
        if (index >= 0) timers.splice(index, 1);
      },
    });

    // Active local drawing defers idle save, but maxWait ceiling guarantees durability.
    scheduler.markLocalInputActive(true);
    scheduler.markDirty();
    expect(scheduler.hasPendingSave).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(0);
    expect(timers).toHaveLength(1);
    expect(timers[0]!.dueAt).toBe(11_000);

    // Trigger maxWait ceiling while user is still drawing continuously.
    now = 11_000;
    timers.shift()!.run();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(scheduler.hasPendingSave).toBe(false);

    // When local input pauses, idle timer fires promptly after idleDelayMs.
    scheduler.markDirty();
    scheduler.markLocalInputActive(false);
    const idleTimer = timers.find((entry) => entry.dueAt === 12_500);
    expect(idleTimer).toBeDefined();
    now = 12_500;
    idleTimer!.run();
    expect(onSave).toHaveBeenCalledTimes(2);
    scheduler.dispose();
  });

  it("skips idle cursor rAF ticks and clamps backward OS clock jumps in StudioRemoteCursorOverlayStore", () => {
    let now = 6_000_000;
    let intervalHandler: (() => void) | null = null;
    const frames: (() => void)[] = [];
    const roomListeners = new Set<(event: StudioLiveRoomEvent) => void>();
    const source = {
      ready: true,
      getCursors: () => [],
      subscribe: (listener: (event: StudioLiveRoomEvent) => void) => {
        roomListeners.add(listener);
        return () => roomListeners.delete(listener);
      },
    };
    const store = new StudioRemoteCursorOverlayStore(source, {
      now: () => now,
      requestFrame: (cb) => {
        frames.push(cb);
        return frames.length;
      },
      cancelFrame: () => undefined,
      setInterval: (cb) => {
        intervalHandler = cb;
        return 1;
      },
      clearInterval: () => {
        intervalHandler = null;
      },
    });
    const unsubscribe = store.subscribe(() => undefined);
    // Idle interval ticks when no cursors are active must NOT schedule rAF.
    intervalHandler?.();
    intervalHandler?.();
    expect(frames).toHaveLength(0);

    // Emit a remote cursor, then step OS clock backward by 60s.
    const participant: StudioLiveParticipant = {
      sessionId: "cursor-peer",
      displayName: "Cursor Peer",
      role: "editor",
      visibility: "active",
    };
    for (const listener of roomListeners) {
      listener({
        type: "cursor",
        participant,
        cursor: { x: 100, y: 120, pageId: "page-1", tool: "pen" },
      });
    }
    expect(frames).toHaveLength(1);
    frames.shift()!();
    expect(store.getSnapshot()).toHaveLength(1);

    now -= 60_000;
    intervalHandler?.();
    frames.shift()!();
    expect(store.getSnapshot()).toHaveLength(1);

    // Advancing just past TTL from the clamped clock evicts the stale cursor cleanly.
    now += STUDIO_REMOTE_CURSOR_TTL_MS + 100;
    intervalHandler?.();
    frames.shift()!();
    expect(store.getSnapshot()).toEqual([]);
    unsubscribe();
  });

  it("shrinks all three dynamic brush overlay canvases to 1x1 when detached", () => {
    const makeCanvas = () => ({
      width: 1024,
      height: 768,
      getContext: () => ({
        save() {},
        restore() {},
        setTransform() {},
        clearRect() {},
      }),
    }) as unknown as HTMLCanvasElement;
    const activeCanvas = makeCanvas();
    const presentationCanvas = makeCanvas();
    const settledCanvas = makeCanvas();
    const renderer = new StudioLiveDynamicBrushOverlayRenderer();
    renderer.attach({ activeCanvas, presentationCanvas, settledCanvas });
    renderer.setSurface({
      left: 0,
      top: 0,
      width: 1024,
      height: 768,
      documentScale: 1,
      documentWidth: 1024,
      flipX: false,
    });
    expect(presentationCanvas.width).toBeGreaterThan(1);
    expect(settledCanvas.width).toBeGreaterThan(1);
    renderer.attach(null);
    expect(activeCanvas.width).toBe(1);
    expect(activeCanvas.height).toBe(1);
    expect(presentationCanvas.width).toBe(1);
    expect(presentationCanvas.height).toBe(1);
    expect(settledCanvas.width).toBe(1);
    expect(settledCanvas.height).toBe(1);
  });

  it("auto-degrades remote stroke trails above peer or frame-budget thresholds and restores cleanly", () => {
    const normal = evaluateStudioLiveAutoDegrade({
      peerCount: STUDIO_LIVE_AUTO_DEGRADE_PEER_THRESHOLD,
      avgFrameMs: STUDIO_LIVE_AUTO_DEGRADE_FRAME_MS_THRESHOLD,
      userTrailsPreference: true,
    });
    expect(normal).toEqual({ effectiveShowTrails: true, degraded: false, reason: "none" });

    const crowded = evaluateStudioLiveAutoDegrade({
      peerCount: STUDIO_LIVE_AUTO_DEGRADE_PEER_THRESHOLD + 1,
      avgFrameMs: 8,
      userTrailsPreference: true,
    });
    expect(crowded).toEqual({ effectiveShowTrails: false, degraded: true, reason: "peer-count" });

    const slowFrame = evaluateStudioLiveAutoDegrade({
      peerCount: 2,
      avgFrameMs: STUDIO_LIVE_AUTO_DEGRADE_FRAME_MS_THRESHOLD + 2.5,
      userTrailsPreference: true,
    });
    expect(slowFrame).toEqual({ effectiveShowTrails: false, degraded: true, reason: "frame-budget" });

    const disabled = evaluateStudioLiveAutoDegrade({
      peerCount: 12,
      avgFrameMs: 24,
      autoDegradeEnabled: false,
      userTrailsPreference: true,
    });
    expect(disabled).toEqual({ effectiveShowTrails: true, degraded: false, reason: "none" });
  });

  it("evaluates storage quota thresholds safely and detects background heartbeat throttling without false NTP alarms", async () => {
    expect(evaluateStudioStorageQuota({ usageBytes: 400, quotaBytes: 1_000 }).status).toBe("ok");
    expect(evaluateStudioStorageQuota({ usageBytes: 860, quotaBytes: 1_000 }).status).toBe("warning");
    const critical = evaluateStudioStorageQuota({ usageBytes: 960, quotaBytes: 1_000 });
    expect(critical.status).toBe("critical");

    const probed = await probeStudioStorageQuota(async () => ({ usage: 900 * 1024 * 1024, quota: 1_000 * 1024 * 1024 }));
    expect(probed.status).toBe("warning");
    expect(probed.remainingMb).toBe(100);

    const failedProbe = await probeStudioStorageQuota(async () => {
      throw new Error("StorageManager blocked");
    });
    expect(failedProbe.status).toBe("unknown");

    const guard = new StudioLiveHeartbeatJitterGuard();
    let now = 10_000_000;
    expect(guard.recordTick(now).recommendedAction).toBe("none");
    now += 15_000;
    expect(guard.recordTick(now)).toMatchObject({ throttled: false, recommendedAction: "none" });
    // Backward NTP jump should clamp cleanly without triggering resync.
    now -= 90_000;
    expect(guard.recordTick(now)).toMatchObject({ throttled: false, jitterMs: 0, recommendedAction: "none" });
    // Background tab timer throttle exceeding threshold recommends immediate presence resync.
    now += STUDIO_HEARTBEAT_THROTTLE_THRESHOLD_MS + 15_000;
    expect(guard.recordTick(now)).toMatchObject({
      throttled: true,
      consecutiveThrottledTicks: 1,
      recommendedAction: "resync-presence",
    });
  });
});
