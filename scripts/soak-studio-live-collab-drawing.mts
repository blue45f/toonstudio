/**
 * ToonStudio 3-hour multi-user collaborative drawing soak runner.
 *
 * Exercises the exact long-session collaborative drawing surfaces concurrently on one shared page:
 * - Multi-peer Live Ink Protocol V2 lifecycle + dropped ink:end TTL reaping
 * - Multi-peer Gesture Preview store + room adapter + authoritative projection handoff + peer churn
 * - Production V12 SqliteStudioCrdtOutbox continuous put/remove ACK cycles
 * - Periodic memory (heapUsed / rss) telemetry & fail-closed leak assertions
 *
 * Usage:
 *   pnpm tsx scripts/soak-studio-live-collab-drawing.mts                    # default 3 hours (10,800,000 ms)
 *   pnpm tsx scripts/soak-studio-live-collab-drawing.mts --duration-ms=60000 --peers=6
 */

import { SqliteStudioCrdtOutbox } from "../apps/web/src/domains/creator/live/studio-crdt-outbox";
import {
  STUDIO_CRDT_PROTOCOL_VERSION,
  type StudioCrdtUpdateRequest,
} from "../apps/web/src/domains/creator/live/studio-crdt-protocol";
import {
  STUDIO_LIVE_GESTURE_PREVIEW_VERSION,
  type StudioLiveGesturePreviewPayload,
} from "../apps/web/src/domains/creator/live/studio-live-gesture-preview";
import {
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
  STUDIO_LIVE_INK_ACTIVE_STROKE_TTL_MS,
  STUDIO_LIVE_INK_MAX_ACTIVE_STROKES,
  STUDIO_LIVE_INK_PROTOCOL_VERSION,
  STUDIO_LIVE_INK_SAMPLE_SCHEMA,
  StudioLiveInkStrokeTracker,
  type StudioLiveInkBegin,
  type StudioLiveInkChunk,
} from "../apps/web/src/domains/creator/live/studio-live-ink-protocol";

import type { StudioLocalDatabase } from "../apps/web/src/domains/creator/studio-local-database";
import type { StudioLiveParticipant } from "../apps/web/src/domains/creator/live/studio-live-collaboration-protocol";
import type {
  StudioLivePeer,
  StudioLiveRoomEvent,
} from "../apps/web/src/domains/creator/live/studio-live-collaboration-room";

const DEFAULT_DURATION_MS = 3 * 60 * 60 * 1_000; // 3 hours
const DEFAULT_PEER_COUNT = 6;
const REPORT_INTERVAL_MS = 60_000;
const ROUND_SLEEP_MS = 25;
const MAX_ALLOWED_HEAP_GROWTH_MB = 128;

function parseNumericArg(name: string, fallback: number, min: number): number {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= min ? Math.trunc(parsed) : fallback;
}

