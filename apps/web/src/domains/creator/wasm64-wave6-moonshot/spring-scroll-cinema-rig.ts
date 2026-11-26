/**
 * 임계 감쇠(Critically Damped, ζ = 1) 스프링-댐퍼 스크롤 시네마 카메라 리그.
 *
 * - 독자의 터치 플릭 속도 추정, 점성 관성 감속, 전정기관 보호 속도·가속도 상한을 결합해
 *   멀미 유발 오버슈트(목표 지나침·역방향 튕김)가 0px인 카메라 궤적을 계산한다.
 * - 해석적 지수 반군(analytical exponential semigroup) 해법을 사용해 60Hz와 120Hz 프레임 전진이
 *   부동소수점 오차 범위 안에서 결정론적으로 일치한다.
 * - `prefersReducedMotion` 활성화 시 원경·중경·전경 시차(parallax)를 인물 기준면(1.0)으로
 *   잠그고 긴 관성 유영을 즉시 정착 모드로 전환한다.
 */

export type ParallaxPlaneId =
  | "far-sky"
  | "mid-architecture"
  | "character-plane"
  | "foreground-particles"
  | (string & {});

export interface ParallaxPlaneSpec {
  readonly id: ParallaxPlaneId;
  readonly labelKo: string;
  readonly depthFactor: number;
  readonly baseScale?: number;
  readonly maxOffsetClampPx?: number;
}

export interface TouchScrollSample {
  readonly yPx: number;
  readonly timestampMs: number;
}

export interface ParallaxLayerTransform {
  readonly id: ParallaxPlaneId;
  readonly labelKo: string;
  readonly effectiveDepthFactor: number;
  readonly offsetYPx: number;
  readonly particleDriftPx: number;
  readonly scale: number;
  readonly motionBlurStrength: number;
}

export interface CinemaCameraFrame {
  readonly elapsedSec: number;
  readonly scrollYPx: number;
  readonly targetYPx: number;
  readonly velocityPxPerSec: number;
  readonly accelerationPxPerSec2: number;
  readonly overshootPx: number;
  readonly vestibularComfortScore: number;
  readonly isSettled: boolean;
  readonly prefersReducedMotion: boolean;
  readonly layerTransforms: readonly ParallaxLayerTransform[];
}

export interface SpringScrollCinemaRigOptions {
  readonly maxScrollYPx: number;
  readonly initialScrollYPx?: number;
  readonly naturalFrequencyRadPerSec?: number;
  readonly coastingDragPerSec?: number;
  readonly maxSafeVelocityPxPerSec?: number;
  readonly maxSafeAccelPxPerSec2?: number;
  readonly prefersReducedMotion?: boolean;
  readonly cutSnapAnchorsYPx?: readonly number[];
  readonly snapCaptureRadiusPx?: number;
  readonly planes?: readonly ParallaxPlaneSpec[];
}

export const DEFAULT_CINEMA_PARALLAX_PLANES: readonly ParallaxPlaneSpec[] = Object.freeze([
  {
    id: "far-sky",
    labelKo: "원경 하늘",
    depthFactor: 0.2,
    baseScale: 1.04,
  },
  {
    id: "mid-architecture",
    labelKo: "중경 건축물",
    depthFactor: 0.55,
    baseScale: 1.02,
  },
  {
    id: "character-plane",
    labelKo: "인물 기준면",
    depthFactor: 1.0,
    baseScale: 1.0,
  },
  {
    id: "foreground-particles",
    labelKo: "전경 입자",
    depthFactor: 1.24,
    baseScale: 1.06,
  },
]);

const SETTLE_DISTANCE_EPSILON_PX = 0.05;
const SETTLE_VELOCITY_EPSILON_PX_PER_SEC = 0.25;
const TOUCH_HISTORY_WINDOW_MS = 100;
const TOUCH_RELEASE_STALL_MS = 65;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * 터치 이동 표본 시퀀스에서 손가락을 떼는 순간의 스크롤 플릭 속도(양수 = 아래로 스크롤)를 추정한다.
 * 손가락을 멈춘 채 65ms 이상 대기한 뒤 떼면 의도적 정지로 판정해 속도 0을 반환한다.
 */
