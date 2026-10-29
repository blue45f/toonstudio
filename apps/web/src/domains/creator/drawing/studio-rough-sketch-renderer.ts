/**
 * 손으로 그린 듯한 선·다각형·해칭 연산 생성기. roughjs 4.6.6과 같은 수치를 낸다.
 *
 * 이식 근거
 * - roughjs 4.6.6 (MIT, Copyright (c) 2019 Preet Shihn)의 `bin/renderer.js`(선·이중선·솔리드 채움)와
 *   `bin/fillers/*`(해칭 채움), 그리고 roughjs가 의존하는 hachure-fill 0.5.2 (MIT, Copyright (c) 2023
 *   Preet Shihn)의 스캔라인 해칭 선분 계산 동작을 따라 새로 적었다. 두 패키지는 프로덕션 의존성이라
 *   MIT 고지 원문이 릴리스 고지 산출물(dist/legal/THIRD_PARTY_NOTICES.generated.md)에 그대로 실린다.
 * - 같은 시드·옵션에서 연산 좌표가 업스트림과 일치함은
 *   `__tests__/studio-upstream-parity.test.ts`가 설치된 roughjs를 직접 실행해 확인한다.
 *
 * 범위
 * - 포함: 난수(`Random`), 선 하나(`_line`), 이중선(`_doubleLine`), 열린·닫힌 折선, 다각형 외곽선,
 *   채움 6종(hachure, zigzag, cross-hatch, dashed, zigzag-line, solid).
 * - 제외: dots 채움은 업스트림이 `Math.random()`과 타원 연산을 써서 같은 시드로 재현되지 않는다.
 *   곡선·타원·호·SVG 경로도 이 모듈 범위 밖이다.
 *
 * 업스트림과 일부러 다르게 둔 것
 * - 시드 0은 업스트림에서 매번 달라지는 `Math.random()`이지만, 여기서는 호출자가 넘긴 난수원을 그대로
 *   쓴다(난수원이 결정적이면 결과도 결정적이다).
 * - 해칭 채움이 입력 다각형 좌표를 제자리에서 회전했다 되돌리는 동작은 그대로 따르되, 호출자의
 *   배열은 건드리지 않도록 복사본에서 수행한다. 교차 해칭의 두 번째 패스는 첫 패스가 남긴
 *   부동소수 오차까지 이어받는다(업스트림과 같다).
 */

export type RoughSketchFillStyle = "hachure" | "zigzag" | "cross-hatch" | "dashed" | "zigzag-line" | "solid";

export interface RoughSketchOptions {
  readonly roughness: number;
  readonly bowing: number;
  readonly maxRandomnessOffset: number;
  readonly disableMultiStroke: boolean;
  readonly disableMultiStrokeFill: boolean;
  readonly preserveVertices: boolean;
  readonly hachureAngle: number;
  readonly hachureGap: number;
  readonly strokeWidth: number;
  readonly dashOffset: number;
  readonly dashGap: number;
  readonly zigzagOffset: number;
}

/** roughjs `RoughGenerator`의 기본 옵션 중 이 모듈이 읽는 값. */
export const ROUGH_SKETCH_DEFAULT_OPTIONS: RoughSketchOptions = Object.freeze({
  roughness: 1,
  bowing: 1,
  maxRandomnessOffset: 2,
  disableMultiStroke: false,
  disableMultiStrokeFill: false,
  preserveVertices: false,
  hachureAngle: -41,
  hachureGap: -1,
  strokeWidth: 1,
  dashOffset: -1,
  dashGap: -1,
  zigzagOffset: -1,
});

export interface RoughSketchRandom {
  next(): number;
}

export interface RoughSketchOp {
  readonly op: "move" | "lineTo" | "bcurveTo";
  readonly data: readonly number[];
}

export interface RoughSketchOpSet {
  readonly type: "path" | "fillPath" | "fillSketch";
  readonly ops: readonly RoughSketchOp[];
  /** 해칭 계열 채움에서 거칠게 만들기 전의 직선 선분(x1, y1, x2, y2). 시각화·통계용이다. */
  readonly baseSegments?: readonly (readonly [number, number, number, number])[];
}

type Point = [number, number];
type Line = [Point, Point];

function lineLength(line: Line): number {
  const p1 = line[0];
  const p2 = line[1];
  return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2));
}

function offset(min: number, max: number, o: RoughSketchOptions, rnd: RoughSketchRandom, roughnessGain = 1): number {
  return o.roughness * roughnessGain * (rnd.next() * (max - min) + min);
}

