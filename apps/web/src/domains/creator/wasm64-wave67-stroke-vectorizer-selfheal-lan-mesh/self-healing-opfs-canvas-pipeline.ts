/**
 * Wave 67: 자가 치유(Self-Healing) OPFS/CRDT 캔버스 타일 복원 파이프라인.
 *
 * - 동기 SHA-256 무결성 감사(`verifyTileIntegrityManifest`)로 타일 1바이트 오염 및 레이어 메타데이터 변조를 적발한다.
 * - 손상·절단·누락 타일은 자동 격리(Quarantine) 후 OPFS 획 저널 결정론적 재실행으로 100% 무손실 복원한다.
 * - 저널이 유실되거나 해시 체인이 훼손된 경우 정상 인접 타일의 4방향 경계 보간으로 자가 치유한다.
 */

import {
  computeLayerMetadataDigest,
  computeManifestSelfDigest,
  computeSyncSha256Hex,
  computeTilePayloadDigest,
  createSignedStrokeJournal,
  createTileIntegrityManifest,
  rasterizeJournalEntriesToTile,
  verifyJournalChainIntegrity,
  type CanvasLayerBlendMode,
  type CanvasLayerMetadata,
  type CanvasTileRecord,
  type JournalFillRect,
  type JournalStrokePoint,
  type LayerManifestEntry,
  type OpfsJournalOpKind,
  type OpfsStrokeJournalEntry,
  type TileIntegrityManifest,
  type TileManifestEntry,
  type UnsignedOpfsJournalEntry,
} from "./opfs-sync-sha256-journal";

export {
  computeLayerMetadataDigest,
  computeSyncSha256Hex,
  computeTilePayloadDigest,
  createSignedStrokeJournal,
  createTileIntegrityManifest,
  rasterizeJournalEntriesToTile,
  type CanvasLayerBlendMode,
  type CanvasLayerMetadata,
  type CanvasTileRecord,
  type JournalFillRect,
  type JournalStrokePoint,
  type LayerManifestEntry,
  type OpfsJournalOpKind,
  type OpfsStrokeJournalEntry,
  type TileIntegrityManifest,
  type TileManifestEntry,
  type UnsignedOpfsJournalEntry,
};

export type TileAuditStatus = "healthy" | "corrupted-hash" | "truncated" | "missing";

export interface TileAuditFinding {
  readonly tileId: string;
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly status: TileAuditStatus;
  readonly expectedSha256: string;
  readonly actualSha256: string | null;
  readonly expectedBytes: number;
  readonly actualBytes: number;
}

export type LayerAuditStatus = "healthy" | "corrupted-metadata" | "missing-layer";

export interface LayerAuditFinding {
  readonly layerId: string;
  readonly status: LayerAuditStatus;
  readonly expectedMetadataSha256: string;
  readonly actualMetadataSha256: string | null;
}

export interface TileIntegrityAuditReport {
  readonly isHealthy: boolean;
  readonly manifestTampered: boolean;
  readonly totalCheckedTiles: number;
  readonly healthyTileIds: readonly string[];
  readonly corruptedTileIds: readonly string[];
  readonly missingTileIds: readonly string[];
  readonly corruptedLayerIds: readonly string[];
  readonly tileFindings: readonly TileAuditFinding[];
  readonly layerFindings: readonly LayerAuditFinding[];
}

export interface QuarantinedTileRecord {
  readonly tileId: string;
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly reason: Exclude<TileAuditStatus, "healthy">;
  readonly expectedSha256: string;
  readonly actualSha256: string | null;
  readonly damagedPixels: Uint8Array | null;
}

export type NeighborDirection = "left" | "right" | "top" | "bottom";

export type TileRecoveryMethod =
  | "journal-replay-lossless"
  | "neighbor-boundary-interpolation"
  | "blank-fallback";

export interface TileHealAction {
  readonly tileId: string;
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly failureStatus: Exclude<TileAuditStatus, "healthy">;
  readonly recoveryMethod: TileRecoveryMethod;
  readonly verifiedLossless: boolean;
  readonly replayedJournalOps: number;
  readonly usedNeighborDirections: readonly NeighborDirection[];
  readonly healedSha256: string;
  readonly boundarySeamDelta: number;
}

