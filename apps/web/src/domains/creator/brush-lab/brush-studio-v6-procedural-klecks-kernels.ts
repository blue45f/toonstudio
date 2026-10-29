/**
 * Klecks sketchy·chemy 브러시 이식 커널.
 *
 * 출처: Klecks — https://github.com/bitbof/klecks
 *   src/app/script/klecks/brushes/sketchy-brush.ts (SketchyBrush.goLine)
 *   src/app/script/klecks/brushes/chemy-brush.ts (ChemyBrush.goLine·drawShape)
 * 라이선스: MIT — Copyright (c) 2026 bitbof (bitbof.com). 허가 고지 원문은 third_party/klecks/LICENSE 에 있다.
 *
 * 이식한 것
 * - sketchy: 정수 절삭 좌표, 직전 점→현재 점 본선, "거리² < 4000·scale² 이고 rand > 거리²/(2000·scale²)"인 지난 점과의
 *   연결, 양 끝 30% 줄임, 기본 불투명도 0.2.
 * - chemy: 제스처 첫 점을 기준으로 경로 전체를 닫힌 다각형으로 채우는 fill, 경로 윤곽 stroke, 좌우(X)·상하(Y) 대칭,
 *   distort(±distort·40px 흔들림).
 *
 * 이 엔진 계약 때문에 달라진 것(정직한 차이)
 * - 난수: Klecks 의 sin·cos 순차 난수와 Math.random 대신 (덥 번호, 점 번호, 시드) 정수 해시를 쓴다. 분포는 같지만 값은 다르다.
 * - 기억: Klecks sketchy 는 획의 모든 점을 보관하지만 여기서는 최근 64점 링 버퍼만 본다.
 * - 합성: Klecks 는 한 goLine 의 모든 선을 경로 하나로 한 번 stroke() 하지만 여기서는 선마다 프리미티브라, 같은 덥 안에서
 *   겹친 부분이 조금 더 진해질 수 있다.
 * - 블렌딩: Klecks 는 펜 아래 캔버스 색을 읽어 섞는다(getImageData). 이 엔진은 캔버스를 읽지 않으므로 보조색(기본: 종이색)과
 *   섞는 것으로 대신한다.
 * - 크기: Klecks 의 Size(선폭)·Scale(연결 반경)을 제품의 단일 크기 슬라이더에 맞춰, 크기 20 을 Klecks scale 1 로 본다.
 * - chemy 채움: Canvas fill() 대신 시작점·직전 점·현재 점 부채꼴 삼각형을 촘촘한 캡슐로 근사한다. 그래서 nonzero 채움 규칙의
 *   구멍(경로가 거꾸로 돌아 상쇄되는 영역)도 채워지고, 반투명일 때 이음매가 조금 진해질 수 있다.
 * - chemy 대칭축: 캔버스 크기를 모르므로 캔버스 중심 대신 제스처 시작점을 축으로 쓴다(제품 전역 대칭은 별도 기능).
 * - chemy gradient: 최종 y 범위를 알아야 하는 기능이라 스트리밍 커널에서는 이식하지 않았다.
 */
import { clamp, hash01, ProceduralPointHistory, unit, type ProceduralEnv, type ProceduralKernel, type ProceduralSink } from "./brush-studio-v6-procedural-kit";
import type { BrushStudioV6ProceduralModel } from "./brush-studio-v6-procedural-family-catalog";
import type { BrushTopologyPrimitive } from "./brush-studio-v6-topology-engine";

export type KlecksModel = Extract<BrushStudioV6ProceduralModel, `klecks-${string}`>;

/** 크기 20 = Klecks scale 1. */
const KLECKS_REFERENCE_SIZE = 20;
const HISTORY = 64;

function sketchy(env: ProceduralEnv): ProceduralKernel {
  const points = new ProceduralPointHistory(HISTORY);
  const scale = clamp(env.t.patternScale, 0.1, 4) * env.size / KLECKS_REFERENCE_SIZE;
  const scale2 = scale * scale, blending = unit(env.t.pickup), seed = env.seed;
  const lineHalf = clamp(env.size * 0.02, 0.25, 3);
  let drawing = false, lastX = 0, lastY = 0;
  const reset = (): void => { points.reset(); drawing = false; lastX = 0; lastY = 0; };
  return {
    // 본선 1 + 링 버퍼의 다른 점 63개 = 64.
    maxPrimitivesPerDab: HISTORY, retainedStateBytes: points.bytes + 32, reset,
    deposit(c, sink) {
      // startLine: 첫 점은 기록하지 않고 마지막 위치만 정한다(원본과 같다).
      if (!drawing) { drawing = true; lastX = c.x; lastY = c.y; return; }
      const x = Math.trunc(c.x), y = Math.trunc(c.y);
      points.push(x, y);
      sink.line(lastX, lastY, x, y, lineHalf, 0.2, blending);
      // 원본 순서(오래된 점 → 현재 점)를 따른다. 자기 자신(거리 0)은 원본에서도 보이지 않는 0 길이 경로라 건너뛴다.
      for (let age = points.length - 1; age >= 0 && !sink.full(); age--) {
        const slot = points.slot(age);
        const b = points.x[slot] - x, a = points.y[slot] - y, g = b * b + a * a;
        if (g < 1e-9) continue;
        if (g < 4000 * scale2 && hash01(c.index, age, seed ^ 0x6b1e) > g / 2000 / scale2) {
          sink.bounded(x + b * 0.3, y + a * 0.3, points.x[slot] - b * 0.3, points.y[slot] - a * 0.3, lineHalf, 0.2, blending);
        }
      }
      lastX = x; lastY = y;
    },
  };
}

