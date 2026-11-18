/**
 * CSP 다각형 프레임(var 43)·프레임 테두리 펜(var 491)·거친 사각형(var 785) 및
 * 가로/세로 독립 여백 컷 분할(CutFrameHorizontalGap, CutFrameVerticalGap) 엔진.
 *
 * 역공학 근거(REA evidence_id):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_4571415adae1548e2078cdaf17fdc17fc7b43d1c9bdbbb5a58461c885bbdd64d
 *
 * 클린룸 수학 구현 원칙:
 * - 클릭 다각형(15° 각도 스냅) 및 자유곡선 Ramer–Douglas–Peucker(RDP) 단순화
 * - 비인접 선분 교차 판정을 통한 자기교차(나비넥타이) 거부 + 최소 면적 검증
 * - Mulberry32 시드 PRNG 기반 손펜 잉크 거친 테두리 폴리곤 생성(비결정적 난수 미사용)
 * - 법선 투영 타원 노름 기반 가로/세로 독립 여백(CutFrameHorizontalGap, CutFrameVerticalGap) 분할
 */

import type { FrameEl } from "../studio-element-model";

export interface FramePoint2D {
  readonly x: number;
  readonly y: number;
}

export type FramePolygonAuthorMode = "polyline" | "freehand-pen";

export type FramePolygonRejectReason =
  | "too-few-points"
  | "self-intersecting"
  | "area-too-small";

export type BuildFramePolygonResult =
  | {
      readonly ok: true;
      readonly frame: FrameEl;
      readonly globalVertices: readonly FramePoint2D[];
      readonly areaPx2: number;
    }
  | {
      readonly ok: false;
      readonly reason: FramePolygonRejectReason;
      readonly message: string;
    };

export interface BuildFramePolygonInput {
  readonly id: string;
  readonly mode: FramePolygonAuthorMode;
  readonly points: readonly FramePoint2D[];
  /** 클릭 다각형 시 이전 정점 기준 15° 배수로 각도 스냅 여부. */
  readonly snap15Deg?: boolean;
  /** 자유곡선(freehand-pen) RDP 단순화 허용 오차(px, 기본 3.5). */
  readonly simplifyEpsilonPx?: number;
  /** 허용 최소 프레임 면적(px², 기본 400). */
  readonly minAreaPx2?: number;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly bgColor?: string;
}

export interface RoughFrameOutlineOptions {
  readonly seed?: string | number;
  /** 손떨림 진폭(px, 0..16, 기본 2.2). */
  readonly roughnessPx?: number;
  /** 변 중앙 활 휨(px, 0..20, 기본 1.6). */
  readonly bowingPx?: number;
  /** 변당 분할 샘플 수(4..48, 기본 14). */
  readonly edgeSubdivisions?: number;
  /** 모서리 펜 겹침 돌출 길이(px, 0..16, 기본 0). */
  readonly cornerOvershootPx?: number;
  /** 이중 덧그리기 스트로크 생성 여부. */
  readonly doubleStroke?: boolean;
}

export interface RoughFrameOutlinePlan {
  /** FrameEl.points 에 바로 넣을 수 있는 닫힌 로컬 평탄 좌표 [x0, y0, ...]. */
  readonly closedLocalPoints: number[];
  readonly closedLocalVertices: readonly FramePoint2D[];
  /** 코너 오버슈트·이중선을 포함한 SVG path d 문자열. */
  readonly svgPathData: string;
  readonly strokePolylines: readonly (readonly FramePoint2D[])[];
}

export interface DualGutterCutOptions {
  /** 가로 분할선(상하 컷 사이) 여백 — CSP CutFrameHorizontalGap (기본 28px). */
  readonly horizontalGapPx: number;
  /** 세로 분할선(좌우 컷 사이) 여백 — CSP CutFrameVerticalGap (기본 14px). */
  readonly verticalGapPx: number;
  readonly minAreaPx2?: number;
}

