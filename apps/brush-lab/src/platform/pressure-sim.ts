import type { RawSample } from "../engine/core/types";

/**
 * 마우스 압력 시뮬레이션(속도 기반). 마우스는 압력이 없다(버튼을 누르는 동안 브라우저가 0.5 고정값을 준다).
 * 그래서 손맛 시험에서 압력 반응(굵기·농도 변화)을 볼 수 있도록 **포인터 속도**에서 압력을 만든다:
 * 천천히 그으면 꾹 누른 듯(높은 압력), 빠르게 그으면 가볍게 스친 듯(낮은 압력). 펜·터치 표본은 그대로 통과한다.
 *
 * - 순수 함수 상태기계: 시계·난수·DOM 전역을 쓰지 않고 표본의 `tMs`만 쓴다(같은 입력 → 같은 출력).
 * - 속도는 지수 이동평균(EMA)으로 매끄럽게 하고, 압력도 EMA로 한 번 더 매끄럽게 해 계단이 생기지 않게 한다.
 * - `down`은 중간 압력에서 시작해 `fadeInSamples` 동안 속도 압력으로 이어진다(획 첫머리 튐 방지).
 * - `up` 표본은 마지막으로 낸 시뮬레이션 압력을 쓴다(플랫폼 캡처가 마지막 접촉 압력을 up에 넣는 규약과 같다).
 */
export interface SpeedPressureOptions {
  /** 이 속도(px/ms) 이하는 최대 압력. 기본 0.15 px/ms(= 150 px/s). */
  slowSpeed?: number;
  /** 이 속도(px/ms) 이상은 최소 압력. 기본 2.5 px/ms(= 2500 px/s). */
  fastSpeed?: number;
  /** 최대 압력. 기본 0.9. */
  maxPressure?: number;
  /** 최소 압력. 기본 0.12. */
  minPressure?: number;
  /** 속도 EMA 계수(0..1, 클수록 즉각 반응). 기본 0.35. */
  speedSmoothing?: number;
  /** 압력 EMA 계수(0..1). 기본 0.4. */
  pressureSmoothing?: number;
  /** down 직후 중간 압력에서 속도 압력으로 넘어가는 표본 수. 기본 4. */
  fadeInSamples?: number;
}

export const DEFAULT_SPEED_PRESSURE: Required<SpeedPressureOptions> = {
  slowSpeed: 0.15,
  fastSpeed: 2.5,
  maxPressure: 0.9,
  minPressure: 0.12,
  speedSmoothing: 0.35,
  pressureSmoothing: 0.4,
  fadeInSamples: 4,
};

/** down 표본의 시작 압력(속도를 아직 모를 때). */
const START_PRESSURE = 0.55;

export interface SpeedPressureSimulator {
  /** 표본 배열을 변환한다(입력 배열은 바꾸지 않고 마우스 표본만 복사해 압력을 덮어쓴다). */
  apply(samples: readonly RawSample[]): RawSample[];
  /** 획 상태를 초기화한다. */
  reset(): void;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 속도(px/ms) → 압력. 느릴수록 높고 smoothstep으로 부드럽게 줄어든다. */
export function speedToPressure(speedPxPerMs: number, opts: SpeedPressureOptions = {}): number {
  const o = { ...DEFAULT_SPEED_PRESSURE, ...opts };
  const span = o.fastSpeed - o.slowSpeed;
  const t = span > 0 ? clamp01((speedPxPerMs - o.slowSpeed) / span) : 1;
  const smooth = t * t * (3 - 2 * t);
  return o.maxPressure + (o.minPressure - o.maxPressure) * smooth;
}

export function createSpeedPressureSimulator(opts: SpeedPressureOptions = {}): SpeedPressureSimulator {
  const o = { ...DEFAULT_SPEED_PRESSURE, ...opts };
  let prev: { x: number; y: number; tMs: number } | null = null;
  let speed = 0;
  let pressure = START_PRESSURE;
  let count = 0;

  const reset = (): void => {
    prev = null;
    speed = 0;
    pressure = START_PRESSURE;
    count = 0;
  };

  const apply = (samples: readonly RawSample[]): RawSample[] => {
    const out: RawSample[] = [];
    for (const s of samples) {
      // 펜·터치와 예측 표본은 건드리지 않는다(예측은 정본 상태를 오염시키면 안 된다).
      if (s.pointerType !== "mouse" || s.source === "predicted") {
        out.push(s);
        continue;
      }
      if (s.phase === "down") reset();
      if (s.phase === "up") {
        out.push({ ...s, pressure });
        reset();
        continue;
      }
      if (prev) {
        const dt = s.tMs - prev.tMs;
        if (dt > 0) {
          const inst = Math.hypot(s.x - prev.x, s.y - prev.y) / dt;
          speed = count <= 1 ? inst : speed + (inst - speed) * o.speedSmoothing;
        }
      }
      prev = { x: s.x, y: s.y, tMs: s.tMs };
      count += 1;
      const target = s.phase === "down" ? START_PRESSURE : speedToPressure(speed, o);
      const blend = o.fadeInSamples > 0 ? clamp01(count / o.fadeInSamples) : 1;
      const goal = START_PRESSURE + (target - START_PRESSURE) * blend;
      pressure = s.phase === "down" ? START_PRESSURE : pressure + (goal - pressure) * o.pressureSmoothing;
      out.push({ ...s, pressure });
    }
    return out;
  };

  return { apply, reset };
}
