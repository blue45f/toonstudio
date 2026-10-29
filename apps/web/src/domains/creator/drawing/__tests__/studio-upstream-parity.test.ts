/**
 * 자체 구현 커널을 설치된 업스트림 패키지와 같은 입력으로 나란히 실행해 수치를 대조한다.
 *
 * - 오라클은 이 저장소가 이미 프로덕션 의존성으로 두고 있는 fit-curve 0.2.0, perfect-freehand 1.2.3,
 *   simplify-js 1.2.4, rbush 4.0.1, roughjs 4.6.6이다. 기대값을 손으로 적지 않고 매번 업스트림을 실행한다.
 * - 입력은 시드 고정 난수와 손으로 고른 경계 사례다. 불일치는 허용오차로 덮지 않는다. 좌표는 `===`로 비교한다.
 * - 말뭉치가 퇴화하지 않았는지 보는 커버리지 단언이 있다(예: 점 2개짜리 스트로크가 실제로 들어 있는가).
 *   결함을 일부러 넣어 이 대조가 잡아내는지 확인한 결과는 docs/design/upstream-parity-kernels-2026-10-29.md에 있다.
 */
import fitCurve from "fit-curve";
import { getStroke, getStrokePoints, type StrokeOptions } from "perfect-freehand";
import RBush from "rbush";
import type { Op, ResolvedOptions } from "roughjs/bin/core";
import { RoughGenerator } from "roughjs/bin/generator";
import { Random } from "roughjs/bin/math";
import { patternFillPolygons, solidFillPolygon } from "roughjs/bin/renderer";
import simplify from "simplify-js";
import { describe, expect, it } from "vitest";

import { fitSchneiderCubicBezierSpline, SCHNEIDER_FIT_MAX_INPUT_POINTS } from "../studio-bezier-curve-fit-brushes";
import { fitCurveSchneider, type FitCurveSegment } from "../studio-fit-curve-schneider";
import {
  FREEHAND_ROUGH_BRUSH_PRESETS,
  RoughLehmerPrng,
  queryStrokeSpatialRTreeBBox,
  simplifyStrokePolylineRdp,
  synthesizePerfectFreehandStrokeOutline,
  synthesizeRoughSketchyStrokeAndHachureFill,
} from "../studio-freehand-rough-spatial-brushes";
import {
  getPerfectFreehandOutlinePoints,
  getPerfectFreehandStroke,
  getPerfectFreehandStrokePoints,
} from "../studio-perfect-freehand-stroke";
import {
  ROUGH_SKETCH_DEFAULT_OPTIONS,
  roughSketchFillPolygon,
  roughSketchLine,
  roughSketchLinearPath,
  type RoughSketchFillStyle,
  type RoughSketchOpSet,
  type RoughSketchOptions,
} from "../studio-rough-sketch-renderer";

type XY = [number, number];

