/**
 * Zero-Copy 선형 메모리 링버퍼 vs 매 프레임 페이로드 버퍼 할당·복사 경로 벤치마크.
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
  /** 초기 링 버퍼의 실제 바이트 길이. 헤더·슬롯 메타데이터·정렬 공간을 포함한다. */
  readonly ringBackingBufferBytes: number;
  /** 슬롯 수 × 타일 바이트로 계산한 페이로드 수용량. */
  readonly ringPayloadCapacityBytes: number;
  /** 비교 루프의 new Uint8Array와 slice가 만드는 페이로드 버퍼 수. */
  readonly copyAllocPayloadBufferCount: number;
  /** 비교 루프의 페이로드 버퍼 수 × 타일 바이트. 현재 힙 사용량이나 피크가 아닌 누적량. */
  readonly copyAllocPayloadBytes: number;
  /** 비교 루프의 slice 횟수 × 타일 바이트. GPU 전송량이나 전체 메모리 절감량이 아니다. */
  readonly copyAllocCopiedPayloadBytes: number;
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
 * 현재 스레드에서 두 CPU 루프의 경과시간을 측정하고 처리량을 산출한다.
 * 버퍼 개수·누적 바이트는 코드 경로 기준 계산값이며 객체·뷰·콜백 할당 및 전체 힙·GC는 측정하지 않는다.
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

  // 1) Zero-Copy SPSC Ring-Buffer 경로: 초기 페이로드 버퍼를 재사용한다.
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

  // 2) 비교 기준: 매 프레임 페이로드 버퍼 2개 생성 + 슬라이스 복사 경로
  const copyStart = nowMs();
  let copyAllocPayloadBufferCount = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const produced = new Uint8Array(tilePayloadBytes);
    copyAllocPayloadBufferCount += 1;
    fillDeterministicRgbaTile(produced, frame + 1);
    const expected = computeTileIntegrityChecksums(produced, tilePayloadBytes);

    const transferredCopy = produced.slice();
    copyAllocPayloadBufferCount += 1;
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
  const copyAllocPayloadBytes = copyAllocPayloadBufferCount * tilePayloadBytes;
  const copyAllocCopiedPayloadBytes = frameCount * tilePayloadBytes;

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
    ringBackingBufferBytes: ring.backingBuffer.byteLength,
    ringPayloadCapacityBytes: telemetry.slotCount * tilePayloadBytes,
    copyAllocPayloadBufferCount,
    copyAllocPayloadBytes,
    copyAllocCopiedPayloadBytes,
    verifiedFrames,
    checksumMismatchCount: telemetry.checksumMismatchCount,
    peakOccupancySlots: telemetry.highWatermarkSlots,
    allViewsZeroCopyVerified,
  };
}
