/**
 * WebGPU · Web Worker 제로카피 GPU-CPU 인터롭 패킹 모듈.
 *
 * - 타일 뷰포트 컬링 인스턴스, 3×3 변형 행렬 유니폼, 메쉬 워프 제어점, 리퀴파이 연산 목록을
 *   사전 할당(pre-allocated) 트리플 링 `Float32Array` 스트라이드 버퍼에 GC 할당 없이 기록한다.
 * - WebGPU `queue.writeBuffer`에 `view.buffer` + `view.byteOffset` + `view.byteLength`로 직접 업로드한다.
 * - Web Worker 전송 시 단일 연속 `ArrayBuffer` 패킷과 `Transferable[]` 목록을 생성·역직렬화해
 *   구조화 복제(structured clone) 복사 비용을 0으로 만든다.
 */

export const STUDIO_ZERO_COPY_PACK_MAGIC = 0x54535a50 as const; // "TSZP"
export const STUDIO_ZERO_COPY_PACK_VERSION = 1 as const;

/** 패킷 헤더 길이(Float32 슬롯 16개 = 64바이트, WebGPU 16바이트 정렬). */
export const STUDIO_ZERO_COPY_PACKET_HEADER_FLOATS = 16 as const;
/** 변형 유니폼 블록(vec4<f32> × 6 = 24 floats = 96바이트). */
export const STUDIO_TRANSFORM_UNIFORM_FLOATS = 24 as const;
/** 뷰포트 컬링 타일 인스턴스 스트라이드(vec4<f32> × 4 = 16 floats = 64바이트). */
export const STUDIO_TILE_INSTANCE_STRIDE_FLOATS = 16 as const;
/** 메쉬 워프 제어점 스트라이드(vec4<f32> = 4 floats = 16바이트: restX, restY, currX, currY). */
export const STUDIO_MESH_CONTROL_STRIDE_FLOATS = 4 as const;
/** 리퀴파이 방사 변위 연산 스트라이드(vec4<f32> × 2 = 8 floats = 32바이트). */
export const STUDIO_LIQUIFY_OP_STRIDE_FLOATS = 8 as const;
/** 기본 트리플 버퍼링 링 슬롯 수. */
export const STUDIO_ZERO_COPY_DEFAULT_RING_SLOTS = 3 as const;

export const STUDIO_TILE_FLAG_CORE_VISIBLE = 1 as const;
export const STUDIO_TILE_FLAG_PREFETCH = 2 as const;
export const STUDIO_TILE_FLAG_DIRTY = 4 as const;
export const STUDIO_TILE_FLAG_HAS_TRANSFORM = 8 as const;

export type StudioGpuMatrix3x3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export interface StudioPackedTransformUniformInput {
  readonly srcWidth: number;
  readonly srcHeight: number;
  readonly dstWidth: number;
  readonly dstHeight: number;
  readonly inverseMatrix: StudioGpuMatrix3x3;
  readonly transformModeCode: number;
  readonly resamplerModeCode: number;
  readonly filterScaleX: number;
  readonly filterScaleY: number;
  readonly meshRows?: number;
  readonly meshCols?: number;
  readonly liquifyOpCount?: number;
  readonly flags?: number;
}

export interface StudioPackedMeshControlPoint {
  readonly restX: number;
  readonly restY: number;
  readonly x: number;
  readonly y: number;
}

export interface StudioPackedLiquifyOp {
  readonly centerX: number;
  readonly centerY: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly radius: number;
  readonly strength: number;
  readonly modeCode: number;
  readonly hardness: number;
}

export interface StudioPackedTileInstance {
  readonly worldX: number;
  readonly worldY: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly uvMinX: number;
  readonly uvMinY: number;
  readonly uvMaxX: number;
  readonly uvMaxY: number;
  readonly dirtySubX: number;
  readonly dirtySubY: number;
  readonly dirtySubWidth: number;
  readonly dirtySubHeight: number;
  readonly mipLevel: number;
  readonly column: number;
  readonly row: number;
  readonly flags: number;
}

