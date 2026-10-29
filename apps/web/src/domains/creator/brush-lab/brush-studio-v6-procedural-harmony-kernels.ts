import {
  clamp, followAngle, hash01, ProceduralMomentum, ProceduralPointHistory, TAU, unit,
  type ProceduralEnv, type ProceduralKernel, type ProceduralSink,
} from "./brush-studio-v6-procedural-kit";
import type { BrushStudioV6ProceduralModel } from "./brush-studio-v6-procedural-family-catalog";
import type { BrushTopologyContact } from "./brush-studio-v6-topology-engine";

/**
 * Harmony 계열 "개념" 재구현 커널(10종).
 *
 * mrdoob/harmony 는 GPL 저장소라 코드를 열람·복제하지 않았다(ADR-0026 §D). 아래 구현은 생성 드로잉에서 널리 알려진
 * 개념 설명 — "지난 획 점 가운데 가까운 점과 옅은 선으로 잇는다", "그 선을 지난 점 너머로 뻗으면 털이 된다",
 * "펜을 스프링으로 뒤따르는 여러 가닥이 리본이 된다" — 만 보고 이 저장소의 거리 시계·해시 난수·고정 상태 계약에
 * 맞춰 새로 설계했다. 반경·확률·불투명도 같은 수치는 모두 이 파일에서 정한 값이다.
 *
 * 원본과 다른 점(정직한 차이):
 * - 원본류 도구는 마우스 이벤트마다 점을 쌓지만 여기서는 재표본 덥(거리 간격)마다 쌓으므로 입력 빈도와 무관하다.
 * - 지난 점은 최근 64점 링 버퍼에만 남는다(무제한 기억이 아님). 다른 획과는 연결하지 않는다(획 단위 상태).
 * - "속도"는 이벤트 시간을 쓰지 않는 결정성 계약 때문에 거리 기준 운동량(직진성)과 필압으로 근사한다.
 */
export type HarmonyModel = Extract<BrushStudioV6ProceduralModel, `harmony-${string}`>;

const HISTORY = 64;
/** 지난 점 연결 반경은 크기의 8배를 넘지 않는다(순간이동·극단 설정에서도 선 길이가 묶인다). */
const MAX_REACH_RATIO = 8;

interface LinkFrame {
  readonly c: BrushTopologyContact;
  readonly sink: ProceduralSink;
  readonly reach: number;
  readonly thin: number;
  readonly pressure: number;
}
interface LinkSpec {
  readonly cap: number;
  readonly reachRatio: number;
  readonly mainOpacity: number;
  /** 연결과 별개로 덥마다 한 번 실행한다(예: 털의 보호털). */
  readonly before?: (frame: LinkFrame) => void;
  /** 반경 안의 지난 점 하나(age 0 = 직전 점). dx·dy 는 현재 점에서 지난 점으로 가는 벡터다. */
  readonly visit: (frame: LinkFrame, ex: number, ey: number, dx: number, dy: number, distance: number, age: number) => void;
}

/** 지난 점 연결 계열의 공통 뼈대: 직전 덥까지의 본선 → 반경 안 지난 점(최근부터) 방문 → 현재 점 기록. */
function createLinkKernel(env: ProceduralEnv, spec: LinkSpec): ProceduralKernel {
  const history = new ProceduralPointHistory(HISTORY);
  const reachBase = env.size * Math.min(MAX_REACH_RATIO, clamp(env.t.patternScale, 0.1, 4) * spec.reachRatio);
  let hasPrevious = false, previousX = 0, previousY = 0;
  const reset = (): void => { history.reset(); hasPrevious = false; previousX = 0; previousY = 0; };
  return {
    maxPrimitivesPerDab: spec.cap, retainedStateBytes: history.bytes + 48, reset,
    deposit(c, sink) {
      const pressure = unit(c.pressure);
      const frame: LinkFrame = { c, sink, pressure, reach: reachBase * (0.65 + 0.35 * pressure),
        thin: clamp(env.size * 0.014 * (0.45 + 0.55 * pressure), 0.16, 1.8) };
      if (hasPrevious && spec.mainOpacity > 0) sink.line(previousX, previousY, c.x, c.y, frame.thin * 1.1, spec.mainOpacity, 0);
      spec.before?.(frame);
      const reach2 = frame.reach * frame.reach;
      for (let age = 0; age < history.length && !sink.full(); age++) {
        const slot = history.slot(age);
        const ex = history.x[slot], ey = history.y[slot];
        const dx = ex - c.x, dy = ey - c.y, distance2 = dx * dx + dy * dy;
        if (distance2 >= reach2 || distance2 < 1e-6) continue;
        spec.visit(frame, ex, ey, dx, dy, Math.sqrt(distance2), age);
      }
      history.push(c.x, c.y);
      hasPrevious = true; previousX = c.x; previousY = c.y;
    },
  };
}

