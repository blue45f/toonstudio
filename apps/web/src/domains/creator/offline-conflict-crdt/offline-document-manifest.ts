/**
 * 오프라인 문서 델타 모델, 256×256 타일 경계/해시, FNV-1a 64-bit 매니페스트 무결성 검증기.
 */

import {
  compareDeviceIds,
  compareHlc,
  createVectorClock,
  type HlcTimestamp,
  type VectorClock,
} from "./hlc-vector-clock";

export const TILE_SIZE_PX = 256 as const;

export interface TileBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TileStrokeOp {
  readonly strokeId: string;
  readonly deviceId: string;
  readonly brushId: string;
  readonly pointCount: number;
  readonly bounds: TileBounds;
  readonly hlc: HlcTimestamp;
  readonly opHash: string;
}

export interface RasterTileDelta {
  readonly tileKey: string;
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly tileSize: typeof TILE_SIZE_PX;
  readonly strokes: readonly TileStrokeOp[];
  readonly tileHash: string;
  readonly dirtyBounds: TileBounds;
  readonly hlc: HlcTimestamp;
  readonly vectorClock: VectorClock;
}

export interface LayerFieldClocks {
  readonly name?: HlcTimestamp;
  readonly visible?: HlcTimestamp;
  readonly opacity?: HlcTimestamp;
  readonly blendMode?: HlcTimestamp;
  readonly zOrder?: HlcTimestamp;
  readonly locked?: HlcTimestamp;
  readonly deleted?: HlcTimestamp;
}

export interface OfflineLayerMeta {
  readonly layerId: string;
  readonly name: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly blendMode: string;
  readonly zOrder: number;
  readonly locked: boolean;
  readonly deleted?: boolean;
  readonly originDeviceId?: string;
  readonly sourceLayerId?: string;
  readonly hlc: HlcTimestamp;
  readonly vectorClock: VectorClock;
  readonly fieldClocks?: LayerFieldClocks;
}

export interface BubbleFieldClocks {
  readonly layerId?: HlcTimestamp;
  readonly text?: HlcTimestamp;
  readonly x?: HlcTimestamp;
  readonly y?: HlcTimestamp;
  readonly width?: HlcTimestamp;
  readonly height?: HlcTimestamp;
  readonly fontSize?: HlcTimestamp;
  readonly style?: HlcTimestamp;
  readonly deleted?: HlcTimestamp;
}

export interface OfflineSpeechBubble {
  readonly bubbleId: string;
  readonly layerId: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
  readonly style: string;
  readonly deleted?: boolean;
  readonly hlc: HlcTimestamp;
  readonly vectorClock: VectorClock;
  readonly fieldClocks?: BubbleFieldClocks;
}

export interface OfflineDocumentDelta {
  readonly documentId: string;
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly hlc: HlcTimestamp;
  readonly vectorClock: VectorClock;
  readonly layers: Readonly<Record<string, OfflineLayerMeta>>;
  readonly tiles: Readonly<Record<string, RasterTileDelta>>;
  readonly bubbles: Readonly<Record<string, OfflineSpeechBubble>>;
  readonly manifestChecksum: string;
}

export type ConflictResolutionStrategy =
  | "keep-local"
  | "keep-remote"
  | "stack-as-new-layer"
  | "keep-newer-hlc";

export interface TileConflictItem {
  readonly conflictId: string;
  readonly tileKey: string;
  readonly layerId: string;
  readonly layerName: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly tileSize: typeof TILE_SIZE_PX;
  /** 256×256 타일 내 로컬/원격 변경 영역의 IoU 겹침 비율(0..1) */
  readonly overlapRatio: number;
  readonly localStrokeCount: number;
  readonly remoteStrokeCount: number;
  readonly localTotalStrokeCount: number;
  readonly remoteTotalStrokeCount: number;
  readonly localHlc: HlcTimestamp;
  readonly remoteHlc: HlcTimestamp;
  readonly localVectorClock: VectorClock;
  readonly remoteVectorClock: VectorClock;
  readonly baseTileHash: string | null;
  readonly localTileHash: string;
  readonly remoteTileHash: string;
  readonly localDeviceId: string;
  readonly remoteDeviceId: string;
  readonly localDeviceLabel: string;
  readonly remoteDeviceLabel: string;
  readonly recommendedStrategy: "stack-as-new-layer";
  readonly baseTile: RasterTileDelta | null;
  readonly localTile: RasterTileDelta;
  readonly remoteTile: RasterTileDelta;
}

