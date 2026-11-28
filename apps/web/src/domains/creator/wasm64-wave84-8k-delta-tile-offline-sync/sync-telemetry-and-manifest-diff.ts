/**
 * Wave 84 — 타일 매니페스트 차분 계획, 대역폭 절감 계측 및 Calm Atelier 한국어 동기화 요약.
 *
 * - 두 `TileCanvasManifest` 간 정확한 추가·수정·초기화·미변경 타일 차분 계산(`diffTileCanvasManifests`)
 * - 원본 8K 캔버스 바이트 대비 델타 전송 바이트 절감률 계측(`computeBandwidthSavingsMetrics`)
 * - 네트워크 프로파일별 예상 전송 시간 산출(`estimateTransferTimeByProfile`, `estimateTransferMatrix`)
 * - 자연스러운 한국어 Calm Atelier 동기화 상태 문구 포맷터(`formatOfflineSyncStatusSummaryKo`)
 */

import {
  BYTES_PER_PIXEL_RGBA,
  constantTimeEqualHex,
  type TileCanvasManifest,
} from "./content-addressed-tile-store";
import {
  NETWORK_PROFILE_SPECS,
  type NetworkProfileId,
} from "./offline-crdt-tile-sync-engine";

export interface TileManifestDiffReport {
  readonly canvasId: string;
  readonly localMerkleRoot: string;
  readonly remoteMerkleRoot: string;
  readonly isIdentical: boolean;
  readonly addedTileKeys: readonly string[];
  readonly modifiedTileKeys: readonly string[];
  readonly clearedTileKeys: readonly string[];
  readonly changedTileKeys: readonly string[];
  readonly changedTileCount: number;
  readonly unchangedTileCount: number;
  readonly totalTileSlots: number;
  readonly tileByteLength: number;
  readonly changedTilesRawBytes: number;
  readonly fullCanvasRawBytes: number;
}

export interface BandwidthSavingsInput {
  readonly fullCanvasRawBytes: number;
  readonly changedTilesRawBytes: number;
  readonly deltaWireBytes: number;
}

export interface BandwidthSavingsMetrics {
  readonly fullCanvasRawBytes: number;
  readonly changedTilesRawBytes: number;
  readonly deltaWireBytes: number;
  readonly savedBytesVsFullCanvas: number;
  readonly bandwidthSavingsRatio: number;
  readonly bandwidthSavingsPercent: number;
  readonly deltaVsChangedTileCompressionRatio: number;
}

export interface NetworkTransferEstimate {
  readonly profile: NetworkProfileId;
  readonly labelKo: string;
  readonly bandwidthBps: number;
  readonly rttMs: number;
  readonly canTransferNow: boolean;
  readonly estimatedMs: number | null;
  readonly formattedDurationKo: string;
}

export type OfflineSyncUiPhase =
  | "idle-synced"
  | "queued-offline"
  | "pending-online"
  | "syncing"
  | "integrity-blocked";

export interface OfflineSyncStatusSummaryInput {
  readonly phase: OfflineSyncUiPhase;
  readonly networkProfile: NetworkProfileId;
  readonly pendingTileCount: number;
  readonly pendingWireBytes: number;
  readonly completedChunks?: number;
  readonly totalChunks?: number;
  readonly archivedConflictCount?: number;
  readonly blockedCorruptTileCount?: number;
}

/**
 * 로컬 매니페스트와 원격 매니페스트를 비교해 전송이 필요한 타일 차분 계획을 산출한다.
 */
