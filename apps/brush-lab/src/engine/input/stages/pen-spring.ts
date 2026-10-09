import { penLagMsFromPct } from "../stabilizer-map";

import { withPosition } from "./raw-stage";

import type { RawStage } from "./raw-stage";
import type { RawSample } from "../../core/types";

/**
 * 물리 펜(스프링-질량 펜) 입력 단계와 순수 적분기.
 *
 * 모델: 질량 1의 펜이 포인터(목표)에 영 길이 스프링으로 매달려 있고, 지면 위를 끌리며 **지면 항력(선형 감쇠 λ·v)**을 받는다.
 *
 *   a = k·(target − x) − λ·v,   k = ωn²
 *
 * 설계 근거(SP-A·SP-C 실측, Node 22 단일 스레드):
 * - 감쇠를 포인터-펜 **상대 속도**에만 걸면 정상 추종 속도에서 감쇠력이 0이라 추적 지연이 0.7~1.1 ms로 사라져 끌림이 없다.
 *   끌리는 감각은 **지면 항력**이 만든다: 포인터가 일정 속도 v로 움직일 때 펜은 거리 λ·v/k 만큼 뒤처지며 지연은 λ/k 다(ζ=1이면 2/ωn + h).
 * - 감쇠비. SP-C는 ζ=0.55 저감쇠로 측정해 획 끝 오버슈트가 flick 3.7(128²)/14.9(512²) px, 정착 70~112 ms였다.
 *   ζ ≥ 1(임계·과감쇠)이면 정상 추종 상태에서 멈추는 펜은 목표를 넘지 않는다(오차의 시간 해가 부호를 바꾸지 않는다).
 *   다만 1/240 s 이산 계에서는 연속 모델의 ζ=1이 약간 저감쇠라 짧은 지연(큰 ωn)에서 작은 오버슈트가 남는다(실측: 지연 15 ms, ζ=1에서
 *   3 px/ms flick 0.8 px). 이 계의 임계 감쇠는 λ = 2ωn + ωn²·h (h = 서브스텝)이다: 상태 (e = 목표 − x, v)의 전이 행렬은 trace = 1 + (1 − k·h²)/(1 + λ·h),
 *   det = 1/(1 + λ·h)이고 두 극이 겹칠 조건 trace² = 4·det를 풀면 (1 + λ·h) = (1 + ωn·h)²가 된다. 그래서 이 모듈의 감쇠비 ζ는
 *   λ = ζ·(2ωn + ωn²·h)로 정의한다: ζ=1이 **이 이산 계의 임계 감쇠**이고 극은 z = 1/(1 + ωn·h) ∈ (0, 1)이라 ωn에 관계없이 안정하다.
 *   기본값과 실측은 `bench/metrics/input-stage-metrics.test.ts`가 고정한다.
 * - 고정 서브스텝 1/240 s를 **표본 시각(tMs)**으로 구동한다(`PenSpringDriver`): 이벤트 율(60/120/240 Hz)에 관계없이 같은 시각 격자에서
 *   같은 식을 적분하므로 결과가 결정적이고, 표본율이 달라도 같은 궤적에서 거의 같은 출력이 나온다.
 *
 * `PenSpring2D`는 엔진 외부 의존이 없는 순수 클래스이며 입력 단계 외에 붓 손잡이 모델(물리 붓털 레인)이 그대로 가져다 쓴다.
 */

/** 고정 서브스텝(초). 240 Hz. */
export const PEN_SPRING_SUBSTEP_SEC = 1 / 240;
/** 고정 서브스텝(ms). */
export const PEN_SPRING_SUBSTEP_MS = 1000 / 240;
/**
 * 스프링 고유 각진동수 상한(rad/s) = 3 / 서브스텝. 지연 요청이 서브스텝(ζ·h)에 가까우면 ωn = 2ζ/(lag − ζ·h)가 폭주하므로 가둔다.
 * **이 상한이 저감쇠(ζ<1)의 안정을 보장하지는 않는다.** 이 이산 계(위치 먼저·속도 암시적 항력)의 안정 조건은 (ωn·h)² < 4 + 2λh이고
 * λ = ζ·(2ωn + ωn²·h)를 넣으면 (1 − 2ζ)(ωn·h)² − 4ζ·(ωn·h) − 4 < 0이다. ζ ≥ 0.5이면 ωn에 관계없이 성립하고(ζ=1이면 극은
 * z = 1/(1 + ωn·h)), ζ < 0.5이면 ωn·h < 2/(1 − 2ζ)일 때만 안정이다. 상한 ωn·h = 3은 ζ > 1/6에서 이 조건을 만족하고, ζ ≤ 1/6에서는
 * 상한에 닿는 짧은 지연(예: 지연 0.5 ms, ζ 0.1)이 발산해 NaN이 된다. 그래서 `penSpringParams`·`PenSpring2D`는 이 조건을 어기는 조합을
 * `RangeError`로 거부한다(`isPenSpringStable`).
 */
