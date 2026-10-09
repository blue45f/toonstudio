import { Pcg32 } from "../../core/rng";
import { PEN_SPRING_SUBSTEP_MS, PEN_SPRING_SUBSTEP_SEC, PenSpring2D, penSpringParams, penSpringParamsProblem } from "../../input/stages/pen-spring";

import { linearPressureCurve, powerPressureCurve } from "./pressure-curve";
import { BODY_STATE_STRIDE } from "./types";

import type { PressureCurveTable } from "./pressure-curve";
import type { PhysicsWorld2D } from "./types";

/**
 * 붓털 다발(2D 상면 모델). 손잡이는 지면 항력 스프링 펜(`PenSpring2D`)이고, 털 N올은 손잡이에 붙은 **휴지 슬롯**(붓 로컬 좌표의
 * 페르마 나선 배치)에 영 길이 스프링으로 매달려 종이 위를 끌린다. 털 사이는 비침투 접촉이다.
 *
 * - 휴지 오프셋은 붓 로컬 좌표계에 있고 손잡이 속도 방향(또는 외부가 준 방위각)으로 회전한다. 방향은 삼각함수 없이
 *   단위 벡터를 일차 지연(τ)으로 따라가게 해 정한다(정지에 가까우면 마지막 방향을 유지한다). 회전은 **처음 방향이 정해진 순간을 기준**으로
 *   그 뒤의 방향 변화만큼이다(시작 순간에 슬롯이 튀지 않는다. 급선회 때 슬롯이 돌며 털이 부채꼴로 벌어진다).
 * - 압력 → 벌어짐: 슬롯 반경 R(p) = radiusPx × spread(p)(`pressure-curve.ts` 표), 강성 배율 stiffness(p)로 스프링 강성을 바꾼다.
 *   강성은 `stiffnessLevels`단계로 양자화해 단계가 바뀔 때만 월드에 알린다(외부 엔진은 조인트를 다시 만들 수 있어 비싸다).
 * - 종이 항력: 털마다 선형 항력률(평균 ± 지터, 시드 고정) + 선택적 쿨롱 마찰(외력으로 적용).
 * - 털별 물감 적재량 load는 이동 거리에 따라 소진된다: load ← load / (1 + d / L_i).
 * - 고정 서브스텝 1/240 s를 **표본 시각**(`tMs`)으로 구동한다(결정적). 표본이 길게 건너뛰면 `maxCatchUpMs`까지만 따라잡고
 *   나머지는 `droppedTicks`로 세어 드러낸다(조용히 늘리지 않는다).
 *
 * 이 모듈은 월드 구현(자체 PBD / Rapier 어댑터)을 모르고 `PhysicsWorld2D` 계약만 쓴다. 외부 패키지·DOM·시계를 참조하지 않는다.
 */

const f = Math.fround;

/** 페르마 나선의 황금각 cos/sin(리터럴 상수: 삼각함수 호출 없이 회전 점화식으로 배치한다). */
const GOLDEN_COS = -0.7373937155412454;
const GOLDEN_SIN = 0.6754631805511511;

export const BRISTLE_MAX_COUNT = 256;
export const BRISTLE_DEFAULT_COUNT = 32;
/** 밀집 N=128의 퍼짐이 불균일해(SP-A) N ≤ 32를 기본으로 권한다. */
export const BRISTLE_RECOMMENDED_MAX_COUNT_PBD = 32;

