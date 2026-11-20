import { useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioVirtualSpaceBootRecoveryCard } from "../StudioVirtualSpaceBootRecoveryCard";
import { applyStudioVirtualStageSearch, writeStudioVirtualPreferredEngineMode } from "../office2d/studio-virtual-space-stage-mode";
import { useStudioPrefersReducedMotion } from "../studio-virtual-space-reduced-motion";
import type { ProjectedOverlayItem, StudioThreeLightingPreset } from "./studio-virtual-space-three-dioramas";
import { readStoredStudioThreeLightingPreset, writeStoredStudioThreeLightingPreset } from "./studio-virtual-space-three-motion";
import {
  collectStudioVirtualThreeHostResourceSignals,
  isStudioVirtualThreeLowSpecConstrained,
  type StudioVirtualThreeQualityMode,
} from "./studio-virtual-space-three-renderer-recovery";
import {
  mountStudioThreeStageRuntime,
  type StudioThreeResumePose,
  type StudioThreeStageRuntimeHandle,
} from "./studio-virtual-space-three-runtime-host";
import type { StudioThreeCameraMode, StudioVirtualSpaceThreeStageProps } from "./studio-virtual-space-three-stage-props";
import { studioThreeThemeLightingPreset } from "./studio-virtual-space-three-surface-art";
import { StudioVirtualSpaceThreeHud } from "./StudioVirtualSpaceThreeHud";
import { StudioVirtualSpaceThreeRendererRecoveryCard } from "./StudioVirtualSpaceThreeRendererRecoveryCard";
import { DEFAULT_VIRTUAL_THREE_THEME } from "./themes/virtual-three-theme-catalog";

/**
 * Three.js + Hero 3D BG 6씬(8노드/4노드 컷어웨이) + Hero VRM 1.0 8종 + 3모드 카메라 + 라이브 리뷰 스크린
 * 기반 3D 가상 스튜디오 렌더러. 기존 StudioVirtualSpaceEngineBridge 및 2D 월드 좌표계와 1:1 호환된다.
 */