export const PEN_SPRING_MAX_OMEGA = 3 / PEN_SPRING_SUBSTEP_SEC;
/** 물리 펜 기본 감쇠비. 측정으로 정한 값이며 근거는 `input-stage-metrics.test.ts`와 README 증거 절에 있다. */
export const PEN_SPRING_DEFAULT_ZETA = 1;
/** 획 끝 정착에 허용하는 최대 시간(ms). 이 안에 멈추지 않으면 남은 거리를 마지막 `up` 표본이 메운다. */
export const PEN_SPRING_MAX_SETTLE_MS = 600;
/** 정지 판정: 목표까지 거리(px) 미만이고 속도(px/s) 미만이면 멈춘 것으로 본다. */
export const PEN_SPRING_REST_DISTANCE_PX = 0.05;
export const PEN_SPRING_REST_SPEED_PX_PER_SEC = 1;

/** 스프링·항력 상수. */
export interface PenSpringParams {
  /** 스프링 고유 각진동수 ωn(rad/s). 스프링 상수 k = ωn² (질량 1). */
  omega: number;
  /** 지면 항력률 λ(1/s): 가속도 −λ·v. */
  dragPerSec: number;
}

/** 추적 지연·감쇠비로 정한 `PenSpringParams`의 해석 값. */
export interface PenSpringDescription {
  omega: number;
  /** 고유 진동수(Hz) = ωn / 2π. */
  naturalHz: number;
  /** 서브스텝 보정 감쇠비. 1이 이 이산 계(1/240 s 서브스텝)의 임계 감쇠다. */
  zeta: number;
  /** 정상 추종 지연(ms) = λ / k. */
  lagMs: number;
}

/** 임계 감쇠 항력률: 이 이산 계의 두 극이 겹치는 λ = 2ωn + ωn²·h (h = 서브스텝). 증명은 파일 머리 JSDoc 참고. */
function criticalDrag(omega: number): number {
  return 2 * omega + omega * omega * PEN_SPRING_SUBSTEP_SEC;
}

/**
 * 고정 서브스텝(1/240 s)에서 이 상수가 안정한가: (ωn·h)² < 4 + 2·λ·h.
 * 전이 행렬의 trace = 1 + (1 − k·h²)/(1 + λh), det = 1/(1 + λh) (k = ωn², h = 서브스텝)이고, 2×2 이산 계의 안정 조건 |det| < 1,
 * |trace| < 1 + det 중 유효한 쪽이 trace > −(1 + det) ⇔ 2(1 + λh) + 2 − k·h² > 0 ⇔ k·h² < 4 + 2λh 이기 때문이다.
 */
export function isPenSpringStable(params: PenSpringParams): boolean {
  const a = params.omega * PEN_SPRING_SUBSTEP_SEC;
  return Number.isFinite(a) && Number.isFinite(params.dragPerSec) && a * a < 4 + 2 * params.dragPerSec * PEN_SPRING_SUBSTEP_SEC;
}

function solvePenSpring(lagMs: number, zeta: number): PenSpringParams {
  const room = lagMs / 1000 - zeta * PEN_SPRING_SUBSTEP_SEC;
  const omega = room > 0 ? Math.min((2 * zeta) / room, PEN_SPRING_MAX_OMEGA) : PEN_SPRING_MAX_OMEGA;
  return { omega, dragPerSec: zeta * criticalDrag(omega) };
}

/**
 * (지연, 감쇠비)로 상수를 만들 수 없는 이유(한글 문장). 만들 수 있으면 null. `penSpringParams`와 붓털 레인 설정 검증이 같은 규칙을 쓰도록
 * 한 곳에 둔다: 비유한·0 이하 입력, 그리고 1/240 s 서브스텝에서 발산하는 조합(`isPenSpringStable`)이 거부 대상이다.
 */
