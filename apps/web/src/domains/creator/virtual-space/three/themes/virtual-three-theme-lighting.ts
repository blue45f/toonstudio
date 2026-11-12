import * as THREE from "three";

import { kelvinToLinearRgb } from "../../../scene-3d/studio-3d-blender-eevee-lighting-rig";
import type { StudioVirtualSpaceWorldManifest } from "../../studio-virtual-space-world-manifest";
import { STUDIO_THREE_SCALE } from "../studio-virtual-space-three-scene";
import type { VirtualThreeTheme } from "./virtual-three-theme-types";

export interface VirtualThreeThemeLights {
  readonly ambient: THREE.HemisphereLight;
  readonly key: THREE.DirectionalLight;
  readonly fill: THREE.DirectionalLight;
}

export interface VirtualThreeThemeLightingStateInput {
  readonly scene: THREE.Scene;
  readonly lights: VirtualThreeThemeLights;
  readonly renderer: Pick<THREE.WebGLRenderer, "toneMappingExposure">;
}

function captureLight(light: THREE.Light): () => void {
  const color = light.color.clone(), intensity = light.intensity, castShadow = light.castShadow;
  const position = light.position.clone(), quaternion = light.quaternion.clone(), scale = light.scale.clone();
  const visible = light.visible;
  return () => {
    light.color.copy(color); light.intensity = intensity; light.castShadow = castShadow;
    light.position.copy(position); light.quaternion.copy(quaternion); light.scale.copy(scale); light.visible = visible;
    light.updateMatrixWorld(true);
  };
}
function captureTarget(light: THREE.DirectionalLight): () => void {
  const target = light.target, position = target.position.clone(), quaternion = target.quaternion.clone(), scale = target.scale.clone();
  return () => {
    light.target = target;
    target.position.copy(position); target.quaternion.copy(quaternion); target.scale.copy(scale);
    target.updateMatrixWorld(true);
  };
}

/**
 * commit 직전 실제 HUD override까지 캡처한다. texture 참조는 복제·해제하지 않는다.
 * 호출자는 HDRI의 활성 preset을 먼저 복구한 뒤 이 복원 함수를 호출한다.
 */
export function captureVirtualThreeThemeLightingState({ scene, lights, renderer }: VirtualThreeThemeLightingStateInput): () => void {
  const restoreLights = [captureLight(lights.ambient), captureLight(lights.key), captureLight(lights.fill)];
  const restoreTargets = [captureTarget(lights.key), captureTarget(lights.fill)];
  const groundColor = lights.ambient.groundColor.clone();
  const environment = scene.environment, environmentIntensity = scene.environmentIntensity, environmentRotation = scene.environmentRotation.clone();
  const background = scene.background instanceof THREE.Color ? scene.background.clone() : scene.background;
  const backgroundIntensity = scene.backgroundIntensity, backgroundBlurriness = scene.backgroundBlurriness, backgroundRotation = scene.backgroundRotation.clone();
  const fog = scene.fog?.clone() ?? null;
  const exposure = renderer.toneMappingExposure;
  return () => {
    for (const restore of restoreTargets) restore();
    for (const restore of restoreLights) restore();
    lights.ambient.groundColor.copy(groundColor);
    scene.environment = environment; scene.environmentIntensity = environmentIntensity; scene.environmentRotation.copy(environmentRotation);
    scene.background = background instanceof THREE.Color ? background.clone() : background;
    scene.backgroundIntensity = backgroundIntensity; scene.backgroundBlurriness = backgroundBlurriness; scene.backgroundRotation.copy(backgroundRotation);
    scene.fog = fog?.clone() ?? null;
    renderer.toneMappingExposure = exposure;
  };
}

/** lux는 디자이너 상대값이다. 기존 노출에 맞춘 정규화이며 물리 광량 실측·기기 보정값이 아니다. */
export const VIRTUAL_THREE_THEME_LIGHTING_NORMALIZATION = Object.freeze({
  keyReferenceLux: 500,
  keyReferenceIntensity: 1.42,
  ambientReferenceLux: 120,
  ambientReferenceIntensity: 1.04,
  fillReferenceLux: 200,
  fillReferenceIntensity: 0.6,
  lightDistanceMeters: 64,
  fillElevationDegrees: 30,
  ambientGroundFactor: 0.35,
});

