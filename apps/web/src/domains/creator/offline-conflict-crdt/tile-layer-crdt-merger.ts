/**
 * 256×256 타일·레이어 단위 3-Way CRDT 충돌 자동 해결 엔진.
 *
 * - 순수 CRDT 상태 결합(`mergeCrdtStates`): 교환법칙·결합법칙·멱등성을 만족하는 결합 반격자.
 * - 3-Way 병합 분석(`mergeOfflineDocumentStates`): 비충돌 타일·레이어·말풍선은 100% 무손실
 *   자동 병합하고, 동일 `(layerId, tileX, tileY)`의 동시(`concurrent`) 수정만 충돌로 분류한다.
 * - 4가지 해결 전략(`applyConflictResolution`): 기본 추천 `stack-as-new-layer`로 원격 타일을
 *   보조 레이어에 보존해 브러시 스트로크 유실 0건을 보장한다.
 */

import {
  compareCausality,
  compareDeviceIds,
  maxHlc,
  mergeVectorClocks,
} from "./hlc-vector-clock";
import {
  TILE_SIZE_PX,
  canonicalStringify,
  computeBoundsOverlapRatio,
  computeManifestChecksum,
  computeTileHash,
  computeUnionBounds,
  createRasterTileDelta,
  fnv1a64Hex,
  makeTileKey,
  normalizeLayerMeta,
  normalizeSpeechBubble,
  normalizeStrokes,
  normalizeTileBounds,
  pickLwwValue,
  sealOfflineDocumentDelta,
  verifyManifestIntegrity,
  type BubbleFieldClocks,
  type ConflictResolutionResult,
  type ConflictResolutionStrategy,
  type LayerFieldClocks,
  type ManifestIntegrityResult,
  type OfflineDocumentDelta,
  type OfflineLayerMeta,
  type OfflineMergeIntegrityReport,
  type OfflineMergePlan,
  type OfflineSpeechBubble,
  type RasterTileDelta,
  type TileBounds,
  type TileConflictItem,
  type TileStrokeOp,
  type UnsealedOfflineDocumentDelta,
} from "./offline-document-manifest";

export {
  TILE_SIZE_PX,
  canonicalStringify,
  computeBoundsOverlapRatio,
  computeManifestChecksum,
  computeTileHash,
  computeUnionBounds,
  createRasterTileDelta,
  fnv1a64Hex,
  makeTileKey,
  normalizeLayerMeta,
  normalizeSpeechBubble,
  normalizeStrokes,
  normalizeTileBounds,
  sealOfflineDocumentDelta,
  verifyManifestIntegrity,
};

export type {
  BubbleFieldClocks,
  ConflictResolutionResult,
  ConflictResolutionStrategy,
  LayerFieldClocks,
  ManifestIntegrityResult,
  OfflineDocumentDelta,
  OfflineLayerMeta,
  OfflineMergeIntegrityReport,
  OfflineMergePlan,
  OfflineSpeechBubble,
  RasterTileDelta,
  TileBounds,
  TileConflictItem,
  TileStrokeOp,
  UnsealedOfflineDocumentDelta,
};

