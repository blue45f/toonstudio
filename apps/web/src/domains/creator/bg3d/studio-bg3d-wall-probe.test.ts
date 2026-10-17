import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { probeStudioBg3dNearestWall } from "./studio-bg3d-wall-probe";

import type { StudioBg3dPlacementWall } from "./studio-bg3d-asset-placement-recipes";

/** 상자 정점은 float32 라 좌표가 정확히 떨어지지 않는다. 축·방향은 정확히, 좌표는 1e-5 안에서 비교한다. */
function expectWall(actual: StudioBg3dPlacementWall | null, expected: StudioBg3dPlacementWall): void {
  expect(actual).not.toBeNull();
  expect(actual?.axis).toBe(expected.axis);
  expect(actual?.direction).toBe(expected.direction);
  expect(actual?.coordinate).toBeCloseTo(expected.coordinate, 5);
}

const MATERIAL = new THREE.MeshBasicMaterial();

/** 두께 0.2m 의 벽 상자. 중심 좌표와 크기를 월드에 그대로 둔다. */
function wall(center: [number, number, number], size: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), MATERIAL);
  mesh.position.set(...center);
  return mesh;
}

function room(half = 5): THREE.Group {
  const group = new THREE.Group();
  group.add(
    wall([0, 1.5, -half], [half * 2, 3, 0.2]),
    wall([0, 1.5, half], [half * 2, 3, 0.2]),
    wall([-half, 1.5, 0], [0.2, 3, half * 2]),
    wall([half, 1.5, 0], [0.2, 3, half * 2]),
  );
  return group;
}

describe("probeStudioBg3dNearestWall", () => {
  it("방 안에서 가장 가까운 벽의 안쪽 면을 돌려준다(벽 두께 바깥이 아니라 안쪽 면)", () => {
    expectWall(probeStudioBg3dNearestWall([room()], [0, 1, -3]), { axis: "z", direction: 1, coordinate: -4.9 });
    expectWall(probeStudioBg3dNearestWall([room()], [3.5, 1, 0]), { axis: "x", direction: -1, coordinate: 4.9 });
    expectWall(probeStudioBg3dNearestWall([room()], [-3.5, 1, 0]), { axis: "x", direction: 1, coordinate: -4.9 });
    expectWall(probeStudioBg3dNearestWall([room()], [0, 1, 3.5]), { axis: "z", direction: -1, coordinate: 4.9 });
  });

  it("거리가 같으면 뒤쪽 벽(-Z)을 고른다", () => {
    expect(probeStudioBg3dNearestWall([room()], [0, 1, 0])).toMatchObject({ axis: "z", direction: 1 });
  });

  it("월드 변환이 적용된 부모 아래의 벽도 찾는다", () => {
    const parent = new THREE.Group();
    parent.position.set(10, 0, 0);
    parent.add(room(2));
    parent.updateWorldMatrix(true, true);
    expectWall(probeStudioBg3dNearestWall([parent], [10, 1, 0]), { axis: "z", direction: 1, coordinate: -1.9 });
  });

  it("숨긴 오브젝트와 바닥·천장은 벽으로 보지 않는다", () => {
    const hidden = room();
    hidden.visible = false;
    expect(probeStudioBg3dNearestWall([hidden], [0, 1, 0])).toBeNull();

    const floorOnly = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    floorOnly.rotation.x = -Math.PI / 2;
    expect(probeStudioBg3dNearestWall([floorOnly], [0, 1, 0])).toBeNull();
  });

  it("가장 가까운 수직 면이 비스듬하면 그 방향에는 벽이 없다고 보고 다른 방향에서 찾는다", () => {
    const slanted = new THREE.Group();
    const tilted = wall([0, 1.5, -3], [8, 3, 0.2]);
    tilted.rotation.y = THREE.MathUtils.degToRad(35);
    slanted.add(tilted, wall([6, 1.5, 0], [0.2, 3, 12]));
    slanted.updateWorldMatrix(true, true);
    expectWall(probeStudioBg3dNearestWall([slanted], [0, 1, 0]), { axis: "x", direction: -1, coordinate: 5.9 });

    const onlyTilted = new THREE.Group();
    onlyTilted.add(tilted);
    expect(probeStudioBg3dNearestWall([onlyTilted], [0, 1, 0])).toBeNull();
  });

  it("더 가까운 벽을 이긴다", () => {
    const group = new THREE.Group();
    group.add(wall([0, 1.5, -8], [20, 3, 0.2]), wall([2, 1.5, 0], [0.2, 3, 20]));
    expectWall(probeStudioBg3dNearestWall([group], [0, 1, 0]), { axis: "x", direction: -1, coordinate: 1.9 });
  });

  it("최대 거리를 넘는 벽과 벽이 없는 장면은 null 이다", () => {
    expect(probeStudioBg3dNearestWall([room(50)], [0, 1, 0], { maxDistance: 10 })).toBeNull();
    expect(probeStudioBg3dNearestWall([], [0, 1, 0])).toBeNull();
    expect(probeStudioBg3dNearestWall([new THREE.Group()], [0, 1, 0])).toBeNull();
  });

  it("올바르지 않은 입력은 던지지 않고 null 을 돌려준다", () => {
    expect(probeStudioBg3dNearestWall([room()], [Number.NaN, 1, 0])).toBeNull();
    expect(probeStudioBg3dNearestWall([room()], [0, 1, 0], { maxDistance: 0 })).toBeNull();
    expect(probeStudioBg3dNearestWall([room()], [0, 1, 0], { maxDistance: Number.NaN })).toBeNull();
    expect(probeStudioBg3dNearestWall([null as never, room()], [0, 1, -3])).not.toBeNull();
  });
});
