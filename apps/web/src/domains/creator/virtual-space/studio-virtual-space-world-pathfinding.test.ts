import { describe, expect, it } from "vitest";

import { DEFAULT_STUDIO_WORLD_MANIFEST, type StudioVirtualSpaceWorldManifest, type StudioWorldRect } from "./studio-virtual-space-world-manifest";
import {
  StudioWorldConnectivityIndex,
  studioWorldCircleCanOccupy,
  studioWorldLineCanOccupy,
  studioWorldNavigationGrid,
  studioWorldNavigationLattice,
} from "./studio-virtual-space-world-connectivity";
import { findStudioWorldPath, studioWorldCanOccupy, studioWorldCanTraverse } from "./studio-virtual-space-world-pathfinding";

/** 세로 벽 9개가 위·아래 틈을 번갈아 두는 3072×1920 미로. */
function mazeWorld(): StudioVirtualSpaceWorldManifest {
  const colliders: StudioWorldRect[] = [];
  for (let index = 0; index < 9; index += 1) {
    const x = 300 + index * 300;
    const gapAtTop = index % 2 === 0;
    colliders.push(gapAtTop
      ? { x, y: 160, width: 24, height: 1920 - 160 }
      : { x, y: 0, width: 24, height: 1920 - 160 });
  }
  // 공간 해시 경로도 거치도록 작은 기둥을 많이 둔다.
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      colliders.push({ x: 120 + column * 300, y: 420 + row * 240, width: 40, height: 40 });
    }
  }
  return Object.freeze({
    ...DEFAULT_STUDIO_WORLD_MANIFEST,
    id: "maze-3072",
    width: 3072,
    height: 1920,
    props: [],
    colliders: Object.freeze(colliders),
    rooms: [{ id: "maze", labelKo: "미로", labelEn: "Maze", x: 0, y: 0, width: 3072, height: 1920 }],
    spawns: [{ id: "main", point: { x: 40, y: 40 } }],
    interactions: [],
    portals: [],
    npcs: [],
    interactionSlots: [],
    npcActivityAnchors: [],
    acousticZones: [],
    occlusionLayers: [],
  });
}

