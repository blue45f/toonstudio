/**
 * studio-vector-mask-engine.ts
 *
 * 해상도 독립 라이브 불리언 벡터 마스크 엔진 (Photopea / Photoshop / Graphite.rs 대응).
 * - 다중 3차 베지어 서브패스 + 불리언(`union` | `subtract` | `intersect` | `exclude`)
 * - 비파괴 `featherPx` · `density01` · `invert`
 * - 뷰포트 줌 배율 적응형 베지어 세분화 & 부호 있는 거리장(SDF) 지연 래스터화(800% 줌 계단 현상 0)
 * - PSD `vmsk` 26바이트 경로 레코드(8.24 고정소수점) 및 `ag-psd` `LayerVectorMask` 라운드트립
 */
import type { BezierKnot, BezierPath, BooleanOperation, LayerVectorMask } from "ag-psd";
import type { StudioImageDataLike } from "../studio-filters";

export interface VectorMaskVec2 {
  readonly x: number;
  readonly y: number;
}
export type VectorMaskBooleanOp = "union" | "subtract" | "intersect" | "exclude";
export type VectorMaskFillRule = "nonzero" | "evenodd";

export interface StudioVectorMaskKnot {
  readonly anchor: VectorMaskVec2;
  readonly handleIn: VectorMaskVec2;
  readonly handleOut: VectorMaskVec2;
  readonly linked: boolean;
}

export interface StudioVectorMaskSubpath {
  readonly id: string;
  readonly closed: boolean;
  readonly operation: VectorMaskBooleanOp;
  readonly fillRule: VectorMaskFillRule;
  readonly knots: readonly StudioVectorMaskKnot[];
}

export interface StudioVectorMask {
  readonly version: 1;
  readonly id: string;
  readonly enabled: boolean;
  readonly linked: boolean;
  readonly invert: boolean;
  readonly density01: number;
  readonly featherPx: number;
  readonly subpaths: readonly StudioVectorMaskSubpath[];
}

export interface VectorMaskBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface VectorMaskViewport {
  readonly originX: number;
  readonly originY: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly zoomScale: number;
}

export interface VectorMaskRasterStats {
  readonly subpathCount: number;
  readonly flattenedSegmentCount: number;
  readonly zoomScale: number;
  readonly effectiveFlatnessDocPx: number;
  readonly featherPx: number;
}

export interface VectorMaskViewportRasterResult {
  readonly width: number;
  readonly height: number;
  readonly alpha: Uint8ClampedArray;
  readonly stats: VectorMaskRasterStats;
}

export interface PsdVectorMaskPayload {
  readonly tag: "vmsk";
  readonly vectorMask: LayerVectorMask;
  readonly vectorMaskFeather: number;
  readonly vectorMaskDensity: number;
  readonly vmskBinary: Uint8Array;
}

interface FlattenedSubpath {
  readonly operation: VectorMaskBooleanOp;
  readonly fillRule: VectorMaskFillRule;
  readonly points: readonly VectorMaskVec2[];
}

const KAPPA_CIRCLE = 0.5522847498307936;
const FIXED_8_24_SCALE = 1 << 24;
const MAX_SUBDIV_DEPTH = 10;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge0 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function createVectorMask(input: {
  readonly id: string;
  readonly subpaths?: readonly StudioVectorMaskSubpath[];
  readonly enabled?: boolean;
  readonly linked?: boolean;
  readonly invert?: boolean;
  readonly density01?: number;
  readonly featherPx?: number;
}): StudioVectorMask {
  return {
    version: 1,
    id: input.id,
    enabled: input.enabled ?? true,
    linked: input.linked ?? true,
    invert: input.invert ?? false,
    density01: clamp01(input.density01 ?? 1),
    featherPx: Math.max(0, Number.isFinite(input.featherPx ?? 0) ? (input.featherPx ?? 0) : 0),
    subpaths: input.subpaths ?? [],
  };
}

