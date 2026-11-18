/**
 * 클립스튜디오 페인트 5.1.5 `괘선(Ruled line)` 장식 브러시 경로 변환 엔진.
 *
 * 역공학 행동 기준 근거 (REA MCP 정적 분석):
 * - `EditImageTool.todb` (`ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`):
 *   `Decoration > Ruled line` 서브툴 트리 (`Waved line` var=144, `Rough edged` var=253,
 *   `Bumpy` var=255, `Dotted line` var=257, `Dashed line` var=259, `Star` var=371, `Melody` var=379).
 *
 * 입력 폴리라인을 호 길이(Arc-length)로 매개변수화하여 파선(Dash), 점선(Dot), 물결선(Wave),
 * 거친 외곽선(Rough), 울퉁불퉁한 선(Bumpy) 서브스트로크 집합으로 결정론적으로 변환한다.
 */

export type StudioRuledLineMode =
  | "none"
  | "dashed"
  | "dotted"
  | "waved"
  | "rough-edged"
  | "bumpy";

export interface StudioRuledLineConfig {
  readonly mode: StudioRuledLineMode;
  /** 파선 1획의 길이(px, 2..200). */
  readonly dashLengthPx: number;
  /** 파선·점선 사이 빈 간격(px, 2..200). */
  readonly gapLengthPx: number;
  /** 물결·울퉁불퉁 법선 변위 진폭(px, 0.5..80). */
  readonly amplitudePx: number;
  /** 물결 1주기 파장(px, 4..240). */
  readonly wavelengthPx: number;
  /** 결정론적 시드. */
  readonly seed: number;
}

export interface StudioPoint2D {
  readonly x: number;
  readonly y: number;
}

export const DEFAULT_STUDIO_RULED_LINE_CONFIG: StudioRuledLineConfig = Object.freeze({
  mode: "none",
  dashLengthPx: 14,
  gapLengthPx: 8,
  amplitudePx: 4,
  wavelengthPx: 24,
  seed: 1337,
});

export function normalizeStudioRuledLineConfig(
  input?: Partial<StudioRuledLineConfig> | null,
): StudioRuledLineConfig {
  if (!input) return DEFAULT_STUDIO_RULED_LINE_CONFIG;
  const validModes: readonly StudioRuledLineMode[] = [
    "none",
    "dashed",
    "dotted",
    "waved",
    "rough-edged",
    "bumpy",
  ];
  const mode: StudioRuledLineMode = validModes.includes(input.mode as StudioRuledLineMode)
    ? (input.mode as StudioRuledLineMode)
    : "none";
  const clamp = (v: unknown, min: number, max: number, fb: number): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fb;
  return {
    mode,
    dashLengthPx: clamp(input.dashLengthPx, 2, 200, DEFAULT_STUDIO_RULED_LINE_CONFIG.dashLengthPx),
    gapLengthPx: clamp(input.gapLengthPx, 2, 200, DEFAULT_STUDIO_RULED_LINE_CONFIG.gapLengthPx),
    amplitudePx: clamp(input.amplitudePx, 0.5, 80, DEFAULT_STUDIO_RULED_LINE_CONFIG.amplitudePx),
    wavelengthPx: clamp(input.wavelengthPx, 4, 240, DEFAULT_STUDIO_RULED_LINE_CONFIG.wavelengthPx),
    seed: typeof input.seed === "number" && Number.isFinite(input.seed) ? Math.trunc(input.seed) : 1337,
  };
}

function hashUnitSigned(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h / 0xffffffff) * 2 - 1;
}

interface ArcStation {
  readonly x: number;
  readonly y: number;
  readonly nx: number;
  readonly ny: number;
  readonly s: number;
}

function buildArcLengthTable(points: readonly StudioPoint2D[]): {
  readonly stations: readonly ArcStation[];
  readonly totalLength: number;
} {
  if (points.length === 0) return { stations: [], totalLength: 0 };
  if (points.length === 1) {
    return {
      stations: [{ x: points[0]!.x, y: points[0]!.y, nx: 0, ny: -1, s: 0 }],
      totalLength: 0,
    };
  }
  const stations: ArcStation[] = [];
  let accum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const curr = points[i]!;
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    if (i > 0) {
      accum += Math.hypot(curr.x - prev.x, curr.y - prev.y);
    }
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tLen = Math.hypot(tx, ty) || 1;
    stations.push({
      x: curr.x,
      y: curr.y,
      nx: -ty / tLen,
      ny: tx / tLen,
      s: accum,
    });
  }
  return { stations, totalLength: accum };
}