describe("studio world pathfinding at campus scale", () => {
  it.each([true, false])("벽에 닿은 두 시작점은 요청 순서와 무관하게 정확히 구분한다 (차단 먼저 %s)", (blockedFirst) => {
    const world = { ...mazeWorld(), width: 256, height: 256, colliders: [{ x: 80, y: 20, width: 12, height: 200 }] };
    const free = { x: 67.88, y: 99 }, blocked = { x: 68.12, y: 99 }, target = { x: 40, y: 99 };
    for (const start of (blockedFirst ? [blocked, free] : [free, blocked])) {
      expect(findStudioWorldPath(world, start, target, 12)).toEqual(start === blocked ? [] : [target]);
    }
    const nextTarget = { x: free.x + 0.01, y: free.y };
    expect(findStudioWorldPath(world, target, free, 12).at(-1)).toEqual(free);
    expect(findStudioWorldPath(world, target, nextTarget, 12).at(-1)).toEqual(nextTarget);
    expect(findStudioWorldPath(world, target, blocked, 12).at(-1)?.x).toBeLessThanOrEqual(68);
  });

  it("격자 간격보다 얇은 가로·세로 벽을 양쪽 자유 칸이 바로 이어지더라도 통과하지 않는다", () => {
    for (const vertical of [true, false]) {
      const wall = vertical ? { x: 100, y: 0, width: 1, height: 8000 } : { x: 0, y: 100, width: 8000, height: 1 };
      const world = { ...mazeWorld(), width: 8000, height: 8000, colliders: [wall] };
      const start = { x: 80, y: 80 }, target = vertical ? { x: 120, y: 80 } : { x: 80, y: 120 };
      expect(studioWorldCanOccupy(world, start, 12)).toBe(true);
      expect(studioWorldCanOccupy(world, target, 12)).toBe(true);
      expect(studioWorldCanTraverse(world, start, target, 12)).toBe(false);
      expect(findStudioWorldPath(world, start, target, 12)).toEqual([]);
      expect(new StudioWorldConnectivityIndex(world, world.colliders, 12).connected(start, target)).toBe(false);
    }
  });

  it("직선 이동은 모서리를 스치는 접선을 허용하고 중간의 미세한 겹침도 양방향에서 막는다", () => {
    const world = { ...mazeWorld(), width: 256, height: 256, colliders: [{ x: 99.5, y: 100, width: 1, height: 1 }] };
    const start = { x: 55, y: 88.2 }, target = { x: 151, y: 88.2 };
    expect(studioWorldCanTraverse(world, start, target, 12)).toBe(false);
    const path = findStudioWorldPath(world, start, target, 12);
    expect(path.at(-1)).toEqual(target);
    let previous = start;
    for (const point of path) {
      expect(studioWorldCanTraverse(world, previous, point, 12)).toBe(true);
      previous = point;
    }
    const rects = [{ x: 100, y: 100, width: 25, height: 25 }];
    const diagonal = (offset: number) => [{ x: 89, y: 102 + offset }, { x: 105, y: 90 + offset }] as const;
    for (const offset of [0, 0.1]) {
      const [from, to] = diagonal(offset);
      expect(studioWorldLineCanOccupy(world, rects, from, to, 5)).toBe(offset === 0);
      expect(studioWorldLineCanOccupy(world, rects, to, from, 5)).toBe(offset === 0);
    }
    // 시작점만 겹치고 이후에는 벽에서 멀어지는 짧은 선분도 공유 판정에서는 차단한다.
    expect(studioWorldLineCanOccupy(world, rects, { x: 95.1, y: 110 }, { x: 94, y: 110 }, 5)).toBe(false);
  });

  it("3072×1920 월드(벽 미로 포함)에서 대각 끝→끝 경로를 확장 한도 안에서 찾는다", () => {
    const world = mazeWorld();
    const start = { x: 40, y: 40 };
    const target = { x: 3030, y: 1880 };
    const startedAt = performance.now();
    const path = findStudioWorldPath(world, start, target);
    const elapsed = performance.now() - startedAt;
    expect(path.length).toBeGreaterThan(8);
    expect(path.at(-1)).toEqual(target);
    let previous = start;
    for (const point of path) {
      expect(studioWorldCanOccupy(world, point)).toBe(true);
      expect(studioWorldCanTraverse(world, previous, point)).toBe(true);
      previous = point;
    }
    // 느린 CI 러너도 넉넉히 통과하되, 선형 충돌 탐색으로 돌아가면 드러나는 한도.
    expect(elapsed).toBeLessThan(4_000);
    // 같은 요청은 캐시된 같은 배열을 돌려준다.
    expect(findStudioWorldPath(world, start, target)).toBe(path);
  });

  it("960×640·1280×960 월드의 격자는 6px로 유지된다", () => {
    expect(studioWorldNavigationGrid(960, 640)).toBe(6);
    expect(studioWorldNavigationGrid(1280, 960)).toBe(6);
    expect(studioWorldNavigationGrid(3072, 1920)).toBe(13);
    expect(studioWorldNavigationGrid(Number.NaN, 10)).toBe(6);
    const lattice = studioWorldNavigationLattice({ width: 3072, height: 1920 });
    expect(lattice.cells).toBeLessThanOrEqual(40_000);
    expect(new StudioWorldConnectivityIndex(DEFAULT_STUDIO_WORLD_MANIFEST, [], 9).grid).toBe(6);
  });

  it("3072×1920 연결성 색인은 budgetExceeded=false로 전체 색인한다", () => {
    const world = mazeWorld();
    const index = new StudioWorldConnectivityIndex(world, world.colliders, 9);
    expect(index.connected({ x: 40, y: 40 }, { x: 3030, y: 1880 })).toBe(true);
    expect(index.budgetExceeded).toBe(false);
    expect(index.searchCount).toBe(1);
    // 같은 연결 요소 질의는 다시 탐색하지 않는다.
    expect(index.connected({ x: 1500, y: 100 }, { x: 2900, y: 1800 })).toBe(true);
    expect(index.searchCount).toBe(1);

    const sealed = Object.freeze({ ...world, colliders: Object.freeze([...world.colliders, { x: 1500, y: 0, width: 30, height: 1920 }]) });
    const sealedIndex = new StudioWorldConnectivityIndex(sealed, sealed.colliders, 9);
    expect(sealedIndex.connected({ x: 40, y: 40 }, { x: 3030, y: 1880 })).toBe(false);
    expect(sealedIndex.budgetExceeded).toBe(false);
  });

  it("공간 해시는 선형 충돌 판정과 같은 답을 낸다", () => {
    const world = mazeWorld();
    const colliders = world.colliders;
    const linear = (point: { x: number; y: number }) => point.x >= 9 && point.y >= 9 && point.x <= 3072 - 9 && point.y <= 1920 - 9
      && !colliders.some((rect) => {
        const dx = point.x - Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
        const dy = point.y - Math.max(rect.y, Math.min(point.y, rect.y + rect.height));
        return dx * dx + dy * dy < 81;
      });
    for (let y = 0; y <= 1920; y += 37) {
      for (let x = 0; x <= 3072; x += 41) {
        expect(studioWorldCircleCanOccupy(world, colliders, { x, y }, 9)).toBe(linear({ x, y }));
      }
    }
  });
});