export interface ManifestIntegrityResult {
  readonly valid: boolean;
  readonly expectedChecksum: string;
  readonly actualChecksum: string;
  readonly corruptedTileKeys: readonly string[];
  readonly reasons: readonly string[];
}

export interface OfflineMergeIntegrityReport {
  readonly base: ManifestIntegrityResult;
  readonly local: ManifestIntegrityResult;
  readonly remote: ManifestIntegrityResult;
  readonly allValid: boolean;
}

export interface OfflineMergePlan {
  readonly documentId: string;
  readonly baseChecksum: string;
  readonly localChecksum: string;
  readonly remoteChecksum: string;
  readonly integrityReport: OfflineMergeIntegrityReport;
  readonly mergedHlc: HlcTimestamp;
  readonly mergedVectorClock: VectorClock;
  readonly autoMergedCount: number;
  readonly autoMergedTiles: readonly string[];
  readonly autoMergedLayers: readonly string[];
  readonly autoMergedBubbles: readonly string[];
  readonly conflicts: readonly TileConflictItem[];
  readonly draftMergedDocument: OfflineDocumentDelta;
  readonly localDocument: OfflineDocumentDelta;
  readonly remoteDocument: OfflineDocumentDelta;
  readonly totalUniqueInputStrokes: number;
}

export interface ConflictResolutionResult {
  readonly resolvedDocument: OfflineDocumentDelta;
  readonly appliedStrategies: Readonly<Record<string, ConflictResolutionStrategy>>;
  readonly createdLayers: readonly OfflineLayerMeta[];
  readonly preservedStrokeCount: number;
  readonly totalUniqueInputStrokes: number;
  readonly lostStrokeCount: number;
  readonly manifestIntegrity: ManifestIntegrityResult;
}

export type UnsealedOfflineDocumentDelta = Omit<OfflineDocumentDelta, "manifestChecksum">;

const FNV1A_64_OFFSET = BigInt("0xcbf29ce484222325");
const FNV1A_64_PRIME = BigInt("0x100000001b3");
const FNV1A_64_MASK = BigInt("0xffffffffffffffff");
const EMPTY_BOUNDS: TileBounds = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });

function encodeUtf8Bytes(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        const cp = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        bytes.push(
          0xf0 | (cp >> 18),
          0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f),
          0x80 | (cp & 0x3f),
        );
        i += 1;
      } else {
        bytes.push(0xef, 0xbf, 0xbd);
      }
    } else {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

/** 표준 FNV-1a 64-bit 해시를 16자리 소문자 hex 문자열로 계산한다. */
export function fnv1a64Hex(input: string): string {
  const bytes = encodeUtf8Bytes(input);
  let hash = FNV1A_64_OFFSET;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= BigInt(bytes[i] ?? 0);
    hash = (hash * FNV1A_64_PRIME) & FNV1A_64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

/** 객체 키를 사전순 정렬해 플랫폼·삽입순서와 무관한 정규 JSON 문자열을 만든다. */
export function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "0";
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record).sort(compareDeviceIds);
    const pairs: string[] = [];
    for (const key of keys) {
      const entry = record[key];
      if (entry === undefined) continue;
      pairs.push(`${JSON.stringify(key)}:${canonicalStringify(entry)}`);
    }
    return `{${pairs.join(",")}}`;
  }
  return "null";
}

export function makeTileKey(layerId: string, tileX: number, tileY: number): string {
  return `${layerId}:${Math.trunc(tileX)}:${Math.trunc(tileY)}`;
}

function clampCoord(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(TILE_SIZE_PX, Math.round(value * 100) / 100));
}

export function normalizeTileBounds(bounds: TileBounds): TileBounds {
  const x = clampCoord(bounds.x);
  const y = clampCoord(bounds.y);
  const width = Math.max(0, Math.min(TILE_SIZE_PX - x, Math.round(bounds.width * 100) / 100));
  const height = Math.max(0, Math.min(TILE_SIZE_PX - y, Math.round(bounds.height * 100) / 100));
  return Object.freeze({ x, y, width, height });
}

