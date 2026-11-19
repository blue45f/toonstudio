/**
 * ToonStudio 3-hour multi-user collaborative drawing chaos soak runner.
 *
 * Exercises all long-session collaborative drawing surfaces concurrently on one shared page:
 * - Multi-peer Live Ink Protocol V2 lifecycle + 15% dropped ink:end TTL reaping
 * - Multi-peer Gesture Preview store + room adapter (rAF notification coalescing + sleep-wake purge)
 * - P2P overlay transport ghost-peer TTL recovery (random hard-disconnect without presence:leave)
 * - Undo/Redo CRDT history depth bounding (trimStudioCrdtHistoryWindow <= 100)
 * - Live overlay canvas VRAM proxy check (backing pixel area shrinks to 1x1 on detach)
 * - Production V12 SqliteStudioCrdtOutbox continuous put/remove ACK cycles
 * - Periodic telemetry & fail-closed gates: heapUsed/RSS growth, p99 round latency, VRAM proxy
 *
 * Usage:
 *   node --experimental-strip-types scripts/soak-studio-live-collab-drawing.mts
 *   node --experimental-strip-types scripts/soak-studio-live-collab-drawing.mts --duration-ms=60000 --peers=6 --chaos=true
 */

import { performance } from "node:perf_hooks";

import {
  STUDIO_CRDT_RECONNECT_SNAPSHOT_JUMP_GAP_MS,
  shouldJumpToCrdtSnapshotOnReconnect,
} from "../apps/web/src/domains/creator/live/studio-crdt-document";
import {
  STUDIO_CRDT_MAX_RECONCILED_HISTORY_DEPTH,
  trimStudioCrdtHistoryWindow,
} from "../apps/web/src/domains/creator/live/studio-crdt-history";
import { SqliteStudioCrdtOutbox } from "../apps/web/src/domains/creator/live/studio-crdt-outbox";
import {
  STUDIO_CRDT_PROTOCOL_VERSION,
  type StudioCrdtUpdateRequest,
} from "../apps/web/src/domains/creator/live/studio-crdt-protocol";
import {
  createStudioLiveEnvelope,
  type StudioLiveParticipant,
} from "../apps/web/src/domains/creator/live/studio-live-collaboration-protocol";
import {
  STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
  type StudioLiveGesturePreviewPayload,
} from "../apps/web/src/domains/creator/live/studio-live-gesture-preview";
import {
  STUDIO_LIVE_GESTURE_PREVIEW_SLEEP_WAKE_GAP_MS,
  StudioLiveGesturePreviewRoomAdapter,
  type StudioLiveGesturePreviewRoomSource,
} from "../apps/web/src/domains/creator/live/studio-live-gesture-preview-room-adapter";
import {
  STUDIO_LIVE_GESTURE_PREVIEW_TTL_MS,
  StudioLiveGesturePreviewStore,
  type StudioLiveGesturePreviewStoreScheduler,
} from "../apps/web/src/domains/creator/live/studio-live-gesture-preview-store";
import { encodeStudioLiveInkSamples } from "../apps/web/src/domains/creator/live/studio-live-ink-codec";
import {
  StudioLiveInkOverlayRenderer,
  StudioLiveInkPredictionRenderer,
} from "../apps/web/src/domains/creator/live/studio-live-ink-overlay";
import {
  STUDIO_LIVE_INK_ACTIVE_STROKE_TTL_MS,
  STUDIO_LIVE_INK_MAX_ACTIVE_STROKES,
  STUDIO_LIVE_INK_PROTOCOL_VERSION,
  STUDIO_LIVE_INK_SAMPLE_SCHEMA,
  StudioLiveInkStrokeTracker,
  type StudioLiveInkBegin,
  type StudioLiveInkChunk,
} from "../apps/web/src/domains/creator/live/studio-live-ink-protocol";
import {
  STUDIO_LIVE_P2P_STALE_PEER_TTL_MS,
  applyStudioLiveP2pOverlay,
} from "../apps/web/src/domains/creator/live/studio-live-p2p-overlay-transport";
import { StudioLiveRetainedMediaOverlayRenderer } from "../apps/web/src/domains/creator/live/studio-live-retained-media-overlay";