function offsetOpt(x: number, o: RoughSketchOptions, rnd: RoughSketchRandom, roughnessGain = 1): number {
  return offset(-x, x, o, rnd, roughnessGain);
}

function lineOps(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  o: RoughSketchOptions,
  rnd: RoughSketchRandom,
  move: boolean,
  overlay: boolean,
): RoughSketchOp[] {
  const lengthSq = Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2);
  const length = Math.sqrt(lengthSq);
  let roughnessGain = 1;
  if (length < 200) {
    roughnessGain = 1;
  } else if (length > 500) {
    roughnessGain = 0.4;
  } else {
    roughnessGain = -0.0016668 * length + 1.233334;
  }

  let off = o.maxRandomnessOffset || 0;
  if (off * off * 100 > lengthSq) off = length / 10;
  const halfOffset = off / 2;
  const divergePoint = 0.2 + rnd.next() * 0.2;
  let midDispX = (o.bowing * o.maxRandomnessOffset * (y2 - y1)) / 200;
  let midDispY = (o.bowing * o.maxRandomnessOffset * (x1 - x2)) / 200;
  midDispX = offsetOpt(midDispX, o, rnd, roughnessGain);
  midDispY = offsetOpt(midDispY, o, rnd, roughnessGain);

  const ops: RoughSketchOp[] = [];
  const randomHalf = (): number => offsetOpt(halfOffset, o, rnd, roughnessGain);
  const randomFull = (): number => offsetOpt(off, o, rnd, roughnessGain);
  const preserve = o.preserveVertices;

  if (move) {
    if (overlay) {
      ops.push({ op: "move", data: [x1 + (preserve ? 0 : randomHalf()), y1 + (preserve ? 0 : randomHalf())] });
    } else {
      ops.push({
        op: "move",
        data: [x1 + (preserve ? 0 : offsetOpt(off, o, rnd, roughnessGain)), y1 + (preserve ? 0 : offsetOpt(off, o, rnd, roughnessGain))],
      });
    }
  }

  if (overlay) {
    ops.push({
      op: "bcurveTo",
      data: [
        midDispX + x1 + (x2 - x1) * divergePoint + randomHalf(),
        midDispY + y1 + (y2 - y1) * divergePoint + randomHalf(),
        midDispX + x1 + 2 * (x2 - x1) * divergePoint + randomHalf(),
        midDispY + y1 + 2 * (y2 - y1) * divergePoint + randomHalf(),
        x2 + (preserve ? 0 : randomHalf()),
        y2 + (preserve ? 0 : randomHalf()),
      ],
    });
  } else {
    ops.push({
      op: "bcurveTo",
      data: [
        midDispX + x1 + (x2 - x1) * divergePoint + randomFull(),
        midDispY + y1 + (y2 - y1) * divergePoint + randomFull(),
        midDispX + x1 + 2 * (x2 - x1) * divergePoint + randomFull(),
        midDispY + y1 + 2 * (y2 - y1) * divergePoint + randomFull(),
        x2 + (preserve ? 0 : randomFull()),
        y2 + (preserve ? 0 : randomFull()),
      ],
    });
  }
  return ops;
}

function doubleLineOps(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  o: RoughSketchOptions,
  rnd: RoughSketchRandom,
  filling = false,
): RoughSketchOp[] {
  const singleStroke = filling ? o.disableMultiStrokeFill : o.disableMultiStroke;
  const first = lineOps(x1, y1, x2, y2, o, rnd, true, false);
  if (singleStroke) return first;
  const second = lineOps(x1, y1, x2, y2, o, rnd, true, true);
  return first.concat(second);
}

/** 선 하나를 이중선(두 번 겹쳐 그린 곡선)으로 만든다. */
export function roughSketchLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  o: RoughSketchOptions,
  rnd: RoughSketchRandom,
): RoughSketchOpSet {
  return { type: "path", ops: doubleLineOps(x1, y1, x2, y2, o, rnd) };
}

