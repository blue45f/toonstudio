/**
 * `studio-wasm64-extended-suite.wasm` (`--features full-suite`, 40 exports, `ext=0x7ffff`)
 * 지연 로드 전용 타입 안전 런타임 브리지 진입점.
 *
 * - 앱 셸 초기 진입 그래프에서 절대 정적 import하지 않고, 고급 래스터·3D·가상 스튜디오 기능
 *   실행 시점에만 동적 import + `fetch("/wasm/studio-wasm64-extended-suite.wasm")`로 지연 로드한다.
 * - 모든 C-ABI 호출은 `withArena` 스코프에서 `wasm_alloc` → `try ... finally { wasm_free }`를
 *   강제해 정상·오류 경로 모두 선형 메모리 누수 0건을 보장한다.
 */

import {
  fetchAndInstantiateWasmUrl,
  inferWasmBinaryCpuTier,
  normalizeWasmArrayBuffer,
} from "./wasm64-cpu-tier";
import { createExtended3dOps } from "./wasm64-extended-suite-3d";
import {
  createExtendedSuiteArenaManager,
  isExtendedSuiteExports,
  type RawExtendedSuiteExports,
} from "./wasm64-extended-suite-arena";
import { createExtendedRasterOps } from "./wasm64-extended-suite-raster";
import {
  WASM64_EXTENDED_SUITE_EXPECTED_3D_CAPS,
  WASM64_EXTENDED_SUITE_EXPECTED_ABI,
  WASM64_EXTENDED_SUITE_EXPECTED_CAPS,
  WASM64_EXTENDED_SUITE_EXPECTED_HOTPATH_CAPS,
  WASM64_EXTENDED_SUITE_EXPECTED_STAGE_CAPS,
  type LoadStudioWasm64ExtendedSuiteOptions,
  type StudioWasm64ExtendedSuiteMetadata,
  type StudioWasm64ExtendedSuiteRuntime,
} from "./wasm64-extended-suite-types";
import { STUDIO_WASM64_EXTENDED_SUITE_URL } from "./wasm64-hotpath-types";

export { STUDIO_WASM64_EXTENDED_SUITE_URL };
export * from "./wasm64-extended-suite-types";

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function assertSuiteCapabilities(e: RawExtendedSuiteExports): {
  readonly abiVersion: number;
  readonly hotpathCapabilitiesMask: number;
  readonly extended3dCapabilitiesMask: number;
  readonly atelierStageCapabilitiesMask: number;
  readonly extendedCapabilitiesMask: number;
} {
  const abiVersion = e.wasm_drawing_core_abi_version() >>> 0;
  const hotpathCapabilitiesMask = e.wasm_hotpath_capabilities() >>> 0;
  const extended3dCapabilitiesMask = e.wasm_extended_3d_capabilities() >>> 0;
  const atelierStageCapabilitiesMask = e.wasm_atelier_stage_3d_capabilities() >>> 0;
  const extendedCapabilitiesMask = e.wasm_extended_capabilities() >>> 0;

  if (abiVersion !== WASM64_EXTENDED_SUITE_EXPECTED_ABI) {
    throw new Error(`확장 Wasm 스위트 ABI 버전 불일치: actual=${abiVersion}`);
  }
  if (
    hotpathCapabilitiesMask !== WASM64_EXTENDED_SUITE_EXPECTED_HOTPATH_CAPS ||
    extended3dCapabilitiesMask !== WASM64_EXTENDED_SUITE_EXPECTED_3D_CAPS ||
    atelierStageCapabilitiesMask !== WASM64_EXTENDED_SUITE_EXPECTED_STAGE_CAPS ||
    extendedCapabilitiesMask !== WASM64_EXTENDED_SUITE_EXPECTED_CAPS
  ) {
    throw new Error(
      `확장 Wasm 스위트 기능 비트마스크 불일치: hotpath=0x${hotpathCapabilitiesMask.toString(16)}, 3d=0x${extended3dCapabilitiesMask.toString(16)}, stage=0x${atelierStageCapabilitiesMask.toString(16)}, ext=0x${extendedCapabilitiesMask.toString(16)}`,
    );
  }
  return {
    abiVersion,
    hotpathCapabilitiesMask,
    extended3dCapabilitiesMask,
    atelierStageCapabilitiesMask,
    extendedCapabilitiesMask,
  };
}

