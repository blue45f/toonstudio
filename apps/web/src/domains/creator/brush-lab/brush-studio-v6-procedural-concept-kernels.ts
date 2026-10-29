import { clamp, hash01, ProceduralPointHistory, TAU, unit, type ProceduralEnv, type ProceduralKernel } from "./brush-studio-v6-procedural-kit";
import type { BrushStudioV6ProceduralModel } from "./brush-studio-v6-procedural-family-catalog";

/**
 * 공개 매뉴얼 개념 재구현 커널: 해칭·격자 칸·지난 점 곡선·입자 스프레이.
 *
 * Krita(GPL)의 소스는 열람하지 않았다(ADR-0026 §D). Krita 사용자 매뉴얼이 설명하는 브러시 엔진의 개념 —
 * 해칭(붓 범위 안의 평행선, 각도·간격·두께, 교차 해칭 단계), 그리드(문서 격자 칸을 도형으로 채움), 커브(지난 점과 잇는 곡선),
 * 스프레이(균일·가우시안 분포 입자, 크기·회전 무작위) — 만 가져와 이 저장소의 결정성 계약(거리 시계·정수 해시·고정 상태)으로
 * 새로 설계했다. 수치와 구조는 모두 이 파일에서 정했다.
 */
export type ConceptModel = Exclude<BrushStudioV6ProceduralModel, `harmony-${string}` | `klecks-${string}`>;

/** 해칭 각도(0..1)를 [0.08π, 0.92π]로 옮긴다. 0 과 1 이 같은 평행선족(0°≡180°)이 되지 않게 끝을 비운다. */
export function brushStudioV6HatchingAngle(control: number): number {
  return Math.PI * (0.08 + 0.84 * unit(control));
}
/** 문서 고정 해칭 간격(px). 필압과 무관해야 덥끼리 같은 선 위에 놓인다. */
export function brushStudioV6HatchingSeparation(size: number, patternScale: number): number {
  return Math.max(1.2, size * 0.16 * clamp(patternScale, 0.1, 4));
}
/** 문서 고정 격자 칸 크기(px). */
export function brushStudioV6CellGridSize(size: number, patternScale: number): number {
  return Math.max(2, size * (0.13 + 0.32 * clamp(patternScale, 0.1, 4)));
}

/** 곡선별 지연 비율: 가장 긴 곡선 L, 0.62L, 0.38L. */
const CURVE_LAGS = [1, 0.62, 0.38] as const;
/** 교차 해칭 층 각도: 기본 → 직교 → +45° → −45°. */
const HATCH_LAYERS = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4] as const;

function hatching(env: ProceduralEnv): ProceduralKernel {
  const base = brushStudioV6HatchingAngle(env.t.patternJitter);
  const separation = brushStudioV6HatchingSeparation(env.size, env.t.patternScale);
  const layers = 1 + Math.round(unit(env.t.patternDensity) * 3), thickness = 0.35 + 1.3 * unit(env.t.relief);
  const cap = 64, perLayer = Math.floor(cap / layers);
  return {
    maxPrimitivesPerDab: perLayer * layers, retainedStateBytes: 16, reset: () => undefined,
    deposit(c, sink) {
      const pressure = unit(c.pressure), radius = Math.max(0.5, c.radius);
      const half = clamp(env.size * 0.012 * thickness * (0.55 + 0.45 * pressure), 0.15, 4);
      // 겹치는 덥이 같은 선을 다시 긋는 만큼 농도를 간격 비례로 낮춰, 지나간 거리당 진하기가 간격 설정과 무관하게 한다.
      const alpha = clamp(1.6 * env.step / (2 * radius), 0.06, 1) * 0.9;
      for (let layer = 0; layer < layers; layer++) {
        // 교차 층은 필압이 일정 이상일 때만 드러난다(눌러 그을수록 해칭이 겹친다).
        if (layer > 0 && pressure < 0.12 + 0.18 * (layer - 1)) break;
        const angle = base + HATCH_LAYERS[layer], ux = Math.cos(angle), uy = Math.sin(angle), nx = -uy, ny = ux;
        const offset = c.x * nx + c.y * ny;
        const first = Math.ceil((offset - radius) / separation), last = Math.floor((offset + radius) / separation);
        const center = Math.round(offset / separation);
        // 붓 중심에서 가까운 선부터 낸다. 층별 상한을 넘으면 가장자리 선을 버린다.
        for (let n = 0, emitted = 0; emitted < perLayer && n <= (last - first) * 2 + 2; n++) {
          const line = center + (n % 2 === 0 ? n / 2 : -(n + 1) / 2);
          if (line < first || line > last) continue;
          const distance = line * separation - offset, chord = Math.sqrt(Math.max(0, radius * radius - distance * distance));
          if (chord < 0.25) continue;
          const px = c.x + nx * distance, py = c.y + ny * distance;
          sink.bounded(px - ux * chord, py - uy * chord, px + ux * chord, py + uy * chord, half, alpha, 0.75 * layer / layers);
          emitted++;
        }
      }
    },
  };
}