export function computeUnionBounds(strokes: readonly TileStrokeOp[]): TileBounds {
  if (strokes.length === 0) return EMPTY_BOUNDS;
  let minX: number = TILE_SIZE_PX;
  let minY: number = TILE_SIZE_PX;
  let maxX = 0;
  let maxY = 0;
  let hasArea = false;

  for (const stroke of strokes) {
    const b = normalizeTileBounds(stroke.bounds);
    if (b.width <= 0 && b.height <= 0) continue;
    hasArea = true;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  if (!hasArea) return EMPTY_BOUNDS;
  return Object.freeze({
    x: minX,
    y: minY,
    width: Math.max(0, Math.round((maxX - minX) * 100) / 100),
    height: Math.max(0, Math.round((maxY - minY) * 100) / 100),
  });
}

/** 두 타일 영역의 교집합 대 합집합 비율(IoU, 0..1)을 계산한다. */
export function computeBoundsOverlapRatio(a: TileBounds, b: TileBounds): number {
  const na = normalizeTileBounds(a);
  const nb = normalizeTileBounds(b);
  const areaA = na.width * na.height;
  const areaB = nb.width * nb.height;
  if (areaA <= 0 || areaB <= 0) return 0;

  const interX1 = Math.max(na.x, nb.x);
  const interY1 = Math.max(na.y, nb.y);
  const interX2 = Math.min(na.x + na.width, nb.x + nb.width);
  const interY2 = Math.min(na.y + na.height, nb.y + nb.height);
  const interW = Math.max(0, interX2 - interX1);
  const interH = Math.max(0, interY2 - interY1);
  const interArea = interW * interH;
  const unionArea = areaA + areaB - interArea;
  if (unionArea <= 0) return 0;
  return Math.round((interArea / unionArea) * 10000) / 10000;
}

/** HLC + 정규 직렬화 기반 결정론적 LWW-Register 값 선택(교환·결합·멱등). */
export function pickLwwValue<T>(
  valA: T,
  hlcA: HlcTimestamp,
  valB: T,
  hlcB: HlcTimestamp,
): { readonly value: T; readonly hlc: HlcTimestamp } {
  const cmp = compareHlc(hlcA, hlcB);
  if (cmp > 0) return { value: valA, hlc: hlcA };
  if (cmp < 0) return { value: valB, hlc: hlcB };
  const serA = canonicalStringify(valA);
  const serB = canonicalStringify(valB);
  return serA >= serB ? { value: valA, hlc: hlcA } : { value: valB, hlc: hlcB };
}

function compareStrokes(a: TileStrokeOp, b: TileStrokeOp): number {
  const hlcDiff = compareHlc(a.hlc, b.hlc);
  if (hlcDiff !== 0) return hlcDiff;
  const idDiff = compareDeviceIds(a.strokeId, b.strokeId);
  if (idDiff !== 0) return idDiff;
  return compareDeviceIds(a.opHash, b.opHash);
}

export function normalizeStrokes(strokes: readonly TileStrokeOp[]): readonly TileStrokeOp[] {
  const byId = new Map<string, TileStrokeOp>();
  for (const stroke of strokes) {
    const normalized: TileStrokeOp = Object.freeze({
      strokeId: stroke.strokeId,
      deviceId: stroke.deviceId,
      brushId: stroke.brushId,
      pointCount: Math.max(1, Math.trunc(stroke.pointCount)),
      bounds: normalizeTileBounds(stroke.bounds),
      hlc: stroke.hlc,
      opHash: stroke.opHash,
    });
    const existing = byId.get(normalized.strokeId);
    if (!existing) {
      byId.set(normalized.strokeId, normalized);
    } else {
      byId.set(normalized.strokeId, pickLwwValue(existing, existing.hlc, normalized, normalized.hlc).value);
    }
  }
  return Object.freeze([...byId.values()].sort(compareStrokes));
}

/** 타일 내 스트로크 목록의 정규 FNV-1a 64-bit 해시를 계산한다. */
export function computeTileHash(strokes: readonly TileStrokeOp[]): string {
  return fnv1a64Hex(canonicalStringify(normalizeStrokes(strokes)));
}

export function createRasterTileDelta(input: {
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly strokes: readonly TileStrokeOp[];
  readonly hlc: HlcTimestamp;
  readonly vectorClock: VectorClock;
}): RasterTileDelta {
  const strokes = normalizeStrokes(input.strokes);
  const tileX = Math.trunc(input.tileX);
  const tileY = Math.trunc(input.tileY);
  return Object.freeze({
    tileKey: makeTileKey(input.layerId, tileX, tileY),
    layerId: input.layerId,
    tileX,
    tileY,
    tileSize: TILE_SIZE_PX,
    strokes,
    tileHash: computeTileHash(strokes),
    dirtyBounds: computeUnionBounds(strokes),
    hlc: input.hlc,
    vectorClock: createVectorClock(input.vectorClock),
  });
}

export function normalizeLayerMeta(layer: OfflineLayerMeta): OfflineLayerMeta {
  const clocks: LayerFieldClocks = Object.freeze({
    name: layer.fieldClocks?.name ?? layer.hlc,
    visible: layer.fieldClocks?.visible ?? layer.hlc,
    opacity: layer.fieldClocks?.opacity ?? layer.hlc,
    blendMode: layer.fieldClocks?.blendMode ?? layer.hlc,
    zOrder: layer.fieldClocks?.zOrder ?? layer.hlc,
    locked: layer.fieldClocks?.locked ?? layer.hlc,
    deleted: layer.fieldClocks?.deleted ?? layer.hlc,
  });
  return Object.freeze({
    layerId: layer.layerId,
    name: layer.name,
    visible: layer.visible,
    opacity: Math.max(0, Math.min(1, Math.round(layer.opacity * 1000) / 1000)),
    blendMode: layer.blendMode,
    zOrder: Math.trunc(layer.zOrder),
    locked: layer.locked,
    deleted: layer.deleted === true,
    ...(layer.originDeviceId ? { originDeviceId: layer.originDeviceId } : {}),
    ...(layer.sourceLayerId ? { sourceLayerId: layer.sourceLayerId } : {}),
    hlc: layer.hlc,
    vectorClock: createVectorClock(layer.vectorClock),
    fieldClocks: clocks,
  });
}

export function normalizeSpeechBubble(bubble: OfflineSpeechBubble): OfflineSpeechBubble {
  const clocks: BubbleFieldClocks = Object.freeze({
    layerId: bubble.fieldClocks?.layerId ?? bubble.hlc,
    text: bubble.fieldClocks?.text ?? bubble.hlc,
    x: bubble.fieldClocks?.x ?? bubble.hlc,
    y: bubble.fieldClocks?.y ?? bubble.hlc,
    width: bubble.fieldClocks?.width ?? bubble.hlc,
    height: bubble.fieldClocks?.height ?? bubble.hlc,
    fontSize: bubble.fieldClocks?.fontSize ?? bubble.hlc,
    style: bubble.fieldClocks?.style ?? bubble.hlc,
    deleted: bubble.fieldClocks?.deleted ?? bubble.hlc,
  });
  return Object.freeze({
    bubbleId: bubble.bubbleId,
    layerId: bubble.layerId,
    text: bubble.text,
    x: Math.round(bubble.x * 100) / 100,
    y: Math.round(bubble.y * 100) / 100,
    width: Math.max(1, Math.round(bubble.width * 100) / 100),
    height: Math.max(1, Math.round(bubble.height * 100) / 100),
    fontSize: Math.max(6, Math.round(bubble.fontSize * 100) / 100),
    style: bubble.style,
    deleted: bubble.deleted === true,
    hlc: bubble.hlc,
    vectorClock: createVectorClock(bubble.vectorClock),
    fieldClocks: clocks,
  });
}

export function sortRecord<T>(entries: Readonly<Record<string, T>>): Readonly<Record<string, T>> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(entries).sort(compareDeviceIds)) {
    const val = entries[key];
    if (val !== undefined) sorted[key] = val;
  }
  return Object.freeze(sorted);
}