export function createRectVectorMaskSubpath(params: {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly operation?: VectorMaskBooleanOp;
}): StudioVectorMaskSubpath {
  const x0 = params.x;
  const y0 = params.y;
  const x1 = params.x + Math.max(0, params.width);
  const y1 = params.y + Math.max(0, params.height);
  const corner = (x: number, y: number): StudioVectorMaskKnot => ({
    anchor: { x, y },
    handleIn: { x, y },
    handleOut: { x, y },
    linked: false,
  });
  return {
    id: params.id,
    closed: true,
    operation: params.operation ?? "union",
    fillRule: "nonzero",
    knots: [corner(x0, y0), corner(x1, y0), corner(x1, y1), corner(x0, y1)],
  };
}

export function createEllipseVectorMaskSubpath(params: {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly operation?: VectorMaskBooleanOp;
}): StudioVectorMaskSubpath {
  const rx = Math.max(0, params.rx);
  const ry = Math.max(0, params.ry);
  const kx = rx * KAPPA_CIRCLE;
  const ky = ry * KAPPA_CIRCLE;
  const { cx, cy } = params;
  return {
    id: params.id,
    closed: true,
    operation: params.operation ?? "union",
    fillRule: "nonzero",
    knots: [
      { anchor: { x: cx, y: cy - ry }, handleIn: { x: cx - kx, y: cy - ry }, handleOut: { x: cx + kx, y: cy - ry }, linked: true },
      { anchor: { x: cx + rx, y: cy }, handleIn: { x: cx + rx, y: cy - ky }, handleOut: { x: cx + rx, y: cy + ky }, linked: true },
      { anchor: { x: cx, y: cy + ry }, handleIn: { x: cx + kx, y: cy + ry }, handleOut: { x: cx - kx, y: cy + ry }, linked: true },
      { anchor: { x: cx - rx, y: cy }, handleIn: { x: cx - rx, y: cy + ky }, handleOut: { x: cx - rx, y: cy - ky }, linked: true },
    ],
  };
}

function cubicFlatnessSq(p0: VectorMaskVec2, p1: VectorMaskVec2, p2: VectorMaskVec2, p3: VectorMaskVec2): number {
  const ux = 3 * p1.x - 2 * p0.x - p3.x;
  const uy = 3 * p1.y - 2 * p0.y - p3.y;
  const vx = 3 * p2.x - 2 * p3.x - p0.x;
  const vy = 3 * p2.y - 2 * p3.y - p0.y;
  return (Math.max(ux * ux, vx * vx) + Math.max(uy * uy, vy * vy)) / 16;
}

function subdivideCubic(
  p0: VectorMaskVec2,
  p1: VectorMaskVec2,
  p2: VectorMaskVec2,
  p3: VectorMaskVec2,
  tolSq: number,
  depth: number,
  out: VectorMaskVec2[],
): void {
  if (depth >= MAX_SUBDIV_DEPTH || cubicFlatnessSq(p0, p1, p2, p3) <= tolSq) {
    out.push(p3);
    return;
  }
  const m01 = { x: (p0.x + p1.x) * 0.5, y: (p0.y + p1.y) * 0.5 };
  const m12 = { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 };
  const m23 = { x: (p2.x + p3.x) * 0.5, y: (p2.y + p3.y) * 0.5 };
  const m012 = { x: (m01.x + m12.x) * 0.5, y: (m01.y + m12.y) * 0.5 };
  const m123 = { x: (m12.x + m23.x) * 0.5, y: (m12.y + m23.y) * 0.5 };
  const mid = { x: (m012.x + m123.x) * 0.5, y: (m012.y + m123.y) * 0.5 };
  subdivideCubic(p0, m01, m012, mid, tolSq, depth + 1, out);
  subdivideCubic(mid, m123, m23, p3, tolSq, depth + 1, out);
}

