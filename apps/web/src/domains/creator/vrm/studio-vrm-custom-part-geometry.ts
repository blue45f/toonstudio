/**
 * 커스텀 3D 파츠(헤어·의상·소품)용 용접 법선 보정 및 절차적 MToon 매트캡·직조 노멀·페더링 텍스처 생성기.
 *
 * `studio-vrm-custom-part-material.ts`에서 책임 분리해 각 모듈을 800줄 이하로 유지한다.
 */
import * as THREE from "three";

import { sampleStudioVrmGarmentWeave } from "./studio-vrm-garment-weave";
import {
  createStudioVrmHairAngelRingMatcapTexture,
  createStudioVrmHairStrandAlbedoTexture,
  createStudioVrmHairStrandNormalTexture,
} from "./studio-vrm-hair-strand-textures";
import { wardrobeFabricById, type WardrobeEquip } from "./studio-vrm-wardrobe";

export {
  createStudioVrmHairAngelRingMatcapTexture,
  createStudioVrmHairStrandAlbedoTexture,
  createStudioVrmHairStrandNormalTexture,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 동일 좌표 정점(UV 심·헤어 가닥 앞/뒤 경계 등)의 법선을 용접 평균화해
 * 90° 각진 이음새와 역면 외곽선 찢어짐을 제거한다. 비유한/영길이 법선도 함께 복구한다.
 */
export function smoothStudioVrmCoincidentNormals(
  geometry: THREE.BufferGeometry,
  options: { readonly creaseAngleDeg?: number; readonly tolerance?: number } = {},
): THREE.BufferGeometry {
  const position = geometry.getAttribute("position");
  if (!position || position.count === 0) return geometry;
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");
  if (!normal || normal.count !== position.count) return geometry;

  const invTol = 1 / (options.tolerance ?? 1e-4);
  const creaseAngleDeg = options.creaseAngleDeg ?? 85;
  const fullWeld = creaseAngleDeg >= 179.9;
  const cosThreshold = fullWeld ? -2 : Math.cos(THREE.MathUtils.degToRad(creaseAngleDeg));

  const buckets = new Map<string, number[]>();
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let index = 0; index < position.count; index += 1) {
    const px = position.getX(index);
    const py = position.getY(index);
    const pz = position.getZ(index);
    cx += px;
    cy += py;
    cz += pz;
    const key = `${Math.round(px * invTol)},${Math.round(py * invTol)},${Math.round(pz * invTol)}`;
    const group = buckets.get(key);
    if (group) group.push(index);
    else buckets.set(key, [index]);
  }
  cx /= position.count;
  cy /= position.count;
  cz /= position.count;

  const original = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    let nx = normal.getX(index);
    let ny = normal.getY(index);
    let nz = normal.getZ(index);
    const lenSq = nx * nx + ny * ny + nz * nz;
    if (!Number.isFinite(lenSq) || lenSq < 1e-10) {
      nx = position.getX(index) - cx;
      ny = position.getY(index) - cy;
      nz = position.getZ(index) - cz;
      const radialLen = Math.hypot(nx, ny, nz);
      if (radialLen > 1e-6) {
        nx /= radialLen;
        ny /= radialLen;
        nz /= radialLen;
      } else {
        nx = 0;
        ny = 1;
        nz = 0;
      }
      normal.setXYZ(index, nx, ny, nz);
    } else {
      const invLen = 1 / Math.sqrt(lenSq);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;
    }
    original[index * 3] = nx;
    original[index * 3 + 1] = ny;
    original[index * 3 + 2] = nz;
  }

  for (const group of buckets.values()) {
    if (group.length < 2) continue;
    if (fullWeld) {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const index of group) {
        sx += original[index * 3]!;
        sy += original[index * 3 + 1]!;
        sz += original[index * 3 + 2]!;
      }
      const len = Math.hypot(sx, sy, sz);
      if (len > 1e-5) {
        const inv = 1 / len;
        for (const index of group) normal.setXYZ(index, sx * inv, sy * inv, sz * inv);
      }
      continue;
    }
    for (const index of group) {
      const ix = original[index * 3]!;
      const iy = original[index * 3 + 1]!;
      const iz = original[index * 3 + 2]!;
      let sx = ix;
      let sy = iy;
      let sz = iz;
      for (const other of group) {
        if (other === index) continue;
        const ox = original[other * 3]!;
        const oy = original[other * 3 + 1]!;
        const oz = original[other * 3 + 2]!;
        if (ix * ox + iy * oy + iz * oz >= cosThreshold) {
          sx += ox;
          sy += oy;
          sz += oz;
        }
      }
      const len = Math.hypot(sx, sy, sz);
      if (len > 1e-5) normal.setXYZ(index, sx / len, sy / len, sz / len);
    }
  }

  normal.needsUpdate = true;
  return geometry;
}