export interface StudioZeroCopyBufferView {
  readonly data: Float32Array;
  readonly slotIndex: number;
  readonly itemCount: number;
  readonly floatCount: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  /** 기존 사전 할당 링 슬롯을 재사용해 신규 TypedArray 힙 할당이 0건이었는지 여부. */
  readonly reusedAllocation: boolean;
}

export interface StudioZeroCopyWorkerPacket {
  readonly kind: "studio-webgpu-zero-copy-packet";
  readonly magic: typeof STUDIO_ZERO_COPY_PACK_MAGIC;
  readonly version: typeof STUDIO_ZERO_COPY_PACK_VERSION;
  readonly buffer: ArrayBuffer;
  readonly byteLength: number;
}

export interface StudioZeroCopyTransferResult {
  readonly packet: StudioZeroCopyWorkerPacket;
  readonly transfer: Transferable[];
}

export interface StudioZeroCopyWorkerPayloadInput {
  readonly frameSequence: number;
  readonly mipLevel: number;
  readonly uniforms?: StudioPackedTransformUniformInput | null;
  readonly tileInstances?: readonly StudioPackedTileInstance[];
  readonly packedTileInstances?: Float32Array;
  readonly packedTileInstanceCount?: number;
  readonly meshControlPoints?: readonly StudioPackedMeshControlPoint[];
  readonly liquifyOps?: readonly StudioPackedLiquifyOp[];
}

export interface StudioUnpackedZeroCopyWorkerPacket {
  readonly frameSequence: number;
  readonly mipLevel: number;
  readonly hasUniforms: boolean;
  readonly tileInstanceCount: number;
  readonly meshControlPointCount: number;
  readonly liquifyOpCount: number;
  /** 모두 입력 `packet.buffer`를 직접 참조하는 제로카피 서브어레이 뷰. */
  readonly uniforms: Float32Array;
  readonly tileInstances: Float32Array;
  readonly meshControlPoints: Float32Array;
  readonly liquifyOps: Float32Array;
}

export interface StudioGpuBufferWriteQueue {
  writeBuffer(
    buffer: GPUBuffer,
    bufferOffset: number,
    data: BufferSource | SharedArrayBuffer,
    dataOffset?: number,
    size?: number,
  ): void;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function assertCapacity(target: Float32Array, offset: number, requiredFloats: number, label: string): void {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError(`${label} 오프셋이 유효하지 않습니다: ${offset}`);
  }
  if (offset + requiredFloats > target.length) {
    throw new RangeError(
      `${label} 버퍼 용량이 부족합니다 (필요: ${offset + requiredFloats}, 실제: ${target.length})`,
    );
  }
}

/**
 * 3×3 역변환 행렬과 리샘플러·워프 메타데이터를 WGSL `TransformUniforms` 16바이트 정렬 레이아웃으로 기록한다.
 */
export function packTransformUniformsInto(
  target: Float32Array,
  offset: number,
  input: StudioPackedTransformUniformInput,
): number {
  assertCapacity(target, offset, STUDIO_TRANSFORM_UNIFORM_FLOATS, "TransformUniforms");
  const m = input.inverseMatrix;

  // vec4 dims: [srcWidth, srcHeight, dstWidth, dstHeight]
  target[offset] = Math.max(1, finiteOr(input.srcWidth, 1));
  target[offset + 1] = Math.max(1, finiteOr(input.srcHeight, 1));
  target[offset + 2] = Math.max(1, finiteOr(input.dstWidth, 1));
  target[offset + 3] = Math.max(1, finiteOr(input.dstHeight, 1));

  // vec4 inv_row0..2: 3x3 inverse homography (row-major, w=0 padding)
  target[offset + 4] = finiteOr(m[0], 1);
  target[offset + 5] = finiteOr(m[1], 0);
  target[offset + 6] = finiteOr(m[2], 0);
  target[offset + 7] = 0;

  target[offset + 8] = finiteOr(m[3], 0);
  target[offset + 9] = finiteOr(m[4], 1);
  target[offset + 10] = finiteOr(m[5], 0);
  target[offset + 11] = 0;

  target[offset + 12] = finiteOr(m[6], 0);
  target[offset + 13] = finiteOr(m[7], 0);
  target[offset + 14] = finiteOr(m[8], 1);
  target[offset + 15] = 0;

  // vec4 mode_filter: [transformMode, resamplerMode, filterScaleX, filterScaleY]
  target[offset + 16] = finiteOr(input.transformModeCode, 0);
  target[offset + 17] = finiteOr(input.resamplerModeCode, 0);
  target[offset + 18] = Math.max(1, finiteOr(input.filterScaleX, 1));
  target[offset + 19] = Math.max(1, finiteOr(input.filterScaleY, 1));

  // vec4 extra: [meshRows, meshCols, liquifyOpCount, flags]
  target[offset + 20] = Math.max(0, Math.trunc(finiteOr(input.meshRows, 0)));
  target[offset + 21] = Math.max(0, Math.trunc(finiteOr(input.meshCols, 0)));
  target[offset + 22] = Math.max(0, Math.trunc(finiteOr(input.liquifyOpCount, 0)));
  target[offset + 23] = Math.trunc(finiteOr(input.flags, 0));

  return offset + STUDIO_TRANSFORM_UNIFORM_FLOATS;
}

