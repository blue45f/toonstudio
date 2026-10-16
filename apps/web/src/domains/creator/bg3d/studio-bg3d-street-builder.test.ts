import { describe, expect, it } from "vitest";

import { PRIMITIVE_DEFS, type BgPrimitiveKind } from "../studio-background-3d-metadata";

import {
  buildStudioBg3dStreetParts,
  clampStudioBg3dStreetSpec,
  planStudioBg3dStreetBuild,
  STUDIO_BG3D_STREET_DEFAULT_SPEC,
  STUDIO_BG3D_STREET_LIMITS,
  studioBg3dStreetFootprintWidth,
} from "./studio-bg3d-street-builder";

const VALID_KINDS = new Set(Object.keys(PRIMITIVE_DEFS) as BgPrimitiveKind[]);

function countByName(names: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of names) counts[name] = (counts[name] ?? 0) + 1;
  return counts;
}

describe("clampStudioBg3dStreetSpec", () => {
  it("입력이 없거나 비정상이면 기본 스펙을 돌려준다", () => {
    expect(clampStudioBg3dStreetSpec(null)).toEqual(STUDIO_BG3D_STREET_DEFAULT_SPEC);
    expect(clampStudioBg3dStreetSpec(undefined)).toEqual(STUDIO_BG3D_STREET_DEFAULT_SPEC);
    expect(
      clampStudioBg3dStreetSpec({
        length: Number.NaN,
        laneWidth: "wide" as unknown as number,
        westFloors: "x" as unknown as number[],
      }),
    ).toEqual(STUDIO_BG3D_STREET_DEFAULT_SPEC);
  });

  it("기본 스펙은 자기 clamp 의 고정점이다", () => {
    expect(clampStudioBg3dStreetSpec(STUDIO_BG3D_STREET_DEFAULT_SPEC)).toEqual(STUDIO_BG3D_STREET_DEFAULT_SPEC);
  });

  it("수치는 한계 안으로, 층수는 정수로 눌러 담는다", () => {
    const limits = STUDIO_BG3D_STREET_LIMITS;
    const low = clampStudioBg3dStreetSpec({ length: 1, laneWidth: 0, sidewalkWidth: 0, floorHeight: 0, westFloors: [0], eastFloors: [2.6] });
    expect(low).toMatchObject({
      length: limits.minLength,
      laneWidth: limits.minLaneWidth,
      sidewalkWidth: limits.minSidewalkWidth,
      floorHeight: limits.minFloorHeight,
      westFloors: [limits.minFloors],
      eastFloors: [3],
    });
    const high = clampStudioBg3dStreetSpec({ length: 1e6, laneWidth: 50, sidewalkWidth: 50, floorHeight: 50, westFloors: [50] });
    expect(high).toMatchObject({
      length: limits.maxLength,
      laneWidth: limits.maxLaneWidth,
      sidewalkWidth: limits.maxSidewalkWidth,
      floorHeight: limits.maxFloorHeight,
      westFloors: [limits.maxFloors],
    });
  });

  it("건물 수는 길이에 비해 건물이 너무 좁아지지 않는 개수까지만 허용한다", () => {
    const manyFloors = [3, 3, 3, 3, 3, 3, 3];
    for (const length of [20, 36, 60, 80]) {
      const spec = clampStudioBg3dStreetSpec({ length, westFloors: manyFloors, eastFloors: manyFloors });
      const count = spec.westFloors.length;
      const width = (spec.length - (count - 1) * STUDIO_BG3D_STREET_LIMITS.buildingGap) / count;
      expect(width, `길이 ${length}`).toBeGreaterThanOrEqual(STUDIO_BG3D_STREET_LIMITS.minBuildingWidth);
      expect(count).toBeLessThanOrEqual(STUDIO_BG3D_STREET_LIMITS.maxBuildingsPerSide);
    }
    expect(clampStudioBg3dStreetSpec({ length: 20, westFloors: manyFloors }).westFloors).toHaveLength(2);
    expect(clampStudioBg3dStreetSpec({ length: 80, westFloors: manyFloors }).westFloors).toHaveLength(5);
  });
});

