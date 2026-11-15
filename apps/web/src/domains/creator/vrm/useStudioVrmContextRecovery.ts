import { useCallback, useMemo, useState } from "react";

import type { StudioVrmPoserHost } from "./StudioVrmPoserHost";

export function useStudioVrmContextRecovery(h: StudioVrmPoserHost): StudioVrmPoserHost {
  const [contextLost, setContextLostState] = useState(false);
  const [lowQualityMode, setLowQualityMode] = useState(false);
  const [canvasRecoveryGeneration, setCanvasRecoveryGeneration] = useState(0);

  const setContextLost = useCallback((lost: boolean) => {
    setContextLostState(lost);
  }, []);

  const handleReopenLowQuality = useCallback(() => {
    setContextLostState(false);
    setLowQualityMode(true);
    h.setTurntable?.(false);
    h.setPhysicsPreview?.(false);
    setCanvasRecoveryGeneration((gen) => gen + 1);
  }, [h]);

  const handleReturnTo2d = useCallback(() => {
    setContextLostState(false);
    h.cancelActiveTexturePaintStroke?.();
    h.cancelPendingPoseShare?.();
    h.onClose?.();
  }, [h]);

  return useMemo(
    () => ({
      ...h,
      vrmContextLost: contextLost,
      setVrmContextLost: setContextLost,
      vrmLowQualityMode: lowQualityMode,
      vrmCanvasRecoveryGeneration: canvasRecoveryGeneration,
      handleVrmReopenLowQuality: handleReopenLowQuality,
      handleVrmReturnTo2d: handleReturnTo2d,
    }),
    [
      h,
      contextLost,
      setContextLost,
      lowQualityMode,
      canvasRecoveryGeneration,
      handleReopenLowQuality,
      handleReturnTo2d,
    ],
  );
}
