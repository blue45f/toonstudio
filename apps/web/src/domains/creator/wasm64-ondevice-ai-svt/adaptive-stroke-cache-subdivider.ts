/**
 * 곡률·줌·필압 적응형 가변폭 스트로크 세분화기 및 64비트 FNV-1a LRU/OPFS 지오메트리 캐시.
 *
 * - 센트리페탈 Catmull-Rom → Cubic Bézier 변환 후 De Casteljau 화면 공간 평탄도·곡률·필압 오차 기반 적응 세분화
 * - 직선 구간은 최소 정점(1세그먼트)으로 절감하고 급곡선·코너·고배율 줌에서는 각짐(jagged corner) 없이 부드럽게 세분화
 * - 64비트 FNV-1a(`BigInt`) 제어점+스타일+로그 줌 LOD 버킷 해싱으로 팬/스크롤·동일 줌 재렌더 시 0 재계산 캐시 적중
 * - 바이트·엔트리 이중 상한 LRU 메모리 캐시 + 선택적 OPFS 지오메트리 캐시
 */

import {
  selectStudioOpfsFileSystem,
  type StudioOpfsFileSystem,
  type StudioOpfsFileSystemProbeScope,
} from "../studio-opfs-filesystem";

export type StrokeCapStyle = "round" | "butt";
export type StrokeJoinStyle = "round" | "bevel" | "miter";

export interface StylusControlPoint {
  readonly x: number; readonly y: number; readonly pressure: number;
  readonly tiltX?: number; readonly tiltY?: number; readonly timestampMs?: number;
}
export interface AdaptiveStrokeInput {
  readonly strokeId?: string; readonly points: readonly StylusControlPoint[];
  readonly baseWidthPx: number; readonly minWidthRatio?: number; readonly maxWidthRatio?: number;
  readonly capStyle?: StrokeCapStyle; readonly joinStyle?: StrokeJoinStyle; readonly miterLimit?: number;
}
export interface AdaptiveSubdivisionOptions {
  readonly zoom?: number; readonly flatnessTolerancePx?: number; readonly pressureDeltaThreshold?: number;
  readonly maxSegmentTurnDeg?: number; readonly maxSubdivisionDepth?: number; readonly uniformReferenceStepsPerSpan?: number;
}
export interface StrokeBounds2D {
  readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
  readonly width: number; readonly height: number;
}
export interface TessellatedStrokeGeometry {
  readonly cacheKey: string; readonly hash64: bigint; readonly zoomLodBucket: number; readonly effectiveZoom: number;
  readonly centerlineXy: Float32Array; readonly widths: Float32Array;
  readonly verticesXy: Float32Array; readonly uvs: Float32Array; readonly indices: Uint32Array;
  readonly bounds: StrokeBounds2D; readonly centerlineSampleCount: number; readonly vertexCount: number;
  readonly triangleCount: number; readonly byteLength: number; readonly totalArcLength: number;
  readonly maxScreenFlatnessErrorPx: number; readonly meanCurvature: number;
  readonly uniformBaselineVertexCount: number; readonly vertexReductionVsUniformPct: number;
}
export interface StrokeCacheLookupResult {
  readonly geometry: TessellatedStrokeGeometry; readonly cacheHit: boolean;
  readonly source: "memory-lru" | "opfs-backing" | "computed";
}
export interface StrokeBackingStoreLike {
  readonly read: (key: string) => Promise<Uint8Array | null>;
  readonly write: (key: string, payload: Uint8Array) => Promise<boolean>;
  readonly remove: (key: string) => Promise<void>;
  readonly clear?: () => Promise<void>;
}
export interface AdaptiveStrokeCacheOptions {
  readonly maxEntries?: number; readonly maxBytes?: number; readonly backingStore?: StrokeBackingStoreLike | null;
}
export interface AdaptiveStrokeCacheMetrics {
  readonly entryCount: number; readonly residentBytes: number; readonly maxEntries: number; readonly maxBytes: number;
  readonly hits: number; readonly misses: number; readonly evictions: number;
  readonly backingHits: number; readonly backingWrites: number; readonly recomputeCount: number; readonly hitRate: number;
}

