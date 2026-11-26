/**
 * ONNX WebGPU 경로의 어댑터 실재 및 기능(`shader-f16`, `subgroups`, compute 한계) 프로브.
 *
 * 기존 판정은 `"gpu" in navigator` 존재 확인뿐이라, API는 있지만 어댑터가 없는 환경
 * (GPU 블록리스트, 가상 머신, 드라이버 차단)에서는 모델 모듈마다 ONNX 런타임의
 * WebGPU 세션 생성을 실제로 시도하고 실패 비용을 반복해서 지불했다. 이 프로브는
 * `requestAdapter()`를 페이지 세션당 한 번만 실행해 어댑터 유무와 함께
 * `shader-f16`, `subgroups`, `maxStorageBufferBindingSize`,
 * `maxComputeInvocationsPerWorkgroup` 역량을 공유한다.
 *
 * bg3d의 `studio-bg3d-webgpu-capability.ts`와 같은 패턴(단일 요청·분류·거부 관찰)을
 * 따르되, ONNX에는 bg3d 전용 한계값(버퍼 128MB 등)을 적용하지 않는다 — 모델 모듈이
 * 이미 자체 텐서 예산을 강제하고 있고, 어댑터 실재 여부 및 확장 기능 판별만으로 충분하다.
 */
export interface StudioOnnxGpuAdapterLike {
  readonly features?: {
    has(feature: string): boolean;
  };
  readonly limits?: {
    readonly maxStorageBufferBindingSize?: number;
    readonly maxComputeInvocationsPerWorkgroup?: number;
  };
}

export interface StudioOnnxGpuLike {
  requestAdapter(options?: {
    readonly powerPreference?: "low-power" | "high-performance";
  }): Promise<unknown>;
}

export interface StudioOnnxWebGpuAdapterCapabilities {
  readonly available: boolean;
  readonly shaderF16: boolean;
  readonly subgroups: boolean;
  readonly maxStorageBufferBindingSize: number | null;
  readonly maxComputeInvocationsPerWorkgroup: number | null;
}

export type StudioOnnxWebGpuAdapterProbe = () => Promise<boolean>;

export type StudioOnnxWebGpuCapabilityProbe =
  () => Promise<StudioOnnxWebGpuAdapterCapabilities>;

const UNAVAILABLE_CAPABILITIES: StudioOnnxWebGpuAdapterCapabilities = Object.freeze({
  available: false,
  shaderF16: false,
  subgroups: false,
  maxStorageBufferBindingSize: null,
  maxComputeInvocationsPerWorkgroup: null,
});

function defaultGpu(): StudioOnnxGpuLike | null {
  if (typeof navigator === "undefined") return null;
  const gpu = (navigator as { readonly gpu?: unknown }).gpu;
  if (!gpu || typeof gpu !== "object") return null;
  const candidate = gpu as { requestAdapter?: unknown };
  return typeof candidate.requestAdapter === "function"
    ? (gpu as StudioOnnxGpuLike)
    : null;
}

function sanitizeLimit(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.floor(value);
}

function readAdapterCapabilities(adapter: unknown): StudioOnnxWebGpuAdapterCapabilities {
  if (adapter === null || adapter === undefined) {
    return UNAVAILABLE_CAPABILITIES;
  }
  const candidate =
    typeof adapter === "object" ? (adapter as StudioOnnxGpuAdapterLike) : null;
  const hasFeature = (feature: string): boolean => {
    try {
      return typeof candidate?.features?.has === "function"
        && candidate.features.has(feature) === true;
    } catch {
      return false;
    }
  };
  return Object.freeze({
    available: true,
    shaderF16: hasFeature("shader-f16"),
    subgroups: hasFeature("subgroups"),
    maxStorageBufferBindingSize: sanitizeLimit(
      candidate?.limits?.maxStorageBufferBindingSize,
    ),
    maxComputeInvocationsPerWorkgroup: sanitizeLimit(
      candidate?.limits?.maxComputeInvocationsPerWorkgroup,
    ),
  });
}

/**
 * 주입 가능한 requestAdapter 소스로 메모이즈된 WebGPU 기능 프로브를 만든다.
 * 단일 `requestAdapter({ powerPreference: "high-performance" })` 호출을 공유하며
 * 어댑터 실재 여부와 `shader-f16` / `subgroups` / compute 한계를 함께 판정한다.
 */
export function createStudioOnnxWebGpuCapabilityProbe(
  resolveGpu: () => StudioOnnxGpuLike | null = defaultGpu,
): StudioOnnxWebGpuCapabilityProbe {
  let verdict: Promise<StudioOnnxWebGpuAdapterCapabilities> | null = null;
  return () => {
    verdict ??= (async () => {
      const gpu = resolveGpu();
      if (!gpu) return UNAVAILABLE_CAPABILITIES;
      try {
        // 제품 전역 기준(bg3d Babylon·three WebGPU 렌더러)과 동일한 선호.
        const adapter = await gpu.requestAdapter({
          powerPreference: "high-performance",
        });
        return readAdapterCapabilities(adapter);
      } catch {
        // 거부된 어댑터 요청은 미지원과 동일하게 취급한다 — 예외를 흘리지 않는다.
        return UNAVAILABLE_CAPABILITIES;
      }
    })();
    return verdict;
  };
}

/**
 * 주입 가능한 requestAdapter 소스로 메모이즈된 프로브를 만든다.
 * 판정(true/false)은 프로브 인스턴스 수명 동안 고정된다 — GPU 가용성은 페이지
 * 세션 안에서 사실상 정적이며, 고정된 판정이 "인스턴스마다 재시도"를 없앤다.
 */
export function createStudioOnnxWebGpuAdapterProbe(
  resolveGpu: () => StudioOnnxGpuLike | null = defaultGpu,
): StudioOnnxWebGpuAdapterProbe {
  const capabilityProbe = createStudioOnnxWebGpuCapabilityProbe(resolveGpu);
  return () => capabilityProbe().then((caps) => caps.available);
}

/** 앱 전역에서 공유하는 기본 WebGPU 역량 프로브. */
export const probeStudioOnnxWebGpuCapabilities: StudioOnnxWebGpuCapabilityProbe =
  createStudioOnnxWebGpuCapabilityProbe();

/** 앱 전역에서 공유하는 기본 어댑터 존재 프로브 — provider 기본값이 사용한다. */
export const probeStudioOnnxWebGpuAdapter: StudioOnnxWebGpuAdapterProbe = () =>
  probeStudioOnnxWebGpuCapabilities().then((caps) => caps.available);

/** 동기 존재 확인 — provider의 기존 `webGpuApiAvailable` 기본값이 이관된 것. */
export function studioOnnxWebGpuApiAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}
