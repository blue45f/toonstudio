/**
 * 서브픽셀 예측 스타일러스 입력 엔진 (`getCoalescedEvents` + `getPredictedEvents` + Catmull-Rom 1프레임 선행 보간).
 *
 * - 브라우저 `PointerEvent.getCoalescedEvents()`로 120~240Hz 고빈도 펜 샘플을 손실 없이 수집하고,
 *   중복·비정상 좌표를 걸러 신뢰 가능한 `authoritative` 서브픽셀 이력을 유지한다.
 * - `PointerEvent.getPredictedEvents()`와 Centripetal Catmull-Rom(α=0.5) 곡선 기반
 *   1프레임 선행 예측을 융합해 펜 촉 체감 지연을 최소화하며,
 *   급격한 방향 전환 감쇠 및 최대 선행 거리 클램프로 오버슈트를 방지한다.
 * - 예측 포인트는 항상 `authority: "predicted-preview"`로 분리해 영구 획 기록을 오염시키지 않는다.
 */

export interface StylusPointerEventLike {
  readonly pointerId?: number;
  readonly pointerType?: string;
  readonly clientX: number;
  readonly clientY: number;
  readonly pressure?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly timeStamp: number;
  getCoalescedEvents?: () => readonly StylusPointerEventLike[];
  getPredictedEvents?: () => readonly StylusPointerEventLike[];
}

export interface StylusSubpixelPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly timeStamp: number;
  readonly authority: "authoritative" | "predicted-preview";
  readonly source: "coalesced" | "catmull-rom-substep" | "catmull-rom-predicted" | "native-fused";
}

export interface StylusPredictorOptions {
  /** 1프레임 선행 예측 시간(ms, 기본 16.67ms = 60Hz 1프레임). */
  readonly lookaheadMs?: number;
  /** 허용 최대 선행 예측 시간(ms, 기본 24ms). */
  readonly maxLookaheadMs?: number;
  /** 직전 이동 거리 대비 최대 허용 선행 배수(오버슈트 클램프, 기본 1.5). */
  readonly maxStepMultiplier?: number;
  /** 절대 최대 선행 거리(px, 기본 48px). */
  readonly maxLeadDistancePx?: number;
  /** 정지/호버 노이즈 억제를 위한 최소 이동 거리(px, 기본 0.25px). */
  readonly minMovementThresholdPx?: number;
  /** 네이티브 `getPredictedEvents()` 가중치(0..1, 기본 0.65). */
  readonly nativePredictionBlend?: number;
  /** 고빈도 보간 시 세그먼트당 목표 간격(px, 기본 2.0px). */
  readonly subdivideSpacingPx?: number;
  /** 세그먼트당 최대 Catmull-Rom 세분화 수(기본 8). */
  readonly maxSubstepsPerSegment?: number;
}

export interface StylusStepPredictionResult {
  /** 브라우저 하드웨어에서 확정된 서브픽셀 원본 샘플. */
  readonly authoritative: readonly StylusSubpixelPoint[];
  /** 확정 샘플 사이를 Centripetal Catmull-Rom으로 매끄럽게 보간한 세분화 포인트. */
  readonly interpolated: readonly StylusSubpixelPoint[];
  /** 다음 프레임 렌더링용 예측 꼬리(항상 preview-only). */
  readonly predicted: readonly StylusSubpixelPoint[];
  readonly diagnostics: {
    readonly coalescedCount: number;
    readonly nativePredictedCount: number;
    readonly usedNativeFusion: boolean;
    readonly overshootClamped: boolean;
    readonly leadDistancePx: number;
    readonly turnAttenuation: number;
  };
}