/** 문서 스냅샷 전체 페이로드의 정규 FNV-1a 64-bit 무결성 체크섬을 산출한다. */
export function computeManifestChecksum(snapshot: UnsealedOfflineDocumentDelta): string {
  const payload = {
    documentId: snapshot.documentId,
    deviceId: snapshot.deviceId,
    deviceLabel: snapshot.deviceLabel,
    hlc: snapshot.hlc,
    vectorClock: createVectorClock(snapshot.vectorClock),
    layers: sortRecord(snapshot.layers),
    tiles: sortRecord(snapshot.tiles),
    bubbles: sortRecord(snapshot.bubbles),
  };
  return fnv1a64Hex(canonicalStringify(payload));
}

/** 타일 해시·정렬·매니페스트 체크섬을 일괄 봉인한 정규 스냅샷을 생성한다. */
export function sealOfflineDocumentDelta(
  input: UnsealedOfflineDocumentDelta,
): OfflineDocumentDelta {
  const layers: Record<string, OfflineLayerMeta> = {};
  for (const key of Object.keys(input.layers).sort(compareDeviceIds)) {
    const layer = input.layers[key];
    if (layer) layers[key] = normalizeLayerMeta(layer);
  }

  const tiles: Record<string, RasterTileDelta> = {};
  for (const key of Object.keys(input.tiles).sort(compareDeviceIds)) {
    const tile = input.tiles[key];
    if (!tile) continue;
    const strokes = normalizeStrokes(tile.strokes);
    const tileKey = makeTileKey(tile.layerId, tile.tileX, tile.tileY);
    tiles[tileKey] = Object.freeze({
      tileKey,
      layerId: tile.layerId,
      tileX: Math.trunc(tile.tileX),
      tileY: Math.trunc(tile.tileY),
      tileSize: TILE_SIZE_PX,
      strokes,
      tileHash: computeTileHash(strokes),
      dirtyBounds: computeUnionBounds(strokes),
      hlc: tile.hlc,
      vectorClock: createVectorClock(tile.vectorClock),
    });
  }

  const bubbles: Record<string, OfflineSpeechBubble> = {};
  for (const key of Object.keys(input.bubbles).sort(compareDeviceIds)) {
    const bubble = input.bubbles[key];
    if (bubble) bubbles[key] = normalizeSpeechBubble(bubble);
  }

  const unsealed: UnsealedOfflineDocumentDelta = {
    documentId: input.documentId,
    deviceId: input.deviceId,
    deviceLabel: input.deviceLabel,
    hlc: input.hlc,
    vectorClock: createVectorClock(input.vectorClock),
    layers: sortRecord(layers),
    tiles: sortRecord(tiles),
    bubbles: sortRecord(bubbles),
  };

  return Object.freeze({
    ...unsealed,
    manifestChecksum: computeManifestChecksum(unsealed),
  });
}

