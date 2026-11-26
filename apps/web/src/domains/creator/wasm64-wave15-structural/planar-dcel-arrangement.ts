/**
 * 반간선 평면 분할(DCEL / Half-Edge Planar Map) 빈틈 제로 채색 커널.
 *
 * - 교차·언더슛 선화 중심선 세그먼트를 스냅 및 평면 분할하여 닫힌 유계 면(Bounded Face)을 추출한다.
 * - 부호 있는 신발끈 면적(Signed Shoelace Area)으로 외곽 무한 경계(음수 면적)와 내부 채색 면(양수 면적)을 분리하고,
 *   중첩 고립 구멍(예: 얼굴 윤곽 내부의 눈 윤곽)을 최소 감싸는 유계 면의 구멍(holes)으로 귀속시킨다.
 * - 선화 정점을 변형하거나 선 두께를 변경해도 영구 위상 면 ID와 채색 상태를 계승하며 흰색 틈새 픽셀 0개를 보장한다.
 */

export interface Point2D { readonly x: number; readonly y: number }
export interface RgbaColor { readonly r: number; readonly g: number; readonly b: number; readonly a: number }

export interface PlanarStrokeInput {
  readonly strokeId: string;
  readonly points: readonly Point2D[];
  readonly width: number;
  readonly colorRgba?: RgbaColor;
}

export interface PlanarVertex {
  readonly vertexId: number;
  readonly x: number;
  readonly y: number;
  readonly outgoingHalfEdgeIds: readonly number[];
}

export interface PlanarHalfEdge {
  readonly halfEdgeId: number;
  readonly originVertexId: number;
  readonly targetVertexId: number;
  readonly twinHalfEdgeId: number;
  readonly nextHalfEdgeId: number;
  readonly prevHalfEdgeId: number;
  readonly incidentFaceId: string | null;
  readonly strokeIds: readonly string[];
  readonly angleRad: number;
}

export interface PlanarBoundedFace {
  readonly faceId: string;
  readonly topologicalSignature: string;
  readonly boundaryHalfEdgeIds: readonly number[];
  readonly outerPolygon: readonly Point2D[];
  readonly holes: readonly (readonly Point2D[])[];
  readonly signedArea: number;
  readonly area: number;
  readonly centroid: Point2D;
  readonly interiorSample: Point2D;
  readonly incidentStrokeIds: readonly string[];
  readonly neighborFaceIds: readonly string[];
}

export interface PlanarOuterCycle {
  readonly halfEdgeIds: readonly number[];
  readonly polygon: readonly Point2D[];
  readonly signedArea: number;
}

export interface PlanarArrangement {
  readonly vertices: readonly PlanarVertex[];
  readonly halfEdges: readonly PlanarHalfEdge[];
  readonly boundedFaces: readonly PlanarBoundedFace[];
  readonly outerBoundaryCycles: readonly PlanarOuterCycle[];
  readonly faceColors: ReadonlyMap<string, RgbaColor>;
}

export interface BuildPlanarArrangementOptions {
  readonly snapTolerance?: number;
  readonly mergeEpsilon?: number;
  readonly minFaceArea?: number;
  readonly previousArrangement?: PlanarArrangement;
  readonly initialFaceColors?: ReadonlyMap<string, RgbaColor>;
}

export interface PlanarRasterizeOptions {
  readonly width: number;
  readonly height: number;
  readonly backgroundRgba?: RgbaColor;
  readonly renderStrokes?: boolean;
  readonly strokeWidthScale?: number;
}

export interface PlanarRasterizeReport {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly faceOwnerPerPixel: Int32Array;
  readonly filledPixelCount: number;
  readonly strokePixelCount: number;
  readonly interiorGapPixelCount: number;
}

interface RawSegment { readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number; readonly strokeId: string }

