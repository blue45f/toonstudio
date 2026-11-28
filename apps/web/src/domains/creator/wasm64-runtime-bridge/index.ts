/**
 * `crates/studio-wasm64-drawing-core` 실제 `.wasm` 번들 런타임 핫패스 브리지 진입점.
 */

export {
  benchmarkWasm64VsJsHotpaths,
  createDualAddressWidthWasmAdapter,
  createHotpathBenchmarkFixtures,
  createStudioWasm64HotpathFromBytes,
  createStudioWasm64JsFallbackRuntime,
  DEFAULT_IMPASTO_LIGHT_PARAMS,
  DEFAULT_WASM64_HOTPATH_ROUTING,
  detectWasmCpuTier,
  detectWasmMemory64Support,
  inferCpuTierFromUrl,
  inferWasmBinaryCpuTier,
  inspectWasmBinaryMemorySection,
  loadStudioWasm64HotpathRuntime,
  loadStudioWasm64Memory64Hotpath,
  probeWasmCpuTierCapabilities,
  resolveWasmCoreTierCandidates,
  STUDIO_WASM64_CORE_MEMORY64_URL,
  STUDIO_WASM64_CORE_RELAXED_SIMD_URL,
  STUDIO_WASM64_CORE_SIMD_URL,
  STUDIO_WASM64_CORE_URL,
  STUDIO_WASM64_EXTENDED_SUITE_MEMORY64_URL,
  STUDIO_WASM64_EXTENDED_SUITE_URL,
  WASM64_HOTPATH_EXPECTED_ABI,
  WASM64_HOTPATH_EXPECTED_CAPABILITIES,
  WASM_MEMORY64_FLAG,
  WASM_MEMORY64_PROBE_BYTES,
  WASM_RELAXED_SIMD_PROBE_BYTES,
  WASM_SCALAR_PROBE_BYTES,
  WASM_SIMD128_PROBE_BYTES,
  type DualAddressWidthWasmAdapter,
  type HotpathBenchmarkFixtures,
  type HotpathBenchmarkSuiteResult,
  type HotpathBlurOptions,
  type HotpathBlurResult,
  type HotpathImpastoOptions,
  type HotpathImpastoResult,
  type HotpathKernelBenchmarkEntry,
  type HotpathKm16StripResult,
  type HotpathTileCompositeOptions,
  type HotpathTileCompositeResult,
  type HotpathUnsharpOptions,
  type HotpathUnsharpResult,
  type HotpathXorDeltaResult,
  type ImpastoLightParams,
  type LoadStudioWasm64HotpathOptions,
  type StudioWasm64HotpathMetadata,
  type StudioWasm64HotpathRuntime,
  type StudioWasm64HotpathTelemetry,
  type TileBlendModeCode,
  type Wasm64CpuTier,
  type Wasm64CpuTierProbe,
  type Wasm64ExecutableTier,
  type Wasm64HotpathBackendMode,
  type Wasm64HotpathLoadSource,
  type Wasm64HotpathRouteKey,
  type Wasm64HotpathRoutingConfig,
  type WasmBinaryMemorySectionInfo,
  type WasmCoreTierCandidate,
  type WasmDirtyRect,
  type WasmValidateFn,
  type ZeroCopyUnsharpViewResult,
} from "./wasm64-hotpath-loader";

export type {
  LoadStudioWasm64ExtendedSuiteOptions,
  StudioWasm64ExtendedSuiteMetadata,
  StudioWasm64ExtendedSuiteRuntime,
} from "./wasm64-extended-suite-types";

/** 확장 스위트 런타임을 동적 청크로 지연 로드한다 (`preferMemory64: true` 옵션 지원). */
export async function loadStudioWasm64ExtendedSuite(
  options?: import("./wasm64-extended-suite-types").LoadStudioWasm64ExtendedSuiteOptions,
): Promise<import("./wasm64-extended-suite-types").StudioWasm64ExtendedSuiteRuntime> {
  const mod = await import("./wasm64-extended-suite-loader");
  return mod.loadStudioWasm64ExtendedSuiteRuntime(options);
}

export {
  StudioWasm64HotpathPanel,
  type StudioWasm64HotpathPanelProps,
} from "./StudioWasm64HotpathPanel";