/** 메쉬 제어점 배열을 단일 스트라이드 `Float32Array`에 제로-알로케이션으로 기록한다. */
export function packMeshControlPointsInto(
  target: Float32Array,
  offset: number,
  points: readonly StudioPackedMeshControlPoint[],
): number {
  const required = points.length * STUDIO_MESH_CONTROL_STRIDE_FLOATS;
  assertCapacity(target, offset, required, "MeshControlPoints");
  let cursor = offset;
  for (let index = 0; index < points.length; index += 1) {
    const pt = points[index]!;
    target[cursor] = finiteOr(pt.restX, 0);
    target[cursor + 1] = finiteOr(pt.restY, 0);
    target[cursor + 2] = finiteOr(pt.x, 0);
    target[cursor + 3] = finiteOr(pt.y, 0);
    cursor += STUDIO_MESH_CONTROL_STRIDE_FLOATS;
  }
  return cursor;
}

/** 리퀴파이 방사 변위 연산 목록을 단일 스트라이드 `Float32Array`에 기록한다. */
export function packLiquifyOpsInto(
  target: Float32Array,
  offset: number,
  ops: readonly StudioPackedLiquifyOp[],
): number {
  const required = ops.length * STUDIO_LIQUIFY_OP_STRIDE_FLOATS;
  assertCapacity(target, offset, required, "LiquifyOps");
  let cursor = offset;
  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index]!;
    target[cursor] = finiteOr(op.centerX, 0);
    target[cursor + 1] = finiteOr(op.centerY, 0);
    target[cursor + 2] = finiteOr(op.deltaX, 0);
    target[cursor + 3] = finiteOr(op.deltaY, 0);
    target[cursor + 4] = Math.max(0, finiteOr(op.radius, 0));
    target[cursor + 5] = finiteOr(op.strength, 0);
    target[cursor + 6] = Math.trunc(finiteOr(op.modeCode, 0));
    target[cursor + 7] = Math.min(1, Math.max(0, finiteOr(op.hardness, 0.5)));
    cursor += STUDIO_LIQUIFY_OP_STRIDE_FLOATS;
  }
  return cursor;
}

/** 단일 컬링 타일 인스턴스(64바이트)를 `Float32Array`에 기록한다. */
export function packTileInstanceInto(
  target: Float32Array,
  offset: number,
  tile: StudioPackedTileInstance,
): number {
  assertCapacity(target, offset, STUDIO_TILE_INSTANCE_STRIDE_FLOATS, "TileInstance");
  target[offset] = finiteOr(tile.worldX, 0);
  target[offset + 1] = finiteOr(tile.worldY, 0);
  target[offset + 2] = Math.max(0, finiteOr(tile.worldWidth, 0));
  target[offset + 3] = Math.max(0, finiteOr(tile.worldHeight, 0));

  target[offset + 4] = finiteOr(tile.uvMinX, 0);
  target[offset + 5] = finiteOr(tile.uvMinY, 0);
  target[offset + 6] = finiteOr(tile.uvMaxX, 1);
  target[offset + 7] = finiteOr(tile.uvMaxY, 1);

  target[offset + 8] = finiteOr(tile.dirtySubX, 0);
  target[offset + 9] = finiteOr(tile.dirtySubY, 0);
  target[offset + 10] = Math.max(0, finiteOr(tile.dirtySubWidth, 0));
  target[offset + 11] = Math.max(0, finiteOr(tile.dirtySubHeight, 0));

  target[offset + 12] = Math.max(0, Math.trunc(finiteOr(tile.mipLevel, 0)));
  target[offset + 13] = Math.trunc(finiteOr(tile.column, 0));
  target[offset + 14] = Math.trunc(finiteOr(tile.row, 0));
  target[offset + 15] = Math.trunc(finiteOr(tile.flags, 0));

  return offset + STUDIO_TILE_INSTANCE_STRIDE_FLOATS;
}