function mergeLayerMeta(a: OfflineLayerMeta, b: OfflineLayerMeta): OfflineLayerMeta {
  const na = normalizeLayerMeta(a);
  const nb = normalizeLayerMeta(b);
  const ca = na.fieldClocks ?? {};
  const cb = nb.fieldClocks ?? {};

  const name = pickLwwValue(na.name, ca.name ?? na.hlc, nb.name, cb.name ?? nb.hlc);
  const visible = pickLwwValue(na.visible, ca.visible ?? na.hlc, nb.visible, cb.visible ?? nb.hlc);
  const opacity = pickLwwValue(na.opacity, ca.opacity ?? na.hlc, nb.opacity, cb.opacity ?? nb.hlc);
  const blendMode = pickLwwValue(na.blendMode, ca.blendMode ?? na.hlc, nb.blendMode, cb.blendMode ?? nb.hlc);
  const zOrder = pickLwwValue(na.zOrder, ca.zOrder ?? na.hlc, nb.zOrder, cb.zOrder ?? nb.hlc);
  const locked = pickLwwValue(na.locked, ca.locked ?? na.hlc, nb.locked, cb.locked ?? nb.hlc);
  const deleted = pickLwwValue(na.deleted === true, ca.deleted ?? na.hlc, nb.deleted === true, cb.deleted ?? nb.hlc);
  const originDeviceId = pickLwwValue(na.originDeviceId, na.hlc, nb.originDeviceId, nb.hlc).value;
  const sourceLayerId = pickLwwValue(na.sourceLayerId, na.hlc, nb.sourceLayerId, nb.hlc).value;

  return Object.freeze({
    layerId: na.layerId,
    name: name.value,
    visible: visible.value,
    opacity: opacity.value,
    blendMode: blendMode.value,
    zOrder: zOrder.value,
    locked: locked.value,
    deleted: deleted.value,
    ...(originDeviceId ? { originDeviceId } : {}),
    ...(sourceLayerId ? { sourceLayerId } : {}),
    hlc: maxHlc(na.hlc, nb.hlc),
    vectorClock: mergeVectorClocks(na.vectorClock, nb.vectorClock),
    fieldClocks: Object.freeze({
      name: name.hlc,
      visible: visible.hlc,
      opacity: opacity.hlc,
      blendMode: blendMode.hlc,
      zOrder: zOrder.hlc,
      locked: locked.hlc,
      deleted: deleted.hlc,
    }),
  });
}

function mergeSpeechBubble(a: OfflineSpeechBubble, b: OfflineSpeechBubble): OfflineSpeechBubble {
  const na = normalizeSpeechBubble(a);
  const nb = normalizeSpeechBubble(b);
  const ca = na.fieldClocks ?? {};
  const cb = nb.fieldClocks ?? {};

  const layerId = pickLwwValue(na.layerId, ca.layerId ?? na.hlc, nb.layerId, cb.layerId ?? nb.hlc);
  const text = pickLwwValue(na.text, ca.text ?? na.hlc, nb.text, cb.text ?? nb.hlc);
  const x = pickLwwValue(na.x, ca.x ?? na.hlc, nb.x, cb.x ?? nb.hlc);
  const y = pickLwwValue(na.y, ca.y ?? na.hlc, nb.y, cb.y ?? nb.hlc);
  const width = pickLwwValue(na.width, ca.width ?? na.hlc, nb.width, cb.width ?? nb.hlc);
  const height = pickLwwValue(na.height, ca.height ?? na.hlc, nb.height, cb.height ?? nb.hlc);
  const fontSize = pickLwwValue(na.fontSize, ca.fontSize ?? na.hlc, nb.fontSize, cb.fontSize ?? nb.hlc);
  const style = pickLwwValue(na.style, ca.style ?? na.hlc, nb.style, cb.style ?? nb.hlc);
  const deleted = pickLwwValue(na.deleted === true, ca.deleted ?? na.hlc, nb.deleted === true, cb.deleted ?? nb.hlc);

  return Object.freeze({
    bubbleId: na.bubbleId,
    layerId: layerId.value,
    text: text.value,
    x: x.value,
    y: y.value,
    width: width.value,
    height: height.value,
    fontSize: fontSize.value,
    style: style.value,
    deleted: deleted.value,
    hlc: maxHlc(na.hlc, nb.hlc),
    vectorClock: mergeVectorClocks(na.vectorClock, nb.vectorClock),
    fieldClocks: Object.freeze({
      layerId: layerId.hlc,
      text: text.hlc,
      x: x.hlc,
      y: y.hlc,
      width: width.hlc,
      height: height.hlc,
      fontSize: fontSize.hlc,
      style: style.hlc,
      deleted: deleted.hlc,
    }),
  });
}

function mergeRasterTile(a: RasterTileDelta, b: RasterTileDelta): RasterTileDelta {
  const mergedStrokes = normalizeStrokes([...a.strokes, ...b.strokes]);
  return Object.freeze({
    tileKey: a.tileKey,
    layerId: a.layerId,
    tileX: a.tileX,
    tileY: a.tileY,
    tileSize: TILE_SIZE_PX,
    strokes: mergedStrokes,
    tileHash: computeTileHash(mergedStrokes),
    dirtyBounds: computeUnionBounds(mergedStrokes),
    hlc: maxHlc(a.hlc, b.hlc),
    vectorClock: mergeVectorClocks(a.vectorClock, b.vectorClock),
  });
}

