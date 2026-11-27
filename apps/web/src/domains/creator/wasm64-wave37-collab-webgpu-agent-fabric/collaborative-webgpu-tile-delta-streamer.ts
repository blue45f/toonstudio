/**
 * Wave 37: 실시간 공동 작업 WebGPU 64×64 RGBA8 서브타일 XOR+바이트평면 RLE 델타 코덱 및
 * 협업자 시선 중심(Foveated) 대역폭 상한·기아 방지 패킷 스케줄러.
 *
 * - 동료 피어가 확인(ACK)한 기준 타일과 현재 타일의 비트 XOR 차분을 4개 연속 바이트 평면(R·G·B·A)으로 분리해 RLE 압축한다.
 * - 압축 크기가 원본 이상이면 원본 RGBA8 타일(`raw-rgba8`)로 폴백하고, 복원 시 CRC32·FNV-1a 다이제스트를 대조한다.
 * - `maxBytesPerFrame` 안에서 시선 초점 거리 역제곱 점수와 대기 프레임 노화 부스트를 결합해 기아 없이 패킷을 배정한다.
 */

/** 공동 작업 WebGPU 서브타일 한 변 길이(`64 px`). */
export const WEBGPU_COLLAB_SUBTILE_SIZE_PX = 64 as const;
/** RGBA8 픽셀당 채널 수(`4`). */
export const WEBGPU_COLLAB_SUBTILE_CHANNEL_COUNT = 4 as const;
/** 64×64 서브타일 전체 픽셀 수(`4,096`). */
export const WEBGPU_COLLAB_SUBTILE_PIXEL_COUNT = 4_096 as const;
/** 64×64 RGBA8 서브타일 비압축 바이트 길이(`16,384 B`). */
export const WEBGPU_COLLAB_SUBTILE_BYTE_LENGTH = 16_384 as const;
/** 타일 동기화 패킷 프레임 헤더 오버헤드(`16 B`). */
export const TILE_PACKET_HEADER_BYTE_LENGTH = 16 as const;
/** 협업자 뷰포트 중심점 시선 감쇠 반경 기본값(`512 px`). */
export const DEFAULT_FOVEATED_FALLOFF_RADIUS_PX = 512 as const;
/** 전송 대기 프레임당 기본 노화 우선순위 가산폭(`0.18`). */
export const DEFAULT_AGING_BOOST_PER_FRAME = 0.18 as const;
/** 주변부 타일 기아 방지를 강제 발동하는 대기 프레임 임계치(`8 프레임`). */
export const STARVATION_GUARANTEE_AGE_FRAMES = 8 as const;
/** 기아 임계치 도달 타일에 부여하는 우선순위 보너스(`10.0`). */
export const DEFAULT_STARVATION_PRIORITY_BONUS = 10 as const;

export type TileDeltaEncodingKind = "xor-byteplane-rle" | "raw-rgba8";

export type TileDeltaRejectReason =
  | "invalid-dimensions"
  | "missing-baseline"
  | "base-digest-mismatch"
  | "corrupt-rle-stream"
  | "target-digest-mismatch";

export type DeferredTileSyncReason = "frame-budget-exhausted" | "packet-exceeds-frame-cap";

export interface TileDeltaEncodeOptions { readonly tileWidth?: number; readonly tileHeight?: number }

export interface EncodedTileDeltaPayload {
  readonly encoding: TileDeltaEncodingKind;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly rawByteLength: number;
  readonly payloadBytes: Uint8Array;
  readonly hasBaseline: boolean;
  readonly baseCrc32: number;
  readonly targetCrc32: number;
  readonly targetFnv1a32: number;
  readonly changedPixelCount: number;
  readonly compressionRatio: number;
}

export interface TileDeltaApplySuccess {
  readonly ok: true;
  readonly rgbaBytes: Uint8Array;
  readonly verifiedCrc32: number;
  readonly verifiedFnv1a32: number;
  readonly appliedEncoding: TileDeltaEncodingKind;
}

export interface TileDeltaApplyFailure {
  readonly ok: false;
  readonly reason: TileDeltaRejectReason;
  readonly messageKo: string;
  readonly expectedDigest?: number;
  readonly actualDigest?: number;
}

