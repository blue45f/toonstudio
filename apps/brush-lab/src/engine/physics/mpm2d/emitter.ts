/**
 * 펜 → 물감 입자 방출기(결정적). 펜 경로를 따라 일정 거리마다 폭 방향으로 한 행의 입자를 주입한다.
 *
 * - 압력 → 양: 행의 폭이 `widthAtPressure(압력)`이라 압력이 셀수록 한 행의 입자 수가 늘어난다(기본 곡선은 `pressureWidth`의 √압력).
 * - 펜 속도 → 초기 속도: 입자는 `velocityGain × 펜 속도`로 태어난다(1이면 펜과 같은 속도 — 음속을 넘으면 붕괴하므로 작게 둔다).
 * - 표본 시각으로 시뮬레이션을 진행: 각 행을 주입하기 직전에 `Mpm2D.advanceTo(행의 시각)`를 불러 입자가 실제 시간에 맞춰 흐른다.
 * - 지터는 시드 `Pcg32`만 쓴다(`Math.random` 없음). 같은 시드·같은 표본이면 같은 입자가 같은 순서로 주입된다.
 *
 * 첫 표본은 진행 방향을 모르므로 둘째 표본이 올 때 시작 행을 낸다. 표본이 하나뿐인 획(탭)은 `finish`가 원판을 낸다.
 * 둥근 붓처럼 보이도록 시작·끝에는 반원 마개를, 방향이 급히 꺾이는 곳에는 바깥쪽 부채꼴을 채운다(수직 행만 놓으면 모서리 바깥이 비는 홈이 생긴다).
 */
import { Pcg32 } from "../../core/rng";
import { detCos, detSin } from "../../wet/det-math";

import type { Mpm2D } from "./solver";

export interface EmitterConfig {
  /** 행 사이 경로 거리(px). */
  rowSpacingPx: number;
  /** 폭 방향 입자 간격(px). */
  acrossSpacingPx: number;
  /** 압력(0..1) → 획 폭(px). 유한한 양수를 돌려줘야 한다(생성 때 0..1을 훑어 검사한다). */
  widthAtPressure: (pressure: number) => number;
  /** 펜 속도 → 입자 초기 속도 배율. */
  velocityGain: number;
  /** 입자 초기 체적비 J(1 미만 = 과압축, 젖은 하중이 번지는 구동원). */
  initialJ: number;
  /** 입자 위치 지터(간격 대비 0..1). */
  jitter: number;
  /** 입자 농도 t(0..1). */
  conc: number;
}

/** 기본 압력 → 폭 곡선: 압력 0은 `minPx`, 압력 1은 `maxPx`, 사이는 √압력(가벼운 압력에도 폭이 빨리 자란다). */
export function pressureWidth(minPx: number, maxPx: number): (pressure: number) => number {
  if (!(minPx > 0) || !(maxPx >= minPx)) throw new RangeError("pressureWidth: 0 < minPx ≤ maxPx여야 한다");
  return (pressure) => {
    const p = pressure > 0 ? (pressure < 1 ? pressure : 1) : 0;
    return minPx + (maxPx - minPx) * Math.sqrt(p);
  };
}

export interface EmitterPoint {
  x: number;
  y: number;
  tMs: number;
  /** 0..1. */
  pressure: number;
}

export interface EmitterStats {
  /** 낸 행 수(원판은 1로 센다). */
  rows: number;
  /** 주입을 요청한 입자 수(성공 + 거절). */
  requested: number;
  /** 영역(+도달 거리) 밖이라 계산하지 않은 방출 행 수. 그 행의 입자는 어차피 모두 영역 밖이라 만들어지지 않는다(`rejectedOutside`로는 세지 않는다). */
  rowsCulled: number;
}

/** 행과 행 사이 진행 방향이 이보다(코사인) 더 꺾이면 바깥쪽 부채꼴을 채운다(약 12도). */
const FAN_COS = 0.978;
/** 두 방향이 이보다(코사인) 벌어지면 가운데 방향을 끼워 둘로 나눈다(보간이 퇴화하지 않게). */
const SPLIT_COS = 0.3;

/** 시드 분기용 스트림 번호(다른 모듈의 Pcg32와 겹치지 않게 고정). */
const EMITTER_STREAM = 0x4d50;