/**
 * 두 오프라인 문서 상태의 순수 CRDT 결합 반격자(join-semilattice) 병합.
 * 교환법칙(`merge(A,B) == merge(B,A)`), 결합법칙(`merge(merge(A,B),C) == merge(A,merge(B,C))`),
 * 멱등성(`merge(A,A) == A`)을 수학적으로 만족하며 단 1획의 스트로크도 유실하지 않는다.
 */
export function mergeCrdtStates(
  a: OfflineDocumentDelta,
  b: OfflineDocumentDelta,
): OfflineDocumentDelta {
  const headerWinner = pickLwwValue(
    { deviceId: a.deviceId, deviceLabel: a.deviceLabel },
    a.hlc,
    { deviceId: b.deviceId, deviceLabel: b.deviceLabel },
    b.hlc,
  );

  const layerIds = new Set([...Object.keys(a.layers), ...Object.keys(b.layers)]);
  const mergedLayers: Record<string, OfflineLayerMeta> = {};
  for (const id of [...layerIds].sort(compareDeviceIds)) {
    const la = a.layers[id];
    const lb = b.layers[id];
    if (la && lb) mergedLayers[id] = mergeLayerMeta(la, lb);
    else if (la) mergedLayers[id] = normalizeLayerMeta(la);
    else if (lb) mergedLayers[id] = normalizeLayerMeta(lb);
  }

  const tileKeys = new Set([...Object.keys(a.tiles), ...Object.keys(b.tiles)]);
  const mergedTiles: Record<string, RasterTileDelta> = {};
  for (const key of [...tileKeys].sort(compareDeviceIds)) {
    const ta = a.tiles[key];
    const tb = b.tiles[key];
    if (ta && tb) mergedTiles[key] = mergeRasterTile(ta, tb);
    else if (ta) mergedTiles[key] = createRasterTileDelta(ta);
    else if (tb) mergedTiles[key] = createRasterTileDelta(tb);
  }

  const bubbleIds = new Set([...Object.keys(a.bubbles), ...Object.keys(b.bubbles)]);
  const mergedBubbles: Record<string, OfflineSpeechBubble> = {};
  for (const id of [...bubbleIds].sort(compareDeviceIds)) {
    const ba = a.bubbles[id];
    const bb = b.bubbles[id];
    if (ba && bb) mergedBubbles[id] = mergeSpeechBubble(ba, bb);
    else if (ba) mergedBubbles[id] = normalizeSpeechBubble(ba);
    else if (bb) mergedBubbles[id] = normalizeSpeechBubble(bb);
  }

  const documentId = a.documentId === b.documentId
    ? a.documentId
    : compareDeviceIds(a.documentId, b.documentId) >= 0
      ? a.documentId
      : b.documentId;

  return sealOfflineDocumentDelta({
    documentId,
    deviceId: headerWinner.value.deviceId,
    deviceLabel: headerWinner.value.deviceLabel,
    hlc: maxHlc(a.hlc, b.hlc),
    vectorClock: mergeVectorClocks(a.vectorClock, b.vectorClock),
    layers: mergedLayers,
    tiles: mergedTiles,
    bubbles: mergedBubbles,
  });
}

function recordsStructurallyEqual(a: unknown, b: unknown): boolean {
  return canonicalStringify(a) === canonicalStringify(b);
}

function collectDeltaStrokes(
  baseTile: RasterTileDelta | undefined,
  sideTile: RasterTileDelta,
): readonly TileStrokeOp[] {
  if (!baseTile) return sideTile.strokes;
  const baseIds = new Set(baseTile.strokes.map((s) => `${s.strokeId}:${s.opHash}`));
  const added = sideTile.strokes.filter((s) => !baseIds.has(`${s.strokeId}:${s.opHash}`));
  return added.length > 0 ? added : sideTile.strokes;
}

function countUniqueStrokesAcross(...docs: readonly OfflineDocumentDelta[]): number {
  const ids = new Set<string>();
  for (const doc of docs) {
    for (const tile of Object.values(doc.tiles)) {
      for (const stroke of tile.strokes) {
        ids.add(stroke.strokeId);
      }
    }
  }
  return ids.size;
}