function cellGrid(env: ProceduralEnv): ProceduralKernel {
  const cell = brushStudioV6CellGridSize(env.size, env.t.patternScale);
  const fill = 0.25 + 0.7 * unit(env.t.patternDensity), jitter = unit(env.t.patternJitter), seed = env.seed;
  const kind = unit(env.t.relief) < 1 / 3 ? "dot" : unit(env.t.relief) < 2 / 3 ? "ring" : "slash";
  // 최근 칠한 칸 96개를 기억해 같은 칸을 덥마다 다시 칠하지 않는다(칸마다 한 번씩 또렷하게).
  const recent = new Int32Array(96 * 2);
  let filled = 0, head = 0;
  const seen = (ix: number, iy: number): boolean => {
    for (let i = 0; i < filled; i++) if (recent[i * 2] === ix && recent[i * 2 + 1] === iy) return true;
    return false;
  };
  const remember = (ix: number, iy: number): void => {
    recent[head * 2] = ix; recent[head * 2 + 1] = iy;
    head = (head + 1) % 96; filled = Math.min(96, filled + 1);
  };
  const cap = 48;
  const candidates: { ix: number; iy: number; d: number }[] = [];
  return {
    maxPrimitivesPerDab: cap, retainedStateBytes: recent.byteLength + 16,
    reset() { recent.fill(0); filled = 0; head = 0; },
    deposit(c, sink) {
      const pressure = unit(c.pressure), radius = env.size * 0.5 * (0.35 + 0.65 * pressure);
      const x0 = Math.floor((c.x - radius) / cell), x1 = Math.floor((c.x + radius) / cell);
      const y0 = Math.floor((c.y - radius) / cell), y1 = Math.floor((c.y + radius) / cell);
      const ownX = Math.floor(c.x / cell), ownY = Math.floor(c.y / cell);
      candidates.length = 0;
      for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
        const d = Math.hypot((ix + 0.5) * cell - c.x, (iy + 0.5) * cell - c.y);
        // 중심이 붓 반경 안에 든 칸, 그리고 펜이 올라간 칸은 항상 대상이다.
        if (d <= radius || (ix === ownX && iy === ownY)) candidates.push({ ix, iy, d });
      }
      candidates.sort((a, b) => a.d - b.d || a.iy - b.iy || a.ix - b.ix);
      for (const { ix, iy } of candidates) {
        if (sink.full()) break;
        if (seen(ix, iy)) continue;
        remember(ix, iy);
        const h1 = hash01(ix, iy, seed ^ 0x6c11), h2 = hash01(iy, ix, seed ^ 0x6c12), h3 = hash01(ix + iy * 7919, 3, seed ^ 0x6c13);
        const cx = (ix + 0.5 + (h1 - 0.5) * jitter * 0.5) * cell, cy = (iy + 0.5 + (h2 - 0.5) * jitter * 0.5) * cell;
        const r = cell * fill * 0.5 * (1 - jitter * 0.5 * h3);
        const mix = 0.85 * hash01(ix, iy, seed ^ 0x6c14);
        if (kind === "slash") {
          const angle = Math.PI / 4 * (h1 < 0.5 || jitter < 0.5 ? 1 : 3);
          sink.shape(cx, cy, r * 1.35, Math.max(0.2, cell * 0.06), angle, 0.9, mix, "capsule");
        } else sink.shape(cx, cy, r, r, 0, 0.9, mix, kind === "ring" ? "ring" : "ellipse");
      }
    },
  };
}

