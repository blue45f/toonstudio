/**
 * 2D MLS-MPM 점탄성 물감 솔버(CPU, TypeScript, 외부 의존 0).
 *
 * 재료: 체적은 J = det F의 이차 EOS(τ_vol = K/2 (J² − 1)·I), 편차는 μ·ν·(2 n₁n₁ᵀ − I)다(n₁은 주 신장 방향, ν = (r − 1/r)/2).
 * 서브스텝마다 ν를 ν/(1 + dt/τ)로 이완(Maxwell, 암시적)하고 ν_y로 되돌린다(항복) — 힘을 받으면 흐르고 멈추면 형태가 남는 되직한 물감이다.
 *
 * 결정성: 연산은 IEEE 754 사칙과 `Math.sqrt`·`Math.floor`·`Math.min/max`뿐이다(초월함수 없음). 입자·노드 순회 순서가 고정이고
 * 난수는 쓰지 않는다(주입 지터는 `emitter.ts`가 시드 Pcg32로 만든다). 내부 계산은 f64이며 GPU 미러가 아직 없어
 * `Math.fround` 경계를 두지 않는다(WGSL 이식 때 f32 기준 함수를 따로 만든다). 같은 JS 엔진에서 같은 입력은 비트 동일하다.
 *
 * 안전: CFL(dt·c/dx)을 넘으면 MPM은 붕괴한다. 붕괴를 NaN으로 터뜨리지 않고 속도·위치·변형 클램프로 막되, 클램프가 발동할 때마다
 * `clampEvents`로 센다 — 이 값이 0이 아니면 시뮬레이션이 건강하지 않다는 뜻이다(`cflViolation`과 함께 감시한다).
 *
 * 참고(개념·수식만): Hu et al., SIGGRAPH 2018 (MLS-MPM의 P2G/G2P 식). 코드 복제 없음.
 */
import { lowbias32 } from "../../core/rng";

import { mpmCfl, MPM_CFL_LIMIT } from "./params";

import type { MpmParams } from "./params";

/** 주입 결과. `ok` 외에는 입자가 만들어지지 않았고 해당 카운터가 올랐다. */
export type MpmInjectResult = "ok" | "capacity" | "outside" | "invalid";

/** 누적 카운터(입자 수명 동안 쌓인다. `resetCounters`로 0). */
export interface MpmCounters {
  /** 주입된 입자 수. */
  injected: number;
  /** 소거된 입자 수(`clear`). 질량 보존: injected − removed = count. */
  removed: number;
  /** 한도 때문에 주입하지 못한 요청 수. */
  rejectedCapacity: number;
  /** 영역 밖이라 주입하지 못한 요청 수. */
  rejectedOutside: number;
  /** 비유한 입력이라 주입하지 못한 요청 수. */
  rejectedInvalid: number;
  /** 위치 클램프(종이 가장자리 밖으로 나가려던 입자) 횟수. */
  clampPosition: number;
  /** 속도 클램프(셀당 0.5 이동 상한 초과·비유한) 횟수. */
  clampVelocity: number;
  /** 변형 클램프(주 신장 범위 밖·비유한) 횟수. */
  clampDeformation: number;
  /** 진행한 서브스텝 수. */
  steps: number;
  /** `advanceTo`가 진행하지 않고 건너뛴 서브스텝 수(호출당 상한 + 작업 예산). */
  droppedSubsteps: number;
  /** 그중 작업 예산(`setWorkBudget`)이 바닥나 건너뛴 서브스텝 수. */
  budgetDroppedSubsteps: number;
}

export interface MpmHealth {
  count: number;
  /** 최대 속력(px/초). */
  maxSpeed: number;
  /** 제곱평균제곱근 속력(px/초). */
  rmsSpeed: number;
  /** 비유한 값을 가진 입자 수(0이어야 한다). */
  nonFinite: number;
  minJ: number;
  maxJ: number;
  /** 운동 에너지 Σ ½ m |v|². */
  kineticEnergy: number;
}

export interface MpmSettleResult {
  steps: number;
  /** 임계 이하로 가라앉았는가(false = 최대 스텝에서 멈춤). */
  settled: boolean;
  rmsSpeed: number;
}

/** 주 신장 범위. 이 밖은 클램프(+ 카운트)한다. */
const STRETCH_MIN = 0.05;
const STRETCH_MAX = 8;
/** 주입 초기 체적비 범위. */
const J0_MIN = 0.25;
const J0_MAX = 4;
/** 정착 검사 주기(스텝). */
const SETTLE_CHECK_EVERY = 8;
/** 활성 격자 추적 타일의 한 변(노드 수). 입자가 닿은 타일만 초기화·갱신한다(MP-2: 경계 상자 순회 제거). */
const ACTIVE_TILE = 8;