function sketchy(env: ProceduralEnv): ProceduralKernel {
  const density = unit(env.t.patternDensity), jitter = unit(env.t.patternJitter), seed = env.seed;
  return createLinkKernel(env, { cap: 48, reachRatio: 3, mainOpacity: 0.55,
    visit({ c, sink, reach, thin }, ex, ey, dx, dy, distance, age) {
      const q = distance / reach;
      // 가까울수록 자주 잇는다. 같은 (덥, 지난 점) 쌍은 한 번만 평가되므로 해시 키가 겹치지 않는다.
      if (hash01(c.index, age, seed ^ 0x51c3) >= density * (1 - q * q)) return;
      const trim = 0.12 + 0.24 * jitter * hash01(age, c.index, seed ^ 0x2f17);
      sink.bounded(c.x + dx * trim, c.y + dy * trim, ex - dx * trim, ey - dy * trim, thin, 0.34, 0.4 * q);
    } });
}

function shaded(env: ProceduralEnv): ProceduralKernel {
  const strength = 0.18 + 0.82 * unit(env.t.patternDensity);
  return createLinkKernel(env, { cap: 48, reachRatio: 2.6, mainOpacity: 0.4,
    visit({ c, sink, reach, thin }, ex, ey, _dx, _dy, distance) {
      // 끝 줄임 없이 현재 점과 지난 점을 그대로 잇고, 거리에 따라 제곱으로 옅어진다(무작위 탈락 없음).
      const near = 1 - distance / reach, alpha = strength * near * near;
      if (alpha < 0.012) return;
      sink.bounded(c.x, c.y, ex, ey, thin * 0.9, alpha, 0.55 * (1 - near));
    } });
}

function chrome(env: ProceduralEnv): ProceduralKernel {
  const accent = unit(env.t.patternDensity), jitter = unit(env.t.patternJitter), seed = env.seed;
  return createLinkKernel(env, { cap: 61, reachRatio: 3, mainOpacity: 0.6,
    visit({ c, sink, reach, thin }, ex, ey, dx, dy, distance, age) {
      const q = distance / reach;
      if (hash01(c.index, age, seed ^ 0x7c41) >= 0.85 * (1 - q * q)) return;
      sink.bounded(c.x + dx * 0.2, c.y + dy * 0.2, ex - dx * 0.2, ey - dy * 0.2, thin, 0.36, 0);
      if (hash01(age, c.index, seed ^ 0x3a9d) >= accent) return;
      // 강조선: 같은 연결을 법선 방향으로 비켜 보조색으로 한 번 더 긋는다(금속 반사 같은 명암 대비).
      const side = hash01(c.index, age, seed ^ 0x01b2) < 0.5 ? -1 : 1;
      const shift = thin * (2 + 7 * jitter) * side, nx = -dy / distance * shift, ny = dx / distance * shift;
      sink.bounded(c.x + dx * 0.32 + nx, c.y + dy * 0.32 + ny, ex - dx * 0.32 + nx, ey - dy * 0.32 + ny, thin * 0.85, 0.62, 1);
    } });
}