/**
 * 공통 조상(`base`) 기준 로컬(`local`)과 원격(`remote`) 스냅샷을 3-Way CRDT로 분석·병합한다.
 * - 겹치지 않는 타일·레이어·말풍선 변경은 100% 무손실 자동 병합한다.
 * - 동일 `(layerId, tileX, tileY)`가 동시(`concurrent`) 수정된 경우에만 `TileConflictItem`을 생성한다.
 */
export function mergeOfflineDocumentStates(
  base: OfflineDocumentDelta,
  local: OfflineDocumentDelta,
  remote: OfflineDocumentDelta,
): OfflineMergePlan {
  const baseIntegrity = verifyManifestIntegrity(base);
  const localIntegrity = verifyManifestIntegrity(local);
  const remoteIntegrity = verifyManifestIntegrity(remote);

  const autoMergedLayers: string[] = [];
  const autoMergedBubbles: string[] = [];
  const autoMergedTiles: string[] = [];
  const conflicts: TileConflictItem[] = [];

  const allLayerIds = new Set([
    ...Object.keys(base.layers),
    ...Object.keys(local.layers),
    ...Object.keys(remote.layers),
  ]);
  for (const layerId of [...allLayerIds].sort(compareDeviceIds)) {
    const baseLayer = base.layers[layerId];
    if (
      !recordsStructurallyEqual(baseLayer, local.layers[layerId])
      || !recordsStructurallyEqual(baseLayer, remote.layers[layerId])
    ) {
      autoMergedLayers.push(layerId);
    }
  }

  const allBubbleIds = new Set([
    ...Object.keys(base.bubbles),
    ...Object.keys(local.bubbles),
    ...Object.keys(remote.bubbles),
  ]);
  for (const bubbleId of [...allBubbleIds].sort(compareDeviceIds)) {
    const baseBubble = base.bubbles[bubbleId];
    if (
      !recordsStructurallyEqual(baseBubble, local.bubbles[bubbleId])
      || !recordsStructurallyEqual(baseBubble, remote.bubbles[bubbleId])
    ) {
      autoMergedBubbles.push(bubbleId);
    }
  }

  const allTileKeys = new Set([
    ...Object.keys(base.tiles),
    ...Object.keys(local.tiles),
    ...Object.keys(remote.tiles),
  ]);
  for (const tileKey of [...allTileKeys].sort(compareDeviceIds)) {
    const baseTile = base.tiles[tileKey];
    const localTile = local.tiles[tileKey];
    const remoteTile = remote.tiles[tileKey];
    const localChanged = (baseTile?.tileHash ?? null) !== (localTile?.tileHash ?? null);
    const remoteChanged = (baseTile?.tileHash ?? null) !== (remoteTile?.tileHash ?? null);

    if (!localChanged && !remoteChanged) continue;
    if (localChanged !== remoteChanged || !localTile || !remoteTile) {
      autoMergedTiles.push(tileKey);
      continue;
    }
    if (localTile.tileHash === remoteTile.tileHash) {
      autoMergedTiles.push(tileKey);
      continue;
    }

    const causality = compareCausality(localTile.vectorClock, remoteTile.vectorClock);
    if (causality === "before" || causality === "after") {
      autoMergedTiles.push(tileKey);
      continue;
    }

    const localDelta = collectDeltaStrokes(baseTile, localTile);
    const remoteDelta = collectDeltaStrokes(baseTile, remoteTile);
    const overlapRatio = computeBoundsOverlapRatio(
      computeUnionBounds(localDelta),
      computeUnionBounds(remoteDelta),
    );
    const layerName = local.layers[localTile.layerId]?.name
      ?? remote.layers[remoteTile.layerId]?.name
      ?? base.layers[localTile.layerId]?.name
      ?? localTile.layerId;

    conflicts.push(Object.freeze({
      conflictId: `conflict:${tileKey}`,
      tileKey,
      layerId: localTile.layerId,
      layerName,
      tileX: localTile.tileX,
      tileY: localTile.tileY,
      tileSize: TILE_SIZE_PX,
      overlapRatio,
      localStrokeCount: localDelta.length,
      remoteStrokeCount: remoteDelta.length,
      localTotalStrokeCount: localTile.strokes.length,
      remoteTotalStrokeCount: remoteTile.strokes.length,
      localHlc: localTile.hlc,
      remoteHlc: remoteTile.hlc,
      localVectorClock: localTile.vectorClock,
      remoteVectorClock: remoteTile.vectorClock,
      baseTileHash: baseTile?.tileHash ?? null,
      localTileHash: localTile.tileHash,
      remoteTileHash: remoteTile.tileHash,
      localDeviceId: local.deviceId,
      remoteDeviceId: remote.deviceId,
      localDeviceLabel: local.deviceLabel,
      remoteDeviceLabel: remote.deviceLabel,
      recommendedStrategy: "stack-as-new-layer",
      baseTile: baseTile ?? null,
      localTile,
      remoteTile,
    }));
  }

  const draftMergedDocument = mergeCrdtStates(local, remote);
  const autoMergedCount = autoMergedTiles.length + autoMergedLayers.length + autoMergedBubbles.length;

  return Object.freeze({
    documentId: draftMergedDocument.documentId,
    baseChecksum: base.manifestChecksum,
    localChecksum: local.manifestChecksum,
    remoteChecksum: remote.manifestChecksum,
    integrityReport: Object.freeze({
      base: baseIntegrity,
      local: localIntegrity,
      remote: remoteIntegrity,
      allValid: baseIntegrity.valid && localIntegrity.valid && remoteIntegrity.valid,
    }),
    mergedHlc: draftMergedDocument.hlc,
    mergedVectorClock: draftMergedDocument.vectorClock,
    autoMergedCount,
    autoMergedTiles: Object.freeze(autoMergedTiles),
    autoMergedLayers: Object.freeze(autoMergedLayers),
    autoMergedBubbles: Object.freeze(autoMergedBubbles),
    conflicts: Object.freeze(conflicts),
    draftMergedDocument,
    localDocument: local,
    remoteDocument: remote,
    totalUniqueInputStrokes: countUniqueStrokesAcross(local, remote),
  });
}