export type TileDeltaApplyResult = TileDeltaApplySuccess | TileDeltaApplyFailure;

export interface CollaboratorViewportFocalPoint {
  readonly peerId: string;
  readonly focusX: number;
  readonly focusY: number;
  readonly foveaRadiusPx?: number;
  readonly weight?: number;
}

export interface DirtyTileSyncCandidate {
  readonly tileId: string;
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly delta: EncodedTileDeltaPayload;
  readonly ageFrames: number;
  readonly authorStrokeActive?: boolean;
  readonly centerXOverridePx?: number;
  readonly centerYOverridePx?: number;
}

export interface FoveatedTileScheduleInput {
  readonly candidates: readonly DirtyTileSyncCandidate[];
  readonly collaboratorFocalPoints: readonly CollaboratorViewportFocalPoint[];
  readonly maxBytesPerFrame: number;
  readonly packetHeaderBytes?: number;
  readonly agingBoostPerFrame?: number;
  readonly starvationThresholdFrames?: number;
  readonly starvationPriorityBonus?: number;
  readonly skipUnchangedBaselineTiles?: boolean;
}

export interface ScheduledTileSyncPacket {
  readonly sequenceIndex: number;
  readonly tileId: string;
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly wireBytes: number;
  readonly priorityScore: number;
  readonly fovealScore: number;
  readonly agingScore: number;
  readonly starvationBoosted: boolean;
  readonly minFocalDistancePx: number;
  readonly nearestPeerId: string | null;
  readonly delta: EncodedTileDeltaPayload;
}

export interface DeferredTileSyncEntry {
  readonly tileId: string;
  readonly layerId: string;
  readonly wireBytes: number;
  readonly priorityScore: number;
  readonly nextAgeFrames: number;
  readonly reason: DeferredTileSyncReason;
}

export interface FoveatedTileScheduleResult {
  readonly scheduledPackets: readonly ScheduledTileSyncPacket[];
  readonly deferredTiles: readonly DeferredTileSyncEntry[];
  readonly skippedUnchangedTileIds: readonly string[];
  readonly totalScheduledBytes: number;
  readonly remainingBudgetBytes: number;
  readonly budgetUtilizationRatio: number;
}