export interface BristleBrushConfig {
  /** 털 수(1..256). */
  count: number;
  /** 압력 곡선 값 1에서의 슬롯 반경(px). */
  radiusPx: number;
  /** 압력 → 슬롯 반경 배율 표. */
  spreadCurve: PressureCurveTable;
  /** 압력 → 스프링 강성 배율 표(1 = 기준 강성). */
  stiffnessCurve: PressureCurveTable;
  /** 강성 양자화 단계 수(≥ 1). */
  stiffnessLevels: number;
  /** 스프링 고유 진동수(Hz). */
  fnHz: number;
  /** 스프링 상대 감쇠비(손잡이와의 상대 속도에 작용). */
  relZeta: number;
  /** 평균 종이 항력률(1/s). */
  dragPerSec: number;
  /** 털별 항력 배율의 편차 0..0.9(배율 = 1 ± 지터). */
  dragJitter: number;
  mass: number;
  /** 털 접촉 반경 배율(1 = 압력 0.4 슬롯 간격 기준 충전 반경). */
  bristleRadiusScale: number;
  /** 물감 소진 길이(px): 이만큼 움직이면 적재량이 대략 1/2가 된다. */
  loadDecayPx: number;
  /** 시작 적재량 편차 0..0.9(적재량 = 1 − 지터·난수). */
  loadJitter: number;
  /** 쿨롱(건조) 마찰 가속도(px/s²). 0이면 끈다. */
  coulombPxPerSec2: number;
  /** 손잡이 추적 지연(ms). */
  handleLagMs: number;
  handleZeta: number;
  /** 방향 추종 시정수(ms). */
  headingTauMs: number;
  /** 이 속도(px/s) 미만이면 방향을 갱신하지 않는다. */
  headingMinSpeedPxPerSec: number;
  /** 한 번의 `advance`가 따라잡을 최대 시간(ms). 넘으면 건너뛰고 센다. */
  maxCatchUpMs: number;
}

export const BRISTLE_DEFAULTS: Omit<BristleBrushConfig, "spreadCurve" | "stiffnessCurve"> = {
  count: BRISTLE_DEFAULT_COUNT,
  radiusPx: 10,
  stiffnessLevels: 6,
  fnHz: 14,
  relZeta: 0.15,
  dragPerSec: 45,
  dragJitter: 0.3,
  mass: 1,
  bristleRadiusScale: 1,
  loadDecayPx: 2400,
  loadJitter: 0.15,
  coulombPxPerSec2: 0,
  handleLagMs: 12,
  handleZeta: 1,
  headingTauMs: 40,
  headingMinSpeedPxPerSec: 30,
  maxCatchUpMs: 500,
};

