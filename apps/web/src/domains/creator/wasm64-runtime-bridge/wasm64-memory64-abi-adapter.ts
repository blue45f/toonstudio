/**
 * WebAssembly `memory64` (`flags & 0x04 === 0x04`, `i64` 포인터/크기 ABI) 런타임 탐지기,
 * 바이너리 Section 5(Memory) 파서 및 듀얼 주소 폭(`64-bit i64` / `32-bit i32`) FFI 어댑터.
 *
 * - `wasm64-unknown-unknown` 모듈은 Rust `usize` · `*const T` · `*mut T`가 WebAssembly `i64`(`bigint`)로
 *   컴파일되며 `u32` · `i32` · `f32`는 `number`로 유지된다.
 * - 본 어댑터는 JS 호스트 경계에서 `wasm_alloc(BigInt(byteLen))` → `bigint`,
 *   `wasm_free(BigInt(ptr), BigInt(byteLen))` 및 61개 C-ABI 커널 포인터 인자 마샬링을 수행한다.
 */

export const WASM_MEMORY64_FLAG = 0x04;

/**
 * 최소 유효 WebAssembly Memory64 검증 모듈 (`(module (memory (export "memory") i64 1 2))`, 24 B).
 * Section 5(Memory): count=1, flags=0x05 (`has_max=0x01 | memory64=0x04`), initial=1, max=2.
 */
export const WASM_MEMORY64_PROBE_BYTES: Uint8Array = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x05, 0x04, 0x01, 0x05, 0x01, 0x02,
  0x07, 0x0a, 0x01, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00,
]);

export interface WasmBinaryMemorySectionInfo {
  readonly validWasmHeader: boolean;
  readonly hasMemorySection: boolean;
  readonly memoryCount: number;
  readonly flags: number | null;
  readonly isMemory64: boolean;
  readonly hasMaximum: boolean;
  readonly isShared: boolean;
  readonly addressBits: 64 | 32;
  readonly initialPages: bigint | null;
  readonly maximumPages: bigint | null;
}

export interface DualAddressWidthWasmAdapter<TExports> {
  readonly addressBits: 64 | 32;
  readonly memory64Active: boolean;
  readonly rawExports: WebAssembly.Exports;
  readonly adaptedExports: TExports;
  readonly allocBigInt: (byteLen: number | bigint) => bigint;
  readonly freeBigInt: (ptr: bigint | number, byteLen: number | bigint) => void;
  readonly toSafeOffset: (ptr: bigint | number) => number;
  readonly callKernel: (fnName: string, ...args: readonly (number | bigint)[]) => number;
}

const ZERO_I64 = BigInt(0);
const ONE_I64 = BigInt(1);
const TWO_I64 = BigInt(2);
const SEVEN_I64 = BigInt(7);
const SEVENTY_I64 = BigInt(70);
const MAX_SAFE_I64 = BigInt(Number.MAX_SAFE_INTEGER);

let cachedNativeMemory64Supported: boolean | null = null;

interface Memory64Descriptor {
  readonly initial: bigint;
  readonly maximum?: bigint;
  readonly address: "i64";
}

/**
 * 현재 JS/WebAssembly 엔진의 네이티브 `memory64` (`i64` 선형 메모리) 실행 지원 여부를 판정한다.
 * - `validateFn` 주입 시 테스트 시뮬레이션을 위해 `WASM_MEMORY64_PROBE_BYTES` 검증 결과를 즉시 반환한다.
 * - 기본 경로는 `WebAssembly.validate(WASM_MEMORY64_PROBE_BYTES)`와
 *   `new WebAssembly.Memory({ initial: 1n, maximum: 2n, address: "i64" })` 생성을 모두 확인하고 캐시한다.
 */
export function detectWasmMemory64Support(
  validateFn?: (bytes: Uint8Array) => boolean,
): boolean {
  if (validateFn) {
    try {
      return Boolean(validateFn(WASM_MEMORY64_PROBE_BYTES));
    } catch {
      return false;
    }
  }
  if (cachedNativeMemory64Supported !== null) {
    return cachedNativeMemory64Supported;
  }
  if (typeof WebAssembly === "undefined" || typeof WebAssembly.validate !== "function") {
    cachedNativeMemory64Supported = false;
    return false;
  }
  try {
    if (!WebAssembly.validate(WASM_MEMORY64_PROBE_BYTES as BufferSource)) {
      cachedNativeMemory64Supported = false;
      return false;
    }
    if (typeof WebAssembly.Memory === "function") {
      const descriptor: Memory64Descriptor = {
        initial: ONE_I64,
        maximum: TWO_I64,
        address: "i64",
      };
      const mem = new WebAssembly.Memory(descriptor as unknown as WebAssembly.MemoryDescriptor);
      cachedNativeMemory64Supported = mem.buffer.byteLength >= 65536;
      return cachedNativeMemory64Supported;
    }
    cachedNativeMemory64Supported = true;
    return true;
  } catch {
    cachedNativeMemory64Supported = false;
    return false;
  }
}

