/**
 * `studio-wasm64-extended-suite.wasm` Pro Raster Tools 11종 C-ABI 래퍼.
 */

import {
  assertFfiOk,
  packRgbaInput,
  resolveHalftonePattern,
  resolveLiquifyMode,
  resolvePsdColorModeName,
  type ExtendedSuiteArenaManager,
  type RawExtendedSuiteExports,
} from "./wasm64-extended-suite-arena";
import type {
  StudioWasm64ExtendedSuiteRuntime,
  WasmCmykBatchResult,
  WasmFloodFillOptions,
  WasmFloodFillResult,
  WasmHalftoneOptions,
  WasmHalftoneResult,
  WasmLiquifyOptions,
  WasmLiquifyResult,
  WasmMagicWandOptions,
  WasmMagicWandResult,
  WasmMarchingAntsOptions,
  WasmMarchingAntsResult,
  WasmMlsWarpResult,
  WasmOklchBatchResult,
  WasmPsdHeaderInfo,
  WasmRgbaBatchResult,
  WasmVectorizeStrokeOptions,
  WasmVectorizeStrokeResult,
} from "./wasm64-extended-suite-types";

export type ExtendedSuiteRasterOps = Pick<
  StudioWasm64ExtendedSuiteRuntime,
  | "floodFillRgba"
  | "magicWandMask"
  | "extractMarchingAnts"
  | "rgbaToOklch"
  | "oklchToRgba"
  | "rgbaToCmyk"
  | "renderHalftoneScreentone"
  | "liquifyDisplaceRgba"
  | "warpMeshRigidMls"
  | "vectorizeStrokeCubic"
  | "parsePsdHeader"
>;

