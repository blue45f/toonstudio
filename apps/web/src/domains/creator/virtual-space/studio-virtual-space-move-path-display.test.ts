import { describe, expect, it } from "vitest";

import {
  buildMovePathDisplay,
  movePathDotPhase,
  movePathFadeProgress,
  movePathMarkerPulse,
  movePathRippleProgress,
  sampleRouteDots,
  simplifyMovePath,
  STUDIO_MOVE_PATH_ARRIVAL_DISTANCE,
  STUDIO_ROUTE_DOT_EMERGE_DISTANCE,
  STUDIO_ROUTE_DOT_FLOW_SPEED,
  STUDIO_ROUTE_DOT_MARKER_CLEARANCE,
  STUDIO_ROUTE_FADE_MS,
  STUDIO_ROUTE_RIPPLE_MS,
} from "./studio-virtual-space-move-path-display";

describe("simplifyMovePath", () => {
  it("짧은 경로는 그대로 둔다", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    expect(simplifyMovePath(points, 32)).toEqual(points);
  });

  it("긴 경로는 시작·끝점을 유지하며 솎아낸다", () => {
    const points = Array.from({ length: 101 }, (_, i) => ({ x: i * 10, y: 0 }));
    const simplified = simplifyMovePath(points, 11);
    expect(simplified).toHaveLength(11);
    expect(simplified[0]).toEqual({ x: 0, y: 0 });
    expect(simplified[10]).toEqual({ x: 1000, y: 0 });
  });
});

describe("movePathMarkerPulse", () => {
  it("사인파 펄스로 0~1 사이", () => {
    const pulse = movePathMarkerPulse(300, 0, false);
    expect(pulse).toBeGreaterThanOrEqual(0);
    expect(pulse).toBeLessThanOrEqual(1);
    expect(movePathMarkerPulse(0, 0, false)).toBeCloseTo(0.5, 5);
  });

  it("reducedMotion이면 고정값", () => {
    expect(movePathMarkerPulse(123456, 0, true)).toBe(0.5);
  });
});

describe("buildMovePathDisplay", () => {
  it("이동 중이면 폴리라인과 마커를 만든다", () => {
    const display = buildMovePathDisplay({
      current: { x: 0, y: 0 },
      path: [{ x: 50, y: 0 }, { x: 100, y: 0 }],
      destination: { x: 100, y: 0 },
      moving: true,
      now: 1000,
      markerStartedAt: 800,
      reducedMotion: false,
    });
    expect(display.visible).toBe(true);
    expect(display.polyline[0]).toEqual({ x: 0, y: 0 });
    expect(display.marker?.point).toEqual({ x: 100, y: 0 });
    expect(display.remainingDistance).toBeCloseTo(100, 1);
  });

  it("목적지가 없으면 숨긴다", () => {
    const display = buildMovePathDisplay({
      current: { x: 0, y: 0 }, path: [], destination: null, moving: false,
      now: 1000, markerStartedAt: 800, reducedMotion: false,
    });
    expect(display.visible).toBe(false);
  });

  it("도착(근접 + 정지)하면 숨긴다", () => {
    const display = buildMovePathDisplay({
      current: { x: 100 + STUDIO_MOVE_PATH_ARRIVAL_DISTANCE / 2, y: 0 },
      path: [],
      destination: { x: 100, y: 0 },
      moving: false,
      now: 1000, markerStartedAt: 800, reducedMotion: false,
    });
    expect(display.visible).toBe(false);
  });

  it("경로 끝이 목적지와 다르면 목적지를 이어 붙인다", () => {
    const display = buildMovePathDisplay({
      current: { x: 0, y: 0 },
      path: [{ x: 50, y: 0 }],
      destination: { x: 90, y: 20 },
      moving: true,
      now: 1000, markerStartedAt: 800, reducedMotion: false,
    });
    const last = display.polyline[display.polyline.length - 1]!;
    expect(last).toEqual({ x: 90, y: 20 });
  });
});