export function estimateTouchFlickVelocity(
  samples: readonly TouchScrollSample[],
  maxSafeVelocityPxPerSec = 2600,
): number {
  if (samples.length < 2) {
    return 0;
  }
  const last = samples[samples.length - 1]!;
  const prev = samples[samples.length - 2]!;
  if (last.timestampMs - prev.timestampMs > TOUCH_RELEASE_STALL_MS) {
    return 0;
  }

  const windowStartMs = last.timestampMs - TOUCH_HISTORY_WINDOW_MS;
  let weightedVelSum = 0;
  let weightTotal = 0;

  for (let i = samples.length - 1; i >= 1; i -= 1) {
    const curr = samples[i]!;
    const earlier = samples[i - 1]!;
    if (curr.timestampMs < windowStartMs) {
      break;
    }
    const dtMs = curr.timestampMs - earlier.timestampMs;
    if (dtMs <= 0.25 || dtMs > TOUCH_RELEASE_STALL_MS) {
      continue;
    }
    // 손가락을 위로 쓸어올릴 때(yPx 감소) 문서는 아래(+scrollY)로 전진한다.
    const segmentVelocity = ((earlier.yPx - curr.yPx) / dtMs) * 1000;
    const recencyWeight = Math.exp(-(last.timestampMs - curr.timestampMs) / 45);
    weightedVelSum += segmentVelocity * recencyWeight;
    weightTotal += recencyWeight;
  }

  if (weightTotal <= 1e-9) {
    return 0;
  }
  const rawVelocity = weightedVelSum / weightTotal;
  const safeCap = Math.max(100, maxSafeVelocityPxPerSec);
  return clamp(rawVelocity, -safeCap, safeCap);
}

export interface AnalyticalSpringState {
  readonly displacementPx: number;
  readonly velocityPxPerSec: number;
  readonly accelerationPxPerSec2: number;
}

/**
 * 임계 감쇠(ζ = 1) 2차 미분방정식 `x'' + 2ω x' + ω^2 x = 0`의 해석적 정확 해.
 * Δt 크기(60Hz, 120Hz, 가변 프레임)에 무관하게 반군 불변성을 만족한다.
 */
export function stepCriticallyDampedSpringAnalytical(
  displacement0: number,
  velocity0: number,
  omegaRadPerSec: number,
  dtSec: number,
): AnalyticalSpringState {
  if (dtSec <= 0) {
    const accel0 = -2 * omegaRadPerSec * velocity0 - omegaRadPerSec * omegaRadPerSec * displacement0;
    return {
      displacementPx: displacement0,
      velocityPxPerSec: velocity0,
      accelerationPxPerSec2: accel0,
    };
  }
  const omega = Math.max(0.5, omegaRadPerSec);
  const expFactor = Math.exp(-omega * dtSec);
  const c1 = displacement0;
  const c2 = velocity0 + omega * displacement0;

  const nextDisp = (c1 + c2 * dtSec) * expFactor;
  const nextVel = (velocity0 - omega * c2 * dtSec) * expFactor;
  const nextAccel = -2 * omega * nextVel - omega * omega * nextDisp;

  return {
    displacementPx: nextDisp,
    velocityPxPerSec: nextVel,
    accelerationPxPerSec2: nextAccel,
  };
}

/**
 * 오버슈트 방지 불변 원뿔(`0 <= v * (-sign(x)) <= ω |x|`) 안으로 초기 진입 속도를 제한한다.
 * 한 번 원뿔 안에 들어온 상태는 임계 감쇠 반군 아래에서 모든 미래 시각 t > 0 동안 원뿔 내부에 머문다.
 */
function clampVelocityToNoOvershootCone(
  displacementPx: number,
  velocityPxPerSec: number,
  omegaRadPerSec: number,
): number {
  if (Math.abs(displacementPx) <= 1e-9) {
    return 0;
  }
  const criticalLimit = omegaRadPerSec * Math.abs(displacementPx);
  if (displacementPx < 0) {
    return clamp(velocityPxPerSec, 0, criticalLimit);
  }
  return clamp(velocityPxPerSec, -criticalLimit, 0);
}

