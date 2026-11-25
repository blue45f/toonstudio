/** 썸네일에서 보이는 최소 선 두께를 적용한다. 그리지 않는 획은 0으로 둔다. */
export function clampThumbStroke(width: number, minStroke: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0;
  return Math.max(width, minStroke);
}

/** 양 끝점을 보존하며 썸네일에 그릴 좌표 쌍을 균등하게 추린다. */
export function downsamplePoints(points: number[], maxPoints = 24): number[] {
  const n = Math.floor(points.length / 2);
  if (n <= maxPoints) return points.slice(0, n * 2);
  const out: number[] = [];
  const step = (n - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step) * 2;
    out.push(points[idx] ?? 0, points[idx + 1] ?? 0);
  }
  return out;
}
