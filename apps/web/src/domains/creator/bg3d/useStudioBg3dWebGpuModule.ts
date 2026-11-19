import { useEffect, useState } from "react";
import type { createStudioBg3dThreeWebGpuRenderer } from "./studio-bg3d-three-webgpu-renderer";

type RendererFactory = typeof createStudioBg3dThreeWebGpuRenderer;
const loadRenderer = async () => (await import("./studio-bg3d-three-webgpu-entry")).createStudioBg3dThreeWebGpuRenderer;
export const STUDIO_BG3D_ENGINE_MODULE_TIMEOUT_MS = 60_000;

/** 엔진 파일을 받기 전에는 캔버스를 만들거나 장치 초기화 시간을 재지 않는다. */
export function useStudioBg3dWebGpuModule(
  enabled: boolean,
  provided: RendererFactory | undefined,
  reportFailure: (cause: string) => void,
  load: () => Promise<RendererFactory> = loadRenderer,
): RendererFactory | null {
  const [loaded, setLoaded] = useState<RendererFactory | null>(null);
  useEffect(() => {
    if (!enabled || provided || loaded) return;
    let pending = true;
    const timer = window.setTimeout(() => {
      pending = false;
      reportFailure("WebGPU 엔진 파일을 받는 시간이 길어지고 있습니다. 네트워크 연결을 확인해 주세요");
    }, STUDIO_BG3D_ENGINE_MODULE_TIMEOUT_MS);
    void load().then((factory) => {
      if (pending) setLoaded(() => factory);
    }, () => {
      if (pending) reportFailure("WebGPU 엔진 파일을 불러오지 못했습니다. 네트워크 연결을 확인해 주세요");
    }).finally(() => window.clearTimeout(timer));
    return () => { pending = false; window.clearTimeout(timer); };
  }, [enabled, provided, loaded, reportFailure, load]);
  return enabled ? (provided ?? loaded) : null;
}