export function penSpringParamsProblem(lagMs: number, zeta: number): string | null {
  if (!Number.isFinite(lagMs) || lagMs <= 0) return `물리 펜 추적 지연은 0보다 큰 유한 값이어야 한다(받은 값 ${lagMs})`;
  if (!Number.isFinite(zeta) || zeta <= 0) return `물리 펜 감쇠비는 0보다 큰 유한 값이어야 한다(받은 값 ${zeta})`;
  if (!isPenSpringStable(solvePenSpring(lagMs, zeta))) {
    return `물리 펜 (추적 지연 ${lagMs} ms, 감쇠비 ${zeta})은 1/240 s 서브스텝에서 발산한다(감쇠비 ζ < 0.5이면 ωn·h < 2/(1 − 2ζ)여야 하고 상한 ωn·h = 3은 ζ > 1/6에서만 이를 만족한다). 지연을 늘리거나 감쇠비를 0.5 이상으로 올린다`;
  }
  return null;
}

/**
 * 추적 지연(ms)과 감쇠비로 상수를 구한다. 항력률은 λ = ζ·(2ωn + ωn²·h)이고 정상 추종 지연은 λ/k = ζ·(2/ωn + h)이므로
 * ωn = 2ζ / (lag − ζ·h)로 푼다(그러면 지연이 요청값과 같다). ζ=1이 이 이산 계의 임계 감쇠, ζ>1이 과감쇠, ζ<1이 저감쇠다.
 * 지연이 ζ·h(≈4.2 ms)에 가깝거나 ωn이 `PEN_SPRING_MAX_OMEGA`를 넘으면 ωn을 가두므로 실제 지연이 요청보다 길어질 수 있다
 * (`describePenSpring`으로 확인). 비유한·0 이하 입력과 발산하는 조합(`penSpringParamsProblem`)은 `RangeError`다(조용히 보정하지 않는다).
 */
export function penSpringParams(lagMs: number, zeta: number = PEN_SPRING_DEFAULT_ZETA): PenSpringParams {
  const problem = penSpringParamsProblem(lagMs, zeta);
  if (problem !== null) throw new RangeError(problem);
  return solvePenSpring(lagMs, zeta);
}

/** 상수의 해석 값(고유 진동수·감쇠비·정상 추종 지연). */
export function describePenSpring(params: PenSpringParams): PenSpringDescription {
  const k = params.omega * params.omega;
  return {
    omega: params.omega,
    naturalHz: params.omega / (2 * Math.PI),
    zeta: params.dragPerSec / criticalDrag(params.omega),
    lagMs: (params.dragPerSec / k) * 1000,
  };
}

function assertParams(params: PenSpringParams): void {
  if (!Number.isFinite(params.omega) || params.omega <= 0 || params.omega > PEN_SPRING_MAX_OMEGA * (1 + 1e-9)) {
    throw new RangeError(`물리 펜 ωn은 0 초과 ${PEN_SPRING_MAX_OMEGA} rad/s 이하여야 한다(받은 값 ${params.omega})`);
  }
  if (!Number.isFinite(params.dragPerSec) || params.dragPerSec < 0) {
    throw new RangeError(`물리 펜 항력률은 0 이상의 유한 값이어야 한다(받은 값 ${params.dragPerSec})`);
  }
  if (!isPenSpringStable(params)) {
    throw new RangeError(`물리 펜 상수(ωn ${params.omega} rad/s, 항력률 ${params.dragPerSec}/s)는 1/240 s 서브스텝에서 발산한다((ωn·h)² < 4 + 2λh를 어김)`);
  }
}

/**
 * 2D 스프링-질량 펜 적분기(순수). 상태는 위치 (x, y)와 속도 (vx, vy)이며 질량은 1이다.
 *
 * ```ts
 * const pen = new PenSpring2D(penSpringParams(15, 1), startX, startY);
 * pen.step(PEN_SPRING_SUBSTEP_SEC, pointerX, pointerY); // 서브스텝마다 한 번
 * pen.x; pen.y; pen.vx; pen.vy;
 * ```
 *
 * `step`은 임의의 `dtSec`를 받지만 결과의 결정성·안정성은 고정 서브스텝(`PEN_SPRING_SUBSTEP_SEC`)을 전제로 한다.
 * 표본 시각으로 구동하려면 `PenSpringDriver`를 쓴다.
 */
export class PenSpring2D {
  /** 펜 위치(px). */
  x: number;
  y: number;
  /** 펜 속도(px/s). */
  vx = 0;
  vy = 0;
  private omega = 0;
  private drag = 0;

  constructor(params: PenSpringParams, x = 0, y = 0) {
    assertParams(params);
    this.omega = params.omega;
    this.drag = params.dragPerSec;
    this.x = x;
    this.y = y;
  }

