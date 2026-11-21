import { useCallback, useEffect, useRef } from "react";

import { createStudioIntentLazyLoader } from "../../studio-intent-lazy-loader";

import type { StudioLayerLiftComposeWorkerClient } from "../../layer/studio-layer-lift-compose-worker-client";
import type { createStudioLayerLiftLocalForegroundProvider } from "../../layer/studio-layer-lift-local-provider";
import type { StudioLayerLiftOperationRegistry } from "../../layer/studio-layer-lift-operation-context";
import type { StudioLayerLiftReviewPreviewResource } from "../../layer/studio-layer-lift-review-preview";

const layerLiftRuntimeLoader = createStudioIntentLazyLoader(async () => {
  const [compositorMod, localProviderMod, mediaPipeMod, onnxMod, registryMod] = await Promise.all([
    import("../../layer/studio-layer-lift-compose-worker-client"),
    import("../../layer/studio-layer-lift-local-provider"),
    import("../../layer/studio-layer-lift-mediapipe-inference"),
    import("../../layer/studio-layer-lift-onnx-inference"),
    import("../../layer/studio-layer-lift-operation-context"),
  ]);
  return {
    StudioLayerLiftComposeWorkerClient: compositorMod.StudioLayerLiftComposeWorkerClient,
    createStudioLayerLiftLocalForegroundProvider: localProviderMod.createStudioLayerLiftLocalForegroundProvider,
    loadStudioLayerLiftMediaPipeInference: mediaPipeMod.loadStudioLayerLiftMediaPipeInference,
    createStudioLayerLiftOnnxInferenceLoader: onnxMod.createStudioLayerLiftOnnxInferenceLoader,
    StudioLayerLiftOperationRegistry: registryMod.StudioLayerLiftOperationRegistry,
  };
});

/** Owns document-scoped foreground inference and composition resources, loaded on first Layer Lift use. */
export function useStudioLayerLiftRuntime() {
  const studioLayerLiftRegistryRef = useRef<StudioLayerLiftOperationRegistry | null>(null);
  const studioLayerLiftProviderRef = useRef<ReturnType<
    typeof createStudioLayerLiftLocalForegroundProvider
  > | null>(null);
  const studioLayerLiftGeneralProviderRef = useRef<ReturnType<
    typeof createStudioLayerLiftLocalForegroundProvider
  > | null>(null);
  const studioLayerLiftCompositorRef = useRef<StudioLayerLiftComposeWorkerClient | null>(null);
  const studioLayerLiftAbortRef = useRef<AbortController | null>(null);
  const studioLayerLiftRunIdRef = useRef(0);
  const studioLayerLiftPreviewResourceRef = useRef<StudioLayerLiftReviewPreviewResource | null>(null);
  const disposedRef = useRef(false);

  const ensureStudioLayerLiftRuntime = useCallback(async () => {
    if (
      studioLayerLiftRegistryRef.current
      && studioLayerLiftProviderRef.current
      && studioLayerLiftGeneralProviderRef.current
      && studioLayerLiftCompositorRef.current
    ) {
      return;
    }
    const mod = await layerLiftRuntimeLoader.load();
    if (disposedRef.current) return;
    studioLayerLiftRegistryRef.current ??= new mod.StudioLayerLiftOperationRegistry();
    studioLayerLiftProviderRef.current ??= mod.createStudioLayerLiftLocalForegroundProvider({
      loadInference: mod.loadStudioLayerLiftMediaPipeInference,
    });
    studioLayerLiftGeneralProviderRef.current ??= mod.createStudioLayerLiftLocalForegroundProvider({
      subjectKind: "general-subject",
      loadInference: mod.createStudioLayerLiftOnnxInferenceLoader(),
    });
    studioLayerLiftCompositorRef.current ??= new mod.StudioLayerLiftComposeWorkerClient();
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      studioLayerLiftRunIdRef.current += 1;
      studioLayerLiftAbortRef.current?.abort();
      studioLayerLiftAbortRef.current = null;
      studioLayerLiftRegistryRef.current?.invalidate();
      studioLayerLiftRegistryRef.current = null;
      studioLayerLiftCompositorRef.current?.dispose();
      studioLayerLiftCompositorRef.current = null;
      studioLayerLiftProviderRef.current = null;
      studioLayerLiftGeneralProviderRef.current = null;
      studioLayerLiftPreviewResourceRef.current?.revoke();
      studioLayerLiftPreviewResourceRef.current = null;
    };
  }, []);

  return {
    ensureStudioLayerLiftRuntime,
    studioLayerLiftAbortRef,
    studioLayerLiftCompositorRef,
    studioLayerLiftGeneralProviderRef,
    studioLayerLiftPreviewResourceRef,
    studioLayerLiftProviderRef,
    studioLayerLiftRegistryRef,
    studioLayerLiftRunIdRef,
  } as const;
}