const FNV64_OFFSET = BigInt("0xcbf29ce484222325");
const FNV64_PRIME = BigInt("0x00000100000001b3");
const U64_MASK = BigInt("0xffffffffffffffff");
const SERIALIZED_MAGIC = 0x54534743; // "TSGC"
const SERIALIZED_VERSION = 1;
const SERIALIZED_HEADER_BYTES = 76;
const OPFS_CACHE_SLOT_COUNT = 128;
const OPFS_CACHE_SLOT_MAX_BYTES = 256 * 1024;
const OPFS_CACHE_PATH = "geometry/";

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function formatStrokeCacheKey(hash64: bigint, zoomLodBucket: number): string {
  return `stk64_${hash64.toString(16).padStart(16, "0")}_z${zoomLodBucket}`;
}

function normalizeSubdivisionOptions(options?: AdaptiveSubdivisionOptions) {
  return {
    pressureDeltaThreshold: clamp(options?.pressureDeltaThreshold ?? 0.14, 0.02, 1.0),
    maxSegmentTurnDeg: clamp(options?.maxSegmentTurnDeg ?? 14, 4, 45),
    maxSubdivisionDepth: clamp(Math.round(options?.maxSubdivisionDepth ?? 6), 1, 8),
    uniformReferenceStepsPerSpan: Math.max(4, options?.uniformReferenceStepsPerSpan ?? 16),
  };
}

/** 줌 배율을 1/4옥타브 로그 LOD 버킷으로 양자화해 미세 줌 변동이나 팬 이동 시 캐시 재사용을 극대화한다. */
export function quantizeZoomLodBucket(zoom: number): { readonly bucket: number; readonly effectiveZoom: number } {
  const safeZoom = clamp(Number.isFinite(zoom) && zoom > 0 ? zoom : 1, 0.0625, 64);
  const bucket = Math.round(Math.log2(safeZoom) * 4);
  return { bucket, effectiveZoom: Math.pow(2, bucket / 4) };
}

/** 스트로크 제어점·스타일과 세분화 조건을 IEEE-754 바이트 단위로 64비트 FNV-1a 해싱한다. */
export function hashStrokeControlPointsFnv64(
  input: AdaptiveStrokeInput,
  zoomLodBucket: number,
  flatnessTolerancePx = 0.35,
  options?: AdaptiveSubdivisionOptions,
): { readonly hash64: bigint; readonly cacheKey: string } {
  const pointCount = input.points.length;
  const buf = new ArrayBuffer(44 + pointCount * 20);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const normalized = normalizeSubdivisionOptions(options);
  view.setInt32(0, zoomLodBucket, true);
  view.setFloat32(4, input.baseWidthPx, true);
  view.setFloat32(8, input.minWidthRatio ?? 0.2, true);
  view.setFloat32(12, input.maxWidthRatio ?? 1.25, true);
  view.setFloat32(16, flatnessTolerancePx, true);
  view.setUint32(20, ((input.capStyle === "butt" ? 1 : 0) << 4) | (input.joinStyle === "bevel" ? 1 : input.joinStyle === "miter" ? 2 : 0), true);
  view.setUint32(24, pointCount, true);
  view.setFloat32(28, normalized.pressureDeltaThreshold, true);
  view.setFloat32(32, normalized.maxSegmentTurnDeg, true);
  view.setUint32(36, normalized.maxSubdivisionDepth, true);
  view.setFloat32(40, normalized.uniformReferenceStepsPerSpan, true);

  let off = 44;
  for (let i = 0; i < pointCount; i += 1) {
    const p = input.points[i]!;
    view.setFloat32(off, p.x, true); view.setFloat32(off + 4, p.y, true);
    view.setFloat32(off + 8, p.pressure, true); view.setFloat32(off + 12, p.tiltX ?? 0, true);
    view.setFloat32(off + 16, p.tiltY ?? 0, true);
    off += 20;
  }

  let h = FNV64_OFFSET;
  for (let i = 0; i < bytes.length; i += 1) h = ((h ^ BigInt(bytes[i]!)) * FNV64_PRIME) & U64_MASK;
  return { hash64: h, cacheKey: formatStrokeCacheKey(h, zoomLodBucket) };
}

interface CubicBezierSpan {
  readonly x0: number; readonly y0: number; readonly p0: number;
  readonly x1: number; readonly y1: number; readonly p1: number;
  readonly x2: number; readonly y2: number; readonly p2: number;
  readonly x3: number; readonly y3: number; readonly p3: number;
}

function pointToSegmentDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax; const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-10) return Math.hypot(px - ax, py - ay);
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function catmullRomToCubicSpan(p0: StylusControlPoint, p1: StylusControlPoint, p2: StylusControlPoint, p3: StylusControlPoint): CubicBezierSpan {
  const d01 = Math.max(1e-4, Math.sqrt(Math.hypot(p1.x - p0.x, p1.y - p0.y)));
  const d12 = Math.max(1e-4, Math.sqrt(Math.hypot(p2.x - p1.x, p2.y - p1.y)));
  const d23 = Math.max(1e-4, Math.sqrt(Math.hypot(p3.x - p2.x, p3.y - p2.y)));
  const tan = (a: number, b: number, c: number, da: number, db: number): number => ((b - a) / da - (c - a) / (da + db) + (c - b) / db) * d12;
  const m1x = tan(p0.x, p1.x, p2.x, d01, d12); const m1y = tan(p0.y, p1.y, p2.y, d01, d12); const m1p = tan(p0.pressure, p1.pressure, p2.pressure, d01, d12);
  const m2x = tan(p1.x, p2.x, p3.x, d12, d23); const m2y = tan(p1.y, p2.y, p3.y, d12, d23); const m2p = tan(p1.pressure, p2.pressure, p3.pressure, d12, d23);
  const maxLen = Math.max(1e-4, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 1.5);
  const clampT = (tx: number, ty: number): [number, number] => {
    const l = Math.hypot(tx, ty);
    return l > maxLen ? [(tx / l) * maxLen, (ty / l) * maxLen] : [tx, ty];
  };
  const [c1x, c1y] = clampT(m1x, m1y); const [c2x, c2y] = clampT(m2x, m2y);
  return {
    x0: p1.x, y0: p1.y, p0: p1.pressure,
    x1: p1.x + c1x / 3, y1: p1.y + c1y / 3, p1: clamp(p1.pressure + m1p / 3, 0, 1),
    x2: p2.x - c2x / 3, y2: p2.y - c2y / 3, p2: clamp(p2.pressure - m2p / 3, 0, 1),
    x3: p2.x, y3: p2.y, p3: p2.pressure,
  };
}

function subdivideCubicAdaptive(
  s: CubicBezierSpan, zoom: number, flatTolPx: number, pTol: number, maxTurnRad: number, maxDepth: number, depth: number,
  out: { x: number; y: number; pressure: number }[], stats: { maxScreenErrPx: number },
): void {
  const screenErr = 0.75 * Math.max(pointToSegmentDist(s.x1, s.y1, s.x0, s.y0, s.x3, s.y3), pointToSegmentDist(s.x2, s.y2, s.x0, s.y0, s.x3, s.y3)) * zoom;
  const chordLen = Math.hypot(s.x3 - s.x0, s.y3 - s.y0);
  const pDev = Math.abs(0.125 * s.p0 + 0.375 * s.p1 + 0.375 * s.p2 + 0.125 * s.p3 - 0.5 * (s.p0 + s.p3));
  const pDelta = Math.abs(s.p3 - s.p0);

  const t0x = s.x1 - s.x0; const t0y = s.y1 - s.y0; const t1x = s.x3 - s.x2; const t1y = s.y3 - s.y2;
  const l0 = Math.hypot(t0x, t0y); const l1 = Math.hypot(t1x, t1y);
  const turnRad = l0 > 1e-5 && l1 > 1e-5 ? Math.acos(clamp((t0x * t1x + t0y * t1y) / (l0 * l1), -1, 1)) : 0;

  if (
    (screenErr <= flatTolPx && (turnRad <= maxTurnRad || chordLen * zoom <= 1.25) && pDev <= pTol * 0.5 && (pDelta <= pTol || chordLen * zoom <= 4)) ||
    depth >= maxDepth ||
    chordLen * zoom <= 0.4
  ) {
    if (screenErr > stats.maxScreenErrPx) stats.maxScreenErrPx = screenErr;
    out.push({ x: s.x3, y: s.y3, pressure: s.p3 });
    return;
  }

  const x01 = 0.5 * (s.x0 + s.x1); const y01 = 0.5 * (s.y0 + s.y1); const p01 = 0.5 * (s.p0 + s.p1);
  const x12 = 0.5 * (s.x1 + s.x2); const y12 = 0.5 * (s.y1 + s.y2); const p12 = 0.5 * (s.p1 + s.p2);
  const x23 = 0.5 * (s.x2 + s.x3); const y23 = 0.5 * (s.y2 + s.y3); const p23 = 0.5 * (s.p2 + s.p3);
  const x012 = 0.5 * (x01 + x12); const y012 = 0.5 * (y01 + y12); const p012 = 0.5 * (p01 + p12);
  const x123 = 0.5 * (x12 + x23); const y123 = 0.5 * (y12 + y23); const p123 = 0.5 * (p12 + p23);
  const xm = 0.5 * (x012 + x123); const ym = 0.5 * (y012 + y123); const pm = 0.5 * (p012 + p123);

  subdivideCubicAdaptive({ x0: s.x0, y0: s.y0, p0: s.p0, x1: x01, y1: y01, p1: p01, x2: x012, y2: y012, p2: p012, x3: xm, y3: ym, p3: pm }, zoom, flatTolPx, pTol, maxTurnRad, maxDepth, depth + 1, out, stats);
  subdivideCubicAdaptive({ x0: xm, y0: ym, p0: pm, x1: x123, y1: y123, p1: p123, x2: x23, y2: y23, p2: p23, x3: s.x3, y3: s.y3, p3: s.p3 }, zoom, flatTolPx, pTol, maxTurnRad, maxDepth, depth + 1, out, stats);
}

