import { describe, expect, it } from "vitest";

import {
  STUDIO_CRDT_COMPACTION_MIN_UPDATE_BYTES,
  STUDIO_CRDT_RECONNECT_SNAPSHOT_JUMP_GAP_MS,
  STUDIO_CRDT_RECONNECT_SNAPSHOT_JUMP_MAX_BYTES,
  STUDIO_CRDT_RECONNECT_SNAPSHOT_JUMP_MAX_DELTAS,
  StudioCrdtDocument,
  compactStudioCrdtSnapshot,
  shouldJumpToCrdtSnapshotOnReconnect,
} from "./studio-crdt-document";
import { STUDIO_CRDT_STROKE_PAYLOAD_VERSION } from "./studio-crdt-protocol";

describe("Studio CRDT snapshot compaction and reconnect thresholds", () => {
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
        payload: {
          version: STUDIO_CRDT_STROKE_PAYLOAD_VERSION,
          type: "draw",
          kind: "freehand",
          mode: "pen",
          points: [index, index, index + 10, index + 12],
          pressures: [0.5, 0.7],
          stroke: "#111111",
          strokeWidth: 4,
          opacity: 1,
        },
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
});