/** mulberry32. 연속된 시드에서도 첫 출력이 고르게 퍼진다(선형 합동 난수는 그렇지 않아 말뭉치가 치우친다). */
function seeded(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const same = (a: number, b: number): boolean => a === b || (Number.isNaN(a) && Number.isNaN(b));

function firstDifference(a: readonly number[], b: readonly number[]): string | null {
  if (a.length !== b.length) return `길이 ${a.length} != ${b.length}`;
  for (let i = 0; i < a.length; i += 1) if (!same(a[i]!, b[i]!)) return `[${i}] ${a[i]} != ${b[i]}`;
  return null;
}

// ---------------------------------------------------------------------------
// fit-curve 0.2.0
// ---------------------------------------------------------------------------

interface NamedPoints {
  readonly name: string;
  readonly points: XY[];
}

function fitCurveCorpus(): { readonly named: NamedPoints[]; readonly random: NamedPoints[]; readonly tiny: NamedPoints[] } {
  const named: NamedPoints[] = [
    { name: "line", points: Array.from({ length: 8 }, (_, i): XY => [i * 10, i * 5]) },
    { name: "sine", points: Array.from({ length: 60 }, (_, i): XY => [i * 4, 40 * Math.sin(i / 6)]) },
    { name: "arc", points: Array.from({ length: 40 }, (_, i): XY => [100 * Math.cos(i / 12), 100 * Math.sin(i / 12)]) },
    { name: "zigzag", points: Array.from({ length: 30 }, (_, i): XY => [i * 8, (i % 2) * 30]) },
    { name: "readme", points: [[0, 0], [10, 10], [10, 0], [20, 0]] },
    { name: "scurve", points: Array.from({ length: 50 }, (_, i): XY => [i * 5, 60 / (1 + Math.exp(-(i - 25) / 4))]) },
    { name: "spiral", points: Array.from({ length: 120 }, (_, i): XY => [(5 + i * 0.8) * Math.cos(i / 8), (5 + i * 0.8) * Math.sin(i / 8)]) },
    { name: "closedCircle", points: Array.from({ length: 33 }, (_, i): XY => (i === 32 ? [50, 0] : [50 * Math.cos((i / 32) * Math.PI * 2), 50 * Math.sin((i / 32) * Math.PI * 2)])) },
    { name: "closedSquare", points: [[0, 0], [10, 0], [20, 0], [20, 10], [20, 20], [10, 20], [0, 20], [0, 10], [0, 0]] },
    { name: "huge", points: Array.from({ length: 40 }, (_, i): XY => [i * 1e6, 3e6 * Math.sin(i / 5)]) },
    { name: "tiny", points: Array.from({ length: 40 }, (_, i): XY => [i * 1e-6, 3e-6 * Math.sin(i / 5)]) },
    { name: "vertical", points: Array.from({ length: 12 }, (_, i): XY => [3, i * 7]) },
    { name: "backtrack", points: [[0, 0], [10, 0], [20, 0], [10, 0.0001], [0, 0.0002], [-10, 0]] },
    { name: "spike", points: [[0, 0], [10, 1], [20, -1], [30, 100], [40, 0], [50, 1]] },
    { name: "cusp", points: [[0, 0], [10, 10], [20, 20], [10, 10.0001], [0, 0.0002]] },
    { name: "two", points: [[0, 0], [5, 5]] },
    { name: "three", points: [[0, 0], [5, 9], [10, 0]] },
    { name: "collinear3", points: [[0, 0], [5, 5], [10, 10]] },
    { name: "dupsInside", points: [[0, 0], [0, 0], [3, 4], [3, 4], [3, 4], [9, 1], [9, 1]] },
  ];
  const random: NamedPoints[] = [];
  for (let k = 0; k < 24; k += 1) {
    const r = seeded(1000 + k);
    const n = 5 + Math.floor(r() * 120);
    let x = 0;
    let y = 0;
    random.push({
      name: `walk${k}`,
      points: Array.from({ length: n }, (): XY => {
        x += (r() - 0.35) * 12;
        y += (r() - 0.5) * 12;
        return [x, y];
      }),
    });
    const r2 = seeded(5000 + k);
    const m = 8 + Math.floor(r2() * 90);
    random.push({
      name: `noisy${k}`,
      points: Array.from({ length: m }, (_, i): XY => [i * 3 + (r2() - 0.5) * 3, 30 * Math.sin(i / (6 + (k % 7))) + (r2() - 0.5) * 3]),
    });
  }
  const tiny: NamedPoints[] = [];
  for (let k = 0; k < 120; k += 1) {
    const r = seeded(90000 + k);
    const n = 3 + Math.floor(r() * 7);
    tiny.push({ name: `lattice${k}`, points: Array.from({ length: n }, (): XY => [Math.round(r() * 20), Math.round(r() * 20)]) });
  }
  return { named, random, tiny };
}

function diffFit(
  upstream: readonly number[][][],
  mine: readonly FitCurveSegment[],
  label: string,
  out: string[],
): void {
  if (upstream.length !== mine.length) {
    out.push(`${label}: 세그먼트 ${upstream.length} != ${mine.length}`);
    return;
  }
  for (let i = 0; i < upstream.length; i += 1) {
    const m = mine[i]!;
    const flat = [m.p0.x, m.p0.y, m.ctrl1.x, m.ctrl1.y, m.ctrl2.x, m.ctrl2.y, m.p3.x, m.p3.y];
    const diff = firstDifference(upstream[i]!.flat(), flat);
    if (diff) {
      out.push(`${label}: 세그먼트 ${i} ${diff}`);
      return;
    }
  }
}

describe("fit-curve 0.2.0 대조", () => {
  const corpus = fitCurveCorpus();

  it("fitCurveSchneider가 같은 점열에서 세그먼트 수와 제어점을 비트 단위로 맞춘다", () => {
    const mismatches: string[] = [];
    let cases = 0;
    let multiSegment = 0;
    const groups: [readonly NamedPoints[], readonly number[]][] = [
      [corpus.named, [0.5, 1, 2, 4, 8, 20]],
      [corpus.random, [0.5, 1, 2, 4, 8, 20]],
      [corpus.tiny, [0.25, 1, 4, 16]],
    ];
    for (const [items, tolerances] of groups) {
      for (const item of items) {
        for (const tol of tolerances) {
          const upstream = fitCurve(item.points.map((p) => [...p]), tol * tol);
          const mine = fitCurveSchneider(item.points.map(([x, y]) => ({ x, y })), tol * tol);
          cases += 1;
          if (upstream.length > 1) multiSegment += 1;
          diffFit(upstream, mine, `${item.name} tol=${tol}`, mismatches);
        }
      }
    }
    expect(mismatches).toEqual([]);
    // 말뭉치가 한 세그먼트짜리 쉬운 입력으로만 차 있지 않다.
    expect(cases).toBe(882);
    expect(multiSegment).toBeGreaterThan(300);
  }, 60_000);

  it("허용오차가 다르면 결과도 달라진다(대조가 허용오차를 실제로 보고 있다)", () => {
    const item = corpus.named.find((c) => c.name === "sine")!;
    const upstream = fitCurve(item.points.map((p) => [...p]), 2 * 2);
    const mismatches: string[] = [];
    diffFit(upstream, fitCurveSchneider(item.points.map(([x, y]) => ({ x, y })), 8 * 8), "sine", mismatches);
    expect(mismatches.length).toBeGreaterThan(0);
  });

  it("fitSchneiderCubicBezierSpline은 px 허용오차를 제곱해 fit-curve와 같은 세그먼트를 낸다", () => {
    const mismatches: string[] = [];
    for (const item of [...corpus.named.slice(0, 8), ...corpus.random.slice(0, 12)]) {
      for (const tolPx of [1, 2.5, 4]) {
        const pts = item.points.map(([x, y]) => ({ x, y }));
        const wrapped = fitSchneiderCubicBezierSpline(pts, tolPx);
        diffFit(fitCurve(item.points.map((p) => [...p]), tolPx * tolPx), wrapped.segments, `${item.name} px=${tolPx}`, mismatches);
      }
    }
    expect(mismatches).toEqual([]);
  }, 60_000);

  it("래퍼는 유한하지 않은 점과 1e-4px 이내 중복을 버리고 압력 필드를 끝점에 남긴다", () => {
    const fitted = fitSchneiderCubicBezierSpline(
      [
        { x: 0, y: 0, pressure01: 0.3 },
        { x: Number.NaN, y: 4 },
        { x: 0.00001, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 0, pressure01: 0.9 },
      ],
      1,
    );
    const direct = fitCurve([[0, 0], [10, 10], [20, 0]], 1);
    expect(fitted.segments).toHaveLength(direct.length);
    expect(fitted.segments[0]!.p0.pressure01).toBe(0.3);
    expect(fitted.segments[fitted.segments.length - 1]!.p3.pressure01).toBe(0.9);
    expect(fitted.svgPathData.startsWith("M 0.00 0.00 C ")).toBe(true);
  });

  it("점이 상한을 넘으면 처음과 끝을 지키며 솎고, 깊게 쪼개져도 호출 스택이 넘치지 않는다", () => {
    const n = SCHNEIDER_FIT_MAX_INPUT_POINTS + 904;
    const zigzag = Array.from({ length: n }, (_, i) => ({ x: i, y: (i % 2) * 40 }));
    const fitted = fitSchneiderCubicBezierSpline(zigzag, 0.5);
    expect(fitted.segments.length).toBeGreaterThan(1000);
    expect(fitted.segments[0]!.p0).toEqual(zigzag[0]);
    expect(fitted.segments[fitted.segments.length - 1]!.p3).toEqual(zigzag[n - 1]);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// perfect-freehand 1.2.3
// ---------------------------------------------------------------------------

type PfInput = { x: number; y: number; pressure?: number } | number[];

interface PfCase {
  readonly stroke: PfInput[];
  readonly options: StrokeOptions;
}

function perfectFreehandCorpus(): PfCase[] {
  const strokes: PfInput[][] = [];
  for (let k = 0; k < 300; k += 1) {
    const r = seeded(777 + k);
    const n = k % 5 === 0 ? 1 + Math.floor(r() * 4) : 1 + Math.floor(r() * 140);
    let x = r() * 200;
    let y = r() * 200;
    const style = Math.floor(r() * 4);
    const stroke: { x: number; y: number; pressure?: number }[] = [];
    for (let i = 0; i < n; i += 1) {
      if (style === 0) {
        x += (r() - 0.4) * 14;
        y += (r() - 0.5) * 14;
      } else if (style === 1) {
        x = 100 + 80 * Math.cos(i / 9) + (r() - 0.5);
        y = 100 + 80 * Math.sin(i / 9) + (r() - 0.5);
      } else if (style === 2) {
        x += 6;
        y = 100 + 30 * Math.sin(i / 7);
      } else {
        x += (r() < 0.2 ? -1 : 1) * r() * 25;
        y += (r() - 0.5) * 25;
      }
      stroke.push(r() < 0.3 ? { x, y } : { x, y, pressure: r() });
    }
    strokes.push(k % 3 === 0 ? stroke.map((p) => (p.pressure === undefined ? [p.x, p.y] : [p.x, p.y, p.pressure])) : stroke);
  }
  // 아래 경계 사례는 모든 옵션 조합으로 돌린다. 계단형(정수 좌표·직각 꺾임)은 streamline 0에서 연속한
  // 진행 방향의 내적이 정확히 0이 되어 급커브 판정의 경계(< 와 <=)를 가른다.
  const edgeStrokes: PfInput[][] = [
    [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }, { x: 0, y: 80 }, { x: 40, y: 80 }],
    Array.from({ length: 30 }, (_, i) => ({ x: Math.floor(i / 2) * 10 + (i % 2 === 1 ? 10 : 0), y: Math.floor((i + 1) / 2) * 10, pressure: 0.5 })),
    [{ x: 5, y: 5 }],
    [[5, 5]],
    [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    [[0, 0], [10, 3]],
    [{ x: 0, y: 0 }, { x: 100, y: 40 }],
    [{ x: 0, y: 0 }, { x: 30, y: 10 }, { x: 60, y: 0 }],
    [{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }, { x: 40, y: 1 }],
    [{ x: 7, y: 7 }, { x: 7, y: 7 }],
    [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 0, y: 1 }, { x: 50, y: 2 }],
    [],
  ];
  const optionPool: StrokeOptions[] = [
    {},
    { size: 8, thinning: 0.7, smoothing: 0.5, streamline: 0.5 },
    { size: 24, thinning: -0.4, streamline: 0.3, simulatePressure: false },
    { size: 14, thinning: 0, smoothing: 0.2, streamline: 0.8 },
    { size: 18, thinning: 0.6, start: { taper: 20, cap: false }, end: { taper: true } },
    { size: 12, start: { taper: true }, end: { taper: 30, cap: false }, last: true },
    { size: 10, start: { cap: false }, end: { cap: false }, last: true },
    { size: 16, easing: (t) => t * t, simulatePressure: true, last: true },
    { size: 20, thinning: 0.9, start: { taper: 8, easing: (t) => t }, end: { taper: 12, easing: (t) => 1 - (1 - t) * (1 - t) } },
    { size: 3, streamline: 0, smoothing: 0, last: true },
    { size: 2, streamline: 0, smoothing: 0.1, simulatePressure: false },
    { size: 0 },
  ];
  const cases: PfCase[] = strokes.map((stroke, index) => ({ stroke, options: optionPool[index % optionPool.length]! }));
  for (const stroke of edgeStrokes) for (const options of optionPool) cases.push({ stroke, options });
  return cases;
}

const copyInput = (stroke: readonly PfInput[]): PfInput[] => stroke.map((p) => (Array.isArray(p) ? [...p] : { ...p }));

describe("perfect-freehand 1.2.3 대조", () => {
  const corpus = perfectFreehandCorpus();

  it("스트로크 점과 윤곽 좌표가 모든 입력·옵션 조합에서 업스트림과 같다", () => {
    const mismatches: string[] = [];
    let cases = 0;
    const seen = { onePoint: 0, twoPoint: 0, sharpCorner: 0, taper: 0, flatCap: 0, last: 0, nonEmpty: 0 };
    corpus.forEach(({ stroke, options }, index) => {
      const upstreamPoints = getStrokePoints(copyInput(stroke), options);
      const minePoints = getPerfectFreehandStrokePoints(copyInput(stroke), options);
      const upstream = getStroke(copyInput(stroke), options);
      const mine = getPerfectFreehandStroke(copyInput(stroke), options);
      cases += 1;
      if (JSON.stringify(upstreamPoints) !== JSON.stringify(minePoints)) mismatches.push(`#${index} 스트로크 점 (n=${stroke.length}, ${JSON.stringify(options).slice(0, 50)})`);
      if (JSON.stringify(upstream) !== JSON.stringify(mine)) mismatches.push(`#${index} 윤곽 (n=${stroke.length}, ${JSON.stringify(options).slice(0, 50)})`);
      if (stroke.length === 1) seen.onePoint += 1;
      if (stroke.length === 2) seen.twoPoint += 1;
      if (upstreamPoints.some((p, i) => i > 0 && i < upstreamPoints.length - 1 && p.vector[0] * upstreamPoints[i + 1]!.vector[0] + p.vector[1] * upstreamPoints[i + 1]!.vector[1] < 0)) seen.sharpCorner += 1;
      if (options.start?.taper || options.end?.taper) seen.taper += 1;
      if (options.start?.cap === false || options.end?.cap === false) seen.flatCap += 1;
      if (options.last) seen.last += 1;
      if (upstream.length > 0) seen.nonEmpty += 1;
    });
    expect(mismatches).toEqual([]);
    expect(cases).toBe(corpus.length);
    // 말뭉치가 분기를 실제로 지난다.
    expect(seen.onePoint).toBeGreaterThan(8);
    expect(seen.twoPoint).toBeGreaterThan(8);
    expect(seen.sharpCorner).toBeGreaterThan(25);
    expect(seen.taper).toBeGreaterThan(60);
    expect(seen.flatCap).toBeGreaterThan(60);
    expect(seen.last).toBeGreaterThan(60);
    expect(seen.nonEmpty).toBeGreaterThan(250);
  }, 60_000);

  it("스트로크 점에서 윤곽을 만드는 두 번째 단계도 같은 결과를 낸다", () => {
    const mismatches: string[] = [];
    corpus.slice(0, 120).forEach(({ stroke, options }, index) => {
      const points = getStrokePoints(copyInput(stroke), options);
      const upstream = JSON.stringify(getStroke(copyInput(stroke), options));
      const mine = JSON.stringify(getPerfectFreehandOutlinePoints(points, options));
      if (upstream !== mine) mismatches.push(`#${index}`);
    });
    expect(mismatches).toEqual([]);
  });

  it("synthesizePerfectFreehandStrokeOutline은 프리셋 옵션으로 얻은 업스트림 윤곽 좌표를 그대로 돌려준다", () => {
    const sample = [
      { x: 10, y: 10, pressure01: 0.7 },
      { x: 40, y: 12, pressure01: 0.85 },
      { x: 25, y: 28, pressure01: 0.6 },
      { x: 75, y: 32, pressure01: 0.9 },
      { x: 110, y: 18, pressure01: 0.75 },
    ];
    for (const preset of FREEHAND_ROUGH_BRUSH_PRESETS) {
      const options: StrokeOptions = {
        size: preset.sizePx,
        thinning: preset.thinning,
        smoothing: preset.smoothing,
        streamline: preset.streamline,
        simulatePressure: preset.simulatePressure,
        start: { cap: preset.capStartRound, taper: preset.taperStartPx > 0 ? preset.taperStartPx : false },
        end: { cap: preset.capEndRound, taper: preset.taperEndPx > 0 ? preset.taperEndPx : false },
        last: true,
      };
      const upstream = getStroke(sample.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure01 })), options);
      const result = synthesizePerfectFreehandStrokeOutline({ presetId: preset.id, points: sample });
      expect(result.outlinePoints.map((p) => [p.x, p.y]), preset.id).toEqual(upstream);
      const lengthFromUpstream = getStrokePoints(sample.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure01 })), options);
      expect(result.totalLengthPx).toBe(Math.round(lengthFromUpstream[lengthFromUpstream.length - 1]!.runningLength * 100) / 100);
    }
  });
});