export function createExtendedRasterOps(
  e: RawExtendedSuiteExports,
  manager: ExtendedSuiteArenaManager,
): ExtendedSuiteRasterOps {
  const { withArena } = manager;

  const floodFillRgba = (
    rgba: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    options: WasmFloodFillOptions,
  ): WasmFloodFillResult =>
    withArena((arena) => {
      const rgbaPtr = arena.copyU8(rgba);
      const bMaskPtr = options.boundaryMask ? arena.copyU8(options.boundaryMask) : 0;
      const dirtyPtr = arena.zeroU32(4);
      const filledPixels = assertFfiOk(
        e.wasm_flood_fill_rgba(
          rgbaPtr,
          bMaskPtr,
          width >>> 0,
          height >>> 0,
          options.seedX >>> 0,
          options.seedY >>> 0,
          packRgbaInput(options.fillRgba),
          Math.max(0, Math.min(255, Math.round(options.tolerance ?? 16))),
          Math.max(0, Math.min(8, Math.round(options.gapClosingRadius ?? 0))),
          dirtyPtr,
        ),
        "wasm_flood_fill_rgba",
      );
      const output = arena.readU8(rgbaPtr, rgba.length);
      if (options.mutateInPlace) rgba.set(output);
      return { output, filledPixels, dirtyRect: arena.readDirtyRect(dirtyPtr) };
    });

  const magicWandMask = (
    rgba: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    options: WasmMagicWandOptions,
  ): WasmMagicWandResult =>
    withArena((arena) => {
      const pixelCount = width * height;
      const rgbaPtr = arena.copyU8(rgba);
      const bMaskPtr = options.boundaryMask ? arena.copyU8(options.boundaryMask) : 0;
      const outMaskPtr = arena.zeroU8(pixelCount);
      const dirtyPtr = arena.zeroU32(4);
      const selectedPixels = assertFfiOk(
        e.wasm_magic_wand_mask(
          rgbaPtr,
          bMaskPtr,
          outMaskPtr,
          width >>> 0,
          height >>> 0,
          options.seedX >>> 0,
          options.seedY >>> 0,
          Math.max(0, Math.min(255, Math.round(options.tolerance ?? 16))),
          Math.max(0, Math.min(8, Math.round(options.gapClosingRadius ?? 0))),
          options.antiAlias ? 1 : 0,
          dirtyPtr,
        ),
        "wasm_magic_wand_mask",
      );
      return {
        mask: arena.readU8(outMaskPtr, pixelCount),
        selectedPixels,
        dirtyRect: arena.readDirtyRect(dirtyPtr),
      };
    });

  const extractMarchingAnts = (
    mask: Uint8Array,
    width: number,
    height: number,
    options: WasmMarchingAntsOptions = {},
  ): WasmMarchingAntsResult =>
    withArena((arena) => {
      const threshold = Math.max(1, Math.min(255, Math.round(options.threshold ?? 128)));
      const maskPtr = arena.copyU8(mask);
      const needed = assertFfiOk(
        e.wasm_extract_marching_ants_segments(maskPtr, width >>> 0, height >>> 0, threshold, 0, 0),
        "wasm_extract_marching_ants_segments(count)",
      );
      if (needed === 0) return { segments: new Uint32Array(0), segmentCount: 0 };
      const segPtr = arena.zeroU32(needed * 4);
      const written = assertFfiOk(
        e.wasm_extract_marching_ants_segments(
          maskPtr,
          width >>> 0,
          height >>> 0,
          threshold,
          segPtr,
          needed >>> 0,
        ),
        "wasm_extract_marching_ants_segments",
      );
      return { segments: arena.readU32(segPtr, written * 4), segmentCount: written };
    });

  const rgbaToOklch = (rgba: Uint8Array | Uint8ClampedArray): WasmOklchBatchResult => {
    if (rgba.length % 4 !== 0) {
      throw new RangeError(`RGBA 길이는 4의 배수여야 합니다: actual=${rgba.length}`);
    }
    const pixelCount = rgba.length >>> 2;
    if (pixelCount === 0) return { oklch: new Float32Array(0), pixelCount: 0 };
    return withArena((arena) => {
      const rgbaPtr = arena.copyU8(rgba);
      const outPtr = arena.zeroF32(rgba.length);
      const processed = assertFfiOk(
        e.wasm_rgba_to_oklch_batch(rgbaPtr, outPtr, pixelCount >>> 0),
        "wasm_rgba_to_oklch_batch",
      );
      return { oklch: arena.readF32(outPtr, rgba.length), pixelCount: processed };
    });
  };

  const oklchToRgba = (oklch: Float32Array): WasmRgbaBatchResult => {
    if (oklch.length % 4 !== 0) {
      throw new RangeError(`OKLCH 길이는 4의 배수여야 합니다: actual=${oklch.length}`);
    }
    const pixelCount = oklch.length >>> 2;
    if (pixelCount === 0) return { rgba: new Uint8Array(0), pixelCount: 0 };
    return withArena((arena) => {
      const oklchPtr = arena.copyF32(oklch);
      const outPtr = arena.zeroU8(oklch.length);
      const processed = assertFfiOk(
        e.wasm_oklch_to_rgba_batch(oklchPtr, outPtr, pixelCount >>> 0),
        "wasm_oklch_to_rgba_batch",
      );
      return { rgba: arena.readU8(outPtr, oklch.length), pixelCount: processed };
    });
  };

  const rgbaToCmyk = (
    rgba: Uint8Array | Uint8ClampedArray,
    gcrFactor = 0.75,
  ): WasmCmykBatchResult => {
    if (rgba.length % 4 !== 0) {
      throw new RangeError(`RGBA 길이는 4의 배수여야 합니다: actual=${rgba.length}`);
    }
    const pixelCount = rgba.length >>> 2;
    return withArena((arena) => {
      const rgbaPtr = pixelCount > 0 ? arena.copyU8(rgba) : 0;
      const outPtr = pixelCount > 0 ? arena.zeroU8(rgba.length) : 0;
      const processed = assertFfiOk(
        e.wasm_rgba_to_cmyk_batch(rgbaPtr, outPtr, pixelCount >>> 0, gcrFactor),
        "wasm_rgba_to_cmyk_batch",
      );
      return { cmyk: arena.readU8(outPtr, rgba.length), pixelCount: processed };
    });
  };

  const renderHalftoneScreentone = (
    width: number,
    height: number,
    options: WasmHalftoneOptions = {},
  ): WasmHalftoneResult =>
    withArena((arena) => {
      const rgbaBytes = width * height * 4;
      const srcPtr = options.sourceRgba ? arena.copyU8(options.sourceRgba) : 0;
      const outPtr = arena.zeroU8(rgbaBytes);
      const paramsPtr = arena.copyF32([
        options.cellPitchPx ?? 8.0,
        options.angleDeg ?? 45.0,
        options.toneDensity ?? 0.35,
        options.softness ?? 0.06,
      ]);
      const processedPixels = assertFfiOk(
        e.wasm_render_halftone_screentone(
          srcPtr,
          outPtr,
          width >>> 0,
          height >>> 0,
          resolveHalftonePattern(options.pattern ?? "dot"),
          packRgbaInput(options.inkRgba ?? 0xff000000),
          packRgbaInput(options.paperRgba ?? 0xffffffff),
          paramsPtr,
        ),
        "wasm_render_halftone_screentone",
      );
      return { output: arena.readU8(outPtr, rgbaBytes), processedPixels };
    });

  const liquifyDisplaceRgba = (
    rgba: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    options: WasmLiquifyOptions,
  ): WasmLiquifyResult =>
    withArena((arena) => {
      const rgbaBytes = width * height * 4;
      const srcPtr = arena.copyU8(rgba);
      const dstPtr = arena.zeroU8(rgbaBytes);
      const paramsPtr = arena.copyF32([
        options.cx,
        options.cy,
        options.radius,
        options.strength,
        options.dx ?? 0,
        options.dy ?? 0,
      ]);
      const dirtyPtr = arena.zeroU32(4);
      const affectedPixels = assertFfiOk(
        e.wasm_liquify_displace_rgba(
          srcPtr,
          dstPtr,
          width >>> 0,
          height >>> 0,
          resolveLiquifyMode(options.mode),
          paramsPtr,
          dirtyPtr,
        ),
        "wasm_liquify_displace_rgba",
      );
      return {
        output: arena.readU8(dstPtr, rgbaBytes),
        affectedPixels,
        dirtyRect: arena.readDirtyRect(dirtyPtr),
      };
    });

  const warpMeshRigidMls = (
    verticesXy: Float32Array,
    pins: Float32Array,
    alpha = 1.0,
  ): WasmMlsWarpResult => {
    if (verticesXy.length % 2 !== 0 || pins.length % 5 !== 0) {
      throw new RangeError(
        `MLS 입력 스트라이드 오류: vertices=${verticesXy.length}, pins=${pins.length}`,
      );
    }
    const vertexCount = verticesXy.length / 2;
    const pinCount = pins.length / 5;
    return withArena((arena) => {
      const vertsPtr = arena.copyF32(verticesXy);
      const pinsPtr = arena.copyF32(pins);
      const outPtr = arena.zeroF32(verticesXy.length);
      const written = assertFfiOk(
        e.wasm_warp_mesh_rigid_mls(
          vertsPtr,
          vertexCount >>> 0,
          pinsPtr,
          pinCount >>> 0,
          alpha,
          outPtr,
        ),
        "wasm_warp_mesh_rigid_mls",
      );
      return { verticesXy: arena.readF32(outPtr, written * 2), vertexCount: written };
    });
  };

  const vectorizeStrokeCubic = (
    pointsXyp: Float32Array,
    options: WasmVectorizeStrokeOptions = {},
  ): WasmVectorizeStrokeResult => {
    if (pointsXyp.length % 3 !== 0) {
      throw new RangeError(`스트로크 점 배열은 3의 배수여야 합니다: actual=${pointsXyp.length}`);
    }
    const pointCount = pointsXyp.length / 3;
    const rdpEpsilon = options.rdpEpsilon ?? 0.35;
    const bezierErrorTolerance = options.bezierErrorTolerance ?? 1.0;
    return withArena((arena) => {
      const ptsPtr = arena.copyF32(pointsXyp);
      const statsPtr = arena.zeroF32(3);
      const needed = assertFfiOk(
        e.wasm_vectorize_stroke_cubic(
          ptsPtr,
          pointCount >>> 0,
          rdpEpsilon,
          bezierErrorTolerance,
          0,
          0,
          statsPtr,
        ),
        "wasm_vectorize_stroke_cubic(count)",
      );
      let segments: Float32Array = new Float32Array(0);
      let segmentCount = needed;
      if (needed > 0) {
        const segPtr = arena.zeroF32(needed * 10);
        segmentCount = assertFfiOk(
          e.wasm_vectorize_stroke_cubic(
            ptsPtr,
            pointCount >>> 0,
            rdpEpsilon,
            bezierErrorTolerance,
            segPtr,
            needed >>> 0,
            statsPtr,
          ),
          "wasm_vectorize_stroke_cubic",
        );
        segments = arena.readF32(segPtr, segmentCount * 10);
      }
      const stats = arena.readF32(statsPtr, 3);
      return {
        segments,
        segmentCount,
        maxFitError: stats[1] ?? 0,
        compressionRatio: stats[2] ?? 0,
      };
    });
  };

  const parsePsdHeader = (bytes: Uint8Array): WasmPsdHeaderInfo =>
    withArena((arena) => {
      const bytesPtr = arena.copyU8(bytes);
      const metaPtr = arena.zeroU64(16);
      assertFfiOk(
        e.wasm_parse_psd_header(bytesPtr, bytes.length >>> 0, metaPtr),
        "wasm_parse_psd_header",
      );
      const meta = arena.readU64(metaPtr, 16);
      const ZERO_U64 = BigInt(0);
      const colorModeCode = Number(meta[6] ?? ZERO_U64);
      return {
        version: Number(meta[0] ?? ZERO_U64),
        isPsb: (meta[1] ?? ZERO_U64) !== ZERO_U64,
        channels: Number(meta[2] ?? ZERO_U64),
        width: Number(meta[3] ?? ZERO_U64),
        height: Number(meta[4] ?? ZERO_U64),
        depthBits: Number(meta[5] ?? ZERO_U64),
        colorModeCode,
        colorModeName: resolvePsdColorModeName(colorModeCode),
        colorModeDataOffset: meta[7] ?? ZERO_U64,
        colorModeDataLength: meta[8] ?? ZERO_U64,
        imageResourcesOffset: meta[9] ?? ZERO_U64,
        imageResourcesLength: meta[10] ?? ZERO_U64,
        layerAndMaskOffset: meta[11] ?? ZERO_U64,
        layerAndMaskLength: meta[12] ?? ZERO_U64,
        imageDataOffset: meta[13] ?? ZERO_U64,
        estimatedUncompressedRgbaBytes: meta[14] ?? ZERO_U64,
        requiresMemory64: (meta[15] ?? ZERO_U64) !== ZERO_U64,
      };
    });

  return {
    floodFillRgba,
    magicWandMask,
    extractMarchingAnts,
    rgbaToOklch,
    oklchToRgba,
    rgbaToCmyk,
    renderHalftoneScreentone,
    liquifyDisplaceRgba,
    warpMeshRigidMls,
    vectorizeStrokeCubic,
    parsePsdHeader,
  };
}
