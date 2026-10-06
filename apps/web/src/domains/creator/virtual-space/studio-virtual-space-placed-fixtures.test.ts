// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import type { StudioBuildPlacementRequest } from "./studio-virtual-space-build-mode";
import {
  STUDIO_PLACED_FIXTURE_LIMIT,
  parseStudioPlacedFixtureRequests,
  readStudioPlacedFixtureRequests,
  studioPlacedFixturePointNear,
  writeStudioPlacedFixtureRequests,
} from "./studio-virtual-space-placed-fixtures";
import { DEFAULT_STUDIO_WORLD_MANIFEST, studioWorldSpawn } from "./studio-virtual-space-world-manifest";

function request(refId: string, x: number, y: number, rotation: 0 | 90 | 180 | 270 = 0): StudioBuildPlacementRequest {
  return { entryId: `furniture:${refId}`, category: "furniture", refId, point: { x, y }, rotation };
}

const SCOPE = "test-scope";

describe("배치 고정물 저장 — 파싱", () => {
  it("유효한 요청만 통과시키고 카테고리 불일치·없는 항목·손상 좌표를 버린다", () => {
    const parsed = parseStudioPlacedFixtureRequests([
      request("floor-lamp", 100, 200),
      { entryId: "furniture:없는가구", category: "furniture", refId: "없는가구", point: { x: 0, y: 0 }, rotation: 0 },
      { entryId: "furniture:whiteboard", category: "light", refId: "whiteboard", point: { x: 0, y: 0 }, rotation: 0 },
      { entryId: "decor:tree", category: "decor", refId: "tree", point: { x: 0, y: 0 }, rotation: 0 },
      { entryId: "furniture:display-screen", category: "furniture", refId: "display-screen", point: { x: Number.NaN, y: 0 }, rotation: 0 },
      { entryId: "furniture:display-screen", category: "furniture", refId: "display-screen", point: { x: 10, y: 10 }, rotation: 45 },
      "junk",
      null,
    ]);
    expect(parsed).toEqual([request("floor-lamp", 100, 200)]);
  });

  it("같은 항목을 같은 좌표에 다시 저장해도 하나로 수렴하고, 고정물 objectId 중복도 버린다", () => {
    const parsed = parseStudioPlacedFixtureRequests([
      request("floor-lamp", 100, 200),
      request("floor-lamp", 100, 200),
      // 좌표가 소수점 아래에서만 다르면 같은 objectId(build:floor-lamp@100,200)로 수렴한다.
      request("floor-lamp", 100.4, 200.2),
      request("floor-lamp", 300, 200),
    ]);
    expect(parsed.map((item) => [item.refId, item.point.x, item.point.y])).toEqual([
      ["floor-lamp", 100, 200],
      ["floor-lamp", 300, 200],
    ]);
  });

  it("상한을 넘긴 저장값은 상한까지만 읽는다", () => {
    const many = Array.from({ length: STUDIO_PLACED_FIXTURE_LIMIT + 5 }, (_, index) =>
      request("floor-lamp", 100 + index * 40, 200));
    expect(parseStudioPlacedFixtureRequests(many)).toHaveLength(STUDIO_PLACED_FIXTURE_LIMIT);
  });

  it("배열이 아닌 저장값은 빈 목록이다", () => {
    expect(parseStudioPlacedFixtureRequests(null)).toEqual([]);
    expect(parseStudioPlacedFixtureRequests({})).toEqual([]);
    expect(parseStudioPlacedFixtureRequests("[]")).toEqual([]);
  });
});

describe("배치 고정물 저장 — localStorage 왕복", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("쓰고 읽으면 같은 목록이 돌아오고, scope가 다르면 분리된다", () => {
    const requests = [request("floor-lamp", 100, 200), request("display-screen", 500, 200, 90)];
    expect(writeStudioPlacedFixtureRequests(requests, SCOPE)).toBe(true);
    expect(readStudioPlacedFixtureRequests(SCOPE)).toEqual(requests);
    expect(readStudioPlacedFixtureRequests("other-scope")).toEqual([]);
  });

  it("손상된 저장값은 빈 목록으로 읽힌다", () => {
    window.localStorage.setItem("toonspectrum:virtual-space-placed-fixtures:v1:test-scope", "{oops");
    expect(readStudioPlacedFixtureRequests(SCOPE)).toEqual([]);
  });
});

describe("배치 고정물 배치점 탐색", () => {
  const world = DEFAULT_STUDIO_WORLD_MANIFEST;
  const spawn = studioWorldSpawn(world, "lobby").point;

  it("기준점 자체가 아닌 격자 지점을 돌려주고, 이미 놓인 지점과 간격을 지킨다", () => {
    const first = studioPlacedFixturePointNear(world, [], spawn);
    expect(first).not.toBeNull();
    expect(first).not.toEqual(spawn);
    expect(first!.x % 16).toBe(0);
    expect(first!.y % 16).toBe(0);
    const second = studioPlacedFixturePointNear(world, [first!], spawn);
    expect(second).not.toBeNull();
    expect(Math.hypot(second!.x - first!.x, second!.y - first!.y)).toBeGreaterThanOrEqual(32);
  });

  it("주변이 전부 점유되면 null이다", () => {
    const occupied: { x: number; y: number }[] = [];
    for (let x = spawn.x - 160; x <= spawn.x + 160; x += 16) {
      for (let y = spawn.y - 160; y <= spawn.y + 160; y += 16) occupied.push({ x, y });
    }
    expect(studioPlacedFixturePointNear(world, occupied, spawn)).toBeNull();
  });
});
