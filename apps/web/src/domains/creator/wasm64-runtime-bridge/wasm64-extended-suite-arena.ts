/**
 * `studio-wasm64-extended-suite.wasm` 저수준 C-ABI 시그니처 검증 및
 * 0-누수 `wasm_alloc` / `try...finally wasm_free` 아레나 관리자.
 */

import type { WasmDirtyRect } from "./wasm64-hotpath-types";
import type {
  FoleyFilterModeName,
  HalftonePatternCode,
  HalftonePatternName,
  LiquifyModeCode,
  LiquifyModeName,
  PsdColorModeName,
  RgbaColorInput,
  StageDepthRangeName,
  WasmExtendedArenaStats,
} from "./wasm64-extended-suite-types";

export interface RawExtendedSuiteExports {
  readonly memory: WebAssembly.Memory;
  readonly wasm_drawing_core_abi_version: () => number;
  readonly wasm_hotpath_capabilities: () => number;
  readonly wasm_extended_3d_capabilities: () => number;
  readonly wasm_atelier_stage_3d_capabilities: () => number;
  readonly wasm_extended_capabilities: () => number;
  readonly wasm_alloc: (byteLen: number) => number;
  readonly wasm_free: (ptr: number, byteLen: number) => void;
  readonly wasm_flood_fill_rgba: (
    rgbaPtr: number,
    boundaryMaskPtr: number,
    width: number,
    height: number,
    seedX: number,
    seedY: number,
    fillRgbaPacked: number,
    tolerance: number,
    gapClosingRadius: number,
    outDirtyRectPtr: number,
  ) => number;
  readonly wasm_magic_wand_mask: (
    rgbaPtr: number,
    boundaryMaskPtr: number,
    outMaskPtr: number,
    width: number,
    height: number,
    seedX: number,
    seedY: number,
    tolerance: number,
    gapClosingRadius: number,
    antiAlias: number,
    outDirtyRectPtr: number,
  ) => number;
  readonly wasm_extract_marching_ants_segments: (
    maskPtr: number,
    width: number,
    height: number,
    threshold: number,
    outSegmentsPtr: number,
    maxSegments: number,
  ) => number;
  readonly wasm_rgba_to_oklch_batch: (
    rgbaPtr: number,
    outOklchPtr: number,
    pixelCount: number,
  ) => number;
  readonly wasm_oklch_to_rgba_batch: (
    oklchPtr: number,
    outRgbaPtr: number,
    pixelCount: number,
  ) => number;
  readonly wasm_rgba_to_cmyk_batch: (
    rgbaPtr: number,
    outCmykPtr: number,
    pixelCount: number,
    gcrFactor: number,
  ) => number;
  readonly wasm_render_halftone_screentone: (
    srcRgbaPtr: number,
    outRgbaPtr: number,
    width: number,
    height: number,
    pattern: number,
    inkRgbaPacked: number,
    paperRgbaPacked: number,
    paramsPtr: number,
  ) => number;
  readonly wasm_liquify_displace_rgba: (
    srcRgbaPtr: number,
    dstRgbaPtr: number,
    width: number,
    height: number,
    mode: number,
    paramsPtr: number,
    outDirtyRectPtr: number,
  ) => number;
  readonly wasm_warp_mesh_rigid_mls: (
    verticesXyPtr: number,
    vertexCount: number,
    pinsPtr: number,
    pinCount: number,
    alpha: number,
    outVerticesXyPtr: number,
  ) => number;
  readonly wasm_vectorize_stroke_cubic: (
    pointsXypPtr: number,
    pointCount: number,
    rdpEpsilon: number,
    bezierErrorTolerance: number,
    outSegmentsPtr: number,
    maxSegments: number,
    outStatsPtr: number,
  ) => number;
  readonly wasm_parse_psd_header: (
    bytesPtr: number,
    byteLen: number,
    outMetaU64Ptr: number,
  ) => number;
  readonly wasm_encode_morton_2d_u32: (x: number, y: number) => number;
  readonly wasm_encode_morton_3d_u32: (x: number, y: number, z: number) => number;
  readonly wasm_skin_vrm_mesh_4bone_soa: (
    inPosXyzPtr: number,
    inNormXyzPtr: number,
    jointsPtr: number,
    weightsPtr: number,
    boneMatricesPtr: number,
    outPosXyzPtr: number,
    outNormXyzPtr: number,
    vertexCount: number,
    boneCount: number,
  ) => number;
  readonly wasm_extract_lt_lineart_from_gbuffer: (
    normalXyzPtr: number,
    depthPtr: number,
    outAlphaPtr: number,
    width: number,
    height: number,
    paramsPtr: number,
  ) => number;
  readonly wasm_cull_stage_frustum_hiz: (
    viewProjPtr: number,
    cameraAndLodPtr: number,
    aabbsPtr: number,
    objectCount: number,
    outVisibleIndicesPtr: number,
    outVisibleLodsPtr: number,
    outStatsPtr: number,
  ) => number;
  readonly wasm_resolve_stage_sphere_overlaps: (
    spheresPtr: number,
    sphereCount: number,
    cellSize: number,
    iterations: number,
    relaxation: number,
  ) => number;
  readonly wasm_evaluate_stage_acoustics_and_lighting: (
    listenerPtr: number,
    sourcesPtr: number,
    lightsPtr: number,
    samplesPtr: number,
    sourceCount: number,
    lightCount: number,
    sampleCount: number,
    outAudioPtr: number,
    outLightingPtr: number,
  ) => number;
  readonly wasm_step_verlet_spring_chains_soa: (
    posXyzPtr: number,
    prevXyzPtr: number,
    invMassPtr: number,
    restLenPtr: number,
    collidersPtr: number,
    particleCount: number,
    colliderCount: number,
    iterations: number,
    paramsPtr: number,
  ) => number;
  readonly wasm_solve_finger_fabrik_chain: (
    jointsXyzPtr: number,
    boneLengthsPtr: number,
    targetXyzPtr: number,
    maxIterations: number,
    paramsPtr: number,
  ) => number;
  readonly wasm_render_foley_biquad_block: (
    monoInPtr: number,
    outLeftPtr: number,
    outRightPtr: number,
    statePtr: number,
    frameCount: number,
    filterMode: number,
    paramsPtr: number,
  ) => number;
}

