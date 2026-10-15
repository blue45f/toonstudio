/**
 * 에디터 상태(BgPrimitive·커스텀 모델·측정 가이드) → 추론 서비스 입력 변환.
 *
 * 도형은 종류별 특징 표에서, 모델은 로컬 경계 상자에서만 후보를 만든다. 경계 상자는 장면 객체의
 * 지오메트리 `boundingBox`(three가 캐시)를 합칠 뿐 정점을 순회하지 않는다. 영구 측정 가이드는 월드
 * 좌표 선분이 되어 끝점·교차점 후보와 평행/수직 기준 방향이 된다.
 */

import * as THREE from "three";

import { resolveStudioBg3dMeasurementGuide } from "./studio-bg3d-measurement";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type {
  StudioBg3dInferenceLineSource,
  StudioBg3dInferenceSceneEntity,
} from "./studio-bg3d-inference-sources";
import type { StudioBg3dInferenceReferenceDirection } from "./studio-bg3d-inference-types";
import type { StudioBg3dMeasurementDocument } from "./studio-bg3d-measurement";

type V3 = StudioBg3dInferenceVec3;

export interface StudioBg3dInferenceLocalBounds {
  readonly min: V3;
  readonly max: V3;
}

/**
 * 객체 로컬 좌표계에서 본 메시 경계 상자 합집합. 정점 순회 없이 지오메트리의 캐시된 `boundingBox`만 쓴다.
 * 메시가 없거나 상자가 비어 있으면 null.
 */
export function readStudioBg3dInferenceLocalBounds(
  object: THREE.Object3D,
): StudioBg3dInferenceLocalBounds | null {
  object.updateWorldMatrix(true, true);
  const inverse = object.matrixWorld.clone().invert();
  const union = new THREE.Box3();
  const part = new THREE.Box3();
  const relative = new THREE.Matrix4();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    if (!bounds || bounds.isEmpty()) return;
    relative.multiplyMatrices(inverse, mesh.matrixWorld);
    union.union(part.copy(bounds).applyMatrix4(relative));
  });
  if (union.isEmpty()) return null;
  const finite = [union.min.x, union.min.y, union.min.z, union.max.x, union.max.y, union.max.z].every(Number.isFinite);
  if (!finite) return null;
  return { min: [union.min.x, union.min.y, union.min.z], max: [union.max.x, union.max.y, union.max.z] };
}

export interface BuildStudioBg3dInferenceEntitiesInput {
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  /** 장면 객체 id → three 객체. 모델의 경계 상자를 읽는 데 쓴다. */
  readonly objects: ReadonlyMap<string, THREE.Object3D> | null;
  /** 객체가 없는 모델(정적 배치 등)의 대체 경계 상자. */
  readonly fallbackModelBounds?: (instance: BgCustomModelInstance) => StudioBg3dInferenceLocalBounds | null;
}

export function buildStudioBg3dInferenceEntities(
  input: BuildStudioBg3dInferenceEntitiesInput,
): StudioBg3dInferenceSceneEntity[] {
  const entities: StudioBg3dInferenceSceneEntity[] = [];
  for (const primitive of input.primitives) {
    entities.push({
      id: primitive.id,
      kind: primitive.kind,
      ...(primitive.name ? { label: primitive.name } : {}),
      position: primitive.position,
      rotation: primitive.rotation,
      scale: primitive.scale,
      parentId: primitive.parentId ?? null,
      visible: primitive.visible !== false,
    });
  }
  for (const instance of input.customModels) {
    const object = input.objects?.get(instance.id);
    const bounds = (object ? readStudioBg3dInferenceLocalBounds(object) : null)
      ?? input.fallbackModelBounds?.(instance)
      ?? null;
    entities.push({
      id: instance.id,
      kind: "model",
      label: instance.name ?? "3D 모델",
      position: instance.position,
      rotation: instance.rotation,
      scale: instance.scale,
      parentId: instance.parentId ?? null,
      visible: instance.visible !== false,
      modelBounds: bounds,
    });
  }
  return entities;
}

export interface StudioBg3dInferenceGuideSources {
  readonly lines: StudioBg3dInferenceLineSource[];
  readonly directions: StudioBg3dInferenceReferenceDirection[];
}

/** 영구 측정 가이드 → 후보 선분과 평행·수직 기준 방향. 보이지 않는 가이드는 제외한다. */
export function buildStudioBg3dInferenceGuideSources(
  document: StudioBg3dMeasurementDocument,
): StudioBg3dInferenceGuideSources {
  const lines: StudioBg3dInferenceLineSource[] = [];
  const directions: StudioBg3dInferenceReferenceDirection[] = [];
  document.guides.forEach((guide, index) => {
    if (!guide.visible) return;
    const resolved = resolveStudioBg3dMeasurementGuide(guide, document.unit);
    if (!resolved.ok) return;
    const { measurement } = resolved.resolved;
    const label = `측정 가이드 ${index + 1} (${resolved.resolved.label})`;
    lines.push({ id: guide.id, a: measurement.startWorld, b: measurement.endWorld, label, role: "guide" });
    if (measurement.directionWorld) {
      directions.push({
        id: guide.id,
        label,
        direction: measurement.directionWorld,
        segment: { a: measurement.startWorld, b: measurement.endWorld },
      });
    }
  });
  return { lines, directions };
}