/** 줌 배율 연동 허용 오차로 3차 베지어 서브패스를 적응형 폴리라인으로 평탄화한다. */
export function flattenVectorMaskSubpath(
  subpath: StudioVectorMaskSubpath,
  flatnessDocPx: number,
): readonly VectorMaskVec2[] {
  const { knots } = subpath;
  if (knots.length < 2) return knots.map((k) => k.anchor);
  const safeTol = Math.max(0.01, flatnessDocPx);
  const tolSq = safeTol * safeTol;
  const pts: VectorMaskVec2[] = [knots[0]!.anchor];
  const segs = subpath.closed ? knots.length : knots.length - 1;
  for (let i = 0; i < segs; i += 1) {
    const a = knots[i]!;
    const b = knots[(i + 1) % knots.length]!;
    subdivideCubic(a.anchor, a.handleOut, b.handleIn, b.anchor, tolSq, 0, pts);
  }
  return pts;
}

function pointInsidePolygon(
  x: number,
  y: number,
  points: readonly VectorMaskVec2[],
  fillRule: VectorMaskFillRule,
): boolean {
  const n = points.length;
  if (n < 3) return false;
  if (fillRule === "evenodd") {
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
      const pi = points[i]!;
      const pj = points[j]!;
      if (pi.y > y !== pj.y > y && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x) {
        inside = !inside;
      }
    }
    return inside;
  }
  let winding = 0;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const a = points[j]!;
    const b = points[i]!;
    if (a.y <= y) {
      if (b.y > y && (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y) > 0) winding += 1;
    } else if (b.y <= y && (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y) < 0) {
      winding -= 1;
    }
  }
  return winding !== 0;
}

function signedDistanceToPolygon(px: number, py: number, poly: FlattenedSubpath): number {
  const pts = poly.points;
  const n = pts.length;
  if (n < 2) return Infinity;
  let minDistSq = Infinity;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const a = pts[j]!;
    const b = pts[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq <= 1e-12 ? 0 : clamp01(((px - a.x) * dx + (py - a.y) * dy) / lenSq);
    const ex = px - (a.x + t * dx);
    const ey = py - (a.y + t * dy);
    const dSq = ex * ex + ey * ey;
    if (dSq < minDistSq) minDistSq = dSq;
  }
  const dist = Math.sqrt(minDistSq);
  return pointInsidePolygon(px, py, pts, poly.fillRule) ? -dist : dist;
}

function combineSignedDistance(acc: number, next: number, op: VectorMaskBooleanOp): number {
  if (op === "union") return Math.min(acc, next);
  if (op === "subtract") return Math.max(acc, -next);
  if (op === "intersect") return Math.max(acc, next);
  return Math.max(Math.min(acc, next), -Math.max(acc, next));
}

function prepareFlattenedSubpaths(mask: StudioVectorMask, zoomScale: number) {
  const safeZoom = Math.max(0.05, Number.isFinite(zoomScale) ? zoomScale : 1);
  const flatnessDocPx = clamp(0.2 / safeZoom, 0.015, 1.5);
  const flattened: FlattenedSubpath[] = [];
  let segmentCount = 0;
  for (const subpath of mask.subpaths) {
    if (subpath.knots.length < 2) continue;
    const points = flattenVectorMaskSubpath(subpath, flatnessDocPx);
    if (points.length < 3) continue;
    segmentCount += points.length;
    flattened.push({ operation: subpath.operation, fillRule: subpath.fillRule, points });
  }
  return { flattened, flatnessDocPx, segmentCount };
}

function evaluateFlattenedSdf(docX: number, docY: number, flattened: readonly FlattenedSubpath[]): number {
  if (flattened.length === 0) return -Infinity;
  let acc = signedDistanceToPolygon(docX, docY, flattened[0]!);
  for (let i = 1; i < flattened.length; i += 1) {
    acc = combineSignedDistance(acc, signedDistanceToPolygon(docX, docY, flattened[i]!), flattened[i]!.operation);
  }
  return acc;
}