/** 곡률·줌·필압 적응형 세분화 및 가변폭 리본/라운드 조인·캡 삼각화 지오메트리를 생성한다. */
export function subdivideAdaptiveStroke(input: AdaptiveStrokeInput, options?: AdaptiveSubdivisionOptions): TessellatedStrokeGeometry {
  const { bucket: zoomLodBucket, effectiveZoom } = quantizeZoomLodBucket(options?.zoom ?? 1);
  const flatTolPx = clamp(options?.flatnessTolerancePx ?? 0.35, 0.05, 4.0);
  const normalized = normalizeSubdivisionOptions(options);
  const { pressureDeltaThreshold: pTol, maxSubdivisionDepth: maxDepth } = normalized;
  const maxTurnRad = (normalized.maxSegmentTurnDeg * Math.PI) / 180;
  const minW = clamp(input.minWidthRatio ?? 0.2, 0.05, 1.0);
  const maxW = clamp(input.maxWidthRatio ?? 1.25, minW, 3.0);
  const baseW = Math.max(0.5, input.baseWidthPx);
  const capStyle = input.capStyle ?? "round";
  const joinStyle = input.joinStyle ?? "round";
  const { hash64, cacheKey } = hashStrokeControlPointsFnv64(input, zoomLodBucket, flatTolPx, options);

  const rawPoints = input.points;
  const rawSamples: { x: number; y: number; pressure: number }[] = [];
  const stats = { maxScreenErrPx: 0 };
  if (rawPoints.length === 1) {
    rawSamples.push({ x: rawPoints[0]!.x, y: rawPoints[0]!.y, pressure: rawPoints[0]!.pressure });
  } else if (rawPoints.length >= 2) {
    rawSamples.push({ x: rawPoints[0]!.x, y: rawPoints[0]!.y, pressure: rawPoints[0]!.pressure });
    for (let i = 0; i < rawPoints.length - 1; i += 1) {
      const span = catmullRomToCubicSpan(rawPoints[Math.max(0, i - 1)]!, rawPoints[i]!, rawPoints[i + 1]!, rawPoints[Math.min(rawPoints.length - 1, i + 2)]!);
      subdivideCubicAdaptive(span, effectiveZoom, flatTolPx, pTol, maxTurnRad, maxDepth, 0, rawSamples, stats);
    }
  }

  const samples: { readonly x: number; readonly y: number; readonly width: number; readonly u: number }[] = [];
  let totalArc = 0;
  for (let i = 0; i < rawSamples.length; i += 1) {
    const cur = rawSamples[i]!;
    if (samples.length > 0) {
      const segLen = Math.hypot(cur.x - samples[samples.length - 1]!.x, cur.y - samples[samples.length - 1]!.y);
      if (segLen < 1e-4 && i < rawSamples.length - 1) continue;
      totalArc += segLen;
    }
    samples.push({ x: cur.x, y: cur.y, width: baseW * (minW + (maxW - minW) * clamp(cur.pressure, 0, 1)), u: totalArc });
  }

  const n = samples.length;
  const centerlineXy = new Float32Array(n * 2);
  const widths = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    centerlineXy[i * 2] = samples[i]!.x; centerlineXy[i * 2 + 1] = samples[i]!.y; widths[i] = samples[i]!.width;
  }

  let curvSum = 0; let curvCount = 0;
  for (let i = 1; i < n - 1; i += 1) {
    const a = samples[i - 1]!; const b = samples[i]!; const c = samples[i + 1]!;
    const v1x = b.x - a.x; const v1y = b.y - a.y; const v2x = c.x - b.x; const v2y = c.y - b.y;
    const l1 = Math.hypot(v1x, v1y); const l2 = Math.hypot(v2x, v2y);
    if (l1 > 1e-4 && l2 > 1e-4) { curvSum += Math.acos(clamp((v1x * v2x + v1y * v2y) / (l1 * l2), -1, 1)) / (0.5 * (l1 + l2)); curvCount += 1; }
  }

  const verts: number[] = []; const uvList: number[] = []; const indices: number[] = [];
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const pushVert = (x: number, y: number, u: number, v: number): number => {
    const idx = verts.length / 2;
    verts.push(x, y); uvList.push(u, v);
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    return idx;
  };
  const addFanArc = (cx: number, cy: number, radius: number, startAng: number, sweepAng: number, uCoord: number): void => {
    const steps = clamp(Math.ceil((Math.abs(sweepAng) * Math.max(1, radius * effectiveZoom)) / 6), 2, 12);
    const centerIdx = pushVert(cx, cy, uCoord, 0.5);
    let prevIdx = pushVert(cx + Math.cos(startAng) * radius, cy + Math.sin(startAng) * radius, uCoord, 0);
    for (let s = 1; s <= steps; s += 1) {
      const a = startAng + (sweepAng * s) / steps;
      const nextIdx = pushVert(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, uCoord, 1);
      indices.push(centerIdx, prevIdx, nextIdx);
      prevIdx = nextIdx;
    }
  };

  if (n === 1) {
    addFanArc(samples[0]!.x, samples[0]!.y, samples[0]!.width * 0.5, 0, Math.PI * 2, 0);
  } else if (n >= 2) {
    const invTotal = totalArc > 1e-6 ? 1 / totalArc : 1;
    const dirs = Array.from({ length: n - 1 }, (_, i) => {
      const dx = samples[i + 1]!.x - samples[i]!.x; const dy = samples[i + 1]!.y - samples[i]!.y;
      const len = Math.max(1e-6, Math.hypot(dx, dy));
      return { dx: dx / len, dy: dy / len, nx: -dy / len, ny: dx / len };
    });
    if (capStyle === "round") addFanArc(samples[0]!.x, samples[0]!.y, samples[0]!.width * 0.5, Math.atan2(dirs[0]!.ny, dirs[0]!.nx), Math.PI, 0);
    for (let i = 0; i < n - 1; i += 1) {
      const a = samples[i]!; const b = samples[i + 1]!; const d = dirs[i]!;
      const ha = a.width * 0.5; const hb = b.width * 0.5; const ua = a.u * invTotal; const ub = b.u * invTotal;
      const al = pushVert(a.x + d.nx * ha, a.y + d.ny * ha, ua, 0);
      const ar = pushVert(a.x - d.nx * ha, a.y - d.ny * ha, ua, 1);
      const bl = pushVert(b.x + d.nx * hb, b.y + d.ny * hb, ub, 0);
      const br = pushVert(b.x - d.nx * hb, b.y - d.ny * hb, ub, 1);
      indices.push(al, ar, bl, ar, br, bl);
      if (i + 1 < dirs.length) {
        const nd = dirs[i + 1]!;
        const cross = d.dx * nd.dy - d.dy * nd.dx;
        const turn = Math.acos(clamp(d.dx * nd.dx + d.dy * nd.dy, -1, 1));
        if (turn > 0.14) {
          if (joinStyle === "round") {
            addFanArc(b.x, b.y, hb, cross > 0 ? Math.atan2(-d.ny, -d.nx) : Math.atan2(d.ny, d.nx), cross > 0 ? turn : -turn, ub);
          } else {
            const cIdx = pushVert(b.x, b.y, ub, 0.5);
            const pB = pushVert(cross > 0 ? b.x - nd.nx * hb : b.x + nd.nx * hb, cross > 0 ? b.y - nd.ny * hb : b.y + nd.ny * hb, ub, cross > 0 ? 1 : 0);
            indices.push(cIdx, cross > 0 ? br : bl, pB);
          }
        }
      }
    }
    if (capStyle === "round") {
      const dl = dirs[dirs.length - 1]!;
      addFanArc(samples[n - 1]!.x, samples[n - 1]!.y, samples[n - 1]!.width * 0.5, Math.atan2(-dl.ny, -dl.nx), Math.PI, 1);
    }
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0; }

  const verticesXy = new Float32Array(verts); const uvs = new Float32Array(uvList); const indicesU32 = new Uint32Array(indices);
  const vertexCount = verticesXy.length / 2;
  const uniformBaselineVertexCount = Math.max(1, rawPoints.length - 1) * normalized.uniformReferenceStepsPerSpan * 4;
  return {
    cacheKey, hash64, zoomLodBucket, effectiveZoom, centerlineXy, widths, verticesXy, uvs, indices: indicesU32,
    bounds: { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) },
    centerlineSampleCount: n, vertexCount, triangleCount: Math.floor(indicesU32.length / 3),
    byteLength: centerlineXy.byteLength + widths.byteLength + verticesXy.byteLength + uvs.byteLength + indicesU32.byteLength,
    totalArcLength: totalArc, maxScreenFlatnessErrorPx: stats.maxScreenErrPx,
    meanCurvature: curvCount > 0 ? curvSum / curvCount : 0,
    uniformBaselineVertexCount,
    vertexReductionVsUniformPct: ((uniformBaselineVertexCount - vertexCount) / Math.max(1, uniformBaselineVertexCount)) * 100,
  };
}

