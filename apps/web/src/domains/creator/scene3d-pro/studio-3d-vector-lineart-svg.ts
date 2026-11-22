/**
 * 3D→웹툰 벡터 강약선 추출기용 폴리라인 체이닝·단순화·가변 폭 리본/중심선 SVG 빌더.
 */

import { clamp01, type VectorLineArtVec3 } from "./studio-3d-vector-lineart-math";

export type VectorLineArtEdgeKind =
  | "silhouette"
  | "crease"
  | "boundary"
  | "material-boundary";

export type VectorLineArtSvgRenderMode =
  | "variable-ribbon"
  | "centerline-stroke"
  | "both";

export interface VectorLineArtPoint {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly widthPx: number;
  /** 표면 법선과 시선 벡터 간 경사각(도, 90°에 가까울수록 실루엣 경사). */
  readonly grazingAngleDeg: number;
  readonly worldPosition: VectorLineArtVec3;
}

export interface VectorLineArtPolyline {
  readonly id: string;
  readonly kind: VectorLineArtEdgeKind;
  readonly closed: boolean;
  readonly points: readonly VectorLineArtPoint[];
  readonly averageWidthPx: number;
  readonly minWidthPx: number;
  readonly maxWidthPx: number;
  /** 제어점 편집용 중심선 SVG `d` 경로. */
  readonly centerlinePathData: string;
  /** 강약선 시각 표현용 닫힌 가변 폭 리본 SVG `d` 경로. */
  readonly variableWidthPathData: string;
}

export interface VisibleEdgeSegment {
  readonly kind: VectorLineArtEdgeKind;
  readonly ax: number;
  readonly ay: number;
  readonly az: number;
  readonly bx: number;
  readonly by: number;
  readonly bz: number;
  readonly sax: number;
  readonly say: number;
  readonly saDepth: number;
  readonly sbx: number;
  readonly sby: number;
  readonly sbDepth: number;
  readonly avgNx: number;
  readonly avgNy: number;
  readonly avgNz: number;
  readonly dihedralAngleDeg: number;
}

export interface RawChainVertex {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly wx: number;
  readonly wy: number;
  readonly wz: number;
  readonly avgNx: number;
  readonly avgNy: number;
  readonly avgNz: number;
  readonly dihedralAngleDeg: number;
}

export interface RawPolylineChain {
  readonly kind: VectorLineArtEdgeKind;
  readonly vertices: readonly RawChainVertex[];
  readonly closed: boolean;
}

export function sanitizeSvgColor(raw: string): string {
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{3,8}$/u.test(trimmed)) return trimmed;
  if (/^(?:rgb|hsl)a?\([0-9.,%\s/]+\)$/u.test(trimmed)) return trimmed;
  if (/^[a-zA-Z]{3,20}$/u.test(trimmed)) return trimmed;
  return "#111111";
}

function fmt(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(2);
}

function makeChainVertex(seg: VisibleEdgeSegment, end: "a" | "b"): RawChainVertex {
  if (end === "a") {
    return {
      x: seg.sax, y: seg.say, depth: seg.saDepth,
      wx: seg.ax, wy: seg.ay, wz: seg.az,
      avgNx: seg.avgNx, avgNy: seg.avgNy, avgNz: seg.avgNz,
      dihedralAngleDeg: seg.dihedralAngleDeg,
    };
  }
  return {
    x: seg.sbx, y: seg.sby, depth: seg.sbDepth,
    wx: seg.bx, wy: seg.by, wz: seg.bz,
    avgNx: seg.avgNx, avgNy: seg.avgNy, avgNz: seg.avgNz,
    dihedralAngleDeg: seg.dihedralAngleDeg,
  };
}

