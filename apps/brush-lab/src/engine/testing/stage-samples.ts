import type { RawSample } from "../core/types";

/** 단계 테스트 전용 표본 생성기(테스트 파일만 import한다). */
export function rawSample(x: number, y: number, tMs: number, phase: RawSample["phase"], over: Partial<RawSample> = {}): RawSample {
  return {
    x,
    y,
    tMs,
    pressure: 0.6,
    tiltXDeg: 5,
    tiltYDeg: 6,
    twistDeg: 0,
    pointerType: "pen",
    phase,
    source: "raw",
    ...over,
  };
}

/** 폴리라인을 등속 `speedPxPerMs`로 따라가는 표본열(꼭짓점은 항상 표본이다). down/up 포함. */
export function polylineSamples(points: readonly (readonly [number, number])[], speedPxPerMs: number, rateHz = 240): RawSample[] {
  const dt = 1000 / rateHz;
  const out: RawSample[] = [];
  let t = 0;
  const first = points[0];
  if (!first) return out;
  out.push(rawSample(first[0], first[1], 0, "down"));
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dur = len / speedPxPerMs;
    const n = Math.max(1, Math.round(dur / dt));
    for (let k = 1; k <= n; k += 1) {
      const u = k / n;
      t += dur / n;
      out.push(rawSample(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, t, k === n && i === points.length - 1 ? "up" : "move"));
    }
  }
  return out;
}