/**
 * 다중 평면 시차(parallax)와 전정기관 안전 감속을 구동하는 스크롤 시네마 카메라 리그.
 */
export class SpringScrollCinemaRig {
  private readonly maxScrollYPx: number;
  private readonly omegaRadPerSec: number;
  private readonly coastingDragPerSec: number;
  private readonly maxSafeVelocityPxPerSec: number;
  private readonly maxSafeAccelPxPerSec2: number;
  private readonly cutSnapAnchorsYPx: readonly number[];
  private readonly snapCaptureRadiusPx: number;
  private readonly planes: readonly ParallaxPlaneSpec[];

  private prefersReducedMotion: boolean;
  private scrollYPx: number;
  private targetYPx: number;
  private anchorStartYPx: number;
  private velocityPxPerSec: number;
  private accelerationPxPerSec2: number;
  private peakExcursionSignedSign: number;
  private maxObservedOvershootPx: number;
  private elapsedSec: number;

  public constructor(options: SpringScrollCinemaRigOptions) {
    this.maxScrollYPx = Math.max(0, options.maxScrollYPx);
    this.omegaRadPerSec = Math.max(1, options.naturalFrequencyRadPerSec ?? 14);
    this.coastingDragPerSec = Math.max(1, options.coastingDragPerSec ?? 5.5);
    this.maxSafeVelocityPxPerSec = Math.max(200, options.maxSafeVelocityPxPerSec ?? 2600);
    this.maxSafeAccelPxPerSec2 = Math.max(1000, options.maxSafeAccelPxPerSec2 ?? 18000);
    this.prefersReducedMotion = options.prefersReducedMotion ?? false;
    this.cutSnapAnchorsYPx = [...(options.cutSnapAnchorsYPx ?? [])].sort((a, b) => a - b);
    this.snapCaptureRadiusPx = Math.max(0, options.snapCaptureRadiusPx ?? 72);
    this.planes = options.planes ?? DEFAULT_CINEMA_PARALLAX_PLANES;

    const initialY = clamp(options.initialScrollYPx ?? 0, 0, this.maxScrollYPx);
    this.scrollYPx = initialY;
    this.targetYPx = initialY;
    this.anchorStartYPx = initialY;
    this.velocityPxPerSec = 0;
    this.accelerationPxPerSec2 = 0;
    this.peakExcursionSignedSign = 0;
    this.maxObservedOvershootPx = 0;
    this.elapsedSec = 0;
  }

  public setPrefersReducedMotion(enabled: boolean): CinemaCameraFrame {
    this.prefersReducedMotion = enabled;
    if (enabled) {
      this.velocityPxPerSec = 0;
      this.accelerationPxPerSec2 = 0;
      this.scrollYPx = this.targetYPx;
    }
    return this.snapshot();
  }

  /**
   * 특정 스크롤 목표 좌표로 임계 감쇠 카메라 이동을 지시한다.
   */
  public scrollToTarget(nextTargetYPx: number): CinemaCameraFrame {
    const clampedTarget = this.resolveSnappedTarget(clamp(nextTargetYPx, 0, this.maxScrollYPx));
    this.targetYPx = clampedTarget;
    this.anchorStartYPx = this.scrollYPx;
    this.maxObservedOvershootPx = 0;

    if (this.prefersReducedMotion) {
      this.scrollYPx = clampedTarget;
      this.velocityPxPerSec = 0;
      this.accelerationPxPerSec2 = 0;
      this.peakExcursionSignedSign = 0;
      return this.snapshot();
    }

    const disp = this.scrollYPx - this.targetYPx;
    this.peakExcursionSignedSign = Math.sign(disp);
    this.velocityPxPerSec = clampVelocityToNoOvershootCone(
      disp,
      clamp(this.velocityPxPerSec, -this.maxSafeVelocityPxPerSec, this.maxSafeVelocityPxPerSec),
      this.omegaRadPerSec,
    );
    return this.snapshot();
  }