function mb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
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
  const adapter = new StudioLiveGesturePreviewRoomAdapter({ pageId: "page-soak", store });
  let notificationCount = 0;
  adapter.subscribe(() => {
    notificationCount += 1;
  });
  adapter.setRoom(room);

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
        // Periodically compact acknowledged rows in fake DB to measure client memory cleanly.
        if (outboxRows.size > 1_000) outboxRows.delete(key);
      }
    },
    recordCrdtOutboxRetry: async () => undefined,
  };

  const outbox = new SqliteStudioCrdtOutbox({
    acquireDatabase: async () => fakeDb as unknown as StudioLocalDatabase,
    now: () => virtualNow,
  });

  const baselineHeapMb = mb(process.memoryUsage().heapUsed);
  let lastReportAt = startedAt;
  let round = 0;
  let totalStrokes = 0;
  let totalReapedOrphans = 0;
  let clientSequence = 0;

  console.log(
    `[soak] start: durationMs=${durationMs} (${(durationMs / 3_600_000).toFixed(2)}h), peers=${peerCount}, baselineHeapMB=${baselineHeapMb}`,
  );

  while (Date.now() < deadline) {
    round += 1;
    virtualNow += 1_000;

    for (const peer of peers) {
      const tracker = trackers.get(peer.sessionId)!;
      const strokeId = `${peer.sessionId}-r${round}`;

      // 1. Live Ink: periodically drop ink:end (1 in 5 rounds) to prove TTL reaping prevents deadlock.
      if (!tracker.accept(makeInkBegin(strokeId, virtualNow), virtualNow)) {
        throw new Error(
          `[soak] ink begin unexpectedly rejected for ${peer.sessionId} at round ${round} (active=${tracker.activeStrokeCount})`,
        );
      }
      if (!tracker.accept(makeInkChunk(strokeId, 1, 0, 4), virtualNow)) {
        throw new Error(`[soak] ink chunk rejected for ${peer.sessionId} at round ${round}`);
      }
      const simulateDroppedEnd = round % 5 === 0;
      if (!simulateDroppedEnd) {
        tracker.accept({ kind: "ink:cancel", strokeId, reason: "user" }, virtualNow);
      }
      const reaped = tracker.pruneExpired(virtualNow, STUDIO_LIVE_INK_ACTIVE_STROKE_TTL_MS);
      totalReapedOrphans += reaped.length;
      if (tracker.activeStrokeCount > STUDIO_LIVE_INK_MAX_ACTIVE_STROKES) {
        throw new Error(`[soak] active ink stroke cap exceeded for ${peer.sessionId}`);
      }

      // 2. Gesture Preview: simultaneous multi-chunk drawing + authoritative projection handoff.
      const beforeCalls = notificationCount;
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
      if (notificationCount - beforeCalls !== 1) {
        throw new Error(`[soak] duplicate adapter notification detected on begin (${notificationCount - beforeCalls})`);
      }
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
        updateId: `upd-${clientSequence}`,
        clientSequence,
        update: "AAECAw==",
      };
      await outbox.put("soak-user", req);
      await outbox.remove("soak-user", "work-soak", req.updateId);
      totalStrokes += 1;
    }

    // Periodic peer churn + TTL sweep every 20 rounds.
    if (round % 20 === 0) {
      virtualNow += Math.max(
        STUDIO_LIVE_GESTURE_PREVIEW_TTL_MS,
        STUDIO_LIVE_INK_ACTIVE_STROKE_TTL_MS,
      ) + 500;
      room.setPeers(peers.slice(1));
      room.setPeers(peers);
      if (adapter.getSnapshot().length !== 0) {
        throw new Error(`[soak] orphaned gesture previews remained after TTL sweep: ${adapter.getSnapshot().length}`);
      }
      if (outbox.listEmergency("soak-user", "work-soak").length !== 0) {
        throw new Error("[soak] emergency outbox retained acknowledged entries");
      }
    }

    const wallNow = Date.now();
    if (wallNow - lastReportAt >= REPORT_INTERVAL_MS) {
      const mem = process.memoryUsage();
      const heapMb = mb(mem.heapUsed);
      const rssMb = mb(mem.rss);
      const heapGrowthMb = Math.round((heapMb - baselineHeapMb) * 100) / 100;
      const elapsedMin = ((wallNow - startedAt) / 60_000).toFixed(1);
      console.log(
        `[soak] elapsed=${elapsedMin}m rounds=${round} strokes=${totalStrokes} reapedOrphans=${totalReapedOrphans} heapMB=${heapMb} (+${heapGrowthMb}MB) rssMB=${rssMb} activePreviews=${adapter.getSnapshot().length}`,
      );
      if (heapGrowthMb > MAX_ALLOWED_HEAP_GROWTH_MB) {
        throw new Error(
          `[soak] heap growth exceeded threshold: +${heapGrowthMb}MB > ${MAX_ALLOWED_HEAP_GROWTH_MB}MB`,
        );
      }
      lastReportAt = wallNow;
    }

    await new Promise((resolve) => setTimeout(resolve, ROUND_SLEEP_MS));
  }

  adapter.dispose();
  const finalMem = process.memoryUsage();
  console.log(
    `[soak] PASS: elapsedMs=${Date.now() - startedAt} rounds=${round} strokes=${totalStrokes} reapedOrphans=${totalReapedOrphans} finalHeapMB=${mb(finalMem.heapUsed)} finalRssMB=${mb(finalMem.rss)}`,
  );
}

runSoak().catch((error: unknown) => {
  console.error("[soak] FAIL:", error);
  process.exitCode = 1;
});
