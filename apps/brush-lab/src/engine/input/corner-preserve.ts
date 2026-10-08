import type { OneEuroParams } from "./one-euro";
import type { Pt } from "../core/types";

/**
 * 모서리 보존. 1€ 필터는 저속·고곡률에서 모서리를 둥글리므로
 * 곡률이 크면 차단 주파수를 올려 추종하고, 아주 느리면 차단 주파수를 내려 떨림을 억제한다.
 *
 * 손떨림(표본 간격보다 큰 잡음)은 표본 3개만 보면 모서리와 구분되지 않으므로,
 * 모서리 판정은 "직전 진행 방향이 일관됐는가"(연속 걸음의 평균 코사인)로 게이트한다.
 * 깨끗한 L자 경로는 일관성 1·회전각 90°로 모서리, 떨림은 일관성 ≈ 0이라 모서리가 아니다.
 */

/** 모서리 판정 회전각(rad). 설계 보충 §2.6: 최근 3표본 회전각 > 60°. */
export const CORNER_ANGLE_RAD = Math.PI / 3;
/** 모서리 판정에 필요한 직전 방향 일관성(평균 코사인) 하한. */
export const CORNER_MIN_CONSISTENCY = 0.85;
/** 방향 추정용 앵커 최소 간격(px). 이보다 짧은 걸음은 방향 잡음이라 앵커로 쓰지 않는다. */
export const CORNER_MIN_STEP_PX = 0.75;
/** 일관성 계산에 쓰는 직전 걸음 수. */
export const CORNER_CONSISTENCY_WINDOW = 6;
/** 모서리 뒤 N표본 동안 minCutoff를 올려 필터가 새 방향에 빨리 붙게 한다(설계 보충 §2.6: ×4). */
export const CORNER_HOLD_SAMPLES = 4;
export const CORNER_HOLD_CUTOFF_SCALE = 4;

/** Menger 곡률(1/px, 부호 있음: 왼쪽 회전 양수). 퇴화 삼각형은 0. */
export function estimateCurvature(p0: Pt, p1: Pt, p2: Pt): number {
  const ax = p1.x - p0.x;
  const ay = p1.y - p0.y;
  const bx = p2.x - p1.x;
  const by = p2.y - p1.y;
  const cx = p2.x - p0.x;
  const cy = p2.y - p0.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  const lc = Math.hypot(cx, cy);
  if (la < 1e-6 || lb < 1e-6 || lc < 1e-6) return 0;
  const cross = ax * by - ay * bx;
  return (2 * cross) / (la * lb * lc);
}

/** 두 걸음(p0→p1, p1→p2) 사이 회전각(rad, 0..π). 퇴화 걸음은 0. */
export function turnAngle(p0: Pt, p1: Pt, p2: Pt): number {
  const ax = p1.x - p0.x;
  const ay = p1.y - p0.y;
  const bx = p2.x - p1.x;
  const by = p2.y - p1.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1e-6 || lb < 1e-6) return 0;
  const cos = (ax * bx + ay * by) / (la * lb);
  return Math.acos(cos < -1 ? -1 : cos > 1 ? 1 : cos);
}

export interface AdaptiveCutoffOptions {
  curvatureGain: number;
  slowSpeedPxPerMs: number;
  slowCutoffScale: number;
}

/**
 * 곡률·속도 적응 파라미터.
 * |curvature|가 크면 minCutoff ↑(추종), 속도 < slowSpeed면 minCutoff × slowCutoffScale(떨림 억제).
 */
export function adaptiveCutoff(
  base: OneEuroParams,
  curvature: number,
  speedPxPerMs: number,
  opts: AdaptiveCutoffOptions,
): OneEuroParams {
  let minCutoff = base.minCutoff * (1 + opts.curvatureGain * Math.abs(curvature));
  if (speedPxPerMs < opts.slowSpeedPxPerMs) {
    minCutoff *= opts.slowCutoffScale;
  }
  return { minCutoff, beta: base.beta, dCutoff: base.dCutoff };
}

/** 예측을 꺼야 하는 상황(모서리 또는 저속). */
export function shouldSuppressPrediction(
  curvature: number,
  speedPxPerMs: number,
  cornerCurvature: number,
  slowSpeedPxPerMs: number,
): boolean {
  return Math.abs(curvature) > cornerCurvature || speedPxPerMs < slowSpeedPxPerMs;
}