function fur(env: ProceduralEnv): ProceduralKernel {
  const density = unit(env.t.patternDensity), jitter = unit(env.t.patternJitter), seed = env.seed;
  const guardLength = env.size * Math.sqrt(clamp(env.t.patternScale, 0.1, 4));
  return createLinkKernel(env, { cap: 41, reachRatio: 2.2, mainOpacity: 0,
    before({ c, sink, thin, pressure }) {
      // 보호털: 곧은 획에서도 털이 보이도록 획 방향의 수직으로 짧은 털 하나를 세운다. 방향 없는 첫 접점은 수직을 정할 수
      // 없으므로 건너뛴다(그 접점의 방향 0 은 자리 표시값이다).
      if (!c.directional) return;
      const side = hash01(c.index, 7, seed ^ 0x6f0d) < 0.5 ? -1 : 1;
      const angle = c.direction + side * Math.PI / 2 + (hash01(c.index, 11, seed ^ 0x6f0d) - 0.5) * jitter * 1.2;
      const length = guardLength * (0.25 + 0.5 * hash01(c.index, 13, seed ^ 0x6f0d)) * (0.5 + 0.5 * pressure);
      sink.bounded(c.x, c.y, c.x + Math.cos(angle) * length, c.y + Math.sin(angle) * length,
        thin * 0.8, 0.5, 0.6 * hash01(c.index, 17, seed ^ 0x6f0d));
    },
    visit({ c, sink, reach, thin }, ex, ey, dx, dy, distance, age) {
      if (hash01(c.index, age, seed ^ 0x4e21) >= density * (1 - 0.6 * distance / reach)) return;
      // 지난 점을 지나 바깥쪽(현재 점의 반대편)으로 털을 뻗는다. 결 흐트러짐만큼 방향을 비튼다.
      const turn = (hash01(age, c.index, seed ^ 0x4e22) - 0.5) * jitter * 1.4;
      const reachOut = distance * (0.3 + 0.45 * hash01(c.index, age + 977, seed ^ 0x4e23));
      const ux = dx / distance, uy = dy / distance, cos = Math.cos(turn), sin = Math.sin(turn);
      sink.bounded(ex + dx * 0.06, ey + dy * 0.06, ex + (ux * cos - uy * sin) * reachOut, ey + (ux * sin + uy * cos) * reachOut,
        thin * 0.85, 0.42, 0.7 * hash01(age, c.index, seed ^ 0x4e24));
    } });
}

function longfur(env: ProceduralEnv): ProceduralKernel {
  const length = unit(env.t.reservoir), jitter = unit(env.t.patternJitter), seed = env.seed;
  const maxLength = env.size * 6;
  return createLinkKernel(env, { cap: 41, reachRatio: 2.4, mainOpacity: 0.22,
    visit({ c, sink, reach, thin }, ex, ey, dx, dy, distance, age) {
      if (hash01(c.index, age, seed ^ 0x9a11) >= 0.5 * (1 - distance / reach)) return;
      // 현재 점 쪽에서 무작위로 출발해 지난 점을 지나 길게(길이·각도 모두 해시) 뻗는다.
      const start = 0.05 + 0.3 * hash01(age, c.index, seed ^ 0x9a12);
      const extension = distance * (0.5 + (0.4 + 1.2 * length) * hash01(c.index, age + 613, seed ^ 0x9a13));
      const turn = (hash01(age + 613, c.index, seed ^ 0x9a14) - 0.5) * jitter * 0.9;
      const ux = dx / distance, uy = dy / distance, cos = Math.cos(turn), sin = Math.sin(turn);
      const ax = c.x + dx * start, ay = c.y + dy * start;
      let bx = ex + (ux * cos - uy * sin) * extension, by = ey + (ux * sin + uy * cos) * extension;
      const span = Math.hypot(bx - ax, by - ay);
      if (span > maxLength) { bx = ax + (bx - ax) * maxLength / span; by = ay + (by - ay) * maxLength / span; }
      sink.bounded(ax, ay, bx, by, thin * 0.75, 0.3, 0.25 + 0.5 * hash01(age, c.index, seed ^ 0x9a15));
    } });
}

function web(env: ProceduralEnv): ProceduralKernel {
  const alpha = 0.08 + 0.5 * unit(env.t.patternDensity);
  return createLinkKernel(env, { cap: 57, reachRatio: 3.6, mainOpacity: 0.5,
    visit({ c, sink, thin }, ex, ey, _dx, _dy, _distance, age) {
      // 반경 안이면 탈락 없이 모두 잇는다. 오래된 점일수록 보조색 쪽으로 물든다.
      sink.bounded(c.x, c.y, ex, ey, thin * 0.8, alpha, 0.65 * age / HISTORY);
    } });
}

