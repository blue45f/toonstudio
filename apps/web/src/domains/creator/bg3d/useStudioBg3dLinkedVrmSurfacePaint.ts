import { useEffectEvent, useLayoutEffect, useMemo, useState } from "react";

import type { StudioVrmSurfacePaintSettings } from "../vrm/studio-vrm-scene-document";
import type { StudioVrmTexturePaintRuntime } from "../vrm/studio-vrm-texture-paint-runtime";
import type { Object3D } from "three";

type Status = "loading" | "ready" | "unavailable";
interface Receipt {
  scene: Object3D;
  identity: string;
  status: Status;
}

/** 공유 스테이지가 지원하는 기본색 재질 전체가 복원된 뒤에만 캡처를 허용한다. */
export function useStudioBg3dLinkedVrmSurfacePaint(
  scene: Object3D | null,
  settings: StudioVrmSurfacePaintSettings,
  resources?: import("../scene3d/studio-team-vrm-cut-assets").StudioTeamVrmCutResources,
): Status {
  const projection = useMemo(() => {
    const textures = settings.textures.filter((texture) => texture.textureSlot === "baseColor");
    return { settings: { ...settings, textures }, identity: textures.length ? JSON.stringify(textures) : "" };
  }, [settings]);
  const { identity } = projection;
  const readSettings = useEffectEvent(() => projection.settings);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useLayoutEffect(() => {
    setReceipt(null);
    if (!scene || !identity) return;
    const controller = new AbortController();
    const { signal } = controller;
    const paint = readSettings();
    let runtime: StudioVrmTexturePaintRuntime | undefined;
    async function restore(modelScene: Object3D) {
      const [{ createStudioVrmTexturePaintRuntime }, { rehydrateStudioVrmTexturePaintRuntime },
        { planStudioVrmTexturePaintDeviceTier }, { readStudioVrmTexturePaintEnvironmentSignals }] = await Promise.all([
        import("../vrm/studio-vrm-texture-paint-runtime"),
        import("../vrm/studio-vrm-texture-paint-persistence"),
        import("../vrm/studio-vrm-texture-paint-device-tier"),
        import("../vrm/StudioVrmPoserTypes"),
      ]);
      if (signal.aborted) return;
      const plan = planStudioVrmTexturePaintDeviceTier(readStudioVrmTexturePaintEnvironmentSignals());
      runtime = createStudioVrmTexturePaintRuntime(modelScene, plan.runtimeOptions);
      await rehydrateStudioVrmTexturePaintRuntime(runtime, paint, { signal, ...(resources ? { dependencies: { getArtifact: async hash => {
        const artifact = resources.paints.get(hash);
        if (!artifact) throw new Error("작품에서 받은 채색 원본이 없습니다.");
        return artifact;
      } } } : {}) });
      if (!signal.aborted) setReceipt({ scene: modelScene, identity, status: "ready" });
    }
    void restore(scene).catch(() => {
      if (signal.aborted) return;
      runtime?.dispose();
      runtime = undefined;
      setReceipt({ scene, identity, status: "unavailable" });
    });
    return () => {
      controller.abort();
      runtime?.dispose();
    };
  }, [identity, scene, resources]);

  if (!scene) return "loading";
  if (!identity) return "ready";
  return receipt?.scene === scene && receipt.identity === identity ? receipt.status : "loading";
}