import type { StudioLocalDatabase } from "../apps/web/src/domains/creator/studio-local-database";
import type {
  StudioLivePeer,
  StudioLiveRoomEvent,
} from "../apps/web/src/domains/creator/live/studio-live-collaboration-room";
import type { StudioLiveTransport } from "../apps/web/src/domains/creator/live/studio-live-collaboration-transport";

const DEFAULT_DURATION_MS = 3 * 60 * 60 * 1_000; // 3 hours
const DEFAULT_PEER_COUNT = 6;
const REPORT_INTERVAL_MS = 60_000;
const ROUND_SLEEP_MS = 25;
const MAX_ALLOWED_HEAP_GROWTH_MB = 128;
const MAX_ALLOWED_P99_ROUND_MS = 50;

function parseNumericArg(name: string, fallback: number, min: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= min ? Math.trunc(parsed) : fallback;
}

function parseBooleanArg(name: string, fallback: boolean): boolean {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return fallback;
  return raw !== "false" && raw !== "0";
}

function mb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

function percentile99(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99));
  return Math.round(sorted[index]! * 100) / 100;
}

function inkPayload(count: number): ArrayBuffer {
  return encodeStudioLiveInkSamples(
    Array.from({ length: count }, (_, index) => ({
      x: index * 3,
      y: index * 2,
      pressure: 0.55,
      timeDeltaMs: 8,
    })),
  );
}

function makeInkBegin(strokeId: string, startedAt: number): StudioLiveInkBegin {
  return {
    kind: "ink:begin",
    protocolVersion: STUDIO_LIVE_INK_PROTOCOL_VERSION,
    strokeId,
    pageId: "page-soak",
    layerId: "layer-soak",
    coordinateSpaceId: "space-a4",
    coordinateSpaceRevision: 1,
    provider: {
      providerId: "vello-hybrid",
      providerVersion: "1.4.0",
      buildHash: "soak0001",
    },
    brushPresetId: "brush-gpen",
    brushContractHash: "soakhash",
    seed: 101,
    mode: "pen",
    blendMode: "normal",
    color: "#111111",
    width: 6,
    opacity: 1,
    sampleSchema: STUDIO_LIVE_INK_SAMPLE_SCHEMA,
    startedAt,
  };
}