function sdfToMaskAlpha01(d: number, mask: StudioVectorMask, zoomScale: number): number {
  const safeZoom = Math.max(0.05, Number.isFinite(zoomScale) ? zoomScale : 1);
  const halfTransition = mask.featherPx > 0 ? mask.featherPx : 0.5 / safeZoom;
  let raw = 1 - smoothstep(-halfTransition, halfTransition, d);
  if (mask.invert) raw = 1 - raw;
  const density = clamp01(mask.density01);
  return clamp01(1 - density + density * raw);
}

/** 문서 좌표 단일 점에서의 벡터 마스크 커버리지(0..1)를 줌 독립적으로 평가한다. */
export function evaluateVectorMaskAtPoint(
  mask: StudioVectorMask,
  docX: number,
  docY: number,
  zoomScale = 1,
): number {
  if (!mask.enabled || mask.subpaths.length === 0) return 1;
  const { flattened } = prepareFlattenedSubpaths(mask, zoomScale);
  if (flattened.length === 0) return 1;
  return sdfToMaskAlpha01(evaluateFlattenedSdf(docX, docY, flattened), mask, zoomScale);
}

export function computeVectorMaskBounds(mask: StudioVectorMask, flatnessDocPx = 0.25): VectorMaskBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  for (const subpath of mask.subpaths) {
    for (const p of flattenVectorMaskSubpath(subpath, flatnessDocPx)) {
      found = true;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return found ? { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY } : null;
}

/** 뷰포트 가시 영역만 현재 줌 해상도로 지연 래스터화한다(800% 확대에서도 상수 메모리). */
export function rasterizeVectorMaskForViewport(
  mask: StudioVectorMask,
  viewport: VectorMaskViewport,
): VectorMaskViewportRasterResult {
  const width = Math.max(1, Math.floor(viewport.widthPx));
  const height = Math.max(1, Math.floor(viewport.heightPx));
  const zoomScale = Math.max(0.05, Number.isFinite(viewport.zoomScale) ? viewport.zoomScale : 1);
  const alpha = new Uint8ClampedArray(width * height);

  if (!mask.enabled || mask.subpaths.length === 0) {
    alpha.fill(255);
    return {
      width,
      height,
      alpha,
      stats: { subpathCount: mask.subpaths.length, flattenedSegmentCount: 0, zoomScale, effectiveFlatnessDocPx: 0, featherPx: mask.featherPx },
    };
  }

  const { flattened, flatnessDocPx, segmentCount } = prepareFlattenedSubpaths(mask, zoomScale);
  if (flattened.length === 0) {
    alpha.fill(255);
    return {
      width,
      height,
      alpha,
      stats: { subpathCount: mask.subpaths.length, flattenedSegmentCount: 0, zoomScale, effectiveFlatnessDocPx: flatnessDocPx, featherPx: mask.featherPx },
    };
  }

  const invZoom = 1 / zoomScale;
  for (let py = 0; py < height; py += 1) {
    const docY = viewport.originY + (py + 0.5) * invZoom;
    const row = py * width;
    for (let px = 0; px < width; px += 1) {
      const docX = viewport.originX + (px + 0.5) * invZoom;
      alpha[row + px] = Math.round(sdfToMaskAlpha01(evaluateFlattenedSdf(docX, docY, flattened), mask, zoomScale) * 255);
    }
  }

  return {
    width,
    height,
    alpha,
    stats: { subpathCount: flattened.length, flattenedSegmentCount: segmentCount, zoomScale, effectiveFlatnessDocPx: flatnessDocPx, featherPx: mask.featherPx },
  };
}

export function applyVectorMaskToRgba(
  source: StudioImageDataLike,
  mask: StudioVectorMask,
  viewport: VectorMaskViewport,
): StudioImageDataLike {
  const raster = rasterizeVectorMaskForViewport(mask, { ...viewport, widthPx: source.width, heightPx: source.height });
  const out = new Uint8ClampedArray(source.data);
  for (let p = 0; p < raster.alpha.length; p += 1) {
    const idx = p * 4 + 3;
    out[idx] = Math.round(((out[idx] ?? 0) * (raster.alpha[p] ?? 255)) / 255);
  }
  return { width: source.width, height: source.height, data: out };
}

// ---------------------------------------------------------------------------
// PSD `vmsk` 바이너리 및 `ag-psd` LayerVectorMask 호환 직렬화 · 역직렬화
// ---------------------------------------------------------------------------

const PSD_OP_TO_AG: Readonly<Record<VectorMaskBooleanOp, BooleanOperation>> = {
  union: "combine",
  subtract: "subtract",
  intersect: "intersect",
  exclude: "exclude",
};

const PSD_BOOL_CODE: Readonly<Record<VectorMaskBooleanOp, number>> = {
  exclude: 0,
  union: 1,
  subtract: 2,
  intersect: 3,
};

function fromPsdBoolOp(op: BooleanOperation | undefined): VectorMaskBooleanOp {
  if (op === "subtract" || op === "intersect" || op === "exclude") return op;
  return "union";
}

function decodePsdBoolCode(code: number): VectorMaskBooleanOp {
  if (code === 0) return "exclude";
  if (code === 2) return "subtract";
  if (code === 3) return "intersect";
  return "union";
}

function encodeFixed824(view: DataView, offset: number, normalized: number): void {
  view.setInt32(offset, Math.round(clamp(normalized, -128, 127.9999999) * FIXED_8_24_SCALE), false);
}

function decodeFixed824(view: DataView, offset: number): number {
  return view.getInt32(offset, false) / FIXED_8_24_SCALE;
}

export function serializeVectorMaskToPsdVmsk(
  mask: StudioVectorMask,
  documentWidth: number,
  documentHeight: number,
): PsdVectorMaskPayload {
  const safeW = Math.max(1, documentWidth);
  const safeH = Math.max(1, documentHeight);
  const paths: BezierPath[] = mask.subpaths.map((sp) => ({
    open: !sp.closed,
    operation: PSD_OP_TO_AG[sp.operation],
    fillRule: sp.fillRule === "evenodd" ? "even-odd" : "non-zero",
    knots: sp.knots.map(
      (k): BezierKnot => ({
        linked: k.linked,
        points: [k.handleIn.x, k.handleIn.y, k.anchor.x, k.anchor.y, k.handleOut.x, k.handleOut.y],
      }),
    ),
  }));

  const recordCount = mask.subpaths.reduce((acc, sp) => acc + 1 + sp.knots.length, 0);
  const binary = new Uint8Array(8 + recordCount * 26);
  const view = new DataView(binary.buffer);
  view.setUint32(0, 3, false);
  view.setUint32(4, (mask.invert ? 1 : 0) | (!mask.linked ? 2 : 0) | (!mask.enabled ? 4 : 0), false);

  let offset = 8;
  for (const sp of mask.subpaths) {
    view.setUint16(offset, sp.closed ? 0 : 3, false);
    view.setUint16(offset + 2, sp.knots.length, false);
    view.setInt16(offset + 4, PSD_BOOL_CODE[sp.operation], false);
    view.setUint16(offset + 6, sp.fillRule === "evenodd" ? 2 : 1, false);
    offset += 26;
    for (const k of sp.knots) {
      view.setUint16(offset, sp.closed ? (k.linked ? 1 : 2) : k.linked ? 4 : 5, false);
      encodeFixed824(view, offset + 2, k.handleIn.y / safeH);
      encodeFixed824(view, offset + 6, k.handleIn.x / safeW);
      encodeFixed824(view, offset + 10, k.anchor.y / safeH);
      encodeFixed824(view, offset + 14, k.anchor.x / safeW);
      encodeFixed824(view, offset + 18, k.handleOut.y / safeH);
      encodeFixed824(view, offset + 22, k.handleOut.x / safeW);
      offset += 26;
    }
  }

  return {
    tag: "vmsk",
    vectorMask: { invert: mask.invert, notLink: !mask.linked, disable: !mask.enabled, paths },
    vectorMaskFeather: mask.featherPx,
    vectorMaskDensity: Math.round(clamp01(mask.density01) * 255),
    vmskBinary: binary,
  };
}

export function deserializeVectorMaskFromPsd(
  input: LayerVectorMask,
  options: { readonly id?: string; readonly vectorMaskFeather?: number; readonly vectorMaskDensity?: number } = {},
): StudioVectorMask {
  return createVectorMask({
    id: options.id ?? "psd-vector-mask",
    enabled: input.disable !== true,
    linked: input.notLink !== true,
    invert: input.invert === true,
    featherPx: options.vectorMaskFeather ?? 0,
    density01: options.vectorMaskDensity !== undefined ? clamp01(options.vectorMaskDensity / 255) : 1,
    subpaths: input.paths.map((path, idx) => ({
      id: `subpath-${idx + 1}`,
      closed: !path.open,
      operation: fromPsdBoolOp(path.operation),
      fillRule: path.fillRule === "even-odd" ? "evenodd" : "nonzero",
      knots: path.knots.map((k): StudioVectorMaskKnot => ({
        linked: k.linked,
        handleIn: { x: k.points[0] ?? 0, y: k.points[1] ?? 0 },
        anchor: { x: k.points[2] ?? 0, y: k.points[3] ?? 0 },
        handleOut: { x: k.points[4] ?? 0, y: k.points[5] ?? 0 },
      })),
    })),
  });
}

export function deserializeVectorMaskFromVmskBinary(
  binary: Uint8Array,
  documentWidth: number,
  documentHeight: number,
  options: { readonly id?: string; readonly featherPx?: number; readonly density01?: number } = {},
): StudioVectorMask {
  if (binary.byteLength < 8) return createVectorMask({ id: options.id ?? "vmsk-empty" });
  const safeW = Math.max(1, documentWidth);
  const safeH = Math.max(1, documentHeight);
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const flags = view.getUint32(4, false);
  const subpaths: StudioVectorMaskSubpath[] = [];
  let current: { closed: boolean; operation: VectorMaskBooleanOp; fillRule: VectorMaskFillRule; knots: StudioVectorMaskKnot[] } | null = null;

  for (let offset = 8; offset + 26 <= binary.byteLength; offset += 26) {
    const selector = view.getUint16(offset, false);
    if (selector === 0 || selector === 3) {
      if (current && current.knots.length > 0) subpaths.push({ id: `vmsk-subpath-${subpaths.length + 1}`, ...current });
      current = {
        closed: selector === 0,
        operation: decodePsdBoolCode(view.getInt16(offset + 4, false)),
        fillRule: view.getUint16(offset + 6, false) === 2 ? "evenodd" : "nonzero",
        knots: [],
      };
    } else if (current && (selector === 1 || selector === 2 || selector === 4 || selector === 5)) {
      current.knots.push({
        linked: selector === 1 || selector === 4,
        handleIn: { x: decodeFixed824(view, offset + 6) * safeW, y: decodeFixed824(view, offset + 2) * safeH },
        anchor: { x: decodeFixed824(view, offset + 14) * safeW, y: decodeFixed824(view, offset + 10) * safeH },
        handleOut: { x: decodeFixed824(view, offset + 22) * safeW, y: decodeFixed824(view, offset + 18) * safeH },
      });
    }
  }
  if (current && current.knots.length > 0) subpaths.push({ id: `vmsk-subpath-${subpaths.length + 1}`, ...current });

  return createVectorMask({
    id: options.id ?? "vmsk-decoded",
    enabled: (flags & 4) === 0,
    linked: (flags & 2) === 0,
    invert: (flags & 1) !== 0,
    featherPx: options.featherPx ?? 0,
    density01: options.density01 ?? 1,
    subpaths,
  });
}
