/**
 * ONNX WebGPU 경로의 어댑터 실재 프로브.
 *
 * 기존 판정은 `"gpu" in navigator` 존재 확인뿐이라, API는 있지만 어댑터가 없는 환경
 * (GPU 블록리스트, 가상 머신, 드라이버 차단)에서는 모델 모듈마다 ONNX 런타임의
 * WebGPU 세션 생성을 실제로 시도하고 실패 비용을 반복해서 지불했다. 이 프로브는
 * `requestAdapter()`를 페이지 세션당 한 번만 실행해 판정을 공유한다 — 어댑터가
 * 없으면 provider가 ORT 세션 생성을 시도하기 전에 같은 `session-create-failed`
 * 오류로 빠르게 실패하고, 호출 측은 기존 경로 퇴역(route retirement) 메커니즘으로
 * WASM 경로로 넘어간다. 어댑터가 있으면 기존 동작과 완전히 동일하다.
 *
 * bg3d의 `studio-bg3d-webgpu-capability.ts`와 같은 패턴(단일 요청·분류·거부 관찰)을
 * 따르되, ONNX에는 bg3d 전용 한계값(버퍼 128MB 등)을 적용하지 않는다 — 모델 모듈이
 * 이미 자체 텐서 예산을 강제하고 있고, 어댑터 실재 여부만으로 충분하다.
 */
export interface StudioOnnxGpuLike {
  requestAdapter(options?: {
    readonly powerPreference?: "low-power" | "high-performance";
  }): Promise<unknown>;
}

export type StudioOnnxWebGpuAdapterProbe = () => Promise<boolean>;

function defaultGpu(): StudioOnnxGpuLike | null {
  if (typeof navigator === "undefined") return null;
  const gpu = (navigator as { readonly gpu?: unknown }).gpu;
  if (!gpu || typeof gpu !== "object") return null;
  const candidate = gpu as { requestAdapter?: unknown };
  return typeof candidate.requestAdapter === "function"
    ? (gpu as StudioOnnxGpuLike)
    : null;
}

/**
 * 주입 가능한 requestAdapter 소스로 메모이즈된 프로브를 만든다.
 * 판정(true/false)은 프로브 인스턴스 수명 동안 고정된다 — GPU 가용성은 페이지
 * 세션 안에서 사실상 정적이며, 고정된 판정이 "인스턴스마다 재시도"를 없앤다.
 */
export function createStudioOnnxWebGpuAdapterProbe(
  resolveGpu: () => StudioOnnxGpuLike | null = defaultGpu,
): StudioOnnxWebGpuAdapterProbe {
  let verdict: Promise<boolean> | null = null;
  return () => {
    verdict ??= (async () => {
      const gpu = resolveGpu();
      if (!gpu) return false;
      try {
        // 제품 전역 기준(bg3d Babylon·three WebGPU 렌더러)과 동일한 선호.
        const adapter = await gpu.requestAdapter({
          powerPreference: "high-performance",
        });
        return adapter !== null && adapter !== undefined;
      } catch {
        // 거부된 어댑터 요청은 미지원과 동일하게 취급한다 — 예외를 흘리지 않는다.
        return false;
      }
    })();
    return verdict;
  };
}

/** 앱 전역에서 공유하는 기본 프로브 — provider 기본값이 사용한다. */
export const probeStudioOnnxWebGpuAdapter: StudioOnnxWebGpuAdapterProbe =
  createStudioOnnxWebGpuAdapterProbe();

/** 동기 존재 확인 — provider의 기존 `webGpuApiAvailable` 기본값이 이관된 것. */
export function studioOnnxWebGpuApiAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}