function readU32Leb128(bytes: Uint8Array, startOffset: number): readonly [number, number] | null {
  let result = 0;
  let shift = 0;
  let offset = startOffset;
  while (offset < bytes.length && shift < 35) {
    const byte = bytes[offset] ?? 0;
    offset += 1;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return [result >>> 0, offset];
    }
    shift += 7;
  }
  return null;
}

function readU64Leb128(bytes: Uint8Array, startOffset: number): readonly [bigint, number] | null {
  let result = ZERO_I64;
  let shift = ZERO_I64;
  let offset = startOffset;
  while (offset < bytes.length && shift < SEVENTY_I64) {
    const byte = bytes[offset] ?? 0;
    offset += 1;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return [result, offset];
    }
    shift += SEVEN_I64;
  }
  return null;
}

function parseLimitsEntry(
  bytes: Uint8Array,
  entryOffset: number,
  sectionEnd: number,
): Omit<WasmBinaryMemorySectionInfo, "validWasmHeader" | "hasMemorySection" | "memoryCount"> | null {
  if (entryOffset >= sectionEnd) return null;
  const flagsRead = readU32Leb128(bytes, entryOffset);
  if (!flagsRead) return null;
  const [flags, afterFlags] = flagsRead;
  const hasMaximum = (flags & 0x01) !== 0;
  const isShared = (flags & 0x02) !== 0;
  const isMemory64 = (flags & WASM_MEMORY64_FLAG) === WASM_MEMORY64_FLAG;
  const initRead = readU64Leb128(bytes, afterFlags);
  if (!initRead) return null;
  const [initialPages, afterInit] = initRead;
  let maximumPages: bigint | null = null;
  if (hasMaximum) {
    const maxRead = readU64Leb128(bytes, afterInit);
    if (!maxRead) return null;
    maximumPages = maxRead[0];
  }
  return {
    flags,
    isMemory64,
    hasMaximum,
    isShared,
    addressBits: isMemory64 ? 64 : 32,
    initialPages,
    maximumPages,
  };
}

/**
 * 컴파일된 `.wasm` 바이트에서 Section 5(Memory, 폴백 Section 2 Import Memory)를 파싱해
 * `(flags & 0x04) === 0x04` (`memory64`) 활성화 여부를 정밀 검사한다.
 */
export function inspectWasmBinaryMemorySection(bytes: Uint8Array): WasmBinaryMemorySectionInfo {
  const validWasmHeader =
    bytes.byteLength >= 8 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x73 &&
    bytes[3] === 0x6d &&
    bytes[4] === 0x01 &&
    bytes[5] === 0x00 &&
    bytes[6] === 0x00 &&
    bytes[7] === 0x00;

  if (!validWasmHeader) {
    return Object.freeze({
      validWasmHeader: false,
      hasMemorySection: false,
      memoryCount: 0,
      flags: null,
      isMemory64: false,
      hasMaximum: false,
      isShared: false,
      addressBits: 32,
      initialPages: null,
      maximumPages: null,
    });
  }

  let offset = 8;
  while (offset < bytes.byteLength) {
    const sectionId = bytes[offset] ?? 0;
    offset += 1;
    const sizeRead = readU32Leb128(bytes, offset);
    if (!sizeRead) break;
    const [sectionSize, payloadStart] = sizeRead;
    const payloadEnd = payloadStart + sectionSize;
    if (payloadEnd > bytes.byteLength) break;

    if (sectionId === 5) {
      const countRead = readU32Leb128(bytes, payloadStart);
      if (countRead && countRead[0] >= 1) {
        const entry = parseLimitsEntry(bytes, countRead[1], payloadEnd);
        if (entry) {
          return Object.freeze({
            validWasmHeader: true,
            hasMemorySection: true,
            memoryCount: countRead[0],
            ...entry,
          });
        }
      }
    }
    offset = payloadEnd;
  }

  return Object.freeze({
    validWasmHeader: true,
    hasMemorySection: false,
    memoryCount: 0,
    flags: null,
    isMemory64: false,
    hasMaximum: false,
    isShared: false,
    addressBits: 32,
    initialPages: null,
    maximumPages: null,
  });
}

/**
 * `instantiateStreaming` 경로처럼 원본 바이트 버퍼 없이 인스턴스화된 모듈에 대해
 * 0바이트 `wasm_alloc(0n)` 호출로 `i64` 포인터 시그니처 여부를 무할당 판별한다.
 */
