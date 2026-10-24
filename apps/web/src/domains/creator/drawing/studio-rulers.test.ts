import { describe, expect, it } from "vitest";

import {
  STUDIO_RULER_DEFAULT_COLORS,
  STUDIO_RULERS_MAX_PER_CANVAS,
  beginStudioPerspectiveSnapSession,
  createStudioConcentricRuler,
  createStudioCurveRuler,
  createStudioLineRuler,
  createStudioParallelLineRuler,
  createStudioPerspectiveRuler,
  createStudioRadialRuler,
  isStudioRulerKind,
  nearestPointOnBezier,
  normalizeStudioRulerColor,
  projectPointOnLine,
  snapPointToConcentricRuler,
  snapPointToRadialRuler,
  snapStudioPerspectivePoint,
  snapStudioRulerPoint,
  type StudioConcentricRuler,
  type StudioPerspectiveRuler,
} from "./studio-rulers";

const EPS = 1e-6;

function closeTo(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(1e-4);
}

describe("isStudioRulerKind", () => {
  it("4종 자 종류를 판별한다", () => {
    expect(isStudioRulerKind("line")).toBe(true);
    expect(isStudioRulerKind("curve")).toBe(true);
    expect(isStudioRulerKind("concentric")).toBe(true);
    expect(isStudioRulerKind("perspective")).toBe(true);
    expect(isStudioRulerKind("fisheye")).toBe(false);
    expect(isStudioRulerKind(null)).toBe(false);
  });
});

describe("normalizeStudioRulerColor", () => {
  it("hex 색상은 그대로 통과한다", () => {
    expect(normalizeStudioRulerColor("#abc", "line")).toBe("#abc");
    expect(normalizeStudioRulerColor("#A1B2C3", "curve")).toBe("#A1B2C3");
  });

  it("이상한 값은 종류별 기본색으로 폴백한다", () => {
    expect(normalizeStudioRulerColor("red", "line")).toBe(
      STUDIO_RULER_DEFAULT_COLORS.line,
    );
    expect(normalizeStudioRulerColor("#12345", "concentric")).toBe(
      STUDIO_RULER_DEFAULT_COLORS.concentric,
    );
    expect(normalizeStudioRulerColor(undefined, "perspective")).toBe(
      STUDIO_RULER_DEFAULT_COLORS.perspective,
    );
  });
});