/**
 * WebGPU `queue.writeBuffer`에 중간 복사 없이 `Float32Array` 뷰를 직접 업로드한다.
 */
export function uploadFloat32ViewToGpuBuffer(
  queue: StudioGpuBufferWriteQueue,
  gpuBuffer: GPUBuffer,
  view: Pick<StudioZeroCopyBufferView, "data" | "byteOffset" | "byteLength">,
  dstOffset = 0,
): number {
  if (!Number.isSafeInteger(dstOffset) || dstOffset < 0 || (dstOffset & 3) !== 0) {
    throw new RangeError(`GPU 버퍼 목적지 오프셋은 4바이트 정렬 정수여야 합니다: ${dstOffset}`);
  }
  if (view.byteLength <= 0) return 0;
  if ((view.byteLength & 3) !== 0) {
    throw new RangeError(`업로드 크기는 4바이트 배수여야 합니다: ${view.byteLength}`);
  }
  queue.writeBuffer(gpuBuffer, dstOffset, view.data.buffer, view.byteOffset, view.byteLength);
  return view.byteLength;
}

export interface StudioZeroCopyRingPackerOptions {
  readonly ringSlots?: number;
  readonly initialTileCapacity?: number;
  readonly initialMeshNodeCapacity?: number;
  readonly initialLiquifyOpCapacity?: number;
}

/**
 * 프레임 루프에서 GC 할당을 피하기 위한 사전 할당 트리플 링 `Float32Array` 패커.
 */
export class StudioZeroCopyRingPacker {
  private readonly ringSlots: number;
  private readonly tileRing: Float32Array[];
  private readonly uniformRing: Float32Array[];
  private readonly meshRing: Float32Array[];
  private readonly liquifyRing: Float32Array[];
  private tileCursor = 0;
  private uniformCursor = 0;
  private meshCursor = 0;
  private liquifyCursor = 0;
  private allocationCount = 0;

  public constructor(options: StudioZeroCopyRingPackerOptions = {}) {
    const requestedSlots = options.ringSlots ?? STUDIO_ZERO_COPY_DEFAULT_RING_SLOTS;
    this.ringSlots = Number.isSafeInteger(requestedSlots) && requestedSlots >= 1
      ? Math.min(8, requestedSlots)
      : STUDIO_ZERO_COPY_DEFAULT_RING_SLOTS;

    const tileCap = Math.max(16, Math.trunc(finiteOr(options.initialTileCapacity, 256)));
    const meshCap = Math.max(16, Math.trunc(finiteOr(options.initialMeshNodeCapacity, 64)));
    const liquifyCap = Math.max(8, Math.trunc(finiteOr(options.initialLiquifyOpCapacity, 64)));

    this.tileRing = Array.from(
      { length: this.ringSlots },
      () => new Float32Array(tileCap * STUDIO_TILE_INSTANCE_STRIDE_FLOATS),
    );
    this.uniformRing = Array.from(
      { length: this.ringSlots },
      () => new Float32Array(STUDIO_TRANSFORM_UNIFORM_FLOATS),
    );
    this.meshRing = Array.from(
      { length: this.ringSlots },
      () => new Float32Array(meshCap * STUDIO_MESH_CONTROL_STRIDE_FLOATS),
    );
    this.liquifyRing = Array.from(
      { length: this.ringSlots },
      () => new Float32Array(liquifyCap * STUDIO_LIQUIFY_OP_STRIDE_FLOATS),
    );
  }

