import type { StudioBg3dEngineRuntimeState } from "./useStudioBg3dEngineRuntime";

/** 닫힘의 첫 render에서도 선택한 WebGPU factory를 WebGL 기본 옵션으로 바꾸지 않는다. */
export function isStudioBg3dCanvasFactoryPending(
  runtime: Pick<StudioBg3dEngineRuntimeState, "plan" | "glFactory">,
): boolean {
  return runtime.plan.status === "available" && runtime.plan.backend === "webgpu" && runtime.glFactory === null;
}

/** R3F가 교체한 캔버스에서 늦게 완료된 장치는 현재 편집기의 렌더러가 될 수 없다. */
export function acceptStudioBg3dViewportRenderer(
  host: HTMLElement | null,
  renderer: { domElement: HTMLCanvasElement; isWebGPURenderer?: boolean; dispose(): void | Promise<void> },
): boolean {
  if (host?.contains(renderer.domElement)) return true;
  if (renderer.isWebGPURenderer) void renderer.dispose();
  return false;
}