// ---------------------------------------------------------------------------
// 바이너리 직렬화 · OPFS 백킹 스토어 · LRU 지오메트리 캐시
// ---------------------------------------------------------------------------

export function serializeStrokeGeometry(geom: TessellatedStrokeGeometry): Uint8Array {
  const buf = new ArrayBuffer(SERIALIZED_HEADER_BYTES + geom.byteLength);
  const v = new DataView(buf);
  const out = new Uint8Array(buf);
  v.setUint32(0, SERIALIZED_MAGIC, true); v.setUint32(4, SERIALIZED_VERSION, true);
  v.setBigUint64(8, geom.hash64, true); v.setInt32(16, geom.zoomLodBucket, true);
  v.setFloat32(20, geom.effectiveZoom, true); v.setUint32(24, geom.centerlineSampleCount, true);
  v.setUint32(28, geom.vertexCount, true); v.setUint32(32, geom.indices.length, true);
  v.setFloat32(36, geom.totalArcLength, true); v.setFloat32(40, geom.maxScreenFlatnessErrorPx, true);
  v.setFloat32(44, geom.meanCurvature, true); v.setUint32(48, geom.uniformBaselineVertexCount, true);
  v.setFloat32(52, geom.bounds.minX, true); v.setFloat32(56, geom.bounds.minY, true);
  v.setFloat32(60, geom.bounds.maxX, true); v.setFloat32(64, geom.bounds.maxY, true);
  v.setFloat32(68, geom.vertexReductionVsUniformPct, true); v.setUint32(72, 0, true);
  let off = SERIALIZED_HEADER_BYTES;
  for (const typed of [geom.centerlineXy, geom.widths, geom.verticesXy, geom.uvs, geom.indices]) {
    out.set(new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength), off);
    off += typed.byteLength;
  }
  return out;
}