/** 점열을 이어 그린다. `close`가 참이면 끝점에서 시작점으로 돌아온다. */
export function roughSketchLinearPath(
  points: readonly (readonly [number, number])[],
  close: boolean,
  o: RoughSketchOptions,
  rnd: RoughSketchRandom,
): RoughSketchOpSet {
  const len = points.length;
  if (len > 2) {
    const ops: RoughSketchOp[] = [];
    for (let i = 0; i < len - 1; i += 1) {
      ops.push(...doubleLineOps(points[i]![0], points[i]![1], points[i + 1]![0], points[i + 1]![1], o, rnd));
    }
    if (close) {
      ops.push(...doubleLineOps(points[len - 1]![0], points[len - 1]![1], points[0]![0], points[0]![1], o, rnd));
    }
    return { type: "path", ops };
  }
  if (len === 2) return roughSketchLine(points[0]![0], points[0]![1], points[1]![0], points[1]![1], o, rnd);
  return { type: "path", ops: [] };
}

function rotatePoints(points: Point[], degrees: number): void {
  const angle = (Math.PI / 180) * degrees;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (const p of points) {
    const x = p[0];
    const y = p[1];
    p[0] = (x - 0) * cos - (y - 0) * sin + 0;
    p[1] = (x - 0) * sin + (y - 0) * cos + 0;
  }
}

function straightHachureLines(polygons: Point[][], gapIn: number, stepOffset: number): Line[] {
  const vertexArray: Point[][] = [];
  for (const polygon of polygons) {
    const vertices: Point[] = [...polygon];
    const first = vertices[0]!;
    const last = vertices[vertices.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) vertices.push([first[0], first[1]]);
    if (vertices.length > 2) vertexArray.push(vertices);
  }

  const lines: Line[] = [];
  const gap = Math.max(gapIn, 0.1);

  interface Edge {
    ymin: number;
    ymax: number;
    x: number;
    islope: number;
  }
  const edges: Edge[] = [];
  for (const vertices of vertexArray) {
    for (let i = 0; i < vertices.length - 1; i += 1) {
      const p1 = vertices[i]!;
      const p2 = vertices[i + 1]!;
      if (p1[1] !== p2[1]) {
        const ymin = Math.min(p1[1], p2[1]);
        edges.push({
          ymin,
          ymax: Math.max(p1[1], p2[1]),
          x: ymin === p1[1] ? p1[0] : p2[0],
          islope: (p2[0] - p1[0]) / (p2[1] - p1[1]),
        });
      }
    }
  }

  edges.sort((e1, e2) => {
    if (e1.ymin < e2.ymin) return -1;
    if (e1.ymin > e2.ymin) return 1;
    if (e1.x < e2.x) return -1;
    if (e1.x > e2.x) return 1;
    if (e1.ymax === e2.ymax) return 0;
    return (e1.ymax - e2.ymax) / Math.abs(e1.ymax - e2.ymax);
  });
  if (!edges.length) return lines;

  let activeEdges: { s: number; edge: Edge }[] = [];
  let y = edges[0]!.ymin;
  let iteration = 0;
  while (activeEdges.length || edges.length) {
    if (edges.length) {
      let ix = -1;
      for (let i = 0; i < edges.length; i += 1) {
        if (edges[i]!.ymin > y) break;
        ix = i;
      }
      const removed = edges.splice(0, ix + 1);
      removed.forEach((edge) => {
        activeEdges.push({ s: y, edge });
      });
    }
    activeEdges = activeEdges.filter((ae) => ae.edge.ymax > y);
    activeEdges.sort((ae1, ae2) => {
      if (ae1.edge.x === ae2.edge.x) return 0;
      return (ae1.edge.x - ae2.edge.x) / Math.abs(ae1.edge.x - ae2.edge.x);
    });

    if (stepOffset !== 1 || iteration % gap === 0) {
      if (activeEdges.length > 1) {
        for (let i = 0; i < activeEdges.length; i += 2) {
          const nexti = i + 1;
          if (nexti >= activeEdges.length) break;
          const ce = activeEdges[i]!.edge;
          const ne = activeEdges[nexti]!.edge;
          lines.push([
            [Math.round(ce.x), y],
            [Math.round(ne.x), y],
          ]);
        }
      }
    }

    y += stepOffset;
    activeEdges.forEach((ae) => {
      ae.edge.x = ae.edge.x + stepOffset * ae.edge.islope;
    });
    iteration += 1;
  }
  return lines;
}