  /**
   * 독자 터치 표본 시퀀스로 플릭 관성 주행과 정착 목표를 설정한다.
   */
  public releaseTouchFlick(samples: readonly TouchScrollSample[]): CinemaCameraFrame {
    if (this.prefersReducedMotion) {
      const snapped = this.resolveSnappedTarget(this.scrollYPx);
      this.scrollYPx = snapped;
      this.targetYPx = snapped;
      this.velocityPxPerSec = 0;
      this.accelerationPxPerSec2 = 0;
      this.peakExcursionSignedSign = 0;
      this.maxObservedOvershootPx = 0;
      return this.snapshot();
    }

    const flickVel = estimateTouchFlickVelocity(samples, this.maxSafeVelocityPxPerSec);
    if (Math.abs(flickVel) < 12) {
      return this.scrollToTarget(this.scrollYPx);
    }

    // 관성 정지 예상 지점을 산출한 뒤 가장 가까운 컷 앵커와 문서 경계 안으로 안전하게 수렴시킨다.
    const rawProjectedTarget = this.scrollYPx + flickVel / this.coastingDragPerSec;
    const boundedTarget = this.resolveSnappedTarget(
      clamp(rawProjectedTarget, 0, this.maxScrollYPx),
    );

    this.targetYPx = boundedTarget;
    this.anchorStartYPx = this.scrollYPx;
    this.maxObservedOvershootPx = 0;
    const disp = this.scrollYPx - this.targetYPx;
    this.peakExcursionSignedSign = Math.sign(disp);
    this.velocityPxPerSec = clampVelocityToNoOvershootCone(disp, flickVel, this.omegaRadPerSec);

    return this.snapshot();
  }

  /**
   * 임의 시간 간격(초)만큼 해석적 해로 카메라를 전진시킨다.
   */
  public stepSeconds(dtSec: number): CinemaCameraFrame {
    const safeDt = Math.max(0, dtSec);
    this.elapsedSec += safeDt;

    if (this.prefersReducedMotion) {
      this.scrollYPx = this.targetYPx;
      this.velocityPxPerSec = 0;
      this.accelerationPxPerSec2 = 0;
      return this.snapshot();
    }

    const disp0 = this.scrollYPx - this.targetYPx;
    const stepped = stepCriticallyDampedSpringAnalytical(
      disp0,
      this.velocityPxPerSec,
      this.omegaRadPerSec,
      safeDt,
    );

    let nextY = this.targetYPx + stepped.displacementPx;
    let nextVel = stepped.velocityPxPerSec;
    let nextAccel = stepped.accelerationPxPerSec2;

    // 부동소수점 반올림 경계에서도 오버슈트가 절대 발생하지 않도록 보호한다.
    if (
      this.peakExcursionSignedSign !== 0 &&
      Math.sign(nextY - this.targetYPx) !== 0 &&
      Math.sign(nextY - this.targetYPx) !== this.peakExcursionSignedSign
    ) {
      nextY = this.targetYPx;
      nextVel = 0;
      nextAccel = 0;
    }

    if (
      Math.abs(nextY - this.targetYPx) <= SETTLE_DISTANCE_EPSILON_PX &&
      Math.abs(nextVel) <= SETTLE_VELOCITY_EPSILON_PX_PER_SEC
    ) {
      nextY = this.targetYPx;
      nextVel = 0;
      nextAccel = 0;
    }

    this.scrollYPx = clamp(nextY, 0, this.maxScrollYPx);
    this.velocityPxPerSec = nextVel;
    this.accelerationPxPerSec2 = nextAccel;

    if (this.peakExcursionSignedSign < 0 && this.scrollYPx > this.targetYPx) {
      this.maxObservedOvershootPx = Math.max(
        this.maxObservedOvershootPx,
        this.scrollYPx - this.targetYPx,
      );
    } else if (this.peakExcursionSignedSign > 0 && this.scrollYPx < this.targetYPx) {
      this.maxObservedOvershootPx = Math.max(
        this.maxObservedOvershootPx,
        this.targetYPx - this.scrollYPx,
      );
    }

    return this.snapshot();
  }