export class PaintEmitter {
  private readonly cfg: EmitterConfig;
  private rng = new Pcg32(0, EMITTER_STREAM);
  private first: EmitterPoint | null = null;
  private prev: EmitterPoint | null = null;
  /** 직전 행 이후 쌓인 경로 거리(px). */
  private carry = 0;
  /** 마지막으로 낸 행의 진행 방향(없으면 아직 행이 없다). */
  private lastTx = 0;
  private lastTy = 0;
  private hasDir = false;
  private rowCount = 0;
  private requestedCount = 0;
  private culledRows = 0;
  /** 행 하나의 입자가 닿을 수 있는 최대 거리(px): 최대 폭 + 여유. 이 밖의 행은 영역 안에 입자를 만들 수 없다. */
  private readonly reachPx: number;

  constructor(config: EmitterConfig) {
    const c = config;
    const ok = c.rowSpacingPx > 0 && c.acrossSpacingPx > 0 && Number.isFinite(c.velocityGain + c.initialJ + c.jitter + c.conc);
    if (!ok) throw new RangeError("PaintEmitter: 방출 설정이 올바르지 않다(간격은 양수, 나머지는 유한)");
    let maxWidth = 0;
    for (let k = 0; k <= 10; k += 1) {
      const w = c.widthAtPressure(k / 10);
      if (!Number.isFinite(w) || w <= 0) throw new RangeError(`PaintEmitter: widthAtPressure(${k / 10}) = ${w}는 유한한 양수가 아니다`);
      if (w > maxWidth) maxWidth = w;
    }
    this.reachPx = maxWidth + 2 * c.acrossSpacingPx + 2 * c.rowSpacingPx;
    this.cfg = { ...config };
  }

  /** 새 획을 시작한다(시드로 난수열을 다시 만든다). */
  begin(seed: number): void {
    this.rng = new Pcg32(seed, EMITTER_STREAM);
    this.first = null;
    this.prev = null;
    this.carry = 0;
    this.hasDir = false;
    this.rowCount = 0;
    this.requestedCount = 0;
    this.culledRows = 0;
  }

  stats(): EmitterStats {
    return { rows: this.rowCount, requested: this.requestedCount, rowsCulled: this.culledRows };
  }

  /**
   * 표본 하나를 받아 이전 표본과의 선분 위에 행을 주입하고 시뮬레이션을 진행한다.
   * 입력은 호출자가 유한함을 보장한다(레인이 먼저 검사한다).
   */
  push(sim: Mpm2D, p: EmitterPoint): void {
    const prev = this.prev;
    if (!prev) {
      sim.startClock(p.tMs);
      this.first = p;
      this.prev = p;
      return;
    }
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const dtS = (p.tMs - prev.tMs) / 1000;
    if (len > 1e-9) {
      const tx = dx / len;
      const ty = dy / len;
      // 시각이 거의 같은 표본 쌍은 속도를 알 수 없으므로 0으로 둔다(순간이동 속도를 입자에 주지 않는다).
      const speed = dtS > 1e-4 ? len / dtS : 0;
      const first = this.first;
      if (first) {
        // 시작 행: 진행 방향이 정해진 지금 낸다.
        this.emitRow(sim, first.x, first.y, first.tMs, first.pressure, tx, ty, speed);
        this.first = null;
      }
      const rs = this.cfg.rowSpacingPx;
      // 영역(+도달 거리) 밖 구간의 행은 입자가 하나도 만들어지지 않으므로 계산하지 않는다(멀리 벗어난 선분이 행 수만큼 일하는 것을 막는다).
      // 보이는 구간의 행 위치는 예전과 같은 누적 덧셈이라 비트 동일하다. 보이는 구간까지가 아주 멀 때만(4096행 초과) 곱셈으로 건너뛴다.
      const [visLo, visHi] = this.visibleSpan(sim, prev.x, prev.y, tx, ty, len);
      let s = rs - this.carry;
      while (s <= len) {
        if (s < visLo) {
          const ahead = Math.floor((visLo - s) / rs);
          if (ahead > 4096) {
            s += ahead * rs;
            this.culledRows += ahead;
            continue;
          }
          this.culledRows += 1;
        } else if (s > visHi) {
          const rest = Math.floor((len - s) / rs) + 1;
          this.culledRows += rest;
          s += rest * rs;
          break;
        } else {
          const f = s / len;
          this.emitRow(
            sim,
            prev.x + dx * f,
            prev.y + dy * f,
            prev.tMs + (p.tMs - prev.tMs) * f,
            prev.pressure + (p.pressure - prev.pressure) * f,
            tx,
            ty,
            speed,
          );
        }
        s += rs;
      }
      this.carry = len - (s - rs);
    }
    sim.advanceTo(p.tMs);
    this.prev = p;
  }

