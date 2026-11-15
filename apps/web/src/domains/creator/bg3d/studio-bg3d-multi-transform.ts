import * as THREE from "three";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import {
  groundModelTransform,
  groundPrimitiveTransform,
  isBgObjectTransformBlocked,
  snapEulerRadians,
  snapVec3,
  type StudioBg3dSnapSettings,
} from "./studio-bg3d-object-ops";
import { hasStudioBg3dSelectedAncestor } from "./studio-bg3d-template-instance";
import {
  calculateStudioBg3dThreeWorldDeltaTransform,
  type StudioBg3dThreeLocalTransform,
} from "./studio-bg3d-three-hierarchy";

export type StudioBg3dGizmoTransformMode = "translate" | "rotate" | "scale";

/**
 * 다중 선택 기즈모 조작 시 현재 활성 변환 모드(이동·회전·크기)에 해당하는 축만 기준 오브젝트에 스냅한다.
 * 이동 중 기존 비격자 회전값이나 회전 중 기존 비격자 위치값이 스냅 격자로 뭉개지지 않게 지킨다.
 */
export function resolveStudioBg3dModeAwareDriverTransform(
  rawTransform: StudioBg3dThreeLocalTransform,
  mode: StudioBg3dGizmoTransformMode,
  snap: boolean,
  snapSettings: StudioBg3dSnapSettings,
): StudioBg3dThreeLocalTransform {
  const position: [number, number, number] = [...rawTransform.position];
  const rotation: [number, number, number] = [...rawTransform.rotation];
  const scale: [number, number, number] = [...rawTransform.scale];
  if (!snap || !snapSettings.enabled) {
    return { position, rotation, scale };
  }
  if (mode === "translate") {
    return {
      position: snapVec3(position, snapSettings.translateStep, snapSettings.translateAxes),
      rotation,
      scale,
    };
  }
  if (mode === "rotate") {
    return {
      position,
      rotation: snapEulerRadians(rotation, snapSettings.rotateStepDegrees),
      scale,
    };
  }
  return { position, rotation, scale };
}

/**
 * 스냅 반영 후 기준 오브젝트의 실제 월드 행렬을 재구성한다.
 * 추종 오브젝트들이 스냅 전 기준 행렬이 아닌 스냅 후 기준 행렬과 동일한 강체 델타를 공유하도록 보장한다.
 */
export function composeStudioBg3dDriverWorldMatrix(
  driverLocal: StudioBg3dThreeLocalTransform,
  driverParentWorldMatrix?: THREE.Matrix4 | null,
): THREE.Matrix4 {
  const local = new THREE.Matrix4().compose(
    new THREE.Vector3(...driverLocal.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...driverLocal.rotation, "XYZ")),
    new THREE.Vector3(...driverLocal.scale),
  );
  return driverParentWorldMatrix ? driverParentWorldMatrix.clone().multiply(local) : local;
}

/**
 * 추종 오브젝트에 개별 격자 스냅을 중복 적용하지 않고, 기준 오브젝트의 강체 월드 델타만 그대로 전달해
 * 다중 선택된 오브젝트 사이의 상대 간격과 상대 회전을 보존한다.
 */
export function calculateStudioBg3dMultiSelectFollowerTransform(input: {
  readonly initialDriverWorldMatrix: THREE.Matrix4;
  readonly effectiveDriverWorldMatrix: THREE.Matrix4;
  readonly initialTargetWorldMatrix: THREE.Matrix4;
  readonly targetParentWorldMatrix?: THREE.Matrix4 | null;
}): StudioBg3dThreeLocalTransform | null {
  return calculateStudioBg3dThreeWorldDeltaTransform({
    initialDriverWorldMatrix: input.initialDriverWorldMatrix,
    currentDriverWorldMatrix: input.effectiveDriverWorldMatrix,
    initialTargetWorldMatrix: input.initialTargetWorldMatrix,
    targetParentWorldMatrix: input.targetParentWorldMatrix,
  });
}

