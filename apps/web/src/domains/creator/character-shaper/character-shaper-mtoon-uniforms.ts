/**
 * Character Shaper — SHAPER 3차 MatCap · 비등방 외곽선 · 헤어 내선 억제 유니폼의
 * 실시간 Three.js MToon(`MToonMaterial` / `MToonNodeMaterial`) 적용기.
 *
 * 원본 머티리얼의 초기 파라미터는 WeakMap에 1회 스냅샷하므로, 슬라이더를 반복 조정하거나
 * 초기화해도 누적 드리프트가 생기지 않는다.
 */
import { isStudioVrmMtoonMaterial } from "../vrm/studio-vrm-mtoon-brand";

import {
  computeShaperMaterialDataUniforms,
  type ShaperMaterialDataInput,
  type ShaperMaterialDataUniforms,
} from "./character-shaper-gen3d-bridge";

import type * as THREE from "three";

export interface ShaperMtoonMaterialSettings {
  readonly shadePos: number;
  readonly shadeWidth: number;
  readonly rLightPos: number;
  readonly rLightWidth: number;
  readonly outlinePressure: boolean;
  readonly disableHairInline: boolean;
}

export const DEFAULT_SHAPER_MTOON_SETTINGS: ShaperMtoonMaterialSettings = Object.freeze({
  shadePos: 0.5,
  shadeWidth: 0.12,
  rLightPos: 0.82,
  rLightWidth: 0.25,
  outlinePressure: true,
  disableHairInline: true,
});

interface MtoonMutableMaterial {
  readonly name?: string;
  readonly isMToonMaterial?: boolean;
  readonly isMToonNodeMaterial?: boolean;
  shadingToonyFactor?: number;
  shadingShiftFactor?: number;
  parametricRimLiftFactor?: number;
  parametricRimFresnelPowerFactor?: number;
  rimLightingMixFactor?: number;
  outlineWidthFactor?: number;
  outlineLightingMixFactor?: number;
  userData?: Record<string, unknown>;
  needsUpdate?: boolean;
}

interface MtoonBaseline {
  readonly shadingToonyFactor?: number;
  readonly shadingShiftFactor?: number;
  readonly parametricRimLiftFactor?: number;
  readonly parametricRimFresnelPowerFactor?: number;
  readonly rimLightingMixFactor?: number;
  readonly outlineWidthFactor?: number;
  readonly outlineLightingMixFactor?: number;
}

const materialBaselines = new WeakMap<object, MtoonBaseline>();
const HAIR_MESH_OR_MATERIAL_PATTERN = /(?:hair|bang|ponytail|twintail|braid|ahoge|scalp|strand|머리|헤어)/iu;
const HEAD_OR_FACE_PATTERN = /(?:face|head|eye|iris|brow|lash|mouth|lip|얼굴|눈)/iu;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function captureBaseline(material: MtoonMutableMaterial): MtoonBaseline {
  const existing = materialBaselines.get(material);
  if (existing) return existing;
  const baseline: MtoonBaseline = Object.freeze({
    shadingToonyFactor: typeof material.shadingToonyFactor === "number" ? material.shadingToonyFactor : undefined,
    shadingShiftFactor: typeof material.shadingShiftFactor === "number" ? material.shadingShiftFactor : undefined,
    parametricRimLiftFactor:
      typeof material.parametricRimLiftFactor === "number" ? material.parametricRimLiftFactor : undefined,
    parametricRimFresnelPowerFactor:
      typeof material.parametricRimFresnelPowerFactor === "number"
        ? material.parametricRimFresnelPowerFactor
        : undefined,
    rimLightingMixFactor:
      typeof material.rimLightingMixFactor === "number" ? material.rimLightingMixFactor : undefined,
    outlineWidthFactor: typeof material.outlineWidthFactor === "number" ? material.outlineWidthFactor : undefined,
    outlineLightingMixFactor:
      typeof material.outlineLightingMixFactor === "number" ? material.outlineLightingMixFactor : undefined,
  });
  materialBaselines.set(material, baseline);
  return baseline;
}

function isHairTarget(meshName: string, materialName: string): boolean {
  if (HAIR_MESH_OR_MATERIAL_PATTERN.test(materialName)) return true;
  if (HAIR_MESH_OR_MATERIAL_PATTERN.test(meshName) && !HEAD_OR_FACE_PATTERN.test(materialName)) return true;
  return false;
}

export interface ShaperMtoonApplyResult {
  readonly uniforms: ShaperMaterialDataUniforms;
  readonly updatedMaterials: number;
  readonly hairSuppressedMaterials: number;
}

interface VrmLikeWithScene {
  readonly scene?: {
    traverse?: (callback: (node: THREE.Object3D) => void) => void;
  } | null;
}

/**
 * SHAPER 3차 MatCap 램프·반사광·비등방 필압 외곽선·헤어 내선 억제를
 * 현재 VRM 씬의 모든 MToon 재질(WebGL + WebGPU)에 즉시 반영한다.
 */