const unit = (x: number): number => (x > 0 ? (x < 1 ? x : 1) : 0);

export class Mpm2D {
  readonly params: MpmParams;
  /** 격자 셀 수. 노드는 (cellsX + 1) × (cellsY + 1)개다. */
  readonly cellsX: number;
  readonly cellsY: number;
  readonly cflNumber: number;
  /** CFL이 상한을 넘었는가. true면 클램프에 의지해 도는 것이다. */
  readonly cflViolation: boolean;
  count = 0;
  /** 상태가 바뀔 때마다(주입·스텝·소거) 늘어나는 번호. 캐시 무효화용. */
  revision = 0;
  readonly counters: MpmCounters = {
    injected: 0,
    removed: 0,
    rejectedCapacity: 0,
    rejectedOutside: 0,
    rejectedInvalid: 0,
    clampPosition: 0,
    clampVelocity: 0,
    clampDeformation: 0,
    steps: 0,
    droppedSubsteps: 0,
    budgetDroppedSubsteps: 0,
  };

  // 입자 상태(평탄 Float64Array)
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  readonly c00: Float64Array;
  readonly c01: Float64Array;
  readonly c10: Float64Array;
  readonly c11: Float64Array;
  readonly f00: Float64Array;
  readonly f01: Float64Array;
  readonly f10: Float64Array;
  readonly f11: Float64Array;
  /** 입자 농도 t(0..1). 색은 `pigment/km-transport.ts`가 정한다. */
  readonly conc: Float64Array;
  readonly sxx: Float64Array;
  readonly sxy: Float64Array;
  readonly syy: Float64Array;

  private readonly vol: number;
  private readonly mass: number;
  private readonly stride: number;
  private readonly lo: number;
  private readonly hiX: number;
  private readonly hiY: number;
  private readonly vMax: number;
  // 격자
  private readonly gm: Float64Array;
  private readonly gvx: Float64Array;
  private readonly gvy: Float64Array;
  private readonly gc: Float64Array;
  /**
   * 직전 서브스텝에서 입자가 닿은 격자 타일 목록(희소 초기화·갱신용). 경계 상자가 아니라 타일 단위라 멀리 떨어진 두 덩어리(대각선 획·떨어진 두 획 끝)에서
   * 사이의 빈 격자를 훑지 않는다. 타일 밖 노드는 항상 0이다. 타일 순서는 입자 순서에서 정해져 결정적이고, 노드 갱신은 노드끼리 독립이라 결과는 경계 상자 순회와 비트 동일하다.
   */
  private readonly tileCols: number;
  private readonly tileMark: Uint8Array;
  private readonly tileList: Int32Array;
  private tileCount = 0;
  /** 작업 예산(입자-스텝) 남은 양. Infinity면 무제한(엔진 기본). `advanceTo`만 소비한다. */
  private workBudget = Number.POSITIVE_INFINITY;
  // 시계: 기준 시각과 그때부터 진행한 스텝 수(누적 오차 없이 정수로 센다)
  private clockOriginMs = 0;
  private clockSteps = 0;

  constructor(params: MpmParams) {
    this.params = params;
    this.cellsX = Math.ceil(params.widthPx / params.cellPx);
    this.cellsY = Math.ceil(params.heightPx / params.cellPx);
    this.stride = this.cellsX + 1;
    this.cflNumber = mpmCfl(params);
    this.cflViolation = this.cflNumber > MPM_CFL_LIMIT;
    const n = params.maxParticles;
    const mk = (): Float64Array => new Float64Array(n);
    this.x = mk();
    this.y = mk();
    this.vx = mk();
    this.vy = mk();
    this.c00 = mk();
    this.c01 = mk();
    this.c10 = mk();
    this.c11 = mk();
    this.f00 = mk();
    this.f01 = mk();
    this.f10 = mk();
    this.f11 = mk();
    this.conc = mk();
    this.sxx = mk();
    this.sxy = mk();
    this.syy = mk();
    this.vol = params.spacingPx * params.spacingPx;
    this.mass = params.rho * this.vol;
    this.lo = 0.5 * params.cellPx;
    this.hiX = params.widthPx - this.lo;
    this.hiY = params.heightPx - this.lo;
    // 한 서브스텝에 반 셀 넘게 움직이면 B-스플라인 지지 영역(3셀)을 벗어나기 시작한다.
    this.vMax = (0.5 * params.cellPx) / params.dtS;
    const nodes = this.stride * (this.cellsY + 1);
    this.gm = new Float64Array(nodes);
    this.gvx = new Float64Array(nodes);
    this.gvy = new Float64Array(nodes);
    this.gc = new Float64Array(nodes);
    this.tileCols = Math.ceil(this.stride / ACTIVE_TILE);
    const tileRows = Math.ceil((this.cellsY + 1) / ACTIVE_TILE);
    this.tileMark = new Uint8Array(this.tileCols * tileRows);
    this.tileList = new Int32Array(this.tileCols * tileRows);
  }