  public getStats(): {
    readonly ringSlots: number;
    readonly reallocationCount: number;
    readonly tileSlotFloats: number;
    readonly meshSlotFloats: number;
    readonly liquifySlotFloats: number;
  } {
    return {
      ringSlots: this.ringSlots,
      reallocationCount: this.allocationCount,
      tileSlotFloats: this.tileRing[0]?.length ?? 0,
      meshSlotFloats: this.meshRing[0]?.length ?? 0,
      liquifySlotFloats: this.liquifyRing[0]?.length ?? 0,
    };
  }

  private acquireSlot(
    ring: Float32Array[],
    slotIndex: number,
    requiredFloats: number,
  ): { readonly backing: Float32Array; readonly reusedAllocation: boolean } {
    const existing = ring[slotIndex]!;
    if (existing.length >= requiredFloats) {
      return { backing: existing, reusedAllocation: true };
    }
    const nextLength = Math.max(requiredFloats, existing.length * 2);
    const grown = new Float32Array(nextLength);
    ring[slotIndex] = grown;
    this.allocationCount += 1;
    return { backing: grown, reusedAllocation: false };
  }

  public packTileInstances(tiles: readonly StudioPackedTileInstance[]): StudioZeroCopyBufferView {
    const slotIndex = this.tileCursor;
    this.tileCursor = (this.tileCursor + 1) % this.ringSlots;
    const floatCount = tiles.length * STUDIO_TILE_INSTANCE_STRIDE_FLOATS;
    const { backing, reusedAllocation } = this.acquireSlot(this.tileRing, slotIndex, floatCount);
    let offset = 0;
    for (let index = 0; index < tiles.length; index += 1) {
      offset = packTileInstanceInto(backing, offset, tiles[index]!);
    }
    const data = backing.subarray(0, floatCount);
    return {
      data,
      slotIndex,
      itemCount: tiles.length,
      floatCount,
      byteOffset: data.byteOffset,
      byteLength: data.byteLength,
      reusedAllocation,
    };
  }

  public packTransformUniforms(input: StudioPackedTransformUniformInput): StudioZeroCopyBufferView {
    const slotIndex = this.uniformCursor;
    this.uniformCursor = (this.uniformCursor + 1) % this.ringSlots;
    const backing = this.uniformRing[slotIndex]!;
    packTransformUniformsInto(backing, 0, input);
    const data = backing.subarray(0, STUDIO_TRANSFORM_UNIFORM_FLOATS);
    return {
      data,
      slotIndex,
      itemCount: 1,
      floatCount: STUDIO_TRANSFORM_UNIFORM_FLOATS,
      byteOffset: data.byteOffset,
      byteLength: data.byteLength,
      reusedAllocation: true,
    };
  }

  public packMeshControlPoints(
    points: readonly StudioPackedMeshControlPoint[],
  ): StudioZeroCopyBufferView {
    const slotIndex = this.meshCursor;
    this.meshCursor = (this.meshCursor + 1) % this.ringSlots;
    const floatCount = points.length * STUDIO_MESH_CONTROL_STRIDE_FLOATS;
    const { backing, reusedAllocation } = this.acquireSlot(this.meshRing, slotIndex, floatCount);
    packMeshControlPointsInto(backing, 0, points);
    const data = backing.subarray(0, floatCount);
    return {
      data,
      slotIndex,
      itemCount: points.length,
      floatCount,
      byteOffset: data.byteOffset,
      byteLength: data.byteLength,
      reusedAllocation,
    };
  }

  public packLiquifyOps(ops: readonly StudioPackedLiquifyOp[]): StudioZeroCopyBufferView {
    const slotIndex = this.liquifyCursor;
    this.liquifyCursor = (this.liquifyCursor + 1) % this.ringSlots;
    const floatCount = ops.length * STUDIO_LIQUIFY_OP_STRIDE_FLOATS;
    const { backing, reusedAllocation } = this.acquireSlot(this.liquifyRing, slotIndex, floatCount);
    packLiquifyOpsInto(backing, 0, ops);
    const data = backing.subarray(0, floatCount);
    return {
      data,
      slotIndex,
      itemCount: ops.length,
      floatCount,
      byteOffset: data.byteOffset,
      byteLength: data.byteLength,
      reusedAllocation,
    };
  }
}

