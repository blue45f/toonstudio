import { describe, expect, it } from "vitest";

import { resolveStudioBg3dInference, collectStudioBg3dInferenceIncidentDirections } from "./studio-bg3d-inference-engine";
import { createStudioBg3dInferenceIndex } from "./studio-bg3d-inference-index";
import { STUDIO_BG3D_INFERENCE_AXIS_STYLE } from "./studio-bg3d-inference-kinds";
import { normalize, vec3 } from "./studio-bg3d-inference-math";
import { buildStudioBg3dInferenceSourceSet } from "./studio-bg3d-inference-sources";

import type { StudioBg3dInferenceKind } from "./studio-bg3d-inference-kinds";
import type {
  StudioBg3dInferenceLineSource,
  StudioBg3dInferenceSceneEntity,
} from "./studio-bg3d-inference-sources";
import type {
  StudioBg3dInferenceCursor,
  StudioBg3dInferenceQuery,
  StudioBg3dInferenceSuccess,
} from "./studio-bg3d-inference-types";

/** 64px = 1m (이진 분수라 px 경계 비교가 정확하다). */
const WPP = 1 / 64;

type Vec = readonly [number, number, number];

function box(id: string, position: Vec, scale = 1, rotation: Vec = [0, 0, 0]): StudioBg3dInferenceSceneEntity {
  return { id, kind: "box", position, rotation, scale: [scale, scale, scale] };
}

function guide(id: string, a: Vec, b: Vec, role: "guide" | "wall" = "guide"): StudioBg3dInferenceLineSource {
  return { id, a, b, label: id, role };
}

function indexOf(entities: StudioBg3dInferenceSceneEntity[], lines: StudioBg3dInferenceLineSource[] = []) {
  return createStudioBg3dInferenceIndex(buildStudioBg3dInferenceSourceSet({ entities, lines }));
}

type SurfaceHit = NonNullable<Extract<StudioBg3dInferenceCursor, { kind: "point" }>["surfaceHit"]>;

function pointCursor(point: Vec, surfaceHit?: SurfaceHit): StudioBg3dInferenceCursor {
  return { kind: "point", point, worldPerPixel: WPP, ...(surfaceHit ? { surfaceHit } : {}) };
}

function rayCursor(origin: Vec, target: Vec, extra: { groundY?: number | null } = {}): StudioBg3dInferenceCursor {
  const direction = normalize(vec3(target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]));
  if (!direction) throw new Error("방향이 0입니다");
  return {
    kind: "ray",
    origin,
    direction,
    projection: { type: "perspective", radiansPerPixel: 0.001 },
    ...extra,
  };
}

function ok(query: StudioBg3dInferenceQuery): StudioBg3dInferenceSuccess {
  const outcome = resolveStudioBg3dInference(query);
  if (!outcome.ok) throw new Error(`추론 실패: ${outcome.reason} ${outcome.message}`);
  return outcome;
}

function near(actual: readonly number[], expected: readonly number[], digits = 6) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index] ?? Number.NaN, digits));
}

