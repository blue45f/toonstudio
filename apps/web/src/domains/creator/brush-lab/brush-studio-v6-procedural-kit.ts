import type { BrushStudioV6Tuning } from "./brush-studio-v6-engine";
import type { BrushTopologyContact, BrushTopologyPrimitive } from "./brush-studio-v6-topology-engine";

/**
 * 절차 브러시 계열이 공유하는 결정적 도구.
 *
 * - 시계는 거리다: 모든 커널은 재표본된 덥 순서(c.index)와 위치만 본다. 벽시계·이벤트 간격·Math.random 을 쓰지 않는다.
 * - 난수는 정수 해시다: 같은 (덥 번호, 슬롯, 시드)는 입력 묶음 방식과 관계없이 같은 값을 낸다.
 * - 상태는 고정 크기다: 지난 점은 정해진 칸 수의 링 버퍼에만 남고, 덥 하나가 내보내는 프리미티브 수에 상한이 있다.
 */
export const TAU = Math.PI * 2;
export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
export const unit = (value: number): number => clamp(value, 0, 1);

/** 32비트 정수 해시 → [0, 1). 위상 엔진과 같은 상수라 같은 시드가 같은 결을 만든다. */
export function hash01(a: number, b: number, seed: number): number {
  let n = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** 각 커널이 받는 고정 입력. step 은 이미 하한이 적용된 덥 간격(px)이다. */
export interface ProceduralEnv {
  readonly t: BrushStudioV6Tuning;
  readonly size: number;
  readonly seed: number;
  readonly step: number;
}

export interface ProceduralSink {
  /** 이 덥에서 더 내보낼 수 없으면 true. 반복문은 이 값을 보고 일찍 끝낸다. */
  full(): boolean;
  /** 선분 하나를 캡슐로 낸다. 길이가 maxLength 를 넘으면(순간이동 구간) 끝점의 점으로 접는다. */
  line(ax: number, ay: number, bx: number, by: number, halfWidth: number, opacity: number, mix: number): void;
  /** 길이 검사 없이 선분을 낸다. 연결 반경처럼 구성상 길이가 이미 묶인 선에만 쓴다. */
  bounded(ax: number, ay: number, bx: number, by: number, halfWidth: number, opacity: number, mix: number): void;
  shape(x: number, y: number, radiusX: number, radiusY: number, angle: number, opacity: number, mix: number,
    shape: BrushTopologyPrimitive["shape"]): void;
}

/**
 * 덥 하나의 출력 창구. cap 을 넘는 프리미티브는 버리고(누적 상한), 모든 값을 유한한 범위로 고정한다.
 * fallbackAngle 은 길이 0 선분(점)의 회전값이다.
 */
export function createProceduralSink(
  emit: (primitive: BrushTopologyPrimitive) => void, cap: number, maxLength: number, fallbackAngle: number,
): ProceduralSink {
  let count = 0;
  const fallback = Number.isFinite(fallbackAngle) ? fallbackAngle : 0;
  const angleOrFallback = (value: number): number => Number.isFinite(value) ? value : fallback;
  const segment = (ax: number, ay: number, bx: number, by: number, halfWidth: number, opacity: number, mix: number, limit: number): void => {
    if (count >= cap || !Number.isFinite(bx) || !Number.isFinite(by)) return;
    let length = Math.hypot(bx - ax, by - ay);
    // 시작점이 유한하지 않거나 상한을 넘으면 길이 NaN·과대 → 끝점의 점으로 접는다(끝점은 위에서 유한성 확인).
    if (!Number.isFinite(length) || length > limit) { ax = bx; ay = by; length = 0; }
    const half = clamp(halfWidth, 0.12, 64);
    count++;
    emit({ x: (ax + bx) / 2, y: (ay + by) / 2, radiusX: length / 2 + half, radiusY: half,
      angle: length > 1e-9 ? Math.atan2(by - ay, bx - ax) : fallback,
      opacity: unit(opacity), mix: unit(mix), shape: "capsule" });
  };
  return {
    full: () => count >= cap,
    line: (ax, ay, bx, by, halfWidth, opacity, mix) => segment(ax, ay, bx, by, halfWidth, opacity, mix, maxLength),
    bounded: (ax, ay, bx, by, halfWidth, opacity, mix) => segment(ax, ay, bx, by, halfWidth, opacity, mix, Infinity),
    shape(x, y, radiusX, radiusY, angle, opacity, mix, kind) {
      if (count >= cap || !Number.isFinite(x) || !Number.isFinite(y)) return;
      count++;
      emit({ x, y, radiusX: clamp(radiusX, 0.12, 4096), radiusY: clamp(radiusY, 0.12, 4096),
        angle: angleOrFallback(angle), opacity: unit(opacity), mix: unit(mix), shape: kind });
    },
  };
}

/** 고정 칸 수 링 버퍼. age 0 이 가장 최근 점이다. 칸 수를 넘으면 가장 오래된 점부터 덮어쓴다. */
export class ProceduralPointHistory {
  readonly x: Float64Array;
  readonly y: Float64Array;
  private head = 0;
  private filled = 0;

  constructor(readonly capacity: number) {
    this.x = new Float64Array(capacity);
    this.y = new Float64Array(capacity);
  }

  get length(): number { return this.filled; }
  get bytes(): number { return this.x.byteLength + this.y.byteLength; }

  push(x: number, y: number): void {
    this.x[this.head] = x;
    this.y[this.head] = y;
    this.head = (this.head + 1) % this.capacity;
    this.filled = Math.min(this.capacity, this.filled + 1);
  }

  /** age 번째(0 = 최근) 점의 칸 번호. 호출자는 age < length 를 보장한다. */
  slot(age: number): number {
    return (this.head - 1 - age + this.capacity * 2) % this.capacity;
  }

  reset(): void {
    this.head = 0;
    this.filled = 0;
    this.x.fill(0);
    this.y.fill(0);
  }
}

/**
 * 속도 대용 지표. 이벤트 시간은 결정성 계약상 쓰지 않으므로 덥 사이 이동 벡터의 지수 평균 크기를
 * 덥 간격으로 나눈 값(0..1, 곧게 오래 그을수록 1)을 쓴다. 같은 경로는 입력 빈도와 무관하게 같은 값을 낸다.
 */
export class ProceduralMomentum {
  private vx = 0;
  private vy = 0;
  private px = 0;
  private py = 0;
  private started = false;

  update(x: number, y: number, step: number, response: number): number {
    if (!this.started) { this.started = true; this.px = x; this.py = y; this.vx = 0; this.vy = 0; return 0; }
    this.vx += (x - this.px - this.vx) * response;
    this.vy += (y - this.py - this.vy) * response;
    this.px = x;
    this.py = y;
    return unit(Math.hypot(this.vx, this.vy) / Math.max(1e-6, step));
  }

  reset(): void { this.started = false; this.vx = 0; this.vy = 0; this.px = 0; this.py = 0; }
}

/** 원형 보간으로 획 방향을 부드럽게 따라가는 프레임 각도(-π/π 경계에서 한 바퀴 돌지 않는다). */
export function followAngle(current: number, target: number, response: number): number {
  return current + Math.atan2(Math.sin(target - current), Math.cos(target - current)) * response;
}

/** 덥 하나를 처리하는 커널. 검증·리셋·상한 강제는 계열 엔진이 맡는다. */
export interface ProceduralKernel {
  readonly maxPrimitivesPerDab: number;
  readonly retainedStateBytes: number;
  reset(): void;
  deposit(contact: BrushTopologyContact, sink: ProceduralSink): void;
}