function requireLux(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new TypeError("3D 테마 광량은 유한한 0 이상 상대값이어야 합니다.");
}
function requireTemperature(value: number): void {
  if (!Number.isFinite(value) || value < 1000 || value > 12000) throw new TypeError("3D 테마 색온도는 1000~12000K 범위여야 합니다.");
}
function lightPosition(center: THREE.Vector3, azimuth: number, elevation: number): THREE.Vector3 {
  const yaw = THREE.MathUtils.degToRad(azimuth % 360);
  const pitch = THREE.MathUtils.degToRad(elevation);
  const distance = VIRTUAL_THREE_THEME_LIGHTING_NORMALIZATION.lightDistanceMeters;
  const horizontal = Math.cos(pitch) * distance;
  return new THREE.Vector3(center.x + Math.sin(yaw) * horizontal, center.y + Math.sin(pitch) * distance, center.z + Math.cos(yaw) * horizontal);
}

/**
 * 기존 preset 적용 직후 호출한다. 광원·target의 생성/scene 연결/해제 권위는 Canvas에 남긴다.
 * baseline은 preset의 색·광량을 보존하고 기존 key 위치/target으로 복귀한다. fill의 기본값은 0이며 Canvas는 기존 preset 값을 명시한다.
 */
export function applyVirtualThreeThemeLighting(
  theme: VirtualThreeTheme,
  manifest: Pick<StudioVirtualSpaceWorldManifest, "width" | "height">,
  lights: VirtualThreeThemeLights,
  baselineFillIntensity = 0,
): void {
  if (lights.key === lights.fill) throw new TypeError("3D 테마 key와 fill은 독립 광원이어야 합니다.");
  if (theme.kind === "preserved-baseline") {
    requireLux(baselineFillIntensity);
    lights.key.position.set(36, 48, 28);
    lights.key.target.position.set(0, 0, 0);
    lights.key.target.updateMatrixWorld(true);
    lights.fill.intensity = baselineFillIntensity;
    lights.fill.castShadow = false;
    return;
  }
  const { ambientIlluminanceLux, key, fill } = theme.lighting;
  for (const lux of [ambientIlluminanceLux, key.illuminanceLux, fill.illuminanceLux]) requireLux(lux);
  requireTemperature(key.temperatureKelvin);
  requireTemperature(fill.temperatureKelvin);
  if (!Number.isFinite(key.azimuthDegrees) || !Number.isFinite(key.elevationDegrees) || key.elevationDegrees < -90 || key.elevationDegrees > 90) {
    throw new TypeError("3D 테마 조명 방위·고도가 유효하지 않습니다.");
  }
  if (![manifest.width, manifest.height].every((value) => Number.isFinite(value) && value > 0)) {
    throw new TypeError("3D 테마 조명의 정본 월드 크기가 유효하지 않습니다.");
  }
  // 모든 입력을 먼저 검사해 잘못된 recipe가 기존 광원을 일부만 바꾸지 않게 한다.
  const center = new THREE.Vector3(manifest.width * STUDIO_THREE_SCALE / 2, 0, manifest.height * STUDIO_THREE_SCALE / 2);
  const keyColor = new THREE.Color().setRGB(...kelvinToLinearRgb(key.temperatureKelvin), THREE.LinearSRGBColorSpace);
  const fillColor = new THREE.Color().setRGB(...kelvinToLinearRgb(fill.temperatureKelvin), THREE.LinearSRGBColorSpace);
  const keyPosition = lightPosition(center, key.azimuthDegrees, key.elevationDegrees);
  const fillPosition = lightPosition(center, key.azimuthDegrees % 360 + 180, VIRTUAL_THREE_THEME_LIGHTING_NORMALIZATION.fillElevationDegrees);
  const policy = VIRTUAL_THREE_THEME_LIGHTING_NORMALIZATION;
  lights.ambient.intensity = ambientIlluminanceLux / policy.ambientReferenceLux * policy.ambientReferenceIntensity;
  // ambient 자체에는 색온도 필드가 없으므로 동일한 fill 색과 명시한 ground 비율을 사용한다.
  lights.ambient.color.copy(fillColor);
  lights.ambient.groundColor.copy(fillColor).multiplyScalar(policy.ambientGroundFactor);
  lights.key.intensity = key.illuminanceLux / policy.keyReferenceLux * policy.keyReferenceIntensity;
  lights.key.color.copy(keyColor);
  lights.key.position.copy(keyPosition);
  lights.key.target.position.copy(center);
  lights.key.target.updateMatrixWorld(true);
  lights.fill.intensity = fill.illuminanceLux / policy.fillReferenceLux * policy.fillReferenceIntensity;
  lights.fill.color.copy(fillColor);
  lights.fill.position.copy(fillPosition);
  lights.fill.target.position.copy(center);
  lights.fill.target.updateMatrixWorld(true);
  lights.fill.castShadow = false;
}