  /** 상수를 바꾼다(상태는 유지). 진행 중인 획에도 적용된다. */
  setParams(params: PenSpringParams): void {
    assertParams(params);
    this.omega = params.omega;
    this.drag = params.dragPerSec;
  }

  get params(): PenSpringParams {
    return { omega: this.omega, dragPerSec: this.drag };
  }

  /** 위치를 (x, y)로 두고 속도를 0으로 돌린다. */
  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
  }

  /**
   * 서브스텝 1회: 목표 (targetX, targetY)로 `dtSec`초 적분한다.
   * 순서는 위치 먼저(직전 속도로), 그다음 속도(새 위치 기준 스프링 힘 + 암시적 항력)다. 이 순서에서는 일정 속도 목표를 따라갈 때
   * 같은 서브스텝 시각의 목표와 펜 사이 거리가 정확히 λ·v/k라 추적 지연이 연속 모델의 λ/k와 같다
   * (속도를 먼저 갱신하는 순서는 지연이 한 서브스텝 짧게 나온다).
   */
  step(dtSec: number, targetX: number, targetY: number): void {
    this.x += this.vx * dtSec;
    this.y += this.vy * dtSec;
    const k = this.omega * this.omega;
    const inv = 1 / (1 + this.drag * dtSec);
    this.vx = (this.vx + k * (targetX - this.x) * dtSec) * inv;
    this.vy = (this.vy + k * (targetY - this.y) * dtSec) * inv;
  }

  /** 속력(px/s). */
  speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** 목표까지 거리(px). */
  distanceTo(targetX: number, targetY: number): number {
    return Math.hypot(targetX - this.x, targetY - this.y);
  }

  /** 목표에 멈췄는가(거리·속력이 모두 임계 미만). */
  isAtRest(
    targetX: number,
    targetY: number,
    distanceEps = PEN_SPRING_REST_DISTANCE_PX,
    speedEps = PEN_SPRING_REST_SPEED_PX_PER_SEC,
  ): boolean {
    return this.distanceTo(targetX, targetY) < distanceEps && this.speed() < speedEps;
  }
}

/**
 * 표본 시각으로 `PenSpring2D`를 구동하는 고정 서브스텝 시계.
 * 시각 격자는 `begin`의 시각을 0으로 하는 1/240 s 간격이다(누적 오차 없이 정수 틱 번호에서 계산한다).
 * 서브스텝마다 목표는 직전 포인터 지점과 이번 지점 사이를 시각으로 선형 보간해 쓴다.
 */
export class PenSpringDriver {
  readonly spring: PenSpring2D;
  private t0 = 0;
  private ticks = 0;
  private knotT = 0;
  private knotX = 0;
  private knotY = 0;

  constructor(params: PenSpringParams) {
    this.spring = new PenSpring2D(params);
  }

  /** 격자 시각(ms): 마지막으로 적분한 서브스텝의 시각. */
  get simTimeMs(): number {
    return this.t0 + this.ticks * PEN_SPRING_SUBSTEP_MS;
  }

  /** 획 시작: 펜을 (x, y)에 놓고 시계를 `tMs`로 맞춘다. */
  begin(x: number, y: number, tMs: number): void {
    this.spring.reset(x, y);
    this.t0 = tMs;
    this.ticks = 0;
    this.knotT = tMs;
    this.knotX = x;
    this.knotY = y;
  }

  /**
   * 포인터가 시각 `tMs`에 (x, y)에 왔다. 직전 지점→이 지점의 보간 목표로 `tMs`까지의 모든 서브스텝을 적분한다.
   * 시각이 거꾸로 가거나 같으면 적분하지 않고 지점만 갱신한다.
   */
  advance(x: number, y: number, tMs: number): void {
    const span = tMs - this.knotT;
    for (;;) {
      const next = this.t0 + (this.ticks + 1) * PEN_SPRING_SUBSTEP_MS;
      if (next > tMs + 1e-9) break;
      this.ticks += 1;
      const f = span > 0 ? Math.min(1, Math.max(0, (next - this.knotT) / span)) : 1;
      this.spring.step(PEN_SPRING_SUBSTEP_SEC, this.knotX + (x - this.knotX) * f, this.knotY + (y - this.knotY) * f);
    }
    this.knotT = tMs;
    this.knotX = x;
    this.knotY = y;
  }

  /** 시각 `tMs`의 펜 위치: 마지막 서브스텝 상태에서 현재 속도로 1차 외삽한다(외삽 길이는 한 서브스텝 미만). */
  positionAt(tMs: number): { x: number; y: number } {
    const dt = Math.max(0, tMs - this.simTimeMs) / 1000;
    return { x: this.spring.x + this.spring.vx * dt, y: this.spring.y + this.spring.vy * dt };
  }

