import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import {
  calculateStudioBg3dMultiSelectFollowerTransform,
  composeStudioBg3dDriverWorldMatrix,
  hasStudioBg3dEntityTransformChanged,
  planStudioBg3dGroundSelection,
  resolveStudioBg3dModeAwareDriverTransform,
} from "./studio-bg3d-multi-transform";
import type { StudioBg3dSnapSettings } from "./studio-bg3d-object-ops";

const SNAP_ON: StudioBg3dSnapSettings = {
  enabled: true,
  translateStep: 0.25,
  rotateStepDegrees: 15,
  translateAxes: "xyz",
};

const deg = (value: number) => (value * Math.PI) / 180;

describe("studio-bg3d-multi-transform", () => {
  it("스냅 켜짐 이동(translate) 시 기존 비격자 회전과 추종 오브젝트 상대 간격·회전을 그대로 보존한다", () => {
    const initialDriverLocal = {
      position: [0.13, 0.5, -0.17] as [number, number, number],
      rotation: [0, deg(22), 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    };
    const initialFollowerLocal = {
      position: [1.5, 0.9, -0.8] as [number, number, number],
      rotation: [deg(10), deg(-33), deg(5)] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    };
    const initialSpacing = [
      initialFollowerLocal.position[0] - initialDriverLocal.position[0],
      initialFollowerLocal.position[1] - initialDriverLocal.position[1],
      initialFollowerLocal.position[2] - initialDriverLocal.position[2],
    ];

    const initialDriverWorld = composeStudioBg3dDriverWorldMatrix(initialDriverLocal);
    const initialFollowerWorld = composeStudioBg3dDriverWorldMatrix(initialFollowerLocal);

    // 기준 오브젝트를 비격자만큼 드래그한 뒤 translate 모드 스냅 커밋
    const draggedDriverRaw = {
      position: [0.62, 0.5, -0.49] as [number, number, number],
      rotation: initialDriverLocal.rotation,
      scale: initialDriverLocal.scale,
    };
    const snappedDriver = resolveStudioBg3dModeAwareDriverTransform(
      draggedDriverRaw,
      "translate",
      true,
      SNAP_ON,
    );
    // 기준 오브젝트의 위치는 0.25 격자에 스냅되지만 기존 22° 회전은 절대 15° 격자로 양자화되지 않는다.
    expect(snappedDriver.position).toEqual([0.5, 0.5, -0.5]);
    expect(snappedDriver.rotation[1]).toBeCloseTo(deg(22), 10);

    const effectiveDriverWorld = composeStudioBg3dDriverWorldMatrix(snappedDriver);
    const nextFollower = calculateStudioBg3dMultiSelectFollowerTransform({
      initialDriverWorldMatrix: initialDriverWorld,
      effectiveDriverWorldMatrix: effectiveDriverWorld,
      initialTargetWorldMatrix: initialFollowerWorld,
    });
    expect(nextFollower).not.toBeNull();
    // 추종 오브젝트는 개별 격자 스냅을 당하지 않고 기준 오브젝트와의 초기 간격 [1.37, 0.4, -0.63] 및 고유 회전을 그대로 지킨다.
    expect(nextFollower!.position[0] - snappedDriver.position[0]).toBeCloseTo(initialSpacing[0], 10);
    expect(nextFollower!.position[1] - snappedDriver.position[1]).toBeCloseTo(initialSpacing[1], 10);
    expect(nextFollower!.position[2] - snappedDriver.position[2]).toBeCloseTo(initialSpacing[2], 10);
    expect(nextFollower!.rotation[0]).toBeCloseTo(deg(10), 10);
    expect(nextFollower!.rotation[1]).toBeCloseTo(deg(-33), 10);
    expect(nextFollower!.rotation[2]).toBeCloseTo(deg(5), 10);
  });

  it("스냅 켜짐 회전(rotate) 시 기준 비격자 위치를 지킨 채 강체 회전으로 상대 거리·상대 각도를 보존한다", () => {
    const initialDriverLocal = {
      position: [0.13, 0.5, -0.17] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    };
    const initialFollowerLocal = {
      position: [2.13, 0.5, -0.17] as [number, number, number],
      rotation: [0, deg(22), 0] as [number, number, number],
      scale: [1, 1, 1] as [number, number, number],
    };
    const initialDistance = Math.hypot(
      initialFollowerLocal.position[0] - initialDriverLocal.position[0],
      initialFollowerLocal.position[2] - initialDriverLocal.position[2],
    );

    const rotatedRaw = {
      position: initialDriverLocal.position,
      rotation: [0, deg(88), 0] as [number, number, number],
      scale: initialDriverLocal.scale,
    };
    const snappedDriver = resolveStudioBg3dModeAwareDriverTransform(
      rotatedRaw,
      "rotate",
      true,
      SNAP_ON,
    );
    // 위치는 0.13, -0.17 그대로 보존되고 회전만 90°로 스냅된다.
    expect(snappedDriver.position).toEqual([0.13, 0.5, -0.17]);
    expect(snappedDriver.rotation[1]).toBeCloseTo(deg(90), 10);

    const nextFollower = calculateStudioBg3dMultiSelectFollowerTransform({
      initialDriverWorldMatrix: composeStudioBg3dDriverWorldMatrix(initialDriverLocal),
      effectiveDriverWorldMatrix: composeStudioBg3dDriverWorldMatrix(snappedDriver),
      initialTargetWorldMatrix: composeStudioBg3dDriverWorldMatrix(initialFollowerLocal),
    });
    expect(nextFollower).not.toBeNull();
    const afterDistance = Math.hypot(
      nextFollower!.position[0] - snappedDriver.position[0],
      nextFollower!.position[2] - snappedDriver.position[2],
    );
    expect(afterDistance).toBeCloseTo(initialDistance, 10);
    // 기준 0° -> 90°, 추종 22° -> 112° 로 상대 회전 차이 22°가 보존된다.
    const driverQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...snappedDriver.rotation, "XYZ"));
    const followerQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...nextFollower!.rotation, "XYZ"));
    const relativeAngleDeg = (driverQuat.angleTo(followerQuat) * 180) / Math.PI;
    expect(relativeAngleDeg).toBeCloseTo(22, 6);
  });

  it("planStudioBg3dGroundSelection은 다중 선택 오브젝트를 X/Z 간격과 회전을 유지한 채 한 번에 접지하고 선택된 조상의 자식은 중복 이동하지 않는다", () => {
    const primitives: BgPrimitive[] = [
      { id: "p-a", kind: "box", position: [0.13, 1.8, -0.17], rotation: [0, deg(22), 0], scale: [1, 1, 1], color: "#fff" },
      { id: "p-b", kind: "box", position: [1.5, 2.4, -0.8], rotation: [0, deg(-33), 0], scale: [1, 2, 1], color: "#eee" },
      { id: "p-child", kind: "box", parentId: "p-a", position: [0, 1.0, 0], rotation: [0, 0, 0], scale: [0.5, 0.5, 0.5], color: "#ccc" },
    ];

    const plan = planStudioBg3dGroundSelection({
      selectedIds: new Set(["p-a", "p-b", "p-child"]),
      primitives,
      customModels: [],
      readSceneObject: () => undefined,
      readModelSize: () => [2, 2, 2],
    });

    expect(plan.changed).toBe(true);
    expect(plan.primitives[0]?.position).toEqual([0.13, 0.5, -0.17]);
    expect(plan.primitives[1]?.position).toEqual([1.5, 1, -0.8]);
    // X/Z 간격과 회전은 그대로 유지되고 자식 로컬 위치는 중복 변경되지 않는다.
    expect(plan.primitives[0]?.rotation[1]).toBeCloseTo(deg(22), 10);
    expect(plan.primitives[1]?.rotation[1]).toBeCloseTo(deg(-33), 10);
    expect(plan.primitives[2]?.position).toEqual([0, 1.0, 0]);
    expect(
      hasStudioBg3dEntityTransformChanged(
        { primitives, customModels: [] },
        { primitives: plan.primitives, customModels: plan.customModels },
      ),
    ).toBe(true);
  });
});