function sampleAtArcLength(stations: readonly ArcStation[], targetS: number): ArcStation {
  if (stations.length === 1) return stations[0]!;
  if (targetS <= 0) return stations[0]!;
  const last = stations[stations.length - 1]!;
  if (targetS >= last.s) return last;

  let lo = 0;
  let hi = stations.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (stations[mid]!.s <= targetS) lo = mid;
    else hi = mid;
  }
  const a = stations[lo]!;
  const b = stations[hi]!;
  const span = Math.max(1e-6, b.s - a.s);
  const t = (targetS - a.s) / span;
  const nxRaw = a.nx + (b.nx - a.nx) * t;
  const nyRaw = a.ny + (b.ny - a.ny) * t;
  const nLen = Math.hypot(nxRaw, nyRaw) || 1;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    nx: nxRaw / nLen,
    ny: nyRaw / nLen,
    s: targetS,
  };
}

/**
 * 입력 폴리라인을 선택한 괘선 모드의 서브 폴리라인 배열로 변환한다.
 * - `dashed`: `[dash, gap]` 주기로 끊어진 선분 배열
 * - `dotted`: 일정 간격 점 위치의 짧은 캡 선분 배열
 * - `waved` / `rough-edged` / `bumpy`: 법선 방향 주기·시드 변위가 적용된 단일 연속 폴리라인
 */
export function transformStrokeWithRuledLine(
  points: readonly StudioPoint2D[],
  rawConfig: StudioRuledLineConfig,
): StudioPoint2D[][] {
  const config = normalizeStudioRuledLineConfig(rawConfig);
  if (points.length === 0) return [];
  if (config.mode === "none" || points.length === 1) {
    return [[...points]];
  }

  const { stations, totalLength } = buildArcLengthTable(points);
  if (totalLength < 1e-3) return [[points[0]!]];

  if (config.mode === "dashed") {
    const period = config.dashLengthPx + config.gapLengthPx;
    const segments: StudioPoint2D[][] = [];
    for (let cursor = 0; cursor < totalLength; cursor += period) {
      const endS = Math.min(totalLength, cursor + config.dashLengthPx);
      if (endS - cursor < 0.25) continue;
      const steps = Math.max(1, Math.ceil((endS - cursor) / 4));
      const seg: StudioPoint2D[] = [];
      for (let k = 0; k <= steps; k += 1) {
        const st = sampleAtArcLength(stations, cursor + ((endS - cursor) * k) / steps);
        seg.push({ x: st.x, y: st.y });
      }
      segments.push(seg);
    }
    return segments;
  }

  if (config.mode === "dotted") {
    const stepPx = Math.max(2, config.gapLengthPx);
    const dots: StudioPoint2D[][] = [];
    for (let cursor = 0; cursor <= totalLength; cursor += stepPx) {
      const st = sampleAtArcLength(stations, cursor);
      dots.push([
        { x: st.x, y: st.y },
        { x: st.x + 0.01, y: st.y },
      ]);
    }
    return dots;
  }

  const sampleStep = Math.max(1.5, Math.min(4, config.wavelengthPx / 8));
  const count = Math.max(2, Math.ceil(totalLength / sampleStep));
  const displaced: StudioPoint2D[] = [];

  for (let i = 0; i <= count; i += 1) {
    const s = (totalLength * i) / count;
    const st = sampleAtArcLength(stations, s);
    let offset = 0;
    if (config.mode === "waved") {
      offset = Math.sin((2 * Math.PI * s) / config.wavelengthPx) * config.amplitudePx;
    } else if (config.mode === "bumpy") {
      const halfWave = Math.abs(Math.sin((Math.PI * s) / config.wavelengthPx));
      const jitter = 0.7 + 0.3 * hashUnitSigned(config.seed, Math.floor(s / config.wavelengthPx));
      offset = (halfWave * 2 - 1) * config.amplitudePx * jitter;
    } else if (config.mode === "rough-edged") {
      const cell = s / Math.max(2, config.wavelengthPx * 0.25);
      const c0 = Math.floor(cell);
      const frac = cell - c0;
      const smooth = frac * frac * (3 - 2 * frac);
      const n0 = hashUnitSigned(config.seed, c0);
      const n1 = hashUnitSigned(config.seed, c0 + 1);
      offset = (n0 + (n1 - n0) * smooth) * config.amplitudePx;
    }
    displaced.push({
      x: st.x + st.nx * offset,
      y: st.y + st.ny * offset,
    });
  }

  return [displaced];
}
