/**
 * ToonStudio Wave-54 `fast-anything` Real WASM64 (`memory64`, `flags=0x04`) 로더 및 즉시 롤백 게이트.
 *
 * - `memory64` (`BigInt` `i64` 포인터) 자동 감지 및 우선 로드
 * - 미지원 환경에서는 `wasm32` (`number` `i32` 포인터) 폴백 로드
 * - `FAST_ANYTHING_DISABLE=1` 환경변수 또는 `forceJsFallback: true` 옵션으로 0ms 즉시 TS 레퍼런스 롤백
 */

import {
  meijsterEdt2dSqF32Js,
  oilBristleStampAccumulateRgbaJs,
  packBc1TileRgbaTo64BitJs,
  sdfGapCloseFloodFillU8Js,
  type OilBristleConfig,
} from "./fast-kernels-js-reference";

export const DEFAULT_WASM64_FAST_KERNELS_URL = "/wasm/studio-wasm64-fast-kernels-memory64.wasm";
export const DEFAULT_WASM32_FAST_KERNELS_URL = "/wasm/studio-wasm64-fast-kernels.wasm";

export type FastKernelsBackendKind = "wasm64" | "wasm32" | "js";

export interface WasmMemorySectionInfo {
  readonly count: number;
  readonly flags: number;
  readonly isMemory64: boolean;
  readonly hasMax: boolean;
  readonly minPages: number;
  readonly maxPages: number | null;
}

export interface LoadFastKernelsOptions {
  readonly forceJsFallback?: boolean;
  readonly forceBackend?: "auto" | FastKernelsBackendKind;
  readonly wasm64Bytes?: Uint8Array;
  readonly wasm32Bytes?: Uint8Array;
  readonly wasm64Url?: string;
  readonly wasm32Url?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface FastKernelsRuntime {
  readonly backend: FastKernelsBackendKind;
  readonly pointerWidthBits: 64 | 32 | 0;
  readonly memoryFlags: number | null;
  readonly abiVersion: number;
  readonly capabilities: number;
  readonly rollbackReason: string | null;
  readonly meijsterEdt2dSqF32: (
    obstacleMask: Uint8Array,
    width: number,
    height: number,
    outDistSq: Float32Array,
  ) => number;
  readonly sdfGapCloseFloodFillU8: (
    lineartMask: Uint8Array,
    distSq: Float32Array,
    width: number,
    height: number,
    seedX: number,
    seedY: number,
    gapCloseRadiusPx: number,
    outFill: Uint8Array,
  ) => number;
  readonly packBc1TileRgbaTo64Bit: (
    rgba: Uint8Array,
    width: number,
    height: number,
    outBc1Bytes: Uint8Array,
  ) => number;
  readonly oilBristleStampAccumulateRgba: (
    canvasRgba: Uint8Array,
    width: number,
    height: number,
    stamps: Float32Array,
    config: OilBristleConfig,
  ) => number;
  readonly getLinearMemoryBytes: () => number;
  readonly dispose: () => void;
}

type WasmPtr = number | bigint;

interface FastKernelsWasmExports {
  readonly memory: WebAssembly.Memory;
  readonly wasm_fast_kernels_abi_version: () => number;
  readonly wasm_fast_kernels_capabilities: () => number;
  readonly wasm_pointer_width_bits: () => number;
  readonly wasm_alloc: (byteLen: WasmPtr) => WasmPtr;
  readonly wasm_free: (ptr: WasmPtr, byteLen: WasmPtr) => void;
  readonly wasm_meijster_edt2d_sq_f32: (
    maskPtr: WasmPtr,
    width: number,
    height: number,
    outDistSqPtr: WasmPtr,
  ) => number;
  readonly wasm_sdf_gap_close_flood_fill_u8: (
    lineartPtr: WasmPtr,
    distSqPtr: WasmPtr,
    width: number,
    height: number,
    seedX: number,
    seedY: number,
    gapCloseRadiusPx: number,
    outFillPtr: WasmPtr,
  ) => number;
  readonly wasm_pack_bc1_tile_rgba_to_64bit: (
    rgbaPtr: WasmPtr,
    width: number,
    height: number,
    outBc1Ptr: WasmPtr,
  ) => number;
  readonly wasm_oil_bristle_stamp_accumulate_rgba: (
    canvasPtr: WasmPtr,
    width: number,
    height: number,
    stampsPtr: WasmPtr,
    stampCount: number,
    brushRgbaPacked: number,
    pickupQ8: number,
    wetnessQ8: number,
    decayQ8: number,
    hardnessQ8: number,
    bristleCount: number,
  ) => number;
}

interface ProcessEnvCarrier {
  readonly process?: {
    readonly env?: Readonly<Record<string, string | undefined>>;
  };
}

function readVarUint32(bytes: Uint8Array, offset: number): { value: number; nextOffset: number } {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < bytes.length) {
    const byte = bytes[pos];
    pos += 1;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: result >>> 0, nextOffset: pos };
    }
    shift += 7;
    if (shift > 35) throw new Error("LEB128 varuint32 오버플로");
  }
  throw new Error("LEB128 varuint32가 예기치 않게 끝났습니다");
}