const REQUIRED_EXTENDED_FUNCTIONS: readonly (keyof RawExtendedSuiteExports)[] = Object.freeze([
  "wasm_drawing_core_abi_version",
  "wasm_hotpath_capabilities",
  "wasm_extended_3d_capabilities",
  "wasm_atelier_stage_3d_capabilities",
  "wasm_extended_capabilities",
  "wasm_alloc",
  "wasm_free",
  "wasm_flood_fill_rgba",
  "wasm_magic_wand_mask",
  "wasm_extract_marching_ants_segments",
  "wasm_rgba_to_oklch_batch",
  "wasm_oklch_to_rgba_batch",
  "wasm_rgba_to_cmyk_batch",
  "wasm_render_halftone_screentone",
  "wasm_liquify_displace_rgba",
  "wasm_warp_mesh_rigid_mls",
  "wasm_vectorize_stroke_cubic",
  "wasm_parse_psd_header",
  "wasm_encode_morton_2d_u32",
  "wasm_encode_morton_3d_u32",
  "wasm_skin_vrm_mesh_4bone_soa",
  "wasm_extract_lt_lineart_from_gbuffer",
  "wasm_cull_stage_frustum_hiz",
  "wasm_resolve_stage_sphere_overlaps",
  "wasm_evaluate_stage_acoustics_and_lighting",
  "wasm_step_verlet_spring_chains_soa",
  "wasm_solve_finger_fabrik_chain",
  "wasm_render_foley_biquad_block",
]);