/**
 * 사각형·원이 공유하는 방출 주기·운동량·방향 프레임. 순간이동 간격이면 운동량을 비우고 즉시 방출한다.
 * 방향 없는 접점(획의 첫 접점, 방향 0 은 자리 표시값)은 프레임을 정하지 않는다. 프레임이 아직 없으면 도형을 미루고
 * 첫 방향 접점이 그 획 방향으로 프레임을 잡아 바로 방출한다(움직임 없는 탭은 도형을 남기지 않는다).
 */
function createCadence(env: ProceduralEnv, every: number) {
  const momentum = new ProceduralMomentum();
  let lastEmit = -Infinity, frame = 0, framed = false, hasPrevious = false, previousX = 0, previousY = 0;
  return {
    reset(): void { momentum.reset(); lastEmit = -Infinity; framed = false; hasPrevious = false; },
    /** 이번 덥에 도형을 낼지와 운동량(0..1), 프레임 각도를 돌려준다. */
    advance(c: BrushTopologyContact): { readonly emit: boolean; readonly speed: number; readonly angle: number } {
      if (hasPrevious && Math.hypot(c.x - previousX, c.y - previousY) > env.size * 4) { momentum.reset(); framed = false; lastEmit = -Infinity; }
      hasPrevious = true; previousX = c.x; previousY = c.y;
      const speed = momentum.update(c.x, c.y, env.step, 0.18);
      if (c.directional) {
        frame = framed ? followAngle(frame, c.direction, 0.35) : c.direction;
        framed = true;
      } else if (!framed) {
        return { emit: false, speed, angle: frame };
      }
      const emit = c.index - lastEmit >= every;
      if (emit) lastEmit = c.index;
      return { emit, speed, angle: frame };
    },
  };
}

function squares(env: ProceduralEnv): ProceduralKernel {
  const every = 1 + Math.round((1 - unit(env.t.patternDensity)) * 3), jitter = unit(env.t.patternJitter);
  const scale = clamp(env.t.patternScale, 0.1, 4), cadence = createCadence(env, every);
  return {
    maxPrimitivesPerDab: 4, retainedStateBytes: 96, reset: cadence.reset,
    deposit(c, sink) {
      const { emit, speed, angle } = cadence.advance(c);
      if (!emit) return;
      const pressure = unit(c.pressure), thin = clamp(env.size * 0.016 * (0.5 + 0.5 * pressure), 0.18, 2);
      // 반변 길이: 거리 운동량(곧게 오래 그을수록 큼)과 필압의 곱. 회전은 획 방향 + 해시 흔들림.
      const half = env.size * scale * (0.25 + 0.75 * speed) * (0.45 + 0.55 * pressure) * 0.6;
      const turn = angle + (hash01(c.index, 3, env.seed ^ 0x5a0e) - 0.5) * jitter * Math.PI / 3;
      const ux = Math.cos(turn) * half, uy = Math.sin(turn) * half;
      const corners = [[ux - uy, uy + ux], [-ux - uy, -uy + ux], [-ux + uy, -uy - ux], [ux + uy, uy - ux]] as const;
      for (let i = 0; i < 4; i++) {
        const a = corners[i], b = corners[(i + 1) % 4];
        sink.bounded(c.x + a[0], c.y + a[1], c.x + b[0], c.y + b[1], thin, 0.55, 0.85 * speed);
      }
    },
  };
}

