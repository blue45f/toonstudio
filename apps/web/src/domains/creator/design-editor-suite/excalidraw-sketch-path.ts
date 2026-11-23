/**
 * Excalidraw 스타일 손그림 스케치 경로 변환기
 * 결정론적 Mulberry32 시드 PRNG로 다각형·사각형·화살표를 유기적 이중 3차 베지어 경로로 변환한다.
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface RoughifyOptions {
  readonly roughness?: number;
  readonly bowing?: number;
  readonly closed?: boolean;
  readonly doubleStroke?: boolean;
  readonly overshoot?: number;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function createSeededRandom(seed: number): () => number {
  let state = (Math.floor(finiteOr(seed, 1)) ^ 0x6d2b79f5) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function buildRoughSegment(
  p0: Point2D,
  p1: Point2D,
  rand: () => number,
  roughness: number,
  bowing: number,
  overshoot: number,
): string {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const length = Math.hypot(dx, dy);
  if (length < 0.01) return "";

  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;

  const maxOffset = Math.min(roughness * 2.1, length * 0.095);
  const jitter = () => (rand() * 2 - 1) * maxOffset;

  const startOver = (rand() * 0.6 + 0.2) * Math.min(overshoot, length * 0.06);
  const endOver = (rand() * 0.6 + 0.2) * Math.min(overshoot, length * 0.06);

  const sx = p0.x - ux * startOver + jitter() * 0.45;
  const sy = p0.y - uy * startOver + jitter() * 0.45;
  const ex = p1.x + ux * endOver + jitter() * 0.45;
  const ey = p1.y + uy * endOver + jitter() * 0.45;

  const bowDir = rand() > 0.5 ? 1 : -1;
  const bowOffset = bowDir * bowing * Math.min(roughness * 1.4, length * 0.05) * (0.45 + rand() * 0.55);

  const t1 = 0.28 + rand() * 0.12;
  const t2 = 0.62 + rand() * 0.14;

  const c1x = p0.x + dx * t1 + nx * bowOffset + jitter() * 0.5;
  const c1y = p0.y + dy * t1 + ny * bowOffset + jitter() * 0.5;
  const c2x = p0.x + dx * t2 + nx * (bowOffset * 0.85) + jitter() * 0.5;
  const c2y = p0.y + dy * t2 + ny * (bowOffset * 0.85) + jitter() * 0.5;

  return `M ${round2(sx)} ${round2(sy)} C ${round2(c1x)} ${round2(c1y)} ${round2(c2x)} ${round2(c2y)} ${round2(ex)} ${round2(ey)}`;
}

/**
 * 다각형 또는 폴리라인 좌표를 유기적 3차 베지어 이중 스트로크 SVG path로 변환한다.
 */
export function roughifyPolygonPath(
  points: readonly Point2D[],
  seed: number,
  options: RoughifyOptions = {},
): string {
  const validPoints = points.filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y));
  if (validPoints.length < 2) return "";

  const roughness = Math.max(0.2, finiteOr(options.roughness, 1.8));
  const bowing = Math.max(0, finiteOr(options.bowing, 1.1));
  const closed = options.closed ?? validPoints.length >= 3;
  const doubleStroke = options.doubleStroke ?? true;
  const overshoot = Math.max(0, finiteOr(options.overshoot, 2.2));

  const segmentPairs: Array<readonly [Point2D, Point2D]> = [];
  for (let i = 0; i < validPoints.length - 1; i += 1) {
    segmentPairs.push([validPoints[i], validPoints[i + 1]]);
  }
  if (closed && validPoints.length >= 3) {
    segmentPairs.push([validPoints[validPoints.length - 1], validPoints[0]]);
  }

  const commands: string[] = [];
  const randPrimary = createSeededRandom(seed);
  for (const [p0, p1] of segmentPairs) {
    const seg = buildRoughSegment(p0, p1, randPrimary, roughness, bowing, overshoot);
    if (seg) commands.push(seg);
  }

  if (doubleStroke) {
    const randSecondary = createSeededRandom(seed + 1013);
    for (const [p0, p1] of segmentPairs) {
      const seg = buildRoughSegment(
        p0,
        p1,
        randSecondary,
        roughness * 0.88,
        bowing * 1.15,
        overshoot * 0.8,
      );
      if (seg) commands.push(seg);
    }
  }

  return commands.join(" ");
}

export function roughifyRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
  options: RoughifyOptions = {},
): string {
  const safeW = Math.max(1, finiteOr(width, 1));
  const safeH = Math.max(1, finiteOr(height, 1));
  const sx = finiteOr(x, 0);
  const sy = finiteOr(y, 0);

  return roughifyPolygonPath(
    [
      { x: sx, y: sy },
      { x: sx + safeW, y: sy },
      { x: sx + safeW, y: sy + safeH },
      { x: sx, y: sy + safeH },
    ],
    seed,
    { ...options, closed: true },
  );
}

export function roughifyArrowPath(
  from: Point2D,
  to: Point2D,
  seed: number,
  options: RoughifyOptions = {},
): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return "";

  const angle = Math.atan2(dy, dx);
  const headLen = Math.min(18, Math.max(8, length * 0.2));
  const spread = Math.PI / 6;

  const wingLeft: Point2D = {
    x: to.x - headLen * Math.cos(angle - spread),
    y: to.y - headLen * Math.sin(angle - spread),
  };
  const wingRight: Point2D = {
    x: to.x - headLen * Math.cos(angle + spread),
    y: to.y - headLen * Math.sin(angle + spread),
  };

  const shaft = roughifyPolygonPath([from, to], seed, { ...options, closed: false });
  const head = roughifyPolygonPath([wingLeft, to, wingRight], seed + 79, {
    ...options,
    closed: false,
    doubleStroke: false,
  });

  return `${shaft} ${head}`.trim();
}