/**
 * Web Worker `postMessage(packet, transfer)`용 단일 연속 `ArrayBuffer` 제로카피 패킷을 생성한다.
 *
 * 헤더(Uint32 × 16 = 64B) 뒤에 변형 유니폼 · 타일 인스턴스 · 메쉬 제어점 · 리퀴파이 연산이
 * 16바이트 정렬로 연속 배치되며, `transfer`에는 소유권 이동 대상 `ArrayBuffer` 1개만 담긴다.
 */
export function createZeroCopyWorkerPacket(
  payload: StudioZeroCopyWorkerPayloadInput,
): StudioZeroCopyTransferResult {
  const hasUniforms = payload.uniforms !== undefined && payload.uniforms !== null;
  const uniformFloats = hasUniforms ? STUDIO_TRANSFORM_UNIFORM_FLOATS : 0;

  const tileCount = payload.packedTileInstances
    ? Math.min(
      Math.max(0, Math.trunc(finiteOr(payload.packedTileInstanceCount, 0))),
      Math.floor(payload.packedTileInstances.length / STUDIO_TILE_INSTANCE_STRIDE_FLOATS),
    )
    : (payload.tileInstances?.length ?? 0);
  const tileFloats = tileCount * STUDIO_TILE_INSTANCE_STRIDE_FLOATS;

  const meshPoints = payload.meshControlPoints ?? [];
  const meshFloats = meshPoints.length * STUDIO_MESH_CONTROL_STRIDE_FLOATS;

  const liquifyOps = payload.liquifyOps ?? [];
  const liquifyFloats = liquifyOps.length * STUDIO_LIQUIFY_OP_STRIDE_FLOATS;

  const uniformOffset = STUDIO_ZERO_COPY_PACKET_HEADER_FLOATS;
  const tileOffset = uniformOffset + uniformFloats;
  const meshOffset = tileOffset + tileFloats;
  const liquifyOffset = meshOffset + meshFloats;
  const totalFloats = liquifyOffset + liquifyFloats;
  const totalBytes = totalFloats * Float32Array.BYTES_PER_ELEMENT;

  const buffer = new ArrayBuffer(totalBytes);
  const header = new Uint32Array(buffer, 0, STUDIO_ZERO_COPY_PACKET_HEADER_FLOATS);
  const floats = new Float32Array(buffer);

  header[0] = STUDIO_ZERO_COPY_PACK_MAGIC;
  header[1] = STUDIO_ZERO_COPY_PACK_VERSION;
  header[2] = Math.max(0, Math.trunc(finiteOr(payload.frameSequence, 0))) >>> 0;
  header[3] = Math.max(0, Math.trunc(finiteOr(payload.mipLevel, 0))) >>> 0;
  header[4] = hasUniforms ? 1 : 0;
  header[5] = tileCount >>> 0;
  header[6] = meshPoints.length >>> 0;
  header[7] = liquifyOps.length >>> 0;
  header[8] = uniformOffset >>> 0;
  header[9] = tileOffset >>> 0;
  header[10] = meshOffset >>> 0;
  header[11] = liquifyOffset >>> 0;
  header[12] = totalFloats >>> 0;
  header[13] = 0;
  header[14] = 0;
  header[15] = 0;

  if (hasUniforms && payload.uniforms) {
    packTransformUniformsInto(floats, uniformOffset, payload.uniforms);
  }
  if (tileFloats > 0) {
    if (payload.packedTileInstances) {
      floats.set(payload.packedTileInstances.subarray(0, tileFloats), tileOffset);
    } else if (payload.tileInstances) {
      let cursor = tileOffset;
      for (let index = 0; index < tileCount; index += 1) {
        cursor = packTileInstanceInto(floats, cursor, payload.tileInstances[index]!);
      }
    }
  }
  if (meshPoints.length > 0) {
    packMeshControlPointsInto(floats, meshOffset, meshPoints);
  }
  if (liquifyOps.length > 0) {
    packLiquifyOpsInto(floats, liquifyOffset, liquifyOps);
  }

  const packet: StudioZeroCopyWorkerPacket = {
    kind: "studio-webgpu-zero-copy-packet",
    magic: STUDIO_ZERO_COPY_PACK_MAGIC,
    version: STUDIO_ZERO_COPY_PACK_VERSION,
    buffer,
    byteLength: totalBytes,
  };
  return { packet, transfer: [buffer] };
}