/** 부분 설정을 검증해 완전한 설정으로 만든다. 잘못된 값은 RangeError(무음 보정 없음). */
export function resolveBristleBrushConfig(partial: Partial<BristleBrushConfig> = {}): BristleBrushConfig {
  const c: BristleBrushConfig = {
    ...BRISTLE_DEFAULTS,
    spreadCurve: partial.spreadCurve ?? powerPressureCurve(),
    stiffnessCurve: partial.stiffnessCurve ?? linearPressureCurve(1, 0.6),
    ...partial,
  };
  const need = (ok: boolean, msg: string): void => {
    if (!ok) throw new RangeError(`붓털 설정 오류: ${msg}`);
  };
  need(Number.isInteger(c.count) && c.count >= 1 && c.count <= BRISTLE_MAX_COUNT, `털 수는 1..${BRISTLE_MAX_COUNT} 정수여야 한다(받은 값 ${c.count})`);
  need(Number.isFinite(c.radiusPx) && c.radiusPx > 0, `벌어짐 반경은 0보다 커야 한다(받은 값 ${c.radiusPx})`);
  need(Number.isInteger(c.stiffnessLevels) && c.stiffnessLevels >= 1 && c.stiffnessLevels <= 64, `강성 단계는 1..64 정수여야 한다(받은 값 ${c.stiffnessLevels})`);
  need(Number.isFinite(c.fnHz) && c.fnHz > 0 && c.fnHz < 40, `고유 진동수는 0 초과 40 Hz 미만이어야 한다(받은 값 ${c.fnHz})`);
  need(Number.isFinite(c.relZeta) && c.relZeta >= 0, `상대 감쇠비는 0 이상이어야 한다(받은 값 ${c.relZeta})`);
  need(Number.isFinite(c.dragPerSec) && c.dragPerSec >= 0, `종이 항력률은 0 이상이어야 한다(받은 값 ${c.dragPerSec})`);
  need(Number.isFinite(c.dragJitter) && c.dragJitter >= 0 && c.dragJitter <= 0.9, `항력 편차는 0..0.9여야 한다(받은 값 ${c.dragJitter})`);
  need(Number.isFinite(c.mass) && c.mass > 0, `질량은 0보다 커야 한다(받은 값 ${c.mass})`);
  need(Number.isFinite(c.bristleRadiusScale) && c.bristleRadiusScale > 0 && c.bristleRadiusScale <= 3, `털 반경 배율은 (0, 3]이어야 한다(받은 값 ${c.bristleRadiusScale})`);
  need(Number.isFinite(c.loadDecayPx) && c.loadDecayPx > 0, `물감 소진 길이는 0보다 커야 한다(받은 값 ${c.loadDecayPx})`);
  need(Number.isFinite(c.loadJitter) && c.loadJitter >= 0 && c.loadJitter <= 0.9, `적재량 편차는 0..0.9여야 한다(받은 값 ${c.loadJitter})`);
  need(Number.isFinite(c.coulombPxPerSec2) && c.coulombPxPerSec2 >= 0, `쿨롱 마찰은 0 이상이어야 한다(받은 값 ${c.coulombPxPerSec2})`);
  need(Number.isFinite(c.handleLagMs) && c.handleLagMs > 0, `손잡이 지연은 0보다 커야 한다(받은 값 ${c.handleLagMs})`);
  need(Number.isFinite(c.handleZeta) && c.handleZeta > 0, `손잡이 감쇠비는 0보다 커야 한다(받은 값 ${c.handleZeta})`);
  need(penSpringParamsProblem(c.handleLagMs, c.handleZeta) === null, `손잡이 ${penSpringParamsProblem(c.handleLagMs, c.handleZeta) ?? ""}`);
  need(Number.isFinite(c.headingTauMs) && c.headingTauMs > 0, `방향 시정수는 0보다 커야 한다(받은 값 ${c.headingTauMs})`);
  need(Number.isFinite(c.headingMinSpeedPxPerSec) && c.headingMinSpeedPxPerSec >= 0, `방향 갱신 최소 속도는 0 이상이어야 한다(받은 값 ${c.headingMinSpeedPxPerSec})`);
  need(Number.isFinite(c.maxCatchUpMs) && c.maxCatchUpMs >= PEN_SPRING_SUBSTEP_MS, `따라잡기 상한은 한 틱 이상이어야 한다(받은 값 ${c.maxCatchUpMs})`);
  return c;
}

/** 단위 원 안 페르마 나선 배치(반경 √((i+½)/N), 황금각 회전 점화식). 삼각함수를 쓰지 않는다. */
export function fermatLayout(count: number): { ux: Float32Array; uy: Float32Array } {
  const ux = new Float32Array(count);
  const uy = new Float32Array(count);
  let cx = 1;
  let cy = 0;
  for (let i = 0; i < count; i += 1) {
    const rho = Math.sqrt((i + 0.5) / count);
    ux[i] = rho * cx;
    uy[i] = rho * cy;
    const nx = cx * GOLDEN_COS - cy * GOLDEN_SIN;
    const ny = cx * GOLDEN_SIN + cy * GOLDEN_COS;
    // 오차 누적을 막으려고 매 단계 정규화한다.
    const inv = 1 / Math.sqrt(nx * nx + ny * ny);
    cx = nx * inv;
    cy = ny * inv;
  }
  return { ux, uy };
}

/** 털 접촉 반경(px): 압력 0.4의 슬롯 간격 기준 충전 반경(SP-A 규약). */
export function bristleContactRadiusPx(config: BristleBrushConfig): number {
  const r04 = config.radiusPx * config.spreadCurve.eval(0.4);
  return f(0.5 * r04 * Math.sqrt(Math.PI / config.count) * 1.07 * config.bristleRadiusScale);
}

