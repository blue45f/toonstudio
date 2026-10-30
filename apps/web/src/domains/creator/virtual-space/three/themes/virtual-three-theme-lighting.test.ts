import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { kelvinToLinearRgb } from "../../../scene-3d/studio-3d-blender-eevee-lighting-rig";
import { DEFAULT_VIRTUAL_THREE_THEME, VIRTUAL_THREE_THEMES } from "./virtual-three-theme-catalog";
import { applyVirtualThreeThemeLighting, captureVirtualThreeThemeLightingState, VIRTUAL_THREE_THEME_LIGHTING_NORMALIZATION as policy, type VirtualThreeThemeLights } from "./virtual-three-theme-lighting";
import type { VirtualThreeAssetRecipeTheme, VirtualThreeThemeLighting } from "./virtual-three-theme-types";

const dimensions = { width: 3072, height: 1920 };
function recipe(lighting?: VirtualThreeThemeLighting): VirtualThreeAssetRecipeTheme {
  const theme = VIRTUAL_THREE_THEMES.find((item) => item.kind === "asset-recipe");
  if (!theme || theme.kind !== "asset-recipe") throw new Error("3D 조명 fixture에 사용할 recipe가 없습니다.");
  return { ...theme, lighting: lighting ?? {
    ambientIlluminanceLux: 120,
    key: { illuminanceLux: 500, temperatureKelvin: 3400, azimuthDegrees: 0, elevationDegrees: 30 },
    fill: { illuminanceLux: 200, temperatureKelvin: 6500 },
  } };
}
function rig(): { readonly scene: THREE.Scene; readonly lights: VirtualThreeThemeLights } {
  const scene = new THREE.Scene();
  const lights = { ambient: new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.04), key: new THREE.DirectionalLight(0xfffbeb, 1.42), fill: new THREE.DirectionalLight(0xffffff, 0) };
  lights.key.position.set(36, 48, 28);
  lights.key.castShadow = true;
  scene.add(lights.ambient, lights.key, lights.key.target, lights.fill, lights.fill.target);
  return { scene, lights };
}
function snapshot(lights: VirtualThreeThemeLights) {
  return {
    ambient: { intensity: lights.ambient.intensity, color: lights.ambient.color.toArray(), ground: lights.ambient.groundColor.toArray() },
    key: { intensity: lights.key.intensity, color: lights.key.color.toArray(), position: lights.key.position.toArray(), target: lights.key.target.position.toArray(), shadow: lights.key.castShadow },
    fill: { intensity: lights.fill.intensity, color: lights.fill.color.toArray(), position: lights.fill.position.toArray(), target: lights.fill.target.position.toArray(), shadow: lights.fill.castShadow },
  };
}