export interface CanvasSnapshotInput {
  readonly manifest: TileIntegrityManifest;
  readonly layers: readonly CanvasLayerMetadata[];
  readonly tiles: readonly CanvasTileRecord[];
  readonly strokeJournal?: readonly OpfsStrokeJournalEntry[];
  readonly fallbackLayerMetadata?: readonly CanvasLayerMetadata[];
}

export interface SelfHealPipelineResult {
  readonly audit: TileIntegrityAuditReport;
  readonly healedTiles: readonly CanvasTileRecord[];
  readonly healedLayers: readonly CanvasLayerMetadata[];
  readonly quarantinedTiles: readonly QuarantinedTileRecord[];
  readonly actions: readonly TileHealAction[];
  readonly losslessRecoveredCount: number;
  readonly interpolatedRecoveredCount: number;
  readonly blankFallbackCount: number;
  readonly recoveredLayerMetadataCount: number;
  readonly journalChainValid: boolean;
  readonly updatedManifest: TileIntegrityManifest;
  readonly summaryMessageKo: string;
}

/**
 * 캔버스 타일 및 레이어 메타데이터의 동기 SHA-256 무결성 감사를 수행한다.
 */
export function verifyTileIntegrityManifest(
  manifest: TileIntegrityManifest,
  layers: readonly CanvasLayerMetadata[],
  tiles: readonly CanvasTileRecord[],
): TileIntegrityAuditReport {
  const expectedSelfDigest = computeManifestSelfDigest(
    manifest.canvasWidth,
    manifest.canvasHeight,
    manifest.tileSize,
    manifest.headJournalSeq,
    manifest.layers,
    manifest.tiles,
  );
  const manifestTampered = expectedSelfDigest !== manifest.manifestSha256;

  const layerById = new Map<string, CanvasLayerMetadata>();
  for (const layer of layers) layerById.set(layer.layerId, layer);

  const layerFindings: LayerAuditFinding[] = [];
  const corruptedLayerIds: string[] = [];
  for (const expectedLayer of manifest.layers) {
    const actualLayer = layerById.get(expectedLayer.layerId);
    if (!actualLayer) {
      corruptedLayerIds.push(expectedLayer.layerId);
      layerFindings.push({
        layerId: expectedLayer.layerId,
        status: "missing-layer",
        expectedMetadataSha256: expectedLayer.expectedMetadataSha256,
        actualMetadataSha256: null,
      });
      continue;
    }
    const actualDigest = computeLayerMetadataDigest(actualLayer);
    const status: LayerAuditStatus =
      actualDigest === expectedLayer.expectedMetadataSha256 ? "healthy" : "corrupted-metadata";
    if (status !== "healthy") corruptedLayerIds.push(expectedLayer.layerId);
    layerFindings.push({
      layerId: expectedLayer.layerId,
      status,
      expectedMetadataSha256: expectedLayer.expectedMetadataSha256,
      actualMetadataSha256: actualDigest,
    });
  }

  const tileById = new Map<string, CanvasTileRecord>();
  for (const tile of tiles) tileById.set(tile.tileId, tile);

  const tileFindings: TileAuditFinding[] = [];
  const healthyTileIds: string[] = [];
  const corruptedTileIds: string[] = [];
  const missingTileIds: string[] = [];

  for (const expectedTile of manifest.tiles) {
    const actualTile = tileById.get(expectedTile.tileId);
    if (!actualTile) {
      missingTileIds.push(expectedTile.tileId);
      tileFindings.push({
        tileId: expectedTile.tileId,
        layerId: expectedTile.layerId,
        tileX: expectedTile.tileX,
        tileY: expectedTile.tileY,
        status: "missing",
        expectedSha256: expectedTile.expectedSha256,
        actualSha256: null,
        expectedBytes: expectedTile.byteLength,
        actualBytes: 0,
      });
      continue;
    }

    const actualSha = computeTilePayloadDigest(actualTile.pixels);
    let status: TileAuditStatus = "healthy";
    if (actualTile.pixels.byteLength !== expectedTile.byteLength) {
      status = "truncated";
      corruptedTileIds.push(expectedTile.tileId);
    } else if (actualSha !== expectedTile.expectedSha256) {
      status = "corrupted-hash";
      corruptedTileIds.push(expectedTile.tileId);
    } else {
      healthyTileIds.push(expectedTile.tileId);
    }

    tileFindings.push({
      tileId: expectedTile.tileId,
      layerId: expectedTile.layerId,
      tileX: expectedTile.tileX,
      tileY: expectedTile.tileY,
      status,
      expectedSha256: expectedTile.expectedSha256,
      actualSha256: actualSha,
      expectedBytes: expectedTile.byteLength,
      actualBytes: actualTile.pixels.byteLength,
    });
  }

  return {
    isHealthy:
      !manifestTampered &&
      corruptedTileIds.length === 0 &&
      missingTileIds.length === 0 &&
      corruptedLayerIds.length === 0,
    manifestTampered,
    totalCheckedTiles: manifest.tiles.length,
    healthyTileIds,
    corruptedTileIds,
    missingTileIds,
    corruptedLayerIds,
    tileFindings,
    layerFindings,
  };
}

