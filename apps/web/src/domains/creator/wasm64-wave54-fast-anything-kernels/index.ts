/**
 * ToonStudio Wave-54 `fast-anything` 외곽 루프 4종 Real WASM64 (`memory64`, `flags=0x04`) 공개 진입점.
 */

export {
  meijsterEdt2dSqF32Js,
  oilBristleStampAccumulateRgbaJs,
  packBc1TileRgbaTo64BitJs,
  sdfGapCloseFloodFillU8Js,
  type OilBristleConfig,
} from "./fast-kernels-js-reference";

export {
  DEFAULT_WASM32_FAST_KERNELS_URL,
  DEFAULT_WASM64_FAST_KERNELS_URL,
  inspectWasmMemorySection,
  isFastAnythingDisabled,
  loadFastKernelsRuntime,
  supportsWasmMemory64,
  type FastKernelsBackendKind,
  type FastKernelsRuntime,
  type LoadFastKernelsOptions,
  type WasmMemorySectionInfo,
} from "./fast-kernels-wasm64-loader";