  /** 입자당 질량. */
  get particleMass(): number {
    return this.mass;
  }

  /** 속도 클램프 상한(px/초). */
  get speedLimit(): number {
    return this.vMax;
  }

  /** 안전 클램프가 발동한 총 횟수. 0이어야 정상이다. */
  get clampEvents(): number {
    const c = this.counters;
    return c.clampPosition + c.clampVelocity + c.clampDeformation;
  }

  /** 카운터를 0으로 되돌린다(입자는 그대로). */
  resetCounters(): void {
    const c = this.counters;
    c.injected = 0;
    c.removed = 0;
    c.rejectedCapacity = 0;
    c.rejectedOutside = 0;
    c.rejectedInvalid = 0;
    c.clampPosition = 0;
    c.clampVelocity = 0;
    c.clampDeformation = 0;
    c.steps = 0;
    c.droppedSubsteps = 0;
    c.budgetDroppedSubsteps = 0;
  }

  /**
   * 입자 1개를 주입한다. 비유한 입력·영역 밖·한도 초과는 만들지 않고 해당 카운터를 올린 뒤 이유를 돌려준다(무음 폐기 없음).
   * 속도는 `speedLimit`로, 농도는 0..1로, 초기 체적비 `j0`(1 미만 = 과압축)는 [0.25, 4]로 제한한다(속도 제한은 클램프로 센다).
   */
  inject(px: number, py: number, vx: number, vy: number, conc: number, j0 = 1): MpmInjectResult {
    if (!Number.isFinite(px + py + vx + vy + conc + j0)) {
      this.counters.rejectedInvalid += 1;
      return "invalid";
    }
    if (px < this.lo || px > this.hiX || py < this.lo || py > this.hiY) {
      this.counters.rejectedOutside += 1;
      return "outside";
    }
    const i = this.count;
    if (i >= this.params.maxParticles) {
      this.counters.rejectedCapacity += 1;
      return "capacity";
    }
    let svx = vx;
    let svy = vy;
    const sp2 = vx * vx + vy * vy;
    if (sp2 > this.vMax * this.vMax) {
      const k = this.vMax / Math.sqrt(sp2);
      svx = vx * k;
      svy = vy * k;
      this.counters.clampVelocity += 1;
    }
    const j = j0 < J0_MIN ? J0_MIN : j0 > J0_MAX ? J0_MAX : j0;
    const s = Math.sqrt(j);
    this.x[i] = px;
    this.y[i] = py;
    this.vx[i] = svx;
    this.vy[i] = svy;
    this.c00[i] = 0;
    this.c01[i] = 0;
    this.c10[i] = 0;
    this.c11[i] = 0;
    this.f00[i] = s;
    this.f01[i] = 0;
    this.f10[i] = 0;
    this.f11[i] = s;
    this.conc[i] = unit(conc);
    this.stressOf(i, false);
    this.count = i + 1;
    this.counters.injected += 1;
    this.revision += 1;
    return "ok";
  }

  /** 모든 입자를 소거한다(`removed`에 센다). 격자도 비운다. */
  clear(): void {
    this.counters.removed += this.count;
    this.count = 0;
    this.resetGrid();
    this.revision += 1;
  }

  /** 시계를 `tMs`에 맞춘다(진행한 스텝 수는 0으로). 입자는 그대로다. */
  startClock(tMs: number): void {
    if (!Number.isFinite(tMs)) throw new RangeError(`startClock: 시각이 유한하지 않다(${tMs})`);
    this.clockOriginMs = tMs;
    this.clockSteps = 0;
  }

  /** 시계의 현재 시각(ms) = 기준 + 스텝 수 × dt. */
  get clockMs(): number {
    return this.clockOriginMs + this.clockSteps * this.params.dtS * 1000;
  }

