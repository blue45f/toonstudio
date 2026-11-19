/** 스케치 좌표는 용지 너비·높이로 정규화해 화면 크기에 관계없이 다시 편집한다. */
export type Point = { x: number; y: number };
export type Stroke = { points: Point[]; color: string; size: number; erase?: boolean };
export const PAPER = "#f7f0e3";
export const INK = "#322b28";
export const MAX_STROKES = 160;
export const MAX_POINTS = 12000;
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function validStrokes(value: unknown): value is Stroke[] {
  if (!Array.isArray(value) || value.length > MAX_STROKES) return false;
  let count = 0;
  return value.every((stroke: unknown) => {
    if (!stroke || typeof stroke !== "object") return false;
    const s = stroke as Stroke;
    if (typeof s.color !== "string" || !/^#[\da-f]{6}$/i.test(s.color) || !Number.isFinite(s.size) || s.size < 1 || s.size > 40 || (s.erase !== undefined && typeof s.erase !== "boolean") || !Array.isArray(s.points) || !s.points.length) return false;
    count += s.points.length;
    return count <= MAX_POINTS && s.points.every((p: Point) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  });
}

export function pointPath(points: Point[], width = 960, height = 600): string {
  if (!points.length) return "";
  const xy = (p: Point) => `${(p.x * width).toFixed(2)} ${(p.y * height).toFixed(2)}`;
  if (points.length < 3) return `M ${xy(points[0])} ${points.slice(1).map((p) => `L ${xy(p)}`).join(" ")}`;
  return `M ${xy(points[0])} ${points.slice(1, -1).map((p, i) => `Q ${xy(p)} ${xy({ x: (p.x + points[i + 2].x) / 2, y: (p.y + points[i + 2].y) / 2 })}`).join(" ")} L ${xy(points[points.length - 1])}`;
}
