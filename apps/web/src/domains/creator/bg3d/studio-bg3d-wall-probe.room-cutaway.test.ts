import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_ASSET_PLACEMENT_WALL_NOT_FOUND_MESSAGE,
  planStudioBg3dAssetPlacement,
} from "./studio-bg3d-asset-placement-recipes";
import { STUDIO_BG3D_RESTORE_WALLS_LABEL } from "./studio-bg3d-build-notice";
import {
  CUTAWAY_ROOM_INNER_FACE,
  buildCutawayRoomScene,
  hideEveryRoomObject,
} from "./studio-bg3d-room-cutaway.test-fixture";
import { STUDIO_BG3D_ROOM_WALL_LABELS } from "./studio-bg3d-room-builder";
import { probeStudioBg3dNearestWall } from "./studio-bg3d-wall-probe";

// 방 만들기의 자동 단면은 카메라 쪽 벽을 지우지 않고 visible:false 로 만든다. "벽에 붙이기"는 보이는 벽에만 붙는다.
// 결정: 숨긴 벽은 대상에서 제외한다. 이 시험은 방 빌더가 실제로 만든 단면 방으로 그 동작을 고정한다.

const BASE_BOUNDS = { min: [0, 0, 0] as const, max: [1, 2, 0.5] as const };
const SEED = { position: [0, 0, 0] as const, rotation: [0, 0, 0] as const, scale: [1, 1, 1] as const };

/** 남쪽 벽 바로 앞(안쪽 0.4m)의 놓을 지점에서, 놓는 높이로 광선을 쏜다. */
const NEAR_SOUTH_WALL: readonly [number, number, number] = [0, 1.2, 2.0];

describe("단면 방에서의 벽 탐지", () => {
  it("방 빌더의 단면은 남쪽(앞벽) 조각만 숨기고 나머지 벽과 바닥은 그대로 둔다", () => {
    const scene = buildCutawayRoomScene();
    expect(scene.hiddenIds.length).toBeGreaterThan(0);
    const hiddenNames = new Set(
      scene.primitives.filter((primitive) => primitive.visible === false).map((primitive) => primitive.name),
    );
    expect([...hiddenNames]).toEqual([`${STUDIO_BG3D_ROOM_WALL_LABELS.south} 벽체`]);
  });

  it("숨기지 않은 방에서는 가장 가까운 남쪽 벽에 붙는다(기준선)", () => {
    const scene = buildCutawayRoomScene(null);
    expect(scene.hiddenIds).toEqual([]);
    const wall = probeStudioBg3dNearestWall(scene.objects.values(), NEAR_SOUTH_WALL);
    expect(wall).toMatchObject({ axis: "z", direction: -1 });
    expect(wall?.coordinate).toBeCloseTo(CUTAWAY_ROOM_INNER_FACE.z, 4);
  });

  it("남쪽 벽이 숨겨지면 그 벽은 대상에서 빠지고, 보이는 가장 가까운 옆벽에 붙는다", () => {
    const scene = buildCutawayRoomScene();
    const wall = probeStudioBg3dNearestWall(scene.objects.values(), NEAR_SOUTH_WALL);
    // 남쪽이 아니라 동쪽(같은 거리일 때 +X 우선) 벽의 안쪽 면이다.
    expect(wall).toMatchObject({ axis: "x", direction: -1 });
    expect(wall?.coordinate).toBeCloseTo(CUTAWAY_ROOM_INNER_FACE.x, 4);
  });

  it("숨긴 벽을 되살리면(모두 보이게 하면) 다시 그 벽에 붙을 수 있다", () => {
    const scene = buildCutawayRoomScene();
    for (const id of scene.hiddenIds) {
      const object = scene.objects.get(id);
      if (object) object.visible = true;
    }
    const wall = probeStudioBg3dNearestWall(scene.objects.values(), NEAR_SOUTH_WALL);
    expect(wall).toMatchObject({ axis: "z", direction: -1 });
    expect(wall?.coordinate).toBeCloseTo(CUTAWAY_ROOM_INNER_FACE.z, 4);
  });

  it("벽이 모두 숨겨져 있으면 벽을 찾지 못하고, 계획은 숨긴 벽을 되돌리라는 안내와 함께 장면을 건드리지 않는다", () => {
    const scene = buildCutawayRoomScene();
    hideEveryRoomObject(scene);
    const wall = probeStudioBg3dNearestWall(scene.objects.values(), NEAR_SOUTH_WALL);
    expect(wall).toBeNull();

    const result = planStudioBg3dAssetPlacement({ recipe: "wall", localBounds: BASE_BOUNDS, seed: SEED, wall });
    expect(result).toMatchObject({ ok: false, code: "wall-not-found" });
    if (result.ok) return;
    expect(result.reason).toBe(STUDIO_BG3D_ASSET_PLACEMENT_WALL_NOT_FOUND_MESSAGE);
    expect(result.reason).toContain("숨긴 벽은 제외돼요");
  });

  it("안내가 가리키는 버튼 이름은 방 만들기의 실제 버튼 이름과 같다", () => {
    expect(STUDIO_BG3D_ASSET_PLACEMENT_WALL_NOT_FOUND_MESSAGE).toContain(`'${STUDIO_BG3D_RESTORE_WALLS_LABEL}'`);
  });
});