function readStrokeGeometryHeader(cacheKey: string, payload: Uint8Array): DataView | null {
  if (payload.byteLength < SERIALIZED_HEADER_BYTES) return null;
  const v = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (v.getUint32(0, true) !== SERIALIZED_MAGIC || v.getUint32(4, true) !== SERIALIZED_VERSION) return null;
  if (cacheKey !== formatStrokeCacheKey(v.getBigUint64(8, true), v.getInt32(16, true))) return null;
  const sampleCount = v.getUint32(24, true); const vertexCount = v.getUint32(28, true); const indexCount = v.getUint32(32, true);
  const dataBytes = sampleCount * 12 + vertexCount * 16 + indexCount * 4;
  return payload.byteLength === SERIALIZED_HEADER_BYTES + dataBytes ? v : null;
}

export function deserializeStrokeGeometry(cacheKey: string, payload: Uint8Array): TessellatedStrokeGeometry | null {
  const v = readStrokeGeometryHeader(cacheKey, payload);
  if (!v) return null;
  const sampleCount = v.getUint32(24, true); const vertexCount = v.getUint32(28, true); const indexCount = v.getUint32(32, true);

  let off = SERIALIZED_HEADER_BYTES;
  const take = (len: number): ArrayBuffer => {
    const ab = new ArrayBuffer(len);
    new Uint8Array(ab).set(payload.subarray(off, off + len));
    off += len;
    return ab;
  };
  const centerlineXy = new Float32Array(take(sampleCount * 8));
  const widths = new Float32Array(take(sampleCount * 4));
  const verticesXy = new Float32Array(take(vertexCount * 8));
  const uvs = new Float32Array(take(vertexCount * 8));
  const indices = new Uint32Array(take(indexCount * 4));
  const minX = v.getFloat32(52, true); const minY = v.getFloat32(56, true);
  const maxX = v.getFloat32(60, true); const maxY = v.getFloat32(64, true);
  return {
    cacheKey, hash64: v.getBigUint64(8, true), zoomLodBucket: v.getInt32(16, true), effectiveZoom: v.getFloat32(20, true),
    centerlineXy, widths, verticesXy, uvs, indices,
    bounds: { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) },
    centerlineSampleCount: sampleCount, vertexCount, triangleCount: Math.floor(indexCount / 3),
    byteLength: centerlineXy.byteLength + widths.byteLength + verticesXy.byteLength + uvs.byteLength + indices.byteLength,
    totalArcLength: v.getFloat32(36, true), maxScreenFlatnessErrorPx: v.getFloat32(40, true),
    meanCurvature: v.getFloat32(44, true), uniformBaselineVertexCount: v.getUint32(48, true),
    vertexReductionVsUniformPct: v.getFloat32(68, true),
  };
}