const BIGINT_ZERO = BigInt(0);
const BIGINT_SEVEN = BigInt(7);
const BIGINT_SEVENTY = BigInt(70);

function readVarUint64(bytes: Uint8Array, offset: number): { value: bigint; nextOffset: number } {
  let result = BIGINT_ZERO;
  let shift = BIGINT_ZERO;
  let pos = offset;
  while (pos < bytes.length) {
    const byte = bytes[pos];
    pos += 1;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: result, nextOffset: pos };
    }
    shift += BIGINT_SEVEN;
    if (shift > BIGINT_SEVENTY) throw new Error("LEB128 varuint64 오버플로");
  }
  throw new Error("LEB128 varuint64가 예기치 않게 끝났습니다");
}

/**
 * WebAssembly 바이너리의 Section 5(Memory) 헤더를 직접 파싱해 `flags`와 `memory64` 여부를 검사한다.
 */
export function inspectWasmMemorySection(bytes: Uint8Array): WasmMemorySectionInfo {
  if (
    bytes.byteLength < 8 ||
    bytes[0] !== 0x00 ||
    bytes[1] !== 0x61 ||
    bytes[2] !== 0x73 ||
    bytes[3] !== 0x6d
  ) {
    throw new Error("유효한 WebAssembly 매직 헤더(\\0asm)가 아닙니다.");
  }

  let pos = 8;
  while (pos < bytes.byteLength) {
    const sectionId = bytes[pos];
    pos += 1;
    const { value: sectionSize, nextOffset: payloadStart } = readVarUint32(bytes, pos);
    const payloadEnd = payloadStart + sectionSize;
    if (payloadEnd > bytes.byteLength) {
      throw new Error(`잘린 WebAssembly 섹션(id=${sectionId})`);
    }
    if (sectionId === 5) {
      const { value: count, nextOffset: entryStart } = readVarUint32(bytes, payloadStart);
      if (count < 1) {
        throw new Error("Memory 섹션에 정의된 메모리가 없습니다.");
      }
      const flags = bytes[entryStart];
      const isMemory64 = (flags & 0x04) === 0x04;
      const hasMax = (flags & 0x01) === 0x01;
      const minDecoded = isMemory64
        ? readVarUint64(bytes, entryStart + 1)
        : readVarUint32(bytes, entryStart + 1);
      let maxPages: number | null = null;
      if (hasMax) {
        const maxDecoded = isMemory64
          ? readVarUint64(bytes, minDecoded.nextOffset)
          : readVarUint32(bytes, minDecoded.nextOffset);
        maxPages = Number(maxDecoded.value);
      }
      return {
        count,
        flags,
        isMemory64,
        hasMax,
        minPages: Number(minDecoded.value),
        maxPages,
      };
    }
    pos = payloadEnd;
  }

  throw new Error("WebAssembly Section 5(Memory)를 찾을 수 없습니다.");
}

/**
 * 현재 실행 런타임이 `memory64` (`flags=0x04`) WebAssembly 모듈을 지원하는지 25바이트 최소 프로브로 감지한다.
 */
export function supportsWasmMemory64(): boolean {
  try {
    const probe = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x03, 0x01, 0x04, 0x01,
    ]);
    return WebAssembly.validate(probe);
  } catch {
    return false;
  }
}