describe("우선순위 충돌", () => {
  const index = indexOf([box("A", [0, 0.5, 0])]);

  it("끝점 안(10px 이내)이면 선 위에 0px로 걸쳐 있어도 끝점이 이긴다", () => {
    // 모서리 (0.5,1,0.5)에서 0.14m(8.96px) 떨어진, 모서리 선분 위의 점.
    const { result } = ok({ index, cursor: pointCursor([0.5, 1, 0.5 - 0.14]) });
    expect(result.kind).toBe("endpoint");
    near(result.point, [0.5, 1, 0.5]);
    expect(result.label).toBe("끝점");
    expect(result.detail).toBe("상자 · 꼭짓점");
  });

  it("같은 구간에서는 더 가까운 후보가 이긴다 (중간점 1px < 끝점 5px)", () => {
    const small = indexOf([box("S", [0, 0.1, 0], 0.2)]);
    const { result } = ok({ index: small, cursor: pointCursor([0.1, 0.2, 0.02]) });
    expect(result.kind).toBe("midpoint");
    near(result.point, [0.1, 0.2, 0]);
  });

  it("거리가 정확히 같으면 종류 순번(끝점 < 중간점)으로 가른다", () => {
    const small = indexOf([box("S", [0, 0.125, 0], 0.25)]);
    const { result, ranked } = ok({ index: small, cursor: pointCursor([0.125, 0.25, 0.0625]) });
    expect(ranked.slice(0, 2).map((candidate) => candidate.kind)).toEqual(["endpoint", "midpoint"]);
    expect(ranked[0]?.distancePx).toBe(ranked[1]?.distancePx);
    expect(result.kind).toBe("endpoint");
  });

  it("교차점과 끝점이 같은 자리면 끝점이 이긴다", () => {
    const crossing = indexOf([], [
      guide("g1", [-1, 0, 0], [1, 0, 0]),
      guide("g2", [0, 0, -1], [0, 0, 1]),
      guide("g3", [1, 0, 0], [2, 0, 1]),
    ]);
    // g1 끝점 (1,0,0)과 g3 시작점이 같은 자리 — 교차(내부) 후보는 끝점 후보로 흡수된다.
    const { result } = ok({ index: crossing, cursor: pointCursor([1.02, 0, 0]) });
    expect(result.kind).toBe("endpoint");
  });

  it("두 모서리가 안쪽에서 만나는 자리는 교차점이다", () => {
    const crossing = indexOf([], [
      guide("g1", [-1, 0, 0], [1, 0, 0]),
      guide("g2", [0, 0, -0.5], [0, 0, 1.5]),
    ]);
    const { result } = ok({ index: crossing, cursor: pointCursor([0.03, 0, 0.02]) });
    expect(result.kind).toBe("intersection");
    near(result.point, [0, 0, 0]);
    expect(result.sourceIds).toEqual(["g1", "g2"]);
    expect(result.detail).toBe("g1 × g2");
  });

  it("점이 정렬보다 먼저다: 축 위에 놓인 끝점은 끝점이고 축 유도선이 함께 나온다", () => {
    const world = indexOf([], [guide("g1", [3, 0, 0], [3, 0, 2])]);
    const { result } = ok({ index: world, cursor: pointCursor([3, 0, 0.03]), referencePoint: [0, 0, 0] });
    expect(result.kind).toBe("endpoint");
    expect(result.guides.some((g) => g.role === "axis" && g.axis === "x")).toBe(true);
    expect(result.axis).toBe("x");
    expect(result.announcement).toContain("X축 정렬");
  });

  it("선 위(8px 이내)가 축 정렬보다 먼저다", () => {
    const world = indexOf([], [guide("g1", [2, 0, -0.1], [2, 0, 3])]);
    const { result } = ok({ index: world, cursor: pointCursor([2, 0, 0.0625]), referencePoint: [0, 0, 0] });
    expect(result.kind).toBe("on-edge");
    expect(result.edgeId).toBe("g1:e");
    near(result.point, [2, 0, 0.0625]);
  });

  it("축 정렬이 면 위보다 먼저다", () => {
    const world = indexOf([box("far", [50, 0.5, 50])]);
    const cursor = pointCursor([2, 0, 0.0625], { point: [2, 0, 0.0625], normal: [0, 1, 0], sourceId: "ground", label: "바닥" });
    const { result } = ok({ index: world, cursor, referencePoint: [0, 0, 0] });
    expect(result.kind).toBe("axis");
    expect(result.axis).toBe("x");
    expect(result.label).toBe("X축 정렬");
    near(result.point, [2, 0, 0]);
  });

  it("후보가 없으면 면 위, 면도 없으면 자유 위치를 돌려준다", () => {
    const world = indexOf([box("far", [50, 0.5, 50])]);
    const face = ok({
      index: world,
      cursor: pointCursor([1, 0, 1], { point: [1, 0, 1], normal: [0, 1, 0], sourceId: "ground", label: "바닥" }),
    });
    expect(face.result.kind).toBe("on-face");
    expect(face.result.normal).toEqual([0, 1, 0]);
    expect(face.result.detail).toBe("바닥");
    const free = ok({ index: world, cursor: pointCursor([1, 0, 1]) });
    expect(free.result.kind).toBe("free");
    expect(free.result.distancePx).toBeNull();
    expect(free.result.guides).toHaveLength(0);
  });

  it("preferKinds는 거리와 구간을 무시하고 해당 종류를 먼저 평가한다", () => {
    const world = indexOf([], [guide("g1", [3, 0, 0], [3, 0, 2])]);
    const base: StudioBg3dInferenceQuery = {
      index: world,
      cursor: pointCursor([3, 0, 0.1]),
      referencePoint: [0, 0, 0],
    };
    expect(ok(base).result.kind).toBe("endpoint");
    const preferred = ok({ ...base, preferKinds: new Set<StudioBg3dInferenceKind>(["axis"]) });
    expect(preferred.result.kind).toBe("axis");
  });

  it("enabledKinds는 허용한 종류만 후보로 쓴다", () => {
    const world = indexOf([box("A", [0, 0.5, 0])]);
    const cursor = pointCursor([0.55, 1, 0.5]);
    expect(ok({ index: world, cursor }).result.kind).toBe("endpoint");
    const onlyMid = ok({ index: world, cursor, enabledKinds: new Set<StudioBg3dInferenceKind>(["midpoint"]) });
    expect(onlyMid.result.kind).toBe("free");
    const onlyFace = ok({
      index: world,
      cursor: pointCursor([0.55, 1, 0.5], { point: [0.55, 1, 0.5], sourceId: "A", label: "윗면" }),
      enabledKinds: new Set<StudioBg3dInferenceKind>(["on-face"]),
    });
    expect(onlyFace.result.kind).toBe("on-face");
  });

  it("객체 입력 순서가 달라도 같은 결과를 낸다 (결정성)", () => {
    const entities = [box("A", [0, 0.5, 0]), box("B", [1, 0.5, 0]), box("C", [0.5, 0.5, 1])];
    const forward = ok({ index: indexOf(entities), cursor: pointCursor([0.5, 1, 0.5]) });
    const reversed = ok({ index: indexOf([...entities].reverse()), cursor: pointCursor([0.5, 1, 0.5]) });
    expect(reversed.result.kind).toBe(forward.result.kind);
    expect(reversed.result.point).toEqual(forward.result.point);
    expect(reversed.ranked.map((r) => r.kind)).toEqual(forward.ranked.map((r) => r.kind));
  });

  it("excludeSourceIds에 든 출처는 후보에서 빠진다", () => {
    const world = indexOf([box("A", [0, 0.5, 0]), box("B", [3, 0.5, 0])]);
    const cursor = pointCursor([0.55, 1, 0.5]);
    expect(ok({ index: world, cursor }).result.sourceIds).toEqual(["A"]);
    expect(ok({ index: world, cursor, excludeSourceIds: new Set(["A"]) }).result.kind).toBe("free");
  });
});