function getStrokeCacheSlot(key: string): string | null {
  const hashSuffix = /^stk64_[\da-f]{14}([\da-f]{2})_z(?:0|-?[1-9]\d?)$/.exec(key)?.[1];
  if (!hashSuffix) return null;
  const slot = Number.parseInt(hashSuffix, 16) % OPFS_CACHE_SLOT_COUNT;
  return `${OPFS_CACHE_PATH}${slot}.bin`;
}

/** 재계산 가능한 지오메트리를 고정 슬롯에 덮어써 여러 탭에서도 32MiB 상한을 지킨다. */
export function createOpfsStrokeStore(fs: StudioOpfsFileSystem): StrokeBackingStoreLike {
  async function readSlot(path: string, key: string): Promise<Uint8Array | null> {
    const size = await fs.size(path);
    if (size === null || size > OPFS_CACHE_SLOT_MAX_BYTES) return null;
    const payload = await fs.read(path);
    return payload && readStrokeGeometryHeader(key, payload) ? payload : null;
  }

  return {
    async read(key) {
      const path = getStrokeCacheSlot(key);
      return path ? readSlot(path, key) : null;
    },
    async write(key, payload) {
      const path = getStrokeCacheSlot(key);
      if (!path || payload.byteLength > OPFS_CACHE_SLOT_MAX_BYTES || !readStrokeGeometryHeader(key, payload)) return false;
      await fs.write(path, payload);
      return true;
    },
    async remove(key) {
      const path = getStrokeCacheSlot(key);
      if (path && await readSlot(path, key)) await fs.remove(path);
    },
    async clear() {
      const paths = await fs.list(OPFS_CACHE_PATH);
      const slots = paths.filter((path) => {
        const index = /^geometry\/(0|[1-9]\d{0,2})\.bin$/.exec(path)?.[1];
        return index !== undefined && Number(index) < OPFS_CACHE_SLOT_COUNT;
      });
      await Promise.all(slots.map((path) => fs.remove(path)));
    },
  };
}

/** OPFS가 막힌 환경에서는 별도 저장소 없이 메모리 LRU를 쓴다. */
export async function createBrowserOpfsStrokeStore(
  scope?: StudioOpfsFileSystemProbeScope,
): Promise<StrokeBackingStoreLike | null> {
  const selection = await selectStudioOpfsFileSystem(scope, { rootName: "toonstudio-stroke-geometry-cache-v1" });
  return selection.kind === "opfs" ? createOpfsStrokeStore(selection.fs) : null;
}

