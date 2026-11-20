import * as THREE from "three";

import { kelvinToLinearRgb } from "../../scene-3d/studio-3d-blender-eevee-lighting-rig";
import type { StudioThreeLightingState } from "./studio-virtual-space-three-stage-props";

export interface StudioThreeComputedLighting {
  readonly timeOfDayHours: number;
  readonly interiorDimmer: number;
  readonly colorTemperatureK: number;
  readonly sunElevationDeg: number;
  readonly sunAzimuthDeg: number;
  readonly sunPosition: readonly [number, number, number];
  readonly keyIntensity: number;
  readonly hemiIntensity: number;
  readonly fillIntensity: number;
  readonly interiorPointIntensity: number;
  readonly keyColorLinear: readonly [number, number, number];
  readonly skyColorHex: number;
  readonly groundColorHex: number;
  readonly backgroundColorHex: number;
  readonly exposure: number;
  readonly isNight: boolean;
}

export interface StudioThreeDynamicLightingTargets {
  readonly scene: THREE.Scene;
  readonly renderer: Pick<THREE.WebGLRenderer, "toneMappingExposure">;
  readonly hemiLight: THREE.HemisphereLight;
  readonly dirLight: THREE.DirectionalLight;
  readonly fillLight?: THREE.DirectionalLight;
  readonly interiorPointLight?: THREE.PointLight;
  readonly center?: THREE.Vector3;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function wrapHours(hours: number): number {
  if (!Number.isFinite(hours)) return 14;
  return ((hours % 24) + 24) % 24;
}

function autoColorTemperatureK(hours: number, sunFactor: number): number {
  if (sunFactor <= 0.05) return 7600; // 달빛 야간 톤
  if (hours < 7.5 || hours > 17.0) {
    // 일출·골든아워 따뜻한 색온도
    return Math.round(2800 + clamp(sunFactor, 0, 1) * 1600);
  }
  return Math.round(5200 + clamp(sunFactor, 0, 1) * 1100);
}

/**
 * `timeOfDayHours`(0~24h), `interiorDimmer`(0~1), `colorTemperatureK`로부터
 * 태양 고도·방위·색온도·실내 보조광 파라미터를 순수 계산한다.
 */
export function computeStudioThreeLightingParameters(
  state: StudioThreeLightingState,
): StudioThreeComputedLighting {
  const timeOfDayHours = wrapHours(state.timeOfDayHours);
  const interiorDimmer = clamp(state.interiorDimmer, 0, 1);

  // 06:00 일출 → 12:00 정오(고도 72°) → 18:00 일몰 → 자정(-45°)
  const dayRadians = ((timeOfDayHours - 6) / 24) * Math.PI * 2;
  const sinSolar = Math.sin(dayRadians);
  const sunElevationDeg = Number((sinSolar * 72).toFixed(2));
  const sunAzimuthDeg = Number((((timeOfDayHours - 6) / 12) * 180 - 90).toFixed(2));
  const sunFactor = clamp(sinSolar, 0, 1);
  const isNight = sunFactor < 0.08;

  const computedKelvin = autoColorTemperatureK(timeOfDayHours, sunFactor);
  const colorTemperatureK = state.colorTemperatureK !== undefined && Number.isFinite(state.colorTemperatureK)
    ? clamp(state.colorTemperatureK, 1800, 10000)
    : computedKelvin;
  const keyColorLinear = kelvinToLinearRgb(colorTemperatureK);

  const effectiveElevationRad = THREE.MathUtils.degToRad(Math.max(12, isNight ? 32 : sunElevationDeg));
  const azimuthRad = THREE.MathUtils.degToRad(sunAzimuthDeg);
  const radius = 56;
  const horiz = Math.cos(effectiveElevationRad) * radius;
  const sunPosition: readonly [number, number, number] = [
    Number((Math.sin(azimuthRad) * horiz).toFixed(3)),
    Number((Math.sin(effectiveElevationRad) * radius).toFixed(3)),
    Number((Math.cos(azimuthRad) * horiz).toFixed(3)),
  ];

  const keyIntensity = Number((isNight ? 0.36 + interiorDimmer * 0.24 : 0.45 + sunFactor * 1.15).toFixed(3));
  const hemiIntensity = Number(((isNight ? 0.34 : 0.55 + sunFactor * 0.45) + interiorDimmer * 0.35).toFixed(3));
  const fillIntensity = Number((0.18 + interiorDimmer * 0.65).toFixed(3));
  const interiorPointIntensity = Number((interiorDimmer * 2.4).toFixed(3));
  const exposure = Number((0.86 + sunFactor * 0.14 + interiorDimmer * 0.08).toFixed(3));

  const skyColorHex = isNight ? 0x5c73a8 : timeOfDayHours < 7.5 || timeOfDayHours > 17 ? 0xffd7a8 : 0xf4f8ff;
  const groundColorHex = isNight ? 0x1b2038 : 0x7c8699;
  const backgroundColorHex = isNight ? 0x10172b : timeOfDayHours < 7.5 || timeOfDayHours > 17 ? 0x3b3348 : 0xcbd8e8;

  return {
    timeOfDayHours,
    interiorDimmer,
    colorTemperatureK,
    sunElevationDeg,
    sunAzimuthDeg,
    sunPosition,
    keyIntensity,
    hemiIntensity,
    fillIntensity,
    interiorPointIntensity,
    keyColorLinear,
    skyColorHex,
    groundColorHex,
    backgroundColorHex,
    exposure,
    isNight,
  };
}

/** 계산된 시간대·실내 조광 상태를 실제 Three.js 씬 광원과 노출에 반영한다. */
export function applyStudioThreeLightingState(
  state: StudioThreeLightingState,
  targets: StudioThreeDynamicLightingTargets,
): StudioThreeComputedLighting {
  const computed = computeStudioThreeLightingParameters(state);
  const center = targets.center ?? new THREE.Vector3(0, 0, 0);

  targets.dirLight.color.setRGB(
    computed.keyColorLinear[0],
    computed.keyColorLinear[1],
    computed.keyColorLinear[2],
    THREE.LinearSRGBColorSpace,
  );
  targets.dirLight.intensity = computed.keyIntensity;
  targets.dirLight.position.set(
    center.x + computed.sunPosition[0],
    center.y + computed.sunPosition[1],
    center.z + computed.sunPosition[2],
  );
  targets.dirLight.target.position.copy(center);
  targets.dirLight.target.updateMatrixWorld(true);

  targets.hemiLight.color.setHex(computed.skyColorHex);
  targets.hemiLight.groundColor.setHex(computed.groundColorHex);
  targets.hemiLight.intensity = computed.hemiIntensity;

  if (targets.fillLight) {
    const warmInterior = kelvinToLinearRgb(3800);
    targets.fillLight.color.setRGB(warmInterior[0], warmInterior[1], warmInterior[2], THREE.LinearSRGBColorSpace);
    targets.fillLight.intensity = computed.fillIntensity;
  }

  if (targets.interiorPointLight) {
    const warmLamp = kelvinToLinearRgb(3300);
    targets.interiorPointLight.color.setRGB(warmLamp[0], warmLamp[1], warmLamp[2], THREE.LinearSRGBColorSpace);
    targets.interiorPointLight.intensity = computed.interiorPointIntensity;
    targets.interiorPointLight.visible = computed.interiorPointIntensity > 0.01;
  }

  targets.scene.background = new THREE.Color(computed.backgroundColorHex);
  if (targets.scene.fog instanceof THREE.FogExp2) {
    targets.scene.fog.color.setHex(computed.backgroundColorHex);
    targets.scene.fog.density = computed.isNight ? 0.011 : 0.0065;
  }
  targets.renderer.toneMappingExposure = computed.exposure;

  return computed;
}