export function probeWasmInstanceMemory64(exportsObj: WebAssembly.Exports): boolean {
  const allocCandidate = exportsObj.wasm_alloc;
  if (typeof allocCandidate !== "function") return false;
  try {
    const res: unknown = (allocCandidate as (len: bigint) => unknown)(ZERO_I64);
    return typeof res === "bigint";
  } catch {
    return false;
  }
}

/**
 * `crates/studio-wasm64-drawing-core` 전체 61개 C-ABI 함수 중
 * `wasm64-unknown-unknown`에서 `i64`(`bigint`)로 전달해야 하는 포인터/`usize` 인자 인덱스 맵.
 */
export const WASM64_PTR_PARAM_INDICES: Readonly<Record<string, readonly number[]>> = Object.freeze({
  wasm_apply_impasto_lighting_rgba: [0, 1, 4],
  wasm_audio_biquad_eq_stereo: [0, 1, 4, 5],
  wasm_audio_mix_master_stereo: [0, 3, 4, 5, 6, 7],
  wasm_audio_resample_mono: [0, 2],
  wasm_audio_schroeder_reverb_stereo: [0, 1, 2, 3, 5],
  wasm_color_extract_palette_median_cut: [0, 4],
  wasm_color_p3_to_srgb_batch: [0, 1],
  wasm_color_rgba_to_cmyk_tac_batch: [0, 1, 3, 4],
  wasm_color_srgb_to_p3_batch: [0, 1],
  wasm_composite_tile_dirty_rect: [0, 1],
  wasm_cull_stage_frustum_hiz: [0, 1, 2, 4, 5, 6],
  wasm_evaluate_stage_acoustics_and_lighting: [0, 1, 2, 3, 7, 8],
  wasm_extract_lt_lineart_from_gbuffer: [0, 1, 2, 5],
  wasm_extract_marching_ants_segments: [0, 4],
  wasm_flood_fill_rgba: [0, 1, 9],
  wasm_fnv1a_checksum: [0],
  wasm_gaussian_blur_rgba: [0, 1, 2],
  wasm_liquify_displace_rgba: [0, 1, 5, 6],
  wasm_magic_wand_mask: [0, 1, 2, 10],
  wasm_mix_pigments_km16_strip: [0, 1],
  wasm_oklch_to_rgba_batch: [0, 1],
  wasm_packbits_rle_decode: [0, 2],
  wasm_packbits_rle_encode: [0, 2],
  wasm_parse_psd_header: [0, 2],
  wasm_raycast_mesh_sah_bvh_3d: [0, 2, 4, 6],
  wasm_render_foley_biquad_block: [0, 1, 2, 3, 6],
  wasm_render_halftone_screentone: [0, 1, 7],
  wasm_resolve_stage_sphere_overlaps: [0],
  wasm_rgba_to_cmyk_batch: [0, 1],
  wasm_rgba_to_oklch_batch: [0, 1],
  wasm_skin_vrm_mesh_4bone_soa: [0, 1, 2, 3, 4, 5, 6],
  wasm_solve_ccd_spine_ik_3d: [0, 2, 5],
  wasm_solve_finger_fabrik_chain: [0, 1, 2, 4],
  wasm_solve_two_bone_ik_3d: [0, 2],
  wasm_stamp_tactile_bristle: [0, 1, 8],
  wasm_step_verlet_spring_chains_soa: [0, 1, 2, 3, 4, 8],
  wasm_unsharp_mask_rgba: [0, 1],
  wasm_vector_expand_stroke_outline: [0, 4],
  wasm_vector_flatten_bezier_arc_len: [0, 2, 3],
  wasm_vector_hit_test_batch: [0, 2, 5],
  wasm_vector_simplify_rdp: [0, 3],
  wasm_vector_smooth_chaikin: [0, 5],
  wasm_vectorize_stroke_cubic: [0, 4, 6],
  wasm_warp_mesh_rigid_mls: [0, 2, 5],
  wasm_webtoon_dedup_tiles_fnv64: [0, 4, 5],
  wasm_webtoon_plan_smart_slices: [0, 3, 4],
  wasm_xor_tile_delta_bytes: [0, 1, 2],
});

function toI64Arg(value: number | bigint): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isFinite(value) || value <= 0) return ZERO_I64;
  return BigInt(Math.trunc(value));
}

function toSafeByteOffset(ptr: number | bigint): number {
  if (typeof ptr === "number") {
    if (!Number.isFinite(ptr) || ptr <= 0) return 0;
    return Math.trunc(ptr);
  }
  if (ptr <= ZERO_I64) return 0;
  if (ptr > MAX_SAFE_I64) {
    throw new RangeError(`Wasm64 선형 메모리 포인터가 안전 정수 상한을 초과했습니다: ${ptr.toString()}`);
  }
  return Number(ptr);
}

