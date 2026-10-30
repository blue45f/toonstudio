import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { StudioVirtualSpaceWorldManifest, StudioWorldRect } from "../../studio-virtual-space-world-manifest";
import { studioWorldCanOccupy } from "../../studio-virtual-space-world-pathfinding";
import { studioWorldLineCanOccupy } from "../../studio-virtual-space-world-connectivity";
import { studioThreeGeneratedProps } from "../studio-virtual-space-three-generated-assets";
import { STUDIO_THREE_SCALE } from "../studio-virtual-space-three-scene";
import { createVirtualThreeThemePlacementPlanner, virtualThreeThemeModelHeight } from "./virtual-three-theme-placement";

function world(changes: Partial<StudioVirtualSpaceWorldManifest> = {}): StudioVirtualSpaceWorldManifest {
  return {
    id: "theme-placement-fixture", version: 1, width: 1_600, height: 1_200,
    backgroundAssetKey: "fixture", backgroundUrl: "/fixture.webp",
    rooms: [{ id: "room", x: 0, y: 0, width: 1_600, height: 1_200, labelKo: "방", labelEn: "Room" }],
    props: [], colliders: [{ x: 100, y: 100, width: 512, height: 512 }],
    interactions: [], portals: [], spawns: [], npcs: [], ...changes,
  };
}
function overlaps(a: StudioWorldRect, b: StudioWorldRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
const protectedSite = { x: 100, y: 100, width: 96, height: 96 };
const corridor = {
  id: "seat", roomId: "room", labelKo: "좌석", labelEn: "Seat",
  approachPoint: { x: 60, y: 148 }, anchorPoint: { x: 148, y: 148 }, exitPoint: { x: 240, y: 148 },
  facing: "down" as const, radius: 24,
};

describe("독립 3D 테마의 기존 비보행 영역 배치", () => {
  it("모든 모델을 현재 collider 안에 겹치지 않게 두고 기존 보행선·manifest를 바꾸지 않는다", () => {
    const manifest = world();
    const before = JSON.stringify(manifest);
    const planner = createVirtualThreeThemePlacementPlanner(manifest);
    const placements = Array.from({ length: 12 }, () => planner.place(new THREE.Vector3(1, 1.5, 1), "storage"));
    for (const [index, placement] of placements.entries()) {
      expect(manifest.colliders.some((site) => placement.footprint.x >= site.x && placement.footprint.y >= site.y
        && placement.footprint.x + placement.footprint.width <= site.x + site.width
        && placement.footprint.y + placement.footprint.height <= site.y + site.height)).toBe(true);
      expect(placement.position.x).toBe((placement.footprint.x + placement.footprint.width / 2) * STUDIO_THREE_SCALE);
      expect(placement.position.z).toBe((placement.footprint.y + placement.footprint.height / 2) * STUDIO_THREE_SCALE);
      expect(placement.position.y).toBe(0);
      for (const other of placements.slice(index + 1)) expect(overlaps(placement.footprint, other.footprint)).toBe(false);
    }
    const start = { x: 60, y: 50 }, end = { x: 1_500, y: 50 };
    expect(studioWorldCanOccupy(manifest, start)).toBe(true);
    expect(studioWorldCanOccupy(manifest, end)).toBe(true);
    expect(studioWorldLineCanOccupy(manifest, manifest.colliders, start, end, 16)).toBe(true);
    expect(JSON.stringify(manifest)).toBe(before);
  });

  it("빈 보행 바닥·얇은 벽·없는 footprint에는 임의 배치를 만들지 않는다", () => {
    for (const colliders of [[], [{ x: 100, y: 100, width: 20, height: 600 }], [{ x: 100, y: 100, width: 600, height: 20 }]]) {
      const planner = createVirtualThreeThemePlacementPlanner(world({ colliders }));
      expect(() => planner.place(new THREE.Vector3(1, 1, 1), "accent")).toThrow("배치 공간이 부족");
    }
  });

  it("월드 밖으로 걸친 collider도 모델 전체가 월드 내부에 들어오는 부분만 사용한다", () => {
    const manifest = world({ colliders: [{ x: -100, y: -100, width: 300, height: 300 }] });
    const placement = createVirtualThreeThemePlacementPlanner(manifest).place(new THREE.Vector3(1, 1, 1), "accent");
    expect(placement.footprint.x).toBeGreaterThanOrEqual(0);
    expect(placement.footprint.y).toBeGreaterThanOrEqual(0);
    expect(placement.footprint.x + placement.footprint.width).toBeLessThanOrEqual(manifest.width);
    expect(placement.footprint.y + placement.footprint.height).toBeLessThanOrEqual(manifest.height);
  });

  it("스폰·포털·작업대의 보호 반경을 침범하느니 새 배치를 거부한다", () => {
    const fixtures: Partial<StudioVirtualSpaceWorldManifest>[] = [
      { spawns: [{ id: "entry", point: { x: 148, y: 148 } }] },
      { portals: [{ id: "door", point: { x: 148, y: 148 }, radius: 24 }] },
      { interactions: [{ id: "tool", zoneId: "room", point: { x: 148, y: 148 }, radius: 24, labelKo: "작업대", labelEn: "Tool", action: "canvas" }] },
      { props: [{ id: "authored-door", kind: "portal", x: 148, y: 148, interactionRadius: 24, portal: { href: "/studio" } }] },
      { props: [{ id: "authored-tool", kind: "interactive", x: 148, y: 148, interactionRadius: 24, action: "canvas" }] },
    ];
    for (const fixture of fixtures) {
      const manifest = world({ colliders: [protectedSite], ...fixture });
      const planner = createVirtualThreeThemePlacementPlanner(manifest);
      expect(() => planner.place(new THREE.Vector3(1, 1, 1), "workstation")).toThrow("배치 공간이 부족");
    }
  });

  it("작업 좌석의 접근→부착→퇴장 전체 통로를 보호한다", () => {
    const manifest = world({ colliders: [protectedSite], interactionSlots: [corridor] });
    expect(() => createVirtualThreeThemePlacementPlanner(manifest).place(new THREE.Vector3(1, 1, 1), "seating"))
      .toThrow("배치 공간이 부족");
  });

  it("현재 NPC 위치와 활동 접근·퇴장 통로도 장식 후보로 사용하지 않는다", () => {
    const fixedNpc = world({ colliders: [protectedSite], npcs: [{ id: "npc", roomId: "room", skinKey: "guide", point: { x: 148, y: 148 } }] });
    expect(() => createVirtualThreeThemePlacementPlanner(fixedNpc).place(new THREE.Vector3(1, 1, 1), "accent"))
      .toThrow("배치 공간이 부족");
    const activeNpc = world({ colliders: [protectedSite], npcActivityAnchors: [{
      ...corridor, activity: "work", animation: "draw", minDurationMs: 1_000, maxDurationMs: 2_000,
    }] });
    expect(() => createVirtualThreeThemePlacementPlanner(activeNpc).place(new THREE.Vector3(1, 1, 1), "accent"))
      .toThrow("배치 공간이 부족");
  });

  it("다운로드가 아직 끝나지 않은 기존 generated 장비의 위치도 먼저 예약한다", () => {
    const base = world({ rooms: [{ id: "personal-atelier", x: 0, y: 0, width: 1_000, height: 1_000, labelKo: "작업실", labelEn: "Atelier" }] });
    const existing = studioThreeGeneratedProps(base)[0];
    if (!existing) throw new Error("기존 generated 장비 fixture가 없습니다.");
    const manifest = { ...base, colliders: [{ x: existing.x - 40, y: existing.y - 40, width: 80, height: 80 }] };
    expect(() => createVirtualThreeThemePlacementPlanner(manifest).place(new THREE.Vector3(0.5, 1, 0.5), "accent"))
      .toThrow("배치 공간이 부족");
  });

  it("NaN·무한·평면·음수 경계를 거부하고 표현 크기만 역할별로 구분한다", () => {
    const planner = createVirtualThreeThemePlacementPlanner(world());
    for (const invalid of [
      new THREE.Vector3(0, 1, 1), new THREE.Vector3(1, -1, 1),
      new THREE.Vector3(Number.NaN, 1, 1), new THREE.Vector3(1, 1, Infinity),
    ]) expect(() => planner.place(invalid, "accent")).toThrow("경계가 유효하지");
    expect(virtualThreeThemeModelHeight("tabletop", "cup")).toBe(0.16);
    expect(virtualThreeThemeModelHeight("workstation", "fixture-table")).toBe(0.94);
    expect(virtualThreeThemeModelHeight("botanical", "flower")).toBeLessThan(virtualThreeThemeModelHeight("botanical", "tree"));
  });
});