/** 64비트 FNV-1a 해시 기반 바이트/엔트리 상한 LRU + 선택적 OPFS 스트로크 지오메트리 캐시. */
export class AdaptiveStrokeGeometryCache {
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly backingStore: StrokeBackingStoreLike | null;
  private readonly entries = new Map<string, TessellatedStrokeGeometry>();
  private residentBytes = 0; private hits = 0; private misses = 0;
  private evictions = 0; private backingHits = 0; private backingWrites = 0; private recomputeCount = 0;

  public constructor(options?: AdaptiveStrokeCacheOptions) {
    this.maxEntries = Math.max(1, Math.round(options?.maxEntries ?? 256));
    this.maxBytes = Math.max(4096, Math.round(options?.maxBytes ?? 32 * 1024 * 1024));
    this.backingStore = options?.backingStore ?? null;
  }

  private promote(key: string, geom: TessellatedStrokeGeometry): void {
    this.entries.delete(key);
    this.entries.set(key, geom);
  }

  private insert(geom: TessellatedStrokeGeometry): void {
    const existing = this.entries.get(geom.cacheKey);
    if (existing) { this.residentBytes -= existing.byteLength; this.entries.delete(geom.cacheKey); }
    this.entries.set(geom.cacheKey, geom);
    this.residentBytes += geom.byteLength;
    while (this.entries.size > this.maxEntries || (this.residentBytes > this.maxBytes && this.entries.size > 1)) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      const oldest = this.entries.get(oldestKey);
      this.entries.delete(oldestKey);
      if (oldest) this.residentBytes -= oldest.byteLength;
      this.evictions += 1;
    }
  }

  public getOrSubdivide(input: AdaptiveStrokeInput, options?: AdaptiveSubdivisionOptions): StrokeCacheLookupResult {
    const { bucket } = quantizeZoomLodBucket(options?.zoom ?? 1);
    const { cacheKey } = hashStrokeControlPointsFnv64(input, bucket, clamp(options?.flatnessTolerancePx ?? 0.35, 0.05, 4.0), options);
    const cached = this.entries.get(cacheKey);
    if (cached) { this.hits += 1; this.promote(cacheKey, cached); return { geometry: cached, cacheHit: true, source: "memory-lru" }; }
    this.misses += 1; this.recomputeCount += 1;
    const geom = subdivideAdaptiveStroke(input, options);
    this.insert(geom);
    return { geometry: geom, cacheHit: false, source: "computed" };
  }

  public async getOrSubdivideAsync(input: AdaptiveStrokeInput, options?: AdaptiveSubdivisionOptions): Promise<StrokeCacheLookupResult> {
    const { bucket } = quantizeZoomLodBucket(options?.zoom ?? 1);
    const { cacheKey } = hashStrokeControlPointsFnv64(input, bucket, clamp(options?.flatnessTolerancePx ?? 0.35, 0.05, 4.0), options);
    const cached = this.entries.get(cacheKey);
    if (cached) { this.hits += 1; this.promote(cacheKey, cached); return { geometry: cached, cacheHit: true, source: "memory-lru" }; }
    if (this.backingStore) {
      // 기기 캐시를 읽을 수 없어도 스트로크는 입력에서 다시 계산한다.
      const stored = await this.backingStore.read(cacheKey).catch(() => null);
      const hydrated = stored ? deserializeStrokeGeometry(cacheKey, stored) : null;
      if (hydrated) { this.hits += 1; this.backingHits += 1; this.insert(hydrated); return { geometry: hydrated, cacheHit: true, source: "opfs-backing" }; }
    }
    this.misses += 1; this.recomputeCount += 1;
    const geom = subdivideAdaptiveStroke(input, options);
    this.insert(geom);
    if (this.backingStore && await this.backingStore.write(cacheKey, serializeStrokeGeometry(geom)).catch(() => false)) {
      this.backingWrites += 1;
    }
    return { geometry: geom, cacheHit: false, source: "computed" };
  }

  public has(cacheKey: string): boolean { return this.entries.has(cacheKey); }
  public clearMemory(): void { this.entries.clear(); this.residentBytes = 0; }
  public getMetrics(): AdaptiveStrokeCacheMetrics {
    const total = this.hits + this.misses;
    return {
      entryCount: this.entries.size, residentBytes: this.residentBytes, maxEntries: this.maxEntries, maxBytes: this.maxBytes,
      hits: this.hits, misses: this.misses, evictions: this.evictions, backingHits: this.backingHits,
      backingWrites: this.backingWrites, recomputeCount: this.recomputeCount, hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}
