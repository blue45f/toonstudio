import type { RawSample } from "../../engine/core/types";

/**
 * 비교 시트용 획 3종(결정적): 압력 램프, 급선회, 빠른 휘갈김. 좌표는 256 px 캔버스 기준이며 `size`로 비례 확대한다.
 * 시간축(ms)은 캔버스와 무관하게 고정이라 캔버스가 커지면 속도(px/s)가 비례해 커진다.
 */

export const STROKE_SET_IDS = ["pressure-ramp", "sharp-turn", "fast-scribble"] as const;
export type StrokeSetId = (typeof STROKE_SET_IDS)[number];

export interface NamedStroke {
  id: StrokeSetId;
  /** 시트 라벨(영문 대문자 — 비트맵 글꼴이 한글을 그리지 못한다). */
  label: string;
  descriptionKo: string;
  samples: RawSample[];
  /** 경로 길이(px). */
  pathLengthPx: number;
  /** 평균 속도(px/s). */
  meanSpeedPxPerSec: number;
}

const RATE_HZ = 240;
const DT_MS = 1000 / RATE_HZ;

function sample(x: number, y: number, tMs: number, pressure: number, phase: RawSample["phase"]): RawSample {
  return { x, y, tMs, pressure, tiltXDeg: 0, tiltYDeg: 0, twistDeg: 0, pointerType: "pen", phase, source: "raw" };
}

/** 매개변수 u ∈ [0,1]의 점·압력 함수로 `durationMs` 동안의 240 Hz 표본을 만든다. */
function parametric(durationMs: number, pointAt: (u: number) => readonly [number, number], pressureAt: (u: number) => number): RawSample[] {
  const count = Math.round(durationMs / DT_MS) + 1;
  const out: RawSample[] = [];
  for (let i = 0; i < count; i += 1) {
    const u = i / (count - 1);
    const [x, y] = pointAt(u);
    out.push(sample(x, y, i * DT_MS, pressureAt(u), i === 0 ? "down" : i === count - 1 ? "up" : "move"));
  }
  return out;
}

/** 꺾은선을 일정 속도로 지나는 표본. */
function polylineAtSpeed(points: readonly (readonly [number, number])[], speedPxPerSec: number, pressure: number): RawSample[] {
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] ?? [0, 0];
    const b = points[i] ?? [0, 0];
    cum.push((cum[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1] ?? 0;
  const durationMs = (total / speedPxPerSec) * 1000;
  return parametric(
    durationMs,
    (u) => {
      const s = u * total;
      let seg = 1;
      while (seg < cum.length - 1 && (cum[seg] ?? 0) < s) seg += 1;
      const a = points[seg - 1] ?? [0, 0];
      const b = points[seg] ?? [0, 0];
      const span = (cum[seg] ?? 0) - (cum[seg - 1] ?? 0);
      const f = span > 0 ? (s - (cum[seg - 1] ?? 0)) / span : 0;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    },
    () => pressure,
  );
}

function pathLength(samples: readonly RawSample[]): number {
  let len = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (a && b) len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

function scaled(samples: RawSample[], k: number): RawSample[] {
  return samples.map((s) => ({ ...s, x: s.x * k, y: s.y * k }));
}

function named(id: StrokeSetId, label: string, descriptionKo: string, samples: RawSample[]): NamedStroke {
  const len = pathLength(samples);
  const durationSec = ((samples[samples.length - 1]?.tMs ?? 0) - (samples[0]?.tMs ?? 0)) / 1000;
  return { id, label, descriptionKo, samples, pathLengthPx: len, meanSpeedPxPerSec: durationSec > 0 ? len / durationSec : 0 };
}

/** 같은 획 세트(압력 램프·급선회·빠른 휘갈김)를 `size` px 캔버스에 맞춰 만든다. */
export function buildStrokeSet(size = 256): NamedStroke[] {
  const k = size / 256;
  const ramp = parametric(1400, (u) => [22 + 212 * u, 128 + 18 * Math.sin(u * Math.PI)], (u) => 0.05 + 0.95 * u);
  const turn = polylineAtSpeed(
    [
      [26, 212],
      [206, 212],
      [62, 58],
      [226, 36],
    ],
    520,
    0.7,
  );
  const scribble = parametric(
    700,
    (u) => [26 + 204 * u + 20 * Math.sin(2 * Math.PI * 7 * u), 128 + 86 * Math.sin(2 * Math.PI * 3.5 * u)],
    () => 0.75,
  );
  return [
    named("pressure-ramp", "RAMP", "압력 0.05에서 1.0까지 1.4초 동안 올리는 느린 가로선(약 150 px/s) — 압력 → 벌어짐, 압력 0.9 이상의 좌굴 곡선", scaled(ramp, k)),
    named("sharp-turn", "TURN", "약 520 px/s로 달리다 두 번 급선회하는 꺾은선(135°·약 120°) — 선회 때 털이 부채꼴로 벌어지는지", scaled(turn, k)),
    named("fast-scribble", "SCRIBBLE", "0.7초 안에 휘갈기는 사인 곡선(평균 약 1,700 px/s) — 빠른 획에서 털 가닥이 끊기거나 흩어지는지", scaled(scribble, k)),
  ];
}