describe("임계값 경계", () => {
  const big = indexOf([box("L", [0, 4, 0], 8)]);

  it("점 후보는 정확히 10px에서는 잡히고 그보다 멀면 놓친다", () => {
    const edge = ok({ index: big, cursor: pointCursor([4 + 10 * WPP, 8, 4]) });
    expect(edge.result.kind).toBe("endpoint");
    expect(edge.result.distancePx).toBe(10);
    const beyond = ok({ index: big, cursor: pointCursor([4 + 10 * WPP + 0.0001, 8, 4]) });
    expect(beyond.result.kind).toBe("free");
  });

  it("선 위 후보는 정확히 8px에서는 잡히고 그보다 멀면 놓친다", () => {
    const hit = ok({ index: big, cursor: pointCursor([4 + 8 * WPP, 8, 1]) });
    expect(hit.result.kind).toBe("on-edge");
    expect(hit.result.distancePx).toBe(8);
    const miss = ok({ index: big, cursor: pointCursor([4 + 8 * WPP + 0.0001, 8, 1]) });
    expect(miss.result.kind).toBe("free");
  });

  it("터치 포인터는 임계값이 2.2배로 늘어난다", () => {
    const cursor = pointCursor([4 + 15 * WPP, 8, 4]);
    expect(ok({ index: big, cursor, pointer: "mouse" }).result.kind).toBe("free");
    expect(ok({ index: big, cursor, pointer: "touch" }).result.kind).toBe("endpoint");
    // 펜은 1.4배(14px)라 15px는 놓치고 13px는 잡는다. 터치의 22px 경계도 확인한다.
    expect(ok({ index: big, cursor, pointer: "pen" }).result.kind).toBe("free");
    expect(ok({ index: big, cursor: pointCursor([4 + 13 * WPP, 8, 4]), pointer: "pen" }).result.kind).toBe("endpoint");
    expect(ok({ index: big, cursor: pointCursor([4 + 22 * WPP, 8, 4]), pointer: "touch" }).result.kind).toBe("endpoint");
    expect(ok({ index: big, cursor: pointCursor([4 + 23 * WPP, 8, 4]), pointer: "touch" }).result.kind).toBe("free");
  });

  it("사용자 지정 임계값을 존중한다", () => {
    const cursor = pointCursor([4 + 15 * WPP, 8, 4]);
    expect(ok({ index: big, cursor, thresholds: { pointPx: 16 } }).result.kind).toBe("endpoint");
    expect(
      ok({ index: big, cursor: pointCursor([4 + 5 * WPP, 8, 4]), thresholds: { pointPx: 4, edgePx: 4 } }).result.kind,
    ).toBe("free");
  });

  it("원근 레이: 같은 px라도 멀수록 월드 허용 거리가 커진다", () => {
    const nearWorld = indexOf([box("N", [0, 2, 0])]);
    const farWorld = indexOf([box("F", [0, 2, -90])]);
    const origin: Vec = [0, 6, 10];
    // 같은 0.15m 비껴가는 조준: 가까운 상자(깊이≈10m)는 약 15px이라 놓치고, 먼 상자(깊이≈100m)는 약 1.5px이라 잡는다.
    const nearAim = ok({
      index: nearWorld,
      cursor: rayCursor(origin, [0.65, 2.5, 0.5], { groundY: 0 }),
    });
    expect(nearAim.result.kind).not.toBe("endpoint");
    const farAim = ok({
      index: farWorld,
      cursor: rayCursor(origin, [0.65, 2.5, -89.5], { groundY: 0 }),
    });
    expect(farAim.result.kind).toBe("endpoint");
    expect(farAim.result.distancePx).toBeLessThan(3);
  });

  it("직교 레이: 깊이와 무관하게 px당 월드 길이가 일정하다", () => {
    const world = indexOf([box("N", [0, 2, 0])]);
    const aim = (offset: number): StudioBg3dInferenceCursor => ({
      kind: "ray",
      origin: [0.5 + offset, 20, 0.5],
      direction: [0, -1, 0],
      projection: { type: "orthographic", worldPerPixel: WPP },
      groundY: 0,
    });
    expect(ok({ index: world, cursor: aim(8 * WPP) }).result.kind).toBe("endpoint");
    expect(ok({ index: world, cursor: aim(30 * WPP) }).result.kind).not.toBe("endpoint");
  });
});

