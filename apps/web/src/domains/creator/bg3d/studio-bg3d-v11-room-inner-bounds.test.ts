// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildStudioBg3dRoomParts } from "./studio-bg3d-room-builder";
import {
  STUDIO_BG3D_V11_UPPER_ARCHETYPES,
  assembleBg3dV11RoomPipeline,
  assembleBg3dV11UpperRoomPlacement,
  measureV11PrimitivesWorldBounds,
  snapBg3dClusterToRoomAnchor,
  type Bg3dV11ScenePrimitive,
} from "./studio-bg3d-v11-upper-and-lived-in-engine";

const room = { width: 6.4, depth: 5.2, wallHeight: 2.85, wallThickness: 0.3 };
const box: Bg3dV11ScenePrimitive = {
  id: "inner-bounds-box", kind: "box", position: [0, 0.5, 0],
  rotation: [0, 0, 0], scale: [1, 1, 1], color: "#ffffff",
};

/** 실제 룸 빌더 벽 파츠에서 실내 면을 구해 배치 엔진과 독립적으로 대조한다. */
function roomInnerFaces(wallThickness: number) {
  const walls = buildStudioBg3dRoomParts({ ...room, wallThickness, openings: [], furniture: [] });
  const face = (wall: "north" | "south" | "west" | "east", axis: 0 | 2, sign: number) => {
    const part = walls.find((item) => item.wall === wall);
    if (!part) throw new Error(`${wall} 벽 파츠가 없습니다.`);
    return part.position[axis] + sign * part.scale[axis] / 2;
  };
  return { minX: face("west", 0, 1), maxX: face("east", 0, -1), minZ: face("north", 2, 1), maxZ: face("south", 2, -1) };
}

function expectInsideWalls(primitives: readonly Bg3dV11ScenePrimitive[], wallThickness: number, margin = 0) {
  const bounds = measureV11PrimitivesWorldBounds(primitives);
  const inner = roomInnerFaces(wallThickness);
  expect(bounds.min[0]).toBeGreaterThanOrEqual(inner.minX + margin - 0.0001);
  expect(bounds.max[0]).toBeLessThanOrEqual(inner.maxX - margin + 0.0001);
  expect(bounds.min[2]).toBeGreaterThanOrEqual(inner.minZ + margin - 0.0001);
  expect(bounds.max[2]).toBeLessThanOrEqual(inner.maxZ - margin + 0.0001);
}

describe("V11 룸 빌더 실내 벽면 경계", () => {
  it.each([0.05, 0.3, 0.6])("벽 두께 %sm에서 모든 앵커와 회전한 파츠가 실제 벽 안쪽 여유를 유지한다", (wallThickness) => {
    for (const anchor of ["north-wall", "nw-corner", "east-window", "alley-facade-upper", "ceiling-center"] as const) {
      for (const yaw of [0, Math.PI / 4]) {
        const rotated: Bg3dV11ScenePrimitive = { ...box, rotation: [0, yaw, 0] };
        const result = snapBg3dClusterToRoomAnchor([rotated], { ...room, wallThickness }, anchor);
        expectInsideWalls(result.snappedPrimitives, wallThickness, 0.08);
      }
    }
  });

  it("벽 중심 사이에는 맞아도 실내 폭이나 깊이보다 큰 클러스터는 거부한다", () => {
    for (const scale of [[6, 1, 1], [1, 1, 4.8]] as const) {
      const wide: Bg3dV11ScenePrimitive = { ...box, scale: [...scale] };
      expect(() => snapBg3dClusterToRoomAnchor([wide], { ...room, wallThickness: 0 }, "ceiling-center")).not.toThrow();
      expect(() => snapBg3dClusterToRoomAnchor([wide], { ...room, wallThickness: 0.6 }, "ceiling-center")).toThrow("방보다 큽니다");
    }
  });

  it("벽 두께를 생략한 기존 치수 입력은 두께 0과 같은 배치를 유지한다", () => {
    const legacy = { width: room.width, depth: room.depth, wallHeight: room.wallHeight };
    expect(snapBg3dClusterToRoomAnchor([box], legacy, "north-wall"))
      .toEqual(snapBg3dClusterToRoomAnchor([box], { ...legacy, wallThickness: 0 }, "north-wall"));
  });

  it.each([-0.1, NaN, Infinity, 5.2, 6.4])("유효하지 않은 벽 두께 %s를 배치 전에 거부한다", (wallThickness) => {
    expect(() => snapBg3dClusterToRoomAnchor([box], { ...room, wallThickness }, "north-wall")).toThrow("유효한 숫자");
  });

  it("6종 상부·양 하부 앵커·생활감 분산의 전체 및 상부 단독 결과가 실내에 들어간다", () => {
    for (const { id: upperArchetype } of STUDIO_BG3D_V11_UPPER_ARCHETYPES) {
      for (const lowerAnchor of ["north-wall", "nw-corner"] as const) {
        const spec = { room, lowerArchetype: "office-creator-workstation" as const, upperArchetype, lowerAnchor, density: "lived-in" as const, messiness: 0.9, seed: 42 };
        const assembled = assembleBg3dV11RoomPipeline(spec);
        const upper = assembleBg3dV11UpperRoomPlacement(spec);
        expect(assembled.upperPrimitives).toEqual(upper.upperPrimitives);
        expectInsideWalls(assembled.combinedPrimitives, room.wallThickness, 0.08);
        expectInsideWalls(upper.upperPrimitives, room.wallThickness, 0.08);
      }
    }
  });
});
