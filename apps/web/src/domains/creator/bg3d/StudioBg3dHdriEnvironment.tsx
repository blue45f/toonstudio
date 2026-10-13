import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

import {
  getStudioBg3dHdriEnvironmentAsset,
  resolveStudioBg3dHdriEnvironmentLocalUrl,
  type StudioBg3dHdriFileTier,
} from "./studio-bg3d-hdri-environment-assets";
import { mountStudioBg3dHdriEnvironment } from "./studio-bg3d-hdri-environment-binding";

import type { StudioBg3dEnvironmentSettings } from "./studio-bg3d-hdri-environment";
import type { StudioBg3dHdriEnvironmentBinding } from "./studio-bg3d-hdri-environment-binding";

export interface StudioBg3dHdriEnvironmentProps {
  readonly settings: StudioBg3dEnvironmentSettings;
  /** 품질 프로파일 연동 지점. 데스크톱 2k / 모바일 1k를 기본 권장으로 둡니다. */
  readonly fileTier?: StudioBg3dHdriFileTier;
}

/**
 * Canvas bridge that owns the real-HDRI environment without recreating it while
 * intensity or rotation changes. StudioBg3dScenePanorama와 같은 브리지 규약입니다:
 * 에셋(URL)이 바뀔 때만 다시 마운트하고, 회전·세기는 바인딩 메서드로만 반영합니다.
 *
 * 렌더러 주의: useThree의 gl은 엔진 선택에 따라 WebGPU 렌더러일 수 있습니다.
 * 바인딩은 PMREM 변환 실패를 throw 없이 미적용으로 처리하므로, WebGPU에서 변환이
 * 성립하지 않아도 절차 파노라마 환경이 그대로 남습니다(통합 시 실측 검증 필요).
 */
export function StudioBg3dHdriEnvironment({
  settings,
  fileTier = "2k",
}: StudioBg3dHdriEnvironmentProps) {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const bindingRef = useRef<StudioBg3dHdriEnvironmentBinding | null>(null);

  const asset =
    settings.source === "hdri" ? getStudioBg3dHdriEnvironmentAsset(settings.assetId) : undefined;
  const url = asset ? resolveStudioBg3dHdriEnvironmentLocalUrl(asset, fileTier) : null;
  const useAsBackground = settings.useAsBackground;

  useEffect(() => {
    if (!url) return undefined;
    const binding = mountStudioBg3dHdriEnvironment(scene, gl as unknown as THREE.WebGLRenderer, {
      url,
      intensity: settings.intensity,
      rotationDegrees: settings.rotationDegrees,
      useAsBackground,
      onSettled: () => invalidate(),
    });
    bindingRef.current = binding;
    return () => {
      binding.dispose();
      if (bindingRef.current === binding) bindingRef.current = null;
      invalidate();
    };
    // intensity/rotationDegrees는 아래 effect가 전담하므로 마운트 의존성에서 제외합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, invalidate, scene, url, useAsBackground]);

  useEffect(() => {
    bindingRef.current?.setRotation(settings.rotationDegrees);
    bindingRef.current?.setIntensity(settings.intensity);
    invalidate();
  }, [invalidate, settings.intensity, settings.rotationDegrees]);

  return null;
}