/** 한 틱이 끝났을 때 싱크가 읽는 상태(배열은 재사용되므로 복사하지 말고 즉시 읽는다). */
export interface BristleTick {
  readonly count: number;
  /** 이번 틱 직전/직후 털끝 위치. */
  readonly prevX: Float32Array;
  readonly prevY: Float32Array;
  readonly curX: Float32Array;
  readonly curY: Float32Array;
  /** 털별 물감 적재량 0..1(이번 틱의 이동으로 소진된 뒤 값). */
  readonly load: Float32Array;
  /** 이번 틱 이동 거리(px). */
  readonly moved: Float32Array;
  /** 이번 틱의 (보간된) 압력 0..1. */
  readonly pressure: number;
  /** 시뮬레이션 시각(ms). */
  readonly tMs: number;
  /** 손잡이(펜 스프링) 위치. */
  readonly handleX: number;
  readonly handleY: number;
  /** 지금 압력의 슬롯 반경(px). */
  readonly spreadRadiusPx: number;
}

export interface BristleTickSink {
  onTick(tick: BristleTick): void;
}

export interface BristleDiagnostics {
  ticks: number;
  /** 표본 시각이 길게 건너뛰어 따라잡지 않고 넘긴 틱 수. */
  droppedTicks: number;
  /** 강성 단계가 바뀌어 월드에 알린 횟수. */
  stiffnessUpdates: number;
}

export class BristleBrush2D {
  readonly config: BristleBrushConfig;
  readonly count: number;
  /** 털 접촉 반경(px). */
  readonly bristleRadiusPx: number;
  readonly diagnostics: BristleDiagnostics = { ticks: 0, droppedTicks: 0, stiffnessUpdates: 0 };

  private readonly world: PhysicsWorld2D;
  private readonly seed: number;
  private readonly ux: Float32Array;
  private readonly uy: Float32Array;
  private readonly dragMul: Float32Array;
  private readonly lenMul: Float32Array;
  private readonly loadValue: Float32Array;
  private readonly prevX: Float32Array;
  private readonly prevY: Float32Array;
  private readonly curX: Float32Array;
  private readonly curY: Float32Array;
  private readonly moved: Float32Array;
  private readonly buf: Float32Array;
  private readonly springIds: number[] = [];
  private slotIds: number[] = [];
  private handle: PenSpring2D | null = null;
  private started = false;
  private t0 = 0;
  private ticks = 0;
  private knotT = 0;
  private knotX = 0;
  private knotY = 0;
  private knotP = 0;
  /** 현재 진행 방향 단위 벡터와, 처음 방향이 정해졌을 때의 기준 방향. 붓 회전 = 현재 방향 × 기준 방향의 켤레. */
  private headX = 1;
  private headY = 0;
  private baseX = 1;
  private baseY = 0;
  private headingSet = false;
  private level = -1;
  private lastPressure = 0;
  private lastSpread = 0;

  constructor(world: PhysicsWorld2D, config: BristleBrushConfig, seed: number) {
    this.world = world;
    this.config = config;
    this.count = config.count;
    this.seed = seed >>> 0;
    this.bristleRadiusPx = bristleContactRadiusPx(config);
    const n = this.count;
    const layout = fermatLayout(n);
    this.ux = layout.ux;
    this.uy = layout.uy;
    this.dragMul = new Float32Array(n);
    this.lenMul = new Float32Array(n);
    this.loadValue = new Float32Array(n);
    this.prevX = new Float32Array(n);
    this.prevY = new Float32Array(n);
    this.curX = new Float32Array(n);
    this.curY = new Float32Array(n);
    this.moved = new Float32Array(n);
    this.buf = new Float32Array(2 * n * BODY_STATE_STRIDE);
    const rng = new Pcg32(this.seed, 0xb15);
    for (let i = 0; i < n; i += 1) {
      this.dragMul[i] = f(1 - config.dragJitter + 2 * config.dragJitter * rng.nextF32());
      this.lenMul[i] = f(0.6 + 0.8 * rng.nextF32());
      this.loadValue[i] = f(1 - config.loadJitter * rng.nextF32());
    }
  }

  /** 지금 시뮬레이션 시각(ms): 마지막으로 적분한 틱. */
  get simTimeMs(): number {
    return this.t0 + this.ticks * PEN_SPRING_SUBSTEP_MS;
  }