function buildExtendedSuiteRuntime(
  e: RawExtendedSuiteExports,
  baseMeta: Omit<StudioWasm64ExtendedSuiteMetadata, "linearMemoryBytes">,
): StudioWasm64ExtendedSuiteRuntime {
  const manager = createExtendedSuiteArenaManager(e);
  const rasterOps = createExtendedRasterOps(e, manager);
  const ops3d = createExtended3dOps(e, manager);

  return {
    getMetadata: () => ({
      ...baseMeta,
      linearMemoryBytes: manager.isDisposed() ? 0 : e.memory.buffer.byteLength,
    }),
    getArenaStats: manager.getStats,
    ...rasterOps,
    ...ops3d,
    dispose: manager.dispose,
  };
}

/**
 * 이미 확보된 `studio-wasm64-extended-suite.wasm` 바이너리 바이트를 직접 인스턴스화한다
 * (Node/Vitest 무모킹 검증 및 오프라인 캐시 경로).
 */
export async function createStudioWasm64ExtendedSuiteFromBytes(
  wasmBytes: Uint8Array | ArrayBuffer,
  options: Pick<LoadStudioWasm64ExtendedSuiteOptions, "cpuTierHint" | "wasmUrl"> = {},
): Promise<StudioWasm64ExtendedSuiteRuntime> {
  const started = nowMs();
  const buffer = normalizeWasmArrayBuffer(wasmBytes);
  const { instance } = await WebAssembly.instantiate(buffer, {});
  if (!isExtendedSuiteExports(instance.exports)) {
    throw new Error("studio-wasm64-extended-suite.wasm 필수 확장 export 시그니처가 누락되었습니다");
  }
  const caps = assertSuiteCapabilities(instance.exports);
  const cpuTier = options.cpuTierHint ?? inferWasmBinaryCpuTier(new Uint8Array(buffer));
  return buildExtendedSuiteRuntime(instance.exports, {
    ...caps,
    cpuTier,
    resolvedUrl: options.wasmUrl ?? null,
    wasmByteLength: buffer.byteLength,
    loadSource: "instantiate-bytes",
    loadElapsedMs: nowMs() - started,
  });
}

/**
 * `studio-wasm64-extended-suite.wasm` 바이너리를 지연 로드·인스턴스화한다.
 * `wasmBytes`가 전달되면 네트워크 없이 즉시 인스턴스화하며, 기본 경로는 `/wasm/studio-wasm64-extended-suite.wasm`이다.
 */
export async function loadStudioWasm64ExtendedSuiteRuntime(
  options: LoadStudioWasm64ExtendedSuiteOptions = {},
): Promise<StudioWasm64ExtendedSuiteRuntime> {
  if (typeof WebAssembly === "undefined") {
    throw new Error("현재 런타임에서 WebAssembly를 지원하지 않습니다");
  }
  if (options.wasmBytes) {
    return createStudioWasm64ExtendedSuiteFromBytes(options.wasmBytes, options);
  }
  const fetchImpl = options.fetchFn ?? (typeof fetch === "function" ? fetch : null);
  if (!fetchImpl) {
    throw new Error("fetch API가 없어 확장 Wasm 스위트를 네트워크에서 로드할 수 없습니다");
  }
  const started = nowMs();
  const url = options.wasmUrl ?? STUDIO_WASM64_EXTENDED_SUITE_URL;
  const fetched = await fetchAndInstantiateWasmUrl(url, fetchImpl);
  if (!isExtendedSuiteExports(fetched.instance.exports)) {
    throw new Error(`studio-wasm64-extended-suite.wasm 필수 확장 export 누락 (${url})`);
  }
  const caps = assertSuiteCapabilities(fetched.instance.exports);
  const cpuTier =
    options.cpuTierHint ??
    (fetched.binaryBytes ? inferWasmBinaryCpuTier(fetched.binaryBytes) : "wasm-relaxed-simd");
  return buildExtendedSuiteRuntime(fetched.instance.exports, {
    ...caps,
    cpuTier,
    resolvedUrl: url,
    wasmByteLength: fetched.byteLength,
    loadSource: fetched.loadSource,
    loadElapsedMs: nowMs() - started,
  });
}
