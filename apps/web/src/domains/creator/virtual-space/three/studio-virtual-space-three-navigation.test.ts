import { describe, expect, it } from "vitest";

import { studioVirtualToonHqManifest } from "../office2d/hq/toon-hq-manifest";
import { studioVirtualCampusManifest } from "../studio-virtual-space-campus-world";
import { studioWorldCollisionRects, studioWorldInteractions, studioWorldSpawn, type StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import { studioWorldLineCanOccupy } from "../studio-virtual-space-world-connectivity";
import { STUDIO_WORLD_PLAYER_RADIUS, studioWorldCanOccupy } from "../studio-virtual-space-world-pathfinding";
import { StudioThreeWorldNavigation } from "./studio-virtual-space-three-navigation";

const world: StudioVirtualSpaceWorldManifest = {
  id: "three-navigation-test", version: 1, width: 400, height: 300, backgroundAssetKey: "test", backgroundUrl: "/test.webp",
  rooms: [{ id: "room", x: 0, y: 0, width: 400, height: 300, labelKo: "방", labelEn: "Room", descriptionKo: "방", descriptionEn: "Room" }],
  props: [], colliders: [{ x: 180, y: 0, width: 20, height: 220 }], interactions: [], portals: [], npcs: [],
  spawns: [{ id: "main", point: { x: 80, y: 80 }, facing: "down" }],
};

describe("3D 월드 이동 충돌 계약", () => {
  it("키보드·조이스틱은 얇은 벽을 관통하지 않고 빈 축으로 미끄러진다", () => {
    const nav = new StudioThreeWorldNavigation(world);
    expect(nav.directional({ x: 160, y: 100 }, { x: 60, y: 0 })).toEqual({ x: 160, y: 100 });
    expect(nav.directional({ x: 160, y: 100 }, { x: 60, y: 30 })).toEqual({ x: 160, y: 130 });
    const target = nav.resolveTarget({ x: 190, y: 100 });
    expect(target).not.toBeNull();
    if (target) expect(studioWorldCanOccupy(world, target)).toBe(true);
  });

  it("클릭·자동 상호작용 이동은 벽 끝의 통로를 우회하고 막힌 직선을 통과하지 않는다", () => {
    const nav = new StudioThreeWorldNavigation(world);
    let point = { x: 80, y: 80 };
    let arrived = false;
    let maximumY = 0;
    for (let frame = 0; frame < 120 && !arrived; frame += 1) {
      const step = nav.toward(point, { x: 320, y: 80 }, 10);
      expect(studioWorldLineCanOccupy(world, world.colliders, point, step.point, STUDIO_WORLD_PLAYER_RADIUS)).toBe(true);
      point = step.point;
      maximumY = Math.max(maximumY, point.y);
      arrived = step.arrived;
    }
    expect(arrived).toBe(true);
    expect(point.x).toBeCloseTo(320);
    expect(point.y).toBeCloseTo(80);
    expect(maximumY).toBeGreaterThan(220);
  });

  it.each([studioVirtualToonHqManifest(false), studioVirtualCampusManifest(false)])("$id도 같은 충돌 계약을 사용한다", (manifest) => {
    const nav = new StudioThreeWorldNavigation(manifest);
    let point = nav.resolveTarget(studioWorldSpawn(manifest).point);
    if (!point) throw new Error("검증 월드에 이동 가능한 시작점이 없습니다.");
    const target = studioWorldInteractions(manifest)[0]?.point ?? point;
    for (let frame = 0; frame < 1000; frame += 1) {
      const step = nav.toward(point, target, 12);
      expect(studioWorldCanOccupy(manifest, step.point)).toBe(true);
      expect(studioWorldLineCanOccupy(manifest, studioWorldCollisionRects(manifest), point, step.point, STUDIO_WORLD_PLAYER_RADIUS)).toBe(true);
      point = step.point;
      if (step.arrived) break;
    }
    expect(studioWorldCanOccupy(manifest, point)).toBe(true);
  });
});