  /**
   * `advanceTo`가 쓸 수 있는 작업 예산을 입자-스텝 단위(서브스텝 1회 = 그때의 입자 수)로 정한다. 기본은 무제한이다.
   * 시계가 표본 시각(실시간)에 묶여 있으면 한 스텝이 dt보다 오래 걸리는 순간 "늦을수록 더 많은 스텝을 따라잡아 더 늦어지는" 되먹임이 생기는데,
   * 예산은 그 되먹임을 끊는다 — 스텝 수가 아니라 입자 수까지 반영한 개수 기반 한도라 시계를 읽지 않고도 결정적이다.
   */
  setWorkBudget(particleSteps: number): void {
    if (Number.isNaN(particleSteps) || particleSteps < 0) throw new RangeError(`setWorkBudget: 0 이상이어야 한다(${particleSteps})`);
    this.workBudget = particleSteps;
  }

  /** 남은 작업 예산(입자-스텝). 무제한이면 Infinity. */
  get workBudgetLeft(): number {
    return this.workBudget;
  }

  /**
   * 시계를 `tMs`까지 고정 dt 서브스텝으로 진행한다. 실제로 진행한 스텝 수를 돌려준다. 과거 시각이면 아무것도 하지 않는다.
   * 진행하지 못한 만큼은 시계만 앞당겨 건너뛰고(입자 상태는 그 시간만큼 낡지 않는다) `droppedSubsteps`로 센다:
   * 한 번에 `maxStepsPerAdvance`를 넘는 시간, 그리고 작업 예산(`setWorkBudget`)이 바닥난 뒤의 모든 시간이다(후자는 `budgetDroppedSubsteps`에도 센다).
   */
  advanceTo(tMs: number): number {
    if (!Number.isFinite(tMs)) throw new RangeError(`advanceTo: 시각이 유한하지 않다(${tMs})`);
    const dtMs = this.params.dtS * 1000;
    const due = Math.floor((tMs - this.clockOriginMs) / dtMs);
    let n = due - this.clockSteps;
    if (n <= 0) return 0;
    const cap = this.params.maxStepsPerAdvance;
    if (n > cap) {
      const skipped = n - cap;
      this.counters.droppedSubsteps += skipped;
      this.clockSteps += skipped;
      n = cap;
    }
    let done = 0;
    while (done < n) {
      const cost = this.count;
      if (this.workBudget < cost) break;
      this.workBudget -= cost;
      this.step();
      done += 1;
    }
    if (done < n) {
      const skipped = n - done;
      this.counters.droppedSubsteps += skipped;
      this.counters.budgetDroppedSubsteps += skipped;
    }
    this.clockSteps += n;
    return done;
  }

  /**
   * 정착: 제곱평균제곱근 속력이 `rmsSpeedPxS` 이하가 되거나 `maxSteps`에 닿을 때까지 진행한다(검사 주기 8스텝).
   * 입자가 없으면 즉시 정착이다. 최대 스텝에 닿으면 `settled: false`로 드러낸다.
   */
  settle(maxSteps: number, rmsSpeedPxS: number): MpmSettleResult {
    let steps = 0;
    for (;;) {
      const rms = this.rmsSpeed();
      if (this.count === 0 || rms <= rmsSpeedPxS) return { steps, settled: true, rmsSpeed: rms };
      if (steps >= maxSteps) return { steps, settled: false, rmsSpeed: rms };
      const batch = Math.min(SETTLE_CHECK_EVERY, maxSteps - steps);
      for (let k = 0; k < batch; k += 1) this.step();
      steps += batch;
      this.clockSteps += batch;
    }
  }