export function isExtendedSuiteExports(
  exportsObj: WebAssembly.Exports,
): exportsObj is WebAssembly.Exports & RawExtendedSuiteExports {
  if (!(exportsObj.memory instanceof WebAssembly.Memory)) return false;
  for (const name of REQUIRED_EXTENDED_FUNCTIONS) {
    if (typeof exportsObj[name] !== "function") return false;
  }
  return true;
}

export function packRgbaInput(color: RgbaColorInput): number {
  if (typeof color === "number") return color >>> 0;
  return (
    ((color[0] & 0xff) |
      ((color[1] & 0xff) << 8) |
      ((color[2] & 0xff) << 16) |
      ((color[3] & 0xff) << 24)) >>>
    0
  );
}

export function assertFfiOk(rc: number, fnName: string): number {
  if (rc < 0) {
    throw new Error(`${fnName} C-ABI 오류 코드: ${rc}`);
  }
  return rc;
}

export function resolveHalftonePattern(
  pattern: HalftonePatternName | HalftonePatternCode,
): HalftonePatternCode {
  if (typeof pattern === "number") return pattern;
  switch (pattern) {
    case "dot":
      return 0;
    case "line":
      return 1;
    case "crosshatch":
      return 2;
    case "diamond":
      return 3;
  }
}

export function resolveLiquifyMode(mode: LiquifyModeName | LiquifyModeCode): LiquifyModeCode {
  if (typeof mode === "number") return mode;
  switch (mode) {
    case "push":
      return 0;
    case "bloat":
      return 1;
    case "pinch":
      return 2;
    case "twirl-cw":
      return 3;
    case "twirl-ccw":
      return 4;
  }
}

export function resolveDepthRangeCode(range?: StageDepthRangeName | 0 | 1): 0 | 1 {
  return range === 1 || range === "zero-to-one" ? 1 : 0;
}

export function resolveFoleyModeCode(mode?: FoleyFilterModeName | 0 | 1): 0 | 1 {
  return mode === 1 || mode === "bandpass" ? 1 : 0;
}

export function resolvePsdColorModeName(code: number): PsdColorModeName {
  switch (code) {
    case 0:
      return "bitmap";
    case 1:
      return "grayscale";
    case 2:
      return "indexed";
    case 3:
      return "rgb";
    case 4:
      return "cmyk";
    case 7:
      return "multichannel";
    case 8:
      return "duotone";
    case 9:
      return "lab";
    default:
      return "unknown";
  }
}

export interface ScopedWasmArena {
  readonly allocBytes: (byteLen: number) => number;
  readonly copyU8: (src: Uint8Array | Uint8ClampedArray) => number;
  readonly zeroU8: (len: number) => number;
  readonly copyU16: (src: Uint16Array) => number;
  readonly zeroU32: (count: number) => number;
  readonly zeroU64: (count: number) => number;
  readonly copyF32: (src: Float32Array | readonly number[]) => number;
  readonly zeroF32: (count: number) => number;
  readonly readU8: (ptr: number, len: number) => Uint8Array;
  readonly readU32: (ptr: number, count: number) => Uint32Array;
  readonly readU64: (ptr: number, count: number) => BigUint64Array;
  readonly readF32: (ptr: number, count: number) => Float32Array;
  readonly readDirtyRect: (ptr: number) => WasmDirtyRect;
}

export interface ExtendedSuiteArenaManager {
  readonly assertActive: () => void;
  readonly withArena: <T>(fn: (arena: ScopedWasmArena) => T) => T;
  readonly getStats: () => WasmExtendedArenaStats;
  readonly isDisposed: () => boolean;
  readonly dispose: () => void;
}