/** 시각이 있는 점(앵커·정점). 시각을 모르는 호출(`push`에 `tMs`가 없는)에서는 `tMs`가 NaN이다. */
export interface TimedPt extends Pt {
  tMs: number;
}

export interface CornerVerdict {
  /** 이 표본이 모서리 직후 표본(정점은 직전 앵커)인가. */
  isCorner: boolean;
  /** 직전 앵커(= 모서리일 때의 정점). 앵커가 아직 없으면 null. */
  anchor: TimedPt | null;
  /** 직전 두 앵커와 이 점의 회전각(rad). */
  turnRad: number;
  /** 직전 걸음들의 방향 일관성 0..1(평균 코사인, 음수는 0). 앵커가 2개 미만이면 0. */
  consistency: number;
  /** 잡음 게이트를 거친 Menger 곡률(1/px) = 원 곡률 × consistency². */
  curvature: number;
}

export interface CornerDetectorOptions {
  cornerAngleRad?: number;
  minConsistency?: number;
  minStepPx?: number;
  window?: number;
}

/**
 * 모서리 감지기(상태 있음). 앵커(≥ minStepPx 간격의 raw 점)를 유지하고,
 * 새 점이 들어올 때 (a−2, a−1, p)의 회전각과 직전 걸음 방향의 일관성으로 판정한다.
 */
export class CornerDetector {
  private readonly cornerAngleRad: number;
  private readonly minConsistency: number;
  private readonly minStepPx: number;
  private readonly window: number;
  private anchors: TimedPt[] = [];
  /** 연속 걸음 방향 사이 코사인(최근 window개). */
  private stepCos: number[] = [];
  private lastDir: { x: number; y: number } | null = null;

  constructor(opts: CornerDetectorOptions = {}) {
    this.cornerAngleRad = opts.cornerAngleRad ?? CORNER_ANGLE_RAD;
    this.minConsistency = opts.minConsistency ?? CORNER_MIN_CONSISTENCY;
    this.minStepPx = opts.minStepPx ?? CORNER_MIN_STEP_PX;
    this.window = Math.max(1, Math.floor(opts.window ?? CORNER_CONSISTENCY_WINDOW));
  }

  reset(): void {
    this.anchors = [];
    this.stepCos = [];
    this.lastDir = null;
  }

  /** 직전 걸음들의 방향 일관성(현재 걸음 제외). */
  consistency(): number {
    if (this.stepCos.length === 0) return 0;
    let sum = 0;
    for (const c of this.stepCos) sum += c;
    const mean = sum / this.stepCos.length;
    return mean < 0 ? 0 : mean > 1 ? 1 : mean;
  }

  push(p: Pt & { tMs?: number }): CornerVerdict {
    const n = this.anchors.length;
    const last = this.anchors[n - 1];
    const tMs = p.tMs ?? Number.NaN;
    if (!last) {
      this.anchors.push({ x: p.x, y: p.y, tMs });
      return { isCorner: false, anchor: null, turnRad: 0, consistency: 0, curvature: 0 };
    }
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const len = Math.hypot(dx, dy);
    if (len < this.minStepPx) {
      // 앵커 간격 미만: 방향 추정에 쓰지 않는다(잡음). 현재 상태만 보고한다.
      return { isCorner: false, anchor: last, turnRad: 0, consistency: this.consistency(), curvature: 0 };
    }
    const prev = this.anchors[n - 2];
    const consistency = this.consistency();
    let turnRad = 0;
    let curvature = 0;
    if (prev) {
      turnRad = turnAngle(prev, last, p);
      curvature = estimateCurvature(prev, last, p) * consistency * consistency;
    }
    const isCorner = prev !== undefined && this.stepCos.length >= 2 && turnRad >= this.cornerAngleRad && consistency >= this.minConsistency;
    const dir = { x: dx / len, y: dy / len };
    if (this.lastDir) {
      const cos = this.lastDir.x * dir.x + this.lastDir.y * dir.y;
      this.stepCos.push(cos);
      if (this.stepCos.length > this.window) this.stepCos.shift();
    }
    this.lastDir = dir;
    this.anchors.push({ x: p.x, y: p.y, tMs });
    if (this.anchors.length > 3) this.anchors.shift();
    if (isCorner) {
      // 모서리 뒤에는 새 방향을 기준으로 일관성을 다시 쌓는다.
      this.stepCos = [];
    }
    return { isCorner, anchor: last, turnRad, consistency, curvature };
  }
}