interface DraftFace {
  topologicalSignature: string;
  boundaryHalfEdgeIds: number[];
  outerPolygon: Point2D[];
  holes: Point2D[][];
  signedArea: number;
  area: number;
  centroid: Point2D;
  interiorSample: Point2D;
  incidentStrokeIds: string[];
}

const DEFAULT_INK_COLOR: RgbaColor = { r: 24, g: 24, b: 28, a: 255 };
const DEFAULT_CANVAS_BG: RgbaColor = { r: 255, g: 255, b: 255, a: 255 };

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function distSq2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function projectPointToSegment2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { readonly t: number; readonly x: number; readonly y: number; readonly distSq: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-12) return { t: 0, x: ax, y: ay, distSq: distSq2(px, py, ax, ay) };
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  const x = ax + dx * t;
  const y = ay + dy * t;
  return { t, x, y, distSq: distSq2(px, py, x, y) };
}

/**
 * 다각형의 부호 있는 신발끈 면적(Signed Shoelace Area)을 계산한다.
 * 데카르트 반시계(CCW) 내부 루프는 양수, 외곽 시계(CW) 루프는 음수를 반환한다.
 */
export function computeSignedShoelaceArea(polygon: readonly Point2D[]): number {
  const n = polygon.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % n]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

/**
 * 반열린 수평 스캔라인 규칙으로 점이 다각형 링 내부에 속하는지 판정한다.
 * 공유 반간선을 사이에 둔 인접 면들이 경계 픽셀을 중복·누락 없이 배타 분할한다.
 */
export function isPointInRingHalfOpen(px: number, py: number, ring: readonly Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const pi = ring[i]!;
    const pj = ring[j]!;
    if ((pi.y > py) !== (pj.y > py)) {
      const intersectX = pi.x + ((py - pi.y) * (pj.x - pi.x)) / (pj.y - pi.y);
      if (px < intersectX) inside = !inside;
    }
  }
  return inside;
}

export function isPointInBoundedFace(
  px: number,
  py: number,
  face: Pick<PlanarBoundedFace, "outerPolygon" | "holes">,
): boolean {
  if (!isPointInRingHalfOpen(px, py, face.outerPolygon)) return false;
  for (const hole of face.holes) {
    if (isPointInRingHalfOpen(px, py, hole)) return false;
  }
  return true;
}

function pruneDanglingSpikes(points: readonly Point2D[], eps: number): Point2D[] {
  const epsSq = eps * eps;
  const stack: Point2D[] = [];
  for (const pt of points) {
    if (stack.length > 0 && distSq2(pt.x, pt.y, stack[stack.length - 1]!.x, stack[stack.length - 1]!.y) <= epsSq) {
      continue;
    }
    stack.push(pt);
    while (
      stack.length >= 3 &&
      distSq2(stack[stack.length - 1]!.x, stack[stack.length - 1]!.y, stack[stack.length - 3]!.x, stack[stack.length - 3]!.y) <= epsSq
    ) {
      stack.pop();
      stack.pop();
    }
  }
  while (stack.length >= 3) {
    const last = stack[stack.length - 1]!;
    if (distSq2(stack[0]!.x, stack[0]!.y, last.x, last.y) <= epsSq) {
      stack.pop();
    } else if (distSq2(stack[1]!.x, stack[1]!.y, last.x, last.y) <= epsSq) {
      stack.pop();
      stack.shift();
    } else {
      break;
    }
  }
  return stack;
}

function computePolygonCentroid(ring: readonly Point2D[]): Point2D {
  const n = ring.length;
  if (n === 0) return { x: 0, y: 0 };
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const cross = a.x * b.y - b.x * a.y;
    area2 += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(area2) <= 1e-9) {
    let sx = 0;
    let sy = 0;
    for (const p of ring) {
      sx += p.x;
      sy += p.y;
    }
    return { x: sx / n, y: sy / n };
  }
  return { x: cx / (3 * area2), y: cy / (3 * area2) };
}

