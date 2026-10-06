/**
 * Studio BG3D 가져오기 예산 단언 — 파싱된 모델이 노드·메시·정점·재질·애니메이션
 * 한도를 넘지 않는지 검증한다. 한도 상수와 오류 계약은 공유 기반 모듈이 정본이다.
 */

import type { StudioBg3dGlbValidationBudget } from "./studio-bg3d-glb-validation";
import {
  STUDIO_BG3D_IMPORT_MAX_ACCESSOR_ELEMENTS,
  STUDIO_BG3D_IMPORT_MAX_ANIMATION_BYTES,
  STUDIO_BG3D_IMPORT_MAX_ANIMATION_CLIPS,
  STUDIO_BG3D_IMPORT_MAX_ANIMATION_DURATION_SECONDS,
  STUDIO_BG3D_IMPORT_MAX_ANIMATION_KEYFRAMES,
  STUDIO_BG3D_IMPORT_MAX_ANIMATION_TRACKS,
  STUDIO_BG3D_IMPORT_MAX_DECODED_GEOMETRY_BYTES,
  STUDIO_BG3D_IMPORT_MAX_EXPORT_MATERIALS,
  STUDIO_BG3D_IMPORT_MAX_EXPORT_MATERIAL_SLOTS,
  STUDIO_BG3D_IMPORT_MAX_MESHES,
  STUDIO_BG3D_IMPORT_MAX_MESH_PRIMITIVES,
  STUDIO_BG3D_IMPORT_MAX_NODES,
  STUDIO_BG3D_IMPORT_MAX_TRIANGLES,
  STUDIO_BG3D_IMPORT_MAX_VERTICES,
  importError,
  profileLimit,
  safeAddCount,
  safeMultiplyCount,
  throwIfAborted,
} from "./studio-bg3d-model-import-shared";

import type * as THREE from "three";