/** hachure-fill의 `hachureLines`. 다각형 좌표를 제자리에서 회전했다 되돌린다. */
function hachureFillLines(polygons: Point[][], hachureGap: number, hachureAngle: number, stepOffset = 1): Line[] {
  const angle = hachureAngle;
  const gap = Math.max(hachureGap, 0.1);
  if (angle) {
    for (const polygon of polygons) rotatePoints(polygon, angle);
  }
  const lines = straightHachureLines(polygons, gap, stepOffset);
  if (angle) {
    for (const polygon of polygons) rotatePoints(polygon, -angle);
    const endpoints: Point[] = [];
    lines.forEach((line) => endpoints.push(...line));
    rotatePoints(endpoints, -angle);
  }
  return lines;
}

function polygonHachureLines(polygons: Point[][], o: RoughSketchOptions, rnd: RoughSketchRandom): Line[] {
  const angle = o.hachureAngle + 90;
  let gap = o.hachureGap;
  if (gap < 0) gap = o.strokeWidth * 4;
  gap = Math.round(Math.max(gap, 0.1));
  let skipOffset = 1;
  if (o.roughness >= 1) {
    if (rnd.next() > 0.7) skipOffset = gap;
  }
  return hachureFillLines(polygons, gap, angle, skipOffset || 1);
}

function renderLines(lines: Line[], o: RoughSketchOptions, rnd: RoughSketchRandom): RoughSketchOpSet {
  const ops: RoughSketchOp[] = [];
  const baseSegments: [number, number, number, number][] = [];
  for (const line of lines) {
    ops.push(...doubleLineOps(line[0][0], line[0][1], line[1][0], line[1][1], o, rnd, true));
    baseSegments.push([line[0][0], line[0][1], line[1][0], line[1][1]]);
  }
  return { type: "fillSketch", ops, baseSegments };
}

function copyPolygons(points: readonly (readonly [number, number])[]): Point[][] {
  return [points.map((p): Point => [p[0], p[1]])];
}

function hachureFill(polygons: Point[][], o: RoughSketchOptions, rnd: RoughSketchRandom): RoughSketchOpSet {
  return renderLines(polygonHachureLines(polygons, o, rnd), o, rnd);
}

function zigzagFill(polygons: Point[][], o: RoughSketchOptions, rnd: RoughSketchRandom): RoughSketchOpSet {
  let gap = o.hachureGap;
  if (gap < 0) gap = o.strokeWidth * 4;
  gap = Math.max(gap, 0.1);
  const o2: RoughSketchOptions = { ...o, hachureGap: gap };
  const lines = polygonHachureLines(polygons, o2, rnd);
  const zigZagAngle = (Math.PI / 180) * o.hachureAngle;
  const zigzagLines: Line[] = [];
  const dgx = gap * 0.5 * Math.cos(zigZagAngle);
  const dgy = gap * 0.5 * Math.sin(zigZagAngle);
  for (const [p1, p2] of lines) {
    if (lineLength([p1, p2])) {
      zigzagLines.push(
        [[p1[0] - dgx, p1[1] + dgy], [p2[0], p2[1]]],
        [[p1[0] + dgx, p1[1] - dgy], [p2[0], p2[1]]],
      );
    }
  }
  return renderLines(zigzagLines, o, rnd);
}

function crossHatchFill(polygons: Point[][], o: RoughSketchOptions, rnd: RoughSketchRandom): RoughSketchOpSet {
  const first = hachureFill(polygons, o, rnd);
  const o2: RoughSketchOptions = { ...o, hachureAngle: o.hachureAngle + 90 };
  const second = hachureFill(polygons, o2, rnd);
  return { type: "fillSketch", ops: first.ops.concat(second.ops), baseSegments: [...(first.baseSegments ?? []), ...(second.baseSegments ?? [])] };
}

function dashedFill(polygons: Point[][], o: RoughSketchOptions, rnd: RoughSketchRandom): RoughSketchOpSet {
  const lines = polygonHachureLines(polygons, o, rnd);
  const offsetLen = o.dashOffset < 0 ? (o.hachureGap < 0 ? o.strokeWidth * 4 : o.hachureGap) : o.dashOffset;
  const gap = o.dashGap < 0 ? (o.hachureGap < 0 ? o.strokeWidth * 4 : o.hachureGap) : o.dashGap;
  const dashes: Line[] = [];
  lines.forEach((line) => {
    const length = lineLength(line);
    const count = Math.floor(length / (offsetLen + gap));
    const startOffset = (length + gap - count * (offsetLen + gap)) / 2;
    let p1 = line[0];
    let p2 = line[1];
    if (p1[0] > p2[0]) {
      p1 = line[1];
      p2 = line[0];
    }
    const alpha = Math.atan((p2[1] - p1[1]) / (p2[0] - p1[0]));
    for (let i = 0; i < count; i += 1) {
      const lstart = i * (offsetLen + gap);
      const lend = lstart + offsetLen;
      const start: Point = [p1[0] + lstart * Math.cos(alpha) + startOffset * Math.cos(alpha), p1[1] + lstart * Math.sin(alpha) + startOffset * Math.sin(alpha)];
      const end: Point = [p1[0] + lend * Math.cos(alpha) + startOffset * Math.cos(alpha), p1[1] + lend * Math.sin(alpha) + startOffset * Math.sin(alpha)];
      dashes.push([start, end]);
    }
  });
  return renderLines(dashes, o, rnd);
}