export function applyShaperMtoonUniformsToVrm(
  vrm: VrmLikeWithScene | null | undefined,
  input: ShaperMaterialDataInput,
): ShaperMtoonApplyResult {
  const uniforms = computeShaperMaterialDataUniforms(input);
  const scene = vrm?.scene;
  const traverse = scene?.traverse;
  if (!scene || typeof traverse !== "function") {
    return Object.freeze({ uniforms, updatedMaterials: 0, hairSuppressedMaterials: 0 });
  }

  const visited = new Set<MtoonMutableMaterial>();
  let hairSuppressedMaterials = 0;
  const fresnelPower = Number((1 + (1 - uniforms.rLightWidth) * 6).toFixed(2));
  const rimMix = Number(clamp(0.15 + uniforms.rLightWidth * 0.75, 0, 1).toFixed(2));
  const outlineScale = uniforms.outlineAspectRatio > 1 ? 1.35 : 1.0;

  traverse.call(scene, (node) => {
    const mesh = node as Partial<THREE.Mesh>;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const meshName = typeof mesh.name === "string" ? mesh.name : "";

    for (const candidate of materials) {
      const mat = candidate as unknown as MtoonMutableMaterial;
      if (!isStudioVrmMtoonMaterial(mat) || visited.has(mat)) continue;
      visited.add(mat);

      const baseline = captureBaseline(mat);
      const hair = isHairTarget(meshName, typeof mat.name === "string" ? mat.name : "");

      mat.shadingToonyFactor = uniforms.mtoonShadingToonyFactor;
      mat.shadingShiftFactor = uniforms.mtoonShadingShiftFactor;
      mat.parametricRimLiftFactor = uniforms.mtoonParametricRimLift;
      mat.parametricRimFresnelPowerFactor = fresnelPower;
      mat.rimLightingMixFactor = rimMix;

      if (typeof baseline.outlineWidthFactor === "number") {
        // 헤어 내선 억제(hID*1) 활성 시 머리카락 내부 겹침 주선 간섭을 줄이기 위해 0.35x로 감쇠
        const hairFactor = hair && uniforms.hairShaderVariant === "simpleDisableInlineMatCapShader" ? 0.35 : 1.0;
        mat.outlineWidthFactor = Number((baseline.outlineWidthFactor * outlineScale * hairFactor).toFixed(5));
        if (hair && hairFactor < 1) hairSuppressedMaterials += 1;
      } else if (hair && uniforms.hairShaderVariant === "simpleDisableInlineMatCapShader") {
        hairSuppressedMaterials += 1;
      }

      if (typeof mat.outlineLightingMixFactor === "number") {
        mat.outlineLightingMixFactor = uniforms.outlineAspectRatio > 1 ? 0.2 : (baseline.outlineLightingMixFactor ?? 0.5);
      }

      const userData = (mat.userData ??= {});
      userData.shaperMaterialUniforms = uniforms;
      userData.shaperHairInlineSuppressed = hair && uniforms.hairShaderVariant === "simpleDisableInlineMatCapShader";
      mat.needsUpdate = true;
    }
  });

  return Object.freeze({
    uniforms,
    updatedMaterials: visited.size,
    hairSuppressedMaterials,
  });
}

/**
 * 스냅샷된 원본 MToon 재질 파라미터로 복원한다.
 */
export function resetShaperMtoonUniformsOnVrm(vrm: VrmLikeWithScene | null | undefined): number {
  const scene = vrm?.scene;
  const traverse = scene?.traverse;
  if (!scene || typeof traverse !== "function") return 0;

  const restored = new Set<MtoonMutableMaterial>();
  traverse.call(scene, (node) => {
    const mesh = node as Partial<THREE.Mesh>;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const candidate of materials) {
      const mat = candidate as unknown as MtoonMutableMaterial;
      const baseline = materialBaselines.get(mat);
      if (!baseline || restored.has(mat)) continue;
      restored.add(mat);
      if (baseline.shadingToonyFactor !== undefined) mat.shadingToonyFactor = baseline.shadingToonyFactor;
      if (baseline.shadingShiftFactor !== undefined) mat.shadingShiftFactor = baseline.shadingShiftFactor;
      if (baseline.parametricRimLiftFactor !== undefined) mat.parametricRimLiftFactor = baseline.parametricRimLiftFactor;
      if (baseline.parametricRimFresnelPowerFactor !== undefined) {
        mat.parametricRimFresnelPowerFactor = baseline.parametricRimFresnelPowerFactor;
      }
      if (baseline.rimLightingMixFactor !== undefined) mat.rimLightingMixFactor = baseline.rimLightingMixFactor;
      if (baseline.outlineWidthFactor !== undefined) mat.outlineWidthFactor = baseline.outlineWidthFactor;
      if (baseline.outlineLightingMixFactor !== undefined) {
        mat.outlineLightingMixFactor = baseline.outlineLightingMixFactor;
      }
      if (mat.userData) {
        delete mat.userData.shaperMaterialUniforms;
        delete mat.userData.shaperHairInlineSuppressed;
      }
      mat.needsUpdate = true;
    }
  });
  return restored.size;
}

export interface ShaperHairSpringBoneSettings {
  readonly stiffness: number;
  readonly gravityPower: number;
  readonly dragForce: number;
}

interface SpringBoneJointLike {
  readonly bone?: { readonly name?: string } | null;
  readonly settings?: {
    stiffness?: number;
    gravityPower?: number;
    dragForce?: number;
  } | null;
}

interface VrmLikeWithSpringBones {
  readonly springBoneManager?: {
    readonly joints?: Iterable<SpringBoneJointLike> | null;
  } | null;
}

/**
 * VRM SpringBone 헤어 조인트의 탄성·중력·드래그를 실시간으로 반영한다.
 */
export function applyHairSpringBoneToVrm(
  vrm: VrmLikeWithSpringBones | null | undefined,
  next: ShaperHairSpringBoneSettings,
): number {
  const joints = vrm?.springBoneManager?.joints;
  if (!joints) return 0;
  let updated = 0;
  for (const joint of joints) {
    const boneName = String(joint?.bone?.name ?? "");
    const isHairJoint = /hair|bang|tail|braid|strand|ahoge/iu.test(boneName) || boneName === "";
    if (!isHairJoint || !joint?.settings) continue;
    joint.settings.stiffness = next.stiffness;
    joint.settings.gravityPower = next.gravityPower;
    joint.settings.dragForce = next.dragForce;
    updated += 1;
  }
  return updated;
}
