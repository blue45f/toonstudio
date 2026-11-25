/**
 * 온디바이스 WebNN 선화 보정 타입 계약 · 데모 픽스처 · RGBA 분할 비교 렌더러.
 *
 * TSX 컴포넌트가 원시 색상 문자열 없이 `<canvas>`에 `putImageData`로 직접 출력할 수 있도록
 * 순수 숫자 RGB 팔레트와 픽셀 버퍼 래스터라이저를 제공한다.
 */

export type WebNnDeviceType = "npu" | "gpu" | "cpu";

export type LineartStabilizerBackend =
  | "webnn-npu"
  | "webnn-gpu"
  | "webnn-cpu"
  | "cpu-typedarray";

export interface WebNnContextOptionsLike {
  readonly deviceType?: WebNnDeviceType;
  readonly powerPreference?: "default" | "high-performance" | "low-power";
}

export interface WebNnContextLike {
  readonly compute?: (
    graph: unknown,
    inputs: Readonly<Record<string, ArrayBufferView>>,
    outputs: Readonly<Record<string, ArrayBufferView>>,
  ) => Promise<unknown>;
  readonly destroy?: () => void;
}

export interface WebNnMlLike {
  readonly createContext?: (options?: WebNnContextOptionsLike) => Promise<WebNnContextLike>;
}

export interface WebNnNavigatorLike {
  readonly ml?: WebNnMlLike;
  readonly gpu?: { readonly requestAdapter?: () => Promise<unknown> };
}

export interface WebNnLineartCapability {
  readonly hasNavigatorMl: boolean;
  readonly hasGraphBuilder: boolean;
  readonly hasWebGpu: boolean;
  readonly hasWasmSimd: boolean;
  readonly preferredBackend: LineartStabilizerBackend;
  readonly supportedDeviceTypes: readonly WebNnDeviceType[];
  readonly probeNote: string;
}

export interface RawStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly timestampMs?: number;
}

export interface LineartStrokeInput {
  readonly id: string;
  readonly points: readonly RawStrokePoint[];
  readonly closedHint?: boolean;
}

export interface LineartStabilizeOptions {
  readonly smoothingStrength?: number;
  readonly gapClosingThresholdPx?: number;
  readonly bezierTension?: number;
  readonly simplificationTolerancePx?: number;
  readonly curvatureAdaptivity?: number;
  readonly preserveCornersDeg?: number;
  readonly preferredDeviceType?: WebNnDeviceType;
  readonly navigatorOverride?: WebNnNavigatorLike | null;
}

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface CubicBezierSegment {
  readonly p0: Point2D;
  readonly c1: Point2D;
  readonly c2: Point2D;
  readonly p3: Point2D;
  readonly pressureStart: number;
  readonly pressureEnd: number;
  readonly curvatureMax: number;
}

export type ClosedGapKind = "self-loop" | "endpoint-join" | "t-junction";

export interface ClosedGapRecord {
  readonly kind: ClosedGapKind;
  readonly fromStrokeId: string;
  readonly toStrokeId: string;
  readonly distancePx: number;
  readonly fromPoint: Point2D;
  readonly toPoint: Point2D;
}

export interface StabilizedLineartStroke {
  readonly id: string;
  readonly closed: boolean;
  readonly rawPointCount: number;
  readonly knotCount: number;
  readonly bezierSegments: readonly CubicBezierSegment[];
  readonly cleanPolyline: readonly RawStrokePoint[];
  readonly rawJitterPx: number;
  readonly stabilizedJitterPx: number;
}

export interface LineartStabilizationReport {
  readonly backend: LineartStabilizerBackend;
  readonly capability: WebNnLineartCapability;
  readonly inputStrokeCount: number;
  readonly inputPointCount: number;
  readonly outputKnotCount: number;
  readonly bezierSegmentCount: number;
  readonly rawJitterPx: number;
  readonly stabilizedJitterPx: number;
  readonly jitterReductionPct: number;
  readonly closedGapCount: number;
  readonly closedGaps: readonly ClosedGapRecord[];
  readonly vertexCompressionPct: number;
  readonly elapsedMs: number;
  readonly avgMsPerStroke: number;
  readonly strokes: readonly StabilizedLineartStroke[];
}