function zigzagLineFill(polygons: Point[][], o: RoughSketchOptions, rnd: RoughSketchRandom): RoughSketchOpSet {
  const gap = o.hachureGap < 0 ? o.strokeWidth * 4 : o.hachureGap;
  const zo = o.zigzagOffset < 0 ? gap : o.zigzagOffset;
  const o2: RoughSketchOptions = { ...o, hachureGap: gap + zo };
  const lines = polygonHachureLines(polygons, o2, rnd);
  const ops: RoughSketchOp[] = [];
  const baseSegments: [number, number, number, number][] = [];
  lines.forEach((line) => {
    const length = lineLength(line);
    const count = Math.round(length / (2 * zo));
    let p1 = line[0];
    let p2 = line[1];
    if (p1[0] > p2[0]) {
      p1 = line[1];
      p2 = line[0];
    }
    const alpha = Math.atan((p2[1] - p1[1]) / (p2[0] - p1[0]));
    for (let i = 0; i < count; i += 1) {
      const lstart = i * 2 * zo;
      const lend = (i + 1) * 2 * zo;
      const dz = Math.sqrt(2 * Math.pow(zo, 2));
      const start: Point = [p1[0] + lstart * Math.cos(alpha), p1[1] + lstart * Math.sin(alpha)];
      const end: Point = [p1[0] + lend * Math.cos(alpha), p1[1] + lend * Math.sin(alpha)];
      const middle: Point = [start[0] + dz * Math.cos(alpha + Math.PI / 4), start[1] + dz * Math.sin(alpha + Math.PI / 4)];
      ops.push(...doubleLineOps(start[0], start[1], middle[0], middle[1], o2, rnd, true), ...doubleLineOps(middle[0], middle[1], end[0], end[1], o2, rnd, true));
      baseSegments.push([start[0], start[1], middle[0], middle[1]], [middle[0], middle[1], end[0], end[1]]);
    }
  });
  return { type: "fillSketch", ops, baseSegments };
}

function solidFill(points: readonly (readonly [number, number])[], o: RoughSketchOptions, rnd: RoughSketchRandom): RoughSketchOpSet {
  const ops: RoughSketchOp[] = [];
  const off = o.maxRandomnessOffset || 0;
  const len = points.length;
  if (len > 2) {
    ops.push({ op: "move", data: [points[0]![0] + offsetOpt(off, o, rnd), points[0]![1] + offsetOpt(off, o, rnd)] });
    for (let i = 1; i < len; i += 1) {
      ops.push({ op: "lineTo", data: [points[i]![0] + offsetOpt(off, o, rnd), points[i]![1] + offsetOpt(off, o, rnd)] });
    }
  }
  return { type: "fillPath", ops };
}

/**
 * 다각형 내부 채움. roughjs `RoughGenerator.polygon`처럼 외곽선(`roughSketchLinearPath`)을 먼저
 * 만들어 난수를 소모한 뒤에 호출해야 같은 시드에서 같은 결과가 나온다.
 */
export function roughSketchFillPolygon(
  points: readonly (readonly [number, number])[],
  fillStyle: RoughSketchFillStyle,
  o: RoughSketchOptions,
  rnd: RoughSketchRandom,
): RoughSketchOpSet {
  if (fillStyle === "solid") return solidFill(points, o, rnd);
  const polygons = copyPolygons(points);
  switch (fillStyle) {
    case "zigzag":
      return zigzagFill(polygons, o, rnd);
    case "cross-hatch":
      return crossHatchFill(polygons, o, rnd);
    case "dashed":
      return dashedFill(polygons, o, rnd);
    case "zigzag-line":
      return zigzagLineFill(polygons, o, rnd);
    case "hachure":
    default:
      return hachureFill(polygons, o, rnd);
  }
}
