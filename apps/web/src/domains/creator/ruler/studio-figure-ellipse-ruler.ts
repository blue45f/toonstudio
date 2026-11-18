/**
 * Studio Figure, Concentric-Ellipse & Parallel-Curve Rulers — CSP `특수 자(동심원 타원·평행 곡선)`,
 * `도형 자(Figure ruler)`, `벡터에서 자 작성(layermakerulerfromvector)` 순수 기하 스냅 엔진.
 *
 * 역공학 근거(REA Ghidra clean-room 재구현, 상용 코드/리소스 무포함):
 * - evidence_id: `ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`
 * - evidence_id: `ev_9e97a121e10ceaa075c9f4fb0b21c7bf2bd090aa4a639830aa6f070bec16e30f`
 *
 * 회전된 타원 위의 최근접점 투영은 1사분면 접기 + 유계 Newton-Raphson 방정식 풀이로 기계 정밀도까지 수렴시키며,
 * 평행 곡선 자와 폴리라인 도형 자는 호길이/세그먼트 정밀 투영과 법선 오프셋을 보존한다.
 */

import type { DrawEl } from "../studio-element-model";

export type SpecialRulerKind = "concentric-ellipse" | "parallel-curve";
export type FigureRulerShape = "line" | "rectangle" | "ellipse" | "polygon" | "polyline";

export interface RulerPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface ConcentricEllipseRulerSpec {
  readonly id: string;
  readonly type: "concentric-ellipse";
  readonly centerX: number;
  readonly centerY: number;
  /** 기준 장반경(px, > 0). */
  readonly radiusX: number;
  /** 기준 단반경(px, > 0). */
  readonly radiusY: number;
  /** 타원 주축 회전 각도(도). */
  readonly rotationDeg: number;
}

export interface ParallelCurveRulerSpec {
  readonly id: string;
  readonly type: "parallel-curve";
  readonly points: readonly RulerPoint2D[];
  readonly closed?: boolean;
}

export interface FigureRulerSpec {
  readonly id: string;
  readonly type: "figure";
  readonly shape: FigureRulerShape;
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly rotationDeg?: number;
  /** `polygon` 꼭짓점 개수(3..32) 또는 `polyline`/`polygon` 사용자 정점 배열. */
  readonly sides?: number;
  readonly vertices?: readonly RulerPoint2D[];
  readonly closed?: boolean;
}

export type StudioExtendedSpecialRuler =
  | ConcentricEllipseRulerSpec
  | ParallelCurveRulerSpec
  | FigureRulerSpec;

export interface ConcentricEllipseSnapSession {
  readonly ruler: ConcentricEllipseRulerSpec;
  readonly scaledRx: number;
  readonly scaledRy: number;
  readonly cosRot: number;
  readonly sinRot: number;
}

export interface ParallelCurveSnapSession {
  readonly ruler: ParallelCurveRulerSpec;
  readonly signedNormalOffset: number;
}

export interface FigureRulerSnapSession {
  readonly ruler: FigureRulerSpec;
}