function sameTuple3(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

/** 기즈모 드래그 시작 전후 장면 엔티티 변환 변경 여부를 판정한다. */
export function hasStudioBg3dEntityTransformChanged(
  before: {
    readonly primitives: readonly BgPrimitive[];
    readonly customModels: readonly BgCustomModelInstance[];
  },
  after: {
    readonly primitives: readonly BgPrimitive[];
    readonly customModels: readonly BgCustomModelInstance[];
  },
): boolean {
  if (
    before.primitives.length !== after.primitives.length ||
    before.customModels.length !== after.customModels.length
  ) {
    return true;
  }
  for (let index = 0; index < before.primitives.length; index += 1) {
    const prev = before.primitives[index];
    const next = after.primitives[index];
    if (
      !prev ||
      !next ||
      prev.id !== next.id ||
      !sameTuple3(prev.position, next.position) ||
      !sameTuple3(prev.rotation, next.rotation) ||
      !sameTuple3(prev.scale, next.scale)
    ) {
      return true;
    }
  }
  for (let index = 0; index < before.customModels.length; index += 1) {
    const prev = before.customModels[index];
    const next = after.customModels[index];
    if (
      !prev ||
      !next ||
      prev.id !== next.id ||
      !sameTuple3(prev.position, next.position) ||
      !sameTuple3(prev.rotation, next.rotation) ||
      !sameTuple3(prev.scale, next.scale)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * 선택된 다중 오브젝트의 바닥 접지 좌표를 한 번의 배치 패치로 계산한다.
 * 이미 선택된 조상이 함께 접지되는 자식 노드는 중복 이동에서 제외해 계층 상대 배치를 보존한다.
 */
export function planStudioBg3dGroundSelection(input: {
  readonly selectedIds: ReadonlySet<string>;
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly readSceneObject: (id: string) => THREE.Object3D | undefined;
  readonly readModelSize: (modelId: string) => [number, number, number];
}): {
  readonly changed: boolean;
  readonly primitives: BgPrimitive[];
  readonly customModels: BgCustomModelInstance[];
} {
  const { selectedIds, primitives, customModels, readSceneObject, readModelSize } = input;
  const entityById = new Map<string, BgPrimitive | BgCustomModelInstance>([
    ...primitives.map((primitive): [string, BgPrimitive] => [primitive.id, primitive]),
    ...customModels.map((model): [string, BgCustomModelInstance] => [model.id, model]),
  ]);
  const hasSelectedActiveAncestor = (item: BgPrimitive | BgCustomModelInstance): boolean =>
    hasStudioBg3dSelectedAncestor(
      item,
      selectedIds,
      (id: string) => entityById.get(id),
      (ancestor: BgPrimitive | BgCustomModelInstance) => !isBgObjectTransformBlocked(ancestor),
    );

  const groundedPositions = new Map<string, [number, number, number]>();

  for (const id of selectedIds) {
    const entity = entityById.get(id);
    if (!entity || isBgObjectTransformBlocked(entity) || hasSelectedActiveAncestor(entity)) {
      continue;
    }
    const object = readSceneObject(id);
    if (object) {
      object.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(object);
      if (!bounds.isEmpty() && Number.isFinite(bounds.min.y)) {
        const nextWorldPosition = object.getWorldPosition(new THREE.Vector3());
        nextWorldPosition.y -= bounds.min.y;
        object.parent?.updateWorldMatrix(true, false);
        const nextLocalPosition = object.parent
          ? object.parent.worldToLocal(nextWorldPosition)
          : nextWorldPosition;
        groundedPositions.set(id, [
          nextLocalPosition.x,
          nextLocalPosition.y,
          nextLocalPosition.z,
        ]);
        continue;
      }
    }
    if (entity.parentId) continue;
    if ("kind" in entity) {
      groundedPositions.set(
        id,
        groundPrimitiveTransform(entity.kind, entity.position, entity.rotation, entity.scale),
      );
    } else {
      groundedPositions.set(
        id,
        groundModelTransform(
          readModelSize(entity.modelId),
          entity.position,
          entity.rotation,
          entity.scale,
        ),
      );
    }
  }

  let changed = false;
  const nextPrimitives = primitives.map((primitive) => {
    const nextPos = groundedPositions.get(primitive.id);
    if (!nextPos || sameTuple3(primitive.position, nextPos)) return primitive;
    changed = true;
    return { ...primitive, position: nextPos };
  });
  const nextCustomModels = customModels.map((model) => {
    const nextPos = groundedPositions.get(model.id);
    if (!nextPos || sameTuple3(model.position, nextPos)) return model;
    changed = true;
    return { ...model, position: nextPos };
  });

  return { changed, primitives: nextPrimitives, customModels: nextCustomModels };
}