  /** 획 끝. 표본이 하나뿐이면(탭) 원판을 낸다. 마지막 표본 시각까지는 `push`가 이미 진행했다. */
  finish(sim: Mpm2D): void {
    const first = this.first;
    if (first) {
      this.first = null;
      sim.advanceTo(first.tMs);
      this.emitDisc(sim, first);
      return;
    }
    const prev = this.prev;
    if (prev && this.hasDir) {
      // 끝 마개: 진행 방향 앞쪽 반원.
      const tx = this.lastTx;
      const ty = this.lastTy;
      this.emitCap(sim, prev.x, prev.y, prev.pressure, tx, ty, 1);
    }
  }

  /** 선분(prev에서 방향 t로 길이 len) 위에서 영역을 도달 거리만큼 넓힌 상자 안에 드는 거리 구간 [lo, hi]. 비면 lo > hi. */
  private visibleSpan(sim: Mpm2D, x0: number, y0: number, tx: number, ty: number, len: number): [number, number] {
    const r = this.reachPx;
    let lo = 0;
    let hi = len;
    const axes: [number, number, number][] = [
      [x0, tx, sim.params.widthPx],
      [y0, ty, sim.params.heightPx],
    ];
    for (const [origin, dir, extent] of axes) {
      const min = -r - origin;
      const max = extent + r - origin;
      if (Math.abs(dir) < 1e-12) {
        if (min > 0 || max < 0) return [1, 0];
        continue;
      }
      const a = min / dir;
      const b = max / dir;
      const near = a < b ? a : b;
      const far = a < b ? b : a;
      if (near > lo) lo = near;
      if (far < hi) hi = far;
    }
    return lo <= hi ? [lo, hi] : [1, 0];
  }

  private widthAt(pressure: number): number {
    const p = pressure > 0 ? (pressure < 1 ? pressure : 1) : 0;
    return this.cfg.widthAtPressure(p);
  }

  private inject(sim: Mpm2D, x: number, y: number, vx: number, vy: number): void {
    this.requestedCount += 1;
    sim.inject(x, y, vx, vy, this.cfg.conc, this.cfg.initialJ);
  }

  private emitRow(
    sim: Mpm2D,
    x: number,
    y: number,
    tMs: number,
    pressure: number,
    tx: number,
    ty: number,
    speed: number,
  ): void {
    sim.advanceTo(tMs);
    const vx = tx * speed * this.cfg.velocityGain;
    const vy = ty * speed * this.cfg.velocityGain;
    if (!this.hasDir) {
      // 시작 마개: 진행 방향 뒤쪽 반원.
      this.emitCap(sim, x, y, pressure, tx, ty, -1);
    } else {
      const dot = this.lastTx * tx + this.lastTy * ty;
      if (dot < FAN_COS) {
        // 급한 꺾임: 이전 행과 이번 행 사이 바깥쪽 부채꼴. 좌회전(cross > 0)이면 바깥은 오른쪽(−법선)이다.
        const cross = this.lastTx * ty - this.lastTy * tx;
        const side = cross > 0 ? -1 : 1;
        const ax = side * -this.lastTy;
        const ay = side * this.lastTx;
        const bx = side * -ty;
        const by = side * tx;
        this.emitSector(sim, x, y, pressure, ax, ay, bx, by, tx, ty, vx, vy);
      }
    }
    const nx = -ty;
    const ny = tx;
    const width = this.widthAt(pressure);
    const n = Math.max(1, Math.round(width / this.cfg.acrossSpacingPx));
    const jit = this.cfg.jitter;
    for (let k = 0; k < n; k += 1) {
      const base = n === 1 ? 0 : (k / (n - 1) - 0.5) * width;
      const across = base + (this.rng.nextF32() - 0.5) * jit * this.cfg.acrossSpacingPx;
      const along = (this.rng.nextF32() - 0.5) * jit * this.cfg.rowSpacingPx;
      this.inject(sim, x + nx * across + tx * along, y + ny * across + ty * along, vx, vy);
    }
    this.lastTx = tx;
    this.lastTy = ty;
    this.hasDir = true;
    this.rowCount += 1;
  }