export interface CreateRulerFromVectorOptions {
  readonly rulerKind?: "parallel-curve" | "figure";
  /** 연속 중복/미세 떨림 정점 제거 허용 거리(px). 기본 1.0. */
  readonly simplifyTolerancePx?: number;
  /** 시작점과 끝점이 이 거리(px) 이하이면 닫힌 루프 자로 승격. 기본 4.0. */
  readonly closeThresholdPx?: number;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 원점 중심 비회전 타원 `(x / a)^2 + (y / b)^2 = 1` 위의 최근접점을
 * 1사분면 대칭 변환 + 보호된 Newton-Raphson 반복으로 정확히 계산한다.
 */
function closestPointOnCanonicalEllipse(
  a: number,
  b: number,
  ux: number,
  uy: number,
): RulerPoint2D {
  const safeA = Math.max(1e-6, a);
  const safeB = Math.max(1e-6, b);
  const signX = ux < 0 ? -1 : 1;
  const signY = uy < 0 ? -1 : 1;
  const px = Math.abs(ux);
  const py = Math.abs(uy);

  if (px <= 1e-12 && py <= 1e-12) {
    return safeA <= safeB ? { x: safeA, y: 0 } : { x: 0, y: safeB };
  }
  if (py <= 1e-12) {
    // y=0 축 위 특수해(초점 안쪽 특이점 포함)
    if (safeA * px >= safeA * safeA - safeB * safeB) {
      return { x: signX * safeA, y: 0 };
    }
    const qx = (safeA * safeA * px) / (safeA * safeA - safeB * safeB);
    const qy = safeB * Math.sqrt(Math.max(0, 1 - (qx / safeA) * (qx / safeA)));
    return { x: signX * qx, y: qy };
  }
  if (px <= 1e-12) {
    if (safeB * py >= safeB * safeB - safeA * safeA) {
      return { x: 0, y: signY * safeB };
    }
    const qy = (safeB * safeB * py) / (safeB * safeB - safeA * safeA);
    const qx = safeA * Math.sqrt(Math.max(0, 1 - (qy / safeB) * (qy / safeB)));
    return { x: qx, y: signY * qy };
  }

  // g(t) = (a*px / (t + a^2))^2 + (b*py / (t + b^2))^2 - 1 = 0, t > -min(a^2, b^2)
  const a2 = safeA * safeA;
  const b2 = safeB * safeB;
  const minSq = Math.min(a2, b2);
  const termMin = minSq === a2 ? safeA * px : safeB * py;
  let lo = -minSq + termMin;
  let hi = -minSq + Math.hypot(safeA * px, safeB * py);
  if (lo > hi) {
    const tmp = lo;
    lo = hi;
    hi = tmp;
  }
  let t = 0.5 * (lo + hi);

  for (let iter = 0; iter < 24; iter++) {
    const da = t + a2;
    const db = t + b2;
    if (da <= 1e-12 || db <= 1e-12) {
      t = 0.5 * (lo + hi);
      continue;
    }
    const ra = (safeA * px) / da;
    const rb = (safeB * py) / db;
    const g = ra * ra + rb * rb - 1;
    if (Math.abs(g) <= 1e-12 || Math.abs(hi - lo) <= 1e-12) break;

    if (g > 0) lo = t;
    else hi = t;

    const dg = -2 * ((ra * ra) / da + (rb * rb) / db);
    const newtonNext = dg < -1e-18 ? t - g / dg : 0.5 * (lo + hi);
    t = newtonNext > lo && newtonNext < hi ? newtonNext : 0.5 * (lo + hi);
  }

  const qx = (a2 * px) / (t + a2);
  const qy = (b2 * py) / (t + b2);
  return { x: signX * qx, y: signY * qy };
}

/**
 * 회전된 타원 `(centerX, centerY, radiusX, radiusY, rotationDeg)` 위의 최근접점으로 점을 투영한다.
 */
export function projectPointOntoRotatedEllipse(
  ellipse: {
    readonly centerX: number;
    readonly centerY: number;
    readonly radiusX: number;
    readonly radiusY: number;
    readonly rotationDeg: number;
  },
  point: RulerPoint2D,
): RulerPoint2D | null {
  if (
    !Number.isFinite(ellipse.centerX) ||
    !Number.isFinite(ellipse.centerY) ||
    !Number.isFinite(ellipse.radiusX) ||
    !Number.isFinite(ellipse.radiusY) ||
    ellipse.radiusX <= 0 ||
    ellipse.radiusY <= 0 ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y)
  ) {
    return null;
  }

  const rad = ((Number.isFinite(ellipse.rotationDeg) ? ellipse.rotationDeg : 0) * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);

  const dx = point.x - ellipse.centerX;
  const dy = point.y - ellipse.centerY;
  const localX = dx * cosR + dy * sinR;
  const localY = -dx * sinR + dy * cosR;

  const closest = closestPointOnCanonicalEllipse(ellipse.radiusX, ellipse.radiusY, localX, localY);
  return {
    x: ellipse.centerX + closest.x * cosR - closest.y * sinR,
    y: ellipse.centerY + closest.x * sinR + closest.y * cosR,
  };
}

/**
 * 동심 타원 특수 자(`concentric-ellipse`) 스냅 세션을 시작한다.
 * 획 시작점 `start`를 지나는 동심 배율 `k`를 고정하여 이후 획 전체가 해당 타원 궤도를 따르게 한다.
 */
export function beginConcentricEllipseSnapSession(
  ruler: ConcentricEllipseRulerSpec,
  start: RulerPoint2D,
): ConcentricEllipseSnapSession | null {
  if (ruler.radiusX <= 0 || ruler.radiusY <= 0) return null;
  const rad = ((Number.isFinite(ruler.rotationDeg) ? ruler.rotationDeg : 0) * Math.PI) / 180;
  const cosRot = Math.cos(rad);
  const sinRot = Math.sin(rad);
  const dx = start.x - ruler.centerX;
  const dy = start.y - ruler.centerY;
  const lx = dx * cosRot + dy * sinRot;
  const ly = -dx * sinRot + dy * cosRot;

  const scale = Math.hypot(lx / ruler.radiusX, ly / ruler.radiusY);
  if (!Number.isFinite(scale) || scale <= 1e-6) return null;

  return {
    ruler,
    scaledRx: ruler.radiusX * scale,
    scaledRy: ruler.radiusY * scale,
    cosRot,
    sinRot,
  };
}