function makeInkChunk(
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

function makeMockCanvas(width = 1920, height = 1080): HTMLCanvasElement {
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
    width,
    height,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
}

class SoakFakeRoom implements StudioLiveGesturePreviewRoomSource {
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

async function runSoak(): Promise<void> {
  const durationMs = parseNumericArg("duration-ms", DEFAULT_DURATION_MS, 1_000);
  const peerCount = parseNumericArg("peers", DEFAULT_PEER_COUNT, 2);
  const chaosEnabled = parseBooleanArg("chaos", true);
  const startedAt = Date.now();
  const deadline = startedAt + durationMs;

  let virtualNow = startedAt;
  const scheduler: StudioLiveGesturePreviewStoreScheduler = {
    now: () => virtualNow,
    setInterval: () => 1,
    clearInterval: () => undefined,
  };

  const peers: StudioLivePeer[] = Array.from({ length: peerCount }, (_, index) => ({
    sessionId: `soak-peer-${index + 1}`,
    displayName: `협업자-${index + 1}`,
    role: "editor",
    visibility: "active",
    pageId: "page-soak",
    lastSeenAt: virtualNow,
  }));

  const store = new StudioLiveGesturePreviewStore({ pageId: "page-soak", scheduler });
  const room = new SoakFakeRoom(peers);
  const queuedFrames: (() => void)[] = [];
  const adapter = new StudioLiveGesturePreviewRoomAdapter({
    pageId: "page-soak",
    store,
    now: () => virtualNow,
    coalesceListenerNotifications: true,
    scheduleFrame: (flush) => {
      queuedFrames.push(flush);
      return queuedFrames.length;
    },
    cancelFrame: () => undefined,
  });
  let notificationCount = 0;
  adapter.subscribe(() => {
    notificationCount += 1;
  });
  adapter.setRoom(room);

  // P2P overlay transport chaos harness for ghost-peer eviction verification.
  const p2pPrimaryListeners = new Set<(value: unknown) => void>();
  const p2pPrimary: StudioLiveTransport = {
    mode: "server",
    canvasLockPolicy: "cooperative",
    crdtFanout: "mesh",
    ready: true,
    connect: async () => undefined,
    send: () => true,
    subscribe: (listener) => {
      p2pPrimaryListeners.add(listener);
      return () => p2pPrimaryListeners.delete(listener);
    },
    close: () => undefined,
  };
  const p2pTransport = applyStudioLiveP2pOverlay(() => p2pPrimary, {
    now: () => virtualNow,
    createPeerConnection: () => {
      throw new Error("ICE unavailable");
    },
  })({
    workId: "work-soak",
    participant: {
      sessionId: "soak-self",
      displayName: "Self",
      role: "editor",
    },
  });
  await p2pTransport.connect();

  // Canvas overlay VRAM proxy harness.
  const inkRenderer = new StudioLiveInkOverlayRenderer();
  const predictionRenderer = new StudioLiveInkPredictionRenderer();
  const retainedRenderer = new StudioLiveRetainedMediaOverlayRenderer();
  const surface = {
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    documentScale: 1,
    documentWidth: 1920,
    flipX: false,
  };

  const trackers = new Map<string, StudioLiveInkStrokeTracker>(
    peers.map((peer) => [peer.sessionId, new StudioLiveInkStrokeTracker()]),
  );

  const outboxRows = new Map<string, {
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
      [...outboxRows.values()].filter((row) => row.scope === scope && row.workId === workId),
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
      const existing = outboxRows.get(key);
      if (existing?.acknowledgedAt !== null && existing !== undefined) {
        return "acknowledged" as const;
      }
      outboxRows.set(key, {
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
      const existing = outboxRows.get(key);
      if (existing) {
        existing.acknowledgedAt = acknowledgedAt;
        if (outboxRows.size > 1_000) outboxRows.delete(key);
      }
    },
    recordCrdtOutboxRetry: async () => undefined,
  };

  const outbox = new SqliteStudioCrdtOutbox({
    acquireDatabase: async () => fakeDb as unknown as StudioLocalDatabase,
    now: () => virtualNow,
  });

  // Simulated Undo/Redo history stack that grows each round and is bounded by trimStudioCrdtHistoryWindow.
  let undoHistory: { id: string }[][] = [[{ id: "init" }]];

  const baselineHeapMb = mb(process.memoryUsage().heapUsed);
  let lastReportAt = startedAt;
  let round = 0;
  let totalStrokes = 0;
  let totalReapedOrphans = 0;
  let totalChaosEvents = 0;
  let clientSequence = 0;
  let lastDetachedVramPixels = 0;
  const roundLatenciesMs: number[] = [];

  console.log(
    `[soak] start: durationMs=${durationMs} (${(durationMs / 3_600_000).toFixed(2)}h), peers=${peerCount}, chaos=${chaosEnabled}, baselineHeapMB=${baselineHeapMb}`,
  );

  while (Date.now() < deadline) {
    const roundStart = performance.now();
    round += 1;
    virtualNow += 1_000;

    for (let peerIndex = 0; peerIndex < peers.length; peerIndex += 1) {
      const peer = peers[peerIndex]!;
      const tracker = trackers.get(peer.sessionId)!;
      const strokeId = `${peer.sessionId}-r${round}`;

      // 1. Live Ink: 15% dropped ink:end packet chaos to prove TTL reaping prevents deadlock.
      if (!tracker.accept(makeInkBegin(strokeId, virtualNow), virtualNow)) {
        throw new Error(
          `[soak] ink begin unexpectedly rejected for ${peer.sessionId} at round ${round} (active=${tracker.activeStrokeCount})`,
        );
      }
      if (!tracker.accept(makeInkChunk(strokeId, 1, 0, 4), virtualNow)) {
        throw new Error(`[soak] ink chunk rejected for ${peer.sessionId} at round ${round}`);
      }
      const simulateDroppedEnd = chaosEnabled ? (round + peerIndex) % 7 === 0 : round % 5 === 0;
      if (!simulateDroppedEnd) {
        tracker.accept({ kind: "ink:cancel", strokeId, reason: "user" }, virtualNow);
      }
      const reaped = tracker.pruneExpired(virtualNow, STUDIO_LIVE_INK_ACTIVE_STROKE_TTL_MS);
      totalReapedOrphans += reaped.length;
      if (tracker.activeStrokeCount > STUDIO_LIVE_INK_MAX_ACTIVE_STROKES) {
        throw new Error(`[soak] active ink stroke cap exceeded for ${peer.sessionId}`);
      }

      // 2. Gesture Preview: simultaneous multi-chunk drawing with rAF frame-budget coalescing.
      room.emitPreview(peer, {
        version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
        gestureId: strokeId,
        pageId: "page-soak",
        seq: 1,
        phase: "begin",
        operation: "draw",
        base: { documentGeneration: 1 },
        renderer: { kind: "freehand", mode: "pen", stroke: "#111111", strokeWidth: 4 },
        samples: { startIndex: 0, points: [0, 0, 8, 8], pressures: [0.5, 0.5] },
      });
      room.emitPreview(peer, {
        version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
        gestureId: strokeId,
        pageId: "page-soak",
        seq: 2,
        phase: "append",
        operation: "draw",
        samples: { startIndex: 2, points: [16, 16, 24, 24], pressures: [0.6, 0.6] },
      });
      if (!simulateDroppedEnd) {
        room.emitPreview(peer, {
          version: STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
          gestureId: strokeId,
          pageId: "page-soak",
          seq: 3,
          phase: "end",
          operation: "draw",
        });
        adapter.setAuthoritativeElementIds("page-soak", [strokeId]);
        adapter.markAuthoritativeProjection("page-soak", strokeId);
      }

      // 3. CRDT Outbox ACK cycle.
      clientSequence += 1;
      const req: StudioCrdtUpdateRequest = {
        protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
        workId: "work-soak",
        updateId: `12345678-1234-4234-8234-${String(clientSequence).padStart(12, "0")}`,
        clientSequence,
        update: "AAECAw==",
      };
      await outbox.put("soak-user", req);
      await outbox.remove("soak-user", "work-soak", req.updateId);
      totalStrokes += 1;
    }

    // Flush the single coalesced rAF notification for all 6 peers in this round.
    while (queuedFrames.length > 0) {
      queuedFrames.shift()!();
    }

    // 4. Undo/Redo history depth bounding verification.
    undoHistory.push([{ id: `snap-${round}` }]);
    const undoIndex = undoHistory.length - 1;
    const boundedHistory = trimStudioCrdtHistoryWindow(undoHistory, undoIndex);
    undoHistory = boundedHistory.history;
    if (undoHistory.length > STUDIO_CRDT_MAX_RECONCILED_HISTORY_DEPTH) {
      throw new Error(`[soak] Undo/Redo history exceeded cap: ${undoHistory.length}`);
    }

    // 5. Chaos scenarios every 20 rounds: ghost peer hard-disconnect, sleep-wake storm, canvas detach VRAM check.
    if (chaosEnabled && round % 20 === 0) {
      totalChaosEvents += 1;
      // 5a. Ghost peer enters without presence:leave and must evict after TTL.
      const ghostSessionId = `ghost-peer-${round}`;
      const hello = createStudioLiveEnvelope({
        workId: "work-soak",
        sender: {
          sessionId: ghostSessionId,
          displayName: ghostSessionId,
          role: "editor",
        },
        sentAt: virtualNow,
        sequence: round,
        kind: "presence:hello",
        payload: { visibility: "active", pageId: "page-soak" },
      });
      for (const listener of p2pPrimaryListeners) listener(hello);

      // 5b. Simulated sleep-wake gap (20-min gap > TTLs) purges stale previews, ghost peers & triggers snapshot jump policy.
      const sleepGapMs = Math.max(
        STUDIO_LIVE_GESTURE_PREVIEW_TTL_MS,
        STUDIO_LIVE_INK_ACTIVE_STROKE_TTL_MS,
        STUDIO_LIVE_GESTURE_PREVIEW_SLEEP_WAKE_GAP_MS,
        STUDIO_LIVE_P2P_STALE_PEER_TTL_MS,
        STUDIO_CRDT_RECONNECT_SNAPSHOT_JUMP_GAP_MS,
      ) + 1_000;
      if (!shouldJumpToCrdtSnapshotOnReconnect({ gapMs: sleepGapMs, queuedDeltaCount: 0, estimatedDeltaBytes: 0 })) {
        throw new Error("[soak] reconnect snapshot jump policy did not engage after sleep-wake gap");
      }
      virtualNow += sleepGapMs;
      room.setPeers(peers.slice(1));
      room.setPeers(peers);
      adapter.flushPendingNotifications();
      if (adapter.getSnapshot().length !== 0) {
        throw new Error(`[soak] orphaned gesture previews remained after sleep-wake sweep: ${adapter.getSnapshot().length}`);
      }
      if ((p2pTransport.direct?.getPeers().length ?? 0) !== 0) {
        throw new Error("[soak] ghost peer survived past P2P stale TTL");
      }
      if (outbox.listEmergency("soak-user", "work-soak").length !== 0) {
        throw new Error("[soak] emergency outbox retained acknowledged entries");
      }

      // 5c. Canvas overlay attach/detach VRAM proxy check.
      const inkCanvas = makeMockCanvas();
      const predCanvas = makeMockCanvas();
      const activeCanvas = makeMockCanvas();
      const settledCanvas = makeMockCanvas();
      inkRenderer.attach(inkCanvas);
      inkRenderer.setSurface(surface);
      predictionRenderer.attach(predCanvas);
      predictionRenderer.setSurface(surface);
      retainedRenderer.attach({ activeCanvas, settledCanvas });
      retainedRenderer.setSurface(surface);
      inkRenderer.attach(null);
      predictionRenderer.attach(null);
      retainedRenderer.attach(null);
      lastDetachedVramPixels =
        inkCanvas.width * inkCanvas.height
        + predCanvas.width * predCanvas.height
        + activeCanvas.width * activeCanvas.height
        + settledCanvas.width * settledCanvas.height;
      if (lastDetachedVramPixels > 4) {
        throw new Error(`[soak] detached overlay canvases retained backing pixels: ${lastDetachedVramPixels}`);
      }
    }

    const roundElapsedMs = performance.now() - roundStart;
    roundLatenciesMs.push(roundElapsedMs);
    if (roundLatenciesMs.length > 2_000) roundLatenciesMs.shift();

    const wallNow = Date.now();
    if (wallNow - lastReportAt >= REPORT_INTERVAL_MS) {
      const mem = process.memoryUsage();
      const heapMb = mb(mem.heapUsed);
      const rssMb = mb(mem.rss);
      const heapGrowthMb = Math.round((heapMb - baselineHeapMb) * 100) / 100;
      const p99Ms = percentile99(roundLatenciesMs);
      const elapsedMin = ((wallNow - startedAt) / 60_000).toFixed(1);
      console.log(
        `[soak] elapsed=${elapsedMin}m rounds=${round} strokes=${totalStrokes} reapedOrphans=${totalReapedOrphans} chaosEvents=${totalChaosEvents} p99RoundMs=${p99Ms} notifications=${notificationCount} historyDepth=${undoHistory.length} detachedVramPx=${lastDetachedVramPixels} heapMB=${heapMb} (+${heapGrowthMb}MB) rssMB=${rssMb}`,
      );
      if (heapGrowthMb > MAX_ALLOWED_HEAP_GROWTH_MB) {
        throw new Error(
          `[soak] heap growth exceeded threshold: +${heapGrowthMb}MB > ${MAX_ALLOWED_HEAP_GROWTH_MB}MB`,
        );
      }
      if (p99Ms > MAX_ALLOWED_P99_ROUND_MS) {
        throw new Error(
          `[soak] p99 round latency exceeded threshold: ${p99Ms}ms > ${MAX_ALLOWED_P99_ROUND_MS}ms`,
        );
      }
      lastReportAt = wallNow;
    }

    await new Promise((resolve) => setTimeout(resolve, ROUND_SLEEP_MS));
  }

  adapter.dispose();
  p2pTransport.close();
  const finalMem = process.memoryUsage();
  console.log(
    `[soak] PASS: elapsedMs=${Date.now() - startedAt} rounds=${round} strokes=${totalStrokes} reapedOrphans=${totalReapedOrphans} chaosEvents=${totalChaosEvents} p99RoundMs=${percentile99(roundLatenciesMs)} historyDepth=${undoHistory.length} detachedVramPx=${lastDetachedVramPixels} finalHeapMB=${mb(finalMem.heapUsed)} finalRssMB=${mb(finalMem.rss)}`,
  );
}

runSoak().catch((error: unknown) => {
  console.error("[soak] FAIL:", error);
  process.exitCode = 1;
});