  /** 털별 적재량(읽기 전용 뷰). */
  loads(): Float32Array {
    return this.loadValue;
  }

  /** 털끝 현재 위치(읽기 전용 뷰). */
  tipX(): Float32Array {
    return this.curX;
  }
  tipY(): Float32Array {
    return this.curY;
  }

  /** 손잡이 위치. 획 시작 전이면 null. */
  handlePosition(): { x: number; y: number } | null {
    const h = this.handle;
    return h ? { x: h.x, y: h.y } : null;
  }

  /** 획 시작: 몸체를 만들고 시계를 `tMs`로 맞춘다. 한 인스턴스에서 한 번만 부른다. */
  begin(x: number, y: number, tMs: number, pressure: number): void {
    if (this.started) throw new Error("BristleBrush2D.begin은 한 인스턴스에서 한 번만 부를 수 있다");
    assertFinite("begin", x, y, tMs, pressure);
    const cfg = this.config;
    this.started = true;
    this.handle = new PenSpring2D(penSpringParams(cfg.handleLagMs, cfg.handleZeta), x, y);
    this.t0 = tMs;
    this.ticks = 0;
    this.knotT = tMs;
    this.knotX = x;
    this.knotY = y;
    this.knotP = clamp01(pressure);
    const p = this.knotP;
    const level = this.stiffnessLevelFor(p);
    this.level = level;
    const { k, c } = this.springConstants(level);
    const r0 = f(cfg.radiusPx * cfg.spreadCurve.eval(p));
    const n = this.count;
    const slotIds: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const sx = f(x + this.slotOffsetX(i, r0));
      const sy = f(y + this.slotOffsetY(i, r0));
      slotIds.push(this.world.addCircle({ x: sx, y: sy, radius: 0.5, mass: cfg.mass, kinematic: true }));
    }
    const bristleIds: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const sx = f(x + this.slotOffsetX(i, r0));
      const sy = f(y + this.slotOffsetY(i, r0));
      bristleIds.push(
        this.world.addCircle({
          x: sx,
          y: sy,
          radius: this.bristleRadiusPx,
          mass: cfg.mass,
          linearDamping: f(cfg.dragPerSec * (this.dragMul[i] ?? 1)),
          collideGroup: 1,
        }),
      );
    }
    for (let i = 0; i < n; i += 1) {
      this.springIds.push(this.world.addSpring(slotIds[i] ?? 0, bristleIds[i] ?? 0, { restLength: 0, stiffness: k, damping: c }));
    }
    this.slotIds = slotIds;
    this.world.readState(this.buf);
    for (let i = 0; i < n; i += 1) {
      const o = (n + i) * BODY_STATE_STRIDE;
      this.curX[i] = this.buf[o] ?? 0;
      this.curY[i] = this.buf[o + 1] ?? 0;
      this.prevX[i] = this.curX[i] ?? 0;
      this.prevY[i] = this.curY[i] ?? 0;
    }
    this.lastPressure = p;
    this.lastSpread = r0;
  }

  /**
   * 포인터가 시각 `tMs`에 (x, y), 압력 `pressure`로 왔다. 직전 지점→이 지점의 시각 보간 목표로 `tMs`까지의 모든 고정 틱을 적분하고
   * 틱마다 `sink.onTick`을 부른다. `azimuthDirX/Y`가 주어지면(길이가 0이 아닌 방향 벡터) 속도 대신 그 방향으로 붓을 돌린다.
   * 시각이 거꾸로 가거나 같으면 적분하지 않고 지점만 갱신한다. 적분한 틱 수를 돌려준다.
   */
  advance(x: number, y: number, tMs: number, pressure: number, sink: BristleTickSink, azimuthDirX = 0, azimuthDirY = 0): number {
    this.requireStarted();
    assertFinite("advance", x, y, tMs, pressure);
    const p1 = clamp01(pressure);
    const span = tMs - this.knotT;
    let ran = 0;
    // 따라잡기 상한: 대기 중인 틱이 너무 많으면 앞부분을 건너뛴다.
    const pending = Math.floor((tMs + 1e-9 - this.t0) / PEN_SPRING_SUBSTEP_MS) - this.ticks;
    const maxTicks = Math.max(1, Math.floor(this.config.maxCatchUpMs / PEN_SPRING_SUBSTEP_MS));
    if (pending > maxTicks) {
      const skip = pending - maxTicks;
      this.ticks += skip;
      this.diagnostics.droppedTicks += skip;
      // 건너뛴 구간의 손잡이는 그 구간 끝의 목표에 이미 도달한 것으로 본다(속도 0). 털은 스프링이 끌어당긴다.
      const tSkip = this.t0 + this.ticks * PEN_SPRING_SUBSTEP_MS;
      const fr = span > 0 ? clamp01((tSkip - this.knotT) / span) : 1;
      this.handle?.reset(f(this.knotX + (x - this.knotX) * fr), f(this.knotY + (y - this.knotY) * fr));
    }
    for (;;) {
      const next = this.t0 + (this.ticks + 1) * PEN_SPRING_SUBSTEP_MS;
      if (next > tMs + 1e-9) break;
      this.ticks += 1;
      const fr = span > 0 ? clamp01((next - this.knotT) / span) : 1;
      const tx = f(this.knotX + (x - this.knotX) * fr);
      const ty = f(this.knotY + (y - this.knotY) * fr);
      const pr = f(this.knotP + (p1 - this.knotP) * fr);
      this.tick(tx, ty, pr, azimuthDirX, azimuthDirY, sink);
      ran += 1;
    }
    this.knotT = tMs;
    this.knotX = x;
    this.knotY = y;
    this.knotP = p1;
    return ran;
  }

  /**
   * 획 끝 정착: 포인터를 마지막 지점에 고정한 채 손잡이와 털이 멈출 때까지(최대 `maxMs`) 틱을 돌린다.
   * 멈춘 털은 움직이지 않으므로 싱크가 이동 거리로 dab를 만드는 경우 정착 구간에서는 거의 아무것도 찍히지 않는다.
   */
  settle(sink: BristleTickSink, maxMs: number): number {
    this.requireStarted();
    const maxTicks = Math.max(0, Math.round(maxMs / PEN_SPRING_SUBSTEP_MS));
    let ran = 0;
    for (let i = 0; i < maxTicks; i += 1) {
      const h = this.handle;
      if (h && h.isAtRest(this.knotX, this.knotY) && this.maxTipSpeed() < 1) break;
      this.ticks += 1;
      this.tick(this.knotX, this.knotY, this.knotP, 0, 0, sink);
      ran += 1;
    }
    return ran;
  }

  /** 월드 구현의 진단 카운터. */
  worldDiagnostics(): Readonly<Record<string, number>> {
    return this.world.diagnostics();
  }

  /** 월드를 해제한다. */
  dispose(): void {
    this.world.dispose();
  }

  /** 마지막 틱의 털 최대 속력(px/s). */
  maxTipSpeed(): number {
    const n = this.count;
    let m = 0;
    for (let i = 0; i < n; i += 1) {
      const o = (n + i) * BODY_STATE_STRIDE;
      const vx = this.buf[o + 2] ?? 0;
      const vy = this.buf[o + 3] ?? 0;
      const s = Math.sqrt(vx * vx + vy * vy);
      if (s > m) m = s;
    }
    return m;
  }

  private tick(targetX: number, targetY: number, pressure: number, azX: number, azY: number, sink: BristleTickSink): void {
    const cfg = this.config;
    const handle = this.handle;
    if (!handle) throw new Error("BristleBrush2D: begin 전에 호출됐다");
    const n = this.count;
    handle.step(PEN_SPRING_SUBSTEP_SEC, targetX, targetY);
    this.updateHeading(handle.vx, handle.vy, azX, azY);
    const level = this.stiffnessLevelFor(pressure);
    if (level !== this.level) {
      this.level = level;
      const { k, c } = this.springConstants(level);
      for (let i = 0; i < n; i += 1) this.world.setSpring(this.springIds[i] ?? 0, { restLength: 0, stiffness: k, damping: c });
      this.diagnostics.stiffnessUpdates += 1;
    }
    const r = f(cfg.radiusPx * cfg.spreadCurve.eval(pressure));
    for (let i = 0; i < n; i += 1) {
      this.world.setKinematicTarget(this.slotIds[i] ?? 0, f(handle.x + this.slotOffsetX(i, r)), f(handle.y + this.slotOffsetY(i, r)));
    }
    if (cfg.coulombPxPerSec2 > 0) this.applyCoulomb();
    this.world.step(PEN_SPRING_SUBSTEP_SEC);
    this.world.readState(this.buf);
    for (let i = 0; i < n; i += 1) {
      const o = (n + i) * BODY_STATE_STRIDE;
      const px = this.curX[i] ?? 0;
      const py = this.curY[i] ?? 0;
      this.prevX[i] = px;
      this.prevY[i] = py;
      const cx = this.buf[o] ?? 0;
      const cy = this.buf[o + 1] ?? 0;
      this.curX[i] = cx;
      this.curY[i] = cy;
      const dx = cx - px;
      const dy = cy - py;
      const d = f(Math.sqrt(f(dx * dx + dy * dy)));
      this.moved[i] = d;
      const len = f(cfg.loadDecayPx * (this.lenMul[i] ?? 1));
      this.loadValue[i] = f((this.loadValue[i] ?? 0) / f(1 + f(d / len)));
    }
    this.lastPressure = pressure;
    this.lastSpread = r;
    const tick: BristleTick = {
      count: n,
      prevX: this.prevX,
      prevY: this.prevY,
      curX: this.curX,
      curY: this.curY,
      load: this.loadValue,
      moved: this.moved,
      pressure,
      tMs: this.simTimeMs,
      handleX: handle.x,
      handleY: handle.y,
      spreadRadiusPx: r,
    };
    this.diagnostics.ticks += 1;
    sink.onTick(tick);
  }

  /** 방향 단위 벡터를 일차 지연으로 따라가게 한다(삼각함수 없음). */
  private updateHeading(vx: number, vy: number, azX: number, azY: number): void {
    const cfg = this.config;
    let tx: number;
    let ty: number;
    const azLen2 = azX * azX + azY * azY;
    // 방위각 벡터가 비유한(Infinity·NaN, 제곱합 넘침)이면 그 입력은 무시하고 속도 방향으로 되돌아간다
    // (그대로 정규화하면 Infinity·0 = NaN이 방향에 굳어 이후 모든 틱이 던진다).
    if (azLen2 > 1e-12 && Number.isFinite(azLen2)) {
      const inv = 1 / Math.sqrt(azLen2);
      tx = azX * inv;
      ty = azY * inv;
    } else {
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed < cfg.headingMinSpeedPxPerSec || speed < 1e-6) return;
      tx = vx / speed;
      ty = vy / speed;
    }
    if (!this.headingSet) {
      // 첫 유효 방향은 바로 받아들인다(기본 방향 (1, 0)에서 반대쪽으로 천천히 돌며 길이가 0을 지나는 일을 막는다).
      this.headX = f(tx);
      this.headY = f(ty);
      this.baseX = this.headX;
      this.baseY = this.headY;
      this.headingSet = true;
      return;
    }
    const alpha = PEN_SPRING_SUBSTEP_MS / (cfg.headingTauMs + PEN_SPRING_SUBSTEP_MS);
    let nx = this.headX + alpha * (tx - this.headX);
    let ny = this.headY + alpha * (ty - this.headY);
    const len2 = nx * nx + ny * ny;
    if (len2 < 1e-6) {
      // 반대 방향으로 급선회해 합이 0에 가까우면 목표 방향으로 바로 돌린다(NaN 방지).
      nx = tx;
      ny = ty;
    } else {
      const inv = 1 / Math.sqrt(len2);
      nx *= inv;
      ny *= inv;
    }
    this.headX = f(nx);
    this.headY = f(ny);
  }

  /** 붓 회전(복소수 곱): 현재 방향 × 기준 방향의 켤레. 방향이 정해지기 전과 처음 정해진 순간에는 항등이다. */
  private rotX(): number {
    return f(this.headX * this.baseX + this.headY * this.baseY);
  }

  private rotY(): number {
    return f(this.headY * this.baseX - this.headX * this.baseY);
  }

  private slotOffsetX(i: number, radius: number): number {
    return f(radius * f(f((this.ux[i] ?? 0) * this.rotX()) - f((this.uy[i] ?? 0) * this.rotY())));
  }

  private slotOffsetY(i: number, radius: number): number {
    return f(radius * f(f((this.ux[i] ?? 0) * this.rotY()) + f((this.uy[i] ?? 0) * this.rotX())));
  }

  private stiffnessLevelFor(pressure: number): number {
    const levels = this.config.stiffnessLevels;
    if (levels <= 1) return 0;
    const q = Math.round(clamp01(pressure) * (levels - 1));
    return q;
  }

  /** 단계 → 스프링 상수. 단계의 대표 압력에서 강성 배율을 읽는다. */
  private springConstants(level: number): { k: number; c: number } {
    const cfg = this.config;
    const levels = cfg.stiffnessLevels;
    const pRep = levels <= 1 ? 0 : level / (levels - 1);
    const mul = Math.max(0.05, cfg.stiffnessCurve.eval(pRep));
    const w = f(2 * Math.PI * cfg.fnHz);
    const k = f(f(cfg.mass * f(w * w)) * mul);
    const c = f(2 * cfg.relZeta * Math.sqrt(f(k * cfg.mass)));
    return { k, c };
  }

  /** 쿨롱 마찰: 속도 반대 방향의 일정 크기 힘. 한 틱에 속도를 뒤집지 않도록 m·|v|/dt로 제한한다. */
  private applyCoulomb(): void {
    const cfg = this.config;
    const n = this.count;
    const maxByVel = cfg.mass / PEN_SPRING_SUBSTEP_SEC;
    for (let i = 0; i < n; i += 1) {
      const o = (n + i) * BODY_STATE_STRIDE;
      const vx = this.buf[o + 2] ?? 0;
      const vy = this.buf[o + 3] ?? 0;
      const s = Math.sqrt(vx * vx + vy * vy);
      if (s < 1e-6) continue;
      const mag = Math.min(cfg.mass * cfg.coulombPxPerSec2, s * maxByVel);
      this.world.applyForce(n + i, f(-(vx / s) * mag), f(-(vy / s) * mag));
    }
  }

  private requireStarted(): void {
    if (!this.started) throw new Error("BristleBrush2D: begin 전에 호출됐다");
  }

  /** 획 시작 직후(틱 전) 상태를 틱 모양으로 돌려준다: 탭 한 번에 점을 찍는 싱크가 쓴다(prev = cur). */
  snapshot(pressure: number): BristleTick {
    this.requireStarted();
    const handle = this.handle;
    return {
      count: this.count,
      prevX: this.curX,
      prevY: this.curY,
      curX: this.curX,
      curY: this.curY,
      load: this.loadValue,
      moved: this.moved,
      pressure: clamp01(pressure),
      tMs: this.simTimeMs,
      handleX: handle?.x ?? 0,
      handleY: handle?.y ?? 0,
      spreadRadiusPx: this.lastSpread,
    };
  }

  /** 마지막 압력과 그때의 슬롯 반경(진단용). */
  lastState(): { pressure: number; spreadRadiusPx: number } {
    return { pressure: this.lastPressure, spreadRadiusPx: this.lastSpread };
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function assertFinite(op: string, ...values: number[]): void {
  for (const v of values) {
    if (!Number.isFinite(v)) throw new RangeError(`BristleBrush2D.${op}: 유한하지 않은 값이 들어왔다(${values.join(", ")})`);
  }
}