  /**
   * 60Hz 또는 120Hz 고정 주사율로 지정한 프레임 수만큼 결정론적 전진을 수행한다.
   */
  public stepFrames(frameCount: number, refreshRateHz: 60 | 120): readonly CinemaCameraFrame[] {
    const count = Math.max(0, Math.floor(frameCount));
    const dt = 1 / refreshRateHz;
    const frames: CinemaCameraFrame[] = [];
    for (let i = 0; i < count; i += 1) {
      frames.push(this.stepSeconds(dt));
    }
    return frames;
  }

  public snapshot(): CinemaCameraFrame {
    const isSettled =
      Math.abs(this.scrollYPx - this.targetYPx) <= SETTLE_DISTANCE_EPSILON_PX &&
      Math.abs(this.velocityPxPerSec) <= SETTLE_VELOCITY_EPSILON_PX_PER_SEC;

    const speedRatio = Math.abs(this.velocityPxPerSec) / this.maxSafeVelocityPxPerSec;
    const accelRatio = Math.abs(this.accelerationPxPerSec2) / this.maxSafeAccelPxPerSec2;
    const rawPenalty = 0.6 * Math.max(0, speedRatio - 0.85) + 0.4 * Math.max(0, accelRatio - 0.85);
    const vestibularComfortScore = this.prefersReducedMotion
      ? 1
      : clamp(1 - rawPenalty - this.maxObservedOvershootPx * 0.1, 0, 1);

    const layerTransforms: ParallaxLayerTransform[] = this.planes.map((plane) => {
      const effectiveDepth = this.prefersReducedMotion ? 1.0 : plane.depthFactor;
      const rawOffset = -this.scrollYPx * effectiveDepth;
      const relativeShift = -this.scrollYPx * (effectiveDepth - 1.0);
      const clampedShift =
        plane.maxOffsetClampPx !== undefined
          ? clamp(relativeShift, -plane.maxOffsetClampPx, plane.maxOffsetClampPx)
          : relativeShift;
      const offsetYPx =
        plane.maxOffsetClampPx !== undefined ? -this.scrollYPx + clampedShift : rawOffset;

      const isForeground = plane.id === "foreground-particles";
      const particleDriftPx =
        this.prefersReducedMotion || !isForeground
          ? 0
          : Math.sin(this.elapsedSec * 1.8) * 3.5;

      const blurStrength = this.prefersReducedMotion
        ? 0
        : clamp(
            (Math.abs(this.velocityPxPerSec) / this.maxSafeVelocityPxPerSec) *
              Math.abs(effectiveDepth - 1.0),
            0,
            1,
          );

      return {
        id: plane.id,
        labelKo: plane.labelKo,
        effectiveDepthFactor: effectiveDepth,
        offsetYPx,
        particleDriftPx,
        scale: this.prefersReducedMotion ? 1.0 : (plane.baseScale ?? 1.0),
        motionBlurStrength: blurStrength,
      };
    });

    return {
      elapsedSec: this.elapsedSec,
      scrollYPx: this.scrollYPx,
      targetYPx: this.targetYPx,
      velocityPxPerSec: this.velocityPxPerSec,
      accelerationPxPerSec2: this.accelerationPxPerSec2,
      overshootPx: this.maxObservedOvershootPx,
      vestibularComfortScore,
      isSettled,
      prefersReducedMotion: this.prefersReducedMotion,
      layerTransforms,
    };
  }

  public get anchorOriginYPx(): number {
    return this.anchorStartYPx;
  }

  private resolveSnappedTarget(candidateYPx: number): number {
    if (this.cutSnapAnchorsYPx.length === 0 || this.snapCaptureRadiusPx <= 0) {
      return candidateYPx;
    }
    let bestAnchor = candidateYPx;
    let bestDist = this.snapCaptureRadiusPx;
    for (const anchor of this.cutSnapAnchorsYPx) {
      const d = Math.abs(anchor - candidateYPx);
      if (d <= bestDist) {
        bestDist = d;
        bestAnchor = clamp(anchor, 0, this.maxScrollYPx);
      }
    }
    return bestAnchor;
  }
}
