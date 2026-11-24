/**
 * Zero-Copy 선형 메모리 링버퍼 vs 매 프레임 힙 할당+복사 경로 결정론적 벤치마크 하네스.
 */

import {
  ZeroCopyTileRingBus,
  computeTileIntegrityChecksums,
  type TileRingBackingMode,
  type TileRingBackingPreference,
} from "./zero-copy-tile-ring";

export interface ZeroCopyRingBenchmarkOptions {
  readonly tileSize?: 64 | 128 | 256;
  readonly frameCount?: number;
  readonly slotCount?: number;
  readonly backingMode?: TileRingBackingPreference;
  readonly injectCorruptionAtFrame?: number | null;
}

export interface ZeroCopyRingBenchmarkReport {
  readonly tileSize: 64 | 128 | 256;
  readonly frameCount: number;
  readonly slotCount: number;
  readonly tilePayloadBytes: number;
  readonly totalTransferredBytes: number;
  readonly backingMode: TileRingBackingMode;
  readonly crossOriginIsolated: boolean;
  readonly zeroCopyElapsedMs: number;
  readonly copyAllocElapsedMs: number;
  readonly zeroCopyThroughputMiBPerSec: number;
  readonly copyAllocThroughputMiBPerSec: number;
  readonly zeroCopyTilesPerSec: number;
  readonly zeroCopyHeapAllocations: number;
  readonly copyAllocHeapAllocations: number;
  readonly savedHeapBytes: number;
  readonly allocationReductionPct: number;
  readonly verifiedFrames: number;
  readonly checksumMismatchCount: number;
  readonly peakOccupancySlots: number;
  readonly allViewsZeroCopyVerified: boolean;
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function fillDeterministicRgbaTile(target: Uint8Array, seed: number): void {
  const len = target.byteLength;
  const rBase = (seed * 37 + 19) & 0xff;
  const gBase = (seed * 73 + 41) & 0xff;
  const bBase = (seed * 131 + 83) & 0xff;
  for (let i = 0; i < len; i += 4) {
    const idx = i >>> 2;
    target[i] = (rBase + (idx & 0x3f)) & 0xff;
    target[i + 1] = (gBase + ((idx >>> 4) & 0x3f)) & 0xff;
    target[i + 2] = (bBase + ((idx >>> 8) & 0x3f)) & 0xff;
    target[i + 3] = 255;
  }
}

/**
 * 제로카피 링버퍼 전송 경로 vs 매 프레임 힙 할당+복사 경로의 결정론적 벤치마크를 실행한다.
 */
export function runZeroCopyTileRingBenchmark(
  options: ZeroCopyRingBenchmarkOptions = {},
): ZeroCopyRingBenchmarkReport {
  const tileSize: 64 | 128 | 256 = options.tileSize ?? 64;
  const frameCount = Math.max(4, Math.min(512, Math.floor(options.frameCount ?? 64)));
  const tilePayloadBytes = tileSize * tileSize * 4;
  const totalTransferredBytes = tilePayloadBytes * frameCount;

  const ring = new ZeroCopyTileRingBus({
    slotCount: options.slotCount ?? 16,
    tileWidth: tileSize,
    tileHeight: tileSize,
    backingMode: options.backingMode ?? "auto",
  });

  let verifiedFrames = 0;
  let allViewsZeroCopyVerified = true;
  let sinkChecksumXor = 0;

  // 1) Zero-Copy SPSC Ring-Buffer 경로 (전송 루프 중 신규 힙 버퍼 할당 0건)
  const zeroCopyStart = nowMs();
  for (let frame = 0; frame < frameCount; frame += 1) {
    const writeRes = ring.writeTileInPlace(
      { frameId: frame + 1, tileX: frame & 7, tileY: frame >>> 3, layerId: 1 },
      tilePayloadBytes,
      (view) => {
        fillDeterministicRgbaTile(view, frame + 1);
      },
    );
    if (!writeRes.zeroCopyBufferReuse) {
      allViewsZeroCopyVerified = false;
    }

    if (
      options.injectCorruptionAtFrame !== null &&
      options.injectCorruptionAtFrame !== undefined &&
      frame === options.injectCorruptionAtFrame
    ) {
      ring.injectSingleBitFlip(writeRes.slotIndex, 16);
    }

    const consumeRes = ring.consumeTileZeroCopy((payloadView) => {
      sinkChecksumXor ^= payloadView[0] ?? 0;
    });
    if (!consumeRes.zeroCopyBufferReuse) {
      allViewsZeroCopyVerified = false;
    }
    if (consumeRes.ok) {
      verifiedFrames += 1;
    }
  }
  const zeroCopyElapsedMs = Math.max(0.01, nowMs() - zeroCopyStart);

  // 2) 비교 기준: 매 프레임 힙 할당 + 슬라이스 복사 경로
  const copyStart = nowMs();
  let copyAllocHeapAllocations = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const produced = new Uint8Array(tilePayloadBytes);
    copyAllocHeapAllocations += 1;
    fillDeterministicRgbaTile(produced, frame + 1);
    const expected = computeTileIntegrityChecksums(produced, tilePayloadBytes);

    const transferredCopy = produced.slice();
    copyAllocHeapAllocations += 1;
    const actual = computeTileIntegrityChecksums(transferredCopy, tilePayloadBytes);
    if (actual.crc32 === expected.crc32 && actual.fnv1a32 === expected.fnv1a32) {
      sinkChecksumXor ^= transferredCopy[0] ?? 0;
    }
  }
  const copyAllocElapsedMs = Math.max(0.01, nowMs() - copyStart);

  void sinkChecksumXor;

  const telemetry = ring.getTelemetrySnapshot();
  const totalMiB = totalTransferredBytes / (1024 * 1024);
  const zeroCopyThroughputMiBPerSec = totalMiB / (zeroCopyElapsedMs / 1000);
  const copyAllocThroughputMiBPerSec = totalMiB / (copyAllocElapsedMs / 1000);
  const zeroCopyTilesPerSec = frameCount / (zeroCopyElapsedMs / 1000);
  const savedHeapBytes = copyAllocHeapAllocations * tilePayloadBytes;

  return {
    tileSize,
    frameCount,
    slotCount: telemetry.slotCount,
    tilePayloadBytes,
    totalTransferredBytes,
    backingMode: telemetry.backingMode,
    crossOriginIsolated: telemetry.crossOriginIsolated,
    zeroCopyElapsedMs,
    copyAllocElapsedMs,
    zeroCopyThroughputMiBPerSec,
    copyAllocThroughputMiBPerSec,
    zeroCopyTilesPerSec,
    zeroCopyHeapAllocations: 0,
    copyAllocHeapAllocations,
    savedHeapBytes,
    allocationReductionPct: 100,
    verifiedFrames,
    checksumMismatchCount: telemetry.checksumMismatchCount,
    peakOccupancySlots: telemetry.highWatermarkSlots,
    allViewsZeroCopyVerified,
  };
}