export function createExtendedSuiteArenaManager(
  e: RawExtendedSuiteExports,
): ExtendedSuiteArenaManager {
  let disposed = false;
  let activeAllocations = 0;
  let totalAllocations = 0;
  let totalFrees = 0;
  let liveAllocatedBytes = 0;
  let peakAllocatedBytes = 0;

  const assertActive = (): void => {
    if (disposed) {
      throw new Error("확장 Wasm 스위트 런타임이 이미 해제되었습니다");
    }
  };

  const withArena = <T>(fn: (arena: ScopedWasmArena) => T): T => {
    assertActive();
    const allocs: [number, number][] = [];

    const allocBytes = (byteLen: number): number => {
      if (byteLen <= 0) return 0;
      const ptr = e.wasm_alloc(byteLen);
      if (ptr === 0) {
        throw new Error(`Wasm 확장 스위트 선형 메모리 할당 실패 (${byteLen} B)`);
      }
      allocs.push([ptr, byteLen]);
      activeAllocations += 1;
      totalAllocations += 1;
      liveAllocatedBytes += byteLen;
      if (liveAllocatedBytes > peakAllocatedBytes) {
        peakAllocatedBytes = liveAllocatedBytes;
      }
      return ptr;
    };

    const arena: ScopedWasmArena = {
      allocBytes,
      copyU8: (src) => {
        if (src.length === 0) return 0;
        const ptr = allocBytes(src.length);
        new Uint8Array(e.memory.buffer, ptr, src.length).set(src);
        return ptr;
      },
      zeroU8: (len) => {
        if (len <= 0) return 0;
        const ptr = allocBytes(len);
        new Uint8Array(e.memory.buffer, ptr, len).fill(0);
        return ptr;
      },
      copyU16: (src) => {
        if (src.length === 0) return 0;
        const ptr = allocBytes(src.length * 2);
        new Uint16Array(e.memory.buffer, ptr, src.length).set(src);
        return ptr;
      },
      zeroU32: (count) => {
        if (count <= 0) return 0;
        const ptr = allocBytes(count * 4);
        new Uint32Array(e.memory.buffer, ptr, count).fill(0);
        return ptr;
      },
      zeroU64: (count) => {
        if (count <= 0) return 0;
        const ptr = allocBytes(count * 8);
        new BigUint64Array(e.memory.buffer, ptr, count).fill(BigInt(0));
        return ptr;
      },
      copyF32: (src) => {
        if (src.length === 0) return 0;
        const ptr = allocBytes(src.length * 4);
        new Float32Array(e.memory.buffer, ptr, src.length).set(src);
        return ptr;
      },
      zeroF32: (count) => {
        if (count <= 0) return 0;
        const ptr = allocBytes(count * 4);
        new Float32Array(e.memory.buffer, ptr, count).fill(0);
        return ptr;
      },
      readU8: (ptr, len) =>
        len <= 0 || ptr === 0
          ? new Uint8Array(0)
          : new Uint8Array(new Uint8Array(e.memory.buffer, ptr, len)),
      readU32: (ptr, count) =>
        count <= 0 || ptr === 0
          ? new Uint32Array(0)
          : new Uint32Array(new Uint32Array(e.memory.buffer, ptr, count)),
      readU64: (ptr, count) =>
        count <= 0 || ptr === 0
          ? new BigUint64Array(0)
          : new BigUint64Array(new BigUint64Array(e.memory.buffer, ptr, count)),
      readF32: (ptr, count) =>
        count <= 0 || ptr === 0
          ? new Float32Array(0)
          : new Float32Array(new Float32Array(e.memory.buffer, ptr, count)),
      readDirtyRect: (ptr) => {
        const view = new Uint32Array(e.memory.buffer, ptr, 4);
        return {
          x: view[0] ?? 0,
          y: view[1] ?? 0,
          width: view[2] ?? 0,
          height: view[3] ?? 0,
        };
      },
    };

    try {
      return fn(arena);
    } finally {
      for (let i = allocs.length - 1; i >= 0; i -= 1) {
        const entry = allocs[i];
        if (!entry) continue;
        e.wasm_free(entry[0], entry[1]);
        activeAllocations -= 1;
        totalFrees += 1;
        liveAllocatedBytes -= entry[1];
      }
    }
  };

  return {
    assertActive,
    withArena,
    getStats: () => ({
      activeAllocations,
      totalAllocations,
      totalFrees,
      liveAllocatedBytes,
      peakAllocatedBytes,
    }),
    isDisposed: () => disposed,
    dispose: () => {
      disposed = true;
    },
  };
}