/**
 * 수신한 `StudioZeroCopyWorkerPacket`을 복사 없이 `Float32Array` 서브어레이 뷰로 해석한다.
 */
export function unpackZeroCopyWorkerPacket(
  packet: StudioZeroCopyWorkerPacket,
): StudioUnpackedZeroCopyWorkerPacket {
  if (
    !packet
    || packet.kind !== "studio-webgpu-zero-copy-packet"
    || !(packet.buffer instanceof ArrayBuffer)
  ) {
    throw new TypeError("유효하지 않은 제로카피 워커 패킷 형식입니다.");
  }
  const minHeaderBytes = STUDIO_ZERO_COPY_PACKET_HEADER_FLOATS * Uint32Array.BYTES_PER_ELEMENT;
  if (packet.buffer.byteLength < minHeaderBytes || (packet.buffer.byteLength & 3) !== 0) {
    throw new RangeError("제로카피 워커 패킷 버퍼 크기가 손상되었거나 분리(detached)되었습니다.");
  }

  const header = new Uint32Array(packet.buffer, 0, STUDIO_ZERO_COPY_PACKET_HEADER_FLOATS);
  if (header[0] !== STUDIO_ZERO_COPY_PACK_MAGIC || header[1] !== STUDIO_ZERO_COPY_PACK_VERSION) {
    throw new RangeError("제로카피 워커 패킷 매직 또는 버전이 일치하지 않습니다.");
  }

  const frameSequence = header[2]!;
  const mipLevel = header[3]!;
  const hasUniforms = header[4] === 1;
  const tileInstanceCount = header[5]!;
  const meshControlPointCount = header[6]!;
  const liquifyOpCount = header[7]!;
  const uniformOffset = header[8]!;
  const tileOffset = header[9]!;
  const meshOffset = header[10]!;
  const liquifyOffset = header[11]!;
  const totalFloats = header[12]!;

  const uniformFloats = hasUniforms ? STUDIO_TRANSFORM_UNIFORM_FLOATS : 0;
  const tileFloats = tileInstanceCount * STUDIO_TILE_INSTANCE_STRIDE_FLOATS;
  const meshFloats = meshControlPointCount * STUDIO_MESH_CONTROL_STRIDE_FLOATS;
  const liquifyFloats = liquifyOpCount * STUDIO_LIQUIFY_OP_STRIDE_FLOATS;
  const expectedTotalFloats = STUDIO_ZERO_COPY_PACKET_HEADER_FLOATS
    + uniformFloats
    + tileFloats
    + meshFloats
    + liquifyFloats;

  if (
    totalFloats !== expectedTotalFloats
    || uniformOffset !== STUDIO_ZERO_COPY_PACKET_HEADER_FLOATS
    || tileOffset !== uniformOffset + uniformFloats
    || meshOffset !== tileOffset + tileFloats
    || liquifyOffset !== meshOffset + meshFloats
    || packet.buffer.byteLength < totalFloats * Float32Array.BYTES_PER_ELEMENT
  ) {
    throw new RangeError("제로카피 워커 패킷 섹션 오프셋과 버퍼 길이가 일치하지 않습니다.");
  }

  const fullView = new Float32Array(packet.buffer, 0, totalFloats);
  return {
    frameSequence,
    mipLevel,
    hasUniforms,
    tileInstanceCount,
    meshControlPointCount,
    liquifyOpCount,
    uniforms: fullView.subarray(uniformOffset, uniformOffset + uniformFloats),
    tileInstances: fullView.subarray(tileOffset, tileOffset + tileFloats),
    meshControlPoints: fullView.subarray(meshOffset, meshOffset + meshFloats),
    liquifyOps: fullView.subarray(liquifyOffset, liquifyOffset + liquifyFloats),
  };
}