type Mirror = "x" | "y" | "xy";
/** 대칭 사본을 시작점 축으로 같이 낸다. 캡슐·타원은 축 대칭이라 중심과 각도만 반사하면 정확하다. */
function mirroredSink(sink: ProceduralSink, mirrors: readonly Mirror[], ax: number, ay: number) {
  const copy = (mirror: Mirror, x: number, y: number, angle: number): readonly [number, number, number] =>
    mirror === "x" ? [2 * ax - x, y, Math.PI - angle] : mirror === "y" ? [x, 2 * ay - y, -angle] : [2 * ax - x, 2 * ay - y, angle];
  return (x: number, y: number, radiusX: number, radiusY: number, angle: number, opacity: number, mix: number,
    shape: BrushTopologyPrimitive["shape"]): void => {
    sink.shape(x, y, radiusX, radiusY, angle, opacity, mix, shape);
    for (const mirror of mirrors) {
      const [mx, my, mAngle] = copy(mirror, x, y, angle);
      sink.shape(mx, my, radiusX, radiusY, mAngle, opacity, mix, shape);
    }
  };
}

function chemy(env: ProceduralEnv): ProceduralKernel {
  const symmetry = unit(env.t.patternDensity);
  const mirrors: readonly Mirror[] = symmetry < 1 / 3 ? [] : symmetry < 2 / 3 ? ["x"] : ["x", "y", "xy"];
  // 덥마다 사본별로 윤곽 1개 + 채움 조각 K개(K ≤ 8). 대칭 사본 4개여도 4 × 9 = 36 으로 계열 상한 64 안이다.
  const copies = mirrors.length + 1, maxPieces = 8, cap = copies * (maxPieces + 1);
  const distort = unit(env.t.patternJitter) * 40 * env.size / KLECKS_REFERENCE_SIZE;
  const fill = unit(env.t.reservoir), outline = unit(env.t.relief) * env.size * 0.08, seed = env.seed;
  let started = false, anchorX = 0, anchorY = 0, previousX = 0, previousY = 0;
  const reset = (): void => { started = false; anchorX = 0; anchorY = 0; previousX = 0; previousY = 0; };
  return {
    maxPrimitivesPerDab: cap, retainedStateBytes: 48, reset,
    deposit(c, sink) {
      // goLine 의 distort: 원본은 Math.random()-0.5 에 distort·80 을 곱한다(±distort·40px).
      const x = c.x + (hash01(c.index, 1, seed ^ 0x3c4e) - 0.5) * 2 * distort;
      const y = c.y + (hash01(c.index, 2, seed ^ 0x3c4e) - 0.5) * 2 * distort;
      const restart = started && Math.hypot(x - previousX, y - previousY) > env.size * 6 + distort * 2;
      if (!started || restart) {
        started = true; anchorX = x; anchorY = y; previousX = x; previousY = y;
        // 원본은 점 하나로는 그리지 않지만, 탭·재시작 위치가 보이도록 작은 시작점을 하나 둔다.
        mirroredSink(sink, mirrors, anchorX, anchorY)(x, y, Math.max(0.5, env.size * 0.04), Math.max(0.5, env.size * 0.04),
          0, Math.max(fill, 0.3), 0, "ellipse");
        return;
      }
      const shape = mirroredSink(sink, mirrors, anchorX, anchorY);
      if (fill > 0) fan(shape, anchorX, anchorY, previousX, previousY, x, y, env.size, maxPieces, fill);
      if (outline > 0) {
        const length = Math.hypot(x - previousX, y - previousY), half = Math.max(0.2, outline);
        shape((x + previousX) / 2, (y + previousY) / 2, length / 2 + half, half,
          length > 1e-9 ? Math.atan2(y - previousY, x - previousX) : c.direction, 1, 1, "capsule");
      }
      previousX = x; previousY = y;
    },
  };
}

/**
 * 부채꼴 삼각형(시작점 A, 직전 점 P0, 현재 점 P1)을 A→중점 M 축을 따라 가늘어지는 캡슐 K개로 근사한다.
 * 축에 수직인 삼각형 폭은 t·|P1−P0|·|sin φ| 이므로 각 조각의 반폭을 그 값의 절반(+작은 겹침)으로 둔다.
 */
function fan(
  shape: ReturnType<typeof mirroredSink>, ax: number, ay: number, x0: number, y0: number, x1: number, y1: number,
  size: number, maxPieces: number, opacity: number,
): void {
  const mx = (x0 + x1) / 2 - ax, my = (y0 + y1) / 2 - ay, length = Math.hypot(mx, my);
  if (length < 1e-6) return;
  const ux = mx / length, uy = my / length, ex = x1 - x0, ey = y1 - y0;
  const across = Math.abs(ex * uy - ey * ux);
  // 부채꼴은 덥 간격만큼만 넓은 가는 조각이라 축을 따라 폭 변화가 작다. 그래서 조각을 길게(크기 1.5배 이상) 잡는다.
  const pieces = Math.round(clamp(Math.ceil(length / Math.max(size * 1.5, 12)), 1, maxPieces));
  const angle = Math.atan2(uy, ux), piece = length / pieces;
  for (let k = 0; k < pieces; k++) {
    const t = (k + 0.5) / pieces, half = Math.max(0.15, t * across * 0.52 + 0.18);
    shape(ax + mx * t, ay + my * t, piece / 2 + half * 0.35, half, angle, opacity, 0, "capsule");
  }
}

export function isKlecksModel(model: BrushStudioV6ProceduralModel): model is KlecksModel {
  return model.startsWith("klecks-");
}

export function createKlecksKernel(model: KlecksModel, env: ProceduralEnv): ProceduralKernel {
  return model === "klecks-sketchy" ? sketchy(env) : chemy(env);
}
