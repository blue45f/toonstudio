/**
 * Studio 3D 데생 인형 — 재질 팔레트(씬 계층).
 *
 * 몸체·관절구·랜드마크·시선 가이드를 역할별 재질로 나눠 같은 형상에서도 덩어리를 읽게 한다.
 * 주인공·상대 인형이 같은 팔레트를 공유하도록 씬 본체(`studio-mannequin-scene.ts`)에서 분리했다.
 * 외부 텍스처 없이 절차 생성만 쓰므로 결정적이다.
 */

import * as THREE from "three";

import type { StudioMannequinMaterialStyle } from "./studio-mannequin-model";

/** 4스텝 절차 생성 툰 그라디언트 — 외부 matcap 에셋 없이 CSP 인형풍 셰이딩을 만든다. */
export function createStudioMannequinToonGradientTexture(): THREE.DataTexture {
  const data = new Uint8Array([88, 88, 88, 255, 148, 148, 148, 255, 208, 208, 208, 255, 244, 244, 244, 255]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export interface StudioMannequinMaterialPalette {
  readonly body: THREE.Material;
  readonly joint: THREE.Material;
  readonly landmark: THREE.Material;
  readonly eye: THREE.Material;
}

function standardMaterial(
  color: THREE.ColorRepresentation,
  roughness: number,
  metalness = 0,
  emissive?: THREE.ColorRepresentation,
  emissiveIntensity = 0,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    ...(emissive === undefined ? {} : { emissive, emissiveIntensity }),
  });
}

/**
 * 같은 형상 안에서도 관절구·랜드마크·시선 가이드를 읽을 수 있게 역할별 재질을 만든다.
 * 외부 텍스처 없이 재현 가능하며, 색만 달라져도 동일한 포즈·캡처 계약을 유지한다.
 */
export function createStudioMannequinMaterialPalette(
  style: StudioMannequinMaterialStyle,
  gradientMap: THREE.Texture,
): StudioMannequinMaterialPalette {
  if (style === "clay") {
    return {
      body: standardMaterial(0xe8e2da, 0.86, 0.02),
      joint: standardMaterial(0xc9beb2, 0.72, 0.03),
      landmark: standardMaterial(0xf8f3ed, 0.66, 0.01),
      eye: standardMaterial(0x36312d, 0.74, 0),
    };
  }
  if (style === "wireframe") {
    return {
      body: new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.9 }),
      joint: new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true, transparent: true, opacity: 0.96 }),
      landmark: new THREE.MeshBasicMaterial({ color: 0xe2e8f0, wireframe: true, transparent: true, opacity: 0.95 }),
      eye: new THREE.MeshBasicMaterial({ color: 0x0f172a, wireframe: true }),
    };
  }
  if (style === "shaded") {
    return {
      body: new THREE.MeshToonMaterial({ color: 0x94a3b8, gradientMap }),
      joint: new THREE.MeshToonMaterial({ color: 0xc27d59, gradientMap }),
      landmark: new THREE.MeshToonMaterial({ color: 0xdbe6ee, gradientMap }),
      eye: new THREE.MeshToonMaterial({ color: 0x111827, gradientMap }),
    };
  }
  if (style === "magma") {
    return {
      body: standardMaterial(0x18181b, 0.3, 0, 0xf97316, 0.68),
      joint: standardMaterial(0x211216, 0.25, 0, 0xef4444, 0.95),
      landmark: standardMaterial(0x2b1806, 0.2, 0, 0xfacc15, 1.15),
      eye: standardMaterial(0x020204, 0.4, 0, 0xffedd5, 0.8),
    };
  }
  if (style === "stencil") {
    return {
      body: new THREE.MeshBasicMaterial({ color: 0x09090b }),
      joint: new THREE.MeshBasicMaterial({ color: 0x17171b }),
      landmark: new THREE.MeshBasicMaterial({ color: 0x27272a }),
      eye: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    };
  }
  if (style === "bronze") {
    return {
      body: standardMaterial(0x9c6b30, 0.28, 0.72),
      joint: standardMaterial(0x71451f, 0.24, 0.8),
      landmark: standardMaterial(0xc5944d, 0.22, 0.68),
      eye: standardMaterial(0x1e1813, 0.32, 0.55),
    };
  }
  if (style === "porcelain") {
    const physical = (color: THREE.ColorRepresentation, roughness: number) => new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0,
      roughness,
      clearcoat: 0.62,
      clearcoatRoughness: 0.18,
    });
    return {
      body: physical(0xf5efe7, 0.24),
      joint: physical(0xd9cfc4, 0.3),
      landmark: physical(0xffffff, 0.18),
      eye: physical(0x27313c, 0.26),
    };
  }
  if (style === "skin") {
    const skin = (color: THREE.ColorRepresentation, roughness: number, sheen: number) => new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0,
      roughness,
      clearcoat: 0.08,
      clearcoatRoughness: 0.58,
      sheen,
      sheenRoughness: 0.72,
      sheenColor: new THREE.Color(0xffd6c2),
    });
    return {
      body: skin(0xd7a07d, 0.48, 0.24),
      joint: skin(0xc78669, 0.52, 0.18),
      landmark: skin(0xedb69b, 0.44, 0.28),
      eye: standardMaterial(0x2b211d, 0.42, 0),
    };
  }
  return {
    body: standardMaterial(0xc58b57, 0.62, 0.02),
    joint: standardMaterial(0x9f6437, 0.54, 0.03),
    landmark: standardMaterial(0xd39a63, 0.54, 0.01),
    eye: standardMaterial(0x30251d, 0.48, 0),
  };
}

export function disposeStudioMannequinMaterialPalette(palette: StudioMannequinMaterialPalette): void {
  for (const material of new Set(Object.values(palette))) material.dispose();
}
