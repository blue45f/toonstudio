import type { StudioBg3dEngineRuntimeState } from "./useStudioBg3dEngineRuntime";
import type { WebGLRenderer } from "three";

export interface StudioBg3dFrameRenderer {
  readonly domElement: HTMLCanvasElement;
  readonly info: { readonly autoReset: boolean; readonly render: { readonly calls: number } };
  render: WebGLRenderer["render"];
  getRenderTarget(): unknown;
  getContext(): { isContextLost(): boolean };
}

/** 캡처 패스와 빈 렌더는 건너뛰고 화면에 실제 draw call이 제출된 뒤 한 번만 알린다. */
export function observeStudioBg3dWebGl2FirstFrame(renderer: StudioBg3dFrameRenderer, notify: () => void): void {
  const original = renderer.render;
  let waiting = true;
  const render: StudioBg3dFrameRenderer["render"] = (scene, camera) => {
    const previousCalls = renderer.info.autoReset ? 0 : renderer.info.render.calls;
    original.call(renderer, scene, camera);
    if (waiting && renderer.getRenderTarget() === null && renderer.info.render.calls > previousCalls
      && !renderer.getContext().isContextLost()) {
      waiting = false;
      if (renderer.render === render) renderer.render = original;
      notify();
    }
  };
  renderer.render = render;
}

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