  /** 제곱평균제곱근 속력(px/초). 입자가 없으면 0. */
  rmsSpeed(): number {
    const n = this.count;
    if (n === 0) return 0;
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i];
    return Math.sqrt(sum / n);
  }

  /** 운동 에너지 Σ ½ m |v|². */
  kineticEnergy(): number {
    let sum = 0;
    for (let i = 0; i < this.count; i += 1) sum += this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i];
    return 0.5 * this.mass * sum;
  }

  /** 직전 서브스텝의 P2G 이후 격자 질량 합(입자 질량 합과 같아야 한다: 질량 보존 검증용). */
  totalGridMass(): number {
    let sum = 0;
    this.forEachActiveNode((k) => {
      sum += this.gm[k];
    });
    return sum;
  }

  /** 직전 서브스텝에서 입자가 닿은 격자 타일 수와 그 노드 수(진단·시험용: 경계 상자가 아니라 이 값에 비례해 일한다). */
  activeGrid(): { tiles: number; nodes: number } {
    let nodes = 0;
    this.forEachActiveNode(() => {
      nodes += 1;
    });
    return { tiles: this.tileCount, nodes };
  }

  /** 상태 점검: 비유한 값·체적비 범위·속력. */
  health(): MpmHealth {
    let maxSp2 = 0;
    let sum2 = 0;
    let nonFinite = 0;
    let minJ = Infinity;
    let maxJ = -Infinity;
    for (let i = 0; i < this.count; i += 1) {
      const sp2 = this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i];
      const j = this.f00[i] * this.f11[i] - this.f01[i] * this.f10[i];
      if (!Number.isFinite(sp2 + this.x[i] + this.y[i] + j + this.conc[i] + this.sxx[i] + this.sxy[i] + this.syy[i])) {
        nonFinite += 1;
        continue;
      }
      if (sp2 > maxSp2) maxSp2 = sp2;
      sum2 += sp2;
      if (j < minJ) minJ = j;
      if (j > maxJ) maxJ = j;
    }
    const finite = this.count - nonFinite;
    return {
      count: this.count,
      maxSpeed: Math.sqrt(maxSp2),
      rmsSpeed: finite > 0 ? Math.sqrt(sum2 / finite) : 0,
      nonFinite,
      minJ: finite > 0 ? minJ : 1,
      maxJ: finite > 0 ? maxJ : 1,
      kineticEnergy: 0.5 * this.mass * sum2,
    };
  }

  /**
   * 입자 상태 전체의 해시(16자리 hex). 결정성 시험용 — lowbias32 두 갈래를 32비트 워드마다 섞는다.
   * 워드 순서는 입자 번호 오름차순이고 리틀 엔디언 플랫폼을 전제한다(브라우저·Node 모두 해당).
   */
  stateHash(): string {
    const n = this.count;
    const fields = [this.x, this.y, this.vx, this.vy, this.f00, this.f01, this.f10, this.f11, this.conc, this.sxx];
    const buf = new Float64Array(n * fields.length);
    let o = 0;
    for (let i = 0; i < n; i += 1) {
      for (const f of fields) buf[o++] = f[i];
    }
    const words = new Uint32Array(buf.buffer, buf.byteOffset, buf.length * 2);
    let h1 = lowbias32(n);
    let h2 = lowbias32(n ^ 0x9e3779b9);
    for (let i = 0; i < words.length; i += 1) {
      h1 = lowbias32(h1 ^ words[i]);
      h2 = lowbias32(h2 + words[i] + i);
    }
    return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
  }

  /** 활성 타일의 노드 인덱스를 차례로 돌려준다(격자 인덱스 k = j * stride + i, 격자 범위 안만). */
  private forEachActiveNode(visit: (k: number) => void): void {
    const { stride, tileCols } = this;
    const nodeRows = this.cellsY + 1;
    for (let t = 0; t < this.tileCount; t += 1) {
      const tile = this.tileList[t];
      const j0 = Math.floor(tile / tileCols) * ACTIVE_TILE;
      const i0 = (tile % tileCols) * ACTIVE_TILE;
      const j1 = Math.min(j0 + ACTIVE_TILE, nodeRows);
      const i1 = Math.min(i0 + ACTIVE_TILE, stride);
      for (let j = j0; j < j1; j += 1) {
        for (let i = i0; i < i1; i += 1) visit(j * stride + i);
      }
    }
  }

  /** 직전 활성 타일의 격자를 0으로 되돌린다(타일 밖은 항상 0). */
  private resetGrid(): void {
    const { gm, gvx, gvy, gc, stride, tileCols, tileMark, tileList } = this;
    const nodeRows = this.cellsY + 1;
    for (let t = 0; t < this.tileCount; t += 1) {
      const tile = tileList[t];
      tileMark[tile] = 0;
      const j0 = Math.floor(tile / tileCols) * ACTIVE_TILE;
      const i0 = (tile % tileCols) * ACTIVE_TILE;
      const j1 = Math.min(j0 + ACTIVE_TILE, nodeRows);
      const i1 = Math.min(i0 + ACTIVE_TILE, stride);
      for (let j = j0; j < j1; j += 1) {
        const row = j * stride;
        for (let i = i0; i < i1; i += 1) {
          const k = row + i;
          gm[k] = 0;
          gvx[k] = 0;
          gvy[k] = 0;
          gc[k] = 0;
        }
      }
    }
    this.tileCount = 0;
  }

  /**
   * F에서 Kirchhoff 응력을 갱신한다. `relax`면 Maxwell 이완·항복을 F에 반영하고(F를 다시 쓴다) 변형 클램프를 센다.
   * 극분해 F = R U는 2×2 닫힌 형식이고 U의 고유분해도 sqrt만으로 닫힌다.
   */
  private stressOf(i: number, relax: boolean): void {
    const a = this.f00[i];
    const b = this.f01[i];
    const c = this.f10[i];
    const d = this.f11[i];
    if (!Number.isFinite(a + b + c + d)) {
      // 변형이 비유한이면 항등으로 되돌린다(붕괴를 NaN으로 퍼뜨리지 않는다).
      this.f00[i] = 1;
      this.f01[i] = 0;
      this.f10[i] = 0;
      this.f11[i] = 1;
      this.counters.clampDeformation += 1;
      this.sxx[i] = 0;
      this.sxy[i] = 0;
      this.syy[i] = 0;
      return;
    }
    let rc = a + d;
    let rs = c - b;
    const rn = Math.sqrt(rc * rc + rs * rs);
    if (rn < 1e-12) {
      rc = 1;
      rs = 0;
    } else {
      rc /= rn;
      rs /= rn;
    }
    // U = Rᵀ F (대칭)
    const p = rc * a + rs * c;
    const q = 0.5 * (rc * b + rs * d + (-rs * a + rc * c));
    const r = -rs * b + rc * d;
    // U의 고유분해: 주 신장 s1 ≥ s2, 주 방향 (cs, sn)
    const m = 0.5 * (p + r);
    const h = 0.5 * (p - r);
    const rad = Math.sqrt(h * h + q * q);
    let s1 = m + rad;
    let s2 = m - rad;
    let cs = 1;
    let sn = 0;
    if (rad > 1e-12) {
      const c2 = h / rad;
      cs = Math.sqrt(0.5 * (1 + c2));
      sn = Math.sqrt(0.5 * (1 - c2));
      if (q < 0) sn = -sn;
    }
    // 반전·폭주 방지: 주 신장을 범위 안으로 제한하고 센다.
    let clamped = false;
    if (s2 < STRETCH_MIN) {
      s2 = STRETCH_MIN;
      clamped = true;
    }
    if (s1 < STRETCH_MIN) {
      s1 = STRETCH_MIN;
      clamped = true;
    }
    if (s1 > STRETCH_MAX) {
      s1 = STRETCH_MAX;
      clamped = true;
    }
    if (s2 > STRETCH_MAX) {
      s2 = STRETCH_MAX;
      clamped = true;
    }
    if (clamped) this.counters.clampDeformation += 1;
    const J = s1 * s2;
    let ratio = s1 / s2; // ≥ 1 (s1 ≥ s2는 위 클램프 뒤에도 유지된다)
    if (ratio < 1) ratio = 1;
    let nu = 0.5 * (ratio - 1 / ratio);
    if (relax || clamped) {
      const tau = this.params.relaxTimeS;
      if (relax) {
        if (tau > 0) nu /= 1 + this.params.dtS / tau;
        if (nu > this.params.yieldStrain) nu = this.params.yieldStrain;
      }
      ratio = nu + Math.sqrt(nu * nu + 1);
      const sq = Math.sqrt(J);
      const sr = Math.sqrt(ratio);
      s1 = sq * sr;
      s2 = sq / sr;
      // F' = R Q diag(s') Qᵀ
      const u00 = s1 * cs * cs + s2 * sn * sn;
      const u01 = (s1 - s2) * cs * sn;
      const u11 = s1 * sn * sn + s2 * cs * cs;
      this.f00[i] = rc * u00 - rs * u01;
      this.f01[i] = rc * u01 - rs * u11;
      this.f10[i] = rs * u00 + rc * u01;
      this.f11[i] = rs * u01 + rc * u11;
    }
    // 주 방향 n1 = R q1. 편차 응력 μ ν (n1n1ᵀ − n2n2ᵀ) = μ ν (2 n1n1ᵀ − I)
    const n1x = rc * cs - rs * sn;
    const n1y = rs * cs + rc * sn;
    const dev = this.params.shear * nu;
    const vol = 0.5 * this.params.bulk * (J * J - 1);
    this.sxx[i] = dev * (2 * n1x * n1x - 1) + vol;
    this.sxy[i] = dev * (2 * n1x * n1y);
    this.syy[i] = dev * (2 * n1y * n1y - 1) + vol;
  }

  /** 서브스텝 1회: P2G → 격자 갱신(항력·벽) → G2P. */
  step(): void {
    const { dtS: dt, dragPerS, concDiffusionPerS, wallFriction, cellPx: dx } = this.params;
    const nx = this.cellsX;
    const ny = this.cellsY;
    const invDx = 1 / dx;
    const stride = this.stride;
    const { gm, gvx, gvy, gc } = this;
    const mass = this.mass;
    const count = this.count;

    this.resetGrid();

    const { tileCols, tileMark, tileList } = this;
    let tileCount = 0;
    const stressScale = -dt * this.vol * 4 * invDx * invDx;

    // ---- P2G
    for (let p = 0; p < count; p += 1) {
      const px = this.x[p] * invDx;
      const py = this.y[p] * invDx;
      const bx = Math.min(Math.max(Math.floor(px - 0.5), 0), nx - 2);
      const by = Math.min(Math.max(Math.floor(py - 0.5), 0), ny - 2);
      // 입자의 3×3 지지 노드가 걸친 타일을 활성으로 표시한다(최대 4개, 이미 표시됐으면 건너뛴다).
      const ty1 = (by + 2) >> 3;
      const tx1 = (bx + 2) >> 3;
      for (let ty = by >> 3; ty <= ty1; ty += 1) {
        for (let tx = bx >> 3; tx <= tx1; tx += 1) {
          const tile = ty * tileCols + tx;
          if (tileMark[tile] === 0) {
            tileMark[tile] = 1;
            tileList[tileCount] = tile;
            tileCount += 1;
          }
        }
      }
      const fx = px - bx;
      const fy = py - by;
      const w0x = 0.5 * (1.5 - fx) * (1.5 - fx);
      const w1x = 0.75 - (fx - 1) * (fx - 1);
      const w2x = 0.5 * (fx - 0.5) * (fx - 0.5);
      const w0y = 0.5 * (1.5 - fy) * (1.5 - fy);
      const w1y = 0.75 - (fy - 1) * (fy - 1);
      const w2y = 0.5 * (fy - 0.5) * (fy - 0.5);
      // 친화 행렬 A = stressScale·τ + m·C
      const a00 = stressScale * this.sxx[p] + mass * this.c00[p];
      const a01 = stressScale * this.sxy[p] + mass * this.c01[p];
      const a10 = stressScale * this.sxy[p] + mass * this.c10[p];
      const a11 = stressScale * this.syy[p] + mass * this.c11[p];
      const mvx = mass * this.vx[p];
      const mvy = mass * this.vy[p];
      const mc = mass * this.conc[p];
      for (let j = 0; j < 3; j += 1) {
        const wy = j === 0 ? w0y : j === 1 ? w1y : w2y;
        const dpy = (j - fy) * dx;
        for (let i = 0; i < 3; i += 1) {
          const wx = i === 0 ? w0x : i === 1 ? w1x : w2x;
          const w = wx * wy;
          const dpx = (i - fx) * dx;
          const k = (by + j) * stride + (bx + i);
          gm[k] += w * mass;
          gvx[k] += w * (mvx + a00 * dpx + a01 * dpy);
          gvy[k] += w * (mvy + a10 * dpx + a11 * dpy);
          gc[k] += w * mc;
        }
      }
    }

    // ---- 격자 갱신: 운동량 → 속도, 종이 항력, 벽 경계
    const dragK = 1 / (1 + dragPerS * dt);
    this.tileCount = tileCount;
    const keep = 1 - wallFriction;
    const W = this.params.widthPx;
    const H = this.params.heightPx;
    const nodeRows = ny + 1;
    for (let t = 0; t < tileCount; t += 1) {
      const tile = tileList[t];
      const tj0 = Math.floor(tile / tileCols) * ACTIVE_TILE;
      const ti0 = (tile % tileCols) * ACTIVE_TILE;
      const tj1 = Math.min(tj0 + ACTIVE_TILE, nodeRows);
      const ti1 = Math.min(ti0 + ACTIVE_TILE, stride);
      for (let j = tj0; j < tj1; j += 1) {
        const py = j * dx;
        const nearTop = py <= dx;
        const nearBottom = H - py <= dx;
        for (let i = ti0; i < ti1; i += 1) {
          const k = j * stride + i;
          const mk = gm[k];
          if (mk > 1e-12) {
            const inv = 1 / mk;
            let vx = gvx[k] * inv * dragK;
            let vy = gvy[k] * inv * dragK;
            const px = i * dx;
            // 벽: 벽에서 한 셀 이내(두 겹)의 노드에서 벽을 파고드는 법선 성분을 지우고 접선 성분에 마찰을 건다.
            // 한 겹(경계 노드만)이면 벽 바로 앞 입자가 안쪽 노드의 속도에 밀려 위치 클램프에 닿는다.
            if (px <= dx && vx < 0) {
              vx = 0;
              vy *= keep;
            } else if (W - px <= dx && vx > 0) {
              vx = 0;
              vy *= keep;
            }
            if (nearTop && vy < 0) {
              vy = 0;
              vx *= keep;
            } else if (nearBottom && vy > 0) {
              vy = 0;
              vx *= keep;
            }
            gvx[k] = vx;
            gvy[k] = vy;
            gc[k] *= inv;
          } else {
            gvx[k] = 0;
            gvy[k] = 0;
            gc[k] = 0;
          }
        }
      }
    }

    // ---- G2P
    const cd = Math.min(1, concDiffusionPerS * dt);
    const s4 = 4 * invDx * invDx;
    const lo = this.lo;
    const hiX = this.hiX;
    const hiY = this.hiY;
    const vMax2 = this.vMax * this.vMax;
    let clampPos = 0;
    let clampVel = 0;
    for (let p = 0; p < count; p += 1) {
      const px = this.x[p] * invDx;
      const py = this.y[p] * invDx;
      const bx = Math.min(Math.max(Math.floor(px - 0.5), 0), nx - 2);
      const by = Math.min(Math.max(Math.floor(py - 0.5), 0), ny - 2);
      const fx = px - bx;
      const fy = py - by;
      const w0x = 0.5 * (1.5 - fx) * (1.5 - fx);
      const w1x = 0.75 - (fx - 1) * (fx - 1);
      const w2x = 0.5 * (fx - 0.5) * (fx - 0.5);
      const w0y = 0.5 * (1.5 - fy) * (1.5 - fy);
      const w1y = 0.75 - (fy - 1) * (fy - 1);
      const w2y = 0.5 * (fy - 0.5) * (fy - 0.5);
      let nvx = 0;
      let nvy = 0;
      let n00 = 0;
      let n01 = 0;
      let n10 = 0;
      let n11 = 0;
      let cc = 0;
      for (let j = 0; j < 3; j += 1) {
        const wy = j === 0 ? w0y : j === 1 ? w1y : w2y;
        const dpy = (j - fy) * dx;
        for (let i = 0; i < 3; i += 1) {
          const wx = i === 0 ? w0x : i === 1 ? w1x : w2x;
          const w = wx * wy;
          const dpx = (i - fx) * dx;
          const k = (by + j) * stride + (bx + i);
          const gx = gvx[k];
          const gy = gvy[k];
          nvx += w * gx;
          nvy += w * gy;
          n00 += w * gx * dpx;
          n01 += w * gx * dpy;
          n10 += w * gy * dpx;
          n11 += w * gy * dpy;
          cc += w * gc[k];
        }
      }
      let C00 = n00 * s4;
      let C01 = n01 * s4;
      let C10 = n10 * s4;
      let C11 = n11 * s4;
      // 속도 클램프: 비유한이면 정지, 반 셀/스텝을 넘으면 크기만 줄인다.
      const sp2 = nvx * nvx + nvy * nvy;
      if (!Number.isFinite(sp2 + C00 + C01 + C10 + C11)) {
        nvx = 0;
        nvy = 0;
        C00 = 0;
        C01 = 0;
        C10 = 0;
        C11 = 0;
        clampVel += 1;
      } else if (sp2 > vMax2) {
        const k = this.vMax / Math.sqrt(sp2);
        nvx *= k;
        nvy *= k;
        clampVel += 1;
      }
      this.vx[p] = nvx;
      this.vy[p] = nvy;
      this.c00[p] = C00;
      this.c01[p] = C01;
      this.c10[p] = C10;
      this.c11[p] = C11;
      let ox = this.x[p] + dt * nvx;
      let oy = this.y[p] + dt * nvy;
      // 위치 클램프: 종이 가장자리 안쪽 반 셀(벽 경계가 막아 주므로 평소엔 발동하지 않는다).
      if (ox < lo || ox > hiX || oy < lo || oy > hiY) {
        clampPos += 1;
        ox = ox < lo ? lo : ox > hiX ? hiX : ox;
        oy = oy < lo ? lo : oy > hiY ? hiY : oy;
        this.vx[p] = 0;
        this.vy[p] = 0;
      }
      this.x[p] = ox;
      this.y[p] = oy;
      // F ← (I + dt C) F
      const fa = this.f00[p];
      const fb = this.f01[p];
      const fc = this.f10[p];
      const fd = this.f11[p];
      this.f00[p] = fa + dt * (C00 * fa + C01 * fc);
      this.f01[p] = fb + dt * (C00 * fb + C01 * fd);
      this.f10[p] = fc + dt * (C10 * fa + C11 * fc);
      this.f11[p] = fd + dt * (C10 * fb + C11 * fd);
      this.stressOf(p, true);
      if (cd > 0) this.conc[p] = unit(this.conc[p] + cd * (cc - this.conc[p]));
    }
    this.counters.clampPosition += clampPos;
    this.counters.clampVelocity += clampVel;
    this.counters.steps += 1;
    this.revision += 1;
  }
}