/**
 * `FAST_ANYTHING_DISABLE` 즉시 롤백 환경변수가 활성화되어 있는지 판별한다.
 */
export function isFastAnythingDisabled(
  envOverride?: Readonly<Record<string, string | undefined>>,
): boolean {
  const carrier = globalThis as unknown as ProcessEnvCarrier;
  const env = envOverride ?? carrier.process?.env;
  const raw = env?.FAST_ANYTHING_DISABLE;
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function createJsFallbackRuntime(rollbackReason: string | null): FastKernelsRuntime {
  return {
    backend: "js",
    pointerWidthBits: 0,
    memoryFlags: null,
    abiVersion: 1,
    capabilities: 0x0f,
    rollbackReason,
    meijsterEdt2dSqF32: meijsterEdt2dSqF32Js,
    sdfGapCloseFloodFillU8: sdfGapCloseFloodFillU8Js,
    packBc1TileRgbaTo64Bit: packBc1TileRgbaTo64BitJs,
    oilBristleStampAccumulateRgba: oilBristleStampAccumulateRgbaJs,
    getLinearMemoryBytes: () => 0,
    dispose: () => undefined,
  };
}

interface ScratchSlot {
  ptr: WasmPtr;
  capacity: number;
}

function createWasmRuntime(
  exportsObj: FastKernelsWasmExports,
  isMemory64: boolean,
  memoryFlags: number,
): FastKernelsRuntime {
  const toPtr = (byteLen: number): WasmPtr => (isMemory64 ? BigInt(byteLen) : byteLen);
  const ptrToOffset = (ptr: WasmPtr): number => (typeof ptr === "bigint" ? Number(ptr) : ptr);
  const isNullPtr = (ptr: WasmPtr): boolean => (typeof ptr === "bigint" ? ptr === BIGINT_ZERO : ptr === 0);

  const slots: ScratchSlot[] = [
    { ptr: isMemory64 ? BIGINT_ZERO : 0, capacity: 0 },
    { ptr: isMemory64 ? BIGINT_ZERO : 0, capacity: 0 },
    { ptr: isMemory64 ? BIGINT_ZERO : 0, capacity: 0 },
  ];

  let disposed = false;

  const ensureSlot = (slotIndex: number, minBytes: number): WasmPtr => {
    if (disposed) {
      throw new Error("해제된 FastKernelsRuntime 인스턴스는 호출할 수 없습니다.");
    }
    const required = Math.max(16, minBytes);
    const slot = slots[slotIndex];
    if (slot.capacity >= required && !isNullPtr(slot.ptr)) {
      return slot.ptr;
    }
    if (!isNullPtr(slot.ptr) && slot.capacity > 0) {
      exportsObj.wasm_free(slot.ptr, toPtr(slot.capacity));
    }
    const allocated = exportsObj.wasm_alloc(toPtr(required));
    if (isNullPtr(allocated)) {
      slot.ptr = isMemory64 ? BIGINT_ZERO : 0;
      slot.capacity = 0;
      throw new Error(`WASM 선형 메모리 할당 실패 (${required} B)`);
    }
    slot.ptr = allocated;
    slot.capacity = required;
    return allocated;
  };

  const assertFfiOk = (code: number, kernelName: string): number => {
    if (code < 0) {
      throw new Error(`WASM 커널(${kernelName}) 오류 코드 반환: ${code}`);
    }
    return code;
  };

  return {
    backend: isMemory64 ? "wasm64" : "wasm32",
    pointerWidthBits: isMemory64 ? 64 : 32,
    memoryFlags,
    abiVersion: Number(exportsObj.wasm_fast_kernels_abi_version()),
    capabilities: Number(exportsObj.wasm_fast_kernels_capabilities()),
    rollbackReason: null,

    meijsterEdt2dSqF32(obstacleMask, width, height, outDistSq) {
      const pixelCount = width * height;
      if (obstacleMask.length !== pixelCount || outDistSq.length !== pixelCount) {
        throw new RangeError("입력 마스크 또는 출력 거리장 버퍼 길이가 일치하지 않습니다.");
      }
      const maskPtr = ensureSlot(0, pixelCount);
      const outPtr = ensureSlot(1, pixelCount * 4);
      new Uint8Array(exportsObj.memory.buffer, ptrToOffset(maskPtr), pixelCount).set(obstacleMask);
      const processed = assertFfiOk(
        exportsObj.wasm_meijster_edt2d_sq_f32(maskPtr, width, height, outPtr),
        "meijster_edt2d_sq_f32",
      );
      outDistSq.set(new Float32Array(exportsObj.memory.buffer, ptrToOffset(outPtr), pixelCount));
      return processed;
    },

    sdfGapCloseFloodFillU8(
      lineartMask,
      distSq,
      width,
      height,
      seedX,
      seedY,
      gapCloseRadiusPx,
      outFill,
    ) {
      const pixelCount = width * height;
      if (
        lineartMask.length !== pixelCount ||
        distSq.length !== pixelCount ||
        outFill.length !== pixelCount
      ) {
        throw new RangeError("SDF 채색 입력/출력 버퍼 길이가 일치하지 않습니다.");
      }
      const linePtr = ensureSlot(0, pixelCount);
      const distPtr = ensureSlot(1, pixelCount * 4);
      const fillPtr = ensureSlot(2, pixelCount);
      new Uint8Array(exportsObj.memory.buffer, ptrToOffset(linePtr), pixelCount).set(lineartMask);
      new Float32Array(exportsObj.memory.buffer, ptrToOffset(distPtr), pixelCount).set(distSq);
      const filled = assertFfiOk(
        exportsObj.wasm_sdf_gap_close_flood_fill_u8(
          linePtr,
          distPtr,
          width,
          height,
          seedX,
          seedY,
          gapCloseRadiusPx,
          fillPtr,
        ),
        "sdf_gap_close_flood_fill_u8",
      );
      outFill.set(new Uint8Array(exportsObj.memory.buffer, ptrToOffset(fillPtr), pixelCount));
      return filled;
    },

    packBc1TileRgbaTo64Bit(rgba, width, height, outBc1Bytes) {
      const rgbaLen = width * height * 4;
      const bc1Len = (width / 4) * (height / 4) * 8;
      if (rgba.length !== rgbaLen || outBc1Bytes.length !== bc1Len) {
        throw new RangeError("BC1 패킹 버퍼 길이가 해상도와 일치하지 않습니다.");
      }
      const rgbaPtr = ensureSlot(0, rgbaLen);
      const outPtr = ensureSlot(1, bc1Len);
      new Uint8Array(exportsObj.memory.buffer, ptrToOffset(rgbaPtr), rgbaLen).set(rgba);
      const blocks = assertFfiOk(
        exportsObj.wasm_pack_bc1_tile_rgba_to_64bit(rgbaPtr, width, height, outPtr),
        "pack_bc1_tile_rgba_to_64bit",
      );
      outBc1Bytes.set(new Uint8Array(exportsObj.memory.buffer, ptrToOffset(outPtr), bc1Len));
      return blocks;
    },

    oilBristleStampAccumulateRgba(canvasRgba, width, height, stamps, config) {
      const canvasLen = width * height * 4;
      if (canvasRgba.length !== canvasLen || (stamps.length & 3) !== 0) {
        throw new RangeError("오일 브러시 캔버스 또는 스탬프 버퍼 길이가 올바르지 않습니다.");
      }
      const stampCount = stamps.length / 4;
      const canvasPtr = ensureSlot(0, canvasLen);
      const stampsPtr = ensureSlot(1, Math.max(16, stamps.byteLength));
      new Uint8Array(exportsObj.memory.buffer, ptrToOffset(canvasPtr), canvasLen).set(canvasRgba);
      if (stamps.length > 0) {
        new Float32Array(exportsObj.memory.buffer, ptrToOffset(stampsPtr), stamps.length).set(
          stamps,
        );
      }
      const brushPacked =
        ((config.brushR & 0xff) |
          ((config.brushG & 0xff) << 8) |
          ((config.brushB & 0xff) << 16) |
          ((config.brushA & 0xff) << 24)) >>>
        0;
      const blended = assertFfiOk(
        exportsObj.wasm_oil_bristle_stamp_accumulate_rgba(
          canvasPtr,
          width,
          height,
          stampsPtr,
          stampCount,
          brushPacked,
          config.pickupQ8 >>> 0,
          config.wetnessQ8 >>> 0,
          config.decayQ8 >>> 0,
          config.hardnessQ8 >>> 0,
          config.bristleCount >>> 0,
        ),
        "oil_bristle_stamp_accumulate_rgba",
      );
      canvasRgba.set(new Uint8Array(exportsObj.memory.buffer, ptrToOffset(canvasPtr), canvasLen));
      return blended;
    },

    getLinearMemoryBytes: () => exportsObj.memory.buffer.byteLength,

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const slot of slots) {
        if (!isNullPtr(slot.ptr) && slot.capacity > 0) {
          exportsObj.wasm_free(slot.ptr, toPtr(slot.capacity));
        }
        slot.ptr = isMemory64 ? BIGINT_ZERO : 0;
        slot.capacity = 0;
      }
    },
  };
}

