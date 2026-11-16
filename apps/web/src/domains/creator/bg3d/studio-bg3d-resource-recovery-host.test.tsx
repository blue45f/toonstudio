// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { useStudioBg3dResourceRecoveryHost } from "./studio-bg3d-resource-recovery-host";

describe("useStudioBg3dResourceRecoveryHost", () => {
  it("품질 낮춰 다시 열기 실행 시 명시적 WebGPU 엔진 선택을 WebGL2로 덮어쓰지 않고 유지한다", () => {
    const setPreference = vi.fn();
    const setAdaptiveDprScale = vi.fn();
    let sceneDoc = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT;
    const setSceneBaseDocument = vi.fn((updater) => {
      sceneDoc = typeof updater === "function" ? updater(sceneDoc) : updater;
    });

    const { result } = renderHook(() =>
      useStudioBg3dResourceRecoveryHost({
        engineRuntime: {
          preference: "webgpu",
          plan: { status: "failed" },
          setPreference,
        },
        setAdaptiveDprScale,
        setSceneBaseDocument,
      }),
    );

    act(() => {
      result.current.reopenLowQuality();
    });

    expect(setPreference).toHaveBeenCalledOnce();
    expect(setPreference).toHaveBeenCalledWith("webgpu");
    expect(setAdaptiveDprScale).toHaveBeenCalledWith(0.75);
    expect(sceneDoc.render.antialias).toBe(false);
    expect(sceneDoc.render.shadows).toBe(false);
    expect(result.current.lowQualityActive).toBe(true);
  });

  it("품질 낮춰 다시 열기 실행 시 명시적 WebGL2 선택도 그대로 유지해 재시도한다", () => {
    const setPreference = vi.fn();

    const { result } = renderHook(() =>
      useStudioBg3dResourceRecoveryHost({
        engineRuntime: {
          preference: "webgl2",
          plan: { status: "failed" },
          setPreference,
        },
      }),
    );

    act(() => {
      result.current.reopenLowQuality();
    });

    expect(setPreference).toHaveBeenCalledOnce();
    expect(setPreference).toHaveBeenCalledWith("webgl2");
  });

  it("2D 원고로 복귀 실행 시 진행 중인 배치·측정·스냅 도구를 안전하게 정리하고 requestUserClose를 호출한다", () => {
    const cancelCustomModelPlacement = vi.fn();
    const cancelMeasurement = vi.fn();
    const cancelSurfaceSnap = vi.fn();
    const setIsCapturing = vi.fn();
    const requestUserClose = vi.fn();
    const onClose = vi.fn();
    const captureInFlightRef = { current: true };

    const { result } = renderHook(() =>
      useStudioBg3dResourceRecoveryHost({
        placementSessionRef: { current: { phase: "preview" } },
        cancelCustomModelPlacement,
        measurementActiveRef: { current: true },
        cancelMeasurement,
        surfaceSnapArmedRef: { current: true },
        cancelSurfaceSnap,
        captureInFlightRef,
        setIsCapturing,
        requestUserClose,
        onClose,
      }),
    );

    act(() => {
      result.current.returnTo2d();
    });

    expect(cancelCustomModelPlacement).toHaveBeenCalledOnce();
    expect(cancelMeasurement).toHaveBeenCalledOnce();
    expect(cancelSurfaceSnap).toHaveBeenCalledOnce();
    expect(captureInFlightRef.current).toBe(false);
    expect(setIsCapturing).toHaveBeenCalledWith(false);
    expect(requestUserClose).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});