describe("buildStudioBg3dStreetParts", () => {
  it("기본 거리는 96개 파츠이고 종류별 개수가 정해져 있다", () => {
    const parts = buildStudioBg3dStreetParts(STUDIO_BG3D_STREET_DEFAULT_SPEC);
    expect(parts).toHaveLength(96);
    expect(countByName(parts.map((part) => part.name))).toEqual({
      도로: 1,
      보도: 2,
      "건물 본체": 6,
      "건물 문": 6,
      "상가 유리": 6,
      // 서쪽 [3,4,3]층, 동쪽 [4,3,4]층: 2층 이상 층마다 창 2개 = (2+3+2 + 3+2+3) x 2.
      "건물 창": 30,
      "가로등 기둥": 4,
      "가로등 팔": 4,
      "가로등 등": 4,
      "가로수 줄기": 4,
      "가로수 잎": 4,
      "벤치 좌판": 1,
      "벤치 등받이": 1,
      "벤치 다리": 1,
      "차량 몸체": 2,
      "차량 객실": 2,
      "차량 바퀴": 8,
      "횡단보도 줄무늬": 6,
      "중앙선 점선": 4,
    });
  });

  it("모든 파츠는 유효한 프리미티브·유한한 좌표·양수 크기·6자리 색을 갖고, 바퀴만 눕는다", () => {
    for (const part of buildStudioBg3dStreetParts({})) {
      expect(VALID_KINDS.has(part.kind), part.name).toBe(true);
      expect(part.position.every(Number.isFinite), part.name).toBe(true);
      expect(part.scale.every((value) => Number.isFinite(value) && value > 0), part.name).toBe(true);
      expect(part.color).toMatch(/^#[0-9a-f]{6}$/u);
      if (part.name === "차량 바퀴") expect(part.rotation).toEqual([0, 0, Math.PI / 2]);
      else expect(part.rotation).toEqual([0, 0, 0]);
    }
  });

  it("같은 스펙은 항상 같은 파츠를 만들고, 층수가 같으면 서쪽·동쪽 건물이 X 대칭이다", () => {
    expect(buildStudioBg3dStreetParts({})).toEqual(buildStudioBg3dStreetParts({}));
    const symmetric = buildStudioBg3dStreetParts({ westFloors: [3, 3], eastFloors: [3, 3] });
    const bodies = symmetric.filter((part) => part.name === "건물 본체");
    const west = bodies.filter((part) => part.position[0] < 0);
    const east = bodies.filter((part) => part.position[0] > 0);
    expect(west).toHaveLength(2);
    expect(east).toHaveLength(2);
    west.forEach((part, index) => {
      expect(east[index].position[0]).toBeCloseTo(-part.position[0], 10);
      expect(east[index].position[1]).toBeCloseTo(part.position[1], 10);
      expect(east[index].position[2]).toBeCloseTo(part.position[2], 10);
      expect(east[index].scale).toEqual(part.scale);
    });
  });

  it("층수를 늘리면 그 건물만 층고의 배수만큼 높아지고 창이 늘어난다", () => {
    const base = buildStudioBg3dStreetParts({ westFloors: [3, 3], eastFloors: [3, 3] });
    const taller = buildStudioBg3dStreetParts({ westFloors: [3, 5], eastFloors: [3, 3] });
    const heights = (parts: typeof base) => parts.filter((part) => part.name === "건물 본체").map((part) => part.scale[1]);
    const floorHeight = STUDIO_BG3D_STREET_DEFAULT_SPEC.floorHeight;
    const before = heights(base);
    const after = heights(taller);
    const changed = after.map((height, index) => height - before[index]).filter((delta) => delta !== 0);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toBeCloseTo(2 * floorHeight, 10);
    const windows = (parts: typeof base) => parts.filter((part) => part.name === "건물 창").length;
    expect(windows(taller) - windows(base)).toBe(4);
  });

  it("차로 폭을 키우면 도로가 넓어지고 보도·건물이 그만큼 바깥으로 밀린다", () => {
    const narrow = buildStudioBg3dStreetParts({ laneWidth: 2.7 });
    const wide = buildStudioBg3dStreetParts({ laneWidth: 3.5 });
    const roadWidth = (parts: typeof narrow) => parts.find((part) => part.name === "도로")!.scale[0];
    expect(roadWidth(wide) - roadWidth(narrow)).toBeCloseTo(2 * (3.5 - 2.7), 10);
    const facade = (parts: typeof narrow) => Math.max(...parts.filter((part) => part.name === "건물 문").map((part) => Math.abs(part.position[0])));
    expect(facade(wide) - facade(narrow)).toBeCloseTo(3.5 - 2.7, 10);
  });
});

describe("planStudioBg3dStreetBuild", () => {
  it("주입한 idFactory 로 결정적 BgPrimitive[] 를 만들고 이름이 파츠 이름이다", () => {
    let counter = 0;
    const plan = planStudioBg3dStreetBuild({}, 0, () => `street-${counter++}`);
    expect(plan.anchorX).toBe(0);
    expect(plan.primitives[0]).toMatchObject({ id: "street-0", name: "도로", kind: "box" });
    expect(new Set(plan.primitives.map((item) => item.id)).size).toBe(plan.primitives.length);
    expect(plan.primitives).toHaveLength(buildStudioBg3dStreetParts({}).length);
  });

  it("기존 도형 수 x (거리 단면 폭 / 6) 만큼 X 로 밀린다", () => {
    const spec = STUDIO_BG3D_STREET_DEFAULT_SPEC;
    const base = planStudioBg3dStreetBuild(spec, 0, () => "a");
    const shifted = planStudioBg3dStreetBuild(spec, 30, () => "b");
    expect(shifted.anchorX).toBeCloseTo(30 * (studioBg3dStreetFootprintWidth(spec) / 6), 10);
    expect(shifted.primitives[0].position[0] - base.primitives[0].position[0]).toBeCloseTo(shifted.anchorX, 10);
  });

  it("비정상 스펙도 clamp 한 뒤 전개한다", () => {
    const plan = planStudioBg3dStreetBuild({ length: Number.NaN, westFloors: [99] }, 0, () => "x");
    expect(plan.primitives.length).toBeGreaterThan(20);
    for (const item of plan.primitives) expect(item.position.every(Number.isFinite)).toBe(true);
  });
});
