/**
 * 키트 몸 가림의 순수 범위 계산: 분할 검증, 숨김 합집합, 보이는 구간 병합, 숨김 삼각형 수.
 * Babylon SubMesh 적용은 `babylon-kit-load.test.ts`(NullEngine)가 확인한다.
 */
import { describe, expect, it } from "vitest";

import { KIT_HIDEABLE_REGION_IDS } from "../contracts";

import { hiddenTriangleCount, regionRangeProblems, unionHiddenRegions, visibleIndexRuns } from "./kit-region-mask";

import type { RegionRangeLike } from "./kit-region-mask";

/** 영역마다 삼각형 `trianglesPerRegion`개를 차례로 배정한 분할 */
function partition(trianglesPerRegion: number): RegionRangeLike[] {
  return KIT_HIDEABLE_REGION_IDS.map((id, index) => ({ id, mesh: "TS_Body", indexStart: index * trianglesPerRegion * 3, indexCount: trianglesPerRegion * 3 }));
}

const TOTAL = KIT_HIDEABLE_REGION_IDS.length * 2 * 3;

describe("regionRangeProblems", () => {
  it("빈틈·겹침 없는 분할은 문제가 없다", () => {
    expect(regionRangeProblems(partition(2), "TS_Body", TOTAL)).toEqual([]);
  });

  it("범위가 하나도 없으면(몸 가림 정보 없음) 문제로 보지 않는다", () => {
    expect(regionRangeProblems([], "TS_Body", TOTAL)).toEqual([]);
  });

  it("영역 순서가 섞여 선언돼도 시작 위치로 정렬해 분할을 판정한다", () => {
    const shuffled = [...partition(2)].reverse();
    expect(regionRangeProblems(shuffled, "TS_Body", TOTAL)).toEqual([]);
  });

  it("빈틈은 어느 영역에도 속하지 않는 구간으로 보고한다", () => {
    const ranges = partition(2).map((range, index) => (index === 3 ? { ...range, indexStart: range.indexStart + 3, indexCount: range.indexCount - 3 } : range));
    const problems = regionRangeProblems(ranges, "TS_Body", TOTAL);
    expect(problems.some((line) => line.includes("속하지 않는 인덱스 구간"))).toBe(true);
  });

  it("겹침을 보고한다", () => {
    const ranges = partition(2).map((range, index) => (index === 4 ? { ...range, indexStart: range.indexStart - 3, indexCount: range.indexCount + 3 } : range));
    expect(regionRangeProblems(ranges, "TS_Body", TOTAL).some((line) => line.includes("겹칩니다"))).toBe(true);
  });

  it("합이 전체 인덱스 수와 다르면 보고한다", () => {
    expect(regionRangeProblems(partition(2), "TS_Body", TOTAL + 3).some((line) => line.includes("다릅니다"))).toBe(true);
    expect(regionRangeProblems(partition(2), "TS_Body", TOTAL - 3).some((line) => line.includes("다릅니다") || line.includes("겹칩니다"))).toBe(true);
  });

  it("삼각형(3) 경계에 맞지 않거나 대상 메시가 다르거나 같은 영역이 두 번이면 보고한다", () => {
    const ranges = partition(2);
    const first = ranges[0] as RegionRangeLike;
    expect(regionRangeProblems([{ ...first, indexCount: 4 }, ...ranges.slice(1)], "TS_Body", TOTAL).some((line) => line.includes("삼각형(3) 경계"))).toBe(true);
    expect(regionRangeProblems([{ ...first, mesh: "TS_Head" }, ...ranges.slice(1)], "TS_Body", TOTAL).some((line) => line.includes("TS_Head"))).toBe(true);
    expect(regionRangeProblems([...ranges, { ...first }], "TS_Body", TOTAL).some((line) => line.includes("두 번"))).toBe(true);
    expect(regionRangeProblems(ranges, "TS_Body", TOTAL + 1).some((line) => line.includes("3의 배수"))).toBe(true);
  });
});