type WasmExportFn = (...args: readonly (number | bigint)[]) => unknown;

/**
 * `WebAssembly.Exports`를 감싸 `64-bit i64 (memory64)`와 `32-bit i32 (wasm32)` 주소 폭 차이를
 * 자동 마샬링하는 듀얼 ABI 어댑터를 생성한다.
 */
export function createDualAddressWidthWasmAdapter<TExports>(
  rawExports: WebAssembly.Exports,
  options: {
    readonly binaryBytes?: Uint8Array | null;
    readonly isMemory64Hint?: boolean;
  } = {},
): DualAddressWidthWasmAdapter<TExports> {
  const memory64Active =
    options.isMemory64Hint ??
    (options.binaryBytes
      ? inspectWasmBinaryMemorySection(options.binaryBytes).isMemory64
      : probeWasmInstanceMemory64(rawExports));
  const addressBits: 64 | 32 = memory64Active ? 64 : 32;

  const rawAlloc = rawExports.wasm_alloc as WasmExportFn | undefined;
  const rawFree = rawExports.wasm_free as WasmExportFn | undefined;

  if (!memory64Active) {
    return {
      addressBits: 32,
      memory64Active: false,
      rawExports,
      adaptedExports: rawExports as unknown as TExports,
      allocBigInt: (byteLen) => {
        if (!rawAlloc) throw new Error("wasm_alloc export가 존재하지 않습니다");
        const n = typeof byteLen === "bigint" ? Number(byteLen) : byteLen >>> 0;
        const ptr = Number(rawAlloc(n)) >>> 0;
        return BigInt(ptr);
      },
      freeBigInt: (ptr, byteLen) => {
        if (!rawFree) return;
        rawFree(toSafeByteOffset(ptr) >>> 0, toSafeByteOffset(byteLen) >>> 0);
      },
      toSafeOffset: toSafeByteOffset,
      callKernel: (fnName, ...args) => {
        const fn = rawExports[fnName] as WasmExportFn | undefined;
        if (typeof fn !== "function") throw new Error(`알 수 없는 Wasm 커널 export: ${fnName}`);
        return Number(fn(...args.map((a) => Number(a))));
      },
    };
  }

  const adaptedRecord: Record<string, unknown> = { memory: rawExports.memory };
  for (const [name, expVal] of Object.entries(rawExports)) {
    if (name === "memory" || typeof expVal !== "function") {
      adaptedRecord[name] = expVal;
      continue;
    }
    const fn = expVal as WasmExportFn;
    if (name === "wasm_alloc") {
      adaptedRecord[name] = (byteLen: number | bigint): number => {
        const res = fn(toI64Arg(byteLen));
        return toSafeByteOffset(typeof res === "bigint" ? res : Number(res) >>> 0);
      };
      continue;
    }
    if (name === "wasm_free") {
      adaptedRecord[name] = (ptr: number | bigint, byteLen: number | bigint): void => {
        fn(toI64Arg(ptr), toI64Arg(byteLen));
      };
      continue;
    }
    const ptrIndices = WASM64_PTR_PARAM_INDICES[name];
    if (!ptrIndices || ptrIndices.length === 0) {
      adaptedRecord[name] = (...args: readonly (number | bigint)[]): number =>
        Number(fn(...args.map((a) => Number(a))));
      continue;
    }
    const ptrIndexSet = new Set<number>(ptrIndices);
    adaptedRecord[name] = (...args: readonly (number | bigint)[]): number => {
      const marshaled = args.map((arg, idx) => (ptrIndexSet.has(idx) ? toI64Arg(arg) : Number(arg)));
      return Number(fn(...marshaled));
    };
  }

  return {
    addressBits,
    memory64Active: true,
    rawExports,
    adaptedExports: Object.freeze(adaptedRecord) as unknown as TExports,
    allocBigInt: (byteLen) => {
      if (!rawAlloc) throw new Error("wasm_alloc export가 존재하지 않습니다");
      const res = rawAlloc(toI64Arg(byteLen));
      return typeof res === "bigint" ? res : BigInt(Number(res) >>> 0);
    },
    freeBigInt: (ptr, byteLen) => {
      if (!rawFree) return;
      rawFree(toI64Arg(ptr), toI64Arg(byteLen));
    },
    toSafeOffset: toSafeByteOffset,
    callKernel: (fnName, ...args) => {
      const fn = adaptedRecord[fnName] as ((...a: readonly (number | bigint)[]) => number) | undefined;
      if (typeof fn !== "function") throw new Error(`알 수 없는 Wasm64 커널 export: ${fnName}`);
      return fn(...args);
    },
  };
}