function interpolateTileFromHealthyNeighbors(
  tileSize: number,
  neighbors: Readonly<Partial<Record<NeighborDirection, CanvasTileRecord>>>,
): { pixels: Uint8Array; usedDirections: NeighborDirection[]; boundarySeamDelta: number } {
  const usedDirections: NeighborDirection[] = [];
  if (neighbors.left) usedDirections.push("left");
  if (neighbors.right) usedDirections.push("right");
  if (neighbors.top) usedDirections.push("top");
  if (neighbors.bottom) usedDirections.push("bottom");

  const pixels = new Uint8Array(tileSize * tileSize * 4);
  if (usedDirections.length === 0) return { pixels, usedDirections, boundarySeamDelta: 0 };

  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      let wSum = 0;
      let rAcc = 0;
      let gAcc = 0;
      let bAcc = 0;
      let aAcc = 0;

      const sampleBorder = (tile: CanvasTileRecord | undefined, srcIdx: number, dist: number): void => {
        if (!tile) return;
        const w = 1 / (dist * dist);
        rAcc += tile.pixels[srcIdx] * w;
        gAcc += tile.pixels[srcIdx + 1] * w;
        bAcc += tile.pixels[srcIdx + 2] * w;
        aAcc += tile.pixels[srcIdx + 3] * w;
        wSum += w;
      };

      sampleBorder(neighbors.left, (y * tileSize + tileSize - 1) * 4, x + 1);
      sampleBorder(neighbors.right, (y * tileSize + 0) * 4, tileSize - x);
      sampleBorder(neighbors.top, ((tileSize - 1) * tileSize + x) * 4, y + 1);
      sampleBorder(neighbors.bottom, (0 * tileSize + x) * 4, tileSize - y);

      const dstIdx = (y * tileSize + x) * 4;
      pixels[dstIdx] = Math.min(255, Math.max(0, Math.round(rAcc / wSum)));
      pixels[dstIdx + 1] = Math.min(255, Math.max(0, Math.round(gAcc / wSum)));
      pixels[dstIdx + 2] = Math.min(255, Math.max(0, Math.round(bAcc / wSum)));
      pixels[dstIdx + 3] = Math.min(255, Math.max(0, Math.round(aAcc / wSum)));
    }
  }

  let seamSamples = 0;
  let seamErrorSum = 0;
  const accumulateDiff = (dstIdx: number, src: Uint8Array, srcIdx: number): void => {
    for (let c = 0; c < 4; c += 1) seamErrorSum += Math.abs(pixels[dstIdx + c] - src[srcIdx + c]);
    seamSamples += 4;
  };
  if (neighbors.left) {
    for (let y = 0; y < tileSize; y += 1) {
      accumulateDiff((y * tileSize + 0) * 4, neighbors.left.pixels, (y * tileSize + tileSize - 1) * 4);
    }
  }
  if (neighbors.right) {
    for (let y = 0; y < tileSize; y += 1) {
      accumulateDiff((y * tileSize + tileSize - 1) * 4, neighbors.right.pixels, (y * tileSize + 0) * 4);
    }
  }
  if (neighbors.top) {
    for (let x = 0; x < tileSize; x += 1) {
      accumulateDiff((0 * tileSize + x) * 4, neighbors.top.pixels, ((tileSize - 1) * tileSize + x) * 4);
    }
  }
  if (neighbors.bottom) {
    for (let x = 0; x < tileSize; x += 1) {
      accumulateDiff(((tileSize - 1) * tileSize + x) * 4, neighbors.bottom.pixels, (0 * tileSize + x) * 4);
    }
  }

  return { pixels, usedDirections, boundarySeamDelta: seamSamples > 0 ? seamErrorSum / seamSamples : 0 };
}

