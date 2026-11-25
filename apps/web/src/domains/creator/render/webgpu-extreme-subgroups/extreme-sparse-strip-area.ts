import type { SparseStripDescriptor } from "./extreme-webgpu-runtime-bridge";

/** 교차·픽셀 경계에서 구간을 나눈 뒤 와인딩별 채움 폭을 적분한다. signed area 합을 clamp하면 겹친 윤곽의 면적을 잃는다. */
export function exactStripPixelCoverage(strip: SparseStripDescriptor, px: number, py: number, rule: "nonzero" | "evenodd"): number {
  const edges = strip.segments.filter((segment) => Math.abs(segment.y1 - segment.y0) > 1e-6).map((segment) => ({
    slope: (segment.x1 - segment.x0) / (segment.y1 - segment.y0),
    intercept: segment.x0 - ((segment.x1 - segment.x0) / (segment.y1 - segment.y0)) * segment.y0,
    low: Math.min(segment.y0, segment.y1), high: Math.max(segment.y0, segment.y1),
    direction: segment.y1 > segment.y0 ? 1 : -1,
  }));
  const cuts = [py, py + 1];
  const addCut = (y: number, low: number, high: number): void => {
    if (Number.isFinite(y) && y > Math.max(py, low) && y < Math.min(py + 1, high)) cuts.push(y);
  };
  for (const edge of edges) {
    addCut(edge.low, py, py + 1); addCut(edge.high, py, py + 1);
    if (edge.slope !== 0) for (const x of [px, px + 1]) addCut((x - edge.intercept) / edge.slope, edge.low, edge.high);
  }
  for (let i = 0; i < edges.length; i += 1) {
    const a = edges[i]; if (!a) continue;
    for (const b of edges.slice(i + 1)) {
      if (a.slope !== b.slope) addCut((b.intercept - a.intercept) / (a.slope - b.slope), Math.max(a.low, b.low), Math.min(a.high, b.high));
    }
  }
  const filledWidth = (y: number): number => {
    let winding = strip.backdropWinding;
    const crossings: { x: number; direction: number }[] = [];
    for (const edge of edges) {
      if (y <= edge.low || y >= edge.high) continue;
      const x = edge.slope * y + edge.intercept;
      if (x <= px) winding += edge.direction;
      else if (x < px + 1) crossings.push({ x, direction: edge.direction });
    }
    crossings.sort((a, b) => a.x - b.x);
    const filled = (): boolean => rule === "evenodd" ? Math.abs(winding) % 2 === 1 : winding !== 0;
    let cursor = px; let width = 0;
    for (const crossing of crossings) {
      if (filled()) width += crossing.x - cursor;
      winding += crossing.direction; cursor = crossing.x;
    }
    return width + (filled() ? px + 1 - cursor : 0);
  };
  cuts.sort((a, b) => a - b);
  let area = 0;
  for (let i = 1; i < cuts.length; i += 1) {
    const low = cuts[i - 1] ?? py; const high = cuts[i] ?? low; const span = high - low;
    if (span > 0) area += span * (filledWidth(low + span * 0.25) + filledWidth(low + span * 0.75)) * 0.5;
  }
  return Math.max(0, Math.min(1, area));
}