describe("sampleRouteDots", () => {
  const straight = [{ x: 0, y: 0 }, { x: 200, y: 0 }];

  it("경로를 일정 간격으로 나누고 마커 직전은 비운다", () => {
    const dots = sampleRouteDots(straight, { spacing: 20, phase: 0 });
    expect(dots.map((dot) => dot.x)).toEqual([0, 20, 40, 60, 80, 100, 120, 140, 160, 180]);
    // 마지막 점과 목적지 사이는 마커가 들어갈 만큼 비어 있다.
    expect(200 - dots.at(-1)!.x).toBeGreaterThanOrEqual(STUDIO_ROUTE_DOT_MARKER_CLEARANCE);
  });

  it("발밑 근처 점은 옅고 멀어질수록 진해져 캐릭터 몸에 점이 겹쳐 보이지 않는다", () => {
    const dots = sampleRouteDots(straight, { spacing: 20, phase: 0 });
    expect(dots[0]!.alpha).toBe(0);
    expect(dots[1]!.alpha).toBeCloseTo(20 / STUDIO_ROUTE_DOT_EMERGE_DISTANCE, 5);
    expect(dots[3]!.alpha).toBe(1);
    for (let i = 1; i < dots.length; i += 1) expect(dots[i]!.alpha).toBeGreaterThanOrEqual(dots[i - 1]!.alpha);
  });

  it("위상을 키우면 점이 목적지 쪽으로 흐르고, 간격만큼 가면 같은 배치로 돌아온다", () => {
    const base = sampleRouteDots(straight, { spacing: 20, phase: 0 }).map((dot) => dot.x);
    const shifted = sampleRouteDots(straight, { spacing: 20, phase: 7 }).map((dot) => dot.x);
    expect(shifted[0]).toBeCloseTo(7, 9);
    expect(shifted[1]! - base[1]!).toBeCloseTo(7, 9);
    const sameAs = (xs: readonly number[]) => xs.forEach((x, i) => expect(x).toBeCloseTo(shifted[i]!, 9));
    sameAs(sampleRouteDots(straight, { spacing: 20, phase: 27 }).map((dot) => dot.x));
    sameAs(sampleRouteDots(straight, { spacing: 20, phase: -13 }).map((dot) => dot.x));
  });

  it("꺾이는 경로에서도 호 길이 기준으로 같은 간격을 유지한다", () => {
    const bent = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const dots = sampleRouteDots(bent, { spacing: 25, phase: 0 });
    expect(dots.slice(0, 5).map((dot) => [dot.x, dot.y])).toEqual([[0, 0], [25, 0], [50, 0], [75, 0], [100, 0]]);
    expect(dots[5]).toMatchObject({ x: 100, y: 25 });
    expect(dots[7]).toMatchObject({ x: 100, y: 75 });
  });

  it("점 개수 상한을 지키고, 너무 짧거나 잘못된 입력은 빈 배열이다", () => {
    expect(sampleRouteDots([{ x: 0, y: 0 }, { x: 10_000, y: 0 }], { spacing: 10, maxDots: 12 })).toHaveLength(12);
    expect(sampleRouteDots([{ x: 0, y: 0 }, { x: STUDIO_ROUTE_DOT_MARKER_CLEARANCE - 1, y: 0 }])).toEqual([]);
    expect(sampleRouteDots([{ x: 0, y: 0 }])).toEqual([]);
    expect(sampleRouteDots([])).toEqual([]);
    expect(sampleRouteDots([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }])).toEqual([]);
    expect(sampleRouteDots(straight, { phase: Number.NaN, spacing: Number.NaN }).length).toBeGreaterThan(0);
  });
});

describe("movePathDotPhase", () => {
  it("시간에 비례해 흐르고 모션 줄이기에서는 멈춘다", () => {
    expect(movePathDotPhase(1000, false)).toBeCloseTo(STUDIO_ROUTE_DOT_FLOW_SPEED, 5);
    expect(movePathDotPhase(2500, false)).toBeCloseTo(STUDIO_ROUTE_DOT_FLOW_SPEED * 2.5, 5);
    expect(movePathDotPhase(2500, true)).toBe(0);
    expect(movePathDotPhase(Number.NaN, false)).toBe(0);
  });
});

describe("movePathRippleProgress / movePathFadeProgress", () => {
  it("클릭 파문은 0에서 시작해 정해진 시간 뒤 끝난다", () => {
    expect(movePathRippleProgress(1000, 1000, false)).toBe(0);
    expect(movePathRippleProgress(1000 + STUDIO_ROUTE_RIPPLE_MS / 2, 1000, false)).toBeCloseTo(0.5, 5);
    expect(movePathRippleProgress(1000 + STUDIO_ROUTE_RIPPLE_MS, 1000, false)).toBeNull();
    expect(movePathRippleProgress(900, 1000, false)).toBeNull();
    expect(movePathRippleProgress(1100, 1000, true)).toBeNull();
    expect(movePathRippleProgress(Number.NaN, 1000, false)).toBeNull();
  });

  it("도착 페이드는 시작 시각이 있을 때만 진행되고 모션 줄이기에서는 즉시 끝난다", () => {
    expect(movePathFadeProgress(500, null, false)).toBeNull();
    expect(movePathFadeProgress(500, 500, false)).toBe(0);
    expect(movePathFadeProgress(500 + STUDIO_ROUTE_FADE_MS / 4, 500, false)).toBeCloseTo(0.25, 5);
    expect(movePathFadeProgress(500 + STUDIO_ROUTE_FADE_MS, 500, false)).toBeNull();
    expect(movePathFadeProgress(600, 500, true)).toBeNull();
  });
});