export function StudioVirtualSpaceThreeCanvas({
  manifest, snapshot, bridge, selfDisplayName, theme, themeRequestRevision,
  onThemePreviewChange, onRuntimeMetrics, onNpcInteract, onLocalState, onInteract,
  onNearbyInteractionChange, onPortal, onZoneChange, onNearbyNpcsChange, onEngineStatusChange, onReturnTo2d,
  decorations, placedFixtures, onBuildPlacementEvent, seatedActors, onPeerSelect, onGhostModeChange,
  onStuckChange, lightingState, cameraMode: controlledCameraMode, onCameraModeChange, visemeByActorId,
  liveScreenStream, onPhotoCaptureToCut, proximityRadiusPx, ghostMode: controlledGhostMode,
}: StudioVirtualSpaceThreeStageProps) {
  const bt = useBilingual("StudioVirtualSpaceThreeCanvas");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const [overlays, setOverlays] = useState<readonly ProjectedOverlayItem[]>([]);
  const [assetFailureCount, setAssetFailureCount] = useState(0);
  const [bootFailureReason, setBootFailureReason] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [qualityMode, setQualityMode] = useState<StudioVirtualThreeQualityMode>("standard");
  const [lowSpecDismissed, setLowSpecDismissed] = useState(false);
  const [lowSpecDetected] = useState(() => isStudioVirtualThreeLowSpecConstrained(collectStudioVirtualThreeHostResourceSignals()));
  const [retryCount, setRetryCount] = useState(0);
  const [lightingPreset, setLightingPreset] = useState<StudioThreeLightingPreset>(() => readStoredStudioThreeLightingPreset(studioThreeThemeLightingPreset(DEFAULT_VIRTUAL_THREE_THEME, manifest)));
  const [localCameraMode, setLocalCameraMode] = useState<StudioThreeCameraMode>(controlledCameraMode ?? "quarter");
  const [localGhostMode, setLocalGhostMode] = useState<boolean>(Boolean(controlledGhostMode));
  const [cutawayHiddenCount, setCutawayHiddenCount] = useState(0);

  const activeCameraMode = controlledCameraMode ?? localCameraMode;
  const activeGhostMode = controlledGhostMode ?? localGhostMode;

  const resumePoseRef = useRef<StudioThreeResumePose | null>(null);
  const runtimeRef = useRef<StudioThreeStageRuntimeHandle | null>(null);
  const reducedMotion = useStudioPrefersReducedMotion();

  const latestRef = useRef({
    theme, snapshot, selfDisplayName, reducedMotion,
    cameraMode: activeCameraMode, ghostMode: activeGhostMode,
    seatedActors, lightingState, visemeByActorId, liveScreenStream,
    proximityRadiusPx, decorations, placedFixtures, bt,
    onReturnTo2d, onBuildPlacementEvent, onGhostModeChange, onCameraModeChange,
    callbacks: {
      onThemePreviewChange, onRuntimeMetrics, onNpcInteract, onLocalState, onInteract,
      onNearbyInteractionChange, onPortal, onZoneChange, onNearbyNpcsChange,
      onEngineStatusChange, onPeerSelect, onStuckChange, onPhotoCaptureToCut,
    },
  });
  latestRef.current = {
    theme, snapshot, selfDisplayName, reducedMotion,
    cameraMode: activeCameraMode, ghostMode: activeGhostMode,
    seatedActors, lightingState, visemeByActorId, liveScreenStream,
    proximityRadiusPx, decorations, placedFixtures, bt,
    onReturnTo2d, onBuildPlacementEvent, onGhostModeChange, onCameraModeChange,
    callbacks: {
      onThemePreviewChange, onRuntimeMetrics, onNpcInteract, onLocalState, onInteract,
      onNearbyInteractionChange, onPortal, onZoneChange, onNearbyNpcsChange,
      onEngineStatusChange, onPeerSelect, onStuckChange, onPhotoCaptureToCut,
    },
  };

  const setCameraMode = (nextMode: StudioThreeCameraMode) => {
    setLocalCameraMode(nextMode);
    latestRef.current.cameraMode = nextMode;
    latestRef.current.onCameraModeChange?.(nextMode);
  };

  const toggleGhostMode = () => {
    const next = !latestRef.current.ghostMode;
    setLocalGhostMode(next);
    latestRef.current.ghostMode = next;
    latestRef.current.onGhostModeChange?.(next);
  };

  const handleReturnTo2d = () => {
    if (latestRef.current.onReturnTo2d) {
      latestRef.current.onReturnTo2d();
      return;
    }
    writeStudioVirtualPreferredEngineMode("2d");
    if (typeof window !== "undefined") {
      const nextSearch = applyStudioVirtualStageSearch(window.location.search, "2d");
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${nextSearch}`);
    }
  };
  const handleReopenLowQuality = () => {
    setContextLost(false);
    setBootFailureReason(null);
    setQualityMode("low");
    setRetryCount((count) => count + 1);
  };

  useEffect(() => {
    runtimeRef.current?.selectTheme(theme);
  }, [theme, themeRequestRevision]);

  useEffect(() => {
    runtimeRef.current?.reloadActorVrm("self", snapshot.self.avatarIndex);
  }, [snapshot.self.avatarIndex]);

  useEffect(() => {
    runtimeRef.current?.syncDecorations();
  }, [decorations, placedFixtures]);

  useEffect(() => {
    runtimeRef.current?.applyDynamicLighting();
  }, [lightingState]);

  useEffect(() => {
    const container = containerRef.current;
    const canvasMount = canvasMountRef.current;
    if (!container || !canvasMount) return undefined;

    const handle = mountStudioThreeStageRuntime({
      container,
      canvasMount,
      manifest,
      bridge,
      qualityMode,
      resumePoseRef,
      getLatest: () => latestRef.current,
      actions: {
        setOverlays,
        incrementAssetFailure: () => setAssetFailureCount((count) => count + 1),
        resetAssetFailure: () => setAssetFailureCount(0),
        setBootFailureReason,
        setContextLost,
        setLightingPreset,
        setCutawayHiddenCount,
        setCameraMode,
        toggleGhostMode,
      },
    });
    runtimeRef.current = handle;

    return () => {
      runtimeRef.current = null;
      handle?.dispose();
    };
  }, [bridge, manifest, qualityMode, retryCount]);

  return (
    <div
      ref={containerRef}
      className="studio-vspace-three-stage"
      data-three-stage={bootFailureReason ? "error" : contextLost ? "context-lost" : "active"}
      data-three-quality-mode={qualityMode}
      data-three-camera-mode={activeCameraMode}
      data-three-ghost-mode={activeGhostMode ? "true" : "false"}
      aria-label={bt("3D 가상 스튜디오 공간", "3D Virtual Studio Space")}
      style={{ position: "relative", width: "100%", height: "100%", outline: "none" }}
    >
      <div ref={canvasMountRef} className="studio-vspace-three-canvas-mount" style={{ position: "absolute", inset: 0, zIndex: 1 }} />
      {bootFailureReason ? (
        <StudioVirtualSpaceBootRecoveryCard
          failureReason={bootFailureReason}
          onRetry={() => setRetryCount((count) => count + 1)}
          onReopenLowQuality={handleReopenLowQuality}
          onReturnTo2d={handleReturnTo2d}
        />
      ) : (
        <>
          <StudioVirtualSpaceThreeRendererRecoveryCard
            contextLost={contextLost}
            lowSpecDetected={lowSpecDetected}
            lowSpecDismissed={lowSpecDismissed}
            qualityMode={qualityMode}
            onReopenLowQuality={handleReopenLowQuality}
            onReturnTo2d={handleReturnTo2d}
            onDismissLowSpec={() => setLowSpecDismissed(true)}
          />
          {!contextLost ? (
            <StudioVirtualSpaceThreeHud
              overlays={overlays}
              assetFailureCount={assetFailureCount}
              lightingPreset={lightingPreset}
              cameraMode={activeCameraMode}
              onCameraModeChange={setCameraMode}
              cutawayHiddenCount={cutawayHiddenCount}
              ghostMode={activeGhostMode}
              onToggleGhostMode={toggleGhostMode}
              onCapturePhotoToCut={() => runtimeRef.current?.capturePhoto()}
              onLightingPresetChange={(preset) => {
                writeStoredStudioThreeLightingPreset(preset);
                setLightingPreset(preset);
                runtimeRef.current?.applyLighting(preset);
              }}
              onResetCamera={() => runtimeRef.current?.resetCamera()}
              onTriggerTarget={(kind, targetId) => runtimeRef.current?.triggerOverlayTarget(kind, targetId)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