export function assertParsedImportBudgets(
  root: THREE.Object3D,
  signal?: AbortSignal,
  budget?: StudioBg3dGlbValidationBudget,
): void {
  const stack: THREE.Object3D[] = [root];
  const visited = new Set<THREE.Object3D>();
  const geometryBuffers = new Set<ArrayBufferLike>();
  const accessorAttributes = new Set<THREE.BufferAttribute | THREE.InterleavedBufferAttribute>();
  let nodes = 0;
  let meshes = 0;
  let drawCalls = 0;
  let vertices = 0;
  let triangles = 0;
  let accessorElements = 0;
  let geometryBytes = 0;
  const nodeLimit = profileLimit(
    STUDIO_BG3D_IMPORT_MAX_NODES,
    budget?.complexity.maxNodes,
  );
  const drawCallLimit = profileLimit(
    STUDIO_BG3D_IMPORT_MAX_MESH_PRIMITIVES,
    budget?.complexity.maxDrawCalls,
  );
  const triangleLimit = profileLimit(
    STUDIO_BG3D_IMPORT_MAX_TRIANGLES,
    budget?.complexity.maxTriangles,
  );
  const accessorElementLimit = profileLimit(
    STUDIO_BG3D_IMPORT_MAX_ACCESSOR_ELEMENTS,
    budget?.complexity.maxAccessorElements,
  );
  const decodedGeometryByteLimit = profileLimit(
    STUDIO_BG3D_IMPORT_MAX_DECODED_GEOMETRY_BYTES,
    budget?.complexity.maxDecodedGeometryBytes,
  );

  const countAttribute = (
    attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  ): void => {
    if (!accessorAttributes.has(attribute)) {
      accessorAttributes.add(attribute);
      if (!Number.isSafeInteger(attribute.count) || attribute.count < 0) {
        throw importError("parse-failed");
      }
      accessorElements = safeAddCount(
        accessorElements,
        attribute.count,
        "geometry-memory-too-large",
      );
      if (accessorElements > accessorElementLimit) {
        throw importError("geometry-memory-too-large");
      }
    }
    const interleaved = attribute as THREE.InterleavedBufferAttribute;
    const array = interleaved.isInterleavedBufferAttribute === true
      ? interleaved.data.array
      : (attribute as THREE.BufferAttribute).array;
    if (!ArrayBuffer.isView(array) || geometryBuffers.has(array.buffer)) return;
    geometryBuffers.add(array.buffer);
    geometryBytes = safeAddCount(
      geometryBytes,
      array.buffer.byteLength,
      "geometry-memory-too-large",
    );
    if (geometryBytes > decodedGeometryByteLimit) {
      throw importError("geometry-memory-too-large");
    }
  };

  while (stack.length > 0) {
    if ((nodes & 0xff) === 0) throwIfAborted(signal);
    const object = stack.pop();
    if (!object || visited.has(object)) throw importError("parse-failed");
    visited.add(object);
    nodes = safeAddCount(nodes, 1, "node-budget-exceeded");
    if (nodes > nodeLimit) throw importError("node-budget-exceeded");
    for (const child of object.children) stack.push(child);

    const renderable = object as THREE.Object3D & {
      readonly count?: number;
      readonly geometry?: THREE.BufferGeometry;
      readonly isInstancedMesh?: boolean;
      readonly isLine?: boolean;
      readonly isMesh?: boolean;
      readonly isPoints?: boolean;
    };
    if (!renderable.isMesh && !renderable.isLine && !renderable.isPoints) continue;
    meshes = safeAddCount(meshes, 1, "mesh-budget-exceeded");
    if (meshes > STUDIO_BG3D_IMPORT_MAX_MESHES) throw importError("mesh-budget-exceeded");
    const geometry = renderable.geometry;
    if (!geometry?.isBufferGeometry) throw importError("parse-failed");
    const primitiveCount = Math.max(1, geometry.groups.length);
    drawCalls = safeAddCount(drawCalls, primitiveCount, "mesh-budget-exceeded");
    if (drawCalls > drawCallLimit) throw importError("mesh-budget-exceeded");
    const position = geometry.getAttribute("position");
    if (!position || !Number.isSafeInteger(position.count) || position.count < 0) {
      throw importError("parse-failed");
    }
    const instances = renderable.isInstancedMesh ? renderable.count : 1;
    if (!Number.isSafeInteger(instances) || (instances ?? -1) < 0) throw importError("parse-failed");
    const effectiveInstances = instances ?? 1;
    const effectiveVertices = safeMultiplyCount(
      position.count,
      effectiveInstances,
      "vertex-budget-exceeded",
    );
    vertices = safeAddCount(vertices, effectiveVertices, "vertex-budget-exceeded");
    if (vertices > STUDIO_BG3D_IMPORT_MAX_VERTICES) throw importError("vertex-budget-exceeded");

    if (renderable.isMesh) {
      const elements = geometry.index?.count ?? position.count;
      if (!Number.isSafeInteger(elements) || elements < 0) throw importError("parse-failed");
      const effectiveTriangles = safeMultiplyCount(
        Math.floor(elements / 3),
        effectiveInstances,
        "triangle-budget-exceeded",
      );
      triangles = safeAddCount(triangles, effectiveTriangles, "triangle-budget-exceeded");
      if (triangles > triangleLimit) {
        throw importError("triangle-budget-exceeded");
      }
    }

    if (geometry.index) countAttribute(geometry.index);
    for (const attribute of Object.values(geometry.attributes)) countAttribute(attribute);
    for (const attributes of Object.values(geometry.morphAttributes)) {
      for (const attribute of attributes) countAttribute(attribute);
    }
  }
}

export function assertParsedMaterialBudgets(
  root: THREE.Object3D,
  signal?: AbortSignal,
  budget?: StudioBg3dGlbValidationBudget,
): void {
  const stack: THREE.Object3D[] = [root];
  const visited = new Set<THREE.Object3D>();
  const materials = new Set<THREE.Material>();
  let materialSlots = 0;
  const materialLimit = profileLimit(
    STUDIO_BG3D_IMPORT_MAX_EXPORT_MATERIALS,
    budget?.complexity.maxMaterials,
  );

  while (stack.length > 0) {
    if ((visited.size & 0xff) === 0) throwIfAborted(signal);
    const object = stack.pop();
    if (!object || visited.has(object)) throw importError("parse-failed");
    visited.add(object);
    for (const child of object.children) stack.push(child);

    const material = (object as THREE.Object3D & {
      readonly material?: THREE.Material | readonly THREE.Material[];
    }).material;
    if (!material) continue;
    const slots = Array.isArray(material) ? material : [material];
    materialSlots = safeAddCount(
      materialSlots,
      slots.length,
      "material-budget-exceeded",
    );
    if (materialSlots > STUDIO_BG3D_IMPORT_MAX_EXPORT_MATERIAL_SLOTS) {
      throw importError("material-budget-exceeded");
    }
    for (const candidate of slots) {
      if (!candidate || typeof candidate !== "object") throw importError("parse-failed");
      materials.add(candidate);
      if (materials.size > materialLimit) {
        throw importError("material-budget-exceeded");
      }
    }
  }
}

type StudioAnimationNumberArray = ArrayLike<number> & ArrayBufferView;

