import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { MathUtils } from "three";
import { useStudioBg3dCaptureEnvironmentReporter } from "./studio-bg3d-capture-environment-context";

import {
  mountStudioBg3dProceduralPanorama,
  type StudioBg3dProceduralPanoramaBinding,
} from "./studio-bg3d-procedural-panorama";

import type { StudioBg3dSkyPresetId } from "./studio-bg3d-scene-document";

export interface StudioBg3dScenePanoramaProps {
  readonly presetId: StudioBg3dSkyPresetId;
  readonly rotationDegrees: number;
  /**
   * "hdri"면 scene.environment 소유권을 실제 HDRI 바인딩에 양보하고
   * 배경 소유권은 backgroundOwner가 별도로 정합니다. 기본 "panorama"(현행 동작).
   */
  readonly environmentOwner?: "panorama" | "hdri";
  /** HDRI 배경이 활성화되면 파노라마가 배경 슬롯을 소유하지 않습니다. */
  readonly backgroundOwner?: "panorama" | "hdri";
}

/** Canvas bridge that owns the procedural panorama without recreating it while rotation changes. */
export function StudioBg3dScenePanorama({
  presetId,
  rotationDegrees,
  environmentOwner = "panorama",
  backgroundOwner = "panorama",
}: StudioBg3dScenePanoramaProps) {
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const bindingRef = useRef<StudioBg3dProceduralPanoramaBinding | null>(null);
  const reporter = useStudioBg3dCaptureEnvironmentReporter();

  useEffect(() => {
    // Rotation is applied by the lightweight effect below so slider movement never rebuilds pixels.
    const binding = mountStudioBg3dProceduralPanorama(scene, presetId, 0, {
      ownsEnvironment: environmentOwner === "panorama",
      ownsBackground: backgroundOwner === "panorama",
    });
    bindingRef.current = binding;
    invalidate();
    return () => {
      binding.dispose();
      if (bindingRef.current === binding) bindingRef.current = null;
      invalidate();
    };
  }, [backgroundOwner, environmentOwner, invalidate, presetId, scene]);

  useEffect(() => {
    bindingRef.current?.setRotation(rotationDegrees);
    invalidate();
  }, [backgroundOwner, environmentOwner, invalidate, presetId, rotationDegrees, scene]);

  useEffect(() => {
    if (!reporter || (reporter.intent.environment !== "panorama" && reporter.intent.background !== "panorama")) return undefined;
    const binding = bindingRef.current, expected = reporter.intent;
    const yaw = MathUtils.degToRad(expected.panoramaRotationDegrees);
    const sameRotation = (value: typeof scene.environmentRotation) => value.x === 0 && value.y === yaw && value.z === 0 && value.order === "XYZ";
    const isApplied = () => Boolean(binding && bindingRef.current === binding && binding.isApplied()
      && presetId === expected.skyPresetId
      && (expected.environment !== "panorama" || (environmentOwner === "panorama" && scene.environment === binding.texture && sameRotation(scene.environmentRotation)))
      && (expected.background !== "panorama" || (backgroundOwner === "panorama" && scene.background === binding.texture && sameRotation(scene.backgroundRotation))));
    return reporter.report("panorama", { ready: Promise.resolve(isApplied()), isApplied });
  }, [backgroundOwner, environmentOwner, invalidate, presetId, reporter, scene]);

  return null;
}
