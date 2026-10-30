import { useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { MathUtils } from "three";
import { useStudioBg3dCaptureEnvironmentReporter } from "./studio-bg3d-capture-environment-context";

import {
  getStudioBg3dHdriEnvironmentAsset,
  resolveStudioBg3dHdriEnvironmentLocalUrl,
  type StudioBg3dHdriFileTier,
} from "./studio-bg3d-hdri-environment-assets";
import { mountStudioBg3dHdriEnvironment } from "./studio-bg3d-hdri-environment-binding";
import { getStudioBg3dWebglRecoverySnapshot, STUDIO_BG3D_WEBGL_RECOVERY_EVENT } from "./studio-bg3d-webgl-context-recovery";

import type { StudioBg3dEnvironmentSettings } from "./studio-bg3d-hdri-environment";
import type { StudioBg3dHdriEnvironmentBinding } from "./studio-bg3d-hdri-environment-binding";

export interface StudioBg3dHdriEnvironmentProps {
  readonly settings: StudioBg3dEnvironmentSettings;
  /** 품질 프로파일 연동 지점. 데스크톱 2k / 모바일 1k를 기본 권장으로 둡니다. */
  readonly fileTier?: StudioBg3dHdriFileTier;
  /** AR처럼 환경 슬롯을 사용하지 않는 표시에서도 요청 권위는 항상 마운트한다. */
  readonly enabled?: boolean;
}

/**
 * Canvas bridge that owns the real-HDRI environment without recreating it while
 * intensity or rotation changes. StudioBg3dScenePanorama와 같은 브리지 규약입니다:
 * 에셋(URL)이 바뀔 때만 다시 마운트하고, 회전·세기는 바인딩 메서드로만 반영합니다.
 *
 * 실제 renderer에 맞는 PMREM factory를 사용한다. 실패는 binding snapshot에 보존하며,
 * 다른 backend·조명·해상도로 자동 전환하지 않는다. 실제 GPU 결과는 별도로 검증한다.
 */
export function StudioBg3dHdriEnvironment({
  settings,
  fileTier = "2k",
  enabled = true,
}: StudioBg3dHdriEnvironmentProps) {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const bindingRef = useRef<StudioBg3dHdriEnvironmentBinding | null>(null);
  const [contextGeneration, setContextGeneration] = useState(0);
  const reporter = useStudioBg3dCaptureEnvironmentReporter();

  const asset =
    enabled && settings.source === "hdri" ? getStudioBg3dHdriEnvironmentAsset(settings.assetId) : undefined;
  const url = asset ? resolveStudioBg3dHdriEnvironmentLocalUrl(asset, fileTier) : null;
  const useAsBackground = settings.useAsBackground;

  useEffect(() => {
    if (!("isWebGLRenderer" in gl) || gl.isWebGLRenderer !== true) return undefined;
    const canvas = gl.domElement;
    if (!canvas?.addEventListener) return undefined;
    let active = true, lastRestored = getStudioBg3dWebglRecoverySnapshot(canvas);
    // CubeUV render target에는 복구할 CPU 픽셀이 없으므로 같은 요청의 PMREM을 다시 준비한다.
    const restored = () => {
      if (!active) return;
      const snapshot = getStudioBg3dWebglRecoverySnapshot(canvas);
      if (snapshot && (snapshot.phase !== "restored" || snapshot === lastRestored)) return;
      lastRestored = snapshot;
      setContextGeneration((generation) => generation + 1);
    };
    const lost = () => { if (active) bindingRef.current?.dispose(); };
    const notice = (event: Event) => {
      if (!active || !(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (!detail || typeof detail !== "object" || !("owner" in detail) || detail.owner !== canvas) return;
      const snapshot = getStudioBg3dWebglRecoverySnapshot(canvas);
      if (snapshot?.phase === "restored") restored();
      else if (snapshot && snapshot.phase !== "healthy") lost();
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    window.addEventListener(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, notice);
    return () => {
      active = false;
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      window.removeEventListener(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, notice);
    };
  }, [gl]);

  useEffect(() => {
    if (!url) return undefined;
    if ("isWebGLRenderer" in gl && gl.isWebGLRenderer === true) {
      const recovery = getStudioBg3dWebglRecoverySnapshot(gl.domElement);
      if (recovery && recovery.phase !== "healthy" && recovery.phase !== "restored") return undefined;
    }
    const binding = mountStudioBg3dHdriEnvironment(scene, gl, {
      url,
      // intensity/rotationDegrees는 아래 effect가 전담합니다(StudioBg3dScenePanorama와 같은
      // 브리지 규약). 마운트에는 문서 기본값(1·0)을 넣고 실제 값은 마운트 직후 도는 아래
      // effect가 바인딩 세터로 반영합니다. 세터는 로드가 끝나기 전이면 값을 보관해 뒀다가
      // settle 시점에 적용하므로, 비동기 로드가 끝나도 최종 상태는 같습니다.
      intensity: 1,
      rotationDegrees: 0,
      useAsBackground,
      onSettled: () => invalidate(),
    });
    bindingRef.current = binding;
    return () => {
      binding.dispose();
      if (bindingRef.current === binding) bindingRef.current = null;
      invalidate();
    };
  }, [contextGeneration, gl, invalidate, scene, url, useAsBackground]);

  useEffect(() => {
    bindingRef.current?.setRotation(settings.rotationDegrees);
    bindingRef.current?.setIntensity(settings.intensity);
    invalidate();
  }, [contextGeneration, gl, invalidate, scene, settings.intensity, settings.rotationDegrees, url, useAsBackground]);

  useEffect(() => {
    if (!reporter || reporter.intent.environment !== "hdri") return undefined;
    const binding = bindingRef.current, expected = reporter.intent.settings;
    if (!binding || !enabled || !url || expected.source !== settings.source || expected.assetId !== settings.assetId
      || reporter.intent.fileTier !== fileTier || reporter.intent.hdriUrl !== url || expected.useAsBackground !== useAsBackground) {
      return reporter.report("hdri", { ready: Promise.resolve(false), isApplied: () => false });
    }
    const yaw = MathUtils.degToRad(expected.rotationDegrees);
    const sameRotation = (value: typeof scene.environmentRotation) => value.x === 0 && value.y === yaw && value.z === 0 && value.order === "XYZ";
    let background = scene.background;
    const isApplied = () => {
      const snapshot = binding.getSnapshot();
      return bindingRef.current === binding && snapshot.status === "applied"
        && !snapshot.diagnostics.some((diagnostic) => diagnostic.phase === "update")
        && binding.texture !== null && scene.environment === binding.texture
        && scene.environmentIntensity === expected.intensity && sameRotation(scene.environmentRotation)
        && (!expected.useAsBackground || (background !== null && scene.background === background
          && scene.backgroundIntensity === expected.intensity && sameRotation(scene.backgroundRotation)));
    };
    // binding의 원래 ready를 관찰한다. background 포인터는 actual owner 성공 후에만 기록한다.
    const ready = binding.ready.then((applied) => {
      if (!applied) return false;
      background = scene.background;
      return isApplied();
    });
    return reporter.report("hdri", { ready, isApplied });
  }, [contextGeneration, enabled, fileTier, invalidate, reporter, scene, settings.assetId, settings.source, url, useAsBackground]);

  return null;
}
