import { useCallback, useLayoutEffect, useMemo, useRef, type RefObject } from "react";

import type { StudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";

export interface StudioBg3dModelMaterialRenderer {
  readonly isWebGLRenderer?: unknown;
  readonly isWebGPURenderer?: unknown;
}
interface StudioBg3dModelMaterialLeaseRequest {
  readonly renderer: StudioBg3dModelMaterialRenderer | null;
  readonly rendererRef: RefObject<StudioBg3dModelMaterialRenderer | null>;
  readonly materialBackend: StudioBg3dMaterialBackend;
}

/** 확정된 렌더 scope만 유효하다. 같은 backend·renderer로 돌아와도 이전 작업의 scope는 부활하지 않는다. */
export function useStudioBg3dModelMaterialLease({ renderer, rendererRef, materialBackend }: StudioBg3dModelMaterialLeaseRequest): () => boolean {
  const scope = useMemo(() => ({ renderer, materialBackend }), [renderer, materialBackend]);
  const currentScope = useRef<typeof scope | null>(null);
  useLayoutEffect(() => {
    currentScope.current = scope;
    return () => { if (currentScope.current === scope) currentScope.current = null; };
  }, [scope]);
  return useCallback(() => currentScope.current === scope && rendererRef.current === renderer && renderer !== null
    && (scope.materialBackend === "webgpu"
      ? renderer.isWebGPURenderer === true && renderer.isWebGLRenderer !== true
      : renderer.isWebGLRenderer === true && renderer.isWebGPURenderer !== true), [scope, rendererRef, renderer]);
}
