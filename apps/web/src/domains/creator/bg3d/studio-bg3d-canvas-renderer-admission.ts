import type { StudioBg3dEngineRuntimeState } from "./useStudioBg3dEngineRuntime";

/** 닫힘의 첫 render에서도 선택한 WebGPU factory를 WebGL 기본 옵션으로 바꾸지 않는다. */
export function isStudioBg3dCanvasFactoryPending(
  runtime: Pick<StudioBg3dEngineRuntimeState, "plan" | "glFactory">,
): boolean {
  return runtime.plan.status === "available" && runtime.plan.backend === "webgpu" && runtime.glFactory === null;
}
