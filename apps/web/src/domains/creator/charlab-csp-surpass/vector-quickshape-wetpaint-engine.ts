/**
 * Wave 39E — CSP / Procreate / Rebelle 클린룸 돌파 드로잉 통합 엔진.
 *
 * - CSP 돌파: 2D 선분 교차 수학 기반 벡터 교차점 지우개 + 3D LT 3층(외곽선·그림자·스크린톤) 추출
 * - Procreate 돌파(재수출): QuickShape 자석 도형 스냅 + ColorDrop 틈새 닫기·할로 방지
 * - Rebelle 돌파(재수출): 기기 기울기 (gx, gy) 중력 수채화 이류 + 1클릭 blowDry() 드라이어
 */

import type { Vec3 } from "./character-live-link-engine";
import type { Vec2 } from "./quickshape-colordrop-engine";

export * from "./quickshape-colordrop-engine";
export * from "./gravity-watercolor-engine";

export interface VectorStroke {
  readonly id: string;
  readonly points: readonly Vec2[];
  readonly widthPx: number;
  readonly closed?: boolean;
}

export type VectorEraseActionKind =
  | "trimmed-start-tail"
  | "trimmed-end-tail"
  | "split-between-intersections"
  | "removed-whole"
  | "miss";

export interface VectorIntersectionEraseResult {
  readonly strokes: readonly VectorStroke[];
  readonly trimmedStrokeId: string | null;
  readonly actionKind: VectorEraseActionKind;
  readonly removedSegmentLengthPx: number;
  readonly intersectionPoints: readonly Vec2[];
}

export interface LtMesh3d {
  readonly name: string;
  readonly vertices: readonly Vec3[];
  readonly triangles: readonly (readonly [number, number, number])[];
}