export interface LineartRenderPalette {
  readonly background: readonly [number, number, number];
  readonly grid: readonly [number, number, number];
  readonly rawInk: readonly [number, number, number];
  readonly cleanInk: readonly [number, number, number];
  readonly closedGapAccent: readonly [number, number, number];
  readonly divider: readonly [number, number, number];
}

export const DEFAULT_LINEART_RENDER_PALETTE: LineartRenderPalette = {
  background: [30, 29, 27],
  grid: [46, 44, 41],
  rawInk: [152, 144, 136],
  cleanInk: [242, 236, 224],
  closedGapAccent: [224, 128, 72],
  divider: [78, 74, 68],
};

function clampVal(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 점 `(px, py)`를 선분 `(ax, ay) -> (bx, by)`에 정사영해 최단 거리와 투영점을 구한다. */
export function projectPointToSegment2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { readonly x: number; readonly y: number; readonly dist: number; readonly t: number } {
  const vx = bx - ax;
  const vy = by - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-8) {
    return { x: ax, y: ay, dist: Math.hypot(px - ax, py - ay), t: 0 };
  }
  const t = clampVal(((px - ax) * vx + (py - ay) * vy) / lenSq, 0, 1);
  const cx = ax + vx * t;
  const cy = ay + vy * t;
  return { x: cx, y: cy, dist: Math.hypot(px - cx, py - cy), t };
}

/**
 * 결정론적 러프 선화 데모 픽스처(고주파 손떨림 + 자기 폐곡선·끝점·T-접합 열린 틈 포함).
 */
export function createRoughLineartDemoFixture(): readonly LineartStrokeInput[] {
  const facePoints: RawStrokePoint[] = [];
  const faceSamples = 64;
  for (let i = 0; i < faceSamples; i += 1) {
    const t = i / (faceSamples - 1);
    const angle = -Math.PI * 0.45 + t * Math.PI * 1.92;
    const jitter = Math.sin(i * 2.7) * 2.9 + Math.cos(i * 4.3) * 1.7;
    facePoints.push({
      x: 118 + Math.cos(angle) * (58 + jitter),
      y: 94 + Math.sin(angle) * (64 + Math.cos(i * 3.1) * 2.4),
      pressure: 0.65 + 0.2 * Math.sin(t * Math.PI),
    });
  }

  const bangPoints: RawStrokePoint[] = [];
  for (let i = 0; i < 36; i += 1) {
    const t = i / 35;
    const jitter = Math.sin(i * 3.4) * 2.5 + Math.cos(i * 5.1) * 1.3;
    bangPoints.push({
      x: 72 + t * 88 + jitter * 0.6,
      y: 44 + Math.sin(t * Math.PI) * 26 + jitter,
      pressure: 0.55 + 0.35 * t,
    });
  }

  const collarLeft: RawStrokePoint[] = [];
  const collarRight: RawStrokePoint[] = [];
  for (let i = 0; i < 24; i += 1) {
    const t = i / 23;
    const jL = Math.sin(i * 2.9) * 2.1;
    const jR = Math.cos(i * 3.2) * 2.1;
    collarLeft.push({ x: 82 + t * 32 + jL * 0.5, y: 162 + t * 14 + jL, pressure: 0.7 });
    collarRight.push({ x: 124 + t * 34 + jR * 0.5, y: 174 - t * 12 + jR, pressure: 0.7 });
  }

  return [
    { id: "face-contour", points: facePoints },
    { id: "hair-bangs", points: bangPoints },
    { id: "collar-left", points: collarLeft },
    { id: "collar-right", points: collarRight },
  ];
}

function blendPixelRgba(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  px: number,
  py: number,
  rgb: readonly [number, number, number],
  alpha: number,
): void {
  if (px < 0 || py < 0 || px >= width || py >= height || alpha <= 0) return;
  const idx = (py * width + px) * 4;
  const a = clampVal(alpha, 0, 1);
  const inv = 1 - a;
  buf[idx] = Math.round(buf[idx]! * inv + rgb[0] * a);
  buf[idx + 1] = Math.round(buf[idx + 1]! * inv + rgb[1] * a);
  buf[idx + 2] = Math.round(buf[idx + 2]! * inv + rgb[2] * a);
  buf[idx + 3] = 255;
}

