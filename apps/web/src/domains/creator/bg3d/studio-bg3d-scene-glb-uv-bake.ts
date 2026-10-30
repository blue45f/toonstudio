/**
 * 2026-10-29 migration: 현재 UV affine 변환을 개인 geometry에 굽는 경계.
 * 별도 ORM 이미지의 packing은 artifact의 후속 bridge가 맡는다. projective·4개를 넘는 UV recipe는 거부한다.
 */
import * as THREE from "three";
import type { StudioBg3dSceneGlbMetalRoughPacking } from "./studio-bg3d-scene-glb-texture-transform";

export type StudioBg3dSceneGlbUvBakeReason = "aborted" | "uv-texture-mapping-unsupported" | "uv-channel-out-of-range"
  | "uv-shader-material-unsupported"
  | "uv-source-attribute-missing" | "uv-source-attribute-invalid" | "uv-transform-not-finite" | "uv-projective-transform"
  | "uv-channel-budget-exceeded" | "uv-baked-coordinate-not-finite" | "uv-morph-attributes-require-owned-bake"
  | "separate-metal-rough-textures-require-owned-packing" | "uv-resource-clone-failed" | "uv-resource-cleanup-failed";
export interface StudioBg3dSceneGlbUvBakeRecipe {
  readonly sourceChannel: number;
  readonly bakedChannel: number;
  readonly matrix: readonly number[];
  readonly textureBindingCount: number;
}
export type StudioBg3dSceneGlbUvBakeResult = {
  readonly ok: true;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material | THREE.Material[];
  readonly recipes: readonly StudioBg3dSceneGlbUvBakeRecipe[];
  /** 입력 mesh는 바꾸지 않는다. 반환 binding을 분리한 뒤 그 개인 자원만 해제한다. */
  dispose(): void;
} | {
  readonly ok: false;
  readonly code: "aborted" | "unsupported-feature" | "build-failed";
  readonly reason: StudioBg3dSceneGlbUvBakeReason;
  readonly nodeIds: readonly string[];
  readonly messageKo: string;
};
interface Recipe {
  readonly key: string;
  readonly sourceChannel: number;
  readonly matrix: THREE.Matrix3;
  readonly attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  bindingCount: number;
}
interface Binding { readonly source: THREE.Texture; readonly key: string; readonly recipe: Recipe }
class BakeFailure extends Error {
  constructor(readonly reason: StudioBg3dSceneGlbUvBakeReason) { super(reason); }
}
function fail(reason: StudioBg3dSceneGlbUvBakeReason): never { throw new BakeFailure(reason); }
function active(signal?: AbortSignal): void { if (signal?.aborted) fail("aborted"); }
function uvName(channel: number): string { return channel === 0 ? "uv" : `uv${channel}`; }
function identity(matrix: THREE.Matrix3): boolean { return matrix.equals(new THREE.Matrix3()); }
function actualMatrix(texture: THREE.Texture): THREE.Matrix3 {
  // cache.matrix가 아직 갱신되지 않았더라도 cache에 updateMatrix()를 호출하지 않는다.
  const matrix = texture.matrixAutoUpdate ? new THREE.Matrix3().setUvTransform(texture.offset.x, texture.offset.y,
    texture.repeat.x, texture.repeat.y, texture.rotation, texture.center.x, texture.center.y) : texture.matrix.clone();
  if (!matrix.elements.every(Number.isFinite)) fail("uv-transform-not-finite");
  const e = matrix.elements;
  if (e[2] !== 0 || e[5] !== 0 || e[8] !== 1) fail("uv-projective-transform");
  return matrix;
}
function attributeFor(geometry: THREE.BufferGeometry, channel: number): THREE.BufferAttribute | THREE.InterleavedBufferAttribute {
  const attribute = geometry.getAttribute(uvName(channel));
  if (!attribute) fail("uv-source-attribute-missing");
  const position = geometry.getAttribute("position");
  if (!position || attribute.itemSize !== 2 || !Number.isSafeInteger(attribute.count) || attribute.count < 1
    || attribute.count !== position.count) fail("uv-source-attribute-invalid");
  return attribute;
}
function packedMaps(material: THREE.Material, packing: StudioBg3dSceneGlbMetalRoughPacking): void {
  // exporter:945의 pointer 동등성 early return만 안전하다. 다른 이미지는 같은 recipe여도 따로 합치지 않는다.
  if (packing !== "deferred-owned" && material instanceof THREE.MeshStandardMaterial && material.roughnessMap && material.metalnessMap
    && material.roughnessMap !== material.metalnessMap) fail("separate-metal-rough-textures-require-owned-packing");
}
function textureBindings(material: THREE.Material): Array<readonly [string, THREE.Texture]> {
  const result: Array<readonly [string, THREE.Texture]> = [];
  for (const key of Object.keys(material)) {
    const descriptor = Object.getOwnPropertyDescriptor(material, key);
    const value: unknown = descriptor && "value" in descriptor ? descriptor.value : undefined;
    if (value instanceof THREE.Texture) result.push([key, value]);
  }
  return result;
}
function allocateChannels(recipes: readonly Recipe[], geometry: THREE.BufferGeometry): Map<Recipe, number> {
  if (recipes.length > 4) fail("uv-channel-budget-exceeded");
  const result = new Map<Recipe, number>(), occupied = new Set<number>();
  for (let sourceChannel = 0; sourceChannel < 4; sourceChannel++) {
    const candidates = recipes.filter((recipe) => recipe.sourceChannel === sourceChannel);
    const candidate = candidates.find(({ matrix }) => identity(matrix)) ?? candidates[0];
    if (candidate) { result.set(candidate, sourceChannel); occupied.add(sourceChannel); }
  }
  for (const recipe of recipes) {
    if (result.has(recipe)) continue;
    const free = [0, 1, 2, 3].filter((channel) => !occupied.has(channel));
    // 사용하지 않는 기존 UV보다 빈 슬롯을 먼저 쓴다. 입력 attribute는 어느 경우에도 수정하지 않는다.
    const channel = free.find((value) => !geometry.hasAttribute(uvName(value))) ?? free[0];
    if (channel === undefined) fail("uv-channel-budget-exceeded");
    result.set(recipe, channel); occupied.add(channel);
  }
  return result;
}
function bakedAttribute(recipe: Recipe, signal?: AbortSignal): THREE.Float32BufferAttribute {
  const values = new Float32Array(recipe.attribute.count * 2), e = recipe.matrix.elements;
  for (let index = 0; index < recipe.attribute.count; index++) {
    if (index % 1024 === 0) active(signal);
    const u = recipe.attribute.getX(index), v = recipe.attribute.getY(index);
    if (!Number.isFinite(u) || !Number.isFinite(v)) fail("uv-source-attribute-invalid");
    const x = e[0] * u + e[3] * v + e[6], y = e[1] * u + e[4] * v + e[7];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(Math.fround(x)) || !Number.isFinite(Math.fround(y))) fail("uv-baked-coordinate-not-finite");
    values[index * 2] = x; values[index * 2 + 1] = y;
  }
  return new THREE.Float32BufferAttribute(values, 2);
}
function privateTexture(source: THREE.Texture): THREE.Texture {
  // Texture.copy는 Source.version도 올리므로 새 Source를 보게 한 뒤 subclass의 clone 계약을 사용한다.
  const isolatedSource = new THREE.Source(source.source.data); isolatedSource.dataReady = source.source.dataReady;
  return new Proxy(source, { get(target, key, receiver) {
    if (key === "source") return isolatedSource;
    return Reflect.get(target, key, receiver);
  } }).clone();
}