function findGuaranteedInteriorSample(
  outerPolygon: readonly Point2D[],
  holes: readonly (readonly Point2D[])[],
  centroid: Point2D,
): Point2D {
  const faceRef = { outerPolygon, holes };
  if (isPointInBoundedFace(centroid.x, centroid.y, faceRef)) return centroid;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of outerPolygon) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  let bestPoint = centroid;
  let bestSpan = -1;
  const rings = [outerPolygon, ...holes];
  for (let step = 1; step <= 11; step += 1) {
    const scanY = minY + ((maxY - minY) * step) / 12;
    const xs: number[] = [];
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const a = ring[i]!;
        const b = ring[j]!;
        if ((a.y > scanY) !== (b.y > scanY)) {
          xs.push(a.x + ((scanY - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const span = xs[k + 1]! - xs[k]!;
      const midX = (xs[k]! + xs[k + 1]!) * 0.5;
      if (span > bestSpan && isPointInBoundedFace(midX, scanY, faceRef)) {
        bestSpan = span;
        bestPoint = { x: midX, y: scanY };
      }
    }
  }
  return bestPoint;
}

function snapStrokeEndpoints(strokes: readonly PlanarStrokeInput[], snapTolerance: number): RawSegment[] {
  const cloned = strokes.map((s) => ({ strokeId: s.strokeId, pts: s.points.map((p) => ({ x: p.x, y: p.y })) }));
  if (snapTolerance > 0) {
    const tolSq = snapTolerance * snapTolerance;
    for (let sIdx = 0; sIdx < cloned.length; sIdx += 1) {
      const pts = cloned[sIdx]!.pts;
      if (pts.length < 2) continue;
      if (pts.length >= 3 && distSq2(pts[0]!.x, pts[0]!.y, pts[pts.length - 1]!.x, pts[pts.length - 1]!.y) <= tolSq) {
        pts[pts.length - 1] = { x: pts[0]!.x, y: pts[0]!.y };
      }
      for (const endIdx of [0, pts.length - 1]) {
        const ep = pts[endIdx]!;
        let snapped: Point2D | null = null;
        let bestVDist = tolSq;
        for (let oIdx = 0; oIdx < cloned.length; oIdx += 1) {
          if (oIdx === sIdx) continue;
          for (const cand of cloned[oIdx]!.pts) {
            const dSq = distSq2(ep.x, ep.y, cand.x, cand.y);
            if (dSq <= bestVDist) {
              bestVDist = dSq;
              snapped = { x: cand.x, y: cand.y };
            }
          }
        }
        if (!snapped) {
          let bestPDist = tolSq;
          for (let oIdx = 0; oIdx < cloned.length; oIdx += 1) {
            if (oIdx === sIdx) continue;
            const oPts = cloned[oIdx]!.pts;
            for (let k = 0; k + 1 < oPts.length; k += 1) {
              const proj = projectPointToSegment2D(ep.x, ep.y, oPts[k]!.x, oPts[k]!.y, oPts[k + 1]!.x, oPts[k + 1]!.y);
              if (proj.distSq <= bestPDist) {
                bestPDist = proj.distSq;
                snapped = { x: proj.x, y: proj.y };
              }
            }
          }
        }
        if (snapped) pts[endIdx] = snapped;
      }
    }
  }
  const segments: RawSegment[] = [];
  for (const stroke of cloned) {
    for (let i = 0; i + 1 < stroke.pts.length; i += 1) {
      const a = stroke.pts[i]!;
      const b = stroke.pts[i + 1]!;
      if (distSq2(a.x, a.y, b.x, b.y) > 1e-10) {
        segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, strokeId: stroke.strokeId });
      }
    }
  }
  return segments;
}