/** 동일 엣지 종류의 가시 세그먼트들을 끝점 근접성 기준으로 연속 폴리라인 체인으로 연결한다. */
export function chainVisibleSegments(
  segments: readonly VisibleEdgeSegment[],
  tolerancePx: number,
): readonly RawPolylineChain[] {
  const byKind = new Map<VectorLineArtEdgeKind, VisibleEdgeSegment[]>();
  for (const seg of segments) {
    const list = byKind.get(seg.kind);
    if (list) list.push(seg);
    else byKind.set(seg.kind, [seg]);
  }

  const tolSq = tolerancePx * tolerancePx;
  const chains: RawPolylineChain[] = [];

  for (const [kind, kindSegs] of byKind) {
    const used = new Uint8Array(kindSegs.length);
    for (let start = 0; start < kindSegs.length; start += 1) {
      if (used[start]) continue;
      const seed = kindSegs[start];
      if (!seed) continue;
      used[start] = 1;
      const chain: RawChainVertex[] = [makeChainVertex(seed, "a"), makeChainVertex(seed, "b")];

      const extendEnd = (atTail: boolean) => {
        for (;;) {
          const anchor = atTail ? chain[chain.length - 1] : chain[0];
          if (!anchor) break;
          let bestIdx = -1;
          let bestDistSq = tolSq;
          let bestNextEnd: "a" | "b" = "b";
          for (let i = 0; i < kindSegs.length; i += 1) {
            if (used[i]) continue;
            const cand = kindSegs[i];
            if (!cand) continue;
            const dASq = (cand.sax - anchor.x) ** 2 + (cand.say - anchor.y) ** 2;
            if (dASq <= bestDistSq) {
              bestDistSq = dASq;
              bestIdx = i;
              bestNextEnd = "b";
            }
            const dBSq = (cand.sbx - anchor.x) ** 2 + (cand.sby - anchor.y) ** 2;
            if (dBSq <= bestDistSq) {
              bestDistSq = dBSq;
              bestIdx = i;
              bestNextEnd = "a";
            }
          }
          if (bestIdx < 0) break;
          const chosen = kindSegs[bestIdx];
          if (!chosen) break;
          used[bestIdx] = 1;
          const nextVert = makeChainVertex(chosen, bestNextEnd);
          if (atTail) chain.push(nextVert);
          else chain.unshift(nextVert);
        }
      };

      extendEnd(true);
      extendEnd(false);

      const first = chain[0];
      const last = chain[chain.length - 1];
      let closed = false;
      if (chain.length >= 4 && first && last) {
        const closeDistSq = (first.x - last.x) ** 2 + (first.y - last.y) ** 2;
        if (closeDistSq <= tolSq) {
          closed = true;
          chain.pop();
        }
      }

      // 2점 열린 직선 세그먼트도 원근·테이퍼 강약 변화를 표현하도록 중간점을 보간한다.
      if (!closed && chain.length === 2 && first && last) {
        const interp = (t: number): RawChainVertex => ({
          x: first.x + (last.x - first.x) * t,
          y: first.y + (last.y - first.y) * t,
          depth: first.depth + (last.depth - first.depth) * t,
          wx: first.wx + (last.wx - first.wx) * t,
          wy: first.wy + (last.wy - first.wy) * t,
          wz: first.wz + (last.wz - first.wz) * t,
          avgNx: first.avgNx,
          avgNy: first.avgNy,
          avgNz: first.avgNz,
          dihedralAngleDeg: first.dihedralAngleDeg,
        });
        chains.push({
          kind,
          vertices: [first, interp(0.25), interp(0.5), interp(0.75), last],
          closed: false,
        });
      } else {
        chains.push({ kind, vertices: chain, closed });
      }
    }
  }

  return chains;
}

/** 굵기 변화점을 보존하는 Douglas–Peucker 폴리라인 단순화. */
export function simplifyChainPoints(
  points: readonly VectorLineArtPoint[],
  tolerancePx: number,
  closed: boolean,
): readonly VectorLineArtPoint[] {
  if (closed || tolerancePx <= 0 || points.length <= 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const range = stack.pop();
    if (!range) break;
    const [startIdx, endIdx] = range;
    if (endIdx - startIdx <= 1) continue;
    const a = points[startIdx];
    const b = points[endIdx];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;

    let maxDist = -1;
    let splitIdx = -1;
    for (let i = startIdx + 1; i < endIdx; i += 1) {
      const p = points[i];
      if (!p) continue;
      let dist: number;
      if (lenSq <= 1e-10) {
        dist = Math.hypot(p.x - a.x, p.y - a.y);
      } else {
        const proj = clamp01(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq);
        dist = Math.hypot(p.x - (a.x + proj * dx), p.y - (a.y + proj * dy));
      }
      const widthDelta = Math.abs(p.widthPx - (a.widthPx + b.widthPx) * 0.5);
      const effectiveDist = dist + widthDelta * 0.5;
      if (effectiveDist > maxDist) {
        maxDist = effectiveDist;
        splitIdx = i;
      }
    }
    if (maxDist > tolerancePx && splitIdx > startIdx) {
      keep[splitIdx] = 1;
      stack.push([startIdx, splitIdx], [splitIdx, endIdx]);
    }
  }

  const out: VectorLineArtPoint[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const pt = points[i];
    if (keep[i] && pt) out.push(pt);
  }
  return out;
}

