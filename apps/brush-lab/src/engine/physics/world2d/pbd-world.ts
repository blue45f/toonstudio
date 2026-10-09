import { BODY_STATE_STRIDE, queryCircleFromState } from "./types";

import type { CircleBodySpec, PhysicsWorld2D, SpringSpec, WorldTraits } from "./types";

/**
 * 자체 PBD 2D 월드(외부 의존 0): 반암시적(심플렉틱) 오일러 스프링-댐퍼 + 위치 기반 동역학(PBD) 접촉.
 *
 * 한 서브스텝: ① kinematic 목표로 속도 결정 → ② 스프링 힘 → 속도 → ③ 외력·선형 항력(암시적 감쇠 1/(1+λh)) → 예측 위치
 * → ④ PBD 접촉 투영(같은 `collideGroup`의 원끼리, 반복 횟수 설정) → ⑤ 속도 = 위치 변화 / h.
 *
 * SP-A 기준선(`native`)에서 달라진 점:
 * - 상태를 Float32Array에 두고 중간 결과마다 `Math.fround`로 f32 경계를 맞춘다(f32 미러 정책).
 * - 접촉 후보를 O(N²) 전수 대신 **x 정렬 스윕**으로 서브스텝마다 한 번 모은 뒤(여유 거리 포함) 후보 쌍만 반복한다.
 *   반복마다 쌍 순서를 뒤집어(앞→뒤, 뒤→앞) 앞쪽 몸체가 덜 밀리는 순서 편향을 줄인다.
 * - 큰 dt는 `maxSubstepSec`로 균등 분할한다(분할 상한 `maxSubsteps`를 넘으면 분할을 멈추고 `oversizeSteps`를 센다 — 안정성 보장 없음).
 *   kinematic 목표는 분할 구간에 걸쳐 선형 보간한다.
 *
 * 안정 범위: 스프링은 명시적(힘 → 속도)이라 한 서브스텝에서 ω·h < 1(h = 1/240 s이면 ω < 240 rad/s, 즉 고유 진동수 약 38 Hz 미만)이고
 * 상대 감쇠 c·h/m < 1이어야 한다. 이 범위를 넘으면 진동이 커진다(붓털 설정은 `fnHz < 40`으로 막는다). 선형 항력은 암시적이라 항상 안정하다.
 *
 * 삼각함수·`Math.hypot`·지수 함수를 쓰지 않는다(덧셈·곱셈·나눗셈·제곱근은 IEEE 754 정확 반올림이라 엔진 간 결정적이다).
 * 몸체 번호 순서가 곧 처리 순서이며 난수는 쓰지 않는다 → 같은 입력은 같은 상태를 낸다.
 */

const f = Math.fround;

/** 기본 PBD 접촉 반복 횟수. 붓털 N=128 밀집 퍼짐 균일성 실험(bench/physics)으로 정했다. */
export const PBD_DEFAULT_CONTACT_ITERATIONS = 6;
/**
 * 기본 접촉 보정 비율. 1(겹침을 한 번에 밀어냄)은 SP-A 기준선이며 N=128 밀집 퍼짐의 반경비 표준편차가 0.263이었다 — 겹친 채 시작한 털이
 * 한 틱에 튀어나와 무질서하게 굳기 때문이다. 0.12로 부드럽게 풀면 같은 시나리오에서 Rapier(소프트 접촉)와 같은 겹침 분포·균일한 퍼짐이 나온다
 * (`bench/physics/spread-metrics`가 스윕으로 고정한다).
 */
export const PBD_DEFAULT_CONTACT_RELAXATION = 0.12;
/** 기본 서브스텝 상한(초): 240 Hz 한 틱을 쪼개지 않도록 약간의 여유를 둔다. */
export const PBD_DEFAULT_MAX_SUBSTEP_SEC = 1 / 240 + 1e-6;
/** 큰 dt를 쪼갤 수 있는 서브스텝 수 상한. */
export const PBD_DEFAULT_MAX_SUBSTEPS = 64;
/** 접촉 후보 쌍을 모을 때 더하는 여유 거리 비율(최대 반경 대비). */
const PAIR_MARGIN_RATIO = 0.6;

export interface PbdWorldOptions {
  /** PBD 접촉 반복 횟수(기본 6). */
  contactIterations?: number;
  /** 접촉 보정 비율 (0, 1](기본 0.12 — 1이면 겹침을 한 번에 밀어낸다). */
  contactRelaxation?: number;
  /** 서브스텝 상한(초). 이보다 긴 dt는 균등 분할한다. */
  maxSubstepSec?: number;
  maxSubsteps?: number;
}

