import { useEffectEvent, useLayoutEffect, useMemo, useState } from "react";

import type { StudioTeamVrmCutResources } from "../scene3d/studio-team-vrm-cut-assets";
import type { StudioVrmSurfacePaintSettings } from "../vrm/studio-vrm-scene-document";
import type { StudioVrmPaintPresentation } from "../vrm/studio-vrm-texture-paint-presentation";
import type { Object3D } from "three";

type Status = "loading" | "ready" | "unavailable";
interface Receipt {
  scene: Object3D;
  identity: string;
  resources?: StudioTeamVrmCutResources;
  status: Status;
}

/** 포저와 같은 재질 바인딩에 저장한 모든 채널을 복원한 뒤에만 캡처를 허용한다. */
export function useStudioBg3dLinkedVrmSurfacePaint(
  scene: Object3D | null,
  settings: StudioVrmSurfacePaintSettings,
  resources?: StudioTeamVrmCutResources,
): Status {
  const identity = useMemo(() => settings.textures.length ? JSON.stringify(settings) : "", [settings]);
  const readSettings = useEffectEvent(() => settings);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useLayoutEffect(() => {
    setReceipt(null);
    if (!scene || !identity) return;
    const controller = new AbortController();
    const { signal } = controller;
    const paint = readSettings();
    let presentation: StudioVrmPaintPresentation | undefined;
    async function restore(modelScene: Object3D) {
      const [{ restoreStudioVrmPaintPresentation }, { DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS },
        { planStudioVrmTexturePaintDeviceTier }, { readStudioVrmTexturePaintEnvironmentSignals }] = await Promise.all([
        import("../vrm/studio-vrm-texture-paint-presentation"),
        import("../vrm/studio-vrm-texture-paint-runtime"),
        import("../vrm/studio-vrm-texture-paint-device-tier"),
        import("../vrm/StudioVrmPoserTypes"),
      ]);
      if (signal.aborted) return;
      const plan = planStudioVrmTexturePaintDeviceTier(readStudioVrmTexturePaintEnvironmentSignals());
      presentation = await restoreStudioVrmPaintPresentation(modelScene, paint, {
        signal,
        maxAggregateResidentBytes: plan.runtimeOptions.maxAggregateResidentBytes
          ?? DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS.maxAggregateResidentBytes,
        dependencies: resources ? {
          async getArtifact(hash) {
            const artifact = resources.paints.get(hash);
            if (!artifact) throw new Error("작품에서 받은 채색 원본이 없습니다.");
            return artifact;
          },
        } : undefined,
      });
      if (signal.aborted) presentation.dispose();
      else setReceipt({ scene: modelScene, identity, resources, status: "ready" });
    }
    void restore(scene).catch(() => {
      if (signal.aborted) return;
      presentation?.dispose();
      presentation = undefined;
      setReceipt({ scene, identity, resources, status: "unavailable" });
    });
    return () => {
      controller.abort();
      presentation?.dispose();
    };
  }, [identity, scene, resources]);

  if (!scene) return "loading";
  if (!identity) return "ready";
  return receipt?.scene === scene && receipt.identity === identity && receipt.resources === resources ? receipt.status : "loading";
}