export interface Point2DLike {
  readonly x: number;
  readonly y: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function hypot2(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

/**
 * Barry-Goldman 알고리즘 기반 Centripetal Catmull-Rom(α = 0.5) 스플라인 평가.
 * `u ∈ [0, 1]`은 `p1`에서 `p2` 사이의 정규화 구간이며 첨점(cusp)과 자기 교차가 발생하지 않는다.
 */
export function evaluateCentripetalCatmullRom(
  p0: Point2DLike,
  p1: Point2DLike,
  p2: Point2DLike,
  p3: Point2DLike,
  u: number,
  alpha = 0.5,
): { readonly x: number; readonly y: number } {
  const safeAlpha = clamp(alpha, 0, 1);
  const t0 = 0;
  const d01 = Math.max(1e-4, hypot2(p1.x - p0.x, p1.y - p0.y));
  const d12 = Math.max(1e-4, hypot2(p2.x - p1.x, p2.y - p1.y));
  const d23 = Math.max(1e-4, hypot2(p3.x - p2.x, p3.y - p2.y));

  const t1 = t0 + Math.pow(d01, safeAlpha);
  const t2 = t1 + Math.pow(d12, safeAlpha);
  const t3 = t2 + Math.pow(d23, safeAlpha);
  const t = t1 + clamp(u, 0, 1) * (t2 - t1);

  const lerpPoint = (
    a: Point2DLike,
    b: Point2DLike,
    ta: number,
    tb: number,
    tc: number,
  ): { x: number; y: number } => {
    const denom = tb - ta;
    if (Math.abs(denom) <= 1e-6) return { x: b.x, y: b.y };
    const w1 = (tb - tc) / denom;
    const w2 = (tc - ta) / denom;
    return {
      x: a.x * w1 + b.x * w2,
      y: a.y * w1 + b.y * w2,
    };
  };

  const a1 = lerpPoint(p0, p1, t0, t1, t);
  const a2 = lerpPoint(p1, p2, t1, t2, t);
  const a3 = lerpPoint(p2, p3, t2, t3, t);

  const b1 = lerpPoint(a1, a2, t0, t2, t);
  const b2 = lerpPoint(a2, a3, t1, t3, t);

  return lerpPoint(b1, b2, t1, t2, t);
}

function normalizeEventToPoint(
  event: StylusPointerEventLike,
  authority: "authoritative" | "predicted-preview",
  source: StylusSubpixelPoint["source"],
  fallbackPressure: number,
): StylusSubpixelPoint | null {
  if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return null;
  if (!Number.isFinite(event.timeStamp) || event.timeStamp < 0) return null;
  const rawPressure = typeof event.pressure === "number" && Number.isFinite(event.pressure)
    ? event.pressure
    : fallbackPressure;
  const tiltX = typeof event.tiltX === "number" && Number.isFinite(event.tiltX) ? event.tiltX : 0;
  const tiltY = typeof event.tiltY === "number" && Number.isFinite(event.tiltY) ? event.tiltY : 0;

  return Object.freeze({
    x: event.clientX,
    y: event.clientY,
    pressure: clamp(rawPressure, 0, 1),
    tiltX: clamp(tiltX, -90, 90),
    tiltY: clamp(tiltY, -90, 90),
    timeStamp: event.timeStamp,
    authority,
    source,
  });
}

function extractSafeList(
  getter: (() => readonly StylusPointerEventLike[]) | undefined,
): readonly StylusPointerEventLike[] {
  if (typeof getter !== "function") return [];
  try {
    const result = getter();
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

export class StylusSubpixelPredictor {
  private readonly lookaheadMs: number;
  private readonly maxLookaheadMs: number;
  private readonly maxStepMultiplier: number;
  private readonly maxLeadDistancePx: number;
  private readonly minMovementThresholdPx: number;
  private readonly nativePredictionBlend: number;
  private readonly subdivideSpacingPx: number;
  private readonly maxSubstepsPerSegment: number;

  private readonly history: StylusSubpixelPoint[] = [];
  private totalAuthoritativeCount = 0;
  private totalPredictedCount = 0;
  private totalClampedCount = 0;

  constructor(options: StylusPredictorOptions = {}) {
    this.maxLookaheadMs = clamp(options.maxLookaheadMs ?? 24, 1, 50);
    this.lookaheadMs = clamp(options.lookaheadMs ?? 1000 / 60, 0, this.maxLookaheadMs);
    this.maxStepMultiplier = clamp(options.maxStepMultiplier ?? 1.5, 0.25, 4);
    this.maxLeadDistancePx = clamp(options.maxLeadDistancePx ?? 48, 2, 200);
    this.minMovementThresholdPx = clamp(options.minMovementThresholdPx ?? 0.25, 0.01, 4);
    this.nativePredictionBlend = clamp(options.nativePredictionBlend ?? 0.65, 0, 1);
    this.subdivideSpacingPx = clamp(options.subdivideSpacingPx ?? 2.0, 0.5, 32);
    this.maxSubstepsPerSegment = Math.max(1, Math.min(32, Math.floor(options.maxSubstepsPerSegment ?? 8)));
  }

  /** 새 스트로크 시작 시 이력을 초기화한다. */
  reset(): void {
    this.history.length = 0;
  }

  /**
   * 단일 `PointerEvent`로부터 `getCoalescedEvents()` + `getPredictedEvents()`를 수집하고
   * Catmull-Rom 서브픽셀 보간과 1프레임 선행 예측(오버슈트 클램프 포함)을 수행한다.
   */
  ingestPointerEvent(
    event: StylusPointerEventLike,
    overrideLookaheadMs?: number,
  ): StylusStepPredictionResult {
    const rawCoalesced = extractSafeList(event.getCoalescedEvents?.bind(event));
    const coalescedCandidates = rawCoalesced.length > 0 ? rawCoalesced : [event];

    const accepted: StylusSubpixelPoint[] = [];
    const interpolated: StylusSubpixelPoint[] = [];
    const fallbackPressure = this.history[this.history.length - 1]?.pressure ?? 0.5;

    for (const candidate of coalescedCandidates) {
      const point = normalizeEventToPoint(candidate, "authoritative", "coalesced", fallbackPressure);
      if (!point) continue;

      const last = this.history[this.history.length - 1];
      if (
        last &&
        Math.abs(last.x - point.x) < 1e-4 &&
        Math.abs(last.y - point.y) < 1e-4 &&
        Math.abs(last.pressure - point.pressure) < 1e-4 &&
        Math.abs(last.timeStamp - point.timeStamp) < 1e-3
      ) {
        continue;
      }

      accepted.push(point);
      this.history.push(point);
      if (this.history.length > 6) {
        this.history.shift();
      }
      this.totalAuthoritativeCount += 1;

      this.appendCatmullRomSubsteps(interpolated);
    }

    const rawNativePredicted = extractSafeList(event.getPredictedEvents?.bind(event));
    const lastAuth = this.history[this.history.length - 1];
    const validNativePredicted: StylusSubpixelPoint[] = [];
    if (lastAuth) {
      for (const pred of rawNativePredicted) {
        const pt = normalizeEventToPoint(
          pred,
          "predicted-preview",
          "native-fused",
          lastAuth.pressure,
        );
        if (pt && pt.timeStamp > lastAuth.timeStamp) {
          validNativePredicted.push(pt);
        }
      }
    }

    const lookahead = clamp(
      overrideLookaheadMs ?? this.lookaheadMs,
      0,
      this.maxLookaheadMs,
    );
    const prediction = this.computeLookaheadPrediction(validNativePredicted, lookahead);

    return Object.freeze({
      authoritative: Object.freeze(accepted),
      interpolated: Object.freeze(interpolated),
      predicted: prediction.points,
      diagnostics: Object.freeze({
        coalescedCount: accepted.length,
        nativePredictedCount: validNativePredicted.length,
        usedNativeFusion: prediction.usedNativeFusion,
        overshootClamped: prediction.overshootClamped,
        leadDistancePx: prediction.leadDistancePx,
        turnAttenuation: prediction.turnAttenuation,
      }),
    });
  }

  getStats(): {
    readonly historyLength: number;
    readonly totalAuthoritativeCount: number;
    readonly totalPredictedCount: number;
    readonly totalClampedCount: number;
  } {
    return Object.freeze({
      historyLength: this.history.length,
      totalAuthoritativeCount: this.totalAuthoritativeCount,
      totalPredictedCount: this.totalPredictedCount,
      totalClampedCount: this.totalClampedCount,
    });
  }

  private appendCatmullRomSubsteps(target: StylusSubpixelPoint[]): void {
    const n = this.history.length;
    if (n < 2) return;
    const p2 = this.history[n - 1];
    const p1 = this.history[n - 2];
    if (!p1 || !p2) return;

    const segDist = hypot2(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.min(
      this.maxSubstepsPerSegment,
      Math.max(1, Math.ceil(segDist / this.subdivideSpacingPx)),
    );
    if (steps <= 1) {
      target.push(p2);
      return;
    }

    const p0 = this.history[n - 3] ?? {
      x: p1.x - (p2.x - p1.x),
      y: p1.y - (p2.y - p1.y),
    };
    const p3 = {
      x: p2.x + (p2.x - p1.x),
      y: p2.y + (p2.y - p1.y),
    };

    for (let step = 1; step < steps; step += 1) {
      const u = step / steps;
      const pos = evaluateCentripetalCatmullRom(p0, p1, p2, p3, u);
      target.push(
        Object.freeze({
          x: pos.x,
          y: pos.y,
          pressure: clamp(p1.pressure + (p2.pressure - p1.pressure) * u, 0, 1),
          tiltX: clamp(p1.tiltX + (p2.tiltX - p1.tiltX) * u, -90, 90),
          tiltY: clamp(p1.tiltY + (p2.tiltY - p1.tiltY) * u, -90, 90),
          timeStamp: p1.timeStamp + (p2.timeStamp - p1.timeStamp) * u,
          authority: "authoritative",
          source: "catmull-rom-substep",
        }),
      );
    }
    target.push(p2);
  }

  private computeLookaheadPrediction(
    nativePredicted: readonly StylusSubpixelPoint[],
    lookaheadMs: number,
  ): {
    readonly points: readonly StylusSubpixelPoint[];
    readonly usedNativeFusion: boolean;
    readonly overshootClamped: boolean;
    readonly leadDistancePx: number;
    readonly turnAttenuation: number;
  } {
    const n = this.history.length;
    if (n < 2 || lookaheadMs <= 0) {
      return {
        points: Object.freeze([]),
        usedNativeFusion: false,
        overshootClamped: false,
        leadDistancePx: 0,
        turnAttenuation: 1,
      };
    }

    const p3 = this.history[n - 1];
    const p2 = this.history[n - 2];
    if (!p3 || !p2) {
      return {
        points: Object.freeze([]),
        usedNativeFusion: false,
        overshootClamped: false,
        leadDistancePx: 0,
        turnAttenuation: 1,
      };
    }

    const dx23 = p3.x - p2.x;
    const dy23 = p3.y - p2.y;
    const lastStride = hypot2(dx23, dy23);
    if (lastStride < this.minMovementThresholdPx) {
      return {
        points: Object.freeze([]),
        usedNativeFusion: false,
        overshootClamped: false,
        leadDistancePx: 0,
        turnAttenuation: 0,
      };
    }

    const dt23 = Math.max(1, p3.timeStamp - p2.timeStamp);
    const vx2 = dx23 / dt23;
    const vy2 = dy23 / dt23;

    let ax = 0;
    let ay = 0;
    let turnAttenuation = 1;

    const p1 = this.history[n - 3];
    if (p1) {
      const dx12 = p2.x - p1.x;
      const dy12 = p2.y - p1.y;
      const prevStride = hypot2(dx12, dy12);
      const dt12 = Math.max(1, p2.timeStamp - p1.timeStamp);
      const vx1 = dx12 / dt12;
      const vy1 = dy12 / dt12;

      if (prevStride > 1e-4) {
        const cosTheta = clamp((dx12 * dx23 + dy12 * dy23) / (prevStride * lastStride), -1, 1);
        // 급격한 꺾임(cosθ < 0.5)에서는 선행 거리와 곡률 항을 부드럽게 감쇠해 코너 오버슈트를 차단한다.
        turnAttenuation = cosTheta >= 0.5 ? 1 : clamp((cosTheta + 0.2) / 0.7, 0, 1);
        const avgDt = 0.5 * (dt12 + dt23);
        ax = ((vx2 - vx1) / avgDt) * turnAttenuation;
        ay = ((vy2 - vy1) / avgDt) * turnAttenuation;
      }
    }

    // 중점 보정 순간 속도 v(t3) = v23 + 0.5 * a * dt23 기반 2차 곡률 외삽으로 1프레임 선행 목표점 산출.
    const tau = lookaheadMs * turnAttenuation;
    const instVx = vx2 + 0.5 * ax * dt23;
    const instVy = vy2 + 0.5 * ay * dt23;
    let predX = p3.x + instVx * tau + 0.5 * ax * tau * tau;
    let predY = p3.y + instVy * tau + 0.5 * ay * tau * tau;

    // 4점 이상이면 끝점 접선 정합성을 위해 Centripetal Catmull-Rom 중간 제어점도 함께 생성한다.
    let predPressure = clamp(
      p3.pressure + ((p3.pressure - p2.pressure) / dt23) * tau * 0.5,
      0,
      1,
    );
    let predTiltX = clamp(p3.tiltX + ((p3.tiltX - p2.tiltX) / dt23) * tau * 0.5, -90, 90);
    let predTiltY = clamp(p3.tiltY + ((p3.tiltY - p2.tiltY) / dt23) * tau * 0.5, -90, 90);

    let usedNativeFusion = false;
    if (nativePredicted.length > 0) {
      const targetTime = p3.timeStamp + lookaheadMs;
      let closest = nativePredicted[0];
      if (closest) {
        let bestTimeDiff = Math.abs(closest.timeStamp - targetTime);
        for (let i = 1; i < nativePredicted.length; i += 1) {
          const cand = nativePredicted[i];
          if (!cand) continue;
          const diff = Math.abs(cand.timeStamp - targetTime);
          if (diff < bestTimeDiff) {
            bestTimeDiff = diff;
            closest = cand;
          }
        }
        const w = this.nativePredictionBlend * turnAttenuation;
        predX = predX * (1 - w) + closest.x * w;
        predY = predY * (1 - w) + closest.y * w;
        predPressure = clamp(predPressure * (1 - w) + closest.pressure * w, 0, 1);
        predTiltX = clamp(predTiltX * (1 - w) + closest.tiltX * w, -90, 90);
        predTiltY = clamp(predTiltY * (1 - w) + closest.tiltY * w, -90, 90);
        usedNativeFusion = true;
      }
    }

    // 오버슈트 클램프: 직전 이동거리 × maxStepMultiplier 와 maxLeadDistancePx 중 작은 값 이내로 제한.
    let leadDx = predX - p3.x;
    let leadDy = predY - p3.y;
    let leadDist = hypot2(leadDx, leadDy);
    const maxAllowedLead = Math.min(
      lastStride * this.maxStepMultiplier * Math.max(0.25, lookaheadMs / dt23),
      this.maxLeadDistancePx,
    );

    let overshootClamped = false;
    if (leadDist > maxAllowedLead && leadDist > 1e-6) {
      const scale = maxAllowedLead / leadDist;
      leadDx *= scale;
      leadDy *= scale;
      predX = p3.x + leadDx;
      predY = p3.y + leadDy;
      leadDist = maxAllowedLead;
      overshootClamped = true;
      this.totalClampedCount += 1;
    }

    // 최종 1프레임 예측 꼬리: 중간점(u=0.5)은 Centripetal Catmull-Rom 곡선 위에 배치해 부드럽게 이어진다.
    const virtualNext = { x: predX + leadDx, y: predY + leadDy };
    const midPos = evaluateCentripetalCatmullRom(p2, p3, { x: predX, y: predY }, virtualNext, 0.5);
    const source: StylusSubpixelPoint["source"] = usedNativeFusion
      ? "native-fused"
      : "catmull-rom-predicted";

    const midPoint: StylusSubpixelPoint = Object.freeze({
      x: midPos.x,
      y: midPos.y,
      pressure: clamp((p3.pressure + predPressure) * 0.5, 0, 1),
      tiltX: clamp((p3.tiltX + predTiltX) * 0.5, -90, 90),
      tiltY: clamp((p3.tiltY + predTiltY) * 0.5, -90, 90),
      timeStamp: p3.timeStamp + lookaheadMs * 0.5,
      authority: "predicted-preview",
      source,
    });

    const tipPoint: StylusSubpixelPoint = Object.freeze({
      x: predX,
      y: predY,
      pressure: predPressure,
      tiltX: predTiltX,
      tiltY: predTiltY,
      timeStamp: p3.timeStamp + lookaheadMs,
      authority: "predicted-preview",
      source,
    });

    this.totalPredictedCount += 2;
    return {
      points: Object.freeze([midPoint, tipPoint]),
      usedNativeFusion,
      overshootClamped,
      leadDistancePx: leadDist,
      turnAttenuation,
    };
  }
}