/**
 * 정점 재방출에 필요한 두 출력 시각 사이 최소 간격(ms). 인접 표본 시각이 같거나 이보다 가까우면(타이머 클램프·일괄 타임스탬프·
 * 한 프레임에 합쳐진 coalesced 표본) 정점을 끼워 넣을 (lastT, nextT) 구간이 없어서 정점 시각이 직전 출력보다 앞서고
 * 그 구간 속도가 수천 px/ms로 튀어 이후 도포(속도 의존)가 지워진다. 이 경우 재방출을 건너뛴다(재방출이 없던 이전 동작 유지).
 */
export const VERTEX_MIN_WINDOW_MS = 0.5;

/**
 * 정점 재방출 시각(ms). 지연된 출력(lastT)에서 정점까지 밀린 거리(backlogPx)를 raw 속도로 따라잡는 시간을
 * (lastT, nextT) 구간의 [25 %, 75 %] 안으로 제한한다. 정점을 거의 같은 시각(Δt ≈ 0)에 내보내면 그 구간 속도가 수천 px/ms가 되어
 * 속도 의존 도포(빠른 획 끊김·농도 감소)가 정점 부근의 잉크를 지운다.
 *
 * 구간이 `VERTEX_MIN_WINDOW_MS`보다 짧거나 역전(nextT ≤ lastT)·비유한이면 `null`이다: 호출자는 재방출을 건너뛴다.
 * `null`이 아니면 반환값은 (lastT, nextT) 안에 엄격히 있다.
 */
export function vertexEmitTimeMs(lastT: number, nextT: number, backlogPx: number, rawSpeedPxPerMs: number): number | null {
  const window = nextT - lastT;
  if (!(window >= VERTEX_MIN_WINDOW_MS)) return null;
  const want = lastT + backlogPx / Math.max(rawSpeedPxPerMs, 0.05);
  return Math.min(nextT - 0.25 * window, Math.max(lastT + 0.25 * window, want));
}

/**
 * 재방출 정점·모서리 표본의 속도 상한 배수. 정점을 밀린 거리만큼 짧은 구간에 따라잡으면 구간 속도가 raw 속도보다 커지는데
 * (구간이 (lastT, nextT)의 25 %까지 줄 수 있어 정상 입력에서도 raw의 최대 4배), 그 이상은 시각 잡음이 만든 값이다.
 */
export const VERTEX_VELOCITY_CAP_RATIO = 4;

/**
 * 정점 재방출 최소 밀림(px). 지연된 출력이 정점에서 이 거리 미만이면 이미 정점 근처이므로 건너뛴다.
 * 오탐 방어의 주역은 아래 속도 하한이고, 이 값은 지연이 거의 없는 설정(minCutoff 수십 Hz)에서 불필요한 점을 만들지 않기 위한 것이다
 * (실측: 밀림 0.8 px도 편차를 +0.6 px 키우므로 1 px 하한은 너무 느슨했다).
 */
export const VERTEX_BACKFILL_MIN_PX = 0.25;

/**
 * 정점 재방출 최소 raw 속도(px/ms). 저속(손떨림 대역)에서는 모서리 판정이 잡음에 오탐되기 쉽고(실측: σ 0.2~0.3 px 잡음 100 px/2 s 획에서
 * 오탐 3~4회, 그때 raw 속도 ≤ 0.15 px/ms) 진짜 모서리의 밀림(기본 설정에서 ≈ 속도 × 12 ms)도 2.5 px 아래라 재방출의 이득이 작다.
 * 속도는 한 걸음 순간 속도가 아니라 `CornerGuard`의 최근 창 속도로 잰다.
 */
export const VERTEX_BACKFILL_MIN_SPEED_PX_PER_MS = 0.2;