describe("projectPointOnLine", () => {
  it("점을 직선에 수직 투영한다", () => {
    const p = projectPointOnLine({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    closeTo(p.x, 5);
    closeTo(p.y, 0);
  });

  it("대각선 자에도 투영한다", () => {
    const p = projectPointOnLine(
      { x: 10, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    );
    closeTo(p.x, 5);
    closeTo(p.y, 5);
  });

  it("두 점이 겹치면 입력을 그대로 반환한다", () => {
    const p = projectPointOnLine({ x: 7, y: 8 }, { x: 3, y: 3 }, { x: 3, y: 3 });
    expect(p).toEqual({ x: 7, y: 8 });
  });

  it("선분 밖의 점도 무한 직선에 투영한다 (자 연장선)", () => {
    const p = projectPointOnLine({ x: 20, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    closeTo(p.x, 20);
    closeTo(p.y, 0);
  });
});

describe("nearestPointOnBezier", () => {
  it("2차 베지어 위 최근접점을 찾는다", () => {
    const result = nearestPointOnBezier(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 100 },
      ],
      { x: 50, y: 25 },
    );
    closeTo(result.point.x, 50);
    closeTo(result.point.y, 25);
    closeTo(result.t, 0.5);
    expect(result.distance).toBeLessThan(EPS);
  });

  it("3차 베지어 위 최근접점을 찾는다", () => {
    const result = nearestPointOnBezier(
      [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ],
      { x: 50, y: 50 },
    );
    closeTo(result.point.x, 50);
    closeTo(result.point.y, 50);
    expect(result.distance).toBeLessThan(EPS);
  });

  it("곡선 밖의 점은 곡선 위로 당겨진다", () => {
    const result = nearestPointOnBezier(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
      ],
      { x: 50, y: 30 },
    );
    closeTo(result.point.x, 50);
    closeTo(result.point.y, 0);
    closeTo(result.distance, 30);
  });
});

describe("snapPointToConcentricRuler", () => {
  const ruler: StudioConcentricRuler = createStudioConcentricRuler({
    centerX: 0,
    centerY: 0,
    baseRadius: 30,
    ringSpacing: 20,
    ringCount: 4,
  });

  it("가장 가까운 고리에 스냅한다", () => {
    const result = snapPointToConcentricRuler(ruler, { x: 44, y: 0 });
    expect(result.ringIndex).toBe(1);
    expect(result.radius).toBe(50);
    closeTo(result.point.x, 50);
    closeTo(result.point.y, 0);
  });

  it("각도는 유지하고 반지름만 맞춘다", () => {
    const result = snapPointToConcentricRuler(ruler, { x: 0, y: 68 });
    expect(result.ringIndex).toBe(2);
    closeTo(result.point.x, 0);
    closeTo(result.point.y, 70);
  });

  it("범위를 벗어나면 가장 바깥 고리에 클램핑한다", () => {
    const result = snapPointToConcentricRuler(ruler, { x: 500, y: 0 });
    expect(result.ringIndex).toBe(3);
    expect(result.radius).toBe(90);
    closeTo(result.point.x, 90);
  });

  it("타원 자에서는 타원 고리에 스냅한다", () => {
    const ellipse = createStudioConcentricRuler({
      centerX: 0,
      centerY: 0,
      baseRadius: 30,
      ringSpacing: 20,
      ringCount: 2,
      ellipseX: 2,
      ellipseY: 1,
    });
    const result = snapPointToConcentricRuler(ellipse, { x: 64, y: 0 });
    expect(result.ringIndex).toBe(0);
    closeTo(result.point.x, 60);
    closeTo(result.point.y, 0);
  });
});

describe("snapPointToRadialRuler (방사선·집중선 특수 자)", () => {
  it("중심 여백(innerDeadZoneRadius) 안쪽을 침범하지 않고 방사선에 투영한다", () => {
    const radial = createStudioRadialRuler({
      id: "rad-1",
      centerX: 100,
      centerY: 100,
      innerDeadZoneRadius: 40,
    });
    const first = snapStudioRulerPoint(radial, { x: 200, y: 100 }, null);
    expect(first.snapped).toBe(true);
    expect(first.state?.kind).toBe("radial");
    closeTo(first.point.x, 200);
    closeTo(first.point.y, 100);

    // 중심 가까이(x=110)로 끌어도 innerDeadZoneRadius(40) 경계인 x=140에서 멈춘다
    const inside = snapStudioRulerPoint(radial, { x: 110, y: 125 }, first.state);
    closeTo(inside.point.x, 140);
    closeTo(inside.point.y, 100);
  });

  it("radialSpokeCount가 지정되면 등각 스포크 각도로 양자화한다", () => {
    const spokeRuler = createStudioRadialRuler({
      centerX: 0,
      centerY: 0,
      radialSpokeCount: 4, // 90도 간격 (0, 90, 180, -90)
    });
    // 약 11도 위치의 점 (100, 20) → 0도 스포크로 양자화
    const res = snapPointToRadialRuler(spokeRuler, { x: 100, y: 20 });
    closeTo(res.angleRad, 0);
    closeTo(res.point.y, 0);
    expect(res.point.x).toBeGreaterThan(100);
  });
});

describe("createStudioParallelLineRuler (CSP 평행선 특수 자)", () => {
  it("캔버스 어디서 시작하든 자 각도와 평행한 직선에 세션을 잠근다", () => {
    const parallel = createStudioParallelLineRuler({
      id: "par-1",
      origin: { x: 0, y: 0 },
      angleDeg: 0, // 수평 평행선
    });
    // y=75에서 시작하면 y=75 수평선에 잠긴다
    const s1 = snapStudioRulerPoint(parallel, { x: 30, y: 75 }, null);
    expect(s1.snapped).toBe(true);
    expect(s1.state?.kind).toBe("parallel");
    closeTo(s1.point.y, 75);

    const s2 = snapStudioRulerPoint(parallel, { x: 140, y: 92 }, s1.state);
    closeTo(s2.point.x, 140);
    closeTo(s2.point.y, 75);
  });

  it("parallelSpacingPx가 있으면 수직 간격 격자에 맞춰 시작선을 양자화한다", () => {
    const parallelGrid = createStudioParallelLineRuler({
      id: "par-grid",
      origin: { x: 0, y: 0 },
      angleDeg: 0,
      parallelSpacingPx: 20,
    });
    // y=27에서 시작 → 가장 가까운 20px 배수인 y=20 평행선에 스냅
    const s1 = snapStudioRulerPoint(parallelGrid, { x: 15, y: 27 }, null);
    closeTo(s1.point.x, 15);
    closeTo(s1.point.y, 20);
  });
});

describe("snapStudioPerspectivePoint", () => {
  const ruler = createStudioPerspectiveRuler({
    id: "persp-1",
    vanishingPoints: [
      { x: 0, y: 0 },
      { x: 320, y: 0 },
    ],
  }) as StudioPerspectiveRuler;

  it("스트로크 시작점에서는 가이드를 확정하지 않는다", () => {
    const session = beginStudioPerspectiveSnapSession(ruler, { x: 100, y: 100 });
    const result = snapStudioPerspectivePoint(ruler, session, { x: 100, y: 100 });
    expect(result.session.guideVanishingPointIndex).toBe(-1);
    expect(result.snapped).toBe(false);
  });

  it("진행 방향과 맞는 소실점의 가이드를 확정한다", () => {
    const session = beginStudioPerspectiveSnapSession(ruler, { x: 100, y: 100 });
    const result = snapStudioPerspectivePoint(ruler, session, { x: 120, y: 118 });
    expect(result.session.guideVanishingPointIndex).toBe(0);
    expect(result.snapped).toBe(true);
  });

  it("확정된 가이드는 소실점→시작점 직선에 투영한다", () => {
    const session = beginStudioPerspectiveSnapSession(ruler, { x: 100, y: 100 });
    const locked = snapStudioPerspectivePoint(ruler, session, { x: 120, y: 118 });
    const next = snapStudioPerspectivePoint(ruler, locked.session, { x: 150, y: 130 });
    closeTo(next.point.y, next.point.x);
    expect(next.snapped).toBe(true);
  });

  it("소실점이 없으면 스냅하지 않는다", () => {
    const broken = { ...ruler, vanishingPoints: [] };
    const session = beginStudioPerspectiveSnapSession(broken, { x: 10, y: 10 });
    const result = snapStudioPerspectivePoint(broken, session, { x: 50, y: 60 });
    expect(result.snapped).toBe(false);
    expect(result.point).toEqual({ x: 50, y: 60 });
  });
});

describe("snapStudioRulerPoint", () => {
  it("visible=false이면 스냅하지 않는다", () => {
    const ruler = createStudioLineRuler({ visible: false });
    const result = snapStudioRulerPoint(ruler, { x: 5, y: 5 });
    expect(result.snapped).toBe(false);
    expect(result.point).toEqual({ x: 5, y: 5 });
  });

  it("snapEnabled=false이면 자는 보이지만 스냅하지 않는다", () => {
    const ruler = createStudioLineRuler({
      snapEnabled: false,
      p0: { x: 0, y: 0 },
      p1: { x: 100, y: 0 },
    });
    const result = snapStudioRulerPoint(ruler, { x: 50, y: 9 });
    expect(result.snapped).toBe(false);
    expect(result.point).toEqual({ x: 50, y: 9 });
  });

  it("직선 자에 스냅한다", () => {
    const ruler = createStudioLineRuler({
      p0: { x: 0, y: 0 },
      p1: { x: 100, y: 0 },
    });
    const result = snapStudioRulerPoint(ruler, { x: 40, y: 7 });
    expect(result.snapped).toBe(true);
    closeTo(result.point.x, 40);
    closeTo(result.point.y, 0);
  });

  it("maxSnapDistancePx보다 먼 점은 자석 스냅을 건너뛰고 자유 드로잉을 유지한다", () => {
    const ruler = createStudioLineRuler({
      p0: { x: 0, y: 0 },
      p1: { x: 100, y: 0 },
      maxSnapDistancePx: 15,
    });
    const near = snapStudioRulerPoint(ruler, { x: 40, y: 10 });
    expect(near.snapped).toBe(true);
    closeTo(near.point.y, 0);

    const far = snapStudioRulerPoint(ruler, { x: 40, y: 30 });
    expect(far.snapped).toBe(false);
    expect(far.point).toEqual({ x: 40, y: 30 });
  });

  it("곡선 자에 스냅한다", () => {
    const ruler = createStudioCurveRuler({
      degree: 2,
      p0: { x: 0, y: 0 },
      p1: { x: 50, y: 0 },
      p2: { x: 100, y: 0 },
    });
    const result = snapStudioRulerPoint(ruler, { x: 30, y: 12 });
    expect(result.snapped).toBe(true);
    closeTo(result.point.y, 0);
  });

  it("동심원 자에 스냅한다", () => {
    const ruler = createStudioConcentricRuler({
      centerX: 100,
      centerY: 100,
      baseRadius: 20,
      ringSpacing: 20,
      ringCount: 3,
    });
    const result = snapStudioRulerPoint(ruler, { x: 100, y: 138 });
    expect(result.snapped).toBe(true);
    closeTo(result.point.x, 100);
    closeTo(result.point.y, 140);
  });

  it("퍼스펙티브 자는 세션을 이어받는다", () => {
    const ruler = createStudioPerspectiveRuler({
      id: "p-1",
      vanishingPoints: [{ x: 0, y: 0 }],
    }) as StudioPerspectiveRuler;
    const first = snapStudioRulerPoint(ruler, { x: 100, y: 100 }, null);
    expect(first.state?.kind).toBe("perspective");
    const second = snapStudioRulerPoint(ruler, { x: 130, y: 125 }, first.state);
    expect(second.snapped).toBe(true);
    closeTo(second.point.y, second.point.x);
  });

  it("다른 자의 세션이 섞이지 않는다", () => {
    const rulerA = createStudioPerspectiveRuler({
      id: "p-a",
      vanishingPoints: [{ x: 0, y: 0 }],
    }) as StudioPerspectiveRuler;
    const rulerB = createStudioPerspectiveRuler({
      id: "p-b",
      vanishingPoints: [{ x: 320, y: 0 }],
    }) as StudioPerspectiveRuler;
    const fromA = snapStudioRulerPoint(rulerA, { x: 100, y: 100 }, null);
    const onB = snapStudioRulerPoint(rulerB, { x: 100, y: 100 }, fromA.state);
    expect(onB.state?.kind).toBe("perspective");
    if (onB.state?.kind === "perspective") {
      expect(onB.state.session.rulerId).toBe("p-b");
    }
  });

  it("퇴화 직선 자(두 점 겹침)는 스냅하지 않는다", () => {
    const ruler = createStudioLineRuler({
      p0: { x: 5, y: 5 },
      p1: { x: 5, y: 5 },
    });
    const result = snapStudioRulerPoint(ruler, { x: 10, y: 20 });
    expect(result.snapped).toBe(false);
  });
});

describe("createStudioPerspectiveRuler", () => {
  it("소실점이 1–3개가 아니면 null을 반환한다", () => {
    expect(createStudioPerspectiveRuler({ vanishingPoints: [] })).toBe(null);
    expect(
      createStudioPerspectiveRuler({
        vanishingPoints: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 3, y: 3 },
        ],
      }),
    ).toBe(null);
    expect(
      createStudioPerspectiveRuler({ vanishingPoints: [{ x: 0, y: NaN }] }),
    ).toBe(null);
  });

  it("1–3점은 정상 생성한다", () => {
    const one = createStudioPerspectiveRuler({
      vanishingPoints: [{ x: 160, y: 60 }],
    });
    expect(one?.vanishingPoints.length).toBe(1);
  });
});

describe("createStudioConcentricRuler", () => {
  it("범위를 정규화한다", () => {
    const ruler = createStudioConcentricRuler({
      ringSpacing: 0,
      ringCount: 999,
      ellipseX: -2,
    });
    expect(ruler.ringSpacing).toBe(1);
    expect(ruler.ringCount).toBe(64);
    expect(ruler.ellipseX).toBe(1);
  });
});

describe("STUDIO_RULERS_MAX_PER_CANVAS", () => {
  it("상한이 정의되어 있다", () => {
    expect(STUDIO_RULERS_MAX_PER_CANVAS).toBe(12);
  });
});
