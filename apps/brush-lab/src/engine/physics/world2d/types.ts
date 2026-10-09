/**
 * 2D 물리 월드 어댑터 계약(BR-1). 자체 PBD 월드와 외부 엔진 어댑터(Rapier 2D 등)가 같은 인터페이스 뒤에 선다.
 * 붓털 다발(`bristle-brush.ts`)은 이 계약만 알고 어떤 엔진인지 모른다.
 *
 * 이 파일은 `engine/**` 승격 단위라 외부 패키지를 import하지 않는다. 외부 엔진을 감싸는 구현은 `lanes/physics/**`에 둔다
 * (`boundary.test.ts`가 강제한다).
 *
 * 단위 규약: 길이 px, 시간 s, 질량 임의 단위, 스프링 강성 k는 질량·px/s² per px(F = k·Δlen), 감쇠 c는 질량/s(F = c·Δv).
 * 중력 없음, 모든 몸체는 회전하지 않는 원이다. `step(dt)`는 고정 틱(1/240 s)을 전제로 하며 가변 dt의 책임은 호출자에게 있다
 * (붓털 다발은 항상 고정 틱으로 구동한다).
 *
 * 설계 근거: 스프링 감쇠를 두 몸체의 상대 속도에만 걸면 일정 속도 추종에서 감쇠력이 0이라 끌림이 없다.
 * 끌리는 느낌은 지면 기준 선형 항력(`linearDamping`, 종이 항력)이 만든다(SP-A 실측). 그래서 몸체마다 `linearDamping`을 둔다.
 */

/** 원형 몸체 생성 명세. */
export interface CircleBodySpec {
  x: number;
  y: number;
  /** 접촉 반경(px). kinematic 슬롯은 접촉하지 않으므로 값이 작아도 된다. */
  radius: number;
  mass: number;
  /** 선형 감쇠율(1/s). v̇ = −λ·v. 종이 항력. */
  linearDamping?: number;
  /** true면 질량이 무한한 위치 구동 몸체다. 목표는 `setKinematicTarget`으로 준다. */
  kinematic?: boolean;
  /** 0 = 어떤 몸체와도 충돌하지 않는다. n > 0 = 같은 n끼리만 충돌한다(털 간 비침투). */
  collideGroup?: number;
}

/** 스프링-댐퍼 명세(힘 기반: F = k·(len − rest) + c·(상대 속도의 축 성분)). */
export interface SpringSpec {
  restLength: number;
  stiffness: number;
  damping: number;
}

/**
 * 월드 한 개의 구현이 밝히는 특성. 비교 벤치와 레인 영수증이 읽는다.
 */
export interface WorldTraits {
  /** 구현 식별자("pbd", "rapier2d" 등). */
  readonly backendId: string;
  readonly labelKo: string;
  /** 호출자가 `dispose`에서 해제해야 하는 네이티브/wasm 자원이 있는가. */
  readonly needsDispose: boolean;
}

/**
 * 몸체 상태를 한 번에 읽을 때의 배치: `out[4i .. 4i+3] = x, y, vx, vy`(px, px/s). 길이 `bodyCount × 4` 이상이어야 한다.
 */
export const BODY_STATE_STRIDE = 4;

export interface PhysicsWorld2D {
  readonly traits: WorldTraits;
  readonly bodyCount: number;
  /** 몸체를 만들고 번호(0부터)를 돌려준다. */
  addCircle(spec: CircleBodySpec): number;
  /** kinematic 몸체가 다음 `step` 끝에 도달할 위치. */
  setKinematicTarget(body: number, x: number, y: number): void;
  /** 두 몸체를 잇는 스프링을 만들고 번호를 돌려준다. */
  addSpring(a: number, b: number, spec: SpringSpec): number;
  /** 스프링 상수를 바꾼다(휴지 길이·강성·감쇠). 구현에 따라 비용이 다를 수 있어 호출자는 값이 바뀔 때만 부른다. */
  setSpring(spring: number, spec: SpringSpec): void;
  /** 다음 `step` 한 번에만 적용되는 외력(질량·px/s²). 누적된다. */
  applyForce(body: number, fx: number, fy: number): void;
  /**
   * 충돌 질의: 중심 (x, y) 반경 `radius`의 원과 겹치는 **동적** 몸체의 번호를 `out`에 채우고(앞의 내용은 지운다) 개수를 돌려준다.
   * 마지막 `step` 직후의 위치를 기준으로 한다.
   */
  queryCircle(x: number, y: number, radius: number, out: number[]): number;
  /** 고정 틱 dt(초)만큼 진행한다. */
  step(dtSec: number): void;
  /** 모든 몸체의 `x, y, vx, vy`를 읽는다. */
  readState(out: Float32Array): void;
  /** 구현별 진단 카운터(0이어야 건강한 값 포함). 이름은 구현이 정한다. */
  diagnostics(): Readonly<Record<string, number>>;
  dispose(): void;
}

/**
 * 몸체 상태 배열(`readState`와 같은 배치)에서 `queryCircle`을 계산하는 공통 구현. 반경은 `radii`로 준다.
 * kinematic 몸체는 `dynamic[i] === 0`으로 건너뛴다. 어느 월드 구현이든 같은 규칙으로 질의하게 하려는 것이다.
 */
export function queryCircleFromState(
  state: Float32Array,
  radii: ArrayLike<number>,
  dynamic: ArrayLike<number>,
  bodyCount: number,
  x: number,
  y: number,
  radius: number,
  out: number[],
): number {
  out.length = 0;
  for (let i = 0; i < bodyCount; i += 1) {
    if (dynamic[i] === 0) continue;
    const dx = (state[i * BODY_STATE_STRIDE] ?? 0) - x;
    const dy = (state[i * BODY_STATE_STRIDE + 1] ?? 0) - y;
    const rr = (radii[i] ?? 0) + radius;
    if (dx * dx + dy * dy < rr * rr) out.push(i);
  }
  return out.length;
}