/**
 * 오프라인 스냅샷의 변조·손상 여부를 검증한다.
 * 개별 타일 스트로크 해시와 전체 매니페스트 FNV-1a 64-bit 체크섬을 모두 교차 확인한다.
 */
export function verifyManifestIntegrity(snapshot: OfflineDocumentDelta): ManifestIntegrityResult {
  const corruptedTileKeys: string[] = [];
  const reasons: string[] = [];

  for (const key of Object.keys(snapshot.tiles).sort(compareDeviceIds)) {
    const tile = snapshot.tiles[key];
    if (!tile) continue;
    const expectedTileHash = computeTileHash(tile.strokes);
    if (tile.tileHash !== expectedTileHash) {
      corruptedTileKeys.push(key);
      reasons.push(`tile_hash_mismatch:${key}`);
    }
    const expectedKey = makeTileKey(tile.layerId, tile.tileX, tile.tileY);
    if (key !== expectedKey || tile.tileKey !== expectedKey) {
      if (!corruptedTileKeys.includes(key)) corruptedTileKeys.push(key);
      reasons.push(`tile_key_mismatch:${key}`);
    }
  }

  const expectedChecksum = computeManifestChecksum({
    documentId: snapshot.documentId,
    deviceId: snapshot.deviceId,
    deviceLabel: snapshot.deviceLabel,
    hlc: snapshot.hlc,
    vectorClock: snapshot.vectorClock,
    layers: snapshot.layers,
    tiles: snapshot.tiles,
    bubbles: snapshot.bubbles,
  });

  if (snapshot.manifestChecksum !== expectedChecksum) {
    reasons.push("manifest_checksum_mismatch");
  }

  return Object.freeze({
    valid: reasons.length === 0,
    expectedChecksum,
    actualChecksum: snapshot.manifestChecksum,
    corruptedTileKeys: Object.freeze(corruptedTileKeys),
    reasons: Object.freeze(reasons),
  });
}