/** 월드가 센 진단 값(0이어야 건강하다). */
export interface PbdWorldCounters {
  /** `step` 호출 수. */
  steps: number;
  /** 실제로 돈 서브스텝 수. */
  substeps: number;
  /** `maxSubsteps`를 넘는 dt라 분할을 상한에서 멈춘 호출 수. */
  oversizeSteps: number;
  /** 비유한 값이 나와 0으로 되돌린 횟수. */
  nonFiniteResets: number;
}

export class PbdWorld2D implements PhysicsWorld2D {
  readonly traits: WorldTraits = { backendId: "pbd", labelKo: "자체 PBD(오일러 스프링 + 위치 기반 접촉)", needsDispose: false };
  readonly counters: PbdWorldCounters = { steps: 0, substeps: 0, oversizeSteps: 0, nonFiniteResets: 0 };

  private readonly iterations: number;
  private readonly relax: number;
  private readonly maxSub: number;
  private readonly maxSubs: number;

  private count = 0;
  private cap = 0;
  private x = new Float32Array(0);
  private y = new Float32Array(0);
  private vx = new Float32Array(0);
  private vy = new Float32Array(0);
  private ox = new Float32Array(0);
  private oy = new Float32Array(0);
  /** kinematic: 이번 `step` 시작 위치. */
  private kx0 = new Float32Array(0);
  private ky0 = new Float32Array(0);
  /** kinematic: 이번 `step` 끝 목표. */
  private tx = new Float32Array(0);
  private ty = new Float32Array(0);
  private fx = new Float32Array(0);
  private fy = new Float32Array(0);
  private radius = new Float32Array(0);
  private invMass = new Float32Array(0);
  private damp = new Float32Array(0);
  private kin = new Uint8Array(0);
  private dyn = new Uint8Array(0);
  private group = new Int32Array(0);

  private springCount = 0;
  private springCap = 0;
  private sa = new Int32Array(0);
  private sb = new Int32Array(0);
  private sRest = new Float32Array(0);
  private sK = new Float32Array(0);
  private sC = new Float32Array(0);

  /** x 정렬 순서(삽입 정렬로 유지 — 거의 정렬돼 있어 O(N)). */
  private order = new Int32Array(0);
  private pairA = new Int32Array(0);
  private pairB = new Int32Array(0);
  private pairCount = 0;
  private maxRadius = 0;

  constructor(options: PbdWorldOptions = {}) {
    const iterations = options.contactIterations ?? PBD_DEFAULT_CONTACT_ITERATIONS;
    const relax = options.contactRelaxation ?? PBD_DEFAULT_CONTACT_RELAXATION;
    const maxSub = options.maxSubstepSec ?? PBD_DEFAULT_MAX_SUBSTEP_SEC;
    const maxSubs = options.maxSubsteps ?? PBD_DEFAULT_MAX_SUBSTEPS;
    if (!Number.isInteger(iterations) || iterations < 0 || iterations > 64) throw new RangeError(`PBD 접촉 반복 횟수는 0..64 정수여야 한다(받은 값 ${iterations})`);
    if (!Number.isFinite(relax) || relax <= 0 || relax > 1) throw new RangeError(`PBD 접촉 보정 비율은 (0, 1]이어야 한다(받은 값 ${relax})`);
    if (!Number.isFinite(maxSub) || maxSub <= 0) throw new RangeError(`PBD 서브스텝 상한은 0보다 큰 유한 값이어야 한다(받은 값 ${maxSub})`);
    if (!Number.isInteger(maxSubs) || maxSubs < 1) throw new RangeError(`PBD 서브스텝 수 상한은 1 이상의 정수여야 한다(받은 값 ${maxSubs})`);
    this.iterations = iterations;
    this.relax = f(relax);
    this.maxSub = maxSub;
    this.maxSubs = maxSubs;
  }

  get bodyCount(): number {
    return this.count;
  }