function animationNumberArray(value: unknown): ArrayLike<number> | null {
  if (Array.isArray(value)) return value;
  if (!ArrayBuffer.isView(value) || value instanceof DataView) return null;
  const length = (value as { readonly length?: unknown }).length;
  return Number.isSafeInteger(length) && (length as number) >= 0
    ? value as StudioAnimationNumberArray
    : null;
}

function countAnimationArrayBytes(
  values: ArrayLike<number>,
  countedBuffers: Set<ArrayBufferLike>,
): number {
  if (ArrayBuffer.isView(values)) {
    if (countedBuffers.has(values.buffer)) return 0;
    countedBuffers.add(values.buffer);
    return values.buffer.byteLength;
  }
  return safeMultiplyCount(values.length, 8, "animation-budget-exceeded");
}

function assertAnimationNumberArray(
  values: ArrayLike<number>,
  signal: AbortSignal | undefined,
  options: { nondecreasing?: boolean } = {},
): void {
  let previous = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < values.length; index += 1) {
    if ((index & 0x3fff) === 0) throwIfAborted(signal);
    const value = values[index];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw importError("animation-budget-exceeded");
    }
    if (options.nondecreasing && value < previous) {
      throw importError("animation-budget-exceeded");
    }
    previous = value;
  }
}

export function assertParsedAnimationBudgets(
  animations: readonly THREE.AnimationClip[],
  signal?: AbortSignal,
  budget?: StudioBg3dGlbValidationBudget,
): void {
  const animationClipLimit = profileLimit(
    STUDIO_BG3D_IMPORT_MAX_ANIMATION_CLIPS,
    budget?.complexity.maxAnimations,
  );
  const animationTrackLimit = profileLimit(
    STUDIO_BG3D_IMPORT_MAX_ANIMATION_TRACKS,
    budget?.complexity.maxAnimationChannels,
  );
  const animationKeyframeLimit = profileLimit(
    STUDIO_BG3D_IMPORT_MAX_ANIMATION_KEYFRAMES,
    budget?.complexity.maxAnimationKeyframes,
  );
  if (
    !Array.isArray(animations)
    || animations.length > animationClipLimit
  ) {
    throw importError("animation-budget-exceeded");
  }
  const countedBuffers = new Set<ArrayBufferLike>();
  let tracks = 0;
  let keyframes = 0;
  let animationValues = 0;
  let decodedBytes = 0;

  for (const clip of animations) {
    throwIfAborted(signal);
    if (
      !clip
      || typeof clip !== "object"
      || typeof clip.name !== "string"
      || clip.name.length > 256
      || !Number.isFinite(clip.duration)
      || clip.duration < 0
      || clip.duration > STUDIO_BG3D_IMPORT_MAX_ANIMATION_DURATION_SECONDS
      || !Array.isArray(clip.tracks)
    ) {
      throw importError("animation-budget-exceeded");
    }
    tracks = safeAddCount(tracks, clip.tracks.length, "animation-budget-exceeded");
    if (tracks > animationTrackLimit) {
      throw importError("animation-budget-exceeded");
    }

    for (const track of clip.tracks) {
      if (!track || typeof track.name !== "string" || track.name.length > 512) {
        throw importError("animation-budget-exceeded");
      }
      const times = animationNumberArray(track.times);
      const values = animationNumberArray(track.values);
      if (!times || !values || (times.length === 0 ? values.length !== 0 : values.length % times.length !== 0)) {
        throw importError("animation-budget-exceeded");
      }
      keyframes = safeAddCount(keyframes, times.length, "animation-budget-exceeded");
      if (keyframes > animationKeyframeLimit) {
        throw importError("animation-budget-exceeded");
      }
      animationValues = safeAddCount(
        animationValues,
        values.length,
        "animation-budget-exceeded",
      );
      if (
        budget
        && animationValues > budget.complexity.maxAnimationValues
      ) {
        throw importError("animation-budget-exceeded");
      }
      decodedBytes = safeAddCount(
        decodedBytes,
        countAnimationArrayBytes(times, countedBuffers),
        "animation-budget-exceeded",
      );
      decodedBytes = safeAddCount(
        decodedBytes,
        countAnimationArrayBytes(values, countedBuffers),
        "animation-budget-exceeded",
      );
      if (decodedBytes > STUDIO_BG3D_IMPORT_MAX_ANIMATION_BYTES) {
        throw importError("animation-budget-exceeded");
      }
      assertAnimationNumberArray(times, signal, { nondecreasing: true });
      assertAnimationNumberArray(values, signal);
    }
  }
}
