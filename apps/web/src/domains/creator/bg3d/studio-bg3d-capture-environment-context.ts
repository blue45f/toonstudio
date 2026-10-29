import { createContext, useContext } from "react";

import type { StudioBg3dCaptureEnvironmentIntent, StudioBg3dCaptureEnvironmentOwner } from "./studio-bg3d-capture-environment-intent";

export interface StudioBg3dCaptureEnvironmentApplication {
  readonly ready: PromiseLike<boolean>;
  readonly isApplied: () => boolean;
}
export interface StudioBg3dCaptureEnvironmentChannel {
  readonly intent: StudioBg3dCaptureEnvironmentIntent;
  readonly generation: number;
  activate(): () => void;
  invalidate(): void;
  report(owner: StudioBg3dCaptureEnvironmentOwner, application: StudioBg3dCaptureEnvironmentApplication): () => void;
}

export const StudioBg3dCaptureEnvironmentContext = createContext<StudioBg3dCaptureEnvironmentChannel | null>(null);

/** 생산자는 passive effect에서 보고한다. 부모 layout publish 전에 성공을 게시하지 않는다. */
export function useStudioBg3dCaptureEnvironmentReporter(): StudioBg3dCaptureEnvironmentChannel | null {
  return useContext(StudioBg3dCaptureEnvironmentContext);
}