/**
 * 입력 mesh·cache를 쓰지 않고 mesh 단위 개인 binding을 반환한다. 같은 recipe는 같은 UV channel을 쓴다.
 * caller가 반환 geometry/material을 설치하며, dispose 전에 그 binding을 분리할 책임도 caller에 있다.
 * 유효한 UV slot은 설치 exporter/loader/WebGL shader의 공통 범위인 0..3이다.
 */
export function bakeStudioBg3dSceneGlbMeshUvs(mesh: THREE.Mesh, nodeId: string, signal?: AbortSignal,
  packing: StudioBg3dSceneGlbMetalRoughPacking = "shared-only"): StudioBg3dSceneGlbUvBakeResult {
  const disposals: (() => void)[] = [];
  const dispose = () => {
    const errors: unknown[] = [];
    for (const cleanup of disposals.splice(0).reverse()) { try { cleanup(); } catch (error) { errors.push(error); } }
    if (errors.length > 0) throw new AggregateError(errors, "UV bake 개인 자원 정리에 실패했습니다.");
  };
  try {
    active(signal);
    if (Object.keys(mesh.geometry.morphAttributes).some((key) => /^uv[0-3]?$/u.test(key))) fail("uv-morph-attributes-require-owned-bake");
    const sourceMaterials: THREE.Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const recipesByKey = new Map<string, Recipe>(), bindingsByMaterial = new Map<THREE.Material, Binding[]>();
    for (const material of sourceMaterials) {
      if (bindingsByMaterial.has(material)) continue;
      // ShaderMaterial.copy의 uniform Texture clone은 cache Source.version을 올릴 수 있어 복제 전에 거부한다.
      if (material instanceof THREE.ShaderMaterial || material instanceof THREE.RawShaderMaterial) fail("uv-shader-material-unsupported");
      packedMaps(material, packing); const bindings: Binding[] = [];
      for (const [key, source] of textureBindings(material)) {
        if (source.mapping !== THREE.UVMapping) fail("uv-texture-mapping-unsupported");
        if (!Number.isInteger(source.channel) || source.channel < 0 || source.channel > 3) fail("uv-channel-out-of-range");
        const matrix = actualMatrix(source), recipeKey = JSON.stringify([source.channel, matrix.elements]);
        let recipe = recipesByKey.get(recipeKey);
        if (!recipe) {
          recipe = { key: recipeKey, sourceChannel: source.channel, matrix, attribute: attributeFor(mesh.geometry, source.channel), bindingCount: 0 };
          recipesByKey.set(recipeKey, recipe);
        }
        recipe.bindingCount++; bindings.push({ source, key, recipe });
      }
      bindingsByMaterial.set(material, bindings);
    }
    const recipes = [...recipesByKey.values()], channels = allocateChannels(recipes, mesh.geometry);
    const geometry = mesh.geometry.clone(); disposals.push(() => geometry.dispose());
    const report: StudioBg3dSceneGlbUvBakeRecipe[] = [];
    for (const recipe of recipes) {
      const channel = channels.get(recipe); if (channel === undefined) fail("uv-channel-budget-exceeded");
      geometry.setAttribute(uvName(channel), bakedAttribute(recipe, signal));
      report.push({ sourceChannel: recipe.sourceChannel, bakedChannel: channel, matrix: recipe.matrix.toArray(), textureBindingCount: recipe.bindingCount });
    }
    const materials = new Map<THREE.Material, THREE.Material>(), textures = new Map<THREE.Texture, THREE.Texture>();
    for (const sourceMaterial of sourceMaterials) {
      if (materials.has(sourceMaterial)) continue;
      const material = sourceMaterial.clone(); materials.set(sourceMaterial, material); disposals.push(() => material.dispose());
      for (const binding of bindingsByMaterial.get(sourceMaterial) ?? []) {
        let texture = textures.get(binding.source);
        if (!texture) {
          texture = privateTexture(binding.source); textures.set(binding.source, texture);
          const owned = texture; disposals.push(() => owned.dispose());
          const channel = channels.get(binding.recipe); if (channel === undefined) fail("uv-channel-budget-exceeded");
          texture.channel = channel; texture.offset.set(0, 0); texture.repeat.set(1, 1); texture.center.set(0, 0);
          texture.rotation = 0; texture.matrix.identity(); texture.matrixAutoUpdate = true;
        }
        const descriptor = Object.getOwnPropertyDescriptor(material, binding.key);
        Object.defineProperty(material, binding.key, { ...descriptor, value: texture });
      }
    }
    const output = sourceMaterials.map((material) => { const result = materials.get(material); if (!result) fail("uv-resource-clone-failed"); return result; });
    const material = Array.isArray(mesh.material) ? output : output[0]; if (!material) fail("uv-resource-clone-failed");
    active(signal); return { ok: true, geometry, material, recipes: report, dispose };
  } catch (error) {
    let reason: StudioBg3dSceneGlbUvBakeReason = error instanceof BakeFailure ? error.reason : "uv-resource-clone-failed";
    try { dispose(); } catch { reason = "uv-resource-cleanup-failed"; }
    const code = reason === "aborted" ? "aborted" : reason === "uv-resource-clone-failed" || reason === "uv-resource-cleanup-failed" ? "build-failed" : "unsupported-feature";
    return { ok: false, code, reason, nodeIds: [nodeId], messageKo: reason === "aborted" ? "장면의 UV 변환 저장을 취소했습니다."
      : reason === "separate-metal-rough-textures-require-owned-packing" ? "서로 다른 roughness·metalness 이미지는 전용 packing 없이는 같은 모습으로 저장할 수 없습니다."
      : "장면의 UV 변환을 손실 없는 개인 geometry로 보존하지 못했습니다." };
  }
}