  /** 포인터를 (x, y)에 고정한 채 서브스텝 1회를 더 적분한다(획 끝 정착). */
  settleStep(x: number, y: number): void {
    this.ticks += 1;
    this.spring.step(PEN_SPRING_SUBSTEP_SEC, x, y);
    this.knotX = x;
    this.knotY = y;
  }
}

export interface PenSpringStageOptions {
  /** 정상 추종 지연(ms). `penSpringParams`로 상수를 만든다. */
  lagMs: number;
  /** 감쇠비(기본 `PEN_SPRING_DEFAULT_ZETA`). */
  zeta?: number;
  /** 획 끝 정착 최대 시간(ms, 기본 `PEN_SPRING_MAX_SETTLE_MS`). */
  maxSettleMs?: number;
}

/** 상수를 바꿀 수 있는 물리 펜 단계. */
export interface PenSpringStage extends RawStage {
  setLag(lagMs: number, zeta?: number): void;
}

/**
 * 물리 펜 입력 단계. 표본마다 펜 위치를 출력하고(압력·기울기·시각은 입력 표본 그대로), `up`은 보류했다가 `flush()`에서
 * 포인터를 `up` 위치에 고정한 채 펜이 멈출 때까지 서브스텝마다 표본을 낸 뒤 정확한 `up` 위치의 `up` 표본으로 끝낸다.
 * 모서리는 지연 때문에 깎이므로 `createCornerGateStage`로 감싸 쓴다.
 */
export function createPenSpringStage(opts: PenSpringStageOptions): PenSpringStage {
  let zeta = opts.zeta ?? PEN_SPRING_DEFAULT_ZETA;
  const maxSettleTicks = Math.max(0, Math.round((opts.maxSettleMs ?? PEN_SPRING_MAX_SETTLE_MS) / PEN_SPRING_SUBSTEP_MS));
  const driver = new PenSpringDriver(penSpringParams(opts.lagMs, zeta));
  let started = false;
  let lastOut: RawSample | null = null;
  let heldUp: RawSample | null = null;

  const reset = (): void => {
    started = false;
    lastOut = null;
    heldUp = null;
  };

  const apply = (samples: readonly RawSample[]): RawSample[] => {
    const out: RawSample[] = [];
    for (const s of samples) {
      if (s.source === "predicted") {
        out.push({ ...s });
        continue;
      }
      if (s.phase === "down") reset();
      if (!started) {
        started = true;
        driver.begin(s.x, s.y, s.tMs);
        if (s.phase !== "up") {
          const o = withPosition(s, s.x, s.y, s.tMs, s.phase);
          lastOut = o;
          out.push(o);
          continue;
        }
      }
      driver.advance(s.x, s.y, s.tMs);
      if (s.phase === "up") {
        heldUp = s;
        continue;
      }
      const p = driver.positionAt(s.tMs);
      const o = withPosition(s, p.x, p.y, s.tMs, s.phase);
      lastOut = o;
      out.push(o);
    }
    return out;
  };

  const flush = (): RawSample[] => {
    const up = heldUp;
    if (!up) return [];
    const out: RawSample[] = [];
    let t = lastOut ? Math.max(lastOut.tMs, driver.simTimeMs) : up.tMs;
    for (let i = 0; i < maxSettleTicks; i += 1) {
      if (driver.spring.isAtRest(up.x, up.y)) break;
      driver.settleStep(up.x, up.y);
      t += PEN_SPRING_SUBSTEP_MS;
      out.push(withPosition(up, driver.spring.x, driver.spring.y, t, "move"));
    }
    out.push(withPosition(up, up.x, up.y, Math.max(t, up.tMs) + (out.length > 0 ? PEN_SPRING_SUBSTEP_MS : 0), "up"));
    reset();
    return out;
  };

  return {
    id: "pen-spring",
    label: "물리 펜(스프링)",
    apply,
    flush,
    reset,
    setLag: (lagMs, z) => {
      if (z !== undefined) zeta = z;
      driver.spring.setParams(penSpringParams(lagMs, zeta));
    },
  };
}

/** 슬라이더(0..100, 로그 매핑 `penLagMsFromPct`)로 만드는 물리 펜 단계. */
export function createPenSpringStageFromPct(pct: number, zeta: number = PEN_SPRING_DEFAULT_ZETA): PenSpringStage {
  return createPenSpringStage({ lagMs: penLagMsFromPct(pct), zeta });
}