export interface LtCameraConfig {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly fovDeg: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export interface LtExtractionConfig {
  readonly camera: LtCameraConfig;
  readonly keyLightDir: Vec3;
  readonly creaseAngleDeg?: number;
  readonly shadowThreshold?: number;
  readonly midtoneThreshold?: number;
  readonly screentoneLpi?: number;
  readonly screentoneAngleDeg?: number;
}

export interface LtOutlineEdge2d {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly kind: "silhouette" | "crease" | "boundary";
  readonly widthPx: number;
  readonly depth: number;
}

export interface LtShadowPolygon2d {
  readonly points: readonly [Vec2, Vec2, Vec2];
  readonly band: "core" | "penumbra";
  readonly nDotL: number;
  readonly areaPx2: number;
}

export interface LtScreentoneDot {
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly density: number;
}

export interface ThreeLayerLtExtractionResult {
  readonly outlineLayer: {
    readonly edges: readonly LtOutlineEdge2d[];
    readonly silhouetteCount: number;
    readonly creaseCount: number;
  };
  readonly shadowLayer: {
    readonly polygons: readonly LtShadowPolygon2d[];
    readonly coreCount: number;
    readonly penumbraCount: number;
    readonly shadowAreaRatio: number;
  };
  readonly screentoneLayer: {
    readonly dots: readonly LtScreentoneDot[];
    readonly lpi: number;
    readonly angleDeg: number;
    readonly averageDensity: number;
  };
}

const EPS = 1e-9;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function roundTo(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function dist2d(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cross2d(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** 2D 선분 (a1->a2)과 (b1->b2)의 정확한 매개변수 교차점 계산. */
export function intersectSegments2d(
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2,
): { readonly t: number; readonly u: number; readonly point: Vec2 } | null {
  const rx = a2.x - a1.x;
  const ry = a2.y - a1.y;
  const sx = b2.x - b1.x;
  const sy = b2.y - b1.y;
  const denom = cross2d(rx, ry, sx, sy);
  if (Math.abs(denom) < EPS) return null;
  const qpx = b1.x - a1.x;
  const qpy = b1.y - a1.y;
  const t = cross2d(qpx, qpy, sx, sy) / denom;
  const u = cross2d(qpx, qpy, rx, ry) / denom;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  const ct = clamp(t, 0, 1);
  return { t: ct, u: clamp(u, 0, 1), point: { x: a1.x + ct * rx, y: a1.y + ct * ry } };
}

function cumulativeArcLengths(points: readonly Vec2[]): number[] {
  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    lengths.push(lengths[i - 1]! + dist2d(points[i - 1]!, points[i]!));
  }
  return lengths;
}

function projectPointToSegment(
  p: Vec2,
  a: Vec2,
  b: Vec2,
): { readonly t: number; readonly dist: number; readonly closest: Vec2 } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPS) return { t: 0, dist: dist2d(p, a), closest: a };
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
  const closest = { x: a.x + t * dx, y: a.y + t * dy };
  return { t, dist: dist2d(p, closest), closest };
}

function slicePolylineByArc(
  points: readonly Vec2[],
  arcLengths: readonly number[],
  sStart: number,
  sEnd: number,
): Vec2[] {
  const total = arcLengths[arcLengths.length - 1] ?? 0;
  const a = clamp(sStart, 0, total);
  const b = clamp(sEnd, 0, total);
  if (b - a < 0.25 || points.length < 2) return [];

  const sampleAt = (s: number): Vec2 => {
    for (let i = 0; i < points.length - 1; i += 1) {
      const s0 = arcLengths[i]!;
      const s1 = arcLengths[i + 1]!;
      if (s <= s1 + 1e-6 || i === points.length - 2) {
        const ratio = clamp((s - s0) / Math.max(EPS, s1 - s0), 0, 1);
        const p0 = points[i]!;
        const p1 = points[i + 1]!;
        return { x: p0.x + (p1.x - p0.x) * ratio, y: p0.y + (p1.y - p0.y) * ratio };
      }
    }
    return points[points.length - 1]!;
  };

  const out: Vec2[] = [sampleAt(a)];
  for (let i = 1; i < points.length - 1; i += 1) {
    const s = arcLengths[i]!;
    if (s > a + 1e-4 && s < b - 1e-4) out.push(points[i]!);
  }
  out.push(sampleAt(b));
  return out;
}

/** CSP 돌파: 클릭한 잉여 꼬리 선분을 가장 가까운 교차점까지만 정확히 절단하는 벡터 교차점 지우개. */
export function eraseVectorTailToIntersection(
  strokes: readonly VectorStroke[],
  clickPoint: Vec2,
  pickRadiusPx = 18,
): VectorIntersectionEraseResult {
  let pickedIndex = -1;
  let bestDist = pickRadiusPx;
  let clickArcS = 0;

  for (let si = 0; si < strokes.length; si += 1) {
    const stroke = strokes[si]!;
    if (stroke.points.length < 2) continue;
    const arcs = cumulativeArcLengths(stroke.points);
    for (let i = 0; i < stroke.points.length - 1; i += 1) {
      const proj = projectPointToSegment(clickPoint, stroke.points[i]!, stroke.points[i + 1]!);
      if (proj.dist < bestDist) {
        bestDist = proj.dist;
        pickedIndex = si;
        clickArcS = arcs[i]! + proj.t * (arcs[i + 1]! - arcs[i]!);
      }
    }
  }

  if (pickedIndex < 0) {
    return { strokes, trimmedStrokeId: null, actionKind: "miss", removedSegmentLengthPx: 0, intersectionPoints: [] };
  }

  const target = strokes[pickedIndex]!;
  const targetArcs = cumulativeArcLengths(target.points);
  const totalLen = targetArcs[targetArcs.length - 1] ?? 0;

  const hits: { readonly s: number; readonly point: Vec2 }[] = [];
  for (let i = 0; i < target.points.length - 1; i += 1) {
    const segLen = targetArcs[i + 1]! - targetArcs[i]!;
    for (let oi = 0; oi < strokes.length; oi += 1) {
      const other = strokes[oi]!;
      for (let j = 0; j < other.points.length - 1; j += 1) {
        if (oi === pickedIndex && Math.abs(i - j) <= 1) continue;
        const hit = intersectSegments2d(target.points[i]!, target.points[i + 1]!, other.points[j]!, other.points[j + 1]!);
        if (!hit) continue;
        const sVal = targetArcs[i]! + hit.t * segLen;
        if (sVal > 1e-3 && sVal < totalLen - 1e-3) hits.push({ s: sVal, point: hit.point });
      }
    }
  }

  hits.sort((a, b) => a.s - b.s);
  const uniqueHits: { readonly s: number; readonly point: Vec2 }[] = [];
  for (const h of hits) {
    const prev = uniqueHits[uniqueHits.length - 1];
    if (!prev || h.s - prev.s > 1e-3) uniqueHits.push(h);
  }

  if (uniqueHits.length === 0) {
    return {
      strokes: strokes.filter((_, idx) => idx !== pickedIndex),
      trimmedStrokeId: target.id,
      actionKind: "removed-whole",
      removedSegmentLengthPx: roundTo(totalLen, 3),
      intersectionPoints: [],
    };
  }

  const firstHit = uniqueHits[0]!;
  const lastHit = uniqueHits[uniqueHits.length - 1]!;
  const nextStrokes = strokes.filter((_, idx) => idx !== pickedIndex);

  if (clickArcS <= firstHit.s) {
    const kept = slicePolylineByArc(target.points, targetArcs, firstHit.s, totalLen);
    if (kept.length >= 2) nextStrokes.splice(pickedIndex, 0, { ...target, points: kept });
    return {
      strokes: nextStrokes,
      trimmedStrokeId: target.id,
      actionKind: "trimmed-start-tail",
      removedSegmentLengthPx: roundTo(firstHit.s, 3),
      intersectionPoints: [firstHit.point],
    };
  }

  if (clickArcS >= lastHit.s) {
    const kept = slicePolylineByArc(target.points, targetArcs, 0, lastHit.s);
    if (kept.length >= 2) nextStrokes.splice(pickedIndex, 0, { ...target, points: kept });
    return {
      strokes: nextStrokes,
      trimmedStrokeId: target.id,
      actionKind: "trimmed-end-tail",
      removedSegmentLengthPx: roundTo(totalLen - lastHit.s, 3),
      intersectionPoints: [lastHit.point],
    };
  }

  let prevHit = firstHit;
  let nextHit = lastHit;
  for (let k = 0; k < uniqueHits.length - 1; k += 1) {
    const cur = uniqueHits[k]!;
    const nxt = uniqueHits[k + 1]!;
    if (clickArcS >= cur.s && clickArcS <= nxt.s) {
      prevHit = cur;
      nextHit = nxt;
      break;
    }
  }

  const leftPts = slicePolylineByArc(target.points, targetArcs, 0, prevHit.s);
  const rightPts = slicePolylineByArc(target.points, targetArcs, nextHit.s, totalLen);
  const inserts: VectorStroke[] = [];
  if (leftPts.length >= 2) inserts.push({ ...target, id: `${target.id}-a`, points: leftPts });
  if (rightPts.length >= 2) inserts.push({ ...target, id: `${target.id}-b`, points: rightPts });
  nextStrokes.splice(pickedIndex, 0, ...inserts);

  return {
    strokes: nextStrokes,
    trimmedStrokeId: target.id,
    actionKind: "split-between-intersections",
    removedSegmentLengthPx: roundTo(nextHit.s - prevHit.s, 3),
    intersectionPoints: [prevHit.point, nextHit.point],
  };
}

/** 데모용 잉여 꼬리가 튀어나온 건축 창틀 벡터 스트로크 세트. */
export function createDemoOverhangingVectorStrokes(): readonly VectorStroke[] {
  return [
    { id: "top-bar", widthPx: 2.5, points: [{ x: 24, y: 48 }, { x: 216, y: 48 }] },
    { id: "bottom-bar", widthPx: 2.5, points: [{ x: 24, y: 152 }, { x: 216, y: 152 }] },
    { id: "left-pillar", widthPx: 2.5, points: [{ x: 56, y: 16 }, { x: 56, y: 184 }] },
    { id: "right-pillar", widthPx: 2.5, points: [{ x: 184, y: 16 }, { x: 184, y: 184 }] },
  ];
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm3 = (v: Vec3): Vec3 => {
  const l = Math.hypot(v.x, v.y, v.z);
  return l < EPS ? { x: 0, y: 1, z: 0 } : { x: v.x / l, y: v.y / l, z: v.z / l };
};

function buildBoxMesh(
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  o: number,
): { readonly verts: Vec3[]; readonly tris: [number, number, number][] } {
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  return {
    verts: [
      { x: cx - hx, y: cy - hy, z: cz + hz },
      { x: cx + hx, y: cy - hy, z: cz + hz },
      { x: cx + hx, y: cy + hy, z: cz + hz },
      { x: cx - hx, y: cy + hy, z: cz + hz },
      { x: cx - hx, y: cy - hy, z: cz - hz },
      { x: cx + hx, y: cy - hy, z: cz - hz },
      { x: cx + hx, y: cy + hy, z: cz - hz },
      { x: cx - hx, y: cy + hy, z: cz - hz },
    ],
    tris: [
      [o, o + 1, o + 2], [o, o + 2, o + 3],
      [o + 5, o + 4, o + 7], [o + 5, o + 7, o + 6],
      [o + 4, o, o + 3], [o + 4, o + 3, o + 7],
      [o + 1, o + 5, o + 6], [o + 1, o + 6, o + 2],
      [o + 3, o + 2, o + 6], [o + 3, o + 6, o + 7],
      [o + 4, o + 5, o + 1], [o + 4, o + 1, o],
    ],
  };
}

/** 3D LT 3층 추출 데모용 다단 건축 메쉬(타워 + 포디움 + 난간, 24정점 36삼각형). */
export function createDemoLtArchitectureMesh(): LtMesh3d {
  const b1 = buildBoxMesh(0, 1.1, 0, 1.4, 2.2, 1.2, 0);
  const b2 = buildBoxMesh(-0.9, 0.45, 0.35, 1.0, 0.9, 0.9, 8);
  const b3 = buildBoxMesh(0.2, 2.35, 0, 0.9, 0.3, 0.8, 16);
  return {
    name: "atelier-rooftop-tower",
    vertices: [...b1.verts, ...b2.verts, ...b3.verts],
    triangles: [...b1.tris, ...b2.tris, ...b3.tris],
  };
}

function pointInTriangle2d(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const s1 = cross2d(b.x - a.x, b.y - a.y, p.x - a.x, p.y - a.y);
  const s2 = cross2d(c.x - b.x, c.y - b.y, p.x - b.x, p.y - b.y);
  const s3 = cross2d(a.x - c.x, a.y - c.y, p.x - c.x, p.y - c.y);
  return !((s1 < 0 || s2 < 0 || s3 < 0) && (s1 > 0 || s2 > 0 || s3 > 0));
}

/** 3D 메쉬에서 외곽선(실루엣·크리즈) + 그림자(코어·반음영) + 스크린톤(하프톤 도트) 3층 자동 추출. */
export function extractThreeLayerLtFromMesh(
  mesh: LtMesh3d,
  config: LtExtractionConfig,
): ThreeLayerLtExtractionResult {
  const { camera } = config;
  const lightDir = norm3(config.keyLightDir);
  const creaseCos = Math.cos(((config.creaseAngleDeg ?? 32) * Math.PI) / 180);
  const shadowThreshold = config.shadowThreshold ?? 0.22;
  const midtoneThreshold = config.midtoneThreshold ?? 0.58;
  const lpi = clamp(config.screentoneLpi ?? 60, 20, 120);
  const angleDeg = config.screentoneAngleDeg ?? 45;

  const forward = norm3(sub3(camera.target, camera.position));
  const right = norm3(cross3(forward, { x: 0, y: 1, z: 0 }));
  const up = cross3(right, forward);
  const focal = (camera.viewportHeight * 0.5) / Math.tan(((camera.fovDeg * 0.5) * Math.PI) / 180);

  const projected = mesh.vertices.map((v) => {
    const rel = sub3(v, camera.position);
    const cz = Math.max(0.15, dot3(rel, forward));
    return {
      pt: {
        x: camera.viewportWidth * 0.5 + (dot3(rel, right) * focal) / cz,
        y: camera.viewportHeight * 0.5 - (dot3(rel, up) * focal) / cz,
      },
      depth: cz,
    };
  });

  const triInfos = mesh.triangles.map((tri) => {
    const v0 = mesh.vertices[tri[0]]!;
    const v1 = mesh.vertices[tri[1]]!;
    const v2 = mesh.vertices[tri[2]]!;
    const normal = norm3(cross3(sub3(v1, v0), sub3(v2, v0)));
    const center = { x: (v0.x + v1.x + v2.x) / 3, y: (v0.y + v1.y + v2.y) / 3, z: (v0.z + v1.z + v2.z) / 3 };
    return {
      tri,
      normal,
      frontFacing: dot3(normal, norm3(sub3(camera.position, center))) > 0,
      nDotL: dot3(normal, lightDir),
    };
  });

  const edgeMap = new Map<string, { readonly a: number; readonly b: number; readonly faces: number[] }>();
  for (let ti = 0; ti < triInfos.length; ti += 1) {
    const [i0, i1, i2] = triInfos[ti]!.tri;
    for (const [u, v] of [[i0, i1], [i1, i2], [i2, i0]] as const) {
      const lo = Math.min(u, v);
      const hi = Math.max(u, v);
      const key = `${lo}:${hi}`;
      const existing = edgeMap.get(key);
      if (existing) existing.faces.push(ti);
      else edgeMap.set(key, { a: lo, b: hi, faces: [ti] });
    }
  }

  const outlineEdges: LtOutlineEdge2d[] = [];
  let silhouetteCount = 0;
  let creaseCount = 0;
  for (const edge of edgeMap.values()) {
    const pA = projected[edge.a]!;
    const pB = projected[edge.b]!;
    const avgDepth = (pA.depth + pB.depth) * 0.5;
    const widthPx = roundTo(clamp(6.8 / Math.max(1.2, avgDepth), 0.9, 3.4), 2);
    if (edge.faces.length === 1 && triInfos[edge.faces[0]!]!.frontFacing) {
      outlineEdges.push({ from: pA.pt, to: pB.pt, kind: "boundary", widthPx, depth: roundTo(avgDepth, 3) });
    } else if (edge.faces.length >= 2) {
      const f0 = triInfos[edge.faces[0]!]!;
      const f1 = triInfos[edge.faces[1]!]!;
      if (f0.frontFacing !== f1.frontFacing) {
        silhouetteCount += 1;
        outlineEdges.push({ from: pA.pt, to: pB.pt, kind: "silhouette", widthPx: roundTo(widthPx * 1.2, 2), depth: roundTo(avgDepth, 3) });
      } else if (f0.frontFacing && f1.frontFacing && dot3(f0.normal, f1.normal) < creaseCos) {
        creaseCount += 1;
        outlineEdges.push({ from: pA.pt, to: pB.pt, kind: "crease", widthPx, depth: roundTo(avgDepth, 3) });
      }
    }
  }

  const shadowPolygons: LtShadowPolygon2d[] = [];
  let coreCount = 0;
  let penumbraCount = 0;
  let totalFrontArea = 0;
  let totalShadowArea = 0;
  for (const info of triInfos) {
    if (!info.frontFacing) continue;
    const [i0, i1, i2] = info.tri;
    const p0 = projected[i0]!.pt;
    const p1 = projected[i1]!.pt;
    const p2 = projected[i2]!.pt;
    const areaPx2 = Math.abs(cross2d(p1.x - p0.x, p1.y - p0.y, p2.x - p0.x, p2.y - p0.y)) * 0.5;
    totalFrontArea += areaPx2;
    if (info.nDotL < midtoneThreshold) {
      const band = info.nDotL < shadowThreshold ? "core" : "penumbra";
      if (band === "core") coreCount += 1;
      else penumbraCount += 1;
      totalShadowArea += areaPx2;
      shadowPolygons.push({ points: [p0, p1, p2], band, nDotL: roundTo(info.nDotL, 3), areaPx2: roundTo(areaPx2, 2) });
    }
  }

  const pitchPx = clamp(420 / lpi, 4.5, 16);
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const dots: LtScreentoneDot[] = [];
  const halfDiag = Math.hypot(camera.viewportWidth, camera.viewportHeight) * 0.55;
  const cx = camera.viewportWidth * 0.5;
  const cy = camera.viewportHeight * 0.5;

  for (let u = -halfDiag; u <= halfDiag; u += pitchPx) {
    for (let v = -halfDiag; v <= halfDiag; v += pitchPx) {
      const sx = cx + u * cosA - v * sinA;
      const sy = cy + u * sinA + v * cosA;
      if (sx < 0 || sx > camera.viewportWidth || sy < 0 || sy > camera.viewportHeight) continue;
      for (const poly of shadowPolygons) {
        if (pointInTriangle2d({ x: sx, y: sy }, poly.points[0], poly.points[1], poly.points[2])) {
          const density = clamp(0.85 - poly.nDotL * 0.65, 0.18, 0.88);
          dots.push({
            x: roundTo(sx, 2),
            y: roundTo(sy, 2),
            radiusPx: roundTo(pitchPx * 0.44 * Math.sqrt(density), 2),
            density: roundTo(density, 3),
          });
          break;
        }
      }
    }
  }

  return {
    outlineLayer: { edges: outlineEdges, silhouetteCount, creaseCount },
    shadowLayer: {
      polygons: shadowPolygons,
      coreCount,
      penumbraCount,
      shadowAreaRatio: roundTo(totalFrontArea > 0 ? totalShadowArea / totalFrontArea : 0, 3),
    },
    screentoneLayer: {
      dots,
      lpi,
      angleDeg,
      averageDensity: roundTo(dots.length === 0 ? 0 : dots.reduce((a, d) => a + d.density, 0) / dots.length, 3),
    },
  };
}