/** 역면 외곽선 전용 용접 법선 지오메트리를 생성한다(가닥·모서리 틈새 방지). */
export function createStudioVrmSmoothOutlineGeometry(
  source: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const outline = source.clone();
  smoothStudioVrmCoincidentNormals(outline, { creaseAngleDeg: 180 });
  outline.computeBoundingBox();
  outline.computeBoundingSphere();
  return outline;
}

/** IBL 없는 스튜디오 뷰포트에서 금속·광택·새틴 파츠가 검게 무너지지 않도록 스튜디오 반사 매트캡을 만든다. */
export function createStudioVrmSpecularMatcapTexture(
  roughness: number,
  metalness: number,
): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const gloss = clamp(1 - roughness, 0.08, 0.96);
  const metal = clamp(metalness, 0, 1);
  const sharpExp = 1.6 + gloss * 14;
  for (let y = 0; y < size; y += 1) {
    const ny = (y / (size - 1)) * 2 - 1;
    for (let x = 0; x < size; x += 1) {
      const nx = (x / (size - 1)) * 2 - 1;
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx + ny * ny)));
      const keyDot = Math.max(0, nx * 0.42 + ny * 0.62 + nz * 0.66);
      const fillDot = Math.max(0, -nx * 0.55 + ny * 0.25 + nz * 0.8);
      const keySpec = Math.pow(keyDot, sharpExp) * (0.45 + metal * 0.55);
      const horizonBand = Math.exp(-Math.pow((ny + 0.08) / (0.22 + roughness * 0.3), 2)) * (0.16 + metal * 0.34);
      const fresnel = Math.pow(1 - nz, 2.6) * (0.18 + metal * 0.32);
      const val = clamp(keySpec + horizonBand + fillDot * 0.14 * metal + fresnel, 0, 1);
      const offset = (y * size + x) * 4;
      data[offset] = Math.round(clamp(val * 1.0, 0, 1) * 255);
      data[offset + 1] = Math.round(clamp(val * 0.99, 0, 1) * 255);
      data[offset + 2] = Math.round(clamp(val * 1.04, 0, 1) * 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `studio-vrm-specular-matcap:r${Math.round(roughness * 100)}:m${Math.round(metalness * 100)}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** 직조 높이장(`sampleStudioVrmGarmentWeave`)을 MToon `normalMap`용 탄젠트 공간 노멀맵으로 변환한다. */
export function createStudioVrmGarmentWeaveNormalTexture(
  fabricId: WardrobeEquip["fabricId"],
): THREE.DataTexture | null {
  const fabric = wardrobeFabricById(fabricId);
  if (!fabric || fabric.weaveStrength <= 0) return null;
  const size = 96;
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      heights[y * size + x] = sampleStudioVrmGarmentWeave(fabric, x / size, y / size) / 255;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const slopeScale = clamp(fabric.weaveStrength * 34, 0.25, 2.2);
  for (let y = 0; y < size; y += 1) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x += 1) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (heights[y * size + xp]! - heights[y * size + xm]!) * slopeScale;
      const dy = (heights[yp * size + x]! - heights[ym * size + x]!) * slopeScale;
      const invLen = 1 / Math.hypot(-dx, -dy, 1);
      const offset = (y * size + x) * 4;
      data[offset] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      data[offset + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      data[offset + 2] = Math.round((invLen * 0.5 + 0.5) * 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `wardrobe-weave-normal:${fabricId}`;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** 볼 터치·주근깨·매력점이 납작한 스티커로 보이지 않도록 방사형 페더링 알파 맵을 만든다. */
export function createStudioVrmFeatheredDiscAlphaTexture(softness: number): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const inner = clamp(1 - softness, 0.05, 0.85);
  for (let y = 0; y < size; y += 1) {
    const ny = (y / (size - 1)) * 2 - 1;
    for (let x = 0; x < size; x += 1) {
      const nx = (x / (size - 1)) * 2 - 1;
      const r = Math.hypot(nx, ny);
      const t = clamp((1 - r) / Math.max(0.05, 1 - inner), 0, 1);
      const alpha = r >= 1 ? 0 : t * t * (3 - 2 * t);
      const byte = Math.round(alpha * 255);
      const offset = (y * size + x) * 4;
      data[offset] = byte;
      data[offset + 1] = byte;
      data[offset + 2] = byte;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `studio-vrm-feathered-disc:${Math.round(softness * 100)}`;
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