/** 속도를 재는 최근 창 길이(ms). 240 Hz 약 10걸음, 60 Hz 2~3걸음이다. */
export const CORNER_GUARD_WINDOW_MS = 40;
/** 창이 이보다 짧으면(획 시작 직후·표본이 드문 입력) 속도를 믿을 수 없어 모서리로 치지 않는다(ms). */
export const CORNER_GUARD_MIN_SPAN_MS = 12;
/** 위치 잡음 σ를 재는 이력 길이(ms). 직전 모서리의 꺾임이 섞여도 3차 차분 중앙값이라 영향이 작다(240 Hz면 약 19항 중 3항). */
export const CORNER_GUARD_NOISE_WINDOW_MS = 80;
/** 잡음 σ 추정에 필요한 3차 차분 최소 개수(표본 6개). 이보다 적으면 모서리로 치지 않는다. */
export const CORNER_GUARD_MIN_NOISE_TERMS = 3;
/**
 * 나가는 변 길이 / 잡음 σ 하한(σ의 20배). 변이 이보다 짧으면 방향이 잡음으로 정해져 모서리와 구분되지 않는다. 깨끗한 입력(σ ≈ 0)에서는
 * 어떤 길이도 통과해 표본율에 관계없이 모서리를 잡고, σ 0.25 px 잡음에서는 변 5 px, σ 0.4 px에서는 8 px가 필요하다.
 * 값은 σ 0.25·0.4 px × 120 Hz~1 kHz × 50~600 px/s 격자(32칸 × 60획 = 1,920획)에서 오탐 0이 되는 가장 작은 값으로 골랐다
 * (12배는 같은 격자에서 2회, 16배는 4회 오탐이 남았다).
 */
export const CORNER_GUARD_LEG_SIGMA_RATIO = 20;

/**
 * 모서리 오탐 방어(상태 있음). 원시 표본의 최근 이력으로 세 가지를 한다.
 *
 * 1. 속도: 한 걸음 순간 속도(`|s − v| / Δt`)는 걸음 변위가 잡음 크기이고 Δt가 짧은 240 Hz 이상 입력에서 가끔 0.2 px/ms를 넘어
 *    저속 손떨림을 모서리로 오탐한다(σ 0.25 px 잡음 40획에서 148회). 그래서 정점 직전 `CORNER_GUARD_WINDOW_MS` 구간의 **순변위**
 *    (창 첫 표본 → 정점) / 경과 시간으로 잰다(잡음은 순변위에서 거의 상쇄된다). 한 걸음이 아니므로 한 프레임이 멈춘 입력(Δt 40 ms)에서도
 *    진짜 모서리가 사라지지 않는다.
 * 2. 변 길이(코너 게이트만): 나가는 변(정점 → 지금 표본)이 위치 잡음 σ의 `CORNER_GUARD_LEG_SIGMA_RATIO`(20)배 이상이어야 한다. σ는 이력의
 *    3차 차분 중앙값으로 잰다(`noiseSigma`): 직선·곡선·가감속의 기여는 작아 잡음만 남고, 표본 시각과 무관하다.
 *    정수 격자 계단은 σ ≈ 0.3 px 잡음처럼 보여 변 6 px 미만(한 칸은 1~1.4 px)의 '꺾임'이 모두 걸러진다.
 * 3. `pickVertex`: 앵커와 지금 표본 사이 표본 중 두 점을 잇는 현이 가장 멀리 떨어진 표본 = 실제 꺾임점(Douglas-Peucker 분할점).
 *    앵커 간격이 표본 간격보다 큰 입력(저속·고주파)에서 정점이 앵커 쪽으로 치우치지 않게 한다.
 */
export class CornerGuard<T extends TimedPt = TimedPt> {
  private readonly pts: T[] = [];

  reset(): void {
    this.pts.length = 0;
  }

  /** 원시 표본을 기록한다(참조를 그대로 둔다). 모서리 판정 뒤에 부른다: 판정 시점의 이력은 지금 표본 직전까지다. */
  record(p: T): void {
    this.pts.push(p);
    const horizon = p.tMs - 2 * CORNER_GUARD_NOISE_WINDOW_MS;
    let drop = 0;
    while (drop < this.pts.length - 1 && (this.pts[drop]?.tMs ?? 0) < horizon) drop += 1;
    if (drop > 0) this.pts.splice(0, drop);
  }

  /** 같은 위치·시각의 기록 표본 중 가장 나중 것의 색인(없으면 −1). */
  private indexOf(p: TimedPt): number {
    for (let i = this.pts.length - 1; i >= 0; i -= 1) {
      const q = this.pts[i];
      if (q && q.x === p.x && q.y === p.y && q.tMs === p.tMs) return i;
    }
    return -1;
  }