  /**
   * 반원 마개: 진행 방향(tx, ty)의 `dir`쪽(+1 앞, −1 뒤)으로 −법선 → 접선 → +법선(또는 반대 순서)을 잇는 두 부채꼴.
   * 행의 양끝 입자(±폭/2)와 이어지도록 반경은 폭/2까지다.
   */
  private emitCap(sim: Mpm2D, x: number, y: number, pressure: number, tx: number, ty: number, dir: 1 | -1): void {
    const nx = -ty;
    const ny = tx;
    const mx = dir * tx;
    const my = dir * ty;
    // 마개 입자는 정지 상태로 태어난다(획 속도는 행 입자가 이미 싣고 있다).
    this.emitSector(sim, x, y, pressure, nx, ny, mx, my, mx, my, 0, 0);
    this.emitSector(sim, x, y, pressure, mx, my, -nx, -ny, mx, my, 0, 0);
  }

  /**
   * (x, y)를 중심으로 방향 a에서 b까지(≤180도 미만의 짧은 쪽)를 폭/2 반경까지 극좌표로 채운다.
   * 두 방향이 많이 벌어지면 가운데 방향(a + b, 퇴화하면 `mid`)을 끼워 둘로 나눈다. 행의 입자와 겹치지 않게 각도는 칸의 가운데 값이다.
   */
  private emitSector(
    sim: Mpm2D,
    x: number,
    y: number,
    pressure: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    midX: number,
    midY: number,
    vx: number,
    vy: number,
  ): void {
    const dot = ax * bx + ay * by;
    if (dot < SPLIT_COS) {
      let cx = ax + bx;
      let cy = ay + by;
      const len = Math.sqrt(cx * cx + cy * cy);
      if (len < 1e-6) {
        cx = midX;
        cy = midY;
      } else {
        cx /= len;
        cy /= len;
      }
      this.emitSector(sim, x, y, pressure, ax, ay, cx, cy, midX, midY, vx, vy);
      this.emitSector(sim, x, y, pressure, cx, cy, bx, by, midX, midY, vx, vy);
      return;
    }
    // 각도 추정(사칙·sqrt만): 코사인이 0 이상이면 √(2(1 − cos))로 충분하다(≤ 약 72도).
    const angle = Math.sqrt(2 * (1 - (dot > 1 ? 1 : dot)));
    const step = this.cfg.acrossSpacingPx;
    const half = this.widthAt(pressure) * 0.5;
    const jit = this.cfg.jitter;
    for (let r = step; r <= half; r += step) {
      const m = Math.max(1, Math.round((r * angle) / step));
      for (let j = 0; j < m; j += 1) {
        const sj = (j + 0.5 + (this.rng.nextF32() - 0.5) * jit) / m;
        let dx = ax * (1 - sj) + bx * sj;
        let dy = ay * (1 - sj) + by * sj;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1e-9) continue;
        dx /= len;
        dy /= len;
        const rr = r + (this.rng.nextF32() - 0.5) * jit * step;
        this.inject(sim, x + dx * rr, y + dy * rr, vx, vy);
      }
    }
  }

  private emitDisc(sim: Mpm2D, p: EmitterPoint): void {
    const radius = this.widthAt(p.pressure) * 0.5;
    const step = this.cfg.acrossSpacingPx;
    this.inject(sim, p.x, p.y, 0, 0);
    for (let r = step; r <= radius; r += step) {
      const n = Math.max(6, Math.round((2 * Math.PI * r) / step));
      const phase = this.rng.nextF32() * 2 * Math.PI;
      for (let k = 0; k < n; k += 1) {
        const a = phase + (2 * Math.PI * k) / n;
        this.inject(sim, p.x + r * detCos(a), p.y + r * detSin(a), 0, 0);
      }
    }
    this.rowCount += 1;
  }
}
