/**
 * Wave 158 — 결정론적 WAL 크래시 재생 엔진 및 상태 해시 동치 체크포인트 압축기.
 *
 * - 트랜잭션 원자성(`TX_BEGIN` → 연산 → `TX_COMMIT` / `TX_ABORT`)을 엄격히 격리한다.
 * - 커밋 완료된 연산만 정확한 LSN 순으로 회차 상태에 반영하고, 미커밋·중단 트랜잭션은 0건 반영한다.
 * - 끝단 잘림(torn write)은 마지막 정상 바이트 경계로 절단하고, 중간 프레임 손상은 Fail-Closed 중단한다.
 * - 체크포인트 압축 후 재실행한 상태의 FIPS 180-4 SHA-256 해시가 원본과 100% 일치함을 검증한다.
 */

import {
  canonicalJsonStringify,
  computeSha256Utf8Hex,
  decodeJsonPayload,
  encodeJsonPayload,
  encodeWalStream,
  scanWalStream,
} from "./wal-binary-crc32c-codec";
import type {
  MaterializedEpisodeState,
  MaterializedLayer,
  MaterializedPanel,
  MaterializedStroke,
  WalCheckpointPayload,
  WalCompactionOptions,
  WalCompactionResult,
  WalFrameInput,
  WalFrameRecord,
  WalHealthStatus,
  WalLayerPatchPayload,
  WalPanelUpdatePayload,
  WalReplayOptions,
  WalReplayResult,
  WalStrokeAppendPayload,
  WalTransactionAudit,
  WalTransactionStatus,
  WalTxMetaPayload,
} from "./wal-recovery-types";

interface MutableTransactionBucket {
  readonly txId: number;
  readonly beginLsn: number;
  endLsn: number | null;
  status: WalTransactionStatus;
  readonly ops: WalFrameRecord[];
}

interface MutableLayer {
  readonly layerId: string;
  name: string;
  opacity: number;
  visible: boolean;
  blendMode: string;
  zIndex: number;
  lastLsn: number;
}

interface MutablePanel {
  readonly panelId: string;
  orderIndex: number;
  heightPx: number;
  gutterPx: number;
  caption: string;
  lastLsn: number;
}