function circles(env: ProceduralEnv): ProceduralKernel {
  const rings = 1 + Math.round(unit(env.t.patternDensity) * 3), jitter = unit(env.t.patternJitter);
  const scale = clamp(env.t.patternScale, 0.1, 4), cadence = createCadence(env, 2), seed = env.seed;
  return {
    maxPrimitivesPerDab: 48, retainedStateBytes: 96, reset: cadence.reset,
    deposit(c, sink) {
      const { emit, speed, angle } = cadence.advance(c);
      if (!emit) return;
      const pressure = unit(c.pressure), thin = clamp(env.size * 0.014 * (0.5 + 0.5 * pressure), 0.16, 1.8);
      const radius = env.size * scale * (0.2 + 0.8 * speed) * (0.45 + 0.55 * pressure) * 0.75;
      const ux = Math.cos(angle), uy = Math.sin(angle);
      // 중심은 법선·진행 방향으로 어긋나고, 원마다 조금씩 더 비켜 동심원과 어긋난 원이 섞인다.
      const offsetN = (hash01(c.index, 1, seed ^ 0x0c1c) - 0.5) * jitter * radius;
      const offsetT = (hash01(c.index, 2, seed ^ 0x0c1c) - 0.5) * jitter * radius * 0.5;
      const centerX = c.x - uy * offsetN + ux * offsetT, centerY = c.y + ux * offsetN + uy * offsetT;
      const chord = Math.max(1.5, env.size * 0.3);
      for (let ring = 0; ring < rings; ring++) {
        const r = radius * (ring + 1) / rings;
        const shift = (hash01(c.index, 10 + ring, seed ^ 0x0c1d) - 0.5) * jitter * r * 0.3;
        const cx = centerX + shift, cy = centerY - shift * 0.5;
        const segments = Math.round(clamp(TAU * r / chord, 6, 12));
        const phase = hash01(c.index, 20 + ring, seed ^ 0x0c1e) * TAU;
        const mix = rings > 1 ? 0.85 * ring / (rings - 1) : 0.3 * speed;
        for (let i = 0; i < segments; i++) {
          const a0 = phase + TAU * i / segments, a1 = phase + TAU * (i + 1) / segments;
          sink.bounded(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, thin, 0.5, mix);
        }
      }
    },
  };
}

function ribbon(env: ProceduralEnv): ProceduralKernel {
  const count = Math.round(clamp(env.t.bristleStrands / 6, 4, 20));
  const fx = new Float64Array(count), fy = new Float64Array(count), vx = new Float64Array(count), vy = new Float64Array(count);
  const width = env.size * clamp(env.t.patternScale, 0.1, 4) * 0.9, seed = env.seed;
  const dt = clamp(env.step / env.size, 0.002, 0.5), damping = 1 + 16 * unit(env.t.viscosity);
  const stiffness = Array.from({ length: count }, (_, i) =>
    (10 + 90 * unit(env.t.friction)) * (0.45 + 0.55 * i / (count - 1) + 0.5 * hash01(i, 5, seed ^ 0x71b0)));
  // 반암시 오일러가 안정하도록(ω·h < 0.5) 부분 단계 수를 획 시작 때 한 번 정한다.
  const substeps = Math.round(clamp(Math.ceil(dt * Math.sqrt(Math.max(...stiffness)) / 0.5), 1, 8));
  let initialized = false, dabs = 0, hasStart = false, startX = 0, startY = 0;
  const reset = (): void => {
    initialized = false; dabs = 0; hasStart = false; startX = 0; startY = 0;
    fx.fill(0); fy.fill(0); vx.fill(0); vy.fill(0);
  };
  return {
    maxPrimitivesPerDab: count * 2 - 1, retainedStateBytes: fx.byteLength * 4 + 56, reset,
    deposit(c, sink) {
      // 방향 없는 접점(획의 첫 접점)으로는 단면 방향을 정할 수 없다. 위치만 기억했다가 첫 방향 접점에서 그 자리에 펼친다.
      if (!c.directional) {
        if (!initialized) { hasStart = true; startX = c.x; startY = c.y; }
        return;
      }
      const pressure = unit(c.pressure), thin = clamp(env.size * 0.012 * (0.5 + 0.5 * pressure), 0.16, 1.6);
      const nx = -Math.sin(c.direction), ny = Math.cos(c.direction), spread = width * (0.35 + 0.65 * pressure);
      const targetX = (i: number): number => c.x + nx * (i / (count - 1) - 0.5) * spread;
      const targetY = (i: number): number => c.y + ny * (i / (count - 1) - 0.5) * spread;
      if (!initialized || Math.hypot(fx[0] - targetX(0), fy[0] - targetY(0)) > env.size * 4) {
        // 획 시작이면 기억한 첫 접점 자리에 펼치고(가까울 때만) 이번 접점 쪽으로 이어서 움직인다. 재시작은 이 자리에서 펼친다.
        const fromStart = !initialized && hasStart && Math.hypot(startX - c.x, startY - c.y) <= env.size * 4;
        const shiftX = fromStart ? startX - c.x : 0, shiftY = fromStart ? startY - c.y : 0;
        for (let i = 0; i < count; i++) { fx[i] = targetX(i) + shiftX; fy[i] = targetY(i) + shiftY; vx[i] = 0; vy[i] = 0; }
        initialized = true; dabs = 0; hasStart = false;
        // 시작·재시작 단면: 리본 폭 전체를 획 방향의 수직으로 가로지르는 선 하나.
        sink.line(fx[0], fy[0], fx[count - 1], fy[count - 1], thin, 0.5, 0.5);
        if (!fromStart) return;
      }
      const h = dt / substeps, decay = Math.exp(-damping * h), limit = env.size * 8;
      for (let i = 0; i < count; i++) {
        const ax = fx[i], ay = fy[i], tx = targetX(i), ty = targetY(i), k = stiffness[i];
        for (let sub = 0; sub < substeps; sub++) {
          vx[i] = clamp((vx[i] + (tx - fx[i]) * k * h) * decay, -limit, limit);
          vy[i] = clamp((vy[i] + (ty - fy[i]) * k * h) * decay, -limit, limit);
          fx[i] += vx[i] * h; fy[i] += vy[i] * h;
        }
        if (Math.hypot(fx[i] - tx, fy[i] - ty) > env.size * 4) { fx[i] = tx; fy[i] = ty; vx[i] = 0; vy[i] = 0; }
        sink.bounded(ax, ay, fx[i], fy[i], thin, 0.7, i / (count - 1));
      }
      dabs++;
      // 세 덥마다 이웃 가닥을 가로로 이어 리본 면(가닥 사이 막)을 만든다.
      if (dabs % 3 === 0) for (let i = 0; i < count - 1; i++) sink.bounded(fx[i], fy[i], fx[i + 1], fy[i + 1], thin * 0.7, 0.32, 0.5);
    },
  };
}

