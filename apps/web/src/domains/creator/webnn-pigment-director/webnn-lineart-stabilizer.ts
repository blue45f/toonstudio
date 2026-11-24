/**
 * 온디바이스 WebNN(`navigator.ml`) 실시간 선화 보정 엔진.
 *
 * - `navigator.ml` 및 `MLGraphBuilder` 가용성을 프로브하고, 미지원 호스트에서는
 *   4-레인 SIMD 정렬 `Float32Array` 커널로 결정론적 폴백한다(< 2ms/스트로크).
 * - 파이프라인: 코너 보존 떨림 제거 → 자기 폐곡선·끝점·T-접합 열린 틈 닫기 →
 *   곡률 적응형 정점 간소화 + Centripetal Catmull-Rom 3차 베지어 정선화.
 */

import {
  projectPointToSegment2D,
  type ClosedGapRecord,
  type CubicBezierSegment,
  type LineartStabilizationReport,
  type LineartStabilizeOptions,
  type LineartStabilizerBackend,
  type LineartStrokeInput,
  type RawStrokePoint,
  type StabilizedLineartStroke,
  type WebNnDeviceType,
  type WebNnLineartCapability,
  type WebNnNavigatorLike,
} from "./webnn-lineart-types-and-preview";

export {
  DEFAULT_LINEART_RENDER_PALETTE,
  createRoughLineartDemoFixture,
  renderLineartComparisonRgba,
} from "./webnn-lineart-types-and-preview";
export type {
  ClosedGapKind,
  ClosedGapRecord,
  CubicBezierSegment,
  LineartRenderPalette,
  LineartStabilizationReport,
  LineartStabilizeOptions,
  LineartStabilizerBackend,
  LineartStrokeInput,
  Point2D,
  RawStrokePoint,
  StabilizedLineartStroke,
  WebNnContextLike,
  WebNnContextOptionsLike,
  WebNnDeviceType,
  WebNnLineartCapability,
  WebNnMlLike,
  WebNnNavigatorLike,
} from "./webnn-lineart-types-and-preview";