function drawAntialiasedSegment(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  rgb: readonly [number, number, number],
  alpha: number,
): void {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - thickness - 1));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1) + thickness + 1));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - thickness - 1));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1) + thickness + 1));
  const radius = Math.max(0.6, thickness * 0.5);

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const proj = projectPointToSegment2D(px + 0.5, py + 0.5, x0, y0, x1, y1);
      if (proj.dist <= radius + 1) {
        blendPixelRgba(buf, width, height, px, py, rgb, clampVal(radius + 1 - proj.dist, 0, 1) * alpha);
      }
    }
  }
}

function drawCircleRing(
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  rgb: readonly [number, number, number],
): void {
  const minX = Math.max(0, Math.floor(cx - radius - 2));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius + 2));
  const minY = Math.max(0, Math.floor(cy - radius - 2));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius + 2));
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const d = Math.abs(Math.hypot(px - cx, py - cy) - radius);
      if (d <= 1.4) blendPixelRgba(buf, width, height, px, py, rgb, clampVal(1.4 - d, 0, 1));
    }
  }
}

/**
 * 좌(러프 원본) / 우(WebNN 정선화 + 닫힌 틈 마커) 분할 비교 RGBA 버퍼를 생성한다.
 */
export function renderLineartComparisonRgba(
  rawStrokes: readonly LineartStrokeInput[],
  report: LineartStabilizationReport,
  width: number,
  height: number,
  palette: LineartRenderPalette = DEFAULT_LINEART_RENDER_PALETTE,
): Uint8ClampedArray {
  const safeW = Math.max(32, Math.round(width));
  const safeH = Math.max(32, Math.round(height));
  const halfW = Math.floor(safeW * 0.5);
  const buf = new Uint8ClampedArray(safeW * safeH * 4);

  for (let y = 0; y < safeH; y += 1) {
    const isGridY = y % 20 === 0;
    for (let x = 0; x < safeW; x += 1) {
      const idx = (y * safeW + x) * 4;
      const col =
        x === halfW ? palette.divider : isGridY || x % 20 === 0 ? palette.grid : palette.background;
      buf[idx] = col[0];
      buf[idx + 1] = col[1];
      buf[idx + 2] = col[2];
      buf[idx + 3] = 255;
    }
  }

  const scale = Math.min((halfW - 16) / 236, (safeH - 16) / 192);
  const padX = Math.max(8, (halfW - 236 * scale) * 0.5);
  const padY = Math.max(8, (safeH - 192 * scale) * 0.5);
  const mapLeft = (pt: Point2D): Point2D => ({ x: padX + pt.x * scale, y: padY + pt.y * scale });
  const mapRight = (pt: Point2D): Point2D => ({
    x: halfW + padX + pt.x * scale,
    y: padY + pt.y * scale,
  });

  for (const stroke of rawStrokes) {
    for (let i = 1; i < stroke.points.length; i += 1) {
      const aL = mapLeft(stroke.points[i - 1]!);
      const bL = mapLeft(stroke.points[i]!);
      drawAntialiasedSegment(buf, safeW, safeH, aL.x, aL.y, bL.x, bL.y, 1.8, palette.rawInk, 0.9);
      const aR = mapRight(stroke.points[i - 1]!);
      const bR = mapRight(stroke.points[i]!);
      drawAntialiasedSegment(buf, safeW, safeH, aR.x, aR.y, bR.x, bR.y, 1.1, palette.rawInk, 0.22);
    }
  }

  for (const clean of report.strokes) {
    for (let i = 1; i < clean.cleanPolyline.length; i += 1) {
      const p0 = clean.cleanPolyline[i - 1]!;
      const p1 = clean.cleanPolyline[i]!;
      const a = mapRight(p0);
      const b = mapRight(p1);
      const wPx = 1.4 + (p1.pressure ?? 0.75) * 1.3;
      drawAntialiasedSegment(buf, safeW, safeH, a.x, a.y, b.x, b.y, wPx, palette.cleanInk, 0.96);
    }
  }

  for (const gap of report.closedGaps) {
    const mid = mapRight({
      x: (gap.fromPoint.x + gap.toPoint.x) * 0.5,
      y: (gap.fromPoint.y + gap.toPoint.y) * 0.5,
    });
    drawCircleRing(buf, safeW, safeH, mid.x, mid.y, 5.5, palette.closedGapAccent);
  }

  return buf;
}
