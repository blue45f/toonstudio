import * as THREE from "three";

import { planStudioBg3dRoomBuild } from "./studio-bg3d-room-builder";

import type { BgPrimitive } from "../studio-background-3d-metadata";

/**
 * 방 빌더가 만든 방을 three 메시로 옮긴 시험용 장면. 자동 단면이 카메라 쪽 벽을 visible:false 로 만든 것까지
 * 그대로 옮겨, 숨긴 벽이 벽 탐지에 어떻게 보이는지 실제 방 데이터로 확인한다.
 *
 * 방: 폭 6m × 깊이 5m, 벽 높이 3m, 벽 두께 0.2m, 문·창 없음(광선이 구멍으로 빠지지 않게). 벽 안쪽 면은
 * x = ±2.9, z = ±2.4 다. 카메라가 남쪽(+Z) 바깥에서 안을 보면 남쪽(앞벽)이 숨겨진다.
 */
export const CUTAWAY_ROOM_SPEC = Object.freeze({
  width: 6,
  depth: 5,
  wallHeight: 3,
  wallThickness: 0.2,
  openings: [],
  furniture: [],
});

export const CUTAWAY_ROOM_INNER_FACE = Object.freeze({ x: 2.9, z: 2.4 });

export const OUTSIDE_SOUTH_CAMERA = Object.freeze({
  position: [0, 2, 14] as const,
  target: [0, 1, 0] as const,
});

const MATERIAL = new THREE.MeshBasicMaterial();

function meshOf(primitive: BgPrimitive): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), MATERIAL);
  mesh.name = primitive.name ?? primitive.id;
  mesh.position.set(...primitive.position);
  mesh.rotation.set(...primitive.rotation);
  mesh.scale.set(...primitive.scale);
  mesh.visible = primitive.visible !== false;
  mesh.updateMatrixWorld(true);
  return mesh;
}

export interface CutawayRoomScene {
  readonly primitives: readonly BgPrimitive[];
  /** primitiveObjectsRef 와 같은 모양(id → 오브젝트). 상자(box)로 만든 파츠만 옮긴다. */
  readonly objects: Map<string, THREE.Object3D>;
  readonly hiddenIds: readonly string[];
}

/** 자동 단면 카메라를 주면 가려지는 벽이 숨겨진 방, 주지 않으면 모든 벽이 보이는 방. */
export function buildCutawayRoomScene(
  camera: { readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number] } | null = OUTSIDE_SOUTH_CAMERA,
): CutawayRoomScene {
  let counter = 0;
  const plan = planStudioBg3dRoomBuild(CUTAWAY_ROOM_SPEC, 0, () => `room-part-${counter++}`, {
    autoCutawayCamera: camera,
  });
  const objects = new Map<string, THREE.Object3D>();
  for (const primitive of plan.primitives) {
    if (primitive.kind === "box") objects.set(primitive.id, meshOf(primitive));
  }
  return {
    primitives: plan.primitives,
    objects,
    hiddenIds: plan.primitives.filter((primitive) => primitive.visible === false).map((primitive) => primitive.id),
  };
}

/** 모든 벽 오브젝트를 숨긴다(사방이 숨겨진 방). */
export function hideEveryRoomObject(scene: CutawayRoomScene): void {
  for (const object of scene.objects.values()) object.visible = false;
}