function hashSignatureHex(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function assignPersistentFaceIdsAndColors(
  draftFaces: readonly DraftFace[],
  previousArrangement: PlanarArrangement | undefined,
  initialFaceColors: ReadonlyMap<string, RgbaColor> | undefined,
): { readonly faceIds: string[]; readonly faceColors: Map<string, RgbaColor> } {
  const assignedIds = new Array<string>(draftFaces.length).fill("");
  const faceColors = new Map<string, RgbaColor>(initialFaceColors);
  const usedIds = new Set<string>();

  if (previousArrangement && previousArrangement.boundedFaces.length > 0) {
    const oldFaces = previousArrangement.boundedFaces;
    const pairs: { oldIdx: number; newIdx: number; score: number }[] = [];
    for (let oIdx = 0; oIdx < oldFaces.length; oIdx += 1) {
      const oldFace = oldFaces[oIdx]!;
      const oldSet = new Set(oldFace.incidentStrokeIds);
      for (let nIdx = 0; nIdx < draftFaces.length; nIdx += 1) {
        const nextFace = draftFaces[nIdx]!;
        let score = 0;
        if (isPointInBoundedFace(oldFace.interiorSample.x, oldFace.interiorSample.y, nextFace)) score += 55;
        if (isPointInBoundedFace(nextFace.interiorSample.x, nextFace.interiorSample.y, oldFace)) score += 45;
        let inter = 0;
        const union = new Set(oldFace.incidentStrokeIds);
        for (const sid of nextFace.incidentStrokeIds) {
          if (oldSet.has(sid)) inter += 1;
          union.add(sid);
        }
        if (union.size > 0) score += (inter / union.size) * 40;
        const scaleLen = Math.sqrt(Math.max(oldFace.area, nextFace.area, 1));
        const dist = Math.sqrt(distSq2(oldFace.centroid.x, oldFace.centroid.y, nextFace.centroid.x, nextFace.centroid.y));
        score += 20 / (1 + dist / scaleLen);
        score += (Math.min(oldFace.area, nextFace.area) / Math.max(oldFace.area, nextFace.area, 1e-6)) * 10;
        if (score >= 30) pairs.push({ oldIdx: oIdx, newIdx: nIdx, score });
      }
    }
    pairs.sort((a, b) => b.score - a.score);
    const matchedOld = new Set<number>();
    const matchedNew = new Set<number>();
    for (const pair of pairs) {
      if (matchedOld.has(pair.oldIdx) || matchedNew.has(pair.newIdx)) continue;
      matchedOld.add(pair.oldIdx);
      matchedNew.add(pair.newIdx);
      const oldId = oldFaces[pair.oldIdx]!.faceId;
      assignedIds[pair.newIdx] = oldId;
      usedIds.add(oldId);
      const prevColor = previousArrangement.faceColors.get(oldId);
      if (prevColor && !faceColors.has(oldId)) faceColors.set(oldId, prevColor);
    }
  }

  const order = draftFaces
    .map((f, idx) => ({ idx, sig: f.topologicalSignature, x: f.centroid.x, y: f.centroid.y }))
    .sort((a, b) => a.sig.localeCompare(b.sig) || a.y - b.y || a.x - b.x);
  const sigCounters = new Map<string, number>();
  for (const item of order) {
    if (assignedIds[item.idx] !== "") continue;
    const baseHash = hashSignatureHex(item.sig);
    let serial = sigCounters.get(baseHash) ?? 0;
    let candidateId = serial === 0 ? `face-${baseHash}` : `face-${baseHash}-${serial}`;
    while (usedIds.has(candidateId)) {
      serial += 1;
      candidateId = `face-${baseHash}-${serial}`;
    }
    sigCounters.set(baseHash, serial + 1);
    usedIds.add(candidateId);
    assignedIds[item.idx] = candidateId;
  }
  return { faceIds: assignedIds, faceColors };
}

/**
 * 교차·언더슛 선화 세그먼트 집합으로부터 반간선 평면 분할(DCEL)을 구축하고
 * 닫힌 유계 내부 면들과 외곽 경계 사이클을 분리 추출한다.
 */
export function buildPlanarArrangement(
  strokes: readonly PlanarStrokeInput[],
  options: BuildPlanarArrangementOptions = {},
): PlanarArrangement {
  const snapTolerance = options.snapTolerance ?? 1.5;
  const mergeEpsilon = options.mergeEpsilon ?? 0.05;
  const minFaceArea = options.minFaceArea ?? 0.25;
  const rawSegments = snapStrokeEndpoints(strokes, snapTolerance);
  if (rawSegments.length === 0) {
    return { vertices: [], halfEdges: [], boundedFaces: [], outerBoundaryCycles: [], faceColors: new Map(options.initialFaceColors) };
  }

  const splitParams: number[][] = rawSegments.map(() => [0, 1]);
  const mergeEpsSq = mergeEpsilon * mergeEpsilon;
  for (let i = 0; i < rawSegments.length; i += 1) {
    const s1 = rawSegments[i]!;
    const minX1 = Math.min(s1.ax, s1.bx) - mergeEpsilon;
    const maxX1 = Math.max(s1.ax, s1.bx) + mergeEpsilon;
    const minY1 = Math.min(s1.ay, s1.by) - mergeEpsilon;
    const maxY1 = Math.max(s1.ay, s1.by) + mergeEpsilon;
    const dx1 = s1.bx - s1.ax;
    const dy1 = s1.by - s1.ay;
    for (let j = i + 1; j < rawSegments.length; j += 1) {
      const s2 = rawSegments[j]!;
      if (
        Math.max(s2.ax, s2.bx) + mergeEpsilon < minX1 ||
        Math.min(s2.ax, s2.bx) - mergeEpsilon > maxX1 ||
        Math.max(s2.ay, s2.by) + mergeEpsilon < minY1 ||
        Math.min(s2.ay, s2.by) - mergeEpsilon > maxY1
      ) {
        continue;
      }
      const dx2 = s2.bx - s2.ax;
      const dy2 = s2.by - s2.ay;
      const det = dx1 * dy2 - dy1 * dx2;
      if (Math.abs(det) > 1e-8) {
        const rx = s2.ax - s1.ax;
        const ry = s2.ay - s1.ay;
        const t = (rx * dy2 - ry * dx2) / det;
        const u = (rx * dy1 - ry * dx1) / det;
        if (t >= -1e-5 && t <= 1 + 1e-5 && u >= -1e-5 && u <= 1 + 1e-5) {
          splitParams[i]!.push(clamp(t, 0, 1));
          splitParams[j]!.push(clamp(u, 0, 1));
        }
      }
      for (const [px, py] of [[s1.ax, s1.ay], [s1.bx, s1.by]] as const) {
        const p = projectPointToSegment2D(px, py, s2.ax, s2.ay, s2.bx, s2.by);
        if (p.distSq <= mergeEpsSq) splitParams[j]!.push(p.t);
      }
      for (const [px, py] of [[s2.ax, s2.ay], [s2.bx, s2.by]] as const) {
        const p = projectPointToSegment2D(px, py, s1.ax, s1.ay, s1.bx, s1.by);
        if (p.distSq <= mergeEpsSq) splitParams[i]!.push(p.t);
      }
    }
  }

  const vertexList: { x: number; y: number; outgoing: number[] }[] = [];
  const getOrAddVertex = (x: number, y: number): number => {
    for (let idx = 0; idx < vertexList.length; idx += 1) {
      if (distSq2(vertexList[idx]!.x, vertexList[idx]!.y, x, y) <= mergeEpsSq) return idx;
    }
    vertexList.push({ x, y, outgoing: [] });
    return vertexList.length - 1;
  };

  const undirectedEdges = new Map<string, { u: number; v: number; strokeIds: Set<string> }>();
  for (let i = 0; i < rawSegments.length; i += 1) {
    const seg = rawSegments[i]!;
    const params = splitParams[i]!.sort((a, b) => a - b);
    let prevVid = -1;
    for (const t of params) {
      const vid = getOrAddVertex(seg.ax + (seg.bx - seg.ax) * t, seg.ay + (seg.by - seg.ay) * t);
      if (prevVid !== -1 && prevVid !== vid) {
        const u = prevVid < vid ? prevVid : vid;
        const v = prevVid < vid ? vid : prevVid;
        const key = `${u}:${v}`;
        let entry = undirectedEdges.get(key);
        if (!entry) {
          entry = { u, v, strokeIds: new Set<string>() };
          undirectedEdges.set(key, entry);
        }
        entry.strokeIds.add(seg.strokeId);
      }
      prevVid = vid;
    }
  }

  const halfEdgesMutable: {
    halfEdgeId: number;
    originVertexId: number;
    targetVertexId: number;
    twinHalfEdgeId: number;
    nextHalfEdgeId: number;
    prevHalfEdgeId: number;
    incidentFaceId: string | null;
    strokeIds: string[];
    angleRad: number;
  }[] = [];

  for (const edge of undirectedEdges.values()) {
    const va = vertexList[edge.u]!;
    const vb = vertexList[edge.v]!;
    const idF = halfEdgesMutable.length;
    const idB = idF + 1;
    const strokeIds = [...edge.strokeIds].sort();
    halfEdgesMutable.push(
      { halfEdgeId: idF, originVertexId: edge.u, targetVertexId: edge.v, twinHalfEdgeId: idB, nextHalfEdgeId: -1, prevHalfEdgeId: -1, incidentFaceId: null, strokeIds, angleRad: Math.atan2(vb.y - va.y, vb.x - va.x) },
      { halfEdgeId: idB, originVertexId: edge.v, targetVertexId: edge.u, twinHalfEdgeId: idF, nextHalfEdgeId: -1, prevHalfEdgeId: -1, incidentFaceId: null, strokeIds, angleRad: Math.atan2(va.y - vb.y, va.x - vb.x) },
    );
    va.outgoing.push(idF);
    vb.outgoing.push(idB);
  }

  for (const v of vertexList) {
    v.outgoing.sort((ea, eb) => halfEdgesMutable[ea]!.angleRad - halfEdgesMutable[eb]!.angleRad);
  }
  for (const he of halfEdgesMutable) {
    const out = vertexList[he.targetVertexId]!.outgoing;
    const nextHeId = out[(out.indexOf(he.twinHalfEdgeId) - 1 + out.length) % out.length]!;
    he.nextHalfEdgeId = nextHeId;
    halfEdgesMutable[nextHeId]!.prevHalfEdgeId = he.halfEdgeId;
  }

  const visited = new Uint8Array(halfEdgesMutable.length);
  const draftBounded: DraftFace[] = [];
  const outerCycles: PlanarOuterCycle[] = [];

  for (let startId = 0; startId < halfEdgesMutable.length; startId += 1) {
    if (visited[startId] === 1) continue;
    const cycleEdgeIds: number[] = [];
    const rawPoly: Point2D[] = [];
    const strokeSet = new Set<string>();
    let curr = startId;
    let guard = 0;
    while (visited[curr] === 0 && guard <= halfEdgesMutable.length) {
      visited[curr] = 1;
      cycleEdgeIds.push(curr);
      const he = halfEdgesMutable[curr]!;
      const origin = vertexList[he.originVertexId]!;
      rawPoly.push({ x: origin.x, y: origin.y });
      for (const sid of he.strokeIds) strokeSet.add(sid);
      curr = he.nextHalfEdgeId;
      guard += 1;
    }
    const cleanedPoly = pruneDanglingSpikes(rawPoly, mergeEpsilon * 1.5);
    const signedArea = computeSignedShoelaceArea(cleanedPoly);
    if (cleanedPoly.length >= 3 && signedArea >= minFaceArea) {
      const incidentStrokeIds = [...strokeSet].sort();
      const centroid = computePolygonCentroid(cleanedPoly);
      draftBounded.push({
        topologicalSignature: incidentStrokeIds.join("|"),
        boundaryHalfEdgeIds: cycleEdgeIds,
        outerPolygon: cleanedPoly,
        holes: [],
        signedArea,
        area: signedArea,
        centroid,
        interiorSample: centroid,
        incidentStrokeIds,
      });
    } else if (cleanedPoly.length >= 3 && signedArea <= -minFaceArea) {
      outerCycles.push({ halfEdgeIds: cycleEdgeIds, polygon: cleanedPoly, signedArea });
    }
  }

  for (const outer of outerCycles) {
    const probe = outer.polygon[0]!;
    const holeAbsArea = Math.abs(outer.signedArea);
    let containerIdx = -1;
    let smallestArea = Number.POSITIVE_INFINITY;
    for (let fIdx = 0; fIdx < draftBounded.length; fIdx += 1) {
      const cand = draftBounded[fIdx]!;
      if (cand.signedArea > holeAbsArea + minFaceArea && isPointInRingHalfOpen(probe.x, probe.y, cand.outerPolygon) && cand.signedArea < smallestArea) {
        smallestArea = cand.signedArea;
        containerIdx = fIdx;
      }
    }
    if (containerIdx !== -1) {
      const host = draftBounded[containerIdx]!;
      host.holes.push([...outer.polygon]);
      host.area = Math.max(minFaceArea, host.area - holeAbsArea);
      for (const heId of outer.halfEdgeIds) {
        host.boundaryHalfEdgeIds.push(heId);
        for (const sid of halfEdgesMutable[heId]!.strokeIds) {
          if (!host.incidentStrokeIds.includes(sid)) host.incidentStrokeIds.push(sid);
        }
      }
      host.incidentStrokeIds.sort();
      host.topologicalSignature = host.incidentStrokeIds.join("|");
    }
  }

  for (const face of draftBounded) {
    face.interiorSample = findGuaranteedInteriorSample(face.outerPolygon, face.holes, face.centroid);
  }
  const { faceIds, faceColors } = assignPersistentFaceIdsAndColors(draftBounded, options.previousArrangement, options.initialFaceColors);
  for (let i = 0; i < draftBounded.length; i += 1) {
    for (const heId of draftBounded[i]!.boundaryHalfEdgeIds) {
      halfEdgesMutable[heId]!.incidentFaceId = faceIds[i]!;
    }
  }

  const boundedFaces: PlanarBoundedFace[] = draftBounded.map((draft, idx) => {
    const fid = faceIds[idx]!;
    const neighbors = new Set<string>();
    for (const heId of draft.boundaryHalfEdgeIds) {
      const twinFace = halfEdgesMutable[halfEdgesMutable[heId]!.twinHalfEdgeId]!.incidentFaceId;
      if (twinFace !== null && twinFace !== fid) neighbors.add(twinFace);
    }
    return { ...draft, faceId: fid, neighborFaceIds: [...neighbors].sort() };
  });

  return {
    vertices: vertexList.map((v, idx) => ({ vertexId: idx, x: v.x, y: v.y, outgoingHalfEdgeIds: v.outgoing })),
    halfEdges: halfEdgesMutable,
    boundedFaces,
    outerBoundaryCycles: outerCycles,
    faceColors,
  };
}

/**
 * 평면 분할의 특정 면에 채색 색상을 지정한 새 불변 배열 상태를 반환한다.
 */
export function assignPlanarFaceColor(arrangement: PlanarArrangement, faceId: string, color: RgbaColor): PlanarArrangement {
  const nextColors = new Map(arrangement.faceColors);
  nextColors.set(faceId, color);
  return { ...arrangement, faceColors: nextColors };
}

function writePixelRgba(rgba: Uint8Array, pIdx: number, c: RgbaColor): void {
  const off = pIdx * 4;
  rgba[off] = c.r;
  rgba[off + 1] = c.g;
  rgba[off + 2] = c.b;
  rgba[off + 3] = c.a;
}

/**
 * 채색된 평면 분할을 지정 해상도로 래스터화하고 인접 면·선 사이 흰색 틈새 픽셀을 계측한다.
 */
export function rasterizePlanarArrangement(
  arrangement: PlanarArrangement,
  strokes: readonly PlanarStrokeInput[],
  options: PlanarRasterizeOptions,
): PlanarRasterizeReport {
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));
  const bg = options.backgroundRgba ?? DEFAULT_CANVAS_BG;
  const renderStrokes = options.renderStrokes ?? true;
  const strokeWidthScale = options.strokeWidthScale ?? 1;

  const rgba = new Uint8Array(width * height * 4);
  const faceOwnerPerPixel = new Int32Array(width * height).fill(-1);
  for (let p = 0; p < width * height; p += 1) writePixelRgba(rgba, p, bg);

  const facesByAreaAsc = arrangement.boundedFaces
    .map((face, index) => {
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const pt of face.outerPolygon) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
      return { face, index, minX, minY, maxX, maxY };
    })
    .sort((a, b) => a.face.area - b.face.area);

  let filledPixelCount = 0;
  for (let y = 0; y < height; y += 1) {
    const py = y + 0.5;
    for (let x = 0; x < width; x += 1) {
      const px = x + 0.5;
      const pIdx = y * width + x;
      for (const entry of facesByAreaAsc) {
        if (px < entry.minX || px > entry.maxX || py < entry.minY || py > entry.maxY) continue;
        if (isPointInBoundedFace(px, py, entry.face)) {
          faceOwnerPerPixel[pIdx] = entry.index;
          const color = arrangement.faceColors.get(entry.face.faceId);
          if (color) {
            writePixelRgba(rgba, pIdx, color);
            filledPixelCount += 1;
          }
          break;
        }
      }
    }
  }

  let strokePixelCount = 0;
  if (renderStrokes && strokeWidthScale > 0) {
    for (const stroke of strokes) {
      const halfW = stroke.width * strokeWidthScale * 0.5;
      if (halfW <= 0 || stroke.points.length < 2) continue;
      const halfWSq = halfW * halfW;
      const ink = stroke.colorRgba ?? DEFAULT_INK_COLOR;
      for (let k = 0; k + 1 < stroke.points.length; k += 1) {
        const a = stroke.points[k]!;
        const b = stroke.points[k + 1]!;
        const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - halfW));
        const x1 = Math.min(width - 1, Math.ceil(Math.max(a.x, b.x) + halfW));
        const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - halfW));
        const y1 = Math.min(height - 1, Math.ceil(Math.max(a.y, b.y) + halfW));
        for (let y = y0; y <= y1; y += 1) {
          for (let x = x0; x <= x1; x += 1) {
            if (projectPointToSegment2D(x + 0.5, y + 0.5, a.x, a.y, b.x, b.y).distSq <= halfWSq) {
              writePixelRgba(rgba, y * width + x, ink);
              strokePixelCount += 1;
            }
          }
        }
      }
    }
  }

  let interiorGapPixelCount = 0;
  for (let y = 1; y + 1 < height; y += 1) {
    for (let x = 1; x + 1 < width; x += 1) {
      const idx = y * width + x;
      if (faceOwnerPerPixel[idx] !== -1) continue;
      const hSandwiched = faceOwnerPerPixel[idx - 1] !== -1 && faceOwnerPerPixel[idx + 1] !== -1;
      const vSandwiched = faceOwnerPerPixel[idx - width] !== -1 && faceOwnerPerPixel[idx + width] !== -1;
      if (hSandwiched || vSandwiched) interiorGapPixelCount += 1;
    }
  }

  return { width, height, rgba, faceOwnerPerPixel, filledPixelCount, strokePixelCount, interiorGapPixelCount };
}