  addCircle(spec: CircleBodySpec): number {
    if (!Number.isFinite(spec.x) || !Number.isFinite(spec.y)) throw new RangeError(`몸체 위치가 유한하지 않다(${spec.x}, ${spec.y})`);
    if (!Number.isFinite(spec.radius) || spec.radius < 0) throw new RangeError(`몸체 반경은 0 이상의 유한 값이어야 한다(받은 값 ${spec.radius})`);
    const kinematic = spec.kinematic === true;
    if (!kinematic && !(Number.isFinite(spec.mass) && spec.mass > 0)) throw new RangeError(`동적 몸체의 질량은 0보다 커야 한다(받은 값 ${spec.mass})`);
    const damping = spec.linearDamping ?? 0;
    if (!Number.isFinite(damping) || damping < 0) throw new RangeError(`선형 감쇠율은 0 이상의 유한 값이어야 한다(받은 값 ${damping})`);
    this.reserveBodies(this.count + 1);
    const id = this.count;
    this.count += 1;
    this.x[id] = spec.x;
    this.y[id] = spec.y;
    this.vx[id] = 0;
    this.vy[id] = 0;
    this.ox[id] = spec.x;
    this.oy[id] = spec.y;
    this.kx0[id] = spec.x;
    this.ky0[id] = spec.y;
    this.tx[id] = spec.x;
    this.ty[id] = spec.y;
    this.fx[id] = 0;
    this.fy[id] = 0;
    this.radius[id] = spec.radius;
    this.invMass[id] = kinematic ? 0 : f(1 / spec.mass);
    this.damp[id] = damping;
    this.kin[id] = kinematic ? 1 : 0;
    this.dyn[id] = kinematic ? 0 : 1;
    this.group[id] = spec.collideGroup ?? 0;
    this.order[id] = id;
    if (spec.radius > this.maxRadius) this.maxRadius = spec.radius;
    return id;
  }

  setKinematicTarget(body: number, x: number, y: number): void {
    this.assertBody(body);
    if (this.kin[body] !== 1) throw new RangeError(`몸체 ${body}는 kinematic이 아니다`);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError(`kinematic 목표가 유한하지 않다(${x}, ${y})`);
    this.tx[body] = x;
    this.ty[body] = y;
  }

  addSpring(a: number, b: number, spec: SpringSpec): number {
    this.assertBody(a);
    this.assertBody(b);
    assertSpring(spec);
    if (this.springCount >= this.springCap) this.growSprings(Math.max(8, this.springCap * 2));
    const id = this.springCount;
    this.springCount += 1;
    this.sa[id] = a;
    this.sb[id] = b;
    this.sRest[id] = spec.restLength;
    this.sK[id] = spec.stiffness;
    this.sC[id] = spec.damping;
    return id;
  }

  setSpring(spring: number, spec: SpringSpec): void {
    if (!Number.isInteger(spring) || spring < 0 || spring >= this.springCount) throw new RangeError(`스프링 번호 ${spring}가 범위 밖이다(0..${this.springCount - 1})`);
    assertSpring(spec);
    this.sRest[spring] = spec.restLength;
    this.sK[spring] = spec.stiffness;
    this.sC[spring] = spec.damping;
  }

  applyForce(body: number, fx: number, fy: number): void {
    this.assertBody(body);
    this.fx[body] = f((this.fx[body] ?? 0) + fx);
    this.fy[body] = f((this.fy[body] ?? 0) + fy);
  }

  queryCircle(x: number, y: number, radius: number, out: number[]): number {
    const state = new Float32Array(this.count * BODY_STATE_STRIDE);
    this.readState(state);
    return queryCircleFromState(state, this.radius, this.dyn, this.count, x, y, radius, out);
  }

  step(dtSec: number): void {
    if (!Number.isFinite(dtSec) || dtSec <= 0) throw new RangeError(`step dt는 0보다 큰 유한 값이어야 한다(받은 값 ${dtSec})`);
    this.counters.steps += 1;
    let substeps = Math.ceil(dtSec / this.maxSub - 1e-9);
    if (substeps < 1) substeps = 1;
    if (substeps > this.maxSubs) {
      substeps = this.maxSubs;
      this.counters.oversizeSteps += 1;
    }
    const h = f(dtSec / substeps);
    const n = this.count;
    for (let i = 0; i < n; i += 1) {
      this.kx0[i] = this.x[i] ?? 0;
      this.ky0[i] = this.y[i] ?? 0;
    }
    for (let j = 0; j < substeps; j += 1) {
      this.substep(h, (j + 1) / substeps);
      this.counters.substeps += 1;
    }
    for (let i = 0; i < n; i += 1) {
      this.fx[i] = 0;
      this.fy[i] = 0;
    }
  }