const SNAP_STEP_RAD = Math.PI / 12; // 15°

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function createFramePrng(seed: string | number): () => number {
  const text = typeof seed === "number" ? `fn:${seed}` : `fs:${seed}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let state = (h >>> 0) || 0x12345678;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 기준 정점(anchor)에서 커서까지의 각도를 가장 가까운 15° 배수로 스냅한다. */
export function snapAngleTo15Deg(
  anchor: FramePoint2D,
  cursor: FramePoint2D,
  enabled = true,
): FramePoint2D {
  if (!enabled) return cursor;
  const dx = cursor.x - anchor.x;
  const dy = cursor.y - anchor.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return cursor;
  const snappedAngle = Math.round(Math.atan2(dy, dx) / SNAP_STEP_RAD) * SNAP_STEP_RAD;
  return {
    x: round2(anchor.x + dist * Math.cos(snappedAngle)),
    y: round2(anchor.y + dist * Math.sin(snappedAngle)),
  };
}

function pointToSegmentDist(p: FramePoint2D, a: FramePoint2D, b: FramePoint2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker(RDP) 선분 단순화. */
export function simplifyStrokeRdp(
  points: readonly FramePoint2D[],
  epsilonPx: number,
): FramePoint2D[] {
  if (points.length <= 2) return [...points];
  const eps = Math.max(0.25, epsilonPx);
  let maxDist = -1;
  let splitIdx = -1;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  for (let i = 1; i < points.length - 1; i += 1) {
    const d = pointToSegmentDist(points[i]!, first, last);
    if (d > maxDist) {
      maxDist = d;
      splitIdx = i;
    }
  }

  if (maxDist > eps && splitIdx > 0) {
    const left = simplifyStrokeRdp(points.slice(0, splitIdx + 1), eps);
    const right = simplifyStrokeRdp(points.slice(splitIdx), eps);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

/** 다각형 부호 있는 면적(양수 = 화면 좌표계 시계 방향). */
export function computeSignedPolygonArea(vertices: readonly FramePoint2D[]): number {
  if (vertices.length < 3) return 0;
  let twiceArea = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return twiceArea * 0.5;
}

export function computePolygonArea(vertices: readonly FramePoint2D[]): number {
  return Math.abs(computeSignedPolygonArea(vertices));
}

function cross2D(o: FramePoint2D, a: FramePoint2D, b: FramePoint2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(p: FramePoint2D, a: FramePoint2D, b: FramePoint2D): boolean {
  return (
    p.x >= Math.min(a.x, b.x) - 1e-6 &&
    p.x <= Math.max(a.x, b.x) + 1e-6 &&
    p.y >= Math.min(a.y, b.y) - 1e-6 &&
    p.y <= Math.max(a.y, b.y) + 1e-6
  );
}

function segmentsIntersect(
  a1: FramePoint2D,
  a2: FramePoint2D,
  b1: FramePoint2D,
  b2: FramePoint2D,
): boolean {
  const d1 = cross2D(b1, b2, a1);
  const d2 = cross2D(b1, b2, a2);
  const d3 = cross2D(a1, a2, b1);
  const d4 = cross2D(a1, a2, b2);

  if (((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) &&
      ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6))) {
    return true;
  }
  if (Math.abs(d1) <= 1e-6 && onSegment(a1, b1, b2)) return true;
  if (Math.abs(d2) <= 1e-6 && onSegment(a2, b1, b2)) return true;
  if (Math.abs(d3) <= 1e-6 && onSegment(b1, a1, a2)) return true;
  if (Math.abs(d4) <= 1e-6 && onSegment(b2, a1, a2)) return true;
  return false;
}

/** 닫힌 단순 다각형 여부를 검사한다(비인접 변 교차 시 true). */
export function hasPolygonSelfIntersection(vertices: readonly FramePoint2D[]): boolean {
  const n = vertices.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i += 1) {
    const a1 = vertices[i]!;
    const a2 = vertices[(i + 1) % n]!;
    for (let j = i + 2; j < n; j += 1) {
      // 첫 변(0)과 마지막 변(n-1)은 정점 0을 공유하므로 인접 변이다.
      if (i === 0 && j === n - 1) continue;
      const b1 = vertices[j]!;
      const b2 = vertices[(j + 1) % n]!;
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

function cleanClosedVertices(raw: readonly FramePoint2D[], minEdgePx = 1.5): FramePoint2D[] {
  const deduped: FramePoint2D[] = [];
  for (const pt of raw) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    const prev = deduped.at(-1);
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) >= minEdgePx) {
      deduped.push(pt);
    }
  }
  if (deduped.length >= 2) {
    const first = deduped[0]!;
    const last = deduped.at(-1)!;
    if (Math.hypot(first.x - last.x, first.y - last.y) < minEdgePx * 1.5) {
      deduped.pop();
    }
  }
  return deduped;
}

function globalVerticesToFrameEl(
  id: string,
  vertices: readonly FramePoint2D[],
  template?: Partial<Pick<FrameEl, "bgColor" | "bg" | "stroke" | "strokeWidth" | "dashStyle">>,
): FrameEl {
  const ordered =
    computeSignedPolygonArea(vertices) < 0 ? [...vertices].reverse() : [...vertices];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const v of ordered) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  const x = round2(minX);
  const y = round2(minY);
  const width = Math.max(1, round2(maxX - minX));
  const height = Math.max(1, round2(maxY - minY));
  const localPoints: number[] = [];
  for (const v of ordered) {
    localPoints.push(round2(v.x - x), round2(v.y - y));
  }

  return {
    id,
    type: "frame",
    x,
    y,
    width,
    height,
    points: localPoints,
    ...(template?.bg !== undefined ? { bg: template.bg } : {}),
    ...(template?.bgColor !== undefined ? { bgColor: template.bgColor } : {}),
    ...(template?.stroke !== undefined ? { stroke: template.stroke } : {}),
    ...(template?.strokeWidth !== undefined ? { strokeWidth: template.strokeWidth } : {}),
    ...(template?.dashStyle !== undefined ? { dashStyle: template.dashStyle } : {}),
  };
}

/**
 * 클릭 다각형(Polyline frame, var 43) 또는 자유곡선 펜(Frame border pen, var 491) 획으로부터
 * 자기교차 없는 유효한 다각형 FrameEl을 생성한다.
 */
export function buildFrameElFromPolygonStroke(
  input: BuildFramePolygonInput,
): BuildFramePolygonResult {
  const minArea = Math.max(16, input.minAreaPx2 ?? 400);
  let working: FramePoint2D[];

  if (input.mode === "polyline") {
    const snapped: FramePoint2D[] = [];
    for (const pt of input.points) {
      if (snapped.length === 0 || !input.snap15Deg) {
        snapped.push(pt);
      } else {
        snapped.push(snapAngleTo15Deg(snapped.at(-1)!, pt, true));
      }
    }
    working = cleanClosedVertices(snapped, 1.5);
  } else {
    const eps = clamp(input.simplifyEpsilonPx ?? 3.5, 0.5, 32);
    // 폐곡선 자유획의 시작/끝 근처 겹침을 정리한 뒤 RDP 단순화를 수행한다.
    const cleanedRaw = cleanClosedVertices(input.points, 1.5);
    if (cleanedRaw.length < 3) {
      return {
        ok: false,
        reason: "too-few-points",
        message: "프레임을 만들려면 최소 3개 이상의 꼭짓점이 필요합니다.",
      };
    }
    const closedInput = [...cleanedRaw, cleanedRaw[0]!];
    const simplified = simplifyStrokeRdp(closedInput, eps);
    working = cleanClosedVertices(simplified, 2);
  }

  if (working.length < 3) {
    return {
      ok: false,
      reason: "too-few-points",
      message: "단순화 후 유효 꼭짓점이 3개 미만입니다.",
    };
  }

  if (hasPolygonSelfIntersection(working)) {
    return {
      ok: false,
      reason: "self-intersecting",
      message: "외곽선이 스스로 교차하는 다각형은 컷 프레임으로 만들 수 없습니다.",
    };
  }

  const areaPx2 = computePolygonArea(working);
  if (areaPx2 < minArea) {
    return {
      ok: false,
      reason: "area-too-small",
      message: `컷 프레임 면적(${Math.round(areaPx2)}px²)이 최소 기준(${Math.round(minArea)}px²)보다 작습니다.`,
    };
  }

  const frame = globalVerticesToFrameEl(input.id, working, {
    bgColor: input.bgColor ?? "#ffffff",
    stroke: input.stroke ?? "#16100c",
    strokeWidth: input.strokeWidth ?? 3,
  });

  return {
    ok: true,
    frame,
    globalVertices: working,
    areaPx2,
  };
}

/** FrameEl의 전역 다각형 꼭짓점을 반환한다(points 미설정 시 직사각형 4정점). */
export function extractFrameGlobalVertices(
  frame: Pick<FrameEl, "x" | "y" | "width" | "height" | "points">,
): FramePoint2D[] {
  if (frame.points && frame.points.length >= 6 && frame.points.length % 2 === 0) {
    const verts: FramePoint2D[] = [];
    for (let i = 0; i < frame.points.length; i += 2) {
      verts.push({
        x: frame.x + frame.points[i]!,
        y: frame.y + frame.points[i + 1]!,
      });
    }
    return verts;
  }
  return [
    { x: frame.x, y: frame.y },
    { x: frame.x + frame.width, y: frame.y },
    { x: frame.x + frame.width, y: frame.y + frame.height },
    { x: frame.x, y: frame.y + frame.height },
  ];
}

/**
 * CSP 거친 사각형/다각형 프레임(Rough rectangle, var 785) 손잉크 테두리 생성기.
 * 동일 시드에서 항상 동일한 손펜 흔들림·활 휨·모서리 돌출 외곽선을 생성한다.
 */
export function generateRoughFrameOutline(
  frame: Pick<FrameEl, "id" | "x" | "y" | "width" | "height" | "points">,
  options: RoughFrameOutlineOptions = {},
): RoughFrameOutlinePlan {
  const rand = createFramePrng(options.seed ?? frame.id);
  const roughness = clamp(options.roughnessPx ?? 2.2, 0, 16);
  const bowing = clamp(options.bowingPx ?? 1.6, 0, 20);
  const subdivisions = clamp(Math.round(options.edgeSubdivisions ?? 14), 4, 48);
  const overshoot = clamp(options.cornerOvershootPx ?? 0, 0, 16);

  const globalBase = extractFrameGlobalVertices(frame);
  const localBase = globalBase.map((pt) => ({
    x: pt.x - frame.x,
    y: pt.y - frame.y,
  }));

  const sampleRoughEdge = (
    p0: FramePoint2D,
    p1: FramePoint2D,
    passScale: number,
  ): FramePoint2D[] => {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const bowSign = (rand() - 0.5) * 2;
    const pts: FramePoint2D[] = [];

    for (let s = 0; s <= subdivisions; s += 1) {
      const t = s / subdivisions;
      const envelope = Math.sin(Math.PI * t);
      const bowOffset = bowSign * bowing * passScale * envelope;
      const endDamping = s === 0 || s === subdivisions ? 0.2 : 1;
      const jitter = (rand() - 0.5) * 2 * roughness * passScale * endDamping;
      const alongOvershoot =
        s === 0 ? -overshoot : s === subdivisions ? overshoot : 0;

      pts.push({
        x: round2(p0.x + dx * t + ux * alongOvershoot + nx * (bowOffset + jitter)),
        y: round2(p0.y + dy * t + uy * alongOvershoot + ny * (bowOffset + jitter)),
      });
    }
    return pts;
  };

  const closedLocalVertices: FramePoint2D[] = [];
  const strokePolylines: FramePoint2D[][] = [];

  for (let i = 0; i < localBase.length; i += 1) {
    const a = localBase[i]!;
    const b = localBase[(i + 1) % localBase.length]!;
    const primaryEdge = sampleRoughEdge(a, b, 1);
    strokePolylines.push(primaryEdge);
    // 닫힌 폴리곤에는 코너 오버슈트를 제외한 내부 샘플로 자기교차 없는 폐곡선을 유지한다.
    const startIdx = overshoot > 0 ? 1 : 0;
    const endIdx = overshoot > 0 ? primaryEdge.length - 1 : primaryEdge.length - 1;
    for (let k = startIdx; k < endIdx; k += 1) {
      closedLocalVertices.push(primaryEdge[k]!);
    }
    if (options.doubleStroke) {
      strokePolylines.push(sampleRoughEdge(a, b, 0.65));
    }
  }

  const closedLocalPoints: number[] = [];
  for (const v of closedLocalVertices) {
    closedLocalPoints.push(v.x, v.y);
  }

  const pathSegments: string[] = [];
  for (const line of strokePolylines) {
    if (line.length === 0) continue;
    pathSegments.push(`M ${line[0]!.x} ${line[0]!.y}`);
    for (let i = 1; i < line.length; i += 1) {
      pathSegments.push(`L ${line[i]!.x} ${line[i]!.y}`);
    }
  }

  return {
    closedLocalPoints,
    closedLocalVertices,
    svgPathData: pathSegments.join(" "),
    strokePolylines,
  };
}

function clipPolygonHalfPlane(
  vertices: readonly FramePoint2D[],
  origin: FramePoint2D,
  normal: FramePoint2D,
  offset: number,
): FramePoint2D[] {
  if (vertices.length === 0) return [];
  const dist = (p: FramePoint2D) =>
    (p.x - origin.x) * normal.x + (p.y - origin.y) * normal.y;
  const out: FramePoint2D[] = [];
  let prev = vertices[vertices.length - 1]!;
  let prevDist = dist(prev);

  for (let i = 0; i < vertices.length; i += 1) {
    const curr = vertices[i]!;
    const currDist = dist(curr);
    const prevIn = prevDist >= offset - 1e-7;
    const currIn = currDist >= offset - 1e-7;

    if (currIn) {
      if (!prevIn) {
        const denom = currDist - prevDist;
        const t = Math.abs(denom) > 1e-9 ? clamp((offset - prevDist) / denom, 0, 1) : 0;
        out.push({
          x: prev.x + t * (curr.x - prev.x),
          y: prev.y + t * (curr.y - prev.y),
        });
      }
      out.push(curr);
    } else if (prevIn) {
      const denom = currDist - prevDist;
      const t = Math.abs(denom) > 1e-9 ? clamp((offset - prevDist) / denom, 0, 1) : 0;
      out.push({
        x: prev.x + t * (curr.x - prev.x),
        y: prev.y + t * (curr.y - prev.y),
      });
    }

    prev = curr;
    prevDist = currDist;
  }
  return cleanClosedVertices(out, 0.5);
}

/**
 * 분할선 각도에 따라 가로 여백(CutFrameHorizontalGap)과 세로 여백(CutFrameVerticalGap)을
 * 타원 법선 노름으로 계산한다:
 * - 수평 분할선(상하 컷 분리, normal=(0,±1)) -> horizontalGapPx
 * - 수직 분할선(좌우 컷 분리, normal=(±1,0)) -> verticalGapPx
 */
export function computeEffectiveDualGutterPx(
  cutStart: FramePoint2D,
  cutEnd: FramePoint2D,
  gutters: DualGutterCutOptions,
): number {
  const dx = cutEnd.x - cutStart.x;
  const dy = cutEnd.y - cutStart.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return Math.max(0, gutters.horizontalGapPx);
  const nx = -dy / len;
  const ny = dx / len;
  const hGap = Math.max(0, gutters.horizontalGapPx);
  const vGap = Math.max(0, gutters.verticalGapPx);
  return Math.hypot(nx * vGap, ny * hGap);
}

/**
 * 사각형 또는 다각형 FrameEl을 임의 각도의 칼선 + 독립 가로/세로 여백으로 2분할한다.
 */
export function splitFramePolygonWithDualGutters(
  frame: FrameEl,
  cut: { readonly start: FramePoint2D; readonly end: FramePoint2D },
  gutters: DualGutterCutOptions,
): [FrameEl, FrameEl] | null {
  const dx = cut.end.x - cut.start.x;
  const dy = cut.end.y - cut.start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-4) return null;

  const nx = -dy / len;
  const ny = dx / len;
  const effectiveGap = computeEffectiveDualGutterPx(cut.start, cut.end, gutters);
  const halfGap = effectiveGap * 0.5;
  const minArea = Math.max(16, gutters.minAreaPx2 ?? 200);

  const poly = extractFrameGlobalVertices(frame);
  const sideA = clipPolygonHalfPlane(poly, cut.start, { x: nx, y: ny }, halfGap);
  const sideB = clipPolygonHalfPlane(poly, cut.start, { x: -nx, y: -ny }, halfGap);

  if (sideA.length < 3 || sideB.length < 3) return null;
  if (computePolygonArea(sideA) < minArea || computePolygonArea(sideB) < minArea) {
    return null;
  }

  const styleTemplate = {
    bg: frame.bg,
    bgColor: frame.bgColor,
    stroke: frame.stroke,
    strokeWidth: frame.strokeWidth,
    dashStyle: frame.dashStyle,
  };

  const frameA = globalVerticesToFrameEl(`${frame.id}-a`, sideA, styleTemplate);
  const frameB = globalVerticesToFrameEl(`${frame.id}-b`, sideB, styleTemplate);
  // 읽기 순서(상단 우선, 같으면 좌측 우선)로 정렬해 반환한다.
  if (frameA.y > frameB.y + 1 || (Math.abs(frameA.y - frameB.y) <= 1 && frameA.x > frameB.x)) {
    return [frameB, frameA];
  }
  return [frameA, frameB];
}