function sanitizeIdFragment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return cleaned.length > 0 ? cleaned : "peer";
}

export interface ApplyConflictResolutionOptions {
  readonly stackedLayerSuffix?: string;
}

/**
 * 사용자가 선택한 전략에 따라 충돌 타일을 최종 확정한다.
 * 결정을 생략한 충돌은 기본 추천 전략인 `stack-as-new-layer`(100% 무손실)를 적용한다.
 */
export function applyConflictResolution(
  plan: OfflineMergePlan,
  decisions: Readonly<Record<string, ConflictResolutionStrategy>> = {},
  options?: ApplyConflictResolutionOptions,
): ConflictResolutionResult {
  const layers: Record<string, OfflineLayerMeta> = { ...plan.draftMergedDocument.layers };
  const tiles: Record<string, RasterTileDelta> = { ...plan.draftMergedDocument.tiles };
  const appliedStrategies: Record<string, ConflictResolutionStrategy> = {};
  const createdLayerMap = new Map<string, OfflineLayerMeta>();
  const stackedSuffix = options?.stackedLayerSuffix?.trim() || "CRDT";

  for (const conflict of plan.conflicts) {
    const strategy: ConflictResolutionStrategy =
      decisions[conflict.conflictId]
      ?? decisions[conflict.tileKey]
      ?? conflict.recommendedStrategy;

    appliedStrategies[conflict.conflictId] = strategy;
    const resolvedHlc = maxHlc(conflict.localHlc, conflict.remoteHlc);
    const resolvedVc = mergeVectorClocks(conflict.localVectorClock, conflict.remoteVectorClock);

    if (strategy === "keep-local") {
      tiles[conflict.tileKey] = createRasterTileDelta({
        layerId: conflict.layerId,
        tileX: conflict.tileX,
        tileY: conflict.tileY,
        strokes: conflict.localTile.strokes,
        hlc: resolvedHlc,
        vectorClock: resolvedVc,
      });
      continue;
    }

    if (strategy === "keep-remote") {
      tiles[conflict.tileKey] = createRasterTileDelta({
        layerId: conflict.layerId,
        tileX: conflict.tileX,
        tileY: conflict.tileY,
        strokes: conflict.remoteTile.strokes,
        hlc: resolvedHlc,
        vectorClock: resolvedVc,
      });
      continue;
    }

    if (strategy === "keep-newer-hlc") {
      const winner = pickLwwValue(
        conflict.localTile,
        conflict.localHlc,
        conflict.remoteTile,
        conflict.remoteHlc,
      ).value;
      tiles[conflict.tileKey] = createRasterTileDelta({
        layerId: conflict.layerId,
        tileX: conflict.tileX,
        tileY: conflict.tileY,
        strokes: winner.strokes,
        hlc: resolvedHlc,
        vectorClock: resolvedVc,
      });
      continue;
    }

    tiles[conflict.tileKey] = createRasterTileDelta({
      layerId: conflict.layerId,
      tileX: conflict.tileX,
      tileY: conflict.tileY,
      strokes: conflict.localTile.strokes,
      hlc: resolvedHlc,
      vectorClock: resolvedVc,
    });

    const auxLayerId = `${conflict.layerId}__crdt_${sanitizeIdFragment(conflict.remoteDeviceId)}`;
    if (!layers[auxLayerId]) {
      const sourceLayer = layers[conflict.layerId];
      const auxLayer = normalizeLayerMeta({
        layerId: auxLayerId,
        name: `${conflict.layerName} · ${conflict.remoteDeviceLabel} (${stackedSuffix})`,
        visible: true,
        opacity: sourceLayer?.opacity ?? 1,
        blendMode: sourceLayer?.blendMode ?? "normal",
        zOrder: (sourceLayer?.zOrder ?? 0) + 1,
        locked: false,
        deleted: false,
        originDeviceId: conflict.remoteDeviceId,
        sourceLayerId: conflict.layerId,
        hlc: resolvedHlc,
        vectorClock: resolvedVc,
      });
      layers[auxLayerId] = auxLayer;
      createdLayerMap.set(auxLayerId, auxLayer);
    }

    const localIds = new Set(conflict.localTile.strokes.map((s) => s.strokeId));
    const remoteOnlyStrokes = conflict.remoteTile.strokes.filter((s) => !localIds.has(s.strokeId));
    const preservedRemoteStrokes = remoteOnlyStrokes.length > 0
      ? remoteOnlyStrokes
      : conflict.remoteTile.strokes;
    const auxTileKey = makeTileKey(auxLayerId, conflict.tileX, conflict.tileY);

    tiles[auxTileKey] = createRasterTileDelta({
      layerId: auxLayerId,
      tileX: conflict.tileX,
      tileY: conflict.tileY,
      strokes: preservedRemoteStrokes,
      hlc: resolvedHlc,
      vectorClock: resolvedVc,
    });
  }

  const resolvedDocument = sealOfflineDocumentDelta({
    documentId: plan.draftMergedDocument.documentId,
    deviceId: plan.draftMergedDocument.deviceId,
    deviceLabel: plan.draftMergedDocument.deviceLabel,
    hlc: plan.mergedHlc,
    vectorClock: plan.mergedVectorClock,
    layers,
    tiles,
    bubbles: plan.draftMergedDocument.bubbles,
  });

  const inputStrokeIds = new Set<string>();
  for (const doc of [plan.localDocument, plan.remoteDocument]) {
    for (const tile of Object.values(doc.tiles)) {
      for (const stroke of tile.strokes) inputStrokeIds.add(stroke.strokeId);
    }
  }
  const outputStrokeIds = new Set<string>();
  for (const tile of Object.values(resolvedDocument.tiles)) {
    for (const stroke of tile.strokes) outputStrokeIds.add(stroke.strokeId);
  }

  let preservedStrokeCount = 0;
  for (const id of inputStrokeIds) {
    if (outputStrokeIds.has(id)) preservedStrokeCount += 1;
  }

  const manifestIntegrity = verifyManifestIntegrity(resolvedDocument);

  return Object.freeze({
    resolvedDocument,
    appliedStrategies: Object.freeze(appliedStrategies),
    createdLayers: Object.freeze([...createdLayerMap.values()]),
    preservedStrokeCount,
    totalUniqueInputStrokes: inputStrokeIds.size,
    lostStrokeCount: inputStrokeIds.size - preservedStrokeCount,
    manifestIntegrity,
  });
}