  readState(out: Float32Array): void {
    if (out.length < this.count * BODY_STATE_STRIDE) {
      throw new RangeError(`readState 버퍼가 작다(필요 ${this.count * BODY_STATE_STRIDE}, 받은 ${out.length})`);
    }
    for (let i = 0; i < this.count; i += 1) {
      const o = i * BODY_STATE_STRIDE;
      out[o] = this.x[i] ?? 0;
      out[o + 1] = this.y[i] ?? 0;
      out[o + 2] = this.vx[i] ?? 0;
      out[o + 3] = this.vy[i] ?? 0;
    }
  }

  diagnostics(): Readonly<Record<string, number>> {
    return { steps: this.counters.steps, substeps: this.counters.substeps, oversizeSteps: this.counters.oversizeSteps, nonFiniteResets: this.counters.nonFiniteResets };
  }

  dispose(): void {
    this.count = 0;
    this.springCount = 0;
    this.pairCount = 0;
  }

  /** 마지막 서브스텝의 접촉 후보 쌍 수(진단·테스트용). */
  lastPairCount(): number {
    return this.pairCount;
  }

  private substep(h: number, alpha: number): void {
    const n = this.count;
    const x = this.x;
    const y = this.y;
    const vx = this.vx;
    const vy = this.vy;
    const invH = f(1 / h);
    // ① kinematic: 이번 서브스텝 끝 목표(보간)로 속도를 정한다.
    for (let i = 0; i < n; i += 1) {
      if (this.kin[i] !== 1) continue;
      const gx = f((this.kx0[i] ?? 0) + f(((this.tx[i] ?? 0) - (this.kx0[i] ?? 0)) * alpha));
      const gy = f((this.ky0[i] ?? 0) + f(((this.ty[i] ?? 0) - (this.ky0[i] ?? 0)) * alpha));
      vx[i] = f(f(gx - (x[i] ?? 0)) * invH);
      vy[i] = f(f(gy - (y[i] ?? 0)) * invH);
    }
    // ② 스프링 힘 → 속도(반암시적: 속도를 먼저 갱신하고 그 속도로 위치를 옮긴다).
    for (let s = 0; s < this.springCount; s += 1) {
      const a = this.sa[s] ?? 0;
      const b = this.sb[s] ?? 0;
      const dx = f((x[b] ?? 0) - (x[a] ?? 0));
      const dy = f((y[b] ?? 0) - (y[a] ?? 0));
      const len = f(Math.sqrt(f(dx * dx + dy * dy)));
      if (len < 1e-6) continue;
      const nx = f(dx / len);
      const ny = f(dy / len);
      const rel = f(f(((vx[b] ?? 0) - (vx[a] ?? 0)) * nx) + f(((vy[b] ?? 0) - (vy[a] ?? 0)) * ny));
      const force = f(f((this.sK[s] ?? 0) * f(len - (this.sRest[s] ?? 0))) + f((this.sC[s] ?? 0) * rel));
      const fx = f(force * nx);
      const fy = f(force * ny);
      const ia = f((this.invMass[a] ?? 0) * h);
      const ib = f((this.invMass[b] ?? 0) * h);
      vx[a] = f((vx[a] ?? 0) + f(fx * ia));
      vy[a] = f((vy[a] ?? 0) + f(fy * ia));
      vx[b] = f((vx[b] ?? 0) - f(fx * ib));
      vy[b] = f((vy[b] ?? 0) - f(fy * ib));
    }
    // ③ 외력, 선형 항력, 예측 위치.
    for (let i = 0; i < n; i += 1) {
      this.ox[i] = x[i] ?? 0;
      this.oy[i] = y[i] ?? 0;
      if (this.kin[i] === 1) {
        x[i] = f((this.kx0[i] ?? 0) + f(((this.tx[i] ?? 0) - (this.kx0[i] ?? 0)) * alpha));
        y[i] = f((this.ky0[i] ?? 0) + f(((this.ty[i] ?? 0) - (this.ky0[i] ?? 0)) * alpha));
        continue;
      }
      const im = f((this.invMass[i] ?? 0) * h);
      let wx = f((vx[i] ?? 0) + f((this.fx[i] ?? 0) * im));
      let wy = f((vy[i] ?? 0) + f((this.fy[i] ?? 0) * im));
      const d = f(1 / f(1 + f(h * (this.damp[i] ?? 0))));
      wx = f(wx * d);
      wy = f(wy * d);
      vx[i] = wx;
      vy[i] = wy;
      x[i] = f((x[i] ?? 0) + f(wx * h));
      y[i] = f((y[i] ?? 0) + f(wy * h));
    }
    // ④ 접촉 후보를 모으고 PBD로 투영한다.
    if (this.iterations > 0) {
      this.collectPairs();
      for (let it = 0; it < this.iterations; it += 1) this.solveContacts((it & 1) === 1);
    }
    // ⑤ 속도 = 위치 변화 / h.
    for (let i = 0; i < n; i += 1) {
      let ux = f(f((x[i] ?? 0) - (this.ox[i] ?? 0)) * invH);
      let uy = f(f((y[i] ?? 0) - (this.oy[i] ?? 0)) * invH);
      if (!Number.isFinite(ux) || !Number.isFinite(uy) || !Number.isFinite(x[i] ?? 0) || !Number.isFinite(y[i] ?? 0)) {
        // 비유한 값은 직전 위치로 되돌리고 센다(전파를 막는다 — 호출자는 카운터로 알 수 있다).
        x[i] = this.ox[i] ?? 0;
        y[i] = this.oy[i] ?? 0;
        ux = 0;
        uy = 0;
        this.counters.nonFiniteResets += 1;
      }
      vx[i] = ux;
      vy[i] = uy;
    }
  }