export function buildCenterlineSvgPath(points: readonly VectorLineArtPoint[], closed: boolean): string {
  const first = points[0];
  if (!first) return "";
  const parts: string[] = [`M ${fmt(first.x)} ${fmt(first.y)}`];
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    if (p) parts.push(`L ${fmt(p.x)} ${fmt(p.y)}`);
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

export function buildVariableWidthRibbonPath(points: readonly VectorLineArtPoint[], closed: boolean): string {
  const n = points.length;
  if (n < 2) return "";

  const left: [number, number][] = [];
  const right: [number, number][] = [];

  for (let i = 0; i < n; i += 1) {
    const cur = points[i];
    if (!cur) continue;
    const prev = i > 0 ? points[i - 1] : closed ? points[n - 1] : cur;
    const next = i < n - 1 ? points[i + 1] : closed ? points[0] : cur;
    if (!prev || !next) continue;

    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    let len = Math.hypot(tx, ty);
    if (len <= 1e-6) {
      tx = cur.x - prev.x;
      ty = cur.y - prev.y;
      len = Math.hypot(tx, ty);
    }
    if (len <= 1e-6) {
      tx = 1;
      ty = 0;
      len = 1;
    }
    const nx = -ty / len;
    const ny = tx / len;
    const halfW = cur.widthPx * 0.5;
    left.push([cur.x + nx * halfW, cur.y + ny * halfW]);
    right.push([cur.x - nx * halfW, cur.y - ny * halfW]);
  }

  const firstLeft = left[0];
  if (!firstLeft) return "";
  const parts: string[] = [`M ${fmt(firstLeft[0])} ${fmt(firstLeft[1])}`];
  for (let i = 1; i < left.length; i += 1) {
    const pt = left[i];
    if (pt) parts.push(`L ${fmt(pt[0])} ${fmt(pt[1])}`);
  }
  if (closed) {
    parts.push("Z");
    const lastRight = right[right.length - 1];
    if (lastRight) parts.push(`M ${fmt(lastRight[0])} ${fmt(lastRight[1])}`);
    for (let i = right.length - 2; i >= 0; i -= 1) {
      const pt = right[i];
      if (pt) parts.push(`L ${fmt(pt[0])} ${fmt(pt[1])}`);
    }
  } else {
    for (let i = right.length - 1; i >= 0; i -= 1) {
      const pt = right[i];
      if (pt) parts.push(`L ${fmt(pt[0])} ${fmt(pt[1])}`);
    }
  }
  parts.push("Z");
  return parts.join(" ");
}

export function assembleVectorLineArtSvg(
  polylines: readonly VectorLineArtPolyline[],
  viewportWidth: number,
  viewportHeight: number,
  strokeColor: string,
  svgRenderMode: VectorLineArtSvgRenderMode,
): string {
  const w = Math.max(1, Math.round(viewportWidth));
  const h = Math.max(1, Math.round(viewportHeight));
  const groups: VectorLineArtEdgeKind[] = ["silhouette", "boundary", "crease", "material-boundary"];
  const groupMarkup: string[] = [];

  for (const kind of groups) {
    const kindLines = polylines.filter((line) => line.kind === kind);
    if (kindLines.length === 0) continue;
    const paths: string[] = [];
    for (const line of kindLines) {
      if (svgRenderMode === "variable-ribbon" || svgRenderMode === "both") {
        paths.push(
          `    <path id="${line.id}-ribbon" data-edge-kind="${kind}" data-avg-width="${fmt(line.averageWidthPx)}" data-centerline-d="${line.centerlinePathData}" d="${line.variableWidthPathData}" fill="${strokeColor}" fill-rule="evenodd" />`,
        );
      }
      if (svgRenderMode === "centerline-stroke" || svgRenderMode === "both") {
        paths.push(
          `    <path id="${line.id}-centerline" data-edge-kind="${kind}" d="${line.centerlinePathData}" fill="none" stroke="${strokeColor}" stroke-width="${fmt(line.averageWidthPx)}" stroke-linecap="round" stroke-linejoin="round" />`,
        );
      }
    }
    groupMarkup.push(
      `  <g id="lineart-${kind}" data-edge-kind="${kind}" data-polyline-count="${kindLines.length}">\n${paths.join("\n")}\n  </g>`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" data-generator="toonstudio-cleanroom-3d-lineart">`,
    ...groupMarkup,
    `</svg>`,
  ].join("\n");
}
