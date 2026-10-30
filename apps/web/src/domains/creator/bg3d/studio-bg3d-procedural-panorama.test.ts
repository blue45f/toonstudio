import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { claimStudioBg3dEnvironmentSlots } from "./studio-bg3d-environment-slot-owner";
import {
  STUDIO_BG3D_PANORAMA_HEIGHT,
  STUDIO_BG3D_PANORAMA_WIDTH,
  createStudioBg3dProceduralPanoramaPixels,
  createStudioBg3dProceduralPanoramaTexture,
  mountStudioBg3dProceduralPanorama,
} from "./studio-bg3d-procedural-panorama";

const PROCEDURAL_PRESETS = ["clear_day", "sunset", "night"] as const;

function rgbAt(rgba: Uint8Array, x: number, y: number): readonly number[] {
  const offset = (y * STUDIO_BG3D_PANORAMA_WIDTH + x) * 4;
  return Array.from(rgba.slice(offset, offset + 3));
}

function requireTexture(texture: THREE.DataTexture | null): THREE.DataTexture {
  if (!texture) throw new Error("이 회귀는 실제 절차 파노라마 텍스처를 요구합니다.");
  return texture;
}

describe("Studio BG3D procedural panorama", () => {
  it("외부 표시값을 보존하면서 해제한 파노라마 pointer를 scene에서 분리한다", () => {
    const scene = new THREE.Scene(), environment = new THREE.Texture(), background = new THREE.Color("#304050");
    scene.environment = environment; scene.background = background;
    const binding = mountStudioBg3dProceduralPanorama(scene, "sunset", 47), texture = binding.texture;
    if (!texture) throw new Error("실제 파노라마 texture 필요");
    const dispose = vi.spyOn(texture, "dispose"), environmentRotation = scene.environmentRotation, backgroundRotation = scene.backgroundRotation;
    scene.environmentIntensity = 2.3; scene.backgroundIntensity = 1.7;
    scene.environmentRotation.set(0.1, 0.2, 0.3); scene.backgroundRotation.set(0.3, 0.4, 0.5);
    binding.dispose(); binding.dispose();
    expect(scene.environment).toBe(environment); expect(scene.background).toBe(background);
    expect(scene.environmentIntensity).toBe(2.3); expect(scene.backgroundIntensity).toBe(1.7);
    expect(scene.environmentRotation).toBe(environmentRotation); expect(scene.backgroundRotation).toBe(backgroundRotation);
    expect(scene.environmentRotation.y).toBe(0.2); expect(scene.backgroundRotation.y).toBe(0.4);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("keeps blank as a solid clear background and generates all allowlisted skies locally", () => {
    expect(createStudioBg3dProceduralPanoramaPixels("blank")).toBeNull();
    expect(createStudioBg3dProceduralPanoramaTexture("blank")).toBeNull();

    for (const presetId of PROCEDURAL_PRESETS) {
      const panorama = createStudioBg3dProceduralPanoramaPixels(presetId);
      expect(panorama).toMatchObject({
        width: STUDIO_BG3D_PANORAMA_WIDTH,
        height: STUDIO_BG3D_PANORAMA_HEIGHT,
      });
      expect(panorama?.rgba).toHaveLength(
        STUDIO_BG3D_PANORAMA_WIDTH * STUDIO_BG3D_PANORAMA_HEIGHT * 4,
      );
      expect(panorama?.rgba.every((channel, index) => index % 4 !== 3 || channel === 255)).toBe(
        true,
      );
    }
  });

  it("reuses one RGBA render per preset across repeated and quad-view texture mounts", () => {
    const firstPixels = createStudioBg3dProceduralPanoramaPixels("clear_day");
    const secondPixels = createStudioBg3dProceduralPanoramaPixels("clear_day");
    expect(secondPixels).toBe(firstPixels);

    const firstTexture = createStudioBg3dProceduralPanoramaTexture("clear_day");
    const secondTexture = createStudioBg3dProceduralPanoramaTexture("clear_day");
    expect(firstTexture).not.toBe(secondTexture);
    expect(firstTexture?.image.data).toBe(firstPixels?.rgba);
    expect(secondTexture?.image.data).toBe(firstPixels?.rgba);
    firstTexture?.dispose();
    secondTexture?.dispose();
  });

  it.each(PROCEDURAL_PRESETS)("generates a seamless, vertically varied %s panorama", (presetId) => {
    const panorama = createStudioBg3dProceduralPanoramaPixels(presetId);
    expect(panorama).not.toBeNull();
    if (!panorama) return;

    for (const y of [0, 32, 96, 128, 192, STUDIO_BG3D_PANORAMA_HEIGHT - 1]) {
      expect(rgbAt(panorama.rgba, 0, y)).toEqual(
        rgbAt(panorama.rgba, STUDIO_BG3D_PANORAMA_WIDTH - 1, y),
      );
    }
    const x = Math.floor(STUDIO_BG3D_PANORAMA_WIDTH * 0.31);
    expect(new Set([
      rgbAt(panorama.rgba, x, 0).join(","),
      rgbAt(panorama.rgba, x, Math.floor(STUDIO_BG3D_PANORAMA_HEIGHT / 2)).join(","),
      rgbAt(panorama.rgba, x, STUDIO_BG3D_PANORAMA_HEIGHT - 1).join(","),
    ]).size).toBe(3);
  });

  it("creates an sRGB equirectangular DataTexture with bounded sampling settings", () => {
    const texture = createStudioBg3dProceduralPanoramaTexture("clear_day");
    expect(texture).toBeInstanceOf(THREE.DataTexture);
    expect(texture).toMatchObject({
      mapping: THREE.EquirectangularReflectionMapping,
      colorSpace: THREE.SRGBColorSpace,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      flipY: false,
    });
    expect(texture?.version).toBeGreaterThan(0);
    texture?.dispose();
  });

  it("lights PBR from the local sky, updates scene yaw, and restores prior state exactly once", () => {
    const scene = new THREE.Scene();
    const previousBackground = new THREE.Color("#123456");
    const previousEnvironment = new THREE.DataTexture();
    scene.background = previousBackground;
    scene.environment = previousEnvironment;
    scene.backgroundRotation.set(0.1, 0.2, 0.3);
    scene.environmentRotation.set(0.4, 0.5, 0.6);
    scene.backgroundIntensity = 0.7;
    scene.environmentIntensity = 2.4;
    const previousRotation = scene.backgroundRotation.clone();
    const previousEnvironmentRotation = scene.environmentRotation.clone();
    const binding = mountStudioBg3dProceduralPanorama(scene, "sunset", 45);
    expect(binding.texture).toBeInstanceOf(THREE.DataTexture);
    expect(scene.background).toBe(binding.texture);
    expect(scene.environment).toBe(binding.texture);
    expect(scene.backgroundRotation.y).toBeCloseTo(Math.PI / 4);
    expect(scene.environmentRotation.y).toBeCloseTo(Math.PI / 4);
    expect(scene.backgroundIntensity).toBe(0.7);
    expect(scene.environmentIntensity).toBe(2.4);

    const texture = binding.texture;
    binding.setRotation(270);
    expect(binding.texture).toBe(texture);
    expect(scene.backgroundRotation.y).toBeCloseTo(-Math.PI / 2);
    expect(scene.environmentRotation.y).toBeCloseTo(-Math.PI / 2);

    const dispose = vi.spyOn(requireTexture(texture), "dispose");
    binding.dispose();
    binding.dispose();
    expect(scene.background).toBe(previousBackground);
    expect(scene.environment).toBe(previousEnvironment);
    expect(scene.backgroundRotation).toEqual(previousRotation);
    expect(scene.environmentRotation).toEqual(previousEnvironmentRotation);
    expect(scene.backgroundIntensity).toBe(0.7);
    expect(scene.environmentIntensity).toBe(2.4);
    expect(dispose).toHaveBeenCalledOnce();
    previousEnvironment.dispose();
  });

  it("does not overwrite a newer scene owner during stale cleanup", () => {
    const scene = new THREE.Scene();
    const binding = mountStudioBg3dProceduralPanorama(scene, "night", 30);
    const newerBackground = new THREE.Color("#abcdef");
    scene.background = newerBackground;
    scene.backgroundRotation.set(0, 1.2, 0);

    binding.dispose();
    expect(scene.background).toBe(newerBackground);
    expect(scene.backgroundRotation.y).toBeCloseTo(1.2);
    expect(scene.environment).toBeNull();
  });

  it.each(["environment", "background"] as const)("실제 %s preserved intensity가 바뀌면 isApplied를 허가하지 않는다", (slot) => {
    const scene = new THREE.Scene(); scene.environmentIntensity = 2.4; scene.backgroundIntensity = 0.7;
    const binding = mountStudioBg3dProceduralPanorama(scene, "clear_day", 45);
    expect(binding.isApplied()).toBe(true);
    binding.setRotation(137); expect(binding.isApplied()).toBe(true);
    if (slot === "environment") scene.environmentIntensity = 2.5; else scene.backgroundIntensity = 0.8;
    expect(binding.isApplied()).toBe(false); binding.dispose();
  });

  it.each(["earlier-first", "later-first"] as const)("중첩 파노라마를 %s 순서로 해제해도 죽은 텍스처를 복원하지 않는다", (order) => {
    const scene = new THREE.Scene(), background = new THREE.Color("#234567"), environment = new THREE.DataTexture();
    scene.background = background; scene.environment = environment;
    scene.backgroundIntensity = 0.4; scene.environmentIntensity = 1.7;
    scene.backgroundRotation.set(0.1, 0.2, 0.3); scene.environmentRotation.set(0.4, 0.5, 0.6);
    const backgroundRotation = scene.backgroundRotation.clone(), environmentRotation = scene.environmentRotation.clone();
    const borrowedDispose = vi.spyOn(environment, "dispose");
    const earlier = mountStudioBg3dProceduralPanorama(scene, "night", 35);
    const later = mountStudioBg3dProceduralPanorama(scene, "sunset", 75);
    const earlierDispose = vi.spyOn(requireTexture(earlier.texture), "dispose");
    const laterDispose = vi.spyOn(requireTexture(later.texture), "dispose");
    if (order === "earlier-first") {
      earlier.dispose();
      expect(scene.background).toBe(later.texture); expect(scene.environment).toBe(later.texture);
      expect(scene.backgroundRotation.y).toBeCloseTo(THREE.MathUtils.degToRad(75));
      later.dispose();
    } else {
      later.dispose();
      expect(scene.background).toBe(earlier.texture); expect(scene.environment).toBe(earlier.texture);
      expect(scene.backgroundRotation.y).toBeCloseTo(THREE.MathUtils.degToRad(35));
      earlier.dispose();
    }
    earlier.setRotation(120); later.setRotation(150); earlier.dispose(); later.dispose();
    expect(scene.background).toBe(background); expect(scene.environment).toBe(environment);
    expect(scene.backgroundRotation).toEqual(backgroundRotation); expect(scene.environmentRotation).toEqual(environmentRotation);
    expect(scene.backgroundIntensity).toBe(0.4); expect(scene.environmentIntensity).toBe(1.7);
    expect(earlierDispose).toHaveBeenCalledOnce(); expect(laterDispose).toHaveBeenCalledOnce();
    expect(borrowedDispose).not.toHaveBeenCalled(); environment.dispose();
  });

  it("배경과 환경을 서로 다른 binding이 소유하면 갱신과 복원을 독립적으로 처리한다", () => {
    const scene = new THREE.Scene(), background = new THREE.Color("#345678"), environment = new THREE.DataTexture();
    scene.background = background; scene.environment = environment;
    scene.backgroundIntensity = 0.6; scene.environmentIntensity = 1.8;
    const backgroundOnly = mountStudioBg3dProceduralPanorama(scene, "clear_day", 20, { ownsEnvironment: false });
    const environmentOnly = mountStudioBg3dProceduralPanorama(scene, "night", 40, { ownsBackground: false });
    backgroundOnly.setRotation(60); environmentOnly.setRotation(80);
    expect(scene.background).toBe(backgroundOnly.texture); expect(scene.environment).toBe(environmentOnly.texture);
    expect(scene.backgroundRotation.y).toBeCloseTo(THREE.MathUtils.degToRad(60));
    expect(scene.environmentRotation.y).toBeCloseTo(THREE.MathUtils.degToRad(80));
    backgroundOnly.dispose();
    expect(scene.background).toBe(background); expect(scene.environment).toBe(environmentOnly.texture);
    expect(scene.environmentIntensity).toBe(1.8);
    environmentOnly.dispose();
    expect(scene.environment).toBe(environment); expect(scene.backgroundIntensity).toBe(0.6);
    environment.dispose();
  });

  it("일부 슬롯만 덮인 이전 binding은 자기 배경만 회전시키고 해제한다", () => {
    const scene = new THREE.Scene(), background = new THREE.Color("#456789"), environment = new THREE.DataTexture();
    scene.background = background; scene.environment = environment;
    const earlier = mountStudioBg3dProceduralPanorama(scene, "night", 20);
    const later = mountStudioBg3dProceduralPanorama(scene, "sunset", 70, { ownsBackground: false });
    earlier.setRotation(110);
    expect(scene.background).toBe(earlier.texture); expect(scene.environment).toBe(later.texture);
    expect(scene.backgroundRotation.y).toBeCloseTo(THREE.MathUtils.degToRad(110));
    expect(scene.environmentRotation.y).toBeCloseTo(THREE.MathUtils.degToRad(70));
    earlier.dispose();
    expect(scene.background).toBe(background); expect(scene.environment).toBe(later.texture);
    later.dispose(); expect(scene.environment).toBe(environment);
    environment.dispose();
  });

  it("외부 슬롯 소유자가 남아 있으면 이전 파노라마가 지우지 않고 마지막에는 원래 상태로 돌아간다", () => {
    const scene = new THREE.Scene(), baseline = new THREE.Color("#567890"), externalBackground = new THREE.Color("#678901");
    const baselineEnvironment = new THREE.DataTexture(), externalEnvironment = new THREE.DataTexture();
    scene.background = baseline; scene.environment = baselineEnvironment;
    scene.backgroundIntensity = 0.8; scene.environmentIntensity = 1.6;
    const panorama = mountStudioBg3dProceduralPanorama(scene, "clear_day", 25);
    const dispose = vi.spyOn(requireTexture(panorama.texture), "dispose");
    const externalDispose = vi.spyOn(externalEnvironment, "dispose");
    const external = claimStudioBg3dEnvironmentSlots(scene, { environment: true, background: true });
    expect(external.install({
      environment: { value: externalEnvironment, intensity: 3, rotation: new THREE.Euler(0.1, 0.9, 0.2) },
      background: { value: externalBackground, intensity: 4, rotation: new THREE.Euler(0.3, 1.1, 0.4) },
    })).toBe(true);
    panorama.setRotation(130); panorama.dispose();
    expect(scene.background).toBe(externalBackground); expect(scene.environment).toBe(externalEnvironment);
    expect(scene.backgroundIntensity).toBe(4); expect(scene.environmentIntensity).toBe(3);
    expect(scene.backgroundRotation.y).toBe(1.1); expect(scene.environmentRotation.y).toBe(0.9);
    expect(dispose).toHaveBeenCalledOnce(); expect(externalDispose).not.toHaveBeenCalled();
    external.dispose();
    expect(scene.background).toBe(baseline); expect(scene.environment).toBe(baselineEnvironment);
    expect(scene.backgroundIntensity).toBe(0.8); expect(scene.environmentIntensity).toBe(1.6);
    expect(externalDispose).not.toHaveBeenCalled(); baselineEnvironment.dispose(); externalEnvironment.dispose();
  });

  it.each(["environment", "background"] as const)("blank의 null 포인터도 %s로 정한 자기 슬롯만 변경한다", (slot) => {
    const scene = new THREE.Scene();
    scene.backgroundRotation.set(0.1, 0.2, 0.3); scene.environmentRotation.set(0.4, 0.5, 0.6);
    scene.backgroundIntensity = 0.9; scene.environmentIntensity = 1.9;
    const backgroundRotation = scene.backgroundRotation.clone(), environmentRotation = scene.environmentRotation.clone();
    const binding = mountStudioBg3dProceduralPanorama(scene, "blank", 45, {
      ownsEnvironment: slot === "environment", ownsBackground: slot === "background",
    });
    expect(binding.texture).toBeNull(); binding.setRotation(90);
    if (slot === "environment") {
      expect(scene.backgroundRotation).toEqual(backgroundRotation); expect(scene.environmentRotation.y).toBeCloseTo(Math.PI / 2);
    } else {
      expect(scene.environmentRotation).toEqual(environmentRotation); expect(scene.backgroundRotation.y).toBeCloseTo(Math.PI / 2);
    }
    expect(scene.backgroundIntensity).toBe(0.9); expect(scene.environmentIntensity).toBe(1.9);
    binding.dispose();
    expect(scene.backgroundRotation).toEqual(backgroundRotation); expect(scene.environmentRotation).toEqual(environmentRotation);
  });

  it("두 슬롯을 모두 양보하면 텍스처를 만들지 않고 기존 소유자도 대체하지 않는다", () => {
    const scene = new THREE.Scene();
    const earlier = mountStudioBg3dProceduralPanorama(scene, "night", 20, { ownsEnvironment: false });
    const inactive = mountStudioBg3dProceduralPanorama(scene, "clear_day", 150, { ownsEnvironment: false, ownsBackground: false });
    expect(inactive.texture).toBeNull();
    earlier.setRotation(60); inactive.setRotation(120); inactive.dispose(); inactive.dispose();
    expect(scene.background).toBe(earlier.texture); expect(scene.environment).toBeNull();
    expect(scene.backgroundRotation.y).toBeCloseTo(THREE.MathUtils.degToRad(60));
    earlier.dispose(); expect(scene.background).toBeNull();
  });
});