// ---------------------------------------------------------------------------
// simplify-js 1.2.4
// ---------------------------------------------------------------------------

describe("simplify-js 1.2.4 대조", () => {
  it("방사형 필터와 Douglas-Peucker 결과 점열이 모든 허용오차·품질 조합에서 같다", () => {
    const mismatches: string[] = [];
    let cases = 0;
    let reduced = 0;
    for (let k = 0; k < 160; k += 1) {
      const r = seeded(100 + k);
      const n = k < 6 ? k : Math.floor(r() * 220);
      let x = 0;
      let y = 0;
      const points = Array.from({ length: n }, () => {
        x += k % 7 === 0 ? Math.round((r() - 0.3) * 4) : (r() - 0.3) * 9;
        y += k % 7 === 0 ? Math.round((r() - 0.5) * 4) : (r() - 0.5) * 9;
        return { x, y };
      });
      for (const tolerance of [0.5, 1, 1.5, 3, 10]) {
        for (const highestQuality of [false, true]) {
          const upstream = simplify(points.map((p) => ({ ...p })), tolerance, highestQuality);
          const mine = simplifyStrokePolylineRdp(points.map((p) => ({ ...p })), tolerance, highestQuality);
          cases += 1;
          if (upstream.length < points.length) reduced += 1;
          if (JSON.stringify(upstream) !== JSON.stringify(mine)) mismatches.push(`k=${k} n=${n} tol=${tolerance} hq=${highestQuality}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
    expect(cases).toBe(1600);
    expect(reduced).toBeGreaterThan(900);
  });

  it("기본 허용오차는 업스트림(1px)과 다르게 1.5px이며 명시하면 같아진다", () => {
    const points = Array.from({ length: 80 }, (_, i) => ({ x: i * 2, y: Math.sin(i / 4) * 3 }));
    expect(simplifyStrokePolylineRdp(points)).toEqual(simplify(points.map((p) => ({ ...p })), 1.5));
    expect(simplifyStrokePolylineRdp(points, 1)).toEqual(simplify(points.map((p) => ({ ...p }))));
  });
});

// ---------------------------------------------------------------------------
// rbush 4.0.1
// ---------------------------------------------------------------------------

describe("rbush 4.0.1 대조", () => {
  it("겹침 질의의 결과 집합과 트리 높이가 같다(경계가 닿는 경우와 크기 0 상자 포함)", () => {
    const mismatches: string[] = [];
    let queries = 0;
    let nonEmptyHits = 0;
    let touchingOnly = 0;
    for (let k = 0; k < 300; k += 1) {
      const r = seeded(900 + k);
      const n = k < 12 ? [0, 1, 3, 4, 5, 9, 10, 50, 81, 82, 400, 1000][k]! : Math.floor(r() * 400);
      const items = Array.from({ length: n }, (_, i) => {
        const x = Math.round(r() * 500);
        const y = Math.round(r() * 500);
        const w = r() < 0.15 ? 0 : Math.round(r() * 60);
        const h = r() < 0.15 ? 0 : Math.round(r() * 60);
        return { id: `s${i}`, minX: x, minY: y, maxX: x + w, maxY: y + h };
      });
      const maxEntries = [4, 9, 16, 3, 2][k % 5]!;
      const tree = new RBush<(typeof items)[number]>(maxEntries);
      tree.load(items);
      for (let q = 0; q < 6; q += 1) {
        const qx = Math.round(r() * 500);
        const qy = Math.round(r() * 500);
        const box = { minX: qx, minY: qy, maxX: qx + Math.round(r() * 120), maxY: qy + Math.round(r() * 120) };
        const upstream = tree.search(box).map((item) => item.id).sort();
        const mine = queryStrokeSpatialRTreeBBox({ items, queryBox: box, maxEntries });
        queries += 1;
        if (upstream.length > 0) nonEmptyHits += 1;
        if (JSON.stringify(upstream) !== JSON.stringify([...mine.matchedIds].sort())) mismatches.push(`k=${k} q=${q}`);
        if (mine.collides !== tree.collides(box)) mismatches.push(`k=${k} q=${q} collides`);
        if (q === 0) {
          const height = (tree as unknown as { data: { height: number } }).data.height;
          if (mine.treeHeight !== height) mismatches.push(`k=${k} n=${n} maxEntries=${maxEntries} 높이 ${height} != ${mine.treeHeight}`);
        }
      }
      // 한 점에서만 닿는 상자도 겹침이다.
      const edgeItems = [{ id: "a", minX: 0, minY: 0, maxX: 10, maxY: 10 }];
      const touching = queryStrokeSpatialRTreeBBox({ items: edgeItems, queryBox: { minX: 10, minY: 10, maxX: 20, maxY: 20 } });
      if (touching.matchedIds.length === 1) touchingOnly += 1;
    }
    expect(mismatches).toEqual([]);
    expect(queries).toBe(1800);
    expect(nonEmptyHits).toBeGreaterThan(900);
    expect(touchingOnly).toBe(300);
  });

  it("matchedIds는 rbush 순회 순서가 아니라 minX, minY 순이다(R-트리를 만들지 않는다)", () => {
    const result = queryStrokeSpatialRTreeBBox({
      items: [
        { id: "late", minX: 30, minY: 0, maxX: 40, maxY: 10 },
        { id: "tie-b", minX: 5, minY: 8, maxX: 15, maxY: 18 },
        { id: "tie-a", minX: 5, minY: 2, maxX: 15, maxY: 12 },
      ],
      queryBox: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    });
    expect(result.matchedIds).toEqual(["tie-a", "tie-b", "late"]);
  });
});

// ---------------------------------------------------------------------------
// roughjs 4.6.6
// ---------------------------------------------------------------------------

const generator = new RoughGenerator();
const FILL_STYLES: RoughSketchFillStyle[] = ["hachure", "zigzag", "cross-hatch", "dashed", "zigzag-line", "solid"];

function sameOps(upstream: readonly Op[], mine: RoughSketchOpSet): string | null {
  if (upstream.length !== mine.ops.length) return `연산 수 ${upstream.length} != ${mine.ops.length}`;
  for (let i = 0; i < upstream.length; i += 1) {
    if (upstream[i]!.op !== mine.ops[i]!.op) return `연산 ${i} 종류 ${upstream[i]!.op} != ${mine.ops[i]!.op}`;
    const diff = firstDifference(upstream[i]!.data, mine.ops[i]!.data);
    if (diff) return `연산 ${i} ${diff}`;
  }
  return null;
}

describe("roughjs 4.6.6 대조", () => {
  it("RoughLehmerPrng가 Random과 시드 여러 개로 2만 번씩 같은 수열을 낸다", () => {
    for (const seed of [1, 2, 7, 65537, 48271, 123456789, 1073741824, 2147483646, 20261026]) {
      const upstream = new Random(seed);
      const mine = new RoughLehmerPrng(seed);
      for (let i = 0; i < 20_000; i += 1) {
        const expected = upstream.next();
        const actual = mine.next();
        if (expected !== actual) throw new Error(`seed=${seed} i=${i}: ${expected} != ${actual}`);
      }
    }
  });

  it("선 하나와 닫힌 다각형 외곽선·채움 6종의 연산 좌표가 같다", () => {
    const mismatches: string[] = [];
    const filled: Record<string, number> = {};
    let cases = 0;
    for (let k = 0; k < 360; k += 1) {
      const r = seeded(4242 + k);
      const n = 3 + Math.floor(r() * 9);
      const scale = [20, 60, 140, 300, 700][Math.floor(r() * 5)]!;
      const cx = r() * 200;
      const cy = r() * 200;
      const points: XY[] = Array.from({ length: n }, (_, i): XY => {
        const angle = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.5;
        const radius = scale * (0.4 + r() * 0.6);
        return [Math.round(cx + Math.cos(angle) * radius), Math.round(cy + Math.sin(angle) * radius)];
      });
      const seed = 1 + Math.floor(r() * 2147483000);
      const base = {
        seed,
        roughness: [0.5, 1, 1.5, 2.5][Math.floor(r() * 4)]!,
        bowing: [0, 1, 2][Math.floor(r() * 3)]!,
        maxRandomnessOffset: [2, 4][Math.floor(r() * 2)]!,
        hachureAngle: [-41, 0, 30, 90][Math.floor(r() * 4)]!,
        hachureGap: [-1, 4, 8.5][Math.floor(r() * 3)]!,
        strokeWidth: [1, 2][Math.floor(r() * 2)]!,
        disableMultiStroke: r() < 0.2,
        disableMultiStrokeFill: r() < 0.2,
        preserveVertices: r() < 0.2,
        dashOffset: r() < 0.5 ? -1 : 6,
        dashGap: r() < 0.5 ? -1 : 3,
        zigzagOffset: r() < 0.5 ? -1 : 5,
      };
      const style = FILL_STYLES[k % FILL_STYLES.length]!;
      const mineOptions: RoughSketchOptions = { ...ROUGH_SKETCH_DEFAULT_OPTIONS, ...base };
      const label = `k=${k} ${style} n=${n}`;

      const upstreamPolygon = generator.polygon(points.map((p) => [...p] as XY), { ...base, fill: "red", fillStyle: style });
      const prng = new RoughLehmerPrng(seed);
      const outline = roughSketchLinearPath(points, true, mineOptions, prng);
      const fill = roughSketchFillPolygon(points, style, mineOptions, prng);
      cases += 1;
      const fillDiff = sameOps(upstreamPolygon.sets[0]!.ops, fill);
      const outlineDiff = sameOps(upstreamPolygon.sets[1]!.ops, outline);
      if (upstreamPolygon.sets[0]!.type !== fill.type) mismatches.push(`${label}: 채움 종류`);
      if (fillDiff) mismatches.push(`${label}: 채움 ${fillDiff}`);
      if (outlineDiff) mismatches.push(`${label}: 외곽선 ${outlineDiff}`);
      if (fill.ops.length > 0) filled[style] = (filled[style] ?? 0) + 1;

      const upstreamLine = generator.line(points[0]![0], points[0]![1], points[1]![0], points[1]![1], { ...base });
      const lineDiff = sameOps(upstreamLine.sets[0]!.ops, roughSketchLine(points[0]![0], points[0]![1], points[1]![0], points[1]![1], mineOptions, new RoughLehmerPrng(seed)));
      if (lineDiff) mismatches.push(`${label}: 선 ${lineDiff}`);
    }
    expect(mismatches).toEqual([]);
    expect(cases).toBe(360);
    // 채움 6종 모두 빈 결과가 아닌 사례가 충분히 들어 있다.
    for (const style of FILL_STYLES) expect(filled[style] ?? 0, style).toBeGreaterThan(40);
  }, 60_000);

  it("synthesizeRoughSketchyStrokeAndHachureFill의 스트로크와 채움 곡선이 같은 난수열에서 업스트림과 같다", () => {
    const stroke = [
      { x: 10, y: 10 },
      { x: 40, y: 12 },
      { x: 25, y: 28 },
      { x: 75, y: 32 },
      { x: 110, y: 18 },
    ];
    const polygon: XY[] = [[120, 8], [158, 8], [158, 36], [120, 36]];
    for (const preset of FREEHAND_ROUGH_BRUSH_PRESETS) {
      if (preset.fillStyle === "dots") continue;
      const seed = 20261026;
      const randomizer = new Random(seed);
      const options = {
        ...generator.defaultOptions,
        seed,
        randomizer,
        roughness: preset.roughness,
        bowing: preset.bowing,
        hachureAngle: preset.hachureAngleDeg,
        hachureGap: preset.hachureGapPx,
        fillStyle: preset.fillStyle,
      } satisfies ResolvedOptions;
      const strokeOps = generator.linearPath(stroke.map((p): XY => [p.x, p.y]), options).sets[0]!.ops;
      const fillSet =
        preset.fillStyle === "solid"
          ? solidFillPolygon([polygon.map((p): XY => [...p])], options)
          : patternFillPolygons([polygon.map((p): XY => [...p])], options);

      const result = synthesizeRoughSketchyStrokeAndHachureFill({ presetId: preset.id, strokePoints: stroke, fillPolygon: polygon.map(([x, y]) => ({ x, y })), seed });
      const upstreamPasses = (ops: readonly Op[]) =>
        ops.flatMap((op, i) => (op.op === "bcurveTo" ? [[...ops[i - 1]!.data, ...op.data]] : []));
      const minePasses = (list: typeof result.doubleLineBeziers) => list.map((b) => [b.x0, b.y0, b.cp1x, b.cp1y, b.cp2x, b.cp2y, b.x1, b.y1]);
      expect(minePasses(result.doubleLineBeziers), `${preset.id} 스트로크`).toEqual(upstreamPasses(strokeOps));

      if (preset.fillStyle === "solid") {
        expect(result.fillSketchBeziers).toHaveLength(0);
        const vertices = fillSet.ops.map((op) => op.data);
        expect(result.hachureSegments, preset.id).toEqual(vertices.map((v, i) => ({ x1: v[0], y1: v[1], x2: vertices[(i + 1) % vertices.length]![0], y2: vertices[(i + 1) % vertices.length]![1] })));
        continue;
      }
      expect(minePasses(result.fillSketchBeziers), `${preset.id} 채움`).toEqual(upstreamPasses(fillSet.ops));
      // 직선 선분은 거칠게 만들기 전의 선이므로 각 이중선의 첫 곡선 시작·끝점과 거칠기 한도 안에서 가깝다.
      const passesPerLine = 2;
      expect(result.fillSketchBeziers).toHaveLength(result.hachureSegments.length * passesPerLine);
      const limit = 2 * preset.roughness + 1e-9;
      result.hachureSegments.forEach((segment, i) => {
        const first = result.fillSketchBeziers[i * passesPerLine]!;
        expect(Math.abs(first.x0 - segment.x1), `${preset.id} #${i} 시작 x`).toBeLessThanOrEqual(limit);
        expect(Math.abs(first.y0 - segment.y1), `${preset.id} #${i} 시작 y`).toBeLessThanOrEqual(limit);
        expect(Math.abs(first.x1 - segment.x2), `${preset.id} #${i} 끝 x`).toBeLessThanOrEqual(limit);
        expect(Math.abs(first.y1 - segment.y2), `${preset.id} #${i} 끝 y`).toBeLessThanOrEqual(limit);
      });
    }
  });

  it("dots 프리셋은 업스트림이 Math.random()을 써서 재현할 수 없으므로 같은 시드에서 항상 같은 자체 결과를 낸다", () => {
    const dots = FREEHAND_ROUGH_BRUSH_PRESETS.find((p) => p.fillStyle === "dots")!;
    const args = { presetId: dots.id, strokePoints: [{ x: 0, y: 0 }, { x: 40, y: 10 }], seed: 99 };
    const first = synthesizeRoughSketchyStrokeAndHachureFill(args);
    expect(synthesizeRoughSketchyStrokeAndHachureFill(args)).toEqual(first);
    expect(first.hachureSegments.length).toBeGreaterThan(0);
    expect(first.fillSketchBeziers).toHaveLength(0);
    expect(synthesizeRoughSketchyStrokeAndHachureFill({ ...args, seed: 100 }).doubleLineBeziers).not.toEqual(first.doubleLineBeziers);
  });
});

describe("대조 하네스의 자기 점검", () => {
  it("한 줄짜리 결함도 놓치지 않도록 비교는 연산 종류와 좌표를 모두 본다", () => {
    const upstream = generator.line(0, 0, 100, 40, { seed: 5 }).sets[0]!.ops;
    const mine = roughSketchLine(0, 0, 100, 40, { ...ROUGH_SKETCH_DEFAULT_OPTIONS }, new RoughLehmerPrng(5));
    expect(sameOps(upstream, mine)).toBeNull();
    const tampered: RoughSketchOpSet = { type: mine.type, ops: mine.ops.map((op, i) => (i === 3 ? { op: op.op, data: op.data.map((v, j) => (j === 5 ? v + 1e-9 : v)) } : op)) };
    expect(sameOps(upstream, tampered)).not.toBeNull();
  });
});