  /**
   * 정점 `vertex`(기록된 표본) 직전 창의 순변위 속도가 `minSpeedPxPerMs` 이상이고, 나가는 변 `outLegPx`가 위치 잡음 σ의
   * `CORNER_GUARD_LEG_SIGMA_RATIO`배 이상인가. `outLegPx`가 null이면 속도만 본다(입력 파이프라인: 단계가 이미 매끈하게 바꾼 열이라 잡음 σ를 재지 않는다).
   */
  approve(vertex: TimedPt, outLegPx: number | null, minSpeedPxPerMs: number = VERTEX_BACKFILL_MIN_SPEED_PX_PER_MS): boolean {
    const horizon = vertex.tMs - CORNER_GUARD_WINDOW_MS;
    let first: TimedPt | null = null;
    for (const q of this.pts) {
      if (q.tMs >= horizon && q.tMs <= vertex.tMs) {
        first = q;
        break;
      }
    }
    if (!first) return false;
    const span = vertex.tMs - first.tMs;
    if (!(span >= CORNER_GUARD_MIN_SPAN_MS)) return false;
    if (!(Math.hypot(vertex.x - first.x, vertex.y - first.y) / span >= minSpeedPxPerMs)) return false;
    if (outLegPx === null) return true;
    const sigma = this.noiseSigma(vertex);
    return sigma !== null && outLegPx >= CORNER_GUARD_LEG_SIGMA_RATIO * sigma;
  }

  /**
   * 정점까지 이력의 위치 잡음 σ(px, 축별). 3차 차분(`p[i+2] − 3p[i+1] + 3p[i] − p[i−1]`, 백색 잡음이면 축별 분산 20σ²)의 크기 제곱
   * **중앙값**으로 잰다: 등속·등가속 움직임과 곡선은 3차 차분이 거의 0이고, 중앙값이라 정지에서 출발하는 구간 같은 일부 이상치에 휘둘리지
   * 않는다(2차 차분 평균은 큰 걸음의 가속을 잡음으로 읽어 정상 모서리를 거부했다). 이력이 `CORNER_GUARD_MIN_NOISE_TERMS`항 미만이면 null.
   */
  private noiseSigma(vertex: TimedPt): number | null {
    const end = this.indexOf(vertex);
    if (end < 0) return null;
    const horizon = vertex.tMs - CORNER_GUARD_NOISE_WINDOW_MS;
    const use: TimedPt[] = [];
    for (let i = 0; i <= end; i += 1) {
      const q = this.pts[i];
      if (q && q.tMs >= horizon) use.push(q);
    }
    const mags: number[] = [];
    for (let i = 0; i + 3 < use.length; i += 1) {
      const a = use[i];
      const b = use[i + 1];
      const c = use[i + 2];
      const d = use[i + 3];
      if (!a || !b || !c || !d) continue;
      const dx = d.x - 3 * c.x + 3 * b.x - a.x;
      const dy = d.y - 3 * c.y + 3 * b.y - a.y;
      mags.push(dx * dx + dy * dy);
    }
    if (mags.length < CORNER_GUARD_MIN_NOISE_TERMS) return null;
    mags.sort((p, q) => p - q);
    const median = mags[mags.length >> 1] ?? 0;
    // 2축 크기 제곱의 중앙값 = 20σ² · 2ln2 (χ²₂의 중앙값 2ln2 ≈ 1.386).
    return Math.sqrt(median / (20 * 2 * Math.LN2));
  }

  /**
   * 앵커 위치의 기록 표본부터 지금 표본 `next` 직전까지의 이력 중 꺾임점(앵커-지금 표본 현에서 가장 먼 표본, 동률이면 앞선 쪽).
   * 앵커 표본이 이력에서 밀려났으면(시각 역행·긴 공백) null이다: 호출자는 모서리로 치지 않는다.
   */
  pickVertex(anchor: Pt, next: Pt): T | null {
    let at = -1;
    for (let i = this.pts.length - 1; i >= 0; i -= 1) {
      const q = this.pts[i];
      if (q && q.x === anchor.x && q.y === anchor.y) {
        at = i;
        break;
      }
    }
    const first = this.pts[at];
    if (!first) return null;
    const ax = next.x - anchor.x;
    const ay = next.y - anchor.y;
    const len = Math.hypot(ax, ay);
    let best: T = first;
    let bestDist = 0;
    if (len < 1e-9) return best;
    for (let i = at + 1; i < this.pts.length; i += 1) {
      const q = this.pts[i];
      if (!q) continue;
      const d = Math.abs(ax * (q.y - anchor.y) - ay * (q.x - anchor.x)) / len;
      if (d > bestDist) {
        bestDist = d;
        best = q;
      }
    }
    return best;
  }
}