export function diffTileCanvasManifests(
  localManifest: TileCanvasManifest,
  remoteManifest: TileCanvasManifest,
): TileManifestDiffReport {
  if (
    localManifest.width !== remoteManifest.width ||
    localManifest.height !== remoteManifest.height ||
    localManifest.tileSize !== remoteManifest.tileSize
  ) {
    throw new Error("캔버스 크기 또는 타일 규격이 다른 매니페스트는 비교할 수 없습니다.");
  }

  const allKeys = new Set<string>([
    ...Object.keys(localManifest.nonBlankTiles),
    ...Object.keys(remoteManifest.nonBlankTiles),
  ]);
  const sortedKeys = Array.from(allKeys).sort();

  const addedTileKeys: string[] = [];
  const modifiedTileKeys: string[] = [];
  const clearedTileKeys: string[] = [];

  for (let i = 0; i < sortedKeys.length; i += 1) {
    const key = sortedKeys[i] ?? "";
    const localHash = localManifest.nonBlankTiles[key] ?? null;
    const remoteHash = remoteManifest.nonBlankTiles[key] ?? null;

    if (localHash !== null && remoteHash === null) {
      addedTileKeys.push(key);
    } else if (localHash === null && remoteHash !== null) {
      clearedTileKeys.push(key);
    } else if (localHash !== null && remoteHash !== null && !constantTimeEqualHex(localHash, remoteHash)) {
      modifiedTileKeys.push(key);
    }
  }

  const changedTileKeys = [...addedTileKeys, ...modifiedTileKeys, ...clearedTileKeys].sort();
  const layerUnion = new Set<string>([...localManifest.layerIds, ...remoteManifest.layerIds]);
  const totalTileSlots = Math.max(
    localManifest.totalTileSlots,
    remoteManifest.totalTileSlots,
    layerUnion.size * localManifest.tilesX * localManifest.tilesY,
  );
  const changedTileCount = changedTileKeys.length;
  const unchangedTileCount = Math.max(0, totalTileSlots - changedTileCount);

  const tileByteLength = localManifest.tileSize * localManifest.tileSize * BYTES_PER_PIXEL_RGBA;
  const changedTilesRawBytes = changedTileCount * tileByteLength;
  const fullCanvasRawBytes =
    localManifest.width * localManifest.height * BYTES_PER_PIXEL_RGBA * Math.max(1, layerUnion.size);

  const isIdentical =
    changedTileCount === 0 &&
    constantTimeEqualHex(localManifest.merkleRoot, remoteManifest.merkleRoot);

  return {
    canvasId: localManifest.canvasId,
    localMerkleRoot: localManifest.merkleRoot,
    remoteMerkleRoot: remoteManifest.merkleRoot,
    isIdentical,
    addedTileKeys,
    modifiedTileKeys,
    clearedTileKeys,
    changedTileKeys,
    changedTileCount,
    unchangedTileCount,
    totalTileSlots,
    tileByteLength,
    changedTilesRawBytes,
    fullCanvasRawBytes,
  };
}

/**
 * 전체 캔버스 원본 바이트와 실제 델타 전송 바이트를 비교해 대역폭 절감률을 계산한다.
 */
export function computeBandwidthSavingsMetrics(
  input: BandwidthSavingsInput,
): BandwidthSavingsMetrics {
  const fullCanvasRawBytes = Math.max(0, input.fullCanvasRawBytes);
  const changedTilesRawBytes = Math.max(0, input.changedTilesRawBytes);
  const deltaWireBytes = Math.max(0, input.deltaWireBytes);

  const savedBytesVsFullCanvas = Math.max(0, fullCanvasRawBytes - deltaWireBytes);
  const bandwidthSavingsRatio =
    fullCanvasRawBytes > 0
      ? Math.max(0, Math.min(1, 1 - deltaWireBytes / fullCanvasRawBytes))
      : 1;
  const bandwidthSavingsPercent = Math.round(bandwidthSavingsRatio * 10000) / 100;
  const deltaVsChangedTileCompressionRatio =
    changedTilesRawBytes > 0 && deltaWireBytes > 0
      ? Math.round((changedTilesRawBytes / deltaWireBytes) * 100) / 100
      : 1;

  return {
    fullCanvasRawBytes,
    changedTilesRawBytes,
    deltaWireBytes,
    savedBytesVsFullCanvas,
    bandwidthSavingsRatio,
    bandwidthSavingsPercent,
    deltaVsChangedTileCompressionRatio,
  };
}