function grid(env: ProceduralEnv): ProceduralKernel {
  const cell = clamp(env.size * clamp(env.t.patternScale, 0.1, 4) * 1.2, 2, env.size * 8);
  const reach = cell * (0.55 + 0.6 * unit(env.t.patternJitter));
  // 덥 간격에 비례한 농도: 칸 하나를 지나는 동안 쌓이는 양이 간격 설정과 크게 무관하다.
  const strength = (0.2 + 0.8 * unit(env.t.patternDensity)) * clamp(2.4 * env.step / cell, 0.06, 1);
  return {
    maxPrimitivesPerDab: 8, retainedStateBytes: 16, reset: () => undefined,
    deposit(c, sink) {
      const thin = clamp(env.size * 0.014 * (0.5 + 0.5 * unit(c.pressure)), 0.16, 1.8);
      const column = Math.floor(c.x / cell), row = Math.floor(c.y / cell);
      const top = row * cell, left = column * cell;
      // 문서 원점에 고정된 격자선만 쓴다: 세로선은 x = k·cell, 가로선은 y = k·cell 위에 정확히 놓인다.
      for (let k = -1; k <= 2; k++) {
        const gx = (column + k) * cell, near = 1 - Math.abs(c.x - gx) / reach;
        if (near > 0) sink.bounded(gx, top, gx, top + cell, thin, strength * near * (0.5 + 0.5 * near), 0.15 * near);
        const gy = (row + k) * cell, nearY = 1 - Math.abs(c.y - gy) / reach;
        if (nearY > 0) sink.bounded(left, gy, left + cell, gy, thin, strength * nearY * (0.5 + 0.5 * nearY), 0.55 * nearY);
      }
    },
  };
}

const FACTORIES: Readonly<Record<HarmonyModel, (env: ProceduralEnv) => ProceduralKernel>> = Object.freeze({
  "harmony-sketchy": sketchy, "harmony-shaded": shaded, "harmony-chrome": chrome, "harmony-fur": fur,
  "harmony-longfur": longfur, "harmony-web": web, "harmony-squares": squares, "harmony-ribbon": ribbon,
  "harmony-circles": circles, "harmony-grid": grid,
});

export function isHarmonyModel(model: BrushStudioV6ProceduralModel): model is HarmonyModel {
  return model.startsWith("harmony-");
}

export function createHarmonyKernel(model: HarmonyModel, env: ProceduralEnv): ProceduralKernel {
  return FACTORIES[model](env);
}