interface MutableStroke {
  readonly strokeId: string;
  layerId: string;
  pointCount: number;
  colorToken: string;
  widthPx: number;
  digestHex: string;
  lastLsn: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function readStringField(obj: Record<string, unknown>, key: string, fallback: string): string {
  const value = obj[key];
  return typeof value === "string" ? value : fallback;
}

function readOptionalStringField(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" ? value : undefined;
}

function readNumberField(obj: Record<string, unknown>, key: string, fallback: number): number {
  const value = obj[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readOptionalNumberField(obj: Record<string, unknown>, key: string): number | undefined {
  const value = obj[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalBooleanField(obj: Record<string, unknown>, key: string): boolean | undefined {
  const value = obj[key];
  return typeof value === "boolean" ? value : undefined;
}

function isDataOp(opType: WalFrameRecord["opType"]): boolean {
  return (
    opType === "STROKE_APPEND" ||
    opType === "LAYER_PATCH" ||
    opType === "PANEL_UPDATE"
  );
}

/**
 * 구체화된 회차 상태를 LSN 메타와 무관한 순수 콘텐츠 정규 직렬화 SHA-256 해시로 계산한다.
 * 압축 전후로 LSN 번호가 재정렬되어도 회차 콘텐츠가 동일하면 해시가 100% 일치한다.
 */
export function computeMaterializedStateSha256Hex(state: MaterializedEpisodeState): string {
  const canonicalPayload = {
    episodeId: state.episodeId,
    layers: state.layers.map((layer) => ({
      layerId: layer.layerId,
      name: layer.name,
      opacity: layer.opacity,
      visible: layer.visible,
      blendMode: layer.blendMode,
      zIndex: layer.zIndex,
    })),
    panels: state.panels.map((panel) => ({
      panelId: panel.panelId,
      orderIndex: panel.orderIndex,
      heightPx: panel.heightPx,
      gutterPx: panel.gutterPx,
      caption: panel.caption,
    })),
    strokes: state.strokes.map((stroke) => ({
      strokeId: stroke.strokeId,
      layerId: stroke.layerId,
      pointCount: stroke.pointCount,
      colorToken: stroke.colorToken,
      widthPx: stroke.widthPx,
      digestHex: stroke.digestHex,
    })),
  };
  return computeSha256Utf8Hex(canonicalJsonStringify(canonicalPayload));
}

function applyDataOperation(
  record: WalFrameRecord,
  layers: Map<string, MutableLayer>,
  panels: Map<string, MutablePanel>,
  strokes: Map<string, MutableStroke>
): void {
  const raw = asRecord(decodeJsonPayload(record.payload));

  if (record.opType === "LAYER_PATCH") {
    const layerId = readStringField(raw, "layerId", `layer-${String(record.lsn)}`);
    const existing = layers.get(layerId);
    const name = readOptionalStringField(raw, "name");
    const opacity = readOptionalNumberField(raw, "opacity");
    const visible = readOptionalBooleanField(raw, "visible");
    const blendMode = readOptionalStringField(raw, "blendMode");
    const zIndex = readOptionalNumberField(raw, "zIndex");

    if (existing) {
      if (name !== undefined) existing.name = name;
      if (opacity !== undefined) existing.opacity = Math.max(0, Math.min(1, opacity));
      if (visible !== undefined) existing.visible = visible;
      if (blendMode !== undefined) existing.blendMode = blendMode;
      if (zIndex !== undefined) existing.zIndex = zIndex;
      existing.lastLsn = record.lsn;
      return;
    }

    layers.set(layerId, {
      layerId,
      name: name ?? layerId,
      opacity: opacity !== undefined ? Math.max(0, Math.min(1, opacity)) : 1,
      visible: visible ?? true,
      blendMode: blendMode ?? "normal",
      zIndex: zIndex ?? layers.size,
      lastLsn: record.lsn,
    });
    return;
  }

  if (record.opType === "PANEL_UPDATE") {
    const panelId = readStringField(raw, "panelId", `panel-${String(record.lsn)}`);
    const orderIndex = readNumberField(raw, "orderIndex", panels.size);
    const heightPx = Math.max(1, readNumberField(raw, "heightPx", 1280));
    const gutterPx = Math.max(0, readNumberField(raw, "gutterPx", 48));
    const caption = readStringField(raw, "caption", "");

    panels.set(panelId, {
      panelId,
      orderIndex,
      heightPx,
      gutterPx,
      caption,
      lastLsn: record.lsn,
    });
    return;
  }

  if (record.opType === "STROKE_APPEND") {
    const strokeId = readStringField(raw, "strokeId", `stroke-${String(record.lsn)}`);
    const layerId = readStringField(raw, "layerId", "layer-ink");
    const pointCount = Math.max(1, Math.round(readNumberField(raw, "pointCount", 1)));
    const colorToken = readStringField(raw, "colorToken", "oklch(0.18 0.02 250)");
    const widthPx = Math.max(0.25, readNumberField(raw, "widthPx", 2.5));
    const digestHex =
      readOptionalStringField(raw, "digestHex") ??
      computeSha256Utf8Hex(`${strokeId}:${layerId}:${String(pointCount)}:${colorToken}:${String(widthPx)}`).slice(
        0,
        16
      );

    strokes.set(strokeId, {
      strokeId,
      layerId,
      pointCount,
      colorToken,
      widthPx,
      digestHex,
      lastLsn: record.lsn,
    });
  }
}

/**
 * 바이너리 WAL 스트림을 결정론적으로 재생하여 회차 상태와 복구 감사 결과를 생성한다.
 */
export function replayWalStream(
  stream: Uint8Array,
  options: WalReplayOptions = {}
): WalReplayResult {
  const scan = scanWalStream(stream);
  let episodeId = options.defaultEpisodeId ?? "episode-local-draft";
  let lastValidLsn = 0;
  let lastCheckpointLsn: number | null = null;
  let orphanedLooseOpCount = 0;

  const txMap = new Map<number, MutableTransactionBucket>();
  const txOrder: number[] = [];

  for (let i = 0; i < scan.records.length; i += 1) {
    const record = scan.records[i];
    if (record.lsn > lastValidLsn) {
      lastValidLsn = record.lsn;
    }

    if (record.opType === "CHECKPOINT") {
      const payloadObj = asRecord(decodeJsonPayload(record.payload));
      const cpEpisodeId = readOptionalStringField(payloadObj, "episodeId");
      if (cpEpisodeId) {
        episodeId = cpEpisodeId;
      }
      const cpLsn = readOptionalNumberField(payloadObj, "checkpointLsn");
      lastCheckpointLsn = cpLsn ?? record.lsn;
      continue;
    }

    if (record.opType === "TX_BEGIN") {
      const payloadObj = asRecord(decodeJsonPayload(record.payload));
      const txEpisodeId = readOptionalStringField(payloadObj, "episodeId");
      if (txEpisodeId) {
        episodeId = txEpisodeId;
      }
      if (!txMap.has(record.txId)) {
        txOrder.push(record.txId);
      }
      txMap.set(record.txId, {
        txId: record.txId,
        beginLsn: record.lsn,
        endLsn: null,
        status: "uncommitted_orphaned",
        ops: [],
      });
      continue;
    }

    if (isDataOp(record.opType)) {
      const bucket = txMap.get(record.txId);
      if (bucket && bucket.status === "uncommitted_orphaned") {
        bucket.ops.push(record);
      } else {
        orphanedLooseOpCount += 1;
      }
      continue;
    }

    if (record.opType === "TX_COMMIT") {
      const bucket = txMap.get(record.txId);
      if (bucket && bucket.status === "uncommitted_orphaned") {
        bucket.status = "committed";
        bucket.endLsn = record.lsn;
      }
      continue;
    }

    if (record.opType === "TX_ABORT") {
      const bucket = txMap.get(record.txId);
      if (bucket && bucket.status === "uncommitted_orphaned") {
        bucket.status = "aborted";
        bucket.endLsn = record.lsn;
      }
    }
  }

  const committedOps: WalFrameRecord[] = [];
  const transactions: WalTransactionAudit[] = [];
  let committedTxCount = 0;
  let abortedTxCount = 0;
  let uncommittedTxCount = 0;
  let discardedOpCount = orphanedLooseOpCount;

  for (let i = 0; i < txOrder.length; i += 1) {
    const bucket = txMap.get(txOrder[i]);
    if (!bucket) continue;

    if (bucket.status === "committed") {
      committedTxCount += 1;
      for (let j = 0; j < bucket.ops.length; j += 1) {
        committedOps.push(bucket.ops[j]);
      }
      transactions.push({
        txId: bucket.txId,
        status: "committed",
        beginLsn: bucket.beginLsn,
        endLsn: bucket.endLsn,
        opCount: bucket.ops.length,
        appliedOpCount: bucket.ops.length,
      });
    } else if (bucket.status === "aborted") {
      abortedTxCount += 1;
      discardedOpCount += bucket.ops.length;
      transactions.push({
        txId: bucket.txId,
        status: "aborted",
        beginLsn: bucket.beginLsn,
        endLsn: bucket.endLsn,
        opCount: bucket.ops.length,
        appliedOpCount: 0,
      });
    } else {
      uncommittedTxCount += 1;
      discardedOpCount += bucket.ops.length;
      transactions.push({
        txId: bucket.txId,
        status: "uncommitted_orphaned",
        beginLsn: bucket.beginLsn,
        endLsn: null,
        opCount: bucket.ops.length,
        appliedOpCount: 0,
      });
    }
  }

  committedOps.sort((a, b) => a.lsn - b.lsn || a.byteOffset - b.byteOffset);

  const layersMap = new Map<string, MutableLayer>();
  const panelsMap = new Map<string, MutablePanel>();
  const strokesMap = new Map<string, MutableStroke>();

  for (let i = 0; i < committedOps.length; i += 1) {
    applyDataOperation(committedOps[i], layersMap, panelsMap, strokesMap);
  }

  const layers: MaterializedLayer[] = Array.from(layersMap.values()).sort(
    (a, b) => a.zIndex - b.zIndex || a.layerId.localeCompare(b.layerId)
  );
  const panels: MaterializedPanel[] = Array.from(panelsMap.values()).sort(
    (a, b) => a.orderIndex - b.orderIndex || a.panelId.localeCompare(b.panelId)
  );
  const strokes: MaterializedStroke[] = Array.from(strokesMap.values()).sort(
    (a, b) => a.layerId.localeCompare(b.layerId) || a.strokeId.localeCompare(b.strokeId)
  );

  const recoveredState: MaterializedEpisodeState = {
    episodeId,
    layers,
    panels,
    strokes,
  };
  const stateSha256Hex = computeMaterializedStateSha256Hex(recoveredState);

  let healthStatus: WalHealthStatus = "clean";
  if (scan.corruptionStop !== null) {
    healthStatus = "halted_corrupted_frame";
  } else if (scan.tornWriteDetected) {
    healthStatus = "recovered_torn_tail";
  }

  return {
    episodeId,
    recoveredState,
    stateSha256Hex,
    totalBytesScanned: scan.totalInputBytes,
    validByteEndOffset: scan.validByteEndOffset,
    truncatedTailBytes: scan.truncatedTailBytes,
    tornWriteTruncated: scan.tornWriteDetected,
    tornWriteReason: scan.tornWriteReason,
    corruptedMiddleFrame: scan.corruptionStop,
    lastValidLsn,
    lastCheckpointLsn,
    validFrameCount: scan.records.length,
    committedTxCount,
    abortedTxCount,
    uncommittedTxCount,
    committedOpCount: committedOps.length,
    discardedOpCount,
    transactions,
    healthStatus,
  };
}

/**
 * 중복·덮어쓰기된 이전 프레임, 중단·미커밋 트랜잭션, 끝단 잘림 바이트를 제거하고
 * 동일한 상태 SHA-256 해시를 보장하는 최소 체크포인트 WAL 스트림으로 압축한다.
 */
export function compactWalStream(
  stream: Uint8Array,
  options: WalCompactionOptions = {}
): WalCompactionResult {
  const beforeReplay = replayWalStream(stream, {
    defaultEpisodeId: options.defaultEpisodeId,
  });

  const baseTimestampMs = options.checkpointTimestampMs ?? 1764300000000;
  let nextLsn = Math.max(1, options.startingLsn ?? 1);
  const txId = 1;
  const compactedInputs: WalFrameInput[] = [];

  const beginPayload: WalTxMetaPayload = {
    episodeId: beforeReplay.episodeId,
  };
  compactedInputs.push({
    lsn: nextLsn,
    txId,
    opType: "TX_BEGIN",
    timestampMs: baseTimestampMs,
    payload: encodeJsonPayload(beginPayload),
  });
  nextLsn += 1;

  for (let i = 0; i < beforeReplay.recoveredState.layers.length; i += 1) {
    const layer = beforeReplay.recoveredState.layers[i];
    const patchPayload: WalLayerPatchPayload = {
      layerId: layer.layerId,
      name: layer.name,
      opacity: layer.opacity,
      visible: layer.visible,
      blendMode: layer.blendMode,
      zIndex: layer.zIndex,
    };
    compactedInputs.push({
      lsn: nextLsn,
      txId,
      opType: "LAYER_PATCH",
      timestampMs: baseTimestampMs + i + 1,
      payload: encodeJsonPayload(patchPayload),
    });
    nextLsn += 1;
  }

  for (let i = 0; i < beforeReplay.recoveredState.panels.length; i += 1) {
    const panel = beforeReplay.recoveredState.panels[i];
    const panelPayload: WalPanelUpdatePayload = {
      panelId: panel.panelId,
      orderIndex: panel.orderIndex,
      heightPx: panel.heightPx,
      gutterPx: panel.gutterPx,
      caption: panel.caption,
    };
    compactedInputs.push({
      lsn: nextLsn,
      txId,
      opType: "PANEL_UPDATE",
      timestampMs: baseTimestampMs + 100 + i,
      payload: encodeJsonPayload(panelPayload),
    });
    nextLsn += 1;
  }

  for (let i = 0; i < beforeReplay.recoveredState.strokes.length; i += 1) {
    const stroke = beforeReplay.recoveredState.strokes[i];
    const strokePayload: WalStrokeAppendPayload = {
      strokeId: stroke.strokeId,
      layerId: stroke.layerId,
      pointCount: stroke.pointCount,
      colorToken: stroke.colorToken,
      widthPx: stroke.widthPx,
      digestHex: stroke.digestHex,
    };
    compactedInputs.push({
      lsn: nextLsn,
      txId,
      opType: "STROKE_APPEND",
      timestampMs: baseTimestampMs + 200 + i,
      payload: encodeJsonPayload(strokePayload),
    });
    nextLsn += 1;
  }

  compactedInputs.push({
    lsn: nextLsn,
    txId,
    opType: "TX_COMMIT",
    timestampMs: baseTimestampMs + 500,
    payload: encodeJsonPayload({ episodeId: beforeReplay.episodeId }),
  });
  nextLsn += 1;

  const checkpointLsn = nextLsn;
  const checkpointPayload: WalCheckpointPayload = {
    episodeId: beforeReplay.episodeId,
    checkpointLsn,
    stateSha256Hex: beforeReplay.stateSha256Hex,
    committedTxCount: 1,
  };
  compactedInputs.push({
    lsn: checkpointLsn,
    txId: 0,
    opType: "CHECKPOINT",
    timestampMs: baseTimestampMs + 501,
    payload: encodeJsonPayload(checkpointPayload),
  });

  const compactedStream = encodeWalStream(compactedInputs);
  const compactedReplay = replayWalStream(compactedStream, {
    defaultEpisodeId: beforeReplay.episodeId,
  });

  const originalBytes = stream.length;
  const compactedBytes = compactedStream.length;
  const reclaimedBytes = originalBytes - compactedBytes;
  const reductionRatio = originalBytes > 0 ? reclaimedBytes / originalBytes : 0;

  return {
    originalBytes,
    compactedBytes,
    reclaimedBytes,
    reductionRatio,
    originalFrameCount: beforeReplay.validFrameCount,
    compactedFrameCount: compactedInputs.length,
    checkpointLsn,
    stateSha256Before: beforeReplay.stateSha256Hex,
    stateSha256After: compactedReplay.stateSha256Hex,
    stateHashEquivalent: beforeReplay.stateSha256Hex === compactedReplay.stateSha256Hex,
    compactedStream,
    compactedReplay,
  };
}