describe("기준점·축 정렬·기준점 연장", () => {
  const empty = indexOf([box("far", [80, 0.5, 80])]);

  it("기준점의 X 축선 8px 이내이면 X축 정렬로 붙는다", () => {
    const { result } = ok({ index: empty, cursor: pointCursor([2, 0, 0.0625]), referencePoint: [0, 0, 0] });
    expect(result.kind).toBe("axis");
    expect(result.axis).toBe("x");
    near(result.point, [2, 0, 0]);
    expect(result.alignmentOrigin).toEqual([0, 0, 0]);
    expect(result.guides[0]).toMatchObject({ role: "axis", axis: "x", dashed: false });
    expect(result.direction).toEqual([1, 0, 0]);
  });

  it("음의 방향 정렬은 방향 부호를 보존한다", () => {
    const { result } = ok({ index: empty, cursor: pointCursor([-3, 0.03, 0]), referencePoint: [0, 0, 0] });
    expect(result.axis).toBe("x");
    expect(result.direction).toEqual([-1, 0, 0]);
  });

  it("Y(높이) 축 정렬은 초록 축으로 표기된다", () => {
    const { result } = ok({ index: empty, cursor: pointCursor([0.03, 4, 0]), referencePoint: [0, 0, 0] });
    expect(result.axis).toBe("y");
    expect(result.label).toBe("Y축 정렬");
    expect(STUDIO_BG3D_INFERENCE_AXIS_STYLE.y.colorName).toBe("초록");
  });

  it("기준점 근처(4px 미만)에서는 방향 추론을 하지 않는다", () => {
    const { result } = ok({ index: empty, cursor: pointCursor([0.03, 0, 0]), referencePoint: [0, 0, 0] });
    expect(result.kind).toBe("free");
  });

  it("호버 기준점에서 연장: 기준점 축선과 다른 축의 연장선에 붙는다", () => {
    const { result } = ok({
      index: empty,
      cursor: pointCursor([3.03, 0, 6]),
      referencePoint: [0, 0, 0],
      hoverReferences: [[3, 0, 3]],
    });
    expect(result.kind).toBe("from-point");
    expect(result.axis).toBe("z");
    near(result.point, [3, 0, 6]);
    expect(result.alignmentOrigin).toEqual([3, 0, 3]);
    expect(result.label).toBe("기준점에서 Z축 연장");
    expect(result.guides[0]?.dashed).toBe(true);
  });

  it("기준점이 없어도 호버 기준점의 연장선에 붙는다 (첫 점을 다른 점에 정렬해 시작)", () => {
    const { result } = ok({
      index: empty,
      cursor: pointCursor([5.02, 10, 0.03]),
      hoverReferences: [[5, 0, 0]],
    });
    expect(result.kind).toBe("from-point");
    expect(result.axis).toBe("y");
    near(result.point, [5, 10, 0]);
    expect(result.alignmentOrigin).toEqual([5, 0, 0]);
  });

  it("기준점도 호버 기준점도 없으면 정렬 후보를 만들지 않는다", () => {
    const { result } = ok({ index: empty, cursor: pointCursor([5.02, 10, 0.03]) });
    expect(result.kind).toBe("free");
  });

  it("기준점 축선과 겹치는 호버 연장선은 중복으로 보고 건너뛴다", () => {
    const { result } = ok({
      index: empty,
      cursor: pointCursor([6, 0.03, 0]),
      referencePoint: [0, 0, 0],
      hoverReferences: [[3, 0, 0]],
    });
    expect(result.kind).toBe("axis");
  });

  it("호버 기준점은 최대 4개까지만 평가한다", () => {
    const hovers: Vec[] = [[1, 0, 1], [2, 0, 2], [3, 0, 3], [4, 0, 4], [9, 0, 9]];
    const { result } = ok({
      index: empty,
      cursor: pointCursor([9.03, 0, 15]),
      referencePoint: [0, 0, 0],
      hoverReferences: hovers,
    });
    // 다섯 번째 호버(9,0,9)의 Z 연장선은 평가 대상이 아니다.
    expect(result.kind).toBe("free");
  });

  it("기준점이 비정상이면 추론을 건너뛰고 이유를 알린다", () => {
    const outcome = resolveStudioBg3dInference({
      index: empty,
      cursor: pointCursor([1, 0, 1]),
      referencePoint: [Number.NaN, 0, 0],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("invalid-reference");
  });
});

describe("평행·수직", () => {
  const world = indexOf([], [guide("wall", [0, 0, 0], [4, 0, 4])]);
  const directions = collectStudioBg3dInferenceIncidentDirections(world, vec3(0, 0, 0));

  it("기준점에 닿은 모서리 방향을 한 번에 모은다", () => {
    expect(directions).toHaveLength(1);
    near(directions[0]?.direction ?? [], [Math.SQRT1_2, 0, Math.SQRT1_2]);
    expect(directions[0]?.segment).toEqual({ a: [0, 0, 0], b: [4, 0, 4] });
    expect(collectStudioBg3dInferenceIncidentDirections(world, vec3(2, 0, 2))).toHaveLength(0);
    expect(collectStudioBg3dInferenceIncidentDirections(world, vec3(Number.NaN, 0, 0))).toHaveLength(0);
  });

  it("모서리에 수직인 방향으로 움직이면 수직 후보가 된다", () => {
    const { result } = ok({
      index: world,
      cursor: pointCursor([-2, 0, 2.03]),
      referencePoint: [0, 0, 0],
      referenceDirections: [{ id: "r", label: "벽선", direction: [Math.SQRT1_2, 0, Math.SQRT1_2] }],
    });
    expect(result.kind).toBe("perpendicular");
    near(result.point, [-2.015, 0, 2.015], 3);
    expect(result.detail).toBe("벽선에 수직");
  });

  it("모서리 연장선 위로 움직이면 평행이고 기준 모서리 유도선이 따라온다", () => {
    const { result } = ok({
      index: indexOf([box("far", [80, 0.5, 80])]),
      cursor: pointCursor([2, 0, 2.03]),
      referencePoint: [0, 0, 0],
      referenceDirections: directions,
    });
    expect(result.kind).toBe("parallel");
    near(result.point, [2.015, 0, 2.015], 3);
    expect(result.guides.map((g) => g.role)).toEqual(["relation", "reference-edge"]);
    expect(result.detail).toContain("에 평행");
  });

  it("고무줄이 너무 짧으면 평행·수직을 제안하지 않는다", () => {
    const { result } = ok({
      index: indexOf([box("far", [80, 0.5, 80])]),
      cursor: pointCursor([0.03, 0, 0.03]),
      referencePoint: [0, 0, 0],
      referenceDirections: directions,
    });
    expect(result.kind).toBe("free");
  });

  it("방향이 0인 기준 방향은 무시한다", () => {
    const { result } = ok({
      index: indexOf([box("far", [80, 0.5, 80])]),
      cursor: pointCursor([2, 0, 2.03]),
      referencePoint: [0, 0, 0],
      referenceDirections: [{ id: "zero", label: "빈", direction: [0, 0, 0] }],
    });
    expect(result.kind).toBe("free");
  });
});

describe("축 잠금·추론 유지", () => {
  const world = indexOf([box("far", [80, 0.5, 80])], [
    guide("e1", [4, 1, 0], [4, 3, 0]),
    guide("e2", [3, 0, -0.5], [3, 0, 3]),
  ]);

  it("X 잠금: 커서가 선에서 멀어도 결과는 잠금선 위에 있다", () => {
    const { result } = ok({
      index: indexOf([box("far", [80, 0.5, 80])]),
      cursor: pointCursor([2, 5, 3]),
      referencePoint: [0, 0, 0],
      lock: { kind: "axis", axis: "x" },
    });
    expect(result.kind).toBe("axis");
    expect(result.constraint).toEqual({ kind: "axis", axis: "x" });
    near(result.point, [2, 0, 0]);
    expect(result.announcement).toContain("X축 · 좌우 · 빨강 잠금");
    expect(result.guides[0]?.role).toBe("lock");
  });

  it("Y(수직) 잠금과 Z 잠금도 각자 축선 위로 투영한다", () => {
    const base = { index: indexOf([box("far", [80, 0.5, 80])]), referencePoint: [1, 1, 1] as Vec, cursor: pointCursor([4, 7, -2]) };
    near(ok({ ...base, lock: { kind: "axis", axis: "y" } }).result.point, [1, 7, 1]);
    near(ok({ ...base, lock: { kind: "axis", axis: "z" } }).result.point, [1, 1, -2]);
  });

  it("잠금 중 끝점 위에 커서를 올리면 그 점을 잠금선에 투영해 붙는다", () => {
    const { result } = ok({
      index: world,
      cursor: pointCursor([4, 1.03, 0]),
      referencePoint: [0, 0, 0],
      lock: { kind: "axis", axis: "x" },
    });
    expect(result.kind).toBe("endpoint");
    expect(result.projected).toBe(true);
    near(result.point, [4, 0, 0]);
    expect(result.guides.map((g) => g.role)).toContain("projection");
    expect(result.announcement).toContain("잠금선에 투영");
  });

  it("잠금선이 다른 모서리를 가로지르면 교차점을 잡는다", () => {
    const { result } = ok({
      index: world,
      cursor: pointCursor([3.03, 0, 0]),
      referencePoint: [0, 0, 0],
      lock: { kind: "axis", axis: "x" },
    });
    expect(result.kind).toBe("intersection");
    near(result.point, [3, 0, 0]);
    expect(result.projected).toBe(false);
    expect(result.edgeId).toBe("e2:e");
  });

  it("방향 잠금(평행)은 지정한 방향의 직선 위로 투영한다", () => {
    const { result } = ok({
      index: indexOf([box("far", [80, 0.5, 80])]),
      cursor: pointCursor([2, 0, 0]),
      referencePoint: [0, 0, 0],
      lock: { kind: "direction", direction: [1, 1, 0], relation: "parallel", referenceId: "r", referenceLabel: "벽선" },
    });
    expect(result.kind).toBe("parallel");
    expect(result.constraint).toEqual({ kind: "direction", relation: "parallel" });
    near(result.point, [1, 1, 0]);
    expect(result.detail).toBe("벽선에 평행");
  });

  it("기준점이 없으면 잠금은 적용되지 않는다", () => {
    const { result } = ok({
      index: indexOf([box("far", [80, 0.5, 80])]),
      cursor: pointCursor([2, 5, 3]),
      lock: { kind: "axis", axis: "x" },
    });
    expect(result.kind).toBe("free");
    expect(result.constraint.kind).toBe("none");
  });

  it("유지(선): 기준점 없이도 유지한 직선 위로 제한한다", () => {
    const { result } = ok({
      index: indexOf([box("far", [80, 0.5, 80])]),
      cursor: pointCursor([5, 0, 3]),
      hold: { kind: "line", origin: [0, 0, 0], direction: [0, 0, 1], axis: "z", from: "axis" },
    });
    expect(result.constraint).toEqual({ kind: "hold-line" });
    near(result.point, [0, 0, 3]);
    expect(result.axis).toBe("z");
    expect(result.announcement).toContain("추론 유지");
  });

  it("유지(면): 평면 위로 투영하고 평면 위 끝점에 붙는다", () => {
    const plane = indexOf([box("A", [0, 1, 0], 2)]);
    const held = ok({
      index: plane,
      cursor: pointCursor([3, 5, 4]),
      hold: { kind: "plane", point: [0, 2, 0], normal: [0, 1, 0], sourceId: "A" },
    });
    expect(held.result.kind).toBe("on-face");
    near(held.result.point, [3, 2, 4]);
    const snapped = ok({
      index: plane,
      cursor: pointCursor([1.02, 5, 1]),
      hold: { kind: "plane", point: [0, 2, 0], normal: [0, 1, 0], sourceId: "A" },
    });
    expect(snapped.result.kind).toBe("endpoint");
    near(snapped.result.point, [1, 2, 1]);
  });

  it("유지(점): 커서와 무관하게 그 점에 고정된다", () => {
    const { result } = ok({
      index: world,
      cursor: pointCursor([9, 9, 9]),
      hold: { kind: "point", point: [1, 2, 3], from: "endpoint" },
    });
    expect(result.kind).toBe("endpoint");
    expect(result.point).toEqual([1, 2, 3]);
    expect(result.constraint).toEqual({ kind: "hold-point" });
  });
});

describe("레이 커서", () => {
  const front = box("F", [0, 2, 0]);

  it("레이가 모서리 가까이 지나가면 끝점을 잡는다 (깊이별 px 환산)", () => {
    const index = indexOf([front]);
    const { result } = ok({ index, cursor: rayCursor([0, 2, 10], [0.55, 2.5, 0.5]) });
    expect(result.kind).toBe("endpoint");
    near(result.point, [0.5, 2.5, 0.5]);
  });

  it("해석적 레이-상자 교차로 면 위를 잡고 법선을 돌려준다", () => {
    const index = indexOf([front]);
    const { result } = ok({ index, cursor: rayCursor([0, 2, 10], [0.2, 2.2, 0.5]) });
    expect(result.kind).toBe("on-face");
    near(result.point, [0.2, 2.2, 0.5]);
    expect(result.normal && Math.abs(result.normal[2] - 1) < 1e-9).toBe(true);
    expect(result.sourceIds).toEqual(["F"]);
  });

  it("앞 객체에 가려진 뒤쪽 끝점은 후보에서 제외된다 (가림 판정)", () => {
    // 레이를 앞 상자 정면 (0.2,2.2,0.5)에 겨누고, 같은 직선 뒤(z=-5)에 다른 상자 모서리를 둔다.
    const origin: Vec = [0, 2, 10];
    const target: Vec = [0.2, 2.2, 0.5];
    const s = 15 / 9.5;
    const behindCorner: Vec = [origin[0] + (target[0] - origin[0]) * s, origin[1] + (target[1] - origin[1]) * s, -5];
    const back = box("K", [behindCorner[0] + 0.5, behindCorner[1] + 0.5, behindCorner[2] - 0.5]);
    const index = indexOf([front, back]);
    const aimed = ok({ index, cursor: rayCursor(origin, target) });
    expect(aimed.result.kind).toBe("on-face");
    expect(aimed.result.sourceIds).toEqual(["F"]);
    // 앞 상자를 치우면 같은 레이가 뒤쪽 끝점을 잡는다 — 가림 판정이 원인임을 확인한다.
    const clear = ok({ index: indexOf([back]), cursor: rayCursor(origin, target) });
    expect(clear.result.kind).toBe("endpoint");
    expect(clear.result.sourceIds).toEqual(["K"]);
  });

  it("바닥 평면과 만나면 '바닥' 면 위로 잡는다", () => {
    const index = indexOf([box("far", [80, 0.5, 80])]);
    const { result } = ok({ index, cursor: rayCursor([0, 4, 6], [1, 0, 0], { groundY: 0 }) });
    expect(result.kind).toBe("on-face");
    expect(result.detail).toBe("바닥");
    near(result.point, [1, 0, 0]);
    expect(result.normal).toEqual([0, 1, 0]);
  });

  it("아무것도 닿지 않고 바닥도 없으면 'no-target' 실패를 돌려준다", () => {
    const index = indexOf([box("far", [80, 0.5, 80])]);
    const outcome = resolveStudioBg3dInference({ index, cursor: rayCursor([0, 4, 6], [0, 10, -5]) });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("no-target");
  });

  it("어댑터가 알려 준 표면 교점(surfaceHit)이 해석적 판정보다 우선한다", () => {
    const index = indexOf([front]);
    const { result } = ok({
      index,
      cursor: {
        ...rayCursor([0, 2, 10], [0.2, 2.2, 0.5]),
        surfaceHit: { point: [0.2, 2.2, 0.5], normal: [0, 0, 2], sourceId: "F", label: "앞면" },
      },
    });
    expect(result.kind).toBe("on-face");
    expect(result.normal).toEqual([0, 0, 1]);
  });

  it("레이 방향이 0이면 invalid-cursor 실패다", () => {
    const outcome = resolveStudioBg3dInference({
      index: indexOf([front]),
      cursor: { kind: "ray", origin: [0, 0, 0], direction: [0, 0, 0], projection: { type: "perspective", radiansPerPixel: 0.001 } },
    });
    expect(outcome.ok).toBe(false);
  });
});

describe("격자·실패 경로", () => {
  const empty = indexOf([box("far", [80, 0.5, 80])]);

  it("격자는 가장 낮은 우선순위의 폴백이다", () => {
    const snapped = ok({ index: empty, cursor: pointCursor([0.48, 0, 1.01]), grid: { step: 0.5 } });
    expect(snapped.result.kind).toBe("grid");
    near(snapped.result.point, [0.5, 0, 1]);
    expect(snapped.result.label).toBe("격자");
    const missed = ok({ index: empty, cursor: pointCursor([0.25, 0, 0.75]), grid: { step: 0.5 } });
    expect(missed.result.kind).toBe("free");
  });

  it("격자보다 면 위가 먼저다", () => {
    const { result } = ok({
      index: empty,
      cursor: pointCursor([0.48, 0, 1.01], { point: [0.48, 0, 1.01], sourceId: "ground", label: "바닥" }),
      grid: { step: 0.5 },
    });
    expect(result.kind).toBe("on-face");
  });

  it("비정상 커서·배율은 이유와 한국어 안내와 함께 실패한다", () => {
    const nan = resolveStudioBg3dInference({ index: empty, cursor: pointCursor([Number.NaN, 0, 0]) });
    expect(nan.ok).toBe(false);
    if (!nan.ok) {
      expect(nan.reason).toBe("invalid-cursor");
      expect(nan.message).toContain("커서");
    }
    const far = resolveStudioBg3dInference({ index: empty, cursor: pointCursor([20_000, 0, 0]) });
    expect(far.ok).toBe(false);
    const zero = resolveStudioBg3dInference({
      index: empty,
      cursor: { kind: "point", point: [0, 0, 0], worldPerPixel: 0 },
    });
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.reason).toBe("invalid-scale");
  });

  it("입력(색인·쿼리)을 변경하지 않는다", () => {
    const query: StudioBg3dInferenceQuery = { index: empty, cursor: pointCursor([0.55, 1, 0.5]), referencePoint: [0, 0, 0] };
    const before = JSON.stringify({ stats: empty.stats, cursor: query.cursor, reference: query.referencePoint });
    ok(query);
    ok(query);
    expect(JSON.stringify({ stats: empty.stats, cursor: query.cursor, reference: query.referencePoint })).toBe(before);
  });
});