/**
 * 캔버스 스냅샷 무결성 감사 -> 손상 타일 자동 격리 -> OPFS 획 저널 무손실 재실행 복원 ->
 * 저널 유실 시 인접 타일 경계 보간 자가 치유까지 일괄 수행한다.
 */
export function auditAndSelfHealCanvasSnapshot(input: CanvasSnapshotInput): SelfHealPipelineResult {
  const audit = verifyTileIntegrityManifest(input.manifest, input.layers, input.tiles);
  const tileById = new Map<string, CanvasTileRecord>(input.tiles.map((t) => [t.tileId, t]));
  const healthySet = new Set<string>(audit.healthyTileIds);
  const healthyTileByCoord = new Map<string, CanvasTileRecord>();
  const healedTileMap = new Map<string, CanvasTileRecord>();

  for (const tile of input.tiles) {
    if (healthySet.has(tile.tileId)) {
      healthyTileByCoord.set(`${tile.layerId}:${tile.tileX}:${tile.tileY}`, tile);
      healedTileMap.set(tile.tileId, tile);
    }
  }

  const fallbackLayerById = new Map<string, CanvasLayerMetadata>(
    (input.fallbackLayerMetadata ?? []).map((m) => [m.layerId, m]),
  );
  const layerById = new Map<string, CanvasLayerMetadata>(input.layers.map((m) => [m.layerId, m]));
  const healedLayers: CanvasLayerMetadata[] = [];
  let recoveredLayerMetadataCount = 0;
  for (const finding of audit.layerFindings) {
    if (finding.status === "healthy") {
      const existing = layerById.get(finding.layerId);
      if (existing) healedLayers.push(existing);
      continue;
    }
    const backup = fallbackLayerById.get(finding.layerId);
    if (backup && computeLayerMetadataDigest(backup) === finding.expectedMetadataSha256) {
      healedLayers.push(backup);
      recoveredLayerMetadataCount += 1;
    } else {
      const existing = layerById.get(finding.layerId);
      if (existing) healedLayers.push(existing);
    }
  }

  const journalChainValid = verifyJournalChainIntegrity(input.strokeJournal, input.manifest.headJournalSeq);
  const quarantinedTiles: QuarantinedTileRecord[] = [];
  const actions: TileHealAction[] = [];
  let losslessRecoveredCount = 0;
  let interpolatedRecoveredCount = 0;
  let blankFallbackCount = 0;

  for (let i = 0; i < audit.tileFindings.length; i += 1) {
    const finding = audit.tileFindings[i];
    if (finding.status === "healthy") continue;
    const manifestTile = input.manifest.tiles[i];
    const damagedTile = tileById.get(finding.tileId);

    quarantinedTiles.push({
      tileId: finding.tileId,
      layerId: finding.layerId,
      tileX: finding.tileX,
      tileY: finding.tileY,
      reason: finding.status,
      expectedSha256: finding.expectedSha256,
      actualSha256: finding.actualSha256,
      damagedPixels: damagedTile ? new Uint8Array(damagedTile.pixels) : null,
    });

    if (journalChainValid && input.strokeJournal && input.strokeJournal.length > 0) {
      const replay = rasterizeJournalEntriesToTile(
        input.strokeJournal,
        finding.layerId,
        finding.tileX,
        finding.tileY,
        input.manifest.tileSize,
        manifestTile.lastJournalSeq,
      );
      const replayedSha = computeTilePayloadDigest(replay.pixels);
      if (replayedSha === finding.expectedSha256) {
        const restored: CanvasTileRecord = {
          tileId: finding.tileId,
          layerId: finding.layerId,
          tileX: finding.tileX,
          tileY: finding.tileY,
          tileSize: input.manifest.tileSize,
          pixels: replay.pixels,
        };
        healedTileMap.set(finding.tileId, restored);
        healthyTileByCoord.set(`${finding.layerId}:${finding.tileX}:${finding.tileY}`, restored);
        losslessRecoveredCount += 1;
        actions.push({
          tileId: finding.tileId,
          layerId: finding.layerId,
          tileX: finding.tileX,
          tileY: finding.tileY,
          failureStatus: finding.status,
          recoveryMethod: "journal-replay-lossless",
          verifiedLossless: true,
          replayedJournalOps: replay.appliedOps,
          usedNeighborDirections: [],
          healedSha256: replayedSha,
          boundarySeamDelta: 0,
        });
        continue;
      }
    }

    const neighbors: Partial<Record<NeighborDirection, CanvasTileRecord>> = {
      left: healthyTileByCoord.get(`${finding.layerId}:${finding.tileX - 1}:${finding.tileY}`),
      right: healthyTileByCoord.get(`${finding.layerId}:${finding.tileX + 1}:${finding.tileY}`),
      top: healthyTileByCoord.get(`${finding.layerId}:${finding.tileX}:${finding.tileY - 1}`),
      bottom: healthyTileByCoord.get(`${finding.layerId}:${finding.tileX}:${finding.tileY + 1}`),
    };
    const interp = interpolateTileFromHealthyNeighbors(input.manifest.tileSize, neighbors);
    const healedSha = computeTilePayloadDigest(interp.pixels);
    const restored: CanvasTileRecord = {
      tileId: finding.tileId,
      layerId: finding.layerId,
      tileX: finding.tileX,
      tileY: finding.tileY,
      tileSize: input.manifest.tileSize,
      pixels: interp.pixels,
    };
    healedTileMap.set(finding.tileId, restored);

    if (interp.usedDirections.length > 0) {
      interpolatedRecoveredCount += 1;
      actions.push({
        tileId: finding.tileId,
        layerId: finding.layerId,
        tileX: finding.tileX,
        tileY: finding.tileY,
        failureStatus: finding.status,
        recoveryMethod: "neighbor-boundary-interpolation",
        verifiedLossless: false,
        replayedJournalOps: 0,
        usedNeighborDirections: interp.usedDirections,
        healedSha256: healedSha,
        boundarySeamDelta: interp.boundarySeamDelta,
      });
    } else {
      blankFallbackCount += 1;
      actions.push({
        tileId: finding.tileId,
        layerId: finding.layerId,
        tileX: finding.tileX,
        tileY: finding.tileY,
        failureStatus: finding.status,
        recoveryMethod: "blank-fallback",
        verifiedLossless: false,
        replayedJournalOps: 0,
        usedNeighborDirections: [],
        healedSha256: healedSha,
        boundarySeamDelta: 0,
      });
    }
  }

  const healedTiles = input.manifest.tiles
    .map((entry) => healedTileMap.get(entry.tileId))
    .filter((t): t is CanvasTileRecord => t !== undefined);

  const updatedManifest = createTileIntegrityManifest({
    canvasWidth: input.manifest.canvasWidth,
    canvasHeight: input.manifest.canvasHeight,
    tileSize: input.manifest.tileSize,
    headJournalSeq: input.manifest.headJournalSeq,
    layers: healedLayers,
    tiles: healedTiles,
  });

  const summaryMessageKo = audit.isHealthy
    ? `전체 ${audit.totalCheckedTiles}개 타일과 레이어 메타데이터가 정상입니다.`
    : interpolatedRecoveredCount === 0 && blankFallbackCount === 0
      ? `손상 타일 ${quarantinedTiles.length}개를 격리하고 OPFS 획 저널 재실행으로 100% 무손실 복원했습니다.`
      : `손상 타일 ${quarantinedTiles.length}개를 격리했습니다(저널 무손실 ${losslessRecoveredCount}개, 경계 보간 치유 ${interpolatedRecoveredCount}개, 빈 타일 대체 ${blankFallbackCount}개).`;

  return {
    audit,
    healedTiles,
    healedLayers,
    quarantinedTiles,
    actions,
    losslessRecoveredCount,
    interpolatedRecoveredCount,
    blankFallbackCount,
    recoveredLayerMetadataCount,
    journalChainValid,
    updatedManifest,
    summaryMessageKo,
  };
}