/** 바이트 크기를 IEC 단위(`B`, `KiB`, `MiB`, `GiB`) 한국어 UI 표시 문자열로 포맷한다. */
export function formatByteSizeKo(bytes: number): string {
  const safeBytes = Math.max(0, bytes);
  if (safeBytes < 1024) {
    return `${Math.round(safeBytes)} B`;
  }
  const kib = safeBytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(1)} KiB`;
  }
  const mib = kib / 1024;
  if (mib < 1024) {
    return `${mib.toFixed(1)} MiB`;
  }
  const gib = mib / 1024;
  return `${gib.toFixed(2)} GiB`;
}

/** 밀리초 단위 예상 전송 시간을 간결한 한국어 시간 표기로 변환한다. */
export function formatTransferDurationKo(durationMs: number | null): string {
  if (durationMs === null) {
    return "연결 대기";
  }
  if (durationMs <= 0) {
    return "즉시";
  }
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `약 ${seconds.toFixed(1)}초`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainSec = Math.round(seconds % 60);
  return remainSec > 0 ? `약 ${minutes}분 ${remainSec}초` : `약 ${minutes}분`;
}

/** 단일 네트워크 프로파일에 대한 델타 전송 예상 시간을 산출한다. */
export function estimateTransferTimeByProfile(
  deltaWireBytes: number,
  chunkCount: number,
  profile: NetworkProfileId,
): NetworkTransferEstimate {
  const spec = NETWORK_PROFILE_SPECS[profile];
  if (!spec.canTransferNow) {
    return {
      profile,
      labelKo: spec.labelKo,
      bandwidthBps: spec.bandwidthBps,
      rttMs: spec.rttMs,
      canTransferNow: false,
      estimatedMs: null,
      formattedDurationKo: "연결 대기",
    };
  }

  const safeBytes = Math.max(0, deltaWireBytes);
  const effectiveChunks = safeBytes === 0 ? 0 : Math.max(1, chunkCount);
  const payloadMs = spec.bandwidthBps > 0 ? ((safeBytes * 8) / spec.bandwidthBps) * 1000 : 0;
  const estimatedMs = Math.round((payloadMs + effectiveChunks * spec.rttMs) * 100) / 100;

  return {
    profile,
    labelKo: spec.labelKo,
    bandwidthBps: spec.bandwidthBps,
    rttMs: spec.rttMs,
    canTransferNow: true,
    estimatedMs,
    formattedDurationKo: formatTransferDurationKo(estimatedMs),
  };
}

/** 모든 지원 네트워크 프로파일에 대한 예상 전송 시간 매트릭스를 반환한다. */
export function estimateTransferMatrix(
  deltaWireBytes: number,
  chunkCount: number,
): Readonly<Record<NetworkProfileId, NetworkTransferEstimate>> {
  return {
    "airplane-queued": estimateTransferTimeByProfile(deltaWireBytes, chunkCount, "airplane-queued"),
    "subway-lte-1mbps": estimateTransferTimeByProfile(deltaWireBytes, chunkCount, "subway-lte-1mbps"),
    "cafe-wifi-20mbps": estimateTransferTimeByProfile(deltaWireBytes, chunkCount, "cafe-wifi-20mbps"),
    "lan-gigabit": estimateTransferTimeByProfile(deltaWireBytes, chunkCount, "lan-gigabit"),
  };
}

/**
 * Calm Atelier 톤에 맞춘 간결한 한국어 오프라인·저속망 동기화 상태 요약을 생성한다.
 * 예: `"비행기 모드 대기 · 변경 타일 3개(18.4 KiB)"`
 */
export function formatOfflineSyncStatusSummaryKo(input: OfflineSyncStatusSummaryInput): string {
  const spec = NETWORK_PROFILE_SPECS[input.networkProfile];
  const pendingTiles = Math.max(0, Math.floor(input.pendingTileCount));
  const pendingSize = formatByteSizeKo(input.pendingWireBytes);
  const conflictCount = Math.max(0, Math.floor(input.archivedConflictCount ?? 0));
  const blockedCount = Math.max(0, Math.floor(input.blockedCorruptTileCount ?? 0));

  if (input.phase === "integrity-blocked") {
    const count = Math.max(1, blockedCount);
    return `무결성 검증 실패 · 손상 타일 ${count}개 차단됨`;
  }

  if (input.phase === "queued-offline" || input.networkProfile === "airplane-queued") {
    if (pendingTiles === 0) {
      return conflictCount > 0
        ? `비행기 모드 · 충돌 보관 타일 ${conflictCount}개 확인 필요`
        : "비행기 모드 · 최신 상태";
    }
    return `비행기 모드 대기 · 변경 타일 ${pendingTiles}개(${pendingSize})`;
  }

  if (input.phase === "syncing") {
    const done = Math.max(0, Math.floor(input.completedChunks ?? 0));
    const total = Math.max(done, Math.floor(input.totalChunks ?? 0));
    const chunkSuffix = total > 0 ? ` ${done}/${total} 청크 ·` : "";
    return `${spec.shortLabelKo} 동기화 중 ·${chunkSuffix} 남은 타일 ${pendingTiles}개(${pendingSize})`;
  }

  if (input.phase === "pending-online" && pendingTiles > 0) {
    const est = estimateTransferTimeByProfile(
      input.pendingWireBytes,
      Math.max(1, Math.ceil(input.pendingWireBytes / Math.max(1, spec.maxChunkBytes))),
      input.networkProfile,
    );
    return `${spec.shortLabelKo} 전송 대기 · 변경 타일 ${pendingTiles}개(${pendingSize} · ${est.formattedDurationKo})`;
  }

  if (conflictCount > 0) {
    return `동기화 완료 · 충돌 보관 타일 ${conflictCount}개 확인 필요`;
  }
  return "동기화 완료 · 모든 기기 일치";
}