function curveTrail(env: ProceduralEnv): ProceduralKernel {
  const history = new ProceduralPointHistory(64);
  const lag = Math.round(clamp(2 + env.t.patternScale * 10, 2, 63));
  const curves = 1 + Math.round(unit(env.t.patternDensity) * 2), bend = unit(env.t.patternJitter), seed = env.seed;
  const segments = 8, maxChord = env.size * 12;
  let hasPrevious = false, previousX = 0, previousY = 0;
  return {
    maxPrimitivesPerDab: 1 + curves * segments, retainedStateBytes: history.bytes + 32,
    reset() { history.reset(); hasPrevious = false; },
    deposit(c, sink) {
      const pressure = unit(c.pressure), thin = clamp(env.size * 0.014 * (0.45 + 0.55 * pressure), 0.16, 1.8);
      if (hasPrevious) sink.line(previousX, previousY, c.x, c.y, thin * 1.2, 0.5, 0);
      for (let curve = 0; curve < curves; curve++) {
        // 곡선마다 다른 지연(길이)으로 지난 점과 잇는다: L, 0.62L, 0.38L.
        const reachBack = Math.max(2, Math.round(lag * CURVE_LAGS[curve]));
        if (history.length < reachBack) continue;
        const end = history.slot(reachBack - 1), middle = history.slot(Math.floor((reachBack - 1) / 2));
        const qx = history.x[end], qy = history.y[end], mx = history.x[middle], my = history.y[middle];
        const chord = Math.hypot(qx - c.x, qy - c.y);
        if (chord < 0.5 || chord > maxChord) continue;
        // t=0.5 에서 실제 지난 경로의 중간 점을 지나는 이차 곡선. 휨만큼 법선 쪽으로 더 부풀린다.
        const nx = -(qy - c.y) / chord, ny = (qx - c.x) / chord;
        const swell = (hash01(c.index, curve, seed ^ 0x2c0e) - 0.5) * bend * chord * 1.1;
        const kx = 2 * mx - (c.x + qx) / 2 + nx * swell, ky = 2 * my - (c.y + qy) / 2 + ny * swell;
        let ax = c.x, ay = c.y;
        for (let i = 1; i <= segments; i++) {
          const t = i / segments, u = 1 - t;
          const bx = u * u * c.x + 2 * u * t * kx + t * t * qx, by = u * u * c.y + 2 * u * t * ky + t * t * qy;
          sink.bounded(ax, ay, bx, by, thin * (1 - 0.5 * t), 0.32 * (1 - curve * 0.2), clamp(curve * 0.4 + t * 0.2, 0, 1));
          ax = bx; ay = by;
        }
      }
      history.push(c.x, c.y);
      hasPrevious = true; previousX = c.x; previousY = c.y;
    },
  };
}

function particleSpray(env: ProceduralEnv): ProceduralKernel {
  const count = Math.round(clamp(env.t.particleCount / 64, 1, 64)), seed = env.seed;
  const reach = env.size * clamp(env.t.patternScale, 0.1, 4) * 0.6;
  const gaussian = unit(env.t.diffusion), spreadSize = unit(env.t.granulation), spin = unit(env.t.patternJitter);
  return {
    maxPrimitivesPerDab: count, retainedStateBytes: 16, reset: () => undefined,
    deposit(c, sink) {
      const pressure = unit(c.pressure), radius = reach * (0.45 + 0.55 * pressure);
      const base = Math.max(0.2, env.size * 0.035 * (0.6 + 0.8 * pressure));
      for (let i = 0; i < count; i++) {
        const salt = i * 6;
        // 균일 원판(√u)과 가우시안(레일리 반경 σ√(−2 ln u), σ≈0.42R, 1.6R 에서 자름)을 분포 비율로 섞는다.
        const uniform = radius * Math.sqrt(hash01(c.index, salt, seed ^ 0x5b01));
        const normal = Math.min(radius * 1.6, radius * 0.42 * Math.sqrt(-2 * Math.log(1 - hash01(c.index, salt + 1, seed ^ 0x5b02))));
        const distance = uniform + (normal - uniform) * gaussian, theta = TAU * hash01(c.index, salt + 2, seed ^ 0x5b03);
        const grain = base * (1 + spreadSize * (hash01(c.index, salt + 3, seed ^ 0x5b04) * 2.2 - 0.8));
        const angle = c.direction + (hash01(c.index, salt + 4, seed ^ 0x5b05) - 0.5) * TAU * spin;
        sink.shape(c.x + Math.cos(theta) * distance, c.y + Math.sin(theta) * distance, grain, grain * 0.55, angle,
          0.75, hash01(c.index, salt + 5, seed ^ 0x5b06), "ellipse");
      }
    },
  };
}

const FACTORIES: Readonly<Record<ConceptModel, (env: ProceduralEnv) => ProceduralKernel>> = Object.freeze({
  hatching, "cell-grid": cellGrid, "curve-trail": curveTrail, "particle-spray": particleSpray,
});

export function createConceptKernel(model: ConceptModel, env: ProceduralEnv): ProceduralKernel {
  return FACTORIES[model](env);
}