describe("독립 3D 테마의 실제 Three 광원 adapter", () => {
  it("명시 reference lux를 기존 노출용 intensity로 정규화하고 각 광원 색온도를 적용한다", () => {
    const { lights } = rig();
    applyVirtualThreeThemeLighting(recipe(), dimensions, lights);
    expect(lights.ambient.intensity).toBe(1.04);
    expect(lights.key.intensity).toBe(1.42);
    expect(lights.fill.intensity).toBe(0.6);
    expect(lights.key.color.toArray()).toEqual(kelvinToLinearRgb(3400));
    expect(lights.fill.color.toArray()).toEqual(kelvinToLinearRgb(6500));
    expect(lights.ambient.color.toArray()).toEqual(lights.fill.color.toArray());
    expect(lights.ambient.groundColor.r).toBeCloseTo(lights.fill.color.r * policy.ambientGroundFactor);
    expect(lights.key.color.b).toBeLessThan(lights.fill.color.b);
    expect(lights.key.castShadow).toBe(true);
    expect(lights.fill.castShadow).toBe(false);
  });

  it("정본 월드 중심을 실제 target으로 사용하고 방위·고도와 반대편 fill 위치를 보존한다", () => {
    const { scene, lights } = rig();
    applyVirtualThreeThemeLighting(recipe(), dimensions, lights);
    scene.updateMatrixWorld(true);
    const center = new THREE.Vector3(48, 0, 30);
    expect(lights.key.target.getWorldPosition(new THREE.Vector3()).toArray()).toEqual(center.toArray());
    expect(lights.fill.target.getWorldPosition(new THREE.Vector3()).toArray()).toEqual(center.toArray());
    const keyOffset = lights.key.getWorldPosition(new THREE.Vector3()).sub(center);
    const fillOffset = lights.fill.getWorldPosition(new THREE.Vector3()).sub(center);
    expect(keyOffset.length()).toBeCloseTo(policy.lightDistanceMeters);
    expect(keyOffset.x).toBeCloseTo(0);
    expect(keyOffset.y).toBeCloseTo(32);
    expect(keyOffset.z).toBeGreaterThan(0);
    expect(fillOffset.z).toBeLessThan(0);
    expect(fillOffset.y).toBeCloseTo(32);
    const changed = recipe({ ...recipe().lighting, key: { ...recipe().lighting.key, azimuthDegrees: 90, elevationDegrees: 60 } });
    applyVirtualThreeThemeLighting(changed, dimensions, lights);
    expect(lights.key.position.x - center.x).toBeCloseTo(32);
    expect(lights.key.position.y).toBeCloseTo(Math.sin(Math.PI / 3) * policy.lightDistanceMeters);
    expect(lights.key.position.z).toBeCloseTo(center.z);
  });

  it("여덟 실제 recipe의 광량·색온도·방위를 고정 day/studio/night 하나로 뭉개지 않는다", () => {
    const observed: string[] = [];
    for (const theme of VIRTUAL_THREE_THEMES) {
      if (theme.kind !== "asset-recipe") continue;
      const { lights } = rig();
      applyVirtualThreeThemeLighting(theme, dimensions, lights);
      expect(lights.key.intensity).toBeCloseTo(theme.lighting.key.illuminanceLux / 500 * 1.42);
      expect(lights.ambient.intensity).toBeCloseTo(theme.lighting.ambientIlluminanceLux / 120 * 1.04);
      expect(lights.fill.intensity).toBeCloseTo(theme.lighting.fill.illuminanceLux / 200 * 0.6);
      expect(lights.key.color.toArray()).toEqual(kelvinToLinearRgb(theme.lighting.key.temperatureKelvin));
      expect(lights.fill.color.toArray()).toEqual(kelvinToLinearRgb(theme.lighting.fill.temperatureKelvin));
      observed.push(JSON.stringify({ intensity: lights.key.intensity, color: lights.key.color.toArray(), position: lights.key.position.toArray() }));
    }
    expect(observed).toHaveLength(8);
    expect(new Set(observed).size).toBe(8);
  });

  it("baseline 복귀는 preset이 설정한 색·광량·shadow를 그대로 두고 기존 위치와 꺼진 fill을 복구한다", () => {
    const { lights } = rig();
    applyVirtualThreeThemeLighting(recipe(), dimensions, lights);
    // 기존 day/studio/night preset 적용 결과를 먼저 놓는다.
    lights.ambient.intensity = 0.56; lights.ambient.color.setHex(0x93c5fd); lights.ambient.groundColor.setHex(0x1e1b4b);
    lights.key.intensity = 0.76; lights.key.color.setHex(0xc4b5fd);
    const ambient = { intensity: lights.ambient.intensity, color: lights.ambient.color.clone(), ground: lights.ambient.groundColor.clone() };
    const key = { intensity: lights.key.intensity, color: lights.key.color.clone() };
    applyVirtualThreeThemeLighting(DEFAULT_VIRTUAL_THREE_THEME, dimensions, lights);
    expect(lights.ambient.intensity).toBe(ambient.intensity);
    expect(lights.ambient.color.equals(ambient.color)).toBe(true);
    expect(lights.ambient.groundColor.equals(ambient.ground)).toBe(true);
    expect(lights.key.intensity).toBe(key.intensity);
    expect(lights.key.color.equals(key.color)).toBe(true);
    expect(lights.key.position.toArray()).toEqual([36, 48, 28]);
    expect(lights.key.target.position.toArray()).toEqual([0, 0, 0]);
    expect(lights.key.castShadow).toBe(true);
    expect(lights.fill.intensity).toBe(0);
    expect(lights.fill.castShadow).toBe(false);
  });

  it("0 광량과 수직 key도 지원하며 광원이나 target을 생성·연결·해제하지 않는다", () => {
    const { scene, lights } = rig(), children = [...scene.children];
    const base = recipe().lighting;
    const dark = recipe({ ambientIlluminanceLux: 0, key: { ...base.key, illuminanceLux: 0, elevationDegrees: 90 }, fill: { ...base.fill, illuminanceLux: 0 } });
    applyVirtualThreeThemeLighting(dark, dimensions, lights);
    expect(lights.ambient.intensity).toBe(0); expect(lights.key.intensity).toBe(0); expect(lights.fill.intensity).toBe(0);
    expect(lights.key.position.x).toBeCloseTo(48); expect(lights.key.position.z).toBeCloseTo(30);
    expect(lights.key.position.y).toBeCloseTo(policy.lightDistanceMeters);
    expect(scene.children).toEqual(children);
    expect(children.every((child) => child.parent === scene)).toBe(true);
  });

  it("잘못된 recipe나 월드 크기는 기존 광원을 일부 변경하기 전에 거부한다", () => {
    const { lights } = rig(), before = snapshot(lights), base = recipe().lighting;
    const invalid = [
      { ...base, ambientIlluminanceLux: -1 },
      { ...base, key: { ...base.key, illuminanceLux: Number.NaN } },
      { ...base, key: { ...base.key, temperatureKelvin: 999 } },
      { ...base, fill: { ...base.fill, temperatureKelvin: 12001 } },
      { ...base, key: { ...base.key, azimuthDegrees: Infinity } },
      { ...base, key: { ...base.key, elevationDegrees: 91 } },
    ];
    for (const lighting of invalid) {
      expect(() => applyVirtualThreeThemeLighting(recipe(lighting), dimensions, lights)).toThrow(TypeError);
      expect(snapshot(lights)).toEqual(before);
    }
    expect(() => applyVirtualThreeThemeLighting(recipe(), { width: 0, height: 1920 }, lights)).toThrow(TypeError);
    expect(snapshot(lights)).toEqual(before);
    expect(() => applyVirtualThreeThemeLighting(recipe(), dimensions, { ...lights, fill: lights.key })).toThrow(TypeError);
    expect(snapshot(lights)).toEqual(before);
  });

  it("테마 기본값 대신 현재 HUD 광원·target·환경·노출을 캡처해 반복 복구한다", () => {
    const { scene, lights } = rig(), renderer = { toneMappingExposure: 0.83 };
    applyVirtualThreeThemeLighting(recipe(), dimensions, lights);
    lights.ambient.intensity = 0.71; lights.ambient.color.setRGB(0.4, 0.5, 0.6); lights.ambient.groundColor.setRGB(0.12, 0.14, 0.16);
    lights.key.position.set(7, 8, 9); lights.key.target.position.set(1, 2, 3); lights.key.color.setRGB(0.8, 0.7, 0.6);
    lights.key.intensity = 1.17; lights.fill.intensity = 0.37; lights.fill.position.set(4, 5, 6); lights.fill.target.position.set(3, 2, 1);
    const environment = new THREE.Texture(), nextEnvironment = new THREE.Texture();
    scene.environment = environment; scene.environmentIntensity = 0.73; scene.environmentRotation.set(0.1, 0.2, 0.3);
    scene.background = new THREE.Color(0x123456); scene.backgroundIntensity = 0.87; scene.backgroundBlurriness = 0.21;
    scene.backgroundRotation.set(0.4, 0.5, 0.6); scene.fog = new THREE.FogExp2(0x456789, 0.017);
    const before = snapshot(lights), keyTarget = lights.key.target, fillTarget = lights.fill.target;
    const restore = captureVirtualThreeThemeLightingState({ scene, lights, renderer });
    applyVirtualThreeThemeLighting(recipe(), dimensions, lights);
    lights.key.target = new THREE.Object3D(); lights.fill.target = new THREE.Object3D();
    scene.environment = nextEnvironment; scene.environmentIntensity = 3; scene.environmentRotation.set(0, 0, 0);
    scene.background.setHex(0xffffff); scene.backgroundIntensity = 1; scene.backgroundBlurriness = 0;
    scene.backgroundRotation.set(0, 0, 0); scene.fog.density = 0.5; renderer.toneMappingExposure = 2;
    const environmentDispose = vi.spyOn(environment, "dispose"), nextDispose = vi.spyOn(nextEnvironment, "dispose");
    for (let index = 0; index < 2; index += 1) {
      restore();
      expect(snapshot(lights)).toEqual(before);
      expect(lights.key.target).toBe(keyTarget); expect(lights.fill.target).toBe(fillTarget);
      expect(scene.environment).toBe(environment); expect(scene.environmentIntensity).toBe(0.73);
      expect(scene.environmentRotation.toArray()).toEqual([0.1, 0.2, 0.3, "XYZ"]);
      expect(scene.background).toBeInstanceOf(THREE.Color);
      if (!(scene.background instanceof THREE.Color)) throw new Error("원래 단색 배경이 복원되지 않았습니다.");
      expect(scene.background.getHex()).toBe(0x123456);
      expect(scene.backgroundIntensity).toBe(0.87); expect(scene.backgroundBlurriness).toBe(0.21);
      expect(scene.backgroundRotation.toArray()).toEqual([0.4, 0.5, 0.6, "XYZ"]);
      expect(scene.fog).toBeInstanceOf(THREE.FogExp2);
      if (!(scene.fog instanceof THREE.FogExp2)) throw new Error("원래 fog 유형이 복원되지 않았습니다.");
      expect(scene.fog.density).toBe(0.017); expect(scene.fog.color.getHex()).toBe(0x456789);
      expect(renderer.toneMappingExposure).toBe(0.83);
      scene.background.setHex(0xffffff); scene.fog.density = 0.5;
    }
    expect(environmentDispose).not.toHaveBeenCalled(); expect(nextDispose).not.toHaveBeenCalled();
    environment.dispose(); nextEnvironment.dispose();
  });

  it("texture 배경과 null 환경은 참조를 보존하고 새 GPU 자원을 소유하지 않는다", () => {
    const { scene, lights } = rig(), renderer = { toneMappingExposure: 1 };
    const background = new THREE.Texture(); scene.background = background; scene.environment = null; scene.fog = null;
    const children = [...scene.children];
    const restore = captureVirtualThreeThemeLightingState({ scene, lights, renderer });
    scene.background = null; scene.environment = background; scene.fog = new THREE.Fog(0xffffff, 1, 10);
    restore();
    expect(scene.background).toBe(background); expect(scene.environment).toBeNull(); expect(scene.fog).toBeNull();
    expect(scene.children).toEqual(children);
    background.dispose();
  });
});