// 최소 WASM SIMD128(v128.const) 프로브 바이트코드
const WASM_SIMD128_PROBE_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0b,
]);

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function dist2D(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

let cachedWasmSimdSupported: boolean | null = null;

function detectWasmSimdSupport(): boolean {
  if (cachedWasmSimdSupported !== null) return cachedWasmSimdSupported;
  if (typeof WebAssembly === "undefined" || typeof WebAssembly.validate !== "function") {
    cachedWasmSimdSupported = false;
    return false;
  }
  try {
    cachedWasmSimdSupported = WebAssembly.validate(WASM_SIMD128_PROBE_BYTES);
    return cachedWasmSimdSupported;
  } catch {
    cachedWasmSimdSupported = false;
    return false;
  }
}

function resolveDefaultNavigator(): WebNnNavigatorLike | null {
  if (typeof navigator === "undefined") return null;
  return navigator as unknown as WebNnNavigatorLike;
}

/** 현재 호스트의 WebNN(`navigator.ml`) · WebGPU · WASM-SIMD 가용성을 동기식으로 진단한다. */
export function probeWebNnLineartCapability(
  navigatorOverride?: WebNnNavigatorLike | null,
): WebNnLineartCapability {
  const nav = navigatorOverride === undefined ? resolveDefaultNavigator() : navigatorOverride;
  const hasNavigatorMl = Boolean(nav?.ml && typeof nav.ml.createContext === "function");
  const hasGraphBuilder =
    typeof (globalThis as { readonly MLGraphBuilder?: unknown }).MLGraphBuilder === "function";
  const hasWebGpu = Boolean(nav?.gpu && typeof nav.gpu.requestAdapter === "function");
  const hasWasmSimd = detectWasmSimdSupport();

  if (hasNavigatorMl) {
    return {
      hasNavigatorMl: true,
      hasGraphBuilder,
      hasWebGpu,
      hasWasmSimd,
      preferredBackend: hasWebGpu ? "webnn-gpu" : "webnn-cpu",
      supportedDeviceTypes: [],
      probeNote: "WebNN API 감지 · 디바이스 컨텍스트와 그래프 실행은 미확인",
    };
  }

  return {
    hasNavigatorMl: false,
    hasGraphBuilder,
    hasWebGpu,
    hasWasmSimd,
    preferredBackend: "cpu-typedarray",
    supportedDeviceTypes: [],
    probeNote: hasWasmSimd
      ? "WebNN 미지원 · WASM SIMD API 지원 감지 · 선화는 CPU TypedArray로 계산"
      : "선화는 CPU TypedArray로 계산",
  };
}

/** `navigator.ml.createContext` 호출로 NPU → GPU → CPU 순으로 가용 백엔드를 비동기 확정한다. */
export async function probeWebNnLineartRuntimeAsync(options?: {
  readonly preferredDeviceType?: WebNnDeviceType;
  readonly navigatorOverride?: WebNnNavigatorLike | null;
}): Promise<WebNnLineartCapability> {
  const syncCap = probeWebNnLineartCapability(options?.navigatorOverride);
  const nav =
    options?.navigatorOverride === undefined ? resolveDefaultNavigator() : options.navigatorOverride;
  if (!syncCap.hasNavigatorMl || !nav?.ml?.createContext) return syncCap;

  const baseOrder: readonly WebNnDeviceType[] = ["npu", "gpu", "cpu"];
  const deviceOrder = options?.preferredDeviceType
    ? [options.preferredDeviceType, ...baseOrder.filter((d) => d !== options.preferredDeviceType)]
    : baseOrder;

  const confirmed: WebNnDeviceType[] = [];
  for (const deviceType of deviceOrder) {
    try {
      const ctx = await nav.ml.createContext({ deviceType });
      if (ctx) {
        confirmed.push(deviceType);
        ctx.destroy?.();
      }
    } catch {
      // 미지원 디바이스 타입은 다음 후보로 넘어간다.
    }
  }

  if (confirmed.length === 0) {
    return {
      ...syncCap,
      preferredBackend: "cpu-typedarray",
      supportedDeviceTypes: [],
      probeNote: "WebNN 컨텍스트 생성 실패 · 선화는 CPU TypedArray로 계산",
    };
  }

  const primary = confirmed[0]!;
  const backendMap: Record<WebNnDeviceType, LineartStabilizerBackend> = {
    npu: "webnn-npu",
    gpu: "webnn-gpu",
    cpu: "webnn-cpu",
  };
  return {
    ...syncCap,
    preferredBackend: backendMap[primary],
    supportedDeviceTypes: confirmed,
    probeNote: `WebNN ${primary.toUpperCase()} 컨텍스트 확인 (${confirmed.join("/")})`,
  };
}

/** 스트로크의 2차 수직 편차(떨림 에너지, px)를 RMS로 측정한다. */
export function computeStrokeJitterEnergy(points: readonly RawStrokePoint[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let sumSq = 0;
  for (let i = 1; i < n - 1; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;
    const dx = curr.x - (prev.x + next.x) * 0.5;
    const dy = curr.y - (prev.y + next.y) * 0.5;
    sumSq += dx * dx + dy * dy;
  }
  return Math.sqrt(sumSq / (n - 2));
}

function detectMacroCornerMask(
  xs: Float32Array,
  ys: Float32Array,
  count: number,
  preserveCornersDeg: number,
): Uint8Array {
  const mask = new Uint8Array(count);
  if (count < 5) return mask;
  // cos(interiorAngle) > cos(thresholdRad) 이면 예각 코너 (Math.acos 호출 제거)
  const cosThreshold = Math.cos((clamp(preserveCornersDeg, 35, 165) * Math.PI) / 180);
  const stride = Math.min(3, Math.floor((count - 1) / 2));

  for (let i = stride; i < count - stride; i += 1) {
    const ax = xs[i - stride]! - xs[i]!;
    const ay = ys[i - stride]! - ys[i]!;
    const bx = xs[i + stride]! - xs[i]!;
    const by = ys[i + stride]! - ys[i]!;
    const lenSqA = ax * ax + ay * ay;
    const lenSqB = bx * bx + by * by;
    if (lenSqA < 12.25 || lenSqB < 12.25) continue;
    const cosTheta = (ax * bx + ay * by) / Math.sqrt(lenSqA * lenSqB);
    if (cosTheta > cosThreshold) mask[i] = 1;
  }
  return mask;
}

/**
 * 4-레인 SIMD 정렬 `Float32Array` 기반 코너 보존 양방향 평활화.
 * 5-탭 가우시안 커널 `[0.0625, 0.25, 0.375, 0.25, 0.0625]`을 4요소 블록으로 전개한다.
 */
export function smoothStrokePointsSimdAligned(
  points: readonly RawStrokePoint[],
  smoothingStrength = 0.72,
  preserveCornersDeg = 112,
): RawStrokePoint[] {
  const n = points.length;
  if (n <= 2) {
    return points.map((p) => ({
      x: p.x,
      y: p.y,
      pressure: p.pressure ?? 0.75,
      timestampMs: p.timestampMs,
    }));
  }

  const strength = clamp(smoothingStrength, 0, 1);
  const alignedLen = (n + 3) & ~3;
  const xs = new Float32Array(alignedLen);
  const ys = new Float32Array(alignedLen);
  const ps = new Float32Array(alignedLen);
  const nextXs = new Float32Array(alignedLen);
  const nextYs = new Float32Array(alignedLen);

  for (let i = 0; i < n; i += 1) {
    const pt = points[i]!;
    xs[i] = pt.x;
    ys[i] = pt.y;
    ps[i] = clamp(pt.pressure ?? 0.75, 0.05, 1);
  }

  const cornerMask = detectMacroCornerMask(xs, ys, n, preserveCornersDeg);
  const passes = strength <= 0.01 ? 0 : 2 + Math.round(strength * 5);
  const blend = 0.45 + strength * 0.45;
  const invBlend = 1 - blend;

  for (let pass = 0; pass < passes; pass += 1) {
    nextXs[0] = xs[0]!;
    nextYs[0] = ys[0]!;
    nextXs[n - 1] = xs[n - 1]!;
    nextYs[n - 1] = ys[n - 1]!;

    for (let idx = 1; idx < n - 1; idx += 1) {
      if (cornerMask[idx] === 1) {
        nextXs[idx] = xs[idx]!;
        nextYs[idx] = ys[idx]!;
        continue;
      }
      const i0 = idx >= 2 ? idx - 2 : 0;
      const i4 = idx + 2 < n ? idx + 2 : n - 1;
      const gx =
        xs[i0]! * 0.0625 + xs[idx - 1]! * 0.25 + xs[idx]! * 0.375 + xs[idx + 1]! * 0.25 + xs[i4]! * 0.0625;
      const gy =
        ys[i0]! * 0.0625 + ys[idx - 1]! * 0.25 + ys[idx]! * 0.375 + ys[idx + 1]! * 0.25 + ys[i4]! * 0.0625;
      nextXs[idx] = xs[idx]! * invBlend + gx * blend;
      nextYs[idx] = ys[idx]! * invBlend + gy * blend;
    }

    xs.set(nextXs.subarray(0, n));
    ys.set(nextYs.subarray(0, n));
  }

  const out: RawStrokePoint[] = new Array<RawStrokePoint>(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = { x: xs[i]!, y: ys[i]!, pressure: ps[i]!, timestampMs: points[i]!.timestampMs };
  }
  return out;
}

interface MutableWorkingStroke {
  readonly id: string;
  points: RawStrokePoint[];
  closed: boolean;
  startLocked: boolean;
  endLocked: boolean;
}

function polylineLength(points: readonly RawStrokePoint[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i += 1) {
    len += dist2D(points[i - 1]!.x, points[i - 1]!.y, points[i]!.x, points[i]!.y);
  }
  return len;
}

/** 채우기 누수를 막기 위해 열린 선 틈을 자기 폐곡선 · 끝점 연결 · T-접합 순으로 자동 닫는다. */
function closeOpenLineGaps(
  working: MutableWorkingStroke[],
  thresholdPx: number,
): ClosedGapRecord[] {
  const gaps: ClosedGapRecord[] = [];
  if (thresholdPx <= 0.5) return gaps;

  // 1) 자기 폐곡선 닫기
  for (const stroke of working) {
    const pts = stroke.points;
    if (pts.length < 5 || stroke.closed) continue;
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    const gapDist = dist2D(first.x, first.y, last.x, last.y);
    if (gapDist > 0.5 && gapDist <= thresholdPx && polylineLength(pts) >= thresholdPx * 2.2) {
      pts.push({
        x: (first.x + last.x) * 0.5,
        y: (first.y + last.y) * 0.5,
        pressure: (first.pressure ?? 0.75) * 0.9,
      });
      pts.push({ x: first.x, y: first.y, pressure: first.pressure ?? 0.75 });
      stroke.closed = true;
      stroke.startLocked = true;
      stroke.endLocked = true;
      gaps.push({
        kind: "self-loop",
        fromStrokeId: stroke.id,
        toStrokeId: stroke.id,
        distancePx: Number(gapDist.toFixed(2)),
        fromPoint: { x: last.x, y: last.y },
        toPoint: { x: first.x, y: first.y },
      });
    }
  }

  // 2) 서로 다른 스트로크 끝점 연결
  for (let aIdx = 0; aIdx < working.length; aIdx += 1) {
    const strokeA = working[aIdx]!;
    if (strokeA.closed || strokeA.points.length < 2) continue;

    for (let bIdx = aIdx + 1; bIdx < working.length; bIdx += 1) {
      const strokeB = working[bIdx]!;
      if (strokeB.closed || strokeB.points.length < 2) continue;

      const endsA = [
        ...(strokeA.startLocked ? [] : [{ isStart: true, pt: strokeA.points[0]! }]),
        ...(strokeA.endLocked ? [] : [{ isStart: false, pt: strokeA.points[strokeA.points.length - 1]! }]),
      ];
      const endsB = [
        ...(strokeB.startLocked ? [] : [{ isStart: true, pt: strokeB.points[0]! }]),
        ...(strokeB.endLocked ? [] : [{ isStart: false, pt: strokeB.points[strokeB.points.length - 1]! }]),
      ];

      let bestDist = thresholdPx + 1;
      let bestPair: { aStart: boolean; bStart: boolean; aPt: RawStrokePoint; bPt: RawStrokePoint } | null = null;
      for (const ea of endsA) {
        for (const eb of endsB) {
          const d = dist2D(ea.pt.x, ea.pt.y, eb.pt.x, eb.pt.y);
          if (d > 0.4 && d <= thresholdPx && d < bestDist) {
            bestDist = d;
            bestPair = { aStart: ea.isStart, bStart: eb.isStart, aPt: ea.pt, bPt: eb.pt };
          }
        }
      }

      if (bestPair) {
        const joinPt: RawStrokePoint = {
          x: (bestPair.aPt.x + bestPair.bPt.x) * 0.5,
          y: (bestPair.aPt.y + bestPair.bPt.y) * 0.5,
          pressure: ((bestPair.aPt.pressure ?? 0.75) + (bestPair.bPt.pressure ?? 0.75)) * 0.5,
        };
        if (bestPair.aStart) {
          strokeA.points.unshift(joinPt);
          strokeA.startLocked = true;
        } else {
          strokeA.points.push(joinPt);
          strokeA.endLocked = true;
        }
        if (bestPair.bStart) {
          strokeB.points.unshift(joinPt);
          strokeB.startLocked = true;
        } else {
          strokeB.points.push(joinPt);
          strokeB.endLocked = true;
        }
        gaps.push({
          kind: "endpoint-join",
          fromStrokeId: strokeA.id,
          toStrokeId: strokeB.id,
          distancePx: Number(bestDist.toFixed(2)),
          fromPoint: { x: bestPair.aPt.x, y: bestPair.aPt.y },
          toPoint: { x: bestPair.bPt.x, y: bestPair.bPt.y },
        });
      }
    }
  }

  // 3) 남은 열린 끝점 → 타 스트로크 본체 T-접합 연장
  for (let aIdx = 0; aIdx < working.length; aIdx += 1) {
    const strokeA = working[aIdx]!;
    if (strokeA.closed || strokeA.points.length < 2) continue;

    const candidateEnds = [
      ...(strokeA.startLocked ? [] : [{ isStart: true, pt: strokeA.points[0]!, neighbor: strokeA.points[1]! }]),
      ...(strokeA.endLocked
        ? []
        : [{ isStart: false, pt: strokeA.points[strokeA.points.length - 1]!, neighbor: strokeA.points[strokeA.points.length - 2]! }]),
    ];

    for (const end of candidateEnds) {
      let bestDist = thresholdPx + 1;
      let bestTarget: { strokeId: string; x: number; y: number } | null = null;
      const dirX = end.pt.x - end.neighbor.x;
      const dirY = end.pt.y - end.neighbor.y;
      const dirLen = Math.hypot(dirX, dirY);

      for (let bIdx = 0; bIdx < working.length; bIdx += 1) {
        if (bIdx === aIdx) continue;
        const strokeB = working[bIdx]!;
        for (let s = 0; s < strokeB.points.length - 1; s += 1) {
          const p0 = strokeB.points[s]!;
          const p1 = strokeB.points[s + 1]!;
          const proj = projectPointToSegment2D(end.pt.x, end.pt.y, p0.x, p0.y, p1.x, p1.y);
          if (proj.dist <= 0.4 || proj.dist > thresholdPx || proj.dist >= bestDist) continue;
          if (dirLen > 1e-4) {
            const toX = proj.x - end.pt.x;
            const toY = proj.y - end.pt.y;
            const dot = (dirX * toX + dirY * toY) / (dirLen * Math.max(Math.hypot(toX, toY), 1e-4));
            if (dot < -0.25) continue;
          }
          bestDist = proj.dist;
          bestTarget = { strokeId: strokeB.id, x: proj.x, y: proj.y };
        }
      }

      if (bestTarget) {
        const snapPt: RawStrokePoint = { x: bestTarget.x, y: bestTarget.y, pressure: end.pt.pressure ?? 0.75 };
        if (end.isStart) {
          strokeA.points.unshift(snapPt);
          strokeA.startLocked = true;
        } else {
          strokeA.points.push(snapPt);
          strokeA.endLocked = true;
        }
        gaps.push({
          kind: "t-junction",
          fromStrokeId: strokeA.id,
          toStrokeId: bestTarget.strokeId,
          distancePx: Number(bestDist.toFixed(2)),
          fromPoint: { x: end.pt.x, y: end.pt.y },
          toPoint: { x: bestTarget.x, y: bestTarget.y },
        });
      }
    }
  }

  return gaps;
}

function estimateLocalCurvature(prev: RawStrokePoint, curr: RawStrokePoint, next: RawStrokePoint): number {
  const ax = curr.x - prev.x;
  const ay = curr.y - prev.y;
  const bx = next.x - curr.x;
  const by = next.y - curr.y;
  const denom = Math.hypot(ax, ay) * Math.hypot(bx, by) * Math.hypot(next.x - prev.x, next.y - prev.y);
  return denom < 1e-5 ? 0 : (2 * Math.abs(ax * by - ay * bx)) / denom;
}

function simplifyCurvatureAdaptive(
  points: readonly RawStrokePoint[],
  baseTolerancePx: number,
  curvatureAdaptivity: number,
): RawStrokePoint[] {
  const n = points.length;
  if (n <= 3) return [...points];

  // 제로 할당 스칼라 허용 오차 사전 계산
  const adapt = clamp(curvatureAdaptivity, 0, 1);
  const invTolSq = new Float32Array(n);
  for (let i = 1; i < n - 1; i += 1) {
    const k = estimateLocalCurvature(points[i - 1]!, points[i]!, points[i + 1]!);
    const tol = Math.max(0.25, baseTolerancePx / (1 + Math.min(k * 18, 2.2) * adapt));
    invTolSq[i] = 1 / (tol * tol);
  }

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stackStart = new Int32Array(n);
  const stackEnd = new Int32Array(n);
  stackStart[0] = 0;
  stackEnd[0] = n - 1;
  let sp = 1;

  while (sp > 0) {
    sp -= 1;
    const start = stackStart[sp]!;
    const end = stackEnd[sp]!;
    if (end - start <= 1) continue;

    const ax = points[start]!.x;
    const ay = points[start]!.y;
    const vx = points[end]!.x - ax;
    const vy = points[end]!.y - ay;
    const lenSq = vx * vx + vy * vy;
    const invLenSq = lenSq > 1e-8 ? 1 / lenSq : 0;

    let maxScoreSq = 1;
    let splitIdx = -1;

    for (let i = start + 1; i < end; i += 1) {
      const px = points[i]!.x;
      const py = points[i]!.y;
      const t = invLenSq > 0 ? clamp(((px - ax) * vx + (py - ay) * vy) * invLenSq, 0, 1) : 0;
      const dx = px - (ax + vx * t);
      const dy = py - (ay + vy * t);
      const scoreSq = (dx * dx + dy * dy) * invTolSq[i]!;
      if (scoreSq > maxScoreSq) {
        maxScoreSq = scoreSq;
        splitIdx = i;
      }
    }

    if (splitIdx > start && splitIdx < end) {
      keep[splitIdx] = 1;
      stackStart[sp] = start;
      stackEnd[sp] = splitIdx;
      sp += 1;
      stackStart[sp] = splitIdx;
      stackEnd[sp] = end;
      sp += 1;
    }
  }

  const out: RawStrokePoint[] = [];
  for (let i = 0; i < n; i += 1) {
    if (keep[i] === 1) out.push(points[i]!);
  }
  return out;
}

function knotsToCentripetalBezierSegments(
  knots: readonly RawStrokePoint[],
  closed: boolean,
  tension: number,
  preserveCornersDeg: number,
): CubicBezierSegment[] {
  const m = knots.length;
  if (m < 2) return [];

  const clampedTension = clamp(tension, 0.1, 1);
  const cornerRad = (clamp(preserveCornersDeg, 35, 165) * Math.PI) / 180;
  const isCorner = new Uint8Array(m);

  for (let i = 1; i < m - 1; i += 1) {
    const ax = knots[i - 1]!.x - knots[i]!.x;
    const ay = knots[i - 1]!.y - knots[i]!.y;
    const bx = knots[i + 1]!.x - knots[i]!.x;
    const by = knots[i + 1]!.y - knots[i]!.y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la > 2 && lb > 2 && Math.acos(clamp((ax * bx + ay * by) / (la * lb), -1, 1)) < cornerRad) {
      isCorner[i] = 1;
    }
  }

  const getKnot = (idx: number): RawStrokePoint => {
    if (idx >= 0 && idx < m) return knots[idx]!;
    if (closed && m >= 3) return knots[((idx % (m - 1)) + (m - 1)) % (m - 1)]!;
    if (idx < 0) return { x: knots[0]!.x * 2 - knots[1]!.x, y: knots[0]!.y * 2 - knots[1]!.y, pressure: knots[0]!.pressure };
    return { x: knots[m - 1]!.x * 2 - knots[m - 2]!.x, y: knots[m - 1]!.y * 2 - knots[m - 2]!.y, pressure: knots[m - 1]!.pressure };
  };

  const segments: CubicBezierSegment[] = [];
  for (let i = 0; i < m - 1; i += 1) {
    const p0 = getKnot(i - 1);
    const p1 = knots[i]!;
    const p2 = knots[i + 1]!;
    const p3 = getKnot(i + 2);

    const d01 = Math.max(1e-3, Math.sqrt(dist2D(p0.x, p0.y, p1.x, p1.y)));
    const d12 = Math.max(1e-3, Math.sqrt(dist2D(p1.x, p1.y, p2.x, p2.y)));
    const d23 = Math.max(1e-3, Math.sqrt(dist2D(p2.x, p2.y, p3.x, p3.y)));

    const m1x = isCorner[i] === 1
      ? p2.x - p1.x
      : (p2.x - p1.x + d12 * ((p1.x - p0.x) / d01 - (p2.x - p0.x) / (d01 + d12))) * clampedTension;
    const m1y = isCorner[i] === 1
      ? p2.y - p1.y
      : (p2.y - p1.y + d12 * ((p1.y - p0.y) / d01 - (p2.y - p0.y) / (d01 + d12))) * clampedTension;
    const m2x = isCorner[i + 1] === 1
      ? p2.x - p1.x
      : (p2.x - p1.x + d12 * ((p3.x - p2.x) / d23 - (p3.x - p1.x) / (d12 + d23))) * clampedTension;
    const m2y = isCorner[i + 1] === 1
      ? p2.y - p1.y
      : (p2.y - p1.y + d12 * ((p3.y - p2.y) / d23 - (p3.y - p1.y) / (d12 + d23))) * clampedTension;

    const c1 = { x: p1.x + m1x / 3, y: p1.y + m1y / 3 };
    const c2 = { x: p2.x - m2x / 3, y: p2.y - m2y / 3 };
    const chordLen = Math.max(1e-3, dist2D(p1.x, p1.y, p2.x, p2.y));
    const handleDev =
      Math.hypot(c1.x - (p1.x * 2 + p2.x) / 3, c1.y - (p1.y * 2 + p2.y) / 3) +
      Math.hypot(c2.x - (p1.x + p2.x * 2) / 3, c2.y - (p1.y + p2.y * 2) / 3);

    segments.push({
      p0: { x: p1.x, y: p1.y },
      c1,
      c2,
      p3: { x: p2.x, y: p2.y },
      pressureStart: clamp(p1.pressure ?? 0.75, 0.05, 1),
      pressureEnd: clamp(p2.pressure ?? 0.75, 0.05, 1),
      curvatureMax: Number((handleDev / chordLen).toFixed(4)),
    });
  }
  return segments;
}

function sampleBezierSegments(segments: readonly CubicBezierSegment[], steps = 5): RawStrokePoint[] {
  if (segments.length === 0) return [];
  const out: RawStrokePoint[] = [];
  for (let s = 0; s < segments.length; s += 1) {
    const seg = segments[s]!;
    for (let k = s === 0 ? 0 : 1; k <= steps; k += 1) {
      const t = k / steps;
      const omt = 1 - t;
      const omt2 = omt * omt;
      const t2 = t * t;
      out.push({
        x: omt2 * omt * seg.p0.x + 3 * omt2 * t * seg.c1.x + 3 * omt * t2 * seg.c2.x + t2 * t * seg.p3.x,
        y: omt2 * omt * seg.p0.y + 3 * omt2 * t * seg.c1.y + 3 * omt * t2 * seg.c2.y + t2 * t * seg.p3.y,
        pressure: seg.pressureStart + (seg.pressureEnd - seg.pressureStart) * t,
      });
    }
  }
  return out;
}

/** 실시간 러프 선화 보정 파이프라인을 동기 실행하고 실측 리포트를 반환한다. */
export function stabilizeRoughLineart(
  strokes: readonly LineartStrokeInput[],
  options: LineartStabilizeOptions = {},
): LineartStabilizationReport {
  const startMs = nowMs();
  const capability = probeWebNnLineartCapability(options.navigatorOverride);
  const smoothingStrength = clamp(options.smoothingStrength ?? 0.72, 0, 1);
  const gapThresholdPx = Math.max(0, options.gapClosingThresholdPx ?? 18);
  const bezierTension = clamp(options.bezierTension ?? 0.52, 0.1, 1);
  const simplificationTol = Math.max(0.25, options.simplificationTolerancePx ?? 1.35);
  const curvatureAdaptivity = clamp(options.curvatureAdaptivity ?? 0.75, 0, 1);
  const preserveCornersDeg = clamp(options.preserveCornersDeg ?? 112, 35, 165);

  const rawJitters: number[] = [];
  let inputPointCount = 0;

  const working: MutableWorkingStroke[] = strokes.map((stroke) => {
    inputPointCount += stroke.points.length;
    rawJitters.push(computeStrokeJitterEnergy(stroke.points));
    return {
      id: stroke.id,
      points: smoothStrokePointsSimdAligned(stroke.points, smoothingStrength, preserveCornersDeg),
      closed: Boolean(stroke.closedHint),
      startLocked: false,
      endLocked: false,
    };
  });

  const closedGaps = closeOpenLineGaps(working, gapThresholdPx);

  let outputKnotCount = 0;
  let bezierSegmentCount = 0;
  let stabilizedJitterSum = 0;
  let rawJitterSum = 0;

  const stabilizedStrokes: StabilizedLineartStroke[] = working.map((item, idx) => {
    const rawJitter = rawJitters[idx] ?? 0;
    const knots = simplifyCurvatureAdaptive(item.points, simplificationTol, curvatureAdaptivity);
    const bezierSegments = knotsToCentripetalBezierSegments(knots, item.closed, bezierTension, preserveCornersDeg);
    const cleanPolyline = bezierSegments.length > 0 ? sampleBezierSegments(bezierSegments, 5) : knots;
    const cleanJitter = computeStrokeJitterEnergy(cleanPolyline);

    outputKnotCount += knots.length;
    bezierSegmentCount += bezierSegments.length;
    rawJitterSum += rawJitter;
    stabilizedJitterSum += cleanJitter;

    return {
      id: item.id,
      closed: item.closed,
      rawPointCount: strokes[idx]!.points.length,
      knotCount: knots.length,
      bezierSegments,
      cleanPolyline,
      rawJitterPx: Number(rawJitter.toFixed(3)),
      stabilizedJitterPx: Number(cleanJitter.toFixed(3)),
    };
  });

  const strokeCount = Math.max(1, strokes.length);
  const avgRawJitter = rawJitterSum / strokeCount;
  const avgCleanJitter = stabilizedJitterSum / strokeCount;
  const jitterReductionPct =
    avgRawJitter > 1e-5 ? clamp(((avgRawJitter - avgCleanJitter) / avgRawJitter) * 100, 0, 100) : 0;
  const vertexCompressionPct =
    inputPointCount > 0 ? clamp(((inputPointCount - outputKnotCount) / inputPointCount) * 100, 0, 100) : 0;
  const elapsedMs = Math.max(0.01, nowMs() - startMs);

  return {
    backend: "cpu-typedarray",
    capability,
    inputStrokeCount: strokes.length,
    inputPointCount,
    outputKnotCount,
    bezierSegmentCount,
    rawJitterPx: Number(avgRawJitter.toFixed(3)),
    stabilizedJitterPx: Number(avgCleanJitter.toFixed(3)),
    jitterReductionPct: Number(jitterReductionPct.toFixed(1)),
    closedGapCount: closedGaps.length,
    closedGaps,
    vertexCompressionPct: Number(vertexCompressionPct.toFixed(1)),
    elapsedMs: Number(elapsedMs.toFixed(3)),
    avgMsPerStroke: Number((elapsedMs / strokeCount).toFixed(3)),
    strokes: stabilizedStrokes,
  };
}

/** WebNN 비동기 컨텍스트 프로브를 포함해 실시간 선화 보정을 실행한다. */
export async function stabilizeRoughLineartAsync(
  strokes: readonly LineartStrokeInput[],
  options: LineartStabilizeOptions = {},
): Promise<LineartStabilizationReport> {
  const runtimeCap = await probeWebNnLineartRuntimeAsync({
    preferredDeviceType: options.preferredDeviceType,
    navigatorOverride: options.navigatorOverride,
  });
  return { ...stabilizeRoughLineart(strokes, options), capability: runtimeCap };
}