export function snapConcentricEllipsePoint(
  session: ConcentricEllipseSnapSession,
  target: RulerPoint2D,
): { session: ConcentricEllipseSnapSession; point: RulerPoint2D } | null {
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return null;
  const dx = target.x - session.ruler.centerX;
  const dy = target.y - session.ruler.centerY;
  const lx = dx * session.cosRot + dy * session.sinRot;
  const ly = -dx * session.sinRot + dy * session.cosRot;

  const closest = closestPointOnCanonicalEllipse(session.scaledRx, session.scaledRy, lx, ly);
  return {
    session,
    point: {
      x: session.ruler.centerX + closest.x * session.cosRot - closest.y * session.sinRot,
      y: session.ruler.centerY + closest.x * session.sinRot + closest.y * session.cosRot,
    },
  };
}

interface PolylineProjection {
  readonly x: number;
  readonly y: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly signedOffset: number;
  readonly distance: number;
}

/**
 * 열린/닫힌 폴리라인 위의 최근접점과 부드럽게 보간된 단위 법선·부호 있는 오프셋을 계산한다.
 */
export function projectPointOntoPolylineRuler(
  points: readonly RulerPoint2D[],
  closed: boolean,
  target: RulerPoint2D,
): PolylineProjection | null {
  const n = points.length;
  if (n < 2 || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return null;
  const segCount = closed ? n : n - 1;

  // 정점별 평균 단위 법선 계산(평행 곡선 오프셋이 꼭짓점에서 튀지 않도록 보간)
  const segNormals: RulerPoint2D[] = [];
  for (let i = 0; i < segCount; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len = Math.hypot(vx, vy);
    segNormals.push(len > 1e-9 ? { x: -vy / len, y: vx / len } : { x: 0, y: -1 });
  }

  const vertexNormals: RulerPoint2D[] = new Array<RulerPoint2D>(n);
  for (let i = 0; i < n; i++) {
    if (!closed && i === 0) {
      vertexNormals[i] = segNormals[0]!;
    } else if (!closed && i === n - 1) {
      vertexNormals[i] = segNormals[segCount - 1]!;
    } else {
      const nPrev = segNormals[(i - 1 + segCount) % segCount]!;
      const nCurr = segNormals[i % segCount]!;
      const sx = nPrev.x + nCurr.x;
      const sy = nPrev.y + nCurr.y;
      const sLen = Math.hypot(sx, sy);
      vertexNormals[i] = sLen > 1e-6 ? { x: sx / sLen, y: sy / sLen } : nCurr;
    }
  }

  let best: PolylineProjection | null = null;
  for (let i = 0; i < segCount; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const lenSq = vx * vx + vy * vy;
    if (lenSq <= 1e-12) continue;

    const t = clamp(((target.x - a.x) * vx + (target.y - a.y) * vy) / lenSq, 0, 1);
    const px = a.x + vx * t;
    const py = a.y + vy * t;
    const dx = target.x - px;
    const dy = target.y - py;
    const dist = Math.hypot(dx, dy);

    if (!best || dist < best.distance) {
      const na = vertexNormals[i]!;
      const nb = vertexNormals[(i + 1) % n]!;
      const rnx = na.x + (nb.x - na.x) * t;
      const rny = na.y + (nb.y - na.y) * t;
      const rnLen = Math.hypot(rnx, rny);
      const nx = rnLen > 1e-9 ? rnx / rnLen : segNormals[i]!.x;
      const ny = rnLen > 1e-9 ? rny / rnLen : segNormals[i]!.y;
      const signedOffset = dx * nx + dy * ny;
      best = { x: px, y: py, normalX: nx, normalY: ny, signedOffset, distance: dist };
    }
  }

  return best;
}

export function beginParallelCurveSnapSession(
  ruler: ParallelCurveRulerSpec,
  start: RulerPoint2D,
): ParallelCurveSnapSession | null {
  const proj = projectPointOntoPolylineRuler(ruler.points, Boolean(ruler.closed), start);
  if (!proj) return null;
  return {
    ruler,
    signedNormalOffset: proj.signedOffset,
  };
}

export function snapParallelCurvePoint(
  session: ParallelCurveSnapSession,
  target: RulerPoint2D,
): { session: ParallelCurveSnapSession; point: RulerPoint2D } | null {
  const proj = projectPointOntoPolylineRuler(
    session.ruler.points,
    Boolean(session.ruler.closed),
    target,
  );
  if (!proj) return null;
  return {
    session,
    point: {
      x: proj.x + proj.normalX * session.signedNormalOffset,
      y: proj.y + proj.normalY * session.signedNormalOffset,
    },
  };
}

function buildFigureVertices(ruler: FigureRulerSpec): { points: RulerPoint2D[]; closed: boolean } {
  if (ruler.vertices && ruler.vertices.length >= 2) {
    return {
      points: [...ruler.vertices],
      closed: ruler.closed ?? ruler.shape !== "polyline",
    };
  }
  const rad = ((ruler.rotationDeg ?? 0) * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const toWorld = (lx: number, ly: number): RulerPoint2D => ({
    x: ruler.centerX + lx * cosR - ly * sinR,
    y: ruler.centerY + lx * sinR + ly * cosR,
  });

  if (ruler.shape === "line") {
    return {
      points: [toWorld(-ruler.radiusX, 0), toWorld(ruler.radiusX, 0)],
      closed: false,
    };
  }
  if (ruler.shape === "rectangle") {
    return {
      points: [
        toWorld(-ruler.radiusX, -ruler.radiusY),
        toWorld(ruler.radiusX, -ruler.radiusY),
        toWorld(ruler.radiusX, ruler.radiusY),
        toWorld(-ruler.radiusX, ruler.radiusY),
      ],
      closed: true,
    };
  }

  const sides = clamp(Math.round(ruler.sides ?? 6), 3, 64);
  const pts: RulerPoint2D[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
    pts.push(toWorld(Math.cos(a) * ruler.radiusX, Math.sin(a) * ruler.radiusY));
  }
  return { points: pts, closed: true };
}

/**
 * 도형 자(`Figure ruler`) 위의 정확한 외곽 경계로 포인터 좌표를 스냅한다.
 */
export function snapFigureRulerPoint(
  ruler: FigureRulerSpec,
  target: RulerPoint2D,
): RulerPoint2D | null {
  if (ruler.shape === "ellipse") {
    return projectPointOntoRotatedEllipse(
      {
        centerX: ruler.centerX,
        centerY: ruler.centerY,
        radiusX: ruler.radiusX,
        radiusY: ruler.radiusY,
        rotationDeg: ruler.rotationDeg ?? 0,
      },
      target,
    );
  }
  const contour = buildFigureVertices(ruler);
  const proj = projectPointOntoPolylineRuler(contour.points, contour.closed, target);
  return proj ? { x: proj.x, y: proj.y } : null;
}

/**
 * CSP `벡터에서 자 작성(layermakerulerfromvector)`:
 * 벡터 `DrawEl`의 중심선 정점을 정제하여 `parallel-curve` 또는 `figure(polyline)` 자를 생성한다.
 */
export function createRulerFromVectorStroke(
  stroke: Pick<DrawEl, "id" | "points">,
  options?: CreateRulerFromVectorOptions,
): ParallelCurveRulerSpec | FigureRulerSpec | null {
  const n = Math.floor(stroke.points.length / 2);
  if (n < 2) return null;

  const minStep = Math.max(0.1, options?.simplifyTolerancePx ?? 1.0);
  const closeThreshold = Math.max(0, options?.closeThresholdPx ?? 4.0);

  const cleaned: RulerPoint2D[] = [];
  for (let i = 0; i < n; i++) {
    const x = stroke.points[i * 2]!;
    const y = stroke.points[i * 2 + 1]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const prev = cleaned.at(-1);
    if (!prev || i === n - 1 || Math.hypot(x - prev.x, y - prev.y) >= minStep) {
      cleaned.push({ x, y });
    }
  }
  if (cleaned.length < 2) return null;

  const first = cleaned[0]!;
  const last = cleaned[cleaned.length - 1]!;
  const closed = cleaned.length >= 3 && Math.hypot(last.x - first.x, last.y - first.y) <= closeThreshold;
  const vertices = closed ? cleaned.slice(0, -1) : cleaned;
  if (vertices.length < 2) return null;

  if (options?.rulerKind === "figure") {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of vertices) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      id: `ruler-from-${stroke.id}`,
      type: "figure",
      shape: "polyline",
      centerX: 0.5 * (minX + maxX),
      centerY: 0.5 * (minY + maxY),
      radiusX: Math.max(1, 0.5 * (maxX - minX)),
      radiusY: Math.max(1, 0.5 * (maxY - minY)),
      vertices,
      closed,
    };
  }

  return {
    id: `ruler-from-${stroke.id}`,
    type: "parallel-curve",
    points: vertices,
    closed,
  };
}