  /** x 정렬 스윕으로 같은 그룹의 접촉 후보 쌍(여유 거리 포함)을 모은다. */
  private collectPairs(): void {
    const n = this.count;
    const order = this.order;
    const x = this.x;
    // 삽입 정렬(거의 정렬된 입력 → O(N)). 동률은 번호순을 유지한다.
    for (let i = 1; i < n; i += 1) {
      const idx = order[i] ?? 0;
      const key = x[idx] ?? 0;
      let j = i - 1;
      while (j >= 0 && (x[order[j] ?? 0] ?? 0) > key) {
        order[j + 1] = order[j] ?? 0;
        j -= 1;
      }
      order[j + 1] = idx;
    }
    const reach = f(2 * this.maxRadius + f(PAIR_MARGIN_RATIO * this.maxRadius));
    const need = n * 8;
    if (this.pairA.length < need) {
      this.pairA = new Int32Array(need);
      this.pairB = new Int32Array(need);
    }
    let count = 0;
    for (let oi = 0; oi < n; oi += 1) {
      const i = order[oi] ?? 0;
      const gi = this.group[i] ?? 0;
      if (gi === 0 || this.dyn[i] !== 1) continue;
      const xi = x[i] ?? 0;
      const yi = this.y[i] ?? 0;
      const ri = this.radius[i] ?? 0;
      for (let oj = oi + 1; oj < n; oj += 1) {
        const j = order[oj] ?? 0;
        const xj = x[j] ?? 0;
        if (xj - xi > reach) break;
        if (this.group[j] !== gi || this.dyn[j] !== 1) continue;
        const dy = (this.y[j] ?? 0) - yi;
        const rr = ri + (this.radius[j] ?? 0) + f(PAIR_MARGIN_RATIO * this.maxRadius);
        const dx = xj - xi;
        if (dx * dx + dy * dy >= rr * rr) continue;
        if (count >= this.pairA.length) this.growPairs();
        // (작은 번호, 큰 번호)로 저장해 처리 순서가 정렬 순서와 무관하게 정해지도록 한다.
        this.pairA[count] = i < j ? i : j;
        this.pairB[count] = i < j ? j : i;
        count += 1;
      }
    }
    this.pairCount = count;
    this.sortPairs();
  }

  /** 쌍을 (a, b) 오름차순으로 정렬한다(삽입 정렬 — 쌍 수가 작다). 처리 순서를 위치 정렬과 분리해 결정적이게 한다. */
  private sortPairs(): void {
    const a = this.pairA;
    const b = this.pairB;
    for (let i = 1; i < this.pairCount; i += 1) {
      const ka = a[i] ?? 0;
      const kb = b[i] ?? 0;
      let j = i - 1;
      while (j >= 0 && ((a[j] ?? 0) > ka || ((a[j] ?? 0) === ka && (b[j] ?? 0) > kb))) {
        a[j + 1] = a[j] ?? 0;
        b[j + 1] = b[j] ?? 0;
        j -= 1;
      }
      a[j + 1] = ka;
      b[j + 1] = kb;
    }
  }

  private growPairs(): void {
    const next = this.pairA.length * 2;
    const a = new Int32Array(next);
    const b = new Int32Array(next);
    a.set(this.pairA);
    b.set(this.pairB);
    this.pairA = a;
    this.pairB = b;
  }