describe("unionHiddenRegions", () => {
  it("여러 파츠의 hides를 합집합으로 모은다(중복 한 번)", () => {
    const union = unionHiddenRegions([["torso", "upperArm.L"], ["pelvis", "torso"], []]);
    expect([...union].sort()).toEqual(["pelvis", "torso", "upperArm.L"]);
  });

  it("숨김이 없으면 빈 집합이다", () => {
    expect(unionHiddenRegions([]).size).toBe(0);
    expect(unionHiddenRegions([[], []]).size).toBe(0);
  });
});

describe("visibleIndexRuns", () => {
  it("숨김이 없으면 전체 구간 하나다", () => {
    expect(visibleIndexRuns(partition(2), new Set(), TOTAL)).toEqual([{ indexStart: 0, indexCount: TOTAL }]);
  });

  it("범위 정보가 없으면 숨길 수 없으므로 전체 구간 하나다", () => {
    expect(visibleIndexRuns([], new Set(["torso"]), TOTAL)).toEqual([{ indexStart: 0, indexCount: TOTAL }]);
  });

  it("가운데 영역을 숨기면 앞뒤 두 구간으로 나뉜다", () => {
    const ranges = partition(2);
    const torso = ranges.find((range) => range.id === "torso") as RegionRangeLike;
    const runs = visibleIndexRuns(ranges, new Set(["torso"]), TOTAL);
    expect(runs).toEqual([
      { indexStart: 0, indexCount: torso.indexStart },
      { indexStart: torso.indexStart + torso.indexCount, indexCount: TOTAL - (torso.indexStart + torso.indexCount) },
    ]);
  });

  it("인접한 숨김 영역은 하나의 틈이고 인접한 보이는 영역은 한 구간으로 합쳐진다", () => {
    const ranges = partition(2);
    const runs = visibleIndexRuns(ranges, new Set(["torso", "pelvis"]), TOTAL);
    expect(runs).toHaveLength(2);
    const covered = runs.reduce((sum, run) => sum + run.indexCount, 0);
    expect(covered).toBe(TOTAL - 2 * 2 * 3);
  });

  it("떨어진 숨김 영역은 구간을 여러 개로 나눈다", () => {
    const ranges = partition(1);
    const runs = visibleIndexRuns(ranges, new Set(["neck", "pelvis", "foot.R"]), KIT_HIDEABLE_REGION_IDS.length * 3);
    // neck(0), pelvis(2), foot.R(14)를 뺀 구간: [1], [3..13]
    expect(runs).toEqual([
      { indexStart: 3, indexCount: 3 },
      { indexStart: 9, indexCount: 33 },
    ]);
  });

  it("끝 영역을 숨기면 마지막 구간이 잘리고, 모두 숨기면 빈 배열이다", () => {
    const ranges = partition(2);
    const last = ranges[ranges.length - 1] as RegionRangeLike;
    const runs = visibleIndexRuns(ranges, new Set([last.id]), TOTAL);
    expect(runs).toEqual([{ indexStart: 0, indexCount: last.indexStart }]);
    expect(visibleIndexRuns(ranges, new Set(KIT_HIDEABLE_REGION_IDS), TOTAL)).toEqual([]);
  });

  it("범위에 없는 영역 id를 숨기라고 해도 무시한다", () => {
    expect(visibleIndexRuns(partition(2), new Set(["head"]), TOTAL)).toEqual([{ indexStart: 0, indexCount: TOTAL }]);
  });
});

describe("hiddenTriangleCount", () => {
  it("숨기는 영역의 삼각형 수를 센다", () => {
    expect(hiddenTriangleCount(partition(2), new Set())).toBe(0);
    expect(hiddenTriangleCount(partition(2), new Set(["torso", "pelvis"]))).toBe(4);
    expect(hiddenTriangleCount(partition(2), new Set(KIT_HIDEABLE_REGION_IDS))).toBe(KIT_HIDEABLE_REGION_IDS.length * 2);
  });
});