const CRC32_LOOKUP_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/** 타일 바이트 버퍼의 IEEE 802.3 CRC-32 부호 없는 32비트 체크섬을 계산한다. */
export function computeTileCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.byteLength; i += 1) {
    const tableIdx = (crc ^ (bytes[i] ?? 0)) & 0xff;
    crc = (crc >>> 8) ^ (CRC32_LOOKUP_TABLE[tableIdx] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 타일 바이트 버퍼의 FNV-1a 부호 없는 32비트 해시 다이제스트를 계산한다. */
export function computeTileFnv1a32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.byteLength; i += 1) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** 평면 분리된 바이트 열을 짧은 반복(3..129B)·확장 반복(130..65535B)·리터럴(1..128B) 토큰으로 RLE 압축한다. */
export function encodeBytePlaneRle(input: Uint8Array): Uint8Array {
  const totalLen = input.byteLength;
  const out: number[] = [];
  let cursor = 0;

  while (cursor < totalLen) {
    const firstByte = input[cursor] ?? 0;
    const maxRun = Math.min(65_535, totalLen - cursor);
    let runLen = 1;
    while (runLen < maxRun && (input[cursor + runLen] ?? 0) === firstByte) runLen += 1;

    if (runLen >= 130) {
      out.push(0xff, (runLen >>> 8) & 0xff, runLen & 0xff, firstByte);
      cursor += runLen;
      continue;
    }
    if (runLen >= 3) {
      out.push(0x80 | (runLen - 3), firstByte);
      cursor += runLen;
      continue;
    }

    const litStart = cursor;
    let litEnd = cursor + 1;
    while (litEnd < totalLen && litEnd - litStart < 128) {
      const b0 = input[litEnd] ?? 0;
      if (litEnd + 2 < totalLen && b0 === (input[litEnd + 1] ?? 0) && b0 === (input[litEnd + 2] ?? 0)) {
        break;
      }
      litEnd += 1;
    }
    out.push(litEnd - litStart - 1);
    for (let k = litStart; k < litEnd; k += 1) out.push(input[k] ?? 0);
    cursor = litEnd;
  }
  return Uint8Array.from(out);
}

/** `encodeBytePlaneRle` 스트림을 `expectedLength` 크기로 복원하며 손상 시 `null`을 반환한다. */
export function decodeBytePlaneRle(encoded: Uint8Array, expectedLength: number): Uint8Array | null {
  if (!Number.isInteger(expectedLength) || expectedLength < 0) return null;
  const out = new Uint8Array(expectedLength);
  let readPos = 0;
  let writePos = 0;

  while (readPos < encoded.byteLength) {
    const ctrl = encoded[readPos] ?? 0;
    readPos += 1;
    if ((ctrl & 0x80) !== 0) {
      const low7 = ctrl & 0x7f;
      let runLen: number;
      let value: number;
      if (low7 === 127) {
        if (readPos + 3 > encoded.byteLength) return null;
        runLen = ((encoded[readPos] ?? 0) << 8) | (encoded[readPos + 1] ?? 0);
        value = encoded[readPos + 2] ?? 0;
        readPos += 3;
        if (runLen < 130) return null;
      } else {
        if (readPos + 1 > encoded.byteLength) return null;
        runLen = low7 + 3;
        value = encoded[readPos] ?? 0;
        readPos += 1;
      }
      if (writePos + runLen > expectedLength) return null;
      out.fill(value, writePos, writePos + runLen);
      writePos += runLen;
    } else {
      const litLen = (ctrl & 0x7f) + 1;
      if (readPos + litLen > encoded.byteLength || writePos + litLen > expectedLength) return null;
      out.set(encoded.subarray(readPos, readPos + litLen), writePos);
      readPos += litLen;
      writePos += litLen;
    }
  }
  return writePos === expectedLength ? out : null;
}

/** 현재 RGBA8 서브타일과 피어 확인 기준 타일 간 비트 XOR + 바이트 평면 RLE 델타를 생성한다. */
export function encodeTileXorRleDelta(
  currentRgba: Uint8Array,
  acknowledgedBaseRgba?: Uint8Array | null,
  options: TileDeltaEncodeOptions = {},
): EncodedTileDeltaPayload {
  const tileWidth = options.tileWidth ?? WEBGPU_COLLAB_SUBTILE_SIZE_PX;
  const tileHeight = options.tileHeight ?? WEBGPU_COLLAB_SUBTILE_SIZE_PX;
  if (!isPositiveInt(tileWidth) || !isPositiveInt(tileHeight)) {
    throw new RangeError("서브타일 가로·세로 크기는 양의 정수여야 합니다.");
  }

  const pixelCount = tileWidth * tileHeight;
  const expectedByteLength = pixelCount * WEBGPU_COLLAB_SUBTILE_CHANNEL_COUNT;
  if (currentRgba.byteLength !== expectedByteLength) {
    throw new RangeError(`현재 타일 버퍼 크기(${currentRgba.byteLength}B)가 규격(${expectedByteLength}B)과 다릅니다.`);
  }

  const hasBaseline = acknowledgedBaseRgba !== undefined && acknowledgedBaseRgba !== null;
  if (hasBaseline && acknowledgedBaseRgba.byteLength !== expectedByteLength) {
    throw new RangeError(`기준 타일 버퍼 크기(${acknowledgedBaseRgba.byteLength}B)가 규격(${expectedByteLength}B)과 다릅니다.`);
  }

  const baseCrc32 = hasBaseline ? computeTileCrc32(acknowledgedBaseRgba) : 0;
  const targetCrc32 = computeTileCrc32(currentRgba);
  const targetFnv1a32 = computeTileFnv1a32(currentRgba);

  const xorPlanes = new Uint8Array(expectedByteLength);
  let changedPixelCount = 0;

  for (let p = 0; p < pixelCount; p += 1) {
    const idx = p * 4;
    const xr = (currentRgba[idx] ?? 0) ^ (hasBaseline ? (acknowledgedBaseRgba[idx] ?? 0) : 0);
    const xg = (currentRgba[idx + 1] ?? 0) ^ (hasBaseline ? (acknowledgedBaseRgba[idx + 1] ?? 0) : 0);
    const xb = (currentRgba[idx + 2] ?? 0) ^ (hasBaseline ? (acknowledgedBaseRgba[idx + 2] ?? 0) : 0);
    const xa = (currentRgba[idx + 3] ?? 0) ^ (hasBaseline ? (acknowledgedBaseRgba[idx + 3] ?? 0) : 0);
    if ((xr | xg | xb | xa) !== 0) changedPixelCount += 1;
    xorPlanes[p] = xr;
    xorPlanes[pixelCount + p] = xg;
    xorPlanes[pixelCount * 2 + p] = xb;
    xorPlanes[pixelCount * 3 + p] = xa;
  }

  const rlePayload = encodeBytePlaneRle(xorPlanes);
  const useRawFallback = rlePayload.byteLength >= expectedByteLength;
  const payloadBytes = useRawFallback ? currentRgba.slice() : rlePayload;

  return {
    encoding: useRawFallback ? "raw-rgba8" : "xor-byteplane-rle",
    tileWidth,
    tileHeight,
    rawByteLength: expectedByteLength,
    payloadBytes,
    hasBaseline,
    baseCrc32,
    targetCrc32,
    targetFnv1a32,
    changedPixelCount,
    compressionRatio: payloadBytes.byteLength / expectedByteLength,
  };
}

function validateBaselineBuffer(
  acknowledgedBaseRgba: Uint8Array | null | undefined,
  expectedByteLength: number,
  expectedBaseCrc32: number,
  requirePresent: boolean,
): TileDeltaApplyFailure | null {
  if (acknowledgedBaseRgba === undefined || acknowledgedBaseRgba === null) {
    return requirePresent
      ? { ok: false, reason: "missing-baseline", messageKo: "XOR 차분 복원에 필요한 피어 기준 타일 버퍼가 없습니다." }
      : null;
  }
  if (acknowledgedBaseRgba.byteLength !== expectedByteLength) {
    return { ok: false, reason: "missing-baseline", messageKo: "기준 타일 버퍼 길이가 일치하지 않습니다." };
  }
  const actualBaseCrc = computeTileCrc32(acknowledgedBaseRgba);
  const expectedUnsigned = expectedBaseCrc32 >>> 0;
  if (actualBaseCrc !== expectedUnsigned) {
    return {
      ok: false,
      reason: "base-digest-mismatch",
      messageKo: "기준 타일 CRC32 체크섬이 송신 측 기준과 일치하지 않습니다.",
      expectedDigest: expectedUnsigned,
      actualDigest: actualBaseCrc,
    };
  }
  return null;
}

/** 수신한 타일 델타 페이로드를 기준 타일에 적용하고 CRC32·FNV-1a 다이제스트 무결성을 검증한다. */
export function applyTileXorRleDelta(
  delta: EncodedTileDeltaPayload,
  acknowledgedBaseRgba?: Uint8Array | null,
): TileDeltaApplyResult {
  if (!isPositiveInt(delta.tileWidth) || !isPositiveInt(delta.tileHeight)) {
    return { ok: false, reason: "invalid-dimensions", messageKo: "타일 가로·세로 크기가 유효한 양의 정수가 아닙니다." };
  }

  const pixelCount = delta.tileWidth * delta.tileHeight;
  const expectedByteLength = pixelCount * WEBGPU_COLLAB_SUBTILE_CHANNEL_COUNT;
  if (delta.rawByteLength !== expectedByteLength) {
    return { ok: false, reason: "invalid-dimensions", messageKo: "타일 바이트 길이가 가로·세로 규격과 일치하지 않습니다." };
  }

  let reconstructed: Uint8Array;
  if (delta.encoding === "raw-rgba8") {
    if (delta.payloadBytes.byteLength !== expectedByteLength) {
      return { ok: false, reason: "corrupt-rle-stream", messageKo: "원본 폴백 타일 페이로드 길이가 손상되었습니다." };
    }
    if (delta.hasBaseline) {
      const baseErr = validateBaselineBuffer(acknowledgedBaseRgba, expectedByteLength, delta.baseCrc32, false);
      if (baseErr) return baseErr;
    }
    reconstructed = delta.payloadBytes.slice();
  } else {
    if (delta.hasBaseline) {
      const baseErr = validateBaselineBuffer(acknowledgedBaseRgba, expectedByteLength, delta.baseCrc32, true);
      if (baseErr) return baseErr;
    }
    const xorPlanes = decodeBytePlaneRle(delta.payloadBytes, expectedByteLength);
    if (xorPlanes === null) {
      return { ok: false, reason: "corrupt-rle-stream", messageKo: "바이트 평면 RLE 스트림이 손상되어 복원할 수 없습니다." };
    }
    reconstructed = new Uint8Array(expectedByteLength);
    const hasBase = delta.hasBaseline && acknowledgedBaseRgba !== undefined && acknowledgedBaseRgba !== null;
    for (let p = 0; p < pixelCount; p += 1) {
      const idx = p * 4;
      reconstructed[idx] = (xorPlanes[p] ?? 0) ^ (hasBase ? (acknowledgedBaseRgba[idx] ?? 0) : 0);
      reconstructed[idx + 1] = (xorPlanes[pixelCount + p] ?? 0) ^ (hasBase ? (acknowledgedBaseRgba[idx + 1] ?? 0) : 0);
      reconstructed[idx + 2] = (xorPlanes[pixelCount * 2 + p] ?? 0) ^ (hasBase ? (acknowledgedBaseRgba[idx + 2] ?? 0) : 0);
      reconstructed[idx + 3] = (xorPlanes[pixelCount * 3 + p] ?? 0) ^ (hasBase ? (acknowledgedBaseRgba[idx + 3] ?? 0) : 0);
    }
  }

  const verifiedCrc32 = computeTileCrc32(reconstructed);
  if (verifiedCrc32 !== (delta.targetCrc32 >>> 0)) {
    return {
      ok: false,
      reason: "target-digest-mismatch",
      messageKo: "복원된 타일의 목표 CRC32 다이제스트가 일치하지 않습니다.",
      expectedDigest: delta.targetCrc32 >>> 0,
      actualDigest: verifiedCrc32,
    };
  }

  const verifiedFnv1a32 = computeTileFnv1a32(reconstructed);
  if (verifiedFnv1a32 !== (delta.targetFnv1a32 >>> 0)) {
    return {
      ok: false,
      reason: "target-digest-mismatch",
      messageKo: "복원된 타일의 목표 FNV-1a 다이제스트가 일치하지 않습니다.",
      expectedDigest: delta.targetFnv1a32 >>> 0,
      actualDigest: verifiedFnv1a32,
    };
  }

  return { ok: true, rgbaBytes: reconstructed, verifiedCrc32, verifiedFnv1a32, appliedEncoding: delta.encoding };
}

/** 프레임당 전송 바이트 상한 안에서 시선 초점 근접도와 대기 노화 부스트를 결합해 패킷을 스케줄링한다. */
export function scheduleFoveatedTileSyncPackets(input: FoveatedTileScheduleInput): FoveatedTileScheduleResult {
  const maxBytesPerFrame = Math.max(0, Math.floor(input.maxBytesPerFrame));
  const packetHeaderBytes = Math.max(0, Math.floor(input.packetHeaderBytes ?? TILE_PACKET_HEADER_BYTE_LENGTH));
  const agingBoostPerFrame = Math.max(0, input.agingBoostPerFrame ?? DEFAULT_AGING_BOOST_PER_FRAME);
  const starvationThreshold = Math.max(1, Math.floor(input.starvationThresholdFrames ?? STARVATION_GUARANTEE_AGE_FRAMES));
  const starvationBonus = Math.max(0, input.starvationPriorityBonus ?? DEFAULT_STARVATION_PRIORITY_BONUS);
  const skipUnchanged = input.skipUnchangedBaselineTiles ?? true;

  const skippedUnchangedTileIds: string[] = [];
  const scored: {
    readonly candidate: DirtyTileSyncCandidate;
    readonly wireBytes: number;
    readonly priorityScore: number;
    readonly fovealScore: number;
    readonly agingScore: number;
    readonly starvationBoosted: boolean;
    readonly minFocalDistancePx: number;
    readonly nearestPeerId: string | null;
    readonly safeAgeFrames: number;
  }[] = [];

  for (const candidate of input.candidates) {
    if (skipUnchanged && candidate.delta.hasBaseline && candidate.delta.changedPixelCount === 0) {
      skippedUnchangedTileIds.push(candidate.tileId);
      continue;
    }

    const tileCenterX = candidate.centerXOverridePx ?? (candidate.tileX + 0.5) * candidate.delta.tileWidth;
    const tileCenterY = candidate.centerYOverridePx ?? (candidate.tileY + 0.5) * candidate.delta.tileHeight;

    let fovealScore = 1;
    let minFocalDistancePx = 0;
    let nearestPeerId: string | null = null;

    if (input.collaboratorFocalPoints.length > 0) {
      fovealScore = 0;
      minFocalDistancePx = Number.POSITIVE_INFINITY;
      for (const fp of input.collaboratorFocalPoints) {
        const dist = Math.hypot(tileCenterX - fp.focusX, tileCenterY - fp.focusY);
        const radius = Math.max(1, fp.foveaRadiusPx ?? DEFAULT_FOVEATED_FALLOFF_RADIUS_PX);
        const weight = clamp(fp.weight ?? 1, 0.1, 4);
        const peerScore = weight / (1 + (dist / radius) ** 2);
        if (dist < minFocalDistancePx || (dist === minFocalDistancePx && (nearestPeerId === null || fp.peerId < nearestPeerId))) {
          minFocalDistancePx = dist;
          nearestPeerId = fp.peerId;
        }
        if (peerScore > fovealScore) fovealScore = peerScore;
      }
    }

    const safeAgeFrames = Math.max(0, Math.floor(candidate.ageFrames));
    const starvationBoosted = safeAgeFrames >= starvationThreshold;
    const agingScore = safeAgeFrames * agingBoostPerFrame + (starvationBoosted ? starvationBonus : 0);
    const priorityScore = fovealScore + agingScore + (candidate.authorStrokeActive === true ? 0.15 : 0);
    const wireBytes = packetHeaderBytes + candidate.delta.payloadBytes.byteLength;

    scored.push({
      candidate,
      wireBytes,
      priorityScore,
      fovealScore,
      agingScore,
      starvationBoosted,
      minFocalDistancePx,
      nearestPeerId,
      safeAgeFrames,
    });
  }

  scored.sort((a, b) => (
    b.priorityScore - a.priorityScore
    || a.minFocalDistancePx - b.minFocalDistancePx
    || b.safeAgeFrames - a.safeAgeFrames
    || a.candidate.tileId.localeCompare(b.candidate.tileId)
  ));

  const scheduledPackets: ScheduledTileSyncPacket[] = [];
  const deferredTiles: DeferredTileSyncEntry[] = [];
  let totalScheduledBytes = 0;

  for (const item of scored) {
    if (item.wireBytes > maxBytesPerFrame || totalScheduledBytes + item.wireBytes > maxBytesPerFrame) {
      deferredTiles.push({
        tileId: item.candidate.tileId,
        layerId: item.candidate.layerId,
        wireBytes: item.wireBytes,
        priorityScore: item.priorityScore,
        nextAgeFrames: item.safeAgeFrames + 1,
        reason: item.wireBytes > maxBytesPerFrame ? "packet-exceeds-frame-cap" : "frame-budget-exhausted",
      });
      continue;
    }
    scheduledPackets.push({
      sequenceIndex: scheduledPackets.length,
      tileId: item.candidate.tileId,
      layerId: item.candidate.layerId,
      tileX: item.candidate.tileX,
      tileY: item.candidate.tileY,
      wireBytes: item.wireBytes,
      priorityScore: item.priorityScore,
      fovealScore: item.fovealScore,
      agingScore: item.agingScore,
      starvationBoosted: item.starvationBoosted,
      minFocalDistancePx: item.minFocalDistancePx,
      nearestPeerId: item.nearestPeerId,
      delta: item.candidate.delta,
    });
    totalScheduledBytes += item.wireBytes;
  }

  return {
    scheduledPackets,
    deferredTiles,
    skippedUnchangedTileIds,
    totalScheduledBytes,
    remainingBudgetBytes: Math.max(0, maxBytesPerFrame - totalScheduledBytes),
    budgetUtilizationRatio: maxBytesPerFrame > 0 ? totalScheduledBytes / maxBytesPerFrame : 0,
  };
}
