import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { CAMPUS_HEIGHT, CAMPUS_WIDTH, CAMPUS_ZONES } from "../studio-virtual-space-campus-blueprint";
import {
  buildStudioThreeCampusArchitecture,
  createStylized3DCharacterNode,
  facingToYawRadians,
  shortestAngleLerp,
  STUDIO_THREE_PROPS,
  STUDIO_THREE_VRM_URLS,
  threeToWorld,
  worldToThree,
} from "./studio-virtual-space-three-scene";

describe("3D 가상 스튜디오 씬 아키텍처 및 좌표 변환", () => {
  it("2D 캠퍼스 좌표와 3D 미터 좌표 간 왕복 변환이 정확하다", () => {
    for (const zone of CAMPUS_ZONES) {
      const threePos = worldToThree(zone.spawn, 1.5);
      expect(threePos.y).toBe(1.5);
      const roundtrip = threeToWorld({ x: threePos.x, z: threePos.z });
      expect(roundtrip).toEqual(zone.spawn);
    }
  });

  it("4방향 facing을 3D 라디안 회전각으로 매핑하고 최단 각도 보간을 수행한다", () => {
    expect(facingToYawRadians("down")).toBe(0);
    expect(facingToYawRadians("right")).toBeCloseTo(Math.PI * 0.5);
    expect(facingToYawRadians("up")).toBeCloseTo(Math.PI);
    expect(facingToYawRadians("left")).toBeCloseTo(-Math.PI * 0.5);

    const wrapped = shortestAngleLerp(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(wrapped)).toBeGreaterThan(Math.PI - 0.15);
  });

  it("모든 3D GLB 가구·소품과 VRM 아바타 경로가 유효하고 캠퍼스 경계 안에 배치된다", () => {
    expect(STUDIO_THREE_PROPS.length).toBeGreaterThanOrEqual(35);
    const ids = new Set(STUDIO_THREE_PROPS.map((prop) => prop.id));
    expect(ids.size).toBe(STUDIO_THREE_PROPS.length);

    for (const prop of STUDIO_THREE_PROPS) {
      expect(prop.url).toMatch(/^\/assets\/3d\/.+\.glb$/u);
      expect(prop.x).toBeGreaterThanOrEqual(0);
      expect(prop.x).toBeLessThanOrEqual(CAMPUS_WIDTH);
      expect(prop.y).toBeGreaterThanOrEqual(0);
      expect(prop.y).toBeLessThanOrEqual(CAMPUS_HEIGHT);
      expect(prop.heightMeters).toBeGreaterThan(0.2);
    }

    expect(STUDIO_THREE_VRM_URLS.length).toBeGreaterThanOrEqual(8);
    for (const url of STUDIO_THREE_VRM_URLS) {
      expect(url).toMatch(/^\/vrm\/.+\.vrm$/u);
    }
  });

  it("3D 캠퍼스 아키텍처 빌더와 스타일라이즈드 3D 캐릭터 리그를 정상 생성한다", () => {
    const scene = new THREE.Scene();
    const { floorMesh, waterMeshes } = buildStudioThreeCampusArchitecture(scene);
    expect(floorMesh.name).toBe("campus-walkable-floor");
    expect(waterMeshes).toHaveLength(2);
    expect(scene.children.length).toBeGreaterThan(15);

    const selfActor = createStylized3DCharacterNode("self", 0x4f46e5, true);
    expect(selfActor.group.name).toBe("actor-self");
    expect(selfActor.rigGroup.children.length).toBeGreaterThanOrEqual(8);
  });
});