  /** 접촉 투영 한 번. `reverse`면 쌍 목록을 뒤에서부터 처리한다. */
  private solveContacts(reverse: boolean): void {
    const x = this.x;
    const y = this.y;
    const count = this.pairCount;
    for (let k = 0; k < count; k += 1) {
      const p = reverse ? count - 1 - k : k;
      const i = this.pairA[p] ?? 0;
      const j = this.pairB[p] ?? 0;
      const dx = f((x[j] ?? 0) - (x[i] ?? 0));
      const dy = f((y[j] ?? 0) - (y[i] ?? 0));
      const rr = f((this.radius[i] ?? 0) + (this.radius[j] ?? 0));
      const d2 = f(f(dx * dx) + f(dy * dy));
      if (d2 >= f(rr * rr) || d2 < 1e-12) continue;
      const wi = this.invMass[i] ?? 0;
      const wj = this.invMass[j] ?? 0;
      const w = f(wi + wj);
      if (w === 0) continue;
      const d = f(Math.sqrt(d2));
      const c = f(f(f(f(rr - d) / d) / w) * this.relax);
      const cx = f(dx * c);
      const cy = f(dy * c);
      x[i] = f((x[i] ?? 0) - f(cx * wi));
      y[i] = f((y[i] ?? 0) - f(cy * wi));
      x[j] = f((x[j] ?? 0) + f(cx * wj));
      y[j] = f((y[j] ?? 0) + f(cy * wj));
    }
  }

  private assertBody(body: number): void {
    if (!Number.isInteger(body) || body < 0 || body >= this.count) throw new RangeError(`몸체 번호 ${body}가 범위 밖이다(0..${this.count - 1})`);
  }

  private reserveBodies(needed: number): void {
    if (needed <= this.cap) return;
    const next = Math.max(16, this.cap * 2, needed);
    const grow = (src: Float32Array) => {
      const out = new Float32Array(next);
      out.set(src);
      return out;
    };
    this.x = grow(this.x);
    this.y = grow(this.y);
    this.vx = grow(this.vx);
    this.vy = grow(this.vy);
    this.ox = grow(this.ox);
    this.oy = grow(this.oy);
    this.kx0 = grow(this.kx0);
    this.ky0 = grow(this.ky0);
    this.tx = grow(this.tx);
    this.ty = grow(this.ty);
    this.fx = grow(this.fx);
    this.fy = grow(this.fy);
    this.radius = grow(this.radius);
    this.invMass = grow(this.invMass);
    this.damp = grow(this.damp);
    const kin = new Uint8Array(next);
    kin.set(this.kin);
    this.kin = kin;
    const dyn = new Uint8Array(next);
    dyn.set(this.dyn);
    this.dyn = dyn;
    const group = new Int32Array(next);
    group.set(this.group);
    this.group = group;
    const order = new Int32Array(next);
    order.set(this.order);
    this.order = order;
    this.cap = next;
  }

  private growSprings(next: number): void {
    const gi = (src: Int32Array) => {
      const out = new Int32Array(next);
      out.set(src);
      return out;
    };
    const gf = (src: Float32Array) => {
      const out = new Float32Array(next);
      out.set(src);
      return out;
    };
    this.sa = gi(this.sa);
    this.sb = gi(this.sb);
    this.sRest = gf(this.sRest);
    this.sK = gf(this.sK);
    this.sC = gf(this.sC);
    this.springCap = next;
  }
}

function assertSpring(spec: SpringSpec): void {
  if (!Number.isFinite(spec.restLength) || spec.restLength < 0) throw new RangeError(`스프링 휴지 길이는 0 이상의 유한 값이어야 한다(받은 값 ${spec.restLength})`);
  if (!Number.isFinite(spec.stiffness) || spec.stiffness < 0) throw new RangeError(`스프링 강성은 0 이상의 유한 값이어야 한다(받은 값 ${spec.stiffness})`);
  if (!Number.isFinite(spec.damping) || spec.damping < 0) throw new RangeError(`스프링 감쇠는 0 이상의 유한 값이어야 한다(받은 값 ${spec.damping})`);
}

/** 자체 PBD 월드를 만든다(어댑터 팩토리 시그니처 통일용). */
export function createPbdWorld(options?: PbdWorldOptions): PhysicsWorld2D {
  return new PbdWorld2D(options);
}