async function resolveWasmBytes(
  directBytes: Uint8Array | undefined,
  url: string,
): Promise<Uint8Array> {
  if (directBytes) return directBytes;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`WASM 바이너리 로드 실패(${response.status}): ${url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function instantiateFastKernelsBinary(
  bytes: Uint8Array,
  expectMemory64: boolean,
): Promise<FastKernelsRuntime> {
  const memInfo = inspectWasmMemorySection(bytes);
  if (expectMemory64 && !memInfo.isMemory64) {
    throw new Error(`memory64 플래그(0x04) 누락: flags=0x${memInfo.flags.toString(16)}`);
  }
  if (!expectMemory64 && memInfo.isMemory64) {
    throw new Error(`wasm32 바이너리에 memory64 플래그가 설정됨: flags=0x${memInfo.flags.toString(16)}`);
  }
  const copied = new Uint8Array(bytes.byteLength);
  copied.set(bytes);
  const { instance } = await WebAssembly.instantiate(copied, {});
  const exportsObj = instance.exports as unknown as FastKernelsWasmExports;
  const pointerBits = Number(exportsObj.wasm_pointer_width_bits());
  const expectedBits = expectMemory64 ? 64 : 32;
  if (pointerBits !== expectedBits) {
    throw new Error(`포인터 비트폭 불일치: expected=${expectedBits}, actual=${pointerBits}`);
  }
  return createWasmRuntime(exportsObj, expectMemory64, memInfo.flags);
}

/**
 * `memory64` 우선 -> `wasm32` 폴백 -> `JS` 즉시 롤백 순서로 Wave-54 가속 런타임을 초기화한다.
 */
export async function loadFastKernelsRuntime(
  options: LoadFastKernelsOptions = {},
): Promise<FastKernelsRuntime> {
  if (options.forceJsFallback) {
    return createJsFallbackRuntime("forceJsFallback");
  }
  if (isFastAnythingDisabled(options.env)) {
    return createJsFallbackRuntime("FAST_ANYTHING_DISABLE");
  }
  const mode = options.forceBackend ?? "auto";
  if (mode === "js") {
    return createJsFallbackRuntime("forceBackend=js");
  }

  const wasm64Url = options.wasm64Url ?? DEFAULT_WASM64_FAST_KERNELS_URL;
  const wasm32Url = options.wasm32Url ?? DEFAULT_WASM32_FAST_KERNELS_URL;

  if (mode === "wasm64") {
    const bytes = await resolveWasmBytes(options.wasm64Bytes, wasm64Url);
    return instantiateFastKernelsBinary(bytes, true);
  }
  if (mode === "wasm32") {
    const bytes = await resolveWasmBytes(options.wasm32Bytes, wasm32Url);
    return instantiateFastKernelsBinary(bytes, false);
  }

  // auto: memory64 우선 감지 및 로드 -> wasm32 폴백 -> JS 레퍼런스 안전 폴백
  if (supportsWasmMemory64()) {
    try {
      const bytes64 = await resolveWasmBytes(options.wasm64Bytes, wasm64Url);
      return await instantiateFastKernelsBinary(bytes64, true);
    } catch {
      // wasm32 폴백 시도
    }
  }

  try {
    const bytes32 = await resolveWasmBytes(options.wasm32Bytes, wasm32Url);
    return await instantiateFastKernelsBinary(bytes32, false);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return createJsFallbackRuntime(`wasm-load-fallback:${reason}`);
  }
}
