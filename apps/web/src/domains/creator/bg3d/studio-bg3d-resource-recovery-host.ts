"use no memo";

import { useCallback, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import {
  rememberStudioBg3dCameraBeforeViewportRemount,
  type StudioBg3dPendingCameraTarget,
} from "./studio-bg3d-camera-history-transition";

import type { BgViewportApi } from "./studio-bg3d-camera-application";
import type { StudioBg3dDeviceSignals } from "./studio-bg3d-device-quality";
import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

export interface StudioBg3dResourceRecoveryPorts {
  readonly lowQualityActive: boolean;
  readonly reopenLowQuality: () => void;
  readonly returnTo2d: () => void;
}

export interface StudioBg3dResourceRecoveryHostInput {
  readonly pendingInitialCameraRef?: StudioBg3dPendingCameraTarget;
  readonly viewportApiRef?: { readonly current: Pick<BgViewportApi, "readView"> | null };
  readonly setDeviceSignals?: Dispatch<SetStateAction<StudioBg3dDeviceSignals>>;
  readonly setAdaptiveDprScale?: (next: number) => void;
  readonly setSceneBaseDocument?: Dispatch<SetStateAction<StudioBg3dSceneDocument>>;
  readonly engineRuntime?: {
    readonly plan?: { readonly status?: string };
    readonly setPreference?: (preference: "webgl2") => void;
  };
  readonly setWebXrCanvasGeneration?: Dispatch<SetStateAction<number>>;
  readonly placementSessionRef?: { readonly current: { readonly phase?: string } | null };
  readonly cancelCustomModelPlacement?: (reason: string) => void;
  readonly measurementActiveRef?: { readonly current: boolean };
  readonly cancelMeasurement?: (reason: string) => void;
  readonly surfaceSnapArmedRef?: { readonly current: boolean };
  readonly cancelSurfaceSnap?: () => void;
  readonly captureInFlightRef?: MutableRefObject<boolean>;
  readonly setIsCapturing?: (next: boolean) => void;
  readonly requestUserClose?: () => void;
  readonly onClose?: () => void;
}

function clearCaptureInFlightRef(ref: MutableRefObject<boolean> | undefined): boolean {
  if (!ref?.current) return false;
  ref.current = false;
  return true;
}

export function useStudioBg3dResourceRecoveryHost(
  h: StudioBg3dResourceRecoveryHostInput,
): StudioBg3dResourceRecoveryPorts {
  const [lowQualityActive, setLowQualityActive] = useState(false);
  const {
    pendingInitialCameraRef,
    viewportApiRef,
    setDeviceSignals,
    setAdaptiveDprScale,
    setSceneBaseDocument,
    engineRuntime,
    setWebXrCanvasGeneration,
    placementSessionRef,
    cancelCustomModelPlacement,
    measurementActiveRef,
    cancelMeasurement,
    surfaceSnapArmedRef,
    cancelSurfaceSnap,
    captureInFlightRef,
    setIsCapturing,
    requestUserClose,
    onClose,
  } = h;

  const reopenLowQuality = useCallback(() => {
    if (pendingInitialCameraRef && viewportApiRef) {
      rememberStudioBg3dCameraBeforeViewportRemount(
        viewportApiRef.current ?? null,
        pendingInitialCameraRef,
      );
    }
    setDeviceSignals?.((prev: StudioBg3dDeviceSignals) => ({
      ...prev,
      cssWidth: Math.min(prev?.cssWidth ?? 390, 640),
      cssHeight: Math.min(prev?.cssHeight ?? 844, 844),
      devicePixelRatio: 1,
      pointer: "coarse",
      saveData: true,
      deviceMemoryGb: 2,
      hardwareConcurrency: 2,
    }));
    setAdaptiveDprScale?.(0.75);
    setSceneBaseDocument?.((doc: StudioBg3dSceneDocument) => ({
      ...doc,
      render: {
        ...doc.render,
        antialias: false,
        shadows: false,
      },
    }));
    if (engineRuntime?.plan?.status !== "available") {
      engineRuntime?.setPreference?.("webgl2");
    }
    setLowQualityActive(true);
    setWebXrCanvasGeneration?.((generation: number) => generation + 1);
  }, [
    engineRuntime,
    pendingInitialCameraRef,
    setAdaptiveDprScale,
    setDeviceSignals,
    setSceneBaseDocument,
    setWebXrCanvasGeneration,
    viewportApiRef,
  ]);

  const returnTo2d = useCallback(() => {
    if (placementSessionRef?.current?.phase === "preview") {
      cancelCustomModelPlacement?.("2D 원고로 복귀해 모델 배치 미리보기를 닫았습니다.");
    }
    if (measurementActiveRef?.current) {
      cancelMeasurement?.("2D 원고로 복귀해 줄자 측정을 종료했습니다.");
    }
    if (surfaceSnapArmedRef?.current) {
      cancelSurfaceSnap?.();
    }
    if (clearCaptureInFlightRef(captureInFlightRef)) {
      setIsCapturing?.(false);
    }
    if (typeof requestUserClose === "function") {
      requestUserClose();
      return;
    }
    onClose?.();
  }, [
    cancelCustomModelPlacement,
    cancelMeasurement,
    cancelSurfaceSnap,
    captureInFlightRef,
    measurementActiveRef,
    onClose,
    placementSessionRef,
    requestUserClose,
    setIsCapturing,
    surfaceSnapArmedRef,
  ]);

  return {
    lowQualityActive,
    reopenLowQuality,
    returnTo2d,
  };
}
